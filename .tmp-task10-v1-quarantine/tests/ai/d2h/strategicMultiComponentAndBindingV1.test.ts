import { describe, expect, it } from "vitest";
import { canonicalHash } from "../../../src/ai/d2h/strategicEvidenceCanonicalSerializer";
import { bindStrategicMultiComponentAndEndpointsV1 } from
  "../../../src/ai/d2h/strategicMultiComponentAndBindingV1";
import type { StrategicMultiComponentAndBindingBudgetV1 } from
  "../../../src/ai/d2h/strategicMultiComponentAndBindingV1Contracts";
import {
  makeThreeComponentRouteArtifacts,
  makeTwoComponentRouteArtifacts,
  makeTwoComponentRouteArtifactsWithC1Budget,
} from "./strategicMultiComponentAndBindingV1.fixtures";

const LARGE_BUDGET: StrategicMultiComponentAndBindingBudgetV1 = {
  maxComponentEndpointCount: 100,
  maxEvidenceCost: 10_000,
};

function collectKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (value === null || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    output.add(key);
    collectKeys(child, output);
  }
  return output;
}

describe("D2H-S0.5 Phase3.2-R Phase C2 multi-component AND endpoint binding", () => {
  it("binds two components linearly without re-expanding their route facts", () => {
    const sourceArtifacts = makeTwoComponentRouteArtifacts();
    const result = bindStrategicMultiComponentAndEndpointsV1({ sourceArtifacts, budget: LARGE_BUDGET });
    const sourceRouteCount = sourceArtifacts.reduce((sum, artifact) => sum + artifact.routeCount, 0);

    expect(result.bindingStatus).toBe("COMPLETE");
    expect(result.componentRouteFacts).toHaveLength(2);
    expect(result.andEndpointReferences).toHaveLength(2);
    expect(result.componentIds).toHaveLength(2);
    expect(result.andComponentSetHash).not.toBeNull();
    expect(result.componentRouteFacts?.reduce((sum, component) => sum + component.routeCount, 0))
      .toBe(sourceRouteCount);
    expect(result.componentRouteFacts?.flatMap((component) => component.routeCandidates.map((route) => route.routeHash)).sort())
      .toEqual(sourceArtifacts.flatMap((artifact) => artifact.routeCandidates!.map((route) => route.routeHash)).sort());
    for (const endpoint of result.andEndpointReferences ?? []) {
      expect(endpoint.andComponentSetHash).toBe(result.andComponentSetHash);
      const source = sourceArtifacts.find((artifact) =>
        artifact.routeCandidates?.[0].endpointFacts.resourceComponentId === endpoint.resourceComponentId)!;
      expect(endpoint.routeReferences.map((reference) => reference.routeHash).sort())
        .toEqual(source.routeCandidates!.map((route) => route.routeHash).sort());
      expect(endpoint.sourceRouteUniverseHash).toBe(source.routeUniverseHash);
    }
  });

  it("binds three successful components with linear endpoint metadata", () => {
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: makeThreeComponentRouteArtifacts(),
      budget: LARGE_BUDGET,
    });

    expect(result.bindingStatus).toBe("COMPLETE");
    expect(result.componentIds).toHaveLength(3);
    expect(result.andEndpointReferences).toHaveLength(3);
    expect(result.andEndpointReferences?.every((endpoint) =>
      endpoint.andComponentSetHash === result.andComponentSetHash)).toBe(true);
    expect(JSON.stringify(result.andEndpointReferences)).not.toContain("independentComponentIds");
  });

  it("preserves physical-card and wildcard lineage inside each independent component", () => {
    const sourceArtifacts = makeTwoComponentRouteArtifacts();
    const result = bindStrategicMultiComponentAndEndpointsV1({ sourceArtifacts, budget: LARGE_BUDGET });

    for (const component of result.componentRouteFacts ?? []) {
      const source = sourceArtifacts.find((artifact) => artifact.routeUniverseHash === component.sourceRouteUniverseHash)!;
      expect(component.routeCandidates).toEqual(source.routeCandidates);
      expect(component.physicalCardIds).toEqual([...new Set(source.routeCandidates!
        .flatMap((route) => route.endpointFacts.accountedPhysicalCardIds))].sort());
      expect(component.wildcardCardIds).toEqual([...new Set(source.routeCandidates!
        .flatMap((route) => route.resourceClaims.flatMap((claim) => claim.wildcardCardIds)))].sort());
    }
  });

  it("fails closed for three components when endpoint count budget is exhausted", () => {
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: makeThreeComponentRouteArtifacts(),
      budget: { ...LARGE_BUDGET, maxComponentEndpointCount: 2 },
    });

    expect(result.bindingStatus).toBe("INCONCLUSIVE");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
    expect(result.componentEndpointCount).toBe(0);
    expect(result.routeUniverseHash).toBeNull();
    expect(result.exhaustedDimensions).toContain("MAX_COMPONENT_ENDPOINT_COUNT");
  });

  it("fails closed without a partial endpoint when evidence budget is exhausted", () => {
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: makeTwoComponentRouteArtifacts(),
      budget: { ...LARGE_BUDGET, maxEvidenceCost: 1 },
    });

    expect(result.bindingStatus).toBe("INCONCLUSIVE");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
    expect(result.routeUniverseHash).toBeNull();
    expect(result.exhaustedDimensions).toContain("MAX_EVIDENCE_COST");
  });

  it("returns inconclusive when a required source route artifact is missing", () => {
    const [first, second] = makeTwoComponentRouteArtifacts();
    const incomplete = {
      ...first,
      generationStatus: "INCONCLUSIVE" as const,
      routeCandidates: null,
      routeCount: 0,
      routeUniverseHash: null,
    };
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [incomplete, second],
      budget: LARGE_BUDGET,
    });

    expect(result.bindingStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("INCOMPLETE_SOURCE_ARTIFACT");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
  });

  it("bounds validation before sorting an oversized source set", () => {
    const [first] = makeTwoComponentRouteArtifacts();
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: new Array(100_001).fill(first),
      budget: LARGE_BUDGET,
    });

    expect(result.bindingStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("SOURCE_VALIDATION_BUDGET_EXHAUSTED");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
  });

  it("rejects a duplicate route id with a different route hash", () => {
    const [first, second] = makeTwoComponentRouteArtifacts();
    const duplicate = {
      ...first.routeCandidates![0]!,
      routeHash: "different-route-hash",
    };
    const { artifactHash: _artifactHash, ...firstPayload } = first;
    const forgedPayload = {
      ...firstPayload,
      routeCandidates: [...first.routeCandidates!, duplicate],
      routeCount: first.routeCount + 1,
    };
    const forged = { ...forgedPayload, artifactHash: canonicalHash(forgedPayload) };
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [forged, second],
      budget: LARGE_BUDGET,
    });

    expect(result.bindingStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("ROUTE_ID_HASH_CONFLICT");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
  });

  it("rejects a source artifact whose route universe hash was replaced and rechecksummed", () => {
    const [first, second] = makeTwoComponentRouteArtifacts();
    const { artifactHash: _artifactHash, ...firstPayload } = first;
    const forgedPayload = {
      ...firstPayload,
      routeUniverseHash: "forged-route-universe",
    };
    const forged = { ...forgedPayload, artifactHash: canonicalHash(forgedPayload) };
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [forged, second],
      budget: LARGE_BUDGET,
    });

    expect(result.bindingStatus).toBe("REJECTED");
    expect(result.componentRouteFacts).toBeNull();
    expect(result.andEndpointReferences).toBeNull();
    expect(result.reasonCodes).toContain("SOURCE_ARTIFACT_INTEGRITY_MISMATCH");
  });

  it("reads C1 generation-work provenance instead of completed route count", () => {
    const [first, second] = makeTwoComponentRouteArtifacts();
    const { artifactHash: _artifactHash, ...payload } = first;
    const forgedBudgetObservation = {
      ...first.budgetObservation,
      generationWorkObservedCount: first.budgetObservation.generationWorkObservedCount + 1,
    };
    const forgedPayload = { ...payload, budgetObservation: forgedBudgetObservation };
    const forged = { ...forgedPayload, artifactHash: canonicalHash(forgedPayload) };
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [forged, second],
      budget: LARGE_BUDGET,
    });

    expect(result.bindingStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_ARTIFACT_INTEGRITY_MISMATCH");
  });

  it("keeps semantic C2 route-universe hash independent of nonbinding C1 budgets", () => {
    const sourceA = makeTwoComponentRouteArtifactsWithC1Budget({
      maxRouteCount: 100,
      maxConflictExpansion: 10_000,
      maxEvidenceCost: 10_000,
    });
    const sourceB = makeTwoComponentRouteArtifactsWithC1Budget({
      maxRouteCount: 200,
      maxConflictExpansion: 20_000,
      maxEvidenceCost: 20_000,
    });
    const first = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: sourceA,
      budget: LARGE_BUDGET,
    });
    const second = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: sourceB,
      budget: LARGE_BUDGET,
    });

    expect(first.bindingStatus).toBe("COMPLETE");
    expect(second.bindingStatus).toBe("COMPLETE");
    expect(first.routeUniverseHash).toBe(second.routeUniverseHash);
    expect(first.componentRouteFacts?.map((component) => component.routeCandidates))
      .toEqual(second.componentRouteFacts?.map((component) => component.routeCandidates));
    expect(first.artifactHash).not.toBe(second.artifactHash);
  });

  it("rejects a rechecksummed source that understates its published evidence cost", () => {
    const [first, second] = makeTwoComponentRouteArtifacts();
    const budgetObservation = {
      ...first.budgetObservation,
      observedEvidenceCost: 0,
    };
    const routeUniverseHash = canonicalHash({
      kind: "strategic-route-universe-v1",
      identityHash: first.identityHash,
      snapshotHash: first.snapshotHash,
      sourceRootHash: first.sourceRootHash,
      provenanceRoot: first.provenanceRoot,
      sourceInventoryHash: first.sourceInventoryHash,
      sourceHierarchyBatchHash: first.sourceHierarchyBatchHash,
      sourceReservationArtifactHash: first.sourceReservationArtifactHash,
      budget: first.budget,
      budgetObservation,
      routeHashes: first.routeCandidates!.map((route) => route.routeHash),
    });
    const { artifactHash: _artifactHash, ...firstPayload } = first;
    const forgedPayload = {
      ...firstPayload,
      evidenceCost: 0,
      budgetObservation,
      routeUniverseHash,
    };
    const forged = { ...forgedPayload, artifactHash: canonicalHash(forgedPayload) };
    const result = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [forged, second],
      budget: LARGE_BUDGET,
    });

    expect(result.bindingStatus).toBe("REJECTED");
    expect(result.reasonCodes).toContain("SOURCE_ARTIFACT_INTEGRITY_MISMATCH");
  });

  it("produces identical ordering and hashes after source order disturbance", () => {
    const sourceArtifacts = makeThreeComponentRouteArtifacts();
    const canonical = bindStrategicMultiComponentAndEndpointsV1({ sourceArtifacts, budget: LARGE_BUDGET });
    const reversed = bindStrategicMultiComponentAndEndpointsV1({
      sourceArtifacts: [...sourceArtifacts].reverse(),
      budget: LARGE_BUDGET,
    });

    expect(reversed).toEqual(canonical);
  });

  it("emits no forbidden decision fields in complete or inconclusive artifacts", () => {
    const sourceArtifacts = makeTwoComponentRouteArtifacts();
    const results = [
      bindStrategicMultiComponentAndEndpointsV1({ sourceArtifacts, budget: LARGE_BUDGET }),
      bindStrategicMultiComponentAndEndpointsV1({
        sourceArtifacts,
        budget: { ...LARGE_BUDGET, maxComponentEndpointCount: 1 },
      }),
    ];
    const forbidden = new Set([
      "score", "ranking", "winner", "best", "recommendation", "selectedRoute", "action",
    ]);

    expect(results.flatMap((result) => [...collectKeys(result)].filter((key) => forbidden.has(key)))).toEqual([]);
  });
});
