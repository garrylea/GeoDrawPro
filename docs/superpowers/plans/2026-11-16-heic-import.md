# HEIC 拖放导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** macOS 桌面版拖放或文件选择 `.heic/.heif` 时，经主进程 `sips` 转成 PNG 后插入白板，并在所有失败路径给出可见提示。

**Architecture:** 新增纯逻辑模块 `utils/heicImport.ts` 负责识别与 IPC 调用；主进程新增 `CONVERT_HEIC` handler 调用 `/usr/bin/sips`；`useProjectFiles` 把 HEIC 分支与普通图片分支汇合到同一个 `addImageShapeFromUrl`；`StatusToasts` 增加可变标题与错误 toast；`Editor` 只改分流条件和 `accept`。

**Tech Stack:** React 18 + TypeScript（strict）、Electron 31（nodeIntegration）、Vitest + Testing Library（jsdom）、macOS `sips`。

**Spec:** `docs/superpowers/specs/2026-11-16-heic-import-design.md`

## Global Constraints

- 不新增任何 npm 依赖。
- HEIC 转换仅支持 macOS 桌面版；浏览器 dev、Windows、Linux 必须给出明确文案，不允许静默。
- sips 固定调用：`/usr/bin/sips -s format png -Z 2048 --out <out.png> <in.heic>`，timeout 30s。
- 主进程只返回机器码（`UNSUPPORTED_PLATFORM` / `NOT_FOUND` / `CONVERT_FAILED`），所有用户可见文案集中在 `utils/heicImport.ts`。
- 失败时不得调用 `setShapes` 或 `saveHistory`，临时目录必须清理。
- 现有 PNG/JPEG/PDF/`.geo` 导入行为与文案保持不变。
- 所有新增代码必须通过 `npx tsc --noEmit`（`strict`、`noUnusedLocals`、`noUnusedParameters`）。
- 测试命令：`npx vitest run <file>`；完整回归：`npm test`。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `utils/heicImport.ts`（新建） | HEIC 识别、Electron 能力检测、IPC 调用、错误码→中文文案 |
| `utils/heicImport.test.ts`（新建） | 上述纯逻辑的单测 |
| `electron/main.js`（修改） | `CONVERT_HEIC` IPC handler、sips 调用、临时目录生命周期 |
| `hooks/useProjectFiles.ts`（修改） | `addImageShapeFromUrl` 抽取、HEIC 分支、加载态、错误态 |
| `hooks/useProjectFiles.test.tsx`（修改） | HEIC 成功/失败/加载态/解码失败用例 |
| `components/editor/StatusToasts.tsx`（修改） | `loadingState.title`、`errorMessage` 红色 toast |
| `components/editor/StatusToasts.test.tsx`（修改） | 新 prop 的渲染用例 |
| `components/Editor.tsx`（修改） | 分流条件、`accept`、传递 `errorMessage` |
| `components/Editor.test.tsx`（修改） | `accept` 断言、拖放 HEIC 的路由集成用例 |

---

## Task 1: HEIC 识别与 IPC 封装

**Files:**
- Create: `utils/heicImport.ts`
- Test: `utils/heicImport.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `class HeicImportError extends Error`
  - `isHeicFile(file: File): boolean`
  - `isImageFile(file: File): boolean`
  - `convertHeicToPngDataUrl(file: File): Promise<string>`（成功返回 `data:image/png;base64,...`）

- [ ] **Step 1: 写失败测试**

创建 `utils/heicImport.test.ts`：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isHeicFile, isImageFile, convertHeicToPngDataUrl, HeicImportError } from './heicImport';

const makeFile = (name: string, type = '') => new File(['x'], name, { type });

const fileWithPath = (filePath = '/tmp/photo.heic') => {
    const file = makeFile('photo.heic');
    (file as any).path = filePath;
    return file;
};

const stubElectron = (invoke: ReturnType<typeof vi.fn>) => {
    (window as any).require = vi.fn(() => ({ ipcRenderer: { invoke } }));
};

beforeEach(() => {
    delete (window as any).require;
});

afterEach(() => {
    delete (window as any).require;
    vi.restoreAllMocks();
});

describe('isHeicFile', () => {
    it('recognizes .heic and .heif extensions case-insensitively', () => {
        expect(isHeicFile(makeFile('photo.heic'))).toBe(true);
        expect(isHeicFile(makeFile('PHOTO.HEIF'))).toBe(true);
    });

    it('recognizes HEIC MIME types even with an unusual name', () => {
        expect(isHeicFile(makeFile('upload.bin', 'image/heic'))).toBe(true);
        expect(isHeicFile(makeFile('upload.bin', 'image/heif'))).toBe(true);
    });

    it('rejects non-HEIC files', () => {
        expect(isHeicFile(makeFile('photo.png', 'image/png'))).toBe(false);
        expect(isHeicFile(makeFile('project.geo'))).toBe(false);
    });
});

describe('isImageFile', () => {
    it('accepts HEIC files with an empty MIME type (Finder drag)', () => {
        expect(isImageFile(makeFile('photo.heic'))).toBe(true);
    });

    it('accepts ordinary images and rejects project files', () => {
        expect(isImageFile(makeFile('photo.png', 'image/png'))).toBe(true);
        expect(isImageFile(makeFile('project.geo'))).toBe(false);
    });
});

describe('convertHeicToPngDataUrl', () => {
    it('returns the data URL from the main process', async () => {
        const invoke = vi.fn().mockResolvedValue({ success: true, dataUrl: 'data:image/png;base64,AAA' });
        stubElectron(invoke);
        await expect(convertHeicToPngDataUrl(fileWithPath())).resolves.toBe('data:image/png;base64,AAA');
        expect(invoke).toHaveBeenCalledWith('CONVERT_HEIC', { filePath: '/tmp/photo.heic' });
    });

    it('rejects when not running inside Electron', async () => {
        await expect(convertHeicToPngDataUrl(makeFile('photo.heic'))).rejects.toThrow(
            'HEIC 图片仅支持在桌面版导入，请先转换为 PNG/JPEG',
        );
    });

    it('rejects when the file has no path', async () => {
        stubElectron(vi.fn());
        await expect(convertHeicToPngDataUrl(makeFile('photo.heic'))).rejects.toThrow(
            '无法读取文件路径，请改用“打开文件”按钮导入',
        );
    });

    it.each([
        ['UNSUPPORTED_PLATFORM', '当前平台暂不支持 HEIC 转换（仅 macOS）'],
        ['NOT_FOUND', '找不到 HEIC 文件，请重新拖入'],
        ['CONVERT_FAILED', 'HEIC 转换失败，文件可能已损坏'],
        ['SOMETHING_NEW', 'HEIC 转换失败，文件可能已损坏'],
    ])('maps %s to user-facing copy', async (code, message) => {
        stubElectron(vi.fn().mockResolvedValue({ success: false, code }));
        await expect(convertHeicToPngDataUrl(fileWithPath())).rejects.toThrow(message);
    });

    it('throws HeicImportError so callers can distinguish user-facing failures', async () => {
        stubElectron(vi.fn().mockResolvedValue({ success: false, code: 'CONVERT_FAILED' }));
        await expect(convertHeicToPngDataUrl(fileWithPath())).rejects.toBeInstanceOf(HeicImportError);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run utils/heicImport.test.ts`
Expected: FAIL — `Failed to resolve import "./heicImport"`。

- [ ] **Step 3: 写最小实现**

创建 `utils/heicImport.ts`：

```ts
export class HeicImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HeicImportError';
    }
}

const HEIC_EXTENSION = /\.(heic|heif)$/i;

export const isHeicFile = (file: File): boolean =>
    HEIC_EXTENSION.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

export const isImageFile = (file: File): boolean =>
    file.type.startsWith('image/') || isHeicFile(file);

const ERROR_MESSAGES: Record<string, string> = {
    UNSUPPORTED_PLATFORM: '当前平台暂不支持 HEIC 转换（仅 macOS）',
    NOT_FOUND: '找不到 HEIC 文件，请重新拖入',
    CONVERT_FAILED: 'HEIC 转换失败，文件可能已损坏',
};

const FALLBACK_ERROR = 'HEIC 转换失败，文件可能已损坏';

export const convertHeicToPngDataUrl = async (file: File): Promise<string> => {
    const electron = (window as any).require?.('electron');
    if (!electron) throw new HeicImportError('HEIC 图片仅支持在桌面版导入，请先转换为 PNG/JPEG');

    const filePath = (file as any).path;
    if (!filePath) throw new HeicImportError('无法读取文件路径，请改用“打开文件”按钮导入');

    const result = await electron.ipcRenderer.invoke('CONVERT_HEIC', { filePath });
    if (!result?.success) {
        throw new HeicImportError(ERROR_MESSAGES[result?.code] ?? FALLBACK_ERROR);
    }
    return result.dataUrl;
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run utils/heicImport.test.ts`
Expected: PASS，全部用例通过。

- [ ] **Step 5: 提交**

```bash
git add utils/heicImport.ts utils/heicImport.test.ts
git commit -m "feat: add HEIC detection and conversion bridge"
```

---

## Task 2: 主进程 sips 转换 handler

**Files:**
- Modify: `electron/main.js:1-4`（require 区）
- Modify: `electron/main.js:490`（文件末尾，新增 handler）

**Interfaces:**
- Consumes: IPC channel `'CONVERT_HEIC'`，入参 `{ filePath: string }`
- Produces: `{ success: true, dataUrl: string } | { success: false, code: 'UNSUPPORTED_PLATFORM' | 'NOT_FOUND' | 'CONVERT_FAILED' }`

- [ ] **Step 1: 补依赖 require**

在 `electron/main.js` 顶部 `const path = require('path');` 之后新增：

```js
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
```

- [ ] **Step 2: 新增 handler**

在文件末尾（`ipcMain.handle('open-dialog', ...)` 之后）追加：

```js
ipcMain.handle('CONVERT_HEIC', async (event, { filePath } = {}) => {
    if (process.platform !== 'darwin') {
        return { success: false, code: 'UNSUPPORTED_PLATFORM' };
    }
    if (typeof filePath !== 'string' || !/\.(heic|heif)$/i.test(filePath) || !fs.existsSync(filePath)) {
        return { success: false, code: 'NOT_FOUND' };
    }

    let tmpDir = null;
    try {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geodraw-heic-'));
        const outPath = path.join(tmpDir, 'converted.png');
        await execFileAsync(
            '/usr/bin/sips',
            ['-s', 'format', 'png', '-Z', '2048', '--out', outPath, filePath],
            { timeout: 30000 },
        );
        const buf = fs.readFileSync(outPath);
        return { success: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
    } catch (error) {
        console.error('HEIC conversion failed:', error);
        return { success: false, code: 'CONVERT_FAILED' };
    } finally {
        if (tmpDir) {
            try {
                await fs.promises.rm(tmpDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error('Failed to remove HEIC temp dir:', cleanupError);
            }
        }
    }
});
```

- [ ] **Step 3: 校验语法**

Run: `node --check electron/main.js`
Expected: 无输出，退出码 0。

- [ ] **Step 4: 用系统 HEIC 冒烟验证 sips 命令**

Run:

```bash
/usr/bin/sips -s format png -Z 2048 --out /tmp/heic-smoke.png "/System/Library/Desktop Pictures/iMac Blue.heic" \
  && /usr/bin/sips -g pixelWidth -g pixelHeight /tmp/heic-smoke.png
```

Expected: 输出 `pixelWidth: 2048` 或更小、`pixelHeight` 对应缩放值；`/tmp/heic-smoke.png` 存在。

- [ ] **Step 5: 提交**

```bash
git add electron/main.js
git commit -m "feat: convert HEIC to PNG via sips in main process"
```

---

## Task 3: useProjectFiles 的 HEIC 分支与错误反馈

**Files:**
- Modify: `hooks/useProjectFiles.ts:48-49`（state 区）
- Modify: `hooks/useProjectFiles.ts:66-83`（`processImageFile`）
- Modify: `hooks/useProjectFiles.ts:147`（返回值）
- Test: `hooks/useProjectFiles.test.tsx`

**Interfaces:**
- Consumes: `isHeicFile`、`convertHeicToPngDataUrl`、`HeicImportError`（Task 1）
- Produces:
  - `processImageFile(file: File, position?: Point): Promise<void>`
  - `loadingState: { active: boolean; message: string; title?: string }`
  - `importError: string | null`

- [ ] **Step 1: 写失败测试**

在 `hooks/useProjectFiles.test.tsx` 顶部 mock 区（`vi.mock('../utils/exportUtils', ...)` 之后）新增：

```ts
vi.mock('../utils/heicImport', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/heicImport')>();
    return { ...actual, convertHeicToPngDataUrl: vi.fn() };
});
```

在 import 区新增：

```ts
import { convertHeicToPngDataUrl, HeicImportError } from '../utils/heicImport';
```

在 `describe('useProjectFiles.processImageFile', ...)` 之后新增：

```ts
describe('useProjectFiles.processImageFile (HEIC)', () => {
    const heicFile = () => new File(['heic'], 'photo.heic', { type: '' });

    it('converts HEIC to PNG and inserts the image at the drop point', async () => {
        stubImage(400, 200);
        vi.mocked(convertHeicToPngDataUrl).mockResolvedValue('data:image/png;base64,AAA');
        const { hook, params } = setup({ canvasWidth: 1600, originY: 700 });

        await act(async () => {
            await hook.result.current.processImageFile(heicFile(), { x: 200, y: 300 });
        });

        expect(convertHeicToPngDataUrl).toHaveBeenCalledTimes(1);
        const next = appliedShapes(params.setShapes, []);
        expect(next).toHaveLength(1);
        expect(next[0].type).toBe(ShapeType.IMAGE);
        expect(next[0].imageUrl).toBe('data:image/png;base64,AAA');
        // 400x200 → 300x150, centered at (200, 300)
        expect(next[0].points).toEqual([{ x: 50, y: 225 }, { x: 350, y: 375 }]);
    });

    it('shows the loading overlay while converting and hides it afterwards', async () => {
        stubImage(100, 100);
        let resolveConvert!: (value: string) => void;
        vi.mocked(convertHeicToPngDataUrl).mockReturnValue(
            new Promise<string>((resolve) => { resolveConvert = resolve; }),
        );
        const { hook } = setup();

        let pending: Promise<void> | undefined;
        act(() => { pending = hook.result.current.processImageFile(heicFile()); });
        expect(hook.result.current.loadingState.active).toBe(true);
        expect(hook.result.current.loadingState.title).toBe('Importing Image');

        await act(async () => {
            resolveConvert('data:image/png;base64,BBB');
            await pending;
        });
        expect(hook.result.current.loadingState.active).toBe(false);
        expect(hook.result.current.loadingState.message).toBe('');
    });

    it('reports a conversion failure without touching shapes or history', async () => {
        vi.mocked(convertHeicToPngDataUrl).mockRejectedValue(
            new HeicImportError('当前平台暂不支持 HEIC 转换（仅 macOS）'),
        );
        const { hook, params } = setup();

        await act(async () => {
            await hook.result.current.processImageFile(heicFile());
        });

        expect(params.setShapes).not.toHaveBeenCalled();
        expect(params.saveHistory).not.toHaveBeenCalled();
        expect(hook.result.current.importError).toBe('当前平台暂不支持 HEIC 转换（仅 macOS）');
        expect(hook.result.current.loadingState.active).toBe(false);
    });

    it('reports a decode failure instead of failing silently', async () => {
        vi.stubGlobal('Image', class {
            width = 0; height = 0;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) { this.onerror?.(); }
        });
        const { hook, params } = setup();

        await act(async () => {
            await hook.result.current.processImageFile(new File(['x'], 'broken.png', { type: 'image/png' }));
        });

        await waitFor(() => expect(hook.result.current.importError).toBe('无法解码转换后的图片'));
        expect(params.setShapes).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run hooks/useProjectFiles.test.tsx`
Expected: FAIL — HEIC 用例拿不到 `importError`，且 `loadingState.title` 为 `undefined`。

- [ ] **Step 3: 新增错误态与稳定化 state 类型**

在 `hooks/useProjectFiles.ts` 的 `const [saveMessage, ...]` 之后新增：

```ts
const [importError, setImportError] = useState<string | null>(null);
const importErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const showImportError = useCallback((message: string) => {
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current);
    setImportError(message);
    importErrorTimerRef.current = setTimeout(() => setImportError(null), 4000);
}, []);

useEffect(() => () => {
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current);
}, []);
```

把 `loadingState` 的泛型改为：

```ts
useState<{ active: boolean; message: string; title?: string }>({ active: false, message: '' })
```

在 import 区新增：

```ts
import { isHeicFile, convertHeicToPngDataUrl, HeicImportError } from '../utils/heicImport';
```

- [ ] **Step 4: 抽取 addImageShapeFromUrl 并重写 processImageFile**

用下面代码替换现有 `hooks/useProjectFiles.ts` 中 `processImageFile` 的整个定义（原 66-83 行）：

```ts
const addImageShapeFromUrl = useCallback((url: string, position?: Point) => new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
        saveHistory();
        const id = generateId();
        const width = img.width; const height = img.height; const maxDim = 300; let finalW = width; let finalH = height;
        if (width > maxDim || height > maxDim) { const ratio = width / height; if (width > height) { finalW = maxDim; finalH = maxDim / ratio; } else { finalH = maxDim; finalW = maxDim * ratio; } }
        const centerX = position ? position.x : canvasWidth / 2; const centerY = position ? position.y : originY;
        const newShape = createImageShape(id, [{x: centerX - finalW/2, y: centerY - finalH/2}, {x: centerX + finalW/2, y: centerY + finalH/2}], url);
        setShapes(prev => [...prev, newShape]); setSelectedIds(new Set([id])); setTool(ToolType.SELECT);
        resolve();
    };
    img.onerror = () => { showImportError('无法解码转换后的图片'); resolve(); };
    img.src = url;
}), [canvasWidth, originY, saveHistory, generateId, setShapes, setSelectedIds, setTool, showImportError]);

const processImageFile = useCallback(async (file: File, position?: Point) => {
    if (isHeicFile(file)) {
        setLoadingState({ active: true, title: 'Importing Image', message: '正在转换 HEIC 图片…' });
        try {
            await addImageShapeFromUrl(await convertHeicToPngDataUrl(file), position);
        } catch (e) {
            showImportError(e instanceof HeicImportError ? e.message : 'HEIC 转换失败，文件可能已损坏');
        } finally {
            setLoadingState({ active: false, message: '' });
        }
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => { void addImageShapeFromUrl(event.target?.result as string, position); };
    reader.readAsDataURL(file);
}, [addImageShapeFromUrl, showImportError]);
```

- [ ] **Step 5: 暴露 importError**

把文件末尾的返回对象改为包含 `importError`：

```ts
return { loadingState, saveMessage, importError, fileInputRef, persistProject, handleSave, handleSaveAs, processImageFile, processPdfFile, handleFileLoad };
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run hooks/useProjectFiles.test.tsx`
Expected: PASS，含原有 PNG 两条用例。

- [ ] **Step 7: 提交**

```bash
git add hooks/useProjectFiles.ts hooks/useProjectFiles.test.tsx
git commit -m "feat: convert HEIC on import and surface image decode errors"
```

---

## Task 4: StatusToasts 支持可变标题与错误提示

**Files:**
- Modify: `components/editor/StatusToasts.tsx:28-46`（props 与标题）
- Modify: `components/editor/StatusToasts.tsx:48-55`（追加错误 toast）
- Test: `components/editor/StatusToasts.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `StatusToasts` 新 props — `loadingState.title?: string`、`errorMessage?: string | null`

- [ ] **Step 1: 写失败测试**

在 `components/editor/StatusToasts.test.tsx` 的 `describe('StatusToasts', ...)` 内追加：

```tsx
it('uses a custom loading title when provided', () => {
    render(<StatusToasts loadingState={{ active: true, title: 'Importing Image', message: '正在转换 HEIC 图片…' }} saveMessage={null} />);
    expect(screen.getByText('Importing Image')).toBeTruthy();
    expect(screen.queryByText('Importing PDF')).toBeNull();
    expect(screen.getByText('正在转换 HEIC 图片…')).toBeTruthy();
});

it('renders an error toast when errorMessage is set', () => {
    render(<StatusToasts loadingState={{ active: false, message: '' }} saveMessage={null} errorMessage="转换失败" />);
    expect(screen.getByText('转换失败')).toBeTruthy();
});

it('renders no error toast when errorMessage is null', () => {
    const { container } = render(<StatusToasts loadingState={{ active: false, message: '' }} saveMessage={null} errorMessage={null} />);
    expect(container.childElementCount).toBe(0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run components/editor/StatusToasts.test.tsx`
Expected: FAIL — 自定义标题断言找不到 `Importing Image`，`errorMessage` 未渲染。

- [ ] **Step 3: 实现 props 与标题**

把 `StatusToastsProps` 与组件签名改为：

```tsx
interface StatusToastsProps {
    loadingState: { active: boolean; message: string; title?: string };
    saveMessage: string | null;
    errorMessage?: string | null;
}

export const StatusToasts: React.FC<StatusToastsProps> = ({ loadingState, saveMessage, errorMessage }) => {
```

把加载遮罩里的固定标题替换为：

```tsx
<h3 className="font-bold text-lg text-slate-800">{loadingState.title ?? 'Importing PDF'}</h3>
```

- [ ] **Step 4: 追加错误 toast**

在 `saveMessage` 区块之后、`</>` 之前追加：

```tsx
{errorMessage && (
    <div className="fixed top-32 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border border-red-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            {errorMessage}
        </div>
    </div>
)}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run components/editor/StatusToasts.test.tsx`
Expected: PASS，原有 `'Importing PDF'` 默认标题用例仍通过。

- [ ] **Step 6: 提交**

```bash
git add components/editor/StatusToasts.tsx components/editor/StatusToasts.test.tsx
git commit -m "feat: allow custom import title and show import errors"
```

---

## Task 5: Editor 接线与入口分流

**Files:**
- Modify: `components/Editor.tsx:1-30`（import）
- Modify: `components/Editor.tsx:104-111`（解构）
- Modify: `components/Editor.tsx:207`、`:216`（分流条件）
- Modify: `components/Editor.tsx:274`（accept）
- Modify: `components/Editor.tsx:276`（StatusToasts）
- Test: `components/Editor.test.tsx`

**Interfaces:**
- Consumes: `isImageFile`（Task 1）、`importError`（Task 3）、`StatusToasts.errorMessage`（Task 4）
- Produces: 拖放/文件选择对 `.heic/.heif` 走 `processImageFile`

- [ ] **Step 1: 写失败测试**

在 `components/Editor.test.tsx` 的 `describe('Editor rendering and tool switching', ...)` 内追加：

```tsx
it('accepts HEIC files in the hidden file picker', () => {
    const { container } = renderEditor();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain('.heic');
    expect(input.accept).toContain('.heif');
});

it('routes a dropped HEIC file (empty MIME type) to the image import path', async () => {
    const { container } = renderEditor();
    const target = container.querySelector('div.overflow-x-auto') as HTMLElement;
    const file = new File(['heic'], 'photo.heic', { type: '' });

    fireEvent.drop(target, { dataTransfer: { files: [file] }, clientX: 400, clientY: 300 });

    await waitFor(() =>
        expect(screen.getByText('HEIC 图片仅支持在桌面版导入，请先转换为 PNG/JPEG')).toBeTruthy(),
    );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run components/Editor.test.tsx`
Expected: FAIL — `accept` 不含 `.heic`；拖放后没有任何提示（走了 `.geo/.json` 分支）。

- [ ] **Step 3: 接入 isImageFile**

在 `components/Editor.tsx` 现有 import 区新增：

```ts
import { isImageFile } from '../utils/heicImport';
```

把 `handleDrop` 与 `handleFileInputChange` 中的 `file.type.startsWith('image/')` 都替换为 `isImageFile(file)`。

- [ ] **Step 4: 解构 importError 并传递给 StatusToasts**

解构改为：

```ts
const {
    loadingState, saveMessage, importError, fileInputRef, persistProject, handleSave, handleSaveAs,
    processImageFile, processPdfFile, handleFileLoad
} = useProjectFiles({
```

`StatusToasts` 改为：

```tsx
<StatusToasts loadingState={loadingState} saveMessage={saveMessage} errorMessage={importError} />
```

- [ ] **Step 5: 扩展 accept**

把隐藏 input 改为：

```tsx
<input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept=".geo,.json,.pdf,image/*,.heic,.heif" className="hidden" />
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run components/Editor.test.tsx`
Expected: PASS，拖动 HEIC 后出现兜底提示（jsdom 无 Electron）。

- [ ] **Step 7: 提交**

```bash
git add components/Editor.tsx components/Editor.test.tsx
git commit -m "feat: route HEIC drops through the image import path"
```

---

## 最终验证

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部通过，无新增 skipped。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出，退出码 0。

- [ ] **Step 3: 手工验收（需要真人操作）**

1. `npm run electron:dev`，从 Finder 拖 `/System/Library/Desktop Pictures/iMac Blue.heic` 到画布：
   出现 `Importing Image` 遮罩，随后图片在落点生成并选中，长边 ≤ 2048。
2. 保存为 `.geo`，确认文件中该图形 `imageUrl` 以 `data:image/png;base64,` 开头；重开项目正常显示。
3. 用 TopBar 的打开按钮选择同一 HEIC，结果一致。
4. 把任意文本文件改名为 `broken.heic` 拖入：出现红色失败 toast，画布无变化。
5. 浏览器 `npm run dev` 拖入 HEIC：出现「仅桌面版」提示。
6. 执行 `ls "$TMPDIR" | grep geodraw-heic`，无输出（临时目录已清理）。

---

## Self-Review 记录

- **Spec 覆盖：** 入口分流（Task 5）、HEIC 识别（Task 1）、sips 转换与错误码（Task 2）、加载态与错误态（Task 3）、可变标题与红色 toast（Task 4）、测试与手工验收（各 Task + 最终验证）均有对应任务。
- **类型一致性：** `convertHeicToPngDataUrl` / `isHeicFile` / `isImageFile` / `HeicImportError` 在 Task 1 定义，Task 3、5 使用同一签名；`loadingState.title` 在 Task 3 与 Task 4 一致；`errorMessage` 在 Task 4 与 Task 5 一致。
- **占位符：** 无 TBD/TODO；所有代码步骤均为可直接粘贴的完整实现。
