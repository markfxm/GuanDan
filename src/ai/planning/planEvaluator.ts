import { isHeartRankWild, type Card, type GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import type { HandPlan, PlanMetrics } from "../contracts";
import { measureProtectionLoss } from "../policy/powerGroupPolicy";

export function evaluatePlan(hand: Card[], handGroups: CardGroup[], groups: CardGroup[], gameRank: GameRank, fallbackScore = 0): PlanMetrics {
  const used = groups.flatMap((group) => group.cards.map((card) => card.id));
  const hardViolations = used.length !== hand.length || new Set(used).size !== used.length || hand.some((card) => !used.includes(card.id)) ? 1 : 0;
  const lowSingleCount = groups.filter((group) => group.type === "single" && group.cards[0]?.kind === "suited" && group.cards[0].rank !== gameRank && !isHeartRankWild(group.cards[0], gameRank) && ["2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(group.cards[0].rank)).length;
  const retainedControl = groups.filter((group) => group.type === "single" && (group.cards[0]?.kind === "joker" || group.cards[0]?.rank === "A" || group.cards[0]?.rank === gameRank)).length;
  return { hardViolations, protectionLoss: measureProtectionLoss(handGroups, groups, gameRank), estimatedTurns: groups.length, lowSingleCount, retainedControl, wildcardFlexibility: groups.reduce((sum, group) => sum + group.wildcards.length, 0), responseCoverage: groups.filter((group) => group.type !== "single").length, leadFlexibility: groups.length, fallbackScore };
}

export function comparePlans(left: HandPlan, right: HandPlan): number {
  const a = left.metrics; const b = right.metrics;
  return a.hardViolations - b.hardViolations || a.protectionLoss - b.protectionLoss || a.lowSingleCount - b.lowSingleCount || a.estimatedTurns - b.estimatedTurns || b.retainedControl - a.retainedControl || b.wildcardFlexibility - a.wildcardFlexibility || b.responseCoverage - a.responseCoverage || b.leadFlexibility - a.leadFlexibility || b.fallbackScore - a.fallbackScore || left.id.localeCompare(right.id);
}
