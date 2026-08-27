import { canonicalHash } from "./strategicEvidenceCanonicalSerializer";
import { classifyStrategicHierarchyBatchV1 } from "./strategicHierarchyClassifierV1";
import { materializeStrategicResourceReservationsV1 } from "./strategicResourceReservationV1";
import { materializeStrategicBudgetExecutionV1 } from "./strategicBudgetExecutionV1";
import type {
  StrategicBudgetDimensionV1,
  StrategicBudgetExecutionArtifactV1,
} from "./strategicBudgetExecutionV1Contracts";
import type { StrategicFamilyHierarchyMetadataV1 } from
  "./strategicHierarchyClassifierV1Contracts";
import type {
  StrategicReservationAlternativeFactV1,
  StrategicReservationConflictFactV1,
  StrategicResourceReservationClaimV1,
  StrategicResourceReservationFactV1,
} from "./strategicResourceReservationV1Contracts";
import {
  STRATEGIC_ROUTE_GENERATION_V1_SCHEMA_VERSION,
  type StrategicRouteBudgetDimensionV1,
  type StrategicRouteBudgetObservationV1,
  type StrategicRouteBranchLocalAllocationV1,
  type StrategicRouteBranchLocalResolutionWitnessV1,
  type StrategicRouteCandidateFactV1,
  type StrategicRouteCandidateFactsGeneratorV1,
  type StrategicRouteClassV1,
  type StrategicRouteGenerationArtifactV1,
  type StrategicRouteGenerationBudgetV1,
  type StrategicRouteGenerationReasonCodeV1,
  type StrategicRoutePreservationFactCodeV1,
  type StrategicRouteResourceClaimV1,
} from "./strategicRouteCandidateFactsV1Contracts";

type RouteBranchV1 = Readonly<{
  alternatives: readonly StrategicReservationAlternativeFactV1[];
}>;

type GenerationWorkTrackerV1 = {
  limit: number;
  observed: number;
  attempt: () => void;
};

const GENERATION_WORK_EXHAUSTED = Symbol("GENERATION_WORK_EXHAUSTED");

const SOURCE_VALIDATION_WORK_LIMIT_V1 = 100_000;

type ArtifactBindingsV1 = Readonly<{
  identityHash: string;
  snapshotHash: string;
  sourceRootHash: string;
  provenanceRoot: string;
  sourceInventoryHash: string;
  sourceHierarchyBatchHash: string;
  sourceReservationArtifactHash: string;
}>;

const ROUTE_CLASS_SCHEMA_ORDER: readonly StrategicRouteClassV1[] = [
  "CONTROL_PRESERVATION",
  "EFFICIENCY_RELEASE",
  "LEVEL_DEFENSE_PRESERVATION",
];

export const generateStrategicRouteCandidateFactsV1: StrategicRouteCandidateFactsGeneratorV1 = (input) => {
  let bindings = bindingsOf(input);
  if (!sourceValidationWithinLimit(input)) {
    return inconclusiveArtifact(
      bindings,
      input.budget,
      ["SOURCE_VALIDATION_BUDGET_EXHAUSTED"],
      [],
      exactObservation(),
    );
  }
  if (!selfHashValid(input.hierarchyBatch)) {
    return rejectedArtifact(bindings, input.budget, ["SOURCE_HASH_PAYLOAD_MISMATCH"], exactObservation());
  }
  if (input.hierarchyBatch.sourceInventoryHash !== input.hierarchyBatch.sourceInventory.inventoryHash) {
    return rejectedArtifact(bindings, input.budget, ["SOURCE_HASH_PAYLOAD_MISMATCH"], exactObservation());
  }
  const canonicalHierarchyBatch = classifyStrategicHierarchyBatchV1(input.hierarchyBatch.sourceInventory);
  if (canonicalHierarchyBatch === null) {
    return inconclusiveArtifact(
      bindings,
      input.budget,
      ["INPUT_BINDING_MISMATCH"],
      [],
      exactObservation(),
    );
  }
  const replay = materializeStrategicResourceReservationsV1(canonicalHierarchyBatch);
  if (replay === null) {
    return inconclusiveArtifact(
      bindings,
      input.budget,
      ["INPUT_BINDING_MISMATCH"],
      [],
      exactObservation(),
    );
  }
  if (!validInputBindings(input)) {
    return rejectedArtifact(bindings, input.budget, ["SOURCE_BINDING_MISMATCH"], exactObservation());
  }
  const suppliedArtifactIsSelfBound = input.reservationArtifact.artifactHash
    === hashReservationArtifact(input.reservationArtifact);
  if ((!suppliedArtifactIsSelfBound && input.reservationArtifact.artifactHash !== replay.artifactHash)
    || !sameReservationSemantics(input.reservationArtifact, replay)) {
    return rejectedArtifact(bindings, input.budget, ["SOURCE_HASH_PAYLOAD_MISMATCH"], exactObservation());
  }
  bindings = {
    ...bindingsOf(input),
    sourceHierarchyBatchHash: canonicalHierarchyBatch.batchHash,
    sourceReservationArtifactHash: replay.artifactHash,
  };
  const verifiedInput = {
    hierarchyBatch: canonicalHierarchyBatch,
    reservationArtifact: replay,
    budget: input.budget,
  };
  if (replay.reservationFacts.length !== 1) {
    return inconclusiveArtifact(
      bindings,
      input.budget,
      ["MULTIPLE_RESOURCE_COMPONENTS_UNSUPPORTED_C1"],
      [],
      exactObservation(),
    );
  }
  const fact = replay.reservationFacts[0];
  const alternatives = replay.reservationAlternatives
    .filter((alternative) => alternative.resourceComponentId === fact.resourceComponentId)
    .sort((left, right) => compareText(
      left.alternativeReservationFactId,
      right.alternativeReservationFactId,
    ));
  const claimById = new Map(fact.claims.map((claim) => [claim.claimId, claim]));
  if (!validReferences(verifiedInput, fact, alternatives, claimById)) {
    return inconclusiveArtifact(
      bindings,
      input.budget,
      ["MISSING_FACT_REFERENCE"],
      [],
      exactObservation(),
    );
  }
  if (!validBudget(input.budget)) {
    return inconclusiveArtifact(bindings, input.budget, ["INVALID_BUDGET"], [], exactObservation());
  }

  const conflictById = new Map(replay.conflictFacts.map((conflict) => [conflict.conflictFactId, conflict]));
  const hasWildcardContention = replay.conflictFacts
    .filter((conflict) => fact.conflictFactIds.includes(conflict.conflictFactId))
    .some((conflict) => conflict.conflictKinds.includes("WILDCARD_CONTENTION"));
  const tracker = generationWorkTracker(input.budget.maxConflictExpansion);
  const branches = branchesOf(fact, alternatives, claimById, hasWildcardContention, tracker);
  const routes: StrategicRouteCandidateFactV1[] = [];
  let observedRouteCount = 0;
  let observedConflictExpansionCount = 0;
  let observedEvidenceCost = 0;
  try {
    for (const branch of branches) {
      const route = routeOf(verifiedInput, fact, branch, alternatives, claimById, conflictById);
      if (typeof route === "string") {
        return inconclusiveArtifact(
          bindings,
          input.budget,
          [route],
          [],
          lowerBoundObservation(observedRouteCount, observedConflictExpansionCount,
            observedEvidenceCost, tracker.observed),
        );
      }
      observedRouteCount += 1;
      if (fact.conflictFactIds.length > 0) observedConflictExpansionCount += 1;
      observedEvidenceCost += evidenceCostOf(route);
      const exhaustedDimensions = exhaustedDimensionsOf(
        input.budget,
        observedRouteCount,
        tracker.observed,
        observedEvidenceCost,
      );
      if (exhaustedDimensions.length > 0) {
        return inconclusiveArtifact(
          bindings,
          input.budget,
          exhaustedDimensions.map(reasonOfExhaustedDimension),
          exhaustedDimensions,
          lowerBoundObservation(observedRouteCount, observedConflictExpansionCount,
            observedEvidenceCost, tracker.observed),
        );
      }
      routes.push(route);
    }
  } catch (error) {
    if (error !== GENERATION_WORK_EXHAUSTED) throw error;
      const exhaustedDimensions = exhaustedDimensionsOf(
        input.budget,
        observedRouteCount,
        tracker.observed,
        observedEvidenceCost,
      );
      const dimensions = exhaustedDimensions.length > 0
        ? exhaustedDimensions
        : ["MAX_CONFLICT_EXPANSION" as const];
      return inconclusiveArtifact(
        bindings,
        input.budget,
        dimensions.map(reasonOfExhaustedDimension),
        dimensions,
        lowerBoundObservation(observedRouteCount, observedConflictExpansionCount,
          observedEvidenceCost, tracker.observed),
      );
  }
  routes.sort((left, right) => compareText(left.routeId, right.routeId));

  const budgetObservation: StrategicRouteBudgetObservationV1 = {
    observedRouteCount,
    observedConflictExpansionCount,
    observedEvidenceCost,
    generationWorkObservedCount: tracker.observed,
    measurementCompleteness: "EXACT",
  };
  const routeUniverseHash = canonicalHash({
    kind: "strategic-route-universe-v1",
    identityHash: bindings.identityHash,
    snapshotHash: bindings.snapshotHash,
    sourceRootHash: bindings.sourceRootHash,
    provenanceRoot: bindings.provenanceRoot,
    sourceInventoryHash: bindings.sourceInventoryHash,
    routeHashes: routes.map((route) => route.routeHash).sort(compareText),
  });
  const budgetExecution = routeBudgetExecutionOf(bindings, input.budget, budgetObservation, []);
  const payload = {
    schemaVersion: STRATEGIC_ROUTE_GENERATION_V1_SCHEMA_VERSION,
    ...bindings,
    budget: input.budget,
    generationStatus: "COMPLETE" as const,
    routeCandidates: routes,
    routeCount: observedRouteCount,
    conflictExpansionCount: observedConflictExpansionCount,
    evidenceCost: observedEvidenceCost,
    generationWorkObservedCount: tracker.observed,
    budgetObservation,
    budgetExecution,
    exhaustedDimensions: [] as readonly StrategicRouteBudgetDimensionV1[],
    reasonCodes: [] as readonly StrategicRouteGenerationReasonCodeV1[],
    routeUniverseHash,
    semanticBoundary: "ROUTE_CANDIDATE_FACTS_NOT_AI_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
};

function* branchesOf(
  fact: StrategicResourceReservationFactV1,
  alternatives: readonly StrategicReservationAlternativeFactV1[],
  claimById: ReadonlyMap<string, StrategicResourceReservationClaimV1>,
  hasWildcardContention: boolean,
  tracker: GenerationWorkTrackerV1,
): Generator<RouteBranchV1> {
  const control = alternatives.filter((alternative) =>
    claimById.get(alternative.claimId)?.hierarchyTier === "TIER1_CONTROL");
  const tier2 = alternatives.filter((alternative) =>
    claimById.get(alternative.claimId)?.hierarchyTier === "TIER2_COMPOSITE");
  const tier3 = alternatives.filter((alternative) =>
    claimById.get(alternative.claimId)?.hierarchyTier === "TIER3_ATOMIC");
  const emitted = new Set<string>();
  const emit = function* (selected: readonly StrategicReservationAlternativeFactV1[]): Generator<RouteBranchV1> {
    if (selected.length === 0) return;
    tracker.attempt();
    const ordered = [...selected].sort((left, right) => compareText(
      left.alternativeReservationFactId,
      right.alternativeReservationFactId,
    ));
    const key = ordered.map((alternative) => alternative.alternativeReservationFactId).join("|");
    if (emitted.has(key)) return;
    emitted.add(key);
    yield { alternatives: ordered };
  };
  for (const tier1Set of streamingMaximalSets(control, new Set(), tracker)) {
    const tier1Cards = new Set(tier1Set.flatMap((alternative) => alternative.physicalCardIds));
    for (const tier2Set of streamingMaximalSets(tier2, tier1Cards, tracker)) {
      const throughTier2 = [...tier1Set, ...tier2Set];
      const throughTier2Cards = new Set(throughTier2.flatMap((alternative) => alternative.physicalCardIds));
      for (const tier3Set of streamingMaximalSets(tier3, throughTier2Cards, tracker)) {
        yield* emit([...throughTier2, ...tier3Set]);
      }
    }
  }
  const hasHigherTierClaim = fact.claims.some((claim) => claim.hierarchyTier === "TIER1_CONTROL");
  const lowerTierVisibleWithoutControl = !hasHigherTierClaim
    || fact.reservationState === "CONDITIONALLY_RELEASABLE"
    || fact.reservationState === "RELEASED_TO_NEXT_TIER"
    || hasWildcardContention;
  if (lowerTierVisibleWithoutControl) {
    for (const tier2Set of streamingMaximalSets(tier2, new Set(), tracker)) {
      const tier2Cards = new Set(tier2Set.flatMap((alternative) => alternative.physicalCardIds));
      for (const tier3Set of streamingMaximalSets(tier3, tier2Cards, tracker)) {
        yield* emit([...tier2Set, ...tier3Set]);
      }
    }
  } else {
    const defensiveLowerTier = [...tier2, ...tier3].filter((alternative) =>
      claimById.get(alternative.claimId)?.claimRoles.includes("LEVEL_RANK_DEFENSE") === true);
    for (const defenseSet of streamingMaximalSets(defensiveLowerTier, new Set(), tracker)) {
      yield* emit(defenseSet);
    }
  }
}

function* streamingMaximalSets(
  alternatives: readonly StrategicReservationAlternativeFactV1[],
  initiallyUsedPhysicalCardIds: ReadonlySet<string>,
  tracker: GenerationWorkTrackerV1,
): Generator<StrategicReservationAlternativeFactV1[]> {
  tracker.attempt();
  const available = alternatives.filter((alternative) =>
    alternative.physicalCardIds.every((cardId) => !initiallyUsedPhysicalCardIds.has(cardId)));
  if (available.length === 0) {
    yield [];
    return;
  }
  const visit = function* (
    index: number,
    selected: StrategicReservationAlternativeFactV1[],
    usedPhysicalCardIds: ReadonlySet<string>,
  ): Generator<StrategicReservationAlternativeFactV1[]> {
    tracker.attempt();
    if (index === available.length) {
      const selectedIds = new Set(selected.map((alternative) => alternative.alternativeReservationFactId));
      const canExtend = available.some((alternative) =>
        !selectedIds.has(alternative.alternativeReservationFactId)
        && alternative.physicalCardIds.every((cardId) => !usedPhysicalCardIds.has(cardId)));
      if (!canExtend) yield [...selected];
      return;
    }
    const alternative = available[index];
    if (alternative.physicalCardIds.every((cardId) => !usedPhysicalCardIds.has(cardId))) {
      yield* visit(
        index + 1,
        [...selected, alternative],
        new Set([...usedPhysicalCardIds, ...alternative.physicalCardIds]),
      );
    }
    yield* visit(index + 1, selected, usedPhysicalCardIds);
  };
  yield* visit(0, [], new Set(initiallyUsedPhysicalCardIds));
}

function routeOf(
  input: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0],
  fact: StrategicResourceReservationFactV1,
  branch: RouteBranchV1,
  allAlternatives: readonly StrategicReservationAlternativeFactV1[],
  claimById: ReadonlyMap<string, StrategicResourceReservationClaimV1>,
  conflictById: ReadonlyMap<string, StrategicReservationConflictFactV1>,
): StrategicRouteCandidateFactV1 | StrategicRouteGenerationReasonCodeV1 {
  const selectedPhysicalCardIds = branch.alternatives.flatMap((alternative) => alternative.physicalCardIds);
  if (new Set(selectedPhysicalCardIds).size !== selectedPhysicalCardIds.length) {
    return "DUPLICATE_PHYSICAL_CARD_ALLOCATION";
  }
  const selectedWildcardCardIds = branch.alternatives.flatMap((alternative) => alternative.wildcardCardIds);
  if (new Set(selectedWildcardCardIds).size !== selectedWildcardCardIds.length) {
    return "DUPLICATE_WILDCARD_ALLOCATION";
  }
  if (branch.alternatives.some((alternative) =>
    alternative.wildcardCardIds.length > 0
    && (alternative.wildcardAllocationLineage.length !== 1
      || !sameStrings(
        alternative.wildcardCardIds,
        sortedUnique(alternative.wildcardAllocationLineage.flatMap((lineage) => lineage.wildcardCardIds)),
      )))) {
    return "UNFIXED_WILDCARD_ALLOCATION";
  }

  const selectedClaims = branch.alternatives.map((alternative) => claimById.get(alternative.claimId)!);
  const routeClasses = routeClassesOf(selectedClaims);
  if (routeClasses.length === 0) return "UNRELEASED_HIGHER_TIER_RESOURCE";
  const branchLocalResolutionWitnesses = branchLocalResolutionWitnessesOf(
    fact,
    branch,
    allAlternatives,
    conflictById,
  );
  if (typeof branchLocalResolutionWitnesses === "string") return branchLocalResolutionWitnesses;
  const preservedResources = sortedUnique(branch.alternatives.flatMap((alternative) => {
    const claim = claimById.get(alternative.claimId)!;
    return claim.hierarchyTier === "TIER1_CONTROL" || claim.claimRoles.includes("LEVEL_RANK_DEFENSE")
      ? alternative.physicalCardIds
      : [];
  }));
  const consumedResources = sortedUnique(branch.alternatives.flatMap((alternative) => {
    const claim = claimById.get(alternative.claimId)!;
    return claim.hierarchyTier !== "TIER1_CONTROL" && !claim.claimRoles.includes("LEVEL_RANK_DEFENSE")
      ? alternative.physicalCardIds
      : [];
  }));
  const remainderPhysicalCardIds = fact.physicalCardIds.filter((cardId) =>
    !preservedResources.includes(cardId) && !consumedResources.includes(cardId));
  const accountedPhysicalCardIds = sortedUnique([
    ...preservedResources,
    ...consumedResources,
    ...remainderPhysicalCardIds,
  ]);
  if (!sameStrings(accountedPhysicalCardIds, fact.physicalCardIds)) {
    return "INCOMPLETE_COMPONENT_ACCOUNTING";
  }

  const metadataByFamilyId = new Map(input.hierarchyBatch.families.map((family) => [family.familyId, family]));
  const resourceClaims = branch.alternatives.map((alternative) =>
    routeClaimOf(alternative, claimById.get(alternative.claimId)!));
  const supportingHierarchyFacts = sortedUnique(resourceClaims.map((claim) => claim.familyId)).map((familyId) => ({
    familyId,
    classificationHash: metadataByFamilyId.get(familyId)!.classificationHash,
  }));
  const selectedAlternativeIds = branch.alternatives
    .map((alternative) => alternative.alternativeReservationFactId)
    .sort(compareText);
  const supportingReservationFacts = [{
    reservationFactId: fact.reservationFactId,
    alternativeReservationFactIds: selectedAlternativeIds,
  }];
  const preservationFactCodes = preservationFactCodesOf(fact, routeClasses, selectedWildcardCardIds);
  const exactHandCountReduction = resourceClaims.reduce((sum, claim) =>
    sum + metadataByFamilyId.get(claim.familyId)!.handCountReduction, 0);
  const endpointPayload = {
    routeClasses,
    resourceComponentId: fact.resourceComponentId,
    closedThroughTier: "TIER3_ATOMIC" as const,
    accountedPhysicalCardIds,
    remainderPhysicalCardIds,
    exactHandCountReduction,
    preservationFactCodes,
    independentComponentIds: [] as readonly string[],
  };
  const endpointFacts = { ...endpointPayload, endpointHash: canonicalHash(endpointPayload) };
  const routeId = canonicalHash({
    kind: "strategic-route-candidate-id-v1",
    resourceComponentId: fact.resourceComponentId,
    routeClasses,
    selectedAlternativeIds,
    preservedResources,
    consumedResources,
    remainderPhysicalCardIds,
    unresolvedConflicts: [...fact.conflictFactIds].sort(compareText),
    endpointHash: endpointFacts.endpointHash,
  });
  const routePayload = {
    routeId,
    supportingHierarchyFacts,
    supportingReservationFacts,
    resourceClaims,
    preservedResources,
    consumedResources,
    unresolvedConflicts: [...fact.conflictFactIds].sort(compareText),
    branchLocalResolutionWitnesses,
    endpointFacts,
    semanticBoundary: "STRATEGIC_ROUTE_CANDIDATE_FACT_NOT_DECISION" as const,
  };
  return { ...routePayload, routeHash: canonicalHash(routePayload) };
}

function branchLocalResolutionWitnessesOf(
  fact: StrategicResourceReservationFactV1,
  branch: RouteBranchV1,
  allAlternatives: readonly StrategicReservationAlternativeFactV1[],
  conflictById: ReadonlyMap<string, StrategicReservationConflictFactV1>,
): readonly StrategicRouteBranchLocalResolutionWitnessV1[] | StrategicRouteGenerationReasonCodeV1 {
  const witnesses: StrategicRouteBranchLocalResolutionWitnessV1[] = [];
  const knownAlternativeIds = new Set(
    allAlternatives.map((alternative) => alternative.alternativeReservationFactId),
  );
  for (const conflictFactId of [...fact.conflictFactIds].sort(compareText)) {
    const conflict = conflictById.get(conflictFactId);
    if (conflict === undefined || conflict.resolutionState !== "UNRESOLVED") {
      return "BRANCH_LOCAL_RESOLUTION_UNPROVEN";
    }
    if (conflict.alternativeReservationFactIds.some((alternativeId) => !knownAlternativeIds.has(alternativeId))) {
      return "BRANCH_LOCAL_RESOLUTION_UNPROVEN";
    }
    const selected = branch.alternatives
      .filter((alternative) => conflict.alternativeReservationFactIds.includes(
        alternative.alternativeReservationFactId,
      ))
      .sort((left, right) => compareText(
        left.alternativeReservationFactId,
        right.alternativeReservationFactId,
      ));
    if (selected.length === 0) return "BRANCH_LOCAL_RESOLUTION_UNPROVEN";
    const allocations = selected.map((alternative): StrategicRouteBranchLocalAllocationV1 => {
      const allocationPayload = {
        alternativeReservationFactId: alternative.alternativeReservationFactId,
        alternativeHash: alternative.alternativeHash,
        resourceUnitId: alternative.resourceUnitId,
        physicalCardIds: [...alternative.physicalCardIds].sort(compareText),
        wildcardCardIds: [...alternative.wildcardCardIds].sort(compareText),
        wildcardAllocationLineage: [...alternative.wildcardAllocationLineage]
          .sort((left, right) => compareText(left.allocationVariantHash, right.allocationVariantHash)),
      };
      return { ...allocationPayload, allocationHash: canonicalHash(allocationPayload) };
    });
    const witnessPayload = {
      witnessKind: "BRANCH_LOCAL_RESOLUTION" as const,
      conflictFactId,
      selectedAlternativeReservationFactIds: allocations
        .map((allocation) => allocation.alternativeReservationFactId),
      allocations,
    };
    witnesses.push({ ...witnessPayload, witnessHash: canonicalHash(witnessPayload) });
  }
  return witnesses;
}

function routeClaimOf(
  alternative: StrategicReservationAlternativeFactV1,
  claim: StrategicResourceReservationClaimV1,
): StrategicRouteResourceClaimV1 {
  return {
    claimId: claim.claimId,
    familyId: claim.familyId,
    memberIds: [alternative.memberId],
    resourceUnitIds: [alternative.resourceUnitId],
    alternativeReservationFactIds: [alternative.alternativeReservationFactId],
    hierarchyTier: claim.hierarchyTier,
    controlRank: claim.controlRank,
    efficiencyRank: claim.efficiencyRank,
    reservationClass: claim.reservationClass,
    claimRoles: [...claim.claimRoles],
    physicalCardIds: [...alternative.physicalCardIds],
    wildcardCardIds: [...alternative.wildcardCardIds],
    wildcardAllocationLineage: [...alternative.wildcardAllocationLineage],
    claimHash: claim.claimHash,
  };
}

function routeClassesOf(
  claims: readonly StrategicResourceReservationClaimV1[],
): StrategicRouteClassV1[] {
  const classes = new Set<StrategicRouteClassV1>();
  if (claims.some((claim) => claim.hierarchyTier === "TIER1_CONTROL")) {
    classes.add("CONTROL_PRESERVATION");
  }
  if (claims.some((claim) => claim.claimRoles.includes("LEVEL_RANK_DEFENSE"))) {
    classes.add("LEVEL_DEFENSE_PRESERVATION");
  }
  if (claims.some((claim) => claim.hierarchyTier !== "TIER1_CONTROL"
    && !claim.claimRoles.includes("LEVEL_RANK_DEFENSE"))) {
    classes.add("EFFICIENCY_RELEASE");
  }
  return ROUTE_CLASS_SCHEMA_ORDER.filter((routeClass) => classes.has(routeClass));
}

function preservationFactCodesOf(
  fact: StrategicResourceReservationFactV1,
  routeClasses: readonly StrategicRouteClassV1[],
  wildcardCardIds: readonly string[],
): StrategicRoutePreservationFactCodeV1[] {
  const facts = new Set<StrategicRoutePreservationFactCodeV1>();
  if (routeClasses.includes("CONTROL_PRESERVATION")) facts.add("CONTROL_RESOURCE_PRESERVED");
  if (routeClasses.includes("LEVEL_DEFENSE_PRESERVATION")) facts.add("LEVEL_RANK_DEFENSE_PRESERVED");
  if (wildcardCardIds.length > 0) facts.add("WILDCARD_ALLOCATION_FIXED");
  if (routeClasses.includes("EFFICIENCY_RELEASE") && fact.releaseConditions.length > 0) {
    facts.add("HIGHER_TIER_RELEASE_WITNESSED");
  }
  return [...facts].sort(compareText);
}

function validInputBindings(input: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0]): boolean {
  const { hierarchyBatch, reservationArtifact } = input;
  return hierarchyBatch.identityHash === reservationArtifact.identityHash
    && hierarchyBatch.snapshotHash === reservationArtifact.snapshotHash
    && hierarchyBatch.sourceRootHash === reservationArtifact.sourceRootHash
    && hierarchyBatch.provenanceRoot === reservationArtifact.provenanceRoot
    && hierarchyBatch.sourceInventoryHash === reservationArtifact.sourceInventoryHash
    && sameStrings(hierarchyBatch.classificationHashes, reservationArtifact.sourceClassificationHashes);
}

function validReferences(
  input: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0],
  fact: StrategicResourceReservationFactV1,
  alternatives: readonly StrategicReservationAlternativeFactV1[],
  claimById: ReadonlyMap<string, StrategicResourceReservationClaimV1>,
): boolean {
  const familyById = new Map(input.hierarchyBatch.families.map((family) => [family.familyId, family]));
  const unitById = new Map(input.reservationArtifact.resourceUnits.map((unit) => [unit.resourceUnitId, unit]));
  const conflictById = new Map(input.reservationArtifact.conflictFacts.map((conflict) => [conflict.conflictFactId, conflict]));
  if (fact.claims.length === 0 || alternatives.length === 0
    || fact.conflictFactIds.some((conflictId) => !conflictById.has(conflictId))) return false;
  for (const alternative of alternatives) {
    const claim = claimById.get(alternative.claimId);
    const unit = unitById.get(alternative.resourceUnitId);
    const metadata = familyById.get(alternative.familyId);
    if (claim === undefined || unit === undefined || metadata === undefined
      || claim.familyId !== alternative.familyId
      || unit.sourceMemberId !== alternative.memberId
      || unit.sourceFamilyId !== alternative.familyId
      || !claim.memberIds.includes(alternative.memberId)
      || !claim.resourceUnitIds.includes(alternative.resourceUnitId)
      || !sameStrings(unit.physicalCardIds, alternative.physicalCardIds)
      || !sameStrings(unit.wildcardCardIds, alternative.wildcardCardIds)) return false;
  }
  return true;
}

function validBudget(budget: StrategicRouteGenerationBudgetV1): boolean {
  return [budget.maxRouteCount, budget.maxConflictExpansion, budget.maxEvidenceCost]
    .every((value) => Number.isInteger(value) && value > 0);
}

function generationWorkTracker(limit: number): GenerationWorkTrackerV1 {
  const tracker: GenerationWorkTrackerV1 = {
    limit,
    observed: 0,
    attempt: () => {
      tracker.observed += 1;
      if (tracker.observed > tracker.limit) throw GENERATION_WORK_EXHAUSTED;
    },
  };
  return tracker;
}

function sourceValidationWithinLimit(
  input: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0],
): boolean {
  const batch = input.hierarchyBatch;
  const reservation = input.reservationArtifact;
  let work = 0;
  const add = (count: number): boolean => {
    work += count;
    return work <= SOURCE_VALIDATION_WORK_LIMIT_V1;
  };
  if (!add(batch.families.length)
    || !add(batch.sourceFamilyIds.length)
    || !add(batch.classificationHashes.length)
    || !add(reservation.resourceUnits.length)
    || !add(reservation.reservationFacts.length)
    || !add(reservation.reservationAlternatives.length)
    || !add(reservation.conflictFacts.length)) return false;
  for (const fact of reservation.reservationFacts) {
    if (!add(fact.claims.length + fact.conflictFactIds.length)) return false;
  }
  return true;
}

function selfHashValid(value: { readonly batchHash: string; readonly [key: string]: unknown }): boolean {
  const { batchHash, ...payload } = value;
  return canonicalHash(payload) === batchHash;
}

function evidenceCostOf(route: StrategicRouteCandidateFactV1): number {
  return route.supportingHierarchyFacts.length
    + route.supportingReservationFacts.length
    + route.resourceClaims.length
    + route.preservedResources.length
    + route.consumedResources.length
    + route.unresolvedConflicts.length
    + route.branchLocalResolutionWitnesses.length
    + 1;
}

function exhaustedDimensionsOf(
  budget: StrategicRouteGenerationBudgetV1,
  routeCount: number,
  generationWorkCount: number,
  evidenceCost: number,
): StrategicRouteBudgetDimensionV1[] {
  const exhausted: StrategicRouteBudgetDimensionV1[] = [];
  if (routeCount > budget.maxRouteCount) exhausted.push("MAX_ROUTE_COUNT");
  if (generationWorkCount > budget.maxConflictExpansion) exhausted.push("MAX_CONFLICT_EXPANSION");
  if (evidenceCost > budget.maxEvidenceCost) exhausted.push("MAX_EVIDENCE_COST");
  return exhausted;
}

function reasonOfExhaustedDimension(
  dimension: StrategicRouteBudgetDimensionV1,
): StrategicRouteGenerationReasonCodeV1 {
  if (dimension === "MAX_ROUTE_COUNT") return "MAX_ROUTE_COUNT_EXHAUSTED";
  if (dimension === "MAX_CONFLICT_EXPANSION") return "MAX_CONFLICT_EXPANSION_EXHAUSTED";
  return "MAX_EVIDENCE_COST_EXHAUSTED";
}

function bindingsOf(input: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0]): ArtifactBindingsV1 {
  return {
    identityHash: input.hierarchyBatch.identityHash,
    snapshotHash: input.hierarchyBatch.snapshotHash,
    sourceRootHash: input.hierarchyBatch.sourceRootHash,
    provenanceRoot: input.hierarchyBatch.provenanceRoot,
    sourceInventoryHash: input.hierarchyBatch.sourceInventoryHash,
    sourceHierarchyBatchHash: input.hierarchyBatch.batchHash,
    sourceReservationArtifactHash: input.reservationArtifact.artifactHash,
  };
}

function inconclusiveArtifact(
  bindings: ArtifactBindingsV1,
  budget: StrategicRouteGenerationBudgetV1,
  reasonCodes: readonly StrategicRouteGenerationReasonCodeV1[],
  exhaustedDimensions: readonly StrategicRouteBudgetDimensionV1[],
  budgetObservation: StrategicRouteBudgetObservationV1,
): StrategicRouteGenerationArtifactV1 {
  return terminalArtifact(
    "INCONCLUSIVE",
    bindings,
    budget,
    reasonCodes,
    exhaustedDimensions,
    budgetObservation,
  );
}

function rejectedArtifact(
  bindings: ArtifactBindingsV1,
  budget: StrategicRouteGenerationBudgetV1,
  reasonCodes: readonly StrategicRouteGenerationReasonCodeV1[],
  budgetObservation: StrategicRouteBudgetObservationV1,
): StrategicRouteGenerationArtifactV1 {
  return terminalArtifact("REJECTED", bindings, budget, reasonCodes, [], budgetObservation);
}

function terminalArtifact(
  generationStatus: "INCONCLUSIVE" | "REJECTED",
  bindings: ArtifactBindingsV1,
  budget: StrategicRouteGenerationBudgetV1,
  reasonCodes: readonly StrategicRouteGenerationReasonCodeV1[],
  exhaustedDimensions: readonly StrategicRouteBudgetDimensionV1[],
  budgetObservation: StrategicRouteBudgetObservationV1,
): StrategicRouteGenerationArtifactV1 {
  const budgetExecution = routeBudgetExecutionOf(
    bindings,
    budget,
    budgetObservation,
    exhaustedDimensions,
  );
  const payload = {
    schemaVersion: STRATEGIC_ROUTE_GENERATION_V1_SCHEMA_VERSION,
    ...bindings,
    budget,
    generationStatus,
    routeCandidates: null,
    routeCount: 0,
    conflictExpansionCount: 0,
    evidenceCost: 0,
    generationWorkObservedCount: budgetObservation.generationWorkObservedCount,
    budgetObservation,
    budgetExecution,
    exhaustedDimensions: [...exhaustedDimensions].sort(compareText),
    reasonCodes: [...reasonCodes].sort(compareText),
    routeUniverseHash: null,
    semanticBoundary: "ROUTE_CANDIDATE_FACTS_NOT_AI_DECISION" as const,
  };
  return deepFreeze({ ...payload, artifactHash: canonicalHash(payload) });
}

function routeBudgetExecutionOf(
  bindings: ArtifactBindingsV1,
  budget: StrategicRouteGenerationBudgetV1,
  observation: StrategicRouteBudgetObservationV1,
  exhaustedDimensions: readonly StrategicRouteBudgetDimensionV1[],
): StrategicBudgetExecutionArtifactV1 {
  const dimensionMap: Readonly<Record<StrategicRouteBudgetDimensionV1, StrategicBudgetDimensionV1>> = {
    MAX_ROUTE_COUNT: "ROUTE_CANDIDATE_COUNT",
    MAX_CONFLICT_EXPANSION: "CONFLICT_EXPANSION_COUNT",
    MAX_EVIDENCE_COST: "EVIDENCE_COST",
  };
  const routeLimit = validBudget(budget) ? budget.maxRouteCount : 0;
  const conflictLimit = validBudget(budget) ? budget.maxConflictExpansion : 0;
  const evidenceLimit = validBudget(budget) ? budget.maxEvidenceCost : 0;
  return materializeStrategicBudgetExecutionV1({
    measurements: [
      {
        dimension: "ROUTE_CANDIDATE_COUNT",
        limit: routeLimit,
        observedCount: observation.observedRouteCount,
        measurementCompleteness: observation.measurementCompleteness,
      },
      {
        dimension: "CONFLICT_EXPANSION_COUNT",
        limit: conflictLimit,
        observedCount: observation.generationWorkObservedCount,
        measurementCompleteness: observation.measurementCompleteness,
      },
      {
        dimension: "EVIDENCE_COST",
        limit: evidenceLimit,
        observedCount: observation.observedEvidenceCost,
        measurementCompleteness: observation.measurementCompleteness,
      },
    ],
    exhaustedDimensions: exhaustedDimensions.map((dimension) => dimensionMap[dimension]),
    sourceHashBindings: [
      { sourceKind: "STRATEGIC_STRUCTURE_INVENTORY", sourceHash: bindings.sourceInventoryHash },
      { sourceKind: "STRATEGIC_HIERARCHY_CLASSIFICATION_BATCH", sourceHash: bindings.sourceHierarchyBatchHash },
      { sourceKind: "STRATEGIC_RESOURCE_RESERVATION_ARTIFACT", sourceHash: bindings.sourceReservationArtifactHash },
    ],
  });
}

function exactObservation(): StrategicRouteBudgetObservationV1 {
  return {
    observedRouteCount: 0,
    observedConflictExpansionCount: 0,
    observedEvidenceCost: 0,
    generationWorkObservedCount: 0,
    measurementCompleteness: "EXACT",
  };
}

function lowerBoundObservation(
  observedRouteCount: number,
  observedConflictExpansionCount: number,
  observedEvidenceCost: number,
  generationWorkObservedCount: number,
): StrategicRouteBudgetObservationV1 {
  return {
    observedRouteCount,
    observedConflictExpansionCount,
    observedEvidenceCost,
    generationWorkObservedCount,
    measurementCompleteness: "LOWER_BOUND_AT_EXHAUSTION",
  };
}

function hashReservationArtifact(
  artifact: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0]["reservationArtifact"],
): string {
  const { artifactHash: _artifactHash, ...payload } = artifact;
  return canonicalHash(payload);
}

function sameReservationSemantics(
  supplied: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0]["reservationArtifact"],
  replay: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0]["reservationArtifact"],
): boolean {
  return supplied.identityHash === replay.identityHash
    && supplied.snapshotHash === replay.snapshotHash
    && supplied.sourceRootHash === replay.sourceRootHash
    && supplied.provenanceRoot === replay.provenanceRoot
    && supplied.sourceInventoryHash === replay.sourceInventoryHash
    && sameStrings(supplied.sourceClassificationHashes, replay.sourceClassificationHashes)
    && sameStrings(
      supplied.resourceUnits.map((unit) => unit.resourceUnitHash),
      replay.resourceUnits.map((unit) => unit.resourceUnitHash),
    )
    && supplied.resourceUnits.every(resourceUnitSelfHashValid)
    && sameReservationFacts(supplied.reservationFacts, replay.reservationFacts)
    && supplied.reservationAlternatives.every(reservationAlternativeSelfHashValid)
    && supplied.conflictFacts.every(reservationConflictSelfHashValid)
    && sameStrings(
      supplied.reservationAlternatives.map((alternative) => alternative.alternativeHash),
      replay.reservationAlternatives.map((alternative) => alternative.alternativeHash),
    )
    && sameStrings(
      supplied.conflictFacts.map((conflict) => conflict.conflictHash),
      replay.conflictFacts.map((conflict) => conflict.conflictHash),
    );
}

function resourceUnitSelfHashValid(
  unit: Parameters<StrategicRouteCandidateFactsGeneratorV1>[0]["reservationArtifact"]["resourceUnits"][number],
): boolean {
  const { resourceUnitHash, ...payload } = unit;
  return resourceUnitHash === canonicalHash(payload);
}

function sameReservationFacts(
  suppliedFacts: readonly StrategicResourceReservationFactV1[],
  replayFacts: readonly StrategicResourceReservationFactV1[],
): boolean {
  if (suppliedFacts.length !== replayFacts.length) return false;
  const replayById = new Map(replayFacts.map((fact) => [fact.reservationFactId, fact]));
  return suppliedFacts.every((supplied) => {
    const replay = replayById.get(supplied.reservationFactId);
    return replay !== undefined
      && supplied.resourceComponentId === replay.resourceComponentId
      && supplied.reservationState === replay.reservationState
      && supplied.semanticBoundary === replay.semanticBoundary
      && sameStrings(supplied.resourceUnitIds, replay.resourceUnitIds)
      && sameStrings(supplied.physicalCardIds, replay.physicalCardIds)
      && sameStrings(supplied.naturalCardIds, replay.naturalCardIds)
      && sameStrings(supplied.wildcardCardIds, replay.wildcardCardIds)
      && sameStrings(supplied.claims.map((claim) => claim.claimHash), replay.claims.map((claim) => claim.claimHash))
      && supplied.claims.every(reservationClaimSelfHashValid)
      && reservationFactSelfHashValid(supplied)
      && sameStrings(supplied.releaseConditions, replay.releaseConditions)
      && sameStrings(supplied.conflictFactIds, replay.conflictFactIds)
      && sameStrings(supplied.parentReservationFactIds, replay.parentReservationFactIds);
  });
}

function reservationClaimSelfHashValid(
  claim: StrategicResourceReservationClaimV1,
): boolean {
  const { claimHash, ...payload } = claim;
  return claimHash === canonicalHash(payload);
}

function reservationFactSelfHashValid(
  fact: StrategicResourceReservationFactV1,
): boolean {
  const { reservationHash, ...payload } = fact;
  return reservationHash === canonicalHash(payload);
}

function reservationAlternativeSelfHashValid(
  alternative: StrategicReservationAlternativeFactV1,
): boolean {
  const { alternativeHash, ...payload } = alternative;
  return alternativeHash === canonicalHash(payload);
}

function reservationConflictSelfHashValid(
  conflict: StrategicReservationConflictFactV1,
): boolean {
  const { conflictHash, ...payload } = conflict;
  return conflictHash === canonicalHash(payload);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort(compareText);
  const rightSorted = [...right].sort(compareText);
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
