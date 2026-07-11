import { rankStrength, type Card, type GameRank } from "../engine/cards";
import { detectGroups, type CardGroup } from "../engine/groups";

const TYPE_PRIORITY: Record<CardGroup["type"], number> = {
  "joker-bomb": 10,
  bomb: 7,
  "straight-flush": 8,
  plate: 6,
  "consecutive-pairs": 6,
  "full-house": 5,
  straight: 6,
  triple: 3,
  pair: 2,
  single: 1,
};

export function classifyPlay(cards: Card[], gameRank: GameRank): CardGroup | undefined {
  if (cards.length === 0) {
    return undefined;
  }

  const ids = [...cards.map((card) => card.id)].sort().join(",");
  return detectGroups(cards, gameRank)
    .filter((group) => group.cards.length === cards.length)
    .filter((group) => group.cards.map((card) => card.id).sort().join(",") === ids)
    .sort((left, right) => TYPE_PRIORITY[right.type] - TYPE_PRIORITY[left.type] || playPower(right, gameRank) - playPower(left, gameRank))[0];
}

export function canBeatPlay(candidate: CardGroup, lastPlay: CardGroup | undefined, gameRank: GameRank): boolean {
  if (lastPlay === undefined) {
    return true;
  }

  const candidateBomb = isPowerPlay(candidate);
  const lastBomb = isPowerPlay(lastPlay);

  if (candidateBomb || lastBomb) {
    return playPower(candidate, gameRank) > playPower(lastPlay, gameRank);
  }

  return candidate.type === lastPlay.type && candidate.cards.length === lastPlay.cards.length && candidate.strength > lastPlay.strength;
}

export function playPower(group: CardGroup, gameRank: GameRank): number {
  if (group.type === "joker-bomb") {
    return 10000;
  }

  if (group.type === "bomb") {
    const rank = group.cards[0]?.rank;
    const strength = rank === undefined ? group.strength : rankStrength(rank, gameRank);
    if (group.cards.length >= 6) {
      return 8000 + group.cards.length * 100 + strength;
    }

    return 5000 + group.cards.length * 100 + strength;
  }

  if (group.type === "straight-flush") {
    return 7500 + group.strength;
  }

  return TYPE_PRIORITY[group.type] * 100 + group.strength;
}

function isPowerPlay(group: CardGroup): boolean {
  return group.type === "bomb" || group.type === "straight-flush" || group.type === "joker-bomb";
}
