# D2a.1 Task 5 D1 Replay Writer Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the D1 replay writer produce a document that is valid under the current replay envelope contract, while preserving the D1-specific replay extension fields, match IDs, provenance, and frozen D0/D1 evidence.

**Architecture:** Keep `writeD1Replay` as the D1-specific writer because D1 replay validation and `replayD1Match` require D1 extension fields and D1 config-hash-based match IDs that are not produced by the generic `writeReplay` path. Treat `schemaVersion` as the current replay envelope version (`"1"` for non-D0 documents) and retain `"d1-replay-v1"` as the D1 semantic `replayVersion`. Add a narrowly scoped D1 match-tuple resolution branch to the generic `replayMatch` entry point so existing D1 writer output can be verified without changing D1 match IDs or the generic non-D1 path.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, the existing `ReplayDocument`, `writeD1Replay`, `replayD1Match`, `replayMatch`, `buildGamesForSeed`, and `simulateGame` implementations.

## Global Constraints

- This plan starts from `9546f26882200498d4a02bcd89be3e240660a49d` on branch `codex/d2a1-task5`.
- The current round is preflight and plan-only. It must not modify production replay code, `writeD1Replay`, `ReplayDocument`, the validator, benchmark output, fixtures, artifacts, approval files, hashes, or lockfiles.
- A future implementation may modify only the files listed by an implementation task in this plan. Any additional file requires a new review decision.
- `D1_REPLAY_SCHEMA` remains exactly `"d1-replay-v1"`; it is the D1 semantic replay/provenance version, not the `ReplayDocument.schemaVersion` envelope discriminator.
- `ReplayDocument.schemaVersion` remains the existing union `"1" | "2"`; this plan does not modify `tests/benchmark/contracts.ts`.
- D0 `benchmarkVersion === "d0-r1"` remains envelope `schemaVersion === "2"`; all non-D0 replay documents, including D1, use envelope `schemaVersion === "1"`.
- D0/D1 fixtures, committed artifacts, approval files, provenance, trace hashes, final-state hashes, and frozen schemas are read-only evidence.
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

## Chosen Direction: Option B with a Narrow D1 Replay Adapter

The implementation plan chooses Option B: retain `writeD1Replay` and correct its envelope contract, while preserving its D1-specific payload and D1 match-ID semantics.

| Option | Impact | D0/D1 reproducibility | Existing artifacts | Migration | Risk assessment |
|---|---|---|---|---|---|
| A. Retire `writeD1Replay` and use `writeReplay` | Requires moving D1 extension fields into the generic writer or weakening the D1 validator; changes D1 output shape and likely D1 replay paths | High risk because D1 match IDs/config hashes and extension fields are different from the generic writer | External D1 archives may no longer validate; output paths and field sets can change | Requires runner, validator, D1 replayer, tests, and archive migration | Not recommended; conflates two intentional replay contracts |
| B. Keep `writeD1Replay`, correct envelope, preserve D1 version as `replayVersion` | Changes only the invalid envelope field and missing required rank; retains extension fields and D1 output path | Lowest risk; D1 `replayVersion`, match IDs, config hashes, public hashes, and provenance remain stable | Existing `replayVersion: "d1-replay-v1"` remains recognizable; old invalid envelope files require explicit migration or rejection | New writer output is valid; old external files are not silently rewritten | Recommended; smallest contract-preserving change |
| C. Introduce `d1-replay-v2` | Creates a new semantic version and requires versioned validation/consumption paths | Direct risk to D1 provenance and approval compatibility | Requires migration or dual-reader support for external archives | Requires new schema/version decisions and archive inventory | Not justified; no evidence requires a new payload schema |

`replayMatch` needs a D1-only resolution branch because D1 runner match IDs include the phase/replay config hash, while the generic `buildGamesForSeed` candidate ID uses the basic benchmark config hash. Changing the writer to emit a generic ID would alter D1 allocation identity and reproducibility. The adapter will locate the D1 task by document matchup, allocation, rotation, seed, and rank, then apply the document's recorded `configHash` and `matchId` to the replay task exactly as the existing D1-specific consumer does. The existing non-D1 `replayMatch` path remains unchanged and is covered by its current tests.

## Future Implementation Scope Matrix

Allowed in the separately authorized Task 5 implementation:

- `tests/benchmark/d1ReplayValidation.ts` for the writer and D1 validator correction;
- `tests/benchmark/d1ReplayValidation.test.ts` and `tests/benchmark/d1ReplayWriterCompatibility.test.ts` for characterization and regression coverage;
- `scripts/replayAiBenchmark.ts` only for the narrowly scoped D1 match-tuple resolution branch justified above;
- focused test-only helpers under `tests/benchmark/` when a review proves they are required for the fixed-seed round trip.

Forbidden in Task 5:

- `tests/benchmark/contracts.ts` and any change to the `ReplayDocument` interface;
- `tests/benchmark/d1ProvenanceV2.ts` and any change to `D1_REPLAY_SCHEMA`, `D1_RESULT_SCHEMA`, provenance, or hash semantics;
- `scripts/runD1TopKBenchmark.ts` output identity, D1 batch/manifests, or output paths unless a separate scope decision approves it;
- `scripts/replayD1TopKBenchmark.ts` unless the focused compatibility test proves the existing consumer needs a non-contract bug fix;
- D0 fixtures, D1 fixtures, approval JSON, raw/report/replay artifacts, artifact inventory hashes, trace hashes, final-state hashes, server/game/ledger/replay runtime outside the explicitly justified adapter, and lockfiles.

## Implementation Tasks

### Task 1: Characterize the D1 writer contract

**Files:**

- Modify: `tests/benchmark/d1ReplayValidation.test.ts`
- Create: `tests/benchmark/d1ReplayWriterCompatibility.test.ts`
- Read-only references: `tests/benchmark/contracts.ts`, `tests/benchmark/d1ProvenanceV2.ts`, `tests/benchmark/rotations.ts`, `tests/benchmark/simulator.ts`, `scripts/replayD1TopKBenchmark.ts`, `scripts/replayAiBenchmark.ts`

**Interfaces:**

- The test creates a fixed D1 task using `buildGamesForSeed` and the existing `expectedMatchId` helper from `tests/benchmark/d1Matrix.ts`.
- The test runs the real `simulateGame`, passes the real summary to `writeD1Replay`, reads the JSON file, and exercises both `replayD1Match` and the generic `replayMatch` compatibility path.
- The test must not mock `writeD1Replay`, `replayD1Match`, `replayMatch`, `buildGamesForSeed`, `simulateGame`, validators, hashes, stores, or providers.

- [ ] **Step 1: Add the failing contract assertions.**

  Add assertions equivalent to:

  ```ts
  expect(document.schemaVersion).toBe("1");
  expect(document.replayVersion).toBe(D1_REPLAY_SCHEMA);
  expect(document.rank).toBe(task.config.rank);
  expect(validateD1Replay(document)).toBe(true);
  expect(replayD1Match(document)).toEqual({ verified: true, matchId: document.matchId });
  expect(replayMatch(document.matchId, replayRoot)).toMatchObject({ verified: true, matchId: document.matchId });
  ```

  Assert that `allocation`, `handCountChanges`, `trickEvents`, and `tributeEvents` remain present, that the D1 output file name and directory are unchanged, and that the public/final hashes equal the real simulation result. Add a regression assertion that the existing generic `writeReplay` tests continue to use envelope version `"1"` for D1/non-D0 and `"2"` only for D0.

- [ ] **Step 2: Run the characterization RED command.**

  ```bash
  npx vitest run tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected RED evidence is the current writer's `schemaVersion: "d1-replay-v1"`, missing `rank`, or the resulting replay resolution failure. If the test fails before reaching these assertions for another reason, stop and report a harness/contract mismatch; do not modify production or frozen files.

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
- Define the writer's in-memory document as `ReplayDocument` plus D1-only extension fields; do not widen or edit `ReplayDocument` itself.

- [ ] **Step 1: Implement the minimum envelope correction.**

  Before building the object, require the D1 runner's durable fields:

  ```ts
  if (summary.allocation === undefined || summary.randomProvenance === undefined) {
    throw new Error("D1_REPLAY_PROVENANCE_MISSING");
  }
  const publicEvents = summary.publicEvents ?? [];
  const handCountChanges = publicEvents.map((event) => event.handCountChanges).filter(Boolean);
  const trickEvents = publicEvents.map((event) => event.trick).filter(Boolean);
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
  } satisfies ReplayDocument & {
    allocation: string;
    handCountChanges: unknown[];
    trickEvents: unknown[];
    tributeEvents: unknown[];
  };
  ```

  The implementation must preserve the current D1 extension values and output path. It must not synthesize a new `PublicGameIdentity`, change `matchId`, alter `configHash`, normalize public events differently, or change the random/provenance version.

- [ ] **Step 2: Tighten D1 validation to the corrected envelope.**

  `validateD1Replay` must require `rank` and require `schemaVersion === "1"` for D1 replay documents. It must continue requiring all existing D1 extension fields, provenance fields, privacy checks, and hashes. `replayVersion` remains compared against an optional expected D1 version and remains `"d1-replay-v1"` in the runner.

- [ ] **Step 3: Run the writer and validator GREEN tests.**

  ```bash
  npx vitest run tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected: all named tests pass; the generated document has envelope schema `"1"`, D1 semantic version `"d1-replay-v1"`, rank, unchanged D1 extension fields, unchanged output naming, and unchanged public/final hashes.

- [ ] **Step 4: Commit the writer contract fix.**

  ```bash
  git add tests/benchmark/d1ReplayValidation.ts tests/benchmark/d1ReplayValidation.test.ts
  git commit -m "fix: align D1 replay writer with envelope contract"
  ```

### Task 3: Preserve D1 match IDs while enabling generic replay verification

**Files:**

- Modify: `scripts/replayAiBenchmark.ts`
- Modify: `tests/benchmark/d1ReplayWriterCompatibility.test.ts`
- Read-only and unchanged: `scripts/replayD1TopKBenchmark.ts`, `tests/benchmark/d1Matrix.ts`, `tests/benchmark/rotations.ts`

**Interfaces:**

- Non-D1 documents retain the current `buildGamesForSeed(...).find(candidate.matchId === document.matchId)` path and all existing error codes.
- D1 documents identified by `benchmarkVersion === "d1-topk-v1"` and `replayVersion === D1_REPLAY_SCHEMA` use a D1-only task resolver based on the document's parsed matchup, allocation, rotation, seed, and rank.
- The resolver returns the selected base task with `configHash: document.configHash` and `matchId: document.matchId`, matching the existing `replayD1Match` behavior without changing D1 IDs.

- [ ] **Step 1: Add a D1-only task resolver.**

  The resolver must:

  1. Parse the existing canonical `matchId` tuple.
  2. Build the base task with the document's benchmark version, rank, seed, matchup, and replay mode.
  3. Select by `rotation` and `allocation`, not by the generic base config-hash-derived candidate ID.
  4. Return the selected task with the recorded D1 `configHash` and `matchId`.
  5. Leave the generic non-D1 candidate-ID path byte-for-byte behaviorally unchanged.

  It must not allocate a room through server APIs, import provider/store code, change `ReplayDocument`, or change any D1 output identity.

- [ ] **Step 2: Prove both D1 replay consumers.**

  Extend the fixed-seed writer test to assert:

  ```ts
  expect(replayD1Match(document)).toEqual({ verified: true, matchId: document.matchId });
  expect(replayMatch(document.matchId, replayRoot)).toMatchObject({
    matchId: document.matchId,
    publicTraceHash: summary.publicTraceHash,
    finalPublicStateHash: summary.finalPublicStateHash,
    verified: true,
  });
  ```

  Also retain existing generic `writeReplay`/`replayMatch` tests to prove the new branch does not change D0 or ordinary benchmark replay behavior.

- [ ] **Step 3: Run the focused replay GREEN command.**

  ```bash
  npx vitest run tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts tests/benchmark/cli.test.ts tests/benchmark/reproducibility.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected: D1 writer-to-D1-replayer and D1 writer-to-generic-replay round trips verify true; ordinary replay tests retain their existing hashes and error behavior.

- [ ] **Step 4: Commit the D1 replay adapter.**

  ```bash
  git add scripts/replayAiBenchmark.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts
  git commit -m "fix: replay D1 documents by recorded match tuple"
  ```

### Task 4: Final compatibility and frozen-evidence gate

**Files:**

- No additional production or contract files are permitted.
- Verification may read all repository files but must leave the worktree clean.

- [ ] **Step 1: Run D1-focused regression.**

  ```bash
  npx vitest run tests/benchmark/d1ReplayValidation.test.ts tests/benchmark/d1ReplayWriterCompatibility.test.ts tests/benchmark/d1Runner.test.ts tests/benchmark/d1CliArgs.test.ts tests/benchmark/d1ExecutionProvenance.test.ts tests/benchmark/d1Manifest.test.ts tests/benchmark/d1CalibrationReadiness.test.ts tests/benchmark/d1CalibrationReview.test.ts tests/benchmark/reporting.test.ts tests/benchmark/cli.test.ts tests/benchmark/reproducibility.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected: all D1 writer, validator, runner, provenance, manifest, calibration-readiness, generic writer, and generic replay tests pass. Record exact file/test counts, exit code, duration, natural exit, and stderr.

- [ ] **Step 2: Run D0 and general regression.**

  ```bash
  npx vitest run tests/ai/keepCurrentByteLock.test.ts tests/benchmark/keepCurrentLock.test.ts tests/server/apiCanonicalIdentity.test.ts tests/ui/productionIdentityLifecycle.test.tsx --testTimeout=120000 --reporter=verbose
  npm test
  npx tsc --noEmit
  npm run build
  git diff --check
  ```

  `npm test` must complete naturally with exit 0; benchmark, simulation, performance, smoke, calibration, and formal workloads remain excluded from this gate. The D0 fixture check-only command must run separately and compare before/after bytes:

  ```bash
  npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree "../d0-fixture-ai-benchmark" --source-commit "e2a20e18f8e5c0871db38ad69426262e43766ce1" --output "tests/ai/fixtures/d0KeepCurrentCases.json" --generator-version "d0-fixture-v1" --check-only
  ```

- [ ] **Step 3: Verify browser and repository boundaries.**

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

  Expected: only the two explicitly intended replay consumers use the D1 writer path; no browser/server identity import appears; no D1 replay artifact or frozen evidence changes; the worktree is clean.

- [ ] **Step 4: Commit and review boundaries.**

  The implementation must have no more than three implementation commits: characterization tests, writer contract fix, and D1 replay adapter. No commit may modify `tests/benchmark/contracts.ts`, `tests/benchmark/d1ProvenanceV2.ts`, D0/D1 fixtures, approval files, artifacts, or hash baselines.

## Compatibility and Rollback Boundary

- Existing files with `replayVersion: "d1-replay-v1"` are not silently relabeled or rewritten. The corrected writer emits envelope `schemaVersion: "1"` and retains the semantic version string.
- Existing D1 match IDs remain the canonical tuple containing the D1 config hash. The plan never replaces them with generic `buildGamesForSeed` IDs.
- Generic D0 and non-D1 `writeReplay` output remains owned by `tests/benchmark/reporting.ts`; it is not migrated into the D1 writer.
- If a repository or externally documented consumer requires the old invalid envelope string in the `schemaVersion` field, stop and request a compatibility decision. Do not add it back to `ReplayDocument`.
- If the D1 writer cannot round-trip through both `replayD1Match` and the D1 branch of `replayMatch` without changing D1 match IDs, config hashes, public traces, final-state hashes, or frozen provenance, stop with `D2A1_TASK5_REPLAY_CONTRACT_MISMATCH`.
- If any D0/D1 fixture, artifact, approval, trace, schema, or hash changes, stop with `D2A1_TASK5_FROZEN_EVIDENCE_DRIFT` and revert only the new Task 5 commits using ordinary inverse commits; never reset, rebase, or force-update the approved history.
- If hidden consumers are discovered outside the repository, stop with `D2A1_TASK5_EXTERNAL_CONSUMER_REVIEW_REQUIRED`; preserve the existing semantic version and output path until an explicit migration is approved.
- Rollback is limited to reverting the Task 5 implementation commits in reverse order. The approved Task 4 commits and plan remediation commit remain untouched.

## Plan Self-Review

- The plan separates envelope `schemaVersion` from D1 semantic `replayVersion` and preserves both D0 version rules and D1 version strings.
- The plan covers the only writer caller, the D1-specific consumer, the generic consumer, package scripts, historical documentation, the approval file, and the absence of committed D1 replay JSON.
- The plan compares retirement, contract correction, and new-version strategies before selecting the smallest compatible design.
- Every implementation task has an explicit file set, interface boundary, RED/GREEN command, expected outcome, and commit boundary.
- No Task 5 step modifies D0/D1 frozen evidence, `ReplayDocument`, `D1_REPLAY_SCHEMA`, or the D1 provenance/hash contract.
- No Task 5 implementation or D2b work is authorized by this plan.
