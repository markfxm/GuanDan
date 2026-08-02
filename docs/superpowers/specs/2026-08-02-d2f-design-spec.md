# D2F CRN Rollout / Team Utility Design Specification

状态：文档纠偏冻结；仅定义后续实现边界，不开始 Task 1。

## 1. 阶段定位与不可突破约束

D2F 只建设以下 detached/offline/shadow 证据链：

```text
ParticleBank
  -> 同一组候选动作的 Common Random Numbers 有限深度模拟
  -> Team Utility terminal/leaf evaluation
  -> 按粒子权重聚合期望、方差和 downside risk
  -> 稳定、可重复的候选排序
  -> 脱敏 evidence
```

D2F 不替换原 evaluator，不让 rollout 排序改变正式出牌，不确定 active-mode 权重，不执行 D2G benchmark/treatment/active-mode 决策，也不治理无关依赖或模块。

所有 D2F 请求必须携带字面量 `formalExecutionAllowed: false`。实现还必须在类型、入口和调用点保持结构性旁路：`RolloutResult` 不得作为正式动作、evaluator、candidate filter、plan selector 或 Room transition 的输入。`mode` 只允许 `detached`、`offline`、`shadow`，D2F 没有 active mode。

候选 A/B/C 必须共享同一个不可变 ParticleBank、同一组 `RolloutScenario`、同一 replicate coverage、同一预算和同一 rollout 深度。任何关键失败都丢弃整个 partial result，返回 typed failure，由调用方保持原 evaluator 结果。

## 2. 模块边界与 ParticleBank 私有桥接

实现目录冻结为：

```text
src/ai/rollout/**
tests/ai/rollout/**
```

Task 1 允许对 `src/ai/particles/**` 的唯一 production 修改是下列窄桥接及其必要测试：

```text
src/ai/particles/particleBankRolloutAccess.ts
src/ai/rollout/particleScenarioSource.ts
```

`particleBankRolloutAccess.ts` 是唯一允许读取 `readParticleBankInternals`/WeakMap internals 的 particles 侧桥接；rollout 其他 production 模块不得导入、re-export 或通过 barrel 暴露 `particleBankInternals.ts` 的任何 symbol。`particleScenarioSource.ts` 是唯一调用该桥接的 scenario source；两者都不加入 public barrel。AST/symbol gate 同时检查 import 和 export，测试只通过行为入口验证 fake/unknown handle，不直接绕过 bridge 读取 internals。桥接只能返回只读、深拷贝或不可变投影，不能返回可修改 `ParticleBank` internals 的引用；raw scenario、四座位完整手牌、particle weight 和 seed 只可在 bridge/source 到 kernel 的隔离链中存在，不能进入 policy、public diagnostics 或 shadow sink。fake/unknown handle 必须安全失败并返回 `fake-or-unknown-particle-bank` typed failure。

仓库实际 replay API 需要以下完整输入，不能伪造为 `createParticleScenarioSource(bank)`：

```ts
type RolloutScenarioSourceInput = Readonly<{
  bank: ParticleBank;
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  publicState: RolloutPublicState;
}>;

type RolloutScenarioSourceResult =
  | {
      ok: true;
      scenarios: readonly RolloutScenario[];
      effectiveSampleSize: number;
      acceptedScenarioCount: number;
    }
  | { ok: false; failure: RolloutFailure };
```

source 必须校验 `initialLedger`、`finalLedger` 的 canonical hash、最后 event index、`gameRank`、`perspectiveSeat` 和己方手牌一致性，然后按仓库真实签名调用 `replayParticleScenario({ scenario, publicHistoryEvents, initialLedger, finalLedger, gameRank, perspectiveSeat, ownCurrentHand })`，构造当前 rollout state。raw scenario、四座位完整手牌、raw weight、particle seed 只能留在内部，不进入 policy、public diagnostics 或 shadow sink。

## 3. 统一契约

以下 TypeScript 契约是 Design Spec、Implementation Plan、Test Gate Matrix 的唯一公共名称和字段定义。

契约的数值域也冻结在三份文档中：所有表示分数、权重、ESS、方差、风险、差值或耗时的
`number` 必须先通过 `Number.isFinite`；所有 count、index、ordinal、ply、seat 和 work-unit
字段必须是 `Number.isSafeInteger` 且满足各自的非负或座位域约束；权重必须 finite、非负，
scenario 权重归一化和所有工作量乘积必须在固定容差与逐步溢出检查下完成。`TeamUtility` 是
唯一允许为负的离散 utility 字段，且不允许 zero。任何 NaN、Infinity、负计数、小数计数、
溢出、重复 identity 或缺失 identity 都在进入 policy/kernel 前转换为本契约已有的 typed
failure；不得把非法数值放入 success result、aggregateDiagnostics 或 public evidence。

identity 基础契约如下：`candidateId` 必须等于 `canonicalActionIdentity(action)` 并在请求内唯一；
`scenarioIdentity` 使用已有 `particleScenarioIdentity` 的 canonical bytes；
`replicateIdentity` 使用 `replicateOrdinal` 的 length-prefixed canonical encoding；
`rootIdentity` 是同一个 pre-action replay root 的 canonical identity，`rootDigest` 是该
canonical root identity 的 digest。replay context identity 必须覆盖 public history、initial/final
ledger 的 canonical hash 与 event index、game rank、perspective seat、己方当前手牌、acting
seat、current trick/public state 和同一 ParticleBank snapshot identity。所有 identity 编码使用
显式 domain、长度前缀和固定 UTF-8/code-unit 规则；不得依赖对象地址、Map 插入顺序、localeCompare
或绝对数组位置。

### 3.1 请求、场景和预算

```ts
type RolloutMode = "detached" | "offline" | "shadow";

type RolloutRequest = Readonly<{
  schemaVersion: "d2f-rollout-request-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  rootIdentity: string;
  scenarioSourceInput: RolloutScenarioSourceInput;
  candidates: readonly RolloutCandidate[];
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  evidenceRequirements: RolloutEvidenceRequirements;
  riskPolicy: RolloutRiskPolicy;
  policy: RolloutPolicy;
}>;

type RolloutBudget = Readonly<{
  replicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  maxWorkUnits: number;
}>;

type RolloutBudgetLimits = Readonly<{
  maxReplicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  maxWorkUnits: number;
}>;

type ValidatedRolloutBudget = Readonly<{
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  maximumWorkUnits: number;
  validated: true;
}>;

type RolloutEvidenceRequirements = Readonly<{
  schemaVersion: "d2f-rollout-evidence-requirements-v1";
  minimumEffectiveSampleSize: number;
  minimumAcceptedScenarioCount: number;
  minimumCompletedReplicateCount: number;
  requireCompleteCoverage: true;
}>;

type RolloutRiskPolicy = Readonly<{
  schemaVersion: "d2f-rollout-risk-policy-v1";
  variancePenalty: number;
  downsideRiskPenalty: number;
}>;
```

`RolloutBudget`、`RolloutBudgetLimits`、`RolloutEvidenceRequirements` 和 `RolloutRiskPolicy` 均为调用者显式传入，Task 1–6 不设置 production/shadow 默认值。budget/limits 的字段必须是 finite safe integer；evidence 的 ESS 和三个阈值必须是正的 finite safe integer，并且 validated request 不得要求超过 `maximumWorkUnits` 的证据上限；风险系数必须 finite 且 `>= 0`。工作量乘积必须在校验中逐步检查溢出和 limits。kernel 只消费 `ValidatedRolloutBudget`，不读取全局配置、wall clock、进程状态或 worker 调度。

`replicateCountPerScenario` 是每个 scenario 的请求次数。candidate summary 中的 `expectedReplicateCount` 是该 candidate 的 expected local coverage，`completedReplicateCount` 是该 candidate 实际完成数；aggregate diagnostics 只保留全候选范围的 `expectedCompletedReplicateCount` 和 `completedReplicateCount`，不重复保留含义不清的 `totalCompletedReplicates`。成功时：

```text
candidateSummary.expectedReplicateCount
  = acceptedScenarioCount * replicateCountPerScenario
candidateSummary.completedReplicateCount
  = 该 candidate 实际完成数

aggregate.completedReplicateCount
  = 所有 candidate summary.completedReplicateCount 之和
aggregate.expectedCompletedReplicateCount
  = candidateCount * candidateSummary.expectedReplicateCount
```

### 3.2 Public state、candidate 和 scenario

```ts
type RolloutPublicState = Readonly<{
  gameRank: GameRank;
  actingSeat: PublicSeat;
  perspectiveSeat: PublicSeat;
  partnerSeat: PublicSeat;
  handCounts: Readonly<Record<PublicSeat, number>>;
  finishOrder: readonly PublicSeat[];
  publicPlayedCardIds: readonly string[];
  currentLastPlay: Readonly<unknown> | null;
  currentLastPlaySeat: PublicSeat | null;
}>;

type RolloutCandidate = Readonly<{
  candidateId: string;
  action: RolloutAction;
  baselineEvaluatorScore: number;
}>;

type RolloutScenario = Readonly<{
  scenarioIdentity: string;
  normalizedWeight: number;
  privateState: Readonly<unknown>;
}>;

type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  publicState: RolloutPublicState;
  replicateIdentity: string;
  random: CrnView;
  validatedBudget: ValidatedRolloutBudget;
  policy: RolloutPolicy;
}>;
```

`candidateId` 是 action 的 canonical identity，用于候选关联、identity validation 和最终排序；它必须等于 `canonicalActionIdentity(action)` 且在 request 内唯一。`baselineEvaluatorScore` 是有限 number，只用于第三层稳定排序和 shadow 对照。它不进入 candidate identity、CRN、policy context 或 random key。`scenarioIdentity` 必须非空、canonical、唯一且与 source 使用的 ParticleBank snapshot 相符；`normalizedWeight` 必须 finite、非负，所有 accepted scenario 的权重和必须通过固定归一化容差验证为 1。`RolloutScenario` 和 `RolloutReplicateInput` 是 source/kernel 内部共享契约，不得经 public barrel 导出；`privateState` 只能在 kernel 内部消费，不能进入 policy、diagnostics 或 shadow sink。

### 3.3 CRN identity 与 policy

随机坐标唯一为：

```text
root identity
+ canonical scenario identity
+ replicate identity
+ ply/decision ordinal
+ acting seat
+ random domain
+ semantic key
-> deterministic independent stream/value
```

因此接口只能是候选无关的：

```ts
type CrnCoordinate = Readonly<{
  rootIdentity: string;
  scenarioIdentity: string;
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  randomDomain: string;
}>;

declare function deriveRandomDomain(coordinate: CrnCoordinate): string;

type CrnView = Readonly<{
  value(semanticKey: string): number;
}>;

type RolloutPolicyDecisionContext = Readonly<{
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  random: CrnView;
}>;

type RolloutPolicy = Readonly<{
  chooseAction(
    observation: SeatLocalObservation,
    context: RolloutPolicyDecisionContext,
  ): RolloutPolicyResult;
}>;
```

`CrnView` 没有共享 `next()` cursor；每次查询使用 semantic key。相同 scenario/replicate/ply/seat/domain/semantic key 在所有 candidate 中返回相同值。policy v1 枚举当前 seat-local legal actions，以 `policy-action:${canonicalActionIdentity(action)}` 查询 keyed value，按 value 降序、canonical action identity 升序选取；共同合法动作因此保留同一优先级。`replicateIdentity` 由 `replicateOrdinal` 的 canonical encoding 产生，改变 replicate 的独立 keyed stream，因此 replicateCount 有实际证据意义。candidate 数组位置和 candidateId 均不进入坐标。

CRN 的 deterministic value 只由下列完整链产生：

```text
root identity
+ canonical scenario identity
+ replicate identity
+ ply/decision ordinal
+ acting seat
+ random domain
+ semantic key
-> deterministic keyed value
```

`randomDomain` 和 `semanticKey` 都必须使用 canonical encoding；它们不得包含 candidateId、candidate 数组位置、worker id、对象地址、Map 插入顺序、localeCompare 结果或绝对 seat number。相同坐标重复查询同一 semantic key 明确复用同一个值；需要独立随机事件必须使用不同的 canonical semantic key，碰撞测试必须区分“有意复用”与“意外碰撞”。有对应候选事件的随机事件使用相同 domain/key；candidate 特有且没有可比较对应物的事件不允许偷偷取得独有 random draw：若它能被描述为公共语义事件，使用固定的 `unpaired:<event-kind>` domain 和不含 candidate identity 的状态/ply semantic key；否则返回 typed kernel failure。`CrnView.value` 只返回有限的 normalized value（例如 `[0,1)`），没有 raw seed、seed getter、tape 或 draw cursor；keyed-value 测试必须证明无法反向暴露 raw seed。

policy 只接收当前 acting seat 的 `SeatLocalObservation`：自己的 hand、公开 history、public hand counts、公开 last play、公开 finish order 和 game rank。不得读取 Room、原始对手手牌、其他座位的完整 privateState 或 ParticleScenario。

### 3.4 Team Utility 与 leaf evaluation

```ts
type TeamUtility = -3 | -2 | -1 | 1 | 2 | 3;

type TeamUtilityResult =
  | { ok: true; utility: TeamUtility }
  | { ok: false; failure: TeamUtilityFailure };

type LeafEvaluationResult =
  | {
      ok: true;
      predictedFinishOrder: readonly PublicSeat[];
      utility: TeamUtility;
    }
  | { ok: false; failure: LeafEvaluationFailure };
```

terminal truth table：

| 本方名次 | Utility |
| --- | ---: |
| `{1,2}` | `+3` |
| `{1,3}` | `+2` |
| `{1,4}` | `+1` |
| `{2,3}` | `-1` |
| `{2,4}` | `-2` |
| `{3,4}` | `-3` |

utility 严格属于 `[-3,+3]` 且不包含 zero。非法、重复或缺失名次失败。双方交换使 utility 变号；整体旋转保持团队语义；搭档座位互换不改变团队语义，不额外叠加搭档奖励。

非 terminal leaf 先保留已完成玩家真实 finish order，再对未完成玩家按剩余手牌数升序排列；相同手牌数按相对当前 acting/turn seat 的顺时针距离升序。不得用绝对 seat number。若仓库实际轮转规则证明该 tie-break 不能旋转等变，Task 2 必须以证据停止冻结该细节，提出保持旋转等变性的最小替代，而不是退化为绝对 seat number。

### 3.5 Typed success/failure unions

以下 union 名称和 discriminator 固定：

```ts
type TeamUtilityFailure =
  | { kind: "invalid-finish-order"; reason: "duplicate-seat" | "missing-seat" | "unknown-seat" }
  | { kind: "unsupported-team-pair"; teamSeats: readonly PublicSeat[] };

type LeafEvaluationFailure =
  | { kind: "invalid-leaf-state"; reason: "duplicate-finish" | "unknown-seat" | "negative-hand-count" }
  | { kind: "rotation-tie-break-unproven"; evidence: string };

type RolloutPolicyFailure =
  | { kind: "no-legal-action"; actingSeat: PublicSeat }
  | { kind: "invalid-policy-context"; field: "ply" | "actingSeat" | "random" };

type RolloutPolicyResult =
  | { ok: true; action: RolloutAction }
  | { ok: false; failure: RolloutPolicyFailure };

type RolloutKernelFailure =
  | { kind: "simulation-failed"; stage: "state-conservation" | "leaf-evaluation" | "replay" }
  | { kind: "policy-failed"; failure: RolloutPolicyFailure }
  | { kind: "budget-exhausted"; workUnits: number; maximumWorkUnits: number };

type RolloutAggregationFailure =
  | { kind: "non-finite-aggregate"; field: "expectedUtility" | "variance" | "risk" }
  | { kind: "coverage-mismatch"; expected: number; actual: number }
  | { kind: "empty-replicate-set"; candidateId: string };

type RolloutFailure =
  | { kind: "invalid-request"; field: string }
  | { kind: "invalid-budget"; field: "replicateCountPerScenario" | "maxPliesPerReplicate" | "maxPolicyActionEvaluationsPerPly" | "maxWorkUnits" }
  | { kind: "invalid-risk-policy"; field: "variancePenalty" | "downsideRiskPenalty" }
  | { kind: "invalid-evidence-requirements"; field: "minimumEffectiveSampleSize" | "minimumAcceptedScenarioCount" | "minimumCompletedReplicateCount" }
  | { kind: "fake-or-unknown-particle-bank" }
  | { kind: "scenario-source-failed"; reason: "ledger-mismatch" | "replay-context-missing" | "private-state-invalid" }
  | { kind: "effective-sample-size-too-low"; effectiveSampleSize: number; minimumEffectiveSampleSize: number }
  | { kind: "insufficient-scenarios"; acceptedScenarioCount: number; minimumAcceptedScenarioCount: number }
  | { kind: "insufficient-replicates"; completedReplicateCount: number; minimumCompletedReplicateCount: number }
  | { kind: "coverage-mismatch"; expectedCoverage: number; actualCoverage: number }
  | { kind: "kernel-failed"; failure: RolloutKernelFailure }
  | { kind: "aggregation-failed"; failure: RolloutAggregationFailure };

type RolloutReplicateResult =
  | { ok: true; candidateId: string; scenarioIdentity: string; replicateIdentity: string; utility: TeamUtility; workUnits: number }
  | { ok: false; failure: RolloutKernelFailure };

type RolloutAggregationResult =
  | { ok: true; summary: CandidateRolloutSummary }
  | { ok: false; failure: RolloutAggregationFailure };
```

所有失败均为真正的 discriminated union，不使用所有 `kind` 共享的模糊 `count?: number`。utility、leaf、policy、kernel、aggregation 在进入下一个阶段前必须检查 `ok`；任何失败都不返回部分排序。

### 3.6 Aggregation、risk 和排序

设 accepted scenario 权重为 `w_s`，每个 candidate 的 replicate 数为 `R`，且 `sum(w_s)=1`。candidate j 的分母固定为：

```text
D = sum_s(w_s * R)
expectedUtility_j = sum_(s,r)(w_s * utility_(j,s,r)) / D
variance_j = sum_(s,r)(w_s * (utility_(j,s,r) - expectedUtility_j)^2) / D
risk_j = sum_(s,r)(w_s * max(0, expectedUtility_j - utility_(j,s,r))) / D
```

不按 candidate 数量改变分母；所有 candidate 必须使用相同 scenario/replicate coverage。固定风险公式：

```text
riskAdjustedUtility
  = expectedUtility
  - variancePenalty * sqrt(variance)
  - downsideRiskPenalty * risk
```

```ts
type CandidateRolloutSummary = Readonly<{
  candidateId: string;
  riskAdjustedUtility: number;
  expectedUtility: number;
  variance: number;
  risk: number;
  baselineEvaluatorScore: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  expectedReplicateCount: number;
  completedReplicateCount: number;
  workUnitCount: number;
}>;

type RolloutCoverage = "complete";

type RolloutAggregateDiagnostics = Readonly<{
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  completedReplicateCount: number;
  expectedCompletedReplicateCount: number;
  candidateCount: number;
  workUnitCount: number;
  coverage: RolloutCoverage;
}>;

type RolloutResult = Readonly<{
  schemaVersion: "d2f-rollout-result-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  rootDigest: string;
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;
```

`rootDigest` 必须由同一个 pre-action replay root 的 canonical identity 派生；它不能从已提交
或已改变的 Room、candidate 完成顺序、worker 顺序、对象地址或 raw seed 派生。success 时
`candidateSummaries` 按 canonical candidate identity 稳定排列，`ranking` 只包含同一组唯一
candidateId；所有 diagnostics 数值先通过上述 numeric domain 校验。`RolloutResult`、
`RolloutScenarioSourceResult` 和所有 kernel records 都是 detached/internal contracts，不进入
正式 evaluator、candidate filter、plan selector 或 Room transition。

候选排序严格为：

```text
riskAdjustedUtility descending
expectedUtility descending
baselineEvaluatorScore descending
candidateId ascending by UTF-16 code units
```

内部使用未舍入 finite 值排序；public summary 可在排序完成后按六位 canonical 格式化。不得用 rounded value 重新排序，public rounding 不得改变 `ranking`。

## 4. Determinism、immutability 与失败原子性

root/scenario/candidate/replicate/random-domain identity 使用 canonical encoding；scenario source 只从一次 immutable ParticleBank snapshot 读取。候选顺序变化、scenario completion 顺序变化、worker completion 顺序变化、同 seed replay 都必须得到相同的未舍入 summary 和 ranking。不能使用 `Math.random`、wall clock、对象枚举偶然顺序、共享 mutable RNG cursor 或 worker 调度产生语义结果。

入口在校验后冻结或深度只读投影 `RolloutRequest`、候选数组、ParticleBank public handle、Room public input 和 diagnostics sink；不能修改 Room、ParticleBank、candidates、public ledger 或调用者拥有的输入对象。成功只允许完整 coverage；低 ESS、场景不足、replicate 不足、coverage mismatch、budget failure、policy failure、telemetry failure 都丢弃整个 D2F result，原子回退原 evaluator。

成功 diagnostics 只记录脱敏的 `effectiveSampleSize`、`acceptedScenarioCount`、`replicateCountPerScenario`、`expectedCompletedReplicateCount`、`completedReplicateCount`、`workUnitCount` 和 `coverage`。禁止 raw scenario、assignments、对手完整手牌、particle 私有 weight 明细和可还原 random seed。

## 5. Shadow 旁路契约

当前 `src/ai/tactics/representativeActionShadowObserver.ts` 是已有 D2e representative-action observer，不能被称为 D2F shadow，也不能被复用来证明 D2F 已接入。Task 8 先只读审计该文件、`src/ai/aiDecisionEngine.ts` 和正式动作最终选定点。当前 `aiDecisionEngine.ts` 的该 observer 调用发生在 evaluator/最终 action 之前，因此不满足 D2F 的“正式动作先冻结”要求。

D2F 的真实最小旁路冻结为：Task 8 只修改 `src/game/room.ts` 的 `runAiStep` 一个调用点，并严格执行以下数据流：

```text
原决策链生成并冻结 formal action、baseline score、candidate projection
  -> 从 playCards/passTurn 执行前的同一 Room root 捕获 immutable、脱敏 shadow request/snapshot
  -> snapshot 构造放在独立 try/catch；失败只形成 unavailable/fallback，不能阻止、替换或延迟 formal action
  -> playCards/passTurn 提交 formal action
  -> runtime/plan 更新完成
  -> 只把已捕获的 pre-action snapshot 传给 observeD2FShadow
  -> 不再读取提交后的 Room 构造原 rollout root
  -> D2F 结果只进入 diagnostics sink
```

snapshot 必须同时携带来自同一个 pre-action root 的 `rootIdentity/rootDigest`、ParticleBank
handle、public ledger/history、current trick/last play、game rank、己方手牌、public hand
counts、baseline action identity/score、canonical candidate set 和显式 budget；所有调用者引用
都要 clone/freeze 或转成不可变 projection。ParticleBank bridge/source/kernel 使用该 snapshot
的同一 identity，不能在正式提交后重新读取 Room、重建 candidate、重建 ParticleBank 或改用
另一个 ledger。`formalExecutionAllowed` 永远是 literal `false`，不能由 feature flag、active
branch、配置或“以后设为 true”的 production 路径改变；D2F 不能修改已选 action、evaluator、
candidate filter、plan selector、Room transition 或 transaction result。`src/ai/aiDecisionEngine.ts`
和已有 representative observer 不修改。

`observeD2FShadow` 返回 `void`，内部捕获 throw、success、failure、低 ESS、超预算、坏 utility
和 telemetry sink failure；任何一种都只产生脱敏 evidence/fallback，不能改变 formal action。
最小新增文件为 `src/ai/rollout/d2fShadowObserver.ts`，sink 只接收脱敏 evidence。必须有
negative-control characterization：强制 D2F 推荐与原 evaluator action 相反时，formal action、
public ledger、current trick、runtime、plan 和 replay bytes 仍保持不变，只有 diagnostics
evidence 可记录 disagreement。

```ts
type D2FShadowEvidence = Readonly<{
  schemaVersion: "d2f-shadow-v2";
  baselineActionIdentity: string;
  d2fRecommendedActionIdentity: string | null;
  agreement: "agree" | "disagree" | "unavailable";
  riskAdjustedUtilityDelta: number | null;
  expectedUtilityDelta: number | null;
  baselineEvaluatorScore: number;
  effectiveSampleSize: number | null;
  acceptedScenarioCount: number | null;
  replicateCountPerScenario: number | null;
  completedReplicateCount: number | null;
  workUnitCount: number | null;
  fallbackReason: "none" | "rollout-failure" | "low-evidence" | "budget-exhausted" | "telemetry-failure";
  semanticBudgetUsage: Readonly<{
    replicateCountPerScenario: number;
    maxPliesPerReplicate: number;
    maxPolicyActionEvaluationsPerPly: number;
    workUnitCount: number;
  }> | null;
  elapsedWallClockMs: number | null;
}>;
```

Evidence 中所有非 null numeric field 必须 finite；count/budget/ESS 字段必须是合法 safe integer
或按契约允许的 finite measure，delta 可以为负但不能为 NaN/Infinity。`elapsedWallClockMs` 仅
telemetry，必须非负且不能进入 identity、policy、stop condition、ranking 或 byte-lock comparison。
shadow evidence 不向任何正式决策模块返回数据。

## 6. Budget calibration 与正式验证边界

Task 1–6 只使用测试显式小预算，不设置 production/shadow 默认 profile。Task 7 先通过独立 microbenchmark 形成 measured calibration evidence；人工批准后才能形成 shadow budget profile。Task 8 使用批准后的显式 profile 接入旁路；Task 9 在 Node 22.22.2 正式环境完成最终验证。D2G 才能决定 active 参数，D2F 不做 active-mode 工作。

正常停止由安全整数计数决定，wall clock 只作为最后安全保护和 non-semantic telemetry。benchmark correctness tests 与 benchmark timing 分离；benchmark fixture 从公开、已跟踪输入在进程内创建 ParticleBank，JSON 不承载 WeakMap handle、raw hidden scenario、weight 或 seed。

正式 Node 基线为 `Node 22.22.2`，来源为 `.github/workflows/d2a1-verification.yml`；本机 `Node 24.15.0` 只能作为 supplemental evidence，不能宣称项目正式支持 Node 24。当前没有授权的 Node 22 CI 执行证据时，最终 Gate 状态必须为 `AWAITING_NODE22_CI`。

benchmark runner 的恢复只属于 source worktree 准备或 Task 7 preflight，不是 Task 1 blocker：在
允许的 Node 22.22.2 环境执行 `npm ci`，随后确认 `git diff --exit-code -- package.json package-lock.json`、
确认本地 `node_modules/.bin/tsx.cmd`（Windows）或等价本地 binary 存在，并用该 fixed local
binary 执行 `tsx --version` 和 benchmark。不得用 `npx tsx`、临时网络解析或全局安装；runner
不存在时状态固定为 `AWAITING_FIXED_BENCHMARK_RUNNER`，不得跳过 benchmark RED 或把 benchmark
纳入普通 correctness 回归。Node 22 证据同样是最终 release Gate 的前置条件而非 Task 1 blocker；
未取得 Node 22 证据前不得称为 D2F SHADOW RELEASE READY。
