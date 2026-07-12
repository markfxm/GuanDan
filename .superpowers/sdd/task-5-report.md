# Task 5 report: metrics, classifications, and seed-block statistics

## Scope

Implemented the benchmark-only Task 5 modules:

- `tests/benchmark/metrics.ts`: settlement-derived winner/placement and single-round advancement proxy, diagnostic/efficiency counters, action/bomb/continuation/final-ten metrics, duration and safety-counter normalization, and seat/deal limitation metadata.
- `tests/benchmark/classification.ts`: deterministic post-game exploratory tags (bomb density, sequence/consecutive-pair activity, dispersion, joker/wild-card impact, partner imbalance, and game length).
- `tests/benchmark/statistics.ts`: A/B aggregate statistics, paired score/finish differences, deterministic bootstrap over complete seed blocks, confidence intervals, significance flag, effect size, duration summaries, and versioned Elo-compatible snapshot.
- `tests/benchmark/statistics.test.ts`: focused settlement/efficiency, exploratory-label, A/B label-swap, and eight-game bootstrap tests.

No production `src/` files were changed.

## TDD evidence

RED was observed before implementation:

```text
npx vitest run tests/benchmark/statistics.test.ts
Error: Failed to resolve import "./metrics" ...
```

After implementation, the focused suite was green:

```text
npx vitest run tests/benchmark/statistics.test.ts
Test Files  1 passed
Tests       8 passed
```

## Verification

The complete benchmark suite passed:

```text
npx vitest run tests/benchmark
Test Files  6 passed
Tests       25 passed
```

TypeScript verification passed:

```text
npx tsc --noEmit
exit code 0
```

## Self-review and limitations

- Metrics are intentionally post-game only; classifications are marked `exploratory: true` and are not available in `BenchmarkObservation`.
- The simulator currently does not emit decision timing or plan diagnostics, so duration defaults to zero and plan continuation is derived from public action continuity. A supplied `durationMs` is preserved when present.
- The advancement metric is the documented single-round settlement level-step proxy when a full level simulation is unavailable.
- Bootstrap sampling uses one complete base-seed block (all games supplied for that seed, normally four rotations × AB/BA) as its replacement unit and uses a deterministic xorshift PRNG.
- Seed blocks are rejected unless they contain exactly eight games, matching seed values, all four rotations, and explicit `AB`/`BA` allocation for every rotation. Aggregate descriptions remain available for arbitrary incomplete summaries, while bootstrap confidence intervals require validated blocks.
- Every summary exposes the complete exploratory tag vocabulary plus availability/proxy metadata; wildcard impact uses the card rank/suit wild-card rule, and dispersion uses hand-count trajectory variance rather than seat IDs.
- Bootstrap results use a plain `{ samples, iterations, seed }` object (no circular self-reference), and win-rate significance compares its CI with the neutral 0.5 baseline.
- Availability metadata distinguishes unavailable plan-quality diagnostics (`available: false`, `proxy: false`) from public-event exploratory proxies.
