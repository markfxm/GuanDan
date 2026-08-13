import { createDeck } from "../../../src/engine/cards";
import { decideAiAction } from "../../../src/ai/aiDecisionEngine";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../../src/ai/config";
import { createD2FShadowCandidates, createD2FShadowPreActionSnapshot, observeD2FShadow } from "../../../src/ai/rollout/d2fShadowObserver";
import { buildPublicGameIdentity } from "../../../src/game/publicEvent";
import { createInitialPublicLedger } from "../../../src/game/publicLedger";
import { createRoom, playCards } from "../../../src/game/room";

function emptyRuntime() {
  return {
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  };
}

it("runs the real Room decision through ParticleBank, detached rollout, and v3 evidence", () => {
  const identity = buildPublicGameIdentity("d2f-task8-real-chain", 0, 0, "benchmark-scenario");
  const room = createRoom({ rank: "10", seed: 1, publicIdentity: identity });
  const openingLeader = room.trick.leadSeat;
  const openingCard = room.hands[openingLeader][0]!;
  playCards(room, openingLeader, [openingCard.id]);

  const actingSeat = room.currentTurn;
  const perspectiveSeat = actingSeat;
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
  const candidates = createD2FShadowCandidates({ evaluatedCandidates: decision.evaluatedCandidates, selectedAction: decision.action });
  expect(candidates.ok).toBe(true);
  if (!candidates.ok) return;

  const initialLedger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "none" },
  });
  const publicState = {
    gameRank: room.rank,
    actingSeat,
    perspectiveSeat,
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
    perspectiveSeat,
    actingSeat,
    ownCurrentHand: room.hands[actingSeat],
    publicState,
    currentTrick: {
      leadSeat: room.trick.leadSeat,
      lastPlay: room.trick.lastPlay ?? null,
      lastPlaySeat: room.trick.lastPlaySeat ?? null,
      passSeats: room.trick.passSeats,
    },
    candidates: candidates.value.candidates,
    selectedCandidateId: candidates.value.selectedCandidateId,
  });
  expect(snapshot.ok).toBe(true);
  if (!snapshot.ok) return;

  const evidence = observeD2FShadow(snapshot.value);

  expect(evidence.schemaVersion).toBe("d2f-shadow-v3");
  expect(evidence.status).toBe("success");
  if (evidence.status !== "success") return;
  expect(evidence.formalCandidateId).toBe(candidates.value.selectedCandidateId);
  expect(evidence.ranking).toHaveLength(candidates.value.candidates.length);
  expect(evidence.fallbackReason).toBe("none");
  expect(JSON.stringify(evidence)).not.toMatch(/"(?:hands|hiddenTransferAssignments|normalizedWeight|particleSeed|privateState)":/);
  expect(Object.isFrozen(evidence)).toBe(true);
});
