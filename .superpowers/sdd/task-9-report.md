# Task 9 — Formal baseline batches and final verification

## Smoke runs

The three 20-seed paired smoke runs completed with the viable `120000ms` per-task timeout, replay mode `failures`, and worker concurrency `2`:

| Matchup | Games | Paired units | Seeds | Failed/errors |
| --- | ---: | ---: | ---: | ---: |
| unified-current vs legal-random | 160 | 80 | 20 | 0 / 0 |
| unified-current vs legal-greedy | 160 | 80 | 20 | 0 / 0 |
| unified-current vs legacy-reference | 160 | 80 | 20 | 0 / 0 |

## Formal batches

Each matchup was run for `1-50`, `51-100`, `101-150`, and `151-200` with paired default explicitly enabled, `--replay all`, `--concurrency 2`, `--resume --skip-existing`, and a `120000ms` timeout. Legacy batches that encountered timeouts were rerun at `300000ms`; legacy seed 13 was rerun as an eight-game paired block at `300000ms` and the three timed-out records were replaced only after the retry completed cleanly. No failed records were silently reused.

All 12 final manifests validate through `mergeBatches` (same-config four-batch merge), with these per-batch invariants:

- 400 raw games, 200 paired rotation units, 50 complete base-seed blocks/seeds per batch;
- 1,600 raw games, 800 paired units, 200 blocks per matchup;
- zero failed games, zero safety/error counters, unique expected match IDs, and verified public/final hashes.

Combined baseline totals are 4,800 raw games, 2,400 paired units, and 600 base-seed blocks. Config hashes are `24bce58a48d88c5f59f30af60a0c3a5d70ad0d9738d52e532785b77084d8ec1e` (random), `8108ad7199f6ae1092f69767608e63e6397a4e8875e6bb2f6bb54eff61793d9f` (greedy), and `f41864564a0dab5bb455dd19b83e42a009eb695b471d9b8d998841c08e678395` (legacy).

## Approved artifacts

- `artifacts/ai-benchmark-baseline.json` — normalized dictionaries plus `gameRowSchema`/`gameRows` retaining all required compact per-game fields (4,800 rows; 7,868,001 bytes).
- `artifacts/ai-benchmark-baseline.md` — human summary.
- `artifacts/ai-benchmark-manifest.json` — per-matchup expected IDs and public/final hash maps, with combined counts.

The baseline contains no public event traces or hidden hands. Replay files, debug data, and batch manifests remain ignored.

## Verification gate

- `npm test`: passed (42 test files, 384 tests, plus 4 performance tests).
- `npx tsc --noEmit`: passed.
- `npm run build`: passed (`vite build`, 1,586 modules).
- `git diff --check`: passed.
- `npx vitest run tests/benchmark/cli.test.ts tests/benchmark/reproducibility.test.ts tests/benchmark/reporting.test.ts tests/benchmark/contracts.test.ts --reporter=dot`: passed (4 files, 24 tests), including replay/hash/privacy and import-boundary checks.

No source or strategy files were modified.
