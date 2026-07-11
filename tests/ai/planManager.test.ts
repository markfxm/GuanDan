import { createDeck } from "../../src/engine/cards";
import { ensurePlans } from "../../src/ai/planning/planManager";

const budget = { maxPlans: 2, beamWidth: 16, timeBudgetMs: 50 };
const emptyRuntime = { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true };

it("reuses plans for an unchanged hand key and replans after a card is removed", () => {
  const hand = createDeck().slice(0, 12);
  const first = ensurePlans(emptyRuntime, hand, "10", 1, budget, "test-v1");
  const reused = ensurePlans(first, [...hand], "10", 2, budget, "test-v1");
  const replanned = ensurePlans(reused, hand.slice(1), "10", 3, budget, "test-v1");

  expect(reused).toBe(first);
  expect(replanned).not.toBe(first);
  expect(replanned.handKey).not.toBe(first.handKey);
  expect(replanned.candidatePlans[0]?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort())
    .toEqual(hand.slice(1).map((card) => card.id).sort());
});

it("replans when the active plan is invalid even if the hand key is unchanged", () => {
  const hand = createDeck().slice(0, 12);
  const first = ensurePlans(emptyRuntime, hand, "10", 1, budget, "test-v1");
  const activePlan = first.candidatePlans.find((plan) => plan.id === first.activePlanId)!;
  const invalidRuntime = {
    ...first,
    candidatePlans: first.candidatePlans.map((plan) => plan === activePlan
      ? { ...plan, metrics: { ...plan.metrics, hardViolations: 1 } }
      : plan),
  };

  const replanned = ensurePlans(invalidRuntime, [...hand], "10", 2, budget, "test-v1");

  expect(replanned).not.toBe(invalidRuntime);
  expect(replanned.candidatePlans[0]?.metrics.hardViolations).toBe(0);
});
