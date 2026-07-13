# Task 10 formal baseline rerun report

## Scope and provenance

The D0 formal matrix was rerun from scratch on HEAD `87fffb3`. No prior batch, baseline, replay, or manifest was reused. Each of the three matchups used four fresh 50-seed batches, paired rotations (default), `--replay all`, worker concurrency 2, and a 300000 ms timeout. Six initially over-parallelized processes were terminated before producing output; those incomplete runs were excluded.

Provenance in every fresh artifact:

- engine: `0.1.0@87fffb3f330069d9534aa29503120e2a7c9abfcf`
- room rules: `1dd758f6dedf71de3a4244a84d4b838b7f54ba2fb38a95e3417f8acb2ef3b8b8`
- strategy descriptors: unified-current, legacy-reference, legal-random, legal-greedy (all source commit `87fffb3f330069d9534aa29503120e2a7c9abfcf`)

## Fresh batch counts

| Matchup | Fresh batches | Raw games | Paired units | Seeds | Failures/timeouts/illegal | Hash/duration/provenance |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| unified-current vs legal-random | 4 | 1,600 | 800 | 200 | 0 / 0 / 0 | all rows valid |
| unified-current vs legal-greedy | 4 | 1,600 | 800 | 200 | 0 / 0 / 0 | all rows valid |
| unified-current vs legacy-reference | 4 | 1,600 | 800 | 200 | 0 / 0 / 0 | all rows valid |
| **Combined** | **12** | **4,800** | **2,400** | **600** | **0 / 0 / 0** | **all rows valid** |

Every batch had exactly 400 games, 50 seeds, 400 expected/completed match IDs, and 50 complete eight-row seed blocks. `mergeBatches` accepted all three four-batch merges. Every compact row has a positive duration, public trace hash, final public state hash, and complete provenance; no private keys or public event traces are embedded.

## Temporary matchup aggregates

| Matchup | A wins | B wins | A win rate | Score difference | Paired score 95% CI | Paired win-rate 95% CI | Elo delta | Significance |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
| unified-current vs legal-random | 1,418 | 182 | 0.88625 | 0.7725 | [0.25, 1] | [0.625, 1] | +12.36 | score/win-rate CI excludes neutral |
| unified-current vs legal-greedy | 752 | 848 | 0.47000 | -0.0600 | [-1, 1] | [0, 1] | -0.96 | neither CI excludes neutral |
| unified-current vs legacy-reference | 1,552 | 48 | 0.97000 | 0.9400 | [0, 1] | [0.5, 1] | +15.04 | score CI includes neutral; win-rate CI excludes neutral |

All three aggregates report zero error rate. Replay files were written for every fresh row; replay verification uses matching public and final hashes.

## Regenerated artifacts

- `artifacts/ai-benchmark-baseline.json`: 4,800 normalized game rows with required duration, hash, provenance, error, classification, and replay fields.
- `artifacts/ai-benchmark-baseline.md`: purpose/policy, sample/fairness, outcomes/CIs/significance/Elo, classifications, performance, anomalies/integrity, and limitations sections.
- `artifacts/ai-benchmark-manifest.json`: three complete matchup manifests with expected IDs and public/final hash maps.

## Verification

- `npx vitest run tests/benchmark --reporter=dot`: 9 files, 48 tests passed.
- `npm test`: 42 files, 386 tests passed, including 4 performance tests. An earlier run had one transient UI timing failure; the immediate targeted test and full rerun passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; Vite transformed 1,586 modules.
- `git diff --check`: passed.
- Baseline privacy/shape check: 4,800 rows, 0 wrong-width rows, 0 bad rows, all required Markdown sections present, no private keys embedded.

