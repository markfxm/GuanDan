import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import type { CardGroup } from "../../src/engine/groups";
import { comparePlanQuality, isLegalBombReduction, measurePlanQuality, type PlanQuality } from "../../src/engine/planQuality";

function cardFixture(rank: Card["rank"], suit: Extract<Card, { kind: "suited" }>["suit"], copy: 1 | 2 = 1): Card {
  const card = createDeck().find(
    (candidate) =>
      candidate.kind === "suited" && candidate.rank === rank && candidate.suit === suit && candidate.copy === copy,
  );

  if (card === undefined) {
    throw new Error(`Missing card ${suit} ${rank} #${copy}`);
  }

  return card;
}

function jokerFixture(rank: Extract<Card, { kind: "joker" }>["rank"], copy: 1 | 2 = 1): Card {
  const card = createDeck().find((candidate) => candidate.kind === "joker" && candidate.rank === rank && candidate.copy === copy);

  if (card === undefined) {
    throw new Error(`Missing joker ${rank} #${copy}`);
  }

  return card;
}

function singleGroup(card: Card): CardGroup {
  return {
    id: `single:${card.id}`,
    type: "single",
    label: `single (${card.id})`,
    purpose: "risk",
    cards: [card],
    wildcards: [],
    strength: 1,
  };
}

function groupFixture(type: CardGroup["type"], cards: Card[], wildcards: Card[] = []): CardGroup {
  const cardIds = [...cards].map((card) => card.id).sort().join(",");

  return {
    id: `${type}:${cardIds}`,
    type,
    label: `${type} (${cardIds})`,
    purpose: "risk",
    cards,
    wildcards,
    strength: cards.length,
  };
}

function quality(overrides: Partial<PlanQuality> = {}): PlanQuality {
  return {
    protectedLoss: 0,
    lowSingleCount: 0,
    groupCount: 0,
    retainedControl: 0,
    fallbackScore: 0,
    ...overrides,
  };
}

it("orders plan quality lexicographically by protected loss first", () => {
  const left = quality({ protectedLoss: 0, lowSingleCount: 9, groupCount: 9, retainedControl: 0, fallbackScore: 0 });
  const right = quality({ protectedLoss: 1, lowSingleCount: 0, groupCount: 0, retainedControl: 99, fallbackScore: 99 });

  expect(comparePlanQuality(left, right)).toBeLessThan(0);
});

it("orders plan quality lexicographically by low singles second", () => {
  const left = quality({ protectedLoss: 0, lowSingleCount: 0, groupCount: 9, retainedControl: 0, fallbackScore: 0 });
  const right = quality({ protectedLoss: 0, lowSingleCount: 1, groupCount: 0, retainedControl: 99, fallbackScore: 99 });

  expect(comparePlanQuality(left, right)).toBeLessThan(0);
});

it("orders plan quality lexicographically by group count third", () => {
  const left = quality({ protectedLoss: 0, lowSingleCount: 0, groupCount: 1, retainedControl: 0, fallbackScore: 0 });
  const right = quality({ protectedLoss: 0, lowSingleCount: 0, groupCount: 2, retainedControl: 99, fallbackScore: 99 });

  expect(comparePlanQuality(left, right)).toBeLessThan(0);
});

it("orders plan quality lexicographically by retained control fourth", () => {
  const left = quality({ protectedLoss: 0, lowSingleCount: 0, groupCount: 0, retainedControl: 2, fallbackScore: 0 });
  const right = quality({ protectedLoss: 0, lowSingleCount: 0, groupCount: 0, retainedControl: 1, fallbackScore: 99 });

  expect(comparePlanQuality(left, right)).toBeLessThan(0);
});

it("orders plan quality lexicographically by fallback score last", () => {
  const left = quality({ protectedLoss: 0, lowSingleCount: 0, groupCount: 0, retainedControl: 0, fallbackScore: 2 });
  const right = quality({ protectedLoss: 0, lowSingleCount: 0, groupCount: 0, retainedControl: 0, fallbackScore: 1 });

  expect(comparePlanQuality(left, right)).toBeLessThan(0);
});

it("does not count a non-heart game-rank single as a low single", () => {
  const cards = [cardFixture("10", "spades")];
  const groups = [singleGroup(cards[0])];

  const measured = measurePlanQuality(cards, groups, "10");

  expect(measured.lowSingleCount).toBe(0);
});

it("measures low singles, retained control, group count, and fallback score", () => {
  const cards = [
    cardFixture("9", "spades"),
    cardFixture("9", "hearts"),
    cardFixture("A", "clubs"),
    jokerFixture("BJ"),
    jokerFixture("SJ"),
  ];

  const groups = [
    singleGroup(cards[0]),
    singleGroup(cards[1]),
    singleGroup(cards[2]),
    singleGroup(cards[3]),
    singleGroup(cards[4]),
  ];

  const measured = measurePlanQuality(cards, groups, "10", 7);

  expect(measured).toEqual({
    protectedLoss: 0,
    lowSingleCount: 2,
    groupCount: 5,
    retainedControl: 3,
    fallbackScore: 7,
  });
});

it("treats heart-rank wildcards and jokers as non-low singles", () => {
  const cards = [cardFixture("10", "hearts"), jokerFixture("BJ")];
  const groups = cards.map((card) => singleGroup(card));

  const measured = measurePlanQuality(cards, groups, "10");

  expect(measured.lowSingleCount).toBe(0);
});

it("defaults fallback score to zero", () => {
  const cards = [cardFixture("9", "clubs")];
  const groups = [singleGroup(cards[0])];

  const measured = measurePlanQuality(cards, groups, "10");

  expect(measured.fallbackScore).toBe(0);
});

it("allows sacrificing one card from a four-card natural bomb with four natural loose singles", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
  ];
  const looseSingles = [
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ];
  const sourceBomb = groupFixture("bomb", bombCards);
  const consumingStraight = groupFixture("straight", [bombCards[0], ...looseSingles]);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight], gameRank)).toBe(true);
});

it("rejects sacrificing a four-card natural bomb when a straight card also belongs to a pair", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
  ];
  const straightCards = [
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ];
  const pairMate = cardFixture("K", "clubs", 1);
  const sourceBomb = groupFixture("bomb", bombCards);
  const consumingStraight = groupFixture("straight", [bombCards[0], ...straightCards]);
  const blockingPair = groupFixture("pair", [straightCards[1], pairMate]);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight, blockingPair], gameRank)).toBe(false);
});

it("rejects sacrificing a four-card natural bomb when a straight edge card belongs to another straight using a different bomb card", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
  ];
  const straightCards = [
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ];
  const sourceBomb = groupFixture("bomb", bombCards);
  const consumingStraight = groupFixture("straight", [bombCards[0], ...straightCards]);
  const alternateStraight = groupFixture("straight", [bombCards[1], ...straightCards]);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight, alternateStraight], gameRank)).toBe(false);
});

it("rejects sacrificing a four-card natural bomb when a straight edge card belongs to a straight flush using a different bomb card", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
  ];
  const straightCards = [
    cardFixture("A", "spades", 1),
    cardFixture("K", "spades", 1),
    cardFixture("Q", "spades", 1),
    cardFixture("J", "spades", 1),
  ];
  const sourceBomb = groupFixture("bomb", bombCards);
  const consumingStraight = groupFixture("straight", [bombCards[0], ...straightCards]);
  const conflictingStraightFlush = groupFixture("straight-flush", [bombCards[1], ...straightCards]);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight, conflictingStraightFlush], gameRank)).toBe(false);
});

it("rejects sacrificing a four-card natural bomb when the same card set is also a straight flush", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
  ];
  const sameCards = [
    bombCards[0],
    cardFixture("A", "spades", 1),
    cardFixture("K", "spades", 1),
    cardFixture("Q", "spades", 1),
    cardFixture("J", "spades", 1),
  ];
  const sourceBomb = groupFixture("bomb", bombCards);
  const consumingStraight = groupFixture("straight", sameCards);
  const conflictingStraightFlush = groupFixture("straight-flush", sameCards);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight, conflictingStraightFlush], gameRank)).toBe(false);
});

it("allows a five-card natural bomb to contribute one card", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
  ];
  const consumingStraight = groupFixture("straight", [
    bombCards[0],
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ]);

  expect(isLegalBombReduction(groupFixture("bomb", bombCards), consumingStraight, [consumingStraight], gameRank)).toBe(true);
});

it("rejects a five-card natural bomb when the consuming straight has a same-card-set straight flush conflict", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
  ];
  const sameCards = [
    bombCards[0],
    cardFixture("A", "spades", 1),
    cardFixture("K", "spades", 1),
    cardFixture("Q", "spades", 1),
    cardFixture("J", "spades", 1),
  ];
  const sourceBomb = groupFixture("bomb", bombCards);
  const consumingStraight = groupFixture("straight", sameCards);
  const conflictingStraightFlush = groupFixture("straight-flush", sameCards);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight, conflictingStraightFlush], gameRank)).toBe(false);
});

it("allows a six-card natural bomb to contribute two cards", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("10", "diamonds", 2),
  ];
  const consumingStraight = groupFixture("straight", [
    bombCards[0],
    bombCards[1],
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
  ]);

  expect(isLegalBombReduction(groupFixture("bomb", bombCards), consumingStraight, [consumingStraight], gameRank)).toBe(true);
});

it("rejects a six-card natural bomb when the consuming straight has a same-card-set straight flush conflict", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("10", "diamonds", 2),
  ];
  const sameCards = [
    bombCards[0],
    bombCards[1],
    cardFixture("A", "spades", 1),
    cardFixture("K", "spades", 1),
    cardFixture("Q", "spades", 1),
  ];
  const sourceBomb = groupFixture("bomb", bombCards);
  const consumingStraight = groupFixture("straight", sameCards);
  const conflictingStraightFlush = groupFixture("straight-flush", sameCards);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight, conflictingStraightFlush], gameRank)).toBe(false);
});

it("rejects a six-card natural bomb contributing three cards", () => {
  const gameRank: GameRank = "2";
  const bombCards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("10", "diamonds", 2),
  ];
  const consumingStraight = groupFixture("straight", [
    bombCards[0],
    bombCards[1],
    bombCards[2],
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
  ]);

  expect(isLegalBombReduction(groupFixture("bomb", bombCards), consumingStraight, [consumingStraight], gameRank)).toBe(false);
});

it("rejects wildcard bombs as bomb-reduction sources", () => {
  const gameRank: GameRank = "2";
  const wildcard = cardFixture("2", "hearts", 1);
  const sourceBomb = groupFixture(
    "bomb",
    [
      cardFixture("10", "spades", 1),
      cardFixture("10", "spades", 2),
      cardFixture("10", "clubs", 1),
      wildcard,
    ],
    [wildcard],
  );
  const consumingStraight = groupFixture("straight", [
    sourceBomb.cards[0],
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ]);

  expect(isLegalBombReduction(sourceBomb, consumingStraight, [consumingStraight], gameRank)).toBe(false);
});

it("rejects straight flush source or consuming groups for bomb reduction", () => {
  const gameRank: GameRank = "2";
  const naturalBomb = groupFixture("bomb", [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
  ]);
  const straightFlush = groupFixture("straight-flush", [
    cardFixture("A", "spades", 1),
    cardFixture("K", "spades", 1),
    cardFixture("Q", "spades", 1),
    cardFixture("J", "spades", 1),
    cardFixture("10", "spades", 1),
  ]);
  const straight = groupFixture("straight", [
    naturalBomb.cards[0],
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ]);

  expect(isLegalBombReduction(straightFlush, straight, [straight], gameRank)).toBe(false);
  expect(isLegalBombReduction(naturalBomb, straightFlush, [straightFlush], gameRank)).toBe(false);
});

it("counts a natural straight flush omitted from the final groups as protected loss", () => {
  const cards = [
    cardFixture("A", "spades", 1),
    cardFixture("K", "spades", 1),
    cardFixture("Q", "spades", 1),
    cardFixture("J", "spades", 1),
    cardFixture("10", "spades", 1),
  ];

  const measured = measurePlanQuality(cards, cards.map(singleGroup), "2");

  expect(measured.protectedLoss).toBe(1);
});

it("does not count a legally reduced five-card natural bomb as protected loss", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ];
  const reducedBomb = groupFixture("bomb", cards.slice(1, 5));
  const consumingStraight = groupFixture("straight", [cards[0], cards[5], cards[6], cards[7], cards[8]]);

  const measured = measurePlanQuality(cards, [reducedBomb, consumingStraight], "2");

  expect(measured.protectedLoss).toBe(0);
});

it("counts a reduced five-card natural bomb as protected loss when the remaining cards are not kept as a bomb group", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ];
  const consumingStraight = groupFixture("straight", [cards[0], cards[5], cards[6], cards[7], cards[8]]);
  const splitRemainder = cards.slice(1, 5).map(singleGroup);

  const measured = measurePlanQuality(cards, [consumingStraight, ...splitRemainder], "2");

  expect(measured.protectedLoss).toBe(1);
});

it("counts a four-card bomb sacrifice with alternate straight variants as protected loss", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ];
  const consumingStraight = groupFixture("straight", [cards[0], cards[4], cards[5], cards[6], cards[7]]);
  const remainingSingles = cards.slice(1, 4).map(singleGroup);

  const measured = measurePlanQuality(cards, [consumingStraight, ...remainingSingles], "2");

  expect(measured.protectedLoss).toBe(1);
});

it("counts a four-card bomb used with non-loose straight cards as protected loss", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "diamonds", 1),
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("K", "clubs", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
  ];
  const consumingStraight = groupFixture("straight", [cards[0], cards[4], cards[5], cards[7], cards[8]]);
  const remainingGroups = [singleGroup(cards[1]), singleGroup(cards[2]), singleGroup(cards[3]), singleGroup(cards[6])];

  const measured = measurePlanQuality(cards, [consumingStraight, ...remainingGroups], "2");

  expect(measured.protectedLoss).toBe(1);
});

it("counts only the largest natural bomb per rank as protected loss", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("10", "diamonds", 2),
  ];

  const measured = measurePlanQuality(cards, cards.map(singleGroup), "2");

  expect(measured.protectedLoss).toBe(1);
});

it("does not count a legally reduced six-card natural bomb down to four cards as protected loss", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("10", "diamonds", 2),
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
  ];
  const reducedBomb = groupFixture("bomb", [cards[2], cards[3], cards[4], cards[5]]);
  const consumingStraight = groupFixture("straight", [cards[0], cards[1], cards[6], cards[7], cards[8]]);

  const measured = measurePlanQuality(cards, [reducedBomb, consumingStraight], "2");

  expect(measured.protectedLoss).toBe(0);
});

it("does not count a six-card natural bomb as protected loss when two disjoint straights each consume one bomb card and a four-card bomb remains", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("10", "diamonds", 2),
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
    cardFixture("J", "clubs", 1),
    cardFixture("9", "clubs", 1),
    cardFixture("8", "diamonds", 1),
    cardFixture("7", "hearts", 1),
    cardFixture("6", "clubs", 1),
  ];
  const firstStraight = groupFixture("straight", [cards[0], cards[6], cards[7], cards[8], cards[9]]);
  const secondStraight = groupFixture("straight", [cards[1], cards[10], cards[11], cards[12], cards[13]]);
  const remainingBomb = groupFixture("bomb", [cards[2], cards[3], cards[4], cards[5]]);

  const measured = measurePlanQuality(cards, [firstStraight, secondStraight, remainingBomb], "2");

  expect(measured.protectedLoss).toBe(0);
});

it("counts a reduced six-card natural bomb as protected loss when the remaining cards are split instead of kept as a bomb group", () => {
  const cards = [
    cardFixture("10", "spades", 1),
    cardFixture("10", "spades", 2),
    cardFixture("10", "clubs", 1),
    cardFixture("10", "clubs", 2),
    cardFixture("10", "diamonds", 1),
    cardFixture("10", "diamonds", 2),
    cardFixture("A", "clubs", 1),
    cardFixture("K", "diamonds", 1),
    cardFixture("Q", "hearts", 1),
  ];
  const consumingStraight = groupFixture("straight", [cards[0], cards[1], cards[6], cards[7], cards[8]]);
  const splitRemainder = [groupFixture("pair", [cards[2], cards[3]]), groupFixture("pair", [cards[4], cards[5]])];

  const measured = measurePlanQuality(cards, [consumingStraight, ...splitRemainder], "2");

  expect(measured.protectedLoss).toBe(1);
});
