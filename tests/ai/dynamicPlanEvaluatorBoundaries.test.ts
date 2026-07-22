import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createDeck } from "../../src/engine/cards";
import { getDetectGroupsCallCount, resetDetectGroupsCallCount } from "../../src/engine/groups";
import { classifyPlay } from "../../src/game/playRules";
import type { HandPlan } from "../../src/ai/contracts";
import { evaluateDynamicPlan, type DynamicPlanEvaluationInput } from "../../src/ai/planning/planEvaluator";

const deck = createDeck();
const card = (id: string) => deck.find((value) => value.id === id)!;
const single = (id: string) => classifyPlay([card(id)], "10")!;

function makePlan(metrics: Partial<HandPlan["metrics"]> = {}): HandPlan {
  const group = single("S5-1");
  return {
    id: "boundary",
    groups: [group],
    metrics: {
      hardViolations: 0,
      protectionLoss: 0,
      estimatedTurns: 1,
      lowSingleCount: 0,
      retainedControl: 0,
      wildcardFlexibility: 0,
      responseCoverage: 0,
      leadFlexibility: 1,
      fallbackScore: 0,
      ...metrics,
    },
  };
}

function input(plan: HandPlan, overrides: Partial<DynamicPlanEvaluationInput> = {}): DynamicPlanEvaluationInput {
  return {
    plan,
    hand: plan.groups.flatMap((group) => group.cards),
    gameRank: "10",
    seat: 0,
    partnerSeat: 2,
    handCounts: { 0: 1, 1: 6, 2: 5, 3: 4 },
    finishOrder: [],
    powerGroupPolicyIndex: { protectedGroups: [] },
    ...overrides,
  };
}

describe("dynamic PlanEvaluator boundaries and policy risk", () => {
  it.each([
    [0, 0, 0],
    [1, 1, 15],
    [4, 1, 3.75],
    [4, 2, 7.5],
    [4, 4, 15],
  ])("normalizes protected loss (%i groups, loss %i) to %s", (protectedCount, loss, expected) => {
    const result = evaluateDynamicPlan(input(makePlan({ protectionLoss: loss }), {
      powerGroupPolicyIndex: { protectedGroups: Array.from({ length: protectedCount }, () => single("S5-1")) },
    }));
    expect(result.components.powerGroupRisk).toBe(expected);
  });

  it.each([
    { protectionLoss: 1, protectedGroups: [] },
    { protectionLoss: 5, protectedGroups: Array.from({ length: 4 }, () => single("S5-1")) },
    { protectionLoss: -1, protectedGroups: [single("S5-1")] },
    { protectionLoss: 1.5, protectedGroups: [single("S5-1")] },
    { protectionLoss: Number.NaN, protectedGroups: [single("S5-1")] },
    { protectionLoss: Number.POSITIVE_INFINITY, protectedGroups: [single("S5-1")] },
  ])("rejects invalid protection loss %#", ({ protectionLoss, protectedGroups }) => {
    expect(() => evaluateDynamicPlan(input(makePlan({ protectionLoss }), { powerGroupPolicyIndex: { protectedGroups } }))).toThrow();
  });

  it("uses the same group-count denominator regardless of group card sizes", () => {
    const resultA = evaluateDynamicPlan(input(makePlan({ protectionLoss: 1 }), {
      powerGroupPolicyIndex: { protectedGroups: [single("S5-1"), single("C5-1"), single("H5-1"), single("D5-1")] },
    }));
    const resultB = evaluateDynamicPlan(input(makePlan({ protectionLoss: 1 }), {
      powerGroupPolicyIndex: { protectedGroups: [single("S5-1"), classifyPlay([card("C5-1"), card("H5-1")], "10")!, single("D5-1"), single("S6-1")] },
    }));
    expect(resultA.components.powerGroupRisk).toBe(resultB.components.powerGroupRisk);
  });

  it("rejects non-finite and negative metric inputs instead of clamping them", () => {
    expect(() => evaluateDynamicPlan(input(makePlan({ estimatedTurns: Number.NaN })))).toThrow();
    expect(() => evaluateDynamicPlan(input(makePlan({ lowSingleCount: -1 })))).toThrow();
    expect(() => evaluateDynamicPlan(input(makePlan({ retainedControl: Number.POSITIVE_INFINITY })))).toThrow();
  });

  it("does not use response coverage or protection loss in static quality", () => {
    const first = evaluateDynamicPlan(input(makePlan({ responseCoverage: 0, protectionLoss: 0 })));
    const second = evaluateDynamicPlan(input(makePlan({ responseCoverage: 99, protectionLoss: 1 }), {
      powerGroupPolicyIndex: { protectedGroups: [single("S5-1")] },
    }));
    expect(second.staticPlanQuality).toBe(first.staticPlanQuality);
    expect(second.components.powerGroupRisk).toBeGreaterThan(first.components.powerGroupRisk);
  });

  it("does not turn hard policy flags into a P2 score penalty", () => {
    const accepted = evaluateDynamicPlan(input(makePlan({ hardViolations: 0 })));
    const flagged = evaluateDynamicPlan(input(makePlan({ hardViolations: 9 })));
    expect(flagged).toEqual(accepted);
  });

  it("uses protection loss only for powerGroupRisk", () => {
    const noLoss = evaluateDynamicPlan(input(makePlan({ protectionLoss: 0 }), {
      powerGroupPolicyIndex: { protectedGroups: Array.from({ length: 4 }, () => single("S5-1")) },
    }));
    const loss = evaluateDynamicPlan(input(makePlan({ protectionLoss: 2 }), {
      powerGroupPolicyIndex: { protectedGroups: Array.from({ length: 4 }, () => single("S5-1")) },
    }));
    expect(loss.staticPlanQuality).toBe(noLoss.staticPlanQuality);
    expect(loss.components.immediatePlayability).toBe(noLoss.components.immediatePlayability);
    expect(loss.components.tempoFit).toBe(noLoss.components.tempoFit);
    expect(loss.components.endgameFit).toBe(noLoss.components.endgameFit);
    expect(loss.components.partnerContextFit).toBe(noLoss.components.partnerContextFit);
    expect(loss.components.opponentPressureFit).toBe(noLoss.components.opponentPressureFit);
    expect(loss.components.powerGroupRisk).toBe(7.5);
  });

  it("has monotone integer pressure bands and uses finished-opponent exclusion", () => {
    const scores = [6, 4, 3, 2, 1].map((count) => evaluateDynamicPlan(input(makePlan({ responseCoverage: 1 }), {
      lastPlay: single("S5-1"),
      lastPlaySeat: 1,
      handCounts: { 0: 1, 1: count, 2: 8, 3: 8 },
    })).components.opponentPressureFit);
    for (let index = 1; index < scores.length; index += 1) expect(scores[index]).toBeGreaterThanOrEqual(scores[index - 1]!);

    const finished = evaluateDynamicPlan(input(makePlan({ responseCoverage: 1 }), {
      lastPlay: single("S5-1"),
      lastPlaySeat: 1,
      partnerSeat: 3,
      handCounts: { 0: 1, 1: 5, 2: 8, 3: 8 },
      finishOrder: [1],
    }));
    const unfinished = evaluateDynamicPlan(input(makePlan({ responseCoverage: 1 }), {
      lastPlay: single("S5-1"),
      lastPlaySeat: 1,
      partnerSeat: 3,
      handCounts: { 0: 1, 1: 5, 2: 8, 3: 8 },
      finishOrder: [],
    }));
    expect(finished.components.opponentPressureFit).not.toBe(unfinished.components.opponentPressureFit);
  });

  it("is not coupled to hidden information or planning/search modules", () => {
    const source = readFileSync("src/ai/planning/planEvaluator.ts", "utf8");
    expect(source).not.toMatch(/partnerHand|opponentsHands|hiddenInitialHand|legacy hidden|\bhands\b|\bdeck\b|softRiskUnits|HandPlanner|analyzeHand|detectGroups|PlanManager|room|benchmark/);
  });

  it("does not call group detection while evaluating", () => {
    const value = makePlan();
    resetDetectGroupsCallCount();
    evaluateDynamicPlan(input(value));
    expect(getDetectGroupsCallCount()).toBe(0);
  });
});
