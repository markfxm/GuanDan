export type CandidatePolicy = "legal-only" | "production-policy";

export type StrategyAction =
  | { type: "play"; cardIds: string[] }
  | { type: "pass" };

export interface GameAction {
  actionIndex: number;
  seat: number;
  action: StrategyAction;
}

export interface PublicTributeEvent {
  type: "tribute" | "return";
  fromSeat: number;
  toSeat: number;
}

/**
 * The complete information a benchmark strategy may observe. Keep this as an
 * explicit whitelist: hidden hands, seeds, and deck state do not belong here.
 */
export interface BenchmarkObservation {
  ownHand: string[];
  rank: string;
  seat: number;
  currentSeat: number;
  leaderSeat: number;
  publicHandCounts: number[];
  publicTrick: GameAction[];
  publicHistory: GameAction[];
  finishOrder: number[];
  partnerPassed: boolean;
  publicTributeEvents: PublicTributeEvent[];
  actionIndex: number;
}

export interface StrategyRuntimeContext {
  matchId: string;
  seat: number;
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
  rank: string;
  seeds: number[];
  strategyA: string;
  strategyB: string;
  replayMode: "none" | "failures" | "all";
}

export interface GameSummary {
  matchId: string;
  configHash: string;
  seed: number;
  rank: string;
  rotation: number;
  strategiesBySeat: string[];
  finishOrder: number[];
  winnerTeam: number | null;
  teamScore: number[];
  actionCount: number;
  publicTraceHash: string;
  finalPublicStateHash: string;
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
  rank: string;
  rotation: number;
  strategiesBySeat: string[];
  strategyDescriptors: StrategyDescriptor[];
  deterministicRandom: { strategySeedDerivationVersion: string };
  publicEvents: GameAction[];
  finishOrder: number[];
  winnerTeam: number | null;
  teamScore: number[];
  actionCount: number;
  publicTraceHash: string;
  finalPublicStateHash: string;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
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
