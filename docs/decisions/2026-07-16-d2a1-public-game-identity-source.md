# D2a.1 PublicGameIdentity Source Decision

**Decision date:** 2026-07-16
**Scope:** D2a.1 production identity integration
**formalExecutionAllowed:** false

## Status

**APPROVED_SOURCE_CONTRACT**

**STORE_TECHNOLOGY_PENDING**

This decision approves the identity lifecycle and provider allocation semantics. It does not yet authorize production implementation. The store technology must be approved before Task 1–6.

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
gameId = SHA-256(domainSeparator || installationIdentity || canonicalDecimal(gameSequence))
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

### Candidate A — SQLite with better-sqlite3 (recommended for approval)

Provides synchronous transactions, UNIQUE constraints, and straightforward crash/reopen behavior for a single server. The cost is a native addon, Node ABI/prebuilt-binary coverage, packaging, and a browser/server boundary that must be tested in the server build only.

### Candidate B — SQLite with sqlite3 async driver

Provides mature transactions and UNIQUE constraints through an asynchronous API. The cost is callback/worker scheduling, more complex initialization ordering, and more difficult audit of concurrent error propagation.

**Recommendation:** approve Candidate A unless deployment constraints reject native better-sqlite3. The implementation task must not switch candidates without a new decision.

## Idempotency-Key contract

- API uses an opaque HTTP Idempotency-Key header.
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

Task 0 must record the selected store technology, transaction mechanism, unique constraints, restart test path, and Idempotency-Key header contract. Only then may Task 1–6 begin.

Until that record is approved:

- source status remains APPROVED_SOURCE_CONTRACT;
- implementation status remains STORE_TECHNOLOGY_PENDING;
- no production code, tests, benchmark, approval, or artifact changes are authorized;
- D2b is blocked;
- formalExecutionAllowed remains false.
---
