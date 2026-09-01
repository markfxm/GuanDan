export const STRATEGIC_BUDGET_EXECUTION_V1_SCHEMA_VERSION =
  "d2h-s0.5-strategic-budget-execution-v1" as const;

export type StrategicBudgetMeasurementCompletenessV1 =
  | "EXACT"
  | "LOWER_BOUND_AT_EXHAUSTION";

export type StrategicBudgetDimensionV1 =
  | "ROUTE_CANDIDATE_COUNT"
  | "CONFLICT_EXPANSION_COUNT"
  | "COMPONENT_ENDPOINT_COUNT"
  | "EVIDENCE_COST";

export type StrategicBudgetMeasurementV1 = Readonly<{
  dimension: StrategicBudgetDimensionV1;
  limit: number;
  observedCount: number;
  measurementCompleteness: StrategicBudgetMeasurementCompletenessV1;
}>;

export type StrategicBudgetSourceKindV1 =
  | "STRATEGIC_STRUCTURE_INVENTORY"
  | "STRATEGIC_HIERARCHY_CLASSIFICATION_BATCH"
  | "STRATEGIC_RESOURCE_RESERVATION_ARTIFACT"
  | "STRATEGIC_ROUTE_GENERATION_ARTIFACT"
  | "STRATEGIC_ROUTE_UNIVERSE";

export type StrategicBudgetSourceHashBindingV1 = Readonly<{
  sourceKind: StrategicBudgetSourceKindV1;
  sourceHash: string;
}>;

export type StrategicBudgetExhaustionProvenanceV1 = Readonly<{
  exhaustedMeasurements: readonly StrategicBudgetMeasurementV1[];
  sourceHashBindings: readonly StrategicBudgetSourceHashBindingV1[];
  provenanceHash: string;
}>;

export type StrategicBudgetExecutionArtifactV1 = Readonly<{
  schemaVersion: typeof STRATEGIC_BUDGET_EXECUTION_V1_SCHEMA_VERSION;
  measurements: readonly StrategicBudgetMeasurementV1[];
  exhaustionProvenance: StrategicBudgetExhaustionProvenanceV1 | null;
  executionHash: string;
}>;

export type StrategicBudgetExecutionInputV1 = Readonly<{
  measurements: readonly StrategicBudgetMeasurementV1[];
  exhaustedDimensions: readonly StrategicBudgetDimensionV1[];
  sourceHashBindings: readonly StrategicBudgetSourceHashBindingV1[];
}>;

export type StrategicBudgetExecutionValidationReasonCodeV1 =
  | "INVALID_INPUT"
  | "UNKNOWN_DIMENSION"
  | "DUPLICATE_DIMENSION"
  | "INVALID_NUMERIC_MEASUREMENT"
  | "INVALID_MEASUREMENT_COMPLETENESS"
  | "OBSERVED_COUNT_LIMIT_MISMATCH"
  | "EXACT_EXHAUSTION_CONTRADICTION"
  | "EXHAUSTED_DIMENSION_WITHOUT_MEASUREMENT"
  | "LOWER_BOUND_WITHOUT_EXHAUSTION"
  | "DUPLICATE_EXHAUSTED_DIMENSION"
  | "UNKNOWN_EXHAUSTED_DIMENSION"
  | "INVALID_SOURCE_HASH_BINDING"
  | "CONTRADICTORY_SOURCE_HASH_BINDING";

export type StrategicBudgetExecutionValidationResultV1 =
  | Readonly<{
      validationStatus: "VALID";
      canonicalInput: StrategicBudgetExecutionInputV1;
    }>
  | Readonly<{
      validationStatus: "REJECTED";
      reasonCodes: readonly StrategicBudgetExecutionValidationReasonCodeV1[];
    }>;
