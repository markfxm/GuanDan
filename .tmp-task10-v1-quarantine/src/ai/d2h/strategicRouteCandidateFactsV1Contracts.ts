import type {
  StrategicControlRankV1,
  StrategicEfficiencyRankV1,
  StrategicHierarchyClassificationBatchV1,
  StrategicHierarchyTierV1,
  StrategicReservationClassV1,
} from "./strategicHierarchyClassifierV1Contracts";
import type {
  StrategicReservationClaimRoleV1,
  StrategicResourceReservationArtifactV1,
  StrategicWildcardAllocationLineageV1,
} from "./strategicResourceReservationV1Contracts";
import type { StrategicBudgetExecutionArtifactV1 } from
  "./strategicBudgetExecutionV1Contracts";

export const STRATEGIC_ROUTE_GENERATION_V1_SCHEMA_VERSION =
  "d2h-s0.5-strategic-route-generation-v1" as const;

export type StrategicRouteClassV1 =
  | "CONTROL_PRESERVATION"
  | "EFFICIENCY_RELEASE"
  | "LEVEL_DEFENSE_PRESERVATION";

export type StrategicRoutePreservationFactCodeV1 =
  | "CONTROL_RESOURCE_PRESERVED"
  | "LEVEL_RANK_DEFENSE_PRESERVED"
  | "WILDCARD_ALLOCATION_FIXED"
  | "HIGHER_TIER_RELEASE_WITNESSED";

export type StrategicRouteGenerationBudgetV1 = Readonly<{
  maxRouteCount: number;
  maxConflictExpansion: number;
  maxEvidenceCost: number;
}>;

export type StrategicRouteBudgetDimensionV1 =
  | "MAX_ROUTE_COUNT"
  | "MAX_CONFLICT_EXPANSION"
  | "MAX_EVIDENCE_COST";

export type StrategicRouteGenerationReasonCodeV1 =
  | "INVALID_BUDGET"
  | "INPUT_BINDING_MISMATCH"
  | "RESERVATION_REPLAY_MISMATCH"
  | "SOURCE_HASH_PAYLOAD_MISMATCH"
  | "SOURCE_BINDING_MISMATCH"
  | "SOURCE_VALIDATION_BUDGET_EXHAUSTED"
  | "MULTIPLE_RESOURCE_COMPONENTS_UNSUPPORTED_C1"
  | "MISSING_FACT_REFERENCE"
  | "BRANCH_LOCAL_RESOLUTION_UNPROVEN"
  | "INCOMPLETE_COMPONENT_ACCOUNTING"
  | "DUPLICATE_PHYSICAL_CARD_ALLOCATION"
  | "DUPLICATE_WILDCARD_ALLOCATION"
  | "UNFIXED_WILDCARD_ALLOCATION"
  | "UNRELEASED_HIGHER_TIER_RESOURCE"
  | "MAX_ROUTE_COUNT_EXHAUSTED"
  | "MAX_CONFLICT_EXPANSION_EXHAUSTED"
  | "MAX_EVIDENCE_COST_EXHAUSTED";

export type StrategicRouteHierarchyFactRefV1 = Readonly<{
  familyId: string;
  classificationHash: string;
}>;

export type StrategicRouteReservationFactRefV1 = Readonly<{
  reservationFactId: string;
  alternativeReservationFactIds: readonly string[];
}>;

export type StrategicRouteResourceClaimV1 = Readonly<{
  claimId: string;
  familyId: string;
  memberIds: readonly string[];
  resourceUnitIds: readonly string[];
  alternativeReservationFactIds: readonly string[];
  hierarchyTier: StrategicHierarchyTierV1;
  controlRank: StrategicControlRankV1;
  efficiencyRank: StrategicEfficiencyRankV1;
  reservationClass: StrategicReservationClassV1;
  claimRoles: readonly StrategicReservationClaimRoleV1[];
  physicalCardIds: readonly string[];
  wildcardCardIds: readonly string[];
  wildcardAllocationLineage: readonly StrategicWildcardAllocationLineageV1[];
  claimHash: string;
}>;

export type StrategicRouteBranchLocalAllocationV1 = Readonly<{
  alternativeReservationFactId: string;
  alternativeHash: string;
  resourceUnitId: string;
  physicalCardIds: readonly string[];
  wildcardCardIds: readonly string[];
  wildcardAllocationLineage: readonly StrategicWildcardAllocationLineageV1[];
  allocationHash: string;
}>;

export type StrategicRouteBranchLocalResolutionWitnessV1 = Readonly<{
  witnessKind: "BRANCH_LOCAL_RESOLUTION";
  conflictFactId: string;
  selectedAlternativeReservationFactIds: readonly string[];
  allocations: readonly StrategicRouteBranchLocalAllocationV1[];
  witnessHash: string;
}>;

export type StrategicRouteEndpointFactsV1 = Readonly<{
  routeClasses: readonly StrategicRouteClassV1[];
  resourceComponentId: string;
  closedThroughTier: StrategicHierarchyTierV1;
  accountedPhysicalCardIds: readonly string[];
  remainderPhysicalCardIds: readonly string[];
  exactHandCountReduction: number;
  preservationFactCodes: readonly StrategicRoutePreservationFactCodeV1[];
  independentComponentIds: readonly string[];
  endpointHash: string;
}>;

export type StrategicRouteCandidateFactV1 = Readonly<{
  routeId: string;
  supportingHierarchyFacts: readonly StrategicRouteHierarchyFactRefV1[];
  supportingReservationFacts: readonly StrategicRouteReservationFactRefV1[];
  resourceClaims: readonly StrategicRouteResourceClaimV1[];
  preservedResources: readonly string[];
  /** "Consumed" means allocated/committed to this local route, not played or removed from hand. */
  consumedResources: readonly string[];
  unresolvedConflicts: readonly string[];
  branchLocalResolutionWitnesses: readonly StrategicRouteBranchLocalResolutionWitnessV1[];
  endpointFacts: StrategicRouteEndpointFactsV1;
  routeHash: string;
  semanticBoundary: "STRATEGIC_ROUTE_CANDIDATE_FACT_NOT_DECISION";
}>;

export type StrategicRouteBudgetObservationV1 = Readonly<{
  observedRouteCount: number;
  observedConflictExpansionCount: number;
  observedEvidenceCost: number;
  generationWorkObservedCount: number;
  measurementCompleteness: "EXACT" | "LOWER_BOUND_AT_EXHAUSTION";
}>;

export type StrategicRouteGenerationArtifactV1 = Readonly<{
  schemaVersion: typeof STRATEGIC_ROUTE_GENERATION_V1_SCHEMA_VERSION;
  identityHash: string;
  snapshotHash: string;
  sourceRootHash: string;
  provenanceRoot: string;
  sourceInventoryHash: string;
  sourceHierarchyBatchHash: string;
  sourceReservationArtifactHash: string;
  budget: StrategicRouteGenerationBudgetV1;
  generationStatus: "COMPLETE" | "INCONCLUSIVE" | "REJECTED";
  routeCandidates: readonly StrategicRouteCandidateFactV1[] | null;
  routeCount: number;
  conflictExpansionCount: number;
  evidenceCost: number;
  generationWorkObservedCount: number;
  budgetObservation: StrategicRouteBudgetObservationV1;
  budgetExecution: StrategicBudgetExecutionArtifactV1;
  exhaustedDimensions: readonly StrategicRouteBudgetDimensionV1[];
  reasonCodes: readonly StrategicRouteGenerationReasonCodeV1[];
  routeUniverseHash: string | null;
  semanticBoundary: "ROUTE_CANDIDATE_FACTS_NOT_AI_DECISION";
  artifactHash: string;
}>;

export type StrategicRouteGeneratorInputV1 = Readonly<{
  hierarchyBatch: StrategicHierarchyClassificationBatchV1;
  reservationArtifact: StrategicResourceReservationArtifactV1;
  budget: StrategicRouteGenerationBudgetV1;
}>;

export type StrategicRouteCandidateFactsGeneratorV1 = (
  input: StrategicRouteGeneratorInputV1,
) => StrategicRouteGenerationArtifactV1;
