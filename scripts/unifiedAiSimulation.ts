import { createAiPlanningDiagnostics, type AiPlanningDiagnostics } from "../src/ai/diagnostics/aiPlanningDiagnostics";
import { createLegacyBenchmarkRoom, runAiStep } from "../src/game/room";

export type SimulationSafetyCounters = {
  engineErrorCount: number;
  illegalActionCount: number;
  leadPassCount: number;
  invalidFollowCount: number;
  duplicateCardCount: number;
  missingCardCount: number;
  policyViolationCount: number;
  runtimePlanMismatchCount: number;
  exceededActionLimit: number;
};

export type SimulationSeedResult = SimulationSafetyCounters & {
  seed: number;
  completed: boolean;
  actionCount: number;
  durationMs: number;
  finishOrder: number[];
  error?: string;
  diagnostics?: AiPlanningDiagnostics;
  derived?: ReturnType<typeof deriveDiagnostics>;
  topHotspots?: Array<{ stage: string; totalMs: number; percentageOfTotalDecisionTime: number }>;
  topDetectGroupsSources?: Array<{ source: string; count: number; totalMs: number }>;
  planCandidateValidationCount: number;
  planCandidateValidationDurationMs: number;
  planCandidateValidationBreakdown: AiPlanningDiagnostics["planCandidateValidationTimingMs"] | undefined;
  plannerDurationMs: number;
  planCandidateValidationDurationMsPerCall: number;
  actionGenerationDurationMs: number;
  fullReplanCount: number;
  exactReuseCount: number;
  partialRepairCount: number;
  detectGroupsCount: number;
};

export type SimulationSummary = {
  completed: number;
  exceededActionLimit: number;
  engineErrors: number;
  seeds: number[];
  results: SimulationSeedResult[];
  aggregate?: ReturnType<typeof aggregateDiagnostics>;
  statistics: ReturnType<typeof simulationStatistics>;
};

export function simulateUnifiedRooms(seeds: number[], actionLimit = 1000, options: { diagnostics?: boolean } = {}): SimulationSummary {
  const summary: Omit<SimulationSummary, "statistics"> = { completed: 0, exceededActionLimit: 0, engineErrors: 0, seeds, results: [] };
  for (const seed of seeds) {
    const room = createLegacyBenchmarkRoom({ rank: "2", seed });
    room.players[0].isAI = true;
    const diagnostics = options.diagnostics === true ? createAiPlanningDiagnostics() : undefined;
    const counters: SimulationSafetyCounters = { engineErrorCount: 0, illegalActionCount: 0, leadPassCount: 0, invalidFollowCount: 0, duplicateCardCount: 0, missingCardCount: 0, policyViolationCount: 0, runtimePlanMismatchCount: 0, exceededActionLimit: 0 };
    const startedAt = performance.now();
    let actions = 0;
    let error: string | undefined;
    while (room.status === "playing" && actions < actionLimit && error === undefined) {
      try {
        runAiStep(room, diagnostics);
        counters.runtimePlanMismatchCount += countRuntimePlanMismatches(room);
      } catch (caught) {
        error = String(caught);
        counters.engineErrorCount += 1;
        classifySimulationError(error, counters);
      }
      actions += 1;
    }
    if (room.status !== "finished" && error === undefined) counters.exceededActionLimit = 1;
    const result = buildSeedResult(seed, room.finishOrder, room.status === "finished", actions, performance.now() - startedAt, counters, diagnostics, error);
    summary.results.push(result);
    if (result.completed) summary.completed += 1;
    summary.exceededActionLimit += result.exceededActionLimit;
    summary.engineErrors += result.engineErrorCount;
  }
  if (options.diagnostics === true) summary.aggregate = aggregateDiagnostics(summary.results);
  return { ...summary, statistics: simulationStatistics(summary.results) };
}

function buildSeedResult(seed: number, finishOrder: number[], completed: boolean, actionCount: number, durationMs: number, counters: SimulationSafetyCounters, diagnostics: AiPlanningDiagnostics | undefined, error: string | undefined): SimulationSeedResult {
  const validationDuration = diagnostics?.planCandidateValidationTimingMs.total ?? 0;
  const validationCount = diagnostics?.planCandidateValidationCount ?? 0;
  return {
    seed, completed, actionCount, durationMs, finishOrder: [...finishOrder], error, diagnostics,
    derived: diagnostics === undefined ? undefined : deriveDiagnostics(diagnostics),
    topHotspots: diagnostics === undefined ? undefined : topHotspots(diagnostics),
    topDetectGroupsSources: diagnostics === undefined ? undefined : topDetectGroupsSources(diagnostics),
    planCandidateValidationCount: validationCount,
    planCandidateValidationDurationMs: validationDuration,
    planCandidateValidationBreakdown: diagnostics?.planCandidateValidationTimingMs,
    planCandidateValidationDurationMsPerCall: validationCount === 0 ? 0 : validationDuration / validationCount,
    plannerDurationMs: diagnostics?.timingMs.fullReplan ?? 0,
    actionGenerationDurationMs: diagnostics?.timingMs.actionGeneration ?? 0,
    fullReplanCount: diagnostics?.fullReplanCount ?? 0,
    exactReuseCount: diagnostics?.incrementalExactReuseCount ?? 0,
    partialRepairCount: diagnostics?.incrementalPartialRepairCount ?? 0,
    detectGroupsCount: diagnostics?.detectGroupsCount ?? 0,
    ...counters,
  };
}

function countRuntimePlanMismatches(room: ReturnType<typeof createLegacyBenchmarkRoom>): number {
  let mismatches = 0;
  for (const [seatKey, runtime] of Object.entries(room.aiRuntime)) {
    if (runtime === undefined || runtime.needsReplan) continue;
    const seat = Number(seatKey) as keyof typeof room.hands;
    const activePlan = runtime.candidatePlans.find((plan) => plan.id === runtime.activePlanId);
    const handIds = room.hands[seat].map((card) => card.id).sort();
    const planIds = activePlan?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort() ?? [];
    if (handIds.length !== planIds.length || handIds.some((id, index) => id !== planIds[index])) mismatches += 1;
  }
  return mismatches;
}

function classifySimulationError(error: string, counters: SimulationSafetyCounters): void {
  if (error.includes("AI_ENGINE_RETURNED_LEAD_PASS") || error.includes("AI_ENGINE_ILLEGAL_LEAD_PASS")) counters.leadPassCount += 1;
  if (error.includes("AI_ENGINE_NON_BEATING_FOLLOW") || error.includes("不能压过")) counters.invalidFollowCount += 1;
  if (error.includes("AI_ACTION_CONTAINS_DUPLICATE_CARDS")) counters.duplicateCardCount += 1;
  if (error.includes("AI_ENGINE_CARD_NOT_IN_HAND") || error.includes("不在当前手牌")) counters.missingCardCount += 1;
  if (error.includes("POLICY")) counters.policyViolationCount += 1;
  if (error.includes("AI_ENGINE_") || counters.invalidFollowCount > 0 || counters.duplicateCardCount > 0 || counters.missingCardCount > 0) counters.illegalActionCount += 1;
}

export function deriveDiagnostics(diagnostics: AiPlanningDiagnostics) {
  const overlaps = diagnostics.exactAnyPlanMatchCount + diagnostics.partialOverlapCount + diagnostics.noPlanOverlapCount;
  return {
    exactActivePlanMatchRate: rate(diagnostics.exactActivePlanMatchCount, diagnostics.playCount),
    exactAnyPlanMatchRate: rate(diagnostics.exactAnyPlanMatchCount, diagnostics.playCount),
    partialOverlapRate: rate(diagnostics.partialOverlapCount, overlaps),
    noOverlapRate: rate(diagnostics.noPlanOverlapCount, overlaps),
    repairCardMedian: percentile(diagnostics.repairCardCountSamples, 0.5),
    repairCardP95: percentile(diagnostics.repairCardCountSamples, 0.95),
    repairCardMax: Math.max(0, ...diagnostics.repairCardCountSamples),
    repairRatioMedian: percentile(diagnostics.repairRatioSamples, 0.5),
    repairRatioP95: percentile(diagnostics.repairRatioSamples, 0.95),
    averageCandidateCount: average(diagnostics.candidateCountSamples),
    maxCandidateCount: Math.max(0, ...diagnostics.candidateCountSamples),
    averageRawCandidateCount: average(diagnostics.rawCandidateCountSamples),
    maxRawCandidateCount: Math.max(0, ...diagnostics.rawCandidateCountSamples),
    averageUniqueCandidateCount: average(diagnostics.uniqueCandidateCountSamples),
    maxUniqueCandidateCount: Math.max(0, ...diagnostics.uniqueCandidateCountSamples),
    duplicateCandidateCount: diagnostics.duplicateCandidateCountSamples.reduce((total, value) => total + value, 0),
    planningRunsPerDecision: rate(diagnostics.fullPlanningRunCount, diagnostics.decisionCount),
    fullReplansPerPlay: rate(diagnostics.fullReplanCount, diagnostics.playCount),
  };
}

export function topHotspots(diagnostics: AiPlanningDiagnostics): Array<{ stage: string; totalMs: number; percentageOfTotalDecisionTime: number }> {
  const totalDecision = diagnostics.timingMs.totalDecision;
  return Object.entries(diagnostics.timingMs)
    .filter(([stage]) => stage !== "totalDecision")
    .map(([stage, totalMs]) => ({ stage, totalMs, percentageOfTotalDecisionTime: totalDecision === 0 ? 0 : totalMs / totalDecision * 100 }))
    .sort((left, right) => right.totalMs - left.totalMs || left.stage.localeCompare(right.stage))
    .slice(0, 5);
}

export function topDetectGroupsSources(diagnostics: AiPlanningDiagnostics): Array<{ source: string; count: number; totalMs: number }> {
  return Object.entries(diagnostics.detectGroupsBySource)
    .map(([source, count]) => ({ source, count, totalMs: diagnostics.detectGroupsTimingMs[source] ?? 0 }))
    .sort((left, right) => right.count - left.count || right.totalMs - left.totalMs || left.source.localeCompare(right.source))
    .slice(0, 5);
}

export function aggregateDiagnostics(results: SimulationSeedResult[]) {
  const diagnostics = createAiPlanningDiagnostics();
  for (const result of results) {
    if (result.diagnostics === undefined) continue;
    const source = result.diagnostics;
    for (const key of [
      "decisionCount", "playCount", "passCount", "ensurePlansCallCount", "fullPlanningRunCount",
      "incrementalExactReuseCount", "incrementalPartialRepairCount", "lightweightReplanCount", "fullReplanCount",
      "passReuseCount", "exactActivePlanMatchCount", "exactAnyPlanMatchCount", "partialOverlapCount", "noPlanOverlapCount",
      "handAnalysisBuildCount", "detectGroupsCount", "planEvaluationCount", "planCandidateValidationCount",
    ] as const) diagnostics[key] += source[key];
    for (const key of [
      "repairCardCountSamples", "repairRatioSamples", "preservedCardCountSamples", "affectedGroupCountSamples",
      "handSizeBeforeSamples", "handSizeAfterSamples", "candidateCountSamples", "rawCandidateCountSamples",
      "uniqueCandidateCountSamples", "duplicateCandidateCountSamples",
    ] as const) diagnostics[key].push(...source[key]);
    for (const [stage, duration] of Object.entries(source.timingMs)) diagnostics.timingMs[stage as keyof typeof diagnostics.timingMs] += duration;
    for (const [stage, duration] of Object.entries(source.planCandidateValidationTimingMs)) diagnostics.planCandidateValidationTimingMs[stage as keyof typeof diagnostics.planCandidateValidationTimingMs] += duration;
    for (const [reason, count] of Object.entries(source.pathReasons)) diagnostics.pathReasons[reason] = (diagnostics.pathReasons[reason] ?? 0) + count;
    for (const [reason, count] of Object.entries(source.detectGroupsBySource)) diagnostics.detectGroupsBySource[reason] = (diagnostics.detectGroupsBySource[reason] ?? 0) + count;
    for (const [reason, duration] of Object.entries(source.detectGroupsTimingMs)) diagnostics.detectGroupsTimingMs[reason] = (diagnostics.detectGroupsTimingMs[reason] ?? 0) + duration;
  }
  return { diagnostics, derived: deriveDiagnostics(diagnostics), topHotspots: topHotspots(diagnostics), topDetectGroupsSources: topDetectGroupsSources(diagnostics) };
}

export function simulationStatistics(results: SimulationSeedResult[]) {
  const durations = results.map((result) => result.durationMs);
  const totals = results.reduce((total, result) => ({
    totalDurationMs: total.totalDurationMs + result.durationMs,
    actions: total.actions + result.actionCount,
    decisions: total.decisions + (result.diagnostics?.decisionCount ?? 0),
    detectGroups: total.detectGroups + result.detectGroupsCount,
    fullReplans: total.fullReplans + result.fullReplanCount,
    planValidationCount: total.planValidationCount + result.planCandidateValidationCount,
    planValidationMs: total.planValidationMs + result.planCandidateValidationDurationMs,
    plannerMs: total.plannerMs + result.plannerDurationMs,
    actionGenerationMs: total.actionGenerationMs + result.actionGenerationDurationMs,
    engineErrorCount: total.engineErrorCount + result.engineErrorCount,
    illegalActionCount: total.illegalActionCount + result.illegalActionCount,
    leadPassCount: total.leadPassCount + result.leadPassCount,
    invalidFollowCount: total.invalidFollowCount + result.invalidFollowCount,
    duplicateCardCount: total.duplicateCardCount + result.duplicateCardCount,
    missingCardCount: total.missingCardCount + result.missingCardCount,
    policyViolationCount: total.policyViolationCount + result.policyViolationCount,
    runtimePlanMismatchCount: total.runtimePlanMismatchCount + result.runtimePlanMismatchCount,
    exceededActionLimit: total.exceededActionLimit + result.exceededActionLimit,
  }), { totalDurationMs: 0, actions: 0, decisions: 0, detectGroups: 0, fullReplans: 0, planValidationCount: 0, planValidationMs: 0, plannerMs: 0, actionGenerationMs: 0, engineErrorCount: 0, illegalActionCount: 0, leadPassCount: 0, invalidFollowCount: 0, duplicateCardCount: 0, missingCardCount: 0, policyViolationCount: 0, runtimePlanMismatchCount: 0, exceededActionLimit: 0 });
  return {
    ...totals,
    averageDurationMs: average(durations), medianDurationMs: percentile(durations, 0.5), p95DurationMs: percentile(durations, 0.95), maxDurationMs: Math.max(0, ...durations),
    detectGroupsPerDecision: rate(totals.detectGroups, totals.decisions), fullReplansPerGame: rate(totals.fullReplans, results.length),
    planCandidateValidationMsPerCall: rate(totals.planValidationMs, totals.planValidationCount),
  };
}

function average(samples: number[]): number { return samples.length === 0 ? 0 : samples.reduce((total, value) => total + value, 0) / samples.length; }
function rate(numerator: number, denominator: number): number { return denominator === 0 ? 0 : numerator / denominator; }
function percentile(samples: number[], ratio: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
}
