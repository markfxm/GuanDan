import type { BenchmarkConfig, GameSummary } from "./contracts";
import { summarizeGame, type GameMetrics } from "./metrics";
import type { SimulationSummary } from "./simulator";
import { classifyGame } from "./classification";

export interface BaseSeedBlock {
  seed?: number;
  baseSeed?: number;
  games: Array<GameMetrics | SimulationSummary | GameSummary>;
}

export interface BootstrapSample {
  index: number;
  seed: number;
  games: Array<GameMetrics | SimulationSummary | GameSummary>;
}

export interface BootstrapResult {
  samples: BootstrapSample[];
  iterations: number;
  seed: number;
}

export interface TournamentAggregate {
  gameCount: number;
  rawGames: number;
  pairedRotationUnits: number;
  baseSeeds: number;
  winsA: number;
  winsB: number;
  unresolved: number;
  winRateA: number;
  winRateB: number;
  scoreA: number;
  scoreB: number;
  scoreDifference: number;
  finishDifference: number;
  scoreDifferenceCI: [number, number];
  winRateCI: [number, number];
  pairedScoreDifferenceCI: [number, number];
  pairedWinRateCI: [number, number];
  statisticallySignificant: boolean;
  statisticalSignificance: boolean;
  significance: {
    score: { ci: [number, number]; excludesNeutral: boolean };
    winRate: { ci: [number, number]; excludesNeutral: boolean };
  };
  effectSize: number;
  errorRate: number;
  duration: { mean: number; median: number; p95: number };
  elo: { initialRating: number; kFactor: number; observedScore: number; delta: number; version: string };
  classifications: { exploratory: true; tags: Record<string, number> };
}

export function aggregateTournament(
  input: Array<GameMetrics | SimulationSummary | GameSummary>,
  config: BenchmarkConfig,
  options: { bootstrapIterations?: number; bootstrapSeed?: number } = {},
): TournamentAggregate {
  if (input.some((game) => typeof game.durationMs !== "number" || !Number.isFinite(game.durationMs) || game.durationMs <= 0)) throw new Error("DURATION_INVALID");
  const games = input.map((game) => summarizeGame(game as SimulationSummary));
  let blocks: BaseSeedBlock[] = [];
  try { blocks = toBlocks(games); } catch { /* Aggregation remains descriptive for incomplete arbitrary inputs. */ }
  const core = aggregateCore(games, config, blocks.length, new Set(games.map((game) => game.seed)).size);
  const bootstrap = blocks.length === 0
    ? { samples: [], iterations: options.bootstrapIterations ?? 200, seed: options.bootstrapSeed ?? 1 }
    : pairedBootstrap(blocks, options.bootstrapIterations ?? 200, options.bootstrapSeed ?? 1);
  const scoreSamples: number[] = [];
  const winSamples: number[] = [];
  for (const sample of bootstrap.samples) {
    const sampleGames = sample.games.map((game) => summarizeGame(game as SimulationSummary));
    const sampleBlockCount = sampleGames.length / 8;
    const sampleCore = aggregateCore(sampleGames, config, sampleBlockCount * 1, sampleBlockCount);
    scoreSamples.push(sampleCore.scoreDifference);
    winSamples.push(sampleCore.winRateA);
  }
  const scoreCI = percentileInterval(scoreSamples);
  const winCI = percentileInterval(winSamples);
  const classifications: Record<string, number> = {};
  for (const game of games) {
    const tags = classifyGame(game).scores;
    for (const [tag, score] of Object.entries(tags)) classifications[tag] = (classifications[tag] ?? 0) + score;
  }
  return {
    ...core,
    scoreDifferenceCI: scoreCI,
    winRateCI: winCI,
    pairedScoreDifferenceCI: scoreCI,
    pairedWinRateCI: winCI,
    statisticallySignificant: scoreCI[0] > 0 || scoreCI[1] < 0,
    statisticalSignificance: scoreCI[0] > 0 || scoreCI[1] < 0,
    significance: {
      score: { ci: scoreCI, excludesNeutral: scoreCI[0] > 0 || scoreCI[1] < 0 },
      winRate: { ci: winCI, excludesNeutral: winCI[0] > 0.5 || winCI[1] < 0.5 },
    },
    classifications: { exploratory: true, tags: classifications },
  };
}

export function pairedBootstrap(
  blocksOrGames: BaseSeedBlock[] | Array<GameMetrics | SimulationSummary | GameSummary>,
  iterations: number,
  seed: number,
): BootstrapResult {
  const blocks = isBlockArray(blocksOrGames) ? validateBlocks(blocksOrGames) : toBlocks(blocksOrGames);
  if (!Number.isInteger(iterations) || iterations < 0) throw new Error("BOOTSTRAP_ITERATIONS_INVALID");
  const samples: BootstrapSample[] = [];
  let state = seed >>> 0 || 1;
  for (let index = 0; index < iterations; index += 1) {
    const sampledGames: Array<GameMetrics | SimulationSummary | GameSummary> = [];
    let firstSeed = 0;
    for (let draw = 0; draw < blocks.length; draw += 1) {
      state = nextState(state);
      const block = blocks[state % blocks.length]!;
      if (draw === 0) firstSeed = block.seed ?? block.baseSeed ?? 0;
      sampledGames.push(...block.games.map((game) => game));
    }
    samples.push({ index, seed: firstSeed, games: sampledGames });
  }
  return { samples, iterations, seed };
}

function aggregateCore(games: GameMetrics[], config: BenchmarkConfig, pairedBlockCount = 0, baseSeedCount = 0): Omit<TournamentAggregate, "scoreDifferenceCI" | "winRateCI" | "pairedScoreDifferenceCI" | "pairedWinRateCI" | "statisticallySignificant" | "statisticalSignificance" | "significance" | "classifications"> {
  let winsA = 0;
  let winsB = 0;
  let unresolved = 0;
  let scoreA = 0;
  let scoreB = 0;
  const differences: number[] = [];
  const finishDifferences: number[] = [];
  for (const game of games) {
    const aSeat = ([0, 1, 2, 3] as const).find((seat) => game.strategiesBySeat[seat] === config.strategyA) ?? 0;
    const aTeam = (aSeat % 2) as 0 | 1;
    const bTeam = (aTeam === 0 ? 1 : 0) as 0 | 1;
    const aWon = game.winnerTeam === aTeam;
    const bWon = game.winnerTeam === bTeam;
    if (aWon) winsA += 1; else if (bWon) winsB += 1; else unresolved += 1;
    const currentA = game.teamScore[aTeam] ?? (aWon ? 1 : 0);
    const currentB = game.teamScore[bTeam] ?? (bWon ? 1 : 0);
    scoreA += currentA;
    scoreB += currentB;
    differences.push(currentA - currentB);
    finishDifferences.push(finishDifference(game.finishOrder, aTeam));
  }
  const denominator = winsA + winsB + unresolved;
  const meanDifference = mean(differences);
  const effectSize = standardDeviation(differences) === 0 ? (meanDifference === 0 ? 0 : Math.sign(meanDifference)) : meanDifference / standardDeviation(differences);
  return {
    gameCount: games.length,
    rawGames: games.length,
    pairedRotationUnits: pairedBlockCount * 4,
    baseSeeds: baseSeedCount,
    winsA,
    winsB,
    unresolved,
    winRateA: denominator === 0 ? 0 : winsA / denominator,
    winRateB: denominator === 0 ? 0 : winsB / denominator,
    scoreA,
    scoreB,
    scoreDifference: games.length === 0 ? 0 : (scoreA - scoreB) / games.length,
    finishDifference: mean(finishDifferences),
    effectSize,
    errorRate: games.length === 0 ? 0 : games.filter((game) => game.errorCounters.total > 0).length / games.length,
    duration: summary(games.map((game) => game.durationMs)),
    elo: {
      initialRating: 1500,
      kFactor: 32,
      observedScore: denominator === 0 ? 0.5 : (winsA + unresolved * 0.5) / denominator,
      delta: 32 * ((winsA + unresolved * 0.5) / Math.max(1, denominator) - 0.5),
      version: "d0-elo-v1",
    },
  };
}

function finishDifference(finishOrder: GameSummary["finishOrder"], aTeam: 0 | 1): number {
  const a = finishOrder.filter((seat) => seat % 2 === aTeam).map((seat) => finishOrder.indexOf(seat) + 1);
  const b = finishOrder.filter((seat) => seat % 2 !== aTeam).map((seat) => finishOrder.indexOf(seat) + 1);
  return mean(b) - mean(a);
}

export function toBlocks(games: Array<GameMetrics | SimulationSummary | GameSummary>): BaseSeedBlock[] {
  const bySeed = new Map<number, BaseSeedBlock>();
  for (const game of games) {
    const seed = game.seed;
    const block = bySeed.get(seed) ?? { seed, games: [] };
    block.games.push(game);
    bySeed.set(seed, block);
  }
  return validateBlocks([...bySeed.values()].sort((left, right) => (left.seed ?? left.baseSeed ?? 0) - (right.seed ?? right.baseSeed ?? 0)));
}

function validateBlocks(blocks: BaseSeedBlock[]): BaseSeedBlock[] {
  for (const block of blocks) {
    const seed = block.seed ?? block.baseSeed;
    if (seed === undefined || block.games.length !== 8) throw new Error("BASE_SEED_BLOCK_INVALID");
    if (block.games.some((game) => game.seed !== seed)) throw new Error("BASE_SEED_BLOCK_INVALID");
    const rotations = new Set(block.games.map((game) => game.rotation));
    if (rotations.size !== 4 || ![0, 1, 2, 3].every((rotation) => rotations.has(rotation as GameSummary["rotation"]))) {
      throw new Error("BASE_SEED_BLOCK_INVALID");
    }
    for (const rotation of [0, 1, 2, 3] as const) {
      const allocationTokens = new Set(block.games.filter((game) => game.rotation === rotation).map(allocationToken));
      if (allocationTokens.size !== 2 || !allocationTokens.has("AB") || !allocationTokens.has("BA")) throw new Error("BASE_SEED_BLOCK_INVALID");
    }
  }
  return blocks;
}

function allocationToken(game: GameSummary): string {
  const explicit = /allocation["']?:["']?(AB|BA)/.exec(game.matchId)?.[1] ?? /allocation:(AB|BA)/.exec(game.matchId)?.[1];
  if (explicit !== "AB" && explicit !== "BA") throw new Error("BASE_SEED_BLOCK_INVALID");
  return explicit;
}

function isBlockArray(value: BaseSeedBlock[] | Array<GameMetrics | SimulationSummary | GameSummary>): value is BaseSeedBlock[] {
  return value.length > 0 && "games" in value[0]!;
}

function percentileInterval(values: number[]): [number, number] {
  if (values.length === 0) return [0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  return [sorted[Math.floor((sorted.length - 1) * 0.025)]!, sorted[Math.floor((sorted.length - 1) * 0.975)]!];
}

function summary(values: number[]): { mean: number; median: number; p95: number } {
  if (values.length === 0) return { mean: 0, median: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return { mean: mean(values), median: sorted[Math.floor((sorted.length - 1) * 0.5)]!, p95: sorted[Math.floor((sorted.length - 1) * 0.95)]! };
}

function mean(values: number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}
function nextState(value: number): number {
  let state = value >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0 || 1;
}
