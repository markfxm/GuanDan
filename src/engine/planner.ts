import { isHeartRankWild, type Card, type GameRank } from "./cards";
import { detectGroups, type CardGroup, type GroupPurpose, type GroupType } from "./groups";
import { comparePlanQuality, isLegalBombReduction, measurePlanQuality } from "./planQuality";

export type PlanArchetype = "balanced" | "fast" | "control" | "linked" | "wildcard";

export type Plan = {
  id: PlanArchetype;
  name: string;
  groups: CardGroup[];
};

type ArchetypeDefinition = {
  id: PlanArchetype;
  name: string;
  purposeWeights: Record<GroupPurpose, number>;
  typeWeights: Partial<Record<GroupType, number>>;
  wildcardWeight: number;
  strengthWeight: number;
  sizeWeight: number;
};

const INCOMPLETE_PLAN_ERROR = "Plan generation failed to consume every input card exactly once.";

const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: "balanced",
    name: "均衡推荐",
    purposeWeights: {
      attack: 8,
      engine: 7,
      recovery: 7,
      "tail-control": 5,
      filler: 4,
      risk: 1,
    },
    typeWeights: {
      bomb: 5,
      "joker-bomb": 6,
      "straight-flush": 6,
      plate: 4,
      "consecutive-pairs": 4,
      straight: 4,
      "full-house": 4,
      triple: 3,
      pair: 2,
    },
    wildcardWeight: 2,
    strengthWeight: 1,
    sizeWeight: 3,
  },
  {
    id: "fast",
    name: "快速跑牌",
    purposeWeights: {
      attack: 7,
      engine: 9,
      recovery: 4,
      "tail-control": 3,
      filler: 5,
      risk: 1,
    },
    typeWeights: {
      plate: 7,
      "consecutive-pairs": 7,
      straight: 7,
      "full-house": 6,
      triple: 5,
      pair: 3,
      bomb: 1,
      "joker-bomb": 1,
    },
    wildcardWeight: 1,
    strengthWeight: 0.5,
    sizeWeight: 5,
  },
  {
    id: "control",
    name: "保控防守",
    purposeWeights: {
      attack: 5,
      engine: 4,
      recovery: 10,
      "tail-control": 8,
      filler: 3,
      risk: 1,
    },
    typeWeights: {
      "joker-bomb": 9,
      bomb: 8,
      "straight-flush": 6,
      triple: 3,
      pair: 2,
    },
    wildcardWeight: 2,
    strengthWeight: 2,
    sizeWeight: 2,
  },
  {
    id: "linked",
    name: "连型发动",
    purposeWeights: {
      attack: 7,
      engine: 10,
      recovery: 3,
      "tail-control": 4,
      filler: 4,
      risk: 1,
    },
    typeWeights: {
      plate: 64,
      "consecutive-pairs": 60,
      straight: 45,
      "straight-flush": 80,
      "full-house": 5,
      triple: 4,
      pair: 2,
    },
    wildcardWeight: 1,
    strengthWeight: 0.75,
    sizeWeight: 4,
  },
  {
    id: "wildcard",
    name: "配牌激进",
    purposeWeights: {
      attack: 10,
      engine: 8,
      recovery: 7,
      "tail-control": 5,
      filler: 3,
      risk: 1,
    },
    typeWeights: {
      "straight-flush": 10,
      "joker-bomb": 9,
      bomb: 8,
      plate: 6,
      "consecutive-pairs": 6,
      straight: 6,
      "full-house": 5,
    },
    wildcardWeight: 8,
    strengthWeight: 1.5,
    sizeWeight: 3,
  },
];

export function generatePlans(cards: Card[], gameRank: GameRank, count = 5): Plan[] {
  return ARCHETYPES.slice(0, Math.max(0, count)).map((archetype) => ({
    id: archetype.id,
    name: archetype.name,
    groups: buildPlanGroups(cards, gameRank, archetype),
  }));
}

function buildPlanGroups(cards: Card[], gameRank: GameRank, archetype: ArchetypeDefinition): CardGroup[] {
  const candidates = detectGroups(cards, gameRank);
  const selected = selectBestCover(cards, candidates, gameRank, archetype);

  assertCompletePlan(cards, selected);

  return selected;
}

type CandidateEntry = {
  group: CardGroup;
  mask: number;
  score: number;
  quality: ReturnType<typeof measurePlanQuality>;
  exactSelectionMask: bigint;
  protectedEffects: ProtectedBombEffect[];
};

type CoverResult = {
  groups: CardGroup[];
  score: number;
  quality: ReturnType<typeof measurePlanQuality>;
};

type ExactProtectedTracker = {
  group: CardGroup;
};

type ProtectedBombTracker = {
  group: CardGroup;
  allMask: number;
  cardMaskById: Map<string, number>;
};

type ProtectedBombState = {
  exactSelected: boolean;
  consumedMask: number;
  keptBombMask: number;
};

type ProtectedBombEffect =
  | { kind: "none" }
  | { kind: "illegal" }
  | { kind: "exact" }
  | { kind: "subset-bomb"; mask: number }
  | { kind: "legal-straight"; mask: number };

function selectBestCover(
  cards: Card[],
  candidates: CardGroup[],
  gameRank: GameRank,
  archetype: ArchetypeDefinition,
): CardGroup[] {
  if (cards.length > 30) {
    throw new Error("Plan generation supports hands of 30 cards or fewer.");
  }

  const cardIndexById = new Map(cards.map((card, index) => [card.id, index]));
  const fullMask = (1 << cards.length) - 1;
  const exactProtectedGroups = exactProtectedGroupsForSearch(candidates, gameRank);
  const protectedBombs = protectedNaturalBombs(
    candidates,
    gameRank,
    new Set(
      exactProtectedGroups
        .map((tracker) => bombSignature(tracker.group, gameRank))
        .filter((rank): rank is string => rank !== undefined),
    ),
  );
  const protectedStates = protectedBombs.map((bomb) => initialProtectedBombState(bomb));
  const entries = sortedCandidates(candidates, archetype)
    .map((group): CandidateEntry | undefined => {
      let mask = 0;

      for (const card of group.cards) {
        const index = cardIndexById.get(card.id);
        if (index === undefined) {
          return undefined;
        }

        mask |= 1 << index;
      }

      const score = scoreGroup(group, archetype);
      const exactSelectionMask = exactProtectedGroups.reduce(
        (selectedMask, tracker, index) =>
          group.id === tracker.group.id ? selectedMask | (1n << BigInt(index)) : selectedMask,
        0n,
      );
      const protectedEffects = protectedBombs.map((bomb) =>
        protectedBombEffectForGroup(group, bomb, candidates, gameRank)
      );
      if (protectedEffects.some((effect) => effect.kind === "illegal")) {
        return undefined;
      }
      return {
        group,
        mask,
        score,
        quality: measurePlanQuality([], [group], gameRank, score),
        exactSelectionMask,
        protectedEffects,
      };
    })
    .filter((entry): entry is CandidateEntry => entry !== undefined);

  const entriesByFirstOpenCard = cards.map((_, index) =>
    entries.filter((entry) => (entry.mask & (1 << index)) !== 0),
  );
  const memo = new Map<string, CoverResult | undefined>();
  const search = (
    usedMask: number,
    exactSelectionMask: bigint,
    bombStates: ProtectedBombState[],
  ): CoverResult | undefined => {
    if (usedMask === fullMask) {
      return {
        groups: [],
        score: 0,
        quality: {
          protectedLoss:
            exactProtectedGroups.length - bitCountBigInt(exactSelectionMask) +
            countProtectedLoss(bombStates, protectedBombs),
          lowSingleCount: 0,
          groupCount: 0,
          retainedControl: 0,
          fallbackScore: 0,
        },
      };
    }

    const memoKey = protectedStateKey(usedMask, exactSelectionMask, bombStates);
    const cached = memo.get(memoKey);
    if (cached !== undefined || memo.has(memoKey)) {
      return cached;
    }

    const nextCardIndex = firstOpenCardIndex(usedMask, cards.length);
    const remainingCards = cards.filter((_, index) => (usedMask & (1 << index)) === 0);
    let best: CoverResult | undefined;

    for (const entry of entriesByFirstOpenCard[nextCardIndex]) {
      if ((entry.mask & usedMask) !== 0) {
        continue;
      }
      if (!preservesNaturalStructures(entry.group, remainingCards, gameRank)) {
        continue;
      }

      const nextBombStates = advanceProtectedStates(bombStates, entry.protectedEffects);
      if (nextBombStates === undefined) {
        continue;
      }

      const tail = search(usedMask | entry.mask, exactSelectionMask | entry.exactSelectionMask, nextBombStates);
      if (tail === undefined) {
        continue;
      }

      const candidate = {
        groups: [entry.group, ...tail.groups],
        score: entry.score + tail.score,
        quality: addPlanQuality(entry.quality, tail.quality),
      };
      if (best === undefined || compareTailCovers(candidate, best) < 0) {
        best = candidate;
      }
    }

    memo.set(memoKey, best);
    return best;
  };

  const result = search(0, 0n, protectedStates);
  if (result === undefined) {
    throw new Error(INCOMPLETE_PLAN_ERROR);
  }

  return result.groups;
}

function firstOpenCardIndex(usedMask: number, cardCount: number): number {
  for (let index = 0; index < cardCount; index += 1) {
    if ((usedMask & (1 << index)) === 0) {
      return index;
    }
  }

  return cardCount;
}

function compareTailCovers(left: CoverResult, right: CoverResult): number {
  const qualityDelta = comparePlanQuality(left.quality, right.quality);
  if (qualityDelta !== 0) {
    return qualityDelta;
  }

  return deterministicGroupIds(left.groups).localeCompare(deterministicGroupIds(right.groups));
}

function addPlanQuality(
  left: ReturnType<typeof measurePlanQuality>,
  right: ReturnType<typeof measurePlanQuality>,
): ReturnType<typeof measurePlanQuality> {
  return {
    protectedLoss: right.protectedLoss,
    lowSingleCount: left.lowSingleCount + right.lowSingleCount,
    groupCount: left.groupCount + right.groupCount,
    retainedControl: left.retainedControl + right.retainedControl,
    fallbackScore: left.fallbackScore + right.fallbackScore,
  };
}

function preservesNaturalStructures(
  group: CardGroup,
  cards: Card[],
  gameRank: GameRank,
): boolean {
  if (group.type === "pair" && group.wildcards.length === 0) {
    return naturalRankCount(group.cards[0]?.rank, cards, gameRank) !== 2
      ? false
      : true;
  }

  if (group.type !== "full-house" || group.wildcards.length > 0) {
    return true;
  }

  const counts = rankCounts(group.cards);
  const pairRank = [...counts.entries()].find(([, count]) => count === 2)?.[0];
  if (pairRank === undefined) {
    return true;
  }

  return naturalRankCount(pairRank, cards, gameRank) === 2;
}

function naturalRankCount(rank: Card["rank"] | undefined, cards: Card[], gameRank: GameRank): number {
  if (rank === undefined) {
    return 0;
  }

  return cards.filter(
    (card) => card.kind === "suited" && card.rank === rank && !isHeartRankWild(card, gameRank),
  ).length;
}

function rankCounts(cards: Card[]): Map<Card["rank"], number> {
  const counts = new Map<Card["rank"], number>();

  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  return counts;
}

function exactProtectedGroupsForSearch(groups: CardGroup[], gameRank: GameRank): ExactProtectedTracker[] {
  const strongestBombByRank = new Map<string, CardGroup>();
  const exactGroups = groups
    .filter((group) => group.type === "joker-bomb" || group.type === "straight-flush" && group.wildcards.length === 0)
    .map((group) => ({ group }));

  for (const group of groups) {
    if (group.type !== "bomb" || group.cards.length < 4) {
      continue;
    }

    const signature = bombSignature(group, gameRank);
    if (signature === undefined || isNaturalSameRankBomb(group, gameRank)) {
      continue;
    }

    const current = strongestBombByRank.get(signature);
    if (
      current === undefined ||
      group.cards.length > current.cards.length ||
      group.cards.length === current.cards.length && group.wildcards.length > current.wildcards.length
    ) {
      strongestBombByRank.set(signature, group);
    }
  }

  return [
    ...exactGroups,
    ...[...strongestBombByRank.values()].map((group) => ({ group })),
  ];
}

function bombSignature(group: CardGroup, gameRank: GameRank): string | undefined {
  const naturalCards = group.cards.filter((card) => card.kind === "suited" && !isHeartRankWild(card, gameRank));
  if (naturalCards.length === 0) {
    return undefined;
  }

  return naturalCards[0].rank;
}

function protectedNaturalBombs(
  groups: CardGroup[],
  gameRank: GameRank,
  excludedRanks: Set<string>,
): ProtectedBombTracker[] {
  const strongestBombByRank = new Map<string, CardGroup>();

  for (const group of groups) {
    if (!isNaturalSameRankBomb(group, gameRank)) {
      continue;
    }

    const signature = group.cards[0]?.rank;
    if (signature === undefined || excludedRanks.has(signature)) {
      continue;
    }

    const current = strongestBombByRank.get(signature);
    if (
      current === undefined ||
      group.cards.length > current.cards.length ||
      group.cards.length === current.cards.length && group.id.localeCompare(current.id) < 0
    ) {
      strongestBombByRank.set(signature, group);
    }
  }

  return [...strongestBombByRank.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((group) => {
      const cardMaskById = new Map(
        group.cards
          .map((card, index) => [card.id, 1 << index] as const),
      );
      return {
        group,
        allMask: (1 << group.cards.length) - 1,
        cardMaskById,
      };
    });
}

function protectedBombEffectForGroup(
  group: CardGroup,
  bomb: ProtectedBombTracker,
  allGroups: CardGroup[],
  gameRank: GameRank,
): ProtectedBombEffect {
  const overlapMask = overlapMaskForGroup(group, bomb);
  if (overlapMask === 0) {
    return { kind: "none" };
  }

  if (
    group.type === "bomb" &&
    group.cards.every((card) => bomb.cardMaskById.has(card.id))
  ) {
    return overlapMask === bomb.allMask
      ? { kind: "exact" }
      : { kind: "subset-bomb", mask: overlapMask };
  }

  if (
    group.type === "straight" &&
    isLegalBombReduction(bomb.group, group, allGroups, gameRank)
  ) {
    return { kind: "legal-straight", mask: overlapMask };
  }

  return { kind: "illegal" };
}

function overlapMaskForGroup(group: CardGroup, bomb: ProtectedBombTracker): number {
  let mask = 0;

  for (const card of group.cards) {
    mask |= bomb.cardMaskById.get(card.id) ?? 0;
  }

  return mask;
}

function initialProtectedBombState(_bomb: ProtectedBombTracker): ProtectedBombState {
  return {
    exactSelected: false,
    consumedMask: 0,
    keptBombMask: 0,
  };
}

function advanceProtectedStates(
  states: ProtectedBombState[],
  effects: ProtectedBombEffect[],
): ProtectedBombState[] | undefined {
  const nextStates = states.map((state) => ({ ...state }));

  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index];
    const state = nextStates[index];

    if (effect.kind === "none") {
      continue;
    }

    if (effect.kind === "exact") {
      if (state.exactSelected || state.consumedMask !== 0 || state.keptBombMask !== 0) {
        return undefined;
      }
      state.exactSelected = true;
      state.keptBombMask = -1;
      continue;
    }

    if (effect.kind === "subset-bomb") {
      if (state.exactSelected || state.keptBombMask !== 0) {
        return undefined;
      }
      state.keptBombMask = effect.mask;
      continue;
    }

    if (effect.kind === "illegal") {
      return undefined;
    }

    if (state.exactSelected || (state.keptBombMask > 0 && (state.keptBombMask & effect.mask) !== 0)) {
      return undefined;
    }

    state.consumedMask |= effect.mask;
  }

  return nextStates;
}

function countProtectedLoss(states: ProtectedBombState[], bombs: ProtectedBombTracker[]): number {
  let protectedLoss = 0;

  for (let index = 0; index < bombs.length; index += 1) {
    const bomb = bombs[index];
    const state = states[index];
    const consumedCount = bitCount(state.consumedMask);

    if (state.exactSelected) {
      continue;
    }

    if (bomb.group.cards.length === 4) {
      if (consumedCount !== 1) {
        protectedLoss += 1;
      }
      continue;
    }

    if (
      consumedCount === 0 ||
      consumedCount > bomb.group.cards.length - 4 ||
      state.keptBombMask !== (bomb.allMask ^ state.consumedMask) ||
      bitCount(state.keptBombMask) < 4
    ) {
      protectedLoss += 1;
    }
  }

  return protectedLoss;
}

function sortedCardIds(group: CardGroup): string {
  return group.cards.map((card) => card.id).sort().join(",");
}

function protectedStateKey(
  usedMask: number,
  exactSelectionMask: bigint,
  bombStates: ProtectedBombState[],
): string {
  const bombKey = bombStates
    .map((state) => `${Number(state.exactSelected)}:${state.consumedMask}:${state.keptBombMask}`)
    .join("|");
  return `${usedMask}#${exactSelectionMask.toString()}#${bombKey}`;
}

function bitCount(value: number): number {
  let count = 0;
  let current = value >>> 0;

  while (current > 0) {
    current &= current - 1;
    count += 1;
  }

  return count;
}

function bitCountBigInt(value: bigint): number {
  let count = 0;
  let current = value;

  while (current > 0n) {
    current &= current - 1n;
    count += 1;
  }

  return count;
}

function isNaturalSameRankBomb(group: CardGroup, gameRank: GameRank): boolean {
  if (group.type !== "bomb" || group.cards.length < 4 || group.wildcards.length > 0) {
    return false;
  }

  const firstCard = group.cards[0];
  if (firstCard?.kind !== "suited" || isHeartRankWild(firstCard, gameRank)) {
    return false;
  }

  return group.cards.every(
    (card) => card.kind === "suited" && card.rank === firstCard.rank && !isHeartRankWild(card, gameRank),
  );
}

function groupsOverlap(left: CardGroup, right: CardGroup): boolean {
  const rightIds = new Set(right.cards.map((card) => card.id));
  return left.cards.some((card) => rightIds.has(card.id));
}

function deterministicGroupIds(groups: CardGroup[]): string {
  return groups.map((group) => group.id).sort().join("|");
}

function assertCompletePlan(cards: Card[], groups: CardGroup[]): void {
  const inputIds = cards.map((card) => card.id);
  const inputIdSet = new Set(inputIds);
  const usedIds = groups.flatMap((group) => group.cards.map((card) => card.id));
  const usedIdSet = new Set(usedIds);
  const hasSameIds = inputIds.every((id) => usedIdSet.has(id));

  if (
    inputIdSet.size !== inputIds.length ||
    usedIdSet.size !== usedIds.length ||
    usedIds.length !== inputIds.length ||
    usedIdSet.size !== inputIdSet.size ||
    !hasSameIds
  ) {
    throw new Error(INCOMPLETE_PLAN_ERROR);
  }
}

function sortedCandidates(candidates: CardGroup[], archetype: ArchetypeDefinition): CardGroup[] {
  return [...candidates].sort((left, right) => {
    const scoreDelta = scoreGroup(right, archetype) - scoreGroup(left, archetype);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const sizeDelta = right.cards.length - left.cards.length;
    if (sizeDelta !== 0) {
      return sizeDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function scoreGroup(group: CardGroup, archetype: ArchetypeDefinition): number {
  return (
    archetype.purposeWeights[group.purpose] * 100 +
    (archetype.typeWeights[group.type] ?? 0) * 10 +
    group.wildcards.length * archetype.wildcardWeight * 10 +
    group.cards.length * archetype.sizeWeight +
    group.strength * archetype.strengthWeight +
    wildcardStructureBonus(group)
  );
}

export function wildcardStructureBonus(group: CardGroup): number {
  if (group.wildcards.length === 0) {
    return 0;
  }

  if (group.type === "straight-flush") {
    return 1200;
  }

  if (group.type === "straight") {
    return 600;
  }

  if (group.type === "bomb" && group.cards.length <= 5) {
    return 450;
  }

  if (group.type === "plate" || group.type === "consecutive-pairs") {
    return 300;
  }

  if (group.type === "full-house") {
    return fullHouseWildcardBonus(group);
  }

  if (group.type === "pair") {
    return -350;
  }

  return 0;
}

function fullHouseWildcardBonus(group: CardGroup): number {
  const wildcardIds = new Set(group.wildcards.map((card) => card.id));
  const naturalCounts = new Map<Card["rank"], number>();
  for (const card of group.cards) {
    if (wildcardIds.has(card.id)) {
      continue;
    }

    naturalCounts.set(card.rank, (naturalCounts.get(card.rank) ?? 0) + 1);
  }

  if ([...naturalCounts.values()].some((count) => count === 2)) {
    return 150;
  }

  return -350;
}
