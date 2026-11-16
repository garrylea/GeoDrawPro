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
- commits / totalMs / avgMs:
- 降幅（avgMs）:
- Task 4 触发判定（avgMs > 2 且降幅 < 80% → 触发）:

## 最终（Task 7 填写）
- 浏览器实测:
- 主 chunk 体积:
- 验收结论: