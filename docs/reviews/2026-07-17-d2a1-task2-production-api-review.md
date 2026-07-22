# D2a.1 Task 2 Production API Canonical Room Review

## Review scope

- Task 1 implementation baseline: `3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34`
- Task 1 review parent: `294e25c`
- Reviewed Task 2 commit: `7a428ca788bb7911dbd2c2da44deb259cb8e8f2f`
- `formalExecutionAllowed`: `false`
- No smoke, calibration, formal, UI, Task 3, or D2b work was run.

## Commit and diff audit

The direct Task 2 diff (`294e25c..7a428ca`) contains only:

| Status | File |
|---|---|
| modified | `src/server/api.ts` |
| modified | `src/server/dev.ts` |
| modified | `tests/server/api.test.ts` |
| added | `tests/server/apiCanonicalIdentity.test.ts` |

Direct diff: 4 files, 294 insertions, 11 deletions.

The requested Task 1 code-to-Task 2 range (`3cdc8ff..7a428ca`) also includes the already committed Task 1 review document `docs/reviews/2026-07-17-d2a1-task1-final-review.md`; it is documentation-only. No `src/game/room.ts`, `src/ui`, benchmark production contract, D2a event/ledger/replay contract, D0/D1 artifact, or approval file changed in Task 2.

## Contract audit

| Item | Result | Evidence / notes |
|---|---|---|
| `buildApi` requires `PublicIdentityProvider` | PASS | `src/server/api.ts:56-57` |
| No default provider or memory fallback | PASS | Provider is required before Fastify app construction |
| Missing provider cannot enable route | PASS | Focused test and runtime guard |
| API does not construct identity | PASS | Identity comes only from `provider.allocate` |
| `RoomState.id`/`nextRoomId` not used for identity | PASS | Transport room id remains separate; provider supplies canonical identity |
| `D2A_IDENTITY_STORE_PATH` is the only dev store path source | PASS | `src/server/dev.ts:8-13` |
| Missing store path fails closed | PASS | Throws `D2A_IDENTITY_STORE_PATH_REQUIRED` before listen |
| Store init failure prevents listen | PASS | Store/provider are constructed before `app.listen` |
| Provider created once | PASS | One construction in dev composition root |
| Normal shutdown closes app and provider | PASS | Guarded shutdown at `src/server/dev.ts:16-24` |
| Close-on-`app.close()` exception | FAIL | `provider.close()` is not in `finally`; a rejected `app.close()` can leave the store open |
| Idempotency-Key validator reused | PASS | `validateIdempotencyKey` is called directly at `src/server/api.ts:157-160` |
| Missing/empty/whitespace/overlong/illegal key | PASS | Fresh runtime probe returned 400 for each |
| Case sensitivity and no trimming | PASS | Distinct `CaseKey`/`casekey` requests created distinct allocations |
| Unknown identity fields are rejected | FAIL | `publicIdentity`/`gameSequence` are destructured away and ignored; the request returns 200. The current test explicitly expects 200 (`tests/server/apiCanonicalIdentity.test.ts:105-113`). |
| Typed provider error mapping | PASS | Stable typed `code`/`instanceof` mapping at `src/server/api.ts:336-347`; no message matching |
| Error bodies do not expose internals | PASS | Focused tests assert no stack/database path; response contains stable public code only |
| `Retry-After: 1` on 503 | UNVERIFIED | No header is emitted; the implementation plan described this header as recommended, not mandatory |
| Same-key same-descriptor room reuse | PASS (functional) | Existing focused test returns same transport id and registry size 1 |
| Same-key no second `createRoom`/commit side effect spy | UNVERIFIED | Current focused test does not assert create/mark counters; code returns at line 193 before room creation/commit |
| Room creation failure compensation | PASS | Maps are written only after creation; failed creation leaves registry empty and retry test passes |
| `markRoomCommitted` failure compensation | PASS (static/semantic) | Lines 214-221 remove both maps; allocation remains `allocated` for retry |
| `room-committed` missing room -> 410 | PASS | Lines 190-199; focused restart test passes |
| `allocated` retry remains creatable | PASS | Existing allocation retry test passes |
| PublicRoom privacy | PASS | Private registry has identity/ledger; HTTP response omits `publicIdentity`, `publicLedger`, `publicEvents` |
| PublicRoom byte/deep-equal fixture lock | UNVERIFIED | No dedicated byte/deep-equal legacy response fixture was added in Task 2 |
| Production route avoids silent legacy fallback | PASS | Provider is mandatory and all canonical creation failures return errors |

## Timeout audit

Runtime inspection of the exact commit reported:

```json
{"requestTimeout":0,"connectionTimeout":0,"keepAliveTimeout":72000}
```

Repository search found no upstream/reverse-proxy timeout configuration. With request and connection timeout set to zero, the configured Fastify server does not impose a deadline below the Task 1 worst-case store wait (theoretical ~20.3 s; measured ~22.9 s). No `TASK2_REQUEST_TIMEOUT_CONTRACT_BLOCKED` condition was found.

## Fresh local verification

All commands were run from clean exact commit `7a428ca...` and naturally exited:

| Command | Result |
|---|---|
| Task 2/API focused | 2 files, 39 tests passed; exit 0 |
| Task 1 focused | 3 files, 21 tests passed; exit 0 |
| `npm test` | 60 files, 501 tests passed; exit 0; no open-handle warning |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| D0 fixture `--check-only` | exit 0 |
| `git diff --check` | exit 0 |

Browser bundle scan counts were zero for `better-sqlite3`, `sqlite3`, `node:sqlite`, and `better_sqlite3.node`.

## Ubuntu exact-commit CI evidence

- Run: `29564215500` — completed/success
- Job: `87833078665` — completed/success
- Workflow runner: `ubuntu-latest`; Node setup: `22.22.2`
- Workflow checkout explicitly used exact Task 2 code ref `7a428ca788bb7911dbd2c2da44deb259cb8e8f2f` (the workflow head itself was temporary commit `dc984bc...`)
- Job window: `2026-07-17T07:47:34Z`–`07:50:41Z`
- `npm ci`, Task 1/Task 2 focused, `npm test`, `tsc`, build, and D0 fixture check steps all succeeded
- Artifact: `8400517079`
- Artifact digest: `sha256:1ec66be3a6e5985577d95fb72d29e7fce302ca84ddecf0e167ac330f658253ce`
- `ubuntu-latest` is the approved Linux x64 runner class. The unauthenticated job metadata did not expose a separate architecture field; the workflow uploaded the `uname` record in the artifact.
- `better-sqlite3` prebuilt vs `node-gyp`: `UNVERIFIED` because install logs were not readable through the available API.

## Remaining blockers

1. The production API silently ignores forbidden identity-related body fields instead of rejecting them with a stable 400 response.
2. Dev shutdown does not guarantee store closure if `app.close()` rejects.
3. Required spy/counter evidence for no duplicate `createRoom` and `markRoomCommitted` side effects is not present in the focused test suite.
4. A dedicated byte/deep-equal PublicRoom legacy fixture lock is not present.

## Final decision

**D2A1_TASK2_NOT_APPROVED**

Task 3 must not start until the blockers above are resolved and reviewed. `formalExecutionAllowed` remains `false`.
