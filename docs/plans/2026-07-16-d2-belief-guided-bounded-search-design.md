# D2：Belief-Guided Bounded Search 设计规格

状态：design-only，待评审；本轮不实施 production，不注册 treatment，不运行 smoke、calibration 或 formal。`formalExecutionAllowed` 必须继续为 `false`。

## 1. Goal 与 Non-Goals

### Goal

在不获得其他座位真实手牌的前提下，把已出牌、过牌、剩余张数、牌权、队友公开状态和近期动作增量维护为 `PublicBeliefState`。该 belief 在组牌枚举之前参与牌路排序、重点牌路筛选和固定 expansion quota 分配；随后从全部合法动作压缩出 8–12 个代表动作，用 32–48 个确定性隐藏牌假设粒子进行 8–12 ply 的浅层模拟，并按团队效用和灾难风险选择动作。

D2 必须在只有 1 个 active `candidatePlan` 时正常工作；1–5 个计划都只是可用先验，不是前置条件。D2 是一个显式、可关闭、seat-private 的 treatment-only 路径，production 默认 keep-current 不改变。

### Non-Goals

- 不修改游戏规则、结算、贡还牌规则、动作合法性定义或 D0 keep-current 字节级行为。
- 不把真实 `partnerHand`、`opponentsHands`、完整 `hands`、deck 剩余信息或隐藏初始状态传入策略、`PublicRoom`、网络协议、replay 或主报告。
- 不在 rollout 中调用完整 `HandPlanner`、未来牌局搜索或无界排列搜索。
- 不把 wall-clock 作为正常结果的选择因素；不以 D2 替换 D1 selector 的阈值/cooldown 语义。
- 不假设 R1b 一定已经产生五个计划，也不在 D2 内伪造 candidate plan。

## 2. 当前问题与输入事实

当前 `AiDecisionEngine` 先建立 `HandAnalysis`，通过 `PlanManager.ensurePlans` 获得 `candidatePlans`，再由 `ActionGenerator` 产生合法动作并由 action evaluator 评分。D1 dynamic 分支使用可选 `AiRuntimeState.planSelectionState`，默认 keep-current 不创建 sidecar。

R1a 已定位：`generateFastHandPlans` 在 `timeBudgetMs=0` 时只走 greedy，dynamic selector 因而常收到一个 active plan；`maxPlans=5` 是上限而不是生成保证。R1b.1 文档只确认了确定性 expansion 研究的候选契约/研究方法；其候选实现不是 D2 的依赖，任何尚未最终批准的预算均不得写入 D2 默认配置。

因此 D2 不能把“Top-5 已存在”当作入口条件：它必须能从当前 hand analysis 和单个 active plan 建立 plan-family prior，并在没有 challenger 时仍保留 mandatory action、紧急防守和不确定性路径。

## 3. 总体架构与仓库边界

现有模块保持原路径和职责；以下是建议的新增内部模块，不要求为匹配名称而重构现有文件：

```text
src/ai/belief/
  publicLedger.ts          # HardPublicLedger 与事件去重
  publicBeliefState.ts     # belief DTO 与单一事实来源
  beliefUpdater.ts         # 事件增量更新/原子校验
  particleSampler.ts       # 确定性初始粒子
  particleResampler.ts     # 权重更新、ESS、确定性重采样
  beliefFeatures.ts        # 只读 DerivedBeliefFeatures

src/ai/planning/
  beliefGuidedPlanPolicy.ts
  planFamilyPriority.ts

src/ai/search/
  candidateActionReducer.ts
  deterministicSearchBudget.ts
  commonRandom.ts
  shallowRollout.ts
  rolloutPolicy.ts
  budgetedOutcomeEvaluator.ts

src/ai/evaluation/
  teamUtilityEvaluator.ts
  catastropheRisk.ts
  riskAdjustedActionSelector.ts
```

`src/ai/aiDecisionEngine.ts` 未来只通过内部、显式 D2 invocation option 调用 orchestrator；不把 D2 mode 加入 `AiObservation`、`RoomState`、`PublicRoom`、用户配置或网络 payload。D2 private sidecar 只由 dynamic treatment 创建。benchmark 适配器仍位于 `tests/benchmark`/`scripts`，不得让 production 导入 benchmark。

数据流：

```text
BenchmarkObservation/AiObservation(public + own hand)
  -> PublicActionEvent
  -> HardPublicLedger (dedup + monotonic validation)
  -> PublicBeliefState = ledger + ParticleBank + DerivedBeliefFeatures
  -> BeliefGuidedPlanPolicy (family priority + expansion quotas)
  -> existing legal action generation
  -> ActionStrategicSignature reducer (8..12)
  -> common-random shallow rollout
  -> team utility - catastrophe risk
  -> atomic D2 runtime/action commit
```

## 4. 公开事件与 HardPublicLedger 契约

### 4.1 设计级接口

```ts
type PublicActionEvent = Readonly<{
  schemaVersion: "d2-public-event-v1";
  gameId: string;
  eventIndex: number;             // contiguous, starts at 0
  kind: "play" | "pass" | "trick-clear" | "finish" | "tribute";
  seat: number;
  actionStableKey?: string;       // pass or sorted public card ids/group key
  trickIndex: number;
  handCountAfter?: number;        // public count only
  winnerSeat?: number;
  finishOrderAfter?: readonly number[];
  publicPayloadHash: string;
}>;

type HardPublicLedger = Readonly<{
  schemaVersion: "d2-public-ledger-v1";
  gameId: string;
  nextEventIndex: number;
  lastAppliedEventIndex: number;
  seenEventHashes: Readonly<Record<number, string>>;
  playedCardIds: readonly string[];       // public cards only
  passEvents: readonly { seat: number; trickIndex: number }[];
  handCounts: Readonly<Record<number, number>>;
  currentTrick: Readonly<{ leadSeat?: number; lastPlayStableKey?: string; lastPlaySeat?: number }>;
  finishOrder: readonly number[];
  tributePublicEvents: readonly string[];
}>;
```

`playedCardIds` 只包含已公开动作的牌；它不等价于任意座位的隐藏手牌。事件的 `publicPayloadHash` 用稳定 key/card/seat 顺序计算，不含耗时、路径或错误栈。

### 4.2 增量、去重与原子性

`beliefUpdater` 只接受 `eventIndex === lastAppliedEventIndex + 1` 的新事件，或接受 hash 完全相同的已见事件作为幂等重复。相同 index、不同 hash、跳号、handCount 负数/回退、finishOrder 非单调和已公开牌重复均 fail-closed。更新先写不可变副本，再一次性提交 ledger；失败不改变原 ledger。

事件来源包括 room 已公开的 play/pass/trick-clear/finish/tribute 记录和 observation 中的 hand count/finish order。没有公开事件就不能推断；不能用当前对象中的隐藏 `hands` 补事件。

### 4.3 Replay 重建

replay 只需保存 `schemaVersion`、event sequence、public action stable keys、seed/rotation/strategy descriptors 和 D2 version/config hash。重放时从 event index 0 重建 ledger，再按同一 deterministic seed 重建粒子和 derived features；不保存或恢复真实隐藏初始手牌、粒子内容或 deck 剩余序列。缺事件、版本不匹配或 hash 不匹配时拒绝宣称可重放，并退回原 evaluator。

## 5. belief 与 particle 单一事实来源

### 5.1 PublicBeliefState

```ts
type HiddenDealParticle = Readonly<{
  particleId: number;
  hypotheticalHands: Readonly<Record<number, readonly string[]>>;
  remainingDeckIds: readonly string[];
  weight: number;
}>;

type ParticleBank = Readonly<{
  schemaVersion: "d2-particle-bank-v1";
  eventIndex: number;
  particles: readonly HiddenDealParticle[];
  normalizedWeights: readonly number[];
  effectiveSampleSize: number;
  samplerSeedDerivationVersion: "d2-scenario-seed-v1";
  resamplerVersion: "d2-systematic-resample-v1";
}>;

type DerivedBeliefFeatures = Readonly<{
  eventIndex: number;
  opponentFinishProbability: Readonly<Record<number, number>>;
  opponentHandCountBands: Readonly<Record<number, "low" | "mid" | "high" | "unknown">>;
  likelyControlTypes: readonly string[];
  partnerYieldProbability: number;
  uncertainty: number;
  publicControlStrength: number;
  featureVersion: "d2-belief-features-v1";
}>;

type PublicBeliefState = Readonly<{
  schemaVersion: "d2-public-belief-v1";
  ledger: HardPublicLedger;
  particleBank: ParticleBank;
  features: DerivedBeliefFeatures;
}>;
```

`PublicBeliefState` 是 D2 内部单一事实来源：所有 priority、quota、action reduction 和 rollout root 都只能从同一个 event index 的 ledger、同一个 particle bank 和同一个 derived feature snapshot 读取。禁止另建一套“最终评分概率”。

粒子是从“自己的手牌 + 已公开牌 + 各座位公开 handCount/finishOrder”约束下生成的假设，不是实际隐藏状态。粒子中的 hypothetical hands 只能存在于 D2 private evaluator 的进程内；不传给通用策略、不写入 replay/report/diagnostics，也不通过 `PublicRoom` 暴露。

### 5.2 采样、权重与 ESS

初始粒子使用固定 `maxParticles`（批准范围 32–48；具体值在校准前冻结）。使用确定性 Fisher–Yates/系统抽样，候选牌集合按 card id 排序，权重归一化后满足 `sum(w)=1`。每次公开事件只更新受影响座位的 hand-count band、finish likelihood、牌权和 partner yield likelihood；未受影响粒子保持原相对顺序。

```text
ESS = 1 / sum_i(normalizedWeight[i]^2)
```

当 `ESS < essThresholdFraction * particleCount` 时，使用固定系统重采样 seed 和固定排序；重采样后权重相等。NaN、负权重、权重和为 0、粒子违反公开牌/handCount 约束均 fail-closed。ESS 只用于是否重采样，不改变粒子数量或预算。

### 5.3 seed 与 common-random-number

`scenarioSeed` 只由不随根动作变化的 canonical 场景组成：`gameSeed/roomSeed`、rank、seat、round identity、D2 algorithm/version。生产若不能从 observation 取得 room seed，必须在 seat-local runtime 创建时注入一个已冻结、与 wall-clock 无关的场景 seed；不能运行时猜测。

```text
scenarioSeed = H("d2-scenario-seed-v1|" + canonical(gameSeed, rank, seat, roundId))
particleSeed  = H(scenarioSeed + "|particle|" + particleIndex)
rolloutSeed   = H(scenarioSeed + "|rollout|" + particleIndex + "|ply|" + ply + "|simSeat|" + simulatedSeat)
```

seed 禁止包含根动作 ID、treatment/control、matchup、configHash、outputDir、worker ID、duration 或 wall-clock。相同决策的所有根动作必须复用同一个 immutable `ParticleBank`、同一 normalized weights、同一 seat-local rollout stream 和同一 node/depth budgets。根动作只改变模拟状态，不改变随机流索引；这样差异来自动作，而非不同随机样本。

## 6. belief 如何减少组牌枚举

### 6.1 Plan family priority

`BeliefGuidedPlanPolicy` 接受当前 hand analysis、可选 1–5 个 `candidatePlans`、`PublicBeliefState` 和固定 config，输出 deterministic family order。family 特征包括：

- `active`：当前 active plan 永远保留；
- `urgent-defense`：由公开牌权、对手低 hand-count band、已知 bomb/control 互动触发；
- `finishability`：自身一/两次公开行动完成度、低单张风险、保留 control；
- `partner-yield`：队友公开控制/过牌概率与 plan 的 yield/pass preservation；
- `uncertainty-cover`：对高 ESS/低 ESS、对手牌权不确定性保持的结构多样性；
- `power-preserving`：复用现有 protected group 结果，不重新发明 PowerGroupPolicy。

priority 是候选 family 的 stable tuple：`beliefUrgency DESC, familyQuality DESC, activeFirst, stableFamilyId ASC`。belief 只改变搜索次序和额度，不把不可验证的概率变成 hard legality。

### 6.2 expansion quota

固定 `maxPlanFamilies` 和 `maxPlanExpansions`。先保留 active、所有 mandatory/urgent family，再按 deterministic largest-remainder 将剩余 expansion 额度分给 family；每个保留 family 至少得到 1 个 expansion，达到上限后按 `stableFamilyId ASC` 截断。每个 family 的 expansion 只允许访问其 root/group candidates，不做全局排列。

```text
quota(f) = floor(remaining * priorityMass(f))
remainder = remaining - sum(quota)
按 remainder DESC, stableFamilyId ASC 依次补 1
```

`maxPlanExpansions` 是 canonical search state 的处理数，不是时间或生成 child 数。重复 memo state 不计 expansion；generated/accepted/duplicate 分开记录。R1b.1 的 expansion semantics 可作为实现参考，但 D2 必须在自身配置中重新冻结数值。

### 6.3 1–5 个 candidate plan 兼容

输入为 0 个 plan 时先由现有 ensure/replan 路径提供 active；若该路径不可用，D2 只使用 hand analysis 构造一个 transient family seed，不能把它伪装成 D1 `candidatePlan`。输入为 1 个 plan 时正常建立 active/urgent/uncertainty family；2–5 个 plan 时将它们作为长期先验参与排序，但不会因为数量不足而减少 action reducer 或 particle rollout。D2 不依赖 R1b candidate exposure，也不向 selector 注入虚构 challenger。

## 7. mandatory plan/action 保留与 action reduction

### 7.1 mandatory 保留

从现有全部合法动作中建立 `ActionStrategicSignature`：

```ts
type ActionStrategicSignature = Readonly<{
  stableKey: string;
  actionType: "pass" | "play";
  groupType?: string;
  cardCount: number;
  leadOrFollow: "lead" | "follow" | "pass";
  alignedPlanIds: readonly string[];
  familyTags: readonly string[];
  immediateFinish: boolean;
  powerInteraction: "preserve" | "consume" | "neutral";
}>;
```

必须保留：合法 pass（若存在）、立即完成、active plan 的至少一个代表动作、urgent-defense 的动作、不破坏 protected group 的动作、每个可用 group type 的 stable representative，以及 uncertainty-cover representative。若 mandatory 集合超过 `maxRootActions`，优先级为 `immediateFinish > urgent-defense > legal-pass > active > power-preserving > uncertainty > other`，同级按 stable action key；但永远不允许生成非法动作。

### 7.2 Reducer

`candidateActionReducer` 先调用现有合法动作生成，随后去重、打标签、按上述 mandatory 规则保留，最后以 stable tuple 截取 `maxRootActions`（批准范围 8–12）。它不是新的合法性规则，也不能把“当前不能跟牌但 pass 合法”过滤掉。若合法动作少于上限，全部保留；若 reducer 失败，回退到完整合法动作集合交给现有 evaluator。

## 8. DeterministicD2Budget 与 wall-clock guard

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
  wallClockGuardMs: number;       // abnormal protection only
  fallbackOnGuard: true;
  guardVersion: "d2-operational-guard-v1";
}>;
```

正常结果只由上述 fixed counts、稳定输入排序和版本确定。节点/particle/rollout 计数达到预算时停止生成新的单元，已完成的根动作结果保持原子；不得因 `Date.now` 或 worker 调度改变正常 winner。wall-clock 只用于异常保护：一旦 guard 触发，丢弃本次部分搜索结果，调用原有 action evaluator，并以 `D2FallbackReason="wall-clock-guard"` 记录；不把部分结果混入评分、不强制 `process.exit`。

## 9. rollout 与 team utility

```ts
type RolloutObservation = Readonly<{
  simulatedSeat: number;
  ownHypotheticalHand: readonly string[];
  publicLedger: HardPublicLedger;
  publicFeatures: DerivedBeliefFeatures;
  legalActionSummary: readonly ActionStrategicSignature[];
}>;

type BudgetedOutcome = Readonly<{
  actionStableKey: string;
  expectedTeamUtility: number;
  catastropheRisk: number;
  utilityVariance: number;
  completedParticles: number;
  simulatedDecisions: number;
}>;
```

每个 root 使用同一 ParticleBank，固定 8–12 `maxRolloutPlies` 和全局 `maxTotalSimulatedDecisions`。`rolloutPolicy` 只看当前 simulated seat 的 own hypothetical hand 和公开 ledger/features；它不能读取其他 particle hands，也不能调用完整 `HandPlanner`。每步只生成少量 legal action signatures，使用已冻结 deterministic ordering。

```text
teamUtility = expectedTeamScore
             + partnerFinishBonus
             + ownFinishBonus
             - catastropheLambda * catastropheRisk
             - varianceLambda * utilityVariance
```

`catastropheRisk` 至少覆盖 opponent finish-before-team、不可逆 power 消耗、公共牌权丢失和 rollout legality failure；风险是公共/假设状态的派生量，不是隐藏真实结果。`riskAdjustedActionSelector` 先比较 fixed-point utility，再按 catastrophe risk、active alignment、stableKey 做 deterministic tie-break。没有完整 outcome 时不能声称 D2 结论，走 fallback。

## 10. runtime、原子提交与 fallback

```ts
type D2PrivateRuntime = Readonly<{
  schemaVersion: "d2-private-runtime-v1";
  eventIndex: number;
  ledger: HardPublicLedger;
  particleBank?: ParticleBank;
  features?: DerivedBeliefFeatures;
  lastDecisionIndex: number;
  scenarioSeedDerivationVersion: "d2-scenario-seed-v1";
  configHash: string;
}>;

type D2FallbackReason =
  | "disabled" | "invalid-ledger-event" | "stale-event" | "particle-invalid"
  | "budget-exhausted" | "wall-clock-guard" | "search-error" | "privacy-violation"
  | "version-mismatch" | "insufficient-public-information";

type D2DecisionDiagnostics = Readonly<{
  schemaVersion: "d2-decision-diagnostics-v1";
  decisionCount: number;
  rootActionCount: number;
  retainedActionCount: number;
  planFamilyCount: number;
  planExpansionCount: number;
  particleCount: number;
  ess: number | null;
  simulatedDecisions: number;
  fallbackReason?: D2FallbackReason;
  wallClockGuardTriggered: boolean;
}>;
```

`D2PrivateRuntime` 是 seat-private treatment sidecar；不加入 `RoomState`/`PublicRoom`/network/replay public schema，不进入普通 benchmark artifact。引擎使用 copy-on-write transaction：

1. 校验并复制旧 runtime/ledger；
2. 增量应用事件、生成 particle/features、执行 priority/reducer/rollout；
3. 校验 action 合法、privacy、版本、计数和完整 outcome；
4. 一次性提交 action + 新 D2 sidecar。

任一步失败，原 runtime 和 sidecar 保持字节不变，调用现有 evaluator/action path，并返回 `D2FallbackReason`。wall-clock guard 同样丢弃 partial state；重复事件可安全重试。D2 disabled、keep-current control 或没有可验证 public seed 时不创建 sidecar。

## 11. Privacy、diagnostics、version 与 provenance

privacy scanner 必须拒绝 key/路径包含 `partnerHand`、`opponentsHands`、`hands`、`deck`、`initialHands`、`hiddenInitialHand`、`hiddenState` 的 public/runtime/replay/report 输出。内部 particle hypothesis 只能在 D2 evaluator 生命周期中以 opaque private value 存在，不能被通用 `AiStrategy` adapter 读取或序列化。

普通 diagnostics 只保存聚合：root/action 数、family 数、expansion 数、particle 数/ESS 分桶、rollout decisions、fallback reason counts、budget/guard counts 和候选保留比例。逐 decision score breakdown、particle id/weight、hypothetical hands 只能进入显式 `debug-plan-selection` artifact，且即使开启也不得包含隐藏手牌或 deck。diagnostics on/off 不得改变 seed、排序、utility 或 action。

建议版本/provenance：

```text
benchmarkVersion       = d2-belief-guided-search-v1
implementationVersion  = d2-belief-guided-bounded-search-v1
beliefSchemaVersion    = d2-public-belief-v1
particleSchemaVersion  = d2-particle-bank-v1
rolloutPolicyVersion   = d2-rollout-policy-v1
budgetVersion          = d2-budget-v1
runtimeSchemaVersion   = d2-private-runtime-v1
diagnosticsVersion     = d2-decision-diagnostics-v1
configHash             = SHA-256(canonical frozen D2 config + sourceCommit)
```

descriptor 必须记录 sourceCommit、implementationVersion、configHash、mode；D2 mode 只存在内部 invocation option。replay 只记录这些版本及 public event hash，不能记录 particle contents。任何缺失/unknown/mismatch fail-fast；旧 artifact 不原地升级。

## 12. D2a–D2g 实施阶段与测试边界

### D2a：低层契约与 public ledger

新增 runtime DTO、event schema、canonical stable key、事件去重/单调性/原子更新。测试覆盖重复相同事件、同 index 不同 payload、跳号、handCount 回退、finishOrder、tribute、privacy 和 replay round-trip。不得改 action 或 keep-current runtime。

### D2b：belief updater、particle sampler/resampler

从 ledger 构造唯一 `PublicBeliefState`，实现固定 seed、权重归一化、ESS 和系统重采样。测试覆盖输入顺序置换、同 seed 字节稳定、公开约束、不可能粒子 fail-closed、ESS 阈值和不同 seat runtime 不共享可变 bank。不得让实际隐藏 state 进入输出。

### D2c：plan family priority 与 quota

实现 active/urgent/uncertainty/multi-family priority 和固定 quota；对 0、1、2–5 candidatePlans 做属性测试。验证优先级 tie-break、quota 总数、重复 family、protected group 复用、当前 trick pass 合法不被过滤，以及组牌扫描次数受预算限制。keep-current 不进入 D2c。

### D2d：candidate action reducer 与 deterministic budget

复用全部合法动作，增加 mandatory preservation、8–12 root cap、计数预算和 operational guard。测试 reducer 输入置换、合法 pass、immediate finish、active/urgent/uncertainty 保留、budget 边界、wall-clock fallback 丢弃 partial result；禁止完整 HandPlanner/全排列。

### D2e：CRN shallow rollout 与 team utility

实现 particle/rollout stream 复用、seat-local observation、8–12 ply、total simulated decision cap、风险调整 utility 和 stable tie-break。测试同一根决策所有 roots 的 particle/seed identity 相同，不同 root 不改变随机索引；rollout 不读取其他座位真实 hand，不调用 HandPlanner；utility/风险有限且可重复。

### D2f：engine mode isolation、runtime atomicity 与 diagnostics

仅把 D2 orchestrator 接入内部 treatment invocation。测试 mode undefined/keep-current 与 D0 fixture 字节一致；D2 success 原子提交；context/ledger/particle/reducer/rollout/action evaluator 任一步失败原 runtime 不变；diagnostics on/off 不改变 action/hash；D2 sidecar 不进入 PublicRoom/replay/public trace。

### D2g：benchmark、消融、replay readiness

只在 D2a–f 全部通过后设计 benchmark adapter、manifest、replay/privacy validator 和 report input。先 smoke/calibration 设计 review，再人工冻结 budget/config/version；formalExecutionAllowed 仍为 false，未经批准不得运行 formal。D2g 不得修改 D0 artifact/tag 或 D1 P7.1 approval。

每阶段单独提交；前一阶段 focused + `npm test` + `tsc` + build + diff-check 通过才进入下一阶段。D2a–f 期间 production 默认 keep-current 保持不变。

## 13. Benchmark 与消融设计（只设计，不执行）

主 treatment 为 `belief-guided-bounded-search-v1`，control 为 D0 keep-current；不能把 R1b candidate exposure 当作 treatment 前置条件。建议消融（每项固定相同 seed/rotation/placement、相同 CRN 和 deterministic budgets）：

1. full D2；
2. no-belief-priority：相同 quota、plan family 输入顺序固定但不使用 belief features；
3. no-particle-rollout：只用 action evaluator；
4. no-action-reducer：全部合法动作交给既有 evaluator；
5. active-only：只保留 active family，验证 1-plan 兼容；
6. uncertainty-off：移除 uncertainty-cover family。

每个 ablation 必须单独 implementationVersion/configHash，不能把不同配置合并。统计沿用 D1 paired base-seed block 与 bootstrap 语义；若未来需要 uplift，必须用同一 base seed block 的联合差分，不能相减独立 CI。D2 smoke/calibration/formal seed ranges 需在 D2g 冻结时选择与 D0/D1 完全不重叠的新范围；本设计不预先占用或运行任何 seed。

## 14. 与 R1b.1 的并行关系

R1b.1 研究的是确定性多计划 candidate exposure 的 planner expansion contract；D2 研究的是 public belief 如何在 plan enumeration 前排序/限额、以及 bounded action/particle rollout。两者可以并行设计：

- D2 输入 1 个 active plan 时必须工作，故不等待 R1b candidate pool；
- 若 R1b 最终批准 deterministic planner，D2 的 `BeliefGuidedPlanPolicy` 可将其作为一个 family expansion backend；
- R1b budget 不自动成为 D2 `maxPlanExpansions`，两个 config/version/hash 独立冻结；
- R1b 或 D2 任一 wall-clock/timeout 失败都只能触发各自 fallback，不能互相改变正常动作；
- benchmark 报告必须区分 D1 candidate exposure、D2 belief effect 和 action-search ablation。

## 15. 设计自审清单

- **Top-5 依赖**：否；0/1/2–5 plans 均有定义，active/urgent/uncertainty 可独立建立。
- **wall-clock 正常决策**：否；固定计数决定正常结果，guard 触发即丢弃并 fallback。
- **CRN**：是；同一粒子 bank、weights、seat-local stream、node/depth budget 供所有 roots 复用。
- **belief 单一事实来源**：是；ledger → particle bank → derived features，所有模块只读同一 event index snapshot。
- **rollout 完整 HandPlanner**：否；只用 bounded rollout policy 和 legal summary。
- **隐藏信息泄漏**：否；particle hypotheses 是内部假设，永不进入策略公共契约、replay、diagnostics 或 report。
- **失败降级**：是；原 runtime/action evaluator 保持不变，partial D2 state 不提交。
- **事件去重/原子提交**：是；index/hash 幂等，copy-on-write，失败原 state 字节不变。
- **实际减少组牌枚举**：是；family priority 和 quota 在 group enumeration 前决定 roots/expansions，而非仅重排最终动作。

## 16. 未解决问题与明确延后事项

1. 生产 room seed/round identity 如何以不改 public protocol 的方式进入 seat-local runtime；D2a 前必须批准来源。
2. particle likelihood、ESS threshold、catastrophe/variance lambda、8–12 ply 和 8–12 root 的具体初值；必须通过独立校准冻结，不能在实现中猜测。
3. 公开 handCount 与 finishOrder 不一致时的事件优先级和人工/网络重放缺事件策略。
4. 贡还牌公开事件的完整 schema、跨局 ledger reset 与晋级 rank 的 round identity。
5. rollout 的 team score mapping、终局近似和 power interaction 风险是否需要 room settlement 原语；在 D2e 前只允许纯只读适配。
6. ParticleBank 的内存上限、GC 影响与 worker 隔离；不得以 wall-clock 偷偷改变 particle 数。
7. D2 diagnostics 是否需要新增 artifact schema；在 P5 privacy 复审前不写正式报告字段。
8. R1b 最终 candidate contract 是否批准；D2 保持 active-only 可用，不等待该决定。

以上问题未解决前，不得注册 D2 treatment、更新 P7.1 approval、运行 smoke/calibration/formal 或切换 production 默认 mode。
