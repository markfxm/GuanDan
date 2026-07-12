# Task 10 report: baseline provenance and performance instrumentation

## Scope

Implemented Task 10 without modifying `src/`. Benchmark summaries now carry a measured wall-clock `durationMs`; reports, manifests, and replays carry non-unknown provenance; CLI runs emit a Markdown companion report with the required audit sections.

## TDD evidence

- RED: newly added simulator assertions failed because `durationMs` was absent; the reporting assertion failed because zero-duration rows were accepted.
- GREEN: implemented timing, validation, provenance normalization, replay validation, Markdown rendering, and CLI wiring.

## Changes

- `tests/benchmark/simulator.ts`: wraps complete simulation in `performance.now()` and clamps only sub-millisecond measurements to `0.001` ms; timeout summaries also carry positive durations.
- `tests/benchmark/contracts.ts`: adds required `GameSummary.durationMs` and `BenchmarkProvenance`.
- `tests/benchmark/reporting.ts`: derives `ENGINE_VERSION` from package version plus source commit, derives deterministic SHA-256 `ROOM_RULES_VERSION`, normalizes descriptors so no field is `unknown`, validates positive durations, emits provenance in reports/manifests/replays, and adds `buildMarkdownReport`/`writeMarkdownReport` with purpose, policy, sample/fairness, outcomes/CIs/significance/Elo, classifications, performance, anomalies, and limitations sections.
- `scripts/runAiBenchmark.ts`: passes provenance through all artifacts and writes a sibling Markdown report when `--output` is used.
- `scripts/replayAiBenchmark.ts`: rejects incomplete/unknown replay provenance before verification.
- `tests/benchmark/statistics.ts`: rejects zero/missing duration rows before aggregate performance statistics.
- Benchmark tests cover the new behavior and update deterministic assertions to ignore intentionally variable duration.

## Verification

- `npx vitest run tests/benchmark/reporting.test.ts tests/benchmark/contracts.test.ts --reporter=dot`: 11 tests passed (including non-unknown default replay provenance).
- `npx vitest run tests/benchmark/simulator.test.ts --reporter=dot`: 3 tests passed.
- `npx vitest run tests/benchmark/cli.test.ts --reporter=dot`: 9 tests passed.
- `npx vitest run tests/benchmark/statistics.test.ts tests/benchmark/reporting.test.ts --reporter=dot`: 15 tests passed.
- `npx vitest run` for the entire benchmark directory was attempted but exceeded the 120-second command window while running the long reproducibility suite; no failure output was produced.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed (`vite build`, 1,586 modules).
- `git diff --check`: passed.
- CLI smoke with two unknown strategies, one paired seed, and JSON output completed 8 games and produced a Markdown report with all required headings; provenance was `0.1.0@d819c1171c89689de0c5d55ff10f4bddd876e16b` plus a 64-hex room-rules fingerprint.

## Formal baseline status / blocker

The requested three 1–200 matchup reruns (4,800 games, `--replay all`) were not started to completion in this bounded task turn. A one-seed legal-greedy/legal-random CLI attempt exceeded 120 seconds, while the unknown-strategy smoke completed. Existing baseline artifacts were not rewritten or force-added; no counts are fabricated. The parent agent should run the formal matrix with an appropriate timeout, then regenerate and force-add only the compact baseline JSON/Markdown/manifest.
