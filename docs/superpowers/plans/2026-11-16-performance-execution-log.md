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
- 浏览器实测:
- 主 chunk 体积:
- 验收结论: