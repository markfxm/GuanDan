# D2a.1 Task 1 Identity Provider Completion Review

**Reviewed commit:** `771bca273465359e56a476a6418a117c29498940`
**Task 0 approval:** `a5005572b98077eb80d470a637ca243a9fd91322`
**Scope:** audit and temporary verification only; no implementation changes were made during this review.
**formalExecutionAllowed:** `false`

## 1. Submission and boundary audit

Task 1 changed exactly seven files:

| Status | File |
|---|---|
| M | `package.json` |
| M | `package-lock.json` |
| A | `src/server/publicIdentityDescriptor.ts` |
| A | `src/server/publicIdentityProvider.ts` |
| A | `src/server/publicIdentityStore.ts` |
| A | `tests/server/publicIdentityDescriptor.test.ts` |
| A | `tests/server/publicIdentityProvider.test.ts` |

Diff from the Task 0 commit: **1,023 insertions, 0 deletions**. `git diff --check` passed. The exact dependencies are `better-sqlite3: 12.11.1` and `@types/better-sqlite3: 7.6.13`.

The following remained unchanged: `src/game/room.ts`, `src/server/api.ts`, `src/ui/**`, benchmark production contracts, D2a public event/ledger/replay contracts, D0/D1 artifacts, and approval files. Production POST `/api/rooms` is not connected to this provider.

## 2. Descriptor contract audit

| Check | Result | Evidence |
|---|---|---|
| Descriptor contains only rank, seed and normalized pending tribute items | PASS | `src/server/publicIdentityDescriptor.ts:9-14` |
| Caller cannot provide `sessionIdentity` or `gameSequence` | PASS | `canonicalizeRoomRequestDescriptor`: forbidden-field check |
| Transport id, wall-clock, worker and hidden cards are not read | PASS | No such inputs or imports in descriptor module |
| Unknown non-contract fields are rejected rather than ignored | UNVERIFIED | The runtime function rejects the two identity fields but does not have an allow-list for every unknown key |
| Input is copied and not sorted in place | PASS | items are mapped to fresh objects before sorting |
| Full `(payer, receiver)` tuple ordering is stable | PASS | comparator sorts payer then receiver |
| Duplicate tribute-item multiplicity is preserved | PASS | no deduplication is performed |
| Same logical descriptor produces identical canonical bytes/hash | PASS | explicit JSON key order plus shared `sha256Bytes` |
| Valid descriptor fields cannot be omitted from the hash | PASS | rank, seed and all normalized items are serialized |
| Hash algorithm/encoding/output are fixed | PASS | UTF-8 bytes, SHA-256, lowercase 64-hex output |

## 3. Provider/store audit

| Check | Result | Evidence |
|---|---|---|
| Installation UUID is committed before read-back | PASS | immediate bootstrap transaction, insert, then read-back check |
| UUID is lowercase canonical RFC-4122 v4 | PASS | canonical v4/variant regex |
| Allocation requires completed bootstrap | PASS | constructor bootstraps before public allocation methods |
| Sequence starts at 1 | PASS | `next_game_sequence` initialized to `"1"` |
| No unsafe numeric sequence conversion | PASS | sequence is read as `bigint` and returned as decimal string |
| `defaultSafeIntegers()` enabled | PASS | store constructor |
| JSON/provenance sequence representation is decimal string | PASS | `PublicIdentityAllocation.gameSequence: string` |
| Fixed gameId vector | PASS | expected vector passed |
| Idempotency-Key validation | PASS | approved length, charset, no trim, case-sensitive behavior |
| Same key/same descriptor does not increment sequence | PASS | idempotent retry test |
| Same key/different descriptor is a stable typed conflict | FAIL | error is plain `Error("IDEMPOTENCY_CONFLICT")`, not a typed conflict instance |
| gameSequence UNIQUE | PASS | SQLite schema and duplicate insertion test |
| gameId UNIQUE | PASS | SQLite schema and duplicate insertion test |
| idempotency key UNIQUE | PASS | primary-key schema and conflict behavior |
| Initial lifecycle is `allocated` | PASS | allocation insert and test |
| `allocated → room-committed` | PASS | immediate lifecycle transition |
| Repeated commit is idempotent | PASS | repeated `markRoomCommitted` test |
| Reverse transition is rejected | PASS | `markAllocated` rejection test |
| Database path is explicit | PASS | constructor requires caller-provided path |
| Close/open-handle behavior | UNVERIFIED | focused tests naturally exit and temporary files are removable after worker exit; no dedicated active-handle assertion was present |

SQLite settings observed through the store: `foreign_keys=ON`, `synchronous=FULL`, `journal_mode=WAL`, `busy_timeout=5000`; allocation/bootstrap use better-sqlite3 `.immediate` transactions (BEGIN IMMEDIATE semantics).

## 4. BigInt and SQLite boundary verification

Temporary databases were used; no production database or artifact was modified.

| Sequence | SQLite read type | Canonical decimal | gameId/reopen stable |
|---:|---|---:|---|
| 1 | bigint | `1` | yes |
| 2^53−1 | bigint | `9007199254740991` | yes |
| 2^53 | bigint | `9007199254740992` | yes |
| 2^63−2 | bigint | `9223372036854775806` | yes |
| 2^63−1 | bigint | `9223372036854775807` | yes |

`9223372036854775808` failed closed with a BigInt binding `RangeError`; no wraparound or floating-point conversion occurred.

## 5. Independent-connection concurrency verification

Two worker threads, each with an independent better-sqlite3 connection to the same temporary database, were used. Both used `BEGIN IMMEDIATE` and `busy_timeout=5000`.

| Scenario | Result |
|---|---|
| Same key + same descriptor | PASS: one `new`, one `idempotent`; both sequence `1` and identical gameId |
| Same key + different descriptor | PASS: one `new`, one `IDEMPOTENCY_CONFLICT`; no second sequence |
| Different keys | FAIL: one run ended with an unhandled `SQLITE_BUSY` under two-worker contention |

The different-key failure is a hard completion blocker. No fix was attempted in this review.

## 6. Clean installation and local validation

A detached temporary worktree at the Task 1 commit ran real `npm ci` without `--ignore-scripts` or `--dry-run`:

- Windows x64, Node 24.15.0, npm 11.12.1;
- `npm ci`: exit 0;
- focused tests: exit 0, 2 files / 13 tests;
- `npx tsc --noEmit`: exit 0;
- `npm run build`: exit 0;
- browser bundle scan for `better-sqlite3`, `sqlite3`, `node:sqlite`, `better_sqlite3.node`: 0 matches;
- temporary worktree removed afterward.

The install log did not expose a reliable prebuilt/node-gyp line in this review, so both `prebuilt` and `node-gyp` status are `UNVERIFIED`. No new GitHub Actions Task 1 run was triggered; Ubuntu Node 22.22.2 evidence is therefore `UNVERIFIED` for this commit.

Final-commit local checks:

- focused tests: exit 0, 2 files / 13 tests;
- `npx tsc --noEmit`: exit 0;
- `npm run build`: exit 0;
- D0 fixture `--check-only`: exit 0;
- `git diff --check`: exit 0.

No smoke, calibration or formal benchmark was run.

## 7. Dependency and production boundary

`better-sqlite3` is imported only by `src/server/publicIdentityStore.ts`. Static scans found no native-store import in `src/ui`, `src/game` or benchmark code, and the browser bundle contains no native SQLite reference. `src/server/api.ts`, UI code and room creation remain unchanged.

## 8. Known issues

1. Independent different-key contention can surface unhandled `SQLITE_BUSY`; this blocks approval for Task 2.
2. Idempotency conflict is a stable error string rather than a typed conflict object.
3. Strict rejection of every unknown descriptor field and a dedicated open-handle assertion are not fully verified.

## 9. Final decision

**D2A1_TASK1_NOT_APPROVED**

Minimum blocking item: resolve and re-verify the independent-connection different-key `SQLITE_BUSY` failure. The typed conflict and verification gaps above also remain recorded. Task 2, production API/UI integration, D2b, smoke, calibration and formal execution are not started. `formalExecutionAllowed=false` remains unchanged.
