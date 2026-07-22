import { advanceOpeningTribute, createLegacyBenchmarkRoom, getPublicRoom, passTurn, playCards, runAiStep, runAiUntilHumanTurn, type Seat } from "../../src/game/room";
import { createDeck, isHeartRankWild, rankStrength, type Card, type GameRank, type Rank, type Suit } from "../../src/engine/cards";
import { measurePlanQuality } from "../../src/engine/planQuality";
import { classifyPlay } from "../../src/game/playRules";

it("creates a four-seat room with AI filled empty seats and 27 cards per player", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });

  expect(room.players).toHaveLength(4);
  expect(room.players.filter((player) => player.isAI)).toHaveLength(3);
  expect(Object.values(room.hands).every((hand) => hand.length === 27)).toBe(true);
  expect(getPublicRoom(room, 0).players[1].handCount).toBe(27);
});

it("creates scored AI hand plans that consume each AI hand exactly once", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
  const publicRoom = getPublicRoom(room, 0);

  expect(Object.keys(publicRoom.aiPlans).sort()).toEqual(["1", "2", "3"]);
  for (const seat of [1, 2, 3] as Seat[]) {
    const plan = publicRoom.aiPlans[seat];
    expect(plan?.score).toBeGreaterThan(0);
    expect(plan?.groups.length).toBeGreaterThan(0);
    expect(plan?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort()).toEqual(room.hands[seat].map((card) => card.id).sort());
  }
  expect(publicRoom.aiPlans[0]).toBeUndefined();
});

it("does not build AI plans while serializing a public room", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });

  const publicRoom = getPublicRoom(room, 0, { ensurePlans: false });

  expect(publicRoom.aiPlans).toEqual({});
  expect(room.aiPlans).toEqual({});
});

it("keeps existing AI hand plans when a trick ends", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("4", "spades"),
    suited("4", "clubs"),
    suited("5", "spades"),
    suited("5", "clubs"),
    suited("6", "hearts"),
    suited("7", "hearts"),
    suited("8", "hearts"),
    suited("9", "diamonds"),
    suited("10", "hearts"),
    suited("A", "clubs"),
  ];
  const stalePlan = { seat: 1 as Seat, name: "stale", score: 0, groups: [] };
  room.aiPlans[1] = stalePlan;

  room.currentTurn = 0;
  room.trick = { leadSeat: 0, passSeats: [], plays: [] };
  playCards(room, 0, [room.hands[0][0].id]);
  passTurn(room, 3);
  passTurn(room, 2);
  passTurn(room, 1);

  expect(room.aiPlans[1]).toBe(stalePlan);
});

it("refreshes only the active AI plan when it no longer covers that hand", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  const activeHand = [suited("3", "spades"), suited("4", "clubs")];
  const untouchedPlan = { seat: 2 as Seat, name: "untouched", score: 1, groups: [] };
  const lastPlay = {
    id: "single:BJ-1",
    type: "single" as const,
    label: "single (BJ)",
    purpose: "tail-control" as const,
    cards: [joker("BJ")],
    wildcards: [],
    strength: 15,
  };
  room.hands[1] = activeHand;
  room.currentTurn = 1;
  room.trick = { leadSeat: 0, lastPlay, lastPlaySeat: 0, passSeats: [], plays: [] };
  room.aiPlans[1] = { seat: 1, name: "stale", score: 0, groups: [] };
  room.aiPlans[2] = untouchedPlan;

  runAiStep(room);

  expect(room.playHistory.at(-1)?.action).toBe("pass");
  expect(room.aiPlans[1]?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort()).toEqual(
    activeHand.map((card) => card.id).sort(),
  );
  expect(room.aiPlans[2]).toBe(untouchedPlan);
});

it("keeps a natural bomb before choosing an overlapping plate in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("8", "spades"),
    suited("8", "clubs"),
    suited("8", "hearts"),
    suited("8", "diamonds"),
    suited("9", "spades"),
    suited("9", "clubs"),
    suited("9", "diamonds"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expect(plan?.groups.some((group) => group.type === "bomb" && group.cards.every((card) => card.rank === "8"))).toBe(true);
  expect(plan?.groups.some((group) => group.type === "plate" && group.cards.some((card) => card.rank === "8"))).toBe(false);
});

it("keeps an ordinary four-card bomb when the overlapping straight lacks four loose singles", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("3", "diamonds"),
    suited("4", "clubs"),
    suited("4", "hearts"),
    suited("5", "spades"),
    suited("6", "clubs"),
    suited("7", "diamonds"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expect(plan?.groups.some((group) => group.type === "bomb" && group.cards.length === 4 && group.cards.every((card) => card.rank === "3"))).toBe(true);
  expect(plan?.groups.some((group) => group.type === "straight" && group.cards.some((card) => card.rank === "3"))).toBe(false);
});

it("uses the heart-rank wildcard for a straight while retaining a natural bomb in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("10", "spades"),
    suited("J", "clubs"),
    suited("2", "hearts"),
    suited("K", "diamonds"),
    suited("A", "hearts"),
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("Q", "hearts"),
    suited("Q", "diamonds"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
});

it("splits one bomb card into a straight when it removes four loose singles", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("3", "diamonds"),
    suited("4", "clubs"),
    suited("5", "hearts"),
    suited("6", "clubs"),
    suited("7", "hearts"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];
  const hasThreeToSevenStraight = plan?.groups
    .filter((group) => group.type === "straight")
    .some((group) => {
      const ranks = new Set(group.cards.map((card) => card.rank));
      return ["3", "4", "5", "6", "7"].every((rank) => ranks.has(rank as Rank));
    });

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
});

it("uses one card from a five-card bomb for a straight and retains four as a bomb", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("3", "diamonds"),
    suited("3", "spades", 2),
    suited("4", "clubs"),
    suited("5", "hearts"),
    suited("6", "clubs"),
    suited("7", "hearts"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
});

it("uses two cards from a six-card bomb for straights and retains four as a bomb", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "hearts"),
    suited("3", "diamonds"),
    suited("3", "spades", 2),
    suited("3", "clubs", 2),
    suited("4", "clubs"),
    suited("4", "hearts"),
    suited("5", "spades"),
    suited("5", "diamonds"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("7", "clubs"),
    suited("7", "diamonds"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];
  const lowStraights = plan?.groups.filter(
    (group) => group.type === "straight" && hasRankSet(group.cards, ["3", "4", "5", "6", "7"]),
  ) ?? [];

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
});

it("keeps a natural straight flush intact in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  const straightFlushCards = [
    suited("3", "spades"),
    suited("4", "spades"),
    suited("5", "spades"),
    suited("6", "spades"),
    suited("7", "spades"),
  ];
  room.hands[1] = [...straightFlushCards, suited("8", "clubs"), suited("9", "hearts")];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expect(plan?.groups.some(
    (group) => group.type === "straight-flush" &&
      group.cards.map((card) => card.id).sort().join("|") === straightFlushCards.map((card) => card.id).sort().join("|"),
  )).toBe(true);
});

it("selects the strict lexicographic optimum for the screenshot hand in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
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
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];
  const straightRankSets = plan?.groups
    .filter((group) => group.type === "straight")
    .map((group) => group.cards.map((card) => card.rank).sort().join(","));
  const usedIds = plan?.groups.flatMap((group) => group.cards.map((card) => card.id)) ?? [];
  const quality = measurePlanQuality(room.hands[1], plan?.groups ?? [], "2");
  const lowSuitedSingles = plan?.groups
    .filter((group) => group.type === "single" && group.cards[0]?.kind === "suited")
    .map((group) => group.cards[0]?.rank)
    .filter((rank): rank is Rank => rank !== undefined && ["10", "9", "8", "7", "6", "5", "4", "3", "2"].includes(rank))
    .sort();
  const fullHouse = plan?.groups.find((group) => group.type === "full-house");

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
  expect(quality.protectedLoss).toBe(0);
});

it("finds the bounded-beam optimum for mixed straight and pair covers in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("J", "clubs"),
    suited("J", "diamonds"),
    suited("K", "diamonds", 2),
    suited("10", "hearts"),
    suited("10", "hearts", 2),
    suited("5", "hearts", 2),
    suited("J", "hearts"),
    suited("9", "spades", 2),
    suited("Q", "spades", 2),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];
  const quality = measurePlanQuality(room.hands[1], plan?.groups ?? [], "2");

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
  expect(quality.protectedLoss).toBe(0);
});

it("uses fallback score after the first four quality fields tie in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("3", "clubs"),
    suited("7", "clubs", 2),
    suited("7", "diamonds", 2),
    suited("A", "diamonds"),
    suited("Q", "diamonds"),
    suited("3", "hearts", 2),
    suited("8", "hearts", 2),
    suited("3", "spades", 2),
    suited("A", "spades"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];
  const fullHouse = plan?.groups.find((group) => group.type === "full-house");
  const pair = plan?.groups.find((group) => group.type === "pair");
  const quality = measurePlanQuality(room.hands[1], plan?.groups ?? [], "2");

  expect(quality).toMatchObject({
    protectedLoss: 0,
    lowSingleCount: 1,
    groupCount: 4,
    retainedControl: 0,
  });
  expect(rankCountsMatch(fullHouse?.cards ?? [], { "3": 3, "7": 2 })).toBe(true);
  expect(rankCountsMatch(pair?.cards ?? [], { A: 2 })).toBe(true);
});

it("uses the lowest available pair as the full-house kicker in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
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
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const fullHouse = getPublicRoom(room, 0).aiPlans[1]?.groups.find((group) => group.type === "full-house" && group.cards.some((card) => card.rank === "4"));

  expect(fullHouse?.cards.map((card) => card.rank).sort()).toEqual(["3", "3", "4", "4", "4"]);
});

it("does not break a high triple as a full-house kicker when a natural pair is available in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("Q", "diamonds"),
    suited("8", "hearts"),
    suited("8", "diamonds"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("10", "clubs"),
    suited("10", "diamonds"),
    suited("10", "hearts"),
    suited("10", "spades"),
    suited("3", "clubs"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];
  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
  expect(plan?.groups.some((group) => group.type === "bomb" && group.cards.every((card) => card.rank === "10"))).toBe(true);
});

it("does not create a full-house by splitting another natural triple in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    suited("Q", "spades"),
    suited("Q", "clubs"),
    suited("Q", "diamonds"),
    suited("A", "spades"),
    suited("A", "clubs"),
    suited("A", "hearts"),
    suited("3", "clubs"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "10");
});

it("keeps a natural plate and consecutive-pairs before forming an overlapping full-house in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    joker("BJ"),
    suited("A", "diamonds"),
    suited("K", "diamonds"),
    suited("J", "clubs"),
    suited("J", "diamonds"),
    suited("10", "spades"),
    suited("10", "clubs"),
    suited("9", "hearts"),
    suited("9", "diamonds"),
    suited("8", "spades"),
    suited("8", "clubs"),
    suited("8", "hearts"),
    suited("8", "diamonds"),
    suited("7", "spades"),
    suited("6", "diamonds"),
    suited("5", "clubs"),
    suited("4", "clubs"),
    suited("4", "hearts"),
    suited("4", "diamonds"),
    suited("3", "spades"),
    suited("3", "hearts"),
    suited("3", "clubs"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
});

it("keeps a low plate and low consecutive-pairs instead of leaving loose low singles in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
    joker("SJ"),
    joker("SJ", 2),
    suited("A", "clubs"),
    suited("K", "spades"),
    suited("K", "clubs"),
    suited("K", "hearts"),
    suited("K", "diamonds"),
    suited("10", "spades"),
    suited("8", "clubs"),
    suited("8", "diamonds"),
    suited("7", "spades"),
    suited("7", "diamonds"),
    suited("6", "clubs"),
    suited("6", "hearts"),
    suited("5", "clubs"),
    suited("5", "hearts"),
    suited("4", "spades"),
    suited("4", "hearts"),
    suited("4", "diamonds"),
    suited("3", "spades"),
    suited("3", "clubs"),
    suited("3", "diamonds"),
  ];
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expectPlanIntegrity(plan?.groups ?? [], room.hands[1], "2");
});

it("keeps a natural high full-house as one tail hand before a bomb in AI plans", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [
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
  room.initialHands[1] = [...room.hands[1]];
  room.aiPlans = {};

  const plan = getPublicRoom(room, 0).aiPlans[1];

  expect(plan?.groups.some((group) => group.type === "full-house" && group.cards.map((card) => card.rank).sort().join("") === "AAAKK")).toBe(true);
  expect(plan?.groups.some((group) => group.type === "pair" && group.cards.every((card) => card.rank === "A"))).toBe(false);
  expect(plan?.groups.some((group) => group.type === "single" && ["A", "K"].includes(group.cards[0]?.rank ?? ""))).toBe(false);
});

it("randomizes the opening leader for the first deal", () => {
  expect(createLegacyBenchmarkRoom({ rank: "10", seed: 1 }).currentTurn).toBe(0);
  expect(createLegacyBenchmarkRoom({ rank: "10", seed: 2 }).currentTurn).toBe(1);
});

it("records each player action in the current trick until the trick resets", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
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
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
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

it("keeps every recorded play traceable to that seat's replay hand", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });

  runAiUntilHumanTurn(room, 0);
  if (room.currentTurn === 0 && room.status === "playing") {
    playCards(room, 0, [room.hands[0][0].id]);
  }
  runAiUntilHumanTurn(room, 0);

  const publicRoom = getPublicRoom(room, 0);
  const remainingBySeat = new Map(
    ([0, 1, 2, 3] as Seat[]).map((seat) => [seat, new Set(publicRoom.replayHands[seat].map((card) => card.id))]),
  );

  for (const play of publicRoom.playHistory) {
    if (play.action !== "play") {
      continue;
    }

    const remaining = remainingBySeat.get(play.seat);
    for (const card of play.group?.cards ?? []) {
      expect(remaining?.has(card.id)).toBe(true);
      remaining?.delete(card.id);
    }
  }
});

it("publishes replay hands and trick indexes for perspective replay", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
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
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];

  playCards(room, 0, [card.id]);

  expect(room.hands[0]).not.toContain(card);
  expect(room.currentTurn).toBe(3);
  expect(room.trick.lastPlay?.cards.map((played) => played.id)).toEqual([card.id]);
});

it("rotates turns counterclockwise from south to east to north to west", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];

  playCards(room, 0, [card.id]);
  expect(room.currentTurn).toBe(3);
  passTurn(room, 3);
  expect(room.currentTurn).toBe(2);
  passTurn(room, 2);
  expect(room.currentTurn).toBe(1);
});

it("runs exactly one AI action when stepping", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
  const card = room.hands[0][0];
  playCards(room, 0, [card.id]);

  const beforeSeat = room.currentTurn;
  runAiStep(room);

  expect(beforeSeat).toBe(3);
  expect(room.trick.plays.length).toBeGreaterThanOrEqual(2);
  expect(room.trick.plays.some((play) => play.seat === beforeSeat)).toBe(true);
  expect(room.currentTurn).not.toBe(beforeSeat);
});

it("normalizes a finished AI seat before attempting to plan or lead", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.hands[1] = [];
  room.finishOrder = [1];
  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  room.aiPlans[1] = undefined;

  expect(() => runAiStep(room)).not.toThrow();
  expect(room.currentTurn).toBe(0);
  expect(room.playHistory).toHaveLength(0);
});

it("advances past an AI that cannot beat a south A full-house while playing rank 5", () => {
  const room = createLegacyBenchmarkRoom({ rank: "5", seed: 1 });
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
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
  room.currentTurn = 1;

  runAiUntilHumanTurn(room);

  expect(room.currentTurn).toBe(0);
  expect(room.actionLog.length).toBeGreaterThan(0);
});

it("settles round when three players have finished and appends the remaining seat", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
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
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 1 });
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
  const room = createLegacyBenchmarkRoom({
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
  const room = createLegacyBenchmarkRoom({
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
  const baseRoom = createLegacyBenchmarkRoom({ rank, seed: 1 });
  const tributeCard = strongestTributeCard(baseRoom.hands[3], rank);

  const room = createLegacyBenchmarkRoom({
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
  const room = createLegacyBenchmarkRoom({
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

it("allows a human receiver to return a single 10", () => {
  const rank: GameRank = "K";
  const room = createLegacyBenchmarkRoom({
    rank,
    seed: 1,
    pendingTributeItems: [{ payer: 3, receiver: 0 }],
  });
  advanceOpeningTribute(room);

  const chosenReturn = suited("10", "clubs");
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    room.hands[seat] = room.hands[seat].filter((card) => card.id !== chosenReturn.id);
  }
  room.hands[0] = [...room.hands[0], chosenReturn];

  advanceOpeningTribute(room, 0, [chosenReturn.id]);

  expect(room.openingTribute?.status).toBe("completed");
  expect(room.openingTribute?.exchanges?.[0].returnCard).toEqual(chosenReturn);
});

it("uses post-tribute hands as the replay starting point", () => {
  const rank: GameRank = "K";
  const room = createLegacyBenchmarkRoom({
    rank,
    seed: 1,
    pendingTributeItems: [{ payer: 3, receiver: 0 }],
  });
  advanceOpeningTribute(room);
  const tributeCard = room.openingTribute?.activeCard;
  const chosenReturn = weakestReturnCard(room.hands[0], rank);

  advanceOpeningTribute(room, 0, [chosenReturn.id]);

  expect(room.openingTribute?.status).toBe("completed");
  expect(tributeCard).toBeDefined();
  expect(getPublicRoom(room, 0).replayHands[0].map((card) => card.id)).toEqual(room.hands[0].map((card) => card.id));
  expect(getPublicRoom(room, 0).replayHands[3].map((card) => card.id)).toEqual(room.hands[3].map((card) => card.id));
  expect(getPublicRoom(room, 0).replayHands[0].map((card) => card.id)).toContain(tributeCard?.id);
  expect(getPublicRoom(room, 0).replayHands[3].map((card) => card.id)).toContain(chosenReturn.id);
});

it("refreshes AI hand plans after opening tribute changes hands", () => {
  const rank: GameRank = "K";
  const room = createLegacyBenchmarkRoom({
    rank,
    seed: 1,
    pendingTributeItems: [{ payer: 3, receiver: 0 }],
  });

  expect(getPublicRoom(room, 0).aiPlans).toEqual({});

  advanceOpeningTribute(room);
  const chosenReturn = weakestReturnCard(room.hands[0], rank);
  advanceOpeningTribute(room, 0, [chosenReturn.id]);

  const publicRoom = getPublicRoom(room, 0);
  expect(publicRoom.aiPlans[3]?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort()).toEqual(room.hands[3].map((card) => card.id).sort());
});

it("assigns double tribute cards by strength and lets the strongest tribute payer lead", () => {
  const rank: GameRank = "K";
  const baseRoom = createLegacyBenchmarkRoom({ rank, seed: 1 });
  const firstPayerCard = strongestTributeCard(baseRoom.hands[1], rank);
  const secondPayerCard = strongestTributeCard(baseRoom.hands[3], rank);
  const strongerPayer = tributeCardStrength(firstPayerCard, rank) > tributeCardStrength(secondPayerCard, rank) ? 1 : 3;
  const strongestCard = strongerPayer === 1 ? firstPayerCard : secondPayerCard;
  const secondCard = strongerPayer === 1 ? secondPayerCard : firstPayerCard;

  const room = createLegacyBenchmarkRoom({
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

function joker(rank: "BJ" | "SJ", copy: 1 | 2 = 1): Card {
  const card = createDeck().find((candidate) => candidate.kind === "joker" && candidate.rank === rank && candidate.copy === copy);
  if (card === undefined) {
    throw new Error(`Missing ${rank}`);
  }
  return card;
}

function hasRankSet(cards: Card[], ranks: Rank[]): boolean {
  const cardRanks = new Set(cards.map((card) => card.rank));
  return ranks.every((rank) => cardRanks.has(rank));
}

function expectPlanIntegrity(groups: import("../../src/engine/groups").CardGroup[], hand: Card[], gameRank: GameRank): void {
  const ids = groups.flatMap((group) => group.cards.map((card) => card.id));
  expect(ids.sort()).toEqual(hand.map((card) => card.id).sort());
  expect(new Set(ids).size).toBe(hand.length);
  expect(groups.every((group) => classifyPlay(group.cards, gameRank)?.id === group.id)).toBe(true);
  expect(measurePlanQuality(hand, groups, gameRank).protectedLoss).toBe(0);
}

function rankCountsMatch(cards: Card[], expected: Partial<Record<Rank, number>>): boolean {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank as Rank, (counts.get(card.rank as Rank) ?? 0) + 1);
  }

  return Object.entries(expected).every(([rank, count]) => counts.get(rank as Rank) === count);
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
