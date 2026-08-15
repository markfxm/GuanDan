import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../src/ai/config";
import type { AiAction, AiDecision, AiRuntimeState } from "../../src/ai/contracts";
import { canonicalActionIdentity } from "../../src/ai/rollout/contracts";
import * as aiDecisionEngine from "../../src/ai/aiDecisionEngine";
import {
  computeD2GCandidateUniverseHash,
  computeD2GDecisionIdentity,
  type D2GDecisionContext,
} from "../../src/ai/d2g/treatmentContracts";
import {
  computeD2GPreActionGameplayStateHash,
  computeD2GPrivateOwnHandFingerprint,
  selectD2GTreatment,
  type D2GRolloutEvidence,
  type D2GPreActionState,
  type D2GTreatmentSelection,
} from "../../src/ai/d2g/treatmentSelector";
import { applyExecutedAction } from "../../src/ai/planning/planManager";
import { createD2FShadowCandidates, createD2FShadowPreActionSnapshot } from "../../src/ai/rollout/d2fShadowObserver";
import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
import * as roomModule from "../../src/game/room";
import type { AiPlanState, RoomState } from "../../src/game/room";
import type { PublicActionEvent } from "../../src/game/publicEvent";
import type { PublicLedgerReplayInitialState } from "../../src/game/publicEventReplay";
import { sha256Bytes } from "../../src/game/publicEventHash";
import type { GameRank } from "../../src/engine/cards";
import { createBenchmarkObservation, toProductionObservation } from "./observation";
import { canonicalJson } from "./contracts";
import type {
  D2GCanonicalHeadToHeadTask,
  D2GPartnershipStrategy,
} from "./d2gCanonicalAdapter";

export type D2GDecisionTelemetryRecord = Readonly<{
  decisionIndex: number;
  actingSeat: 0 | 1 | 2 | 3;
  actingStrategy: D2GPartnershipStrategy;
  decisionIdentity: string | null;
  candidateUniverseHash: string | null;
  preActionGameplayStateHash: string | null;
  baselineCandidateId: string;
  treatmentCandidateId: string | null;
  selectedCandidateId: string | null;
  executedCandidateId: string;
  selection: D2GTreatmentSelection["selection"] | "unavailable";
  fallbackReason: D2GTreatmentSelection["fallbackReason"];
  disagreement: boolean | null;
  rankingHash: string | null;
  rolloutWorkUnits: number;
  rolloutEvidence: D2GRolloutEvidence | null;
  productionDecisionCostMs: number;
  rolloutEvaluationCostMs: number;
}>;

type D2GTreatmentOutcome = Pick<
  D2GTreatmentSelection,
  | "selectedAction"
  | "treatmentCandidateId"
  | "selectedCandidateId"
  | "selection"
  | "disagreement"
  | "fallbackReason"
  | "rankingHash"
  | "rolloutWorkUnits"
  | "rolloutEvidence"
  | "telemetry"
  | "rolloutEvaluationCostMs"
>;

type D2GTreatmentInputFailure = Readonly<{
  kind: "treatment-input-failure";
  fallbackReason: Exclude<D2GTreatmentSelection["fallbackReason"], "none">;
  countsAsError: boolean;
  elapsedMs: number;
}>;

export type D2GCandidateReuseTracker = Readonly<{
  crossGameCandidateReuseCount: number;
  register(gameId: string, decision: AiDecision): void;
}>;

export function createD2GCandidateReuseTracker(): D2GCandidateReuseTracker {
  const owners = new WeakMap<object, string>();
  let crossGameCandidateReuseCount = 0;
  return {
    get crossGameCandidateReuseCount() {
      return crossGameCandidateReuseCount;
    },
    register(gameId, decision) {
      const sources: unknown[] = [decision.evaluatedCandidates];
      for (const evaluated of decision.evaluatedCandidates) {
        sources.push(evaluated, evaluated.candidate, evaluated.candidate.action);
      }
      for (const source of sources) {
        if (typeof source !== "object" || source === null) continue;
        const owner = owners.get(source);
        if (owner !== undefined && owner !== gameId) crossGameCandidateReuseCount += 1;
        else if (owner === undefined) owners.set(source, gameId);
      }
    },
  };
}

export type D2GHeadToHeadSimulationOptions = Readonly<{
  maxTurns?: number;
  candidateReuseTracker?: D2GCandidateReuseTracker;
}>;

export type D2GHeadToHeadGameResult = Readonly<{
  schemaVersion: "d2g-head-to-head-game-v1";
  gameId: string;
  rotationPairKey: string;
  baseSeed: number;
  rank: GameRank;
  rotation: 0 | 1 | 2 | 3;
  allocation: "AB" | "BA";
  matchup: string;
  configHash: string;
  profileHash: string;
  baselineTeam: "A" | "B";
  treatmentTeam: "A" | "B";
  strategyAssignment: D2GCanonicalHeadToHeadTask["strategyAssignment"];
  initialPublicReplayState: PublicLedgerReplayInitialState;
  initialPublicLedgerHash: string;
  finalPublicLedgerHash: string;
  publicTraceHash: string;
  semanticHash: string;
  publicEvents: readonly PublicActionEvent[];
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  winnerTeam: 0 | 1 | null;
  winningPartnership: "baseline" | "treatment" | null;
  completed: boolean;
  cardConservation: boolean;
  termination: "finished" | "turn-limit" | "error";
  decisionCount: number;
  actionExecutionCount: number;
  playCount: number;
  passCount: number;
  tributeTransitionCount: number;
  returnTransitionCount: number;
  runtimePlanMismatchCount: number;
  crossGameCandidateReuseCount: number;
  decisionTelemetry: readonly D2GDecisionTelemetryRecord[];
  fallbackCounts: Readonly<Record<string, number>>;
  errorCounters: Readonly<{
    total: number;
    decisionErrors: number;
    treatmentErrors: number;
    executionErrors: number;
    transitionErrors: number;
    guardErrors: number;
  }>;
  errors: readonly string[];
  elapsedMs: number;
}>;

export function simulateD2GHeadToHeadGame(
  task: D2GCanonicalHeadToHeadTask,
  options: D2GHeadToHeadSimulationOptions = {},
): D2GHeadToHeadGameResult {
  const startedAt = performance.now();
  const room = structuredClone(task.room);
  const initialPublicReplayState = createInitialPublicReplayState(room);
  const maxTurns = options.maxTurns ?? 5000;
  const candidateReuseTracker = options.candidateReuseTracker ?? createD2GCandidateReuseTracker();
  const decisionTelemetry: D2GDecisionTelemetryRecord[] = [];
  const fallbackCounts: Record<string, number> = {};
  const errors: string[] = [];
  const errorCounters = { total: 0, decisionErrors: 0, treatmentErrors: 0, executionErrors: 0, transitionErrors: 0, guardErrors: 0 };
  let decisionCount = 0;
  let actionExecutionCount = 0;
  let playCount = 0;
  let passCount = 0;
  let tributeTransitionCount = 0;
  let returnTransitionCount = 0;
  let runtimePlanMismatchCount = 0;
  let turnCount = 0;
  let decisionIndex = 0;
  let termination: D2GHeadToHeadGameResult["termination"] = "finished";

  while (room.status === "playing") {
    if (turnCount >= maxTurns) {
      termination = "turn-limit";
      errorCounters.guardErrors += 1;
      break;
    }

    if (room.openingTribute?.status === "pending") {
      const before = room.publicEvents?.length ?? 0;
      try {
        roomModule.advanceOpeningTribute(room);
        const transitionEvents = (room.publicEvents ?? []).slice(before);
        tributeTransitionCount += transitionEvents.filter((event) => event.kind === "tribute").length;
        returnTransitionCount += transitionEvents.filter((event) => event.kind === "return").length;
      } catch (cause) {
        recordError(errors, errorCounters, "transitionErrors", cause);
        termination = "error";
        break;
      }
      turnCount += 1;
      continue;
    }

    const seat = room.currentTurn;
    const player = room.players.find((candidate) => candidate.seat === seat);
    if (player?.isAI !== true) {
      recordError(errors, errorCounters, "transitionErrors", new Error("D2G_NON_AI_TURN"));
      termination = "error";
      break;
    }

    const actingStrategy = task.strategyAssignment[seat];
    const handBefore = [...room.hands[seat]];
    const benchmarkObservation = createBenchmarkObservation(room, seat);
    const productionObservation = toProductionObservation(benchmarkObservation);
    const decisionStartedAt = performance.now();
    let decision: AiDecision;
    try {
      decision = aiDecisionEngine.decideAiAction(
        productionObservation,
        room.aiRuntime[seat] ?? emptyRuntime(),
        { ...DEFAULT_AI_PERFORMANCE_CONFIG, turn: room.currentTrickIndex },
        { planSelectionMode: "keep-current", decisionIndex },
      );
    } catch (cause) {
      recordError(errors, errorCounters, "decisionErrors", cause);
      termination = "error";
      break;
    }
    const productionDecisionCostMs = performance.now() - decisionStartedAt;
    decisionCount += 1;
    candidateReuseTracker.register(task.gameId, decision);

    const treatmentStartedAt = performance.now();
    let treatment: D2GTreatmentOutcome | undefined;
    let treatmentInputFailure: D2GTreatmentInputFailure | undefined;
    try {
      const selectorInput = createSelectorInput(task, room, decision, decisionIndex, actingStrategy);
      treatment = selectD2GTreatment(selectorInput);
    } catch (cause) {
      treatmentInputFailure = makeTreatmentInputFailure(cause, performance.now() - treatmentStartedAt);
      if (treatmentInputFailure.countsAsError) recordError(errors, errorCounters, "treatmentErrors", cause);
    }
    if (treatment?.fallbackReason === "unexpected-failure") {
      recordError(errors, errorCounters, "treatmentErrors", new Error("D2G_UNEXPECTED_TREATMENT_FAILURE"));
    }

    const actualAction = actingStrategy === "baseline" || treatmentInputFailure !== undefined
      ? decision.action
      : treatment!.selectedAction;
    const baselineCandidateId = canonicalActionId(decision.action);
    const executedCandidateId = actingStrategy === "baseline"
      ? baselineCandidateId
      : treatmentInputFailure === undefined ? treatment!.selectedCandidateId : baselineCandidateId;
    try {
      executeCanonicalAction(room, seat, actualAction);
      const runtime = applyExecutedAction(
        decision.runtime,
        handBefore,
        actualAction.type === "play" ? actualAction.group : undefined,
        room.hands[seat],
        room.rank,
        room.currentTrickIndex,
        DEFAULT_AI_PERFORMANCE_CONFIG.planning,
        DEFAULT_AI_PERFORMANCE_CONFIG.version,
      );
      room.aiRuntime[seat] = runtime;
      runtimePlanMismatchCount += syncActualPlan(room, seat, decision, runtime, actualAction);
    } catch (cause) {
      recordError(errors, errorCounters, "executionErrors", cause);
      termination = "error";
      break;
    }

    actionExecutionCount += 1;
    if (actualAction.type === "play") playCount += 1; else passCount += 1;
    const record = treatmentInputFailure === undefined
      ? {
        decisionIndex,
        actingSeat: seat,
        actingStrategy,
        decisionIdentity: treatment!.telemetry.decisionIdentity,
        candidateUniverseHash: treatment!.telemetry.candidateUniverseHash,
        preActionGameplayStateHash: treatment!.telemetry.preActionGameplayStateHash,
        baselineCandidateId,
        treatmentCandidateId: treatment!.treatmentCandidateId,
        selectedCandidateId: treatment!.selectedCandidateId,
        executedCandidateId,
        selection: treatment!.selection,
        fallbackReason: treatment!.fallbackReason,
        disagreement: treatment!.disagreement,
        rankingHash: treatment!.rankingHash,
        rolloutWorkUnits: treatment!.rolloutWorkUnits,
        rolloutEvidence: treatment!.rolloutEvidence,
        productionDecisionCostMs,
        rolloutEvaluationCostMs: treatment!.rolloutEvaluationCostMs,
      }
      : {
        decisionIndex,
        actingSeat: seat,
        actingStrategy,
        decisionIdentity: null,
        candidateUniverseHash: null,
        preActionGameplayStateHash: null,
        baselineCandidateId,
        treatmentCandidateId: null,
        selectedCandidateId: null,
        executedCandidateId,
        selection: "unavailable" as const,
        fallbackReason: treatmentInputFailure.fallbackReason,
        disagreement: null,
        rankingHash: null,
        rolloutWorkUnits: 0,
        rolloutEvidence: null,
        productionDecisionCostMs,
        rolloutEvaluationCostMs: treatmentInputFailure.elapsedMs,
      } satisfies D2GDecisionTelemetryRecord;
    decisionTelemetry.push(record);
    fallbackCounts[record.fallbackReason] = (fallbackCounts[record.fallbackReason] ?? 0) + 1;
    decisionIndex += 1;
    turnCount += 1;
  }

  if (room.status === "playing" && termination === "finished") termination = "turn-limit";
  if (termination === "turn-limit") errorCounters.guardErrors = Math.max(1, errorCounters.guardErrors);
  const publicEvents = structuredClone(room.publicEvents ?? []) as readonly PublicActionEvent[];
  const finalLedger = room.publicLedger ?? room.initialPublicLedger;
  if (finalLedger === undefined || finalLedger === null) {
    recordError(errors, errorCounters, "transitionErrors", new Error("D2G_FINAL_LEDGER_MISSING"));
  }
  const finalPublicLedgerHash = finalLedger === undefined || finalLedger === null ? "" : canonicalPublicLedgerHash(finalLedger);
  const publicTraceHash = hashCanonical({ schemaVersion: "d2g-public-trace-v1", publicEvents });
  const winnerTeam = room.settlement?.winningTeam ?? null;
  const winningPartnership = winnerTeam === null
    ? null
    : winnerTeam === (task.treatmentTeam === "A" ? 0 : 1) ? "treatment" : "baseline";
  const completed = room.status === "finished" && room.finishOrder.length === 4;
  const cardConservation = hasCardConservation(task, room);
  const semanticHash = hashCanonical({
    schemaVersion: "d2g-semantic-game-v1",
    gameId: task.gameId,
    rotationPairKey: task.rotationPairKey,
    baseSeed: task.baseSeed,
    rank: task.rank,
    rotation: task.rotation,
    allocation: task.allocation,
    profileHash: task.profileHash,
    finishOrder: room.finishOrder,
    winnerTeam,
    winningPartnership,
    completed,
    cardConservation,
    termination,
    actionExecutionCount,
    playCount,
    passCount,
    tributeTransitionCount,
    returnTransitionCount,
    runtimePlanMismatchCount,
    decisionTelemetry: decisionTelemetry.map(stripPerformanceTelemetry),
    fallbackCounts,
    errorCounters,
    publicTraceHash,
    finalPublicLedgerHash,
  });
  return Object.freeze({
    schemaVersion: "d2g-head-to-head-game-v1",
    gameId: task.gameId,
    rotationPairKey: task.rotationPairKey,
    baseSeed: task.baseSeed,
    rank: task.rank,
    rotation: task.rotation,
    allocation: task.allocation,
    matchup: task.matchup,
    configHash: task.configHash,
    profileHash: task.profileHash,
    baselineTeam: task.baselineTeam,
    treatmentTeam: task.treatmentTeam,
    strategyAssignment: task.strategyAssignment,
    initialPublicReplayState,
    initialPublicLedgerHash: task.initialPublicLedgerHash,
    finalPublicLedgerHash,
    publicTraceHash,
    semanticHash,
    publicEvents,
    finishOrder: [...room.finishOrder],
    winnerTeam,
    winningPartnership,
    completed,
    cardConservation,
    termination,
    decisionCount,
    actionExecutionCount,
    playCount,
    passCount,
    tributeTransitionCount,
    returnTransitionCount,
    runtimePlanMismatchCount,
     crossGameCandidateReuseCount: candidateReuseTracker.crossGameCandidateReuseCount,
    decisionTelemetry: Object.freeze(decisionTelemetry.map((record) => Object.freeze(record))),
    fallbackCounts: Object.freeze({ ...fallbackCounts }),
    errorCounters: Object.freeze({ ...errorCounters, total: errors.length }),
    errors: Object.freeze([...errors]),
    elapsedMs: performance.now() - startedAt,
  });
}

function createInitialPublicReplayState(room: RoomStateLike): PublicLedgerReplayInitialState {
  if (room.publicIdentity === undefined || room.initialPublicLedger === null) throw new Error("D2G_CANONICAL_PUBLIC_STATE_MISSING");
  return Object.freeze({
    identity: room.publicIdentity,
    initialHandCounts: { ...room.initialPublicLedger.handCounts },
    openingLeader: room.initialPublicLedger.currentTrick.leadSeat,
    initialTrickIndex: room.initialPublicLedger.currentTrick.trickIndex,
    openingTributePublicState: { status: room.openingTribute?.status ?? "none" },
  });
}

function createSelectorInput(
  task: D2GCanonicalHeadToHeadTask,
  room: RoomStateLike,
  decision: AiDecision,
  decisionIndex: number,
  actingStrategy: D2GPartnershipStrategy,
) {
  if (room.publicIdentity === undefined || room.publicLedger === undefined || room.initialPublicLedger === null || room.publicEvents === undefined) {
    throw new Error("D2G_CANONICAL_PUBLIC_STATE_MISSING");
  }
  const projected = createD2FShadowCandidates({ evaluatedCandidates: decision.evaluatedCandidates, selectedAction: decision.action });
  if (!projected.ok) throw new Error(`D2G_CANDIDATE_PROJECTION_FAILED:${projected.failure.kind}`);
  const actingSeat = room.currentTurn;
  const publicState = createPublicState(room, actingSeat);
  const snapshot = createD2FShadowPreActionSnapshot({
    publicIdentity: room.publicIdentity,
    initialLedger: room.initialPublicLedger,
    finalLedger: room.publicLedger,
    publicHistoryEvents: room.publicEvents,
    gameRank: room.rank,
    perspectiveSeat: actingSeat,
    actingSeat,
    ownCurrentHand: room.hands[actingSeat],
    publicState,
    currentTrick: createCurrentTrick(room),
    candidates: projected.value.candidates,
    selectedCandidateId: projected.value.selectedCandidateId,
  });
  if (!snapshot.ok) throw new Error(`D2G_SNAPSHOT_FAILED:${snapshot.failure.kind}`);
  const state: D2GPreActionState = snapshot.value;
  const contextBase = {
    gameId: task.gameId,
    decisionIndex,
    actingSeat,
    actingStrategy,
    preActionGameplayStateHash: computeD2GPreActionGameplayStateHash(state),
    privateOwnHandFingerprint: computeD2GPrivateOwnHandFingerprint(state),
    candidateUniverseHash: computeD2GCandidateUniverseHash(decision),
  } satisfies Omit<D2GDecisionContext, "decisionIdentity">;
  const decisionContext: D2GDecisionContext = {
    ...contextBase,
    decisionIdentity: computeD2GDecisionIdentity(contextBase),
  };
  return { decision, preActionState: state, decisionContext, profile: task.profile };
}

type RoomStateLike = RoomState;

function createPublicState(room: RoomStateLike, actingSeat: 0 | 1 | 2 | 3) {
  return {
    gameRank: room.rank,
    actingSeat,
    perspectiveSeat: actingSeat,
    partnerSeat: ((actingSeat + 2) % 4) as 0 | 1 | 2 | 3,
    handCounts: Object.fromEntries(([0, 1, 2, 3] as const).map((seat) => [seat, room.hands[seat].length])),
    finishOrder: room.finishOrder,
    publicPlayedCardIds: room.publicLedger?.playedCardIds ?? [],
    currentLastPlay: room.trick.lastPlay ?? null,
    currentLastPlaySeat: room.trick.lastPlaySeat ?? null,
  };
}

function createCurrentTrick(room: RoomStateLike) {
  return {
    leadSeat: room.trick.leadSeat,
    lastPlay: room.trick.lastPlay ?? null,
    lastPlaySeat: room.trick.lastPlaySeat ?? null,
    passSeats: room.trick.passSeats,
  };
}

function makeTreatmentInputFailure(
  cause: unknown,
  elapsedMs: number,
): D2GTreatmentInputFailure {
  return Object.freeze({
    kind: "treatment-input-failure",
    fallbackReason: treatmentPreparationFailureReason(cause),
    countsAsError: treatmentPreparationFailureReason(cause) === "unexpected-failure",
    elapsedMs,
  });
}

function treatmentPreparationFailureReason(cause: unknown): D2GTreatmentInputFailure["fallbackReason"] {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.startsWith("D2G_SNAPSHOT_FAILED") || message === "D2G_CANONICAL_PUBLIC_STATE_MISSING") return "rollout-unusable";
  if (message.startsWith("D2G_CANDIDATE_PROJECTION_FAILED")) return "candidate-mapping-failed";
  return "unexpected-failure";
}

function executeCanonicalAction(room: RoomStateLike, seat: 0 | 1 | 2 | 3, action: AiAction): void {
  if (action.type === "pass") roomModule.passTurn(room, seat);
  else roomModule.playCards(room, seat, action.group.cards.map((card) => card.id));
}

function syncActualPlan(
  room: RoomStateLike,
  seat: 0 | 1 | 2 | 3,
  decision: AiDecision,
  runtime: AiRuntimeState,
  action: AiAction,
): number {
  if (action.type === "pass") {
    const plan = decision.selectedPlan ?? runtime.candidatePlans.find((candidate) => candidate.id === runtime.activePlanId);
    if (plan !== undefined) room.aiPlans[seat] = toAiPlanState(seat, plan);
    return 0;
  }
  const plan = runtime.candidatePlans.find((candidate) => candidate.id === runtime.activePlanId);
  if (runtime.needsReplan || plan === undefined) {
    delete room.aiPlans[seat];
    return 0;
  }
  room.aiPlans[seat] = toAiPlanState(seat, plan);
  return sameCardIds(
    plan.groups.flatMap((group) => group.cards.map((card) => card.id)),
    room.hands[seat].map((card) => card.id),
  ) ? 0 : 1;
}

function toAiPlanState(seat: 0 | 1 | 2 | 3, plan: AiRuntimeState["candidatePlans"][number]): AiPlanState {
  return { seat, name: "AI hand plan", score: Math.max(1, 100 - plan.metrics.estimatedTurns), groups: plan.groups };
}

function sameCardIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function hasCardConservation(task: D2GCanonicalHeadToHeadTask, room: RoomStateLike): boolean {
  const initialCardIds = Object.values(task.room.initialHands).flat().map((card) => card.id);
  const currentCardIds = Object.values(room.hands).flat().map((card) => card.id);
  const playedCardIds = room.playHistory.flatMap((play) => play.group?.cards.map((card) => card.id) ?? []);
  const observedCardIds = [...currentCardIds, ...playedCardIds];
  const initialSet = new Set(initialCardIds);
  return initialCardIds.length === 108
    && initialSet.size === 108
    && observedCardIds.length === 108
    && new Set(observedCardIds).size === 108
    && observedCardIds.every((cardId) => initialSet.has(cardId));
}

function canonicalActionId(action: AiAction): string {
  return canonicalActionIdentity(action);
}

function emptyRuntime(): AiRuntimeState {
  return { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true };
}

function recordError(
  errors: string[],
  counters: { total: number; decisionErrors: number; treatmentErrors: number; executionErrors: number; transitionErrors: number; guardErrors: number },
  field: "decisionErrors" | "treatmentErrors" | "executionErrors" | "transitionErrors" | "guardErrors",
  cause: unknown,
): void {
  errors.push(cause instanceof Error ? cause.message : String(cause));
  counters[field] += 1;
  counters.total += 1;
}

function stripPerformanceTelemetry(record: D2GDecisionTelemetryRecord): Omit<D2GDecisionTelemetryRecord, "productionDecisionCostMs" | "rolloutEvaluationCostMs"> {
  const { productionDecisionCostMs: _productionDecisionCostMs, rolloutEvaluationCostMs: _rolloutEvaluationCostMs, ...deterministic } = record;
  return deterministic;
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}
