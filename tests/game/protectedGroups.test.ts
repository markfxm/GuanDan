import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import {
  assessProtectedGroupUse,
  buildAiCandidatePool,
  detectProtectedGroups,
  isEmergencyBombBreakAllowed,
} from "../../src/game/protectedGroups";

function suited(rank: Rank, suit: Suit, copy: 1 | 2 = 1): Card {
  const card = createDeck().find((candidate) => candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit && candidate.copy === copy);
  if (card === undefined) throw new Error("Missing card");
  return card;
}

it("keeps a four-card bomb out of normal candidates while retaining the whole bomb", () => {
  const hand = [suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds"), suited("9", "spades")];
  const pool = buildAiCandidatePool(hand, "10");

  expect(detectProtectedGroups(hand, "10").find((group) => group.type === "bomb")?.protectionLevel).toBe("HARD");
  expect(pool.normalCards.some((card) => card.rank === "6")).toBe(false);
  expect(pool.accepted.some((candidate) => candidate.group.type === "bomb" && candidate.group.cards.every((card) => card.rank === "6"))).toBe(true);
  expect(pool.accepted.some((candidate) => candidate.group.type === "single" && candidate.group.cards[0]?.rank === "6")).toBe(false);
});

it("rejects ordinary bomb fragments but permits an explicit immediate finish emergency", () => {
  const hand = [suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds")];
  const single = classifyPlay([hand[0]], "10");
  const wholeHand = classifyPlay(hand, "10");
  if (single === undefined || wholeHand === undefined) throw new Error("Expected legal groups");

  expect(assessProtectedGroupUse(single, hand, "10").rejectedByRule).toBe(true);
  expect(isEmergencyBombBreakAllowed(wholeHand, hand, "10", { allowBreakBomb: true })).toBe(true);
  expect(isEmergencyBombBreakAllowed(single, hand, "10", { allowBreakBomb: true })).toBe(false);
});

it("never forms a full-house from bomb cards while retaining each bomb as power", () => {
  const sixBomb = [suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds")];
  const kingBomb = [suited("K", "spades"), suited("K", "clubs"), suited("K", "hearts"), suited("K", "diamonds")];
  const hand = [...sixBomb, ...kingBomb, suited("2", "spades"), suited("2", "clubs"), suited("9", "spades"), suited("9", "clubs")];
  const pool = buildAiCandidatePool(hand, "10");

  expect(pool.accepted.some((candidate) => candidate.group.type === "full-house")).toBe(false);
  expect(pool.accepted.filter((candidate) => candidate.group.type === "bomb")).toHaveLength(2);
  expect(pool.rejected.some((candidate) => candidate.group.type === "triple" && candidate.group.cards.every((card) => card.rank === "6"))).toBe(true);
  expect(pool.rejected.some((candidate) => candidate.group.type === "pair" && candidate.group.cards.every((card) => card.rank === "K"))).toBe(true);
});

it("permits a five-card bomb to supply a legal straight while preserving a four-card bomb", () => {
  const fiveBomb = [
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
    suited("6", "spades", 2),
  ];
  const hand = [
    ...fiveBomb,
    suited("7", "clubs"),
    suited("8", "hearts"),
    suited("9", "diamonds"),
    suited("10", "spades"),
  ];
  const straight = classifyPlay([fiveBomb[0], hand[5], hand[6], hand[7], hand[8]], "2");
  const pair = classifyPlay([fiveBomb[0], fiveBomb[1]], "2");
  if (straight === undefined || pair === undefined) throw new Error("Expected legal groups");

  expect(detectProtectedGroups(hand, "2").find((group) => group.type === "bomb")?.protectionLevel).toBe("CONDITIONAL");
  expect(assessProtectedGroupUse(straight, hand, "2").rejectedByRule).toBe(false);
  expect(assessProtectedGroupUse(pair, hand, "2").rejectedByRule).toBe(true);
});

it("keeps a legal power action when two straight flushes overlap", () => {
  const hand = ["3", "4", "5", "6", "7", "8"].map((rank) => suited(rank as Rank, "spades"));
  const pool = buildAiCandidatePool(hand, "2");

  expect(pool.normalCards).toHaveLength(0);
  expect(pool.accepted.some((candidate) => candidate.group.type === "straight-flush")).toBe(true);
  expect(pool.accepted.some((candidate) => candidate.group.type === "single")).toBe(false);
});

it("always exposes a legal lead-capable group for a non-empty protected hand", () => {
  const hands = [
    [suited("9", "spades"), suited("9", "clubs"), suited("9", "hearts"), suited("9", "diamonds")],
    ["3", "4", "5", "6", "7", "8"].map((rank) => suited(rank as Rank, "spades")),
  ];

  for (const hand of hands) {
    expect(buildAiCandidatePool(hand, "2").accepted.length).toBeGreaterThan(0);
  }
});
