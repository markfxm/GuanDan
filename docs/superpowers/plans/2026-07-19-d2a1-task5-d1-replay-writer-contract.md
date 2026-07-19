# D2a.1 Task 5A D1 Replay Writer Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the D1 benchmark writer/envelope mismatch as a narrowly scoped Task 5A deliverable, while preserving D1-specific replay data, match IDs, provenance, and frozen D0/D1 evidence.

**Architecture:** Keep `writeD1Replay` as the D1-specific writer because D1 validation and `replayD1Match` consume D1 extension fields and D1 config-hash-based match IDs that are not produced by generic `writeReplay`. Treat `schemaVersion` as the current replay envelope version (`"1"` for non-D0 documents) and retain `"d1-replay-v1"` as the D1 semantic `replayVersion`. Do not add a generic `replayMatch` adapter: the repository has no caller that passes `writeD1Replay` output to `replayMatch`, while `benchmark:d1:replay` already consumes the D1-specific path.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, the existing `ReplayDocument`, `writeD1Replay`, `replayD1Match`, `replayMatch`, `buildGamesForSeed`, and `simulateGame` implementations.

## Global Constraints

- This plan starts from `9546f26882200498d4a02bcd89be3e240660a49d` on branch `codex/d2a1-task5`.
- This document is Task 5A, not the complete original Task 5. The current round is preflight and plan-only. It must not modify production replay code, `writeD1Replay`, `ReplayDocument`, the validator, benchmark output, fixtures, artifacts, approval files, hashes, or lockfiles.
- A future implementation may modify only the files listed by an implementation task in this plan. Any additional file requires a new review decision.
- `D1_REPLAY_SCHEMA` remains exactly `"d1-replay-v1"`; it is the D1 semantic replay/provenance version, not the `ReplayDocument.schemaVersion` envelope discriminator.
- `ReplayDocument.schemaVersion` remains the existing union `"1" | "2"`; this plan does not modify `tests/benchmark/contracts.ts`.
- D0 `benchmarkVersion === "d0-r1"` remains envelope `schemaVersion === "2"`; all non-D0 replay documents, including D1, use envelope `schemaVersion === "1"`.
- D0/D1 fixtures, committed artifacts, approval files, provenance, trace hashes, final-state hashes, and frozen schemas are read-only evidence.
- The original Task 5 requirements for store reopen, concurrent allocation, standalone public-event replay, and provider-independent identity are not silently declared complete by Task 5A; they require a separate plan and approval.
- No smoke, calibration, formal, standalone benchmark, simulation workload, performance workload, or D2b execution is authorized by this plan.
- `formalExecutionAllowed=false` remains unchanged.

## Confirmed Preflight Findings

### Current failure

`tests/benchmark/d1ReplayValidation.ts:40-68` currently writes:

- `schemaVersion: "d1-replay-v1"`, which is outside the current `ReplayDocument.schemaVersion` union and is rejected by `scripts/replayAiBenchmark.ts:14` for non-D0 documents;
- no `rank`, although `ReplayDocument` requires `rank` and both replay consumers read it;
- D1 extension fields `allocation`, `handCountChanges`, `trickEvents`, and `tributeEvents`, which are required by the D1 validator but are not part of the generic `ReplayDocument` interface;
- the D1 semantic version through `replayVersion`, which is the correct place to preserve `"d1-replay-v1"`.

The D1 writer therefore has two distinct version concepts that are currently conflated. The implementation must separate them without renaming the existing D1 semantic version.

### ReplayDocument field accounting

The following matrix is based on the actual ReplayDocument interface, the current writeD1Replay, writeReplay, SimulationSummary, and legacyD1Compatibility.test.ts. replayMode and durationMs are optional in ReplayDocument; finalPublicState is not a ReplayDocument field, but the current D1 writer emits it when summary.finalPublicState is defined and that behavior is preserved.

| Field | Required by ReplayDocument | Current writeD1Replay | Corrected source | Allowed change |
|---|---:|---|---|---|
| schemaVersion | yes | "d1-replay-v1" | literal "1" | change only this value |
| replayVersion | yes | versions.replayVersion | same | no |
| benchmarkVersion | yes | versions.benchmarkVersion | same | no |
| engineVersion | yes | versions.engineVersion | same | no |
| roomRulesVersion | yes | versions.roomRulesVersion | same | no |
| configHash | yes | summary.configHash | same | no |
| matchId | yes | summary.matchId | same | no |
| seed | yes | summary.seed | same | no |
| rank | yes | missing | summary.rank | add only missing field |
| rotation | yes | summary.rotation | same | no |
| strategiesBySeat | yes | ordered summary.strategiesBySeat | same ordering/helper | no |
| strategyDescriptors | yes | versions.strategyDescriptors | same | no |
| deterministicRandom | yes | summary.randomProvenance or current fallback | summary.randomProvenance, after required-field guard | no semantic change; fail closed if absent |
| publicEvents | yes | summary.publicEvents or [] | same | no |
| finishOrder | yes | copy of summary.finishOrder | same | no |
| winnerTeam | yes | summary.winnerTeam | same | no |
| teamScore | yes | copied { 0, 1 } values | same | no |
| replayMode | optional | omitted | omitted | no opportunistic addition |
| actionCount | yes | summary.actionCount | same | no |
| publicTraceHash | yes | summary.publicTraceHash | same | no |
| finalPublicStateHash | yes | summary.finalPublicStateHash | same | no |
| durationMs | optional | omitted | omitted | no opportunistic addition |
| finalPublicState | outside ReplayDocument | emitted when defined | same conditional spread | no semantic change |
| D1 allocation and extension arrays | outside ReplayDocument | emitted | same typed extraction | no semantic change |

The fixed D1 summary must therefore differ from the current JSON only by schemaVersion: "d1-replay-v1" becoming schemaVersion: "1" and adding rank: summary.rank. No implementation step may add replayMode or durationMs merely because generic writeReplay emits them. The Task 4 local ReplayDocument fixture explicitly writes those optional fields because it is a complete generic replay fixture; that does not authorize changing the D1 writer.

### Inventory table

| Component | File | Purpose | Callers | Production? |
|---|---|---|---|---|
| `writeD1Replay` | `tests/benchmark/d1ReplayValidation.ts:40` | Writes D1 replay JSON with D1 extension fields and D1 output naming | `scripts/runD1TopKBenchmark.ts:9,161` | No; benchmark/test tooling |
| `writeReplay` | `tests/benchmark/reporting.ts:82-119` | Writes the generic `ReplayDocument` consumed by the ordinary AI benchmark replay path | `scripts/runAiBenchmark.ts:13,108`, `tests/benchmark/cli.test.ts`, `tests/benchmark/reproducibility.test.ts`, reporting tests | No; benchmark/test tooling |
| `ReplayDocument` | `tests/benchmark/contracts.ts:114-137` | Generic replay envelope and public replay payload contract | `writeReplay`, `replayMatch`, compatibility tests | No; benchmark/test contract |
| `replayMatch` | `scripts/replayAiBenchmark.ts:9-30` | Reads a generic replay document, rebuilds a task, runs real simulation, and compares public/final hashes | `scripts/runAiBenchmark.ts:34,58`, CLI/reproducibility tests, Task 4 characterization | Script tooling, not room/server production |
| `replayD1Match` / `replayD1Directory` | `scripts/replayD1TopKBenchmark.ts:5-26` | Validates and replays D1-specific documents using allocation/rotation and D1 config-hash semantics | package script `benchmark:d1:replay`, D1 tooling/docs | Script tooling |
| D1 validator | `tests/benchmark/d1ReplayValidation.ts:7-36` | Validates D1 provenance, extension fields, privacy, IDs, and hashes | `scripts/replayD1TopKBenchmark.ts`, D1 validation tests, writer | No; benchmark/test tooling |
| D1 benchmark runner | `scripts/runD1TopKBenchmark.ts:74-165` | Generates D1 raw batches/manifests and calls `writeD1Replay` when replay mode is `failures` or `all` | `package.json:17`, D1 CLI tests, documented commands | Script tooling |

### Caller and artifact results

1. `writeD1Replay` has exactly one repository caller: the D1 benchmark runner. It has no server, UI, room-engine, ledger, or replay-runtime caller.
2. `writeReplay` and `writeD1Replay` overlap in core fields and hashes but do not have identical responsibilities. `writeD1Replay` also writes D1 extension arrays and is consumed by `replayD1TopKBenchmark.ts`; `writeReplay` writes the generic envelope used by `replayMatch` and the ordinary AI benchmark.
3. No committed D1 replay JSON files are present. `git ls-files` contains no `d1-replay` or `ai-benchmark-replays-d1-*` JSON. The tracked approval file `docs/benchmark-approvals/d1-topk-calibration-approval.json` records hashes and an externally archived calibration report, so external raw/replay archives cannot be ruled out from repository evidence.
4. The repository contains no README or CI invocation of `runD1TopKBenchmark`; the package script `benchmark:d1`, D1 CLI tests, D1 replay package script, and historical plan documents are in-repository consumers.
5. `"d1-replay-v1"` is used by `D1_REPLAY_SCHEMA`, D1 execution provenance, D1 manifest/review tests, D1 validator fixtures, and the D1 writer. These are semantic D1 version consumers, not evidence that `ReplayDocument.schemaVersion` should accept the string.
6. `ReplayDocument.schemaVersion` history is explicit: it began as `"1"` in commit `688ddc0`, and commit `95c84a5` added `"2"` for the D0 rerun envelope while changing `writeReplay` and `replayMatch` so only D0 uses `"2"` and non-D0 documents use `"1"`. D1 must therefore remain envelope version `"1"`.

## Original Task 5 Scope Accounting

Task 5A is not the complete original Task 5. The following table records evidence instead of inferring coverage from the D1 writer blocker:

| Original requirement | Existing evidence | Covered by Task 4 | Remaining after Task 5A |
|---|---|---|---|
| Store reopen returns the same allocation | `tests/server/apiIdempotency.test.ts` test `recovers committed allocation metadata after restart without recreating the room or reusing gameId`; the separately named `tests/server/publicIdentityStoreRestart.test.ts` does not exist in this repository | Yes, as server characterization | No additional Task 5A work; preserve as prior evidence |
| Concurrent allocation does not duplicate a same-key allocation | `tests/server/publicIdentityConcurrency.test.ts` uses two child processes and `Promise.all`; same-key, different-key, and conflict scenarios are asserted | Yes, as server characterization | No additional Task 5A work; preserve as prior evidence |
| Standalone public-event replay | `tests/server/apiIdempotency.test.ts` builds a `PublicLedgerReplayDocument` and calls real `rebuildPublicLedger`; `tests/game/publicEventRoomAdapter.test.ts` covers public event/ledger construction; no file named `tests/game/publicEventReplayIdentity.test.ts` exists | Partially; Task 4 replay characterization is legacy benchmark replay, not this server ledger round trip | Requires a separate Task 5 plan if standalone replay is still required |
| Provider-independent identity | `tests/game/publicEventIdentity.test.ts` proves deterministic identity construction; Task 4 source-boundary tests prove legacy replay does not import provider/store | Yes for the approved legacy/replay boundary | Any broader provider-independent identity requirement requires a separate plan |
| D1 writer contract mismatch | `tests/benchmark/d1ReplayValidation.ts`, `scripts/runD1TopKBenchmark.ts`, and `scripts/replayD1TopKBenchmark.ts` show the invalid envelope/missing-rank path | No; Task 4 explicitly left it unresolved | Task 5A scope |

Therefore this plan is explicitly named **D2a.1 Task 5A D1 Replay Writer Remediation**. Task 5A completion is not Task 5 completion. The remaining standalone public-event replay or provider/store requirements need an independent implementation plan and approval; they are not hidden inside the D1 writer fix.

## Calibration Review External-Evidence Preflight

Before implementation, the existing read-only preflight command was run:

```bash
npx vitest run tests/benchmark/d1CalibrationReview.test.ts --testTimeout=120000 --reporter=verbose
```

Result: 1 file, 5 tests; 4 passed and 1 failed because `artifacts/ai-benchmark-d1-calibration-v2` is absent (`ENOENT` in `inventoryDirectory`). This is an external-evidence gate, not a D1 writer code failure. Task 5A must not create the missing artifact, run calibration, modify approval JSON, or weaken the test. The final gate must either obtain the externally approved evidence through an independently authorized process or report the gate as blocked; it must not relabel this as a local pass.

## Chosen Direction: Option B Without a Generic Replay Adapter

The implementation plan chooses Option B: retain `writeD1Replay` and correct its envelope contract, while preserving its D1-specific payload and D1 match-ID semantics. The generic adapter is removed from the plan because no repository caller passes `writeD1Replay` output to `replayMatch`; `scripts/replayD1TopKBenchmark.ts` is already the complete D1 consumer.

| Option | Impact | D0/D1 reproducibility | Existing artifacts | Migration | Risk assessment |
|---|---|---|---|---|---|
| A. Retire `writeD1Replay` and use `writeReplay` | Requires moving D1 extension fields into the generic writer or weakening the D1 validator; changes D1 output shape and likely D1 replay paths | High risk because D1 match IDs/config hashes and extension fields are different from the generic writer | External D1 archives may no longer validate; output paths and field sets can change | Requires runner, validator, D1 replayer, tests, and archive migration | Not recommended; conflates two intentional replay contracts |
| B. Keep `writeD1Replay`, correct envelope, preserve D1 version as `replayVersion` | Changes only the invalid envelope field and missing required rank; retains extension fields and D1 output path | Lowest risk; D1 `replayVersion`, match IDs, config hashes, public hashes, and provenance remain stable | Existing `replayVersion: "d1-replay-v1"` remains recognizable; old invalid envelope files require explicit migration or rejection | New writer output is valid; old external files are not silently rewritten | Recommended; smallest contract-preserving change |
| C. Introduce `d1-replay-v2` | Creates a new semantic version and requires versioned validation/consumption paths | Direct risk to D1 provenance and approval compatibility | Requires migration or dual-reader support for external archives | Requires new schema/version decisions and archive inventory | Not justified; no evidence requires a new payload schema |

The existing D1-specific consumer already locates a task by `rotation` and `allocation`, then applies the recorded D1 `configHash` and `matchId`. Task 5A will test that path directly. The generic `replayMatch` path remains unchanged and continues to serve ordinary `writeReplay` documents; its existing callers are `scripts/runAiBenchmark.ts`, `tests/benchmark/cli.test.ts`, and `tests/benchmark/reproducibility.test.ts`, not `writeD1Replay`.

## Future Implementation Scope Matrix

Allowed in the separately authorized Task 5A implementation:

- `tests/benchmark/d1ReplayValidation.ts` for the writer and D1 validator correction;
- `tests/benchmark/d1ReplayValidation.test.ts` and `tests/benchmark/d1ReplayWriterCompatibility.test.ts` for characterization and regression coverage;
- focused test-only helpers under `tests/benchmark/` when a review proves they are required for the fixed-seed D1 writer/replayer round trip.

Forbidden in Task 5A:

- `tests/benchmark/contracts.ts` and any change to the `ReplayDocument` interface;
- `tests/benchmark/d1ProvenanceV2.ts` and any change to `D1_REPLAY_SCHEMA`, `D1_RESULT_SCHEMA`, provenance, or hash semantics;
- `scripts/runD1TopKBenchmark.ts` output identity, D1 batch/manifests, or output paths unless a separate scope decision approves it;
- `scripts/replayAiBenchmark.ts` and `scripts/replayD1TopKBenchmark.ts` production/script logic; the existing D1 consumer is tested, not redesigned;
- D0 fixtures, D1 fixtures, approval JSON, raw/report/replay artifacts, artifact inventory hashes, trace hashes, final-state hashes, server/game/ledger/replay runtime, and lockfiles.

## Implementation Tasks

### Task 1: Characterize the D1 writer contract

**Files:**

- Modify: `tests/benchmark/d1ReplayValidation.test.ts`
- Create: `tests/benchmark/d1ReplayWriterCompatibility.test.ts`
- Read-only references: `tests/benchmark/contracts.ts`, `tests/benchmark/d1ProvenanceV2.ts`, `tests/benchmark/d1Matrix.ts`, `tests/benchmark/rotations.ts`, `tests/benchmark/simulator.ts`, `scripts/replayD1TopKBenchmark.ts`

**Interfaces:**

- The test creates a fixed D1 task using `buildGamesForSeed` and the existing `expectedMatchId` helper from `tests/benchmark/d1Matrix.ts`.
- The test runs the real `simulateGame`, passes the real summary to `writeD1Replay`, reads the JSON file, and exercises the existing D1 consumer `replayD1Match`.
- The test must not mock `writeD1Replay`, `replayD1Match`, `buildGamesForSeed`, `simulateGame`, validators, hashes, stores, or providers.

- [ ] **Step 1: Add the failing contract assertions.**

  Add assertions equivalent to:

  ```ts
  expect(document.schemaVersion).toBe("1");
  expect(document.replayVersion).toBe(D1_REPLAY_SCHEMA);
  expect(document.rank).toBe(task.config.rank);
  expect(validateD1Replay(document)).toBe(true);
  expect(replayD1Match(document)).toEqual({ verified: true, matchId: document.matchId });
  ```

  Assert that `allocation`, `handCountChanges`, `trickEvents`, and `tributeEvents` remain present, that the D1 output file name and directory are unchanged, and that the public/final hashes equal the real simulation result. Do not add a D1-to-generic `replayMatch` assertion: no repository caller uses that path, and generic `replayMatch` remains covered by its existing `tests/benchmark/cli.test.ts` and `tests/benchmark/reproducibility.test.ts` tests.

  Add old-document fail-closed characterization cases using a complete valid D1 document as the fixture:

  ```ts
  expect(() => validateD1Replay({ ...document, schemaVersion: "d1-replay-v1" })).toThrow("D1_REPLAY_SCHEMA_MISMATCH");
  expect(() => validateD1Replay({ ...document, rank: undefined })).toThrow("PROVENANCE_MISSING:rank");
  ```

  These tests must assert that validation/replay does not rewrite the input object or create a new output file. The generic `writeReplay`/`replayMatch` version split remains an unchanged regression surface, not a new D1 adapter requirement.

  The fixed-summary assertions must include:

  ```ts
  expect(document.replayMode).toBeUndefined();
  expect(document.durationMs).toBeUndefined();
  expect(document.finalPublicState).toEqual(summary.finalPublicState);
  expect(path.dirname(outputPath)).toBe(expectedOutputDirectory);
  expect(path.basename(outputPath)).toBe(expectedFileName);
  ```

- [ ] **Step 2: Run the characterization RED command.**

  ```bash
  npx vitest run tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected RED evidence is the current writer's `schemaVersion: "d1-replay-v1"`, missing `rank`, or the old-document case being accepted. If the test fails before reaching these assertions for another reason, stop and report a harness/contract mismatch; do not modify production or frozen files.

- [ ] **Step 3: Commit only the characterization tests.**

  ```bash
  git add tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts
  git commit -m "test: characterize D1 replay writer contract"
  ```

### Task 2: Correct `writeD1Replay` without changing the generic contract

**Files:**

- Modify: `tests/benchmark/d1ReplayValidation.ts`
- Modify: `tests/benchmark/d1ReplayValidation.test.ts` only for test fixtures that encode the corrected envelope/version separation
- Do not modify: `tests/benchmark/contracts.ts`, `tests/benchmark/d1ProvenanceV2.ts`, `tests/benchmark/reporting.ts`, D0/D1 fixtures, approval files, artifacts, or hashes

**Interfaces:**

- Keep `writeD1Replay(summary, outputDir, versions): string` unchanged at the call boundary.
- Keep `D1_REPLAY_SCHEMA === "d1-replay-v1"` unchanged.
- The implementation signature must use the existing simulation and descriptor types rather than a second structural summary contract:

  ```ts
  export function writeD1Replay(summary: SimulationSummary, outputDir: string, versions: {
    benchmarkVersion: string;
    replayVersion: string;
    engineVersion: string;
    roomRulesVersion: string;
    strategyDescriptors: StrategyDescriptor[];
  }): string;
  ```

  Define and export the writer's in-memory document as the following D1-only intersection; do not widen or edit `ReplayDocument` itself:

  ```ts
  export type D1ReplayDocument = ReplayDocument & {
    allocation: NonNullable<SimulationSummary["allocation"]>;
    handCountChanges: Array<NonNullable<PublicSimulationEvent["handCountChanges"]>>;
    trickEvents: Array<NonNullable<PublicSimulationEvent["trick"]>>;
    tributeEvents: Array<NonNullable<PublicSimulationEvent["tributeEvents"]>[number]>;
    finalPublicState?: NonNullable<SimulationSummary["finalPublicState"]>;
  };
  ```

  The implementation must use only type-only imports for the types actually referenced above:

  ```ts
  import type { ReplayDocument, StrategyDescriptor } from "./contracts";
  import type { PublicSimulationEvent, SimulationSummary } from "./simulator";
  ```

  Do not import `Seat` or `PublicTributeEvent`; they are not referenced by the final type. Do not replace the existing types with `unknown[]` or add runtime imports.

- [ ] **Step 1: Implement the minimum envelope correction.**

  Before building the object, require the D1 runner's durable fields:

  ```ts
  if (summary.allocation === undefined || summary.randomProvenance === undefined) {
    throw new Error("D1_REPLAY_PROVENANCE_MISSING");
  }
  const publicEvents = summary.publicEvents ?? [];
  const isDefined = <T>(value: T | undefined): value is NonNullable<T> => value !== undefined;
  const handCountChanges = publicEvents.map((event) => event.handCountChanges).filter(isDefined);
  const trickEvents = publicEvents.map((event) => event.trick).filter(isDefined);
  const tributeEvents = publicEvents.flatMap((event) => event.tributeEvents ?? []);
  ```

  The object built by `writeD1Replay` must contain the following stable separation:

  ```ts
  const replay = {
    schemaVersion: "1",
    replayVersion: versions.replayVersion,
    benchmarkVersion: versions.benchmarkVersion,
    engineVersion: versions.engineVersion,
    roomRulesVersion: versions.roomRulesVersion,
    configHash: summary.configHash,
    matchId: summary.matchId,
    seed: summary.seed,
    rank: summary.rank,
    allocation: summary.allocation,
    rotation: summary.rotation,
    strategiesBySeat: orderedSeats(summary.strategiesBySeat),
    strategyDescriptors: versions.strategyDescriptors,
    deterministicRandom: summary.randomProvenance,
    publicEvents,
    handCountChanges,
    trickEvents,
    tributeEvents,
    finishOrder: [...summary.finishOrder],
    winnerTeam: summary.winnerTeam,
    teamScore: { 0: summary.teamScore[0], 1: summary.teamScore[1] },
    actionCount: summary.actionCount,
    publicTraceHash: summary.publicTraceHash,
    finalPublicStateHash: summary.finalPublicStateHash,
    ...(summary.finalPublicState === undefined ? {} : { finalPublicState: summary.finalPublicState }),
  } satisfies D1ReplayDocument;
  ```

  The implementation must preserve the current D1 extension values and output path. It must not synthesize a new `PublicGameIdentity`, change `matchId`, alter `configHash`, change the existing map/filter/flatten/order extraction semantics, or change the random/provenance version. For one fixed D1 summary, the test must deep-equal every field listed in the matrix, including `replayMode` and `durationMs` remaining omitted/undefined, `finalPublicState`, all D1 extension arrays, and the output directory/file name. The only permitted JSON differences are envelope `schemaVersion` and the newly present `rank`.

- [ ] **Step 2: Tighten D1 validation to the corrected envelope.**

  Preserve the existing public runtime contract:

  export function validateD1Replay(
    replay: Record<string, unknown>,
    options?: D1ReplayValidationOptions,
  ): true;

  It is a throw-on-invalid boolean validator: valid documents return the literal true, and invalid documents throw; it never returns false. Do not change this to an unknown-input type predicate solely for writer typing. The validator must require rank and require schemaVersion === "1" for D1 replay documents. It must continue requiring all existing D1 extension fields, provenance fields, privacy checks, and hashes. replayVersion remains compared against an optional expected D1 version and remains "d1-replay-v1" in the runner.

  Freeze these error codes: an invalid envelope uses `D1_REPLAY_SCHEMA_MISMATCH`; a missing required field uses `PROVENANCE_MISSING:<field>`; a writer summary without `allocation` or `randomProvenance` uses `D1_REPLAY_PROVENANCE_MISSING`. Do not classify malformed old documents as a migration success.

  Preserve the existing validator callers and their return/error handling:

  | Caller | Uses return value? | Depends on throw? | JSON boundary |
  |---|---:|---:|---|
  | scripts/replayD1TopKBenchmark.ts:9 replayD1Directory | no | yes; invalid file aborts directory replay | parses external replay JSON then validates |
  | scripts/replayD1TopKBenchmark.ts:14 replayD1Match | no | yes; invalid document aborts match replay | receives caller-provided document |
  | tests/benchmark/d1ReplayValidation.ts:33 validateReplaySet | no | yes; counts privacy then rethrows | receives parsed replay records |
  | tests/benchmark/d1ReplayValidation.ts:68 writeD1Replay | no | yes; refuses to write invalid output | validates writer-created object before write |
  | tests/benchmark/d1ReplayValidation.test.ts:11-25 | yes for valid cases; exception assertions for invalid cases | yes | test fixtures only |

  validateD1RawResultV2 has a separate boolean/throw-on-invalid contract and callers only assert true or expected exceptions in tests/benchmark/d1ReplayValidation.test.ts; do not change it in Task 5A.

- [ ] **Step 3: Run the writer and validator GREEN tests.**

  ```bash
  npx vitest run tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected: all named tests pass; the generated document has envelope schema `"1"`, D1 semantic version `"d1-replay-v1"`, rank, unchanged D1 extension fields, unchanged output naming, and unchanged public/final hashes. The test must not invoke generic `replayMatch`.

- [ ] **Step 4: Commit the writer contract fix.**

  ```bash
  git add tests/benchmark/d1ReplayValidation.ts tests/benchmark/d1ReplayValidation.test.ts
  git commit -m "fix: align D1 replay writer with envelope contract"
  ```

### Task 3: Final D1 compatibility and frozen-evidence gate

**Files:**

- No additional production or contract files are permitted.
- Verification may read all repository files but must leave the worktree clean.

- [ ] **Step 1: Run D1-focused regression.**

  ```bash
  npx vitest run tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts tests/benchmark/d1Runner.test.ts tests/benchmark/d1CliArgs.test.ts tests/benchmark/d1ExecutionProvenance.test.ts tests/benchmark/d1Manifest.test.ts tests/benchmark/d1CalibrationReadiness.test.ts tests/benchmark/reporting.test.ts tests/benchmark/cli.test.ts tests/benchmark/reproducibility.test.ts --testTimeout=120000 --reporter=verbose
  ```

  This is Gate A, the local D1 compatibility gate. Expected: all D1 writer, validator, runner, provenance, manifest, calibration-readiness, generic writer, and generic replay tests pass. Record exact file/test counts, exit code, duration, natural exit, and stderr. Gate A does not include the external archive inventory test.

- [ ] **Step 2: Run D0 and general focused regression.**

  ```bash
  npx vitest run tests/ai/keepCurrentByteLock.test.ts tests/benchmark/keepCurrentLock.test.ts tests/server/apiCanonicalIdentity.test.ts tests/ui/productionIdentityLifecycle.test.tsx --testTimeout=120000 --reporter=verbose
  ```

- [ ] **Step 3: Run the complete local test suite.**

  ```bash
  npm test
  ```

  `npm test` must complete naturally with exit 0; benchmark, simulation, performance, smoke, calibration, and formal workloads remain excluded from this gate. Record exact file/test counts, exit code, duration, natural exit, and stderr.

- [ ] **Step 4: Run local typecheck, build, and diff validation.**

  ```bash
  npx tsc --noEmit
  npm run build
  git diff --check
  ```

  Each command must exit 0. Do not treat a tool timeout as a test failure; report timeout separately and rerun with a sufficient outer limit.

- [ ] **Step 5: Run the D0 fixture check-only gate.**

  ```bash
  npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree "../d0-fixture-ai-benchmark" --source-commit "e2a20e18f8e5c0871db38ad69426262e43766ce1" --output "tests/ai/fixtures/d0KeepCurrentCases.json" --generator-version "d0-fixture-v1" --check-only
  ```

  Compare fixture bytes before and after. Any byte drift is `D2A1_TASK5_FROZEN_EVIDENCE_DRIFT`; do not regenerate or repair the fixture in Task 5A.

- [ ] **Step 6: Verify browser and repository boundaries.**

  Run:

  ```bash
  git grep -n "writeD1Replay" -- src scripts tests
  git grep -n "writeReplay" -- src scripts tests
  git grep -n "replayMatch" -- src scripts tests
  git grep -n "ReplayDocument" -- src scripts tests
  git grep -n "d1-replay-v1" -- src scripts tests docs
  git grep -n "PublicIdentityStore\|createPublicIdentityProvider\|better-sqlite3" -- src/main.tsx src/ui scripts/replayAiBenchmark.ts scripts/replayD1TopKBenchmark.ts
  git ls-files | Select-String -Pattern "d1-replay|ai-benchmark-replays-d1|approval|artifact"
  git status --short
  ```

  Expected: `writeD1Replay` has one caller and `replayD1Match` is the D1 replay consumer; generic `replayMatch` callers remain limited to ordinary benchmark paths. No browser/server identity import appears; no D1 replay artifact or frozen evidence changes; the worktree is clean.

- [ ] **Step 7: Run Gate B, the external calibration-evidence gate last.**

  ```bash
  npx vitest run tests/benchmark/d1CalibrationReview.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Gate B runs only after Gate A, the D0/general focused regression, `npm test`, typecheck, build, D0 check-only, and repository/browser scans are complete. If the required external archive is mounted and the file passes, record its path, approval relationship, exact file/test count, exit code, duration, natural exit, and stderr. If the archive is absent and the test fails with the known `ENOENT` inventory error, classify the result as `D2A1_TASK5A_EXTERNAL_EVIDENCE_BLOCKED`; do not generate calibration artifacts, run calibration, modify approval JSON, weaken the test, or call Task 5A finally approved. Gate B does not block Task 1/Task 2 implementation, code review, or completion of local verification, but it blocks final approval.

  Final status classification is frozen:

  - All local gates pass and Gate B passes: `D2A1_TASK5A_COMPLETE_AWAITING_FINAL_REVIEW`.
  - All local gates pass and Gate B is blocked by the known missing external evidence: `D2A1_TASK5A_LOCALLY_COMPLETE_EXTERNAL_EVIDENCE_BLOCKED`.
  - The second status is not final approval.

- [ ] **Step 8: Commit and review boundaries.**

  The implementation must have no more than two implementation commits: characterization tests and writer contract fix. No commit may modify `tests/benchmark/contracts.ts`, `tests/benchmark/d1ProvenanceV2.ts`, D0/D1 fixtures, approval files, artifacts, or hash baselines.

## Compatibility and Rollback Boundary

- Existing files with `replayVersion: "d1-replay-v1"` are not silently relabeled or rewritten. The corrected writer emits envelope `schemaVersion: "1"` and retains the semantic version string.
- Existing D1 match IDs remain the canonical tuple containing the D1 config hash. The plan never replaces them with generic `buildGamesForSeed` IDs.
- Generic D0 and non-D1 `writeReplay` output remains owned by `tests/benchmark/reporting.ts`; it is not migrated into the D1 writer.
- If a repository or externally documented consumer requires the old invalid envelope string in the `schemaVersion` field, stop and request a compatibility decision. Do not add it back to `ReplayDocument`.
- If the D1 writer cannot round-trip through the existing `replayD1Match` without changing D1 match IDs, config hashes, public traces, final-state hashes, or frozen provenance, stop with `D2A1_TASK5_REPLAY_CONTRACT_MISMATCH`.
- If any D0/D1 fixture, artifact, approval, trace, schema, or hash changes, stop with `D2A1_TASK5_FROZEN_EVIDENCE_DRIFT` and revert only the new Task 5A commits using ordinary inverse commits; never reset, rebase, or force-update the approved history.
- If hidden consumers are discovered outside the repository, stop with `D2A1_TASK5_EXTERNAL_CONSUMER_REVIEW_REQUIRED`; preserve the existing semantic version and output path until an explicit migration is approved.
- Rollback is limited to reverting the Task 5A implementation commits in reverse order. The approved Task 4 commits and plan remediation commit remain untouched.

## Plan Self-Review

- The plan separates envelope `schemaVersion` from D1 semantic `replayVersion` and preserves both D0 version rules and D1 version strings.
- The plan covers the only writer caller, the D1-specific consumer, the generic consumer, package scripts, historical documentation, the approval file, the absence of committed D1 replay JSON, and the missing external calibration directory.
- The plan compares retirement, contract correction, and new-version strategies before selecting the smallest compatible design.
- Every implementation task has an explicit file set, interface boundary, RED/GREEN command, expected outcome, and commit boundary; the final gate has an explicit external-evidence stop condition.
- No Task 5A step modifies D0/D1 frozen evidence, `ReplayDocument`, `D1_REPLAY_SCHEMA`, or the D1 provenance/hash contract.
- No Task 5A implementation or D2b work is authorized by this plan, and Task 5A is not represented as complete Task 5.
