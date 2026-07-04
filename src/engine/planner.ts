import type { Card, GameRank } from "./cards";
import { detectGroups, type CardGroup, type GroupPurpose, type GroupType } from "./groups";

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
  const selected = selectBestCover(cards, candidates, archetype);

  assertCompletePlan(cards, selected);

  return selected;
}

type CandidateEntry = {
  group: CardGroup;
  mask: number;
  score: number;
};

type CoverResult = {
  groups: CardGroup[];
  score: number;
};

function selectBestCover(cards: Card[], candidates: CardGroup[], archetype: ArchetypeDefinition): CardGroup[] {
  if (cards.length > 30) {
    throw new Error("Plan generation supports hands of 30 cards or fewer.");
  }

  const cardIndexById = new Map(cards.map((card, index) => [card.id, index]));
  const fullMask = (1 << cards.length) - 1;
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

      return { group, mask, score: scoreGroup(group, archetype) };
    })
    .filter((entry): entry is CandidateEntry => entry !== undefined);

  const entriesByFirstOpenCard = cards.map((_, index) =>
    entries.filter((entry) => (entry.mask & (1 << index)) !== 0),
  );
  const memo = new Map<number, CoverResult | undefined>();

  const search = (usedMask: number): CoverResult | undefined => {
    if (usedMask === fullMask) {
      return { groups: [], score: 0 };
    }

    const cached = memo.get(usedMask);
    if (cached !== undefined || memo.has(usedMask)) {
      return cached;
    }

    const nextCardIndex = firstOpenCardIndex(usedMask, cards.length);
    let best: CoverResult | undefined;

    for (const entry of entriesByFirstOpenCard[nextCardIndex]) {
      if ((entry.mask & usedMask) !== 0) {
        continue;
      }

      const tail = search(usedMask | entry.mask);
      if (tail === undefined) {
        continue;
      }

      const candidate = {
        groups: [entry.group, ...tail.groups],
        score: entry.score + tail.score,
      };

      if (best === undefined || compareCovers(candidate, best) < 0) {
        best = candidate;
      }
    }

    memo.set(usedMask, best);
    return best;
  };

  const result = search(0);
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

function compareCovers(left: CoverResult, right: CoverResult): number {
  const scoreDelta = right.score - left.score;
  if (Math.abs(scoreDelta) > 0.0001) {
    return scoreDelta;
  }

  const groupCountDelta = left.groups.length - right.groups.length;
  if (groupCountDelta !== 0) {
    return groupCountDelta;
  }

  return left.groups.map((group) => group.id).join("|").localeCompare(right.groups.map((group) => group.id).join("|"));
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

function wildcardStructureBonus(group: CardGroup): number {
  if (group.wildcards.length === 0) {
    return 0;
  }

  if (group.type === "straight-flush") {
    return 1200;
  }

  if (group.type === "straight" || group.type === "plate" || group.type === "consecutive-pairs") {
    return 450;
  }

  if (group.type === "bomb" && group.cards.length <= 5) {
    return -500;
  }

  if (group.type === "full-house" || group.type === "pair") {
    return -350;
  }

  return 0;
}
