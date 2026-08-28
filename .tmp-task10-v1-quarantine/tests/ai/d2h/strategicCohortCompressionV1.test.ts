import { describe, expect, expectTypeOf, it } from "vitest";
import { canonicalHash } from "../../../src/ai/d2h/strategicEvidenceCanonicalSerializer";
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
