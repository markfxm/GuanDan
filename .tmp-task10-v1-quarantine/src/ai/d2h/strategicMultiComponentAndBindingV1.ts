import { canonicalHash } from "./strategicEvidenceCanonicalSerializer";
import { materializeStrategicBudgetExecutionV1 } from "./strategicBudgetExecutionV1";
import type {
  StrategicBudgetDimensionV1,
  StrategicBudgetExecutionArtifactV1,
  StrategicBudgetMeasurementCompletenessV1,
} from "./strategicBudgetExecutionV1Contracts";
import type {
  StrategicRouteCandidateFactV1,
  StrategicRouteGenerationArtifactV1,
} from "./strategicRouteCandidateFactsV1Contracts";
import {
  STRATEGIC_MULTI_COMPONENT_AND_BINDING_V1_SCHEMA_VERSION,
  type StrategicComponentAndEndpointReferenceV1,
  type StrategicComponentRouteFactSetV1,
  type StrategicMultiComponentAndBindingArtifactV1,
  type StrategicMultiComponentAndBindingBudgetDimensionV1,
  type StrategicMultiComponentAndBindingBudgetObservationV1,
  type StrategicMultiComponentAndBindingBudgetV1,
  type StrategicMultiComponentAndBindingReasonCodeV1,
  type StrategicMultiComponentAndEndpointBinderV1,
} from "./strategicMultiComponentAndBindingV1Contracts";

type CommonBindingsV1 = Readonly<{
  identityHash: string;
  snapshotHash: string;
  sourceRootHash: string;
  provenanceRoot: string;
}>;

const SOURCE_VALIDATION_WORK_LIMIT_V1 = 100_000;

export const bindStrategicMultiComponentAndEndpointsV1: StrategicMultiComponentAndEndpointBinderV1 = (input) => {
  if (input.sourceArtifacts.length > SOURCE_VALIDATION_WORK_LIMIT_V1) {
    return inconclusiveArtifact(
      bindingsOf(input.sourceArtifacts[0]),
      input.budget,
      [],
      [],
      ["SOURCE_VALIDATION_BUDGET_EXHAUSTED"],
      [],
      exactObservation(),
    );
  }
  const orderedSources = [...input.sourceArtifacts].sort(compareSourceArtifacts);
  const bindings = bindingsOf(orderedSources[0]);
  const sourceArtifactHashes = orderedSources.map((artifact) => artifact.artifactHash);
  const sourceRouteUniverseHashes = orderedSources
    .flatMap((artifact) => artifact.routeUniverseHash === null ? [] : [artifact.routeUniverseHash]);

  if (orderedSources.length < 2) {
    return inconclusiveArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, ["INSUFFICIENT_COMPONENT_COUNT"], [], exactObservation());
  }
  if (!sourceValidationWithinLimit(orderedSources)) {
    return inconclusiveArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, ["SOURCE_VALIDATION_BUDGET_EXHAUSTED"], [], exactObservation());
  }
  if (orderedSources.some((artifact) => artifact.generationStatus === "REJECTED")) {
    return rejectedArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes,
      ["SOURCE_ARTIFACT_INTEGRITY_MISMATCH", "SOURCE_HASH_PAYLOAD_MISMATCH"],
      exactObservation());
  }
  if (orderedSources.some((artifact) => artifact.generationStatus !== "COMPLETE"
    || artifact.routeCandidates === null || artifact.routeUniverseHash === null)) {
    return inconclusiveArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, ["INCOMPLETE_SOURCE_ARTIFACT"], [], exactObservation());
  }
  if (orderedSources.some((artifact) => !validSourceArtifact(artifact))) {
    const integrityReason = orderedSources.some(routeIdHashConflict)
      || routeIdCrossSourceConflict(orderedSources)
      ? "ROUTE_ID_HASH_CONFLICT" as const
      : "SOURCE_ARTIFACT_INTEGRITY_MISMATCH" as const;
    return rejectedArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes,
      [integrityReason, "SOURCE_ARTIFACT_INTEGRITY_MISMATCH", "SOURCE_HASH_PAYLOAD_MISMATCH"],
      exactObservation());
  }
  if (!sameBindings(orderedSources)) {
    return rejectedArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, ["SOURCE_BINDING_MISMATCH"], exactObservation());
  }

  const componentIds = orderedSources.map(componentIdOf);
  if (new Set(componentIds).size !== componentIds.length) {
    return rejectedArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, ["DUPLICATE_RESOURCE_COMPONENT"], exactObservation());
  }
  const componentRouteFacts = orderedSources.map(componentFactOf);
  const overlapReason = crossComponentOverlapReason(componentRouteFacts);
  if (overlapReason !== null) {
    return rejectedArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, [overlapReason], exactObservation());
  }
  if (!validBudget(input.budget)) {
    return inconclusiveArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, ["INVALID_BUDGET"], [], exactObservation());
  }

  const observedComponentEndpointCount = orderedSources.length;
  const evidenceObservation = observeBindingEvidenceCost(
    orderedSources,
    input.budget.maxEvidenceCost,
  );
  const exhaustedDimensions: StrategicMultiComponentAndBindingBudgetDimensionV1[] = [];
  const reasonCodes: StrategicMultiComponentAndBindingReasonCodeV1[] = [];
  if (observedComponentEndpointCount > input.budget.maxComponentEndpointCount) {
    exhaustedDimensions.push("MAX_COMPONENT_ENDPOINT_COUNT");
    reasonCodes.push("MAX_COMPONENT_ENDPOINT_COUNT_EXHAUSTED");
  }
  if (evidenceObservation.exhausted) {
    exhaustedDimensions.push("MAX_EVIDENCE_COST");
    reasonCodes.push("MAX_EVIDENCE_COST_EXHAUSTED");
  }
  if (exhaustedDimensions.length > 0) {
    return inconclusiveArtifact(bindings, input.budget, sourceArtifactHashes,
      sourceRouteUniverseHashes, reasonCodes, exhaustedDimensions, {
        observedComponentEndpointCount,
        observedEvidenceCost: evidenceObservation.observedEvidenceCost,
        measurementCompleteness: exhaustedDimensions.length > 0
          ? "LOWER_BOUND_AT_EXHAUSTION"
          : "EXACT",
      });
  }
  const observedEvidenceCost = evidenceObservation.observedEvidenceCost;

  const andComponentSetHash = canonicalHash({
    kind: "strategic-and-component-set-v1",
    componentIds,
    sourceRouteUniverseHashes,
  });
  const andEndpointReferences = componentRouteFacts
    .map((component) => endpointOf(component, andComponentSetHash));

  const budgetObservation: StrategicMultiComponentAndBindingBudgetObservationV1 = {
    observedComponentEndpointCount,
    observedEvidenceCost,
    measurementCompleteness: "EXACT",
  };
  const budgetExecution = multiComponentBudgetExecutionOf(
    input.budget,
    budgetObservation,
    [],
    sourceArtifactHashes,
    sourceRouteUniverseHashes,
  );
  const routeUniverseHash = canonicalHash({
    kind: "strategic-multi-component-and-route-universe-v1",
    ...bindings,
    sourceRouteUniverseHashes,
    componentSemanticHashes: componentRouteFacts.map(componentSemanticHashOf).sort(compareText),
    endpointSemanticHashes: andEndpointReferences.map(endpointSemanticHashOf).sort(compareText),
  });
  const payload = {
    schemaVersion: STRATEGIC_MULTI_COMPONENT_AND_BINDING_V1_SCHEMA_VERSION,
    ...bindings,
    budget: input.budget,
    bindingStatus: "COMPLETE" as const,
    componentRouteFacts,
    andEndpointReferences,
    componentEndpointCount: observedComponentEndpointCount,
    evidenceCost: observedEvidenceCost,
    budgetObservation,
    budgetExecution,
    exhaustedDimensions: [] as readonly StrategicMultiComponentAndBindingBudgetDimensionV1[],
    reasonCodes: [] as readonly StrategicMultiComponentAndBindingReasonCodeV1[],
    componentIds,
    andComponentSetHash,
    sourceArtifactHashes,
    sourceRouteUniverseHashes,
    routeUniverseHash,
    semanticBoundary: "MULTI_COMPONENT_AND_BINDING_FACTS_NOT_AI_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
};

function componentFactOf(artifact: StrategicRouteGenerationArtifactV1): StrategicComponentRouteFactSetV1 {
  const routeCandidates = [...artifact.routeCandidates!]
    .sort((left, right) => compareText(left.routeId, right.routeId));
  const payload = {
    resourceComponentId: componentIdOf(artifact),
    sourceArtifactHash: artifact.artifactHash,
    sourceRouteUniverseHash: artifact.routeUniverseHash!,
    routeCandidates,
    routeCount: routeCandidates.length,
    physicalCardIds: sortedUnique(routeCandidates
      .flatMap((route) => route.endpointFacts.accountedPhysicalCardIds)),
    wildcardCardIds: sortedUnique(routeCandidates
      .flatMap((route) => route.resourceClaims.flatMap((claim) => claim.wildcardCardIds))),
  };
  return { ...payload, componentFactHash: canonicalHash(payload) };
}

function componentSemanticHashOf(component: StrategicComponentRouteFactSetV1): string {
  return canonicalHash({
    kind: "strategic-component-route-universe-v1",
    resourceComponentId: component.resourceComponentId,
    sourceRouteUniverseHash: component.sourceRouteUniverseHash,
    routeHashes: component.routeCandidates.map((route) => route.routeHash).sort(compareText),
    physicalCardIds: component.physicalCardIds,
    wildcardCardIds: component.wildcardCardIds,
  });
}

function endpointOf(
  component: StrategicComponentRouteFactSetV1,
  andComponentSetHash: string,
): StrategicComponentAndEndpointReferenceV1 {
  const routeReferences = component.routeCandidates
    .map((route) => ({ routeId: route.routeId, routeHash: route.routeHash }))
    .sort((left, right) => compareText(left.routeId, right.routeId));
  const identityPayload = {
    kind: "strategic-component-and-endpoint-reference-v1",
    resourceComponentId: component.resourceComponentId,
    sourceRouteUniverseHash: component.sourceRouteUniverseHash,
    routeReferences,
    andComponentSetHash,
  };
  const componentEndpointId = canonicalHash(identityPayload);
  const payload = {
    componentEndpointId,
    resourceComponentId: component.resourceComponentId,
    sourceArtifactHash: component.sourceArtifactHash,
    sourceRouteUniverseHash: component.sourceRouteUniverseHash,
    routeReferences,
    andComponentSetHash,
    semanticBoundary: "COMPONENT_AND_ENDPOINT_REFERENCE_NOT_ROUTE_SELECTION" as const,
  };
  return { ...payload, endpointHash: canonicalHash(payload) };
}

function endpointSemanticHashOf(endpoint: StrategicComponentAndEndpointReferenceV1): string {
  return canonicalHash({
    kind: "strategic-component-and-endpoint-universe-v1",
    resourceComponentId: endpoint.resourceComponentId,
    sourceRouteUniverseHash: endpoint.sourceRouteUniverseHash,
    routeReferences: endpoint.routeReferences,
    andComponentSetHash: endpoint.andComponentSetHash,
  });
}

function observeBindingEvidenceCost(
  artifacts: readonly StrategicRouteGenerationArtifactV1[],
  maxEvidenceCost: number,
): Readonly<{ observedEvidenceCost: number; exhausted: boolean }> {
  let observedEvidenceCost = 1;
  for (const artifact of artifacts) {
    observedEvidenceCost += 1;
    if (observedEvidenceCost > maxEvidenceCost) return { observedEvidenceCost, exhausted: true };
    for (const route of artifact.routeCandidates ?? []) {
      observedEvidenceCost += 1 + routeEvidenceCostOf(route);
      if (observedEvidenceCost > maxEvidenceCost) return { observedEvidenceCost, exhausted: true };
    }
  }
  return { observedEvidenceCost, exhausted: false };
}

function routeEvidenceCostOf(route: StrategicRouteCandidateFactV1): number {
  return route.supportingHierarchyFacts.length
    + route.supportingReservationFacts.length
    + route.resourceClaims.length
    + route.preservedResources.length
    + route.consumedResources.length
    + route.unresolvedConflicts.length
    + route.branchLocalResolutionWitnesses.length
    + 1;
}

function validSourceArtifact(artifact: StrategicRouteGenerationArtifactV1): boolean {
  if (artifact.routeCandidates === null || artifact.routeUniverseHash === null
    || artifact.routeCount !== artifact.routeCandidates.length) return false;
  const { artifactHash: _artifactHash, ...payload } = artifact;
  if (artifact.artifactHash !== canonicalHash(payload)) return false;
  const componentIds = new Set(artifact.routeCandidates
    .map((route) => route.endpointFacts.resourceComponentId));
  if (componentIds.size !== 1) return false;
  const evidenceCost = artifact.routeCandidates
    .reduce((sum, route) => sum + routeEvidenceCostOf(route), 0);
  const conflictExpansionCount = artifact.routeCandidates
    .filter((route) => route.unresolvedConflicts.length > 0).length;
  if (artifact.evidenceCost !== evidenceCost
    || artifact.conflictExpansionCount !== conflictExpansionCount
    || artifact.budgetObservation.observedRouteCount !== artifact.routeCount
    || artifact.budgetObservation.observedConflictExpansionCount !== conflictExpansionCount
    || artifact.budgetObservation.observedEvidenceCost !== evidenceCost
    || artifact.generationWorkObservedCount !== artifact.budgetObservation.generationWorkObservedCount
    || artifact.budgetObservation.measurementCompleteness !== "EXACT"
    || artifact.exhaustedDimensions.length !== 0
    || artifact.reasonCodes.length !== 0) return false;
  let expectedBudgetExecution: StrategicBudgetExecutionArtifactV1;
  try {
    expectedBudgetExecution = materializeStrategicBudgetExecutionV1({
      measurements: [
        {
          dimension: "ROUTE_CANDIDATE_COUNT",
          limit: artifact.budget.maxRouteCount,
          observedCount: artifact.routeCount,
          measurementCompleteness: "EXACT",
        },
        {
          dimension: "CONFLICT_EXPANSION_COUNT",
          limit: artifact.budget.maxConflictExpansion,
          observedCount: artifact.generationWorkObservedCount,
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
        { sourceKind: "STRATEGIC_STRUCTURE_INVENTORY", sourceHash: artifact.sourceInventoryHash },
        { sourceKind: "STRATEGIC_HIERARCHY_CLASSIFICATION_BATCH", sourceHash: artifact.sourceHierarchyBatchHash },
        { sourceKind: "STRATEGIC_RESOURCE_RESERVATION_ARTIFACT", sourceHash: artifact.sourceReservationArtifactHash },
      ],
    });
  } catch {
    return false;
  }
  if (canonicalHash(artifact.budgetExecution) !== canonicalHash(expectedBudgetExecution)) return false;
  return artifact.routeCandidates.every(validRoute)
    && artifact.routeUniverseHash === canonicalHash({
      kind: "strategic-route-universe-v1",
      identityHash: artifact.identityHash,
      snapshotHash: artifact.snapshotHash,
      sourceRootHash: artifact.sourceRootHash,
      provenanceRoot: artifact.provenanceRoot,
      sourceInventoryHash: artifact.sourceInventoryHash,
      routeHashes: artifact.routeCandidates.map((route) => route.routeHash).sort(compareText),
    });
}

function routeIdHashConflict(artifact: StrategicRouteGenerationArtifactV1): boolean {
  const hashesByRouteId = new Map<string, string>();
  for (const route of artifact.routeCandidates ?? []) {
    const previous = hashesByRouteId.get(route.routeId);
    if (previous !== undefined) return true;
    hashesByRouteId.set(route.routeId, route.routeHash);
  }
  return false;
}

function routeIdCrossSourceConflict(
  artifacts: readonly StrategicRouteGenerationArtifactV1[],
): boolean {
  const hashesByRouteId = new Map<string, string>();
  for (const artifact of artifacts) {
    for (const route of artifact.routeCandidates ?? []) {
      const previous = hashesByRouteId.get(route.routeId);
      if (previous !== undefined) return true;
      hashesByRouteId.set(route.routeId, route.routeHash);
    }
  }
  return false;
}

function validRoute(route: StrategicRouteCandidateFactV1): boolean {
  const { routeHash: _routeHash, ...payload } = route;
  if (route.routeHash !== canonicalHash(payload)) return false;
  const { endpointHash: _endpointHash, ...endpointPayload } = route.endpointFacts;
  if (route.endpointFacts.endpointHash !== canonicalHash(endpointPayload)) return false;
  return route.branchLocalResolutionWitnesses.every((witness) => {
    const { witnessHash: _witnessHash, ...witnessPayload } = witness;
    if (witness.witnessHash !== canonicalHash(witnessPayload)) return false;
    if (witness.selectedAlternativeReservationFactIds.length !== witness.allocations.length
      || witness.selectedAlternativeReservationFactIds.some((id, index) =>
        id !== witness.allocations[index]?.alternativeReservationFactId)) return false;
    return witness.allocations.every((allocation) => {
      const { allocationHash: _allocationHash, ...allocationPayload } = allocation;
      return allocation.allocationHash === canonicalHash(allocationPayload);
    });
  });
}

function crossComponentOverlapReason(
  components: readonly StrategicComponentRouteFactSetV1[],
): StrategicMultiComponentAndBindingReasonCodeV1 | null {
  const physicalOwners = new Set<string>();
  const wildcardOwners = new Set<string>();
  for (const component of components) {
    if (component.wildcardCardIds.some((cardId) => wildcardOwners.has(cardId))) {
      return "CROSS_COMPONENT_WILDCARD_OVERLAP";
    }
    if (component.physicalCardIds.some((cardId) => physicalOwners.has(cardId))) {
      return "CROSS_COMPONENT_PHYSICAL_OVERLAP";
    }
    component.wildcardCardIds.forEach((cardId) => wildcardOwners.add(cardId));
    component.physicalCardIds.forEach((cardId) => physicalOwners.add(cardId));
  }
  return null;
}

function inconclusiveArtifact(
  bindings: CommonBindingsV1,
  budget: StrategicMultiComponentAndBindingBudgetV1,
  sourceArtifactHashes: readonly string[],
  sourceRouteUniverseHashes: readonly string[],
  reasonCodes: readonly StrategicMultiComponentAndBindingReasonCodeV1[],
  exhaustedDimensions: readonly StrategicMultiComponentAndBindingBudgetDimensionV1[],
  budgetObservation: StrategicMultiComponentAndBindingBudgetObservationV1,
): StrategicMultiComponentAndBindingArtifactV1 {
  return terminalArtifact(
    "INCONCLUSIVE",
    bindings,
    budget,
    sourceArtifactHashes,
    sourceRouteUniverseHashes,
    reasonCodes,
    exhaustedDimensions,
    budgetObservation,
  );
}

function rejectedArtifact(
  bindings: CommonBindingsV1,
  budget: StrategicMultiComponentAndBindingBudgetV1,
  sourceArtifactHashes: readonly string[],
  sourceRouteUniverseHashes: readonly string[],
  reasonCodes: readonly StrategicMultiComponentAndBindingReasonCodeV1[],
  budgetObservation: StrategicMultiComponentAndBindingBudgetObservationV1,
): StrategicMultiComponentAndBindingArtifactV1 {
  return terminalArtifact(
    "REJECTED",
    bindings,
    budget,
    sourceArtifactHashes,
    sourceRouteUniverseHashes,
    reasonCodes,
    [],
    budgetObservation,
  );
}

function terminalArtifact(
  bindingStatus: "INCONCLUSIVE" | "REJECTED",
  bindings: CommonBindingsV1,
  budget: StrategicMultiComponentAndBindingBudgetV1,
  sourceArtifactHashes: readonly string[],
  sourceRouteUniverseHashes: readonly string[],
  reasonCodes: readonly StrategicMultiComponentAndBindingReasonCodeV1[],
  exhaustedDimensions: readonly StrategicMultiComponentAndBindingBudgetDimensionV1[],
  budgetObservation: StrategicMultiComponentAndBindingBudgetObservationV1,
): StrategicMultiComponentAndBindingArtifactV1 {
  const budgetExecution = multiComponentBudgetExecutionOf(
    budget,
    budgetObservation,
    exhaustedDimensions,
    sourceArtifactHashes,
    sourceRouteUniverseHashes,
  );
  const payload = {
    schemaVersion: STRATEGIC_MULTI_COMPONENT_AND_BINDING_V1_SCHEMA_VERSION,
    ...bindings,
    budget,
    bindingStatus,
    componentRouteFacts: null,
    andEndpointReferences: null,
    componentEndpointCount: 0,
    evidenceCost: 0,
    budgetObservation,
    budgetExecution,
    exhaustedDimensions: [...exhaustedDimensions].sort(compareText),
    reasonCodes: [...reasonCodes].sort(compareText),
    componentIds: null,
    andComponentSetHash: null,
    sourceArtifactHashes: [...sourceArtifactHashes].sort(compareText),
    sourceRouteUniverseHashes: [...sourceRouteUniverseHashes].sort(compareText),
    routeUniverseHash: null,
    semanticBoundary: "MULTI_COMPONENT_AND_BINDING_FACTS_NOT_AI_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
}

function multiComponentBudgetExecutionOf(
  budget: StrategicMultiComponentAndBindingBudgetV1,
  observation: StrategicMultiComponentAndBindingBudgetObservationV1,
  exhaustedDimensions: readonly StrategicMultiComponentAndBindingBudgetDimensionV1[],
  sourceArtifactHashes: readonly string[],
  sourceRouteUniverseHashes: readonly string[],
): StrategicBudgetExecutionArtifactV1 {
  const dimensionMap: Readonly<Record<
    StrategicMultiComponentAndBindingBudgetDimensionV1,
    StrategicBudgetDimensionV1
  >> = {
    MAX_COMPONENT_ENDPOINT_COUNT: "COMPONENT_ENDPOINT_COUNT",
    MAX_EVIDENCE_COST: "EVIDENCE_COST",
  };
  const evidenceCompleteness: StrategicBudgetMeasurementCompletenessV1 =
    observation.measurementCompleteness;
  const endpointLimit = validBudget(budget) ? budget.maxComponentEndpointCount : 0;
  const evidenceLimit = validBudget(budget) ? budget.maxEvidenceCost : 0;
  return materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "COMPONENT_ENDPOINT_COUNT",
        limit: endpointLimit,
        observedCount: observation.observedComponentEndpointCount,
        measurementCompleteness: evidenceCompleteness,
      },
      {
        dimension: "EVIDENCE_COST",
        limit: evidenceLimit,
        observedCount: observation.observedEvidenceCost,
        measurementCompleteness: evidenceCompleteness,
      },
    ],
    exhaustedDimensions: exhaustedDimensions.map((dimension) => dimensionMap[dimension]),
    sourceHashBindings: [
      ...sourceArtifactHashes.map((sourceHash) => ({
        sourceKind: "STRATEGIC_ROUTE_GENERATION_ARTIFACT" as const,
        sourceHash,
      })),
      ...sourceRouteUniverseHashes.map((sourceHash) => ({
        sourceKind: "STRATEGIC_ROUTE_UNIVERSE" as const,
        sourceHash,
      })),
    ],
  });
}

function componentIdOf(artifact: StrategicRouteGenerationArtifactV1): string {
  return artifact.routeCandidates?.[0]?.endpointFacts.resourceComponentId ?? "";
}

function bindingsOf(artifact: StrategicRouteGenerationArtifactV1 | undefined): CommonBindingsV1 {
  return {
    identityHash: artifact?.identityHash ?? "",
    snapshotHash: artifact?.snapshotHash ?? "",
    sourceRootHash: artifact?.sourceRootHash ?? "",
    provenanceRoot: artifact?.provenanceRoot ?? "",
  };
}

function sameBindings(artifacts: readonly StrategicRouteGenerationArtifactV1[]): boolean {
  const expected = bindingsOf(artifacts[0]);
  return artifacts.every((artifact) => {
    const actual = bindingsOf(artifact);
    return actual.identityHash === expected.identityHash
      && actual.snapshotHash === expected.snapshotHash
      && actual.sourceRootHash === expected.sourceRootHash
      && actual.provenanceRoot === expected.provenanceRoot;
  });
}

function compareSourceArtifacts(
  left: StrategicRouteGenerationArtifactV1,
  right: StrategicRouteGenerationArtifactV1,
): number {
  return compareText(componentIdOf(left), componentIdOf(right))
    || compareText(left.routeUniverseHash ?? "", right.routeUniverseHash ?? "")
    || compareText(left.artifactHash, right.artifactHash);
}

function validBudget(budget: StrategicMultiComponentAndBindingBudgetV1): boolean {
  return Number.isInteger(budget.maxComponentEndpointCount)
    && budget.maxComponentEndpointCount > 0
    && Number.isInteger(budget.maxEvidenceCost)
    && budget.maxEvidenceCost > 0;
}

function sourceValidationWithinLimit(
  artifacts: readonly StrategicRouteGenerationArtifactV1[],
): boolean {
  let work = 0;
  const add = (count: number): boolean => {
    work += count;
    return work <= SOURCE_VALIDATION_WORK_LIMIT_V1;
  };
  for (const artifact of artifacts) {
    if (!add(artifact.routeCandidates?.length ?? 0)
      || !add(artifact.artifactHash.length)
      || !add(artifact.routeUniverseHash?.length ?? 0)) return false;
    for (const route of artifact.routeCandidates ?? []) {
      if (!add(route.supportingHierarchyFacts.length
        + route.supportingReservationFacts.length
        + route.resourceClaims.length
        + route.preservedResources.length
        + route.consumedResources.length
        + route.unresolvedConflicts.length
        + route.branchLocalResolutionWitnesses.length)) return false;
    }
  }
  return true;
}

function exactObservation(): StrategicMultiComponentAndBindingBudgetObservationV1 {
  return {
    observedComponentEndpointCount: 0,
    observedEvidenceCost: 0,
    measurementCompleteness: "EXACT",
  };
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
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
