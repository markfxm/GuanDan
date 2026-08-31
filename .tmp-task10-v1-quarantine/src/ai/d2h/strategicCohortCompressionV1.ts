import { canonicalHash, canonicalSerialize } from "./strategicEvidenceCanonicalSerializer";
import { materializeStrategicBudgetExecutionV1 } from "./strategicBudgetExecutionV1";
import type { StrategicBudgetMeasurementCompletenessV1 } from
  "./strategicBudgetExecutionV1Contracts";
import { classifyStrategicHierarchyBatchV1 } from "./strategicHierarchyClassifierV1";
import { materializeStrategicResourceReservationsV1 } from "./strategicResourceReservationV1";
import { generateStrategicRouteCandidateFactsV1 } from "./strategicRouteCandidateFactsV1";
import { bindStrategicMultiComponentAndEndpointsV1 } from
  "./strategicMultiComponentAndBindingV1";
import type {
  StrategicRouteCandidateFactV1,
  StrategicRouteResourceClaimV1,
} from
  "./strategicRouteCandidateFactsV1Contracts";
import type {
  StrategicFamilyHierarchyMetadataV1,
  StrategicHierarchyClassificationBatchV1,
} from
  "./strategicHierarchyClassifierV1Contracts";
import type {
  StrategicReservationAlternativeFactV1,
  StrategicReservationConflictFactV1,
  StrategicReservationClaimRoleV1,
  StrategicResourceReservationClaimV1,
  StrategicResourceReservationFactV1,
  StrategicResourceUnitV1,
  StrategicWildcardAllocationLineageV1,
} from "./strategicResourceReservationV1Contracts";
import type {
  StrategicComponentAndEndpointReferenceV1,
  StrategicComponentRouteFactSetV1,
  StrategicMultiComponentAndBindingArtifactV1,
} from "./strategicMultiComponentAndBindingV1Contracts";
import type {
  StrategicRouteBranchLocalAllocationV1,
  StrategicRouteBranchLocalResolutionWitnessV1,
} from "./strategicRouteCandidateFactsV1Contracts";
import {
  STRATEGIC_COHORT_COMPRESSION_V1_SCHEMA_VERSION,
  HARD_MAX_COHORT_COUNT_V1,
  type HierarchicalStrategicCohortCompressionArtifactV1,
  type HierarchicalStrategicCohortCompressorV1,
  type NormalizedRouteCohortMemberDraftV1,
  type PhaseDAdmittedRouteNormalizerV1,
  type PhaseDAdmittedComponentSourceV1,
  type PhaseDCommonBindingsV1,
  type PhaseDComponentSourceBindingV1,
  type PhaseDRouteIdentityIndexEntryV1,
  type PhaseDSourceAdmissionSuccessV1,
  type PhaseDSourceAdmissionResultV1,
  type ResourceRoleSlotV1,
  type StrategicCohortLatentResourceInterfaceV1,
  type StrategicCohortRouteActiveResourceInterfaceV1,
  type StrategicCohortStructuralClaimInterfaceV1,
  type StrategicCohortStructuralInterfaceV1,
  type StrategicCohortTask3MemberLocalLineageOccurrenceV1,
  type StrategicCohortWildcardAllocationInterfaceV1,
  type PhaseDSourceBindingManifestV1,
  type PhaseDTask4ArtifactV1,
  type PhaseDTask4InputV1,
  type PhaseDTask4MaterializerV1,
  type PhaseDTask5InputV1,
  type PhaseDTask5MaterializerV1,
  type RouteRelevantConflictClosureV1,
  type RouteCohortMemberEnvelopeV1,
  type StrategicCohortConflictInterfaceV1,
  type StrategicCohortEndpointInterfaceV1,
  type StrategicCohortInterfaceV1,
  type StrategicCohortFourSignatureHashesV1,
  type StrategicCohortMembershipProofV1,
  type StrategicRouteCohortMappingFactV1,
  type HierarchicalStrategicCohortV1,
  type StrategicCohortCoverageManifestV1,
  type StrategicCohortCoverageWitnessV1,
  type StrategicCohortSourceHashBindingV1,
  type StrategicCohortBudgetDimensionV1,
  type StrategicCohortCompressionEvidenceBudgetV1,
  type StrategicCohortBudgetMeasurementV1,
  type StrategicCohortBudgetExhaustionProvenanceV1,
  type StrategicCohortBudgetExecutionArtifactV1,
  type CanonicalRolePositionBijectionWitnessV1,
  type StrategicConflictClosureEdgeV1,
  type StrategicConflictClosureReferenceV1,
  type PhaseDRouteOccurrenceUniverseV1,
  type PhaseDPhysicalOccurrenceKeyV1,
  type PhaseDWildcardOccurrenceKeyV1,
  type PhaseDFamilyMemberOccurrenceKeyV1,
  type PhaseDReservationOccurrenceKeyV1,
  type PhaseDConflictOccurrenceKeyV1,
  type PhaseDEndpointOccurrenceKeyV1,
  type StrategicResourceDispositionV1,
  type StrategicCohortCompressionInputV1,
  type StrategicCohortCompressionReasonCodeV1,
  type StrategicCohortCompressionStatusV1,
} from "./strategicCohortCompressionV1Contracts";

const TASK6_DIMENSION_ORDER = [
  "MEMBER_ENVELOPE_COUNT",
  "RESOURCE_ROLE_SLOT_COUNT",
  "CONFLICT_CLOSURE_EDGE_COUNT",
  "COHORT_COUNT",
  "ROUTE_MAPPING_COUNT",
  "EQUIVALENCE_PROOF_COUNT",
  "LINEAGE_OCCURRENCE_WITNESS_COUNT",
] as const satisfies readonly StrategicCohortBudgetDimensionV1[];

type Task6StageV1 =
  | "STAGE_A_ROUTE"
  | "STAGE_B_MAPPING"
  | "STAGE_C_PROOF"
  | "STAGE_D_COVERAGE";

type Task6IncrementVectorV1 = Readonly<Partial<Record<
  StrategicCohortBudgetDimensionV1,
  number
>>>;

type Task6VerifiedEventV1 = Readonly<{
  stage: Task6StageV1;
  sourceRouteUniverseHash: string | null;
  routeId: string | null;
  routeHash: string | null;
}>;

type Task6AccumulatorSnapshotV1 = Readonly<{
  budgetExecution: StrategicCohortBudgetExecutionArtifactV1;
  exhaustedDimensions: readonly StrategicCohortBudgetDimensionV1[];
  reasonCodes: readonly StrategicCohortCompressionReasonCodeV1[];
  positiveCohortLowerBound: number | null;
}>;

type Task6ApplyResultV1 = Readonly<{
  terminal: boolean;
  snapshot: Task6AccumulatorSnapshotV1 | null;
}>;

type Task6MeasurementAccumulatorV1 = Readonly<{
  applyVerifiedEvent(
    incrementsByDimension: Task6IncrementVectorV1,
    event: Task6VerifiedEventV1,
  ): Task6ApplyResultV1;
  finalizeExactDimension(dimension: StrategicCohortBudgetDimensionV1): void;
  terminalSnapshot(): Task6AccumulatorSnapshotV1;
  completeSnapshot(): Task6AccumulatorSnapshotV1;
}>;

const TASK6_REASON_CODE_BY_DIMENSION: Readonly<Record<
  StrategicCohortBudgetDimensionV1,
  StrategicCohortCompressionReasonCodeV1
>> = {
  MEMBER_ENVELOPE_COUNT: "MEMBER_ENVELOPE_COUNT_EXHAUSTED",
  RESOURCE_ROLE_SLOT_COUNT: "RESOURCE_ROLE_SLOT_COUNT_EXHAUSTED",
  CONFLICT_CLOSURE_EDGE_COUNT: "CONFLICT_CLOSURE_EDGE_COUNT_EXHAUSTED",
  COHORT_COUNT: "COHORT_COUNT_EXHAUSTED",
  ROUTE_MAPPING_COUNT: "ROUTE_MAPPING_COUNT_EXHAUSTED",
  EQUIVALENCE_PROOF_COUNT: "EQUIVALENCE_PROOF_COUNT_EXHAUSTED",
  LINEAGE_OCCURRENCE_WITNESS_COUNT: "LINEAGE_OCCURRENCE_WITNESS_COUNT_EXHAUSTED",
};

type Task6DimensionCountsV1 = Record<StrategicCohortBudgetDimensionV1, number>;

function createTask6MeasurementAccumulatorV1(
  evidenceBudget: StrategicCohortCompressionEvidenceBudgetV1,
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[] = [],
): Task6MeasurementAccumulatorV1 {
  const limits = task6LimitsOf(evidenceBudget);
  const canonicalSourceHashBindings = canonicalTask6SourceHashBindingsOf(sourceHashBindings);
  const provenCounts: Task6DimensionCountsV1 = task6ZeroCounts();
  const exactDimensions = new Set<StrategicCohortBudgetDimensionV1>();
  let terminalSnapshotValue: Task6AccumulatorSnapshotV1 | null = null;

  const applyVerifiedEvent = (
    incrementsByDimension: Task6IncrementVectorV1,
    event: Task6VerifiedEventV1,
  ): Task6ApplyResultV1 => {
    if (terminalSnapshotValue !== null) {
      return deepFreeze({ terminal: true, snapshot: terminalSnapshotValue });
    }

    void event;
    validateTask6Increments(incrementsByDimension);
    for (const dimension of TASK6_DIMENSION_ORDER) {
      const increment = incrementsByDimension[dimension] ?? 0;
      if (increment > 0 && exactDimensions.has(dimension)) {
        throw new Error("Task6 finalized measurement cannot receive another increment");
      }
    }
    const nextCounts = { ...provenCounts };
    const crossedDimensions = new Set<StrategicCohortBudgetDimensionV1>();

    for (const dimension of TASK6_DIMENSION_ORDER) {
      const increment = incrementsByDimension[dimension] ?? 0;
      const candidate = provenCounts[dimension] + increment;
      if (candidate > limits[dimension]) {
        crossedDimensions.add(dimension);
        nextCounts[dimension] = limits[dimension] + 1;
      } else {
        nextCounts[dimension] = candidate;
      }
    }

    for (const dimension of TASK6_DIMENSION_ORDER) {
      provenCounts[dimension] = nextCounts[dimension];
      if ((incrementsByDimension[dimension] ?? 0) > 0) {
        exactDimensions.delete(dimension);
      }
    }

    if (crossedDimensions.size === 0) {
      return deepFreeze({ terminal: false, snapshot: null });
    }

    terminalSnapshotValue = task6SnapshotOf(
      limits,
      provenCounts,
      exactDimensions,
      crossedDimensions,
      canonicalSourceHashBindings,
    );
    return deepFreeze({ terminal: true, snapshot: terminalSnapshotValue });
  };

  const finalizeExactDimension = (
    dimension: StrategicCohortBudgetDimensionV1,
  ): void => {
    assertTask6Dimension(dimension);
    if (terminalSnapshotValue !== null) {
      throw new Error("Task6 measurements cannot be finalized after exhaustion");
    }
    if (provenCounts[dimension] > limits[dimension]) {
      throw new Error("Task6 exhausted measurements cannot be finalized as exact");
    }
    exactDimensions.add(dimension);
  };

  const terminalSnapshot = (): Task6AccumulatorSnapshotV1 => terminalSnapshotValue
    ?? task6SnapshotOf(
      limits,
      provenCounts,
      exactDimensions,
      new Set<StrategicCohortBudgetDimensionV1>(),
      canonicalSourceHashBindings,
    );

  const completeSnapshot = (): Task6AccumulatorSnapshotV1 => {
    if (terminalSnapshotValue !== null || exactDimensions.size !== TASK6_DIMENSION_ORDER.length) {
      throw new Error("Task6 complete snapshot requires seven exact measurements");
    }
    return task6SnapshotOf(
      limits,
      provenCounts,
      exactDimensions,
      new Set<StrategicCohortBudgetDimensionV1>(),
      canonicalSourceHashBindings,
    );
  };

  return Object.freeze({
    applyVerifiedEvent,
    finalizeExactDimension,
    terminalSnapshot,
    completeSnapshot,
  });
}

export function __task6MeasurementAccumulatorForTest(
  evidenceBudget: StrategicCohortCompressionEvidenceBudgetV1,
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[] = [],
): Task6MeasurementAccumulatorV1 {
  return createTask6MeasurementAccumulatorV1(evidenceBudget, sourceHashBindings);
}

function task6LimitsOf(
  evidenceBudget: StrategicCohortCompressionEvidenceBudgetV1,
): Task6DimensionCountsV1 {
  const limits: Task6DimensionCountsV1 = {
    MEMBER_ENVELOPE_COUNT: evidenceBudget.maxMemberEnvelopeCount,
    RESOURCE_ROLE_SLOT_COUNT: evidenceBudget.maxResourceRoleSlotCount,
    CONFLICT_CLOSURE_EDGE_COUNT: evidenceBudget.maxConflictClosureEdgeCount,
    COHORT_COUNT: HARD_MAX_COHORT_COUNT_V1,
    ROUTE_MAPPING_COUNT: evidenceBudget.maxRouteMappingCount,
    EQUIVALENCE_PROOF_COUNT: evidenceBudget.maxEquivalenceProofCount,
    LINEAGE_OCCURRENCE_WITNESS_COUNT: evidenceBudget.maxLineageOccurrenceWitnessCount,
  };
  for (const dimension of TASK6_DIMENSION_ORDER) {
    const limit = limits[dimension];
    if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
      throw new Error(`Invalid Task6 limit for ${dimension}`);
    }
  }
  return limits;
}

function task6ZeroCounts(): Task6DimensionCountsV1 {
  return {
    MEMBER_ENVELOPE_COUNT: 0,
    RESOURCE_ROLE_SLOT_COUNT: 0,
    CONFLICT_CLOSURE_EDGE_COUNT: 0,
    COHORT_COUNT: 0,
    ROUTE_MAPPING_COUNT: 0,
    EQUIVALENCE_PROOF_COUNT: 0,
    LINEAGE_OCCURRENCE_WITNESS_COUNT: 0,
  };
}

function validateTask6Increments(incrementsByDimension: Task6IncrementVectorV1): void {
  for (const [dimension, increment] of Object.entries(incrementsByDimension)) {
    assertTask6Dimension(dimension);
    if (!Number.isFinite(increment) || !Number.isInteger(increment) || increment < 0) {
      throw new Error(`Invalid Task6 increment for ${dimension}`);
    }
  }
}

function assertTask6Dimension(
  dimension: string,
): asserts dimension is StrategicCohortBudgetDimensionV1 {
  if (!(TASK6_DIMENSION_ORDER as readonly string[]).includes(dimension)) {
    throw new Error(`Unknown Task6 dimension: ${dimension}`);
  }
}

function canonicalTask6SourceHashBindingsOf(
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[],
): readonly StrategicCohortSourceHashBindingV1[] {
  return deepFreeze(sourceHashBindings
    .map(({ sourceKind, sourceHash }) => ({ sourceKind, sourceHash }))
    .sort((left, right) => compareText(left.sourceKind, right.sourceKind)
      || compareText(left.sourceHash, right.sourceHash)));
}

function task6SnapshotOf(
  limits: Task6DimensionCountsV1,
  provenCounts: Task6DimensionCountsV1,
  exactDimensions: ReadonlySet<StrategicCohortBudgetDimensionV1>,
  exhaustedDimensions: ReadonlySet<StrategicCohortBudgetDimensionV1>,
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[],
): Task6AccumulatorSnapshotV1 {
  const canonicalExhaustedDimensions = TASK6_DIMENSION_ORDER
    .filter((dimension) => exhaustedDimensions.has(dimension));
  const measurements = TASK6_DIMENSION_ORDER
    .filter((dimension) => exactDimensions.has(dimension) || exhaustedDimensions.has(dimension))
    .map((dimension) => task6MeasurementOf(
      dimension,
      limits[dimension],
      provenCounts[dimension],
      exhaustedDimensions.has(dimension) ? "LOWER_BOUND_AT_EXHAUSTION" : "EXACT",
    ));
  const exhaustedMeasurements = measurements
    .filter(({ dimension }) => exhaustedDimensions.has(dimension));
  const exhaustionProvenance = exhaustedMeasurements.length === 0
    ? null
    : task6ExhaustionProvenanceOf(exhaustedMeasurements, sourceHashBindings);
  const budgetExecutionPayload = {
    measurements,
    exhaustionProvenance,
  };
  const budgetExecution = deepFreeze({
    ...budgetExecutionPayload,
    executionHash: canonicalHash(budgetExecutionPayload),
  });
  const cohortCount = provenCounts.COHORT_COUNT;

  return deepFreeze({
    budgetExecution,
    exhaustedDimensions: canonicalExhaustedDimensions,
    reasonCodes: canonicalExhaustedDimensions
      .map((dimension) => TASK6_REASON_CODE_BY_DIMENSION[dimension]),
    positiveCohortLowerBound: cohortCount > 0 ? cohortCount : null,
  });
}

function task6MeasurementOf(
  dimension: StrategicCohortBudgetDimensionV1,
  limit: number,
  observedCount: number,
  measurementCompleteness: StrategicBudgetMeasurementCompletenessV1,
): StrategicCohortBudgetMeasurementV1 {
  return { dimension, limit, observedCount, measurementCompleteness };
}

function task6ExhaustionProvenanceOf(
  exhaustedMeasurements: readonly StrategicCohortBudgetMeasurementV1[],
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[],
): StrategicCohortBudgetExhaustionProvenanceV1 {
  const payload = {
    exhaustedMeasurements: [...exhaustedMeasurements],
    sourceHashBindings: [...sourceHashBindings],
  };
  return deepFreeze({ ...payload, provenanceHash: canonicalHash(payload) });
}

type ValidationResultV1 =
  | "VALID"
  | "INCOMPLETE"
  | "HASH_MISMATCH"
  | "BINDING_MISMATCH";

export const compressHierarchicalStrategicCohortsV1: HierarchicalStrategicCohortCompressorV1 =
  (input) => {
    const suppliedManifest = input.sourceBindingManifest;
    const componentSources = canonicalComponentSources(suppliedManifest.componentSources);
    const canonicalManifestPayload = manifestPayloadOf(suppliedManifest, componentSources);
    const expectedManifestHash = canonicalHash(canonicalManifestPayload);

    if (suppliedManifest.manifestHash !== expectedManifestHash) {
      return terminal(input, "REJECTED", ["SOURCE_HASH_PAYLOAD_MISMATCH"], 0);
    }
    const multiComponentArtifact = suppliedManifest.multiComponentArtifact;
    if (suppliedManifest.multiComponentArtifactHash !== multiComponentArtifact.artifactHash
      || !selfBoundArtifact(multiComponentArtifact)) {
      return terminal(input, "REJECTED", ["SOURCE_HASH_PAYLOAD_MISMATCH"], 0);
    }
    if (multiComponentArtifact.andComponentSetHash === null
      || suppliedManifest.andComponentSetHash !== multiComponentArtifact.andComponentSetHash) {
      return terminal(input, "REJECTED", ["SOURCE_BINDING_MISMATCH"], 0);
    }

    const c2Validation = validateMultiComponentArtifact(multiComponentArtifact);
    if (c2Validation === "INCOMPLETE") {
      return terminal(input, "INCONCLUSIVE", ["SOURCE_BINDING_INCOMPLETE"], 0);
    }
    if (c2Validation === "HASH_MISMATCH") {
      return terminal(input, "REJECTED", ["SOURCE_HASH_PAYLOAD_MISMATCH"], 0);
    }
    if (c2Validation === "BINDING_MISMATCH") {
      return terminal(input, "REJECTED", ["SOURCE_BINDING_MISMATCH"], 0);
    }

    if (!sameBindings(suppliedManifest.commonBindings, multiComponentArtifact)
      || componentSources.some((component) => !componentUsesBindings(
        component,
        suppliedManifest.commonBindings,
      ))) {
      return terminal(input, "REJECTED", ["SOURCE_BINDING_MISMATCH"], 0);
    }

    const componentIds = componentSources.map((component) => component.resourceComponentId);
    if (new Set(componentIds).size !== componentIds.length) {
      return terminal(input, "REJECTED", ["DUPLICATE_RESOURCE_COMPONENT"], 0);
    }

    const basicComponentValidation = componentSources.map(validateComponentSelfBindings);
    if (basicComponentValidation.includes("INCOMPLETE")) {
      return terminal(input, "INCONCLUSIVE", ["SOURCE_BINDING_INCOMPLETE"], 0);
    }
    if (basicComponentValidation.includes("HASH_MISMATCH")) {
      return terminal(input, "REJECTED", ["SOURCE_HASH_PAYLOAD_MISMATCH"], 0);
    }
    if (basicComponentValidation.includes("BINDING_MISMATCH")) {
      return terminal(input, "REJECTED", ["SOURCE_BINDING_MISMATCH"], 0);
    }

    const routeConflict = duplicateRouteIdentity(componentSources);
    if (routeConflict) {
      return terminal(input, "REJECTED", ["ROUTE_ID_HASH_CONFLICT"], 0);
    }

    const replayValidation = componentSources.map(validateComponentReplay);
    if (replayValidation.includes("INCOMPLETE")) {
      return terminal(input, "INCONCLUSIVE", ["SOURCE_BINDING_INCOMPLETE"], 0);
    }
    if (replayValidation.includes("HASH_MISMATCH")) {
      return terminal(input, "REJECTED", ["SOURCE_HASH_PAYLOAD_MISMATCH"], 0);
    }
    if (replayValidation.includes("BINDING_MISMATCH")) {
      return terminal(input, "REJECTED", ["SOURCE_BINDING_MISMATCH"], 0);
    }

    const c2ComponentIds = multiComponentArtifact.componentIds!;
    const missingComponentIds = difference(c2ComponentIds, componentIds);
    const extraComponentIds = difference(componentIds, c2ComponentIds);
    const setReasonCodes: StrategicCohortCompressionReasonCodeV1[] = [];
    if (missingComponentIds.length > 0) setReasonCodes.push("MISSING_COMPONENT_SOURCE");
    if (extraComponentIds.length > 0) setReasonCodes.push("EXTRA_COMPONENT_SOURCE");
    if (setReasonCodes.length > 0) {
      return terminal(input, "INCONCLUSIVE", setReasonCodes, 0);
    }

    if (!sameSet(
      componentSources.map((component) => component.routeArtifactHash),
      multiComponentArtifact.sourceArtifactHashes,
    ) || !sameSet(
      componentSources.map((component) => component.routeUniverseHash),
      multiComponentArtifact.sourceRouteUniverseHashes,
    ) || !sameKeyedComponentBindings(componentSources, multiComponentArtifact)) {
      return terminal(input, "REJECTED", ["SOURCE_BINDING_MISMATCH"], 0);
    }

    if (componentSources.length > 0) {
      const replayedC2 = bindStrategicMultiComponentAndEndpointsV1({
        sourceArtifacts: componentSources.map((component) => component.routeArtifact),
        budget: multiComponentArtifact.budget,
      });
      if (canonicalHash(replayedC2) !== canonicalHash(multiComponentArtifact)) {
        return terminal(input, "REJECTED", ["SOURCE_HASH_PAYLOAD_MISMATCH"], 0);
      }
    }

    if (!validEvidenceBudget(input)) {
      return terminal(input, "INCONCLUSIVE", ["INVALID_BUDGET"], 0);
    }

    const routeIdentityIndex = routeIdentityIndexOf(componentSources);
    const inputRouteCount = routeIdentityIndex.length;
    if (inputRouteCount === 0) {
      return terminal(input, "INCONCLUSIVE", ["EMPTY_SOURCE_ROUTE_UNIVERSE"], 0);
    }

    const canonicalManifest: PhaseDSourceBindingManifestV1 = {
      ...canonicalManifestPayload,
      manifestHash: expectedManifestHash,
    };
    return admitted(canonicalManifest, componentSources, routeIdentityIndex);
  };

type Task3NormalizationReasonV1 = Extract<
  StrategicCohortCompressionReasonCodeV1,
  | "MISSING_STRENGTH_INTERFACE"
  | "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN"
  | "INCOMPLETE_RESOURCE_ROLE_ACCOUNTING"
  | "MISSING_WILDCARD_ALLOCATION_PAYLOAD"
>;

type AllocationResolutionV1 = Readonly<{
  interfaces: readonly StrategicCohortWildcardAllocationInterfaceV1[];
  allocationVariantHashes: readonly string[];
}>;

type ResourceSlotSeedV1 = Readonly<{
  physicalCardId: string;
  disposition: StrategicResourceDispositionV1;
  naturalOrWildcard: "NATURAL" | "WILDCARD";
  routeActiveInterface: StrategicCohortRouteActiveResourceInterfaceV1;
  latentResourceInterface: StrategicCohortLatentResourceInterfaceV1;
  wildcardAllocationInterface: StrategicCohortWildcardAllocationInterfaceV1 | null;
  wildcardAllocationVariantHashes: readonly string[];
}>;

type ComponentNormalizationIndexesV1 = Readonly<{
  metadataByFamilyId: ReadonlyMap<string, StrategicFamilyHierarchyMetadataV1>;
  reservationFactById: ReadonlyMap<string, StrategicResourceReservationFactV1>;
  alternativeById: ReadonlyMap<string, StrategicReservationAlternativeFactV1>;
  unitById: ReadonlyMap<string, StrategicResourceUnitV1>;
  allocationPayloadByHash: ResourceReplayContextV1["allocationPayloadByHash"];
}>;

export const normalizeAdmittedStrategicRoutesV1: PhaseDAdmittedRouteNormalizerV1 = (admission) => {
  const manifest = admission.canonicalSourceBindingManifest;
  const drafts: NormalizedRouteCohortMemberDraftV1[] = [];
  const orderedComponents = canonicalComponentSources(manifest.componentSources);
  for (const component of orderedComponents) {
    const indexes = componentNormalizationIndexesOf(component);
    if (typeof indexes === "string") return normalizationFailure(admission, indexes);
    const orderedRoutes = [...(component.routeArtifact.routeCandidates ?? [])]
      .sort((left, right) => compareText(left.routeId, right.routeId)
        || compareText(left.routeHash, right.routeHash));
    for (const route of orderedRoutes) {
      const normalized = normalizeRouteDraft(
        component,
        route,
        manifest.andComponentSetHash,
        indexes,
      );
      if (typeof normalized === "string") return normalizationFailure(admission, normalized);
      drafts.push(normalized);
    }
  }
  drafts.sort((left, right) => compareText(left.sourceRouteUniverseHash, right.sourceRouteUniverseHash)
    || compareText(left.routeId, right.routeId)
    || compareText(left.routeHash, right.routeHash));
  const normalizationUniverseHash = canonicalHash({
    kind: "phase-d-route-normalization-universe-v1",
    sourceBindingManifestHash: admission.sourceBindingManifestHash,
    sourceAndComponentSetHash: manifest.andComponentSetHash,
    normalizationHashes: drafts.map((draft) => draft.normalizationHash),
  });
  return deepFreeze({
    normalizationStatus: "COMPLETE" as const,
    sourceBindingManifestHash: admission.sourceBindingManifestHash,
    sourceAndComponentSetHash: manifest.andComponentSetHash,
    normalizedMemberDrafts: drafts,
    reasonCodes: [] as const,
    normalizationUniverseHash,
  });
};

function normalizationFailure(
  admission: Parameters<PhaseDAdmittedRouteNormalizerV1>[0],
  reason: Task3NormalizationReasonV1,
) {
  return deepFreeze({
    normalizationStatus: "INCONCLUSIVE" as const,
    sourceBindingManifestHash: admission.sourceBindingManifestHash,
    sourceAndComponentSetHash: admission.canonicalSourceBindingManifest.andComponentSetHash,
    normalizedMemberDrafts: null,
    reasonCodes: [reason],
    normalizationUniverseHash: null,
  });
}

function normalizeRouteDraft(
  component: PhaseDComponentSourceBindingV1,
  route: StrategicRouteCandidateFactV1,
  sourceAndComponentSetHash: string,
  indexes: ComponentNormalizationIndexesV1,
): NormalizedRouteCohortMemberDraftV1 | Task3NormalizationReasonV1 {
  const structuralInterface = structuralInterfaceOf(route, indexes.metadataByFamilyId);
  if (typeof structuralInterface === "string") return structuralInterface;
  const resource = resourceInterfaceOf(component, route, indexes);
  if (typeof resource === "string") return resource;
  const task3MemberLocalLineage = memberLocalLineageOf(
    route,
    resource.slotByPhysicalCardId,
    resource.wildcardAllocationVariantHashesByPhysicalCardId,
  );
  const payload = {
    routeId: route.routeId,
    routeHash: route.routeHash,
    resourceComponentId: component.resourceComponentId,
    sourceArtifactHash: component.routeArtifactHash,
    sourceRouteUniverseHash: component.routeUniverseHash,
    sourceAndComponentSetHash,
    structuralInterface,
    resourceInterface: resource.resourceInterface,
    canonicalResourceRoleVector: resource.resourceInterface.canonicalRoleSlots,
    task3MemberLocalLineage,
  };
  return { ...payload, normalizationHash: canonicalHash(payload) };
}

function structuralInterfaceOf(
  route: StrategicRouteCandidateFactV1,
  metadataByFamilyId: ComponentNormalizationIndexesV1["metadataByFamilyId"],
): StrategicCohortStructuralInterfaceV1 | Task3NormalizationReasonV1 {
  const hierarchyRefByFamilyId = new Map(route.supportingHierarchyFacts
    .map((reference) => [reference.familyId, reference]));
  const claimInterfaces: StrategicCohortStructuralClaimInterfaceV1[] = [];
  for (const routeClaim of route.resourceClaims) {
    const metadata = metadataByFamilyId.get(routeClaim.familyId);
    const hierarchyRef = hierarchyRefByFamilyId.get(routeClaim.familyId);
    if (metadata === undefined || hierarchyRef === undefined
      || hierarchyRef.classificationHash !== metadata.classificationHash
      || typeof metadata.strengthClass !== "string" || metadata.strengthClass.length === 0
      || !validLevelRankRelation(metadata.levelRankRelation)) {
      return "MISSING_STRENGTH_INTERFACE";
    }
    const payload = {
      hierarchyTier: metadata.hierarchyTier,
      controlRank: metadata.controlRank,
      efficiencyRank: metadata.efficiencyRank,
      strengthClass: metadata.strengthClass,
      levelRankRelation: metadata.levelRankRelation,
      canonicalGroupType: metadata.groupType,
      canonicalGroupLength: metadata.canonicalGroupLength,
      handCountReduction: metadata.handCountReduction,
      claimRoleVector: sortedUnique(routeClaim.claimRoles),
      reservationClass: metadata.reservationClass,
    };
    claimInterfaces.push({ ...payload, structuralClaimHash: canonicalHash(payload) });
  }
  claimInterfaces.sort(compareCanonicalPayload);
  const payload = {
    claimInterfaces,
    routeClasses: sortedUnique(route.endpointFacts.routeClasses),
    preservationFactCodes: sortedUnique(route.endpointFacts.preservationFactCodes),
    closedThroughTier: route.endpointFacts.closedThroughTier,
  };
  return { ...payload, structuralSignatureHash: canonicalHash(payload) };
}

function resourceInterfaceOf(
  component: PhaseDComponentSourceBindingV1,
  route: StrategicRouteCandidateFactV1,
  indexes: ComponentNormalizationIndexesV1,
): Readonly<{
  resourceInterface: Readonly<{
    canonicalRoleSlots: readonly ResourceRoleSlotV1[];
    preservedCardinality: number;
    consumedCardinality: number;
    remainderCardinality: number;
    wildcardCardinality: number;
    resourceSignatureHash: string;
  }>;
  slotByPhysicalCardId: ReadonlyMap<string, ResourceRoleSlotV1>;
  wildcardAllocationVariantHashesByPhysicalCardId: ReadonlyMap<string, readonly string[]>;
}> | Task3NormalizationReasonV1 {
  const dispositionByCard = dispositionsOf(route);
  if (dispositionByCard === null) return "INCOMPLETE_RESOURCE_ROLE_ACCOUNTING";
  const context = resourceReplayContextOf(component, route, indexes);
  if (typeof context === "string") return context;
  const slotSeeds: ResourceSlotSeedV1[] = [];
  for (const [physicalCardId, disposition] of dispositionByCard) {
    const seed = resourceSlotSeedOf(
      physicalCardId,
      disposition,
      context,
    );
    if (typeof seed === "string") return seed;
    slotSeeds.push(seed);
  }
  const canonicalized = canonicalRoleSlotsOf(slotSeeds);
  const canonicalRoleSlots = canonicalized.map((entry) => entry.slot);
  const payload = {
    canonicalRoleSlots,
    preservedCardinality: countDisposition(dispositionByCard, "PRESERVED"),
    consumedCardinality: countDisposition(dispositionByCard, "CONSUMED"),
    remainderCardinality: countDisposition(dispositionByCard, "REMAINDER"),
    wildcardCardinality: slotSeeds.filter((seed) => seed.naturalOrWildcard === "WILDCARD").length,
  };
  return {
    resourceInterface: { ...payload, resourceSignatureHash: canonicalHash(payload) },
    slotByPhysicalCardId: new Map(canonicalized.map((entry) => [entry.physicalCardId, entry.slot])),
    wildcardAllocationVariantHashesByPhysicalCardId: new Map(slotSeeds
      .map((seed) => [seed.physicalCardId, seed.wildcardAllocationVariantHashes])),
  };
}

type ResourceReplayContextV1 = Readonly<{
  supportingFacts: readonly StrategicResourceReservationFactV1[];
  claimById: ReadonlyMap<string, StrategicResourceReservationClaimV1>;
  alternativeById: ReadonlyMap<string, StrategicReservationAlternativeFactV1>;
  unitById: ReadonlyMap<string, StrategicResourceUnitV1>;
  activeRouteClaimsByCardId: ReadonlyMap<string, readonly StrategicRouteResourceClaimV1[]>;
  claimsByCardId: ReadonlyMap<string, readonly StrategicResourceReservationClaimV1[]>;
  factsByCardId: ReadonlyMap<string, readonly StrategicResourceReservationFactV1[]>;
  unitsByCardId: ReadonlyMap<string, readonly StrategicResourceUnitV1[]>;
  allocationPayloadByHash: ReadonlyMap<string, Readonly<{
    canonicalGroupType: StrategicWildcardAllocationLineageV1["canonicalGroupType"];
    wildcardCardIds: readonly string[];
  }>>;
}>;

function resourceReplayContextOf(
  component: PhaseDComponentSourceBindingV1,
  route: StrategicRouteCandidateFactV1,
  indexes: ComponentNormalizationIndexesV1,
): ResourceReplayContextV1 | Task3NormalizationReasonV1 {
  const { reservationFactById, alternativeById, unitById } = indexes;
  const supportingFacts: StrategicResourceReservationFactV1[] = [];
  const selectedAlternativeIds = new Set<string>();
  for (const reference of route.supportingReservationFacts) {
    const fact = reservationFactById.get(reference.reservationFactId);
    if (fact === undefined || fact.resourceComponentId !== component.resourceComponentId) {
      return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
    }
    supportingFacts.push(fact);
    for (const alternativeId of reference.alternativeReservationFactIds) {
      if (!alternativeById.has(alternativeId)) {
        return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
      }
      selectedAlternativeIds.add(alternativeId);
    }
  }
  const claims = supportingFacts.flatMap((fact) => fact.claims);
  const claimById = uniqueMap(claims, (claim) => claim.claimId);
  if (claimById === null) return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
  for (const routeClaim of route.resourceClaims) {
    const sourceClaim = claimById.get(routeClaim.claimId);
    if (sourceClaim === undefined || sourceClaim.familyId !== routeClaim.familyId
      || !sameSet(sourceClaim.claimRoles, routeClaim.claimRoles)
      || routeClaim.resourceUnitIds.some((resourceUnitId) =>
        !sourceClaim.resourceUnitIds.includes(resourceUnitId))
      || routeClaim.alternativeReservationFactIds.length === 0) {
      return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
    }
    for (const alternativeId of routeClaim.alternativeReservationFactIds) {
      const alternative = alternativeById.get(alternativeId);
      if (!selectedAlternativeIds.has(alternativeId) || alternative === undefined
        || alternative.claimId !== routeClaim.claimId
        || alternative.familyId !== routeClaim.familyId
        || !routeClaim.resourceUnitIds.includes(alternative.resourceUnitId)
        || !sameSet(alternative.physicalCardIds, routeClaim.physicalCardIds)
        || !routeClaim.memberIds.includes(alternative.memberId)) {
        return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
      }
    }
  }
  const referencedUnitIds = unique([
    ...supportingFacts.flatMap((fact) => fact.resourceUnitIds),
    ...claims.flatMap((claim) => claim.resourceUnitIds),
  ]);
  if (referencedUnitIds.some((resourceUnitId) => !unitById.has(resourceUnitId))) {
    return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
  }
  const referencedUnits = referencedUnitIds.map((resourceUnitId) => unitById.get(resourceUnitId)!);
  return {
    supportingFacts,
    claimById,
    alternativeById,
    unitById,
    activeRouteClaimsByCardId: indexByPhysicalCard(route.resourceClaims,
      (claim) => claim.physicalCardIds),
    claimsByCardId: indexByPhysicalCard(claims, (claim) => claim.physicalCardIds),
    factsByCardId: indexByPhysicalCard(supportingFacts, (fact) => fact.physicalCardIds),
    unitsByCardId: indexByPhysicalCard(referencedUnits, (unit) => unit.physicalCardIds),
    allocationPayloadByHash: indexes.allocationPayloadByHash,
  };
}

function componentNormalizationIndexesOf(
  component: PhaseDComponentSourceBindingV1,
): ComponentNormalizationIndexesV1 | Task3NormalizationReasonV1 {
  const metadataByFamilyId = uniqueMap(component.hierarchyBatch.families,
    (family) => family.familyId);
  const reservationFactById = uniqueMap(component.reservationArtifact.reservationFacts,
    (fact) => fact.reservationFactId);
  const alternativeById = uniqueMap(component.reservationArtifact.reservationAlternatives,
    (alternative) => alternative.alternativeReservationFactId);
  const unitById = uniqueMap(component.reservationArtifact.resourceUnits,
    (unit) => unit.resourceUnitId);
  if (metadataByFamilyId === null) return "MISSING_STRENGTH_INTERFACE";
  if (reservationFactById === null || alternativeById === null || unitById === null) {
    return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
  }
  return {
    metadataByFamilyId,
    reservationFactById,
    alternativeById,
    unitById,
    allocationPayloadByHash: allocationPayloadIndexOf(component.hierarchyBatch),
  };
}

function resourceSlotSeedOf(
  physicalCardId: string,
  disposition: StrategicResourceDispositionV1,
  context: ResourceReplayContextV1,
): ResourceSlotSeedV1 | Task3NormalizationReasonV1 {
  const activeClaims = context.activeRouteClaimsByCardId.get(physicalCardId) ?? [];
  if (activeClaims.length > 1 || (disposition === "REMAINDER" && activeClaims.length !== 0)
    || (disposition !== "REMAINDER" && activeClaims.length !== 1)) {
    return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
  }
  const relevantUnits = context.unitsByCardId.get(physicalCardId) ?? [];
  const naturalnessFacts = unique(relevantUnits.flatMap((unit) => [
    ...(unit.naturalCardIds.includes(physicalCardId) ? ["NATURAL" as const] : []),
    ...(unit.wildcardCardIds.includes(physicalCardId) ? ["WILDCARD" as const] : []),
  ]));
  if (naturalnessFacts.length !== 1) return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
  const naturalOrWildcard = naturalnessFacts[0];
  const activeClaim = activeClaims[0];
  if (activeClaim !== undefined && context.claimById.get(activeClaim.claimId) === undefined) {
    return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
  }
  const activeAllocation = resolveAllocationInterfaces(
    activeClaim?.wildcardAllocationLineage ?? [],
    physicalCardId,
    context.allocationPayloadByHash,
  );
  if (typeof activeAllocation === "string") return activeAllocation;
  if (activeAllocation.interfaces.length > 1
    || (naturalOrWildcard === "NATURAL" && activeAllocation.interfaces.length > 0)) {
    return "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN";
  }
  const activeAllocationInterface = activeAllocation.interfaces[0] ?? null;
  if (naturalOrWildcard === "WILDCARD" && activeClaim !== undefined
    && activeAllocationInterface === null) return "MISSING_WILDCARD_ALLOCATION_PAYLOAD";
  const activePayload = activeClaim === undefined ? {
    kind: "NO_ACTIVE_CLAIM" as const,
    activeClaimRoles: [] as const,
    activeAllocationInterface: null,
  } : {
    kind: "ACTIVE_CLAIM" as const,
    activeClaimRoles: sortedUnique(activeClaim.claimRoles),
    activeHierarchyTier: activeClaim.hierarchyTier,
    activeReservationClass: activeClaim.reservationClass,
    activeAllocationInterface,
  };
  const routeActiveInterface = {
    ...activePayload,
    activeInterfaceHash: canonicalHash(activePayload),
  };

  const activeClaimIdsForCard = new Set(activeClaims.map((claim) => claim.claimId));
  const latentClaims = (context.claimsByCardId.get(physicalCardId) ?? [])
    .filter((claim) => !activeClaimIdsForCard.has(claim.claimId)
      && claim.physicalCardIds.includes(physicalCardId));
  const latentLineages = latentClaims.flatMap((claim) => claim.resourceUnitIds.flatMap((unitId) => {
    const unit = context.unitById.get(unitId);
    return unit?.physicalCardIds.includes(physicalCardId) === true
      ? unit.wildcardAllocationLineage
      : [];
  }));
  const latentAllocation = resolveAllocationInterfaces(
    latentLineages,
    physicalCardId,
    context.allocationPayloadByHash,
  );
  if (typeof latentAllocation === "string") return latentAllocation;
  const relevantFacts = context.factsByCardId.get(physicalCardId) ?? [];
  const latentPayload = {
    latentClaimRoles: sortedUnique(latentClaims.flatMap((claim) => claim.claimRoles)),
    latentReservationStates: sortedUnique(relevantFacts.map((fact) => fact.reservationState)),
    latentResourceImportanceFacts: sortedUnique(latentClaims
      .flatMap((claim) => claim.resourceImportanceFacts)),
    latentReleaseInterfaces: sortedUnique(relevantFacts.flatMap((fact) => fact.releaseConditions)),
    latentAllocationInterfaces: [...latentAllocation.interfaces].sort(compareCanonicalPayload),
  };
  const latentResourceInterface = {
    ...latentPayload,
    latentInterfaceHash: canonicalHash(latentPayload),
  };
  const wildcardAllocationVariantHashes = sortedUnique([
    ...activeAllocation.allocationVariantHashes,
    ...latentAllocation.allocationVariantHashes,
  ]);
  if (naturalOrWildcard === "WILDCARD" && wildcardAllocationVariantHashes.length === 0) {
    return "MISSING_WILDCARD_ALLOCATION_PAYLOAD";
  }
  return {
    physicalCardId,
    disposition,
    naturalOrWildcard,
    routeActiveInterface,
    latentResourceInterface,
    wildcardAllocationInterface: activeAllocationInterface,
    wildcardAllocationVariantHashes,
  };
}

function allocationPayloadIndexOf(
  hierarchyBatch: StrategicHierarchyClassificationBatchV1,
): ReadonlyMap<string, Readonly<{
  canonicalGroupType: StrategicWildcardAllocationLineageV1["canonicalGroupType"];
  wildcardCardIds: readonly string[];
}>> {
  const result = new Map<string, Readonly<{
    canonicalGroupType: StrategicWildcardAllocationLineageV1["canonicalGroupType"];
    wildcardCardIds: readonly string[];
  }>>();
  for (const family of hierarchyBatch.families) {
    for (const member of family.memberLineage) {
      member.wildcardAllocationVariantHashes.forEach((allocationVariantHash, index) => {
        const payload = member.wildcardAllocationVariants[index];
        if (payload !== undefined && canonicalHash(payload) === allocationVariantHash) {
          result.set(allocationVariantHash, payload);
        }
      });
    }
  }
  return result;
}

function resolveAllocationInterfaces(
  lineages: readonly StrategicWildcardAllocationLineageV1[],
  physicalCardId: string,
  payloadByHash: ResourceReplayContextV1["allocationPayloadByHash"],
): AllocationResolutionV1 | Task3NormalizationReasonV1 {
  const interfaces = new Map<string, StrategicCohortWildcardAllocationInterfaceV1>();
  const allocationVariantHashes: string[] = [];
  for (const lineage of lineages.filter((candidate) =>
    candidate.wildcardCardIds.includes(physicalCardId))) {
    const allocationPayload = payloadByHash.get(lineage.allocationVariantHash);
    if (allocationPayload === undefined
      || allocationPayload.canonicalGroupType !== lineage.canonicalGroupType
      || !sameSet(allocationPayload.wildcardCardIds, lineage.wildcardCardIds)) {
      return "MISSING_WILDCARD_ALLOCATION_PAYLOAD";
    }
    const payload = {
      canonicalGroupType: allocationPayload.canonicalGroupType,
      allocationCardinality: allocationPayload.wildcardCardIds.length,
      canonicalAllocationRoleVector: Array.from(
        { length: allocationPayload.wildcardCardIds.length },
        () => "WILDCARD_ALLOCATION",
      ),
    };
    const allocationInterface = {
      ...payload,
      allocationInterfaceHash: canonicalHash(payload),
    };
    interfaces.set(canonicalSerialize(allocationInterface), allocationInterface);
    allocationVariantHashes.push(lineage.allocationVariantHash);
  }
  return {
    interfaces: [...interfaces.values()].sort(compareCanonicalPayload),
    allocationVariantHashes: sortedUnique(allocationVariantHashes),
  };
}

function canonicalRoleSlotsOf(
  seeds: readonly ResourceSlotSeedV1[],
): readonly Readonly<{ physicalCardId: string; slot: ResourceRoleSlotV1 }>[] {
  const ordered = seeds.map((seed) => {
    const descriptor = {
      disposition: seed.disposition,
      naturalOrWildcard: seed.naturalOrWildcard,
      routeActiveInterface: seed.routeActiveInterface,
      latentResourceInterface: seed.latentResourceInterface,
      wildcardAllocationInterface: seed.wildcardAllocationInterface,
    };
    return {
      seed,
      descriptor,
      descriptorKey: canonicalSerialize(descriptor),
      descriptorHash: canonicalHash(descriptor),
    };
  }).sort((left, right) => compareText(left.descriptorKey, right.descriptorKey)
    || compareText(left.seed.physicalCardId, right.seed.physicalCardId));
  const nextOrdinalByDescriptor = new Map<string, number>();
  return ordered.map(({ seed, descriptor, descriptorKey, descriptorHash }) => {
    const ordinal = nextOrdinalByDescriptor.get(descriptorKey) ?? 0;
    nextOrdinalByDescriptor.set(descriptorKey, ordinal + 1);
    const canonicalRolePosition = `${descriptorHash}:${ordinal}`;
    const slotPayload = { ...descriptor, canonicalRolePosition };
    return {
      physicalCardId: seed.physicalCardId,
      slot: { ...slotPayload, roleSlotHash: canonicalHash(slotPayload) },
    };
  });
}

function dispositionsOf(
  route: StrategicRouteCandidateFactV1,
): ReadonlyMap<string, StrategicResourceDispositionV1> | null {
  const universe = route.endpointFacts.accountedPhysicalCardIds;
  if (unique(universe).length !== universe.length) return null;
  const assignments: readonly Readonly<{
    disposition: StrategicResourceDispositionV1;
    physicalCardIds: readonly string[];
  }>[] = [
    { disposition: "PRESERVED", physicalCardIds: route.preservedResources },
    { disposition: "CONSUMED", physicalCardIds: route.consumedResources },
    { disposition: "REMAINDER", physicalCardIds: route.endpointFacts.remainderPhysicalCardIds },
  ];
  const universeSet = new Set(universe);
  const result = new Map<string, StrategicResourceDispositionV1>();
  for (const assignment of assignments) {
    for (const physicalCardId of assignment.physicalCardIds) {
      if (!universeSet.has(physicalCardId) || result.has(physicalCardId)) return null;
      result.set(physicalCardId, assignment.disposition);
    }
  }
  return result.size === universe.length ? result : null;
}

function memberLocalLineageOf(
  route: StrategicRouteCandidateFactV1,
  slotByPhysicalCardId: ReadonlyMap<string, ResourceRoleSlotV1>,
  wildcardHashesByPhysicalCardId: ReadonlyMap<string, readonly string[]>,
): readonly StrategicCohortTask3MemberLocalLineageOccurrenceV1[] {
  const entries: StrategicCohortTask3MemberLocalLineageOccurrenceV1[] = [];
  for (const [physicalCardId, slot] of slotByPhysicalCardId) {
    const physicalPayload = {
      routeId: route.routeId,
      physicalCardId,
      disposition: slot.disposition,
      canonicalRolePosition: slot.canonicalRolePosition,
    };
    entries.push({
      kind: "PHYSICAL",
      occurrence: { ...physicalPayload, occurrenceHash: canonicalHash(physicalPayload) },
    });
    for (const allocationVariantHash of wildcardHashesByPhysicalCardId.get(physicalCardId) ?? []) {
      const wildcardPayload = {
        routeId: route.routeId,
        wildcardCardId: physicalCardId,
        allocationVariantHash,
        canonicalRolePosition: slot.canonicalRolePosition,
      };
      entries.push({
        kind: "WILDCARD",
        occurrence: { ...wildcardPayload, occurrenceHash: canonicalHash(wildcardPayload) },
      });
    }
  }
  const familyMemberKeys = new Set<string>();
  for (const claim of route.resourceClaims) {
    for (const memberId of claim.memberIds) {
      const key = canonicalSerialize([claim.familyId, memberId]);
      if (familyMemberKeys.has(key)) continue;
      familyMemberKeys.add(key);
      const payload = { routeId: route.routeId, familyId: claim.familyId, memberId };
      entries.push({
        kind: "FAMILY_MEMBER",
        occurrence: { ...payload, occurrenceHash: canonicalHash(payload) },
      });
    }
  }
  return entries.sort(compareCanonicalPayload);
}

function countDisposition(
  dispositions: ReadonlyMap<string, StrategicResourceDispositionV1>,
  expected: StrategicResourceDispositionV1,
): number {
  return [...dispositions.values()].filter((value) => value === expected).length;
}

function indexByPhysicalCard<T>(
  values: readonly T[],
  physicalCardIdsOf: (value: T) => readonly string[],
): ReadonlyMap<string, readonly T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    for (const physicalCardId of physicalCardIdsOf(value)) {
      const entries = result.get(physicalCardId);
      if (entries === undefined) result.set(physicalCardId, [value]);
      else entries.push(value);
    }
  }
  return result;
}

function validLevelRankRelation(value: unknown): boolean {
  return value === "LEVEL_RANK_BASED" || value === "NON_LEVEL_RANK" || value === "NOT_APPLICABLE";
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareText);
}

function compareCanonicalPayload(left: unknown, right: unknown): number {
  return compareText(canonicalSerialize(left), canonicalSerialize(right));
}

function validateComponentSelfBindings(
  component: PhaseDComponentSourceBindingV1,
): ValidationResultV1 {
  const { hierarchyBatch, reservationArtifact, routeArtifact } = component;
  if (routeArtifact.generationStatus !== "COMPLETE"
    || routeArtifact.routeCandidates === null
    || routeArtifact.routeUniverseHash === null) return "INCOMPLETE";
  if (component.hierarchyBatchHash !== hierarchyBatch.batchHash
    || component.reservationArtifactHash !== reservationArtifact.artifactHash
    || component.routeArtifactHash !== routeArtifact.artifactHash
    || component.routeUniverseHash !== routeArtifact.routeUniverseHash) return "HASH_MISMATCH";
  if (!selfBoundBatch(hierarchyBatch) || !selfBoundArtifact(reservationArtifact)
    || !validRouteArtifactSelfIntegrity(routeArtifact)) return "HASH_MISMATCH";

  const reservationComponentIds = unique(reservationArtifact.reservationFacts
    .map((fact) => fact.resourceComponentId));
  const routeComponentIds = unique(routeArtifact.routeCandidates
    .map((route) => route.endpointFacts.resourceComponentId));
  if (reservationComponentIds.length !== 1 || routeComponentIds.length !== 1
    || reservationComponentIds[0] !== component.resourceComponentId
    || routeComponentIds[0] !== component.resourceComponentId
    || routeArtifact.sourceHierarchyBatchHash !== hierarchyBatch.batchHash
    || routeArtifact.sourceReservationArtifactHash !== reservationArtifact.artifactHash) {
    return "BINDING_MISMATCH";
  }
  return "VALID";
}

function validateComponentReplay(
  component: PhaseDComponentSourceBindingV1,
): ValidationResultV1 {
  const replayedHierarchy = classifyStrategicHierarchyBatchV1(
    component.hierarchyBatch.sourceInventory,
  );
  if (replayedHierarchy === null) return "INCOMPLETE";
  if (canonicalHash(replayedHierarchy) !== canonicalHash(component.hierarchyBatch)) {
    return "HASH_MISMATCH";
  }
  const replayedReservation = materializeStrategicResourceReservationsV1(replayedHierarchy);
  if (replayedReservation === null) return "INCOMPLETE";
  if (canonicalHash(replayedReservation) !== canonicalHash(component.reservationArtifact)) {
    return "HASH_MISMATCH";
  }
  const replayedRouteArtifact = generateStrategicRouteCandidateFactsV1({
    hierarchyBatch: replayedHierarchy,
    reservationArtifact: replayedReservation,
    budget: component.routeArtifact.budget,
  });
  if (replayedRouteArtifact.generationStatus !== "COMPLETE") return "INCOMPLETE";
  return canonicalHash(replayedRouteArtifact) === canonicalHash(component.routeArtifact)
    ? "VALID"
    : "HASH_MISMATCH";
}

function validateMultiComponentArtifact(
  artifact: StrategicMultiComponentAndBindingArtifactV1,
): ValidationResultV1 {
  if (artifact.bindingStatus !== "COMPLETE" || artifact.componentRouteFacts === null
    || artifact.andEndpointReferences === null || artifact.componentIds === null
    || artifact.andComponentSetHash === null || artifact.routeUniverseHash === null) {
    return "INCOMPLETE";
  }
  if (artifact.componentEndpointCount !== artifact.componentRouteFacts.length
    || artifact.componentEndpointCount !== artifact.andEndpointReferences.length
    || artifact.componentIds.length !== artifact.componentRouteFacts.length
    || artifact.componentRouteFacts.some((component) => !validComponentFact(component))
    || artifact.andEndpointReferences.some((endpoint) => !validEndpointReference(endpoint))
    || !validMultiComponentBudgetExecution(artifact)) {
    return "HASH_MISMATCH";
  }
  if (artifact.andComponentSetHash !== canonicalHash({
    kind: "strategic-and-component-set-v1",
    componentIds: artifact.componentIds,
    sourceRouteUniverseHashes: artifact.sourceRouteUniverseHashes,
  })) return "HASH_MISMATCH";
  if (!sameSet(artifact.componentIds, artifact.componentRouteFacts
    .map((component) => component.resourceComponentId))
    || !sameSet(artifact.sourceArtifactHashes, artifact.componentRouteFacts
      .map((component) => component.sourceArtifactHash))
    || !sameSet(artifact.sourceRouteUniverseHashes, artifact.componentRouteFacts
      .map((component) => component.sourceRouteUniverseHash))) return "BINDING_MISMATCH";

  const expectedRouteUniverseHash = canonicalHash({
    kind: "strategic-multi-component-and-route-universe-v1",
    identityHash: artifact.identityHash,
    snapshotHash: artifact.snapshotHash,
    sourceRootHash: artifact.sourceRootHash,
    provenanceRoot: artifact.provenanceRoot,
    sourceRouteUniverseHashes: artifact.sourceRouteUniverseHashes,
    componentSemanticHashes: artifact.componentRouteFacts.map((fact) => canonicalHash({
      kind: "strategic-component-route-universe-v1",
      resourceComponentId: fact.resourceComponentId,
      sourceRouteUniverseHash: fact.sourceRouteUniverseHash,
      routeHashes: fact.routeCandidates.map((route) => route.routeHash).sort(compareText),
      physicalCardIds: fact.physicalCardIds,
      wildcardCardIds: fact.wildcardCardIds,
    })).sort(compareText),
    endpointSemanticHashes: artifact.andEndpointReferences.map((endpoint) => canonicalHash({
      kind: "strategic-component-and-endpoint-universe-v1",
      resourceComponentId: endpoint.resourceComponentId,
      sourceRouteUniverseHash: endpoint.sourceRouteUniverseHash,
      routeReferences: endpoint.routeReferences,
      andComponentSetHash: endpoint.andComponentSetHash,
    })).sort(compareText),
  });
  return artifact.routeUniverseHash === expectedRouteUniverseHash ? "VALID" : "HASH_MISMATCH";
}

function validMultiComponentBudgetExecution(
  artifact: StrategicMultiComponentAndBindingArtifactV1,
): boolean {
  if (artifact.componentEndpointCount !== artifact.budgetObservation.observedComponentEndpointCount
    || artifact.evidenceCost !== artifact.budgetObservation.observedEvidenceCost
    || artifact.budgetObservation.measurementCompleteness !== "EXACT"
    || artifact.exhaustedDimensions.length !== 0
    || artifact.reasonCodes.length !== 0) return false;
  const expected = materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "COMPONENT_ENDPOINT_COUNT",
        limit: artifact.budget.maxComponentEndpointCount,
        observedCount: artifact.componentEndpointCount,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "EVIDENCE_COST",
        limit: artifact.budget.maxEvidenceCost,
        observedCount: artifact.evidenceCost,
        measurementCompleteness: "EXACT",
      },
    ],
    exhaustedDimensions: [],
    sourceHashBindings: [
      ...artifact.sourceArtifactHashes.map((sourceHash) => ({
        sourceKind: "STRATEGIC_ROUTE_GENERATION_ARTIFACT" as const,
        sourceHash,
      })),
      ...artifact.sourceRouteUniverseHashes.map((sourceHash) => ({
        sourceKind: "STRATEGIC_ROUTE_UNIVERSE" as const,
        sourceHash,
      })),
    ],
  });
  return canonicalHash(expected) === canonicalHash(artifact.budgetExecution);
}

function validComponentFact(component: StrategicComponentRouteFactSetV1): boolean {
  const { componentFactHash: _componentFactHash, ...payload } = component;
  return component.componentFactHash === canonicalHash(payload)
    && component.routeCount === component.routeCandidates.length
    && component.routeCandidates.every(validRoute);
}

function validEndpointReference(endpoint: StrategicComponentAndEndpointReferenceV1): boolean {
  const { endpointHash: _endpointHash, ...payload } = endpoint;
  const identityPayload = {
    kind: "strategic-component-and-endpoint-reference-v1",
    resourceComponentId: endpoint.resourceComponentId,
    sourceRouteUniverseHash: endpoint.sourceRouteUniverseHash,
    routeReferences: endpoint.routeReferences,
    andComponentSetHash: endpoint.andComponentSetHash,
  };
  return endpoint.endpointHash === canonicalHash(payload)
    && endpoint.componentEndpointId === canonicalHash(identityPayload);
}

function validRouteArtifactSelfIntegrity(
  artifact: PhaseDComponentSourceBindingV1["routeArtifact"],
): boolean {
  if (!selfBoundArtifact(artifact) || artifact.routeCandidates === null
    || artifact.routeUniverseHash === null || artifact.routeCount !== artifact.routeCandidates.length
    || !artifact.routeCandidates.every(validRoute)) return false;
  return artifact.routeUniverseHash === canonicalHash({
    kind: "strategic-route-universe-v1",
    identityHash: artifact.identityHash,
    snapshotHash: artifact.snapshotHash,
    sourceRootHash: artifact.sourceRootHash,
    provenanceRoot: artifact.provenanceRoot,
    sourceInventoryHash: artifact.sourceInventoryHash,
    routeHashes: artifact.routeCandidates.map((route) => route.routeHash).sort(compareText),
  });
}

function validRoute(route: StrategicRouteCandidateFactV1): boolean {
  const { routeHash: _routeHash, ...payload } = route;
  const { endpointHash: _endpointHash, ...endpointPayload } = route.endpointFacts;
  return route.routeHash === canonicalHash(payload)
    && route.endpointFacts.endpointHash === canonicalHash(endpointPayload);
}

function sameKeyedComponentBindings(
  components: readonly PhaseDComponentSourceBindingV1[],
  artifact: StrategicMultiComponentAndBindingArtifactV1,
): boolean {
  const endpointByComponentId = uniqueMap(
    artifact.andEndpointReferences!,
    (endpoint) => endpoint.resourceComponentId,
  );
  const factByComponentId = uniqueMap(
    artifact.componentRouteFacts!,
    (fact) => fact.resourceComponentId,
  );
  if (endpointByComponentId === null || factByComponentId === null
    || endpointByComponentId.size !== components.length
    || factByComponentId.size !== components.length) return false;
  return components.every((component) => {
    const endpoint = endpointByComponentId.get(component.resourceComponentId);
    const fact = factByComponentId.get(component.resourceComponentId);
    return endpoint !== undefined && fact !== undefined
      && endpoint.sourceArtifactHash === component.routeArtifactHash
      && endpoint.sourceRouteUniverseHash === component.routeUniverseHash
      && fact.sourceArtifactHash === component.routeArtifactHash
      && fact.sourceRouteUniverseHash === component.routeUniverseHash;
  });
}

function duplicateRouteIdentity(components: readonly PhaseDComponentSourceBindingV1[]): boolean {
  const hashesByRouteId = new Map<string, string>();
  for (const route of components.flatMap((component) => component.routeArtifact.routeCandidates ?? [])) {
    const previous = hashesByRouteId.get(route.routeId);
    if (previous !== undefined && previous !== route.routeHash) return true;
    hashesByRouteId.set(route.routeId, route.routeHash);
  }
  return false;
}

function routeIdentityIndexOf(
  components: readonly PhaseDComponentSourceBindingV1[],
): readonly PhaseDRouteIdentityIndexEntryV1[] {
  return components.flatMap((component) => component.routeArtifact.routeCandidates!.map((route) => ({
    routeId: route.routeId,
    routeHash: route.routeHash,
    resourceComponentId: component.resourceComponentId,
    sourceArtifactHash: component.routeArtifactHash,
    sourceRouteUniverseHash: component.routeUniverseHash,
  }))).sort((left, right) => compareText(
    left.sourceRouteUniverseHash,
    right.sourceRouteUniverseHash,
  )
    || compareText(left.routeId, right.routeId)
    || compareText(left.routeHash, right.routeHash)
    || compareText(left.resourceComponentId, right.resourceComponentId)
    || compareText(left.sourceArtifactHash, right.sourceArtifactHash));
}

function admitted(
  manifest: PhaseDSourceBindingManifestV1,
  componentSources: readonly PhaseDComponentSourceBindingV1[],
  routeIdentityIndex: readonly PhaseDRouteIdentityIndexEntryV1[],
): PhaseDSourceAdmissionResultV1 {
  const admittedComponents = componentSources.map(componentAdmissionOf);
  const payload = {
    admissionStatus: "ADMITTED" as const,
    canonicalSourceBindingManifest: manifest,
    sourceBindingManifestHash: manifest.manifestHash,
    admittedComponents,
    routeIdentityIndex,
    inputRouteCount: routeIdentityIndex.length,
  };
  return deepFreeze({ ...payload, admissionHash: canonicalHash(payload) });
}

function componentAdmissionOf(
  component: PhaseDComponentSourceBindingV1,
): PhaseDAdmittedComponentSourceV1 {
  const routeCandidates = component.routeArtifact.routeCandidates!;
  const payload = {
    resourceComponentId: component.resourceComponentId,
    hierarchyBatchHash: component.hierarchyBatchHash,
    reservationArtifactHash: component.reservationArtifactHash,
    routeArtifactHash: component.routeArtifactHash,
    routeUniverseHash: component.routeUniverseHash,
    routeIds: routeCandidates.map((route) => route.routeId).sort(compareText),
    routeHashes: routeCandidates.map((route) => route.routeHash).sort(compareText),
  };
  return { ...payload, componentAdmissionHash: canonicalHash(payload) };
}

function terminal(
  input: StrategicCohortCompressionInputV1,
  compressionStatus: Exclude<StrategicCohortCompressionStatusV1, "COMPLETE">,
  reasonCodes: readonly StrategicCohortCompressionReasonCodeV1[],
  inputRouteCount: number,
): PhaseDSourceAdmissionResultV1 {
  const manifest = input.sourceBindingManifest;
  const budgetPayload = { measurements: [], exhaustionProvenance: null };
  const budgetExecution = { ...budgetPayload, executionHash: canonicalHash(budgetPayload) };
  const payload = {
    schemaVersion: STRATEGIC_COHORT_COMPRESSION_V1_SCHEMA_VERSION,
    ...manifest.commonBindings,
    sourceBindingManifestHash: manifest.manifestHash,
    sourceComponentIds: unique(manifest.componentSources
      .map((component) => component.resourceComponentId)).sort(compareText),
    sourceMultiComponentArtifactHash: manifest.multiComponentArtifact.artifactHash,
    sourceAndComponentSetHash: manifest.multiComponentArtifact.andComponentSetHash
      ?? manifest.andComponentSetHash,
    compressionStatus,
    evidenceBudget: input.evidenceBudget,
    budgetExecution,
    cohorts: null,
    cohortInterfaces: null,
    routeToCohortMappings: null,
    memberEnvelopes: null,
    equivalenceProofs: null,
    coverageManifest: null,
    cohortCount: 0,
    compressionRatioObservation: {
      inputRouteCount,
      observedCohortCount: 0,
      ratioNumerator: inputRouteCount,
      ratioDenominator: null,
      cohortCountCompleteness: null,
      ratioInterpretation: "UNAVAILABLE" as const,
    },
    reasonCodes: unique(reasonCodes).sort(compareText),
    exhaustedDimensions: [],
    cohortUniverseHash: null,
    semanticBoundary: "HIERARCHICAL_STRATEGIC_COHORT_FACTS_NOT_DECISION" as const,
  };
  const artifact: HierarchicalStrategicCohortCompressionArtifactV1 = {
    ...payload,
    artifactHash: canonicalHash(payload),
  };
  return deepFreeze({ admissionStatus: "TERMINAL" as const, artifact });
}

function manifestPayloadOf(
  manifest: PhaseDSourceBindingManifestV1,
  componentSources: readonly PhaseDComponentSourceBindingV1[],
) {
  return {
    commonBindings: manifest.commonBindings,
    componentSources,
    multiComponentArtifact: manifest.multiComponentArtifact,
    multiComponentArtifactHash: manifest.multiComponentArtifactHash,
    andComponentSetHash: manifest.andComponentSetHash,
  };
}

function canonicalComponentSources(
  sources: readonly PhaseDComponentSourceBindingV1[],
): readonly PhaseDComponentSourceBindingV1[] {
  return [...sources].sort((left, right) =>
    compareText(left.resourceComponentId, right.resourceComponentId)
      || compareText(left.routeArtifactHash, right.routeArtifactHash)
      || compareText(left.routeUniverseHash, right.routeUniverseHash));
}

function componentUsesBindings(
  component: PhaseDComponentSourceBindingV1,
  bindings: PhaseDCommonBindingsV1,
): boolean {
  return sameBindings(bindings, component.hierarchyBatch)
    && sameBindings(bindings, component.reservationArtifact)
    && sameBindings(bindings, component.routeArtifact);
}

function sameBindings(
  expected: PhaseDCommonBindingsV1,
  actual: Readonly<{
    identityHash: string;
    snapshotHash: string;
    sourceRootHash: string;
    provenanceRoot: string;
  }>,
): boolean {
  return actual.identityHash === expected.identityHash
    && actual.snapshotHash === expected.snapshotHash
    && actual.sourceRootHash === expected.sourceRootHash
    && actual.provenanceRoot === expected.provenanceRoot;
}

function selfBoundBatch(batch: PhaseDComponentSourceBindingV1["hierarchyBatch"]): boolean {
  const { batchHash, ...payload } = batch;
  return batchHash === canonicalHash(payload);
}

function selfBoundArtifact<T extends Readonly<{ artifactHash: string }>>(artifact: T): boolean {
  const { artifactHash, ...payload } = artifact;
  return artifactHash === canonicalHash(payload);
}

function validEvidenceBudget(input: StrategicCohortCompressionInputV1): boolean {
  return Object.values(input.evidenceBudget)
    .every((value) => Number.isInteger(value) && value > 0);
}

function difference(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return unique(left.filter((value) => !rightSet.has(value))).sort(compareText);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSorted = [...left].sort(compareText);
  const rightSorted = [...right].sort(compareText);
  return leftSorted.length === rightSorted.length
    && unique(leftSorted).length === leftSorted.length
    && unique(rightSorted).length === rightSorted.length
    && leftSorted.every((value, index) => value === rightSorted[index]);
}

function uniqueMap<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): ReadonlyMap<string, T> | null {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) return null;
    result.set(key, value);
  }
  return result;
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)];
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

type Task4IssueV1 = Readonly<{
  status: "INCONCLUSIVE" | "REJECTED";
  reason: StrategicCohortCompressionReasonCodeV1;
}>;

type Task4RouteRecordV1 = Readonly<{
  component: PhaseDComponentSourceBindingV1;
  route: StrategicRouteCandidateFactV1;
  draft: NormalizedRouteCohortMemberDraftV1;
}>;

type Task4IndexedCollectionV1<T> = Readonly<{
  byId: ReadonlyMap<string, T>;
  ownerById: ReadonlyMap<string, string>;
}>;

type Task4ComponentIndexesV1 = Readonly<{
  componentId: string;
  reservationFacts: Task4IndexedCollectionV1<StrategicResourceReservationFactV1>;
  claims: Task4IndexedCollectionV1<StrategicResourceReservationClaimV1>;
  alternatives: Task4IndexedCollectionV1<StrategicReservationAlternativeFactV1>;
  conflicts: Task4IndexedCollectionV1<StrategicReservationConflictFactV1>;
  units: Task4IndexedCollectionV1<StrategicResourceUnitV1>;
}>;

type Task4ContextV1 = Readonly<{
  components: ReadonlyMap<string, Task4ComponentIndexesV1>;
  routeRecords: readonly Task4RouteRecordV1[];
  endpointReferences: readonly StrategicComponentAndEndpointReferenceV1[];
  endpointReferencesByRouteKey: ReadonlyMap<
    string,
    readonly StrategicComponentAndEndpointReferenceV1[]
  >;
}>;

type Task4IndexedResultV1<T> =
  | Readonly<{ value: Task4IndexedCollectionV1<T> }>
  | Readonly<{ issue: Task4IssueV1 }>;

type Task4OccurrenceEntryV1<K extends readonly string[]> = Readonly<{
  key: K;
  payloadHash: string;
}>;

type Task4OccurrenceAccumulatorV1 = {
  physical: Map<string, Task4OccurrenceEntryV1<PhaseDPhysicalOccurrenceKeyV1>>;
  wildcard: Map<string, Task4OccurrenceEntryV1<PhaseDWildcardOccurrenceKeyV1>>;
  familyMember: Map<string, Task4OccurrenceEntryV1<PhaseDFamilyMemberOccurrenceKeyV1>>;
  reservation: Map<string, Task4OccurrenceEntryV1<PhaseDReservationOccurrenceKeyV1>>;
  conflict: Map<string, Task4OccurrenceEntryV1<PhaseDConflictOccurrenceKeyV1>>;
  endpoint: Map<string, Task4OccurrenceEntryV1<PhaseDEndpointOccurrenceKeyV1>>;
};

const TASK4_REFERENCE_KIND_ORDER: readonly string[] = [
  "RESERVATION_FACT",
  "RESERVATION_ALTERNATIVE",
  "CONFLICT_FACT",
  "RESOURCE_UNIT",
  "CLAIM",
];

export const materializePhaseDTask4V1: PhaseDTask4MaterializerV1 = (input) => {
  const sourceIssue = validateTask4Source(input);
  if (sourceIssue !== null) return task4Terminal(input, sourceIssue);

  const contextResult = task4ContextOf(input);
  if ("issue" in contextResult) return task4Terminal(input, contextResult.issue);
  const context = contextResult.value;

  const closures: RouteRelevantConflictClosureV1[] = [];
  const occurrences: Task4OccurrenceAccumulatorV1 = {
    physical: new Map(),
    wildcard: new Map(),
    familyMember: new Map(),
    reservation: new Map(),
    conflict: new Map(),
    endpoint: new Map(),
  };
  const issues: Task4IssueV1[] = [];
  for (const record of context.routeRecords) {
    const closureResult = routeConflictClosureOf(record, context);
    if ("issue" in closureResult) {
      issues.push(closureResult.issue);
      continue;
    }
    closures.push(closureResult.value);
    const occurrenceIssue = addRouteOccurrences(occurrences, record, closureResult.value, context);
    if (occurrenceIssue !== null) issues.push(occurrenceIssue);
  }
  if (issues.some((issue) => issue.status === "REJECTED")) {
    return task4Terminal(input, issues.find((issue) => issue.status === "REJECTED")!);
  }
  if (issues.length > 0 || closures.length !== context.routeRecords.length) {
    return task4Terminal(input, issues[0] ?? {
      status: "INCONCLUSIVE",
      reason: "INCOMPLETE_CONFLICT_CLOSURE",
    });
  }

  const occurrenceUniverse = occurrenceUniverseOf(context.routeRecords, occurrences);
  const payload = {
    task4Status: "COMPLETE" as const,
    sourceBindingManifestHash: input.admission.sourceBindingManifestHash,
    sourceAndComponentSetHash: input.admission.canonicalSourceBindingManifest.andComponentSetHash,
    routeRelevantConflictClosures: closures.sort(compareCanonicalPayload),
    occurrenceUniverse,
    reasonCodes: [] as const,
    semanticBoundary: "PHASE_D_TASK4_FACTS_NOT_COHORT_OR_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
};

export const materializePhaseDRouteConflictClosureAndOccurrenceUniverseV1 =
  materializePhaseDTask4V1;

function task4Terminal(
  input: PhaseDTask4InputV1,
  issue: Task4IssueV1,
): PhaseDTask4ArtifactV1 {
  const payload = {
    task4Status: issue.status,
    sourceBindingManifestHash: input.admission.sourceBindingManifestHash,
    sourceAndComponentSetHash: input.admission.canonicalSourceBindingManifest.andComponentSetHash,
    routeRelevantConflictClosures: null,
    occurrenceUniverse: null,
    reasonCodes: [issue.reason] as readonly StrategicCohortCompressionReasonCodeV1[],
    semanticBoundary: "PHASE_D_TASK4_FACTS_NOT_COHORT_OR_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
}

function validateTask4Source(input: PhaseDTask4InputV1): Task4IssueV1 | null {
  const admission = input.admission;
  if (admission.admissionStatus !== "ADMITTED") {
    return { status: "INCONCLUSIVE", reason: "SOURCE_BINDING_INCOMPLETE" };
  }
  const manifest = admission.canonicalSourceBindingManifest;
  const canonicalManifestPayload = manifestPayloadOf(manifest, canonicalComponentSources(manifest.componentSources));
  if (manifest.manifestHash !== canonicalHash(canonicalManifestPayload)
    || admission.sourceBindingManifestHash !== manifest.manifestHash) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  const c2 = manifest.multiComponentArtifact;
  if (manifest.multiComponentArtifactHash !== c2.artifactHash) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  if (manifest.andComponentSetHash !== c2.andComponentSetHash) {
    return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
  }
  if (c2.artifactHash !== canonicalHash(payloadWithout(c2, "artifactHash"))) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  if (c2.bindingStatus !== "COMPLETE" || c2.componentRouteFacts === null
    || c2.andEndpointReferences === null || c2.componentIds === null
    || c2.andComponentSetHash === null || c2.routeUniverseHash === null) {
    return { status: "INCONCLUSIVE", reason: "SOURCE_BINDING_INCOMPLETE" };
  }
  const c2Validation = validateMultiComponentArtifact(c2);
  if (c2Validation === "INCOMPLETE") {
    return { status: "INCONCLUSIVE", reason: "SOURCE_BINDING_INCOMPLETE" };
  }
  if (c2Validation === "HASH_MISMATCH") {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  if (c2Validation === "BINDING_MISMATCH") {
    return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
  }
  const components = canonicalComponentSources(manifest.componentSources);
  if (!sameBindings(manifest.commonBindings, c2)
    || components.some((component) => !componentUsesBindings(component, manifest.commonBindings))) {
    return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
  }
  const componentIds = components.map((component) => component.resourceComponentId);
  if (new Set(componentIds).size !== componentIds.length) {
    return { status: "REJECTED", reason: "DUPLICATE_RESOURCE_COMPONENT" };
  }
  for (const component of components) {
    if (component.hierarchyBatchHash !== component.hierarchyBatch.batchHash
      || component.reservationArtifactHash !== component.reservationArtifact.artifactHash
      || component.routeArtifactHash !== component.routeArtifact.artifactHash
      || component.routeUniverseHash !== component.routeArtifact.routeUniverseHash) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    if (!selfBoundBatch(component.hierarchyBatch)
      || !selfBoundArtifact(component.reservationArtifact)
      || !validRouteArtifactSelfIntegrity(component.routeArtifact)) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    if (component.routeArtifact.sourceHierarchyBatchHash !== component.hierarchyBatchHash
      || component.routeArtifact.sourceReservationArtifactHash !== component.reservationArtifactHash) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    if (component.routeArtifact.routeCandidates?.some((route) =>
      route.endpointFacts.resourceComponentId !== component.resourceComponentId) === true) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    if (component.routeArtifact.routeCandidates?.some((route) => !validRoute(route)) === true) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
  }
  if (!sameSet(componentIds, c2.componentIds)
    || !sameSet(components.map((component) => component.routeArtifactHash), c2.sourceArtifactHashes)
    || !sameSet(components.map((component) => component.routeUniverseHash), c2.sourceRouteUniverseHashes)) {
    return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
  }
  for (const endpoint of c2.andEndpointReferences) {
    if (!validEndpointReference(endpoint)) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    if (endpoint.andComponentSetHash !== c2.andComponentSetHash) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
  }
  if (!task4C2KeyedBindingsMatch(components, c2)) {
    return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
  }
  const expectedAdmissionPayload = {
    admissionStatus: "ADMITTED" as const,
    canonicalSourceBindingManifest: manifest,
    sourceBindingManifestHash: admission.sourceBindingManifestHash,
    admittedComponents: admission.admittedComponents,
    routeIdentityIndex: admission.routeIdentityIndex,
    inputRouteCount: admission.inputRouteCount,
  };
  if (admission.admissionHash !== canonicalHash(expectedAdmissionPayload)) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  return null;
}

function task4C2KeyedBindingsMatch(
  components: readonly PhaseDComponentSourceBindingV1[],
  c2: StrategicMultiComponentAndBindingArtifactV1,
): boolean {
  const factByComponentId = uniqueMap(c2.componentRouteFacts!, (fact) => fact.resourceComponentId);
  const endpointByComponentId = uniqueMap(
    c2.andEndpointReferences!,
    (endpoint) => endpoint.resourceComponentId,
  );
  if (factByComponentId === null || endpointByComponentId === null
    || factByComponentId.size !== components.length
    || endpointByComponentId.size !== components.length) return false;
  return components.every((component) => {
    const fact = factByComponentId.get(component.resourceComponentId);
    const endpoint = endpointByComponentId.get(component.resourceComponentId);
    if (fact === undefined || endpoint === undefined
      || fact.sourceArtifactHash !== component.routeArtifactHash
      || fact.sourceRouteUniverseHash !== component.routeUniverseHash
      || endpoint.sourceArtifactHash !== component.routeArtifactHash
      || endpoint.sourceRouteUniverseHash !== component.routeUniverseHash) return false;
    const sourceRoutes = component.routeArtifact.routeCandidates ?? [];
    const factRoutes = fact.routeCandidates;
    const endpointRoutes = endpoint.routeReferences;
    if (factRoutes.length !== sourceRoutes.length || endpointRoutes.length !== sourceRoutes.length) {
      return false;
    }
    const sourceRouteKeys = sourceRoutes
      .map((route) => routeKeyOf(route.routeId, route.routeHash))
      .sort(compareText);
    const factRouteKeys = factRoutes
      .map((route) => routeKeyOf(route.routeId, route.routeHash))
      .sort(compareText);
    const endpointRouteKeys = endpointRoutes
      .map((reference) => routeKeyOf(reference.routeId, reference.routeHash))
      .sort(compareText);
    return sameSet(sourceRouteKeys, factRouteKeys)
      && sameSet(sourceRouteKeys, endpointRouteKeys);
  });
}

function task4ContextOf(
  input: PhaseDTask4InputV1,
): Readonly<{ value: Task4ContextV1 }> | Readonly<{ issue: Task4IssueV1 }> {
  const manifest = input.admission.canonicalSourceBindingManifest;
  const components = new Map<string, Task4ComponentIndexesV1>();
  const routeRecords: Task4RouteRecordV1[] = [];
  const routeIdentity = new Map<string, string>();
  const draftByRoute = new Map<string, NormalizedRouteCohortMemberDraftV1>();
  for (const draft of input.normalizedMemberDrafts) {
    if (draft.normalizationHash !== canonicalHash(payloadWithout(draft, "normalizationHash"))) {
      return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }
    const routeKey = routeKeyOf(draft.routeId, draft.routeHash);
    const previousDraft = draftByRoute.get(routeKey);
    if (previousDraft !== undefined
      && canonicalSerialize(previousDraft) !== canonicalSerialize(draft)) {
      return { issue: { status: "REJECTED", reason: "SIGNATURE_HASH_PAYLOAD_CONFLICT" } };
    }
    draftByRoute.set(routeKey, draft);
  }
  for (const component of canonicalComponentSources(manifest.componentSources)) {
    const indexesResult = componentIndexesOf(component);
    if ("issue" in indexesResult) return indexesResult;
    components.set(component.resourceComponentId, indexesResult.value);
    for (const route of component.routeArtifact.routeCandidates ?? []) {
      const previousRouteHash = routeIdentity.get(route.routeId);
      if (previousRouteHash !== undefined && previousRouteHash !== route.routeHash) {
        return { issue: { status: "REJECTED", reason: "ROUTE_ID_HASH_CONFLICT" } };
      }
      routeIdentity.set(route.routeId, route.routeHash);
      const draft = draftByRoute.get(routeKeyOf(route.routeId, route.routeHash));
      if (draft === undefined) {
        return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" } };
      }
      if (draft.resourceComponentId !== component.resourceComponentId
        || draft.sourceArtifactHash !== component.routeArtifactHash
        || draft.sourceRouteUniverseHash !== component.routeUniverseHash) {
        return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
      }
      routeRecords.push({ component, route, draft });
    }
  }
  const admittedRouteKeys = new Set(routeRecords.map((record) =>
    routeKeyOf(record.route.routeId, record.route.routeHash)));
  for (const routeKey of draftByRoute.keys()) {
    if (!admittedRouteKeys.has(routeKey)) {
      return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" } };
    }
  }
  const endpointReferences = [...(manifest.multiComponentArtifact.andEndpointReferences ?? [])]
    .sort(compareCanonicalPayload);
  const routeByKey = new Map(routeRecords.map((record) => [
    routeKeyOf(record.route.routeId, record.route.routeHash), record,
  ]));
  const endpointReferencesByRouteKey = new Map<
    string,
    StrategicComponentAndEndpointReferenceV1[]
  >();
  for (const endpoint of endpointReferences) {
    for (const reference of endpoint.routeReferences) {
      const route = routeByKey.get(routeKeyOf(reference.routeId, reference.routeHash));
      if (route === undefined || route.component.resourceComponentId !== endpoint.resourceComponentId
        || endpoint.sourceArtifactHash !== route.component.routeArtifactHash
        || endpoint.sourceRouteUniverseHash !== route.component.routeUniverseHash) {
        return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      }
      const routeKey = routeKeyOf(reference.routeId, reference.routeHash);
      const entries = endpointReferencesByRouteKey.get(routeKey);
      if (entries === undefined) endpointReferencesByRouteKey.set(routeKey, [endpoint]);
      else if (!entries.some((entry) => entry.componentEndpointId === endpoint.componentEndpointId)) {
        entries.push(endpoint);
      }
    }
  }
  for (const entries of endpointReferencesByRouteKey.values()) entries.sort(compareCanonicalPayload);
  return {
    value: {
      components,
      routeRecords: routeRecords.sort(compareRouteRecord),
      endpointReferences,
      endpointReferencesByRouteKey,
    },
  };
}

function componentIndexesOf(
  component: PhaseDComponentSourceBindingV1,
): Readonly<{ value: Task4ComponentIndexesV1 }> | Readonly<{ issue: Task4IssueV1 }> {
  const facts = indexedCollectionOf(
    component.reservationArtifact.reservationFacts,
    (fact) => fact.reservationFactId,
    "reservationHash",
    component.resourceComponentId,
  );
  if ("issue" in facts) return facts;
  const claims = indexedCollectionOf(
    component.reservationArtifact.reservationFacts.flatMap((fact) => fact.claims),
    (claim) => claim.claimId,
    "claimHash",
    component.resourceComponentId,
  );
  if ("issue" in claims) return claims;
  const alternatives = indexedCollectionOf(
    component.reservationArtifact.reservationAlternatives,
    (alternative) => alternative.alternativeReservationFactId,
    "alternativeHash",
    component.resourceComponentId,
  );
  if ("issue" in alternatives) return alternatives;
  const conflicts = indexedCollectionOf(
    component.reservationArtifact.conflictFacts,
    (conflict) => conflict.conflictFactId,
    "conflictHash",
    component.resourceComponentId,
  );
  if ("issue" in conflicts) return conflicts;
  const units = indexedCollectionOf(
    component.reservationArtifact.resourceUnits,
    (unit) => unit.resourceUnitId,
    "resourceUnitHash",
    component.resourceComponentId,
  );
  if ("issue" in units) return units;
  for (const fact of facts.value.byId.values()) {
    if (fact.resourceComponentId !== component.resourceComponentId) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
  }
  for (const alternative of alternatives.value.byId.values()) {
    if (alternative.resourceComponentId !== component.resourceComponentId) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
  }
  for (const conflict of conflicts.value.byId.values()) {
    if (conflict.resourceComponentId !== component.resourceComponentId) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
  }
  return {
    value: {
      componentId: component.resourceComponentId,
      reservationFacts: facts.value,
      claims: claims.value,
      alternatives: alternatives.value,
      conflicts: conflicts.value,
      units: units.value,
    },
  };
}

function indexedCollectionOf<T extends Readonly<Record<string, unknown>>>(
  values: readonly T[],
  idOf: (value: T) => string,
  hashProperty: string,
  owner: string,
): Task4IndexedResultV1<T> {
  const byId = new Map<string, T>();
  const ownerById = new Map<string, string>();
  for (const value of values) {
    const id = idOf(value);
    const suppliedHash = value[hashProperty];
    const payload = payloadWithout(value, hashProperty);
    if (typeof suppliedHash !== "string" || suppliedHash !== canonicalHash(payload)) {
      return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }
    const previous = byId.get(id);
    if (previous !== undefined
      && canonicalSerialize(previous) !== canonicalSerialize(value)) {
      return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }
    byId.set(id, value);
    ownerById.set(id, owner);
  }
  return { value: { byId, ownerById } };
}

function routeConflictClosureOf(
  record: Task4RouteRecordV1,
  context: Task4ContextV1,
): Readonly<{ value: RouteRelevantConflictClosureV1 }> | Readonly<{ issue: Task4IssueV1 }> {
  const indexes = context.components.get(record.component.resourceComponentId);
  if (indexes === undefined) {
    return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
  }
  const route = record.route;
  const routeReferenceIssue = validateRouteReferenceClosureSeeds(route, indexes);
  if (routeReferenceIssue !== null) return { issue: routeReferenceIssue };
  const seedReferences: StrategicConflictClosureReferenceV1[] = [];
  const selectedAlternativeIds = new Set<string>();
  const addFactSeed = (reservationFactId: string): Task4IssueV1 | null => {
    const fact = indexes.reservationFacts.byId.get(reservationFactId);
    if (fact === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    if (fact.resourceComponentId !== indexes.componentId) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    seedReferences.push(referenceOf("RESERVATION_FACT", fact));
    return null;
  };
  for (const reservationReference of route.supportingReservationFacts) {
    const factIssue = addFactSeed(reservationReference.reservationFactId);
    if (factIssue !== null) return { issue: factIssue };
    for (const alternativeId of reservationReference.alternativeReservationFactIds) {
      selectedAlternativeIds.add(alternativeId);
      const alternative = indexes.alternatives.byId.get(alternativeId);
      if (alternative === undefined) {
        return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      }
      if (alternative.resourceComponentId !== indexes.componentId) {
        return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
      }
      seedReferences.push(referenceOf("RESERVATION_ALTERNATIVE", alternative));
    }
  }
  if (route.supportingReservationFacts.length === 0) {
    return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
  }
  for (const claim of route.resourceClaims) {
    for (const alternativeId of claim.alternativeReservationFactIds) selectedAlternativeIds.add(alternativeId);
  }
  for (const alternativeId of selectedAlternativeIds) {
    const alternative = indexes.alternatives.byId.get(alternativeId);
    if (alternative === undefined) {
      return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
    }
    if (alternative.resourceComponentId !== indexes.componentId) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
    seedReferences.push(referenceOf("RESERVATION_ALTERNATIVE", alternative));
  }
  for (const conflictFactId of route.unresolvedConflicts) {
    const conflict = indexes.conflicts.byId.get(conflictFactId);
    if (conflict === undefined) {
      return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
    }
    if (conflict.resourceComponentId !== indexes.componentId) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
    const routeFact = route.supportingReservationFacts
      .map((reference) => indexes.reservationFacts.byId.get(reference.reservationFactId))
      .find((fact) => fact?.conflictFactIds.includes(conflictFactId));
    if (routeFact === undefined) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
    seedReferences.push(referenceOf("CONFLICT_FACT", conflict));
  }
  const witnessIssue = validateBranchWitnesses(route, indexes, selectedAlternativeIds);
  if (witnessIssue !== null) return { issue: witnessIssue };

  const visited = new Map<string, StrategicConflictClosureReferenceV1>();
  const edges = new Map<string, StrategicConflictClosureEdgeV1>();
  const queue = [...seedReferences].sort(compareReference);
  let cursor = 0;
  while (cursor < queue.length) {
    const reference = queue[cursor++];
    const visitKey = referenceKeyOf(reference);
    if (visited.has(visitKey)) continue;
    visited.set(visitKey, reference);
    const targetsResult = closureTargetsOf(reference, indexes);
    if ("issue" in targetsResult) return targetsResult;
    for (const target of targetsResult.value) {
      const targetKey = referenceKeyOf(target);
      const edgePayload = { sourceReference: reference, targetReference: target };
      const edge: StrategicConflictClosureEdgeV1 = {
        ...edgePayload,
        edgeHash: canonicalHash(edgePayload),
      };
      edges.set(`${visitKey}->${targetKey}`, edge);
      if (!visited.has(targetKey)) queue.push(target);
    }
  }
  const closurePayload = {
    routeId: route.routeId,
    routeHash: route.routeHash,
    sourceArtifactHash: record.component.routeArtifactHash,
    seedReferences: dedupeReferences(seedReferences),
    traversedReferenceEdges: [...edges.values()].sort(compareEdge),
    reservationFactIds: [...visited.values()]
      .filter((reference) => reference.referenceKind === "RESERVATION_FACT")
      .map((reference) => reference.referenceId).sort(compareText),
    alternativeFactIds: [...visited.values()]
      .filter((reference) => reference.referenceKind === "RESERVATION_ALTERNATIVE")
      .map((reference) => reference.referenceId).sort(compareText),
    conflictFactIds: [...visited.values()]
      .filter((reference) => reference.referenceKind === "CONFLICT_FACT")
      .map((reference) => reference.referenceId).sort(compareText),
    resourceUnitIds: [...visited.values()]
      .filter((reference) => reference.referenceKind === "RESOURCE_UNIT")
      .map((reference) => reference.referenceId).sort(compareText),
    branchLocalResolutionWitnesses: [...route.branchLocalResolutionWitnesses]
      .sort(compareCanonicalPayload),
    closureCompleteness: "COMPLETE" as const,
  };
  return { value: { ...closurePayload, closureHash: canonicalHash(closurePayload) } };
}

function validateRouteReferenceClosureSeeds(
  route: StrategicRouteCandidateFactV1,
  indexes: Task4ComponentIndexesV1,
): Task4IssueV1 | null {
  if (route.endpointFacts.resourceComponentId !== indexes.componentId) {
    return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
  }
  const supportingFactIds = new Set<string>();
  for (const reference of route.supportingReservationFacts) {
    if (supportingFactIds.has(reference.reservationFactId)) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    supportingFactIds.add(reference.reservationFactId);
    const fact = indexes.reservationFacts.byId.get(reference.reservationFactId);
    if (fact === undefined) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    }
    const factClaimIds = new Set(fact.claims.map((claim) => claim.claimId));
    for (const alternativeId of reference.alternativeReservationFactIds) {
      const alternative = indexes.alternatives.byId.get(alternativeId);
      if (alternative === undefined) {
        return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
      }
      if (alternative.resourceComponentId !== indexes.componentId
        || !fact.resourceUnitIds.includes(alternative.resourceUnitId)
        || !factClaimIds.has(alternative.claimId)) {
        return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
      }
    }
  }
  if (supportingFactIds.size === 0) {
    return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
  }
  const supportingAlternativeIds = new Set(route.supportingReservationFacts
    .flatMap((reference) => reference.alternativeReservationFactIds));
  for (const routeClaim of route.resourceClaims) {
    const claim = indexes.claims.byId.get(routeClaim.claimId);
    if (claim === undefined) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    }
    if (claim.claimHash !== routeClaim.claimHash
      || claim.familyId !== routeClaim.familyId
      || routeClaim.memberIds.some((memberId) => !claim.memberIds.includes(memberId))
      || !sameSet(claim.claimRoles, routeClaim.claimRoles)
      || routeClaim.resourceUnitIds.some((resourceUnitId) => !claim.resourceUnitIds.includes(resourceUnitId))) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    for (const alternativeId of routeClaim.alternativeReservationFactIds) {
      const alternative = indexes.alternatives.byId.get(alternativeId);
      if (alternative === undefined) {
        return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
      }
      if (!supportingAlternativeIds.has(alternativeId)
        || alternative.claimId !== routeClaim.claimId
        || alternative.familyId !== routeClaim.familyId
        || !routeClaim.memberIds.includes(alternative.memberId)
        || !routeClaim.resourceUnitIds.includes(alternative.resourceUnitId)
        || !sameSet(alternative.physicalCardIds, routeClaim.physicalCardIds)
        || !sameSet(alternative.wildcardCardIds, routeClaim.wildcardCardIds)) {
        return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
      }
    }
  }
  return null;
}

function closureTargetsOf(
  reference: StrategicConflictClosureReferenceV1,
  indexes: Task4ComponentIndexesV1,
): Readonly<{ value: readonly StrategicConflictClosureReferenceV1[] }> | Readonly<{ issue: Task4IssueV1 }> {
  switch (reference.referenceKind) {
    case "RESERVATION_FACT": {
      const fact = indexes.reservationFacts.byId.get(reference.referenceId);
      if (fact === undefined) return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      const targets: StrategicConflictClosureReferenceV1[] = [];
      for (const claim of fact.claims) {
        const indexedClaim = indexes.claims.byId.get(claim.claimId);
        if (indexedClaim === undefined) {
          return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
        }
        if (canonicalSerialize(indexedClaim) !== canonicalSerialize(claim)) {
          return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
        }
        targets.push(referenceOf("CLAIM", indexedClaim));
      }
      for (const resourceUnitId of fact.resourceUnitIds) {
        const unit = indexes.units.byId.get(resourceUnitId);
        if (unit === undefined) {
          return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
        }
        targets.push(referenceOf("RESOURCE_UNIT", unit));
      }
      for (const conflictFactId of fact.conflictFactIds) {
        const conflict = indexes.conflicts.byId.get(conflictFactId);
        if (conflict === undefined) {
          return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
        }
        targets.push(referenceOf("CONFLICT_FACT", conflict));
      }
      for (const parentReservationFactId of fact.parentReservationFactIds) {
        const parent = indexes.reservationFacts.byId.get(parentReservationFactId);
        if (parent === undefined) {
          return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
        }
        targets.push(referenceOf("RESERVATION_FACT", parent));
      }
      return { value: targets.sort(compareReference) };
    }
    case "RESERVATION_ALTERNATIVE": {
      const alternative = indexes.alternatives.byId.get(reference.referenceId);
      if (alternative === undefined) return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      const claim = indexes.claims.byId.get(alternative.claimId);
      const unit = indexes.units.byId.get(alternative.resourceUnitId);
      if (claim === undefined || unit === undefined) {
        return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      }
      if (claim.familyId !== alternative.familyId
        || !claim.memberIds.includes(alternative.memberId)
        || !claim.resourceUnitIds.includes(alternative.resourceUnitId)
        || unit.sourceFamilyId !== alternative.familyId
        || unit.sourceMemberId !== alternative.memberId
        || !sameSet(unit.physicalCardIds, alternative.physicalCardIds)
        || !sameSet(unit.wildcardCardIds, alternative.wildcardCardIds)) {
        return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
      }
      return { value: [referenceOf("CLAIM", claim), referenceOf("RESOURCE_UNIT", unit)] };
    }
    case "CONFLICT_FACT": {
      const conflict = indexes.conflicts.byId.get(reference.referenceId);
      if (conflict === undefined) return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      const targets: StrategicConflictClosureReferenceV1[] = [];
      for (const alternativeReservationFactId of conflict.alternativeReservationFactIds) {
        const alternative = indexes.alternatives.byId.get(alternativeReservationFactId);
        if (alternative === undefined) {
          return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
        }
        targets.push(referenceOf("RESERVATION_ALTERNATIVE", alternative));
      }
      return { value: targets.sort(compareReference) };
    }
    case "CLAIM": {
      const claim = indexes.claims.byId.get(reference.referenceId);
      if (claim === undefined) return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      const targets: StrategicConflictClosureReferenceV1[] = [];
      for (const resourceUnitId of claim.resourceUnitIds) {
        const unit = indexes.units.byId.get(resourceUnitId);
        if (unit === undefined) {
          return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
        }
        targets.push(referenceOf("RESOURCE_UNIT", unit));
      }
      return { value: targets.sort(compareReference) };
    }
    case "RESOURCE_UNIT":
      return { value: [] };
  }
}

function validateBranchWitnesses(
  route: StrategicRouteCandidateFactV1,
  indexes: Task4ComponentIndexesV1,
  selectedAlternativeIds: ReadonlySet<string>,
): Task4IssueV1 | null {
  const witnessConflictIds = new Set<string>();
  for (const witness of route.branchLocalResolutionWitnesses) {
    if (witness.witnessKind !== "BRANCH_LOCAL_RESOLUTION"
      || witnessConflictIds.has(witness.conflictFactId)) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    witnessConflictIds.add(witness.conflictFactId);
    if (witness.witnessHash !== canonicalHash(payloadWithout(witness, "witnessHash"))) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    const conflict = indexes.conflicts.byId.get(witness.conflictFactId);
    if (conflict === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    if (!route.unresolvedConflicts.includes(witness.conflictFactId)) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    const conflictAlternativeIds = new Set(conflict.alternativeReservationFactIds);
    if (witness.selectedAlternativeReservationFactIds.length
      !== new Set(witness.selectedAlternativeReservationFactIds).size
      || witness.selectedAlternativeReservationFactIds.some((alternativeReservationFactId) =>
        !conflictAlternativeIds.has(alternativeReservationFactId))) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    if (witness.selectedAlternativeReservationFactIds.length !== witness.allocations.length
      || witness.selectedAlternativeReservationFactIds.some((id, index) =>
        id !== witness.allocations[index]?.alternativeReservationFactId)) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    for (const allocation of witness.allocations) {
      if (!conflictAlternativeIds.has(allocation.alternativeReservationFactId)) {
        return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
      }
      if (!selectedAlternativeIds.has(allocation.alternativeReservationFactId)) {
        return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
      }
      const alternative = indexes.alternatives.byId.get(allocation.alternativeReservationFactId);
      if (alternative === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
      if (allocation.alternativeHash !== alternative.alternativeHash
        || allocation.resourceUnitId !== alternative.resourceUnitId
        || !sameSet(allocation.physicalCardIds, alternative.physicalCardIds)
        || !sameSet(allocation.wildcardCardIds, alternative.wildcardCardIds)
        || canonicalSerialize(allocation.wildcardAllocationLineage)
          !== canonicalSerialize(alternative.wildcardAllocationLineage)) {
        return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
      }
      if (allocation.allocationHash !== canonicalHash(payloadWithout(allocation, "allocationHash"))) {
        return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
      }
    }
    if (!conflict.alternativeReservationFactIds.some((id) => selectedAlternativeIds.has(id))) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    }
  }
  for (const conflictFactId of route.unresolvedConflicts) {
    if (!witnessConflictIds.has(conflictFactId)) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    }
  }
  return null;
}

function addRouteOccurrences(
  accumulator: Task4OccurrenceAccumulatorV1,
  record: Task4RouteRecordV1,
  closure: RouteRelevantConflictClosureV1,
  context: Task4ContextV1,
): Task4IssueV1 | null {
  const route = record.route;
  const draftPhysical = new Map<string, {
    disposition: StrategicResourceDispositionV1;
    canonicalRolePosition: string;
  }>();
  const canonicalRolePositions = new Set(record.draft.canonicalResourceRoleVector
    .map((slot) => slot.canonicalRolePosition));
  for (const lineage of record.draft.task3MemberLocalLineage) {
    if (lineage.kind === "PHYSICAL") {
      const occurrence = lineage.occurrence;
      if (occurrence.routeId !== route.routeId
        || occurrence.occurrenceHash !== canonicalHash(payloadWithout(occurrence, "occurrenceHash"))) {
        return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
      }
      if (!canonicalRolePositions.has(occurrence.canonicalRolePosition)) {
        return { status: "REJECTED", reason: "OCCURRENCE_KEY_PAYLOAD_CONFLICT" };
      }
      const next = {
        disposition: occurrence.disposition,
        canonicalRolePosition: occurrence.canonicalRolePosition,
      };
      const previous = draftPhysical.get(occurrence.physicalCardId);
      if (previous !== undefined && canonicalSerialize(previous) !== canonicalSerialize(next)) {
        return { status: "REJECTED", reason: "OCCURRENCE_KEY_PAYLOAD_CONFLICT" };
      }
      draftPhysical.set(occurrence.physicalCardId, {
        disposition: lineage.occurrence.disposition,
        canonicalRolePosition: lineage.occurrence.canonicalRolePosition,
      });
    }
  }
  const physicalIds = new Set(route.endpointFacts.accountedPhysicalCardIds);
  const indexes = context.components.get(record.component.resourceComponentId);
  if (indexes === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
  for (const resourceUnitId of closure.resourceUnitIds) {
    const unit = indexes.units.byId.get(resourceUnitId);
    if (unit === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    unit.physicalCardIds.forEach((physicalCardId) => physicalIds.add(physicalCardId));
  }
  for (const [physicalCardId, draftEntry] of draftPhysical) {
    const routeDisposition = dispositionOf(route, physicalCardId);
    if (routeDisposition !== null && routeDisposition !== draftEntry.disposition) {
      return { status: "REJECTED", reason: "OCCURRENCE_KEY_PAYLOAD_CONFLICT" };
    }
    if (!physicalIds.has(physicalCardId)) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" };
    }
  }
  for (const physicalCardId of route.endpointFacts.accountedPhysicalCardIds) {
    if (!draftPhysical.has(physicalCardId)) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" };
    }
  }
  for (const physicalCardId of [...physicalIds].sort(compareText)) {
    const disposition = draftPhysical.get(physicalCardId)?.disposition
      ?? dispositionOf(route, physicalCardId);
    const payload = {
      routeId: route.routeId,
      physicalCardId,
      disposition: disposition ?? null,
      canonicalRolePosition: draftPhysical.get(physicalCardId)?.canonicalRolePosition ?? null,
    };
    const issue = addOccurrence(accumulator.physical,
      [route.routeId, physicalCardId], payload);
    if (issue !== null) return issue;
  }
  const wildcardLineages: StrategicWildcardAllocationLineageV1[] = [];
  route.resourceClaims.forEach((claim) => wildcardLineages.push(...claim.wildcardAllocationLineage));
  route.branchLocalResolutionWitnesses.forEach((witness) =>
    witness.allocations.forEach((allocation) => wildcardLineages.push(...allocation.wildcardAllocationLineage)));
  for (const alternativeId of closure.alternativeFactIds) {
    const alternative = indexes.alternatives.byId.get(alternativeId);
    if (alternative === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    wildcardLineages.push(...alternative.wildcardAllocationLineage);
  }
  for (const resourceUnitId of closure.resourceUnitIds) {
    const unit = indexes.units.byId.get(resourceUnitId);
    if (unit === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    wildcardLineages.push(...unit.wildcardAllocationLineage);
  }
  for (const lineage of wildcardLineages) {
    for (const wildcardCardId of [...lineage.wildcardCardIds].sort(compareText)) {
      const payload = {
        routeId: route.routeId,
        wildcardCardId,
        allocationVariantHash: lineage.allocationVariantHash,
        canonicalGroupType: lineage.canonicalGroupType,
        wildcardCardIds: [...lineage.wildcardCardIds].sort(compareText),
      };
      const issue = addOccurrence(accumulator.wildcard,
        [route.routeId, wildcardCardId, lineage.allocationVariantHash], payload);
      if (issue !== null) return issue;
    }
  }
  for (const claim of route.resourceClaims) {
    for (const memberId of claim.memberIds) {
      const payload = { routeId: route.routeId, familyId: claim.familyId, memberId };
      const issue = addOccurrence(accumulator.familyMember,
        [route.routeId, claim.familyId, memberId], payload);
      if (issue !== null) return issue;
    }
  }
  for (const alternativeId of closure.alternativeFactIds) {
    const alternative = indexes.alternatives.byId.get(alternativeId);
    if (alternative === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    const payload = {
      routeId: route.routeId,
      familyId: alternative.familyId,
      memberId: alternative.memberId,
    };
    const issue = addOccurrence(accumulator.familyMember,
      [route.routeId, alternative.familyId, alternative.memberId], payload);
    if (issue !== null) return issue;
  }
  for (const reservationFactId of closure.reservationFactIds) {
    const fact = indexes.reservationFacts.byId.get(reservationFactId);
    if (fact === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    const issue = addOccurrence(accumulator.reservation,
      [route.routeId, reservationFactId], { routeId: route.routeId, reservationFactId, reservationHash: fact.reservationHash });
    if (issue !== null) return issue;
  }
  for (const conflictFactId of closure.conflictFactIds) {
    const conflict = indexes.conflicts.byId.get(conflictFactId);
    if (conflict === undefined) return { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" };
    const issue = addOccurrence(accumulator.conflict,
      [route.routeId, conflictFactId], { routeId: route.routeId, conflictFactId, conflictHash: conflict.conflictHash });
    if (issue !== null) return issue;
  }
  const routeKey = routeKeyOf(route.routeId, route.routeHash);
  for (const endpoint of context.endpointReferencesByRouteKey.get(routeKey) ?? []) {
    const routeReference = { routeId: route.routeId, routeHash: route.routeHash };
    const issue = addOccurrence(accumulator.endpoint,
      [route.routeId, endpoint.componentEndpointId], {
        routeId: route.routeId,
        componentEndpointId: endpoint.componentEndpointId,
        endpointHash: endpoint.endpointHash,
        routeReference,
      });
    if (issue !== null) return issue;
  }
  return null;
}

function addOccurrence<K extends readonly string[]>(
  target: Map<string, Task4OccurrenceEntryV1<K>>,
  key: K,
  payload: unknown,
): Task4IssueV1 | null {
  const keyString = canonicalSerialize(key);
  const payloadHash = canonicalHash(payload);
  const previous = target.get(keyString);
  if (previous !== undefined && previous.payloadHash !== payloadHash) {
    return { status: "REJECTED", reason: "OCCURRENCE_KEY_PAYLOAD_CONFLICT" };
  }
  if (previous === undefined) target.set(keyString, { key, payloadHash });
  return null;
}

function occurrenceUniverseOf(
  routeRecords: readonly Task4RouteRecordV1[],
  accumulator: Task4OccurrenceAccumulatorV1,
): PhaseDRouteOccurrenceUniverseV1 {
  const payload = {
    sourceRouteIds: [...new Set(routeRecords.map((record) => record.route.routeId))].sort(compareText),
    physicalOccurrenceKeys: keysOf(accumulator.physical),
    wildcardOccurrenceKeys: keysOf(accumulator.wildcard),
    familyMemberOccurrenceKeys: keysOf(accumulator.familyMember),
    reservationOccurrenceKeys: keysOf(accumulator.reservation),
    conflictOccurrenceKeys: keysOf(accumulator.conflict),
    endpointOccurrenceKeys: keysOf(accumulator.endpoint),
  };
  return { ...payload, occurrenceUniverseHash: canonicalHash(payload) };
}

function keysOf<K extends readonly string[]>(entries: ReadonlyMap<string, Task4OccurrenceEntryV1<K>>): readonly K[] {
  return [...entries.values()].map((entry) => entry.key).sort(compareTuple);
}

function referenceOf(
  kind: StrategicConflictClosureReferenceV1["referenceKind"],
  value: Readonly<Record<string, unknown>>,
): StrategicConflictClosureReferenceV1 {
  const idField = kind === "RESERVATION_FACT" ? "reservationFactId"
    : kind === "RESERVATION_ALTERNATIVE" ? "alternativeReservationFactId"
      : kind === "CONFLICT_FACT" ? "conflictFactId"
        : kind === "RESOURCE_UNIT" ? "resourceUnitId" : "claimId";
  const hashField = kind === "RESERVATION_FACT" ? "reservationHash"
    : kind === "RESERVATION_ALTERNATIVE" ? "alternativeHash"
      : kind === "CONFLICT_FACT" ? "conflictHash"
        : kind === "RESOURCE_UNIT" ? "resourceUnitHash" : "claimHash";
  return {
    referenceKind: kind,
    referenceId: String(value[idField]),
    referenceHash: String(value[hashField]),
  };
}

function dedupeReferences(values: readonly StrategicConflictClosureReferenceV1[]): readonly StrategicConflictClosureReferenceV1[] {
  const result = new Map<string, StrategicConflictClosureReferenceV1>();
  for (const value of values) {
    const key = referenceKeyOf(value);
    const previous = result.get(key);
    if (previous === undefined) result.set(key, value);
  }
  return [...result.values()].sort(compareReference);
}

function referenceKeyOf(reference: StrategicConflictClosureReferenceV1): string {
  return `${reference.referenceKind}:${reference.referenceId}`;
}

function compareReference(left: StrategicConflictClosureReferenceV1, right: StrategicConflictClosureReferenceV1): number {
  const kindOrder = (kind: string) => TASK4_REFERENCE_KIND_ORDER.indexOf(kind);
  return kindOrder(left.referenceKind) - kindOrder(right.referenceKind)
    || compareText(left.referenceId, right.referenceId)
    || compareText(left.referenceHash, right.referenceHash);
}

function compareEdge(left: StrategicConflictClosureEdgeV1, right: StrategicConflictClosureEdgeV1): number {
  return compareReference(left.sourceReference, right.sourceReference)
    || compareReference(left.targetReference, right.targetReference)
    || compareText(left.edgeHash, right.edgeHash);
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? "";
    const rightValue = right[index] ?? "";
    const compared = compareText(leftValue, rightValue);
    if (compared !== 0) return compared;
  }
  return 0;
}

function compareRouteRecord(left: Task4RouteRecordV1, right: Task4RouteRecordV1): number {
  return compareText(left.route.routeId, right.route.routeId)
    || compareText(left.route.routeHash, right.route.routeHash)
    || compareText(left.component.resourceComponentId, right.component.resourceComponentId);
}

function routeKeyOf(routeId: string, routeHash: string): string {
  return `${routeId}:${routeHash}`;
}

function payloadWithout(value: Readonly<Record<string, unknown>>, property: string): Record<string, unknown> {
  const payload = { ...value };
  delete payload[property];
  return payload;
}

function dispositionOf(
  route: StrategicRouteCandidateFactV1,
  physicalCardId: string,
): StrategicResourceDispositionV1 | null {
  if (route.preservedResources.includes(physicalCardId)) return "PRESERVED";
  if (route.consumedResources.includes(physicalCardId)) return "CONSUMED";
  if (route.endpointFacts.remainderPhysicalCardIds.includes(physicalCardId)) return "REMAINDER";
  return null;
}

type Task5RecordV1 = Readonly<{
  component: PhaseDComponentSourceBindingV1;
  route: StrategicRouteCandidateFactV1;
  draft: NormalizedRouteCohortMemberDraftV1;
  closure: RouteRelevantConflictClosureV1;
}>;

type Task6StageATamperV1 = (
  index: number,
  cohortInterface: StrategicCohortInterfaceV1,
) => StrategicCohortInterfaceV1;

type Task6StageAResultV1 =
  | Readonly<{ kind: "ISSUE"; issue: Task5IssueV1 }>
  | Readonly<{ kind: "BUDGET_TERMINAL"; snapshot: Task6AccumulatorSnapshotV1 }>
  | Readonly<{
    kind: "COMPLETE";
    records: readonly Task5RecordV1[];
    envelopes: readonly RouteCohortMemberEnvelopeV1[];
    cohortInterfaceByHash: ReadonlyMap<string, StrategicCohortInterfaceV1>;
    memberCohort: ReadonlyMap<string, StrategicCohortInterfaceV1>;
    accumulator: Task6MeasurementAccumulatorV1;
    snapshot: Task6AccumulatorSnapshotV1;
  }>;

function materializeTask6StageAV1(
  input: PhaseDTask5InputV1,
  cohortInterfaceTamper?: Task6StageATamperV1,
): Task6StageAResultV1 {
  const issueOrRecords = task5RecordsOf(input);
  if ("issue" in issueOrRecords) return { kind: "ISSUE", issue: issueOrRecords.issue };
  const records = issueOrRecords.records;
  if (records.length === 0) {
    return { kind: "ISSUE", issue: { status: "INCONCLUSIVE", reason: "EMPTY_SOURCE_ROUTE_UNIVERSE" } };
  }

  let accumulator: Task6MeasurementAccumulatorV1;
  try {
    accumulator = createTask6MeasurementAccumulatorV1(input.evidenceBudget, sourceBindingsOf(input.admission));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid Task6 limit for ")) {
      return { kind: "ISSUE", issue: { status: "INCONCLUSIVE", reason: "INVALID_BUDGET" } };
    }
    throw error;
  }

  const endpointIndex = endpointIndexOf(input.admission);
  const stageARecords = [...records].sort(compareTask6StageARecord);
  const envelopes: RouteCohortMemberEnvelopeV1[] = [];
  const envelopeIdentity = new Map<string, string>();
  const cohortInterfaceByHash = new Map<string, StrategicCohortInterfaceV1>();
  const memberCohort = new Map<string, StrategicCohortInterfaceV1>();

  for (let index = 0; index < stageARecords.length; index += 1) {
    const record = stageARecords[index]!;
    const result = memberEnvelopeOf(record, input.admission, endpointIndex.endpointProjectionsByRoute);
    if ("issue" in result) return { kind: "ISSUE", issue: result.issue };
    const envelope = result.value;
    if (envelope.memberEnvelopeHash !== canonicalHash(payloadWithout(envelope, "memberEnvelopeHash"))) {
      return { kind: "ISSUE", issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }

    const priorRouteHash = envelopeIdentity.get(envelope.routeId);
    if (priorRouteHash !== undefined && priorRouteHash !== envelope.routeHash) {
      return { kind: "ISSUE", issue: { status: "REJECTED", reason: "ROUTE_ID_HASH_CONFLICT" } };
    }
    envelopeIdentity.set(envelope.routeId, envelope.routeHash);

    const derivedCohortInterface = cohortInterfaceOf(envelope);
    if (!validTask6CohortInterface(derivedCohortInterface)) {
      return { kind: "ISSUE", issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }
    const cohortInterface = cohortInterfaceTamper === undefined
      ? derivedCohortInterface
      : cohortInterfaceTamper(index, derivedCohortInterface);
    const cohortAdmission = task6CohortAdmissionOf(cohortInterfaceByHash, cohortInterface);
    if (cohortAdmission.issue !== null) return { kind: "ISSUE", issue: cohortAdmission.issue };
    const applyResult = accumulator.applyVerifiedEvent({
      MEMBER_ENVELOPE_COUNT: 1,
      RESOURCE_ROLE_SLOT_COUNT: envelope.resourceInterface.canonicalRoleSlots.length,
      CONFLICT_CLOSURE_EDGE_COUNT: record.closure.traversedReferenceEdges.length,
      COHORT_COUNT: cohortAdmission.isNewCohort ? 1 : 0,
    }, {
      stage: "STAGE_A_ROUTE",
      sourceRouteUniverseHash: envelope.sourceRouteUniverseHash,
      routeId: envelope.routeId,
      routeHash: envelope.routeHash,
    });
    if (applyResult.terminal) {
      if (applyResult.snapshot === null) throw new Error("Task6 Stage-A terminal snapshot missing");
      return { kind: "BUDGET_TERMINAL", snapshot: applyResult.snapshot };
    }

    envelopes.push(envelope);
    memberCohort.set(envelope.memberEnvelopeHash, cohortInterface);
    if (cohortAdmission.isNewCohort) cohortInterfaceByHash.set(cohortInterface.cohortInterfaceHash, cohortInterface);
  }

  for (const dimension of [
    "MEMBER_ENVELOPE_COUNT",
    "RESOURCE_ROLE_SLOT_COUNT",
    "CONFLICT_CLOSURE_EDGE_COUNT",
    "COHORT_COUNT",
  ] as const) {
    accumulator.finalizeExactDimension(dimension);
  }

  return {
    kind: "COMPLETE",
    records: stageARecords,
    envelopes,
    cohortInterfaceByHash,
    memberCohort,
    accumulator,
    snapshot: accumulator.terminalSnapshot(),
  };
}

function compareTask6StageARecord(left: Task5RecordV1, right: Task5RecordV1): number {
  return compareText(left.draft.sourceRouteUniverseHash, right.draft.sourceRouteUniverseHash)
    || compareText(left.route.routeId, right.route.routeId)
    || compareText(left.route.routeHash, right.route.routeHash);
}

function validTask6CohortInterface(cohortInterface: StrategicCohortInterfaceV1): boolean {
  return cohortInterface.cohortInterfaceHash === canonicalHash(payloadWithout(cohortInterface, "cohortInterfaceHash"));
}

type Task5EndpointProjectionV1 = Readonly<{
  componentEndpointId: string;
  resourceComponentId: string;
  sourceArtifactHash: string;
  sourceRouteUniverseHash: string;
  andComponentSetHash: string;
  endpointHash: string;
  semanticBoundary: StrategicComponentAndEndpointReferenceV1["semanticBoundary"];
  dependencyArity: number;
}>;

type Task5EndpointIndexV1 = Readonly<{
  endpointByComponentId: ReadonlyMap<string, Task5EndpointProjectionV1>;
  endpointProjectionByHash: ReadonlyMap<string, Task5EndpointProjectionV1>;
  endpointProjectionsByRoute: ReadonlyMap<string, readonly Task5EndpointProjectionV1[]>;
  endpointRouteEdgeCount: number;
}>;

type Task5IssueV1 = Readonly<{
  status: "INCONCLUSIVE" | "REJECTED";
  reason: StrategicCohortCompressionReasonCodeV1;
}>;

type Task6CohortAdmissionV1 = Readonly<{
  issue: Task5IssueV1 | null;
  isNewCohort: boolean;
}>;

function task6CohortAdmissionOf(
  cohortInterfaceByHash: ReadonlyMap<string, StrategicCohortInterfaceV1>,
  cohortInterface: StrategicCohortInterfaceV1,
): Task6CohortAdmissionV1 {
  const previous = cohortInterfaceByHash.get(cohortInterface.cohortInterfaceHash);
  if (previous !== undefined && canonicalSerialize(previous) !== canonicalSerialize(cohortInterface)) {
    return {
      issue: { status: "REJECTED", reason: "SIGNATURE_HASH_PAYLOAD_CONFLICT" },
      isNewCohort: false,
    };
  }
  return { issue: null, isNewCohort: previous === undefined };
}

type Task6MappingResultV1 =
  | Readonly<{ value: StrategicRouteCohortMappingFactV1 }>
  | Readonly<{ issue: Task5IssueV1 }>;

function task6MappingOf(
  envelope: RouteCohortMemberEnvelopeV1,
  cohortInterface: StrategicCohortInterfaceV1,
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[],
): Task6MappingResultV1 {
  const mappingPayload = {
    routeId: envelope.routeId,
    routeHash: envelope.routeHash,
    memberEnvelopeHash: envelope.memberEnvelopeHash,
    cohortId: cohortIdOf(cohortInterface),
    cohortInterfaceHash: cohortInterface.cohortInterfaceHash,
    fourSignatureHashes: cohortInterface.fourSignatureHashes,
    sourceHashBindings,
  };
  const mapping = { ...mappingPayload, mappingHash: canonicalHash(mappingPayload) };
  if (mapping.routeId !== envelope.routeId
    || mapping.routeHash !== envelope.routeHash
    || mapping.memberEnvelopeHash !== envelope.memberEnvelopeHash
    || mapping.cohortInterfaceHash !== cohortInterface.cohortInterfaceHash
    || canonicalSerialize(mapping.fourSignatureHashes) !== canonicalSerialize(cohortInterface.fourSignatureHashes)
    || canonicalSerialize(mapping.sourceHashBindings) !== canonicalSerialize(sourceHashBindings)
    || canonicalSerialize(cohortInterfaceOf(envelope)) !== canonicalSerialize(cohortInterface)
    || mapping.mappingHash !== canonicalHash(payloadWithout(mapping, "mappingHash"))) {
    return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
  }
  return { value: mapping };
}

type Task6ProofResultV1 =
  | Readonly<{ value: StrategicCohortMembershipProofV1 }>
  | Readonly<{ issue: Task5IssueV1 }>;

type Task6StageDObserverV1 = (witness: StrategicCohortCoverageWitnessV1) => void;

type Task6CoverageWitnessSeedV1 = Readonly<{
  occurrenceKind: StrategicCohortCoverageWitnessV1["occurrenceKind"];
  occurrenceKey: readonly string[];
  occurrenceHash: string;
  memberEnvelopeHash: string;
  mappingHash: string;
  proofHash: string;
  sourceRouteUniverseHash: string;
  routeId: string;
  routeHash: string;
}>;

type Task6CoveragePreparationV1 = Readonly<{
  sourceOccurrenceUniverseHash: string;
  sourceRouteIds: readonly string[];
  coveredRouteIds: readonly string[];
  inputPhysicalOccurrenceCount: number;
  coveredPhysical: readonly (readonly string[])[];
  inputWildcardOccurrenceCount: number;
  coveredWildcard: readonly (readonly string[])[];
  inputFamilyMemberOccurrenceCount: number;
  coveredFamily: readonly (readonly string[])[];
  inputReservationOccurrenceCount: number;
  coveredReservation: readonly (readonly string[])[];
  inputConflictOccurrenceCount: number;
  coveredConflict: readonly (readonly string[])[];
  inputEndpointOccurrenceCount: number;
  coveredEndpoint: readonly (readonly string[])[];
  seeds: readonly Task6CoverageWitnessSeedV1[];
}>;

type Task6StageDResultV1 =
  | Readonly<{ kind: "ISSUE"; issue: Task5IssueV1 }>
  | Readonly<{ kind: "BUDGET_TERMINAL"; snapshot: Task6AccumulatorSnapshotV1 }>
  | Readonly<{ kind: "COMPLETE"; coverage: StrategicCohortCoverageManifestV1 }>;

function task6ProofOf(
  envelope: RouteCohortMemberEnvelopeV1,
  cohortInterface: StrategicCohortInterfaceV1,
  mapping: StrategicRouteCohortMappingFactV1,
  sourceHashBindings: readonly StrategicCohortSourceHashBindingV1[],
): Task6ProofResultV1 {
  const canonicalRolePositionBijectionWitness = canonicalRoleWitnessOf(envelope);
  const proofPayload = {
    routeId: envelope.routeId,
    routeHash: envelope.routeHash,
    memberEnvelopeHash: envelope.memberEnvelopeHash,
    cohortInterfaceHash: cohortInterface.cohortInterfaceHash,
    fourSignatureHashes: cohortInterface.fourSignatureHashes,
    mappingHash: mapping.mappingHash,
    canonicalRolePositionBijectionWitness,
    sourceHashBindings,
  };
  const proof = { ...proofPayload, proofHash: canonicalHash(proofPayload) };
  if (proof.routeId !== envelope.routeId
    || proof.routeHash !== envelope.routeHash
    || proof.memberEnvelopeHash !== envelope.memberEnvelopeHash
    || proof.cohortInterfaceHash !== mapping.cohortInterfaceHash
    || proof.mappingHash !== mapping.mappingHash
    || canonicalSerialize(proof.fourSignatureHashes) !== canonicalSerialize(cohortInterface.fourSignatureHashes)
    || canonicalSerialize(proof.canonicalRolePositionBijectionWitness)
      !== canonicalSerialize(canonicalRolePositionBijectionWitness)
    || canonicalSerialize(proof.sourceHashBindings) !== canonicalSerialize(sourceHashBindings)
    || proof.proofHash !== canonicalHash(payloadWithout(proof, "proofHash"))) {
    return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
  }
  return { value: proof };
}

type HardCohortGateResultV1 = Readonly<{
  gateStatus: "COMPLETE" | "INCONCLUSIVE";
  distinctCohortCount: number;
  observedDistinctCohortLowerBound: number;
  exhausted: boolean;
}>;

/**
 * Internal post-interface seam used by the real Task 5 materializer. It accepts
 * only already-derived canonical interface hashes. The real materializer uses
 * the shared Task 5 terminal constructor for atomic publication.
 */
export function __task5PostDerivationHardGateV1(
  canonicalCohortKeys: readonly string[],
): Readonly<{ gate: HardCohortGateResultV1 }> {
  const gate = applyHardCohortGateV1(canonicalCohortKeys);
  return { gate };
}

/** Internal test-support seam for the compact endpoint index. */
export function __task5EndpointIndexForTest(
  admission: PhaseDSourceAdmissionSuccessV1,
): Readonly<{
  endpointByComponentId: ReadonlyMap<string, Task5EndpointProjectionV1>;
  endpointProjectionByHashCount: number;
  endpointProjectionsByRoute: ReadonlyMap<string, readonly Task5EndpointProjectionV1[]>;
  endpointRouteEdgeCount: number;
}> {
  const index = endpointIndexOf(admission);
  return {
    endpointByComponentId: index.endpointByComponentId,
    endpointProjectionByHashCount: index.endpointProjectionByHash.size,
    endpointProjectionsByRoute: index.endpointProjectionsByRoute,
    endpointRouteEdgeCount: index.endpointRouteEdgeCount,
  };
}

/** Internal deterministic cardinality gate; it accepts only canonical cohort keys. */
export function applyHardCohortGateV1(
  canonicalCohortKeys: readonly string[],
): HardCohortGateResultV1 {
  const distinct = new Set<string>();
  for (const key of canonicalCohortKeys) {
    distinct.add(key);
    if (distinct.size > HARD_MAX_COHORT_COUNT_V1) {
      return {
        gateStatus: "INCONCLUSIVE",
        distinctCohortCount: 0,
        observedDistinctCohortLowerBound: HARD_MAX_COHORT_COUNT_V1 + 1,
        exhausted: true,
      };
    }
  }
  return {
    gateStatus: "COMPLETE",
    distinctCohortCount: distinct.size,
    observedDistinctCohortLowerBound: distinct.size,
    exhausted: false,
  };
}

/** Task 5 materializes established facts while Task 6 accounts the verified Stage-A pass. */
function materializePhaseDTask5Internal(
  input: PhaseDTask5InputV1,
  onStageDWitnessConstructed?: Task6StageDObserverV1,
): HierarchicalStrategicCohortCompressionArtifactV1 {
  const stageA = materializeTask6StageAV1(input);
  if (stageA.kind === "ISSUE") return task5Terminal(input, stageA.issue);
  if (stageA.kind === "BUDGET_TERMINAL") return task6Terminal(input, stageA.snapshot);
  const records = stageA.records;
  const envelopes = [...stageA.envelopes];
  const cohortInterfaceByHash = new Map(stageA.cohortInterfaceByHash);
  const memberCohort = new Map(stageA.memberCohort);
  const accumulator = stageA.accumulator;

  const sourceBindings = sourceBindingsOf(input.admission);
  const mappings: StrategicRouteCohortMappingFactV1[] = [];
  const mappingByMember = new Map<string, StrategicRouteCohortMappingFactV1>();
  const membersByCohort = new Map<string, RouteCohortMemberEnvelopeV1[]>();
  const proofHashesByCohort = new Map<string, string[]>();
  for (const envelope of envelopes) {
    const cohortInterface = memberCohort.get(envelope.memberEnvelopeHash)!;
    const mappingResult = task6MappingOf(envelope, cohortInterface, sourceBindings);
    if ("issue" in mappingResult) return task5Terminal(input, mappingResult.issue);
    const mapping = mappingResult.value;
    const applyResult = accumulator.applyVerifiedEvent({ ROUTE_MAPPING_COUNT: 1 }, {
      stage: "STAGE_B_MAPPING",
      sourceRouteUniverseHash: envelope.sourceRouteUniverseHash,
      routeId: envelope.routeId,
      routeHash: envelope.routeHash,
    });
    if (applyResult.terminal) {
      if (applyResult.snapshot === null) throw new Error("Task6 Stage-B terminal snapshot missing");
      return task6Terminal(input, applyResult.snapshot);
    }
    mappings.push(mapping);
    mappingByMember.set(envelope.memberEnvelopeHash, mapping);
    const members = membersByCohort.get(cohortInterface.cohortInterfaceHash);
    if (members === undefined) membersByCohort.set(cohortInterface.cohortInterfaceHash, [envelope]);
    else members.push(envelope);
  }
  accumulator.finalizeExactDimension("ROUTE_MAPPING_COUNT");

  const proofs: StrategicCohortMembershipProofV1[] = [];
  const proofByMember = new Map<string, StrategicCohortMembershipProofV1>();
  for (const envelope of envelopes) {
    const cohortInterface = memberCohort.get(envelope.memberEnvelopeHash)!;
    const mapping = mappingByMember.get(envelope.memberEnvelopeHash);
    if (mapping === undefined) {
      return task5Terminal(input, { status: "INCONCLUSIVE", reason: "INCOMPLETE_ROUTE_MAPPING" });
    }
    const proofResult = task6ProofOf(envelope, cohortInterface, mapping, sourceBindings);
    if ("issue" in proofResult) return task5Terminal(input, proofResult.issue);
    const proof = proofResult.value;
    const applyResult = accumulator.applyVerifiedEvent({ EQUIVALENCE_PROOF_COUNT: 1 }, {
      stage: "STAGE_C_PROOF",
      sourceRouteUniverseHash: envelope.sourceRouteUniverseHash,
      routeId: envelope.routeId,
      routeHash: envelope.routeHash,
    });
    if (applyResult.terminal) {
      if (applyResult.snapshot === null) throw new Error("Task6 Stage-C terminal snapshot missing");
      return task6Terminal(input, applyResult.snapshot);
    }
    proofs.push(proof);
    proofByMember.set(envelope.memberEnvelopeHash, proof);
    const proofHashes = proofHashesByCohort.get(cohortInterface.cohortInterfaceHash);
    if (proofHashes === undefined) proofHashesByCohort.set(cohortInterface.cohortInterfaceHash, [proof.proofHash]);
    else proofHashes.push(proof.proofHash);
  }
  accumulator.finalizeExactDimension("EQUIVALENCE_PROOF_COUNT");

  const publicationIssue = validateTask5Publication(envelopes, mappings, proofs, cohortInterfaceByHash);
  if (publicationIssue !== null) return task5Terminal(input, publicationIssue);
  const stageD = materializeTask6StageDV1(
    input.task4.occurrenceUniverse!,
    envelopes,
    mappingByMember,
    proofByMember,
    accumulator,
    onStageDWitnessConstructed,
  );
  if (stageD.kind === "ISSUE") return task5Terminal(input, stageD.issue);
  if (stageD.kind === "BUDGET_TERMINAL") return task6Terminal(input, stageD.snapshot);
  const coverage = stageD.coverage;
  const completeSnapshot = accumulator.completeSnapshot();
  const cohorts = [...cohortInterfaceByHash.values()].map((cohortInterface) => {
    const cohortId = canonicalHash({ kind: "hierarchical-strategic-cohort-v1", cohortInterfaceHash: cohortInterface.cohortInterfaceHash });
    const memberEnvelopes = (membersByCohort.get(cohortInterface.cohortInterfaceHash) ?? [])
      .map((member) => member.memberEnvelopeHash).sort(compareText);
    const membershipProofHashes = [...(proofHashesByCohort.get(cohortInterface.cohortInterfaceHash) ?? [])].sort(compareText);
    const payload = { cohortId, cohortInterfaceHash: cohortInterface.cohortInterfaceHash, memberEnvelopeHashes: memberEnvelopes, membershipProofHashes };
    return { ...payload, cohortMaterializationHash: canonicalHash(payload) };
  }).sort((left, right) => compareText(left.cohortId, right.cohortId));
  const cohortInterfaces = [...cohortInterfaceByHash.values()].sort((left, right) =>
    compareText(left.cohortInterfaceHash, right.cohortInterfaceHash));
  const canonicalEnvelopes = [...envelopes].sort((left, right) => compareText(left.routeId, right.routeId) || compareText(left.routeHash, right.routeHash));
  const canonicalMappings = [...mappings].sort((left, right) => compareText(left.routeId, right.routeId)
    || compareText(left.routeHash, right.routeHash));
  const canonicalProofs = [...proofs].sort((left, right) => compareText(left.routeId, right.routeId)
    || compareText(left.routeHash, right.routeHash));
  const compressionRatioObservation = task6RatioObservationOf(
    input.admission.inputRouteCount,
    "COMPLETE",
    null,
    false,
    cohorts.length,
  );
  const payload = {
    schemaVersion: STRATEGIC_COHORT_COMPRESSION_V1_SCHEMA_VERSION,
    ...input.admission.canonicalSourceBindingManifest.commonBindings,
    sourceBindingManifestHash: input.admission.sourceBindingManifestHash,
    sourceComponentIds: input.admission.admittedComponents.map((component) => component.resourceComponentId).sort(compareText),
    sourceMultiComponentArtifactHash: input.admission.canonicalSourceBindingManifest.multiComponentArtifactHash,
    sourceAndComponentSetHash: input.admission.canonicalSourceBindingManifest.andComponentSetHash,
    compressionStatus: "COMPLETE" as const,
    evidenceBudget: input.evidenceBudget,
    budgetExecution: completeSnapshot.budgetExecution,
    cohorts,
    cohortInterfaces,
    routeToCohortMappings: canonicalMappings,
    memberEnvelopes: canonicalEnvelopes,
    equivalenceProofs: canonicalProofs,
    coverageManifest: coverage,
    cohortCount: cohorts.length,
    compressionRatioObservation,
    reasonCodes: [] as readonly StrategicCohortCompressionReasonCodeV1[],
    exhaustedDimensions: [] as const,
    cohortUniverseHash: canonicalHash({ cohorts, cohortInterfaces, mappings: canonicalMappings }),
    semanticBoundary: "HIERARCHICAL_STRATEGIC_COHORT_FACTS_NOT_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
}

export const materializePhaseDTask5V1: PhaseDTask5MaterializerV1 = (input) =>
  materializePhaseDTask5Internal(input);

/** Internal Task 6 Stage-A test seam; production materialization uses the same private pass without tampering. */
export function __task6StageAForTest(
  input: PhaseDTask5InputV1,
  cohortInterfaceTamper: Task6StageATamperV1,
): HierarchicalStrategicCohortCompressionArtifactV1 {
  const stageA = materializeTask6StageAV1(input, cohortInterfaceTamper);
  if (stageA.kind === "ISSUE") return task5Terminal(input, stageA.issue);
  if (stageA.kind === "BUDGET_TERMINAL") return task6Terminal(input, stageA.snapshot);
  throw new Error("Task6 Stage-A test seam requires a terminal outcome");
}

export function __task6StageDForTest(
  input: PhaseDTask5InputV1,
): Readonly<{
  result: HierarchicalStrategicCohortCompressionArtifactV1;
  constructedWitnessCount: number;
}> {
  let constructedWitnessCount = 0;
  const result = materializePhaseDTask5Internal(input, () => {
    constructedWitnessCount += 1;
  });
  return { result, constructedWitnessCount };
}

export function __task6RatioObservationForTest(
  inputRouteCount: number,
  compressionStatus: StrategicCohortCompressionStatusV1,
  positiveCohortLowerBound: number | null,
  budgetExhaustion: boolean,
  exactCompleteCohortCount?: number,
): HierarchicalStrategicCohortCompressionArtifactV1["compressionRatioObservation"] {
  return task6RatioObservationOf(
    inputRouteCount,
    compressionStatus,
    positiveCohortLowerBound,
    budgetExhaustion,
    exactCompleteCohortCount,
  );
}

type Task6CohortAdmissionTestResultV1 = Readonly<{
  status: "COMPLETE" | "INCONCLUSIVE" | "REJECTED";
  budgetExecution: StrategicCohortBudgetExecutionArtifactV1;
  exhaustedDimensions: readonly StrategicCohortBudgetDimensionV1[];
  reasonCodes: readonly StrategicCohortCompressionReasonCodeV1[];
  positiveCohortLowerBound: number | null;
}>;

/** Internal test-support seam for the same verified cohort admission operation used by Stage A. */
export function __task6CohortAdmissionForTest(
  cohortInterfaces: readonly StrategicCohortInterfaceV1[],
): Task6CohortAdmissionTestResultV1 {
  const accumulator = createTask6MeasurementAccumulatorV1({
    maxMemberEnvelopeCount: 1000,
    maxResourceRoleSlotCount: 1000,
    maxConflictClosureEdgeCount: 1000,
    maxRouteMappingCount: 1000,
    maxEquivalenceProofCount: 1000,
    maxLineageOccurrenceWitnessCount: 1000,
  });
  const cohortInterfaceByHash = new Map<string, StrategicCohortInterfaceV1>();

  for (const cohortInterface of cohortInterfaces) {
    if (!validTask6CohortInterface(cohortInterface)) {
      const snapshot = accumulator.terminalSnapshot();
      return {
        status: "REJECTED",
        budgetExecution: snapshot.budgetExecution,
        exhaustedDimensions: [],
        reasonCodes: ["SOURCE_HASH_PAYLOAD_MISMATCH"],
        positiveCohortLowerBound: snapshot.positiveCohortLowerBound,
      };
    }
    const cohortAdmission = task6CohortAdmissionOf(cohortInterfaceByHash, cohortInterface);
    if (cohortAdmission.issue !== null) {
      const snapshot = accumulator.terminalSnapshot();
      return {
        status: cohortAdmission.issue.status,
        budgetExecution: snapshot.budgetExecution,
        exhaustedDimensions: [],
        reasonCodes: [cohortAdmission.issue.reason],
        positiveCohortLowerBound: snapshot.positiveCohortLowerBound,
      };
    }
    const applyResult = accumulator.applyVerifiedEvent(
      { COHORT_COUNT: cohortAdmission.isNewCohort ? 1 : 0 },
      {
        stage: "STAGE_A_ROUTE",
        sourceRouteUniverseHash: null,
        routeId: cohortInterface.cohortInterfaceHash,
        routeHash: cohortInterface.cohortInterfaceHash,
      },
    );
    if (applyResult.terminal) {
      if (applyResult.snapshot === null) throw new Error("Task6 cohort admission terminal snapshot missing");
      return {
        status: "INCONCLUSIVE",
        budgetExecution: applyResult.snapshot.budgetExecution,
        exhaustedDimensions: applyResult.snapshot.exhaustedDimensions,
        reasonCodes: applyResult.snapshot.reasonCodes,
        positiveCohortLowerBound: applyResult.snapshot.positiveCohortLowerBound,
      };
    }
    if (cohortAdmission.isNewCohort) {
      cohortInterfaceByHash.set(cohortInterface.cohortInterfaceHash, cohortInterface);
    }
  }

  accumulator.finalizeExactDimension("COHORT_COUNT");
  const snapshot = accumulator.terminalSnapshot();
  return {
    status: "COMPLETE",
    budgetExecution: snapshot.budgetExecution,
    exhaustedDimensions: snapshot.exhaustedDimensions,
    reasonCodes: snapshot.reasonCodes,
    positiveCohortLowerBound: snapshot.positiveCohortLowerBound,
  };
}

/** Internal test-support seam; validates already materialized publication evidence. */
export function __validateTask5PublicationForTest(
  envelopes: readonly RouteCohortMemberEnvelopeV1[],
  mappings: readonly StrategicRouteCohortMappingFactV1[],
  proofs: readonly StrategicCohortMembershipProofV1[],
  cohortInterfaces: ReadonlyMap<string, StrategicCohortInterfaceV1>,
): Task5IssueV1 | null {
  return validateTask5Publication(envelopes, mappings, proofs, cohortInterfaces);
}

function validateTask5Publication(
  envelopes: readonly RouteCohortMemberEnvelopeV1[],
  mappings: readonly StrategicRouteCohortMappingFactV1[],
  proofs: readonly StrategicCohortMembershipProofV1[],
  cohortInterfaces: ReadonlyMap<string, StrategicCohortInterfaceV1>,
): Task5IssueV1 | null {
  const envelopeByHash = new Map<string, RouteCohortMemberEnvelopeV1>();
  const envelopeRouteHashById = new Map<string, string>();
  for (const envelope of envelopes) {
    if (envelope.memberEnvelopeHash !== canonicalHash(payloadWithout(envelope, "memberEnvelopeHash"))) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    const priorRouteHash = envelopeRouteHashById.get(envelope.routeId);
    if (priorRouteHash !== undefined && priorRouteHash !== envelope.routeHash) {
      return { status: "REJECTED", reason: "ROUTE_ID_HASH_CONFLICT" };
    }
    envelopeRouteHashById.set(envelope.routeId, envelope.routeHash);
    const previous = envelopeByHash.get(envelope.memberEnvelopeHash);
    if (previous !== undefined && canonicalSerialize(previous) !== canonicalSerialize(envelope)) {
      return { status: "REJECTED", reason: "SIGNATURE_HASH_PAYLOAD_CONFLICT" };
    }
    envelopeByHash.set(envelope.memberEnvelopeHash, envelope);
  }
  const mappingByMember = new Map<string, StrategicRouteCohortMappingFactV1>();
  const mappingMemberByRoute = new Map<string, string>();
  for (const mapping of mappings) {
    if (mappingByMember.has(mapping.memberEnvelopeHash)) {
      return { status: "REJECTED", reason: "MEMBER_ENVELOPE_HASH_CONFLICT" };
    }
    const envelope = envelopeByHash.get(mapping.memberEnvelopeHash);
    const cohortInterface = cohortInterfaces.get(mapping.cohortInterfaceHash);
    if (envelope === undefined || cohortInterface === undefined) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    const priorMember = mappingMemberByRoute.get(mapping.routeId);
    if (priorMember !== undefined && priorMember !== mapping.memberEnvelopeHash) {
      return { status: "REJECTED", reason: "MEMBER_ENVELOPE_HASH_CONFLICT" };
    }
    mappingMemberByRoute.set(mapping.routeId, mapping.memberEnvelopeHash);
    if (mapping.routeId !== envelope.routeId || mapping.routeHash !== envelope.routeHash
      || mapping.cohortId !== cohortIdOf(cohortInterface)
      || canonicalSerialize(mapping.fourSignatureHashes) !== canonicalSerialize(cohortInterface.fourSignatureHashes)
      || canonicalSerialize(cohortInterfaceOf(envelope)) !== canonicalSerialize(cohortInterface)
      || mapping.mappingHash !== canonicalHash(payloadWithout(mapping, "mappingHash"))) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    mappingByMember.set(mapping.memberEnvelopeHash, mapping);
  }
  const proofByMember = new Map<string, StrategicCohortMembershipProofV1>();
  for (const proof of proofs) {
    if (proofByMember.has(proof.memberEnvelopeHash)) {
      return { status: "REJECTED", reason: "MEMBER_ENVELOPE_HASH_CONFLICT" };
    }
    const mapping = mappingByMember.get(proof.memberEnvelopeHash);
    const cohortInterface = cohortInterfaces.get(proof.cohortInterfaceHash);
    const envelope = envelopeByHash.get(proof.memberEnvelopeHash);
    if (mapping === undefined) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_ROUTE_MAPPING" };
    }
    if (cohortInterface === undefined || envelope === undefined) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    if (proof.routeId !== envelope.routeId || proof.routeHash !== envelope.routeHash
      || proof.mappingHash !== mapping.mappingHash
      || proof.cohortInterfaceHash !== mapping.cohortInterfaceHash
      || canonicalSerialize(proof.fourSignatureHashes) !== canonicalSerialize(cohortInterface.fourSignatureHashes)
      || proof.proofHash !== canonicalHash(payloadWithout(proof, "proofHash"))
      || canonicalSerialize(proof.canonicalRolePositionBijectionWitness)
        !== canonicalSerialize(canonicalRoleWitnessOf(envelope))) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    proofByMember.set(proof.memberEnvelopeHash, proof);
  }
  for (const envelope of envelopes) {
    if (!mappingByMember.has(envelope.memberEnvelopeHash)) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_ROUTE_MAPPING" };
    }
    if (!proofByMember.has(envelope.memberEnvelopeHash)) {
      return { status: "INCONCLUSIVE", reason: "INCOMPLETE_EQUIVALENCE_PROOF" };
    }
  }
  return null;
}

function cohortIdOf(cohortInterface: StrategicCohortInterfaceV1): string {
  return canonicalHash({ kind: "hierarchical-strategic-cohort-v1", cohortInterfaceHash: cohortInterface.cohortInterfaceHash });
}

function task5RecordsOf(input: PhaseDTask5InputV1): Readonly<{ records: readonly Task5RecordV1[] }> | Readonly<{ issue: Task5IssueV1 }> {
  const admissionIntegrityIssue = admissionIntegrityIssueForTask5(input.admission);
  if (admissionIntegrityIssue !== null) return { issue: admissionIntegrityIssue };
  const task4IntegrityIssue = task4IntegrityIssueForTask5(input.task4);
  if (task4IntegrityIssue !== null) return { issue: task4IntegrityIssue };
  if (input.task4.task4Status !== "COMPLETE" || input.task4.routeRelevantConflictClosures === null
    || input.task4.occurrenceUniverse === null) {
    return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
  }
  const admission = input.admission;
  if (input.task4.sourceBindingManifestHash !== admission.sourceBindingManifestHash
    || input.task4.sourceAndComponentSetHash !== admission.canonicalSourceBindingManifest.andComponentSetHash) {
    return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
  }
  const drafts = new Map<string, NormalizedRouteCohortMemberDraftV1>();
  const draftRouteHashByRouteId = new Map<string, string>();
  for (const draft of input.normalizedMemberDrafts) {
    if (draft.normalizationHash !== canonicalHash(payloadWithout(draft, "normalizationHash"))) {
      return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }
    const priorRouteHash = draftRouteHashByRouteId.get(draft.routeId);
    if (priorRouteHash !== undefined && priorRouteHash !== draft.routeHash) {
      return { issue: { status: "REJECTED", reason: "ROUTE_ID_HASH_CONFLICT" } };
    }
    draftRouteHashByRouteId.set(draft.routeId, draft.routeHash);
    const key = routeKeyOf(draft.routeId, draft.routeHash);
    if (drafts.has(key)) return { issue: { status: "REJECTED", reason: "MEMBER_ENVELOPE_HASH_CONFLICT" } };
    drafts.set(key, draft);
  }
  const closures = new Map<string, RouteRelevantConflictClosureV1>();
  const closureHashByRouteId = new Map<string, string>();
  for (const closure of input.task4.routeRelevantConflictClosures) {
    if (closure.closureHash !== canonicalHash(payloadWithout(closure, "closureHash"))) {
      return { issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }
    const key = routeKeyOf(closure.routeId, closure.routeHash);
    const priorRouteHash = closureHashByRouteId.get(closure.routeId);
    if (priorRouteHash !== undefined && priorRouteHash !== closure.routeHash) {
      return { issue: { status: "REJECTED", reason: "ROUTE_ID_HASH_CONFLICT" } };
    }
    closureHashByRouteId.set(closure.routeId, closure.routeHash);
    if (closures.has(key)) return { issue: { status: "REJECTED", reason: "SIGNATURE_HASH_PAYLOAD_CONFLICT" } };
    closures.set(key, closure);
  }
  const endpointBindingIssue = endpointBindingIssueForTask5(admission);
  if (endpointBindingIssue !== null) return { issue: endpointBindingIssue };
  const records: Task5RecordV1[] = [];
  const admittedRouteKeys = new Set<string>();
  for (const component of canonicalComponentSources(admission.canonicalSourceBindingManifest.componentSources)) {
    for (const route of component.routeArtifact.routeCandidates ?? []) {
      const key = routeKeyOf(route.routeId, route.routeHash);
      admittedRouteKeys.add(key);
      const draft = drafts.get(key);
      const closure = closures.get(key);
      if (closure === undefined && closureHashByRouteId.has(route.routeId)) {
        return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
      }
      if (draft === undefined || closure === undefined) return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" } };
      if (draft.resourceComponentId !== component.resourceComponentId
        || draft.sourceArtifactHash !== component.routeArtifactHash
        || draft.sourceRouteUniverseHash !== component.routeUniverseHash
        || draft.sourceAndComponentSetHash !== admission.canonicalSourceBindingManifest.andComponentSetHash
        || closure.sourceArtifactHash !== component.routeArtifactHash) {
        return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
      }
      records.push({ component, route, draft, closure });
    }
  }
  for (const draftKey of drafts.keys()) {
    if (!admittedRouteKeys.has(draftKey)) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
  }
  if (records.length !== drafts.size || records.length !== closures.size) {
    return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" } };
  }
  const routeIds = new Set(records.map((record) => record.route.routeId));
  if (input.task4.occurrenceUniverse?.sourceRouteIds.some((routeId) => !routeIds.has(routeId)) === true) {
    return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
  }
  return { records: records.sort((left, right) => compareRouteRecord(left, right)) };
}

function admissionIntegrityIssueForTask5(admission: PhaseDSourceAdmissionSuccessV1): Task5IssueV1 | null {
  if (admission.admissionStatus !== "ADMITTED") {
    return { status: "INCONCLUSIVE", reason: "SOURCE_BINDING_INCOMPLETE" };
  }
  const manifest = admission.canonicalSourceBindingManifest;
  if (manifest.manifestHash !== canonicalHash(
    manifestPayloadOf(manifest, canonicalComponentSources(manifest.componentSources)),
  ) || admission.sourceBindingManifestHash !== manifest.manifestHash) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  if (manifest.multiComponentArtifactHash !== manifest.multiComponentArtifact.artifactHash
    || !selfBoundArtifact(manifest.multiComponentArtifact)) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  const c2Validation = validateMultiComponentArtifact(manifest.multiComponentArtifact);
  if (c2Validation === "INCOMPLETE") {
    return { status: "INCONCLUSIVE", reason: "SOURCE_BINDING_INCOMPLETE" };
  }
  if (c2Validation === "HASH_MISMATCH") {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  if (c2Validation === "BINDING_MISMATCH"
    || !sameKeyedComponentBindings(manifest.componentSources, manifest.multiComponentArtifact)) {
    return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
  }
  for (const component of canonicalComponentSources(manifest.componentSources)) {
    const componentValidation = validateComponentSelfBindings(component);
    if (componentValidation === "INCOMPLETE") {
      return { status: "INCONCLUSIVE", reason: "SOURCE_BINDING_INCOMPLETE" };
    }
    if (componentValidation === "HASH_MISMATCH") {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    if (componentValidation === "BINDING_MISMATCH") {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
  }
  const expectedPayload = {
    admissionStatus: "ADMITTED" as const,
    canonicalSourceBindingManifest: manifest,
    sourceBindingManifestHash: admission.sourceBindingManifestHash,
    admittedComponents: admission.admittedComponents,
    routeIdentityIndex: admission.routeIdentityIndex,
    inputRouteCount: admission.inputRouteCount,
  };
  if (admission.admissionHash !== canonicalHash(expectedPayload)) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  return null;
}

function endpointBindingIssueForTask5(
  admission: PhaseDSourceAdmissionSuccessV1,
): Task5IssueV1 | null {
  const endpoints = admission.canonicalSourceBindingManifest.multiComponentArtifact.andEndpointReferences;
  if (endpoints === null) {
    return { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" };
  }
  const componentsById = new Map(
    canonicalComponentSources(admission.canonicalSourceBindingManifest.componentSources)
      .map((component) => [component.resourceComponentId, component] as const),
  );
  const routesByKey = new Map<string, Readonly<{
    routeHash: string;
    resourceComponentId: string;
  }>>();
  const routeHashById = new Map<string, string>();
  for (const component of componentsById.values()) {
    for (const route of component.routeArtifact.routeCandidates ?? []) {
      routesByKey.set(routeKeyOf(route.routeId, route.routeHash), {
        routeHash: route.routeHash,
        resourceComponentId: component.resourceComponentId,
      });
      routeHashById.set(route.routeId, route.routeHash);
    }
  }
  for (const endpoint of endpoints) {
    const component = componentsById.get(endpoint.resourceComponentId);
    if (component === undefined) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    if (endpoint.andComponentSetHash !== admission.canonicalSourceBindingManifest.andComponentSetHash
      || endpoint.sourceArtifactHash !== component.routeArtifactHash
      || endpoint.sourceRouteUniverseHash !== component.routeUniverseHash) {
      return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
    }
    for (const reference of endpoint.routeReferences) {
      const route = routesByKey.get(routeKeyOf(reference.routeId, reference.routeHash));
      if (route === undefined) {
        if (routeHashById.has(reference.routeId)) {
          return { status: "REJECTED", reason: "ROUTE_ID_HASH_CONFLICT" };
        }
        return { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" };
      }
      if (route.resourceComponentId !== endpoint.resourceComponentId) {
        return { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" };
      }
    }
  }
  return null;
}

function task4IntegrityIssueForTask5(task4: PhaseDTask4ArtifactV1): Task5IssueV1 | null {
  if (task4.artifactHash !== canonicalHash(canonicalTask4Payload(task4))) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  if (task4.routeRelevantConflictClosures !== null) {
    for (const closure of task4.routeRelevantConflictClosures) {
      if (closure.closureHash !== canonicalHash(canonicalClosurePayload(closure))) {
        return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
      }
    }
  }
  const universe = task4.occurrenceUniverse;
  if (universe !== null
    && universe.occurrenceUniverseHash !== canonicalHash(canonicalOccurrenceUniversePayload(universe))) {
    return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
  }
  return null;
}

function canonicalTask4Payload(task4: PhaseDTask4ArtifactV1) {
  const { artifactHash: _artifactHash, ...payload } = task4;
  return {
    ...payload,
    routeRelevantConflictClosures: payload.routeRelevantConflictClosures === null
      ? null
      : [...payload.routeRelevantConflictClosures].sort(compareCanonicalPayload),
    occurrenceUniverse: payload.occurrenceUniverse === null
      ? null
      : {
        ...canonicalOccurrenceUniversePayload(payload.occurrenceUniverse),
        occurrenceUniverseHash: payload.occurrenceUniverse.occurrenceUniverseHash,
      },
  };
}

function canonicalClosurePayload(closure: RouteRelevantConflictClosureV1) {
  const { closureHash: _closureHash, ...payload } = closure;
  return {
    ...payload,
    seedReferences: [...payload.seedReferences].sort(compareReference),
    traversedReferenceEdges: [...payload.traversedReferenceEdges].sort(compareEdge),
    reservationFactIds: [...payload.reservationFactIds].sort(compareText),
    alternativeFactIds: [...payload.alternativeFactIds].sort(compareText),
    conflictFactIds: [...payload.conflictFactIds].sort(compareText),
    resourceUnitIds: [...payload.resourceUnitIds].sort(compareText),
    branchLocalResolutionWitnesses: [...payload.branchLocalResolutionWitnesses].sort(compareCanonicalPayload),
  };
}

function canonicalOccurrenceUniversePayload(universe: PhaseDRouteOccurrenceUniverseV1) {
  const { occurrenceUniverseHash: _occurrenceUniverseHash, ...payload } = universe;
  return {
    ...payload,
    sourceRouteIds: [...payload.sourceRouteIds].sort(compareText),
    physicalOccurrenceKeys: [...payload.physicalOccurrenceKeys].sort(compareTuple),
    wildcardOccurrenceKeys: [...payload.wildcardOccurrenceKeys].sort(compareTuple),
    familyMemberOccurrenceKeys: [...payload.familyMemberOccurrenceKeys].sort(compareTuple),
    reservationOccurrenceKeys: [...payload.reservationOccurrenceKeys].sort(compareTuple),
    conflictOccurrenceKeys: [...payload.conflictOccurrenceKeys].sort(compareTuple),
    endpointOccurrenceKeys: [...payload.endpointOccurrenceKeys].sort(compareTuple),
  };
}

function memberEnvelopeOf(
  record: Task5RecordV1,
  admission: PhaseDSourceAdmissionSuccessV1,
  endpointProjectionsByRoute: ReadonlyMap<string, readonly Task5EndpointProjectionV1[]>,
): Readonly<{ value: RouteCohortMemberEnvelopeV1 }> | Readonly<{ issue: Task5IssueV1 }> {
  const { route, draft, closure, component } = record;
  const alternatives = new Map(component.reservationArtifact.reservationAlternatives.map((value) =>
    [value.alternativeReservationFactId, value]));
  const conflicts = new Map(component.reservationArtifact.conflictFacts.map((value) => [value.conflictFactId, value]));
  const reservations = new Map(component.reservationArtifact.reservationFacts.map((value) => [value.reservationFactId, value]));
  const conflictFacts = closure.conflictFactIds.map((id) => conflicts.get(id));
  const reservationFacts = closure.reservationFactIds.map((id) => reservations.get(id));
  const alternativeFacts = closure.alternativeFactIds.map((id) => alternatives.get(id));
  if (conflictFacts.some((value) => value === undefined) || reservationFacts.some((value) => value === undefined)
    || alternativeFacts.some((value) => value === undefined)) {
    return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
  }
  const conflictInterfaceResult = conflictInterfaceOf(
    route,
    closure,
    conflictFacts as readonly StrategicReservationConflictFactV1[],
    reservationFacts as readonly StrategicResourceReservationFactV1[],
    alternativeFacts as readonly StrategicReservationAlternativeFactV1[],
    allocationPayloadIndexOf(component.hierarchyBatch),
  );
  if ("issue" in conflictInterfaceResult) return conflictInterfaceResult;
  const conflictInterface = conflictInterfaceResult.value;
  const endpointProjections = endpointProjectionsByRoute.get(routeKeyOf(route.routeId, route.routeHash)) ?? [];
  const endpointInterface = endpointInterfaceOf(route, draft, endpointProjections);
  const lineage = lineageOf(route, draft, closure, reservationFacts as readonly StrategicResourceReservationFactV1[],
    conflictFacts as readonly StrategicReservationConflictFactV1[], alternativeFacts as readonly StrategicReservationAlternativeFactV1[], endpointProjections);
  if ("issue" in lineage) return lineage;
  const payload = {
    routeId: route.routeId,
    routeHash: route.routeHash,
    resourceComponentId: draft.resourceComponentId,
    sourceArtifactHash: draft.sourceArtifactHash,
    sourceRouteUniverseHash: draft.sourceRouteUniverseHash,
    sourceAndComponentSetHash: draft.sourceAndComponentSetHash,
    normalizationHash: draft.normalizationHash,
    structuralInterface: draft.structuralInterface,
    resourceInterface: draft.resourceInterface,
    canonicalResourceRoleVector: draft.canonicalResourceRoleVector,
    routeRelevantConflictClosure: closure,
    conflictInterface,
    endpointInterface,
    ...lineage.value,
    upstreamProvenanceHashes: [draft.normalizationHash, closure.closureHash, component.reservationArtifactHash,
      component.routeArtifactHash, canonicalSourceBindingManifestHashOf(admission)].sort(compareText),
  };
  return { value: { ...payload, memberEnvelopeHash: canonicalHash(payload) } };
}

function endpointProjectionOf(
  endpoint: StrategicComponentAndEndpointReferenceV1,
): Task5EndpointProjectionV1 {
  return {
    componentEndpointId: endpoint.componentEndpointId,
    resourceComponentId: endpoint.resourceComponentId,
    sourceArtifactHash: endpoint.sourceArtifactHash,
    sourceRouteUniverseHash: endpoint.sourceRouteUniverseHash,
    andComponentSetHash: endpoint.andComponentSetHash,
    endpointHash: endpoint.endpointHash,
    semanticBoundary: endpoint.semanticBoundary,
    dependencyArity: endpoint.routeReferences.length,
  };
}

function endpointIndexOf(
  admission: PhaseDSourceAdmissionSuccessV1,
): Task5EndpointIndexV1 {
  const endpointByComponentId = new Map<string, Task5EndpointProjectionV1>();
  const endpointProjectionByHash = new Map<string, Task5EndpointProjectionV1>();
  const endpointProjectionsByRoute = new Map<string, Task5EndpointProjectionV1[]>();
  const endpointIdsByRoute = new Map<string, Set<string>>();
  let endpointRouteEdgeCount = 0;
  for (const endpoint of admission.canonicalSourceBindingManifest.multiComponentArtifact.andEndpointReferences ?? []) {
    const projection = endpointProjectionOf(endpoint);
    endpointByComponentId.set(endpoint.resourceComponentId, projection);
    endpointProjectionByHash.set(endpoint.endpointHash, projection);
    for (const reference of endpoint.routeReferences) {
      endpointRouteEdgeCount += 1;
      const key = routeKeyOf(reference.routeId, reference.routeHash);
      const ids = endpointIdsByRoute.get(key);
      if (ids === undefined) {
        endpointIdsByRoute.set(key, new Set([projection.componentEndpointId]));
        endpointProjectionsByRoute.set(key, [projection]);
      } else if (!ids.has(projection.componentEndpointId)) {
        ids.add(projection.componentEndpointId);
        endpointProjectionsByRoute.get(key)!.push(projection);
      }
    }
  }
  for (const entries of endpointProjectionsByRoute.values()) {
    entries.sort(compareEndpointProjection);
  }
  return {
    endpointByComponentId,
    endpointProjectionByHash,
    endpointProjectionsByRoute,
    endpointRouteEdgeCount,
  };
}

function compareEndpointProjection(
  left: Task5EndpointProjectionV1,
  right: Task5EndpointProjectionV1,
): number {
  return compareText(left.componentEndpointId, right.componentEndpointId)
    || compareText(left.endpointHash, right.endpointHash);
}

function conflictInterfaceOf(
  route: StrategicRouteCandidateFactV1,
  closure: RouteRelevantConflictClosureV1,
  conflicts: readonly StrategicReservationConflictFactV1[],
  reservations: readonly StrategicResourceReservationFactV1[],
  alternatives: readonly StrategicReservationAlternativeFactV1[],
  allocationPayloadByHash: ResourceReplayContextV1["allocationPayloadByHash"],
): Readonly<{ value: StrategicCohortConflictInterfaceV1 }> | Readonly<{ issue: Task5IssueV1 }> {
  const claims = reservations.flatMap((reservation) => reservation.claims);
  const claimById = uniqueMap(claims, (claim) => claim.claimId);
  if (claimById === null) return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
  const alternativeById = uniqueMap(alternatives, (alternative) => alternative.alternativeReservationFactId);
  if (alternativeById === null) return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
  const allocationInterfaceOf = (
    alternative: StrategicReservationAlternativeFactV1,
  ): StrategicCohortWildcardAllocationInterfaceV1 | Task5IssueV1 => {
    const semanticAllocations: Readonly<{ canonicalGroupType: StrategicWildcardAllocationLineageV1["canonicalGroupType"]; allocationCardinality: number; canonicalAllocationRoleVector: readonly string[] }>[] = [];
    for (const lineage of alternative.wildcardAllocationLineage) {
      const allocationPayload = allocationPayloadByHash.get(lineage.allocationVariantHash);
      if (allocationPayload === undefined
        || allocationPayload.canonicalGroupType !== lineage.canonicalGroupType
        || !sameSet(allocationPayload.wildcardCardIds, lineage.wildcardCardIds)) {
        return { status: "INCONCLUSIVE", reason: "MISSING_WILDCARD_ALLOCATION_PAYLOAD" };
      }
      semanticAllocations.push({
        canonicalGroupType: allocationPayload.canonicalGroupType,
        allocationCardinality: allocationPayload.wildcardCardIds.length,
        canonicalAllocationRoleVector: Array.from(
          { length: allocationPayload.wildcardCardIds.length },
          () => "WILDCARD_ALLOCATION",
        ),
      });
    }
    const payload = {
      canonicalGroupType: alternative.groupType,
      allocationCardinality: alternative.physicalCardIds.length,
      canonicalAllocationRoleVector: semanticAllocations
        .flatMap((allocation) => allocation.canonicalAllocationRoleVector)
        .sort(compareText),
    };
    return { ...payload, allocationInterfaceHash: canonicalHash(payload) };
  };
  const allocationInterfaces: StrategicCohortWildcardAllocationInterfaceV1[] = [];
  for (const alternative of alternatives) {
    const allocationInterface = allocationInterfaceOf(alternative);
    if ("status" in allocationInterface) return { issue: allocationInterface };
    allocationInterfaces.push(allocationInterface);
  }
  const claimantRoles = new Set<StrategicReservationClaimRoleV1>();
  for (const conflict of conflicts) {
    for (const alternativeId of conflict.alternativeReservationFactIds) {
      const alternative = alternativeById.get(alternativeId);
      const claim = alternative === undefined ? undefined : claimById.get(alternative.claimId);
      if (claim === undefined) {
        return { issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_CONFLICT_CLOSURE" } };
      }
      claim.claimRoles.forEach((role) => claimantRoles.add(role));
    }
  }
  const routeClaimIncidence: string[] = [];
  for (const routeClaim of route.resourceClaims) {
    const sourceClaim = claimById.get(routeClaim.claimId);
    if (sourceClaim === undefined || sourceClaim.claimHash !== routeClaim.claimHash
      || sourceClaim.familyId !== routeClaim.familyId
      || !sameSet(sourceClaim.claimRoles, routeClaim.claimRoles)) {
      return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    }
    const selectedAllocations: StrategicCohortWildcardAllocationInterfaceV1[] = [];
    for (const alternativeId of routeClaim.alternativeReservationFactIds) {
      const alternative = alternativeById.get(alternativeId);
      if (alternative === undefined || alternative.claimId !== routeClaim.claimId) {
        return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
      }
      const allocationInterface = allocationInterfaceOf(alternative);
      if ("status" in allocationInterface) return { issue: allocationInterface };
      selectedAllocations.push(allocationInterface);
    }
    const semanticClaim = {
      claimRoles: sortedUnique(routeClaim.claimRoles),
      hierarchyTier: routeClaim.hierarchyTier,
      controlRank: routeClaim.controlRank,
      efficiencyRank: routeClaim.efficiencyRank,
      reservationClass: routeClaim.reservationClass,
      physicalCardinality: routeClaim.physicalCardIds.length,
      wildcardCardinality: routeClaim.wildcardCardIds.length,
      alternatives: selectedAllocations.sort(compareCanonicalPayload),
    };
    routeClaimIncidence.push(canonicalHash(semanticClaim));
  }
  const branchIncidence: string[] = [];
  for (const witness of closure.branchLocalResolutionWitnesses) {
    const conflict = conflicts.find((candidate) => candidate.conflictFactId === witness.conflictFactId);
    if (conflict === undefined) return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
    const selectedAllocations: StrategicCohortWildcardAllocationInterfaceV1[] = [];
    for (const alternativeId of witness.selectedAlternativeReservationFactIds) {
      const alternative = alternativeById.get(alternativeId);
      if (alternative === undefined || !conflict.alternativeReservationFactIds.includes(alternativeId)) {
        return { issue: { status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" } };
      }
      const allocationInterface = allocationInterfaceOf(alternative);
      if ("status" in allocationInterface) return { issue: allocationInterface };
      selectedAllocations.push(allocationInterface);
    }
    branchIncidence.push(canonicalHash({
      conflictKinds: [...conflict.conflictKinds].sort(compareText),
      selectedAllocations: selectedAllocations.sort(compareCanonicalPayload),
    }));
  }
  const payload = {
    conflictKinds: unique(conflicts.flatMap((conflict) => conflict.conflictKinds)).sort(compareText),
    resolutionStates: conflicts.length === 0 ? [] : ["UNRESOLVED" as const],
    claimantRoleVector: [...claimantRoles].sort(compareText),
    alternativeAllocationInterfaces: allocationInterfaces.sort(compareCanonicalPayload),
    routeClaimIncidenceVector: [...new Set([...routeClaimIncidence, ...branchIncidence])].sort(compareText),
    crossTierContention: conflicts.some((conflict) => conflict.conflictKinds.includes("CROSS_TIER_CLAIM")),
    wildcardContention: conflicts.some((conflict) => conflict.conflictKinds.includes("WILDCARD_CONTENTION")),
  };
  return { value: { ...payload, conflictSignatureHash: canonicalHash(payload) } };
}

function endpointInterfaceOf(
  route: StrategicRouteCandidateFactV1,
  draft: NormalizedRouteCohortMemberDraftV1,
  endpoints: readonly Task5EndpointProjectionV1[],
): StrategicCohortEndpointInterfaceV1 {
  const topologyPayload = {
    componentArity: unique(endpoints.map((endpoint) => endpoint.resourceComponentId)).length,
    dependencyArityVector: endpoints.map((endpoint) => endpoint.dependencyArity).sort((left, right) => left - right),
  };
  const andTopology = { ...topologyPayload, topologyHash: canonicalHash(topologyPayload) };
  const payload = {
    routeClasses: [...route.endpointFacts.routeClasses].sort(compareText),
    closedThroughTier: route.endpointFacts.closedThroughTier,
    exactHandCountReduction: route.endpointFacts.exactHandCountReduction,
    preservationFactCodes: [...route.endpointFacts.preservationFactCodes].sort(compareText),
    remainderRoleVector: draft.canonicalResourceRoleVector.filter((slot) => slot.disposition === "REMAINDER"),
    andTopology,
    endpointArity: endpoints.length,
  };
  return { ...payload, endpointSignatureHash: canonicalHash(payload) };
}

function lineageOf(
  route: StrategicRouteCandidateFactV1,
  draft: NormalizedRouteCohortMemberDraftV1,
  closure: RouteRelevantConflictClosureV1,
  reservations: readonly StrategicResourceReservationFactV1[],
  conflicts: readonly StrategicReservationConflictFactV1[],
  alternatives: readonly StrategicReservationAlternativeFactV1[],
  endpoints: readonly Task5EndpointProjectionV1[],
): Readonly<{ value: Pick<RouteCohortMemberEnvelopeV1,
  "physicalLineageOccurrences" | "wildcardLineageOccurrences" | "familyMemberOccurrences" | "reservationOccurrences" | "conflictOccurrences" | "endpointOccurrences"> }> | Readonly<{ issue: Task5IssueV1 }> {
  const physicalLineageOccurrences = draft.task3MemberLocalLineage
    .filter((entry): entry is Extract<StrategicCohortTask3MemberLocalLineageOccurrenceV1, { kind: "PHYSICAL" }> => entry.kind === "PHYSICAL")
    .map((entry) => entry.occurrence).sort(compareCanonicalPayload);
  const wildcardLineageOccurrences = draft.task3MemberLocalLineage
    .filter((entry): entry is Extract<StrategicCohortTask3MemberLocalLineageOccurrenceV1, { kind: "WILDCARD" }> => entry.kind === "WILDCARD")
    .map((entry) => entry.occurrence).sort(compareCanonicalPayload);
  const familyMemberOccurrences = draft.task3MemberLocalLineage
    .filter((entry): entry is Extract<StrategicCohortTask3MemberLocalLineageOccurrenceV1, { kind: "FAMILY_MEMBER" }> => entry.kind === "FAMILY_MEMBER")
    .map((entry) => entry.occurrence);
  for (const claim of route.resourceClaims) {
    for (const memberId of claim.memberIds) {
      const payload = { routeId: route.routeId, familyId: claim.familyId, memberId };
      familyMemberOccurrences.push({ ...payload, occurrenceHash: canonicalHash(payload) });
    }
  }
  for (const alternative of alternatives) {
    const payload = { routeId: route.routeId, familyId: alternative.familyId, memberId: alternative.memberId };
    familyMemberOccurrences.push({ ...payload, occurrenceHash: canonicalHash(payload) });
  }
  const reservationOccurrences = reservations.map((reservation) => {
    const payload = { routeId: draft.routeId, reservationFactId: reservation.reservationFactId, reservationHash: reservation.reservationHash };
    return { ...payload, occurrenceHash: canonicalHash(payload) };
  }).sort(compareCanonicalPayload);
  const conflictOccurrences = conflicts.map((conflict) => {
    const payload = { routeId: draft.routeId, conflictFactId: conflict.conflictFactId, conflictHash: conflict.conflictHash };
    return { ...payload, occurrenceHash: canonicalHash(payload) };
  }).sort(compareCanonicalPayload);
  const endpointOccurrences = endpoints.map((endpoint) => {
    const payload = { routeId: draft.routeId, componentEndpointId: endpoint.componentEndpointId, endpointHash: endpoint.endpointHash };
    return { ...payload, occurrenceHash: canonicalHash(payload) };
  }).sort(compareCanonicalPayload);
  return { value: { physicalLineageOccurrences, wildcardLineageOccurrences, familyMemberOccurrences: dedupeCanonical(familyMemberOccurrences),
    reservationOccurrences, conflictOccurrences, endpointOccurrences } };
}

function cohortInterfaceOf(envelope: RouteCohortMemberEnvelopeV1): StrategicCohortInterfaceV1 {
  const fourSignatureHashes: StrategicCohortFourSignatureHashesV1 = {
    structuralSignatureHash: envelope.structuralInterface.structuralSignatureHash,
    resourceSignatureHash: envelope.resourceInterface.resourceSignatureHash,
    conflictSignatureHash: envelope.conflictInterface.conflictSignatureHash,
    endpointSignatureHash: envelope.endpointInterface.endpointSignatureHash,
  };
  const payload = {
    structuralInterface: envelope.structuralInterface,
    resourceInterface: envelope.resourceInterface,
    conflictInterface: envelope.conflictInterface,
    endpointInterface: envelope.endpointInterface,
    fourSignatureHashes,
  };
  return { ...payload, cohortInterfaceHash: canonicalHash(payload) };
}

function canonicalRoleWitnessOf(
  envelope: RouteCohortMemberEnvelopeV1,
): readonly CanonicalRolePositionBijectionWitnessV1[] {
  const slotByPosition = new Map(envelope.canonicalResourceRoleVector.map((slot) =>
    [slot.canonicalRolePosition, slot]));
  return envelope.physicalLineageOccurrences.map((occurrence) => {
    const slot = slotByPosition.get(occurrence.canonicalRolePosition);
    if (slot === undefined) throw new Error("TASK5_MISSING_CANONICAL_ROLE_SLOT");
    const payload = {
      routeId: envelope.routeId,
      physicalCardId: occurrence.physicalCardId,
      canonicalRolePosition: occurrence.canonicalRolePosition,
      roleSlotHash: slot.roleSlotHash,
    };
    return { ...payload, witnessHash: canonicalHash(payload) };
  }).sort(compareCanonicalPayload);
}

function sourceBindingsOf(admission: PhaseDSourceAdmissionSuccessV1): readonly StrategicCohortSourceHashBindingV1[] {
  const manifest = admission.canonicalSourceBindingManifest;
  const bindings: StrategicCohortSourceHashBindingV1[] = [
    { sourceKind: "PHASE_D_SOURCE_BINDING_MANIFEST", sourceHash: canonicalSourceBindingManifestHashOf(admission) },
    { sourceKind: "MULTI_COMPONENT_AND_BINDING_ARTIFACT", sourceHash: canonicalMultiComponentArtifactHashOf(manifest.multiComponentArtifact) },
  ];
  for (const component of manifest.componentSources) {
    bindings.push(
      { sourceKind: "HIERARCHY_CLASSIFICATION_BATCH", sourceHash: component.hierarchyBatchHash },
      { sourceKind: "RESOURCE_RESERVATION_ARTIFACT", sourceHash: component.reservationArtifactHash },
      { sourceKind: "ROUTE_GENERATION_ARTIFACT", sourceHash: component.routeArtifactHash },
      { sourceKind: "ROUTE_UNIVERSE", sourceHash: component.routeUniverseHash },
    );
  }
  return bindings.sort((left, right) => compareText(left.sourceKind, right.sourceKind)
    || compareText(left.sourceHash, right.sourceHash));
}

function canonicalSourceBindingManifestHashOf(admission: PhaseDSourceAdmissionSuccessV1): string {
  const manifest = admission.canonicalSourceBindingManifest;
  const multiComponentArtifact = manifest.multiComponentArtifact;
  const canonicalMultiPayload = {
    ...payloadWithout(multiComponentArtifact, "artifactHash"),
    componentRouteFacts: multiComponentArtifact.componentRouteFacts === null
      ? null : [...multiComponentArtifact.componentRouteFacts].sort(compareCanonicalPayload),
    andEndpointReferences: multiComponentArtifact.andEndpointReferences === null
      ? null : [...multiComponentArtifact.andEndpointReferences].sort(compareCanonicalPayload),
  };
  const canonicalMultiComponentArtifact = {
    ...canonicalMultiPayload,
    artifactHash: canonicalHash(canonicalMultiPayload),
  };
  const canonicalManifestPayload = {
    ...payloadWithout(manifest, "manifestHash"),
    componentSources: canonicalComponentSources(manifest.componentSources),
    multiComponentArtifact: canonicalMultiComponentArtifact,
    multiComponentArtifactHash: canonicalMultiComponentArtifact.artifactHash,
  };
  return canonicalHash(canonicalManifestPayload);
}

function canonicalMultiComponentArtifactHashOf(
  artifact: StrategicMultiComponentAndBindingArtifactV1,
): string {
  const payload = {
    ...payloadWithout(artifact, "artifactHash"),
    componentRouteFacts: artifact.componentRouteFacts === null
      ? null : [...artifact.componentRouteFacts].sort(compareCanonicalPayload),
    andEndpointReferences: artifact.andEndpointReferences === null
      ? null : [...artifact.andEndpointReferences].sort(compareCanonicalPayload),
  };
  return canonicalHash(payload);
}

function compareTask6CoverageWitnessSeed(
  left: Task6CoverageWitnessSeedV1,
  right: Task6CoverageWitnessSeedV1,
): number {
  return compareText(left.occurrenceKind, right.occurrenceKind)
    || compareCanonicalPayload(left.occurrenceKey, right.occurrenceKey)
    || compareText(left.memberEnvelopeHash, right.memberEnvelopeHash)
    || compareText(left.mappingHash, right.mappingHash)
    || compareText(left.proofHash, right.proofHash)
    || compareText(left.occurrenceHash, right.occurrenceHash);
}

function coverageWitnessSeedsOf(
  source: PhaseDRouteOccurrenceUniverseV1,
  envelopes: readonly RouteCohortMemberEnvelopeV1[],
  mappingByMember: ReadonlyMap<string, StrategicRouteCohortMappingFactV1>,
  proofByMember: ReadonlyMap<string, StrategicCohortMembershipProofV1>,
): Task6CoveragePreparationV1 | null {
  const sourceRouteIds = [...source.sourceRouteIds].sort(compareText);
  const coveredRouteIds = unique(envelopes.map((envelope) => envelope.routeId)).sort(compareText);
  if (canonicalSerialize(sourceRouteIds) !== canonicalSerialize(coveredRouteIds)) return null;
  const coveredPhysical = envelopes.flatMap((envelope) => envelope.physicalLineageOccurrences
    .map((occurrence) => [occurrence.routeId, occurrence.physicalCardId] as const));
  const coveredWildcard = envelopes.flatMap((envelope) => envelope.wildcardLineageOccurrences
    .map((occurrence) => [occurrence.routeId, occurrence.wildcardCardId, occurrence.allocationVariantHash] as const));
  const coveredFamily = envelopes.flatMap((envelope) => envelope.familyMemberOccurrences
    .map((occurrence) => [occurrence.routeId, occurrence.familyId, occurrence.memberId] as const));
  const coveredReservation = envelopes.flatMap((envelope) => envelope.reservationOccurrences
    .map((occurrence) => [occurrence.routeId, occurrence.reservationFactId] as const));
  const coveredConflict = envelopes.flatMap((envelope) => envelope.conflictOccurrences
    .map((occurrence) => [occurrence.routeId, occurrence.conflictFactId] as const));
  const coveredEndpoint = envelopes.flatMap((envelope) => envelope.endpointOccurrences
    .map((occurrence) => [occurrence.routeId, occurrence.componentEndpointId] as const));
  if (!sameTupleSet(source.physicalOccurrenceKeys, coveredPhysical)
    || !sameTupleSet(source.wildcardOccurrenceKeys, coveredWildcard)
    || !sameTupleSet(source.familyMemberOccurrenceKeys, coveredFamily)
    || !sameTupleSet(source.reservationOccurrenceKeys, coveredReservation)
    || !sameTupleSet(source.conflictOccurrenceKeys, coveredConflict)
    || !sameTupleSet(source.endpointOccurrenceKeys, coveredEndpoint)) return null;

  for (const envelope of envelopes) {
    if (mappingByMember.get(envelope.memberEnvelopeHash) === undefined
      || proofByMember.get(envelope.memberEnvelopeHash) === undefined) return null;
  }

  const seeds: Task6CoverageWitnessSeedV1[] = [];
  for (const envelope of envelopes) {
    const mapping = mappingByMember.get(envelope.memberEnvelopeHash);
    const proof = proofByMember.get(envelope.memberEnvelopeHash);
    if (mapping === undefined || proof === undefined) throw new Error("Task6 Stage-D coverage preparation missing evidence");
    const append = (
      occurrenceKind: StrategicCohortCoverageWitnessV1["occurrenceKind"],
      occurrenceKey: readonly string[],
      occurrenceHash: string,
    ) => {
      seeds.push({
        occurrenceKind,
        occurrenceKey,
        occurrenceHash,
        memberEnvelopeHash: envelope.memberEnvelopeHash,
        mappingHash: mapping.mappingHash,
        proofHash: proof.proofHash,
        sourceRouteUniverseHash: envelope.sourceRouteUniverseHash,
        routeId: envelope.routeId,
        routeHash: envelope.routeHash,
      });
    };
    for (const occurrence of envelope.physicalLineageOccurrences) {
      append("PHYSICAL", [occurrence.routeId, occurrence.physicalCardId], occurrence.occurrenceHash);
    }
    for (const occurrence of envelope.wildcardLineageOccurrences) {
      append("WILDCARD", [occurrence.routeId, occurrence.wildcardCardId, occurrence.allocationVariantHash], occurrence.occurrenceHash);
    }
    for (const occurrence of envelope.familyMemberOccurrences) {
      append("FAMILY_MEMBER", [occurrence.routeId, occurrence.familyId, occurrence.memberId], occurrence.occurrenceHash);
    }
    for (const occurrence of envelope.reservationOccurrences) {
      append("RESERVATION", [occurrence.routeId, occurrence.reservationFactId], occurrence.occurrenceHash);
    }
    for (const occurrence of envelope.conflictOccurrences) {
      append("CONFLICT", [occurrence.routeId, occurrence.conflictFactId], occurrence.occurrenceHash);
    }
    for (const occurrence of envelope.endpointOccurrences) {
      append("ENDPOINT", [occurrence.routeId, occurrence.componentEndpointId], occurrence.occurrenceHash);
    }
  }

  seeds.sort(compareTask6CoverageWitnessSeed);
  return {
    sourceOccurrenceUniverseHash: source.occurrenceUniverseHash,
    sourceRouteIds,
    coveredRouteIds,
    inputPhysicalOccurrenceCount: source.physicalOccurrenceKeys.length,
    coveredPhysical,
    inputWildcardOccurrenceCount: source.wildcardOccurrenceKeys.length,
    coveredWildcard,
    inputFamilyMemberOccurrenceCount: source.familyMemberOccurrenceKeys.length,
    coveredFamily,
    inputReservationOccurrenceCount: source.reservationOccurrenceKeys.length,
    coveredReservation,
    inputConflictOccurrenceCount: source.conflictOccurrenceKeys.length,
    coveredConflict,
    inputEndpointOccurrenceCount: source.endpointOccurrenceKeys.length,
    coveredEndpoint,
    seeds,
  };
}

function materializeTask6StageDV1(
  source: PhaseDRouteOccurrenceUniverseV1,
  envelopes: readonly RouteCohortMemberEnvelopeV1[],
  mappingByMember: ReadonlyMap<string, StrategicRouteCohortMappingFactV1>,
  proofByMember: ReadonlyMap<string, StrategicCohortMembershipProofV1>,
  accumulator: Task6MeasurementAccumulatorV1,
  onWitnessConstructed?: Task6StageDObserverV1,
): Task6StageDResultV1 {
  const preparation = coverageWitnessSeedsOf(source, envelopes, mappingByMember, proofByMember);
  if (preparation === null) {
    return { kind: "ISSUE", issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" } };
  }

  const envelopeByMember = new Map(envelopes.map((envelope) => [envelope.memberEnvelopeHash, envelope] as const));
  const coverageWitnesses: StrategicCohortCoverageWitnessV1[] = [];
  for (const seed of preparation.seeds) {
    const envelope = envelopeByMember.get(seed.memberEnvelopeHash);
    const mapping = mappingByMember.get(seed.memberEnvelopeHash);
    const proof = proofByMember.get(seed.memberEnvelopeHash);
    if (envelope === undefined || mapping === undefined || proof === undefined) {
      return { kind: "ISSUE", issue: { status: "INCONCLUSIVE", reason: "INCOMPLETE_LINEAGE_COVERAGE" } };
    }
    const payload = {
      occurrenceKind: seed.occurrenceKind,
      occurrenceKey: seed.occurrenceKey,
      occurrenceHash: seed.occurrenceHash,
      memberEnvelopeHash: seed.memberEnvelopeHash,
      mappingHash: seed.mappingHash,
      proofHash: seed.proofHash,
    };
    const witness = { ...payload, witnessHash: canonicalHash(payload) };
    if (witness.memberEnvelopeHash !== envelope.memberEnvelopeHash
      || witness.mappingHash !== mapping.mappingHash
      || witness.proofHash !== proof.proofHash
      || witness.witnessHash !== canonicalHash(payloadWithout(witness, "witnessHash"))) {
      return { kind: "ISSUE", issue: { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" } };
    }

    onWitnessConstructed?.(witness);
    const applyResult = accumulator.applyVerifiedEvent({ LINEAGE_OCCURRENCE_WITNESS_COUNT: 1 }, {
      stage: "STAGE_D_COVERAGE",
      sourceRouteUniverseHash: seed.sourceRouteUniverseHash,
      routeId: seed.routeId,
      routeHash: seed.routeHash,
    });
    if (applyResult.terminal) {
      if (applyResult.snapshot === null) throw new Error("Task6 Stage-D terminal snapshot missing");
      return { kind: "BUDGET_TERMINAL", snapshot: applyResult.snapshot };
    }
    coverageWitnesses.push(witness);
  }

  accumulator.finalizeExactDimension("LINEAGE_OCCURRENCE_WITNESS_COUNT");
  return { kind: "COMPLETE", coverage: coverageManifestOf(preparation, coverageWitnesses) };
}

function coverageManifestOf(
  preparation: Task6CoveragePreparationV1,
  coverageWitnesses: readonly StrategicCohortCoverageWitnessV1[],
): StrategicCohortCoverageManifestV1 {
  const canonicalWitnesses = [...coverageWitnesses].sort(compareCanonicalPayload);
  const payload = {
    sourceOccurrenceUniverseHash: preparation.sourceOccurrenceUniverseHash,
    inputRouteCount: preparation.sourceRouteIds.length,
    coveredRouteCount: preparation.coveredRouteIds.length,
    inputPhysicalOccurrenceCount: preparation.inputPhysicalOccurrenceCount,
    coveredPhysicalOccurrenceCount: preparation.coveredPhysical.length,
    inputWildcardOccurrenceCount: preparation.inputWildcardOccurrenceCount,
    coveredWildcardOccurrenceCount: preparation.coveredWildcard.length,
    inputFamilyMemberOccurrenceCount: preparation.inputFamilyMemberOccurrenceCount,
    coveredFamilyMemberOccurrenceCount: preparation.coveredFamily.length,
    inputReservationOccurrenceCount: preparation.inputReservationOccurrenceCount,
    coveredReservationOccurrenceCount: preparation.coveredReservation.length,
    inputConflictOccurrenceCount: preparation.inputConflictOccurrenceCount,
    coveredConflictOccurrenceCount: preparation.coveredConflict.length,
    inputEndpointOccurrenceCount: preparation.inputEndpointOccurrenceCount,
    coveredEndpointOccurrenceCount: preparation.coveredEndpoint.length,
    coverageWitnesses: canonicalWitnesses,
  };
  return { ...payload, coverageHash: canonicalHash(payload) };
}

function sameTupleSet(left: readonly (readonly string[])[], right: readonly (readonly string[])[]): boolean {
  const canonical = (values: readonly (readonly string[])[]) => values.map((value) => canonicalSerialize(value)).sort(compareText);
  const leftValues = canonical(left);
  const rightValues = canonical(right);
  return leftValues.length === rightValues.length && leftValues.every((value, index) => value === rightValues[index]);
}

function dedupeCanonical<T extends Readonly<Record<string, unknown>>>(values: readonly T[]): readonly T[] {
  const canonical = new Map<string, T>();
  for (const value of values) canonical.set(canonicalSerialize(value), value);
  return [...canonical.values()].sort(compareCanonicalPayload);
}

function emptyCohortBudgetExecution() {
  const payload = { measurements: [], exhaustionProvenance: null };
  return { ...payload, executionHash: canonicalHash(payload) };
}

function task6RatioObservationOf(
  inputRouteCount: number,
  compressionStatus: StrategicCohortCompressionStatusV1,
  positiveCohortLowerBound: number | null,
  budgetExhaustion: boolean,
  exactCompleteCohortCount?: number,
): HierarchicalStrategicCohortCompressionArtifactV1["compressionRatioObservation"] {
  if (compressionStatus === "COMPLETE") {
    if (exactCompleteCohortCount === undefined || exactCompleteCohortCount <= 0) {
      throw new Error("Task6 COMPLETE ratio requires a positive exact cohort count");
    }
    return {
      inputRouteCount,
      observedCohortCount: exactCompleteCohortCount,
      ratioNumerator: inputRouteCount,
      ratioDenominator: exactCompleteCohortCount,
      cohortCountCompleteness: "EXACT",
      ratioInterpretation: "EXACT",
    };
  }

  if (compressionStatus === "INCONCLUSIVE"
    && budgetExhaustion
    && positiveCohortLowerBound !== null
    && positiveCohortLowerBound > 0) {
    return {
      inputRouteCount,
      observedCohortCount: positiveCohortLowerBound,
      ratioNumerator: inputRouteCount,
      ratioDenominator: positiveCohortLowerBound,
      cohortCountCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      ratioInterpretation: "UPPER_BOUND_FROM_COHORT_LOWER_BOUND",
    };
  }

  return {
    inputRouteCount,
    observedCohortCount: 0,
    ratioNumerator: inputRouteCount,
    ratioDenominator: null,
    cohortCountCompleteness: null,
    ratioInterpretation: "UNAVAILABLE",
  };
}

type Task5TerminalOptionsV1 = Readonly<{
  budgetExecution?: StrategicCohortBudgetExecutionArtifactV1;
  exhaustedDimensions?: readonly StrategicCohortBudgetDimensionV1[];
  reasonCodes?: readonly StrategicCohortCompressionReasonCodeV1[];
  ratioObservation?: HierarchicalStrategicCohortCompressionArtifactV1["compressionRatioObservation"];
}>;

function task6Terminal(
  input: PhaseDTask5InputV1,
  snapshot: Task6AccumulatorSnapshotV1,
): HierarchicalStrategicCohortCompressionArtifactV1 {
  const reason = snapshot.reasonCodes[0];
  if (reason === undefined) throw new Error("Task6 terminal snapshot has no exhaustion reason");
  return task5Terminal(input, { status: "INCONCLUSIVE", reason }, {
    budgetExecution: snapshot.budgetExecution,
    exhaustedDimensions: snapshot.exhaustedDimensions,
    reasonCodes: snapshot.reasonCodes,
    ratioObservation: task6RatioObservationOf(
      input.admission.inputRouteCount,
      "INCONCLUSIVE",
      snapshot.positiveCohortLowerBound,
      true,
    ),
  });
}

function task5Terminal(
  input: PhaseDTask5InputV1,
  issue: Task5IssueV1,
  options: Task5TerminalOptionsV1 = {},
): HierarchicalStrategicCohortCompressionArtifactV1 {
  const manifest = input.admission.canonicalSourceBindingManifest;
  const ratioObservation = options.ratioObservation ?? task6RatioObservationOf(
    input.admission.inputRouteCount,
    issue.status,
    null,
    false,
  );
  const payload = {
    schemaVersion: STRATEGIC_COHORT_COMPRESSION_V1_SCHEMA_VERSION,
    ...manifest.commonBindings,
    sourceBindingManifestHash: input.admission.sourceBindingManifestHash,
    sourceComponentIds: input.admission.admittedComponents.map((component) => component.resourceComponentId).sort(compareText),
    sourceMultiComponentArtifactHash: manifest.multiComponentArtifactHash,
    sourceAndComponentSetHash: manifest.andComponentSetHash,
    compressionStatus: issue.status,
    evidenceBudget: input.evidenceBudget,
    budgetExecution: options.budgetExecution ?? emptyCohortBudgetExecution(),
    cohorts: null,
    cohortInterfaces: null,
    routeToCohortMappings: null,
    memberEnvelopes: null,
    equivalenceProofs: null,
    coverageManifest: null,
    cohortCount: 0,
    compressionRatioObservation: ratioObservation,
    reasonCodes: options.reasonCodes ?? [issue.reason],
    exhaustedDimensions: options.exhaustedDimensions ?? [],
    cohortUniverseHash: null,
    semanticBoundary: "HIERARCHICAL_STRATEGIC_COHORT_FACTS_NOT_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
}
