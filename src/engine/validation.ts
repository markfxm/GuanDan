import { createDeck, type Card, type GameRank } from "./cards";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function dealHand(_gameRank: GameRank, seed = Date.now()): Card[] {
  const deck = createDeck();
  const random = seededRandom(seed);

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck.slice(0, 27);
}

export function validateHand(cards: Card[]): ValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (cards.length !== 27) {
    errors.push("Hand must contain exactly 27 cards.");
  }

  for (const card of cards) {
    if (seenIds.has(card.id)) {
      errors.push(`Duplicate physical card: ${card.id}`);
      continue;
    }

    seenIds.add(card.id);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}
