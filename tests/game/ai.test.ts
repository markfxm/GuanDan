import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { chooseAiAction, chooseFollowAction, chooseLeadAction, classifyAiRole } from "../helpers/legacyAiReference";

function suited(rank: Rank, suit: Suit, copy: 1 | 2 = 1): Card {
  const card = createDeck().find(
    (candidate) => candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit && candidate.copy === copy,
  );
  if (card === undefined) {
    throw new Error(`Missing ${suit} ${rank}`);
  }
  return card;
}

function joker(rank: "BJ" | "SJ", copy: 1 | 2 = 1): Card {
  const card = createDeck().find((candidate) => candidate.kind === "joker" && candidate.rank === rank && candidate.copy === copy);
  if (card === undefined) {
    throw new Error(`Missing ${rank}`);
  }
  return card;
}

it("chooseLeadAction prefers a low pair over a low single in early phase", () => {
  const hand = [
    suited("3", "spades"),
    suited("4", "clubs"),
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("A", "spades"),
    suited("K", "diamonds"),
  ];

  const action = chooseLeadAction({
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: 20,
      partnerHandCount: 20,
      opponentHandCounts: [20, 20],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action?.type).toBe("PAIR");
  expect(action?.cards.every((card) => card.rank === "6")).toBe(true);
});

it("chooseLeadAction opens 77733 while preserving higher triple-with-pair recovery actions", () => {
  const hand = [
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("J", "spades"),
    suited("J", "clubs"),
    suited("J", "diamonds"),
    suited("7", "spades"),
    suited("7", "clubs"),
    suited("7", "diamonds"),
    suited("10", "spades"),
    suited("10", "clubs"),
    suited("5", "spades"),
    suited("5", "clubs"),
    suited("3", "spades"),
    suited("3", "clubs"),
  ];
  const lowTripleWithPair = classifyPlay(
    [suited("7", "spades"), suited("7", "clubs"), suited("7", "diamonds"), suited("3", "spades"), suited("3", "clubs")],
    "2",
  );
  const middleTripleWithPair = classifyPlay(
    [suited("J", "spades"), suited("J", "clubs"), suited("J", "diamonds"), suited("10", "spades"), suited("10", "clubs")],
    "2",
  );
  const highTripleWithPair = classifyPlay(
    [suited("A", "spades"), suited("A", "clubs"), suited("A", "diamonds"), suited("5", "spades"), suited("5", "clubs")],
    "2",
  );

  const action = chooseLeadAction({
    hand,
    plannedGroups: [lowTripleWithPair, middleTripleWithPair, highTripleWithPair].filter(
      (group): group is NonNullable<typeof group> => group !== undefined,
    ),
    gameRank: "2",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: 20,
      partnerHandCount: 20,
      opponentHandCounts: [20, 20],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action?.type).toBe("TRIPLE_WITH_PAIR");
  expect(action?.cards.filter((card) => card.rank === "7")).toHaveLength(3);
  expect(action?.cards.filter((card) => card.rank === "3")).toHaveLength(2);
});

it("chooseLeadAction avoids an isolated early straight without recovery", () => {
  const hand = [
    suited("7", "spades"),
    suited("6", "clubs"),
    suited("5", "diamonds"),
    suited("4", "spades"),
    suited("3", "clubs"),
    suited("9", "spades"),
    suited("9", "clubs"),
  ];

  const action = chooseLeadAction({
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: 18,
      partnerHandCount: 19,
      opponentHandCounts: [18, 19],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action?.type).toBe("PAIR");
});

it("chooseLeadAction avoids feeding a dangerous opponent pair in late phase", () => {
  const hand = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("6", "diamonds"),
    suited("7", "spades"),
    suited("8", "clubs"),
  ];

  const action = chooseLeadAction({
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: 5,
      partnerHandCount: 8,
      opponentHandCounts: [2, 9],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action?.type).not.toBe("PAIR");
});

it("chooseLeadAction keeps a strong tail when it can finish in two hands", () => {
  const lowPair = classifyPlay([suited("3", "spades"), suited("3", "clubs")], "10");
  const acePair = classifyPlay([suited("A", "spades"), suited("A", "clubs")], "10");
  const hand = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("A", "spades"),
    suited("A", "clubs"),
  ];

  const action = chooseLeadAction({
    hand,
    plannedGroups: [lowPair, acePair].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: 4,
      partnerHandCount: 8,
      opponentHandCounts: [7, 8],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action?.type).toBe("PAIR");
  expect(action?.cards.every((card) => card.rank === "3")).toBe(true);
});

it("chooseLeadAction helps a nearly finished partner with a likely receivable type", () => {
  const hand = [
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("7", "diamonds"),
    suited("8", "clubs"),
    suited("J", "spades"),
  ];

  const action = chooseLeadAction({
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: 5,
      partnerHandCount: 2,
      opponentHandCounts: [7, 8],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action?.type).toBe("PAIR");
});

it("chooseLeadAction does not lead a bomb when ordinary routes remain", () => {
  const bomb = classifyPlay([suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds")], "10");
  const pair = classifyPlay([suited("8", "spades"), suited("8", "clubs")], "10");
  const hand = [
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
    suited("8", "spades"),
    suited("8", "clubs"),
  ];

  const action = chooseLeadAction({
    hand,
    plannedGroups: [bomb, pair].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: 6,
      partnerHandCount: 8,
      opponentHandCounts: [7, 8],
      playedCards: [],
      finishOrder: [],
    },
  });

expect(action?.type).toBe("PAIR");
}
);

it("leads a loose small single before spending a small-joker pair when a bomb can recover control", () => {
  const smallJokerPair = classifyPlay([joker("SJ"), joker("SJ", 2)], "2");
  const kingBomb = classifyPlay([suited("K", "spades"), suited("K", "clubs"), suited("K", "hearts"), suited("K", "diamonds")], "2");
  const hand = [
    joker("SJ"),
    joker("SJ", 2),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("K", "hearts"),
    suited("K", "diamonds"),
    suited("A", "clubs"),
    suited("10", "spades"),
    suited("4", "hearts"),
    suited("3", "spades"),
  ];

  const action = chooseAiAction({
    hand,
    plannedGroups: [smallJokerPair, kingBomb].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 1,
    partnerSeat: 3,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 12,
      opponentHandCounts: [10, 11],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.rank : undefined).toBe("3");
});

it("leads with a linked group from planner output", () => {
  const hand = [
    suited("9", "spades"),
    suited("9", "clubs"),
    suited("8", "spades"),
    suited("8", "clubs"),
    suited("7", "spades"),
    suited("7", "clubs"),
    suited("A", "spades"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("consecutive-pairs");
});

it("classifies a scarce-control hand as support", () => {
  const hand = [
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
    suited("8", "spades"),
    suited("7", "clubs"),
    suited("5", "diamonds"),
  ];

  expect(classifyAiRole(hand, "10")).toBe("support");
});

it("classifies a hand with at least three bombs as attacker", () => {
  const hand = [
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("4", "hearts"),
    suited("4", "diamonds"),
    suited("5", "spades"),
    suited("5", "clubs"),
    suited("5", "hearts"),
    suited("5", "diamonds"),
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
  ];

  expect(classifyAiRole(hand, "10")).toBe("attacker");
});

it("classifies a hand with multiple single and pair controls as attacker", () => {
  const hand = [
    joker("BJ"),
    joker("SJ"),
    suited("10", "spades"),
    suited("10", "clubs"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("6", "diamonds"),
  ];

  expect(classifyAiRole(hand, "10")).toBe("attacker");
});

it("leads a small pair when a high pair can take the pair type back", () => {
  const hand = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("7", "diamonds"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id).sort() : []).toEqual(["C3-1", "S3-1"]);
});

it("leads a small full-house when a high full-house can take the type back", () => {
  const hand = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("K", "spades"),
    suited("K", "clubs"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["3", "3", "3", "4", "4"]);
});

it("leads a full-house with the lowest available pair kicker", () => {
  const hand = [
    suited("4", "clubs"),
    suited("4", "diamonds"),
    suited("4", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("8", "clubs"),
    suited("8", "diamonds"),
    suited("10", "spades"),
    suited("10", "diamonds"),
    suited("K", "spades"),
    suited("2", "diamonds"),
  ];
  const plannedFullHouse = classifyPlay([suited("4", "clubs"), suited("4", "diamonds"), suited("4", "spades"), suited("3", "clubs"), suited("3", "hearts")], "2");

  const action = chooseAiAction({ hand, plannedGroups: plannedFullHouse === undefined ? [] : [plannedFullHouse], gameRank: "2", seat: 2, partnerSeat: 0 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["3", "3", "4", "4", "4"]);
});

it("regroups a tail full-house before following stale split planned groups", () => {
  const hand = [
    suited("A", "spades"),
    suited("A", "hearts"),
    suited("A", "hearts", 2),
    suited("K", "hearts"),
    suited("K", "hearts", 2),
    suited("4", "spades"),
    suited("4", "spades", 2),
    suited("4", "clubs"),
    suited("4", "clubs", 2),
    suited("4", "hearts"),
    suited("4", "diamonds"),
  ];
  const staleAcePair = classifyPlay([suited("A", "spades"), suited("A", "hearts")], "2");
  const staleAceSingle = classifyPlay([suited("A", "hearts", 2)], "2");
  const staleKingSingle = classifyPlay([suited("K", "hearts")], "2");
  const staleKingSingle2 = classifyPlay([suited("K", "hearts", 2)], "2");
  const bomb = classifyPlay([
    suited("4", "spades"),
    suited("4", "spades", 2),
    suited("4", "clubs"),
    suited("4", "clubs", 2),
    suited("4", "hearts"),
    suited("4", "diamonds"),
  ], "2");

  const action = chooseAiAction({
    hand,
    plannedGroups: [staleAcePair, staleAceSingle, staleKingSingle, staleKingSingle2, bomb].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 9,
      opponentHandCounts: [8, 9],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["A", "A", "A", "K", "K"]);
});

it("does not break a made straight into low singles when a big joker can take singles back", () => {
  const hand = [
    joker("BJ"),
    suited("7", "spades"),
    suited("6", "clubs"),
    suited("5", "diamonds"),
    suited("4", "spades"),
    suited("3", "clubs"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("straight");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["3", "4", "5", "6", "7"]);
});

it("attacker AI leads a small single when high single control can take it back", () => {
  const hand = [
    joker("BJ"),
    joker("SJ"),
    suited("10", "spades"),
    suited("7", "spades"),
    suited("6", "clubs"),
    suited("5", "diamonds"),
    suited("3", "clubs"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(classifyAiRole(hand, "10")).toBe("attacker");
  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("C3-1");
});

it("keeps a made straight intact instead of leading its smallest single", () => {
  const hand = [
    suited("2", "clubs"),
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("Q", "hearts"),
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("A", "diamonds"),
    suited("9", "diamonds"),
    suited("8", "diamonds"),
    suited("7", "hearts"),
    suited("6", "clubs"),
    suited("5", "diamonds"),
    suited("3", "clubs"),
  ];

  const action = chooseAiAction({ hand, gameRank: "2", seat: 2, partnerSeat: 0 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("straight");
});

it("leads a weak low single instead of an unsupported wildcard straight-flush", () => {
  const hand = [
    suited("2", "hearts"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("K", "spades"),
    suited("K", "diamonds"),
    suited("K", "diamonds", 2),
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("J", "spades"),
    suited("J", "clubs"),
    suited("10", "spades"),
    suited("10", "spades", 2),
    suited("10", "clubs"),
    suited("10", "hearts"),
    suited("9", "clubs"),
    suited("7", "diamonds"),
    suited("7", "diamonds", 2),
    suited("6", "spades"),
    suited("6", "spades", 2),
    suited("6", "clubs"),
    suited("6", "clubs", 2),
    suited("5", "clubs"),
    suited("4", "spades"),
    suited("4", "hearts"),
    suited("4", "diamonds"),
    suited("4", "diamonds", 2),
  ];

  const action = chooseAiAction({ hand, gameRank: "2", seat: 3, partnerSeat: 1 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("C5-1");
});

it("does not break a made bomb into a weak full-house lead", () => {
  const hand = [
    suited("2", "hearts"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("K", "spades"),
    suited("K", "diamonds"),
    suited("K", "diamonds", 2),
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("J", "spades"),
    suited("J", "clubs"),
    suited("10", "spades"),
    suited("10", "spades", 2),
    suited("10", "clubs"),
    suited("10", "hearts"),
    suited("7", "diamonds"),
    suited("7", "diamonds", 2),
    suited("6", "spades"),
    suited("6", "spades", 2),
    suited("6", "clubs"),
    suited("6", "clubs", 2),
    suited("4", "spades"),
    suited("4", "hearts"),
    suited("4", "diamonds"),
    suited("4", "diamonds", 2),
  ];

  const action = chooseAiAction({ hand, gameRank: "2", seat: 3, partnerSeat: 1 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.cards.filter((card) => card.rank === "6") : []).toHaveLength(0);
});

it("attacker AI leads a small pair when high pair control can take it back", () => {
  const hand = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("6", "diamonds"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("10", "spades"),
    suited("10", "clubs"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(classifyAiRole(hand, "10")).toBe("attacker");
  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id).sort() : []).toEqual(["C3-1", "S3-1"]);
});

it("attacker AI prefers a small pair over a loose small single when high pair control exists", () => {
  const hand = [
    joker("BJ"),
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("4", "diamonds"),
    suited("A", "spades"),
    suited("A", "clubs"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(classifyAiRole(hand, "10")).toBe("attacker");
  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id).sort() : []).toEqual(["C3-1", "S3-1"]);
});

it("attacker AI leads a small full-house when a large full-house can take it back", () => {
  const hand = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("10", "spades"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(classifyAiRole(hand, "10")).toBe("attacker");
  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["3", "3", "3", "4", "4"]);
});

it("attacker AI prefers a small full-house over a loose small single when large full-house control exists", () => {
  const hand = [
    joker("BJ"),
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("5", "diamonds"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("K", "spades"),
    suited("K", "clubs"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(classifyAiRole(hand, "10")).toBe("attacker");
  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["3", "3", "3", "4", "4"]);
});

it("leads a small straight before spending high full-house controls", () => {
  const hand = [
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("Q", "clubs"),
    suited("Q", "hearts"),
    suited("6", "hearts"),
    suited("5", "clubs"),
    suited("4", "spades"),
    suited("3", "spades"),
    suited("2", "spades"),
    joker("SJ"),
  ];

  const action = chooseAiAction({ hand, gameRank: "10", seat: 2, partnerSeat: 0 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("straight");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["2", "3", "4", "5", "6"]);
});

it("does not lead by breaking a natural bomb into a full-house", () => {
  const hand = [
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("4", "hearts"),
    suited("4", "diamonds"),
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("A", "spades"),
  ];

  const action = chooseAiAction({ hand, gameRank: "5", seat: 2, partnerSeat: 0 });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).not.toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id).sort() : []).not.toEqual([
    "C4-1",
    "C6-1",
    "D4-1",
    "H4-1",
    "S4-1",
    "S6-1",
  ]);
});

it("beats with the smallest legal response", () => {
  const lastPlay = classifyPlay([suited("7", "spades")], "10");
  const action = chooseAiAction({
    hand: [suited("9", "spades"), suited("8", "clubs"), suited("6", "diamonds")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.cards[0].id : undefined).toBe("C8-1");
});

it("follows a single with a loose higher single before breaking a pair", () => {
  const lastPlay = classifyPlay([suited("10", "hearts")], "5");
  const action = chooseAiAction({
    hand: [
      suited("A", "spades"),
      suited("Q", "spades"),
      suited("Q", "clubs"),
      suited("7", "diamonds"),
      suited("5", "spades"),
      suited("3", "diamonds"),
    ],
    gameRank: "5",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("SA-1");
});

it("passes on an opponent small single instead of breaking structures or spending a big joker", () => {
  const lastPlay = classifyPlay([suited("3", "clubs")], "2");
  const action = chooseAiAction({
    hand: [
      joker("BJ"),
      suited("2", "spades"),
      suited("2", "diamonds"),
      suited("A", "hearts"),
      suited("K", "spades"),
      suited("K", "clubs"),
      suited("K", "diamonds"),
      suited("Q", "spades"),
      suited("Q", "hearts"),
      suited("J", "spades"),
      suited("J", "clubs"),
      suited("J", "hearts"),
      suited("10", "spades"),
      suited("10", "clubs"),
      suited("10", "diamonds"),
      suited("9", "clubs"),
      suited("9", "hearts"),
      suited("6", "hearts"),
      suited("5", "spades"),
      suited("5", "diamonds"),
      suited("5", "hearts"),
      suited("4", "spades"),
      suited("4", "clubs"),
      suited("3", "spades"),
      suited("3", "clubs"),
      suited("3", "hearts"),
    ],
    gameRank: "2",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("keeps a planned big joker single against an ordinary single when a bomb can recover low singles", () => {
  const lastPlay = classifyPlay([suited("9", "clubs")], "2");
  const bigJokerSingle = classifyPlay([joker("BJ")], "2");
  const bomb = classifyPlay([
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
  ], "2");
  const lowSingle = classifyPlay([suited("4", "spades")], "2");
  const hand = [
    joker("BJ"),
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
    suited("4", "spades"),
    suited("3", "clubs"),
  ];

  const action = chooseAiAction({
    hand,
    plannedGroups: [bigJokerSingle, bomb, lowSingle].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 9,
      opponentHandCounts: [8, 10],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("pass");
});

it("follows an opponent small single with a surplus card while preserving a top straight", () => {
  const lastPlay = classifyPlay([suited("7", "diamonds")], "2");
  const action = chooseAiAction({
    hand: [
      joker("BJ"),
      joker("BJ", 2),
      suited("2", "spades"),
      suited("2", "clubs"),
      suited("2", "diamonds"),
      suited("2", "diamonds", 2),
      suited("A", "diamonds"),
      suited("K", "spades"),
      suited("Q", "spades"),
      suited("Q", "diamonds"),
      suited("J", "clubs"),
      suited("10", "clubs"),
      suited("9", "spades"),
      suited("9", "clubs"),
      suited("9", "diamonds"),
      suited("8", "hearts"),
      suited("8", "diamonds"),
      suited("8", "diamonds", 2),
      suited("7", "clubs"),
      suited("7", "hearts"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("4", "spades"),
      suited("4", "hearts"),
      suited("3", "spades"),
      suited("3", "clubs"),
      suited("3", "clubs", 2),
    ],
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.rank : undefined).toBe("Q");
});

it("support AI blocks an opponent small single with a 10 or higher loose single", () => {
  const lastPlay = classifyPlay([suited("3", "spades")], "10");
  const action = chooseAiAction({
    hand: [
      suited("J", "clubs"),
      suited("7", "diamonds"),
      suited("6", "spades"),
      suited("5", "clubs"),
      suited("4", "diamonds"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(classifyAiRole([
    suited("J", "clubs"),
    suited("7", "diamonds"),
    suited("6", "spades"),
    suited("5", "clubs"),
    suited("4", "diamonds"),
  ], "10")).toBe("support");
  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("CJ-1");
});

it("support AI may split a pair to block an opponent small single with 10 or higher", () => {
  const lastPlay = classifyPlay([suited("3", "spades")], "10");
  const action = chooseAiAction({
    hand: [
      suited("J", "spades"),
      suited("J", "clubs"),
      suited("7", "diamonds"),
      suited("6", "spades"),
      suited("5", "clubs"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.rank : undefined).toBe("J");
});

it("does not chase an ordinary opponent bomb with a scarce bomb", () => {
  const lastPlay = classifyPlay([
    suited("5", "spades"),
    suited("5", "clubs"),
    suited("5", "hearts"),
    suited("5", "diamonds"),
  ], "10");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("A", "spades"),
    ],
    partnerHand: [suited("3", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("does not chase an opponent bomb with fewer than three power resources", () => {
  const lastPlay = classifyPlay([
    suited("J", "spades"),
    suited("J", "clubs"),
    suited("J", "hearts"),
    suited("J", "diamonds"),
  ], "10");
  const action = chooseAiAction({
    hand: [
      suited("Q", "spades"),
      suited("Q", "clubs"),
      suited("Q", "hearts"),
      suited("Q", "diamonds"),
      suited("K", "spades"),
      suited("K", "clubs"),
      suited("K", "hearts"),
      suited("K", "diamonds"),
      suited("A", "spades"),
    ],
    partnerHand: [suited("3", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("does not spend a heart-rank wildcard bomb when that wildcard makes a straight flush", () => {
  const lastPlay = classifyPlay([
    suited("8", "spades"),
    suited("8", "clubs"),
    suited("8", "hearts"),
    suited("8", "diamonds"),
  ], "2");
  const action = chooseAiAction({
    hand: [
      suited("2", "hearts"),
      suited("10", "spades"),
      suited("10", "clubs"),
      suited("10", "diamonds"),
      suited("Q", "diamonds"),
      suited("10", "diamonds", 2),
      suited("9", "diamonds"),
      suited("8", "diamonds", 2),
      suited("7", "hearts"),
      suited("6", "clubs"),
      suited("5", "diamonds"),
      suited("A", "spades"),
    ],
    partnerHand: [suited("3", "spades")],
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 1,
  });

  expect(action.type).toBe("pass");
});

it("bombs when an opponent plays the second big joker", () => {
  const lastPlay = classifyPlay([joker("BJ", 2)], "10");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
    ],
    partnerHand: [suited("3", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("bomb");
});

it("keeps a lone bomb against high opponent pair control in an ordinary position", () => {
  const lastPlay = classifyPlay([suited("10", "spades"), suited("10", "clubs")], "10");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("A", "spades"),
    ],
    partnerHand: [suited("3", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("does not bomb an opponent rank single before the second big joker appears", () => {
  const lastPlay = classifyPlay([suited("2", "diamonds")], "2");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("A", "spades"),
    ],
    partnerHand: [suited("3", "spades")],
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("pass");
});

it("keeps a lone bomb against a high opponent plate in an ordinary position", () => {
  const lastPlay = classifyPlay([
    suited("J", "spades"),
    suited("J", "clubs"),
    suited("J", "diamonds"),
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("Q", "diamonds"),
  ], "10");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("A", "spades"),
    ],
    partnerHand: [suited("3", "spades"), suited("4", "clubs")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(lastPlay?.type).toBe("plate");
  expect(action.type).toBe("pass");
});

it("uses the smallest available pair as full-house kicker instead of breaking high full-house reserves", () => {
  const lastPlay = classifyPlay([
    suited("J", "spades"),
    suited("J", "clubs"),
    suited("J", "hearts"),
    suited("7", "spades"),
    suited("7", "clubs"),
  ], "10");
  const action = chooseAiAction({
    hand: [
      suited("Q", "spades"),
      suited("Q", "clubs"),
      suited("Q", "hearts"),
      suited("K", "spades"),
      suited("K", "clubs"),
      suited("K", "hearts"),
      suited("9", "spades"),
      suited("9", "clubs"),
      suited("8", "spades"),
      suited("8", "clubs"),
    ],
    gameRank: "10",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 1,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["8", "8", "Q", "Q", "Q"]);
});

it("does not use a wildcard that completes a protected bomb as a full-house kicker", () => {
  const lastPlay = classifyPlay([
    suited("Q", "clubs"),
    suited("Q", "diamonds"),
    suited("Q", "spades"),
    suited("3", "clubs"),
    suited("3", "diamonds"),
  ], "2");
  const action = chooseAiAction({
    hand: [
      suited("2", "clubs"),
      suited("2", "hearts"),
      suited("2", "diamonds"),
      suited("8", "spades"),
      suited("8", "clubs"),
      suited("8", "hearts"),
      suited("6", "spades"),
      suited("6", "diamonds"),
      suited("3", "spades"),
      suited("3", "clubs"),
      suited("3", "hearts"),
    ],
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("pass");
});

it("does not throw when protected-group validation rejects every lead candidate", () => {
  const input = {
    hand: [
      suited("2", "clubs"),
      suited("2", "hearts"),
      suited("2", "diamonds"),
      suited("3", "spades"),
      suited("3", "clubs"),
      suited("3", "hearts"),
    ],
    gameRank: "2" as const,
    seat: 2,
    partnerSeat: 0,
  };

  expect(() => chooseLeadAction(input)).not.toThrow();
});

it("does not break a same-rank bomb into a full-house response", () => {
  const lastPlay = classifyPlay([
    suited("2", "spades"),
    suited("2", "clubs"),
    suited("2", "diamonds"),
    suited("4", "spades"),
    suited("4", "clubs"),
  ], "10");
  const action = chooseAiAction({
    hand: [
      suited("3", "spades"),
      suited("3", "clubs"),
      suited("3", "hearts"),
      suited("3", "diamonds"),
      suited("6", "spades"),
      suited("6", "hearts"),
      suited("A", "spades"),
    ],
    gameRank: "10",
    seat: 3,
    partnerSeat: 1,
    lastPlay,
    lastPlaySeat: 2,
  });

  expect(action.type).toBe("pass");
});

it("never passes as the lead player when a planned action is rejected by bomb protection", () => {
  const hand = [
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
  ];
  const rejectedSingle = classifyPlay([hand[0]], "10");
  if (rejectedSingle === undefined) throw new Error("Expected a single");

  const action = chooseAiAction({
    hand,
    plannedGroups: [rejectedSingle],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("bomb");
});

it("does not break a consecutive-pairs structure just to follow an opponent pair", () => {
  const lastPlay = classifyPlay([suited("4", "spades"), suited("4", "clubs")], "10");
  const action = chooseAiAction({
    hand: [
      suited("5", "spades"),
      suited("5", "clubs"),
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("7", "spades"),
      suited("7", "clubs"),
      suited("A", "diamonds"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("uses the smallest pair from a high wood only to block an opponent pair after partner passes", () => {
  const lastPlay = classifyPlay([suited("6", "spades"), suited("6", "clubs")], "10");
  const action = chooseAiAction({
    hand: [
      suited("Q", "spades"), suited("Q", "clubs"),
      suited("K", "spades"), suited("K", "clubs"),
      suited("A", "spades"), suited("A", "clubs"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
    context: {
      ownHandCount: 6,
      partnerHandCount: 8,
      opponentHandCounts: [8, 8],
      playedCards: [],
      finishOrder: [],
      partnerPassedCurrentTrick: true,
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank) : []).toEqual(["Q", "Q"]);
});

it("does not split a high wood into a single response", () => {
  const lastPlay = classifyPlay([suited("6", "spades")], "10");
  const action = chooseAiAction({
    hand: [
      suited("Q", "spades"), suited("Q", "clubs"),
      suited("K", "spades"), suited("K", "clubs"),
      suited("A", "spades"), suited("A", "clubs"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
    context: {
      ownHandCount: 6,
      partnerHandCount: 8,
      opponentHandCounts: [8, 8],
      playedCards: [],
      finishOrder: [],
      partnerPassedCurrentTrick: true,
    },
  });

  expect(action.type).toBe("pass");
});

it("uses a high plate as a full-house response only after partner passes and no other full house exists", () => {
  const lastPlay = classifyPlay([
    suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"),
    suited("5", "spades"), suited("5", "clubs"),
  ], "10");
  const action = chooseAiAction({
    hand: [
      suited("Q", "spades"), suited("Q", "clubs"), suited("Q", "hearts"),
      suited("K", "spades"), suited("K", "clubs"), suited("K", "hearts"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
    context: {
      ownHandCount: 6,
      partnerHandCount: 8,
      opponentHandCounts: [8, 8],
      playedCards: [],
      finishOrder: [],
      partnerPassedCurrentTrick: true,
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["K", "K", "Q", "Q", "Q"]);
});

it("does not split a protected bomb to follow an opponent pair", () => {
  const lastPlay = classifyPlay([suited("5", "spades"), suited("5", "clubs")], "6");
  const action = chooseAiAction({
    hand: [
      joker("BJ"),
      suited("2", "spades"),
      suited("2", "hearts"),
      suited("A", "spades"),
      suited("A", "diamonds"),
      suited("K", "spades"),
      suited("K", "clubs"),
      suited("Q", "hearts"),
      suited("J", "spades"),
      suited("J", "clubs"),
      suited("J", "hearts"),
      suited("10", "spades"),
      suited("10", "clubs"),
      suited("9", "clubs"),
      suited("8", "clubs"),
      suited("8", "diamonds"),
      suited("7", "clubs"),
      suited("7", "hearts"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("4", "clubs"),
      suited("3", "spades"),
      suited("3", "clubs"),
      suited("3", "hearts"),
      suited("3", "diamonds"),
    ],
    gameRank: "6",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("still does not split a consecutive-pairs structure into a single response", () => {
  const lastPlay = classifyPlay([suited("5", "spades")], "10");
  const action = chooseAiAction({
    hand: [
      suited("7", "spades"),
      suited("7", "clubs"),
      suited("8", "spades"),
      suited("8", "clubs"),
      suited("9", "spades"),
      suited("9", "clubs"),
      suited("A", "diamonds"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.rank : undefined).toBe("A");
});

it("protects planned groups from being split for an ordinary pair response", () => {
  const plannedCards = [
    suited("7", "spades"),
    suited("7", "clubs"),
    suited("8", "spades"),
    suited("8", "clubs"),
    suited("9", "spades"),
    suited("9", "clubs"),
  ];
  const plannedGroup = classifyPlay(plannedCards, "10");
  const lastPlay = classifyPlay([suited("5", "spades"), suited("5", "clubs")], "10");
  const action = chooseAiAction({
    hand: [...plannedCards, suited("A", "diamonds")],
    plannedGroups: plannedGroup === undefined ? [] : [plannedGroup],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("leads from planned groups before falling back to raw singles", () => {
  const plannedPair = classifyPlay([suited("7", "spades"), suited("7", "clubs")], "10");
  const action = chooseAiAction({
    hand: [suited("7", "spades"), suited("7", "clubs"), suited("A", "diamonds")],
    plannedGroups: plannedPair === undefined ? [] : [plannedPair],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
});

it("leads a low natural pair before spending a small-joker pair", () => {
  const jokerPair = classifyPlay([joker("SJ", 1), joker("SJ", 2)], "2");
  const lowPair = classifyPlay([suited("8", "hearts"), suited("8", "diamonds")], "2");
  const action = chooseAiAction({
    hand: [joker("SJ", 1), joker("SJ", 2), suited("8", "hearts"), suited("8", "diamonds"), suited("A", "spades")],
    plannedGroups: [jokerPair, lowPair].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id).sort() : []).toEqual(["D8-1", "H8-1"]);
});

it("does not let a planned bomb bypass power-resource restraint", () => {
  const plannedBomb = classifyPlay([suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds")], "10");
  const lastPlay = classifyPlay([suited("A", "spades"), suited("A", "clubs")], "10");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("9", "spades"),
      suited("8", "clubs"),
      suited("5", "spades"),
      suited("4", "clubs"),
    ],
    partnerHand: [suited("3", "spades")],
    plannedGroups: plannedBomb === undefined ? [] : [plannedBomb],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
    context: {
      ownHandCount: 8,
      partnerHandCount: 10,
      opponentHandCounts: [12, 14],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("pass");
});

it("does not lead a planned bomb while ordinary planned groups remain", () => {
  const plannedBomb = classifyPlay([suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds")], "10");
  const plannedPair = classifyPlay([suited("8", "spades"), suited("8", "clubs")], "10");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("8", "spades"),
      suited("8", "clubs"),
    ],
    plannedGroups: [plannedBomb, plannedPair].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
});

it("does not split a protected straight flush when leading and instead makes a legal lead", () => {
  const straightFlush = classifyPlay([suited("A", "clubs"), suited("Q", "clubs"), suited("J", "clubs"), suited("5", "hearts"), suited("5", "hearts", 2)], "5");
  const acePair = classifyPlay([suited("A", "spades"), suited("A", "diamonds")], "5");
  const tenPair = classifyPlay([suited("10", "hearts"), suited("10", "hearts", 2)], "5");
  const eightPair = classifyPlay([suited("8", "spades"), suited("8", "diamonds")], "5");
  const hand = [
    suited("A", "clubs"),
    suited("Q", "clubs"),
    suited("J", "clubs"),
    suited("5", "hearts"),
    suited("5", "hearts", 2),
    suited("A", "spades"),
    suited("A", "diamonds"),
    suited("K", "hearts"),
    suited("10", "hearts"),
    suited("10", "hearts", 2),
    suited("8", "spades"),
    suited("8", "diamonds"),
  ];
  const action = chooseAiAction({
    hand,
    plannedGroups: [straightFlush, acePair, tenPair, eightPair].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "5",
    seat: 3,
    partnerSeat: 1,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 6,
      opponentHandCounts: [2, 5],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  const straightFlushIds = new Set(straightFlush?.cards.map((card) => card.id));
  const usedStraightFlushCards = action.type === "play"
    ? action.group.cards.filter((card) => straightFlushIds.has(card.id))
    : [];
  expect(
    usedStraightFlushCards.length === 0
      || (action.type === "play"
        && action.group.type === "straight-flush"
        && usedStraightFlushCards.length === straightFlushIds.size),
  ).toBe(true);
});

it("does not lead a planned bomb in runtime fast mode when an ordinary planned group is available", () => {
  const bomb = classifyPlay([
    suited("6", "spades"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("6", "diamonds"),
  ], "2");
  const pair = classifyPlay([suited("8", "spades"), suited("8", "diamonds")], "2");
  const hand = [...(bomb?.cards ?? []), ...(pair?.cards ?? [])];

  const action = chooseAiAction({
    hand,
    plannedGroups: [bomb, pair].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 1,
    partnerSeat: 3,
    preferPlannedLead: true,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 20,
      opponentHandCounts: [20, 20],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
});

it("uses the smallest planned power response only when enough power resources remain", () => {
  const firstBomb = classifyPlay([suited("6", "spades"), suited("6", "clubs"), suited("6", "hearts"), suited("6", "diamonds")], "10");
  const secondBomb = classifyPlay([suited("7", "spades"), suited("7", "clubs"), suited("7", "hearts"), suited("7", "diamonds")], "10");
  const thirdBomb = classifyPlay([suited("8", "spades"), suited("8", "clubs"), suited("8", "hearts"), suited("8", "diamonds")], "10");
  const lastPlay = classifyPlay([suited("10", "spades"), suited("10", "clubs")], "10");
  const action = chooseAiAction({
    hand: [
      suited("6", "spades"),
      suited("6", "clubs"),
      suited("6", "hearts"),
      suited("6", "diamonds"),
      suited("7", "spades"),
      suited("7", "clubs"),
      suited("7", "hearts"),
      suited("7", "diamonds"),
      suited("8", "spades"),
      suited("8", "clubs"),
      suited("8", "hearts"),
      suited("8", "diamonds"),
    ],
    partnerHand: [suited("3", "spades")],
    plannedGroups: [firstBomb, secondBomb, thirdBomb].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
    context: {
      ownHandCount: 12,
      partnerHandCount: 10,
      opponentHandCounts: [12, 14],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.cards[0]?.rank : undefined).toBe("6");
});

it("does not split an ace bomb into a high pair to press an opponent pair", () => {
  const lastPlay = classifyPlay([suited("7", "spades"), suited("7", "clubs")], "10");
  const action = chooseAiAction({
    hand: [
      suited("A", "spades"),
      suited("A", "clubs"),
      suited("A", "hearts"),
      suited("A", "diamonds"),
      suited("6", "spades"),
      suited("5", "clubs"),
    ],
    gameRank: "10",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("pass");
});

it("does not split a rank bomb into a high pair to press an opponent pair", () => {
  const lastPlay = classifyPlay([suited("7", "spades"), suited("7", "clubs")], "2");
  const action = chooseAiAction({
    hand: [
      suited("2", "spades"),
      suited("2", "clubs"),
      suited("2", "diamonds"),
      suited("2", "spades", 2),
      suited("6", "spades"),
      suited("5", "clubs"),
    ],
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("pass");
});

it("does not waste a heart-rank wildcard by pairing it with a small singleton", () => {
  const lastPlay = classifyPlay([suited("3", "spades"), suited("3", "clubs")], "10");
  const hand = [
    suited("10", "hearts"),
    suited("4", "spades"),
    suited("8", "diamonds"),
    suited("K", "clubs"),
    suited("A", "diamonds"),
  ];
  const action = chooseAiAction({
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("pass");
});

it("uses a heart-rank wildcard with A or K as a critical high pair blocker", () => {
  const lastPlay = classifyPlay([suited("K", "spades"), suited("K", "clubs")], "10");
  const hand = [
    suited("10", "hearts"),
    suited("A", "diamonds"),
    suited("8", "diamonds"),
    suited("6", "clubs"),
  ];
  const action = chooseAiAction({
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 0,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id).sort() : []).toEqual(["DA-1", "H10-1"]);
});

it("can overtake a partner single with the smallest loose single", () => {
  const lastPlay = classifyPlay([suited("7", "spades")], "10");
  const action = chooseAiAction({
    hand: [suited("8", "clubs"), suited("A", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("C8-1");
});

it("does not overtake a partner high single with stronger single control", () => {
  const lastPlay = classifyPlay([suited("Q", "spades")], "10");
  const action = chooseAiAction({
    hand: [suited("K", "clubs"), suited("A", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("pass");
});

it("passes when partner controls the trick with a non-single play", () => {
  const lastPlay = classifyPlay([suited("7", "spades"), suited("7", "clubs")], "10");
  const action = chooseAiAction({
    hand: [suited("8", "spades"), suited("8", "clubs")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 3,
  });

  expect(action.type).toBe("pass");
});

it("does not use fallback to break a made straight into a single", () => {
  const action = chooseAiAction({
    hand: [
      suited("7", "spades"),
      suited("6", "clubs"),
      suited("5", "diamonds"),
      suited("4", "spades"),
      suited("3", "clubs"),
    ],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("straight");
});

it("lets a nearly finished partner keep control instead of overtaking a low single", () => {
  const lastPlay = classifyPlay([suited("7", "spades")], "10");
  const action = chooseAiAction({
    hand: [suited("8", "clubs"), suited("A", "spades")],
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    lastPlay,
    lastPlaySeat: 3,
    context: {
      partnerHandCount: 1,
      ownHandCount: 2,
      opponentHandCounts: [12, 9],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("pass");
});

it("overtakes a partner low single with a loose tempo single when partner is not near finish", () => {
  const lastPlay = classifyPlay([suited("6", "diamonds")], "2");
  const action = chooseAiAction({
    hand: [
      suited("A", "spades"),
      suited("A", "clubs"),
      suited("A", "diamonds"),
      suited("10", "hearts"),
      suited("9", "spades"),
      suited("9", "clubs"),
      suited("9", "hearts"),
      suited("9", "diamonds"),
      suited("8", "spades"),
      suited("8", "clubs"),
      suited("8", "hearts"),
      suited("8", "diamonds"),
      suited("6", "hearts"),
      suited("2", "clubs"),
    ],
    gameRank: "2",
    seat: 3,
    partnerSeat: 1,
    lastPlay,
    lastPlaySeat: 1,
    context: {
      ownHandCount: 14,
      partnerHandCount: 10,
      opponentHandCounts: [12, 11],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("H10-1");
});

it("leads a loose small single before planned power-backed groups when two bombs can recover control", () => {
  const firstBomb = classifyPlay([suited("9", "spades"), suited("9", "clubs"), suited("9", "hearts"), suited("9", "diamonds")], "2");
  const secondBomb = classifyPlay([suited("8", "spades"), suited("8", "clubs"), suited("8", "hearts"), suited("8", "diamonds")], "2");
  const fullHouse = classifyPlay([suited("A", "spades"), suited("A", "clubs"), suited("A", "diamonds"), suited("3", "spades"), suited("3", "clubs")], "2");
  const hand = [
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("10", "hearts"),
    suited("9", "spades"),
    suited("9", "clubs"),
    suited("9", "hearts"),
    suited("9", "diamonds"),
    suited("8", "spades"),
    suited("8", "clubs"),
    suited("8", "hearts"),
    suited("8", "diamonds"),
    suited("6", "hearts"),
    suited("2", "clubs"),
  ];
  const action = chooseAiAction({
    hand,
    plannedGroups: [firstBomb, secondBomb, fullHouse].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 3,
    partnerSeat: 1,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 10,
      opponentHandCounts: [12, 11],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("H6-1");
});

it("leads the lowest loose small single when a retained big joker can recover control", () => {
  const bigJokerSingle = classifyPlay([joker("BJ")], "2");
  const fullHouse = classifyPlay([
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("K", "spades"),
    suited("K", "clubs"),
  ], "2");
  const hand = [
    joker("BJ"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "diamonds"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("9", "clubs"),
    suited("4", "hearts"),
    suited("3", "spades"),
  ];

  const action = chooseAiAction({
    hand,
    plannedGroups: [bigJokerSingle, fullHouse].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 3,
    partnerSeat: 1,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 10,
      opponentHandCounts: [12, 11],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("S3-1");
});

it("leads the only side single before a five-card bomb instead of following stale split bomb groups", () => {
  const staleTriple = classifyPlay([suited("7", "spades"), suited("7", "clubs"), suited("7", "hearts")], "2");
  const stalePair = classifyPlay([suited("7", "diamonds"), suited("7", "diamonds", 2)], "2");
  const hand = [
    suited("10", "clubs"),
    suited("7", "spades"),
    suited("7", "clubs"),
    suited("7", "hearts"),
    suited("7", "diamonds"),
    suited("7", "diamonds", 2),
  ];

  const action = chooseAiAction({
    hand,
    plannedGroups: [staleTriple, stalePair].filter((group): group is NonNullable<typeof group> => group !== undefined),
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 8,
      opponentHandCounts: [8, 9],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("C10-1");
});

it("does not let urgent endgame lead split a five-card bomb into a triple", () => {
  const hand = [
    suited("10", "clubs"),
    suited("7", "spades"),
    suited("7", "clubs"),
    suited("7", "hearts"),
    suited("7", "diamonds"),
    suited("7", "diamonds", 2),
  ];

  const action = chooseAiAction({
    hand,
    gameRank: "2",
    seat: 2,
    partnerSeat: 0,
    context: {
      ownHandCount: hand.length,
      partnerHandCount: 8,
      opponentHandCounts: [8, 9],
      playedCards: [],
      finishOrder: [],
    },
  });

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("C10-1");
});

it("chooseFollowAction passes when partner is winning and following cannot finish", () => {
  const currentWinningAction = classifyPlay([suited("7", "spades"), suited("7", "clubs")], "10");
  const action = chooseFollowAction(
    {
      hand: [suited("8", "spades"), suited("8", "clubs"), suited("A", "diamonds")],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 3,
        partnerHandCount: 5,
        opponentHandCounts: [9, 10],
        playedCards: [],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 3, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("PASS");
});

it("chooseFollowAction uses the smallest pair that beats an ordinary opponent pair", () => {
  const currentWinningAction = classifyPlay([suited("5", "spades"), suited("5", "clubs")], "10");
  const action = chooseFollowAction(
    {
      hand: [
        suited("7", "spades"),
        suited("7", "clubs"),
        suited("9", "spades"),
        suited("9", "clubs"),
        suited("A", "diamonds"),
      ],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("NORMAL_FOLLOW");
  expect(action.type).toBe("pair");
  expect(action.cards.map((card) => card.id).sort()).toEqual(["C7-1", "S7-1"]);
});

it("chooseFollowAction presses a dangerous opponent pair when that opponent has two cards", () => {
  const currentWinningAction = classifyPlay([suited("K", "spades"), suited("K", "clubs")], "10");
  const action = chooseFollowAction(
    {
      hand: [suited("A", "spades"), suited("A", "clubs"), suited("4", "diamonds")],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 3,
        partnerHandCount: 8,
        opponentHandCounts: [2, 9],
        playedCards: [],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("HIGH_BLOCK");
  expect(action.type).toBe("pair");
});

it("chooseFollowAction avoids bombing a small ordinary early play", () => {
  const currentWinningAction = classifyPlay([suited("4", "spades")], "10");
  const action = chooseFollowAction(
    {
      hand: [
        suited("6", "spades"),
        suited("6", "clubs"),
        suited("6", "hearts"),
        suited("6", "diamonds"),
        suited("A", "spades"),
      ],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 20,
        partnerHandCount: 20,
        opponentHandCounts: [20, 20],
        playedCards: [],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("PASS");
});

it("chooseFollowAction can use a small bomb against a late dangerous opponent big combo", () => {
  const currentWinningAction = classifyPlay([
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("Q", "diamonds"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("K", "diamonds"),
  ], "10");
  const action = chooseFollowAction(
    {
      hand: [
        suited("6", "spades"),
        suited("6", "clubs"),
        suited("6", "hearts"),
        suited("6", "diamonds"),
        suited("A", "spades"),
      ],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 5,
        partnerHandCount: 9,
        opponentHandCounts: [6, 10],
        playedCards: [suited("3", "spades"), suited("4", "clubs")],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("BOMB_FOLLOW");
  expect(action.type).toBe("bomb");
  expect(action.cards.every((card) => card.rank === "6")).toBe(true);
});

it("chooseFollowAction avoids stealing control from a nearly finished partner", () => {
  const currentWinningAction = classifyPlay([suited("7", "spades")], "10");
  const action = chooseFollowAction(
    {
      hand: [suited("8", "clubs"), suited("A", "spades")],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 2,
        partnerHandCount: 1,
        opponentHandCounts: [7, 8],
        playedCards: [],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 3, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("PASS");
});

it("chooseFollowAction prioritizes a follow that immediately finishes", () => {
  const currentWinningAction = classifyPlay([suited("K", "spades"), suited("K", "clubs")], "10");
  const action = chooseFollowAction(
    {
      hand: [suited("A", "spades"), suited("A", "clubs")],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 2,
        partnerHandCount: 8,
        opponentHandCounts: [6, 7],
        playedCards: [],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("HIGH_BLOCK");
  expect(action.type).toBe("pair");
  expect(action.reducesHandCount).toBe(true);
});

it("chooseFollowAction chooses the lower-cost bomb when two bombs can both win", () => {
  const currentWinningAction = classifyPlay([
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("Q", "diamonds"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("K", "diamonds"),
  ], "10");
  const action = chooseFollowAction(
    {
      hand: [
        suited("6", "spades"),
        suited("6", "clubs"),
        suited("6", "hearts"),
        suited("6", "diamonds"),
        suited("8", "spades"),
        suited("8", "clubs"),
        suited("8", "hearts"),
        suited("8", "diamonds"),
      ],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 8,
        partnerHandCount: 8,
        opponentHandCounts: [6, 8],
        playedCards: [],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("BOMB_FOLLOW");
  expect(action.cards.every((card) => card.rank === "6")).toBe(true);
});

it("chooseFollowAction passes when following breaks the only recovery group", () => {
  const currentWinningAction = classifyPlay([suited("5", "spades"), suited("5", "clubs")], "10");
  const action = chooseFollowAction(
    {
      hand: [
        suited("7", "spades"),
        suited("7", "clubs"),
        suited("8", "spades"),
        suited("8", "clubs"),
        suited("9", "spades"),
        suited("9", "clubs"),
        suited("4", "diamonds"),
      ],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.actionType).toBe("PASS");
});

it("chooseFollowAction penalizes follows that leave a low single tail", () => {
  const currentWinningAction = classifyPlay([suited("7", "spades"), suited("7", "clubs")], "10");
  const action = chooseFollowAction(
    {
      hand: [
        suited("8", "spades"),
        suited("8", "clubs"),
        suited("A", "spades"),
        suited("A", "clubs"),
        suited("3", "diamonds"),
      ],
      gameRank: "10",
      seat: 1,
      partnerSeat: 3,
      context: {
        ownHandCount: 5,
        partnerHandCount: 9,
        opponentHandCounts: [10, 10],
        playedCards: [],
        finishOrder: [],
      },
    },
    { currentWinningAction: { seat: 0, group: currentWinningAction! } },
  );

  expect(action.type).toBe("pair");
  expect(action.cards.every((card) => card.rank === "8")).toBe(true);
  expect(action.leavesWeakTail).toBe(true);
});
