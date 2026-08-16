import { describe, expect, it } from "vitest";
import { createDeck, type Card } from "../../src/engine/cards";
import { detectGroups } from "../../src/engine/groups";
import { buildPublicGameIdentity, playPublicStableKey, tributePublicStableKey, type PublicActionEvent, type PublicActionEventDraft } from "../../src/game/publicEvent";
import { applyPublicEvent, canonicalPublicLedgerHash, createInitialPublicLedger } from "../../src/game/publicLedger";
import { finalizePublicActionEvent } from "../../src/game/publicEventHash";
import type { D2FShadowPreActionSnapshot } from "../../src/ai/rollout/contracts";
import { buildParticleBank } from "../../src/ai/particles/particleBankBuilder";
import { createParticleBankHandle, readParticleBankInternals } from "../../src/ai/particles/particleBankInternals";
import {
  canonicalActionIdentity,
  canonicalReplayContextIdentity,
  createRolloutRequest,
  createRolloutResult,
  validateRolloutBudget,
  type RolloutAction,
  type RolloutPublicState,
} from "../../src/ai/rollout/contracts";
import { aggregateRolloutCandidates } from "../../src/ai/rollout/aggregation";
import { validateRolloutEvidence } from "../../src/ai/rollout/evidenceGate";
import { runRolloutReplicate } from "../../src/ai/rollout/kernel";
import { createParticleScenarioSource, createRolloutReplicateInputFromValidatedSource } from "../../src/ai/rollout/particleScenarioSource";
import { rankCandidateRollouts } from "../../src/ai/rollout/ranking";
import { createCanonicalRolloutSchedule, createRolloutInputRandomView } from "../../src/ai/rollout/rolloutInputFreeze";

type RealRolloutParticleBankConfig = Omit<D2FShadowPreActionSnapshot["particleBankConfig"], "maxSamplingAttempts" | "maxIndexDraws"> & {
  maxSamplingAttempts: number;
  maxIndexDraws: number;
};

type RealRolloutSnapshot = Omit<Pick<D2FShadowPreActionSnapshot,
  | "publicIdentity"
  | "initialLedger"
  | "finalLedger"
  | "publicHistoryEvents"
  | "gameRank"
  | "perspectiveSeat"
  | "actingSeat"
  | "ownCurrentHand"
  | "publicState"
  | "particleBankConfig"
  | "particleBankBaseLedger"
  | "particleBankPendingPublicEvents"
  | "expectedFinalEventIndex"
  | "expectedFinalPublicLedgerHash"
  | "evidenceRequirements"
  | "riskPolicy"
  | "rootIdentity"
>, "particleBankConfig"> & {
  particleBankConfig: RealRolloutParticleBankConfig;
};

function makeRealMultiParticleSnapshot(): { snapshot: RealRolloutSnapshot; rootAction: RolloutAction } {
  const deck = createDeck();
  const playedCards = deck.filter((card) => card.kind === "joker");
  const publicIdentity = buildPublicGameIdentity("d2g-calibration-real-viability", 0, 0, "benchmark-scenario");
  const initialLedger = createInitialPublicLedger({
    identity: publicIdentity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "pending" },
  });
  const events: readonly PublicActionEvent[] = [
    finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: publicIdentity.gameId,
      roundIdentity: publicIdentity.roundIdentity,
      handIdentity: publicIdentity.handIdentity,
      eventIndex: 0,
      kind: "tribute",
      seat: 1,
      publicCardIds: [],
      fromSeat: 1,
      toSeat: 2,
      handCountChanges: { 0: 0, 1: -1, 2: 1, 3: 0 },
      publicStableKey: tributePublicStableKey("tribute", 1, 2),
      trickIndex: 0,
    } satisfies PublicActionEventDraft),
    finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: publicIdentity.gameId,
      roundIdentity: publicIdentity.roundIdentity,
      handIdentity: publicIdentity.handIdentity,
      eventIndex: 1,
      kind: "return",
      seat: 2,
      publicCardIds: [],
      fromSeat: 2,
      toSeat: 1,
      handCountChanges: { 0: 0, 1: 1, 2: -1, 3: 0 },
      publicStableKey: tributePublicStableKey("return", 2, 1),
      trickIndex: 0,
    } satisfies PublicActionEventDraft),
    finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: publicIdentity.gameId,
      roundIdentity: publicIdentity.roundIdentity,
      handIdentity: publicIdentity.handIdentity,
      eventIndex: 2,
      kind: "play",
      seat: 0,
      publicCardIds: playedCards.map((card) => card.id),
      publicStableKey: playPublicStableKey(playedCards.map((card) => card.id)),
      patternType: "joker-bomb",
      groupType: "joker-bomb",
      handCountBefore: 27,
      handCountAfter: 23,
      trickIndex: 0,
    } satisfies PublicActionEventDraft),
  ];
  let finalLedger = initialLedger;
  for (const event of events) {
    const applied = applyPublicEvent(finalLedger, event);
    if (!applied.ok) throw new Error("D2G_REAL_VIABILITY_EVENT_REJECTED");
    finalLedger = applied.ledger;
  }
  const canonicalPlayedCards = finalLedger.playedCardIds.map((id) => deck.find((card) => card.id === id)!);
  const publicState: RolloutPublicState = {
    gameRank: "2",
    actingSeat: 3,
    perspectiveSeat: 0,
    partnerSeat: 2,
    handCounts: { 0: 23, 1: 27, 2: 27, 3: 27 },
    finishOrder: [],
    publicPlayedCardIds: finalLedger.playedCardIds,
    currentLastPlay: detectGroups(canonicalPlayedCards, "2").find((group) => group.type === "joker-bomb") ?? null,
    currentLastPlaySeat: 0,
  };
  const ownCurrentHand: readonly Card[] = deck.filter((card) => !playedCards.some((played) => played.id === card.id)).slice(0, 23);
  const particleBankSnapshot = {
    gameId: publicIdentity.gameId,
    roundIdentity: publicIdentity.roundIdentity,
    handIdentity: publicIdentity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(initialLedger),
    lastAppliedEventIndex: finalLedger.lastAppliedEventIndex,
    ledgerHash: canonicalPublicLedgerHash(finalLedger),
    perspectiveSeat: 0 as const,
    gameRank: "2" as const,
  };
  const rootIdentity = canonicalReplayContextIdentity({
    publicHistoryEvents: events,
    initialLedger,
    finalLedger,
    gameRank: "2",
    perspectiveSeat: 0,
    ownCurrentHand,
    actingSeat: 3,
    publicState,
    particleBankSnapshot,
  });
  const snapshot: RealRolloutSnapshot = {
    publicIdentity,
    initialLedger,
    finalLedger,
    publicHistoryEvents: events,
    gameRank: "2",
    perspectiveSeat: 0,
    actingSeat: 3,
    ownCurrentHand,
    publicState,
    particleBankConfig: {
      schemaVersion: "d2-particle-bank-build-input-v1",
      particleCount: 1,
      maxSamplingAttempts: 64,
      maxIndexDraws: 8,
      samplerConfigVersion: "d2-particle-sampler-v1",
      likelihoodConfig: {
        schemaVersion: "d2-particle-likelihood-v1",
        forcedPassLogFactor: -1,
        couldBeatButPassedLogFactor: -0.25,
        observedLeadPlayLogFactor: -0.1,
        observedFollowPlayLogFactor: -0.2,
        degradedEssThreshold: 1,
        normalizationTolerance: 1e-6,
        essTolerance: 1e-6,
      },
    },
    particleBankBaseLedger: initialLedger,
    particleBankPendingPublicEvents: events,
    expectedFinalEventIndex: finalLedger.lastAppliedEventIndex,
    expectedFinalPublicLedgerHash: canonicalPublicLedgerHash(finalLedger),
    evidenceRequirements: {
      schemaVersion: "d2f-rollout-evidence-requirements-v1",
      minimumEffectiveSampleSize: 1,
      minimumAcceptedScenarioCount: 1,
      minimumCompletedReplicateCount: 1,
      requireCompleteCoverage: true,
    },
    riskPolicy: { schemaVersion: "d2f-rollout-risk-policy-v1", variancePenalty: 0, downsideRiskPenalty: 0 },
    rootIdentity,
  };
  return { snapshot, rootAction: { type: "pass" } };
}

function makeRealProfileRequest(
  snapshot: RealRolloutSnapshot,
  plan: typeof D2G_CALIBRATION_MATRIX[number],
  rootAction: RolloutAction,
) {
  const particleConfig = snapshot.particleBankConfig;
  const builtBank = buildParticleBank({
    schemaVersion: particleConfig.schemaVersion,
    publicIdentity: snapshot.publicIdentity,
    initialLedger: snapshot.initialLedger,
    baseLedger: snapshot.particleBankBaseLedger,
    publicHistoryEvents: snapshot.publicHistoryEvents,
    pendingPublicEvents: snapshot.particleBankPendingPublicEvents,
    expectedFinalEventIndex: snapshot.expectedFinalEventIndex,
    expectedFinalPublicLedgerHash: snapshot.expectedFinalPublicLedgerHash,
    gameRank: snapshot.gameRank,
    actingSeat: snapshot.perspectiveSeat,
    ownCurrentHand: snapshot.ownCurrentHand,
    particleSeed: 0,
    particleCount: plan.budget.particleCount,
    maxSamplingAttempts: Math.max(64, particleConfig.maxSamplingAttempts, plan.budget.particleCount),
    maxIndexDraws: Math.max(8, particleConfig.maxIndexDraws, plan.budget.particleCount),
    samplerConfigVersion: particleConfig.samplerConfigVersion,
    likelihoodConfig: particleConfig.likelihoodConfig,
  });
  if (!builtBank.ok) throw new Error(`${plan.planId} particle bank fixture failed: ${builtBank.reason}`);
  const budget = {
    replicateCountPerScenario: plan.budget.replicateCountPerScenario,
    maxPliesPerReplicate: plan.budget.maxPliesPerReplicate,
    maxPolicyActionEvaluationsPerPly: plan.budget.maxPolicyActionEvaluationsPerPly,
    maxWorkUnits: plan.budget.maxWorkUnits,
  };
  const rawSourceInput = {
    bank: builtBank.bank,
    publicHistoryEvents: structuredClone(snapshot.publicHistoryEvents),
    initialLedger: structuredClone(snapshot.initialLedger),
    finalLedger: structuredClone(snapshot.finalLedger),
    gameRank: snapshot.gameRank,
    perspectiveSeat: snapshot.perspectiveSeat,
    ownCurrentHand: structuredClone(snapshot.ownCurrentHand),
    publicState: structuredClone(snapshot.publicState),
  };
  const normalizedFinalLedger = {
    ...rawSourceInput.finalLedger,
    revealedTransferEvents: rawSourceInput.finalLedger.revealedTransferEvents.map((event) => event.cardId === undefined
      ? { eventIndex: event.eventIndex, kind: event.kind, fromSeat: event.fromSeat, toSeat: event.toSeat }
      : { ...event }),
  };
  const normalizedBankSnapshot = {
    ...builtBank.bank.snapshot,
    ledgerHash: canonicalPublicLedgerHash(normalizedFinalLedger),
  };
  const normalizedBank = createParticleBankHandle(
    { ...builtBank.bank, snapshot: normalizedBankSnapshot },
    readParticleBankInternals(builtBank.bank) ?? { records: [] },
  );
  const normalizedSourceInput = {
    ...rawSourceInput,
    bank: normalizedBank,
    finalLedger: normalizedFinalLedger,
  };
  const normalizedRootIdentity = canonicalReplayContextIdentity({
    publicHistoryEvents: normalizedSourceInput.publicHistoryEvents,
    initialLedger: normalizedSourceInput.initialLedger,
    finalLedger: normalizedSourceInput.finalLedger,
    gameRank: normalizedSourceInput.gameRank,
    perspectiveSeat: normalizedSourceInput.perspectiveSeat,
    ownCurrentHand: normalizedSourceInput.ownCurrentHand,
    actingSeat: normalizedSourceInput.publicState.actingSeat,
    publicState: normalizedSourceInput.publicState,
    particleBankSnapshot: normalizedSourceInput.bank.snapshot,
  });
  const request = createRolloutRequest({
    schemaVersion: "d2f-rollout-request-v2",
    mode: "detached",
    formalExecutionAllowed: false,
    rootIdentity: normalizedRootIdentity,
    scenarioSourceInput: normalizedSourceInput,
    candidates: [{ candidateId: canonicalActionIdentity(rootAction), action: rootAction, baselineEvaluatorScore: 0 }],
    budget,
    limits: {
      maxReplicateCountPerScenario: budget.replicateCountPerScenario,
      maxPliesPerReplicate: budget.maxPliesPerReplicate,
      maxPolicyActionEvaluationsPerPly: budget.maxPolicyActionEvaluationsPerPly,
      maxWorkUnits: budget.maxWorkUnits,
    },
    evidenceRequirements: snapshot.evidenceRequirements,
    riskPolicy: snapshot.riskPolicy,
    policyId: "d2f-lightweight-v1",
  });
  if (!request.ok) throw new Error(`${plan.planId} rollout request fixture failed`);
  return { request: request.value, rawSourceInput };
}

function runRealProfilePipeline(
  snapshot: RealRolloutSnapshot,
  plan: typeof D2G_CALIBRATION_MATRIX[number],
  rootAction: RolloutAction,
) {
  const setup = makeRealProfileRequest(snapshot, plan, rootAction);
  const source = createParticleScenarioSource(setup.rawSourceInput);
  if (!source.ok) throw new Error(`${plan.planId} scenario source failed: ${JSON.stringify(source.failure)}`);
  const request = { ...setup.request, scenarioSourceInput: setup.rawSourceInput };
  const validatedBudget = validateRolloutBudget({ budget: request.budget, limits: request.limits });
  if (!validatedBudget.ok) throw new Error(`${plan.planId} budget validation failed`);
  const evidenceInput = {
    requirements: request.evidenceRequirements,
    effectiveSampleSize: source.effectiveSampleSize,
    acceptedScenarioCount: source.acceptedScenarioCount,
    replicateCountPerScenario: request.budget.replicateCountPerScenario,
    candidateIds: request.candidates.map((candidate) => candidate.candidateId),
    scenarios: source.scenarios,
    results: [],
  };
  const preflight = validateRolloutEvidence(evidenceInput);
  if (!preflight.ok && preflight.failure.kind !== "coverage-mismatch") throw new Error(`${plan.planId} preflight evidence failed: ${JSON.stringify(preflight.failure)}`);
  const schedule = createCanonicalRolloutSchedule(request, source);
  if (!schedule.ok) throw new Error(`${plan.planId} schedule failed: ${JSON.stringify(schedule.failure)}`);
  const replicateResults = [] as ReturnType<typeof runRolloutReplicate>[];
  for (const entry of schedule.value) {
    const random = createRolloutInputRandomView(
      request.rootIdentity,
      entry.scenario.scenarioIdentity,
      entry.replicateIdentity,
      request.scenarioSourceInput.publicState.actingSeat,
    );
    if (!random.ok) throw new Error(`${plan.planId} random view failed: ${JSON.stringify(random.failure)}`);
    const replicateInput = createRolloutReplicateInputFromValidatedSource(
      source,
      entry.sourceScenarioIndex,
      entry.candidate,
      entry.replicateIdentity,
      random.value,
      validatedBudget.value,
    );
    if (!replicateInput.ok) throw new Error(`${plan.planId} replicate input failed: ${JSON.stringify(replicateInput.failure)}`);
    const replicate = runRolloutReplicate(replicateInput.value, request.rootIdentity);
    if (!replicate.ok) throw new Error(`${plan.planId} kernel failed: ${JSON.stringify(replicate.failure)}`);
    replicateResults.push(replicate);
  }
  const completedEvidenceInput = { ...evidenceInput, results: replicateResults };
  const evidence = validateRolloutEvidence(completedEvidenceInput);
  if (!evidence.ok) throw new Error(`${plan.planId} completed evidence failed: ${JSON.stringify(evidence.failure)}`);
  const aggregate = aggregateRolloutCandidates({
    candidates: request.candidates.map(({ candidateId, baselineEvaluatorScore }) => ({ candidateId, baselineEvaluatorScore })),
    evidence: completedEvidenceInput,
    riskPolicy: request.riskPolicy,
  });
  if (!aggregate.ok) throw new Error(`${plan.planId} aggregate failed: ${JSON.stringify(aggregate.failure)}`);
  const ranked = rankCandidateRollouts(aggregate.value.summaries);
  if (!ranked.ok) throw new Error(`${plan.planId} ranking failed`);
  const assembled = createRolloutResult(setup.request, {
    candidateSummaries: aggregate.value.summaries,
    ranking: ranked.ranking,
    aggregateDiagnostics: aggregate.value.diagnostics,
  });
  if (!assembled.ok) throw new Error(`${plan.planId} result assembly failed: ${JSON.stringify(assembled.failure)}`);
  return assembled.value;
}
import {
  D2G_SEED_INVENTORY,
  D2G_CALIBRATION_MATRIX,
  D2G_CALIBRATION_PLAN,
  createD2GCalibrationTreatmentProfile,
  createD2GRunnerConfig,
  runD2GTreatmentBenchmark,
} from "../../scripts/runD2GTreatmentBenchmark";

describe("D2G Task 5A calibration readiness", () => {
  it("creates an explicit calibration-ready configuration without freezing formal", () => {
    const config = createD2GRunnerConfig("calibration-ready", { sourceCommit: "a".repeat(40) });

    expect(config.phase).toBe("calibration-ready");
    expect(config.profile.phase).toBe("calibration");
    expect(config.seedManifest.phase).toBe("calibration");
    expect(config.seedManifest.seeds).toEqual([...D2G_SEED_INVENTORY.calibrationReserved]);
    expect(config.formalProfileFrozen).toBe(false);
    expect(config.formalSeedsExecuted).toBe(false);
  });

  it("binds profile, config, source, room fingerprint, and seed provenance", () => {
    const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });

    expect(config.profile.configurationHash).toBe(config.provenance.profileConfigurationHash);
    expect(config.configHash).toBe(config.provenance.configHash);
    expect(config.profile.benchmarkMetadata.sourceCommit).toBe(config.provenance.sourceCommit);
    expect(config.provenance.roomRulesFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(config.provenance.baseSeeds).toEqual([...config.seedManifest.seeds]);
  });

  it("uses the smallest smoke budget that still permits real rollout evidence", () => {
    const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });

    expect(config.profile.budget).toMatchObject({
      particleCount: 1,
      replicateCountPerScenario: 1,
      maxPliesPerReplicate: 1,
      maxPolicyActionEvaluationsPerPly: 32,
      maxWorkUnits: 32,
    });
  });

  it("freezes four non-Cartesian calibration profiles with distinct configuration hashes", () => {
    expect(D2G_CALIBRATION_MATRIX).toHaveLength(4);
    expect(new Set(D2G_CALIBRATION_MATRIX.map((plan) => plan.planId)).size).toBe(4);
    expect(new Set(D2G_CALIBRATION_MATRIX.map((plan) => plan.planHash)).size).toBe(4);
    expect(D2G_CALIBRATION_MATRIX[0]).toMatchObject({
      planId: "d2g-calibration-p0-reference-v1",
      budget: { particleCount: 1, replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 32, maxWorkUnits: 32 },
    });
    expect(D2G_CALIBRATION_MATRIX[1]).toMatchObject({ planId: "d2g-calibration-p1-particles-v1", budget: { particleCount: 2, replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 32, maxWorkUnits: 32 } });
    expect(D2G_CALIBRATION_MATRIX[2]).toMatchObject({ planId: "d2g-calibration-p2-replicates-v1", budget: { particleCount: 1, replicateCountPerScenario: 2, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 32, maxWorkUnits: 32 } });
    expect(D2G_CALIBRATION_MATRIX[3]).toMatchObject({ planId: "d2g-calibration-p3-depth-v1", budget: { particleCount: 1, replicateCountPerScenario: 1, maxPliesPerReplicate: 2, maxPolicyActionEvaluationsPerPly: 32, maxWorkUnits: 64 } });
  });

  it("keeps planHash independent from source identity while canonical profile hashes bind source identity", () => {
    const sourceA = "a".repeat(40);
    const sourceB = "b".repeat(40);
    const roomRulesFingerprint = createD2GRunnerConfig("smoke", { sourceCommit: sourceA }).roomRulesFingerprint;
    const planHashesBefore = D2G_CALIBRATION_MATRIX.map((plan) => plan.planHash);
    const profilesA = D2G_CALIBRATION_MATRIX.map((plan) => createD2GCalibrationTreatmentProfile({ plan, sourceCommit: sourceA, roomRulesFingerprint }));
    const profilesB = D2G_CALIBRATION_MATRIX.map((plan) => createD2GCalibrationTreatmentProfile({ plan, sourceCommit: sourceB, roomRulesFingerprint }));

    expect(new Set(profilesA.map((profile) => profile.configurationHash)).size).toBe(4);
    expect(profilesA.every((profile) => profile.profileId === "d2g-calibration-v1")).toBe(true);
    expect(profilesA.map((profile) => profile.budget)).toEqual(D2G_CALIBRATION_MATRIX.map((plan) => plan.budget));
    expect(profilesA.every((profile, index) => profile.configurationHash !== D2G_CALIBRATION_MATRIX[index]!.planHash)).toBe(true);
    expect(profilesA.every((profile, index) => profile.configurationHash !== profilesB[index]!.configurationHash)).toBe(true);
    expect(D2G_CALIBRATION_MATRIX.map((plan) => plan.planHash)).toEqual(planHashesBefore);
  });

  it("records the validated work cap for each frozen profile", () => {
    const effectiveCaps = D2G_CALIBRATION_MATRIX.map((plan) => {
      const { particleCount: _particleCount, ...budget } = plan.budget;
      const result = validateRolloutBudget({
        budget,
        limits: {
          maxReplicateCountPerScenario: budget.replicateCountPerScenario,
          maxPliesPerReplicate: budget.maxPliesPerReplicate,
          maxPolicyActionEvaluationsPerPly: budget.maxPolicyActionEvaluationsPerPly,
          maxWorkUnits: budget.maxWorkUnits,
        },
      });
      if (!result.ok) throw new Error("calibration budget should validate");
      return result.value.maximumWorkUnits;
    });

    expect(effectiveCaps).toEqual([32, 32, 32, 64]);
  });

  it("proves each frozen profile through the real detached rollout pipeline", () => {
    const fixture = makeRealMultiParticleSnapshot();
    const viableAction = fixture.rootAction;
    const p0Result = runRealProfilePipeline(fixture.snapshot, D2G_CALIBRATION_MATRIX[0]!, viableAction);
    expect(p0Result.ranking.length).toBeGreaterThan(0);
    expect(p0Result.aggregateDiagnostics.coverage).toBe("complete");
    expect(p0Result.aggregateDiagnostics.workUnitCount).toBeGreaterThan(0);
    expect(p0Result.candidateSummaries.every((summary) => summary.workUnitCount <= 32)).toBe(true);
    const results = D2G_CALIBRATION_MATRIX.slice(1).reduce<typeof p0Result[]>((all, plan) => {
      const result = runRealProfilePipeline(fixture.snapshot, plan, viableAction!);
      expect(result.ranking.length).toBeGreaterThan(0);
      expect(result.aggregateDiagnostics.coverage).toBe("complete");
      expect(result.aggregateDiagnostics.workUnitCount).toBeGreaterThan(0);
      expect(result.candidateSummaries.every((summary) => summary.workUnitCount <= (plan.planId.endsWith("p3-depth-v1") ? 64 : 32))).toBe(true);
      all.push(result);
      return all;
    }, [p0Result]);

    const [p0, p1, p2, p3] = results;
    expect(p0!.aggregateDiagnostics.acceptedScenarioCount).toBe(1);
    expect(p0!.aggregateDiagnostics.completedReplicateCount).toBe(1);
    expect(p1!.aggregateDiagnostics.acceptedScenarioCount).toBeGreaterThanOrEqual(2);
    expect(p1!.candidateSummaries.every((summary) => summary.acceptedScenarioCount >= 2)).toBe(true);
    expect(p2!.aggregateDiagnostics.completedReplicateCount).toBe(2);
    expect(p2!.candidateSummaries.every((summary) => summary.completedReplicateCount === 2)).toBe(true);
    expect(p3!.aggregateDiagnostics.acceptedScenarioCount).toBe(1);
    expect(p3!.aggregateDiagnostics.completedReplicateCount).toBe(1);
    expect(p3!.candidateSummaries.every((summary, index) => summary.workUnitCount > p0!.candidateSummaries[index]!.workUnitCount)).toBe(true);
    console.log("D2G_REAL_PROFILE_VIABILITY", JSON.stringify(results.map((result) => ({
      acceptedScenarioCount: result.aggregateDiagnostics.acceptedScenarioCount,
      completedReplicateCount: result.aggregateDiagnostics.completedReplicateCount,
      workUnitCount: result.aggregateDiagnostics.workUnitCount,
      candidateSummaryWork: result.candidateSummaries.map((summary) => summary.workUnitCount),
    }))));
  });

  it("binds calibration provenance to the canonical profile hash, never planHash", () => {
    const config = createD2GRunnerConfig("calibration-ready", { sourceCommit: "a".repeat(40), baseSeeds: [9101] });

    expect(config.profile.configurationHash).toBe(config.provenance.profileConfigurationHash);
    expect(config.provenance.profileConfigurationHash).not.toBe(D2G_CALIBRATION_MATRIX[0]!.planHash);
  });

  it("separates smoke and calibration benchmark provenance and config identities", () => {
    const sourceCommit = "a".repeat(40);
    const smoke = createD2GRunnerConfig("smoke", { sourceCommit });
    const calibration = createD2GRunnerConfig("calibration-ready", { sourceCommit, baseSeeds: [9101] });

    expect(smoke.profile.benchmarkMetadata.benchmarkVersion).toBe("d2g-task5a-v1");
    expect(calibration.profile.benchmarkMetadata.benchmarkVersion).toBe("d2g-task5b-calibration-v1");
    expect(smoke.provenance.benchmarkVersion).toBe("d2g-task5a-v1");
    expect(calibration.provenance.benchmarkVersion).toBe("d2g-task5b-calibration-v1");
    expect(smoke.profile.benchmarkMetadata.benchmarkVersion).not.toBe(calibration.profile.benchmarkMetadata.benchmarkVersion);
    expect(smoke.seedManifest.manifestId).toBe("d2g-task5a-smoke-seeds-v1");
    expect(calibration.seedManifest.manifestId).toBe("d2g-task5b-calibration-ready-seeds-v1");
    expect(smoke.configHash).not.toBe(calibration.configHash);
  });

  it("keeps calibration and formal execution fail-closed", async () => {
    await expect(runD2GTreatmentBenchmark({ phase: "calibration-ready", sourceCommit: "a".repeat(40) })).rejects.toThrow("D2G_CALIBRATION_MATRIX_NOT_STARTED");
    expect(() => createD2GRunnerConfig("formal", { sourceCommit: "a".repeat(40) })).toThrow("D2G_FORMAL_NOT_FROZEN");
  });

  it("freezes staged calibration execution without executing the reserved seeds", () => {
    expect(D2G_CALIBRATION_PLAN.stageA.seeds).toEqual([9101]);
    expect(D2G_CALIBRATION_PLAN.stageA.planIds).toEqual(D2G_CALIBRATION_MATRIX.map((plan) => plan.planId));
    expect(D2G_CALIBRATION_PLAN.stageA.expectedGames).toBe(32);
    expect(D2G_CALIBRATION_PLAN.stageB.seeds).toEqual([9102, 9103, 9104]);
    expect(D2G_CALIBRATION_PLAN.stageB.maximumProfileCount).toBe(2);
    expect(D2G_CALIBRATION_PLAN.stageB.maximumGames).toBe(48);
    expect(D2G_CALIBRATION_PLAN.seedsExecuted).toBe(false);
  });
});
