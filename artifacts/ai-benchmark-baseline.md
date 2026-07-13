# D0 AI benchmark baseline

Generated from 12 fresh four-batch runs; paired rotations, replay mode `all`, worker concurrency 2, timeout 300000 ms.

## Purpose and policy

Measure seeded public-information single-round outcomes for the unified AI against legal-random, legal-greedy, and legacy-reference. This is a benchmark proxy, not a causal claim about general play strength.

## Sample and fairness

- Each matchup: 200 base seeds × 4 rotations × 2 allocations = 1,600 games / 800 paired units.
- Every row carries engine/rules fingerprints, strategy descriptors, positive wall-clock duration, and public/final hashes.
- Hidden hands, private room state, and public event traces are excluded from compact baseline JSON.

## Outcomes, confidence intervals, significance, Elo

| Matchup | Raw games | Paired units | A wins | B wins | A win rate | Score diff | Paired score CI | Paired win-rate CI | Error rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| unified-current vs legal-random | 1600 | 800 | 1418 | 182 | 88.63% | 0.7725 | [0.25, 1] | [0.625, 1] | 0 |
| unified-current vs legal-greedy | 1600 | 800 | 752 | 848 | 47.00% | -0.0600 | [-1, 1] | [0, 1] | 0 |
| unified-current vs legacy-reference | 1600 | 800 | 1552 | 48 | 97.00% | 0.9400 | [0, 1] | [0.5, 1] | 0 |

## Classifications

Classifications are exploratory, derived from public post-game observations; they are not strategy observations.
- unified-current vs legal-random: {"bomb-density":0,"straight-potential":0,"consecutive-pair-potential":0,"dispersion":0,"joker-concentration":0,"wild-card-impact":0,"plan-quality-gap":0,"partner-imbalance":2437,"long-game":0,"short-game":0}
- unified-current vs legal-greedy: {"bomb-density":0,"straight-potential":0,"consecutive-pair-potential":0,"dispersion":0,"joker-concentration":0,"wild-card-impact":0,"plan-quality-gap":0,"partner-imbalance":1708,"long-game":0,"short-game":0}
- unified-current vs legacy-reference: {"bomb-density":0,"straight-potential":0,"consecutive-pair-potential":0,"dispersion":0,"joker-concentration":0,"wild-card-impact":0,"plan-quality-gap":0,"partner-imbalance":2984,"long-game":0,"short-game":0}

## Performance

Durations are measured wall-clock milliseconds per completed row.
- unified-current vs legal-random: mean 12959.305 ms; median 11401.182 ms; p95 24381.012 ms; max 94282.382 ms.
- unified-current vs legal-greedy: mean 15811.845 ms; median 12317.638 ms; p95 36111.673 ms; max 67437.917 ms.
- unified-current vs legacy-reference: mean 10906.724 ms; median 9570.499 ms; p95 20373.006 ms; max 115669.759 ms.

## Anomalies and integrity

- Fresh batch validation found zero failed rows, timeout rows, illegal actions, duplicate/missing IDs, missing hashes, missing provenance, or non-positive durations.
- Every batch manifest has 400 games and 400 expected/completed match IDs; every seed block has eight rotation/allocation rows.

## Limitations

This is a seeded single-round proxy with controlled deal/seat rotations. Results should be interpreted with paired design, confidence intervals, and public-observation limitations in mind.
