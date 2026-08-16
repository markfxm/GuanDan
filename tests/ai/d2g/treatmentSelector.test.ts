import { describe, expect, it, vi } from "vitest";
import * as decisionEngine from "../../../src/ai/aiDecisionEngine";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../../src/ai/config";
import {
  D2G_PROFILE_SCHEMA_VERSION,
  D2G_PROFILE_VERSION,
  computeD2GCandidateUniverseHash,
  computeD2GDecisionIdentity,
  createD2GTreatmentProfile,
  type D2GDecisionContext,
  type D2GTreatmentProfile,
} from "../../../src/ai/d2g/treatmentContracts";
import * as rolloutOrchestrator from "../../../src/ai/rollout/rolloutOrchestrator";
import {
  createD2FShadowCandidates,
  createD2FShadowPreActionSnapshot,
} from "../../../src/ai/rollout/d2fShadowObserver";
import { canonicalActionIdentity, type RolloutExecutionResult, type RolloutFailure } from "../../../src/ai/rollout/contracts";
import { buildPublicGameIdentity } from "../../../src/game/publicEvent";
import { createInitialPublicLedger } from "../../../src/game/publicLedger";
import { createRoom, playCards } from "../../../src/game/room";
import {
  computeD2GPreActionGameplayStateHash,
  computeD2GPrivateOwnHandFingerprint,
  selectD2GTreatment,
} from "../../../src/ai/d2g/treatmentSelector";

function emptyRuntime() {
  return {
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  };
}

function makeProfile(): D2GTreatmentProfile {
  return createD2GTreatmentProfile({
    schemaVersion: D2G_PROFILE_SCHEMA_VERSION,
    profileVersion: D2G_PROFILE_VERSION,
    profileId: "d2g-calibration-v1",
    phase: "calibration",
    budget: {
      particleCount: 1,
      replicateCountPerScenario: 1,
      maxPliesPerReplicate: 1,
      maxPolicyActionEvaluationsPerPly: 256,
      maxWorkUnits: 256,
    },
    evidenceRequirements: {
      schemaVersion: "d2f-rollout-evidence-requirements-v1",
      minimumEffectiveSampleSize: 1,
      minimumAcceptedScenarioCount: 1,
      minimumCompletedReplicateCount: 1,
      requireCompleteCoverage: true,
    },
    riskPolicy: {
      schemaVersion: "d2f-rollout-risk-policy-v1",
      variancePenalty: 0,
      downsideRiskPenalty: 0,
    },
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: {
      benchmarkVersion: "d2g-test-v1",
      sourceCommit: "a".repeat(40),
      engineVersion: "engine-v1",
      roomRulesFingerprint: "room-rules-v1",
      candidateOrderingVersion: "candidate-order-v1",
      statisticsSchemaVersion: "statistics-v1",
      reportSchemaVersion: "report-v1",
    },
  });
}

function makeFixture() {
  const identity = buildPublicGameIdentity("d2g-treatment-selector-test", 0, 0, "benchmark-scenario");
  const room = createRoom({ rank: "10", seed: 1, publicIdentity: identity });
  const openingLeader = room.trick.leadSeat;
  const openingCard = room.hands[openingLeader][0]!;
  const initialLedger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "none" },
  });
  playCards(room, openingLeader, [openingCard.id]);

  const actingSeat = room.currentTurn;
  const partnerSeat = ((actingSeat + 2) % 4) as 0 | 1 | 2 | 3;
  const decision = decisionEngine.decideAiAction({
    hand: [...room.hands[actingSeat]],
    gameRank: room.rank,
    seat: actingSeat,
    partnerSeat,
    playedCards: room.playHistory.flatMap((play) => play.group?.cards ?? []),
    handCounts: Object.fromEntries(room.players.map((player) => [player.seat, room.hands[player.seat].length])),
    lastPlay: room.trick.lastPlay,
    lastPlaySeat: room.trick.lastPlaySeat,
    finishOrder: room.finishOrder,
  }, emptyRuntime(), { ...DEFAULT_AI_PERFORMANCE_CONFIG, turn: room.currentTrickIndex });
  const projected = createD2FShadowCandidates({
    evaluatedCandidates: decision.evaluatedCandidates,
    selectedAction: decision.action,
  });
  expect(projected.ok).toBe(true);
  if (!projected.ok) throw new Error("fixture candidate projection failed");

  const publicState = {
    gameRank: room.rank,
    actingSeat,
    perspectiveSeat: actingSeat,
    partnerSeat,
    handCounts: Object.fromEntries(room.players.map((player) => [player.seat, room.hands[player.seat].length])),
    finishOrder: room.finishOrder,
    publicPlayedCardIds: room.publicLedger!.playedCardIds,
    currentLastPlay: room.trick.lastPlay ?? null,
    currentLastPlaySeat: room.trick.lastPlaySeat ?? null,
  } as const;
  const snapshot = createD2FShadowPreActionSnapshot({
    publicIdentity: identity,
    initialLedger,
    finalLedger: room.publicLedger,
    publicHistoryEvents: room.publicEvents,
    gameRank: room.rank,
    perspectiveSeat: actingSeat,
    actingSeat,
    ownCurrentHand: room.hands[actingSeat],
    publicState,
    currentTrick: {
      leadSeat: room.trick.leadSeat,
      lastPlay: room.trick.lastPlay ?? null,
      lastPlaySeat: room.trick.lastPlaySeat ?? null,
      passSeats: room.trick.passSeats,
    },
    candidates: projected.value.candidates,
    selectedCandidateId: projected.value.selectedCandidateId,
  });
  expect(snapshot.ok).toBe(true);
  if (!snapshot.ok) throw new Error("fixture snapshot failed");

  const decisionContextBase = {
    gameId: identity.gameId,
    decisionIndex: 0,
    actingSeat,
    actingStrategy: "treatment" as const,
    preActionGameplayStateHash: computeD2GPreActionGameplayStateHash(snapshot.value),
    privateOwnHandFingerprint: computeD2GPrivateOwnHandFingerprint(snapshot.value),
    candidateUniverseHash: computeD2GCandidateUniverseHash(decision),
  };
  const decisionContext: D2GDecisionContext = {
    ...decisionContextBase,
    decisionIdentity: computeD2GDecisionIdentity(decisionContextBase),
  };

  return {
    decision,
    snapshot: snapshot.value,
    decisionContext,
    profile: makeProfile(),
  };
}

function successResult(ranking: readonly string[], workUnitCount = 12): RolloutExecutionResult {
  return {
    ok: true,
    result: {
      schemaVersion: "d2f-rollout-result-v2",
      mode: "shadow",
      formalExecutionAllowed: false,
      policyId: "d2f-lightweight-v1",
      rootDigest: "a".repeat(64),
      candidateSummaries: [],
      ranking,
      aggregateDiagnostics: {
        effectiveSampleSize: 1,
        acceptedScenarioCount: 1,
        replicateCountPerScenario: 1,
        completedReplicateCount: ranking.length,
        expectedCompletedReplicateCount: ranking.length,
        candidateCount: ranking.length,
        workUnitCount,
        coverage: "complete",
      },
    },
  } as RolloutExecutionResult;
}

function failureResult(failure: RolloutFailure): RolloutExecutionResult {
  return { ok: false, failure };
}

describe("selectD2GTreatment", () => {
  it("saves the production baseline before rollout and returns it without partial treatment on failure", () => {
    const fixture = makeFixture();
    const baselineId = fixture.decision.evaluatedCandidates.find(({ candidate }) => candidate.action === fixture.decision.action);
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation(() => {
      throw new Error("rollout exploded");
    });

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(result.baselineCandidateId).toBeDefined();
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    expect(result.selectedAction).toBe(result.baselineCandidate?.candidate.action);
    expect(result.fallbackReason).toBe("unexpected-failure");
    expect(result.treatmentCandidateId).toBe(result.baselineCandidateId);
    expect(baselineId).toBe(result.selectedCandidate);
    runner.mockRestore();
  });

  it("passes the exact current evaluated candidate universe and existing evaluator scores to D2F", () => {
    const fixture = makeFixture();
    let request: any;
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((input) => {
      request = input;
      return successResult(fixture.decision.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action)));
    });

    const expectedIds = fixture.decision.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action));
    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(request.formalExecutionAllowed).toBe(false);
    expect(request.candidates.map((candidate: { candidateId: string }) => candidate.candidateId)).toEqual(
      fixture.decision.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action)),
    );
    expect(request.candidates.map((candidate: { baselineEvaluatorScore: number }) => candidate.baselineEvaluatorScore)).toEqual(
      fixture.decision.evaluatedCandidates.map(({ score }) => score.total),
    );
    expect(request.candidates.map((candidate: { action: unknown }) => candidate.action)).toEqual(
      fixture.decision.evaluatedCandidates.map(({ candidate }) => candidate.action),
    );
    expect(result.fallbackReason).toBe("none");
    expect(expectedIds).toHaveLength(fixture.decision.evaluatedCandidates.length);
    runner.mockRestore();
  });

  it.each([
    {
      name: "budget-exhausted",
      failure: { kind: "kernel-failed", failure: { kind: "budget-exhausted", workUnits: 33, maximumWorkUnits: 32 } },
      fallbackReason: "rollout-failed",
      rolloutFailureKind: "budget-exhausted",
    },
    {
      name: "simulation-failed",
      failure: { kind: "kernel-failed", failure: { kind: "simulation-failed", stage: "root-action", reason: "illegal-action" } },
      fallbackReason: "rollout-failed",
      rolloutFailureKind: "simulation-failed",
    },
    {
      name: "effective-sample-size-too-low",
      failure: { kind: "effective-sample-size-too-low", effectiveSampleSize: 0, minimumEffectiveSampleSize: 1 },
      fallbackReason: "rollout-unusable",
      rolloutFailureKind: "effective-sample-size-too-low",
    },
  ] as const)("preserves the typed D2F failure kind for $name", ({ failure, fallbackReason, rolloutFailureKind }) => {
    const fixture = makeFixture();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(failureResult(failure as RolloutFailure));

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe(fallbackReason);
    expect((result as unknown as { rolloutFailureKind: string | null }).rolloutFailureKind).toBe(rolloutFailureKind);
    expect((result.telemetry as unknown as { rolloutFailureKind: string | null }).rolloutFailureKind).toBe(rolloutFailureKind);
    runner.mockRestore();
  });

  it("records null failure kind for a successful rollout", () => {
    const fixture = makeFixture();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(
      successResult(fixture.decision.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action))),
    );

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("none");
    expect((result as unknown as { rolloutFailureKind: string | null }).rolloutFailureKind).toBeNull();
    expect((result.telemetry as unknown as { rolloutFailureKind: string | null }).rolloutFailureKind).toBeNull();
    runner.mockRestore();
  });

  it("does not call production decideAiAction or any second candidate engine", () => {
    const fixture = makeFixture();
    const decisionSpy = vi.spyOn(decisionEngine, "decideAiAction");
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(
      successResult(fixture.decision.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action))),
    );

    selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(decisionSpy).not.toHaveBeenCalled();
    runner.mockRestore();
    decisionSpy.mockRestore();
  });

  it.each([
    "actingSeat",
    "preActionGameplayStateHash",
    "privateOwnHandFingerprint",
    "candidateUniverseHash",
    "decisionIdentity",
  ] as const)("falls back as stale-decision when %s mismatches", (field) => {
    const fixture = makeFixture();
    const context = {
      ...fixture.decisionContext,
      [field]: field === "actingSeat" ? ((fixture.snapshot.actingSeat + 1) % 4) : "stale",
    } as D2GDecisionContext;
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout");

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: context,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("stale-decision");
    expect((result as unknown as { rolloutFailureKind: string | null }).rolloutFailureKind).toBeNull();
    expect((result.telemetry as unknown as { rolloutFailureKind: string | null }).rolloutFailureKind).toBeNull();
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    expect(runner).not.toHaveBeenCalled();
    runner.mockRestore();
  });
});
