export const RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export const SUITS = ["spades", "clubs", "hearts", "diamonds"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type JokerRank = "SJ" | "BJ";
export type GameRank = Rank;

export type SuitedCard = {
  id: string;
  kind: "suited";
  rank: Rank;
  suit: Suit;
  copy: 1 | 2;
};

export type JokerCard = {
  id: string;
  kind: "joker";
  rank: JokerRank;
  copy: 1 | 2;
};

export type Card = SuitedCard | JokerCard;

const SUIT_CODES: Record<Suit, string> = {
  spades: "S",
  clubs: "C",
  hearts: "H",
  diamonds: "D",
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  clubs: "♣",
  hearts: "♥",
  diamonds: "♦",
};

const JOKERS: JokerRank[] = ["SJ", "BJ"];

export function createDeck(): Card[] {
  const deck: Card[] = [];

  for (const copy of [1, 2] as const) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `${SUIT_CODES[suit]}${rank}-${copy}`,
          kind: "suited",
          rank,
          suit,
          copy,
        });
      }
    }

    for (const rank of JOKERS) {
      deck.push({
        id: `Joker-${rank}-${copy}`,
        kind: "joker",
        rank,
        copy,
      });
    }
  }

  return deck;
}

export function getRankOrder(gameRank: GameRank): (Rank | JokerRank)[] {
  return ["BJ", "SJ", gameRank, ...RANKS.filter((rank) => rank !== gameRank)];
}

export function rankStrength(rank: Rank | JokerRank, gameRank: GameRank): number {
  const order = getRankOrder(gameRank);
  const index = order.indexOf(rank);

  if (index === -1) {
    throw new RangeError(`Unknown rank: ${rank}`);
  }

  return order.length - index;
}

export function isHeartRankWild(card: Card, gameRank: GameRank): boolean {
  return card.kind === "suited" && card.suit === "hearts" && card.rank === gameRank;
}

export function formatCard(card: Card): string {
  if (card.kind === "joker") {
    return `${card.rank === "BJ" ? "大王" : "小王"}#${card.copy}`;
  }

  return `${SUIT_SYMBOLS[card.suit]}${card.rank}#${card.copy}`;
}
