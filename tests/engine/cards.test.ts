import { createDeck, formatCard, getRankOrder, isHeartRankWild, rankStrength, type Card } from "../../src/engine/cards";

it("creates 108 physical cards with two copies of each suited card and four jokers", () => {
  const deck = createDeck();
  expect(deck).toHaveLength(108);
  expect(new Set(deck.map((card) => card.id)).size).toBe(108);
  expect(deck.filter((card) => card.kind === "joker")).toHaveLength(4);
  expect(deck.filter((card) => card.kind === "suited" && card.rank === "A" && card.suit === "spades")).toHaveLength(2);
});

it("orders rank 10 above A and below jokers", () => {
  expect(getRankOrder("10")).toEqual(["BJ", "SJ", "10", "A", "K", "Q", "J", "9", "8", "7", "6", "5", "4", "3", "2"]);
});

it("rejects unknown ranks when calculating rank strength", () => {
  expect(() => rankStrength("X" as any, "10")).toThrow(RangeError);
});

it("detects heart rank wild cards", () => {
  const card: Card = { id: "H10-1", kind: "suited", rank: "10", suit: "hearts", copy: 1 };
  expect(isHeartRankWild(card, "10")).toBe(true);
  expect(formatCard(card)).toBe("♥10#1");
});
