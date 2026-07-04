import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { detectGroups, type GroupPurpose } from "../../src/engine/groups";

function take(predicate: (card: Card) => boolean, count: number): Card[] {
  return createDeck().filter(predicate).slice(0, count);
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

it("detects same-rank bombs", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "A", 4);
  const groups = detectGroups(cards, "10");
  expect(groups.some((group) => group.type === "bomb" && group.cards.length === 4)).toBe(true);
});

it("uses a heart-rank wildcard to upgrade a four-card bomb into a five-card bomb", () => {
  const wildcard = suited("2", "hearts");
  const cards = [
    suited("5", "spades"),
    suited("5", "clubs"),
    suited("5", "hearts"),
    suited("5", "diamonds"),
    wildcard,
  ];

  const bomb = detectGroups(cards, "2").find((group) => group.type === "bomb" && group.cards.length === 5);

  expect(bomb?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
  expect(bomb?.wildcards).toContain(wildcard);
});

it("detects joker bomb with four jokers", () => {
  const cards = createDeck().filter((card) => card.kind === "joker");
  const groups = detectGroups(cards, "10");
  expect(groups.some((group) => group.type === "joker-bomb")).toBe(true);
});

it("detects a pair from two small jokers", () => {
  const cards = take((card) => card.kind === "joker" && card.rank === "SJ", 2);
  const groups = detectGroups(cards, "10");

  const pair = groups.find((group) => group.type === "pair");

  expect(pair?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
});

it("detects pairs and singles", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "K", 2);
  const groups = detectGroups(cards, "10");
  expect(groups.some((group) => group.type === "pair")).toBe(true);
  expect(groups.filter((group) => group.type === "single")).toHaveLength(2);
});

it("detects natural straights from five consecutive mixed ranks", () => {
  const cards = [
    suited("A", "spades"),
    suited("K", "hearts"),
    suited("Q", "clubs"),
    suited("J", "diamonds"),
    suited("10", "spades"),
  ];

  const straight = detectGroups(cards, "9").find((group) => group.type === "straight");

  expect(straight?.purpose satisfies GroupPurpose | undefined).toBe("engine");
  expect(straight?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
});

it("detects A2345 as a low straight", () => {
  const cards = [
    suited("A", "spades"),
    suited("5", "diamonds"),
    suited("4", "clubs"),
    suited("3", "hearts"),
    suited("2", "spades"),
  ];

  const straight = detectGroups(cards, "10").find((group) => group.type === "straight");

  expect(straight?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
  expect(straight?.strength).toBeLessThan(
    detectGroups(["6", "5", "4", "3", "2"].map((rank) => suited(rank as Rank, "spades")), "10").find(
      (group) => group.type === "straight",
    )?.strength ?? 0,
  );
});

it("detects natural straight flushes from five consecutive same-suit ranks", () => {
  const cards = ["A", "K", "Q", "J", "10"].map((rank) => suited(rank as Rank, "spades"));

  const straightFlush = detectGroups(cards, "9").find((group) => group.type === "straight-flush");
  const straight = detectGroups(cards, "9").find((group) => group.type === "straight");

  expect(straightFlush?.purpose satisfies GroupPurpose | undefined).toBe("attack");
  expect(straightFlush?.strength).toBeGreaterThan(straight?.strength ?? 0);
  expect(straightFlush?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
});

it("detects A2345 as a low straight flush", () => {
  const cards = ["A", "5", "4", "3", "2"].map((rank) => suited(rank as Rank, "diamonds"));

  const straightFlush = detectGroups(cards, "10").find((group) => group.type === "straight-flush");

  expect(straightFlush?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
});

it("detects consecutive pairs from three consecutive pairs", () => {
  const cards = [
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("Q", "spades"),
    suited("Q", "clubs"),
  ];

  const group = detectGroups(cards, "10").find((candidate) => candidate.type === "consecutive-pairs");

  expect(group?.purpose satisfies GroupPurpose | undefined).toBe("engine");
  expect(group?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
});

it("detects plates from two consecutive triples", () => {
  const cards = [
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("K", "diamonds"),
  ];

  const plate = detectGroups(cards, "10").find((group) => group.type === "plate");

  expect(plate?.purpose satisfies GroupPurpose | undefined).toBe("engine");
  expect(plate?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
});

it("detects full houses from a triple plus pair", () => {
  const cards = [
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("K", "spades"),
    suited("K", "clubs"),
  ];

  const fullHouse = detectGroups(cards, "10").find((group) => group.type === "full-house");

  expect(fullHouse?.purpose satisfies GroupPurpose | undefined).toBe("engine");
  expect(fullHouse?.cards.map((card) => card.id).sort()).toEqual(cards.map((card) => card.id).sort());
});

it.each([
  ["pair", 1],
  ["triple", 2],
  ["bomb", 3],
] as const)("uses a heart-rank wildcard to complete a %s", (type, naturalCount) => {
  const wildcard = suited("10", "hearts");
  const cards = [
    ...[suited("A", "spades"), suited("A", "clubs"), suited("A", "diamonds")].slice(0, naturalCount),
    wildcard,
  ];

  const group = detectGroups(cards, "10").find((candidate) => candidate.type === type);

  expect(group?.cards).toContain(wildcard);
  expect(group?.wildcards).toContain(wildcard);
});

it("uses a heart-rank wildcard to complete a straight gap", () => {
  const wildcard = suited("9", "hearts");
  const cards = [suited("A", "spades"), suited("K", "clubs"), suited("J", "diamonds"), suited("10", "spades"), wildcard];

  const straight = detectGroups(cards, "9").find((group) => group.type === "straight");

  expect(straight?.cards).toContain(wildcard);
  expect(straight?.wildcards).toContain(wildcard);
});

it("uses a heart-rank wildcard to complete a straight-flush gap", () => {
  const wildcard = suited("9", "hearts");
  const cards = [suited("A", "spades"), suited("K", "spades"), suited("J", "spades"), suited("10", "spades"), wildcard];

  const straightFlush = detectGroups(cards, "9").find((group) => group.type === "straight-flush");

  expect(straightFlush?.cards).toContain(wildcard);
  expect(straightFlush?.wildcards).toContain(wildcard);
});

it("gives bombs recovery purpose and strength above pairs of the same rank", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "A", 4);
  const groups = detectGroups(cards, "10");
  const bomb = groups.find((group) => group.type === "bomb");
  const pair = groups.find((group) => group.type === "pair");

  expect(bomb?.purpose satisfies GroupPurpose | undefined).toBe("recovery");
  expect(bomb?.strength).toBeGreaterThan(pair?.strength ?? Number.POSITIVE_INFINITY);
});

it("gives joker bombs recovery purpose and fixed top strength", () => {
  const cards = createDeck().filter((card) => card.kind === "joker");
  const jokerBomb = detectGroups(cards, "10").find((group) => group.type === "joker-bomb");

  expect(jokerBomb?.purpose satisfies GroupPurpose | undefined).toBe("recovery");
  expect(jokerBomb?.strength).toBe(1000);
});

it("classifies joker singles as tail control", () => {
  const cards = take((card) => card.kind === "joker" && card.rank === "BJ", 1);
  const single = detectGroups(cards, "10").find((group) => group.type === "single");

  expect(single?.purpose satisfies GroupPurpose | undefined).toBe("tail-control");
});

it("classifies ordinary low singles as risk", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "5", 1);
  const single = detectGroups(cards, "10").find((group) => group.type === "single");

  expect(single?.purpose satisfies GroupPurpose | undefined).toBe("risk");
});

it("keeps group ids stable for the same physical cards in reversed order", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "K", 2);
  const forwardPair = detectGroups(cards, "10").find((group) => group.type === "pair");
  const reversedPair = detectGroups([...cards].reverse(), "10").find((group) => group.type === "pair");

  expect(forwardPair?.id).toBe(reversedPair?.id);
});

it("includes heart rank cards in group wildcards", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "10", 4);
  const bomb = detectGroups(cards, "10").find((group) => group.type === "bomb");
  const heartRank = cards.find((card) => card.kind === "suited" && card.suit === "hearts");

  expect(bomb?.wildcards).toContain(heartRank);
});
