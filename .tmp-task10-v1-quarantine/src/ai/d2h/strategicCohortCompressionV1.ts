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
    budget: artifact.budget,
    budgetObservation: artifact.budgetObservation,
    sourceRouteUniverseHashes: artifact.sourceRouteUniverseHashes,
    componentFactHashes: artifact.componentRouteFacts.map((fact) => fact.componentFactHash),
    endpointHashes: artifact.andEndpointReferences.map((endpoint) => endpoint.endpointHash),
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
    sourceHierarchyBatchHash: artifact.sourceHierarchyBatchHash,
    sourceReservationArtifactHash: artifact.sourceReservationArtifactHash,
    budget: artifact.budget,
    budgetObservation: artifact.budgetObservation,
    routeHashes: artifact.routeCandidates.map((route) => route.routeHash),
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
