import { canonicalHash } from "../../../src/ai/d2h/strategicEvidenceCanonicalSerializer";
import { materializeStrategicBudgetExecutionV1 } from
  "../../../src/ai/d2h/strategicBudgetExecutionV1";
import { generateStrategicRouteCandidateFactsV1 } from
  "../../../src/ai/d2h/strategicRouteCandidateFactsV1";
import type { StrategicRouteGenerationArtifactV1 } from
  "../../../src/ai/d2h/strategicRouteCandidateFactsV1Contracts";
import { bindStrategicMultiComponentAndEndpointsV1 } from
  "../../../src/ai/d2h/strategicMultiComponentAndBindingV1";
import {
  STRATEGIC_MULTI_COMPONENT_AND_BINDING_V1_SCHEMA_VERSION,
  type StrategicMultiComponentAndBindingArtifactV1,
} from "../../../src/ai/d2h/strategicMultiComponentAndBindingV1Contracts";
import { buildStrategicStructureInventoryV1 } from
  "../../../src/ai/d2h/strategicStructureInventory";
import type { StrategicStructureInventoryV1 } from
  "../../../src/ai/d2h/strategicStructureInventoryContracts";
import type {
  NormalizedRouteCohortMemberDraftV1,
  PhaseDSourceAdmissionSuccessV1,
  PhaseDComponentSourceBindingV1,
  PhaseDSourceBindingManifestV1,
  StrategicCohortCompressionInputV1,
} from "../../../src/ai/d2h/strategicCohortCompressionV1Contracts";
import { normalizeAdmittedStrategicRoutesV1 } from
  "../../../src/ai/d2h/strategicCohortCompressionV1";
import {
  makeRouteFixtureFromInventory,
  type FamilySelectionV1,
} from "./strategicRouteCandidateFactsV1.fixtures";
import { makeInventoryInput } from "./strategicStructureInventory.fixtures";

const C1_BUDGET = {
  maxRouteCount: 100,
  maxConflictExpansion: 100,
  maxEvidenceCost: 10_000,
} as const;

const C2_BUDGET = {
  maxComponentEndpointCount: 10,
  maxEvidenceCost: 100_000,
} as const;

const PHASE_D_BUDGET = {
  maxMemberEnvelopeCount: 100,
  maxResourceRoleSlotCount: 1000,
  maxConflictClosureEdgeCount: 1000,
  maxRouteMappingCount: 100,
  maxEquivalenceProofCount: 100,
  maxLineageOccurrenceWitnessCount: 5000,
} as const;

export function makeValidPhaseDAdmissionInput(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(2);
  return inputOf(components, bind(components));
}

export function makeThreeComponentPhaseDAdmissionInput(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(3);
  return inputOf(components, bind(components));
}

export function makeSameRankDifferentCopyPhaseDAdmissionInput(): StrategicCohortCompressionInputV1 {
  const firstPairIds = ["S9-1", "C9-1"];
  const secondPairIds = ["S9-2", "C9-2"];
  const input = makeInventoryInput([...firstPairIds, ...secondPairIds], "2");
  const inventory = buildStrategicStructureInventoryV1(input.a0, input.b0);
  const family = exactFamily(inventory, "pair", firstPairIds);
  const components = [firstPairIds, secondPairIds].map((physicalCardIds) => {
    const fixture = makeRouteFixtureFromInventory(inventory, [{
      familyId: family.familyId,
      exactMemberPhysicalCardIds: physicalCardIds,
    }]);
    const routeArtifact = generateStrategicRouteCandidateFactsV1({ ...fixture, budget: C1_BUDGET });
    if (routeArtifact.generationStatus !== "COMPLETE") {
      throw new Error("Same-rank copy fixture needs complete C1 facts");
    }
    return componentSourceOf(fixture.hierarchyBatch, fixture.reservationArtifact, routeArtifact);
  });
  return inputOf(components, bind(components));
}

export function makeWildcardPhaseDAdmissionInput(): StrategicCohortCompressionInputV1 {
  const straightFlushIds = ["S3-1", "S4-1", "S5-1", "S6-1", "H2-1"];
  const bombIds = ["C7-1", "D7-1", "H7-1", "H2-1"];
  const wildcardPairIds = ["C8-1", "H2-1"];
  const disjointPairIds = ["S9-1", "C9-1"];
  const input = makeInventoryInput([
    ...new Set([...straightFlushIds, ...bombIds, ...wildcardPairIds, ...disjointPairIds]),
  ], "2");
  const inventory = buildStrategicStructureInventoryV1(input.a0, input.b0);
  const selections: readonly FamilySelectionV1[][] = [
    [
      {
        familyId: exactFamily(inventory, "straight-flush", straightFlushIds).familyId,
        exactMemberPhysicalCardIds: straightFlushIds,
      },
      {
        familyId: exactFamily(inventory, "bomb", bombIds).familyId,
        exactMemberPhysicalCardIds: bombIds,
      },
      {
        familyId: exactFamily(inventory, "pair", wildcardPairIds).familyId,
        exactMemberPhysicalCardIds: wildcardPairIds,
      },
    ],
    [{
      familyId: exactFamily(inventory, "pair", disjointPairIds).familyId,
      exactMemberPhysicalCardIds: disjointPairIds,
    }],
  ];
  const components = selections.map((selection) => {
    const fixture = makeRouteFixtureFromInventory(inventory, selection);
    const routeArtifact = generateStrategicRouteCandidateFactsV1({ ...fixture, budget: C1_BUDGET });
    if (routeArtifact.generationStatus !== "COMPLETE") {
      throw new Error("Wildcard Phase D fixture needs complete C1 facts");
    }
    return componentSourceOf(fixture.hierarchyBatch, fixture.reservationArtifact, routeArtifact);
  });
  return inputOf(components, bind(components));
}

export function makeInvalidPhaseDEvidenceBudgetFixture(): StrategicCohortCompressionInputV1 {
  const input = makeValidPhaseDAdmissionInput();
  return {
    ...input,
    evidenceBudget: {
      ...input.evidenceBudget,
      maxMemberEnvelopeCount: 0,
    },
  };
}

export function makeCorruptedSourceWithInvalidPhaseDEvidenceBudgetFixture():
  StrategicCohortCompressionInputV1 {
  const input = makeMultiComponentHashMismatchFixture();
  return {
    ...input,
    evidenceBudget: {
      ...input.evidenceBudget,
      maxMemberEnvelopeCount: 0,
    },
  };
}

export function makeMissingC2ComponentSourceFixture(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(2);
  return inputOf(components.slice(0, 1), bind(components));
}

export function makeExtraComponentSourceFixture(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(3);
  return inputOf(components, bind(components.slice(0, 2)));
}

export function makeDuplicateComponentSourceFixture(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(2);
  return inputOf([components[0], components[0], components[1]], bind(components));
}

export function makeWrongComponentABBindingFixture(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(2);
  const wrong = {
    ...components[0],
    hierarchyBatch: components[1].hierarchyBatch,
    hierarchyBatchHash: components[1].hierarchyBatchHash,
    reservationArtifact: components[1].reservationArtifact,
    reservationArtifactHash: components[1].reservationArtifactHash,
  };
  return inputOf([wrong, components[1]], bind(components));
}

export function makeCommonBindingMismatchFixture(): StrategicCohortCompressionInputV1 {
  const input = makeValidPhaseDAdmissionInput();
  return withManifest(input, {
    ...input.sourceBindingManifest,
    commonBindings: {
      ...input.sourceBindingManifest.commonBindings,
      identityHash: "contradictory-identity-hash",
    },
  });
}

export function makeManifestHashMismatchFixture(): StrategicCohortCompressionInputV1 {
  const input = makeValidPhaseDAdmissionInput();
  return {
    ...input,
    sourceBindingManifest: {
      ...input.sourceBindingManifest,
      manifestHash: "forged-manifest-hash",
    },
  };
}

export function makeMultiComponentHashMismatchFixture(): StrategicCohortCompressionInputV1 {
  const input = makeValidPhaseDAdmissionInput();
  return withManifest(input, {
    ...input.sourceBindingManifest,
    multiComponentArtifactHash: "forged-c2-artifact-hash",
  });
}

export function makeCrossPairedC2EndpointFixture(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(2);
  const original = bind(components);
  const endpoints = original.andEndpointReferences!;
  const swappedArtifactHashes = [endpoints[1].sourceArtifactHash, endpoints[0].sourceArtifactHash];
  const andEndpointReferences = endpoints.map((endpoint, index) => {
    const { endpointHash: _endpointHash, ...payload } = endpoint;
    const changed = { ...payload, sourceArtifactHash: swappedArtifactHashes[index] };
    return { ...changed, endpointHash: canonicalHash(changed) };
  });
  const routeUniverseHash = canonicalHash({
    kind: "strategic-multi-component-and-route-universe-v1",
    identityHash: original.identityHash,
    snapshotHash: original.snapshotHash,
    sourceRootHash: original.sourceRootHash,
    provenanceRoot: original.provenanceRoot,
    sourceRouteUniverseHashes: original.sourceRouteUniverseHashes,
    componentSemanticHashes: original.componentRouteFacts!.map((fact) => canonicalHash({
      kind: "strategic-component-route-universe-v1",
      resourceComponentId: fact.resourceComponentId,
      sourceRouteUniverseHash: fact.sourceRouteUniverseHash,
      routeHashes: fact.routeCandidates.map((route) => route.routeHash).sort(compareText),
      physicalCardIds: fact.physicalCardIds,
      wildcardCardIds: fact.wildcardCardIds,
    })).sort(compareText),
    endpointSemanticHashes: andEndpointReferences.map((endpoint) => canonicalHash({
      kind: "strategic-component-and-endpoint-universe-v1",
      resourceComponentId: endpoint.resourceComponentId,
      sourceRouteUniverseHash: endpoint.sourceRouteUniverseHash,
      routeReferences: endpoint.routeReferences,
      andComponentSetHash: endpoint.andComponentSetHash,
    })).sort(compareText),
  });
  const { artifactHash: _artifactHash, ...originalPayload } = original;
  const payload = { ...originalPayload, andEndpointReferences, routeUniverseHash };
  const forged = { ...payload, artifactHash: canonicalHash(payload) };
  return inputOf(components, forged);
}

export function makeDuplicateRouteIdentityConflictFixture(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(2);
  const duplicateRouteId = components[0].routeArtifact.routeCandidates![0].routeId;
  const secondArtifact = components[1].routeArtifact;
  const changedRoutes = secondArtifact.routeCandidates!.map((route, index) => {
    if (index !== 0) return route;
    const { routeHash: _routeHash, ...routePayload } = route;
    const changed = { ...routePayload, routeId: duplicateRouteId };
    return { ...changed, routeHash: canonicalHash(changed) };
  }).sort((left, right) => compareText(left.routeId, right.routeId));
  const routeUniverseHash = canonicalHash({
    kind: "strategic-route-universe-v1",
    identityHash: secondArtifact.identityHash,
    snapshotHash: secondArtifact.snapshotHash,
    sourceRootHash: secondArtifact.sourceRootHash,
    provenanceRoot: secondArtifact.provenanceRoot,
    sourceInventoryHash: secondArtifact.sourceInventoryHash,
    routeHashes: changedRoutes.map((route) => route.routeHash),
  });
  const { artifactHash: _artifactHash, ...artifactPayload } = secondArtifact;
  const changedArtifactPayload = { ...artifactPayload, routeCandidates: changedRoutes, routeUniverseHash };
  const changedArtifact = {
    ...changedArtifactPayload,
    artifactHash: canonicalHash(changedArtifactPayload),
  };
  const changedComponent = componentSourceOf(
    components[1].hierarchyBatch,
    components[1].reservationArtifact,
    changedArtifact,
  );
  const changedComponents = [components[0], changedComponent];
  return inputOf(changedComponents, rebindWithRouteIdentityConflict(bind(components), changedComponents));
}

function rebindWithRouteIdentityConflict(
  original: StrategicMultiComponentAndBindingArtifactV1,
  components: readonly PhaseDComponentSourceBindingV1[],
): StrategicMultiComponentAndBindingArtifactV1 {
  const componentRouteFacts = components.map((component) => {
    const routeCandidates = [...(component.routeArtifact.routeCandidates ?? [])]
      .sort((left, right) => compareText(left.routeId, right.routeId));
    const payload = {
      resourceComponentId: component.resourceComponentId,
      sourceArtifactHash: component.routeArtifactHash,
      sourceRouteUniverseHash: component.routeUniverseHash,
      routeCandidates,
      routeCount: routeCandidates.length,
      physicalCardIds: [...new Set(routeCandidates
        .flatMap((route) => route.endpointFacts.accountedPhysicalCardIds))].sort(compareText),
      wildcardCardIds: [...new Set(routeCandidates
        .flatMap((route) => route.resourceClaims.flatMap((claim) => claim.wildcardCardIds)))].sort(compareText),
    };
    return { ...payload, componentFactHash: canonicalHash(payload) };
  }).sort((left, right) => compareText(left.resourceComponentId, right.resourceComponentId));
  const componentIds = componentRouteFacts.map((component) => component.resourceComponentId);
  const sourceArtifactHashes = componentRouteFacts.map((component) => component.sourceArtifactHash);
  const sourceRouteUniverseHashes = componentRouteFacts.map((component) => component.sourceRouteUniverseHash);
  const andComponentSetHash = canonicalHash({
    kind: "strategic-and-component-set-v1",
    componentIds,
    sourceRouteUniverseHashes,
  });
  const andEndpointReferences = componentRouteFacts.map((component) => {
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
  });
  const routeUniverseHash = canonicalHash({
    kind: "strategic-multi-component-and-route-universe-v1",
    identityHash: original.identityHash,
    snapshotHash: original.snapshotHash,
    sourceRootHash: original.sourceRootHash,
    provenanceRoot: original.provenanceRoot,
    sourceRouteUniverseHashes,
    componentSemanticHashes: componentRouteFacts.map((component) => canonicalHash({
      kind: "strategic-component-route-universe-v1",
      resourceComponentId: component.resourceComponentId,
      sourceRouteUniverseHash: component.sourceRouteUniverseHash,
      routeHashes: component.routeCandidates.map((route) => route.routeHash).sort(compareText),
      physicalCardIds: component.physicalCardIds,
      wildcardCardIds: component.wildcardCardIds,
    })).sort(compareText),
    endpointSemanticHashes: andEndpointReferences.map((endpoint) => canonicalHash({
      kind: "strategic-component-and-endpoint-universe-v1",
      resourceComponentId: endpoint.resourceComponentId,
      sourceRouteUniverseHash: endpoint.sourceRouteUniverseHash,
      routeReferences: endpoint.routeReferences,
      andComponentSetHash: endpoint.andComponentSetHash,
    })).sort(compareText),
  });
  const budgetExecution = materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "COMPONENT_ENDPOINT_COUNT",
        limit: original.budget.maxComponentEndpointCount,
        observedCount: original.componentEndpointCount,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "EVIDENCE_COST",
        limit: original.budget.maxEvidenceCost,
        observedCount: original.evidenceCost,
        measurementCompleteness: "EXACT",
      },
    ],
    exhaustedDimensions: [],
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
  const payload = {
    schemaVersion: original.schemaVersion,
    identityHash: original.identityHash,
    snapshotHash: original.snapshotHash,
    sourceRootHash: original.sourceRootHash,
    provenanceRoot: original.provenanceRoot,
    budget: original.budget,
    bindingStatus: "COMPLETE" as const,
    componentRouteFacts,
    andEndpointReferences,
    componentEndpointCount: original.componentEndpointCount,
    evidenceCost: original.evidenceCost,
    budgetObservation: original.budgetObservation,
    budgetExecution,
    exhaustedDimensions: [],
    reasonCodes: [],
    componentIds,
    andComponentSetHash,
    sourceArtifactHashes,
    sourceRouteUniverseHashes,
    routeUniverseHash,
    semanticBoundary: "MULTI_COMPONENT_AND_BINDING_FACTS_NOT_AI_DECISION" as const,
  };
  return { ...payload, artifactHash: canonicalHash(payload) };
}

export function makeReversedComponentSourceInput(
  input: StrategicCohortCompressionInputV1,
): StrategicCohortCompressionInputV1 {
  return {
    ...input,
    sourceBindingManifest: {
      ...input.sourceBindingManifest,
      componentSources: [...input.sourceBindingManifest.componentSources].reverse(),
    },
  };
}

export function makeBrokenClosureReferenceFixture(): PhaseDSourceAdmissionSuccessV1 {
  const original = makeValidPhaseDAdmissionInput();
  const originalComponents = original.sourceBindingManifest.componentSources;
  const first = originalComponents[0];
  const route = first?.routeArtifact.routeCandidates?.[0];
  if (first === undefined || route === undefined) throw new Error("Missing broken closure fixture route");
  const { routeHash: _routeHash, ...routePayload } = route;
  const changedRoutePayload = {
    ...routePayload,
    unresolvedConflicts: [...route.unresolvedConflicts, "missing-conflict-reference"],
  };
  const changedRoute = { ...changedRoutePayload, routeHash: canonicalHash(changedRoutePayload) };
  const changedRoutes = first.routeArtifact.routeCandidates!.map((candidate) =>
    candidate.routeId === route.routeId ? changedRoute : candidate);
  const changedRouteUniverseHash = canonicalHash({
    kind: "strategic-route-universe-v1",
    identityHash: first.routeArtifact.identityHash,
    snapshotHash: first.routeArtifact.snapshotHash,
    sourceRootHash: first.routeArtifact.sourceRootHash,
    provenanceRoot: first.routeArtifact.provenanceRoot,
    sourceInventoryHash: first.routeArtifact.sourceInventoryHash,
    routeHashes: changedRoutes.map((candidate) => candidate.routeHash).sort(compareText),
  });
  const changedConflictExpansionCount = changedRoutes
    .filter((candidate) => candidate.unresolvedConflicts.length > 0).length;
  const changedEvidenceCost = changedRoutes.reduce((sum, candidate) => sum
    + candidate.supportingHierarchyFacts.length
    + candidate.supportingReservationFacts.length
    + candidate.resourceClaims.length
    + candidate.preservedResources.length
    + candidate.consumedResources.length
    + candidate.unresolvedConflicts.length
    + candidate.branchLocalResolutionWitnesses.length
    + 1, 0);
  const changedBudgetObservation = {
    ...first.routeArtifact.budgetObservation,
    observedConflictExpansionCount: changedConflictExpansionCount,
    observedEvidenceCost: changedEvidenceCost,
  };
  const changedBudgetExecution = materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "ROUTE_CANDIDATE_COUNT",
        limit: first.routeArtifact.budget.maxRouteCount,
        observedCount: changedRoutes.length,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "CONFLICT_EXPANSION_COUNT",
        limit: first.routeArtifact.budget.maxConflictExpansion,
        observedCount: first.routeArtifact.generationWorkObservedCount,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "EVIDENCE_COST",
        limit: first.routeArtifact.budget.maxEvidenceCost,
        observedCount: changedEvidenceCost,
        measurementCompleteness: "EXACT",
      },
    ],
    exhaustedDimensions: [],
    sourceHashBindings: [
      { sourceKind: "STRATEGIC_STRUCTURE_INVENTORY", sourceHash: first.routeArtifact.sourceInventoryHash },
      {
        sourceKind: "STRATEGIC_HIERARCHY_CLASSIFICATION_BATCH",
        sourceHash: first.routeArtifact.sourceHierarchyBatchHash,
      },
      {
        sourceKind: "STRATEGIC_RESOURCE_RESERVATION_ARTIFACT",
        sourceHash: first.routeArtifact.sourceReservationArtifactHash,
      },
    ],
  });
  const { artifactHash: _artifactHash, ...artifactPayload } = first.routeArtifact;
  const changedArtifactPayload = {
    ...artifactPayload,
    routeCandidates: changedRoutes,
    conflictExpansionCount: changedConflictExpansionCount,
    evidenceCost: changedEvidenceCost,
    budgetObservation: changedBudgetObservation,
    budgetExecution: changedBudgetExecution,
    routeUniverseHash: changedRouteUniverseHash,
  };
  const changedArtifact = {
    ...changedArtifactPayload,
    artifactHash: canonicalHash(changedArtifactPayload),
  };
  const changedComponents = canonicalComponentSources([
    {
      ...first,
      routeArtifact: changedArtifact,
      routeArtifactHash: changedArtifact.artifactHash,
      routeUniverseHash: changedRouteUniverseHash,
    },
    ...originalComponents.slice(1),
  ]);
  const multiComponentArtifact = bind(changedComponents);
  const manifestPayload = {
    commonBindings: commonBindingsOf(multiComponentArtifact),
    componentSources: changedComponents,
    multiComponentArtifact,
    multiComponentArtifactHash: multiComponentArtifact.artifactHash,
    andComponentSetHash: multiComponentArtifact.andComponentSetHash!,
  };
  const sourceBindingManifest = {
    ...manifestPayload,
    manifestHash: canonicalHash(manifestPayload),
  };
  const admittedComponents = changedComponents.map((component) => {
    const routeCandidates = component.routeArtifact.routeCandidates!;
    const payload = {
      resourceComponentId: component.resourceComponentId,
      hierarchyBatchHash: component.hierarchyBatchHash,
      reservationArtifactHash: component.reservationArtifactHash,
      routeArtifactHash: component.routeArtifactHash,
      routeUniverseHash: component.routeUniverseHash,
      routeIds: routeCandidates.map((candidate) => candidate.routeId).sort(compareText),
      routeHashes: routeCandidates.map((candidate) => candidate.routeHash).sort(compareText),
    };
    return { ...payload, componentAdmissionHash: canonicalHash(payload) };
  });
  const routeIdentityIndex = changedComponents.flatMap((component) =>
    component.routeArtifact.routeCandidates!.map((candidate) => ({
      routeId: candidate.routeId,
      routeHash: candidate.routeHash,
      resourceComponentId: component.resourceComponentId,
      sourceArtifactHash: component.routeArtifactHash,
      sourceRouteUniverseHash: component.routeUniverseHash,
    }))).sort((left, right) => compareText(left.routeId, right.routeId)
      || compareText(left.routeHash, right.routeHash));
  const admissionPayload = {
    admissionStatus: "ADMITTED" as const,
    canonicalSourceBindingManifest: sourceBindingManifest,
    sourceBindingManifestHash: sourceBindingManifest.manifestHash,
    admittedComponents,
    routeIdentityIndex,
    inputRouteCount: routeIdentityIndex.length,
  };
  const admission = { ...admissionPayload, admissionHash: canonicalHash(admissionPayload) };
  return admission;
}

export function makeCrossConflictWitnessBindingFixture(): Readonly<{
  admission: PhaseDSourceAdmissionSuccessV1;
  normalizedMemberDrafts: readonly NormalizedRouteCohortMemberDraftV1[];
}> {
  const components = makeValidPhaseDAdmissionInput().sourceBindingManifest.componentSources;
  const originalAdmission = admittedChangedComponentsOf(components);
  const normalized = normalizeAdmittedStrategicRoutesV1(originalAdmission);
  if (normalized.normalizationStatus !== "COMPLETE") {
    throw new Error("Cross-conflict witness fixture needs normalized source drafts");
  }
  const targetComponent = components[0];
  const targetRoute = targetComponent?.routeArtifact.routeCandidates?.[0];
  const originalFact = targetComponent?.reservationArtifact.reservationFacts[0];
  const originalConflict = targetComponent?.reservationArtifact.conflictFacts[0];
  if (targetComponent === undefined || targetRoute === undefined || originalFact === undefined
    || originalConflict === undefined) throw new Error("Missing cross-conflict source facts");
  const alternatives = originalConflict.alternativeReservationFactIds.map((id) =>
    targetComponent.reservationArtifact.reservationAlternatives.find((candidate) =>
      candidate.alternativeReservationFactId === id));
  if (alternatives.length < 4 || alternatives.some((alternative) => alternative === undefined)) {
    throw new Error("Cross-conflict fixture needs four exact alternatives");
  }
  const [alternativeA1, alternativeA2, alternativeB1, alternativeB2] = alternatives as [
    NonNullable<typeof alternatives[number]>,
    NonNullable<typeof alternatives[number]>,
    NonNullable<typeof alternatives[number]>,
    NonNullable<typeof alternatives[number]>,
  ];
  const clonedAlternativeOf = (alternative: typeof alternativeA1, suffix: string) => {
    const { alternativeHash: _alternativeHash, ...payload } = alternative;
    const clonePayload = {
      ...payload,
      alternativeReservationFactId: canonicalHash({
        kind: "task4-cross-conflict-alternative-fixture-v1",
        originalAlternativeReservationFactId: alternative.alternativeReservationFactId,
        suffix,
      }),
    };
    return { ...clonePayload, alternativeHash: canonicalHash(clonePayload) };
  };
  const clonedAlternativeB1 = clonedAlternativeOf(alternativeB1, "B1");
  const clonedAlternativeB2 = clonedAlternativeOf(alternativeB2, "B2");
  const conflictA = originalConflict;
  const conflictBAlternativeIds = [
    clonedAlternativeB1.alternativeReservationFactId,
    clonedAlternativeB2.alternativeReservationFactId,
  ].sort(compareText);
  const conflictBId = canonicalHash({
    kind: "task4-cross-conflict-witness-fixture-v1",
    resourceComponentId: originalConflict.resourceComponentId,
    alternativeReservationFactIds: conflictBAlternativeIds,
  });
  const conflictBPayload = {
    resourceComponentId: originalConflict.resourceComponentId,
    claimantFamilyIds: [...originalConflict.claimantFamilyIds],
    claimantMemberIds: [...originalConflict.claimantMemberIds],
    physicalCardIds: [...originalConflict.physicalCardIds],
    wildcardCardIds: [...originalConflict.wildcardCardIds],
    conflictKinds: [...originalConflict.conflictKinds],
    conflictFactId: conflictBId,
    alternativeReservationFactIds: conflictBAlternativeIds,
    resolutionState: "UNRESOLVED" as const,
    dominanceWitnessId: null,
  };
  const conflictB = { ...conflictBPayload, conflictHash: canonicalHash(conflictBPayload) };
  const { reservationHash: _reservationHash, ...reservationPayload } = originalFact;
  const changedReservationFactPayload = {
    ...reservationPayload,
    conflictFactIds: [conflictA.conflictFactId, conflictB.conflictFactId].sort(compareText),
  };
  const changedReservationFact = {
    ...changedReservationFactPayload,
    reservationHash: canonicalHash(changedReservationFactPayload),
  };
  const reservationArtifact = rehashReservationArtifact({
    ...targetComponent.reservationArtifact,
    reservationFacts: targetComponent.reservationArtifact.reservationFacts.map((fact) =>
      fact.reservationFactId === originalFact.reservationFactId ? changedReservationFact : fact),
    reservationAlternatives: [
      ...targetComponent.reservationArtifact.reservationAlternatives,
      clonedAlternativeB1,
      clonedAlternativeB2,
    ].sort((left, right) => compareText(
      left.alternativeReservationFactId,
      right.alternativeReservationFactId,
    )),
    conflictFacts: [conflictA, conflictB].sort((left, right) =>
      compareText(left.conflictFactId, right.conflictFactId)),
  });
  const claimsById = new Map(changedReservationFact.claims.map((claim) => [claim.claimId, claim]));
  const routeClaims = [alternativeA1, clonedAlternativeB1].map((alternative) => {
    const claim = claimsById.get(alternative.claimId);
    if (claim === undefined) throw new Error("Missing cross-conflict source claim");
    return {
      claimId: claim.claimId,
      familyId: claim.familyId,
      memberIds: [alternative.memberId],
      resourceUnitIds: [alternative.resourceUnitId],
      alternativeReservationFactIds: [alternative.alternativeReservationFactId],
      hierarchyTier: claim.hierarchyTier,
      controlRank: claim.controlRank,
      efficiencyRank: claim.efficiencyRank,
      reservationClass: claim.reservationClass,
      claimRoles: [...claim.claimRoles],
      physicalCardIds: [...alternative.physicalCardIds],
      wildcardCardIds: [...alternative.wildcardCardIds],
      wildcardAllocationLineage: [...alternative.wildcardAllocationLineage],
      claimHash: claim.claimHash,
    };
  });
  const hierarchyByFamilyId = new Map(targetComponent.hierarchyBatch.families
    .map((family) => [family.familyId, family]));
  const supportingHierarchyFacts = routeClaims.map((claim) => {
    const family = hierarchyByFamilyId.get(claim.familyId);
    if (family === undefined) throw new Error("Missing cross-conflict hierarchy fact");
    return { familyId: claim.familyId, classificationHash: family.classificationHash };
  }).sort((left, right) => compareText(left.familyId, right.familyId));
  const allocationOf = (alternative: typeof alternativeA1) => {
    const payload = {
      alternativeReservationFactId: alternative.alternativeReservationFactId,
      alternativeHash: alternative.alternativeHash,
      resourceUnitId: alternative.resourceUnitId,
      physicalCardIds: [...alternative.physicalCardIds].sort(compareText),
      wildcardCardIds: [...alternative.wildcardCardIds].sort(compareText),
      wildcardAllocationLineage: [...alternative.wildcardAllocationLineage]
        .sort((left, right) => compareText(left.allocationVariantHash, right.allocationVariantHash)),
    };
    return { ...payload, allocationHash: canonicalHash(payload) };
  };
  const witnessOf = (conflictFactId: string, alternative: typeof alternativeA1) => {
    const allocation = allocationOf(alternative);
    const payload = {
      witnessKind: "BRANCH_LOCAL_RESOLUTION" as const,
      conflictFactId,
      selectedAlternativeReservationFactIds: [alternative.alternativeReservationFactId],
      allocations: [allocation],
    };
    return { ...payload, witnessHash: canonicalHash(payload) };
  };
  const forgedWitnessA = witnessOf(conflictA.conflictFactId, clonedAlternativeB1);
  const validWitnessB = witnessOf(conflictB.conflictFactId, clonedAlternativeB1);
  const { routeHash: _routeHash, ...routePayload } = targetRoute;
  const changedRoutePayload = {
    ...routePayload,
    supportingHierarchyFacts,
    supportingReservationFacts: [{
      reservationFactId: changedReservationFact.reservationFactId,
      alternativeReservationFactIds: [
        alternativeA1.alternativeReservationFactId,
        clonedAlternativeB1.alternativeReservationFactId,
      ].sort(compareText),
    }],
    resourceClaims: routeClaims,
    unresolvedConflicts: [conflictA.conflictFactId, conflictB.conflictFactId].sort(compareText),
    branchLocalResolutionWitnesses: [forgedWitnessA, validWitnessB]
      .sort((left, right) => compareText(left.conflictFactId, right.conflictFactId)),
  };
  const changedRoute = { ...changedRoutePayload, routeHash: canonicalHash(changedRoutePayload) };
  const changedRouteArtifact = rehashRouteArtifact({
    ...targetComponent.routeArtifact,
    sourceReservationArtifactHash: reservationArtifact.artifactHash,
    routeCandidates: targetComponent.routeArtifact.routeCandidates!.map((candidate) =>
      candidate.routeId === targetRoute.routeId ? changedRoute : candidate),
  });
  const changedComponents = canonicalComponentSources(components.map((component) =>
    component.resourceComponentId === targetComponent.resourceComponentId ? {
      ...component,
      reservationArtifact,
      reservationArtifactHash: reservationArtifact.artifactHash,
      routeArtifact: changedRouteArtifact,
      routeArtifactHash: changedRouteArtifact.artifactHash,
      routeUniverseHash: changedRouteArtifact.routeUniverseHash!,
    } : component));
  const admission = admittedChangedComponentsOf(changedComponents);
  const normalizedMemberDrafts = rebindNormalizedDrafts(
    normalized.normalizedMemberDrafts,
    admission,
    changedComponents,
  );
  return { admission, normalizedMemberDrafts };
}

export function makePhysicallyAdjacentUnreachableConflictFixture(): Readonly<{
  admission: PhaseDSourceAdmissionSuccessV1;
  normalizedMemberDrafts: readonly NormalizedRouteCohortMemberDraftV1[];
  relevantConflictFactId: string;
  adjacentConflictFactId: string;
}> {
  const components = makeValidPhaseDAdmissionInput().sourceBindingManifest.componentSources;
  const originalAdmission = admittedChangedComponentsOf(components);
  const normalized = normalizeAdmittedStrategicRoutesV1(originalAdmission);
  if (normalized.normalizationStatus !== "COMPLETE") {
    throw new Error("Adjacent conflict fixture needs normalized source drafts");
  }
  const targetComponent = components[0];
  const originalConflict = targetComponent?.reservationArtifact.conflictFacts[0];
  if (targetComponent === undefined || originalConflict === undefined) {
    throw new Error("Missing adjacent conflict source facts");
  }
  const { conflictHash: _conflictHash, ...conflictPayload } = originalConflict;
  const adjacentConflictPayload = {
    ...conflictPayload,
    conflictFactId: canonicalHash({
      kind: "task4-physically-adjacent-unreachable-conflict-fixture-v1",
      originalConflictFactId: originalConflict.conflictFactId,
    }),
  };
  const adjacentConflict = {
    ...adjacentConflictPayload,
    conflictHash: canonicalHash(adjacentConflictPayload),
  };
  const reservationArtifact = rehashReservationArtifact({
    ...targetComponent.reservationArtifact,
    conflictFacts: [...targetComponent.reservationArtifact.conflictFacts, adjacentConflict]
      .sort((left, right) => compareText(left.conflictFactId, right.conflictFactId)),
  });
  const routeArtifact = rehashRouteArtifact({
    ...targetComponent.routeArtifact,
    sourceReservationArtifactHash: reservationArtifact.artifactHash,
  });
  const changedComponents = canonicalComponentSources(components.map((component) =>
    component.resourceComponentId === targetComponent.resourceComponentId ? {
      ...component,
      reservationArtifact,
      reservationArtifactHash: reservationArtifact.artifactHash,
      routeArtifact,
      routeArtifactHash: routeArtifact.artifactHash,
      routeUniverseHash: routeArtifact.routeUniverseHash!,
    } : component));
  const admission = admittedChangedComponentsOf(changedComponents);
  return {
    admission,
    normalizedMemberDrafts: rebindNormalizedDrafts(
      normalized.normalizedMemberDrafts,
      admission,
      changedComponents,
    ),
    relevantConflictFactId: originalConflict.conflictFactId,
    adjacentConflictFactId: adjacentConflict.conflictFactId,
  };
}

function rebindNormalizedDrafts(
  drafts: readonly NormalizedRouteCohortMemberDraftV1[],
  admission: PhaseDSourceAdmissionSuccessV1,
  components: readonly PhaseDComponentSourceBindingV1[],
): readonly NormalizedRouteCohortMemberDraftV1[] {
  const componentById = new Map(components.map((component) =>
    [component.resourceComponentId, component]));
  return drafts.map((draft) => {
    const component = componentById.get(draft.resourceComponentId);
    if (component === undefined) throw new Error("Missing changed component draft binding");
    const route = component.routeArtifact.routeCandidates!.find((candidate) =>
      candidate.routeId === draft.routeId);
    if (route === undefined) throw new Error("Missing changed route draft binding");
    const payload = {
      ...draft,
      routeHash: route.routeHash,
      sourceArtifactHash: component.routeArtifactHash,
      sourceRouteUniverseHash: component.routeUniverseHash,
      sourceAndComponentSetHash: admission.canonicalSourceBindingManifest.andComponentSetHash,
    };
    const { normalizationHash: _normalizationHash, ...normalizationPayload } = payload;
    return { ...normalizationPayload, normalizationHash: canonicalHash(normalizationPayload) };
  });
}

function rehashReservationArtifact(
  artifact: PhaseDComponentSourceBindingV1["reservationArtifact"],
): PhaseDComponentSourceBindingV1["reservationArtifact"] {
  const { artifactHash: _artifactHash, ...payload } = artifact;
  return { ...payload, artifactHash: canonicalHash(payload) };
}

function rehashRouteArtifact(
  artifact: StrategicRouteGenerationArtifactV1,
): StrategicRouteGenerationArtifactV1 {
  const routeCandidates = artifact.routeCandidates;
  if (routeCandidates === null) throw new Error("Cross-conflict fixture needs complete route candidates");
  const conflictExpansionCount = routeCandidates
    .filter((candidate) => candidate.unresolvedConflicts.length > 0).length;
  const evidenceCost = routeCandidates.reduce((sum, candidate) => sum
    + candidate.supportingHierarchyFacts.length
    + candidate.supportingReservationFacts.length
    + candidate.resourceClaims.length
    + candidate.preservedResources.length
    + candidate.consumedResources.length
    + candidate.unresolvedConflicts.length
    + candidate.branchLocalResolutionWitnesses.length
    + 1, 0);
  const budgetObservation = {
    ...artifact.budgetObservation,
    observedRouteCount: routeCandidates.length,
    observedConflictExpansionCount: conflictExpansionCount,
    observedEvidenceCost: evidenceCost,
  };
  const budgetExecution = materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "ROUTE_CANDIDATE_COUNT",
        limit: artifact.budget.maxRouteCount,
        observedCount: routeCandidates.length,
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
        observedCount: evidenceCost,
        measurementCompleteness: "EXACT",
      },
    ],
    exhaustedDimensions: [],
    sourceHashBindings: [
      { sourceKind: "STRATEGIC_STRUCTURE_INVENTORY", sourceHash: artifact.sourceInventoryHash },
      {
        sourceKind: "STRATEGIC_HIERARCHY_CLASSIFICATION_BATCH",
        sourceHash: artifact.sourceHierarchyBatchHash,
      },
      {
        sourceKind: "STRATEGIC_RESOURCE_RESERVATION_ARTIFACT",
        sourceHash: artifact.sourceReservationArtifactHash,
      },
    ],
  });
  const routeUniverseHash = canonicalHash({
    kind: "strategic-route-universe-v1",
    identityHash: artifact.identityHash,
    snapshotHash: artifact.snapshotHash,
    sourceRootHash: artifact.sourceRootHash,
    provenanceRoot: artifact.provenanceRoot,
    sourceInventoryHash: artifact.sourceInventoryHash,
    routeHashes: routeCandidates.map((candidate) => candidate.routeHash).sort(compareText),
  });
  const { artifactHash: _artifactHash, ...payload } = artifact;
  const routePayload = {
    ...payload,
    conflictExpansionCount,
    evidenceCost,
    budgetObservation,
    budgetExecution,
    routeUniverseHash,
  };
  return { ...routePayload, artifactHash: canonicalHash(routePayload) };
}

function admittedChangedComponentsOf(
  componentSources: readonly PhaseDComponentSourceBindingV1[],
): PhaseDSourceAdmissionSuccessV1 {
  const orderedComponents = canonicalComponentSources(componentSources);
  const multiComponentArtifact = bind(orderedComponents);
  const manifestPayload = {
    commonBindings: commonBindingsOf(multiComponentArtifact),
    componentSources: orderedComponents,
    multiComponentArtifact,
    multiComponentArtifactHash: multiComponentArtifact.artifactHash,
    andComponentSetHash: multiComponentArtifact.andComponentSetHash!,
  };
  const sourceBindingManifest = {
    ...manifestPayload,
    manifestHash: canonicalHash(manifestPayload),
  };
  const admittedComponents = orderedComponents.map((component) => {
    const routeCandidates = component.routeArtifact.routeCandidates!;
    const payload = {
      resourceComponentId: component.resourceComponentId,
      hierarchyBatchHash: component.hierarchyBatchHash,
      reservationArtifactHash: component.reservationArtifactHash,
      routeArtifactHash: component.routeArtifactHash,
      routeUniverseHash: component.routeUniverseHash,
      routeIds: routeCandidates.map((candidate) => candidate.routeId).sort(compareText),
      routeHashes: routeCandidates.map((candidate) => candidate.routeHash).sort(compareText),
    };
    return { ...payload, componentAdmissionHash: canonicalHash(payload) };
  });
  const routeIdentityIndex = orderedComponents.flatMap((component) =>
    component.routeArtifact.routeCandidates!.map((candidate) => ({
      routeId: candidate.routeId,
      routeHash: candidate.routeHash,
      resourceComponentId: component.resourceComponentId,
      sourceArtifactHash: component.routeArtifactHash,
      sourceRouteUniverseHash: component.routeUniverseHash,
    }))).sort((left, right) => compareText(left.sourceRouteUniverseHash, right.sourceRouteUniverseHash)
      || compareText(left.routeId, right.routeId)
      || compareText(left.routeHash, right.routeHash)
      || compareText(left.resourceComponentId, right.resourceComponentId)
      || compareText(left.sourceArtifactHash, right.sourceArtifactHash));
  const admissionPayload = {
    admissionStatus: "ADMITTED" as const,
    canonicalSourceBindingManifest: sourceBindingManifest,
    sourceBindingManifestHash: sourceBindingManifest.manifestHash,
    admittedComponents,
    routeIdentityIndex,
    inputRouteCount: routeIdentityIndex.length,
  };
  return { ...admissionPayload, admissionHash: canonicalHash(admissionPayload) };
}

export function makeEmptyRouteUniverseFixture(): StrategicCohortCompressionInputV1 {
  const commonBindings = commonBindingsOf(makeComponentSources(2)[0].routeArtifact);
  const multiComponentArtifact = emptyMultiComponentArtifact(commonBindings);
  return inputOf([], multiComponentArtifact);
}

export function makeDamagedEmptyRouteUniverseFixture(): StrategicCohortCompressionInputV1 {
  const input = makeEmptyRouteUniverseFixture();
  return {
    ...input,
    sourceBindingManifest: {
      ...input.sourceBindingManifest,
      manifestHash: "damaged-empty-manifest-hash",
    },
  };
}

export function makeDamagedEmptyC2BudgetExecutionFixture(): StrategicCohortCompressionInputV1 {
  const input = makeEmptyRouteUniverseFixture();
  const original = input.sourceBindingManifest.multiComponentArtifact;
  const budgetExecution = {
    ...original.budgetExecution,
    executionHash: "forged-budget-execution-hash",
  };
  return inputOf([], rehashMultiComponentArtifact({ ...original, budgetExecution }));
}

export function makeNonReplayableC2PayloadFixture(): StrategicCohortCompressionInputV1 {
  const components = makeComponentSources(2);
  const original = bind(components);
  const observedEvidenceCost = original.evidenceCost + 1;
  const budgetObservation = {
    ...original.budgetObservation,
    observedEvidenceCost,
  };
  const budgetExecution = materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "COMPONENT_ENDPOINT_COUNT",
        limit: original.budget.maxComponentEndpointCount,
        observedCount: original.componentEndpointCount,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "EVIDENCE_COST",
        limit: original.budget.maxEvidenceCost,
        observedCount: observedEvidenceCost,
        measurementCompleteness: "EXACT",
      },
    ],
    exhaustedDimensions: [],
    sourceHashBindings: [
      ...original.sourceArtifactHashes.map((sourceHash) => ({
        sourceKind: "STRATEGIC_ROUTE_GENERATION_ARTIFACT" as const,
        sourceHash,
      })),
      ...original.sourceRouteUniverseHashes.map((sourceHash) => ({
        sourceKind: "STRATEGIC_ROUTE_UNIVERSE" as const,
        sourceHash,
      })),
    ],
  });
  const routeUniverseHash = canonicalHash({
    kind: "strategic-multi-component-and-route-universe-v1",
    identityHash: original.identityHash,
    snapshotHash: original.snapshotHash,
    sourceRootHash: original.sourceRootHash,
    provenanceRoot: original.provenanceRoot,
    budget: original.budget,
    budgetObservation,
    sourceRouteUniverseHashes: original.sourceRouteUniverseHashes,
    componentFactHashes: original.componentRouteFacts!.map((fact) => fact.componentFactHash),
    endpointHashes: original.andEndpointReferences!.map((endpoint) => endpoint.endpointHash),
  });
  const forged = rehashMultiComponentArtifact({
    ...original,
    evidenceCost: observedEvidenceCost,
    budgetObservation,
    budgetExecution,
    routeUniverseHash,
  });
  return inputOf(components, forged);
}

function makeComponentSources(count: 2 | 3): readonly PhaseDComponentSourceBindingV1[] {
  const sevenIds = ["S7-1", "C7-1", "D7-1", "H7-1"];
  const pairNineIds = ["S9-1", "C9-1"];
  const pairTenIds = ["S10-1", "C10-1"];
  const handIds = [...sevenIds, ...pairNineIds, ...(count === 3 ? pairTenIds : [])];
  const input = makeInventoryInput(handIds, "7");
  const inventory = buildStrategicStructureInventoryV1(input.a0, input.b0);
  const sevenBomb = exactFamily(inventory, "bomb", sevenIds);
  const sevenPairs = inventory.families?.filter((family) =>
    family.structuralSignature.groupType === "pair"
    && family.physicalCoverageCardIds.every((id) => sevenIds.includes(id))) ?? [];
  if (sevenPairs.length === 0) throw new Error("Missing level-seven component fixture");
  const selections: FamilySelectionV1[][] = [
    [{ familyId: sevenBomb.familyId }, ...sevenPairs.map((family) => ({ familyId: family.familyId }))],
    [{
      familyId: exactFamily(inventory, "pair", pairNineIds).familyId,
      exactMemberPhysicalCardIds: pairNineIds,
    }],
  ];
  if (count === 3) {
    selections.push([{
      familyId: exactFamily(inventory, "pair", pairTenIds).familyId,
      exactMemberPhysicalCardIds: pairTenIds,
    }]);
  }
  return selections.map((selection) => {
    const fixture = makeRouteFixtureFromInventory(inventory, selection);
    const routeArtifact = generateStrategicRouteCandidateFactsV1({ ...fixture, budget: C1_BUDGET });
    if (routeArtifact.generationStatus !== "COMPLETE" || routeArtifact.routeCandidates === null
      || routeArtifact.routeUniverseHash === null) {
      throw new Error("Phase D fixture needs complete C1 route facts");
    }
    return componentSourceOf(fixture.hierarchyBatch, fixture.reservationArtifact, routeArtifact);
  });
}

function componentSourceOf(
  hierarchyBatch: PhaseDComponentSourceBindingV1["hierarchyBatch"],
  reservationArtifact: PhaseDComponentSourceBindingV1["reservationArtifact"],
  routeArtifact: StrategicRouteGenerationArtifactV1,
): PhaseDComponentSourceBindingV1 {
  const resourceComponentId = reservationArtifact.reservationFacts[0]?.resourceComponentId;
  if (resourceComponentId === undefined || routeArtifact.routeUniverseHash === null) {
    throw new Error("Component source fixture must bind one complete component");
  }
  return {
    resourceComponentId,
    hierarchyBatch,
    hierarchyBatchHash: hierarchyBatch.batchHash,
    reservationArtifact,
    reservationArtifactHash: reservationArtifact.artifactHash,
    routeArtifact,
    routeArtifactHash: routeArtifact.artifactHash,
    routeUniverseHash: routeArtifact.routeUniverseHash,
  };
}

function bind(
  components: readonly PhaseDComponentSourceBindingV1[],
): StrategicMultiComponentAndBindingArtifactV1 {
  const artifact = bindStrategicMultiComponentAndEndpointsV1({
    sourceArtifacts: components.map((component) => component.routeArtifact),
    budget: C2_BUDGET,
  });
  if (artifact.bindingStatus !== "COMPLETE" || artifact.componentIds === null
    || artifact.andComponentSetHash === null || artifact.andEndpointReferences === null) {
    throw new Error("Phase D fixture needs complete C2 bindings");
  }
  return artifact;
}

function inputOf(
  componentSources: readonly PhaseDComponentSourceBindingV1[],
  multiComponentArtifact: StrategicMultiComponentAndBindingArtifactV1,
): StrategicCohortCompressionInputV1 {
  const manifest = manifestOf(componentSources, multiComponentArtifact);
  return { sourceBindingManifest: manifest, evidenceBudget: PHASE_D_BUDGET };
}

function rehashMultiComponentArtifact(
  artifact: StrategicMultiComponentAndBindingArtifactV1,
): StrategicMultiComponentAndBindingArtifactV1 {
  const { artifactHash: _artifactHash, ...payload } = artifact;
  return { ...payload, artifactHash: canonicalHash(payload) };
}

function withManifest(
  input: StrategicCohortCompressionInputV1,
  manifest: Omit<PhaseDSourceBindingManifestV1, "manifestHash"> & { readonly manifestHash?: string },
): StrategicCohortCompressionInputV1 {
  const { manifestHash: _manifestHash, ...payload } = manifest;
  const componentSources = canonicalComponentSources(payload.componentSources);
  const canonicalPayload = { ...payload, componentSources };
  return {
    ...input,
    sourceBindingManifest: {
      ...payload,
      componentSources: payload.componentSources,
      manifestHash: canonicalHash(canonicalPayload),
    },
  };
}

function manifestOf(
  componentSources: readonly PhaseDComponentSourceBindingV1[],
  multiComponentArtifact: StrategicMultiComponentAndBindingArtifactV1,
): PhaseDSourceBindingManifestV1 {
  const payload = {
    commonBindings: commonBindingsOf(multiComponentArtifact),
    componentSources: canonicalComponentSources(componentSources),
    multiComponentArtifact,
    multiComponentArtifactHash: multiComponentArtifact.artifactHash,
    andComponentSetHash: multiComponentArtifact.andComponentSetHash!,
  };
  return { ...payload, manifestHash: canonicalHash(payload) };
}

function canonicalComponentSources(
  sources: readonly PhaseDComponentSourceBindingV1[],
): readonly PhaseDComponentSourceBindingV1[] {
  return [...sources].sort((left, right) =>
    compareText(left.resourceComponentId, right.resourceComponentId)
      || compareText(left.routeArtifactHash, right.routeArtifactHash)
      || compareText(left.routeUniverseHash, right.routeUniverseHash));
}

function emptyMultiComponentArtifact(
  bindings: ReturnType<typeof commonBindingsOf>,
): StrategicMultiComponentAndBindingArtifactV1 {
  const budgetObservation = {
    observedComponentEndpointCount: 0,
    observedEvidenceCost: 0,
    measurementCompleteness: "EXACT" as const,
  };
  const budgetExecution = materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "COMPONENT_ENDPOINT_COUNT",
        limit: C2_BUDGET.maxComponentEndpointCount,
        observedCount: 0,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "EVIDENCE_COST",
        limit: C2_BUDGET.maxEvidenceCost,
        observedCount: 0,
        measurementCompleteness: "EXACT",
      },
    ],
    exhaustedDimensions: [],
    sourceHashBindings: [],
  });
  const componentIds: readonly string[] = [];
  const sourceArtifactHashes: readonly string[] = [];
  const sourceRouteUniverseHashes: readonly string[] = [];
  const componentRouteFacts: readonly [] = [];
  const andEndpointReferences: readonly [] = [];
  const andComponentSetHash = canonicalHash({
    kind: "strategic-and-component-set-v1",
    componentIds,
    sourceRouteUniverseHashes,
  });
  const routeUniverseHash = canonicalHash({
    kind: "strategic-multi-component-and-route-universe-v1",
    ...bindings,
    sourceRouteUniverseHashes,
    componentSemanticHashes: [],
    endpointSemanticHashes: [],
  });
  const payload = {
    schemaVersion: STRATEGIC_MULTI_COMPONENT_AND_BINDING_V1_SCHEMA_VERSION,
    ...bindings,
    budget: C2_BUDGET,
    bindingStatus: "COMPLETE" as const,
    componentRouteFacts,
    andEndpointReferences,
    componentEndpointCount: 0,
    evidenceCost: 0,
    budgetObservation,
    budgetExecution,
    exhaustedDimensions: [],
    reasonCodes: [],
    componentIds,
    andComponentSetHash,
    sourceArtifactHashes,
    sourceRouteUniverseHashes,
    routeUniverseHash,
    semanticBoundary: "MULTI_COMPONENT_AND_BINDING_FACTS_NOT_AI_DECISION" as const,
  };
  return { ...payload, artifactHash: canonicalHash(payload) };
}

function commonBindingsOf(value: Readonly<{
  identityHash: string;
  snapshotHash: string;
  sourceRootHash: string;
  provenanceRoot: string;
}>) {
  return {
    identityHash: value.identityHash,
    snapshotHash: value.snapshotHash,
    sourceRootHash: value.sourceRootHash,
    provenanceRoot: value.provenanceRoot,
  };
}

function exactFamily(
  inventory: StrategicStructureInventoryV1,
  groupType: string,
  physicalCardIds: readonly string[],
) {
  const expected = [...physicalCardIds].sort(compareText);
  const family = inventory.families?.find((candidate) =>
    candidate.structuralSignature.groupType === groupType
    && candidate.members.some((member) => sameStrings(member.physicalCardIds, expected)));
  if (family === undefined) throw new Error(`Missing ${groupType} Phase D fixture family`);
  return family;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const sortedRight = [...right].sort(compareText);
  return left.length === right.length
    && [...left].sort(compareText).every((value, index) => value === sortedRight[index]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
