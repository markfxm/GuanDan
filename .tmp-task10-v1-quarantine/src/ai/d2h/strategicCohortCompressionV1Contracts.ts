import type { GroupType } from "../../engine/groups";
import type {
  StrategicControlRankV1,
  StrategicEfficiencyRankV1,
  StrategicHierarchyClassificationBatchV1,
  StrategicHierarchyTierV1,
  StrategicLevelRankRelationV1,
  StrategicReservationClassV1,
  StrategicResourceImportanceV1,
} from "./strategicHierarchyClassifierV1Contracts";
import type {
  StrategicReservationClaimRoleV1,
  StrategicReservationConflictKindV1,
  StrategicReservationStateV1,
  StrategicResourceReservationArtifactV1,
} from "./strategicResourceReservationV1Contracts";
import type {
  StrategicRouteClassV1,
  StrategicRouteGenerationArtifactV1,
  StrategicRoutePreservationFactCodeV1,
} from "./strategicRouteCandidateFactsV1Contracts";
import type { StrategicMultiComponentAndBindingArtifactV1 } from
  "./strategicMultiComponentAndBindingV1Contracts";
import type { StrategicBudgetMeasurementCompletenessV1 } from
  "./strategicBudgetExecutionV1Contracts";

export const STRATEGIC_COHORT_COMPRESSION_V1_SCHEMA_VERSION =
  "d2h-s0.5-hierarchical-strategic-cohort-compression-v1" as const;

export const HARD_MAX_COHORT_COUNT_V1 = 49 as const;

export type StrategicCohortCompressionStatusV1 =
  | "COMPLETE"
  | "INCONCLUSIVE"
  | "REJECTED";

export type StrategicCohortCompressionEvidenceBudgetV1 = Readonly<{
  maxMemberEnvelopeCount: number;
  maxResourceRoleSlotCount: number;
  maxConflictClosureEdgeCount: number;
  maxRouteMappingCount: number;
  maxEquivalenceProofCount: number;
  maxLineageOccurrenceWitnessCount: number;
}>;

export type StrategicCohortBudgetDimensionV1 =
  | "COHORT_COUNT"
  | "MEMBER_ENVELOPE_COUNT"
  | "RESOURCE_ROLE_SLOT_COUNT"
  | "CONFLICT_CLOSURE_EDGE_COUNT"
  | "ROUTE_MAPPING_COUNT"
  | "EQUIVALENCE_PROOF_COUNT"
  | "LINEAGE_OCCURRENCE_WITNESS_COUNT";

export type StrategicCohortCompressionReasonCodeV1 =
  | "INVALID_BUDGET"
  | "EMPTY_SOURCE_ROUTE_UNIVERSE"
  | "SOURCE_BINDING_INCOMPLETE"
  | "SOURCE_BINDING_MISMATCH"
  | "SOURCE_HASH_PAYLOAD_MISMATCH"
  | "MISSING_COMPONENT_SOURCE"
  | "EXTRA_COMPONENT_SOURCE"
  | "DUPLICATE_RESOURCE_COMPONENT"
  | "ROUTE_ID_HASH_CONFLICT"
  | "MEMBER_ENVELOPE_HASH_CONFLICT"
  | "SIGNATURE_HASH_PAYLOAD_CONFLICT"
  | "OCCURRENCE_KEY_PAYLOAD_CONFLICT"
  | "MISSING_STRENGTH_INTERFACE"
  | "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN"
  | "INCOMPLETE_RESOURCE_ROLE_ACCOUNTING"
  | "MISSING_WILDCARD_ALLOCATION_PAYLOAD"
  | "INCOMPLETE_CONFLICT_CLOSURE"
  | "INCOMPLETE_LINEAGE_COVERAGE"
  | "INCOMPLETE_ROUTE_MAPPING"
  | "DETERMINISTIC_REPLAY_UNPROVEN"
  | "INCOMPLETE_EQUIVALENCE_PROOF"
  | "COHORT_COUNT_EXHAUSTED"
  | "MEMBER_ENVELOPE_COUNT_EXHAUSTED"
  | "RESOURCE_ROLE_SLOT_COUNT_EXHAUSTED"
  | "CONFLICT_CLOSURE_EDGE_COUNT_EXHAUSTED"
  | "ROUTE_MAPPING_COUNT_EXHAUSTED"
  | "EQUIVALENCE_PROOF_COUNT_EXHAUSTED"
  | "LINEAGE_OCCURRENCE_WITNESS_COUNT_EXHAUSTED";

export type PhaseDCommonBindingsV1 = Readonly<{
  identityHash: string;
  snapshotHash: string;
  sourceRootHash: string;
  provenanceRoot: string;
}>;

export type PhaseDComponentSourceBindingV1 = Readonly<{
  resourceComponentId: string;
  hierarchyBatch: StrategicHierarchyClassificationBatchV1;
  hierarchyBatchHash: string;
  reservationArtifact: StrategicResourceReservationArtifactV1;
  reservationArtifactHash: string;
  routeArtifact: StrategicRouteGenerationArtifactV1;
  routeArtifactHash: string;
  routeUniverseHash: string;
}>;

export type PhaseDSourceBindingManifestV1 = Readonly<{
  commonBindings: PhaseDCommonBindingsV1;
  componentSources: readonly PhaseDComponentSourceBindingV1[];
  multiComponentArtifact: StrategicMultiComponentAndBindingArtifactV1;
  multiComponentArtifactHash: string;
  andComponentSetHash: string;
  manifestHash: string;
}>;

export type PhaseDAdmittedComponentSourceV1 = Readonly<{
  resourceComponentId: string;
  hierarchyBatchHash: string;
  reservationArtifactHash: string;
  routeArtifactHash: string;
  routeUniverseHash: string;
  routeIds: readonly string[];
  routeHashes: readonly string[];
  componentAdmissionHash: string;
}>;

export type PhaseDRouteIdentityIndexEntryV1 = Readonly<{
  routeId: string;
  routeHash: string;
  resourceComponentId: string;
  sourceArtifactHash: string;
  sourceRouteUniverseHash: string;
}>;

export type PhaseDSourceAdmissionSuccessV1 = Readonly<{
  admissionStatus: "ADMITTED";
  canonicalSourceBindingManifest: PhaseDSourceBindingManifestV1;
  sourceBindingManifestHash: string;
  admittedComponents: readonly PhaseDAdmittedComponentSourceV1[];
  routeIdentityIndex: readonly PhaseDRouteIdentityIndexEntryV1[];
  inputRouteCount: number;
  admissionHash: string;
}>;

export type StrategicCohortBudgetMeasurementV1 = Readonly<{
  dimension: StrategicCohortBudgetDimensionV1;
  limit: number;
  observedCount: number;
  measurementCompleteness: StrategicBudgetMeasurementCompletenessV1;
}>;

export type StrategicCohortSourceHashBindingKindV1 =
  | "PHASE_D_SOURCE_BINDING_MANIFEST"
  | "HIERARCHY_CLASSIFICATION_BATCH"
  | "RESOURCE_RESERVATION_ARTIFACT"
  | "ROUTE_GENERATION_ARTIFACT"
  | "ROUTE_UNIVERSE"
  | "MULTI_COMPONENT_AND_BINDING_ARTIFACT";

export type StrategicCohortSourceHashBindingV1 = Readonly<{
  sourceKind: StrategicCohortSourceHashBindingKindV1;
  sourceHash: string;
}>;

export type StrategicCohortBudgetExhaustionProvenanceV1 = Readonly<{
  exhaustedMeasurements: readonly StrategicCohortBudgetMeasurementV1[];
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[];
  provenanceHash: string;
}>;

export type StrategicCohortBudgetExecutionArtifactV1 = Readonly<{
  measurements: readonly StrategicCohortBudgetMeasurementV1[];
  exhaustionProvenance: StrategicCohortBudgetExhaustionProvenanceV1 | null;
  executionHash: string;
}>;

export type StrategicCohortWildcardAllocationInterfaceV1 = Readonly<{
  canonicalGroupType: GroupType;
  allocationCardinality: number;
  canonicalAllocationRoleVector: readonly string[];
  allocationInterfaceHash: string;
}>;

export type StrategicCohortStructuralClaimInterfaceV1 = Readonly<{
  hierarchyTier: StrategicHierarchyTierV1;
  controlRank: StrategicControlRankV1;
  efficiencyRank: StrategicEfficiencyRankV1;
  strengthClass: string;
  levelRankRelation: StrategicLevelRankRelationV1;
  canonicalGroupType: GroupType;
  canonicalGroupLength: number;
  handCountReduction: number;
  claimRoleVector: readonly StrategicReservationClaimRoleV1[];
  reservationClass: StrategicReservationClassV1;
  structuralClaimHash: string;
}>;

export type StrategicCohortStructuralInterfaceV1 = Readonly<{
  claimInterfaces: readonly StrategicCohortStructuralClaimInterfaceV1[];
  routeClasses: readonly StrategicRouteClassV1[];
  preservationFactCodes: readonly StrategicRoutePreservationFactCodeV1[];
  closedThroughTier: StrategicHierarchyTierV1;
  structuralSignatureHash: string;
}>;

export type StrategicCohortRouteActiveResourceInterfaceV1 = Readonly<{
  activeClaimRoles: readonly StrategicReservationClaimRoleV1[];
  activeHierarchyTier: StrategicHierarchyTierV1;
  activeReservationClass: StrategicReservationClassV1;
  activeAllocationInterface: StrategicCohortWildcardAllocationInterfaceV1 | null;
  activeInterfaceHash: string;
}>;

export type StrategicCohortLatentResourceInterfaceV1 = Readonly<{
  latentClaimRoles: readonly StrategicReservationClaimRoleV1[];
  latentReservationStates: readonly StrategicReservationStateV1[];
  latentResourceImportanceFacts: readonly StrategicResourceImportanceV1[];
  latentReleaseInterfaces: readonly string[];
  latentAllocationInterfaces: readonly StrategicCohortWildcardAllocationInterfaceV1[];
  latentInterfaceHash: string;
}>;

export type StrategicResourceDispositionV1 =
  | "PRESERVED"
  | "CONSUMED"
  | "REMAINDER";

export type StrategicResourceNaturalnessV1 = "NATURAL" | "WILDCARD";

export type ResourceRoleSlotV1 = Readonly<{
  disposition: StrategicResourceDispositionV1;
  naturalOrWildcard: StrategicResourceNaturalnessV1;
  routeActiveInterface: StrategicCohortRouteActiveResourceInterfaceV1;
  latentResourceInterface: StrategicCohortLatentResourceInterfaceV1;
  wildcardAllocationInterface: StrategicCohortWildcardAllocationInterfaceV1 | null;
  canonicalRolePosition: string;
  roleSlotHash: string;
}>;

export type StrategicCohortResourceInterfaceV1 = Readonly<{
  canonicalRoleSlots: readonly ResourceRoleSlotV1[];
  preservedCardinality: number;
  consumedCardinality: number;
  remainderCardinality: number;
  wildcardCardinality: number;
  resourceSignatureHash: string;
}>;

export type CanonicalRolePositionBijectionWitnessV1 = Readonly<{
  routeId: string;
  physicalCardId: string;
  canonicalRolePosition: string;
  roleSlotHash: string;
  witnessHash: string;
}>;

export type StrategicPhysicalLineageOccurrenceV1 = Readonly<{
  routeId: string;
  physicalCardId: string;
  disposition: StrategicResourceDispositionV1;
  canonicalRolePosition: string;
  occurrenceHash: string;
}>;

export type StrategicWildcardLineageOccurrenceV1 = Readonly<{
  routeId: string;
  wildcardCardId: string;
  allocationVariantHash: string;
  canonicalRolePosition: string;
  occurrenceHash: string;
}>;

export type StrategicFamilyMemberOccurrenceV1 = Readonly<{
  routeId: string;
  familyId: string;
  memberId: string;
  occurrenceHash: string;
}>;

export type StrategicReservationOccurrenceV1 = Readonly<{
  routeId: string;
  reservationFactId: string;
  reservationHash: string;
  occurrenceHash: string;
}>;

export type StrategicConflictOccurrenceV1 = Readonly<{
  routeId: string;
  conflictFactId: string;
  conflictHash: string;
  occurrenceHash: string;
}>;

export type StrategicEndpointOccurrenceV1 = Readonly<{
  routeId: string;
  componentEndpointId: string;
  endpointHash: string;
  occurrenceHash: string;
}>;

export type StrategicCohortTask3MemberLocalLineageOccurrenceV1 =
  | Readonly<{ kind: "PHYSICAL"; occurrence: StrategicPhysicalLineageOccurrenceV1 }>
  | Readonly<{ kind: "WILDCARD"; occurrence: StrategicWildcardLineageOccurrenceV1 }>
  | Readonly<{ kind: "FAMILY_MEMBER"; occurrence: StrategicFamilyMemberOccurrenceV1 }>;

export type NormalizedRouteCohortMemberDraftV1 = Readonly<{
  routeId: string;
  routeHash: string;
  resourceComponentId: string;
  sourceArtifactHash: string;
  sourceRouteUniverseHash: string;
  sourceAndComponentSetHash: string;
  structuralInterface: StrategicCohortStructuralInterfaceV1;
  resourceInterface: StrategicCohortResourceInterfaceV1;
  canonicalResourceRoleVector: readonly ResourceRoleSlotV1[];
  task3MemberLocalLineage: readonly StrategicCohortTask3MemberLocalLineageOccurrenceV1[];
  normalizationHash: string;
}>;

export type StrategicConflictClosureReferenceKindV1 =
  | "RESERVATION_FACT"
  | "RESERVATION_ALTERNATIVE"
  | "CONFLICT_FACT"
  | "RESOURCE_UNIT"
  | "CLAIM";

export type StrategicConflictClosureReferenceV1 = Readonly<{
  referenceKind: StrategicConflictClosureReferenceKindV1;
  referenceId: string;
  referenceHash: string;
}>;

export type StrategicConflictClosureEdgeV1 = Readonly<{
  sourceReference: StrategicConflictClosureReferenceV1;
  targetReference: StrategicConflictClosureReferenceV1;
  edgeHash: string;
}>;

export type RouteRelevantConflictClosureV1 = Readonly<{
  routeId: string;
  routeHash: string;
  sourceArtifactHash: string;
  seedReferences: readonly StrategicConflictClosureReferenceV1[];
  traversedReferenceEdges: readonly StrategicConflictClosureEdgeV1[];
  reservationFactIds: readonly string[];
  alternativeFactIds: readonly string[];
  conflictFactIds: readonly string[];
  resourceUnitIds: readonly string[];
  closureCompleteness: "COMPLETE" | "INCOMPLETE";
  closureHash: string;
}>;

export type StrategicCohortConflictInterfaceV1 = Readonly<{
  conflictKinds: readonly StrategicReservationConflictKindV1[];
  resolutionStates: readonly "UNRESOLVED"[];
  claimantRoleVector: readonly StrategicReservationClaimRoleV1[];
  alternativeAllocationInterfaces: readonly StrategicCohortWildcardAllocationInterfaceV1[];
  routeClaimIncidenceVector: readonly string[];
  crossTierContention: boolean;
  wildcardContention: boolean;
  conflictSignatureHash: string;
}>;

export type StrategicCohortAndTopologyInterfaceV1 = Readonly<{
  componentArity: number;
  dependencyArityVector: readonly number[];
  topologyHash: string;
}>;

export type StrategicCohortEndpointInterfaceV1 = Readonly<{
  routeClasses: readonly StrategicRouteClassV1[];
  closedThroughTier: StrategicHierarchyTierV1;
  exactHandCountReduction: number;
  remainderRoleVector: readonly ResourceRoleSlotV1[];
  andTopology: StrategicCohortAndTopologyInterfaceV1;
  endpointArity: number;
  endpointSignatureHash: string;
}>;

export type RouteCohortMemberEnvelopeV1 = Readonly<{
  routeId: string;
  routeHash: string;
  resourceComponentId: string;
  sourceArtifactHash: string;
  sourceRouteUniverseHash: string;
  sourceAndComponentSetHash: string;
  structuralInterface: StrategicCohortStructuralInterfaceV1;
  resourceInterface: StrategicCohortResourceInterfaceV1;
  canonicalResourceRoleVector: readonly ResourceRoleSlotV1[];
  routeRelevantConflictClosure: RouteRelevantConflictClosureV1;
  conflictInterface: StrategicCohortConflictInterfaceV1;
  endpointInterface: StrategicCohortEndpointInterfaceV1;
  physicalLineageOccurrences: readonly StrategicPhysicalLineageOccurrenceV1[];
  wildcardLineageOccurrences: readonly StrategicWildcardLineageOccurrenceV1[];
  familyMemberOccurrences: readonly StrategicFamilyMemberOccurrenceV1[];
  reservationOccurrences: readonly StrategicReservationOccurrenceV1[];
  conflictOccurrences: readonly StrategicConflictOccurrenceV1[];
  endpointOccurrences: readonly StrategicEndpointOccurrenceV1[];
  upstreamProvenanceHashes: readonly string[];
  memberEnvelopeHash: string;
}>;

export type StrategicCohortFourSignatureHashesV1 = Readonly<{
  structuralSignatureHash: string;
  resourceSignatureHash: string;
  conflictSignatureHash: string;
  endpointSignatureHash: string;
}>;

export type StrategicCohortInterfaceV1 = Readonly<{
  structuralInterface: StrategicCohortStructuralInterfaceV1;
  resourceInterface: StrategicCohortResourceInterfaceV1;
  conflictInterface: StrategicCohortConflictInterfaceV1;
  endpointInterface: StrategicCohortEndpointInterfaceV1;
  fourSignatureHashes: StrategicCohortFourSignatureHashesV1;
  cohortInterfaceHash: string;
}>;

export type HierarchicalStrategicCohortV1 = Readonly<{
  cohortId: string;
  cohortInterfaceHash: string;
  memberEnvelopeHashes: readonly string[];
  membershipProofHashes: readonly string[];
  cohortMaterializationHash: string;
}>;

export type StrategicRouteCohortMappingFactV1 = Readonly<{
  routeId: string;
  routeHash: string;
  memberEnvelopeHash: string;
  cohortId: string;
  cohortInterfaceHash: string;
  fourSignatureHashes: StrategicCohortFourSignatureHashesV1;
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[];
  mappingHash: string;
}>;

export type StrategicCohortMembershipProofV1 = Readonly<{
  routeId: string;
  routeHash: string;
  memberEnvelopeHash: string;
  cohortInterfaceHash: string;
  fourSignatureHashes: StrategicCohortFourSignatureHashesV1;
  canonicalRolePositionBijectionWitness: readonly CanonicalRolePositionBijectionWitnessV1[];
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[];
  proofHash: string;
}>;

export type PhaseDPhysicalOccurrenceKeyV1 = readonly [routeId: string, physicalCardId: string];
export type PhaseDWildcardOccurrenceKeyV1 = readonly [
  routeId: string,
  wildcardCardId: string,
  allocationVariantHash: string,
];
export type PhaseDFamilyMemberOccurrenceKeyV1 = readonly [
  routeId: string,
  familyId: string,
  memberId: string,
];
export type PhaseDReservationOccurrenceKeyV1 = readonly [
  routeId: string,
  reservationFactId: string,
];
export type PhaseDConflictOccurrenceKeyV1 = readonly [routeId: string, conflictFactId: string];
export type PhaseDEndpointOccurrenceKeyV1 = readonly [
  routeId: string,
  componentEndpointId: string,
];

export type PhaseDRouteOccurrenceUniverseV1 = Readonly<{
  sourceRouteIds: readonly string[];
  physicalOccurrenceKeys: readonly PhaseDPhysicalOccurrenceKeyV1[];
  wildcardOccurrenceKeys: readonly PhaseDWildcardOccurrenceKeyV1[];
  familyMemberOccurrenceKeys: readonly PhaseDFamilyMemberOccurrenceKeyV1[];
  reservationOccurrenceKeys: readonly PhaseDReservationOccurrenceKeyV1[];
  conflictOccurrenceKeys: readonly PhaseDConflictOccurrenceKeyV1[];
  endpointOccurrenceKeys: readonly PhaseDEndpointOccurrenceKeyV1[];
  occurrenceUniverseHash: string;
}>;

export type StrategicCohortCoverageManifestV1 = Readonly<{
  sourceOccurrenceUniverseHash: string;
  inputRouteCount: number;
  coveredRouteCount: number;
  inputPhysicalOccurrenceCount: number;
  coveredPhysicalOccurrenceCount: number;
  inputWildcardOccurrenceCount: number;
  coveredWildcardOccurrenceCount: number;
  inputFamilyMemberOccurrenceCount: number;
  coveredFamilyMemberOccurrenceCount: number;
  inputReservationOccurrenceCount: number;
  coveredReservationOccurrenceCount: number;
  inputConflictOccurrenceCount: number;
  coveredConflictOccurrenceCount: number;
  inputEndpointOccurrenceCount: number;
  coveredEndpointOccurrenceCount: number;
  coverageHash: string;
}>;

export type CompressionRatioInterpretationV1 =
  | "EXACT"
  | "UPPER_BOUND_FROM_COHORT_LOWER_BOUND"
  | "UNAVAILABLE";

export type CompressionRatioObservationV1 = Readonly<{
  inputRouteCount: number;
  observedCohortCount: number;
  ratioNumerator: number;
  ratioDenominator: number | null;
  cohortCountCompleteness: StrategicBudgetMeasurementCompletenessV1 | null;
  ratioInterpretation: CompressionRatioInterpretationV1;
}>;

export type HierarchicalStrategicCohortCompressionArtifactV1 = Readonly<{
  schemaVersion: typeof STRATEGIC_COHORT_COMPRESSION_V1_SCHEMA_VERSION;
  identityHash: string;
  snapshotHash: string;
  sourceRootHash: string;
  provenanceRoot: string;
  sourceBindingManifestHash: string;
  sourceComponentIds: readonly string[];
  sourceMultiComponentArtifactHash: string;
  sourceAndComponentSetHash: string;
  compressionStatus: StrategicCohortCompressionStatusV1;
  evidenceBudget: StrategicCohortCompressionEvidenceBudgetV1;
  budgetExecution: StrategicCohortBudgetExecutionArtifactV1;
  cohorts: readonly HierarchicalStrategicCohortV1[] | null;
  cohortInterfaces: readonly StrategicCohortInterfaceV1[] | null;
  routeToCohortMappings: readonly StrategicRouteCohortMappingFactV1[] | null;
  memberEnvelopes: readonly RouteCohortMemberEnvelopeV1[] | null;
  equivalenceProofs: readonly StrategicCohortMembershipProofV1[] | null;
  coverageManifest: StrategicCohortCoverageManifestV1 | null;
  cohortCount: number;
  compressionRatioObservation: CompressionRatioObservationV1;
  reasonCodes: readonly StrategicCohortCompressionReasonCodeV1[];
  exhaustedDimensions: readonly StrategicCohortBudgetDimensionV1[];
  cohortUniverseHash: string | null;
  semanticBoundary: "HIERARCHICAL_STRATEGIC_COHORT_FACTS_NOT_DECISION";
  artifactHash: string;
}>;

export type PhaseDSourceAdmissionTerminalV1 = Readonly<{
  admissionStatus: "TERMINAL";
  artifact: HierarchicalStrategicCohortCompressionArtifactV1;
}>;

export type PhaseDSourceAdmissionResultV1 =
  | PhaseDSourceAdmissionSuccessV1
  | PhaseDSourceAdmissionTerminalV1;

export type StrategicCohortCompressionInputV1 = Readonly<{
  sourceBindingManifest: PhaseDSourceBindingManifestV1;
  evidenceBudget: StrategicCohortCompressionEvidenceBudgetV1;
}>;

export type HierarchicalStrategicCohortCompressorV1 = (
  input: StrategicCohortCompressionInputV1,
) => PhaseDSourceAdmissionResultV1;
