import { canonicalHash } from "./strategicEvidenceCanonicalSerializer";
import { classifyStrategicHierarchyBatchV1 } from "./strategicHierarchyClassifierV1";
import { materializeStrategicResourceReservationsV1 } from "./strategicResourceReservationV1";
import { generateStrategicRouteCandidateFactsV1 } from "./strategicRouteCandidateFactsV1";
import { bindStrategicMultiComponentAndEndpointsV1 } from
  "./strategicMultiComponentAndBindingV1";
import type { StrategicRouteCandidateFactV1 } from
  "./strategicRouteCandidateFactsV1Contracts";
import type {
  StrategicComponentAndEndpointReferenceV1,
  StrategicComponentRouteFactSetV1,
  StrategicMultiComponentAndBindingArtifactV1,
} from "./strategicMultiComponentAndBindingV1Contracts";
import {
  STRATEGIC_COHORT_COMPRESSION_V1_SCHEMA_VERSION,
  type HierarchicalStrategicCohortCompressionArtifactV1,
  type HierarchicalStrategicCohortCompressorV1,
  type PhaseDAdmittedComponentSourceV1,
  type PhaseDCommonBindingsV1,
  type PhaseDComponentSourceBindingV1,
  type PhaseDRouteIdentityIndexEntryV1,
  type PhaseDSourceAdmissionResultV1,
  type PhaseDSourceBindingManifestV1,
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
    if (!validEvidenceBudget(input)) {
      return terminal(input, "INCONCLUSIVE", ["INVALID_BUDGET"], 0);
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
        return terminal(input, "REJECTED", ["SOURCE_BINDING_MISMATCH"], 0);
      }
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
    || artifact.andEndpointReferences.some((endpoint) => !validEndpointReference(endpoint))) {
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
  }))).sort((left, right) => compareText(left.routeId, right.routeId)
    || compareText(left.routeHash, right.routeHash)
    || compareText(left.resourceComponentId, right.resourceComponentId));
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
  return left.length === right.length
    && unique(left).length === left.length
    && unique(right).length === right.length
    && [...left].sort(compareText).every((value, index) => value === [...right].sort(compareText)[index]);
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
