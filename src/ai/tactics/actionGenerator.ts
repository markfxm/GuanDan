import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { canBeatPlay, classifyPlay } from "../../game/playRules";
import { HandAnalysisCache } from "../analysis/handAnalysisCache";
import type { ActionCandidate, AiAction, HandPlan } from "../contracts";
import { evaluatePowerGroupUse } from "../policy/powerGroupPolicy";

export type ActionGenerationInput = {
  hand: Card[];
  gameRank: GameRank;
  seat: number;
  partnerSeat: number;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  plan?: HandPlan;
};

const analysisCache = new HandAnalysisCache(64);

export function generateActionCandidates(input: ActionGenerationInput): ActionCandidate[] {
  const analysis = analysisCache.getOrCreate(input.hand, input.gameRank);
  const plannedIds = new Set(input.plan?.groups.map((group) => group.id) ?? []);
  const candidates = new Map<string, ActionCandidate>();
  if (input.lastPlay !== undefined) {
    candidates.set("pass", passCandidate());
  }
  for (const group of analysis.groups) {
    if (classifyPlay(group.cards, input.gameRank)?.id !== group.id) continue;
    if (input.lastPlay !== undefined && !canBeatPlay(group, input.lastPlay, input.gameRank)) continue;
    const policyVerdict = evaluatePowerGroupUse(group, input.hand, analysis.groups, input.gameRank);
    if (!policyVerdict.allowed) continue;
    const action: AiAction = { type: "play", group };
    const source = plannedIds.has(group.id) ? "PLAN" : "HAND_ANALYSIS";
    candidates.set(group.id, { action, source, policyVerdict, alignedPlanIds: source === "PLAN" && input.plan !== undefined ? [input.plan.id] : [], stableKey: group.id, reasonCodes: policyVerdict.reasonCodes });
  }
  return [...candidates.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
}

function passCandidate(): ActionCandidate {
  return { action: { type: "pass" }, source: "FALLBACK", policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] }, alignedPlanIds: [], stableKey: "pass", reasonCodes: [] };
}
