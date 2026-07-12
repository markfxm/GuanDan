# D0 AI benchmark baseline

All formal runs use paired rotations, replay mode `all`, worker concurrency 2, and 200 base seeds per matchup.

| Matchup | Raw games | Paired units | Blocks | Error rate |
| --- | ---: | ---: | ---: | ---: |
| unified-current vs legal-random | 1600 | 800 | 200 | 0 |
| unified-current vs legal-greedy | 1600 | 800 | 200 | 0 |
| unified-current vs legacy-reference | 1600 | 800 | 200 | 0 |

Combined: **4,800 raw games**, **2,400 paired rotation units**, **600 base-seed blocks**.

The JSON uses field dictionaries plus `gameRowSchema`/`gameRows` to stay compact while retaining all required per-game summary fields. Replay paths and public/final hashes are in the compact rows and manifest; hidden hands and public event traces are excluded.
