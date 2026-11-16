# 性能优化（渲染 + Bundle）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除光标移动时的整树重渲染，并把 PDF/Solver 代码移出首屏 bundle（主 chunk 910KB → ≤600KB，1.34MB worker 延迟加载）。

**Architecture:** 阶段 A 用 React.memo + useCallback/useMemo 稳定化让静态面板跳过光标触发的重渲染；量化不达标才执行阶段 B（高频状态移入 useSyncExternalStore 外部存储）。Bundle 侧把 pdfjs/worker 改为函数内动态 import、App 的模式窗口改 React.lazy。

**Tech Stack:** React 18, Vite 5, TypeScript 5.4, Vitest 4 + jsdom 29 + Testing Library, Electron 31。

**Spec:** `docs/superpowers/specs/2026-11-16-performance-optimization-design.md`

> **Status (2026-11-16 wrap-up):** Tasks 1/2/3/5/6/7 executed and verified; Task 4 skipped by the acceptance rule (avgMs ≤ 2ms, browser-confirmed). Automated regression is green (732 tests, build 538,278-byte main chunk, Playwright smoke on draw/drag/undo/zoom/text/eraser/PDF/solver). Remaining acceptance is the user-owned manual checklist (browser visual checks + Electron `file://` smoke). The unchecked boxes below preserve the original plan text.

## Global Constraints

- 每个 Task 结束后 `npm test` 全绿；覆盖率不低于基线（statements ~82%，branches ~77%）。
- KaTeX 同步渲染路径不变：ShapeRenderer.tsx 的 `import katex` 与 index.tsx 的 CSS import 不动。
- 瞬态 DOM 引擎行为不变：拖拽中 overlay 跟随、松手精确归位；`Editor.transient.test.tsx` 必须全绿。
- `vite.config.ts` 的 `base: './'` 不变；不新增任何依赖。
- dev harness（?profile / ?stress / __runSweep）仅在 `import.meta.env.DEV` 下生效。
- 主 chunk 验收上限 600KB；应用启动不得请求 pdf.worker chunk。
- 量化验收：平均 commit ≤ 2ms 或降幅 ≥ 80%；两者都不满足才执行 Task 4。
- commit 沿用 conventional commits 风格（feat/fix/refactor/test/docs/chore）；每个 Task 末尾提交。
- 直接在 main 分支工作（仓库惯例，开工前工作树干净）。
- 测量环境说明：headless（jsdom）数值用于前后对比与降幅判定；2ms 绝对阈值在 Task 7 用浏览器 `?profile=1` 复核。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `utils/devFixtures.ts` | 创建 | 确定性压力场景图形生成（纯函数） |
| `components/editor/ProfilingHarness.tsx` | 创建 | Profiler 包装 + commit 收集器 + `__runSweep` |
| `test/perfSweep.test.tsx` | 创建 | headless 量化测量（基线/改后复测同一入口） |
| `test/memoPresence.test.tsx` | 创建 | 静态断言目标组件已 memo |
| `test/memoEffectiveness.test.tsx` | 创建 | 光标扫过期间静态面板零重渲染 |
| `hooks/useHighFrequencyStore.ts` | 创建（Task 4 条件） | 高频状态外部存储 |
| `components/editor/CursorOverlays.tsx` | 创建（Task 4 条件） | 唯一订阅高频状态的光标覆盖层 |
| `App.tsx` | 修改 | Task 1 挂 harness；Task 6 模式窗口 lazy |
| `components/Editor.tsx` | 修改 | stress 注入、回调/对象稳定化、（条件）CursorOverlays |
| `hooks/useDocument.ts` | 修改 | undo/deleteSelected/clearAll/setSelectedIds 稳定化 |
| `hooks/useViewport.ts` | 修改 | handleZoomChange 稳定化 |
| `hooks/useProjectFiles.ts` | 修改 | save 回调稳定化；去 mount worker；PDF 动态 import |
| `hooks/useInteractionSession.ts` | 修改 | resetSession 稳定化；（条件）委托 HF store |
| `hooks/useTransientTransforms.ts` | 修改 | refreshDomCache 稳定化 |
| `hooks/usePointerHandlers.ts` | 修改 | getMousePos 复用 clientToCanvas；（条件）store 读取 |
| `hooks/useKeyboardShortcuts.ts` | 修改（Task 4 条件） | compass 读取改 store |
| `utils/coordinates.ts` | 修改 | 新增 clientToCanvas 纯函数 |
| `utils/pdfImport.ts` | 修改 | ensurePdfReady 异步幂等 + 动态 import |
| `components/TopBar.tsx` 等 7 个组件 | 修改 | React.memo 包装 |
| `utils/pdfImport.test.ts` | 重写头部 | ensurePdfReady 语义 + 模块隔离 |
| `hooks/useProjectFiles.test.tsx` | 修改 | mount 不初始化 worker + 懒初始化断言 |
| `docs/superpowers/plans/2026-11-16-performance-execution-log.md` | 创建 | 记录基线/改后/最终测量数据 |

---

### Task 1: 测量 harness + 基线数据

**Files:**
- Create: `utils/devFixtures.ts`, `utils/devFixtures.test.ts`, `components/editor/ProfilingHarness.tsx`, `test/perfSweep.test.tsx`, `docs/superpowers/plans/2026-11-16-performance-execution-log.md`
- Modify: `App.tsx`, `components/Editor.tsx`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces:
  - `generateStressShapes(count: number): Shape[]`（utils/devFixtures.ts）
  - `createCommitCollector(): { onRender: (id: string, phase: string, actualDuration: number) => void; reset(): void; summary(): SweepStats }`
  - `SweepStats = { commits: number; totalMs: number; avgMs: number }`
  - `ProfilingHarness({ children }: { children: React.ReactNode })`，挂载后注册 `window.__runSweep(): Promise<SweepStats>` 与 `window.__profileStats(): SweepStats`
  - Task 3/7 复跑 `npx vitest run test/perfSweep.test.tsx` 取数

- [ ] **Step 1: 写 devFixtures 失败测试**

创建 `utils/devFixtures.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { generateStressShapes } from './devFixtures';
import { ShapeType } from '../types';

describe('generateStressShapes', () => {
    it('returns the requested count with unique ids', () => {
        const shapes = generateStressShapes(200);
        expect(shapes).toHaveLength(200);
        expect(new Set(shapes.map(s => s.id)).size).toBe(200);
    });
    it('is deterministic across calls', () => {
        expect(generateStressShapes(50)).toEqual(generateStressShapes(50));
    });
    it('cycles LINE/TRIANGLE/CIRCLE/TEXT', () => {
        expect(generateStressShapes(8).map(s => s.type)).toEqual([
            ShapeType.LINE, ShapeType.TRIANGLE, ShapeType.CIRCLE, ShapeType.TEXT,
            ShapeType.LINE, ShapeType.TRIANGLE, ShapeType.CIRCLE, ShapeType.TEXT,
        ]);
    });
    it('produces renderable shapes', () => {
        for (const s of generateStressShapes(20)) {
            expect(s.points.length).toBeGreaterThan(0);
            expect(typeof s.fill).toBe('string');
            expect(typeof s.stroke).toBe('string');
            expect(s.rotation).toBe(0);
        }
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run utils/devFixtures.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 devFixtures**

创建 `utils/devFixtures.ts`：

```ts
import { Shape, ShapeType } from '../types';

export const generateStressShapes = (count: number): Shape[] => {
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const shapes: Shape[] = [];
    for (let i = 0; i < count; i++) {
        const x = 100 + rand() * 1400;
        const y = 100 + rand() * 1200;
        const w = 40 + rand() * 120;
        const h = 40 + rand() * 120;
        const base = { id: `stress-${i}`, fill: 'transparent', stroke: '#334155', strokeWidth: 2, rotation: 0 };
        const kind = i % 4;
        if (kind === 0) shapes.push({ ...base, type: ShapeType.LINE, points: [{ x, y }, { x: x + w, y: y + h }] });
        else if (kind === 1) shapes.push({ ...base, type: ShapeType.TRIANGLE, points: [{ x, y }, { x: x + w, y }, { x: x + w / 2, y: y + h }] });
        else if (kind === 2) shapes.push({ ...base, type: ShapeType.CIRCLE, points: [{ x, y }, { x: x + w, y: y + w }] });
        else shapes.push({ ...base, type: ShapeType.TEXT, points: [{ x, y }], text: `T${i}`, fontSize: 16 });
    }
    return shapes;
};
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run utils/devFixtures.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 实现 ProfilingHarness**

创建 `components/editor/ProfilingHarness.tsx`：

```tsx
import React, { Profiler, useEffect, useRef } from 'react';

export interface SweepStats { commits: number; totalMs: number; avgMs: number; }

export const createCommitCollector = () => {
    let commits = 0;
    let totalMs = 0;
    return {
        onRender: (_id: string, _phase: string, actualDuration: number) => { commits++; totalMs += actualDuration; },
        reset: () => { commits = 0; totalMs = 0; },
        summary: (): SweepStats => ({ commits, totalMs, avgMs: commits > 0 ? totalMs / commits : 0 }),
    };
};

export const ProfilingHarness = ({ children }: { children: React.ReactNode }) => {
    const collectorRef = useRef(createCommitCollector());
    useEffect(() => {
        const w = window as any;
        w.__profileStats = () => collectorRef.current.summary();
        w.__runSweep = async () => {
            const svg = document.querySelector('svg.touch-none');
            if (!svg) throw new Error('editor svg not found');
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
            await new Promise(r => setTimeout(r, 0));
            collectorRef.current.reset();
            const rect = svg.getBoundingClientRect();
            const width = rect.width || 1600;
            const height = rect.height || 800;
            for (let i = 0; i < 100; i++) {
                const clientX = rect.left + width * (i / 100);
                const clientY = rect.top + height * (i / 100);
                const init = { clientX, clientY, pointerId: 1, bubbles: true };
                const evt = typeof PointerEvent !== 'undefined'
                    ? new PointerEvent('pointermove', init)
                    : Object.assign(new MouseEvent('pointermove', init), { pointerId: 1 });
                svg.dispatchEvent(evt);
                await new Promise(r => setTimeout(r, 16));
            }
            const stats = collectorRef.current.summary();
            console.table(stats);
            return stats;
        };
        return () => { delete w.__profileStats; delete w.__runSweep; };
    }, []);
    return <Profiler id="editor" onRender={collectorRef.current.onRender}>{children}</Profiler>;
};
```

说明：sweep 用 LINE 工具空闲态（只派发 move、不派发 down，无 activeShapeId），此时 `usePointerHandlers.ts:327` 每次 move 触发 `setCursorPos` 且无结构性更新。不用 SELECT：其 hover 有 50ms 节流 + 变更守卫，基线会失真。

- [ ] **Step 6: App.tsx 挂 harness（DEV + ?profile=1 门控）**

`App.tsx` 顶部 import 区加：

```tsx
import { ProfilingHarness } from './components/editor/ProfilingHarness';
```

组件体内 `const isSolverMode = ...` 之后加：

```tsx
const profileEnabled = import.meta.env.DEV && params.get('profile') === '1';
```

末尾 `return <Editor />;` 改为：

```tsx
return profileEnabled ? <ProfilingHarness><Editor /></ProfilingHarness> : <Editor />;
```

- [ ] **Step 7: Editor.tsx 加 stress 注入（DEV 门控）**

`components/Editor.tsx`：
- 第 1 行 import 改为 `import { useState, useRef, useCallback, useEffect } from 'react';`
- import 区加 `import { generateStressShapes } from '../utils/devFixtures';`
- 在 `useDocument(...)` 解构之后加：

```tsx
useEffect(() => {
    if (!import.meta.env.DEV) return;
    const stress = new URLSearchParams(window.location.search).get('stress');
    if (!stress) return;
    const n = parseInt(stress, 10);
    if (Number.isFinite(n) && n > 0) setShapes(generateStressShapes(Math.min(n, 2000)));
}, []);
```

- [ ] **Step 8: 写 headless 测量测试**

创建 `test/perfSweep.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { Editor } from '../components/Editor';
import { ProfilingHarness, createCommitCollector } from '../components/editor/ProfilingHarness';
import { stubPointerCapture } from './componentHelpers';

vi.mock('pdfjs-dist/build/pdf.mjs', () => ({ GlobalWorkerOptions: { workerPort: null }, getDocument: vi.fn() }));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?worker', () => ({ default: class MockPdfWorker {} }));
vi.mock('../utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/exportUtils')>();
    return {
        ...actual,
        saveProject: vi.fn(), loadProject: vi.fn(), getLocalFilePath: vi.fn(() => null),
        isElectron: vi.fn(() => false), exportCanvas: vi.fn(), exportAppIcon: vi.fn(),
    };
});

beforeEach(() => {
    stubPointerCapture();
    window.history.replaceState({}, '', '/?stress=200');
});

describe('createCommitCollector', () => {
    it('aggregates commits and resets', () => {
        const c = createCommitCollector();
        c.onRender('editor', 'update', 3);
        c.onRender('editor', 'update', 5);
        expect(c.summary()).toEqual({ commits: 2, totalMs: 8, avgMs: 4 });
        c.reset();
        expect(c.summary()).toEqual({ commits: 0, totalMs: 0, avgMs: 0 });
    });
});

describe('perf sweep', () => {
    it('LINE-idle sweep commits once per move and reports stats', async () => {
        const utils = render(<ProfilingHarness><Editor /></ProfilingHarness>);
        expect(utils.container.querySelectorAll('g[data-shape-id]').length).toBe(200);
        let stats: any;
        await act(async () => { stats = await (window as any).__runSweep(); });
        console.info('[perfSweep]', JSON.stringify(stats));
        expect(stats.commits).toBeGreaterThanOrEqual(90);
        expect(stats.commits).toBeLessThanOrEqual(120);
        expect(stats.avgMs).toBeGreaterThan(0);
    }, 15000);
});
```

- [ ] **Step 9: 运行测量测试并记录基线**

Run: `npx vitest run test/perfSweep.test.tsx`
Expected: PASS，控制台输出 `[perfSweep] {"commits":...,"totalMs":...,"avgMs":...}`

创建 `docs/superpowers/plans/2026-11-16-performance-execution-log.md`，把上一步实测输出填入：

```markdown
# 性能优化执行记录

测量入口：`npx vitest run test/perfSweep.test.tsx`（jsdom，stress=200，LINE 空闲态 100 次 pointermove）。
jsdom 的 actualDuration 与真实浏览器有差异；降幅指标在同环境前后对比有效，2ms 绝对阈值在 Task 7 用浏览器 `?profile=1&stress=200` + `__runSweep()` 复核。

## 基线（Task 1，优化前）
- commits: <Step 9 实测值>
- totalMs: <实测值>
- avgMs: <实测值>

## 阶段 A 后（Task 3 填写）
- commits / totalMs / avgMs:
- 降幅（avgMs）:
- Task 4 触发判定（avgMs > 2 且降幅 < 80% → 触发）:

## 最终（Task 7 填写）
- 浏览器实测:
- 主 chunk 体积:
- 验收结论:
```

（尖括号处用 Step 9 的真实输出替换，这是运行数据记录，不是实现占位。）

- [ ] **Step 10: 全量测试 + 提交**

Run: `npm test`
Expected: 全绿

```bash
git add utils/devFixtures.ts utils/devFixtures.test.ts components/editor/ProfilingHarness.tsx test/perfSweep.test.tsx App.tsx components/Editor.tsx docs/superpowers/plans/2026-11-16-performance-execution-log.md
git commit -m "feat: add dev-only profiling harness and stress fixtures with baseline measurement"
```

---

### Task 2: 回调与对象 prop 稳定化

**Files:**
- Modify: `hooks/useDocument.ts:19-33,51-58`, `hooks/useViewport.ts:45-56`, `hooks/useProjectFiles.ts:69-70`, `hooks/useInteractionSession.ts:51-57`, `hooks/useTransientTransforms.ts:99-124`, `hooks/usePointerHandlers.ts:113-125`, `utils/coordinates.ts`, `components/Editor.tsx`
- Test: `hooks/useDocument.test.tsx`, `hooks/useViewport.test.tsx`, `hooks/useProjectFiles.test.tsx`, `utils/coordinates.test.ts`

**Interfaces:**
- Consumes: Task 1 的 harness（本任务不改测量）
- Produces: 稳定引用的 `undo/deleteSelected/clearAll/setSelectedIds/handleZoomChange/handleSave/handleSaveAs/resetSession/refreshDomCache`；模块级 `generateId/isTool/NOOP`；`clientToCanvas(e: { clientX: number; clientY: number }, svg: SVGSVGElement, zoom: number): Point`（utils/coordinates.ts）；Editor 内 `handleResizeStart/handleRotateStart/handleGroupRotateStart/handleMarkAngle/handleAngleDoubleClick/handleDrop/handleFileInputChange/handleToolChange/setPressureEnabled/handleFold` 与 `overrideOrigin/panelCanvasSize/groupBounds/groupShape` useMemo 对象。Task 3 的 memo 依赖这些稳定引用。

- [ ] **Step 1: 写失败测试（回调引用稳定性）**

`hooks/useDocument.test.tsx` 末尾追加（setup 已存在）：

```tsx
describe('useDocument callback stability', () => {
    it('keeps action references stable across rerenders without state changes', () => {
        const { hook } = setup();
        const first = hook.result.current;
        hook.rerender();
        expect(hook.result.current.undo).toBe(first.undo);
        expect(hook.result.current.deleteSelected).toBe(first.deleteSelected);
        expect(hook.result.current.clearAll).toBe(first.clearAll);
        expect(hook.result.current.setSelectedIds).toBe(first.setSelectedIds);
    });
});
```

`hooks/useViewport.test.tsx` 末尾追加：

```tsx
describe('useViewport callback stability', () => {
    it('keeps handleZoomChange stable across rerenders', () => {
        const { hook } = setup();
        const first = hook.result.current.handleZoomChange;
        hook.rerender({ ticks: 5 });
        expect(hook.result.current.handleZoomChange).toBe(first);
    });
});
```

`hooks/useProjectFiles.test.tsx` 末尾追加：

```tsx
describe('useProjectFiles callback stability', () => {
    it('keeps save handlers stable across rerenders with unchanged shapes', () => {
        const { hook } = setup();
        const first = hook.result.current;
        hook.rerender();
        expect(hook.result.current.handleSave).toBe(first.handleSave);
        expect(hook.result.current.handleSaveAs).toBe(first.handleSaveAs);
    });
});
```

`utils/coordinates.test.ts` 末尾追加（import 区加 `clientToCanvas`）：

```ts
describe('clientToCanvas', () => {
    it('maps client coordinates through the svg rect and zoom', () => {
        const svg = { getBoundingClientRect: () => ({ left: 100, top: 50 }) } as unknown as SVGSVGElement;
        expect(clientToCanvas({ clientX: 300, clientY: 250 }, svg, 2)).toEqual({ x: 100, y: 100 });
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run hooks/useDocument.test.tsx hooks/useViewport.test.tsx hooks/useProjectFiles.test.tsx utils/coordinates.test.ts`
Expected: 新增稳定性测试 FAIL（引用每次变化）；clientToCanvas FAIL（未导出）

- [ ] **Step 3: 稳定化 hooks**

`hooks/useDocument.ts`：
- `setSelectedIds` 整体包 useCallback（body 不变，deps `[setPivotIndex]`；`_setSelectedIds` 与 `shapesRef` 稳定）：

```ts
const setSelectedIds = useCallback((ids: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    _setSelectedIds(prev => {
        const next = typeof ids === 'function' ? ids(prev) : ids;
        if (next.size === 1) {
            const id = Array.from(next)[0];
            const s = shapesRef.current.find(shape => shape.id === id);
            if (s && s.type === ShapeType.RULER) {
                setPivotIndex(0);
            } else {
                setPivotIndex('center');
            }
        } else {
            setPivotIndex('center');
        }
        return next;
    });
}, [setPivotIndex]);
```

- 三个 action 包 useCallback（body 逐字不变）：

```ts
const undo = useCallback(() => { if (history.length === 0) return; const previousState = history[history.length - 1]; setHistory(prev => prev.slice(0, -1)); setShapes(previousState); setSelectedIds(new Set<string>()); setActiveShapeId(null); setIsDirty(true); }, [history, setSelectedIds]);

const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return; saveHistory(); const idsToDelete = new Set<string>(Array.from(selectedIds) as string[]);
    setShapes(prev => removeShapesWithDependents(prev, idsToDelete)); setSelectedIds(new Set<string>());
}, [selectedIds, saveHistory, setSelectedIds]);

const clearAll = useCallback(() => { saveHistory(); setShapes([]); setHistory([]); setSelectedIds(new Set()); }, [saveHistory, setSelectedIds]);
```

`hooks/useViewport.ts:45`：`handleZoomChange` 包 useCallback，body 不变，deps `[zoom]`。

`hooks/useProjectFiles.ts:69-70`：

```ts
const handleSave = useCallback(() => persistProject(shapes), [persistProject, shapes]);
const handleSaveAs = useCallback(() => persistProject(shapes, true), [persistProject, shapes]);
```

`hooks/useInteractionSession.ts`：import 加 `useCallback`；`resetSession` 包 useCallback，body 不变，deps `[]`（全部是稳定 setter 与 ref）。

`hooks/useTransientTransforms.ts`：import 加 `useCallback`；`refreshDomCache` 包 useCallback，body 不变，deps `[selectedIds, tool]`（其余读取均为 ref）。

- [ ] **Step 4: 提取 clientToCanvas 并复用**

`utils/coordinates.ts` 追加（import 区已有 Point 类型则复用）：

```ts
export const clientToCanvas = (e: { clientX: number; clientY: number }, svg: SVGSVGElement, zoom: number): Point => {
    const rect = svg.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
};
```

`hooks/usePointerHandlers.ts`：import 区从 `../utils/coordinates` 加 `clientToCanvas`；`getMousePos`（113 行起）的 raw 计算替换为：

```ts
const base = clientToCanvas(e as { clientX: number; clientY: number }, svgRef.current, zoom);
const raw = { ...base, p: pressure };
```

（其后的 FREEHAND/snap 分支逐字不动。）

- [ ] **Step 5: Editor 稳定化**

`components/Editor.tsx`：
- 第 1 行改为 `import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';`（React 默认 import 供 React.PointerEvent 等类型使用，与其余组件文件惯例一致）；从 `../utils/coordinates` import `clientToCanvas`。
- `generateId`（89 行）与 `isTool`（102 行）移到组件外模块级，并加模块级 `const NOOP = () => {};`。
- 以下回调全部 useCallback 化（替换原内联定义）：

```tsx
const handleToolChange = useCallback((newTool: ToolType) => {
    setTool(newTool); setSelectedIds(new Set()); resetSession(); setTextEditing(null); setAngleEditing(null); setPickingMirrorMode(false); setMarkingAnglesMode(false); transientStateRef.current = null;
}, [resetSession, setSelectedIds]);

const setPressureEnabled = useCallback((val: boolean) => {
    _setPressureEnabled(val);
    if (selectedIds.size > 0) {
        setShapes(prev => prev.map(s => (selectedIds.has(s.id) && s.type === ShapeType.FREEHAND) ? { ...s, usePressure: val } : s));
    }
}, [selectedIds]);

const handleFold = useCallback((lineId: string) => {
    const line = shapes.find(s => s.id === lineId); if (!line || line.points.length < 2) return;
    const targets = shapes.filter(s => selectedIds.has(s.id) && s.id !== lineId); if (targets.length === 0) { setPickingMirrorMode(false); return; }
    saveHistory();
    const newShapes = reflectShapesAcrossLine(targets, line, generateId);
    setShapes(prev => [...prev, ...newShapes]); setSelectedIds(new Set(newShapes.map(s => s.id))); setPickingMirrorMode(false);
}, [shapes, selectedIds, saveHistory, setSelectedIds]);

const handleResizeStart = useCallback((idx: number, e: React.PointerEvent) => {
    e.stopPropagation(); saveHistory(); refreshDomCache(); setDragHandleIndex(idx); setIsDragging(true);
}, [saveHistory, refreshDomCache]);

const handleRotateStart = useCallback((e: React.PointerEvent) => {
    if (!selectedShape || !svgRef.current) return;
    e.stopPropagation();
    saveHistory();
    refreshDomCache();
    setIsRotating(true);
    const center = getRotationPivot(selectedShape, pivotIndex);
    setRotationCenter(center);
    const pos = clientToCanvas(e, svgRef.current, zoom);
    lastRotationMouseAngle.current = Math.atan2(pos.y - center.y, pos.x - center.x) * (180 / Math.PI);
}, [selectedShape, pivotIndex, zoom, saveHistory, refreshDomCache]);

const handleGroupRotateStart = useCallback((e: React.PointerEvent) => {
    if (!groupBounds || !svgRef.current) return;
    e.stopPropagation();
    saveHistory();
    refreshDomCache();
    setIsRotating(true);
    const center = { x: groupBounds.minX + groupBounds.width / 2, y: groupBounds.minY + groupBounds.height / 2 };
    setRotationCenter(center);
    const pos = clientToCanvas(e, svgRef.current, zoom);
    lastRotationMouseAngle.current = Math.atan2(pos.y - center.y, pos.x - center.x) * (180 / Math.PI);
}, [groupBounds, zoom, saveHistory, refreshDomCache]);

const handleMarkAngle = useCallback((idx: number) => {
    if (!selectedShape) return;
    const plan = planAngleMarkerToggle(shapes, selectedShape, idx, generateId());
    if (plan.kind === 'toggle') {
        setShapes(ps => ps.map(m => m.id === plan.markerId ? toggleMarkerType(m, ps) : m));
    } else if (plan.kind === 'create') {
        saveHistory();
        setShapes(ps => [...ps, plan.marker]);
    }
}, [shapes, selectedShape, saveHistory]);

const handleAngleDoubleClick = useCallback((idx: number, e: React.MouseEvent) => {
    if (!selectedShape) return;
    e.stopPropagation();
    const anchor = getAngleEditAnchor(selectedShape, idx);
    setAngleEditing({ id: selectedShape.id, index: idx, x: anchor.x, y: anchor.y, value: getPolygonAngles(selectedShape.points)[idx]?.toString() || '0' });
}, [selectedShape]);

const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf') { processPdfFile(file); }
    else if (file.type.startsWith('image/')) { processImageFile(file, { x: e.clientX - svgRef.current!.getBoundingClientRect().left, y: e.clientY - svgRef.current!.getBoundingClientRect().top }); }
    else if (file.name.endsWith('.geo') || file.name.endsWith('.json')) { const reader = new FileReader(); reader.onload = (event) => { handleFileLoad(event.target?.result as string); }; reader.readAsText(file); }
}, [processPdfFile, processImageFile, handleFileLoad]);

const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
        const file = e.target.files[0];
        if (file.type === 'application/pdf') { await processPdfFile(file); }
        else if (file.type.startsWith('image/')) { processImageFile(file); }
        else { const loaded = await loadProject(file); handleFileLoad(JSON.stringify(loaded), getLocalFilePath(file)); }
        e.target.value = '';
    }
}, [processPdfFile, processImageFile, handleFileLoad]);
```

注意：`selectedShape`/`groupBounds` 的计算必须移到这些回调之前（原 143-144 行上移到 usePointerHandlers 调用之前）。
- 对象 useMemo：

```tsx
const groupBounds = useMemo(() => selectedIds.size > 1 ? getSelectionBounds(shapes, selectedIds) : null, [shapes, selectedIds]);
const groupShape = useMemo(() => groupBounds ? { id: 'selection-group', type: ShapeType.RECTANGLE, points: [{ x: groupBounds.minX, y: groupBounds.minY }, { x: groupBounds.maxX, y: groupBounds.maxY }], fill: 'none', stroke: 'transparent', strokeWidth: 0, rotation: 0 } : null, [groupBounds]);
const overrideOrigin = useMemo(() => ({ x: canvasSize.width / 2, y: originY }), [canvasSize.width, originY]);
const panelCanvasSize = useMemo(() => ({ width: canvasSize.width, height: svgHeight }), [canvasSize.width, svgHeight]);
```

- JSX 替换：
  - AxisLayer 的 `overrideOrigin={{ x: canvasSize.width / 2, y: originY }}` → `overrideOrigin={overrideOrigin}`
  - 单选 SelectionOverlay：`onResizeStart={handleResizeStart} onRotateStart={handleRotateStart} onSetPivot={setPivotIndex} onMarkAngle={handleMarkAngle} onAngleChange={NOOP} onAngleDoubleClick={handleAngleDoubleClick}`
  - 组选 SelectionOverlay：`shape={groupShape}`，条件改 `selectedIds.size > 1 && groupShape &&`，`onResizeStart={handleResizeStart} onRotateStart={handleGroupRotateStart} onSetPivot={NOOP} onMarkAngle={NOOP} onAngleChange={NOOP}`
  - PropertiesPanel 的 `canvasSize={{ width: canvasSize.width, height: svgHeight }}` → `canvasSize={panelCanvasSize}`
  - 容器 div 的 `onDragOver` 保留内联（无 memo 消费者），`onDrop={...}` → `onDrop={handleDrop}`
  - 文件 input 的 `onChange={async (e) => {...}}` → `onChange={handleFileInputChange}`
- React 类型 import：文件顶部加 `import type React from 'react';`（供 React.PointerEvent 等类型使用；若已有 React 命名空间引用则沿用）。

- [ ] **Step 6: 运行确认通过 + 全量回归**

Run: `npx vitest run hooks/useDocument.test.tsx hooks/useViewport.test.tsx hooks/useProjectFiles.test.tsx utils/coordinates.test.ts`
Expected: 新增测试 PASS
Run: `npm test`
Expected: 全绿（行为不变，尤其 Editor.transient.test.tsx）

- [ ] **Step 7: 提交**

```bash
git add hooks/useDocument.ts hooks/useViewport.ts hooks/useProjectFiles.ts hooks/useInteractionSession.ts hooks/useTransientTransforms.ts hooks/usePointerHandlers.ts utils/coordinates.ts utils/coordinates.test.ts components/Editor.tsx hooks/useDocument.test.tsx hooks/useViewport.test.tsx hooks/useProjectFiles.test.tsx
git commit -m "perf: stabilize callbacks and object props for memoization"
```

---

### Task 3: 补 React.memo + 量化对比

**Files:**
- Modify: `components/TopBar.tsx:24`, `components/Sidebar.tsx:11`, `components/AxisLayer.tsx:14`, `components/SelectionOverlay.tsx:23`, `components/ConstructionTools.tsx:13`（仅 CompassOverlay）, `components/editor/PageBreaks.tsx:10`, `components/editor/SnapIndicator.tsx:9`
- Create: `test/memoPresence.test.tsx`, `test/memoEffectiveness.test.tsx`
- Modify: `docs/superpowers/plans/2026-11-16-performance-execution-log.md`

**Interfaces:**
- Consumes: Task 2 的全部稳定引用与 useMemo 对象；Task 1 的 perfSweep 测量入口
- Produces: 7 个 memo 化组件；执行日志中的阶段 A 数据与 Task 4 触发判定

- [ ] **Step 1: 写失败测试（memo 存在性）**

创建 `test/memoPresence.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { TopBar } from '../components/TopBar';
import { Sidebar } from '../components/Sidebar';
import { AxisLayer } from '../components/AxisLayer';
import { SelectionOverlay } from '../components/SelectionOverlay';
import { CompassOverlay } from '../components/ConstructionTools';
import { PageBreaks } from '../components/editor/PageBreaks';
import { SnapIndicator } from '../components/editor/SnapIndicator';

describe('memo presence', () => {
    it('wraps static panels in React.memo', () => {
        const memoType = Symbol.for('react.memo');
        for (const c of [TopBar, Sidebar, AxisLayer, SelectionOverlay, CompassOverlay, PageBreaks, SnapIndicator]) {
            expect((c as any).$$typeof).toBe(memoType);
        }
    });
});
```

- [ ] **Step 2: 写失败测试（扫过期间零重渲染）**

创建 `test/memoEffectiveness.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Editor } from '../components/Editor';
import { stubPointerCapture } from './componentHelpers';

vi.mock('pdfjs-dist/build/pdf.mjs', () => ({ GlobalWorkerOptions: { workerPort: null }, getDocument: vi.fn() }));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?worker', () => ({ default: class MockPdfWorker {} }));
vi.mock('../utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../utils/exportUtils')>();
    return {
        ...actual,
        saveProject: vi.fn(), loadProject: vi.fn(), getLocalFilePath: vi.fn(() => null),
        isElectron: vi.fn(() => false), exportCanvas: vi.fn(), exportAppIcon: vi.fn(),
    };
});
vi.mock('../components/PropertiesPanel', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../components/PropertiesPanel')>();
    const React = await import('react');
    return {
        ...actual,
        PropertiesPanel: React.memo((props: any) => {
            (window as any).__panelRenders = ((window as any).__panelRenders || 0) + 1;
            return React.createElement(actual.PropertiesPanel, props);
        }),
    };
});
vi.mock('../components/TopBar', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../components/TopBar')>();
    const React = await import('react');
    return {
        ...actual,
        TopBar: React.memo((props: any) => {
            (window as any).__topbarRenders = ((window as any).__topbarRenders || 0) + 1;
            return React.createElement(actual.TopBar, props);
        }),
    };
});
vi.mock('../components/AxisLayer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../components/AxisLayer')>();
    const React = await import('react');
    return {
        ...actual,
        AxisLayer: React.memo((props: any) => {
            (window as any).__axisRenders = ((window as any).__axisRenders || 0) + 1;
            return React.createElement(actual.AxisLayer, props);
        }),
    };
});

beforeEach(() => {
    stubPointerCapture();
    (window as any).__panelRenders = 0;
    (window as any).__topbarRenders = 0;
    (window as any).__axisRenders = 0;
    window.history.replaceState({}, '', '/');
});

describe('memo effectiveness', () => {
    it('static panels do not re-render during a LINE-idle cursor sweep', () => {
        const utils = render(<Editor />);
        const svg = utils.container.querySelector('svg.touch-none') as SVGSVGElement;
        fireEvent.keyDown(window, { key: 'l' });
        const baseline = {
            panel: (window as any).__panelRenders,
            topbar: (window as any).__topbarRenders,
            axis: (window as any).__axisRenders,
        };
        for (let i = 0; i < 20; i++) {
            fireEvent.pointerMove(svg, { clientX: 100 + i * 10, clientY: 100 + i * 5, pointerId: 1 });
        }
        expect((window as any).__panelRenders).toBe(baseline.panel);
        expect((window as any).__topbarRenders).toBe(baseline.topbar);
        expect((window as any).__axisRenders).toBe(baseline.axis);
    });
});
```

原理：counting-memo 包装器替换导出，Editor 传入的 props 稳定时外层 memo 跳过、计数不增；props 不稳定时每次 Editor 重渲染都计数。此测试在 Task 2 完成前必失败。

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run test/memoPresence.test.tsx test/memoEffectiveness.test.tsx`
Expected: memoPresence FAIL（组件未 memo）；memoEffectiveness FAIL（计数增长）

- [ ] **Step 4: 给 7 个组件包 React.memo**

每个文件把组件定义的箭头函数包进 `React.memo(...)`，闭合处 `};` 改 `});`。 opening 行逐文件如下（body 逐字不动）：

```tsx
// TopBar.tsx:24
export const TopBar: React.FC<TopBarProps> = React.memo(({
// Sidebar.tsx:11
export const Sidebar: React.FC<SidebarProps> = React.memo(({ activeTool, onToolChange }) => {
// AxisLayer.tsx:14
export const AxisLayer: React.FC<AxisLayerProps> = React.memo(({ config, width, height, pixelsPerUnit, overrideOrigin, pageCount = 1, pageHeight }) => {
// SelectionOverlay.tsx:23
export const SelectionOverlay: React.FC<SelectionOverlayProps> = React.memo(({
// ConstructionTools.tsx:13（仅 CompassOverlay，RulerOverlay 不动）
export const CompassOverlay: React.FC<CompassOverlayProps> = React.memo(({ center, cursor, radiusPoint, isDrawing }) => {
// editor/PageBreaks.tsx:10
export const PageBreaks: React.FC<PageBreaksProps> = React.memo(({ pageCount, pageHeight, width }) => {
// editor/SnapIndicator.tsx:9
export const SnapIndicator: React.FC<SnapIndicatorProps> = React.memo(({ indicator }) => {
```

各文件已 import React（均使用 React.FC）；缺少的补 `import React from 'react';`。

- [ ] **Step 5: 运行确认通过 + 全量回归**

Run: `npx vitest run test/memoPresence.test.tsx test/memoEffectiveness.test.tsx`
Expected: PASS
Run: `npm test`
Expected: 全绿（重点 Editor.transient.test.tsx：拖拽中 overlay 跟随、松手归位）

- [ ] **Step 6: 量化对比并记录判定**

Run: `npx vitest run test/perfSweep.test.tsx`
把输出的 commits/totalMs/avgMs 填入执行日志「阶段 A 后」，计算 avgMs 降幅，写明判定：
- avgMs ≤ 2 或降幅 ≥ 80% → Task 4 跳过
- 否则 → 执行 Task 4

- [ ] **Step 7: 提交**

```bash
git add components/TopBar.tsx components/Sidebar.tsx components/AxisLayer.tsx components/SelectionOverlay.tsx components/ConstructionTools.tsx components/editor/PageBreaks.tsx components/editor/SnapIndicator.tsx test/memoPresence.test.tsx test/memoEffectiveness.test.tsx docs/superpowers/plans/2026-11-16-performance-execution-log.md
git commit -m "perf: memoize static panels and record phase-A render measurements"
```

---

### Task 4（条件执行）: 高频状态隔离

**触发条件：Task 3 判定为「avgMs > 2 且降幅 < 80%」。不满足则整体跳过本任务。**

与 spec 的对齐说明：spec 要求 hoveredShapeId「降级为 ref」——本实现让它随 HFStore 统一管理（store 本身即 ref 支撑的外部状态，无 React state），setter API 保持一致；它没有专属订阅者，只有 CursorOverlays 随整体快照被动更新，满足「不触发 Editor 重渲染」的意图。

**Files:**
- Create: `hooks/useHighFrequencyStore.ts`, `hooks/useHighFrequencyStore.test.ts`, `components/editor/CursorOverlays.tsx`
- Modify: `hooks/useInteractionSession.ts`, `hooks/useInteractionSession.test.tsx`, `hooks/usePointerHandlers.ts`, `hooks/useKeyboardShortcuts.ts`, `components/Editor.tsx`

**Interfaces:**
- Consumes: Task 2/3 的稳定化与 memo 基础
- Produces:
  - `HFState = { cursorPos: Point | null; snapIndicator: SnapIndicator | null; compassState: CompassState; compassPreviewPath: string | null; hoveredShapeId: string | null }`
  - `SnapIndicator = Point & { type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' }`
  - `createHFStore(): { get(): HFState; set(patch: Partial<HFState> | ((prev: HFState) => Partial<HFState>)): void; subscribe(l: () => void): () => void }`
  - `HFStore = ReturnType<typeof createHFStore>`；`useHFState(store: HFStore): HFState`
  - `INITIAL_HF_STATE: HFState`
  - useInteractionSession 返回值移除 `cursorPos/snapIndicator/compassState/compassPreviewPath/hoveredShapeId` 值字段，新增 `hfStore`；setter 名称与签名不变（setCompassState 仍支持 updater）
  - `CursorOverlays({ store, tool, pixelsPerUnit, stroke, strokeWidth, selectedIds })`

- [ ] **Step 1: 写 store 失败测试**

创建 `hooks/useHighFrequencyStore.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createHFStore, useHFState, INITIAL_HF_STATE } from './useHighFrequencyStore';

describe('createHFStore', () => {
    it('starts at INITIAL_HF_STATE and applies patches', () => {
        const store = createHFStore();
        expect(store.get()).toEqual(INITIAL_HF_STATE);
        store.set({ cursorPos: { x: 1, y: 2 } });
        expect(store.get().cursorPos).toEqual({ x: 1, y: 2 });
        expect(store.get().snapIndicator).toBeNull();
    });
    it('supports updater patches', () => {
        const store = createHFStore();
        store.set(prev => ({ compassState: { ...prev.compassState, accumulatedRotation: 90 } }));
        expect(store.get().compassState.accumulatedRotation).toBe(90);
    });
    it('notifies subscribers and unsubscribes cleanly', () => {
        const store = createHFStore();
        const listener = vi.fn();
        const unsub = store.subscribe(listener);
        store.set({ cursorPos: { x: 0, y: 0 } });
        expect(listener).toHaveBeenCalledTimes(1);
        unsub();
        store.set({ cursorPos: null });
        expect(listener).toHaveBeenCalledTimes(1);
    });
    it('useHFState subscribes components to store updates', () => {
        const store = createHFStore();
        const { result } = renderHook(() => useHFState(store));
        act(() => { store.set({ cursorPos: { x: 5, y: 6 } }); });
        expect(result.current.cursorPos).toEqual({ x: 5, y: 6 });
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run hooks/useHighFrequencyStore.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 store**

创建 `hooks/useHighFrequencyStore.ts`：

```ts
import { useSyncExternalStore } from 'react';
import { Point } from '../types';
import type { CompassState } from './useInteractionSession';

export type SnapIndicator = Point & { type?: 'endpoint' | 'midpoint' | 'center' | 'on_edge' };

export interface HFState {
    cursorPos: Point | null;
    snapIndicator: SnapIndicator | null;
    compassState: CompassState;
    compassPreviewPath: string | null;
    hoveredShapeId: string | null;
}

export const INITIAL_HF_STATE: HFState = {
    cursorPos: null,
    snapIndicator: null,
    compassState: { center: null, radiusPoint: null, startAngle: null, accumulatedRotation: 0, lastMouseAngle: 0 },
    compassPreviewPath: null,
    hoveredShapeId: null,
};

export const createHFStore = () => {
    let state = INITIAL_HF_STATE;
    const listeners = new Set<() => void>();
    const get = () => state;
    const set = (patch: Partial<HFState> | ((prev: HFState) => Partial<HFState>)) => {
        const p = typeof patch === 'function' ? patch(state) : patch;
        state = { ...state, ...p };
        listeners.forEach(l => l());
    };
    const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
    return { get, set, subscribe };
};

export type HFStore = ReturnType<typeof createHFStore>;

export const useHFState = (store: HFStore): HFState =>
    useSyncExternalStore(store.subscribe, store.get);
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run hooks/useHighFrequencyStore.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: useInteractionSession 委托 store**

`hooks/useInteractionSession.ts`：
- import 加 `useCallback` 与 `createHFStore, INITIAL_HF_STATE, HFStore, SnapIndicator`（from './useHighFrequencyStore'）。
- 删除 `snapIndicator/cursorPos/hoveredShapeId/compassState/compassPreviewPath` 五个 useState；`cursorPosRef` 保留。
- 加：

```ts
const hfStoreRef = useRef<HFStore | null>(null);
if (!hfStoreRef.current) hfStoreRef.current = createHFStore();
const hfStore = hfStoreRef.current;

const setCursorPos = useCallback((p: Point | null) => hfStore.set({ cursorPos: p }), [hfStore]);
const setSnapIndicator = useCallback((v: SnapIndicator | null) => hfStore.set({ snapIndicator: v }), [hfStore]);
const setHoveredShapeId = useCallback((v: string | null) => hfStore.set({ hoveredShapeId: v }), [hfStore]);
const setCompassPreviewPath = useCallback((v: string | null) => hfStore.set({ compassPreviewPath: v }), [hfStore]);
const setCompassState = useCallback((v: CompassState | ((prev: CompassState) => CompassState)) =>
    hfStore.set(prev => ({ compassState: typeof v === 'function' ? v(prev.compassState) : v })), [hfStore]);
```

- `resetSession`（已是 useCallback）body 中五个 setter 调用替换为：

```ts
hfStore.set({ cursorPos: null, snapIndicator: null, hoveredShapeId: null, compassState: INITIAL_HF_STATE.compassState, compassPreviewPath: null });
```

deps 改 `[hfStore]`；其余 ref 重置逐字保留。
- return 对象：移除五个值字段，加入 `hfStore`；setter 与其余字段不变。

`hooks/useInteractionSession.test.tsx`：所有对返回值的断言改为读 store，例如：
- `expect(result.current.snapIndicator).toBeNull()` → `expect(result.current.hfStore.get().snapIndicator).toBeNull()`
- `expect(result.current.cursorPos).toBeNull()` → `expect(result.current.hfStore.get().cursorPos).toBeNull()`
- `expect(result.current.compassState).toEqual(emptyCompass)` → `expect(result.current.hfStore.get().compassState).toEqual(emptyCompass)`
（18-19、25、66-67、70、87-88 行同样替换；`cursorPosRef` 断言不动。）

- [ ] **Step 6: usePointerHandlers 改 store 读取**

`hooks/usePointerHandlers.ts`：
- deps 接口（40、45 行附近）移除 `hoveredShapeId`、`compassState`、`compassPreviewPath` 三个值字段，加 `hfStore: HFStore`（import type from './useHighFrequencyStore'）；解构（103-104 行）同步。
- 五处读取点替换（setter 调用全部不变）：
  - getMousePos 内（134 行前）：`const hoveredShapeId = hfStore.get().hoveredShapeId;`
  - pointerdown COMPASS 分支（263 行）开头：`const compassState = hfStore.get().compassState;`
  - pointermove COMPASS 分支（339 行）开头：`const compassState = hfStore.get().compassState;`
  - hover 守卫（355 行前）：`const hoveredShapeId = hfStore.get().hoveredShapeId;`
  - pointerup COMPASS 分支（614 行）开头：`const { compassState, compassPreviewPath } = hfStore.get();`
- 完成后 `grep -n "compassState\|hoveredShapeId\|compassPreviewPath" hooks/usePointerHandlers.ts` 核对：除上述局部 const 与 setter 外不得有裸值读取。

- [ ] **Step 7: useKeyboardShortcuts 改 store 读取**

`hooks/useKeyboardShortcuts.ts`：deps 中 `compassState` 值字段换 `hfStore`；80 行 `compassState.center` → `hfStore.get().compassState.center`；effect deps 数组中 `compassState` 换 `hfStore`；setter 调用不变。

- [ ] **Step 8: CursorOverlays + Editor 接线**

创建 `components/editor/CursorOverlays.tsx`：

```tsx
import React from 'react';
import { ToolType } from '../../types';
import { useHFState, HFStore } from '../../hooks/useHighFrequencyStore';
import { CompassOverlay } from '../ConstructionTools';
import { ShapeRenderer } from '../ShapeRenderer';
import { SnapIndicator } from './SnapIndicator';
import { createRulerShape } from '../../utils/shapeFactory';

interface CursorOverlaysProps {
    store: HFStore;
    tool: ToolType;
    pixelsPerUnit: number;
    stroke: string;
    strokeWidth: number;
    selectedIds: Set<string>;
}

export const CursorOverlays = React.memo(({ store, tool, pixelsPerUnit, stroke, strokeWidth, selectedIds }: CursorOverlaysProps) => {
    const { cursorPos, compassState, compassPreviewPath, snapIndicator } = useHFState(store);
    return (<>
        {tool === ToolType.COMPASS && <CompassOverlay center={compassState.center} cursor={cursorPos || { x: 0, y: 0 }} radiusPoint={compassState.radiusPoint} isDrawing={!!compassState.startAngle} />}
        {tool === ToolType.RULER && selectedIds.size === 0 && (
            <g style={{ opacity: 0.35, pointerEvents: 'none' }}>
                <ShapeRenderer shape={createRulerShape('ghost-ruler', cursorPos || { x: 0, y: 0 })} isSelected={false} tool={tool} pixelsPerUnit={pixelsPerUnit} />
            </g>
        )}
        {compassPreviewPath && <path d={compassPreviewPath} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="4,4" opacity={0.6} />}
        {snapIndicator && <SnapIndicator indicator={snapIndicator} />}
    </>);
});
```

`components/Editor.tsx`：
- useInteractionSession 解构移除五个值字段，加 `hfStore`。
- 删除 JSX 中 CompassOverlay 块（157 行）、ghost ruler 块（158 行）、compassPreviewPath 块（159 行）、SnapIndicator 块（194 行），在原 CompassOverlay 位置替换为：

```tsx
<CursorOverlays store={hfStore} tool={tool} pixelsPerUnit={pixelsPerUnit} stroke={currentStyle.stroke} strokeWidth={currentStyle.strokeWidth} selectedIds={selectedIds} />
```

- usePointerHandlers 调用处：移除 `hoveredShapeId`/`compassState`/`compassPreviewPath` 值传参（setter 保留），加 `hfStore`。
- import CursorOverlays；移除因此不再使用的 import（CompassOverlay、SnapIndicator、createRulerShape 若仅此处使用）。

- [ ] **Step 9: 全量回归 + 复测**

Run: `npm test`
Expected: 全绿（Editor.transient.test.tsx 的 mid-drag DOM 断言不受影响——它们读 DOM 而非 React 状态）
Run: `npx vitest run test/perfSweep.test.tsx`
Expected: commits 大幅下降（Editor 不再每次 move 提交）；数据记入执行日志

- [ ] **Step 10: 提交**

```bash
git add hooks/useHighFrequencyStore.ts hooks/useHighFrequencyStore.test.ts components/editor/CursorOverlays.tsx hooks/useInteractionSession.ts hooks/useInteractionSession.test.tsx hooks/usePointerHandlers.ts hooks/useKeyboardShortcuts.ts components/Editor.tsx docs/superpowers/plans/2026-11-16-performance-execution-log.md
git commit -m "perf: isolate high-frequency cursor state into external store"
```

---

### Task 5: PDF 懒加载

**Files:**
- Modify: `utils/pdfImport.ts`, `utils/pdfImport.test.ts`, `hooks/useProjectFiles.ts:7,44-47,91-112`, `hooks/useProjectFiles.test.tsx:83-90,292+`
- Verify（预期无需改动）: `components/Editor.test.tsx`, `components/Editor.transient.test.tsx`（vi.mock 对动态 import 同样生效）

**Interfaces:**
- Consumes: 无前置任务依赖（可与 Task 2/3 并行，但按顺序执行）
- Produces: `ensurePdfReady(): Promise<typeof import('pdfjs-dist/build/pdf.mjs')>`（幂等，缓存 Promise；worker 构造失败仅 console.error 不抛错，与旧 initPdfWorker 语义一致）；`renderPdfToShapes` 签名不变；`initPdfWorker` 导出删除；useProjectFiles mount 不再初始化 worker。

- [ ] **Step 1: 重写 pdfImport.test.ts 头部与 ensurePdfReady 测试**

`utils/pdfImport.test.ts` 头部替换为（renderPdfToShapes 的 8 个测试 body 逐字保留，函数名不变）：

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShapeType } from '../types';

// Exact specifiers — must match Editor.test.tsx / Editor.transient.test.tsx / useProjectFiles.test.tsx.
vi.mock('pdfjs-dist/build/pdf.mjs', () => ({
    GlobalWorkerOptions: { workerPort: null },
    getDocument: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.mjs?worker', () => ({
    default: class MockPdfWorker {
        static failNext = false;
        constructor() {
            if (MockPdfWorker.failNext) {
                MockPdfWorker.failNext = false;
                throw new Error('worker construction failed');
            }
        }
    },
}));

let pdfjsLib: typeof import('pdfjs-dist/build/pdf.mjs');
let PdfWorker: any;
let ensurePdfReady: typeof import('./pdfImport').ensurePdfReady;
let renderPdfToShapes: typeof import('./pdfImport').renderPdfToShapes;

const pdfFile = () => new File(['%PDF-1.4 test'], 'doc.pdf', { type: 'application/pdf' });

const makePage = (width: number, height: number) => ({
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale, height: height * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
});

const mockPdf = (pages: ReturnType<typeof makePage>[]) => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve({
            numPages: pages.length,
            getPage: vi.fn((i: number) => Promise.resolve(pages[i - 1])),
        }),
    } as any);
};

const makeOpts = () => {
    let n = 0;
    return {
        logicalCanvasWidth: 1000,
        generateId: vi.fn(() => `pdf-shape-${++n}`),
        onProgress: vi.fn(),
    };
};

// resetModules 让 pdfImport 的模块级 readyPromise 每个测试重新初始化；
// mock 工厂随之重新执行，GlobalWorkerOptions 与 failNext 也是全新状态。
beforeEach(async () => {
    vi.resetModules();
    pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
    PdfWorker = (await import('pdfjs-dist/build/pdf.worker.mjs?worker')).default;
    ({ ensurePdfReady, renderPdfToShapes } = await import('./pdfImport'));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,page');
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('ensurePdfReady', () => {
    it('assigns workerPort and resolves the pdfjs module', async () => {
        const mod = await ensurePdfReady();
        expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBeInstanceOf(PdfWorker);
        expect(mod.getDocument).toBe(pdfjsLib.getDocument);
    });
    it('constructs the worker once across repeated calls', async () => {
        await ensurePdfReady();
        const first = pdfjsLib.GlobalWorkerOptions.workerPort;
        await ensurePdfReady();
        expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBe(first);
    });
    it('logs and swallows worker construction errors', async () => {
        PdfWorker.failNext = true;
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(ensurePdfReady()).resolves.toBeDefined();
        expect(errSpy).toHaveBeenCalledWith('Failed to initialize PDF worker:', expect.any(Error));
    });
});
```

原 `describe('initPdfWorker', ...)` 整块删除；原 `describe('renderPdfToShapes', ...)` 保留（其引用的 pdfjsLib/renderPdfToShapes 现在是 let 绑定，body 无需改动）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run utils/pdfImport.test.ts`
Expected: FAIL（ensurePdfReady 未导出）

- [ ] **Step 3: 实现 pdfImport 懒加载**

`utils/pdfImport.ts` 头部与 initPdfWorker 替换为：

```ts
import { Shape } from '../types';
import { createImageShape } from './shapeFactory';

// pdfjs is loaded lazily so the worker chunk stays out of the initial bundle.
// The two dynamic import specifiers below must stay byte-identical:
// Editor.test.tsx / Editor.transient.test.tsx / useProjectFiles.test.tsx mock these exact modules.

type PdfjsModule = typeof import('pdfjs-dist/build/pdf.mjs');

let readyPromise: Promise<PdfjsModule> | null = null;

export const ensurePdfReady = (): Promise<PdfjsModule> => {
    if (!readyPromise) {
        readyPromise = (async () => {
            const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
            try {
                // @ts-ignore
                const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.mjs?worker');
                pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();
            } catch (e) {
                console.error('Failed to initialize PDF worker:', e);
            }
            return pdfjsLib;
        })();
    }
    return readyPromise;
};
```

`renderPdfToShapes` 开头两行改为：

```ts
opts.onProgress('Loading PDF...');
const pdfjsLib = await ensurePdfReady();
const arrayBuffer = await file.arrayBuffer();
```

其余 body 逐字不动（`pdfjsLib.getDocument` 现在指向动态引入的模块）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run utils/pdfImport.test.ts`
Expected: PASS（3 + 8 tests）

- [ ] **Step 5: useProjectFiles 去 mount 加载 + 动态 import**

`hooks/useProjectFiles.ts`：
- 删除第 7 行 `import { initPdfWorker, renderPdfToShapes } from '../utils/pdfImport';`
- 删除 44-47 行 mount effect（含注释）。
- `processPdfFile` try 块第一行加：

```ts
const { renderPdfToShapes } = await import('../utils/pdfImport');
```

（import 失败会落入现有 catch：console.error + alert("Failed to load PDF file.")，finally 清 loadingState——保持现状。）

- [ ] **Step 6: 更新 useProjectFiles.test.tsx**

mount describe（83-90 行）第一个测试替换为：

```ts
it('does not initialize the PDF worker on mount and exposes a file input ref', () => {
    const { hook } = setup();
    expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBeNull();
    expect(hook.result.current.fileInputRef.current).toBeNull();
    expect(hook.result.current.loadingState).toEqual({ active: false, message: '' });
    expect(hook.result.current.saveMessage).toBeNull();
});
```

注意：此断言依赖文件内测试顺序——mount describe 必须先于任何 processPdfFile 测试执行（现有顺序已满足，勿调整 describe 顺序）。

`describe('useProjectFiles.processPdfFile', ...)` 内追加：

```ts
it('initializes the PDF worker lazily during import', async () => {
    mockPdfPages(1);
    const { hook } = setup();
    await act(async () => { await hook.result.current.processPdfFile(pdfFile()); });
    expect(pdfjsLib.GlobalWorkerOptions.workerPort).toBeInstanceOf(PdfWorker);
});
```

- [ ] **Step 7: 全量回归（含两个 Editor 测试文件的 mock 验证）**

Run: `npm test`
Expected: 全绿。Editor.test.tsx / Editor.transient.test.tsx 的 vi.mock 对动态 import 生效，预期零改动；若有失败，检查其 PDF 相关测试是否断言 mount 时 workerPort（grep 确认无此断言），按 Step 6 同样模式修正。

- [ ] **Step 8: 构建验证 + 提交**

Run: `npm run build`
Expected: 成功；dist/assets 出现独立的 pdf 懒 chunk 与 pdf.worker chunk

```bash
git add utils/pdfImport.ts utils/pdfImport.test.ts hooks/useProjectFiles.ts hooks/useProjectFiles.test.tsx
git commit -m "perf: lazy-load pdfjs and defer worker init to first PDF import"
```

---

### Task 6: App 模式窗口懒加载

**Files:**
- Modify: `App.tsx`
- Create: `App.test.tsx`

**Interfaces:**
- Consumes: Task 1 已改过的 App.tsx（profileEnabled 分支保留）
- Produces: SolverWindow/SnippetOverlay 经 React.lazy + Suspense 加载；编辑器模式不加载这两个 chunk

- [ ] **Step 1: 写失败测试**

创建 `App.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

vi.mock('./components/Editor', () => ({ Editor: () => <div>editor-stub</div> }));
vi.mock('./components/SolverWindow', () => ({ SolverWindow: () => <div>solver-stub</div> }));
vi.mock('./components/SnippetOverlay', () => ({ SnippetOverlay: () => <div>snippet-stub</div> }));
vi.mock('./utils/exportUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./utils/exportUtils')>();
    return { ...actual, isElectron: vi.fn(() => false) };
});

const setMode = (mode: string | null) => {
    window.history.replaceState({}, '', mode ? `/?mode=${mode}` : '/');
};

beforeEach(() => { setMode(null); });

describe('App mode routing', () => {
    it('renders Editor by default', () => {
        render(<App />);
        expect(screen.getByText('editor-stub')).toBeTruthy();
    });
    it('lazy-loads SolverWindow in solver mode', async () => {
        setMode('solver');
        render(<App />);
        expect(screen.queryByText('solver-stub')).toBeNull();
        await waitFor(() => expect(screen.getByText('solver-stub')).toBeTruthy());
    });
    it('lazy-loads SnippetOverlay in snippet mode', async () => {
        setMode('snippet');
        render(<App />);
        expect(screen.queryByText('snippet-stub')).toBeNull();
        await waitFor(() => expect(screen.getByText('snippet-stub')).toBeTruthy());
    });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run App.test.tsx`
Expected: 两个 lazy 测试 FAIL（静态 import 下 stub 立即出现，`queryByText(...)).toBeNull()` 不成立）

- [ ] **Step 3: 实现 React.lazy**

`App.tsx`：
- 第 1 行改 `import { useEffect, useLayoutEffect, lazy, Suspense } from 'react';`
- 删除 `import { SnippetOverlay } from './components/SnippetOverlay';` 与 `import { SolverWindow } from './components/SolverWindow';`
- import 区后加：

```tsx
const SolverWindow = lazy(() => import('./components/SolverWindow').then(m => ({ default: m.SolverWindow })));
const SnippetOverlay = lazy(() => import('./components/SnippetOverlay').then(m => ({ default: m.SnippetOverlay })));
```

- 两个模式返回改：

```tsx
if (isSnippetMode) return <Suspense fallback={null}><SnippetOverlay /></Suspense>;
if (isSolverMode) return <Suspense fallback={null}><SolverWindow /></Suspense>;
```

- profileEnabled 分支（Task 1）保持不变。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `npx vitest run App.test.tsx`
Expected: PASS（3 tests）
Run: `npm test`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add App.tsx App.test.tsx
git commit -m "perf: lazy-load solver and snippet mode windows"
```

---

### Task 7: Build 核对 + 全量回归 + 验收

**Files:**
- Modify: `docs/superpowers/plans/2026-11-16-performance-execution-log.md`
- Verify: `dist/` 产物、浏览器与 Electron 运行态

**Interfaces:**
- Consumes: 前序全部任务的产物
- Produces: 最终验收结论（执行日志）

- [ ] **Step 1: 生产构建**

Run: `npm run build`
Expected: tsc + vite 成功

- [ ] **Step 2: 主 chunk 体积断言**

Run:

```bash
node -e "
const fs = require('fs');
const files = fs.readdirSync('dist/assets').filter(f => f.startsWith('index-') && f.endsWith('.js'));
const size = files.reduce((n, f) => n + fs.statSync('dist/assets/' + f).size, 0);
console.log('main chunk bytes:', size);
if (size > 600 * 1024) { console.error('FAIL: main chunk exceeds 600KB'); process.exit(1); }
console.log('PASS');
"
```

Expected: PASS（≤ 600KB）

- [ ] **Step 3: worker/pdfjs 不在首屏 chunk**

Run: `grep -l "pdf.worker" dist/assets/*.js`
Expected: 只列出 pdf 懒 chunk 与 pdf.worker 文件本身，不含 `index-*.js`
Run: `grep -c "GlobalWorkerOptions" dist/assets/index-*.js`
Expected: 0（pdfjs 不在主 chunk）

- [ ] **Step 4: 全量测试 + 覆盖率**

Run: `npm run test:coverage`
Expected: 全绿；statements ≥ 81%、branches ≥ 76%（不低于基线）

- [ ] **Step 5: 最终量化 + 浏览器复核**

Run: `npx vitest run test/perfSweep.test.tsx`
记录最终 headless 数据到执行日志。

浏览器复核（需要人工或 run skill 驱动，subagent 无浏览器工具时交回主会话）：
1. `npm run dev`，打开 `http://localhost:5273/?profile=1&stress=200`
2. 控制台执行 `await __runSweep()`，记录 console.table 的 avgMs（真实浏览器阈值 ≤ 2ms 在此复核）
3. Network 面板确认启动未请求 pdf.worker；打开一个 PDF 后才请求

- [ ] **Step 6: 手动回归清单（浏览器 + Electron 冒烟）**

逐项验证（spec §3）：
- [ ] 各工具绘制（点/线/矩形/正方形/三角/圆/椭圆/文本/自由笔/函数）
- [ ] 拖拽/缩放/旋转：拖拽中 overlay 跟随、松手精确归位
- [ ] 约束联动：点在线上、圆 paramAngle 旋转后不跳回
- [ ] 吸附指示器（端点/中点/圆心）
- [ ] 橡皮擦、自由笔压感开关
- [ ] 文本/LaTeX 编辑（KaTeX 渲染无回归）
- [ ] PDF 导入：进度提示、多页、Lock BG 默认开启、穿透选择
- [ ] undo、.geo 保存/加载、zoom、多选组变换
- [ ] 圆规画弧、直尺 pivot（Alt）、镜像、角标记
- [ ] `?mode=solver` 打开 MathSolver
- [ ] Electron：`npm run electron:dev`，文件打开/保存、Ctrl/Cmd+Alt+C snippet

- [ ] **Step 7: 填写验收结论 + 提交**

执行日志「最终」节填入：浏览器实测 avgMs、主 chunk 体积、验收结论（渲染指标 + 体积指标 + 回归结果）。

```bash
git add docs/superpowers/plans/2026-11-16-performance-execution-log.md
git commit -m "docs: record final performance acceptance measurements"
```

若回归发现缺陷：修复后重跑 Step 4-6，单独 commit（fix: ...），再更新日志。