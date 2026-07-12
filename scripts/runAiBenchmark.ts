import { Worker } from "node:worker_threads";
import { createHash as sha256 } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Seat } from "../src/game/room";
import type { GameRank } from "../src/engine/cards";
import type { BenchmarkConfig, GameSummary } from "../tests/benchmark/contracts";
import { canonicalJson } from "../tests/benchmark/contracts";
import { aggregateTournament } from "../tests/benchmark/statistics";
import { summarizeGame, type GameMetrics } from "../tests/benchmark/metrics";
import { buildGamesForSeed, type BenchmarkGameTask } from "../tests/benchmark/rotations";
import { createManifest, buildReport, writeReport, writeReplay, type BatchManifest } from "../tests/benchmark/reporting";
import { simulateGame, type SimulationError, type SimulationSummary, type SafetyErrorCounters } from "../tests/benchmark/simulator";
import { strategyDescriptors } from "../tests/benchmark/strategies";
import type { BenchmarkWorkerResult } from "../tests/benchmark/worker";

export interface BenchmarkCliOptions {
  strategyA: string;
  strategyB: string;
  seeds: number[];
  paired: boolean;
  batch?: { start: number; end: number };
  resume: boolean;
  skipExisting: boolean;
  output?: string;
  replayMode: "none" | "failures" | "all";
  diagnostics: boolean;
  timeoutMs: number;
  concurrency: number;
  rank: GameRank;
  benchmarkVersion: string;
  replayMatch?: string;
}

export interface BenchmarkRunResult {
  config: BenchmarkConfig;
  configHash: string;
  games: Array<SimulationSummary | GameMetrics>;
  report?: Record<string, unknown>;
  manifest: BatchManifest;
  outputPath?: string;
}

const DEFAULTS = { rank: "2" as GameRank, benchmarkVersion: "d0-v1", replayMode: "failures" as const, timeoutMs: 30_000, concurrency: 1 };

export function parseBenchmarkArgs(argv: string[]): BenchmarkCliOptions {
  const values = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) throw new Error(`UNKNOWN_ARGUMENT:${token}`);
    const [name, inline] = token.slice(2).split("=", 2);
    if (["paired", "resume", "skip-existing", "diagnostics"].includes(name)) values.set(name, true);
    else values.set(name, inline ?? argv[++index]);
  }
  const replayMatch = stringValue(values, "replay-match");
  const strategyA = stringValue(values, "strategy-a") ?? stringValue(values, "a") ?? (replayMatch ? "" : undefined);
  const strategyB = stringValue(values, "strategy-b") ?? stringValue(values, "b") ?? (replayMatch ? "" : undefined);
  if (strategyA === undefined || strategyB === undefined) throw new Error("STRATEGIES_REQUIRED");
  const seedsText = stringValue(values, "seeds") ?? stringValue(values, "seed") ?? "1";
  const seeds = parseSeeds(seedsText);
  const batchText = stringValue(values, "batch");
  const batch = batchText === undefined ? undefined : parseRange(batchText);
  const selectedSeeds = batch === undefined ? seeds : seeds.filter((seed) => seed >= batch.start && seed <= batch.end);
  const concurrency = integerValue(values, "concurrency", DEFAULTS.concurrency);
  if (concurrency < 1) throw new Error("CONCURRENCY_INVALID");
  const timeoutMs = integerValue(values, "timeout-ms", DEFAULTS.timeoutMs);
  if (timeoutMs < 1) throw new Error("TIMEOUT_INVALID");
  const replayMode = (stringValue(values, "replay") ?? DEFAULTS.replayMode) as BenchmarkCliOptions["replayMode"];
  if (!["none", "failures", "all"].includes(replayMode)) throw new Error("REPLAY_MODE_INVALID");
  return {
    strategyA, strategyB, seeds: [...new Set(selectedSeeds)].sort((a, b) => a - b),
    paired: values.get("paired") === true,
    batch, resume: values.get("resume") === true, skipExisting: values.get("skip-existing") === true,
    output: stringValue(values, "output"), replayMode, diagnostics: values.get("diagnostics") === true,
    timeoutMs, concurrency, rank: (stringValue(values, "rank") ?? DEFAULTS.rank) as GameRank,
    benchmarkVersion: stringValue(values, "benchmark-version") ?? DEFAULTS.benchmarkVersion, replayMatch,
  };
}

export async function runBenchmark(input: Partial<BenchmarkCliOptions> & Pick<BenchmarkCliOptions, "strategyA" | "strategyB" | "seeds">): Promise<BenchmarkRunResult> {
  const options: BenchmarkCliOptions = {
    ...DEFAULTS, paired: false, resume: false, skipExisting: false, diagnostics: false,
    ...input, seeds: [...new Set(input.seeds)].sort((a, b) => a - b),
  };
  const config: BenchmarkConfig = { benchmarkVersion: options.benchmarkVersion, rank: options.rank, seeds: options.seeds, strategyA: options.strategyA, strategyB: options.strategyB, replayMode: options.replayMode };
  const tasks = options.seeds.flatMap((seed) => buildGamesForSeed(config, seed));
  const configHash = tasks[0]?.configHash ?? hashConfig(config);
  const reused = loadExisting(options.output, configHash, options);
  const existingById = new Map(reused.map((game) => [game.matchId, game]));
  const duplicate = reused.length !== existingById.size;
  if (duplicate) throw new Error("DUPLICATE_MATCH_ID");
  const expectedSet = new Set(tasks.map((task) => task.matchId));
  if (reused.some((game) => !expectedSet.has(game.matchId))) throw new Error("UNEXPECTED_MATCH_ID");
  const pending = tasks.filter((task) => !existingById.has(task.matchId));
  const fresh = await executeTasks(pending, options.concurrency, options.timeoutMs);
  const games = [...existingById.values(), ...fresh].sort((left, right) => left.matchId.localeCompare(right.matchId));
  const expected = tasks.map((task) => task.matchId).sort();
  for (const id of expected) if (!games.some((game) => game.matchId === id)) throw new Error(`MISSING_EXPECTED_MATCH_ID:${id}`);
  const manifest = createManifest(config, games, { expectedMatchIds: expected });
  const metrics = games.map((game) => summarizeGame(game));
  const aggregate = aggregateTournament(metrics, config);
  const replayPaths = games.map((game) => writeReplay(game, { replayMode: options.replayMode, strategyDescriptors }));
  const report = buildReport({ config, games: metrics, aggregate, replayPaths }, { outputPath: options.output });
  let outputPath: string | undefined;
  if (options.output !== undefined) outputPath = writeReport({ config, games: metrics, aggregate, replayPaths }, options.output);
  if (options.output !== undefined) {
    const manifestPath = `${options.output}.manifest.json`;
    fs.mkdirSync(path.dirname(path.resolve(manifestPath)), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  return { config, configHash, games: metrics, report, manifest, outputPath };
}

async function executeTasks(tasks: BenchmarkGameTask[], concurrency: number, timeoutMs: number): Promise<SimulationSummary[]> {
  if (tasks.length === 0) return [];
  if (concurrency <= 1) return Promise.all(tasks.map((task) => withTimeout(() => simulateGame(task), task, timeoutMs)));
  return executeWithWorkers(tasks, Math.min(concurrency, tasks.length), timeoutMs);
}

function executeWithWorkers(tasks: BenchmarkGameTask[], count: number, timeoutMs: number): Promise<SimulationSummary[]> {
  return new Promise((resolve, reject) => {
    const results: SimulationSummary[] = [];
    let cursor = 0;
    let finished = 0;
    const workers: Worker[] = [];
    const timers = new Map<Worker, ReturnType<typeof setTimeout>>();
    const active = new Map<Worker, BenchmarkGameTask>();
    const finish = (worker: Worker, result: SimulationSummary) => {
      const current = active.get(worker);
      if (current === undefined || current.matchId !== result.matchId) return;
      const timer = timers.get(worker); if (timer) clearTimeout(timer); timers.delete(worker);
      active.delete(worker);
      results.push(result); finished += 1;
      if (cursor < tasks.length) dispatch(worker); else if (finished === tasks.length) { for (const current of workers) void current.terminate(); resolve(results.sort((a, b) => a.matchId.localeCompare(b.matchId))); }
    };
    const dispatch = (worker: Worker) => {
      const task = tasks[cursor++]; if (task === undefined) return;
      active.set(worker, task);
      worker.postMessage({ task: deepFreeze(task) });
      timers.set(worker, setTimeout(() => { finish(worker, timeoutSummary(task, timeoutMs)); }, timeoutMs));
    };
    for (let index = 0; index < count; index += 1) {
      const worker = new Worker(pathToFileURL(path.resolve(process.cwd(), "tests/benchmark/worker.ts")), { execArgv: ["--import", "tsx/esm"] });
      workers.push(worker);
      worker.on("message", (message: BenchmarkWorkerResult) => {
        if (message.type === "result" && message.result) finish(worker, message.result);
        else if (message.type === "error") { const task = active.get(worker); if (task) finish(worker, timeoutSummary(task, 0, message.error)); }
      });
      worker.on("error", (error) => { for (const timer of timers.values()) clearTimeout(timer); void Promise.all(workers.map((current) => current.terminate())); reject(error); });
      dispatch(worker);
    }
  });
}

function withTimeout<T extends SimulationSummary>(run: () => T, task: BenchmarkGameTask, timeoutMs: number): Promise<T> {
  return new Promise((resolve) => { const started = Date.now(); try { const result = run(); resolve(Date.now() - started > timeoutMs ? timeoutSummary(task, timeoutMs) as T : result); } catch (cause) { resolve(timeoutSummary(task, 0, cause instanceof Error ? cause.message : String(cause)) as T); } });
}

function timeoutSummary(task: BenchmarkGameTask, timeoutMs: number, error = `BENCHMARK_TIMEOUT:${timeoutMs}`): SimulationSummary {
  const strategiesBySeat = { 0: task.allocation === "AB" ? task.config.strategyA : task.config.strategyB, 1: task.allocation === "AB" ? task.config.strategyB : task.config.strategyA, 2: task.allocation === "AB" ? task.config.strategyA : task.config.strategyB, 3: task.allocation === "AB" ? task.config.strategyB : task.config.strategyA } as Record<Seat, string>;
  const failure: SimulationError = { seed: task.seed, seat: 0, strategy: strategiesBySeat[0], error };
  const counters: SafetyErrorCounters = { total: 1, strategyErrors: error.includes("UNKNOWN_STRATEGY") ? 1 : 0, runtimeErrors: 0, illegalActions: 0, engineErrors: error.includes("UNKNOWN_STRATEGY") ? 0 : 1, guardErrors: 0 };
  return { matchId: task.matchId, configHash: task.configHash, seed: task.seed, rank: task.config.rank, rotation: task.rotation, strategiesBySeat, finishOrder: [], winnerTeam: null, teamScore: { 0: 0, 1: 0 }, actionCount: 0, publicTraceHash: "", finalPublicStateHash: "", completed: false, failed: true, errors: [failure], errorCounters: counters, publicEvents: [] };
}

function loadExisting(output: string | undefined, configHash: string, options: BenchmarkCliOptions): Array<SimulationSummary> {
  if ((!options.resume && !options.skipExisting) || output === undefined || !fs.existsSync(output)) return [];
  const raw = JSON.parse(fs.readFileSync(output, "utf8")) as Partial<BatchManifest> & { games?: Array<SimulationSummary> };
  if (raw.configHash !== configHash) throw new Error("CONFIG_HASH_MISMATCH");
  const games = Array.isArray(raw.games) ? raw.games : [];
  const ids = new Set(games.map((game) => game.matchId));
  if (ids.size !== games.length) throw new Error("DUPLICATE_MATCH_ID");
  return games;
}

function parseSeeds(value: string): number[] { return value.split(",").flatMap((part) => part.includes("-") ? range(parseRange(part)) : [parseIntStrict(part)]); }
function parseRange(value: string): { start: number; end: number } { const [a, b] = value.split("-").map(parseIntStrict); if (a === undefined || b === undefined || b < a) throw new Error("SEED_RANGE_INVALID"); return { start: a, end: b }; }
function range(rangeValue: { start: number; end: number }): number[] { return Array.from({ length: rangeValue.end - rangeValue.start + 1 }, (_, index) => rangeValue.start + index); }
function parseIntStrict(value: string | undefined): number { const parsed = Number(value); if (!Number.isInteger(parsed)) throw new Error("INTEGER_INVALID"); return parsed; }
function stringValue(values: Map<string, string | boolean>, key: string): string | undefined { const value = values.get(key); return typeof value === "string" ? value : undefined; }
function integerValue(values: Map<string, string | boolean>, key: string, fallback: number): number { const value = stringValue(values, key); return value === undefined ? fallback : parseIntStrict(value); }
function hashConfig(config: BenchmarkConfig): string { return sha256(canonicalJson({ benchmarkVersion: config.benchmarkVersion, rank: config.rank, strategyA: config.strategyA, strategyB: config.strategyB, replayMode: config.replayMode })).digest("hex"); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
export function stripVolatile<T>(value: T): T { return JSON.parse(JSON.stringify(value, (key, current) => /duration|diagnostic|tim(e|ing)|worker|path|timestamp/i.test(key) ? undefined : current)); }

if (process.argv[1]?.endsWith("runAiBenchmark.ts")) {
  runBenchmark(parseBenchmarkArgs(process.argv.slice(2))).then((result) => { console.info(`AI benchmark: ${result.games.length} games`); }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
