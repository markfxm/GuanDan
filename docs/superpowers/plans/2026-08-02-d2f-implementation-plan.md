# D2F CRN Rollout Implementation Plan

状态：
TASK 1 INDEPENDENT REVIEW BLOCKED
TASK 1 FINAL GATE REMEDIATION DESIGN FROZEN
TASK 1 CODE REMEDIATION PENDING
TASK 2 NOT STARTED

## Task 1 Independent Review Findings — formal adjudication

本轮独立复核不接受既有冻结报告作为证据；以下七项裁决是三份 D2F 文档共同的规范，代码尚未因本轮文档修订而被声明修复。

| Finding | Formal ruling | Frozen remediation |
| --- | --- | --- |
| 1. 嵌套 budget/limits callback 逃逸 | **CONFIRMED — TASK 1 BLOCKER** | `RolloutBudget` 与 `RolloutBudgetLimits` 使用 exact own data keys、逐字段复制，拒绝额外 string/symbol/accessor/异常 prototype；不执行、bind、保存或返回 callback。 |
| 2. 嵌套 symbol/accessor hostile input | **CONFIRMED — TASK 1 BLOCKER** | 所有 caller-controlled envelope 先经 `Reflect.ownKeys`、descriptor、prototype、函数值和数组边界检查，再进行 clone/hash/freeze；所有异常转 typed failure。 |
| 3. `rootDigest` 可伪造 | **CONFIRMED — TASK 1 BLOCKER** | `createRolloutResult(requestInput, assemblyInput)` 重新验证 request；结果的 mode、formal flag、policy provenance、rootDigest 全部从 validated request 派生。 |
| 4. `currentLastPlay` public consistency | **CONFIRMED WITH SCOPE LIMIT** | request factory 只验证 public-observable consistency；共享纯 public helper 与 source 共用；private replay 和完整 hidden-hand consistency 留给 `particleScenarioSource`。 |
| 5. candidate-dependent decision identity | **CONFIRMED — TASK 1 ARCHITECTURE BLOCKER** | 固定名称 `CanonicalCandidateDecisionAssociationIdentity` / `canonicalCandidateDecisionAssociationIdentity`，仅作 candidate-local result/trace association，隔离 CRN。 |
| 6. wildcard legality | **CONFIRMED — TASK 1 BLOCKER** | `canonicalActionIdentity` 保持 context-free；request factory 在已验证 game rank 下复用 `isHeartRankWild(card, gameRank)` 或等强度 engine helper 做 contextual legality。 |
| 7. bridge scenario validation | **CONFIRMED AS DEFENSE-IN-DEPTH — TASK 1 IMPORTANT** | bridge 强化 registered handle、metadata、scenario identity、deal/transfer、weight/ESS、safe projection；source 保留 replay/public consistency 二次防线。 |

以下详细条款、Task 1 计划和 Gate 必须与本裁决逐字同义；本状态表示 remediation code pending，不表示实现已完成。

## 0. 执行纪律与全局 allowlist

每个 Task 独立执行以下循环：只读检查 -> 列出 allowlist/forbidden -> 写一个最小失败测试 -> 运行并记录正确失败 -> 最小实现 -> focused GREEN -> 相关回归 -> TypeScript/build/diff 检查 -> 隐私/确定性/不可变性/失败原子性审计 -> 单一 commit -> 阶段报告并停止等待人工审查。Task 1–8 的每个实现步骤都必须同时写明 exact file、exact interface/symbol、RED test、预期的缺失行为失败、最小实现、验证命令和 commit 边界；不能用模糊词替代这些字段。Task 9 是无实现的 verification-only 例外，必须写明其 manifest、命令、exit-code 证据和最终 release gate。

Task 1–7 的 production/test 路径只能位于：

~~~text
src/ai/particles/particleBankRolloutAccess.ts       # 仅 Task 1
src/ai/rollout/**
tests/ai/rollout/**
scripts/benchmarks/d2f-rollout-budget-calibration.ts # 仅 Task 7
~~~

Task 8 另有一个冻结的正式旁路例外：允许修改 src/game/room.ts 的 runAiStep 一个调用点；不得修改 src/ai/aiDecisionEngine.ts 或已有 src/ai/tactics/representativeActionShadowObserver.ts。Task 9 不新增行为，只做验证。

任何 Task 都禁止修改 src/ai/planning/**、除 Task 8 指定调用点外的 src/game/room.ts、正式 decideAiAction 语义、package/package-lock/tsconfig/Vite 配置、全局 timeout、已有 D2e observer、无关依赖和其他 worktree。正式 formalExecutionAllowed 必须保持 false。

所有测试和命令在可能含嵌套 worktree 的仓库环境中显式使用：

~~~text
--exclude "**/.worktrees/**"
~~~

正常粒子 focused regression 固定为：

~~~text
npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
~~~

该命令的 fresh baseline 是 10 files / 136 tests / 136 passed，Vitest 2.1.9，Node 24.15.0 supplemental local evidence。--maxWorkers 1 --minWorkers 1 只用于逐文件诊断，不是正常回归命令；整套进程时限与单测 timeout 必须分开记录。`AWAITING_FIXED_BENCHMARK_RUNNER` 和 `AWAITING_NODE22_CI` 都不是 Task 1 blocker；前者只阻塞 Task 7 benchmark，后者只阻塞最终 release Gate。未取得 Node 22.22.2 证据前不得称为 D2F SHADOW RELEASE READY。

## 1. Frozen interface block

Task 1–9 使用 Design Spec 中完全相同的以下名字和字段，不另造别名：

~~~ts
type RolloutMode = "detached" | "offline" | "shadow";

type RolloutPolicyId = "d2f-lightweight-v1";

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
  policyId: RolloutPolicyId;
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

Task 1 校验要求三个 evidence threshold 都是正的 finite safe integer；validated request 中每个 threshold 还必须不超过 `ValidatedRolloutBudget.maximumWorkUnits`，否则返回对应的 typed invalid-evidence failure。

type RolloutRiskPolicy = Readonly<{
  schemaVersion: "d2f-rollout-risk-policy-v1";
  variancePenalty: number;
  downsideRiskPenalty: number;
}>;

`RolloutRequest` 是纯数据 public configuration。它只接受 `policyId: "d2f-lightweight-v1"`，不接受、执行、bind、clone、freeze 或保存 caller-provided policy、callback、factory 或 registry entry；validated request 及其递归可达属性不得含 function。未知 policy id、未知字段和 callback 注入返回既有 typed `invalid-request` failure。

当前唯一 policy id 不开放隐式扩展；新增 ID 必须由 D2G 或其他后续明确任务同步修改 literal union、内部 factory mapping、privacy/determinism/CRN pairing/regression tests，不得通过配置文件、环境变量或运行时 registry 绕过代码审查。

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

type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  publicState: RolloutPublicState;
  replicateIdentity: string;
  random: CrnView;
  validatedBudget: ValidatedRolloutBudget;
}>;

type CrnCoordinate = Readonly<{
  rootIdentity: string;
  scenarioIdentity: string;
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  randomDomain: string;
}>;

type CrnView = Readonly<{ value(semanticKey: string): number }>;

declare function deriveRandomDomain(coordinate: CrnCoordinate): string;

CRN 的冻结随机身份链严格为：

```text
root
+ scenario
+ replicate
+ ply
+ acting seat
+ random domain
+ semantic key
-> deterministic keyed value
```

`candidateId` 不得进入 random domain、tape、key、draw 或任何 keyed value；candidate 顺序、worker 完成顺序、对象地址、Map 插入顺序、`localeCompare` 和绝对数组位置也不得进入 identity。policy 只能调用 `CrnView.value(semanticKey)`，不存在共享 mutable `next()` cursor，keyed value 不能反向暴露 raw seed。相同语义随机事件在所有 candidate 间复用同一 domain/key；candidate-specific 且没有可比较对应物的事件使用明确的 candidate-free `unpaired:<event-kind>` domain/key 规则，无法形成公共语义时返回 typed failure。重复 semantic key 明确复用同一随机值，domain/key collision 必须由测试覆盖并区分有意复用和意外碰撞。

type CanonicalCandidateDecisionAssociationIdentity = string;

declare function canonicalCandidateDecisionAssociationIdentity(
  input: Readonly<{
    rootIdentity: string;
    candidateIdentity: string;
    ply: number;
    actingSeat: PublicSeat;
    semanticKey: string;
  }>,
): CanonicalCandidateDecisionAssociationIdentity;

type RolloutPolicyDecisionContext = Readonly<{
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
}>;

type InternalRolloutPolicy = Readonly<{
  chooseAction(observation: SeatLocalObservation, context: RolloutPolicyDecisionContext, crn: CrnView): RolloutPolicyResult;
}>;

type InternalRolloutPolicyFactoryResult =
  | { ok: true; policy: InternalRolloutPolicy }
  | { ok: false; failure: { kind: "unsupported-policy-id" } };

declare function createInternalRolloutPolicy(policyId: RolloutPolicyId): InternalRolloutPolicyFactoryResult;

type RolloutPolicyResult =
  | { ok: true; action: RolloutAction }
  | { ok: false; failure: RolloutPolicyFailure };

`RolloutReplicateInput` 不携带 executable policy。Task 4 kernel 只能通过 `createInternalRolloutPolicy(policyId)` 的 exhaustive literal mapping 获得固定 policy；factory 不接受 callback、class、factory、registry entry、模块路径或动态注册。`InternalRolloutPolicy` 只能接收 `SeatLocalObservation`、`RolloutPolicyDecisionContext` 和 `CrnView`，不得读取 Room/RoomState、对手完整手牌、`RolloutScenario.privateState`、raw ParticleBank scenario/record/weight/seed、HandPlanner、正式 `decideAiAction`、wall clock、`Math.random()`、global mutable state、worker id 或对象地址。

`policyId` 进入独立 evaluation/rollout configuration identity、configuration provenance、`RolloutResult` 或 aggregate diagnostics 中允许公开的 policy provenance，以及 offline/shadow evidence configuration record；不进入 `canonicalReplayContextIdentity`、`rootIdentity`、`rootDigest`、ParticleBank snapshot identity、scenario/replicate identity、ply/decision identity、acting-seat identity、random domain、semantic key、`CrnCoordinate` 或 CRN keyed value。root identity 描述动作前游戏事实，`policyId` 描述评估配置；相同 root/scenario/replicate 下不同 policy 必须共享 CRN coordinates，`candidateId` 继续不得进入 CRN coordinate。

type TeamUtility = -3 | -2 | -1 | 1 | 2 | 3;

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

type RolloutAggregateDiagnostics = Readonly<{
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  completedReplicateCount: number;
  expectedCompletedReplicateCount: number;
  candidateCount: number;
  workUnitCount: number;
  coverage: "complete";
}>;

Task 1 的 candidate summary 使用 candidate-local coverage：`expectedReplicateCount = acceptedScenarioCount * replicateCountPerScenario`，`completedReplicateCount` 是该 candidate 实际完成数。aggregate diagnostics 只使用全候选范围的 `expectedCompletedReplicateCount` 和 `completedReplicateCount`，分别由 candidate-local expected coverage 的 candidateCount 倍和所有 summary 的安全求和得到；不保留语义重复的 `totalCompletedReplicates`；result factory 必须核对 summary、ranking 和 aggregate 的 candidate/scenario/replicate/work 集合与计数一致。

type RolloutResult = Readonly<{
  schemaVersion: "d2f-rollout-result-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  policyId: RolloutPolicyId;
  rootDigest: string;
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;

type RolloutResultAssemblyInput = Readonly<{
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;

declare function createRolloutResult(
  requestInput: unknown,
  assemblyInput: unknown,
): RolloutContractResult<RolloutResult>;

type D2FShadowEvidence = Readonly<{
  schemaVersion: "d2f-shadow-v2";
  policyId: RolloutPolicyId;
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

type TeamUtilityFailure =
  | { kind: "invalid-finish-order"; reason: "duplicate-seat" | "missing-seat" | "unknown-seat" }
  | { kind: "unsupported-team-pair"; teamSeats: readonly PublicSeat[] };

type LeafEvaluationFailure =
  | { kind: "invalid-leaf-state"; reason: "duplicate-finish" | "unknown-seat" | "negative-hand-count" }
  | { kind: "rotation-tie-break-unproven"; evidence: string };

type RolloutPolicyFailure =
  | { kind: "no-legal-action"; actingSeat: PublicSeat }
  | { kind: "invalid-policy-context"; field: "ply" | "actingSeat" };

type RolloutKernelFailure =
  | { kind: "simulation-failed"; stage: "state-conservation" | "leaf-evaluation" | "replay" }
  | { kind: "policy-failed"; failure: RolloutPolicyFailure }
  | { kind: "budget-exhausted"; workUnits: number; maximumWorkUnits: number };

type RolloutAggregationFailure =
  | { kind: "non-finite-aggregate"; field: "expectedUtility" | "variance" | "risk" }
  | { kind: "coverage-mismatch"; expected: number; actual: number }
  | { kind: "empty-replicate-set"; candidateId: string };

type TeamUtilityResult =
  | { ok: true; utility: TeamUtility }
  | { ok: false; failure: TeamUtilityFailure };

type LeafEvaluationResult =
  | { ok: true; predictedFinishOrder: readonly PublicSeat[]; utility: TeamUtility }
  | { ok: false; failure: LeafEvaluationFailure };

type RolloutReplicateResult =
  | { ok: true; candidateId: string; scenarioIdentity: string; replicateIdentity: string; utility: TeamUtility; workUnits: number }
  | { ok: false; failure: RolloutKernelFailure };

type RolloutAggregationResult =
  | { ok: true; summary: CandidateRolloutSummary }
  | { ok: false; failure: RolloutAggregationFailure };

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

type RolloutContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: RolloutFailure };
~~~

所有 utility/leaf/policy/kernel/aggregation 返回值都是 ok: true 或 ok: false 的 discriminated union；失败 kind 使用 Design Spec 的精确 union，不使用共享的 count?: number。RolloutFailure 必须包含 effective-sample-size-too-low、insufficient-scenarios、insufficient-replicates、coverage-mismatch。候选数组位置和 candidateId 不得进入 CRN 坐标；baselineEvaluatorScore 不得进入 identity、random 或 policy。

Task 1–6 共用的 numeric contract 也在 `contracts.ts` 锁定：所有 measure 必须 finite，所有
count/index/ordinal/ply/work-unit 必须 safe integer 且非负，seat 必须在 `{0,1,2,3}`，权重必须
finite/非负并归一化，risk/variance 必须 finite/非负，所有乘积逐步检查 overflow。输入、
source result、summary、aggregateDiagnostics 和 shadow evidence 的 NaN/Infinity/非法整数都
必须在 success 前返回已有 typed failure；不能依赖 TypeScript 类型断言代替运行时验证。
`candidateId === canonicalActionIdentity(action)`、`scenarioIdentity === canonical
particleScenarioIdentity(...)`、`replicateIdentity === canonical(replicateOrdinal)`，而
`rootDigest` 只从同一 pre-action replay context identity 派生。

Task 1 review remediation 的 runtime boundary 固定为递归 plain data。request、candidate、action/group/card、budget、limits、evidence requirements、risk policy、scenario source input、public state、public history event、initial/final ledger、`seenEventHashes`、current trick、revealed transfer、recent action summary、snapshot identity、result assembly input、candidate summary 和 aggregate diagnostics 都必须在 spread、`structuredClone`、getter、canonical hash 或 freeze 前通过 `Reflect.ownKeys`、own data descriptor、允许 prototype、函数值和 array shape 检查。拒绝 getter/setter、symbol、未知 string key、异常 prototype、array expando、symbol/accessor index；dynamic dictionary 只接受 schema 定义的 string keys。Proxy trap 可能在检查时执行，trap 抛错必须转 typed failure，但不得声称检查 Proxy 能阻止 trap 本身执行；所有入口异常必须转 typed failure，不得 throw。

`RolloutBudget` 和 `RolloutBudgetLimits` 必须 exact own keys；validated output 逐字段复制允许字段，不使用保留未知字段的 spread，callback 不执行、bind、保存或返回。`deepFreeze` 只能遍历 `Reflect.ownKeys`，或作用于已经安全逐字段 clone 的 graph，不得以 `Object.values` 作为 hostile-input 安全边界。ParticleBank public handle 是唯一 opaque handle 例外，不遍历 WeakMap internals，但仍检查 public metadata/frozen boundary，private bridge 单独验证 projection。

`canonicalActionIdentity` 仅做 context-free action/card/wildcard canonical encoding；`createRolloutRequest` 在验证 `scenarioSourceInput.gameRank` 后复用 `isHeartRankWild(card, gameRank)` 或现有等强度 engine helper，拒绝普通牌、其他花色同 rank 和 joker wildcard，接受合法红心级牌，并在 contextual legality 后核对 candidateId。request identity 与 `particleScenarioSource` 共用同一不导出的纯 public consistency helper，验证 public history/ledger/current trick 的可证明 last-play seat、stable key、event index、card/group/pattern projection；不读 ParticleBank internals、不执行 private replay，完整 hidden-hand consistency 仍由 source replay 负责。

`createRolloutResult` 必须重新验证 request；`RolloutResultAssemblyInput` 只含 candidateSummaries、ranking 和 aggregateDiagnostics，不能含 rootDigest/rootIdentity/policyId/mode/formalExecutionAllowed/replayContextIdentity。result 的 mode、literal false formal flag、policyId 和 rootDigest 由 validated request 派生，rootDigest 内部只由 validatedRequest.rootIdentity 计算。`rootDigestFromReplayContextIdentity(string)` 不再是可接受任意 64 位 hex 的 public production entry；不得使用 WeakSet/object identity 或 global mutable registry。

## 2. Task 1 — historical bridge implementation record

> 本节记录 expected HEAD 已完成的 bridge/source remediation。其旧的五路径 scope 与 RED 1–16 仅作历史证据；下一轮 final-gate code remediation 只执行第 2.1 节，且本轮 docs-only 不修改本节所列 production/test 文件。

### Scope

允许创建/修改：

~~~text
src/ai/particles/particleBankRolloutAccess.ts
src/ai/rollout/contracts.ts
src/ai/rollout/particleScenarioSource.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
~~~

禁止修改所有其他 src/ai/particles/**、Room、planning、public barrel、package 和配置。

Task 1 只实现 contracts 中的 identity 基础契约（`CrnCoordinate`、root/scenario/replicate
identity 字段、candidate-local association identity 和 `candidateId === canonicalActionIdentity(action)`
的边界）、递归 hostile-input validation、contextual wildcard legality、共享 public consistency
helper、result assembly revalidation、一个窄 ParticleBank bridge 和 replay-ready source。bridge
只能形成 `particleBankRolloutAccess.ts -> particleScenarioSource.ts -> kernel-isolated state ->
seat-local observation -> policy` 的唯一链；bridge 最低保证包括 registered handle、合法 public
metadata、非空唯一 particleId、scenario/deal/transfer schema、particleScenarioIdentity、weight
sum、ESS、逐字段 clone/freeze 和已有 `fake-or-unknown-particle-bank` 或
`{ kind: "scenario-source-failed"; reason: "private-state-invalid" }` typed failure，source 必须保留 replay/public
consistency 二次验证。Task 1 不得创建或实现 `identity.ts`/`crn.ts` 的 deterministic stream、Team
Utility、leaf、executable policy、kernel、aggregation、ranking、shadow observer 或 Room 接入；这些行为分别留给后序 Task。Task 1 不得使用通用 validation framework、registry 或扩大 public barrel。

### TDD actions

#### Independent review remediation RED matrix

以下十六个 RED 必须分别运行在真实 production entry 上；每个 RED 先记录当前缺失行为，再用同一命令在最小 production 修复后转 GREEN。fixture、import failure、环境缺失和 timeout 都不能充当预期失败原因。

| # | Exact RED test and production entry | Expected missing behavior before the minimal fix |
| ---: | --- | --- |
| 1 | `particleBankRolloutBoundary.test.ts` 调用 `createRolloutRequest`，把 callback 放入 `budget` | `validateRolloutBudget` 非 exact-key 或 spread 让 function 进入 success request；目标是 typed `invalid-budget` 且 callback 未执行/bind/保存/返回。 |
| 2 | `particleBankRolloutBoundary.test.ts` 调用 `createRolloutRequest`，把 symbol key 或 accessor 放入 `limits` | nested symbol/accessor 未被拒绝或 getter 被读取；目标是 typed failure 且无 function 进入 validated request。 |
| 3 | `particleBankRolloutBoundary.test.ts` 调用 `createRolloutRequest`，把 function 放入 nested ledger `seenEventHashes[symbol]` | nested ledger dynamic dictionary 逃逸 unknown symbol/function；目标是 schema failure，不产生 success root。 |
| 4 | `particleBankRolloutBoundary.test.ts` 以带计数 getter 的真实 request input 调用 `createRolloutRequest` | getter 在 validation、clone 或 hash 期间被执行；目标是先拒绝 accessor descriptor，getter 计数保持为零并返回 typed failure；Proxy trap 若抛错只转 typed failure。 |
| 5 | `particleBankRolloutBoundary.test.ts` 通过 `createRolloutRequest` 覆盖 candidate/action/group/card/evidence/risk 的 extra/accessor 输入 | 某个 nested envelope 仍接受未知字段、accessor 或 function；目标是逐层 typed failure。 |
| 6 | `particleScenarioSource.test.ts` 用真实 `createRolloutResult(requestInput, assemblyInput)` 传入任意 64 位 hex `rootDigest` | caller digest 能直接进入 success；目标是 result factory 忽略/拒绝 assembly digest，并只从 revalidated request 派生。 |
| 7 | `particleScenarioSource.test.ts` 用真实 result factory 传入携带 root/policy/mode/formal flag 字段的 assembly input | assembly boundary 接受 caller provenance 或可配置 formal flag；目标是 schema failure 或 typed result failure，success 字段仍来自 validated request。 |
| 8 | `particleScenarioSource.test.ts` 通过 `createRolloutRequest` 提交 last-play seat、stable key、public event、trick index mismatch | request 在 root identity 前未证明 public consistency；目标是 typed public-consistency failure，且不越界验证 hidden hands。 |
| 9 | `particleBankRolloutBoundary.test.ts` 对真实 symbol/import 图执行 AST gate，检查 `canonicalCandidateDecisionAssociationIdentity` 与 `deriveRandomDomain`/`CrnView` 的隔离 | candidate association identity 可被 random API 导入，或仍暴露通用 `canonicalDecisionIdentity`；目标是 symbol gate failure。 |
| 10 | `particleBankRolloutBoundary.test.ts` 通过真实 `createRolloutRequest` 把普通牌标为 wildcard | context-free action identity 被误当成 contextual legality，普通牌错误通过；目标是 typed wildcard-legality failure。 |
| 11 | `particleBankRolloutBoundary.test.ts` 通过真实 `createRolloutRequest` 使用合法当前 game rank 红心级牌 wildcard | request 尚未执行 engine-context legality，或合法 wildcard 被误拒绝；目标是合法输入 success。 |
| 12 | `particleBankRolloutBoundary.test.ts` 调用真实 `readParticleBankRolloutAccess`，使用已登记但 malformed scenario | bridge success 语义过弱，malformed scenario 被接受；目标是已有 `fake-or-unknown-particle-bank` 或 `{ kind: "scenario-source-failed"; reason: "private-state-invalid" }` typed failure。 |
| 13 | `particleBankRolloutBoundary.test.ts` 调用真实 bridge，构造 `particleId !== particleScenarioIdentity(bank.snapshot, scenario)` | bridge 未锁定 particle/scenario identity；目标是 typed identity failure。 |
| 14 | `particleBankRolloutBoundary.test.ts` 调用真实 bridge，构造 weight sum 超 tolerance 或 ESS 超 scenario count | bridge 未验证 conservation/ESS；目标是 typed weight/ESS failure。 |
| 15 | `particleScenarioSource.test.ts` 通过真实 bridge/source entry 传入 hostile nested accessor | bridge/source 在 schema 检查前执行 caller accessor，或异常 throw 逃逸；目标是 accessor 未执行且 typed failure。 |
| 16 | `particleBankRolloutBoundary.test.ts` 与 `particleScenarioSource.test.ts` 对 request/result/bridge/source 的 hostile input 统一断言 `RolloutContractResult` failure | 任一入口 throw、返回 partial success 或暴露 raw failure；目标是所有 failure 为 discriminated typed union 且不 throw。 |

固定 RED→GREEN 协议：每个条目先用真实入口和最小 hostile input 记录预期行为缺失；确认失败不是 fixture、import 或环境错误；只完成对应的最小 production 修复后，用完全相同命令转 GREEN；不得先写完全部 production 再补测试。correctness tests 与 benchmark timing 严格分离。

Task 1 remediation 的最小实现顺序、文件和 commit 边界固定如下：

| Implementation slice | Exact production/test paths | RED and missing behavior | Minimal implementation and verification |
| --- | --- | --- | --- |
| Contracts/data boundary | `src/ai/rollout/contracts.ts`; `tests/ai/rollout/particleBankRolloutBoundary.test.ts`; `tests/ai/rollout/particleScenarioSource.test.ts` | RED 1–11、16；嵌套未知字段、accessor、symbol/function、伪造 digest、public last-play mismatch 或 wildcard legality 仍可进入 success | 先加入非导出 plain-data/descriptor/prototype/array checks、exact budget/limits field-by-field clone、共享 public consistency helper、engine wildcard legality 和两参数 result factory；使用两份 exact test paths 的 focused Vitest 命令转 GREEN；不创建通用 validator/registry。 |
| Private bridge projection | `src/ai/particles/particleBankRolloutAccess.ts`; `tests/ai/rollout/particleBankRolloutBoundary.test.ts` | RED 12–14；registered malformed scenario、identity mismatch、weight/ESS 不一致仍可返回 bridge success | 只在唯一 bridge 中读取 private internals，复用 `particleScenarioIdentity`/`validateCanonicalInitialDeal`，逐字段 clone/freeze projection 并返回已有 `fake-or-unknown-particle-bank` 或 `{ kind: "scenario-source-failed"; reason: "private-state-invalid" }` failure；用 bridge focused command 转 GREEN。 |
| Source defense-in-depth | `src/ai/rollout/particleScenarioSource.ts`; `tests/ai/rollout/particleScenarioSource.test.ts` | RED 15；source/bridge hostile accessor 可执行或 throw 逃逸，source 二次 public/replay validation 缺失 | 保留 source 的 canonical identity、weight、replay 和 public consistency 二次验证，统一捕获异常为 typed failure；用 source focused command 转 GREEN。 |

上述三个 slice 只能作为同一个 Task 1 implementation commit 的连续 RED→GREEN 过程；完成一 slice 后不得实现 Task 2–9 内容。Task 1 最终验证只检查这五个 allowlisted paths、`git diff --check`、focused correctness 和 AST/symbol import/export gate；不运行 benchmark，不修改 production 外的路径。

- [ ] 只读确认 readParticleBankInternals 返回 ParticleRecord、ParticleScenario 和 normalized weight，并记录真实 replayParticleScenario 参数。
- [ ] 创建测试骨架 describe("D2F ParticleBank bridge")，加入 it("rejects a fake ParticleBank handle before reading records")。
- [ ] 运行 npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose；首个 RED 预期为目标模块/函数不存在，而不是 timeout。
- [ ] 加入 it("allows only the approved bridge to resolve readParticleBankInternals") 和 AST/symbol 检查：rollout 文件只能通过 particleScenarioSource.ts 访问桥接；不得出现对 particleBankInternals.ts 的其他 import/export。
- [ ] 加入 identity contract assertion：`CrnCoordinate` 的 root/scenario/replicate/ply/seat/domain 字段、canonical candidate identity 和 replay-context identity 的字段存在，但不得提供 `next()`、raw seed 或 candidate-dependent draw API。
- [ ] 加入 it("builds replay-ready source from bank plus public history/ledger context")，构造包含 bank、publicHistoryEvents、initialLedger、finalLedger、gameRank、perspectiveSeat、ownCurrentHand、publicState 的 RolloutScenarioSourceInput。
- [ ] 最小实现窄桥接，校验 fake/unknown handle、ledger hash/index、game rank、perspective seat 和己方 hand，再按真实 replay API 构造 RolloutScenario；只返回不可变私有投影。
- [ ] Bridge RED/GREEN 逐项覆盖 registered handle/public metadata、records 非空、particleId 非空唯一、scenario/deal/hidden transfer schema、particleId 与 `particleScenarioIdentity`、normalizedWeight、weight sum tolerance、ESS 上限和 field-by-field recursive freeze；source 不因 bridge 增强而删除 replay/public consistency 防线。
- [ ] 加入 it("does not expose raw scenario, four-seat hands, weight detail, or seed in public diagnostics")。
- [ ] PolicyId boundary GREEN：重复运行同一 focused test，确认合法 literal `"d2f-lightweight-v1"` 成功，任意 policy id、未知 policy 字段、callback/closure/function 递归可达性失败；不执行、bind、clone、freeze 或保存 caller function，Task 4 只验证 internal factory。
- [ ] GREEN：重复执行两个 focused commands，分别得到所有测试通过，且 policy/diagnostics 不可接收 privateState。
- [ ] 回归 npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot；验证不少于 10 files / 136 tests，不能减少既有断言。
- [ ] 运行 npx tsc --noEmit、仓库既有 build command、git diff --check；审计输入和 ParticleBank 未被修改。
- [ ] 只提交本 Task 的 allowlist，使用 git commit -m "feat(ai): add D2F rollout contracts and bridge"；报告 first RED、测试数、隐私和 failure atomicity。

### Produces / consumes

Produces frozen contracts, RolloutScenarioSourceInput, source success/failure union and one private bridge. Consumes existing public ParticleBank handle plus complete replay context; does not enlarge the public ParticleBank API.

## 2.1 Task 1 Final Gate Remediation Design Freeze

本节是当前 expected HEAD 5cd433d3e623e7e516effb36ab5bc080f5427d1a 的唯一下一轮 Task 1 code remediation plan。本轮只冻结文档，不修改 production/test；Task 2–9 不开始。I-1、I-2、I-3 均已用真实类型、builder、ESS helper、result factory 和现有测试入口核对，不能以 fixture 自洽或实施者 PASS 代替后续 RED/GREEN 证据。

### Frozen review findings and implementation goal

| Finding | 真实根因 | 最小修复目标 |
| --- | --- | --- |
| I-1 ESS boundary/public metadata | ESS helper 使用严格小于，但 particleBankBuilder 的 top-level bank status 使用小于等于；request public validator 还需要冻结完整 schema、identity、状态、计数和 ESS 关系。 | 只让 builder bank status 复用同一个 ESS helper status；在 contracts.ts 完成 public metadata exact validation，并冻结真实 builder 能产生的状态/计数不变量。 |
| I-2 result provenance | createRolloutResult 当前校验 candidate 集合和 assembly 内部算术，却未把 baselineEvaluatorScore、replicateCountPerScenario、acceptedScenarioCount 和 ESS 与已验证 request 绑定。 | 结果只能由 validated request 的 candidate/budget/source provenance 组装；assembly 继续只接受真实的三个字段。 |
| I-3 test gate completeness | 现有测试没有直接覆盖 builder 的小于、等于、大于三个 ESS 关系，也没有完整覆盖 request metadata conflict 和 result/request provenance conflict。 | 用真实 production entry 先写逐项 RED，再以最小修复转 GREEN；所有 failure 均 typed、no-throw、no-partial。 |

I-1 的 frozen ESS semantics 为：

~~~text
ESS < threshold  -> degraded
ESS == threshold -> ready
ESS > threshold  -> ready
bank.status === summary.status === effectiveSampleSizeResult.status
~~~

真实 builder 成功路径同时必须保持：

- acceptedParticleCount 等于 requestedParticleCount，且等于 config.particleCount；
- samplingAttempts 不超过 config.maxSamplingAttempts，且不小于 acceptedParticleCount + duplicateCount；
- duplicateCount 是真实 sampler identity duplicate 计数，范围为 0 到 samplingAttempts，不额外发明 duplicateCount 不超过 acceptedParticleCount；
- zeroWeightCount 是 normalized weights 中等于 0 的真实计数，范围为 0 到 acceptedParticleCount；
- normalized weights 在 builder tolerance 内求和为 1，ESS finite 且在 1 到 acceptedParticleCount 之间；
- ready/degraded public bank 不携带 own failureReason；failed summary 只属于 build failure，不伪装成 public success bank。

### Exact next code allowlist

下一轮实现只允许触碰以下路径；两个注释表示条件性测试路径，不得解释为扩大 production scope：

~~~text
src/ai/particles/particleBankBuilder.ts
src/ai/rollout/contracts.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/effectiveSampleSize.test.ts        # only if necessary
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts       # only for responsibility regression
~~~

以下路径明确 forbidden：

~~~text
src/game/room.ts
src/ai/aiDecisionEngine.ts
src/ai/planning/**
src/ai/particles/particleBankInternals.ts
src/ai/particles/particleBankRolloutAccess.ts
src/ai/rollout/particleScenarioSource.ts
package.json
package-lock.json
tsconfig.json
vite.config.ts
~~~

如果调查证明 forbidden path 是无法绕开的真实根因，必须停止并报告证据，不得自行扩大 allowlist。不得创建新的 registration accessor、brand token、global registry、public barrel、通用 validation framework 或新增 public ParticleBank 字段。

### Bite-sized RED → GREEN implementation steps

#### Slice A — builder ESS status alignment

1. 在 tests/ai/particles/particleBankBuilder.test.ts 直接调用真实 buildParticleBank，构造真实可产生的 normalized-weight 场景，分别覆盖 ESS 小于、恰好等于、大于 degradedEssThreshold；同时断言 helper result、summary 和 top-level bank 的 status。
2. 首个 RED 必须证明 particleCount = 1、weights = [1]、threshold = 1 的现状冲突是 builder 小于等于分支，而不是 fixture 或 mock validator。
3. 最小 production 修复只修改 src/ai/particles/particleBankBuilder.ts 的 top-level status 选择，使 bank.status 复用 helper status；不得复制第二套阈值比较。
4. 如 helper 本身需要独立 exact-threshold 断言，才增加 tests/ai/particles/effectiveSampleSize.test.ts；否则不改该文件。
5. GREEN 还必须覆盖 builder 的 accepted/attempt/duplicate/zero-weight/ESS/status/failure 不变量，并确认合法边界 0 与 particleCount = 1 不被错误拒绝。

#### Slice B — public ParticleBank request boundary

1. 在 tests/ai/rollout/particleBankRolloutBoundary.test.ts 直接调用真实 createRolloutRequest，使用真实 registered ParticleBank handle；不通过测试 mock、复制 validator 或重新构造 private record。
2. contracts.ts 必须先验证 top-level 和每个 nested public object 的 strict prototype、Reflect.ownKeys exact set、own data descriptors、无 symbol/accessor/function、frozen/plain-data，再读取值；snapshot、config、summary、failure metadata 等 nested object 同样受保护，getter 调用计数必须为 0。
3. exact public schema 固定为 ParticleBank 的 schemaVersion、snapshot、config、particleCount、effectiveSampleSize、status、summary；snapshot 为真实八字段，config 为真实六字段，accepted ready/degraded summary 为真实 status/count/ESS 字段；failureReason 只属于 status=failed 的 private summary/build-failure union，public success summary exact own keys 不包含它。不得发明 rejected 字段。
4. 绑定 snapshot identity、config identity、config particle count、requested/accepted/top-level particle count、status/summary status、public/summary ESS、samplingAttempts/maxSamplingAttempts、duplicateCount、zeroWeightCount 和 failureReason 的真实关系；ready/degraded bank 拒绝 own failureReason。
5. 数值 RED 必须逐字段覆盖 NaN、Infinity、-Infinity、fractional、negative、-0、unsafe integer、上限溢出、合法 0 和合法最大边界；Object.is(value, -0) 对所有 numeric field 均拒绝，只有正零可出现在真实允许的 attempts、duplicate 和 zero-weight 字段；正 count/config limit 不接受零。public/summary ESS metadata equality 的绝对误差固定为 <= 1e-9，helper computation 仍使用 builder 的 1e-12..1e-6 tolerance/clamp。
6. 仍保持合法 registered handle 的 object identity、WeakMap registration 和 caller isolation；request 阶段不读取 private records、不 spread/clone/rebuild handle。合法但 unregistered public handle 只在 source/bridge 阶段返回 typed fake-or-unknown-particle-bank。

#### Slice C — result/request provenance binding

1. 在 tests/ai/rollout/particleBankRolloutBoundary.test.ts 直接调用真实 createRolloutResult(requestInput, assemblyInput)，先确认当前 request budget repeat count 与 assembly repeat count 不一致仍错误通过，作为 I-2 RED。
2. contracts.ts 只允许当前真实 RolloutResultAssemblyInput 的 candidateSummaries、ranking、aggregateDiagnostics 三个 own fields；assembly 注入 budget、scenario count、repeat count、root、policy、mode 或 formal 字段必须 typed reject。
3. summary candidateId/ranking 集合必须与 request candidates 精确相等；对应 candidate 的 baselineEvaluatorScore 必须 finite 且 Object.is 精确相等，保留 -0；summary 和 aggregate replicateCountPerScenario 必须精确等于 request budget.replicateCountPerScenario；summary 和 aggregate acceptedScenarioCount 必须精确等于已验证 request.scenarioSourceInput.bank.summary.acceptedParticleCount，且该值必须等于 bank.particleCount、config.particleCount 和 requestedParticleCount；expectedReplicateCount、completedReplicateCount、expectedCompletedReplicateCount 和 aggregate ESS 必须由这些已验证 request fields 约束，aggregate ESS 必须匹配 request.scenarioSourceInput.bank.effectiveSampleSize 的 public tolerance。
4. 结果的 mode、formalExecutionAllowed、policyId、rootDigest 继续只能从 validated request 派生；不得从 assembly 重建、接受 caller digest 或添加不存在的 provenance 字段。
5. 使用至少两个 candidate、多个 accepted scenarios 和多个 replicates 的合法正例，证明映射不是只对单 candidate fixture 自洽；对 baseline 修改、candidate 交叉 baseline、repeat mismatch、scenario/repeat product mismatch、bank accepted count/ESS mismatch、foreign/missing/duplicate summary 和 ranking mismatch 逐一 RED→GREEN。当前真实类型没有 expectedScenarioCount、completedScenarioCount 或 totalCompletedReplicates；不得新增这些字段或用 assembly 自报值替代 request.bank public provenance。

#### Slice D — responsibility regression only

只有在 Slice B/C 的测试需要证明 failure 发生在 source/bridge responsibility boundary 时，才修改 tests/ai/rollout/particleScenarioSource.test.ts。不得修改 forbidden 的 particleScenarioSource.ts、particleBankRolloutAccess.ts 或 particleBankInternals.ts。测试应证明 public-valid but unregistered handle 经 request public validation 后，由 source/bridge 返回 typed fake-or-unknown-particle-bank，且不返回 partial scenario、不泄漏 private diagnostics。

### Complete RED/GREEN acceptance matrix

| Gate | 必须先 RED 的真实场景 | GREEN 必须证明 |
| --- | --- | --- |
| I-1 ESS | real builder 的 ESS <、==、> threshold，含 particleCount = 1 / threshold = 1 | helper、summary、bank status 一致；builder success invariants 与合法边界值保持成立 |
| I-1 public shape | missing key、enumerable/non-enumerable extra key、symbol、accessor/getter、custom/inherited prototype、malformed descriptor | exact schema、strict plain/frozen/data-only 检查先于 value read，getter 0 次 |
| I-1 identity/status | snapshot/config identity conflict、config count conflict、status conflict、summary conflict、ready/degraded failureReason、public/summary ESS conflict | typed invalid-request、no throw、no partial request，不泄漏私有信息 |
| I-1 numeric | 每个真实 count/limit/measure 字段的 NaN、Infinity、-Infinity、fractional、negative、-0、unsafe integer、overflow、合法 0、合法最大值 | safe-integer/finite/range/tolerance 语义与真实 builder 一致，不错误拒绝合法零值 |
| I-2 provenance | request 与 result baseline、budget repeat、accepted scenario count、ESS 不一致；foreign/missing/duplicate candidate；ranking mismatch；assembly 注入 provenance | exact request/result mapping，Object.is baseline，产品字段只从 validated request 派生 |
| I-3 failure quality | hostile callback/getter/Proxy trap、fake/unknown handle、malformed private projection、所有 invalid union 分支 | typed classification、no throw、no partial result、无 raw scenario/hands/assignment/weight/seed/tape/cursor diagnostics，callback/getter 0 次 |

### Verification boundary for the next code pass

下一轮 code remediation 完成后才运行 focused boundary、source、combined 和 particle baseline commands，以及 tsc/build/diff-check；本轮 docs-only 不运行 Vitest、tsc、build 或 benchmark。任何 forbidden path、package/config、Room、decision engine、planning 或 Task 2–9 变更都使该轮 BLOCKED。固定 benchmark runner、Node 22 CI 和 Task 9 full permitted regression 继续是 deferred gates；不得宣称 D2F Shadow release ready。

## 3. Task 2 — Team Utility / terminal truth table / leaf

### Scope

允许创建/修改：

~~~text
src/ai/rollout/teamUtility.ts
src/ai/rollout/leafEvaluation.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/rollout/leafEvaluation.test.ts
~~~

### TDD actions

- [ ] 创建 describe("teamUtility")，先加入 it("maps all six valid team rank pairs")，断言 {1,2} 到 {3,4} 的六个值为 3,2,1,-1,-2,-3。
- [ ] RED：npx vitest run tests/ai/rollout/teamUtility.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期为 export/module/function 不存在。
- [ ] 加入 it("rejects zero utility and malformed finish orders")，覆盖缺失、重复、未知座位和 zero。
- [ ] 加入 it("preserves team swap sign, seat rotation, and partner interchange")；使用相对团队座位，不用绝对 seat number。
- [ ] 创建 describe("leafEvaluation") 与 it("projects unfinished seats by hand count then relative turn distance")。
- [ ] 加入 it("keeps completed finish order before unfinished projection") 和 it("replays the same leaf state identically")。
- [ ] 最小实现 utility lookup、finish validation、hand-count/tie-distance projection 和同一 utility truth table；禁止经验系数、额外搭档奖励。
- [ ] 若仓库轮转事实无法证明 tie-break 旋转等变，停止该实现并报告证据，不能改成绝对 seat number。
- [ ] GREEN focused：两个文件全部通过；回归 Task 1 contracts。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；审计 TeamUtility 不包含 zero。
- [ ] 使用 git commit -m "feat(ai): add D2F team utility and leaf evaluation"；提交后停止。

### Produces / consumes

Produces TeamUtilityResult、LeafEvaluationResult 和纯函数 leaf evaluator。Consumes RolloutPublicState、finish order、hand counts、team seat metadata；不读取 Room 或 hidden hands。

## 4. Task 3 — keyed CRN identity and replay

### Scope

允许创建/修改：

~~~text
src/ai/rollout/crn.ts
src/ai/rollout/identity.ts
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
~~~

### TDD actions

- [ ] 加入 it("does not include candidateId in random domain or semantic key")，对两个 candidateId 使用同一 coordinate 逐字段比较 random bytes/value。
- [ ] RED：npx vitest run tests/ai/rollout/crnIdentity.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期为候选无关 deriveRandomDomain/CrnView 尚不存在或签名不匹配。
- [ ] 加入 it("returns the same keyed value for the same scenario replicate ply seat and semantic key")。
- [ ] 加入 it("gives common legal actions the same priority across candidate simulations")，semantic key 使用 canonical action identity。
- [ ] 加入 it("changes the deterministic stream when replicate ordinal changes")，证明 replicateCount 不是无意义循环。
- [ ] 加入 it("is independent of candidate array order and completion order")，将结果按 candidateId 重排后比较 byte-stable canonical summary。
- [ ] 加入 candidate-specific/unpaired event test：有对应事件的 candidates 复用相同 domain/key；无对应物时只能使用不含 candidateId 的 `unpaired:<event-kind>` 规则，无法形成公共语义时返回 typed kernel failure。
- [ ] 加入 duplicate-key/collision test：同一 coordinate 重复查询同一 semantic key 必须复用同一值；不同事件使用不同 canonical key；domain/key 编码碰撞被拒绝或显式区分。
- [ ] 加入 canonical-source prohibition test：semantic key/domain 不依赖对象地址、Map 插入顺序、localeCompare、绝对 seat number 或绝对 candidate 数组位置；`CrnView.value` 不能暴露 raw seed/tape/cursor。
- [ ] 加入 AST/symbol isolation RED/GREEN：只允许 `canonicalCandidateDecisionAssociationIdentity` 用于 candidate-local result/trace association；`deriveRandomDomain`、`CrnCoordinate`、`CrnView.value` 和 keyed-value call chain 不得 import 或接收该 identity，也不得恢复通用 `canonicalDecisionIdentity`。
- [ ] 最小实现 canonical identity encoding、候选无关 deriveRandomDomain(coordinate) 和无 cursor 的 CrnView.value(semanticKey)；不得使用 Math.random、object enumeration 或 shared mutable RNG。
- [ ] GREEN：focused CRN tests 全通过；回归 Task 1–2。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；扫描 candidateId 不在 random domain/tape/key/draw 调用链。
- [ ] 使用 git commit -m "feat(ai): add keyed D2F CRN identity"；提交后停止。

### Produces / consumes

Produces CrnView、CrnCoordinate、canonical identity helpers and deterministic replicate streams. Consumes root/scenario/replicate/ply/seat/domain coordinates and semantic action keys only.

## 5. Task 4 — seat-local policy and rollout kernel

### Scope

允许创建/修改：

~~~text
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
src/ai/rollout/stateConservation.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

### TDD actions

- [ ] 加入 it("maps the supported policy id to one fixed internal policy")，只调用 `createInternalRolloutPolicy("d2f-lightweight-v1")`，不得传 callback、factory 或 registry。
- [ ] RED：npx vitest run tests/ai/rollout/policy.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期为 `InternalRolloutPolicy`/factory 或 keyed policy 不存在。
- [ ] 加入 it("rejects unknown policy ids without fallback")，覆盖 `custom`、空字符串、非字符串和未知 literal，返回 typed `unsupported-policy-id` 或 exhaustive unreachable。
- [ ] 加入 it("receives RolloutPolicyDecisionContext and CrnView only")，spy 只提供 `value(semanticKey)`，拒绝 `next()` 属性，并断言 policy 不能访问 Room、privateState 或 full hands。
- [ ] 加入 it("keeps the validated request free of function values")，递归检查 request 可达属性不存在 `typeof value === "function"`。
- [ ] 加入 it("rejects callback, closure, factory and registry injection")，确认 callback 不被调用、bind、保存或进入返回对象，捕获状态变化不影响 request。
- [ ] 加入 it("does not expose other seats' complete hands or ParticleScenario to policy")，检查 observation shape 和 AST/symbol imports。
- [ ] 加入 it("does not import full HandPlanner")，对 src/ai/rollout/** 做 AST import prohibition。
- [ ] 加入 AST/symbol gate：request factory 不出现 `.bind(`，public contracts 不暴露 caller policy factory；Task 4 policy 不导入 Room、HandPlanner、ParticleBank internals/source，且不存在 dynamic policy registry、Math.random 或 wall-clock。
- [ ] 加入 malformed-number/seat test：NaN、Infinity、负数、小数、overflow work-unit、非法 seat 和 mutable observation 都在 policy/kernel 边界 typed-fail，不能进入 success result。
- [ ] 在 kernel test 加入 it("uses the explicit ValidatedRolloutBudget and stops by work-unit count")；传入小的 explicit budget/limits，不读取全局 profile 或 wall clock。
- [ ] 加入 it("preserves card conservation and fails atomically on invalid state")。
- [ ] 最小实现 exhaustive policy-id mapping、canonical legal-action enumeration、keyed priority、seat-local observation、validated budget consumption 和 state conservation checks；所有 kernel errors 返回 RolloutReplicateResult failure。
- [ ] GREEN：policy/kernel/privacy focused tests 全部通过；回归 Task 1–3。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；确认候选顺序和 worker 调度不改变 result。
- [ ] 使用 git commit -m "feat(ai): add D2F seat-local rollout kernel"；提交后停止。

### Produces / consumes

Produces `InternalRolloutPolicy`、RolloutPolicyResult、RolloutReplicateResult、fixed policy factory、seat-local policy and finite-budget kernel. Consumes `RolloutRequest.policyId`、RolloutReplicateInput、CrnView、ValidatedRolloutBudget and replayed private state only inside the kernel; policy sees only its seat-local projection and is never caller-injected.

## 6. Task 5 — evidence gate / aggregation / risk ranking

### Scope

允许创建/修改：

~~~text
src/ai/rollout/aggregation.ts
src/ai/rollout/ranking.ts
src/ai/rollout/evidenceGate.ts
tests/ai/rollout/evidenceGate.test.ts
tests/ai/rollout/aggregation.test.ts
tests/ai/rollout/ranking.test.ts
~~~

### TDD actions

- [ ] 加入 it("rejects low ESS before entering the candidate loop")，断言 failure.kind 为 effective-sample-size-too-low，并用 spy 证明 kernel 未被调用。
- [ ] RED：npx vitest run tests/ai/rollout/evidenceGate.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期 evidence gate/export 不存在。
- [ ] 加入 it("rejects insufficient scenarios before entering the candidate loop") 与 it("rejects insufficient replicates and coverage mismatch")，覆盖四个 exact failure kinds。
- [ ] 加入 it("uses scenario weight times replicate as the aggregation denominator")，断言 candidate 数量不改变分母。
- [ ] 加入 it("computes riskAdjustedUtility with the frozen variance and downside formula")。
- [ ] 加入 it("orders unrounded risk adjusted utility, expected utility, baseline score, then UTF-16 candidateId")。
- [ ] 加入 it("does not change ranking when public values are rounded to six digits")。
- [ ] 加入 numeric/result-boundary tests：非 finite utility/aggregate、非法 count/weight、任意 caller `rootDigest`、assembly 中 root/policy/mode/formal flag 字段、summary/ranking candidate set mismatch 都通过真实两参数 result factory 返回 exact typed failure，不产生伪造 success 或 public `aggregateDiagnostics`。
- [ ] 最小实现 pre-candidate evidence validation、complete scenario/replicate coverage check、weighted expected/variance/risk、risk formula 和未舍入排序；只有最后一步才生成 RolloutResult。
- [ ] GREEN：focused evidence/aggregation/ranking tests 全通过；回归 Task 1–4。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；审计 RolloutResult 只使用 rootDigest，且 aggregateDiagnostics 字段完全一致。
- [ ] 使用 git commit -m "feat(ai): add D2F evidence aggregation and ranking"；提交后停止。

### Produces / consumes

Produces RolloutAggregationResult、CandidateRolloutSummary、RolloutAggregateDiagnostics and complete RolloutResult. Consumes all candidate-independent scenario/replicate records with the same coverage and explicit RolloutEvidenceRequirements/RolloutRiskPolicy.

## 7. Task 6 — detached orchestration and failure atomicity

### Scope

允许创建/修改：

~~~text
src/ai/rollout/rolloutOrchestrator.ts
src/ai/rollout/rolloutInputFreeze.ts
tests/ai/rollout/rolloutOrchestrator.test.ts
tests/ai/rollout/failureAtomicity.test.ts
~~~

Task 6 是 detached orchestration + failure atomicity；它不是 Shadow integration，不创建 observer，不修改 Room，不添加 call site。

### TDD actions

- [ ] 加入 it("returns no partial RolloutResult when one candidate replicate fails")。
- [ ] RED：npx vitest run tests/ai/rollout/rolloutOrchestrator.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期 orchestrator/export 不存在。
- [ ] 加入 it("keeps formalExecutionAllowed false and never returns an action to formal decision code")。
- [ ] 加入 it("does not mutate Room, ParticleBank, public ledger, candidates, or request input")，前后做 deep snapshot。
- [ ] 加入 it("reuses one immutable scenario set for every candidate")，spy source call count 为一次，candidate loops 只读取同一 source result。
- [ ] 加入 it("is invariant to candidate and scenario completion order")。
- [ ] 加入 it("keeps replay context, ParticleBank snapshot, public ledger, current trick, candidates and rootDigest on one immutable root")；变更/重排任一 caller-owned reference 后，原 request 和 result identity 不得漂移。
- [ ] 最小实现 request validation、input freeze、source once、evidence gate before candidate loop、candidate-independent CRN coordinates、atomic aggregation 和 detached return。
- [ ] GREEN：orchestration/failure tests 全通过；回归 Task 1–5 与粒子 focused command。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；确认仍无 observer/call site。
- [ ] 使用 git commit -m "feat(ai): add detached D2F rollout orchestration"；提交后停止。

### Produces / consumes

Produces the detached orchestrator and atomic RolloutResult/RolloutFailure boundary. Consumes only explicit request, immutable ParticleBank source and prior Task contracts. It produces no formal action and no Shadow telemetry.

## 8. Task 7 — measured budget calibration benchmark

### Scope

允许创建/修改：

~~~text
scripts/benchmarks/d2f-rollout-budget-calibration.ts
tests/ai/rollout/d2fBenchmarkContract.test.ts
~~~

当前只读工具证据：package.json/package-lock.json 声明 tsx ^4.19.2（lockfile 当前解析版本为 4.22.4），但当前 node_modules/tsx 与 node_modules/.bin/tsx.cmd 不存在。不得用 `npx tsx`、plain `npm exec`、全局安装或临时网络下载。`AWAITING_FIXED_BENCHMARK_RUNNER` 是 Task 7 preflight 状态，不是 Task 1 blocker。恢复顺序冻结为：在 source worktree 准备或 Task 7 preflight 的 Node 22.22.2 环境运行 `npm ci`；随后运行 `git diff --exit-code -- package.json package-lock.json` 验证 lockfile/package 未变化；验证 `Test-Path .\node_modules\.bin\tsx.cmd`（Windows，或 Unix 本地 binary）为 true；运行 `& .\node_modules\.bin\tsx.cmd --version`，再用同一 local fixed binary 执行 benchmark。任一步失败都保持 AWAITING 状态，不能跳过 benchmark RED。

### TDD actions

- [ ] 只读确认 benchmark entry 不存在、tsx package/lock declaration 和当前 local module 状态；不安装依赖。
- [ ] 先写 tests/ai/rollout/d2fBenchmarkContract.test.ts 的非计时契约测试：it("builds a ParticleBank from public tracked fixture data without serializing a handle")。
- [ ] 命令级 RED 在 fixed local runner preflight 通过后使用 `& .\node_modules\.bin\tsx.cmd scripts/benchmarks/d2f-rollout-budget-calibration.ts --fixture tests/fixtures/ai/d2f-public-rollout-fixture.json`（Unix 使用同一 local binary）；在 entry 尚不存在时预期为 entry/module not found。runner 尚不存在时状态为 AWAITING_FIXED_BENCHMARK_RUNNER，不能跳过这次 RED；这个 RED 只针对 benchmark entry，不改变既有 correctness Gate，也不修改测试断言。
- [ ] fixture 只承载已跟踪的 public identity、public ledger/history、game rank、acting/perspective seat、己方 hand 和公开配置；不得承载 WeakMap handle、raw hidden scenario、particle weights 或 seed。
- [ ] 最小脚本在进程内调用已有 public buildParticleBank(input) 创建 handle，再调用 detached orchestrator；seed 由 fixture identity 的 canonical deterministic derivation 在进程内产生，不写入 fixture、stdout 或 report。
- [ ] 输出只包含预算坐标、work units、elapsed telemetry 和脱敏 aggregate；不把 elapsed time 作为语义结果。
- [ ] GREEN 只能在 npm ci、package/lockfile unchanged、本地 `tsx.cmd`/`tsx` 存在并通过 `--version` 后用该 local binary 运行；禁止网络下载、禁止 npx 或 plain npm exec 自动解析。
- [ ] GREEN 只能在上述 local `tsx.cmd`/`tsx` fixed binary preflight 通过后运行；Task 7 只做 budget calibration，不启用 Shadow active mode、feature flag 或正式 action 分支。
- [ ] correctness command 与 benchmark command 分开运行：先 npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot，再执行固定 runner benchmark。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；记录 measured budget，不把它写成 production/active 默认值。
- [ ] 使用 git commit -m "bench(ai): calibrate D2F rollout budget"；提交后停止并等待人工批准 shadow profile。

### Produces / consumes

Produces independent microbenchmark evidence and a public fixture builder. Consumes the detached orchestrator and public build inputs; does not expose hidden scenario/weight/seed data.

## 9. Task 8 — real Shadow observer and non-interference

### Scope and required read-only audit

允许创建/修改：

~~~text
src/ai/rollout/d2fShadowObserver.ts
src/game/room.ts                         # 仅 runAiStep 一个调用点
tests/ai/rollout/d2fShadowObserver.test.ts
tests/ai/rollout/d2fShadowObserverIntegration.test.ts
tests/ai/rollout/d2fShadowByteLock.test.ts
~~~

先只读审计：

~~~text
src/ai/tactics/representativeActionShadowObserver.ts
src/ai/aiDecisionEngine.ts
src/game/room.ts:runAiStep
~~~

当前 representative observer 是 D2e 且位于正式 action 选择之前，不能被用作 D2F 接入证明。正式选择点的最小旁路冻结为 `src/game/room.ts:runAiStep` 的以下 pre-action/post-commit 数据流：原决策链生成并冻结 formal action、baseline score 和 canonical candidate projection；在 `passTurn`/`playCards` 执行前，从同一 Room root 捕获 immutable、脱敏的 `D2FShadowPreActionSnapshot`（包含 root identity/digest、ParticleBank handle、public ledger/history、current trick、game rank、己方 hand、public counts、candidate projection 和预算）；snapshot 构造置于独立 try/catch，失败只能产生 unavailable/fallback，不能阻止、替换或延迟 formal action；然后提交 `passTurn`/`playCards`、完成 runtime/plan 更新；最后把已捕获 snapshot 传给 `void observeD2FShadow(snapshot)`，observer 不得再读取已变化的 Room 来构造原 root。此调用点是 `room.ts` 唯一 Task 8 改动；不修改 `aiDecisionEngine.ts`，不修改已有 representative observer。

正式 action 一旦由原 evaluator 选定，D2F 不能修改 action、evaluator、candidate filter、plan selector、Room transition 或 transaction result。`formalExecutionAllowed` 固定为 literal `false`，不得添加 active branch、feature flag 或以后设为 true 的 production path。所有 snapshot/reference 必须 clone/freeze 或转为不可变 projection；candidate、ParticleBank、public ledger、current trick 和 root identity 必须来自同一个 pre-action root。snapshot capture failure、observer throw、D2F success/failure、low ESS、bad utility、budget failure 和 telemetry failure 都只能进入 diagnostics。

### TDD actions

- [ ] 先建立审计记录：observer 现有输入/diagnostics、decideAiAction 的选择顺序、Room action mutation 和返回点。
- [ ] 写 it("returns void and cannot change the committed formal action")；RED 命令 npx vitest run tests/ai/rollout/d2fShadowObserver.test.ts --exclude "**/.worktrees/**" --reporter=verbose，预期 D2F observer/export 不存在。
- [ ] 写 it("captures the pre-action root before formal commit and observes only the captured snapshot after commit")，使用 call-order spy，并断言提交后修改 Room 不会改变 shadow root。
- [ ] 写 it("swallows rollout, low-evidence, budget, and telemetry failures")。
- [ ] 写 it("swallows snapshot capture throw and still commits the formal action")。
- [ ] 写 it("emits only redacted shadow evidence")，禁止 raw scenario、full opponent hands、weight detail、seed。
- [ ] 写 it("does not return data to evaluator, candidate filter, plan selector, or Room transition")。
- [ ] 写 byte-lock test it("keeps formal action and public state byte-identical with Shadow enabled")；比较 action、Room transition、ledger、runtime、plan、replay bytes，排除 elapsedWallClockMs。
- [ ] 写 negative-control characterization：强制 fake D2F result 推荐与原 evaluator action 相反，formal action、public ledger、current trick、runtime、plan 和 replay bytes 仍 byte-identical。
- [ ] 写 AST/symbol test：`room.ts` 只有 Task 8 的一个调用点，formal flag 无 true literal/active branch，D2F observer 不导出 RolloutResult 给正式决策路径。
- [ ] 最小实现 `observeD2FShadow(snapshot): void`，内部 try/catch，使用 Task 7 approved explicit budget，失败写 D2FShadowEvidence fallback；sink 是 best-effort void sink，observer 只消费 snapshot，不接收 Room。
- [ ] 在 `runAiStep` 只加入一个旁路调用：调用前捕获 pre-action snapshot，调用后只传该 snapshot；不传完整 Room/对手 private hands，不在提交后重建 root。
- [ ] GREEN：observer/unit/integration/byte-lock tests 全通过；回归已有 D2e observer tests、Task 1–7 和 particle focused command。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；确认正式决策路径语义未变，D2F result 不回流。
- [ ] 使用 git commit -m "feat(ai): add non-interfering D2F shadow observer"；提交后停止。

### Produces / consumes

Produces real detached Shadow observation and redacted D2FShadowEvidence. Consumes frozen action/public projection only after formal commit; all failures are swallowed and cannot affect formal state.

## 10. Task 9 — final verification and handoff

### Scope

Task 9 不添加功能。允许修改仅限于实现后必要的 verification report artifact if the task owner explicitly requests one；正常情况下只运行命令、收集证据和提交阶段报告，不修改 source/test/config。

### Verification actions

- [ ] git status --short、git diff --check、git diff --name-only；确认每个前序 commit 范围单一。
- [ ] 运行 D2F rollout focused manifest，显式 --exclude "**/.worktrees/**"，记录 exact files/tests/passed/failed/skipped。
- [ ] 运行冻结 particle command，必须保持 10 files / 136 tests 基线并核对无重复。
- [ ] 将历史 `23 files / 222 tests` 明确记录为 historical handoff only；当前 checkout 没有可独立核验的 exact 23-path manifest，不得把它作为当前 Gate，也不得用未命名的 19-file list 代替。
- [ ] 冻结并验证 `D2_CURRENT_REGRESSION_MANIFEST`：按 Test Gate Matrix 列出的 19 个 exact tracked paths（D2a/D2b public ledger/replay、D2c plan policy、D2d reducer、D2e representative Shadow）；验证每条路径存在、tracked、唯一且无 `.worktrees/**`，Task 9 以该 manifest 实际 collection/test count 为准。
- [ ] 使用 Test Gate Matrix 的 `git ls-files` + PowerShell 显式过滤规则生成 `FULL_PERMITTED_REGRESSION_MANIFEST`；规则必须验证 inclusion/exclusion、唯一性、路径存在/tracked、无遗漏、每个文件恰好进入一个按实测耗时分片，并按 shard 分别运行，不能依赖多次 `--exclude` 累加语义。
- [ ] benchmark timing 与 correctness 分离；Task 7 仅在 `npm ci`、package/lockfile unchanged、本地固定 `tsx.cmd`/`tsx --version` preflight 后运行。benchmark runner 缺失保持 `AWAITING_FIXED_BENCHMARK_RUNNER`，不是 Task 1 blocker。
- [ ] 在 Node 22.22.2 已存在环境或经授权 CI workflow 运行 `tsc --noEmit`、build、D2F focused、`D2_CURRENT_REGRESSION_MANIFEST`、full permitted shards 和 benchmark；Node 24.15.0 只能 supplemental。未取得 Node 22 证据时最终状态必须为 `AWAITING_NODE22_CI`，不得称为 D2F SHADOW RELEASE READY。
- [ ] 运行 privacy AST/import scan、candidateId random scan、ESS/risk/sort scan、shadow call-site scan、failure atomicity and immutability checks。
- [ ] 生成最终阶段报告：start/end HEAD、branch/worktree、changed paths、全部命令/结果/耗时、test counts、privacy/determinism/immutability/fallback/performance、正式决策路径是否修改、遗留风险和下一步精确前置条件。
- [ ] 只在所有 required gates 通过后创建 final verification commit；任何强制 Gate 未通过都报告 BLOCKED 或对应等待状态，不写“基本完成”。

### Final acceptance

Task 9 不把 D2F ranking 接入正式 action。最终报告必须同时列出新 D2F manifest/新增测试数、10/136 particle baseline、`D2_CURRENT_REGRESSION_MANIFEST` 的 exact 19 paths 与实际测试数、历史 23/222 handoff（不得冒充当前 Gate）、full permitted manifest/shard 规则与实际结果，并明确每一个 manifest 是否有可审计路径和 exit code；历史 87/898 只能单独报告为 historical evidence。

## 11. Commit/report contract

每个 Task 一个 commit；不得 amend、squash 或跨 Task 夹带修改。每个阶段报告必须包含：起始/结束 HEAD、branch/worktree、changed paths、契约/算法决策及理由、首次 RED 命令/失败信息/原因、全部验证命令/结果/测试数/耗时、privacy/determinism/immutability/fallback/performance、正式决策路径是否修改、遗留风险、下一 Task 精确前置条件和 commit hash。
