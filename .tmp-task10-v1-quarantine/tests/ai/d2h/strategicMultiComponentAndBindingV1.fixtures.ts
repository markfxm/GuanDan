import { buildStrategicStructureInventoryV1 } from "../../../src/ai/d2h/strategicStructureInventory";
import { generateStrategicRouteCandidateFactsV1 } from
  "../../../src/ai/d2h/strategicRouteCandidateFactsV1";
import type { StrategicRouteGenerationArtifactV1 } from
  "../../../src/ai/d2h/strategicRouteCandidateFactsV1Contracts";
import type { StrategicStructureInventoryV1 } from
  "../../../src/ai/d2h/strategicStructureInventoryContracts";
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

export function makeTwoComponentRouteArtifacts(): readonly StrategicRouteGenerationArtifactV1[] {
  return makeComponentRouteArtifacts(2);
}

export function makeThreeComponentRouteArtifacts(): readonly StrategicRouteGenerationArtifactV1[] {
  return makeComponentRouteArtifacts(3);
}

export function makeTwoComponentRouteArtifactsWithC1Budget(
  budget: Readonly<{ maxRouteCount: number; maxConflictExpansion: number; maxEvidenceCost: number }>,
): readonly StrategicRouteGenerationArtifactV1[] {
  return makeComponentRouteArtifacts(2, budget);
}

function makeComponentRouteArtifacts(
  count: 2 | 3,
  budget: Readonly<{ maxRouteCount: number; maxConflictExpansion: number; maxEvidenceCost: number }> = C1_BUDGET,
): readonly StrategicRouteGenerationArtifactV1[] {
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
    const artifact = generateStrategicRouteCandidateFactsV1({ ...fixture, budget });
    if (artifact.generationStatus !== "COMPLETE" || artifact.routeCandidates === null
      || artifact.routeUniverseHash === null) {
      throw new Error("C2 fixture needs complete C1 route facts");
    }
    return artifact;
  });
}

function exactFamily(
  inventory: StrategicStructureInventoryV1,
  groupType: string,
  physicalCardIds: readonly string[],
) {
  const expected = [...physicalCardIds].sort();
  const family = inventory.families?.find((candidate) =>
    candidate.structuralSignature.groupType === groupType
    && candidate.members.some((member) => sameStrings(member.physicalCardIds, expected)));
  if (family === undefined) throw new Error(`Missing ${groupType} component fixture`);
  return family;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const sortedRight = [...right].sort();
  return left.length === right.length
    && [...left].sort().every((value, index) => value === sortedRight[index]);
}
