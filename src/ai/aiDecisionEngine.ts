import { classifyPlay, canBeatPlay } from "../game/playRules";
import { HandAnalysisCache } from "./analysis/handAnalysisCache";
import type { AiDecision, AiDecisionConfig, AiObservation, AiRuntimeState, ActionCandidate, ActionScore } from "./contracts";
import { createPowerGroupPolicyIndex, evaluatePowerGroupUse, type PowerGroupPolicyIndex } from "./policy/powerGroupPolicy";
import { ensurePlans } from "./planning/planManager";
import { evaluateActionCandidate } from "./tactics/actionEvaluator";
import { generateActionCandidates, type ActionGenerationInput } from "./tactics/actionGenerator";
import { evaluateAiRole } from "./tactics/roleEvaluator";
import { measureGroupDetection, recordTiming } from "./diagnostics/aiPlanningDiagnostics";

const analysisCache = new HandAnalysisCache(64);

export function decideAiAction(observation: AiObservation, runtime: AiRuntimeState, config: AiDecisionConfig): AiDecision {
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
  const selectedPlan = updatedRuntime.candidatePlans.find((plan) => plan.id === updatedRuntime.activePlanId) ?? updatedRuntime.candidatePlans[0];
  const policyIndex = createPowerGroupPolicyIndex(analysis.groups, observation.gameRank);
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
    runtime: updatedRuntime,
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
