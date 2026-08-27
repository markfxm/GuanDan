import { describe, expect, it } from "vitest";
import { generateStrategicRouteCandidateFactsV1 } from
  "../../../src/ai/d2h/strategicRouteCandidateFactsV1";
import { bindStrategicMultiComponentAndEndpointsV1 } from
  "../../../src/ai/d2h/strategicMultiComponentAndBindingV1";
import {
  materializeStrategicBudgetExecutionV1,
  validateStrategicBudgetExecutionV1,
} from "../../../src/ai/d2h/strategicBudgetExecutionV1";
import type { StrategicBudgetDimensionV1 } from
  "../../../src/ai/d2h/strategicBudgetExecutionV1Contracts";
import { makeFourLevelSevensRouteFixture } from
  "./strategicRouteCandidateFactsV1.fixtures";
import {
  makeThreeComponentRouteArtifacts,
  makeTwoComponentRouteArtifacts,
} from "./strategicMultiComponentAndBindingV1.fixtures";

const FORBIDDEN_FIELDS = new Set([
  "score", "ranking", "best", "winner", "recommendation", "selectedRoute", "action",
]);

function collectKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (value === null || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    output.add(key);
    collectKeys(child, output);
  }
  return output;
}

function rejectedReasonCodes(
  result: ReturnType<typeof validateStrategicBudgetExecutionV1>,
): readonly string[] {
  if (result.validationStatus !== "REJECTED") throw new Error("Expected rejected validation result");
  return result.reasonCodes;
}

describe("D2H-S0.5 Phase3.2-R Phase C3 unified budget execution", () => {
  it("accepts exact C1 and C2 budget boundaries with exact accounting", () => {
    const routeFixture = makeFourLevelSevensRouteFixture();
    const routeBaseline = generateStrategicRouteCandidateFactsV1({
      ...routeFixture,
      budget: { maxRouteCount: 100, maxConflictExpansion: 100_000, maxEvidenceCost: 100_000 },
    });
    const routeWork = routeBaseline.budgetObservation.generationWorkObservedCount;
    const routeArtifact = generateStrategicRouteCandidateFactsV1({
      ...routeFixture,
      budget: {
        maxRouteCount: routeBaseline.routeCount,
        maxConflictExpansion: routeWork,
        maxEvidenceCost: routeBaseline.evidenceCost,
      },
    });
    const endpointSourceArtifacts = makeTwoComponentRouteArtifacts();
    const endpointBaseline = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: endpointSourceArtifacts,
      budget: { maxComponentEndpointCount: 100, maxEvidenceCost: 100_000 },
    });
    const endpointArtifact = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: endpointSourceArtifacts,
      budget: { maxComponentEndpointCount: 2, maxEvidenceCost: endpointBaseline.evidenceCost },
    });

    expect(routeArtifact.generationStatus).toBe("COMPLETE");
    expect(routeArtifact.budgetExecution.measurements).toEqual([
      { dimension: "CONFLICT_EXPANSION_COUNT", limit: routeWork, observedCount: routeWork,
        measurementCompleteness: "EXACT" },
      { dimension: "EVIDENCE_COST", limit: routeBaseline.evidenceCost, observedCount: routeBaseline.evidenceCost,
        measurementCompleteness: "EXACT" },
      { dimension: "ROUTE_CANDIDATE_COUNT", limit: routeBaseline.routeCount, observedCount: routeBaseline.routeCount,
        measurementCompleteness: "EXACT" },
    ]);
    expect(routeArtifact.budgetExecution.exhaustionProvenance).toBeNull();
    expect(endpointArtifact.bindingStatus).toBe("COMPLETE");
    expect(endpointArtifact.budgetExecution.measurements).toEqual([
      { dimension: "COMPONENT_ENDPOINT_COUNT", limit: 2, observedCount: 2,
        measurementCompleteness: "EXACT" },
      { dimension: "EVIDENCE_COST", limit: endpointBaseline.evidenceCost, observedCount: endpointBaseline.evidenceCost,
        measurementCompleteness: "EXACT" },
    ]);
    expect(endpointArtifact.budgetExecution.exhaustionProvenance).toBeNull();
  });

  it("fails closed at boundary plus one without candidate or endpoint prefixes", () => {
    const routeFixture = makeFourLevelSevensRouteFixture();
    const routeBaseline = generateStrategicRouteCandidateFactsV1({
      ...routeFixture,
      budget: { maxRouteCount: 100, maxConflictExpansion: 100_000, maxEvidenceCost: 100_000 },
    });
    const routeArtifact = generateStrategicRouteCandidateFactsV1({
      ...routeFixture,
      budget: {
        maxRouteCount: routeBaseline.routeCount - 1,
        maxConflictExpansion: routeBaseline.budgetObservation.generationWorkObservedCount,
        maxEvidenceCost: 10_000,
      },
    });
    const endpointArtifact = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: makeThreeComponentRouteArtifacts(),
      budget: { maxComponentEndpointCount: 2, maxEvidenceCost: 10_000 },
    });

    expect(routeArtifact).toMatchObject({
      generationStatus: "INCONCLUSIVE",
      routeCandidates: null,
      routeCount: 0,
      routeUniverseHash: null,
    });
    expect(routeArtifact.budgetExecution.exhaustionProvenance?.exhaustedMeasurements)
      .toContainEqual({
        dimension: "ROUTE_CANDIDATE_COUNT",
        limit: routeBaseline.routeCount - 1,
        observedCount: routeBaseline.routeCount,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      });
    expect(endpointArtifact).toMatchObject({
      bindingStatus: "INCONCLUSIVE",
      componentRouteFacts: null,
      andEndpointReferences: null,
      componentEndpointCount: 0,
      routeUniverseHash: null,
    });
    expect(endpointArtifact.budgetExecution.exhaustionProvenance?.exhaustedMeasurements)
      .toContainEqual({
        dimension: "COMPONENT_ENDPOINT_COUNT",
        limit: 2,
        observedCount: 3,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      });
  });

  it("fails closed when evidence cost is exactly one above its boundary", () => {
    const sourceArtifacts = makeTwoComponentRouteArtifacts();
    const baseline = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts,
      budget: { maxComponentEndpointCount: 100, maxEvidenceCost: 100_000 },
    });
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts,
      budget: { maxComponentEndpointCount: 2, maxEvidenceCost: baseline.evidenceCost - 1 },
    });

    expect(result.bindingStatus).toBe("INCONCLUSIVE");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
    expect(result.budgetExecution.exhaustionProvenance?.exhaustedMeasurements)
      .toContainEqual({
        dimension: "EVIDENCE_COST",
         limit: baseline.evidenceCost - 1,
         observedCount: baseline.evidenceCost,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      });
  });

  it("records every dimension exhausted by the same completed C1 route", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const baseline = generateStrategicRouteCandidateFactsV1({
      ...fixture,
      budget: { maxRouteCount: 100, maxConflictExpansion: 100_000, maxEvidenceCost: 100_000 },
    });
    const firstRoute = baseline.routeCandidates![0]!;
    const firstRouteEvidence = firstRoute.supportingHierarchyFacts.length
      + firstRoute.supportingReservationFacts.length
      + firstRoute.resourceClaims.length
      + firstRoute.preservedResources.length
      + firstRoute.consumedResources.length
      + firstRoute.unresolvedConflicts.length
      + firstRoute.branchLocalResolutionWitnesses.length
      + 1;
    const result = generateStrategicRouteCandidateFactsV1({
      ...fixture,
      budget: {
        maxRouteCount: 1,
        maxConflictExpansion: baseline.budgetObservation.generationWorkObservedCount,
        maxEvidenceCost: firstRouteEvidence,
      },
    });
    const exhaustedDimensions = result.budgetExecution.exhaustionProvenance
      ?.exhaustedMeasurements.map((measurement) => measurement.dimension);

    expect(result.generationStatus).toBe("INCONCLUSIVE");
    expect(result.routeCandidates).toBeNull();
    expect(exhaustedDimensions).toEqual([
      "EVIDENCE_COST",
      "ROUTE_CANDIDATE_COUNT",
    ] satisfies StrategicBudgetDimensionV1[]);
  });

  it("records simultaneous C2 endpoint and evidence exhaustion", () => {
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: makeThreeComponentRouteArtifacts(),
      budget: { maxComponentEndpointCount: 2, maxEvidenceCost: 1 },
    });

    expect(result.bindingStatus).toBe("INCONCLUSIVE");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
    expect(result.budgetExecution.exhaustionProvenance?.exhaustedMeasurements).toEqual([
      {
        dimension: "COMPONENT_ENDPOINT_COUNT",
        limit: 2,
        observedCount: 3,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
      {
        dimension: "EVIDENCE_COST",
        limit: 1,
        observedCount: 2,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
      },
    ]);
  });

  it("rejects invalid C1 source integrity before emitting C2 exhaustion provenance", () => {
    const [first, second] = makeTwoComponentRouteArtifacts();
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [{ ...first, artifactHash: "tampered" }, second],
      budget: { maxComponentEndpointCount: 2, maxEvidenceCost: 1 },
    });

    expect(result.bindingStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_ARTIFACT_INTEGRITY_MISMATCH");
    expect(result.budgetExecution.exhaustionProvenance).toBeNull();
  });

  it("binds exhaustion provenance to canonical source hashes deterministically", () => {
    const sources = makeTwoComponentRouteArtifacts();
    const budget = { maxComponentEndpointCount: 2, maxEvidenceCost: 55 } as const;
    const canonical = bindStrategicMultiComponentAndEndpointsV1({ sourceArtifacts: sources, budget });
    const reversed = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [...sources].reverse(),
      budget,
    });
    const provenance = canonical.budgetExecution.exhaustionProvenance;

    expect(reversed).toEqual(canonical);
    expect(provenance?.sourceHashBindings.map((binding) => binding.sourceHash)).toEqual([
      ...sources.flatMap((source) => [source.artifactHash, source.routeUniverseHash!]),
    ].sort());
    expect(provenance?.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("adds no decision fields to complete or exhausted budget artifacts", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const artifacts = [
      generateStrategicRouteCandidateFactsV1({
        ...fixture,
        budget: { maxRouteCount: 4, maxConflictExpansion: 4, maxEvidenceCost: 42 },
      }),
      generateStrategicRouteCandidateFactsV1({
        ...fixture,
        budget: { maxRouteCount: 1, maxConflictExpansion: 1, maxEvidenceCost: 9 },
      }),
      bindStrategicMultiComponentAndEndpointsV1({
        sourceArtifacts: makeTwoComponentRouteArtifacts(),
        budget: { maxComponentEndpointCount: 2, maxEvidenceCost: 55 },
      }),
    ];

    expect(artifacts.flatMap((artifact) =>
      [...collectKeys(artifact)].filter((key) => FORBIDDEN_FIELDS.has(key)))).toEqual([]);
  });

  it("rejects unknown and duplicate budget dimensions", () => {
    const unknown = validateStrategicBudgetExecutionV1({
      measurements: [{ dimension: "UNKNOWN" as never, limit: 1, observedCount: 0,
        measurementCompleteness: "EXACT" }],
      exhaustedDimensions: [],
      sourceHashBindings: [],
    });
    const duplicate = validateStrategicBudgetExecutionV1({
      measurements: [
        { dimension: "EVIDENCE_COST", limit: 2, observedCount: 1, measurementCompleteness: "EXACT" },
        { dimension: "EVIDENCE_COST", limit: 2, observedCount: 1, measurementCompleteness: "EXACT" },
      ],
      exhaustedDimensions: [],
      sourceHashBindings: [],
    });

    expect(unknown.validationStatus).toBe("REJECTED");
    expect(rejectedReasonCodes(unknown)).toContain("UNKNOWN_DIMENSION");
    expect(duplicate.validationStatus).toBe("REJECTED");
    expect(rejectedReasonCodes(duplicate)).toContain("DUPLICATE_DIMENSION");
  });

  it("rejects invalid numeric measurements and completeness contradictions", () => {
    const malformed = [
      { dimension: "EVIDENCE_COST", limit: -1, observedCount: 0, measurementCompleteness: "EXACT" },
      { dimension: "COMPONENT_ENDPOINT_COUNT", limit: 1.5, observedCount: 0, measurementCompleteness: "EXACT" },
      { dimension: "ROUTE_CANDIDATE_COUNT", limit: Number.NaN, observedCount: 0, measurementCompleteness: "EXACT" },
      { dimension: "CONFLICT_EXPANSION_COUNT", limit: 1, observedCount: Number.POSITIVE_INFINITY, measurementCompleteness: "EXACT" },
      { dimension: "EVIDENCE_COST", limit: 1, observedCount: 2, measurementCompleteness: "EXACT" },
      { dimension: "EVIDENCE_COST", limit: 1, observedCount: 1, measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION" },
    ] as const;

    for (const measurement of malformed) {
      const result = validateStrategicBudgetExecutionV1({
        measurements: [measurement],
        exhaustedDimensions: [],
        sourceHashBindings: [],
      });
      expect(result.validationStatus).toBe("REJECTED");
    }
    expect(() => materializeStrategicBudgetExecutionV1({
      measurements: [{ dimension: "EVIDENCE_COST", limit: -1, observedCount: 0,
        measurementCompleteness: "EXACT" }],
      exhaustedDimensions: [],
      sourceHashBindings: [],
    })).toThrow("INVALID_BUDGET_EXECUTION_INPUT");
  });

  it("requires exhausted dimensions to have lower-bound evidence", () => {
    const exactExhausted = validateStrategicBudgetExecutionV1({
      measurements: [{ dimension: "EVIDENCE_COST", limit: 1, observedCount: 2,
        measurementCompleteness: "EXACT" }],
      exhaustedDimensions: ["EVIDENCE_COST"],
      sourceHashBindings: [],
    });
    const missingMeasurement = validateStrategicBudgetExecutionV1({
      measurements: [{ dimension: "EVIDENCE_COST", limit: 1, observedCount: 1,
        measurementCompleteness: "EXACT" }],
      exhaustedDimensions: ["ROUTE_CANDIDATE_COUNT"],
      sourceHashBindings: [],
    });
    const simultaneous = validateStrategicBudgetExecutionV1({
      measurements: [
        { dimension: "EVIDENCE_COST", limit: 1, observedCount: 2,
          measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION" },
        { dimension: "ROUTE_CANDIDATE_COUNT", limit: 1, observedCount: 2,
          measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION" },
      ],
      exhaustedDimensions: ["EVIDENCE_COST", "ROUTE_CANDIDATE_COUNT"],
      sourceHashBindings: [],
    });

    expect(exactExhausted.validationStatus).toBe("REJECTED");
    expect(rejectedReasonCodes(exactExhausted)).toContain("EXACT_EXHAUSTION_CONTRADICTION");
    expect(missingMeasurement.validationStatus).toBe("REJECTED");
    expect(rejectedReasonCodes(missingMeasurement)).toContain("EXHAUSTED_DIMENSION_WITHOUT_MEASUREMENT");
    expect(simultaneous.validationStatus).toBe("VALID");
  });

  it("rejects lower-bound evidence that did not reach exhaustion", () => {
    const result = validateStrategicBudgetExecutionV1({
      measurements: [{ dimension: "EVIDENCE_COST", limit: 5, observedCount: 5,
        measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION" }],
      exhaustedDimensions: [],
      sourceHashBindings: [],
    });

    expect(result.validationStatus).toBe("REJECTED");
    expect(rejectedReasonCodes(result)).toContain("LOWER_BOUND_WITHOUT_EXHAUSTION");
  });

  it("rejects contradictory duplicate source hash bindings and canonicalizes order", () => {
    const contradictory = validateStrategicBudgetExecutionV1({
      measurements: [{ dimension: "EVIDENCE_COST", limit: 2, observedCount: 1,
        measurementCompleteness: "EXACT" }],
      exhaustedDimensions: [],
      sourceHashBindings: [
        { sourceKind: "STRATEGIC_ROUTE_UNIVERSE", sourceHash: "same-hash" },
        { sourceKind: "STRATEGIC_ROUTE_GENERATION_ARTIFACT", sourceHash: "same-hash" },
      ],
    });
    const canonical = materializeStrategicBudgetExecutionV1({
      measurements: [
        { dimension: "EVIDENCE_COST", limit: 2, observedCount: 1, measurementCompleteness: "EXACT" },
        { dimension: "ROUTE_CANDIDATE_COUNT", limit: 2, observedCount: 1, measurementCompleteness: "EXACT" },
      ],
      exhaustedDimensions: [],
      sourceHashBindings: [
        { sourceKind: "STRATEGIC_ROUTE_UNIVERSE", sourceHash: "universe" },
        { sourceKind: "STRATEGIC_ROUTE_GENERATION_ARTIFACT", sourceHash: "artifact" },
      ],
    });
    const reversed = materializeStrategicBudgetExecutionV1({
      measurements: [...canonical.measurements].reverse(),
      exhaustedDimensions: [],
      sourceHashBindings: [
        { sourceKind: "STRATEGIC_ROUTE_GENERATION_ARTIFACT", sourceHash: "artifact" },
        { sourceKind: "STRATEGIC_ROUTE_UNIVERSE", sourceHash: "universe" },
      ],
    });

    expect(contradictory.validationStatus).toBe("REJECTED");
    expect(rejectedReasonCodes(contradictory)).toContain("CONTRADICTORY_SOURCE_HASH_BINDING");
    expect(reversed).toEqual(canonical);
  });
});
