import { describe, expect, expectTypeOf, it } from "vitest";
import {
  HARD_MAX_COHORT_COUNT_V1,
  type NormalizedRouteCohortMemberDraftV1,
  type RouteCohortMemberEnvelopeV1,
  type StrategicCohortCompressionEvidenceBudgetV1,
  type StrategicCohortCompressionReasonCodeV1,
} from "../../../src/ai/d2h/strategicCohortCompressionV1Contracts";
import { compressHierarchicalStrategicCohortsV1 } from
  "../../../src/ai/d2h/strategicCohortCompressionV1";
import {
  makeCommonBindingMismatchFixture,
  makeCrossPairedC2EndpointFixture,
  makeDamagedEmptyRouteUniverseFixture,
  makeDuplicateComponentSourceFixture,
  makeDuplicateRouteIdentityConflictFixture,
  makeEmptyRouteUniverseFixture,
  makeExtraComponentSourceFixture,
  makeManifestHashMismatchFixture,
  makeMissingC2ComponentSourceFixture,
  makeMultiComponentHashMismatchFixture,
  makeReversedComponentSourceInput,
  makeValidPhaseDAdmissionInput,
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
});

function terminalArtifactOf(
  result: ReturnType<typeof compressHierarchicalStrategicCohortsV1>,
) {
  expect(result.admissionStatus).toBe("TERMINAL");
  if (result.admissionStatus !== "TERMINAL") throw new Error("Expected terminal admission artifact");
  return result.artifact;
}
