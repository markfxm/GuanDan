# D2a.1 Task 2 remediation review

## Scope and reviewed commits

- Task 1 final code: `3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34`
- Task 2 implementation: `7a428ca788bb7911dbd2c2da44deb259cb8e8f2f`
- Previous Task 2 review: `353152df45f7c36e5c2489fc083d6b7e17b72d21`
- Remediation code: `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`

The remediation diff from the previous review is 8 files, 234 insertions and 17 deletions. It contains only API validation, shutdown ownership, focused tests and the legacy response fixture. `src/game/room.ts`, `src/ui/**`, benchmark production contracts, D2a event/ledger/replay contracts, D0/D1 artifacts and approval files are unchanged.

## Remediation audit

### Raw body allow-list

`src/server/api.ts:isAllowedCreateRoomBody` runs before destructuring the `/api/rooms` body. It accepts only own enumerable data properties `rank`, `seed` and `pendingTributeItems`; symbols, accessors, arrays, null and unknown keys are rejected. The route returns `{ "error": "INVALID_CREATE_ROOM_REQUEST" }` with HTTP 400 before provider allocation. Focused tests cover `publicIdentity`, `gameSequence`, multiple identity fields and a generic unknown field, and assert zero provider calls, zero room creation calls, zero registry changes and zero allocation rows.

### Shutdown ownership

`src/server/apiShutdown.ts` performs app close and provider close in separate guarded steps. Provider close runs when app close throws; one error is rethrown, and two errors are retained in `AggregateError`. `createApiShutdown` memoizes the promise, so repeated signal/shutdown calls do not close either resource twice. `src/server/dev.ts` uses this helper and catches signal-path rejection without `process.exit`.

### Same-key side effects

`tests/server/apiCanonicalIdentity.test.ts` uses injected provider and room spies. Two same-key/same-descriptor requests call `allocate` twice but `createRoom` once and `markRoomCommitted` once, return the same transport id and leave one registry entry. The commit-failure retry test verifies map rollback and retry of the same allocation.

### PublicRoom legacy lock

The fixture was generated in a fresh worktree at the pre-remediation baseline commit `3cdc8ff...` using rank `10`, seed `1`, and empty pending tribute items. The raw response is stored in `tests/server/fixtures/publicRoomLegacyResponse.json`; provenance and SHA-256 (`38eebc05a05e3fa64a805bac1316885e00c53038c957d9988c0b182470af77bd`) are in the adjacent metadata file. `tests/server/publicRoomLegacyResponse.test.ts` compares raw bytes and parsed deep equality and rejects private identity, ledger, events, sequence, descriptor and idempotency fields in the public response.

## Fresh local verification on `4a6bcfa`

| Command | Result |
|---|---|
| Task 2/API/shutdown/legacy-lock focused (4 files) | exit 0; 50 tests passed; natural exit |
| Task 1 focused (3 files) | exit 0; 21 tests passed; natural exit |
| `npm test` | exit 0; 62 files, 512 tests passed; natural exit |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| D0 fixture `--check-only` | exit 0 |
| `git diff --check` | exit 0 |
| browser bundle scan (`better-sqlite3`, `sqlite3`, `node:sqlite`, `better_sqlite3.node`) | 0 matches |

The implementation worktree was clean after the code commit. No smoke, calibration or formal benchmark was run.

## Exact Ubuntu evidence

The temporary workflow checked out the exact remediation commit after an explicit fetch and ran on `ubuntu-latest` with Node `22.22.2`; focused tests and `npm ci` completed successfully. The final run was:

- Run: `29568998686`
- Job: `87848090797`
- Tested commit: `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`
- Artifact: `8402340593`
- Artifact digest: `sha256:de81345630d7f86ab15e3fa0f97a42cff373e29b33386b31cd2829dce407469c`

The job did **not** pass the required full `npm test` gate. It failed in pre-existing benchmark tests that were included by the repository's current test invocation: `d1CalibrationReview.test.ts` could not find `artifacts/ai-benchmark-d1-calibration-v2`, and `cli.test.ts` failed its recorded unknown-strategy assertion. Consequently typecheck, browser build and fixture steps were skipped by CI. The temporary workflow, branch and worktree were deleted after evidence collection. `ubuntuPrebuiltStatus` is `UNVERIFIED` because install logs were not available for independent inspection.

## Boundaries and remaining blocker

- No UI, `src/game/room.ts`, benchmark strategy, D2a contract, D0/D1 artifact or approval changes.
- Production API has no legacy fallback for a valid canonical route; invalid body/provider failures fail closed.
- `formalExecutionAllowed` remains `false`.

## Final decision

**D2A1_TASK2_NOT_APPROVED**

Minimum blocker: the exact remediation commit does not have a passing Ubuntu/Linux x64 Node 22.22.2 full `npm test` gate. No further remediation is performed in this review.
