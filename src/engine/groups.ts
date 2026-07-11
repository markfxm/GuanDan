import {
  RANKS,
  SUITS,
  formatCard,
  isHeartRankWild,
  rankStrength,
  type Card,
  type GameRank,
  type Rank,
  type Suit,
} from "./cards";

export type GroupType =
  | "single"
  | "pair"
  | "triple"
  | "full-house"
  | "straight"
  | "consecutive-pairs"
  | "plate"
  | "bomb"
  | "straight-flush"
  | "joker-bomb";

export type GroupPurpose = "attack" | "engine" | "recovery" | "tail-control" | "risk" | "filler";

export type CardGroup = {
  id: string;
  type: GroupType;
  label: string;
  purpose: GroupPurpose;
  cards: Card[];
  wildcards: Card[];
  strength: number;
};

type RankedCards = {
  rank: Rank;
  cards: Card[];
};

const GROUP_PURPOSES: Record<GroupType, GroupPurpose> = {
  single: "risk",
  pair: "filler",
  triple: "filler",
  "full-house": "engine",
  straight: "engine",
  "consecutive-pairs": "engine",
  plate: "engine",
  bomb: "recovery",
  "straight-flush": "attack",
  "joker-bomb": "recovery",
};

let detectGroupsCallCount = 0;

export function resetDetectGroupsCallCount(): void {
  detectGroupsCallCount = 0;
}

export function getDetectGroupsCallCount(): number {
  return detectGroupsCallCount;
}

function groupId(type: GroupType, cards: Card[]): string {
  return `${type}:${cards
    .map((card) => card.id)
    .sort()
    .join(",")}`;
}

function createGroup(type: GroupType, cards: Card[], gameRank: GameRank, strengthRank: Rank | "SJ" | "BJ"): CardGroup {
  const baseStrength = isSequenceGroup(type) && strengthRank !== "SJ" && strengthRank !== "BJ"
    ? naturalRankStrength(strengthRank)
    : rankStrength(strengthRank, gameRank);

  return {
    id: groupId(type, cards),
    type,
    label: `${type} (${cards.map(formatCard).join(" ")})`,
    purpose: groupPurpose(type, cards, gameRank),
    cards,
    wildcards: cards.filter((card) => isHeartRankWild(card, gameRank)),
    strength: groupStrength(type, cards, baseStrength),
  };
}

function groupPurpose(type: GroupType, cards: Card[], gameRank: GameRank): GroupPurpose {
  if (type !== "single") {
    return GROUP_PURPOSES[type];
  }

  const card = cards[0];
  if (card.kind === "joker" || rankStrength(card.rank, gameRank) >= rankStrength(gameRank, gameRank)) {
    return "tail-control";
  }

  return "risk";
}

function isSequenceGroup(type: GroupType): boolean {
  return type === "straight" || type === "straight-flush" || type === "consecutive-pairs" || type === "plate";
}

function naturalRankStrength(rank: Rank): number {
  return RANKS.length - RANKS.indexOf(rank);
}

function groupStrength(type: GroupType, cards: Card[], baseStrength: number): number {
  if (type === "joker-bomb") {
    return 1000;
  }

  if (type === "bomb") {
    return 100 + cards.length * 10 + baseStrength;
  }

  if (type === "straight-flush") {
    return 80 + baseStrength;
  }

  if (type === "full-house" || type === "straight" || type === "consecutive-pairs" || type === "plate") {
    return 30 + cards.length + baseStrength;
  }

  return baseStrength;
}

function collectSuitedByRank(cards: Card[]): RankedCards[] {
  const byRank = new Map<Rank, Card[]>();

  for (const card of cards) {
    if (card.kind !== "suited") {
      continue;
    }

    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card]);
  }

  return [...byRank.entries()].map(([rank, rankedCards]) => ({ rank, cards: rankedCards }));
}

export function detectGroups(cards: Card[], gameRank: GameRank): CardGroup[] {
  detectGroupsCallCount += 1;
  const groups: CardGroup[] = cards.map((card) => createGroup("single", [card], gameRank, card.rank));
  const groupIndexById = new Map(groups.map((group, index) => [group.id, index]));
  const wildcards = sortedCards(cards.filter((card) => isHeartRankWild(card, gameRank)));

  const addGroup = (type: GroupType, groupCards: Card[], strengthRank: Rank | "SJ" | "BJ"): void => {
    if (new Set(groupCards.map((card) => card.id)).size !== groupCards.length) {
      return;
    }

    const group = createGroup(type, groupCards, gameRank, strengthRank);
    const existingIndex = groupIndexById.get(group.id);
    if (existingIndex === undefined) {
      groupIndexById.set(group.id, groups.length);
      groups.push(group);
      return;
    }

    if (group.strength > groups[existingIndex].strength) {
      groups[existingIndex] = group;
    }
  };

  for (const { rank, cards: rankedCards } of collectSuitedByRank(cards)) {
    const naturalRankedCards = sortedCards(rankedCards.filter((card) => !isHeartRankWild(card, gameRank)));

    const pair = fillSameRank(naturalRankedCards, wildcards, 2);
    if (pair !== undefined) {
      addGroup("pair", pair, rank);
    }

    const triple = fillSameRank(naturalRankedCards, wildcards, 3);
    if (triple !== undefined) {
      addGroup("triple", triple, rank);
    }

    for (const bomb of sameRankBombs(naturalRankedCards, wildcards)) {
      addGroup("bomb", bomb, rank);
    }
  }

  for (const group of detectFullHouses(cards, gameRank, wildcards)) {
    addGroup("full-house", group.cards, group.strengthRank);
  }

  for (const group of detectConsecutiveMultiples(cards, gameRank, wildcards, 2)) {
    addGroup("consecutive-pairs", group.cards, group.strengthRank);
  }

  for (const group of detectConsecutiveMultiples(cards, gameRank, wildcards, 3)) {
    addGroup("plate", group.cards, group.strengthRank);
  }

  for (const group of detectStraights(cards, gameRank, wildcards, false)) {
    addGroup("straight", group.cards, group.strengthRank);
  }

  for (const group of detectStraights(cards, gameRank, wildcards, true)) {
    addGroup("straight-flush", group.cards, group.strengthRank);
  }

  const jokers = cards.filter((card) => card.kind === "joker");
  for (const rank of ["SJ", "BJ"] as const) {
    const sameRankJokers = sortedCards(jokers.filter((card) => card.rank === rank));
    if (sameRankJokers.length >= 2) {
      addGroup("pair", sameRankJokers.slice(0, 2), rank);
    }
  }

  if (jokers.length === 4) {
    addGroup("joker-bomb", jokers, "BJ");
  }

  return groups;
}

type CandidateGroup = {
  cards: Card[];
  strengthRank: Rank;
};

type SequenceWindow = {
  ranks: Rank[];
  strengthRank: Rank;
};

function sortedCards(cards: Card[]): Card[] {
  return [...cards].sort((left, right) => left.id.localeCompare(right.id));
}

function suitedNonWildcards(cards: Card[], gameRank: GameRank): Card[] {
  return cards.filter((card) => card.kind === "suited" && !isHeartRankWild(card, gameRank));
}

function rankCards(cards: Card[], rank: Rank, gameRank: GameRank): Card[] {
  return sortedCards(suitedNonWildcards(cards, gameRank).filter((card) => card.rank === rank));
}

function suitedRankCards(cards: Card[], rank: Rank, suit: Suit, gameRank: GameRank): Card[] {
  return sortedCards(suitedNonWildcards(cards, gameRank).filter((card) => card.rank === rank && card.suit === suit));
}

function fillSameRank(naturalCards: Card[], wildcards: Card[], size: number): Card[] | undefined {
  if (naturalCards.length === 0 || naturalCards.length + wildcards.length < size) {
    return undefined;
  }

  return [...naturalCards.slice(0, Math.min(size, naturalCards.length)), ...wildcards.slice(0, Math.max(0, size - naturalCards.length))];
}

function sameRankBombs(naturalCards: Card[], wildcards: Card[]): Card[][] {
  if (naturalCards.length === 0 || naturalCards.length + wildcards.length < 4) {
    return [];
  }

  const maxSize = naturalCards.length + wildcards.length;
  const bombs: Card[][] = [];

  for (let size = 4; size <= maxSize; size += 1) {
    const bomb = fillSameRank(naturalCards, wildcards, size);
    if (bomb !== undefined && bomb.length === size) {
      bombs.push(bomb);
    }
  }

  return bombs;
}

function naturalSequence(gameRank: GameRank): Rank[] {
  return [...RANKS];
}

function sequenceWindows(gameRank: GameRank, size: number): SequenceWindow[] {
  const sequence = naturalSequence(gameRank);
  const windows: SequenceWindow[] = [];

  for (let index = 0; index <= sequence.length - size; index += 1) {
    const ranks = sequence.slice(index, index + size);
    windows.push({ ranks, strengthRank: ranks[0] });
  }

  if (size === 5) {
    windows.push({ ranks: ["A", "5", "4", "3", "2"], strengthRank: "5" });
  }

  if (size === 3) {
    windows.push({ ranks: ["A", "3", "2"], strengthRank: "3" });
  }

  return windows;
}

function detectStraights(cards: Card[], gameRank: GameRank, wildcards: Card[], sameSuit: boolean): CandidateGroup[] {
  const candidates: CandidateGroup[] = [];

  for (const window of sequenceWindows(gameRank, 5)) {
    const suitOptions: readonly (Suit | undefined)[] = sameSuit ? SUITS : [undefined];

    for (const suit of suitOptions) {
      const rankOptions: Card[][] = [];
      let missing = 0;

      for (const rank of window.ranks) {
        const options = suit === undefined ? rankCards(cards, rank, gameRank) : suitedRankCards(cards, rank, suit, gameRank);
        if (options.length === 0) {
          missing += 1;
        } else {
          rankOptions.push(options);
        }
      }

      if (missing <= wildcards.length && rankOptions.length > 0) {
        for (const selected of cartesianPick(rankOptions)) {
          candidates.push({
            cards: [...selected, ...wildcards.slice(0, missing)],
            strengthRank: window.strengthRank,
          });
        }
      }

      if (wildcards.length > 0) {
        for (const wildcardRank of window.ranks) {
          const replacementOptions: Card[][] = [];
          let replacementMissing = 1;

          for (const rank of window.ranks) {
            if (rank === wildcardRank) {
              continue;
            }

            const options = suit === undefined ? rankCards(cards, rank, gameRank) : suitedRankCards(cards, rank, suit, gameRank);
            if (options.length === 0) {
              replacementMissing += 1;
            } else {
              replacementOptions.push(options);
            }
          }

          if (replacementMissing <= wildcards.length && replacementOptions.length > 0) {
            for (const selected of cartesianPick(replacementOptions)) {
              candidates.push({
                cards: [...selected, ...wildcards.slice(0, replacementMissing)],
                strengthRank: window.strengthRank,
              });
            }
          }
        }
      }
    }
  }

  return candidates;
}

function detectConsecutiveMultiples(
  cards: Card[],
  gameRank: GameRank,
  wildcards: Card[],
  multipleSize: 2 | 3,
): CandidateGroup[] {
  const candidates: CandidateGroup[] = [];
  const windowSize = multipleSize === 2 ? 3 : 2;

  for (const window of sequenceWindows(gameRank, windowSize)) {
    const rankOptions: Card[][][] = [];
    let wildcardsNeeded = 0;

    for (const rank of window.ranks) {
      const naturalCards = rankCards(cards, rank, gameRank);
      const takeCount = Math.min(multipleSize, naturalCards.length);
      if (takeCount > 0) {
        rankOptions.push(combinations(naturalCards, takeCount));
      }
      wildcardsNeeded += multipleSize - takeCount;
    }

    if (wildcardsNeeded <= wildcards.length && rankOptions.length > 0) {
      for (const selectedGroups of cartesianPick(rankOptions)) {
        const selected = selectedGroups.flat();
        candidates.push({
          cards: [...selected, ...wildcards.slice(0, wildcardsNeeded)],
          strengthRank: window.strengthRank,
        });
      }
    }
  }

  return candidates;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) {
    return [[]];
  }

  if (items.length < size) {
    return [];
  }

  const results: T[][] = [];

  for (let index = 0; index <= items.length - size; index += 1) {
    for (const tail of combinations(items.slice(index + 1), size - 1)) {
      results.push([items[index], ...tail]);
    }
  }

  return results;
}

function cartesianPick<T>(options: T[][]): T[][] {
  return options.reduce<T[][]>(
    (accumulator, values) => accumulator.flatMap((prefix) => values.map((value) => [...prefix, value])),
    [[]],
  );
}

function detectFullHouses(cards: Card[], gameRank: GameRank, wildcards: Card[]): CandidateGroup[] {
  const candidates: CandidateGroup[] = [];

  for (const tripleRank of RANKS) {
    for (const pairRank of RANKS) {
      if (tripleRank === pairRank) {
        continue;
      }

      const tripleNaturalCards = rankCards(cards, tripleRank, gameRank);
      const pairNaturalCards = rankCards(cards, pairRank, gameRank);
      const tripleCards = tripleNaturalCards.slice(0, Math.min(3, tripleNaturalCards.length));
      const pairCards = pairNaturalCards.slice(0, Math.min(2, pairNaturalCards.length));
      const wildcardsNeeded = 3 - tripleCards.length + (2 - pairCards.length);

      if (tripleCards.length === 0 || pairCards.length === 0 || wildcardsNeeded > wildcards.length) {
        continue;
      }

      candidates.push({
        cards: [...tripleCards, ...pairCards, ...wildcards.slice(0, wildcardsNeeded)],
        strengthRank: tripleRank,
      });
    }
  }

  return candidates;
}
