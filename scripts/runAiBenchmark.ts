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
import { createManifest, buildReport, writeReport, writeMarkdownReport, writeReplay, ENGINE_VERSION, ROOM_RULES_VERSION, type BatchManifest } from "../tests/benchmark/reporting";
import { simulateGame, type SimulationError, type SimulationSummary, type SafetyErrorCounters } from "../tests/benchmark/simulator";
import { canonicalStrategyId, strategyDescriptors } from "../tests/benchmark/strategies";
import type { BenchmarkWorkerResult } from "../tests/benchmark/worker";
import { CANDIDATE_ORDERING_VERSION, DECISION_INDEX_SEMANTICS, deriveStrategySeed, RANDOM_ALGORITHM_VERSION, STRATEGY_SEED_DERIVATION_VERSION } from "../tests/benchmark/random";

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
    if (name === "paired") values.set(name, inline === undefined ? true : inline !== "false");
    else if (["resume", "skip-existing", "diagnostics"].includes(name)) values.set(name, true);
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
  if (batch !== undefined && selectedSeeds.length === 0) throw new Error("BATCH_EMPTY");
  const concurrency = integerValue(values, "concurrency", DEFAULTS.concurrency);
  if (concurrency < 1) throw new Error("CONCURRENCY_INVALID");
  const timeoutMs = integerValue(values, "timeout-ms", DEFAULTS.timeoutMs);
  if (timeoutMs < 1) throw new Error("TIMEOUT_INVALID");
  const replayMode = (stringValue(values, "replay") ?? DEFAULTS.replayMode) as BenchmarkCliOptions["replayMode"];
  if (!["none", "failures", "all"].includes(replayMode)) throw new Error("REPLAY_MODE_INVALID");
  return {
    strategyA: canonicalStrategyId(strategyA), strategyB: canonicalStrategyId(strategyB), seeds: [...new Set(selectedSeeds)].sort((a, b) => a - b),
    paired: values.get("paired") !== false,
    batch, resume: values.get("resume") === true, skipExisting: values.get("skip-existing") === true,
    output: stringValue(values, "output"), replayMode, diagnostics: values.get("diagnostics") === true,
    timeoutMs, concurrency, rank: (stringValue(values, "rank") ?? DEFAULTS.rank) as GameRank,
    benchmarkVersion: stringValue(values, "benchmark-version") ?? DEFAULTS.benchmarkVersion, replayMatch,
  };
}

export async function runBenchmark(input: Partial<BenchmarkCliOptions> & Pick<BenchmarkCliOptions, "strategyA" | "strategyB" | "seeds">): Promise<BenchmarkRunResult> {
  const options: BenchmarkCliOptions = {
    ...DEFAULTS, resume: false, skipExisting: false, diagnostics: false,
    ...input, paired: input.paired ?? true, seeds: [...new Set(input.seeds)].sort((a, b) => a - b),
  };
  const config: BenchmarkConfig = { benchmarkVersion: options.benchmarkVersion, rank: options.rank, seeds: options.seeds, strategyA: canonicalStrategyId(options.strategyA), strategyB: canonicalStrategyId(options.strategyB), replayMode: options.replayMode };
  const resolvedStrategyDescriptors = strategyDescriptors.map((descriptor) => ({ ...descriptor, sourceCommit: descriptor.sourceCommit.toLowerCase() === "unknown" ? ENGINE_VERSION.split("@").slice(1).join("@") : descriptor.sourceCommit }));
  const tasks = options.seeds.flatMap((seed) => buildGamesForSeed(config, seed)).filter((task) => options.paired || task.allocation === "AB");
  const configHash = tasks[0]?.configHash ?? hashConfig(config);
  const reused = loadExisting(options.output, configHash, options, tasks.map((task) => task.matchId), { engineVersion: ENGINE_VERSION, roomRulesVersion: ROOM_RULES_VERSION, strategyDescriptors: resolvedStrategyDescriptors });
  const existingById = new Map(reused.map((game) => [game.matchId, game]));
  const duplicate = reused.length !== existingById.size;
  if (duplicate) throw new Error("DUPLICATE_MATCH_ID");
  const expectedSet = new Set(tasks.map((task) => task.matchId));
  if (reused.some((game) => !expectedSet.has(game.matchId))) throw new Error("UNEXPECTED_MATCH_ID");
  const pending = tasks.filter((task) => !existingById.has(task.matchId));
  const fresh = await executeTasks(pending, options.concurrency, options.timeoutMs, options.diagnostics);
  const games = [...existingById.values(), ...fresh].sort((left, right) => left.matchId.localeCompare(right.matchId));
  const expected = tasks.map((task) => task.matchId).sort();
  for (const id of expected) if (!games.some((game) => game.matchId === id)) throw new Error(`MISSING_EXPECTED_MATCH_ID:${id}`);
  const manifest = createManifest(config, games, { expectedMatchIds: expected, engineVersion: ENGINE_VERSION, roomRulesVersion: ROOM_RULES_VERSION, strategyDescriptors: resolvedStrategyDescriptors });
  const metrics = games.map((game) => summarizeGame(game));
  const aggregate = aggregateTournament(metrics, config);
  const paired = { enabled: options.paired, unit: "seed", rotations: 4, allocations: options.paired ? 2 : 1, gamesPerSeed: options.paired ? 8 : 4 };
  const replayPaths = games.map((game) => writeReplay(game, {
    replayMode: options.replayMode,
    benchmarkVersion: config.benchmarkVersion,
    strategyDescriptors: resolvedStrategyDescriptors,
    engineVersion: ENGINE_VERSION,
    roomRulesVersion: ROOM_RULES_VERSION,
  }));
  const provenance = { engineVersion: ENGINE_VERSION, roomRulesVersion: ROOM_RULES_VERSION, strategyDescriptors: resolvedStrategyDescriptors };
  const reportInput = { config, games: metrics, aggregate, paired, replayPaths, provenance };
  const report = buildReport(reportInput, { outputPath: options.output, provenance });
  let outputPath: string | undefined;
  if (options.output !== undefined) {
    outputPath = writeReport(reportInput, options.output);
    const markdownPath = options.output.replace(/\.json$/i, ".md");
    writeMarkdownReport(reportInput, markdownPath);
  }
  if (options.output !== undefined) {
    const manifestPath = options.output.endsWith(".manifest.json") ? options.output : `${options.output}.manifest.json`;
    fs.mkdirSync(path.dirname(path.resolve(manifestPath)), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  return { config, configHash, games: metrics, report, manifest, outputPath };
}

async function executeTasks(tasks: BenchmarkGameTask[], concurrency: number, timeoutMs: number, diagnostics: boolean): Promise<SimulationSummary[]> {
  if (tasks.length === 0) return [];
  return executeWithWorkers(tasks, Math.min(Math.max(1, concurrency), tasks.length), timeoutMs, diagnostics);
}

export interface BenchmarkWorker {
  on(event: "message", listener: (message: BenchmarkWorkerResult) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "online", listener: () => void): this;
  postMessage(message: { task: BenchmarkGameTask; diagnostics: boolean }): void;
  terminate(): Promise<number>;
  removeAllListeners(): this;
}
export type BenchmarkWorkerFactory = () => BenchmarkWorker;

const createBenchmarkWorker: BenchmarkWorkerFactory = () => new Worker(
  pathToFileURL(path.resolve(process.cwd(), "tests/benchmark/worker.ts")),
  { execArgv: ["--import", "tsx/esm"] },
);

export function executeWithWorkers(
  tasks: BenchmarkGameTask[],
  count: number,
  timeoutMs: number,
  diagnostics: boolean,
  workerFactory: BenchmarkWorkerFactory = createBenchmarkWorker,
): Promise<SimulationSummary[]> {
  return new Promise((resolve, reject) => {
    const results: SimulationSummary[] = [];
    let cursor = 0;
    let finished = 0;
    let settled = false;
    let startupFailures = 0;
    type Slot = { worker: BenchmarkWorker; task?: BenchmarkGameTask; timer?: ReturnType<typeof setTimeout>; startedAt?: number; retired: boolean; termination?: Promise<void> };
    const slots: Slot[] = [];
    const terminateSlot = (slot: Slot): Promise<void> => {
      if (slot.termination) return slot.termination;
      slot.termination = (async () => {
        if (slot.timer) clearTimeout(slot.timer);
        slot.timer = undefined;
        try { await slot.worker.terminate(); } catch { /* worker already exited */ }
        slot.worker.removeAllListeners();
      })();
      return slot.termination;
    };
    const complete = () => {
      if (settled || finished !== tasks.length) return;
      settled = true;
      void Promise.all(slots.map((slot) => terminateSlot(slot))).then(() => resolve(results.sort((a, b) => a.matchId.localeCompare(b.matchId))));
    };
    const retire = (slot: Slot) => {
      slot.retired = true;
      slot.task = undefined;
      void terminateSlot(slot);
    };
    const dispatch = (slot: Slot) => {
      if (settled || slot.retired) return;
      const task = tasks[cursor++];
      if (task === undefined) return;
      slot.task = task;
      slot.startedAt = performance.now();
      slot.timer = setTimeout(() => {
        if (slot.task !== task || slot.retired) return;
        slot.task = undefined;
        results.push(timeoutSummary(task, elapsedSince(slot.startedAt), `BENCHMARK_TIMEOUT:${timeoutMs}`, diagnostics));
        finished += 1;
        retire(slot);
        if (cursor < tasks.length) addWorker();
        complete();
      }, timeoutMs);
      slot.worker.postMessage({ task: deepFreeze(task), diagnostics });
    };
    const handleResult = (slot: Slot, message: BenchmarkWorkerResult) => {
      const task = slot.task;
      if (slot.retired || task === undefined || task.matchId !== message.matchId) return;
      const elapsed = elapsedSince(slot.startedAt);
      if (slot.timer) clearTimeout(slot.timer);
      slot.timer = undefined;
      slot.task = undefined;
      slot.startedAt = undefined;
      results.push(message.type === "result" && message.result
        ? message.result
        : timeoutSummary(task, elapsed, message.error ?? "BENCHMARK_WORKER_ERROR", diagnostics));
      finished += 1;
      if (cursor < tasks.length) dispatch(slot); else retire(slot);
      complete();
    };
    const addWorker = () => {
      if (settled) return;
      const slot: Slot = { worker: workerFactory(), retired: false };
      slots.push(slot);
      slot.worker.on("message", (message: BenchmarkWorkerResult) => handleResult(slot, message));
      slot.worker.on("error", (error) => {
        if (settled || slot.retired) return;
        const task = slot.task;
        if (task === undefined) {
          retire(slot);
          if (cursor < tasks.length && startupFailures < count) {
            startupFailures += 1;
            addWorker();
            return;
          }
          if (cursor < tasks.length || slots.every((candidate) => candidate.retired)) {
            settled = true;
            void Promise.all(slots.map((candidate) => terminateSlot(candidate))).then(() => reject(error));
          }
          return;
        }
        if (slot.timer) clearTimeout(slot.timer);
        slot.timer = undefined;
        slot.task = undefined;
        results.push(timeoutSummary(task, elapsedSince(slot.startedAt), error.message, diagnostics));
        finished += 1;
        retire(slot);
        if (cursor < tasks.length) addWorker();
        complete();
      });
      slot.worker.on("online", () => dispatch(slot));
    };
    for (let index = 0; index < count; index += 1) addWorker();
  });
}

function timeoutSummary(task: BenchmarkGameTask, durationMs: number, error = "BENCHMARK_TIMEOUT", diagnostics = false): SimulationSummary {
  const strategiesBySeat = { 0: task.allocation === "AB" ? task.config.strategyA : task.config.strategyB, 1: task.allocation === "AB" ? task.config.strategyB : task.config.strategyA, 2: task.allocation === "AB" ? task.config.strategyA : task.config.strategyB, 3: task.allocation === "AB" ? task.config.strategyB : task.config.strategyA } as Record<Seat, string>;
  const failure: SimulationError = { seed: task.seed, seat: 0, strategy: strategiesBySeat[0], error };
  const counters: SafetyErrorCounters = { total: 1, strategyErrors: error.includes("UNKNOWN_STRATEGY") ? 1 : 0, runtimeErrors: 0, illegalActions: 0, engineErrors: error.includes("UNKNOWN_STRATEGY") ? 0 : 1, guardErrors: 0 };
  return { matchId: task.matchId, configHash: task.configHash, seed: task.seed, rank: task.config.rank, rotation: task.rotation, strategiesBySeat, finishOrder: [], winnerTeam: null, teamScore: { 0: 0, 1: 0 }, actionCount: 0, publicTraceHash: "", finalPublicStateHash: "", durationMs: Math.max(0.001, durationMs), completed: false, failed: true, errors: [failure], errorCounters: counters, publicEvents: [], diagnostics: diagnostics ? { enabled: true, decisionCount: 0, workerLocalToken: task.matchId } : undefined, randomProvenance: { randomAlgorithmVersion: RANDOM_ALGORITHM_VERSION, strategySeedDerivationVersion: STRATEGY_SEED_DERIVATION_VERSION, baseSeed: task.seed, perSeatDerivedSeed: Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, deriveStrategySeed(task.matchId, seat as Seat)])) as Record<Seat, string>, strategyVersionsBySeat: Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, strategyDescriptors.find((descriptor) => descriptor.id === strategiesBySeat[seat as Seat])?.implementationVersion ?? "unknown"])) as Record<Seat, string>, candidateOrderingVersion: CANDIDATE_ORDERING_VERSION, decisionIndexSemantics: DECISION_INDEX_SEMANTICS } };
}

function elapsedSince(startedAt: number | undefined): number { return startedAt === undefined ? 0.001 : Math.max(0.001, performance.now() - startedAt); }

function loadExisting(output: string | undefined, configHash: string, options: BenchmarkCliOptions, expectedIds: string[], provenance: { engineVersion: string; roomRulesVersion: string; strategyDescriptors: typeof strategyDescriptors }): Array<SimulationSummary> {
  if (!options.resume && !options.skipExisting) return [];
  if (output === undefined) throw new Error("MANIFEST_REQUIRED");
  const manifestPath = output.endsWith(".manifest.json") ? output : `${output}.manifest.json`;
  const source = fs.existsSync(manifestPath) ? manifestPath : output;
  if (!fs.existsSync(source)) throw new Error("MANIFEST_NOT_FOUND");
  const raw = JSON.parse(fs.readFileSync(source, "utf8")) as Partial<BatchManifest> & { games?: Array<SimulationSummary> };
  if (raw.configHash !== configHash) throw new Error("CONFIG_HASH_MISMATCH");
  if (raw.engineVersion !== provenance.engineVersion || raw.roomRulesVersion !== provenance.roomRulesVersion || canonicalJson(raw.strategyDescriptors ?? []) !== canonicalJson(provenance.strategyDescriptors)) throw new Error("PROVENANCE_MISMATCH");
  const games = (Array.isArray(raw.games) ? raw.games : []) as SimulationSummary[];
  const ids = new Set(games.map((game) => game.matchId));
  if (ids.size !== games.length) throw new Error("DUPLICATE_MATCH_ID");
  const expected = raw.expectedMatchIds ?? expectedIds;
  const completed = raw.completedMatchIds ?? games.filter((game) => game.completed === true && game.failed !== true).map((game) => game.matchId);
  if (completed.length !== new Set(completed).size) throw new Error("DUPLICATE_COMPLETED_MATCH_ID");
  if (completed.some((id) => !ids.has(id))) throw new Error(`UNEXPECTED_COMPLETED_MATCH_ID:${completed.find((id) => !ids.has(id))}`);
  if (completed.some((id) => !games.find((game) => game.matchId === id)?.completed || games.find((game) => game.matchId === id)?.failed)) throw new Error("INVALID_COMPLETED_MATCH_ID");
  if (expected.length !== new Set(expected).size) throw new Error("DUPLICATE_EXPECTED_MATCH_ID");
  if (expected.some((id) => !expectedIds.includes(id))) throw new Error("UNEXPECTED_MATCH_ID");
  if (expectedIds.some((id) => !expected.includes(id))) throw new Error(`MISSING_EXPECTED_MATCH_ID:${expectedIds.find((id) => !expected.includes(id))}`);
  if (expected.some((id) => !ids.has(id))) throw new Error(`MISSING_EXPECTED_MATCH_ID:${expected.find((id) => !ids.has(id))}`);
  if (games.some((game) => game.configHash !== configHash)) throw new Error("CONFIG_HASH_MISMATCH");
  const valid = games.filter((game) => isReusable(game, options, output));
  return valid;
}

function isReusable(game: SimulationSummary, options: BenchmarkCliOptions, output: string): boolean {
  const counters = game.errorCounters;
  if (game.completed !== true || game.failed !== false || counters === undefined || counters.total !== 0 || Object.values(counters).some((value) => typeof value !== "number" || value !== 0)) return false;
  if (typeof game.durationMs !== "number" || !Number.isFinite(game.durationMs) || game.durationMs <= 0 || typeof game.publicTraceHash !== "string" || game.publicTraceHash.length === 0 || typeof game.finalPublicStateHash !== "string" || game.finalPublicStateHash.length === 0) return false;
  if (options.replayMode !== "all") return true;
  const matchup = `${game.strategiesBySeat?.[0] ?? "A"}-vs-${game.strategiesBySeat?.[1] ?? "B"}`;
  const file = `${game.matchId.replace(/[\\/:*?"<>|]/g, "_")}.json`;
  const replayRoots = [path.resolve("artifacts", "ai-benchmark-replays"), path.join(path.dirname(path.resolve(output)), "ai-benchmark-replays")];
  return replayRoots.some((root) => fs.existsSync(path.join(root, matchup, file)));
}

function parseSeeds(value: string): number[] { return value.split(",").flatMap((part) => part.includes("-") ? range(parseRange(part)) : [parseIntStrict(part)]); }
function parseRange(value: string): { start: number; end: number } { const [a, b] = value.split("-").map(parseIntStrict); if (a === undefined || b === undefined || b < a) throw new Error("SEED_RANGE_INVALID"); return { start: a, end: b }; }
function range(rangeValue: { start: number; end: number }): number[] { return Array.from({ length: rangeValue.end - rangeValue.start + 1 }, (_, index) => rangeValue.start + index); }
function parseIntStrict(value: string | undefined): number { const parsed = Number(value); if (!Number.isInteger(parsed)) throw new Error("INTEGER_INVALID"); return parsed; }
function stringValue(values: Map<string, string | boolean>, key: string): string | undefined { const value = values.get(key); return typeof value === "string" ? value : undefined; }
function integerValue(values: Map<string, string | boolean>, key: string, fallback: number): number { const value = stringValue(values, key); return value === undefined ? fallback : parseIntStrict(value); }
function hashConfig(config: BenchmarkConfig): string { return sha256(canonicalJson({ benchmarkVersion: config.benchmarkVersion, rank: config.rank, strategyA: config.strategyA, strategyB: config.strategyB })).digest("hex"); }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
export function stripVolatile<T>(value: T): T { return JSON.parse(JSON.stringify(value, (key, current) => /duration|diagnostic|tim(e|ing)|worker|path|timestamp/i.test(key) ? undefined : current)); }

if (process.argv[1]?.endsWith("runAiBenchmark.ts")) {
  runBenchmark(parseBenchmarkArgs(process.argv.slice(2))).then((result) => { console.info(`AI benchmark: ${result.games.length} games`); }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
