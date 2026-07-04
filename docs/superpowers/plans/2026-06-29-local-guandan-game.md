# Local Guandan Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-playable local Guandan room where one human can open a room, AI fills empty seats, and a full hand can be played through with mainstream Jiangsu-style rules approximated for the first playable prototype.

**Architecture:** Add a focused game-state engine under `src/game` that owns rooms, turn order, legal play comparison, and AI decisions. Keep the existing `src/engine` card/group/planner modules as reusable strategy primitives. Expose room APIs from Fastify and replace the single research-table UI with a playable table that still reuses `CardFace` and plan visualization helpers.

**Tech Stack:** TypeScript, React 18, Vite, Fastify, Vitest, Testing Library.

---

### Task 1: Legal Play and Comparison

**Files:**
- Create: `src/game/playRules.ts`
- Test: `tests/game/playRules.test.ts`

- [ ] Write tests for classifying singles, pairs, straights, straight flushes, wood boards, bombs, joker bombs, same-type comparison, bomb-over-normal comparison, and pass handling.
- [ ] Implement `classifyPlay(cards, gameRank)`, `canBeatPlay(candidate, last, gameRank)`, and `playPower(group, gameRank)`.
- [ ] Run `npm test -- tests/game/playRules.test.ts`.

### Task 2: Room State Engine

**Files:**
- Create: `src/game/room.ts`
- Test: `tests/game/room.test.ts`

- [ ] Write tests for creating a four-seat room, dealing 27 cards each, AI filling empty seats, a legal human play removing cards, passing, trick reset by three passes,接风 after a player finishes, and finish-order completion.
- [ ] Implement in-memory `createRoom`, `getPublicRoom`, `playCards`, `passTurn`, `runAiUntilHumanTurn`.
- [ ] Run `npm test -- tests/game/room.test.ts`.

### Task 3: AI Strategy

**Files:**
- Create: `src/game/ai.ts`
- Test: `tests/game/ai.test.ts`

- [ ] Write tests that AI leads with linked structures from the planner, beats with the smallest legal response, preserves bombs when a normal response exists, and passes to a partner in control when reasonable.
- [ ] Implement `chooseAiAction(state, seat)` using `generatePlans`, `detectGroups`, and `canBeatPlay`.
- [ ] Run `npm test -- tests/game/ai.test.ts`.

### Task 4: Room API

**Files:**
- Modify: `src/server/api.ts`
- Test: `tests/server/api.test.ts`

- [ ] Add tests for `POST /api/rooms`, `GET /api/rooms/:id`, `POST /api/rooms/:id/play`, `POST /api/rooms/:id/pass`, and `POST /api/rooms/:id/ai`.
- [ ] Implement request validation and public room serialization.
- [ ] Run `npm test -- tests/server/api.test.ts`.

### Task 5: Browser Table UI

**Files:**
- Modify: `src/ui/api.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/ui/app.test.tsx`

- [ ] Add client methods for room APIs.
- [ ] Replace the research-only layout with a playable table: open room, seat cards, current trick, selectable hand cards, play/pass/AI buttons, finish order, ask/report hints.
- [ ] Keep plan suggestions visible for the human hand.
- [ ] Run `npm test -- tests/ui/app.test.tsx`.

### Task 6: Verification

**Files:**
- Existing test suite and build.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start API and Vite dev servers.
- [ ] Verify in the in-app browser at `http://127.0.0.1:5173/` that a room can be opened, AI seats fill, the human can play/pass, and AI advances to the next human turn.
