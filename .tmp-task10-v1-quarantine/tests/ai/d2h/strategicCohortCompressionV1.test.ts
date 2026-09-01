import { describe, expect, expectTypeOf, it } from "vitest";
import { canonicalHash, canonicalSerialize } from "../../../src/ai/d2h/strategicEvidenceCanonicalSerializer";
import {
  HARD_MAX_COHORT_COUNT_V1,
  type NormalizedRouteCohortMemberDraftV1,
  type PhaseDComponentSourceBindingV1,
  type PhaseDTask5InputV1,
  type PhaseDTask4ArtifactV1,
  type PhaseDSourceAdmissionSuccessV1,
  type RouteCohortMemberEnvelopeV1,
  type StrategicCohortCompressionEvidenceBudgetV1,
  type StrategicCohortCompressionReasonCodeV1,
  type StrategicCohortInterfaceV1,
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
import * as strategicCohortCompressionV1 from
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

type Task6TestMeasurementV1 = {
  dimension: string;
  limit: number;
  observedCount: number;
  measurementCompleteness: string;
};

type Task6TestSnapshotV1 = {
  budgetExecution: {
    measurements: readonly Task6TestMeasurementV1[];
    exhaustionProvenance: {
      exhaustedMeasurements: readonly Task6TestMeasurementV1[];
      sourceHashBindings: readonly { sourceKind: string; sourceHash: string }[];
      provenanceHash: string;
    } | null;
    executionHash: string;
  };
  exhaustedDimensions: readonly string[];
  reasonCodes: readonly string[];
  positiveCohortLowerBound: number | null;
};

type Task6TestAccumulatorV1 = {
  applyVerifiedEvent(
    incrementsByDimension: Readonly<Record<string, number>>,
    event: Readonly<Record<string, string | null>>,
  ): { terminal: boolean; snapshot: Task6TestSnapshotV1 | null };
  finalizeExactDimension(dimension: string): void;
  terminalSnapshot(): Task6TestSnapshotV1;
  completeSnapshot(): Task6TestSnapshotV1;
};

const task6AccumulatorForTest = (strategicCohortCompressionV1 as unknown as {
  __task6MeasurementAccumulatorForTest: (
    evidenceBudget: StrategicCohortCompressionEvidenceBudgetV1,
    sourceHashBindings?: readonly { sourceKind: string; sourceHash: string }[],
  ) => Task6TestAccumulatorV1;
}).__task6MeasurementAccumulatorForTest;

const task6TestBudget = (
  overrides: Partial<StrategicCohortCompressionEvidenceBudgetV1> = {},
): StrategicCohortCompressionEvidenceBudgetV1 => ({
  maxMemberEnvelopeCount: 10,
  maxResourceRoleSlotCount: 10,
  maxConflictClosureEdgeCount: 10,
  maxRouteMappingCount: 10,
  maxEquivalenceProofCount: 10,
  maxLineageOccurrenceWitnessCount: 10,
  ...overrides,
});

const task6TestEvent = (): Readonly<Record<string, string>> => ({
  stage: "STAGE_A_ROUTE",
  sourceRouteUniverseHash: "route-universe-hash",
  routeId: "route-id",
  routeHash: "route-hash",
});

const task6TestSourceBindings = [
  {
    sourceKind: "PHASE_D_SOURCE_BINDING_MANIFEST",
    sourceHash: "manifest-hash",
  },
  {
    sourceKind: "ROUTE_UNIVERSE",
    sourceHash: "route-universe-hash",
  },
] as const;

const TASK6_TEST_DIMENSION_ORDER = [
  "MEMBER_ENVELOPE_COUNT",
  "RESOURCE_ROLE_SLOT_COUNT",
  "CONFLICT_CLOSURE_EDGE_COUNT",
  "COHORT_COUNT",
  "ROUTE_MAPPING_COUNT",
  "EQUIVALENCE_PROOF_COUNT",
  "LINEAGE_OCCURRENCE_WITNESS_COUNT",
] as const;

describe("Task6.1 measurement accumulator", () => {
  it("Task6.1 keeps the fixed seven-dimension order and immutable cohort limit", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget());

    accumulator.applyVerifiedEvent({
      MEMBER_ENVELOPE_COUNT: 1,
      RESOURCE_ROLE_SLOT_COUNT: 1,
      CONFLICT_CLOSURE_EDGE_COUNT: 1,
      COHORT_COUNT: HARD_MAX_COHORT_COUNT_V1,
      ROUTE_MAPPING_COUNT: 1,
      EQUIVALENCE_PROOF_COUNT: 1,
      LINEAGE_OCCURRENCE_WITNESS_COUNT: 1,
    }, task6TestEvent());
    for (const dimension of TASK6_TEST_DIMENSION_ORDER) {
      accumulator.finalizeExactDimension(dimension);
    }

    const snapshot = accumulator.completeSnapshot();
    expect(snapshot.budgetExecution.measurements.map(({ dimension }) => dimension))
      .toEqual(TASK6_TEST_DIMENSION_ORDER);
    expect(snapshot.budgetExecution.measurements.find(({ dimension }) => dimension === "COHORT_COUNT"))
      .toMatchObject({ limit: HARD_MAX_COHORT_COUNT_V1, observedCount: 49 });
  });

  it("Task6.1 reports exact-at-limit without exhaustion", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget());

    accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 10 },
      task6TestEvent(),
    );
    accumulator.finalizeExactDimension("RESOURCE_ROLE_SLOT_COUNT");

    const snapshot = accumulator.terminalSnapshot();
    expect(snapshot.budgetExecution.measurements).toEqual([
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: 10,
        observedCount: 10,
        measurementCompleteness: "EXACT",
      },
    ]);
    expect(snapshot.exhaustedDimensions).toEqual([]);
    expect(snapshot.budgetExecution.exhaustionProvenance).toBeNull();
  });

  it("Task6.1 rejects an increment after exact finalization", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget());

    accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 5 },
      task6TestEvent(),
    );
    accumulator.finalizeExactDimension("RESOURCE_ROLE_SLOT_COUNT");
    const beforeRejectedIncrement = accumulator.terminalSnapshot();

    expect(() => accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 1 },
      task6TestEvent(),
    )).toThrow("Task6 finalized measurement cannot receive another increment");
    expect(accumulator.terminalSnapshot()).toEqual(beforeRejectedIncrement);
    expect(accumulator.terminalSnapshot().budgetExecution.measurements).toEqual([
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: 10,
        observedCount: 5,
        measurementCompleteness: "EXACT",
      },
    ]);
  });

  it("Task6.1 does not turn a finalized exact limit into exhaustion", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget());

    accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 10 },
      task6TestEvent(),
    );
    accumulator.finalizeExactDimension("RESOURCE_ROLE_SLOT_COUNT");

    expect(() => accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 1 },
      task6TestEvent(),
    )).toThrow("Task6 finalized measurement cannot receive another increment");
    expect(accumulator.terminalSnapshot().budgetExecution.measurements).toEqual([
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: 10,
        observedCount: 10,
        measurementCompleteness: "EXACT",
      },
    ]);
    expect(accumulator.terminalSnapshot().exhaustedDimensions).toEqual([]);
  });

  it("Task6.1 requires all seven exact finalizations for a complete snapshot", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget());

    for (const dimension of TASK6_TEST_DIMENSION_ORDER.slice(0, -1)) {
      accumulator.finalizeExactDimension(dimension);
    }

    expect(() => accumulator.completeSnapshot())
      .toThrow("Task6 complete snapshot requires seven exact measurements");
  });

  it("Task6.1 rejects exact finalization after exhaustion", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget({
      maxMemberEnvelopeCount: 1,
    }));

    accumulator.applyVerifiedEvent(
      { MEMBER_ENVELOPE_COUNT: 2 },
      task6TestEvent(),
    );

    expect(() => accumulator.finalizeExactDimension("RESOURCE_ROLE_SLOT_COUNT"))
      .toThrow("Task6 measurements cannot be finalized after exhaustion");
  });

  it("Task6.1 saturates one multi-unit event at limit plus one", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget());

    accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 8 },
      task6TestEvent(),
    );
    const result = accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 5 },
      task6TestEvent(),
    );

    expect(result.terminal).toBe(true);
    expect(result.snapshot?.budgetExecution.measurements).toEqual([
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: 10,
        observedCount: 11,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
    ]);
    expect(result.snapshot?.budgetExecution.measurements[0]?.observedCount)
      .not.toBe(13);
    expect(accumulator.applyVerifiedEvent(
      { RESOURCE_ROLE_SLOT_COUNT: 100 },
      task6TestEvent(),
    )).toEqual({ terminal: true, snapshot: result.snapshot });
  });

  it("Task6.1 records every dimension crossed by one atomic event", () => {
    const accumulator = task6AccumulatorForTest(task6TestBudget({
      maxMemberEnvelopeCount: 1,
      maxResourceRoleSlotCount: 3,
    }));

    const result = accumulator.applyVerifiedEvent({
      RESOURCE_ROLE_SLOT_COUNT: 5,
      MEMBER_ENVELOPE_COUNT: 2,
    }, task6TestEvent());

    expect(result.terminal).toBe(true);
    expect(result.snapshot?.exhaustedDimensions).toEqual([
      "MEMBER_ENVELOPE_COUNT",
      "RESOURCE_ROLE_SLOT_COUNT",
    ]);
    expect(result.snapshot?.reasonCodes).toEqual([
      "MEMBER_ENVELOPE_COUNT_EXHAUSTED",
      "RESOURCE_ROLE_SLOT_COUNT_EXHAUSTED",
    ]);
    expect(result.snapshot?.budgetExecution.measurements).toEqual([
      {
        dimension: "MEMBER_ENVELOPE_COUNT",
        limit: 1,
        observedCount: 2,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: 3,
        observedCount: 4,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
    ]);
  });

  it("Task6.1 publishes no exhaustion provenance on a complete snapshot", () => {
    const accumulator = task6AccumulatorForTest(
      task6TestBudget(),
      task6TestSourceBindings,
    );

    accumulator.applyVerifiedEvent({
      MEMBER_ENVELOPE_COUNT: 1,
      RESOURCE_ROLE_SLOT_COUNT: 1,
      CONFLICT_CLOSURE_EDGE_COUNT: 1,
      COHORT_COUNT: 1,
      ROUTE_MAPPING_COUNT: 1,
      EQUIVALENCE_PROOF_COUNT: 1,
      LINEAGE_OCCURRENCE_WITNESS_COUNT: 1,
    }, task6TestEvent());
    for (const dimension of TASK6_TEST_DIMENSION_ORDER) {
      accumulator.finalizeExactDimension(dimension);
    }

    const snapshot = accumulator.completeSnapshot();
    expect(snapshot.budgetExecution.measurements).toHaveLength(7);
    expect(snapshot.budgetExecution.measurements.every(
      ({ measurementCompleteness }) => measurementCompleteness === "EXACT",
    )).toBe(true);
    expect(snapshot.exhaustedDimensions).toEqual([]);
    expect(snapshot.reasonCodes).toEqual([]);
    expect(snapshot.budgetExecution.exhaustionProvenance).toBeNull();
    expect(snapshot.budgetExecution.executionHash).toBe(canonicalHash({
      measurements: snapshot.budgetExecution.measurements,
      exhaustionProvenance: null,
    }));
  });

  it("Task6.1 is deterministic for increment-object and source-binding order", () => {
    const first = task6AccumulatorForTest(
      task6TestBudget({
        maxMemberEnvelopeCount: 1,
        maxResourceRoleSlotCount: 1,
      }),
      task6TestSourceBindings,
    );
    const second = task6AccumulatorForTest(
      task6TestBudget({
        maxMemberEnvelopeCount: 1,
        maxResourceRoleSlotCount: 1,
      }),
      [...task6TestSourceBindings].reverse(),
    );

    const firstResult = first.applyVerifiedEvent({
      RESOURCE_ROLE_SLOT_COUNT: 2,
      MEMBER_ENVELOPE_COUNT: 2,
    }, task6TestEvent());
    const secondResult = second.applyVerifiedEvent({
      MEMBER_ENVELOPE_COUNT: 2,
      RESOURCE_ROLE_SLOT_COUNT: 2,
    }, task6TestEvent());

    expect(firstResult.snapshot?.budgetExecution.measurements)
      .toEqual(secondResult.snapshot?.budgetExecution.measurements);
    expect(firstResult.snapshot?.exhaustedDimensions)
      .toEqual(secondResult.snapshot?.exhaustedDimensions);
    expect(firstResult.snapshot?.reasonCodes)
      .toEqual(secondResult.snapshot?.reasonCodes);
    expect(firstResult.snapshot?.budgetExecution.exhaustionProvenance?.provenanceHash)
      .toBe(secondResult.snapshot?.budgetExecution.exhaustionProvenance?.provenanceHash);
    expect(firstResult.snapshot?.budgetExecution.executionHash)
      .toBe(secondResult.snapshot?.budgetExecution.executionHash);
  });
});

type Task6StageATestTamperV1 = (
  index: number,
  cohortInterface: StrategicCohortInterfaceV1,
) => StrategicCohortInterfaceV1;

type Task6StageATestSeamV1 = (
  input: PhaseDTask5InputV1,
  tamper: Task6StageATestTamperV1,
) => ReturnType<typeof materializePhaseDTask5V1>;

const task6StageAForTest = (strategicCohortCompressionV1 as unknown as {
  __task6StageAForTest?: Task6StageATestSeamV1;
}).__task6StageAForTest;

type Task6CohortAdmissionTestResultV1 = {
  status: string;
  budgetExecution: Task6TestSnapshotV1["budgetExecution"];
  exhaustedDimensions: readonly string[];
  reasonCodes: readonly string[];
  positiveCohortLowerBound: number | null;
};

type Task6CohortAdmissionTestSeamV1 = (
  cohortInterfaces: readonly StrategicCohortInterfaceV1[],
) => Task6CohortAdmissionTestResultV1;

const task6CohortAdmissionForTest = (strategicCohortCompressionV1 as unknown as {
  __task6CohortAdmissionForTest?: Task6CohortAdmissionTestSeamV1;
}).__task6CohortAdmissionForTest;

type Task6StageDTestSeamV1 = (
  input: PhaseDTask5InputV1,
) => {
  result: ReturnType<typeof materializePhaseDTask5V1>;
  constructedWitnessCount: number;
};

const task6StageDForTest = (strategicCohortCompressionV1 as unknown as {
  __task6StageDForTest?: Task6StageDTestSeamV1;
}).__task6StageDForTest;

type Task6RatioObservationTestSeamV1 = (
  inputRouteCount: number,
  compressionStatus: "COMPLETE" | "INCONCLUSIVE" | "REJECTED",
  positiveCohortLowerBound: number | null,
  budgetExhaustion: boolean,
  exactCompleteCohortCount?: number,
) => {
  inputRouteCount: number;
  observedCohortCount: number;
  ratioNumerator: number;
  ratioDenominator: number | null;
  cohortCountCompleteness: string | null;
  ratioInterpretation: string;
};

const task6RatioObservationForTest = (strategicCohortCompressionV1 as unknown as {
  __task6RatioObservationForTest?: Task6RatioObservationTestSeamV1;
}).__task6RatioObservationForTest;

describe("Task6.2 Stage-A materialization accounting", () => {
  it("Task6.2 counts all four Stage-A dimensions from one verified route event", () => {
    const { result } = materializeTask5WithBudget(makeValidPhaseDAdmissionInput(), phaseDTask5Budget());
    expect(result.compressionStatus).toBe("COMPLETE");
    if (result.memberEnvelopes === null) throw new Error("Expected verified member envelopes");

    const expectedMemberCount = result.memberEnvelopes.length;
    const expectedSlotCount = result.memberEnvelopes.reduce((total, envelope) =>
      total + envelope.resourceInterface.canonicalRoleSlots.length, 0);
    const expectedClosureEdgeCount = result.memberEnvelopes.reduce((total, envelope) =>
      total + envelope.routeRelevantConflictClosure.traversedReferenceEdges.length, 0);
    const expectedCohortCount = new Set((result.cohortInterfaces ?? []).map((cohortInterface) =>
      canonicalSerialize(cohortInterface.fourSignatureHashes))).size;

    expect(result.budgetExecution.measurements.slice(0, 4)).toEqual([
      {
        dimension: "MEMBER_ENVELOPE_COUNT",
        limit: phaseDTask5Budget().maxMemberEnvelopeCount,
        observedCount: expectedMemberCount,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: phaseDTask5Budget().maxResourceRoleSlotCount,
        observedCount: expectedSlotCount,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "CONFLICT_CLOSURE_EDGE_COUNT",
        limit: phaseDTask5Budget().maxConflictClosureEdgeCount,
        observedCount: expectedClosureEdgeCount,
        measurementCompleteness: "EXACT",
      },
      {
        dimension: "COHORT_COUNT",
        limit: HARD_MAX_COHORT_COUNT_V1,
        observedCount: expectedCohortCount,
        measurementCompleteness: "EXACT",
      },
    ]);

    const reversed = materializeTask5WithBudget(
      makeReversedComponentSourceInput(makeValidPhaseDAdmissionInput()),
      phaseDTask5Budget(),
    ).result;
    expect(reversed.budgetExecution).toEqual(result.budgetExecution);
    expect(reversed.budgetExecution.executionHash).toBe(result.budgetExecution.executionHash);
  });

  it("Task6.2 records simultaneous Stage-A exhaustion before terminal publication", () => {
    const sourceInput = makeValidPhaseDAdmissionInput();
    const baseline = materializeTask5WithBudget(sourceInput, phaseDTask5Budget()).result;
    expect(baseline.compressionStatus).toBe("COMPLETE");
    if (baseline.memberEnvelopes === null || baseline.memberEnvelopes.length < 2) {
      throw new Error("Expected at least two verified routes");
    }
    const ordered = [...baseline.memberEnvelopes].sort(compareTask6StageAEnvelope);
    const first = ordered[0]!;
    const budget = phaseDTask5Budget({
      maxMemberEnvelopeCount: 1,
      maxResourceRoleSlotCount: first.resourceInterface.canonicalRoleSlots.length,
    });
    const { result } = materializeTask5WithBudget(sourceInput, budget);

    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(result.exhaustedDimensions).toEqual([
      "MEMBER_ENVELOPE_COUNT",
      "RESOURCE_ROLE_SLOT_COUNT",
    ]);
    expect(result.reasonCodes).toEqual([
      "MEMBER_ENVELOPE_COUNT_EXHAUSTED",
      "RESOURCE_ROLE_SLOT_COUNT_EXHAUSTED",
    ]);
    expect(result.budgetExecution.measurements).toEqual([
      {
        dimension: "MEMBER_ENVELOPE_COUNT",
        limit: 1,
        observedCount: 2,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: first.resourceInterface.canonicalRoleSlots.length,
        observedCount: first.resourceInterface.canonicalRoleSlots.length + 1,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
    ]);
    expect(result.cohorts).toBeNull();
    expect(result.cohortInterfaces).toBeNull();
    expect(result.routeToCohortMappings).toBeNull();
    expect(result.memberEnvelopes).toBeNull();
    expect(result.equivalenceProofs).toBeNull();
    expect(result.coverageManifest).toBeNull();
    expect(result.cohortCount).toBe(0);
    expect(result.cohortUniverseHash).toBeNull();

    const reversed = materializeTask5WithBudget(
      makeReversedComponentSourceInput(sourceInput),
      budget,
    ).result;
    expect(reversed.compressionStatus).toBe("INCONCLUSIVE");
    expect(reversed.budgetExecution).toEqual(result.budgetExecution);
    expect(reversed.exhaustedDimensions).toEqual(result.exhaustedDimensions);
    expect(reversed.reasonCodes).toEqual(result.reasonCodes);
  });

  it("Task6.2 uses distinct canonical four-part cohort keys", () => {
    const { result } = materializeTask5WithBudget(makeSameRankDifferentCopyPhaseDAdmissionInput(), phaseDTask5Budget());
    expect(result.compressionStatus).toBe("COMPLETE");
    expect(result.memberEnvelopes).toHaveLength(2);
    expect(result.cohortCount).toBe(1);
    expect(result.budgetExecution.measurements).toContainEqual({
      dimension: "MEMBER_ENVELOPE_COUNT",
      limit: phaseDTask5Budget().maxMemberEnvelopeCount,
      observedCount: 2,
      measurementCompleteness: "EXACT",
    });
    expect(result.budgetExecution.measurements).toContainEqual({
      dimension: "COHORT_COUNT",
      limit: HARD_MAX_COHORT_COUNT_V1,
      observedCount: 1,
      measurementCompleteness: "EXACT",
    });
  });

  it("Task6.2 preserves the 49 and 50 cohort hard-gate observations", () => {
    const completeKeys = Array.from({ length: 49 }, (_, ordinal) => canonicalHash({
      kind: "task6-stage-a-cohort-fixture",
      ordinal,
    }));
    const exhaustedKeys = [...completeKeys, canonicalHash({
      kind: "task6-stage-a-cohort-fixture",
      ordinal: 49,
    })];
    expect(__task5PostDerivationHardGateV1(completeKeys).gate).toMatchObject({
      gateStatus: "COMPLETE",
      distinctCohortCount: 49,
      observedDistinctCohortLowerBound: 49,
      exhausted: false,
    });
    expect(__task5PostDerivationHardGateV1(exhaustedKeys).gate).toMatchObject({
      gateStatus: "INCONCLUSIVE",
      observedDistinctCohortLowerBound: 50,
      exhausted: true,
    });

    const completeAccumulator = task6AccumulatorForTest(task6TestBudget());
    for (const key of completeKeys) {
      completeAccumulator.applyVerifiedEvent({ COHORT_COUNT: 1 }, {
        ...task6TestEvent(),
        routeHash: key,
      });
    }
    completeAccumulator.finalizeExactDimension("COHORT_COUNT");
    expect(completeAccumulator.terminalSnapshot().budgetExecution.measurements).toContainEqual({
      dimension: "COHORT_COUNT",
      limit: HARD_MAX_COHORT_COUNT_V1,
      observedCount: 49,
      measurementCompleteness: "EXACT",
    });

    const exhaustedAccumulator = task6AccumulatorForTest(task6TestBudget());
    for (const key of completeKeys) {
      exhaustedAccumulator.applyVerifiedEvent({ COHORT_COUNT: 1 }, {
        ...task6TestEvent(),
        routeHash: key,
      });
    }
    const terminal = exhaustedAccumulator.applyVerifiedEvent({ COHORT_COUNT: 1 }, {
      ...task6TestEvent(),
      routeHash: exhaustedKeys[exhaustedKeys.length - 1]!,
    });
    expect(terminal.snapshot?.budgetExecution.measurements).toContainEqual({
      dimension: "COHORT_COUNT",
      limit: HARD_MAX_COHORT_COUNT_V1,
      observedCount: 50,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });

    const materialized = materializeTask5WithBudget(makeValidPhaseDAdmissionInput(), phaseDTask5Budget()).result;
    const materializedCohortMeasurement = materialized.budgetExecution.measurements
      .find(({ dimension }) => dimension === "COHORT_COUNT");
    const materializedGate = __task5PostDerivationHardGateV1(
      (materialized.cohortInterfaces ?? []).map((cohortInterface) => cohortInterface.cohortInterfaceHash),
    ).gate;
    expect(materializedGate.distinctCohortCount).toBe(materialized.cohortCount);
    expect(materializedCohortMeasurement).toMatchObject({
      observedCount: materialized.cohortCount,
      measurementCompleteness: "EXACT",
    });
  });

  it("Task6.2 does not count an unverified member envelope", () => {
    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.routeRelevantConflictClosures === null) {
      throw new Error("Expected complete Task 4 evidence");
    }
    const originalClosure = task4.routeRelevantConflictClosures[0]!;
    const { closureHash: _closureHash, ...originalClosurePayload } = originalClosure;
    const closurePayload = {
      ...originalClosurePayload,
      conflictFactIds: [...originalClosure.conflictFactIds, "missing-conflict-reference"].sort(),
    };
    const forgedClosure = {
      ...closurePayload,
      closureHash: canonicalHash(closurePayload),
    };
    const forgedTask4Payload = {
      ...task4,
      routeRelevantConflictClosures: [forgedClosure, ...task4.routeRelevantConflictClosures.slice(1)],
    };
    const { artifactHash: _artifactHash, ...forgedTask4WithoutHash } = forgedTask4Payload;
    const forgedTask4 = {
      ...forgedTask4WithoutHash,
      artifactHash: canonicalHash({
        ...forgedTask4WithoutHash,
        routeRelevantConflictClosures: [...forgedTask4WithoutHash.routeRelevantConflictClosures]
          .sort((left, right) => compareTask6Text(canonicalSerialize(left), canonicalSerialize(right))),
      }),
    };
    const result = materializePhaseDTask5V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
      task4: forgedTask4,
      evidenceBudget: phaseDTask5Budget({ maxMemberEnvelopeCount: 1 }),
    });

    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("INCOMPLETE_CONFLICT_CLOSURE");
    expect(result.budgetExecution.measurements).toEqual([]);
    expect(result.memberEnvelopes).toBeNull();
  });

  it("Task6.2 rejects a cohort hash payload contradiction before Stage-A budget counting", () => {
    if (task6StageAForTest === undefined) {
      throw new Error("Task6.2 missing __task6StageAForTest seam");
    }
    const { input } = task5InputOf(makeSameRankDifferentCopyPhaseDAdmissionInput(), {
      maxMemberEnvelopeCount: 1,
    });
    const result = task6StageAForTest(input, (index, cohortInterface) => index === 1
      ? {
        ...cohortInterface,
        endpointInterface: {
          ...cohortInterface.endpointInterface,
          endpointArity: cohortInterface.endpointInterface.endpointArity + 1,
        },
      }
      : cohortInterface);

    expect(result.compressionStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SIGNATURE_HASH_PAYLOAD_CONFLICT");
    expect(result.reasonCodes.some((reason) => reason.endsWith("_EXHAUSTED"))).toBe(false);
    expect(result.budgetExecution.measurements).toEqual([]);
    expect(result.compressionRatioObservation.ratioDenominator).toBeNull();
    expect(result.compressionRatioObservation.ratioInterpretation).toBe("UNAVAILABLE");
  });

  it("Task6.2 enforces the independent member-envelope boundary", () => {
    const sourceInput = makeValidPhaseDAdmissionInput();
    const baseline = materializeTask5WithBudget(sourceInput, phaseDTask5Budget()).result;
    const totals = stageATotalsOf(baseline);
    expect(totals.memberEnvelopeCount).toBeGreaterThan(1);

    const exact = materializeTask5WithBudget(sourceInput, stageABudgetAboveTotals(totals, {
      maxMemberEnvelopeCount: totals.memberEnvelopeCount,
    })).result;
    expect(exact.compressionStatus).toBe("COMPLETE");
    expect(exact.exhaustedDimensions).toEqual([]);
    expect(stageAMeasurementOf(exact, "MEMBER_ENVELOPE_COUNT")).toEqual({
      dimension: "MEMBER_ENVELOPE_COUNT",
      limit: totals.memberEnvelopeCount,
      observedCount: totals.memberEnvelopeCount,
      measurementCompleteness: "EXACT",
    });

    const exhausted = materializeTask5WithBudget(sourceInput, stageABudgetAboveTotals(totals, {
      maxMemberEnvelopeCount: totals.memberEnvelopeCount - 1,
    })).result;
    expect(exhausted.compressionStatus).toBe("INCONCLUSIVE");
    expect(exhausted.exhaustedDimensions).toEqual(["MEMBER_ENVELOPE_COUNT"]);
    expect(exhausted.reasonCodes).toEqual(["MEMBER_ENVELOPE_COUNT_EXHAUSTED"]);
    expect(stageAMeasurementOf(exhausted, "MEMBER_ENVELOPE_COUNT")).toEqual({
      dimension: "MEMBER_ENVELOPE_COUNT",
      limit: totals.memberEnvelopeCount - 1,
      observedCount: totals.memberEnvelopeCount,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expectTask6StageATerminalPayload(exhausted);
  });

  it("Task6.2 enforces the independent resource-role-slot boundary", () => {
    const sourceInput = makeValidPhaseDAdmissionInput();
    const baseline = materializeTask5WithBudget(sourceInput, phaseDTask5Budget()).result;
    const totals = stageATotalsOf(baseline);
    expect(totals.resourceRoleSlotCount).toBeGreaterThan(1);

    const exact = materializeTask5WithBudget(sourceInput, stageABudgetAboveTotals(totals, {
      maxResourceRoleSlotCount: totals.resourceRoleSlotCount,
    })).result;
    expect(exact.compressionStatus).toBe("COMPLETE");
    expect(exact.exhaustedDimensions).toEqual([]);
    expect(stageAMeasurementOf(exact, "RESOURCE_ROLE_SLOT_COUNT")).toEqual({
      dimension: "RESOURCE_ROLE_SLOT_COUNT",
      limit: totals.resourceRoleSlotCount,
      observedCount: totals.resourceRoleSlotCount,
      measurementCompleteness: "EXACT",
    });

    const exhausted = materializeTask5WithBudget(sourceInput, stageABudgetAboveTotals(totals, {
      maxResourceRoleSlotCount: totals.resourceRoleSlotCount - 1,
    })).result;
    expect(exhausted.compressionStatus).toBe("INCONCLUSIVE");
    expect(exhausted.exhaustedDimensions).toEqual(["RESOURCE_ROLE_SLOT_COUNT"]);
    expect(exhausted.reasonCodes).toEqual(["RESOURCE_ROLE_SLOT_COUNT_EXHAUSTED"]);
    expect(stageAMeasurementOf(exhausted, "RESOURCE_ROLE_SLOT_COUNT")).toEqual({
      dimension: "RESOURCE_ROLE_SLOT_COUNT",
      limit: totals.resourceRoleSlotCount - 1,
      observedCount: totals.resourceRoleSlotCount,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expectTask6StageATerminalPayload(exhausted);
  });

  it("Task6.2 enforces the independent conflict-closure-edge boundary", () => {
    const sourceInput = makeValidPhaseDAdmissionInput();
    const baseline = materializeTask5WithBudget(sourceInput, phaseDTask5Budget()).result;
    const totals = stageATotalsOf(baseline);
    expect(totals.conflictClosureEdgeCount).toBeGreaterThan(1);

    const exact = materializeTask5WithBudget(sourceInput, stageABudgetAboveTotals(totals, {
      maxConflictClosureEdgeCount: totals.conflictClosureEdgeCount,
    })).result;
    expect(exact.compressionStatus).toBe("COMPLETE");
    expect(exact.exhaustedDimensions).toEqual([]);
    expect(stageAMeasurementOf(exact, "CONFLICT_CLOSURE_EDGE_COUNT")).toEqual({
      dimension: "CONFLICT_CLOSURE_EDGE_COUNT",
      limit: totals.conflictClosureEdgeCount,
      observedCount: totals.conflictClosureEdgeCount,
      measurementCompleteness: "EXACT",
    });

    const exhausted = materializeTask5WithBudget(sourceInput, stageABudgetAboveTotals(totals, {
      maxConflictClosureEdgeCount: totals.conflictClosureEdgeCount - 1,
    })).result;
    expect(exhausted.compressionStatus).toBe("INCONCLUSIVE");
    expect(exhausted.exhaustedDimensions).toEqual(["CONFLICT_CLOSURE_EDGE_COUNT"]);
    expect(exhausted.reasonCodes).toEqual(["CONFLICT_CLOSURE_EDGE_COUNT_EXHAUSTED"]);
    expect(stageAMeasurementOf(exhausted, "CONFLICT_CLOSURE_EDGE_COUNT")).toEqual({
      dimension: "CONFLICT_CLOSURE_EDGE_COUNT",
      limit: totals.conflictClosureEdgeCount - 1,
      observedCount: totals.conflictClosureEdgeCount,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expectTask6StageATerminalPayload(exhausted);
  });

  it("Task6.2 preserves Stage-A measurements under draft and closure permutation", () => {
    const sourceInput = makeValidPhaseDAdmissionInput();
    const prepared = task5InputOf(sourceInput);
    const baseline = prepared.result;
    const totals = stageATotalsOf(baseline);
    const budget = stageABudgetAboveTotals(totals, {
      maxMemberEnvelopeCount: totals.memberEnvelopeCount - 1,
    });
    const canonical = materializePhaseDTask5V1({ ...prepared.input, evidenceBudget: budget });
    const permutedTask4 = task4WithReversedClosures(prepared.input.task4);
    const permuted = materializePhaseDTask5V1({
      ...prepared.input,
      normalizedMemberDrafts: [...prepared.input.normalizedMemberDrafts].reverse(),
      task4: permutedTask4,
      evidenceBudget: budget,
    });

    expect(permuted.compressionStatus).toBe(canonical.compressionStatus);
    expect(permuted.budgetExecution).toEqual(canonical.budgetExecution);
    expect(permuted.exhaustedDimensions).toEqual(canonical.exhaustedDimensions);
    expect(permuted.reasonCodes).toEqual(canonical.reasonCodes);
    expect(permuted.budgetExecution.exhaustionProvenance?.provenanceHash)
      .toBe(canonical.budgetExecution.exhaustionProvenance?.provenanceHash);
    expect(permuted.budgetExecution.executionHash).toBe(canonical.budgetExecution.executionHash);
  });

  it("Task6.2 integrates the Stage-A 49 and 50 verified cohort boundaries", () => {
    if (task6CohortAdmissionForTest === undefined) {
      throw new Error("Task6.2 missing __task6CohortAdmissionForTest seam");
    }
    const baseline = materializeTask5WithBudget(makeValidPhaseDAdmissionInput(), phaseDTask5Budget()).result;
    if (baseline.compressionStatus !== "COMPLETE" || baseline.cohortInterfaces === null) {
      throw new Error("Expected a real verified cohort interface");
    }
    const baseInterface = baseline.cohortInterfaces[0];
    if (baseInterface === undefined) throw new Error("Expected a real cohort interface");
    const interfaces = Array.from({ length: 50 }, (_, ordinal) =>
      task6CohortVariantOf(baseInterface, ordinal));

    const complete = task6CohortAdmissionForTest(interfaces.slice(0, 49));
    expect(complete.status).toBe("COMPLETE");
    expect(complete.exhaustedDimensions).toEqual([]);
    expect(complete.reasonCodes).toEqual([]);
    expect(complete.budgetExecution.measurements).toContainEqual({
      dimension: "COHORT_COUNT",
      limit: HARD_MAX_COHORT_COUNT_V1,
      observedCount: 49,
      measurementCompleteness: "EXACT",
    });

    const terminal = task6CohortAdmissionForTest(interfaces);
    expect(terminal.status).toBe("INCONCLUSIVE");
    expect(terminal.exhaustedDimensions).toEqual(["COHORT_COUNT"]);
    expect(terminal.reasonCodes).toEqual(["COHORT_COUNT_EXHAUSTED"]);
    expect(terminal.budgetExecution.measurements).toContainEqual({
      dimension: "COHORT_COUNT",
      limit: HARD_MAX_COHORT_COUNT_V1,
      observedCount: 50,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
  });
});

describe("Task6.3 mappings, proofs, and coverage accounting", () => {
  it("Task6.3 counts mappings in canonical mapping order", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE"
      || baseline.routeToCohortMappings === null) throw new Error("Expected complete mapping baseline");
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    const result = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, { maxRouteMappingCount: mappingCount }),
    });

    expect(result.compressionStatus).toBe("COMPLETE");
    if (result.routeToCohortMappings === null) throw new Error("Expected complete mappings");
    expect(result.routeToCohortMappings).toEqual([...result.routeToCohortMappings].sort((left, right) =>
      compareTask6Text(left.routeId, right.routeId) || compareTask6Text(left.routeHash, right.routeHash)));
    expect(result.budgetExecution.measurements.map(({ dimension }) => dimension))
      .toEqual(TASK6_TEST_DIMENSION_ORDER);
    expect(stageAMeasurementOf(result, "ROUTE_MAPPING_COUNT")).toEqual({
      dimension: "ROUTE_MAPPING_COUNT",
      limit: mappingCount,
      observedCount: mappingCount,
      measurementCompleteness: "EXACT",
    });
    expect(result.budgetExecution.measurements.every(({ measurementCompleteness }) =>
      measurementCompleteness === "EXACT")).toBe(true);
    expect(result.budgetExecution.exhaustionProvenance).toBeNull();
    expect(result.exhaustedDimensions).toEqual([]);
  });

  it("Task6.3 counts proofs only after their mappings are complete", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE"
      || baseline.routeToCohortMappings === null
      || baseline.equivalenceProofs === null) throw new Error("Expected complete proof baseline");
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    const proofCount = baseline.equivalenceProofs.length;
    const result = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, {
        maxRouteMappingCount: mappingCount,
        maxEquivalenceProofCount: proofCount,
      }),
    });

    expect(result.compressionStatus).toBe("COMPLETE");
    expect(stageAMeasurementOf(result, "ROUTE_MAPPING_COUNT")).toMatchObject({
      observedCount: mappingCount,
      measurementCompleteness: "EXACT",
    });
    expect(stageAMeasurementOf(result, "EQUIVALENCE_PROOF_COUNT")).toEqual({
      dimension: "EQUIVALENCE_PROOF_COUNT",
      limit: proofCount,
      observedCount: proofCount,
      measurementCompleteness: "EXACT",
    });
    expect(result.equivalenceProofs).toHaveLength(proofCount);
  });

  it("Task6.3 counts one witness per actual coverage occurrence", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE" || baseline.coverageManifest === null) {
      throw new Error("Expected complete coverage baseline");
    }
    const totals = stageATotalsOf(baseline);
    const witnessCount = coverageWitnessTotalOf(prepared.input);
    expect(witnessCount).toBe(baseline.coverageManifest.coverageWitnesses.length);
    const result = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, {
        maxLineageOccurrenceWitnessCount: witnessCount,
      }),
    });

    expect(result.compressionStatus).toBe("COMPLETE");
    if (result.coverageManifest === null) throw new Error("Expected complete coverage");
    expect(result.coverageManifest.coverageWitnesses).toHaveLength(witnessCount);
    expect(stageAMeasurementOf(result, "LINEAGE_OCCURRENCE_WITNESS_COUNT")).toEqual({
      dimension: "LINEAGE_OCCURRENCE_WITNESS_COUNT",
      limit: witnessCount,
      observedCount: witnessCount,
      measurementCompleteness: "EXACT",
    });
  });

  it("Task6.3 stops Stage-D witness materialization at limit plus one", () => {
    if (task6StageDForTest === undefined) {
      throw new Error("Task6.3 missing __task6StageDForTest seam");
    }
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE") throw new Error("Expected complete Stage-D baseline");
    const witnessCount = coverageWitnessTotalOf(prepared.input);
    expect(witnessCount).toBeGreaterThan(3);
    const observed = task6StageDForTest({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(stageATotalsOf(baseline), {
        maxLineageOccurrenceWitnessCount: 2,
      }),
    });
    expect(observed.result.compressionStatus).toBe("INCONCLUSIVE");
    expect(stageAMeasurementOf(observed.result, "LINEAGE_OCCURRENCE_WITNESS_COUNT")).toEqual({
      dimension: "LINEAGE_OCCURRENCE_WITNESS_COUNT",
      limit: 2,
      observedCount: 3,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expect(observed.constructedWitnessCount).toBe(3);
  });

  it("Task6.3 reports mapping, proof, and witness limit plus one without partial payload", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE"
      || baseline.routeToCohortMappings === null
      || baseline.equivalenceProofs === null
      || baseline.coverageManifest === null) throw new Error("Expected complete Task6.3 baseline");
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    const proofCount = baseline.equivalenceProofs.length;
    const witnessCount = coverageWitnessTotalOf(prepared.input);
    expect(mappingCount).toBeGreaterThan(1);
    expect(proofCount).toBeGreaterThan(1);
    expect(witnessCount).toBeGreaterThan(1);

    const mappingTerminal = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, { maxRouteMappingCount: mappingCount - 1 }),
    });
    expect(mappingTerminal.compressionStatus).toBe("INCONCLUSIVE");
    expect(mappingTerminal.exhaustedDimensions).toEqual(["ROUTE_MAPPING_COUNT"]);
    expect(mappingTerminal.budgetExecution.measurements.map(({ dimension }) => dimension))
      .toEqual(TASK6_TEST_DIMENSION_ORDER.slice(0, 5));
    expect(stageAMeasurementOf(mappingTerminal, "ROUTE_MAPPING_COUNT")).toEqual({
      dimension: "ROUTE_MAPPING_COUNT",
      limit: mappingCount - 1,
      observedCount: mappingCount,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expectTask6StageATerminalPayload(mappingTerminal);

    const proofTerminal = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, {
        maxRouteMappingCount: mappingCount,
        maxEquivalenceProofCount: proofCount - 1,
      }),
    });
    expect(proofTerminal.compressionStatus).toBe("INCONCLUSIVE");
    expect(proofTerminal.exhaustedDimensions).toEqual(["EQUIVALENCE_PROOF_COUNT"]);
    expect(proofTerminal.budgetExecution.measurements.map(({ dimension }) => dimension))
      .toEqual(TASK6_TEST_DIMENSION_ORDER.slice(0, 6));
    expect(stageAMeasurementOf(proofTerminal, "ROUTE_MAPPING_COUNT")).toMatchObject({
      observedCount: mappingCount,
      measurementCompleteness: "EXACT",
    });
    expect(stageAMeasurementOf(proofTerminal, "EQUIVALENCE_PROOF_COUNT")).toEqual({
      dimension: "EQUIVALENCE_PROOF_COUNT",
      limit: proofCount - 1,
      observedCount: proofCount,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expectTask6StageATerminalPayload(proofTerminal);

    const witnessTerminal = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, {
        maxRouteMappingCount: mappingCount,
        maxEquivalenceProofCount: proofCount,
        maxLineageOccurrenceWitnessCount: witnessCount - 1,
      }),
    });
    expect(witnessTerminal.compressionStatus).toBe("INCONCLUSIVE");
    expect(witnessTerminal.exhaustedDimensions).toEqual(["LINEAGE_OCCURRENCE_WITNESS_COUNT"]);
    expect(witnessTerminal.budgetExecution.measurements.map(({ dimension }) => dimension))
      .toEqual(TASK6_TEST_DIMENSION_ORDER);
    expect(stageAMeasurementOf(witnessTerminal, "EQUIVALENCE_PROOF_COUNT")).toMatchObject({
      observedCount: proofCount,
      measurementCompleteness: "EXACT",
    });
    expect(stageAMeasurementOf(witnessTerminal, "LINEAGE_OCCURRENCE_WITNESS_COUNT")).toEqual({
      dimension: "LINEAGE_OCCURRENCE_WITNESS_COUNT",
      limit: witnessCount - 1,
      observedCount: witnessCount,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expectTask6StageATerminalPayload(witnessTerminal);
  });

  it("Task6.3 gives missing mapping evidence precedence over later proof counting", () => {
    const evidence = publicationEvidenceOf();
    const missingMapping = __validateTask5PublicationForTest(
      evidence.envelopes,
      evidence.mappings.slice(1),
      evidence.proofs,
      evidence.cohortInterfaces,
    );
    expect(missingMapping).toEqual({ status: "INCONCLUSIVE", reason: "INCOMPLETE_ROUTE_MAPPING" });

    const admission = admittedOf(makeValidPhaseDAdmissionInput());
    const normalized = normalizedOf(admission);
    const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
    if (task4.task4Status !== "COMPLETE" || task4.occurrenceUniverse === null) {
      throw new Error("Expected complete Task 4 evidence");
    }
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
    const result = materializePhaseDTask5V1({
      admission,
      normalizedMemberDrafts: normalized.normalizedMemberDrafts,
      task4: forgedTask4,
      evidenceBudget: phaseDTask5Budget(),
    });
    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("INCOMPLETE_LINEAGE_COVERAGE");
    expect(result.budgetExecution.measurements).toEqual([]);
    expect(result.equivalenceProofs).toBeNull();
    expect(result.coverageManifest).toBeNull();
  });

  it("Task6.3 does not replace coverage evidence with a count-only shortcut", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE" || baseline.coverageManifest === null) {
      throw new Error("Expected complete coverage baseline");
    }
    const totals = stageATotalsOf(baseline);
    const witnessCount = coverageWitnessTotalOf(prepared.input);
    expect(baseline.coverageManifest.coverageWitnesses.length).toBe(witnessCount);
    const result = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals),
    });
    expect(result.compressionStatus).toBe("COMPLETE");
    expect(result.coverageManifest?.coverageWitnesses.length).toBe(witnessCount);
    expect(stageAMeasurementOf(result, "LINEAGE_OCCURRENCE_WITNESS_COUNT").observedCount)
      .toBe(result.coverageManifest?.coverageWitnesses.length);
  });

  it("Task6.3 preserves seven-dimensional terminal output under ordering permutation", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE" || baseline.routeToCohortMappings === null) {
      throw new Error("Expected complete ordering baseline");
    }
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    expect(mappingCount).toBeGreaterThan(1);
    const budget = stageABudgetAboveTotals(totals, { maxRouteMappingCount: mappingCount - 1 });
    const canonical = materializePhaseDTask5V1({ ...prepared.input, evidenceBudget: budget });
    const permuted = materializePhaseDTask5V1({
      ...prepared.input,
      normalizedMemberDrafts: [...prepared.input.normalizedMemberDrafts].reverse(),
      task4: task4WithReversedClosures(prepared.input.task4),
      evidenceBudget: budget,
    });

    expect(permuted.compressionStatus).toBe(canonical.compressionStatus);
    expect(permuted.budgetExecution).toEqual(canonical.budgetExecution);
    expect(permuted.exhaustedDimensions).toEqual(canonical.exhaustedDimensions);
    expect(permuted.reasonCodes).toEqual(canonical.reasonCodes);
    expect(permuted.budgetExecution.exhaustionProvenance?.provenanceHash)
      .toBe(canonical.budgetExecution.exhaustionProvenance?.provenanceHash);
    expect(permuted.budgetExecution.executionHash).toBe(canonical.budgetExecution.executionHash);
  });

  it("Task6.3 preserves Task5 substantive payloads with generous budgets", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE") throw new Error("Expected complete Task5 baseline");
    const generous = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(stageATotalsOf(baseline)),
    });
    expect(generous.compressionStatus).toBe("COMPLETE");
    expect(task5SubstantivePayloadOf(generous)).toEqual(task5SubstantivePayloadOf(baseline));
  });
});

describe("Task6.4 budget execution and ratio publication", () => {
  it("Task6.4 COMPLETE contains seven exact measurements and null exhaustion provenance", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const result = prepared.result;

    expect(result.compressionStatus).toBe("COMPLETE");
    expect(result.budgetExecution.measurements).toHaveLength(7);
    expect(result.budgetExecution.measurements.map(({ dimension }) => dimension))
      .toEqual(TASK6_TEST_DIMENSION_ORDER);
    expect(result.budgetExecution.measurements.every(({ measurementCompleteness }) =>
      measurementCompleteness === "EXACT")).toBe(true);
    expect(result.budgetExecution.exhaustionProvenance).toBeNull();
    expect(result.exhaustedDimensions).toEqual([]);
    expect(result.reasonCodes).toEqual([]);
  });

  it("Task6.4 uses an exact cohort denominator on COMPLETE", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const result = prepared.result;
    expect(result.compressionStatus).toBe("COMPLETE");
    expect(result.cohortCount).toBeGreaterThan(0);

    expect(result.compressionRatioObservation).toEqual({
      inputRouteCount: prepared.input.admission.inputRouteCount,
      observedCohortCount: result.cohortCount,
      ratioNumerator: prepared.input.admission.inputRouteCount,
      ratioDenominator: result.cohortCount,
      cohortCountCompleteness: "EXACT",
      ratioInterpretation: "EXACT",
    });
  });

  it("Task6.4 uses lower-bound ratio completeness for the 50th-cohort Stage-A exhaustion", () => {
    if (task6CohortAdmissionForTest === undefined || task6RatioObservationForTest === undefined) {
      throw new Error("Task6.4 missing verified cohort admission or ratio seam");
    }
    const baseline = materializeTask5WithBudget(makeValidPhaseDAdmissionInput(), phaseDTask5Budget()).result;
    if (baseline.compressionStatus !== "COMPLETE" || baseline.cohortInterfaces === null) {
      throw new Error("Expected a real verified cohort interface");
    }
    const baseInterface = baseline.cohortInterfaces[0];
    if (baseInterface === undefined) throw new Error("Expected a real cohort interface");
    const interfaces = Array.from({ length: 50 }, (_, ordinal) =>
      task6CohortVariantOf(baseInterface, ordinal));
    const terminal = task6CohortAdmissionForTest(interfaces);
    const cohortMeasurement = terminal.budgetExecution.measurements.find(({ dimension }) =>
      dimension === "COHORT_COUNT");
    if (cohortMeasurement === undefined) throw new Error("Expected exhausted cohort measurement");

    expect(cohortMeasurement).toEqual({
      dimension: "COHORT_COUNT",
      limit: HARD_MAX_COHORT_COUNT_V1,
      observedCount: 50,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
    expect(terminal.status).toBe("INCONCLUSIVE");
    expect(terminal.positiveCohortLowerBound).toBe(50);
    expect(task6RatioObservationForTest(
      73,
      "INCONCLUSIVE",
      terminal.positiveCohortLowerBound,
      true,
    )).toEqual({
      inputRouteCount: 73,
      observedCohortCount: 50,
      ratioNumerator: 73,
      ratioDenominator: 50,
      cohortCountCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      ratioInterpretation: "UPPER_BOUND_FROM_COHORT_LOWER_BOUND",
    });
  });

  it("Task6.4 uses a proven cohort lower bound on Stage-A non-cohort exhaustion", () => {
    const prepared = task5InputOf(makeSameRankDifferentCopyPhaseDAdmissionInput());
    const baseline = prepared.result;
    expect(baseline.compressionStatus).toBe("COMPLETE");
    expect(baseline.memberEnvelopes).toHaveLength(2);
    expect(baseline.cohortCount).toBe(1);
    if (baseline.routeToCohortMappings === null || baseline.equivalenceProofs === null) {
      throw new Error("Expected complete Task6.4 Stage-A baseline");
    }
    const totals = stageATotalsOf(baseline);
    const result = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, {
        maxMemberEnvelopeCount: 1,
        maxRouteMappingCount: baseline.routeToCohortMappings.length + 1,
        maxEquivalenceProofCount: baseline.equivalenceProofs.length + 1,
        maxLineageOccurrenceWitnessCount: coverageWitnessTotalOf(prepared.input) + 1,
      }),
    });

    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(result.exhaustedDimensions).toEqual(["MEMBER_ENVELOPE_COUNT"]);
    expect(result.compressionRatioObservation).toEqual({
      inputRouteCount: prepared.input.admission.inputRouteCount,
      observedCohortCount: 1,
      ratioNumerator: prepared.input.admission.inputRouteCount,
      ratioDenominator: 1,
      cohortCountCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      ratioInterpretation: "UPPER_BOUND_FROM_COHORT_LOWER_BOUND",
    });
    expectTask6StageATerminalPayload(result);
  });

  it("Task6.4 uses lower-bound ratio completeness after Stage-B C and D exhaustion with Stage-A exact cohort measurement", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE"
      || baseline.routeToCohortMappings === null
      || baseline.equivalenceProofs === null) throw new Error("Expected complete Task6.4 baseline");
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    const proofCount = baseline.equivalenceProofs.length;
    const witnessCount = coverageWitnessTotalOf(prepared.input);
    const cohortCount = baseline.cohortCount;
    expect(cohortCount).toBeGreaterThan(0);

    const cases = [
      ["mapping", { maxRouteMappingCount: mappingCount - 1 }],
      ["proof", {
        maxRouteMappingCount: mappingCount,
        maxEquivalenceProofCount: proofCount - 1,
      }],
      ["witness", {
        maxRouteMappingCount: mappingCount,
        maxEquivalenceProofCount: proofCount,
        maxLineageOccurrenceWitnessCount: witnessCount - 1,
      }],
    ] as const;

    for (const [stage, overrides] of cases) {
      const result = materializePhaseDTask5V1({
        ...prepared.input,
        evidenceBudget: stageABudgetAboveTotals(totals, overrides),
      });
      expect(result.compressionStatus, stage).toBe("INCONCLUSIVE");
      expect(stageAMeasurementOf(result, "COHORT_COUNT")).toEqual({
        dimension: "COHORT_COUNT",
        limit: HARD_MAX_COHORT_COUNT_V1,
        observedCount: cohortCount,
        measurementCompleteness: "EXACT",
      });
      expect(result.compressionRatioObservation).toEqual({
        inputRouteCount: prepared.input.admission.inputRouteCount,
        observedCohortCount: cohortCount,
        ratioNumerator: prepared.input.admission.inputRouteCount,
        ratioDenominator: cohortCount,
        cohortCountCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
        ratioInterpretation: "UPPER_BOUND_FROM_COHORT_LOWER_BOUND",
      });
      expect(result.budgetExecution.exhaustionProvenance).not.toBeNull();
      expectTask6StageATerminalPayload(result);
    }
  });

  it("Task6.4 makes the ratio unavailable after non-cohort exhaustion with no positive cohort lower bound", () => {
    if (task6RatioObservationForTest === undefined) {
      throw new Error("Task6.4 missing ratio seam");
    }
    expect(task6RatioObservationForTest(17, "INCONCLUSIVE", null, true)).toEqual({
      inputRouteCount: 17,
      observedCohortCount: 0,
      ratioNumerator: 17,
      ratioDenominator: null,
      cohortCountCompleteness: null,
      ratioInterpretation: "UNAVAILABLE",
    });
  });

  it("Task6.4 makes every REJECTED ratio unavailable", () => {
    const budgetCases = [
      ["maxRouteMappingCount", 1],
      ["maxEquivalenceProofCount", 1],
      ["maxLineageOccurrenceWitnessCount", 1],
    ] as const;
    for (const [budgetField, limit] of budgetCases) {
      const input = makeManifestHashMismatchFixture();
      const artifact = terminalArtifactOf(compressHierarchicalStrategicCohortsV1({
        ...input,
        evidenceBudget: {
          ...input.evidenceBudget,
          [budgetField]: limit,
        },
      }));

      expect(artifact.compressionStatus, budgetField).toBe("REJECTED");
      expect(artifact.reasonCodes, budgetField).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
      expect(artifact.compressionRatioObservation.ratioDenominator, budgetField).toBeNull();
      expect(artifact.compressionRatioObservation.cohortCountCompleteness, budgetField).toBeNull();
      expect(artifact.compressionRatioObservation.ratioInterpretation, budgetField).toBe("UNAVAILABLE");
    }
    if (task6RatioObservationForTest === undefined) {
      throw new Error("Task6.4 missing ratio seam");
    }
    expect(task6RatioObservationForTest(5, "REJECTED", 4, true)).toMatchObject({
      observedCohortCount: 0,
      ratioDenominator: null,
      cohortCountCompleteness: null,
      ratioInterpretation: "UNAVAILABLE",
    });
  });

  it("Task6.4 retains only legitimate measurements at exhaustion", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE"
      || baseline.routeToCohortMappings === null) throw new Error("Expected complete mapping baseline");
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    const result = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, {
        maxRouteMappingCount: mappingCount - 1,
      }),
    });

    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(result.budgetExecution.measurements.map(({ dimension }) => dimension))
      .toEqual(TASK6_TEST_DIMENSION_ORDER.slice(0, 5));
    const provenance = result.budgetExecution.exhaustionProvenance;
    if (provenance === null) throw new Error("Expected budget exhaustion provenance");
    const exhaustedMeasurements = result.budgetExecution.measurements.filter(({ dimension }) =>
      result.exhaustedDimensions.includes(dimension));
    expect(provenance.exhaustedMeasurements).toEqual(exhaustedMeasurements);
    expect(provenance.sourceHashBindings).toEqual([...provenance.sourceHashBindings].sort((left, right) =>
      compareTask6Text(left.sourceKind, right.sourceKind)
      || compareTask6Text(left.sourceHash, right.sourceHash)));
    expect(provenance.provenanceHash).toBe(canonicalHash({
      exhaustedMeasurements: provenance.exhaustedMeasurements,
      sourceHashBindings: provenance.sourceHashBindings,
    }));
    expect(result.budgetExecution.executionHash).toBe(canonicalHash({
      measurements: result.budgetExecution.measurements,
      exhaustionProvenance: provenance,
    }));
  });
});

describe("Task6.5 final verification and hardening", () => {
  it("Task6.5 source corruption beats invalid or exhausted budget", () => {
    const corrupted = makeManifestHashMismatchFixture();
    const cases = [
      ["invalid", makeCorruptedSourceWithInvalidPhaseDEvidenceBudgetFixture()],
      ["stage-a", {
        ...corrupted,
        evidenceBudget: { ...corrupted.evidenceBudget, maxMemberEnvelopeCount: 1 },
      }],
      ["stage-b", {
        ...corrupted,
        evidenceBudget: { ...corrupted.evidenceBudget, maxRouteMappingCount: 1 },
      }],
      ["stage-c", {
        ...corrupted,
        evidenceBudget: { ...corrupted.evidenceBudget, maxEquivalenceProofCount: 1 },
      }],
      ["stage-d", {
        ...corrupted,
        evidenceBudget: { ...corrupted.evidenceBudget, maxLineageOccurrenceWitnessCount: 1 },
      }],
    ] as const;

    for (const [label, input] of cases) {
      const artifact = terminalArtifactOf(compressHierarchicalStrategicCohortsV1(input));
      expect(artifact.compressionStatus, label).toBe("REJECTED");
      expect(artifact.reasonCodes, label).toContain("SOURCE_HASH_PAYLOAD_MISMATCH");
      expect(artifact.reasonCodes, label).not.toContain("INVALID_BUDGET");
      expect(artifact.reasonCodes.some((reason) => reason.endsWith("_EXHAUSTED")), label).toBe(false);
      expect(artifact.budgetExecution.measurements, label).toEqual([]);
      expect(artifact.compressionRatioObservation.ratioDenominator, label).toBeNull();
      expect(artifact.compressionRatioObservation.cohortCountCompleteness, label).toBeNull();
      expect(artifact.compressionRatioObservation.ratioInterpretation, label).toBe("UNAVAILABLE");
      expect(artifact.cohortCount, label).toBe(0);
      expect(artifact.cohortUniverseHash, label).toBeNull();
    }
  });

  it("Task6.5 route order reversal preserves budget execution and artifact hash", () => {
    const source = makeValidPhaseDAdmissionInput();
    const canonical = materializeTask5WithBudget(source, phaseDTask5Budget()).result;
    const reversed = materializeTask5WithBudget(
      makeReversedComponentSourceInput(source),
      phaseDTask5Budget(),
    ).result;

    expect(reversed.compressionStatus).toBe(canonical.compressionStatus);
    expect(reversed.budgetExecution).toEqual(canonical.budgetExecution);
    expect(reversed.compressionRatioObservation).toEqual(canonical.compressionRatioObservation);
    expect(reversed.exhaustedDimensions).toEqual(canonical.exhaustedDimensions);
    expect(reversed.reasonCodes).toEqual(canonical.reasonCodes);
    expect(reversed.cohortUniverseHash).toBe(canonical.cohortUniverseHash);
    expect(reversed.artifactHash).toBe(canonical.artifactHash);
    expect(task5SubstantivePayloadOf(reversed)).toEqual(task5SubstantivePayloadOf(canonical));
  });

  it("Task6.5 member and draft order reversal preserves all seven measurements", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const canonical = prepared.result;
    const reversed = materializePhaseDTask5V1({
      ...prepared.input,
      normalizedMemberDrafts: [...prepared.input.normalizedMemberDrafts].reverse(),
      task4: task4WithReversedClosures(prepared.input.task4),
    });

    expect(canonical.compressionStatus).toBe("COMPLETE");
    expect(reversed.compressionStatus).toBe("COMPLETE");
    expect(reversed.budgetExecution.measurements).toEqual(canonical.budgetExecution.measurements);
    expect(reversed.budgetExecution.measurements).toHaveLength(7);
    expect(reversed.budgetExecution.measurements.every((measurement) =>
      measurement.measurementCompleteness === "EXACT")).toBe(true);
    expect(reversed.budgetExecution.executionHash).toBe(canonical.budgetExecution.executionHash);
    expect(reversed.compressionRatioObservation).toEqual(canonical.compressionRatioObservation);
    expect(reversed.artifactHash).toBe(canonical.artifactHash);
  });

  it("Task6.5 cohort-key discovery permutation preserves cohort lower bound", () => {
    if (task6CohortAdmissionForTest === undefined) {
      throw new Error("Task6.5 missing __task6CohortAdmissionForTest seam");
    }
    const baseline = materializeTask5WithBudget(makeValidPhaseDAdmissionInput(), phaseDTask5Budget()).result;
    if (baseline.compressionStatus !== "COMPLETE" || baseline.cohortInterfaces === null) {
      throw new Error("Expected a real verified cohort interface");
    }
    const baseInterface = baseline.cohortInterfaces[0];
    if (baseInterface === undefined) throw new Error("Expected a real cohort interface");
    const interfaces = Array.from({ length: 50 }, (_, ordinal) =>
      task6CohortVariantOf(baseInterface, ordinal));
    const deterministicPermutation = [
      ...interfaces.filter((_, index) => index % 2 === 1),
      ...interfaces.filter((_, index) => index % 2 === 0),
    ];
    const results = [
      task6CohortAdmissionForTest(interfaces),
      task6CohortAdmissionForTest([...interfaces].reverse()),
      task6CohortAdmissionForTest(deterministicPermutation),
    ];
    const canonical = results[0]!;

    for (const result of results) {
      expect(result.status).toBe("INCONCLUSIVE");
      expect(result.budgetExecution.measurements).toContainEqual({
        dimension: "COHORT_COUNT",
        limit: HARD_MAX_COHORT_COUNT_V1,
        observedCount: 50,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      });
      expect(result.positiveCohortLowerBound).toBe(50);
      expect(result.exhaustedDimensions).toEqual(["COHORT_COUNT"]);
      expect(result.reasonCodes).toEqual(["COHORT_COUNT_EXHAUSTED"]);
      expect(result.budgetExecution.measurements).toEqual(canonical.budgetExecution.measurements);
      expect(result.budgetExecution.exhaustionProvenance?.provenanceHash)
        .toBe(canonical.budgetExecution.exhaustionProvenance?.provenanceHash);
      expect(result.budgetExecution.executionHash).toBe(canonical.budgetExecution.executionHash);
    }
  });

  it("Task6.5 coverage occurrence permutation preserves witness measurement and coverage hash", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const canonical = prepared.result;
    const permutedInput: PhaseDTask5InputV1 = {
      ...prepared.input,
      normalizedMemberDrafts: [...prepared.input.normalizedMemberDrafts].reverse(),
      task4: task4WithReversedOccurrences(prepared.input.task4),
    };
    const permuted = materializePhaseDTask5V1(permutedInput);
    const canonicalWitness = stageAMeasurementOf(canonical, "LINEAGE_OCCURRENCE_WITNESS_COUNT");
    const permutedWitness = stageAMeasurementOf(permuted, "LINEAGE_OCCURRENCE_WITNESS_COUNT");

    expect(canonical.compressionStatus).toBe("COMPLETE");
    expect(permuted.compressionStatus).toBe("COMPLETE");
    expect(permutedWitness).toEqual(canonicalWitness);
    expect(permuted.coverageManifest).toEqual(canonical.coverageManifest);
    expect(permuted.coverageManifest?.coverageHash).toBe(canonical.coverageManifest?.coverageHash);
    expect(permuted.artifactHash).toBe(canonical.artifactHash);

    const witnessTotal = coverageWitnessTotalOf(prepared.input);
    expect(witnessTotal).toBeGreaterThan(1);
    const exhaustedBudget = phaseDTask5Budget({
      maxLineageOccurrenceWitnessCount: witnessTotal - 1,
    });
    const canonicalExhausted = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: exhaustedBudget,
    });
    const permutedExhausted = materializePhaseDTask5V1({
      ...permutedInput,
      evidenceBudget: exhaustedBudget,
    });
    expect(permutedExhausted.budgetExecution).toEqual(canonicalExhausted.budgetExecution);
    expect(permutedExhausted.exhaustedDimensions).toEqual(canonicalExhausted.exhaustedDimensions);
    expect(permutedExhausted.reasonCodes).toEqual(canonicalExhausted.reasonCodes);
    expect(permutedExhausted.compressionRatioObservation)
      .toEqual(canonicalExhausted.compressionRatioObservation);
    expect(stageAMeasurementOf(canonicalExhausted, "LINEAGE_OCCURRENCE_WITNESS_COUNT")).toEqual({
      dimension: "LINEAGE_OCCURRENCE_WITNESS_COUNT",
      limit: witnessTotal - 1,
      observedCount: witnessTotal,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
  });

  it("Task6.5 simultaneous exhaustion is deterministic", () => {
    const budget = task6TestBudget({
      maxMemberEnvelopeCount: 1,
      maxResourceRoleSlotCount: 1,
    });
    const first = task6AccumulatorForTest(budget, task6TestSourceBindings).applyVerifiedEvent({
      MEMBER_ENVELOPE_COUNT: 2,
      RESOURCE_ROLE_SLOT_COUNT: 2,
    }, task6TestEvent()).snapshot;
    const second = task6AccumulatorForTest(budget, [...task6TestSourceBindings].reverse()).applyVerifiedEvent({
      RESOURCE_ROLE_SLOT_COUNT: 2,
      MEMBER_ENVELOPE_COUNT: 2,
    }, task6TestEvent()).snapshot;
    if (first === null || second === null) throw new Error("Expected simultaneous exhaustion snapshot");

    expect(first.exhaustedDimensions).toEqual([
      "MEMBER_ENVELOPE_COUNT",
      "RESOURCE_ROLE_SLOT_COUNT",
    ]);
    expect(first.reasonCodes).toEqual([
      "MEMBER_ENVELOPE_COUNT_EXHAUSTED",
      "RESOURCE_ROLE_SLOT_COUNT_EXHAUSTED",
    ]);
    expect(first.budgetExecution.measurements).toEqual([
      {
        dimension: "MEMBER_ENVELOPE_COUNT",
        limit: 1,
        observedCount: 2,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
      {
        dimension: "RESOURCE_ROLE_SLOT_COUNT",
        limit: 1,
        observedCount: 2,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
    ]);
    expect(second.exhaustedDimensions).toEqual(first.exhaustedDimensions);
    expect(second.reasonCodes).toEqual(first.reasonCodes);
    expect(second.budgetExecution.measurements).toEqual(first.budgetExecution.measurements);
    expect(second.budgetExecution.exhaustionProvenance?.provenanceHash)
      .toBe(first.budgetExecution.exhaustionProvenance?.provenanceHash);
    expect(second.budgetExecution.executionHash).toBe(first.budgetExecution.executionHash);
  });

  it("Task6.5 every exhaustion nulls complete-only payload and failure identity fields", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE"
      || baseline.routeToCohortMappings === null
      || baseline.equivalenceProofs === null) throw new Error("Expected complete Task6.5 baseline");
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    const proofCount = baseline.equivalenceProofs.length;
    const witnessCount = coverageWitnessTotalOf(prepared.input);
    expect(Math.min(totals.memberEnvelopeCount, mappingCount, proofCount, witnessCount)).toBeGreaterThan(1);
    const budgets = [
      stageABudgetAboveTotals(totals, { maxMemberEnvelopeCount: totals.memberEnvelopeCount - 1 }),
      stageABudgetAboveTotals(totals, { maxRouteMappingCount: mappingCount - 1 }),
      stageABudgetAboveTotals(totals, {
        maxRouteMappingCount: mappingCount,
        maxEquivalenceProofCount: proofCount - 1,
      }),
      stageABudgetAboveTotals(totals, {
        maxRouteMappingCount: mappingCount,
        maxEquivalenceProofCount: proofCount,
        maxLineageOccurrenceWitnessCount: witnessCount - 1,
      }),
    ];

    for (const evidenceBudget of budgets) {
      const result = materializePhaseDTask5V1({ ...prepared.input, evidenceBudget });
      expect(result.compressionStatus).toBe("INCONCLUSIVE");
      expectTask6StageATerminalPayload(result);
    }
  });

  it("Task6.5 exactly-at-limit is not whole-artifact completion", () => {
    const prepared = task5InputOf(makeValidPhaseDAdmissionInput());
    const baseline = prepared.result;
    if (baseline.compressionStatus !== "COMPLETE" || baseline.routeToCohortMappings === null) {
      throw new Error("Expected complete Task6.5 mapping baseline");
    }
    const totals = stageATotalsOf(baseline);
    const mappingCount = baseline.routeToCohortMappings.length;
    expect(Math.min(totals.memberEnvelopeCount, mappingCount)).toBeGreaterThan(1);
    const result = materializePhaseDTask5V1({
      ...prepared.input,
      evidenceBudget: stageABudgetAboveTotals(totals, {
        maxMemberEnvelopeCount: totals.memberEnvelopeCount,
        maxRouteMappingCount: mappingCount - 1,
      }),
    });

    expect(result.compressionStatus).toBe("INCONCLUSIVE");
    expect(stageAMeasurementOf(result, "MEMBER_ENVELOPE_COUNT")).toEqual({
      dimension: "MEMBER_ENVELOPE_COUNT",
      limit: totals.memberEnvelopeCount,
      observedCount: totals.memberEnvelopeCount,
      measurementCompleteness: "EXACT",
    });
    expect(result.exhaustedDimensions).not.toContain("MEMBER_ENVELOPE_COUNT");
    expect(stageAMeasurementOf(result, "ROUTE_MAPPING_COUNT")).toEqual({
      dimension: "ROUTE_MAPPING_COUNT",
      limit: mappingCount - 1,
      observedCount: mappingCount,
      measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
    });
  });
});

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

function phaseDTask5Budget(
  overrides: Partial<StrategicCohortCompressionEvidenceBudgetV1> = {},
): StrategicCohortCompressionEvidenceBudgetV1 {
  return {
    maxMemberEnvelopeCount: 100,
    maxResourceRoleSlotCount: 1000,
    maxConflictClosureEdgeCount: 1000,
    maxRouteMappingCount: 100,
    maxEquivalenceProofCount: 100,
    maxLineageOccurrenceWitnessCount: 5000,
    ...overrides,
  };
}

function task5InputOf(
  input: Parameters<typeof compressHierarchicalStrategicCohortsV1>[0],
  budgetOverrides: Partial<StrategicCohortCompressionEvidenceBudgetV1> = {},
): { input: PhaseDTask5InputV1; result: ReturnType<typeof materializePhaseDTask5V1> } {
  const admission = admittedOf(input);
  const normalized = normalizedOf(admission);
  const task4 = materializePhaseDTask4V1({ admission, normalizedMemberDrafts: normalized.normalizedMemberDrafts });
  const task5Input: PhaseDTask5InputV1 = {
    admission,
    normalizedMemberDrafts: normalized.normalizedMemberDrafts,
    task4,
    evidenceBudget: phaseDTask5Budget(budgetOverrides),
  };
  return { input: task5Input, result: materializePhaseDTask5V1(task5Input) };
}

function materializeTask5WithBudget(
  input: Parameters<typeof compressHierarchicalStrategicCohortsV1>[0],
  budget: StrategicCohortCompressionEvidenceBudgetV1,
): { input: PhaseDTask5InputV1; result: ReturnType<typeof materializePhaseDTask5V1> } {
  return task5InputOf(input, budget);
}

type Task6StageATotalsV1 = {
  memberEnvelopeCount: number;
  resourceRoleSlotCount: number;
  conflictClosureEdgeCount: number;
  cohortCount: number;
};

function stageATotalsOf(
  result: ReturnType<typeof materializePhaseDTask5V1>,
): Task6StageATotalsV1 {
  if (result.compressionStatus !== "COMPLETE" || result.memberEnvelopes === null) {
    throw new Error("Expected complete Stage-A baseline");
  }
  return {
    memberEnvelopeCount: result.memberEnvelopes.length,
    resourceRoleSlotCount: result.memberEnvelopes.reduce((total, envelope) =>
      total + envelope.resourceInterface.canonicalRoleSlots.length, 0),
    conflictClosureEdgeCount: result.memberEnvelopes.reduce((total, envelope) =>
      total + envelope.routeRelevantConflictClosure.traversedReferenceEdges.length, 0),
    cohortCount: result.cohortCount,
  };
}

function coverageWitnessTotalOf(input: PhaseDTask5InputV1): number {
  const source = input.task4.occurrenceUniverse;
  if (source === null) throw new Error("Expected a complete occurrence universe");
  return source.physicalOccurrenceKeys.length
    + source.wildcardOccurrenceKeys.length
    + source.familyMemberOccurrenceKeys.length
    + source.reservationOccurrenceKeys.length
    + source.conflictOccurrenceKeys.length
    + source.endpointOccurrenceKeys.length;
}

function task5SubstantivePayloadOf(result: ReturnType<typeof materializePhaseDTask5V1>) {
  return {
    cohorts: result.cohorts,
    cohortInterfaces: result.cohortInterfaces,
    routeToCohortMappings: result.routeToCohortMappings,
    memberEnvelopes: result.memberEnvelopes,
    equivalenceProofs: result.equivalenceProofs,
    coverageManifest: result.coverageManifest,
    cohortCount: result.cohortCount,
    cohortUniverseHash: result.cohortUniverseHash,
  };
}

function stageABudgetAboveTotals(
  totals: Task6StageATotalsV1,
  overrides: Partial<StrategicCohortCompressionEvidenceBudgetV1> = {},
): StrategicCohortCompressionEvidenceBudgetV1 {
  return phaseDTask5Budget({
    maxMemberEnvelopeCount: totals.memberEnvelopeCount + 1,
    maxResourceRoleSlotCount: totals.resourceRoleSlotCount + 1,
    maxConflictClosureEdgeCount: totals.conflictClosureEdgeCount + 1,
    maxRouteMappingCount: totals.memberEnvelopeCount + 1,
    maxEquivalenceProofCount: totals.memberEnvelopeCount + 1,
    maxLineageOccurrenceWitnessCount: 5000,
    ...overrides,
  });
}

function stageAMeasurementOf(
  result: ReturnType<typeof materializePhaseDTask5V1>,
  dimension: string,
): Task6TestMeasurementV1 {
  const measurement = result.budgetExecution.measurements.find((value) => value.dimension === dimension);
  if (measurement === undefined) throw new Error(`Missing Stage-A measurement ${dimension}`);
  return measurement;
}

function expectTask6StageATerminalPayload(
  result: ReturnType<typeof materializePhaseDTask5V1>,
): void {
  expect(result.cohorts).toBeNull();
  expect(result.cohortInterfaces).toBeNull();
  expect(result.routeToCohortMappings).toBeNull();
  expect(result.memberEnvelopes).toBeNull();
  expect(result.equivalenceProofs).toBeNull();
  expect(result.coverageManifest).toBeNull();
  expect(result.cohortCount).toBe(0);
  expect(result.cohortUniverseHash).toBeNull();
}

function task4WithReversedClosures(task4: PhaseDTask4ArtifactV1): PhaseDTask4ArtifactV1 {
  if (task4.routeRelevantConflictClosures === null) {
    throw new Error("Expected Task 4 closures");
  }
  const { artifactHash: _artifactHash, ...payload } = task4;
  const reversedPayload = {
    ...payload,
    routeRelevantConflictClosures: [...task4.routeRelevantConflictClosures].reverse(),
  };
  const canonicalPayload = {
    ...reversedPayload,
    routeRelevantConflictClosures: [...reversedPayload.routeRelevantConflictClosures]
      .sort((left, right) => compareTask6Text(canonicalSerialize(left), canonicalSerialize(right))),
  };
  return { ...reversedPayload, artifactHash: canonicalHash(canonicalPayload) };
}

function task4WithReversedOccurrences(task4: PhaseDTask4ArtifactV1): PhaseDTask4ArtifactV1 {
  if (task4.routeRelevantConflictClosures === null || task4.occurrenceUniverse === null) {
    throw new Error("Expected Task 4 closures and occurrence universe");
  }
  const { occurrenceUniverseHash: _occurrenceUniverseHash, ...universePayload } = task4.occurrenceUniverse;
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
    sourceRouteIds: [...reversedUniversePayload.sourceRouteIds].sort(compareTask6Text),
    physicalOccurrenceKeys: [...reversedUniversePayload.physicalOccurrenceKeys].sort(compareTextTuple),
    wildcardOccurrenceKeys: [...reversedUniversePayload.wildcardOccurrenceKeys].sort(compareTextTuple),
    familyMemberOccurrenceKeys: [...reversedUniversePayload.familyMemberOccurrenceKeys].sort(compareTextTuple),
    reservationOccurrenceKeys: [...reversedUniversePayload.reservationOccurrenceKeys].sort(compareTextTuple),
    conflictOccurrenceKeys: [...reversedUniversePayload.conflictOccurrenceKeys].sort(compareTextTuple),
    endpointOccurrenceKeys: [...reversedUniversePayload.endpointOccurrenceKeys].sort(compareTextTuple),
  };
  const reversedUniverse = {
    ...reversedUniversePayload,
    occurrenceUniverseHash: canonicalHash(canonicalUniversePayload),
  };
  const { artifactHash: _artifactHash, ...task4Payload } = task4;
  const reversedPayload = {
    ...task4Payload,
    routeRelevantConflictClosures: [...task4.routeRelevantConflictClosures].reverse(),
    occurrenceUniverse: reversedUniverse,
  };
  const canonicalPayload = {
    ...reversedPayload,
    routeRelevantConflictClosures: [...reversedPayload.routeRelevantConflictClosures]
      .sort((left, right) => compareTask6Text(canonicalSerialize(left), canonicalSerialize(right))),
    occurrenceUniverse: {
      ...canonicalUniversePayload,
      occurrenceUniverseHash: reversedUniverse.occurrenceUniverseHash,
    },
  };
  return { ...reversedPayload, artifactHash: canonicalHash(canonicalPayload) };
}

function task6CohortVariantOf(
  base: StrategicCohortInterfaceV1,
  ordinal: number,
): StrategicCohortInterfaceV1 {
  const { endpointSignatureHash: _endpointSignatureHash, ...endpointPayload } = base.endpointInterface;
  const changedEndpointPayload = {
    ...endpointPayload,
    endpointArity: endpointPayload.endpointArity + ordinal + 1,
  };
  const endpointInterface = {
    ...changedEndpointPayload,
    endpointSignatureHash: canonicalHash(changedEndpointPayload),
  };
  const payload = {
    ...base,
    endpointInterface,
    fourSignatureHashes: {
      ...base.fourSignatureHashes,
      endpointSignatureHash: endpointInterface.endpointSignatureHash,
    },
  };
  const { cohortInterfaceHash: _cohortInterfaceHash, ...withoutHash } = payload;
  return { ...withoutHash, cohortInterfaceHash: canonicalHash(withoutHash) };
}

function compareTask6StageAEnvelope(
  left: RouteCohortMemberEnvelopeV1,
  right: RouteCohortMemberEnvelopeV1,
): number {
  return compareTask6Text(left.sourceRouteUniverseHash, right.sourceRouteUniverseHash)
    || compareTask6Text(left.routeId, right.routeId)
    || compareTask6Text(left.routeHash, right.routeHash);
}

function compareTask6Text(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
