# D2a.1 Task 2 corrected final approval gate review

## Scope

Reviewed Task 2 remediation commit:

- Task 1 final: `3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34`
- Task 2 remediation: `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`
- Prior remediation review: `1325b89`
- Ubuntu root-cause research: `6747b5b`

This review reran the corrected Task 2 approval gate only. It did not modify production code, tests, UI, benchmark artifacts, D0/D1 artifacts, approval files, legacy schemas or hashes. It did not run smoke, calibration, formal, `npm run test:benchmark`, `d1CalibrationReview.test.ts`, or `cli.test.ts` as standalone commands.

`formalExecutionAllowed=false`.

## Official command contract

At exact commit `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`, `package.json` defines the formal test command as:

```text
vitest run --exclude tests/benchmark/** --exclude tests/simulation/** --exclude tests/performance/** --testTimeout=120000
```

The corrected approval gate is:

1. `npm ci`
2. Task 1 focused:
   `tests/server/publicIdentityDescriptor.test.ts`
   `tests/server/publicIdentityProvider.test.ts`
   `tests/server/publicIdentityConcurrency.test.ts`
3. Task 2 focused:
   `tests/server/api.test.ts`
   `tests/server/apiCanonicalIdentity.test.ts`
   `tests/server/apiShutdown.test.ts`
   `tests/server/publicRoomLegacyResponse.test.ts`
4. `npm test`
5. `npx tsc --noEmit`
6. `npm run build`
7. D0 fixture check-only:
   `npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree <d0-worktree> --source-commit e2a20e18f8e5c0871db38ad69426262e43766ce1 --output tests/ai/fixtures/d0KeepCurrentCases.json --generator-version d0-fixture-v1 --check-only`
8. `git diff --check`

Standalone benchmark tests are outside this corrected Task 2 gate.

## Local clean exact-commit verification

A fresh detached worktree was created at exact commit `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`. It did not copy ignored artifacts or `node_modules`; `artifacts/ai-benchmark-d1-calibration-v2` was absent. `npm ci` was run before verification.

| Command | Result |
|---|---|
| `npm ci` | exit 0; natural exit |
| Task 1 focused | exit 0; 3 files; 21 tests passed; natural exit |
| Task 2 focused | exit 0; 4 files; 50 tests passed; natural exit |
| `npm test` | exit 0; 62 files; 512 tests passed; natural exit |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0; Vite built `dist/` |
| D0 fixture check-only | exit 0 |
| `git diff --check` | exit 0 |
| Browser bundle scan for `better-sqlite3`, `sqlite3`, `node:sqlite`, `better_sqlite3.node` | 0 matches |

The local exact-commit gate passes on Windows.

## Ubuntu exact-commit gate

A temporary GitHub Actions workflow branch was created only to run the corrected gate. The workflow checked out exact remediation commit `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8` before running the gate commands, used `ubuntu-latest`, Node `22.22.2`, and `set -euo pipefail`, and did not run standalone benchmark tests, smoke, calibration or formal. The temporary branch and worktree were deleted after evidence collection.

Run evidence:

- Run: `29579094528`
- Job: `87880242148`
- Workflow commit: `db63c19978ea2a63b973804467149c2fd9df1d53`
- Tested commit requested by checkout step: `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`
- Runner: `ubuntu-latest`
- Node: `22.22.2`
- Artifact: `8406302572`
- Artifact digest: `sha256:ed1f569be33265decb3b30f1f0b4cc0bea496cbc5b6e3b55003407f9dfcd71d0`
- `ubuntuPrebuiltStatus=UNVERIFIED`

GitHub API step status:

| Step | Result |
|---|---|
| Checkout exact remediation commit | success |
| Setup Node 22.22.2 | success |
| Record environment | success |
| `npm ci` | success |
| Task 1 focused | success |
| Task 2 focused | success |
| `npm test` | failure |
| `npx tsc --noEmit` | skipped |
| `npm run build` | skipped |
| D0 fixture check-only | skipped |
| Upload gate logs | success |

The public GitHub job page exposes the failing annotation even though full logs and the uploaded artifact require authentication. The visible failure is in the `npm test` step:

```text
tests/benchmark/keepCurrentLock.test.ts
fatal: cannot change to '/home/runner/work/GuanDan/d0-fixture-ai-benchmark': No such file or directory
```

Additional visible annotations show the same missing D0 fixture source worktree affecting `keepCurrentLock` negative-provenance checks, with expected errors such as `D0_SOURCE_PRODUCTION_DIRTY`, `D0_SOURCE_COMMIT_MISMATCH`, `D0_FIXTURE_PROVENANCE_INVALID`, and `D0_FIXTURE_DRIFT` being replaced by the earlier missing-worktree failure.

## Interpretation

This corrected gate did not reproduce the prior `d1CalibrationReview.test.ts` missing calibration artifact failure or the prior `cli.test.ts` unknown-strategy assertion as standalone commands, because those commands were intentionally not part of this corrected gate.

However, the Ubuntu formal `npm test` step itself still failed. Contrary to the intended command contract, on Ubuntu the repository's `npm test` invocation reached `tests/benchmark/keepCurrentLock.test.ts`. That benchmark-path test requires a D0 fixture source worktree at `/home/runner/work/GuanDan/d0-fixture-ai-benchmark`, which the corrected gate did not create before `npm test` because the formal command contract expected benchmark tests to be excluded from `npm test`.

Therefore the corrected Task 2 approval gate remains blocked by test infrastructure, but the blocking symptom is now the Linux `npm test` benchmark exclusion / D0 fixture worktree precondition, not the previous calibration artifact test.

## Boundary recheck

The exact remediation commit still satisfies the focused Task 2 behavior covered locally and by Ubuntu focused status:

- Unknown and identity request body fields are rejected with HTTP 400 in focused tests.
- Rejected requests have zero provider, room and store side effects in focused tests.
- Shutdown resource ownership and double-error behavior are covered by focused tests.
- Same-key retry calls `createRoom` and `markRoomCommitted` only once in focused tests.
- PublicRoom legacy raw/deep-equal fixture passes locally.
- Browser bundle scan has zero SQLite native references locally.
- `src/ui`, `src/game/room.ts`, benchmark production contracts, D2a event/ledger/replay contracts, D0/D1 artifacts and approvals were not modified in this review.

## Decision

**D2A1_TASK2_NOT_APPROVED**

Reason:

```text
UBUNTU_FORMAL_NPM_TEST_GATE_FAILED
```

Minimum blocker:

```text
Linux npm test reaches tests/benchmark/keepCurrentLock.test.ts and fails because the D0 fixture source worktree is absent.
```

Task 3 and D2b must not start from this state.

Separate infrastructure note:

```text
BENCHMARK_TEST_INFRASTRUCTURE_REPAIR_REQUIRED_BEFORE_TASK6
```

The prior non-hermetic calibration artifact issue remains a future benchmark infrastructure concern, but it is not the failing symptom in this corrected Task 2 gate.
