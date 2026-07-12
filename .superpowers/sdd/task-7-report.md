# Task 7 — Worker-thread execution and CLI

## Scope

Implemented the benchmark CLI and worker protocol without modifying `src`:

- `tests/benchmark/worker.ts` runs immutable task payloads in worker-local module/runtime state.
- `scripts/runAiBenchmark.ts` parses strategy/seed/batch/resume/replay/diagnostic/timeout/concurrency options, executes directly for concurrency 1 and with `worker_threads` above 1, emits stable `matchId`-sorted summaries, validates manifests, writes reports and replays, and records timeout/strategy failures.
- `scripts/replayAiBenchmark.ts` replays a saved match and verifies public/final hashes.
- `package.json` exposes `benchmark:ai` and `benchmark:replay` scripts.
- `tests/benchmark/cli.test.ts` covers parsing, worker-count stability, sorting, and recorded unknown-strategy failures.

## TDD evidence

RED: `npx vitest run tests/benchmark/cli.test.ts` failed during collection because `scripts/runAiBenchmark` did not exist (`Failed to resolve import`).

GREEN: `npx vitest run tests/benchmark/cli.test.ts` passed: 3 tests passed.

## Verification

- Focused CLI tests: passed (3 tests).
- All benchmark tests: passed (8 files, 34 tests).
- TypeScript: `npx tsc --noEmit` passed.
- Whitespace: `git diff --check` passed (only the normal package.json line-ending warning).

## Notes / limitations

- Diagnostics are accepted as a CLI option; existing simulator summaries do not expose additional diagnostics payloads, so no strategy behavior is changed.
- Direct (concurrency 1) timeout is enforced after synchronous simulation returns; worker execution can terminate an over-time task while other workers continue.
