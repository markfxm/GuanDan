import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { chooseAiAction, classifyAiRole } from "../../src/game/ai";

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

it("leads the smallest single before linked groups when a big joker can take singles back", () => {
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
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("C3-1");
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

it("leads the smallest loose single before a large full-house when rank control can take singles back", () => {
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
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("C3-1");
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

it("leads a weak full-house instead of an unsupported wildcard straight-flush when a bomb can recover", () => {
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
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.rank).sort() : []).toEqual(["6", "6", "6", "7", "7"]);
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

it("follows an opponent small single with the smallest useful singleton instead of spending a big joker", () => {
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

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("single");
  expect(action.type === "play" ? action.group.cards[0]?.id : undefined).toBe("H6-1");
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

it("bombs high opponent pair control when no ordinary response is available", () => {
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

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("bomb");
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

it("bombs a high opponent plate that neither partner can answer", () => {
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
  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("bomb");
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

it("uses an existing pair as full-house kicker before breaking a triple with a heart-rank wildcard", () => {
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

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("full-house");
  expect(action.type === "play" ? action.group.cards.map((card) => card.id).sort() : []).toEqual([
    "C2-1",
    "D2-1",
    "D6-1",
    "H2-1",
    "S6-1",
  ]);
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

it("splits an ace bomb into a high pair to press an opponent pair", () => {
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

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
  expect(action.type === "play" ? action.group.cards.every((card) => card.rank === "A") : false).toBe(true);
});

it("splits a rank bomb into a high pair to press an opponent pair", () => {
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

  expect(action.type).toBe("play");
  expect(action.type === "play" ? action.group.type : undefined).toBe("pair");
  expect(action.type === "play" ? action.group.cards.every((card) => card.rank === "2") : false).toBe(true);
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
