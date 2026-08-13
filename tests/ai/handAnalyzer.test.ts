import { createDeck, type Card } from "../../src/engine/cards";
import { analyzeHand } from "../../src/ai/analysis/handAnalyzer";
import { HandAnalysisCache } from "../../src/ai/analysis/handAnalysisCache";

it("returns deterministic static analysis for the same hand and rank", () => {
  const hand = createDeck().slice(0, 12);

  const first = analyzeHand(hand, "10");
  const second = analyzeHand([...hand].reverse(), "10");

  expect(second.handKey).toBe(first.handKey);
  expect(second.groups.map((group) => group.id)).toEqual(first.groups.map((group) => group.id));
  expect([...second.groupsByType.keys()].sort()).toEqual([...first.groupsByType.keys()].sort());
  expect(second.maximalBombs.map((group) => group.id)).toEqual(first.maximalBombs.map((group) => group.id));
});

it("caches by stable hand key and game rank only", () => {
  const hand = createDeck().slice(0, 8);
  const cache = new HandAnalysisCache(1);

  const first = cache.getOrCreate(hand, "10");
  const second = cache.getOrCreate(hand as Card[], "10");
  const otherRank = cache.getOrCreate(hand, "2");

  expect(second).toBe(first);
  expect(otherRank).not.toBe(first);
  expect(cache.size).toBe(1);
});
