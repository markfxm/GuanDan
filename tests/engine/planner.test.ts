import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { generatePlans } from "../../src/engine/planner";
import { measurePlanQuality } from "../../src/engine/planQuality";

function assertCompletePartition(cards: Card[], count = 5): void {
  const plans = generatePlans(cards, "10", count);
  const expectedIds = cards.map((card) => card.id).sort();

  expect(plans.length).toBeGreaterThan(0);
  for (const plan of plans) {
    const usedIds = plan.groups.flatMap((group) => group.cards.map((card) => card.id));
    expect(usedIds).toHaveLength(cards.length);
    expect([...usedIds].sort()).toEqual(expectedIds);
    expect(new Set(usedIds).size).toBe(cards.length);
  }
}

function suitedRankCards(rank: Rank): Card[] {
  return createDeck().filter((card) => card.kind === "suited" && card.rank === rank);
}

function suited(rank: Rank, suit: Suit, copy: 1 | 2 = 1): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit && candidate.copy === copy,
  );

  if (card === undefined) {
    throw new Error(`Missing card ${suit} ${rank} #${copy}`);
  }

  return card;
}

function joker(rank: "BJ" | "SJ", copy: 1 | 2 = 1): Card {
  const card = createDeck().find(
    (candidate) => candidate.kind === "joker" && candidate.rank === rank && candidate.copy === copy,
  );

  if (card === undefined) {
    throw new Error(`Missing joker ${rank} #${copy}`);
  }

  return card;
}

it("generates complete plans that consume each card exactly once", () => {
  const hand = createDeck().slice(0, 27);
  const plans = generatePlans(hand, "10", 3);
  expect(plans.length).toBeGreaterThan(0);
  for (const plan of plans) {
    const usedIds = plan.groups.flatMap((group) => group.cards.map((card) => card.id));
    expect(usedIds).toHaveLength(27);
    expect(new Set(usedIds).size).toBe(27);
  }
});

it("returns no plans when count is zero", () => {
  const hand = createDeck().slice(0, 27);
  expect(generatePlans(hand, "10", 0)).toEqual([]);
});

it("returns no plans when count is negative", () => {
  const hand = createDeck().slice(0, 27);
  expect(generatePlans(hand, "10", -1)).toEqual([]);
});

it("caps requested plan count at available archetypes", () => {
  const hand = createDeck().slice(0, 27);
  expect(generatePlans(hand, "10", 99)).toHaveLength(5);
});

it("returns named plan archetypes", () => {
  const hand = createDeck().slice(0, 27);
  const plans = generatePlans(hand, "10", 5);
  expect(plans.map((plan) => plan.name)).toContain("均衡推荐");
});

it("creates complete partitions for an all-singles hand shape", () => {
  const deck = createDeck();
  const hand = [
    ...deck.filter((card) => card.kind === "suited" && card.suit === "spades" && card.copy === 1),
    ...deck.filter((card) => card.kind === "joker" && card.copy === 1),
  ];

  assertCompletePartition(hand);
});

it("creates complete partitions for a pair triple and bomb rich hand shape", () => {
  const hand = [
    ...suitedRankCards("A").slice(0, 2),
    ...suitedRankCards("K").slice(0, 3),
    ...suitedRankCards("Q").slice(0, 4),
    ...suitedRankCards("J").slice(0, 4),
    ...suitedRankCards("9").slice(0, 3),
    ...suitedRankCards("8").slice(0, 2),
    ...createDeck().filter((card) => card.kind === "joker").slice(0, 2),
  ];

  assertCompletePartition(hand);
});

it("creates complete partitions for a joker-bomb hand shape", () => {
  const deck = createDeck();
  const hand = [
    ...deck.filter((card) => card.kind === "joker"),
    ...deck.filter((card) => card.kind === "suited" && card.suit === "diamonds" && card.copy === 1),
  ];

  assertCompletePartition(hand);
});

it("keeps 23456 same-suit cards together as a straight flush in linked plans", () => {
  const straightFlushCards = ["6", "5", "4", "3", "2"].map((rank) => suited(rank as Rank, "spades"));
  const fillerCards = [
    suited("A", "spades"),
    suited("K", "clubs"),
    suited("Q", "diamonds"),
    suited("J", "spades"),
    suited("9", "clubs"),
  ];

  const linkedPlan = generatePlans([...straightFlushCards, ...fillerCards], "10", 4).find((plan) => plan.id === "linked");
  const straightFlush = linkedPlan?.groups.find((group) => group.type === "straight-flush");

  expect(straightFlush?.cards.map((card) => card.id).sort()).toEqual(straightFlushCards.map((card) => card.id).sort());
});

it("uses a heart-rank wildcard for a straight flush before pairing it with a small singleton", () => {
  const hand = [
    suited("10", "hearts"),
    suited("9", "spades"),
    suited("8", "spades"),
    suited("7", "spades"),
    suited("6", "spades"),
    suited("4", "clubs"),
    suited("A", "diamonds"),
    suited("K", "clubs"),
  ];

  const wildcardPlan = generatePlans(hand, "10", 5).find((plan) => plan.id === "wildcard");
  const wildcardGroup = wildcardPlan?.groups.find((group) => group.cards.some((card) => card.id === "H10-1"));

  expect(wildcardGroup?.type).toBe("straight-flush");
  expect(wildcardGroup?.cards.map((card) => card.id).sort()).toEqual(["H10-1", "S6-1", "S7-1", "S8-1", "S9-1"]);
});

it("keeps a protected wildcard bomb before using its wildcard in a straight flush", () => {
  const hand = [
    suited("2", "hearts"),
    suited("10", "spades"),
    suited("10", "clubs"),
    suited("10", "diamonds"),
    suited("Q", "diamonds"),
    suited("10", "diamonds", 2),
    suited("9", "diamonds"),
    suited("8", "diamonds"),
    suited("7", "hearts"),
    suited("6", "clubs"),
    suited("5", "diamonds"),
  ];

  const wildcardPlan = generatePlans(hand, "2", 5).find((plan) => plan.id === "wildcard");
  const wildcardGroup = wildcardPlan?.groups.find((group) => group.cards.some((card) => card.id === "H2-1"));
  const usedIds = wildcardPlan?.groups.flatMap((group) => group.cards.map((card) => card.id)) ?? [];

  expect(wildcardGroup?.type).toBe("bomb");
  expect(wildcardGroup?.cards.filter((card) => card.rank === "10")).toHaveLength(4);
  expect(usedIds.sort()).toEqual(hand.map((card) => card.id).sort());
  expect(new Set(usedIds).size).toBe(hand.length);
});

it("keeps a natural bomb intact instead of splitting it into a full-house", () => {
  const hand = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("3", "diamonds"),
    suited("6", "spades"),
    suited("6", "hearts"),
    suited("A", "spades"),
  ];

  const balancedPlan = generatePlans(hand, "10", 1)[0];
  const bomb = balancedPlan?.groups.find((group) => group.type === "bomb");
  const fullHouse = balancedPlan?.groups.find((group) => group.type === "full-house");

  expect(bomb?.cards.map((card) => card.id).sort()).toEqual(["C3-1", "D3-1", "H3-1", "S3-1"]);
  expect(fullHouse).toBeUndefined();
});

it("uses a remaining pair after a straight consumes one card from its original triple", () => {
  const hand = [
    suited("10", "spades"),
    suited("J", "clubs"),
    suited("Q", "diamonds"),
    suited("K", "spades"),
    suited("A", "clubs"),
    suited("K", "clubs"),
    suited("K", "diamonds"),
    suited("7", "spades"),
    suited("7", "clubs"),
    suited("7", "diamonds"),
  ];

  const plan = generatePlans(hand, "2", 1)[0];
  const fullHouse = plan?.groups.find((group) => group.type === "full-house");

  expect(plan?.groups.some((group) => group.type === "straight")).toBe(true);
  expect(fullHouse?.cards.filter((card) => card.rank === "K")).toHaveLength(2);
  expect(fullHouse?.cards.filter((card) => card.rank === "7")).toHaveLength(3);
});

it("keeps 778899 together as a consecutive-pairs wood board in linked plans", () => {
  const woodBoardCards = [
    suited("9", "spades"),
    suited("9", "hearts"),
    suited("8", "spades"),
    suited("8", "hearts"),
    suited("7", "spades"),
    suited("7", "hearts"),
  ];
  const fillerCards = [suited("A", "spades"), suited("K", "clubs"), suited("Q", "diamonds")];

  const linkedPlan = generatePlans([...woodBoardCards, ...fillerCards], "10", 4).find((plan) => plan.id === "linked");
  const woodBoard = linkedPlan?.groups.find((group) => group.type === "consecutive-pairs");

  expect(woodBoard?.cards.map((card) => card.id).sort()).toEqual(woodBoardCards.map((card) => card.id).sort());
});

it("keeps protected wildcard bombs in the uploaded rank-10 hand shape", () => {
  const hand = [
    suited("10", "hearts"),
    suited("10", "diamonds"),
    suited("A", "spades"),
    suited("A", "hearts"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("Q", "hearts"),
    suited("Q", "diamonds"),
    suited("J", "clubs"),
    suited("J", "hearts"),
    suited("J", "diamonds"),
    suited("9", "spades"),
    suited("9", "clubs"),
    suited("9", "diamonds"),
    suited("8", "spades"),
    suited("7", "hearts"),
    suited("7", "diamonds"),
    suited("6", "spades"),
    suited("6", "diamonds"),
    suited("5", "diamonds"),
    suited("4", "spades"),
    suited("4", "hearts"),
    suited("4", "diamonds"),
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("2", "spades"),
    suited("2", "clubs"),
  ];

  const linkedPlan = generatePlans(hand, "10", 4).find((plan) => plan.id === "linked");
  const wildcardGroup = linkedPlan?.groups.find((group) => group.cards.some((card) => card.id === "H10-1"));
  const usedIds = linkedPlan?.groups.flatMap((group) => group.cards.map((card) => card.id)) ?? [];

  expect(wildcardGroup?.type).toBe("bomb");
  expect(usedIds.sort()).toEqual(hand.map((card) => card.id).sort());
  expect(new Set(usedIds).size).toBe(hand.length);
});

it("does not leave a protected straight-flush as overlapping singles", () => {
  const hand = [
    suited("7", "spades"),
    suited("6", "spades"),
    suited("5", "spades"),
    suited("4", "spades"),
    suited("3", "spades"),
    suited("A", "clubs"),
  ];

  const linkedPlan = generatePlans(hand, "10", 4).find((plan) => plan.id === "linked");

  expect(linkedPlan?.groups.some(
    (group) =>
      group.type === "straight-flush" &&
      hasRankSet(group.cards, ["3", "4", "5", "6", "7"]) &&
      group.cards.every((card) => card.kind === "suited" && card.suit === "spades"),
  )).toBe(true);
  expect(linkedPlan?.groups.some(
    (group) => group.type === "single" && ["3", "4", "5", "6", "7"].includes(group.cards[0]?.rank ?? ""),
  )).toBe(false);
});

it("selects the strict lexicographic optimum for the screenshot hand in linked plans", () => {
  const hand = [
    joker("BJ"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("A", "diamonds"),
    suited("K", "clubs"),
    suited("K", "hearts"),
    suited("J", "clubs"),
    suited("J", "clubs", 2),
    suited("J", "hearts"),
    suited("J", "hearts", 2),
    suited("J", "diamonds"),
    suited("10", "clubs"),
    suited("10", "clubs", 2),
    suited("10", "hearts"),
    suited("9", "spades"),
    suited("8", "diamonds"),
    suited("7", "clubs"),
    suited("7", "hearts"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("5", "spades"),
    suited("5", "spades", 2),
    suited("4", "clubs"),
    suited("4", "clubs", 2),
    suited("4", "hearts"),
    suited("3", "clubs"),
  ];

  const linkedPlan = generatePlans(hand, "2", 4).find((plan) => plan.id === "linked");
  const straightRankSets = linkedPlan?.groups
    .filter((group) => group.type === "straight")
    .map((group) => group.cards.map((card) => card.rank).sort().join(","));
  const usedIds = linkedPlan?.groups.flatMap((group) => group.cards.map((card) => card.id)) ?? [];
  const quality = measurePlanQuality(hand, linkedPlan?.groups ?? [], "2");
  const lowSuitedSingles = linkedPlan?.groups
    .filter((group) => group.type === "single" && group.cards[0]?.kind === "suited")
    .map((group) => group.cards[0]?.rank)
    .filter((rank): rank is Rank => rank !== undefined && ["10", "9", "8", "7", "6", "5", "4", "3", "2"].includes(rank))
    .sort();

  expect(quality.protectedLoss).toBe(0);
  expect(quality.lowSingleCount).toBe(0);
  expect(straightRankSets?.sort()).toEqual(["3,4,5,6,7", "5,6,7,8,9"]);
  expect(lowSuitedSingles).toEqual([]);
  expect(usedIds.sort()).toEqual(hand.map((card) => card.id).sort());
  expect(new Set(usedIds).size).toBe(hand.length);
});

function rankCountsMatch(cards: Card[], expected: Partial<Record<Rank, number>>): boolean {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank as Rank, (counts.get(card.rank as Rank) ?? 0) + 1);
  }

  return Object.entries(expected).every(([rank, count]) => counts.get(rank as Rank) === count);
}

function hasRankSet(cards: Card[], ranks: Rank[]): boolean {
  const cardRanks = new Set(cards.map((card) => card.rank));
  return ranks.every((rank) => cardRanks.has(rank));
}

it("returns deterministic plan and group ordering for repeated calls", () => {
  const hand = createDeck().slice(0, 27);
  const first = generatePlans(hand, "10", 5);
  const second = generatePlans(hand, "10", 5);

  expect(
    second.map((plan) => ({
      id: plan.id,
      name: plan.name,
      groupIds: plan.groups.map((group) => group.id),
    })),
  ).toEqual(
    first.map((plan) => ({
      id: plan.id,
      name: plan.name,
      groupIds: plan.groups.map((group) => group.id),
    })),
  );
});

it("throws when a plan cannot consume every input card exactly once", () => {
  const duplicateCard = createDeck()[0];
  expect(() => generatePlans([duplicateCard, duplicateCard], "10", 1)).toThrow(
    "Plan generation failed to consume every input card exactly once.",
  );
});
