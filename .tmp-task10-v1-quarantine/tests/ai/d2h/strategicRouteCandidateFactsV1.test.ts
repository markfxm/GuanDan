import { describe, expect, it } from "vitest";
import { generateStrategicRouteCandidateFactsV1 } from
  "../../../src/ai/d2h/strategicRouteCandidateFactsV1";
import type {
  StrategicRouteCandidateFactV1,
  StrategicRouteGenerationBudgetV1,
} from
  "../../../src/ai/d2h/strategicRouteCandidateFactsV1Contracts";
import {
  makeBombFastSheddingRouteFixture,
  makeDenseConflictRouteFixture,
  makeDisjointLevelSevenBombDefensePairRouteFixture,
  makeDisjointTierCombinationRouteFixture,
  makeFourLevelSevensRouteFixture,
  makePlateStraightRouteFixture,
  makeWildcardContentionRouteFixture,
  withReversedRouteInputs,
  type StrategicRouteC1FixtureV1,
} from "./strategicRouteCandidateFactsV1.fixtures";

const LARGE_BUDGET = {
  maxRouteCount: 100,
  maxConflictExpansion: 100,
  maxEvidenceCost: 10_000,
} as const;

function generate(
  fixture: StrategicRouteC1FixtureV1,
  budget: StrategicRouteGenerationBudgetV1 = LARGE_BUDGET,
) {
  return generateStrategicRouteCandidateFactsV1({ ...fixture, budget });
}

function allocatedCards(route: StrategicRouteCandidateFactV1): string[] {
  return [
    ...route.preservedResources,
    ...route.consumedResources,
    ...route.endpointFacts.remainderPhysicalCardIds,
  ];
}

function normalizedPartitions(routes: readonly StrategicRouteCandidateFactV1[]): string[][][] {
  return routes.map((route) => route.resourceClaims
    .flatMap((claim) => claim.alternativeReservationFactIds.map((alternativeId) => ({ claim, alternativeId })))
    .filter(({ claim }) => claim.claimRoles.includes("LEVEL_RANK_DEFENSE"))
    .map(({ claim }) => [...claim.physicalCardIds].sort()))
    .filter((partition) => partition.length === 2)
    .map((partition) => partition.sort((left, right) => left.join("/").localeCompare(right.join("/"))))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function collectKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (value === null || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    output.add(key);
    collectKeys(child, output);
  }
  return output;
}

describe("D2H-S0.5 Phase3.2-R Phase C1 single component-local route generation", () => {
  it("emits one bomb route and the three exact level-seven pair partitions", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const result = generate(fixture);

    expect(result.generationStatus).toBe("COMPLETE");
    expect(result.routeCandidates).toHaveLength(4);
    const routes = result.routeCandidates!;
    const bombRoutes = routes.filter((route) => route.resourceClaims.some((claim) =>
      claim.controlRank === "CR2_BOMB"));
    expect(bombRoutes).toHaveLength(1);
    expect(bombRoutes[0].endpointFacts.routeClasses).toContain("CONTROL_PRESERVATION");
    expect(bombRoutes[0].endpointFacts.routeClasses).toContain("LEVEL_DEFENSE_PRESERVATION");
    expect(normalizedPartitions(routes)).toEqual([
      [["C7-1", "D7-1"], ["H7-1", "S7-1"]],
      [["C7-1", "H7-1"], ["D7-1", "S7-1"]],
      [["C7-1", "S7-1"], ["D7-1", "H7-1"]],
    ]);
    const conflictId = fixture.reservationArtifact.conflictFacts[0].conflictFactId;
    expect(routes.every((route) => route.unresolvedConflicts.includes(conflictId))).toBe(true);
  });

  it("accounts for each component physical card exactly once", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const result = generate(fixture);
    const componentCards = [...fixture.reservationArtifact.reservationFacts[0].physicalCardIds].sort();

    for (const route of result.routeCandidates ?? []) {
      const allocated = allocatedCards(route);
      expect([...allocated].sort()).toEqual(componentCards);
      expect(new Set(allocated).size).toBe(allocated.length);
      expect(route.endpointFacts.accountedPhysicalCardIds).toEqual(componentCards);
      const allocatedWildcards = route.resourceClaims.flatMap((claim) => claim.wildcardCardIds);
      expect(new Set(allocatedWildcards).size).toBe(allocatedWildcards.length);
    }
  });

  it("retains bomb preservation and released fast-shedding route facts", () => {
    const result = generate(makeBombFastSheddingRouteFixture());

    expect(result.generationStatus).toBe("COMPLETE");
    expect(result.routeCandidates?.some((route) =>
      route.endpointFacts.routeClasses.includes("CONTROL_PRESERVATION"))).toBe(true);
    expect(result.routeCandidates?.some((route) =>
      route.endpointFacts.routeClasses.includes("EFFICIENCY_RELEASE"))).toBe(true);
    expect(result.routeCandidates?.length).toBeGreaterThanOrEqual(2);
  });

  it("retains both plate and straight facts without Phase D dominance", () => {
    const result = generate(makePlateStraightRouteFixture());
    const groupTypes = result.routeCandidates?.flatMap((route) =>
      route.resourceClaims.map((claim) => claim.controlRank));

    expect(result.generationStatus).toBe("COMPLETE");
    expect(result.routeCandidates).toHaveLength(2);
    expect(groupTypes).toContain("CR3_PLATE_OR_BOARD");
    expect(groupTypes).toContain("CR5_STRAIGHT");
  });

  it("binds disjoint lower-tier allocation into the same complete control route", () => {
    const result = generate(makeDisjointTierCombinationRouteFixture());
    const combined = result.routeCandidates?.find((route) =>
      route.endpointFacts.routeClasses.includes("CONTROL_PRESERVATION")
      && route.endpointFacts.routeClasses.includes("EFFICIENCY_RELEASE"));

    expect(combined).toBeDefined();
    expect(combined?.resourceClaims).toHaveLength(2);
    expect(combined?.preservedResources).toEqual(["C7-1", "D7-1", "H7-1", "S7-1"]);
    expect(combined?.consumedResources).toEqual(["C7-2", "S3-1", "S4-1", "S5-1", "S6-1"]);
  });

  it("coexists a level-seven bomb and defense pair when their exact allocations are disjoint", () => {
    const fixture = makeDisjointLevelSevenBombDefensePairRouteFixture();
    const result = generate(fixture);
    const reversed = generate(withReversedRouteInputs(fixture));
    const bombIds = ["C7-1", "D7-1", "H7-1", "S7-1"];
    const defensePairIds = ["C7-2", "D7-2"];
    const route = result.routeCandidates?.find((candidate) => {
      const claims = candidate.resourceClaims.map((claim) => [...claim.physicalCardIds].sort());
      return claims.some((cards) => JSON.stringify(cards) === JSON.stringify(bombIds))
        && claims.some((cards) => JSON.stringify(cards) === JSON.stringify(defensePairIds));
    });

    expect(result.generationStatus).toBe("COMPLETE");
    expect(route).toBeDefined();
    const bombClaim = route?.resourceClaims.find((claim) =>
      JSON.stringify([...claim.physicalCardIds].sort()) === JSON.stringify(bombIds));
    const defensePairClaim = route?.resourceClaims.find((claim) =>
      JSON.stringify([...claim.physicalCardIds].sort()) === JSON.stringify(defensePairIds));
    expect(bombClaim?.controlRank).toBe("CR2_BOMB");
    expect(defensePairClaim?.claimRoles).toContain("LEVEL_RANK_DEFENSE");
    expect(bombIds.filter((cardId) => defensePairIds.includes(cardId))).toEqual([]);
    expect(route?.resourceClaims).toHaveLength(2);
    for (const [claim, expectedCards] of [[bombClaim, bombIds], [defensePairClaim, defensePairIds]] as const) {
      const alternative = fixture.reservationArtifact.reservationAlternatives.find((candidate) =>
        candidate.alternativeReservationFactId === claim?.alternativeReservationFactIds[0]);
      expect(alternative?.physicalCardIds).toEqual(expectedCards);
      expect(alternative?.alternativeHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(route?.branchLocalResolutionWitnesses.flatMap((witness) => witness.allocations)
      .flatMap((allocation) => allocation.physicalCardIds).sort())
      .toEqual([...bombIds, ...defensePairIds].sort());
    const bombAlternativeId = bombClaim?.alternativeReservationFactIds[0];
    const defensePairAlternativeId = defensePairClaim?.alternativeReservationFactIds[0];
    // The global component conflict remains unresolved; this local branch is
    // nevertheless permitted to bind both disjoint alternatives, rather than
    // turning shared level-rank semantics into an artificial XOR.
    expect(route?.branchLocalResolutionWitnesses.some((witness) =>
      witness.selectedAlternativeReservationFactIds.includes(bombAlternativeId ?? "")
      && witness.selectedAlternativeReservationFactIds.includes(defensePairAlternativeId ?? ""))).toBe(true);
    expect(reversed).toEqual(result);
    expect(reversed.routeUniverseHash).toBe(result.routeUniverseHash);
  });

  it("derives exact hand-count reduction only from selected non-overlapping alternatives", () => {
    const fixture = makeDisjointLevelSevenBombDefensePairRouteFixture();
    const result = generate(fixture);
    const reversed = generate(withReversedRouteInputs(fixture));
    const bombIds = ["C7-1", "D7-1", "H7-1", "S7-1"];
    const defensePairIds = ["C7-2", "D7-2"];
    const bridgeOverlapIds = ["C7-2", "S3-1", "S4-1", "S5-1", "S6-1"];
    const route = result.routeCandidates?.find((candidate) => {
      const claims = candidate.resourceClaims.map((claim) => [...claim.physicalCardIds].sort());
      return claims.some((cards) => JSON.stringify(cards) === JSON.stringify(bombIds))
        && claims.some((cards) => JSON.stringify(cards) === JSON.stringify(defensePairIds));
    });

    expect(result.generationStatus).toBe("COMPLETE");
    expect(route).toBeDefined();
    const selectedCards = route!.resourceClaims.map((claim) => [...claim.physicalCardIds].sort());
    expect(selectedCards).toEqual(expect.arrayContaining([bombIds, defensePairIds]));
    expect(new Set(selectedCards.flat()).size).toBe(bombIds.length + defensePairIds.length);
    const sourceReductionByFamilyId = new Map(fixture.hierarchyBatch.families.map((family) => [
      family.familyId,
      family.handCountReduction,
    ]));
    expect(route!.resourceClaims.map((claim) => sourceReductionByFamilyId.get(claim.familyId)).sort())
      .toEqual([1, 3]);
    const expectedExactHcr = 3 + 1;
    expect(route!.endpointFacts.exactHandCountReduction).toBe(expectedExactHcr);
    const overlappingAlternative = fixture.reservationArtifact.reservationAlternatives.find((alternative) =>
      JSON.stringify([...alternative.physicalCardIds].sort()) === JSON.stringify(bridgeOverlapIds));
    expect(overlappingAlternative).toBeDefined();
    expect(route!.resourceClaims.flatMap((claim) => claim.alternativeReservationFactIds))
      .not.toContain(overlappingAlternative!.alternativeReservationFactId);
    expect(route!.endpointFacts.exactHandCountReduction).not.toBe(expectedExactHcr + 4);
    const reversedRoute = reversed.routeCandidates?.find((candidate) => candidate.routeHash === route!.routeHash);
    expect(reversedRoute?.endpointFacts.exactHandCountReduction).toBe(expectedExactHcr);
    expect(reversed.routeUniverseHash).toBe(result.routeUniverseHash);
  });

  it("retains every fixed wildcard contention lineage as a separate route fact", () => {
    const fixture = makeWildcardContentionRouteFixture();
    const result = generate(fixture);
    const wildcardRoutes = result.routeCandidates?.filter((route) =>
      route.resourceClaims.some((claim) => claim.wildcardCardIds.includes("H2-1"))) ?? [];

    expect(result.generationStatus).toBe("COMPLETE");
    expect(wildcardRoutes).toHaveLength(3);
    expect(new Set(wildcardRoutes.flatMap((route) => route.resourceClaims
      .flatMap((claim) => claim.alternativeReservationFactIds))).size).toBe(3);
    expect(wildcardRoutes.every((route) => route.resourceClaims
      .filter((claim) => claim.wildcardCardIds.length > 0)
      .every((claim) => claim.wildcardAllocationLineage.length === 1))).toBe(true);
  });

  it("preserves branch-local witnesses for unresolved level-rank conflicts", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const result = generate(fixture);
    const conflictId = fixture.reservationArtifact.conflictFacts[0].conflictFactId;

    expect(result.routeCandidates).not.toBeNull();
    for (const route of result.routeCandidates ?? []) {
      const witness = route.branchLocalResolutionWitnesses.find((candidate) =>
        candidate.conflictFactId === conflictId);
      expect(witness).toMatchObject({
        witnessKind: "BRANCH_LOCAL_RESOLUTION",
        conflictFactId: conflictId,
      });
      expect(witness?.selectedAlternativeReservationFactIds.length).toBeGreaterThan(0);
      expect(witness?.allocations.length).toBe(witness?.selectedAlternativeReservationFactIds.length);
      expect(witness?.witnessHash).toMatch(/^[0-9a-f]{64}$/);
    }
    const bombRoute = result.routeCandidates?.find((route) => route.resourceClaims
      .some((claim) => claim.controlRank === "CR2_BOMB"));
    const pairRoutes = result.routeCandidates?.filter((route) => route.resourceClaims
      .some((claim) => claim.claimRoles.includes("LEVEL_RANK_DEFENSE"))
      && route.resourceClaims.every((claim) => claim.controlRank !== "CR2_BOMB"));
    expect(bombRoute?.branchLocalResolutionWitnesses[0]?.allocations[0]?.physicalCardIds)
      .toEqual(fixture.reservationArtifact.reservationAlternatives
        .find((alternative) => alternative.alternativeReservationFactId ===
          bombRoute?.resourceClaims[0]?.alternativeReservationFactIds[0])?.physicalCardIds);
    expect(pairRoutes?.length).toBe(3);
  });

  it("records fixed wildcard allocation payloads in branch-local witnesses", () => {
    const fixture = makeWildcardContentionRouteFixture();
    const result = generate(fixture);
    const wildcardWitnesses = result.routeCandidates?.flatMap((route) =>
      route.branchLocalResolutionWitnesses.flatMap((witness) => witness.allocations
        .filter((allocation) => allocation.wildcardCardIds.includes("H2-1")))) ?? [];

    expect(wildcardWitnesses.length).toBeGreaterThan(0);
    expect(wildcardWitnesses.every((allocation) => allocation.wildcardAllocationLineage.length === 1))
      .toBe(true);
    expect(wildcardWitnesses.every((allocation) => allocation.allocationHash
      .match(/^[0-9a-f]{64}$/) !== null)).toBe(true);
  });

  it("canonicalizes source array order before IDs and hashes are bound", () => {
    const fixture = makePlateStraightRouteFixture();
    const canonical = generate(fixture);
    const reversed = generate(withReversedRouteInputs(fixture));

    expect(reversed).toEqual(canonical);
  });

  it.each([
    ["maxRouteCount", { ...LARGE_BUDGET, maxRouteCount: 3 }, "MAX_ROUTE_COUNT"],
    ["maxConflictExpansion", { ...LARGE_BUDGET, maxConflictExpansion: 3 }, "MAX_CONFLICT_EXPANSION"],
    ["maxEvidenceCost", { ...LARGE_BUDGET, maxEvidenceCost: 1 }, "MAX_EVIDENCE_COST"],
  ] as const)("fails closed when %s is exhausted", (_name, budget, exhaustedDimension) => {
    const result = generate(makeFourLevelSevensRouteFixture(), budget);

    expect(result.generationStatus).toBe("INCONCLUSIVE");
    expect(result.routeCandidates).toBeNull();
    expect(result.routeCount).toBe(0);
    expect(result.routeUniverseHash).toBeNull();
    expect(result.exhaustedDimensions).toContain(exhaustedDimension);
    expect(result.budgetObservation.measurementCompleteness).toBe("LOWER_BOUND_AT_EXHAUSTION");
  });

  it("bounds recursive generation work before publishing partial routes", () => {
    const result = generate(makeDenseConflictRouteFixture(), {
      maxRouteCount: 100,
      maxConflictExpansion: 1,
      maxEvidenceCost: 100_000,
    });

    expect(result.generationStatus).toBe("INCONCLUSIVE");
    expect(result.routeCandidates).toBeNull();
    expect(result.routeCount).toBe(0);
    expect(result.budgetObservation.generationWorkObservedCount).toBeGreaterThan(1);
    expect(result.budgetObservation.measurementCompleteness).toBe("LOWER_BOUND_AT_EXHAUSTION");
    expect(result.reasonCodes).toContain("MAX_CONFLICT_EXPANSION_EXHAUSTED");
  });

  it("bounds source validation before replaying an oversized hierarchy source", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const firstFamily = fixture.hierarchyBatch.families[0]!;
    const oversizedBatch = {
      ...fixture.hierarchyBatch,
      families: [...fixture.hierarchyBatch.families, ...new Array(100_001).fill(firstFamily)],
    };
    const result = generate({ ...fixture, hierarchyBatch: oversizedBatch });

    expect(result.generationStatus).toBe("INCONCLUSIVE");
    expect(result.reasonCodes).toContain("SOURCE_VALIDATION_BUDGET_EXHAUSTED");
    expect(result.routeCandidates).toBeNull();
    expect(result.routeCount).toBe(0);
  });

  it("accepts the exact generation-work boundary and fails at boundary minus one", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const complete = generate(fixture, {
      maxRouteCount: 100,
      maxConflictExpansion: 100_000,
      maxEvidenceCost: 100_000,
    });
    const generationWork = complete.budgetObservation.generationWorkObservedCount;
    const boundary = generate(fixture, {
      maxRouteCount: 100,
      maxConflictExpansion: generationWork,
      maxEvidenceCost: 100_000,
    });
    const belowBoundary = generate(fixture, {
      maxRouteCount: 100,
      maxConflictExpansion: generationWork - 1,
      maxEvidenceCost: 100_000,
    });

    expect(boundary.generationStatus).toBe("COMPLETE");
    expect(boundary.budgetObservation.generationWorkObservedCount).toBe(generationWork);
    expect(belowBoundary.generationStatus).toBe("INCONCLUSIVE");
    expect(belowBoundary.routeCandidates).toBeNull();
    expect(belowBoundary.budgetObservation.generationWorkObservedCount)
      .toBeGreaterThan(generationWork - 1);
  });

  it("keeps semantic route-universe hash independent of nonbinding budget", () => {
    const fixture = makePlateStraightRouteFixture();
    const narrow = generate(fixture, {
      maxRouteCount: 10,
      maxConflictExpansion: 10_000,
      maxEvidenceCost: 10_000,
    });
    const wide = generate(fixture, {
      maxRouteCount: 100,
      maxConflictExpansion: 20_000,
      maxEvidenceCost: 20_000,
    });

    expect(narrow.generationStatus).toBe("COMPLETE");
    expect(wide.generationStatus).toBe("COMPLETE");
    expect(narrow.routeUniverseHash).toBe(wide.routeUniverseHash);
    expect(narrow.routeCandidates).toEqual(wide.routeCandidates);
    expect(narrow.artifactHash).not.toBe(wide.artifactHash);
    expect(narrow.budgetExecution.executionHash).not.toBe(wide.budgetExecution.executionHash);
  });

  it("fails closed when the Phase B artifact does not replay exactly", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const result = generate({
      ...fixture,
      reservationArtifact: { ...fixture.reservationArtifact, artifactHash: "tampered" },
    });

    expect(result.generationStatus).toBe("REJECTED");
    expect(result.routeCandidates).toBeNull();
    expect(result.routeUniverseHash).toBeNull();
  });

  it("emits no forbidden decision fields", () => {
    const fixture = makeFourLevelSevensRouteFixture();
    const results = [
      generate(fixture),
      generate({ ...fixture, reservationArtifact: { ...fixture.reservationArtifact, artifactHash: "tampered" } }),
    ];
    const forbidden = new Set([
      "score", "ranking", "best", "winner", "recommendation", "selectedRoute", "action",
    ]);

    expect(results.flatMap((result) => [...collectKeys(result)].filter((key) => forbidden.has(key)))).toEqual([]);
  });
});
