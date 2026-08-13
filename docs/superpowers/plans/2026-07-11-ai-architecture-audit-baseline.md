# AI Architecture Audit and Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the current AI architecture and freeze its observable behavior with deterministic tests and benchmarks.

**Architecture:** Keep production decision flow unchanged. Add test-only instrumentation through explicit exported counter helpers where necessary, and create an audit document from direct source inspection.

**Tech Stack:** TypeScript, Vitest, Vite.

## Global Constraints

- Do not change production AI policy, front-end behavior, or API protocols.
- Use literal fixtures or fixed seeds for every added test.
- Do not duplicate rules across new production files.
- Only repair a concrete game-legality defect proven by a new failing test.

---

### Task 1: Map current modules and rule ownership

**Files:**
- Create: `docs/ai-architecture-audit.md`

- [ ] Read every requested source module and its direct callers.
- [ ] Record imports, principal call chains, duplicate-function matrix, three-level rule taxonomy, known conflict risks, target boundaries, migration phases, and rollback conditions.
- [ ] Verify every named claim against the corresponding source symbol.

### Task 2: Freeze decision and protection behavior

**Files:**
- Modify: `tests/game/ai.test.ts`
- Modify: `tests/game/protectedGroups.test.ts`
- Modify: `tests/game/playRules.test.ts`
- Modify: `tests/engine/planner.test.ts`
- Modify: `tests/engine/planQuality.test.ts`

- [ ] Add fixed-card tests for mandatory lead, legal follow, partner-control pass, one-card-opponent block, power protection, legal bomb reduction, complete unique plan coverage, and deterministic decisions.
- [ ] Run each focused test file and preserve the existing decision output as the asserted characterization.

### Task 3: Freeze performance and replay baseline

**Files:**
- Modify: `src/game/protectedGroups.ts`
- Modify: `tests/performance/aiHotPath.test.ts`

- [ ] Add narrowly scoped diagnostic counters for `detectGroups`/`createHandAnalysis` observation without changing candidate selection.
- [ ] Measure fixed-hand analysis, room planning, and fixed-input decision samples; report median and p95 through deterministic test output with finite-value assertions.
- [ ] Add a fixed-seed, bounded AI-only replay baseline that asserts deterministic action serialization and legal plays.

### Task 4: Final verification and audit handoff

**Files:**
- Modify: `docs/ai-architecture-audit.md`

- [ ] Run `npm test` and `npm run build`.
- [ ] Record test/build evidence and the measured baseline in the audit document.
- [ ] If full-suite verification times out, isolate the cause and report it separately from focused test results.
