import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BenchmarkConfig, GameSummary, ReplayDocument, StrategyDescriptor } from "./contracts";
import { canonicalJson } from "./contracts";
import type { SimulationSummary } from "./simulator";

const VOLATILE_KEY = /duration|tim(e|ing)|diagnostic|path|worker|stack|debug|timestamp/i;
const PRIVATE_KEY = /^(publicEvents|hands|initialHands|ownHand|fullState|hiddenState|finalPublicState|room|aiRuntime|aiPlans)$/i;

export interface ReplayOptions {
  outputDir?: string;
  replayMode?: "none" | "failures" | "all";
  replayVersion?: string;
  benchmarkVersion?: string;
  engineVersion?: string;
  roomRulesVersion?: string;
  strategyDescriptors?: StrategyDescriptor[];
}

export interface ReportInput {
  config: BenchmarkConfig;
  games: Array<GameSummary | SimulationSummary>;
  aggregate?: unknown;
  paired?: unknown;
  replayPaths?: Array<string | undefined>;
}

export interface ReportOptions {
  outputPath?: string;
}

export interface BatchManifest {
  schemaVersion: "1";
  manifestVersion: "d0-v1";
  configHash: string;
  benchmarkVersion: string;
  strategyDescriptors?: StrategyDescriptor[];
  seedStart?: number;
  seedEnd?: number;
  expectedMatchIds: string[];
  games: Array<GameSummary | SimulationSummary>;
  publicTraceHashes: Record<string, string>;
  finalPublicStateHashes: Record<string, string>;
}

export function publicTraceHash(input: unknown): string {
  const events = extractEvents(input);
  return sha256(canonicalJson(normalizePublic(events)));
}

export function finalPublicStateHash(input: unknown): string {
  const state = isRecord(input) && "finalPublicState" in input
    ? input.finalPublicState
    : isRecord(input) && "publicEvents" in input
      ? pickFinalState(input)
      : input;
  return sha256(canonicalJson(normalizePublic(state)));
}

/** Compatibility aliases used by benchmark tooling. */
export const hashPublicTrace = publicTraceHash;
export const hashFinalPublicState = finalPublicStateHash;

export function writeReplay(summary: SimulationSummary | (GameSummary & Partial<SimulationSummary>), options?: ReplayOptions | string, extra?: ReplayOptions): string | undefined;
export function writeReplay(summary: SimulationSummary | (GameSummary & Partial<SimulationSummary>), optionsOrDir: ReplayOptions | string = {}, extra: ReplayOptions = {}): string | undefined {
  const options: ReplayOptions = typeof optionsOrDir === "string" ? { ...extra, outputDir: optionsOrDir } : optionsOrDir;
  const mode = options.replayMode ?? "failures";
  if (mode === "none" || (mode === "failures" && !summary.failed)) return undefined;
  const outputDir = options.outputDir ?? path.join("artifacts", "ai-benchmark-replays");
  const matchup = `${summary.strategiesBySeat[0] ?? "A"}-vs-${summary.strategiesBySeat[1] ?? "B"}`;
  const destination = path.join(outputDir, matchup, `${safeFileName(summary.matchId)}.json`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const document: ReplayDocument = {
    schemaVersion: "1",
    replayVersion: options.replayVersion ?? "d0-v1",
    benchmarkVersion: options.benchmarkVersion ?? "d0-v1",
    engineVersion: options.engineVersion ?? "unknown",
    roomRulesVersion: options.roomRulesVersion ?? "unknown",
    configHash: summary.configHash,
    matchId: summary.matchId,
    seed: summary.seed,
    rank: summary.rank,
    rotation: summary.rotation,
    strategiesBySeat: orderedSeatMap(summary.strategiesBySeat),
    strategyDescriptors: options.strategyDescriptors ?? [],
    deterministicRandom: { strategySeedDerivationVersion: "1" },
    publicEvents: Array.isArray((summary as Partial<SimulationSummary>).publicEvents)
      ? normalizePublic((summary as Partial<SimulationSummary>).publicEvents) as ReplayDocument["publicEvents"]
      : [],
    finishOrder: [...summary.finishOrder],
    winnerTeam: summary.winnerTeam,
    teamScore: { 0: summary.teamScore[0], 1: summary.teamScore[1] },
    actionCount: summary.actionCount,
    publicTraceHash: summary.publicTraceHash,
    finalPublicStateHash: summary.finalPublicStateHash,
  };
  fs.writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return destination;
}

export function buildReport(input: ReportInput, options: ReportOptions = {}): Record<string, unknown> {
  const outputDir = options.outputPath === undefined ? undefined : path.dirname(path.resolve(options.outputPath));
  const games = input.games.map((game, index) => {
    const compact = compactSummary(game);
    const replayPath = input.replayPaths?.[index];
    if (replayPath !== undefined) compact.replayPath = outputDir === undefined || !path.isAbsolute(replayPath)
      ? replayPath
      : path.relative(outputDir, replayPath).replaceAll(path.sep, "/");
    return compact;
  });
  const report: Record<string, unknown> = {
    schemaVersion: "1",
    reportVersion: "d0-v1",
    benchmarkVersion: input.config.benchmarkVersion,
    config: input.config,
    configHash: input.games[0]?.configHash ?? configHash(input.config),
    games,
  };
  if (input.aggregate !== undefined) report.aggregate = input.aggregate;
  if (input.paired !== undefined) report.paired = input.paired;
  return report;
}

export function writeReport(input: ReportInput, options?: ReportOptions | string): string;
export function writeReport(input: ReportInput, optionsOrPath: ReportOptions | string = {}): string {
  const options: ReportOptions = typeof optionsOrPath === "string" ? { outputPath: optionsOrPath } : optionsOrPath;
  const destination = options.outputPath ?? path.join("artifacts", "ai-benchmark-report.json");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(buildReport(input, options), null, 2)}\n`, "utf8");
  return destination;
}

export function createManifest(
  config: BenchmarkConfig,
  games: Array<GameSummary | SimulationSummary>,
  options: { expectedMatchIds?: string[]; strategyDescriptors?: StrategyDescriptor[] } = {},
): BatchManifest {
  const configHashValue = games[0]?.configHash ?? configHash(config);
  if (games.some((game) => game.configHash !== configHashValue)) throw new Error("CONFIG_HASH_MISMATCH");
  const ids = [...new Set(options.expectedMatchIds ?? games.map((game) => game.matchId))].sort();
  const seeds = games.map((game) => game.seed);
  return {
    schemaVersion: "1",
    manifestVersion: "d0-v1",
    configHash: configHashValue,
    benchmarkVersion: config.benchmarkVersion,
    strategyDescriptors: options.strategyDescriptors,
    seedStart: seeds.length === 0 ? undefined : Math.min(...seeds),
    seedEnd: seeds.length === 0 ? undefined : Math.max(...seeds),
    expectedMatchIds: ids,
    games: [...games].sort((left, right) => left.matchId.localeCompare(right.matchId)),
    publicTraceHashes: Object.fromEntries(games.map((game) => [game.matchId, game.publicTraceHash])),
    finalPublicStateHashes: Object.fromEntries(games.map((game) => [game.matchId, game.finalPublicStateHash])),
  };
}

export function mergeBatches(batches: BatchManifest[]): BatchManifest {
  if (batches.length === 0) throw new Error("BATCHES_EMPTY");
  const configHashValue = batches[0]!.configHash;
  const descriptorKey = canonicalJson(batches[0]!.strategyDescriptors ?? []);
  const seen = new Set<string>();
  const games: Array<GameSummary | SimulationSummary> = [];
  const expected = new Set<string>();
  const trace: Record<string, string> = {};
  const state: Record<string, string> = {};
  for (const batch of batches) {
    if (batch.configHash !== configHashValue) throw new Error("CONFIG_HASH_MISMATCH");
    if (batch.benchmarkVersion !== batches[0]!.benchmarkVersion) throw new Error("BENCHMARK_VERSION_MISMATCH");
    if (canonicalJson(batch.strategyDescriptors ?? []) !== descriptorKey) throw new Error("STRATEGY_DESCRIPTORS_MISMATCH");
    const actual = new Set(batch.games.map((game) => game.matchId));
    for (const id of batch.expectedMatchIds) {
      expected.add(id);
      if (!actual.has(id)) throw new Error(`MISSING_EXPECTED_MATCH_ID:${id}`);
    }
    for (const id of actual) if (!batch.expectedMatchIds.includes(id)) throw new Error(`UNEXPECTED_MATCH_ID:${id}`);
    for (const game of batch.games) {
      if (game.configHash !== batch.configHash) throw new Error(`CONFIG_HASH_MISMATCH:${game.matchId}`);
      if (seen.has(game.matchId)) throw new Error(`DUPLICATE_MATCH_ID:${game.matchId}`);
      seen.add(game.matchId);
      games.push(game);
      trace[game.matchId] = game.publicTraceHash;
      state[game.matchId] = game.finalPublicStateHash;
    }
  }
  for (const id of expected) if (!seen.has(id)) throw new Error(`MISSING_EXPECTED_MATCH_ID:${id}`);
  validateCompleteBlocks(games);
  const sorted = games.sort((left, right) => left.matchId.localeCompare(right.matchId));
  const seeds = sorted.map((game) => game.seed);
  return {
    schemaVersion: "1",
    manifestVersion: "d0-v1",
    configHash: configHashValue,
    benchmarkVersion: batches[0]!.benchmarkVersion,
    strategyDescriptors: batches[0]!.strategyDescriptors,
    seedStart: Math.min(...seeds),
    seedEnd: Math.max(...seeds),
    expectedMatchIds: [...new Set([...expected, ...sorted.map((game) => game.matchId)])].sort(),
    games: sorted,
    publicTraceHashes: trace,
    finalPublicStateHashes: state,
  };
}

function validateCompleteBlocks(games: Array<GameSummary | SimulationSummary>): void {
  const bySeed = new Map<number, Array<GameSummary | SimulationSummary>>();
  for (const game of games) (bySeed.get(game.seed) ?? (bySeed.set(game.seed, []), bySeed.get(game.seed)!)).push(game);
  for (const [seed, block] of bySeed) {
    if (block.length !== 8) throw new Error(`INCOMPLETE_BASE_SEED_BLOCK:${seed}`);
    const seen = new Set<string>();
    const rotations = new Set<number>();
    for (const game of block) {
      if (game.strategiesBySeat[0] !== game.strategiesBySeat[2] || game.strategiesBySeat[1] !== game.strategiesBySeat[3] || game.strategiesBySeat[0] === game.strategiesBySeat[1]) {
        throw new Error(`INVALID_ALLOCATION:${seed}`);
      }
      const allocation = allocationOf(game);
      const key = `${game.rotation}:${allocation}`;
      if (seen.has(key)) throw new Error(`DUPLICATE_ROTATION_ALLOCATION:${seed}:${key}`);
      seen.add(key);
      rotations.add(game.rotation);
    }
    if (seen.size !== 8 || rotations.size !== 4 || ![0, 1, 2, 3].every((rotation) => rotations.has(rotation))) {
      throw new Error(`INCOMPLETE_BASE_SEED_BLOCK:${seed}`);
    }
  }
}

function allocationOf(game: GameSummary): "AB" | "BA" {
  const even = game.strategiesBySeat[0];
  const odd = game.strategiesBySeat[1];
  return even === game.strategiesBySeat[2] && odd === game.strategiesBySeat[3] && even !== odd
    ? (game.strategiesBySeat[0] < game.strategiesBySeat[1] ? "AB" : "BA")
    : `${even}:${odd}` as "AB" | "BA";
}

const REPORT_SUMMARY_KEYS = [
  "matchId", "configHash", "seed", "rank", "rotation", "strategiesBySeat", "finishOrder", "winnerTeam", "teamScore",
  "actionCount", "publicTraceHash", "finalPublicStateHash", "teamPlacementScore", "placementByTeam", "advancementProxy",
  "settlementOutcome", "levelStep", "individualDiagnosticScore", "playPassRatio", "bombCount", "bombs", "planContinuation",
  "planContinuationActions", "finalTenActions", "finalTenCardActions", "durationMs", "durationStats", "categoryTags",
  "classification", "errorCounters", "seatDealLimitations", "completed", "failed", "errors", "replayPath",
] as const;

function compactSummary(game: GameSummary | SimulationSummary): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of REPORT_SUMMARY_KEYS) {
    if (!(key in game)) continue;
    const value = game[key as keyof typeof game];
    if (key === "errors") {
      result[key] = Array.isArray(value) ? (value as unknown as Array<Record<string, unknown>>).map((error) => ({ seed: error.seed, seat: error.seat, strategy: error.strategy, error: error.error })) : value;
    } else result[key] = value;
  }
  return result;
}

function extractEvents(input: unknown): unknown {
  if (isRecord(input) && "publicEvents" in input) return input.publicEvents;
  return input;
}

function pickFinalState(input: Record<string, unknown>): unknown {
  const keys = ["rank", "status", "currentTurn", "leaderSeat", "handCounts", "finishOrder", "settlement"];
  return Object.fromEntries(keys.filter((key) => key in input).map((key) => [key, input[key]]));
}

function normalizePublic(value: unknown, key?: string): unknown {
  if (key !== undefined && VOLATILE_KEY.test(key)) return undefined;
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizePublic(item)).filter((item) => item !== undefined);
    return key === "cardIds" ? normalized.sort((left, right) => String(left).localeCompare(String(right))) : key === "passSeats" ? normalized.sort((left, right) => Number(left) - Number(right)) : normalized;
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const objectKey of Object.keys(value).sort()) {
      if (PRIVATE_KEY.test(objectKey)) continue;
      const normalized = normalizePublic(value[objectKey], objectKey);
      if (normalized !== undefined) result[objectKey] = normalized;
    }
    return result;
  }
  return value;
}

function orderedSeatMap<T>(record: Record<number, T>): Record<number, T> {
  return Object.fromEntries([0, 1, 2, 3].filter((seat) => seat in record).map((seat) => [seat, record[seat]])) as Record<number, T>;
}

function configHash(config: BenchmarkConfig): string {
  return sha256(canonicalJson({ benchmarkVersion: config.benchmarkVersion, rank: config.rank, strategyA: config.strategyA, strategyB: config.strategyB, replayMode: config.replayMode }));
}

function sha256(value: string): string { return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex"); }
function safeFileName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, "_"); }
function isRecord(value: unknown): value is Record<string, any> { return value !== null && typeof value === "object" && !Array.isArray(value); }
