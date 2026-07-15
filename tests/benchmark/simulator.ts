import { createBenchmarkObservation } from "./observation";
import { bindStrategyDiagnostics, getStrategy } from "./strategies";
import type { GameAction, GameSummary, PublicTributeEvent, RandomReplayProvenance, StrategyAction } from "./contracts";
import { finalPublicStateHash, publicTraceHash } from "./reporting";
import { createRoom, playCards, passTurn, type RoomState, type Seat } from "../../src/game/room";
import type { BenchmarkGameTask } from "./rotations";
import { CANDIDATE_ORDERING_VERSION, DECISION_INDEX_SEMANTICS, deriveRuntimeId, deriveStrategySeed, RANDOM_ALGORITHM_VERSION, STRATEGY_SEED_DERIVATION_VERSION } from "./random";
import { createAiPlanningDiagnostics, type AiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { summarizeAiD1Diagnostics, type PersistedD1Diagnostics } from "./d1DiagnosticsPersistence";
import { D1_RESULT_SCHEMA, D1_DIAGNOSTICS_SCHEMA, hashD1ExecutionProvenance, type D1ExecutionProvenanceV1 } from "./d1ProvenanceV2";

export interface SimulationError {
  seed: number;
  seat: Seat;
  strategy: string;
  error: string;
}

export interface SafetyErrorCounters {
  total: number;
  strategyErrors: number;
  runtimeErrors: number;
  illegalActions: number;
  engineErrors: number;
  guardErrors: number;
}

export interface D1SafetySummary {
  illegalAction: number;
  leadPass: number;
  invalidFollow: number;
  duplicateCard: number;
  missingCard: number;
  policyViolation: number;
  runtimePlanMismatch: number;
  engineError: number;
  exceededActionLimit: number;
  timeout: number;
}

export interface PublicSimulationEvent extends GameAction {
  handCounts: Record<Seat, number>;
  handCountChanges: Record<Seat, number>;
  trick: {
    leadSeat: Seat;
    lastPlaySeat?: Seat;
    passSeats: Seat[];
    plays: GameAction[];
  };
  tributeEvents: PublicTributeEvent[];
  finishOrder: Seat[];
}

export type SimulationSummary = GameSummary & {
  rawResultSchemaVersion?: typeof D1_RESULT_SCHEMA;
  phase?: "smoke" | "calibration" | "formal";
  matchup?: string;
  placement?: "AB" | "BA";
  provenanceHash?: string;
  executionProvenance?: D1ExecutionProvenanceV1;
  allocation?: "AB" | "BA";
  completed: boolean;
  failed: boolean;
  errors: SimulationError[];
  errorCounters: SafetyErrorCounters;
  publicEvents: PublicSimulationEvent[];
  finalPublicState?: ReturnType<typeof finalPublicState>;
  diagnostics?: {
    enabled: true;
    decisionCount: number;
    workerLocalToken: string;
  };
  d1Diagnostics?: PersistedD1Diagnostics;
  diagnosticsError?: string;
  safety?: D1SafetySummary;
  randomProvenance?: RandomReplayProvenance;
};

export function simulateGame(task: BenchmarkGameTask, options: { diagnostics?: boolean; strategyRandomSeeds?: Partial<Record<Seat, string>> } = {}): SimulationSummary {
  const startedAt = performance.now();
  const room = structuredClone(task.room ?? createRoom({ rank: task.config.rank, seed: task.seed }));
  const strategiesBySeat = strategyMap(task);
  const runtimes: Partial<Record<Seat, unknown>> = {};
  const errors: SimulationError[] = [];
  const errorCounters = emptyErrorCounters();
  const strategies: Partial<Record<Seat, ReturnType<typeof getStrategy>>> = {};
  const d1DiagnosticsBySeat: Partial<Record<Seat, AiPlanningDiagnostics>> = {};
  const diagnostics = options.diagnostics === true
    ? { enabled: true as const, decisionCount: 0, workerLocalToken: task.matchId }
    : undefined;

  for (const seat of seats()) {
    try {
      const strategy = getStrategy(strategiesBySeat[seat]);
      strategies[seat] = strategy;
      if (strategy.mode === "dynamic-topk-v1") d1DiagnosticsBySeat[seat] = createAiPlanningDiagnostics();
      try {
        runtimes[seat] = strategy.createRuntime({
          runtimeId: deriveRuntimeId(task.matchId, seat),
          seat,
          strategyRandomSeed: options.strategyRandomSeeds?.[seat] ?? deriveStrategySeed(task.matchId, seat),
        });
      } catch (cause) {
        recordFailure(errors, errorCounters, task.seed, seat, strategiesBySeat[seat], cause, "runtimeErrors");
      }
    } catch (cause) {
      recordFailure(errors, errorCounters, task.seed, seat, strategiesBySeat[seat], cause, "strategyErrors");
    }
  }

  const publicEvents: PublicSimulationEvent[] = [];
  let previousCounts = handCounts(room);
  let guard = 0;
  while (room.status === "playing" && guard < 5000) {
    const seat = room.currentTurn;
    const strategyId = strategiesBySeat[seat];
    const strategy = strategies[seat];
    try {
      if (strategy === undefined) throw new Error(`UNKNOWN_STRATEGY:${strategyId}`);
      if (runtimes[seat] === undefined) throw new Error("BENCHMARK_RUNTIME_UNAVAILABLE");
      if (room.openingTribute?.status === "pending") {
        throw new Error("BENCHMARK_OPENING_TRIBUTE_UNSUPPORTED");
      }
      const observation = createBenchmarkObservation(room, seat);
      let decision;
      try {
        bindStrategyDiagnostics(runtimes[seat], d1DiagnosticsBySeat[seat]);
        if (diagnostics) diagnostics.decisionCount += 1;
        decision = strategy.decide(observation, runtimes[seat]);
      } catch (cause) {
        recordFailure(errors, errorCounters, task.seed, seat, strategyId, cause, "strategyErrors");
        break;
      }
      runtimes[seat] = decision.runtime;
      try {
        executeAction(room, seat, decision.action);
      } catch (cause) {
        recordFailure(errors, errorCounters, task.seed, seat, strategyId, cause, "engineErrors");
        errorCounters.illegalActions += 1;
        break;
      }
      const nextCounts = handCounts(room);
      appendPublicEvent(publicEvents, room, nextCounts, countDelta(nextCounts, previousCounts));
      previousCounts = nextCounts;
    } catch (cause) {
      const message = errorMessage(cause);
      const category = strategy === undefined
        ? "strategyErrors"
        : message === "BENCHMARK_RUNTIME_UNAVAILABLE"
          ? "runtimeErrors"
          : "engineErrors";
      recordFailure(errors, errorCounters, task.seed, seat, strategyId, cause, category);
      if (category === "engineErrors" && message !== "BENCHMARK_OPENING_TRIBUTE_UNSUPPORTED") {
        errorCounters.illegalActions += 1;
      }
      break;
    }
    guard += 1;
  }
  if (room.status === "playing" && guard >= 5000) {
    recordFailure(errors, errorCounters, task.seed, room.currentTurn, strategiesBySeat[room.currentTurn], new Error("BENCHMARK_TURN_GUARD_EXCEEDED"), "guardErrors");
  }

  const winnerTeam = room.settlement?.winningTeam ?? null;
  const teamScore: Record<0 | 1, number> = { 0: winnerTeam === 0 ? 1 : 0, 1: winnerTeam === 1 ? 1 : 0 };
  const publicState = finalPublicState(room);
  const durationMs = measuredDuration(startedAt);
  const safety = safetySummary(errors, errorCounters, guard >= 5000);
  const diagnosticsValues = Object.values(d1DiagnosticsBySeat).filter((value): value is AiPlanningDiagnostics => value !== undefined);
  let d1Diagnostics: PersistedD1Diagnostics;
  let diagnosticsError: string | undefined;
  if (diagnosticsValues.length === 0) {
    d1Diagnostics = { schemaVersion: D1_DIAGNOSTICS_SCHEMA, applicable: false, reasonCounts: {}, candidateCountSummary: { count: 0, min: null, max: null, mean: null, p50: null, p95: null }, decisionIndicesSinceLastSwitchSummary: { count: 0, min: null, max: null, mean: null, p50: null, p95: null } };
  } else {
    try { d1Diagnostics = summarizeAiD1Diagnostics(diagnosticsValues); }
    catch (error) {
      diagnosticsError = error instanceof Error ? error.message : String(error);
      d1Diagnostics = { schemaVersion: D1_DIAGNOSTICS_SCHEMA, applicable: true, reasonCounts: {}, candidateCountSummary: { count: 0, min: null, max: null, mean: null, p50: null, p95: null }, decisionIndicesSinceLastSwitchSummary: { count: 0, min: null, max: null, mean: null, p50: null, p95: null } };
    }
  }
  const executionProvenance = task.executionProvenance;
  return {
    rawResultSchemaVersion: D1_RESULT_SCHEMA,
    phase: task.phase ?? "smoke",
    matchup: task.matchup ?? `${task.config.strategyA}-vs-${task.config.strategyB}`,
    placement: task.allocation,
    ...(executionProvenance === undefined ? {} : { provenanceHash: hashD1ExecutionProvenance(executionProvenance), executionProvenance }),
    matchId: task.matchId,
    configHash: task.configHash,
    seed: task.seed,
    rank: task.config.rank,
    rotation: task.rotation,
    allocation: task.allocation,
    strategiesBySeat,
    finishOrder: [...room.finishOrder],
    winnerTeam,
    teamScore,
    actionCount: room.playHistory.length,
    publicTraceHash: publicTraceHash(publicEvents),
    finalPublicStateHash: finalPublicStateHash(publicState),
    durationMs,
    executionSourceCommit: task.executionSourceCommit,
    finalPublicState: publicState,
    completed: room.status === "finished" && room.finishOrder.length === 4,
    failed: errors.length > 0,
    errors,
    errorCounters,
    publicEvents,
    diagnostics,
    d1Diagnostics,
    ...(diagnosticsError === undefined ? {} : { diagnosticsError }),
    safety,
    randomProvenance: {
      randomAlgorithmVersion: RANDOM_ALGORITHM_VERSION,
      strategySeedDerivationVersion: STRATEGY_SEED_DERIVATION_VERSION,
      baseSeed: task.seed,
      perSeatDerivedSeed: Object.fromEntries(seats().map((seat) => [seat, options.strategyRandomSeeds?.[seat] ?? deriveStrategySeed(task.matchId, seat)])) as Record<Seat, string>,
      strategyVersionsBySeat: Object.fromEntries(seats().map((seat) => [seat, strategies[seat]?.implementationVersion ?? "unknown"])) as Record<Seat, string>,
      candidateOrderingVersion: CANDIDATE_ORDERING_VERSION,
      decisionIndexSemantics: DECISION_INDEX_SEMANTICS,
    },
  };
}

function safetySummary(errors: readonly SimulationError[], counters: SafetyErrorCounters, exceededActionLimit: boolean): D1SafetySummary {
  const messages = errors.map((error) => error.error);
  const count = (pattern: RegExp) => messages.filter((message) => pattern.test(message)).length;
  return {
    illegalAction: counters.illegalActions,
    leadPass: count(/LEAD_PASS|lead pass/i),
    invalidFollow: count(/NON_BEATING_FOLLOW|invalid follow|不能压过/i),
    duplicateCard: count(/DUPLICATE_CARD|duplicate cards/i),
    missingCard: count(/CARD_NOT_IN_HAND|missing card|不在当前手牌/i),
    policyViolation: count(/POLICY|policy/i),
    runtimePlanMismatch: count(/RUNTIME_PLAN_MISMATCH/i),
    engineError: counters.engineErrors,
    exceededActionLimit: exceededActionLimit ? 1 : 0,
    timeout: count(/TIMEOUT/i),
  };
}

function measuredDuration(startedAt: number): number {
  return Math.max(0.001, performance.now() - startedAt);
}

function executeAction(room: RoomState, seat: Seat, action: StrategyAction): void {
  if (action.type === "pass") passTurn(room, seat); else playCards(room, seat, action.cardIds);
}

function appendPublicEvent(events: PublicSimulationEvent[], room: RoomState, counts: Record<Seat, number>, changes: Record<Seat, number>): void {
  const observation = createBenchmarkObservation(room, room.currentTurn);
  const action = observation.publicHistory[observation.publicHistory.length - 1];
  if (action === undefined) return;
  events.push({
    ...action,
    handCounts: counts,
    handCountChanges: changes,
    trick: {
      leadSeat: room.trick.leadSeat,
      lastPlaySeat: room.trick.lastPlaySeat,
      passSeats: [...room.trick.passSeats],
      plays: [...observation.publicTrick],
    },
    tributeEvents: [...observation.publicTributeEvents],
    finishOrder: [...room.finishOrder],
  });
}

function strategyMap(task: BenchmarkGameTask): Record<Seat, string> {
  const aAtEven = task.allocation === "AB";
  return {
    0: aAtEven ? task.config.strategyA : task.config.strategyB,
    1: aAtEven ? task.config.strategyB : task.config.strategyA,
    2: aAtEven ? task.config.strategyA : task.config.strategyB,
    3: aAtEven ? task.config.strategyB : task.config.strategyA,
  };
}

function finalPublicState(room: RoomState) {
  return {
    rank: room.rank,
    status: room.status,
    currentTurn: room.currentTurn,
    leaderSeat: room.leaderSeat,
    handCounts: handCounts(room),
    finishOrder: room.finishOrder,
    settlement: room.settlement,
  };
}

function handCounts(room: RoomState): Record<Seat, number> {
  return Object.fromEntries(seats().map((seat) => [seat, room.hands[seat].length])) as Record<Seat, number>;
}

function countDelta(next: Record<Seat, number>, previous: Record<Seat, number>): Record<Seat, number> {
  return Object.fromEntries(seats().map((seat) => [seat, next[seat] - previous[seat]])) as Record<Seat, number>;
}

function emptyErrorCounters(): SafetyErrorCounters {
  return { total: 0, strategyErrors: 0, runtimeErrors: 0, illegalActions: 0, engineErrors: 0, guardErrors: 0 };
}

function recordFailure(
  errors: SimulationError[],
  counters: SafetyErrorCounters,
  seed: number,
  seat: Seat,
  strategy: string,
  cause: unknown,
  category: keyof Omit<SafetyErrorCounters, "total" | "illegalActions">,
): void {
  errors.push({ seed, seat, strategy, error: errorMessage(cause) });
  counters.total += 1;
  counters[category] += 1;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function seats(): Seat[] {
  return [0, 1, 2, 3];
}
