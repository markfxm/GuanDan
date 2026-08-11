import { createDeck, isHeartRankWild, rankStrength, type Card, type GameRank, type Rank, type Suit } from "../engine/cards";
import type { CardGroup } from "../engine/groups";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../ai/config";
import type { AiDecision, AiRuntimeState, HandPlan } from "../ai/contracts";
import type { D2FShadowEvidence, D2FShadowMode } from "../ai/rollout/contracts";
import {
  createD2FShadowCandidates,
  createD2FShadowFailureEvidence,
  createD2FShadowPreActionSnapshot,
  observeD2FShadow,
} from "../ai/rollout/d2fShadowObserver";
import { applyExecutedAction, ensurePlans } from "../ai/planning/planManager";
import { decideAiAction } from "../ai/aiDecisionEngine";
import type { AiPlanningDiagnostics } from "../ai/diagnostics/aiPlanningDiagnostics";
import { canBeatPlay, classifyPlay } from "./playRules";
import { settleRound, type RoundSettlement, type TributeItem, type TributeState } from "./settlement";
import { buildPublicGameIdentity, type PublicActionEventDraft, type PublicGameIdentity } from "./publicEvent";
import { finalizePublicActionEvent } from "./publicEventHash";
import { applyPublicEvent, createInitialPublicLedger, type HardPublicLedger } from "./publicLedger";

export type Seat = 0 | 1 | 2 | 3;

export type PlayerState = {
  seat: Seat;
  name: string;
  isAI: boolean;
  handCount: number;
  team: 0 | 1;
};

export type TrickPlay = {
  seat: Seat;
  action: "play" | "pass";
  group?: CardGroup;
  trickIndex?: number;
};

export type TrickState = {
  leadSeat: Seat;
  lastPlay?: CardGroup;
  lastPlaySeat?: Seat;
  passSeats: Seat[];
  plays: TrickPlay[];
};

export type AiPlanState = {
  seat: Seat;
  name: string;
  score: number;
  groups: CardGroup[];
};

export type RoomState = {
  readonly d2fShadowMode: D2FShadowMode;
  initialPublicLedger: HardPublicLedger | null;
  d2fShadowEvidence: D2FShadowEvidence | null;
  d2fShadowRunning: boolean;
  id: string;
  rank: GameRank;
  players: PlayerState[];
  hands: Record<Seat, Card[]>;
  initialHands: Record<Seat, Card[]>;
  currentTurn: Seat;
  leaderSeat: Seat;
  trick: TrickState;
  currentTrickIndex: number;
  finishOrder: Seat[];
  settlement?: RoundSettlement;
  openingTribute?: TributeState;
  aiPlans: Partial<Record<Seat, AiPlanState>>;
  aiRuntime: Partial<Record<Seat, AiRuntimeState>>;
  status: "playing" | "finished";
  actionLog: string[];
  playHistory: TrickPlay[];
  publicIdentity?: PublicGameIdentity;
  publicLedger?: HardPublicLedger;
  publicEvents?: ReturnType<typeof finalizePublicActionEvent>[];
};

export type PublicRoom = Omit<RoomState, "hands" | "initialHands" | "publicIdentity" | "publicLedger" | "publicEvents" | "d2fShadowMode" | "initialPublicLedger" | "d2fShadowEvidence" | "d2fShadowRunning"> & {
  humanSeat: Seat;
  humanHand: Card[];
  replayHands: Record<Seat, Card[]>;
  announcements: string[];
};

let nextRoomId = 1;

type CommonRoomCreationInput = Readonly<{
  rank: GameRank;
  seed?: number;
  pendingTributeItems?: TributeItem[];
  d2fShadowMode?: D2FShadowMode;
}>;

export type CanonicalRoomCreationInput = Readonly<{
  rank: GameRank;
  seed: number;
  pendingTributeItems?: TributeItem[];
  publicIdentity: PublicGameIdentity;
  d2fShadowMode?: D2FShadowMode;
}>;

export type LegacyBenchmarkRoomCreationInput = CommonRoomCreationInput;

type RoomIdentitySource =
  | { kind: "canonical"; identity: PublicGameIdentity }
  | { kind: "legacy-benchmark" };

function createRoomInternal({
  source,
  rank,
  seed = Date.now(),
  pendingTributeItems = [],
  d2fShadowMode = "disabled",
}: CommonRoomCreationInput & { source: RoomIdentitySource }): RoomState {
  const deck = shuffledDeck(seed);
  const hands = {
    0: deck.slice(0, 27),
    1: deck.slice(27, 54),
    2: deck.slice(54, 81),
    3: deck.slice(81, 108),
  } satisfies Record<Seat, Card[]>;

  const openingTribute = resolveOpeningTribute(hands, pendingTributeItems, rank);
  const openingLeader = openingTribute?.status === "pending" ? openingTribute.activeSeat ?? 0 : randomOpeningLeader(seed);

  const room: RoomState = {
    d2fShadowMode,
    initialPublicLedger: null,
    d2fShadowEvidence: null,
    d2fShadowRunning: false,
    id: `room-${nextRoomId++}`,
    rank,
    players: [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      name: seat === 0 ? "玩家" : `AI ${seat}`,
      isAI: seat !== 0,
      handCount: hands[seat as Seat].length,
      team: seat % 2 === 0 ? 0 : 1,
    })),
    hands,
    initialHands: {
      0: [...hands[0]],
      1: [...hands[1]],
      2: [...hands[2]],
      3: [...hands[3]],
    },
    currentTurn: openingLeader,
    leaderSeat: openingLeader,
    trick: { leadSeat: openingLeader, passSeats: [], plays: [] },
    currentTrickIndex: 0,
    finishOrder: [],
    openingTribute,
    aiPlans: {},
    aiRuntime: {},
    status: "playing",
    actionLog: ["房间已创建，AI 已补齐空位。"],
    playHistory: [],
  };
  if (source.kind === "canonical") {
    const publicIdentity = source.identity;
    room.publicIdentity = publicIdentity;
    room.publicLedger = createInitialPublicLedger({
      identity: publicIdentity,
      initialHandCounts: { 0: hands[0].length, 1: hands[1].length, 2: hands[2].length, 3: hands[3].length },
      openingLeader,
      initialTrickIndex: 0,
      openingTributePublicState: { status: openingTribute?.status ?? "none" },
    });
    room.initialPublicLedger = room.publicLedger;
    room.publicEvents = [];
    if (openingTribute?.status === "anti-tribute") {
      const antiTribute = finalizePublicActionEvent({
        schemaVersion: "d2-public-event-v2",
        gameId: publicIdentity.gameId,
        roundIdentity: publicIdentity.roundIdentity,
        handIdentity: publicIdentity.handIdentity,
        eventIndex: room.publicLedger.nextEventIndex,
        kind: "anti-tribute",
        seat: openingLeader,
        publicStableKey: "anti-tribute:anti-tribute",
        trickIndex: 0,
        reasonCode: "anti-tribute",
      } as PublicActionEventDraft);
      const result = applyPublicEvent(room.publicLedger, antiTribute);
      if (!result.ok) throw new Error(result.error);
      room.publicLedger = result.ledger;
      room.publicEvents = [antiTribute];
    }
  }
  return room;
}

export function createRoom(input: CanonicalRoomCreationInput): RoomState {
  if (input.publicIdentity === undefined) throw new Error("CANONICAL_ROOM_IDENTITY_REQUIRED");
  return createRoomInternal({ ...input, source: { kind: "canonical", identity: input.publicIdentity } });
}

export function createLegacyBenchmarkRoom(input: LegacyBenchmarkRoomCreationInput): RoomState {
  return createRoomInternal({ ...input, source: { kind: "legacy-benchmark" } });
}

export function getPublicRoom(
  room: RoomState,
  humanSeat: Seat,
  options: { ensurePlans?: boolean } = {},
): PublicRoom {
  if (options.ensurePlans !== false) {
    ensureAiPlans(room);
  }
  const {
    hands: _hands,
    initialHands: _initialHands,
    publicIdentity: _publicIdentity,
    publicLedger: _publicLedger,
    publicEvents: _publicEvents,
    d2fShadowMode: _d2fShadowMode,
    initialPublicLedger: _initialPublicLedger,
    d2fShadowEvidence: _d2fShadowEvidence,
    d2fShadowRunning: _d2fShadowRunning,
    ...publicState
  } = room;

  return {
    ...publicState,
    humanSeat,
    humanHand: room.hands[humanSeat],
    replayHands: {
      0: [...room.initialHands[0]],
      1: [...room.initialHands[1]],
      2: [...room.initialHands[2]],
      3: [...room.initialHands[3]],
    },
    players: room.players.map((player) => ({ ...player, handCount: room.hands[player.seat].length })),
    announcements: announcements(room, humanSeat),
  };
}

export function getD2FShadowEvidence(room: RoomState): D2FShadowEvidence | null {
  return room.d2fShadowEvidence === null ? null : structuredClone(room.d2fShadowEvidence);
}

function ensureAiPlans(room: RoomState): void {
  if (room.openingTribute?.status === "pending") {
    room.aiPlans = {};
    room.aiRuntime = {};
    return;
  }

  for (const player of room.players) {
    if (player.isAI) {
      ensureAiPlanForSeat(room, player.seat);
    }
  }
}

function toLegacyAiPlanState(seat: Seat, plan: HandPlan): AiPlanState {
  return {
    seat,
    name: "AI hand plan",
    score: Math.max(1, 100 - plan.metrics.estimatedTurns),
    groups: plan.groups,
  };
}

export function playCards(room: RoomState, seat: Seat, cardIds: string[]): void {
  if (room.publicIdentity !== undefined && room.publicLedger !== undefined && room.publicEvents !== undefined) {
    return playCardsWithPublicLedger(room, seat, cardIds);
  }
  playCardsLegacy(room, seat, cardIds);
}

function playCardsLegacy(room: RoomState, seat: Seat, cardIds: string[]): void {
  assertActiveTurn(room, seat);
  assertNoOpeningTribute(room);
  const selected = selectCards(room.hands[seat], cardIds);
  const group = classifyPlay(selected, room.rank);

  if (group === undefined) {
    throw new Error("所选牌不能组成合法牌型。");
  }

  if (!canBeatPlay(group, room.trick.lastPlay, room.rank)) {
    throw new Error("所选牌不能压过上家。");
  }

  const selectedIds = new Set(cardIds);
  room.hands[seat] = room.hands[seat].filter((card) => !selectedIds.has(card.id));
  room.trick.lastPlay = group;
  room.trick.lastPlaySeat = seat;
  room.trick.passSeats = [];
  const play = { seat, action: "play", group, trickIndex: room.currentTrickIndex } satisfies TrickPlay;
  room.trick.plays.push(play);
  room.playHistory.push(play);
  room.actionLog.unshift(`${playerName(room, seat)} 出牌：${playLabel(group)}。`);

  if (room.hands[seat].length === 0 && !room.finishOrder.includes(seat)) {
    room.finishOrder.push(seat);
    room.actionLog.unshift(`${playerName(room, seat)} 已出完。`);
  }

  advanceAfterAction(room, seat);
}

export function passTurn(room: RoomState, seat: Seat): void {
  if (room.publicIdentity !== undefined && room.publicLedger !== undefined && room.publicEvents !== undefined) {
    return passTurnWithPublicLedger(room, seat);
  }
  passTurnLegacy(room, seat);
}

function passTurnLegacy(room: RoomState, seat: Seat): void {
  assertActiveTurn(room, seat);
  assertNoOpeningTribute(room);
  if (room.trick.lastPlay === undefined) {
    throw new Error("首家不能过牌。");
  }

  if (!room.trick.passSeats.includes(seat)) {
    room.trick.passSeats.push(seat);
  }
  const play = { seat, action: "pass", trickIndex: room.currentTrickIndex } satisfies TrickPlay;
  room.trick.plays.push(play);
  room.playHistory.push(play);
  room.actionLog.unshift(`${playerName(room, seat)} 过牌。`);

  if (room.trick.passSeats.length >= passesNeededToReset(room)) {
    const leadSeat = resolveTrickWinnerSeat(room);
    room.trick = { leadSeat, passSeats: [], plays: [] };
    room.currentTrickIndex += 1;
    room.currentTurn = leadSeat;
    room.leaderSeat = leadSeat;
    room.actionLog.unshift(`${playerName(room, leadSeat)} 接风。`);
  } else {
    room.currentTurn = nextPlayableSeat(room, seat);
  }
}

function playCardsWithPublicLedger(room: RoomState, seat: Seat, cardIds: string[]): void {
  const draft = structuredClone(room);
  const beforeHandCount = room.hands[seat].length;
  playCardsLegacy(draft, seat, cardIds);
  const play = draft.playHistory.at(-1);
  if (play?.action !== "play" || play.group === undefined || room.publicIdentity === undefined || room.publicLedger === undefined || room.publicEvents === undefined) throw new Error("D2A_PUBLIC_PLAY_EVENT_MISSING");
  const eventDrafts: PublicActionEventDraft[] = [{
    schemaVersion: "d2-public-event-v2",
    gameId: room.publicIdentity.gameId,
    roundIdentity: room.publicIdentity.roundIdentity,
    handIdentity: room.publicIdentity.handIdentity,
    eventIndex: room.publicLedger.nextEventIndex,
    kind: "play",
    seat,
    publicStableKey: `play:${[...cardIds].sort().join(",")}`,
    publicCardIds: [...cardIds],
    patternType: play.group.type,
    groupType: play.group.type,
    handCountBefore: beforeHandCount,
    handCountAfter: draft.hands[seat].length,
    trickIndex: play.trickIndex ?? room.currentTrickIndex,
    usedWildcardCount: play.group.wildcards.length,
    usedBomb: play.group.type === "bomb" || play.group.type === "straight-flush" || play.group.type === "joker-bomb",
  } as PublicActionEventDraft];
  for (const finishedSeat of draft.finishOrder.slice(room.finishOrder.length)) {
    const finishReason = finishedSeat === seat && draft.hands[finishedSeat].length === 0 ? "hand-empty" : "round-settlement";
    eventDrafts.push({
      schemaVersion: "d2-public-event-v2",
      gameId: room.publicIdentity.gameId,
      roundIdentity: room.publicIdentity.roundIdentity,
      handIdentity: room.publicIdentity.handIdentity,
      eventIndex: room.publicLedger.nextEventIndex + eventDrafts.length,
      kind: "finish",
      seat: finishedSeat,
      publicStableKey: `finish:${room.finishOrder.length + eventDrafts.length}:${finishReason}`,
      trickIndex: play.trickIndex ?? room.currentTrickIndex,
      finishPosition: room.finishOrder.length + eventDrafts.length,
      remainingHandCount: draft.hands[finishedSeat].length,
      finishReason,
    } as PublicActionEventDraft);
  }
  commitPublicTransition(room, draft, eventDrafts);
}

function passTurnWithPublicLedger(room: RoomState, seat: Seat): void {
  const draft = structuredClone(room);
  passTurnLegacy(draft, seat);
  if (JSON.stringify(draft.finishOrder) !== JSON.stringify(room.finishOrder)) throw new Error("D2A_FINISH_EVENT_PENDING");
  const pass = draft.playHistory.at(-1);
  if (pass?.action !== "pass" || room.publicIdentity === undefined || room.publicLedger === undefined || room.publicEvents === undefined) throw new Error("D2A_PUBLIC_PASS_EVENT_MISSING");
  const eventDrafts: PublicActionEventDraft[] = [{
    schemaVersion: "d2-public-event-v2",
    gameId: room.publicIdentity.gameId,
    roundIdentity: room.publicIdentity.roundIdentity,
    handIdentity: room.publicIdentity.handIdentity,
    eventIndex: room.publicLedger.nextEventIndex,
    kind: "pass",
    seat,
    publicStableKey: "pass:v2",
    handCountBefore: room.hands[seat].length,
    handCountAfter: room.hands[seat].length,
    trickIndex: pass.trickIndex ?? room.currentTrickIndex,
  } as PublicActionEventDraft];
  if (draft.currentTrickIndex !== room.currentTrickIndex) {
    eventDrafts.push({
      schemaVersion: "d2-public-event-v2",
      gameId: room.publicIdentity.gameId,
      roundIdentity: room.publicIdentity.roundIdentity,
      handIdentity: room.publicIdentity.handIdentity,
      eventIndex: room.publicLedger.nextEventIndex + 1,
      kind: "trick-clear",
      seat,
      publicStableKey: `trick-clear:${room.currentTrickIndex}:${draft.currentTrickIndex}`,
      trickIndex: room.currentTrickIndex,
      leadSeat: draft.trick.leadSeat,
    } as PublicActionEventDraft);
  }
  commitPublicTransition(room, draft, eventDrafts);
}

function commitPublicTransition(room: RoomState, draft: RoomState, eventDrafts: readonly PublicActionEventDraft[]): void {
  if (room.publicLedger === undefined || room.publicEvents === undefined) throw new Error("D2A_PUBLIC_LEDGER_MISSING");
  const finalizedEvents = eventDrafts.map((eventDraft) => finalizePublicActionEvent(eventDraft));
  let nextLedger = room.publicLedger;
  for (const event of finalizedEvents) {
    const result = applyPublicEvent(nextLedger, event);
    if (!result.ok) throw new Error(result.error);
    nextLedger = result.ledger;
  }
  crossCheckTransition(draft, nextLedger, finalizedEvents);
  room.players = structuredClone(draft.players);
  room.hands = structuredClone(draft.hands);
  room.initialHands = structuredClone(draft.initialHands);
  room.currentTurn = draft.currentTurn;
  room.leaderSeat = draft.leaderSeat;
  room.trick = structuredClone(draft.trick);
  room.currentTrickIndex = draft.currentTrickIndex;
  room.finishOrder = structuredClone(draft.finishOrder);
  room.openingTribute = structuredClone(draft.openingTribute);
  room.settlement = structuredClone(draft.settlement);
  room.aiPlans = structuredClone(draft.aiPlans);
  room.aiRuntime = structuredClone(draft.aiRuntime);
  room.status = draft.status;
  room.actionLog = structuredClone(draft.actionLog);
  room.playHistory = structuredClone(draft.playHistory);
  room.publicLedger = nextLedger;
  room.publicEvents = [...room.publicEvents, ...finalizedEvents];
}

function crossCheckTransition(room: RoomState, ledger: HardPublicLedger, events: readonly ReturnType<typeof finalizePublicActionEvent>[]): void {
  if (ledger.handCounts[0] !== room.hands[0].length || ledger.handCounts[1] !== room.hands[1].length || ledger.handCounts[2] !== room.hands[2].length || ledger.handCounts[3] !== room.hands[3].length) throw new Error("D2A_LEDGER_ROOM_MISMATCH");
  if (ledger.currentTrick.trickIndex !== room.currentTrickIndex) throw new Error("D2A_LEDGER_TRICK_MISMATCH");
  const lastEvent = events.at(-1);
  if (lastEvent?.kind === "trick-clear") {
    if (ledger.currentTrick.leadSeat !== room.trick.leadSeat || ledger.currentTrick.passSeats.length !== 0 || ledger.currentTrick.lastPlaySeat !== undefined) throw new Error("D2A_LEDGER_TRICK_MISMATCH");
  } else if (room.trick.lastPlaySeat !== undefined && ledger.currentTrick.lastPlaySeat !== room.trick.lastPlaySeat) {
    throw new Error("D2A_LEDGER_TRICK_MISMATCH");
  }
}

export function runAiStep(room: RoomState, diagnostics?: AiPlanningDiagnostics): void {
  if (room.d2fShadowRunning) {
    return;
  }
  if (room.status !== "playing") {
    return;
  }

  normalizeActiveSeat(room);
  if (room.status !== "playing") {
    return;
  }

  if (room.openingTribute?.status === "pending") {
    const activePlayer = room.players.find((candidate) => candidate.seat === room.openingTribute?.activeSeat);
    if (activePlayer?.isAI === true) {
      advanceOpeningTribute(room);
    }
    return;
  }

  const player = room.players.find((candidate) => candidate.seat === room.currentTurn);
  if (player?.isAI !== true) {
    return;
  }

  const seat = room.currentTurn;
  const partner = partnerSeat(seat);
  const handBefore = [...room.hands[seat]];
  const decision = decideAiAction({
    hand: [...room.hands[seat]],
    gameRank: room.rank,
    seat,
    partnerSeat: partner,
    lastPlay: room.trick.lastPlay,
    lastPlaySeat: room.trick.lastPlaySeat,
    playedCards: room.playHistory.flatMap((play) => play.group?.cards ?? []),
    handCounts: Object.fromEntries(room.players.map((candidate) => [candidate.seat, room.hands[candidate.seat].length])),
    finishOrder: room.finishOrder,
    partnerPassedCurrentTrick: room.trick.passSeats.includes(partner),
  }, room.aiRuntime[seat] ?? emptyAiRuntime(), { ...DEFAULT_AI_PERFORMANCE_CONFIG, turn: room.currentTrickIndex, diagnostics });
  const selectedPlan = decision.selectedPlan ?? decision.runtime.candidatePlans.find((plan) => plan.id === decision.selectedPlanId);
  if (selectedPlan === undefined) throw new Error("AI_ENGINE_MISSING_SELECTED_PLAN");
  const action = decision.action;

  runD2FShadow(room, seat, partner, decision);

  if (action.type === "pass") {
    if (room.trick.lastPlay === undefined) {
      throw new Error("AI_ENGINE_RETURNED_LEAD_PASS");
    }
    passTurn(room, seat);
    room.aiRuntime[seat] = applyExecutedAction(decision.runtime, handBefore, undefined, room.hands[seat], room.rank, room.currentTrickIndex, DEFAULT_AI_PERFORMANCE_CONFIG.planning, DEFAULT_AI_PERFORMANCE_CONFIG.version, diagnostics);
    room.aiPlans[seat] = toLegacyAiPlanState(seat, selectedPlan);
  } else {
    playCards(room, seat, action.group.cards.map((card) => card.id));
    const runtime = applyExecutedAction(decision.runtime, handBefore, action.group, room.hands[seat], room.rank, room.currentTrickIndex, DEFAULT_AI_PERFORMANCE_CONFIG.planning, DEFAULT_AI_PERFORMANCE_CONFIG.version, diagnostics);
    room.aiRuntime[seat] = runtime;
    const plan = runtime.candidatePlans.find((candidate) => candidate.id === runtime.activePlanId);
    if (runtime.needsReplan || plan === undefined) delete room.aiPlans[seat]; else room.aiPlans[seat] = toLegacyAiPlanState(seat, plan);
  }
}

function runD2FShadow(room: RoomState, seat: Seat, partner: Seat, decision: AiDecision): void {
  if (room.d2fShadowMode !== "enabled" || room.initialPublicLedger === null || room.publicIdentity === undefined || room.publicLedger === undefined || room.publicEvents === undefined) {
    return;
  }

  room.d2fShadowRunning = true;
  try {
    const candidates = createD2FShadowCandidates({
      evaluatedCandidates: decision.evaluatedCandidates,
      selectedAction: decision.action,
    });
    if (!candidates.ok) {
      room.d2fShadowEvidence = createD2FShadowFailureEvidence({ fallbackReason: "candidate-failed" });
      return;
    }

    const snapshot = createD2FShadowPreActionSnapshot({
      publicIdentity: room.publicIdentity,
      initialLedger: room.initialPublicLedger,
      finalLedger: room.publicLedger,
      publicHistoryEvents: room.publicEvents,
      gameRank: room.rank,
      perspectiveSeat: seat,
      actingSeat: seat,
      ownCurrentHand: room.hands[seat],
      publicState: {
        gameRank: room.rank,
        actingSeat: seat,
        perspectiveSeat: seat,
        partnerSeat: partner,
        handCounts: Object.fromEntries(room.players.map((player) => [player.seat, room.hands[player.seat].length])),
        finishOrder: room.finishOrder,
        publicPlayedCardIds: room.publicLedger.playedCardIds,
        currentLastPlay: room.trick.lastPlay ?? null,
        currentLastPlaySeat: room.trick.lastPlaySeat ?? null,
      },
      currentTrick: {
        leadSeat: room.trick.leadSeat,
        lastPlay: room.trick.lastPlay ?? null,
        lastPlaySeat: room.trick.lastPlaySeat ?? null,
        passSeats: room.trick.passSeats,
      },
      candidates: candidates.value.candidates,
      selectedCandidateId: candidates.value.selectedCandidateId,
    });
    if (!snapshot.ok) {
      room.d2fShadowEvidence = createD2FShadowFailureEvidence({
        fallbackReason: snapshot.failure.kind === "invalid-candidate-projection" ? "candidate-failed" : "snapshot-failed",
        formalCandidateId: candidates.value.selectedCandidateId,
        baselineActionIdentity: candidates.value.selectedCandidateId,
        baselineEvaluatorScore: candidates.value.candidates.find((candidate) => candidate.candidateId === candidates.value.selectedCandidateId)?.baselineEvaluatorScore ?? null,
      });
      return;
    }
    room.d2fShadowEvidence = observeD2FShadow(snapshot.value);
  } catch {
    room.d2fShadowEvidence = createD2FShadowFailureEvidence({ fallbackReason: "unexpected-failure" });
  } finally {
    room.d2fShadowRunning = false;
  }
}

function normalizeActiveSeat(room: RoomState): void {
  const activeHand = room.hands[room.currentTurn];
  if (activeHand.length > 0 && !room.finishOrder.includes(room.currentTurn)) {
    return;
  }

  const liveSeats = room.players
    .map((player) => player.seat)
    .filter((seat) => room.hands[seat].length > 0 && !room.finishOrder.includes(seat));
  if (liveSeats.length === 0) {
    finishRound(room);
    return;
  }

  room.currentTurn = nextPlayableSeat(room, room.currentTurn);
  if (room.trick.lastPlay === undefined) {
    room.trick.leadSeat = room.currentTurn;
    room.leaderSeat = room.currentTurn;
  }
}

function ensureAiPlanForSeat(room: RoomState, seat: Seat): void {
  const previousRuntime = room.aiRuntime[seat];
  const runtime = ensurePlans(
    previousRuntime ?? emptyAiRuntime(),
    room.hands[seat],
    room.rank,
    room.currentTrickIndex,
    DEFAULT_AI_PERFORMANCE_CONFIG.planning,
    DEFAULT_AI_PERFORMANCE_CONFIG.version,
  );
  if (runtime === previousRuntime && room.aiPlans[seat] !== undefined) {
    return;
  }
  room.aiRuntime[seat] = runtime;
  const plan = runtime.candidatePlans.find((candidate) => candidate.id === runtime.activePlanId) ?? runtime.candidatePlans[0];
  if (plan === undefined) {
    throw new Error("AI_PLAN_GENERATION_FAILED");
  }
  room.aiPlans[seat] = toLegacyAiPlanState(seat, plan);
}

function emptyAiRuntime(): AiRuntimeState {
  return {
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  };
}

export function advanceOpeningTribute(room: RoomState, seat?: Seat, cardIds: string[] = []): void {
  if (room.publicIdentity !== undefined && room.publicLedger !== undefined && room.publicEvents !== undefined) {
    return advanceOpeningTributeWithPublicLedger(room, seat, cardIds);
  }
  advanceOpeningTributeLegacy(room, seat, cardIds);
}

function advanceOpeningTributeWithPublicLedger(room: RoomState, seat?: Seat, cardIds: string[] = []): void {
  const draft = structuredClone(room);
  const phase = room.openingTribute?.phase;
  advanceOpeningTributeLegacy(draft, seat, cardIds);
  const eventDrafts = buildTransferEventDrafts(room, draft, phase);
  commitPublicTransition(room, draft, eventDrafts);
}

function buildTransferEventDrafts(room: RoomState, draft: RoomState, phase: TributeState["phase"]): PublicActionEventDraft[] {
  if (room.publicIdentity === undefined || room.publicLedger === undefined) return [];
  const changes = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Seat, number>;
  let fromSeat: Seat | undefined;
  let toSeat: Seat | undefined;
  let cardId: string | undefined;
  for (const candidate of [0, 1, 2, 3] as const) {
    const before = new Set(room.hands[candidate].map((card) => card.id));
    const after = new Set(draft.hands[candidate].map((card) => card.id));
    const removed = [...before].filter((id) => !after.has(id));
    const added = [...after].filter((id) => !before.has(id));
    changes[candidate] = draft.hands[candidate].length - room.hands[candidate].length;
    if (removed.length === 1) {
      fromSeat = candidate;
      cardId = removed[0];
    }
    if (added.length === 1) toSeat = candidate;
  }
  if (fromSeat === undefined || toSeat === undefined || cardId === undefined || fromSeat === toSeat) return [];
  const kind = phase === "return" ? "return" : "tribute";
  return [{
    schemaVersion: "d2-public-event-v2",
    gameId: room.publicIdentity.gameId,
    roundIdentity: room.publicIdentity.roundIdentity,
    handIdentity: room.publicIdentity.handIdentity,
    eventIndex: room.publicLedger.nextEventIndex,
    kind,
    seat: fromSeat,
    publicCardIds: [cardId],
    fromSeat,
    toSeat,
    handCountChanges: changes,
    publicStableKey: `${kind}:${fromSeat}:${toSeat}:${cardId}`,
    trickIndex: room.publicLedger.currentTrick.trickIndex,
  } as PublicActionEventDraft];
}

function advanceOpeningTributeLegacy(room: RoomState, seat?: Seat, cardIds: string[] = []): void {
  const tribute = room.openingTribute;
  if (tribute === undefined || tribute.status !== "pending") {
    return;
  }

  const itemIndex = tribute.activeItemIndex ?? 0;
  const activeItem = tribute.phase === "return" ? tribute.exchanges?.[itemIndex] : tribute.items[itemIndex];
  if (activeItem === undefined) {
    completeOpeningTribute(room);
    return;
  }

  if (tribute.phase === "return") {
    const returnSeat = activeItem.receiver;
    const returnCard = selectOpeningReturnCard(room, returnSeat, seat, cardIds);
    moveCard(room.hands, returnSeat, activeItem.payer, returnCard);

    const exchange = tribute.exchanges?.[itemIndex];
    if (exchange !== undefined) {
      exchange.returnCard = returnCard;
    }

    const nextItemIndex = itemIndex + 1;
    if (nextItemIndex >= tribute.items.length) {
      completeOpeningTribute(room, returnCard);
      return;
    }

    const nextItem = tribute.exchanges?.[nextItemIndex];
    room.openingTribute = {
      ...tribute,
      status: "pending",
      phase: "return",
      activeItemIndex: nextItemIndex,
      activeSeat: nextItem?.receiver,
      activeCard: returnCard,
    };
    return;
  }

  const item = activeItem;
  const payerSeat = item.payer;
  const tributeCard = selectOpeningTributeCard(room, payerSeat, seat, cardIds);
  removeCard(room.hands, payerSeat, tributeCard);

  const exchanges = [...(tribute.exchanges ?? [])];
  exchanges[itemIndex] = {
    payer: item.payer,
    receiver: item.receiver,
    tributeCard,
  };

  const nextItemIndex = itemIndex + 1;
  if (nextItemIndex < tribute.items.length) {
    const nextItem = tribute.items[nextItemIndex];
    room.openingTribute = {
      ...tribute,
      status: "pending",
      phase: "tribute",
      activeItemIndex: nextItemIndex,
      activeSeat: nextItem.payer,
      activeCard: tributeCard,
      exchanges,
    };
    return;
  }

  const assignedExchanges = assignTributeReceivers(room, tribute.items, exchanges);
  room.openingTribute = {
    ...tribute,
    status: "pending",
    phase: "return",
    activeItemIndex: 0,
    activeSeat: assignedExchanges[0]?.receiver,
    activeCard: tributeCard,
    exchanges: assignedExchanges,
  };
}

export function runAiUntilHumanTurn(room: RoomState, humanSeat: Seat = 0): void {
  let guard = 0;
  while (room.status === "playing" && room.currentTurn !== humanSeat && room.players.find((player) => player.seat === room.currentTurn)?.isAI && guard < 128) {
    runAiStep(room);
    guard += 1;
  }
}

function shuffledDeck(seed: number): Card[] {
  const deck = createDeck();
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

function randomOpeningLeader(seed: number): Seat {
  return (((seed - 1) % 4 + 4) % 4) as Seat;
}

function selectCards(hand: Card[], cardIds: string[]): Card[] {
  if (cardIds.length === 0) {
    throw new Error("AI_ACTION_EMPTY_CARDS");
  }
  if (new Set(cardIds).size !== cardIds.length) {
    throw new Error("AI_ACTION_CONTAINS_DUPLICATE_CARDS");
  }
  const cards = cardIds.map((id) => hand.find((card) => card.id === id));
  if (cards.some((card) => card === undefined)) {
    throw new Error("所选牌不在当前手牌中。");
  }

  return cards as Card[];
}

function assertActiveTurn(room: RoomState, seat: Seat): void {
  if (room.status !== "playing") {
    throw new Error("牌局已经结束。");
  }

  if (room.currentTurn !== seat) {
    throw new Error("还没有轮到该座位。");
  }
}

function assertNoOpeningTribute(room: RoomState): void {
  if (room.openingTribute?.status === "pending") {
    throw new Error("开局贡还牌尚未完成。");
  }
}

function advanceAfterAction(room: RoomState, seat: Seat): void {
  if (room.finishOrder.length >= 3 || partnersFinishedFirstAndSecond(room)) {
    finishRound(room);
    return;
  }

  room.currentTurn = nextPlayableSeat(room, seat);
  room.leaderSeat = room.trick.lastPlaySeat ?? room.currentTurn;
}

function partnersFinishedFirstAndSecond(room: RoomState): boolean {
  return room.finishOrder.length >= 2 && partnerSeat(room.finishOrder[0]) === room.finishOrder[1];
}

function finishRound(room: RoomState): void {
  for (const player of room.players) {
    if (!room.finishOrder.includes(player.seat)) {
      room.finishOrder.push(player.seat);
    }
  }

  const jokerHoldings = Object.fromEntries(
    room.players.map((player) => [
      player.seat,
      room.hands[player.seat].filter((card) => card.kind === "joker" && card.rank === "BJ").map((card) => card.id),
    ]),
  ) as Partial<Record<Seat, string[]>>;

  room.status = "finished";
  room.settlement = settleRound(room.finishOrder, room.rank, jokerHoldings);
  room.actionLog.unshift(`本局结束：${settlementText(room.settlement)}。`);
}

function resolveOpeningTribute(hands: Record<Seat, Card[]>, items: TributeItem[], gameRank: GameRank): TributeState | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const payerSeats = [...new Set(items.map((item) => item.payer))];
  const bigJokerCount = payerSeats
    .flatMap((seat) => hands[seat])
    .filter((card) => card.kind === "joker" && card.rank === "BJ").length;

  if (bigJokerCount >= 2) {
    return {
      status: "anti-tribute",
      items: [],
      reason: "进贡方合计持有两张大王，抗贡成立。",
    };
  }

  return {
    status: "pending",
    items,
    exchanges: [],
    phase: "tribute",
    activeItemIndex: 0,
    activeSeat: items[0].payer,
  };
}

function moveCard(hands: Record<Seat, Card[]>, from: Seat, to: Seat, card: Card): void {
  hands[from] = hands[from].filter((candidate) => candidate.id !== card.id);
  hands[to] = [...hands[to], card];
}

function removeCard(hands: Record<Seat, Card[]>, from: Seat, card: Card): void {
  hands[from] = hands[from].filter((candidate) => candidate.id !== card.id);
}

function assignTributeReceivers(room: RoomState, items: TributeItem[], exchanges: NonNullable<TributeState["exchanges"]>): NonNullable<TributeState["exchanges"]> {
  const receivers = items.map((item) => item.receiver);
  const assigned = [...exchanges].sort(
    (left, right) => tributeCardStrength(right.tributeCard, room.rank) - tributeCardStrength(left.tributeCard, room.rank),
  );

  return assigned.map((exchange, index) => {
    const receiver = receivers[index] ?? exchange.receiver;
    room.hands[receiver] = [...room.hands[receiver], exchange.tributeCard];
    return {
      ...exchange,
      receiver,
    };
  });
}

function selectOpeningTributeCard(room: RoomState, payerSeat: Seat, actingSeat: Seat | undefined, cardIds: string[]): Card {
  if (room.players.find((player) => player.seat === payerSeat)?.isAI === true) {
    return strongestTributeCard(room.hands[payerSeat], room.rank);
  }

  if (actingSeat !== payerSeat) {
    throw new Error("请由进贡方选择进贡牌。");
  }

  const selected = selectCards(room.hands[payerSeat], cardIds);
  if (selected.length !== 1 || isHeartRankWild(selected[0], room.rank)) {
    throw new Error("进贡牌必须是一张非红心级牌。");
  }

  return selected[0];
}

function selectOpeningReturnCard(room: RoomState, receiverSeat: Seat, actingSeat: Seat | undefined, cardIds: string[]): Card {
  if (room.players.find((player) => player.seat === receiverSeat)?.isAI === true) {
    return weakestReturnCard(room.hands[receiverSeat], room.rank);
  }

  if (actingSeat !== receiverSeat) {
    throw new Error("请由受贡方选择还贡牌。");
  }

  const selected = selectCards(room.hands[receiverSeat], cardIds);
  if (selected.length !== 1 || !isLegalReturnCard(selected[0], room.rank)) {
    throw new Error("还贡牌必须是一张 10 以下的非红心级牌。");
  }

  return selected[0];
}

function completeOpeningTribute(room: RoomState, activeCard?: Card): void {
  const tribute = room.openingTribute;
  if (tribute === undefined) {
    return;
  }

  room.openingTribute = {
    ...tribute,
    status: "completed",
    phase: "done",
    activeSeat: undefined,
    activeCard,
  };

  room.initialHands = {
    0: [...room.hands[0]],
    1: [...room.hands[1]],
    2: [...room.hands[2]],
    3: [...room.hands[3]],
  };

  const leader = tribute.exchanges?.[0]?.payer;
  if (leader !== undefined) {
    room.currentTurn = leader;
    room.leaderSeat = leader;
    room.trick = { leadSeat: leader, passSeats: [], plays: [] };
  }
}

function strongestTributeCard(hand: Card[], gameRank: GameRank): Card {
  const card = [...hand]
    .filter((candidate) => !isHeartRankWild(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(right, gameRank) - tributeCardStrength(left, gameRank))[0];

  if (card === undefined) {
    throw new Error("No tribute card is available.");
  }

  return card;
}

function weakestReturnCard(hand: Card[], gameRank: GameRank): Card {
  const preferred = [...hand]
    .filter((candidate) => isLegalReturnCard(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(left, gameRank) - tributeCardStrength(right, gameRank))[0];

  if (preferred !== undefined) {
    return preferred;
  }

  const fallback = [...hand]
    .filter((candidate) => !isHeartRankWild(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(left, gameRank) - tributeCardStrength(right, gameRank))[0];

  if (fallback === undefined) {
    throw new Error("No return card is available.");
  }

  return fallback;
}

function isLegalReturnCard(card: Card, gameRank: GameRank): boolean {
  return card.kind === "suited" && naturalRankValue(card.rank) <= naturalRankValue("10") && !isHeartRankWild(card, gameRank);
}

function tributeCardStrength(card: Card, gameRank: GameRank): number {
  if (card.kind === "joker") {
    return rankStrength(card.rank, gameRank) * 10;
  }

  return rankStrength(card.rank, gameRank) * 10 + suitStrength(card.suit);
}

function suitStrength(suit: Suit): number {
  return { spades: 4, clubs: 3, hearts: 2, diamonds: 1 }[suit];
}

function naturalRankValue(rank: Rank): number {
  return ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].indexOf(rank);
}

function settlementText(settlement: RoundSettlement): string {
  const outcomeText: Record<RoundSettlement["outcome"], string> = {
    "double-down": "双下",
    "single-down": "单下",
    "single-win": "单胜",
  };

  return `${outcomeText[settlement.outcome]}，升 ${settlement.levelStep} 级，下一局打 ${settlement.nextRank}`;
}

function nextPlayableSeat(room: RoomState, fromSeat: Seat): Seat {
  let next = ((fromSeat + 3) % 4) as Seat;
  while (room.finishOrder.includes(next)) {
    next = ((next + 3) % 4) as Seat;
  }
  return next;
}

function passesNeededToReset(room: RoomState): number {
  return Math.max(1, room.players.length - room.finishOrder.length - 1);
}

function resolveTrickWinnerSeat(room: RoomState): Seat {
  const lastPlaySeat = room.trick.lastPlaySeat ?? room.currentTurn;
  if (!room.finishOrder.includes(lastPlaySeat)) {
    return lastPlaySeat;
  }

  const partner = partnerSeat(lastPlaySeat);
  return room.finishOrder.includes(partner) ? nextPlayableSeat(room, lastPlaySeat) : partner;
}

function partnerSeat(seat: number): Seat {
  return ((seat + 2) % 4) as Seat;
}

function playerName(room: RoomState, seat: Seat): string {
  return room.players.find((player) => player.seat === seat)?.name ?? `座位 ${seat}`;
}

function playLabel(group: CardGroup): string {
  const labels: Record<CardGroup["type"], string> = {
    single: "单张",
    pair: "对子",
    triple: "三张",
    "full-house": "夯",
    straight: "顺子",
    "consecutive-pairs": "木板",
    plate: "钢板",
    bomb: "炸弹",
    "straight-flush": "同花顺",
    "joker-bomb": "王炸",
  };

  return `${labels[group.type]} ${group.cards.length} 张`;
}

function announcements(room: RoomState, humanSeat: Seat): string[] {
  const count = room.hands[humanSeat].length;
  const messages: string[] = [];

  if (count <= 10) {
    messages.push(`剩余 ${count} 张，有问必报。`);
  }

  if (count <= 6) {
    messages.push(`剩余 ${count} 张，主动报牌。`);
  }

  return messages;
}
