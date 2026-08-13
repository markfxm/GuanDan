import { createDeck } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { createAiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { applyExecutedAction, ensurePlans } from "../../src/ai/planning/planManager";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";

const budget = { maxPlans: 2, beamWidth: 16, timeBudgetMs: 50 };
const emptyRuntime = { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true };

it("keeps diagnostics instances independent and records replan paths only when injected", () => {
  const hand = createDeck().slice(0, 12);
  const diagnostics = createAiPlanningDiagnostics();
  const other = createAiPlanningDiagnostics();

  const first = ensurePlans(emptyRuntime, hand, "10", 1, budget, "test-v1", diagnostics);
  const reused = ensurePlans(first, [...hand], "10", 2, budget, "test-v1", diagnostics);

  expect(diagnostics.ensurePlansCallCount).toBe(2);
  expect(diagnostics.fullPlanningRunCount).toBe(1);
  expect(diagnostics.pathReasons["replan-needs-replan"]).toBe(1);
  expect(diagnostics.pathReasons["reuse-valid-runtime"]).toBe(1);
  expect(diagnostics.timingMs.ensurePlans).toBeGreaterThanOrEqual(0);
  expect(other.ensurePlansCallCount).toBe(0);
  expect(reused).toBe(first);
});

it("records partial repair overlap and decision stages without changing the chosen action", () => {
  const hand = createDeck().slice(0, 12);
  const runtime = ensurePlans(emptyRuntime, hand, "10", 1, budget, "test-v1");
  const plan = runtime.candidatePlans[0]!;
  const splitGroup = plan.groups.find((group) => group.cards.length > 1)!;
  const action = classifyPlay([splitGroup.cards[0]!], "10")!;
  const handAfter = hand.filter((card) => card.id !== action.cards[0]!.id);
  const diagnostics = createAiPlanningDiagnostics();
  const partial = applyExecutedAction({ ...runtime, candidatePlans: [plan] }, hand, action, handAfter, "10", 2, budget, "test-v1", diagnostics);
  const observation = { hand, gameRank: "10" as const, seat: 1, partnerSeat: 3, playedCards: [], handCounts: { 0: 12, 1: 12, 2: 12, 3: 12 }, finishOrder: [] };
  const config = { analysisCacheSize: 64, planning: { maxPlans: 2, beamWidth: 1, timeBudgetMs: 0 }, version: "test-v1", turn: 1 };
  const plain = decideAiAction(observation, emptyRuntime, config);
  const observed = decideAiAction(observation, emptyRuntime, { ...config, diagnostics });

  expect(diagnostics.partialOverlapCount).toBe(1);
  expect(diagnostics.incrementalPartialRepairCount).toBe(1);
  expect(partial.needsReplan).toBe(false);
  expect(observed.action).toEqual(plain.action);
  expect(diagnostics.candidateCountSamples).toHaveLength(1);
  expect(diagnostics.timingMs.totalDecision).toBeGreaterThanOrEqual(0);
  expect(diagnostics.timingMs.actionGeneration).toBeGreaterThanOrEqual(0);
});

it("records pass reuse and exact plan reuse without changing the derived plan", () => {
  const hand = createDeck().slice(0, 12);
  const runtime = ensurePlans(emptyRuntime, hand, "10", 1, budget, "test-v1");
  const action = runtime.candidatePlans[0]!.groups[0]!;
  const handAfter = hand.filter((card) => !action.cards.some((played) => played.id === card.id));
  const diagnostics = createAiPlanningDiagnostics();

  const passed = applyExecutedAction(runtime, hand, undefined, hand, "10", 2, budget, "test-v1", diagnostics);
  const derived = applyExecutedAction(runtime, hand, action, handAfter, "10", 2, budget, "test-v1", diagnostics);

  expect(passed).toBe(runtime);
  expect(diagnostics.passReuseCount).toBe(1);
  expect(diagnostics.incrementalExactReuseCount).toBeGreaterThan(0);
  expect(diagnostics.exactAnyPlanMatchCount).toBeGreaterThan(0);
  expect(derived.handKey).toBe(handAfter.map((card) => card.id).sort().join("|"));
  expect(diagnostics.timingMs.exactReuse).toBeGreaterThanOrEqual(0);
});
