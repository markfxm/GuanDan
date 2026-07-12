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
