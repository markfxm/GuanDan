export type D1Outcome = "a" | "b" | "draw";
export interface D1GameLike { seed: number; rotation: number; allocation: "AB" | "BA"; scoreDifference: number; outcome: D1Outcome; }
export interface D1Block { seed: number; games: D1GameLike[]; }
export interface D1BootstrapResult { blockUnit: "base-seed" | "base-seed-difference"; iterations: number; seed: number; scoreCI: [number, number]; winRateCI: [number, number]; }
export interface D1PairedStatistics extends D1BootstrapResult { baseSeedCount: number; rawGameCount: number; pairedUnitCount: number; meanScoreDifference: number; medianScoreDifference: number; pairedWinsA: number; pairedWinsB: number; pairedDraws: number; pairedWinRateA: number; pairedWinRateB: number; pairedDrawRate: number; bootstrap: D1BootstrapResult; }

const DEFAULT_ITERATIONS = 10000;
const DEFAULT_SEED = 20260714;

export function baseSeedBlocks(games: D1GameLike[]): D1Block[] {
  const bySeed = new Map<number, D1GameLike[]>();
  for (const game of games) (bySeed.get(game.seed) ?? (bySeed.set(game.seed, []), bySeed.get(game.seed)!)).push(game);
  const blocks = [...bySeed.entries()].sort(([a], [b]) => a - b).map(([seed, values]) => ({ seed, games: [...values].sort((a, b) => a.rotation - b.rotation || a.allocation.localeCompare(b.allocation)) }));
  for (const block of blocks) {
    if (block.games.length !== 8) throw new Error("BASE_SEED_BLOCK_INVALID");
    const keys = new Set(block.games.map((game) => `${game.rotation}:${game.allocation}`));
    if (keys.size !== 8 || [0, 1, 2, 3].some((rotation) => !keys.has(`${rotation}:AB`) || !keys.has(`${rotation}:BA`))) throw new Error("BASE_SEED_BLOCK_INVALID");
  }
  return blocks;
}

export function pairedBootstrap(games: D1GameLike[], options: { iterations?: number; seed?: number } = {}): D1BootstrapResult {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const seed = options.seed ?? DEFAULT_SEED;
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error("BOOTSTRAP_ITERATIONS_INVALID");
  const blocks = baseSeedBlocks(games); const scores: number[] = []; const wins: number[] = []; let state = seed >>> 0 || 1;
  for (let i = 0; i < iterations; i += 1) {
    const sampled: D1GameLike[] = [];
    for (let j = 0; j < blocks.length; j += 1) { state = nextState(state); sampled.push(...blocks[state % blocks.length]!.games); }
    const units = pairedUnits(sampled); scores.push(mean(units.map((unit) => unit.scoreDifference))); wins.push(winRate(units));
  }
  return { blockUnit: "base-seed", iterations, seed, scoreCI: percentile(scores), winRateCI: percentile(wins) };
}

export function pairedBlockStatistics(games: D1GameLike[], options: { bootstrapIterations?: number; bootstrapSeed?: number } = {}): D1PairedStatistics {
  const units = pairedUnits(games); const bootstrap = pairedBootstrap(games, { iterations: options.bootstrapIterations, seed: options.bootstrapSeed }); const scores = units.map((unit) => unit.scoreDifference); const counts = units.reduce((out, unit) => { out[unit.outcome] += 1; return out; }, { a: 0, b: 0, draw: 0 }); const decisive = counts.a + counts.b;
  return { ...bootstrap, bootstrap, baseSeedCount: baseSeedBlocks(games).length, rawGameCount: games.length, pairedUnitCount: units.length, meanScoreDifference: mean(scores), medianScoreDifference: median(scores), pairedWinsA: counts.a, pairedWinsB: counts.b, pairedDraws: counts.draw, pairedWinRateA: decisive === 0 ? 0.5 : counts.a / decisive, pairedWinRateB: decisive === 0 ? 0.5 : counts.b / decisive, pairedDrawRate: units.length === 0 ? 0 : counts.draw / units.length };
}

export interface D1Uplift { scoreBlocks: number[]; winRateBlocks: number[]; bootstrap: D1BootstrapResult; }
export function jointUplift(treatment: Array<{ seed: number; scoreDifference: number; winRate: number }>, control: Array<{ seed: number; scoreDifference: number; winRate: number }>, options: { iterations?: number; seed?: number } = {}): D1Uplift {
  const controlBySeed = new Map(control.map((item) => [item.seed, item])); const scoreBlocks: number[] = []; const winRateBlocks: number[] = [];
  for (const item of [...treatment].sort((a, b) => a.seed - b.seed)) { const other = controlBySeed.get(item.seed); if (other === undefined) throw new Error("UPLIFT_SEED_SET_MISMATCH"); scoreBlocks.push(item.scoreDifference - other.scoreDifference); winRateBlocks.push(item.winRate - other.winRate); }
  if (control.length !== treatment.length) throw new Error("UPLIFT_SEED_SET_MISMATCH");
  const iterations = options.iterations ?? DEFAULT_ITERATIONS; const seed = options.seed ?? DEFAULT_SEED; let state = seed >>> 0 || 1; const scoreSamples: number[] = []; const winSamples: number[] = [];
  for (let i = 0; i < iterations; i += 1) { let score = 0; let win = 0; for (let j = 0; j < scoreBlocks.length; j += 1) { state = nextState(state); const index = state % scoreBlocks.length; score += scoreBlocks[index]!; win += winRateBlocks[index]!; } scoreSamples.push(score / scoreBlocks.length); winSamples.push(win / winRateBlocks.length); }
  return { scoreBlocks, winRateBlocks, bootstrap: { blockUnit: "base-seed-difference", iterations, seed, scoreCI: percentile(scoreSamples), winRateCI: percentile(winSamples) } };
}

function pairedUnits(games: D1GameLike[]): Array<{ scoreDifference: number; outcome: D1Outcome }> { const byRotation = new Map<number, D1GameLike[]>(); for (const game of games) (byRotation.get(game.rotation) ?? (byRotation.set(game.rotation, []), byRotation.get(game.rotation)!)).push(game); return [...byRotation.values()].map((pair) => ({ scoreDifference: mean(pair.map((game) => game.scoreDifference)), outcome: pair.filter((game) => game.outcome === "a").length > pair.filter((game) => game.outcome === "b").length ? "a" : pair.filter((game) => game.outcome === "b").length > pair.filter((game) => game.outcome === "a").length ? "b" : "draw" })); }
function winRate(units: Array<{ outcome: D1Outcome }>): number { const decisive = units.filter((unit) => unit.outcome !== "draw"); return decisive.length === 0 ? 0.5 : decisive.filter((unit) => unit.outcome === "a").length / decisive.length; }
function percentile(values: number[]): [number, number] { const sorted = [...values].sort((a, b) => a - b); return [sorted[Math.floor((sorted.length - 1) * 0.025)] ?? 0, sorted[Math.floor((sorted.length - 1) * 0.975)] ?? 0]; }
function mean(values: number[]): number { return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length; }
function median(values: number[]): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0; }
function nextState(value: number): number { let state = value >>> 0; state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0 || 1; }
