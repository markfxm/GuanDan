# D0 AI benchmark baseline

## Configuration

- Schema/report: 2/d0-r2; benchmark: d0-r2.
- Seeds: 1–200 (200); raw games: 4800; paired units: 2400; base seeds: 600.
- Rotations/placements/games per seed per matchup: 4/2/8; matchups: 3; replay mode: failures.
- Config hash: 8f2bd2e3445f54d03500dae5a8e11c563c59251e4e16c0bd8dd7a943c7cb65f6; source commit: 6aad8b32d96f996944a91f8ada5cb646530548b6; room rules: 1dd758f6dedf71de3a4244a84d4b838b7f54ba2fb38a95e3417f8acb2ef3b8b8; generatedAt: 2026-07-14T00:00:00.000Z.

## Matchup results

### unified-current vs legal-greedy

- Base seeds/raw games/paired units: 200/1600/800.
- Raw win rate A/B/draw: 0.470/0.530/0.000; wins: 752/848/0.
- Paired win rate A/B/draw: 0.432/0.568/0.560; wins: 152/200/448.
- Mean/median paired score difference: -0.060/0.000; 95% CI: [-0.129, 0.009].
- Paired win-rate 95% CI: [0.357, 0.510]; bootstrap: base-seed, 200 iterations, seed 1.
- Significance: score CI includes neutral; win rate CI includes neutral; 未观察到显著差异.
- Elo (secondary descriptive): delta -0.960 (d0-elo-v1).
- Duration mean/median/p95 (ms): 15811.845/12315.618/36092.641; errors total/failed/timeouts/illegal: 0/0/0/0.
- Replay/hash validation: 800/800 verified; hidden-state leaks 0.

### unified-current vs legacy-reference

- Base seeds/raw games/paired units: 200/1600/800.
- Raw win rate A/B/draw: 0.970/0.030/0.000; wins: 1552/48/0.
- Paired win rate A/B/draw: 1.000/0.000/0.060; wins: 752/0/48.
- Mean/median paired score difference: 0.940/1.000; 95% CI: [0.914, 0.967].
- Paired win-rate 95% CI: [1.000, 1.000]; bootstrap: base-seed, 200 iterations, seed 1.
- Significance: score CI excludes neutral; win rate CI excludes neutral; paired CI excludes neutral.
- Elo (secondary descriptive): delta 15.040 (d0-elo-v1).
- Duration mean/median/p95 (ms): 10906.724/9562.552/20285.873; errors total/failed/timeouts/illegal: 0/0/0/0.
- Replay/hash validation: 800/800 verified; hidden-state leaks 0.

### unified-current vs legal-random

- Base seeds/raw games/paired units: 200/1600/800.
- Raw win rate A/B/draw: 0.903/0.097/0.000; wins: 1445/155/0.
- Paired win rate A/B/draw: 0.997/0.003/0.189; wins: 647/2/151.
- Mean/median paired score difference: 0.806/1.000; 95% CI: [0.781, 0.827].
- Paired win-rate 95% CI: [0.995, 1.000]; bootstrap: base-seed, 200 iterations, seed 1.
- Significance: score CI excludes neutral; win rate CI excludes neutral; paired CI excludes neutral.
- Elo (secondary descriptive): delta 12.900 (d0-elo-v1).
- Duration mean/median/p95 (ms): 14575.988/12541.834/27082.070; errors total/failed/timeouts/illegal: 0/0/0/0.
- Replay/hash validation: 800/800 verified; hidden-state leaks 0.

## Validation

- Manifest expected/completed/duplicate/missing/unknown: 4800/4800/0/0/0.
- Manifest configHash consistent: true; provenance missing: 0; non-positive duration: 0.
- Replay files expected/found/verified: 2400/2400/2400; hash/version verified: 2400/2400.
- Random/greedy/legacy replay samples verified: 12/4/4.

Classification is exploratory only. Elo is a secondary descriptive metric. Score neutrality is 0 and win-rate neutrality is 0.5; confidence intervals containing the neutral value are not reported as statistically significant.
