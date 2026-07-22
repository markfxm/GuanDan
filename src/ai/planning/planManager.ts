import type { Card, GameRank } from "../../engine/cards";
import { classifyPlay } from "../../game/playRules";
import type { AiRuntimeState, PlanningBudget } from "../contracts";
import { analyzeHand, stableHandKey } from "../analysis/handAnalyzer";
import { generateFastHandPlans } from "./handPlanner";
import { evaluatePlan, comparePlans } from "./planEvaluator";
import { selectActivePlan, type PlanValidation, type SelectorConstants, type SelectorScore } from "./planSelector";
import type { PlanSelectionContext, PlanSelectionResult } from "./planSelectionContracts";
import type { CardGroup } from "../../engine/groups";
import { getDetectGroupsCallCount } from "../../engine/groups";
import type { AiPlanningDiagnostics } from "../diagnostics/aiPlanningDiagnostics";
import { recordDetectGroupsSource, recordPath, recordPlanCandidateValidation, recordTiming } from "../diagnostics/aiPlanningDiagnostics";

export function ensurePlans(runtime: AiRuntimeState, hand: Card[], gameRank: GameRank, turn: number, budget: PlanningBudget, configVersion: string, diagnostics?: AiPlanningDiagnostics): AiRuntimeState {
  const startedAt = diagnostics === undefined ? 0 : performance.now();
  if (diagnostics !== undefined) diagnostics.ensurePlansCallCount += 1;
  const handKey = stableHandKey(hand);
  const canValidateActivePlan = !runtime.needsReplan && runtime.handKey === handKey && runtime.configVersion === configVersion;
  const validationStartedAt = diagnostics === undefined ? 0 : performance.now();
  const validationDetectGroupsBefore = diagnostics === undefined ? 0 : getDetectGroupsCallCount();
  const activePlanValid = canValidateActivePlan && hasValidActivePlan(runtime, hand, gameRank, diagnostics);
  recordDetectGroupsSource(diagnostics, "plan-candidate-validation", validationDetectGroupsBefore, validationStartedAt);
  if (activePlanValid) {
    recordPath(diagnostics, "reuse-valid-runtime");
    recordTiming(diagnostics, "ensurePlans", startedAt);
    return runtime;
  }
  recordPath(diagnostics, replanReason(runtime, handKey, hand, gameRank, configVersion));
  if (diagnostics !== undefined) {
    diagnostics.fullPlanningRunCount += 1;
    diagnostics.fullReplanCount += 1;
  }
  const fullReplanStartedAt = diagnostics === undefined ? 0 : performance.now();
  const plannerDetectGroupsBefore = diagnostics === undefined ? 0 : getDetectGroupsCallCount();
  const candidatePlans = generateFastHandPlans(hand, gameRank, budget);
  recordDetectGroupsSource(diagnostics, "planner", plannerDetectGroupsBefore, fullReplanStartedAt);
  recordTiming(diagnostics, "fullReplan", fullReplanStartedAt);
  recordTiming(diagnostics, "ensurePlans", startedAt);
  return { handKey, candidatePlans, activePlanId: candidatePlans[0]?.id, generatedTurn: turn, configVersion, needsReplan: false };
}

export function applyExecutedAction(runtime: AiRuntimeState, handBefore: Card[], action: CardGroup | undefined, handAfter: Card[], gameRank: GameRank, turn: number, budget: PlanningBudget, configVersion: string, diagnostics?: AiPlanningDiagnostics): AiRuntimeState {
  if (diagnostics !== undefined) {
    diagnostics.handSizeBeforeSamples.push(handBefore.length);
    diagnostics.handSizeAfterSamples.push(handAfter.length);
  }
  if (action === undefined) {
    if (diagnostics !== undefined) {
      diagnostics.passCount += 1;
      diagnostics.passReuseCount += 1;
    }
    recordPath(diagnostics, "pass-reuse");
    return runtime;
  }
  if (diagnostics !== undefined) diagnostics.playCount += 1;
  const activePlan = runtime.candidatePlans.find((plan) => plan.id === runtime.activePlanId);
  const exactActive = activePlan?.groups.some((group) => sameCards(group, action)) ?? false;
  const exactAny = runtime.candidatePlans.some((plan) => plan.groups.some((group) => sameCards(group, action)));
  const partial = !exactAny && runtime.candidatePlans.some((plan) => plan.groups.some((group) => overlaps(group, action)));
  if (diagnostics !== undefined) {
    if (exactActive) diagnostics.exactActivePlanMatchCount += 1;
    if (exactAny) diagnostics.exactAnyPlanMatchCount += 1;
    else if (partial) diagnostics.partialOverlapCount += 1;
    else diagnostics.noPlanOverlapCount += 1;
  }
  const analysisStartedAt = diagnostics === undefined ? 0 : performance.now();
  const remainingDetectGroupsBefore = diagnostics === undefined ? 0 : getDetectGroupsCallCount();
  const analysis = analyzeHand(handAfter, gameRank);
  recordDetectGroupsSource(diagnostics, "remaining-hand-analysis", remainingDetectGroupsBefore, analysisStartedAt);
  if (diagnostics !== undefined) diagnostics.handAnalysisBuildCount += 1;
  const exactStartedAt = diagnostics === undefined ? 0 : performance.now();
  const derived = runtime.candidatePlans.flatMap((plan) => {
    const consumed = plan.groups.find((group) => sameCards(group, action));
    if (consumed === undefined) return [];
    const groups = plan.groups.filter((group) => group !== consumed);
    if (diagnostics !== undefined) diagnostics.planEvaluationCount += 1;
    const metrics = evaluatePlan(handAfter, analysis.groups, groups, gameRank);
    return metrics.hardViolations === 0 && covers(handAfter, groups) ? [{ id: `derived:${plan.id}:${stableHandKey(handAfter)}:${action.id}`, groups, metrics }] : [];
  });
  recordTiming(diagnostics, "exactReuse", exactStartedAt);
  if (derived.length > 0 && diagnostics !== undefined) diagnostics.incrementalExactReuseCount += 1;
  if (derived.length > 0) recordPath(diagnostics, "incremental-exact-reuse");
  const partialStartedAt = diagnostics === undefined ? 0 : performance.now();
  const repaired = derived.length > 0 ? [] : runtime.candidatePlans.flatMap((plan) => {
    const affected = plan.groups.filter((group) => overlaps(group, action));
    const unaffected = plan.groups.filter((group) => !overlaps(group, action));
    const preservedIds = new Set(unaffected.flatMap((group) => group.cards.map((card) => card.id)));
    const cardsToRepair = handAfter.filter((card) => !preservedIds.has(card.id));
    if (diagnostics !== undefined && affected.length > 0) {
      diagnostics.repairCardCountSamples.push(cardsToRepair.length);
      diagnostics.repairRatioSamples.push(handAfter.length === 0 ? 0 : cardsToRepair.length / handAfter.length);
      diagnostics.preservedCardCountSamples.push(preservedIds.size);
      diagnostics.affectedGroupCountSamples.push(affected.length);
    }
    if (cardsToRepair.length === 0 || cardsToRepair.length === handAfter.length) return [];
    return generateFastHandPlans(cardsToRepair, gameRank, { ...budget, maxPlans: 1 }).flatMap((repair) => {
      const groups = [...unaffected, ...repair.groups];
      if (diagnostics !== undefined) diagnostics.planEvaluationCount += 1;
      const metrics = evaluatePlan(handAfter, analysis.groups, groups, gameRank);
      return metrics.hardViolations === 0 && covers(handAfter, groups) ? [{ id: `repair:${plan.id}:${stableHandKey(handAfter)}:${action.id}`, groups, metrics }] : [];
    });
  });
  recordTiming(diagnostics, "partialRepair", partialStartedAt);
  if (repaired.length > 0 && diagnostics !== undefined) diagnostics.incrementalPartialRepairCount += 1;
  if (repaired.length > 0) recordPath(diagnostics, "incremental-partial-repair");
  const candidates = [...derived, ...repaired].sort(comparePlans);
  if (candidates.length === 0) return { ...runtime, needsReplan: true };
  const plans = candidates.filter((plan, index, all) => all.findIndex((candidate) => candidate.id === plan.id) === index);
  return { handKey: stableHandKey(handAfter), candidatePlans: plans, activePlanId: plans[0]?.id, generatedTurn: turn, configVersion, needsReplan: false };
}

function replanReason(runtime: AiRuntimeState, handKey: string, hand: Card[], gameRank: GameRank, configVersion: string): string {
  if (runtime.needsReplan) return "replan-needs-replan";
  if (runtime.handKey !== handKey) return "replan-hand-key";
  if (runtime.configVersion !== configVersion) return "replan-config-version";
  if (runtime.activePlanId === undefined || !runtime.candidatePlans.some((plan) => plan.id === runtime.activePlanId)) return "replan-missing-plan";
  return hasValidActivePlan(runtime, hand, gameRank) ? "replan-needs-replan" : "replan-invalid-plan";
}

function hasValidActivePlan(runtime: AiRuntimeState, hand: Card[], gameRank: GameRank, diagnostics?: AiPlanningDiagnostics): boolean {
  const totalStartedAt = diagnostics === undefined ? 0 : performance.now();
  if (diagnostics !== undefined) diagnostics.planCandidateValidationCount += 1;
  const plan = runtime.candidatePlans.find((candidate) => candidate.id === runtime.activePlanId);
  const policyStartedAt = diagnostics === undefined ? 0 : performance.now();
  const policyValid = plan !== undefined && plan.metrics.hardViolations === 0;
  recordPlanCandidateValidation(diagnostics, "policyCheck", policyStartedAt);
  if (!policyValid) {
    recordPlanCandidateValidation(diagnostics, "total", totalStartedAt);
    return false;
  }
  const coverageStartedAt = diagnostics === undefined ? 0 : performance.now();
  const handIds = hand.map((card) => card.id).sort();
  const plannedIds = plan.groups.flatMap((group) => group.cards.map((card) => card.id)).sort();
  const coverageValid = handIds.length === plannedIds.length && !handIds.some((id, index) => id !== plannedIds[index]);
  recordPlanCandidateValidation(diagnostics, "completeCoverage", coverageStartedAt);
  recordPlanCandidateValidation(diagnostics, "duplicateOrMissing", coverageStartedAt);
  if (!coverageValid) {
    recordPlanCandidateValidation(diagnostics, "total", totalStartedAt);
    return false;
  }
  const groupLegalityStartedAt = diagnostics === undefined ? 0 : performance.now();
  const groupsLegal = plan.groups.every((group) => classifyPlay(group.cards, gameRank)?.id === group.id);
  recordPlanCandidateValidation(diagnostics, "groupLegality", groupLegalityStartedAt);
  recordPlanCandidateValidation(diagnostics, "total", totalStartedAt);
  return groupsLegal;
}

function sameCards(left: CardGroup, right: CardGroup): boolean { return left.cards.length === right.cards.length && left.cards.every((card) => right.cards.some((other) => other.id === card.id)); }
function overlaps(left: CardGroup, right: CardGroup): boolean { return left.cards.some((card) => right.cards.some((other) => other.id === card.id)); }
function covers(hand: Card[], groups: CardGroup[]): boolean { const ids = groups.flatMap((group) => group.cards.map((card) => card.id)).sort(); const handIds = hand.map((card) => card.id).sort(); return ids.length === handIds.length && ids.every((id, index) => id === handIds[index]); }

export type DynamicPlanManagerInput = Readonly<{
  runtime: AiRuntimeState;
  context: PlanSelectionContext;
  candidates: readonly import("../contracts").HandPlan[];
  activePlanId?: string;
  decisionIndex: number;
  constants: SelectorConstants;
  staticPlanQualityById?: Readonly<Record<string, number>>;
  validatePlan: (plan: import("../contracts").HandPlan, context: PlanSelectionContext) => PlanValidation;
  evaluatePlan: (plan: import("../contracts").HandPlan, context: PlanSelectionContext) => SelectorScore;
}>;

export function applyDynamicPlanSelection(input: DynamicPlanManagerInput): { runtime: AiRuntimeState; result: PlanSelectionResult } {
  const result = selectActivePlan({
    context: input.context,
    candidates: input.candidates,
    activePlanId: input.activePlanId,
    state: input.runtime.planSelectionState ?? {
      version: "d1-topk-runtime-v1",
      planSwitchCount: 0,
      fullReplanCount: 0,
      recentStrategicPlanFamilyIds: [],
      planIdentityById: {},
    },
    decisionIndex: input.decisionIndex,
    constants: input.constants,
    staticPlanQualityById: input.staticPlanQualityById,
    validatePlan: input.validatePlan,
    evaluatePlan: input.evaluatePlan,
  });
  if (result.state === undefined || result.selectedPlanId === undefined) return { runtime: input.runtime, result };
  return { runtime: { ...input.runtime, activePlanId: result.selectedPlanId, planSelectionState: result.state }, result };
}
