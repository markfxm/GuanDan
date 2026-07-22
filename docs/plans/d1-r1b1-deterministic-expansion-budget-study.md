# D1-R1b.1：确定性多计划 expansion-budget 设计测量

状态：研究测量（不注册 treatment，不运行 smoke、calibration 或 formal）。

## 边界与基线

本研究从 R1a 文档基线 `2fc06c51530ebf07fd4089dc3a9ffce006ed841d` 开始。现有 D0 keep-current、D1 mode、P7 artifact、seed/provenance 和 approval 均保持不变。测量只使用既有 `generateFastHandPlans` 快速规划器和 `src/engine/planner.ts` 的默认关闭观测参数；未提供观测参数时 `generatePlans` 的控制流和返回值保持原行为。

当前基线配置固定为 `maxPlans=5`、`beamWidth=1`、`timeBudgetMs=0`。greedy active construction 不计入 expansion。观测代码不加入 `npm test` 的默认入口，也不注册 benchmark strategy。

## expansion 单位与停止语义

一个 expansion 是：规范化后从 memo frontier 取出一个尚未处理的 canonical search state，在生成子候选之前处理一次。状态 key 包含 `usedMask`、受保护组选择 mask 和 protected-bomb 状态；memo 命中是 duplicate，不增加 `expandedStates`。`generatedChildren`、`acceptedChildren` 和 `duplicateChildren` 独立计数。

`expandedStates` 从 0 开始。若下一状态处理前 `expandedStates === maxExpandedStates`，不再取该状态；当前状态处理是原子的，不在其子候选中途截断。已完成的 plan 可以返回，未完成的 archetype 以 `budget-exhausted` 结束。`maxExpandedStates=0` 不展开 root。搜索耗尽而没有预算命中时记录 `exhausted-frontier`，正常完成记录 `completed`。没有 wall-clock stopping；`process.hrtime.bigint()` 只用于性能测量。

扩展参数只通过 `PlannerExpansionObserver` 显式传入。没有参数时不排序输入 hand、不共享候选、不读时钟，确保 D0 行为字节稳定。带观测参数时 hand 按 stable card id 排序，候选使用既有 stable group 语义；因此手牌输入顺序、Map/Set 插入顺序和文件系统顺序不影响结果。

## 研究脚本和输出

脚本：`scripts/research/measureD1PlannerExpansionBudget.ts`。

脚本输出不包含完整手牌，只包含 `seed`、`rank`、`seat` 和 `handHash`。内部校验要求 plan 覆盖全部输入牌、无重复、group 可由既有 `detectGroups` 找到且通过既有 `evaluatePowerGroupUse`；不改变游戏或 policy。

### curated fixtures

至少九类：multi decomposition、straight vs opponent three-card、bomb protection/split、wildcard alternatives、protected group、single-path、exact reuse、partial repair、complete replan。前五类使用同一已知多解结构样例的不同生命周期标签，必须在预算序列中达到至少两个不同、完整、合法 fingerprint；后三类允许只有一个。研究文件只保存 fixture id 和结果摘要，不保存手牌。

### deterministic 27-card study

使用 `createRoom` 生成 seeds 5001–5052（52 deals × 4 seats = 208 hands），rank 按 13 个 rank 循环覆盖；与 D0、smoke、calibration、formal 不重叠。输出仅保存上述 provenance-safe hand records。

预算序列为 `1,2,4,8,16,32,64,128,256,512,...`，beamWidth 先固定为当前已经验证的最小值 1，不作 broad sweep。curated 先测；通过后在 208 hands 上测 minimal candidate config。每个 hand/config 至少六次 timing（两次完整 pass、每次三次）；baseline 与 candidate 在 hand 粒度交错，使用 `process.hrtime.bigint()`，首轮 warm-up 丢弃。报告 P50/P95/P99/max duration、P50/P95/max expandedStates、unique-plan rate、valid-challenger rate、errors 和 candidate/baseline P95 ratio；以两次 pass 中较差结果作门禁。本轮不设置 P99 hard gate。

candidate 只有同时满足以下条件才通过 exposure：前五个 curated fixture 均有至少两个不同完整合法 fingerprint；单路径 fixture 可保持一个；重复运行十次的 plan id、fingerprint、顺序、expandedStates 和 termination reason 完全相同；无 wall-clock 影响。性能 gate 为 candidate full-replan P95 ≤ 当前 fast planner P95 的 2 倍。

## 结果决策

- `APPROVE_CANDIDATE_CONTRACT`：记录 `beamWidth`、`maxExpandedStates`、`maxPlans`、expansion 语义和 P95 ratio，建议以 `deterministic-expansion-beam-v1` 重启 R1b 设计评审。
- `NO_GO`：没有预算同时满足 exposure 与 P95 gate；只比较设计选项 B/C 的后续研究方向，不实现候选 pool，不改变 production。

不允许用 wall-clock 截断、任意生产 node limit、独立随机源或隐藏手牌替代上述定义。

### 本次测量结果（2026-07-16）

curated 九类 fixture 在 budget 256 和 512 均满足要求：前五类均得到至少两个不同完整 fingerprint；single-path、exact-reuse、partial-repair 保持至少一个完整 plan。208 手牌测量使用 52 个 seed、4 个 seat、13 个 rank；每个 hand/config 做六次 timing（两 pass × 三次），最小候选配置为 `maxExpandedStates=512`、`beamWidth=1`。结果为：candidate duration P50 `153.253207ms`、P95 `420.085165ms`、P99 `860.222109ms`、max `2358.839811ms`；expandedStates P50/P95/max 均为 `512`；unique-plan rate `0.0048076923`；valid-challenger rate `0.0480769231`；errors `0`；candidate/baseline P95 ratio `0.1093008549`。两次重复运行的 plan id、fingerprint、顺序、expandedStates 和 termination reason 字节稳定；duration 仅作为非确定性性能观测，不进入行为 fingerprint。

因此本次测量结论为 `APPROVE_CANDIDATE_CONTRACT`，建议合同为 `deterministic-expansion-beam-v1`、`beamWidth=1`、`maxExpandedStates=512`、`maxPlans=5`。这只是 R1b candidate-pool 的设计测量结论；尚未实现 candidate exposure 接入、尚未注册 treatment，也不代表 production 晋级。

## 验证与停止

先运行 RED focused test，确认缺少 `createPlannerExpansionObserver` 的失败；再实现最小 default-off 观测并运行：

```text
npx vitest run tests/ai/d1PlannerExpansionBudgetStudy.test.ts --testTimeout=120000 --reporter=verbose
npx tsc --noEmit
npm test
npm run test:benchmark
npm run test:simulation
npm run test:ai-performance
npm run build
git diff --check
```

研究脚本需要长于普通测试时单独运行并记录自然退出，不把它加入默认 `npm test`。D0 fixture 使用既有 `--check-only` 命令验证；不运行任何 smoke、calibration、formal 或 P8。完成后提交单独 commit `d1-r1b1-expansion-budget-study` 并停止，等待人工决定。

本轮回归记录：`npm test` 通过（45 files/435 tests，约 403s）；`npm run test:simulation` 通过（2 files/2 tests，约 170s）；`npm run test:ai-performance` 通过（1 file/4 tests，约 66s）；`npm run build`、`npx tsc --noEmit`、fixture check-only 与 `git diff --check` 通过。`npm run test:benchmark` 的 33 files/128 tests 通过，但既有 `tests/benchmark/reproducibility.test.ts` 的 one-shot/four-batch manifest 测试在 120s 单测上限超时；未修改该测试、runner 或 benchmark 语义，故这一项记录为回归环境的既有超时而非本研究的通过门禁。
