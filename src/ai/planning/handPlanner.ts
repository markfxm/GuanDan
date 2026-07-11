import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { generatePlans } from "../../engine/planner";
import type { HandAnalysis, HandPlan, PlanningBudget } from "../contracts";
import { HandAnalysisCache } from "../analysis/handAnalysisCache";
import { evaluatePowerGroupUse, protectedPowerGroups } from "../policy/powerGroupPolicy";
import { comparePlans, evaluatePlan } from "./planEvaluator";

const analysisCache = new HandAnalysisCache(64);

export function generateHandPlans(hand: Card[], gameRank: GameRank, budget: PlanningBudget): HandPlan[] {
  const analysis = analysisCache.getOrCreate(hand, gameRank);
  return generatePlans(hand, gameRank, budget.maxPlans).map((plan) => ({ id: plan.id, groups: plan.groups, metrics: evaluatePlan(hand, analysis.groups, plan.groups, gameRank) })).sort(comparePlans);
}

/** Fast deterministic cover used by the future room migration. */
export function generateFastHandPlans(hand: Card[], gameRank: GameRank, budget: PlanningBudget): HandPlan[] {
  const analysis = analysisCache.getOrCreate(hand, gameRank);
  const candidates = analysis.groups.filter((group) => evaluatePowerGroupUse(group, hand, analysis.groups, gameRank).allowed);
  const greedy = completeGreedyCover(hand, candidates, gameRank);
  const beam = budget.timeBudgetMs <= 0 ? undefined : completeBeamCover(hand, candidates, gameRank, budget.beamWidth, budget.timeBudgetMs);
  const fastPlans = [greedy, beam]
    .filter((groups): groups is CardGroup[] => groups !== undefined)
    .map((groups, index) => ({ id: index === 0 ? "fast-greedy" : "fast-beam", groups, metrics: evaluatePlan(hand, analysis.groups, groups, gameRank) }))
    .filter((plan) => plan.metrics.hardViolations === 0)
    .sort(comparePlans)
    .slice(0, Math.max(1, budget.maxPlans));
  if (fastPlans.length > 0) {
    return fastPlans;
  }

  const fallback = protectedGreedyFallback(analysis);
  return [{
    id: "fast-protected-fallback",
    groups: fallback,
    metrics: evaluatePlan(hand, analysis.groups, fallback, gameRank),
  }];
}

export function generateRapidHandPlan(analysis: HandAnalysis, budget: PlanningBudget): HandPlan | undefined {
  return generateFastHandPlans(analysis.hand, analysis.gameRank, { ...budget, beamWidth: 1, maxPlans: 1 })[0];
}

function completeGreedyCover(hand: Card[], candidates: CardGroup[], gameRank: GameRank): CardGroup[] | undefined {
  const used = new Set<string>();
  const selected: CardGroup[] = [];
  for (const group of [...candidates].sort(compareFastCandidates)) {
    if (group.cards.some((card) => used.has(card.id))) continue;
    selected.push(group);
    group.cards.forEach((card) => used.add(card.id));
  }
  return completeWithSingles(hand, candidates, selected, used, gameRank);
}

function completeBeamCover(hand: Card[], candidates: CardGroup[], gameRank: GameRank, beamWidth: number, timeBudgetMs: number): CardGroup[] | undefined {
  const expansionBudget = Math.max(1, Math.floor(timeBudgetMs * 100));
  let expansions = 0;
  const indexById = new Map(hand.map((card, index) => [card.id, index]));
  const entries = candidates.map((group) => ({ group, mask: group.cards.reduce((mask, card) => mask | (1 << (indexById.get(card.id) ?? 31)), 0) }));
  const fullMask = hand.length >= 31 ? -1 : (1 << hand.length) - 1;
  let frontier: { mask: number; groups: CardGroup[] }[] = [{ mask: 0, groups: [] }];
  while (frontier.length > 0) {
    const next: { mask: number; groups: CardGroup[] }[] = [];
    for (const state of frontier) {
      if (state.mask === fullMask) return state.groups;
      const open = firstOpenCard(state.mask, hand.length);
      for (const entry of entries.filter((candidate) => (candidate.mask & (1 << open)) !== 0 && (candidate.mask & state.mask) === 0).sort((left, right) => compareFastCandidates(left.group, right.group))) {
        expansions += 1;
        if (expansions > expansionBudget) return undefined;
        next.push({ mask: state.mask | entry.mask, groups: [...state.groups, entry.group] });
      }
    }
    const best = new Map<number, { mask: number; groups: CardGroup[] }>();
    for (const state of next) if (!best.has(state.mask)) best.set(state.mask, state);
    frontier = [...best.values()].sort((left, right) => left.groups.length - right.groups.length || stableIds(left.groups).localeCompare(stableIds(right.groups))).slice(0, Math.max(1, beamWidth));
  }
  return undefined;
}

function completeWithSingles(hand: Card[], candidates: CardGroup[], selected: CardGroup[], used: Set<string>, gameRank: GameRank): CardGroup[] | undefined {
  for (const card of hand) {
    if (used.has(card.id)) continue;
    const single = candidates.find((group) => group.type === "single" && group.cards[0]?.id === card.id);
    if (single === undefined) return undefined;
    selected.push(single); used.add(card.id);
  }
  return selected;
}

function protectedGreedyFallback(analysis: HandAnalysis): CardGroup[] {
  const selected = protectedPowerGroups(analysis.groups, analysis.gameRank);
  const used = new Set(selected.flatMap((group) => group.cards.map((card) => card.id)));
  for (const card of analysis.hand) {
    if (used.has(card.id)) continue;
    const single = analysis.groups.find((group) => group.type === "single" && group.cards[0]?.id === card.id);
    if (single === undefined) throw new Error(`AI_PLAN_FALLBACK_MISSING_SINGLE:${card.id}`);
    selected.push(single);
    used.add(card.id);
  }
  return selected.sort((left, right) => left.id.localeCompare(right.id));
}
function compareFastCandidates(left: CardGroup, right: CardGroup): number {
  const priority = (group: CardGroup): number =>
    group.type === "joker-bomb" ? 4 :
    group.type === "straight-flush" ? 3 :
    group.type === "bomb" ? 2 : 1;
  return priority(right) - priority(left) || right.cards.length - left.cards.length || right.strength - left.strength || left.id.localeCompare(right.id);
}
function firstOpenCard(mask: number, length: number): number { for (let index = 0; index < length; index += 1) if ((mask & (1 << index)) === 0) return index; return length; }
function stableIds(groups: CardGroup[]): string { return groups.map((group) => group.id).sort().join("|"); }
