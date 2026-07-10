# AI Hand Planning Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a replay-visible AI hand planning phase and make AI play primarily from the best scored planned groups.

**Architecture:** Store AI planning as room state separate from physical hands. Generate the best scored plan from the final hand before normal play begins, expose it through the public room, and let AI decision code prefer planned groups while keeping all actual play validation in `playCards`.

**Tech Stack:** TypeScript, Vitest, React, existing `generatePlans`, `scorePlans`, `CardGroup`, and room/replay state.

## Global Constraints

- Use existing planner/scorer; do not add dependencies.
- Physical hand ownership remains authoritative; `playCards` must still reject unavailable cards.
- AI plans are strategy views only; they do not mutate `hands`.
- Replay must show AI planning before AI normal play.

---

### Task 1: Room State AI Plans

**Files:**
- Modify: `src/game/room.ts`
- Test: `tests/game/room.test.ts`

**Interfaces:**
- Produces: `AiPlanState`, `RoomState.aiPlans`, `PublicRoom.aiPlans`, `ensureAiPlans(room)`.

- [ ] **Step 1: Write failing tests**

Add tests asserting AI plans are generated for AI seats, use scored plans, consume current hands exactly once, and refresh after tribute completion.

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/game/room.test.ts`
Expected: FAIL because `aiPlans` does not exist.

- [ ] **Step 3: Implement room planning**

Use `scorePlans(generatePlans(hand, rank, 5), rank)[0]` for each AI seat. Store groups, score, plan name, and seat.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/game/room.test.ts`
Expected: PASS.

### Task 2: AI Uses Planned Groups

**Files:**
- Modify: `src/game/ai.ts`
- Modify: `src/game/room.ts`
- Test: `tests/game/ai.test.ts`

**Interfaces:**
- Consumes: `plannedGroups?: CardGroup[]` on `AiDecisionInput`.
- Produces: AI lead/follow candidates that prefer full planned groups and protect planned structures.

- [ ] **Step 1: Write failing tests**

Add tests where a hand has loose raw pairs/singles but the best plan forms a straight or straight flush, and AI leads/follows from planned groups rather than raw detection.

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/game/ai.test.ts`
Expected: FAIL because `chooseAiAction` ignores planned groups.

- [ ] **Step 3: Implement planned candidate preference**

Pass planned groups from room into `chooseAiAction`. Prefer planned legal groups for lead/follow. Preserve current fallback and validation.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/game/ai.test.ts`
Expected: PASS.

### Task 3: Replay Displays AI Planning

**Files:**
- Modify: `src/ui/api.ts`
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/app.test.tsx`

**Interfaces:**
- Consumes: `PublicRoom.aiPlans`.
- Produces: replay panel text and grouped cards for AI plan actions.

- [ ] **Step 1: Write failing UI test**

Add a finished room with `aiPlans` and assert replay perspective shows an AI planning step before card play.

- [ ] **Step 2: Verify failure**

Run: `npm test -- tests/ui/app.test.tsx`
Expected: FAIL because replay does not render planning.

- [ ] **Step 3: Implement replay plan steps**

Derive replay steps from `aiPlans` plus `playHistory` inside `ReplayDialog`. Render planning groups without removing any cards.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/ui/app.test.tsx`
Expected: PASS.

### Task 4: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: TypeScript and Vite build pass.
