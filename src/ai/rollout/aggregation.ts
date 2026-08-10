import type {
  CandidateRolloutSummary,
  RolloutAggregateDiagnostics,
  RolloutContractResult,
  RolloutEvidenceRequirements,
  RolloutAggregationResult,
  RolloutReplicateResult,
  RolloutRiskPolicy,
} from "./contracts";
import { validateRolloutRiskPolicy } from "./contracts";
import { validateRolloutEvidence, type RolloutEvidenceScenario, type ValidatedRolloutEvidence } from "./evidenceGate";

export type RolloutCandidateAggregation = Readonly<{
  candidateId: string;
  baselineEvaluatorScore: number;
}>;

export type RolloutAggregationInput = Readonly<{
  candidates: readonly RolloutCandidateAggregation[];
  evidence: Readonly<{
    requirements: RolloutEvidenceRequirements;
    effectiveSampleSize: number;
    acceptedScenarioCount: number;
    replicateCountPerScenario: number;
    candidateIds: readonly string[];
    scenarios: readonly RolloutEvidenceScenario[];
    results: readonly RolloutReplicateResult[];
  }>;
  riskPolicy: RolloutRiskPolicy;
}>;

export type RolloutAggregationOutput = Readonly<{
  summaries: readonly CandidateRolloutSummary[];
  diagnostics: RolloutAggregateDiagnostics;
}>;

export function aggregateRolloutCandidates(input: RolloutAggregationInput): RolloutContractResult<RolloutAggregationOutput> {
  try {
    const evidence = validateRolloutEvidence(input.evidence);
    if (!evidence.ok) return evidence;
    const riskPolicy = validateRolloutRiskPolicy(input.riskPolicy);
    if (!riskPolicy.ok) return riskPolicy;
    if (!Array.isArray(input.candidates) || input.candidates.length === 0) return invalid("candidates");

    const candidates = [...input.candidates].sort((left, right) => compareCodeUnits(left.candidateId, right.candidateId));
    const candidateIds = new Set<string>();
    for (const candidate of candidates) {
      if (!isPlainDataRecord(candidate, ["candidateId", "baselineEvaluatorScore"], true)
        || typeof candidate.candidateId !== "string"
        || candidate.candidateId.length === 0
        || candidateIds.has(candidate.candidateId)
        || typeof candidate.baselineEvaluatorScore !== "number"
        || !Number.isFinite(candidate.baselineEvaluatorScore)) {
        return invalid("candidates");
      }
      candidateIds.add(candidate.candidateId);
    }
    if (candidateIds.size !== evidence.value.candidateIds.length || evidence.value.candidateIds.some((candidateId) => !candidateIds.has(candidateId))) {
      return invalid("candidates");
    }

    const summaries: CandidateRolloutSummary[] = [];
    for (const candidate of candidates) {
      const summary = aggregateCandidateRollout({ candidate, evidence: evidence.value, riskPolicy: riskPolicy.value });
      if (!summary.ok) return { ok: false, failure: { kind: "aggregation-failed", failure: summary.failure } };
      summaries.push(summary.summary);
    }

    const expectedLocalCoverage = checkedProduct([evidence.value.scenarios.length, evidence.value.replicateCountPerScenario]);
    const expectedAggregateCoverage = expectedLocalCoverage === undefined
      ? undefined
      : checkedProduct([candidates.length, expectedLocalCoverage]);
    const completedReplicateCount = checkedSum(summaries.map((summary) => summary.completedReplicateCount));
    const workUnitCount = checkedSum(summaries.map((summary) => summary.workUnitCount));
    if (expectedLocalCoverage === undefined || expectedAggregateCoverage === undefined || completedReplicateCount === undefined || workUnitCount === undefined) {
      return invalid("aggregateDiagnostics");
    }

    return {
      ok: true,
      value: Object.freeze({
        summaries: Object.freeze(summaries),
        diagnostics: Object.freeze({
          effectiveSampleSize: evidence.value.effectiveSampleSize,
          acceptedScenarioCount: evidence.value.acceptedScenarioCount,
          replicateCountPerScenario: evidence.value.replicateCountPerScenario,
          completedReplicateCount,
          expectedCompletedReplicateCount: expectedAggregateCoverage,
          candidateCount: candidates.length,
          workUnitCount,
          coverage: "complete" as const,
        }),
      }),
    };
  } catch {
    return invalid("request");
  }
}

export type RolloutCandidateAggregationInput = Readonly<{
  candidate: RolloutCandidateAggregation;
  evidence: ValidatedRolloutEvidence;
  riskPolicy: RolloutRiskPolicy;
}>;

export function aggregateCandidateRollout(input: RolloutCandidateAggregationInput): RolloutAggregationResult {
  try {
    const { candidate, evidence, riskPolicy } = input;
    const candidateResults = evidence.results.filter((result) => result.candidateId === candidate.candidateId);
    const expectedLocalCoverage = checkedProduct([evidence.scenarios.length, evidence.replicateCountPerScenario]);
    if (expectedLocalCoverage === undefined || candidateResults.length !== expectedLocalCoverage) {
      return { ok: false, failure: { kind: "coverage-mismatch", expected: expectedLocalCoverage ?? Number.MAX_SAFE_INTEGER, actual: candidateResults.length } };
    }

    const scenarios = [...evidence.scenarios].sort((left, right) => compareCodeUnits(left.scenarioIdentity, right.scenarioIdentity));
    const replicatesByScenario = new Map<string, ValidatedRolloutEvidence["results"][number][]>();
    for (const result of candidateResults) {
      const group = replicatesByScenario.get(result.scenarioIdentity);
      if (group === undefined) replicatesByScenario.set(result.scenarioIdentity, [result]);
      else group.push(result);
    }
    const denominator = sumScenarioWeights(scenarios, evidence.replicateCountPerScenario);
    if (!Number.isFinite(denominator) || denominator <= 0) return nonFinite("expectedUtility");

    let weightedUtilityTotal = 0;
    let workUnitCount = 0;
    for (const scenario of scenarios) {
      const replicates = replicatesByScenario.get(scenario.scenarioIdentity);
      if (replicates === undefined || replicates.length !== evidence.replicateCountPerScenario) {
        return { ok: false, failure: { kind: "coverage-mismatch", expected: evidence.replicateCountPerScenario, actual: replicates?.length ?? 0 } };
      }
      for (const replicate of [...replicates].sort((left, right) => compareCodeUnits(left.replicateIdentity, right.replicateIdentity))) {
        weightedUtilityTotal += scenario.normalizedWeight * replicate.utility;
        const nextWork = checkedSum([workUnitCount, replicate.workUnits]);
        if (nextWork === undefined) return { ok: false, failure: { kind: "coverage-mismatch", expected: Number.MAX_SAFE_INTEGER, actual: Number.MAX_SAFE_INTEGER } };
        workUnitCount = nextWork;
      }
    }

    const expectedUtility = weightedUtilityTotal / denominator;
    if (!Number.isFinite(expectedUtility)) return nonFinite("expectedUtility");
    let weightedVarianceTotal = 0;
    let weightedDownsideTotal = 0;
    for (const scenario of scenarios) {
      const replicates = replicatesByScenario.get(scenario.scenarioIdentity)!;
      for (const replicate of [...replicates].sort((left, right) => compareCodeUnits(left.replicateIdentity, right.replicateIdentity))) {
        const difference = replicate.utility - expectedUtility;
        weightedVarianceTotal += scenario.normalizedWeight * difference * difference;
        weightedDownsideTotal += scenario.normalizedWeight * Math.max(0, expectedUtility - replicate.utility);
      }
    }
    const variance = weightedVarianceTotal / denominator;
    const risk = weightedDownsideTotal / denominator;
    const riskAdjustedUtility = expectedUtility
      - riskPolicy.variancePenalty * Math.sqrt(variance)
      - riskPolicy.downsideRiskPenalty * risk;
    if (![variance, risk, riskAdjustedUtility].every(Number.isFinite)) return nonFinite("risk");
    if (variance < 0 || risk < 0) return nonFinite(variance < 0 ? "variance" : "risk");

    return {
      ok: true,
      summary: Object.freeze({
        candidateId: candidate.candidateId,
        riskAdjustedUtility,
        expectedUtility,
        variance,
        risk,
        baselineEvaluatorScore: candidate.baselineEvaluatorScore,
        acceptedScenarioCount: evidence.acceptedScenarioCount,
        replicateCountPerScenario: evidence.replicateCountPerScenario,
        expectedReplicateCount: expectedLocalCoverage,
        completedReplicateCount: candidateResults.length,
        workUnitCount,
      }),
    };
  } catch {
    return { ok: false, failure: { kind: "non-finite-aggregate", field: "risk" } };
  }
}

function sumScenarioWeights(scenarios: ValidatedRolloutEvidence["scenarios"], replicateCountPerScenario: number): number {
  let denominator = 0;
  for (const scenario of scenarios) denominator += scenario.normalizedWeight * replicateCountPerScenario;
  return denominator;
}

function nonFinite(field: "expectedUtility" | "variance" | "risk"): RolloutAggregationResult {
  return { ok: false, failure: { kind: "non-finite-aggregate", field } };
}

function invalid(field: "request" | "candidates" | "aggregateDiagnostics"): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-request", field } };
}

function checkedProduct(values: readonly number[]): number | undefined {
  let product = 1;
  for (const value of values) {
    if (!isNonNegativeSafeInteger(value)) return undefined;
    if (value !== 0 && product > Number.MAX_SAFE_INTEGER / value) return undefined;
    product *= value;
  }
  return Number.isSafeInteger(product) ? product : undefined;
}

function checkedSum(values: readonly number[]): number | undefined {
  let sum = 0;
  for (const value of values) {
    if (!isNonNegativeSafeInteger(value) || sum > Number.MAX_SAFE_INTEGER - value) return undefined;
    sum += value;
  }
  return sum;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function isPlainDataRecord(value: unknown, allowedKeys: readonly string[], exact: boolean): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))) return false;
  if (exact && (ownKeys.length !== allowedKeys.length || allowedKeys.some((key) => !ownKeys.includes(key)))) return false;
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
