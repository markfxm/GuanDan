# D2a.1 Task 5 Standalone Public-Event Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Characterize and verify that a canonical room's saved public identity, initial public state, public events, and final ledger hash can be replayed after JSON persistence without importing or initializing the identity provider/store.

**Architecture:** Keep the existing `PublicLedgerReplayDocument` and `rebuildPublicLedger` contract unchanged. Add one game-level test file that obtains public events from a real canonical room, persists only the public replay document through a temporary JSON file, and calls the real replay reducer after reloading it. The preflight shows no production change is required; any RED caused by the existing replay contract is a stop condition, not permission to modify the ledger, replay, provider, or store in this plan.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, `createRoom`, `playCards`, `passTurn`, `canonicalPublicLedgerHash`, `rebuildPublicLedger`, `PublicGameIdentity`, and the existing public ledger/event validators.

## Global Constraints

- Baseline is `a078c5e79573137db57158b620b947440382a5fb` on `codex/d2a1-task5`.
- This is the remaining standalone public-event replay scope after Task 5A; it is preflight/plan-only until separately authorized.
- The only implementation file allowed by this plan is `tests/game/publicEventReplayIdentity.test.ts`.
- No `src/server/*`, `src/game/*`, `src/ui/*`, `scripts/*`, `tests/benchmark/*`, provider/store, ledger, replay production, schema, validator, package, or lockfile modification is allowed.
- `PublicLedgerReplayDocument` remains exactly the existing `d2-public-ledger-replay-v1` shape.
- `PublicGameIdentity` is saved in the public replay document; `gameId`, `roundIdentity`, and `handIdentity` are public replay authority and are not treated as hidden state.
- `Idempotency-Key`, provider/store handles, installation identity, `gameSequence`, private hands, deck data, and AI runtime data must not enter the replay document.
- Replay must remain successful without constructing `PublicIdentityStore`, `createPublicIdentityProvider`, or a server API.
- No canonical allocation is performed by replay; replay consumes the saved identity and never asks the provider/store for a new identity.
- Existing store reopen, same-key concurrency, conflict, and allocation evidence remains prior evidence; this plan does not duplicate or redesign those server contracts.
- D0/D1 fixtures, artifacts, approval files, provenance, trace hashes, final-state hashes, and external calibration evidence are read-only.
- Do not run calibration, smoke, formal, standalone benchmark, simulation, performance workload, Task 4, or D2b.
- `formalExecutionAllowed=false` remains unchanged.

## Preflight Findings

The preflight was run against the clean baseline `a078c5e79573137db57158b620b947440382a5fb`.

Existing focused characterization passed:

```text
npx vitest run tests/ai/publicLedgerReplay.test.ts tests/game/publicEventRoomAdapter.test.ts tests/game/publicEventIdentity.test.ts tests/server/apiIdempotency.test.ts --testTimeout=120000 --reporter=verbose

4 files passed
15 tests passed
exit 0
```

The existing tests establish:

- `tests/ai/publicLedgerReplay.test.ts` verifies reducer replay, missing initial state rejection, and snapshot mismatch rejection, but uses in-memory documents and synthetic events.
- `tests/game/publicEventRoomAdapter.test.ts` verifies canonical room event/ledger updates and that `PublicRoom` omits private identity, ledger, and events, but does not persist and reload a replay document.
- `tests/server/apiIdempotency.test.ts` verifies a real server allocation and an in-memory `rebuildPublicLedger` call, but its replay assertion is not a standalone file round trip and does not exercise a gameplay event sequence from a canonical room.
- `tests/game/publicEventIdentity.test.ts` verifies deterministic identity construction and sequence validation.

The actual production replay boundary is already provider-independent:

- `src/game/publicEventReplay.ts` imports only `publicEvent` and `publicLedger`.
- `src/game/publicLedger.ts` imports only public event/hash types and functions.
- `src/game/publicEventReplay.ts`, `src/game/publicLedger.ts`, and `src/game/publicEvent.ts` contain no `PublicIdentityStore`, `createPublicIdentityProvider`, or `better-sqlite3` import.
- No `src/server` or `src/ui` caller imports `rebuildPublicLedger`.
- `rebuildPublicLedger(document)` constructs the ledger from `document.initialState`, applies `document.events`, computes `canonicalPublicLedgerHash`, and optionally validates `finalLedgerHash` and `ledgerSnapshot`.

Therefore the remaining gap is evidence quality, not an observed production defect: a real canonical room's public event stream has not yet been persisted, reloaded, and replayed without server/provider setup in one focused test.

## Canonical Initial-State Mapping (Preflight-Frozen)

The read-only inventory found no exported canonical initial-public-state helper. The test therefore keeps a test-only capture helper, but its field mapping is frozen to the production call at `src/game/room.ts:146-152` and the replay type at `src/game/publicEventReplay.ts:3-10`:

| Replay initial field | Canonical production source |
|---|---|
| `identity` | `src/game/room.ts:148`, `createInitialPublicLedger({ identity: publicIdentity })` |
| `initialHandCounts` | `src/game/room.ts:148`, `{ 0: hands[0].length, 1: hands[1].length, 2: hands[2].length, 3: hands[3].length }` |
| `openingLeader` | `src/game/room.ts:149`, the `openingLeader` value computed before room construction |
| `initialTrickIndex` | `src/game/room.ts:150`, literal `0` passed to `createInitialPublicLedger` |
| `openingTributePublicState` | `src/game/room.ts:151`, exactly `{ status: openingTribute?.status ?? "none" }` |

`src/game/publicLedger.ts:59-78` consumes the same five fields; it copies `initialHandCounts`, uses `initialTrickIndex` and `openingLeader` for `currentTrick`, and canonicalizes every key in `openingTributePublicState` into the initial `publicTributeEvents` entry. The existing server replay characterization repeats this mapping at `tests/server/apiIdempotency.test.ts:187-203`, and the existing replay test uses the same shape at `tests/ai/publicLedgerReplay.test.ts:46-57`. No additional production opening-tribute public fields were found. The plan must not infer fields from the mutable post-game room.

## Remaining-Scope Decision

| Original Task 5 concern | Current evidence | This plan's disposition |
|---|---|---|
| Store reopen and concurrent allocation | Covered by the approved Task 4/server characterization evidence | No new implementation or duplicate test in this plan |
| Standalone public-event replay | Existing reducer tests are in-memory; no real canonical-room JSON round trip exists | Implement the test-only characterization in Tasks 1 and 2 below |
| Provider-independent identity/replay | The replay production path imports only public event/ledger modules and has no provider/store dependency | Preserve the existing production boundary and add source/privacy assertions; no production change |

Task 5A's D1 writer correction and external Gate B evidence remain separate evidence. This remaining-scope plan neither changes nor reruns them.

## Frozen Contract

The test document must use the existing type and fields:

```ts
export type PublicLedgerReplayDocument = {
  schemaVersion: "d2-public-ledger-replay-v1";
  initialState: {
    identity: PublicGameIdentity;
    initialHandCounts: Readonly<Record<PublicSeat, number>>;
    openingLeader: PublicSeat;
    initialTrickIndex: number;
    openingTributePublicState: Readonly<Record<string, string | number | boolean | null>>;
  };
  events: readonly PublicActionEvent[];
  finalLedgerHash?: string;
  ledgerSnapshot?: HardPublicLedger;
};
```

The replay authority is exactly:

```text
saved PublicGameIdentity
→ initial public hand counts / opening state
→ ordered finalized public events
→ finalLedgerHash
```

The test must not add a provider reference, allocation key, store path, transport room id, private hand, deck, or hidden AI state to this document.

## Implementation Scope Matrix

| File | Action | Reason |
|---|---|---|
| `tests/game/publicEventReplayIdentity.test.ts` | Create | Real-room JSON round trip, final hash verification, privacy and provider/store boundary assertions |
| `src/game/publicEventReplay.ts` | Read only | Existing reducer is the subject under characterization |
| `src/game/publicLedger.ts` | Read only | Existing ledger state/hash contract is frozen |
| `src/game/publicEvent.ts` | Read only | Existing identity/event contract is frozen |
| `tests/ai/publicLedgerReplay.test.ts` | Read only | Existing reducer negative cases remain regression coverage |
| `tests/server/apiIdempotency.test.ts` | Read only | Existing server allocation/restart/privacy evidence remains unchanged |

No production implementation change is planned. If the new test fails after the exact harness below reaches `rebuildPublicLedger`, stop with `D2A1_TASK5_PUBLIC_REPLAY_CONTRACT_MISMATCH`; do not modify production in this plan.

## Implementation Tasks

### Task 1: Characterize real canonical-room replay persistence

**Files:**

- Create: `tests/game/publicEventReplayIdentity.test.ts`
- Read-only: `src/game/room.ts`, `src/game/publicEvent.ts`, `src/game/publicEventHash.ts`, `src/game/publicLedger.ts`, `src/game/publicEventReplay.ts`

**Interfaces:**

- Consumes: `createRoom(input: CanonicalRoomCreationInput)`, `playCards(room, seat, cardIds)`, `passTurn(room, seat)`, `canonicalPublicLedgerHash(ledger)`, and `rebuildPublicLedger(document)`.
- Produces: a test-only persisted `PublicLedgerReplayDocument`; no production API or schema.

- [ ] **Step 1: Add the real-room round-trip characterization test.**

  Use this exact harness shape. The room must be canonical and must produce events through real room actions; do not hand-author the gameplay events in this test.

  ```ts
  import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import { describe, expect, it } from "vitest";
  import { buildPublicGameIdentity } from "../../src/game/publicEvent";
  import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
  import { rebuildPublicLedger, type PublicLedgerReplayDocument } from "../../src/game/publicEventReplay";
  import { createRoom, passTurn, playCards, type RoomState } from "../../src/game/room";

  function createCanonicalRoom(): RoomState {
    const publicIdentity = buildPublicGameIdentity("task5:public-replay", 0, 0, "replay");
    return createRoom({ rank: "10", seed: 41, publicIdentity });
  }

  type ReplayInitialState = PublicLedgerReplayDocument["initialState"];

  function captureInitialPublicState(room: RoomState): ReplayInitialState {
    if (room.publicIdentity === undefined) {
      throw new Error("TEST_PUBLIC_REPLAY_IDENTITY_MISSING");
    }
    return {
      identity: room.publicIdentity,
      initialHandCounts: {
        0: room.initialHands[0].length,
        1: room.initialHands[1].length,
        2: room.initialHands[2].length,
        3: room.initialHands[3].length,
      },
      openingLeader: room.leaderSeat,
      initialTrickIndex: 0,
      openingTributePublicState: { status: room.openingTribute?.status ?? "none" },
    };
  }

  function toReplayDocument(initialState: ReplayInitialState, room: RoomState): PublicLedgerReplayDocument {
    if (room.publicLedger === undefined || room.publicEvents === undefined) {
      throw new Error("TEST_PUBLIC_REPLAY_DATA_MISSING");
    }
    return {
      schemaVersion: "d2-public-ledger-replay-v1",
      initialState,
      events: room.publicEvents,
      finalLedgerHash: canonicalPublicLedgerHash(room.publicLedger),
    } satisfies PublicLedgerReplayDocument;
  }

  function persistAndReload(document: PublicLedgerReplayDocument): PublicLedgerReplayDocument {
    const directory = mkdtempSync(join(tmpdir(), "d2a1-public-replay-"));
    const replayPath = join(directory, "public-replay.json");
    try {
      writeFileSync(replayPath, JSON.stringify(document), "utf8");
      return JSON.parse(readFileSync(replayPath, "utf8")) as PublicLedgerReplayDocument;
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  describe("standalone public-event replay identity boundary", () => {
    it("persists a real canonical room public stream and verifies the final ledger hash", () => {
      const room = createCanonicalRoom();
      const initialState = structuredClone(captureInitialPublicState(room));
      const playSeat = room.currentTurn;
      const playedCard = room.hands[playSeat][0];
      if (playedCard === undefined) throw new Error("TEST_CARD_MISSING");
      playCards(room, playSeat, [playedCard.id]);
      passTurn(room, room.currentTurn);

      const document = toReplayDocument(initialState, room);
      expect(document.initialState).toEqual(initialState);
      const reloaded = persistAndReload(document);
      expect(reloaded).toEqual(document);
      const rebuilt = rebuildPublicLedger(reloaded);

      expect(reloaded.events.map((event) => event.publicPayloadHash)).toEqual(document.events.map((event) => event.publicPayloadHash));
      expect(rebuilt.hash).toBe(document.finalLedgerHash);
      expect(rebuilt.ledger).toEqual(room.publicLedger);
    });

    it("rejects a persisted document whose final public ledger hash was changed", () => {
      const room = createCanonicalRoom();
      const initialState = structuredClone(captureInitialPublicState(room));
      const document = toReplayDocument(initialState, room);
      const reloaded = persistAndReload(document);
      const tampered = { ...reloaded, finalLedgerHash: "0".repeat(64) };
      expect(() => rebuildPublicLedger(tampered)).toThrow("REPLAY_FINAL_HASH_MISMATCH");
    });
  });
  ```

  The helper must use `satisfies PublicLedgerReplayDocument` or an explicit return type, must preserve event order, and must not include `ledgerSnapshot` unless the test is specifically validating the existing optional cache path.

- [ ] **Step 2: Run the characterization command.**

  ```bash
  npx vitest run tests/game/publicEventReplayIdentity.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected result against the current preflight evidence: 1 file, 2 tests, all pass. A failure before `rebuildPublicLedger` is a test-harness issue. A failure at serialization, event application, or final hash comparison is `D2A1_TASK5_PUBLIC_REPLAY_CONTRACT_MISMATCH`; stop without modifying production.

- [ ] **Step 3: Commit the characterization tests.**

  ```bash
  git add tests/game/publicEventReplayIdentity.test.ts
  git commit -m "test: characterize standalone public event replay"
  ```

  This commit may contain only the new test file.

### Task 2: Add provider-independent and privacy boundary assertions

**Files:**

- Modify: `tests/game/publicEventReplayIdentity.test.ts`
- Read-only: `src/game/publicEventReplay.ts`, `src/game/publicLedger.ts`, `src/game/publicEvent.ts`, `src/server/publicIdentityStore.ts`, `src/server/publicIdentityProvider.ts`

**Interfaces:**

- Consumes: the `toReplayDocument` helper and real persisted document from Task 1.
- Produces: test evidence that replay uses saved public data only and cannot silently allocate or import server identity state.

- [ ] **Step 1: Add the provider/store source-boundary assertion.**

  Add this test without importing any server module:

  ```ts
  import { readFileSync } from "node:fs";

  it("keeps the public replay path independent of provider and store modules", () => {
    const replaySource = readFileSync(new URL("../../src/game/publicEventReplay.ts", import.meta.url), "utf8");
    const ledgerSource = readFileSync(new URL("../../src/game/publicLedger.ts", import.meta.url), "utf8");
    const eventSource = readFileSync(new URL("../../src/game/publicEvent.ts", import.meta.url), "utf8");
    const source = `${replaySource}\n${ledgerSource}\n${eventSource}`;

    expect(source).not.toMatch(
      /(?:from\s+["'][^"']*server[\\/]|import\s*\(\s*["'][^"']*server[\\/]|PublicIdentityStore|createPublicIdentityProvider|publicIdentityStore|publicIdentityProvider|better-sqlite3|better_sqlite3\.node|node:sqlite|[\\/]server[\\/])/i,
    );
  });
  ```

  This is a source-boundary assertion, not a mock of the provider/store. It covers exported-symbol references, server import paths, server path fragments, and SQLite runtime names. The test must not use dynamic imports, caller allowlists, or path-based exceptions. After the build gate, scan the generated output only for the concrete provider/store/SQLite patterns listed in Task 3; do not apply the generic `[/\\]server[/\\]` path pattern to `dist`, and a missing `dist` directory is not a test pass.

- [ ] **Step 2: Add recursive public-document privacy assertions.**

  Add a fixed-key recursive scanner and assert the serialized document contains no transport or hidden-state fields:

  ```ts
  function normalizeReplayKey(key: string): string {
    return key.replace(/[-_\s]/g, "").toLowerCase();
  }

  const forbiddenReplayKeys = new Set([
    "transportroomid",
    "allocationkey",
    "storepath",
    "idempotencykey",
    "installationidentity",
    "identitystore",
    "gamesequence",
    "privatehand",
    "initialhands",
    "hands",
    "deck",
    "airuntime",
    "provider",
    "store",
  ]);

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const child of value) collectKeys(child, keys);
    return keys;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

  it("keeps allocation and hidden-state fields out of the saved public document", () => {
    const room = createCanonicalRoom();
    const initialState = structuredClone(captureInitialPublicState(room));
    const playSeat = room.currentTurn;
    const playedCard = room.hands[playSeat][0];
    if (playedCard === undefined) throw new Error("TEST_CARD_MISSING");
    playCards(room, playSeat, [playedCard.id]);
    passTurn(room, room.currentTurn);
    const document = toReplayDocument(initialState, room);
    const reloaded = persistAndReload(document);
    expect(reloaded).toEqual(document);
    expect(Object.keys(reloaded).sort()).toEqual(["events", "finalLedgerHash", "initialState", "schemaVersion"]);
    expect(Object.keys(reloaded.initialState).sort()).toEqual(["identity", "initialHandCounts", "initialTrickIndex", "openingLeader", "openingTributePublicState"]);
    for (const key of collectKeys(reloaded)) {
      expect(forbiddenReplayKeys.has(normalizeReplayKey(key))).toBe(false);
    }
    const serialized = JSON.stringify(reloaded);
    expect(serialized).not.toContain("PublicIdentityStore");
    expect(serialized).not.toContain("createPublicIdentityProvider");
    expect(serialized).not.toContain("better-sqlite3");
    expect(serialized).not.toContain("node:sqlite");
    expect(reloaded.initialState.identity.gameId).toBe("task5:public-replay");
  });
  ```

  The privacy flow is frozen as: canonical room -> capture initial state -> real `playCards`/`passTurn` -> create replay document -> JSON write -> JSON reload -> recursive key scan. The scanner must run on `reloaded`, not only on the mutable room or pre-persistence object. `gameId`, `roundIdentity`, and `handIdentity` remain allowed because they are the explicitly saved public replay identity. The assertion must not ban those fields or weaken the replay authority contract.

- [ ] **Step 3: Run the provider/privacy characterization command.**

  ```bash
  npx vitest run tests/game/publicEventReplayIdentity.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected result: 1 file, 4 tests, all pass. Any import of provider/store from the replay path, any forbidden recursive key, or any allocation side effect is a blocking contract mismatch. Do not add a compatibility layer or modify production to make the test pass.

- [ ] **Step 4: Commit the boundary assertions.**

  ```bash
  git add tests/game/publicEventReplayIdentity.test.ts
  git commit -m "test: verify provider-independent public replay boundary"
  ```

  This commit may contain only `tests/game/publicEventReplayIdentity.test.ts`.

### Task 3: Run the local Task 5 remaining verification gate

**Files:**

- Read-only verification of all repository files.
- No new implementation files.

- [ ] **Step 1: Run the focused replay regression.**

  ```bash
  npx vitest run tests/game/publicEventReplayIdentity.test.ts tests/ai/publicLedgerReplay.test.ts tests/game/publicEventRoomAdapter.test.ts tests/game/publicEventIdentity.test.ts tests/server/apiIdempotency.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected result after Task 2: 5 files, 19 tests, all pass. Record exit code, duration, natural exit, stdout, and stderr.

- [ ] **Step 2: Run typecheck and build.**

  ```bash
  npx tsc --noEmit
  npm run build
  ```

  Both commands must exit 0. A tool timeout is reported separately from a test failure and rerun with an outer limit of at least 300 seconds.

- [ ] **Step 3: Run the complete local regression.**

  ```bash
  npm test
  ```

  `npm test` must complete naturally with exit 0. Record exact file/test counts and confirm that no benchmark, simulation, performance, calibration, smoke, or formal workload was selected by the script.

- [ ] **Step 4: Run the frozen D0 check-only gate.**

  ```bash
  npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree "../d0-fixture-ai-benchmark" --source-commit "e2a20e18f8e5c0871db38ad69426262e43766ce1" --output "tests/ai/fixtures/d0KeepCurrentCases.json" --generator-version "d0-fixture-v1" --check-only
  ```

  The fixture bytes and SHA-256 must remain byte-identical. Any drift is `D2A1_TASK5_FROZEN_EVIDENCE_DRIFT`; do not regenerate the fixture.

- [ ] **Step 5: Run the replay and browser/server boundary scans.**

  ```bash
   git grep -n "rebuildPublicLedger" -- src tests scripts
   git grep -n "PublicLedgerReplayDocument" -- src tests scripts
   git grep -n "PublicIdentityStore\|createPublicIdentityProvider\|publicIdentityStore\|publicIdentityProvider\|better-sqlite3\|better_sqlite3.node\|node:sqlite" -- src/game/publicEventReplay.ts src/game/publicLedger.ts src/game/publicEvent.ts
   git grep -n "idempotencyKey\|gameSequence\|installationIdentity" -- tests/game/publicEventReplayIdentity.test.ts
   test -d dist
   if rg -n -i --glob '*' 'PublicIdentityStore|createPublicIdentityProvider|publicIdentityStore|publicIdentityProvider|better-sqlite3|better_sqlite3\.node|node:sqlite' dist; then
     echo "forbidden replay boundary pattern found in build output" >&2
     exit 1
   else
     code=$?
     if [ "$code" -gt 1 ]; then exit "$code"; fi
   fi
   git status --short
   git diff --check
  ```

  Expected: replay callers remain the existing game/server characterization tests; the replay production path has no provider/store import; the new test contains only negative privacy assertions; the built browser output contains none of the forbidden provider/store/SQLite patterns; the worktree is clean after commits.

- [ ] **Step 6: Preserve the completed Task 5A external gate.**

  Do not rerun calibration or remount external evidence as part of this remaining-scope local gate. Preserve the previously verified `D2A1_TASK5A_GATE_B_PASSED_AWAITING_FINAL_REVIEW` evidence and its immutable archive/report hashes. Task 5 overall approval still requires the independent Task 5A final review plus this plan's local verification.

## Stop Conditions

- If the real JSON round trip fails, report `D2A1_TASK5_PUBLIC_REPLAY_CONTRACT_MISMATCH` with the exact failing assertion and actual hash; do not modify `src/game/publicEventReplay.ts`, `src/game/publicLedger.ts`, `src/game/publicEvent.ts`, or any server provider/store file.
- If replay requires a provider/store, report `D2A1_TASK5_PROVIDER_DEPENDENCY_MISMATCH` and stop; do not add a fallback provider, dynamic import, or test mock.
- If the serialized document contains an allocation key or hidden-state field, report `D2A1_TASK5_PUBLIC_REPLAY_PRIVACY_BOUNDARY_FAILURE` and stop; do not weaken the scanner.
- If any D0/D1 fixture, artifact, approval, trace, schema, or hash changes, report `D2A1_TASK5_FROZEN_EVIDENCE_DRIFT` and stop.
- If typecheck, build, or `npm test` fails for an unrelated environment reason, report the exact command and stderr separately; do not patch package, lockfile, or declaration shims in this scope.
- Task 5A external Gate B evidence is not regenerated, copied, renamed, or reclassified by this plan.

## Commit and Rollback Boundary

- Commit 1 contains only `tests/game/publicEventReplayIdentity.test.ts` with the real-room serialization/hash characterization.
- Commit 2 contains only the same test file's provider/store boundary and privacy assertions.
- No commit modifies production replay, ledger, identity, API, UI, benchmark, D0/D1 fixtures, approval, artifact, schema, or hash files.
- Rollback is limited to inverse commits for these two test-only commits; approved Task 5A, Task 4, D0, and D1 commits remain untouched.
- The implementation branch must remain based on `a078c5e79573137db57158b620b947440382a5fb` and must not merge or rebase `main`.

## Final Status Classification

- Task 5A Gate B remains the previously verified `D2A1_TASK5A_GATE_B_PASSED_AWAITING_FINAL_REVIEW`; this plan does not rerun, remount, or reclassify it.
- Local focused replay tests, typecheck, build, `npm test`, D0 check-only, source scans, and built-output scans all pass: `D2A1_TASK5_REMAINING_LOCALLY_COMPLETE_AWAITING_FINAL_REVIEW`.
- Any replay contract, privacy, frozen-evidence, environment, or previously approved Task 5A final-review blocker remains: `D2A1_TASK5_REMAINING_NOT_APPROVED`.

The plan does not authorize Task 4, D2b, calibration, smoke, formal execution, or any remaining Task 5 implementation beyond the explicitly listed test-only file.
