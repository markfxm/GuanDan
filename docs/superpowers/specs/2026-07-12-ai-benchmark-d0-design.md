# D0 AI Benchmark Design

## Goal

Build a reproducible, paired, and quantitative AI evaluation system without changing production AI policy, planning budgets, game rules, or the production room API. The system establishes baseline comparisons for `unified-current`, `legacy-reference`, `deterministic-random`, and `simple-greedy`, and produces artifacts suitable for future AI version comparisons.

## Scope and boundaries

- Benchmark implementation is limited to `tests/benchmark/` and `scripts/`.
- Production `src/` must not import benchmark code, legacy code, benchmark strategies, or feature switches.
- The simulator uses the real `createRoom`, `playCards`, and `passTurn` functions. It never reimplements game legality, turn progression, settlement, or scoring rules.
- Every strategy receives only its own hand, public game information, and its own runtime state. It must never receive `partnerHand`, `opponentsHands`, all room hands, undealt cards, or deck order.
- Classifications are derived after a game from reproducible initial state and are never passed to a strategy.
- Complete public action traces are stored outside the main report. Full hidden state is opt-in debug output only and is ignored by Git.

## Directory structure

```text
tests/benchmark/
  contracts.ts           # observation, strategy, game result, replay, report types
  strategies.ts          # unified, legacy reference, deterministic random, simple greedy
  simulator.ts           # mixed-seat game driver over createRoom/playCards/passTurn
  rotations.ts           # paired A/B swaps and base-seat rotations
  classification.ts      # post-game reproducible deal and game classifications
  metrics.ts             # team score, finish, efficiency, decision-quality metrics
  statistics.ts          # paired aggregates, bootstrap CI, long-term rating input
  reporting.ts           # JSON/Markdown/replay serialization and trace hash
  benchmark.test.ts      # interface, isolation, replay, deterministic behavior
  rotations.test.ts      # paired and base-seat rotation coverage
  statistics.test.ts     # label swap, CI, merge and batch equivalence
  reproducibility.test.ts# diagnostics and concurrency invariants
scripts/
  runAiBenchmark.ts      # benchmark:ai CLI entry point
  replayAiBenchmark.ts   # single replay verification entry point
artifacts/
  ai-benchmark-baseline.json
  ai-benchmark-baseline.md
  ai-benchmark-replays/<matchup>/<match-id>.json
  ai-benchmark-debug/    # opt-in full-state files, Git ignored
```

## Data flow

```text
CLI config + fixed seed list
  -> paired rotations
  -> createRoom({ rank, seed })
  -> per-turn public observation + own hand + seat-local runtime
  -> selected AiStrategy.decide(...)
  -> playCards(...) or passTurn(...)
  -> per-game public trace and result summary
  -> match-unit pairing, classification, metrics and statistics
  -> baseline JSON/Markdown + selected replay files
```

Each game is assigned a stable `matchId` derived from matchup IDs, base seed, base-seat rotation, and A/B placement. Results are sorted by this identifier before reporting. A match unit consists of the two A/B team assignments for the same seed and base-seat rotation. Base-seat rotations additionally move the underlying deal through all four seat offsets, so comparisons do not rely on a fixed opening or seat position.

## Strategy isolation and execution boundary

`AiStrategy` is test-only and has the shape:

```ts
type AiStrategy = {
  id: string;
  version: string;
  decide(observation: AiObservation, runtime?: AiRuntimeState): AiDecision;
};
```

`AiObservation` contains only a copied own hand and public information: rank, active seat, own/other hand counts, public plays, current trick, finish order, partner-passed status, and public opening-tribute events. The simulator constructs it from the room but does not expose references to room internals. Runtime is one independent instance per seat and game.

Strategies are implemented as follows:

- `unified-current`: adapts production `decideAiAction` with the public observation and seat runtime.
- `legacy-reference`: imports `tests/helpers/legacyAiReference.ts` only from benchmark/test code and receives the same restricted observation.
- `deterministic-random`: enumerates legal candidates from its own hand and public trick, then selects with a seed derived from game seed, seat, and action index.
- `simple-greedy`: enumerates the same legal candidates and deterministically selects the largest card-count reduction, with stable low-power tie breaking.

The simulator validates only by invoking `playCards` or `passTurn`. A thrown action error fails that game and records its seed, seat, strategy, and error category. It never substitutes a pass or falls back to another strategy.

## Fair pairing and metrics

For every base seed, benchmark runs both A/B team assignments and all four base-seat rotations. The report distinguishes raw game count from paired match-unit count and records which strategy was on the opening team. The primary comparison is the paired match-unit outcome, not a fixed-seat raw-game win rate.

Per game records include team winner, complete finish order, project settlement-derived team placement score, a documented single-round advancement proxy when no multi-round level simulation exists, individual finish diagnostics, total actions, play/pass ratio, bomb use, plan continuation signals, final-ten-card actions, duration, and all safety counters.

Unified decisions additionally record available existing diagnostics without altering choice: selected action rank among scored candidates, active-plan membership, power-group split, bomb context, remaining plan groups, plan-quality change, replan path, own hand count, partner-pass state, lead/follow state, and endgame state.

## Classification

After games finish, deterministic initial-deal analysis tags high/low bomb density, straight/consecutive-pair potential, hand dispersion, joker concentration, wild-card impact, initial plan-quality gap, partner strength imbalance, and observed long/short game length. These tags are report-only and are computed separately from strategy observation construction.

## Replay format

The main report stores only summary fields, the replay relative path, and a SHA-256 `publicTraceHash`. A replay file is created according to `--replay none|failures|all` (default `failures`), at:

```text
artifacts/ai-benchmark-replays/<matchup>/<match-id>.json
```

Every replay contains:

```ts
{
  replayVersion: "d0-v1",
  engineVersion: "<package version + git commit>",
  matchId, seed, rank, rotation, strategiesBySeat,
  deterministicRandom: { baseSeed, derivedSeeds },
  publicEvents: [
    // actions, hand-count deltas, public trick state, opening tribute/return events
  ],
  finishOrder, winnerTeam, teamScore, actionCount,
  publicTraceHash
}
```

No replay contains full opponent hands by default. `--debug-full-state` is disabled by default, writes only to `artifacts/ai-benchmark-debug/`, never appears in the main report, and must be listed in `.gitignore`. Replaying the same configuration must recreate the final result and public hash.

## Statistics and long-term rating

The report provides A/B raw wins, paired wins, draws/unresolved games, raw and paired win rates, average and median score difference, mean finish-position difference, p95 game duration, error rate, and per-classification metrics.

Uncertainty is a paired bootstrap 95% confidence interval over match-unit score difference and paired win rate. The report marks a result statistically significant only when the relevant paired interval excludes zero (or the neutral win-rate equivalent); a 51/49 split alone is not a strength claim. It explicitly names sample count, effect size, seat/deal bias controls, and residual limitations.

Each report also writes an `elo`-compatible rating snapshot: a fixed baseline rating (1500), observed matchup score, and rating delta using a documented fixed K-factor. It is descriptive within one report; future v1/v2/v3 reports can be merged into a persistent rating ledger without changing historical game results.

## Commands

```bash
npm run benchmark:ai -- \
  --strategy-a unified-current \
  --strategy-b legacy-reference \
  --seeds 1-200 \
  --paired \
  --output artifacts/ai-benchmark-baseline.json \
  --replay all \
  --concurrency 1 \
  --timeout-ms 30000 \
  --diagnostics

npm run benchmark:ai -- --replay-match <match-id>
```

The command accepts strategy IDs, inclusive seed ranges or explicit seed lists, paired rotation, output path, replay mode, optional full-state debug output, concurrency, timeout, and diagnostics. Each task derives all randomness from its own seed; its runtime and diagnostics are not shared. Reporting remains stable regardless of scheduling and is verified for concurrency `1` and `N`.

## Test matrix

| Area | Required assertion |
| --- | --- |
| Strategy interface | Four strategies return only legal play/pass outcomes through the same simulator boundary. |
| Observation isolation | No strategy observation contains partner, opponent, all-hand, or deck information. |
| Mixed room | Four seats can use different strategies; action execution uses only `playCards` / `passTurn`. |
| Rotations | Both A/B swaps and all base-seat rotations are present for every seed. |
| Metrics | Team winner, full order, settlement score, efficiency, and zero-error counters aggregate correctly. |
| Statistics | A/B label swap reverses results; paired bootstrap is deterministic; batches merge to one-shot output. |
| Reproducibility | Same config gives identical summary and trace hashes; replay reproduces final public result. |
| Isolation under options | Diagnostics and concurrency do not change actions; runs have no shared runtime/cache state. |
| Artifact privacy | Main report and ordinary replay omit hidden hands; full-state output is opt-in and ignored. |
| Build boundary | Benchmark code stays outside `src/`; production build contains no legacy/benchmark import. |
| Regression | Existing AI decision, room, shadow, 20-game simulation, TypeScript, build, and diff checks remain green. |

## Execution sequence

1. Implement contract and simulator tests first, then the smallest test-only driver that passes them.
2. Add rotations, metrics, classifications, paired statistics, reporting, and CLI with focused tests.
3. Run three 20-seed smoke matchups: unified vs random, greedy, and legacy.
4. Run all three 200-seed paired baselines with replay mode `all`; merge no selectively chosen subsets.
5. Produce the main JSON/Markdown reports and complete the specified regression suite.

## Non-goals

This phase does not change AI scoring, beam/planning budgets, public-information inference, partner coordination, endgame search, game rules, or production architecture. Benchmark results inform later work but do not trigger policy changes during D0.
