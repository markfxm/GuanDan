# D2a.1 Task 2 Ubuntu `npm test` gate root-cause investigation

## Scope and decision boundary

This investigation compares the Task 1 baseline, the original Task 2 implementation, and the Task 2 remediation without changing production code, benchmark code, artifacts, approval files, or test behavior. No smoke, calibration, or formal experiment was run. `formalExecutionAllowed` remains `false`.

Reviewed commits:

| label | commit | meaning |
|---|---|---|
| A | `3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34` | Task 1 final |
| B | `7a428ca788bb7911dbd2c2da44deb259cb8e8f2f` | Task 2 original |
| C | `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8` | Task 2 remediation |

The Task 2 implementation diff (`B..C`) is limited to `src/server/api.ts`, `src/server/apiShutdown.ts`, `src/server/dev.ts`, and the related server tests/fixtures. It contains no benchmark scripts, benchmark tests, package scripts, Vite/Vitest configuration, or strategy registry changes. Therefore the two reported benchmark failures cannot be a Task 2 production-code regression based on the changed-file boundary.

## Current worktree pollution audit

The implementation worktree was inspected with `git status --short`, `git status --ignored --short`, `git clean -ndx`, `git ls-files artifacts`, and `git check-ignore -v`.

| path | observed state | tracking/ignore evidence |
|---|---|---|
| `artifacts/ai-benchmark-d1-calibration-v2` | present; 14 files (seven raw JSON files and seven manifests); last write `2026-07-16T03:16:08.9061099Z` | ignored by `.gitignore:7` (`artifacts/`), not tracked |
| `artifacts` | present; approximately 17,504 files; last write `2026-07-16T03:48:08.1140009Z` | only the compact D0 baseline files are tracked; experiment outputs are ignored |
| `tests/fixtures` | present; one `aiDecisionScenarios.ts` file | tracked test fixture directory |
| `tests/benchmark/fixtures` | absent | no tracked or ignored calibration fixture at this path |

`git ls-files artifacts` returns only `artifacts/ai-benchmark-baseline.json`, `artifacts/ai-benchmark-baseline.md`, and `artifacts/ai-benchmark-manifest.json`. `git clean -ndx` lists the ignored experiment outputs and `node_modules`; no cleanup was performed during the audit. The existing calibration directory is local historical data, not a committed fixture, and was not copied to any clean checkout.

## Test-contract findings

### `d1CalibrationReview.test.ts`

`package.json:9-10` defines `npm test` with `--exclude tests/benchmark/**`; the benchmark suite is separately selected by `test:benchmark`. `vite.config.ts:14-19` supplies only the jsdom/Vitest setup and does not create benchmark artifacts.

The fifth test at `tests/benchmark/d1CalibrationReview.test.ts:71-75` calls `inventoryDirectory("artifacts/ai-benchmark-d1-calibration-v2")` twice. `scripts/d1CalibrationReview.ts:87-95` resolves the directory and immediately calls `walkFiles(root)`; there is no missing-directory fallback, fixture loader, or test setup that creates the directory. Consequently a clean checkout fails with an `ENOENT` before the ordering assertion can run.

The directory is produced by a D1 calibration run/artifact workflow, is ignored by Git, and is not part of ordinary test setup. The test therefore has a non-hermetic dependency on a phase output. It should either be moved behind an explicit artifact-integration command or be supplied with a committed synthetic fixture/explicit setup contract; this investigation does not choose or implement that repair.

### `cli.test.ts`

At `tests/benchmark/cli.test.ts:49-51`, the input is:

```text
strategyA = "does-not-exist"
strategyB = "legal-random"
seeds = [1]
paired = true
replayMode = "none"
concurrency = 1
```

The expected result is one recorded failed game whose error contains `UNKNOWN_STRATEGY`. `tests/benchmark/strategies.ts:167-169` throws `UNKNOWN_STRATEGY:<id>` from `getStrategy`; `scripts/runAiBenchmark.ts:197-223` starts the real `tests/benchmark/worker.ts` with `Worker` and `execArgv: ["--import", "tsx/esm"]`, then maps worker errors into a failed `SimulationSummary`.

The prior Ubuntu report for run `29568998686`, job `87848090797`, recorded `expected false to be true` at the assertion. The fresh clean local A/B/C runs below all pass this focused test (11/11), so the CI-only result is not reproduced locally and is not attributable to the Task 2 diff. The current same-workflow matrix captured the step outcome in per-job artifacts; the unauthenticated public API exposes job conclusions and artifact digests but not the uploaded log contents, so an individual CLI exit from that matrix is recorded as not independently readable rather than inferred.

## Fresh clean local reproduction

Each commit was checked out in its own detached worktree, cleaned with `git clean -ffdx`, installed with a fresh `npm ci`, and run without artifacts or a shared `node_modules`. No artifact was generated or copied between commits.

| commit | `npm ci` | calibration review focused | CLI focused | `npm test` | artifact directory |
|---|---:|---|---|---|---|
| A `3cdc8ff` | 0 | **1**; 4/5 pass, `ENOENT` for missing `artifacts/ai-benchmark-d1-calibration-v2` | 0; 11/11 pass, including unknown-strategy | 0; 59 files / 488 tests pass, natural exit | absent |
| B `7a428ca` | 0 | **1**; 4/5 pass, same `ENOENT` | 0; 11/11 pass | 0; 60 files / 501 tests pass, natural exit | absent |
| C `4a6bcfa` | 0 | **1**; 4/5 pass, same `ENOENT` | 0; 11/11 pass | 0; 62 files / 512 tests pass, natural exit | absent |

The calibration failure is byte-for-byte the same missing-directory class on all three commits. The CLI failure reported by the earlier Ubuntu job is not reproduced in any clean local commit.

## Same-workflow Ubuntu matrix

A temporary, non-production workflow was run from branch `codex/task2-rootcause-ci` with three independent `ubuntu-latest` matrix jobs, each checking out its target SHA, using Node `22.22.2`, running `npm ci`, both focused benchmark tests, `npm test`, `tsc`, build, and D0 fixture check-only. The workflow used `set +e` only to collect every exit code, then returned nonzero if any exit was nonzero; it did not skip or downgrade failures.

Run: `29573973095` (head of diagnostic workflow `d4ba7f578add7e12eb6504afd69b1ef86ffe0c84`).

| target | job | conclusion | diagnostic artifact | digest |
|---|---:|---|---:|---|
| A `3cdc8ff` | `87864083811` | failure at the explicit diagnostic gate | `8404307968` | `sha256:2001ed67619ec2d6611ead78183c6be50b61265d7a3a84a0d8d1b7166236fc18` |
| B `7a428ca` | `87864083799` | failure at the explicit diagnostic gate | `8404310977` | `sha256:93d40cddd94d830aeca5d181ebe120569cda48ded9c7640b9d3578d17d7a85d2` |
| C `4a6bcfa` | `87864083770` | failure at the explicit diagnostic gate | `8404306570` | `sha256:62403340a8553292f71b50f42036e3c5e9f33b094fc1b0eed15797c2a8f8e712` |

All three jobs reached and completed the diagnostic step, uploaded their logs, and then failed the nonzero-exit gate; none was cancelled or timed out. The earlier approved-environment run `29568998686`/job `87848090797` supplies the detailed CI symptom: missing calibration directory plus the unknown-strategy assertion. The matrix independently establishes that the clean-checkout gate remains red for A, B, and C; its public metadata does not expose the archived per-command exit files, so no stronger claim is made about the CLI step in this matrix.

The repository CI workflow (`.github/workflows/ci.yml:14-30`) uses `ubuntu-latest`, Node major `22`, `npm ci`, `npm test`, and build, but does not materialize the ignored calibration directory. The diagnostic workflow was deleted after evidence collection and is not part of the implementation branch.

## Root-cause classification

**Primary classification: B — `PREEXISTING_NON_HERMETIC_TEST`.**

Evidence:

1. The calibration-review test fails identically in three clean, artifact-free commits, including the Task 1 baseline.
2. The required directory is ignored and is created only by a calibration phase, not by ordinary test setup.
3. `B..C` contains no benchmark/test/configuration changes.
4. Local CLI focused tests pass on all three commits; the earlier Ubuntu CLI symptom is a separate CI-only observation and is not enough to classify the Task 2 code as the cause.

Secondary observation: the earlier Ubuntu unknown-strategy assertion is a **CI-only/non-reproduced test-worker symptom**. It requires a separate deterministic worker investigation if it persists after the calibration-test contract is corrected; it is not a reason to change strategy behavior or weaken the assertion.

Required gate state:

```text
D2A1_TASK2_CI_GATE_BLOCKED_BY_PREEXISTING_TEST_INFRASTRUCTURE
```

Task 2 remains not approved and Task 3/D2b must not start until the benchmark test infrastructure contract is approved and repaired in a separate, explicitly scoped change.

## Minimal repair boundary (not implemented here)

1. Decide whether `d1CalibrationReview.test.ts` is an artifact-integration test rather than part of the clean `npm test` gate. If it remains in a required gate, provide a committed synthetic fixture or explicit setup that is versioned and validated; never copy historical calibration output into CI.
2. Re-run the unknown-strategy test on the approved Ubuntu worker with its complete log and worker entry details. If it remains CI-only, fix the worker-loading/test harness deterministically without changing strategy semantics, skipping the test, or changing Task 2 production code.
3. Re-run the same A/B/C matrix and require a clean checkout, natural exit, and nonzero enforcement before reconsidering Task 2.

## Boundary confirmation

- No production source, API, UI, room, strategy, statistics, replay, schema, approval, D0 artifact, or D1 artifact was modified.
- No smoke, calibration, or formal game was run.
- No calibration artifact was generated or copied.
- `formalExecutionAllowed` remains `false`.
