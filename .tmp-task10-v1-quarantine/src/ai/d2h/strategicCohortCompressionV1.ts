import { canonicalHash, canonicalSerialize } from "./strategicEvidenceCanonicalSerializer";
import { materializeStrategicBudgetExecutionV1 } from "./strategicBudgetExecutionV1";
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
  type HierarchicalStrategicCohortCompressionArtifactV1,
  type HierarchicalStrategicCohortCompressorV1,
  type NormalizedRouteCohortMemberDraftV1,
  type PhaseDAdmittedRouteNormalizerV1,
  type PhaseDAdmittedComponentSourceV1,
  type PhaseDCommonBindingsV1,
  type PhaseDComponentSourceBindingV1,
  type PhaseDRouteIdentityIndexEntryV1,
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
  type RouteRelevantConflictClosureV1,
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
    if (witness.selectedAlternativeReservationFactIds.length !== witness.allocations.length
      || witness.selectedAlternativeReservationFactIds.some((id, index) =>
        id !== witness.allocations[index]?.alternativeReservationFactId)) {
      return { status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" };
    }
    for (const allocation of witness.allocations) {
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
