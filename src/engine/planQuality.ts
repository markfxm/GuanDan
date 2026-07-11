import { isHeartRankWild, type Card, type GameRank } from "./cards";
import { detectGroups, type CardGroup } from "./groups";
import { isLegalBombReduction as evaluateLegalBombReduction } from "../ai/policy/powerGroupPolicy";

export type PlanQuality = {
  protectedLoss: number;
  lowSingleCount: number;
  groupCount: number;
  retainedControl: number;
  fallbackScore: number;
};

const LOW_SINGLE_RANKS = new Set<Card["rank"]>(["10", "9", "8", "7", "6", "5", "4", "3", "2"]);
const LOOSE_SINGLE_BLOCKING_TYPES = new Set<CardGroup["type"]>([
  "pair",
  "triple",
  "full-house",
  "straight",
  "consecutive-pairs",
  "plate",
  "straight-flush",
  "bomb",
  "joker-bomb",
]);

export function comparePlanQuality(left: PlanQuality, right: PlanQuality): number {
  const protectedLossDelta = left.protectedLoss - right.protectedLoss;
  if (protectedLossDelta !== 0) {
    return protectedLossDelta;
  }

  const lowSingleCountDelta = left.lowSingleCount - right.lowSingleCount;
  if (lowSingleCountDelta !== 0) {
    return lowSingleCountDelta;
  }

  const groupCountDelta = left.groupCount - right.groupCount;
  if (groupCountDelta !== 0) {
    return groupCountDelta;
  }

  const retainedControlDelta = right.retainedControl - left.retainedControl;
  if (retainedControlDelta !== 0) {
    return retainedControlDelta;
  }

  return right.fallbackScore - left.fallbackScore;
}

export function isLegalBombReduction(
  sourceBomb: CardGroup,
  consumingGroup: CardGroup,
  allGroups: CardGroup[],
  gameRank: GameRank,
): boolean {
  return evaluateLegalBombReduction(sourceBomb, consumingGroup, allGroups, gameRank);
}

export function measurePlanQuality(
  cards: Card[],
  groups: CardGroup[],
  gameRank: GameRank,
  fallbackScore = 0,
): PlanQuality {
  let lowSingleCount = 0;
  let retainedControl = 0;

  for (const group of groups) {
    if (group.type !== "single" || group.cards.length !== 1) {
      continue;
    }

    const card = group.cards[0];

    if (
      card.kind === "suited" &&
      card.rank !== gameRank &&
      !isHeartRankWild(card, gameRank) &&
      LOW_SINGLE_RANKS.has(card.rank)
    ) {
      lowSingleCount += 1;
    }

    if (card.kind === "joker" || card.kind === "suited" && (card.rank === gameRank || card.rank === "A")) {
      retainedControl += 1;
    }
  }

  const sourceGroups = detectGroups(cards, gameRank);

  return {
    protectedLoss: countProtectedLoss(sourceGroups, groups, gameRank),
    lowSingleCount,
    groupCount: groups.length,
    retainedControl,
    fallbackScore,
  };
}

function countProtectedLoss(sourceGroups: CardGroup[], finalGroups: CardGroup[], gameRank: GameRank): number {
  let protectedLoss = 0;

  for (const sourceGroup of protectedSourceGroups(sourceGroups, gameRank)) {
    if (!isProtectedGroupPreserved(sourceGroup, sourceGroups, finalGroups, gameRank)) {
      protectedLoss += 1;
    }
  }

  return protectedLoss;
}

function protectedSourceGroups(sourceGroups: CardGroup[], gameRank: GameRank): CardGroup[] {
  const protectedGroups: CardGroup[] = [];
  const strongestBombBySignature = new Map<string, CardGroup>();

  for (const group of sourceGroups) {
    if (group.type === "straight-flush" && group.wildcards.length === 0) {
      protectedGroups.push(group);
      continue;
    }

    if (group.type === "joker-bomb") {
      protectedGroups.push(group);
      continue;
    }

    if (group.type !== "bomb") {
      continue;
    }

    const signature = bombSignature(group, gameRank);
    if (signature === undefined) {
      continue;
    }

    const current = strongestBombBySignature.get(signature);
    if (
      current === undefined ||
      group.cards.length > current.cards.length ||
      group.cards.length === current.cards.length && group.wildcards.length > current.wildcards.length
    ) {
      strongestBombBySignature.set(signature, group);
    }
  }

  return [...protectedGroups, ...strongestBombBySignature.values()];
}

function isProtectedGroupPreserved(
  sourceGroup: CardGroup,
  sourceGroups: CardGroup[],
  finalGroups: CardGroup[],
  gameRank: GameRank,
): boolean {
  if (!isNaturalSameRankBomb(sourceGroup, gameRank)) {
    if (finalGroups.some((group) => sameGroup(group, sourceGroup))) {
      return true;
    }

    return false;
  }

  if (hasDuplicateSourceBombUsage(sourceGroup, finalGroups)) {
    return false;
  }

  if (finalGroups.some((group) => sameGroup(group, sourceGroup))) {
    return true;
  }

  const overlappingStraights = finalGroups.filter((group) => group.type === "straight" && groupsOverlap(group, sourceGroup));
  if (overlappingStraights.length === 0) {
    return false;
  }

  const sourceBombIds = new Set(sourceGroup.cards.map((card) => card.id));
  const consumedBombCardIds = new Set<string>();

  for (const straight of overlappingStraights) {
    if (!isLegalBombReduction(
      sourceGroup,
      straight,
      reductionContextGroups(sourceGroups, sourceGroup, straight),
      gameRank,
    )) {
      return false;
    }

    for (const card of straight.cards) {
      if (sourceBombIds.has(card.id)) {
        consumedBombCardIds.add(card.id);
      }
    }
  }

  if (sourceGroup.cards.length === 4) {
    return consumedBombCardIds.size === 1;
  }

  return consumedBombCardIds.size <= sourceGroup.cards.length - 4 && hasRemainingBombGroup(sourceGroup, consumedBombCardIds, finalGroups);
}

function reductionContextGroups(sourceGroups: CardGroup[], sourceBomb: CardGroup, consumingGroup: CardGroup): CardGroup[] {
  const contextGroups = new Map<string, CardGroup>();

  contextGroups.set(groupIdentity(consumingGroup), consumingGroup);

  for (const group of sourceGroups) {
    contextGroups.set(groupIdentity(group), group);
  }

  return [...contextGroups.values()];
}

function bombSignature(group: CardGroup, gameRank: GameRank): string | undefined {
  const naturalCards = group.cards.filter((card) => card.kind === "suited" && !isHeartRankWild(card, gameRank));
  if (naturalCards.length === 0) {
    return undefined;
  }

  return naturalCards[0].rank;
}

function isNaturalSameRankBomb(group: CardGroup, gameRank: GameRank): boolean {
  if (group.type !== "bomb" || group.cards.length < 4 || group.wildcards.length > 0) {
    return false;
  }

  const firstCard = group.cards[0];
  if (firstCard.kind !== "suited" || isHeartRankWild(firstCard, gameRank)) {
    return false;
  }

  return group.cards.every((card) => card.kind === "suited" && card.rank === firstCard.rank && !isHeartRankWild(card, gameRank));
}

function groupsOverlap(left: CardGroup, right: CardGroup): boolean {
  const rightIds = new Set(right.cards.map((card) => card.id));
  return left.cards.some((card) => rightIds.has(card.id));
}

function sameGroup(left: CardGroup, right: CardGroup): boolean {
  return groupIdentity(left) === groupIdentity(right);
}

function groupIdentity(group: CardGroup): string {
  return `${group.type}:${group.cards.map((card) => card.id).sort().join(",")}`;
}

function sameCardSet(left: CardGroup, right: CardGroup): boolean {
  return left.cards.length === right.cards.length && left.cards.every((card) => right.cards.some((candidate) => candidate.id === card.id));
}

function hasRemainingBombGroup(sourceBomb: CardGroup, consumedIds: Set<string>, finalGroups: CardGroup[]): boolean {
  const remainingCards = sourceBomb.cards.filter((card) => !consumedIds.has(card.id));
  const remainingIdentity = `bomb:${remainingCards.map((card) => card.id).sort().join(",")}`;

  return finalGroups.some((group) => group.type === "bomb" && groupIdentity(group) === remainingIdentity);
}

function hasDuplicateSourceBombUsage(sourceBomb: CardGroup, finalGroups: CardGroup[]): boolean {
  const sourceBombIds = new Set(sourceBomb.cards.map((card) => card.id));
  const usageCounts = new Map<string, number>();

  for (const group of finalGroups) {
    for (const card of group.cards) {
      if (!sourceBombIds.has(card.id)) {
        continue;
      }

      usageCounts.set(card.id, (usageCounts.get(card.id) ?? 0) + 1);
      if ((usageCounts.get(card.id) ?? 0) > 1) {
        return true;
      }
    }
  }

  return false;
}
