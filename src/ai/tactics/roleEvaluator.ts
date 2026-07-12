import { rankStrength, type Card, type GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { HandAnalysisCache } from "../analysis/handAnalysisCache";
import type { HandAnalysis } from "../contracts";
import { ROLE_EVALUATION_THRESHOLDS } from "../config";

export type AiRole = "attacker" | "support" | "balanced";

export type AiRoleEvaluation = {
  role: AiRole;
  confidence: number;
  reasonCodes: string[];
};

const analysisCache = new HandAnalysisCache(64);

export function evaluateAiRole(input: { hand: Card[]; gameRank: GameRank; analysis?: HandAnalysis }): AiRoleEvaluation {
  const groups = (input.analysis ?? analysisCache.getOrCreate(input.hand, input.gameRank)).groups;
  const powerCount = powerResourceCount(input.hand, groups);
  const controlScore = controlResourceScore(input.hand, groups, input.gameRank);
  const thresholds = ROLE_EVALUATION_THRESHOLDS;
  if (powerCount >= thresholds.ATTACKER_POWER_COUNT || controlScore >= thresholds.ATTACKER_CONTROL_SCORE) {
    return { role: "attacker", confidence: Math.min(1, Math.max(powerCount / 4, controlScore / 3)), reasonCodes: ["POWER_OR_CONTROL_ADVANTAGE"] };
  }
  if (powerCount <= thresholds.SUPPORT_POWER_COUNT && controlScore < thresholds.SUPPORT_CONTROL_SCORE) {
    return { role: "support", confidence: Math.min(1, (thresholds.SUPPORT_POWER_COUNT - powerCount + 1) / 2), reasonCodes: ["LOW_CONTROL_RESOURCES"] };
  }
  return { role: "balanced", confidence: 0.5, reasonCodes: ["MIXED_RESOURCES"] };
}

function controlResourceScore(hand: Card[], groups: CardGroup[], gameRank: GameRank): number {
  return hand.filter((card) => card.kind === "joker" || rankStrength(card.rank, gameRank) >= rankStrength("A", gameRank)).length +
    groups.filter((group) => group.type === "bomb" || group.type === "joker-bomb" || group.type === "straight-flush").length;
}

function powerResourceCount(hand: Card[], groups: CardGroup[]): number {
  return groups.filter((group) => group.type === "bomb" || group.type === "joker-bomb" || group.type === "straight-flush").length +
    hand.filter((card) => card.kind === "joker").length;
}
