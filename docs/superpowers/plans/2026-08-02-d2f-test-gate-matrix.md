# D2F Test Gate Matrix

状态：文档纠偏冻结；本轮只修改文档，不创建测试、benchmark 或 production 文件。

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
| D2e/D2d/D2c/D2a/D2b handoff | 23 | 222 | accepted historical baseline | exact 23-path manifest not present in current repository/report evidence |
| Full permitted historical regression | 87 | 898 | accepted historical baseline | exact 87-path manifest not present in current repository/report evidence |

--maxWorkers 1 --minWorkers 1 只用于逐文件 runtime diagnosis；不能作为正常全套回归命令。Vitest 单测 timeout 与外层命令总时限分开记录；不能通过提高全局 timeout、减少 fixture、删除 assertion 或跳过测试解决时限问题。长回归必须使用固定、互不重叠的 manifest shards。

D2F 新测试加入后，最终报告必须记录新的 tracked manifest、每个新增文件的测试数和新的累计数；历史 898 不能继续作为实现后的固定总数。

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
  policy: RolloutPolicy;
}>;

type CrnView = Readonly<{ value(semanticKey: string): number }>;

type RolloutPolicyDecisionContext = Readonly<{
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  random: CrnView;
}>;

type RolloutPolicy = Readonly<{
  chooseAction(observation: SeatLocalObservation, context: RolloutPolicyDecisionContext): RolloutPolicyResult;
}>;

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

type RolloutPolicyResult =
  | { ok: true; action: RolloutAction }
  | { ok: false; failure: RolloutPolicyFailure };

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
  totalCompletedReplicates: number;
  completedReplicateCount: number;
  workUnitCount: number;
}>;

type RolloutAggregateDiagnostics = Readonly<{
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  totalCompletedReplicates: number;
  completedReplicateCount: number;
  expectedCompletedReplicateCount: number;
  candidateCount: number;
  workUnitCount: number;
  coverage: "complete";
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
  | { kind: "invalid-finish-order"; reason: "duplicate-seat" | "missing-seat" | "unknown-seat" }
  | { kind: "unsupported-team-pair"; teamSeats: readonly PublicSeat[] };

type LeafEvaluationFailure =
  | { kind: "invalid-leaf-state"; reason: "duplicate-finish" | "unknown-seat" | "negative-hand-count" }
  | { kind: "rotation-tie-break-unproven"; evidence: string };

type RolloutPolicyFailure =
  | { kind: "no-legal-action"; actingSeat: PublicSeat }
  | { kind: "invalid-policy-context"; field: "ply" | "actingSeat" | "random" };

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
~~~

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

## 3. D2 regression handoff manifest status

人工已接受 D2e/D2d/D2c/D2a/D2b 的 23 files / 222 tests 基线，但当前 HEAD 和可读取的既有报告只保留了一个 19-file candidate list，不能推断缺失的四个路径。当前 list 如下，明确不是 23/222 的替代物：

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

状态：AWAITING_D2_REGRESSION_MANIFEST。在人工提供 exact 23-path manifest 或 Node 22 CI 输出完整 collection manifest 前，不得宣称 23/222 已在当前 checkout 重跑，不得将 19-file list 写成 accepted handoff。

## 4. D2F test manifest and focused commands

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
| Shadow | d2fShadowObserver.test.ts, d2fShadowObserverIntegration.test.ts, d2fShadowByteLock.test.ts | post-commit void observer, swallowed failure, evidence privacy, public byte lock |

Before the implementation creates the manifest, no count is assigned to these planned files. After each Task, run its exact focused command：

~~~text
npx vitest run <exact tracked test paths> --exclude "**/.worktrees/**" --reporter=verbose
~~~

After Task 8, the complete D2F correctness command is：

~~~text
npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot
~~~

The final report must replace the planned list with the actual git ls-files 'tests/ai/rollout/*.test.ts' manifest and total test count.

## 5. Contract and identity gates

| gate | test evidence | failure condition |
| --- | --- | --- |
| Contract envelope | particleBankRolloutBoundary.test.ts | missing required field, non-literal formal flag, non-finite input, mutable public result |
| Unified result | particleScenarioSource.test.ts, aggregation.test.ts | any document/code uses an obsolete digest field instead of rootDigest, or fields differ |
| Rollout budget | kernel.test.ts | kernel reads global/default budget, unsafe integer, overflow or wall-clock stop |
| Evidence requirements | evidenceGate.test.ts | no explicit minimum ESS/scenarios/replicates, or candidate loop starts before validation |
| Typed failures | evidenceGate.test.ts, failureAtomicity.test.ts | failure union relies on generic optional count or returns partial result |
| Identity | crnIdentity.test.ts | candidateId or baseline score enters identity |
| CRN | crnInvariance.test.ts | same coordinate differs, candidate order changes result, shared cursor is used |
| Replay | crnInvariance.test.ts, kernel.test.ts | same seed/identity does not replay, replicate ordinal has no effect |
| Scenario coverage | evidenceGate.test.ts, aggregation.test.ts | candidates use different scenario set or replicate coverage |
| Worker/completion order | crnInvariance.test.ts, rolloutOrchestrator.test.ts | scenario or worker completion order changes bytes/ranking |

The frozen random chain is：

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

CrnView only offers value(semanticKey), never next(). Common legal actions use canonical action identity as semantic key. candidateId is restricted to result association, identity validation and final sorting.

## 6. Privacy, conservation, immutability and atomicity gates

| gate | required evidence | required result |
| --- | --- | --- |
| seat-local policy | policy.test.ts | policy receives only current seat observation and RolloutPolicyDecisionContext |
| no full HandPlanner | rolloutPrivacyAst.test.ts | no import or call to complete HandPlanner under src/ai/rollout/** |
| ParticleBank bridge | particleBankRolloutBoundary.test.ts | exactly one bridge resolves WeakMap internals; fake handle fails safely |
| replay context | particleScenarioSource.test.ts | source receives bank plus public history/initial/final ledger/game rank/perspective/own hand/public state |
| state conservation | kernel.test.ts | card multiset, hand counts, public played cards and finish state remain conserved |
| input immutability | failureAtomicity.test.ts, rolloutOrchestrator.test.ts | Room, ParticleBank, candidates, ledger and request snapshots unchanged |
| failure atomicity | failureAtomicity.test.ts | any kernel/evidence/aggregation failure yields no partial RolloutResult |
| diagnostics privacy | particleScenarioSource.test.ts, d2fShadowObserver.test.ts | no raw scenario, assignment, opponent hand, weight detail or seed |
| formal non-interference | d2fShadowByteLock.test.ts | formal action/public state/replay bytes identical with Shadow on/off |

## 7. Team Utility, leaf, aggregation and ranking gates

### Team Utility

The only terminal table is：

| own team places | utility |
| --- | ---: |
| {1,2} | +3 |
| {1,3} | +2 |
| {1,4} | +1 |
| {2,3} | -1 |
| {2,4} | -2 |
| {3,4} | -3 |

TeamUtility is exactly -3 | -2 | -1 | 1 | 2 | 3; zero is invalid. Tests must cover malformed, duplicate and missing ranks, team swap sign, seat rotation, partner interchange and no extra reward.

### Leaf

The leaf test must preserve completed finish order, sort unfinished seats by remaining hand count, and tie by clockwise distance from current acting/turn seat. Same-state replay, team swap and seat rotation are required. Absolute seat number is prohibited.

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

## 8. Shadow integration and non-interference gates

Task 6 is detached orchestration only. Task 8 is the first actual D2F Shadow integration.

Before Task 8 implementation, read only：

~~~text
src/ai/tactics/representativeActionShadowObserver.ts
src/ai/aiDecisionEngine.ts
src/game/room.ts:runAiStep
~~~

The existing representative observer is D2e and currently runs before final formal action selection. The D2F call site is frozen to one call in src/game/room.ts:runAiStep after the original passTurn/playCards and runtime/plan update, before return. src/ai/aiDecisionEngine.ts and representativeActionShadowObserver.ts remain unchanged.

Required Shadow evidence fields：

~~~text
baselineActionIdentity
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

elapsedWallClockMs is telemetry only and is excluded from identity, stop condition, ranking and byte-lock comparison. Observer returns void/best effort; rollout, low ESS, budget, and sink errors cannot change formal action or public transition.

## 9. Benchmark gate

Correctness and benchmark are separate：

~~~text
npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot
npm exec --no -- tsx scripts/benchmarks/d2f-rollout-budget-calibration.ts --fixture tests/fixtures/ai/d2f-public-rollout-fixture.json
~~~

The second command is permitted only after a fixed Node 22.22.2 environment has run npm ci and read-only verification proves the locked tsx executable is available. Current local evidence is package/lock declaration tsx ^4.19.2 plus absent node_modules/tsx; no temporary npx download is allowed. Current status: AWAITING_FIXED_BENCHMARK_RUNNER.

Benchmark fixture must be public, tracked and reproducible. It may contain public ledger/history, game rank, seats, own hand and public configuration. It must not contain a WeakMap handle, raw hidden scenarios, weights or seed. The script constructs ParticleBank in process using the existing public builder and prints only redacted aggregate/work-unit/telemetry data. Correctness tests must not be marked failed merely because the benchmark entry is absent; the benchmark first RED is the command-level missing entry or an independent benchmark contract test.

## 10. Node and permitted regression gates

Formal verification baseline：

~~~text
Node 22.22.2
~~~

Evidence source: .github/workflows/d2a1-verification.yml. .github/workflows/ci.yml provides Node 22. Node 24.15.0 local particle evidence is supplemental only and cannot establish official Node 24 support. If no Node 22.22.2 environment exists and no authorized CI workflow is run, final status is AWAITING_NODE22_CI, not pass.

Full historical command is not frozen until Vitest 2.1.9 multiple --exclude behavior is verified by observed collection output and the exact 87-file manifest is available. Do not freeze the former recursive command solely because it worked historically. When evidence is available, use the fixed 87-path manifest, explicit --exclude "**/.worktrees/**", and independent shards under the external command limit. Each file must occur once, every shard must exit 0, and the aggregate must be 87 files / 898 tests / 898 passed for the historical baseline.

## 11. TypeScript, build, and static scans

Every Task GREEN and final handoff must run：

~~~text
npx tsc --noEmit
<repository-existing-build-command>
git diff --check
~~~

Required read-only/static scans：

~~~text
rg -n "candidateId.*(random|CRN|tape|draw)|deriveRandomDomain.*candidateId|(random|CRN|tape|draw).*candidateId" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "effectiveSampleSize|minimumAcceptedScenarioCount|minimumCompletedReplicateCount|effective-sample-size-too-low|insufficient-scenarios|insufficient-replicates|coverage-mismatch" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "riskAdjustedUtility|variancePenalty|downsideRiskPenalty|baselineEvaluatorScore|UTF-16" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "representativeActionShadowObserver|aiDecisionEngine|src/game/room.ts|observeD2FShadow|elapsedWallClockMs" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "23 files|222 tests|AWAITING_D2_REGRESSION_MANIFEST|87 files|898 tests|AWAITING_NODE22_CI" docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
~~~

CandidateId scan is expected to find only prohibition/validation language, never a random function signature or random derivation expression. The full regression command remains unfrozen until its multi-exclude evidence is recorded.

## 12. Final status vocabulary

Only these outcomes are valid：

~~~text
TEST GATE PASS — SINGLE RUN
TEST GATE PASS — AUDITED SHARDS
TEST GATE BLOCKED — ISOLATED TEST FAILURE
AWAITING_D2_REGRESSION_MANIFEST
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
~~~

A documentation freeze may be PASS WITH WARNINGS when the correction is complete but the external 23-path manifest, fixed benchmark runner or Node 22 evidence is still awaiting authorized evidence. It must not be described as an implementation or formal test pass.
