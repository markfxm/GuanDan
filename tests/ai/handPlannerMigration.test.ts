import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { generateFastHandPlans } from "../../src/ai/planning/handPlanner";
import { generateRapidHandPlan } from "../../src/ai/planning/handPlanner";
import { analyzeHand } from "../../src/ai/analysis/handAnalyzer";
import { evaluatePowerGroupUse, isLegalBombReduction } from "../../src/ai/policy/powerGroupPolicy";
import { createRoom, getPublicRoom } from "../../src/game/room";
import { measurePlanQuality } from "../../src/engine/planQuality";
import { classifyPlay } from "../../src/game/playRules";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function suited(rank: Rank, suit: Suit, copy: 1 | 2 = 1): Card {
  const card = createDeck().find((candidate) => candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit && candidate.copy === copy);
  if (card === undefined) throw new Error("Missing fixture card");
  return card;
}

it("compares legacy room planning with deterministic fast HandPlanner without requiring identical soft plans", () => {
  const hand = [
    suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds"), suited("6", "spades", 2),
    suited("7", "clubs"), suited("8", "hearts"), suited("9", "diamonds"), suited("10", "spades"),
  ];
  const room = createRoom({ rank: "2", seed: 1 });
  room.hands[1] = hand;
  room.initialHands[1] = [...hand];
  room.aiPlans = {};
  const legacy = getPublicRoom(room, 0).aiPlans[1]?.groups ?? [];
  const first = generateFastHandPlans(hand, "2", { maxPlans: 2, beamWidth: 16, timeBudgetMs: 50 });
  const second = generateFastHandPlans(hand, "2", { maxPlans: 2, beamWidth: 16, timeBudgetMs: 50 });

  expect(first.length).toBeGreaterThan(0);
  for (const [name, groups] of [["legacy", legacy] as const, ...first.map((plan) => [plan.id, plan.groups] as const)]) {
    const ids = groups.flatMap((group) => group.cards.map((card) => card.id));
    expect(ids.sort()).toEqual(hand.map((card) => card.id).sort());
    expect(new Set(ids).size).toBe(hand.length);
    expect(measurePlanQuality(hand, groups, "2").protectedLoss, `${name}: ${groups.map((group) => group.id).join("|")}`).toBe(0);
    expect(groups.every((group) => classifyPlay(group.cards, "2")?.id === group.id)).toBe(true);
  }
  expect(second).toEqual(first);
  expect(first.some((plan) => plan.id === "fast-greedy")).toBe(true);
  expect(first.some((plan) => plan.id === "fast-beam")).toBe(true);

  const analysis = analyzeHand(hand, "2");
  expect(generateRapidHandPlan(analysis, { maxPlans: 1, beamWidth: 1, timeBudgetMs: 0 })).toBeDefined();
  const fallback = generateFastHandPlans(hand, "2", { maxPlans: 2, beamWidth: 16, timeBudgetMs: 0 });
  expect(fallback.map((plan) => plan.id)).toEqual(["fast-greedy"]);

  const sourceBomb = analysis.maximalBombs[0];
  const straight = analysis.groups.find((group) => group.type === "straight" && sourceBomb !== undefined && group.cards.some((card) => sourceBomb.cards.some((bombCard) => bombCard.id === card.id)));
  expect(sourceBomb).toBeDefined();
  expect(straight).toBeDefined();
  expect(isLegalBombReduction(sourceBomb!, straight!, analysis.groups, "2")).toBe(true);
  expect(evaluatePowerGroupUse(straight!, hand, analysis.groups, "2").allowed).toBe(true);
});

it("does not depend on room private planning functions", () => {
  const source = readFileSync(resolve(process.cwd(), "src/ai/planning/handPlanner.ts"), "utf8");
  expect(source).not.toContain('from "../../game/room"');
  expect(source).not.toContain("buildFastAiPlanGroups");
  expect(source).not.toContain("buildBeamAiCover");
});
