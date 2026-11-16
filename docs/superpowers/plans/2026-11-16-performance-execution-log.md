# 性能优化执行记录

测量入口：`npx vitest run test/perfSweep.test.tsx`（jsdom，stress=200，LINE 空闲态 100 次 pointermove）。
jsdom 的 actualDuration 与真实浏览器有差异；降幅指标在同环境前后对比有效，2ms 绝对阈值在 Task 7 用浏览器 `?profile=1&stress=200` + `__runSweep()` 复核。

注：perfSweep 测试中 sweep 在 act 作用域外执行（临时关闭 `IS_REACT_ACT_ENVIRONMENT`，结束后恢复）。
React 18 在单个 `act()` 内会把全部 commit 推迟到 act 退出时一次性 flush（collector 读到 0、100 次 move 合并成 1 个 commit），
无法测得"每次 move 一个 commit"；关闭 act 标志后每次 move 经正常调度器在 16ms 间隙内 flush，与浏览器行为一致。断言（90–120 commits、avgMs > 0）未改动。

## 基线（Task 1，优化前）
- commits: 100
- totalMs: 264.2461269999774
- avgMs: 2.6424612699997736

（首次成功运行实测；同环境复跑 3 次均为 100 commits，avgMs 介于 2.62–2.73，波动来自 jsdom 计时噪声。）

## 阶段 A 后（Task 3 填写）

测量方法：因先前观察到 jsdom avgMs 存在机器负载噪声（跨会话 2.6–4.6），采用同机同状态配对测量：
在 45c76b1（稳定化前基线）建临时 detached worktree（`/tmp/geodraw-perf-baseline`，node_modules 符号链接共享），
基线与 memo 后各连续跑 3 次 `npx vitest run test/perfSweep.test.tsx`，取中位数计算降幅。测毕已删除该临时 worktree。

基线 worktree（45c76b1，3 次全部 100 commits）：
- run 1: totalMs 264.02940399998204, avgMs 2.6402940399998203
- run 2: totalMs 268.5822979999566, avgMs 2.685822979999566
- run 3: totalMs 246.44123900004809, avgMs 2.464412390000481
- avgMs 中位数 2.6403（范围 2.4644–2.6858）

memo 后（当前树，3 次全部 100 commits）：
- run 1: totalMs 139.3951490000244, avgMs 1.3939514900002439
- run 2: totalMs 130.96757199997796, avgMs 1.3096757199997797
- run 3: totalMs 144.83011200000226, avgMs 1.4483011200000226
- avgMs 中位数 1.3940（范围 1.3097–1.4483）

- commits / totalMs / avgMs: 100 / 139.395（中位数 run）/ 1.3940（中位数）
- 降幅（avgMs，配对中位数）: (2.6403 − 1.3940) / 2.6403 ≈ 47.2%
- 参考：Task 1 存档基线 avgMs 2.6425，对它的降幅 ≈ 47.2%（与配对结果一致，本次机器状态与 Task 1 时相近）
- Task 4 触发判定（avgMs > 2 且降幅 < 80% → 触发）: **SKIP TASK 4**。
  规则「平均 commit ≤ 2ms 或降幅 ≥ 80% 即达标」：配对中位数 avgMs 1.394 ≤ 2 达标（且 3 次运行全部 ≤ 2，最大 1.448，非噪声边缘情形）；
  降幅 47.2% < 80% 不影响判定（或条件）。2ms 绝对阈值仍按计划在 Task 7 用浏览器 `?profile=1&stress=200` + `__runSweep()` 复核。

memo 有效性：`test/memoEffectiveness.test.tsx` 断言 LINE 空闲态 20 次 pointermove 期间 PropertiesPanel/TopBar/AxisLayer 渲染计数持平（counting-memo 包装器），全绿。
7 个组件已包 React.memo（TopBar、Sidebar、AxisLayer、SelectionOverlay、CompassOverlay、PageBreaks、SnapIndicator；RulerOverlay 不动）。
全量回归 726 tests / 46 files 全绿（含 Editor.transient.test.tsx、perfSweep commits=100）；覆盖率 statements 82.51% / branches 77.34%，不低于基线。

## 最终（Task 7 填写）

执行环境：main 分支，HEAD=8bad69e（`perf: lazy-load solver and snippet mode windows`），工作树干净，无源码改动（本任务只跑验证 + 写日志）。
headless 部分由 subagent 执行；浏览器复核与手动回归为 **PENDING HANDOFF**（subagent 无浏览器工具，交回主会话/人工）。

### 体积指标（headless，全部 PASS）

- Step 1 `npm run build`：tsc + vite 成功（✓ built in 3.40s）。
- Step 2 主 chunk 断言（node，dist/assets/index-*.js 字节和）：
  - `main chunk bytes: 538042` → **PASS**（≤ 600KB = 614400 bytes）
  - vite 报告：`dist/assets/index-BeTcAaFQ.js  535.15 kB │ gzip: 164.03 kB`（与 Task 6 后一致）
- Step 3 worker/pdfjs 不在首屏 chunk：
  - `grep -l "pdf.worker" dist/assets/*.js` 实际列出：
    - `dist/assets/pdf-BnPRJEQ6.js`（pdf 懒 chunk，365.12 kB │ gzip 107.40 kB）
    - `dist/assets/pdf.worker-UEF2m4rc.js`（worker 包装 chunk 本身，0.14 kB）
    - `dist/assets/pdfImport-C8PrILVJ.js`（pdf 懒加载入口 chunk，1.26 kB）
    - 不含任何 `index-*.js` → **PASS**
    - 注：`pdf.worker-DME0-sB7.js`（1,337.96 kB，worker 本体静态资产）自身不含字符串 "pdf.worker"，故不在 grep 结果中，属预期。
  - `grep -c "GlobalWorkerOptions" dist/assets/index-*.js` → `0`（grep 退出码 1 = 无匹配）→ **PASS**（pdfjs 不在主 chunk）
  - 运行态 Network 验证（启动不请求 pdf.worker、首次导入 PDF 才请求）属 PENDING HANDOFF，见下。
- 其余懒 chunk：`SolverWindow-BdHrovWb.js 4.67 kB`、`SnippetOverlay-C0zMsxeE.js 4.95 kB`。
- vite 仍有 >500 kB chunk 警告（主 chunk 535.15 kB），低于本计划 600KB 验收上限，非阻塞。

### headless 量化指标（Step 5 headless：perfSweep ×3，与 Task 3 方法一致取中位数）

命令：`npx vitest run test/perfSweep.test.tsx`（jsdom，stress=200，LINE 空闲态 100 次 pointermove；每次 2 tests 全绿）

- run 1: `[perfSweep] {"commits":100,"totalMs":128.8694039999674,"avgMs":1.288694039999674}`
- run 2: `[perfSweep] {"commits":100,"totalMs":132.68755800001827,"avgMs":1.3268755800001828}`
- run 3: `[perfSweep] {"commits":100,"totalMs":134.76719200001799,"avgMs":1.3476719200001799}`
- **avgMs 中位数 1.3269**（run 2；范围 1.2887–1.3477，3 次全部 100 commits）
- 对 Task 3 配对基线中位数 2.6403 的降幅：(2.6403 − 1.3269) / 2.6403 ≈ **49.7%**
- 对 Task 1 存档基线 avgMs 2.6425 的降幅 ≈ 49.8%
- jsdom avgMs ≤ 2 为暂定达标；2ms 绝对阈值仍按计划在浏览器 `?profile=1&stress=200` + `__runSweep()` 复核（PENDING HANDOFF）。

### 测试与覆盖率（Step 4，PASS）

命令：`npm run test:coverage`

- **Test Files 47 passed (47)；Tests 732 passed (732)**，全绿（Duration 8.43s）。
- 覆盖率（v8，All files）：**statements 83.16% / branches 77.95%** / functions 83.98% / lines 84.3%
- 门槛：statements ≥ 81% ✓、branches ≥ 76% ✓（不低于基线）。

### PENDING HANDOFF — 浏览器复核（Step 5 items 1–3，需人工或 run skill 驱动）

1. `npm run dev`，打开 `http://localhost:5273/?profile=1&stress=200`
2. 控制台执行 `await __runSweep()`，记录 console.table 的 avgMs（真实浏览器阈值 ≤ 2ms 在此复核）
3. Network 面板确认启动未请求 pdf.worker；打开一个 PDF 后才请求

浏览器实测 avgMs：（待填）

### PENDING HANDOFF — 手动回归清单（Step 6，浏览器 + Electron 冒烟，spec §3）

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

### 验收结论

- **headless 验收：PASS。** 构建成功；主 chunk 538,042 bytes（535.15 kB）≤ 600KB；worker/pdfjs 静态验证不在首屏 chunk（index 中 GlobalWorkerOptions=0）；732 tests / 47 files 全绿，覆盖率 83.16% / 77.95% 不低于基线；perfSweep 中位数 avgMs 1.3269（对配对基线降幅 ≈49.7%，commits=100）。
- **最终验收：待定（PENDING HANDOFF）。** 浏览器 avgMs ≤ 2ms 复核、运行态 pdf.worker 请求时机、手动回归清单（浏览器 + Electron）尚未执行，需主会话/人工完成后回填并给出最终结论。