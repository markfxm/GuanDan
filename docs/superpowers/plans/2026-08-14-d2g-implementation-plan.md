# D2G Treatment / Active Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate D2F rollout ranking as a fair treatment over the unchanged production candidate universe, then introduce a controlled formal selector only after a frozen G1 `GO` verdict.

**Architecture:** Option A is canonical. A canonical benchmark Room owns seeded game state, public identity, and public ledger transitions. Paired games start from the same seed, same deal, same seating, same rotation, same AB/BA placement, and same initial canonical gameplay state; the pair root is shared while each arm uses an arm-qualified public identity/ledger namespace. Before first disagreement, both selectors use one immutable production decision snapshot and one `evaluatedCandidates` collection. After post-disagreement divergence, each arm calls production `decideAiAction` for its own current state; baseline uses the returned production selection, while treatment ranks that arm's current candidates and maps the top identity to the current candidate. G2 is a separate selector boundary and remains unimplemented until G1 is `GO`.

**Tech Stack:** TypeScript, canonical `RoomState`, `decideAiAction`, D2F rollout contracts/orchestrator, Vitest, existing D0/D1 paired bootstrap/statistics, manifest, replay, provenance, resume, and atomic artifact writers.

## Global Constraints

- Phase 0B is docs-only; it does not modify production AI behavior, Room formal action, rollout kernel, evaluator, planner, package metadata, tests, or workflow.
- G1 treatment may execute a rollout-selected legal candidate only inside the benchmark-only canonical adapter.
- G1 uses whole-game arms: all four AI seats in a baseline arm use production selection, and all four AI seats in a treatment arm use rollout selection mapped from their own current production decisions; baseline/treatment are not mixed within one arm game.
- Each pair has one `pairId` and two arm-qualified `gameId`/public-ledger namespaces. The pair shares gameplay inputs, but arm artifacts never share a game ID or event stream.
- `AB`/`BA` is a shared paired-placement token: it places baseline/treatment games in paired slots A/B or B/A and affects deterministic IDs/order/provenance, not seat policy or candidate source.
- Production `decideAiAction` is the sole candidate-generation entry.
- Baseline and treatment share one decision's state and `evaluatedCandidates`; post-disagreement arms do not share candidate lists after natural full-game divergence.
- Before the first action divergence, one immutable production decision snapshot is shared by both arm selectors: one `decideAiAction` call, one candidate-universe hash, and one candidate collection. Equal normalized gameplay-state/candidate-universe hashes are required; after divergence each arm calls production independently.
- Canonical Room/public identity/public ledger are authoritative for D2G benchmark execution; legacy benchmark Room is not authoritative.
- Reuse D0/D1 seed, rotation, AB/BA, bootstrap, manifest, replay, provenance, resume, report, and atomic artifact infrastructure.
- Calibration and formal seeds are disjoint; formal profile/config/seeds/statistics/report schema are frozen before formal execution.
- Correctness failures force `NO-GO`; disagreement rate alone never proves AI improvement.
- Do not invent particle, replicate, ply, latency, sample-size, or quality-effect thresholds before calibration data exists.
- D2F request/result `formalExecutionAllowed` remains `false`.
- G2 implementation is blocked until the formal G1 verdict is `GO`.

## Phase 0B hard stop

This document is a later implementation plan, not an execution authorization. During Phase 0B, workers must not create any listed source/test/script file, run smoke/calibration/formal benchmarks, register a treatment strategy, change production Room behavior, or implement G2. The G1/G2 task checkboxes become actionable only after this document is approved and a subsequent implementation request explicitly authorizes the relevant phase.

---

## Interfaces frozen by this plan

The names below describe planned seams. They are implementation contracts for later tasks, not Phase 0B source changes.

```typescript
type D2GDecisionMode = "disabled" | "shadow" | "active";

type D2GFallbackReason =
  | "disabled"
  | "rollout-unusable"
  | "stale-decision"
  | "candidate-mapping-failed"
  | "candidate-no-longer-legal"
  | "rollout-failed"
  | "unexpected-failure";

type D2GDecisionContext = {
  pairId: string;
  comparisonScope: "paired-same-decision" | "arm-independent";
  decisionIndex: number;
  actingSeat: Seat;
  preActionGameplayStateHash: string;
  privateOwnHandFingerprint: string;
  candidateUniverseHash: string;
  decisionIdentity: string;
};

type D2GDecisionTelemetry = {
  pairId: string;
  arm: "baseline" | "treatment";
  gameId: string;
  decisionIdentity: string;
  candidateUniverseHash: string;
  preActionGameplayStateHash: string;
  preActionArmLedgerHash: string;
  stateValidation: "current" | "stale";
  baselineCandidateId: string;
  selectedCandidateId: string;
  selection: "baseline" | "treatment";
  fallbackReason: D2GFallbackReason | "none";
  disagreement: boolean;
  rolloutWorkUnits: number;
  elapsedMs: number;
};
```

`D2GDecisionMode` is a G2 production-selector contract only. G1 benchmark arms use the benchmark treatment selector directly and never construct, consult, or enable production `active` mode; the default G2 mode is `disabled`.

Every later task preserves:

```text
aligned canonical state
  -> one decideAiAction call for the paired pre-disagreement decision
  -> evaluatedCandidates
  -> baseline candidate saved
  -> treatment ranking over same candidates
  -> current-candidate legality/mapping check
  -> one Room action execution
  -> runtime/plan update from actual execution

After the first action divergence, each arm repeats this sequence independently from its own canonical state and candidate collection.
```

## G1 Task 1: Treatment contracts and frozen profile

**Files:**

- Create: `src/ai/d2g/treatmentContracts.ts`
- Create: `tests/ai/d2g/treatmentContracts.test.ts`
- Create: `tests/ai/d2g/treatmentProfile.test.ts`
- Reuse without modification: `src/ai/rollout/contracts.ts`, `src/ai/rollout/d2fShadowObserver.ts`

**Interfaces:**

- Consumes: `AiDecision`, `ActionCandidate`, D2F rollout request/result types, and current public snapshot identity.
- Produces: fallback reasons, decision telemetry, profile schema/version constants, candidate identity/mapping contracts for Tasks 2–6.

The profile contains particle, replicate, max-plies, policy-evaluation, work-unit, evidence, and report metadata. Phase 0B freezes fields and versioning, not numeric values. A profile becomes formal only after calibration approval.

- [ ] **Step 1: Write RED tests** for exact mode/fallback unions, deterministic profile serialization, required profile version/config hash, disjoint calibration/formal seed manifests, and rejection of a candidate outside the decision universe.
- [ ] **Step 2: Run focused RED tests**:

  ```powershell
  npx vitest run tests/ai/d2g/treatmentContracts.test.ts tests/ai/d2g/treatmentProfile.test.ts --exclude "**/.worktrees/**" --reporter=verbose
  ```

  Expected: the new contracts are absent.
- [ ] **Step 3: Implement minimal typed contracts** without changing D2F contracts or enabling formal execution.
- [ ] **Step 4: Run the focused GREEN tests** and verify canonical JSON stability.
- [ ] **Step 5: Run the affected D2F contract/ranking shard** and verify both formal-execution flags remain false.
- [ ] **Step 6: Commit**:

  ```text
  feat(ai): add D2G treatment contracts
  ```

## G1 Task 2: Pure rollout treatment selector

**Files:**

- Create: `src/ai/d2g/treatmentSelector.ts`
- Create: `tests/ai/d2g/treatmentSelector.test.ts`
- Create: `tests/ai/d2g/treatmentMapping.test.ts`
- Reuse: `src/ai/aiDecisionEngine.ts` as the sole decision/candidate source.

**Interfaces:**

- Consumes: one current `AiDecision`, one immutable canonical pre-action snapshot, and one frozen `D2GTreatmentProfile`.
- Produces: `selectD2GTreatment(input): D2GTreatmentSelection` and decision telemetry. This is a selector/mapping adapter; it never evaluates, generates, or replans candidates.

```typescript
declare function selectD2GTreatment(input: {
  decision: AiDecision;
  preActionState: D2GPreActionState;
  decisionContext: D2GDecisionContext;
  profile: D2GTreatmentProfile;
}): D2GTreatmentSelection;
```

- [ ] **Step 1: Write RED tests** for baseline capture, same-candidate rollout input, candidate mapping, duplicate identity rejection, stale identity fallback, current-legality fallback, and no partial selection on rollout failure.
- [ ] **Step 2: Run focused RED tests** and confirm the selector is absent.
- [ ] **Step 3: Implement the smallest pure adapter** that builds a D2F request from the snapshot, preserves `formalExecutionAllowed: false`, invokes the detached rollout path, validates the current decision context hashes, maps the ranked identity to the exact current evaluated candidate, and returns baseline on unusable or stale result.
- [ ] **Step 4: Run GREEN tests** with a real production decision fixture; assert no independent candidate generator or evaluator invocation.
- [ ] **Step 5: Run focused D2F ranking, aggregation, evidence, kernel, privacy, and failure-atomicity suites.**
- [ ] **Step 6: Commit**:

  ```text
  feat(ai): add pure D2G treatment selector
  ```

## G1 Task 3: Canonical paired benchmark adapter

**Files:**

- Create: `tests/benchmark/d2gCanonicalAdapter.ts`
- Create: `tests/benchmark/d2gPairedSimulator.ts`
- Create: `tests/benchmark/d2gCanonicalAdapter.test.ts`
- Create: `tests/benchmark/d2gPairing.test.ts`
- Modify only if required by the frozen adapter contract: `tests/benchmark/rotations.ts`, `tests/benchmark/random.ts`

**Interfaces:**

- Consumes: canonical `createRoom`, `buildPublicGameIdentity`, public ledger/event APIs, Task 2 selector/mapping adapter, and existing seed/rotation/allocation tasks.
- Produces: one baseline arm game and one treatment arm game per `D2GPairUnit`, paired game results, decision telemetry, arm-qualified public-only replay input, and explicit tribute/return transition records.

```typescript
declare function createD2GCanonicalPairedTask(input: {
  pairId: string;
  seed: number;
  rotation: Seat;
  allocation: "AB" | "BA";
  matchup: string;
  configHash: string;
}): D2GPairedTask;

declare function simulateD2GPairedGame(task: D2GPairedTask): D2GPairedGameResult;
```

- [ ] **Step 1: Write RED tests** for canonical identity/ledger creation, pair ID plus arm-qualified game IDs, same initial gameplay-state hashes, whole-game arm assignment, four rotations, shared AB/BA placement, and no hidden-hand data in strategy observations.
- [ ] **Step 2: Run focused RED tests** and confirm legacy benchmark Room is rejected as the D2G authority.
- [ ] **Step 3: Implement canonical task creation** with deterministic seed/deal, `benchmark-scenario` identity, one pair ID, and distinct arm-qualified public identities/ledger namespaces that preserve the same gameplay inputs.
- [ ] **Step 4: Implement one-arm execution** so every AI action turn saves the immutable shared pre-disagreement decision snapshot, gives baseline the production selection and treatment the Task 2 mapped candidate, executes one action through canonical `playCards`/`passTurn`, and updates `aiRuntime`/`aiPlans` through the production-equivalent `applyExecutedAction`/actual-action lifecycle. Pending opening tribute/return is advanced through canonical `advanceOpeningTribute` in both arms, with no candidate decision or disagreement count.
- [ ] **Step 5: Implement paired orchestration** so equal normalized gameplay states use exactly one `decideAiAction` call and one shared `evaluatedCandidates` collection; once an action differs, states diverge naturally and each arm re-enters production decision independently.
- [ ] **Step 6: Run GREEN tests** for same-decision candidate snapshots, equality/hash mismatch unresolved handling, context-hash stale fallback, natural divergence, public ledger consistency through tribute/return, card conservation, replay determinism, arm namespace isolation, and exactly-once action execution.
- [ ] **Step 7: Run the affected canonical Room/public-ledger regression shard.**
- [ ] **Step 8: Commit**:

  ```text
  feat(benchmark): add canonical D2G paired adapter
  ```

## G1 Task 4: Statistics, report, manifest, and provenance

**Files:**

- Create: `tests/benchmark/d2gReportModel.ts`
- Create: `tests/benchmark/d2gStatistics.ts`
- Create: `tests/benchmark/d2gManifest.ts`
- Create: `tests/benchmark/d2gReportModel.test.ts`
- Create: `tests/benchmark/d2gManifest.test.ts`
- Modify only through reuse-compatible extensions: `tests/benchmark/reporting.ts`, `tests/benchmark/statistics.ts`, `tests/benchmark/d1ProvenanceV2.ts`

**Interfaces:**

- Consumes: paired game results and existing D0/D1 bootstrap/statistics/report/replay/provenance structures.
- Produces: raw outcomes, paired differences, disagreement subset, fallback/error counters, latency p50/p95/p99, work units, completeness, and provenance.

The frozen D2G report unit is `D2GPairUnit { pairId, baseSeed, rank, seating, rotation, allocation, profileHash, baselineGameId, treatmentGameId, baseline, treatment }`. `rank`, `seating`, `rotation`, `allocation`, and `profileHash` are top-level pair identity/provenance fields, not inferred from an arm record. Each base-seed block contains eight pair units (four rotations × AB/BA), and therefore sixteen arm-qualified game records. Reuse D0/D1 block/bootstrap algorithms and artifact writers, but adapt their input schema explicitly; do not pass two D2G arm records into the legacy eight-game validator as if they were ordinary A/B strategy games. Primary paired deltas are treatment minus baseline for the same canonical team slots; missing/failed/incomplete/incorrect units remain unresolved and stay in failure/completeness counters.

- [ ] **Step 1: Write RED report tests** for team win rate, canonical team score/level-step, finish order, paired outcome delta, disagreement subset, fallback/error counters, latency quantiles, work units, and incomplete-game handling.
- [ ] **Step 2: Run focused RED report/manifest tests** and confirm the D2G model is absent.
- [ ] **Step 3: Implement the report schema** with explicit pair-unit/arm fields, arm-qualified artifact namespaces, and unresolved-unit rules while reusing D0/D1 paired bootstrap and manifest semantics; do not create an independent bootstrap algorithm.
- [ ] **Step 4: Implement provenance validation** for source commit, engine/Room versions, profile hash, seed set, rotation/allocation matrix, replay schema, and statistics config.
- [ ] **Step 5: Run GREEN tests** for duplicate/missing/unknown IDs, resume compatibility, atomic artifacts, and public-only replay.
- [ ] **Step 6: Run D0/D1 benchmark contract, manifest, report, statistics, and replay focused tests.**
- [ ] **Step 7: Commit**:

  ```text
  feat(benchmark): add D2G paired report and provenance
  ```

## G1 Task 5: Smoke and limited calibration

**Files:**

- Create: `scripts/runD2GTreatmentBenchmark.ts`
- Create: `tests/benchmark/d2gCalibration.test.ts`
- Create: `tests/benchmark/d2gRunner.test.ts`

**Interfaces:**

- Consumes: Tasks 1–4, disjoint calibration seeds, and profile candidates.
- Produces: smoke results, limited calibration artifacts, profile comparison, and one proposed formal profile without silently changing source or data.

- [ ] **Step 1: Write RED runner tests** for phase separation, disjoint seeds, deterministic IDs, resume rejection on profile/provenance mismatch, and atomic output publication.
- [ ] **Step 2: Run focused RED runner tests** and confirm the D2G command is absent.
- [ ] **Step 3: Implement smoke execution** with an explicit small matrix and no formal label.
- [ ] **Step 4: Implement limited calibration** reporting quality, ESS, coverage, fallback, latency quantiles, work units, particle/replicate/ply settings, and correctness counters without unsupported hard thresholds.
- [ ] **Step 5: Freeze one calibration-approved formal profile and disjoint formal manifest**; formal execution reads but does not mutate them.
- [ ] **Step 6: Run smoke/calibration tests plus D0/D1 infrastructure regression.**
- [ ] **Step 7: Commit**:

  ```text
  feat(benchmark): add D2G smoke and calibration runner
  ```

## G1 Task 6: Formal paired evaluation and verdict

**Files:**

- Modify: `scripts/runD2GTreatmentBenchmark.ts` to add formal mode only after Task 5 freeze.
- Create: `tests/benchmark/d2gFormalGate.test.ts`
- Create: `tests/benchmark/d2gVerdict.ts`
- Create: `tests/benchmark/d2gFormalReport.test.ts`
- Generate ignored artifacts under `artifacts/d2g-formal/`.

**Interfaces:**

- Consumes: frozen formal profile, disjoint formal seeds, Task 4 report/provenance schema, and Task 5 approval.
- Produces: correctness verdict and one of `GO`, `NO-GO`, `INCONCLUSIVE`.

- [ ] **Step 1: Write RED formal-gate tests** for correctness counters, exact profile/seed/provenance match, no seed overlap, complete manifest, replay/provenance validity, and verdict classification.
- [ ] **Step 2: Run focused RED tests** and confirm formal mode cannot run without explicit frozen-profile approval.
- [ ] **Step 3: Implement formal execution** without post-start parameter mutation or relabeling a changed profile as the same evidence.
- [ ] **Step 4: Implement verdict calculation**: any correctness failure is `NO-GO`; credible frozen positive evidence may be `GO`; insufficient or neutral evidence is `INCONCLUSIVE`.
- [ ] **Step 5: Run GREEN formal-gate tests** with deterministic fixtures and failure cases.
- [ ] **Step 6: Run the required formal verification sequence and obtain independent review. Do not begin G2 unless the report is explicitly `GO`.**
- [ ] **Step 7: Commit**:

  ```text
  feat(benchmark): add D2G formal verdict gate
  ```

## G2 conditional tasks: only after G1 `GO`

These tasks are planned but not authorized in Phase 0B or during G1.

### G2 Task 1: Formal selector

Create a distinct selector boundary consuming current evidence, saved baseline, current `evaluatedCandidates`, mode, and activation conditions. It returns the current rollout candidate or saved baseline and does not change D2F formal-execution flags.

### G2 Task 2: Mode configuration

Add `disabled | shadow | active` ownership at trusted server/runtime construction. Default is `disabled`; a normal client request cannot enable active mode.

### G2 Task 3: Room integration

Integrate at the `runAiStep` decision boundary. Validate current state/candidate identity, execute exactly once, and call `applyExecutedAction` with the actual action.

### G2 Task 4: Focused active-mode verification

Cover disabled zero-call behavior, shadow non-interference, active success, fallback, stale candidate rejection, legality, privacy, ledger conservation, plan/runtime alignment, and exactly-once execution.

### G2 Task 5: Full regression, Node 22, and PR

Run focused suites, permitted regression, TypeScript/build, Node 22 CI, and independent code review. This task cannot start until G1 `GO` is recorded.

## Review checkpoints

- Every G1 task uses RED -> minimal implementation -> focused GREEN -> affected regression -> ordinary game-AI review -> commit.
- Reviewers prioritize legal card actions, candidate mapping, fair pairing, canonical ledger behavior, deterministic replay, runtime/plan truth, and evidence attribution.
- Hostile internal-object threat models are non-blocking unless a real production trust boundary demonstrates a fairness or state-integrity failure.
- No task may broaden benchmark-only treatment into production active selection.
