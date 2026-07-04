import { advanceOpeningTribute, createRoom, getPublicRoom, passTurn, playCards, runAiStep, runAiUntilHumanTurn } from "../../src/game/room";
import { createDeck, isHeartRankWild, rankStrength, type Card, type GameRank, type Rank, type Suit } from "../../src/engine/cards";

it("creates a four-seat room with AI filled empty seats and 27 cards per player", () => {
  const room = createRoom({ rank: "10", seed: 1 });

  expect(room.players).toHaveLength(4);
  expect(room.players.filter((player) => player.isAI)).toHaveLength(3);
  expect(Object.values(room.hands).every((hand) => hand.length === 27)).toBe(true);
  expect(getPublicRoom(room, 0).players[1].handCount).toBe(27);
});

it("randomizes the opening leader for the first deal", () => {
  expect(createRoom({ rank: "10", seed: 1 }).currentTurn).toBe(0);
  expect(createRoom({ rank: "10", seed: 2 }).currentTurn).toBe(1);
});

it("records each player action in the current trick until the trick resets", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];
  playCards(room, 0, [card.id]);

  expect(room.trick.plays).toHaveLength(1);
  expect(room.trick.plays[0]).toMatchObject({ seat: 0, action: "play" });
  expect(room.trick.plays[0].group?.cards.map((played) => played.id)).toEqual([card.id]);

  passTurn(room, 3);
  passTurn(room, 2);

  expect(room.trick.plays.map((play) => [play.seat, play.action])).toEqual([
    [0, "play"],
    [3, "pass"],
    [2, "pass"],
  ]);

  passTurn(room, 1);

  expect(room.trick.lastPlay).toBeUndefined();
  expect(room.trick.plays).toEqual([]);
  expect(room.currentTurn).toBe(0);
});

it("keeps a full play history for replay after the current trick resets", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];

  playCards(room, 0, [card.id]);
  passTurn(room, 3);
  passTurn(room, 2);
  passTurn(room, 1);

  expect(room.trick.plays).toEqual([]);
  expect(room.playHistory.map((play) => [play.seat, play.action])).toEqual([
    [0, "play"],
    [3, "pass"],
    [2, "pass"],
    [1, "pass"],
  ]);
  expect(room.playHistory[0].group?.cards.map((played) => played.id)).toEqual([card.id]);
  expect(getPublicRoom(room, 0).playHistory).toHaveLength(4);
});

it("publishes replay hands and trick indexes for perspective replay", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const northOriginalHand = room.hands[2].map((card) => card.id);
  const card = room.hands[0][0];

  playCards(room, 0, [card.id]);
  passTurn(room, 3);
  passTurn(room, 2);
  passTurn(room, 1);
  playCards(room, 0, [room.hands[0][0].id]);

  expect(room.playHistory.map((play) => play.trickIndex)).toEqual([0, 0, 0, 0, 1]);
  expect(getPublicRoom(room, 0).replayHands[2].map((replayCard) => replayCard.id)).toEqual(northOriginalHand);
});

it("plays a legal human card and advances to the next seat", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];

  playCards(room, 0, [card.id]);

  expect(room.hands[0]).not.toContain(card);
  expect(room.currentTurn).toBe(3);
  expect(room.trick.lastPlay?.cards.map((played) => played.id)).toEqual([card.id]);
});

it("rotates turns counterclockwise from south to east to north to west", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];

  playCards(room, 0, [card.id]);
  expect(room.currentTurn).toBe(3);
  passTurn(room, 3);
  expect(room.currentTurn).toBe(2);
  passTurn(room, 2);
  expect(room.currentTurn).toBe(1);
});

it("runs exactly one AI action when stepping", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];
  playCards(room, 0, [card.id]);

  const beforeSeat = room.currentTurn;
  runAiStep(room);

  expect(beforeSeat).toBe(3);
  expect(room.trick.plays.length).toBeGreaterThanOrEqual(2);
  expect(room.trick.plays.some((play) => play.seat === beforeSeat)).toBe(true);
  expect(room.currentTurn).not.toBe(beforeSeat);
});

it("advances past an AI that cannot beat a south A full-house while playing rank 5", () => {
  const room = createRoom({ rank: "5", seed: 1 });
  const southFullHouse = [
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("9", "clubs"),
    suited("9", "hearts"),
  ];

  room.hands[0] = southFullHouse;
  room.hands[3] = [
    suited("2", "spades"),
    suited("3", "clubs"),
    suited("4", "diamonds"),
    suited("6", "spades"),
    suited("7", "clubs"),
    suited("8", "diamonds"),
  ];
  room.hands[2] = [suited("K", "spades")];
  room.hands[1] = [suited("Q", "clubs")];
  room.currentTurn = 0;
  room.trick = { leadSeat: 0, passSeats: [], plays: [] };

  playCards(room, 0, southFullHouse.map((card) => card.id));
  runAiStep(room);

  expect(room.trick.plays.map((play) => [play.seat, play.action])).toEqual([
    [0, "play"],
    [3, "pass"],
  ]);
  expect(room.currentTurn).toBe(2);
});

it("runs AI seats until the human needs to act", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  room.currentTurn = 1;

  runAiUntilHumanTurn(room);

  expect(room.currentTurn).toBe(0);
  expect(room.actionLog.length).toBeGreaterThan(0);
});

it("settles round when three players have finished and appends the remaining seat", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  room.finishOrder = [0, 2];
  const lastCard = room.hands[1][0];
  room.hands[1] = [lastCard];
  room.currentTurn = 1;

  playCards(room, 1, [lastCard.id]);

  expect(room.status).toBe("finished");
  expect(room.finishOrder).toEqual([0, 2, 1, 3]);
  expect(room.settlement?.outcome).toBe("double-down");
  expect(room.settlement?.nextRank).toBe("K");
});

it("settles immediately when partners finish first and second", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  room.finishOrder = [0];
  const lastCard = room.hands[2][0];
  room.hands[2] = [lastCard];
  room.currentTurn = 2;

  playCards(room, 2, [lastCard.id]);

  expect(room.status).toBe("finished");
  expect(room.finishOrder.slice(0, 2)).toEqual([0, 2]);
  expect(room.settlement?.outcome).toBe("double-down");
  expect(room.settlement?.tribute.items).toEqual([
    { payer: 1, receiver: 0 },
    { payer: 3, receiver: 2 },
  ]);
});

it("checks anti-tribute only after the next room is dealt", () => {
  const room = createRoom({
    rank: "K",
    seed: 11,
    pendingTributeItems: [
      { payer: 1, receiver: 0 },
      { payer: 3, receiver: 2 },
    ],
  });

  expect(room.openingTribute?.status).toBe("anti-tribute");
  expect(room.openingTribute?.reason).toBe("进贡方合计持有两张大王，抗贡成立。");
  expect(getPublicRoom(room, 0).openingTribute?.status).toBe("anti-tribute");
});

it("waits for the opening tribute flow after the next deal when anti-tribute does not apply", () => {
  const room = createRoom({
    rank: "K",
    seed: 1,
    pendingTributeItems: [{ payer: 3, receiver: 0 }],
  });

  expect(room.openingTribute?.status).toBe("pending");
  expect(room.openingTribute?.phase).toBe("tribute");
  expect(room.openingTribute?.activeSeat).toBe(3);
  expect(room.openingTribute?.items).toEqual([{ payer: 3, receiver: 0 }]);
});

it("reveals the tribute card before a human receiver chooses a return card", () => {
  const rank: GameRank = "K";
  const baseRoom = createRoom({ rank, seed: 1 });
  const tributeCard = strongestTributeCard(baseRoom.hands[3], rank);

  const room = createRoom({
    rank,
    seed: 1,
    pendingTributeItems: [{ payer: 3, receiver: 0 }],
  });

  advanceOpeningTribute(room);

  expect(room.openingTribute?.status).toBe("pending");
  expect(room.openingTribute?.phase).toBe("return");
  expect(room.openingTribute?.activeSeat).toBe(0);
  expect(room.openingTribute?.activeCard).toEqual(tributeCard);
  expect(room.openingTribute?.exchanges).toEqual([
    {
      payer: 3,
      receiver: 0,
      tributeCard,
    },
  ]);
  expect(room.hands[0].map((card) => card.id)).toContain(tributeCard.id);
  expect(room.hands[3].map((card) => card.id)).not.toContain(tributeCard.id);
});

it("allows a human receiver to choose a legal return card instead of the automatic minimum", () => {
  const rank: GameRank = "K";
  const room = createRoom({
    rank,
    seed: 1,
    pendingTributeItems: [{ payer: 3, receiver: 0 }],
  });
  advanceOpeningTribute(room);

  const automaticReturn = weakestReturnCard(room.hands[0], rank);
  const chosenReturn =
    room.hands[0].find(
      (card) =>
        card.kind === "suited" &&
        returnRankStrength(card.rank) < returnRankStrength("10") &&
        !isHeartRankWild(card, rank) &&
        card.id !== automaticReturn.id,
    ) ?? automaticReturn;

  advanceOpeningTribute(room, 0, [chosenReturn.id]);

  expect(room.openingTribute?.status).toBe("completed");
  expect(room.openingTribute?.phase).toBe("done");
  expect(room.openingTribute?.activeCard).toEqual(chosenReturn);
  expect(room.openingTribute?.exchanges?.[0].returnCard).toEqual(chosenReturn);
  expect(room.hands[0].map((card) => card.id)).not.toContain(chosenReturn.id);
  expect(room.hands[3].map((card) => card.id)).toContain(chosenReturn.id);
  expect(room.hands[0]).toHaveLength(27);
  expect(room.hands[3]).toHaveLength(27);
});

it("assigns double tribute cards by strength and lets the strongest tribute payer lead", () => {
  const rank: GameRank = "K";
  const baseRoom = createRoom({ rank, seed: 1 });
  const firstPayerCard = strongestTributeCard(baseRoom.hands[1], rank);
  const secondPayerCard = strongestTributeCard(baseRoom.hands[3], rank);
  const strongerPayer = tributeCardStrength(firstPayerCard, rank) > tributeCardStrength(secondPayerCard, rank) ? 1 : 3;
  const strongestCard = strongerPayer === 1 ? firstPayerCard : secondPayerCard;
  const secondCard = strongerPayer === 1 ? secondPayerCard : firstPayerCard;

  const room = createRoom({
    rank,
    seed: 1,
    pendingTributeItems: [
      { payer: 1, receiver: 0 },
      { payer: 3, receiver: 2 },
    ],
  });

  advanceOpeningTribute(room);
  advanceOpeningTribute(room);
  const firstReturn = weakestReturnCard(room.hands[0], rank);
  advanceOpeningTribute(room, 0, [firstReturn.id]);
  advanceOpeningTribute(room);

  expect(room.openingTribute?.status).toBe("completed");
  expect(room.openingTribute?.exchanges?.map((exchange) => ({
    payer: exchange.payer,
    receiver: exchange.receiver,
    tributeCard: exchange.tributeCard.id,
  }))).toEqual([
    { payer: strongerPayer, receiver: 0, tributeCard: strongestCard.id },
    { payer: strongerPayer === 1 ? 3 : 1, receiver: 2, tributeCard: secondCard.id },
  ]);
  expect(room.currentTurn).toBe(strongerPayer);
});

function strongestTributeCard(hand: Card[], gameRank: GameRank): Card {
  const card = [...hand]
    .filter((candidate) => !isHeartRankWild(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(right, gameRank) - tributeCardStrength(left, gameRank))[0];

  if (card === undefined) {
    throw new Error("Expected a tribute card.");
  }

  return card;
}

function weakestReturnCard(hand: Card[], gameRank: GameRank): Card {
  const card = [...hand]
    .filter((candidate) => candidate.kind === "suited" && returnRankStrength(candidate.rank) < returnRankStrength("10"))
    .filter((candidate) => !isHeartRankWild(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(left, gameRank) - tributeCardStrength(right, gameRank))[0];

  if (card === undefined) {
    throw new Error("Expected a return card.");
  }

  return card;
}

function suited(rank: Rank, suit: Suit, copy: 1 | 2 = 1): Card {
  const card = createDeck().find(
    (candidate) => candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit && candidate.copy === copy,
  );
  if (card === undefined) {
    throw new Error(`Missing ${suit} ${rank}`);
  }
  return card;
}

function tributeCardStrength(card: Card, gameRank: GameRank): number {
  if (card.kind === "joker") {
    return rankStrength(card.rank, gameRank) * 10;
  }

  return rankStrength(card.rank, gameRank) * 10 + suitStrength(card.suit);
}

function suitStrength(suit: Suit): number {
  return { spades: 4, clubs: 3, hearts: 2, diamonds: 1 }[suit];
}

function returnRankStrength(rank: Rank): number {
  return ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].indexOf(rank);
}
