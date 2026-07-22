# Task 7 — Worker-thread execution and CLI

## Scope

Implemented the benchmark CLI and worker protocol without modifying `src`:

- `tests/benchmark/worker.ts` runs immutable task payloads in worker-local module/runtime state.
- `scripts/runAiBenchmark.ts` parses strategy/seed/batch/resume/replay/diagnostic/timeout/concurrency options, executes directly for concurrency 1 and with `worker_threads` above 1, emits stable `matchId`-sorted summaries, validates complete manifests and each reused game hash, writes reports and replays, and records timeout/strategy failures while retiring timed-out workers.
- `scripts/replayAiBenchmark.ts` replays a saved match using its saved benchmark version, replay mode (defaulting old documents to `failures`), and config hash before verifying public/final hashes.
- `package.json` exposes `benchmark:ai` and `benchmark:replay` scripts.
- `tests/benchmark/cli.test.ts` covers parsing, inclusive batch filtering and paired semantics, worker-count stability, sorting, timeout/stale-result suppression, diagnostics invariance/isolation/reporting, manifest resume validation, replay config preservation, and recorded unknown-strategy failures.

## TDD evidence

RED: the review regression test initially failed with `PAIRED_REQUIRED` when the paired flag was omitted.

GREEN: `npx vitest run tests/benchmark/cli.test.ts` passed: 9 tests passed.

## Verification

- Focused CLI tests: passed (9 tests).
- All benchmark tests: passed (8 files, 40 tests).
- TypeScript: `npx tsc --noEmit` passed.
- Whitespace: `git diff --check` passed (only the normal package.json line-ending warning).

## Notes / limitations

- Diagnostics are per-game summaries and compact report fields; they count decisions without entering strategy observations, and on/off runs retain identical actions and public hashes.
- Paired mode defaults to the D0 matrix: each selected seed is a complete four-rotation × two-allocation (8 game) unit. Explicit `--paired=false` runs the four-rotation, single-allocation (4 game) unpaired slice. `--batch` selects an inclusive seed subrange.
- Timed-out workers are retired and terminated before replacement; late messages/errors are ignored by slot/task identity checks.
