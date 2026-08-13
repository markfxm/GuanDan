import type { AiPerformanceConfig, RepresentativeActionShadowConfig } from "./contracts";

export const DEFAULT_AI_PERFORMANCE_CONFIG: AiPerformanceConfig = {
  analysisCacheSize: 64,
  planning: { maxPlans: 5, beamWidth: 1, timeBudgetMs: 0 },
  version: "ai-core-v1",
};

export const DEFAULT_REPRESENTATIVE_ACTION_SHADOW: RepresentativeActionShadowConfig = Object.freeze({
  mode: "shadow",
  hardCap: 256,
});

export const ACTION_SCORE_WEIGHTS = {
  PASS_WHEN_PARTNER_WINNING: 70,
  OVERTAKE_PARTNER_PENALTY: -60,
  FOLLOW_OPPONENT_BASE_BONUS: 30,
  EARLY_CONTROL_CONSUME_PENALTY: -35,
  EARLY_WILDCARD_CONSUME_PENALTY: -45,
  EARLY_BOMB_PENALTY: -70,
  LATE_DANGER_PASS_PENALTY: -100,
  LATE_DANGER_FOLLOW_BONUS: 80,
  FINISH_IMMEDIATELY_BONUS: 150,
  PLAN_ALIGNMENT_BONUS: 12,
  FOLLOW_THREAT_BLOCK_BONUS: 80,
  CONTROL_RESOURCE_COST: -35,
  POWER_RESOURCE_COST: -70,
} as const;

export const ROLE_EVALUATION_THRESHOLDS = {
  ATTACKER_POWER_COUNT: 3,
  ATTACKER_CONTROL_SCORE: 2,
  SUPPORT_POWER_COUNT: 1,
  SUPPORT_CONTROL_SCORE: 2,
} as const;
