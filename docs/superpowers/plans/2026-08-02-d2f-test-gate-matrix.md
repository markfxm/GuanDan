# D2F Test Gate Matrix

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

## 1. Gate policy

D2F 只允许 detached/offline/shadow，所有实现入口固定 formalExecutionAllowed: false。测试必须证明 D2F 不改变正式动作，不把 RolloutResult 回流到 evaluator、candidate filter、plan selector 或 Room transition。

所有命令在可能包含嵌套 worktree 的环境中显式排除：

~~~text
--exclude "**/.worktrees/**"
~~~

正常粒子 focused regression 的唯一冻结命令：

~~~text
npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
~~~

已接受 fresh baseline：

| scope | files | tests | result | evidence |
| --- | ---: | ---: | --- | --- |
| Particle focused | 10 | 136 | 136 passed, 0 failed, 0 skipped, exit 0 | Vitest 2.1.9, Node 24.15.0 supplemental local run |
| `D2_CURRENT_REGRESSION_MANIFEST` | 19 | actual count at Task 9 | current executable Gate; count is collected, never frozen as 222 | exact tracked paths are frozen in §3 and cover current D2a/D2b/D2c/D2d/D2e scope |
| D2e/D2d/D2c/D2a/D2b handoff | 23 | 222 | historical evidence only | exact 23-path manifest is not independently present in current repository/report evidence |
| Full permitted historical regression | 87 | 898 | historical evidence only | exact 87-path manifest is not independently present in current repository/report evidence; current Gate uses deterministic manifest generation below |

--maxWorkers 1 --minWorkers 1 只用于逐文件 runtime diagnosis；不能作为正常全套回归命令。Vitest 单测 timeout 与外层命令总时限分开记录；不能通过提高全局 timeout、减少 fixture、删除 assertion 或跳过测试解决时限问题。长回归必须使用固定、互不重叠的 manifest shards。

D2F 新测试加入后，最终报告必须记录新的 tracked manifest、每个新增文件的测试数和新的累计数；历史 898 不能继续作为实现后的固定总数。

当前本机 supplemental evidence 是 Node 24.15.0；正式 release Gate 必须在 Node 22.22.2
（`.github/workflows/d2a1-verification.yml`）运行，Node 24 不能替代它。`AWAITING_NODE22_CI`
不是 Task 1 blocker，但在获得 Node 22 证据前不得写 D2F SHADOW RELEASE READY。

package/package-lock 已声明 `tsx ^4.19.2`，当前 worktree 没有 `node_modules/tsx` 或
`node_modules/.bin/tsx.cmd`。`AWAITING_FIXED_BENCHMARK_RUNNER` 是 Task 7 preflight，
不是 Task 1 blocker。恢复顺序固定为 `npm ci` -> `git diff --exit-code -- package.json package-lock.json`
-> 验证本地 `tsx.cmd`/`tsx` 存在 -> 用本地 binary 运行 `--version` 和 benchmark；禁止
`npx tsx`、plain `npm exec`、全局安装或临时下载，runner 缺失时不得跳过 RED，也不得把
benchmark timing 混入普通 correctness regression。

## 1.1 Cross-document canonical interface lock

The following fields are repeated verbatim in Design Spec, Implementation Plan and this matrix. Any implementation or test using another name fails the documentation gate.

~~~ts
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

type RolloutMode = "detached" | "offline" | "shadow";

type RolloutPolicyId = "d2f-lightweight-v1";

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

Evidence Gate：`minimumEffectiveSampleSize`、`minimumAcceptedScenarioCount`、`minimumCompletedReplicateCount` 均必须为正的 finite safe integer；validated request 不得超过 `maximumWorkUnits` 上限。

type RolloutRiskPolicy = Readonly<{
  schemaVersion: "d2f-rollout-risk-policy-v1";
  variancePenalty: number;
  downsideRiskPenalty: number;
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
}>;

export type CanonicalRandomDomainLabel = string & {
  readonly __canonicalRandomDomainLabel: unique symbol;
};

export type CanonicalRandomDomain = string & {
  readonly __canonicalRandomDomainDigest: unique symbol;
};

export type CanonicalSemanticKey = string & {
  readonly __canonicalSemanticKey: unique symbol;
};

export type CrnCoordinate = Readonly<{
  rootIdentity: RootIdentity;
  scenarioIdentity: CanonicalScenarioIdentity;
  replicateIdentity: CanonicalReplicateIdentity;
  ply: number;
  actingSeat: PublicSeat;
  randomDomain: CanonicalRandomDomainLabel;
}> & {
  readonly __validatedCrnCoordinate: unique symbol;
};

export interface CrnView {
  value(semanticKey: CanonicalSemanticKey): number;
}

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

declare function deriveRandomDomain(coordinate: CrnCoordinate): CanonicalRandomDomain;

type RolloutPolicyDecisionContext = Readonly<{
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
}>;

type InternalRolloutPolicy = Readonly<{
  chooseAction(
    observation: SeatLocalObservation,
    context: RolloutPolicyDecisionContext,
    crn: CrnView,
  ): RolloutPolicyResult;
}>;

type InternalRolloutPolicyFactoryResult =
  | { ok: true; policy: InternalRolloutPolicy }
  | { ok: false; failure: { kind: "unsupported-policy-id" } };

declare function createInternalRolloutPolicy(
  policyId: RolloutPolicyId,
): InternalRolloutPolicyFactoryResult;

type RolloutPolicyResult =
  | { ok: true; action: RolloutAction }
  | { ok: false; failure: RolloutPolicyFailure };

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

`RolloutRequest` 是纯数据 public configuration；它只接受唯一 literal `policyId: "d2f-lightweight-v1"`，不接受任何 executable policy、callback、factory、registry entry 或 function value。未知 policy id、未知字段以及 callback/closure 注入必须返回既有 typed `invalid-request` failure，且 validated request 的递归可达属性不得含 function。Task 4 才能通过 `createInternalRolloutPolicy` 的 exhaustive literal mapping 构造固定内部 policy；不存在 caller-supplied policy、动态注册或 fallback policy。

`policyId` 进入独立的 evaluation/rollout configuration identity、configuration provenance、`RolloutResult`/aggregate diagnostics 的允许公开 policy provenance 和 offline/shadow evidence configuration record；它明确不得进入 `canonicalReplayContextIdentity`、`rootIdentity`、`rootDigest`、ParticleBank snapshot identity、scenario/replicate identity、ply/decision identity、acting-seat identity、`randomDomain`、`semanticKey`、`CrnCoordinate` 或 CRN keyed value。root identity 描述动作前游戏事实，`policyId` 描述评估配置；相同 root/scenario/replicate 下不同 policy 必须共享 CRN coordinates，`candidateId` 继续不得进入 CRN coordinate。

type TeamUtility = -3 | -2 | -1 | 1 | 2 | 3;

export type TeamUtilityInput = Readonly<{
  perspectiveSeat: PublicSeat;
  finishOrder: readonly PublicSeat[];
}>;

export function evaluateTeamUtility(
  input: TeamUtilityInput,
): TeamUtilityResult;

export type LeafEvaluationInput = Readonly<{
  perspectiveSeat: PublicSeat;
  actingSeat: PublicSeat;
  finishOrder: readonly PublicSeat[];
  handCounts: Readonly<Record<PublicSeat, number>>;
}>;

export function evaluateNonTerminalLeaf(
  input: LeafEvaluationInput,
): LeafEvaluationResult;

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

Coverage Gate：candidate summary 的 `expectedReplicateCount` 是 candidate-local expected coverage，`completedReplicateCount` 是 candidate-local actual coverage；aggregate diagnostics 只保留全候选的 `expectedCompletedReplicateCount` 和 `completedReplicateCount`，必须由 candidateCount 和 summary 的安全求和派生，不得引入语义重复的 `totalCompletedReplicates`。

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

type TeamUtilityFailure =
  | { kind: "invalid-perspective-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }
  | { kind: "invalid-finish-order"; reason: "duplicate-seat" | "missing-seat" | "unknown-seat" }
  | { kind: "unsupported-team-pair"; teamSeats: readonly PublicSeat[] };

type LeafEvaluationFailure =
  | { kind: "invalid-perspective-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }
  | { kind: "invalid-acting-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" | "finished-seat" }
  | { kind: "invalid-leaf-state"; reason: "duplicate-finish" | "unknown-seat" | "negative-hand-count" | "non-finite-hand-count" | "fractional-hand-count" | "unsafe-hand-count" | "negative-zero-hand-count" | "unfinished-zero-hand-count" | "missing-hand-count" | "unknown-hand-count" | "finish-hand-count-mismatch" | "terminal-state" };

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

Interface gate also checks the runtime numeric domain: measures and scores are finite; counts,
indexes, ordinals, ply and work units are safe non-negative integers; seats are in `{0,1,2,3}`;
weights are finite/non-negative and normalized; variance/risk are finite/non-negative; nullable
evidence numbers are finite when present. NaN, Infinity, unsafe integers, fractions, overflow,
duplicate identity and missing identity must produce an existing typed failure rather than a success.
`candidateId === canonicalActionIdentity(action)`, `scenarioIdentity` is the canonical particle
scenario identity, `replicateIdentity` is canonical replicate-ordinal encoding, and `rootDigest`
comes only from the same pre-action replay-context identity.

Interface gate additionally freezes a recursive plain-data boundary. Before any spread,
`structuredClone`, property getter, canonical hash or freeze, every caller-controlled request,
candidate, action/group/card, budget, limits, evidence, risk, scenario source input, public state,
public event, initial/final ledger, `seenEventHashes`, current trick, revealed transfer, recent action
summary, snapshot identity, result assembly input, candidate summary and aggregate diagnostics must be
checked with `Reflect.ownKeys`, own data descriptors and an allowed ordinary prototype. Symbols,
accessors, functions, extra string keys, abnormal prototypes, array expandos and symbol/accessor indices
fail; dynamic dictionaries accept only schema-defined string keys. `RolloutBudget` and
`RolloutBudgetLimits` use exact own data keys and field-by-field output copies, never an unknown-field
preserving spread. Proxy trap errors become typed failures; the gate does not claim that inspecting a
Proxy prevents the trap from executing. `deepFreeze` uses `Reflect.ownKeys` or only a safe cloned graph,
never `Object.values` as the hostile-input boundary. The opaque ParticleBank handle is the sole
exception to traversing caller data: its public metadata/frozen boundary is checked and its private
projection is checked separately by the bridge.

The result factory gate uses exactly the two-argument `createRolloutResult(requestInput, assemblyInput)`
signature above. It revalidates request input, accepts no rootDigest/rootIdentity/policyId/mode/
formalExecutionAllowed/replayContextIdentity in assembly input, derives mode, literal false formal flag,
policyId and rootDigest from the validated request, and computes rootDigest internally from the validated
rootIdentity. An arbitrary 64-bit hex supplied by a caller cannot produce success. A raw
`rootDigestFromReplayContextIdentity(string)` entry is module-private or removed from public production;
WeakSet/object identity and global mutable registries are forbidden. Schema remains
`d2f-rollout-result-v2`.

The request identity gate and `particleScenarioSource` share one non-exported pure public-consistency
helper. Before root identity, it proves the public-observable currentLastPlay/currentLastPlaySeat pair,
seat versus final-ledger current trick, public last-play stable/semantic key, final public play event
seat/trick index, and public card/group/pattern projection using existing canonical public-event/ledger
helpers. It does not read ParticleBank internals or run private replay; source replay remains the final
hidden-hand semantic boundary. `canonicalActionIdentity` is context-free; request validation reuses
`isHeartRankWild(card, gameRank)` or an equally strong engine helper after validating gameRank. Ordinary
cards, other-suit same-rank cards and jokers are invalid wildcards; legal current red-heart rank cards
pass, and candidateId is checked after contextual legality.

`CanonicalCandidateDecisionAssociationIdentity` is candidate-local result/trace association only. It
must not be imported by `deriveRandomDomain`, `CrnCoordinate`, `CrnView` or keyed-value code, and the
generic `canonicalDecisionIdentity` name is not a valid interface. The AST/symbol gate checks both
association naming and CRN isolation.

## 1.2 PolicyId ownership and identity gate

`RolloutRequest` is a serializable public configuration boundary, not a policy execution boundary.
Its only policy field is `policyId: RolloutPolicyId`, whose current and only legal value is
`"d2f-lightweight-v1"`. A request containing `policy`, `chooseAction`, `policyFactory`, callback,
factory, registry entry, unknown field or recursively reachable function must fail with typed
`invalid-request`; the validator must not invoke, bind, clone, freeze or retain the caller value.
The validated request must be safe to structure-clone/serialize except for the explicitly opaque
ParticleBank handle, and no public barrel may export an executable policy or the private source
envelope.

The current literal is not an implicit D2F Task 1–9 extension. D2G or another explicitly approved
future task must change the literal union, internal factory mapping, privacy/determinism/CRN-pairing
tests and regression gates; configuration files, environment variables and runtime registries cannot
bypass that review.

Task 4 owns `createInternalRolloutPolicy(policyId)`. The factory must use an exhaustive literal
mapping with no dynamic registration, caller-supplied function/class/factory, module path or fallback.
`InternalRolloutPolicy` receives only `SeatLocalObservation`, `RolloutPolicyDecisionContext` and
`CrnView`; it cannot access Room/RoomState, full opponent hands, `privateState`, raw ParticleBank
scenario/record/weight/seed, HandPlanner, formal `decideAiAction`, wall clock, `Math.random()`,
global mutable state, worker id or object address.

Task 4 rollout kernel MUST NOT call `evaluateNonTerminalLeaf` until the simulated action and every
derived finish/trick/turn update have been applied atomically to the isolated rollout state. Frozen
call order：应用模拟动作 → 更新手牌数 → 更新 `finishOrder` → 处理 trick/turn 变化 → 验证 stable
leaf evaluation state → 调用 `evaluateNonTerminalLeaf`。Task 2 leaf 不接收 public ledger、recent
events、pending finish seat、Room、replay state 或 raw scenario；本段只是 Task 4 的接口前置条件，
本轮不实现 kernel。

The focused RED/GREEN gate must prove all of the following:

1. The legal literal succeeds; arbitrary/empty/unknown policy IDs fail with typed failure.
2. Callback, closure, `chooseAction`, factory, registry and unknown-key injection fail even when a
   legal `policyId` is present; no callback is invoked, bound or retained, and no function is
   reachable from the validated request.
3. Changing `policyId` changes only the independent evaluation/rollout configuration identity and
   provenance. It must not change `canonicalReplayContextIdentity`, `rootIdentity`, `rootDigest`,
   ParticleBank snapshot identity, scenario/replicate/ply/decision/acting-seat identity,
   `randomDomain`, `semanticKey`, `CrnCoordinate` or CRN keyed value. Different policies at the
   same root/scenario/replicate must share CRN coordinates; `candidateId` remains excluded.
4. The Task 4 policy test proves the fixed factory and seat-local inputs. The AST/symbol test rejects
   public executable-policy exports, `.bind`, dynamic policy registries, Room/HandPlanner/Particle
   internals/source access and `Math.random()`/wall-clock policy semantics.

## 1.3 Task 1 independent review remediation gates

Task 1 的 production/test allowlist 只有：

```text
src/ai/rollout/contracts.ts
src/ai/rollout/particleScenarioSource.ts
src/ai/particles/particleBankRolloutAccess.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
```

如需 public consistency helper，必须先作为 `contracts.ts` 内不导出的纯函数存在。不得创建通用 validation framework、registry 或新的 public barrel；不得修改 `src/game/room.ts`、`src/ai/aiDecisionEngine.ts`、`src/ai/planning/**`、package/package-lock、配置或 Task 2–9 路径。Task 1 不实现 Team Utility、CRN stream、kernel、aggregation 或 Shadow integration。

| Finding | RED entry and exact proof | GREEN acceptance |
| --- | --- | --- |
| 1. budget/limits callback escape | `createRolloutRequest` with callback in budget and symbol/accessor/extra key in limits | exact own data keys；逐字段复制；callback 未执行、bind、保存、返回；typed failure。 |
| 2. nested hostile input | `createRolloutRequest` with hostile candidate/action/group/card/evidence/risk/ledger/source/public structures and accessor probes | `Reflect.ownKeys`/descriptor/prototype/array checks occur before spread/clone/hash/freeze；所有异常 typed failure、不 throw。 |
| 3. result digest spoof | two-argument `createRolloutResult` with arbitrary 64-bit hex and provenance fields in assembly | only revalidated request can assemble success；mode/formal flag/policyId/rootDigest derived internally；schema remains v2。 |
| 4. public currentLastPlay consistency | request with paired-seat, ledger trick, stable-key, event-index or public group/pattern mismatch | shared pure helper rejects only disproven public facts；request does not inspect private replay；source retains complete replay boundary。 |
| 5. candidate association identity | AST/symbol inspection of real imports and exports | only `canonicalCandidateDecisionAssociationIdentity` exists for local association；no import into random domain/coordinate/view/keyed value；no generic old interface。 |
| 6. wildcard legality | request with ordinary card and legal current-game-rank red-heart card as wildcard | ordinary/other-suit same-rank/joker rejects; legal red-heart rank passes; engine helper is reused; candidateId checked after contextual legality。 |
| 7. bridge validation | registered malformed scenario, identity mismatch, weight/ESS mismatch and hostile accessor through real bridge/source | one private bridge only；registered handle/public metadata, records, scenario/deal/transfer, particle identity, weights, ESS and immutable projection all pass; existing `fake-or-unknown-particle-bank` or `{ kind: "scenario-source-failed"; reason: "private-state-invalid" }` typed failure；source double validation remains。 |

### 1.3.1 Required independent RED→GREEN cases

| # | Exact test path and production entry | RED expectation before the minimal fix |
| ---: | --- | --- |
| 1 | `particleBankRolloutBoundary.test.ts` → `createRolloutRequest` with `budget.callback` | callback enters success request because budget validator is not exact-key or spread retains it。 |
| 2 | `particleBankRolloutBoundary.test.ts` → `createRolloutRequest` with `limits[symbol]` or accessor | nested symbol/accessor escapes or getter is read。 |
| 3 | `particleBankRolloutBoundary.test.ts` → `createRolloutRequest` with `seenEventHashes[symbol] = function` | nested ledger dictionary accepts an untyped function/symbol。 |
| 4 | `particleBankRolloutBoundary.test.ts` → `createRolloutRequest` with a getter probe | validation/clone/hash executes the getter instead of rejecting the descriptor；GREEN requires zero getter executions and typed failure, with Proxy trap errors only caught as typed failure。 |
| 5 | `particleBankRolloutBoundary.test.ts` → `createRolloutRequest` with nested candidate/action/card/evidence/risk extra/accessor | one nested envelope accepts unknown or accessor data。 |
| 6 | `particleScenarioSource.test.ts` → `createRolloutResult(requestInput, assemblyInput)` with arbitrary rootDigest | caller-supplied digest reaches success。 |
| 7 | `particleScenarioSource.test.ts` → result factory with root/policy/mode/formal fields in assembly | assembly caller controls provenance or formal execution flag。 |
| 8 | `particleScenarioSource.test.ts` → `createRolloutRequest` with last-play seat/stable-key/public-event mismatch | root identity is generated without proving public consistency。 |
| 9 | `particleBankRolloutBoundary.test.ts` → AST/symbol gate over real production import graph | candidate association identity is importable by random APIs or generic decision identity remains valid。 |
| 10 | `particleBankRolloutBoundary.test.ts` → `createRolloutRequest` with ordinary-card wildcard | ordinary card is incorrectly accepted by context-free identity。 |
| 11 | `particleBankRolloutBoundary.test.ts` → `createRolloutRequest` with legal red-heart game-rank wildcard | contextual engine legality is absent or rejects a legal wildcard。 |
| 12 | `particleBankRolloutBoundary.test.ts` → `readParticleBankRolloutAccess` with malformed registered scenario | bridge accepts malformed scenario。 |
| 13 | `particleBankRolloutBoundary.test.ts` → bridge with particleId/scenario identity mismatch | bridge accepts identity mismatch。 |
| 14 | `particleBankRolloutBoundary.test.ts` → bridge with bad weight sum or ESS | bridge accepts weight/ESS inconsistency。 |
| 15 | `particleScenarioSource.test.ts` → bridge/source with hostile accessor | accessor runs or throw escapes instead of typed failure。 |
| 16 | both allowlisted test paths → request/result/bridge/source hostile entries | an entry throws, returns partial success or emits an untyped failure。 |

每个 RED 都必须使用真实 production entry，记录行为缺失并证明原因不是 fixture/import/environment；只完成对应最小 production 改动后，用相同命令转 GREEN；不得先写完所有 production 再补测试。每个 Task 仍是单一可审计 commit；correctness 与 benchmark 严格分离。

## 1.4 Historical Task 1 Final Gate Remediation Matrix

> §1.3 和 §1.3.1 是已完成的 historical bridge/source remediation gate；本节是旧 final-gate 矩阵，已被第 1.5 节 supersede。当前 validation-consolidation code pass 从 `f1944efc24e0404d057e86c16460bfd2a5e31794` 开始；当前动作仅为 docs-only design freeze，不宣称任何 Vitest、tsc、build 或 benchmark 通过。

### 1.4.1 I-1 — ESS and public ParticleBank metadata

真实 ESS helper 的唯一阈值语义为：

~~~text
ESS < threshold  -> degraded
ESS == threshold -> ready
ESS > threshold  -> ready
bank.status === summary.status === effectiveSampleSizeResult.status
~~~

当前代码证据是 calculateEffectiveSampleSize 使用严格小于，summary 复用 helper status，而 particleBankBuilder top-level bank 使用小于等于；particleCount = 1、weights = [1]、threshold = 1 会暴露 summary ready / bank degraded。该 RED 必须通过真实 buildParticleBank 复现。

| RED case | Direct production entry | Required GREEN evidence |
| --- | --- | --- |
| ESS below threshold | real buildParticleBank | helper、summary、bank 全部 degraded |
| ESS exactly at threshold | real buildParticleBank；必须含 particleCount = 1 / weights = [1] / threshold = 1 | helper、summary、bank 全部 ready |
| ESS above threshold | real buildParticleBank | helper、summary、bank 全部 ready |
| builder success invariants | real builder output 与真实 sampler/config | accepted=requested=config particle count；attempts 不超过 max 且不小于 accepted+duplicate；zeroWeight 在 0..accepted；ESS finite 在 1..accepted；ready/degraded 无 failureReason |
| public exact schema | real createRolloutRequest | top-level 7 keys、真实 snapshot 8 keys、config 6 keys、accepted ready/degraded summary 的真实字段 exact；failureReason 仅属 failed private summary；无 rejected/re invented field |
| nested hostile shape | real createRolloutRequest | missing、enumerable/non-enumerable extra、symbol、accessor/getter、custom/inherited prototype、malformed descriptor 全部 typed reject；getter 0 次 |
| identity and status consistency | real createRolloutRequest | snapshot/config identity、config particle count、requested/accepted/top-level count、bank/summary status、public/summary ESS 冲突均 typed reject，no throw/no partial |
| numeric semantics | real createRolloutRequest | NaN、Infinity、-Infinity、fractional、negative、Object.is(value, -0)、unsafe integer、overflow 按真实字段拒绝；只有正零可在 attempts/duplicate/zero-weight 出现；public/summary ESS metadata equality 绝对误差 <= 1e-9，helper computation tolerance/clamp 仍与 builder 一致；合法最大边界保留 |

public validator 必须在 value read 前完成 strict prototype、Reflect.ownKeys exact set、own data descriptor、无 symbol/accessor/function、frozen/plain-data 检查；snapshot、config、summary、failure metadata 等 nested object 不能绕过同一边界。public/summary ESS metadata equality 的绝对误差固定为 <= 1e-9；helper computation 仍使用 builder 的 1e-12..1e-6 tolerance/clamp，必须覆盖极小误差、恰好阈值和刚超 tolerance。private bridge raw ESS 若无法与 builder clamp/tolerance 兼容，必须停止并报告 forbidden-path 根因，不能自行改 bridge。

### 1.4.2 I-2 — exact Request → RolloutResult binding

| Validated request source | Result field | Exact gate |
| --- | --- | --- |
| candidates candidateId set | summary candidateId set and ranking set | exact equal; no foreign/missing/duplicate |
| same candidate baselineEvaluatorScore | summary baselineEvaluatorScore | finite and Object.is exact, including -0 |
| budget.replicateCountPerScenario | each summary and aggregate repeat field | exact equal |
| request.scenarioSourceInput.bank.summary.acceptedParticleCount | summary/aggregate acceptedScenarioCount | exact validated public-bank count; it equals bank.particleCount, config.particleCount and requestedParticleCount |
| accepted scenarios × request repeat | expectedReplicateCount | safe product derived from request, not assembly |
| completed counts per summary | aggregate completedReplicateCount | safe sum derived from summaries |
| request candidate count × expected local coverage | expectedCompletedReplicateCount | safe product derived from request and summaries |
| request.scenarioSourceInput.bank.effectiveSampleSize | aggregate effectiveSampleSize | same public tolerance; assembly cannot declare it |
| request.evidenceRequirements | evidence/coverage fields | all minimums and complete-coverage requirement must hold |
| validated request provenance | result mode/formalExecutionAllowed/policyId/rootDigest | derived only from request |

I-2 RED 必须直接调用真实 createRolloutResult(requestInput, assemblyInput)，覆盖 summary repeat mismatch、aggregate repeat mismatch、baseline mutation、candidate A 使用 candidate B baseline、request bank accepted count/product mismatch、aggregate ESS mismatch、foreign/missing/duplicate summary、ranking set mismatch，以及 assembly 注入 budget/root/policy/mode/formal 字段。合法多 candidate、多 scenario、多 replicate 正例必须 GREEN，证明绑定不是 fixture 偶合。当前真实 assembly input 只允许 candidateSummaries、ranking、aggregateDiagnostics 三个字段；当前类型没有 expectedScenarioCount、completedScenarioCount 或 totalCompletedReplicates，不得发明这些字段。

### 1.4.3 I-3 — complete RED/GREEN test quality

| Matrix family | Required direct cases | GREEN assertions |
| --- | --- | --- |
| public identity/schema | missing key；enumerable/non-enumerable extra；symbol；accessor/getter；custom/inherited prototype；malformed descriptor；snapshot/config identity conflict | real production request rejects typed；no throw/no partial；getter/callback count = 0 |
| status/failure | bank/summary conflict；ESS conflict；zero-weight conflict；count conflict；ready/degraded with failureReason；failed status combination | only real ParticleBank public success combinations pass；failure metadata does not leak into accepted public bank |
| count/measure numeric | NaN、Infinity、-Infinity、fractional、negative、-0、unsafe integer、overflow；legal 0；legal max；particle count 1 | finite/safe/nonnegative/range/tolerance rules match real builder; no false rejection of legal zero or boundary |
| request/result provenance | baseline/budget/accepted/ESS mismatches；candidate sets；ranking；product arithmetic；assembly injection；positive multi-variant mapping | exact request-bound result, Object.is baseline, no caller-controlled provenance |
| opaque handle and bridge | registered identity；public-valid unregistered handle；malformed registered private record；identity/weight/ESS invalid | request preserves handle identity; only source/bridge returns typed fake-or-unknown/private-state failure; no partial scenario/private diagnostics |
| failure safety | hostile callback/getter/Proxy trap and all invalid union branches | typed failure classification, no throw, no partial request/result/scenario, zero hostile callback/getter executions |

所有条目必须直接调用真实 buildParticleBank、createRolloutRequest、createRolloutResult、readParticleBankRolloutAccess 或 createParticleScenarioSource；禁止 mock validator、复制 production expected、任何测试过滤标记。测试文件只能从以下 final-gate allowlist 选择：

~~~text
src/ai/particles/particleBankBuilder.ts
src/ai/rollout/contracts.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/effectiveSampleSize.test.ts        # only if necessary
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts       # only for responsibility regression
~~~

forbidden paths：

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

若 forbidden path 被证明是根因，状态必须为 BLOCKED 并附证据；不得扩展 allowlist。Task 2–9 不开始。

### 1.4.4 Current-round boundary and deferred gates

本轮只提交三份文档的 design freeze。不会运行 Vitest、tsc、build、benchmark，也不会修改 production、tests、package、lock、config、Room、decision engine、planning 或 bridge/source formal action path。下一轮 code remediation 完成后，才按冻结 manifest 运行 focused boundary/source/combined、Particle baseline 和 D2 current regression。

以下 gate 保留为 deferred，不得被解释为当前 Task 1 code 或 Shadow release 通过：

~~~text
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
Task 9 full permitted regression
~~~

## 1.5 Task 1 Validation Consolidation Gate Matrix

> 本节 supersede historical §1.4，是下一轮 validation-consolidation code pass 的唯一 gate matrix。起始 HEAD 固定为 `f1944efc24e0404d057e86c16460bfd2a5e31794`、branch 固定为 `codex/d2f-crn-rollout-source`；本轮只冻结三份文档，不运行 Vitest、tsc、build 或 benchmark。

### 1.5.1 Shared validator architecture gate

| Gate | 真实检查 | RED evidence | GREEN requirement |
| --- | --- | --- | --- |
| shared path | `src/ai/particles/particleBankPublicValidation.ts` 存在，`validateParticleBankPublic(unknown)` 返回 typed success/failure | 当前两处 boundary 各自维护 metadata schema | contracts.ts 与 particleBankRolloutAccess.ts 都委托同一 helper；success 保持原始 handle identity |
| descriptor-first | `Reflect.ownKeys` exact keys、strict prototype、own data descriptors、no symbol/accessor/function、plain/frozen 先于 value read | malformed descriptor、custom prototype、getter/Proxy 可绕过或抛出 | typed failure、no throw、no partial；hostile getter/callback count = 0 |
| import graph | Compiler API/symbol gate 解析 import/export 与 symbol ownership | shared path 不存在，或 internals reader/bridge consumer 责任不唯一 | shared validator 不导入 internals/bridge/rollout；只有 bridge 解析 `readParticleBankInternals`；只有 source 解析 bridge；无 public barrel、registration accessor、brand token、global registry |
| opaque identity | registered handle 与 request bank `Object.is` 相等；不 spread/clone/rebuild | request 或 bridge 通过复制/重建绕过 handle identity | identity 保持；request 不读取 WeakMap/private records |
| unregistered handle | public-valid unregistered handle → request → source/bridge | request 直接读 private records，或 fake handle 产生 partial scenario | request public validation 可成功；随后 typed `fake-or-unknown-particle-bank`，无 private diagnostics |

### 1.5.2 ESS, metadata and numeric gate

冻结 status 与 domain 规则：`ESS < threshold => degraded`、`ESS == threshold => ready`、`ESS > threshold => ready`；helper、summary、bank 三者 status 一致。public ESS 严格满足 `1 <= ESS <= N`，不使用 domain epsilon；bank ESS 与 summary ESS 只以 `abs(delta) <= 1e-9` 做 equality。

| Gate | Direct production entry and input | RED expected before remediation | GREEN evidence |
| --- | --- | --- | --- |
| ESS below | real `buildParticleBank`, ESS below threshold | status path not proven by real builder | helper/summary/bank all degraded |
| ESS equality | real builder，`particleCount = 1`、weights `[1]`、threshold `1` | helper/summary ready but bank degraded，或 fixture 绕过 builder | helper/summary/bank all ready |
| ESS above | real builder，ESS above threshold | top-level status 维护第二套比较 | helper/summary/bank all ready |
| strict lower/upper | real request bank ESS `0.9999999995` and `N + 0.0000000005` | request validator 用 `1e-9` 放行 domain 外值 | both typed invalid request；`1e-9` 只用于 bank↔summary equality |
| ESS equality tolerance | bank/summary delta exactly `1e-9`, then just above; NaN/±Infinity | tolerance relative/rounding ambiguity或 non-finite accepted | exact boundary passes, just-over/non-finite rejects |
| counts/attempts | real builder plus request/bridge metadata conflicts | accepted < requested/config/top-level，或 attempts > max 被接受 | accepted=requested=config=top-level；attempts <= max 且 attempts >= accepted+duplicate |
| duplicate/zero weight | real builder count invariants and malformed registered projection | negative/out-of-range/incorrect relationship accepted | `0 <= duplicate <= attempts`；`0 <= zeroWeight <= accepted` |
| status/failure | ready/degraded with `failureReason`、bank/summary conflict、failed success shape | failureReason leaks into accepted success or status mismatch accepted | only ready/degraded success without failureReason；failed remains build-failure union |
| canonical integer | snapshot/ledger/seat/config/summary/top-level/request/aggregate fields | NaN、±Infinity、fractional、negative、`-0`、unsafe integer、overflow accepted | `Number.isSafeInteger && !Object.is(-0)`；nonnegative/range applied after; `0`/`-1` sentinel/maximum legal boundaries preserved |

整数矩阵固定为：positive counts/limits/budget reject zero；samplingAttempts、duplicateCount、zeroWeightCount、workUnitCount、completed counts allow positive zero；ledger index allows `-1` or nonnegative safe integer；seat allows `0..3`；baseline score is finite and retains signed zero for `Object.is` provenance；ESS is finite strict `[1, N]` and only bank/summary equality uses `<= 1e-9`.

### 1.5.3 Request/result provenance gate

| Provenance | Direct case | Required assertion |
| --- | --- | --- |
| baseline | two real request candidates; mutate candidate A summary to candidate B score；test `+0` vs `-0` | `Object.is(summary.baselineEvaluatorScore, matchingRequestCandidate.baselineEvaluatorScore)`；wrong candidate typed reject |
| replicate budget | summaries and aggregate declare a different repeat/replicate value | exact request budget equality；assembly cannot change budget |
| scenario count | alter summary/aggregate accepted count or use caller expected count | count is exactly `request.scenarioSourceInput.bank.summary.acceptedParticleCount`，which equals bank/config/requested count |
| replicate product | mismatch accepted scenarios × request repeats；completed count and coverage denominator mismatch | checked product/sum derived from validated request/summaries；no caller declaration |
| aggregate ESS | exact `1e-9` delta、just over、NaN、Infinity | absolute tolerance only；within passes，outside/non-finite typed reject |
| candidate set | foreign/missing/duplicate summary；ranking reorder | summaries/ranking/request candidate set exact equal；ranking may permute only |
| assembly surface | inject `rootDigest`、`policyId`、`mode`、formal flag、budget、scenario/repeat fields | assembly accepts only `candidateSummaries`、`ranking`、`aggregateDiagnostics`；no partial result |
| result derivation | mutate request after validation or supply caller provenance | result mode/formalExecutionAllowed/policyId/rootDigest only from revalidated request |

当前真实字段没有 `expectedScenarioCount`、`completedScenarioCount`、`totalCompletedReplicates`；本矩阵禁止新增或接受这些模糊重复字段。

### 1.5.4 Unique work-unit gate

当前 `ValidatedRolloutBudget.maximumWorkUnits` 按真实类型/消费点冻结为 per-candidate 上限。令 `C = validated request candidate count`，`B = min(request.maxWorkUnits, checkedProduct(requestReplicates, maxPlies, maxPolicyActionEvaluations))`：

~~~text
每个 summary.workUnitCount <= B
aggregate.workUnitCount = checkedSum(all summary.workUnitCount)
aggregate.workUnitCount <= checkedProduct(C, B)
~~~

| Case | Input | Required result |
| --- | --- | --- |
| under budget | each summary below B；aggregate is checked sum | accept |
| exact budget | a summary equals B；aggregate equals checked sum and <= C×B | accept |
| early completion | completed replicates below expected with valid evidence | accept as incomplete coverage；不得强行补成完整 |
| summary over | one summary `workUnitCount > B` | typed failure |
| aggregate over | aggregate > checked `C * B` | typed failure |
| sum mismatch | aggregate != checked sum of summaries | typed failure |
| overflow | MAX_SAFE_INTEGER product/sum overflow or non-finite result | typed failure before unsafe arithmetic |

不得把 `completedReplicateCount` 与 `workUnitCount` 合并，也不得由 assembly 添加 budget 字段或切换 per-candidate/global interpretation。

### 1.5.5 Real integration and failure-quality gate

所有新增测试必须直接调用真实 `buildParticleBank`、`createRolloutRequest`、`createRolloutResult`、`readParticleBankRolloutAccess` 或 `createParticleScenarioSource`；主要正例必须使用 `particleCount > 1` 的真实 builder output、同一 registered handle 和 request→bridge/source 链。手工 public bank 只能作为单字段 hostile mutation 的基线，不能替代 builder integration。每个 invalid case 断言 typed classification、no throw、no partial request/result/scenario、无 raw private diagnostics；hostile getter/callback/proxy 计数为零；测试不得带过滤、跳过或占位标记。

| Test path | Required named table cases |
| --- | --- |
| `tests/ai/rollout/particleBankRolloutBoundary.test.ts` | strict ESS range/equality；count/attempt/duplicate/zero-weight/status/failureReason；snapshot/config identity；full numeric `-0` matrix；registered/unregistered handle；baseline cross-candidate；repeat/scenario/product/coverage；aggregate ESS tolerance；work-unit under/equal/early/over/overflow；Compiler API/symbol gate |
| `tests/ai/rollout/particleScenarioSource.test.ts` | public-valid unregistered handle typed fake-or-unknown；malformed registered private projection；bridge-only internals read；no partial scenario/private diagnostics |
| `tests/ai/particles/particleBankBuilder.test.ts` | real builder ESS `<`/`==`/`>`，特别是 `particleCount=1`, `[1]`, threshold `1`；helper/summary/bank status；real multi-particle ready/degraded chain invariants |
| `tests/ai/particles/effectiveSampleSize.test.ts` | only when the helper exact-threshold table is absent；no duplicate production expected helper |

### 1.5.6 Next code allowlist, verification and deferred gates

下一轮 code remediation 只允许：

~~~text
src/ai/particles/particleBankPublicValidation.ts
src/ai/particles/particleBankRolloutAccess.ts
src/ai/rollout/contracts.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/effectiveSampleSize.test.ts        # only when the helper exact-threshold assertion is absent
~~~

forbidden：`src/ai/particles/particleBankInternals.ts`、`src/ai/rollout/particleScenarioSource.ts`、Room、decision engine、planning、其他 particles internals、public barrels、package/lock/config、Task 2–9。`particleBankBuilder.ts` 不在本轮 consolidation allowlist；其 status 修复视为已冻结，若新 RED 证明它回归则直接 BLOCKED，不扩大 allowlist。

下一轮 code pass 的 fresh commands：

~~~text
npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/ai/rollout/particleScenarioSource.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts tests/ai/rollout/particleScenarioSource.test.ts --exclude "**/.worktrees/**" --reporter=dot
npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
npx tsc --noEmit
npm run build
git diff --check
~~~

本轮 docs-only 不运行这些命令。`AWAITING_FIXED_BENCHMARK_RUNNER`、`AWAITING_NODE22_CI`、Task 9 full permitted regression 保持 deferred；本矩阵通过不等于 D2F Shadow release ready。

## 2. Exact accepted Particle focused manifest

manifest 只能由 git ls-files 'tests/ai/particles/*.test.ts' 生成；下列 10 个路径各一次，全部位于当前 worktree 的 tests/ai/particles/，不包含 .worktrees/**：

~~~text
tests/ai/particles/actionSupportLikelihood.test.ts
tests/ai/particles/constrainedParticleSampler.test.ts
tests/ai/particles/effectiveSampleSize.test.ts
tests/ai/particles/logWeightNormalization.test.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/particleConservation.test.ts
tests/ai/particles/particleContracts.test.ts
tests/ai/particles/particleDetachedCharacterization.test.ts
tests/ai/particles/particlePrivacyAst.test.ts
tests/ai/particles/publicEventDealReplay.test.ts
~~~

验证命令：

~~~text
$files = @(git ls-files 'tests/ai/particles/*.test.ts')
$files.Count
npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
~~~

验收为 10 files / 136 tests / 136 passed / 0 failed / 0 skipped / exit 0，并在报告中保留 Vitest duration、wall-clock、Node 版本和是否有 worker/unhandled 异常。

## 3. D2_CURRENT_REGRESSION_MANIFEST and historical handoff

历史 `D2e/D2d/D2c/D2a/D2b` handoff 的 `23 files / 222 tests` 没有可独立核验的 exact 23-path
manifest；该数字只保留为 historical evidence。基于当前 checkout 可追溯的 D2a/D2b public
ledger/replay、D2c plan policy、D2d reducer 和 D2e representative Shadow scope，当前 Gate
冻结为以下明确命名的 `D2_CURRENT_REGRESSION_MANIFEST`，共 19 个 exact tracked test paths。
粒子 core 的 10-path manifest 在 §2 独立运行，不重复塞入本 manifest，也不为凑历史 23/222
增删文件。

选择依据固定为对应计划和最终计划提交：D2a 使用
`docs/superpowers/plans/2026-07-19-d2a1-task5-public-event-replay.md`（`c24f4ec`）的
public event/replay 测试；D2b 使用
`docs/superpowers/plans/2026-07-19-d2b-lightweight-public-evidence.md`（`81403f6`）的
public evidence 测试；D2c 使用
`docs/superpowers/plans/2026-07-23-d2c-plan-priority-quota-shadow.md`（`0b5f5b3`）中
plan-policy 测试；D2d 使用
`docs/superpowers/plans/2026-07-24-d2d-representative-action-reducer.md`（`a238cfc`）的
reducer 测试；D2e representative Shadow 使用
`docs/superpowers/plans/2026-07-26-d2e-shadow-production-integration.md`（`960f44c`）的
四个测试。D2e particle core 的
`docs/superpowers/plans/2026-07-27-d2e-particle-core.md`（`403038e`）对应的 10 个测试已经
在 §2 作为独立 focused gate 冻结；因此它们不是当前 19-path manifest 的遗漏，也不重复计数。

~~~text
tests/ai/lightweightPublicEvidence.test.ts
tests/ai/publicEvent.test.ts
tests/ai/publicEventHash.test.ts
tests/ai/publicLedger.test.ts
tests/ai/publicLedgerDependency.test.ts
tests/ai/publicLedgerPrivacy.test.ts
tests/ai/publicLedgerReplay.test.ts
tests/ai/publicLedgerTributeReset.test.ts
tests/ai/publicLedgerTrickFinish.test.ts
tests/game/publicEventIdentity.test.ts
tests/game/publicEventReplayIdentity.test.ts
tests/game/publicEventRoomAdapter.test.ts
tests/ai/beliefGuidedPlanPolicy.test.ts
tests/ai/representativeActionReducer.test.ts
tests/ai/representativeActionReducerDetached.test.ts
tests/ai/representativeActionShadowAst.test.ts
tests/ai/representativeActionShadowByteLock.test.ts
tests/ai/representativeActionShadowIntegration.test.ts
tests/ai/representativeActionShadowRoom.test.ts
~~~

验证命令（只验证 manifest，不运行长回归）：

~~~powershell
$expected = @(
  "tests/ai/lightweightPublicEvidence.test.ts"
  "tests/ai/publicEvent.test.ts"
  "tests/ai/publicEventHash.test.ts"
  "tests/ai/publicLedger.test.ts"
  "tests/ai/publicLedgerDependency.test.ts"
  "tests/ai/publicLedgerPrivacy.test.ts"
  "tests/ai/publicLedgerReplay.test.ts"
  "tests/ai/publicLedgerTributeReset.test.ts"
  "tests/ai/publicLedgerTrickFinish.test.ts"
  "tests/game/publicEventIdentity.test.ts"
  "tests/game/publicEventReplayIdentity.test.ts"
  "tests/game/publicEventRoomAdapter.test.ts"
  "tests/ai/beliefGuidedPlanPolicy.test.ts"
  "tests/ai/representativeActionReducer.test.ts"
  "tests/ai/representativeActionReducerDetached.test.ts"
  "tests/ai/representativeActionShadowAst.test.ts"
  "tests/ai/representativeActionShadowByteLock.test.ts"
  "tests/ai/representativeActionShadowIntegration.test.ts"
  "tests/ai/representativeActionShadowRoom.test.ts"
)
$tracked = @(git ls-files -- $expected)
$missing = @($expected | Where-Object { -not (Test-Path -LiteralPath $_) })
$untracked = @($expected | Where-Object { $_ -notin $tracked })
$duplicates = @($expected | Group-Object | Where-Object Count -gt 1)
if ($missing.Count -ne 0 -or $untracked.Count -ne 0 -or $duplicates.Count -ne 0 -or
    @($expected | Where-Object { $_ -like '.worktrees/**' }).Count -ne 0 -or
    $tracked.Count -ne $expected.Count) { exit 1 }
"D2_CURRENT_REGRESSION_MANIFEST files=$($expected.Count)"
~~~

Task 9 必须以该 19-path manifest 的实际 Vitest collection、passed/failed/skipped、exit code
为准；不得把 222 当作当前测试数，也不得把这份当前 manifest 重新称作历史 23-path handoff。

## 4. FULL_PERMITTED_REGRESSION_MANIFEST generation and shards

当前 full permitted Gate 不冻结历史 87/898，也不依赖尚未验证的多次 `--exclude` 累加语义。
每次 Task 9 从当前 worktree 的 tracked test paths 重新生成同名 manifest，并保留生成输出、
过滤结果、分片映射和实际 collection 结果。唯一生成规则如下：

~~~powershell
$allTrackedTests = @(git ls-files -- 'tests/**/*.test.ts')
$excludePattern = '(^|/)(benchmark|simulation|performance|smoke|calibration|formal|restricted|research)(/|$)|(^|/)[^/]*(benchmark|performance|study|calibration)[^/]*\.test\.ts$'
$excluded = @($allTrackedTests | Where-Object { $_ -match $excludePattern })
$included = @($allTrackedTests | Where-Object { $_ -notmatch $excludePattern } | Sort-Object)
$manifest = @($included | Sort-Object -Unique)
$union = @($manifest + $excluded | Sort-Object -Unique)
$missing = @($manifest | Where-Object { -not (Test-Path -LiteralPath $_) })
$untracked = @($manifest | Where-Object { $_ -notin $allTrackedTests })
$duplicates = @($included | Group-Object | Where-Object Count -gt 1)
if ($allTrackedTests | Where-Object { $_ -like '.worktrees/**' }) { exit 1 }
if ($missing.Count -ne 0 -or $untracked.Count -ne 0 -or $duplicates.Count -ne 0 -or
    $union.Count -ne @($allTrackedTests | Sort-Object -Unique).Count) { exit 1 }
$manifest
~~~

Inclusion is exactly tracked `tests/**/*.test.ts` that survives the explicit path/filename filter.
Exclusions are `tests/benchmark/**`, `tests/simulation/**`, `tests/performance/**`, any path segment
named `smoke`, `calibration`, `formal`, `restricted` or `research`, and benchmark/performance/study/
calibration-named test files (including `tests/ai/d1PlannerExpansionBudgetStudy.test.ts`); they are
independent workload or timing gates, not ordinary correctness regression.
`tests/ai/rollout/d2fBenchmarkContract.test.ts` belongs to the D2F correctness manifest and remains
outside this ordinary full-permitted manifest because its name is benchmark-specific; the timing
runner is never part of Vitest correctness. The assertions above prove every generated path exists,
is tracked, is unique, and that inclusion plus exclusion covers the complete tracked source set;
`.worktrees/**` can never enter the manifest.

Before running shards, measure each manifest file with the fixed local Vitest binary without changing
test timeout. Stable-sort measurements by descending wall-clock duration then path, and greedily place
each file into the first shard whose measured sum stays at or below `100000ms`; start a new shard when
it would exceed that bound. Every file must occur in exactly one shard. Run one explicit-file command
per shard, never a recursive command with accumulated excludes. The outer command limit is approximately
124 seconds: if a shard still exceeds it, split that shard at the next file boundary and rerun the
same tests with unchanged timeout; a single file exceeding the limit is reported as a Gate issue, not
masked by timeout changes. Aggregate by the union of unique collected paths, sum per-file test counts,
and report passed/failed/skipped and exit code per shard plus the total wall-clock; do not add counts
from overlapping runs. Historical 87/898 remains a separate historical row and is never used as the
current manifest result.

分片生成后必须执行覆盖证明：将所有 shard 的 explicit paths 展平为 `$assignedPaths`，验证
`$assignedPaths.Count -eq $manifest.Count`、`@($assignedPaths | Sort-Object -Unique).Count -eq
$manifest.Count`，并验证 `@($manifest | Where-Object { $_ -notin $assignedPaths }).Count -eq 0`；
任一条件失败即 Gate 失败。每个 shard 使用固定 local Vitest binary 对其 explicit paths 执行，
不得用递归目录加多个 `--exclude` 代替该覆盖证明。

## 5. D2F test manifest and focused commands

D2F implementation tests must be tracked under tests/ai/rollout/**。Planned exact test names and paths are defined by the implementation plan：

| concern | planned test paths | required assertions |
| --- | --- | --- |
| contracts/private bridge | particleBankRolloutBoundary.test.ts, particleScenarioSource.test.ts | fake handle rejection, one bridge, replay context, no private diagnostics |
| utility/leaf | teamUtility.test.ts, leafEvaluation.test.ts | six values, invalid ranks, team swap, rotation, partner swap, relative tie-break |
| identity/CRN | crnIdentity.test.ts, crnInvariance.test.ts | candidate-free coordinate, keyed view, replicate variation, candidate/completion order invariance |
| policy/kernel | policy.test.ts, kernel.test.ts, rolloutPrivacyAst.test.ts | seat-local context, no HandPlanner, explicit budget, conservation |
| evidence/aggregation/ranking | evidenceGate.test.ts, aggregation.test.ts, ranking.test.ts | ESS/scenario/replicate gates, weight denominator, risk formula, unrounded sort |
| orchestration | rolloutOrchestrator.test.ts, failureAtomicity.test.ts | one immutable source, no partial result, input immutability, formal false |
| benchmark contract | d2fBenchmarkContract.test.ts | public fixture builds handle in process, no hidden payload |
| Shadow | d2fShadowObserver.test.ts, d2fShadowObserverIntegration.test.ts, d2fShadowByteLock.test.ts | pre-captured snapshot consumed by post-commit void observer, swallowed failure, evidence privacy, public byte lock |

Before the implementation creates the manifest, no count is assigned to these planned files. After each Task, run its exact focused command：

~~~text
npx vitest run <exact tracked test paths> --exclude "**/.worktrees/**" --reporter=verbose
~~~

After Task 8, the complete D2F correctness command is：

~~~text
npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot
~~~

The final report must replace the planned list with the actual git ls-files 'tests/ai/rollout/*.test.ts' manifest and total test count.

## 6. Contract and identity gates

| gate | test evidence | failure condition |
| --- | --- | --- |
| Contract envelope | particleBankRolloutBoundary.test.ts | missing required field, non-literal formal flag, non-finite input, mutable public result |
| Policy ownership | particleBankRolloutBoundary.test.ts, policy.test.ts, rolloutPrivacyAst.test.ts | public request accepts executable policy/callback, policy id is not a fixed literal, policy id changes game/CRN identity, or caller factory/registry/bind path exists |
| Unified result | particleScenarioSource.test.ts, aggregation.test.ts | any document/code uses an obsolete digest field instead of rootDigest, or fields differ |
| Rollout budget | kernel.test.ts | kernel reads global/default budget, unsafe integer, overflow or wall-clock stop |
| Evidence requirements | evidenceGate.test.ts | no explicit minimum ESS/scenarios/replicates, or candidate loop starts before validation |
| Typed failures | evidenceGate.test.ts, failureAtomicity.test.ts | failure union relies on generic optional count or returns partial result |
| Identity | crnIdentity.test.ts | candidateId or baseline score enters identity |
| CRN | crnInvariance.test.ts, crnIdentity.test.ts | same coordinate differs, candidate order changes result, shared cursor is used, unpaired domain/key is ambiguous, duplicate semantic key/collision is untested, or raw seed is exposed |
| Replay | crnInvariance.test.ts, kernel.test.ts | same seed/identity does not replay, replicate ordinal has no effect |
| Scenario coverage | evidenceGate.test.ts, aggregation.test.ts | candidates use different scenario set or replicate coverage |
| Worker/completion order | crnInvariance.test.ts, rolloutOrchestrator.test.ts | scenario or worker completion order changes bytes/ranking |

The frozen random chain is root + scenario + replicate + ply/decision + acting seat + random domain
+ semantic key -> deterministic keyed value.

~~~text
root identity
+ canonical scenario identity
+ replicate identity
+ ply/decision ordinal
+ acting seat
+ random domain
+ semantic key
-> deterministic value
~~~

`policyId` is evaluation configuration provenance only. It is not a component of the random chain,
`canonicalReplayContextIdentity`, `rootIdentity`, `rootDigest`, ParticleBank snapshot identity,
scenario/replicate/ply/decision/acting-seat identity, `randomDomain`, `semanticKey`,
`CrnCoordinate` or the CRN keyed value. Different fixed policies at the same root/scenario/replicate
must share the coordinate and keyed value; `candidateId` remains excluded as well.

CrnView only offers `value(semanticKey: CanonicalSemanticKey)`, never `next()`. Common legal actions
use a stable canonical event semantic key. Candidate ID is restricted to result association, identity
validation and final sorting.

The CRN rules are mandatory: candidateId, candidate-local association identity, baseline score,
candidate array position, worker completion order, scenario completion order, worker ID, process ID,
wall clock, object address, Map insertion order, localeCompare result and temporary counters never
enter the coordinate, domain label, semantic key, canonical bytes, digest or value. The same coordinate
plus the same semantic key intentionally reuses one deterministic value; a distinct event uses a
distinct canonical key. A candidate-specific event with no comparable counterpart uses only
`unpaired:<event-kind>` with the frozen lowercase kebab-case event grammar, or returns typed
`invalid-unpaired-event-key` when no stable semantic key exists. The view exposes no raw seed, digest,
bytes, tape or cursor. Worker/candidate/scenario completion order must not change values or summaries.

### Task 3 keyed CRN algorithm freeze

The complete Task 3 code/test allowlist is exactly:

~~~text
src/ai/rollout/crn.ts
src/ai/rollout/identity.ts
src/ai/rollout/contracts.ts       # only the exact CRN type narrowing below
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
~~~

`contracts.ts` is included only to narrow the current raw CRN types to the branded declarations
below. This minimal revision does not change Task 1 or Task 2 behavior, fields, factories,
validators, failure behavior or public result interfaces. No other production, test, package, lock,
configuration, Room, Particle, planning or Task 4–9 path is allowed.

The exact Task 3 failure and factory declarations are:

~~~ts
export type CrnFailure =
  | Readonly<{ kind: "malformed-coordinate-envelope"; field: "coordinate" | "coordinate.rootIdentity" | "coordinate.scenarioIdentity" | "coordinate.replicateIdentity" | "coordinate.ply" | "coordinate.actingSeat" | "coordinate.randomDomain" | "view-input" | "view-input.coordinate" | "view-input.randomDomain" }>
  | Readonly<{ kind: "invalid-root-identity"; reason: "empty" | "wrong-length" | "uppercase-hex" | "non-hex" }>
  | Readonly<{ kind: "invalid-scenario-identity"; reason: "empty" | "wrong-length" | "uppercase-hex" | "non-hex" }>
  | Readonly<{ kind: "invalid-replicate-identity"; reason: "empty" | "wrong-length" | "uppercase-hex" | "non-hex" }>
  | Readonly<{ kind: "invalid-decision-identity"; reason: "non-integer" | "negative" | "negative-zero" | "unsafe-integer" | "non-finite" }>
  | Readonly<{ kind: "invalid-acting-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }>
  | Readonly<{ kind: "invalid-random-domain-label"; reason: "non-string" | "empty" | "too-long" | "non-printable-ascii" | "candidate-data" }>
  | Readonly<{ kind: "invalid-semantic-key"; reason: "non-string" | "empty" | "too-long" | "non-printable-ascii" | "candidate-data" }>
  | Readonly<{ kind: "candidate-identity-contamination"; location: "coordinate" | "random-domain-label" | "semantic-key" | "canonical-bytes" | "view-state" | "dependency" }>
  | Readonly<{ kind: "invalid-unpaired-event-key"; reason: "missing-prefix" | "empty-event-kind" | "invalid-event-kind" | "candidate-data" }>
  | Readonly<{ kind: "canonical-encoding-failure"; field: "prefix" | "tag" | "length" | "payload" }>
  | Readonly<{ kind: "arithmetic-range-failure"; field: "ply" | "tlv-length" | "uint53" | "value" }>;

export type CanonicalRandomDomainLabelResult =
  | Readonly<{ ok: true; value: CanonicalRandomDomainLabel }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CanonicalSemanticKeyResult =
  | Readonly<{ ok: true; value: CanonicalSemanticKey }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CrnCoordinateCreationResult =
  | Readonly<{ ok: true; value: CrnCoordinate }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CrnViewCreationResult =
  | Readonly<{ ok: true; view: CrnView }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CrnViewInput = Readonly<{
  coordinate: CrnCoordinate;
  randomDomain: CanonicalRandomDomain;
}>;

export function createCanonicalRandomDomainLabel(input: unknown): CanonicalRandomDomainLabelResult;
export function createCanonicalSemanticKey(input: unknown): CanonicalSemanticKeyResult;
export function createUnpairedSemanticKey(eventKind: unknown): CanonicalSemanticKeyResult;
export function createCrnCoordinate(input: unknown): CrnCoordinateCreationResult;
export function deriveRandomDomain(coordinate: CrnCoordinate): CanonicalRandomDomain;
export function createCrnView(input: unknown): CrnViewCreationResult;
export function canonicalCrnDomainBytes(coordinate: CrnCoordinate): Uint8Array;
export function canonicalCrnValueBytes(randomDomain: CanonicalRandomDomain, semanticKey: CanonicalSemanticKey): Uint8Array;
~~~

The creation chain is fixed and has no alternate seed path:

~~~text
raw domain label -> createCanonicalRandomDomainLabel -> CanonicalRandomDomainLabel
raw semantic key -> createCanonicalSemanticKey/createUnpairedSemanticKey -> CanonicalSemanticKey
unknown coordinate envelope -> createCrnCoordinate -> CrnCoordinate
CrnCoordinate -> deriveRandomDomain -> CanonicalRandomDomain -> createCrnView({ coordinate, randomDomain })
  -> CrnView.value(CanonicalSemanticKey)
~~~

The random-domain label is a primitive string of 1..128 bytes, each ASCII byte `0x21..0x7e`.
The semantic key is a primitive string of 1..256 bytes under the same rule. Whitespace, controls,
NUL, Unicode, surrogate/normalization-dependent input, leading/trailing spaces, candidate ID and
absolute candidate position are rejected. The only unpaired form is `unpaired:<event-kind>`, with a
non-empty `<event-kind>` matching `[a-z0-9]+(?:-[a-z0-9]+)*`; candidate ID/index, worker ID,
temporary counter, object address and random suffix are forbidden. No stable key means typed
`invalid-unpaired-event-key`.

Malformed coordinate/view envelopes, including missing/extra keys, symbols, accessors/getters,
functions, cycles, sparse arrays and custom/inherited prototypes, map to
`malformed-coordinate-envelope` before caller data is retained or invoked. Invalid identity,
decision/ply, seat, label, semantic key, unpaired key, encoding or arithmetic maps to the exact
union above. No partial value/view is returned; diagnostics contain no root material, scenario,
candidate, canonical bytes, SHA digest, seed, tape or cursor. Factories never throw, and `value()`
accepts only a key already validated by its branded-key factory.

The SHA-256 source is the existing `src/game/publicEventHash.ts` export
`sha256Bytes(input: Uint8Array): string`: synchronous, pure TypeScript, browser-compatible standard
FIPS 180-4 SHA-256, accepting bytes and returning exactly 64 lowercase hex characters for 32 digest
bytes. `identity.ts` hex-decodes that result when digest bytes are required and owns a private
`CanonicalByteWriter`. No `node:crypto`, `crypto`, Web Crypto async API, third-party dependency or
Particle production export is permitted.

Canonical encoding v1 has two domain-separated phases. Every field is a TLV:
`tag: 1 byte unsigned + length: 4 bytes unsigned big-endian + payload: exactly length bytes`.
No bare string or delimiter concatenation, `JSON.stringify`, object/Map enumeration, locale encoding
or decimal-string integer encoding is allowed.

~~~text
ASCII("D2F-CRN-DOMAIN-V1") + 0x00
+ TLV(0x01, rootIdentity as 32 raw bytes)
+ TLV(0x02, scenarioIdentity as 32 raw bytes)
+ TLV(0x03, replicateIdentity as 32 raw bytes)
+ TLV(0x04, ply as 8-byte unsigned big-endian)
+ TLV(0x05, actingSeat as one byte 0x00..0x03)
+ TLV(0x06, random-domain label as validated ASCII bytes)
~~~

| order | tag | field | payload |
| ---: | ---: | --- | --- |
| 1 | `0x01` | `rootIdentity` | 64 lowercase hex -> 32 raw bytes |
| 2 | `0x02` | `scenarioIdentity` | 64 lowercase hex -> 32 raw bytes |
| 3 | `0x03` | `replicateIdentity` | 64 lowercase hex -> 32 raw bytes |
| 4 | `0x04` | `ply` | canonical safe nonnegative integer -> 8-byte unsigned big-endian |
| 5 | `0x05` | `actingSeat` | `PublicSeat` -> one byte `0x00..0x03` |
| 6 | `0x06` | `randomDomain` label | validated ASCII bytes |

Identity payloads are exactly 64 lowercase hex characters decoded to 32 raw bytes. Uppercase hex,
wrong length and non-hex are rejected. `ply` rejects `-0`, negative, fractional, unsafe,
`NaN` and `Infinity`, and is encoded as 8-byte unsigned big-endian. `PublicSeat` is the canonical
game identity byte `0x00..0x03`, not a candidate-array position or temporary index; no relative-seat
normalization is used.

~~~text
ASCII("D2F-CRN-VALUE-V1") + 0x00
+ TLV(0x01, domain digest as 32 raw bytes)
+ TLV(0x02, semantic key as validated ASCII bytes)
~~~

The value digest is SHA-256 of the phase-2 bytes. Take the first 8 bytes as unsigned big-endian
`uint64`, compute `u53 = uint64 >> 11`, and return `Number(u53) / 9007199254740992` (`2^53`).
BigInt is allowed only for exact bytes-to-uint64 conversion and shift. Low 53 bits, rounding,
epsilon, decimal-string conversion and any path producing `1` are forbidden; the result is finite
and satisfies `0 <= value < 1`.

Candidate ID and candidate-local association identity never enter `CrnCoordinate`, domain label,
semantic key, canonical bytes, domain digest, value digest, view state or value calculation. The
forbidden dependency symbols are `candidateId`, `CanonicalCandidateDecisionAssociationIdentity`
and `canonicalCandidateDecisionAssociationIdentity`; the AST gate must use TypeScript Compiler API
symbol resolution rather than comment text.

Known vectors are documentation-only literals computed by an independent Node
`crypto.createHash("sha256")` oracle. Both use:

~~~text
rootIdentity      = 00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
scenarioIdentity  = ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100
replicateIdentity = 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ply               = 7
actingSeat        = 2
randomDomain      = policy-action-v1
~~~

Paired `policy-action:play:single:H7-1`:

~~~text
domain canonical bytes = 4432462d43524e2d444f4d41494e2d563100010000002000112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0200000020ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110003000000200123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef040000000800000000000000070500000001020600000010706f6c6963792d616374696f6e2d7631
domain SHA-256         = c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15
value canonical bytes  = 4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15020000001e706f6c6963792d616374696f6e3a706c61793a73696e676c653a48372d31
value SHA-256          = 0351802e83a610421ad1681cb92d729197bc31765b11cf72d85d25d10eabf3b8
first 8 bytes          = 0351802e83a61042
u53                    = 116754488521922
JavaScript number      = 0.012962352138537137
~~~

Unpaired `unpaired:public-pass`:

~~~text
domain canonical bytes = 4432462d43524e2d444f4d41494e2d563100010000002000112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0200000020ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110003000000200123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef040000000800000000000000070500000001020600000010706f6c6963792d616374696f6e2d7631
domain SHA-256         = c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15
value canonical bytes  = 4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf150200000014756e7061697265643a7075626c69632d70617373
value SHA-256          = 2a564ad3f684e2f5ca38184d2aa0e71bc2157e2658e3429719d2e190c2747283
first 8 bytes          = 2a564ad3f684e2f5
u53                    = 1489603550695580
JavaScript number      = 0.16537921595456195
~~~

Boundary vectors compare canonical bytes rather than asserting hash uniqueness:

~~~text
("ab", "c")   = 4432462d43524e2d56414c55452d56310001000000203d1571b8edbf823789c3bb440b98388d2448cb8b15b56025a8ba2d04e4d25e96020000000163
("a", "bc")   = 4432462d43524e2d56414c55452d56310001000000209c5bc616973ab50bb7ae1ea133dc9333e41d916c2bad2f1ee1fa54d4ff9f389f02000000026263
("x", "y:z")   = 4432462d43524e2d56414c55452d56310001000000207ccad33be63bbbe2df49bf4529a7ff06a1288a1debaeafca4dee1aa083f364cb0200000003793a7a
("x:y", "z")   = 4432462d43524e2d56414c55452d5631000100000020f65c7cf19deccc6adbaee964af36d06eb9dcbc08dad9a6621314fb385f4ed5d302000000017a
~~~

Task 3 RED creates only the two frozen test files and must collect them with at least one behavioral
assertion failing because the new CRN behavior is absent; zero tests, module-resolution failure or
fixture failure is not valid RED. GREEN reruns exactly:

~~~text
npx vitest run tests/ai/rollout/crnIdentity.test.ts tests/ai/rollout/crnInvariance.test.ts --exclude "**/.worktrees/**" --reporter=verbose
~~~

The tests cover known bytes/digests/high-53 values, repeated-key and call-order invariance,
equivalent independent views, candidate/scenario/worker completion-order invariance, root/scenario/
replicate/ply/seat/domain/key identity changes, paired candidate-independent equal values, legal
unpaired grammar, candidateId structural exclusion, no shared cursor/tape, tuple boundaries,
hostile input, no throw/no partial/no secret diagnostics and Node 22/browser determinism. They never
assert that different hashes are mathematically guaranteed to differ; they assert different canonical
bytes and fixed vectors only. No `skip`, `only` or `todo` is allowed.

## 7. Privacy, conservation, immutability and atomicity gates

| gate | required evidence | required result |
| --- | --- | --- |
| seat-local policy | policy.test.ts | fixed `InternalRolloutPolicy` is selected only by literal `RolloutPolicyId` and receives only current seat observation, `RolloutPolicyDecisionContext` and `CrnView`; no caller callback |
| no full HandPlanner | rolloutPrivacyAst.test.ts | no import or call to complete HandPlanner under src/ai/rollout/** |
| ParticleBank bridge | particleBankRolloutBoundary.test.ts | exactly one bridge resolves WeakMap internals; fake handle fails safely |
| replay context | particleScenarioSource.test.ts | source receives bank plus public history/initial/final ledger/game rank/perspective/own hand/public state |
| state conservation | kernel.test.ts | card multiset, hand counts, public played cards and finish state remain conserved |
| input immutability | failureAtomicity.test.ts, rolloutOrchestrator.test.ts | Room, ParticleBank, candidates, ledger and request snapshots unchanged |
| failure atomicity | failureAtomicity.test.ts | any kernel/evidence/aggregation failure yields no partial RolloutResult |
| diagnostics privacy | particleScenarioSource.test.ts, d2fShadowObserver.test.ts | no raw scenario, assignment, opponent hand, weight detail or seed |
| formal non-interference | d2fShadowByteLock.test.ts | formal action/public state/replay bytes identical with Shadow on/off |

Private bridge is a single production chain: particles-side `particleBankRolloutAccess.ts` is the
only symbol that resolves `readParticleBankInternals`; rollout-side `particleScenarioSource.ts` is
the only caller; only kernel internals may receive raw scenario, four-seat hands and particle weights;
policy sees seat-local observation only; diagnostics/sink sees no raw scenario, assignment, weight detail
or seed. `policyId` may appear only as redacted configuration provenance. AST/symbol tests must fail
on both forbidden import and forbidden re-export/barrel exposure of
`particleBankInternals.ts`. Fake/unknown handles must return `fake-or-unknown-particle-bank`, and the
bridge result must be immutable or a deep copy.

Bridge GREEN additionally requires a registered WeakMap handle with legal public status/metadata;
non-empty records; non-empty unique particleId; valid scenario schema, canonical initial deal and hidden
transfer-assignment structure; `particleId === particleScenarioIdentity(bank.snapshot, scenario)`;
finite non-negative normalized weights whose sum is within the frozen tolerance of 1; and finite
non-negative ESS no greater than scenario count. The bridge uses field-by-field clone plus recursive
freeze, rejects getter/symbol/function/malformed scenarios as existing `fake-or-unknown-particle-bank`
or `{ kind: "scenario-source-failed"; reason: "private-state-invalid" }` typed failures without
executing caller accessors, and reuses `particleScenarioIdentity`/`validateCanonicalInitialDeal`.
The source keeps its second replay/public-consistency validation and cannot remove it because the bridge
has become stricter.

## 8. Team Utility, leaf, aggregation and ranking gates

### Team Utility

Task 2 uses the following narrow synchronous pure-function interface：

~~~ts
export type TeamUtilityInput = Readonly<{
  perspectiveSeat: PublicSeat;
  finishOrder: readonly PublicSeat[];
}>;

export function evaluateTeamUtility(
  input: TeamUtilityInput,
): TeamUtilityResult;

export type LeafEvaluationInput = Readonly<{
  perspectiveSeat: PublicSeat;
  actingSeat: PublicSeat;
  finishOrder: readonly PublicSeat[];
  handCounts: Readonly<Record<PublicSeat, number>>;
}>;

export function evaluateNonTerminalLeaf(
  input: LeafEvaluationInput,
): LeafEvaluationResult;
~~~

`PublicSeat` is imported from `src/game/publicEvent.ts` and is exactly `0 | 1 | 2 | 3`. `RolloutPublicState.actingSeat` is the public current acting/turn seat; `src/game/publicLedger.ts`'s `currentTrick` records `leadSeat`, optional `lastPlaySeat`/stable key and `passSeats`, while the contracts public-event projection derives the acting seat. The canonical hand-count representation is the existing `Readonly<Record<PublicSeat, number>>` used by `RolloutPublicState` in `src/ai/rollout/contracts.ts`; its key order semantics are seat `0, 1, 2, 3`. `src/game/publicLedger.ts` uses the same shape through a private `HandCounts` alias. `settlement.ts`'s `teamOf` and `partnerSeat` are private `Seat`-based helpers and are not imported; `teamUtility.ts` locally applies `seat % 2` and `(seat + 2) % 4`.

Shared input types are added to the Task 2 `contracts.ts` allowlist only; no Task 1 field, factory or behavior changes are allowed. The dependency direction is `contracts.ts` ← `teamUtility.ts` ← `leafEvaluation.ts`; leaf evaluation must call `evaluateTeamUtility`, not duplicate the table. The functions receive no whole rollout/kernel context, positional argument string, registry, callback, factory, policy, RNG, Room, ParticleBank, scenario, replay state, hidden hand or mutable context.

The only terminal table is：

| own team places | utility |
| --- | ---: |
| {1,2} | +3 |
| {1,3} | +2 |
| {1,4} | +1 |
| {2,3} | -1 |
| {2,4} | -2 |
| {3,4} | -3 |

TeamUtility is exactly -3 | -2 | -1 | 1 | 2 | 3; zero is invalid. `perspectiveSeat` selects the team `{ perspectiveSeat, (perspectiveSeat + 2) % 4 }`; the opposing team is the sign inverse. Tests must cover malformed, duplicate and missing ranks, invalid perspective seats, team swap sign, seat rotation, partner interchange, immutability and no extra reward.

### Leaf

Stable leaf evaluation state means: the current action is fully applied; all hand-count changes caused by that action are applied; if a seat's hand reaches zero, its finish-order update is complete; the current acting/turn seat has advanced to a legal unfinished seat; and no play, finish, trick-clear or turn-advance update remains pending. Leaf evaluation MUST NOT be called in the middle of those updates. An early game/rollout terminal state is a legal leaf semantic; an event-processing transient state is not a leaf input.

`finishOrder` is a real completed prefix of length `0 | 1 | 2 | 3`; a four-seat order is terminal and must return `invalid-leaf-state/terminal-state`. The prefix is unique and canonical. `actingSeat` is canonical and not completed; current-turn/history consistency is a stable-state caller precondition because the narrow input has no trick/history fields. `perspectiveSeat` may be completed or unfinished.

`handCounts` must contain exactly the four canonical seat keys in the existing `Readonly<Record<PublicSeat, number>>` representation, with order semantics seat `0, 1, 2, 3`. Each count must be finite, nonnegative, a safe integer and not `-0`. The stable-state invariant is strict: `seat ∈ finishOrder → handCounts[seat] === 0`; `seat ∉ finishOrder → handCounts[seat] > 0`. An unfinished seat with count 0 must return `{ kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" }`; ledger, recent event, pending flag or inference cannot authorize it. `actingSeat` must be unfinished and `handCounts[actingSeat] > 0`.

The leaf algorithm is fixed: preserve the completed prefix; collect unfinished seats; sort by `handCounts[seat]` ascending; tie by `clockwiseDistance = (seat - actingSeat + 4) % 4` ascending; append to produce `predictedFinishOrder`; call the same `evaluateTeamUtility` table; return an immutable result. Absolute seat number, card identity, current trick strength, hidden assignment, particle weight, policy/baseline score, random, wall clock, rounding, partner reward and Task 3 CRN are prohibited. Same-state replay, team swap, partner view and seat rotation are required.

### Failure mapping

The exact unions are shared by all three D2F documents：

~~~text
TeamUtilityFailure:
  invalid-perspective-seat: unknown-seat | fractional-seat | unsafe-integer-seat | negative-zero-seat
  invalid-finish-order: duplicate-seat | missing-seat | unknown-seat
  unsupported-team-pair: teamSeats

LeafEvaluationFailure:
  invalid-perspective-seat: unknown-seat | fractional-seat | unsafe-integer-seat | negative-zero-seat
  invalid-acting-seat: unknown-seat | fractional-seat | unsafe-integer-seat | negative-zero-seat | finished-seat
  invalid-leaf-state:
    duplicate-finish | unknown-seat | negative-hand-count | non-finite-hand-count |
    fractional-hand-count | unsafe-hand-count | negative-zero-hand-count |
    unfinished-zero-hand-count | missing-hand-count | unknown-hand-count |
    finish-hand-count-mismatch | terminal-state
~~~

Failure mapping is exact：

| invalid input | exact failure |
| --- | --- |
| `perspectiveSeat` 为越界/非数值 | `{ kind: "invalid-perspective-seat", reason: "unknown-seat" }` |
| `perspectiveSeat` 为 fractional / unsafe integer / `-0` | 同一 kind，分别使用 `fractional-seat` / `unsafe-integer-seat` / `negative-zero-seat` |
| Team Utility finish order 含 duplicate | `{ kind: "invalid-finish-order", reason: "duplicate-seat" }` |
| Team Utility finish order 缺 seat 或长度不是 4 且不能形成完整四座位 order | `{ kind: "invalid-finish-order", reason: "missing-seat" }` |
| Team Utility finish order 含越界、非数值、fractional、unsafe integer 或 `-0` | `{ kind: "invalid-finish-order", reason: "unknown-seat" }` |
| canonical seat pair 无法映射到项目两队 | `{ kind: "unsupported-team-pair", teamSeats }` |
| `actingSeat` 非 canonical | `{ kind: "invalid-acting-seat", reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }` |
| `actingSeat` 已在 finish prefix | `{ kind: "invalid-acting-seat", reason: "finished-seat" }` |
| leaf finish prefix duplicate | `{ kind: "invalid-leaf-state", reason: "duplicate-finish" }` |
| leaf finish prefix 含非 canonical seat | `{ kind: "invalid-leaf-state", reason: "unknown-seat" }` |
| leaf finishOrder 长度为 4 | `{ kind: "invalid-leaf-state", reason: "terminal-state" }` |
| handCounts 缺少 seat key | `{ kind: "invalid-leaf-state", reason: "missing-hand-count" }` |
| handCounts 含额外/未知 seat key | `{ kind: "invalid-leaf-state", reason: "unknown-hand-count" }` |
| hand count 为 negative | `{ kind: "invalid-leaf-state", reason: "negative-hand-count" }` |
| hand count 为 NaN/Infinity | `{ kind: "invalid-leaf-state", reason: "non-finite-hand-count" }` |
| hand count 为 fractional / unsafe integer / `-0` | 分别为 `fractional-hand-count` / `unsafe-hand-count` / `negative-zero-hand-count` |
| 已完成 seat 的 hand count 非 0 | `{ kind: "invalid-leaf-state", reason: "finish-hand-count-mismatch" }` |
| `actingSeat` 的 hand count 为 0 | `{ kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" }` |
| 未完成 seat 的 hand count 为 0 | `{ kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" }` |

All failures are typed discriminated-union values; no vague string, optional failure field or throw-based API is permitted. `unsupported-team-pair` is unreachable under the four-seat parity rule but remains as the existing union branch.

The Task 2 leaf test matrix is exact and must use the real production API with no mock, skip, only or todo：

| class | required cases | required assertion |
| --- | --- | --- |
| legal stable state | `finishOrder=[]` with all four counts > 0; prefix lengths 1, 2 and 3 with completed-seat counts 0; all unfinished counts > 0; unfinished positive-count `actingSeat`; completed and unfinished `perspectiveSeat` | success, finite utility, complete predicted order |
| legal ordering | equal hand counts; seat rotation | relative `actingSeat` distance determines order; utility and relative order are rotation-invariant |
| invalid state | finished count > 0; unfinished count = 0; `actingSeat` completed; `actingSeat` count = 0; prefix length 4 | exact `finish-hand-count-mismatch`, `unfinished-zero-hand-count`, `finished-seat` or `terminal-state` reason |
| invalid shape/number | duplicate/unknown seat; unknown or missing hand-count key; negative, fractional, NaN, Infinity, unsafe integer and `-0` | exact frozen failure reason for each case |

The matrix does not authorize success for an event-processing zero-count state. Rotation is a successful-path metamorphic/property test, not a production failure branch.

The exact Task 2 RED/GREEN commands are：

~~~text
npx vitest run tests/ai/rollout/teamUtility.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/ai/rollout/leafEvaluation.test.ts --exclude "**/.worktrees/**" --reporter=verbose
~~~

Each command must first RED only because its target module or target behavior is absent, then GREEN
with the same command after the minimal implementation. Import, fixture and syntax failures are not
valid RED evidence. No test may use mock, skip, only or todo.

### Task 2 allowlist

~~~text
src/ai/rollout/contracts.ts                  # add two shared input types and the exact Task 2 failure-union variants only
src/ai/rollout/teamUtility.ts
src/ai/rollout/leafEvaluation.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/rollout/leafEvaluation.test.ts
~~~

No production/test/package/config/Room/Task 1/Task 3–9 path may change in this interface-freeze round.

### Aggregation

For normalized scenario weights w_s and R = replicateCountPerScenario, every candidate uses：

~~~text
D = sum_s(w_s * R)
expectedUtility_j = sum_(s,r)(w_s * utility_(j,s,r)) / D
variance_j = sum_(s,r)(w_s * (utility_(j,s,r) - expectedUtility_j)^2) / D
risk_j = sum_(s,r)(w_s * max(0, expectedUtility_j - utility_(j,s,r))) / D
~~~

The result uses：

~~~text
riskAdjustedUtility
  = expectedUtility
  - variancePenalty * sqrt(variance)
  - downsideRiskPenalty * risk
~~~

RolloutRiskPolicy contains explicit finite non-negative variancePenalty and downsideRiskPenalty; Task 1–6 do not provide defaults. Ranking uses unrounded internal values：

~~~text
riskAdjustedUtility descending
expectedUtility descending
baselineEvaluatorScore descending
candidateId ascending by UTF-16 code units
~~~

Public six-decimal rounding occurs after ranking and cannot rerank candidates. baselineEvaluatorScore only participates in the third sort key and Shadow evidence.

## 9. Shadow integration and non-interference gates

Task 6 is detached orchestration only. Task 8 is the first actual D2F Shadow integration.

Before Task 8 implementation, read only：

~~~text
src/ai/tactics/representativeActionShadowObserver.ts
src/ai/aiDecisionEngine.ts
src/game/room.ts:runAiStep
~~~

The existing representative observer is D2e and currently runs before final formal action selection. The D2F call site is frozen to one call in `src/game/room.ts:runAiStep`, but its input is captured before the formal commit:

~~~text
freeze formal action/candidates/baseline
  -> capture immutable redacted pre-action snapshot from the same Room root
  -> catch snapshot construction failure; never block/delay/replace formal action
  -> commit passTurn/playCards and runtime/plan update
  -> call observer with the captured snapshot only
  -> never reread changed Room to construct the original root
  -> diagnostics only
~~~

The snapshot must contain the same pre-action root identity/digest, ParticleBank handle, public
ledger/history, current trick/last play, game rank, own hand, public hand counts, candidate projection
and explicit budget. It must be cloned/frozen and caller-reference isolated. `formalExecutionAllowed`
is literal `false`; no active branch, feature flag or future true path is permitted. The original
evaluator action remains authoritative. `src/ai/aiDecisionEngine.ts` and
`representativeActionShadowObserver.ts` remain unchanged.

Required Shadow evidence fields：

~~~text
baselineActionIdentity
policyId
d2fRecommendedActionIdentity
agreement
riskAdjustedUtilityDelta
expectedUtilityDelta
baselineEvaluatorScore
effectiveSampleSize
acceptedScenarioCount
replicateCountPerScenario
completedReplicateCount
workUnitCount
fallbackReason
semanticBudgetUsage
elapsedWallClockMs
~~~

elapsedWallClockMs is telemetry only and is excluded from identity, stop condition, ranking and byte-lock comparison. Observer returns void/best effort; snapshot throw, observer throw, rollout success/failure, low ESS, bad utility, budget failure and sink errors cannot change formal action or public transition. Add a negative-control characterization that forces the D2F recommendation to be the opposite action and compares formal action, public ledger, current trick, runtime, plan and replay bytes; only diagnostics may differ.

## 10. Benchmark gate

Correctness and benchmark are separate：

~~~text
npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot
& .\node_modules\.bin\tsx.cmd scripts/benchmarks/d2f-rollout-budget-calibration.ts --fixture tests/fixtures/ai/d2f-public-rollout-fixture.json
~~~

The second command is permitted only after a fixed Node 22.22.2 environment has run `npm ci`,
`git diff --exit-code -- package.json package-lock.json`, and read-only verification proves the local
`node_modules/.bin/tsx.cmd` executable exists and reports its fixed version. Current local evidence is
package/lock declaration tsx ^4.19.2 plus absent node_modules/tsx; no temporary `npx tsx`, plain
`npm exec`, global install or network download is allowed. Current status: `AWAITING_FIXED_BENCHMARK_RUNNER`,
a Task 7 precondition rather than a Task 1 blocker.

Benchmark fixture must be public, tracked and reproducible. It may contain public ledger/history, game rank, seats, own hand and public configuration. It must not contain a WeakMap handle, raw hidden scenarios, weights or seed. The script constructs ParticleBank in process using the existing public builder and prints only redacted aggregate/work-unit/telemetry data. Correctness tests must not be marked failed merely because the benchmark entry is absent; the benchmark first RED is the command-level missing entry or an independent benchmark contract test.

## 11. Node and permitted regression gates

Formal verification baseline：

~~~text
Node 22.22.2
~~~

Evidence source: .github/workflows/d2a1-verification.yml. .github/workflows/ci.yml provides Node 22. Node 24.15.0 local particle evidence is supplemental only and cannot establish official Node 24 support. If no Node 22.22.2 environment exists and no authorized CI workflow is run, final status is AWAITING_NODE22_CI, not pass.

The current full permitted Gate uses the explicit `git ls-files`/PowerShell generation and measured
shard rule in §4; it does not depend on multiple `--exclude` accumulation and does not require a
recursive command. The historical 87 files / 898 tests / 898 passed numbers remain separate evidence
only because the exact historical 87-path manifest is unavailable. Task 9 reports the current generated
manifest's actual files/tests/exit codes and does not force either historical count.

## 12. TypeScript, build, and static scans

Every Task GREEN and final handoff must run：

~~~text
npx tsc --noEmit
npm run build
git diff --check
~~~

Required read-only/static scans：

~~~text
rg -n "rootDigestFromReplayContextIdentity|canonicalDecisionIdentity|Object\.values|callback|accessor|symbol|wildcard|particleScenarioIdentity|createRolloutResult" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "candidateId.*(random|CRN|tape|draw)|deriveRandomDomain.*candidateId|(random|CRN|tape|draw).*candidateId" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "effectiveSampleSize|minimumAcceptedScenarioCount|minimumCompletedReplicateCount|effective-sample-size-too-low|insufficient-scenarios|insufficient-replicates|coverage-mismatch" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "riskAdjustedUtility|variancePenalty|downsideRiskPenalty|baselineEvaluatorScore|UTF-16" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "representativeActionShadowObserver|aiDecisionEngine|src/game/room.ts|observeD2FShadow|elapsedWallClockMs" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "23 files|222 tests|D2_CURRENT_REGRESSION_MANIFEST|87 files|898 tests|AWAITING_NODE22_CI|AWAITING_FIXED_BENCHMARK_RUNNER" docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n -i "T[B]D|T[O]DO|F[I]XME|placeh[o]lder|l[a]ter|follow [u]p|a[p]propriate|as n[e]eded|e[t]c\\.|similar t[o]|implement validati[o]n|add t[e]sts|待[定]|后续[补]充|适[当]|视[情]况|类[似]|必[要]时" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
git diff --name-only -- docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
$docs = @("docs/superpowers/specs/2026-08-02-d2f-design-spec.md", "docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md", "docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md")
foreach ($doc in $docs) {
  $backticks = @(Select-String -Path $doc -Pattern '^```').Count
  $tildes = @(Select-String -Path $doc -Pattern '^~~~').Count
  if (($backticks % 2) -ne 0 -or ($tildes % 2) -ne 0) { exit 1 }
}
~~~

CandidateId scan is expected to find only prohibition/validation language, never a random function signature or random derivation expression. 禁用词扫描必须为零命中；所有 implementation step 都必须使用具体文件、symbol、输入和断言。The full permitted regression manifest is frozen by §4's explicit generation and shard rule and does not require multi-exclude semantic evidence.

## 13. Final status vocabulary

Only these outcomes are valid：

~~~text
TEST GATE PASS — SINGLE RUN
TEST GATE PASS — AUDITED SHARDS
TEST GATE BLOCKED — ISOLATED TEST FAILURE
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
~~~

A documentation readiness review may use only one of these final decisions: `PASS — READY FOR TASK 1`, `PASS WITH NON-BLOCKING DEFERRED GATES — READY FOR TASK 1`, or `BLOCKED — NOT READY FOR TASK 1`. Missing fixed benchmark runner and Node 22 evidence are deferred gates, not Task 1 blockers; missing/ambiguous current manifest, unresolved pre-action snapshot semantics, or any contract/privacy/CRN inconsistency is a blocker. A readiness decision must not be described as an implementation or formal release pass.
