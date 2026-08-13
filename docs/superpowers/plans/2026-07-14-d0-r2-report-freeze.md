# D0-R2 Report Model and Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate the final D0 JSON and Markdown baseline from one validated aggregate ReportModel, then run the complete freeze gate and create `ai-benchmark-d0-baseline`.

**Architecture:** Read the four D0 matchup batch manifests and replay-validation summary as facts, merge them with `mergeBatches`, derive one full-report model containing global configuration, per-matchup raw/paired statistics, bootstrap metadata, manifest validation, and replay validation. Serialize that model to JSON and render Markdown from the same object; no Markdown replacement or old baseline input is permitted.

**Tech Stack:** TypeScript, Vitest, Node filesystem/crypto, existing benchmark statistics and replay verifier.

## Global Constraints

- Benchmark code remains only in `tests/benchmark` and `scripts`; production `src` is unchanged.
- Do not modify AI strategy behavior, game rules, benchmark statistic definitions, Beam, or planning budgets.
- Bootstrap block is one base seed containing all 8 games; paired match units remain the 2 allocation × 4 rotation units.
- Classification is exploratory only; Elo is secondary descriptive evidence.
- Do not read the old baseline JSON/Markdown as factual input; only batch JSON, manifests, and replay validation results are facts.
- The formal baseline artifact remains compact and must not embed full public traces or hidden hands.

### Task 1: Add ReportModel contract and failing consistency tests

**Files:**
- Modify: `tests/benchmark/reporting.ts`
- Modify: `tests/benchmark/contracts.ts`
- Test: `tests/benchmark/reporting.test.ts`

- [ ] Add tests asserting one model exposes complete global counts/config, three matchup records, paired point estimates, bootstrap metadata, replay/manifest summaries, generatedAt, and stable JSON/Markdown rendering.
- [ ] Run the new tests and observe failures against the current direct-report implementation.
- [ ] Define typed `BenchmarkReportModel`, `MatchupReportModel`, and `ReportValidationSummary` contracts without changing existing compact game-row schema.

### Task 2: Implement statistics and validation aggregation

**Files:**
- Modify: `tests/benchmark/statistics.ts`
- Modify: `tests/benchmark/reporting.ts`
- Test: `tests/benchmark/statistics.test.ts`

- [ ] Add explicit paired match-unit aggregation: each seed/rotation/allocation is one unit, draw is unresolved, score neutral is 0, win-rate neutral is 0.5.
- [ ] Preserve fixed bootstrap defaults (`iterations=200`, `seed=1`) and expose `bootstrapBlockUnit="base-seed"`, `bootstrapIterations`, and `bootstrapSeed`.
- [ ] Aggregate full 600-seed input into 3 matchups with 200 base seeds, 1,600 raw games, and 800 paired units each.
- [ ] Validate manifest sets, config hashes, provenance, positive durations, and replay/hash/version/privacy summary.

### Task 3: Build one model and render both formats from it

**Files:**
- Modify: `tests/benchmark/reporting.ts`
- Modify: `scripts/runAiBenchmark.ts`
- Create: `scripts/freezeAiBenchmark.ts`
- Test: `tests/benchmark/reporting.test.ts`

- [ ] Implement `buildBenchmarkReportModel(...)`, `serializeReportJson(model)`, and `renderReportMarkdown(model)`.
- [ ] Ensure Markdown receives the already-built model and independently prints all three matchups and their own CIs/significance interpretation.
- [ ] Ensure fixed `generatedAt` produces byte-stable JSON/Markdown; volatile generatedAt is excluded only in stability tests.
- [ ] Add a freeze script that reads only four batch manifests plus replay-validation summary, writes the three formal artifacts atomically, and never reads the old baseline report.

### Task 4: Generate and validate formal D0 artifacts

**Files:**
- Modify: `tests/benchmark/reporting.test.ts`
- Modify: `tests/benchmark/statistics.test.ts`
- Create/Update: `artifacts/ai-benchmark-baseline.json`, `artifacts/ai-benchmark-baseline.md`, `artifacts/ai-benchmark-manifest.json`

- [ ] Run the freeze script with the complete 600-seed manifest set and fixed generatedAt.
- [ ] Verify global config, all three matchup records, manifest summary, replay/hash summary, and privacy constraints.
- [ ] Verify JSON/Markdown matchup count, names, all CI values, counts, seed range, generatedAt, bootstrap metadata, and no placeholders.

### Task 5: Run final regression and freeze tag

**Files:**
- No production source changes.

- [ ] Run report/statistics focused tests, benchmark focused tests, replay samples, `npm test`, performance-isolated tests, `npx tsc --noEmit`, `npm run build`, `git diff --check`, and production static scans.
- [ ] Confirm worktree clean and final commit records the artifact commit/sourceCommit.
- [ ] Create annotated tag `ai-benchmark-d0-baseline` at the final commit only after every gate passes.
