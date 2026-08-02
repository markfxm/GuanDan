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

Interface gate also checks the runtime numeric domain: measures and scores are finite; counts,
indexes, ordinals, ply and work units are safe non-negative integers; seats are in `{0,1,2,3}`;
weights are finite/non-negative and normalized; variance/risk are finite/non-negative; nullable
evidence numbers are finite when present. NaN, Infinity, unsafe integers, fractions, overflow,
duplicate identity and missing identity must produce an existing typed failure rather than a success.
`candidateId === canonicalActionIdentity(action)`, `scenarioIdentity` is the canonical particle
scenario identity, `replicateIdentity` is canonical replicate-ordinal encoding, and `rootDigest`
comes only from the same pre-action replay-context identity.

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
| Unified result | particleScenarioSource.test.ts, aggregation.test.ts | any document/code uses an obsolete digest field instead of rootDigest, or fields differ |
| Rollout budget | kernel.test.ts | kernel reads global/default budget, unsafe integer, overflow or wall-clock stop |
| Evidence requirements | evidenceGate.test.ts | no explicit minimum ESS/scenarios/replicates, or candidate loop starts before validation |
| Typed failures | evidenceGate.test.ts, failureAtomicity.test.ts | failure union relies on generic optional count or returns partial result |
| Identity | crnIdentity.test.ts | candidateId or baseline score enters identity |
| CRN | crnInvariance.test.ts, crnIdentity.test.ts | same coordinate differs, candidate order changes result, shared cursor is used, unpaired domain/key is ambiguous, duplicate semantic key/collision is untested, or raw seed is exposed |
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

The CRN collision and unpaired-event rules are mandatory: candidateId, baseline score, candidate array
position, worker completion order, object address, Map insertion order, localeCompare result and absolute
seat number never enter `randomDomain`, tape, semantic key or draw. The same coordinate plus the same
semantic key intentionally reuses one deterministic value; a distinct event must use a distinct canonical
key, and tests must cover both deliberate reuse and domain/key collision. A candidate-specific event with
no comparable counterpart either uses `unpaired:<event-kind>` plus a candidate-free public-state/ply key,
or returns typed kernel failure when no public semantic key exists. `CrnView.value` returns only a finite
normalized value and exposes no raw seed, seed getter, tape or cursor. Worker/candidate/scenario completion
order must not change summaries or ranking.

## 7. Privacy, conservation, immutability and atomicity gates

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

Private bridge is a single production chain: particles-side `particleBankRolloutAccess.ts` is the
only symbol that resolves `readParticleBankInternals`; rollout-side `particleScenarioSource.ts` is
the only caller; only kernel internals may receive raw scenario, four-seat hands and particle weights;
policy sees seat-local observation only; diagnostics/sink sees no raw scenario, assignment, weight detail
or seed. AST/symbol tests must fail on both forbidden import and forbidden re-export/barrel exposure of
`particleBankInternals.ts`. Fake/unknown handles must return `fake-or-unknown-particle-bank`, and the
bridge result must be immutable or a deep copy.

## 8. Team Utility, leaf, aggregation and ranking gates

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
rg -n "candidateId.*(random|CRN|tape|draw)|deriveRandomDomain.*candidateId|(random|CRN|tape|draw).*candidateId" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "effectiveSampleSize|minimumAcceptedScenarioCount|minimumCompletedReplicateCount|effective-sample-size-too-low|insufficient-scenarios|insufficient-replicates|coverage-mismatch" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "riskAdjustedUtility|variancePenalty|downsideRiskPenalty|baselineEvaluatorScore|UTF-16" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "representativeActionShadowObserver|aiDecisionEngine|src/game/room.ts|observeD2FShadow|elapsedWallClockMs" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n "23 files|222 tests|D2_CURRENT_REGRESSION_MANIFEST|87 files|898 tests|AWAITING_NODE22_CI|AWAITING_FIXED_BENCHMARK_RUNNER" docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
rg -n -i "TBD|TODO|later|follow up|appropriate|as needed|etc\\.|similar to|implement validation|add tests|待定|后续补充|适当|视情况|类似|必要时" docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
git diff --name-only -- docs/superpowers/specs/2026-08-02-d2f-design-spec.md docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
$docs = @("docs/superpowers/specs/2026-08-02-d2f-design-spec.md", "docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md", "docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md")
foreach ($doc in $docs) {
  $backticks = @(Select-String -Path $doc -Pattern '^```').Count
  $tildes = @(Select-String -Path $doc -Pattern '^~~~').Count
  if (($backticks % 2) -ne 0 -or ($tildes % 2) -ne 0) { exit 1 }
}
~~~

CandidateId scan is expected to find only prohibition/validation language, never a random function signature or random derivation expression. Placeholder hits are manually classified: a forbidden-term explanation or scan command is allowed; an implementation step is not. The full permitted regression manifest is frozen by §4's explicit generation and shard rule and does not require multi-exclude semantic evidence.

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
