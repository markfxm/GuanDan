import type { HandPlan } from "../contracts";
import type { D1PlanSelectionState } from "../runtimeContracts";
import type { PlanSelectionContext, PlanSelectionResult } from "./planSelectionContracts";
import { cleanupPlanIdentityMap, updatePlanSwitchHistory } from "./planIdentity";

export type SelectorConstants = Readonly<{
  k: number;
  minimumScoreDelta: number;
  cooldownDecisionIndices: number;
  recentFamilyWindow: number;
}>;

export type SelectorScore = Readonly<{
  planId: string;
  total: number;
  staticPlanQuality: number;
  remainingGroupCount: number;
  powerGroupRisk: number;
}>;

export type PlanValidation = Readonly<{
  valid: boolean;
  reason?: "forced-missing" | "forced-incomplete" | "forced-policy" | "forced-illegal-group" | "forced-structural-invalid";
}>;

export type SelectActivePlanInput = Readonly<{
  context: PlanSelectionContext;
  candidates: readonly HandPlan[];
  activePlanId?: string;
  state: D1PlanSelectionState;
  decisionIndex: number;
  constants: SelectorConstants;
  staticPlanQualityById?: Readonly<Record<string, number>>;
  validatePlan: (plan: HandPlan, context: PlanSelectionContext) => PlanValidation;
  evaluatePlan: (plan: HandPlan, context: PlanSelectionContext) => SelectorScore;
}>;

export function selectActivePlan(input: SelectActivePlanInput): PlanSelectionResult {
  validateSelectorInput(input);
  const uniqueCandidates = uniqueById(input.candidates);
  const validationById = new Map(uniqueCandidates.map((plan) => [plan.id, input.validatePlan(plan, input.context)]));
  const validCandidates = uniqueCandidates.filter((plan) => validationById.get(plan.id)?.valid === true);
  const active = input.activePlanId === undefined ? undefined : uniqueCandidates.find((plan) => plan.id === input.activePlanId);
  const activeValidation = active === undefined ? undefined : validationById.get(active.id);
  const forcedReason = active === undefined
    ? "forced-missing"
    : activeValidation?.valid === false
      ? activeValidation.reason ?? "forced-structural-invalid"
      : undefined;

  if (validCandidates.length === 0) return { reason: "replan-required" };
  if (forcedReason !== undefined) return forcedSelection(input, validCandidates, forcedReason);
  if (active === undefined || activeValidation?.valid !== true) return { reason: "replan-required" };

  const challengers = sortByStaticQuality(validCandidates.filter((plan) => plan.id !== active.id), input).slice(0, Math.max(0, input.constants.k - 1));
  if (challengers.length === 0) return { reason: "keep-current", selectedPlanId: active.id, state: input.state };

  const evaluated = [active, ...challengers].map((plan) => input.evaluatePlan(plan, input.context));
  const activeScore = evaluated[0]!;
  const bestChallenger = evaluated.slice(1).reduce((best, candidate) => chooseHigherScore(best, candidate, input), undefined as SelectorScore | undefined);
  if (bestChallenger === undefined) return { reason: "keep-current", selectedPlanId: active.id, state: input.state };

  const scoreDeltaMicros = toMicros(bestChallenger.total) - toMicros(activeScore.total);
  if (scoreDeltaMicros === 0) return { reason: "tie-kept-active", selectedPlanId: active.id, state: input.state };
  if (scoreDeltaMicros < 0) return { reason: "keep-current", selectedPlanId: active.id, state: input.state };

  const lastSwitch = input.state.lastAnyPlanSwitchDecisionIndex;
  if (lastSwitch !== undefined && input.decisionIndex - lastSwitch < input.constants.cooldownDecisionIndices) {
    return { reason: "cooldown-suppressed", selectedPlanId: active.id, state: input.state };
  }
  const challengerFamily = familyId(input.state, bestChallenger.planId);
  const requiredDeltaMicros = input.state.recentStrategicPlanFamilyIds.includes(challengerFamily)
    ? toMicros(2 * input.constants.minimumScoreDelta)
    : toMicros(input.constants.minimumScoreDelta);
  if (scoreDeltaMicros < requiredDeltaMicros) return { reason: "hysteresis-suppressed", selectedPlanId: active.id, state: input.state };
  return commitSwitch(input, active, bestChallenger, "strategic", [active.id, ...challengers.map((plan) => plan.id)]);
}

function forcedSelection(input: SelectActivePlanInput, validCandidates: readonly HandPlan[], reason: NonNullable<PlanValidation["reason"]> | "forced-missing"): PlanSelectionResult {
  const topCandidates = sortByStaticQuality(validCandidates, input).slice(0, Math.max(1, input.constants.k));
  const scores = topCandidates.map((plan) => input.evaluatePlan(plan, input.context));
  const selected = scores.reduce((best, candidate) => chooseHigherScore(best, candidate, input), undefined as SelectorScore | undefined);
  if (selected === undefined) return { reason: "replan-required" };
  const previous = input.activePlanId === undefined ? undefined : input.candidates.find((plan) => plan.id === input.activePlanId);
  return { ...commitSwitch(input, previous, selected, "forced", topCandidates.map((plan) => plan.id)), reason };
}

function commitSwitch(input: SelectActivePlanInput, previous: HandPlan | undefined, selected: SelectorScore, kind: "forced" | "strategic", evaluatedPlanIds: readonly string[]): PlanSelectionResult {
  const fromFamilyId = previous === undefined ? undefined : familyId(input.state, previous.id);
  const toFamilyId = familyId(input.state, selected.planId);
  const updated = updatePlanSwitchHistory(input.state, { kind, decisionIndex: input.decisionIndex, fromFamilyId, toFamilyId });
  const recentStrategicPlanFamilyIds = updated.recentStrategicPlanFamilyIds.slice(-Math.max(0, input.constants.recentFamilyWindow));
  const currentIds = [...evaluatedPlanIds];
  const staticPlanQualityById = Object.fromEntries(input.candidates.map((plan) => [plan.id, input.staticPlanQualityById?.[plan.id] ?? plan.metrics.fallbackScore]));
  const planIdentityById = cleanupPlanIdentityMap(input.state.planIdentityById, {
    activePlanId: selected.planId,
    currentCandidatePlanIds: currentIds,
    necessaryPreviousPlanIds: previous === undefined ? [] : [previous.id],
    staticPlanQualityById,
    maxEntries: input.constants.k + 2,
  });
  const state: D1PlanSelectionState = {
    ...updated,
    activePlanId: selected.planId,
    previousPlanId: previous?.id,
    activePlanFamilyId: toFamilyId,
    previousPlanFamilyId: fromFamilyId,
    recentStrategicPlanFamilyIds,
    planIdentityById,
  };
  return { reason: kind === "forced" ? "forced-switch" : "strategic-switch", selectedPlanId: selected.planId, state };
}

function chooseHigherScore(left: SelectorScore | undefined, right: SelectorScore, input: SelectActivePlanInput): SelectorScore {
  if (left === undefined) return right;
  const scoreDelta = toMicros(right.total) - toMicros(left.total);
  if (scoreDelta !== 0) return scoreDelta > 0 ? right : left;
  const staticDelta = right.staticPlanQuality - left.staticPlanQuality;
  if (staticDelta !== 0) return staticDelta > 0 ? right : left;
  const remainingDelta = right.remainingGroupCount - left.remainingGroupCount;
  if (remainingDelta !== 0) return remainingDelta < 0 ? right : left;
  const riskDelta = right.powerGroupRisk - left.powerGroupRisk;
  if (riskDelta !== 0) return riskDelta < 0 ? right : left;
  return right.planId.localeCompare(left.planId) < 0 ? right : left;
}

function sortByStaticQuality(candidates: readonly HandPlan[], input: SelectActivePlanInput): HandPlan[] {
  return [...candidates].sort((left, right) => {
    const qualityDelta = (input.staticPlanQualityById?.[right.id] ?? right.metrics.fallbackScore) - (input.staticPlanQualityById?.[left.id] ?? left.metrics.fallbackScore);
    return qualityDelta || left.id.localeCompare(right.id);
  });
}

function familyId(state: D1PlanSelectionState, planId: string): string {
  return state.planIdentityById[planId]?.planFamilyId ?? planId;
}

function uniqueById(candidates: readonly HandPlan[]): HandPlan[] {
  const byId = new Map<string, HandPlan>();
  for (const candidate of candidates) if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function toMicros(value: number): number {
  return Math.round(value * 1_000_000);
}

function validateSelectorInput(input: SelectActivePlanInput): void {
  if (!Number.isInteger(input.constants.k) || input.constants.k < 1) throw new Error("D1_SELECTOR_INVALID_K");
  if (!Number.isFinite(input.constants.minimumScoreDelta) || input.constants.minimumScoreDelta < 0) throw new Error("D1_SELECTOR_INVALID_DELTA");
  if (!Number.isInteger(input.constants.cooldownDecisionIndices) || input.constants.cooldownDecisionIndices < 0) throw new Error("D1_SELECTOR_INVALID_COOLDOWN");
  if (!Number.isInteger(input.constants.recentFamilyWindow) || input.constants.recentFamilyWindow < 0) throw new Error("D1_SELECTOR_INVALID_HISTORY_WINDOW");
  if (!Number.isInteger(input.decisionIndex)) throw new Error("D1_SELECTOR_INVALID_DECISION_INDEX");
}
