import { describe, expect, it } from "vitest";
import { createDeck, type Card } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import type { CardGroup } from "../../src/engine/groups";
import type { HandPlan, PlanMetrics } from "../../src/ai/contracts";
import { evaluateDynamicPlan, type DynamicPlanEvaluationInput } from "../../src/ai/planning/planEvaluator";

const deck = createDeck();
const byId = new Map(deck.map((card) => [card.id, card]));

function card(id: string): Card {
  const value = byId.get(id);
  if (value === undefined) throw new Error(`missing fixture card ${id}`);
  return value;
}

function group(ids: string[]): CardGroup {
  const value = classifyPlay(ids.map(card), "10");
  if (value === undefined) throw new Error(`invalid fixture group ${ids.join(",")}`);
  return value;
}

const baseMetrics: PlanMetrics = {
  hardViolations: 0,
  protectionLoss: 0,
  estimatedTurns: 2,
  lowSingleCount: 1,
  retainedControl: 1,
  wildcardFlexibility: 0,
  responseCoverage: 1,
  leadFlexibility: 2,
  fallbackScore: 0,
};

function plan(id: string, groups: CardGroup[], overrides: Partial<PlanMetrics> = {}): HandPlan {
  return { id, groups, metrics: { ...baseMetrics, ...overrides } };
}

function input(value: HandPlan, overrides: Partial<DynamicPlanEvaluationInput> = {}): DynamicPlanEvaluationInput {
  const hand = value.groups.flatMap((candidate) => candidate.cards);
  return {
    plan: value,
    hand,
    gameRank: "10",
    seat: 0,
    partnerSeat: 2,
    handCounts: { 0: hand.length, 1: 6, 2: 7, 3: 4 },
    finishOrder: [],
    powerGroupPolicyIndex: { protectedGroups: [] },
    ...overrides,
  };
}

describe("pure dynamic PlanEvaluator", () => {
  it("returns only plan score fields and applies the approved static formula", () => {
    const groups = [group(["S5-1"]), group(["C4-1"])];
    const value = plan("static", groups, {
      estimatedTurns: 4,
      lowSingleCount: 2,
      retainedControl: 4,
      wildcardFlexibility: 3,
      leadFlexibility: 5,
      responseCoverage: 99,
      protectionLoss: 0,
    });

    const result = evaluateDynamicPlan(input(value));
    const expected = 10 * (1 - 4 / 20) + 8 * (1 - 2 / 2) + 8 * 1 + 6 * 1 + 8 * 1;
    expect(result.staticPlanQuality).toBe(expected);
    expect(Object.keys(result).sort()).toEqual(["components", "planId", "staticPlanQuality", "total"]);
    expect(Object.keys(result.components).sort()).toEqual([
      "endgameFit",
      "immediatePlayability",
      "opponentPressureFit",
      "partnerContextFit",
      "powerGroupRisk",
      "tempoFit",
    ]);
    expect(result).not.toHaveProperty("selectedPlanId");
    expect(result).not.toHaveProperty("requiredScoreDelta");
    expect(result).not.toHaveProperty("cooldown");
  });

  it("scores a legal lead and a legal follow at 15, while legal pass remains strategic", () => {
    const low = group(["S4-1"]);
    const high = group(["S9-1"]);
    const lead = evaluateDynamicPlan(input(plan("lead", [high])));
    const lastPlay = group(["S5-1"]);
    const follow = evaluateDynamicPlan(input(plan("follow", [high]), { lastPlay, lastPlaySeat: 1 }));
    const pass = evaluateDynamicPlan(input(plan("pass", [low]), { lastPlay, lastPlaySeat: 1 }));

    expect(lead.components.immediatePlayability).toBe(15);
    expect(follow.components.immediatePlayability).toBe(15);
    expect(pass.components.immediatePlayability).toBeGreaterThanOrEqual(5);
    expect(pass.components.immediatePlayability).toBeLessThan(15);
  });

  it("distinguishes candidate-specific endgame and lead features without rewarding fragmentation", () => {
    const hand = ["S5-1", "C5-1", "H5-1", "D5-1"];
    const compact = plan("compact", [group(hand.slice(0, 2)), group(hand.slice(2, 4))]);
    const fragmented = plan("fragmented", hand.map((id) => group([id])));
    const compactScore = evaluateDynamicPlan(input(compact));
    const fragmentedScore = evaluateDynamicPlan(input(fragmented));

    expect(compactScore.components.endgameFit).not.toBe(fragmentedScore.components.endgameFit);
    expect(compactScore.components.endgameFit).toBeGreaterThan(fragmentedScore.components.endgameFit);

    const pairPair = plan("pair-pair", [group(["S5-1", "C5-1"]), group(["S6-1", "C6-1"])]);
    const tripleSingle = plan("triple-single", [group(["S5-1", "C5-1", "H5-1"]), group(["S6-1"])]);
    const pairResult = evaluateDynamicPlan(input(pairPair));
    const tripleResult = evaluateDynamicPlan(input(tripleSingle));
    expect(pairResult.components.endgameFit).not.toBe(tripleResult.components.endgameFit);

    const reversed = evaluateDynamicPlan(input(plan("pair-pair", [...pairPair.groups].reverse())));
    expect(reversed).toEqual(pairResult);
  });

  it("uses candidate beat and response quality for pressure", () => {
    const lastPlay = group(["S5-1"]);
    const weak = evaluateDynamicPlan(input(plan("weak", [group(["S4-1"])], { responseCoverage: 0 }), { lastPlay, lastPlaySeat: 1 }));
    const strong = evaluateDynamicPlan(input(plan("strong", [group(["S9-1"])], { responseCoverage: 1 }), { lastPlay, lastPlaySeat: 1 }));
    expect(strong.components.opponentPressureFit).toBeGreaterThan(weak.components.opponentPressureFit);

    const finishedOpponent = evaluateDynamicPlan(input(plan("finished", [group(["S9-1"])], { responseCoverage: 1 }), {
      lastPlay,
      lastPlaySeat: 1,
      partnerSeat: 3,
      handCounts: { 0: 1, 1: 5, 2: 8, 3: 8 },
      finishOrder: [1],
    }));
    const unfinishedOpponent = evaluateDynamicPlan(input(plan("unfinished", [group(["S9-1"])], { responseCoverage: 1 }), {
      lastPlay,
      lastPlaySeat: 1,
      partnerSeat: 3,
      handCounts: { 0: 1, 1: 5, 2: 8, 3: 8 },
      finishOrder: [],
    }));
    expect(finishedOpponent.components.opponentPressureFit).not.toBe(unfinishedOpponent.components.opponentPressureFit);
  });

  it("prefers yield when the partner controls and takeover after the partner passes", () => {
    const lastPlay = group(["S5-1"]);
    const yieldPlan = evaluateDynamicPlan(input(plan("yield", [group(["S4-1"])]), { lastPlay, lastPlaySeat: 2 }));
    const takeoverPlan = evaluateDynamicPlan(input(plan("takeover", [group(["S9-1"])]), { lastPlay, lastPlaySeat: 2 }));
    expect(yieldPlan.components.partnerContextFit).toBeGreaterThanOrEqual(takeoverPlan.components.partnerContextFit);

    const passedYield = evaluateDynamicPlan(input(plan("passed-yield", [group(["S4-1"])]), {
      lastPlay,
      lastPlaySeat: 1,
      partnerPassedCurrentTrick: true,
    }));
    const passedTakeover = evaluateDynamicPlan(input(plan("passed-takeover", [group(["S9-1"])]), {
      lastPlay,
      lastPlaySeat: 1,
      partnerPassedCurrentTrick: true,
    }));
    expect(passedTakeover.components.partnerContextFit).toBeGreaterThan(passedYield.components.partnerContextFit);
  });

  it("keeps identical public inputs byte-stable and does not mutate the plan", () => {
    const value = plan("stable", [group(["S5-1"]), group(["C4-1"])]);
    const before = JSON.stringify(value);
    const first = evaluateDynamicPlan(input(value));
    const second = evaluateDynamicPlan(input(value));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(value)).toBe(before);
  });
});
