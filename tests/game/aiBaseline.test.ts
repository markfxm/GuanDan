import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { generatePlans } from "../../src/engine/planner";
import { chooseAiAction } from "../../src/game/ai";
import { canBeatPlay, classifyPlay } from "../../src/game/playRules";
import { assessProtectedGroupUse, buildAiCandidatePool } from "../../src/game/protectedGroups";

function suited(rank: Rank, suit: Suit, copy: 1 | 2 = 1): Card {
  const card = createDeck().find((candidate) =>
    candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit && candidate.copy === copy,
  );
  if (card === undefined) throw new Error(`Missing ${rank} ${suit} ${copy}`);
  return card;
}

function joker(rank: "SJ" | "BJ", copy: 1 | 2 = 1): Card {
  const card = createDeck().find((candidate) => candidate.kind === "joker" && candidate.rank === rank && candidate.copy === copy);
  if (card === undefined) throw new Error(`Missing ${rank} ${copy}`);
  return card;
}

it("baseline: a non-empty lead never passes", () => {
  const action = chooseAiAction({ hand: [suited("7", "spades")], gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id) : []).toEqual(["S7-1"]);
});

it("baseline: an AI follow play is legal against the current trick", () => {
  const lastPlay = classifyPlay([suited("5", "spades")], "10");
  if (lastPlay === undefined) throw new Error("Expected a legal single");
  const action = chooseAiAction({
    hand: [suited("7", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" && canBeatPlay(action.group, lastPlay, "10")).toBe(true);
});

it("baseline: partner control yields a pass", () => {
  const lastPlay = classifyPlay([suited("7", "spades"), suited("7", "clubs")], "10");
  if (lastPlay === undefined) throw new Error("Expected a legal single");
  const action = chooseAiAction({
    hand: [suited("8", "spades"), suited("8", "clubs"), suited("A", "clubs")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 3,
    context: { ownHandCount: 3, partnerHandCount: 5, opponentHandCounts: [9, 10], playedCards: [], finishOrder: [] },
  });

  expect(action).toEqual({ type: "pass" });
});

it("baseline: a one-card opponent is blocked when a legal response exists", () => {
  const lastPlay = classifyPlay([suited("K", "spades")], "10");
  if (lastPlay === undefined) throw new Error("Expected a legal single");
  const action = chooseAiAction({
    hand: [suited("A", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
    context: { ownHandCount: 1, partnerHandCount: 8, opponentHandCounts: [1, 9], playedCards: [], finishOrder: [] },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" && canBeatPlay(action.group, lastPlay, "10")).toBe(true);
});

it("baseline: bombs, straight flushes, and joker bombs remain protected power candidates", () => {
  const bomb = [suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds")];
  const straightFlush = ["3", "4", "5", "6", "7"].map((rank) => suited(rank as Rank, "spades"));
  const jokerBomb = [joker("SJ"), joker("SJ", 2), joker("BJ"), joker("BJ", 2)];

  for (const hand of [bomb, straightFlush, jokerBomb]) {
    const pool = buildAiCandidatePool(hand, "10");
    expect(pool.accepted.some((candidate) => candidate.group.cards.length === hand.length)).toBe(true);
  }

  expect(buildAiCandidatePool(bomb, "10").normalCards).toHaveLength(0);
  expect(buildAiCandidatePool(straightFlush, "10").normalCards).toHaveLength(0);
});

it("baseline: a legal five-bomb straight reduction is accepted", () => {
  const bomb = [
    suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds"), suited("6", "spades", 2),
  ];
  const hand = [...bomb, suited("7", "clubs"), suited("8", "hearts"), suited("9", "diamonds"), suited("10", "spades")];
  const straight = classifyPlay([bomb[0], hand[5], hand[6], hand[7], hand[8]], "2");
  if (straight === undefined) throw new Error("Expected a legal straight");

  expect(assessProtectedGroupUse(straight, hand, "2").rejectedByRule).toBe(false);
});

it("baseline: generated plans cover every physical card exactly once", () => {
  const hand = createDeck().slice(0, 12);
  const plans = generatePlans(hand, "10", 5);

  for (const plan of plans) {
    const used = plan.groups.flatMap((group) => group.cards.map((card) => card.id));
    expect([...used].sort()).toEqual(hand.map((card) => card.id).sort());
    expect(new Set(used).size).toBe(hand.length);
  }
});

it("baseline: identical decision input is deterministic", () => {
  const input = {
    hand: [suited("7", "spades"), suited("7", "clubs"), suited("9", "spades"), suited("A", "diamonds")],
    gameRank: "10" as const,
    seat: 1,
    partnerSeat: 3,
  };

  const first = chooseAiAction(input);
  const second = chooseAiAction(input);

  expect(second).toEqual(first);
});
