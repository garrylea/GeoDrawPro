# GeoDraw Pro 性能优化设计（渲染 + Bundle）

日期：2026-11-16
状态：已与用户逐节确认

## 背景与现状

S0–S9 结构拆分已完成：Editor 从巨型组件降至 227 行，逻辑分散到 hooks 与 utils，测试覆盖约 82%（分支 77%）。本轮聚焦两个可量化的性能问题，不做结构重构。

核查确认的事实：

1. 高频状态（`cursorPos`、`snapIndicator`、`compassState`、`compassPreviewPath` 等）位于 `useInteractionSession`，由 Editor 顶层持有。非 SELECT 工具激活时每次 pointermove 都触发 `setCursorPos`（usePointerHandlers.ts:327），引起 Editor 整棵树重渲染；COMPASS 绘制时每帧额外 set compassState/compassPreviewPath。SELECT 工具的 hover 检测有 50ms 节流 + 变更守卫，纯移动重渲染较少。
2. `ShapeRenderer` 已有 `React.memo`（ShapeRenderer.tsx:14）；`PropertiesPanel` 已有 `React.memo`（PropertiesPanel.tsx:129），但 Editor.tsx:206 每次渲染传入新对象 `canvasSize={{...}}`，浅比较永远不等，memo 实际失效。
3. TopBar、Sidebar、AxisLayer、PageBreaks、SelectionOverlay、CompassOverlay、SnapIndicator 均未 memo。AxisLayer 的网格/刻度线是每次光标移动时最大的重复渲染源。
4. 多处回调每次渲染重建：`undo`/`deleteSelected`/`clearAll`（useDocument.ts:51-58）、`handleZoomChange`（useViewport.ts:45）、`handleSave`/`handleSaveAs`（useProjectFiles.ts:69-70）、Editor JSX 内联回调、`generateId`（Editor.tsx:89）。
5. 产物为单一主 chunk 910KB（dist/assets/index-*.js），另有 pdf.worker 1.34MB。`initPdfWorker()` 挂在 mount effect（useProjectFiles.ts:44-47），worker 在启动时即加载，即使用户从不打开 PDF。
6. pdfjs 经 `utils/pdfImport.ts` 顶部静态 import 进入主 chunk；`SolverWindow`/`SnippetOverlay` 在 App.tsx 静态 import，但只在 `?mode=solver/snippet` 窗口使用。
7. KaTeX 在 ShapeRenderer.tsx:2 静态 import，是 LaTeX 文本的核心同步渲染路径。

## 范围

本轮只做：

- 渲染性能优化（memo + props 稳定化，条件触发的光标状态隔离）
- Bundle 功能级懒加载（pdfjs/worker、SolverWindow/SnippetOverlay）

明确不做（另开一轮）：S10 结构拆分（usePointerHandlers/PropertiesPanel）、测试补强 electron/server、自动保存、界面汉化、KaTeX 懒加载、manualChunks vendor 拆分、新增 error boundary。

## §1 渲染性能优化

目标：纯光标移动（未绘制、未改选区）不再触发整棵组件树重渲染。

### 阶段 A：memo + props 稳定化（必做）

回调稳定化：

| 位置 | 改动 |
|---|---|
| useDocument.ts:51-58 | `undo`（deps: history）、`deleteSelected`（deps: selectedIds, saveHistory）、`clearAll`（deps: saveHistory）包 useCallback |
| useViewport.ts:45 | `handleZoomChange` 包 useCallback |
| useProjectFiles.ts:69-70 | `handleSave`/`handleSaveAs` 包 useCallback（deps: persistProject, shapes） |
| Editor.tsx:89, 102 | `generateId`、`isTool` 是纯函数，移到模块级 |
| Editor.tsx JSX | SelectionOverlay 的 onResizeStart/onRotateStart/onSetPivot/onMarkAngle/onAngleChange/onAngleDoubleClick（单选与组选两版，含组选三个 no-op 回调）、onDrop、文件 input onChange、handleToolChange、setPressureEnabled 全部 useCallback 化 |

对象 prop 稳定化：

- Editor.tsx:154 `overrideOrigin={{...}}` → useMemo（deps: canvasSize.width, originY）
- Editor.tsx:206 `canvasSize={{...}}` → useMemo（deps: canvasSize.width, svgHeight），修复 PropertiesPanel 失效的 memo
- Editor.tsx:143 `groupBounds` → useMemo（deps: shapes, selectedIds）；Editor.tsx:193 组选 `shape={{...}}` 字面量 → 由 groupBounds 派生的 useMemo，否则 SelectionOverlay 的 memo 永不命中

补 React.memo：TopBar、Sidebar、AxisLayer、PageBreaks、SelectionOverlay、CompassOverlay、SnapIndicator。

与瞬态 DOM 引擎的安全边界：SelectionOverlay memo 后拖拽期间不再重渲染（props 不变），这是期望行为——拖拽视觉由 `useTransientTransforms` 直写 DOM 驱动，松手时 shapes 变化触发 React 调和。GEMINI.md bug #11（overlay 脱节）属同类问题，回归必须覆盖"拖拽中 overlay 跟随、松手后精确归位"。memo 不得阻断任何合法更新：shapes/selection/tool/zoom 变化时相关组件必须照常重渲染。

### 阶段 B：光标状态隔离（条件触发）

触发条件：阶段 A 完成后，200 图形压力场景下量化验收未达标（即平均 commit > 2ms 且降幅 < 80%）。

做法：把 `cursorPos`/`snapIndicator`/`compassState`/`compassPreviewPath` 移入 ref + useSyncExternalStore 的外部存储，仅 CompassOverlay、ghost ruler、SnapIndicator 订阅；`hoveredShapeId` 无渲染消费者，直接降级为 ref。Editor 只在结构性变化时渲染。达标则不做。

### 测量工具（dev-only，保留）

- `?profile=1`：用 `<Profiler>` 包住 Editor 子树，统计 commit 次数与 actualDuration，输出 console.table。仅在 `import.meta.env.DEV` 下生效。同时暴露 `window.__runSweep()`：先切换到 LINE 工具并确认未在绘制（无 activeShapeId，此时每次移动触发 setCursorPos 且无结构性更新），再沿画布对角线程序化派发 100 次 pointermove（间隔一帧），结束后输出本次扫过的 commit 统计，保证基线与改后测量可复现。不用 SELECT 工具做 sweep：其 hover 有节流 + 变更守卫，commit 近零，基线会失真。
- `?stress=N`：mount 时确定性地注入 N 个混合图形（线段/三角形/圆/文本，固定随机种子），用于压力场景。仅 DEV 生效。
- 两个 harness 体量小、有门控，落地后保留供后续性能工作使用。

## §2 Bundle 拆分

目标：主 chunk 910KB → 约 550KB（验收上限 600KB）；pdf.worker 1.34MB 完全推迟到首次打开 PDF。

1. **pdfImport.ts 懒加载**
   - 移除顶部静态 import（`pdfjs-dist/build/pdf.mjs`、`pdfjs-dist/build/pdf.worker.mjs?worker`），改为函数内动态 import，模块级缓存 Promise。
   - `initPdfWorker` 改为异步 `ensurePdfReady()`：动态引入 pdfjs + worker 并设置 `GlobalWorkerOptions.workerPort`，幂等；由 `renderPdfToShapes` 内部 await。
   - 连带改动：Editor.test.tsx 与 Editor.transient.test.tsx（12-18 行）都 mock 了这两条精确 specifier，`vi.mock` 对动态 import 同样生效但写法需同步调整；pdfImport.test.ts 的 `initPdfWorker` 同步吞错断言（60-70 行）与异步 ensurePdfReady 冲突，需重写为幂等 + 异步错误处理语义（显式任务项）。

2. **useProjectFiles.ts 去启动加载**
   - 删除 mount 时的 `initPdfWorker()` effect（useProjectFiles.ts:44-47）。
   - 对 pdfImport 的静态 import 改为 `processPdfFile` 内动态 import，整个 PDF 管线进懒 chunk。

3. **App.tsx 模式窗口懒加载**
   - `SolverWindow`/`SnippetOverlay` 改 `React.lazy`（命名导出：`.then(m => ({ default: m.X }))`），Suspense fallback 为 null。
   - 编辑器模式下这两个 chunk 永不加载；`?mode=solver/snippet` 窗口按需加载。

4. **KaTeX 不动**：同步渲染路径与入口 CSS 保持原样。

5. **错误处理**：动态 import 失败走 `processPdfFile` 现有 catch（console.error + alert("Failed to load PDF file.")），finally 清 loadingState；保持现状，不新增错误 UI 或 error boundary。

6. **验证**：`npm run build` 核对 chunk 构成（预期：主 ~550KB，pdfjs ~350KB 懒，worker 1.34MB 懒，solver/snippet 小 chunk 懒）；浏览器确认启动时不请求 worker chunk，打开 PDF 时才请求；手动走 PDF 导入全流程（进度提示、多页、Lock BG 默认开启）。

代价：首次打开 PDF 多一次懒 chunk 加载（Electron 本地几乎无感，Web 部署几百毫秒），换取所有用户首屏提速。

## §3 测试与验收

### 自动化测试

- 现有套件全部保持绿（`npm test`）。
- 新增/调整：
  - pdfImport：mock 动态 import，验证 `ensurePdfReady` 幂等、`renderPdfToShapes` 行为不变。
  - useProjectFiles：mount 不再初始化 worker；`processPdfFile` 正确走懒加载管线。
  - App：solver/snippet 模式 lazy 渲染。
  - Editor.test.tsx 与 Editor.transient.test.tsx 的 pdfjs mock 同步调整；pdfImport.test.ts 的 initPdfWorker 断言重写为 ensurePdfReady 语义。
- 不为"渲染次数"写脆弱断言，性能交给量化测量。

### 量化验收（200 图形压力场景）

- 基线：改动前用 `?profile=1&stress=200` 执行 `window.__runSweep()`（LINE 工具空闲态，100 次 pointermove），记录 commit 次数与平均耗时。
- 改后同场景复测。目标：平均 commit ≤ 2ms 或降幅 ≥ 80%。数据写入 plan 执行记录。
- 不达标 → 触发 §1 阶段 B；达标则不做。

### 手动回归清单（浏览器 + Electron 冒烟）

- 各工具绘制；拖拽/缩放/旋转，重点验证拖拽中 overlay 跟随、松手后精确归位。
- 约束联动（点在线上、圆 paramAngle）、吸附指示器。
- 橡皮擦、自由笔压感、文本/LaTeX 编辑。
- PDF 导入全流程（懒加载路径）、Lock BG 穿透选择。
- undo、.geo 保存/加载、zoom、多选组变换、圆规、直尺 pivot、镜像、角标记。
- `?mode=solver` 打开 MathSolver；Electron 文件打开/保存、snippet 模式。

## 执行策略

plan 写好后由 subagent 逐项执行，每项含实现 + 测试 + 验证，审查通过再下一项。任务按依赖排序：

1. 测量 harness（?profile / ?stress）+ 基线数据
2. 回调/对象 prop 稳定化
3. 补 memo + 量化对比（判定是否触发阶段 B）
4. （条件）光标状态隔离
5. PDF 懒加载（pdfImport + useProjectFiles + 测试 mock 调整）
6. App 模式窗口懒加载
7. build 核对 + 全量回归

## 风险与边界

- 瞬态 DOM 引擎依赖 React 调和时机：memo 化后必须验证拖拽/约束联动无脱节（GEMINI.md bug #1/#2/#11 同类）。
- useCallback deps 错误会导致 stale closure：每个回调的 deps 需逐一核对，测试覆盖行为而非实现。
- pdfjs mock specifier 变更影响现有测试：作为显式任务项处理，不顺手改。
- 懒加载在 Electron file:// 协议下的 chunk 路径：vite `base: './'` 已配置，build 后需在 Electron 冒烟确认。