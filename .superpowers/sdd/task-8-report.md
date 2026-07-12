# Task 8 — Reproducibility regression and smoke baselines

## Scope

Added `tests/benchmark/reproducibility.test.ts` only; no production (`src`) files were changed. The suite exercises the benchmark CLI, manifest merge path, replay verifier, diagnostics isolation, worker execution, safety counters, replay privacy, and the strategy adapter import boundary.

## TDD evidence

- RED: the initial merge assertion compared raw `BatchManifest.games` with `runBenchmark().games` metrics and failed with a shape mismatch (manifest summaries versus derived metrics).
- GREEN: the assertion was corrected to compare the one-shot manifest with `mergeBatches` output; focused reproducibility tests then passed.

## Verification

- `npx vitest run tests/benchmark/reproducibility.test.ts --reporter=dot`: 6 tests passed (249.7s).
- `npx vitest run tests/benchmark --reporter=dot`: 9 files, 46 tests passed (270.6s).
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.

The 50-seed merge regression runs one 200-seed paired manifest and four paired 50-seed manifests, then compares stable game summaries and both public/final hash maps after volatile-field stripping.

## Smoke baselines

Commands (all paired default, seeds `1-20`, replay mode `failures`, concurrency `2`, timeout `120000ms`):

```text
npx tsx scripts/runAiBenchmark.ts --strategy-a unified-current --strategy-b legal-random --seeds 1-20 --replay failures --concurrency 2 --timeout-ms 120000 --output artifacts/ai-benchmark-smoke-unified-random120.json
npx tsx scripts/runAiBenchmark.ts --strategy-a unified-current --strategy-b legal-greedy --seeds 1-20 --replay failures --concurrency 2 --timeout-ms 120000 --output artifacts/ai-benchmark-smoke-unified-greedy120.json
npx tsx scripts/runAiBenchmark.ts --strategy-a unified-current --strategy-b legacy-reference --seeds 1-20 --replay failures --concurrency 2 --timeout-ms 120000 --output artifacts/ai-benchmark-smoke-unified-legacy120.json
```

Each command emits 160 games (20 seeds × 8 paired games). Smoke results are **PENDING**: no 120-second command produced a final report before the bounded execution window, so no completed/error counts are claimed here. Aggregate ignored artifacts are in `artifacts/ai-benchmark-smoke.json` and `.md`.

## Concerns

- The real-strategy smoke matrix is intentionally run with a 120-second per-task timeout and may take a long wall-clock time at concurrency 2; rerun to completion before publishing baseline counts.
