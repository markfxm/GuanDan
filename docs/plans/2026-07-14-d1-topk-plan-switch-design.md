# D1 Top-K candidatePlans 动态计划切换设计

状态：设计阶段，待评审；本轮不实施 production 代码。

基线：D0 `e2a20e18f8e5c0871db38ad69426262e43766ce1` / `ai-benchmark-d0-baseline`；D0.1 测试编排 `61d7765c31fff731500f613f92cced977bb9d5cf`。

## 1. 目标与非目标

### 目标

设计一个低成本、可解释、只依赖公开信息的 Top-K 计划选择器：

1. 不重新完整运行 `HandPlanner`，只在已有 `candidatePlans` 中选择 `activePlan`。
2. 当前计划有效且优势不足时保持不变。
3. 局面明显变化、当前计划强制失效或残局压力变化时允许切换。
4. 任何被 `PowerGroupPolicy` 硬拒绝的计划都不能被选中。
5. 通过迟滞、冷却和 A→B→A 检测避免计划抖动。
6. 使用 D0 同样的真实房间、座位旋转、配对统计进行 A/B 验证。

### 非目标

- 不修改 D0 artifacts、D0 tag 或 D0 统计口径。
- 不修改评分权重、Beam、规划预算或游戏规则。
- 不增加隐藏牌推断、队友手牌访问、残局搜索或 deck 顺序访问。
- 不把切换策略放入 `room.ts`。
- 不让 diagnostics 进入 `RoomState` 或 `PublicRoom`。

## 2. 设计边界与未来文件

本轮只提交本文档。以下是获批后才允许修改的文件边界：

| 文件 | 未来职责 |
| --- | --- |
| `src/ai/contracts.ts` | 定义只读 `PlanSelectionContext`、切换状态和版本化 runtime 字段 |
| `src/ai/planning/planManager.ts` | 保存候选计划和切换状态，执行强制有效性检查，调用纯选择器 |
| `src/ai/planning/planEvaluator.ts` | 复用现有 `PlanMetrics`、`HandAnalysis`、`PowerGroupPolicyIndex`，计算动态计划分数 |
| `src/ai/aiDecisionEngine.ts` | 构造公开上下文，先选计划，再生成和评价动作 |
| `src/ai/diagnostics/aiPlanningDiagnostics.ts` | 记录可选的切换诊断，不改变行为 |
| `tests/ai/topKPlanSwitch.test.ts` | 单元、属性、确定性、隐藏信息边界测试 |
| `tests/benchmark/strategies.ts` | 获批后增加 `unified-d1-topk-switch` adapter 和 descriptor |
| `tests/benchmark` / `scripts` | 获批后增加独立 D1 benchmark artifact 生成，不覆盖 D0 |

`src/game/room.ts` 保持动作执行和 runtime 提交职责，不加入任何切换条件。

## 3. 模块职责

### PlanManager

- 持有 `candidatePlans`、`activePlanId` 和切换状态。
- 在每次 decision 前验证当前计划覆盖、牌组合法性、硬 policy 和当前可继续性。
- 强制失效时立即选择可行候选；策略性切换时调用纯 `selectActivePlan`。
- 不计算具体出牌动作分数，不调用完整 `HandPlanner`。

### PlanEvaluator

- 接收只读的公开局面上下文、一次构建的 `HandAnalysis` 和 `PowerGroupPolicyIndex`。
- 计算每个候选的静态质量、局面适配项、风险项和切换成本。
- 不写入 runtime，不读取隐藏牌，不创建完整新的 hand analysis。

### aiDecisionEngine

1. 从当前 `AiObservation` 构造公开 `PlanSelectionContext`。
2. 请求 `PlanManager` 选择 `activePlan`。
3. 将选中计划传给现有 `actionGenerator`。
4. 用现有 `actionEvaluator` 评价合法动作。
5. 将新的 runtime 和诊断快照一并返回。

### AiRuntimeState

保存跨 decision 必需的计划状态；不保存隐藏信息。建议新增的持久字段见第 7 节。

### actionGenerator

只根据自身手牌、公开牌局、选中计划、`HandAnalysis` 和 policy index 生成合法候选。它不负责计划之间的比较。

### actionEvaluator

只评价已生成的合法动作。它不修改 active plan，也不触发重规划。

## 4. 公开输入契约

### 允许输入

`PlanSelectionContext` 只能由以下字段组成：

- 当前 seat、partner seat；
- 当前领牌/跟牌状态、`lastPlay` 类型和 `lastPlaySeat`；
- 当前自己的剩余牌数；
- `handCounts` 中的队友和两个对手剩余牌数；
- `finishOrder`；
- `partnerPassedCurrentTrick`；
- 当前回合公开出牌历史（现有 `playedCards`）；
- 当前 `candidatePlans`；
- 当前 decision 共享的 `HandAnalysis` 和 `PowerGroupPolicyIndex`；
- 每个计划是否存在可行动 group、预计剩余组数/轮数；
- 是否进入最后 10 张、最后 5 张阶段。

### 禁止输入

- `partnerHand`、`opponentsHands`、全部 `hands`；
- deck 顺序、剩余 deck 或任何未公开牌；
- 测试 classification 标签；
- legacy reference 的隐藏状态；
- diagnostics 耗时、错误栈、文件路径或 worker 调度信息。

候选计划中的牌必须已经属于当前自己的公开 decision hand；计划选择器不得以候选计划反推隐藏牌。

## 5. 数据流

```text
AiObservation + AiRuntimeState
        │
        ├─ 一次 HandAnalysis / PowerGroupPolicyIndex
        │
        ▼
PlanSelectionContext（只读公开上下文）
        │
        ▼
PlanManager.validateActivePlan
        │
        ├─ 强制失效 → 立即选择合法候选
        └─ 有效 → PlanEvaluator 评估最多 K 个候选
                         │
                         ▼
                 hysteresis/cooldown/tie-break
                         │
                         ▼
                 activePlanId + switch state
                         │
                         ▼
             actionGenerator → actionEvaluator → AiDecision
```

同一 decision 的所有计划共享同一个只读分析上下文；不得为每个计划调用 `analyzeHand`、`detectGroups` 或完整 `HandPlanner`。

## 6. 动态评分模型

设计版本暂定为 `d1-topk-score-v1`。下列权重是待批准的设计常量，不在本轮修改生产权重。

```text
dynamicPlanScore =
    staticPlanQuality       [0, 40]
  + immediatePlayability    [0, 15]
  + tempoFit                [0, 10]
  + endgameFit              [0, 10]
  + partnerContextFit       [0, 10]
  + opponentPressureFit     [0, 10]
  - powerGroupRisk          [0, 15]
  - switchCost              [0, 10]
```

每一项均在固定范围内 clamp；不使用候选集合的偶然 min/max 作为唯一归一化依据。

| 项目 | 输入与定义 | 现成指标/新增计算 | 预算 |
| --- | --- | --- | --- |
| `staticPlanQuality` | `PlanMetrics` 的 hard violation、protection loss、estimated turns、low singles、retained control、wildcard flexibility、response/lead flexibility；硬违规直接为 0 | 复用 `PlanMetrics`，只做固定上限归一化 | O(1) |
| `immediatePlayability` | 当前计划是否有能领牌或击败 `lastPlay` 的合法 group；有则 15，无合法 group 则 0，只有非首 group 可行动则 8 | 复用现有 group 分类和当前合法候选摘要 | O(groups) |
| `tempoFit` | 以固定上限 20 轮归一化 estimated turns，轮数越少越高；所有候选相同则 5 | 复用 `estimatedTurns` | O(1) |
| `endgameFit` | 自己 ≤10 张、≤5 张时，按可立即结束、剩余组数和低单张风险给分；非残局为 5 | 复用手牌数量、计划 metrics | O(groups) |
| `partnerContextFit` | 队友已过牌且当前计划能主动争牌时加分；队友控制牌权时不奖励无谓抢牌 | 复用 `partnerPassedCurrentTrick`、公开 trick | O(1) |
| `opponentPressureFit` | 任一对手 ≤3 张时，按当前计划的 response coverage、可阻断能力和立即 finish 能力加分 | 复用 `handCounts`、metrics；不看对手牌 | O(1) |
| `powerGroupRisk` | `protectionLoss` 和 policy 风险归一化；硬违规候选先过滤，不进入排序 | 复用 `PowerGroupPolicyIndex`、`PlanMetrics` | O(1) |
| `switchCost` | 当前 active 为 0；非 active 基础成本 3；最近使用或违反 cooldown 时增加 2–10 | 复用 runtime 历史 | O(1) |

计划排序只在 `K` 个候选内执行。建议 `K = min(5, candidatePlans.length)`；`K` 不改变 D0 的 `maxPlans`、Beam 或规划预算。

### 计算规则

1. 先过滤 `hardViolations > 0`、覆盖不完整、包含当前手牌不存在牌、违反硬 policy 或没有任何合法继续动作的计划。
2. 对剩余候选计算上述分数；候选不足时保留现有合法 active plan。
3. 分数只描述当前公开局面适配，不改变现有 action score 的权重。
4. 计划分数不写回 `HandPlan.metrics`，避免把动态局面指标伪装成静态 plan quality。

## 7. 切换触发、迟滞与 runtime

### A. 强制失效切换

以下任一条件成立时立即切换，不受 cooldown 或普通阈值限制：

- `activePlanId` 不存在或找不到计划；
- 计划覆盖不完整、重复牌或包含不在当前手牌的牌；
- 计划 group 不能通过当前牌型合法性校验；
- 计划有 hard `PowerGroupPolicy` 违规；
- 计划没有任何可合法继续的 group，且存在其他合法候选。

如果没有合法候选，返回现有统一的 replan/failure 路径，由既有 planner 处理；Top-K selector 不自行增加新的规划算法。

### B. 策略性切换

仅在 active 有效且满足迟滞规则时切换：

- 候选动态分数比 active 高至少 `minimumScoreDelta`；
- active 首个可用 group 与当前牌墩不适配；
- 进入 ≤10 或 ≤5 张残局且候选的 endgameFit 明显更高；
- 队友已过牌且候选能更好地主动争夺牌权；
- 任一对手公开剩余 1–3 张且候选的压力适配明显更高；
- active 的预计剩余轮数比候选多至少 2 轮。

### C. 建议初始防抖常量

这些是待批准的 D1 v1 常量：

- `minimumScoreDelta = 6`；
- `minimumTurnsBetweenSwitches = 2` 个已完成 decision turn；
- `switchPenalty = 3`；
- `recentPlanHistory` 最多保存最近 4 个 plan ID；
- A→B→A 窗口为最近 3 次策略性选择；重复回切需要 `2 × minimumScoreDelta`，强制失效除外；
- 同分或差值小于 1 的候选按稳定 tie-break 处理，不切换当前 active。

### D. 持久 runtime 字段

建议把以下字段纳入 `AiRuntimeState`，版本为 `d1-topk-runtime-v1`：

```text
planSwitchVersion: "d1-topk-runtime-v1"
activePlanId?: string
previousPlanId?: string
lastPlanSwitchTurn?: number
planSwitchCount: number
recentPlanIds: string[]       // 最多 4 个
lastSwitchReason?: PlanSwitchReason
```

`lastPlanScores`、score breakdown 和 turns-since-last-switch 不进入持久 runtime；它们只在 diagnostics 快照中存在，避免保存过期局面分数。旧 runtime 缺少新字段时由兼容层使用空历史、`planSwitchCount = 0` 和 `planSwitchVersion = d1-topk-runtime-v1`，不得恢复隐藏信息。

`PlanSwitchReason` 至少包含：

```text
"forced-missing" | "forced-incomplete" | "forced-policy" |
"forced-illegal-continuation" | "strategic-score" | "strategic-trick-fit" |
"strategic-endgame" | "strategic-partner-pass" | "strategic-opponent-pressure" |
"strategic-tempo" | "hysteresis-suppressed" | "cooldown-suppressed" | "tie-kept-active"
```

## 8. 稳定排序与确定性

所有候选先按 stable plan ID 去重，再使用如下 comparator：

1. 强制合法候选优先；
2. 当前 `activePlanId` 优先；
3. `dynamicPlanScore` 高者优先；
4. `staticPlanQuality` 高者优先；
5. 预计剩余组数少者优先；
6. `powerGroupRisk` 低者优先；
7. `stablePlanId` 字典序升序。

不得依赖 `Map`/`Set` 插入顺序、对象引用、文件系统顺序或 worker 调度。相同 observation、runtime、candidatePlans 和 config 必须得到完全相同的 active plan、switch reason 和 runtime。

diagnostics 开关只记录数据，不得改变候选枚举、排序、随机源或切换结果。benchmark concurrency=1 与 N 的动作、hash 和 switch sequence 必须一致。

## 9. Diagnostics

diagnostics 默认关闭，且不进入 `RoomState`、`PublicRoom`、replay 主体或普通 benchmark artifact。建议附加到现有 `AiPlanningDiagnostics`：

- `planSwitchConsideredCount`；
- `planSwitchExecutedCount`；
- `forcedSwitchCount`；
- `strategicSwitchCount`；
- `switchSuppressedByHysteresis`；
- `switchSuppressedByCooldown`；
- `previousPlanId`；
- `selectedPlanId`；
- `previousScore`；
- `selectedScore`；
- `scoreDelta`；
- `switchReason`；
- `turnsSinceLastSwitch`；
- `planCandidateCount`；
- `planScoreBreakdown`；
- `AToBToAWindowCount`。

诊断数据只能在 test/benchmark adapter 中导出；生产默认路径不保存完整 score breakdown。

## 10. 性能预算

- 每次 decision 最多评估 5 个 plan。
- 不调用完整 `HandPlanner`，不为每个 plan 重复 `detectGroups`。
- 当前 decision 只构建一次 `HandAnalysis` 和一次 `PowerGroupPolicyIndex`，所有 plan 共享只读索引。
- 动态评分平均耗时和 p95 相对 D0 不得恶化超过 15%。
- `detectGroups`/decision 保持 D0 同一数量级。
- `fullReplan/game` 次数不得因策略性切换增加；强制失效只允许沿既有 replan 路径计数。
- 先以 diagnostics 记录 `planCandidateCount`、`totalDecision`、`fullReplanCount`，再决定是否放宽 K；不得以增加预算换取通过验收。

性能比较必须使用相同 seed、rank、rotation、allocation、diagnostics 关闭，并报告平均值、p95 和 full replan/game。

## 11. 单元、属性和边界测试矩阵

未来实现后至少增加以下测试，不修改 D0 测试期望：

| # | 场景 | 断言 |
|---:|---|---|
| 1 | active 明显最佳 | 不切换 |
| 2 | 新 plan 优势超过阈值 | 策略性切换 |
| 3 | 分数差不足 | 保留 active，记录 hysteresis |
| 4 | cooldown 内 | 不切换，记录 cooldown |
| 5 | active 缺失/不完整 | 立即 forced switch |
| 6 | active 含缺失牌 | 立即 forced switch |
| 7 | policy hard violation | 永不选择违规 plan |
| 8 | 同分 | active 优先，结果稳定 |
| 9 | A→B→A | 在窗口内被抑制，除非强制失效 |
| 10 | ≤10/≤5 张残局 | 合理 endgame plan 可切换 |
| 11 | 队友已过牌 | partner context 只使用公开字段 |
| 12 | 对手剩 1–3 张 | opponent pressure 只使用 handCounts |
| 13 | 隐藏牌替换 | 选择结果不变；无 hidden field 访问 |
| 14 | 不触发完整 HandPlanner | planner/fullReplan 计数不增加 |
| 15 | diagnostics on/off | action、runtime、hash 完全一致 |
| 16 | 相同输入重复执行 | plan ID、reason、score、runtime 完全一致 |
| 17 | runtime 版本升级 | 旧 runtime 可安全默认迁移，不读取隐藏信息 |
| 18 | 动作后增量继承 | candidatePlans/activePlan 仍可验证 |
| 19 | concurrency=1/N | action、switch sequence、hash 一致 |
| 20 | shadow corpus | 错误分类仍为 0 |

额外要求：测试中不得通过 `partnerHand`、`opponentsHands`、`hands` 或 deck 注入策略；legacy adapter 必须保持 restricted observation。

## 12. D0 配对 A/B 实验

### 策略 ID

- control：`unified-current`；
- treatment：`unified-d1-topk-switch`。

control 必须固定为 D0 当前 unified 策略版本；treatment 使用独立 `implementationVersion`、`configHash` 和 `sourceCommit`。D0 artifacts 不覆盖，D1 使用新文件名和新 manifest。

### 阶段

每个 opponent matchup 均使用 D0 的 2 placements × 4 rotations，每个 base seed 8 raw games：

1. 20 base seeds：160 raw games，用于冒烟和 switch diagnostics 可解释性；
2. 50 base seeds：400 raw games，用于性能、切换率、A→B→A 率；
3. 200 base seeds：1,600 raw games，用于正式 paired A/B。

非退化对手为 `deterministic-random`、`simple-greedy`、`legacy-reference`。若三组均运行，阶段 3 总量为 4,800 raw games、2,400 paired units；每组独立 artifact。

统计仍以 base seed 为 bootstrap block：每次抽样一个 seed 时保留该 seed 的 8 局，paired score difference 中性值为 0，paired win-rate 中性值为 0.5。报告 raw games、paired units、base seeds、CI、错误计数和 switch diagnostics；分类结果 exploratory，Elo 仅 secondary descriptive。

### D1 artifact 约束

建议输出：

```text
artifacts/ai-benchmark-d1-topk-switch-<opponent>.json
artifacts/ai-benchmark-d1-topk-switch-<opponent>.md
artifacts/ai-benchmark-d1-topk-switch-manifest.json
artifacts/ai-benchmark-replays-d1-topk-switch/<opponent>/...
```

不得写入 `ai-benchmark-baseline.*`，不得修改 D0 manifest 或 D0 tag。每批次仍需原子落盘、更新 manifest、支持 resume/skip-existing，并验证 configHash、provenance、publicTraceHash 和 replay privacy。

## 13. D1 验收门槛

### 正确性硬门槛

所有正式阶段必须满足：

- `illegalAction = 0`；
- `leadPass = 0`；
- `invalidFollow = 0`；
- `duplicate/missingCard = 0`；
- `policyViolation = 0`；
- `runtimePlanMismatch = 0`；
- `engineError = 0`；
- `exceededActionLimit = 0`。

### 行为门槛

- 每个 switch reason 可解释且属于枚举；
- forced 与 strategic switch 可区分；
- `planSwitchExecuted / decisions` 不超过预先批准上限；
- A→B→A 率受控；
- 不增加完整重规划依赖；
- 隐藏信息访问静态扫描和运行时边界测试均为 0。

### 性能门槛

- 平均、p95 decision time 相对 D0 恶化不超过 15%；
- detectGroups/decision 同数量级；
- full replan/game 无明显增加；
- 性能测试通过。

### 智能效果

- treatment vs control 的 paired score difference 不低于 0；
- 95% CI 最好排除 0，但不得仅凭 raw win rate 声称提升；
- 对 greedy 应有可复现改善证据；
- 对 random 和 legacy 不得出现显著退化；
- 所有结论以 paired statistics 和 CI 为主，Elo 不作为主要强度证据。

## 14. 回滚条件

出现任一条件即停止推广并回滚 treatment：

- 任一安全指标非 0；
- 平均或 p95 性能恶化超过 15% 且无充分收益；
- 高频 A→B→A 或 switch rate 超过批准上限；
- paired score difference 为负且 CI 不支持非退化；
- 对 greedy 无改善且性能变差；
- random 或 legacy 出现显著退化；
- 需要隐藏信息才能产生收益；
- 需要频繁完整重规划才能维持行为。

回滚只切换策略 descriptor/实验 artifact，不回退或修改 D0 tag、D0 artifacts、游戏规则或统一 AI 既有权重。

## 15. 待确认问题与决策

以下内容在实现前必须明确批准：

1. 是否接受 `K = 5`、`minimumScoreDelta = 6`、cooldown 2 turns、A→B→A 3-turn window？
2. `staticPlanQuality` 是否按本文固定范围和现有 `PlanMetrics` 归一化，还是只允许 rank-based 质量分？
3. `endgameFit` 与 `opponentPressureFit` 的公开阈值是否固定为 ≤10、≤5 和对手 ≤3 张？
4. 是否同意不把 `lastPlanScores` 持久化，只放 diagnostics？
5. 阶段 3 的 1,600 raw games 是“每个 opponent matchup”还是“三组 opponent 合计”？本文按每组 1,600、总计 4,800 设计。
6. D1 treatment 的正式 `implementationVersion`、`configHash`、`sourceCommit` 和 artifact 文件名是否按本文命名？
7. paired score CI 包含 0 时是否只报告“未观察到显著提升”，而不作为自动失败？
8. D1 是否沿用 D0 的 replayMode 默认 `failures`，正式阶段显式使用 `all`？

在上述决策确认前，不进入 production 实施、不注册 treatment strategy、不运行正式 D1 benchmark。

