import { createDeck, type Card, type Rank } from "../../src/engine/cards";
import type { CardGroup, GroupPurpose, GroupType } from "../../src/engine/groups";
import { generatePlans, type Plan } from "../../src/engine/planner";
import { scorePlan, scorePlans } from "../../src/engine/scorer";

it("scores every component from 0 to 100 and returns explanations", () => {
  const plan = generatePlans(createDeck().slice(0, 27), "10", 1)[0];
  const scored = scorePlan(plan, "10");
  expect(scored.score).toBeGreaterThanOrEqual(0);
  expect(scored.score).toBeLessThanOrEqual(100);
  expect(scored.explanations.length).toBeGreaterThan(0);
  expect(Object.values(scored.scoreBreakdown).every((value) => value >= 0 && value <= 100)).toBe(true);
});

it("scores generated linked groups as linked tempo", () => {
  const hand = [
    cardFromDeck("A", "spades"),
    cardFromDeck("K", "hearts"),
    cardFromDeck("Q", "clubs"),
    cardFromDeck("J", "diamonds"),
    cardFromDeck("10", "spades"),
  ];

  const scored = scorePlan(generatePlans(hand, "9", 1)[0], "9");

  expect(scored.groups.some((group) => group.type === "straight")).toBe(true);
  expect(scored.scoreBreakdown.linkedTempo).toBeGreaterThan(0);
});

it("scores recovery groups as retained control and explains recovery cards", () => {
  const plan = planFixture("control", [
    groupFixture("bomb", "recovery", [cardFixture("S10-1", "10", "spades")]),
  ]);

  const scored = scorePlan(plan, "10");

  expect(scored.scoreBreakdown.controlRetained).toBeGreaterThan(0);
  expect(scored.explanations.join("")).toContain("恢复牌");
});

it("sorts scored plans by descending score", () => {
  const lowPlan = planFixture("fast", riskSingleGroups(10));
  const middlePlan = planFixture("balanced", [groupFixture("single", "tail-control")]);
  const highPlan = planFixture("control", [
    groupFixture("bomb", "recovery"),
    groupFixture("single", "tail-control"),
    groupFixture("straight", "engine", [
      cardFixture("S6-1", "6", "spades"),
      cardFixture("S7-1", "7", "spades"),
      cardFixture("S8-1", "8", "spades"),
      cardFixture("S9-1", "9", "spades"),
      cardFixture("SJ-1", "J", "spades"),
    ]),
  ]);

  const scored = scorePlans([lowPlan, highPlan, middlePlan], "10");

  expect(scored.map((plan) => plan.score)).toEqual([...scored].map((plan) => plan.score).sort((a, b) => b - a));
  expect(scored.map((plan) => plan.id)).toEqual(["control", "balanced", "fast"]);
});

it("preserves input order for equal-score plans", () => {
  const first = planFixture("balanced", [groupFixture("pair", "filler")]);
  const second = planFixture("fast", [groupFixture("pair", "filler")]);
  const third = planFixture("linked", [groupFixture("pair", "filler")]);

  const scored = scorePlans([first, second, third], "10");

  expect(scored.map((plan) => plan.id)).toEqual(["balanced", "fast", "linked"]);
});

it("omits optional recovery, wildcard, and linked explanations when those resources are absent", () => {
  const plan = planFixture("balanced", [
    groupFixture("pair", "filler", [cardFixture("S3-1", "3", "spades"), cardFixture("H3-1", "3", "hearts")]),
    groupFixture("single", "risk", [cardFixture("C4-1", "4", "clubs")]),
  ]);

  const scored = scorePlan(plan, "10");
  const explanationText = scored.explanations.join("");

  expect(scored.score).toBeGreaterThanOrEqual(0);
  expect(scored.score).toBeLessThanOrEqual(100);
  expect(explanationText).not.toContain("恢复牌");
  expect(explanationText).not.toContain("逢人配");
  expect(explanationText).not.toContain("连动评分");
});

it("clamps many risk singles and reports ordinary-single and high-hand-count risks", () => {
  const plan = planFixture("fast", riskSingleGroups(13));

  const scored = scorePlan(plan, "10");
  const riskText = scored.risks.join("");

  expect(scored.scoreBreakdown.singleRisk).toBe(0);
  expect(riskText).toContain("普通单牌");
  expect(riskText).toContain("手数偏多");
});

function planFixture(id: Plan["id"], groups: CardGroup[]): Plan {
  return {
    id,
    name: id,
    groups,
  };
}

function groupFixture(type: GroupType, purpose: GroupPurpose, cards = [cardFixture(`${type}-${purpose}`)]): CardGroup {
  return {
    id: `${type}:${purpose}:${cards.map((card) => card.id).join(",")}`,
    type,
    label: `${type} ${purpose}`,
    purpose,
    cards,
    wildcards: cards.filter((card) => card.kind === "suited" && card.suit === "hearts" && card.rank === "10"),
    strength: cards.length,
  };
}

function riskSingleGroups(count: number): CardGroup[] {
  return Array.from({ length: count }, (_, index) =>
    groupFixture("single", "risk", [cardFixture(`risk-${index}`, "3", "clubs")]),
  );
}

function cardFixture(id: string, rank: Rank = "3", suit: "spades" | "hearts" | "clubs" | "diamonds" = "spades"): Card {
  return {
    id,
    kind: "suited",
    rank,
    suit,
    copy: 1,
  };
}

function cardFromDeck(rank: Rank, suit: "spades" | "hearts" | "clubs" | "diamonds"): Card {
  const card = createDeck().find((candidate) => candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit);

  if (card === undefined) {
    throw new Error(`Missing ${suit} ${rank}`);
  }

  return card;
}
