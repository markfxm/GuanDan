# D2a.1 PublicGameIdentity Source Decision

**Decision date:** 2026-07-16
**Scope:** D2a.1 production identity integration
**formalExecutionAllowed:** false

## Status

**APPROVED_SOURCE_CONTRACT**

**STORE_TECHNOLOGY_NOT_APPROVED**

This decision approves the identity lifecycle and provider allocation semantics. better-sqlite3 12.11.1 is the recommended store candidate, but the actual Ubuntu Node 22 CI/deployment native-install matrix remains unverified. Production implementation is not authorized until that gate passes.

## Approved identity source

The single-server deployment uses a persistent installation identity.

- It is generated only during first initialization of the identity store.
- It must be durably persisted before the first allocation is accepted.
- The same value is read after every server restart.
- It is an opaque UUID and is not derived from RoomState.id, nextRoomId, Date.now, performance.now, worker id, output directory, object address, hidden hands, or deck order.
- An unpersisted random UUID is invalid. A generated UUID becomes valid only after a successful durable write and read-back verification.
- It is private server state and never enters PublicRoom, public ledger, public event payload, or UI state.

## Approved sequence ownership

gameSequence is a durable, global, monotonic allocation value owned by PublicIdentityStore.

- Callers never provide gameSequence.
- Callers provide only a canonical room request descriptor and an opaque idempotency key.
- The store allocates and increments gameSequence inside one transaction or an equivalent atomic uniqueness mechanism.
- The value is persisted in the allocation record and returned as provenance for the newly allocated identity.
- gameSequence is unique and cannot be reused after a committed allocation.

## Approved request/provider contract

~~~ts
type CanonicalRoomRequestDescriptor = Readonly<{
  rank: GameRank;
  seed: number;
  normalizedPendingTributeItems: readonly TributeItem[];
}>;

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

The provider transaction is fixed:

1. Query idempotencyKey.
2. If found, compare descriptorHash; equal returns idempotent, different returns conflict.
3. Allocate and increment gameSequence atomically.
4. Derive gameId.
5. Derive roundIdentity and handIdentity.
6. Persist the complete allocation.
7. Return new.

No API, UI, benchmark adapter, or replay caller may pass sessionIdentity or gameSequence.

## Canonical gameId derivation

Use the versioned domain separator D2A-PUBLIC-GAME-ID-V1 and canonical decimal encoding:

~~~text
UTF8("D2A-PUBLIC-GAME-ID-V1") + 0x00
+ UTF8(lowercase RFC-4122 UUID with hyphens) + 0x00
+ UTF8(canonicalDecimal(gameSequence))

gameId = SHA-256(the exact bytes above)
~~~

The separator, encoding, SHA-256 implementation, and canonical concatenation must be locked by tests before implementation. roundIdentity and handIdentity remain deterministic derivations from gameId and their explicit sequence values.

## PublicIdentityStore contract

The store must persist at least:

- installationIdentity;
- nextGameSequence;
- idempotencyKey;
- descriptorHash;
- gameSequence;
- gameId;
- complete PublicGameIdentity.

The following constraints are mandatory:

- idempotencyKey UNIQUE;
- gameSequence UNIQUE;
- gameId UNIQUE;
- same key plus same descriptor is idempotent;
- same key plus different descriptor is a conflict;
- concurrent same-key requests create one allocation;
- reopening after restart returns the same allocation.

An in-memory Map, an unlocked ordinary JSON write, or a file replacement without a demonstrated transaction/unique/crash-recovery contract is not an approved implementation.

## Store technology candidates

Repository inspection found no production SQLite, Postgres, LevelDB, or equivalent persistence dependency. Existing fs writes are benchmark/artifact writers and are not suitable.

### Candidate A — better-sqlite3 12.11.1 (recommended, not yet approved)

Provides synchronous transactions, UNIQUE constraints, and straightforward crash/reopen behavior for a single server. The cost is a native addon, Node ABI/prebuilt-binary coverage, packaging, and a browser/server boundary that must be tested in the server build only.

### Candidate B — node:sqlite

Node 22.5 introduced node:sqlite; Node 22.13 removed the flag but retained experimental stability, and Node 24.15 is release candidate. The cost is coupling the store to the Node minimum patch/stability level and to a future Node upgrade. It is not selected while CI targets Node 22.

**Recommendation:** Candidate A, exact version 12.11.1. A Windows Node 22/24 temporary preflight passed module load, transaction, UNIQUE and reopen checks using a prebuilt binary. Ubuntu CI/deployment native installation was not executed here, so this decision remains STORE_TECHNOLOGY_NOT_APPROVED. Task 1 must not switch candidates without a new decision.

## Idempotency-Key contract

- API uses an opaque HTTP header named Idempotency-Key.
- Missing, empty, malformed or whitespace-containing values return HTTP 400; accepted length is 1–128 ASCII characters from A–Z, a–z, 0–9, dot, underscore, tilde, colon and hyphen. Values are not trimmed and comparison is case-sensitive.
- One user create intent owns one key.
- Request retry reuses that key.
- A successful intent is complete; the next game uses a new key.
- The key is not part of PublicGameIdentity, public ledger, PublicRoom, or public replay events.
- Same key and same descriptor is idempotent.
- Same key and different descriptor is HTTP 409 and does not create a second room.

## Replay boundary

Historical public replay is independent of the allocation store. Its authority is the saved:

- PublicGameIdentity;
- initialState;
- public events;
- finalLedgerHash.

Rebuild creates the initial public ledger from the saved identity and initialState, applies events in order, and compares finalLedgerHash. The provider/store may perform optional audit checks but is not required for successful replay of a complete, version-matching document.

## Implementation gate

Task 0 must record the selected store technology, transaction mechanism, unique constraints, restart test path, Idempotency-Key header contract, room-level gameId mapping and installation bootstrap transaction. Only after the Ubuntu Node 22/deployment native-install gate passes may Task 1–6 begin.

Until that record is approved:

- source status remains APPROVED_SOURCE_CONTRACT;
- implementation status remains STORE_TECHNOLOGY_NOT_APPROVED;
- no production code, tests, benchmark, approval, or artifact changes are authorized;
- D2b is blocked;
- formalExecutionAllowed remains false.
---
## Ubuntu gate result (2026-07-17)

### Precision contract

PublicIdentityStore/provider use bigint internally. JSON, review, provenance and descriptor representations use canonical decimal strings. better-sqlite3 connections call defaultSafeIntegers; unsafe JavaScript number reads are forbidden. gameId accepts only a no-leading-zero decimal string, including tests around and above 2^53.

Allocation has two states: allocated and room-committed. Same process and same key/descriptor return the same live room and transport id. After restart, allocated may retry from its saved descriptor. room-committed without a durable room snapshot returns ROOM_STATE_UNAVAILABLE_AFTER_RESTART and cannot create a new initial room with the same gameId. Public replay remains independent of provider/store; full room persistence is outside D2a.1.

### SQLite runtime settings

- server-only better-sqlite3 import;
- database path from explicit D2A_IDENTITY_STORE_PATH;
- defaultSafeIntegers();
- PRAGMA foreign_keys=ON;
- PRAGMA synchronous=FULL;
- PRAGMA journal_mode=WAL;
- PRAGMA busy_timeout=5000;
- BEGIN IMMEDIATE for bootstrap/allocation with explicit commit/rollback.

### Real CI evidence

Workflow codex/d2a1-store-preflight completed successfully in GitHub Actions: run 29521740862, job 87700224446, head 1a5f5f53082862e911d0f0ffe3f905c5298e6cf6, ubuntu-latest, Node 22.22.2, natural completion in 19 seconds. Install, transaction/restart script and artifact upload steps succeeded. Artifact 8384974836 has digest sha256:a291ee8433688989d8c58223db4786014fdc88d3061a239089e7dd06bc426b97.

The workflow logs and uploaded artifact require repository-admin authentication for download in this environment (API returned 403/401). Therefore the exact prebuilt-versus-node-gyp line cannot be independently read here; no unsupported claim is made.

### Support and decision

Confirmed: Windows x64 Node 24 development and Ubuntu x64 Node 22 CI. The project has not declared an actual production deployment target. Record PRODUCTION_DEPLOYMENT_TARGET_UNRESOLVED and CI_STORE_COMPATIBILITY_APPROVED as a sub-result. Overall status remains STORE_TECHNOLOGY_NOT_APPROVED; do not create d2a1-identity-source-decision.json.
