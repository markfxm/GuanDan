# D2：Belief-Guided Bounded Search Canonical Design Specification

状态：design-only，待评审。本轮不实施 production、不修改测试/benchmark、不注册 treatment，不运行 smoke、calibration 或 formal。`formalExecutionAllowed` 保持 `false`。

## 1. Goal 与 Non-Goals

### Goal

利用已公开牌、过牌、剩余张数、当前牌墩、牌权、finish order、贡还牌公开事件和自身手牌，增量建立 `PublicBeliefState`。信念首先用于低成本牌路排序、action prior 和动作压缩；仅对保留的少量根动作建立粒子并执行固定深度 common-random rollout，最后以团队效用和灾难风险选择动作。

D2 必须支持 0–5 个 `candidatePlans`。单个 active plan、多个长期 plan 先验和完全没有 candidate plan 的 action-only 路径都必须可运行。D2 是显式、可关闭、seat-private 的 treatment-only 内部路径；production 默认 keep-current 和 D0 byte lock 不变。

### Non-Goals

- 不修改游戏规则、结算、贡还牌规则、合法动作定义、D1 selector 阈值/cooldown 或 D0 runtime shape。
- 不接收、推断或输出真实 `partnerHand`、`opponentsHands`、完整 `hands`、deck 或隐藏初始状态。
- 不在 rollout 调用完整 `HandPlanner`，不做无界排列或未来牌局搜索。
- 不让 wall-clock 决定正常动作，不将未批准 planner backend 的额度写成生产 node limit。
- 不依赖 Top-5 已经存在，也不伪造 plan identity。

## 2. 当前代码边界与依赖

当前 `AiDecisionEngine` 先通过 `HandAnalysisCache` 获得分析，再由 `PlanManager.ensurePlans` 维护 `candidatePlans`，然后由 `ActionGenerator` 产生合法动作、action evaluator 评分。D1 sidecar `AiRuntimeState.planSelectionState` 只由 dynamic mode 创建；keep-current 不创建、不补默认、不序列化。

R1a 已确认：默认 `timeBudgetMs=0` 的 `generateFastHandPlans` 主要返回 greedy 结果，`maxPlans=5` 是上限而不是生成保证。D2 因此不把五个 plan 当作入口条件。D2 的 action search 不依赖 R1b；plan pruning 只有在独立批准 deterministic bounded planner backend 后才可 active。

建议新增内部模块，遵循现有 `src/ai` 分层，不为名称强制重构：

```text
src/ai/belief/       publicLedger, beliefUpdater, lightweightEvidence,
                     particleSampler, particleResampler, beliefFeatures
src/ai/planning/     beliefGuidedPlanPolicy, planFamilyPriority
src/ai/search/       candidateActionReducer, deterministicSearchBudget,
                     commonRandom, shallowRollout, rolloutPolicy,
                     budgetedOutcomeEvaluator
src/ai/evaluation/   teamUtilityEvaluator, catastropheRisk,
                     riskAdjustedActionSelector
```

benchmark 适配器仍只存在于 `tests/benchmark` 和 `scripts`；D2 mode 不进入 `RoomState`、`PublicRoom`、网络协议或用户配置。

## 3. Canonical 数据流

```text
HardPublicLedger
  -> LightweightPublicEvidence
  -> plan-family priority + action prior
  -> all legal actions + mandatory safety preservation
  -> ActionStrategicSignature reducer (8..12 roots)
  -> one immutable ParticleBank snapshot
  -> particle-derived features + particle-specific likelihood
  -> common-random seat-local shallow rollout
  -> risk-adjusted team utility
  -> atomic action + D2PrivateRuntime commit
```

轻量阶段先减少昂贵搜索；粒子阶段只服务 reducer 保留的 roots。所有 roots 共享同一个粒子快照、权重、随机流索引和节点预算。

## 4. D2a Entry Gate：事件与身份来源

D2a 开始前必须冻结以下来源，任何缺失都阻塞实现：

| 事实 | 唯一来源与规则 |
|---|---|
| `gameId` | room 创建时生成的稳定房间/对局 identity；不得来自时间、对象地址或 worker。 |
| `roundIdentity` / `handIdentity` | room 的局/手生命周期和 rank 晋级计数；新手开始时原子递增，重放使用同一字段。 |
| public event source | room 已提交的公开 play/pass/trick-clear/finish/tribute 事件；不得从隐藏 `hands` 反推。 |
| event index allocator | 单一 room event ledger 顺序分配，从新手的 0 开始连续递增；同一事件不由多个 worker 分配。 |
| event order | play/pass → trick-clear/finish → tribute public event 的 room 提交顺序；具体每类事件的相邻关系在 D2a fixture 冻结。 |
| reset | 新局创建时清空 ledger、recent window、particle index；跨局不得复用旧 event index。 |
| replay source | replay 中的 public event sequence、game/round identity、seed/rotation/placement 和版本字段；缺一项即拒绝重建。 |

room/base seed 的具体注入可以延后到 D2e，但 game/hand identity 和 event ordering 不得延后。任何来源不得依赖 wall-clock、对象地址、目录顺序或 worker 调度。

## 5. Raw PublicActionEvent 与 Derived Evidence

### 5.1 Raw event

`PublicActionEvent` 只保存原始公开事实，字段进入 `publicPayloadHash` 的 canonical 输入：

```ts
type PublicActionEvent = Readonly<{
  schemaVersion: "d2-public-event-v2";
  gameId: string;
  eventIndex: number;
  kind: "play" | "pass" | "trick-clear" | "finish" | "tribute";
  seat: number;
  publicCardIds?: readonly string[];  // sorted, only cards exposed by this event
  publicStableKey?: string;
  patternType?: string;
  groupType?: string;
  handCountBefore?: number;
  handCountAfter?: number;
  leadSeat?: number;
  lastPlaySeat?: number;
  usedWildcardCount?: number;
  usedBomb?: boolean;
  trickIndex: number;
  publicPayloadHash: string;
}>;
```

Raw event 不含 perspective 或行为解释字段：`relationToLastPlayer`、`wasForcedDefense`、`defensiveOpportunity`、`opponentNearFinish`、`partnerYieldContext` 均不得进入 event 或其 hash。

### 5.2 HardPublicLedger

```ts
type HardPublicLedger = Readonly<{
  schemaVersion: "d2-public-ledger-v1";
  gameId: string;
  roundIdentity: string;
  nextEventIndex: number;
  lastAppliedEventIndex: number;
  seenEventHashes: Readonly<Record<number, string>>;
  playedCardIds: readonly string[];
  handCounts: Readonly<Record<number, number>>;
  currentTrick: Readonly<{ leadSeat?: number; lastPlayStableKey?: string; lastPlaySeat?: number }>;
  finishOrder: readonly number[];
  publicTributeEvents: readonly string[];
  recentActionSummaries: readonly string[]; // fixed 8..16 events or 2..4 tricks
}>;
```

新事件必须是下一个连续 index，或与已见 index 的 hash 完全相同。跳号、同 index 不同 hash、公开牌重复、hand count 回退、finish order 非单调和非法 tribute 均 fail-closed。更新先写 immutable copy，校验成功后再一次性提交；失败不改变原 ledger。

### 5.3 LightweightPublicEvidence

```ts
type DerivedPublicActionEvidence = Readonly<{
  eventIndex: number;
  relationToLastPlayer: "self" | "partner" | "opponent" | "unknown";
  wasForcedDefense: boolean;
  defensiveOpportunity: boolean;
  opponentNearFinish: boolean;
  partnerYieldContext: "yield" | "takeover" | "neutral";
}>;

type LightweightPublicEvidence = Readonly<{
  schemaVersion: "d2-lightweight-evidence-v1";
  eventIndex: number;
  perspectiveSeat: number;
  ownHand: readonly string[];
  publicPlayedCardIds: readonly string[];
  handCounts: Readonly<Record<number, number>>;
  currentTrick: HardPublicLedger["currentTrick"];
  recentActions: readonly PublicActionEvent[];
  finishOrder: readonly number[];
  publicTributeEvents: readonly string[];
  publicControlSeat?: number;
  derivedActionEvidence: readonly DerivedPublicActionEvidence[];
  uncertainty: number;
}>;
```

派生字段由 perspective seat、team relation、hand counts、current trick 和 frozen thresholds 确定性计算；它们不进入 raw event hash。轻量阶段不得创建粒子、调用 HandPlanner 或读取任何真实隐藏 state。

## 6. Belief、完整牌张守恒与 likelihood

### 6.1 HiddenDealParticle 与 ParticleBank

标准掼蛋 108 张牌全部分配给四个座位。粒子不保留任何独立的“剩余牌堆”字段，而只保留四座位 hypothetical hands；守恒关系为：

```text
own current hand
+ public played cards
+ hypothetical partner/opponent hands
= complete standard 108-card multiset
```

```ts
type HiddenDealParticle = Readonly<{
  particleId: number;
  hypotheticalHands: Readonly<Record<number, readonly string[]>>;
  weight: number;
}>;

type ParticleBank = Readonly<{
  schemaVersion: "d2-particle-bank-v1";
  eventIndex: number;
  particles: readonly HiddenDealParticle[];
  normalizedWeights: readonly number[];
  effectiveSampleSize: number;
  particleSamplerVersion: "d2-particle-sampler-v1";
  rolloutRandomVersion: "d2-rollout-random-v1";
}>;
```

每个粒子必须验证：标准 CardId 无重复、无遗漏；公开牌不在任何 hypothetical hand；自己的手牌完全一致；其他座位张数与 ledger 一致；已 finish 的座位为空。违反任一条件的粒子权重为 0 并淘汰，不能静默补牌。

### 6.2 单一快照与 pending event catch-up

一次需要 rollout 的决策严格执行：

1. reducer 先得到 8–12 个 roots；
2. ParticleBank 只生成或更新一次；
3. 形成 immutable snapshot；
4. 所有 roots 共享 particles、weights 和 seat-local streams；
5. 禁止每个 root 重新采样。

```ts
type D2PrivateRuntime = Readonly<{
  schemaVersion: "d2-private-runtime-v1";
  lastLedgerEventIndex: number;
  lastParticleEventIndex: number;
  ledger: HardPublicLedger;
  particleBank?: ParticleBank;
  features?: DerivedBeliefFeatures;
  lastDecisionIndex: number;
  scenarioSeedDerivationVersion: "d2-scenario-key-v1";
  configHash: string;
}>;
```

若上一次唯一合法动作路径没有更新粒子，下一决策必须按 event index 顺序处理 `lastParticleEventIndex + 1` 到当前 ledger 的全部 pending events，再创建新 snapshot；不得只处理最新事件。若任一 pending event 无法验证，整次 D2 fallback，原 runtime 不变。

### 6.3 Particle-specific action likelihood

```ts
type ParticleActionLikelihoodInput = Readonly<{
  event: PublicActionEvent;
  ledger: HardPublicLedger;
  evidence: LightweightPublicEvidence;
  actingSeat: number;
  actingSeatHypotheticalHand: readonly string[];
}>;

type ParticleActionLikelihood = Readonly<{
  logWeightDelta: number;       // finite or -Infinity only
  hardImpossible: boolean;
  reasonCode: "public-card-missing" | "legal-response" | "low-cost-response" |
    "protected-response" | "partner-yield" | "near-finish" | "ordinary-play";
}>;

type PublicActionLikelihood = Readonly<{
  playLikelihood: (input: ParticleActionLikelihoodInput) => ParticleActionLikelihood;
  passLikelihood: (input: ParticleActionLikelihoodInput) => ParticleActionLikelihood;
}>;
```

输入只包含当前 acting seat 的 hypothetical hand，不传其他座位 hypothetical hands、真实隐藏手牌或完整 particle state 给通用策略。不同 particle 必须可以产生不同 `logWeightDelta`。

固定语义：

1. 公开 play 的牌不在该假设手牌中：`hardImpossible=true`，返回 `logWeightDelta=-Infinity`。
2. pass 时没有合法接牌：pass likelihood 较高。
3. pass 时存在低成本接牌：pass likelihood 降低但不淘汰。
4. 只能拆炸、拆 protected group 或使用逢人配接牌：pass 仍可能合理。
5. 搭档领牌：pass 证据减弱，具体幅度由冻结模型决定。
6. 对手即将走完仍 pass：证据增强或减弱必须由冻结模型和 reason code 定义，不得在实现中临时猜测。

规则不可能的事件淘汰粒子；行为不合理只减少有限 log-weight。所有 log-weight 必须 finite 或 `-Infinity`；NaN、正 Infinity、全零权重或全 `-Infinity` 权重集合 fail-closed。具体数值和 calibration 规则另行冻结。

归一化和 ESS：

```text
normalizedWeight[i] = exp(logWeight[i] - logSumExp(all logWeights))
ESS = 1 / sum_i(normalizedWeight[i]^2)
```

`ESS < essThresholdFraction * particleCount` 时使用固定系统重采样；否则保持粒子顺序。粒子数量固定在批准范围 32–48。

### 6.4 统一设计级 DTO

以下 DTO 是 D2 各模块之间的唯一低层契约；实现时只能扩展版本化字段，不能让 action reducer 或通用 rollout 策略读取其他座位的 hypothetical hand。

```ts
type PublicBeliefState = Readonly<{
  schemaVersion: "d2-public-belief-v1";
  lightweight: LightweightPublicEvidence;
  particleFeatures?: DerivedBeliefFeatures;
  eventIndex: number;
}>;

type DerivedBeliefFeatures = Readonly<{
  schemaVersion: "d2-derived-belief-features-v1";
  uncertainty: number;
  opponentPressureBand: "low" | "medium" | "high";
  partnerYieldBand: "yield" | "neutral" | "takeover";
  leadPriorByFamily: Readonly<Record<string, number>>;
}>;

type ActionStrategicSignature = Readonly<{
  stableKey: string;
  actionKind: "play" | "pass";
  groupType?: string;
  cardIds: readonly string[];
  mandatoryClass: "safety" | "diversity";
}>;

type D2DecisionDiagnostics = Readonly<{
  schemaVersion: "d2-decision-diagnostics-v1";
  rootCount: number;
  particleCount: number;
  effectiveSampleSize: number;
  completionReason?: D2CompletionReason;
  fallbackReason?: D2FallbackReason;
  phaseDurationsMs: Readonly<Record<"lightweight" | "reducer" | "particle" | "rollout" | "total", number>>;
}>;
```

## 7. Plan priority、pruning 边界与 action reduction

### 7.1 两项能力

```ts
type PlanPruningMode = "disabled" | "shadow" | "active";

type BeliefGuidedActionSearch = (input: {
  evidence: LightweightPublicEvidence;
  candidatePlans: readonly HandPlan[]; // 0..5
  legalActions: readonly ActionStrategicSignature[];
  budget: DeterministicD2Budget;
}) => readonly BudgetedOutcome[];

type BeliefGuidedPlanPolicy = (input: {
  evidence: LightweightPublicEvidence;
  candidatePlans: readonly HandPlan[]; // 0..5
  mode: PlanPruningMode;
  budget: DeterministicD2Budget;
}) => Readonly<{ familyPriority: readonly string[]; expansionQuota: Readonly<Record<string, number>> }>;
```

`beliefGuidedActionSearch` 不依赖 R1b，使用合法动作、公开 evidence、action reducer 和 rollout。`beliefGuidedPlanPruning` 需要显式批准的 deterministic bounded planner backend。backend 未批准时只允许 `disabled` 或 `shadow`：记录 priority/quota 供研究，不改变 planner、candidate 或 action；禁止调用现有无界 `generateHandPlans` 来满足 quota，禁止用 wall-clock 控制，禁止临时发明 node limit。`active` 只有 backend 单独批准后才可用。

### 7.2 Plan-family priority 与 quota

Lightweight evidence 生成 stable family priority：active（若存在）、urgent-defense、finishability、partner-yield、uncertainty-cover、power-preserving 和 belief-exploitation。priority tuple 为 `beliefUrgency DESC, familyQuality DESC, activeFirst, stableFamilyId ASC`。

若 pruning mode 为 shadow/active，quota 使用固定 `maxPlanFamilies`、`maxPlanExpansions` 和 deterministic largest-remainder。shadow 不改变执行；active 的 expansion unit 必须是 canonical search state，duplicate memo state 不计数。D2 首轮不实现 active pruning。

### 7.3 candidatePlans=0 与 1–5 兼容

当 `candidatePlans.length === 0`，进入 action-only D2：不创建 plan identity，不计算 plan alignment/plan damage，不记录 plan switch。仍执行 legal action generation、mandatory safety preservation、action reduction 和原 evaluator top-1 保留。

当数量为 1，active 只作为可选长期 prior，D2 仍建立 urgent/uncertainty action prior；数量为 2–5 时才加入其他长期 plan family。任何数量都不能改变 legal action 定义。

### 7.4 Safety mandatory 与 diversity reserved

`SafetyMandatory` 必须包括：

- 唯一合法动作；
- 原 evaluator top-1；
- 合法 pass；
- immediate finish；
- 公开规则可证明的最低成本 urgent block。

`DiversityReserved` 包括 active plan、power preserving、uncertainty、group type representatives、partner yield 和 belief exploitation。先从全部合法动作计算 stable signature，再保留 safety，最后在余量中放 diversity，目标上限 8–12 roots。

如果 safety mandatory 数量超过 `maxRootActions`，不得截断、不得延长 wall-clock、不得返回部分 roots；使用原 evaluator 并返回 `D2FallbackReason="mandatory-action-overflow"`，同时记录 diagnostics。action reducer 不能把“当前不能跟牌但 pass 合法”当作非法。

## 8. 确定性预算、CRN 与 rollout

```ts
type DeterministicD2Budget = Readonly<{
  maxPlanFamilies: number;
  maxPlanExpansions: number;
  maxRootActions: number;
  maxParticles: number;
  maxRolloutPlies: number;
  maxTotalSimulatedDecisions: number;
  essThresholdFraction: number;
  budgetVersion: "d2-budget-v1";
}>;

type D2OperationalGuard = Readonly<{
  wallClockGuardMs: number;
  fallbackOnGuard: true;
  guardVersion: "d2-operational-guard-v1";
}>;
```

正常结果只由固定计数、stable input ordering、版本和 shared snapshot 决定。达到 `maxRolloutPlies` 或 `maxTotalSimulatedDecisions` 是正常完成，不是异常。wall-clock 只作异常保护；触发时丢弃 partial search，调用原 evaluator，并返回 wall-clock fallback。

`scenarioKey` 至少包含 game/base seed、round/hand identity、level rank、placement、rotation、perspective seat 和 public decision index；不得包含 treatment/control、ablation、implementationVersion、configHash、matchup、root action、outputDir、worker、duration 或 wall-clock。`particleSamplerVersion` 和 `rolloutRandomVersion` 分开记录。同一 sampling algorithm 的不同 ablation 复用 scenarioKey、ParticleBank、weights 和 seat-local rollout streams。

每个 simulated seat 只看自己的 hypothetical hand、public ledger、lightweight/particle-derived features 和 legal summaries；不看其他 hypothetical hands。rollout 不调用完整 HandPlanner，仅执行固定 8–12 ply 的 `rolloutPolicy`。

## 9. Completion、fallback 与原子 runtime

```ts
type D2CompletionReason =
  | "all-root-particle-pairs-completed"
  | "max-rollout-plies-reached"
  | "max-simulated-decisions-reached"
  | "terminal-state-reached";

type D2FallbackReason =
  | "invalid-ledger-event"
  | "particle-invalid"
  | "mandatory-action-overflow"
  | "incomplete-root-coverage"
  | "wall-clock-guard"
  | "privacy-violation"
  | "version-mismatch"
  | "search-error";
```

固定 budget 达到时，如果已覆盖并完成当前 roots，则以 `D2CompletionReason` 正常提交；不能因为达到计数预算自动 fallback。若没有可提交的完整 root outcome，属于 `incomplete-root-coverage` 异常，才 fallback。

引擎使用 copy-on-write transaction：校验 ledger → 补齐 pending events → 生成轻量 evidence → reducer → 生成一次 ParticleBank → rollout → 校验 action/privacy/version → 一次性提交 action 和 runtime。任一步异常，原 runtime/sidecar 字节不变，调用原 evaluator；不提交部分粒子、ledger 或 family state。唯一合法动作路径可以只提交原 evaluator 结果；下一决策依据 `lastLedgerEventIndex`/`lastParticleEventIndex` 补齐 pending events。

## 10. Team utility、privacy、diagnostics 与 provenance

```text
teamUtility = expectedTeamScore
             + partnerFinishBonus
             + ownFinishBonus
             - catastropheLambda * catastropheRisk
             - varianceLambda * utilityVariance
```

`catastropheRisk` 覆盖 opponent finish-before-team、不可逆 power 消耗、公共牌权丢失和 rollout legality failure。utility 使用 fixed-point 比较，随后按 risk、active alignment（仅当 plan 存在）、stable action key tie-break。

普通 diagnostics 只保存 action/root 数、family 数、expansion、particle count/ESS、likelihood invalid count、rollout decisions、completion reason、fallback reason 和各阶段耗时。particle contents、hypothetical hands、逐 decision score breakdown 只允许显式 debug artifact，且仍不得包含隐藏牌或 deck。diagnostics on/off 不得改变 action、seed、排序或 hash。

建议版本：`d2-belief-guided-bounded-search-v1`、`d2-public-event-v2`、`d2-public-ledger-v1`、`d2-lightweight-evidence-v1`、`d2-particle-bank-v1`、`d2-scenario-key-v1`、`d2-rollout-random-v1`、`d2-budget-v1`、`d2-private-runtime-v1`。descriptor 记录 implementationVersion、sourceCommit、configHash 和 mode；缺失/unknown/mismatch fail-fast。replay 只重建 public event sequence 和版本，不保存粒子。

privacy scanner 必须拒绝 public/runtime/replay/report 中的 `partnerHand`、`opponentsHands`、完整 `hands`、deck、initial hands 和 hidden state。内部 hypothetical hands 只能作为 D2 evaluator 的 opaque private values，不能传给通用策略。

## 11. D2a–D2g 实施顺序与测试边界

### D2a Public ledger

冻结 entry gate 的 game/hand identity、event source/index/order/reset/replay；实现 raw event、去重、单调性、原子更新。测试重复/冲突事件、事件顺序、跨局 reset、replay round-trip 和 privacy。

### D2b Lightweight public evidence

实现派生 evidence、recent window、关系和 threshold 计算；不得创建粒子或调用 HandPlanner。测试 perspective/seat permutation、公开字段变更的单调性、raw hash 不受派生字段影响和成本上限。

### D2c Plan priority/quota shadow

实现 family priority/action prior 和 quota 的 shadow 记录；测试 0–5 candidatePlans、stable ordering、quota 总量和 mandatory 标签。首轮不允许 `active`，除非 bounded backend 已单独批准。

### D2d Representative action reducer

复用全部合法动作，测试 safety mandatory、diversity reserved、8–12 cap、输入置换、合法 pass、唯一动作和 overflow fallback。reducer 不实现新的 game rule。

### D2e Particle/action likelihood/ESS

实现完整 108-card 守恒、particle-specific likelihood、log-weight、ESS 和单次 immutable snapshot。测试不同粒子得到不同 likelihood、公开牌 hard impossible、pass 语义、全零权重、pending-event catch-up、每 root 不重采样。

### D2f CRN rollout/team utility

实现 scenarioKey、版本分离、seat-local observation、8–12 ply、固定 simulated decision budget、completion reasons、utility/risk 和 stable tie-break。测试不同 root/ablation 共享 CRN，wall-clock 只走异常 fallback，rollout 不读取其他 hypothetical hands。

### D2g Engine treatment/benchmark/ablation

只在 D2a–f 完成后接入内部 treatment，加入 atomic runtime、diagnostics、replay/readiness 和消融设计。每阶段单独提交，前阶段 focused、P0 lock、`npm test`、tsc、build、diff-check 通过后才进入下一阶段。formal 仍禁止。

## 12. Benchmark、消融与 R1b 关系

主 treatment `belief-guided-bounded-search-v1` 对 control `keep-current`；建议消融为 full D2、no-belief-priority、no-particle-rollout、no-action-reducer、active-only、uncertainty-off。每项独立 implementationVersion/configHash，共享相同 CRN scenarioKey；D2 统计沿用 paired base-seed block，不相减独立 CI。seed range 在 D2g 冻结时选择，必须与 D0/D1 完全不重叠，本轮不运行。

`beliefGuidedActionSearch` 可独立于 R1b 并先行。`beliefGuidedPlanPruning` 只有 bounded backend 批准后才可能 active；R1b budget 不自动成为 D2 budget，两个 config/version/hash 独立。D2 绝不等待五个 candidate plan 才能工作。

## 13. 效率验收与净收益

每个 fixture、real hand 和 frozen config 在 concurrency=1、warm-up、interleaved baseline/candidate 和 `process.hrtime.bigint()` 下分别记录：lightweight evidence、family reduction、planner expansion、legal action reduction、particle generation/update、rollout、total D2 decision cost 和 original planner+evaluator cost 的 P50/P95/P99。报告 `netCostDelta` 与总成本比值；只减少 planner 而增加 total P95 的配置为 NO_GO。completion/fallback、root/particle/rollout counts 和异常 guard 单独报告。

## 14. Canonical 自审与未决事项

已确认：数据流先轻量 evidence 后 action reduction，再建立一个共享 ParticleBank；likelihood 对粒子有区分；raw event 不含视角派生判断；固定预算达到是正常完成；异常才 fallback；0-plan 为 action-only；safety mandatory overflow 不截断；pending events 按 index catch-up；D2c-active 需要 bounded backend；总成本而非局部 planner 成本作为效率门槛。

仍待 D2a 前后分别批准：room seed 的 seat-local 注入方式、likelihood calibration 数值、ESS fraction、utility/risk 权重、近期事件窗口、粒子内存上限、贡还牌事件细节和 D2 artifact schema。未批准前不实现、不注册 treatment、不更新 P7.1 approval、不运行任何实验阶段。
