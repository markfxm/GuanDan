# D0 AI Benchmark Design

## Goal and non-goals

D0 establishes a reproducible, paired, quantitative evaluation system for future AI comparisons. It compares the current unified AI, a restricted legacy reference, and two deliberately weak legal-only baselines. It does not change production scoring, planning budgets, rules, public-information inference, partner coordination, endgame search, or the production architecture.

## Scope and directory boundary

- All benchmark implementation lives only in `tests/benchmark/` and `scripts/`.
- Production `src/` adds no benchmark interface, strategy injection, test switch, legacy import, or benchmark import.
- The simulator calls the real `createRoom`, `playCards`, and `passTurn`; it does not copy legality, turn, settlement, or scoring rules.
- The existing production `AiObservation` is not a benchmark contract.

```text
tests/benchmark/
  contracts.ts             # BenchmarkObservation, generic strategy and artifact types
  observation.ts           # public-field whitelist and production/legacy adapters
  strategies.ts            # unified, legacy, legal-random and legal-greedy
  simulator.ts             # mixed seats over createRoom/playCards/passTurn
  rotations.ts             # seat permutation and paired game matrix
  metrics.ts               # finish, settlement, efficiency and decision proxies
  classification.ts        # post-game, report-only classifications
  statistics.ts            # seed-block bootstrap, Elo-compatible snapshot
  reporting.ts             # canonical hashing, manifest and report serialization
  worker.ts                # worker_threads task entry point
  *.test.ts                # focused interface, rotation, stats and replay tests
scripts/
  runAiBenchmark.ts        # benchmark:ai command and batch/resume coordinator
  replayAiBenchmark.ts     # replay verifier
artifacts/
  ai-benchmark-baseline.json
  ai-benchmark-baseline.md
  ai-benchmark-manifest.json
  ai-benchmark-replays/<matchup>/<match-id>.json
  ai-benchmark-batches/<config-hash>/<batch-id>.json
  ai-benchmark-debug/<config-hash>/<match-id>.json
```

## Benchmark observation and generic runtime lifecycle

`BenchmarkObservation` is a test-only field whitelist. It contains copied `ownHand`, rank, own seat, current turn, leader seat, public hand counts, public trick/play history, finish order, partner-passed status, public tribute/return events, and stable public action index. It contains no seed, `partnerHand`, `opponentsHands`, all `hands`, initial hidden hands, or deck/remaining-deck state.

```ts
type AiStrategy<TRuntime> = {
  id: string;
  implementationVersion: string;
  configHash: string;
  sourceCommit: string;
  candidatePolicy: "legal-only" | "production-policy";
  createRuntime(context: StrategyRuntimeContext): TRuntime;
  decide(observation: BenchmarkObservation, runtime: TRuntime): StrategyDecision<TRuntime>;
};

type StrategyDecision<TRuntime> = {
  action: { type: "play"; cardIds: string[] } | { type: "pass" };
  runtime: TRuntime;
};
```

`StrategyRuntimeContext` has only seat-local identifiers and a domain-separated strategy random seed; it does not expose the base-deal seed. The simulator creates one runtime per `(game, seat)` using `createRuntime`, stores only that runtime for that seat, and replaces it only with `StrategyDecision.runtime`. No runtime, diagnostics object, PRNG state, or mutable cache is reused across seats or games.

`unified-current` adapts `BenchmarkObservation` to the production `AiObservation` at the test boundary, then uses `AiRuntimeState`. `legal-random` and `legal-greedy` use their own runtime types and are never forced to use `AiRuntimeState`.

`legacy-reference` receives a separately constructed restricted legacy input from the same whitelist. A preflight test asserts that the adapter passes no `partnerHand`, opponent hand, all-hands, or deck field and that changing hidden hands does not change the input. If the old helper cannot decide without one of those hidden fields, it fails closed as `LEGACY_REQUIRES_HIDDEN_INFORMATION`; it is not given a leaky compatibility adapter.

## Candidate-policy boundary

The two weak baselines use one shared `legal-only` candidate generator: classify groups from the acting hand, retain a legal lead or a legal response to the public last play, and include pass only when following. It performs no `PowerGroupPolicy`, protected-group, plan, or role filtering. `legal-random` selects from that set via its derived PRNG; `legal-greedy` picks maximum card reduction, then lowest play power, then a stable card-ID ordering.

The name `legal-*` makes this boundary explicit. The requested historical labels `deterministic-random` and `simple-greedy` are CLI compatibility aliases only and resolve to `legal-random` and `legal-greedy` in descriptors and reports. `unified-current` is explicitly labelled `production-policy`; its production candidate filtering is not represented as the same candidate universe. Reports always include each descriptor's `candidatePolicy`, preventing an undocumented coverage comparison.

## Game execution and exact seat rotations

For base rotation `r ∈ {0,1,2,3}`, define the seat permutation `σ_r(s) = (s + r) mod 4`. First create a base room with `createRoom({ rank, seed })`. The rotated room moves all seat-indexed state from base seat `s` to game seat `σ_r(s)`:

- `hands`, `initialHands`, `aiRuntime`, `aiPlans`, player seat and player name move by `σ_r`; player team is recomputed from the target game seat parity (`0/2` vs `1/3`).
- `currentTurn`, `leaderSeat`, trick lead/last/pass/play seats, public history seats, opening-tribute payer/receiver/active seats, and the opening leader move by `σ_r`.
- Any already-established `finishOrder` and settlement seat references would move by `σ_r`; baseline rotation happens before play, so these are initially empty.

The rotation test verifies a rotated room preserves all 108 cards once, each seat's intended base hand, team pairing, opening leader, public tribute references, and inverse rotation back to `r=0`. It also runs a completion test that maps final finish order and settlement back through `σ_r⁻¹`.

For every base seed, run two allocations at every rotation:

- allocation `AB`: A at seats `0/2`, B at seats `1/3`;
- allocation `BA`: B at seats `0/2`, A at seats `1/3`.

Therefore one base seed produces `2 × 4 = 8` raw games. One **paired rotation unit** is the AB/BA pair for one `(seed, r)` (four per base seed). One **base-seed block** contains all four paired rotation units (eight games) and is the bootstrap resampling unit. Reports always distinguish `baseSeeds`, `pairedRotationUnits`, and `rawGames`; the primary result aggregates paired units while uncertainty resamples base-seed blocks.

## Metrics and classifications

Each game stores winner team, complete finish order, project settlement-derived team placement score, documented single-round advancement proxy if needed, individual diagnostic score, total actions, play/pass ratio, bomb use, plan continuation, final-ten-card actions, duration, error counters, replay path, and public trace hash. Unified decisions record existing decision diagnostics only; no decision is altered.

Deterministic post-game analysis tags bomb density, straight/consecutive-pair potential, dispersion, joker concentration, wild-card impact, plan-quality gap, partner imbalance, and long/short game. These tags never enter a strategy observation. Classification tables are labelled **exploratory** and are never primary significance claims.

## Replay schema and deterministic public hash

The normal JSON report contains only game summaries, paired summaries, aggregate statistics, replay relative paths, and hashes. It never embeds action traces or hidden hands. Replay mode is `none`, `failures` (default), or `all`:

```ts
{
  schemaVersion: "1",
  replayVersion: "d0-v1",
  benchmarkVersion: "d0-v1",
  engineVersion: "<package-version>@<source-commit>",
  roomRulesVersion: "<rules fingerprint>",
  configHash, matchId, seed, rank, rotation, strategiesBySeat,
  strategyDescriptors: [{ id, implementationVersion, configHash, sourceCommit, candidatePolicy }],
  deterministicRandom: { strategySeedDerivationVersion: "1" },
  publicEvents: [],
  finishOrder, winnerTeam, teamScore, actionCount,
  publicTraceHash, finalPublicStateHash
}
```

`matchId` is the stable tuple `(matchup, configHash, seed, rotation, allocation)` rendered canonically; it never depends on batch, worker, duration, or output directory. Replays use `artifacts/ai-benchmark-replays/<matchup>/<match-id>.json`.

`publicTraceHash` is SHA-256 over canonical UTF-8 JSON for public events. Canonical JSON recursively sorts object keys; array order is event order except card IDs are sorted lexically and unordered seat/count maps are emitted in seat order `0,1,2,3`. The hash excludes duration, diagnostics timings, file paths, worker IDs, error stacks, and debug data. `finalPublicStateHash` uses the same canonicalization over final public state. Equal configuration and outcome must yield equal hashes.

`--debug-full-state` is off by default, writes only to `artifacts/ai-benchmark-debug/`, is absent from reports/replays, and is Git ignored.

## Statistics and Elo-compatible fields

The report gives raw and paired A/B wins, unresolved games, win rates, score/finish differences, p95 duration, error rate, and exploratory classifications. The primary paired bootstrap samples **base-seed blocks with replacement**; each draw includes that seed's four rotations and both allocations (all eight games), preserving pairing and deal/seat structure. It reports a deterministic 95% CI for paired win rate and score difference. A strength claim requires the relevant CI to exclude neutral; 51/49 alone is not significant.

The report also includes an Elo-compatible descriptive snapshot: fixed initial rating 1500, fixed documented K-factor, observed paired score, delta, and a versioned rating-ledger input. It does not retroactively change historical results.

## Batching, resume, and runtime estimate

Three 200-seed matchups require `3 × 200 × 8 = 4,800` raw games, `2,400` paired rotation units, and `600` base-seed blocks. Each 20-seed smoke matchup is 160 games; all three smoke runs total 480 games.

The existing fixed-seed all-unified artifact measures 100 games at mean 5.76 s/game (median 5.02 s, p95 11.88 s) on this workspace. A conservative sequential planning estimate is approximately 6–8 hours for the 4,800-game formal baseline plus replay I/O; the two weak-baseline comparisons may be faster, but D0 schedules against the conservative bound. Smoke runs are estimated at roughly 35–50 minutes sequentially. These are planning estimates, not benchmark claims.

`--batch 1-50`, `--resume`, and `--skip-existing` use a manifest keyed by `configHash`. A batch file contains its complete seed interval, `expectedMatchIds`, explicit `completedMatchIds`, completed summaries, and public/final hashes. Resume may reuse only a completed record with the same config hash and matching replay/hash requirements. Merge rejects different configuration hashes, duplicate match IDs, missing expected IDs, inconsistent strategy descriptors, or incomplete base-seed blocks. A deterministic merge test proves four 50-seed batches equal one 200-seed one-shot result.

## CPU concurrency

`--concurrency 1` runs in the coordinator. Values greater than one use Node `worker_threads`, never Promise-only concurrency. The coordinator sends immutable task payloads and receives immutable game summaries; workers load independent module instances and own all runtime, diagnostics, PRNG state, and mutable cache. The coordinator performs stable `matchId` sorting before reporting. Tests compare concurrency `1` and `2` output (excluding duration fields) and verify no worker-derived state is shared.

## Artifact Git policy

`artifacts/` is currently ignored. At formal D0 completion, the compact, reviewable baseline JSON and Markdown are force-added or explicitly unignored and committed with their manifest. Replay, debug, and batch directories remain ignored. The main JSON carries every required per-game summary but omits traces, timing samples, diagnostics payloads, and verbose per-action data. If its expanded-object form exceeds 5 MiB, it uses documented normalized dictionaries plus compact `gameRows` while retaining all required per-game fields; verbose batch data stays ignored. Markdown remains the human review artifact.

## Commands and test matrix

```bash
npm run benchmark:ai -- \
  --strategy-a unified-current --strategy-b legacy-reference \
  --seeds 1-200 --paired --batch 1-50 --resume --skip-existing \
  --replay all --concurrency 2 --timeout-ms 30000 --diagnostics

npm run benchmark:ai -- --replay-match <match-id>
```

Tests cover: generic runtime lifecycle; four strategies; observation and legacy isolation; true room execution; exact rotations; 8-game matrix coverage; zero safety counters; label-swap reversal; seed-block bootstrap determinism; batch/merge/one-shot equality; config-hash rejection; hash/replay reproduction; diagnostics and worker-count invariance; privacy; and production import/build boundaries. Existing AI decision, room, shadow, 20-game simulation, TypeScript, build, and diff checks remain regression requirements.

## Problem-to-revision map

| Requested issue | Revision location |
| --- | --- |
| Benchmark-specific observation | “Benchmark observation and generic runtime lifecycle” |
| Generic runtime lifecycle | “Benchmark observation and generic runtime lifecycle” |
| Exact 8-game rotations | “Game execution and exact seat rotations” |
| 4,800-game estimate, batching and manifest | “Batching, resume, and runtime estimate” |
| Real CPU parallelism | “CPU concurrency” |
| Base-seed bootstrap and exploratory tags | “Statistics and Elo-compatible fields”; “Metrics and classifications” |
| Baseline candidate policy and naming | “Candidate-policy boundary” |
| Legacy restricted preflight | “Benchmark observation and generic runtime lifecycle” |
| Version/config/commit strategy descriptors | “Benchmark observation and generic runtime lifecycle”; “Replay schema and deterministic public hash” |
| Canonical trace hash | “Replay schema and deterministic public hash” |
| Artifact commit and size policy | “Artifact Git policy” |
| Additional replay fields | “Replay schema and deterministic public hash” |
