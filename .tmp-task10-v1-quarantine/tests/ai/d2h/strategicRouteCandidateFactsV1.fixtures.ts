import { createDeck, isHeartRankWild, type GameRank } from "../../../src/engine/cards";
import { canonicalHash } from "../../../src/ai/d2h/strategicEvidenceCanonicalSerializer";
import { buildCandidateUniverse } from "../../../src/ai/d2h/candidateUniverseAdapter";
import { collectBaselineStructuralLineage } from "../../../src/ai/d2h/baselineStructuralLineage";
import { buildStrategicStructureInventoryV1 } from "../../../src/ai/d2h/strategicStructureInventory";
import { classifyStrategicHierarchyBatchV1 } from "../../../src/ai/d2h/strategicHierarchyClassifierV1";
import { materializeStrategicResourceReservationsV1 } from "../../../src/ai/d2h/strategicResourceReservationV1";
import type { StrategicHierarchyClassificationBatchV1 } from
  "../../../src/ai/d2h/strategicHierarchyClassifierV1Contracts";
import type { StrategicResourceReservationArtifactV1 } from
  "../../../src/ai/d2h/strategicResourceReservationV1Contracts";
import type { StrategicStructureInventoryV1 } from
  "../../../src/ai/d2h/strategicStructureInventoryContracts";
import { makeInventoryInput } from "./strategicStructureInventory.fixtures";

const deckById = new Map(createDeck().map((card) => [card.id, card]));

export type StrategicRouteC1FixtureV1 = Readonly<{
  hierarchyBatch: StrategicHierarchyClassificationBatchV1;
  reservationArtifact: StrategicResourceReservationArtifactV1;
}>;

export type FamilySelectionV1 = Readonly<{
  familyId: string;
  exactMemberPhysicalCardIds?: readonly string[];
}>;

export function makeRouteFixtureFromInventory(
  inventory: StrategicStructureInventoryV1,
  selections: readonly FamilySelectionV1[],
): StrategicRouteC1FixtureV1 {
  const selected = selectInventoryFamilies(inventory, selections);
  const hierarchyBatch = classifyStrategicHierarchyBatchV1(selected);
  if (hierarchyBatch === null) throw new Error("Fixture must produce a complete hierarchy batch");
  const reservationArtifact = materializeStrategicResourceReservationsV1(hierarchyBatch);
  if (reservationArtifact === null) throw new Error("Fixture must produce a complete reservation artifact");
  if (reservationArtifact.reservationFacts.length !== 1) {
    throw new Error("C1 fixture must contain exactly one resource component");
  }
  return { hierarchyBatch, reservationArtifact };
}

export function makeFourLevelSevensRouteFixture(): StrategicRouteC1FixtureV1 {
  return makeSelectedFixture(["S7-1", "C7-1", "D7-1", "H7-1"], "7", (inventory) => {
    const bomb = exactFamily(inventory, "bomb", ["S7-1", "C7-1", "D7-1", "H7-1"]);
    const pairs = inventory.families?.filter((family) =>
      family.structuralSignature.groupType === "pair"
      && family.physicalCoverageCardIds.every((id) =>
        ["S7-1", "C7-1", "D7-1", "H7-1"].includes(id))) ?? [];
    if (pairs.length === 0) throw new Error("Missing level-seven pair family fixture");
    return [{ familyId: bomb.familyId }, ...pairs.map((pair) => ({ familyId: pair.familyId }))];
  });
}

export function makeBombFastSheddingRouteFixture(): StrategicRouteC1FixtureV1 {
  const straightIds = ["S3-1", "C4-1", "D5-1", "H6-1", "S7-1"];
  const bombIds = ["S7-1", "C7-1", "D7-1", "H7-1"];
  return makeSelectedFixture([...straightIds, ...bombIds.slice(1)], "2", (inventory) => [
    { familyId: exactFamily(inventory, "bomb", bombIds).familyId },
    { familyId: exactFamily(inventory, "straight", straightIds).familyId },
  ]);
}

export function makePlateStraightRouteFixture(): StrategicRouteC1FixtureV1 {
  const plateIds = ["S7-1", "C7-1", "D7-1", "S6-1", "C6-1", "D6-1"];
  const straightIds = ["S3-1", "H4-1", "D5-1", "C6-1", "S7-1"];
  const handIds = [...new Set([...plateIds, ...straightIds])];
  return makeSelectedFixture(handIds, "2", (inventory) => [
    {
      familyId: exactFamily(inventory, "plate", plateIds).familyId,
      exactMemberPhysicalCardIds: plateIds,
    },
    {
      familyId: exactFamily(inventory, "straight", straightIds).familyId,
      exactMemberPhysicalCardIds: straightIds,
    },
  ]);
}

export function makeDisjointTierCombinationRouteFixture(): StrategicRouteC1FixtureV1 {
  const bombIds = ["S7-1", "C7-1", "D7-1", "H7-1"];
  const straightFlushIds = ["S3-1", "S4-1", "S5-1", "S6-1", "S7-1"];
  // The bridge straight-flush shares four cards with the straight, while the
  // bomb and straight themselves remain disjoint route allocations.
  const straightIds = ["S3-1", "S4-1", "S5-1", "S6-1", "C7-2"];
  const handIds = [...new Set([...bombIds, ...straightFlushIds, ...straightIds])];
  return makeSelectedFixture(handIds, "2", (inventory) => [
    { familyId: exactFamily(inventory, "bomb", bombIds).familyId, exactMemberPhysicalCardIds: bombIds },
    {
      familyId: exactFamily(inventory, "straight-flush", straightFlushIds).familyId,
      exactMemberPhysicalCardIds: straightFlushIds,
    },
    {
      familyId: exactFamily(inventory, "straight", straightIds).familyId,
      exactMemberPhysicalCardIds: straightIds,
    },
  ]);
}

export function makeDisjointLevelSevenBombDefensePairRouteFixture(): StrategicRouteC1FixtureV1 {
  const bombIds = ["S7-1", "C7-1", "D7-1", "H7-1"];
  const defensePairIds = ["C7-2", "D7-2"];
  const bridgeStraightFlushIds = ["S3-1", "S4-1", "S5-1", "S6-1", "S7-1"];
  const overlappingBridgeStraightIds = ["S3-1", "S4-1", "S5-1", "S6-1", "C7-2"];
  // The two intended route allocations are disjoint. The bridge alternatives
  // keep every selected family in one resource component, while the straight
  // deliberately overlaps the defense pair and must remain unselected.
  const handIds = [...new Set([
    ...bombIds,
    ...defensePairIds,
    ...bridgeStraightFlushIds,
    ...overlappingBridgeStraightIds,
  ])];
  return makeSelectedFixture(handIds, "7", (inventory) => [
    { familyId: exactFamily(inventory, "bomb", bombIds).familyId, exactMemberPhysicalCardIds: bombIds },
    {
      familyId: exactFamily(inventory, "pair", defensePairIds).familyId,
      exactMemberPhysicalCardIds: defensePairIds,
    },
    {
      familyId: exactFamily(inventory, "straight-flush", bridgeStraightFlushIds).familyId,
      exactMemberPhysicalCardIds: bridgeStraightFlushIds,
    },
    {
      familyId: exactFamily(inventory, "straight", overlappingBridgeStraightIds).familyId,
      exactMemberPhysicalCardIds: overlappingBridgeStraightIds,
    },
  ]);
}

export function makeDefenseHierarchyClosureRouteFixture(): StrategicRouteC1FixtureV1 {
  const bombIds = ["S7-1", "C7-1", "D7-1", "S7-2"];
  const defensePairIds = ["C7-2", "D7-2"];
  const conflictingTier2Ids = ["S3-1", "D4-1", "H5-1", "C6-1", "C7-2"];
  const compatibleTier2Ids = ["S5-1", "C5-1", "D5-1", "C8-1", "D8-1"];
  const ordinaryTier3Ids = ["S6-1"];
  const bombBridgeIds = ["S3-1", "S4-1", "S5-1", "S6-1", "S7-1"];
  // X conflicts with D and is disjoint from Y; Y and Z are both disjoint from B + D.
  // The bridge straight-flush only connects the concrete component and is not
  // a target route allocation.
  const handIds = [...new Set([
    ...bombIds,
    ...defensePairIds,
    ...conflictingTier2Ids,
    ...compatibleTier2Ids,
    ...ordinaryTier3Ids,
    ...bombBridgeIds,
  ])];
  return makeSelectedFixture(handIds, "7", (inventory) => [
    { familyId: exactFamily(inventory, "bomb", bombIds).familyId, exactMemberPhysicalCardIds: bombIds },
    {
      familyId: exactFamily(inventory, "pair", defensePairIds).familyId,
      exactMemberPhysicalCardIds: defensePairIds,
    },
    {
      familyId: exactFamily(inventory, "straight", conflictingTier2Ids).familyId,
      exactMemberPhysicalCardIds: conflictingTier2Ids,
    },
    {
      familyId: exactFamily(inventory, "full-house", compatibleTier2Ids).familyId,
      exactMemberPhysicalCardIds: compatibleTier2Ids,
    },
    {
      familyId: exactFamily(inventory, "single", ordinaryTier3Ids).familyId,
      exactMemberPhysicalCardIds: ordinaryTier3Ids,
    },
    {
      familyId: exactFamily(inventory, "straight-flush", bombBridgeIds).familyId,
      exactMemberPhysicalCardIds: bombBridgeIds,
    },
  ], 5_000);
}

export function makeWildcardContentionRouteFixture(): StrategicRouteC1FixtureV1 {
  const straightFlushIds = ["S3-1", "S4-1", "S5-1", "S6-1", "H2-1"];
  const bombIds = ["C7-1", "D7-1", "H7-1", "H2-1"];
  const pairIds = ["C8-1", "H2-1"];
  const handIds = [...new Set([...straightFlushIds, ...bombIds, ...pairIds])];
  return makeSelectedFixture(handIds, "2", (inventory) => [
    {
      familyId: exactFamily(inventory, "straight-flush", straightFlushIds).familyId,
      exactMemberPhysicalCardIds: straightFlushIds,
    },
    { familyId: exactFamily(inventory, "bomb", bombIds).familyId, exactMemberPhysicalCardIds: bombIds },
    { familyId: exactFamily(inventory, "pair", pairIds).familyId, exactMemberPhysicalCardIds: pairIds },
  ]);
}

export function makeDenseConflictRouteFixture(): StrategicRouteC1FixtureV1 {
  // Four mutually overlapping level-rank alternatives provide a bounded,
  // deterministic dense-conflict traversal without broadening the fixture's
  // source inventory semantics.
  return makeFourLevelSevensRouteFixture();
}

export function withReversedRouteInputs(fixture: StrategicRouteC1FixtureV1): StrategicRouteC1FixtureV1 {
  const { batchHash: _oldBatchHash, ...batchWithoutHash } = fixture.hierarchyBatch;
  const hierarchyPayload = {
    ...batchWithoutHash,
    sourceFamilyIds: [...batchWithoutHash.sourceFamilyIds].reverse(),
    classificationHashes: [...batchWithoutHash.classificationHashes].reverse(),
    families: [...batchWithoutHash.families].reverse(),
  };
  const hierarchyBatch = { ...hierarchyPayload, batchHash: canonicalHash(hierarchyPayload) };
  const { artifactHash: _oldArtifactHash, ...artifactWithoutHash } = fixture.reservationArtifact;
  const reservationPayload = {
    ...artifactWithoutHash,
    sourceClassificationHashes: [...artifactWithoutHash.sourceClassificationHashes].reverse(),
    resourceUnits: [...artifactWithoutHash.resourceUnits].reverse(),
    reservationFacts: [...artifactWithoutHash.reservationFacts].reverse().map((fact) => {
      const { reservationHash: _oldReservationHash, ...factWithoutHash } = fact;
      const factPayload = { ...factWithoutHash, claims: [...factWithoutHash.claims].reverse() };
      return { ...factPayload, reservationHash: canonicalHash(factPayload) };
    }),
    reservationAlternatives: [...artifactWithoutHash.reservationAlternatives].reverse(),
    conflictFacts: [...artifactWithoutHash.conflictFacts].reverse(),
  };
  const reservationArtifact = { ...reservationPayload, artifactHash: canonicalHash(reservationPayload) };
  return { hierarchyBatch, reservationArtifact };
}

function makeSelectedFixture(
  handIds: readonly string[],
  gameRank: GameRank,
  selectFamilies: (inventory: StrategicStructureInventoryV1) => readonly FamilySelectionV1[],
  sourceGenerationBudgetMs = 1_000,
): StrategicRouteC1FixtureV1 {
  const input = makeInventoryInput(handIds, gameRank);
  if (sourceGenerationBudgetMs === 1_000) {
    const inventory = buildStrategicStructureInventoryV1(input.a0, input.b0);
    return makeRouteFixtureFromInventory(inventory, selectFamilies(inventory));
  }
  const ownHand = handIds.map((cardId) => {
    const card = deckById.get(cardId);
    if (card === undefined) throw new Error(`Missing fixture card: ${cardId}`);
    return card;
  });
  const candidateUniverse = buildCandidateUniverse({
    identity: input.a0.result.identity,
    ownHand,
    playContext: { mode: "lead", allowPass: false },
    wildcardCardIds: ownHand
      .filter((card) => isHeartRankWild(card, gameRank))
      .map((card) => card.id)
      .sort(),
    budget: { maxElapsedMs: sourceGenerationBudgetMs },
  });
  const sourceArtifactIdentity = input.b0.result.provenance.sourceArtifactIdentity;
  const sourceHash = input.b0.result.provenance.sourceHash;
  if (sourceArtifactIdentity === null || sourceHash === null) {
    throw new Error("Fixture needs baseline source bindings");
  }
  const baselineLineage = collectBaselineStructuralLineage({
    identity: input.b0.result.identity,
    ownHand,
    sourceArtifactIdentity,
    sourceHash,
    budget: { maxElapsedMs: sourceGenerationBudgetMs },
  });
  const inventory = buildStrategicStructureInventoryV1(
    { ...input.a0, result: candidateUniverse },
    { ...input.b0, result: baselineLineage },
  );
  return makeRouteFixtureFromInventory(inventory, selectFamilies(inventory));
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
  if (family === undefined) throw new Error(`Missing ${groupType} fixture family`);
  return family;
}

function selectInventoryFamilies(
  inventory: StrategicStructureInventoryV1,
  selections: readonly FamilySelectionV1[],
): StrategicStructureInventoryV1 {
  const selected = new Map(selections.map((selection) => [selection.familyId, selection]));
  const families = inventory.families?.filter((family) => selected.has(family.familyId)).map((family) => {
    const exactCards = selected.get(family.familyId)?.exactMemberPhysicalCardIds;
    if (exactCards === undefined) return family;
    const members = family.members.filter((member) => sameStrings(member.physicalCardIds, exactCards));
    if (members.length !== 1) throw new Error("Fixture exact-member selection must resolve once");
    const sourceProtectedGroupIds = [...new Set(members.flatMap((member) => member.sourceGroupIds)
      .filter((groupId) => family.preservationFacts.sourceProtectedGroupIds.includes(groupId)))].sort();
    const payload = {
      ...family,
      memberIds: members.map((member) => member.memberId),
      members,
      exactMemberCount: members.length,
      physicalCoverageCardIds: [...members[0].physicalCardIds],
      heterogeneityFacts: [],
      preservationFacts: {
        sourceProtectedGroupIds,
        sourceProtectedGroupCount: sourceProtectedGroupIds.length,
      },
    };
    const { familyHash: _oldFamilyHash, ...withoutHash } = payload;
    return { ...withoutHash, familyHash: canonicalHash(withoutHash) };
  }) ?? [];
  if (families.length !== selected.size || inventory.candidateCoverage === null
    || inventory.wildcardResources === null) {
    throw new Error("Fixture needs complete selected inventory facts");
  }
  const selectedMemberIds = new Set(families.flatMap((family) => family.memberIds));
  const entries = inventory.candidateCoverage.entries.filter((entry) =>
    selected.has(entry.familyId) && selectedMemberIds.has(entry.memberId));
  const coveragePayload = {
    inputCandidateCount: entries.length,
    coveredCandidateCount: entries.length,
    exactB0MemberCandidateCount: entries.filter((entry) => entry.coverageClass === "EXACT_B0_MEMBER").length,
    residualCandidateCount: entries.filter((entry) => entry.coverageClass === "RESIDUAL_FAMILY_MEMBER").length,
    exactDuplicateAliasCount: entries.filter((entry) => entry.coverageClass === "EXACT_DUPLICATE_ALIAS").length,
    uncoveredCandidateCount: 0,
    entries,
  };
  const candidateCoverage = { ...coveragePayload, coverageHash: canonicalHash(coveragePayload) };
  const selectedMembers = families.flatMap((family) => family.members);
  const wildcardResources = inventory.wildcardResources.flatMap((resource) => {
    const linkedMemberIds = resource.linkedMemberIds.filter((memberId) => selectedMemberIds.has(memberId));
    if (linkedMemberIds.length === 0) return [];
    const linkedMembers = selectedMembers.filter((member) => linkedMemberIds.includes(member.memberId));
    const payload = {
      wildcardResourceFamilyId: resource.wildcardResourceFamilyId,
      physicalWildcardCardIds: [...new Set(linkedMembers.flatMap((member) => member.wildcardCardIds))].sort(),
      allocationVariantHashes: [...new Set(linkedMembers
        .flatMap((member) => member.wildcardAllocationVariantHashes))].sort(),
      linkedFamilyIds: families.filter((family) =>
        family.memberIds.some((memberId) => linkedMemberIds.includes(memberId)))
        .map((family) => family.familyId).sort(),
      linkedMemberIds: [...linkedMemberIds].sort(),
      contentionComponentId: resource.contentionComponentId,
    };
    return [{ ...payload, resourceHash: canonicalHash(payload) }];
  });
  const physicalCardIds = [...new Set(families.flatMap((family) => family.physicalCoverageCardIds))].sort();
  const cardEntries = physicalCardIds.map((physicalCardId) => {
    const linkedFamilies = families.filter((family) => family.physicalCoverageCardIds.includes(physicalCardId));
    return {
      physicalCardId,
      memberIds: linkedFamilies.flatMap((family) => family.members
        .filter((member) => member.physicalCardIds.includes(physicalCardId))
        .map((member) => member.memberId)).sort(),
      familyIds: linkedFamilies.map((family) => family.familyId).sort(),
      overlapComponentIds: [...new Set(linkedFamilies.flatMap((family) => family.overlapComponentIds))].sort(),
    };
  });
  const physicalCardIndex = { cardEntries, indexHash: canonicalHash(cardEntries) };
  const semanticPayload = {
    schemaVersion: inventory.schemaVersion,
    identity: inventory.identity,
    bindings: {
      identityHash: inventory.identityHash,
      snapshotHash: inventory.snapshotHash,
      sourceRootHash: inventory.sourceRootHash,
      provenanceRoot: inventory.provenanceRoot,
    },
    inputRefs: inventory.inputRefs,
    families,
    wildcardResources,
    candidateCoverage,
    physicalCardIndex,
  };
  return {
    ...inventory,
    inputCandidateCount: entries.length,
    inputStructuralGroupCount: new Set(families.flatMap((family) =>
      family.members.flatMap((member) => member.sourceGroupIds))).size,
    exactMemberCount: selectedMembers.length,
    structuralFamilyCount: families.length,
    wildcardResourceFamilyCount: wildcardResources.length,
    families,
    wildcardResources,
    candidateCoverage,
    physicalCardIndex,
    inventoryHash: canonicalHash(semanticPayload),
  };
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}
