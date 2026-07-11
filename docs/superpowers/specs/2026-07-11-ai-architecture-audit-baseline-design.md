# AI Architecture Audit and Baseline Design

## Goal

Freeze the current AI decision behavior with deterministic characterization tests, a fixed-seed simulation baseline, and repeatable hot-path measurements. Production decision policy must not change during this phase.

## Scope

- Inspect and document `ai.ts`, `room.ts`, `protectedGroups.ts`, `planQuality.ts`, `planner.ts`, `scorer.ts`, and `playRules.ts`.
- Add deterministic tests for the listed lead, follow, protection, downgrade, plan-integrity, and determinism behaviors.
- Extend the existing performance suite with diagnostic counters and median/p95 measurements using fixed inputs.
- Capture a fixed-seed multi-step AI game baseline as observable replay data.

## Boundaries

- No front-end or API contract changes.
- No scoring, candidate-order, or policy changes.
- A production-code change is permitted only if a new deterministic test proves a concrete game-legality failure; it must be the smallest fix and preserve all existing behavior outside that failure.

## Approach

The audit will treat `playRules.ts` as game-legality authority, `protectedGroups.ts` as action-candidate protection authority, and `ai.ts`/`room.ts` as current policy and planning consumers. Documentation will distinguish duplicated implementation from intentional layering and will record migration candidates without performing the migration.

## Verification

Every new fixture uses literal cards or a documented seed. The performance suite records measurements but asserts only stable invariants and finite values. Final verification runs `npm test` and `npm run build`; any pre-existing timeout is reported separately with isolated evidence.
