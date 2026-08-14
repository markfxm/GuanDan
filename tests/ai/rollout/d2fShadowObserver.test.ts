import { createDeck } from "../../../src/engine/cards";
import { decideAiAction } from "../../../src/ai/aiDecisionEngine";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../../src/ai/config";
import { buildPublicGameIdentity } from "../../../src/game/publicEvent";
import { createRoom } from "../../../src/game/room";
import { canonicalActionIdentity } from "../../../src/ai/rollout/contracts";
import {
  createD2FShadowCandidates,
  createD2FShadowPreActionSnapshot,
} from "../../../src/ai/rollout/d2fShadowObserver";

function decisionInput() {
  const hand = createDeck().slice(0, 8);
  return {
    hand,
    gameRank: "10" as const,
    seat: 1,
    partnerSeat: 3,
    playedCards: [],
    handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 },
    finishOrder: [],
  };
}

function emptyRuntime() {
  return {
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  };
}

it("exposes every evaluated formal candidate without reevaluating the decision", () => {
  const decision = decideAiAction(decisionInput(), emptyRuntime(), {
    ...DEFAULT_AI_PERFORMANCE_CONFIG,
    turn: 0,
  });
  const projection = decision as typeof decision & {
    evaluatedCandidates: readonly { candidate: unknown; score: { total: number } }[];
  };

  expect(projection.evaluatedCandidates).toHaveLength(decision.candidateCount);
  expect(projection.evaluatedCandidates.map(({ score }) => score.total)).toContain(decision.score.total);
});

it("owns a construction-time shadow mode with disabled as the default", () => {
  const identity = buildPublicGameIdentity("d2f-task8-red", 0, 0, "benchmark-scenario");
  const disabledRoom = createRoom({ rank: "10", seed: 1, publicIdentity: identity });
  const enabledRoom = createRoom({
    rank: "10",
    seed: 1,
    publicIdentity: identity,
    d2fShadowMode: "enabled",
  } as never);

  expect((disabledRoom as typeof disabledRoom & { d2fShadowMode: string }).d2fShadowMode).toBe("disabled");
  expect((enabledRoom as typeof enabledRoom & { d2fShadowMode: string }).d2fShadowMode).toBe("enabled");
});

it("projects every real evaluated candidate with its existing score and canonical identity", () => {
  const decision = decideAiAction(decisionInput(), emptyRuntime(), {
    ...DEFAULT_AI_PERFORMANCE_CONFIG,
    turn: 0,
  });
  const projected = createD2FShadowCandidates({
    evaluatedCandidates: decision.evaluatedCandidates,
    selectedAction: decision.action,
  });

  expect(projected.ok).toBe(true);
  if (!projected.ok) return;
  expect(projected.value.candidates).toHaveLength(decision.evaluatedCandidates.length);
  expect(projected.value.candidates.map(({ candidateId }) => candidateId).sort()).toEqual(
    decision.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action)).sort(),
  );
  expect(projected.value.candidates.map(({ baselineEvaluatorScore }) => baselineEvaluatorScore).sort()).toEqual(
    decision.evaluatedCandidates.map(({ score }) => score.total).sort(),
  );
  expect(projected.value.selectedCandidateId).toBe(canonicalActionIdentity(decision.action));
  expect(Object.isFrozen(projected.value)).toBe(true);
  expect(Object.isFrozen(projected.value.candidates)).toBe(true);
});

it("captures a detached frozen pre-action snapshot with only the perspective hand", () => {
  const identity = buildPublicGameIdentity("d2f-task8-snapshot", 0, 0, "benchmark-scenario");
  const room = createRoom({ rank: "10", seed: 1, publicIdentity: identity });
  const actingSeat = room.trick.leadSeat;
  const perspectiveSeat = actingSeat;
  const partnerSeat = ((actingSeat + 2) % 4) as 0 | 1 | 2 | 3;
  const decision = decideAiAction({
    hand: [...room.hands[actingSeat]],
    gameRank: room.rank,
    seat: actingSeat,
    partnerSeat,
    playedCards: [],
    handCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    finishOrder: [],
  }, emptyRuntime(), { ...DEFAULT_AI_PERFORMANCE_CONFIG, turn: room.currentTrickIndex });
  const projected = createD2FShadowCandidates({
    evaluatedCandidates: decision.evaluatedCandidates,
    selectedAction: decision.action,
  });
  expect(projected.ok).toBe(true);
  if (!projected.ok) return;
  const ledger = room.publicLedger!;
  const snapshot = createD2FShadowPreActionSnapshot({
    publicIdentity: room.publicIdentity,
    initialLedger: ledger,
    finalLedger: ledger,
    publicHistoryEvents: room.publicEvents,
    gameRank: room.rank,
    perspectiveSeat,
    actingSeat,
    ownCurrentHand: room.hands[actingSeat],
    publicState: {
      gameRank: room.rank,
      actingSeat,
      perspectiveSeat,
      partnerSeat,
      handCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
      finishOrder: [],
      publicPlayedCardIds: [],
      currentLastPlay: null,
      currentLastPlaySeat: null,
    },
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
  if (!snapshot.ok) return;
  expect(snapshot.value.schemaVersion).toBe("d2f-shadow-pre-action-snapshot-v1");
  expect(snapshot.value.ownCurrentHand).toEqual(room.hands[actingSeat]);
  expect(snapshot.value.publicState.handCounts).toEqual({ 0: 27, 1: 27, 2: 27, 3: 27 });
  expect(snapshot.value.publicState).not.toHaveProperty("hands");
  expect(Object.isFrozen(snapshot.value)).toBe(true);
  expect(Object.isFrozen(snapshot.value.ownCurrentHand)).toBe(true);
  expect(snapshot.value).not.toBe(room);
  expect(snapshot.value.ownCurrentHand).not.toBe(room.hands[actingSeat]);
});
