// Test/reference only. Production code must never import this legacy decision baseline.
import { isHeartRankWild, rankStrength, type Card, type GameRank } from "../../src/engine/cards";
import { detectGroups, type CardGroup } from "../../src/engine/groups";
import { canBeatPlay, playPower } from "../../src/game/playRules";
import { evaluateAiRole } from "../../src/ai/tactics/roleEvaluator";
import {
  assertActionDoesNotBreakProtectedGroupsFromAnalysis,
  assessProtectedGroupUseFromAnalysis,
  createHandAnalysis,
  type BombBreakContext,
  type CandidateDiagnostics,
  type HandAnalysis,
} from "../../src/game/protectedGroups";

export type AiDecisionInput = {
  hand: Card[];
  partnerHand?: Card[];
  plannedGroups?: CardGroup[];
  gameRank: GameRank;
  seat: number;
  partnerSeat: number;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  context?: AiTableContext;
  bombBreakContext?: BombBreakContext;
  analysis?: HandAnalysis;
  preferPlannedLead?: boolean;
};

export type AiRole = "attacker" | "support" | "balanced";

export type AiAction = { type: "pass" } | { type: "play"; group: CardGroup };

export type LeadPhase = "EARLY" | "MIDDLE" | "LATE";

export type LeadActionType =
  | "SINGLE"
  | "PAIR"
  | "TRIPLE_WITH_PAIR"
  | "STRAIGHT"
  | "CONSECUTIVE_PAIRS"
  | "PLANE"
  | "BOMB"
  | "STRAIGHT_FLUSH";

export type LeadAction = {
  type: LeadActionType;
  group: CardGroup;
  cards: Card[];
  mainRank: Card["rank"];
  strength: number;
  consumesControl: boolean;
  consumesWildcard: boolean;
  isLowValue: boolean;
  isTailCandidate: boolean;
  isHighestSameTypeAction: boolean;
  hasLowerSameTypeAction: boolean;
  leavesHigherSameTypeRecovery: boolean;
  leavesBombRecovery: boolean;
  leavesStrongTail: boolean;
  futureHandPlanScore: number;
} & CandidateDiagnostics;

export type FollowActionType = "PASS" | "NORMAL_FOLLOW" | "HIGH_BLOCK" | "BOMB_FOLLOW";

export type FollowAction = {
  actionType: FollowActionType;
  type: CardGroup["type"] | "PASS";
  group?: CardGroup;
  cards: Card[];
  strength: number;
  beatsCurrent: boolean;
  isBomb: boolean;
  consumesControl: boolean;
  consumesWildcard: boolean;
  breaksCombo: boolean;
  reducesHandCount: boolean;
  leavesRecovery: boolean;
  leavesStrongTail: boolean;
  leavesWeakTail: boolean;
} & CandidateDiagnostics;

export type CurrentTrick = {
  currentWinningAction?: {
    seat: number;
    group: CardGroup;
  };
  consecutiveWinningSeats?: number[];
  consecutiveRunSeats?: number[];
};

export type AiTableContext = {
  ownHandCount: number;
  partnerHandCount: number;
  opponentHandCounts: number[];
  playedCards: Card[];
  finishOrder: number[];
  partnerPassedCurrentTrick?: boolean;
};

export const FOLLOW_SCORE_WEIGHTS = {
  PASS_WHEN_PARTNER_WINNING: 70,
  OVERTAKE_PARTNER_PENALTY: -60,
  FOLLOW_OPPONENT_BASE_BONUS: 30,
  PASS_OPPONENT_BASE_PENALTY: -20,
  EARLY_CONTROL_CONSUME_PENALTY: -35,
  EARLY_WILDCARD_CONSUME_PENALTY: -45,
  EARLY_BOMB_PENALTY: -70,
  LATE_DANGER_PASS_PENALTY: -100,
  LATE_DANGER_FOLLOW_BONUS: 80,
  FINISH_IMMEDIATELY_BONUS: 150,
  FINISH_IN_TWO_TURNS_BONUS: 80,
  BOMB_BASE_PENALTY: -50,
  LATE_BOMB_DANGER_BONUS: 140,
  BOMB_PARTNER_CARD_PENALTY: -120,
  OVERKILL_BOMB_PENALTY: -60,
} as const;

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

const EARLY_PAIR_PROBE_BONUS = 30;
const EARLY_LOW_SINGLE_PENALTY = -25;
const CONTROL_CONSUME_PENALTY = -35;
const NO_RECOVERY_PENALTY = -40;
const LATE_FEED_DANGER_TYPE_PENALTY = -80;
const LATE_BLOCK_DANGER_BONUS = 35;
const FINISH_IN_ONE_BONUS = 100;
const FINISH_IN_TWO_BONUS = 60;
const STRONG_TAIL_BONUS = 40;
const WEAK_TAIL_PENALTY = -60;
const TRIPLE_WITH_PAIR_RECOVERY_BONUS = 70;
const TRIPLE_WITH_PAIR_LOWER_TIER_PENALTY = -20;
const HIGHEST_TRIPLE_WITH_PAIR_NO_RECOVERY_PENALTY = -120;

const TOP_STRAIGHT_RANKS = ["A", "K", "Q", "J", "10"] as const;
type TopStraightRank = (typeof TOP_STRAIGHT_RANKS)[number];

export function classifyAiRole(hand: Card[], gameRank: GameRank): AiRole {
  return evaluateAiRole({ hand, gameRank }).role;
}

export function chooseAiAction(input: AiDecisionInput): AiAction {
  const analysis = input.analysis ?? createHandAnalysis(input.hand, input.gameRank, input.bombBreakContext);
  const preparedInput: AiDecisionInput & { analysis: HandAnalysis } = { ...input, analysis };
  let action: AiAction;
  try {
    action = chooseAiActionUnsafe(preparedInput);
  } catch {
    return mandatoryLeadFallback(preparedInput);
  }
  if (action.type === "pass") {
    return input.lastPlay === undefined ? mandatoryLeadFallback(preparedInput) : action;
  }

  try {
    assertActionDoesNotBreakProtectedGroupsFromAnalysis(action.group, analysis, input.bombBreakContext);
    return action;
  } catch {
    return input.lastPlay === undefined ? mandatoryLeadFallback(preparedInput) : { type: "pass" };
  }
}

function mandatoryLeadFallback(input: AiDecisionInput): AiAction {
  const selectedLead = chooseLeadAction(input);
  if (selectedLead !== undefined) {
    return { type: "play", group: selectedLead.group };
  }

  const group = (input.analysis ?? createHandAnalysis(input.hand, input.gameRank, input.bombBreakContext)).accepted
    .map((candidate) => candidate.group)
    .filter((candidate) => leadType(candidate) !== undefined)
    .sort((left, right) => leadScore(right, input.gameRank) - leadScore(left, input.gameRank))[0];

  return group === undefined ? { type: "pass" } : { type: "play", group };
}

function chooseAiActionUnsafe(input: AiDecisionInput): AiAction {
  const plannedGroups = availablePlannedGroups(input.plannedGroups ?? [], input.hand);

  if (input.lastPlay === undefined && input.preferPlannedLead === true && plannedGroups.length > 0) {
    const acceptedIds = new Set(input.analysis?.accepted.map((candidate) => candidate.group.id) ?? []);
    const legalPlannedGroups = plannedGroups
      .filter((group) => leadType(group) !== undefined && acceptedIds.has(group.id));
    const ordinaryPlannedGroups = legalPlannedGroups.filter((group) => !isPowerPlay(group));
    const plannedLead = (ordinaryPlannedGroups.length > 0
      ? ordinaryPlannedGroups
      : legalPlannedGroups.filter((group) => isPowerPlay(group)))
      .sort((left, right) =>
        (isPowerPlay(left) && isPowerPlay(right)
          ? playPower(left, input.gameRank) - playPower(right, input.gameRank)
          : right.cards.length - left.cards.length) ||
        (left.type === "full-house" && right.type === "full-house"
          ? groupMajorRankStrength(left, input.gameRank) - groupMajorRankStrength(right, input.gameRank)
          : leadScore(right, input.gameRank) - leadScore(left, input.gameRank)) ||
        left.id.localeCompare(right.id),
      )[0];
    if (plannedLead !== undefined) {
      return { type: "play", group: plannedLead };
    }
  }

  const role = contextualAiRole(classifyAiRole(input.hand, input.gameRank), input);

  if (input.lastPlay !== undefined && input.lastPlaySeat === input.partnerSeat) {
    if (shouldYieldToPartner(input)) {
      return { type: "pass" };
    }

    const partnerSingle = partnerSingleResponse(input.hand, input.gameRank, input.lastPlay);
    return partnerSingle === undefined ? { type: "pass" } : { type: "play", group: partnerSingle };
  }

  if (input.lastPlay !== undefined) {
    const plannedOrdinaryResponse = plannedGroups
      .filter((group) => !isPowerPlay(group))
      .filter((group) => canBeatPlay(group, input.lastPlay, input.gameRank))
      .filter((group) => !shouldReserveBigJokerSingleResponse(input, group, plannedGroups))
      .sort((left, right) => playPower(left, input.gameRank) - playPower(right, input.gameRank))[0];
    if (plannedOrdinaryResponse !== undefined) {
      return { type: "play", group: plannedOrdinaryResponse };
    }

    const plannedPowerResponse = plannedGroups
      .filter((group) => isPowerPlay(group))
      .filter((group) => canBeatPlay(group, input.lastPlay, input.gameRank))
      .filter((group) => shouldUsePowerResponse(input.hand, input.partnerHand ?? [], input.gameRank, input.lastPlay!, input.context, input.partnerSeat, group))
      .sort((left, right) => playPower(left, input.gameRank) - playPower(right, input.gameRank))[0];
    if (plannedPowerResponse !== undefined) {
      return { type: "play", group: plannedPowerResponse };
    }

    if (role === "support") {
      const support = supportResponse(input.hand, input.gameRank, input.lastPlay, input.context);
      if (support !== undefined) {
        return { type: "play", group: support };
      }
    }

    const response = structureAwareResponses(input.hand, input.partnerHand ?? [], input.gameRank, input.lastPlay, input.context, input.partnerSeat)[0];
    return response === undefined ? { type: "pass" } : { type: "play", group: response };
  }

  const powerBackedSingle = powerBackedLooseSingleLead(input);
  if (powerBackedSingle !== undefined) {
    return { type: "play", group: powerBackedSingle };
  }

  const retainedSingleControlLead = retainedSingleControlLooseSingleLead(input);
  if (retainedSingleControlLead !== undefined) {
    return { type: "play", group: retainedSingleControlLead };
  }

  const powerTailSetup = powerTailSetupLead(input);
  if (powerTailSetup !== undefined) {
    return { type: "play", group: powerTailSetup };
  }

  const urgentLead = urgentEndgameLead(input, role);
  if (urgentLead !== undefined) {
    return { type: "play", group: urgentLead };
  }

  const leadPlannedGroups = plannedGroups;
  const leadInput = { ...input, plannedGroups: leadPlannedGroups };

  const tailRegroup = tailRegroupLead(leadInput, leadPlannedGroups);
  if (tailRegroup !== undefined) {
    return { type: "play", group: tailRegroup };
  }

  if (!shouldPreferStructuredLead(input)) {
    const looseSingle = looseSingleTempoLead(input.hand, input.gameRank);
    if (looseSingle !== undefined) {
      return { type: "play", group: looseSingle };
    }
  }

  const smallStraight = smallStraightTempoLead(input.hand, input.gameRank);
  if (smallStraight !== undefined) {
    return { type: "play", group: smallStraight };
  }

  if (!shouldPreferStructuredLead(input)) {
    const weakFullHouse = weakFullHouseTempoLead(input.hand, input.gameRank);
    if (weakFullHouse !== undefined) {
      return { type: "play", group: weakFullHouse };
    }
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

  const plannedLinked = plannedLinkedLead(input.hand, input.gameRank, leadPlannedGroups);

  if (plannedLinked !== undefined) {
    return { type: "play", group: plannedLinked };
  }

  const leadAction = chooseLeadAction(leadInput);
  if (leadAction !== undefined) {
    return { type: "play", group: leadAction.group };
  }

  const fallback = detectGroups(input.hand, input.gameRank)
    .filter((group) => group.type === "single")
    .filter((group) => !isProtectedSingle(group, detectGroups(input.hand, input.gameRank)))
    .sort((left, right) => playPower(left, input.gameRank) - playPower(right, input.gameRank))[0];

  if (fallback !== undefined) {
    return { type: "play", group: fallback };
  }

  const structuralFallback = detectGroups(input.hand, input.gameRank)
    .filter((group) => group.type !== "single")
    .filter((group) => !isPowerPlay(group))
    .sort((left, right) => leadScore(right, input.gameRank) - leadScore(left, input.gameRank))[0];

  return structuralFallback === undefined ? { type: "pass" } : { type: "play", group: structuralFallback };
}

export function chooseFollowAction(gameState: AiDecisionInput, currentTrick: CurrentTrick = {}): FollowAction {
  const analysis = gameState.analysis ?? createHandAnalysis(gameState.hand, gameState.gameRank, gameState.bombBreakContext);
  gameState = { ...gameState, analysis };
  const currentWinningAction = currentTrick.currentWinningAction ??
    (gameState.lastPlay === undefined || gameState.lastPlaySeat === undefined
      ? undefined
      : { seat: gameState.lastPlaySeat, group: gameState.lastPlay });

  if (currentWinningAction === undefined) {
    return passFollowAction(gameState);
  }

  const phase = detectLeadPhase(gameState);
  const allGroups = analysis.allGroups;
  const candidates = legalFollowActions(gameState, currentWinningAction.group, allGroups);
  const state = {
    phase,
    winningSeat: currentWinningAction.seat,
    currentGroup: currentWinningAction.group,
    partnerWinning: currentWinningAction.seat === gameState.partnerSeat,
    opponentWinning: currentWinningAction.seat !== gameState.partnerSeat && currentWinningAction.seat !== gameState.seat,
    dangerousOpponent: isDangerousWinningOpponent(gameState, currentTrick, currentWinningAction.seat, currentWinningAction.group),
  };

  const selected = candidates
    .map((action) => ({ action, score: scoreFollowAction(action, gameState, state) }))
    .sort((left, right) => compareFollowScores(left, right, gameState, state))[0]?.action ?? passFollowAction(gameState);

  if (selected.group !== undefined) {
    try {
      assertActionDoesNotBreakProtectedGroupsFromAnalysis(selected.group, analysis, gameState.bombBreakContext);
    } catch {
      return passFollowAction(gameState);
    }
  }
  return selected;
}

export function chooseLeadAction(gameState: AiDecisionInput): LeadAction | undefined {
  const analysis = gameState.analysis ?? createHandAnalysis(gameState.hand, gameState.gameRank, gameState.bombBreakContext);
  gameState = { ...gameState, analysis };
  const phase = detectLeadPhase(gameState);
  const actions = legalLeadActions(gameState);
  const dominantTypes = dominantLeadTypes(actions);
  const candidates = actions.filter((action) => !violatesLeadHardRule(action, gameState));
  const scored = (candidates.length > 0 ? candidates : actions)
    .map((action) => ({
      action,
      score: phase === "LATE" ? scoreLateLead(action, gameState) : scoreEarlyLead(action, gameState, phase, dominantTypes, actions),
    }))
    .sort((left, right) => compareLeadScores(left, right, gameState, phase));

  const selected = scored[0]?.action;
  if (selected !== undefined) {
    try {
      assertActionDoesNotBreakProtectedGroupsFromAnalysis(selected.group, analysis, gameState.bombBreakContext);
    } catch {
      return undefined;
    }
  }
  return selected;
}

type FollowScoreState = {
  phase: LeadPhase;
  winningSeat: number;
  currentGroup: CardGroup;
  partnerWinning: boolean;
  opponentWinning: boolean;
  dangerousOpponent: boolean;
};

function legalFollowActions(input: AiDecisionInput, currentGroup: CardGroup, allGroups: CardGroup[]): FollowAction[] {
  const actions = new Map<string, FollowAction>();
  const addAction = (action: FollowAction): void => {
    actions.set(action.group?.id ?? "PASS", action);
  };

  addAction(passFollowAction(input));

  const pool = input.analysis ?? createHandAnalysis(input.hand, input.gameRank, input.bombBreakContext);
  for (const candidate of pool.accepted) {
    const group = candidate.group;
    const beatsCurrent = canBeatPlay(group, currentGroup, input.gameRank);
    if (!beatsCurrent) {
      continue;
    }

    const isBomb = isPowerPlay(group);
    const isSameTypeFollow = !isBomb && group.type === currentGroup.type && group.cards.length === currentGroup.cards.length;
    if (!isSameTypeFollow && !isBomb) {
      continue;
    }

    addAction(toFollowAction(group, input, currentGroup, allGroups, candidate));
  }

  return [...actions.values()];
}

function passFollowAction(input: AiDecisionInput): FollowAction {
  return {
    actionType: "PASS",
    type: "PASS",
    cards: [],
    strength: 0,
    beatsCurrent: false,
    isBomb: false,
    consumesControl: false,
    consumesWildcard: false,
    breaksCombo: false,
    reducesHandCount: false,
    leavesRecovery: hasRecoveryCards(input.hand, input.gameRank),
    leavesStrongTail: hasStrongTail(input.hand, input.gameRank),
    leavesWeakTail: hasWeakTail(input.hand, input.gameRank),
    breaksProtectedGroup: false,
    breakReasons: [],
    sourceGroups: [],
    usedProtectedCards: [],
    rejectedByRule: false,
  };
}

function toFollowAction(group: CardGroup, input: AiDecisionInput, currentGroup: CardGroup, allGroups: CardGroup[], diagnostics: CandidateDiagnostics): FollowAction {
  const remaining = remainingAfterGroup(group, input.hand);
  const isBomb = isPowerPlay(group);
  const dangerous = input.context?.opponentHandCounts.some((count) => count <= 6) === true;
  const actionType: FollowActionType = isBomb ? "BOMB_FOLLOW" : dangerous || remaining.length === 0 ? "HIGH_BLOCK" : "NORMAL_FOLLOW";

  return {
    actionType,
    type: group.type,
    group,
    cards: group.cards,
    strength: group.strength,
    beatsCurrent: canBeatPlay(group, currentGroup, input.gameRank),
    isBomb,
    consumesControl: consumesFollowControl(group, input.gameRank),
    consumesWildcard: usesHeartRankWildcard(group, input.gameRank),
    breaksCombo: breaksFollowCombo(group, currentGroup, allGroups, input.gameRank),
    reducesHandCount: true,
    leavesRecovery: hasRecoveryCards(remaining, input.gameRank),
    leavesStrongTail: hasStrongTail(remaining, input.gameRank),
    leavesWeakTail: hasWeakTail(remaining, input.gameRank),
    ...diagnostics,
  };
}

function scoreFollowAction(action: FollowAction, input: AiDecisionInput, state: FollowScoreState): number {
  const weights = FOLLOW_SCORE_WEIGHTS;
  let score = action.actionType === "PASS" ? 0 : actionCostBase(action, input);
  const remaining = action.group === undefined ? input.hand : remainingAfterGroup(action.group, input.hand);
  const remainingTurns = nonOverlappingRemainingGroups(remaining, input.gameRank).length;

  if (action.actionType === "PASS") {
    if (state.partnerWinning) {
      score += weights.PASS_WHEN_PARTNER_WINNING;
    }

    if (state.opponentWinning) {
      score += weights.PASS_OPPONENT_BASE_PENALTY;
    }

    if (state.dangerousOpponent) {
      score += weights.LATE_DANGER_PASS_PENALTY;
    }

    if (!state.dangerousOpponent && !isHighValueOpponentPlay(state.currentGroup, input.gameRank)) {
      score += 35;
    }

    if (!state.dangerousOpponent && state.currentGroup.type === "single" && isSmallOrdinarySingle(state.currentGroup, input.gameRank)) {
      score += 45;
    }

    if (!hasUsefulNonPowerFollow(input, state.currentGroup)) {
      score += 20;
    }

    return score;
  }

  if (state.partnerWinning) {
    score += weights.OVERTAKE_PARTNER_PENALTY;
    if (input.context?.partnerHandCount !== undefined && input.context.partnerHandCount <= 3) {
      score -= 80;
    }
  }

  if (state.opponentWinning) {
    score += weights.FOLLOW_OPPONENT_BASE_BONUS;
  }

  if (state.dangerousOpponent) {
    score += weights.LATE_DANGER_FOLLOW_BONUS;
  }

  if (remaining.length === 0) {
    score += weights.FINISH_IMMEDIATELY_BONUS;
  } else if (!state.partnerWinning && remainingTurns <= 1) {
    score += weights.FINISH_IN_TWO_TURNS_BONUS;
  }

  if (state.phase === "EARLY" || state.phase === "MIDDLE") {
    if (action.consumesControl) {
      score += weights.EARLY_CONTROL_CONSUME_PENALTY;
    }

    if (action.consumesWildcard) {
      score += weights.EARLY_WILDCARD_CONSUME_PENALTY;
    }
  }

  if (action.isBomb) {
    score += weights.BOMB_BASE_PENALTY;

    if (state.phase === "EARLY") {
      score += weights.EARLY_BOMB_PENALTY;
    }

    if (state.partnerWinning) {
      score += weights.BOMB_PARTNER_CARD_PENALTY;
    }

    if (state.dangerousOpponent && state.phase === "LATE") {
      score += weights.LATE_BOMB_DANGER_BONUS;
    }

    if (!state.dangerousOpponent && !isPowerPlay(state.currentGroup)) {
      score += weights.OVERKILL_BOMB_PENALTY;
    }

    if (!action.leavesRecovery && remaining.length > 0) {
      score -= 45;
    }
  }

  if (action.breaksCombo) {
    score -= state.dangerousOpponent ? 35 : 145;
  }

  if (!action.leavesRecovery && remaining.length > 0) {
    score -= 55;
  }

  if (action.leavesStrongTail) {
    score += 25;
  }

  if (action.leavesWeakTail && remaining.length > 0) {
    score -= 45;
  }

  if (isFirstLargeCombinationFromOpponent(input, state.currentGroup, state) && !action.isBomb) {
    score += 25;
  }

  if (helpsPartnerFollow(action, input)) {
    score += 20;
  }

  return score;
}

function actionCostBase(action: FollowAction, input: AiDecisionInput): number {
  if (action.group === undefined) {
    return 0;
  }

  const power = playPower(action.group, input.gameRank);
  return action.isBomb ? 90 - power / 20 : 80 - power / 10;
}

function compareFollowScores(
  left: { action: FollowAction; score: number },
  right: { action: FollowAction; score: number },
  input: AiDecisionInput,
  state: FollowScoreState,
): number {
  const scoreDelta = right.score - left.score;
  if (Math.abs(scoreDelta) > 0.0001) {
    return scoreDelta;
  }

  const leftGroupPower = left.action.group === undefined ? 0 : playPower(left.action.group, input.gameRank);
  const rightGroupPower = right.action.group === undefined ? 0 : playPower(right.action.group, input.gameRank);

  return (
    Number(left.action.isBomb) - Number(right.action.isBomb) ||
    Number(left.action.consumesWildcard) - Number(right.action.consumesWildcard) ||
    Number(left.action.breaksCombo) - Number(right.action.breaksCombo) ||
    Number(right.action.beatsCurrent) - Number(left.action.beatsCurrent) ||
    leftGroupPower - rightGroupPower ||
    Number(right.action.leavesRecovery) - Number(left.action.leavesRecovery) ||
    (state.partnerWinning ? Number(left.action.actionType !== "PASS") - Number(right.action.actionType !== "PASS") : 0) ||
    (state.dangerousOpponent ? Number(right.action.actionType !== "PASS") - Number(left.action.actionType !== "PASS") : 0) ||
    remainingFollowTurnCount(left.action, input) - remainingFollowTurnCount(right.action, input) ||
    Number(helpsPartnerFollow(right.action, input)) - Number(helpsPartnerFollow(left.action, input)) ||
    Number(left.action.leavesWeakTail) - Number(right.action.leavesWeakTail)
  );
}

function isDangerousWinningOpponent(input: AiDecisionInput, trick: CurrentTrick, winningSeat: number, currentGroup: CardGroup): boolean {
  if (winningSeat === input.partnerSeat || winningSeat === input.seat) {
    return false;
  }

  const remainingCount = handCountForSeat(input, winningSeat);
  const hasReported = remainingCount !== undefined && remainingCount <= 10;
  const nearFinish = remainingCount !== undefined && remainingCount <= 6;
  const typeMatchesCount = remainingCount !== undefined && likelyTypesForRemainingCount(remainingCount).includes(leadType(currentGroup) ?? "SINGLE");
  const streakSeat = trick.consecutiveWinningSeats?.at(-1) ?? trick.consecutiveRunSeats?.at(-1);
  const hasRecentStreak = streakSeat === winningSeat;

  return hasReported || nearFinish || typeMatchesCount || hasRecentStreak;
}

function handCountForSeat(input: AiDecisionInput, seat: number): number | undefined {
  const context = input.context;
  if (context === undefined) {
    return undefined;
  }

  if (seat === input.seat) {
    return context.ownHandCount;
  }

  if (seat === input.partnerSeat) {
    return context.partnerHandCount;
  }

  const opponentSeats = [0, 1, 2, 3].filter((candidate) => candidate !== input.seat && candidate !== input.partnerSeat);
  const index = opponentSeats.indexOf(seat);
  return index === -1 ? undefined : context.opponentHandCounts[index];
}

function consumesFollowControl(group: CardGroup, gameRank: GameRank): boolean {
  return consumesLeadControl(group, gameRank);
}

function breaksFollowCombo(group: CardGroup, currentGroup: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  if (isPowerPlay(group)) {
    return false;
  }

  return isProtectedResponseSubset(group, currentGroup, allGroups, gameRank) || breaksHighValueStructure(group, allGroups, gameRank);
}

function remainingAfterGroup(group: CardGroup, hand: Card[]): Card[] {
  const usedIds = new Set(group.cards.map((card) => card.id));
  return hand.filter((card) => !usedIds.has(card.id));
}

function hasRecoveryCards(cards: Card[], gameRank: GameRank): boolean {
  return detectGroups(cards, gameRank).some((group) => isStrongTailGroup(group, gameRank));
}

function hasStrongTail(cards: Card[], gameRank: GameRank): boolean {
  return hasRecoveryCards(cards, gameRank);
}

function hasWeakTail(cards: Card[], gameRank: GameRank): boolean {
  const groups = nonOverlappingRemainingGroups(cards, gameRank);
  if (groups.length === 0) {
    return false;
  }

  return groups.some((group) => isWeakTailGroup(group, gameRank));
}

function remainingFollowTurnCount(action: FollowAction, input: AiDecisionInput): number {
  const cards = action.group === undefined ? input.hand : remainingAfterGroup(action.group, input.hand);
  return nonOverlappingRemainingGroups(cards, input.gameRank).length;
}

function hasUsefulNonPowerFollow(input: AiDecisionInput, currentGroup: CardGroup): boolean {
  return detectGroups(input.hand, input.gameRank).some(
    (group) => !isPowerPlay(group) && canBeatPlay(group, currentGroup, input.gameRank) && !breaksHighValueStructure(group, detectGroups(input.hand, input.gameRank), input.gameRank),
  );
}

function isFirstLargeCombinationFromOpponent(input: AiDecisionInput, currentGroup: CardGroup, state: FollowScoreState): boolean {
  if (!state.opponentWinning || input.context === undefined || input.context.playedCards.length > 8) {
    return false;
  }

  return ["straight", "consecutive-pairs", "plate", "full-house"].includes(currentGroup.type);
}

function helpsPartnerFollow(action: FollowAction, input: AiDecisionInput): boolean {
  if (action.actionType === "PASS" || input.context === undefined || input.context.partnerHandCount > 6) {
    return false;
  }

  const type = action.group === undefined ? undefined : leadType(action.group);
  return type !== undefined && likelyTypesForRemainingCount(input.context.partnerHandCount).includes(type);
}

function detectLeadPhase(input: AiDecisionInput): LeadPhase {
  const context = input.context;
  if (context === undefined) {
    return "MIDDLE";
  }

  const counts = [context.ownHandCount, context.partnerHandCount, ...context.opponentHandCounts];
  if (counts.some((count) => count <= 6) || context.finishOrder.length > 0 || context.ownHandCount <= 6 || context.partnerHandCount <= 6) {
    return "LATE";
  }

  if (counts.every((count) => count > 15) && context.playedCards.length <= 8) {
    return "EARLY";
  }

  return context.opponentHandCounts.some((count) => count <= 10) ? "LATE" : "MIDDLE";
}

function legalLeadActions(input: AiDecisionInput): LeadAction[] {
  const handIds = new Set(input.hand.map((card) => card.id));
  const analysis = input.analysis ?? createHandAnalysis(input.hand, input.gameRank, input.bombBreakContext);
  const allGroups = analysis.allGroups;
  const planned = availablePlannedGroups(input.plannedGroups ?? [], input.hand);
  const pool = analysis;
  const sourceGroups = planned.length > 0 ? planned : pool.accepted.map((candidate) => candidate.group);
  const groupsById = new Map<string, CardGroup>();

  for (const group of sourceGroups) {
    if (!group.cards.every((card) => handIds.has(card.id))) {
      continue;
    }

    const diagnostics = assessProtectedGroupUseFromAnalysis(group, analysis, input.bombBreakContext);
    if (leadType(group) === undefined || diagnostics.rejectedByRule) {
      continue;
    }

    groupsById.set(group.id, group);
  }

  const actions = pruneLeadGroups([...groupsById.values()], input.gameRank).map((group) =>
    toLeadAction(group, allGroups, input.gameRank, assessProtectedGroupUseFromAnalysis(group, analysis, input.bombBreakContext)),
  );
  return annotateLeadRecoveryFeatures(actions, input);
}

function pruneLeadGroups(groups: CardGroup[], gameRank: GameRank): CardGroup[] {
  const byType = new Map<LeadActionType, CardGroup[]>();
  for (const group of groups) {
    const type = leadType(group);
    if (type === undefined) {
      continue;
    }

    byType.set(type, [...(byType.get(type) ?? []), group]);
  }

  return [...byType.values()].flatMap((typedGroups) =>
    typedGroups
      .sort((left, right) => leadScore(right, gameRank) - leadScore(left, gameRank))
      .slice(0, 8),
  );
}

function leadType(group: CardGroup): LeadActionType | undefined {
  const types: Partial<Record<CardGroup["type"], LeadActionType>> = {
    single: "SINGLE",
    pair: "PAIR",
    "full-house": "TRIPLE_WITH_PAIR",
    straight: "STRAIGHT",
    "consecutive-pairs": "CONSECUTIVE_PAIRS",
    plate: "PLANE",
    bomb: "BOMB",
    "straight-flush": "STRAIGHT_FLUSH",
    "joker-bomb": "BOMB",
  };

  return types[group.type];
}

function toLeadAction(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank, diagnostics: CandidateDiagnostics): LeadAction {
  const type = leadType(group);
  if (type === undefined) {
    throw new Error("Unsupported lead group type.");
  }

  return {
    type,
    group,
    cards: group.cards,
    mainRank: mainRank(group, gameRank),
    strength: group.strength,
    consumesControl: consumesLeadControl(group, gameRank),
    consumesWildcard: usesHeartRankWildcard(group, gameRank),
    isLowValue: isLowValueLead(group, gameRank),
    isTailCandidate: isStrongTailGroup(group, gameRank) && !isProtectedSubset(group, allGroups),
    isHighestSameTypeAction: false,
    hasLowerSameTypeAction: false,
    leavesHigherSameTypeRecovery: false,
    leavesBombRecovery: false,
    leavesStrongTail: false,
    futureHandPlanScore: 0,
    ...diagnostics,
  };
}

function annotateLeadRecoveryFeatures(actions: LeadAction[], input: AiDecisionInput): LeadAction[] {
  const tripleWithPairs = actions.filter((action) => action.type === "TRIPLE_WITH_PAIR");

  return actions.map((action) => {
    const remaining = remainingCardsAfter(action, input.hand);
    const remainingGroups = detectGroups(remaining, input.gameRank);
    const remainingPlan = nonOverlappingRemainingGroups(remaining, input.gameRank);
    const mainStrength = rankStrength(action.mainRank, input.gameRank);
    const isTripleWithPair = action.type === "TRIPLE_WITH_PAIR";
    const leavesHigherSameTypeRecovery = isTripleWithPair && remainingGroups.some(
      (group) => group.type === "full-house" && rankStrength(mainRank(group, input.gameRank), input.gameRank) > mainStrength,
    );
    const leavesBombRecovery = remainingGroups.some(isPowerPlay);
    const leavesStrongTail = remainingGroups.some((group) => isStrongTailGroup(group, input.gameRank));
    const leavesWeakTail = remainingPlan.some((group) => isWeakTailGroup(group, input.gameRank));
    const futureHandPlanScore =
      (leavesHigherSameTypeRecovery ? 45 : 0) +
      (leavesBombRecovery ? 35 : 0) +
      (leavesStrongTail ? 15 : 0) -
      (leavesWeakTail ? 25 : 0) -
      Math.max(0, remainingPlan.length - 2) * 5;

    return {
      ...action,
      isHighestSameTypeAction: isTripleWithPair && tripleWithPairs.every(
        (candidate) => rankStrength(candidate.mainRank, input.gameRank) <= mainStrength,
      ),
      hasLowerSameTypeAction: isTripleWithPair && tripleWithPairs.some(
        (candidate) => rankStrength(candidate.mainRank, input.gameRank) < mainStrength,
      ),
      leavesHigherSameTypeRecovery,
      leavesBombRecovery,
      leavesStrongTail,
      futureHandPlanScore,
    };
  });
}

function mainRank(group: CardGroup, gameRank: GameRank): Card["rank"] {
  const counts = new Map<Card["rank"], number>();
  for (const card of group.cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || rankStrength(right[0], gameRank) - rankStrength(left[0], gameRank))[0]?.[0] ?? group.cards[0]?.rank ?? gameRank;
}

function consumesLeadControl(group: CardGroup, gameRank: GameRank): boolean {
  if (isPowerPlay(group) || usesHeartRankWildcard(group, gameRank)) {
    return true;
  }

  return group.cards.some((card) => {
    if (card.kind === "joker") {
      return true;
    }

    return card.rank === gameRank || rankStrength(card.rank, gameRank) >= rankStrength("A", gameRank);
  });
}

function isLowValueLead(group: CardGroup, gameRank: GameRank): boolean {
  if (isPowerPlay(group)) {
    return false;
  }

  return groupMajorRankStrength(group, gameRank) <= rankStrength("8", gameRank);
}

function violatesLeadHardRule(action: LeadAction, input: AiDecisionInput): boolean {
  if (!isLeadPowerAction(action) && breaksHighValueStructure(action.group, detectGroups(input.hand, input.gameRank), input.gameRank)) {
    return true;
  }

  if (!isLeadPowerAction(action)) {
    return detectLeadPhase(input) === "LATE" && feedsDangerType(action, input) && hasNonDangerLeadAlternative(input, action);
  }

  return !canLeadPowerPlay(input, action.group);
}

function hasNonDangerLeadAlternative(input: AiDecisionInput, action: LeadAction): boolean {
  return legalLeadActions(input)
    .filter((candidate) => candidate.group.id !== action.group.id)
    .some((candidate) => !isLeadPowerAction(candidate) && !feedsDangerType(candidate, input));
}

function scoreEarlyLead(
  action: LeadAction,
  input: AiDecisionInput,
  phase: LeadPhase,
  dominantTypes: LeadActionType[],
  allActions: LeadAction[],
): number {
  let score = baseLeadActionScore(action, input);
  const remaining = remainingCardsAfter(action, input.hand);

  if (action.type === "PAIR" && (action.isLowValue || isMiddleLeadRank(action, input.gameRank))) {
    score += EARLY_PAIR_PROBE_BONUS;
  }

  if (action.type === "SINGLE" && action.isLowValue) {
    score += EARLY_LOW_SINGLE_PENALTY;
  }

  if ((phase === "EARLY" || phase === "MIDDLE") && action.consumesControl) {
    score += CONTROL_CONSUME_PENALTY;
  }

  if (dominantTypes.includes(action.type)) {
    score += 25;
  }

  if (!hasRecoveryAfter(action, input)) {
    score += NO_RECOVERY_PENALTY;
  }

  if (isIsolatedCombo(action, input, allActions)) {
    score -= 120;
  }

  if (isNextOpponentLikelyToBenefit(action, input)) {
    score -= 20;
  }

  if (phase === "MIDDLE" && action.type === "SINGLE" && action.isLowValue && hasRecoveryAfter(action, input)) {
    score += 35;
  }

  if (action.type === "TRIPLE_WITH_PAIR") {
    if (action.leavesHigherSameTypeRecovery || action.leavesBombRecovery) {
      score += TRIPLE_WITH_PAIR_RECOVERY_BONUS;
    }

    if (action.hasLowerSameTypeAction) {
      score += TRIPLE_WITH_PAIR_LOWER_TIER_PENALTY;
    }

    if (
      action.isHighestSameTypeAction &&
      !action.leavesHigherSameTypeRecovery &&
      !action.leavesBombRecovery &&
      !canLeadHighestTripleWithPair(action, input)
    ) {
      score += HIGHEST_TRIPLE_WITH_PAIR_NO_RECOVERY_PENALTY;
    }

    score += action.futureHandPlanScore;
  }

  if (remaining.length === 0) {
    score += FINISH_IN_ONE_BONUS;
  }

  return score;
}

function canLeadHighestTripleWithPair(action: LeadAction, input: AiDecisionInput): boolean {
  const remaining = remainingCardsAfter(action, input.hand);
  if (remaining.length === 0 || nonOverlappingRemainingGroups(remaining, input.gameRank).length <= 1) {
    return true;
  }

  return input.context?.opponentHandCounts.some((count) => count <= 10) === true;
}

function scoreLateLead(action: LeadAction, input: AiDecisionInput): number {
  let score = baseLeadActionScore(action, input);
  const remaining = remainingCardsAfter(action, input.hand);
  const remainingGroups = nonOverlappingRemainingGroups(remaining, input.gameRank);
  const remainingTurns = remainingGroups.length;

  if (remaining.length === 0) {
    score += FINISH_IN_ONE_BONUS;
  } else if (remainingTurns <= 1) {
    score += FINISH_IN_TWO_BONUS;
  }

  if (feedsDangerType(action, input)) {
    score += LATE_FEED_DANGER_TYPE_PENALTY;
  } else if (dangerLikelyTypes(input).length > 0) {
    score += LATE_BLOCK_DANGER_BONUS;
  }

  if (remainingGroups.some((group) => isStrongTailGroup(group, input.gameRank))) {
    score += STRONG_TAIL_BONUS;
  }

  if (remainingGroups.length > 0 && remainingGroups.every((group) => isWeakTailGroup(group, input.gameRank))) {
    score += WEAK_TAIL_PENALTY;
  }

  if (helpsPartner(action, input)) {
    score += 35;
  }

  if (action.consumesControl) {
    score += CONTROL_CONSUME_PENALTY;
  }

  return score;
}

function baseLeadActionScore(action: LeadAction, input: AiDecisionInput): number {
  const typeBase: Record<LeadActionType, number> = {
    SINGLE: 15,
    PAIR: 45,
    TRIPLE_WITH_PAIR: 55,
    STRAIGHT: 50,
    CONSECUTIVE_PAIRS: 60,
    PLANE: 65,
    BOMB: 5,
    STRAIGHT_FLUSH: 5,
  };

  return typeBase[action.type] + action.strength / 2 - (action.consumesWildcard ? 20 : 0);
}

function compareLeadScores(
  left: { action: LeadAction; score: number },
  right: { action: LeadAction; score: number },
  input: AiDecisionInput,
  phase: LeadPhase,
): number {
  const scoreDelta = right.score - left.score;
  if (Math.abs(scoreDelta) > 0.0001) {
    return scoreDelta;
  }

  return (
    Number(left.action.consumesWildcard) - Number(right.action.consumesWildcard) ||
    Number(left.action.consumesControl) - Number(right.action.consumesControl) ||
    (phase === "EARLY" ? Number(right.action.type === "PAIR") - Number(left.action.type === "PAIR") : 0) ||
    (phase === "LATE" ? Number(feedsDangerType(left.action, input)) - Number(feedsDangerType(right.action, input)) : 0) ||
    remainingTurnCount(left.action, input) - remainingTurnCount(right.action, input) ||
    Number(hasRecoveryAfter(right.action, input)) - Number(hasRecoveryAfter(left.action, input)) ||
    Number(helpsPartner(right.action, input)) - Number(helpsPartner(left.action, input)) ||
    Number(isNextOpponentLikelyToBenefit(left.action, input)) - Number(isNextOpponentLikelyToBenefit(right.action, input)) ||
    playPower(left.action.group, input.gameRank) - playPower(right.action.group, input.gameRank)
  );
}

function isLeadPowerAction(action: LeadAction): boolean {
  return action.type === "BOMB" || action.type === "STRAIGHT_FLUSH";
}

function remainingCardsAfter(action: LeadAction, hand: Card[]): Card[] {
  const usedIds = new Set(action.cards.map((card) => card.id));
  return hand.filter((card) => !usedIds.has(card.id));
}

function remainingTurnCount(action: LeadAction, input: AiDecisionInput): number {
  return nonOverlappingRemainingGroups(remainingCardsAfter(action, input.hand), input.gameRank).length;
}

function nonOverlappingRemainingGroups(cards: Card[], gameRank: GameRank): CardGroup[] {
  const usedIds = new Set<string>();
  const selected: CardGroup[] = [];
  const groups = detectGroups(cards, gameRank)
    .filter((group) => leadType(group) !== undefined)
    .sort((left, right) => leadScore(right, gameRank) - leadScore(left, gameRank));

  for (const group of groups) {
    if (group.cards.some((card) => usedIds.has(card.id))) {
      continue;
    }

    selected.push(group);
    for (const card of group.cards) {
      usedIds.add(card.id);
    }
  }

  return selected;
}

function hasRecoveryAfter(action: LeadAction, input: AiDecisionInput): boolean {
  return detectGroups(remainingCardsAfter(action, input.hand), input.gameRank).some((group) => isStrongTailGroup(group, input.gameRank));
}

function isStrongTailGroup(group: CardGroup, gameRank: GameRank): boolean {
  if (isPowerPlay(group)) {
    return true;
  }

  if (group.type === "single" || group.type === "pair") {
    return group.cards.some((card) => card.kind === "joker" || (card.kind === "suited" && (card.rank === gameRank || rankStrength(card.rank, gameRank) >= rankStrength("A", gameRank))));
  }

  if (group.type === "full-house") {
    return groupMajorRankStrength(group, gameRank) >= rankStrength("A", gameRank);
  }

  if (group.type === "straight" || group.type === "consecutive-pairs" || group.type === "plate") {
    return group.strength >= 45;
  }

  return false;
}

function isWeakTailGroup(group: CardGroup, gameRank: GameRank): boolean {
  if (isPowerPlay(group)) {
    return false;
  }

  if (group.type === "single" || group.type === "pair") {
    return groupMajorRankStrength(group, gameRank) <= rankStrength("8", gameRank);
  }

  return group.type === "straight" && group.strength < 42;
}

function dominantLeadTypes(actions: LeadAction[]): LeadActionType[] {
  const counts = new Map<LeadActionType, number>();
  for (const action of actions) {
    counts.set(action.type, (counts.get(action.type) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([type, count]) => count >= (type === "PAIR" ? 3 : 2))
    .map(([type]) => type);
}

function isMiddleLeadRank(action: LeadAction, gameRank: GameRank): boolean {
  const strength = rankStrength(action.mainRank, gameRank);
  return strength >= rankStrength("9", gameRank) && strength < rankStrength("K", gameRank);
}

function isIsolatedCombo(action: LeadAction, input: AiDecisionInput, allActions: LeadAction[]): boolean {
  if (action.type !== "STRAIGHT") {
    return false;
  }

  const hasNonOverlappingSameType = allActions.some((candidate) => {
    if (candidate.group.id === action.group.id || candidate.type !== action.type) {
      return false;
    }

    return !sharesCards(candidate.group, action.group);
  });

  return !hasNonOverlappingSameType && !hasRecoveryAfter(action, input);
}

function dangerLikelyTypes(input: AiDecisionInput): LeadActionType[] {
  const context = input.context;
  if (context === undefined) {
    return [];
  }

  return context.opponentHandCounts
    .filter((count) => count <= 6)
    .flatMap((count) => likelyTypesForRemainingCount(count));
}

function likelyTypesForRemainingCount(count: number): LeadActionType[] {
  if (count === 1) {
    return ["SINGLE"];
  }

  if (count === 2) {
    return ["PAIR"];
  }

  if (count === 3) {
    return ["SINGLE", "PAIR"];
  }

  if (count === 5) {
    return ["STRAIGHT", "TRIPLE_WITH_PAIR"];
  }

  if (count === 6) {
    return ["CONSECUTIVE_PAIRS", "PLANE"];
  }

  return [];
}

function feedsDangerType(action: LeadAction, input: AiDecisionInput): boolean {
  return dangerLikelyTypes(input).includes(action.type);
}

function helpsPartner(action: LeadAction, input: AiDecisionInput): boolean {
  const context = input.context;
  if (context === undefined || context.partnerHandCount > 6) {
    return false;
  }

  return likelyTypesForRemainingCount(context.partnerHandCount).includes(action.type);
}

function isNextOpponentLikelyToBenefit(action: LeadAction, input: AiDecisionInput): boolean {
  const context = input.context;
  if (context === undefined) {
    return false;
  }

  const nextOpponentCount = context.opponentHandCounts[0];
  return nextOpponentCount !== undefined && likelyTypesForRemainingCount(nextOpponentCount).includes(action.type);
}

function structureAwareResponses(
  hand: Card[],
  partnerHand: Card[],
  gameRank: GameRank,
  lastPlay: CardGroup,
  context?: AiTableContext,
  partnerSeat?: number,
): CardGroup[] {
  const allGroups = detectGroups(hand, gameRank);
  const ordinaryResponses = allGroups
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => !isPowerPlay(group))
    .filter((group) => !isProtectedResponseSubset(group, lastPlay, allGroups, gameRank))
    .filter(
      (group) =>
        !breaksHighValueStructure(group, allGroups, gameRank) ||
        canSplitHighBombPair(group, lastPlay, allGroups, gameRank) ||
        canSplitPairFromFullHouseResponse(group, lastPlay, allGroups, gameRank),
    )
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

      const looseSingles = ordinaryResponses
        .filter((group) => group.type === "single")
        .filter((group) => isOrdinaryTempoSingle(group, gameRank))
        .filter((group) => !isProtectedSingle(group, allGroups));
      if (looseSingles.length > 0) {
        return looseSingles;
      }

      const nonSingleResponses = ordinaryResponses.filter((group) => group.type !== "single");
      if (nonSingleResponses.length === 0) {
        return [];
      }
    }

    return ordinaryResponses;
  }

  const highWoodPairs = highWoodPairResponses(hand, gameRank, lastPlay, context);
  if (highWoodPairs.length > 0) {
    return highWoodPairs;
  }

  const highPlateFullHouses = highPlateFullHouseResponses(hand, gameRank, lastPlay, context);
  if (highPlateFullHouses.length > 0) {
    return highPlateFullHouses;
  }

  if (!shouldUsePowerResponse(hand, partnerHand, gameRank, lastPlay, context, partnerSeat)) {
    return [];
  }

  return allGroups
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => isPowerPlay(group))
    .filter((group) => !wastesWildcardStructure(group, allGroups, gameRank))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank));
}

function highWoodPairResponses(hand: Card[], gameRank: GameRank, lastPlay: CardGroup, context?: AiTableContext): CardGroup[] {
  if (lastPlay.type !== "pair" || context?.partnerPassedCurrentTrick !== true) {
    return [];
  }

  const allGroups = detectGroups(hand, gameRank);
  const hasOrdinaryPair = allGroups.some(
    (group) => group.type === "pair" && canBeatPlay(group, lastPlay, gameRank) && !isPairProtectedForPairResponse(group, allGroups),
  );
  if (hasOrdinaryPair) {
    return [];
  }

  return allGroups
    .filter((group) => group.type === "pair")
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => groupMajorRankStrength(group, gameRank) >= rankStrength("Q", gameRank))
    .filter((group) => allGroups.some((container) => isHighWoodPairSubset(group, container, gameRank)))
    .sort((left, right) => playPower(left, gameRank) - playPower(right, gameRank));
}

function isHighWoodPairSubset(pair: CardGroup, container: CardGroup, gameRank: GameRank): boolean {
  if (pair.type !== "pair" || container.type !== "consecutive-pairs") {
    return false;
  }

  const containerIds = new Set(container.cards.map((card) => card.id));
  return pair.cards.every((card) => containerIds.has(card.id)) &&
    container.cards.every((card) => rankStrength(card.rank, gameRank) >= rankStrength("Q", gameRank));
}

function highPlateFullHouseResponses(hand: Card[], gameRank: GameRank, lastPlay: CardGroup, context?: AiTableContext): CardGroup[] {
  if (lastPlay.type !== "full-house" || context?.partnerPassedCurrentTrick !== true) {
    return [];
  }

  const allGroups = detectGroups(hand, gameRank);
  const hasOrdinaryFullHouse = allGroups.some(
    (group) =>
      group.type === "full-house" &&
      canBeatPlay(group, lastPlay, gameRank) &&
      !allGroups.some((container) => isHighPlateFullHouseSubset(group, container, gameRank)),
  );
  if (hasOrdinaryFullHouse) {
    return [];
  }

  return allGroups
    .filter((group) => group.type === "full-house")
    .filter((group) => canBeatPlay(group, lastPlay, gameRank))
    .filter((group) => allGroups.some((container) => isHighPlateFullHouseSubset(group, container, gameRank)))
    .sort((left, right) => compareResponseCost(left, right, gameRank, allGroups));
}

function isHighPlateFullHouseSubset(group: CardGroup, container: CardGroup, gameRank: GameRank): boolean {
  if (group.type !== "full-house" || container.type !== "plate") {
    return false;
  }

  const containerIds = new Set(container.cards.map((card) => card.id));
  return group.cards.every((card) => containerIds.has(card.id)) &&
    container.cards.every((card) => rankStrength(card.rank, gameRank) >= rankStrength("Q", gameRank));
}

function availablePlannedGroups(plannedGroups: CardGroup[], hand: Card[]): CardGroup[] {
  const handIds = new Set(hand.map((card) => card.id));
  return plannedGroups.filter((group) => group.cards.every((card) => handIds.has(card.id)));
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
    .filter((group) => !isProtectedSingle(group, allGroups))
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

function supportResponse(
  hand: Card[],
  gameRank: GameRank,
  lastPlay: CardGroup,
  context?: AiTableContext,
): CardGroup | undefined {
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
    .filter((group) => !shouldReserveBigJokerSingleFromGroups(hand, allGroups, gameRank, group, context))
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
    .filter((group) => !isSingleInContainerTypes(group, detectGroups(hand, gameRank), ["triple", "bomb", "joker-bomb", "consecutive-pairs", "plate"]))
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
  const hasPowerRecovery = allGroups.some((group) => isPowerPlay(group) || isJokerPair(group));
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

function powerBackedLooseSingleLead(input: AiDecisionInput): CardGroup | undefined {
  const context = input.context;
  if (context !== undefined && context.opponentHandCounts.some((count) => count <= 2)) {
    return undefined;
  }

  if (!hasLooseSingleRecovery(input.hand, input.gameRank)) {
    return undefined;
  }

  return looseSingleTempoLead(input.hand, input.gameRank);
}

function hasLooseSingleRecovery(hand: Card[], gameRank: GameRank): boolean {
  return detectGroups(hand, gameRank).some((group) => isPowerPlay(group) || isJokerPair(group) || isHighSingleControl(group, gameRank));
}

function retainedSingleControlLooseSingleLead(input: AiDecisionInput): CardGroup | undefined {
  const context = input.context;
  if (context !== undefined && context.opponentHandCounts.some((count) => count <= 2)) {
    return undefined;
  }

  if (!availablePlannedGroups(input.plannedGroups ?? [], input.hand).some((group) => isBigJokerSingle(group))) {
    return undefined;
  }

  const allGroups = detectGroups(input.hand, input.gameRank);
  return allGroups
    .filter((group) => group.type === "single")
    .filter((group) => isSmallOrdinarySingle(group, input.gameRank))
    .filter((group) => !isHardProtectedSingle(group, allGroups, input.gameRank))
    .sort((left, right) => playPower(left, input.gameRank) - playPower(right, input.gameRank))[0];
}

function isJokerPair(group: CardGroup): boolean {
  return group.type === "pair" && group.cards.length === 2 && group.cards.every((card) => card.kind === "joker");
}

function isBigJokerSingle(group: CardGroup): boolean {
  const card = group.cards[0];
  return group.type === "single" && card?.kind === "joker" && card.rank === "BJ";
}

function plannedLinkedLead(hand: Card[], gameRank: GameRank, plannedGroups: CardGroup[]): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  const candidates = plannedGroups.length > 0
    ? plannedGroups
    : allGroups.filter((group) => ["full-house", "straight", "consecutive-pairs", "plate"].includes(group.type));

  return candidates
    .filter((group) => group.type !== "single")
    .filter((group) => !isPowerPlay(group))
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank))
    .sort((left, right) => leadScore(right, gameRank) - leadScore(left, gameRank))[0];
}

function powerTailSetupLead(input: AiDecisionInput): CardGroup | undefined {
  const allGroups = detectGroups(input.hand, input.gameRank);
  return allGroups
    .filter((group) => !isPowerPlay(group))
    .filter((group) => !breaksHighValueStructure(group, allGroups, input.gameRank))
    .filter((group) => !wouldFeedOpponentFinish(group, input))
    .filter((group) => remainingCardsArePowerOnly(cardsAfterGroup(input.hand, group), input.gameRank))
    .sort(
      (left, right) =>
        left.cards.length - right.cards.length ||
        playPower(left, input.gameRank) - playPower(right, input.gameRank),
    )[0];
}

function remainingCardsArePowerOnly(cards: Card[], gameRank: GameRank): boolean {
  if (cards.length === 0) {
    return false;
  }

  const usedIds = new Set<string>();
  for (const group of detectGroups(cards, gameRank)
    .filter((candidate) => isPowerPlay(candidate))
    .sort((left, right) => right.cards.length - left.cards.length)) {
    if (group.cards.some((card) => usedIds.has(card.id))) {
      continue;
    }

    for (const card of group.cards) {
      usedIds.add(card.id);
    }
  }

  return cards.every((card) => usedIds.has(card.id));
}

function wouldFeedOpponentFinish(group: CardGroup, input: AiDecisionInput): boolean {
  const context = input.context;
  const type = leadType(group);
  if (context === undefined || type === undefined) {
    return false;
  }

  return context.opponentHandCounts.some((count) => count === group.cards.length && likelyTypesForRemainingCount(count).includes(type));
}

function tailRegroupLead(input: AiDecisionInput, plannedGroups: CardGroup[]): CardGroup | undefined {
  if (plannedGroups.length < 3) {
    return undefined;
  }

  const allGroups = detectGroups(input.hand, input.gameRank);
  const plannedTurnCount = plannedGroups.filter((group) => !isPowerPlay(group) || canLeadPowerPlay(input, group)).length;
  return allGroups
    .filter((group) => group.type === "full-house" || group.type === "straight" || group.type === "consecutive-pairs" || group.type === "plate")
    .filter((group) => !breaksHighValueStructure(group, allGroups, input.gameRank))
    .filter((group) => !fullHousePairBreaksPowerStructure(group, allGroups, input.gameRank))
    .filter((group) => {
      const remainingGroups = nonOverlappingRemainingGroups(cardsAfterGroup(input.hand, group), input.gameRank);
      return remainingGroups.length + 1 <= plannedTurnCount - 2 && remainingGroups.some((remaining) => isPowerPlay(remaining) || isStrongTailGroup(remaining, input.gameRank));
    })
    .sort(
      (left, right) =>
        right.cards.length - left.cards.length ||
        leadScore(right, input.gameRank) - leadScore(left, input.gameRank),
    )[0];
}

function cardsAfterGroup(hand: Card[], group: CardGroup): Card[] {
  const groupIds = new Set(group.cards.map((card) => card.id));
  return hand.filter((card) => !groupIds.has(card.id));
}

function weakFullHouseTempoLead(hand: Card[], gameRank: GameRank): CardGroup | undefined {
  const allGroups = detectGroups(hand, gameRank);
  const hasBombRecovery = allGroups.some((group) => group.type === "bomb" || group.type === "joker-bomb");
  if (!hasBombRecovery) {
    return undefined;
  }

  return allGroups
    .filter((group) => group.type === "full-house")
    .filter((group) => groupMajorRankStrength(group, gameRank) <= rankStrength("6", gameRank))
    .filter((group) => !breaksHighValueStructure(group, allGroups, gameRank))
    .filter((group) => !fullHousePairBreaksPowerStructure(group, allGroups, gameRank))
    .sort(
      (left, right) =>
        groupMajorRankStrength(right, gameRank) - groupMajorRankStrength(left, gameRank) ||
          fullHousePairCost(left, gameRank, allGroups) - fullHousePairCost(right, gameRank, allGroups),
      )[0];
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

function controlledLead(allGroups: CardGroup[], gameRank: GameRank, type: CardGroup["type"]): CardGroup | undefined {
  const candidates = allGroups
    .filter((group) => group.type === type)
    .filter((group) => type !== "pair" || !isProtectedSubset(group, allGroups))
    .filter((group) => type !== "single" || !isProtectedSingle(group, allGroups))
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
  return group.type === "single" && card?.kind === "suited" && card.rank !== gameRank && !isHeartRankWild(card, gameRank) && !isNaturalTenOrHigher(card);
}

function isOrdinaryTempoSingle(group: CardGroup, gameRank: GameRank): boolean {
  const card = group.cards[0];
  return group.type === "single" && card?.kind === "suited" && !isHeartRankWild(card, gameRank) && card.rank !== gameRank;
}

function shouldUsePowerResponse(
  hand: Card[],
  partnerHand: Card[],
  gameRank: GameRank,
  lastPlay: CardGroup,
  context?: AiTableContext,
  partnerSeat?: number,
  response?: CardGroup,
): boolean {
  const powerCount = powerResourceCount(hand, gameRank);
  const hasImmediateException =
    response !== undefined &&
    (response.cards.length === hand.length ||
      context?.opponentHandCounts.some((count) => count <= 2) === true ||
      (partnerSeat !== undefined && context?.finishOrder.includes(partnerSeat) === true) ||
      (context !== undefined && context.ownHandCount <= response.cards.length + 2));

  if (hasImmediateException) {
    return availablePowerResponses(hand, gameRank, lastPlay).length > 0;
  }

  if (isPowerPlay(lastPlay)) {
    return powerCount >= 3 && availablePowerResponses(hand, gameRank, lastPlay).length > 0;
  }

  if (!isBombTrigger(lastPlay, gameRank) || teamCanAnswerSameType(hand, partnerHand, gameRank, lastPlay)) {
    return false;
  }

  if (isEmergencyBombTrigger(lastPlay)) {
    return availablePowerResponses(hand, gameRank, lastPlay).length > 0;
  }

  return powerCount >= 3 && availablePowerResponses(hand, gameRank, lastPlay).length > 0;
}

function shouldReserveBigJokerSingleResponse(
  input: AiDecisionInput,
  response: CardGroup,
  plannedGroups: CardGroup[],
): boolean {
  const context = input.context;
  if (
    input.lastPlay === undefined ||
    input.lastPlay.type !== "single" ||
    response.type !== "single" ||
    response.cards[0]?.kind !== "joker" ||
    response.cards[0].rank !== "BJ" ||
    response.cards.length === input.hand.length ||
    isHighSingleControl(input.lastPlay, input.gameRank) ||
    context?.opponentHandCounts.some((count) => count <= 2) === true ||
    (context !== undefined && context.ownHandCount <= response.cards.length + 2) ||
    context?.finishOrder.includes(input.partnerSeat) === true
  ) {
    return false;
  }

  if (
    plannedGroups.some((group) => group.id !== response.id && isSmallOrdinarySingle(group, input.gameRank)) &&
    plannedGroups.some((group) => group.id !== response.id && isPowerPlay(group) && !sharesCards(group, response))
  ) {
    return true;
  }

  return shouldReserveBigJokerSingleFromGroups(
    input.hand,
    detectGroups(input.hand, input.gameRank),
    input.gameRank,
    response,
    context,
  );
}

function shouldReserveBigJokerSingleFromGroups(
  hand: Card[],
  allGroups: CardGroup[],
  gameRank: GameRank,
  response: CardGroup,
  context?: AiTableContext,
): boolean {
  if (
    response.type !== "single" ||
    response.cards[0]?.kind !== "joker" ||
    response.cards[0].rank !== "BJ" ||
    response.cards.length === hand.length ||
    context?.opponentHandCounts.some((count) => count <= 2) === true ||
    (context !== undefined && context.ownHandCount <= response.cards.length + 2)
  ) {
    return false;
  }

  return allGroups.some((group) =>
    group.id !== response.id &&
    isSmallOrdinarySingle(group, gameRank) &&
    !isHardProtectedSingle(group, allGroups, gameRank),
  ) && allGroups.some((group) => isPowerPlay(group) && !sharesCards(group, response));
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

function canSplitPairFromFullHouseResponse(group: CardGroup, lastPlay: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  if (lastPlay.type !== "pair" || group.type !== "pair") {
    return false;
  }

  if (allGroups.some((container) => container.type === "bomb" && !usesHeartRankWildcard(container, gameRank) && group.cards.every((card) => container.cards.some((containerCard) => containerCard.id === card.id)))) {
    return false;
  }

  return allGroups.some((container) => {
    if (container.type !== "full-house" && container.type !== "triple") {
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

function isEmergencyBombTrigger(group: CardGroup): boolean {
  return isSecondBigJoker(group);
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
    .filter((group) => group.type !== "single" || !isProtectedSingle(group, allGroups))
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

function isProtectedResponseSubset(group: CardGroup, lastPlay: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  if (group.type === "pair" && lastPlay.type === "pair") {
    return isPairProtectedForPairResponse(group, allGroups);
  }

  if (group.type === "full-house" && lastPlay.type === "full-house") {
    return allGroups.some((container) => isHighPlateFullHouseSubset(group, container, gameRank));
  }

  return isProtectedSubset(group, allGroups);
}

function isPairProtectedForPairResponse(group: CardGroup, allGroups: CardGroup[]): boolean {
  if (group.type !== "pair") {
    return false;
  }

  const pairResponses = allGroups.filter((candidate) => candidate.type === "pair");
  const hasPairReserve = pairResponses.length >= 4;

  return allGroups.some((container) => {
    if (!["consecutive-pairs", "plate", "straight-flush"].includes(container.type)) {
      return false;
    }

    if (container.type === "consecutive-pairs" && hasPairReserve) {
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

function isSingleInContainerTypes(group: CardGroup, allGroups: CardGroup[], types: CardGroup["type"][]): boolean {
  const card = group.cards[0];
  if (group.type !== "single" || card === undefined) {
    return false;
  }

  return allGroups.some((container) => types.includes(container.type) && container.cards.length > 1 && container.cards.some((containerCard) => containerCard.id === card.id));
}

function isHardProtectedSingle(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  const card = group.cards[0];
  if (group.type !== "single" || card === undefined) {
    return false;
  }

  return allGroups.some((container) => {
    if (!["pair", "triple", "bomb", "joker-bomb", "full-house", "straight", "consecutive-pairs", "plate", "straight-flush"].includes(container.type)) {
      return false;
    }

    if (usesHeartRankWildcard(container, gameRank)) {
      return false;
    }

    return container.cards.length > 1 && container.cards.some((containerCard) => containerCard.id === card.id);
  });
}

function contextualAiRole(role: AiRole, input: AiDecisionInput): AiRole {
  const context = input.context;
  if (context === undefined) {
    return role;
  }

  if (context.finishOrder.includes(input.partnerSeat) || context.partnerHandCount <= 3) {
    return "support";
  }

  if (context.ownHandCount <= 6 && !context.finishOrder.includes(input.seat)) {
    return "attacker";
  }

  if (context.opponentHandCounts.some((count) => count <= 3)) {
    return role === "attacker" ? "attacker" : "support";
  }

  return role;
}

function shouldYieldToPartner(input: AiDecisionInput): boolean {
  const context = input.context;
  if (input.lastPlay === undefined || context === undefined) {
    return false;
  }

  if (context.finishOrder.includes(input.partnerSeat)) {
    return true;
  }

  if (context.partnerHandCount <= 2) {
    return true;
  }

  if (input.lastPlay.type !== "single") {
    return true;
  }

  if (canOvertakePartnerLowSingle(input)) {
    return false;
  }

  return context.partnerHandCount <= input.hand.length && context.partnerHandCount <= Math.min(...context.opponentHandCounts);
}

function canOvertakePartnerLowSingle(input: AiDecisionInput): boolean {
  const context = input.context;
  if (input.lastPlay === undefined || context === undefined || !isSmallOrdinarySingle(input.lastPlay, input.gameRank)) {
    return false;
  }

  if (context.partnerHandCount <= 3) {
    return false;
  }

  const response = partnerSingleResponse(input.hand, input.gameRank, input.lastPlay);
  if (response === undefined) {
    return false;
  }

  const allGroups = detectGroups(input.hand, input.gameRank);
  return !isProtectedSingle(response, allGroups) && !isHardProtectedSingle(response, allGroups, input.gameRank);
}

function shouldPreferStructuredLead(input: AiDecisionInput): boolean {
  const context = input.context;
  if (context === undefined) {
    return false;
  }

  return context.opponentHandCounts.some((count) => count <= 3) || context.ownHandCount <= 6;
}

function canLeadPowerPlay(input: AiDecisionInput, group: CardGroup): boolean {
  if (group.cards.length === input.hand.length) {
    return true;
  }

  return remainingPlannedGroupsArePowerOnly(input, group);
}

function remainingPlannedGroupsArePowerOnly(input: AiDecisionInput, leadGroup: CardGroup): boolean {
  const plannedGroups = availablePlannedGroups(input.plannedGroups ?? [], input.hand)
    .filter((group) => group.id !== leadGroup.id);

  if (plannedGroups.length === 0) {
    return false;
  }

  if (plannedGroups.some((group) => !isPowerPlay(group))) {
    return false;
  }

  const plannedIds = new Set(plannedGroups.flatMap((group) => group.cards.map((card) => card.id)));
  const leadIds = new Set(leadGroup.cards.map((card) => card.id));
  return input.hand.every((card) => leadIds.has(card.id) || plannedIds.has(card.id));
}

function urgentEndgameLead(input: AiDecisionInput, role: AiRole): CardGroup | undefined {
  const context = input.context;
  if (context === undefined || role !== "attacker" || context.ownHandCount > 6) {
    return undefined;
  }

  const allGroups = detectGroups(input.hand, input.gameRank);
  return allGroups
    .filter((group) => group.cards.length > 1)
    .filter((group) => !isPowerPlay(group) || context.ownHandCount === group.cards.length)
    .filter((group) => !breaksHighValueStructure(group, allGroups, input.gameRank))
    .sort(
      (left, right) =>
        right.cards.length - left.cards.length ||
        playPower(left, input.gameRank) - playPower(right, input.gameRank),
    )[0];
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
  return (LEAD_TYPE_ORDER[group.type] ?? 0) * 100 + group.cards.length * 10 - playPower(group, gameRank) / 100 - leadKickerCost(group, gameRank);
}

function leadKickerCost(group: CardGroup, gameRank: GameRank): number {
  if (group.type !== "full-house") {
    return 0;
  }

  return fullHousePairCost(group, gameRank, []) / 100;
}
