import { isHeartRankWild, rankStrength, type Card, type GameRank } from "../engine/cards";
import { detectGroups, type CardGroup } from "../engine/groups";
import { isLegalBombReduction } from "../engine/planQuality";
import { powerProtectionLevel } from "../ai/policy/powerGroupPolicy";

export type ProtectedGroup = {
  id: string;
  type: CardGroup["type"];
  cards: Card[];
  rank: Card["rank"];
  size: number;
  protectionLevel: "HARD" | "CONDITIONAL";
  reason: string;
};

export type BombBreakContext = {
  allowBreakBomb?: boolean;
  endgameSearchApproved?: boolean;
  onlyDangerousOpponentBlock?: boolean;
  allowJokerBombBreak?: boolean;
};

export type CandidateDiagnostics = {
  breaksProtectedGroup: boolean;
  breakReasons: string[];
  sourceGroups: string[];
  usedProtectedCards: Card[];
  rejectedByRule: boolean;
};

export type ProtectedCandidate = CandidateDiagnostics & { group: CardGroup };

export type AiCandidatePool = {
  protectedGroups: ProtectedGroup[];
  normalCards: Card[];
  normalGroups: CardGroup[];
  powerGroups: CardGroup[];
  accepted: ProtectedCandidate[];
  rejected: ProtectedCandidate[];
};

export type HandAnalysis = AiCandidatePool & {
  handKey: string;
  hand: Card[];
  gameRank: GameRank;
  allGroups: CardGroup[];
};

let createHandAnalysisCallCount = 0;

export function resetCreateHandAnalysisCallCount(): void {
  createHandAnalysisCallCount = 0;
}

export function getCreateHandAnalysisCallCount(): number {
  return createHandAnalysisCallCount;
}

export function detectProtectedGroups(hand: Card[], gameRank: GameRank): ProtectedGroup[] {
  const allGroups = detectGroups(hand, gameRank);
  return detectProtectedGroupsFromGroups(allGroups, gameRank);
}

function detectProtectedGroupsFromGroups(allGroups: CardGroup[], gameRank: GameRank): ProtectedGroup[] {
  const nonStraightFlushGroups = allGroups.filter((group) => group.type !== "straight-flush");
  const naturalStraightFlushes = allGroups.filter((group) =>
    group.type === "straight-flush" && !group.cards.some((card) => isHeartRankWild(card, gameRank)),
  );
  const occupiedIds = new Set(naturalStraightFlushes.flatMap((group) => group.cards.map((card) => card.id)));
  const protectedWildcardIds = new Set<string>();
  const canonicalWildcardStraightFlushes = allGroups
    .filter((group) => group.type === "straight-flush" && group.cards.some((card) => isHeartRankWild(card, gameRank)))
    .sort((left, right) =>
      wildcardCount(left, gameRank) - wildcardCount(right, gameRank) ||
      right.strength - left.strength ||
      left.id.localeCompare(right.id),
    )
    .filter((group) => {
      const wildcardIds = group.cards.filter((card) => isHeartRankWild(card, gameRank)).map((card) => card.id);
      if (group.cards.some((card) => occupiedIds.has(card.id)) || wildcardIds.some((id) => protectedWildcardIds.has(id))) {
        return false;
      }
      group.cards.forEach((card) => occupiedIds.add(card.id));
      wildcardIds.forEach((id) => protectedWildcardIds.add(id));
      return true;
    });

  return [...nonStraightFlushGroups, ...naturalStraightFlushes, ...canonicalWildcardStraightFlushes]
    .filter((group) => isHardProtectedPower(group, allGroups, gameRank) || isConditionallyProtectedPower(group, allGroups, gameRank))
    .map((group) => ({
      id: group.id,
      type: group.type,
      cards: group.cards,
      rank: protectedRank(group, gameRank),
      size: group.cards.length,
      protectionLevel: isHardProtectedPower(group, allGroups, gameRank) ? "HARD" as const : "CONDITIONAL" as const,
      reason: `${isHardProtectedPower(group, allGroups, gameRank) ? "Protected" : "Conditionally protected"} ${protectedTypeLabel(group)} ${group.cards.map((card) => card.rank).join("")}`,
    }));
}

function wildcardCount(group: CardGroup, gameRank: GameRank): number {
  return group.cards.filter((card) => isHeartRankWild(card, gameRank)).length;
}

export function createHandAnalysis(
  hand: Card[],
  gameRank: GameRank,
  options: BombBreakContext = {},
): HandAnalysis {
  createHandAnalysisCallCount += 1;
  const allGroups = detectGroups(hand, gameRank);
  const protectedGroups = detectProtectedGroupsFromGroups(allGroups, gameRank);
  const normalCards = getCardsAvailableForNormalPatterns(hand, protectedGroups, options);
  const normalGroups = detectGroups(normalCards, gameRank).filter((group) => !isPowerGroup(group));
  const powerGroups = allGroups.filter(isPowerGroup);
  const base = {
    handKey: hand.map((card) => card.id).sort().join("|"),
    hand,
    gameRank,
    allGroups,
    protectedGroups,
    normalCards,
    normalGroups,
    powerGroups,
  };
  const accepted = [...normalGroups, ...powerGroups]
    .map((group) => assessProtectedGroupUseFromAnalysis(group, base, options))
    .filter((candidate) => !candidate.rejectedByRule);
  return { ...base, accepted, rejected: [] };
}

export function getCardsAvailableForNormalPatterns(
  hand: Card[],
  protectedGroups: ProtectedGroup[],
  options: BombBreakContext = {},
): Card[] {
  if (options.allowBreakBomb === true) {
    return hand;
  }

  const protectedIds = new Set(
    protectedGroups
      .filter((group) => group.protectionLevel === "HARD")
      .flatMap((group) => group.cards.map((card) => card.id)),
  );
  return hand.filter((card) => !protectedIds.has(card.id));
}

export function buildAiCandidatePool(hand: Card[], gameRank: GameRank, options: BombBreakContext = {}): AiCandidatePool {
  const analysis = createHandAnalysis(hand, gameRank, options);
  const rejected = analysis.allGroups
    .filter((group) => !isPowerGroup(group))
    .map((group) => assessProtectedGroupUseFromAnalysis(group, analysis, options))
    .filter((candidate) => candidate.rejectedByRule);
  return { ...analysis, rejected };
}

export function assessProtectedGroupUse(
  group: CardGroup,
  handBefore: Card[],
  gameRank: GameRank,
  context: BombBreakContext = {},
): ProtectedCandidate {
  return assessProtectedGroupUseFromAnalysis(group, createHandAnalysisCore(handBefore, gameRank, context), context);
}

function createHandAnalysisCore(
  hand: Card[],
  gameRank: GameRank,
  options: BombBreakContext = {},
): Omit<HandAnalysis, "accepted" | "rejected"> {
  const allGroups = detectGroups(hand, gameRank);
  const protectedGroups = detectProtectedGroupsFromGroups(allGroups, gameRank);
  const normalCards = getCardsAvailableForNormalPatterns(hand, protectedGroups, options);
  return {
    handKey: hand.map((card) => card.id).sort().join("|"),
    hand,
    gameRank,
    allGroups,
    protectedGroups,
    normalCards,
    normalGroups: detectGroups(normalCards, gameRank).filter((candidate) => !isPowerGroup(candidate)),
    powerGroups: allGroups.filter(isPowerGroup),
  };
}

export function assessProtectedGroupUseFromAnalysis(
  group: CardGroup,
  analysis: Omit<HandAnalysis, "accepted" | "rejected">,
  context: BombBreakContext = {},
): ProtectedCandidate {
  const { protectedGroups, hand: handBefore, gameRank } = analysis;
  const usedProtectedCards = protectedGroups.flatMap((protectedGroup) =>
    group.cards.filter((card) => protectedGroup.cards.some((protectedCard) => protectedCard.id === card.id)),
  );
  const uniqueUsedCards = [...new Map(usedProtectedCards.map((card) => [card.id, card])).values()];
  const completeProtectedPowerAlternative = isPowerGroup(group) && protectedGroups.some((protectedGroup) => protectedGroup.id === group.id);
  const brokenGroups = completeProtectedPowerAlternative
    ? []
    : protectedGroups.filter((protectedGroup) =>
      group.cards.some((card) => protectedGroup.cards.some((protectedCard) => protectedCard.id === card.id)) &&
      !isWholeProtectedPowerAction(group, protectedGroup),
    );
  const breaksProtectedGroup = brokenGroups.length > 0;
  const emergencyAllowed = breaksProtectedGroup && isProtectedGroupBreakAllowed(
    group,
    handBefore,
    gameRank,
    context,
    brokenGroups,
    analysis.allGroups,
  );
  const breakReasons = brokenGroups.map(
    (protectedGroup) => `Rejected: ${group.type.toUpperCase()} uses card from protected ${protectedTypeLabel(protectedGroup)} ${protectedGroup.cards.map((card) => card.rank).join("")}`,
  );

  return {
    group,
    breaksProtectedGroup,
    breakReasons,
    sourceGroups: brokenGroups.map((protectedGroup) => protectedGroup.id),
    usedProtectedCards: uniqueUsedCards,
    rejectedByRule: breaksProtectedGroup && !emergencyAllowed,
  };
}

export function isEmergencyBombBreakAllowed(
  group: CardGroup,
  handBefore: Card[],
  gameRank: GameRank,
  context: BombBreakContext = {},
): boolean {
  if (context.allowBreakBomb !== true) {
    return false;
  }

  if (group.cards.length === handBefore.length) {
    return true;
  }

  if (context.onlyDangerousOpponentBlock === true) {
    return true;
  }

  if (!context.endgameSearchApproved) {
    return false;
  }

  const usedIds = new Set(group.cards.map((card) => card.id));
  return detectGroups(handBefore.filter((card) => !usedIds.has(card.id)), gameRank)
    .filter((candidate) => candidate.cards.length > 0)
    .some((candidate) => candidate.cards.length === handBefore.length - group.cards.length);
}

function isProtectedGroupBreakAllowed(
  group: CardGroup,
  handBefore: Card[],
  gameRank: GameRank,
  context: BombBreakContext,
  brokenGroups: ProtectedGroup[],
  allGroups: CardGroup[],
): boolean {
  if (brokenGroups.every((protectedGroup) => protectedGroup.protectionLevel === "CONDITIONAL")) {
    return brokenGroups.every((protectedGroup) =>
      (protectedGroup.type === "bomb" &&
        protectedGroup.size >= 5 &&
        group.type === "straight" &&
        isLegalBombReduction(
          allGroups.find((candidate) => candidate.id === protectedGroup.id) ?? group,
          group,
          allGroups,
          gameRank,
        )) ||
      (protectedGroup.type === "joker-bomb" &&
        context.allowJokerBombBreak === true &&
        (group.type === "single" || group.type === "pair")),
    );
  }

  return isEmergencyBombBreakAllowed(group, handBefore, gameRank, context);
}

export function assertActionDoesNotBreakProtectedGroups(
  group: CardGroup,
  handBefore: Card[],
  gameRank: GameRank,
  context: BombBreakContext = {},
): void {
  const assessment = assessProtectedGroupUse(group, handBefore, gameRank, context);
  if (assessment.rejectedByRule) {
    throw new Error(assessment.breakReasons.join("; "));
  }
}

export function assertActionDoesNotBreakProtectedGroupsFromAnalysis(
  group: CardGroup,
  analysis: HandAnalysis,
  context: BombBreakContext = {},
): void {
  const assessment = assessProtectedGroupUseFromAnalysis(group, analysis, context);
  if (assessment.rejectedByRule) {
    throw new Error(assessment.breakReasons.join("; "));
  }
}

function isPowerGroup(group: CardGroup): boolean {
  return group.type === "bomb" || group.type === "straight-flush" || group.type === "joker-bomb";
}

function isHardProtectedPower(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  return powerProtectionLevel(group, allGroups, gameRank) === "HARD";
}

function isConditionallyProtectedPower(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  return powerProtectionLevel(group, allGroups, gameRank) === "CONDITIONAL";
}

function hasLargerSameBomb(group: CardGroup, allGroups: CardGroup[]): boolean {
  if (group.type !== "bomb") {
    return false;
  }

  const groupIds = new Set(group.cards.map((card) => card.id));
  return allGroups.some((candidate) =>
    candidate.type === "bomb" &&
    candidate.cards.length > group.cards.length &&
    group.cards.every((card) => candidate.cards.some((candidateCard) => candidateCard.id === card.id)) &&
    candidate.cards.some((card) => !groupIds.has(card.id)),
  );
}

function isWholeProtectedPowerAction(group: CardGroup, protectedGroup: ProtectedGroup): boolean {
  if (!isPowerGroup(group) || group.type !== protectedGroup.type || group.cards.length !== protectedGroup.cards.length) {
    return false;
  }

  const protectedIds = new Set(protectedGroup.cards.map((card) => card.id));
  return group.cards.every((card) => protectedIds.has(card.id));
}

function protectedRank(group: CardGroup, gameRank: GameRank): Card["rank"] {
  return [...group.cards]
    .sort((left, right) => rankStrength(right.rank, gameRank) - rankStrength(left.rank, gameRank))[0]?.rank ?? gameRank;
}

function protectedTypeLabel(group: Pick<ProtectedGroup, "type"> | CardGroup): string {
  if (group.type === "straight-flush") return "STRAIGHT_FLUSH";
  if (group.type === "joker-bomb") return "JOKER_BOMB";
  return "BOMB";
}
