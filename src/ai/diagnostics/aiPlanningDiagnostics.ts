import { getDetectGroupsCallCount } from "../../engine/groups";

export type AiPlanningTiming = {
  handAnalysis: number;
  ensurePlans: number;
  exactReuse: number;
  partialRepair: number;
  lightweightReplan: number;
  fullReplan: number;
  roleEvaluation: number;
  actionGeneration: number;
  actionEvaluation: number;
  candidateSorting: number;
  finalValidation: number;
  totalDecision: number;
};

export type PlanCandidateValidationTiming = {
  total: number;
  completeCoverage: number;
  groupLegality: number;
  policyCheck: number;
  duplicateOrMissing: number;
  planMetricsRecalculation: number;
};

export type D1PlanSelectionReason =
  | "keep-current"
  | "strategic-switch"
  | "forced-switch"
  | "forced-missing"
  | "forced-incomplete"
  | "forced-policy"
  | "forced-illegal-group"
  | "forced-structural-invalid"
  | "replan-required"
  | "no-valid-plan"
  | "migration-required"
  | "cooldown-suppressed"
  | "hysteresis-suppressed"
  | "tie-kept-active";

export type D1PlanSelectionRecord = Readonly<{
  decisionIndex: number;
  seat: number;
  candidateCount: number;
  activeValid: boolean;
  challengerCount: number;
  reason: D1PlanSelectionReason;
  recentStrategicReturnSwitch: boolean;
  decisionIndicesSinceLastSwitch?: number;
}>;

export type D1PlanSelectionDebugRecord = Readonly<{
  decisionIndex: number;
  seat: number;
  publicTrick?: Readonly<{ lastPlayStableKey?: string; lastPlaySeat?: number; partnerPassedCurrentTrick?: boolean }>;
  candidatePlanIds: readonly string[];
  planFamilyIds: readonly string[];
  scoreBreakdown?: Readonly<{
    staticPlanQuality?: number;
    immediatePlayability?: number;
    tempoFit?: number;
    endgameFit?: number;
    partnerContextFit?: number;
    opponentPressureFit?: number;
    powerGroupRisk?: number;
    total?: number;
  }>;
  scoreDelta?: number;
  requiredDelta?: number;
  reason: string;
  selectedPlanId?: string;
  runtimeSidecar?: Readonly<{
    activePlanId?: string;
    previousPlanId?: string;
    planSwitchCount?: number;
    fullReplanCount?: number;
  }>;
}>;

export type D1Rate = Readonly<{ numerator: number; denominator: number; rate: number | null }>;

export type D1NumericStats = Readonly<{
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  p50: number | null;
  p95: number | null;
}>;

export type D1PlanSelectionAggregate = Readonly<{
  schemaVersion: "d1-plan-selection-diagnostics-v1";
  dynamicDecisionCount: number;
  dynamicDecisionDenominator: number;
  planSwitchConsideredCount: number;
  planSwitchExecutedCount: number;
  forcedSwitchCount: number;
  strategicSwitchCount: number;
  switchSuppressedByCooldown: number;
  switchSuppressedByHysteresis: number;
  tieKeptActiveCount: number;
  recentStrategicReturnSwitchCount: number;
  executedSwitchCount: number;
  planCandidateCount: D1NumericStats;
  decisionIndicesSinceLastSwitch: D1NumericStats;
  switchReasonCounts: Readonly<Record<D1PlanSelectionReason, number>>;
  rates: Readonly<{
    forcedSwitchRate: D1Rate;
    strategicSwitchRate: D1Rate;
    switchSuppressionRate: D1Rate;
    AToBToARate: D1Rate;
  }>;
}>;

export type AiPlanningDiagnostics = {
  decisionCount: number;
  playCount: number;
  passCount: number;
  ensurePlansCallCount: number;
  fullPlanningRunCount: number;
  incrementalExactReuseCount: number;
  incrementalPartialRepairCount: number;
  lightweightReplanCount: number;
  fullReplanCount: number;
  passReuseCount: number;
  exactActivePlanMatchCount: number;
  exactAnyPlanMatchCount: number;
  partialOverlapCount: number;
  noPlanOverlapCount: number;
  repairCardCountSamples: number[];
  repairRatioSamples: number[];
  preservedCardCountSamples: number[];
  affectedGroupCountSamples: number[];
  handSizeBeforeSamples: number[];
  handSizeAfterSamples: number[];
  handAnalysisBuildCount: number;
  detectGroupsCount: number;
  planEvaluationCount: number;
  candidateCountSamples: number[];
  rawCandidateCountSamples: number[];
  uniqueCandidateCountSamples: number[];
  duplicateCandidateCountSamples: number[];
  detectGroupsBySource: Record<string, number>;
  detectGroupsTimingMs: Record<string, number>;
  planCandidateValidationCount: number;
  planCandidateValidationTimingMs: PlanCandidateValidationTiming;
  timingMs: AiPlanningTiming;
  pathReasons: Record<string, number>;
  d1PlanSelectionRecords: D1PlanSelectionRecord[];
  d1DiagnosticsError?: string;
};

const TIMING_KEYS: Array<keyof AiPlanningTiming> = [
  "handAnalysis", "ensurePlans", "exactReuse", "partialRepair", "lightweightReplan",
  "fullReplan", "roleEvaluation", "actionGeneration", "actionEvaluation", "candidateSorting",
  "finalValidation", "totalDecision",
];
const DETECT_GROUPS_SOURCES = [
  "hand-analysis-root", "lead-candidate-generation", "follow-candidate-generation", "plan-candidate-validation",
  "protected-group-analysis", "remaining-hand-analysis", "action-evaluation", "final-validation", "planner", "unknown",
] as const;

export function createAiPlanningDiagnostics(): AiPlanningDiagnostics {
  return {
    decisionCount: 0, playCount: 0, passCount: 0, ensurePlansCallCount: 0, fullPlanningRunCount: 0,
    incrementalExactReuseCount: 0, incrementalPartialRepairCount: 0, lightweightReplanCount: 0,
    fullReplanCount: 0, passReuseCount: 0, exactActivePlanMatchCount: 0, exactAnyPlanMatchCount: 0,
    partialOverlapCount: 0, noPlanOverlapCount: 0, repairCardCountSamples: [], repairRatioSamples: [],
    preservedCardCountSamples: [], affectedGroupCountSamples: [], handSizeBeforeSamples: [],
    handSizeAfterSamples: [], handAnalysisBuildCount: 0, detectGroupsCount: 0, planEvaluationCount: 0,
    candidateCountSamples: [], rawCandidateCountSamples: [], uniqueCandidateCountSamples: [], duplicateCandidateCountSamples: [],
    detectGroupsBySource: Object.fromEntries(DETECT_GROUPS_SOURCES.map((source) => [source, 0])),
    detectGroupsTimingMs: Object.fromEntries(DETECT_GROUPS_SOURCES.map((source) => [source, 0])),
    planCandidateValidationCount: 0,
    planCandidateValidationTimingMs: { total: 0, completeCoverage: 0, groupLegality: 0, policyCheck: 0, duplicateOrMissing: 0, planMetricsRecalculation: 0 },
    timingMs: Object.fromEntries(TIMING_KEYS.map((key) => [key, 0])) as AiPlanningTiming,
    pathReasons: {},
    d1PlanSelectionRecords: [],
  };
}

export function recordPath(diagnostics: AiPlanningDiagnostics | undefined, reason: string): void {
  if (diagnostics !== undefined) diagnostics.pathReasons[reason] = (diagnostics.pathReasons[reason] ?? 0) + 1;
}

export function recordTiming(diagnostics: AiPlanningDiagnostics | undefined, stage: keyof AiPlanningTiming, startedAt: number): void {
  if (diagnostics !== undefined) diagnostics.timingMs[stage] += performance.now() - startedAt;
}

export function recordDetectGroupsSource(diagnostics: AiPlanningDiagnostics | undefined, source: string, countBefore: number, startedAt: number): void {
  if (diagnostics === undefined) return;
  const elapsedMs = performance.now() - startedAt;
  const count = getDetectGroupsCallCount() - countBefore;
  diagnostics.detectGroupsCount += count;
  diagnostics.detectGroupsBySource[source] = (diagnostics.detectGroupsBySource[source] ?? 0) + count;
  diagnostics.detectGroupsTimingMs[source] = (diagnostics.detectGroupsTimingMs[source] ?? 0) + elapsedMs;
}

export function measureGroupDetection<T>(diagnostics: AiPlanningDiagnostics | undefined, source: string, work: () => T): T {
  if (diagnostics === undefined) return work();
  const countBefore = getDetectGroupsCallCount();
  const startedAt = performance.now();
  const result = work();
  recordDetectGroupsSource(diagnostics, source, countBefore, startedAt);
  return result;
}

export function recordPlanCandidateValidation(diagnostics: AiPlanningDiagnostics | undefined, stage: keyof PlanCandidateValidationTiming, startedAt: number): void {
  if (diagnostics !== undefined) diagnostics.planCandidateValidationTimingMs[stage] += performance.now() - startedAt;
}

const D1_REASONS: readonly D1PlanSelectionReason[] = [
  "keep-current", "strategic-switch", "forced-switch", "forced-missing", "forced-incomplete", "forced-policy",
  "forced-illegal-group", "forced-structural-invalid", "replan-required", "no-valid-plan",
  "migration-required", "cooldown-suppressed", "hysteresis-suppressed", "tie-kept-active",
];

const D1_FORBIDDEN_KEYS = new Set([
  "partnerhand", "opponentshands", "opponenthands", "hands", "allhands", "deck", "remainingdeck",
  "hiddeninitialhand", "hiddenstate", "initialhands", "legacyhiddenstate",
]);

export function recordD1PlanSelection(diagnostics: AiPlanningDiagnostics | undefined, record: D1PlanSelectionRecord): boolean {
  if (diagnostics === undefined) return true;
  try {
    validateD1PlanSelectionRecord(record);
    assertD1DiagnosticsPrivacy(record);
    diagnostics.d1PlanSelectionRecords.push({ ...record });
    return true;
  } catch (error) {
    diagnostics.d1DiagnosticsError = error instanceof Error ? error.message : "D1_DIAGNOSTICS_ERROR";
    return false;
  }
}

export function aggregateD1PlanSelectionDiagnostics(diagnostics: AiPlanningDiagnostics): D1PlanSelectionAggregate {
  if (diagnostics.d1DiagnosticsError !== undefined) throw new Error(`D1_DIAGNOSTICS_ERROR:${diagnostics.d1DiagnosticsError}`);
  for (const record of diagnostics.d1PlanSelectionRecords) {
    validateD1PlanSelectionRecord(record);
    assertD1DiagnosticsPrivacy(record);
  }
  const records = diagnostics.d1PlanSelectionRecords;
  const forcedSwitchCount = records.filter((record) => record.reason.startsWith("forced-")).length;
  const strategicSwitchCount = records.filter((record) => record.reason === "strategic-switch").length;
  const switchSuppressedByCooldown = records.filter((record) => record.reason === "cooldown-suppressed").length;
  const switchSuppressedByHysteresis = records.filter((record) => record.reason === "hysteresis-suppressed").length;
  const tieKeptActiveCount = records.filter((record) => record.reason === "tie-kept-active").length;
  const planSwitchConsideredCount = records.filter((record) => record.activeValid && record.challengerCount > 0).length;
  const planSwitchExecutedCount = forcedSwitchCount + strategicSwitchCount;
  const executedSwitchCount = planSwitchExecutedCount;
  const strategicConsiderationDenominator = planSwitchConsideredCount;
  const switchSuppressedNumerator = switchSuppressedByCooldown + switchSuppressedByHysteresis;
  const strategicReturnCount = records.filter((record) => record.reason === "strategic-switch" && record.recentStrategicReturnSwitch).length;
  const strategicSwitchDenominator = strategicSwitchCount;
  const switchReasonCounts = Object.fromEntries(D1_REASONS.map((reason) => [reason, records.filter((record) => record.reason === reason).length])) as Record<D1PlanSelectionReason, number>;
  return {
    schemaVersion: "d1-plan-selection-diagnostics-v1",
    dynamicDecisionCount: records.length,
    dynamicDecisionDenominator: records.length,
    planSwitchConsideredCount,
    planSwitchExecutedCount,
    forcedSwitchCount,
    strategicSwitchCount,
    switchSuppressedByCooldown,
    switchSuppressedByHysteresis,
    tieKeptActiveCount,
    recentStrategicReturnSwitchCount: strategicReturnCount,
    executedSwitchCount,
    planCandidateCount: numericStats(records.map((record) => record.candidateCount)),
    decisionIndicesSinceLastSwitch: numericStats(records.flatMap((record) => record.decisionIndicesSinceLastSwitch === undefined ? [] : [record.decisionIndicesSinceLastSwitch])),
    switchReasonCounts,
    rates: {
      forcedSwitchRate: rate(forcedSwitchCount, records.length),
      strategicSwitchRate: rate(strategicSwitchCount, records.length),
      switchSuppressionRate: rate(switchSuppressedNumerator, strategicConsiderationDenominator),
      AToBToARate: rate(strategicReturnCount, strategicSwitchDenominator),
    },
  };
}

export function serializeD1DiagnosticsAggregate(diagnostics: AiPlanningDiagnostics): string {
  return JSON.stringify(aggregateD1PlanSelectionDiagnostics(diagnostics));
}

export function assertD1DiagnosticsPrivacy(value: unknown): void {
  scanD1Privacy(value, new Set());
}

export function serializeD1PlanSelectionDebug(records: readonly D1PlanSelectionDebugRecord[], enabled: boolean): string | undefined {
  if (!enabled) return undefined;
  assertD1DiagnosticsPrivacy(records);
  for (const record of records) validateD1PlanSelectionDebugRecord(record);
  const normalized = records.map((record) => ({
    decisionIndex: record.decisionIndex,
    seat: record.seat,
    publicTrick: record.publicTrick,
    candidatePlanIds: [...record.candidatePlanIds].sort(),
    planFamilyIds: [...record.planFamilyIds].sort(),
    scoreBreakdown: record.scoreBreakdown,
    scoreDelta: record.scoreDelta,
    requiredDelta: record.requiredDelta,
    reason: record.reason,
    selectedPlanId: record.selectedPlanId,
    runtimeSidecar: record.runtimeSidecar,
  })).sort((left, right) => left.decisionIndex - right.decisionIndex || left.seat - right.seat || String(left.selectedPlanId ?? "").localeCompare(String(right.selectedPlanId ?? "")));
  return JSON.stringify({ schemaVersion: "d1-plan-selection-debug-v1", debugMode: "debug-plan-selection", records: normalized });
}

function validateD1PlanSelectionRecord(record: D1PlanSelectionRecord): void {
  if (!Number.isInteger(record.decisionIndex) || !Number.isInteger(record.seat) || !Number.isInteger(record.candidateCount) || record.candidateCount < 0 || !Number.isInteger(record.challengerCount) || record.challengerCount < 0) {
    throw new Error("D1_DIAGNOSTICS_NON_FINITE_SAMPLE");
  }
  if (!Number.isFinite(record.decisionIndicesSinceLastSwitch ?? 0) || (record.decisionIndicesSinceLastSwitch !== undefined && record.decisionIndicesSinceLastSwitch < 0)) throw new Error("D1_DIAGNOSTICS_NON_FINITE_SAMPLE");
  if (!D1_REASONS.includes(record.reason)) throw new Error("D1_DIAGNOSTICS_INVALID_REASON");
  if (typeof record.activeValid !== "boolean" || typeof record.recentStrategicReturnSwitch !== "boolean") throw new Error("D1_DIAGNOSTICS_INVALID_RECORD");
}

function validateD1PlanSelectionDebugRecord(record: D1PlanSelectionDebugRecord): void {
  if (!Number.isInteger(record.decisionIndex) || !Number.isInteger(record.seat)) throw new Error("D1_DIAGNOSTICS_INVALID_DEBUG_RECORD");
  const values = [
    record.scoreDelta, record.requiredDelta,
    record.scoreBreakdown?.staticPlanQuality, record.scoreBreakdown?.immediatePlayability,
    record.scoreBreakdown?.tempoFit, record.scoreBreakdown?.endgameFit,
    record.scoreBreakdown?.partnerContextFit, record.scoreBreakdown?.opponentPressureFit,
    record.scoreBreakdown?.powerGroupRisk, record.scoreBreakdown?.total,
    record.runtimeSidecar?.planSwitchCount, record.runtimeSidecar?.fullReplanCount,
  ].filter((value): value is number => value !== undefined);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("D1_DIAGNOSTICS_NON_FINITE_DEBUG");
}

function numericStats(values: readonly number[]): D1NumericStats {
  if (values.length === 0) return { count: 0, min: null, max: null, mean: null, p50: null, p95: null };
  const sorted = [...values].sort((left, right) => left - right);
  const nearestRank = (percentile: number): number => sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)]!;
  return {
    count: sorted.length,
    min: round6(sorted[0]!),
    max: round6(sorted[sorted.length - 1]!),
    mean: round6(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: round6(nearestRank(0.5)),
    p95: round6(nearestRank(0.95)),
  };
}

function rate(numerator: number, denominator: number): D1Rate {
  return { numerator, denominator, rate: denominator === 0 ? null : round6(numerator / denominator) };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function scanD1Privacy(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) scanD1Privacy(item, seen);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (D1_FORBIDDEN_KEYS.has(normalized)) throw new Error(`D1_DIAGNOSTICS_PRIVACY_VIOLATION:${key}`);
    scanD1Privacy(nested, seen);
  }
}
