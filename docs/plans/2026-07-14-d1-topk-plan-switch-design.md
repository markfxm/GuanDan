# D1 Top-K candidatePlans 动态计划切换设计

状态：设计修订版，决策已批准；本轮不实施 production 代码。

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
| `src/ai/planning/planSelectionContracts.ts` | 定义 planning 内部只读 `PlanSelectionContext`、评分 breakdown 和选择结果，避免顶层 contracts 反向依赖 analysis/policy |
| `src/ai/contracts.ts` | 只定义版本化 runtime 字段，不承载 planning 内部上下文 |
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
- 在每次 decision 前验证当前计划覆盖、牌组合法性和硬 policy；当前 trick 下暂时没有可出 group 不属于结构失效，因为合法 pass 仍可继续。
- 强制失效时立即选择可行候选；策略性切换时调用纯 `selectActivePlan`。
- 不计算具体出牌动作分数，不调用完整 `HandPlanner`。

### PlanEvaluator

- 接收只读的公开局面上下文、一次构建的 `HandAnalysis` 和 `PowerGroupPolicyIndex`。
- 只计算每个候选计划自身的静态质量、局面适配项和风险项；不计算切换成本。
- 不写入 runtime，不读取隐藏牌，不创建完整新的 hand analysis。

`requiredScoreDelta`、cooldown 和 A→B→A 回切惩罚只由 `PlanManager` 应用；
`PlanEvaluator` 的输出不得包含任何切换惩罚。

### aiDecisionEngine

1. 从当前 `AiObservation` 构造 planning 内部的公开 `PlanSelectionContext`。
2. 接收仅由 benchmark adapter 注入的内部 `PlanSelectionMode`，请求 `PlanManager` 选择 `activePlan`。
3. 将选中计划传给现有 `actionGenerator`。
4. 用现有 `actionEvaluator` 评价合法动作。
5. 将新的 runtime 和诊断快照一并返回。

`PlanSelectionMode` 只存在于 AI/planning 内部调用契约：`keep-current` 与 `dynamic-topk-v1`。
production 默认固定为 `keep-current`；benchmark control 显式注入 `keep-current`，treatment 显式注入
`dynamic-topk-v1`。它不得进入 `RoomState`、`PublicRoom`、用户配置或网络协议，也不得改变 production
默认路径。

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
planning/PlanSelectionContext（只读公开上下文）
        │
        ▼
PlanManager.validateActivePlan
        │
        ├─ 结构失效 → 立即选择合法候选
        └─ 结构有效 → active + K-1 challengers 全部评分
                         │
                         ▼
                 active score → challenger max → delta → hysteresis/cooldown/回切
                         │
                         ▼
                 activePlanId + switch state
                         │
                         ▼
             actionGenerator → actionEvaluator → AiDecision
```

同一 decision 的所有计划共享同一个只读分析上下文；不得为每个计划调用 `analyzeHand`、`detectGroups` 或完整 `HandPlanner`。

## 6. 动态评分模型

设计版本暂定为 `d1-topk-score-v1`。下列权重仅是冒烟/校准初值，不是正式冻结值；
校准完成后必须连同允许的行为上限、`implementationVersion` 和 `configHash` 一起冻结，
正式 holdout 阶段禁止修改。

```text
dynamicPlanScore =
    staticPlanQuality       [0, 40]
  + immediatePlayability    [0, 15]
  + tempoFit                [0, 10]
  + endgameFit              [0, 10]
  + partnerContextFit       [0, 10]
  + opponentPressureFit     [0, 10]
  - powerGroupRisk          [0, 15]
```

每一项均在固定范围内 clamp；不使用候选集合的偶然 min/max 作为唯一归一化依据。

切换惩罚不属于 `dynamicPlanScore`。候选分数先独立计算，再使用：

```text
requiredScoreDelta = minimumScoreDelta
                    + cooldownPenalty
                    + recentReturnPenalty
```

这样不会把 `switchCost` 与 `minimumScoreDelta` 重复扣除。

| 项目 | 输入与定义 | 现成指标/新增计算 | 预算 |
| --- | --- | --- | --- |
| `staticPlanQuality` | `PlanMetrics` 的 estimated turns、low singles、retained control、wildcard flexibility、response/lead flexibility；hard violation 只作过滤，不再进入此分数；`protectionLoss` 也不进入此分数 | 复用 `PlanMetrics`，固定范围归一化，不使用纯 rank-based | O(1) |
| `immediatePlayability` | 当前计划是否有能领牌或击败 `lastPlay` 的合法 group；有则 15，无可击 group 但合法 pass 可继续则按 5–10 的公开 trick 适配分连续给分；只有结构失效才为 0 | 复用现有 group 分类和当前合法候选摘要 | O(groups) |
| `tempoFit` | 以固定上限 20 轮归一化 estimated turns，轮数越少越高；所有候选相同则 5 | 复用 `estimatedTurns` | O(1) |
| `endgameFit` | 按自己的公开剩余牌数分段连续评分：`>10` 为 0–4，`5–10` 线性过渡到 4–10，`≤5` 线性过渡到 10；结合预计剩余组数和低单张风险 | 复用手牌数量、计划 metrics；不在 10/5 边界跳变 | O(groups) |
| `partnerContextFit` | 队友已过牌且当前计划能主动争牌时加分；队友控制牌权时不奖励无谓抢牌 | 复用 `partnerPassedCurrentTrick`、公开 trick | O(1) |
| `opponentPressureFit` | 按最小对手公开牌数分段连续评分：`>6` 为 0–3，`4–6` 过渡到 3–6，`1–3` 过渡到 6–10；结合 response coverage、阻断和 finish 能力 | 复用 `handCounts`、metrics；不看对手牌，不在 6/3 边界跳变 | O(1) |
| `powerGroupRisk` | 单独使用 `protectionLoss` 和 policy index 计算 0–15；`protectionLoss` 不再出现在 `staticPlanQuality` | 复用 `PowerGroupPolicyIndex`、`PlanMetrics` | O(1) |

计划候选集定义为：`active plan + 静态质量最高的 K-1 个 challenger`。建议 `K = 5`；当 candidate 少于 K 时使用全部候选。active 即使静态质量不在前 K，也必须始终参与评价；K 不改变 D0 的 `maxPlans`、Beam 或规划预算。

### 选择算法

1. 先验证 active 的结构完整性；若结构失效，执行 forced selection，不受 cooldown 限制。
2. 从剩余候选中按固定静态质量和 stable plan ID 取最高的 `K-1` 个 challenger。
3. 独立计算 `activeScore` 和每个 challenger score；不得在 dynamic score 之前无条件优先 active。
4. 令 `bestChallenger` 为最高分 challenger，计算 `scoreDelta = bestChallengerScore - activeScore`。
5. 若 `scoreDelta < requiredScoreDelta`、在 cooldown 内或命中 A→B→A 回切规则，保留 active；同分也保留 active。
6. 只有 `scoreDelta >= requiredScoreDelta` 且未被迟滞、cooldown、回切规则抑制时，才执行 strategic switch。
7. 选择结果再按 stable tie-break 确定，保证相同输入完全一致。

### 计算规则

1. 只过滤 `hardViolations > 0`、覆盖不完整、包含当前手牌不存在牌、重复牌、group 非法或违反硬 policy 的计划。
   当前 trick 下没有可出 group、但合法 pass 可用时不得过滤计划；这只是 `immediatePlayability`
   的策略性评分输入。
2. 对剩余候选计算上述分数；候选不足时保留现有合法 active plan。
3. 分数只描述当前公开局面适配，不改变现有 action score 的权重。
4. 计划分数不写回 `HandPlan.metrics`，避免把动态局面指标伪装成静态 plan quality。

## 7. 切换触发、迟滞与 runtime

### A. 强制失效切换

以下任一结构性条件成立时立即切换，不受 cooldown 或普通阈值限制：

- `activePlanId` 不存在或找不到计划；
- 计划覆盖不完整、重复牌或包含不在当前手牌的牌；
- 计划 group 不能通过当前牌型合法性校验；
- 计划有 hard `PowerGroupPolicy` 违规；

当前 trick 下没有可出 group 不属于强制失效：只要计划结构仍完整、合法 pass 可用，就继续保留 active，并由 `immediatePlayability` 和其他公开局面项进行策略性评分。

如果没有结构合法候选，返回现有统一的 replan/failure 路径，由既有 planner 处理；Top-K selector 不自行增加新的规划算法。
强制原因命名为 `forced-illegal-group` 或 `forced-structural-invalid`，只表示 group/结构非法，
不表示当前 trick 无法跟牌。

### B. 策略性切换

仅在 active 有效且满足迟滞规则时切换：

- 候选动态分数比 active 高至少 `minimumScoreDelta`；
- active 首个可用 group 与当前牌墩不适配，或当前只能合法 pass；
- 进入残局压力区且候选的连续 `endgameFit` 明显更高；
- 队友已过牌且候选能更好地主动争夺牌权；
- 对手公开剩余牌数进入连续 `opponentPressureFit` 区间且候选压力适配明显更高；
- active 的预计剩余轮数比候选多至少 2 轮。

### C. D1 v1 冒烟/校准防抖初值

这些是冒烟/校准初值，不是正式阶段的冻结配置：

- `minimumScoreDelta = 6`；
- `minimumDecisionIndicesBetweenSwitches = 2` 个当前 seat 的 decision index；
- `cooldownPenalty = 3`；
- `recentPlanHistory` 最多保存最近 4 个 plan family ID；
- A→B→A 窗口为最近 3 次策略性选择；重复回切需要 `2 × minimumScoreDelta`，强制失效除外；
- 同分或差值小于 1 的候选按稳定 tie-break 处理，不切换当前 active。

冒烟和 50-seed 校准结束后，必须统计 `forcedSwitchRate`、`strategicSwitchRate`、
`switchSuppressionRate` 和 `AToBToARate`，由批准记录写入 `approvedBehaviorCaps`。
随后冻结上述常量、K、行为上限、`implementationVersion`、strategy descriptors、room rules version
和 `configHash`；正式 holdout 开始后任何一项变化都必须开启新的实验版本，禁止混入原正式结果。

### D. 持久 runtime 字段

建议把以下字段纳入 `AiRuntimeState`，版本为 `d1-topk-runtime-v1`：

```text
planSwitchVersion: "d1-topk-runtime-v1"
activePlanId?: string
previousPlanId?: string
lastPlanSwitchDecisionIndex?: number
planSwitchCount: number
fullReplanCount: number // seat-local deterministic ordinal, starts at 0
recentPlanFamilyIds: string[] // 最多 4 个
activePlanFamilyId?: string
previousPlanFamilyId?: string
lastSwitchReason?: PlanSwitchReason
```

每个 `HandPlan` 还必须带有：

```text
planFamilyId: string
rootPlanId: string
lineageId: string
```

增量继承和局部修复保持原 `planFamilyId`/`rootPlanId`，并以新 `lineageId` 表示派生版本；完整重规划生成全新的 `planFamilyId`、`rootPlanId` 和 `lineageId`。A→B→A 检测只比较 family ID，不比较每次增量变化的 plan ID。

#### 稳定 ID 生成与旧 runtime 迁移

三个 ID 均由规范化输入和稳定 hash 字段计算，禁止使用时间、随机数、对象引用、Map/Set 插入顺序或 worker 调度。
`fullReplanOrdinal`（持久字段 `fullReplanCount`）是 runtime 中按 seat 递增的确定性完整重规划计数；初始计划为 0，
每次完整重规划先递增一次，再参与 ID 计算：

```text
canonicalPlanInput = canonicalJson({
  schemaVersion,
  roomRulesVersion,
  strategyId,
  strategyVersion,
  configHash,
  seat,
  fullReplanOrdinal,
  normalizedGroups,       // group stable key 升序，cardIds 升序
  normalizedPlanMetrics,  // 固定字段、固定数值格式
})

rootPlanId   = sha256("root|" + canonicalPlanInput)
planFamilyId = sha256("family|" + rootPlanId + "|" + fullReplanOrdinal)
lineageId    = sha256("lineage|" + parentLineageIdOrRoot + "|" + canonicalPlanInput)
```

完整重规划递增 `fullReplanOrdinal`，使用新的规范化候选输入生成新的 root/family/lineage；即使候选内容相同，
ordinal 也保证 family 改变。增量继承和局部修复复用
原 root/family，仅用父 `lineageId` 加规范化变更输入生成新 lineage。`recentPlanFamilyIds` 只在实际
发生 switch 时追加选中的 family，并按固定窗口裁剪；评估、抑制或同分保留 active 不得更新该列表。

旧 runtime 缺少这些字段时，不得合成时间或随机默认值：若存在可验证的 active plan，按其规范化输入
确定性迁移 root/family/lineage，并把 `fullReplanCount` 初始化为可验证的已知 ordinal；若 active plan 不存在、
ordinal 无法验证或计划无法验证，则标记 migration-required，走
既有结构性 replan 并从新候选生成完整 ID。迁移过程不得读取或恢复隐藏信息。

cooldown 使用当前 seat 独立的 decision index：

```text
decisionIndex[seat] - lastPlanSwitchDecisionIndex >= minimumDecisionIndicesBetweenSwitches
```

`lastPlanScores`、score breakdown 和 turns-since-last-switch 不进入持久 runtime；完整 score breakdown 只在显式 debug artifact 中存在，避免保存过期局面分数。旧 runtime 缺少新字段时由兼容层使用空历史、`planSwitchCount = 0` 和 `planSwitchVersion = d1-topk-runtime-v1`，不得恢复隐藏信息。

`PlanSwitchReason` 至少包含：

```text
"forced-missing" | "forced-incomplete" | "forced-policy" |
"forced-illegal-group" | "forced-structural-invalid" | "strategic-score" | "strategic-trick-fit" |
"strategic-endgame" | "strategic-partner-pass" | "strategic-opponent-pressure" |
"strategic-tempo" | "hysteresis-suppressed" | "cooldown-suppressed" | "tie-kept-active"
```

## 8. 稳定排序与确定性

active 与 challengers 先分别计算分数；不允许在 dynamic score 之前无条件优先 active。只有在 `scoreDelta` 未达到 required delta、同分、cooldown 或回切被抑制时才保留 active。

在已经确定“保留 active”或“执行 switch”的集合内，再使用如下稳定 tie-break：

1. 强制合法候选优先；
2. `staticPlanQuality` 高者优先；
3. 预计剩余组数少者优先；
4. `powerGroupRisk` 低者优先；
5. `stablePlanId` 字典序升序。

不得依赖 `Map`/`Set` 插入顺序、对象引用、文件系统顺序或 worker 调度。相同 observation、runtime、candidatePlans 和 config 必须得到完全相同的 active plan、switch reason 和 runtime。

diagnostics 开关只记录数据，不得改变候选枚举、排序、随机源或切换结果。benchmark concurrency=1 与 N 的动作、hash 和 switch sequence 必须一致。

## 9. Diagnostics

diagnostics 默认关闭，且不进入 `RoomState`、`PublicRoom`、replay 主体或普通 benchmark artifact。
主报告只保存聚合后的 switch 统计（计数、比例、forced/strategic 分类和 A→B→A 次数）。
完整 `planScoreBreakdown` 与逐 decision 序列只能写入显式 `debug-full-state` artifact；该模式默认关闭、
输出到独立 debug 目录，不得成为普通 benchmark artifact。

普通聚合可附加到现有 `AiPlanningDiagnostics`：

- `planSwitchConsideredCount`；
- `planSwitchExecutedCount`；
- `forcedSwitchCount`；
- `strategicSwitchCount`；
- `switchSuppressedByHysteresis`；
- `switchSuppressedByCooldown`；
- `previousPlanId` / `selectedPlanId`；
- `previousPlanFamilyId` / `selectedPlanFamilyId`；
- `switchReason`；
- `decisionIndicesSinceLastSwitch`；
- `decisionIndex`；
- `planCandidateCount`；
- `AToBToAWindowCount`。

`previousScore`、`selectedScore`、`scoreDelta`、`requiredScoreDelta` 和 `planScoreBreakdown` 仅在
显式 debug artifact 中导出；生产默认路径和主报告均不保存逐 decision 分数。上述 decision-level
字段即使在 test/benchmark adapter 内部存在，也必须在生成主报告时折叠为聚合计数和比例。

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
| 4 | cooldown 内 | 按 seat decision index 不切换，记录 cooldown |
| 5 | active 缺失/不完整 | 立即 forced switch |
| 6 | active 含缺失牌 | 立即 forced switch |
| 7 | 当前 trick 无可出 group但 pass 合法 | 不 forced invalidate，进入策略评分 |
| 8 | policy hard violation | 永不选择违规 plan |
| 9 | 同分 | active 优先，结果稳定 |
| 10 | A→B→A | 按 family ID 在窗口内抑制，除非强制失效 |
| 11 | family/lineage 增量继承 | 局部修复保持 family，完整重规划生成新 family |
| 12 | ≤10/≤5 张残局 | 连续 endgameFit 允许合理切换 |
| 13 | 队友已过牌 | partner context 只使用公开字段 |
| 14 | 对手剩 1–3 张 | 连续 opponent pressure 只使用 handCounts |
| 15 | 隐藏牌替换 | 选择结果不变；无 hidden field 访问 |
| 16 | 不触发完整 HandPlanner | planner/fullReplan 计数不增加 |
| 17 | diagnostics on/off | action、runtime、hash 完全一致 |
| 18 | 相同输入重复执行 | plan ID、family ID、reason、score、runtime 完全一致 |
| 19 | runtime 版本升级 | 旧 runtime 可安全默认迁移，不读取隐藏信息 |
| 20 | 动作后增量继承 | candidatePlans/activePlan 仍可验证 |
| 21 | concurrency=1/N | action、switch sequence、hash 一致 |
| 22 | shadow corpus | 错误分类仍为 0 |
| 23 | stable IDs | 相同规范化输入生成相同 root/family/lineage；输入顺序、时间和随机源变化不影响 ID |
| 24 | lineage migration | 增量/局部修复保持 family，完整重规划新建 family；旧 runtime 无法验证时进入 migration-required |
| 25 | recent family history | 只有实际 switch 才更新 `recentPlanFamilyIds`，评估和 suppression 不更新 |
| 26 | keep-current lock | `PlanSelectionMode.keep-current` 与 D0 行为的 action、runtime、hash 完全一致 |

额外要求：测试中不得通过 `partnerHand`、`opponentsHands`、`hands` 或 deck 注入策略；legacy adapter 必须保持 restricted observation。

## 12. D1 benchmark 矩阵

### 策略 ID

- control：`unified-current`；默认 production 继续保持 D0 keep-current 行为；
- treatment：`unified-d1-topk-switch`；仅 benchmark 显式使用 `dynamic-topk-v1`。

control 必须固定为 D0 当前 unified 策略版本；treatment 使用独立 `implementationVersion`、`configHash` 和 `sourceCommit`。D1 正式验收前不得把 treatment 切换为 production 默认值。

七组正式 matchup 为：

1. treatment vs control；
2. treatment vs `simple-greedy`；
3. control vs `simple-greedy`；
4. treatment vs `deterministic-random`；
5. control vs `deterministic-random`；
6. treatment vs `legacy-reference`；
7. control vs `legacy-reference`。

每组 200 base seeds、1,600 raw games、800 paired units；正式阶段合计 11,200 raw games、5,600 paired units。
该文档选择七组严格矩阵，因此允许报告 treatment 相对 D0 control 的改善/非退化差分；
若未来改用四组精简矩阵，必须删除该严格差分声明，只能报告绝对表现。

### 不重叠阶段与冻结

每个 matchup 均使用 D0 的 2 placements × 4 rotations，每个 base seed 8 raw games：

1. 冒烟：seed 201–220，20 base seeds、160 raw games/组；
2. 校准：seed 221–270，50 base seeds、400 raw games/组；
3. 正式 holdout：seed 1001–1200，200 base seeds、1,600 raw games/组。

三阶段 seed 必须互不重叠，且正式 seed 不得与 D0 的 1–200 重叠。50-seed 校准结束后，
先冻结动态评分常量、K、cooldown、回切窗口、`approvedBehaviorCaps`、`implementationVersion`、
strategy descriptors、room rules version 和七组 configHash；这些冻结值必须同时写入 config、descriptor、
manifest 和 configHash。正式 holdout 开始后禁止修改；任何变化必须生成新 experiment version，禁止与旧 batch 合并。

校准至少统计 `forcedSwitchRate`、`strategicSwitchRate`、`switchSuppressionRate` 和 `AToBToARate`，
并将批准的上限写成不可变 `approvedBehaviorCaps`。正式阶段仅验证是否低于这些上限，不得现场调参。

统计仍以 base seed 为 bootstrap block：每次抽样一个 seed 时保留该 seed 的 8 局，paired score difference 中性值为 0，paired win-rate 中性值为 0.5。报告 raw games、paired units、base seeds、CI、错误计数和 switch diagnostics；分类结果 exploratory，Elo 仅 secondary descriptive。

CI 包含中性值时结论为 `inconclusive`：不自动回滚，但 treatment 不得晋级 production；应扩大样本或保持实验状态。

### Replay

- 冒烟和校准默认 `replayMode = failures`；
- 正式阶段显式使用 `replayMode = all`；
- replay、batch、debug 目录独立于 D0 artifact，主报告不内嵌完整轨迹或隐藏状态。

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
- `forcedSwitchRate`、`strategicSwitchRate`、`switchSuppressionRate` 和 `AToBToARate` 不超过校准后写入
  config/descriptor/manifest/configHash 的 `approvedBehaviorCaps`；正式阶段不得修改这些上限；
- 不增加完整重规划依赖；
- 隐藏信息访问静态扫描和运行时边界测试均为 0。

### 性能门槛

- 平均、p95 decision time 相对 D0 恶化不超过 15%；
- detectGroups/decision 同数量级；
- full replan/game 无明显增加；
- 性能测试通过。

### 智能效果

- treatment vs control 的 paired score difference 不低于 0；
- 95% CI 排除 0 才能称为有方向性证据；若 CI 包含 0，结论为 `inconclusive`，不自动回滚但不得晋级 production，应扩大样本或保持实验状态；
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

CI 包含 0 本身不是回滚条件；它只把结果标记为 `inconclusive`，保持 treatment 实验状态并禁止 production 晋级。

## 15. 已批准决策与问题—修订对照

以下决策已批准，后续实现必须以本文为准；本轮仍不实施代码。

| 原问题 | 修订位置 | 最终决策 | 对实现的影响 |
| --- | --- | --- | --- |
| PlanEvaluator 是否负责切换成本？ | 第 3 节模块职责、第 6 节公式 | 否。PlanEvaluator 只计算计划自身分数；`requiredScoreDelta`、cooldown 和回切惩罚由 PlanManager 应用。 | evaluator 输出不得包含切换成本，manager 统一应用阈值修正。 |
| 当前 trick 没有可出 group 是否强制失效？ | 第 7 节 A/B、第 11 节 #7 | 否。合法 pass 时计划仍有效；仅结构不完整、缺牌、重复、group 非法、硬 policy 违规等强制失效。trick 不适配是策略评分项。 | `hasValidActivePlan` 不得以“无可出 group”直接触发 forced replan；`immediatePlayability` 需支持 pass 合法场景。 |
| forced 原因如何命名？ | 第 7 节 A、`PlanSwitchReason` | 使用 `forced-illegal-group` 或 `forced-structural-invalid`；不表示当前 trick 无法跟牌。 | reason enum 和错误分类统一使用 group/structural-invalid 语义。 |
| 是否先无条件保留 active？ | 第 6 节“选择算法”、第 8 节 | 否。独立算 active score，再从 challengers 取最高分，比较 delta，最后应用 threshold、cooldown、回切规则。active 只在同分或未达阈值时保留。 | selector 必须始终评价 active；不得在 dynamic score 前短路。 |
| switchCost 是否作为 dynamic score 项？ | 第 6 节公式 | 否。移除 `switchCost`；统一使用 `requiredScoreDelta = minimumScoreDelta + cooldownPenalty + recentReturnPenalty`。 | 避免 switchCost 与 minimumScoreDelta 双重惩罚。 |
| A→B→A 依据什么 ID？ | 第 7 节 D、第 8 节、第 11 节 #10/#11 | 使用 `planFamilyId`；增量继承/局部修复保持 family，完整重规划生成新 family；`rootPlanId` 和 `lineageId` 同步记录。 | `HandPlan` 增加 family/root/lineage 字段，回切窗口不比较每回合变化的具体 plan ID。 |
| cooldown 使用什么时钟？ | 第 7 节 C/D | 使用当前 seat 独立 `decisionIndex`，字段为 `lastPlanSwitchDecisionIndex`；不使用模糊全局 turn。 | runtime 和 diagnostics 记录 seat-local index；cooldown 只比较同一 seat。 |
| Top-K 是否可能排除 active？ | 第 6 节 | 不会。候选集固定为 active + 静态质量最高的 K-1 个 challenger；K=5 时 active 必须参与评价。 | 先构造 challenger 集，再强制加入 active；不改变 D0 planner 的 maxPlans/Beam。 |
| `PlanSelectionContext` 放在哪里？ | 第 2、4、5 节 | 移至 `src/ai/planning/planSelectionContracts.ts` 等 planning 内部契约；顶层 `contracts.ts` 不反向依赖 analysis/policy。 | 未来只由 planning 模块消费，保持 contracts 依赖方向。 |
| protectionLoss 是否双重计分？ | 第 6 节评分表 | 不双重计分。`staticPlanQuality` 不含 protectionLoss；`powerGroupRisk` 单独固定范围归一化。禁止纯 rank-based。 | 只在 risk 分支读取 protectionLoss，静态质量仍使用固定范围。 |
| 10/5/3 张边界是否跳变？ | 第 6 节评分表、第 11 节 | 不跳变。endgame 和 opponent pressure 使用分段连续线性评分；10、5、3（及压力过渡区）只作为区间端点。 | 实现需测试边界左右连续性，不得使用 if/else 硬切分造成分数跳跃。 |
| 正式矩阵如何配对？ | 第 12 节 | 采用七组严格矩阵：treatment/control、greedy、random、legacy 的全部 control/treatment 对照；每组 200 seeds/1600 raw/800 paired，合计 11200 raw/5600 paired。 | 生成七组独立 artifact、manifest、replay 和统计摘要，并允许 treatment 相对 D0 control 的严格差分声明。 |
| 冒烟、校准、正式 seed 是否重叠？ | 第 12 节“不重叠阶段与冻结” | 不重叠：201–220 冒烟、221–270 校准、1001–1200 正式 holdout；正式 seed 不使用 D0 的 1–200。 | manifest 合并前验证 seed 集合不交叠和 configHash 一致；参数变化开启新 batch。 |
| 行为门槛何时冻结？ | 第 12 节冻结流程、第 13 节行为门槛 | 校准统计 forced/strategic switch、suppression 和 A→B→A；批准上限写入 config、descriptor、manifest 和 configHash，正式阶段只验证不调参。 | `approvedBehaviorCaps` 成为不可变正式输入，变更开启新 experiment version。 |
| 三个稳定 ID 如何生成？ | 第 7 节“稳定 ID 生成与旧 runtime 迁移” | 由规范化输入和 hash 字段确定；增量/局部修复继承 family，完整重规划新建 family；旧 runtime 仅确定性迁移，无法验证则 migration-required。 | 禁止时间、随机数、对象顺序；`recentPlanFamilyIds` 只在实际 switch 更新。 |
| diagnostics 如何进入报告？ | 第 9 节 Diagnostics | 主报告只保存聚合 switch 统计；完整 breakdown 和逐 decision 序列只进默认关闭的独立 debug artifact。 | 普通 artifact 不含逐 decision 分数或完整规划轨迹。 |
| PlanSelectionMode 如何注入？ | 第 3 节 aiDecisionEngine、第 11 节 #26、第 12 节策略 ID | production 默认 keep-current；benchmark control 显式 keep-current；treatment 显式 dynamic-topk-v1；不进入 RoomState/PublicRoom/用户配置。 | 增加 keep-current 与 D0 行为完全一致的锁定测试；treatment 只在 benchmark adapter 生效。 |
| control 是否切换 production 默认？ | 第 12 节“策略 ID 与 control 实现” | 不切换。production 保持 D0 keep-current；benchmark treatment 显式使用 `dynamic-topk-v1`；D1 通过前不改默认值。 | treatment 仅在 benchmark adapter 注册，不能影响默认房间路径。 |
| CI 包含 0 如何处理？ | 第 12、13、14 节 | 结论为 `inconclusive`；不自动回滚，但不得晋级 production；应扩大样本或保持实验状态。 | report 增加 inconclusive 状态，晋级门禁与回滚门禁分离。 |
| replay mode 如何设置？ | 第 12 节 Replay | 冒烟/校准默认 `failures`；正式阶段显式 `all`。 | replay 文件与 D0 独立保存，正式验证必须覆盖 all 模式。 |

在上述已批准决策基础上，仍只允许先写测试和 benchmark 设计；未获得新的实施授权前，不修改 production、不注册默认 treatment、不运行正式 D1 benchmark。
