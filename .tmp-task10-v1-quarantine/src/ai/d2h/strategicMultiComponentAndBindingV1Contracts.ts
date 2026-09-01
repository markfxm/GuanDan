import type {
  StrategicRouteCandidateFactV1,
  StrategicRouteGenerationArtifactV1,
} from "./strategicRouteCandidateFactsV1Contracts";
import type { StrategicBudgetExecutionArtifactV1 } from
  "./strategicBudgetExecutionV1Contracts";

export const STRATEGIC_MULTI_COMPONENT_AND_BINDING_V1_SCHEMA_VERSION =
  "d2h-s0.5-strategic-multi-component-and-binding-v1" as const;

export type StrategicMultiComponentAndBindingBudgetV1 = Readonly<{
  maxComponentEndpointCount: number;
  maxEvidenceCost: number;
}>;

export type StrategicMultiComponentAndBindingBudgetDimensionV1 =
  | "MAX_COMPONENT_ENDPOINT_COUNT"
  | "MAX_EVIDENCE_COST";

export type StrategicMultiComponentAndBindingReasonCodeV1 =
  | "INVALID_BUDGET"
  | "INSUFFICIENT_COMPONENT_COUNT"
  | "INCOMPLETE_SOURCE_ARTIFACT"
  | "SOURCE_VALIDATION_BUDGET_EXHAUSTED"
  | "SOURCE_ARTIFACT_INTEGRITY_MISMATCH"
  | "SOURCE_HASH_PAYLOAD_MISMATCH"
  | "ROUTE_ID_HASH_CONFLICT"
  | "SOURCE_BINDING_MISMATCH"
  | "DUPLICATE_RESOURCE_COMPONENT"
  | "CROSS_COMPONENT_PHYSICAL_OVERLAP"
  | "CROSS_COMPONENT_WILDCARD_OVERLAP"
  | "MAX_COMPONENT_ENDPOINT_COUNT_EXHAUSTED"
  | "MAX_EVIDENCE_COST_EXHAUSTED";

export type StrategicComponentRouteFactSetV1 = Readonly<{
  resourceComponentId: string;
  sourceArtifactHash: string;
  sourceRouteUniverseHash: string;
  routeCandidates: readonly StrategicRouteCandidateFactV1[];
  routeCount: number;
  physicalCardIds: readonly string[];
  wildcardCardIds: readonly string[];
  componentFactHash: string;
}>;

export type StrategicRouteFactReferenceV1 = Readonly<{
  routeId: string;
  routeHash: string;
}>;

export type StrategicComponentAndEndpointReferenceV1 = Readonly<{
  componentEndpointId: string;
  resourceComponentId: string;
  sourceArtifactHash: string;
  sourceRouteUniverseHash: string;
  routeReferences: readonly StrategicRouteFactReferenceV1[];
  andComponentSetHash: string;
  endpointHash: string;
  semanticBoundary: "COMPONENT_AND_ENDPOINT_REFERENCE_NOT_ROUTE_SELECTION";
}>;

export type StrategicMultiComponentAndBindingBudgetObservationV1 = Readonly<{
  observedComponentEndpointCount: number;
  observedEvidenceCost: number;
  measurementCompleteness: "EXACT" | "LOWER_BOUND_AT_EXHAUSTION";
}>;

export type StrategicMultiComponentAndBindingArtifactV1 = Readonly<{
  schemaVersion: typeof STRATEGIC_MULTI_COMPONENT_AND_BINDING_V1_SCHEMA_VERSION;
  identityHash: string;
  snapshotHash: string;
  sourceRootHash: string;
  provenanceRoot: string;
  budget: StrategicMultiComponentAndBindingBudgetV1;
  bindingStatus: "COMPLETE" | "INCONCLUSIVE" | "REJECTED";
  componentRouteFacts: readonly StrategicComponentRouteFactSetV1[] | null;
  andEndpointReferences: readonly StrategicComponentAndEndpointReferenceV1[] | null;
  componentEndpointCount: number;
  evidenceCost: number;
  budgetObservation: StrategicMultiComponentAndBindingBudgetObservationV1;
  budgetExecution: StrategicBudgetExecutionArtifactV1;
  exhaustedDimensions: readonly StrategicMultiComponentAndBindingBudgetDimensionV1[];
  reasonCodes: readonly StrategicMultiComponentAndBindingReasonCodeV1[];
  componentIds: readonly string[] | null;
  andComponentSetHash: string | null;
  sourceArtifactHashes: readonly string[];
  sourceRouteUniverseHashes: readonly string[];
  routeUniverseHash: string | null;
  semanticBoundary: "MULTI_COMPONENT_AND_BINDING_FACTS_NOT_AI_DECISION";
  artifactHash: string;
}>;

export type StrategicMultiComponentAndBindingInputV1 = Readonly<{
  sourceArtifacts: readonly StrategicRouteGenerationArtifactV1[];
  budget: StrategicMultiComponentAndBindingBudgetV1;
}>;

export type StrategicMultiComponentAndEndpointBinderV1 = (
  input: StrategicMultiComponentAndBindingInputV1,
) => StrategicMultiComponentAndBindingArtifactV1;
