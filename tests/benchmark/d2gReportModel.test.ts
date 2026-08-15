import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { finalizePublicActionEvent, sha256Bytes } from "../../src/game/publicEventHash";
import { canonicalPublicLedgerHash, createInitialPublicLedger } from "../../src/game/publicLedger";
import { createD2GTreatmentProfile, type D2GTreatmentProfile } from "../../src/ai/d2g/treatmentContracts";
import type { PublicLedgerReplayInitialState } from "../../src/game/publicEventReplay";
import { rebuildPublicLedger } from "../../src/game/publicEventReplay";
import type { D2GDecisionTelemetryRecord, D2GHeadToHeadGameResult } from "./d2gHeadToHeadSimulator";
import {
  buildD2GReportModel,
  buildD2GPublicReplay,
  isCorrectnessCleanGame,
  normalizeD2GGameResult,
  validateD2GPublicReplay,
} from "./d2gReportModel";
import { buildD2GProvenance, type D2GProvenance } from "./d2gManifest";
import { canonicalJson } from "./contracts";
import { computeD2GSemanticHash } from "./d2gStatistics";

const EMPTY_PUBLIC_TRACE_HASH = sha256Bytes(new TextEncoder().encode(canonicalJson({ schemaVersion: "d2g-public-trace-v1", publicEvents: [] })));

type TestGameOverrides = Partial<D2GHeadToHeadGameResult> & { initialPublicReplayState?: PublicLedgerReplayInitialState };

function makeProfile(): D2GTreatmentProfile {
  return createD2GTreatmentProfile({
    schemaVersion: "d2g-treatment-profile-v1",
    profileVersion: "d2g-treatment-profile-v1",
    profileId: "d2g-calibration-v1",
    phase: "calibration",
    budget: { particleCount: 1, replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 64, maxWorkUnits: 64 },
    evidenceRequirements: { schemaVersion: "d2f-rollout-evidence-requirements-v1", minimumEffectiveSampleSize: 1, minimumAcceptedScenarioCount: 1, minimumCompletedReplicateCount: 1, requireCompleteCoverage: true },
    riskPolicy: { schemaVersion: "d2f-rollout-risk-policy-v1", variancePenalty: 0, downsideRiskPenalty: 0 },
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: {
      benchmarkVersion: "d2g-task4-test-v1",
      sourceCommit: "a".repeat(40),
      engineVersion: "engine-v1",
      roomRulesFingerprint: "b".repeat(64),
      candidateOrderingVersion: "candidate-order-v1",
      statisticsSchemaVersion: "d2g-statistics-v1",
      reportSchemaVersion: "d2g-report-v1",
    },
  });
}

function makeProvenance(profile = makeProfile(), baseSeeds = [11, 12], bootstrapIterations = 200, bootstrapSeed = 1): D2GProvenance {
  return buildD2GProvenance({
    benchmarkVersion: "d2g-task4-test-v1",
    sourceCommit: "a".repeat(40),
    engineVersion: "engine-v1",
    roomRulesFingerprint: "b".repeat(64),
    profileConfigurationHash: profile.configurationHash,
    configHash: "c".repeat(64),
    statisticsSchemaVersion: "d2g-statistics-v1",
    reportSchemaVersion: "d2g-report-v1",
    replaySchemaVersion: "d2g-replay-v1",
    baseSeeds,
    bootstrapIterations,
    bootstrapSeed,
  });
}

function telemetry(actingStrategy: "baseline" | "treatment", fallbackReason: D2GDecisionTelemetryRecord["fallbackReason"] = "none", selection: D2GDecisionTelemetryRecord["selection"] = actingStrategy, disagreement = false): D2GDecisionTelemetryRecord {
  return {
    decisionIndex: 0,
    actingSeat: actingStrategy === "baseline" ? 0 : 1,
    actingStrategy,
    decisionIdentity: "d".repeat(64),
    candidateUniverseHash: "e".repeat(64),
    preActionGameplayStateHash: "f".repeat(64),
    baselineCandidateId: "baseline-candidate",
    treatmentCandidateId: "treatment-candidate",
    selectedCandidateId: selection === "treatment" ? "treatment-candidate" : "baseline-candidate",
    executedCandidateId: selection === "treatment" ? "treatment-candidate" : "baseline-candidate",
    selection,
    fallbackReason,
    disagreement,
    rankingHash: "1".repeat(64),
    rolloutWorkUnits: 10,
    rolloutEvidence: {
      effectiveSampleSize: actingStrategy === "baseline" ? 1 : 2,
      acceptedScenarioCount: actingStrategy === "baseline" ? 1 : 2,
      completedReplicateCount: actingStrategy === "baseline" ? 1 : 4,
      expectedCompletedReplicateCount: actingStrategy === "baseline" ? 1 : 4,
      coverage: "complete",
    },
    productionDecisionCostMs: actingStrategy === "baseline" ? 2 : 3,
    rolloutEvaluationCostMs: actingStrategy === "baseline" ? 11 : 7,
  };
}

function finishForTeam(team: 0 | 1): [0 | 1 | 2 | 3, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3] {
  return team === 0 ? [0, 2, 1, 3] : [1, 3, 0, 2];
}

function makeGame(overrides: TestGameOverrides = {}): D2GHeadToHeadGameResult {
  const allocation = overrides.allocation ?? "AB";
  const treatmentTeam = allocation === "AB" ? "B" : "A";
  const baselineTeam = treatmentTeam === "A" ? "B" : "A";
  const winnerTeam = overrides.winnerTeam === undefined ? (treatmentTeam === "A" ? 0 : 1) : overrides.winnerTeam;
  const finishOrder = overrides.finishOrder ?? (winnerTeam === null ? [] : finishForTeam(winnerTeam));
  const winningPartnership = overrides.winningPartnership === undefined
    ? winnerTeam === null ? null : winnerTeam === (treatmentTeam === "A" ? 0 : 1) ? "treatment" : "baseline"
    : overrides.winningPartnership;
  const seed = overrides.baseSeed ?? 11;
  const rotation = overrides.rotation ?? 0;
  const gameId = overrides.gameId ?? `d2g:${seed}:${rotation}:${allocation}`;
  const initialPublicReplayState = overrides.initialPublicReplayState ?? makeInitialPublicReplayState(gameId);
  const initialPublicLedgerHash = canonicalPublicLedgerHash(createInitialPublicLedger(initialPublicReplayState));
  const game = {
    schemaVersion: "d2g-head-to-head-game-v1",
    gameId,
    rotationPairKey: overrides.rotationPairKey ?? `pair:${seed}:${rotation}`,
    baseSeed: seed,
    rank: "10",
    rotation,
    allocation,
    matchup: "baseline-vs-treatment",
    configHash: "c".repeat(64),
    profileHash: makeProfile().configurationHash,
    baselineTeam,
    treatmentTeam,
    strategyAssignment: allocation === "AB"
      ? { 0: "baseline", 1: "treatment", 2: "baseline", 3: "treatment" }
      : { 0: "treatment", 1: "baseline", 2: "treatment", 3: "baseline" },
    initialPublicLedgerHash,
    finalPublicLedgerHash: initialPublicLedgerHash,
    publicTraceHash: EMPTY_PUBLIC_TRACE_HASH,
    semanticHash: "3".repeat(64),
    publicEvents: [],
    initialPublicReplayState,
    finishOrder,
    winnerTeam,
    winningPartnership,
    completed: overrides.completed ?? true,
    cardConservation: overrides.cardConservation ?? true,
    termination: overrides.termination ?? "finished",
    decisionCount: 3,
    actionExecutionCount: 3,
    playCount: 2,
    passCount: 1,
    tributeTransitionCount: 0,
    returnTransitionCount: 0,
    runtimePlanMismatchCount: 0,
    crossGameCandidateReuseCount: 0,
    decisionTelemetry: overrides.decisionTelemetry ?? [telemetry("baseline", "rollout-failed", "baseline"), telemetry("treatment", "none", "treatment", true), telemetry("treatment", "rollout-failed", "baseline")],
    fallbackCounts: { "rollout-failed": 2 },
    errorCounters: overrides.errorCounters ?? { total: 0, decisionErrors: 0, treatmentErrors: 0, executionErrors: 0, transitionErrors: 0, guardErrors: 0 },
    errors: [],
    elapsedMs: overrides.elapsedMs ?? 20,
    ...overrides,
  } as unknown as D2GHeadToHeadGameResult;
  return overrides.semanticHash === undefined ? { ...game, semanticHash: computeD2GSemanticHash(game) } : game;
}

function makeInitialPublicReplayState(gameId: string): PublicLedgerReplayInitialState {
  return {
    identity: buildPublicGameIdentity(gameId, 0, 0, "benchmark-scenario"),
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "none" },
  };
}

function makeReplayWithPass(provenance: D2GProvenance) {
  const gameId = "d2g:replay-pass";
  const initialPublicReplayState = makeInitialPublicReplayState(gameId);
  const play = finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId,
    roundIdentity: initialPublicReplayState.identity.roundIdentity,
    handIdentity: initialPublicReplayState.identity.handIdentity,
    eventIndex: 0,
    kind: "play",
    seat: 0,
    publicCardIds: ["C2-1"],
    patternType: "single",
    groupType: "single",
    publicStableKey: "play:C2-1",
    handCountBefore: 27,
    handCountAfter: 26,
    trickIndex: 0,
  });
  const pass = finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId,
    roundIdentity: initialPublicReplayState.identity.roundIdentity,
    handIdentity: initialPublicReplayState.identity.handIdentity,
    eventIndex: 1,
    kind: "pass",
    seat: 1,
    publicStableKey: "pass:v2",
    handCountBefore: 27,
    handCountAfter: 27,
    trickIndex: 0,
  });
  const publicEvents = [play, pass];
  const publicTraceHash = sha256Bytes(new TextEncoder().encode(canonicalJson({ schemaVersion: "d2g-public-trace-v1", publicEvents })));
  const finalPublicLedgerHash = rebuildPublicLedger({ schemaVersion: "d2-public-ledger-replay-v1", initialState: initialPublicReplayState, events: publicEvents }).hash;
  return buildD2GPublicReplay(makeGame({
    gameId,
    publicEvents,
    publicTraceHash,
    finalPublicLedgerHash,
    initialPublicReplayState,
  }), provenance);
}

function reidentifyReplay(replay: Record<string, unknown>): Record<string, unknown> {
  const { replayIdentity: _replayIdentity, ...body } = replay;
  return { ...body, replayIdentity: sha256Bytes(new TextEncoder().encode(canonicalJson(body))) };
}

function makeBlock(seed: number): D2GHeadToHeadGameResult[] {
  return ([0, 1, 2, 3] as const).flatMap((rotation) => (["AB", "BA"] as const).map((allocation) => makeGame({ baseSeed: seed, rotation, allocation, gameId: `d2g:${seed}:${rotation}:${allocation}`, rotationPairKey: `pair:${seed}:${rotation}` })));
}

describe("D2G report model", () => {
  it("normalizes AB and BA outcomes from the treatment partnership perspective", () => {
    const ab = normalizeD2GGameResult(makeGame({ allocation: "AB", winnerTeam: 1 }));
    const ba = normalizeD2GGameResult(makeGame({ allocation: "BA", winnerTeam: 0 }));

    expect(ab.treatmentWinIndicator).toBe(1);
    expect(ba.treatmentWinIndicator).toBe(1);
    expect(ab.scoreDelta).toBe(4);
    expect(ba.scoreDelta).toBe(4);
    expect(ab.levelStepDelta).toBe(3);
    expect(ba.levelStepDelta).toBe(3);
    expect(ab.finishUtilityDelta).toBeGreaterThan(0);
    expect(ba.finishUtilityDelta).toBeGreaterThan(0);
  });

  it("uses canonical settlement semantics for level-step and score deltas", () => {
    const treatmentWin = normalizeD2GGameResult(makeGame({ allocation: "AB", winnerTeam: 1, finishOrder: [1, 3, 0, 2] }));
    const baselineWin = normalizeD2GGameResult(makeGame({ allocation: "AB", winnerTeam: 0, finishOrder: [0, 2, 1, 3] }));

    expect(treatmentWin.levelStep).toBe(3);
    expect(treatmentWin.levelStepDelta).toBe(3);
    expect(treatmentWin.scoreDelta).toBe(4);
    expect(baselineWin.levelStep).toBe(3);
    expect(baselineWin.levelStepDelta).toBe(-3);
    expect(baselineWin.scoreDelta).toBe(-4);
  });

  it("keeps team placement score distinct from the treatment win indicator", () => {
    const strongTreatmentWin = normalizeD2GGameResult(makeGame({ allocation: "AB", winnerTeam: 1, finishOrder: [1, 3, 0, 2] }));
    const weakerTreatmentWin = normalizeD2GGameResult(makeGame({ allocation: "AB", winnerTeam: 1, finishOrder: [1, 0, 3, 2] }));

    expect(strongTreatmentWin.treatmentWinIndicator).toBe(1);
    expect(weakerTreatmentWin.treatmentWinIndicator).toBe(1);
    expect(strongTreatmentWin.treatmentTeamScore).not.toBe(weakerTreatmentWin.treatmentTeamScore);
    expect(strongTreatmentWin.scoreDelta).toBe(4);
    expect(weakerTreatmentWin.scoreDelta).toBe(2);
    expect(strongTreatmentWin.levelStep).toBe(3);
    expect(weakerTreatmentWin.levelStep).toBe(2);
  });

  it("keeps treatment score sign correct when AB and BA swap labels", () => {
    const ab = normalizeD2GGameResult(makeGame({ allocation: "AB", winnerTeam: 1, finishOrder: [1, 0, 3, 2] }));
    const ba = normalizeD2GGameResult(makeGame({ allocation: "BA", winnerTeam: 0, finishOrder: [0, 1, 2, 3] }));

    expect(ab.treatmentWinIndicator).toBe(1);
    expect(ba.treatmentWinIndicator).toBe(1);
    expect(ab.scoreDelta).toBeGreaterThan(0);
    expect(ba.scoreDelta).toBeGreaterThan(0);
  });

  it("keeps incomplete games unresolved instead of assigning a neutral outcome", () => {
    const incomplete = normalizeD2GGameResult(makeGame({ completed: false, termination: "turn-limit", winnerTeam: null, finishOrder: [] }));

    expect(incomplete.resolved).toBe(false);
    expect(incomplete.unresolvedReason).toBe("incomplete");
    expect(incomplete.treatmentWinIndicator).toBeNull();
    expect(incomplete.scoreDelta).toBeNull();
    expect(incomplete.levelStepDelta).toBeNull();
  });

  it("keeps correctness-unclean completed games unresolved", () => {
    const report = buildD2GReportModel({ provenance: makeProvenance(), games: [makeGame({ cardConservation: false })] });

    expect(report.treatmentPerspectiveOutcomes[0]!.resolved).toBe(false);
    expect(report.treatmentPerspectiveOutcomes[0]!.unresolvedReason).toBe("correctness-unclean");
    expect(report.statistics.unresolvedByReason["correctness-unclean"]).toBe(1);
    expect(report.statistics.meanScoreDelta).toBeNull();
  });

  it("separates treatment deployment fallback from baseline-seat counterfactual fallback", () => {
    const statistics = buildD2GReportModel({ provenance: makeProvenance(makeProfile(), [11], 3, 9), games: makeBlock(11), bootstrapIterations: 3, bootstrapSeed: 9 }).statistics;

    expect(statistics.treatmentControlledDecisionCount).toBe(16);
    expect(statistics.executedTreatmentSelectionCount).toBe(8);
    expect(statistics.executedTreatmentFallbackCount).toBe(8);
    expect(statistics.executedTreatmentFallbackRate).toBe(0.5);
    expect(statistics.counterfactualBaselineSeatEvaluationCount).toBe(8);
    expect(statistics.counterfactualFallbackCount).toBe(8);
    expect(statistics.allTreatmentEvaluationFallbackCount).toBe(16);
    expect(statistics.errorCounters.total).toBe(0);
  });

  it("keeps bootstrap samples as complete base-seed blocks", () => {
    const games = [...makeBlock(11), ...makeBlock(12)];
    const statistics = buildD2GReportModel({ provenance: makeProvenance(makeProfile(), [11, 12], 4, 7), games, bootstrapIterations: 4, bootstrapSeed: 7 }).statistics;

    expect(statistics.bootstrap.blockUnit).toBe("base-seed");
    expect(statistics.bootstrap.sampledBlocks).toHaveLength(4);
    expect(statistics.bootstrap.sampledBlocks.every((sample) => sample.every((block) => block.gameCount === 8))).toBe(true);
  });

  it("counts missing games in an incomplete base-seed block as unresolved", () => {
    const report = buildD2GReportModel({ provenance: makeProvenance(makeProfile(), [11]), games: makeBlock(11).slice(1) });

    expect(report.statistics.baseSeedBlocks[0]!.complete).toBe(false);
    expect(report.statistics.unresolvedGameCount).toBe(1);
    expect(report.statistics.unresolvedByReason.missing).toBe(1);
  });

  it("counts a duplicated rotation/allocation slot as a missing block slot", () => {
    const games = [...makeBlock(11).slice(0, 7), makeGame({ baseSeed: 11, rotation: 3, allocation: "AB", gameId: "d2g:duplicate-slot" })];
    const report = buildD2GReportModel({ provenance: makeProvenance(makeProfile(), [11]), games });

    expect(report.statistics.baseSeedBlocks[0]!.complete).toBe(false);
    expect(report.statistics.unresolvedByReason.missing).toBe(1);
  });

  it("attributes production, active-treatment, and counterfactual rollout latency separately", () => {
    const statistics = buildD2GReportModel({ provenance: makeProvenance(), games: makeBlock(11) }).statistics;

    expect(statistics.latency.productionDecisionCostMs.count).toBe(24);
    expect(statistics.latency.actualTreatmentRolloutCostMs.count).toBe(16);
    expect(statistics.latency.counterfactualRolloutCostMs.count).toBe(8);
    expect(statistics.latency.actualTreatmentRolloutCostMs.p50).toBe(7);
    expect(statistics.latency.counterfactualRolloutCostMs.p50).toBe(11);
  });

  it("reports treatment and counterfactual aggregate rollout evidence separately", () => {
    const statistics = buildD2GReportModel({ provenance: makeProvenance(), games: makeBlock(11) }).statistics;

    expect(statistics.evidence.treatment.evaluationCount).toBe(16);
    expect(statistics.evidence.treatment.evidenceCount).toBe(16);
    expect(statistics.evidence.treatment.effectiveSampleSize?.p50).toBe(2);
    expect(statistics.evidence.treatment.acceptedScenarioCount?.p50).toBe(2);
    expect(statistics.evidence.treatment.completedReplicateCount?.p50).toBe(4);
    expect(statistics.evidence.treatment.expectedCompletedReplicateCount?.p50).toBe(4);
    expect(statistics.evidence.treatment.coverage.completeCount).toBe(16);
    expect(statistics.evidence.counterfactual.evaluationCount).toBe(8);
    expect(statistics.evidence.counterfactual.effectiveSampleSize?.p50).toBe(1);
    expect(statistics.evidence.counterfactual.coverage.completeCount).toBe(8);
  });

  it("excludes wall-clock fields from deterministic report identity", () => {
    const provenance = makeProvenance();
    const first = buildD2GReportModel({ provenance, games: makeBlock(11) });
    const second = buildD2GReportModel({ provenance, games: makeBlock(11).map((game) => ({
      ...game,
      elapsedMs: game.elapsedMs + 1000,
      decisionTelemetry: game.decisionTelemetry.map((record) => ({ ...record, productionDecisionCostMs: record.productionDecisionCostMs + 100, rolloutEvaluationCostMs: record.rolloutEvaluationCostMs + 100 })),
    })) });

    expect(second.deterministicIdentity).toBe(first.deterministicIdentity);
  });

  it("binds bootstrap configuration into deterministic report identity", () => {
    const games = makeBlock(11);
    const first = buildD2GReportModel({ provenance: makeProvenance(makeProfile(), [11], 3, 9), games, bootstrapIterations: 3, bootstrapSeed: 9 });
    const second = buildD2GReportModel({ provenance: makeProvenance(makeProfile(), [11], 4, 9), games, bootstrapIterations: 4, bootstrapSeed: 9 });

    expect(second.deterministicIdentity).not.toBe(first.deterministicIdentity);
  });

  it("builds and validates public-only replay without private benchmark state", () => {
    const provenance = makeProvenance();
    const replay = buildD2GPublicReplay(makeGame(), provenance);

    expect(validateD2GPublicReplay(replay, provenance)).toBe(true);
    expect(JSON.stringify(replay)).not.toMatch(/"(hands|initialHands|privateOwnHandFingerprint|aiRuntime|aiPlans|privateState|hiddenState|particleState|opponentHands)"/i);
    expect(replay).not.toHaveProperty("decisionTelemetry");
  });

  it("rejects a replay without canonical initial public replay state", () => {
    const provenance = makeProvenance();
    const replay = buildD2GPublicReplay(makeGame(), provenance) as unknown as Record<string, unknown>;
    delete replay.initialPublicReplayState;

    expect(() => validateD2GPublicReplay(replay, provenance)).toThrow("REPLAY_INITIAL_STATE_MISSING");
  });

  it("rejects a forged final ledger hash even when the replay envelope is internally reidentified", () => {
    const provenance = makeProvenance();
    const replay = buildD2GPublicReplay(makeGame(), provenance) as unknown as Record<string, unknown>;
    const forged = reidentifyReplay({ ...replay, finalPublicLedgerHash: "2".repeat(64) });

    expect(() => validateD2GPublicReplay(forged, provenance)).toThrow("REPLAY_FINAL_HASH_MISMATCH");
  });

  it("rejects missing, reordered, and hash-invalid public events", () => {
    const provenance = makeProvenance();
    const replay = makeReplayWithPass(provenance) as unknown as Record<string, unknown>;
    const missingEvent = reidentifyReplay({ ...replay, publicEvents: [], publicTraceHash: EMPTY_PUBLIC_TRACE_HASH });
    const events = replay.publicEvents as Array<Record<string, unknown>>;
    const reorderedEvents = [...events].reverse();
    const reordered = reidentifyReplay({ ...replay, publicEvents: reorderedEvents, publicTraceHash: sha256Bytes(new TextEncoder().encode(canonicalJson({ schemaVersion: "d2g-public-trace-v1", publicEvents: reorderedEvents }))) });
    const invalidHash = reidentifyReplay({ ...replay, publicEvents: [{ ...events[0], publicPayloadHash: "3".repeat(64) }, events[1]] });

    expect(() => validateD2GPublicReplay(missingEvent, provenance)).toThrow();
    expect(() => validateD2GPublicReplay(reordered, provenance)).toThrow("REPLAY_EVENT_SEQUENCE_MISMATCH");
    expect(() => validateD2GPublicReplay(invalidHash, provenance)).toThrow("EVENT_HASH_INVALID");
  });

  it("defines correctness cleanliness from completion, conservation, lifecycle, and error evidence", () => {
    expect(isCorrectnessCleanGame(makeGame())).toBe(true);
    expect(isCorrectnessCleanGame(makeGame({ runtimePlanMismatchCount: 1 }))).toBe(false);
    expect(isCorrectnessCleanGame(makeGame({ errorCounters: { total: 1, decisionErrors: 0, treatmentErrors: 1, executionErrors: 0, transitionErrors: 0, guardErrors: 0 } }))).toBe(false);
    expect(isCorrectnessCleanGame(makeGame({ errorCounters: { total: 0, decisionErrors: 0, treatmentErrors: 1, executionErrors: 0, transitionErrors: 0, guardErrors: 0 } }))).toBe(false);
    expect(isCorrectnessCleanGame(makeGame({ publicTraceHash: "2".repeat(64) }))).toBe(false);
    expect(isCorrectnessCleanGame(makeGame({ semanticHash: "4".repeat(64) }))).toBe(false);
    expect(isCorrectnessCleanGame(makeGame({ finishOrder: [0, 0, 1, 2] as [0, 0, 1, 2] }))).toBe(false);
  });
});
