# D2a.1 Task 4 Explicit Legacy Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canonical room creation the only production path while preserving D0/D1 benchmark and replay behavior behind explicit, reviewable legacy entry points.

**Architecture:** Keep `src/game/room.ts` as the room-state construction boundary, but replace its optional-identity compatibility behavior with a required canonical `createRoom` input and a separately named `createLegacyBenchmarkRoom` factory. The canonical factory always creates the public identity/ledger boundary; the legacy factory is callable only by explicitly classified benchmark, research, fixture, and engine-test callers. Replay remains document-authoritative and never opens the identity provider or store.

**Tech Stack:** TypeScript 5.7, Vitest 2.1, React/Vite browser build, Node/tsx research and benchmark scripts, existing `PublicGameIdentity` and `HardPublicLedger` implementations.

## Global Constraints

- Implementation starts at Task 3 final approved SHA `fc89820b1d77db35646bb2acc54cf63242d11653`; `main` must not be merged or rebased into this work.
- This plan covers only D2a.1 Task 4. D2b, Task 5, and any later task remain unauthorized.
- `formalExecutionAllowed=false` remains unchanged. Do not run smoke, calibration, formal, standalone benchmark, simulation, performance, or formal execution commands.
- `src/server/*`, identity provider/store, ledger/replay contracts, D0/D1 artifacts, fixtures, approvals, traces, schemas, and hashes are not production-change targets.
- Production API/UI creation is canonical only. A missing canonical identity fails closed; it never selects a legacy path.
- Benchmark, research, D0/D1 fixture, and engine-only test paths must name the legacy factory explicitly.
- Replay does not allocate identity and does not call `PublicIdentityProvider` or `PublicIdentityStore`; its document identity/provenance remains authoritative.
- `PublicRoom`, public ledger, public events, and replay-facing schemas remain unchanged.
- Every implementation task follows RED, GREEN, REFACTOR, then its own focused verification and commit.

---

## Preflight findings frozen by this plan

### Existing creation boundary and hidden fallback

`src/game/room.ts:78-158` currently exports one `createRoom` function whose `publicIdentity` is optional, whose `seed` defaults to `Date.now()`, and whose ledger/events are conditionally added only at `src/game/room.ts:129-157`. This is the compatibility path that permits a caller to omit identity and silently receive a room without canonical public state.

`src/server/api.ts:205-219` is already canonical at runtime: `POST /api/rooms` passes `allocation.publicIdentity` into the injected/default room creator and marks the provider allocation committed only after room creation. `src/server/dev.ts:12-14` constructs the persistent store/provider and calls `buildApi(provider)`. No server production change is planned.

The transport room id (`RoomState.id`, allocated by `nextRoomId` at `src/game/room.ts:76`) is not a canonical game identity and remains untouched.

### Complete current call-path inventory

| Entry | Current chain | Current identity source | Current risk | Final explicit mode |
|---|---|---|---|---|
| Browser production | `src/main.tsx` 闁炽儲鎽絪rc/ui/App.tsx:322-340` 闁炽儲鎽絪rc/ui/api.ts:createGameRoom` 闁炽儲鎽絇OST /api/rooms` 闁炽儲鎽絪rc/server/api.ts:207-212` 闁炽儲鎽絚reateRoom` | Server provider allocation | No browser legacy import exists; preserve that boundary | Canonical only |
| Server composition root | `src/server/dev.ts:12-14` 闁炽儲鎽絙uildApi(provider)` 闁炽儲鎽絩oomCreator` | Persistent `PublicIdentityStore` through provider | `buildApi` already requires a provider and passes an allocated identity | Canonical only |
| Unified research simulation | `scripts/unifiedAiSimulation.ts:2,52` 闁炽儲鎽絚reateRoom({ rank, seed })` | None | Optional identity currently selects a no-ledger room | Explicit `createLegacyBenchmarkRoom` |
| D1 planner study | `scripts/research/measureD1PlannerExpansionBudget.ts:4,164` 闁炽儲鎽絚reateRoom({ rank, seed })` | None | Same hidden fallback | Explicit `createLegacyBenchmarkRoom` |
| Benchmark game generation | `tests/benchmark/rotations.ts:2,66-82` 闁炽儲鎽絚reateRoom({ rank, seed })` 闁炽儲鎽絩otateRoom` | None | Benchmark room is intentionally engine-only | Explicit `createLegacyBenchmarkRoom` |
| Benchmark simulation fallback | `tests/benchmark/simulator.ts:5,79-82` 闁炽儲鎽絫ask.room ?? createRoom(...)` | None | Missing task room silently creates a legacy room | Explicit `createLegacyBenchmarkRoom` |
| Benchmark tests | `tests/benchmark/observation.test.ts`, `rotations.test.ts`, `strategies.test.ts` | None | Unit fixtures rely on optional identity | Explicit `createLegacyBenchmarkRoom` |
| Legacy AI/game/performance tests | `tests/ai/handPlannerMigration.test.ts`, `publicLedgerKeepCurrent.test.ts`, `tests/game/room.test.ts`, `roomUnifiedAdapter.test.ts`, `roomPlanningArchitecture.test.ts`, `tests/performance/aiHotPath.test.ts` | None unless the test supplies `publicIdentity` | Helpers do not state whether they are canonical or legacy | Explicit legacy for no-identity calls; canonical `createRoom` for identity-bearing calls |
| Canonical game/public-ledger tests | `tests/ai/publicLedgerPrivacy.test.ts`, `publicLedgerTributeReset.test.ts`, `publicLedgerTrickFinish.test.ts`, `tests/benchmark/d2aPublicLedgerAdapter.test.ts`, `tests/game/publicEventRoomAdapter.test.ts` | Fixed `PublicGameIdentity` | These tests exercise canonical ledger behavior | Canonical `createRoom` |
| UI response fixtures | `tests/ui/app.test.tsx:1-5,807+` | Local `PublicRoom` fixture helper named `createRoom` | It is not `src/game/room.createRoom` and must not be changed | Not a room-construction path |
| Replay | `scripts/replayAiBenchmark.ts:9-30` 闁炽儲鎽絙uildGamesForSeed` 闁炽儲鎽絪imulateGame`; `ReplayDocument` at `tests/benchmark/contracts.ts:114-137` supplies `matchId`, seed, rank, strategy and provenance | Replay document; no `PublicGameIdentity` field is present in the current document contract | Replay must not call provider/store or synthesize a canonical allocation | Document-authoritative replay; its engine room is explicitly legacy benchmark state, never a provider-backed production room |

The current `ReplayDocument` identity is the documented benchmark `matchId` plus its provenance fields, not a `PublicGameIdentity`. Task 4 will not invent a new public identity field or change replay schema. The boundary test will prove that replay consumes the document and imports neither provider nor store.

### Existing boundary evidence

- `src/main.tsx` imports the browser UI only; it does not import `src/server/*`, `better-sqlite3`, or benchmark/research modules.
- `src/ui/App.tsx` calls `createGameRoom` through `src/ui/api.ts\); it has no room-construction or legacy-mode parameter.
- `src/server/api.ts` is the sole production `createRoom` caller and supplies `publicIdentity` from provider allocation.
- `scripts/generateD0KeepCurrentFixtures.ts` is a provenance-locked generator and does not directly construct a room; `tests/benchmark/keepCurrentLock.test.ts` already runs it in check-only mode.
- Existing D0 lock tests (`tests/ai/keepCurrentByteLock.test.ts`, `tests/benchmark/keepCurrentLock.test.ts`) and D1 replay/schema validation tests are the regression evidence to rerun. Their artifacts, hashes, schemas, and expected bytes are not regenerated or edited by Task 4.
- There is no `identityMode` implementation and no existing `createLegacy*` helper. The optional `publicIdentity` branch in `src/game/room.ts` is the hidden fallback to remove.

## Frozen design and interfaces

The public room factory boundary will be exactly:

    type CommonRoomCreationInput = Readonly<{
      rank: GameRank;
      seed?: number;
      pendingTributeItems?: TributeItem[];
    }>;

    export type CanonicalRoomCreationInput = Readonly<{
      rank: GameRank;
      seed: number;
      pendingTributeItems?: TributeItem[];
      publicIdentity: PublicGameIdentity;
    }>;

    export type LegacyBenchmarkRoomCreationInput = CommonRoomCreationInput;

    export function createRoom(input: CanonicalRoomCreationInput): RoomState;
    export function createLegacyBenchmarkRoom(input: LegacyBenchmarkRoomCreationInput): RoomState;

The implementation will use an unexported discriminator so no branch is inferred from `undefined`:

    type RoomIdentitySource =
      | { kind: "canonical"; identity: PublicGameIdentity }
      | { kind: "legacy-benchmark" };

    function createRoomInternal(
      input: CommonRoomCreationInput & { source: RoomIdentitySource },
    ): RoomState;

`createRoom` maps only to `{ kind: "canonical", identity: input.publicIdentity }`, requires a numeric seed, and throws `Error("CANONICAL_ROOM_IDENTITY_REQUIRED")` before deck or room allocation if a runtime caller bypasses TypeScript and omits the identity. `createLegacyBenchmarkRoom` maps only to `{ kind: "legacy-benchmark" }` and preserves the existing legacy seed default and no-ledger behavior. The internal builder creates room state once; the canonical branch installs `publicIdentity`, `publicLedger`, and `publicEvents`, while the explicit legacy branch installs none. No exported function accepts `publicIdentity?:` and no branch tests `identity === undefined` to select legacy behavior.

The factories do not add `identityMode`, `gameSequence`, `gameId`, session identity, or compatibility overloads. `RoomState.publicIdentity`, `publicLedger`, and `publicEvents` remain optional because a legacy benchmark room intentionally has none; the absence is produced only by the named legacy factory.

## Planned files and responsibilities

### Task 1 闁炽儲鏁俹om creation boundary

**Files:**

- Modify: `src/game/room.ts:46-158` 闁炽儲鏁俥quired canonical input, explicit legacy factory, private discriminator, no implicit fallback.
- Create: `tests/game/legacyRoomIsolation.test.ts` 闁炽儲鏀nonical/legacy behavior, fail-closed missing identity, ledger boundary, and source-level production/UI import checks.

**Tests frozen for the file:**

1. `createRoom({ rank: "2", seed: 1 } as never)` throws `CANONICAL_ROOM_IDENTITY_REQUIRED` before a room is returned.
2. `createRoom({ rank: "2", seed: 1, publicIdentity: fixedIdentity })` returns a room with the exact identity and a `publicLedger`/`publicEvents` pair.
3. `createLegacyBenchmarkRoom({ rank: "2", seed: 1 })` returns a room with no `publicIdentity`, `publicLedger`, or `publicEvents`.
4. A canonical room and a legacy room with the same rank/seed have the same engine dealing behavior; only canonical public state is additive.
5. The test reads `src/server/api.ts` and asserts the room creation call supplies `publicIdentity`; it reads `src/ui` imports and asserts no browser module imports `createLegacyBenchmarkRoom` or `src/server/*`.

### Task 2 闁炽儲鏀▁plicit caller migration

**Files:**

- Modify: `scripts/unifiedAiSimulation.ts` 闁炽儲鏁唖e `createLegacyBenchmarkRoom` for engine-only simulation.
- Modify: `scripts/research/measureD1PlannerExpansionBudget.ts` 闁炽儲鏁唖e the explicit legacy factory for the D1 study.
- Modify: `tests/benchmark/rotations.ts` and `tests/benchmark/simulator.ts` 闁炽儲鏀穉rk base-room and fallback construction explicitly legacy.
- Modify: `tests/benchmark/observation.test.ts`, `tests/benchmark/rotations.test.ts`, `tests/benchmark/strategies.test.ts` 闁炽儲鏁俥name imports/calls for no-identity fixtures.
- Modify: `tests/ai/handPlannerMigration.test.ts`, `tests/ai/publicLedgerKeepCurrent.test.ts` 闁炽儲鏀穉rk no-identity engine fixtures explicitly legacy.
- Modify: `tests/game/room.test.ts`, `tests/game/roomUnifiedAdapter.test.ts`, `tests/game/roomPlanningArchitecture.test.ts`, `tests/performance/aiHotPath.test.ts` 闁炽儲鏁唖e the legacy factory only where the existing call has no `publicIdentity`; preserve canonical calls unchanged.

No change is planned for `src/server/api.ts`, `src/server/dev.ts`, `src/ui/App.tsx`, `src/ui/api.ts`, `tests/ui/app.test.tsx`, or existing canonical public-ledger tests. The local UI fixture helper named `createRoom` is not part of this migration.

The migration pattern is exact:

    import { createLegacyBenchmarkRoom, type RoomState } from "../../src/game/room";

    const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });

An existing call that includes `publicIdentity` continues to use `createRoom({ publicIdentity, rank, seed, pendingTributeItems })` and remains canonical.

### Task 3 闁炽儲鏀aracterization and boundary regression

**Files:**

- Create: `tests/benchmark/legacyD1Compatibility.test.ts` 闁炽儲鏀▁plicit legacy caller coverage, replay/provider separation, D0 check-only stability, and D1 output/schema/hash regression assertions.
- Modify: only if required to replace an import/call identified in Task 2; no fixture/artifact/approval/trace/schema/hash file is modified.

The new characterization test will use actual `createLegacyBenchmarkRoom`, `buildGamesForSeed`, `simulateGame`, and `replayMatch` paths. It will not mock the room factory, provider, store, ledger, or replay validator. It will recursively inspect generated public/replay objects for identity and private-key leakage where those objects expose nested data.

## TDD execution tasks

### Task 1: Freeze the explicit room factories

- [ ] Step 1 - write the RED tests. Create tests/game/legacyRoomIsolation.test.ts with the five assertions listed above and a fixed PublicGameIdentity from buildPublicGameIdentity.

- [ ] Step 2 - run the RED test.

      npx vitest run tests/game/legacyRoomIsolation.test.ts --testTimeout=120000 --reporter=verbose

  Expected: FAIL because createLegacyBenchmarkRoom does not exist and optional-identity createRoom does not fail closed.

- [ ] Step 3 - implement the smallest boundary change. In src/game/room.ts, add the exact input types and RoomIdentitySource definition above; move the existing room body into createRoomInternal; require publicIdentity and seed in canonical createRoom; add createLegacyBenchmarkRoom; preserve nextRoomId, shuffle, tribute, ledger, event, and RoomState behavior.

- [ ] Step 4 - run the GREEN test. Run the focused Vitest command above. Expected: all legacyRoomIsolation.test.ts tests PASS; canonical rooms carry the ledger and legacy rooms carry no public identity state.

- [ ] Step 5 - REFACTOR review. Confirm the only identity branch is source.kind, no exported input has optional publicIdentity, and canonical creation has no Date.now seed fallback.

- [ ] Step 6 - commit the boundary.

      git add src/game/room.ts tests/game/legacyRoomIsolation.test.ts
      git commit -m "feat: isolate canonical and legacy room creation"

### Task 2: Migrate every non-canonical caller explicitly

- [ ] **Step 1 闁炽儲鏁倁n the compile RED.**

      npx tsc --noEmit

  Expected: type errors identify only old no-identity `createRoom` calls in the caller list above; server production and identity provider/store files remain unchanged.

- [ ] **Step 2 闁炽儲鏀穒grate the callers.** Replace each no-identity imported `createRoom` with `createLegacyBenchmarkRoom`. Keep identity-bearing calls on canonical `createRoom`. For `tests/game/room.test.ts`, classify by the actual argument at each call site rather than changing the whole file blindly.

- [ ] **Step 3 闁炽儲鏁倁n the caller regression GREEN check.**

      npx vitest run tests/game/room.test.ts tests/game/roomUnifiedAdapter.test.ts tests/game/roomPlanningArchitecture.test.ts tests/ai/handPlannerMigration.test.ts tests/ai/publicLedgerKeepCurrent.test.ts tests/benchmark/observation.test.ts tests/benchmark/rotations.test.ts tests/benchmark/strategies.test.ts tests/performance/aiHotPath.test.ts --testTimeout=120000 --reporter=verbose
      npx tsc --noEmit

  Expected: all selected tests PASS and typecheck exits 0. No D0/D1 output file is written.

- [ ] **Step 4 闁炽儲鎽獷FACTOR review.** Search the source tree for `createRoom({` and confirm every remaining call either supplies `publicIdentity` or is the local UI test fixture helper. Search for `createLegacyBenchmarkRoom` and confirm every use is in an explicitly classified script, benchmark, research, fixture, replay-engine, or test-helper path.

- [ ] **Step 5 闁炽儲鏀mmit the migration.**

      git add scripts/unifiedAiSimulation.ts scripts/research/measureD1PlannerExpansionBudget.ts tests/benchmark/rotations.ts tests/benchmark/simulator.ts tests/benchmark/observation.test.ts tests/benchmark/rotations.test.ts tests/benchmark/strategies.test.ts tests/ai/handPlannerMigration.test.ts tests/ai/publicLedgerKeepCurrent.test.ts tests/game/room.test.ts tests/game/roomUnifiedAdapter.test.ts tests/game/roomPlanningArchitecture.test.ts tests/performance/aiHotPath.test.ts
      git commit -m "refactor: mark legacy benchmark room callers explicitly"

### Task 3: Characterize legacy isolation and preserve D0/D1/replay boundaries

- [ ] Step 1 - write characterization tests. Create tests/benchmark/legacyD1Compatibility.test.ts using the actual createLegacyBenchmarkRoom, buildGamesForSeed, simulateGame, replayMatch, writeD1Replay, D1_RESULT_SCHEMA, D1_REPLAY_SCHEMA, ENGINE_VERSION, ROOM_RULES_VERSION, and getStrategy helpers.

  The file must include four tests: explicit legacy rooms have no publicIdentity/publicLedger/publicEvents; a temporary replay document is written with writeD1Replay, its schemaVersion is set to 1, replayMatch verifies it through buildGamesForSeed and simulateGame, and the replay source contains no provider/store import; the committed D0 fixture is byte-identical before and after the existing generator is invoked with --check-only; and a fixed D1 configuration/seed produces the existing D1 result schema plus 64-hex publicTraceHash and finalPublicStateHash values.

  The replay test must use a temporary directory with try/finally cleanup and must assert matchId, publicTraceHash, finalPublicStateHash, and verified: true. The D0 test must use the existing source-worktree, source-commit, generator-version, and fixture path values already frozen in tests/benchmark/keepCurrentLock.test.ts. The D1 test must use existing schema/version constants, not a new artifact or modified fixture.
- [ ] **Step 2 闁炽儲鏁倁n characterization RED.**

      npx vitest run tests/benchmark/legacyD1Compatibility.test.ts --testTimeout=120000 --reporter=verbose

  Expected: RED until the explicit callers and regression assertions are present. Any failure caused by a changed D0/D1 byte, trace, hash, schema, or replay contract is a Task 4 contract mismatch and must stop the implementation; no production compatibility exception is permitted.

- [ ] **Step 3 闁炽儲鏀癿plement only test-side characterization and exact caller assertions.** Use existing `tests/ai/fixtures/d0KeepCurrentCases.json`, `tests/benchmark/keepCurrentLock.test.ts` helpers, `tests/benchmark/d1ReplayValidation.ts`, and `tests/benchmark/contracts.ts`. Keep `scripts/generateD0KeepCurrentFixtures.ts`, all artifacts, and all server/ledger/replay production code unchanged.

- [ ] **Step 4 闁炽儲鏁倁n focused GREEN verification.**

      npx vitest run tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts tests/game/roomPlanningArchitecture.test.ts tests/benchmark/d1ReplayValidation.test.ts tests/ai/keepCurrentByteLock.test.ts tests/benchmark/keepCurrentLock.test.ts --testTimeout=120000 --reporter=verbose

  Expected: all selected tests PASS; D0 check-only leaves fixture bytes unchanged; D1 trace/hash/schema and replay validation remain unchanged; no provider/store is imported by replay.

- [ ] **Step 5 闁炽儲鎽獷FACTOR review.** Run the source-boundary searches below and inspect the diff for accidental public-contract changes:

      git grep -n "createRoom(" -- src scripts tests
      git grep -n "createLegacyBenchmarkRoom" -- src scripts tests
      git grep -n "PublicIdentityStore\|createPublicIdentityProvider\|better-sqlite3" -- src/main.tsx src/ui scripts/replayAiBenchmark.ts
      git diff --check

  Expected: production room creation is canonical; legacy calls are explicit and classified; browser/replay code has no identity-store import; diff check is clean.

- [ ] **Step 6 闁炽儲鏀mmit the characterization.**

      git add tests/benchmark/legacyD1Compatibility.test.ts
      git commit -m "test: lock explicit legacy isolation boundaries"

## Final Task 4 verification gate

Run only after the three implementation commits and their reviews:

    npx vitest run tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts tests/game/room.test.ts tests/game/roomUnifiedAdapter.test.ts tests/game/roomPlanningArchitecture.test.ts tests/ai/handPlannerMigration.test.ts tests/ai/publicLedgerKeepCurrent.test.ts tests/benchmark/observation.test.ts tests/benchmark/rotations.test.ts tests/benchmark/strategies.test.ts tests/benchmark/d1ReplayValidation.test.ts tests/ai/keepCurrentByteLock.test.ts tests/benchmark/keepCurrentLock.test.ts --testTimeout=120000 --reporter=verbose
    npx tsc --noEmit
    npm run build
    npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree "../d0-fixture-ai-benchmark" --source-commit "e2a20e18f8e5c0871db38ad69426262e43766ce1" --output "tests/ai/fixtures/d0KeepCurrentCases.json" --generator-version "d0-fixture-v1" --check-only
    git diff --check
    git status --short
    git rev-parse HEAD
    git log --oneline -5

Expected final evidence:

- Every listed focused test passes, with the exact test count recorded from Vitest output.
- `npx tsc --noEmit` exits 0.
- `npm run build` exits 0 and browser output contains no server identity-store/native SQLite dependency.
- D0 check-only exits 0 and does not modify `tests/ai/fixtures/d0KeepCurrentCases.json`.
- `git diff --check` exits 0 and `git status --short` is empty.
- Final HEAD contains Task3 approved SHA `fc89820b1d77db35646bb2acc54cf63242d11653` as an ancestor and exactly the three Task4 commits listed above.
- No `src/server/*`, identity provider/store, ledger/replay production, D0/D1 artifact, approval, trace, schema, or hash file changed.
- No smoke, calibration, formal, standalone benchmark, simulation, performance, Task 5, or D2b command was run.

## Risks and stop conditions

- If any D0/D1 byte, trace, hash, schema, or replay assertion changes, stop with a contract mismatch report and do not change server, provider/store, ledger, replay production, or fixture data.
- If a caller cannot be classified as canonical, legacy benchmark/research/fixture, or document-authoritative replay from current source evidence, stop and request a separate scope decision; do not add a default mode.
- If a browser build imports the legacy factory or any server store/native SQLite module, stop and fix the import boundary before approval.
- If a canonical caller reaches the legacy factory, or a legacy caller reaches canonical provider/store allocation, stop and correct the caller classification.
- If the explicit legacy wrapper would require changing `PublicRoom`, public ledger, public events, replay schema, D0/D1 artifacts, or server contracts, stop because that is outside Task 4.

## Plan self-review

- All current direct room-construction callers are classified above, including production API/UI, scripts, research, benchmark, replay, game tests, performance tests, and the unrelated local UI fixture helper.
- The hidden optional-identity fallback is removed by a required canonical input and explicit private discriminator; no `identityMode` default or undefined-to-legacy branch remains in the design.
- Canonical and legacy function names, input types, discriminator values, error string, and test commands are consistent across all three tasks.
- TDD steps include concrete RED, GREEN, REFACTOR, verification, and commit boundaries; server production is absent from all commit boundaries.
- Replay handling matches the current `ReplayDocument` contract: document `matchId`/provenance is authoritative, no synthetic `PublicGameIdentity` is introduced, and no provider/store is called.
- D0/D1 fixture, artifact, approval, trace, schema, and hash preservation is checked only; no regeneration or contract rewrite is planned.
- There are no unresolved design decisions, placeholder steps, implicit compatibility modes, or unassigned caller classes.
