import { canonicalHash } from "./strategicEvidenceCanonicalSerializer";
import {
  STRATEGIC_BUDGET_EXECUTION_V1_SCHEMA_VERSION,
  type StrategicBudgetExecutionArtifactV1,
  type StrategicBudgetExecutionInputV1,
  type StrategicBudgetMeasurementV1,
  type StrategicBudgetSourceHashBindingV1,
  type StrategicBudgetDimensionV1,
  type StrategicBudgetExecutionValidationReasonCodeV1,
  type StrategicBudgetExecutionValidationResultV1,
} from "./strategicBudgetExecutionV1Contracts";

const BUDGET_DIMENSIONS: readonly StrategicBudgetDimensionV1[] = [
  "ROUTE_CANDIDATE_COUNT",
  "CONFLICT_EXPANSION_COUNT",
  "COMPONENT_ENDPOINT_COUNT",
  "EVIDENCE_COST",
];

const SOURCE_KINDS = new Set([
  "STRATEGIC_STRUCTURE_INVENTORY",
  "STRATEGIC_HIERARCHY_CLASSIFICATION_BATCH",
  "STRATEGIC_RESOURCE_RESERVATION_ARTIFACT",
  "STRATEGIC_ROUTE_GENERATION_ARTIFACT",
  "STRATEGIC_ROUTE_UNIVERSE",
]);

export function materializeStrategicBudgetExecutionV1(
  input: StrategicBudgetExecutionInputV1,
): StrategicBudgetExecutionArtifactV1 {
  const validation = validateStrategicBudgetExecutionV1(input);
  if (validation.validationStatus === "REJECTED") {
    throw new Error(`INVALID_BUDGET_EXECUTION_INPUT:${validation.reasonCodes.join(",")}`);
  }
  const canonicalInput = validation.canonicalInput;
  const measurements = canonicalInput.measurements;
  const exhaustedDimensionSet = new Set(canonicalInput.exhaustedDimensions);
  const exhaustedMeasurements = measurements
    .filter((measurement) => exhaustedDimensionSet.has(measurement.dimension));
  const sourceHashBindings = canonicalInput.sourceHashBindings;
  const exhaustionProvenance = exhaustedMeasurements.length === 0
    ? null
    : provenanceOf(exhaustedMeasurements, sourceHashBindings);
  const payload = {
    schemaVersion: STRATEGIC_BUDGET_EXECUTION_V1_SCHEMA_VERSION,
    measurements,
    exhaustionProvenance,
  };
  return deepFreeze({ ...payload, executionHash: canonicalHash(payload) });
}

export function validateStrategicBudgetExecutionV1(
  input: unknown,
): StrategicBudgetExecutionValidationResultV1 {
  const reasons = new Set<StrategicBudgetExecutionValidationReasonCodeV1>();
  if (!isRecord(input)
    || !Array.isArray(input.measurements)
    || !Array.isArray(input.exhaustedDimensions)
    || !Array.isArray(input.sourceHashBindings)) {
    return rejected(["INVALID_INPUT"]);
  }

  const measurements: StrategicBudgetMeasurementV1[] = [];
  const measurementByDimension = new Map<string, StrategicBudgetMeasurementV1>();
  for (const candidate of input.measurements) {
    if (!isRecord(candidate)) {
      reasons.add("INVALID_INPUT");
      continue;
    }
    const dimension = candidate.dimension;
    if (!isBudgetDimension(dimension)) {
      reasons.add("UNKNOWN_DIMENSION");
      continue;
    }
    if (measurementByDimension.has(dimension)) reasons.add("DUPLICATE_DIMENSION");
    const measurement = {
      dimension,
      limit: candidate.limit,
      observedCount: candidate.observedCount,
      measurementCompleteness: candidate.measurementCompleteness,
    } as StrategicBudgetMeasurementV1;
    if (!validCount(measurement.limit) || !validCount(measurement.observedCount)) {
      reasons.add("INVALID_NUMERIC_MEASUREMENT");
    }
    if (measurement.measurementCompleteness !== "EXACT"
      && measurement.measurementCompleteness !== "LOWER_BOUND_AT_EXHAUSTION") {
      reasons.add("INVALID_MEASUREMENT_COMPLETENESS");
    }
    measurementByDimension.set(dimension, measurement);
    measurements.push(measurement);
  }

  const exhaustedDimensions: StrategicBudgetDimensionV1[] = [];
  const exhaustedSet = new Set<string>();
  for (const candidate of input.exhaustedDimensions) {
    if (!isBudgetDimension(candidate)) {
      reasons.add("UNKNOWN_EXHAUSTED_DIMENSION");
      continue;
    }
    if (exhaustedSet.has(candidate)) reasons.add("DUPLICATE_EXHAUSTED_DIMENSION");
    exhaustedSet.add(candidate);
    exhaustedDimensions.push(candidate);
  }

  for (const dimension of exhaustedDimensions) {
    const measurement = measurementByDimension.get(dimension);
    if (measurement === undefined) {
      reasons.add("EXHAUSTED_DIMENSION_WITHOUT_MEASUREMENT");
      continue;
    }
    if (measurement.measurementCompleteness === "EXACT") {
      reasons.add("EXACT_EXHAUSTION_CONTRADICTION");
    }
    if (measurement.measurementCompleteness === "LOWER_BOUND_AT_EXHAUSTION"
      && validCount(measurement.limit)
      && validCount(measurement.observedCount)
      && measurement.observedCount <= measurement.limit) {
      reasons.add("LOWER_BOUND_WITHOUT_EXHAUSTION");
    }
  }

  for (const measurement of measurements) {
    if (!validCount(measurement.limit) || !validCount(measurement.observedCount)) continue;
    const exhausted = exhaustedSet.has(measurement.dimension);
    if (measurement.measurementCompleteness === "EXACT" && measurement.observedCount > measurement.limit) {
      reasons.add(exhausted ? "EXACT_EXHAUSTION_CONTRADICTION" : "OBSERVED_COUNT_LIMIT_MISMATCH");
    }
    if (measurement.measurementCompleteness === "LOWER_BOUND_AT_EXHAUSTION"
      && (!exhaustedSet.size || (exhausted && measurement.observedCount <= measurement.limit))) {
      reasons.add("LOWER_BOUND_WITHOUT_EXHAUSTION");
    }
  }

  const sourceHashBindings: StrategicBudgetSourceHashBindingV1[] = [];
  const sourceKindByHash = new Map<string, string>();
  for (const candidate of input.sourceHashBindings) {
    if (!isRecord(candidate)
      || typeof candidate.sourceKind !== "string"
      || !SOURCE_KINDS.has(candidate.sourceKind)
      || typeof candidate.sourceHash !== "string"
      || candidate.sourceHash.length === 0) {
      reasons.add("INVALID_SOURCE_HASH_BINDING");
      continue;
    }
    const priorKind = sourceKindByHash.get(candidate.sourceHash);
    if (priorKind !== undefined && priorKind !== candidate.sourceKind) {
      reasons.add("CONTRADICTORY_SOURCE_HASH_BINDING");
    }
    sourceKindByHash.set(candidate.sourceHash, candidate.sourceKind);
    sourceHashBindings.push({
      sourceKind: candidate.sourceKind as StrategicBudgetSourceHashBindingV1["sourceKind"],
      sourceHash: candidate.sourceHash,
    });
  }

  if (reasons.size > 0) return rejected([...reasons].sort(compareText));
  const canonicalInput: StrategicBudgetExecutionInputV1 = {
    measurements: canonicalMeasurements(measurements),
    exhaustedDimensions: [...new Set(exhaustedDimensions)].sort(compareText),
    sourceHashBindings: canonicalSourceBindings(sourceHashBindings),
  };
  return deepFreeze({ validationStatus: "VALID", canonicalInput });
}

function rejected(
  reasonCodes: readonly StrategicBudgetExecutionValidationReasonCodeV1[],
): StrategicBudgetExecutionValidationResultV1 {
  return { validationStatus: "REJECTED", reasonCodes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBudgetDimension(value: unknown): value is StrategicBudgetDimensionV1 {
  return typeof value === "string" && BUDGET_DIMENSIONS.includes(value as StrategicBudgetDimensionV1);
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function provenanceOf(
  exhaustedMeasurements: readonly StrategicBudgetMeasurementV1[],
  sourceHashBindings: readonly StrategicBudgetSourceHashBindingV1[],
) {
  const payload = { exhaustedMeasurements, sourceHashBindings };
  return { ...payload, provenanceHash: canonicalHash(payload) };
}

function canonicalMeasurements(
  measurements: readonly StrategicBudgetMeasurementV1[],
): readonly StrategicBudgetMeasurementV1[] {
  return [...measurements].sort((left, right) => compareText(left.dimension, right.dimension));
}

function canonicalSourceBindings(
  bindings: readonly StrategicBudgetSourceHashBindingV1[],
): readonly StrategicBudgetSourceHashBindingV1[] {
  return [...bindings].sort((left, right) =>
    compareText(left.sourceHash, right.sourceHash)
      || compareText(left.sourceKind, right.sourceKind));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
