import { isHeartRankWild, type Card, type GameRank } from "../../engine/cards";
import type { CardGroup, GroupType } from "../../engine/groups";
import { canBeatPlay } from "../../game/playRules";
import type { HandAnalysis, HandPlan, PlanMetrics } from "../contracts";
import type { PowerGroupPolicyIndex } from "../policy/powerGroupPolicy";
import { measureProtectionLoss } from "../policy/powerGroupPolicy";

export function evaluatePlan(hand: Card[], handGroups: CardGroup[], groups: CardGroup[], gameRank: GameRank, fallbackScore = 0): PlanMetrics {
  const used = groups.flatMap((group) => group.cards.map((card) => card.id));
  const hardViolations = used.length !== hand.length || new Set(used).size !== used.length || hand.some((card) => !used.includes(card.id)) ? 1 : 0;
  const lowSingleCount = groups.filter((group) => group.type === "single" && group.cards[0]?.kind === "suited" && group.cards[0].rank !== gameRank && !isHeartRankWild(group.cards[0], gameRank) && ["2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(group.cards[0].rank)).length;
  const retainedControl = groups.filter((group) => group.type === "single" && (group.cards[0]?.kind === "joker" || group.cards[0]?.rank === "A" || group.cards[0]?.rank === gameRank)).length;
  return { hardViolations, protectionLoss: measureProtectionLoss(handGroups, groups, gameRank), estimatedTurns: groups.length, lowSingleCount, retainedControl, wildcardFlexibility: groups.reduce((sum, group) => sum + group.wildcards.length, 0), responseCoverage: groups.filter((group) => group.type !== "single").length, leadFlexibility: groups.length, fallbackScore };
}

export function comparePlans(left: HandPlan, right: HandPlan): number {
  const a = left.metrics; const b = right.metrics;
  return a.hardViolations - b.hardViolations || a.protectionLoss - b.protectionLoss || a.lowSingleCount - b.lowSingleCount || a.estimatedTurns - b.estimatedTurns || b.retainedControl - a.retainedControl || b.wildcardFlexibility - a.wildcardFlexibility || b.responseCoverage - a.responseCoverage || b.leadFlexibility - a.leadFlexibility || b.fallbackScore - a.fallbackScore || left.id.localeCompare(right.id);
}

export type DynamicPlanEvaluationInput = Readonly<{
  plan: HandPlan;
  hand: readonly Card[];
  gameRank: GameRank;
  seat: number;
  partnerSeat: number;
  handCounts: Readonly<Record<number, number>>;
  finishOrder: readonly number[];
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  partnerPassedCurrentTrick?: boolean;
  powerGroupPolicyIndex: Readonly<PowerGroupPolicyIndex>;
  analysis?: Readonly<HandAnalysis>;
}>;

export type DynamicPlanComponents = Readonly<{
  immediatePlayability: number;
  tempoFit: number;
  endgameFit: number;
  partnerContextFit: number;
  opponentPressureFit: number;
  powerGroupRisk: number;
}>;

export type DynamicPlanEvaluation = Readonly<{
  planId: string;
  staticPlanQuality: number;
  components: DynamicPlanComponents;
  total: number;
}>;

type CandidateSummary = {
  groups: readonly CardGroup[];
  groupCount: number;
  structuralValid: boolean;
  beatCoverage: number;
  leadTypeDiversity: number;
  controlPreservingLeadCoverage: number;
  projectedLowSingles: number;
  smallGroupCount: number;
  estimatedFinishTurns: number;
  passPreservesPlan: boolean;
};

const GROUP_TYPES = new Set<GroupType>([
  "single", "pair", "triple", "full-house", "straight", "consecutive-pairs", "plate", "bomb", "straight-flush", "joker-bomb",
]);

export function evaluateDynamicPlan(input: DynamicPlanEvaluationInput): DynamicPlanEvaluation {
  validateDynamicInput(input);
  const handSize = input.hand.length;
  const metrics = input.plan.metrics;
  const turnFit = clamp(1 - clamp(metrics.estimatedTurns / 20, 0, 1), 0, 1);
  const staticPlanQuality = round6(clamp(
    10 * turnFit
      + 8 * (1 - normalize(metrics.lowSingleCount, handSize))
      + 8 * normalize(metrics.retainedControl, handSize)
      + 6 * normalize(metrics.wildcardFlexibility, handSize)
      + 8 * normalize(metrics.leadFlexibility, handSize),
    0,
    40,
  ));

  const summary = summarizeCandidate(input);
  const immediatePlayability = round6(immediateScore(input, summary));
  const tempoFit = round6(clamp(10 * turnFit, 0, 10));
  const endgameFit = round6(endgameScore(input, summary));
  const partnerContextFit = round6(partnerScore(input, summary));
  const opponentPressureFit = round6(opponentPressureScore(input, summary));
  const powerGroupRisk = round6(powerRisk(input));
  const components = { immediatePlayability, tempoFit, endgameFit, partnerContextFit, opponentPressureFit, powerGroupRisk };
  const total = round6(staticPlanQuality + immediatePlayability + tempoFit + endgameFit + partnerContextFit + opponentPressureFit - powerGroupRisk);
  return { planId: input.plan.id, staticPlanQuality, components, total };
}

function validateDynamicInput(input: DynamicPlanEvaluationInput): void {
  if (input.plan.id.length === 0) throw new Error("DYNAMIC_PLAN_INVALID_ID");
  if (!Number.isInteger(input.seat) || !Number.isInteger(input.partnerSeat)) throw new Error("DYNAMIC_PLAN_INVALID_SEAT");
  if (input.hand.some((card) => card.id.length === 0) || new Set(input.hand.map((card) => card.id)).size !== input.hand.length) throw new Error("DYNAMIC_PLAN_INVALID_HAND");
  for (const [seat, count] of Object.entries(input.handCounts)) {
    if (!Number.isInteger(Number(seat)) || !Number.isFinite(count) || count < 0) throw new Error("DYNAMIC_PLAN_INVALID_HAND_COUNT");
  }
  if (input.finishOrder.some((seat) => !Number.isInteger(seat))) throw new Error("DYNAMIC_PLAN_INVALID_FINISH_ORDER");
  if (input.lastPlaySeat !== undefined && !Number.isInteger(input.lastPlaySeat)) throw new Error("DYNAMIC_PLAN_INVALID_LAST_PLAY_SEAT");
  const metrics = input.plan.metrics;
  for (const value of Object.values(metrics)) {
    if (!Number.isFinite(value) || value < 0) throw new Error("DYNAMIC_PLAN_INVALID_METRIC");
  }
  const protectedCount = input.powerGroupPolicyIndex.protectedGroups.length;
  if (!Number.isInteger(protectedCount) || protectedCount < 0) throw new Error("DYNAMIC_PLAN_INVALID_POLICY_INDEX");
  if (!Number.isFinite(metrics.protectionLoss) || !Number.isInteger(metrics.protectionLoss) || metrics.protectionLoss < 0 || metrics.protectionLoss > protectedCount) {
    throw new Error("DYNAMIC_PLAN_INVALID_PROTECTION_LOSS");
  }
}

function summarizeCandidate(input: DynamicPlanEvaluationInput): CandidateSummary {
  const groups = [...input.plan.groups].sort((left, right) => stableGroupKey(left).localeCompare(stableGroupKey(right)));
  const handIds = new Set(input.hand.map((card) => card.id));
  const used = new Set<string>();
  let structuralValid = groups.length > 0;
  let beatCount = 0;
  let preservingCount = 0;
  let projectedLowSingles = 0;
  let smallGroupCount = 0;
  const leadTypes = new Set<GroupType>();
  for (const [index, group] of groups.entries()) {
    if (!GROUP_TYPES.has(group.type) || group.cards.length === 0 || group.id.length === 0) structuralValid = false;
    for (const card of group.cards) {
      if (!handIds.has(card.id) || used.has(card.id)) structuralValid = false;
      used.add(card.id);
    }
    if (input.lastPlay !== undefined && canBeatPlay(group, input.lastPlay, input.gameRank)) beatCount += 1;
    leadTypes.add(group.type);
    if (isControlPreserving(group, input.powerGroupPolicyIndex.protectedGroups)) preservingCount += 1;
    if (group.cards.length <= 2) smallGroupCount += 1;
    if (index >= 2 && isLowSingle(group, input.gameRank)) projectedLowSingles += 1;
  }
  if (used.size !== input.hand.length || [...handIds].some((id) => !used.has(id))) structuralValid = false;
  const groupCount = groups.length;
  const beatCoverage = groupCount === 0 ? 0 : beatCount / groupCount;
  const controlPreservingLeadCoverage = groupCount === 0 ? 0 : preservingCount / groupCount;
  const passPreservesPlan = input.lastPlay !== undefined && input.lastPlaySeat === input.partnerSeat && beatCount === 0;
  return {
    groups,
    groupCount,
    structuralValid,
    beatCoverage,
    leadTypeDiversity: Math.min(1, leadTypes.size / 4),
    controlPreservingLeadCoverage,
    projectedLowSingles,
    smallGroupCount,
    estimatedFinishTurns: Math.min(groupCount, 2),
    passPreservesPlan,
  };
}

function immediateScore(input: DynamicPlanEvaluationInput, summary: CandidateSummary): number {
  if (!summary.structuralValid) return 0;
  if (input.lastPlay === undefined) return 15;
  if (summary.beatCoverage > 0) return 15;
  return 5 + 5 * trickFit(input);
}

function trickFit(input: DynamicPlanEvaluationInput): number {
  if (input.lastPlay === undefined) return 1;
  return 0.5 * Number(input.lastPlaySeat === input.partnerSeat) + 0.5 * Number(input.partnerPassedCurrentTrick === true);
}

function endgameScore(input: DynamicPlanEvaluationInput, summary: CandidateSummary): number {
  if (!summary.structuralValid) return 0;
  const handSize = Math.max(1, input.hand.length);
  const smallFraction = summary.groupCount === 0 ? 1 : summary.smallGroupCount / summary.groupCount;
  const fragmentationPenalty = clamp(0.5 * smallFraction + 0.5 * summary.groupCount / handSize, 0, 1);
  const remainingGroupFit = clamp(1 - Math.max(0, summary.groupCount - 1) / handSize, 0, 1);
  const finishWithinOneOrTwoTurnsFit = summary.groupCount <= 1 ? 1 : summary.groupCount === 2 ? 0.9 : summary.groupCount === 3 ? 0.45 : 0;
  const lowSingleRiskFit = 1 - normalize(summary.projectedLowSingles, handSize);
  const candidateEndgameLeadCoverage = 0.5 * summary.leadTypeDiversity + 0.5 * summary.controlPreservingLeadCoverage;
  const candidateEndgameQuality = clamp(
    0.3 * remainingGroupFit
      + 0.3 * finishWithinOneOrTwoTurnsFit
      + 0.2 * lowSingleRiskFit
      + 0.2 * candidateEndgameLeadCoverage
      - 0.2 * fragmentationPenalty,
    0,
    1,
  );
  const endgameBand = handSize <= 3 ? 1 : handSize >= 10 ? 0 : (10 - handSize) / 7;
  return clamp(10 * endgameBand * candidateEndgameQuality, 0, 10);
}

function opponentPressureScore(input: DynamicPlanEvaluationInput, summary: CandidateSummary): number {
  const responseFit = normalize(input.plan.metrics.responseCoverage, Math.max(1, summary.groupCount));
  const candidatePressureQuality = 0.6 * responseFit + 0.4 * clamp(summary.beatCoverage, 0, 1);
  const opponentCounts = Object.entries(input.handCounts)
    .map(([seat, count]) => [Number(seat), count] as const)
    .filter(([seat, count]) => seat !== input.seat && seat !== input.partnerSeat && !input.finishOrder.includes(seat) && count > 0)
    .map(([, count]) => count);
  if (opponentCounts.length === 0) return 5;
  const minimum = Math.min(...opponentCounts);
  const pressureBand = minimum <= 1 ? 1 : minimum >= 6 ? 0 : (6 - minimum) / 5;
  return 10 * clamp(0.5 + 0.5 * pressureBand * candidatePressureQuality, 0, 1);
}

function partnerScore(input: DynamicPlanEvaluationInput, summary: CandidateSummary): number {
  const candidateTakeoverQuality = 0.5 * summary.beatCoverage + 0.5 * summary.controlPreservingLeadCoverage;
  const candidateYieldQuality = 0.5 * summary.controlPreservingLeadCoverage + 0.5 * Number(summary.passPreservesPlan);
  if (input.lastPlaySeat === input.partnerSeat) return 10 * candidateYieldQuality;
  if (input.partnerPassedCurrentTrick === true && input.lastPlaySeat !== undefined) return 10 * candidateTakeoverQuality;
  return 5 * (candidateYieldQuality + candidateTakeoverQuality);
}

function powerRisk(input: DynamicPlanEvaluationInput): number {
  const protectedCount = input.powerGroupPolicyIndex.protectedGroups.length;
  const loss = input.plan.metrics.protectionLoss;
  if (protectedCount === 0) {
    if (loss !== 0) throw new Error("DYNAMIC_PLAN_INVALID_PROTECTION_LOSS");
    return 0;
  }
  if (!Number.isFinite(loss) || !Number.isInteger(loss) || loss < 0 || loss > protectedCount) throw new Error("DYNAMIC_PLAN_INVALID_PROTECTION_LOSS");
  return 15 * loss / protectedCount;
}

function isControlPreserving(group: CardGroup, protectedGroups: readonly CardGroup[]): boolean {
  const consumesProtection = protectedGroups.some((protectedGroup) => overlaps(group, protectedGroup) && !sameCards(group, protectedGroup));
  return !consumesProtection && (group.purpose !== "risk" || group.strength >= 8);
}

function isLowSingle(group: CardGroup, gameRank: GameRank): boolean {
  const card = group.cards[0];
  return group.type === "single" && card?.kind === "suited" && card.rank !== gameRank && !isHeartRankWild(card, gameRank)
    && ["2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(card.rank);
}

function stableGroupKey(group: CardGroup): string {
  return `${group.type}|${group.cards.map((card) => card.id).sort().join(",")}|${group.strength}`;
}

function overlaps(left: CardGroup, right: CardGroup): boolean {
  return left.cards.some((card) => right.cards.some((other) => other.id === card.id));
}

function sameCards(left: CardGroup, right: CardGroup): boolean {
  return left.cards.length === right.cards.length && left.cards.every((card) => right.cards.some((other) => other.id === card.id));
}

function normalize(value: number, limit: number): number {
  return clamp(value / Math.max(1, limit), 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
