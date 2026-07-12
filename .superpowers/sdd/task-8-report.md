# Task 8 — Reproducibility regression and smoke baselines

## Scope

Added `tests/benchmark/reproducibility.test.ts` only; no production (`src`) files were changed. The suite exercises the benchmark CLI, manifest merge path, replay verifier, diagnostics isolation, worker execution, safety counters, replay privacy, and the strategy adapter import boundary.

## TDD evidence

- RED: the initial merge assertion compared raw `BatchManifest.games` with `runBenchmark().games` metrics and failed with a shape mismatch (manifest summaries versus derived metrics).
- GREEN: the assertion was corrected to compare the one-shot manifest with `mergeBatches` output; focused reproducibility tests then passed.

## Verification

- `npx vitest run tests/benchmark/reproducibility.test.ts --reporter=dot`: 5 tests passed.
- `npx vitest run tests/benchmark --reporter=dot`: 9 files, 45 tests passed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.

The 50-seed merge regression runs one 200-seed paired manifest and four paired 50-seed manifests, then compares stable game summaries and both public/final hash maps after volatile-field stripping.

## Smoke baselines

Commands (all paired default, seeds `1-20`, replay mode `failures`, concurrency `2`, timeout `1000ms`):

```text
npx tsx scripts/runAiBenchmark.ts --strategy-a unified-current --strategy-b legal-random --seeds 1-20 --replay failures --concurrency 2 --timeout-ms 1000 --output artifacts/ai-benchmark-smoke-unified-random.json
npx tsx scripts/runAiBenchmark.ts --strategy-a unified-current --strategy-b legal-greedy --seeds 1-20 --replay failures --concurrency 2 --timeout-ms 1000 --output artifacts/ai-benchmark-smoke-unified-greedy.json
npx tsx scripts/runAiBenchmark.ts --strategy-a unified-current --strategy-b legacy-reference --seeds 1-20 --replay failures --concurrency 2 --timeout-ms 1000 --output artifacts/ai-benchmark-smoke-unified-legacy.json
```

Each command emitted `AI benchmark: 160 games` (20 seeds × 8 paired games). The bounded smoke runs recorded 160 failures and 0 completed games per pair, all `BENCHMARK_TIMEOUT:1000`; this is expected for the explicit 1-second smoke bound. Aggregate ignored artifacts are in `artifacts/ai-benchmark-smoke.json` and `.md`.

## Concerns

- The full real-strategy smoke matrix needs a larger timeout or longer runtime budget to produce completed games; the recorded baseline intentionally uses a bounded timeout so all three 160-game commands terminate deterministically.
