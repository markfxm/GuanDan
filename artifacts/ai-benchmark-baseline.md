# D0 AI benchmark baseline

Migrated from the validated 0fd45df formal artifacts after 5788e24. Gameplay/public hashes and measured durations are preserved; only canonical identity, provenance, replay aliases, and paths changed.

## unified-current vs legal-random


## Purpose

Measure seeded, paired AI strategy outcomes in the real Guandan room while preserving public-only hashes and auditable provenance.

## Strategy descriptors and policies

- **unified-current** — implementation production-ai-v1; policy production-policy; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legacy-reference** — implementation legacy-reference-v1; policy production-policy; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legal-random** — implementation legal-random-v1; policy legal-only; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legal-greedy** — implementation legal-greedy-v1; policy legal-only; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- Engine: 0.1.0@5788e24e87b5224979d175999c98faef3363a1d3
- Room rules fingerprint: 1dd758f6dedf71de3a4244a84d4b838b7f54ba2fb38a95e3417f8acb2ef3b8b8

## Sample and fairness

- Raw games: 1600; base seeds: 200; paired rotation units: 800.
- Each base seed uses four seat rotations and both AB/BA allocations; seeded deals and seat rotation are controlled by the harness.

## Wins, rates, scores, confidence intervals, significance, and Elo

- Wins A/B/unresolved: 1418/182/0; rates: 0.886/0.114.
- Scores A/B/difference: 1418/182/0.772.
- Score CI: [0.250, 1.000]; win-rate CI: [0.625, 1.000]; statistically significant: true.
- Elo: initial 1500, K 32, delta 12.360 (d0-elo-v1).

## Exploratory classifications

- Classifications are post-game exploratory tags only: {"bomb-density":0,"straight-potential":0,"consecutive-pair-potential":0,"dispersion":0,"joker-concentration":0,"wild-card-impact":0,"plan-quality-gap":0,"partner-imbalance":2437,"long-game":0,"short-game":0}.

## Performance

- Duration mean/median/p95 (ms): 12959.305/11398.308/24334.844; error rate: 0.000.

## Anomalies

- Failed or safety-error games: 0.

## Conclusions and limitations

Results describe this seeded single-round proxy and are not a causal claim about general play strength. Confidence intervals and exploratory classifications should be read with the paired design and seat/deal limitations in mind.

## unified-current vs legal-greedy


## Purpose

Measure seeded, paired AI strategy outcomes in the real Guandan room while preserving public-only hashes and auditable provenance.

## Strategy descriptors and policies

- **unified-current** — implementation production-ai-v1; policy production-policy; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legacy-reference** — implementation legacy-reference-v1; policy production-policy; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legal-random** — implementation legal-random-v1; policy legal-only; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legal-greedy** — implementation legal-greedy-v1; policy legal-only; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- Engine: 0.1.0@5788e24e87b5224979d175999c98faef3363a1d3
- Room rules fingerprint: 1dd758f6dedf71de3a4244a84d4b838b7f54ba2fb38a95e3417f8acb2ef3b8b8

## Sample and fairness

- Raw games: 1600; base seeds: 200; paired rotation units: 800.
- Each base seed uses four seat rotations and both AB/BA allocations; seeded deals and seat rotation are controlled by the harness.

## Wins, rates, scores, confidence intervals, significance, and Elo

- Wins A/B/unresolved: 752/848/0; rates: 0.470/0.530.
- Scores A/B/difference: 752/848/-0.060.
- Score CI: [-1.000, 1.000]; win-rate CI: [0.000, 1.000]; statistically significant: false.
- Elo: initial 1500, K 32, delta -0.960 (d0-elo-v1).

## Exploratory classifications

- Classifications are post-game exploratory tags only: {"bomb-density":0,"straight-potential":0,"consecutive-pair-potential":0,"dispersion":0,"joker-concentration":0,"wild-card-impact":0,"plan-quality-gap":0,"partner-imbalance":1708,"long-game":0,"short-game":0}.

## Performance

- Duration mean/median/p95 (ms): 15811.845/12315.618/36092.641; error rate: 0.000.

## Anomalies

- Failed or safety-error games: 0.

## Conclusions and limitations

Results describe this seeded single-round proxy and are not a causal claim about general play strength. Confidence intervals and exploratory classifications should be read with the paired design and seat/deal limitations in mind.

## unified-current vs legacy-reference


## Purpose

Measure seeded, paired AI strategy outcomes in the real Guandan room while preserving public-only hashes and auditable provenance.

## Strategy descriptors and policies

- **unified-current** — implementation production-ai-v1; policy production-policy; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legacy-reference** — implementation legacy-reference-v1; policy production-policy; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legal-random** — implementation legal-random-v1; policy legal-only; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- **legal-greedy** — implementation legal-greedy-v1; policy legal-only; config d0-v1; source 5788e24e87b5224979d175999c98faef3363a1d3
- Engine: 0.1.0@5788e24e87b5224979d175999c98faef3363a1d3
- Room rules fingerprint: 1dd758f6dedf71de3a4244a84d4b838b7f54ba2fb38a95e3417f8acb2ef3b8b8

## Sample and fairness

- Raw games: 1600; base seeds: 200; paired rotation units: 800.
- Each base seed uses four seat rotations and both AB/BA allocations; seeded deals and seat rotation are controlled by the harness.

## Wins, rates, scores, confidence intervals, significance, and Elo

- Wins A/B/unresolved: 1552/48/0; rates: 0.970/0.030.
- Scores A/B/difference: 1552/48/0.940.
- Score CI: [0.000, 1.000]; win-rate CI: [0.500, 1.000]; statistically significant: false.
- Elo: initial 1500, K 32, delta 15.040 (d0-elo-v1).

## Exploratory classifications

- Classifications are post-game exploratory tags only: {"bomb-density":0,"straight-potential":0,"consecutive-pair-potential":0,"dispersion":0,"joker-concentration":0,"wild-card-impact":0,"plan-quality-gap":0,"partner-imbalance":2984,"long-game":0,"short-game":0}.

## Performance

- Duration mean/median/p95 (ms): 10906.724/9562.552/20285.873; error rate: 0.000.

## Anomalies

- Failed or safety-error games: 0.

## Conclusions and limitations

Results describe this seeded single-round proxy and are not a causal claim about general play strength. Confidence intervals and exploratory classifications should be read with the paired design and seat/deal limitations in mind.
