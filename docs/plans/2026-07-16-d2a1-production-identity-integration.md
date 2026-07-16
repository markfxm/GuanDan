# D2a.1 Production Identity Integration Implementation Plan

> For agentic workers: execute this plan task by task with the execution-plans skill.

**Goal:** 正常 production 建局显式取得稳定 PublicGameIdentity 并创建 D2a publicLedger；legacy 创建显式隔离；D0/D1 trace、hash、schema、PublicRoom shape 与 D2a contract 不变。

**Status:** source contract = APPROVED_SOURCE_CONTRACT；store technology = STORE_TECHNOLOGY_NOT_APPROVED。Task 1–6 和 D2b 继续阻塞。formalExecutionAllowed=false。

## 1. Actual lifecycle mapping

| Area | Actual code | Finding |
|---|---|---|
| server entry | src/server/dev.ts: buildApi(), app.listen | no provider/session/store |
| API root | src/server/api.ts: buildApi() | local rooms Map only |
| production POST | src/server/api.ts: POST /api/rooms | Body has rank, seed, pendingTributeItems; calls createRoom without identity |
| transport id | src/game/room.ts: nextRoomId/createRoom | room transport id only; never canonical |
| UI | src/ui/api.ts:createGameRoom; src/ui/App.tsx:handleCreateRoom/handleNextRoom | no identity or sequence state |
| replay | src/game/publicEventReplay.ts | document already stores identity, initialState, events, finalLedgerHash |
| legacy callers | scripts/unifiedAiSimulation.ts; scripts/research/measureD1PlannerExpansionBudget.ts; tests/benchmark/simulator.ts | no identity; must be explicit legacy |
| canonical fixtures | tests/game/publicEventRoomAdapter.test.ts; tests/benchmark/d2aPublicLedgerAdapter.test.ts; tests/ai/publicLedger*.test.ts | explicit buildPublicGameIdentity |

package.json has no engines or packageManager field. package-lock.json is lockfileVersion 3 and CI uses npm ci. Local development is Windows_NT 10.0.19045, win32 x64, Node 24.15.0, npm 11.12.1. CI is ubuntu-latest with Node 22. Production start is npm run api / src/server/dev.ts; browser build is npm run build. No Dockerfile, Electron, pkg, nexe or single-file packaging was found. README documents Windows start scripts; Ubuntu is documented only by CI. macOS and other deployment targets are unverified.

No existing authenticated session, match/series id, durable sequence or production persistence was found. rooms Map, nextRoomId and Date.now seed are forbidden identity sources.

## 2. Approved identity and provider contract

### Installation identity

The single-server installation has one persistent opaque UUID:

1. generate only on first store initialization;
2. write it durably and read it back before accepting allocation;
3. retain it across restart;
4. never derive it from RoomState.id, nextRoomId, time, worker, directory, hidden cards or deck;
5. an uncommitted UUID is invalid;
6. keep it out of UI, PublicRoom, ledger and public events.

### Canonical request

Callers provide only:

~~~ts
type CanonicalRoomRequestDescriptor = Readonly<{
  rank: GameRank;
  seed: number;
  normalizedPendingTributeItems: readonly TributeItem[];
}>;
~~~

Provider never accepts sessionIdentity or gameSequence:

~~~ts
type PublicGameIdentityProvider = Readonly<{
  allocate(input: Readonly<{
    descriptor: CanonicalRoomRequestDescriptor;
    idempotencyKey: string;
  }>): Promise<Readonly<{
    status: "new" | "idempotent";
    descriptorHash: string;
    gameSequence: number;
    publicIdentity: PublicGameIdentity;
  }>>;
}>;
~~~

Transaction order is fixed: lookup key → compare descriptorHash → atomically allocate/increment sequence → derive identity → persist full allocation → return.

### Game ID bytes

Use exact bytes, not string concatenation:

~~~text
UTF8("D2A-PUBLIC-GAME-ID-V1")
+ 0x00
+ UTF8(lowercase RFC-4122 installation UUID with hyphens)
+ 0x00
+ UTF8(canonicalDecimal(gameSequence))
~~~

gameSequence starts at 1, has no leading zeros, and SHA-256 output is lowercase hex. Fixed vector:

~~~text
installationIdentity = 00000000-0000-4000-8000-000000000001
gameSequence = 1
inputHex = 4432412d5055424c49432d47414d452d49442d56310030303030303030302d303030302d343030302d383030302d3030303030303030303030310031
gameId = 1876686cbc6a0d445682319d421e704aa38440f0b0d772b3dfdd09cbd203a1d5
~~~

roundIdentity and handIdentity remain deterministic derivations from gameId and their sequence numbers.

## 3. PublicIdentityStore and technology decision

The store persists installationIdentity, nextGameSequence, idempotencyKey, descriptorHash, gameSequence, gameId and full PublicGameIdentity. Required constraints:

- idempotencyKey UNIQUE;
- gameSequence UNIQUE;
- gameId UNIQUE;
- same key/same descriptor is idempotent;
- same key/different descriptor is conflict;
- concurrent same key creates one allocation;
- restart returns the same allocation;
- ordinary in-memory Map or unlocked JSON write is not acceptable.

Repository inspection found no production store. The formal candidates are exactly:

**A. better-sqlite3 12.11.1 (recommended, not approved).** npm engines include Node 20/22/23/24/25/26; synchronous transaction and UNIQUE semantics are clear. Cost: native addon, Node ABI/prebuilt coverage, packaging and OS/architecture verification.

**B. node:sqlite (not selected).** Added in Node 22.5; Node 22.13 removed the flag but retained experimental stability; Node 24.15 is release candidate. Cost: minimum Node patch/stability coupling and upgrade risk while CI targets Node 22.

node-sqlite3 is removed from the formal candidates as deprecated/unmaintained. Task 1 may not switch candidates without a new decision.

### Preflight evidence

- better-sqlite3 12.11.1 installed in an isolated temporary directory.
- Windows Node 24.15.0 win32 x64 used a prebuilt binary; verbose install confirmed prebuild-install success and no node-gyp invocation.
- Temporary database passed BEGIN/COMMIT, UNIQUE conflict, close/reopen and row recovery.
- Node 22.22.2 win32 x64 loaded the same module and opened an in-memory database.
- npm run build passed; browser bundle scan found zero better-sqlite3/node:sqlite/sqlite3 references.
- Temporary dependency and database were deleted; package.json, package-lock, production code and artifacts are unchanged.
- Ubuntu Node 22 native install and real production OS/architecture were not executed; this is the approval blocker.

Decision status is STORE_TECHNOLOGY_NOT_APPROVED, not APPROVED_FOR_IMPLEMENTATION.

## 4. Room-level idempotency and bootstrap

Persist canonical gameId to active transport room mapping.

- Same process, same key/descriptor returns the existing room; no second transport id.
- Allocation committed but room commit failed: retry same key reconstructs from saved descriptor/allocation; no new sequence.
- Successful room response lost: retry returns original room.
- After restart provider returns same identity; deterministic initial-room reconstruction may use a new transport id, but gameId is unchanged.
- Allocation record retains the canonical descriptor needed for deterministic reconstruction.

Installation bootstrap uses a metadata singleton row. Generate UUID in memory, insert inside an atomic transaction, commit, read back, then enable allocation. Concurrent initializers use a singleton unique constraint; losers read the winner. Failed/rolled-back UUIDs are invalid.

## 5. Idempotency-Key contract

Header name: Idempotency-Key.

- required on production POST /api/rooms;
- missing, empty, malformed or whitespace-containing value: HTTP 400;
- length 1–128;
- allowed ASCII: A–Z, a–z, 0–9, dot, underscore, tilde, colon, hyphen;
- no trim; leading/trailing whitespace rejected; comparison case-sensitive;
- same key + same descriptor: idempotent response;
- same key + different descriptor: HTTP 409;
- key is absent from PublicGameIdentity, ledger, replay events and PublicRoom;
- one new-game intent owns one key; retry reuses it; next game uses a new key.

## 6. Production/legacy boundary and replay

Use explicit canonical/legacy input (or two explicit helpers). POST /api/rooms can only call canonical. Legacy D1 benchmark, research scripts and fixtures explicitly call legacy and have no ledger. Missing identity never silently becomes legacy.

Replay is independent of provider storage. Its authority is saved PublicGameIdentity, initialState, events and finalLedgerHash. Rebuild directly from that document; provider is optional audit only.

## 7. TDD tasks and commits

All tasks are blocked until store technology approval.

### Task 0 — source/store approval gate

Files: docs/decisions/2026-07-16-d2a1-public-game-identity-source.md; after approval, docs/benchmark-approvals/d2a1-identity-source-decision.json and tests/server/publicIdentityProviderContract.test.ts.

RED: run the contract test and expect only the unapproved store/provider decision to fail. Record installation lifecycle, selected store, transaction/UNIQUE constraints, restart path, room idempotency and Idempotency-Key. No production code.

### Task 1 — provider and descriptor

Create src/server/publicIdentityProvider.ts, src/server/publicIdentityDescriptor.ts, approved store adapter, tests/server/publicIdentityProvider.test.ts and tests/server/publicIdentityDescriptor.test.ts. Modify src/game/room.ts only for explicit canonical input.

RED: reject caller-supplied sessionIdentity/gameSequence; reject allocation before read-back; reject same key/different descriptor. Focused command:
npx vitest run tests/server/publicIdentityProvider.test.ts tests/server/publicIdentityDescriptor.test.ts --testTimeout=120000 --reporter=verbose
Commit: d2a1-task1-identity-provider-contract.

### Task 2 — production API

Modify src/server/api.ts and src/server/dev.ts; create tests/server/apiCanonicalIdentity.test.ts; extend tests/server/api.test.ts.

RED: missing provider/store POST fails; successful canonical POST has private ledger; response shape unchanged. Focused command:
npx vitest run tests/server/apiCanonicalIdentity.test.ts tests/server/api.test.ts --testTimeout=120000 --reporter=verbose
Commit: d2a1-task2-production-api-canonical-room.

### Task 3 — UI idempotency

Modify src/ui/api.ts and src/ui/App.tsx; create tests/ui/productionIdentityLifecycle.test.tsx and tests/server/apiIdempotency.test.ts.

RED: UI sends no identity/sequence, sends Idempotency-Key, retries same key and uses a new key for next game. Focused command:
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/server/apiIdempotency.test.ts --testTimeout=120000 --reporter=verbose
Commit: d2a1-task3-ui-api-idempotency.

### Task 4 — explicit legacy isolation

Modify src/game/room.ts creation boundary, scripts/unifiedAiSimulation.ts, scripts/research/measureD1PlannerExpansionBudget.ts and tests/benchmark/simulator.ts; create tests/game/legacyRoomIsolation.test.ts and tests/benchmark/legacyD1Compatibility.test.ts.

RED: missing mode/identity is rejected; explicit legacy has no ledger and old D1 trace/hash/schema remain byte-compatible. Focused command:
npx vitest run tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts tests/benchmark/d2aPublicLedgerAdapter.test.ts --testTimeout=120000 --reporter=verbose
Commit: d2a1-task4-explicit-legacy-isolation.

### Task 5 — restart recovery and standalone replay

Use the approved store adapter; modify replay only for saved document identity; create tests/server/publicIdentityStoreRestart.test.ts, tests/server/publicIdentityConcurrency.test.ts and tests/game/publicEventReplayIdentity.test.ts.

RED: store reopen returns same allocation; concurrent key does not double allocate; replay succeeds when provider is unavailable. Focused command:
npx vitest run tests/server/publicIdentityStoreRestart.test.ts tests/server/publicIdentityConcurrency.test.ts tests/game/publicEventReplayIdentity.test.ts --testTimeout=120000 --reporter=verbose
Commit: d2a1-task5-restart-and-standalone-replay.

### Task 6 — integration and regression

Modify only the already-listed production composition/API/UI files; create tests/server/d2a1ProductionIntegration.test.ts and review tests. RED: production POST has canonical identity/ledger, UI reaches it, legacy is ledger-free, PublicRoom shape and D0/D1 hashes are unchanged. Focused command:
npx vitest run tests/server/d2a1ProductionIntegration.test.ts tests/server/apiCanonicalIdentity.test.ts tests/ui/productionIdentityLifecycle.test.tsx tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts --testTimeout=120000 --reporter=verbose
Commit: d2a1-production-identity-integration.

## 8. Final gates

After Task 6 run D2a focused, D2a.1 focused, three fresh npm test runs, npm run test:benchmark, npm run test:simulation, npm run test:ai-performance, npm run build, npx tsc --noEmit, D0 fixture check-only and git diff --check. Record exit code, natural exit, duration and stderr. Never run smoke, calibration or formal. Review status can only be D2A_APPROVED_FOR_D2B_PLANNING or D2A_NOT_APPROVED.

## 9. Preflight record

Detailed environment, candidate, install, transaction, browser isolation, cleanup and decision evidence: docs/research/2026-07-16-d2a1-store-technology-preflight.md.

Stop conditions: unapproved store, failed restart recovery, missing production ledger, changed D1 trace/hash/schema, leaked PublicRoom identity/ledger, or any need to change D2a contracts.
