import crypto from "node:crypto";
import type { Card, GameRank } from "../../engine/cards";
import { classifyPlay } from "../../game/playRules";
import type { AiRuntimeState, HandPlan, PlanMetrics } from "../contracts";
import type { D1PlanSelectionState, PlanIdentity } from "../runtimeContracts";

export type IdentityInput = {
  schemaVersion: string;
  roomRulesVersion: string;
  strategyId: string;
  strategyVersion: string;
  configHash: string;
  seat: number;
  fullReplanCount: number;
  groups: readonly Record<string, unknown>[];
  metrics: PlanMetrics;
};

export type MigrationContext = Omit<IdentityInput, "fullReplanCount" | "groups" | "metrics"> & {
  configVersion: string;
  hand: readonly Card[];
  gameRank: GameRank;
};

export type MigrationResult =
  | { kind: "migrated"; fullReplanRequired: false; state: D1PlanSelectionState }
  | { kind: "migration-required"; fullReplanRequired: true; reason: string };

export type CleanupOptions = {
  activePlanId?: string;
  currentCandidatePlanIds: readonly string[];
  necessaryPreviousPlanIds: readonly string[];
  staticPlanQualityById: Readonly<Record<string, number>>;
  maxEntries: number;
};

export type PlanSwitchKind = "forced" | "strategic" | "cooldown-suppressed" | "hysteresis-suppressed" | "tie" | "keep";

export type PlanSwitchHistoryEvent = {
  kind: PlanSwitchKind;
  decisionIndex: number;
  fromFamilyId?: string;
  toFamilyId?: string;
};

function round6(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

function stableValue(value: unknown): unknown {
  if (typeof value === "number") return round6(value);
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Map) {
    return [...value.entries()]
      .map(([key, item]) => [stableValue(key), stableValue(item)])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value instanceof Set) {
    return [...value].map(stableValue).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function stableCard(card: Record<string, unknown>): Record<string, unknown> {
  return stableValue(card) as Record<string, unknown>;
}

function stableGroup(group: Record<string, unknown>): Record<string, unknown> {
  const cards = Array.isArray(group.cards)
    ? [...group.cards as Record<string, unknown>[]].sort((left, right) => String(left.id).localeCompare(String(right.id))).map(stableCard)
    : [];
  return stableValue({ ...group, cards }) as Record<string, unknown>;
}

export function canonicalPlanInput(input: IdentityInput): string {
  const groups = [...input.groups]
    .map(stableGroup)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify(stableValue({
    schemaVersion: input.schemaVersion,
    roomRulesVersion: input.roomRulesVersion,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    configHash: input.configHash,
    seat: input.seat,
    fullReplanCount: input.fullReplanCount,
    groups,
    metrics: input.metrics,
  }));
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalDelta(delta: unknown): string {
  return JSON.stringify(stableValue(delta));
}

export function createPlanIdentity(input: IdentityInput): PlanIdentity {
  const canonical = canonicalPlanInput(input);
  const rootPlanId = sha256(`d1-root-v1|${canonical}`);
  const planFamilyId = sha256(`d1-family-v1|${rootPlanId}|${input.fullReplanCount}`);
  const lineageId = sha256(`d1-lineage-v1|${rootPlanId}|${canonical}`);
  return { rootPlanId, planFamilyId, lineageId };
}

export function createFullReplanIdentity(input: IdentityInput, fullReplanCount: number): PlanIdentity {
  return createPlanIdentity({ ...input, fullReplanCount });
}

export function createIncrementalIdentity(parent: PlanIdentity, delta: unknown): PlanIdentity {
  return {
    rootPlanId: parent.rootPlanId,
    planFamilyId: parent.planFamilyId,
    lineageId: sha256(`d1-lineage-v1|${parent.lineageId}|${canonicalDelta(delta)}`),
  };
}

export function commitFullReplan(
  state: D1PlanSelectionState,
  planId: string,
  input: IdentityInput,
  succeeded: boolean,
): D1PlanSelectionState {
  if (!succeeded) return state;
  const fullReplanCount = state.fullReplanCount + 1;
  const identity = createFullReplanIdentity(input, fullReplanCount);
  return {
    ...state,
    activePlanId: planId,
    activePlanFamilyId: identity.planFamilyId,
    fullReplanCount,
    planIdentityById: { ...state.planIdentityById, [planId]: identity },
  };
}

function activePlanIsVerifiable(runtime: AiRuntimeState, context: MigrationContext): HandPlan | undefined {
  if (runtime.activePlanId === undefined || runtime.needsReplan || runtime.configVersion !== context.configVersion) return undefined;
  const active = runtime.candidatePlans.find((plan) => plan.id === runtime.activePlanId);
  if (active === undefined || active.metrics.hardViolations !== 0) return undefined;
  const handIds = context.hand.map((card) => card.id).sort();
  if (new Set(handIds).size !== handIds.length) return undefined;
  const plannedIds = active.groups.flatMap((group) => group.cards.map((card) => card.id)).sort();
  if (plannedIds.length !== handIds.length || plannedIds.some((id, index) => id !== handIds[index])) return undefined;
  if (new Set(plannedIds).size !== plannedIds.length) return undefined;
  if (!active.groups.every((group) => classifyPlay(group.cards, context.gameRank)?.id === group.id)) return undefined;
  return active;
}

export function migrateD1State(runtime: AiRuntimeState, context: MigrationContext): MigrationResult {
  const active = activePlanIsVerifiable(runtime, context);
  if (active === undefined) return { kind: "migration-required", fullReplanRequired: true, reason: "active-plan-unverifiable" };
  const identity = createPlanIdentity({
    ...context,
    fullReplanCount: 0,
    groups: active.groups as unknown as Record<string, unknown>[],
    metrics: active.metrics,
  });
  return {
    kind: "migrated",
    fullReplanRequired: false,
    state: {
      version: "d1-topk-runtime-v1",
      migrationVersion: "d0-to-d1-v1",
      activePlanId: active.id,
      activePlanFamilyId: identity.planFamilyId,
      planSwitchCount: 0,
      fullReplanCount: 0,
      recentStrategicPlanFamilyIds: [],
      planIdentityById: { [active.id]: identity },
    },
  };
}

export function cleanupPlanIdentityMap(
  identityById: Readonly<Record<string, PlanIdentity>>,
  options: CleanupOptions,
): Record<string, PlanIdentity> {
  const keep: string[] = [];
  const add = (id: string) => { if (!keep.includes(id) && identityById[id] !== undefined) keep.push(id); };
  if (options.activePlanId !== undefined) add(options.activePlanId);
  [...new Set(options.currentCandidatePlanIds)]
    .filter((id) => id !== options.activePlanId)
    .sort((left, right) => (options.staticPlanQualityById[right] ?? 0) - (options.staticPlanQualityById[left] ?? 0) || left.localeCompare(right))
    .forEach(add);
  [...new Set(options.necessaryPreviousPlanIds)].sort().forEach(add);
  return Object.fromEntries(keep.slice(0, Math.max(0, options.maxEntries)).map((id) => [id, identityById[id]!])) as Record<string, PlanIdentity>;
}

export function updatePlanSwitchHistory(state: D1PlanSelectionState, event: PlanSwitchHistoryEvent): D1PlanSelectionState {
  if (event.kind !== "forced" && event.kind !== "strategic") return state;
  const recent = event.kind === "strategic" && event.fromFamilyId !== undefined
    ? [...state.recentStrategicPlanFamilyIds, event.fromFamilyId].filter((id, index, all) => all.indexOf(id) === index).slice(-8)
    : state.recentStrategicPlanFamilyIds;
  return {
    ...state,
    previousPlanFamilyId: event.fromFamilyId ?? state.previousPlanFamilyId,
    activePlanFamilyId: event.toFamilyId ?? state.activePlanFamilyId,
    lastAnyPlanSwitchDecisionIndex: event.decisionIndex,
    planSwitchCount: state.planSwitchCount + 1,
    recentStrategicPlanFamilyIds: recent,
  };
}
