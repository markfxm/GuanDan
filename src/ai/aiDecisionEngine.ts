import { classifyPlay, canBeatPlay } from "../game/playRules";
import { HandAnalysisCache } from "./analysis/handAnalysisCache";
import type { AiDecision, AiDecisionConfig, AiObservation, AiRuntimeState, ActionCandidate, ActionScore } from "./contracts";
import type { PlanSelectionMode } from "./runtimeContracts";
import { createPowerGroupPolicyIndex, evaluatePowerGroupUse, type PowerGroupPolicyIndex } from "./policy/powerGroupPolicy";
import { applyDynamicPlanSelection, ensurePlans, type DynamicPlanManagerInput } from "./planning/planManager";
import { evaluateDynamicPlan } from "./planning/planEvaluator";
import { migrateD1State } from "./planning/planIdentity";
import type { PlanSelectionContext } from "./planning/planSelectionContracts";
import type { PlanValidation, SelectorConstants, SelectorScore } from "./planning/planSelector";
import { evaluateActionCandidate } from "./tactics/actionEvaluator";
import { generateActionCandidates, type ActionGenerationInput } from "./tactics/actionGenerator";
import { evaluateAiRole } from "./tactics/roleEvaluator";
import { DEFAULT_REPRESENTATIVE_ACTION_SHADOW } from "./config";
import { observeRepresentativeActions } from "./tactics/representativeActionShadowObserver";
import { measureGroupDetection, recordD1PlanSelection, recordTiming } from "./diagnostics/aiPlanningDiagnostics";

const analysisCache = new HandAnalysisCache(64);
const D1_DYNAMIC_CONSTANTS: SelectorConstants = Object.freeze({
  k: 5,
  minimumScoreDelta: 6,
  cooldownDecisionIndices: 2,
  recentFamilyWindow: 3,
});

export type AiDecisionInvocationOptions = Readonly<{
  planSelectionMode?: PlanSelectionMode;
  decisionIndex?: number;
}>;

export function decideAiAction(observation: AiObservation, runtime: AiRuntimeState, config: AiDecisionConfig, invocation: AiDecisionInvocationOptions = {}): AiDecision {
  const diagnostics = config.diagnostics;
  const startedAt = performance.now();
  if (diagnostics !== undefined) diagnostics.decisionCount += 1;
  const analysisStartedAt = diagnostics === undefined ? 0 : performance.now();
  const cachedAnalysis = measureGroupDetection(diagnostics, "hand-analysis-root", () => diagnostics === undefined
    ? { analysis: analysisCache.getOrCreate(observation.hand, observation.gameRank), created: false }
    : analysisCache.getOrCreateWithStatus(observation.hand, observation.gameRank));
  const analysis = cachedAnalysis.analysis;
  if (diagnostics !== undefined && cachedAnalysis.created) diagnostics.handAnalysisBuildCount += 1;
  recordTiming(diagnostics, "handAnalysis", analysisStartedAt);
  const updatedRuntime = ensurePlans(runtime, observation.hand, observation.gameRank, config.turn, config.planning, config.version, diagnostics);
  const policyIndex = createPowerGroupPolicyIndex(analysis.groups, observation.gameRank);
  const selectedRuntime = (invocation.planSelectionMode ?? "keep-current") === "dynamic-topk-v1"
    ? applyDynamicSelection(updatedRuntime, observation, config, analysis, policyIndex, invocation, diagnostics)
    : updatedRuntime;
  const selectedPlan = selectedRuntime.candidatePlans.find((plan) => plan.id === selectedRuntime.activePlanId) ?? selectedRuntime.candidatePlans[0];
  const generationInput: ActionGenerationInput = {
    hand: observation.hand,
    gameRank: observation.gameRank,
    seat: observation.seat,
    partnerSeat: observation.partnerSeat,
    lastPlay: observation.lastPlay,
    lastPlaySeat: observation.lastPlaySeat,
    plan: selectedPlan,
    analysis,
    policyIndex,
    diagnostics,
  };
  const roleStartedAt = diagnostics === undefined ? 0 : performance.now();
  const role = evaluateAiRole({ hand: observation.hand, gameRank: observation.gameRank, analysis });
  recordTiming(diagnostics, "roleEvaluation", roleStartedAt);
  const generationStartedAt = diagnostics === undefined ? 0 : performance.now();
  const candidates = generateActionCandidates(generationInput);
  if (diagnostics !== undefined) diagnostics.candidateCountSamples.push(candidates.length);
  recordTiming(diagnostics, "actionGeneration", generationStartedAt);
  const shadowConfig = config.representativeActionShadow ?? DEFAULT_REPRESENTATIVE_ACTION_SHADOW;
  observeRepresentativeActions({
    mode: shadowConfig.mode,
    candidates,
    ownHand: observation.hand,
    gameRank: observation.gameRank,
    lastPlay: observation.lastPlay,
    hardCap: shadowConfig.hardCap,
    diagnostics,
  });
  const evaluationStartedAt = diagnostics === undefined ? 0 : performance.now();
  const scored = candidates.map((candidate) => ({ candidate, score: evaluateActionCandidate(candidate, generationInput) }));
  recordTiming(diagnostics, "actionEvaluation", evaluationStartedAt);
  const sortingStartedAt = diagnostics === undefined ? 0 : performance.now();
  const selected = scored.sort(compareScoredCandidates)[0];
  recordTiming(diagnostics, "candidateSorting", sortingStartedAt);
  if (selected === undefined) {
    throw new Error(observation.lastPlay === undefined ? "AI_ENGINE_NO_LEGAL_LEAD" : "AI_ENGINE_NO_CANDIDATES");
  }
  const validationStartedAt = diagnostics === undefined ? 0 : performance.now();
  measureGroupDetection(diagnostics, "final-validation", () => assertFinalAction(selected.candidate, observation, analysis.groups, policyIndex));
  recordTiming(diagnostics, "finalValidation", validationStartedAt);
  const reasonCodes = [...new Set([...role.reasonCodes, ...(selected.score.reasonCodes ?? []), ...selected.candidate.reasonCodes])];
  const elapsedMs = performance.now() - startedAt;
  recordTiming(diagnostics, "totalDecision", startedAt);
  return {
    action: selected.candidate.action,
    runtime: selectedRuntime,
    selectedPlan,
    selectedPlanId: selectedPlan?.id,
    score: selected.score,
    scoreBreakdown: selected.score,
    candidateCount: candidates.length,
    consideredActions: candidates.length,
    elapsedMs,
    reasonCodes: reasonCodes.filter((code): code is AiDecision["reasonCodes"][number] => isBreakReason(code)),
  };
}

function applyDynamicSelection(
  runtime: AiRuntimeState,
  observation: AiObservation,
  config: AiDecisionConfig,
  analysis: ReturnType<HandAnalysisCache["getOrCreate"]>,
  policyIndex: PowerGroupPolicyIndex,
  invocation: AiDecisionInvocationOptions,
  diagnostics: AiDecisionConfig["diagnostics"],
): AiRuntimeState {
  const migrationContext = {
    schemaVersion: "d1-topk-runtime-v1",
    roomRulesVersion: "d0-room-rules-v1",
    strategyId: "unified",
    strategyVersion: config.version,
    configHash: config.version,
    seat: observation.seat,
    configVersion: config.version,
    hand: observation.hand,
    gameRank: observation.gameRank,
  } as const;
  let dynamicRuntime = runtime;
  if (dynamicRuntime.planSelectionState === undefined) {
    const migration = migrateD1State(dynamicRuntime, migrationContext);
    if (migration.kind === "migrated") {
      dynamicRuntime = { ...dynamicRuntime, planSelectionState: migration.state };
    } else {
      const replanned = ensurePlans({ ...dynamicRuntime, needsReplan: true }, observation.hand, observation.gameRank, config.turn, config.planning, config.version, diagnostics);
      const retryMigration = migrateD1State(replanned, migrationContext);
      if (retryMigration.kind !== "migrated") throw new Error("AI_ENGINE_D1_MIGRATION_REQUIRED");
      dynamicRuntime = { ...replanned, planSelectionState: retryMigration.state };
    }
  }
  const context = buildDynamicContext(dynamicRuntime, observation);
  const input = dynamicManagerInput(dynamicRuntime, context, observation, analysis, policyIndex, config, invocation);
  const first = applyDynamicPlanSelection(input);
  if (first.result.reason !== "replan-required" && first.result.reason !== "no-valid-plan") {
    recordDynamicDiagnostics(diagnostics, dynamicRuntime, first.result, observation.seat, invocation.decisionIndex ?? config.turn);
    return first.runtime;
  }
  const replanned = ensurePlans({ ...dynamicRuntime, needsReplan: true }, observation.hand, observation.gameRank, config.turn, config.planning, config.version, diagnostics);
  const retryMigration = migrateD1State(replanned, migrationContext);
  if (retryMigration.kind !== "migrated") throw new Error("AI_ENGINE_D1_REPLAN_FAILED");
  const retryRuntime = { ...replanned, planSelectionState: retryMigration.state };
  const retry = applyDynamicPlanSelection(dynamicManagerInput(retryRuntime, buildDynamicContext(retryRuntime, observation), observation, analysis, policyIndex, config, invocation));
  if (retry.result.reason === "replan-required" || retry.result.reason === "no-valid-plan") throw new Error("AI_ENGINE_D1_REPLAN_FAILED");
  recordDynamicDiagnostics(diagnostics, retryRuntime, retry.result, observation.seat, invocation.decisionIndex ?? config.turn);
  return retry.runtime;
}

function recordDynamicDiagnostics(
  diagnostics: AiDecisionConfig["diagnostics"],
  runtime: AiRuntimeState,
  result: import("./planning/planSelectionContracts").PlanSelectionResult,
  seat: number,
  decisionIndex: number,
): void {
  const reason = result.reason;
  const selectedFamily = result.state?.activePlanFamilyId;
  const recentFamilies = runtime.planSelectionState?.recentStrategicPlanFamilyIds ?? [];
  recordD1PlanSelection(diagnostics, {
    decisionIndex,
    seat,
    candidateCount: runtime.candidatePlans.length,
    activeValid: !reason.startsWith("forced-") && reason !== "forced-missing",
    challengerCount: Math.max(0, runtime.candidatePlans.length - 1),
    reason,
    recentStrategicReturnSwitch: reason === "strategic-switch" && selectedFamily !== undefined && recentFamilies.includes(selectedFamily),
    decisionIndicesSinceLastSwitch: runtime.planSelectionState?.lastAnyPlanSwitchDecisionIndex === undefined
      ? undefined
      : Math.max(0, decisionIndex - runtime.planSelectionState.lastAnyPlanSwitchDecisionIndex),
  });
}

function dynamicManagerInput(
  runtime: AiRuntimeState,
  context: PlanSelectionContext,
  observation: AiObservation,
  analysis: ReturnType<HandAnalysisCache["getOrCreate"]>,
  policyIndex: PowerGroupPolicyIndex,
  config: AiDecisionConfig,
  invocation: AiDecisionInvocationOptions,
): DynamicPlanManagerInput {
  return {
    runtime,
    context,
    candidates: runtime.candidatePlans,
    activePlanId: runtime.activePlanId,
    decisionIndex: invocation.decisionIndex ?? config.turn,
    constants: D1_DYNAMIC_CONSTANTS,
    validatePlan: (plan, value) => validateDynamicPlan(plan, value, analysis.groups, policyIndex),
    evaluatePlan: (plan) => {
      const evaluated = evaluateDynamicPlan({
        plan,
        hand: observation.hand,
        gameRank: observation.gameRank,
        seat: observation.seat,
        partnerSeat: observation.partnerSeat,
        handCounts: observation.handCounts,
        finishOrder: observation.finishOrder,
        lastPlay: observation.lastPlay,
        lastPlaySeat: observation.lastPlaySeat,
        partnerPassedCurrentTrick: observation.partnerPassedCurrentTrick,
        powerGroupPolicyIndex: policyIndex,
        analysis,
      });
      return {
        planId: evaluated.planId,
        total: evaluated.total,
        staticPlanQuality: evaluated.staticPlanQuality,
        remainingGroupCount: plan.groups.length,
        powerGroupRisk: evaluated.components.powerGroupRisk,
      } satisfies SelectorScore;
    },
  };
}

function buildDynamicContext(runtime: AiRuntimeState, observation: AiObservation): PlanSelectionContext {
  return {
    seat: observation.seat,
    partnerSeat: observation.partnerSeat,
    gameRank: observation.gameRank,
    hand: observation.hand,
    handCount: observation.hand.length,
    playedCards: observation.playedCards,
    handCounts: observation.handCounts,
    lastPlay: observation.lastPlay,
    lastPlaySeat: observation.lastPlaySeat,
    finishOrder: observation.finishOrder,
    partnerPassedCurrentTrick: observation.partnerPassedCurrentTrick,
    candidatePlans: runtime.candidatePlans,
    runtime,
  };
}

function validateDynamicPlan(plan: import("./contracts").HandPlan, context: PlanSelectionContext, allGroups: ReturnType<HandAnalysisCache["getOrCreate"]>["groups"], policyIndex: PowerGroupPolicyIndex): PlanValidation {
  const handIds = context.hand.map((card) => card.id);
  const groupIds = plan.groups.flatMap((group) => group.cards.map((card) => card.id));
  if (new Set(groupIds).size !== groupIds.length || new Set(handIds).size !== handIds.length) return { valid: false, reason: "forced-structural-invalid" };
  if (groupIds.length !== handIds.length || groupIds.some((id) => !handIds.includes(id))) return { valid: false, reason: "forced-incomplete" };
  for (const group of plan.groups) {
    if (classifyPlay(group.cards, context.gameRank)?.id !== group.id) return { valid: false, reason: "forced-illegal-group" };
    const verdict = evaluatePowerGroupUse(group, [...context.hand], allGroups, context.gameRank, {}, policyIndex);
    if (!verdict.allowed && verdict.hardViolation) return { valid: false, reason: "forced-policy" };
  }
  return { valid: plan.metrics.hardViolations === 0 };
}

function compareScoredCandidates(left: { candidate: ActionCandidate; score: ActionScore }, right: { candidate: ActionCandidate; score: ActionScore }): number {
  return right.score.total - left.score.total || left.candidate.stableKey.localeCompare(right.candidate.stableKey);
}

function assertFinalAction(candidate: ActionCandidate, observation: AiObservation, groups: ReturnType<HandAnalysisCache["getOrCreate"]>["groups"], policyIndex: PowerGroupPolicyIndex): void {
  if (candidate.action.type === "pass") {
    if (observation.lastPlay === undefined) throw new Error("AI_ENGINE_ILLEGAL_LEAD_PASS");
    return;
  }
  const group = candidate.action.group;
  if (!group.cards.every((card) => observation.hand.some((owned) => owned.id === card.id))) throw new Error("AI_ENGINE_CARD_NOT_IN_HAND");
  if (classifyPlay(group.cards, observation.gameRank)?.id !== group.id) throw new Error("AI_ENGINE_INVALID_PLAY");
  if (observation.lastPlay !== undefined && !canBeatPlay(group, observation.lastPlay, observation.gameRank)) throw new Error("AI_ENGINE_NON_BEATING_FOLLOW");
  const verdict = evaluatePowerGroupUse(group, observation.hand, groups, observation.gameRank, group.cards.length === observation.hand.length ? { reason: "IMMEDIATE_FINISH" } : {}, policyIndex);
  if (!verdict.allowed) throw new Error("AI_ENGINE_POLICY_REJECTED_ACTION");
}

function isBreakReason(code: string): code is AiDecision["reasonCodes"][number] {
  return ["IMMEDIATE_FINISH", "DANGEROUS_OPPONENT_BLOCK", "ENDGAME_APPROVED", "LEGAL_BOMB_REDUCTION", "JOKER_BOMB_EXCEPTION"].includes(code);
}
