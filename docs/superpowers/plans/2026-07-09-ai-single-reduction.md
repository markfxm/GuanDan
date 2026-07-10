# AI Single Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI grouping and play decisions minimize 10-or-lower singles while preserving straight flushes, protected bombs, and big-joker recovery control.

**Architecture:** Add pure plan-quality helpers beside the grouping engine so both the exhaustive planner and the room's fast AI planner use the same lexicographic comparison. Keep response and lead policy in `game/ai.ts`, adding only the two contextual decisions required by the approved design.

**Tech Stack:** TypeScript, Vitest, existing Guandan group detector and room state engine.

## Global Constraints

- Compare plans lexicographically by protected-structure loss, 10-or-lower single count, total group count, retained control, then existing score.
- Never split a straight flush.
- A four-card bomb may be sacrificed only when one bomb card joins four natural loose singles as a straight.
- A bomb of five or more cards may contribute cards only down to a retained four-card bomb.
- Do not add configuration, UI, dependencies, or unrelated refactoring.
- This workspace is not a Git repository; omit commit steps instead of initializing Git.

---

### Task 1: Shared Lexicographic Plan Quality

**Files:**
- Create: `src/engine/planQuality.ts`
- Test: `tests/engine/planQuality.test.ts`

**Interfaces:**
- Consumes: `Card`, `GameRank`, and `CardGroup`.
- Produces: `PlanQuality`, `measurePlanQuality(cards, groups, gameRank)`, and `comparePlanQuality(left, right)`.

- [ ] **Step 1: Write failing tests for strict comparison order**

Create fixtures proving that protected loss outranks all later fields, fewer low singles outranks fewer total groups, fewer groups outranks retained control, and retained control outranks fallback score.

```ts
expect(comparePlanQuality(
  { protectedLoss: 0, lowSingleCount: 3, groupCount: 5, retainedControl: 1, fallbackScore: 0 },
  { protectedLoss: 1, lowSingleCount: 0, groupCount: 1, retainedControl: 9, fallbackScore: 999 },
)).toBeLessThan(0);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/engine/planQuality.test.ts`

Expected: FAIL because `src/engine/planQuality.ts` does not exist.

- [ ] **Step 3: Implement the pure metric and comparator**

```ts
export type PlanQuality = {
  protectedLoss: number;
  lowSingleCount: number;
  groupCount: number;
  retainedControl: number;
  fallbackScore: number;
};

export function comparePlanQuality(left: PlanQuality, right: PlanQuality): number {
  return left.protectedLoss - right.protectedLoss
    || left.lowSingleCount - right.lowSingleCount
    || left.groupCount - right.groupCount
    || right.retainedControl - left.retainedControl
    || right.fallbackScore - left.fallbackScore;
}
```

`measurePlanQuality` must count a low single when its sole suited card has natural rank at or below 10. It must count retained joker, game-rank, and ace-or-higher single controls using existing rank helpers. Protected loss is computed against natural straight flushes and bombs in the input hand, using Task 2's legal bomb-reduction rule.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/engine/planQuality.test.ts`

Expected: all plan-quality tests PASS.

---

### Task 2: Bomb Reduction and Natural-Loose-Single Rules

**Files:**
- Modify: `src/engine/planQuality.ts`
- Test: `tests/engine/planQuality.test.ts`

**Interfaces:**
- Produces: `isLegalBombReduction(sourceBomb, consumingGroup, allGroups, gameRank): boolean`.
- A caller may accept a candidate straight overlapping a bomb only when this function returns true.

- [ ] **Step 1: Add failing boundary tests**

Cover these exact cases:

```ts
expect(isLegalBombReduction(fourBomb, straightUsingOneBombCardAndFourLooseSingles, allGroups, "2")).toBe(true);
expect(isLegalBombReduction(fourBomb, straightThatAlsoBreaksAPair, allGroups, "2")).toBe(false);
expect(isLegalBombReduction(fiveBomb, straightUsingOneBombCard, allGroups, "2")).toBe(true);
expect(isLegalBombReduction(sixBomb, firstStraightUsingOneBombCard, allGroups, "2")).toBe(true);
expect(isLegalBombReduction(sixBomb, groupUsingThreeBombCards, allGroups, "2")).toBe(false);
expect(isLegalBombReduction(straightFlush, overlappingStraight, allGroups, "2")).toBe(false);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/engine/planQuality.test.ts`

Expected: FAIL on bomb-reduction assertions.

- [ ] **Step 3: Implement the approved boundaries**

For bombs of size five or greater, allow at most `bomb.cards.length - 4` shared cards. For a four-card bomb, require exactly one shared card and verify every other straight card appears only in single-card groups among all detected non-single structures. Return false for straight-flush sources unconditionally.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/engine/planQuality.test.ts`

Expected: all bomb-reduction tests PASS.

---

### Task 3: Apply Lexicographic Selection to Both Planners

**Files:**
- Modify: `src/engine/planner.ts`
- Modify: `src/game/room.ts`
- Test: `tests/engine/planner.test.ts`
- Test: `tests/game/room.test.ts`

**Interfaces:**
- Consumes: `measurePlanQuality` and `comparePlanQuality` from Task 1.
- Produces identical high-priority behavior from `generatePlans` and room `aiPlans`.

- [ ] **Step 1: Add the screenshot-hand regression tests**

Build the East hand from the supplied screenshot and assert the selected plan contains two distinct straights with rank sets `34567` and `45678`. Assert the only 10-or-lower single ranks are `4` and `9`.

Also add room-level tests proving:

- ordinary four-card bombs remain intact;
- a four-card bomb may form one straight with four natural loose singles;
- five- and six-card bombs may be reduced but leave four bomb cards;
- straight flushes remain intact.

- [ ] **Step 2: Run focused planner and room tests and verify RED**

Run: `npm test -- tests/engine/planner.test.ts tests/game/room.test.ts`

Expected: screenshot-hand assertions FAIL because current score-first/greedy selection leaves more low singles.

- [ ] **Step 3: Update exhaustive cover comparison**

Extend `CoverResult` with a quality value derived from its complete group list. In `compareCovers`, call `comparePlanQuality` before the deterministic group-id tie-break. Preserve archetype score as `fallbackScore`; remove score and group count as earlier independent comparison branches.

- [ ] **Step 4: Update fast room planning**

Replace the fast planner's score-only candidate preference with a bounded complete-cover comparison using the same `PlanQuality`. Keep the existing detected-group candidate set and deterministic ordering. Reject overlaps with straight flushes and call `isLegalBombReduction` for bomb overlaps. Do not call `generatePlans` from `buildAiPlan`, because room creation and every-trick regrouping require the existing fast path.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/engine/planner.test.ts tests/game/room.test.ts`

Expected: all tests PASS, including the screenshot hand and bomb boundaries.

---

### Task 4: Preserve Big Joker During Ordinary Single Responses

**Files:**
- Modify: `src/game/ai.ts`
- Test: `tests/game/ai.test.ts`

**Interfaces:**
- Add private predicate `shouldReserveBigJokerRecovery(input, response): boolean`.
- Uses current hand, planned groups, table context, and existing power-resource detection.

- [ ] **Step 1: Add failing response tests**

Test that AI passes instead of following a normal opponent single with a big joker when:

- at least one planned 10-or-lower single remains;
- at least one bomb remains;
- the opponent cannot immediately finish.

Add exception tests showing the big joker is still played when it empties AI's hand or blocks an opponent whose remaining hand count equals the current single play.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/game/ai.test.ts -t "big joker recovery"`

Expected: ordinary-response test FAIL because current response selection can spend the big joker.

- [ ] **Step 3: Implement the response guard**

Before returning a planned or structure-aware single response, filter a single big joker when `shouldReserveBigJokerRecovery` is true. The predicate must return false for immediate-finish and opponent-finish exceptions and must not alter partner-yield handling.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/game/ai.test.ts -t "big joker recovery"`

Expected: all big-joker recovery tests PASS.

---

### Task 5: Lead the Lowest Loose Small Single After Bomb Control

**Files:**
- Modify: `src/game/room.ts`
- Modify: `src/game/ai.ts`
- Test: `tests/game/ai.test.ts`
- Test: `tests/game/room.test.ts`

**Interfaces:**
- Extend `AiDecisionInput.context` with `wonPreviousTrickWithPower?: boolean`.
- Room derives it from the previous completed trick before clearing trick plays.

- [ ] **Step 1: Add failing lead tests**

Create a hand containing a planned straight, a retained big joker, and two loose low singles. Set `wonPreviousTrickWithPower: true` and assert `chooseAiAction` leads the lower loose single without splitting the straight.

Add a room test proving the context flag is true only for the seat that won the prior trick with a bomb, straight flush, or joker bomb.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/game/ai.test.ts tests/game/room.test.ts -t "after bomb control"`

Expected: lead test FAIL because current planned-group lead runs before the required recovery sequence.

- [ ] **Step 3: Preserve prior-trick control context**

Store the winning play type when `passTurn` resets the trick and pass a boolean to the winner's next `chooseAiAction` call. Clear it after that seat takes the lead action so it cannot leak into later turns.

- [ ] **Step 4: Add the priority lead branch**

Before normal planned lead selection, choose the lowest single that:

- is 10 or lower;
- is present as a single in the latest plan;
- is not contained in a straight, straight flush, pair, triple, wood board, steel plate, full house, or bomb.

Return undefined when no such card exists so current lead logic remains unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- tests/game/ai.test.ts tests/game/room.test.ts -t "after bomb control"`

Expected: all post-bomb-control tests PASS.

---

### Task 6: Full Verification

**Files:**
- No production changes expected.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all test files and tests PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript checking and Vite production build both exit with code 0.

- [ ] **Step 3: Review scope**

Run: `rg -n "PlanQuality|isLegalBombReduction|shouldReserveBigJokerRecovery|wonPreviousTrickWithPower" src tests`

Expected: changes are confined to plan quality, planner integration, room state, AI policy, and their tests.
