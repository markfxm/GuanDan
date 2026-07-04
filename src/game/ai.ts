import { isHeartRankWild, rankStrength, type Card, type GameRank } from "../engine/cards";
import { detectGroups, type CardGroup } from "../engine/groups";
import { generatePlans } from "../engine/planner";
import { canBeatPlay, playPower } from "./playRules";

export type AiDecisionInput = {
  hand: Card[];
  partnerHand?: Card[];
  gameRank: GameRank;
  seat: number;
  partnerSeat: number;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
};

export type AiRole = "attacker" | "support" | "balanced";

export type AiAction = { type: "pass" } | { type: "play"; group: CardGroup };

const LEAD_TYPE_ORDER: Record<CardGroup["type"], number> = {
  "consecutive-pairs": 100,
  plate: 98,
  straight: 94,
  "straight-flush": 92,
  "full-house": 80,
  triple: 60,
  pair: 50,
  single: 10,
  bomb: 5,
  "joker-bomb": 1,
};

const TOP_STRAIGHT_RANKS = ["A", "K", "Q", "J", "10"] as const;
type TopStraightRank = (typeof TOP_STRAIGHT_RANKS)[number];

export function classifyAiRole(hand: Card[], gameRank: GameRank): AiRole {
  const groups = detectGroups(hand, gameRank);
  const powerCount = powerResourceCount(hand, gameRank);
  const controlScore = controlResourceScore(hand, groups, gameRank);

  if (powerCount >= 3 || controlScore >= 2) {
    return "attacker";
  }

  if (powerCount <= 1 && controlScore < 2) {
    return "support";
  }

  return "balanced";
}

export function chooseAiAction(input: AiDecisionInput): AiAction {
  const role = classifyAiRole(input.hand, input.gameRank);

  if (input.lastPlay !== undefined && input.lastPlaySeat === input.partnerSeat) {
    const partnerSingle = partnerSingleResponse(input.hand, input.gameRank, input.lastPlay);
    return partnerSingle === undefined ? { type: "pass" } : { type: "play", group: partnerSingle };
  }

  if (input.lastPlay !== undefined) {
    if (role === "support") {
      const support = supportResponse(input.hand, input.gameRank, input.lastPlay);
      if (support !== undefined) {
        return { type: "play", group: support };
      }
    }

    const response = structureAwareResponses(input.hand, input.partnerHand ?? [], input.gameRank, input.lastPlay)[0];
    return response === undefined ? { type: "pass" } : { type: "play", group: response };
  }

  const looseSingle = looseSingleTempoLead(input.hand, input.gameRank);
  if (looseSingle !== undefined) {
    return { type: "play", group: looseSingle };
  }

  const smallStraight = smallStraightTempoLead(input.hand, input.gameRank);
  if (smallStraight !== undefined) {
    return { type: "play", group: smallStraight };
  }

  const weakFullHouse = weakFullHouseTempoLead(input.hand, input.gameRank);
  if (weakFullHouse !== undefined) {
    return { type: "play", group: weakFullHouse };
  }

  if (role === "attacker") {
    const attackLead = attackerLead(input.hand, input.gameRank);
    if (attackLead !== undefined) {
      return { type: "play", group: attackLead };
    }
  }

  const coveredLead = coveredTempoLead(input.hand, input.gameRank);
  if (coveredLead !== undefined) {
    return { type: "play", group: coveredLead };
  }

  const plannedLead = plannedLinkedLead(input.hand, input.gameRank);

  if (plannedLead !== undefined) {
    return { type: "play", group: plannedLead };
  }

  const fallback = detectGroups(input.hand, input.gameRank)
    .filter((group) => group.type === "single")
    .sort((left, right) => playPower(left, input.gameRank) - playPower(right, input.gameRank))[0];

  return fallback === undefined ? { type: "pass" } : { type: "play", group: fallback };
}

function legalResponses(hand: Card[], gameRank: GameRank, lastPlay: CardGroup): CardGroup[] {
  return detectGroups(hand, gameRank)
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank));
}

function structureAwareResponses(hand: Card[], partnerHand: Card[], gameRank: GameRank, lastPlay: CardGroup): CardGroup[] {
  const allGroups = detectGroups(hand, gameRank);
  const ordinaryResponses = allGroups
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => !isPowerPlay(group))
    .filter((group) => !isProtectedSubset(group, allGroups))
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank) || canSplitHighBombPair(group, lastPlay, allGroups, gameRank))
    .filter((group) => shouldSpendWildcardResponse(group, lastPlay, gameRank))
    .sort((left, right) => compareResponseCost(left, right, gameRank, allGroups));

  if (ordinaryResponses.length > 0) {
    if (lastPlay.type === "single") {
      const tempoSingles = smallSingleTempoResponses(ordinaryResponses, allGroups, gameRank, lastPlay);
      if (tempoSingles.length > 0) {
        return tempoSingles;
      }

      const topStraightSurplusSingles = surplusTopStraightSingleResponses(ordinaryResponses, hand, gameRank, lastPlay);
      if (topStraightSurplusSingles.length > 0) {
        return topStraightSurplusSingles;
      }

      const looseSingles = ordinaryResponses.filter((group) => group.type === "single" && !isProtectedSingle(group, allGroups));
      if (looseSingles.length > 0) {
        return looseSingles;
      }
    }

    return ordinaryResponses;
  }

  if (!shouldUsePowerResponse(hand, partnerHand, gameRank, lastPlay)) {
    return [];
  }

  return allGroups
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => isPowerPlay(group))
    .filter((group) => !wastesWildcardStructure(group, allGroups, gameRank))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank));
}

function compareResponseCost(left: CardGroup, right: CardGroup, gameRank: GameRank, allGroups: CardGroup[]): number {
  const powerDifference = playPower(left, gameRank) - playPower(right, gameRank);
  if (powerDifference !== 0) {
    return powerDifference;
  }

  if (left.type === "full-house" && right.type === "full-house") {
    return fullHousePairCost(left, gameRank, allGroups) - fullHousePairCost(right, gameRank, allGroups);
  }

  return groupCardCost(left, gameRank) - groupCardCost(right, gameRank);
}

function partnerSingleResponse(hand: Card[], gameRank: GameRank, lastPlay: CardGroup): CardGroup | undefined {
  if (lastPlay.type !== "single") {
    return undefined;
  }

  if (isHighSingleControl(lastPlay, gameRank)) {
    return undefined;
  }

  const allGroups = detectGroups(hand, gameRank);
  const singleResponses = allGroups
    .filter((group) => group.type === "single")
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => !usesHeartRankWildcard(group, gameRank))
    .filter((group) => !isProtectedSubset(group, allGroups))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank));

  return singleResponses.find((group) => !isProtectedSingle(group, allGroups)) ?? singleResponses[0];
}

function smallSingleTempoResponses(
  responses: CardGroup[],
  allGroups: CardGroup[],
  gameRank: GameRank,
  lastPlay: CardGroup,
): CardGroup[] {
  if (!isSmallOrdinarySingle(lastPlay, gameRank)) {
    return [];
  }

  return responses
    .filter((group) => group.type === "single")
    .filter((group) => isOrdinaryTempoSingle(group, gameRank))
    .filter((group) => !isEssentialTopStraightSingle(group, allGroups, gameRank))
    .filter((group) => !isHardProtectedSingle(group, allGroups, gameRank))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank));
}

function isEssentialTopStraightSingle(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  const card = group.cards[0];
  if (group.type !== "single" || card?.kind !== "suited" || isHeartRankWild(card, gameRank) || !isTopStraightRank(card.rank)) {
    return false;
  }

  const sameRankSingleCount = allGroups.filter((candidate) => {
    const candidateCard = candidate.cards[0];
    return candidate.type === "single" && candidateCard?.kind === "suited" && candidateCard.rank === card.rank && !isHeartRankWild(candidateCard, gameRank);
  }).length;

  if (sameRankSingleCount > 1) {
    return false;
  }

  return allGroups.some((candidate) => {
    if (candidate.type !== "straight") {
      return false;
    }

    const ranks = new Set(candidate.cards.filter((straightCard) => straightCard.kind === "suited").map((straightCard) => straightCard.rank));
    return TOP_STRAIGHT_RANKS.every((rank) => ranks.has(rank)) && candidate.cards.some((straightCard) => straightCard.id === card.id);
  });
}

function supportResponse(hand: Card[], gameRank: GameRank, lastPlay: CardGroup): CardGroup | undefined {
  if (lastPlay.type !== "single" || isNaturalTenOrHigher(lastPlay.cards[0])) {
    return undefined;
  }

  const allGroups = detectGroups(hand, gameRank);
  const highLooseSingle = allGroups
    .filter((group) => group.type === "single")
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => isNaturalTenOrHigher(group.cards[0]))
    .filter((group) => !usesHeartRankWildcard(group, gameRank))
    .filter((group) => !isProtectedSingle(group, allGroups))
    .filter((group) => !isProtectedSubset(group, allGroups))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank))[0];

  if (highLooseSingle !== undefined) {
    return highLooseSingle;
  }

  return splitHighPairSingle(allGroups, gameRank, lastPlay);
}

function surplusTopStraightSingleResponses(
  responses: CardGroup[],
  hand: Card[],
  gameRank: GameRank,
  lastPlay: CardGroup,
): CardGroup[] {
  if (!isSmallOrdinarySingle(lastPlay, gameRank)) {
    return [];
  }

  const cardsByRank = new Map<TopStraightRank, Card[]>();

  for (const rank of TOP_STRAIGHT_RANKS) {
    cardsByRank.set(rank, []);
  }

  for (const card of hand) {
    if (card.kind !== "suited" || isHeartRankWild(card, gameRank) || !isTopStraightRank(card.rank)) {
      continue;
    }

    cardsByRank.set(card.rank, [...(cardsByRank.get(card.rank) ?? []), card]);
  }

  if (!TOP_STRAIGHT_RANKS.every((rank) => (cardsByRank.get(rank)?.length ?? 0) >= 1)) {
    return [];
  }

  return responses
    .filter((group) => group.type === "single")
    .filter((group) => {
      const card = group.cards[0];
      return card?.kind === "suited" && isTopStraightRank(card.rank) && (cardsByRank.get(card.rank)?.length ?? 0) > 1;
    })
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank));
}

function isTopStraightRank(rank: Card["rank"]): rank is TopStraightRank {
  return TOP_STRAIGHT_RANKS.some((candidate) => candidate === rank);
}

function attackerLead(hand: Card[], gameRank: GameRank): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  return controlledLead(allGroups, gameRank, "full-house")
    ?? controlledLead(allGroups, gameRank, "pair")
    ?? controlledLead(allGroups, gameRank, "single");
}

function smallStraightTempoLead(hand: Card[], gameRank: GameRank): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  return allGroups
    .filter((group) => group.type === "straight")
    .filter((group) => group.wildcards.length === 0)
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank))
    .filter((group) => {
      const ranks = new Set(group.cards.map((card) => card.rank));
      return (["2", "3", "4", "5", "6"] as const).every((rank) => ranks.has(rank));
    })
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank))[0];
}

function looseSingleTempoLead(hand: Card[], gameRank: GameRank): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  const hasPowerRecovery = allGroups.some((group) => isPowerPlay(group));
  const hasSingleControl = allGroups.some((group) => {
    const card = group.cards[0];
    return (
      group.type === "single" &&
      card?.kind === "suited" &&
      card.rank === gameRank &&
      !isHeartRankWild(card, gameRank) &&
          !isHardProtectedSingle(group, allGroups, gameRank)
      );
  });

  if (!hasSingleControl && !hasPowerRecovery) {
    return undefined;
  }

  return allGroups
    .filter((group) => group.type === "single")
    .filter((group) => isSmallOrdinarySingle(group, gameRank))
      .filter((group) => !isHardProtectedSingle(group, allGroups, gameRank))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank))[0];
}

function plannedLinkedLead(hand: Card[], gameRank: GameRank): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  return generatePlans(hand, gameRank, 4)
    .find((plan) => plan.id === "linked")
    ?.groups.filter((group) => group.type !== "single")
    .filter((group) => !isPowerPlay(group))
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank))
    .sort((left, right) => leadScore(right, gameRank) - leadScore(left, gameRank))[0];
}

function weakFullHouseTempoLead(hand: Card[], gameRank: GameRank): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  const hasBombRecovery = allGroups.some((group) => group.type === "bomb" || group.type === "joker-bomb");
  const powerCount = nonOverlappingPowerGroupCount(allGroups, gameRank);
  if (!hasBombRecovery) {
    return undefined;
  }

  return allGroups
    .filter((group) => group.type === "full-house")
    .filter((group) => groupMajorRankStrength(group, gameRank) <= rankStrength("6", gameRank))
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank) || canLeadWeakFullHouseFromSmallBomb(group, allGroups, gameRank, powerCount))
    .filter((group) => !fullHousePairBreaksPowerStructure(group, allGroups, gameRank))
    .sort(
      (left, right) =>
        groupMajorRankStrength(right, gameRank) - groupMajorRankStrength(left, gameRank) ||
          fullHousePairCost(left, gameRank, allGroups) - fullHousePairCost(right, gameRank, allGroups),
      )[0];
}

function nonOverlappingPowerGroupCount(allGroups: CardGroup[], gameRank: GameRank): number {
  const usedIds = new Set<string>();
  let count = 0;

  for (const group of allGroups
    .filter((candidate) => isPowerPlay(candidate))
    .sort((left, right) => playPower(right, gameRank) - playPower(left, gameRank))) {
    if (group.cards.some((card) => usedIds.has(card.id))) {
      continue;
    }

    for (const card of group.cards) {
      usedIds.add(card.id);
    }
    count += 1;
  }

  return count;
}

function fullHousePairBreaksPowerStructure(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  const pairCards = fullHousePairCards(group);
  if (pairCards.length !== 2) {
    return false;
  }

  return allGroups.some((container) => {
    if (!["bomb", "straight-flush", "joker-bomb"].includes(container.type)) {
      return false;
    }

    if (container.type === "bomb" && usesHeartRankWildcard(container, gameRank)) {
      return false;
    }

    return pairCards.every((card) => container.cards.some((containerCard) => containerCard.id === card.id));
  });
}

function fullHousePairCards(group: CardGroup): Card[] {
  if (group.type !== "full-house") {
    return [];
  }

  const counts = new Map<string, number>();
  for (const card of group.cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  const pairRank = [...counts.entries()].find(([, count]) => count === 2)?.[0];
  return pairRank === undefined ? [] : group.cards.filter((card) => card.rank === pairRank);
}

function canLeadWeakFullHouseFromSmallBomb(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank, powerCount: number): boolean {
  if (group.type !== "full-house" || usesHeartRankWildcard(group, gameRank)) {
    return false;
  }

  if (powerCount < 3) {
    return false;
  }

  const majorStrength = groupMajorRankStrength(group, gameRank);
  if (majorStrength > rankStrength("6", gameRank)) {
    return false;
  }

  return allGroups.some((container) => {
    if (container.type !== "bomb" || usesHeartRankWildcard(container, gameRank)) {
      return false;
    }

    const sharedCount = group.cards.filter((card) => container.cards.some((containerCard) => containerCard.id === card.id)).length;
    return sharedCount >= 3 && sharedCount < container.cards.length;
  });
}

function controlledLead(allGroups: CardGroup[], gameRank: GameRank, type: CardGroup["type"]): CardGroup | undefined {
  const candidates = allGroups
    .filter((group) => group.type === type)
    .filter((group) => type !== "pair" || !isProtectedSubset(group, allGroups))
    .filter((group) => type !== "single" || !isProtectedSubset(group, allGroups))
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank))
    .filter((group) => isStrongWildcardLead(group, gameRank))
    .filter((group) => allGroups.some((cover) => canCoverAfterLead(group, cover, gameRank)))
    .sort(
      (left, right) =>
        playPower(left, gameRank) - playPower(right, gameRank) ||
        groupCardCost(left, gameRank) - groupCardCost(right, gameRank),
    );

  return candidates[0];
}

function splitHighPairSingle(allGroups: CardGroup[], gameRank: GameRank, lastPlay: CardGroup): CardGroup | undefined {
  const pair = allGroups
    .filter((group) => group.type === "pair")
    .filter((group) => !isProtectedSubset(group, allGroups))
    .filter((group) => group.cards.some((card) => isNaturalTenOrHigher(card)))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank))[0];

  if (pair === undefined) {
    return undefined;
  }

  return allGroups
    .filter((group) => group.type === "single")
    .filter((group) => pair.cards.some((card) => card.id === group.cards[0]?.id))
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank))[0];
}

function isNaturalTenOrHigher(card: Card | undefined): boolean {
  if (card === undefined) {
    return false;
  }

  if (card.kind === "joker") {
    return true;
  }

  return ["10", "J", "Q", "K", "A"].includes(card.rank);
}

function isSmallOrdinarySingle(group: CardGroup, gameRank: GameRank): boolean {
  const card = group.cards[0];
  return group.type === "single" && card?.kind === "suited" && !isHeartRankWild(card, gameRank) && !isNaturalTenOrHigher(card);
}

function isOrdinaryTempoSingle(group: CardGroup, gameRank: GameRank): boolean {
  const card = group.cards[0];
  return group.type === "single" && card?.kind === "suited" && !isHeartRankWild(card, gameRank) && card.rank !== gameRank;
}

function shouldUsePowerResponse(hand: Card[], partnerHand: Card[], gameRank: GameRank, lastPlay: CardGroup): boolean {
  if (isPowerPlay(lastPlay)) {
    return powerResourceCount(hand, gameRank) >= 3 && availablePowerResponses(hand, gameRank, lastPlay).length > 0;
  }

  return isBombTrigger(lastPlay, gameRank) && !teamCanAnswerSameType(hand, partnerHand, gameRank, lastPlay);
}

function shouldSpendWildcardResponse(group: CardGroup, lastPlay: CardGroup, gameRank: GameRank): boolean {
  if (!usesHeartRankWildcard(group, gameRank)) {
    return true;
  }

  if (["straight", "straight-flush", "consecutive-pairs", "plate"].includes(group.type)) {
    return true;
  }

  if (group.type === "full-house") {
    return groupMajorRankStrength(group, gameRank) >= rankStrength("A", gameRank);
  }

  if (group.type === "pair") {
    return isCriticalHighWildcardPair(group, lastPlay, gameRank);
  }

  return false;
}

function isCriticalHighWildcardPair(group: CardGroup, lastPlay: CardGroup, gameRank: GameRank): boolean {
  return (
    lastPlay.type === "pair" &&
    group.type === "pair" &&
    groupMajorRankStrength(lastPlay, gameRank) >= rankStrength("Q", gameRank) &&
    group.strength >= rankStrength("K", gameRank)
  );
}

function canSplitHighBombPair(group: CardGroup, lastPlay: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  if (lastPlay.type !== "pair" || group.type !== "pair") {
    return false;
  }

  const rank = group.cards[0]?.rank;
  if (rank !== "A" && rank !== gameRank) {
    return false;
  }

  return allGroups.some((container) => {
    if (container.type !== "bomb" || usesHeartRankWildcard(container, gameRank)) {
      return false;
    }

    const containerIds = new Set(container.cards.map((card) => card.id));
    return group.cards.every((card) => containerIds.has(card.id));
  });
}

function isSecondBigJoker(group: CardGroup): boolean {
  const card = group.cards[0];
  return group.type === "single" && card?.kind === "joker" && card.rank === "BJ" && card.copy === 2;
}

function isHighValueOpponentPlay(group: CardGroup, gameRank: GameRank): boolean {
  if (group.type === "pair" || group.type === "triple" || group.type === "full-house") {
    return groupMajorRankStrength(group, gameRank) >= rankStrength("A", gameRank);
  }

  if (group.type === "straight") {
    return group.strength >= 48;
  }

  return false;
}

function isBombTrigger(group: CardGroup, gameRank: GameRank): boolean {
  if (isSecondBigJoker(group)) {
    return true;
  }

  if (group.type === "pair") {
    const rank = group.cards[0]?.rank;
    return rank === "BJ" || rank === "SJ" || rank === gameRank;
  }

  if (group.type === "full-house") {
    return groupMajorRankStrength(group, gameRank) >= Math.min(rankStrength("A", gameRank), rankStrength(gameRank, gameRank));
  }

  if (group.type === "straight") {
    const ranks = new Set(group.cards.filter((card) => card.kind === "suited").map((card) => card.rank));
    return (["A", "K", "Q", "J", "10"] as const).every((rank) => ranks.has(rank));
  }

  if (group.type === "plate" || group.type === "consecutive-pairs") {
    return groupNaturalMajorStrength(group) >= naturalRankValue("10");
  }

  return false;
}

function groupMajorRankStrength(group: CardGroup, gameRank: GameRank): number {
  const counts = new Map<string, { count: number; strength: number }>();
  for (const card of group.cards) {
    if (card.kind === "joker") {
      counts.set(card.rank, { count: (counts.get(card.rank)?.count ?? 0) + 1, strength: rankStrength(card.rank, gameRank) });
      continue;
    }

    counts.set(card.rank, { count: (counts.get(card.rank)?.count ?? 0) + 1, strength: rankStrength(card.rank, gameRank) });
  }

  return Math.max(
    0,
    ...[...counts.values()]
      .filter((entry) => entry.count >= (group.type === "full-house" ? 3 : group.cards.length))
      .map((entry) => entry.strength),
  );
}

function teamCanAnswerSameType(hand: Card[], partnerHand: Card[], gameRank: GameRank, lastPlay: CardGroup): boolean {
  return [hand, partnerHand].some((cards) =>
    detectGroups(cards, gameRank)
      .filter((group) => !isPowerPlay(group))
      .some((group) => canBeatPlay(group, lastPlay, gameRank)),
  );
}

function isPowerPlay(group: CardGroup): boolean {
  return group.type === "bomb" || group.type === "straight-flush" || group.type === "joker-bomb";
}

function usesHeartRankWildcard(group: CardGroup, gameRank: GameRank): boolean {
  return group.cards.some((card) => isHeartRankWild(card, gameRank));
}

function controlResourceScore(hand: Card[], groups: CardGroup[], gameRank: GameRank): number {
  const jokerControls = hand.filter((card) => card.kind === "joker").length;
  const rankControls = hand.filter((card) => card.kind === "suited" && card.rank === gameRank && !(card.suit === "hearts")).length;
  const highPairControls = groups.filter((group) => group.type === "pair" && groupMajorRankStrength(group, gameRank) >= rankStrength("A", gameRank)).length;
  const highFullHouseControls = groups.filter((group) => group.type === "full-house" && groupMajorRankStrength(group, gameRank) >= rankStrength("A", gameRank)).length;

  return jokerControls + rankControls + highPairControls + highFullHouseControls;
}

function availablePowerResponses(hand: Card[], gameRank: GameRank, lastPlay: CardGroup): CardGroup[] {
  return detectGroups(hand, gameRank)
    .filter((group) => isPowerPlay(group))
    .filter((group) => canBeatPlay(group, lastPlay, gameRank));
}

function powerResourceCount(hand: Card[], gameRank: GameRank): number {
  const usedIds = new Set<string>();
  let count = 0;

  for (const group of detectGroups(hand, gameRank)
    .filter((candidate) => isPowerPlay(candidate))
    .sort((left, right) => playPower(right, gameRank) - playPower(left, gameRank))) {
    if (group.cards.some((card) => usedIds.has(card.id))) {
      continue;
    }

    for (const card of group.cards) {
      usedIds.add(card.id);
    }
    count += 1;
  }

  return count;
}

function isHighSingleControl(group: CardGroup, gameRank: GameRank): boolean {
  const rank = group.cards[0]?.rank;
  if (rank === undefined) {
    return false;
  }

  return rankStrength(rank, gameRank) >= Math.min(rankStrength("Q", gameRank), rankStrength(gameRank, gameRank));
}

const COVERED_LEAD_TYPE_ORDER: Record<CardGroup["type"], number> = {
  single: 100,
  pair: 90,
  "full-house": 80,
  straight: 70,
  "consecutive-pairs": 60,
  plate: 50,
  triple: 40,
  "straight-flush": 0,
  bomb: 0,
  "joker-bomb": 0,
};

function coveredTempoLead(hand: Card[], gameRank: GameRank): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  const groups = allGroups
    .filter((group) => (COVERED_LEAD_TYPE_ORDER[group.type] ?? 0) > 0)
    .filter((group) => !isProtectedSubset(group, allGroups))
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank))
    .filter((group) => isStrongWildcardLead(group, gameRank))
    .filter((group) => group.type !== "single" || hasJokerSingleCover(group, hand));

  return groups
    .filter((group) => groups.some((cover) => canCoverAfterLead(group, cover, gameRank)))
    .sort(
      (left, right) =>
        COVERED_LEAD_TYPE_ORDER[right.type] - COVERED_LEAD_TYPE_ORDER[left.type] ||
        playPower(left, gameRank) - playPower(right, gameRank) ||
        groupCardCost(left, gameRank) - groupCardCost(right, gameRank),
    )[0];
}

function isProtectedSubset(group: CardGroup, allGroups: CardGroup[]): boolean {
  if (group.type !== "pair" && group.type !== "triple") {
    return false;
  }

  return allGroups.some((container) => {
    if (!["full-house", "straight", "consecutive-pairs", "plate", "straight-flush"].includes(container.type)) {
      return false;
    }

    const containerIds = new Set(container.cards.map((card) => card.id));
    return group.cards.every((card) => containerIds.has(card.id));
  });
}

function wastesWildcardStructure(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  if (group.type !== "bomb" || !usesHeartRankWildcard(group, gameRank)) {
    return false;
  }

  const wildcardIds = new Set(group.cards.filter((card) => isHeartRankWild(card, gameRank)).map((card) => card.id));
  return allGroups.some((candidate) => {
    if (candidate.type !== "straight-flush" && candidate.type !== "straight" && candidate.type !== "plate" && candidate.type !== "consecutive-pairs") {
      return false;
    }

    return candidate.cards.some((card) => wildcardIds.has(card.id));
  });
}

function isProtectedSingle(group: CardGroup, allGroups: CardGroup[]): boolean {
  const card = group.cards[0];
  if (group.type !== "single" || card === undefined) {
    return false;
  }

  return allGroups.some((container) => {
    if (
      ![
        "pair",
        "triple",
        "full-house",
        "straight",
        "consecutive-pairs",
        "plate",
        "straight-flush",
        "bomb",
        "joker-bomb",
      ].includes(container.type)
    ) {
      return false;
    }

    if (container.cards.length <= 1) {
      return false;
    }

    return container.cards.some((containerCard) => containerCard.id === card.id);
  });
}

function isHardProtectedSingle(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  const card = group.cards[0];
  if (group.type !== "single" || card === undefined) {
    return false;
  }

  return allGroups.some((container) => {
    if (!["pair", "triple", "bomb", "joker-bomb", "full-house"].includes(container.type)) {
      return false;
    }

    if (usesHeartRankWildcard(container, gameRank)) {
      return false;
    }

    return container.cards.length > 1 && container.cards.some((containerCard) => containerCard.id === card.id);
  });
}

function breaksHighValueStructure(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  if (isPowerPlay(group)) {
    return false;
  }

  return allGroups.some((container) => {
    if (!["bomb", "straight-flush", "joker-bomb"].includes(container.type)) {
      return false;
    }

    if (container.type === "bomb" && usesHeartRankWildcard(container, gameRank)) {
      return false;
    }

    const sharedCount = group.cards.filter((card) => container.cards.some((containerCard) => containerCard.id === card.id)).length;
    return sharedCount > 0 && sharedCount < container.cards.length;
  });
}

function isStrongWildcardLead(group: CardGroup, gameRank: GameRank): boolean {
  if (!usesHeartRankWildcard(group, gameRank)) {
    return true;
  }

  if (["straight", "straight-flush", "consecutive-pairs", "plate"].includes(group.type)) {
    return true;
  }

  if (group.type === "full-house") {
    return groupMajorRankStrength(group, gameRank) >= rankStrength("A", gameRank);
  }

  return isPowerPlay(group);
}

function canCoverAfterLead(lead: CardGroup, cover: CardGroup, gameRank: GameRank): boolean {
  return (
    lead.id !== cover.id &&
    lead.type === cover.type &&
    lead.cards.length === cover.cards.length &&
    !sharesCards(lead, cover) &&
    canBeatPlay(cover, lead, gameRank)
  );
}

function sharesCards(left: CardGroup, right: CardGroup): boolean {
  const leftIds = new Set(left.cards.map((card) => card.id));
  return right.cards.some((card) => leftIds.has(card.id));
}

function groupCardCost(group: CardGroup, gameRank: GameRank): number {
  return group.cards.reduce((total, card) => total + rankStrength(card.rank, gameRank), 0);
}

function groupNaturalMajorStrength(group: CardGroup): number {
  const counts = new Map<string, number>();
  for (const card of group.cards) {
    if (card.kind !== "suited") {
      continue;
    }

    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  return Math.max(0, ...[...counts.keys()].map((rank) => naturalRankValue(rank as Card["rank"])));
}

function naturalRankValue(rank: Card["rank"]): number {
  if (rank === "BJ") {
    return 15;
  }

  if (rank === "SJ") {
    return 14;
  }

  const values: Record<Exclude<Card["rank"], "BJ" | "SJ">, number> = {
    A: 13,
    K: 12,
    Q: 11,
    J: 10,
    "10": 9,
    "9": 8,
    "8": 7,
    "7": 6,
    "6": 5,
    "5": 4,
    "4": 3,
    "3": 2,
    "2": 1,
  };

  return values[rank];
}

function fullHousePairCost(group: CardGroup, gameRank: GameRank, allGroups: CardGroup[]): number {
  const counts = new Map<string, { count: number; strength: number; wildcardCount: number }>();
  for (const card of group.cards) {
    const key = card.rank;
    const current = counts.get(key) ?? { count: 0, strength: rankStrength(card.rank, gameRank), wildcardCount: 0 };
    counts.set(key, {
      count: current.count + 1,
      strength: current.strength,
      wildcardCount: current.wildcardCount + (isHeartRankWild(card, gameRank) ? 1 : 0),
    });
  }

  const pair = [...counts.entries()]
    .filter(([, entry]) => entry.count === 2)
    .sort(([, left], [, right]) => left.strength - right.strength)[0];
  if (pair === undefined) {
    return groupCardCost(group, gameRank);
  }

  const [pairRank, pairEntry] = pair;
  const pairCards = group.cards.filter((card) => card.rank === pairRank);
  return pairEntry.strength * 10 + pairEntry.wildcardCount * 1000 + protectedKickerCost(pairCards, allGroups, gameRank);
}

function protectedKickerCost(pairCards: Card[], allGroups: CardGroup[], gameRank: GameRank): number {
  if (pairCards.length !== 2) {
    return 0;
  }

  const pairIds = new Set(pairCards.map((card) => card.id));
  const breaksProtectedStructure = allGroups.some((container) => {
    if (!["triple", "bomb", "consecutive-pairs", "plate", "straight-flush"].includes(container.type)) {
      return false;
    }

    return pairCards.every((card) => container.cards.some((containerCard) => containerCard.id === card.id)) &&
      container.cards.some((card) => !pairIds.has(card.id) && !isHeartRankWild(card, gameRank));
  });

  return breaksProtectedStructure ? 10000 : 0;
}

function hasJokerSingleCover(group: CardGroup, hand: Card[]): boolean {
  if (group.type !== "single") {
    return true;
  }

  return hand.some((card) => card.kind === "joker" && rankStrength(card.rank, "10") > rankStrength(group.cards[0]?.rank ?? "2", "10"));
}

function leadScore(group: CardGroup, gameRank: GameRank): number {
  return (LEAD_TYPE_ORDER[group.type] ?? 0) * 100 + group.cards.length * 10 - playPower(group, gameRank) / 100;
}
