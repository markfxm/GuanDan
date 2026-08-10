import type {
  CandidateRolloutSummary,
  RolloutAggregateDiagnostics,
  RolloutContractResult,
  RolloutResult,
} from "./contracts";
import { createRolloutResult } from "./contracts";

export type RolloutRankingFailure = Readonly<{
  kind: "invalid-ranking";
  reason: "malformed-summary" | "non-finite-score" | "duplicate-candidate";
}>;

export type RolloutRankingResult =
  | Readonly<{ ok: true; ranking: readonly string[] }>
  | Readonly<{ ok: false; failure: RolloutRankingFailure }>;

export function rankCandidateRollouts(summaries: readonly CandidateRolloutSummary[]): RolloutRankingResult {
  try {
    if (!Array.isArray(summaries) || summaries.length === 0) return invalid("malformed-summary");
    const seen = new Set<string>();
    for (const summary of summaries) {
      if (!isCandidateSummary(summary)) return invalid("malformed-summary");
      if (seen.has(summary.candidateId)) return invalid("duplicate-candidate");
      seen.add(summary.candidateId);
    }
    const ordered = [...summaries].sort(compareSummaries);
    return Object.freeze({ ok: true as const, ranking: Object.freeze(ordered.map((summary) => summary.candidateId)) });
  } catch {
    return invalid("malformed-summary");
  }
}

export function assembleRankedRolloutResult(
  requestInput: unknown,
  assembly: Readonly<{
    candidateSummaries: readonly CandidateRolloutSummary[];
    aggregateDiagnostics: RolloutAggregateDiagnostics;
  }>,
): RolloutContractResult<RolloutResult> {
  try {
    const ranking = rankCandidateRollouts(assembly.candidateSummaries);
    if (!ranking.ok) return { ok: false, failure: { kind: "invalid-request", field: "ranking" } };
    return createRolloutResult(requestInput, {
      candidateSummaries: assembly.candidateSummaries,
      ranking: ranking.ranking,
      aggregateDiagnostics: assembly.aggregateDiagnostics,
    });
  } catch {
    return { ok: false, failure: { kind: "invalid-request", field: "assemblyInput" } };
  }
}

function isCandidateSummary(value: unknown): value is CandidateRolloutSummary {
  if (!isPlainDataRecord(value, [
    "candidateId", "riskAdjustedUtility", "expectedUtility", "variance", "risk", "baselineEvaluatorScore",
    "acceptedScenarioCount", "replicateCountPerScenario", "expectedReplicateCount", "completedReplicateCount", "workUnitCount",
  ], true)) return false;
  const summary = value as Record<string, unknown>;
  if (typeof summary.candidateId !== "string" || summary.candidateId.length === 0) return false;
  for (const field of ["riskAdjustedUtility", "expectedUtility", "baselineEvaluatorScore"] as const) {
    if (typeof summary[field] !== "number" || !Number.isFinite(summary[field])) return false;
  }
  for (const field of ["variance", "risk"] as const) {
    if (typeof summary[field] !== "number" || !Number.isFinite(summary[field]) || summary[field] < 0) return false;
  }
  for (const field of ["acceptedScenarioCount", "replicateCountPerScenario", "expectedReplicateCount", "completedReplicateCount", "workUnitCount"] as const) {
    if (!isNonNegativeSafeInteger(summary[field])) return false;
  }
  const acceptedScenarioCount = summary.acceptedScenarioCount;
  const replicateCountPerScenario = summary.replicateCountPerScenario;
  return typeof acceptedScenarioCount === "number"
    && typeof replicateCountPerScenario === "number"
    && acceptedScenarioCount > 0
    && replicateCountPerScenario > 0;
}

function compareSummaries(left: CandidateRolloutSummary, right: CandidateRolloutSummary): number {
  if (left.riskAdjustedUtility !== right.riskAdjustedUtility) return right.riskAdjustedUtility - left.riskAdjustedUtility;
  if (left.expectedUtility !== right.expectedUtility) return right.expectedUtility - left.expectedUtility;
  if (left.baselineEvaluatorScore !== right.baselineEvaluatorScore) return right.baselineEvaluatorScore - left.baselineEvaluatorScore;
  return compareCodeUnits(left.candidateId, right.candidateId);
}

function invalid(reason: RolloutRankingFailure["reason"]): RolloutRankingResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "invalid-ranking" as const, reason }) });
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function isPlainDataRecord(value: unknown, keys: readonly string[], exact: boolean): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) return false;
  if (exact && (ownKeys.length !== keys.length || keys.some((key) => !ownKeys.includes(key)))) return false;
  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
  });
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return left.length - right.length;
}
