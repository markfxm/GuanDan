import { classifyPlay } from "../../src/game/playRules";
import { settleRound } from "../../src/game/settlement";
import type { Seat } from "../../src/game/room";
import type { GameSummary } from "./contracts";
import { cardFromPublicId } from "./observation";
import type { PublicSimulationEvent, SafetyErrorCounters, SimulationSummary } from "./simulator";
import { classifyGame, type GameClassification } from "./classification";

export interface PlayPassRatio {
  plays: number;
  passes: number;
  ratio: number;
}

export interface SeatDealLimitations {
  exactSeatControl: boolean;
  exactDealControl: boolean;
  note: string;
}

export interface GameMetrics extends GameSummary {
  teamPlacementScore: number;
  placementByTeam: Record<0 | 1, number>;
  advancementProxy: number;
  settlementOutcome?: ReturnType<typeof settleRound>["outcome"];
  levelStep: number;
  individualDiagnosticScore: Record<Seat, number>;
  playPassRatio: PlayPassRatio;
  bombCount: number;
  bombs: number;
  planContinuation: number;
  planContinuationActions: number;
  finalTenActions: number;
  finalTenCardActions: number;
  durationMs: number;
  durationStats: { mean: number; median: number; p95: number };
  categoryTags: string[];
  classification: GameClassification;
  errorCounters: SafetyErrorCounters;
  seatDealLimitations: SeatDealLimitations;
}

export function summarizeGame(game: SimulationSummary | GameSummary & Partial<SimulationSummary>): GameMetrics {
  const events = Array.isArray(game.publicEvents) ? game.publicEvents : [];
  const finishOrder = [...(game.finishOrder ?? [])];
  const placementByTeam = teamPlacementScores(finishOrder);
  const placementScore = placementByTeam[0] - placementByTeam[1];
  const counts = countActions(events);
  const bombCount = countBombs(events, game.rank);
  const durationMs = numeric((game as Partial<SimulationSummary> & { durationMs?: unknown }).durationMs);
  const winnerTeam = game.winnerTeam ?? null;
  const settlement = finishOrder.length === 4 && winnerTeam !== null
    ? settleRound(finishOrder, game.rank)
    : undefined;
  const errorCounters = normalizeErrors((game as Partial<SimulationSummary>).errorCounters);

  const base = {
    ...game,
    finishOrder,
    winnerTeam,
    teamScore: game.teamScore ?? { 0: winnerTeam === 0 ? 1 : 0, 1: winnerTeam === 1 ? 1 : 0 },
    actionCount: game.actionCount ?? events.length,
    teamPlacementScore: placementScore,
    placementByTeam,
    advancementProxy: settlement?.levelStep ?? (winnerTeam === null ? 0 : 1),
    settlementOutcome: settlement?.outcome,
    levelStep: settlement?.levelStep ?? (winnerTeam === null ? 0 : 1),
    individualDiagnosticScore: individualScores(finishOrder, errorCounters),
    playPassRatio: { ...counts, ratio: counts.passes === 0 ? counts.plays : counts.plays / counts.passes },
    bombCount,
    bombs: bombCount,
    planContinuation: continuationCount(events),
    planContinuationActions: continuationCount(events),
    finalTenActions: events.filter((event) => event.handCounts[event.seat] <= 10).length,
    finalTenCardActions: events.filter((event) => event.handCounts[event.seat] <= 10).length,
    durationMs,
    durationStats: { mean: durationMs, median: durationMs, p95: durationMs },
    categoryTags: [] as string[],
    errorCounters,
    seatDealLimitations: {
      exactSeatControl: true,
      exactDealControl: true,
      note: "Seat rotation and seeded deal are controlled by the benchmark harness; this is a single-round proxy.",
    },
  };
  const classification = classifyGame({ ...base, publicEvents: events } as SimulationSummary);
  return {
    ...base,
    categoryTags: Object.keys(classification.scores),
    classification,
  };
}

export function teamPlacementScores(finishOrder: Seat[]): Record<0 | 1, number> {
  const scores: Record<0 | 1, number> = { 0: 0, 1: 0 };
  finishOrder.forEach((seat, index) => {
    scores[(seat % 2) as 0 | 1] += Math.max(0, 4 - index);
  });
  return scores;
}

function individualScores(finishOrder: Seat[], errors: SafetyErrorCounters): Record<Seat, number> {
  const result = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Seat, number>;
  finishOrder.forEach((seat, index) => { result[seat] = 4 - index; });
  const penalty = errors.total;
  if (penalty > 0) {
    for (const seat of [0, 1, 2, 3] as Seat[]) result[seat] -= penalty;
  }
  return result;
}

function countActions(events: PublicSimulationEvent[]): { plays: number; passes: number } {
  let plays = 0;
  let passes = 0;
  for (const event of events) event.action.type === "play" ? plays += 1 : passes += 1;
  return { plays, passes };
}

function countBombs(events: PublicSimulationEvent[], rank: GameSummary["rank"]): number {
  return events.reduce((count, event) => {
    if (event.action.type !== "play") return count;
    try {
      const group = classifyPlay(event.action.cardIds.map(cardFromPublicId), rank);
      return count + (group?.type === "bomb" || group?.type === "joker-bomb" ? 1 : 0);
    } catch {
      return count;
    }
  }, 0);
}

function continuationCount(events: PublicSimulationEvent[]): number {
  let continuation = 0;
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1]!;
    const current = events[index]!;
    if (previous.action.type === "play" && current.action.type === "play" && previous.seat === current.seat) continuation += 1;
  }
  return continuation;
}

function normalizeErrors(errors: Partial<SafetyErrorCounters> | undefined): SafetyErrorCounters {
  return {
    total: errors?.total ?? 0,
    strategyErrors: errors?.strategyErrors ?? 0,
    runtimeErrors: errors?.runtimeErrors ?? 0,
    illegalActions: errors?.illegalActions ?? 0,
    engineErrors: errors?.engineErrors ?? 0,
    guardErrors: errors?.guardErrors ?? 0,
  };
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
