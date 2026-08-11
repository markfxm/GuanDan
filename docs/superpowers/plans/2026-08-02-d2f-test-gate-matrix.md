# D2F Test Gate Matrix

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

package/package-lock 已声明 `tsx ^4.19.2`。`AWAITING_FIXED_BENCHMARK_RUNNER` 是 Task 7
preflight，不是 Task 1 blocker。恢复顺序固定为 `npm ci` -> `git diff --exit-code -- package.json package-lock.json`
-> `npm ls tsx --depth=0` -> `npm exec --offline -- tsx --version`，再执行 active block
中的唯一固定 benchmark command；不得使用网络解析、全局安装、临时下载或另一套 runner，
runner 缺失时不得跳过 RED，也不得把 benchmark timing 混入普通 correctness regression。

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
type D2FShadowMode = "disabled" | "enabled";

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
| Shadow | d2fShadowObserver.test.ts, d2fShadowObserverIntegration.test.ts, d2fShadowByteLock.test.ts | construction-time mode, synchronous pre-action snapshot and detached result before applying the saved formal action, swallowed failure, evidence privacy, public byte lock |

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
tests/ai/rollout/particleBankRolloutBoundary.test.ts  # only the existing Compiler API Gate remediation
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
bytes and fixed vectors only. No `skip`, `only` or test-placeholder marker is allowed.

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

## Historical Task 4 private-boundary freeze — superseded by the current freeze at the end of this document

Task 4 的 isolated private rollout boundary 与 Design Spec、Implementation Plan 统一冻结为：

~~~text
particleBankInternals.ts
  -> particleBankRolloutAccess.ts
  -> particleScenarioSource.ts
  -> kernel.ts isolated state
  -> seat-local observation
  -> policy.ts
~~~

`particleBankRolloutAccess.ts` 是唯一读取 ParticleBank internals 的 production reader，不进入 public barrel，验证 private records/scenario/weights/ESS 并返回隔离 projection。`particleScenarioSource.ts` 是唯一 private bridge caller，完成 private replay 与 public consistency 二次验证并产生冻结、隔离的 `RolloutScenario`。`kernel.ts` 只能消费 source 已产生的 `RolloutScenario`、`RolloutReplicateInput` 和 isolated `privateState`；不得导入 bridge/internals、读取 ParticleBank handle/WeakMap/raw records、把 private state 传给 policy/diagnostics，且必须先 clone/isolate 再模拟。`policy.ts` 不得获得 `RolloutScenario`、`privateState` 或四座位完整 hands，只能获得当前 acting seat 的 `SeatLocalObservation`、`RolloutPolicyDecisionContext` 和 `CrnView`，不得导入 kernel、particles、Room 或 planning private state。

现有 Compiler API Gate 的 exact consumer 语义由 `tests/ai/rollout/particleBankRolloutBoundary.test.ts` 证明：使用 TypeScript Compiler API 与 resolved symbols，production contract symbol 的合法集合精确为 `src/ai/rollout/contracts.ts`（声明）、`src/ai/rollout/particleScenarioSource.ts`（producer）和 `src/ai/rollout/kernel.ts`（isolated consumer）。Gate 文件不是 production consumer。不得使用“rollout 目录全部允许”、basename 模糊匹配或文本 grep；不得删除既有 Task 1 断言。Gate 必须继续证明唯一 internals reader、唯一 bridge caller、kernel 只消费 source 产生的 isolated contract、policy 无 private contract、无 re-export/public barrel 泄漏。
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

新增且仅新增的既有 Gate 文件是 `tests/ai/rollout/particleBankRolloutBoundary.test.ts`。旧 rescue-only 路径 `src/ai/rollout/rolloutPolicy.ts`、`src/ai/rollout/rolloutKernel.ts`、`tests/ai/rollout/rolloutKernel.test.ts` 和 `tests/ai/rollout/rolloutPolicyPrivacy.test.ts` 仅作历史禁止说明，禁止恢复到正式 source 链。

历史记录保留 exhaustive literal policy 与 candidate-free CRN 结论；当时的 ply 顺序和测试范围已由文档末尾 current freeze 取代。

RED/GREEN 必须先覆盖：private boundary RED（正式 `kernel.ts` 缺失或未被 exact Gate 识别）；policy factory RED（旧 `createFixedRolloutPolicy()` 不满足接口）；CRN ownership RED（两个 ply 或不同 acting seat 揭示固定 view 错误配对）；privacy RED（opponent hand、full hands、privateState、raw scenario、callback/factory/registry 被真实类型/runtime/Compiler API Gate 拒绝）；state conservation RED（真实 duplicate/missing card、hand-count mismatch、finish mismatch 失败）。模块缺失不能作为全部行为 RED。GREEN 保留所有既有 Task 1 Gate 断言。本轮不实施 Task 4 production/tests，Task 5–9 不提前开始。

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

The Task 2 leaf test matrix is exact and must use the real production API with no mock, skip, only or test-placeholder marker：

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
valid RED evidence. No test may use mock, skip, only or test-placeholder marker.

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

### Frozen Task 8 focused matrix

| Concern | Real entry and exact assertion |
|---|---|
| Disabled parity | default mode is disabled; formal action, runtime, plan, Room state, public events, replay bytes, and diagnostics are unchanged; ParticleBank, runDetachedRollout, and evidence calls are zero |
| Enabled success | real runAiStep captures pre-action data, builds once, runs once, stores frozen evidence, and applies the original action exactly once |
| Disagreement | shadow ranking may differ; formal action, evaluator score, runtime, plan, ledger, trick, finish order, public bytes, and replay bytes remain unchanged |
| Failure isolation | snapshot/candidate/bank/request/source/evidence/simulation/budget/aggregation/ranking/assembly failures map to one redacted frozen failure evidence and preserve formal state |
| Exactly once | one eligible runAiStep invokes the rollout once; guard prevents re-entry, retry, queue, recursion, and global-state leakage |
| Ineligible turns | disabled, human, finished, opening tribute, missing replay source, empty/invalid candidates, and decision failure invoke no shadow factory |
| Snapshot boundary | detached, deeply frozen, pre-action, own-hand-only, and free of Room references, hidden hands, callback, private scenario, assignment, weight, seed, tape, and cursor |
| Candidate mapping | every real evaluated candidate maps to canonicalActionIdentity(action) and score.total; selected candidate exists and UTF-16 ordering is stable |
| ParticleBank | exact Task 7 config and derived seed are used; one public handle is created inside the detached call; no Room cache or private internals |
| Evidence lifecycle | private frozen slot starts null, is replaced per eligible decision, is omitted from public/events/replay/formal equality, and resets on new Room |
| Regression boundary | Task 1–7, benchmark, ParticleBank, and D2 tests remain deferred until code; this docs-only round runs none; Task 9 is not started |


## 10. Benchmark gate

The prior benchmark gate text is superseded by the active
`D2F_TASK7_BENCHMARK_INTERFACE_THRESHOLD_FREEZE_REPORT` block at the end of this document.
It is the sole Task 7 source of truth for the three-path code allowlist, fixed CLI, fixture schema,
correctness oracle, timing boundary, 3/10 iteration rule, metrics, completed-run duration ceiling, report schema,
exit codes, focused test command, and Node evidence distinction.

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

## Historical D2F Task 4 State-Machine Remediation Design Freeze (superseded by the final integration freeze report)

本节是当前 Task 4 唯一有效的 test-gate matrix，替换历史 private-boundary 条款。F1–F7 均已结合 expected HEAD 的真实 production、test 和正式 Room/settlement 语义确认；本轮只冻结文档。

### F1 — canonical multi-card identity

`finalizePublicActionEvent` 的 `normalizeDraft` 对 play/tribute/return 的 `publicCardIds` 使用默认 `sort()`；kernel 将 finalized canonical order 写入 public state，而 `stateConservation.ts` 当前用原始 action order 检查 prefix，finding confirmed。`createDeck()` 以真实 `kind/rank/suit/copy` 唯一生成 108 个 card ID。

action/event 比较冻结为 exact card-ID set/multiset equality；不得使用 `localeCompare`，action 内 duplicate ID、missing、extra、foreign ID 独立失败，不能只比较长度。event 保留 canonical order，hand 删除按 card ID。RED 直接调用 `runRolloutReplicate`：合法 pair、合法 full-house、canonical order 不同的同集合成功，四类 forged identity failure typed。

### F2 — unknown-input kernel boundary

当前 `runRolloutReplicate` 在 envelope/schema 防护前读取 `validatedBudget` 并 clone `scenario.privateState`，finding confirmed。冻结流水线：

~~~text
unknown input -> strict envelope/prototype/own-key/data-descriptor validation
               -> nested plain-data validation -> semantic validation
               -> fresh isolated projection -> rollout execution
~~~

exact envelope keys 为 `candidate`、`scenario`、`publicState`、`replicateIdentity`、`random`、`validatedBudget`。字段读取前完成 `Object.getPrototypeOf`、`Reflect.ownKeys`、exact own keys、own data descriptor、无 accessor/symbol/function；plain record、canonical contiguous `Array.prototype`、无 sparse/expando/custom iterator/map；safe integer/finite/nonnegative 及 `-0` 规则沿用 contracts。cycle、Proxy trap、getter、callback 失败 typed，getter/callback 计数为 0；clone 只用于已验证安全图/可信内部图；no throw/no partial/no hostile/private diagnostics。现有 `validateRolloutBudget` 复用，本轮不改 contracts union/interface。

### F3 — nested seat-local observation

exact observation keys：`hand`、`publicHistoryEvents`、`handCounts`、`currentLastPlay`、`finishOrder`、`gameRank`。policy 只得到 acting seat hand 与公开数据，不得到 privateState、scenario、其他 seat hands、weights 或 seed。

Card exact schema 为 suited `id/kind/rank/suit/copy` 或 joker `id/kind/rank/copy`，字段关系与 `createDeck` 一致；hand ID 唯一。`handCounts` exact `0`,`1`,`2`,`3`，count finite/nonnegative/safe integer，拒绝 `-0`；finishOrder canonical unique seats；gameRank 属于 `RANKS`。currentLastPlay 必须是 null 或完整 canonical CardGroup；publicHistoryEvents 必须先递归 descriptor/prototype/own-key 检查，再通过 finalized public-event/hash 语义验证。所有 nested graph 先验证后 clone/freeze；getter/accessor/symbol/custom prototype/function/sparse/expando fail，caller 不被保留；throwing `CrnView.value()` 为 typed `invalid-policy-context/ply`，不产生 action。

### F4 — Room-authoritative early terminal

正式 `Room.advanceAfterAction` 只在前三名已完成或前两名完成者是搭档时终局；普通两名非搭档继续，已完成 seat 跳过。Task 4 不修改 Room/settlement。root 与每个 policy action 的 transition/conservation 成功后立即检查；root early terminal 即使最小 budget 也不调用 policy、不走 budget-exhausted、不调用 leaf。顺序：nextState hand/count/finish/trick/turn 更新 → transition → conservation → terminal projection → terminal utility；非 terminal 才 stable-state → leaf。

projection 保留真实 prefix；三人完成追加唯一剩余 seat；前两名为搭档且尚无第三名时，从最后真实 finisher 按 seat-1 modulo 4 的 `nextPlayableSeat` 方向跳过已完成 seat 追加剩余两席；完整四席原样保留。示例 `[0,2] -> [0,2,1,3]`、`[1,3] -> [1,3,2,0]`、`[0,1,2] -> [0,1,2,3]`；`[0,2,1,3]` 的 perspective 0/1 utility 为 `+3/-3`。不得按绝对 seat number 排序或用 leaf heuristic 伪造 terminal 名次。

### F5 — independent card universe

~~~text
U = Set(createDeck().map(card => card.id))
|U| = 108
physicalLocations = Set(all four hand card IDs ∪ publicPlayedCardIds)
require physicalLocations === U
~~~

hands/publicPlayed 各自 unique、彼此 disjoint、全属于 U、并集 exact U；expected IDs 直接来自 trusted `createDeck`。history event IDs、currentLastPlay.cards、current-trick stable key 是同一 played card 的重复公开视图，不计入 physicalLocations；tribute/return 是 hand transfer 视图，不创造/销毁牌。source replay 先用 `validateCanonicalInitialDeal/createDeck`，kernel 再复核 U。canonical full deck 和正常 multi-particle replay 成功；missing/extra/duplicate/overlap/forged fail。

### F6 — atomic transition

root play、policy play 和 pass 共用 `accepted immutable current → independent nextState → apply/update hand/count/finish/trick/turn/public → transition validation → conservation → terminal projection or stable-state validation → terminal utility or leaf on nextState → commit`。validated transition 前不得污染 current state，不得先写后回滚；失败丢弃 nextState，结果无 state/nextState/private diagnostics，caller input 不变。RED 覆盖 play/pass post-validation、conservation、terminal projection、illegal policy action，并断言 accepted state/caller/no-partial。

### F7 — observation/CRN order

固定顺序：`current stable state → validated seat-local observation → current ply/acting-seat CRN coordinate/view → fixed policy → action validation → transactional transition`。observation 不含 CRN private material；CRN 仍用当前 ply/actingSeat；policyId/candidateId 不进 CRN，Task 3 known vectors 不变。

### Failure mapping

现有 union 足够，不新增 contracts 字段、optional string 或 throw API：malformed envelope、invalid scenario/private state、invalid candidate、CRN failure 为 `simulation-failed/replay`；kernel invalid observation 为 replay，direct policy invalid observation 为 `{ kind: "invalid-policy-context", field: "actingSeat" }`；card universe、transition、conservation 为 `simulation-failed/state-conservation`；policy failure 为 `policy-failed`; terminal projection 为 `simulation-failed/leaf-evaluation`；budget 为 exact `{ kind: "budget-exhausted", workUnits, maximumWorkUnits }`。`CrnView.value()` throw 在 policy 归一化为 `invalid-policy-context/ply`。所有 failure no throw/no partial/no private diagnostics。

### Next-round exact code allowlist

以下六路径必须与 Design Spec、Implementation Plan 完全一致：

~~~text
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
src/ai/rollout/stateConservation.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

`contracts.ts` 不加入：现有 failure union/interface 足够，`validateRolloutBudget` 已可复用。`particleBankRolloutBoundary.test.ts` 不加入：Task 4 不改 bridge/source，kernel.test 调用真实 source replay。禁止 game/engine/particles/planning/decision-engine、package/lock/config 和 Task 5–9 paths。

### Frozen TDD RED matrix

| slice | real entry and required RED | required GREEN |
| --- | --- | --- |
| multi-card | `runRolloutReplicate` root pair/full-house order mismatch; duplicate/missing/extra/foreign | legal permutations pass; exact identity failures typed; event canonical |
| kernel boundary | `runRolloutReplicate(unknown)` top/nested/budget getter, symbol/accessor, custom prototype, inherited iterator/map, sparse/expando, cycle | getter/callback 0, typed no-throw/no-partial/no-private diagnostics |
| policy observation | list/choose with NaN/Infinity/fraction/negative/unsafe/-0 counts, missing/extra keys, duplicate/unknown finish, malformed card/event, nested getter, throwing CRN | complete schema, caller unchanged, no partial action, local-only observation |
| terminal | root/policy partner-first-two, three complete, ordinary nonterminal, minimum budget, utility/rotation | immediate terminal, no later policy/leaf, completed-seat skip, full projection, `+3/-3` |
| universe | canonical deck, missing/extra/duplicate/overlap/forged kernel and real source replay with history/current-trick/transfer views | exact U, transfer invariant, repeated views not double-counted, normal replay success |
| transaction | play/pass post-validation, conservation, terminal projection, illegal policy action | accepted/current and caller unchanged, no partial result/diagnostics, one path |

Missing module/import/empty collection is invalid RED; each row must fail on behavior at the named production entry. This round runs no tests or compiler/build/benchmark. The retained gates are `AWAITING_FIXED_BENCHMARK_RUNNER`, `AWAITING_NODE22_CI` and `Task 9 full permitted regression`; status is `TASK 4 STATE-MACHINE REMEDIATION DESIGN FROZEN / TASK 4 CODE REMEDIATION PENDING / TASK 5 NOT STARTED` and this is not D2F Shadow release ready.

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
