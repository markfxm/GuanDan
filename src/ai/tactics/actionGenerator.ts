import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { getDetectGroupsCallCount } from "../../engine/groups";
import { canBeatPlay, playPower } from "../../game/playRules";
import { HandAnalysisCache } from "../analysis/handAnalysisCache";
import type { ActionCandidate, AiAction, HandAnalysis, HandPlan } from "../contracts";
import { createPowerGroupPolicyIndex, evaluatePowerGroupUse, type PowerGroupPolicyIndex } from "../policy/powerGroupPolicy";
import type { AiPlanningDiagnostics } from "../diagnostics/aiPlanningDiagnostics";
import { recordDetectGroupsSource } from "../diagnostics/aiPlanningDiagnostics";

export type ActionGenerationInput = {
  hand: Card[];
  gameRank: GameRank;
  seat: number;
  partnerSeat: number;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  plan?: HandPlan;
  analysis?: HandAnalysis;
  policyIndex?: PowerGroupPolicyIndex;
  diagnostics?: AiPlanningDiagnostics;
};

const analysisCache = new HandAnalysisCache(64);

export function generateActionCandidates(input: ActionGenerationInput): ActionCandidate[] {
  const detectGroupsBefore = input.diagnostics === undefined ? 0 : getDetectGroupsCallCount();
  const startedAt = input.diagnostics === undefined ? 0 : performance.now();
  const analysis = input.analysis ?? analysisCache.getOrCreate(input.hand, input.gameRank);
  const policyIndex = input.policyIndex ?? createPowerGroupPolicyIndex(analysis.groups, input.gameRank);
  const plannedIds = new Set(input.plan?.groups.map((group) => group.id) ?? []);
  const rawGroups = analysis.groups;
  const playableGroups = canonicalPlayableGroups(rawGroups, input.gameRank);
  if (input.diagnostics !== undefined) {
    input.diagnostics.rawCandidateCountSamples.push(rawGroups.length + (input.lastPlay === undefined ? 0 : 1));
    input.diagnostics.uniqueCandidateCountSamples.push(playableGroups.length + (input.lastPlay === undefined ? 0 : 1));
    input.diagnostics.duplicateCandidateCountSamples.push(rawGroups.length - playableGroups.length);
  }
  const candidates = new Map<string, ActionCandidate>();
  if (input.lastPlay !== undefined) {
    candidates.set("pass", passCandidate());
  }
  for (const group of playableGroups) {
    if (input.lastPlay !== undefined && !canBeatPlay(group, input.lastPlay, input.gameRank)) continue;
    const policyVerdict = evaluatePowerGroupUse(group, input.hand, analysis.groups, input.gameRank, group.cards.length === input.hand.length ? { reason: "IMMEDIATE_FINISH" } : {}, policyIndex);
    if (!policyVerdict.allowed) continue;
    const action: AiAction = { type: "play", group };
    const source = plannedIds.has(group.id) ? "PLAN" : "HAND_ANALYSIS";
    candidates.set(group.id, { action, source, policyVerdict, alignedPlanIds: source === "PLAN" && input.plan !== undefined ? [input.plan.id] : [], stableKey: group.id, reasonCodes: policyVerdict.reasonCodes });
  }
  const result = [...candidates.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
  recordDetectGroupsSource(input.diagnostics, input.lastPlay === undefined ? "lead-candidate-generation" : "follow-candidate-generation", detectGroupsBefore, startedAt);
  return result;
}

function canonicalPlayableGroups(groups: readonly CardGroup[], gameRank: GameRank): CardGroup[] {
  const canonical = new Map<string, CardGroup>();
  for (const group of groups) {
    const key = group.cards.map((card) => card.id).sort().join(",");
    const existing = canonical.get(key);
    if (existing === undefined || playPower(group, gameRank) > playPower(existing, gameRank) ||
      playPower(group, gameRank) === playPower(existing, gameRank) && group.id.localeCompare(existing.id) < 0) {
      canonical.set(key, group);
    }
  }
  return [...canonical.values()];
}

function passCandidate(): ActionCandidate {
  return { action: { type: "pass" }, source: "FALLBACK", policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] }, alignedPlanIds: [], stableKey: "pass", reasonCodes: [] };
}
