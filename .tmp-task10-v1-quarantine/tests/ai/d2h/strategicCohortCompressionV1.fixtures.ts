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
  PhaseDComponentSourceBindingV1,
  PhaseDSourceBindingManifestV1,
  StrategicCohortCompressionInputV1,
} from "../../../src/ai/d2h/strategicCohortCompressionV1Contracts";
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
    budget: original.budget,
    budgetObservation: original.budgetObservation,
    sourceRouteUniverseHashes: original.sourceRouteUniverseHashes,
    componentFactHashes: original.componentRouteFacts!.map((fact) => fact.componentFactHash),
    endpointHashes: andEndpointReferences.map((endpoint) => endpoint.endpointHash),
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
    sourceHierarchyBatchHash: secondArtifact.sourceHierarchyBatchHash,
    sourceReservationArtifactHash: secondArtifact.sourceReservationArtifactHash,
    budget: secondArtifact.budget,
    budgetObservation: secondArtifact.budgetObservation,
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
  return inputOf(changedComponents, bind(changedComponents));
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
    budget: C2_BUDGET,
    budgetObservation,
    sourceRouteUniverseHashes,
    componentFactHashes: [],
    endpointHashes: [],
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
