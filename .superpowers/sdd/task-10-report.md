# Task 10 report: baseline provenance and performance instrumentation

## Scope

Implemented Task 10 without modifying `src/`. Benchmark summaries now carry a measured wall-clock `durationMs`; reports, manifests, and replays require explicit non-unknown provenance; CLI runs emit a Markdown companion report with the required audit sections.

## TDD evidence

- RED: newly added simulator assertions failed because `durationMs` was absent; the reporting assertion failed because zero-duration rows were accepted.
- GREEN: implemented timing, validation, provenance normalization, replay validation, Markdown rendering, and CLI wiring.

## Changes

- `tests/benchmark/simulator.ts`: wraps complete simulation in `performance.now()` and clamps only sub-millisecond measurements to `0.001` ms; timeout summaries also carry positive durations.
- `tests/benchmark/contracts.ts`: adds required `GameSummary.durationMs` and `BenchmarkProvenance`.
- `tests/benchmark/reporting.ts`: derives `ENGINE_VERSION` from package version plus source commit, derives deterministic SHA-256 `ROOM_RULES_VERSION`, rejects missing/unknown/invalid descriptors and rules fingerprints, validates positive durations, emits provenance in reports/manifests/replays, and adds `buildMarkdownReport`/`writeMarkdownReport` with purpose, policy, sample/fairness, outcomes/CIs/significance/Elo, classifications, performance, anomalies, and limitations sections.
- `scripts/runAiBenchmark.ts`: measures wall-clock elapsed time for direct and worker timeout/error paths, passes explicit provenance through all artifacts, and writes a sibling Markdown report when `--output` is used.
- `scripts/replayAiBenchmark.ts`: rejects incomplete/unknown replay provenance before verification.
- `tests/benchmark/statistics.ts`: rejects zero/missing duration rows before aggregate performance statistics.
- Benchmark tests cover the new behavior and update deterministic assertions to ignore intentionally variable duration.

## Verification

- Fresh focused run, `npx vitest run tests/benchmark/reporting.test.ts tests/benchmark/cli.test.ts --reporter=dot`: 2 files and 17 tests passed.
- Fresh benchmark run excluding the long reproducibility case, `npx vitest run tests/benchmark --exclude tests/benchmark/reproducibility.test.ts --reporter=dot`: 8 files and 42 tests passed.
- `npx vitest run tests/benchmark/reproducibility.test.ts --reporter=dot` was attempted with a 180-second command window and terminated with exit code 124 before producing test output; this case is not claimed passing.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed (`vite build`, 1,586 modules).
- `git diff --check`: passed.

## Formal baseline status / blocker

The requested three 1–200 matchup reruns (4,800 games, `--replay all`) were not run to completion in this bounded task turn. Existing baseline artifacts were not rewritten or force-added; no formal counts are fabricated. The parent agent should run the formal matrix with an appropriate timeout, then regenerate and force-add only the compact baseline JSON/Markdown/manifest. This report therefore does not claim the formal artifacts are complete.
