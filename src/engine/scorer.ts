import type { GameRank } from "./cards";
import type { GroupType } from "./groups";
import type { Plan } from "./planner";

export type ScoreBreakdown = {
  turnCount: number;
  controlRetained: number;
  wildcardValue: number;
  linkedTempo: number;
  singleRisk: number;
  tailControl: number;
};

export type ScoredPlan = Plan & {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  explanations: string[];
  risks: string[];
};

const LINKED_TYPES = new Set<GroupType>(["straight", "consecutive-pairs", "plate", "straight-flush"]);

export function scorePlan(plan: Plan, gameRank: GameRank): ScoredPlan {
  const groupCount = plan.groups.length;
  const recoveryGroups = plan.groups.filter((group) => group.purpose === "recovery");
  const tailControlGroups = plan.groups.filter((group) => group.purpose === "tail-control");
  const linkedGroups = plan.groups.filter((group) => LINKED_TYPES.has(group.type));
  const singleGroups = plan.groups.filter((group) => group.type === "single");
  const wildcardCount = plan.groups.reduce((total, group) => total + group.wildcards.length, 0);

  const scoreBreakdown: ScoreBreakdown = {
    turnCount: clampScore(100 - Math.max(0, groupCount - 8) * 6),
    controlRetained: clampScore(recoveryGroups.length * 35),
    wildcardValue: clampScore(wildcardCount * 30),
    linkedTempo: clampScore(linkedGroups.reduce((total, group) => total + group.cards.length, 0) * 8),
    singleRisk: clampScore(100 - singleGroups.filter((group) => group.purpose === "risk").length * 12),
    tailControl: clampScore(tailControlGroups.length * 25),
  };

  const score = clampScore(
    scoreBreakdown.turnCount * 0.25 +
      scoreBreakdown.controlRetained * 0.2 +
      scoreBreakdown.wildcardValue * 0.15 +
      scoreBreakdown.linkedTempo * 0.15 +
      scoreBreakdown.singleRisk * 0.15 +
      scoreBreakdown.tailControl * 0.1,
  );

  return {
    ...plan,
    score,
    scoreBreakdown,
    explanations: buildExplanations(scoreBreakdown, {
      gameRank,
      groupCount,
      recoveryCount: recoveryGroups.length,
      tailControlCount: tailControlGroups.length,
      linkedCount: linkedGroups.length,
      wildcardCount,
    }),
    risks: buildRisks(singleGroups.filter((group) => group.purpose === "risk").length, groupCount),
  };
}

export function scorePlans(plans: Plan[], gameRank: GameRank): ScoredPlan[] {
  return plans.map((plan) => scorePlan(plan, gameRank)).sort((left, right) => right.score - left.score);
}

function buildExplanations(
  scoreBreakdown: ScoreBreakdown,
  context: {
    gameRank: GameRank;
    groupCount: number;
    recoveryCount: number;
    tailControlCount: number;
    linkedCount: number;
    wildcardCount: number;
  },
): string[] {
  const explanations = [
    `预计 ${context.groupCount} 手出完，轮次效率评分 ${scoreBreakdown.turnCount}。`,
    `单张风险评分 ${scoreBreakdown.singleRisk}，越高表示散单压力越小。`,
  ];

  if (context.recoveryCount > 0) {
    explanations.push(`保留 ${context.recoveryCount} 组恢复牌，控制资源评分 ${scoreBreakdown.controlRetained}。`);
  }

  if (context.tailControlCount > 0) {
    explanations.push(`保留 ${context.tailControlCount} 张尾手控制牌，尾控评分 ${scoreBreakdown.tailControl}。`);
  }

  if (context.wildcardCount > 0) {
    explanations.push(
      `使用或保留 ${context.wildcardCount} 张红心${context.gameRank}逢人配，提供控制弹性，配牌价值评分 ${scoreBreakdown.wildcardValue}。`,
    );
  }

  if (context.linkedCount > 0) {
    explanations.push(`包含 ${context.linkedCount} 组顺子、同花顺、木板或钢板，连动评分 ${scoreBreakdown.linkedTempo}。`);
  }

  return explanations;
}

function buildRisks(riskSingles: number, groupCount: number): string[] {
  const risks: string[] = [];

  if (riskSingles > 0) {
    risks.push(`仍有 ${riskSingles} 张普通单牌，可能拖慢收尾。`);
  }

  if (groupCount > 12) {
    risks.push("手数偏多，需要尽早合并或借势过牌。");
  }

  return risks;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
