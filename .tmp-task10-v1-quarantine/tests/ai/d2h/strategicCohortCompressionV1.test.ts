import { describe, expect, expectTypeOf, it } from "vitest";
import { canonicalHash } from "../../../src/ai/d2h/strategicEvidenceCanonicalSerializer";
import {
  HARD_MAX_COHORT_COUNT_V1,
  type NormalizedRouteCohortMemberDraftV1,
  type PhaseDComponentSourceBindingV1,
  type PhaseDTask4ArtifactV1,
  type PhaseDSourceAdmissionSuccessV1,
  type RouteCohortMemberEnvelopeV1,
  type StrategicCohortCompressionEvidenceBudgetV1,
  type StrategicCohortCompressionReasonCodeV1,
} from "../../../src/ai/d2h/strategicCohortCompressionV1Contracts";
import {
  compressHierarchicalStrategicCohortsV1,
  applyHardCohortGateV1,
  __task5PostDerivationHardGateV1,
  __validateTask5PublicationForTest,
  __task5EndpointIndexForTest,
  materializePhaseDTask5V1,
  materializePhaseDTask4V1,
  normalizeAdmittedStrategicRoutesV1,
} from
  "../../../src/ai/d2h/strategicCohortCompressionV1";
import {
  makeCommonBindingMismatchFixture,
  makeBrokenClosureReferenceFixture,
  makeCorruptedSourceWithInvalidPhaseDEvidenceBudgetFixture,
  makeCrossConflictWitnessBindingFixture,
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
  makePhysicallyAdjacentUnreachableConflictFixture,
  makeReversedComponentSourceInput,
  makeSameRankDifferentCopyPhaseDAdmissionInput,
  makeThreeComponentPhaseDAdmissionInput,
  makeValidPhaseDAdmissionInput,
  makeWildcardPhaseDAdmissionInput,
  makeWildcardPhaseDAdmissionInputWithWildcard,
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

  it("marks a remainder card without a route claim as NO_ACTIVE_CLAIM", () => {
    const { admission, physicalCardId } = remainderCardFromComponent(
      pairNineSingleRouteAdmission(),
      0,
    );
    const draft = normalizedOf(normalizeAdmittedStrategicRoutesV1(admission))
      .normalizedMemberDrafts[0];
    const slot = slotForPhysicalCard(draft, physicalCardId);

    expect(slot.routeActiveInterface.kind).toBe("NO_ACTIVE_CLAIM");
  });

  it("does not invent tier or reservation semantics for NO_ACTIVE_CLAIM", () => {
    const { admission, physicalCardId } = remainderCardFromComponent(
      pairNineSingleRouteAdmission(),
      0,
    );
    const draft = normalizedOf(normalizeAdmittedStrategicRoutesV1(admission))
      .normalizedMemberDrafts[0];
    const activeInterface = slotForPhysicalCard(draft, physicalCardId).routeActiveInterface;

    expect(activeInterface.kind).toBe("NO_ACTIVE_CLAIM");
    expect(activeInterface.activeClaimRoles).toEqual([]);
    expect(activeInterface.activeAllocationInterface).toBeNull();
    expect("activeHierarchyTier" in activeInterface).toBe(false);
    expect("activeReservationClass" in activeInterface).toBe(false);
  });

  it("keeps unclaimed remainder role interfaces shared while lineage stays exact", () => {
    const source = admittedOf(makeSameRankDifferentCopyPhaseDAdmissionInput());
    const first = remainderCardFromComponent(source, 0);
    const second = remainderCardFromComponent(source, 1);
    const firstDraft = normalizedOf(normalizeAdmittedStrategicRoutesV1(first.admission))
      .normalizedMemberDrafts[0];
    const secondDraft = normalizedOf(normalizeAdmittedStrategicRoutesV1(second.admission))
      .normalizedMemberDrafts[0];

    expect(firstDraft.resourceInterface).toEqual(secondDraft.resourceInterface);
    expect(firstDraft.task3MemberLocalLineage).not.toEqual(secondDraft.task3MemberLocalLineage);
    expect(JSON.stringify(firstDraft.resourceInterface)).not.toContain(first.physicalCardId);
    expect(JSON.stringify(secondDraft.resourceInterface)).not.toContain(second.physicalCardId);
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

  it("fails closed when one accounted physical card has no disposition", () => {
    const admission = pairNineSingleRouteAdmission();
    const missing = mapOnlyComponent(admission, (component) => {
      const route = component.routeArtifact.routeCandidates![0];
      const physicalCardId = route.consumedResources[0];
      if (physicalCardId === undefined) throw new Error("Missing disposition fixture card");
      return {
        ...component,
        routeArtifact: {
          ...component.routeArtifact,
          routeCandidates: [{
            ...route,
            consumedResources: route.consumedResources
              .filter((candidate) => candidate !== physicalCardId),
          }],
        },
      };
    });
    const result = normalizeAdmittedStrategicRoutesV1(missing);

    expect(result.normalizationStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toEqual(["INCOMPLETE_RESOURCE_ROLE_ACCOUNTING"]);
    expect(result.normalizedMemberDrafts).toBeNull();
  });

  it("fails closed when a disposition names a card outside the route universe", () => {
    const admission = pairNineSingleRouteAdmission();
    const outOfUniverse = mapOnlyComponent(admission, (component) => {
      const route = component.routeArtifact.routeCandidates![0];
      return {
        ...component,
        routeArtifact: {
          ...component.routeArtifact,
          routeCandidates: [{
            ...route,
            consumedResources: [...route.consumedResources, "NOT-IN-UNIVERSE"],
          }],
        },
      };
    });
    const result = normalizeAdmittedStrategicRoutesV1(outOfUniverse);

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

describe("Strategic cohort compression V1 Task 4 closure and occurrence universe", () => {
  it("rejects a witness that binds one conflict to another conflict's selected alternative", () => {
    const { admission, normalizedMemberDrafts } = makeCrossConflictWitnessBindingFixture();
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
    expect(result.routeRelevantConflictClosures).toBeNull();
    expect(result.occurrenceUniverse).toBeNull();
  });

  it("includes explicitly reachable conflict closure references", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("COMPLETE");
    expect(result.routeRelevantConflictClosures).not.toBeNull();
    const closure = result.routeRelevantConflictClosures?.find((candidate) =>
      candidate.conflictFactIds.length > 0);
    expect(closure).toBeDefined();
    expect(closure?.closureCompleteness).toBe("COMPLETE");
    expect(closure?.conflictFactIds.length).toBeGreaterThan(0);
    expect(closure?.traversedReferenceEdges.length).toBeGreaterThan(0);
    const sourceRoute = admission.canonicalSourceBindingManifest.componentSources
      .flatMap((component) => component.routeArtifact.routeCandidates ?? [])
      .find((route) => route.routeId === closure?.routeId);
    expect(sourceRoute).toBeDefined();
    expect(closure?.conflictFactIds).toEqual(
      expect.arrayContaining([...(sourceRoute?.unresolvedConflicts ?? [])]),
    );
    expect(closure?.branchLocalResolutionWitnesses.map((witness) => witness.conflictFactId))
      .toEqual(expect.arrayContaining([...(sourceRoute?.unresolvedConflicts ?? [])]));
  });

  it("excludes a physically adjacent conflict without an explicit reference path", () => {
    const {
      admission,
      normalizedMemberDrafts,
      relevantConflictFactId,
      adjacentConflictFactId,
    } = makePhysicallyAdjacentUnreachableConflictFixture();
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("COMPLETE");
    const closure = result.routeRelevantConflictClosures?.find((candidate) =>
      candidate.conflictFactIds.includes(relevantConflictFactId));
    expect(closure).toBeDefined();
    const component = admission.canonicalSourceBindingManifest.componentSources.find((candidate) =>
      candidate.routeArtifactHash === closure?.sourceArtifactHash);
    const relevantConflict = component?.reservationArtifact.conflictFacts.find((candidate) =>
      candidate.conflictFactId === relevantConflictFactId);
    const adjacentUnreferenced = component?.reservationArtifact.conflictFacts.find((candidate) =>
      candidate.conflictFactId === adjacentConflictFactId);
    expect(relevantConflict).toBeDefined();
    expect(adjacentUnreferenced).toBeDefined();
    expect(adjacentUnreferenced?.physicalCardIds.some((cardId) =>
      relevantConflict?.physicalCardIds.includes(cardId))).toBe(true);
    expect(closure?.conflictFactIds).toContain(relevantConflictFactId);
    expect(closure?.conflictFactIds).not.toContain(adjacentConflictFactId);
  });

  it("publishes route-scoped physical, wildcard, family/member, reservation, conflict, and endpoint keys", () => {
    const admission = admittedOf(makeWildcardPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("COMPLETE");
    const universe = result.occurrenceUniverse;
    expect(universe).not.toBeNull();
    expect(universe?.sourceRouteIds.length).toBeGreaterThan(0);
    expect(universe?.physicalOccurrenceKeys.length).toBeGreaterThan(0);
    expect(universe?.wildcardOccurrenceKeys.length).toBeGreaterThan(0);
    expect(universe?.familyMemberOccurrenceKeys.length).toBeGreaterThan(0);
    expect(universe?.reservationOccurrenceKeys.length).toBeGreaterThan(0);
    expect(universe?.conflictOccurrenceKeys.length).toBeGreaterThan(0);
    expect(universe?.endpointOccurrenceKeys.length).toBeGreaterThan(0);
    const relevantReservations = new Set(
      result.routeRelevantConflictClosures?.flatMap((closure) => closure.reservationFactIds) ?? [],
    );
    const allReservations = admission.canonicalSourceBindingManifest.componentSources
      .flatMap((component) => component.reservationArtifact.reservationFacts)
      .map((fact) => fact.reservationFactId);
    const occurrenceReservations = new Set(universe?.reservationOccurrenceKeys.map((key) => key[1]));
    expect(occurrenceReservations).toEqual(relevantReservations);
    expect([...relevantReservations].every((reservationFactId) => allReservations.includes(reservationFactId)))
      .toBe(true);
  });

  it("keeps the same physical card distinct across routes", () => {
    const admission = admittedOf(makeWildcardPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("COMPLETE");
    const physicalOccurrences = result.occurrenceUniverse?.physicalOccurrenceKeys ?? [];
    const repeated = [...new Map(physicalOccurrences.map((key) => [
      key[1], physicalOccurrences.filter((candidate) => candidate[1] === key[1]),
    ])).values()].find((keys) => keys.length > 1);
    expect(repeated).toBeDefined();
    expect(new Set(repeated?.map((key) => key[0])).size).toBe(repeated?.length);
  });

  it("keeps wildcard allocation variants distinct and preserves AND endpoints without products", () => {
    const admission = admittedOf(makeWildcardPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("COMPLETE");
    const variants = result.occurrenceUniverse?.wildcardOccurrenceKeys
      .filter((key) => key[1] === "H2-1");
    expect(new Set(variants?.map((key) => key.join("|"))).size).toBe(variants?.length);
    expect(new Set(variants?.map((key) => key[2])).size).toBeGreaterThan(1);
    const expectedEndpointKeys = admission.canonicalSourceBindingManifest.multiComponentArtifact
      .andEndpointReferences?.flatMap((endpoint) => endpoint.routeReferences.map((reference) => [
        reference.routeId,
        endpoint.componentEndpointId,
      ] as const)).sort((left, right) => compareTextTuple(left, right)) ?? [];
    expect(result.occurrenceUniverse?.endpointOccurrenceKeys).toEqual(expectedEndpointKeys);
  });

  it("keeps repeated family/member lineage route-scoped", () => {
    const admission = admittedOf(makeWildcardPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("COMPLETE");
    const keys = result.occurrenceUniverse?.familyMemberOccurrenceKeys ?? [];
    const repeated = [...new Map(keys.map((key) => [
      `${key[1]}|${key[2]}`,
      keys.filter((candidate) => candidate[1] === key[1] && candidate[2] === key[2]),
    ])).values()].find((entries) => entries.length > 1);
    expect(repeated).toBeDefined();
    expect(new Set(repeated?.map((key) => key[0])).size).toBe(repeated?.length);
  });

  it("is deterministic under component source order reversal", () => {
    const canonicalInput = makeValidPhaseDAdmissionInput();
    const canonicalAdmission = admittedOf(canonicalInput);
    const reversedAdmission = admittedOf(makeReversedComponentSourceInput(canonicalInput));
    const canonical = materializePhaseDTask4V1({
      admission: canonicalAdmission,
      normalizedMemberDrafts: normalizedOf(canonicalAdmission).normalizedMemberDrafts,
    });
    const reversed = materializePhaseDTask4V1({
      admission: reversedAdmission,
      normalizedMemberDrafts: normalizedOf(reversedAdmission).normalizedMemberDrafts,
    });

    expect(reversed).toEqual(canonical);
  });

  it("fails closed without partial Task 4 payload for a broken closure reference", () => {
    const admission = makeBrokenClosureReferenceFixture();
    const normalized = normalizedOf(admission);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("INCONCLUSIVE");
    expect(result.routeRelevantConflictClosures).toBeNull();
    expect(result.occurrenceUniverse).toBeNull();
    expect(result.reasonCodes).toContain("INCOMPLETE_CONFLICT_CLOSURE");
  });

  it("rejects a contradictory reservation fact hash before closure publication", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const component = admission.canonicalSourceBindingManifest.componentSources[0];
    const fact = component?.reservationArtifact.reservationFacts[0];
    if (component === undefined || fact === undefined) throw new Error("Missing reservation fact fixture");
    const tamperedAdmission: PhaseDSourceAdmissionSuccessV1 = {
      ...admission,
      canonicalSourceBindingManifest: {
        ...admission.canonicalSourceBindingManifest,
        componentSources: [{
          ...component,
          reservationArtifact: {
            ...component.reservationArtifact,
            reservationFacts: [{ ...fact, reservationHash: "forged-reservation-hash" },
              ...component.reservationArtifact.reservationFacts.slice(1)],
          },
        }, ...admission.canonicalSourceBindingManifest.componentSources.slice(1)],
      },
    };
    const result = materializePhaseDTask4V1({
      admission: tamperedAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(result.routeRelevantConflictClosures).toBeNull();
    expect(result.occurrenceUniverse).toBeNull();
  });

  it("rejects a rehashed manifest with a mismatched C2 artifact binding", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const manifest = admission.canonicalSourceBindingManifest;
    const { manifestHash: _manifestHash, ...manifestPayload } = manifest;
    const changedManifestPayload = {
      ...manifestPayload,
      multiComponentArtifactHash: "forged-c2-artifact-hash",
    };
    const changedManifest = {
      ...changedManifestPayload,
      manifestHash: canonicalHash(changedManifestPayload),
    };
    const { admissionHash: _admissionHash, ...admissionPayload } = admission;
    const changedAdmissionPayload = {
      ...admissionPayload,
      canonicalSourceBindingManifest: changedManifest,
      sourceBindingManifestHash: changedManifest.manifestHash,
    };
    const changedAdmission: PhaseDSourceAdmissionSuccessV1 = {
      ...changedAdmissionPayload,
      admissionHash: canonicalHash(changedAdmissionPayload),
    };
    const result = materializePhaseDTask4V1({
      admission: changedAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(result.routeRelevantConflictClosures).toBeNull();
    expect(result.occurrenceUniverse).toBeNull();
  });

  it("rejects a C2 endpoint whose source binding is cross-paired", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const manifest = admission.canonicalSourceBindingManifest;
    const c2 = manifest.multiComponentArtifact;
    const endpoints = c2.andEndpointReferences!;
    if (endpoints.length < 2) throw new Error("Missing two-component endpoint fixture");
    const changedEndpoints = endpoints.map((endpoint, index) => {
      const { endpointHash: _endpointHash, ...endpointPayload } = endpoint;
      const changedPayload = {
        ...endpointPayload,
        sourceArtifactHash: endpoints[(index + 1) % endpoints.length].sourceArtifactHash,
      };
      return { ...changedPayload, endpointHash: canonicalHash(changedPayload) };
    });
    const { artifactHash: _c2ArtifactHash, ...c2Payload } = c2;
    const changedC2Payload = { ...c2Payload, andEndpointReferences: changedEndpoints };
    const changedC2 = {
      ...changedC2Payload,
      artifactHash: canonicalHash(changedC2Payload),
    };
    const { manifestHash: _manifestHash, ...manifestPayload } = manifest;
    const changedManifestPayload = {
      ...manifestPayload,
      multiComponentArtifact: changedC2,
      multiComponentArtifactHash: changedC2.artifactHash,
    };
    const changedManifest = {
      ...changedManifestPayload,
      manifestHash: canonicalHash(changedManifestPayload),
    };
    const { admissionHash: _admissionHash, ...admissionPayload } = admission;
    const changedAdmissionPayload = {
      ...admissionPayload,
      canonicalSourceBindingManifest: changedManifest,
      sourceBindingManifestHash: changedManifest.manifestHash,
    };
    const changedAdmission: PhaseDSourceAdmissionSuccessV1 = {
      ...changedAdmissionPayload,
      admissionHash: canonicalHash(changedAdmissionPayload),
    };
    const result = materializePhaseDTask4V1({
      admission: changedAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result.task4Status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
    expect(result.routeRelevantConflictClosures).toBeNull();
    expect(result.occurrenceUniverse).toBeNull();
  });

  it("rejects a route-scoped occurrence key with contradictory lineage payload", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const draft = normalized.normalizedMemberDrafts[0];
    const physicalLineageIndex = draft.task3MemberLocalLineage.findIndex((entry) => entry.kind === "PHYSICAL");
    if (physicalLineageIndex < 0) throw new Error("Missing physical lineage fixture");
    const physicalLineage = draft.task3MemberLocalLineage[physicalLineageIndex];
    if (physicalLineage.kind !== "PHYSICAL") throw new Error("Missing physical lineage fixture");
    const { occurrenceHash: _occurrenceHash, ...occurrencePayload } = physicalLineage.occurrence;
    const changedOccurrencePayload = {
      ...occurrencePayload,
      canonicalRolePosition: `${physicalLineage.occurrence.canonicalRolePosition}:contradictory`,
    };
    const changedLineage = {
      ...physicalLineage,
      occurrence: {
        ...changedOccurrencePayload,
        occurrenceHash: canonicalHash(changedOccurrencePayload),
      },
    };
    const { normalizationHash: _normalizationHash, ...draftPayload } = draft;
    const changedDraftPayload = {
      ...draftPayload,
      task3MemberLocalLineage: draft.task3MemberLocalLineage.map((entry, index) =>
        index === physicalLineageIndex ? changedLineage : entry),
    };
    const changedDraft = {
      ...changedDraftPayload,
      normalizationHash: canonicalHash(changedDraftPayload),
    };
    const changedDrafts = normalized.normalizedMemberDrafts.map((candidate) =>
      candidate === draft ? changedDraft : candidate);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: changedDrafts,
    });

    expect(result.task4Status).toBe("REJECTED");
    expect(result.reasonCodes).toContain("OCCURRENCE_KEY_PAYLOAD_CONFLICT");
    expect(result.routeRelevantConflictClosures).toBeNull();
    expect(result.occurrenceUniverse).toBeNull();
  });

  it("fails closed when a normalized draft is not present in the admitted route universe", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const draft = normalized.normalizedMemberDrafts[0];
    const { normalizationHash: _normalizationHash, ...draftPayload } = draft;
    const changedDraftPayload = {
      ...draftPayload,
      routeId: `${draft.routeId}:unbound`,
    };
    const changedDraft = {
      ...changedDraftPayload,
      normalizationHash: canonicalHash(changedDraftPayload),
    };
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: [...normalized.normalizedMemberDrafts, changedDraft],
    });

    expect(result.task4Status).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("INCOMPLETE_LINEAGE_COVERAGE");
    expect(result.routeRelevantConflictClosures).toBeNull();
    expect(result.occurrenceUniverse).toBeNull();
  });

  it("keeps Task 4 output free of Task 5 materialization fields", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const result = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });

    expect(result).not.toHaveProperty("memberEnvelopeHash");
    expect(result).not.toHaveProperty("conflictInterface");
    expect(result).not.toHaveProperty("endpointInterface");
    expect(result).not.toHaveProperty("coverageManifest");
    expect(result).not.toHaveProperty("cohorts");
    expect(result).not.toHaveProperty("routeToCohortMappings");
    expect(result).not.toHaveProperty("membershipProofs");
  });
});

describe("Strategic cohort compression V1 Task 5 cohort materialization", () => {
  it("accepts 49 distinct canonical cohort keys regardless of insertion order", () => {
    const keys = Array.from({ length: 49 }, (_, ordinal) => canonicalHash({
      kind: "task5-hard-gate-fixture",
      ordinal,
    }));
    const canonical = applyHardCohortGateV1([...keys, keys[0]!]);
    const reversed = applyHardCohortGateV1([...keys].reverse());

    expect(canonical).toEqual({
      gateStatus: "COMPLETE",
      distinctCohortCount: 49,
      observedDistinctCohortLowerBound: 49,
      exhausted: false,
    });
    expect(reversed).toEqual(canonical);
  });

  it("fails closed at the 50th distinct canonical cohort key regardless of insertion order", () => {
    const keys = Array.from({ length: 50 }, (_, ordinal) => canonicalHash({
      kind: "task5-hard-gate-fixture",
      ordinal,
    }));
    const canonical = applyHardCohortGateV1(keys);
    const reversed = applyHardCohortGateV1([...keys].reverse());

    expect(canonical).toEqual({
      gateStatus: "INCONCLUSIVE",
      distinctCohortCount: 0,
      observedDistinctCohortLowerBound: 50,
      exhausted: true,
    });
    expect(reversed).toEqual(canonical);
  });

  it("uses the real post-interface aggregation seam for atomic 50th publication", () => {
    const keys = Array.from({ length: 50 }, (_, ordinal) => canonicalHash({
      kind: "task5-post-interface-hard-gate-fixture",
      ordinal,
    }));
    const aggregation = __task5PostDerivationHardGateV1(keys);
    expect(aggregation.gate.gateStatus).toBe("INCONCLUSIVE");
    expect(aggregation.gate.observedDistinctCohortLowerBound).toBe(50);
  });

  it("materializes final member envelopes, exact mappings, proofs, and route-scoped coverage", () => {
    const admission = admittedOf(makeWildcardPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    });
    expect(task4.task4Status).toBe("COMPLETE");

    const result = materializePhaseDTask5V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
      task4,
      evidenceBudget: {
        maxMemberEnvelopeCount: 100,
        maxResourceRoleSlotCount: 1000,
        maxConflictClosureEdgeCount: 1000,
        maxRouteMappingCount: 100,
        maxEquivalenceProofCount: 100,
        maxLineageOccurrenceWitnessCount: 5000,
      },
    });

    expect(result.compressionStatus).toBe("COMPLETE");
    expect(result.memberEnvelopes).toHaveLength(admission.inputRouteCount);
    expect(result.routeToCohortMappings).toHaveLength(admission.inputRouteCount);
    expect(result.equivalenceProofs).toHaveLength(admission.inputRouteCount);
    expect(result.coverageManifest?.coveredRouteCount).toBe(admission.inputRouteCount);
    expect(result.cohortCount).toBeGreaterThan(0);
    expect(result.memberEnvelopes?.every((envelope) =>
      envelope.normalizationHash !== envelope.memberEnvelopeHash)).toBe(true);
    expect(result.equivalenceProofs?.every((proof) => result.routeToCohortMappings
      ?.some((mapping) => mapping.mappingHash === proof.mappingHash
        && mapping.memberEnvelopeHash === proof.memberEnvelopeHash))).toBe(true);
    expect(result.coverageManifest?.inputPhysicalOccurrenceCount).toBeGreaterThan(0);
    expect(result.coverageManifest?.inputWildcardOccurrenceCount).toBeGreaterThan(0);
    expect(result.coverageManifest?.inputFamilyMemberOccurrenceCount).toBeGreaterThan(0);
    expect(result.coverageManifest?.inputReservationOccurrenceCount).toBeGreaterThan(0);
    expect(result.coverageManifest?.inputConflictOccurrenceCount).toBeGreaterThan(0);
    expect(result.coverageManifest?.inputEndpointOccurrenceCount).toBeGreaterThan(0);
    expect(result.coverageManifest?.coverageWitnesses.length).toBeGreaterThan(0);
    const mappings = result.routeToCohortMappings ?? [];
    expect(new Set(mappings.map((mapping) => mapping.memberEnvelopeHash)).size).toBe(mappings.length);
    for (const mapping of mappings) {
      const { mappingHash, ...mappingPayload } = mapping;
      expect(mappingHash).toBe(canonicalHash(mappingPayload));
      expect(result.memberEnvelopes?.some((envelope) => envelope.memberEnvelopeHash === mapping.memberEnvelopeHash
        && envelope.routeId === mapping.routeId && envelope.routeHash === mapping.routeHash)).toBe(true);
    }
    const proofs = result.equivalenceProofs ?? [];
    expect(new Set(proofs.map((proof) => proof.memberEnvelopeHash)).size).toBe(proofs.length);
    for (const proof of proofs) {
      const { proofHash, ...proofPayload } = proof;
      expect(proofHash).toBe(canonicalHash(proofPayload));
      expect(mappings.some((mapping) => mapping.mappingHash === proof.mappingHash
        && mapping.cohortInterfaceHash === proof.cohortInterfaceHash
        && mapping.memberEnvelopeHash === proof.memberEnvelopeHash)).toBe(true);
    }
    for (const witness of result.coverageManifest?.coverageWitnesses ?? []) {
      expect(mappings.some((mapping) => mapping.mappingHash === witness.mappingHash
        && mapping.memberEnvelopeHash === witness.memberEnvelopeHash)).toBe(true);
      expect(proofs.some((proof) => proof.proofHash === witness.proofHash
        && proof.memberEnvelopeHash === witness.memberEnvelopeHash
        && proof.mappingHash === witness.mappingHash)).toBe(true);
    }
  });

  it("fails closed when the Task 4 occurrence universe payload is contradictory", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.occurrenceUniverse === null) throw new Error("Expected complete Task 4");
    const forgedUniverse = {
      ...task4.occurrenceUniverse,
      sourceRouteIds: [...task4.occurrenceUniverse.sourceRouteIds, "unbound-route"],
    };
    const forgedTask4 = {
      ...task4,
      occurrenceUniverse: forgedUniverse,
    };
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4: forgedTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.coverageManifest).toBeNull();
  });

  it("returns inconclusive without a partial artifact when an occurrence is missing", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.occurrenceUniverse === null) throw new Error("Expected complete Task 4");
    const { occurrenceUniverseHash: _occurrenceUniverseHash, ...universePayload } = task4.occurrenceUniverse;
    const forgedUniversePayload = {
      ...universePayload,
      endpointOccurrenceKeys: universePayload.endpointOccurrenceKeys.slice(1),
    };
    const forgedUniverse = {
      ...forgedUniversePayload,
      occurrenceUniverseHash: canonicalHash(forgedUniversePayload),
    };
    const { artifactHash: _artifactHash, ...task4Payload } = task4;
    const forgedTask4Payload = { ...task4Payload, occurrenceUniverse: forgedUniverse };
    const forgedTask4 = { ...forgedTask4Payload, artifactHash: canonicalHash(forgedTask4Payload) };
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4: forgedTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("INCOMPLETE_LINEAGE_COVERAGE");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.cohorts).toBeNull();
    expect(result.coverageManifest).toBeNull();
  });

  it("keeps exact cards member-local while grouping equal four-part interfaces", () => {
    const admission = admittedOf(makeSameRankDifferentCopyPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const result = materializePhaseDTask5V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
      task4,
      evidenceBudget: phaseDTask5Budget(),
    });

    expect(result.compressionStatus).toBe("COMPLETE");
    expect(result.cohortCount).toBe(1);
    expect(result.memberEnvelopes).toHaveLength(2);
    expect(result.memberEnvelopes?.map((envelope) => envelope.physicalLineageOccurrences
      .map((occurrence) => occurrence.physicalCardId).sort().join(",")).sort())
      .toEqual(["C9-1,S9-1", "C9-2,S9-2"]);
  });

  it("derives a different structural cohort key from real strength and level facts", () => {
    const strengthVariant = materializeTask5Fixture(makeSameRankDifferentCopyPhaseDAdmissionInput());
    const levelVariant = materializeTask5Fixture(makeWildcardPhaseDAdmissionInput());
    const base = materializeTask5Fixture(makeValidPhaseDAdmissionInput());
    expect(strengthVariant.compressionStatus).toBe("COMPLETE");
    expect(levelVariant.compressionStatus).toBe("COMPLETE");
    expect(base.compressionStatus).toBe("COMPLETE");
    expect(strengthVariant.cohortInterfaces?.map((value) => value.structuralInterface))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.structuralInterface));
    expect(levelVariant.cohortInterfaces?.map((value) => value.structuralInterface))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.structuralInterface));
    expect(strengthVariant.cohortInterfaces?.map((value) => value.cohortInterfaceHash))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.cohortInterfaceHash));
    expect(levelVariant.cohortInterfaces?.map((value) => value.cohortInterfaceHash))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.cohortInterfaceHash));
  });

  it("derives distinct real resource, conflict, and endpoint interfaces", () => {
    const base = materializeTask5Fixture(makeValidPhaseDAdmissionInput());
    const wildcard = materializeTask5Fixture(makeWildcardPhaseDAdmissionInput());
    expect(base.compressionStatus).toBe("COMPLETE");
    expect(wildcard.compressionStatus).toBe("COMPLETE");
    expect(wildcard.cohortInterfaces?.map((value) => value.resourceInterface))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.resourceInterface));
    expect(wildcard.cohortInterfaces?.map((value) => value.conflictInterface))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.conflictInterface));
    expect(wildcard.cohortInterfaces?.map((value) => value.conflictInterface.alternativeAllocationInterfaces))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.conflictInterface.alternativeAllocationInterfaces));
    expect(wildcard.cohortInterfaces?.flatMap((value) => value.conflictInterface.routeClaimIncidenceVector))
      .not.toEqual(base.cohortInterfaces?.flatMap((value) => value.conflictInterface.routeClaimIncidenceVector));
    expect(wildcard.cohortInterfaces?.map((value) => value.endpointInterface))
      .not.toEqual(base.cohortInterfaces?.map((value) => value.endpointInterface));
    for (const cohortInterface of wildcard.cohortInterfaces ?? []) {
      const serialized = JSON.stringify(cohortInterface.conflictInterface);
      expect(serialized).not.toContain("allocationVariantHash");
      expect(serialized).not.toContain("wildcardCardId");
    }
  });

  it("derives claimant roles from route-relevant conflict claimants, not only current route claims", () => {
    const input = makeValidPhaseDAdmissionInput();
    const admission = admittedOf(input);
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4, evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("COMPLETE");
    const envelope = result.memberEnvelopes?.[0];
    const component = admission.canonicalSourceBindingManifest.componentSources
      .find((candidate) => candidate.resourceComponentId === envelope?.resourceComponentId);
    const closure = task4.routeRelevantConflictClosures?.find((candidate) =>
      candidate.routeId === envelope?.routeId && candidate.routeHash === envelope?.routeHash);
    if (envelope === undefined || component === undefined || closure === undefined) {
      throw new Error("Expected route-relevant conflict evidence");
    }
    const claims = component.reservationArtifact.reservationFacts.flatMap((fact) => fact.claims);
    const alternatives = new Map(component.reservationArtifact.reservationAlternatives
      .map((alternative) => [alternative.alternativeReservationFactId, alternative] as const));
    const claimsById = new Map(claims.map((claim) => [claim.claimId, claim] as const));
    const conflicts = new Map(component.reservationArtifact.conflictFacts
      .map((conflict) => [conflict.conflictFactId, conflict] as const));
    const expected = new Set<string>();
    for (const conflictId of closure.conflictFactIds) {
      const conflict = conflicts.get(conflictId);
      if (conflict === undefined) throw new Error("Missing conflict claimant fixture");
      for (const alternativeId of conflict.alternativeReservationFactIds) {
        const alternative = alternatives.get(alternativeId);
        const claim = alternative === undefined ? undefined : claimsById.get(alternative.claimId);
        if (claim === undefined) throw new Error("Missing conflict claimant claim fixture");
        claim.claimRoles.forEach((role) => expected.add(role));
      }
    }
    expect(envelope.conflictInterface.claimantRoleVector).toEqual([...expected].sort());
  });

  it("keeps branch-local incidence canonical when exact alternative identities differ", () => {
    const materialize = (mode: "VALID_BRANCH" | "VALID_BRANCH_A2") => {
      const fixture = makeCrossConflictWitnessBindingFixture(mode);
      const task4 = materializePhaseDTask4V1({ admission: fixture.admission,
        normalizedMemberDrafts: fixture.normalizedMemberDrafts });
      const result = materializePhaseDTask5V1({ admission: fixture.admission,
        normalizedMemberDrafts: fixture.normalizedMemberDrafts, task4, evidenceBudget: phaseDTask5Budget() });
      return { task4, result };
    };
    const first = materialize("VALID_BRANCH");
    const second = materialize("VALID_BRANCH_A2");
    expect(first.task4.task4Status).toBe("COMPLETE");
    expect(second.task4.task4Status).toBe("COMPLETE");
    expect(first.result.compressionStatus).toBe("COMPLETE");
    expect(second.result.compressionStatus).toBe("COMPLETE");
    expect(first.result.memberEnvelopes?.[0]?.conflictInterface.routeClaimIncidenceVector)
      .toEqual(second.result.memberEnvelopes?.[0]?.conflictInterface.routeClaimIncidenceVector);
  });

  it("changes branch-local incidence when a different canonical alternative semantics is selected", () => {
    const materialize = (mode: "VALID_BRANCH" | "VALID_BRANCH_BOMB") => {
      const fixture = makeCrossConflictWitnessBindingFixture(mode);
      const task4 = materializePhaseDTask4V1({ admission: fixture.admission,
        normalizedMemberDrafts: fixture.normalizedMemberDrafts });
      const result = materializePhaseDTask5V1({ admission: fixture.admission,
        normalizedMemberDrafts: fixture.normalizedMemberDrafts, task4, evidenceBudget: phaseDTask5Budget() });
      return { task4, result };
    };
    const first = materialize("VALID_BRANCH");
    const second = materialize("VALID_BRANCH_BOMB");
    expect(first.task4.task4Status).toBe("COMPLETE");
    expect(second.task4.task4Status).toBe("COMPLETE");
    expect(first.result.compressionStatus).toBe("COMPLETE");
    expect(second.result.compressionStatus).toBe("COMPLETE");
    expect(first.result.memberEnvelopes?.[0]?.conflictInterface.routeClaimIncidenceVector)
      .not.toEqual(second.result.memberEnvelopes?.[0]?.conflictInterface.routeClaimIncidenceVector);
  });

  it("keeps wildcard exact-card variants out of shared conflict and cohort interfaces", () => {
    const first = materializeTask5Fixture(makeWildcardPhaseDAdmissionInputWithWildcard("H2-1"));
    const second = materializeTask5Fixture(makeWildcardPhaseDAdmissionInputWithWildcard("H2-2"));
    expect(first.compressionStatus).toBe("COMPLETE");
    expect(second.compressionStatus).toBe("COMPLETE");
    expect(second.cohortInterfaces).toEqual(first.cohortInterfaces);
    expect(second.cohorts?.map((cohort) => cohort.cohortId))
      .toEqual(first.cohorts?.map((cohort) => cohort.cohortId));
    expect(second.memberEnvelopes?.map((envelope) => envelope.memberEnvelopeHash))
      .not.toEqual(first.memberEnvelopes?.map((envelope) => envelope.memberEnvelopeHash));
    expect(second.memberEnvelopes?.flatMap((envelope) => envelope.wildcardLineageOccurrences
      .map((occurrence) => occurrence.wildcardCardId))).not.toEqual(
        first.memberEnvelopes?.flatMap((envelope) => envelope.wildcardLineageOccurrences
          .map((occurrence) => occurrence.wildcardCardId)),
      );
  });

  it("indexes endpoint projections once per endpoint-route edge without retaining route payloads", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const index = __task5EndpointIndexForTest(admission);
    const endpoints = admission.canonicalSourceBindingManifest.multiComponentArtifact.andEndpointReferences ?? [];
    const expectedEdgeCount = endpoints.reduce((total, endpoint) => total + endpoint.routeReferences.length, 0);
    expect(index.endpointRouteEdgeCount).toBe(expectedEdgeCount);
    expect(index.endpointProjectionByHashCount).toBe(endpoints.length);
    for (const projections of index.endpointProjectionsByRoute.values()) {
      for (const projection of projections) {
        expect(projection).not.toHaveProperty("routeReferences");
        expect(projection).toHaveProperty("dependencyArity");
      }
    }
  });

  it("keeps canonical cohort evidence identical when component sources are reversed", () => {
    const materialize = (input: Parameters<typeof compressHierarchicalStrategicCohortsV1>[0]) => {
      const admission = admittedOf(input);
      const normalized = normalizedOf(admission);
      const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
      return materializePhaseDTask5V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts,
        task4, evidenceBudget: phaseDTask5Budget() });
    };
    const canonical = materialize(makeValidPhaseDAdmissionInput());
    const reversed = materialize(makeReversedComponentSourceInput(makeValidPhaseDAdmissionInput()));

    expect(reversed.compressionStatus).toBe("COMPLETE");
    expect(reversed.cohortInterfaces).toEqual(canonical.cohortInterfaces);
    expect(reversed.cohorts?.map((cohort) => cohort.cohortId))
      .toEqual(canonical.cohorts?.map((cohort) => cohort.cohortId));
  });

  it("fails closed for adversarial mapping publication evidence", () => {
    const evidence = publicationEvidenceOf();
    const mapping = evidence.mappings[0]!;
    const originalEnvelope = evidence.envelopes[0]!;
    const { memberEnvelopeHash: _memberEnvelopeHash, ...envelopePayload } = originalEnvelope;
    const conflictingEnvelopePayload = { ...envelopePayload, routeHash: `${originalEnvelope.routeHash}:other` };
    const conflictingEnvelope = {
      ...conflictingEnvelopePayload,
      memberEnvelopeHash: canonicalHash(conflictingEnvelopePayload),
    };
    expect(__validateTask5PublicationForTest(
      [originalEnvelope, conflictingEnvelope, ...evidence.envelopes.slice(1)],
      evidence.mappings,
      evidence.proofs,
      evidence.cohortInterfaces,
    )).toEqual({ status: "REJECTED", reason: "ROUTE_ID_HASH_CONFLICT" });

    const duplicate = __validateTask5PublicationForTest(
      evidence.envelopes,
      [...evidence.mappings, mapping],
      evidence.proofs,
      evidence.cohortInterfaces,
    );
    expect(duplicate).toEqual({ status: "REJECTED", reason: "MEMBER_ENVELOPE_HASH_CONFLICT" });

    const missing = __validateTask5PublicationForTest(
      evidence.envelopes,
      evidence.mappings.slice(1),
      evidence.proofs,
      evidence.cohortInterfaces,
    );
    expect(missing).toEqual({ status: "INCONCLUSIVE", reason: "INCOMPLETE_ROUTE_MAPPING" });

    const wrongMemberEnvelope = { ...mapping, memberEnvelopeHash: "wrong-member-envelope",
      mappingHash: canonicalHash({ ...mapping, memberEnvelopeHash: "wrong-member-envelope", mappingHash: undefined }) };
    expect(__validateTask5PublicationForTest(evidence.envelopes, [wrongMemberEnvelope, ...evidence.mappings.slice(1)],
      evidence.proofs, evidence.cohortInterfaces)).toEqual({ status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" });

    const wrongCohortIdPayload = { ...mapping, cohortId: "wrong-cohort" };
    const wrongCohortId = { ...wrongCohortIdPayload, mappingHash: canonicalHash(wrongCohortIdPayload) };
    expect(__validateTask5PublicationForTest(evidence.envelopes, [wrongCohortId, ...evidence.mappings.slice(1)],
      evidence.proofs, evidence.cohortInterfaces)).toEqual({ status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" });

    const wrongCohortInterfacePayload = { ...mapping, cohortInterfaceHash: "wrong-interface" };
    const wrongCohortInterface = { ...wrongCohortInterfacePayload, mappingHash: canonicalHash(wrongCohortInterfacePayload) };
    expect(__validateTask5PublicationForTest(evidence.envelopes, [wrongCohortInterface, ...evidence.mappings.slice(1)],
      evidence.proofs, evidence.cohortInterfaces)).toEqual({ status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH" });

    const wrongMappingHash = { ...mapping, mappingHash: "wrong-mapping-hash" };
    expect(__validateTask5PublicationForTest(evidence.envelopes, [wrongMappingHash, ...evidence.mappings.slice(1)],
      evidence.proofs, evidence.cohortInterfaces)).toEqual({ status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH" });
  });

  it("fails closed for adversarial membership proof evidence", () => {
    const evidence = publicationEvidenceOf();
    const proof = evidence.proofs[0]!;
    const duplicate = __validateTask5PublicationForTest(evidence.envelopes, evidence.mappings,
      [...evidence.proofs, proof], evidence.cohortInterfaces);
    expect(duplicate).toEqual({ status: "REJECTED", reason: "MEMBER_ENVELOPE_HASH_CONFLICT" });

    const missing = __validateTask5PublicationForTest(evidence.envelopes, evidence.mappings,
      evidence.proofs.slice(1), evidence.cohortInterfaces);
    expect(missing).toEqual({ status: "INCONCLUSIVE", reason: "INCOMPLETE_EQUIVALENCE_PROOF" });

    const wrongMappingHash = { ...proof, mappingHash: "wrong-mapping-hash" };
    expect(__validateTask5PublicationForTest(evidence.envelopes, evidence.mappings,
      [wrongMappingHash, ...evidence.proofs.slice(1)], evidence.cohortInterfaces)).toEqual({
        status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH",
      });

    const wrongCohortInterfacePayload = { ...proof, cohortInterfaceHash: "wrong-interface" };
    const wrongCohortInterface = { ...wrongCohortInterfacePayload, proofHash: canonicalHash(wrongCohortInterfacePayload) };
    expect(__validateTask5PublicationForTest(evidence.envelopes, evidence.mappings,
      [wrongCohortInterface, ...evidence.proofs.slice(1)], evidence.cohortInterfaces)).toEqual({
        status: "REJECTED", reason: "SOURCE_BINDING_MISMATCH",
      });

    const wrongSignaturesPayload = { ...proof, fourSignatureHashes: {
      ...proof.fourSignatureHashes, endpointSignatureHash: "wrong-endpoint-signature",
    } };
    const wrongSignatures = { ...wrongSignaturesPayload, proofHash: canonicalHash(wrongSignaturesPayload) };
    expect(__validateTask5PublicationForTest(evidence.envelopes, evidence.mappings,
      [wrongSignatures, ...evidence.proofs.slice(1)], evidence.cohortInterfaces)).toEqual({
        status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH",
      });

    const wrongProofHash = { ...proof, proofHash: "wrong-proof-hash" };
    expect(__validateTask5PublicationForTest(evidence.envelopes, evidence.mappings,
      [wrongProofHash, ...evidence.proofs.slice(1)], evidence.cohortInterfaces)).toEqual({
        status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH",
      });

    const wrongWitnessPayload = { ...proof,
      canonicalRolePositionBijectionWitness: proof.canonicalRolePositionBijectionWitness.slice(1),
    };
    const wrongWitness = { ...wrongWitnessPayload, proofHash: canonicalHash(wrongWitnessPayload) };
    expect(__validateTask5PublicationForTest(evidence.envelopes, evidence.mappings,
      [wrongWitness, ...evidence.proofs.slice(1)], evidence.cohortInterfaces)).toEqual({
        status: "REJECTED", reason: "SOURCE_HASH_PAYLOAD_MISMATCH",
      });
  });

  it("keeps member, mapping, proof, and coverage hashes deterministic under evidence order reversal", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.occurrenceUniverse === null
      || task4.routeRelevantConflictClosures === null) throw new Error("Expected complete Task 4");
    const { occurrenceUniverseHash: _universeHash, ...universePayload } = task4.occurrenceUniverse;
    const reversedUniversePayload = {
      ...universePayload,
      sourceRouteIds: [...universePayload.sourceRouteIds].reverse(),
      physicalOccurrenceKeys: [...universePayload.physicalOccurrenceKeys].reverse(),
      wildcardOccurrenceKeys: [...universePayload.wildcardOccurrenceKeys].reverse(),
      familyMemberOccurrenceKeys: [...universePayload.familyMemberOccurrenceKeys].reverse(),
      reservationOccurrenceKeys: [...universePayload.reservationOccurrenceKeys].reverse(),
      conflictOccurrenceKeys: [...universePayload.conflictOccurrenceKeys].reverse(),
      endpointOccurrenceKeys: [...universePayload.endpointOccurrenceKeys].reverse(),
    };
    const canonicalUniversePayload = {
      ...reversedUniversePayload,
      sourceRouteIds: [...reversedUniversePayload.sourceRouteIds].sort(),
      physicalOccurrenceKeys: [...reversedUniversePayload.physicalOccurrenceKeys].sort(compareTextTuple),
      wildcardOccurrenceKeys: [...reversedUniversePayload.wildcardOccurrenceKeys].sort(compareTextTuple),
      familyMemberOccurrenceKeys: [...reversedUniversePayload.familyMemberOccurrenceKeys].sort(compareTextTuple),
      reservationOccurrenceKeys: [...reversedUniversePayload.reservationOccurrenceKeys].sort(compareTextTuple),
      conflictOccurrenceKeys: [...reversedUniversePayload.conflictOccurrenceKeys].sort(compareTextTuple),
      endpointOccurrenceKeys: [...reversedUniversePayload.endpointOccurrenceKeys].sort(compareTextTuple),
    };
    const reversedUniverse = { ...reversedUniversePayload, occurrenceUniverseHash: canonicalHash(canonicalUniversePayload) };
    const { artifactHash: _artifactHash, ...task4Payload } = task4;
    const reversedTask4Payload = {
      ...task4Payload,
      routeRelevantConflictClosures: [...task4.routeRelevantConflictClosures].reverse(),
      occurrenceUniverse: reversedUniverse,
    };
    const reversedTask4 = { ...reversedTask4Payload, artifactHash: task4.artifactHash };
    const canonical = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4, evidenceBudget: phaseDTask5Budget() });
    const reversed = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: [...normalized.normalizedMemberDrafts].reverse(), task4: reversedTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(reversed.compressionStatus).toBe("COMPLETE");
    expect(reversed.memberEnvelopes?.map((value) => value.memberEnvelopeHash))
      .toEqual(canonical.memberEnvelopes?.map((value) => value.memberEnvelopeHash));
    expect(reversed.cohortInterfaces).toEqual(canonical.cohortInterfaces);
    expect(reversed.routeToCohortMappings).toEqual(canonical.routeToCohortMappings);
    expect(reversed.equivalenceProofs).toEqual(canonical.equivalenceProofs);
    expect(reversed.coverageManifest).toEqual(canonical.coverageManifest);
    expect(reversed.cohortUniverseHash).toBe(canonical.cohortUniverseHash);
  });

  it("keeps Task 5 artifacts deterministic when verified C2 endpoint references are reversed", () => {
    const originalAdmission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(originalAdmission);
    const task4 = materializePhaseDTask4V1({ admission: originalAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const reversedAdmission = rebindTask5Admission(originalAdmission, (artifact) => ({
      ...artifact,
      andEndpointReferences: artifact.andEndpointReferences === null
        ? null : [...artifact.andEndpointReferences].reverse(),
    }));
    const reversedTask4 = rebindTask4Artifact(task4, reversedAdmission);
    const canonical = materializePhaseDTask5V1({ admission: originalAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4,
      evidenceBudget: phaseDTask5Budget() });
    const reversed = materializePhaseDTask5V1({ admission: reversedAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4: reversedTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(reversed.compressionStatus).toBe("COMPLETE");
    expect(reversed.memberEnvelopes).toEqual(canonical.memberEnvelopes);
    expect(reversed.cohortInterfaces).toEqual(canonical.cohortInterfaces);
    expect(reversed.routeToCohortMappings).toEqual(canonical.routeToCohortMappings);
    expect(reversed.equivalenceProofs).toEqual(canonical.equivalenceProofs);
    expect(reversed.coverageManifest).toEqual(canonical.coverageManifest);
    expect(reversed.cohortUniverseHash).toBe(canonical.cohortUniverseHash);
  });

  it("rejects a Task 4 closure bound to another route hash", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.routeRelevantConflictClosures === null) throw new Error("Expected complete Task 4");
    const original = task4.routeRelevantConflictClosures[0]!;
    const { closureHash: _closureHash, ...closurePayload } = original;
    const forgedClosurePayload = { ...closurePayload, routeHash: `${original.routeHash}:wrong` };
    const forgedClosure = { ...forgedClosurePayload, closureHash: canonicalHash(forgedClosurePayload) };
    const task4Payload = {
      ...task4,
      routeRelevantConflictClosures: [forgedClosure, ...task4.routeRelevantConflictClosures.slice(1)],
    };
    const { artifactHash: _task4ArtifactHash, ...forgedTask4Payload } = task4Payload;
    const forgedTask4 = { ...forgedTask4Payload, artifactHash: canonicalHash(forgedTask4Payload) };
    const result = materializePhaseDTask5V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts,
      task4: forgedTask4, evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
    expect(result.memberEnvelopes).toBeNull();
  });

  it("rejects a Task 4 closure bound to the wrong source artifact", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.routeRelevantConflictClosures === null) throw new Error("Expected complete Task 4");
    const original = task4.routeRelevantConflictClosures[0]!;
    const { closureHash: _closureHash, ...closurePayload } = original;
    const forgedClosurePayload = { ...closurePayload, sourceArtifactHash: `${original.sourceArtifactHash}:wrong` };
    const forgedClosure = { ...forgedClosurePayload, closureHash: canonicalHash(forgedClosurePayload) };
    const forgedTask4Payload = {
      ...task4,
      routeRelevantConflictClosures: [forgedClosure, ...task4.routeRelevantConflictClosures.slice(1)],
    };
    const { artifactHash: _artifactHash, ...withoutArtifactHash } = forgedTask4Payload;
    const forgedTask4 = { ...withoutArtifactHash, artifactHash: canonicalHash(withoutArtifactHash) };
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4: forgedTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.cohorts).toBeNull();
  });

  it("keeps cohort interfaces free of route, member, card, and provenance identities", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const result = materializePhaseDTask5V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts,
      task4, evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("COMPLETE");
    const forbidden = new Set([
      "routeId", "routeHash", "physicalCardId", "physicalCardIds", "wildcardCardId", "wildcardCardIds",
      "memberId", "memberIds", "sourceArtifactHash", "sourceRouteUniverseHash", "normalizationHash",
      "memberEnvelopeHash", "mappingHash", "proofHash", "familyId", "conflictFactId", "reservationFactId",
    ]);
    const keysOf = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(keysOf);
      if (typeof value !== "object" || value === null) return [];
      return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
    };
    for (const cohortInterface of result.cohortInterfaces ?? []) {
      expect(keysOf(cohortInterface).some((key) => forbidden.has(key))).toBe(false);
      const serialized = JSON.stringify(cohortInterface);
      expect(serialized).not.toContain("H2-1");
      expect(serialized).not.toContain("C7-1");
    }
  });

  it("fails closed when Task 3 or Task 4 evidence is missing", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.routeRelevantConflictClosures === null) throw new Error("Expected complete Task 4");
    const missingDraft = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts.slice(1), task4, evidenceBudget: phaseDTask5Budget() });
    expect(missingDraft.compressionStatus).toBe("INCONCLUSIVE");
    expect(missingDraft.memberEnvelopes).toBeNull();
    const missingClosurePayload = { ...task4, routeRelevantConflictClosures: task4.routeRelevantConflictClosures.slice(1) };
    const { artifactHash: _artifactHash, ...missingClosureWithoutHash } = missingClosurePayload;
    const missingClosure = { ...missingClosureWithoutHash, artifactHash: canonicalHash(missingClosureWithoutHash) };
    const missingClosureResult = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4: missingClosure,
      evidenceBudget: phaseDTask5Budget() });
    expect(missingClosureResult.compressionStatus).toBe("INCONCLUSIVE");
    expect(missingClosureResult.coverageManifest).toBeNull();
  });

  it("returns inconclusive when required C2 endpoint evidence is missing", () => {
    const originalAdmission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(originalAdmission);
    const task4 = materializePhaseDTask4V1({ admission: originalAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const admission = rebindTask5Admission(originalAdmission, (artifact) => ({
      ...artifact,
      andEndpointReferences: null,
    }));
    const reboundTask4 = rebindTask4Artifact(task4, admission);
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4: reboundTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.cohorts).toBeNull();
    expect(result.routeToCohortMappings).toBeNull();
    expect(result.equivalenceProofs).toBeNull();
    expect(result.coverageManifest).toBeNull();
    expect(result.cohortUniverseHash).toBeNull();
  });

  it("rejects a C2 endpoint with a wrong component or route-universe binding", () => {
    const originalAdmission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(originalAdmission);
    const task4 = materializePhaseDTask4V1({ admission: originalAdmission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const endpoints = originalAdmission.canonicalSourceBindingManifest.multiComponentArtifact.andEndpointReferences;
    if (endpoints === null || endpoints.length === 0) throw new Error("Expected endpoint evidence");
    const admission = rebindTask5Admission(originalAdmission, (artifact) => ({
      ...artifact,
      andEndpointReferences: endpoints.map((endpoint, index) => index === 0
        ? { ...endpoint, sourceRouteUniverseHash: `${endpoint.sourceRouteUniverseHash}:wrong` }
        : endpoint),
    }));
    const reboundTask4 = rebindTask4Artifact(task4, admission);
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4: reboundTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.cohorts).toBeNull();
    expect(result.coverageManifest).toBeNull();
  });

  it("rejects a draft with a contradictory source artifact binding", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const draft = normalized.normalizedMemberDrafts[0]!;
    const { normalizationHash: _normalizationHash, ...draftWithoutHash } = draft;
    const forgedDraftPayload = { ...draftWithoutHash, sourceArtifactHash: `${draft.sourceArtifactHash}:wrong` };
    const forgedDraft = { ...forgedDraftPayload, normalizationHash: canonicalHash(forgedDraftPayload) };
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: [forgedDraft, ...normalized.normalizedMemberDrafts.slice(1)],
      task4, evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
    expect(result.cohorts).toBeNull();
  });

  it("rejects a draft with a contradictory normalization hash", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const draft = normalized.normalizedMemberDrafts[0]!;
    const forgedDraft = { ...draft, normalizationHash: `${draft.normalizationHash}:wrong` };
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: [forgedDraft, ...normalized.normalizedMemberDrafts.slice(1)],
      task4, evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.cohorts).toBeNull();
    expect(result.routeToCohortMappings).toBeNull();
    expect(result.equivalenceProofs).toBeNull();
    expect(result.coverageManifest).toBeNull();
  });

  it("rejects self-bound drafts that reuse a route id with a different route hash", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const original = normalized.normalizedMemberDrafts[0]!;
    const { normalizationHash: _normalizationHash, ...payload } = original;
    const forgedPayload = { ...payload, routeHash: `${original.routeHash}:other` };
    const forged = { ...forgedPayload, normalizationHash: canonicalHash(forgedPayload) };
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: [original, forged, ...normalized.normalizedMemberDrafts.slice(1)], task4,
      evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("ROUTE_ID_HASH_CONFLICT");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.cohorts).toBeNull();
  });

  it("rejects a self-bound draft that is foreign to the admitted route universe", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const original = normalized.normalizedMemberDrafts[0]!;
    const { normalizationHash: _normalizationHash, ...payload } = original;
    const forgedPayload = { ...payload, routeId: `${original.routeId}:foreign` };
    const forged = { ...forgedPayload, normalizationHash: canonicalHash(forgedPayload) };
    const result = materializePhaseDTask5V1({ admission,
      normalizedMemberDrafts: [...normalized.normalizedMemberDrafts, forged], task4,
      evidenceBudget: phaseDTask5Budget() });
    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
    expect(result.memberEnvelopes).toBeNull();
    expect(result.coverageManifest).toBeNull();
  });

  it("does not rediscover an unreachable adjacent conflict during Task 5", () => {
    const materialize = (input: Parameters<typeof compressHierarchicalStrategicCohortsV1>[0]) => {
      const admission = admittedOf(input);
      const normalized = normalizedOf(admission);
      const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
      return materializePhaseDTask5V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts,
        task4, evidenceBudget: phaseDTask5Budget() });
    };
    const base = materialize(makeValidPhaseDAdmissionInput());
    const adjacent = makePhysicallyAdjacentUnreachableConflictFixture();
    const adjacentTask4 = materializePhaseDTask4V1({ admission: adjacent.admission,
      normalizedMemberDrafts: adjacent.normalizedMemberDrafts });
    const adjacentResult = materializePhaseDTask5V1({ admission: adjacent.admission,
      normalizedMemberDrafts: adjacent.normalizedMemberDrafts, task4: adjacentTask4,
      evidenceBudget: phaseDTask5Budget() });
    expect(base.compressionStatus).toBe("COMPLETE");
    expect(adjacentResult.compressionStatus).toBe("COMPLETE");
    expect(adjacentResult.cohortInterfaces?.map((value) => value.conflictInterface))
      .toEqual(base.cohortInterfaces?.map((value) => value.conflictInterface));
    expect(adjacentResult.cohortInterfaces?.map((value) => value.cohortInterfaceHash))
      .toEqual(base.cohortInterfaces?.map((value) => value.cohortInterfaceHash));
    expect(adjacentResult.cohorts?.map((value) => value.cohortId))
      .toEqual(base.cohorts?.map((value) => value.cohortId));
  });

  it("rejects route-universe, component-set, and normalization binding contradictions", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    const draft = normalized.normalizedMemberDrafts[0]!;
    const variants = ["sourceRouteUniverseHash", "sourceAndComponentSetHash"] as const;
    for (const field of variants) {
      const { normalizationHash: _hash, ...withoutHash } = draft;
      const forgedPayload = { ...withoutHash, [field]: `${draft[field]}:wrong` };
      const forged = { ...forgedPayload, normalizationHash: canonicalHash(forgedPayload) };
      const result = materializePhaseDTask5V1({ admission,
        normalizedMemberDrafts: [forged, ...normalized.normalizedMemberDrafts.slice(1)], task4,
        evidenceBudget: phaseDTask5Budget() });
      expect(result.compressionStatus).toBe("REJECTED");
      expect(result.reasonCodes).toContain("SOURCE_BINDING_MISMATCH");
      expect(result.coverageManifest).toBeNull();
    }
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

function phaseDTask5Budget(): StrategicCohortCompressionEvidenceBudgetV1 {
  return {
    maxMemberEnvelopeCount: 100,
    maxResourceRoleSlotCount: 1000,
    maxConflictClosureEdgeCount: 1000,
    maxRouteMappingCount: 100,
    maxEquivalenceProofCount: 100,
    maxLineageOccurrenceWitnessCount: 5000,
  };
}

function publicationEvidenceOf() {
  const admission = admittedOf(makeValidPhaseDAdmissionInput());
  const normalized = normalizedOf(admission);
  const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
  const result = materializePhaseDTask5V1({
    admission,
    normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    task4,
    evidenceBudget: phaseDTask5Budget(),
  });
  if (result.compressionStatus !== "COMPLETE"
    || result.memberEnvelopes === null
    || result.routeToCohortMappings === null
    || result.equivalenceProofs === null
    || result.cohortInterfaces === null) {
    throw new Error("Expected complete Task 5 publication evidence");
  }
  return {
    envelopes: result.memberEnvelopes,
    mappings: result.routeToCohortMappings,
    proofs: result.equivalenceProofs,
    cohortInterfaces: new Map(result.cohortInterfaces.map((value) => [value.cohortInterfaceHash, value] as const)),
  };
}

function materializeTask5Fixture(
  input: Parameters<typeof compressHierarchicalStrategicCohortsV1>[0],
) {
  const admission = admittedOf(input);
  const normalized = normalizedOf(admission);
  const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
  return materializePhaseDTask5V1({ admission,
    normalizedMemberDrafts: normalized.normalizedMemberDrafts, task4, evidenceBudget: phaseDTask5Budget() });
}

function rebindTask5Admission(
  admission: PhaseDSourceAdmissionSuccessV1,
  mutate: (artifact: PhaseDSourceAdmissionSuccessV1["canonicalSourceBindingManifest"]["multiComponentArtifact"])
    => PhaseDSourceAdmissionSuccessV1["canonicalSourceBindingManifest"]["multiComponentArtifact"],
): PhaseDSourceAdmissionSuccessV1 {
  const originalManifest = admission.canonicalSourceBindingManifest;
  const changedArtifactPayload = mutate(originalManifest.multiComponentArtifact);
  const { artifactHash: _artifactHash, ...artifactPayload } = changedArtifactPayload;
  const changedArtifact = { ...artifactPayload, artifactHash: canonicalHash(artifactPayload) };
  const changedManifestPayload = {
    ...originalManifest,
    multiComponentArtifact: changedArtifact,
    multiComponentArtifactHash: changedArtifact.artifactHash,
  };
  const { manifestHash: _manifestHash, ...manifestPayload } = changedManifestPayload;
  const changedManifest = { ...manifestPayload, manifestHash: canonicalHash(manifestPayload) };
  const changedAdmissionPayload = {
    ...admission,
    canonicalSourceBindingManifest: changedManifest,
    sourceBindingManifestHash: changedManifest.manifestHash,
  };
  const { admissionHash: _admissionHash, ...admissionPayload } = changedAdmissionPayload;
  return { ...admissionPayload, admissionHash: canonicalHash(admissionPayload) };
}

function rebindTask4Artifact(
  task4: PhaseDTask4ArtifactV1,
  admission: PhaseDSourceAdmissionSuccessV1,
): PhaseDTask4ArtifactV1 {
  const { artifactHash: _artifactHash, ...payload } = task4;
  const reboundPayload = {
    ...payload,
    sourceBindingManifestHash: admission.sourceBindingManifestHash,
  };
  return { ...reboundPayload, artifactHash: canonicalHash(reboundPayload) };
}

function compareTextTuple(
  left: readonly string[],
  right: readonly string[],
): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const compared = (left[index] ?? "").localeCompare(right[index] ?? "");
    if (compared !== 0) return compared;
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

function slotForPhysicalCard(
  draft: NormalizedRouteCohortMemberDraftV1,
  physicalCardId: string,
) {
  const physicalOccurrence = draft.task3MemberLocalLineage.find((entry) =>
    entry.kind === "PHYSICAL" && entry.occurrence.physicalCardId === physicalCardId);
  if (physicalOccurrence?.kind !== "PHYSICAL") {
    throw new Error(`Missing physical role occurrence for ${physicalCardId}`);
  }
  const slot = draft.canonicalResourceRoleVector.find((candidate) =>
    candidate.canonicalRolePosition === physicalOccurrence.occurrence.canonicalRolePosition);
  if (slot === undefined) throw new Error(`Missing canonical role slot for ${physicalCardId}`);
  return slot;
}

function remainderCardFromComponent(
  admission: PhaseDSourceAdmissionSuccessV1,
  componentIndex: number,
): { admission: PhaseDSourceAdmissionSuccessV1; physicalCardId: string } {
  const component = admission.canonicalSourceBindingManifest.componentSources[componentIndex];
  if (component === undefined) throw new Error("Missing remainder normalization component");
  const route = component.routeArtifact.routeCandidates?.[0];
  if (route === undefined) throw new Error("Missing remainder normalization route");
  const physicalCardId = route.consumedResources[0];
  if (physicalCardId === undefined) throw new Error("Missing remainder normalization card");
  return {
    admission: {
      ...admission,
      canonicalSourceBindingManifest: {
        ...admission.canonicalSourceBindingManifest,
        componentSources: [{
          ...component,
          routeArtifact: {
            ...component.routeArtifact,
            routeCandidates: [{
              ...route,
              resourceClaims: [],
              consumedResources: [],
              endpointFacts: {
                ...route.endpointFacts,
                remainderPhysicalCardIds: [
                  ...route.endpointFacts.remainderPhysicalCardIds,
                  ...route.consumedResources,
                ],
              },
            }],
          },
        }],
      },
    },
    physicalCardId,
  };
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
