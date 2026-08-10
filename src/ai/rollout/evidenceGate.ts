import type {
  RolloutContractResult,
  RolloutEvidenceRequirements,
  RolloutFailure,
  RolloutReplicateResult,
  RolloutRequestField,
} from "./contracts";
import { validateRolloutEvidenceRequirements } from "./contracts";

export type RolloutEvidenceScenario = Readonly<{
  scenarioIdentity: string;
  normalizedWeight: number;
}>;

export type RolloutEvidenceInput = Readonly<{
  requirements: RolloutEvidenceRequirements;
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  candidateIds: readonly string[];
  scenarios: readonly RolloutEvidenceScenario[];
  results: readonly RolloutReplicateResult[];
}>;

type SuccessfulRolloutReplicateResult = Extract<RolloutReplicateResult, { ok: true }>;

type ValidatedRolloutScenario = Readonly<{
  scenarioIdentity: string;
  normalizedWeight: number;
}>;

export type ValidatedRolloutEvidence = Readonly<{
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  candidateIds: readonly string[];
  scenarios: readonly ValidatedRolloutScenario[];
  results: readonly SuccessfulRolloutReplicateResult[];
}>;

export function validateRolloutEvidence(input: RolloutEvidenceInput): RolloutContractResult<ValidatedRolloutEvidence> {
  try {
    if (!isPlainDataRecord(input, [
      "requirements", "effectiveSampleSize", "acceptedScenarioCount", "replicateCountPerScenario",
      "candidateIds", "scenarios", "results",
    ], true)) return invalid("request");

    const requirementsInput = getOwnData(input, "requirements");
    const requirements = validateRolloutEvidenceRequirements(requirementsInput);
    if (!requirements.ok) return requirements;

    const effectiveSampleSize = getOwnData(input, "effectiveSampleSize");
    if (!isFiniteNonNegativeNumber(effectiveSampleSize)) return invalid("evidenceRequirements");
    if (effectiveSampleSize < requirements.value.minimumEffectiveSampleSize) {
      return {
        ok: false,
        failure: {
          kind: "effective-sample-size-too-low",
          effectiveSampleSize,
          minimumEffectiveSampleSize: requirements.value.minimumEffectiveSampleSize,
        },
      };
    }

    const acceptedScenarioCount = getOwnData(input, "acceptedScenarioCount");
    if (!isPositiveSafeInteger(acceptedScenarioCount)) return invalid("scenarioSourceInput");
    if (acceptedScenarioCount < requirements.value.minimumAcceptedScenarioCount) {
      return {
        ok: false,
        failure: {
          kind: "insufficient-scenarios",
          acceptedScenarioCount,
          minimumAcceptedScenarioCount: requirements.value.minimumAcceptedScenarioCount,
        },
      };
    }

    const replicateCountPerScenario = getOwnData(input, "replicateCountPerScenario");
    if (!isPositiveSafeInteger(replicateCountPerScenario)) return invalid("budget");
    const candidateIdsInput = getOwnData(input, "candidateIds");
    const scenariosInput = getOwnData(input, "scenarios");
    if (!isPlainDataArray(candidateIdsInput) || !isPlainDataArray(scenariosInput)) return invalid("request");
    if (scenariosInput.length !== acceptedScenarioCount) return invalid("scenarioSourceInput");

    const candidateIds = readCandidateIds(candidateIdsInput);
    if (candidateIds === undefined) return invalid("candidates");
    const scenarios = readScenarios(scenariosInput);
    if (scenarios === undefined) return scenarioSourceFailure();
    if (!isNormalizedWeightTotal(scenarios)) return scenarioSourceFailure();

    const expectedLocalCoverage = checkedProduct([scenarios.length, replicateCountPerScenario]);
    const expectedCoverage = expectedLocalCoverage === undefined
      ? undefined
      : checkedProduct([candidateIds.length, expectedLocalCoverage]);
    if (expectedCoverage === undefined) return invalidBudget("replicateCountPerScenario");

    const resultsInput = getOwnData(input, "results");
    if (!isPlainDataArray(resultsInput)) return invalid("request");
    const results: SuccessfulRolloutReplicateResult[] = [];
    for (let index = 0; index < resultsInput.length; index += 1) {
      const result = getOwnData(resultsInput, String(index));
      if (!isRolloutReplicateResult(result)) return invalid("request");
      if (!result.ok) return { ok: false, failure: { kind: "kernel-failed", failure: result.failure } };
      if (!candidateIds.includes(result.candidateId) || !scenarios.some((scenario) => scenario.scenarioIdentity === result.scenarioIdentity)) {
        return coverageFailure(expectedCoverage, results.length + 1);
      }
      results.push(result);
    }

    const scenarioIds = new Set(scenarios.map((scenario) => scenario.scenarioIdentity));
    const groups = new Map<string, SuccessfulRolloutReplicateResult[]>();
    for (const result of results) {
      const key = `${result.candidateId}\u0000${result.scenarioIdentity}`;
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [result]);
      else group.push(result);
    }

    for (const candidateId of candidateIds) {
      for (const scenarioId of scenarioIds) {
        const group = groups.get(`${candidateId}\u0000${scenarioId}`);
        if (group === undefined || group.length === 0) return coverageFailure(expectedCoverage, results.length);
        const replicateIds = new Set<string>();
        for (const result of group) {
          if (replicateIds.has(result.replicateIdentity)) return coverageFailure(expectedCoverage, results.length);
          replicateIds.add(result.replicateIdentity);
        }
        if (group.length < requirements.value.minimumCompletedReplicateCount) {
          return {
            ok: false,
            failure: {
              kind: "insufficient-replicates",
              completedReplicateCount: group.length,
              minimumCompletedReplicateCount: requirements.value.minimumCompletedReplicateCount,
            },
          };
        }
        if (requirements.value.requireCompleteCoverage && group.length !== replicateCountPerScenario) {
          return coverageFailure(expectedCoverage, results.length);
        }
      }
    }
    if (results.length !== expectedCoverage) return coverageFailure(expectedCoverage, results.length);

    const sortedScenarios = [...scenarios].sort((left, right) => compareCodeUnits(left.scenarioIdentity, right.scenarioIdentity));
    const sortedResults = [...results].sort((left, right) => compareReplicates(left, right));
    return {
      ok: true,
      value: Object.freeze({
        effectiveSampleSize,
        acceptedScenarioCount,
        replicateCountPerScenario,
        candidateIds: Object.freeze([...candidateIds].sort(compareCodeUnits)),
        scenarios: Object.freeze(sortedScenarios),
        results: Object.freeze(sortedResults),
      }),
    };
  } catch {
    return invalid("request");
  }
}

function readCandidateIds(value: readonly unknown[]): string[] | undefined {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const candidateId = getOwnData(value, String(index));
    if (typeof candidateId !== "string" || candidateId.length === 0 || seen.has(candidateId)) return undefined;
    seen.add(candidateId);
    ids.push(candidateId);
  }
  return ids.length > 0 ? ids : undefined;
}

function readScenarios(value: readonly unknown[]): ValidatedRolloutScenario[] | undefined {
  const scenarios: ValidatedRolloutScenario[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const scenario = getOwnData(value, String(index));
    if (!isPlainDataRecord(scenario, ["scenarioIdentity", "normalizedWeight", "privateState"], true)) return undefined;
    const scenarioIdentity = getOwnData(scenario, "scenarioIdentity");
    const normalizedWeight = getOwnData(scenario, "normalizedWeight");
    if (typeof scenarioIdentity !== "string" || !/^[a-f0-9]{64}$/.test(scenarioIdentity) || seen.has(scenarioIdentity)) return undefined;
    if (!isFiniteNonNegativeNumber(normalizedWeight) || Object.is(normalizedWeight, -0)) return undefined;
    seen.add(scenarioIdentity);
    scenarios.push(Object.freeze({ scenarioIdentity, normalizedWeight }));
  }
  return scenarios.length > 0 ? scenarios : undefined;
}

function isRolloutReplicateResult(value: unknown): value is RolloutReplicateResult {
  if (!isPlainDataRecord(value)) return false;
  const ok = getOwnData(value, "ok");
  if (ok === false) {
    return hasExactKeys(value, ["ok", "failure"]) && isKernelFailure(getOwnData(value, "failure"));
  }
  if (ok !== true || !hasExactKeys(value, ["ok", "candidateId", "scenarioIdentity", "replicateIdentity", "utility", "workUnits"])) return false;
  const candidateId = getOwnData(value, "candidateId");
  const scenarioIdentity = getOwnData(value, "scenarioIdentity");
  const replicateIdentity = getOwnData(value, "replicateIdentity");
  const utility = getOwnData(value, "utility");
  const workUnits = getOwnData(value, "workUnits");
  return typeof candidateId === "string"
    && candidateId.length > 0
    && typeof scenarioIdentity === "string"
    && /^[a-f0-9]{64}$/.test(scenarioIdentity)
    && typeof replicateIdentity === "string"
    && /^[a-f0-9]{64}$/.test(replicateIdentity)
    && isTeamUtility(utility)
    && isNonNegativeSafeInteger(workUnits);
}

function isKernelFailure(value: unknown): boolean {
  if (!isPlainDataRecord(value)) return false;
  const kind = getOwnData(value, "kind");
  if (kind === "budget-exhausted") {
    return hasExactKeys(value, ["kind", "workUnits", "maximumWorkUnits"])
      && isNonNegativeSafeInteger(getOwnData(value, "workUnits"))
      && isPositiveSafeInteger(getOwnData(value, "maximumWorkUnits"));
  }
  if (kind === "policy-failed") return hasExactKeys(value, ["kind", "failure"]);
  return kind === "simulation-failed" && hasExactKeys(value, ["kind", "stage"]);
}

function isTeamUtility(value: unknown): value is -3 | -2 | -1 | 1 | 2 | 3 {
  return value === -3 || value === -2 || value === -1 || value === 1 || value === 2 || value === 3;
}

function compareReplicates(left: SuccessfulRolloutReplicateResult, right: SuccessfulRolloutReplicateResult): number {
  const candidate = compareCodeUnits(left.candidateId, right.candidateId);
  if (candidate !== 0) return candidate;
  const scenario = compareCodeUnits(left.scenarioIdentity, right.scenarioIdentity);
  if (scenario !== 0) return scenario;
  return compareCodeUnits(left.replicateIdentity, right.replicateIdentity);
}

function isNormalizedWeightTotal(scenarios: readonly ValidatedRolloutScenario[]): boolean {
  const total = scenarios.reduce((sum, scenario) => sum + scenario.normalizedWeight, 0);
  return Number.isFinite(total) && Math.abs(total - 1) <= 1e-9;
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

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function coverageFailure(expected: number, actual: number): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "coverage-mismatch", expectedCoverage: expected, actualCoverage: actual } };
}

function scenarioSourceFailure(): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "scenario-source-failed", reason: "private-state-invalid" } };
}

function invalid(field: RolloutRequestField): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-request", field } };
}

function invalidBudget(field: "replicateCountPerScenario"): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-budget", field } };
}

function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || (allowedKeys !== undefined && !allowedKeys.includes(key)))) return false;
    if (exact && allowedKeys !== undefined && (ownKeys.length !== allowedKeys.length || allowedKeys.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const length = Object.getOwnPropertyDescriptor(value, "length");
    if (!isDataDescriptor(length) || !isNonNegativeSafeInteger(length.value)) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length.value + 1 || !ownKeys.includes("length")) return false;
    for (let index = 0; index < length.value; index += 1) {
      if (!ownKeys.includes(String(index)) || !isDataDescriptor(Object.getOwnPropertyDescriptor(value, String(index)))) return false;
    }
    return ownKeys.every((key) => key === "length" || (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < length.value));
  } catch {
    return false;
  }
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isPlainDataRecord(value, keys, true);
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function getOwnData(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") throw new TypeError("DATA_PROPERTY_INVALID");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!isDataDescriptor(descriptor)) throw new TypeError("DATA_PROPERTY_INVALID");
  return descriptor.value;
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
