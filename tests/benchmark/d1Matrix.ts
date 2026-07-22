import { createHash } from "node:crypto";
import type { GameRank } from "../../src/engine/cards";
import { canonicalJson } from "./contracts";
import { getStrategy, canonicalStrategyId } from "./strategies";

export type D1Phase = "smoke" | "calibration" | "formal";
export type D1Allocation = "AB" | "BA";
export type D1MatchupName = "treatment-vs-control" | "treatment-vs-greedy" | "control-vs-greedy" | "treatment-vs-random" | "control-vs-random" | "treatment-vs-legacy" | "control-vs-legacy";

export interface D1MatrixInput { benchmarkVersion: string; rank: GameRank; configHash: string; executionSourceCommit?: string; }
export interface D1Matchup { name: D1MatchupName; strategyA: string; strategyB: string; modeA: "keep-current" | "dynamic-topk-v1"; modeB: "keep-current" | "dynamic-topk-v1"; }
export interface D1Matrix { benchmarkVersion: string; rank: GameRank; configHash: string; matchups: D1Matchup[]; }
export interface D1PhasePlan { phase: D1Phase; start: number; end: number; baseSeeds: number; rawGames: number; pairedUnits: number; replayMode: "failures" | "all"; }
export interface D1BatchPlan { batchId: string; matchup: D1MatchupName; seedStart: number; seedEnd: number; baseSeeds: number; rawGames: number; pairedUnits: number; replayMode: "all"; }

const MATCHUPS: Array<[D1MatchupName, string, string]> = [
  ["treatment-vs-control", "unified-d1-topk-switch", "unified-current"],
  ["treatment-vs-greedy", "unified-d1-topk-switch", "legal-greedy"],
  ["control-vs-greedy", "unified-current", "legal-greedy"],
  ["treatment-vs-random", "unified-d1-topk-switch", "legal-random"],
  ["control-vs-random", "unified-current", "legal-random"],
  ["treatment-vs-legacy", "unified-d1-topk-switch", "legacy-reference"],
  ["control-vs-legacy", "unified-current", "legacy-reference"],
];

export function buildD1Matrix(input: D1MatrixInput): D1Matrix {
  const matchups = MATCHUPS.map(([name, strategyA, strategyB]) => ({
    name,
    strategyA,
    strategyB,
    modeA: getStrategy(strategyA).mode ?? (strategyA === "unified-d1-topk-switch" ? "dynamic-topk-v1" : "keep-current"),
    modeB: getStrategy(strategyB).mode ?? (strategyB === "unified-d1-topk-switch" ? "dynamic-topk-v1" : "keep-current"),
  }));
  return { ...input, matchups };
}

export function phasePlan(phase: D1Phase): D1PhasePlan {
  if (phase === "smoke") return { phase, start: 201, end: 220, baseSeeds: 20, rawGames: 160, pairedUnits: 80, replayMode: "failures" };
  if (phase === "calibration") return { phase, start: 221, end: 270, baseSeeds: 50, rawGames: 400, pairedUnits: 200, replayMode: "failures" };
  return { phase, start: 1001, end: 1200, baseSeeds: 200, rawGames: 1600, pairedUnits: 800, replayMode: "all" };
}

export function expectedMatchId(input: { matchup: string; seed: number; allocation: D1Allocation | string; rotation: 0 | 1 | 2 | 3; configHash: string }): string {
  return canonicalJson({ allocation: input.allocation, configHash: input.configHash, matchup: input.matchup, rotation: input.rotation, seed: input.seed });
}

export function formalBatchPlan(configHash: string): D1BatchPlan[] {
  const batches: D1BatchPlan[] = [];
  for (const [start, end] of [[1001, 1050], [1051, 1100], [1101, 1150], [1151, 1200]] as const) {
    for (const [name] of MATCHUPS) {
      batches.push({ batchId: `d1-topk-v1/${name}/${start}-${end}/${configHash}`, matchup: name, seedStart: start, seedEnd: end, baseSeeds: 50, rawGames: 400, pairedUnits: 200, replayMode: "all" });
    }
  }
  return batches;
}

export function d1ConfigHash(input: unknown): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export function canonicalMatchupStrategy(id: string): string { return canonicalStrategyId(id); }
