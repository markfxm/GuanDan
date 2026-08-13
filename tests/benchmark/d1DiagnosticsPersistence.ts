import { aggregateD1PlanSelectionDiagnostics, createAiPlanningDiagnostics, type AiPlanningDiagnostics, type D1NumericStats, type D1Rate } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { D1_DIAGNOSTICS_SCHEMA } from "./d1ProvenanceV2";

export interface PersistedD1Diagnostics {
  schemaVersion: typeof D1_DIAGNOSTICS_SCHEMA;
  applicable: boolean;
  totals?: Partial<{
    dynamicDecisionDenominator: number;
    forcedSwitchCount: number;
    strategicSwitchCount: number;
    suppressedStrategicDecisionCount: number;
    strategicConsiderationDenominator: number;
    strategicSwitchDenominator: number;
    recentStrategicReturnSwitchCount: number;
    tieKeptActiveCount: number;
  }>;
  reasonCounts?: Record<string, number>;
  candidateCountSummary?: D1NumericStats;
  decisionIndicesSinceLastSwitchSummary?: D1NumericStats;
}

export interface PersistedD1DiagnosticsAggregate {
  schemaVersion: typeof D1_DIAGNOSTICS_SCHEMA;
  totals: NonNullable<PersistedD1Diagnostics["totals"]>;
  rates: {
    forcedSwitchRate: D1Rate;
    strategicSwitchRate: D1Rate;
    switchSuppressionRate: D1Rate;
    AToBToARate: D1Rate;
  };
  reasonCounts: Record<string, number>;
  candidateCountSummary: D1NumericStats;
  decisionIndicesSinceLastSwitchSummary: D1NumericStats;
}

const ZERO_TOTALS: NonNullable<PersistedD1Diagnostics["totals"]> = {
  dynamicDecisionDenominator: 0,
  forcedSwitchCount: 0,
  strategicSwitchCount: 0,
  suppressedStrategicDecisionCount: 0,
  strategicConsiderationDenominator: 0,
  strategicSwitchDenominator: 0,
  recentStrategicReturnSwitchCount: 0,
  tieKeptActiveCount: 0,
};

const EMPTY_STATS: D1NumericStats = { count: 0, min: null, max: null, mean: null, p50: null, p95: null };

export function aggregatePersistedD1Diagnostics(values: readonly PersistedD1Diagnostics[]): PersistedD1DiagnosticsAggregate {
  const applicable = values.filter((value) => value.applicable);
  const totals = applicable.reduce((sum, value) => addTotals(sum, value.totals), { ...ZERO_TOTALS });
  const reasonCounts: Record<string, number> = {};
  for (const value of applicable) for (const [reason, count] of Object.entries(value.reasonCounts ?? {})) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + count;
  return {
    schemaVersion: D1_DIAGNOSTICS_SCHEMA,
    totals,
    rates: {
      forcedSwitchRate: rate(totals.forcedSwitchCount ?? 0, totals.dynamicDecisionDenominator ?? 0),
      strategicSwitchRate: rate(totals.strategicSwitchCount ?? 0, totals.dynamicDecisionDenominator ?? 0),
      switchSuppressionRate: rate(totals.suppressedStrategicDecisionCount ?? 0, totals.strategicConsiderationDenominator ?? 0),
      AToBToARate: rate(totals.recentStrategicReturnSwitchCount ?? 0, totals.strategicSwitchDenominator ?? 0),
    },
    reasonCounts,
    candidateCountSummary: mergeStats(applicable.flatMap((value) => value.candidateCountSummary === undefined ? [] : [value.candidateCountSummary])),
    decisionIndicesSinceLastSwitchSummary: mergeStats(applicable.flatMap((value) => value.decisionIndicesSinceLastSwitchSummary === undefined ? [] : [value.decisionIndicesSinceLastSwitchSummary])),
  };
}

export function summarizeAiD1Diagnostics(values: readonly AiPlanningDiagnostics[]): PersistedD1Diagnostics {
  const combined = createAiPlanningDiagnostics();
  combined.d1PlanSelectionRecords = values.flatMap((value) => value.d1PlanSelectionRecords);
  const error = values.find((value) => value.d1DiagnosticsError)?.d1DiagnosticsError;
  if (error !== undefined) combined.d1DiagnosticsError = error;
  const aggregate = aggregateD1PlanSelectionDiagnostics(combined);
  return {
    schemaVersion: D1_DIAGNOSTICS_SCHEMA,
    applicable: true,
    totals: {
      dynamicDecisionDenominator: aggregate.dynamicDecisionDenominator,
      forcedSwitchCount: aggregate.forcedSwitchCount,
      strategicSwitchCount: aggregate.strategicSwitchCount,
      suppressedStrategicDecisionCount: aggregate.switchSuppressedByCooldown + aggregate.switchSuppressedByHysteresis,
      strategicConsiderationDenominator: aggregate.planSwitchConsideredCount,
      strategicSwitchDenominator: aggregate.strategicSwitchCount,
      recentStrategicReturnSwitchCount: aggregate.recentStrategicReturnSwitchCount,
      tieKeptActiveCount: aggregate.tieKeptActiveCount,
    },
    reasonCounts: aggregate.switchReasonCounts,
    candidateCountSummary: aggregate.planCandidateCount,
    decisionIndicesSinceLastSwitchSummary: aggregate.decisionIndicesSinceLastSwitch,
  };
}

function addTotals(left: NonNullable<PersistedD1DiagnosticsAggregate["totals"]>, right: PersistedD1Diagnostics["totals"] | undefined): NonNullable<PersistedD1DiagnosticsAggregate["totals"]> {
  if (right === undefined) return left;
  for (const key of Object.keys(left) as Array<keyof typeof left>) {
    const value = right[key];
    left[key] = left[key]! + (value ?? 0);
  }
  return left;
}

function rate(numerator: number, denominator: number): D1Rate { return { numerator, denominator, rate: denominator === 0 ? null : round6(numerator / denominator) }; }

function mergeStats(values: readonly D1NumericStats[]): D1NumericStats {
  const valid = values.filter((value) => value.count > 0 && value.min !== null && value.max !== null && value.mean !== null);
  if (valid.length === 0) return { ...EMPTY_STATS };
  const count = valid.reduce((sum, value) => sum + value.count, 0);
  return {
    count,
    min: Math.min(...valid.map((value) => value.min!)),
    max: Math.max(...valid.map((value) => value.max!)),
    mean: round6(valid.reduce((sum, value) => sum + value.mean! * value.count, 0) / count),
    p50: null,
    p95: null,
  };
}

function round6(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
