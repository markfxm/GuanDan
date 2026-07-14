export type PlanSelectionMode = "keep-current" | "dynamic-topk-v1";

export type PlanIdentity = {
  rootPlanId: string;
  planFamilyId: string;
  lineageId: string;
};

export type D1PlanSelectionState = {
  version: "d1-topk-runtime-v1";
  migrationVersion?: "d0-to-d1-v1";
  activePlanId?: string;
  previousPlanId?: string;
  activePlanFamilyId?: string;
  previousPlanFamilyId?: string;
  lastAnyPlanSwitchDecisionIndex?: number;
  planSwitchCount: number;
  fullReplanCount: number;
  recentStrategicPlanFamilyIds: string[];
  planIdentityById: Readonly<Record<string, PlanIdentity>>;
};
