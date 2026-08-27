import { describe, expect, expectTypeOf, it } from "vitest";
import {
  HARD_MAX_COHORT_COUNT_V1,
  type NormalizedRouteCohortMemberDraftV1,
  type PhaseDComponentSourceBindingV1,
  type PhaseDSourceAdmissionSuccessV1,
  type RouteCohortMemberEnvelopeV1,
  type StrategicCohortCompressionEvidenceBudgetV1,
  type StrategicCohortCompressionReasonCodeV1,
} from "../../../src/ai/d2h/strategicCohortCompressionV1Contracts";
import {
  compressHierarchicalStrategicCohortsV1,
  normalizeAdmittedStrategicRoutesV1,
} from
  "../../../src/ai/d2h/strategicCohortCompressionV1";
import {
  makeCommonBindingMismatchFixture,
  makeCorruptedSourceWithInvalidPhaseDEvidenceBudgetFixture,
  makeCrossPairedC2EndpointFixture,
  makeDamagedEmptyC2BudgetExecutionFixture,
  makeDamagedEmptyRouteUniverseFixture,
  makeDuplicateComponentSourceFixture,
  makeDuplicateRouteIdentityConflictFixture,
  makeEmptyRouteUniverseFixture,
  makeExtraComponentSourceFixture,
  makeInvalidPhaseDEvidenceBudgetFixture,
  makeManifestHashMismatchFixture,
  makeMissingC2ComponentSourceFixture,
  makeMultiComponentHashMismatchFixture,
  makeNonReplayableC2PayloadFixture,
  makeReversedComponentSourceInput,
  makeSameRankDifferentCopyPhaseDAdmissionInput,
  makeThreeComponentPhaseDAdmissionInput,
  makeValidPhaseDAdmissionInput,
  makeWildcardPhaseDAdmissionInput,
  makeWrongComponentABBindingFixture,
} from "./strategicCohortCompressionV1.fixtures";

const STANDALONE_INCONCLUSIVE_REASON_CODES = [
  "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN",
  "DETERMINISTIC_REPLAY_UNPROVEN",
  "INCOMPLETE_EQUIVALENCE_PROOF",
] as const satisfies readonly StrategicCohortCompressionReasonCodeV1[];

describe("Strategic cohort compression V1 contracts", () => {
  it("freezes the cohort hard gate outside caller budget", () => {
    expect(HARD_MAX_COHORT_COUNT_V1).toBe(49);

    const budget: StrategicCohortCompressionEvidenceBudgetV1 = {
      maxMemberEnvelopeCount: 100,
      maxResourceRoleSlotCount: 1000,
      maxConflictClosureEdgeCount: 1000,
      maxRouteMappingCount: 100,
      maxEquivalenceProofCount: 100,
      maxLineageOccurrenceWitnessCount: 5000,
    };

    expect("maxCohortCount" in budget).toBe(false);
    expectTypeOf<StrategicCohortCompressionEvidenceBudgetV1>()
      .not.toHaveProperty("maxCohortCount");
  });

  it("keeps normalization and final member hashes in separate lifecycle contracts", () => {
    expectTypeOf<NormalizedRouteCohortMemberDraftV1>()
      .toHaveProperty("normalizationHash");
    expectTypeOf<NormalizedRouteCohortMemberDraftV1>()
      .not.toHaveProperty("memberEnvelopeHash");
    expectTypeOf<NormalizedRouteCohortMemberDraftV1>()
      .not.toHaveProperty("routeRelevantConflictClosure");
    expectTypeOf<NormalizedRouteCohortMemberDraftV1>()
      .not.toHaveProperty("conflictInterface");
    expectTypeOf<NormalizedRouteCohortMemberDraftV1>()
      .not.toHaveProperty("endpointInterface");
    expectTypeOf<RouteCohortMemberEnvelopeV1>()
      .toHaveProperty("memberEnvelopeHash");
    expectTypeOf<RouteCohortMemberEnvelopeV1>()
      .toHaveProperty("routeRelevantConflictClosure");
    expectTypeOf<RouteCohortMemberEnvelopeV1>()
      .toHaveProperty("conflictInterface");
    expectTypeOf<RouteCohortMemberEnvelopeV1>()
      .toHaveProperty("endpointInterface");
  });

  it("freezes distinct inconclusive reason semantics", () => {
    expect(STANDALONE_INCONCLUSIVE_REASON_CODES).toEqual([
      "ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN",
      "DETERMINISTIC_REPLAY_UNPROVEN",
      "INCOMPLETE_EQUIVALENCE_PROOF",
    ]);
  });
});

describe("Strategic cohort compression V1 component source admission", () => {
  it("admits a canonical component-scoped manifest", () => {
    const result = compressHierarchicalStrategicCohortsV1(makeValidPhaseDAdmissionInput());

    expect(result.admissionStatus).toBe("ADMITTED");
    if (result.admissionStatus !== "ADMITTED") throw new Error("Expected admitted source bindings");
    expect(result.inputRouteCount).toBeGreaterThan(0);
    expect(result.admittedComponents).toHaveLength(2);
    expect(result.routeIdentityIndex).toHaveLength(result.inputRouteCount);
  });

  it("fails closed when C2 needs a component omitted by the manifest", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeMissingC2ComponentSourceFixture()),
    );
    expect(artifact.compressionStatus).toBe("INCONCLUSIVE");
    expect(artifact.reasonCodes).toContain("MISSING_COMPONENT_SOURCE");
  });

  it("fails closed when the manifest adds a component absent from C2", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeExtraComponentSourceFixture()),
    );
    expect(artifact.compressionStatus).toBe("INCONCLUSIVE");
    expect(artifact.reasonCodes).toContain("EXTRA_COMPONENT_SOURCE");
  });

  it("rejects a duplicate resource component", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeDuplicateComponentSourceFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("DUPLICATE_RESOURCE_COMPONENT");
  });

  it("rejects a component whose C1 is bound to the wrong A or B source", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeWrongComponentABBindingFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
  });

  it("rejects a common binding contradiction", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeCommonBindingMismatchFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
  });

  it("rejects a supplied manifest or multi-component hash mismatch", () => {
    for (const input of [makeManifestHashMismatchFixture(), makeMultiComponentHashMismatchFixture()]) {
      const artifact = terminalArtifactOf(compressHierarchicalStrategicCohortsV1(input));
      expect(artifact.compressionStatus).toBe("REJECTED");
      expect(artifact.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    }
  });

  it("keeps explicit source corruption ahead of an invalid Phase-D evidence budget", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(
        makeCorruptedSourceWithInvalidPhaseDEvidenceBudgetFixture(),
      ),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(artifact.reasonCodes).not.toContain("INVALID_BUDGET");
  });

  it("checks an invalid Phase-D evidence budget after complete source admission", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeInvalidPhaseDEvidenceBudgetFixture()),
    );
    expect(artifact).toMatchObject({
      compressionStatus: "INCONCLUSIVE",
      reasonCodes: ["INVALID_BUDGET"],
      cohortCount: 0,
      cohorts: null,
      cohortInterfaces: null,
      routeToCohortMappings: null,
      memberEnvelopes: null,
      equivalenceProofs: null,
      coverageManifest: null,
      cohortUniverseHash: null,
    });
  });

  it("rejects cross-paired component bindings even when independent C2 sets match", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeCrossPairedC2EndpointFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
  });

  it("rejects one route id bound to different route hashes", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeDuplicateRouteIdentityConflictFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("ROUTE_ID_HASH_CONFLICT");
  });

  it("canonicalizes component input order without changing admission bindings", () => {
    const canonicalInput = makeValidPhaseDAdmissionInput();
    const canonical = compressHierarchicalStrategicCohortsV1(canonicalInput);
    const reversed = compressHierarchicalStrategicCohortsV1(
      makeReversedComponentSourceInput(canonicalInput),
    );

    expect(canonical.admissionStatus).toBe("ADMITTED");
    expect(reversed).toEqual(canonical);
  });

  it("orders the route identity index by source universe then route identity", () => {
    const result = compressHierarchicalStrategicCohortsV1(makeValidPhaseDAdmissionInput());

    expect(result.admissionStatus).toBe("ADMITTED");
    if (result.admissionStatus !== "ADMITTED") throw new Error("Expected admitted source bindings");
    const identityTuples = result.routeIdentityIndex.map((entry) => [
      entry.sourceRouteUniverseHash,
      entry.routeId,
      entry.routeHash,
    ] as const);
    expect(identityTuples).toEqual([...identityTuples].sort(compareIdentityTuple));
  });

  it("returns an atomic empty source universe artifact after complete admission", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeEmptyRouteUniverseFixture()),
    );
    expect(artifact).toMatchObject({
      compressionStatus: "INCONCLUSIVE",
      reasonCodes: ["EMPTY_SOURCE_ROUTE_UNIVERSE"],
      cohortCount: 0,
      cohorts: null,
      cohortInterfaces: null,
      routeToCohortMappings: null,
      memberEnvelopes: null,
      equivalenceProofs: null,
      coverageManifest: null,
      cohortUniverseHash: null,
      compressionRatioObservation: {
        inputRouteCount: 0,
        ratioDenominator: null,
        ratioInterpretation: "UNAVAILABLE",
      },
    });
  });

  it("rejects damaged binding evidence before the empty universe path", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeDamagedEmptyRouteUniverseFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(artifact.reasonCodes).not.toContain("EMPTY_SOURCE_ROUTE_UNIVERSE");
  });

  it("rejects damaged C2 budget execution before the empty universe path", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeDamagedEmptyC2BudgetExecutionFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(artifact.reasonCodes).not.toContain("EMPTY_SOURCE_ROUTE_UNIVERSE");
  });

  it("rejects a self-bound C2 payload that cannot replay from its component sources", () => {
    const artifact = terminalArtifactOf(
      compressHierarchicalStrategicCohortsV1(makeNonReplayableC2PayloadFixture()),
    );
    expect(artifact.compressionStatus).toBe("REJECTED");
    expect(artifact.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
  });
});

describe("Strategic cohort compression V1 route normalization drafts", () => {
  it("keeps different strength interfaces distinct at equal group control and length", () => {
    const result = normalizedOf(admittedOf(makeThreeComponentPhaseDAdmissionInput()));
    const pairNine = draftWithPhysicalCards(result.normalizedMemberDrafts, ["S9-1", "C9-1"]);
    const pairTen = draftWithPhysicalCards(result.normalizedMemberDrafts, ["S10-1", "C10-1"]);
    const nineClaim = pairNine.structuralInterface.claimInterfaces[0];
    const tenClaim = pairTen.structuralInterface.claimInterfaces[0];

    expect([nineClaim.canonicalGroupType, nineClaim.controlRank, nineClaim.canonicalGroupLength])
      .toEqual([tenClaim.canonicalGroupType, tenClaim.controlRank, tenClaim.canonicalGroupLength]);
    expect(nineClaim.strengthClass).not.toBe(tenClaim.strengthClass);
    expect(pairNine.structuralInterface.structuralSignatureHash)
      .not.toBe(pairTen.structuralInterface.structuralSignatureHash);
  });

  it("fails closed when the admitted strength interface is missing", () => {
    const broken = mapOnlyComponent(pairNineSingleRouteAdmission(), (component) => ({
      ...component,
      hierarchyBatch: {
        ...component.hierarchyBatch,
        families: component.hierarchyBatch.families.map((family) => ({
          ...family,
          strengthClass: "",
        })),
      },
    }));
    const result = normalizeAdmittedStrategicRoutesV1(broken);

    expect(result.normalizationStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toEqual(["MISSING_STRENGTH_INTERFACE"]);
    expect(result.normalizedMemberDrafts).toBeNull();
  });

  it("keeps different level relation facts in different structural signatures", () => {
    const result = normalizedOf(admittedOf(makeValidPhaseDAdmissionInput()));
    const levelDefense = result.normalizedMemberDrafts.find((draft) =>
      draft.structuralInterface.claimInterfaces.some((claim) =>
        claim.levelRankRelation === "LEVEL_RANK_BASED"));
    const nonLevel = draftWithPhysicalCards(result.normalizedMemberDrafts, ["S9-1", "C9-1"]);
    if (levelDefense === undefined) throw new Error("Missing level-defense normalization fixture");

    expect(nonLevel.structuralInterface.claimInterfaces
      .every((claim) => claim.levelRankRelation !== "LEVEL_RANK_BASED")).toBe(true);
    expect(levelDefense.structuralInterface.structuralSignatureHash)
      .not.toBe(nonLevel.structuralInterface.structuralSignatureHash);
  });

  it("separates route-active roles from latent resource roles", () => {
    const admission = levelDefenseSingleRouteAdmission();
    const reducedLatentAdmission = mapOnlyComponent(admission, (component) => {
      const activeClaimIds = new Set(component.routeArtifact.routeCandidates![0]
        .resourceClaims.map((claim) => claim.claimId));
      return {
        ...component,
        reservationArtifact: {
          ...component.reservationArtifact,
          reservationFacts: component.reservationArtifact.reservationFacts.map((fact) => ({
            ...fact,
            claims: fact.claims.filter((claim) => activeClaimIds.has(claim.claimId)),
          })),
        },
      };
    });
    const canonicalDraft = normalizedOf(normalizeAdmittedStrategicRoutesV1(admission))
      .normalizedMemberDrafts[0];
    const reducedDraft = normalizedOf(normalizeAdmittedStrategicRoutesV1(reducedLatentAdmission))
      .normalizedMemberDrafts[0];

    expect(canonicalDraft.canonicalResourceRoleVector
      .map((slot) => JSON.stringify(slot.routeActiveInterface)).sort())
      .toEqual(reducedDraft.canonicalResourceRoleVector
        .map((slot) => JSON.stringify(slot.routeActiveInterface)).sort());
    expect(canonicalDraft.canonicalResourceRoleVector
      .map((slot) => JSON.stringify(slot.latentResourceInterface)).sort())
      .not.toEqual(reducedDraft.canonicalResourceRoleVector
        .map((slot) => JSON.stringify(slot.latentResourceInterface)).sort());
    expect(canonicalDraft.resourceInterface.resourceSignatureHash)
      .not.toBe(reducedDraft.resourceInterface.resourceSignatureHash);
  });

  it("keeps claim activity card-local when deriving latent role interfaces", () => {
    const draft = normalizedOf(normalizeAdmittedStrategicRoutesV1(
      levelDefenseSingleRouteAdmission(),
    )).normalizedMemberDrafts[0];
    const physicalOccurrence = draft.task3MemberLocalLineage.find((entry) =>
      entry.kind === "PHYSICAL" && entry.occurrence.physicalCardId === "C7-1");
    if (physicalOccurrence?.kind !== "PHYSICAL") throw new Error("Missing C7 role occurrence");
    const slot = draft.canonicalResourceRoleVector.find((candidate) =>
      candidate.canonicalRolePosition === physicalOccurrence.occurrence.canonicalRolePosition);
    if (slot === undefined) throw new Error("Missing C7 canonical role slot");

    expect(slot.routeActiveInterface.activeClaimRoles).toEqual([
      "ATOMIC_FALLBACK",
      "LEVEL_RANK_DEFENSE",
      "WILDCARD_ALLOCATION",
    ]);
    expect(slot.latentResourceInterface.latentClaimRoles).toEqual([
      "ATOMIC_FALLBACK",
      "CONTROL_FORMATION",
      "LEVEL_RANK_DEFENSE",
      "WILDCARD_ALLOCATION",
    ]);
  });

  it("canonicalizes latent and resource role input order", () => {
    const canonicalAdmission = levelDefenseSingleRouteAdmission();
    const reversedAdmission = reverseNormalizationEvidence(canonicalAdmission);
    const canonicalDraft = normalizedOf(normalizeAdmittedStrategicRoutesV1(canonicalAdmission))
      .normalizedMemberDrafts[0];
    const reversedDraft = normalizedOf(normalizeAdmittedStrategicRoutesV1(reversedAdmission))
      .normalizedMemberDrafts[0];

    expect(reversedDraft.structuralInterface).toEqual(canonicalDraft.structuralInterface);
    expect(reversedDraft.resourceInterface).toEqual(canonicalDraft.resourceInterface);
    expect(reversedDraft.canonicalResourceRoleVector).toEqual(canonicalDraft.canonicalResourceRoleVector);
    expect(reversedDraft.normalizationHash).toBe(canonicalDraft.normalizationHash);
  });

  it("keeps exact cards member-local when same-rank copies share a role interface", () => {
    const result = normalizedOf(admittedOf(makeSameRankDifferentCopyPhaseDAdmissionInput()));
    expect(result.normalizedMemberDrafts).toHaveLength(2);
    const [first, second] = result.normalizedMemberDrafts;

    expect(first.resourceInterface).toEqual(second.resourceInterface);
    expect(first.canonicalResourceRoleVector).toEqual(second.canonicalResourceRoleVector);
    expect(JSON.stringify(first.resourceInterface)).not.toContain("physicalCardId");
    expect(first.task3MemberLocalLineage).not.toEqual(second.task3MemberLocalLineage);
  });

  it("fails closed when one physical card has two dispositions", () => {
    const admission = pairNineSingleRouteAdmission();
    const duplicated = mapOnlyComponent(admission, (component) => {
      const route = component.routeArtifact.routeCandidates![0];
      const physicalCardId = route.consumedResources[0];
      return {
        ...component,
        routeArtifact: {
          ...component.routeArtifact,
          routeCandidates: [{
            ...route,
            preservedResources: [...route.preservedResources, physicalCardId],
          }],
        },
      };
    });
    const result = normalizeAdmittedStrategicRoutesV1(duplicated);

    expect(result.normalizationStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toEqual(["INCOMPLETE_RESOURCE_ROLE_ACCOUNTING"]);
    expect(result.normalizedMemberDrafts).toBeNull();
  });

  it("keeps a wildcard as one physical role slot", () => {
    const admission = wildcardSingleRouteAdmission();
    const draft = normalizedOf(normalizeAdmittedStrategicRoutesV1(admission))
      .normalizedMemberDrafts[0];
    expect(draft.canonicalResourceRoleVector
      .filter((slot) => slot.naturalOrWildcard === "WILDCARD")).toHaveLength(1);
    expect(draft.resourceInterface.wildcardCardinality).toBe(1);
  });

  it("fails closed when a wildcard allocation hash has no payload", () => {
    const admission = wildcardSingleRouteAdmission();
    const missingPayload = mapOnlyComponent(admission, (component) => ({
      ...component,
      hierarchyBatch: {
        ...component.hierarchyBatch,
        families: component.hierarchyBatch.families.map((family) => ({
          ...family,
          memberLineage: family.memberLineage.map((member) => ({
            ...member,
            wildcardAllocationVariants: [],
          })),
        })),
      },
    }));
    const result = normalizeAdmittedStrategicRoutesV1(missingPayload);

    expect(result.normalizationStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toEqual(["MISSING_WILDCARD_ALLOCATION_PAYLOAD"]);
    expect(result.normalizedMemberDrafts).toBeNull();
  });

  it("fails closed when active and latent role separation is unprovable", () => {
    const broken = mapOnlyComponent(pairNineSingleRouteAdmission(), (component) => ({
      ...component,
      reservationArtifact: {
        ...component.reservationArtifact,
        reservationFacts: component.reservationArtifact.reservationFacts.map((fact) => ({
          ...fact,
          claims: [],
        })),
      },
    }));
    const result = normalizeAdmittedStrategicRoutesV1(broken);

    expect(result.normalizationStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toEqual(["ACTIVE_LATENT_ROLE_SEPARATION_UNPROVEN"]);
    expect(result.normalizedMemberDrafts).toBeNull();
  });

  it("materializes only the staged normalization lifecycle fields", () => {
    const draft = normalizedOf(admittedOf(makeValidPhaseDAdmissionInput()))
      .normalizedMemberDrafts[0];
    expect(draft.normalizationHash).toHaveLength(64);
    expect("memberEnvelopeHash" in draft).toBe(false);
    expect("routeRelevantConflictClosure" in draft).toBe(false);
    expect("conflictInterface" in draft).toBe(false);
    expect("endpointInterface" in draft).toBe(false);
  });
});

function compareIdentityTuple(
  left: readonly [string, string, string],
  right: readonly [string, string, string],
): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

function terminalArtifactOf(
  result: ReturnType<typeof compressHierarchicalStrategicCohortsV1>,
) {
  expect(result.admissionStatus).toBe("TERMINAL");
  if (result.admissionStatus !== "TERMINAL") throw new Error("Expected terminal admission artifact");
  return result.artifact;
}

function admittedOf(
  input: Parameters<typeof compressHierarchicalStrategicCohortsV1>[0],
): PhaseDSourceAdmissionSuccessV1 {
  const result = compressHierarchicalStrategicCohortsV1(input);
  expect(result.admissionStatus).toBe("ADMITTED");
  if (result.admissionStatus !== "ADMITTED") throw new Error("Expected admitted source bindings");
  return result;
}

function normalizedOf(
  value: PhaseDSourceAdmissionSuccessV1 | ReturnType<typeof normalizeAdmittedStrategicRoutesV1>,
) {
  const result = "admissionStatus" in value
    ? normalizeAdmittedStrategicRoutesV1(value)
    : value;
  expect(result.normalizationStatus).toBe("COMPLETE");
  if (result.normalizationStatus !== "COMPLETE") throw new Error("Expected normalized drafts");
  return result;
}

function draftWithPhysicalCards(
  drafts: readonly NormalizedRouteCohortMemberDraftV1[],
  physicalCardIds: readonly string[],
): NormalizedRouteCohortMemberDraftV1 {
  const expected = [...physicalCardIds].sort();
  const draft = drafts.find((candidate) => {
    const actual = candidate.task3MemberLocalLineage.flatMap((entry) =>
      entry.kind === "PHYSICAL" ? [entry.occurrence.physicalCardId] : []).sort();
    return expected.length === actual.length
      && expected.every((physicalCardId, index) => physicalCardId === actual[index]);
  });
  if (draft === undefined) throw new Error(`Missing normalization draft for ${expected.join(",")}`);
  return draft;
}

function levelDefenseSingleRouteAdmission(): PhaseDSourceAdmissionSuccessV1 {
  return singleRouteAdmission(
    admittedOf(makeValidPhaseDAdmissionInput()),
    (route) => route.resourceClaims.some((claim) =>
      claim.claimRoles.includes("LEVEL_RANK_DEFENSE")),
  );
}

function pairNineSingleRouteAdmission(): PhaseDSourceAdmissionSuccessV1 {
  return singleRouteAdmission(
    admittedOf(makeValidPhaseDAdmissionInput()),
    (route) => route.endpointFacts.accountedPhysicalCardIds.includes("S9-1"),
  );
}

function wildcardSingleRouteAdmission(): PhaseDSourceAdmissionSuccessV1 {
  return singleRouteAdmission(
    admittedOf(makeWildcardPhaseDAdmissionInput()),
    (route) => route.resourceClaims.some((claim) => claim.wildcardCardIds.length > 0),
  );
}

function singleRouteAdmission(
  admission: PhaseDSourceAdmissionSuccessV1,
  predicate: (route: NonNullable<PhaseDComponentSourceBindingV1["routeArtifact"]["routeCandidates"]>[number])
    => boolean,
): PhaseDSourceAdmissionSuccessV1 {
  for (const component of admission.canonicalSourceBindingManifest.componentSources) {
    const route = component.routeArtifact.routeCandidates?.find(predicate);
    if (route === undefined) continue;
    return {
      ...admission,
      canonicalSourceBindingManifest: {
        ...admission.canonicalSourceBindingManifest,
        componentSources: [{
          ...component,
          routeArtifact: {
            ...component.routeArtifact,
            routeCandidates: [route],
            routeCount: 1,
          },
        }],
      },
    };
  }
  throw new Error("Missing single-route normalization fixture");
}

function mapOnlyComponent(
  admission: PhaseDSourceAdmissionSuccessV1,
  transform: (component: PhaseDComponentSourceBindingV1) => PhaseDComponentSourceBindingV1,
): PhaseDSourceAdmissionSuccessV1 {
  const [component] = admission.canonicalSourceBindingManifest.componentSources;
  if (component === undefined) throw new Error("Missing normalization component");
  return {
    ...admission,
    canonicalSourceBindingManifest: {
      ...admission.canonicalSourceBindingManifest,
      componentSources: [transform(component)],
    },
  };
}

function reverseNormalizationEvidence(
  admission: PhaseDSourceAdmissionSuccessV1,
): PhaseDSourceAdmissionSuccessV1 {
  return mapOnlyComponent(admission, (component) => ({
    ...component,
    hierarchyBatch: {
      ...component.hierarchyBatch,
      families: [...component.hierarchyBatch.families].reverse().map((family) => ({
        ...family,
        memberLineage: [...family.memberLineage].reverse(),
      })),
    },
    reservationArtifact: {
      ...component.reservationArtifact,
      resourceUnits: [...component.reservationArtifact.resourceUnits].reverse(),
      reservationFacts: [...component.reservationArtifact.reservationFacts].reverse().map((fact) => ({
        ...fact,
        claims: [...fact.claims].reverse(),
        resourceUnitIds: [...fact.resourceUnitIds].reverse(),
      })),
      reservationAlternatives: [...component.reservationArtifact.reservationAlternatives].reverse(),
    },
    routeArtifact: {
      ...component.routeArtifact,
      routeCandidates: component.routeArtifact.routeCandidates?.map((route) => ({
        ...route,
        resourceClaims: [...route.resourceClaims].reverse().map((claim) => ({
          ...claim,
          physicalCardIds: [...claim.physicalCardIds].reverse(),
          resourceUnitIds: [...claim.resourceUnitIds].reverse(),
        })),
        preservedResources: [...route.preservedResources].reverse(),
        consumedResources: [...route.consumedResources].reverse(),
        endpointFacts: {
          ...route.endpointFacts,
          accountedPhysicalCardIds: [...route.endpointFacts.accountedPhysicalCardIds].reverse(),
          remainderPhysicalCardIds: [...route.endpointFacts.remainderPhysicalCardIds].reverse(),
        },
      })) ?? null,
    },
  }));
}
