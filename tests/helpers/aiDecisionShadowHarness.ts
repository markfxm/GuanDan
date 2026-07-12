import { analyzeHand } from "../../src/ai/analysis/handAnalyzer";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import type { AiAction, AiDecision, PolicyVerdict } from "../../src/ai/contracts";
import { evaluatePowerGroupUse } from "../../src/ai/policy/powerGroupPolicy";
import { chooseAiAction } from "../../src/game/ai";
import { canBeatPlay, classifyPlay } from "../../src/game/playRules";
import type { AiDecisionScenario } from "../fixtures/aiDecisionScenarios";

export type DecisionDifferenceClassification = "SAME_ACTION" | "LEGAL_SOFT_DIFFERENCE" | "LEGACY_ILLEGAL" | "UNIFIED_ILLEGAL" | "POLICY_MISMATCH" | "PLAN_MISMATCH" | "NON_DETERMINISTIC" | "ENGINE_ERROR";
export type DecisionComparison = { scenarioId: string; legacyAction: AiAction; unifiedDecision: AiDecision; classification: DecisionDifferenceClassification; legacyLegal: boolean; unifiedLegal: boolean; legacyPolicyVerdict: PolicyVerdict; unifiedPolicyVerdict: PolicyVerdict; sameAction: boolean; runtimeMutated: boolean; elapsedLegacyMs: number; elapsedUnifiedMs: number; details: string[] };

export function compareLegacyAndUnifiedDecision(scenario: AiDecisionScenario): DecisionComparison {
  const observation = structuredClone(scenario.observation);
  const legacyInput = { hand: structuredClone(observation.hand), gameRank: observation.gameRank, seat: observation.seat, partnerSeat: observation.partnerSeat, lastPlay: structuredClone(observation.lastPlay), lastPlaySeat: observation.lastPlaySeat, context: { ownHandCount: observation.hand.length, partnerHandCount: observation.handCounts[observation.partnerSeat] ?? 0, opponentHandCounts: Object.entries(observation.handCounts).filter(([seat]) => Number(seat) !== observation.seat && Number(seat) !== observation.partnerSeat).map(([, count]) => count), playedCards: observation.playedCards, finishOrder: observation.finishOrder } };
  const before = structuredClone(scenario.runtime);
  const legacyStarted = performance.now(); const legacyAction = chooseAiAction(legacyInput); const elapsedLegacyMs = performance.now() - legacyStarted;
  const unifiedStarted = performance.now();
  let unifiedDecision: AiDecision;
  try { unifiedDecision = decideAiAction(observation, structuredClone(scenario.runtime), scenario.config); } catch (error) { return failedComparison(scenario, legacyAction, elapsedLegacyMs, error); }
  const elapsedUnifiedMs = performance.now() - unifiedStarted;
  const repeated = decideAiAction(structuredClone(observation), structuredClone(scenario.runtime), scenario.config);
  const legacyLegal = legal(legacyAction, scenario);
  const unifiedLegal = legal(unifiedDecision.action, scenario);
  const analysis = analyzeHand(observation.hand, observation.gameRank);
  const legacyPolicyVerdict = verdict(legacyAction, scenario, analysis.groups);
  const unifiedPolicyVerdict = verdict(unifiedDecision.action, scenario, analysis.groups);
  const sameAction = same(legacyAction, unifiedDecision.action);
  const runtimeMutated = JSON.stringify(before) !== JSON.stringify(scenario.runtime);
  const planOk = unifiedDecision.selectedPlanId === unifiedDecision.runtime.activePlanId && unifiedDecision.runtime.candidatePlans.some((plan) => plan.id === unifiedDecision.selectedPlanId);
  const deterministic = same(unifiedDecision.action, repeated.action) && JSON.stringify(unifiedDecision.score) === JSON.stringify(repeated.score) && JSON.stringify(unifiedDecision.reasonCodes) === JSON.stringify(repeated.reasonCodes);
  const classification: DecisionDifferenceClassification = !deterministic ? "NON_DETERMINISTIC" : !unifiedLegal ? "UNIFIED_ILLEGAL" : !legacyLegal ? "LEGACY_ILLEGAL" : !unifiedPolicyVerdict.allowed || legacyPolicyVerdict.allowed !== unifiedPolicyVerdict.allowed ? "POLICY_MISMATCH" : !planOk ? "PLAN_MISMATCH" : sameAction ? "SAME_ACTION" : "LEGAL_SOFT_DIFFERENCE";
  return { scenarioId: scenario.id, legacyAction, unifiedDecision, classification, legacyLegal, unifiedLegal, legacyPolicyVerdict, unifiedPolicyVerdict, sameAction, runtimeMutated, elapsedLegacyMs, elapsedUnifiedMs, details: [] };
}

function legal(action: AiAction, scenario: AiDecisionScenario): boolean { if (action.type === "pass") return scenario.observation.lastPlay !== undefined; return action.group.cards.every((card) => scenario.observation.hand.some((owned) => owned.id === card.id)) && classifyPlay(action.group.cards, scenario.observation.gameRank)?.id === action.group.id && (scenario.observation.lastPlay === undefined || canBeatPlay(action.group, scenario.observation.lastPlay, scenario.observation.gameRank)); }
function verdict(action: AiAction, scenario: AiDecisionScenario, groups: ReturnType<typeof analyzeHand>["groups"]): PolicyVerdict { return action.type === "pass" ? { allowed: true, hardViolation: false, reasonCodes: [] } : evaluatePowerGroupUse(action.group, scenario.observation.hand, groups, scenario.observation.gameRank, action.group.cards.length === scenario.observation.hand.length ? { reason: "IMMEDIATE_FINISH" } : {}); }
function same(left: AiAction, right: AiAction): boolean { return left.type === right.type && (left.type === "pass" || right.type === "pass" || left.group.id === right.group.id); }
function failedComparison(scenario: AiDecisionScenario, legacyAction: AiAction, elapsedLegacyMs: number, error: unknown): DecisionComparison { const verdict: PolicyVerdict = { allowed: false, hardViolation: true, reasonCodes: [] }; return { scenarioId: scenario.id, legacyAction, unifiedDecision: undefined as unknown as AiDecision, classification: "ENGINE_ERROR", legacyLegal: legal(legacyAction, scenario), unifiedLegal: false, legacyPolicyVerdict: verdict, unifiedPolicyVerdict: verdict, sameAction: false, runtimeMutated: false, elapsedLegacyMs, elapsedUnifiedMs: 0, details: [String(error)] }; }
