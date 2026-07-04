import { getRankOrder, type Card, type GameRank, type JokerRank, type Rank, type Suit } from "../engine/cards";

export type HandDisplayGroup = {
  rank: Rank | JokerRank;
  cards: Card[];
};

const SUIT_DISPLAY_ORDER: Record<Suit, number> = {
  spades: 0,
  clubs: 1,
  hearts: 2,
  diamonds: 3,
};

export function sortCardsForHandDisplay(cards: Card[], gameRank: GameRank): Card[] {
  const rankOrder = getRankOrder(gameRank);

  return [...cards].sort((left, right) => {
    const rankDifference = rankOrder.indexOf(left.rank) - rankOrder.indexOf(right.rank);
    if (rankDifference !== 0) {
      return rankDifference;
    }

    const suitDifference = getSuitOrder(left) - getSuitOrder(right);
    if (suitDifference !== 0) {
      return suitDifference;
    }

    return left.copy - right.copy;
  });
}

export function groupCardsForHandDisplay(cards: Card[], gameRank: GameRank): HandDisplayGroup[] {
  const groups: HandDisplayGroup[] = [];

  for (const card of sortCardsForHandDisplay(cards, gameRank)) {
    const current = groups[groups.length - 1];
    if (current?.rank === card.rank) {
      current.cards.push(card);
    } else {
      groups.push({ rank: card.rank, cards: [card] });
    }
  }

  return groups;
}

function getSuitOrder(card: Card): number {
  if (card.kind === "joker") {
    return 0;
  }

  return SUIT_DISPLAY_ORDER[card.suit];
}
