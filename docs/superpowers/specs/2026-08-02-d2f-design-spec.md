# D2F CRN Rollout / Team Utility Design Specification

## D2F Task 7 benchmark interface and threshold freeze (active)

# D2F_TASK7_BENCHMARK_INTERFACE_THRESHOLD_FREEZE_REPORT

This active block is the sole Task 7 source of truth in all three canonical D2F documents.
Task 7 code is pending. Task 8 has not started. This block freezes a reproducible benchmark
runner and evidence contract; it does not freeze a product performance SLA on Node 24.

### Scene lock and scope

The verified source worktree is:

~~~text
E:/workspace/掼蛋游戏开发/.worktrees/d2f-crn-rollout-source
~~~

The verified branch and HEAD are:

~~~text
codex/d2f-crn-rollout-source
fc63d646cb9926b00745e453d9426397fed92319
feat(ai): add detached D2F rollout orchestration
~~~

This docs-only correction modifies only the three canonical documents. The next Task 7
implementation turn may modify exactly:

~~~text
scripts/benchmarks/d2f-rollout-budget-calibration.ts
tests/fixtures/ai/d2f-public-rollout-fixture.json
tests/ai/rollout/d2fBenchmarkContract.test.ts
~~~

The fixture path is part of the allowlist. The next Task 7 turn must not modify:

~~~text
package.json
package-lock.json
vitest.config.*
tsconfig*
src/game/room.ts
formal AI decision paths
Task 1-6 production files
Task 8 files
~~~

Task 7 production code is not started in this freeze. Task 8 is not started.

### Fixed runner command and CLI

The fixed Unix command is:

~~~text
npm exec --offline -- tsx \
  scripts/benchmarks/d2f-rollout-budget-calibration.ts \
  --fixture tests/fixtures/ai/d2f-public-rollout-fixture.json \
  --warmup 3 \
  --iterations 10 \
  --json
~~~

The fixed Windows command is:

~~~powershell
npm exec --offline -- tsx scripts/benchmarks/d2f-rollout-budget-calibration.ts --fixture tests/fixtures/ai/d2f-public-rollout-fixture.json --warmup 3 --iterations 10 --json
~~~

The command uses `npm exec --offline` to resolve only the repository-local locked tsx
binary. The `--` passes the remaining arguments to local tsx; it does not require a shell
PATH entry for `node_modules/.bin`, cannot download a missing package, and does not change
package scripts. npx tsx, bare tsx, temporary downloads, global installs, plain npm exec,
network fixtures, and unpinned external dependencies are forbidden.
The package scripts are not changed.

The required Task 7 code preflight is:

~~~text
npm exec --offline -- tsx --version
~~~

The accepted CLI is exactly:

~~~text
--fixture <path>       required
--warmup <integer>     required and equal to 3
--iterations <integer> required and equal to 10
--json                 required
~~~

The runner rejects missing, duplicated, unknown, non-integer, non-positive, or mismatched
arguments. It accepts no callback, caller-provided function, dynamic registry, network
address, seed override, or random iteration count.

### Real builder-to-orchestrator data flow

The fixture is JSON. JSON never contains a ParticleBank handle, WeakMap key, private record,
ParticleScenario, raw private hand, hiddenTransferAssignments, normalized weight, particleSeed,
random tape, cursor, or wall-clock expected value.

After parsing and validating the fixture, the runner performs this exact flow:

~~~text
read JSON
→ validate D2fBenchmarkFixture
→ derive the internal particle seed from fixtureId
→ call the real buildParticleBank with replay data and particleBank config
→ retain the returned registered ParticleBank handle in memory
→ construct the real RolloutScenarioSourceInput from replay data and that handle
→ derive rootIdentity with canonicalReplayContextIdentity
→ construct an immutable real rollout request
→ run one untimed correctness invocation
→ run three untimed warm-up invocations
→ run ten measured runDetachedRollout invocations
→ compare every result with the literal expected oracle
→ compute statistics from the ten measured durations
→ emit one success report
~~~

The runner passes replay.perspectiveSeat as the builder actingSeat because that is the
real ParticleBankBuildInput contract. The publicState.actingSeat remains the current
rollout actor in the constructed RolloutScenarioSourceInput.

The internal seed derivation is fixed and is not an input surface:

~~~text
particleSeed =
  first four bytes, interpreted as an unsigned big-endian uint32, of
  SHA-256(UTF-8("d2f-benchmark-particle-seed-v1\0" + fixtureId))
~~~

The derived seed is used only as buildParticleBank input. It is never printed, serialized,
or accepted from the CLI.

The request constructed by the runner has:

~~~text
schemaVersion = "d2f-rollout-request-v2"
mode = "detached"
formalExecutionAllowed = false
policyId = fixture.request.policyId
scenarioSourceInput = replay fields plus the registered ParticleBank
rootIdentity = canonicalReplayContextIdentity(replay context plus bank.snapshot)
candidates = fixture.request.candidates
budget = fixture.request.budget
limits = budget copied field-for-field as the matching maximum limits
evidenceRequirements = fixture.request.evidenceRequirements
riskPolicy = fixture.request.aggregationPolicy
~~~

The runner calls buildParticleBank and runDetachedRollout; it does not call
createParticleBankHandle, readParticleBankInternals, or a private registry directly.

### Exact JSON fixture schema

The following TypeScript notation describes the exact JSON fields. The named unions are
the current source types in src/engine/cards.ts, src/engine/groups.ts,
src/game/publicEvent.ts, src/game/publicLedger.ts, src/ai/particles/contracts.ts,
and src/ai/rollout/contracts.ts. No field outside these definitions is accepted.

~~~ts
type D2fBenchmarkCardFixture =
  | Readonly<{
      id: string;
      kind: "suited";
      rank: "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
      suit: "spades" | "clubs" | "hearts" | "diamonds";
      copy: 1 | 2;
    }>
  | Readonly<{
      id: string;
      kind: "joker";
      rank: "SJ" | "BJ";
      copy: 1 | 2;
    }>;

type D2fBenchmarkGroupFixture = Readonly<{
  id: string;
  type: "single" | "pair" | "triple" | "full-house" | "straight" | "consecutive-pairs" | "plate" | "bomb" | "straight-flush" | "joker-bomb";
  label: string;
  purpose: "attack" | "engine" | "recovery" | "tail-control" | "risk" | "filler";
  cards: readonly D2fBenchmarkCardFixture[];
  wildcards: readonly D2fBenchmarkCardFixture[];
  strength: number;
}>;

type D2fBenchmarkActionFixture =
  | Readonly<{ type: "pass" }>
  | Readonly<{ type: "play"; group: D2fBenchmarkGroupFixture }>;

type D2fBenchmarkEventCommon = Readonly<{
  schemaVersion: "d2-public-event-v2";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  eventIndex: number;
  seat: 0 | 1 | 2 | 3;
  trickIndex: number;
  leadSeat?: 0 | 1 | 2 | 3;
  lastPlaySeat?: 0 | 1 | 2 | 3;
  publicPayloadHash: string;
}>;

type D2fBenchmarkPublicEventFixture =
  | (D2fBenchmarkEventCommon & Readonly<{
      kind: "play";
      publicStableKey: string;
      publicCardIds: readonly string[];
      patternType: string;
      groupType: string;
      handCountBefore: number;
      handCountAfter: number;
      usedWildcardCount?: number;
      usedBomb?: boolean;
    }>)
  | (D2fBenchmarkEventCommon & Readonly<{
      kind: "pass";
      publicStableKey: "pass:v2";
      handCountBefore: number;
      handCountAfter: number;
    }>)
  | (D2fBenchmarkEventCommon & Readonly<{
      kind: "trick-clear";
      publicStableKey: string;
      leadSeat: 0 | 1 | 2 | 3;
    }>)
  | (D2fBenchmarkEventCommon & Readonly<{
      kind: "finish";
      publicStableKey: string;
      finishPosition: number;
      remainingHandCount: number;
      finishReason: "hand-empty" | "round-settlement";
    }>)
  | (D2fBenchmarkEventCommon & Readonly<{
      kind: "tribute" | "return";
      publicStableKey: string;
      publicCardIds: readonly [string] | readonly [];
      fromSeat: 0 | 1 | 2 | 3;
      toSeat: 0 | 1 | 2 | 3;
      handCountChanges: Readonly<Record<"0" | "1" | "2" | "3", number>>;
    }>)
  | (D2fBenchmarkEventCommon & Readonly<{
      kind: "anti-tribute";
      publicStableKey: string;
      reasonCode: "anti-tribute";
    }>);

type D2fBenchmarkLedgerFixture = Readonly<{
  schemaVersion: "d2-public-ledger-v1";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  nextEventIndex: number;
  lastAppliedEventIndex: number;
  seenEventHashes: Readonly<Record<string, string>>;
  playedCardIds: readonly string[];
  revealedTransferEvents: readonly Readonly<{
    eventIndex: number;
    kind: "tribute" | "return";
    cardId?: string;
    fromSeat: 0 | 1 | 2 | 3;
    toSeat: 0 | 1 | 2 | 3;
  }>[];
  handCounts: Readonly<Record<"0" | "1" | "2" | "3", number>>;
  currentTrick: Readonly<{
    trickIndex: number;
    leadSeat: 0 | 1 | 2 | 3;
    lastPlaySeat?: 0 | 1 | 2 | 3;
    lastPlayStableKey?: string;
    passSeats: readonly (0 | 1 | 2 | 3)[];
  }>;
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  publicTributeEvents: readonly string[];
  recentActionSummaries: readonly Readonly<Record<string, string | number | boolean>>[];
}>;

type D2fBenchmarkPublicStateFixture = Readonly<{
  gameRank: "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
  actingSeat: 0 | 1 | 2 | 3;
  perspectiveSeat: 0 | 1 | 2 | 3;
  partnerSeat: 0 | 1 | 2 | 3;
  handCounts: Readonly<Record<"0" | "1" | "2" | "3", number>>;
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  publicPlayedCardIds: readonly string[];
  currentLastPlay: D2fBenchmarkGroupFixture | null;
  currentLastPlaySeat: 0 | 1 | 2 | 3 | null;
}>;

type D2fBenchmarkFixture = Readonly<{
  schemaVersion: "d2f-rollout-benchmark-fixture-v1";
  fixtureId: "d2f-public-rollout-calibration-v1";
  replay: Readonly<{
    publicIdentity: Readonly<{
      schemaVersion: "d2-public-game-identity-v1";
      gameId: string;
      roundIdentity: string;
      handIdentity: string;
      roundSequence: number;
      handSequence: number;
      source: "benchmark-scenario";
    }>;
    initialLedger: D2fBenchmarkLedgerFixture;
    baseLedger: D2fBenchmarkLedgerFixture;
    finalLedger: D2fBenchmarkLedgerFixture;
    publicHistoryEvents: readonly D2fBenchmarkPublicEventFixture[];
    pendingPublicEvents: readonly D2fBenchmarkPublicEventFixture[];
    expectedFinalEventIndex: number;
    expectedFinalPublicLedgerHash: string;
    gameRank: "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
    perspectiveSeat: 0 | 1 | 2 | 3;
    ownCurrentHand: readonly D2fBenchmarkCardFixture[];
    publicState: D2fBenchmarkPublicStateFixture;
  }>;
  particleBank: Readonly<{
    schemaVersion: "d2-particle-bank-build-input-v1";
    particleCount: number;
    maxSamplingAttempts: number;
    maxIndexDraws: number;
    samplerConfigVersion: string;
    likelihoodConfig: Readonly<{
      schemaVersion: "d2-particle-likelihood-v1";
      forcedPassLogFactor: number;
      couldBeatButPassedLogFactor: number;
      observedLeadPlayLogFactor: number;
      observedFollowPlayLogFactor: number;
      degradedEssThreshold: number;
      normalizationTolerance: number;
      essTolerance: number;
    }>;
  }>;
  request: Readonly<{
    policyId: "d2f-lightweight-v1";
    candidates: readonly Readonly<{
      candidateId: string;
      action: D2fBenchmarkActionFixture;
      baselineEvaluatorScore: number;
    }>[];
    budget: Readonly<{
      replicateCountPerScenario: number;
      maxPliesPerReplicate: number;
      maxPolicyActionEvaluationsPerPly: number;
      maxWorkUnits: number;
    }>;
    evidenceRequirements: Readonly<{
      schemaVersion: "d2f-rollout-evidence-requirements-v1";
      minimumEffectiveSampleSize: number;
      minimumAcceptedScenarioCount: number;
      minimumCompletedReplicateCount: number;
      requireCompleteCoverage: true;
    }>;
    aggregationPolicy: Readonly<{
      schemaVersion: "d2f-rollout-risk-policy-v1";
      variancePenalty: number;
      downsideRiskPenalty: number;
    }>;
  }>;
  expected: Readonly<{
    ranking: readonly string[];
    candidateIds: readonly string[];
    scenarioCount: number;
    replicateCountPerScenario: number;
    policyId: "d2f-lightweight-v1";
    formalExecutionAllowed: false;
    coverage: "complete";
    result: Readonly<{
      schemaVersion: "d2f-rollout-result-v2";
      mode: "detached";
      formalExecutionAllowed: false;
      policyId: "d2f-lightweight-v1";
      rootDigest: string;
      candidateSummaries: readonly Readonly<{
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
      }>[];
      ranking: readonly string[];
      aggregateDiagnostics: Readonly<{
        effectiveSampleSize: number;
        acceptedScenarioCount: number;
        replicateCountPerScenario: number;
        completedReplicateCount: number;
        expectedCompletedReplicateCount: number;
        candidateCount: number;
        workUnitCount: number;
        coverage: "complete";
      }>;
    }>;
  }>;
}>;
~~~

The fixture has only tracked, deterministic replay/context data. publicHistoryEvents,
pendingPublicEvents, all three ledgers, ownCurrentHand, and publicState are serialized
inputs validated by the existing contracts. ownCurrentHand is the perspective-visible hand
required by the real builder; hidden scenario hands are not fixture data. particleBank is builder
configuration, not a serialized ParticleBank. request.aggregationPolicy maps to the real
request.riskPolicy field. The runner derives request.limits by copying request.budget.
expected.result is a literal golden oracle authored with the fixture; no field is generated
from the measured output at runtime.

The runner must additionally enforce these schema relationships:

~~~text
publicIdentity roundIdentity = gameId + ":round:" + roundSequence
publicIdentity handIdentity = roundIdentity + ":hand:" + handSequence
all public event and ledger identities equal publicIdentity
pendingPublicEvents are the builder input events and publicHistoryEvents are the source history
expectedFinalEventIndex = finalLedger.lastAppliedEventIndex
expectedFinalPublicLedgerHash = canonicalPublicLedgerHash(finalLedger)
publicState fields match finalLedger and the real replay rules
candidateId = canonicalActionIdentity(action)
candidate IDs are unique and equal expected.candidateIds as a set
expected.ranking is a permutation of expected.candidateIds
expected.result.ranking = expected.ranking
expected.result.policyId = expected.policyId
expected.result.formalExecutionAllowed = false
expected.result.aggregateDiagnostics.coverage = "complete"
expected.scenarioCount = expected.result.aggregateDiagnostics.acceptedScenarioCount
expected.replicateCountPerScenario = expected.result.aggregateDiagnostics.replicateCountPerScenario
~~~

No raw private hands, assignments, individual weights, seed, tape, cursor, wall-clock value,
or runtime-generated expected oracle is accepted.

### Correctness oracle

Before timing, the runner executes one untimed correctness run. Every warm-up and measured
run is also checked after runDetachedRollout returns. A run is correct only when all of the
following hold:

~~~text
result.ok === true
result.result.schemaVersion === "d2f-rollout-result-v2"
result.result.mode === "detached"
result.result.policyId === "d2f-lightweight-v1"
result.result.formalExecutionAllowed === false
result.result.aggregateDiagnostics.coverage === "complete"
result.result.ranking equals fixture.expected.ranking in order
result.result candidate ID set equals fixture.expected.candidateIds
result.result.aggregateDiagnostics.acceptedScenarioCount === fixture.expected.scenarioCount
result.result.aggregateDiagnostics.replicateCountPerScenario === fixture.expected.replicateCountPerScenario
result.result.candidateSummaries.length === fixture.expected.candidateIds.length
result.result.rootDigest and all result provenance fields equal fixture.expected.result
result.result.candidateSummaries deep-equal fixture.expected.result.candidateSummaries
result.result.ranking deep-equal fixture.expected.result.ranking
result.result.aggregateDiagnostics deep-equal fixture.expected.result.aggregateDiagnostics
fixture and constructed request remain deeply unchanged
~~~

Any rollout failure, oracle mismatch, mutation, missing candidate, incomplete coverage,
non-finite result field, or unexpected result shape is a correctness failure. The runner emits
no performance PASS, returns exit code 2, and does not add that run to measured samples.
The correctness oracle is a literal fixture value and is never created from the current run.

### Timing boundary and iteration order

Before the first measured iteration, the runner completes:

~~~text
read fixture
→ validate fixture schema and relationships
→ derive internal seed
→ build and register ParticleBank
→ construct immutable benchmark request
→ untimed correctness run
→ warm-up 3
~~~

The timed object is exactly one complete runDetachedRollout(benchmarkRequestInput).
The timed interval includes request validation, scenario source, canonical schedule, kernel,
evidence validation, aggregation, ranking, and result assembly.

The timed interval excludes Node/module startup, fixture file reading, JSON parsing, fixture
schema validation, ParticleBank build and registration, correctness comparison, console/JSON
output, and warm-up.

The runner uses a monotonic high-resolution clock such as performance.now(). A timing API is
present only in the benchmark script and never enters production rollout code. Warm-up samples
are not measured samples. Each measured iteration must complete one full run and one correctness
comparison before the next iteration begins.

### Metrics and statistics

Each measured iteration records one unrounded durationMs. Every duration must be finite and
greater than or equal to zero. Exactly these values are emitted:

~~~text
sampleCount
minMs
maxMs
meanMs
medianMs
p95Ms
throughputPerSecond
~~~

The samples are sorted numerically in ascending order. No localeCompare is used for numbers.
The exact formulas are:

~~~text
meanMs = sum(samples) / sampleCount
medianMs for ten samples = (samples[4] + samples[5]) / 2
p95 index = ceil(0.95 * sampleCount) - 1
p95Ms = sortedSamples[p95 index]
throughputPerSecond = 1000 / meanMs
~~~

The runner does not remove the slowest sample, trim outliers, or use warm-up samples. It does
not round before a threshold decision. JSON display may preserve sufficient precision, but all
threshold decisions use the original unrounded values. A zero mean that makes throughput
non-finite is a benchmark failure.

### Threshold strategy and evidence levels

The functional benchmark Gate applies in every environment:

~~~text
correctness oracle passes for the initial run, all warm-ups, and all measured runs
warm-up count is exactly 3
measured count is exactly 10
sampleCount is exactly 10
all durations and statistics are finite and non-negative
no crash and no unhandled rejection
no single run exceeds 60000 ms
runner exit code is 0
~~~

60000 ms is only a hang ceiling and is not a product performance target.

The release performance Gate accepts only Node 22.22.2 CI evidence from the fixed fixture,
fixed runner, and fixed 3/10 rule. Before that evidence exists, the release state remains:

~~~text
AWAITING_NODE22_CI
~~~

Node 24 local output is always marked:

~~~text
SUPPLEMENTAL_LOCAL_EVIDENCE
~~~

Node 24 median or p95 cannot close the Node 22 release Gate. The
AWAITING_FIXED_BENCHMARK_RUNNER state closes when the runner, fixture, contract test, and
functional Gate pass; it does not wait for Node 22. The final state must not be described as
D2F Shadow release ready.

### Stable success report and errors

On success, stdout contains exactly one JSON object with this schema and no other text:

~~~ts
type D2fBenchmarkReport = Readonly<{
  schemaVersion: "d2f-rollout-benchmark-report-v1";
  fixtureId: "d2f-public-rollout-calibration-v1";
  runner: "d2f-rollout-budget-calibration";
  nodeVersion: string;
  platform: string;
  architecture: string;
  evidenceLevel: "SUPPLEMENTAL_LOCAL_EVIDENCE" | "NODE22_RELEASE_EVIDENCE";
  warmupIterations: 3;
  measuredIterations: 10;
  correctness: "passed";
  metrics: Readonly<{
    sampleCount: 10;
    minMs: number;
    maxMs: number;
    meanMs: number;
    medianMs: number;
    p95Ms: number;
    throughputPerSecond: number;
  }>;
  threshold: Readonly<{
    kind: "hang-ceiling";
    maximumSingleIterationMs: 60000;
    passed: true;
  }>;
  verdict: "PASS";
}>;
~~~

NODE22_RELEASE_EVIDENCE is accepted as formal release evidence only from the authorized
Node 22.22.2 CI result. All other successful environments, including Node 24 local runs,
remain supplemental evidence.

Errors use stderr for a short non-private message. A failure never emits a successful report
on stdout, and stderr never contains private state, hands, assignments, weights, seed, tape,
cursor, or raw scenario data. The fixed exit codes are:

~~~text
1 = argument or fixture error
2 = correctness failure
3 = runtime or benchmark failure
4 = hang ceiling exceeded
~~~

The runner returns exit code 1 for argument/schema/read/parse failures; exit code 2 for
correctness oracle mismatch or rollout failure; exit code 3 for ParticleBank build failure,
request construction failure, incomplete measured execution, invalid metrics, crash, or
unhandled rejection; and exit code 4 when any single run exceeds 60000 ms.

### Focused contract test and RED/GREEN order

The exact focused command is:

~~~bash
npx vitest run tests/ai/rollout/d2fBenchmarkContract.test.ts \
  --exclude "**/.worktrees/**" \
  --reporter=verbose
~~~

The test must execute the real runner or its CLI entry and cover:

~~~text
fixture exists and schema is valid
fixed runner command is executable
one real success-path runner invocation
correctness oracle is checked
warm-up count is exactly 3
measured count is exactly 10
warm-up samples are absent from sampleCount
median and p95 match literal statistical oracles
success JSON matches D2fBenchmarkReport
Node evidenceLevel is correct
invalid CLI argument exits non-zero
malformed fixture exits non-zero
correctness mismatch exits non-zero
hang ceiling exits non-zero
no skip, only, or test-placeholder modifier
~~~

The contract test may call a pure statistics helper exported only from the benchmark script
for median and p95 literal checks. It must still execute the real success path at least once.
No public production barrel is added.

The next implementation turn must obtain real RED for:

~~~text
fixture file absent
runner file absent
fixed CLI not executable
success report schema absent
correctness oracle not executed
metric and threshold contract absent
~~~

These RED cases must fail on the named behavior at the real entry. They must not be created
with a wrong import, wrong filename, temporary mock, wrong fixture, or missing dependency.
The implementation then performs the minimum changes in the three-path allowlist and reruns
the same focused command to GREEN. Task 8 remains not started.

### Docs-only validation and deferred gates

This freeze runs only:

~~~text
git diff --name-status
git diff --check
git status --short
~~~

The validation must prove that changed paths are exactly the three canonical documents,
Markdown fences are paired, no implementation placeholder token remains in the changed content, no
production/test/package/config path changed, and all three documents have identical active
Task 7 contract lines for allowlist, fixture schema, CLI, correctness oracle, timing,
iterations, metrics, p95/median, 60000 ms ceiling, report, exit codes, evidence levels,
focused command, and Task 8 status.

This docs-only turn does not run Vitest, the benchmark, tsc, or build. The deferred gates are:

~~~text
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
Task 9 full permitted regression
~~~

The frozen status is:

~~~text
TASK 7 BENCHMARK INTERFACE/THRESHOLD FROZEN
TASK 7 CODE PENDING
TASK 8 NOT STARTED
~~~

No D2F Shadow release-ready claim is permitted.
状态：
TASK 4 PRAGMATIC CLOSURE STANDARD FROZEN
TASK 4 TRANSFER MEMBERSHIP REMEDIATION PENDING
TASK 5 NOT STARTED

Task 1–3 的历史状态和已完成契约仍保留在下文；本状态块及文末 pragmatic closure block 表示当前审查严重度和本轮实现边界。

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

Task 1 的历史 bridge/source remediation 已完成；当前 validation-consolidation code pass 的唯一 particles-side production additions are the shared public validator and the existing narrow bridge. 本轮仍只修改文档，不修改其中任何 production 或 test 文件：

```text
src/ai/particles/particleBankRolloutAccess.ts
src/ai/particles/particleBankPublicValidation.ts
src/ai/rollout/particleScenarioSource.ts
```

`particleBankRolloutAccess.ts` 是唯一允许读取 `readParticleBankInternals`/WeakMap internals 的 particles 侧桥接；rollout 其他 production 模块不得导入、re-export 或通过 barrel 暴露 `particleBankInternals.ts` 的任何 symbol。`particleScenarioSource.ts` 是唯一调用该桥接的 scenario source；两者都不加入 public barrel。AST/symbol gate 同时检查 import 和 export，测试只通过行为入口验证 fake/unknown handle，不直接绕过 bridge 读取 internals。桥接只能返回只读、深拷贝或不可变投影，不能返回可修改 `ParticleBank` internals 的引用；raw scenario、四座位完整手牌、particle weight 和 seed 只可在 bridge/source 到 kernel 的隔离链中存在，不能进入 policy、public diagnostics 或 shadow sink。fake/unknown handle 必须安全失败并返回 `fake-or-unknown-particle-bank` typed failure。

bridge success 的最低保证是 defense-in-depth，而不是替代 source 的 replay 防线：bank 必须是已登记 WeakMap handle，public status/metadata 合法；records 非空；`particleId` 非空且唯一；scenario schema 合法；canonical initial deal 合法；hidden transfer assignments 结构合法；`particleId === particleScenarioIdentity(bank.snapshot, scenario)`；normalizedWeight finite 且非负；weight 总和在冻结 tolerance 内为 1；ESS finite、非负且不超过 scenario count。bridge 必须逐字段 clone 并递归 freeze projection，getter、symbol、function、malformed scenario、fake/unknown handle 都返回已有 typed `fake-or-unknown-particle-bank` 或 `{ kind: "scenario-source-failed"; reason: "private-state-invalid" }` failure，不执行 caller accessor，不扩大 public ParticleBank API。优先复用 `particleScenarioIdentity` 和 `validateCanonicalInitialDeal`，不复制粒子语义算法；source 仍必须二次验证 replay/public consistency，不能因 bridge 增强而删除 source 防线。

此前五路径是已经完成的 bridge/source remediation implementation scope，不是本轮 validation-consolidation code remediation 的 allowlist。当前 expected HEAD 的下一轮修复边界统一冻结在第 3.1.3 节；本轮只修改文档，不修改其中任何 production 或 test 文件。

```text
src/ai/rollout/contracts.ts
src/ai/rollout/particleScenarioSource.ts
src/ai/particles/particleBankRolloutAccess.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
```

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

type RolloutRiskPolicy = Readonly<{
  schemaVersion: "d2f-rollout-risk-policy-v1";
  variancePenalty: number;
  downsideRiskPenalty: number;
}>;
```

`RolloutRequest` 是 caller 可构造的纯数据配置。它只接受受支持的 literal `policyId`，不接受、执行、bind、clone、freeze 或保存任何 caller-provided policy、callback、factory 或 registry entry；validated request 及其递归可达属性不得包含 function。未知 policy id、未知字段和 callback 注入都返回既有 typed `invalid-request` failure，不能让 caller callback throw 逃逸。

`policyId` 当前唯一合法值为 `"d2f-lightweight-v1"`。新增 policy id 不属于当前 D2F Task 1–9 的隐式扩展，必须由 D2G 或其他后续明确任务修改 literal union、内部 factory mapping、privacy/determinism/CRN pairing/regression tests；不得通过配置文件、环境变量或运行时 registry 绕过审查。

`RolloutBudget`、`RolloutBudgetLimits`、`RolloutEvidenceRequirements` 和 `RolloutRiskPolicy` 均为调用者显式传入，Task 1–6 不设置 production/shadow 默认值。budget/limits 的字段必须是 finite safe integer；evidence 的 ESS 和三个阈值必须是正的 finite safe integer，并且 validated request 不得要求超过 `maximumWorkUnits` 的证据上限；风险系数必须 finite 且 `>= 0`。工作量乘积必须在校验中逐步检查溢出和 limits。kernel 只消费 `ValidatedRolloutBudget`，不读取全局配置、wall clock、进程状态或 worker 调度。

### 3.1.1 Task 1 caller-controlled data boundary

所有 caller-controlled envelope 都是递归 plain data contract。request、candidate、action/group/card、budget、limits、evidence requirements、risk policy、scenario source input、public state、public history event、initial/final ledger、`seenEventHashes`、current trick、revealed transfer、recent action summary、snapshot identity、result assembly input、candidate summary 和 aggregate diagnostics 在进入任何 spread、`structuredClone`、property getter、canonical hash 或 freeze 前，必须逐层执行同一安全检查：对每个 object 使用 `Reflect.ownKeys`，要求每个允许字段都是 own data property，拒绝 getter/setter、symbol key、函数值、未知 string key 和非允许 prototype；对每个 array 只允许 schema 定义的连续 numeric indices 与 `length` own data property，拒绝 expando、symbol 和 accessor index。dynamic dictionary 只允许 schema 已定义的 string key 集合，不接受任意扩展字段。

`RolloutBudget` 的 own keys 必须精确为 `replicateCountPerScenario`、`maxPliesPerReplicate`、`maxPolicyActionEvaluationsPerPly`、`maxWorkUnits`；`RolloutBudgetLimits` 的 own keys 必须精确为 `maxReplicateCountPerScenario`、`maxPliesPerReplicate`、`maxPolicyActionEvaluationsPerPly`、`maxWorkUnits`。两者都拒绝额外 string key、symbol、accessor 和异常 prototype。validated output 只逐字段复制允许字段，禁止使用会保留未知字段的 spread。callback 不能被执行、bind、保存或返回，也不能通过嵌套 budget/limits 进入 success request。

该检查必须在读取 caller value、spread、clone、canonicalization 和 freeze 之前完成；所有入口上的 Proxy trap/descriptor/reflect 异常都必须捕获并转成 typed failure。ECMAScript Proxy 不是可序列化 plain-data contract；检查 Proxy 可能触发其 trap，规范只要求 trap 抛错不向外逃逸，不能声称检查本身能够阻止 trap 执行。ParticleBank public handle 是唯一 opaque-handle 例外：不遍历 WeakMap internals，但仍检查 public metadata 和 frozen boundary，private bridge 另行检查 internals projection。

`deepFreeze` 必须遍历 `Reflect.ownKeys`，或者只作用于已经由安全逐字段 clone 产生的 graph；不得以 `Object.values` 作为 hostile-input 安全边界。任何 request、source、result assembly 或 bridge 输入异常都返回既有 typed failure，不得 throw。

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

### 3.1.2 Historical Task 1 Final Gate Remediation Design Freeze

本节保留上一轮 final-gate remediation 记录。它不是当前 code pass 的 source of truth；当前 source of truth 是紧随其后的第 3.1.3 节。上一轮 expected HEAD `5cd433d3e623e7e516effb36ab5bc080f5427d1a` 的结论不得替代当前起始 HEAD `f1944efc24e0404d057e86c16460bfd2a5e31794` 的独立审查。

#### I-1：ESS 边界与 ParticleBank public metadata

真实调用路径为：

~~~text
calculateEffectiveSampleSize
  -> ess.status = degraded iff ess < degradedEssThreshold
particleBankBuilder summary.status
  -> ess.status
particleBankBuilder bank.status
  -> degraded iff ess <= degradedEssThreshold
~~~

因此真实边界 particleCount = 1、normalized weights 为 [1]、degradedEssThreshold = 1 会产生 summary.status = ready 与 bank.status = degraded。这是当前 builder 与 public request validator 的根因不一致，不是测试 fixture 问题。

后续最小修复统一冻结为：

~~~text
ESS < threshold  -> degraded
ESS == threshold -> ready
ESS > threshold  -> ready
bank.status === summary.status === effectiveSampleSizeResult.status
~~~

阈值的唯一语义入口是 ESS helper；top-level bank 不得继续单独使用 <= 维护第二套规则。该修复只允许调整 builder 对 helper status 的使用，不扩展为 ParticleBank 重构。

真实成功 builder/sampler 路径同时冻结以下不变量：

- acceptedParticleCount === requestedParticleCount；
- acceptedParticleCount === config.particleCount；
- samplingAttempts <= config.maxSamplingAttempts；
- samplingAttempts >= acceptedParticleCount + duplicateCount；
- duplicateCount 是采样器真实 identity duplicate 计数，范围为 0 <= duplicateCount <= samplingAttempts，不得凭字段名添加 duplicateCount <= acceptedParticleCount；
- zeroWeightCount 是 normalized weights 中等于 0 的真实计数，范围为 0 <= zeroWeightCount <= acceptedParticleCount；
- normalized weights 总和在 builder tolerance 内为 1，ESS 为 finite 且位于 [1, acceptedParticleCount]；
- builder 成功 bank 的 public ESS 与 summary ESS 来自同一个 ESS helper 结果；
- ready/degraded bank 不带 own failureReason；failed summary 只出现在 ParticleBankBuildResult.ok === false，不能伪装成 public success bank。

accepted public ParticleBank 的 exact public schema 以真实类型为准：

~~~text
ParticleBank:
schemaVersion, snapshot, config, particleCount, effectiveSampleSize, status, summary

snapshot:
gameId, roundIdentity, handIdentity, initialLedgerHash,
lastAppliedEventIndex, ledgerHash, perspectiveSeat, gameRank

config:
schemaVersion, particleCount, maxSamplingAttempts, maxIndexDraws,
samplerConfigVersion, likelihoodConfigHash

accepted success summary:
status, requestedParticleCount, acceptedParticleCount, samplingAttempts,
duplicateCount, zeroWeightCount, effectiveSampleSize

failed private summary only:
status = failed, requestedParticleCount, acceptedParticleCount,
samplingAttempts, duplicateCount, zeroWeightCount, failureReason
~~~

accepted public bank 的 summary status 只能是 ready/degraded，exact own keys 不包含 failureReason；failureReason 只允许出现在真实 private failed summary/build-failure union。validator 必须逐层执行 conditional exact own keys、plain data、strict prototype、data descriptor、无 symbol/accessor/function、deep-frozen 检查，并且不得读取 getter。

public metadata validator 必须拒绝 NaN、Infinity、fractional、negative、unsafe integer 和 Object.is(value, -0) 的不合法数值表示；正零只保留给真实允许为 0 的 samplingAttempts、duplicateCount 和 zeroWeightCount，所有其他 numeric field 的 -0 也拒绝。particleCount、requested/accepted count、config count 和上限必须是正 safe integer。public/summary ESS 的 metadata equality 使用绝对误差 <= 1e-9；这只是两个已计算 ESS 字段的一致性比较，ESS helper 自身仍使用 builder 传入的 1e-12..1e-6 computational tolerance、clamp 和严格 threshold rule。必须覆盖极小误差、恰好阈值和刚超 tolerance 的边界。private bridge 的 raw ESS 重算不得使用比 builder 可接受 clamp 更严格的 tolerance；若现有 bridge 无法满足，必须先报告根因，再申请扩大 forbidden-path allowlist。

#### I-2：RolloutResult 与 Request provenance 绑定

当前真实字段映射冻结如下：

| Validated Request 来源 | Result/assembly 字段 | 必须满足的关系 |
| --- | --- | --- |
| request.candidates[*].candidateId | CandidateRolloutSummary.candidateId、ranking[*] | summary 集合与 request candidate 集合精确相等；无 foreign/missing/duplicate |
| 同一 candidate 的 baselineEvaluatorScore | CandidateRolloutSummary.baselineEvaluatorScore | finite 且使用 Object.is 精确相等；保留 -0 语义，不重算、不舍入、不从其他 candidate 借用 |
| request.budget.replicateCountPerScenario | 每个 summary 与 aggregate 的 replicateCountPerScenario | 精确相等 |
| request.scenarioSourceInput.bank.summary.acceptedParticleCount | summary/aggregate 的 acceptedScenarioCount | 使用已验证 public bank 的 accepted count；它必须等于 bank.particleCount、config.particleCount 和 requestedParticleCount |
| accepted scenario count × request repeat count | expectedReplicateCount | safe integer product；不得由 assembly 任意声明 |
| 每个 summary 的 completed count | aggregate completed count | 所有 candidate summary 的 safe sum |
| request candidate count × expected local coverage | expectedCompletedReplicateCount | safe integer product |
| request.scenarioSourceInput.bank.effectiveSampleSize | aggregate effectiveSampleSize | 使用同一 public metadata tolerance；不得由 assembly 任意声明 |
| request.evidenceRequirements | evidence/coverage fields | minimumEffectiveSampleSize、minimumAcceptedScenarioCount、minimumCompletedReplicateCount 和 requireCompleteCoverage 必须被满足 |
| validated request | result mode、formalExecutionAllowed、policyId、rootDigest | 只能由 validated request 派生 |

createRolloutResult(requestInput, assemblyInput) 必须重新验证 request；assembly 只允许当前真实的 candidateSummaries、ranking、aggregateDiagnostics 三个字段。assembly 不得声明 budget、scenario count、repeat count、root、policy、mode 或 formal flag。任一 provenance 不一致都返回 typed invalid-request，不得 throw，不得返回 partial result。

当前 contracts.ts 只验证 candidate ID 集合和 assembly 内部计数，未把 summary baseline score、summary/aggregate repeat count、bank accepted count、bank ESS 与 validated request 绑定；下一轮必须以真实 production factory 测试关闭该缺口。当前类型没有 expectedScenarioCount、completedScenarioCount 或 totalCompletedReplicates 字段，也不需要为本修复新增它们：唯一允许的 scenario provenance 是已验证 request.scenarioSourceInput.bank.summary.acceptedParticleCount 与 bank.effectiveSampleSize，唯一允许的 repeat provenance 是 request.budget.replicateCountPerScenario。若未来 source 允许 accepted count 与该 public bank count 不同，必须先停止并报告缺少 provenance 的根因，不得把 caller assembly 字段当作替代，也不得扩大 forbidden-path allowlist。

#### I-3：完整负向测试矩阵

下一轮必须在真实 production entry 上加入并先 RED 后 GREEN 的测试：

1. builder 使用真实 buildParticleBank 覆盖 ESS < threshold、ESS == threshold、ESS > threshold，断言 bank、summary 和 ESS helper 三者 status 一致；
2. request public metadata 覆盖 config identity、snapshot identity、config particle count、requested/accepted/top-level particle count 冲突；
3. 覆盖 accepted count 小于/大于目标、samplingAttempts 超过 config max、ready/degraded 携带 failureReason、status/summary status 冲突、public/summary ESS 冲突、zeroWeightCount 越界、duplicateCount 越界；
4. 对真实 config/summary/top-level numeric fields 逐字段覆盖 NaN、Infinity、-Infinity、fractional、negative、-0、unsafe integer、上限溢出、合法 0 和合法最大边界；不适用的类别必须在测试名称或矩阵中说明；
5. result/request provenance 覆盖 summary repeat count 不同、aggregate repeat count 不同、修改 baseline score、candidate A 使用 candidate B score、foreign/missing/duplicate summary、ranking 集合不一致、scenario/repeat product 不一致、assembly 注入 budget/root/policy/mode/formal 字段，以及合法多 candidate/multi-scenario/multi-replicate 正例；
6. 每个 failure 断言 typed classification、no throw、无 partial result、无私有 diagnostics；所有 hostile callback/getter 调用计数必须为 0。

所有测试必须直接调用 buildParticleBank、createRolloutRequest、createRolloutResult、readParticleBankRolloutAccess 或 createParticleScenarioSource 等真实入口，不得用 mock validator 或与 production helper 共享 expected 的测试替代。

#### Next code remediation allowlist

~~~text
src/ai/particles/particleBankBuilder.ts
src/ai/rollout/contracts.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/effectiveSampleSize.test.ts        # only if necessary
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts       # only for responsibility regression
~~~

forbidden paths remain：

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

只有调查证明 forbidden path 是无法绕开的根因时，才停止并报告；不得自行扩大范围。Task 2–9 不开始。

### 3.1.3 Task 1 Validation Consolidation Remediation Design Freeze

本节是当前三份 D2F 文档的唯一 validation-consolidation source of truth。设计冻结基于起始 HEAD `f1944efc24e0404d057e86c16460bfd2a5e31794`、branch `codex/d2f-crn-rollout-source` 的真实代码和测试审查结果；本轮只修改本节所属的三份文档，不修改 production、tests、package、lock、config，不运行长测试、build 或 benchmark，不开始 Task 2。

#### Root cause and architecture decision

五项待修复问题的共同根因不是单个字段漏判，而是同一 public ParticleBank metadata schema 在 `src/ai/rollout/contracts.ts` 和 `src/ai/particles/particleBankRolloutAccess.ts` 被分别维护；两处因此出现不同的 ESS 范围、`-0` 整数语义、accepted/config/count 关系和 sampling-attempt 上限。`createRolloutResult` 另有一条只检查 assembly 内部和式的 work-unit 路径，没有把结果上限绑定到已验证 request budget。现有 boundary tests 的主要 bank 是手工 public fixture，未把真实 multi-particle builder → registered handle → request → bridge → scenario source 串成一个验收路径。

下一轮唯一允许的架构修复是一个纯 public、descriptor-first 的共享校验器：

~~~text
src/ai/particles/particleBankPublicValidation.ts
  -> src/ai/particles/contracts.ts                 (ParticleBank public types only)
src/ai/rollout/contracts.ts
  -> particleBankPublicValidation.ts                (request boundary consumer)
src/ai/particles/particleBankRolloutAccess.ts
  -> particleBankPublicValidation.ts                (bridge boundary consumer)
  -> particleBankInternals.ts                      (the only private-record reader)
src/ai/rollout/particleScenarioSource.ts
  -> particleBankRolloutAccess.ts                   (the only bridge consumer)
~~~

`particleBankPublicValidation.ts` 不得导入 `particleBankInternals.ts`、bridge、rollout、Room、decision engine 或 planning；不得加入 public barrel。它提供给上述两个 boundary consumer 的唯一 helper 为：

~~~ts
type ParticleBankPublicValidationResult =
  | Readonly<{ ok: true; bank: ParticleBank }>
  | Readonly<{ ok: false; failure: { kind: "invalid-public-particle-bank" } }>;

function validateParticleBankPublic(input: unknown): ParticleBankPublicValidationResult;
~~~

该函数必须先对 opaque `unknown` 做 `Reflect.ownKeys`、strict prototype、exact own-key、own data-descriptor、无 symbol/accessor/function、plain/frozen 形状检查，再读取任何字段；任何异常、Proxy、getter 或 callback 均转 typed failure，调用计数必须为零。成功只返回原始 bank handle，必须保持 `Object.is(result.bank, input)`，不得 spread、clone、rebuild 或读取 WeakMap/private records。request 和 bridge 只能消费该 helper 的 validated public result；bridge 在 public success 之后才可调用 `readParticleBankInternals` 做私有 projection 检查。compiler API/symbol gate 必须证明：共享 helper 无 internals import，只有 bridge 解析 `readParticleBankInternals`，只有 source 解析 bridge，且无 registration accessor、brand token、global registry 或 public barrel 泄漏。

#### ESS and public metadata contract

ESS 有两个不同语义，必须在代码和测试中分开：

~~~text
status: ESS < threshold  -> degraded
        ESS == threshold -> ready
        ESS > threshold  -> ready

public range: 1 <= bank.effectiveSampleSize <= acceptedParticleCount
              1 <= summary.effectiveSampleSize <= acceptedParticleCount
bank.effectiveSampleSize ≈ summary.effectiveSampleSize
  iff abs(bankESS - summaryESS) <= 1e-9
~~~

public range 是严格 domain check，不使用 `1e-9` 容差；`1e-9` 只用于 bank ESS 与 summary ESS 两个已计算字段的 equality check。NaN、`+Infinity`、`-Infinity`、`0.9999999995`（下界外）和 `N + 0.0000000005`（上界外）必须拒绝。builder 的 normalized weights、ESS helper 计算 tolerance/clamp 不在该 equality tolerance 中重新实现。helper 是 status 的唯一入口；summary.status、bank.status 必须都直接复用 helper status，不能在 top-level 继续维护 `<=` 分支。真实 builder 正例必须覆盖 `<`、`==`、`>`，包括 `particleCount = 1`、weights `[1]`、threshold `1`；三者状态必须一致。

成功 public bank 的真实关系固定为：

- `acceptedParticleCount === requestedParticleCount`；
- `acceptedParticleCount === config.particleCount === bank.particleCount`；
- `samplingAttempts <= config.maxSamplingAttempts` 且 `samplingAttempts >= acceptedParticleCount + duplicateCount`，加法先做 safe checked operation；
- `0 <= duplicateCount <= samplingAttempts`，duplicate 是 sampler 的真实 identity duplicate 计数；
- `0 <= zeroWeightCount <= acceptedParticleCount`，zero-weight 是 normalized weights 中等于零的真实计数；
- normalized weights 的 builder tolerance、finite ESS 和真实 sampler failure 关系保持不变；
- ready/degraded bank 和其 accepted summary 都没有 own `failureReason`；failed 只存在于真实 build-failure union，不得伪装成 accepted public bank。

#### Canonical integer and signed-zero matrix

所有整数 helper 统一先执行 `Number.isSafeInteger(value)` 和 `!Object.is(value, -0)`；非负整数再执行 `value >= 0`。`Number.isFinite` 不能替代 safe-integer check，`value >= 0` 不能单独承担 `-0` 保护，整数 canonical encoding 也不能在 guard 之前把 `-0` 写成 `"0"`。

| 字段类别 | 允许值 | `-0` | 边界规则 |
| --- | --- | --- | --- |
| particle/request/accepted/config particle count、正 limits、replicate budget | positive safe integer | reject | zero、fractional、negative、NaN、±Infinity、unsafe integer reject；最大 safe integer 在未超出关系时保留 |
| samplingAttempts、duplicateCount、zeroWeightCount、workUnitCount、completed counts | nonnegative safe integer | reject | 正零合法；加法/乘法先 checked，越界 reject |
| lastAppliedEventIndex / ledger index | `-1` sentinel 或 nonnegative safe integer | reject | `-1` 合法；fractional、其他 negative、NaN、±Infinity、unsafe integer reject |
| public seat fields | safe integer `0..3` | reject | `0` 合法；`-0` 不是 canonical seat |
| baselineEvaluatorScore | finite number | preserve signed zero | 用 `Object.is` 做 request→summary provenance；不得转字符串、舍入或归一化 |
| ESS | finite real in strict `[1, N]` public domain | reject as numeric identity | 仅 bank↔summary equality 使用 absolute error `<= 1e-9` |

上述矩阵必须覆盖 snapshot、ledger、seat、config、summary、top-level bank、request budget、result aggregate 的真实 numeric fields。bridge 使用同一 canonical integer rules，不能重新定义接受范围。合法零值和合法最大 safe integer 需要正例；fractional、negative、NaN、±Infinity、`-0`、unsafe integer 和超界需要 typed negative case。

#### Unified request/bridge validation and opaque-handle duties

共享 validator 的 invariant 集合必须同时约束 top-level bank、snapshot、config、summary 的 schema、strict prototype、descriptor、identity、count、status、failureReason、ESS、sampling、duplicate 和 zero-weight metadata。request validator 的职责是 public acceptance、request field binding 和 caller reference isolation；它不读 WeakMap/private records。bridge 的职责是 public validation 之后的 registered-handle/private projection defense-in-depth：验证 handle registration、record count、particle identity uniqueness、scenario identity、deal/transfer schema、normalized weights、raw ESS/weight consistency、projection identity 与 deep freeze，并在失败时返回已有 typed `fake-or-unknown-particle-bank` 或 `private-state-invalid` union。

因此：public-valid but unregistered handle 可以通过 public `createRolloutRequest` validation 并保持同一对象 identity；随后 `particleBankRolloutAccess`/`particleScenarioSource` 必须返回 typed fake-or-unknown-particle-bank failure，不得读取不存在的 private record、返回 partial scenario 或泄漏 raw diagnostics。bridge 仍是唯一 internals reader，scenario source 仍是唯一 bridge consumer；不能通过 public ParticleBank API、registration accessor、brand token 或 global registry 绕过这条边界。

#### RolloutResult provenance and unique work-unit formula

所有 result 字段必须沿唯一 provenance 链派生：

~~~text
validated RolloutRequest
  -> request candidate/baseline/budget/source metadata
  -> CandidateRolloutSummary per candidate
  -> RolloutAggregateDiagnostics
  -> ranking set permutation
  -> RolloutResult
~~~

每个 summary 的 baseline 必须满足：

~~~ts
Object.is(summary.baselineEvaluatorScore,
  matchingRequestCandidate.baselineEvaluatorScore)
~~~

两值都必须 finite；candidate A 不得使用 candidate B 的 baseline；`+0` 与 `-0` 按 `Object.is` 区分。每个 summary 和 aggregate 的 replicate budget 必须精确等于 `request.budget.replicateCountPerScenario`，assembly 不得改变它。accepted scenario count 唯一来自 `request.scenarioSourceInput.bank.summary.acceptedParticleCount`；expected replicate product 唯一为 `acceptedScenarioCount * requestReplicateCount`，completed count 只能来自 summaries 的 checked sum，coverage 分母和 aggregate count 只能从这些 validated values 派生。不得新增或接受 `expectedScenarioCount`、`completedScenarioCount`、`totalCompletedReplicates` 作为 caller provenance 字段。

当前类型和调用关系证明 `ValidatedRolloutBudget.maximumWorkUnits` 是 per-candidate 上限：它被单个 candidate 的 `RolloutReplicateInput` 消费，既有计算式只包含 `replicateCountPerScenario * maxPliesPerReplicate * maxPolicyActionEvaluationsPerPly`，没有 candidate count 或 assembly 自报的 scenario factor。冻结唯一公式如下，其中 `C` 是 validated request candidate count，`B` 是 validated `maximumWorkUnits`：

~~~text
B = min(request.budget.maxWorkUnits,
        checkedProduct(requestReplicates, maxPlies, maxPolicyActionEvaluations))
每个 summary.workUnitCount <= B
aggregate.workUnitCount = checkedSum(summary.workUnitCount for every candidate)
aggregate.workUnitCount <= checkedProduct(C, B)
~~~

所有 product/sum 必须在运算前做 finite safe-integer checked arithmetic；overflow、MAX_SAFE_INTEGER 以上、summary 超过 `B`、aggregate 超过 `C * B`、aggregate 不等于 summaries checked sum 都 typed reject。under-budget、恰好 budget、early completion 都是合法状态；early completion 不得被误当成完整 coverage。`completedReplicateCount` 与 `workUnitCount` 是不同字段，不能通过新增模糊重复字段解决歧义。若未来要改为 global budget，必须先改变冻结类型和三份文档，不得在 assembly 中隐式切换解释。

candidateSummaries、ranking 和 request candidate 集合必须精确相等；ranking 可以重排但不能增删。assembly 只允许冻结的三个字段：`candidateSummaries`、`ranking`、`aggregateDiagnostics`，不得注入 rootDigest、policyId、mode、formal flag、budget 或 scenario/repeat provenance。result provenance 字段只能从重新验证后的 request 派生；任何 foreign/missing/extra/duplicate、baseline/ESS/budget/count/product mismatch 返回 typed failure、no throw、no partial result。

#### Real builder integration test design

下一轮测试必须直接调用真实 `buildParticleBank`、`createRolloutRequest`、`readParticleBankRolloutAccess`、`createParticleScenarioSource` 和 `createRolloutResult`，不得手工伪造 public success bank 作为主要证明，不得用 production helper 生成同一 expected。真实 integration 正例链为：`buildParticleBank` 产生 `particleCount > 1` 的 ready/degraded bank → 注册得到的同一 handle → `createRolloutRequest` → bridge/source；同时保留 `particleCount = 1`, `[1]`, threshold `1` equality case。每个 negative case 都断言具体 typed failure、no throw、no partial request/result/scenario；hostile getter/callback/proxy 的计数为零。测试必须包括 ESS 三边界、count/attempt/duplicate/zero-weight/status/failureReason、snapshot/config identity、numeric matrix、unregistered handle、candidate baseline 错配、budget/replicate/scenario/product/coverage、aggregate ESS tolerance 和 work-unit under/equal/early/over-budget/overflow。

#### Next code allowlist and fences

下一轮 code remediation 只允许以下路径：

~~~text
src/ai/particles/particleBankPublicValidation.ts
src/ai/particles/particleBankRolloutAccess.ts
src/ai/rollout/contracts.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/effectiveSampleSize.test.ts        # only if helper coverage is necessary
~~~

`particleBankBuilder.ts` 的 ESS helper status 使用视为已冻结，下一轮不得修改 builder production；若真实 RED 证明它回归，直接 BLOCKED 并报告，不扩大 allowlist。始终 forbidden：`particleBankInternals.ts`、`particleScenarioSource.ts` production、Room、decision engine、planning、bridge 以外的 particles internals、public barrels、package/lock/config、Task 2–9。不得创建 registration accessor、brand token、global registry、通用 validation framework 或新的 public ParticleBank 字段。

下一轮 RED 必须先在现有 boundary/source tests 中以真实入口复现五项缺陷；每个 slice 只做对应最小 production change，随后用相同命令 GREEN。代码 pass 完成后才可运行 focused boundary/source/combined、Particle baseline、tsc、build 和 diff-check；固定 benchmark runner、Node 22 CI、Task 9 full permitted regression 仍为 deferred gates，不得宣称 D2F Shadow release ready。

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
}>;
```

`candidateId` 是 action 的 canonical identity，用于候选关联、identity validation 和最终排序；它必须等于 `canonicalActionIdentity(action)` 且在 request 内唯一。`baselineEvaluatorScore` 是有限 number，只用于第三层稳定排序和 shadow 对照。它不进入 candidate identity、CRN、policy context 或 random key。`scenarioIdentity` 必须非空、canonical、唯一且与 source 使用的 ParticleBank snapshot 相符；`normalizedWeight` 必须 finite、非负，所有 accepted scenario 的权重和必须通过固定归一化容差验证为 1。`RolloutScenario` 和 `RolloutReplicateInput` 是 source/kernel 内部共享契约，不得经 public barrel 导出；`privateState` 只能在 kernel 内部消费，不能进入 policy、diagnostics 或 shadow sink。

`canonicalActionIdentity` 是 context-free canonical identity：它只编码 action 结构、card semantic 字段、wildcard projection 和 canonical encoding，不凭空推断 game rank。`createRolloutRequest` 在已通过 plain-data 检查并验证的 `scenarioSourceInput.gameRank` 上，对每个 candidate action 的每个 wildcard 执行现有 engine 的 `isHeartRankWild(card, gameRank)` 或等强度 canonical helper；wildcard 必须属于 `group.cards`、不重复，并且必须是当前 game rank 的合法红心级牌。普通牌、其他花色同 rank 和 joker 都拒绝；合法红心级牌通过。不得复制一套与 engine 不同的 wildcard 规则，且 `candidateId` 仍必须等于完成 contextual legality 后的 canonical action identity。

request factory 还必须调用一个共享的、不导出的纯 public consistency helper；该 helper 由 request identity validation 和 `particleScenarioSource` 共用，优先复用现有 canonical public-event/ledger helper，不建立第二套 stable key。它在 root identity 生成前验证：`currentLastPlay` 与 `currentLastPlaySeat` 成对；seat 与 final ledger current trick 一致；public last-play stable/semantic key 一致；最后 public play event 与 current trick seat/trick index 一致；public card IDs、group/pattern 语义在现有 public evidence 能证明的范围内一致。request factory 只验证 public-observable projection，不读取 ParticleBank internals、不执行四座位 private replay，也不假装 public ledger 能证明 hidden hands；source replay 是完整 semantic consistency 的最终边界，root 不得包含与已知 public stable key 矛盾的 last play。

`RolloutReplicateInput` 不携带 executable policy。Task 4 kernel 如需 policy，只能在内部由 `policyId` 构造固定的 `InternalRolloutPolicy`，不得由 detached/offline/shadow caller 注入。

Task 4 rollout kernel MUST NOT call `evaluateNonTerminalLeaf` until the simulated action and every derived finish/trick/turn update have been applied atomically to the isolated rollout state. Frozen call order：应用模拟动作 → 更新手牌数 → 更新 `finishOrder` → 处理 trick/turn 变化 → 验证 stable leaf evaluation state → 调用 `evaluateNonTerminalLeaf`。Task 2 leaf 不接收 public ledger、recent events、pending finish seat、Room、replay state 或 raw scenario；本段只是 Task 4 的后续接口前置条件，本轮不实现 kernel。

### 3.3 CRN identity 与 policy

candidate-dependent 的决策关联必须使用以下明确名称；它是 candidate-local result/trace association，不是通用 decision identity：

```ts
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
```

不得保留或实现通用名称 `canonicalDecisionIdentity`；旧名称只可在 migration/prohibition 文本中出现。该 association identity 不得被 `deriveRandomDomain`、`CrnView`、`CrnCoordinate`、random domain、semantic key 或 deterministic keyed value 导入；AST/symbol gate 必须检查此隔离。Task 3 的 CRN 只使用 candidate-free `CrnCoordinate`。

#### Frozen Task 3 interface and allowlist

Task 3 的 exact allowlist 为：

```text
src/ai/rollout/crn.ts
src/ai/rollout/identity.ts
src/ai/rollout/contracts.ts       # only the exact CRN type narrowing below
tests/ai/rollout/particleBankRolloutBoundary.test.ts  # only the existing Compiler API Gate remediation
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
```

`contracts.ts` 的最小修订只把 `CanonicalRandomDomainLabel`、`CanonicalRandomDomain`、`CanonicalSemanticKey` 和 validated `CrnCoordinate`/`CrnView.value` 收窄为 branded CRN types；不得改变 Task 1、Task 2 的字段、factory、validator、failure behavior 或 public result behavior。不得修改 `src/ai/rollout/teamUtility.ts`、`src/ai/rollout/leafEvaluation.ts`、任何 Particle production、Room、planning、package、lock 或 config。

三份文档使用以下完全一致、可编译的 TypeScript declarations：

~~~ts
export type CanonicalRandomDomainLabel = string & {
  readonly __canonicalRandomDomainLabel: unique symbol;
};

/** 64 lowercase hex characters representing the 32-byte phase-1 digest. */
export type CanonicalRandomDomain = string & {
  readonly __canonicalRandomDomainDigest: unique symbol;
};

export type CanonicalSemanticKey = string & {
  readonly __canonicalSemanticKey: unique symbol;
};

declare const validatedCrnCoordinateBrand: unique symbol;

export type CrnCoordinate = Readonly<{
  rootIdentity: RootIdentity;
  scenarioIdentity: CanonicalScenarioIdentity;
  replicateIdentity: CanonicalReplicateIdentity;
  ply: number;
  actingSeat: PublicSeat;
  randomDomain: CanonicalRandomDomainLabel;
}> & {
  readonly [validatedCrnCoordinateBrand]: true;
};

export interface CrnView {
  value(semanticKey: CanonicalSemanticKey): number;
}

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

export function createCanonicalRandomDomainLabel(
  input: unknown,
): CanonicalRandomDomainLabelResult;

export function createCanonicalSemanticKey(
  input: unknown,
): CanonicalSemanticKeyResult;

export function createUnpairedSemanticKey(
  eventKind: unknown,
): CanonicalSemanticKeyResult;

export function createCrnCoordinate(
  input: unknown,
): CrnCoordinateCreationResult;

export function deriveRandomDomain(
  coordinate: CrnCoordinate,
): CanonicalRandomDomain;

export function createCrnView(
  input: unknown,
): CrnViewCreationResult;

export function canonicalCrnDomainBytes(
  coordinate: CrnCoordinate,
): Uint8Array;

export function canonicalCrnValueBytes(
  randomDomain: CanonicalRandomDomain,
  semanticKey: CanonicalSemanticKey,
): Uint8Array;
~~~

#### CrnCoordinate brand and runtime shape compatibility freeze

The `validatedCrnCoordinateBrand` declaration is module-private: it is declared in
`src/ai/rollout/contracts.ts` without `export`, is not re-exported by a barrel, and has no public
brand factory. Callers cannot import the symbol or construct the brand through a normal runtime
property. The brand is a compile-time-only phantom property; it is not a string field and must not
be written as `__validatedCrnCoordinate` or any other runtime key.

The next code round assigns one responsibility to each allowlisted path: `contracts.ts` adds only
the module-private phantom brand; `identity.ts` performs the internal `CrnCoordinate` narrowing
only after validation, copying and freezing; `crn.ts` changes only if type adaptation is required
and never changes the algorithm or known vectors; `particleBankRolloutBoundary.test.ts` corrects
the existing Compiler API Gate; and `crnIdentity.test.ts`/`crnInvariance.test.ts` verify
compile-time brand use, six runtime keys and known-vector invariance. Task 1/2 production behavior
and interfaces remain unchanged.

`createCrnCoordinate` must validate the complete unknown envelope, copy the six validated values,
freeze the resulting plain data object, and only then internally narrow that object to
`CrnCoordinate`. A successful runtime coordinate has exactly these six own string keys, in this
order:

```text
rootIdentity
scenarioIdentity
replicateIdentity
ply
actingSeat
randomDomain
```

`Reflect.ownKeys(coordinate)` must equal those six keys; it must contain no brand symbol or seventh
key. The object has no accessor, custom prototype, enumerable brand, inherited coordinate field or
mutable nested value. The brand is absent from spread, clone, serialization, `canonicalCrnDomainBytes`,
value bytes, both SHA-256 digests, `CrnView` state and diagnostics.

The old Compiler API Gate in
`tests/ai/rollout/particleBankRolloutBoundary.test.ts` currently calls
`checker.getDeclaredTypeOfSymbol(...).getProperties().map(symbol => symbol.name)` and requires
exactly the six string names above. That is the confirmed compatibility conflict: adding a
string-named brand makes the old assertion observe seven properties. The next code remediation
must replace the meaning of that assertion, not weaken it to “at least six”. The corrected Gate
must prove all of the following independently:

1. The declared `CrnCoordinate` has exactly six public/runtime string-named data fields with the
   names and order above.
2. The declared type contains the one computed property keyed by the module-private
   `unique symbol` `validatedCrnCoordinateBrand`, with no other string, number or symbol property.
3. TypeScript Compiler API symbol resolution proves `validatedCrnCoordinateBrand` is not exported;
   a text-only search or a string-named phantom field is not sufficient.
4. A successful `createCrnCoordinate` result has exactly six string keys at runtime, is frozen and
   has no accessor or custom prototype.

The brand is therefore required for factory-validated compile-time use but contributes no runtime
field and no CRN identity material. The candidate-exclusion AST/symbol Gate remains unchanged and
must still reject `candidateId`, `CanonicalCandidateDecisionAssociationIdentity`,
`canonicalCandidateDecisionAssociationIdentity`, candidate array position, worker identity,
completion order, mutable counters, object address and random suffixes.

The next code round has a valid RED/GREEN sequence. RED must fail because the current unbranded
`CrnCoordinate` lacks the brand-presence assertion; adding the brand without correcting the old
six-property Gate must fail that old Gate with the observed seventh-property result. Neither
module resolution, a missing fixture nor zero collected tests is valid RED. GREEN must pass the
corrected brand/runtime Gate and prove that both frozen known vectors retain their existing
canonical bytes, SHA-256 digests, `u53` values and JavaScript number literals.

The only valid creation chain is:

```text
raw domain label
  -> createCanonicalRandomDomainLabel
  -> CanonicalRandomDomainLabel
raw semantic key
  -> createCanonicalSemanticKey / createUnpairedSemanticKey
  -> CanonicalSemanticKey
unknown coordinate envelope
  -> createCrnCoordinate
  -> CrnCoordinate
CrnCoordinate
  -> deriveRandomDomain
  -> CanonicalRandomDomain (64 lowercase hex digest)
  -> createCrnView({ coordinate, randomDomain })
  -> CrnView.value(CanonicalSemanticKey)
```

All factory/validation functions return typed failure and never throw. `CrnView.value()` is synchronous, accepts only an already branded key, returns only a finite number, and never returns a failure union. It does not retain caller objects, call accessors, mutate state, record calls, expose bytes/digests/seed/tape/cursor, or use a shared mutable RNG.

`RootIdentity`, `CanonicalScenarioIdentity` and `CanonicalReplicateIdentity` are the existing 64-lowercase-hex string identities. `createCrnCoordinate` requires each to be exactly 64 lowercase hexadecimal characters and encodes each as 32 raw bytes. `ply` is a canonical nonnegative safe integer; `-0`, negative, fractional, unsafe, `NaN` and infinities fail. `PublicSeat` is the existing canonical game identity `0 | 1 | 2 | 3`, encoded as one byte; it is not an array position and is not normalized relative to another seat. Candidate array position, Map order, worker id, object address, `localeCompare` and temporary indices remain forbidden.

#### Domain and semantic-key grammar

`createCanonicalRandomDomainLabel` accepts only a primitive string with 1..128 ASCII bytes, every byte in `0x21..0x7e`. This excludes whitespace, control characters, NUL, Unicode, Unicode surrogates, normalization-dependent text and leading/trailing spaces. `createCanonicalSemanticKey` accepts only a primitive string with 1..256 ASCII bytes using the same byte rule. There is no implicit Unicode normalization or locale conversion.

The only canonical unpaired event key is `unpaired:<event-kind>`, where `<event-kind>` matches the full ASCII grammar `[a-z0-9]+(?:-[a-z0-9]+)*`, is non-empty, contains no candidate id/index/position, and fits the semantic-key byte limit. `createUnpairedSemanticKey` constructs exactly this form; empty, uppercase, whitespace, underscore, slash, colon, random suffix, counter, object address, candidate id and candidate position fail with `invalid-unpaired-event-key`. A candidate-specific event with a comparable counterpart reuses the paired event's domain/key. A candidate-specific event without a comparable counterpart uses `unpaired:<event-kind>` only when the event kind is derived from stable candidate-free public semantics; otherwise the kernel returns its frozen typed failure and does not draw a private random value.

The factories reject forbidden candidate fields before reading values. A raw label/key that is a canonical candidate identity or contains an explicit candidate-id/index/position token returns `candidate-identity-contamination`; the compiler/symbol gate is the authoritative check for candidate identity flowing through a call graph, so this rule is not inferred from arbitrary candidate-free text. No `candidateId`, `CanonicalCandidateDecisionAssociationIdentity` or `canonicalCandidateDecisionAssociationIdentity` may enter any CRN symbol or bytes.

#### Canonical encoding v1

Task 3 uses two domain-separated SHA-256 phases. The existing `sha256Bytes(input: Uint8Array): string` from `src/game/publicEventHash.ts` is reused: it is synchronous, pure TypeScript, browser-compatible, implements standard FIPS 180-4 SHA-256, accepts bytes and returns exactly 64 lowercase hex characters representing a fixed 32-byte digest. `identity.ts` hex-decodes that public result when raw digest bytes are required. No `node:crypto`, `crypto`, Web Crypto async API, third-party dependency or Particle production export is permitted. The existing private `CanonicalWriter` is not reused because it is not exported and uses string/JSON-era semantics; `identity.ts` owns a private `CanonicalByteWriter` with only the TLV operation below and no object enumeration.

Every TLV field is exactly:

```text
tag:     1 byte unsigned
length:  4 bytes unsigned big-endian
payload: exactly length bytes
```

Tags are unique within each phase. The writer rejects invalid tags, lengths above `0xffffffff`, payload length mismatch, and any non-canonical payload. It never uses bare string concatenation, delimiter-only concatenation, `JSON.stringify`, object/Map enumeration, locale encoding or decimal-string integer encoding.

Phase 1 canonical domain bytes are:

```text
ASCII("D2F-CRN-DOMAIN-V1")
+ 0x00
+ TLV(0x01, rootIdentity as 32 raw bytes)
+ TLV(0x02, scenarioIdentity as 32 raw bytes)
+ TLV(0x03, replicateIdentity as 32 raw bytes)
+ TLV(0x04, ply as 8-byte unsigned big-endian)
+ TLV(0x05, actingSeat as one byte 0x00..0x03)
+ TLV(0x06, random-domain label as validated ASCII bytes)
```

`deriveRandomDomain(coordinate)` returns `sha256Bytes(canonicalCrnDomainBytes(coordinate))` as a 64-lowercase-hex `CanonicalRandomDomain` digest. The exact coordinate order and tags are fixed:

| order | tag | field | payload encoding |
| ---: | ---: | --- | --- |
| 1 | `0x01` | `rootIdentity` | exactly 64 lowercase hex characters parsed to 32 raw bytes |
| 2 | `0x02` | `scenarioIdentity` | exactly 64 lowercase hex characters parsed to 32 raw bytes |
| 3 | `0x03` | `replicateIdentity` | exactly 64 lowercase hex characters parsed to 32 raw bytes |
| 4 | `0x04` | `ply` | canonical nonnegative safe integer as 8-byte unsigned big-endian |
| 5 | `0x05` | `actingSeat` | `PublicSeat` as one byte `0x00..0x03` |
| 6 | `0x06` | `randomDomain` label | validated printable ASCII bytes |

Phase 2 canonical value bytes are:

```text
ASCII("D2F-CRN-VALUE-V1")
+ 0x00
+ TLV(0x01, domain digest as 32 raw bytes)
+ TLV(0x02, semantic key as validated ASCII bytes)
```

`canonicalCrnValueBytes` requires a 64-lowercase-hex `CanonicalRandomDomain` digest and a branded key. A value digest is `sha256Bytes(canonicalCrnValueBytes(randomDomain, semanticKey))`. No root material, candidate data, raw bytes, digest, seed, tape or cursor reaches diagnostics.

The fixed high-53 conversion is:

```text
digest = SHA-256(value canonical bytes)
uint64 = first 8 digest bytes interpreted unsigned big-endian
u53 = uint64 >> 11
value = Number(u53) / 9007199254740992
```

`9007199254740992` is exactly `2^53`. BigInt may be used only for exact bytes-to-uint64 and right shift; `u53` is then safely converted to Number. The implementation does not use low 53 bits, rounding, epsilon, decimal-string conversion or a path that can produce `1`; it guarantees `Number.isFinite(value)` and `0 <= value < 1`.

#### Failure mapping and atomicity

The `CrnFailure` union above is the only CRN validation failure union. Missing/extra keys, symbol keys, accessors/getters, callback/function values, custom/inherited prototypes, sparse arrays, cycles, malformed coordinate envelopes and thrown reflection traps return `malformed-coordinate-envelope` with the exact field where the envelope failed. Invalid 64-hex identities map to their corresponding `invalid-*-identity`; invalid `ply` maps to `invalid-decision-identity`; invalid seat maps to `invalid-acting-seat`; invalid label/key maps to `invalid-random-domain-label`/`invalid-semantic-key`; bad unpaired grammar maps to `invalid-unpaired-event-key`; TLV/payload construction maps to `canonical-encoding-failure`; safe-integer/length/53-bit overflow maps to `arithmetic-range-failure`; candidate data maps to `candidate-identity-contamination`. No failure contains root material, scenario, candidate, raw bytes, digest, seed, tape or cursor.

Any factory failure returns no partial coordinate, domain, key, view or value. Successful coordinate/key/view graphs are frozen or immutable projections and caller mutation cannot affect replay. `CrnView.value` is a pure function of the frozen coordinate and branded semantic key; repeated `A, B, A`, `A -> B` versus `B -> A`, candidate order, scenario scheduling and worker completion order are bit-identical. Different coordinates or keys need not have mathematically distinct hash values; tests assert different canonical bytes and assert concrete digest/value only for fixed vectors.

#### Frozen known vectors

The following vectors were generated by an independent Node `crypto.createHash("sha256")` oracle. The oracle is documentation-only and is not production code. Both vectors use the same candidate-free coordinate:

```text
rootIdentity      = 00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff
scenarioIdentity  = ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100
replicateIdentity = 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ply               = 7
actingSeat        = 2
randomDomain      = policy-action-v1
```

Paired event vector:

```text
semanticKey              = policy-action:play:single:H7-1
domain canonical bytes  = 4432462d43524e2d444f4d41494e2d563100010000002000112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0200000020ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110003000000200123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef040000000800000000000000070500000001020600000010706f6c6963792d616374696f6e2d7631
domain SHA-256          = c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15
value canonical bytes   = 4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15020000001e706f6c6963792d616374696f6e3a706c61793a73696e676c653a48372d31
value SHA-256           = 0351802e83a610421ad1681cb92d729197bc31765b11cf72d85d25d10eabf3b8
first 8 bytes           = 0351802e83a61042
u53                     = 116754488521922
JavaScript number       = 0.012962352138537137
```

合法 unpaired event vector:

```text
semanticKey              = unpaired:public-pass
domain canonical bytes  = 4432462d43524e2d444f4d41494e2d563100010000002000112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0200000020ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110003000000200123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef040000000800000000000000070500000001020600000010706f6c6963792d616374696f6e2d7631
domain SHA-256          = c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15
value canonical bytes   = 4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf150200000014756e7061697265643a7075626c69632d70617373
value SHA-256           = 2a564ad3f684e2f5ca38184d2aa0e71bc2157e2658e3429719d2e190c2747283
first 8 bytes           = 2a564ad3f684e2f5
u53                     = 1489603550695580
JavaScript number       = 0.16537921595456195
```

Boundary-separation vectors use the same prefix and TLV rules. Their value canonical bytes are distinct for `("ab", "c")` versus `("a", "bc")`, and for `randomDomain="x", semanticKey="y:z"` versus `randomDomain="x:y", semanticKey="z"`; the tests assert byte inequality, not hash uniqueness. The independent oracle produced:

```text
("ab", "c")   value bytes = 4432462d43524e2d56414c55452d56310001000000203d1571b8edbf823789c3bb440b98388d2448cb8b15b56025a8ba2d04e4d25e96020000000163
("a", "bc")   value bytes = 4432462d43524e2d56414c55452d56310001000000209c5bc616973ab50bb7ae1ea133dc9333e41d916c2bad2f1ee1fa54d4ff9f389f02000000026263
("x", "y:z")   value bytes = 4432462d43524e2d56414c55452d56310001000000207ccad33be63bbbe2df49bf4529a7ff06a1288a1debaeafca4dee1aa083f364cb0200000003793a7a
("x:y", "z")   value bytes = 4432462d43524e2d56414c55452d5631000100000020f65c7cf19deccc6adbaee964af36d06eb9dcbc08dad9a6621314fb385f4ed5d302000000017a
```

固定的 `d2f-lightweight-v1` policy 只接收当前 acting seat 的 `SeatLocalObservation`、`RolloutPolicyDecisionContext` 和 `CrnView`：自己的 hand、公开 history、public hand counts、公开 last play、公开 finish order 和 game rank。不得读取 Room、原始对手手牌、其他座位的完整 privateState 或 ParticleScenario。

#### Task 3 RED/GREEN test gate

Task 3 RED 只能先创建 `crnIdentity.test.ts` 与 `crnInvariance.test.ts`，并且必须被收集且至少一个行为断言因 CRN production entry 尚不存在而失败；0 tests collected、module-resolution failure 或 fixture failure 不是有效 RED。GREEN 必须使用同一条 focused command：

```text
npx vitest run tests/ai/rollout/crnIdentity.test.ts tests/ai/rollout/crnInvariance.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

两组测试必须覆盖 known bytes/digests/high-53 values、repeated-key stability、A→B→A 与逆序调用不变、等价独立 view、candidate/scenario/worker completion-order 不变、root/scenario/replicate/ply/acting-seat/domain/key identity 变化、paired candidate-independent equal value、合法 unpaired grammar、candidateId structural exclusion、无共享 cursor/tape、tuple boundary、hostile input、no throw/no partial/no secret diagnostics 和 Node 22/browser determinism。不得把不同 hash 必然不同作为数学断言，只断言 canonical bytes 不同并对固定 vectors 断言具体 digest/value；不得使用 `skip`、`only` 或 test-placeholder marker。

### 3.4 Team Utility 与 leaf evaluation

```ts
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

Task 2 的接口采用窄输入对象方案。`TeamUtilityInput` 只传入视角座位和完整终局顺序；`LeafEvaluationInput` 只传入视角座位、当前 acting/turn seat、已完成顺序前缀和公开 hand counts。两个函数都是同步、确定性、无副作用的纯函数；不得接收整个 `RolloutRequest`、kernel context、`Room`、`ParticleBank`、scenario、replay state、callback、factory、policy、RNG 或 mutable context，也不得读取对手具体手牌。禁止位置参数串、动态 evaluator registry 和 caller-provided evaluator。

`PublicSeat` 的唯一来源是 `src/game/publicEvent.ts` 的 `PublicSeat = 0 | 1 | 2 | 3`。`RolloutPublicState.actingSeat` 是 public current acting/turn seat；`src/game/publicLedger.ts` 的 `currentTrick` 记录 `leadSeat`、可选 `lastPlaySeat`/stable key 与 `passSeats`，contracts 的 public-event projection 负责推导 acting seat。`RolloutPublicState.handCounts` 和 Task 1 contracts 使用的 canonical hand-count representation 是 `Readonly<Record<PublicSeat, number>>`，其四个 key 的语义固定为 seat `0`、seat `1`、seat `2`、seat `3`；Task 2 不定义第二种 hand-count representation。`src/game/publicLedger.ts` 的私有 `HandCounts = Record<PublicSeat, number>` 与该结构相同，但不是 Task 2 的 import API。`src/game/settlement.ts` 的 `teamOf` 与 `partnerSeat` 是私有 helper，且使用 `room.ts` 的 `Seat`，因此 Task 2 不 import 它们；`teamUtility.ts` 在本地复用已冻结的 `seat % 2` 与 `(seat + 2) % 4` 语义，不修改 settlement production。

Team Utility 的 `perspectiveSeat` 必须是 canonical `PublicSeat`。`finishOrder` 必须是四座位按第 1 名至第 4 名排列的完整顺序，每个座位恰好出现一次；输入数组不可修改。视角队伍由 `perspectiveSeat` 与 `((perspectiveSeat + 2) % 4) as PublicSeat` 构成，按完成名次取两个 1-based position 后以升序 pair 查表。对手队伍 utility 是本方 utility 的相反数；搭档视角相同；不产生 zero、额外奖励、权重或 rounding。

Stable leaf evaluation state 表示：当前 action 已完整应用；action 产生的 hand-count 变化已应用；如果某座位手牌归零，对应 finish-order 更新已经完成；current acting/turn seat 已推进到合法的未完成座位；play、finish、trick-clear、turn advance 等相关状态更新不存在待处理的中间步骤；leaf evaluation 不允许在上述处理过程的中间调用。游戏/rollout 提前终局是合法 leaf 输入语义；事件处理到一半的 transient state 不是 leaf evaluation 输入。

Non-terminal leaf 的 `finishOrder` 是 stable state 中真实完成顺序的有序前缀，长度严格为 `0 | 1 | 2 | 3`；长度为 4 的完整终局不得进入 `evaluateNonTerminalLeaf`，必须返回 `terminal-state` failure。前缀内座位必须 canonical 且唯一。`actingSeat` 必须是 canonical 且尚未出现在前缀中；由于窄接口不携带 current trick/history，当前 turn 与 public ledger 的一致性是 caller 的 stable-state precondition，不由该纯函数伪造或推断。`perspectiveSeat` 可以已完成或未完成。

`handCounts` 必须是覆盖四个 canonical seat key 的 `Readonly<Record<PublicSeat, number>>`，每个 count 必须 finite、nonnegative、safe integer，并拒绝 `-0`。稳定状态不变量严格为：`seat ∈ finishOrder → handCounts[seat] === 0`；`seat ∉ finishOrder → handCounts[seat] > 0`。因此 unfinished seat 为 0 必须返回 `unfinished-zero-hand-count`，不得通过 ledger、recent event、pending flag 或推测放行。`actingSeat` 必须不在 `finishOrder` 且 `handCounts[actingSeat] > 0`。

固定 leaf 算法如下：复制真实 finish-order 前缀；收集全部未完成座位；按 `handCounts[seat]` 升序排列；相同 count 按 `clockwiseDistance = (seat - actingSeat + 4) % 4` 升序排列；将结果追加到前缀得到完整 `predictedFinishOrder`；调用同一个 `evaluateTeamUtility` truth table；返回不可变的 `predictedFinishOrder` 和 utility。该 tie-break 使用相对 acting seat 的环距离，不以绝对 seat number 作为独立 tie-break。不得使用 Card identity、current trick strength、hidden assignment、Particle weight、policy/baseline score、随机数、wall clock、rounding、搭档奖励或 Task 3 CRN。

Failure mapping 固定如下：

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

所有失败均为 typed discriminated union；不得新增模糊字符串、optional failure field 或 throw-based API。`unsupported-team-pair` 在四座位 parity 规则下应不可达，但保留为现有 union 分支。

Task 2 的唯一 code/test allowlist 为：

```text
src/ai/rollout/contracts.ts                  # 只新增两个输入 type，并更新本节 failure unions；不改变 Task 1 字段或 factory 行为
src/ai/rollout/teamUtility.ts
src/ai/rollout/leafEvaluation.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/rollout/leafEvaluation.test.ts
```

依赖方向固定为 `contracts.ts` ← `teamUtility.ts` ← `leafEvaluation.ts`：`leafEvaluation.ts` 必须调用 `evaluateTeamUtility`，不得复制 truth table；不得反向循环依赖、public barrel、Room、ParticleBank、scenario 或 replay import。

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

非 terminal leaf 先保留已完成玩家真实 finish order，再对未完成玩家按剩余手牌数升序排列；相同手牌数按相对当前 acting/turn seat 的顺时针距离升序。不得用绝对 seat number。对于经过验证的 canonical `PublicSeat` 和 `actingSeat`，`clockwiseDistance = (seat - actingSeat + 4) % 4` 始终可以确定性计算；旋转一致性由成功路径测试验证，不产生额外 production failure。

Task 2 RED/GREEN 测试矩阵冻结如下：Team Utility focused command 为 `npx vitest run tests/ai/rollout/teamUtility.test.ts --exclude "**/.worktrees/**" --reporter=verbose`，RED 只能因目标模块或 `evaluateTeamUtility` 行为尚不存在而失败；leaf focused command 为 `npx vitest run tests/ai/rollout/leafEvaluation.test.ts --exclude "**/.worktrees/**" --reporter=verbose`，RED 只能因目标模块或 `evaluateNonTerminalLeaf` 行为尚不存在而失败。GREEN 必须复用相同命令。两组测试均调用真实 production API，不使用 mock、skip、only 或 test-placeholder marker。

Leaf 合法状态必须覆盖：`finishOrder=[]` 且四个 hand count 均大于 0；长度为 1、2、3 且前缀内 seat count 为 0；所有未完成 seat count 均大于 0；`actingSeat` 未完成且 count 大于 0；已完成和未完成两种 `perspectiveSeat`；相同 hand count 按相对 `actingSeat` 距离排序；seat rotation 保持 utility 和相对排序。Leaf 非法状态必须覆盖：已完成 seat count 大于 0、未完成 seat count 等于 0、`actingSeat` 已完成、`actingSeat` count 为 0、长度为 4、duplicate/unknown seat、unknown hand-count key、missing hand-count key，以及 negative/fractional/NaN/Infinity/unsafe integer/`-0`；每项断言本节冻结的精确 failure reason。不得将事件处理中间状态判为 success；旋转只作为成功路径的 metamorphic/property test。

### 3.5 Typed success/failure unions

以下 union 名称和 discriminator 固定：

```ts
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

type RolloutContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: RolloutFailure };

type RolloutReplicateResult =
  | { ok: true; candidateId: string; scenarioIdentity: string; replicateIdentity: string; utility: TeamUtility; workUnits: number }
  | { ok: false; failure: RolloutKernelFailure };

type RolloutAggregationResult =
  | { ok: true; summary: CandidateRolloutSummary }
  | { ok: false; failure: RolloutAggregationFailure };
```

所有失败均为真正的 discriminated union，不使用所有 `kind` 共享的模糊 `count?: number`。utility、leaf、policy、kernel、aggregation 在进入下一个阶段前必须检查 `ok`；任何失败都不返回部分排序。

### 3.5.1 Historical D2F Task 4 State-Machine Remediation Design Freeze (superseded by the final integration freeze report)

本节替换旧的 Private Boundary Reconciliation 条款，是本轮唯一有效的 Task 4 state-machine remediation 规范。当前 HEAD 的真实代码复核结论如下：F1、F2、F3、F4、F5、F6、F7 均确认；没有 reviewer finding 被无证据驳回。

#### F1 — canonical multi-card identity

`src/game/publicEventHash.ts` 的 `finalizePublicActionEvent` 经 `normalizeDraft` 对 play/tribute/return 的 `publicCardIds` 执行默认字符串 `sort()`，因此 finalized public event 的牌序是 canonical code-unit order。`src/ai/rollout/stateConservation.ts` 当前 `validatePlayTransition` 却用原始 action 顺序检查 `publicPlayedCardIds` prefix；`kernel.ts` 先写入 finalized event 的 canonical 顺序，所以输入顺序不同的合法动作会被拒绝。`createDeck()` 的两副牌、四种花色、13 个等级和两种 joker 共 108 张；id 由真实 `kind/rank/suit/copy` 唯一确定，不存在合法的相同 card ID。

冻结规则：

- action 与 finalized public event 的牌身份比较使用 exact card-ID set/multiset equality，不使用输入数组位置；实现不使用 `localeCompare`。
- 因真实 card ID 必须唯一，action 内重复 ID 独立拒绝；missing、extra、foreign ID 各自拒绝，不能只比较长度。等价实现必须同时检查计数 map 与 canonical deck membership。
- event 继续保留现有 canonical public order；从 hand 删除按 card ID 过滤，不依赖输入顺序或 prefix。
- RED 必须直接从 `runRolloutReplicate` 的 root-action path 证明：合法 pair 的 action 顺序与 finalized event 顺序不同仍成功；另一种 compound play（固定使用 full-house）同样成功；同集合不同顺序成功；duplicate、missing、extra、foreign 各返回 typed failure。

#### F2 — kernel unknown-input boundary

真实入口是 `runRolloutReplicate(input, rootIdentity)`，当前实现先读取 `input.validatedBudget`，再读取 `scenario.privateState` 并 `structuredClone`，均早于 envelope/schema validation；这是 confirmed getter boundary defect。现有 `contracts.ts` 的 `validateRolloutBudget` 是可复用的正式 budget validator；其 descriptor-first/plain-data/cycle 数值语义是 Task 4 的唯一参考，Task 4 不新增另一套规则，也不修改 contracts union/interface。

冻结入口流水线，且每一层失败都返回 typed `RolloutReplicateResult` failure：

~~~text
unknown input
  -> strict envelope/prototype/own-key/data-descriptor validation
  -> nested plain-data validation
  -> semantic validation
  -> fresh isolated projection
  -> rollout execution
~~~

envelope 的 exact own keys 是 `candidate`、`scenario`、`publicState`、`replicateIdentity`、`random`、`validatedBudget`。在读取这些字段前，必须完成 `Object.getPrototypeOf`、`Reflect.ownKeys`、exact own keys、own data descriptor、no accessor、no symbol、no function 检查；对象必须是 `Object.prototype`/`null` plain record，数组必须是 `Array.prototype` 的 contiguous canonical array，无 sparse hole、expando、custom iterator/map。所有座位、计数、ply、budget 和 index 均为 finite safe integer，拒绝 `-0`；图必须拒绝 cycle。`structuredClone` 只允许作用于完成上述验证的安全图或可信内部图。Proxy trap 抛错、getter、callback、`CrnView` 以外的可执行值均捕获为 typed failure；成功或失败都不得抛出、返回 partial result 或在 diagnostics 回显 hostile input/private state。getter/callback 调用计数必须为零。

#### F3 — complete seat-local observation

policy 的 observation exact keys 固定为 `hand`、`publicHistoryEvents`、`handCounts`、`currentLastPlay`、`finishOrder`、`gameRank`。它只能收到 acting seat 的完整 hand 和公开数据，永远不能收到 kernel private state、scenario、其他座位 hand、weights 或 seed。

- `hand` 中每张 card 先以真实 exact schema 验证：suited 只允许 `id/kind/rank/suit/copy`，joker 只允许 `id/kind/rank/copy`；rank/suit/copy 和 id 的 canonical 关系必须与 `src/engine/cards.ts` 一致，拒绝未知/foreign/duplicate ID。
- `handCounts` 只允许 canonical keys `0`,`1`,`2`,`3`；每个 count finite、nonnegative、safe integer 且拒绝 `-0`。
- `finishOrder` 只含 `0|1|2|3`，不重复；`gameRank` 必须是 `RANKS` 的合法值。
- `currentLastPlay` 为 null 或完整 canonical `CardGroup`；其 exact group keys、type/purpose、cards、wildcards、strength、card schema、无重复 ID、wildcard 投影和牌型语义都必须验证。
- `publicHistoryEvents` 是 contiguous canonical array；每个 event 先做 exact nested descriptor/prototype/own-key validation，再复用 `assertFinalizedPublicActionEvent` 与 `verifyPublicActionEventHash` 的正式公共事件语义。play event 的 card IDs 必须 canonical、唯一并与 event kind/count/trick 字段相符；transfer/finish/pass/trick-clear 的字段也必须完整合法。
- 所有 nested object/array 都先 descriptor-first 验证再逐字段复制；不得把 caller observation 保留为 policy state。getter、accessor、symbol、custom prototype、function、sparse/expando array 一律 typed fail；failure 不产生 action。`CrnView.value()` 抛错映射为现有 `{ kind: "invalid-policy-context", field: "ply" }`，不得逃逸。

#### F4 — authoritative early terminal and finish projection

`src/game/room.ts` 的真实 `advanceAfterAction` 在每次 play/pass 的正式 transition 后检查：`finishOrder.length >= 3` 或 `partnersFinishedFirstAndSecond(room)`；后者要求前两名 finishers 是 partner。命中后 `finishRound` 补齐四座位并调用 `settleRound`；`settleRound` 只接受四座位顺序，并按第一名的 partner place 决定 double-down/single-down/single-win。Task 4 不修改 Room/settlement。

冻结 kernel 规则：root action 和每个 policy action 完成同一 transactional transition 后都立即检查 terminal；root action 触发 early terminal 时，即使剩余 budget 为最小合法值，也不得调用 policy、走 budget-exhausted 或调用 leaf。每个后续 action 后同样检查；已完成 seat 永远跳过，普通两名非搭档完成时继续模拟。

terminal 顺序固定为：`nextState` 完成 hand/count/finish/trick/turn 更新 → transition validation → conservation validation → terminal predicate/projection validation → terminal utility evaluation；terminal 分支不调用 `evaluateNonTerminalLeaf`。非 terminal 分支先完成 stable-state validation，再以同一个 nextState 调用 leaf；leaf 不得伪造 terminal finish order。

完整四座位 projection 固定为：保留真实 `finishOrder` prefix；长度为 3 时追加唯一未完成 seat；前两名为搭档且尚未有第三名时，从最后一个真实 finisher 按 Room 的 `nextPlayableSeat` 方向（seat - 1 modulo 4）跳过已完成座位，依次追加两个剩余 seat；已有完整四名则原样保留。该规则不按绝对 seat number 排序，且旋转不变。例如 `[0,2] -> [0,2,1,3]`、`[1,3] -> [1,3,2,0]`；三人 `[0,1,2] -> [0,1,2,3]`。`[0,2,1,3]` 下 perspective 0 的 utility 为 `+3`、perspective 1 为 `-3`，因为 winner partner place 是 2；projection 的后两名只用于补齐完整输入，不得改变该 utility。

#### F5 — independent canonical card universe

expected universe 不是从待验证 state 反推，而是：

~~~text
U = Set(createDeck().map(card => card.id))
|U| = 108
physicalLocations = Set(all four hand card IDs ∪ publicPlayedCardIds)
require physicalLocations === U
~~~

四个 hand 与 `publicPlayedCardIds` 必须互斥、各自无重复、所有 ID 属于 U，且并集 exact 等于 U；`expectedCardIds` 直接来自 trusted `createDeck()` 的 canonical identity。`publicHistoryEvents[*].publicCardIds`、`currentLastPlay.cards` 和 current trick 的 last-play/stable-key 是已经 played card 的公开重复视图，不加入 physicalLocations；它们必须与对应 ledger/event 的 card-ID set exact 相等。tribute/return 的 `publicCardIds` 是 hand-to-hand transfer 视图，也不加入第二个位置；transfer 只能改变 hand ownership，不能创造或销毁 ID。source replay state 先使用现有 `validateCanonicalInitialDeal/createDeck` 防线，再由 kernel public boundary 复核同一 U。正常 multi-particle replay scenario 必须成功；forged、incomplete、extra、duplicate、hand/public overlap 必须失败。

#### F6 — atomic transaction

每个 root action、policy action 和 pass 都使用同一个事务路径：

~~~text
accepted immutable current state
  -> construct independent nextState
  -> apply action to nextState
  -> update hand/count/finish/trick/turn/public state in nextState
  -> validate transition(nextState)
  -> validate conservation(nextState)
  -> terminal projection or stable-state validation
  -> evaluate terminal utility or non-terminal leaf on nextState
  -> commit nextState as current state
~~~

验证完成前不得写入 accepted current state，不得先写后回滚。任一步失败都丢弃完整 nextState；失败结果不含 state、action、nextState 或 private diagnostics。caller input、scenario、candidate、observation 和 CRN input 始终不变。`validateActionTransition` 的 play/pass 后置失败、conservation 失败、terminal projection 失败和非法 policy action 都必须证明 no partial result；内部 accepted current state 在失败前必须保持 byte/semantic identity。

#### F7 — observation and CRN order

每个 decision 固定为：

~~~text
current stable state
  -> construct and validate seat-local observation
  -> construct current decision CRN coordinate/view
  -> call fixed policy
  -> validate policy action
  -> transactional transition
~~~

observation 不包含 CRN private material；CRN 继续使用当前 `ply` 与 `actingSeat`，`policyId` 和 `candidateId` 不进入 coordinate/domain/semantic key。该顺序只改变 Task 4 入口时序，不改变 Task 3 known vectors。

#### Failure mapping

现有 `RolloutKernelFailure`/`RolloutPolicyFailure` union 足够表达本轮边界；本轮不修改 `contracts.ts` 的 union 或 interface，也不新增 optional string。映射固定为：

| failure class | exact result |
| --- | --- |
| malformed kernel envelope | `{ kind: "simulation-failed", stage: "replay" }` |
| invalid scenario/private state | `{ kind: "simulation-failed", stage: "replay" }` |
| invalid seat-local observation | kernel maps to `{ kind: "simulation-failed", stage: "replay" }`; direct policy maps to `{ kind: "invalid-policy-context", field: "actingSeat" }` |
| invalid card universe | `{ kind: "simulation-failed", stage: "state-conservation" }` |
| invalid candidate action | `{ kind: "simulation-failed", stage: "replay" }` |
| policy failure | `{ kind: "policy-failed", failure: RolloutPolicyFailure }` |
| CRN coordinate/view failure or throwing value | `{ kind: "simulation-failed", stage: "replay" }`, with direct `CrnView.value()` throw normalized to policy `invalid-policy-context/ply` |
| transition failure | `{ kind: "simulation-failed", stage: "state-conservation" }` |
| conservation failure | `{ kind: "simulation-failed", stage: "state-conservation" }` |
| terminal projection failure | `{ kind: "simulation-failed", stage: "leaf-evaluation" }` |
| budget exhaustion | `{ kind: "budget-exhausted", workUnits, maximumWorkUnits }` |

All branches are no-throw, no-partial-result, and diagnostics-free of hostile/private data. Existing `validateRolloutBudget`, canonical action identity, public event validators and source replay validators remain the reusable authorities; no incompatible contracts field is introduced.

#### Next-round exact code allowlist

The six paths below are the complete allowlist and must be identical in all three D2F documents:

~~~text
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
src/ai/rollout/stateConservation.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

`src/ai/rollout/contracts.ts` is not allowed because the existing failure union/interface is sufficient and `validateRolloutBudget` is already reusable. `tests/ai/rollout/particleBankRolloutBoundary.test.ts` is not allowed because Task 4 adds no bridge/source production change; kernel tests invoke the real source replay path. Forbidden paths remain `src/game/**`, `src/engine/**`, `src/ai/particles/**`, `src/ai/planning/**`, `src/ai/aiDecisionEngine.ts`, package/lock/config files and Task 5–9 files.

#### Frozen TDD RED matrix

Every row uses an existing production entry and must fail for the missing behavior, not because a module or fixture is absent. This round records the matrix only; no Vitest/tsc/build/benchmark runs are authorized.

| slice | real entry and RED cases | required GREEN evidence |
| --- | --- | --- |
| Multi-card identity | `runRolloutReplicate` root action: pair with noncanonical input order, full-house with noncanonical order, same-set permutation, duplicate/missing/extra/foreign ID | legal pair and compound action succeed; exact identity rejects all five invalid classes; event remains canonical |
| Kernel hostile boundary | `runRolloutReplicate(unknown)` with top-level/nested/budget getter, symbol, accessor, custom prototype, inherited iterator/map, sparse/expando array, cycle | zero getter/callback calls, typed failure, no throw, no partial result, no hostile/private diagnostics |
| Policy observation | `createInternalRolloutPolicy(...).listLegalActions/chooseAction` with NaN/Infinity/fraction/negative/unsafe/-0 counts, missing/extra count keys, duplicate/unknown finish seat, malformed card, nested getter, hostile event, throwing `CrnView.value` | exact nested schema, caller unchanged, no partial action, typed policy failure, no private/other-seat hand exposure |
| Early terminal | `runRolloutReplicate` root and fixed-policy paths for partner first two, three completed seats, ordinary nonterminal; terminal utility and rotation/team perspectives | minimum budget still terminates; no later policy or leaf; completed seats skipped; full finish order and `+3/-3` projection are stable |
| Card universe | `runRolloutReplicate` with canonical full deck, missing/extra/duplicate/overlap/forged state; real `createParticleScenarioSource` replay output including transfer/history/current-trick duplicate views | exact U succeeds; malformed scenarios fail; history/current-trick views are not double-counted; transfer preserves U; normal multi-particle replay succeeds |
| Transaction | root/policy play and pass through `runRolloutReplicate`, plus `validateActionTransition`: post-validation play/pass failure, conservation failure, terminal projection failure, illegal policy action | accepted state unchanged before failure, caller input unchanged, no partial result, no private diagnostics; all actions use one atomic path |

#### Deferred gates and current status

本轮只冻结设计，不运行代码验证，不修改 production/tests，不开始 Task 5。保持：

~~~text
TASK 4 STATE-MACHINE REMEDIATION DESIGN FROZEN
TASK 4 CODE REMEDIATION PENDING
TASK 5 NOT STARTED
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
Task 9 full permitted regression
~~~

本冻结不等于 D2F Shadow release ready。

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
  policyId: RolloutPolicyId;
  rootDigest: string;
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;
```

result assembly 不能由 caller 提供 root 或 provenance。固定边界为：

```ts
type RolloutResultAssemblyInput = Readonly<{
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;

declare function createRolloutResult(
  requestInput: unknown,
  assemblyInput: unknown,
): RolloutContractResult<RolloutResult>;
```

`createRolloutResult` 必须重新调用或等强度执行 `createRolloutRequest(requestInput)`，只有 request 重新验证成功后才能组装 result。输出的 `mode`、`formalExecutionAllowed`、`policyId` 和 `rootDigest` 全部从 validated request 派生；`rootDigest` 只能由重新验证后的 `validatedRequest.rootIdentity` 在内部计算。`assemblyInput` 不接受 `rootDigest`、`rootIdentity`、`policyId`、`mode`、`formalExecutionAllowed` 或 `replayContextIdentity`；caller 提供任意 64 位 hex 不能进入 success。`rootDigestFromReplayContextIdentity(string)` 不得继续作为可接受任意 hex 的 public production 入口，必须 module-private 或移除 public export，且只能由已验证 request 的 result factory 调用。不得以 module-private WeakSet/object identity 充当真实性依据，也不得引入 global mutable registry；`RolloutResult.schemaVersion` 仍为 `d2f-rollout-result-v2`。

`rootDigest` 必须由同一个 pre-action replay root 的 canonical identity 派生；它不能从已提交
或已改变的 Room、candidate 完成顺序、worker 顺序、对象地址或 raw seed 派生。success 时
`candidateSummaries` 按 canonical candidate identity 稳定排列，`ranking` 只包含同一组唯一
candidateId；所有 diagnostics 数值先通过上述 numeric domain 校验。`RolloutResult`、
`RolloutScenarioSourceResult` 和所有 kernel records 都是 detached/internal contracts，不进入
正式 evaluator、candidate filter、plan selector 或 Room transition；`policyId` 只是 configuration
provenance，不改变 `rootDigest` 或 CRN coordinates。

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

成功 diagnostics 只记录脱敏的 `policyId`、`effectiveSampleSize`、`acceptedScenarioCount`、`replicateCountPerScenario`、`expectedCompletedReplicateCount`、`completedReplicateCount`、`workUnitCount` 和 `coverage`。禁止 raw scenario、assignments、对手完整手牌、particle 私有 weight 明细和可还原 random seed。

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
```

Evidence 中所有非 null numeric field 必须 finite；count/budget/ESS 字段必须是合法 safe integer
或按契约允许的 finite measure，delta 可以为负但不能为 NaN/Infinity。`elapsedWallClockMs` 仅
telemetry，必须非负且不能进入 identity、policy、stop condition、ranking 或 byte-lock comparison。
shadow evidence 不向任何正式决策模块返回数据。

## 6. Budget calibration 与正式验证边界

Task 1–6 只使用测试显式小预算，不设置 production/shadow 默认 profile。Task 7 的唯一
允许目标是建立固定 benchmark runner、公开 fixture、contract test 和 functional Gate；它
不开始 production code，不创建 Shadow observer，不修改正式决策路径，也不形成产品性能 SLA。
Task 8 未开始，Task 9 仍是 full permitted regression。

Task 7 的固定 runner、fixture schema、correctness oracle、timing boundary、3/10 iteration
规则、metrics、hang ceiling、JSON report、exit codes 和 Node evidence 规则，以文末 active
`D2F_TASK7_BENCHMARK_INTERFACE_THRESHOLD_FREEZE_REPORT` 为唯一 source of truth。benchmark
fixture 由 JSON 的公开 replay/config 在进程内通过真实 `buildParticleBank` 创建并注册 handle；
JSON 不承载 WeakMap handle、private records、raw hands、assignments、weights、seed 或 wall-clock
expected value。Node 22.22.2 CI 才能提供正式 release evidence；Node 24 本地结果只能是
`SUPPLEMENTAL_LOCAL_EVIDENCE`，未取得 Node 22 证据时保留 `AWAITING_NODE22_CI`。

## Historical D2F Task 4 cross-document canonical literals (superseded by the final integration freeze report)

The following lines are the shared literal contract for all three D2F documents; every occurrence must remain word-for-word identical.

Finding verdict: F1 confirmed canonical multi-card identity defect; F2 confirmed pre-validation kernel getter boundary; F3 confirmed top-level-only policy observation validation; F4 confirmed Room early-terminal mismatch; F5 confirmed self-derived card universe; F6 confirmed non-transactional transition; F7 confirmed observation/CRN ordering defect.

Canonical terminal rule: after every root or policy action, finish/count/trick/turn updates are complete, transition and conservation validation pass, then the kernel checks terminal. Terminal is true when finishOrder.length >= 3 or the first two finishers are partners; two non-partner finishers are non-terminal. A root early terminal returns before any later policy, budget-exhausted path, or leaf call; completed seats are skipped.

Canonical terminal projection: preserve the real finishOrder prefix; if three seats are finished append the sole remaining seat; if the first two finishers are partners and no third finisher exists, append remaining seats by repeated Room nextPlayableSeat (seat - 1 modulo 4) from the last real finisher while skipping finished seats; if four seats are present preserve the order. Examples: [0,2] -> [0,2,1,3], [1,3] -> [1,3,2,0], [0,1,2] -> [0,1,2,3]. For [0,2,1,3], perspective 0 utility is +3 and perspective 1 utility is -3. No absolute-seat sort and no leaf heuristic may create terminal ranks.

Canonical card universe: U = Set(createDeck().map(card => card.id)); |U| = 108; physicalLocations = Set(all four hand card IDs union publicPlayedCardIds); require physicalLocations === U. History event IDs, currentLastPlay cards, and current-trick stable keys are duplicate public views and are checked without adding another physical location; tribute/return IDs are transfer views and cannot create or destroy a card.

Canonical transaction: accepted immutable current state -> independent nextState -> apply action and all hand/count/finish/trick/turn/public updates to nextState -> validate transition -> validate conservation -> validate terminal projection or stable state -> evaluate terminal utility or non-terminal leaf on nextState -> commit nextState. No accepted current state mutation before validation, no rollback, no partial result, and caller input remains unchanged.

Canonical decision order: current stable state -> validated seat-local observation -> current ply/acting-seat CRN coordinate/view -> fixed policy -> policy-action validation -> transactional transition. Observation contains no CRN private material; policyId and candidateId never enter CRN; Task 3 known vectors remain unchanged.

Canonical failure mapping: malformed envelope, invalid scenario/private state, invalid candidate, and CRN failure -> simulation-failed/replay; invalid observation at kernel boundary -> simulation-failed/replay; direct policy observation failure -> invalid-policy-context(field=actingSeat); card universe, transition, and conservation failure -> simulation-failed/state-conservation; policy failure -> policy-failed; terminal projection failure -> simulation-failed/leaf-evaluation; budget exhaustion -> budget-exhausted(workUnits, maximumWorkUnits). CrnView.value() throw -> invalid-policy-context(field=ply). Every failure is typed, no-throw, no-partial, and contains no hostile input or private state.

Canonical next-round allowlist:

~~~text
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
src/ai/rollout/stateConservation.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

Canonical RED IDs: MC-PAIR, MC-COMPOUND, MC-DUPLICATE, MC-MISSING, MC-EXTRA, MC-FOREIGN, K-GETTER, K-NESTED-GETTER, K-BUDGET-GETTER, K-SYMBOL, K-ACCESSOR, K-PROTOTYPE, K-ITERATOR, K-SPARSE, K-CYCLE, P-COUNT-NUMBERS, P-COUNT-KEYS, P-FINISH, P-CARD, P-NESTED-GETTER, P-EVENT, P-CRN-THROW, T-ROOT-EARLY, T-POLICY-EARLY, T-THREE-FINISH, T-NONTERMINAL, T-NO-POLICY, T-NO-LEAF, T-PROJECTION, T-UTILITY, T-ROTATION, U-CANONICAL, U-MISSING, U-EXTRA, U-DUPLICATE, U-OVERLAP, U-HISTORY-VIEW, U-TRANSFER, U-FORGED, U-SOURCE, X-PLAY-POST, X-PASS-POST, X-CONSERVATION, X-TERMINAL-PROJECTION, X-ILLEGAL-ACTION, X-STATE-UNCHANGED, X-CALLER-UNCHANGED, X-NO-PARTIAL, X-NO-DIAGNOSTIC.

# D2F_TASK4_INTEGRATION_TRANSITION_REMEDIATION_FREEZE_REPORT

This is the active Task 4 integration/transition freeze. It supersedes the historical Task 4 sections above and is the only source of truth for the next implementation turn.

### Verdict and scene

`start HEAD`: `472b5d47b5ae0e5676d4bae34e14aa766ae16f98`.

`end HEAD` for this docs-only verification window: `472b5d47b5ae0e5676d4bae34e14aa766ae16f98`.

The scene lock matched the requested worktree, branch `codex/d2f-crn-rollout-source`, commit message `fix(ai): make D2F rollout transitions atomic`, clean status, and clean `git diff --check` before editing. This turn changed no production or tests. The only authorized commit message is `docs(ai): freeze Task 4 integration transition remediation`; its resulting commit HEAD is recorded in the final handoff because a commit cannot contain its own object ID.

Final conclusion:

```text
TASK 4 INTEGRATION/TRANSITION REMEDIATION DESIGN FROZEN
TASK 4 CODE REMEDIATION PENDING
TASK 5 NOT STARTED
```

### I1 — Policy failure classification: confirmed and corrected

The finding is confirmed against `src/ai/rollout/policy.ts`. `listLegalActions` currently turns an invalid observation into `[]`; `chooseAction` then maps that to `no-legal-action`. A throwing, non-finite, or out-of-range `CrnView.value()` currently maps to `invalid-policy-context` with `field: "ply"`. That is not sufficient to distinguish malformed observation, an actually verified empty legal-action set, and CRN failure.

The next turn must change `src/ai/rollout/contracts.ts` to this closed union; no arbitrary field or reason string is permitted:

```ts
type RolloutPolicyFailure =
  | { kind: "invalid-policy-context"; field: "observation"; reason: "malformed-observation" }
  | { kind: "invalid-policy-context"; field: "ply"; reason: "invalid-ply" }
  | { kind: "invalid-policy-context"; field: "actingSeat"; reason: "invalid-acting-seat" }
  | { kind: "no-legal-action"; actingSeat: PublicSeat }
  | {
      kind: "crn-failure";
      field: "coordinate" | "randomDomain" | "view" | "value";
      reason: "construction-failed" | "throwing-value" | "non-finite-value" | "out-of-range-value";
    };
```

`no-legal-action` remains in the failure union as an internal defensive invariant only; it is not a reachable public behavior for a valid stable observation. A valid stable observation with `currentLastPlay === null` has a non-empty acting-seat hand and therefore at least one legal lead play. With `currentLastPlay !== null`, pass remains legal even when no play beats the current group. Do not fabricate an illegal zero-action fixture or expose a test-only hook. Malformed or hostile observation returns `invalid-policy-context` with `field: "observation"` and no action. An acting-seat context error uses the exact `actingSeat` field. A CRN throw is `crn-failure`, never `no-legal-action`; the direct policy path does not throw and does not return a partial action. Policy diagnostics contain only the closed enums and public seat, never observation, hand, scenario, weight, or seed data.

The existing `RolloutFailure.invalid-request.field: string` is also narrowed in the same contract edit: `type RolloutRequestField = "request" | "schemaVersion" | "mode" | "formalExecutionAllowed" | "rootIdentity" | "scenarioSourceInput" | "candidates" | "budget" | "limits" | "evidenceRequirements" | "riskPolicy" | "policyId" | "assemblyInput" | "requestInput" | "candidateSummaries" | "ranking" | "aggregateDiagnostics";` and `invalid-request.field` uses that union. Hostile property names are mapped to `"request"`, never echoed. `RolloutKernelFailure` below is the kernel-level closed union.

### I2 — Public history: authoritative owner and complete data flow

The verified history currently exists in `RolloutScenarioSourceInput.publicHistoryEvents`. `createRolloutRequest` calls `cloneScenarioSourceInput`, which validates finalized event schema and hashes, then derives `rootIdentity` through `canonicalReplayContextIdentity`; the source calls the same replay-context validation before `replayParticleScenario`. `ReplayedParticleState` and the emitted `RolloutScenario.privateState` intentionally contain the final ledger/state but no public-history array. This is the correct private-state boundary and no history field is added to `ReplayedParticleState`.

The defect is in the hand-off: `RolloutReplicateInput` currently has no replay-history or ledger context, and `kernel.ts:createIsolatedState` initializes `publicEvents: []`. Therefore the root action runs without the validated pre-root history. The kernel must not read history from `Room`, `ReplayedParticleState` beyond its validated public ledger projection, or a private scenario record.

The minimal next-turn contract addition is one immutable public replay-context field, not three independent arrays:

```ts
type ValidatedPublicReplayContext = Readonly<{
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
}>;

type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  publicState: RolloutPublicState;
  publicReplayContext: ValidatedPublicReplayContext;
  replicateIdentity: string;
  random: CrnView;
  validatedBudget: ValidatedRolloutBudget;
}>;
```

`createParticleScenarioSource` remains the source owner. After its existing request/replay validation succeeds, a private branded context is created and consumed by the exact internal factory `createRolloutReplicateInputFromValidatedSource(context, scenarioIndex, candidate, replicateIdentity, random, validatedBudget): RolloutContractResult<RolloutReplicateInput>` in `src/ai/rollout/particleScenarioSource.ts`. The factory accepts no caller-supplied history argument. It copies and recursively freezes the validated `publicHistoryEvents`, `initialLedger`, and `finalLedger`; it derives provenance from the already validated replay context and requires the selected scenario identity to be one of the source result identities. The public source result shape is not widened with raw records, hands, or weights.

Validation has two layers: `createRolloutRequest`/`canonicalReplayContextIdentity` and the source replay are the authoritative producers; `kernel.ts:isolateRolloutInput` revalidates the frozen context, its ledger identities/indexes/hashes, its canonical event hashes, and equality with the scenario final public ledger before cloning it into the working state. A caller cannot inject an unverified history by constructing a structural object. The logical owner remains the validated replay context; the kernel holds one append-only working cursor initialized from it, not a second authoritative copy.

The complete flow is:

```text
RolloutRequest.scenarioSourceInput.publicHistoryEvents
  -> cloneScenarioSourceInput + canonicalReplayContextIdentity
  -> createParticleScenarioSource / replayParticleScenario
  -> branded ValidatedPublicReplayContext
  -> createRolloutReplicateInputFromValidatedSource
  -> kernel state: pre-root public history + final ledger cursor
  -> seat-local observation.publicHistoryEvents
  -> fixed policy
```

The observation is exactly the validated pre-root history followed by rollout-generated finalized public events. The pre-root prefix is present before root action; each rollout event is appended after its transaction is accepted. Event indexes are contiguous. `PublicActionEvent` has no separate `previousHash` member: the previous hash is the preceding `HardPublicLedger.seenEventHashes[index - 1]`, and the new event hash is `publicPayloadHash`; both are checked by `applyPublicEvent` plus `verifyPublicActionEventHash`. Pre-root history does not consume `ply`, `workUnits`, or budget. Only accepted rollout decisions consume the existing root work unit or policy-action work units. History includes public event identity and card projections only; it never includes private assignment, raw hands, weights, or seed.

Adding `publicReplayContext` does not change `rootIdentity`, `scenarioIdentity`, `replicateIdentity`, CRN coordinates, random domain, or Task 3 known vectors. Those identities already include the validated replay context where required; the new field is a validated transport of the same provenance, not a new identity input.

### I3 — Observation-before-CRN interface

`src/ai/rollout/policy.ts` adds this pure/no-throw boundary:

```ts
type SeatLocalObservationValidationResult =
  | Readonly<{ ok: true; observation: SeatLocalObservation }>
  | Readonly<{
      ok: false;
      failure: {
        kind: "invalid-policy-context";
        field: "observation";
        reason: "malformed-observation";
      };
    }>;

export function validateSeatLocalObservation(
  input: unknown,
): SeatLocalObservationValidationResult;
```

It performs descriptor/prototype/own-key, nested graph, exact card, public event/hash, count, finish-order, and canonical CardGroup validation, then creates a detached frozen observation. It does not read or call CRN and does not invoke policy. `currentLastPlay` is replaced by the canonical result of the real classifier before any legality decision.

Every decision follows this exact order:

```text
current stable state
-> create seat-local observation data
-> validate/copy/freeze observation
-> failure: return without CRN
-> create current ply/acting-seat coordinate
-> derive random domain/view
-> fixed policy on the validated observation
-> validate action
-> independent next-state transaction
```

For a hostile observation, `createCrnCoordinate`, `deriveRandomDomain`, `createCrnView`, and the fixed policy are each called zero times. `current ply` and `actingSeat` are read from the same stable state snapshot. `publicHistoryEvents` contains no CRN bytes or digest. This ordering is an entrance-boundary correction only; it does not alter the CRN coordinate/domain/semantic-key algorithm or Task 3 vectors. The policy entry must revalidate direct callers without mapping invalid observations to `no-legal-action`; the kernel passes the already validated observation to the fixed policy.

### I4 — Before/after transition proof

`stateConservation.ts` must validate the relation between an accepted immutable `before` state and an independent `after` state, not only whether `after` is self-consistent. `publicPlayedCardIds` uses exact code-unit equality; `localeCompare` is forbidden for prefix checks.

For every append operation the exact public-history proof is:

```text
afterHistory = beforeHistory + [one finalized event]
```

The validator `validatePublicHistoryAppend(beforeHistory, afterHistory, beforeLedger, afterLedger): StateConservationResult` checks exact unchanged prefix, length plus one, finalized schema, event index equal to `beforeLedger.nextEventIndex`, identity, `verifyPublicActionEventHash`, `applyPublicEvent(beforeLedger, appendedEvent).ledger`, and `afterLedger.seenEventHashes[eventIndex] === appendedEvent.publicPayloadHash`. It checks the preceding ledger hash as the previous-hash link. A play that also emits a separate `finish` event has two ordered append steps, each individually satisfying the one-event equation; it must not collapse the events or bypass the chain proof.

For a play, `after.publicPlayedCardIds` is the exact old prefix followed by the current finalized event's canonical `publicCardIds`. The action card IDs must equal that suffix as an exact set/multiset, and every action ID must be a unique member of the trusted 108-card deck. For a pass, public card IDs are byte-for-byte unchanged. Any prefix mutation, deletion, reorder, replacement, duplicate, missing, extra, or foreign ID fails before commit.

The real Room quorum is `passesNeededToReset(room) = Math.max(1, room.players.length - room.finishOrder.length - 1)`, hence for four seats `max(1, 4 - finishOrder.length - 1)`. A passing actor must be unfinished; finished seats are excluded from candidate turns. `lastPlaySeat` is not put into `passSeats`, but the formula still reserves one seat even when `lastPlaySeat` is already finished. A clear is legal only after the newly appended pass makes `passSeats.length >= requiredPasses`; `lastPlay === null` alone is never evidence of a legal clear. Before the clear, terminal status is checked using the Room rule, so an early-terminal boundary cannot continue to a trick clear.

The three required examples are frozen identically in all three documents:

1. All four active, `finishOrder = []`, `lastPlaySeat = 0`: required quorum is 3; only seats 1, 2, and 3 can pass, and exactly the third pass clears the trick with lead seat 0.
2. One finished, `finishOrder = [0]`, `lastPlaySeat = 1`: required quorum is 2; seat 0 is skipped, seats 2 and 3 supply the two passes, and clear leads seat 1.
3. Last-play seat finished but not terminal, `finishOrder = [0,1]`, `lastPlaySeat = 0`: the first two are non-partners, so the round continues; the required quorum is 1, one pass by seat 2 or 3 clears, and `resolveTrickWinnerSeat` leads with unfinished partner seat 2. At the early-terminal boundary `finishOrder = [0,2]`, the first two are partners, so the round terminates immediately and no pass or clear is allowed.

### I5 — Failure-stage preservation

The existing union is insufficient because `simulation-failed/replay` currently absorbs unrelated causes. The next contract edit freezes this exact kernel union:

```ts
type RolloutKernelFailure =
  | {
      kind: "simulation-failed";
      stage: "input";
      reason: "malformed-envelope" | "invalid-budget" | "invalid-root-identity" | "invalid-public-state" | "invalid-candidate";
    }
  | { kind: "simulation-failed"; stage: "replay"; reason: "invalid-scenario" | "invalid-replay-context" }
  | { kind: "simulation-failed"; stage: "root-action"; reason: "illegal-action" }
  | { kind: "simulation-failed"; stage: "policy-action"; reason: "illegal-action" }
  | { kind: "simulation-failed"; stage: "crn"; reason: "coordinate" | "random-domain" | "view" }
  | {
      kind: "simulation-failed";
      stage: "transition";
      reason: "invalid-action-transition" | "invalid-pass-quorum" | "public-history-not-append-only";
    }
  | { kind: "simulation-failed"; stage: "state-conservation"; reason: Exclude<StateConservationFailure["reason"], "invalid-action-transition"> }
  | { kind: "simulation-failed"; stage: "terminal-projection"; reason: "invalid-finish-order" | "utility-failed" }
  | { kind: "policy-failed"; failure: RolloutPolicyFailure }
  | { kind: "budget-exhausted"; workUnits: number; maximumWorkUnits: number };
```

The mapping is fixed: malformed input -> `input`; invalid scenario/replay context -> `replay`; illegal root action -> `root-action`; illegal fixed-policy action -> `policy-action`; policy context/CRN value failure -> `policy-failed` carrying the closed policy union, while coordinate/domain/view construction failure -> `crn`; transition/quorum/history append failure -> `transition`; card universe and state invariant failure -> `state-conservation` with the exact existing reason; terminal projection or team utility failure -> `terminal-projection`; exhausted budget -> the exact counts. Illegal action is never replay, transition is never replay, and state conservation reason is never discarded. Every branch is no-throw, atomic, and diagnostic-free of private data.

### I6 — Canonical `CardGroup` validation

`currentLastPlay` is first checked against the exact card schema and trusted deck membership. The validator then calls the real `classifyPlay(cards, gameRank)` from `src/game/playRules.ts`; it never trusts caller `type`, `strength`, `id`, `label`, or `purpose`. The input group is accepted only when the canonical result is defined and has semantic equality for `type`, `strength`, card-ID set, wildcard-ID set, `id`, `label`, and `purpose`. `label`, `purpose`, and `wildcards` are canonical outputs of `createGroup` inside `src/engine/groups.ts`/`classifyPlay`, not strings guessed by rollout code.

Wildcard IDs must be a duplicate-free subset of the group cards, and each wildcard must satisfy the real current-game-rank heart rule `isHeartRankWild`. Duplicate, foreign, malformed, wrong-rank wildcard, wrong label, wrong purpose, and wrong classification all fail. The stored observation uses the detached canonical `classifyPlay` result; both pass/play legality and transition validation consume that canonical projection. No `localeCompare` or caller-provided classification is used as authority.

### Acceptance tests frozen for the next implementation turn

The full-house root fixture uses `gameRank = "2"` and the real deck cards `S3-1`, `C3-1`, `H3-1`, `S4-1`, `C4-1`. `classifyPlay` must report the exact real type `"full-house"`, never bomb. The candidate action presents those five IDs in reverse order while the finalized public-event oracle expects the independent literal code-unit order `C3-1, C4-1, H3-1, S3-1, S4-1`; the test calls the real `runRolloutReplicate` root path and asserts success, no replay failure, the full-house type, exact hand/card projection, and the literal event-order oracle. It must not assert only that the implementation's comparator agrees with itself.

The strengthened terminal test makes the second partner actually finish. For finish prefix `[0,2]`, it asserts perspective partner utility `+3` and opponent utility `-3`; for rotated prefix `[1,3]`, it asserts perspective 0 utility `-3`. It instruments policy, CRN, and leaf calls and asserts all three counts are zero after root terminal detection. The minimum valid budget still succeeds. A two-finished non-partner fixture remains non-terminal and proves the kernel does not over-terminate.

The real source-to-kernel integration test belongs in the existing `tests/ai/rollout/particleScenarioSource.test.ts`, not a new large file and not `particleBankRolloutBoundary.test.ts`. It must execute `buildParticleBank` with the existing deterministic public fixture and at least two accepted particles, retain only the registered `ParticleBank` handle, call `createParticleScenarioSource`, select a real emitted scenario, build the validated replicate input through `createRolloutReplicateInputFromValidatedSource`, and call `runRolloutReplicate`. The test asserts the verified pre-root history reaches policy observation, the 108-card universe succeeds, registered/unregistered handle duties remain unchanged, source/kernel outputs are detached and frozen, no raw scenario/hands/weights enter diagnostics, and malformed source results never enter kernel. It may not use a handcrafted scenario/private state as its only integration evidence.

Transition negatives use the real kernel/transition entry and assert the exact stage plus unchanged accepted state and caller input: mutate/delete/reorder the public-card prefix; append a public card on pass; mismatch the play suffix; clear below quorum; use the wrong one-finished quorum; and force post-transition conservation or projection failure. No failure may contain a partial state, next state, private hand, scenario, or raw weight.

### Next-round exact allowlist and exclusions

The final minimal allowlist is identical in all three D2F documents:

```text
src/ai/rollout/contracts.ts                 # publicReplayContext and closed failure unions
src/ai/rollout/particleScenarioSource.ts    # source-owned validated replicate-input factory
src/ai/rollout/policy.ts                    # no-throw observation gate and CRN failure mapping
src/ai/rollout/kernel.ts                    # history cursor, decision order, transaction/stage mapping
src/ai/rollout/stateConservation.ts         # before/after prefix, append, quorum, and universe proofs
tests/ai/rollout/policy.test.ts             # I1, I3, I6 focused RED/GREEN tests
tests/ai/rollout/kernel.test.ts             # I4, I5, full-house, terminal, and transition tests
tests/ai/rollout/particleScenarioSource.test.ts # real builder/source/kernel integration
tests/ai/rollout/rolloutPrivacyAst.test.ts  # exact private/public and CRN-order boundary gate
tests/ai/rollout/particleBankRolloutBoundary.test.ts # required fixture migration and exact contract Gate only
```

`contracts.ts` is required because the current `RolloutReplicateInput`, `RolloutPolicyFailure`, `RolloutKernelFailure`, and arbitrary request field cannot express the frozen contract. `particleScenarioSource.ts` is required because the source must create the validated, provenance-preserving transport context; `ReplayedParticleState` remains unchanged. Policy, kernel, and state conservation each have a direct confirmed defect. The five existing test files are the smallest focused evidence set; no new large integration file is allowed. `rolloutPrivacyAst.test.ts` is updated only if its exact AST symbols must recognize the new public replay-context hand-off; it must continue to reject private particle imports and policy/CRN leakage.

The approved option 1 keeps `RolloutReplicateInput.publicReplayContext` required. `tests/ai/rollout/particleBankRolloutBoundary.test.ts` may change only to migrate real typed fixtures to a legal, canonical, frozen required `publicReplayContext` and to update the corresponding exact TypeScript Compiler API contract Gate. It must not delete, weaken, or broaden any existing Task 1 private-boundary assertion, and the rollout directory must not become an allowed consumer. The exact Gate must continue to prove that the kernel is an approved consumer, policy is not a consumer, and the private bridge remains unique. Missing `publicReplayContext` must remain a compile-time or contract failure, and public history must not enter CRN coordinates. Making the field optional, supplying an empty-history fallback, using a type assertion to bypass the contract, adding a test-only entry, or creating a second legacy-contract entry is forbidden.

Forbidden in the next turn: `src/game/**`, `src/engine/**`, `src/ai/particles/**`, `src/ai/planning/**`, `src/ai/aiDecisionEngine.ts`, `tests/ai/particles/particleBankBuilder.test.ts`, package/lock/config files, benchmark runner files, and all Task 5–9 files. No formal decision path is modified.

### Frozen RED/GREEN order

The next turn must execute these ten stages in order. Each stage writes a real production-entry RED, runs the same focused command to confirm the expected behavior fails, applies the smallest production fix, reruns the same command GREEN, then runs only the affected focused regression. A missing module/import or empty fixture is not a valid RED.

1. Policy failure classification — `tests/ai/rollout/policy.test.ts`; malformed observation, verified empty legal set, and throwing CRN must produce the three distinct typed classes.
2. CurrentLastPlay canonical validation — `tests/ai/rollout/policy.test.ts`; wrong type/strength/cards/wildcards/label/purpose and foreign/duplicate cards fail while canonical classifier output succeeds.
3. Observation-before-CRN — policy/kernel focused tests; hostile observation proves zero coordinate/domain/view/policy calls and no action.
4. Public-history authoritative data flow — `tests/ai/rollout/particleScenarioSource.test.ts`; real source context reaches the first kernel observation and pre-root history is not reset.
5. Append-only transition proof — `tests/ai/rollout/kernel.test.ts`; prefix and history mutations fail with no state change and exact transition reason.
6. Pass quorum — `tests/ai/rollout/kernel.test.ts`; the three frozen examples and insufficient-clear cases use the Room formula exactly.
7. Failure-stage preservation — `tests/ai/rollout/kernel.test.ts`; input/root/policy/CRN/transition/conservation/terminal/budget cases retain the closed stage/reason union.
8. Full-house real production test — `tests/ai/rollout/kernel.test.ts`; non-bomb real classifier, reversed action order, literal event-order oracle, successful root path.
9. Early-terminal assertion strengthening — `tests/ai/rollout/kernel.test.ts`; actual partner finish, `+3/-3`, rotated `-3`, minimum budget, zero policy/CRN/leaf calls.
10. Real source-to-kernel integration — `tests/ai/rollout/particleScenarioSource.test.ts` plus the privacy AST gate; real builder -> registered handle -> source -> validated replicate input -> kernel.

Focused commands are `& .\\node_modules\\.bin\\vitest.cmd run tests/ai/rollout/policy.test.ts`, `& .\\node_modules\\.bin\\vitest.cmd run tests/ai/rollout/kernel.test.ts`, `& .\\node_modules\\.bin\\vitest.cmd run tests/ai/rollout/particleScenarioSource.test.ts`, and the same command for `rolloutPrivacyAst.test.ts`, with the affected file only and no full suite. This docs-only turn ran none of them.

### Documentation gate, commit, and deferred gates

Before commit, run exactly `git diff --name-status`, `git diff --check`, and `git status --short`; verify changed paths are exactly the three named D2F documents, compare this report's public-history owner, observation/CRN order, failure union, append proof, quorum examples, canonical CardGroup fields, source chain, allowlist, and RED order across all three documents, balance Markdown fences, and run the repository's prohibited-placeholder scan with zero new implementation placeholders. This turn does not run Vitest, tsc, build, benchmark, or modify production/tests.

Commit only after those gates pass, with:

```text
docs(ai): freeze Task 4 integration transition remediation
```

After commit, verify `git rev-parse HEAD`, `git show --stat --oneline HEAD`, `git status --short`, and `git diff --check`; the worktree must be clean. Deferred gates remain exactly:

```text
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
Task 9 full permitted regression
```

This is a Task 4 design freeze only and does not claim D2F Shadow release readiness. Task 5 has not started.

# D2F_TASK4_FINAL_BOUNDARY_GATE_FREEZE_REPORT

## Verdict and scene lock

Verdict:

TASK 4 FINAL BOUNDARY/GATE DESIGN FROZEN
TASK 4 CODE REMEDIATION PENDING
TASK 5 NOT STARTED

The locked worktree is E:/workspace/掼蛋游戏开发/.worktrees/d2f-crn-rollout-source on branch codex/d2f-crn-rollout-source. The complete start HEAD is bde8d5f3b7b3a87a0868de4e0bef2a9a0d3c5057 and its message is fix(ai): preserve D2F rollout history and transitions. The scene-lock checks passed with no staged, unstaged, or untracked changes and git diff --check passed.

The exact changed paths are only:

~~~text
docs/superpowers/specs/2026-08-02-d2f-design-spec.md
docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md
docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
~~~

The end HEAD is the complete commit ID printed by the required post-commit git rev-parse HEAD check; it cannot be known before the commit is created. The required commit message is docs(ai): freeze final D2F Task 4 boundaries. The final handoff records that complete end HEAD and the clean-worktree result.

## Important Finding A — D2 audited shard partition

Finding A is CONFIRMED. The existing D2 manifest is complete at 19 tracked files. D2e's old four-file parallel run containing Room exceeded 15 seconds twice; the same Room file alone was about 12.38 seconds and passed, with no assertion-failure evidence. That is a resource-contention result, not a pass, and no timeout is changed.

The new partition is a gate-partition correction. Every file enters exactly one independent explicit-file command; no glob discovery, accumulated excludes, or timeout change is allowed. The source-audited case counts below are rechecked from the current files and are not runtime results:

### fast-public-ledger — 12 files, 66 source-audited cases

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
~~~

~~~powershell
& .\node_modules\.bin\vitest.cmd run tests/ai/lightweightPublicEvidence.test.ts tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerDependency.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts --reporter=dot
~~~

### fast-ai-policy-reducer — 5 files, 144 source-audited cases

~~~text
tests/ai/beliefGuidedPlanPolicy.test.ts
tests/ai/representativeActionReducer.test.ts
tests/ai/representativeActionReducerDetached.test.ts
tests/ai/representativeActionShadowByteLock.test.ts
tests/ai/representativeActionShadowIntegration.test.ts
~~~

~~~powershell
& .\node_modules\.bin\vitest.cmd run tests/ai/beliefGuidedPlanPolicy.test.ts tests/ai/representativeActionReducer.test.ts tests/ai/representativeActionReducerDetached.test.ts tests/ai/representativeActionShadowByteLock.test.ts tests/ai/representativeActionShadowIntegration.test.ts --reporter=dot
~~~

### ast — 1 file, 1 source-audited case

~~~text
tests/ai/representativeActionShadowAst.test.ts
~~~

~~~powershell
& .\node_modules\.bin\vitest.cmd run tests/ai/representativeActionShadowAst.test.ts --reporter=dot
~~~

### room — 1 file, 1 source-audited case

~~~text
tests/ai/representativeActionShadowRoom.test.ts
~~~

~~~powershell
& .\node_modules\.bin\vitest.cmd run tests/ai/representativeActionShadowRoom.test.ts --reporter=dot
~~~

The four shards are 19 assigned paths, 19 unique paths, and 212 source-audited cases. The coverage proof must print exactly:

~~~text
assigned=19
unique=19
missing=0
duplicate=0
overlap=0
extra=0
failed=0
skipped=0
~~~

The proof compares the flattened explicit paths with the exact 19-path manifest, checks each path exists and is tracked, and rejects a path assigned to more than one shard. No shard is run in this docs-only turn.

## Important Finding B — canonical public-card identity

Finding B is CONFIRMED. A finalized event can have a valid shape and valid public payload hash while its publicCardIds are not members of the physical deck; hash validity is not card-identity validity.

The policy/public-observation authority is:

~~~text
U = Set(createDeck().map(card => card.id))
|U| = 108
~~~

For every public play event, each publicCardId must be in U, must be duplicate-free within that event, and must not occur in another play event. A public played card must not remain in the acting seat's current hand. Pass, trick-clear, finish, anti-tribute, and every other no-card event carry no play card IDs. Tribute and return may expose zero or one transfer card ID; transfer IDs move cards and do not enter the played-card set. All ID equality is exact code-unit equality; localeCompare is not used. A valid eventHash never bypasses these checks. The result is a frozen invalid-policy-context failure with the exact public-history field and reason, never a throw or partial action, and diagnostics never include the foreign ID or full history.

The next contract delta extends RolloutPolicyFailure with this exact branch while retaining the existing observation, ply, actingSeat, no-legal-action, and CRN branches:

~~~ts
| {
    kind: "invalid-policy-context";
    field: "publicHistoryEvents[].publicCardIds";
    reason:
      | "foreign-card-id"
      | "duplicate-card-id"
      | "cross-event-duplicate-card-id"
      | "acting-hand-overlap"
      | "non-play-event-card-ids";
  }
~~~

Policy proves canonical membership, public-play uniqueness, and acting-hand overlap only. It does not receive opponent hands. Full four-seat physical conservation remains the kernel's responsibility.

There is one authenticity limitation: the real finalizePublicActionEvent path rejects a same-event duplicate before hashing with PUBLIC_CARD_DUPLICATE. Therefore the P2 row below is a real finalizer construction guard and is not reported as a fabricated hash-valid policy event. Cross-event duplication uses separately finalized real events. No wrong hash, test-only hook, or double assertion is permitted.

### Policy RED matrix

~~~text
P1  real finalized/hash-valid play with a foreign-card ID -> invalid-policy-context / foreign-card-id
P2  real finalizer receives same-event duplicate -> construction rejection PUBLIC_CARD_DUPLICATE; policy duplicate guard remains frozen
P3  two real finalized play events repeat one physical ID -> invalid-policy-context / cross-event-duplicate-card-id
P4  public played ID remains in acting hand -> invalid-policy-context / acting-hand-overlap
P5  pass/trick-clear/no-card event carries play IDs -> invalid-policy-context / non-play-event-card-ids
P6  canonical valid history -> fixed policy accepts or returns the real legal-action result
P7  real transfer followed by a legal play -> fixed policy accepts
P8  hostile getter count -> 0
P9  typed failure, no throw, no partial action, no private diagnostics
P10 CRN call count -> 0 for rejected public observation
~~~

## Important Finding C — replay and projection reconciliation

Finding C is CONFIRMED. The exported runRolloutReplicate entry accepts a required publicReplayContext, but the current boundary does not reconcile every scenario/private and public projection against the replayed final ledger before action observation and CRN use. A real source-produced scenario is necessary evidence but cannot replace the direct kernel boundary.

The frozen entry order is:

~~~text
validate input envelope
→ validate required publicReplayContext
→ replay history from canonical initial ledger
→ derive authoritative final public ledger/state
→ validate scenario projections against replay result
→ validate canonical 108-card physical universe
→ create isolated accepted state
→ observation/CRN/policy
~~~

Before projection reconciliation completes, observation calls = 0, CRN calls = 0, policy calls = 0, and transition calls = 0.

The exact contract delta is one new field union and one new RolloutKernelFailure member. Existing invalid-scenario and invalid-replay-context members remain distinct, and StateConservationFailure remains the existing closed union:

~~~ts
export type RolloutScenarioProjectionMismatchField =
  | "publicReplayContext.initialLedger.gameId"
  | "publicReplayContext.initialLedger.roundIdentity"
  | "publicReplayContext.initialLedger.handIdentity"
  | "publicReplayContext.initialLedger.currentTrick.leadSeat"
  | "publicReplayContext.initialLedger.publicTributeEvents"
  | "publicReplayContext.finalLedger.gameId"
  | "publicReplayContext.finalLedger.roundIdentity"
  | "publicReplayContext.finalLedger.handIdentity"
  | "publicReplayContext.finalLedger.lastAppliedEventIndex"
  | "publicReplayContext.finalLedger.nextEventIndex"
  | "publicReplayContext.finalLedger.handCounts"
  | "publicReplayContext.finalLedger.finishOrder"
  | "publicReplayContext.finalLedger.currentTrick.trickIndex"
  | "publicReplayContext.finalLedger.currentTrick.leadSeat"
  | "publicReplayContext.finalLedger.currentTrick.lastPlaySeat"
  | "publicReplayContext.finalLedger.currentTrick.lastPlayStableKey"
  | "publicReplayContext.finalLedger.currentTrick.passSeats"
  | "publicReplayContext.finalLedger.playedCardIds"
  | "publicReplayContext.finalLedger.revealedTransferEvents"
  | "publicReplayContext.publicHistoryEvents"
  | "canonicalPublicLedgerHash(publicReplayContext.finalLedger)"
  | "scenario.privateState.ledger"
  | "scenario.privateState.handCounts"
  | "scenario.privateState.finishOrder"
  | "scenario.privateState.currentTrick"
  | "scenario.privateState.currentLastPlay"
  | "scenario.privateState.revealedTransferEvents"
  | "scenario.privateState.publicPlayedCardIds"
  | "scenario.privateState.hands"
  | "publicState.gameRank"
  | "publicState.actingSeat"
  | "publicState.handCounts"
  | "publicState.finishOrder"
  | "publicState.publicPlayedCardIds"
  | "publicState.currentLastPlay"
  | "publicState.currentLastPlaySeat";

| {
    kind: "simulation-failed";
    stage: "replay";
    reason: "scenario-projection-mismatch";
    field: RolloutScenarioProjectionMismatchField;
  }
~~~

### Exact kernel reconciliation table

| Authoritative replay value | Exact projection or existing indirect proof | Failure mapping |
| --- | --- | --- |
| canonicalPublicLedgerHash(replayed final ledger), plus initial/final schema and game identity | publicReplayContext.initialLedger and finalLedger; gameId, roundIdentity, handIdentity; scenario.privateState.ledger | replay / scenario-projection-mismatch / exact field |
| event cursor and hash prefix | publicHistoryEvents.length, eventIndex sequence, finalLedger.nextEventIndex, finalLedger.lastAppliedEventIndex, seenEventHashes, and publicHistoryEvents | replay / scenario-projection-mismatch / publicReplayContext.publicHistoryEvents or final cursor field |
| finalLedger.handCounts[0..3] | scenario.privateState.handCounts[0..3] and publicState.handCounts[0..3] | replay / scenario-projection-mismatch / handCounts |
| finalLedger.finishOrder | scenario.privateState.finishOrder and publicState.finishOrder | replay / scenario-projection-mismatch / finishOrder |
| finalLedger.currentTrick.trickIndex, leadSeat, lastPlaySeat, lastPlayStableKey, passSeats | scenario.privateState.currentTrick; publicState.currentLastPlaySeat; currentLastPlay is checked against the authoritative last play | replay / scenario-projection-mismatch / currentTrick field |
| authoritative last play event | scenario.privateState.currentLastPlay and publicState.currentLastPlay are canonicalized with classifyPlay(cards, publicState.gameRank); event groupType, patternType, publicCardIds, publicStableKey and card IDs must agree | replay / scenario-projection-mismatch / currentLastPlay field |
| finalLedger.playedCardIds | scenario.privateState.publicPlayedCardIds and publicState.publicPlayedCardIds must be exact ordered arrays; publicHistoryEvents must preserve the complete played-card prefix | replay / scenario-projection-mismatch / playedCardIds or publicHistoryEvents |
| opening leader and opening status | opening leader is initialLedger.currentTrick.leadSeat; opening transfer state is initialLedger.publicTributeEvents plus the history transfer prefix and finalLedger.revealedTransferEvents; no new openingLeader field is invented | replay / scenario-projection-mismatch / existing initial or final field |
| publicState.gameRank | existing publicState.gameRank and the source-owned ParticleSnapshotIdentity.gameRank; scenario.privateState has no gameRank field | replay / scenario-projection-mismatch / publicState.gameRank |
| acting/current turn | derive the next eligible seat from the replay history and finalLedger.finishOrder, then compare with publicState.actingSeat; scenario.privateState has no actingSeat field | replay / scenario-projection-mismatch / publicState.actingSeat |
| snapshot/replay identity | existing ParticleSnapshotIdentity fields are gameId, roundIdentity, handIdentity, initialLedgerHash, lastAppliedEventIndex, ledgerHash, perspectiveSeat, gameRank; this identity is source-owned and no raw snapshot field exists in RolloutReplicateInput | source-owned identity proof; no invented kernel field |
| authoritative hand counts | scenario.privateState.hands[0..3].length must equal finalLedger.handCounts[0..3] and the corresponding hand objects must be exact card records | replay / scenario-projection-mismatch / scenario.privateState.hands or handCounts |
| public/private physical separation | no card ID in scenario.privateState.hands may occur in finalLedger.playedCardIds | state-conservation / public-card-overlap |
| canonical physical universe | unique hands plus finalLedger.playedCardIds must equal U exactly, where U is the 108 IDs from createDeck(); existing state-conservation reasons remain authoritative | state-conservation / unexpected-card, duplicate-card, missing-card, or public-card-overlap |

This table does not overclaim hidden ownership. If a caller reassigns hidden cards while preserving every public projection, the four-seat cover, and all existing conservation invariants, the direct kernel cannot identify that alternate hidden allocation from public data alone; source-owned scenario identity and replay remain the authority. No private diagnostic is returned.

### Failure mapping

~~~text
malformed envelope, invalid budget, invalid root identity, invalid public state, invalid candidate
  -> kind=simulation-failed, stage=input, existing input reason
invalid scenario shape or private-state shape
  -> kind=simulation-failed, stage=replay, reason=invalid-scenario
invalid required history, initial ledger, event hash, event application, or replay cursor
  -> kind=simulation-failed, stage=replay, reason=invalid-replay-context
valid replay with a mismatching scenario/public projection
  -> kind=simulation-failed, stage=replay, reason=scenario-projection-mismatch, field=RolloutScenarioProjectionMismatchField
illegal root action
  -> kind=simulation-failed, stage=root-action, reason=illegal-action
illegal fixed-policy action
  -> kind=simulation-failed, stage=policy-action, reason=illegal-action
CRN construction or value failure
  -> kind=simulation-failed, stage=crn, existing coordinate/random-domain/view reason
transition, append-only, or pass-quorum failure
  -> kind=simulation-failed, stage=transition, existing exact reason
card universe or state invariant failure
  -> kind=simulation-failed, stage=state-conservation, existing StateConservationFailure reason
terminal or utility failure
  -> kind=simulation-failed, stage=terminal-projection, existing exact reason
fixed policy context or no legal action failure
  -> kind=policy-failed, failure=RolloutPolicyFailure
work-unit exhaustion
  -> kind=budget-exhausted, exact workUnits and maximumWorkUnits
~~~

Every branch is no-throw, atomic, and free of hands, raw scenarios, raw weights, foreign card details, or partial state in diagnostics.

## Test authenticity and RED matrices

Policy cases call the real fixed policy. Finalized event hashes use the real finalization and verification APIs; the same-event duplicate construction caveat above is retained. Kernel mismatch cases call exported runRolloutReplicate directly. Valid integration remains buildParticleBank → registered ParticleBank → createParticleScenarioSource → validated replicate input → runRolloutReplicate. Expected replay ledgers use real createInitialPublicLedger and applyPublicEvent. No copied replay algorithm, as any, double assertion, optional context, or test-only hook is allowed, and existing 238 tests are not weakened.

### Kernel RED matrix

~~~text
K1  scenario has one extra public played card
K2  scenario.privateState.handCounts differs from finalLedger.handCounts
K3  scenario.privateState.finishOrder differs
K4  scenario.privateState.currentTrick differs
K5  currentTrick.passSeats differs
K6  currentLastPlay differs from the canonical last play
K7  public played-card prefix or event order differs
K8  publicState.actingSeat differs from the replay-derived turn
K9  a private hand length differs from authoritative handCounts
K10 a private hand overlaps authoritative public played IDs
K11 all 108 physical IDs are covered but a public projection differs from the ledger
K12 real source-produced scenario succeeds through the kernel
K13 hostile getter count is 0
K14 observation, CRN, policy, and transition call counts are all 0 before mismatch rejection
K15 typed failure, no throw, no partial result, and no private diagnostics
~~~

## Next-round exact allowlist and TDD order

The minimum next-round allowlist is identical in all three D2F documents:

~~~text
src/ai/rollout/contracts.ts                 # policy and projection failure unions
src/ai/rollout/policy.ts                    # canonical public-card and hand-overlap gate
src/ai/rollout/kernel.ts                    # replay order and projection reconciliation
src/ai/rollout/stateConservation.ts        # canonical universe and existing conservation proofs
tests/ai/rollout/policy.test.ts             # P1–P10 real fixed-policy cases
tests/ai/rollout/kernel.test.ts             # K1–K15 direct kernel cases
~~~

particleScenarioSource.ts and its test are not in the implementation allowlist because the current real builder → registered handle → source → kernel chain already preserves the required replay context and remains a regression gate. particleBankRolloutBoundary.test.ts and rolloutPrivacyAst.test.ts are not changed unless a RED proves an exact contract/AST dependency; no such dependency is frozen here. Forbidden paths are src/game/**, src/engine/**, src/ai/particles/**, src/ai/planning/**, src/ai/aiDecisionEngine.ts, package files, lock files, configuration, benchmark files, and all Task 5–9 files.

The TDD sequence is: (1) forged public-card membership; (2) duplicate public-play identity and no-card events; (3) acting-hand/public-play overlap; (4) direct kernel replay/projection mismatch; (5) the exact projection table; (6) real source-to-kernel success regression; (7) privacy and zero-call boundary; (8) focused affected-file regression; (9) the new D2 audited shards; (10) independent review. Each item must produce a real RED, rerun the same focused command after the smallest fix for GREEN, and preserve failure type, atomicity, and diagnostics rules.

## Documentation Gate, commit, deferred gates, and Task 5

The documentation Gate commands are exactly:

~~~text
git diff --name-status
git diff --check
git status --short
~~~

The Gate requires the canonical report block to be byte-identical in all three documents; exact changed paths; identical D2 manifest, shard commands, coverage output, policy identity rules, kernel reconciliation table, failure mapping, allowlist, and RED/TDD order; balanced Markdown fences; and no implementation placeholder tokens or vague placeholder wording. This turn runs no Vitest, tsc, build, or benchmark and modifies no production or test file.

Commit only after the Gate passes:

~~~text
docs(ai): freeze final D2F Task 4 boundaries
~~~

After commit, run exactly:

~~~text
git rev-parse HEAD
git show --stat --oneline HEAD
git status --short
git diff --check
~~~

The worktree must be clean. Deferred gates remain exactly:

~~~text
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
Task 9 full permitted regression
~~~

Task 5 remains NOT STARTED. This report freezes final Task 4 boundary and gate design only; it does not claim D2F Shadow release readiness.

D2F_TASK4_FINAL_BOUNDARY_BLOCK_BEGIN
# D2F_TASK4_FINAL_ACCEPTANCE_REMEDIATION_FREEZE_REPORT

This is the current Task 4 acceptance-remediation source of truth. Earlier Task 4 freeze blocks in this document are retained as historical audit material and are superseded by this block.

## Verdict

~~~text
TASK 4 FINAL ACCEPTANCE REMEDIATION DESIGN FROZEN
TASK 4 CODE REMEDIATION PENDING
TASK 5 NOT STARTED
~~~

start HEAD: 0bc1c02c01ed757a5e5c68b7c789438c813a92e3
branch: codex/d2f-crn-rollout-source
worktree: E:/workspace/掼蛋游戏开发/.worktrees/d2f-crn-rollout-source
end HEAD: the post-commit HEAD printed by the final handoff check; the commit object cannot contain its own object ID.
commit: docs(ai): freeze final D2F Task 4 acceptance remediation

This round is docs-only. It does not modify production or tests, does not start Task 5, and does not claim D2F Shadow release readiness.

Changed paths:

~~~text
docs/superpowers/specs/2026-08-02-d2f-design-spec.md
docs/superpowers/plans/2026-08-02-d2f-implementation-plan.md
docs/superpowers/plans/2026-08-02-d2f-test-gate-matrix.md
~~~

## Finding 1 — nested publicReplayContext replay boundary: CONFIRMED

The root cause is in the direct kernel boundary, not in the source-owned request/replay path. runRolloutReplicate calls isolateRolloutInput; that function checks the outer input record, then reads publicReplayContext into isValidPublicReplayContext. The current replay-context check validates only the outer context record, array container and ledger containers. It can read events[index].eventIndex and invoke verifyPublicActionEventHash/applyPublicEvent before a recursive plain-data/schema validation of every event and nested ledger value. isPlainDataArray validates the array container and numeric descriptors but does not recursively validate its elements. A nested event getter, inherited getter, custom prototype, accessor, symbol, expando, sparse element, cycle or hostile nested ledger graph can therefore be reached by replay code before the boundary has established a safe graph.

The existing trusted source-side authorities are assertReplayContextInput and clonePublicHistoryEvents in src/ai/rollout/contracts.ts; they already establish recursive public-event shape, finalized-event semantics and hash validity for the source/request path. The remediation reuses one of those existing meanings at the direct kernel boundary, or moves the shared implementation within contracts.ts for reuse. It must not create a second validator with a different schema or use structuredClone, JSON.stringify or replay execution as validation.

The frozen order is:

~~~text
unknown kernel input
  -> outer descriptor/prototype/own-key validation
  -> recursive plain-data and publicReplayContext schema validation
  -> detached projection and freeze of the validated graph
  -> canonical replay of initial ledger plus public history
  -> scenario/private/public projection reconciliation
  -> canonical card-universe validation
  -> seat-local observation
  -> CRN coordinate/domain/view
  -> fixed policy
~~~

Before recursive replay-context validation completes, nested getter/callback calls are 0, replay/observation/CRN/policy/transition calls are 0, and the kernel returns the closed typed failure { kind: "simulation-failed", stage: "replay", reason: "invalid-replay-context" }. The failure contains no history, card ID, ledger, scenario, private state or hostile property name; it never throws and never returns a partial state. A semantically valid replay whose scenario/public projection differs uses { kind: "simulation-failed", stage: "replay", reason: "scenario-projection-mismatch", field: RolloutScenarioProjectionMismatchField }, with the exact projection field and no forged value.

Minimum RED cases are: a getter on publicHistoryEvents[0].eventIndex, a getter/custom prototype in a nested ledger/current-trick or transfer record, a symbol or expando on a nested event, and a cycle or sparse nested event array. Each case must call the real runRolloutReplicate entry and assert no throw, zero downstream calls, no partial result and diagnostics without caller/private data. GREEN must prove the same cases are rejected after the recursive schema boundary while a real source-produced canonical replay remains valid.

## Finding 2 — canonical transfer card membership: CONFIRMED

The trusted physical-card universe is:

~~~text
U = Set(createDeck().map(card => card.id))
|U| = 108
~~~

The current root cause is distributed across the public event and direct policy paths. assertTransferDraft in src/game/publicEvent.ts checks only that a transfer publicCardIds member is a string. publicEventHash.ts hashes that value but does not prove membership in U, and publicLedger.ts applies tribute/return as hand-transfer views without adding the ID to playedCardIds or checking deck membership. policy.ts applies the foreign/duplicate/overlap card checks only to play events; its non-play branch allows a hash-valid foreign tribute/return ID to reach later CRN/policy work. The source request path's syntactic card checks do not remove this direct policy/kernel boundary defect.

Every physical-card public event—play, tribute, return, and any real card-bearing transfer—must prove each publicCardIds member is in U, has the event's canonical transfer/play shape, and is accepted by the finalized-event hash and replay validators. Only play IDs enter the public played-card set. Tribute/return IDs are ownership-transfer views: they change the receiving/losing hand projection and remain absent from publicPlayedCardIds; a canonical transfer card may legally appear in the receiver's hand. The play-only acting-hand overlap rule is not applied to a transfer. No transfer event may create, destroy or double-count a physical card.

At the policy boundary, a foreign transfer fails before observation/CRN/policy with the existing exact union member { kind: "invalid-policy-context", field: "publicHistoryEvents[].publicCardIds", reason: "foreign-card-id" }. The failure contains no foreign ID or full history, never throws, and returns no action or partial projection. The field name is exactly publicHistoryEvents[].publicCardIds; cardId is not a substitute.

Minimum RED cases are: hash-valid foreign tribute, hash-valid foreign return, canonical tribute/return with a receiver hand containing the transferred card, a transfer ID incorrectly entering publicPlayedCardIds, and a hostile transfer nested graph. GREEN must prove canonical membership and replay shape for both transfer kinds, preserve transfer/played accounting, allow the legal receiver hand, reject the foreign cases with the exact field/reason, and keep CRN/policy call counts at 0 for rejected observations.

## Finding 3 — currentLastPlay field attribution: CONFIRMED

The authoritative current last play is reconstructed from replayed public events and classified with the real card group semantics under the actual game rank. The current kernel then compares the reconstructed group with scenario.privateState.currentLastPlay and publicState.currentLastPlay using identity and structure helpers. A mismatch in strength or wildcards can satisfy identity while failing structure, so the current code incorrectly maps that forged group detail to publicState.gameRank. The analogous public comparison has the same defect. A forged group detail must never be used to infer a game-rank mismatch.

The frozen field mapping is table-driven and changes exactly one field per case:

| forged source | changed field | exact projection-mismatch field |
| --- | --- | --- |
| scenario.privateState.currentLastPlay | type, label, purpose, cards, strength, wildcards, or null/non-null | scenario.privateState.currentLastPlay |
| publicState.currentLastPlay | type, label, purpose, cards, strength, wildcards, or null/non-null | publicState.currentLastPlay |
| publicState.currentLastPlaySeat | seat value | publicState.currentLastPlaySeat |
| publicState.gameRank | actual game rank used by replay classification | publicState.gameRank |

The private mismatch must not map to a public projection field; the public group mismatch must not map to game rank; only a real classifier/game-rank inconsistency maps to publicState.gameRank. Reconciliation occurs before observation, CRN construction/value calls, policy, transition or commit. Every case returns the exact closed projection-mismatch failure, does not throw, produces no partial state, leaves caller input unchanged, and emits no forged group details.

## RED/GREEN remediation order

The next code turn uses three real-entry stages in this order; this freeze ran none of their tests:

| stage | RED minimum | GREEN evidence |
| --- | --- | --- |
| A — nested replay boundary | hostile nested event/ledger/trick/transfer graph at runRolloutReplicate | recursive schema validation precedes replay; zero getter/callback/downstream calls; typed replay failure; no throw/partial/private diagnostics; canonical replay still succeeds |
| B — transfer membership | foreign tribute/return, canonical transfer, receiver-hand ownership, played-set exclusion | exact U membership and transfer schema; exact publicHistoryEvents[].publicCardIds/foreign-card-id; no play-overlap rule for transfer; no CRN/policy call on rejection |
| C — currentLastPlay | one-field mutations across the private/public group, seat and game-rank table | exact field mapping above; actual game-rank mismatch remains publicState.gameRank; all checks precede observation/CRN/policy/transition |

Each RED must fail for the named behavior at the real production entry, not for a missing module, import, fixture or environment. Each GREEN reruns the same focused command and keeps no-throw, no-partial, input-immutability, privacy, observation-call and CRN-call assertions.

## Allowlist and exclusions

The next-round allowlist is a maximum set, not a requirement that every path change:

~~~text
src/ai/rollout/contracts.ts
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

rolloutPrivacyAst.test.ts is allowed to remain unchanged; it is still a required gate file, not a mandatory delta. A shared validator is added outside this set only if direct inspection proves that the existing trusted validator cannot be reused or shared inside contracts.ts; no such extra path is currently confirmed. The actual docs-only delta is limited to these three canonical documents.

Forbidden in the remediation turn: Room, decision engine, planning, ParticleBank internals, formal action path, package/lock/config files and all Task 5–9 files. No production/test file is changed in this freeze.

## SHA root cause and non-self-referential canonical algorithm

The old final block is the same raw worktree/Git-blob byte sequence in all three documents: LF line endings, a final LF, and 20,935 bytes from the old boundary through EOF. Hashing that exact old boundary-through-EOF byte range produces 5d3d8684e27f154b9f077a96d4cd8318a0f7a513a7a49fb13a475a68e51eec24, which explains the independently reproducible 5d3… value. The independent implementer literal 70994a939a116d85ca5b4a93f8ca9801c982aeb7ec43da0066264fff646896d8 is not present in current Git history and cannot be reproduced from current worktree/blob bytes by the tested marker inclusion/exclusion, LF/CRLF, trailing-LF, full-file or common-encoding variants. The evidence identifies an undocumented prior boundary/input as the root cause; it does not support a CRLF claim.

The two unique boundary lines surrounding this report define the canonical payload. The hash input is the exact raw byte slice strictly between the first unique begin boundary and the first unique end boundary in each file. Boundary bytes are excluded; all payload line endings and other bytes are included exactly as stored. The validator reads raw Git/worktree bytes, rejects missing or duplicate boundaries, performs no CRLF/LF conversion, Unicode conversion, trimming, whitespace normalization, Markdown parsing or JSON serialization, and compares payload length, bytes and SHA-256 across all three files. The recorded length and digest lines follow the end boundary and are outside the hashed payload, so the expected digest does not self-reference.

## D2 gate partition and remaining gates

The audited D2 gate remains four explicit, non-overlapping shards: fast-public-ledger 12 files/66 source-audited cases, fast-ai-policy-reducer 5 files/144 cases, ast 1 file/1 case, and room 1 file/1 case. The exact proof is:

~~~text
assigned=19
unique=19
missing=0
duplicate=0
overlap=0
extra=0
failed=0
skipped=0
~~~

No timeout is changed, and no shard is run in this docs-only turn. The future acceptance sequence remains focused policy/kernel/privacy checks, the real source integration gate, the D2 exact 19-file/212-case gate, TypeScript/build/diff checks and independent acceptance. Full regression, fixed benchmark runner and Node 22 evidence remain separate gates.

## Docs-only verification and handoff

The required documentation checks are git diff --name-status 0bc1c02c01ed757a5e5c68b7c789438c813a92e3..HEAD, git diff --check, git status --short, changed-path allowlist validation, balanced Markdown-fence validation, prohibited-placeholder scan, cross-document interface/failure/allowlist comparison, unique-boundary validation, raw payload length/SHA equality, and confirmation that production, test, package, lock and config diffs are empty. This turn runs no Vitest, TypeScript compile, build or benchmark. The only authorized commit message is docs(ai): freeze final D2F Task 4 acceptance remediation; after commit, verify the new HEAD, commit summary, clean status and git diff --check HEAD^..HEAD.

Deferred gates:

~~~text
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
Task 9 full permitted regression
~~~

Task 5 is not started. This freeze does not claim D2F Shadow release readiness.
D2F_TASK4_FINAL_BOUNDARY_BLOCK_END
Canonical block raw payload bytes: 13986
Canonical block raw SHA-256: 0220ec7d6076e5f6a51d9dc5789957ce820fd38492052719e237429f95e5aa96

D2F_TASK4_PRAGMATIC_CLOSURE_BLOCK_BEGIN
# D2F_TASK4_PRAGMATIC_CLOSURE_STANDARD

本块是当前 Task 4 的唯一严重度和实现边界 source of truth，覆盖此前文档中针对极端 hostile input、精细 diagnostic field 和 canonical SHA literal 的更高审查要求；历史文字保留用于审计，不再作为本轮阻塞标准。

## Verdict

TASK 4 PRAGMATIC REVIEW STANDARD FROZEN
TASK 4 TRANSFER MEMBERSHIP REMEDIATION PENDING
TASK 5 NOT STARTED

## General game-AI blocking standard

只有以下问题可以阻塞 Task 4：合法正常牌局运行错误或崩溃；合法多牌动作、pass、trick 或终局规则错误；108 张物理牌守恒被破坏；rollout 修改正式 Room 或 caller state；policy 看到对手隐藏手牌；raw scenario、完整 hidden hands、assignment 或 weight detail 泄漏；candidate identity 进入 CRN；相同合法输入不能确定性复现；真实 `ParticleBank → scenario source → kernel` 链路失败；TypeScript、build、核心 focused 或回归测试失败；Task 5–9 越界实现；正式动作路径被修改。

## Frozen classification of prior findings

- Nested replay descriptor validation — **NON-BLOCKING HARDENING**. 正常 production source 产生普通冻结数据对象；除非能证明真实 source 产生的合法对象失败、泄漏或污染状态，本轮不修改 kernel/contracts，也不以恶意 getter、accessor、symbol 或 custom prototype 阻塞 Task 4。
- Transfer canonical card membership — **NORMAL DATA-INTEGRITY FIX — IMPLEMENT**. tribute/return 的真实 physical card ID 必须属于 `Set(createDeck().map(card => card.id))`；transfer 不计入 played-card set，不套用 play-only acting-hand overlap 规则，合法 transfer 链必须保持可用。
- `currentLastPlay` failure-field precision — **MINOR DIAGNOSTIC DEBT**. 错误输入仍须被拒绝、无 partial result、无隐藏牌泄漏且不影响合法牌局；映射到 `publicState.gameRank` 不再阻塞本轮，不重构 kernel 只为细化字段。
- Document SHA — **DOCUMENT CONSISTENCY CHECK ONLY**. 三份 canonical block 必须一致、marker 唯一、Markdown 结构合法；具体 SHA literal 不是 production 或 Task 4 acceptance blocker。
- Allowlist — allowlist 是允许修改的最大集合，不要求其中每个文件都发生变化。

## Transfer remediation boundary

本轮优先只允许修改 `src/ai/rollout/policy.ts` 和 `tests/ai/rollout/policy.test.ts`；只有 TypeScript 真实类型要求时才允许最小修改 `src/ai/rollout/contracts.ts`。除非发现正常合法 production 路径的实际功能错误，不修改 kernel、Room、decision engine、planning、ParticleBank internals、formal action path、package/lock/config 或 Task 5–9 文件。

RED/GREEN 必须使用真实 policy 入口和真实 public-event finalization/hash 流程覆盖：hash-valid foreign tribute、hash-valid foreign return、合法 canonical tribute/return、transfer 不进入 played-card duplicate accounting，以及接收者 hand 含 canonical transfer card 时不触发 acting-hand overlap。修复必须使用 canonical deck membership，保持 typed/no-throw/no-partial failure，不回显 foreign card ID，并在拒绝前不进入 CRN/policy downstream work。

## Required verification

先运行 `npx vitest run tests/ai/rollout/policy.test.ts --exclude "**/.worktrees/**" --reporter=verbose` 完成 RED/GREEN；随后运行 policy、kernel、privacy focused tests，Task 4 focused combined，Task 1–3 regression，Particle regression，冻结的 19-file/4-shard D2 gate，`npx tsc --noEmit`，`npm run build` 和 `git diff --check`。D2 gate 的最终计数必须为 `missing=0`, `duplicate=0`, `overlap=0`, `extra=0`, `failed=0`, `skipped=0`；Room shard 单独运行，不修改 timeout。已知旧默认并行 Room resource contention 不作为代码失败，最终以显式 shards 为准。

独立 reviewer 只检查正常合法牌局功能、game-rule/terminal/transition correctness、108-card conservation、seat-local privacy、CRN independence/determinism、state isolation、source-to-kernel integration、regression、tsc 和 build。hostile graph、diagnostic precision、SHA literal、未变化的 allowlist 文件和不可达分支只能记为 Minor/deferred hardening；新的 Important 必须能用正常 production 数据复现并说明真实影响、入口和现有测试为何未捕获。

## Documentation gate and commit

Phase 0 只修改本三份文档；检查 `git diff --check`、clean production/tests diff、三文档规则一致、无实现占位词、Markdown fences 成对且新 marker 唯一。文档 commit message 为 `docs(ai): adopt pragmatic D2F review standard`。代码通过全部必需验证后，代码 commit message 为 `fix(ai): validate D2F transfer card identities`。deferred gates 保留 `AWAITING_FIXED_BENCHMARK_RUNNER`、`AWAITING_NODE22_CI` 和 `Task 9 full permitted regression`；不得宣称 D2F Shadow release ready。

D2F_TASK4_PRAGMATIC_CLOSURE_BLOCK_END
