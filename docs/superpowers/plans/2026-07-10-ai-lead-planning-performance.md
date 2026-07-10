# AI Lead Planning and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that every non-empty AI hand has a legal protected lead, prevent finished seats from acting, and reduce AI lead planning from seconds or minutes to sub-second response time.

**Architecture:** Build one immutable `HandAnalysis` per hand version and reuse it across protection, candidate generation, scoring, and final validation. Treat overlapping bomb-like patterns as alternatives instead of simultaneous hard obligations. Keep a residual mutually exclusive hand plan after each play, use bounded canonical planning only when that plan becomes invalid, and normalize the active seat before invoking AI logic.

**Tech Stack:** TypeScript, Vitest, existing Guandan rules engine, Node performance timers.

## Global Constraints

- A non-empty hand must always produce at least one legal lead action.
- Four-card bombs and straight flush cards cannot be emitted as ordinary singles, pairs, triples, full houses, straights, consecutive pairs, or plates.
- A complete bomb, joker bomb, or straight flush remains a legal action even when it overlaps another theoretical power candidate.
- Five-card-or-larger bombs may supply only the existing legal straight reduction while retaining at least four bomb cards.
- The default rank remains `2`; wildcard-heavy rank-2 hands must meet the same latency targets.
- AI action selection must remain synchronous and deterministic for identical room state.
- No new runtime dependencies.
- This workspace is not a Git repository, so commit steps are omitted.

---

### Task 1: Correct Overlapping Protected-Group Semantics

**Files:**
- Modify: `src/game/protectedGroups.ts`
- Modify: `tests/game/protectedGroups.test.ts`

**Interfaces:**
- Produces: `HandAnalysis`, `createHandAnalysis`, and analysis-based protection assessment.

```ts
export type HandAnalysis = {
  handKey: string;
  hand: Card[];
  gameRank: GameRank;
  allGroups: CardGroup[];
  protectedGroups: ProtectedGroup[];
  normalCards: Card[];
  normalGroups: CardGroup[];
  powerGroups: CardGroup[];
  accepted: ProtectedCandidate[];
  rejected: ProtectedCandidate[];
};

export function createHandAnalysis(
  hand: Card[],
  gameRank: GameRank,
  options?: BombBreakContext,
): HandAnalysis;

export function assessProtectedGroupUseFromAnalysis(
  group: CardGroup,
  analysis: HandAnalysis,
  context?: BombBreakContext,
): ProtectedCandidate;
```

- [ ] Add a failing test using suited `3,4,5,6,7,8` that expects at least one complete straight flush in `accepted`, no ordinary card from the overlapping straight flushes, and a non-empty candidate set.
- [ ] Add a failing invariant test over representative hands containing overlapping straight flushes, four-card bombs, five-card bombs, joker bombs, and ordinary cards: `hand.length > 0` implies at least one accepted lead-capable group.
- [ ] Run `npm test -- --run tests/game/protectedGroups.test.ts` and confirm failures show the current `accepted.length === 0` behavior.
- [ ] Implement `createHandAnalysis` so `detectGroups(hand, gameRank)` and `detectGroups(normalCards, gameRank)` execute once each.
- [ ] Change protection assessment so a complete power action is legal even if it overlaps another power alternative. Ordinary actions still reject any partial use of a hard protected resource.

```ts
const completePowerAction = isPowerGroup(group);
const brokenGroups = protectedGroups.filter((protectedGroup) => {
  const usedCount = overlapCount(group.cards, protectedGroup.cards);
  if (usedCount === 0) return false;
  if (completePowerAction && isWholePowerAlternative(group, analysis.powerGroups)) return false;
  return !isWholeProtectedPowerAction(group, protectedGroup);
});
```

- [ ] Build `accepted` and `rejected` from the precomputed analysis without calling `detectProtectedGroups` inside the candidate loop.
- [ ] Keep the existing public wrappers temporarily, but make them create one analysis and delegate to the analysis-based functions.
- [ ] Re-run protected-group tests and confirm the overlap and bomb-fragment invariants pass.

### Task 2: Enforce Room Turn and Lead Invariants

**Files:**
- Modify: `src/game/room.ts`
- Modify: `tests/game/room.test.ts`

**Interfaces:**
- Produces: `normalizeActiveSeat(room)` and distinct internal errors for empty-seat state versus candidate failure.

```ts
function normalizeActiveSeat(room: RoomState): void {
  if (room.status !== "playing") return;
  if (room.hands[room.currentTurn].length > 0 && !room.finishOrder.includes(room.currentTurn)) return;
  room.currentTurn = nextPlayableSeat(room, room.currentTurn);
  room.trick.leadSeat = room.currentTurn;
}
```

- [ ] Add a failing test where the trick winner has just gone out and assert the next lead belongs to the correct live partner or next playable seat.
- [ ] Add a failing test where `currentTurn` points to a finished AI and assert `runAiStep` advances to a non-empty seat without building a plan for the finished seat.
- [ ] Add a failing test asserting every trick reset produces `room.hands[room.currentTurn].length > 0` while status is `playing`.
- [ ] Run the focused room tests and verify the current invalid active-seat path is reproduced.
- [ ] Call `normalizeActiveSeat` before `ensureAiPlanForSeat`, after trick reset, and after finish-order changes.
- [ ] Replace the misleading error with separate diagnostics:

```ts
if (hand.length === 0) throw new Error("AI_ACTIVE_SEAT_EMPTY");
if (fallbackGroup === undefined) throw new Error("AI_NON_EMPTY_HAND_HAS_NO_LEGAL_LEAD");
```

- [ ] Keep `selectSafeAiLeadFallback`, but make it consume a `HandAnalysis` and assert the non-empty-hand invariant rather than choosing a raw card.
- [ ] Re-run room tests and verify no finished seat receives a lead.

### Task 3: Remove Repeated Hot-Path Enumeration

**Files:**
- Modify: `src/game/ai.ts`
- Modify: `src/game/protectedGroups.ts`
- Modify: `tests/game/ai.test.ts`
- Modify: `tests/game/protectedGroups.test.ts`

**Interfaces:**
- Extend `AiDecisionInput` with one optional precomputed analysis.

```ts
export type AiDecisionInput = {
  // existing fields
  analysis?: HandAnalysis;
};
```

- [ ] Add instrumentation tests using an injected `detectGroups` counter or analysis factory spy. One lead decision must analyze the full hand once and must not re-analyze it once per candidate.
- [ ] Run the focused test and confirm the current implementation exceeds the allowed analysis count.
- [ ] In `runAiStep`, create one analysis after seat normalization and pass it to `chooseAiAction`.
- [ ] Refactor `legalLeadActions`, `legalFollowActions`, `mandatoryLeadFallback`, and final protected-group assertion to consume `input.analysis`.
- [ ] Replace repeated calls in the lead fallback:

```ts
const allGroups = analysis.allGroups;
const fallback = analysis.accepted
  .map((candidate) => candidate.group)
  .filter((group) => leadType(group) !== undefined)
  .sort(compareSafeLeadCost(input.gameRank))[0];
```

- [ ] Change recovery annotation to compute features only for pruned actions and cache each remaining-hand analysis by remaining card ID key.
- [ ] Ensure `annotateLeadRecoveryFeatures` does not call both `detectGroups` and `nonOverlappingRemainingGroups` independently for the same remaining hand.
- [ ] Re-run AI and protection tests and confirm one analysis is shared through each decision.

### Task 4: Preserve Residual Plans Instead of Replanning Every Turn

**Files:**
- Create: `src/game/aiPlan.ts`
- Modify: `src/game/room.ts`
- Modify: `tests/game/room.test.ts`
- Create: `tests/game/aiPlan.test.ts`

**Interfaces:**
- Move planning responsibility out of `room.ts` and produce residual-plan helpers.

```ts
export type AiHandPlan = {
  handKey: string;
  groups: CardGroup[];
  score: number;
};

export function buildAiHandPlan(analysis: HandAnalysis, deadlineMs: number): AiHandPlan;
export function residualPlanGroups(plan: AiHandPlan, hand: Card[]): CardGroup[];
export function residualPlanCoversHand(plan: AiHandPlan, hand: Card[]): boolean;
export function consumePlanGroup(plan: AiHandPlan, played: CardGroup, remainingHand: Card[]): AiHandPlan | undefined;
```

- [ ] Add a failing test proving that after AI plays one planned group, the residual plan still covers every remaining card exactly once and does not invoke `buildAiHandPlan` again.
- [ ] Add a failing test proving that an off-plan emergency play invalidates only that seat's plan and triggers one rebuild on its next turn.
- [ ] Run the new plan and room tests and confirm the current exact-hand `planCoversHand` condition forces a rebuild.
- [ ] Move `buildFastAiPlanGroups` and its private helpers from `room.ts` into `aiPlan.ts` without changing behavior yet.
- [ ] Replace exact original-hand equality with residual coverage:

```ts
function planCoversHand(plan: AiPlanState, hand: Card[]): boolean {
  const residual = residualPlanGroups(plan, hand);
  return coversCardsExactly(residual, hand);
}
```

- [ ] After `playCards`, remove the played group from that seat's plan when it matches; preserve the remaining groups.
- [ ] Stop `getPublicRoom` from eagerly building plans for all AI seats. Build only the active AI plan in `runAiStep`; expose already-built plans in public state without forcing missing plans.
- [ ] Re-run tests and verify room serialization no longer performs AI planning.

### Task 5: Canonicalize Wildcard Candidates and Bound Planning Work

**Files:**
- Modify: `src/engine/groups.ts`
- Modify: `src/game/aiPlan.ts`
- Modify: `tests/engine/groups.test.ts`
- Modify: `tests/game/aiPlan.test.ts`

**Interfaces:**
- Produces canonical group variants and deadline-aware bounded planning.

```ts
type PlanningBudget = {
  startedAt: number;
  deadlineMs: number;
  maxGroupsPerPattern: number;
};

function canonicalPlanningGroups(groups: CardGroup[], gameRank: GameRank): CardGroup[];
```

- [ ] Add a failing rank-2 test for a fixed 27-card hand that records the current excessive straight variants and expects canonical planning candidates to retain at most three physical realizations per logical `(type, strength, rank-window)` pattern.
- [ ] Add a failing test proving canonicalization prefers fewer wildcards, fewer protected-card overlaps, and lower control-card cost.
- [ ] Run the focused tests and confirm the unbounded Cartesian variants fail the cap.
- [ ] Keep `detectGroups` rule-complete for legality, but canonicalize only the planning input. Do not remove legal actions from the engine.
- [ ] Replace unconditional four-cover evaluation with one greedy baseline plus bounded alternative covers. Run beam search only when `cards.length <= 12`.
- [ ] Check `performance.now()` inside bounded loops and return the best complete greedy cover when the deadline is reached.
- [ ] Use budgets of 75ms for a fresh 27-card plan, 40ms for 13–18 cards, and 120ms for endgame search at 12 cards or fewer.
- [ ] Re-run engine and plan tests and verify canonical choices preserve bombs, straight flushes, wildcard cores, and same-type recovery ladders.

### Task 6: Add Deterministic Lead Selection From the Plan

**Files:**
- Modify: `src/game/ai.ts`
- Modify: `src/game/aiPlan.ts`
- Modify: `tests/game/ai.test.ts`

**Interfaces:**
- Produces a small lead ladder from the residual plan.

```ts
export type LeadPlanEntry = {
  group: CardGroup;
  leavesHigherSameTypeRecovery: boolean;
  leavesPowerRecovery: boolean;
  futureTurnCount: number;
};

export function orderedLeadPlan(plan: AiHandPlan, input: AiDecisionInput): LeadPlanEntry[];
```

- [ ] Add failing tests for low-to-high triple-with-pair, consecutive-pair, and plate ladders with higher same-type recovery retained.
- [ ] Add a failing test proving a complete bomb or straight flush is selected when it is the only legal protected lead, without creating a single-card fragment.
- [ ] Add a failing test proving immediate finish and two-turn finish override ordinary ladder ordering.
- [ ] Run focused AI tests and confirm current multi-helper lead selection does not consistently use one ordered residual plan.
- [ ] Make normal lead selection inspect only residual plan groups plus explicitly approved tactical alternatives.
- [ ] Order by hard rules first, then future turn count, recovery retention, low-to-high same-type strength, wildcard cost, and deterministic group ID.
- [ ] Keep the existing detailed scoring only as a tie-breaker among the bounded lead entries.
- [ ] Route every returned lead through the analysis-based final invariant assertion.
- [ ] Re-run AI tests and verify no lead path directly enumerates raw `hand` after analysis creation.

### Task 7: Performance Gates and End-to-End Verification

**Files:**
- Create: `tests/performance/aiHotPath.test.ts`
- Modify: `tests/game/room.test.ts`
- Modify: `src/server/api.ts`

**Interfaces:**
- Adds structured timing fields to server logs only; no API response change.

```ts
type AiTiming = {
  seat: Seat;
  handCount: number;
  analysisMs: number;
  planningMs: number;
  decisionMs: number;
  totalMs: number;
  candidateCount: number;
  planReused: boolean;
};
```

- [ ] Add deterministic benchmarks for rank-2 seeds `1..10` covering room creation, first AI lead, follow action, and residual-plan reuse.
- [ ] Set acceptance gates: room serialization performs zero planning; full-hand analysis p95 <= 250ms; fresh lead step p95 <= 500ms; reused-plan lead p95 <= 150ms; no single test action exceeds 1,000ms.
- [ ] Add end-to-end invariants for every benchmark state: non-empty active hand, non-empty legal lead set, no protected bomb fragment, and deterministic action ID on repeated input.
- [ ] Run `npm test -- --run tests/game/protectedGroups.test.ts tests/game/aiPlan.test.ts tests/game/ai.test.ts tests/game/room.test.ts tests/performance/aiHotPath.test.ts`.
- [ ] Add timing logs around analysis, planning, and decision boundaries so future 409 or latency reports identify the failing stage.
- [ ] Run `npm run build` and confirm TypeScript and production bundling pass.
- [ ] Start the API and play multiple rank-2 rooms through at least one player finish, confirming no 409, no finished-seat turn, and no protected bomb fragment.
