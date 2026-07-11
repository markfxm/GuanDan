import type { Card, GameRank } from "../../engine/cards";
import { classifyPlay } from "../../game/playRules";
import type { AiRuntimeState, PlanningBudget } from "../contracts";
import { stableHandKey } from "../analysis/handAnalyzer";
import { generateFastHandPlans } from "./handPlanner";

export function ensurePlans(runtime: AiRuntimeState, hand: Card[], gameRank: GameRank, turn: number, budget: PlanningBudget, configVersion: string): AiRuntimeState {
  const handKey = stableHandKey(hand);
  if (!runtime.needsReplan && runtime.handKey === handKey && runtime.configVersion === configVersion && hasValidActivePlan(runtime, hand, gameRank)) return runtime;
  const candidatePlans = generateFastHandPlans(hand, gameRank, budget);
  return { handKey, candidatePlans, activePlanId: candidatePlans[0]?.id, generatedTurn: turn, configVersion, needsReplan: false };
}

function hasValidActivePlan(runtime: AiRuntimeState, hand: Card[], gameRank: GameRank): boolean {
  const plan = runtime.candidatePlans.find((candidate) => candidate.id === runtime.activePlanId);
  if (plan === undefined || plan.metrics.hardViolations > 0) return false;
  const handIds = hand.map((card) => card.id).sort();
  const plannedIds = plan.groups.flatMap((group) => group.cards.map((card) => card.id)).sort();
  if (handIds.length !== plannedIds.length || handIds.some((id, index) => id !== plannedIds[index])) return false;
  return plan.groups.every((group) => classifyPlay(group.cards, gameRank)?.id === group.id);
}
