import { decideAiAction } from "../../../src/ai/aiDecisionEngine";
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
import {
  createD2FShadowCandidates,
  createD2FShadowPreActionSnapshot,
} from "../../../src/ai/rollout/d2fShadowObserver";
import { buildPublicGameIdentity } from "../../../src/game/publicEvent";
import { createInitialPublicLedger } from "../../../src/game/publicLedger";
import { createRoom, playCards } from "../../../src/game/room";
import {
  computeD2GPreActionGameplayStateHash,
  computeD2GPrivateOwnHandFingerprint,
} from "../../../src/ai/d2g/treatmentSelector";

export function emptyRuntime() {
  return {
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  };
}

export function makeProfile(): D2GTreatmentProfile {
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

export function makeTreatmentFixture() {
  const identity = buildPublicGameIdentity("d2g-treatment-mapping-test", 0, 0, "benchmark-scenario");
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
  const decision = decideAiAction({
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
  if (!snapshot.ok) throw new Error("fixture snapshot failed");

  const contextBase = {
    gameId: identity.gameId,
    decisionIndex: 0,
    actingSeat,
    actingStrategy: "treatment" as const,
    preActionGameplayStateHash: computeD2GPreActionGameplayStateHash(snapshot.value),
    privateOwnHandFingerprint: computeD2GPrivateOwnHandFingerprint(snapshot.value),
    candidateUniverseHash: computeD2GCandidateUniverseHash(decision),
  };
  const decisionContext: D2GDecisionContext = {
    ...contextBase,
    decisionIdentity: computeD2GDecisionIdentity(contextBase),
  };
  return { decision, snapshot: snapshot.value, decisionContext, profile: makeProfile() };
}
