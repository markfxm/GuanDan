# AI Attacker Support Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI role classification and role-specific lead/follow choices for attacker, support, and balanced play.

**Architecture:** Keep the change inside `src/game/ai.ts` with exported role classification for tests. The existing `chooseAiAction` remains the public decision entry point; it computes a role from the current hand and routes to role-specific selectors before falling back to existing structure-aware logic. This avoids API changes and preserves current room/server behavior.

**Tech Stack:** TypeScript, existing Guandan engine `detectGroups`, Vitest.

---

## File Structure

- Modify `src/game/ai.ts`: add `AiRole`, `classifyAiRole`, role-aware support response and attacker lead selectors.
- Modify `tests/game/ai.test.ts`: add role classification and role behavior tests.

---

### Task 1: Role Classification

**Files:**
- Modify: `src/game/ai.ts`
- Test: `tests/game/ai.test.ts`

- [ ] **Step 1: Add failing tests**

Add tests that import `classifyAiRole` and verify:

```ts
expect(classifyAiRole([low cards with one bomb], "10")).toBe("support");
expect(classifyAiRole([three bombs], "10")).toBe("attacker");
expect(classifyAiRole([joker, joker, pair of A], "10")).toBe("attacker");
```

- [ ] **Step 2: Run red test**

Run:

```powershell
npm test -- tests/game/ai.test.ts -t "classifies"
```

Expected: fail because `classifyAiRole` is not exported.

- [ ] **Step 3: Implement classification**

In `src/game/ai.ts`, export:

```ts
export type AiRole = "attacker" | "support" | "balanced";
export function classifyAiRole(hand: Card[], gameRank: GameRank): AiRole
```

Counting rules:

- `powerGroups = bombs + straight-flush + joker-bomb`.
- Attacker if `powerGroups >= 3`.
- Attacker if control resource score is at least 3:
  - each joker = 1
  - each non-heart rank card of game rank = 1
  - each pair whose major strength is at least A = 1
  - each full-house whose triple rank is at least A = 1
- Support if `powerGroups <= 1` and control score is less than 2.
- Otherwise balanced.

- [ ] **Step 4: Run role tests**

Run:

```powershell
npm test -- tests/game/ai.test.ts -t "classifies"
```

Expected: pass.

---

### Task 2: Support Single Blocking

**Files:**
- Modify: `src/game/ai.ts`
- Test: `tests/game/ai.test.ts`

- [ ] **Step 1: Add failing support behavior tests**

Add:

```ts
it("support AI blocks an opponent small single with a 10 or higher loose single", ...)
it("support AI may split a pair to block an opponent small single with 10 or higher", ...)
```

The first hand should contain a loose J and loose 7; last play is opponent 3; expect J.

The second hand should contain only pair J and low loose cards; last play opponent 3; expect one J.

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm test -- tests/game/ai.test.ts -t "support AI"
```

Expected: fail because existing smallest legal response prefers low cards or avoids pair splitting.

- [ ] **Step 3: Implement support selector**

In `chooseAiAction`, before `structureAwareResponses` for opponent lastPlay, compute role. If role is `support`, call:

```ts
supportResponse(hand, gameRank, lastPlay)
```

Rules:

- Only for opponent `single`.
- Only when lastPlay is below 10 by rank strength.
- Prefer loose singles with rank strength >= 10 and not protected subsets.
- If none, allow a card from a pair with rank strength >= 10 and not part of straight/consecutive-pairs/plate/full-house/straight-flush.

- [ ] **Step 4: Run support tests**

Run:

```powershell
npm test -- tests/game/ai.test.ts -t "support AI"
```

Expected: pass.

---

### Task 3: Attacker Lead Preferences

**Files:**
- Modify: `src/game/ai.ts`
- Test: `tests/game/ai.test.ts`

- [ ] **Step 1: Add failing attacker lead tests**

Add:

```ts
it("attacker AI leads a small single when high single control can take it back", ...)
it("attacker AI leads a small pair when high pair control can take it back", ...)
it("attacker AI leads a small full-house when a large full-house can take it back", ...)
```

Ensure the high pair test does not also include a big joker, so it proves pair logic. Ensure the full-house test contains low 33344 and high AAAKK.

- [ ] **Step 2: Run red tests**

Run:

```powershell
npm test -- tests/game/ai.test.ts -t "attacker AI"
```

Expected: fail for any behavior not already covered.

- [ ] **Step 3: Implement attacker lead selector**

Before existing `coveredTempoLead`, if role is attacker and `lastPlay` is undefined, call:

```ts
attackerLead(hand, gameRank)
```

Priority:

1. Smallest loose single if hand has high single control.
2. Smallest loose pair if hand has higher pair control.
3. Smallest full-house if hand has larger full-house control.

Keep existing `isProtectedSubset` protection.

- [ ] **Step 4: Run attacker tests**

Run:

```powershell
npm test -- tests/game/ai.test.ts -t "attacker AI"
```

Expected: pass.

---

### Task 4: Full Verification and Restart

**Files:**
- Modified: `src/game/ai.ts`, `tests/game/ai.test.ts`

- [ ] **Step 1: Run AI tests**

```powershell
npm test -- tests/game/ai.test.ts
```

- [ ] **Step 2: Run all tests**

```powershell
npm test
```

- [ ] **Step 3: Run build**

```powershell
npm run build
```

- [ ] **Step 4: Restart local services**

Use the existing 5173/5174 restart command and verify `http://127.0.0.1:5173/` returns 200.

---

## Self-Review

- Spec coverage: role classification, support small-single blocking, pair splitting for support, attacker small single, attacker small pair, attacker small full-house, and preservation of existing tests are all covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: `AiRole`, `classifyAiRole`, `supportResponse`, and `attackerLead` are consistently named.
