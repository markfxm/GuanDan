import { describe, expect, it } from "vitest";
import { createDeck } from "../../src/engine/cards";
import { createPlannerExpansionObserver, generatePlans } from "../../src/engine/planner";

const hand = createDeck().slice(0, 8);

describe("D1 planner expansion-budget study instrumentation", () => {
  it("defines deterministic expansion boundaries without wall-clock stopping", () => {
    const observer = createPlannerExpansionObserver(0);
    const plans = generatePlans(hand, "10", 5, observer);
    expect(plans).toEqual([]);
    expect(observer.stats.expandedStates).toBe(0);
    expect(observer.stats.terminationReasons["budget-exhausted"]).toBeGreaterThan(0);
  });

  it("does not count duplicate memo states as expanded states", () => {
    const observer = createPlannerExpansionObserver(32);
    generatePlans(hand, "10", 5, observer);
    expect(observer.stats.expandedStates).toBeLessThanOrEqual(32);
    expect(observer.stats.generatedChildren).toBeGreaterThanOrEqual(observer.stats.acceptedChildren);
  });

  it("is byte-stable for repeated runs and hand permutations", () => {
    const run = (cards: typeof hand) => {
      const observer = createPlannerExpansionObserver(64);
      const plans = generatePlans(cards, "10", 5, observer);
      return { plans, stats: observer.stats };
    };
    const first = run(hand);
    const second = run([...hand].reverse());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("exposes at least two complete structural alternatives in the curated multi-solution hand", () => {
    const ids = ["HA-2", "D5-2", "S3-1", "D6-2", "C7-1", "CK-2", "C10-2", "S2-1", "SK-1", "SA-2", "S6-2", "HK-1", "S8-1", "CA-1"];
    const curated = ids.map((id) => createDeck().find((card) => card.id === id)!);
    const observer = createPlannerExpansionObserver(512);
    const plans = generatePlans(curated, "2", 5, observer);
    const fingerprints = new Set(plans.map((plan) => plan.groups.map((group) => group.id).sort().join("|")));
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(fingerprints.size).toBeGreaterThanOrEqual(2);
    expect(observer.stats.expandedStates).toBeLessThanOrEqual(512);
  });

  it("keeps expansion counts independent of elapsed time", () => {
    const run = () => {
      const observer = createPlannerExpansionObserver(32);
      generatePlans(hand, "10", 5, observer);
      return observer.stats;
    };
    expect(run()).toEqual(run());
  });
});
