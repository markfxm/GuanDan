import type { Card, GameRank } from "../../src/engine/cards";
import type { Seat } from "../../src/game/room";

export type CandidatePolicy = "legal-only" | "production-policy";

export type StrategyAction =
  | { type: "play"; cardIds: string[] }
  | { type: "pass" };

export interface GameAction {
  actionIndex: number;
  seat: Seat;
  action: StrategyAction;
}

export interface PublicTributeEvent {
  type: "tribute" | "return";
  fromSeat: Seat;
  toSeat: Seat;
}

/**
 * The complete information a benchmark strategy may observe. Keep this as an
 * explicit whitelist: hidden hands, seeds, and deck state do not belong here.
 */
export interface BenchmarkObservation {
  ownHand: Card[];
  rank: GameRank;
  seat: Seat;
  currentSeat: Seat;
  leaderSeat: Seat;
  publicHandCounts: Record<Seat, number>;
  publicTrick: GameAction[];
  publicHistory: GameAction[];
  finishOrder: Seat[];
  partnerPassed: boolean;
  publicTributeEvents: PublicTributeEvent[];
  actionIndex: number;
}

export interface StrategyRuntimeContext {
  matchId: string;
  seat: Seat;
  strategyRandomSeed: string;
}

export interface StrategyDescriptor {
  id: string;
  implementationVersion: string;
  configHash: string;
  sourceCommit: string;
  candidatePolicy: CandidatePolicy;
}

export interface StrategyDecision<TRuntime> {
  action: StrategyAction;
  runtime: TRuntime;
}

export interface AiStrategy<TRuntime> extends StrategyDescriptor {
  createRuntime(context: StrategyRuntimeContext): TRuntime;
  decide(observation: BenchmarkObservation, runtime: TRuntime): StrategyDecision<TRuntime>;
}

export interface BenchmarkConfig {
  benchmarkVersion: string;
  rank: GameRank;
  seeds: number[];
  strategyA: string;
  strategyB: string;
  replayMode: "none" | "failures" | "all";
}

export interface GameSummary {
  matchId: string;
  configHash: string;
  seed: number;
  rank: GameRank;
  rotation: Seat;
  strategiesBySeat: Record<Seat, string>;
  finishOrder: Seat[];
  winnerTeam: 0 | 1 | null;
  teamScore: Record<0 | 1, number>;
  actionCount: number;
  publicTraceHash: string;
  finalPublicStateHash: string;
  /** Wall-clock duration measured around the complete simulation (milliseconds). */
  durationMs: number;
}

export interface BenchmarkProvenance {
  engineVersion: string;
  roomRulesVersion: string;
  strategyDescriptors: StrategyDescriptor[];
}

export interface ReplayDocument {
  schemaVersion: "1";
  replayVersion: string;
  benchmarkVersion: string;
  engineVersion: string;
  roomRulesVersion: string;
  configHash: string;
  matchId: string;
  seed: number;
  rank: GameRank;
  rotation: Seat;
  strategiesBySeat: Record<Seat, string>;
  strategyDescriptors: StrategyDescriptor[];
  deterministicRandom: { strategySeedDerivationVersion: string };
  publicEvents: GameAction[];
  finishOrder: Seat[];
  winnerTeam: 0 | 1 | null;
  teamScore: Record<0 | 1, number>;
  replayMode?: "none" | "failures" | "all";
  actionCount: number;
  publicTraceHash: string;
  finalPublicStateHash: string;
  durationMs?: number;
}

export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));

  if (serialized === undefined) {
    throw new TypeError("CANONICAL_JSON_UNSUPPORTED_VALUE");
  }

  return serialized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }

  return value;
}
