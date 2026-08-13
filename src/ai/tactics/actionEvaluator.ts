import { isHeartRankWild, rankStrength } from "../../engine/cards";
import type { ActionCandidate, ActionScore } from "../contracts";
import { ACTION_SCORE_WEIGHTS } from "../config";
import type { ActionGenerationInput } from "./actionGenerator";

export function evaluateActionCandidate(candidate: ActionCandidate, input: ActionGenerationInput): ActionScore {
  if (!candidate.policyVerdict.allowed || candidate.policyVerdict.hardViolation) {
    throw new Error("ACTION_CANDIDATE_MUST_BE_LEGAL_AND_POLICY_APPROVED");
  }
  const weights = ACTION_SCORE_WEIGHTS;
  const group = candidate.action.type === "play" ? candidate.action.group : undefined;
  const immediateWin = group?.cards.length === input.hand.length ? weights.FINISH_IMMEDIATELY_BONUS : 0;
  const threatBlock = input.lastPlay !== undefined && input.lastPlaySeat !== input.partnerSeat && group !== undefined ? weights.FOLLOW_THREAT_BLOCK_BONUS : 0;
  const partnerCoordination = candidate.action.type === "pass" && input.lastPlaySeat === input.partnerSeat ? weights.PASS_WHEN_PARTNER_WINNING : 0;
  const planProgress = candidate.alignedPlanIds.length > 0 ? weights.PLAN_ALIGNMENT_BONUS : 0;
  const resourceCost = group === undefined ? 0 :
    (group.type === "bomb" || group.type === "joker-bomb" || group.type === "straight-flush" ? weights.POWER_RESOURCE_COST : 0) +
    (group.cards.some((card) => card.kind === "joker" || isHeartRankWild(card, input.gameRank) || rankStrength(card.rank, input.gameRank) >= rankStrength("A", input.gameRank)) ? weights.CONTROL_RESOURCE_COST : 0);
  const components = { immediateWin, threatBlock, partnerCoordination, initiativeValue: 0, planProgress, remainingPlanQuality: 0, resourceCost };
  return { total: Object.values(components).reduce((sum, value) => sum + value, 0), components, reasonCodes: [...candidate.reasonCodes] };
}
