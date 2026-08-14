# D2F CRN Rollout Implementation Plan

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

Before timing, the runner executes one correctness run. The runner records an internal
elapsed duration around every completed synchronous invocation only for the completed-run
duration ceiling; correctness and warm-up durations never enter formal metrics. Every
correctness, warm-up, and measured run is checked after runDetachedRollout returns. A run is correct only when all of the
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

The formal measured interval excludes Node/module startup, fixture file reading, JSON parsing,
fixture schema validation, ParticleBank build and registration, correctness comparison,
console/JSON output, and correctness/warm-up runs. Correctness and warm-up elapsed durations
may be observed internally for the completed-run duration ceiling but are not samples,
metrics, or report values.

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
no completed correctness, warm-up, or measured run has duration greater than 60000 ms
no crash and no unhandled rejection
runner exit code is 0
~~~

60000 ms is a completed-run duration ceiling, not a product performance target. The runner
records duration around a completed synchronous runDetachedRollout invocation. If that
invocation returns and durationMs is greater than 60000, the runner fails with exit code 4
and emits no success report. A synchronous invocation that never returns is not converted to
an internal runner exit code; the outer CI, Codex, or shell job timeout terminates it. The
runner does not use worker threads, child processes, IPC, process termination, Promise.race,
or another pseudo-interrupt mechanism.

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
    kind: "completed-run-duration-ceiling";
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
4 = completed-run duration ceiling exceeded
~~~

The runner returns exit code 1 for argument/schema/read/parse failures; exit code 2 for
correctness oracle mismatch or rollout failure; exit code 3 for ParticleBank build failure,
request construction failure, incomplete measured execution, invalid metrics, crash, or
unhandled rejection; and exit code 4 when any completed correctness, warm-up, or measured
run exceeds 60000 ms. A non-returning synchronous invocation remains an outer job-timeout
case rather than an internal runner exit-code case.

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
completed-run duration ceiling allows exactly 60000 ms and rejects 60000 ms plus epsilon
completed-run duration ceiling failure exits with code 4 and emits no success report
median and p95 match literal statistical oracles
success JSON matches D2fBenchmarkReport
Node evidenceLevel is correct
invalid CLI argument exits non-zero
malformed fixture exits non-zero
correctness mismatch exits non-zero
completed-run duration ceiling exits non-zero
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
iterations, metrics, p95/median, completed-run duration ceiling, report, exit codes, evidence levels,
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

## 0. 执行纪律与全局 allowlist

每个 Task 独立执行以下循环：只读检查 -> 列出 allowlist/forbidden -> 写一个最小失败测试 -> 运行并记录正确失败 -> 最小实现 -> focused GREEN -> 相关回归 -> TypeScript/build/diff 检查 -> 隐私/确定性/不可变性/失败原子性审计 -> 单一 commit -> 阶段报告并停止等待人工审查。Task 1–8 的每个实现步骤都必须同时写明 exact file、exact interface/symbol、RED test、预期的缺失行为失败、最小实现、验证命令和 commit 边界；不能用模糊词替代这些字段。Task 9 是无实现的 verification-only 例外，必须写明其 manifest、命令、exit-code 证据和最终 release gate。

Task 1–6 的 production/test 路径只能位于：

~~~text
src/ai/particles/particleBankRolloutAccess.ts       # 仅 Task 1
src/ai/rollout/**
tests/ai/rollout/**
~~~

Task 7 的 exact code allowlist is:

~~~text
scripts/benchmarks/d2f-rollout-budget-calibration.ts
tests/fixtures/ai/d2f-public-rollout-fixture.json
tests/ai/rollout/d2fBenchmarkContract.test.ts
~~~

Task 8 exact implementation allowlist is:

~~~text
src/ai/contracts.ts
src/ai/aiDecisionEngine.ts
src/ai/rollout/contracts.ts
src/ai/rollout/d2fShadowObserver.ts
src/game/room.ts
tests/ai/rollout/d2fShadowObserver.test.ts
tests/ai/rollout/d2fShadowObserverIntegration.test.ts
tests/ai/rollout/d2fShadowByteLock.test.ts
~~~

The allowlisted files add only the evaluated-candidate projection, D2F mode/fallback/evidence contracts, detached observer factories, initial-ledger retention, construction-time Room mode, and one runAiStep integration boundary. Formal decideAiAction semantics and all Task 1–7 algorithms remain unchanged. Task 9 is verification only.

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
type D2FShadowMode = "disabled" | "enabled";

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

Task 3 的完整 branded CRN declarations、failure union、canonical tags、SHA-256
algorithm、known vectors 和 exact creation chain 见本计划第 4 节；本节不得再定义
`value(semanticKey: string)` 或未 branded 的 `CrnCoordinate` 别名。

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

`candidateId` 不得进入 random domain、tape、key、draw 或任何 keyed value；candidate 顺序、worker 完成顺序、对象地址、Map 插入顺序、`localeCompare` 和绝对数组位置也不得进入 identity。policy 只能调用 `CrnView.value(semanticKey: CanonicalSemanticKey)`，不存在共享 mutable `next()` cursor，keyed value 不能反向暴露 raw seed。相同语义随机事件在所有 candidate 间复用同一 domain/key；candidate-specific 且没有可比较对应物的事件仅在 event kind 来自稳定、candidate-free 的 public semantics 时使用 `unpaired:<event-kind>`，否则返回 typed failure。重复 semantic key 明确复用同一随机值，domain/key collision 必须由测试覆盖并区分有意复用和意外碰撞。

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

export type D2FShadowMode = "disabled" | "enabled";

export type D2FShadowFallbackReason =
  | "snapshot-failed"
  | "candidate-failed"
  | "particle-bank-failed"
  | "request-failed"
  | "scenario-source-failed"
  | "evidence-failed"
  | "simulation-failed"
  | "budget-exhausted"
  | "aggregation-failed"
  | "ranking-failed"
  | "result-assembly-failed"
  | "unexpected-failure";

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

## 2.1 Historical Task 1 Final Gate Remediation Design Freeze

本节保留上一轮 expected HEAD `5cd433d3e623e7e516effb36ab5bc080f5427d1a` 的历史计划，已被第 2.2 节 supersede。当前 code pass 的起始 HEAD 是 `f1944efc24e0404d057e86c16460bfd2a5e31794`；本轮只冻结文档，不修改 production/test；Task 2–9 不开始。

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

## 2.2 Task 1 Validation Consolidation Remediation Design Freeze

### Scope and starting proof

本节 supersede 历史第 2.1 节，是下一轮 code remediation 的唯一执行计划。设计起点必须是 `f1944efc24e0404d057e86c16460bfd2a5e31794`、branch `codex/d2f-crn-rollout-source`、clean worktree；本轮已经完成的动作只有三份文档冻结。下一轮不得从旧 `5cd433d3e623e7e516effb36ab5bc080f5427d1a` 推断代码状态，不得修改 Task 2–9。

五个已独立复核的 RED 根因是：`contracts.ts` 与 `particleBankRolloutAccess.ts` 重复维护 public metadata schema；request ESS domain 错把 `1e-9` equality tolerance 当作范围 tolerance；snapshot/ledger/seat/metadata numeric helper 接受 `-0`；bridge 未强制 accepted/requested/config count 与 sampling-attempt 上限；`createRolloutResult` 只检查 aggregate 内部和式而不检查 per-candidate `maximumWorkUnits` 及 candidate-count 总上限；现有 metadata boundary tests 主要手工构造 bank，缺少真实 builder multi-particle integration path。

### Frozen production shape and responsibilities

新增 `src/ai/particles/particleBankPublicValidation.ts`，只依赖 ParticleBank public types。唯一 helper 名称为 `validateParticleBankPublic(input: unknown)`，返回 typed success/failure；成功保留原始 handle identity，不读 WeakMap、不 clone、不 rebuild。`src/ai/rollout/contracts.ts` 和 `src/ai/particles/particleBankRolloutAccess.ts` 是唯一 consumers。shared validator 不得导入 internals、bridge、rollout、Room、decision engine、planning，也不得 public-barrel re-export。

`particleBankRolloutAccess.ts` 在 public success 后仍是唯一 `readParticleBankInternals` reader，负责 registration、private records、scenario/deal/transfer、weights/ESS consistency 和 frozen projection；`particleScenarioSource.ts` 仍是唯一 bridge consumer。request 只做 public acceptance/provenance/reference isolation；public-valid but unregistered handle 可通过 request，随后 source/bridge 返回 typed `fake-or-unknown-particle-bank`，无 partial scenario/private diagnostics。

统一 schema gate 为 descriptor-first：`Reflect.ownKeys` exact set、strict prototype、own data descriptor、no symbol/accessor/function、plain/frozen，所有 hostile callback/getter/proxy 计数为零。统一 numeric gate 为 `Number.isSafeInteger(value) && !Object.is(value, -0)`，非负字段再加 `value >= 0`；ESS domain 严格 `[1, N]`，只有 bank↔summary equality 使用 absolute error `<= 1e-9`。状态唯一为 `ESS < threshold => degraded`、`ESS == threshold => ready`、`ESS > threshold => ready`，bank、summary、helper 三者一致。

### Bite-sized RED → GREEN steps

每个 slice 都先新增真实入口测试并运行该 slice 的 RED command，记录旧代码的实际失败行为；随后只做该 slice 的最小 production change，再用同一 command GREEN。不得先改完所有 production 再补测试。

#### Slice A — shared public validator and boundary delegation

1. 修改 `tests/ai/rollout/particleBankRolloutBoundary.test.ts`，增加以下直接入口用例：
   - `rejects ESS just outside strict [1, N] without metadata tolerance`；输入真实 public bank 的 ESS `0.9999999995` 和 `N + 0.0000000005`，直接调用 `createRolloutRequest`，期望 typed invalid request；
   - `rejects noncanonical -0 across snapshot ledger seat and metadata`；每次只篡改一个真实字段，期望 typed invalid request，getter count 为零；
   - `preserves registered handle identity through request validation`；断言 request 中的 bank 与输入 `Object.is` 相等；
   - `accepts public-valid unregistered handle at request and defers failure to source bridge`；request 成功，随后 source 返回 typed `fake-or-unknown-particle-bank`，无 partial scenario。
2. RED command：

   ~~~text
   npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose -t "strict \[1, N\]|noncanonical -0|registered handle identity|unregistered handle"
   ~~~

   旧代码预期至少证明：ESS 近下界/上界被错误接受，`-0` 至少在一个真实字段被接受，或 bridge/request responsibility 与预期不一致；若某一已修复例不再 RED，保留该 GREEN regression 并只记录仍失败的例子。
3. 最小 production change：创建 `particleBankPublicValidation.ts`，将 contracts.ts 和 particleBankRolloutAccess.ts 的重复 public shape/numeric/status/count/ESS checks 委托给该 helper；不改变 internals、builder、scenario source 或 public ParticleBank schema。GREEN 使用同一 command，并新增 compiler API/symbol assertion：shared helper 无 internals import，bridge 是唯一 internals reader，source 是唯一 bridge consumer。

#### Slice B — canonical integers and bridge defense-in-depth

1. 在 `particleBankRolloutBoundary.test.ts` 增加 table-driven numeric matrix，覆盖 snapshot `lastAppliedEventIndex`、seat、config counts/limits、summary counts、top-level counts、samplingAttempts、duplicateCount、zeroWeightCount、workUnitCount：NaN、`+Infinity`、`-Infinity`、fractional、negative、`-0`、unsafe integer、overflow、合法 0、合法最大 safe integer；另加 `-1` ledger sentinel 和 seat `0` 正例。
2. 在同一文件直接构造真实 registered handle 的 malformed private projection，逐项覆盖 accepted `< requested`、accepted `> requested`、requested/config/top-level mismatch、attempts > max、duplicate/zero-weight bounds、status/failureReason 和 ESS mismatch；所有失败断言 typed/no-throw/no-partial。
3. RED command：

   ~~~text
   npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose -t "canonical integer matrix|bridge metadata invariants|samplingAttempts|failureReason"
   ~~~

   旧代码预期至少复现 bridge 接受 accepted count/config/max-attempts 矛盾和 `-0`，并复现公共 validator 与 bridge 对同一 metadata 给出不同结论。
4. 最小 production change：contracts.ts 与 bridge 使用同一 canonical integer predicates；bridge 在 public success 后补 private projection checks，但不读取 private records 的 request path、不创建 accessor/registry。GREEN 使用同一 command。

#### Slice C — ESS status and real builder integration

1. 修改 `tests/ai/particles/particleBankBuilder.test.ts`，直接调用真实 `buildParticleBank`，用 table-driven `<`、`==`、`>` cases；必须包含 `particleCount = 1`, normalized weights `[1]`, threshold `1`。每个 case 同时断言 helper status、summary.status、bank.status、accepted/requested/config counts、sampling/duplicate/zero-weight/ESS/failureReason invariants。此 slice 不允许修改 `particleBankBuilder.ts`；它只证明 f1944ef 的 builder 修复没有被 consolidation 破坏。
2. 增加真实 multi-particle chain：builder output → registered same handle → `createRolloutRequest` → `readParticleBankRolloutAccess` → `createParticleScenarioSource`，覆盖 ready 和 deterministic degraded output；禁止手工 public bank 作为该正例的 source。
3. RED command：

   ~~~text
   npx vitest run tests/ai/particles/particleBankBuilder.test.ts tests/ai/rollout/particleBankRolloutBoundary.test.ts tests/ai/rollout/particleScenarioSource.test.ts --exclude "**/.worktrees/**" --reporter=verbose -t "ESS status matrix|real multi-particle builder chain"
   ~~~

   旧测试预期缺少真实 multi-particle chain；若 equality case 或 status invariants 回归，则该 RED 必须保留为 blocker。只有 helper 本身缺少独立 exact-threshold regression 时才修改 `tests/ai/particles/effectiveSampleSize.test.ts`。
4. 最小 production change：本 slice 默认无 production change；若 RED 证明不一致，停止并报告，因为 builder 不在 consolidation allowlist。GREEN 使用同一 command。

#### Slice D — request/result provenance and aggregate ESS

1. 在 `tests/ai/rollout/particleBankRolloutBoundary.test.ts` 用真实 `createRolloutRequest`/`createRolloutResult` 构造至少两个 candidate、多个 accepted scenarios 和多个 replicates。增加用例：candidate A 使用 candidate B baseline、`+0/-0` baseline Object.is 区分、summary/aggregate repeat budget mismatch、scenario count 不是 validated bank accepted count、expected replicate product mismatch、aggregate ESS 在 `1e-9` 内通过且刚超 `1e-9`/NaN/Infinity 拒绝、foreign/missing/duplicate summary、ranking 重排合法、assembly 注入 budget/rootDigest/policyId/mode/formal flag 拒绝。
2. RED command：

   ~~~text
   npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose -t "baseline provenance|replicate budget|accepted scenario provenance|aggregate ESS|assembly provenance"
   ~~~

   旧代码预期至少允许 baseline 借用、repeat/scenario/ESS caller declaration 或 assembly provenance injection 中的一项；所有真实 request/result failures 必须 typed/no-throw/no-partial。
3. 最小 production change：contracts.ts 在 validated request 上重新绑定 baseline、replicate count、accepted scenario count、expected/completed/coverage product、aggregate ESS 和 candidate/ranking set；assembly 仍只允许 `candidateSummaries`、`ranking`、`aggregateDiagnostics` 三个字段，不新增 `expectedScenarioCount`、`completedScenarioCount`、`totalCompletedReplicates`。GREEN 使用同一 command。

#### Slice E — unique per-candidate work-unit bound

1. 在 `particleBankRolloutBoundary.test.ts` 固定唯一公式：`B = min(request.budget.maxWorkUnits, checkedProduct(replicates, maxPlies, maxPolicyActionEvaluations))`；每个 summary `workUnitCount <= B`，aggregate 是 summaries checked sum，且 `aggregate.workUnitCount <= checkedProduct(candidateCount, B)`。测试 under-budget、exact-budget、early completion 正例；summary over `B`、aggregate over `candidateCount * B`、aggregate sum mismatch、MAX_SAFE_INTEGER overflow、product overflow 负例。
2. RED command：

   ~~~text
   npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose -t "per-candidate work-unit budget|early completion|work-unit overflow"
   ~~~

   旧代码预期接受合法 request 下的 `Number.MAX_SAFE_INTEGER` summary/aggregate workUnitCount，只要 assembly 内部和式相等。
3. 最小 production change：contracts.ts 对每个 summary 绑定 per-candidate `B`，对 aggregate 使用 checked sum 与 checked `candidateCount * B` 上限；所有算术先验证 finite safe integer，不添加重复字段，不由 assembly 改写预算。GREEN 使用同一 command。

#### Slice F — static boundary gate and focused verification

1. 在 `tests/ai/rollout/particleBankRolloutBoundary.test.ts` 加入 Compiler API/symbol gate，解析当前 TypeScript program 并精确断言：`particleBankPublicValidation.ts` 无 internals/bridge import；contracts.ts 和 bridge 各自只导入 shared validator；只有 bridge 绑定 `readParticleBankInternals`；source 只导入 bridge；没有 public barrel/export、registration accessor、brand token、global registry。
2. RED command：

   ~~~text
   npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose -t "shared validator import graph"
   ~~~

   旧代码预期因 shared validator 文件或统一 consumer graph 不存在而失败；GREEN 必须同时证明行为和 import graph，不得只 grep 文本。
3. 下一轮 code pass 的最终命令顺序：

   ~~~text
   npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose
   npx vitest run tests/ai/rollout/particleScenarioSource.test.ts --exclude "**/.worktrees/**" --reporter=verbose
   npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts tests/ai/rollout/particleScenarioSource.test.ts --exclude "**/.worktrees/**" --reporter=dot
   npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
   npx tsc --noEmit
   npm run build
   git diff --check
   git status --short
   ~~~

   本轮 docs-only 不运行上述命令。下一轮必须以 RED/GREEN、test count、changed paths 和 clean status 记录证据；D2 audited shards、fixed benchmark runner、Node 22 CI、Task 9 full permitted regression 继续 deferred，不得宣称 Shadow release ready。

本轮文档 gate 全部通过后，只允许执行一次 `git commit -m "docs(ai): freeze Task 1 validation consolidation"`；不得 amend、squash、reset、stash、checkout、rebase 或混入任何 code/test/config 变更。提交后保持 clean 并停止，等待 review。

### Exact next code allowlist

下一轮只能修改以下路径；本轮三份文档冻结 commit 不得混入其中任何 code/test 修改：

~~~text
src/ai/particles/particleBankPublicValidation.ts
src/ai/particles/particleBankRolloutAccess.ts
src/ai/rollout/contracts.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/effectiveSampleSize.test.ts        # only when the helper exact-threshold assertion is absent
~~~

始终 forbidden：`src/ai/particles/particleBankInternals.ts`、`src/ai/rollout/particleScenarioSource.ts`、`src/game/room.ts`、`src/ai/aiDecisionEngine.ts`、`src/ai/planning/**`、其他 particles internals、任何 public barrel、package/lock/config、Task 2–9。任何需要扩大 allowlist 的事实必须先停止并报告，不能自行扩大。

## 3. Task 2 — Team Utility / terminal truth table / leaf

### Scope

允许创建/修改：

~~~text
src/ai/rollout/contracts.ts
src/ai/rollout/teamUtility.ts
src/ai/rollout/leafEvaluation.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/rollout/leafEvaluation.test.ts
~~~

`contracts.ts` 的 Task 2 修改仅新增 `TeamUtilityInput`、`LeafEvaluationInput` 并扩展本计划冻结的 `TeamUtilityFailure`/`LeafEvaluationFailure` discriminated union；不得改变任何 Task 1 字段、factory、validation 或 result 行为。

真实类型来源与依赖方向：`PublicSeat` 从 `src/game/publicEvent.ts` 导入，且严格为 `0 | 1 | 2 | 3`；`RolloutPublicState.actingSeat` 是 public current acting/turn seat，`src/game/publicLedger.ts` 的 `currentTrick` 记录 `leadSeat`、可选 `lastPlaySeat`/stable key 与 `passSeats`，contracts 的 public-event projection 负责推导 acting seat。`RolloutPublicState.handCounts` 与 contracts 的 canonical hand-count representation 都是 `Readonly<Record<PublicSeat, number>>`，四个 key 的顺序语义为 seat `0, 1, 2, 3`；`src/game/publicLedger.ts` 的私有 `HandCounts` 使用相同结构但不是 Task 2 API。`src/game/settlement.ts` 的 `teamOf` 与 `partnerSeat` 是私有且使用 `room.ts` 的 `Seat`，不能安全 import，因此 `teamUtility.ts` 必须本地实现 `seat % 2` 和 `partner = (seat + 2) % 4` 这两个已冻结公式，不修改 settlement production。

生产依赖方向固定为：

~~~text
contracts.ts
    ↑
teamUtility.ts
    ↑
leafEvaluation.ts
~~~

`leafEvaluation.ts` 必须调用 `evaluateTeamUtility`，不得复制 truth table；两个函数均为同步、确定性、无副作用纯函数。禁止传入整个 rollout/kernel context、位置参数串、动态 evaluator registry、caller evaluator、callback、factory、policy、RNG、Room、ParticleBank、scenario、replay state、对手具体手牌或 mutable context。

### Frozen callable interface

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

该声明表示两个文件的 named export；`contracts.ts` 只承载两个 shared input type，`teamUtility.ts` 承载 `evaluateTeamUtility`，`leafEvaluation.ts` 承载 `evaluateNonTerminalLeaf`。函数不得修改 caller-owned arrays/records；success/failure graph 与 `predictedFinishOrder` 必须满足现有不可变契约。

### Team Utility input and failure contract

`perspectiveSeat` 必须是 canonical `PublicSeat`。`finishOrder` 必须包含四个座位，顺序表示第 1 名至第 4 名，每个座位恰好一次；数组不可修改。视角队伍是 `perspectiveSeat` 与 `((perspectiveSeat + 2) % 4) as PublicSeat`，用两个 1-based finish positions 的升序 pair 查固定表。对手队伍 utility 取反，搭档视角相同；只允许 `-3 | -2 | -1 | 1 | 2 | 3`，绝不产生 zero、额外奖励、权重或 rounding。

Team Utility 的失败映射固定为：

| invalid input | exact failure |
| --- | --- |
| `perspectiveSeat` 为越界/非数值 | `{ kind: "invalid-perspective-seat", reason: "unknown-seat" }` |
| `perspectiveSeat` 为 fractional / unsafe integer / `-0` | 同一 kind，分别使用 `fractional-seat` / `unsafe-integer-seat` / `negative-zero-seat` |
| finish order 含 duplicate | `{ kind: "invalid-finish-order", reason: "duplicate-seat" }` |
| finish order 缺 seat 或长度不是 4 且不能形成完整四座位 order | `{ kind: "invalid-finish-order", reason: "missing-seat" }` |
| finish order 含越界、非数值、fractional、unsafe integer 或 `-0` | `{ kind: "invalid-finish-order", reason: "unknown-seat" }` |
| canonical seat pair 无法映射到项目两队 | `{ kind: "unsupported-team-pair", teamSeats }` |

`unsupported-team-pair` 在四座位 parity 规则下应不可达，但保留为现有 typed union 分支；不得用 throw 或模糊字符串替代。

### Non-terminal leaf input and fixed algorithm

Stable leaf evaluation state 表示：当前 action 已完整应用；action 产生的 hand-count 变化已应用；如果某座位手牌归零，对应 finish-order 更新已经完成；current acting/turn seat 已推进到合法的未完成座位；play、finish、trick-clear、turn advance 等相关状态更新不存在待处理的中间步骤；leaf evaluation 不允许在上述处理过程的中间调用。游戏/rollout 提前终局是合法 leaf 输入语义；事件处理到一半的 transient state 不是 leaf evaluation 输入。

`finishOrder` 是 stable state 中真实完成顺序的有序前缀，长度严格为 `0 | 1 | 2 | 3`；长度 4 是 terminal input，不能被错误当作 non-terminal leaf。前缀座位必须 canonical 且唯一。`actingSeat` 必须 canonical 且不在完成前缀中；该窄接口没有 current trick/history，因此 acting seat 与 public ledger 的当前 turn 一致性由 caller 以 stable-state precondition 保证，函数不读取或猜测隐藏上下文。`perspectiveSeat` 可以已完成或未完成。

`handCounts` 必须覆盖四个 canonical seat key，类型为 `Readonly<Record<PublicSeat, number>>`，其顺序语义为 seat `0, 1, 2, 3`；每个 count 必须 finite、nonnegative、safe integer，并拒绝 `-0`。稳定状态不变量严格为：`seat ∈ finishOrder → handCounts[seat] === 0`；`seat ∉ finishOrder → handCounts[seat] > 0`。因此 unfinished seat 为 0 必须返回 `{ kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" }`，不得通过 ledger、recent event、pending flag 或推测放行。`actingSeat` 必须不在 `finishOrder` 且 `handCounts[actingSeat] > 0`。

固定算法：

1. 复制真实 finish-order 前缀；
2. 收集所有尚未完成座位；
3. 按 `handCounts[seat]` 升序排列；
4. 相同 hand count 按 `clockwiseDistance = (seat - actingSeat + 4) % 4` 升序排列；
5. 将排序结果追加到前缀，得到完整 `predictedFinishOrder`；
6. 调用同一 `evaluateTeamUtility` truth table；
7. 返回不可变 `predictedFinishOrder` 与 utility。

该 tie-break 只使用相对 acting seat 的环距离，不使用绝对 seat number 作为独立排序依据。禁止 Card identity、current trick strength、hidden assignment、Particle weight、policy score、baseline evaluator score、随机数、wall clock、rounding、搭档奖励和 Task 3 CRN。

Leaf failure 映射固定为：

| invalid input | exact failure |
| --- | --- |
| `perspectiveSeat` 非 canonical | `{ kind: "invalid-perspective-seat", reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }` |
| `actingSeat` 非 canonical | `{ kind: "invalid-acting-seat", reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }` |
| `actingSeat` 已在 finish prefix | `{ kind: "invalid-acting-seat", reason: "finished-seat" }` |
| finish prefix duplicate | `{ kind: "invalid-leaf-state", reason: "duplicate-finish" }` |
| finish prefix 含非 canonical seat | `{ kind: "invalid-leaf-state", reason: "unknown-seat" }` |
| finishOrder 长度为 4 | `{ kind: "invalid-leaf-state", reason: "terminal-state" }` |
| handCounts 缺少 seat key | `{ kind: "invalid-leaf-state", reason: "missing-hand-count" }` |
| handCounts 含额外/未知 seat key | `{ kind: "invalid-leaf-state", reason: "unknown-hand-count" }` |
| hand count 为 negative | `{ kind: "invalid-leaf-state", reason: "negative-hand-count" }` |
| hand count 为 NaN/Infinity | `{ kind: "invalid-leaf-state", reason: "non-finite-hand-count" }` |
| hand count 为 fractional / unsafe integer / `-0` | 分别为 `fractional-hand-count` / `unsafe-hand-count` / `negative-zero-hand-count` |
| 已完成 seat 的 hand count 非 0 | `{ kind: "invalid-leaf-state", reason: "finish-hand-count-mismatch" }` |
| `actingSeat` 的 hand count 为 0 | `{ kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" }` |
| 未完成 seat 的 hand count 为 0 | `{ kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" }` |

### TDD actions

- [ ] 先在 `tests/ai/rollout/teamUtility.test.ts` 通过真实 named export 写出 six-value literal oracle；不得复制 production lookup 作为 expected。
- [ ] RED：`npx vitest run tests/ai/rollout/teamUtility.test.ts --exclude "**/.worktrees/**" --reporter=verbose`；预期只因 `teamUtility.ts`/`evaluateTeamUtility` 尚不存在而失败，不得是 import、fixture 或语法错误。
- [ ] 使用真实调用验证：

  ~~~ts
  const result = evaluateTeamUtility({
    perspectiveSeat: 0,
    finishOrder: [0, 2, 1, 3],
  });
  ~~~

  预期 `result.ok === true` 且 `result.utility === 3`。
- [ ] 覆盖 perspective invalid、六项 truth table、duplicate/missing/unknown finish seat、对手视角取反、搭档互换、整体 seat/team rotation、无 zero、输入不可变和重复调用 byte-stable。
- [ ] 在 `tests/ai/rollout/leafEvaluation.test.ts` 通过真实 named export 写出 independent known vectors；不得复制 production sort 作为 expected。
- [ ] RED：`npx vitest run tests/ai/rollout/leafEvaluation.test.ts --exclude "**/.worktrees/**" --reporter=verbose`；预期只因 `leafEvaluation.ts`/`evaluateNonTerminalLeaf` 尚不存在而失败。
- [ ] 使用真实 canonical hand-count representation 的示例：

  ~~~ts
  const result = evaluateNonTerminalLeaf({
    perspectiveSeat: 0,
    actingSeat: 1,
    finishOrder: [],
    handCounts: { 0: 3, 1: 2, 2: 1, 3: 4 },
  });
  ~~~

  预期 `result.ok === true`、`result.predictedFinishOrder` 为 `[2, 1, 0, 3]`、`result.utility === 2`。
- [ ] Leaf 合法状态必须覆盖：`finishOrder=[]` 且四个 hand count 均大于 0；长度为 1、2、3 且前缀内 seat count 为 0；所有未完成 seat count 均大于 0；`actingSeat` 未完成且 count 大于 0；已完成和未完成两种 `perspectiveSeat`；相同 hand count 按相对 `actingSeat` 距离排序；seat rotation 保持 utility 和相对排序。
- [ ] Leaf 非法状态必须覆盖：已完成 seat count 大于 0、未完成 seat count 等于 0、`actingSeat` 已完成、`actingSeat` count 为 0、长度为 4、duplicate/unknown seat、unknown hand-count key、missing hand-count key，以及 negative/fractional/NaN/Infinity/unsafe integer/`-0`；每项断言上表中的精确 failure reason。
- [ ] 不得把事件处理过程中的零手牌状态判为 success；旋转只作为成功路径的 metamorphic/property test，不作为 failure 分支。测试必须调用真实 production API，不得使用 mock、skip、only 或 test-placeholder marker。
- [ ] 最小实现只包含 parity team helper、finish validation、hand-count validation、relative-distance projection、对 `evaluateTeamUtility` 的一次调用；禁止经验系数和额外搭档奖励。
- [ ] GREEN focused：两个 Task 2 test 文件全部通过；回归只执行 Task 1 contracts 相关测试，不能提前进入 Task 3。
- [ ] 本轮文档冻结提交前不运行 Vitest、tsc、build 或 benchmark；production implementation 轮次才执行对应 GREEN/compile/build gates。
- [ ] 使用 git commit -m "feat(ai): add D2F team utility and leaf evaluation"；该 commit 属于下一轮 production Task 2，不是本轮 docs-only commit。

### Produces / consumes

Produces `TeamUtilityInput`、`LeafEvaluationInput`、`TeamUtilityResult`、`LeafEvaluationResult` and the two named pure functions. Consumes only canonical `PublicSeat`, finish-order prefix/full order, and `Readonly<Record<PublicSeat, number>>`; it does not read `RolloutRequest`, `RolloutPublicState` as a whole, Room, hidden hands, ParticleBank, scenario, replay state, policy or random state.

## 4. Task 3 — keyed CRN identity and replay

### Scope and exact declarations

允许创建/修改：

~~~text
src/ai/rollout/crn.ts
src/ai/rollout/identity.ts
src/ai/rollout/contracts.ts       # only the exact CRN type narrowing below
tests/ai/rollout/particleBankRolloutBoundary.test.ts  # only the existing Compiler API Gate remediation
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
~~~

`contracts.ts` 的最小修订只新增/收窄 `CanonicalRandomDomainLabel`、
`CanonicalRandomDomain`、`CanonicalSemanticKey`、validated `CrnCoordinate` 和
`CrnView.value` 的 branded 类型；不得改变 Task 1、Task 2 的字段、factory、validator、
failure behavior 或 public result behavior。不得修改 teamUtility、leafEvaluation、Particle、
Room、planning、package、lock 或 config。

三份 D2F 文档必须使用以下完全一致、可编译的 declarations：

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

### CrnCoordinate brand and runtime shape compatibility freeze

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

~~~text
rootIdentity
scenarioIdentity
replicateIdentity
ply
actingSeat
randomDomain
~~~

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

The only creation chain is:

~~~text
raw domain label -> createCanonicalRandomDomainLabel -> CanonicalRandomDomainLabel
raw semantic key -> createCanonicalSemanticKey/createUnpairedSemanticKey -> CanonicalSemanticKey
unknown coordinate envelope -> createCrnCoordinate -> CrnCoordinate
CrnCoordinate -> deriveRandomDomain -> CanonicalRandomDomain -> createCrnView({ coordinate, randomDomain })
  -> CrnView.value(CanonicalSemanticKey)
~~~

Factories return typed failure and never throw. `CrnView.value()` is synchronous, takes only a
branded key, returns a finite number in `[0,1)`, retains no caller object and has no mutable
counter, `next()`, cursor, tape, seed or digest/bytes diagnostics.

### Canonical domain/key grammar and failure mapping

`createCanonicalRandomDomainLabel` accepts a primitive string of 1..128 ASCII bytes, each in
`0x21..0x7e`; `createCanonicalSemanticKey` accepts 1..256 bytes under the same rule. This rejects
whitespace, controls, NUL, Unicode, surrogate/normalization-dependent input and leading/trailing
spaces. The only unpaired key is `unpaired:<event-kind>`, with `<event-kind>` matching
`[a-z0-9]+(?:-[a-z0-9]+)*`; it is non-empty, candidate-free and within the semantic-key limit.
`createUnpairedSemanticKey` constructs exactly that form and rejects empty, uppercase, whitespace,
underscore, slash, colon, random suffix, counter, object address, candidate id and candidate position.
Paired events reuse the same domain/key; an unpaired event uses `unpaired:<event-kind>` only when
the event kind comes from stable candidate-free public semantics, otherwise it returns the frozen
typed failure and does not draw a private value.

Missing/extra/symbol/accessor/function/cyclic/sparse/custom-prototype coordinate envelopes return
`malformed-coordinate-envelope` with the exact failing field. Invalid 64-lowercase-hex values map
to their corresponding identity failure; invalid `ply` maps to `invalid-decision-identity`; invalid
seat maps to `invalid-acting-seat`; label/key grammar maps to the corresponding invalid label/key;
unpaired grammar maps to `invalid-unpaired-event-key`; TLV errors map to
`canonical-encoding-failure`; arithmetic overflow/range maps to `arithmetic-range-failure`;
candidate data maps to `candidate-identity-contamination`. No partial coordinate, domain, key, view
or value is returned, and no failure contains root material, scenario, candidate, raw bytes, digest,
seed, tape or cursor.

### Canonical encoding v1 and SHA-256

The existing `sha256Bytes(input: Uint8Array): string` from `src/game/publicEventHash.ts` is reused.
It is synchronous, pure TypeScript, browser-compatible FIPS 180-4 SHA-256, accepts bytes and returns
exactly 64 lowercase hex characters representing a fixed 32-byte digest. `identity.ts` hex-decodes
that public result when raw digest bytes are required. No `node:crypto`, `crypto`, Web Crypto async
API, third-party dependency or Particle production export is allowed. The existing private
`CanonicalWriter` is not reused; `identity.ts` owns a private `CanonicalByteWriter` that only writes
tag/length/payload TLVs and never enumerates objects.

Every field is `tag: 1 byte unsigned + length: 4 bytes unsigned big-endian + payload: exactly length
bytes`. Tags are unique within each phase. Bare concatenation, delimiter-only concatenation,
`JSON.stringify`, object/Map enumeration, locale encoding and decimal-string integer encoding are
forbidden.

Phase 1 is:

~~~text
ASCII("D2F-CRN-DOMAIN-V1") + 0x00
+ TLV(0x01, rootIdentity as 32 raw bytes)
+ TLV(0x02, scenarioIdentity as 32 raw bytes)
+ TLV(0x03, replicateIdentity as 32 raw bytes)
+ TLV(0x04, ply as 8-byte unsigned big-endian)
+ TLV(0x05, actingSeat as one byte 0x00..0x03)
+ TLV(0x06, random-domain label as validated ASCII bytes)
~~~

The coordinate order is exactly:

| order | tag | field | payload |
| ---: | ---: | --- | --- |
| 1 | `0x01` | `rootIdentity` | 64 lowercase hex -> 32 raw bytes |
| 2 | `0x02` | `scenarioIdentity` | 64 lowercase hex -> 32 raw bytes |
| 3 | `0x03` | `replicateIdentity` | 64 lowercase hex -> 32 raw bytes |
| 4 | `0x04` | `ply` | safe nonnegative integer -> 8-byte unsigned big-endian |
| 5 | `0x05` | `actingSeat` | `PublicSeat` -> one byte `0x00..0x03` |
| 6 | `0x06` | `randomDomain` label | validated ASCII bytes |

`deriveRandomDomain` returns `sha256Bytes(canonicalCrnDomainBytes(coordinate))` as the
64-lowercase-hex `CanonicalRandomDomain` digest. Phase 2 is:

~~~text
ASCII("D2F-CRN-VALUE-V1") + 0x00
+ TLV(0x01, domain digest as 32 raw bytes)
+ TLV(0x02, semantic key as validated ASCII bytes)
~~~

The value digest is `sha256Bytes(canonicalCrnValueBytes(randomDomain, semanticKey))`. For its
normalized value, take the first 8 digest bytes as unsigned big-endian `uint64`, compute
`u53 = uint64 >> 11`, and return `Number(u53) / 9007199254740992`. BigInt is permitted only for
exact uint64 conversion and shift; no low 53 bits, rounding, epsilon, decimal-string conversion or
path producing `1` is allowed. The result is finite and satisfies `0 <= value < 1`.

`PublicSeat` is canonical game identity, not a candidate-array position; no relative seat formula is
used for CRN. Candidate id and candidate-local association identity never enter the coordinate,
domain label, semantic key, canonical bytes, domain digest, value digest, view state or value
calculation. The AST/symbol gate checks `candidateId`, `CanonicalCandidateDecisionAssociationIdentity`
and `canonicalCandidateDecisionAssociationIdentity` dependencies rather than comment text.

### Frozen known vectors

These literals were generated by an independent Node `crypto.createHash("sha256")` oracle and are
documentation-only. Both use:

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
domain bytes = 4432462d43524e2d444f4d41494e2d563100010000002000112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0200000020ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110003000000200123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef040000000800000000000000070500000001020600000010706f6c6963792d616374696f6e2d7631
domain digest = c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15
value bytes = 4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15020000001e706f6c6963792d616374696f6e3a706c61793a73696e676c653a48372d31
value digest = 0351802e83a610421ad1681cb92d729197bc31765b11cf72d85d25d10eabf3b8
first 8 bytes = 0351802e83a61042
u53 = 116754488521922
number = 0.012962352138537137
~~~

Unpaired `unpaired:public-pass`:

~~~text
domain bytes = 4432462d43524e2d444f4d41494e2d563100010000002000112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0200000020ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110003000000200123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef040000000800000000000000070500000001020600000010706f6c6963792d616374696f6e2d7631
domain digest = c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15
value bytes = 4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf150200000014756e7061697265643a7075626c69632d70617373
value digest = 2a564ad3f684e2f5ca38184d2aa0e71bc2157e2658e3429719d2e190c2747283
first 8 bytes = 2a564ad3f684e2f5
u53 = 1489603550695580
number = 0.16537921595456195
~~~

Boundary vectors must assert bytes, not hash uniqueness:

~~~text
("ab", "c")   = 4432462d43524e2d56414c55452d56310001000000203d1571b8edbf823789c3bb440b98388d2448cb8b15b56025a8ba2d04e4d25e96020000000163
("a", "bc")   = 4432462d43524e2d56414c55452d56310001000000209c5bc616973ab50bb7ae1ea133dc9333e41d916c2bad2f1ee1fa54d4ff9f389f02000000026263
("x", "y:z")   = 4432462d43524e2d56414c55452d56310001000000207ccad33be63bbbe2df49bf4529a7ff06a1288a1debaeafca4dee1aa083f364cb0200000003793a7a
("x:y", "z")   = 4432462d43524e2d56414c55452d5631000100000020f65c7cf19deccc6adbaee964af36d06eb9dcbc08dad9a6621314fb385f4ed5d302000000017a
~~~

### TDD actions and gates

- [ ] RED `crnIdentity.test.ts`: known domain/value bytes, SHA-256 digests and high-53 literals fail only because the new identity exports/behavior are absent.
- [ ] RED `crnInvariance.test.ts`: repeated key, A→B→A, reverse call order, equivalent views, candidate/scenario/worker completion order, replicate variation, unpaired grammar and hostile-input typed failures fail only because CRN behavior is absent.
- [ ] GREEN with the same two exact commands:

  ~~~text
  npx vitest run tests/ai/rollout/crnIdentity.test.ts tests/ai/rollout/crnInvariance.test.ts --exclude "**/.worktrees/**" --reporter=verbose
  ~~~

- [ ] Cover paired events, candidate-free pairing, legal `unpaired:<event-kind>`, candidateId structural exclusion, no shared cursor/tape/seed, no throw/no partial/no secret diagnostics, TLV tuple boundaries and branded-key call sites.
- [ ] Add Compiler API/symbol gate for the real candidate association symbols; text-only scans are insufficient.
- [ ] Confirm no `Math.random`, wall clock, worker id, object address, Map insertion order, `localeCompare`, candidate order or candidateId enters CRN dependency graph.
- [ ] Confirm focused command has no `skip`, `only` or test-placeholder marker; no production or tests are created in this docs-only freeze.
- [ ] Task 3 code implementation remains pending; Task 4–9 remain not started.

### Produces / consumes

The future Task 3 implementation produces the branded CRN factories, candidate-free coordinate,
canonical TLV bytes, SHA-256 domain digest and stateless keyed view. It consumes only validated
root/scenario/replicate/ply/seat/domain coordinates and branded semantic keys.

## Historical Task 4 pre-remediation plan — superseded by the current freeze at the end of this document

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

Task 4 rollout kernel MUST NOT call `evaluateNonTerminalLeaf` until the simulated action and every derived finish/trick/turn update have been applied atomically to the isolated rollout state. Frozen call order：应用模拟动作 → 更新手牌数 → 更新 `finishOrder` → 处理 trick/turn 变化 → 验证 stable leaf evaluation state → 调用 `evaluateNonTerminalLeaf`。Task 2 leaf 不接收 public ledger、recent events、pending finish seat、Room、replay state 或 raw scenario；本段只是 Task 4 的后续接口前置条件，本轮不实现 kernel。

### TDD actions

Task 4 的 isolated private rollout boundary 统一冻结为：

~~~text
particleBankInternals.ts
  -> particleBankRolloutAccess.ts
  -> particleScenarioSource.ts
  -> kernel.ts isolated state
  -> seat-local observation
  -> policy.ts
~~~

职责固定如下：`particleBankRolloutAccess.ts` 是唯一 ParticleBank internals reader，不进入 public barrel，验证 private records/scenario/weights/ESS 并返回隔离 projection；`particleScenarioSource.ts` 是唯一 private bridge caller，完成 private replay 与 public consistency 二次验证并产生冻结、隔离的 `RolloutScenario`；`kernel.ts` 只能消费 source 已产生的 `RolloutScenario`、`RolloutReplicateInput` 和 isolated `privateState`，不得导入 bridge/internals、读取 ParticleBank handle/WeakMap/raw records、把 private state 传给 policy/diagnostics，且必须先 clone/isolate 再模拟；`policy.ts` 不得获得 `RolloutScenario`、`privateState` 或四座位完整 hands，只能获得当前 acting seat 的 `SeatLocalObservation`、`RolloutPolicyDecisionContext` 和 `CrnView`，不得导入 kernel、particles、Room 或 planning private state。

`tests/ai/rollout/particleBankRolloutBoundary.test.ts` 是本轮新增且仅新增的既有 Gate 修改文件。Gate 使用 TypeScript Compiler API 与 resolved symbols，精确允许 production contract symbol 出现在 `src/ai/rollout/contracts.ts`（声明）、`src/ai/rollout/particleScenarioSource.ts`（producer）和 `src/ai/rollout/kernel.ts`（isolated consumer）；Gate 文件不是 production consumer。consumer allowlist 必须是 exact set，不得用“rollout 目录全部允许”、basename 模糊匹配或文本 grep。Gate 必须继续证明 internals reader/bridge caller 唯一、kernel 只能消费 source 产生的 isolated contract、policy 不能获取 private contract、无 re-export/public barrel 泄漏，并保留 Task 1 的全部既有断言。
因此 `policy.ts`、`stateConservation.ts`、`aggregation.ts`、`evaluation.ts`、`shadowObserver.ts`、`Room`、`planning` 和 public barrel 均不得直接消费 private scenario 或 isolated private contract；它们不在 exact consumer set。

历史 pre-remediation allowlist（当前冻结已替换）为：

~~~text
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
src/ai/rollout/stateConservation.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

旧 rescue-only 路径 `src/ai/rollout/rolloutPolicy.ts`、`src/ai/rollout/rolloutKernel.ts`、`tests/ai/rollout/rolloutKernel.test.ts` 和 `tests/ai/rollout/rolloutPolicyPrivacy.test.ts` 只可作为历史禁止说明，禁止恢复到正式 source 链。

历史记录保留 exhaustive literal policy 与 candidate-free CRN 结论；当时的 ply 顺序和测试范围已由文档末尾 current freeze 取代。

Task 4 的 RED/GREEN 必须覆盖 private boundary、policy factory、CRN ownership、privacy 和 state conservation；private boundary RED 可以由正式 `kernel.ts` 尚不存在或尚未被 exact Gate 识别触发，但不得把模块缺失作为全部行为 RED。policy factory 必须证明旧 `createFixedRolloutPolicy()` 不满足接口；CRN RED 必须用两个 ply 或不同 acting seat 揭示固定 view 的错误配对；privacy RED 必须拒绝 opponent hand、full hands、privateState、raw scenario、callback/factory/registry；state conservation RED 必须包含真实 duplicate/missing card、hand-count mismatch 和 finish mismatch。GREEN 保留所有既有 Task 1 Gate 断言。本轮 docs-only，不实施 Task 4 production 或 tests，Task 5–9 不提前开始。

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

## 8. Task 7 — benchmark interface and threshold freeze

Task 7 code is pending. The prior calibration-only wording is superseded by the active
`D2F_TASK7_BENCHMARK_INTERFACE_THRESHOLD_FREEZE_REPORT` block at the end of this document.
The next implementation turn may change only the three exact allowlisted paths in that block;
the fixture path is part of the allowlist. The fixed runner, fixture schema, correctness oracle,
statistics, report, exit codes, focused test, and RED/GREEN order are not configurable alternatives.

## 9. Task 8 — real Shadow observer and non-interference

### 9.1 Mode owner and lifecycle

Task 8 freezes one internal construction-time mode:

~~~ts
type D2FShadowMode = "disabled" | "enabled";
~~~

Room owns d2fShadowMode. It is selected only while constructing a new room and defaults to "disabled". CommonRoomCreationInput and CanonicalRoomCreationInput may carry d2fShadowMode?: D2FShadowMode for internal construction; createRoomInternal normalizes an omitted value to "disabled", and createLegacyBenchmarkRoom remains disabled. The HTTP/request body, public room projection, public event stream, replay envelope, and formal AI decision API do not accept or expose it.

The private Room lifecycle fields are:

~~~ts
readonly d2fShadowMode: D2FShadowMode;
initialPublicLedger: HardPublicLedger | null;
d2fShadowEvidence: D2FShadowEvidence | null;
d2fShadowRunning: boolean;
~~~

A canonical room retains initialPublicLedger immediately after createInitialPublicLedger and before anti-tribute or any later public event. publicLedger and publicEvents remain the current finalized state. getPublicRoom and all public/replay serializers omit these four fields. A new room starts with evidence null and running false, which is the reset boundary.

Disabled is the byte-lock baseline: it creates no D2F snapshot, particle bank, request, evidence, or timing. Enabled is diagnostic-only and may create one detached snapshot, one public ParticleBank handle, and one synchronous shadow result for one eligible AI decision. It never returns data to formal selection or sets formalExecutionAllowed to true. No callback, external sink, global registry, queue, worker, Promise, timer, retry, or room-wide cache is allowed.

### 9.2 Formal result projection and synchronous order

The formal decision contract adds only this detached projection:

~~~ts
type AiEvaluatedCandidate = Readonly<{
  candidate: ActionCandidate;
  score: ActionScore;
}>;
~~~

AiDecision adds evaluatedCandidates: readonly AiEvaluatedCandidate[]. aiDecisionEngine.ts exposes already-computed candidate/score pairs only; action generation, evaluator arithmetic, sorting, tie-breaks, selected action, runtime, plan selection, and formal diagnostics semantics are unchanged.

For an enabled eligible turn, runAiStep uses this exact synchronous order:

~~~text
decideAiAction
  -> save formal action, selected candidate, runtime and plan result
  -> create one detached pre-action snapshot
  -> build one ParticleBank from that snapshot
  -> call runDetachedRollout exactly once
  -> convert the result to frozen D2FShadowEvidence
  -> apply the saved formal pass/play action
  -> publish the saved runtime/plan update and return
~~~

No asynchronous scheduling or second Room read is allowed. elapsedWallClockMs is telemetry only and cannot affect identity, CRN, budget stop conditions, ranking, action selection, replay bytes, or formal results. Any shadow failure still applies the saved formal action exactly once.

### 9.3 Eligible decision and exactly-once boundary

D2F is eligible only at runAiStep when d2fShadowMode is "enabled", the room is playing, opening tribute is not pending, the current seat is an AI seat, formal decision completed normally, canonical public identity/initial ledger/current ledger/finalized event prefix exist, evaluatedCandidates is non-empty and valid, the selected action matches exactly one candidate, and the acting seat has valid own hand and public-state data.

Human turns, finished rooms, opening-tribute steps, missing or inconsistent public state, replay/spectator rooms without canonical source fields, decision exceptions, empty or malformed candidates, and re-entrant calls are ineligible and invoke no shadow factory or rollout.

For one eligible call, runDetachedRollout is called exactly once and every other D2F stage is at most once. d2fShadowRunning is set before capture and restored in finally; a re-entrant call observes the guard and does not recurse. Exactly-once is local to the current Room call, never a global counter or registry.

### 9.4 Exact snapshot and detached factories

Production uses this fixed Task 7 configuration:

~~~ts
type D2FShadowParticleBankConfig = Readonly<{
  schemaVersion: "d2-particle-bank-build-input-v1";
  particleCount: 1;
  maxSamplingAttempts: 1;
  maxIndexDraws: 1;
  samplerConfigVersion: "d2-particle-sampler-v1";
  likelihoodConfig: Readonly<{
    schemaVersion: "d2-particle-likelihood-v1";
    forcedPassLogFactor: -1;
    couldBeatButPassedLogFactor: -0.25;
    observedLeadPlayLogFactor: -0.1;
    observedFollowPlayLogFactor: -0.2;
    degradedEssThreshold: 1;
    normalizationTolerance: 0.000001;
    essTolerance: 0.000001;
  }>;
}>;
~~~

The detached snapshot has exactly these semantic fields:

~~~ts
type D2FShadowPreActionSnapshot = Readonly<{
  schemaVersion: "d2f-shadow-pre-action-snapshot-v1";
  publicIdentity: PublicGameIdentity;
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  publicHistoryEvents: readonly PublicActionEvent[];
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  actingSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  publicState: RolloutPublicState;
  currentTrick: {
    leadSeat: PublicSeat | null;
    lastPlay: Readonly<CardGroup> | null;
    lastPlaySeat: PublicSeat | null;
    passSeats: readonly PublicSeat[];
  };
  candidates: readonly RolloutCandidate[];
  selectedCandidateId: string;
  particleBankConfig: D2FShadowParticleBankConfig;
  particleBankBaseLedger: HardPublicLedger;
  particleBankPendingPublicEvents: readonly PublicActionEvent[];
  expectedFinalEventIndex: number;
  expectedFinalPublicLedgerHash: string;
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  evidenceRequirements: RolloutEvidenceRequirements;
  riskPolicy: RolloutRiskPolicy;
  rootIdentity: RolloutReplayContextIdentity;
}>;
~~~

createD2FShadowPreActionSnapshot(input: unknown) returns a frozen snapshot or exactly one of invalid-room-projection, invalid-public-replay, invalid-candidate-projection, invalid-particle-config, invalid-budget, or root-identity-failed. It accepts no Room reference, callback, four private hands, ParticleBank handle, private scenario, assignment, weight, seed, tape, or cursor.

createD2FShadowCandidates(input: unknown) consumes all real AiEvaluatedCandidate entries and the saved AiAction. It returns candidates plus selectedCandidateId, or exactly one of empty-candidates, invalid-candidate, non-finite-score, duplicate-candidate-id, or selected-candidate-missing. It maps actions to RolloutAction, uses canonicalActionIdentity(action), uses score.total without re-evaluation, requires the selected action to match exactly, and is detached/deeply frozen. Candidate IDs use UTF-16 code-unit order. observeD2FShadow(snapshot) returns frozen evidence, not void-only telemetry and not a RolloutResult returned to formal code.

### 9.5 Production mapping and identity

The source is one pre-action Room root:

| Shadow field | Frozen source |
|---|---|
| publicIdentity | room.publicIdentity; canonical rooms only |
| initialLedger | room.initialPublicLedger retained before anti-tribute |
| finalLedger | room.publicLedger at capture |
| publicHistoryEvents | room.publicEvents finalized prefix |
| gameRank | room.rank |
| perspectiveSeat, actingSeat | room.currentTurn |
| ownCurrentHand | room.hands[room.currentTurn] only |
| publicState.handCounts | lengths of all four hands, counts only |
| publicState.finishOrder | room.finishOrder |
| publicState.playedCardIds | room.publicLedger.playedCardIds |
| currentTrick | room.trick projected to lead/last play/seat/pass seats |
| candidates, selectedCandidateId | saved AiDecision projection and formal action |
| particleBankBaseLedger | captured finalLedger; pending public events are [] |
| expectedFinalEventIndex, expectedFinalPublicLedgerHash | current ledger index and hash |
| rootIdentity | canonical identity from the same public identity, ledgers, history, seat, and rank |

The real RolloutScenarioSourceInput contains the public particle bank, public history, initial ledger, final ledger, rank, perspective seat, own current hand, and public state. ParticleBankBuildInput receives its complete contract input and registers one public handle only inside the detached call; no Room cache or private internals are exposed.

ParticleSnapshotIdentity contains game/round/hand identity, initial ledger hash, final ledger last event index, final ledger hash, perspective seat, and rank, and must match the root identity. The production seed is derived and never stored:

~~~text
SHA-256 UTF-8 "d2f-shadow-particle-seed-v1\0"
+ publicIdentity.handIdentity + "\0"
+ expectedFinalPublicLedgerHash + "\0" + String(actingSeat)
take the first four bytes as unsigned big-endian uint32
~~~

The seed is not a snapshot, bank, request, evidence, replay, or Room field. The request uses schemaVersion d2f-rollout-request-v2, mode shadow, formalExecutionAllowed literal false, root identity, projected candidates, fixed budget/limits/evidence/risk policy, and policyId d2f-lightweight-v1. runDetachedRollout receives this request; no kernel, policy, CRN, particle, aggregation, ranking, or formal-action semantics change.

### 9.6 Evidence lifecycle and exact failure mapping

The only fallback reasons are:

~~~ts
type D2FShadowFallbackReason =
  | "snapshot-failed"
  | "candidate-failed"
  | "particle-bank-failed"
  | "request-failed"
  | "scenario-source-failed"
  | "evidence-failed"
  | "simulation-failed"
  | "budget-exhausted"
  | "aggregation-failed"
  | "ranking-failed"
  | "result-assembly-failed"
  | "unexpected-failure";
~~~

~~~ts
type D2FShadowSemanticBudgetUsage = Readonly<{
  replicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  workUnitCount: number;
}>;
~~~

The shared D2FShadowEvidence is this discriminated union:

~~~ts
type D2FShadowEvidence =
  | Readonly<{
      schemaVersion: "d2f-shadow-v3";
      status: "success";
      decisionIdentity: string;
      formalCandidateId: string;
      shadowTopCandidateId: string | null;
      agreement: boolean;
      ranking: readonly string[];
      aggregateDiagnostics: RolloutAggregateDiagnostics;
      policyId: "d2f-lightweight-v1";
      baselineActionIdentity: string;
      d2fRecommendedActionIdentity: string | null;
      riskAdjustedUtilityDelta: number | null;
      expectedUtilityDelta: number | null;
      baselineEvaluatorScore: number;
      effectiveSampleSize: number;
      acceptedScenarioCount: number;
      replicateCountPerScenario: number;
      completedReplicateCount: number;
      workUnitCount: number;
      fallbackReason: "none";
      semanticBudgetUsage: D2FShadowSemanticBudgetUsage;
      elapsedWallClockMs: number;
    }>
  | Readonly<{
      schemaVersion: "d2f-shadow-v3";
      status: "failure";
      decisionIdentity: string | null;
      formalCandidateId: string | null;
      shadowTopCandidateId: null;
      agreement: "unavailable";
      ranking: readonly [];
      aggregateDiagnostics: null;
      policyId: "d2f-lightweight-v1";
      baselineActionIdentity: string | null;
      d2fRecommendedActionIdentity: null;
      riskAdjustedUtilityDelta: null;
      expectedUtilityDelta: null;
      baselineEvaluatorScore: number | null;
      effectiveSampleSize: null;
      acceptedScenarioCount: null;
      replicateCountPerScenario: null;
      completedReplicateCount: null;
      workUnitCount: null;
      fallbackReason: D2FShadowFallbackReason;
      semanticBudgetUsage: null;
      elapsedWallClockMs: number | null;
    }>;
~~~

Success ranking is exact RolloutResult.ranking. Utility deltas are shadow top-candidate summary minus the formal summary. Evidence is deeply frozen before writing the private room slot; the slot is replaced once per eligible decision and omitted from PublicRoom, events, replay bytes, and formal equality.

Failure mapping is exact: snapshot factory to snapshot-failed; candidate factory to candidate-failed; ParticleBank build or unknown result to particle-bank-failed; invalid request/budget/risk-policy/evidence-requirements to request-failed; scenario source to scenario-source-failed; low ESS/insufficient scenarios/replicates/incomplete coverage to evidence-failed; kernel except budget to simulation-failed; top-level budget exhaustion to budget-exhausted; aggregation to aggregation-failed; ranking-specific invalid request to ranking-failed; invalid assembly input/candidate summaries/aggregate diagnostics to result-assembly-failed; observer throw, malformed result, or evidence-freeze failure to unexpected-failure. All failures are caught, redacted, frozen, never rerun formal action, never change gameplay state, and never feed ranking to evaluator.

### 9.7 Exact Task 8 allowlist and forbidden scope

~~~text
src/ai/contracts.ts                         # AiEvaluatedCandidate projection
src/ai/aiDecisionEngine.ts                   # projection only; formal semantics unchanged
src/ai/rollout/contracts.ts                  # mode/fallback/budget/evidence contracts
src/ai/rollout/d2fShadowObserver.ts          # detached snapshot/factories/observer
src/game/room.ts                             # construction fields, initial ledger, runAiStep, public omission
tests/ai/rollout/d2fShadowObserver.test.ts
tests/ai/rollout/d2fShadowObserverIntegration.test.ts
tests/ai/rollout/d2fShadowByteLock.test.ts
~~~

Task 8 forbids changes to Task 1–7 algorithms, particle-bank internals, scenario source, kernel, policy, CRN, aggregation, ranking, benchmark fixture/runner, package/lock/config files, UI/network/server protocol, the existing D2e observer, and any other Room path. No callback, global registry, queue, worker, timer, retry, feature flag, external sink, or formalExecutionAllowed true path. Task 9 is verification only and has not started.

### TDD actions and focused evidence

Task 8 implementation must begin with focused tests, but this docs-only freeze does not create or run them.

- [ ] Extend AiDecision with the detached evaluated-candidate projection and add the disabled byte-lock test first.
- [ ] Add enabled success coverage using the real Room, runAiStep, buildParticleBank, and runDetachedRollout; assert snapshot-before-apply, one builder, one rollout, frozen evidence, and exactly-once formal application.
- [ ] Add disagreement and every failure mapping: snapshot, candidate, bank, request, source, evidence, simulation, budget, aggregation, ranking, assembly, and unexpected failures.
- [ ] Add human-turn, finished-room, opening-tribute, missing-public-source, empty-candidate, decision-failure, and re-entrant guards.
- [ ] Assert detached snapshot immutability, own-hand-only privacy, exact Task 7 literal configuration, derived seed non-storage, and no Room/private-handle/callback/global-state capture.
- [ ] Add the byte-lock negative control: force the shadow top candidate to disagree and compare formal action, score, runtime, plan, ledger, trick, finish order, public events, and replay bytes.
- [ ] Add AST/import checks for no Room import in d2fShadowObserver.ts, no ParticleBank internals, no executable callback, no global registry, no formalExecutionAllowed: true, and no Task 8 code outside the allowlist.
- [ ] Future focused command:
  npx vitest run tests/ai/rollout/d2fShadowObserver.test.ts tests/ai/rollout/d2fShadowObserverIntegration.test.ts tests/ai/rollout/d2fShadowByteLock.test.ts --exclude "**/.worktrees/**" --reporter=verbose
- [ ] This round runs no Vitest, benchmark, tsc, or build. Task 8 code is pending and Task 9 is not started.

### Produces / consumes

Produces one synchronous, detached, redacted D2FShadowEvidence object in the private Room slot. Consumes only the saved formal decision projection and pre-action public/seat-local inputs listed in the snapshot contract; it does not consume or return RoomState, formal evaluator state, or private ParticleBank internals.


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
- [ ] benchmark timing 与 correctness 分离；Task 7 runner gate is closed for this freeze. Any later benchmark evidence still follows the frozen Task 7 contract and is not run in this docs-only round.
- [ ] 在 Node 22.22.2 已存在环境或经授权 CI workflow 运行 `tsc --noEmit`、build、D2F focused、`D2_CURRENT_REGRESSION_MANIFEST`、full permitted shards 和 benchmark；Node 24.15.0 只能 supplemental。未取得 Node 22 证据时最终状态必须为 `AWAITING_NODE22_CI`，不得称为 D2F SHADOW RELEASE READY。
- [ ] 运行 privacy AST/import scan、candidateId random scan、ESS/risk/sort scan、shadow call-site scan、failure atomicity and immutability checks。
- [ ] 生成最终阶段报告：start/end HEAD、branch/worktree、changed paths、全部命令/结果/耗时、test counts、privacy/determinism/immutability/fallback/performance、正式决策路径是否修改、遗留风险和下一步精确前置条件。
- [ ] 只在所有 required gates 通过后创建 final verification commit；任何强制 Gate 未通过都报告 BLOCKED 或对应等待状态，不写“基本完成”。

### Final acceptance

Task 9 不把 D2F ranking 接入正式 action。最终报告必须同时列出新 D2F manifest/新增测试数、10/136 particle baseline、`D2_CURRENT_REGRESSION_MANIFEST` 的 exact 19 paths 与实际测试数、历史 23/222 handoff（不得冒充当前 Gate）、full permitted manifest/shard 规则与实际结果，并明确每一个 manifest 是否有可审计路径和 exit code；历史 87/898 只能单独报告为 historical evidence。

## 11. Commit/report contract

每个 Task 一个 commit；不得 amend、squash 或跨 Task 夹带修改。每个阶段报告必须包含：起始/结束 HEAD、branch/worktree、changed paths、契约/算法决策及理由、首次 RED 命令/失败信息/原因、全部验证命令/结果/测试数/耗时、privacy/determinism/immutability/fallback/performance、正式决策路径是否修改、遗留风险、下一 Task 精确前置条件和 commit hash。

## Historical D2F Task 4 State-Machine Remediation Design Freeze (superseded by the final integration freeze report)

本节是当前 Task 4 唯一有效的实施计划，替换上方历史 pre-remediation Task 4 记录。F1–F7 均已结合 expected HEAD 的真实 production、test 和正式 Room/settlement 语义确认；本轮不实施代码。

### F1 — canonical multi-card identity

`finalizePublicActionEvent` 的 `normalizeDraft` 对 play/tribute/return 的 `publicCardIds` 使用默认 `sort()`，而 `kernel.ts` 将该 canonical event 顺序写入 public state；`stateConservation.ts` 当前按原始 action 顺序检查 prefix，故 finding confirmed。`createDeck()` 的两副牌、四花色、13 rank、四张 joker 共 108 张，真实 id 与 kind/rank/suit/copy 唯一绑定。

下一轮必须以 exact card-ID set/multiset equality 比较 action 与 finalized event，不使用 `localeCompare`，并独立拒绝 action 内 duplicate ID、missing、extra、foreign ID；不得只比较长度。event 保留 canonical order，hand 删除按 card ID。RED 用 `runRolloutReplicate` root action 覆盖合法 pair、合法 full-house、同集合换序成功以及 duplicate/missing/extra/foreign 失败。

### F2 — unknown-input kernel boundary

当前 `runRolloutReplicate` 先读取 `validatedBudget`，随后在 schema 防护前读取/clones `scenario.privateState`，finding confirmed。入口冻结为：

~~~text
unknown input
  -> strict envelope/prototype/own-key/data-descriptor validation
  -> nested plain-data validation
  -> semantic validation
  -> fresh isolated projection
  -> rollout execution
~~~

exact envelope keys 为 `candidate`、`scenario`、`publicState`、`replicateIdentity`、`random`、`validatedBudget`。读取前必须完成 `Object.getPrototypeOf`、`Reflect.ownKeys`、exact own keys、own data descriptor、无 accessor/symbol/function；plain record 只能是 `Object.prototype`/`null`，数组必须是 canonical contiguous `Array.prototype`，拒绝 sparse、expando、custom iterator/map。safe integer、finite、非负和 `-0` 规则沿用现有 contracts；cycle、Proxy trap、getter、callback 都映射 typed failure，getter/callback 调用数为 0。`structuredClone` 只作用于已验证安全图或可信内部图；失败 no throw、无 partial result，diagnostics 不回显 hostile input/private state。现有 `validateRolloutBudget` 是 budget validator；本轮不改 contracts union/interface。

### F3 — nested seat-local observation

observation exact keys 固定为 `hand`、`publicHistoryEvents`、`handCounts`、`currentLastPlay`、`finishOrder`、`gameRank`，只含 acting seat 的完整 hand 和公开数据。

- Card 只允许真实 exact schema：suited 为 `id/kind/rank/suit/copy`，joker 为 `id/kind/rank/copy`；id 必须与 `createDeck` 的 canonical field relation 相符。
- `handCounts` exact keys 为 `0`,`1`,`2`,`3`；count 必须 finite、nonnegative、safe integer、拒绝 `-0`。
- `finishOrder` 只含 canonical seat 且无重复；`gameRank` 必须属于真实 `RANKS`。
- `currentLastPlay` 为 null 或完整 canonical `CardGroup`，包括 exact group keys、card/wildcard schema、unique IDs、wildcard projection 和牌型语义。
- `publicHistoryEvents` 先递归 descriptor/prototype/own-key 验证，再复用 finalized public-event/hash 语义；play/transfer/pass/trick-clear/finish 字段与 card/count/trick 关系必须完整。
- 所有 nested object/array 先验证再逐字段 clone/freeze；caller observation 不保留。getter/accessor/symbol/custom prototype/function/sparse/expando 一律 typed fail；throwing `CrnView.value()` 映射现有 `invalid-policy-context/ply`，不产生 action。

### F4 — Room-authoritative early terminal

真实 `Room.advanceAfterAction` 的唯一提前终局条件是 `finishOrder.length >= 3` 或前两名 finishers 是搭档；命中后 `finishRound` 补齐四席并调用 `settleRound`。普通两名非搭档完成不终局，已完成 seat 在后续 active-seat search 中跳过。Task 4 不修改 Room/settlement。

每次 root action 和 policy action 都在 transition/conservation 成功后立即检查该条件；root early terminal 即使最小 budget 也直接 terminal，不调用后续 policy、不进入 budget-exhausted、不调用 leaf。顺序固定：nextState 完成 hand/count/finish/trick/turn → transition validation → conservation validation → terminal projection → terminal utility；非 terminal 才做 stable-state validation 与 leaf。

完整 finish-order projection 保留真实 prefix；三人完成时追加唯一未完成 seat；前两名为搭档且尚无第三名时，从最后真实 finisher 按 `nextPlayableSeat` 的 seat-1 modulo 4 方向跳过已完成 seat 追加剩余两席；完整四席原样保留。示例 `[0,2] -> [0,2,1,3]`、`[1,3] -> [1,3,2,0]`、`[0,1,2] -> [0,1,2,3]`。`[0,2,1,3]` 对 perspective 0 为 `+3`，对 perspective 1 为 `-3`；不得按绝对 seat number 排序或用 leaf heuristic 伪造 terminal 名次。

### F5 — independent card universe

冻结公式：

~~~text
U = Set(createDeck().map(card => card.id))
|U| = 108
physicalLocations = Set(all four hand card IDs ∪ publicPlayedCardIds)
require physicalLocations === U
~~~

hands 与 `publicPlayedCardIds` 各自 unique、彼此 disjoint、全部属于 U，并集 exact 等于 U；expected IDs 直接来自 trusted `createDeck()`，不从待验证 state 重建。history event IDs、`currentLastPlay.cards` 和 current-trick stable key 是同一 played card 的公开重复视图，只做 exact consistency check，不加入 physicalLocations；tribute/return ID 是 hand transfer 视图，不创造/销毁牌。source replay 继续先用 `validateCanonicalInitialDeal/createDeck`，kernel 再验证同一 U。canonical full-deck 成功，missing/extra/duplicate/hand-public overlap/forged 失败，正常 multi-particle replay 成功。

### F6 — atomic transition

所有 root/policy/pass 共用：

~~~text
accepted immutable current state
  -> independent nextState
  -> apply action and all hand/count/finish/trick/turn/public updates to nextState
  -> validate transition
  -> validate conservation
  -> terminal projection or stable-state validation
  -> evaluate terminal utility or leaf on nextState
  -> commit nextState
~~~

validated transition 前不得污染 current state，不得先写后回滚；任何失败丢弃完整 nextState，failure 不带 state/nextState/private diagnostics，caller input 保持不变。RED 必须覆盖 play/pass post-validation failure、conservation failure、terminal projection failure、illegal policy action，并断言 accepted state、caller input 相同且无 partial result。

### F7 — observation/CRN order

每次 decision 固定为 `current stable state → seat-local observation validation → current ply/acting-seat CRN coordinate/view → fixed policy → policy-action validation → transactional transition`。observation 不含 CRN private material；CRN 继续使用当前 ply 与 acting seat；policyId/candidateId 不进入 CRN。该调整不得改变 Task 3 known vectors。

### Failure mapping

现有 failure union 足够，不新增 contracts 字段、optional string 或 throw API：malformed kernel envelope、invalid scenario/private state、invalid candidate、CRN failure 均为 `{ kind: "simulation-failed", stage: "replay" }`；kernel invalid observation 也为 replay，direct policy invalid observation 为 `{ kind: "invalid-policy-context", field: "actingSeat" }`；invalid card universe、transition、conservation 为 `{ kind: "simulation-failed", stage: "state-conservation" }`；policy failure 为 `{ kind: "policy-failed", failure: RolloutPolicyFailure }`；terminal projection 为 `{ kind: "simulation-failed", stage: "leaf-evaluation" }`；budget 为 `{ kind: "budget-exhausted", workUnits, maximumWorkUnits }`。`CrnView.value()` throw 先在 policy 归一化为 `invalid-policy-context/ply`。所有映射 no throw/no partial/no private diagnostics。

### Next-round exact code allowlist

三份文档必须保持以下完全相同的六路径 allowlist：

~~~text
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
src/ai/rollout/stateConservation.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

`contracts.ts` 不加入：现有 `RolloutKernelFailure`/`RolloutPolicyFailure` union/interface 足够，`validateRolloutBudget` 可直接复用。`particleBankRolloutBoundary.test.ts` 不加入：Task 4 不改 bridge/source，kernel.test 直接消费真实 source replay scenario。禁止 `src/game/**`、`src/engine/**`、`src/ai/particles/**`、`src/ai/planning/**`、`src/ai/aiDecisionEngine.ts`、package/lock/config 和 Task 5–9 文件。

### Frozen TDD RED matrix

| slice | existing production entry and RED | GREEN evidence |
| --- | --- | --- |
| multi-card | `runRolloutReplicate` root pair/full-house canonical-order mismatch; duplicate/missing/extra/foreign | legal permutations succeed; exact identity failures typed |
| hostile kernel | `runRolloutReplicate(unknown)` top getter, nested getter, budget getter, symbol/accessor, custom prototype, inherited iterator/map, sparse/expando, cycle | getter/callback count 0; typed no-throw/no-partial/no-private diagnostics |
| policy observation | policy list/choose with NaN/Infinity/fraction/negative/unsafe/-0 counts, missing/extra counts, duplicate/unknown finish, malformed card/event, nested getter, throwing CRN | complete nested schema, caller unchanged, no partial action, local-only observation |
| terminal | kernel root/policy partner-first-two, three finished, ordinary nonterminal, minimum budget, team/rotation views | immediate terminal, no later policy/leaf, completed-seat skip, full projection and `+3/-3` |
| universe | kernel canonical deck/missing/extra/duplicate/overlap/forged and real source replay with history/current-trick/transfer views | exact U, transfer invariant, duplicate views not double-counted, normal replay success |
| transaction | kernel play/pass post-validation, conservation, terminal projection, illegal policy action | accepted/current and caller inputs unchanged, no partial result/diagnostics, one path for all actions |

Every RED must fail on behavior at the named production entry; missing module, import error or empty collection is invalid RED. This round runs none of the RED commands. Current status remains:

~~~text
TASK 4 STATE-MACHINE REMEDIATION DESIGN FROZEN
TASK 4 CODE REMEDIATION PENDING
TASK 5 NOT STARTED
AWAITING_FIXED_BENCHMARK_RUNNER
AWAITING_NODE22_CI
Task 9 full permitted regression
~~~

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

D2F_TASK9_FULL_REGRESSION_GATE_ACTIVE_BEGIN
# D2F_TASK9_FULL_REGRESSION_GATE_FREEZE

This is the current active Task 9 source of truth. If retained historical text conflicts with this block, this block wins. The historical statements "Task 4 remediation pending", "Task 7 pending", and "Task 8 not started" are not the current implementation status.

## Current status

Task 1: complete
Task 2: complete
Task 3: complete
Task 4: complete
Task 5: complete
Task 6: complete
Task 7: complete
Task 8: complete
Task 9: full permitted regression pending

Task 9 is verification-only. This freeze changes no production, test, fixture, script, package, lockfile, Room, benchmark, or configuration path.

## Planner runtime diagnosis

The exact current-HEAD command was:

~~~text
npx vitest run tests/engine/planner.test.ts --exclude "**/.worktrees/**" --reporter=verbose
~~~

Environment: Node v24.15.0, Vitest 2.1.9.
Start: 2026-08-12T06:56:45.3872368+08:00
End: 2026-08-12T07:00:14.2209669+08:00
Wall duration: approximately 211.7 seconds.
Vitest duration: 197.72 seconds.
Exit code: 0.
Result: 1 file, 19 passed, 0 failed, 0 skipped.

The slowest observed test was "returns deterministic plan and group ordering for repeated calls" at 72845 ms. Other observed long tests were 35314 ms, 34736 ms, 22605 ms, and 18635 ms. No assertion failure, worker crash, unhandled rejection, collection deadlock, or non-exiting process was observed. The test file has no skip, only, or todo modifier. The test and src/engine production dependencies were not changed in the Task 1 base..Task 8 HEAD range. This is:

CLASS A — NORMAL SLOW TEST

tests/engine/planner.test.ts remains included. It is assigned to its own slow shard. The next gate may use an outer process wait ceiling of 300000 ms for this command, based on the fresh approximately 211.7 second wall result and a bounded margin. This does not modify any Vitest test timeout. No baseline verification worktree is required for CLASS A; no baseline worktree was created.

## Full permitted manifest accounting

The fresh tracked test manifest is:

tracked=147
included=105
excluded=42
union=147
missing=0
duplicate=0
overlap=0
untracked=0


### Included files

~~~text
tests/ai/actionEvaluator.test.ts
tests/ai/actionGenerationDiagnostics.test.ts
tests/ai/actionGenerator.test.ts
tests/ai/aiDecisionEngine.test.ts
tests/ai/aiDecisionMigration.test.ts
tests/ai/aiDecisionShadow.test.ts
tests/ai/aiPlanningDiagnostics.test.ts
tests/ai/beliefGuidedPlanPolicy.test.ts
tests/ai/d1DiagnosticsAggregation.test.ts
tests/ai/d1DiagnosticsPrivacy.test.ts
tests/ai/dynamicPlanEvaluator.test.ts
tests/ai/dynamicPlanEvaluatorBoundaries.test.ts
tests/ai/handAnalyzer.test.ts
tests/ai/handPlannerMigration.test.ts
tests/ai/keepCurrentByteLock.test.ts
tests/ai/keepCurrentCharacterization.test.ts
tests/ai/keepCurrentRuntimeShape.test.ts
tests/ai/lightweightPublicEvidence.test.ts
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
tests/ai/planIdentity.test.ts
tests/ai/planManager.test.ts
tests/ai/planManagerD1.test.ts
tests/ai/planSelectionContracts.test.ts
tests/ai/planSelectionMode.test.ts
tests/ai/planSelector.test.ts
tests/ai/powerGroupPolicyCache.test.ts
tests/ai/publicEvent.test.ts
tests/ai/publicEventHash.test.ts
tests/ai/publicLedger.test.ts
tests/ai/publicLedgerDependency.test.ts
tests/ai/publicLedgerKeepCurrent.test.ts
tests/ai/publicLedgerPrivacy.test.ts
tests/ai/publicLedgerReplay.test.ts
tests/ai/publicLedgerTributeReset.test.ts
tests/ai/publicLedgerTrickFinish.test.ts
tests/ai/representativeActionReducer.test.ts
tests/ai/representativeActionReducerDetached.test.ts
tests/ai/representativeActionShadowAst.test.ts
tests/ai/representativeActionShadowByteLock.test.ts
tests/ai/representativeActionShadowIntegration.test.ts
tests/ai/representativeActionShadowRoom.test.ts
tests/ai/roleEvaluator.test.ts
tests/ai/rollout/aggregation.test.ts
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
tests/ai/rollout/d2fShadowByteLock.test.ts
tests/ai/rollout/d2fShadowObserver.test.ts
tests/ai/rollout/d2fShadowObserverIntegration.test.ts
tests/ai/rollout/evidenceGate.test.ts
tests/ai/rollout/failureAtomicity.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/leafEvaluation.test.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/ranking.test.ts
tests/ai/rollout/rolloutOrchestrator.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/strategicHistory.test.ts
tests/benchmark/d1ReplayCli.test.ts
tests/benchmark/workerStartupFailure.test.ts
tests/engine/cards.test.ts
tests/engine/groups.test.ts
tests/engine/planQuality.test.ts
tests/engine/planner.test.ts
tests/engine/scorer.test.ts
tests/engine/validation.test.ts
tests/game/ai.test.ts
tests/game/aiBaseline.test.ts
tests/game/aiCompatibilityAdapter.test.ts
tests/game/legacyRoomCallerIsolation.test.ts
tests/game/legacyRoomIsolation.test.ts
tests/game/playRules.test.ts
tests/game/protectedGroups.test.ts
tests/game/publicEventIdentity.test.ts
tests/game/publicEventReplayIdentity.test.ts
tests/game/publicEventRoomAdapter.test.ts
tests/game/room.test.ts
tests/game/roomPlanningArchitecture.test.ts
tests/game/roomUnifiedAdapter.test.ts
tests/game/settlement.test.ts
tests/server/api.test.ts
tests/server/apiCanonicalIdentity.test.ts
tests/server/apiIdempotency.test.ts
tests/server/apiShutdown.test.ts
tests/server/publicIdentityConcurrency.test.ts
tests/server/publicIdentityDescriptor.test.ts
tests/server/publicIdentityProvider.test.ts
tests/server/publicRoomLegacyResponse.test.ts
tests/tooling/npmTestCollectionContract.test.ts
tests/ui/app.test.tsx
tests/ui/handLayout.test.tsx
tests/ui/handStackStyles.test.ts
tests/ui/manualGrouping.test.ts
tests/ui/productionIdentityLifecycle.test.tsx
~~~

### Excluded files and reasons

The following two files are excluded from ordinary full-permitted correctness regression because they are separate focused workload gates:
~~~text
tests/ai/d1PlannerExpansionBudgetStudy.test.ts
tests/ai/rollout/d2fBenchmarkContract.test.ts
~~~
Reason for both: study/benchmark-specific contract or timing workload; they remain independently auditable focused gates.

The following files are excluded because they are benchmark workload, benchmark contract, calibration, reporting, reproducibility, or worker-cleanup gates:
~~~text
tests/benchmark/artifactConsistency.test.ts
tests/benchmark/candidates.test.ts
tests/benchmark/cli.test.ts
tests/benchmark/contracts.test.ts
tests/benchmark/d1AtomicWriter.test.ts
tests/benchmark/d1Calibration.test.ts
tests/benchmark/d1CalibrationReadiness.test.ts
tests/benchmark/d1CalibrationReview.test.ts
tests/benchmark/d1CliArgs.test.ts
tests/benchmark/d1ConfigHash.test.ts
tests/benchmark/d1Diagnostics.test.ts
tests/benchmark/d1DiagnosticsPersistence.test.ts
tests/benchmark/d1DryRun.test.ts
tests/benchmark/d1ExecutionProvenance.test.ts
tests/benchmark/d1FormalBatchLoop.test.ts
tests/benchmark/d1FormalGate.test.ts
tests/benchmark/d1Manifest.test.ts
tests/benchmark/d1Matrix.test.ts
tests/benchmark/d1ProvenancePersistence.test.ts
tests/benchmark/d1ReplayValidation.test.ts
tests/benchmark/d1ReplayWriterCompatibility.test.ts
tests/benchmark/d1Resume.test.ts
tests/benchmark/d1Runner.test.ts
tests/benchmark/d1Statistics.test.ts
tests/benchmark/d1StrategyRegistry.test.ts
tests/benchmark/d2aPublicLedgerAdapter.test.ts
tests/benchmark/keepCurrentLock.test.ts
tests/benchmark/legacyD1Compatibility.test.ts
tests/benchmark/observation.test.ts
tests/benchmark/reporting.test.ts
tests/benchmark/reportModel.test.ts
tests/benchmark/reproducibility.test.ts
tests/benchmark/rotations.test.ts
tests/benchmark/simulator.test.ts
tests/benchmark/statistics.test.ts
tests/benchmark/strategies.test.ts
tests/benchmark/workerCleanup.test.ts
~~~

The following files are excluded because they are independent performance or simulation workload gates:
~~~text
tests/performance/aiHotPath.test.ts
tests/simulation/unifiedAiRoomSimulation.test.ts
tests/simulation/unifiedAiSimulationMetrics.test.ts
~~~


## Explicit full-permitted shards

The current active manifest has 16 explicit full-permitted shards.
Every included file belongs to exactly one shard below. Every command uses the fixed local Vitest binary equivalent and includes --exclude "**/.worktrees/**".

### full-01
~~~text
tests/ai/actionEvaluator.test.ts
tests/ai/actionGenerationDiagnostics.test.ts
tests/ai/actionGenerator.test.ts
tests/ai/aiDecisionEngine.test.ts
tests/ai/aiDecisionMigration.test.ts
tests/ai/aiDecisionShadow.test.ts
tests/ai/aiPlanningDiagnostics.test.ts
tests/ai/beliefGuidedPlanPolicy.test.ts
tests/ai/d1DiagnosticsAggregation.test.ts
tests/ai/d1DiagnosticsPrivacy.test.ts
tests/ai/dynamicPlanEvaluator.test.ts
tests/ai/dynamicPlanEvaluatorBoundaries.test.ts
tests/ai/handAnalyzer.test.ts
tests/ai/handPlannerMigration.test.ts
tests/ai/keepCurrentByteLock.test.ts
tests/ai/keepCurrentCharacterization.test.ts
tests/ai/keepCurrentRuntimeShape.test.ts
tests/ai/lightweightPublicEvidence.test.ts
tests/ai/particles/actionSupportLikelihood.test.ts
tests/ai/particles/constrainedParticleSampler.test.ts
~~~

### full-02
~~~text
tests/ai/particles/effectiveSampleSize.test.ts
tests/ai/particles/logWeightNormalization.test.ts
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/particles/particleConservation.test.ts
tests/ai/particles/particleContracts.test.ts
tests/ai/particles/particleDetachedCharacterization.test.ts
tests/ai/particles/particlePrivacyAst.test.ts
tests/ai/particles/publicEventDealReplay.test.ts
tests/ai/planIdentity.test.ts
tests/ai/planManager.test.ts
tests/ai/planManagerD1.test.ts
tests/ai/planSelectionContracts.test.ts
tests/ai/planSelectionMode.test.ts
tests/ai/planSelector.test.ts
tests/ai/powerGroupPolicyCache.test.ts
tests/ai/publicEvent.test.ts
tests/ai/publicEventHash.test.ts
tests/ai/publicLedger.test.ts
tests/ai/publicLedgerDependency.test.ts
tests/ai/publicLedgerKeepCurrent.test.ts
~~~

### full-03
~~~text
tests/ai/publicLedgerPrivacy.test.ts
tests/ai/publicLedgerReplay.test.ts
tests/ai/publicLedgerTributeReset.test.ts
tests/ai/publicLedgerTrickFinish.test.ts
tests/ai/representativeActionReducer.test.ts
tests/ai/representativeActionReducerDetached.test.ts
tests/ai/representativeActionShadowByteLock.test.ts
tests/ai/representativeActionShadowIntegration.test.ts
tests/ai/roleEvaluator.test.ts
tests/ai/rollout/aggregation.test.ts
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
tests/ai/rollout/d2fShadowByteLock.test.ts
tests/ai/rollout/d2fShadowObserver.test.ts
tests/ai/rollout/d2fShadowObserverIntegration.test.ts
tests/ai/rollout/evidenceGate.test.ts
tests/ai/rollout/failureAtomicity.test.ts
tests/ai/rollout/kernel.test.ts
~~~

### full-04-ast
~~~text
tests/ai/representativeActionShadowAst.test.ts
~~~

### full-05-room
~~~text
tests/ai/representativeActionShadowRoom.test.ts
~~~

### full-06
~~~text
tests/ai/rollout/leafEvaluation.test.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/ranking.test.ts
tests/ai/rollout/rolloutOrchestrator.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/strategicHistory.test.ts
tests/engine/cards.test.ts
~~~

### full-07-planner-slow
~~~text
tests/engine/planner.test.ts
~~~
Command:
~~~text
npx vitest run tests/engine/planner.test.ts --exclude "**/.worktrees/**" --reporter=verbose
~~~
Suggested outer process wait ceiling: 300000 ms. Do not change the internal Vitest test timeout.

### full-08
~~~text
tests/engine/groups.test.ts
~~~

### full-09
~~~text
tests/engine/planQuality.test.ts
~~~

### full-10
~~~text
tests/engine/scorer.test.ts
~~~

### full-11
~~~text
tests/engine/validation.test.ts
~~~

### full-12
~~~text
tests/game/ai.test.ts
tests/game/aiBaseline.test.ts
tests/game/aiCompatibilityAdapter.test.ts
tests/game/legacyRoomCallerIsolation.test.ts
tests/game/legacyRoomIsolation.test.ts
~~~

### full-13
~~~text
tests/game/playRules.test.ts
tests/game/protectedGroups.test.ts
tests/game/publicEventIdentity.test.ts
tests/game/publicEventReplayIdentity.test.ts
tests/game/publicEventRoomAdapter.test.ts
tests/game/room.test.ts
tests/game/roomPlanningArchitecture.test.ts
tests/game/roomUnifiedAdapter.test.ts
tests/game/settlement.test.ts
~~~

### full-14
~~~text
tests/server/api.test.ts
tests/server/apiCanonicalIdentity.test.ts
tests/server/apiIdempotency.test.ts
tests/server/apiShutdown.test.ts
tests/server/publicIdentityConcurrency.test.ts
tests/server/publicIdentityDescriptor.test.ts
tests/server/publicIdentityProvider.test.ts
tests/server/publicRoomLegacyResponse.test.ts
tests/benchmark/workerStartupFailure.test.ts
~~~

### full-15
~~~text
tests/tooling/npmTestCollectionContract.test.ts
tests/benchmark/d1ReplayCli.test.ts
tests/ui/handStackStyles.test.ts
tests/ui/manualGrouping.test.ts
~~~

### full-16-ui
~~~text
tests/ui/app.test.tsx
tests/ui/handLayout.test.tsx
tests/ui/productionIdentityLifecycle.test.tsx
~~~
Command:
~~~text
npx vitest run tests/ui/app.test.tsx tests/ui/handLayout.test.tsx tests/ui/productionIdentityLifecycle.test.tsx --exclude "**/.worktrees/**" --reporter=dot
~~~

The next run must execute full-01 through full-16, prove assigned=105, unique=105, missing=0, duplicate=0, overlap=0, extra=0, and record each shard exit code. The previous partial evidence of 69 unique files / 842 passed tests is historical evidence only; it is not a Task 9 pass.



## D2 19-file manifest and focused suites

The D2 manifest is:
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
tests/ai/representativeActionShadowByteLock.test.ts
tests/ai/representativeActionShadowIntegration.test.ts
tests/ai/representativeActionShadowAst.test.ts
tests/ai/representativeActionShadowRoom.test.ts
~~~
It must run as the four existing explicit D2 shards: 12 public-ledger files, 5 policy/reducer files, 1 AST file, and 1 Room file, for 19 files / 212 source-audited tests.

Task 1–8 focused/core suites remain independently required:
~~~text
tests/ai/particles/particleBankBuilder.test.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/rollout/leafEvaluation.test.ts
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
tests/ai/rollout/evidenceGate.test.ts
tests/ai/rollout/aggregation.test.ts
tests/ai/rollout/ranking.test.ts
tests/ai/rollout/rolloutOrchestrator.test.ts
tests/ai/rollout/failureAtomicity.test.ts
tests/ai/rollout/d2fBenchmarkContract.test.ts
tests/ai/rollout/d2fShadowObserver.test.ts
tests/ai/rollout/d2fShadowObserverIntegration.test.ts
tests/ai/rollout/d2fShadowByteLock.test.ts
~~~

The fixed benchmark command remains:
~~~text
npm exec --offline -- tsx scripts/benchmarks/d2f-rollout-budget-calibration.ts --fixture tests/fixtures/ai/d2f-public-rollout-fixture.json --warmup 3 --iterations 10 --json
~~~

Task 8 Shadow focused coverage must include default disabled, disabled zero-call behavior, enabled success, formal action/public-state byte isolation, exactly-once eligible decisions, failure isolation, privacy, and no recursion.

## Next-gate requirements

The next Task 9 execution must run, in order:
1. complete manifest audit;
2. full-01 through full-16;
3. Task 1–8 focused/core suites;
4. Particle regression;
5. D2 19 files / 212 tests;
6. the fixed benchmark command;
7. npx tsc --noEmit;
8. npm run build;
9. git diff --check;
10. final clean status.

A single slow planner shard over the old 124-second outer ceiling is not a D2F defect when it exits 0 with all 19 tests passing. Assertion failure, worker crash, unhandled rejection, or current-only regression remains blocking. Node 24 is supplemental evidence only. Node 22.22.2 CI remains the release gate.

## Verdict and deferred gate

TASK 9 PLANNER RUNTIME CLASSIFIED
TASK 9 FULL REGRESSION GATE FROZEN
TASK 9 EXECUTION PENDING
D2F PRODUCTION UNCHANGED
AWAITING_NODE22_CI
D2F SHADOW RELEASE READY: NO

D2F_TASK9_FULL_REGRESSION_GATE_ACTIVE_END
