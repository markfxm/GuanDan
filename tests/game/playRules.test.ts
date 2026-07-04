import { createDeck, type Card, type Rank, type Suit } from "../../src/engine/cards";
import { canBeatPlay, classifyPlay, playPower } from "../../src/game/playRules";

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

it("classifies common Guandan play types", () => {
  expect(classifyPlay([suited("A", "spades")], "10")?.type).toBe("single");
  expect(classifyPlay([suited("A", "spades"), suited("A", "clubs")], "10")?.type).toBe("pair");
  expect(classifyPlay(["9", "8", "7", "6", "5"].map((rank) => suited(rank as Rank, "spades")), "10")?.type).toBe("straight-flush");
  expect(classifyPlay(["A", "5", "4", "3", "2"].map((rank) => suited(rank as Rank, "clubs")), "10")?.type).toBe("straight-flush");
  expect(
    classifyPlay([suited("9", "spades"), suited("9", "clubs"), suited("8", "spades"), suited("8", "clubs"), suited("7", "spades"), suited("7", "clubs")], "10")?.type,
  ).toBe("consecutive-pairs");
  expect(classifyPlay([joker("SJ", 1), joker("SJ", 2)], "10")?.type).toBe("pair");
  expect(classifyPlay([joker("BJ", 1), joker("BJ", 2), joker("SJ", 1), joker("SJ", 2)], "10")?.type).toBe("joker-bomb");
});

it("allows a higher same-type play to beat the last play", () => {
  const low = classifyPlay([suited("7", "spades")], "10");
  const high = classifyPlay([suited("A", "spades")], "10");

  expect(high && low && canBeatPlay(high, low, "10")).toBe(true);
  expect(low && high && canBeatPlay(low, high, "10")).toBe(false);
});

it("orders ordinary straights by their highest card", () => {
  const south = classifyPlay([suited("J", "spades"), suited("10", "clubs"), suited("9", "spades"), suited("8", "clubs"), suited("7", "hearts")], "10");
  const east = classifyPlay([suited("Q", "spades"), suited("J", "diamonds"), suited("10", "clubs"), suited("9", "diamonds"), suited("8", "spades")], "10");
  const north = classifyPlay([suited("10", "diamonds"), suited("9", "diamonds"), suited("8", "diamonds"), suited("7", "clubs"), suited("6", "diamonds")], "10");

  expect(south?.type).toBe("straight");
  expect(east?.type).toBe("straight");
  expect(north?.type).toBe("straight");
  expect(east && south && canBeatPlay(east, south, "10")).toBe(true);
  expect(north && east && canBeatPlay(north, east, "10")).toBe(false);
  expect(north && south && canBeatPlay(north, south, "10")).toBe(false);
});

it("classifies a full-house with heart-rank wildcard by its strongest valid major rank", () => {
  const lastPlay = classifyPlay([suited("A", "clubs", 2), suited("A", "hearts", 2), suited("A", "spades", 2), suited("K", "spades", 2), suited("5", "hearts", 2)], "5");
  const candidate = classifyPlay([suited("J", "clubs", 2), suited("J", "hearts"), suited("5", "diamonds", 2), suited("5", "spades"), suited("5", "hearts")], "5");

  expect(lastPlay?.type).toBe("full-house");
  expect(candidate?.type).toBe("full-house");
  expect(candidate && lastPlay && canBeatPlay(candidate, lastPlay, "5")).toBe(true);
});

it("lets bombs and straight flushes beat ordinary plays with Jiangsu ordering", () => {
  const pair = classifyPlay([suited("A", "spades"), suited("A", "clubs")], "10");
  const fourBomb = classifyPlay([suited("K", "spades"), suited("K", "clubs"), suited("K", "hearts"), suited("K", "diamonds")], "10");
  const fiveBomb = classifyPlay([suited("Q", "spades"), suited("Q", "clubs"), suited("Q", "hearts"), suited("Q", "diamonds"), suited("Q", "spades", 2)], "10");
  const straightFlush = classifyPlay(["9", "8", "7", "6", "5"].map((rank) => suited(rank as Rank, "hearts")), "10");
  const sixBomb = classifyPlay([
    suited("J", "spades"),
    suited("J", "clubs"),
    suited("J", "hearts"),
    suited("J", "diamonds"),
    suited("J", "spades", 2),
    suited("J", "clubs", 2),
  ], "10");

  expect(fourBomb && pair && canBeatPlay(fourBomb, pair, "10")).toBe(true);
  expect(straightFlush).toBeDefined();
  expect(fiveBomb).toBeDefined();
  expect(sixBomb).toBeDefined();
  expect(playPower(straightFlush!, "10")).toBeGreaterThan(playPower(fiveBomb!, "10"));
  expect(playPower(sixBomb!, "10")).toBeGreaterThan(playPower(straightFlush!, "10"));
});
