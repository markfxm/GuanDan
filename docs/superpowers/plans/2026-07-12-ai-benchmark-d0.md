# D0 AI Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a test-only, reproducible AI tournament system with paired rotations, replay artifacts, statistics, and three D0 baselines.

**Architecture:** `tests/benchmark` owns public observation, generic strategies, real-room simulation, rotations, metrics, statistics, and reporting. `scripts` owns CLI orchestration and workers. The simulator imports production room APIs but production never imports benchmark code.

**Tech Stack:** TypeScript 5.7, Vitest 2, tsx, Node `worker_threads`, existing room/AI/engine modules.

## Global Constraints

- Do not modify production AI policy, scoring, planning budgets, game rules, or `src/` benchmark interfaces.
- Benchmark code is only in `tests/benchmark/` and `scripts/`.
- Execute actions only through `createRoom`, `playCards`, and `passTurn`.
- Benchmark observations never expose hidden hands or deck state.
- Every base seed yields 8 games: 4 rotations × AB/BA allocations.
- Bootstrap resamples complete base-seed blocks; classifications are exploratory only.
- `--concurrency > 1` must use `worker_threads`, not Promise-only concurrency.

---

### Task 1: Benchmark contracts and canonical utilities

**Files:**
- Create: `tests/benchmark/contracts.ts`
- Create: `tests/benchmark/contracts.test.ts`

**Interfaces:** Produces `BenchmarkObservation`, `AiStrategy<TRuntime>`, `StrategyDecision<TRuntime>`, `StrategyDescriptor`, `GameAction`, `GameSummary`, `ReplayDocument`, `BenchmarkConfig`, and `canonicalJson(value): string`.

- [ ] **Step 1: Write failing contract tests**

```ts
it("keeps BenchmarkObservation free of hidden fields", () => {
  expect(Object.keys(observation)).not.toContain("partnerHand");
  expect(canonicalJson({ b: 1, a: ["z", "a"] })).toBe('{"a":["z","a"],"b":1}');
});
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/benchmark/contracts.test.ts`

Expected: failure because the module does not exist.

- [ ] **Step 3: Implement the minimal types and recursive key-sorting serializer**

```ts
export type AiStrategy<R> = { createRuntime(context: StrategyRuntimeContext): R; decide(input: BenchmarkObservation, runtime: R): StrategyDecision<R>; /* descriptor fields */ };
export function canonicalJson(value: unknown): string { /* recursively sort object keys; preserve array order */ }
```

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/benchmark/contracts.test.ts`

Commit: `git commit -am "feat: add benchmark contracts"`

### Task 2: Restricted observations and candidate generator

**Files:**
- Create: `tests/benchmark/observation.ts`
- Create: `tests/benchmark/candidates.ts`
- Create: `tests/benchmark/observation.test.ts`

**Interfaces:** Consumes `RoomState`, contracts; produces `createBenchmarkObservation(room, seat)`, `toProductionObservation(input)`, `toLegacyObservation(input)`, and `legalCandidates(input)`.

- [ ] **Step 1: Write failing isolation and legality tests**

```ts
it("does not change an observation when opponent cards are swapped", () => expect(first).toEqual(second));
it("offers pass only while following and every play beats the public trick", () => expect(candidates.every(isLegal)).toBe(true));
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/benchmark/observation.test.ts`

- [ ] **Step 3: Implement copied whitelist adapters and legal-only groups**

Use `classifyPlay`/`canBeatPlay`, copied own cards, public history/counts, and no `PowerGroupPolicy` import.

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/benchmark/observation.test.ts`

Commit: `git commit -am "feat: isolate benchmark observations"`

### Task 3: Four strategy adapters with seat-local runtimes

**Files:**
- Create: `tests/benchmark/strategies.ts`
- Create: `tests/benchmark/strategies.test.ts`

**Interfaces:** Produces `getStrategy(id)`, descriptors for `unified-current`, `legacy-reference`, `legal-random`, `legal-greedy`, plus aliases `deterministic-random` and `simple-greedy`.

- [ ] **Step 1: Write failing strategy lifecycle tests**

```ts
it("replaces only the acting strategy runtime", () => expect(next.runtime).not.toBe(runtime));
it("passes legacy no hidden-card property", () => expect(legacyInput).not.toHaveProperty("partnerHand"));
it("makes legal-random deterministic from its derived seed", () => expect(a).toEqual(b));
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/benchmark/strategies.test.ts`

- [ ] **Step 3: Implement adapters**

`unified-current` maps whitelist fields to `decideAiAction`; legacy maps only the restricted legacy input and throws `LEGACY_REQUIRES_HIDDEN_INFORMATION` if it cannot decide. Weak strategies use `legalCandidates` and their own PRNG/empty runtime types.

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/benchmark/strategies.test.ts`

Commit: `git commit -am "feat: add benchmark strategies"`

### Task 4: Rotation matrix and real-room mixed simulation

**Files:**
- Create: `tests/benchmark/rotations.ts`
- Create: `tests/benchmark/simulator.ts`
- Create: `tests/benchmark/rotations.test.ts`
- Create: `tests/benchmark/simulator.test.ts`

**Interfaces:** Produces `rotateRoom(room, rotation)`, `buildGamesForSeed(config, seed)`, and `simulateGame(task): GameSummary`.

- [ ] **Step 1: Write failing rotation and mixed-seat tests**

```ts
it("creates eight stable games for one base seed", () => expect(buildGamesForSeed(config, 1)).toHaveLength(8));
it("maps base seat s to (s + r) % 4 and preserves 108 unique cards", () => expect(ids.size).toBe(108));
it("executes strategy choices only through playCards and passTurn", () => expect(summary.completed).toBe(true));
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/benchmark/rotations.test.ts tests/benchmark/simulator.test.ts`

- [ ] **Step 3: Implement permutation, AB/BA matrix, runtime map, public events, and failure classification**

Build from `createRoom`; rotate all listed seat references before play; call `playCards`/`passTurn` only; never substitute failed actions; include stable `matchId`.

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/benchmark/rotations.test.ts tests/benchmark/simulator.test.ts`

Commit: `git commit -am "feat: simulate paired benchmark rooms"`

### Task 5: Metrics, classifications, and seed-block statistics

**Files:**
- Create: `tests/benchmark/metrics.ts`
- Create: `tests/benchmark/classification.ts`
- Create: `tests/benchmark/statistics.ts`
- Create: `tests/benchmark/statistics.test.ts`

**Interfaces:** Produces `summarizeGame`, `classifyGame`, `aggregateTournament`, and deterministic `pairedBootstrap(baseSeedBlocks, iterations, seed)`.

- [ ] **Step 1: Write failing score, label-swap, and block-bootstrap tests**

```ts
it("reverses paired score and win rate after A/B labels swap", () => expect(swapped.scoreDifference).toBe(-original.scoreDifference));
it("resamples all eight games in a base-seed block", () => expect(sampled[0].games).toHaveLength(8));
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/benchmark/statistics.test.ts`

- [ ] **Step 3: Implement settlement score, efficiency, exploratory tags, CI, and Elo snapshot**

Use existing room settlement; record zero-counter totals; tag classifications after the game; include `elo: { initialRating: 1500, kFactor, delta }`.

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/benchmark/statistics.test.ts`

Commit: `git commit -am "feat: add benchmark metrics and statistics"`

### Task 6: Replays, hashes, reports, and manifests

**Files:**
- Create: `tests/benchmark/reporting.ts`
- Create: `tests/benchmark/reporting.test.ts`
- Modify: `.gitignore`

**Interfaces:** Produces `publicTraceHash`, `finalPublicStateHash`, `writeReplay`, `writeReport`, `createManifest`, and `mergeBatches`.

- [ ] **Step 1: Write failing deterministic replay and merge tests**

```ts
it("ignores durations and diagnostics in publicTraceHash", () => expect(hash(a)).toBe(hash(b)));
it("rejects a duplicate matchId or distinct configHash", () => expect(() => mergeBatches(batches)).toThrow());
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/benchmark/reporting.test.ts`

- [ ] **Step 3: Implement canonical SHA-256 output and privacy policy**

Emit schema/version/descriptors/config fields; support replay `none|failures|all`; write debug full state only under ignored debug paths; unignore only approved compact baseline files when formal reports are committed.

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/benchmark/reporting.test.ts`

Commit: `git commit -am "feat: add benchmark artifacts"`

### Task 7: Worker-thread execution and CLI

**Files:**
- Create: `tests/benchmark/worker.ts`
- Create: `scripts/runAiBenchmark.ts`
- Create: `scripts/replayAiBenchmark.ts`
- Create: `tests/benchmark/cli.test.ts`
- Modify: `package.json`

**Interfaces:** Adds `npm run benchmark:ai -- ...` and replay command with strategies, seeds, paired, batch, resume, skip-existing, output, replay mode, diagnostics, timeout, and concurrency.

- [ ] **Step 1: Write failing CLI tests**

```ts
it("matches summaries for concurrency 1 and 2 except duration", async () => expect(stripDuration(two)).toEqual(stripDuration(one)));
it("resume rejects a batch with another configHash", () => expect(exitCode).toBe(1));
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/benchmark/cli.test.ts`

- [ ] **Step 3: Implement worker task protocol and stable coordinator output**

Use `Worker` from `node:worker_threads` for values above one; give workers immutable task data; sort summaries by `matchId`; enforce timeout and batch completeness.

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/benchmark/cli.test.ts`

Commit: `git commit -am "feat: add AI benchmark CLI"`

### Task 8: Reproducibility regression and smoke baselines

**Files:**
- Create: `tests/benchmark/reproducibility.test.ts`
- Create: `artifacts/ai-benchmark-smoke.json`
- Create: `artifacts/ai-benchmark-smoke.md`

- [ ] **Step 1: Write failing end-to-end reproducibility tests**

```ts
it("matches one-shot and four merged batches", () => expect(merged).toEqual(oneShot));
it("replays a saved game to its public and final hashes", () => expect(replayResult.hash).toBe(summary.publicTraceHash));
```

- [ ] **Step 2: Run RED, implement orchestration assertions, then run GREEN**

Run: `npx vitest run tests/benchmark/reproducibility.test.ts`

Expected: RED before assertions/helpers; GREEN after implementation.

- [ ] **Step 3: Run and save the three 20-seed smoke matchups**

Run three `npm run benchmark:ai` commands for unified vs legal-random, legal-greedy, and legacy-reference using `--seeds 1-20 --paired --replay failures`.

- [ ] **Step 4: Verify safety counters and commit**

Run: `npm test && npx tsc --noEmit && npm run build && git diff --check`

Commit: `git commit -am "test: add D0 benchmark smoke baseline"`

### Task 9: Formal baseline batches and final verification

**Files:**
- Create: `artifacts/ai-benchmark-baseline.json`
- Create: `artifacts/ai-benchmark-baseline.md`
- Create: `artifacts/ai-benchmark-manifest.json`

- [ ] **Step 1: Run every matchup in four complete batches**

Run each matchup for `1-50`, `51-100`, `101-150`, and `151-200` with `--replay all --concurrency 2 --resume --skip-existing`.

- [ ] **Step 2: Merge and verify manifest completeness**

Require 4,800 unique `matchId`s, 2,400 paired rotation units, 600 base-seed blocks, one config hash per matchup, and zero required safety/error counters.

- [ ] **Step 3: Run the full verification gate**

Run: `npm test && npx tsc --noEmit && npm run build && git diff --check`

Expected: exit code 0 for each command; report any failed baseline rather than altering strategy.

- [ ] **Step 4: Commit compact approved artifacts**

Run: `git add -f artifacts/ai-benchmark-baseline.json artifacts/ai-benchmark-baseline.md artifacts/ai-benchmark-manifest.json && git commit -m "docs: publish D0 AI benchmark baseline"`

## Plan self-review

- Spec coverage: Tasks 1–7 implement every boundary, simulator, rotation, metrics, statistics, replay, batch, worker, CLI, and artifact requirement; Tasks 8–9 run smoke/formal baselines and full verification.
- Placeholder scan: no deferred behavior or unnamed interfaces remain; every task supplies files, test behavior, commands, and outputs.
- Type consistency: all later tasks consume the generic contracts of Task 1; `matchId`, `configHash`, `GameSummary`, seed blocks, and hash functions retain the same names throughout.
