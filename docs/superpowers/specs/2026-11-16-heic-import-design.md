# HEIC 拖放导入设计

日期：2026-11-16
状态：已与用户逐节确认

## 背景与问题

用户把 macOS 上的 `.heic` 拖进白板没有任何反应。核查后的两条断点：

1. **入口分流按 MIME 判断**（`components/Editor.tsx:207`）：

   ```ts
   else if (file.type.startsWith('image/')) { processImageFile(...) }
   ```

   从 Finder 拖出的 HEIC 经常 `file.type === ''`，无法命中图片分支，直接落到 `.geo/.json` 分支后什么也不做。

2. **即使进入图片分支也解码不了**（`hooks/useProjectFiles.ts:66-82`）：现有链路是
   `FileReader.readAsDataURL → new Image() → img.onload`。Chromium 与 SVG `<image>`
   （`components/ShapeRenderer.tsx:229`）都没有 HEIC 解码器，`onload` 永不触发，而代码没有
   `onerror`，因此完全静默。

HEIC 必须在进入渲染层之前完成解码。

## 目标

- macOS 桌面版：拖放或文件选择 `.heic/.heif`，自动转成 PNG 后插入白板
- 转换结果直接作为 `shape.imageUrl` 持久化，重开项目不再需要转换
- 所有失败场景都有可见反馈，不再静默
- 不引入 npm 依赖，不影响主 chunk 体积

## 非目标

- 浏览器 dev 模式的 HEIC 解码（明确提示不支持）
- Windows / Linux 的 HEIC 转换（明确提示不支持）
- 剪贴板中的 HEIC 文件、多文件批量拖放（当前只取第一个文件）
- 普通 PNG/JPEG 的降采样或格式归一化
- 已存在项目文件中 HEIC data URL 的迁移
- Electron 32+ 的 bytes-over-IPC 传输（见风险）

## 方案选择

解码层已确认放在 Electron 主进程，使用 macOS 自带 `sips`。落地方式三选一：

| 方案 | 做法 | 结论 |
|---|---|---|
| **A** | 渲染进程把 `File.path` 经 IPC 交给主进程，主进程转换后回传 data URL | **采用**。Electron 31 的 `File.path` 在拖放和文件选择器场景都可靠；HEIC 字节不需要过 IPC |
| B | 渲染进程读 `arrayBuffer` 传给主进程，主进程落临时文件再转 | 兼容 Electron 32+，但多一次大块数据拷贝，当前版本无收益 |
| C | 渲染进程直接 `require('child_process')` 调用 sips | 省 IPC，但把 OS 进程调用放进渲染层，职责错位且难测试 |

## 模块设计

### 新增 `utils/heicImport.ts`

纯函数 + 一次 IPC 调用，不依赖 React，不接触 shapes。

```ts
export class HeicImportError extends Error {}

/** .heic/.heif（忽略大小写）或 type 为 image/heic | image/heif */
export const isHeicFile = (file: File): boolean;

/** file.type.startsWith('image/') || isHeicFile(file) */
export const isImageFile = (file: File): boolean;

/** 成功返回 data:image/png;base64,...；失败抛 HeicImportError（文案可直接展示） */
export const convertHeicToPngDataUrl = async (file: File): Promise<string>;
```

`convertHeicToPngDataUrl` 的行为：

1. `window.require` 不存在 → 抛 `HEIC 图片仅支持在桌面版导入，请先转换为 PNG/JPEG`
2. `(file as any).path` 为空 → 抛 `无法读取文件路径，请改用“打开文件”按钮导入`
3. `ipcRenderer.invoke('CONVERT_HEIC', { filePath })`
4. `result.success === false` → 按 `result.code` 映射文案
5. 返回 `result.dataUrl`

主进程只返回机器码，所有用户可见文案集中在渲染层，便于统一修改和测试。

### 主进程 `electron/main.js`

新增 `ipcMain.handle('CONVERT_HEIC', ...)`：

1. `process.platform !== 'darwin'` → 立即返回 `UNSUPPORTED_PLATFORM`，不做任何文件操作
2. 入参 `{ filePath }`；校验扩展名 `.heic/.heif`（忽略大小写）且 `fs.existsSync`，不满足直接返回
   `NOT_FOUND`，避免把任意路径交给 sips
3. `fs.mkdtempSync(path.join(os.tmpdir(), 'geodraw-heic-'))` 创建独立临时目录
4. 执行：

   ```js
   execFile('/usr/bin/sips',
     ['-s', 'format', 'png', '-Z', '2048', '--out', outPath, filePath],
     { timeout: 30000 })
   ```

   - `-Z 2048`：只缩不放，长边不超过 2048
   - 输出固定 PNG，保留透明通道（用户已确认此规格）
   - 使用参数数组而非 shell 字符串，避免注入
5. 读取 `outPath` → `data:image/png;base64,${buf.toString('base64')}`
6. `finally` 中 `fs.promises.rm(tmpDir, { recursive: true, force: true })`，成功失败都清理
7. 返回 `{ success: true, dataUrl }` 或 `{ success: false, code }`

错误码：

| code | 含义 |
|---|---|
| `UNSUPPORTED_PLATFORM` | `process.platform !== 'darwin'` |
| `NOT_FOUND` | 路径不存在或扩展名不符 |
| `CONVERT_FAILED` | sips 非零退出、超时或产物不可读 |

多帧 HEIC（Live Photo / 连拍）由 sips 取主图，不做额外处理。

### `hooks/useProjectFiles.ts`

- 抽出 `addImageShapeFromUrl(url: string, position?: Point): Promise<void>`：即现有
  `img.onload` 内的逻辑（长边 300 显示尺寸、按落点/画布中心定位、`createImageShape`、选中、
  切 SELECT）。Promise 在 `onload` 与 `onerror` 两条路径都会 resolve，保证 HEIC 分支的遮罩
  在插入结束（或失败提示已设置）后才关闭
- 为该 `Image` 增加 `onerror`，失败时设置 `importError`（修复现有静默失败）
- `processImageFile` 改为 async：

  ```ts
  if (isHeicFile(file)) {
      setLoadingState({ active: true, title: 'Importing Image', message: '正在转换 HEIC 图片…' });
      try { await addImageShapeFromUrl(await convertHeicToPngDataUrl(file), position); }
      catch (e) { setImportError(e instanceof HeicImportError ? e.message : 'HEIC 转换失败，文件可能已损坏'); }
      finally { setLoadingState({ active: false, message: '' }); }
      return;
  }
  // 原 FileReader 路径 → addImageShapeFromUrl(url, position)
  ```

  普通图片路径行为保持不变。
- `loadingState` 类型增加可选 `title?: string`
- 新增 `importError: string | null`，设置后 4 秒自动清空；新错误覆盖旧错误并重置计时器；
  计时器存入 ref，卸载时清理，避免卸载后 setState
- 返回值增加 `importError`

### `components/editor/StatusToasts.tsx`

- `loadingState` 增加可选 `title`，渲染 `title ?? 'Importing PDF'`，现有 PDF 行为与测试不变
- 新增 `errorMessage` prop：红色 toast，位置与样式对齐现有 `saveMessage`，但下移一档
  （`top-32`），避免与保存成功提示同时出现时重叠

### `components/Editor.tsx`

| 位置 | 改动 |
|---|---|
| `:207` `handleDrop` | `file.type.startsWith('image/')` → `isImageFile(file)` |
| `:216` `handleFileInputChange` | 同上 |
| `:274` 隐藏 input | `accept=".geo,.json,.pdf,image/*,.heic,.heif"` |
| `:276` `StatusToasts` | 传入 `errorMessage={importError}` |
| `:105` 解构 | 增加 `importError` |

拖放时的落点坐标计算（`e.clientX - rect.left`）沿用现状；HEIC 转换是异步的，但坐标在
`handleDrop` 里同步捕获后传入，转换耗时不影响落点。

## 数据流

```
拖放 (Editor.tsx:203) / 文件选择 (Editor.tsx:212)
  └─ isImageFile(file)?
       ├─ 否 → 现有 .geo/.json 分支
       └─ 是 → processImageFile(file, position?)
             ├─ isHeicFile
             │    ├─ setLoadingState(title='Importing Image')
             │    ├─ CONVERT_HEIC → sips -Z 2048 → PNG → dataURL
             │    │    └─ 失败 → importError toast，无 shape、无历史写入
             │    └─ addImageShapeFromUrl(dataUrl, position)
             └─ 普通图片 → FileReader.readAsDataURL → addImageShapeFromUrl
                   └─ new Image()
                        ├─ onload  → createImageShape → setShapes
                        └─ onerror → importError toast
```

转换产物随 `shape.imageUrl` 写入 `.geo`，项目重开时是普通 PNG data URL，走现有渲染路径。

## 错误处理

| 场景 | 用户看到 |
|---|---|
| 浏览器 dev（无 `window.require`） | `HEIC 图片仅支持在桌面版导入，请先转换为 PNG/JPEG` |
| Windows / Linux 桌面版 | `当前平台暂不支持 HEIC 转换（仅 macOS）` |
| 拿不到 `File.path` | `无法读取文件路径，请改用“打开文件”按钮导入` |
| 路径不存在 / 扩展名不符 | `找不到 HEIC 文件，请重新拖入` |
| sips 非零退出 / 超时 / 产物不可读 | `HEIC 转换失败，文件可能已损坏` |
| 转换结果无法解码 | `无法解码转换后的图片` |

失败时一律：不调用 `setShapes`、不调用 `saveHistory`、临时目录已清理、加载遮罩关闭。

## 测试

| 文件 | 用例 |
|---|---|
| `utils/heicImport.test.ts`（新增） | `isHeicFile`：`.heic/.HEIC/.heif`、`image/heic`、普通 png 返回 false；`isImageFile` 覆盖空 type 的 HEIC；转换成功返回 dataURL；无 electron、无 path、IPC 返回各错误码时抛出对应文案 |
| `hooks/useProjectFiles.test.tsx` | mock `utils/heicImport`：HEIC 分支调用转换器、生成 IMAGE shape、`imageUrl` 为 dataURL、选中并切 SELECT；转换失败不调 `setShapes`、设置 `importError`；`loadingState` 开→关；普通 PNG 两条既有用例回归 |
| `components/editor/StatusToasts.test.tsx` | 自定义 `title` 渲染；`errorMessage` 渲染；未传时不渲染；`'Importing PDF'` 默认标题用例保持不变 |
| `components/Editor.test.tsx` | 保持现有断言；不为拖放新增重量级集成测试，入口分流由 `isImageFile` 单测覆盖 |

主进程 `CONVERT_HEIC` 没有测试基建（`electron/main.js` 不在 vitest 范围），列入手工验收。

## 手工验收

1. `npm run electron:dev`，从 Finder 拖一张 iPhone 拍摄的 `.heic` 到画布任意位置：
   出现 `Importing Image` 遮罩，随后图片在落点生成并选中，长边 ≤ 2048
2. 保存为 `.geo`，用编辑器打开确认 `imageUrl` 以 `data:image/png;base64,` 开头；重开项目正常显示
3. 用 TopBar 的打开按钮选择同一 `.heic`，结果一致
4. 把损坏/改名为 `.heic` 的文本文件拖入：红色 toast，画布无变化，撤销栈无新增
5. 浏览器 `npm run dev` 下拖入 `.heic`：提示仅桌面版支持
6. `ls $TMPDIR | grep geodraw-heic` 为空，确认临时目录已清理

## 风险与缓解

| 风险 | 说明与缓解 |
|---|---|
| 大图耗时 | 12MP HEIC 单张转换约数百毫秒，用加载遮罩兜底；sips 超时 30s |
| 项目文件膨胀 | PNG 长边 2048 单图约 3–8MB，base64 后更大；这是用户已确认的取舍。若后续不可接受，改为 JPEG 或更小长边只需调 sips 参数 |
| `File.path` 在 Electron 32+ 被移除 | 当前锁 `^31`；升级时需改用方案 B（bytes IPC）。拿不到 path 时现阶段已给出明确提示 |
| sips 不存在或路径不同 | 仅 macOS 有 `/usr/bin/sips`，非 darwin 提前返回 `UNSUPPORTED_PLATFORM` |
| 多帧 HEIC | sips 取主图；不做多帧选择，符合单图导入语义 |
