# D2a.1 Task 2 CI-gate portability remediation review

## Scope and commits

- Task 2 remediation baseline: `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`
- Portability remediation commit: `b2655c3f90dd58136467898dbb624175e77e2849`
- This review covers only the cross-platform `npm test` collection contract.
- Task 2 API/shutdown code, `src/server/api.ts`, `src/server/dev.ts`, `src/game/room.ts`, UI, D0 fixtures, D1 artifacts, benchmark semantics, and schemas were not changed.

## Root cause addressed

The formal `npm test` script previously passed unquoted `tests/benchmark/**`, `tests/simulation/**`, and `tests/performance/**`. On POSIX shells those globs could expand before Vitest received them. The remediation quotes all three patterns while preserving the exact exclusion scope.

The added portability test also verifies the three patterns as complete argv values through a real child process. The package-script assertion locks the shell-facing quoting contract; the child-process assertion locks argv-level argument integrity.

## Changes

| File | Change |
| --- | --- |
| `package.json` | Quote the three existing Vitest `--exclude` globs; no test timeout or exclusion scope change. |
| `tests/tooling/npmTestCollectionContract.test.ts` | Regression coverage for quoted script arguments and argv-level integrity. |

The remediation does not alter `keepCurrentLock.test.ts`, `d1CalibrationReview.test.ts`, D0 fixture generation, or any benchmark behavior.

## Fresh local verification at `b2655c3f90dd58136467898dbb624175e77e2849`

| Command | Result |
| --- | --- |
| portability focused test | PASS, 1 file / 1 test |
| Task 1 focused tests | PASS, 3 files / 21 tests |
| Task 2 focused tests | PASS, 4 files / 50 tests |
| `npm test` | PASS, 63 files / 513 tests; benchmark/simulation/performance directories were not collected; natural exit |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; Vite browser bundle built |
| D0 fixture `--check-only` | PASS using the existing clean approved D0 source worktree at `e2a20e18f8e5c0871db38ad69426262e43766ce1` |
| `git diff --check` | PASS |

The `npm test` script remains:

```text
vitest run --exclude "tests/benchmark/**" --exclude "tests/simulation/**" --exclude "tests/performance/**" --testTimeout=120000
```

The generated browser bundle contains zero matches for `better-sqlite3`, `sqlite3`, `node:sqlite`, and `better_sqlite3.node`.

## Explicitly unresolved independent gates

The D0 lock still requires the sibling source worktree `../d0-fixture-ai-benchmark` when its regeneration check is run. The calibration review test still requires ignored calibration artifacts. Neither dependency was changed in this remediation, and no artifact was created or copied.

Those remain separate infrastructure work items before the D0 lock gate can be made hermetic and before `npm run test:benchmark`/Task 6 final acceptance.

## Ubuntu CI evidence

No new real GitHub Actions run could be triggered or read from this environment:

- `gh` CLI is unavailable;
- no GitHub write/authentication capability is configured;
- the repository workflow only triggers on `main` push or pull request, and the remediation branch is not a remote `main` update.

Therefore Ubuntu/Linux x64 + Node 22.22.2 evidence for the exact remediation commit is **UNVERIFIED**. No run ID, job ID, artifact ID, digest, or prebuilt/node-gyp claim is invented.

## Final status

`D2A1_TASK2_NOT_APPROVED`

Blocking item: missing exact-commit Ubuntu GitHub Actions evidence. The local portability and formal Task 2 gates pass, but they cannot substitute for the required approved-environment CI evidence.

`formalExecutionAllowed=false`.

Task 3 and D2b remain unopened. The review commit must remain separate from the code commit.
