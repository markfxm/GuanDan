import { createHash } from "node:crypto";
import { createBenchmarkObservation } from "./observation";
import { getStrategy } from "./strategies";
import type { GameAction, GameSummary, StrategyAction } from "./contracts";
import { canonicalJson } from "./contracts";
import { createRoom, playCards, passTurn, type RoomState, type Seat } from "../../src/game/room";
import type { BenchmarkGameTask } from "./rotations";

export interface SimulationError {
  seed: number;
  seat: Seat;
  strategy: string;
  error: string;
}

export type SimulationSummary = GameSummary & {
  completed: boolean;
  failed: boolean;
  errors: SimulationError[];
  publicEvents: GameAction[];
};

export function simulateGame(task: BenchmarkGameTask): SimulationSummary {
  const room = structuredClone(task.room ?? createRoom({ rank: task.config.rank, seed: task.seed }));
  const strategiesBySeat = strategyMap(task);
  const runtimes: Partial<Record<Seat, unknown>> = {};
  const errors: SimulationError[] = [];
  for (const seat of seats()) {
    const strategy = getStrategy(strategiesBySeat[seat]);
    runtimes[seat] = strategy.createRuntime({
      matchId: task.matchId,
      seat,
      strategyRandomSeed: deriveSeed(task.matchId, seat),
    });
  }

  let guard = 0;
  while (room.status === "playing" && guard < 5000) {
    const seat = room.currentTurn;
    const strategyId = strategiesBySeat[seat];
    const strategy = getStrategy(strategyId);
    try {
      if (room.openingTribute?.status === "pending") {
        throw new Error("BENCHMARK_OPENING_TRIBUTE_UNSUPPORTED");
      }
      const observation = createBenchmarkObservation(room, seat);
      const decision = strategy.decide(observation, runtimes[seat]);
      runtimes[seat] = decision.runtime;
      executeAction(room, seat, decision.action);
    } catch (cause) {
      errors.push({ seed: task.seed, seat, strategy: strategyId, error: errorMessage(cause) });
      break;
    }
    guard += 1;
  }
  if (guard >= 5000) {
    errors.push({ seed: task.seed, seat: room.currentTurn, strategy: strategiesBySeat[room.currentTurn], error: "BENCHMARK_TURN_GUARD_EXCEEDED" });
  }

  const publicEvents = createBenchmarkObservation(room, 0).publicHistory;
  const winnerTeam = room.settlement?.winningTeam ?? null;
  const teamScore: Record<0 | 1, number> = { 0: winnerTeam === 0 ? 1 : 0, 1: winnerTeam === 1 ? 1 : 0 };
  const summary: SimulationSummary = {
    matchId: task.matchId,
    configHash: task.configHash,
    seed: task.seed,
    rank: task.config.rank,
    rotation: task.rotation,
    strategiesBySeat,
    finishOrder: [...room.finishOrder],
    winnerTeam,
    teamScore,
    actionCount: room.playHistory.length,
    publicTraceHash: hash(canonicalJson(publicEvents)),
    finalPublicStateHash: hash(canonicalJson(finalPublicState(room))),
    completed: room.status === "finished" && room.finishOrder.length === 4,
    failed: errors.length > 0,
    errors,
    publicEvents,
  };
  return summary;
}

function executeAction(room: RoomState, seat: Seat, action: StrategyAction): void {
  if (action.type === "pass") passTurn(room, seat); else playCards(room, seat, action.cardIds);
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
    handCounts: Object.fromEntries(seats().map((seat) => [seat, room.hands[seat].length])),
    finishOrder: room.finishOrder,
    settlement: room.settlement,
  };
}

function deriveSeed(matchId: string, seat: Seat): string {
  return hash(`${matchId}:strategy:${seat}`);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function seats(): Seat[] {
  return [0, 1, 2, 3];
}
