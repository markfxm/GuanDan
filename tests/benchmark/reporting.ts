import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { BenchmarkConfig, BenchmarkProvenance, GameSummary, RandomReplayProvenance, ReplayDocument, StrategyDescriptor } from "./contracts";
import { canonicalJson } from "./contracts";
import type { SimulationSummary } from "./simulator";
import { CANDIDATE_ORDERING_VERSION, DECISION_INDEX_SEMANTICS, deriveStrategySeed, RANDOM_ALGORITHM_VERSION, STRATEGY_SEED_DERIVATION_VERSION } from "./random";

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
  provenance?: Partial<BenchmarkProvenance>;
}

export interface ReportOptions {
  outputPath?: string;
  provenance?: Partial<BenchmarkProvenance>;
}

export interface BatchManifest {
  schemaVersion: "1";
  manifestVersion: "d0-v1";
  configHash: string;
  benchmarkVersion: string;
  engineVersion: string;
  roomRulesVersion: string;
  strategyDescriptors: StrategyDescriptor[];
  seedStart?: number;
  seedEnd?: number;
  expectedMatchIds: string[];
  completedMatchIds: string[];
  games: Array<GameSummary | SimulationSummary>;
  publicTraceHashes: Record<string, string>;
  finalPublicStateHashes: Record<string, string>;
}

const PACKAGE_VERSION = readPackageVersion();
const SOURCE_COMMIT = readSourceCommit();
export const ENGINE_VERSION = `${PACKAGE_VERSION}@${SOURCE_COMMIT}`;
export const ROOM_RULES_VERSION = sha256(canonicalJson({
  schema: "guandan-room-rules-v1",
  rankProgression: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"],
  seats: [0, 1, 2, 3],
  settlement: "settleRound-v1",
}));

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
  assertMeasuredDuration(summary);
  const provenance = resolveProvenance(summary, options);
  const matchup = `${summary.strategiesBySeat[0] ?? "A"}-vs-${summary.strategiesBySeat[1] ?? "B"}`;
  const destination = path.join(outputDir, matchup, `${safeFileName(summary.matchId)}.json`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const document: ReplayDocument = {
    schemaVersion: options.benchmarkVersion === "d0-r1" ? "2" : "1",
    replayVersion: options.replayVersion ?? options.benchmarkVersion ?? "d0-v1",
    benchmarkVersion: options.benchmarkVersion ?? "d0-v1",
    engineVersion: provenance.engineVersion,
    roomRulesVersion: provenance.roomRulesVersion,
    configHash: summary.configHash,
    matchId: summary.matchId,
    seed: summary.seed,
    rank: summary.rank,
    rotation: summary.rotation,
    strategiesBySeat: orderedSeatMap(summary.strategiesBySeat),
    strategyDescriptors: provenance.strategyDescriptors,
    deterministicRandom: randomProvenance(summary, provenance.strategyDescriptors),
    publicEvents: Array.isArray((summary as Partial<SimulationSummary>).publicEvents)
      ? normalizePublic((summary as Partial<SimulationSummary>).publicEvents) as ReplayDocument["publicEvents"]
      : [],
    finishOrder: [...summary.finishOrder],
    winnerTeam: summary.winnerTeam,
    teamScore: { 0: summary.teamScore[0], 1: summary.teamScore[1] },
    replayMode: mode,
    actionCount: summary.actionCount,
    publicTraceHash: summary.publicTraceHash,
    finalPublicStateHash: summary.finalPublicStateHash,
    durationMs: summary.durationMs,
  };
  fs.writeFileSync(destination, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return destination;
}

function randomProvenance(summary: SimulationSummary | (GameSummary & Partial<SimulationSummary>), descriptors: StrategyDescriptor[]): RandomReplayProvenance {
  const existing = "randomProvenance" in summary ? summary.randomProvenance : undefined;
  if (existing !== undefined) return existing;
  const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  return {
    randomAlgorithmVersion: RANDOM_ALGORITHM_VERSION,
    strategySeedDerivationVersion: STRATEGY_SEED_DERIVATION_VERSION,
    baseSeed: summary.seed,
    perSeatDerivedSeed: Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, deriveStrategySeed(summary.matchId, seat as 0 | 1 | 2 | 3)])) as Record<0 | 1 | 2 | 3, string>,
    strategyVersionsBySeat: Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, byId.get(summary.strategiesBySeat[seat as 0 | 1 | 2 | 3])?.implementationVersion ?? "unknown"])) as Record<0 | 1 | 2 | 3, string>,
    candidateOrderingVersion: CANDIDATE_ORDERING_VERSION,
    decisionIndexSemantics: DECISION_INDEX_SEMANTICS,
  };
}

export function buildReport(input: ReportInput, options: ReportOptions = {}): Record<string, unknown> {
  const reportConfig = canonicalConfig(input.config);
  const expectedConfigHash = configHash(reportConfig);
  if (input.games.some((game) => game.configHash !== expectedConfigHash)) throw new Error("CONFIG_HASH_MISMATCH");
  input.games.forEach(assertMeasuredDuration);
  const provenance = resolveProvenance(input.games[0]!, { ...options.provenance, ...(input.provenance ?? {}) });
  const outputDir = options.outputPath === undefined ? undefined : path.dirname(path.resolve(options.outputPath));
  const games = input.games.map((game, index) => {
    const compact = compactSummary(game);
    const replayPath = input.replayPaths?.[index];
    if (replayPath !== undefined) compact.replayPath = outputDir === undefined || !path.isAbsolute(replayPath)
      ? replayPath.replaceAll("\\", "/")
      : path.relative(outputDir, replayPath).replaceAll("\\", "/");
    return compact;
  });
  const report: Record<string, unknown> = {
    schemaVersion: "1",
    reportVersion: "d0-v1",
    benchmarkVersion: reportConfig.benchmarkVersion,
    config: reportConfig,
    configHash: expectedConfigHash,
    provenance,
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
  options: { expectedMatchIds?: string[]; engineVersion?: string; roomRulesVersion?: string; strategyDescriptors?: StrategyDescriptor[] } = {},
): BatchManifest {
  const manifestConfig = canonicalConfig(config);
  const configHashValue = configHash(manifestConfig);
  if (games.some((game) => game.configHash !== configHashValue)) throw new Error("CONFIG_HASH_MISMATCH");
  games.forEach(assertMeasuredDuration);
  const provenance = resolveProvenance(games[0], options);
  const ids = [...new Set(options.expectedMatchIds ?? games.map((game) => game.matchId))].sort();
  const completedMatchIds = games.filter(isCompletedGame).map((game) => game.matchId).sort();
  const seeds = games.map((game) => game.seed);
  return {
    schemaVersion: "1",
    manifestVersion: "d0-v1",
    configHash: configHashValue,
    benchmarkVersion: manifestConfig.benchmarkVersion,
    engineVersion: provenance.engineVersion,
    roomRulesVersion: provenance.roomRulesVersion,
    strategyDescriptors: provenance.strategyDescriptors,
    seedStart: seeds.length === 0 ? undefined : Math.min(...seeds),
    seedEnd: seeds.length === 0 ? undefined : Math.max(...seeds),
    expectedMatchIds: ids,
    completedMatchIds,
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
  const completed = new Set<string>();
  for (const batch of batches) {
    if (batch.configHash !== configHashValue) throw new Error("CONFIG_HASH_MISMATCH");
    if (batch.benchmarkVersion !== batches[0]!.benchmarkVersion) throw new Error("BENCHMARK_VERSION_MISMATCH");
    if (batch.engineVersion !== batches[0]!.engineVersion || batch.roomRulesVersion !== batches[0]!.roomRulesVersion) throw new Error("PROVENANCE_MISMATCH");
    if (canonicalJson(batch.strategyDescriptors ?? []) !== descriptorKey) throw new Error("STRATEGY_DESCRIPTORS_MISMATCH");
    const actual = new Set(batch.games.map((game) => game.matchId));
    const batchCompleted = batch.completedMatchIds ?? batch.games.filter(isCompletedGame).map((game) => game.matchId);
    if (batchCompleted.length !== new Set(batchCompleted).size) throw new Error("DUPLICATE_COMPLETED_MATCH_ID");
    for (const id of batchCompleted) {
      if (!actual.has(id)) throw new Error(`UNEXPECTED_COMPLETED_MATCH_ID:${id}`);
      completed.add(id);
    }
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
    engineVersion: batches[0]!.engineVersion,
    roomRulesVersion: batches[0]!.roomRulesVersion,
    strategyDescriptors: batches[0]!.strategyDescriptors,
    seedStart: Math.min(...seeds),
    seedEnd: Math.max(...seeds),
    expectedMatchIds: [...new Set([...expected, ...sorted.map((game) => game.matchId)])].sort(),
    completedMatchIds: [...completed].sort(),
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

function isCompletedGame(game: GameSummary | SimulationSummary): game is SimulationSummary {
  return "completed" in game && game.completed === true && game.failed !== true;
}

const REPORT_SUMMARY_KEYS = [
  "matchId", "configHash", "seed", "rank", "rotation", "strategiesBySeat", "finishOrder", "winnerTeam", "teamScore",
  "actionCount", "publicTraceHash", "finalPublicStateHash", "teamPlacementScore", "placementByTeam", "advancementProxy",
  "settlementOutcome", "levelStep", "individualDiagnosticScore", "playPassRatio", "bombCount", "bombs", "planContinuation",
  "planContinuationActions", "finalTenActions", "finalTenCardActions", "durationMs", "categoryTags",
  "classification", "errorCounters", "seatDealLimitations", "completed", "failed", "errors", "replayPath",
] as const;

/** Render the compact benchmark report as an auditable human-readable summary. */
export function buildMarkdownReport(input: ReportInput): string {
  const report = buildReport(input);
  const aggregate = (report.aggregate ?? {}) as Record<string, any>;
  const provenance = report.provenance as BenchmarkProvenance;
  const games = report.games as Array<Record<string, any>>;
  const lines = [
    "# D0 AI benchmark baseline",
    "",
    "## Purpose",
    "",
    "Measure seeded, paired AI strategy outcomes in the real Guandan room while preserving public-only hashes and auditable provenance.",
    "",
    "## Strategy descriptors and policies",
    "",
    ...provenance.strategyDescriptors.map((descriptor) => `- **${descriptor.id}** — implementation ${descriptor.implementationVersion}; policy ${descriptor.candidatePolicy}; config ${descriptor.configHash}; source ${descriptor.sourceCommit}`),
    `- Engine: ${provenance.engineVersion}`,
    `- Room rules fingerprint: ${provenance.roomRulesVersion}`,
    "",
    "## Sample and fairness",
    "",
    `- Raw games: ${games.length}; base seeds: ${aggregate.baseSeeds ?? "n/a"}; paired rotation units: ${aggregate.pairedRotationUnits ?? "n/a"}.`,
    "- Each base seed uses four seat rotations and both AB/BA allocations; seeded deals and seat rotation are controlled by the harness.",
    "",
    "## Wins, rates, scores, confidence intervals, significance, and Elo",
    "",
    `- Wins A/B/unresolved: ${aggregate.winsA ?? "n/a"}/${aggregate.winsB ?? "n/a"}/${aggregate.unresolved ?? "n/a"}; rates: ${formatNumber(aggregate.winRateA)}/${formatNumber(aggregate.winRateB)}.`,
    `- Scores A/B/difference: ${aggregate.scoreA ?? "n/a"}/${aggregate.scoreB ?? "n/a"}/${formatNumber(aggregate.scoreDifference)}.`,
    `- Score CI: ${formatInterval(aggregate.scoreDifferenceCI)}; win-rate CI: ${formatInterval(aggregate.winRateCI)}; paired score-difference CI: ${formatInterval(aggregate.pairedScoreDifferenceCI)}; paired win-rate CI: ${formatInterval(aggregate.pairedWinRateCI)}; statistically significant: ${aggregate.statisticallySignificant ?? "n/a"}.`,
    `- Elo: ${aggregate.elo ? `initial ${aggregate.elo.initialRating}, K ${aggregate.elo.kFactor}, delta ${formatNumber(aggregate.elo.delta)} (${aggregate.elo.version})` : "n/a"}.`,
    "",
    "## Exploratory classifications",
    "",
    `- Classifications are post-game exploratory tags only: ${JSON.stringify(aggregate.classifications?.tags ?? {})}.`,
    "",
    "## Performance",
    "",
    `- Duration mean/median/p95 (ms): ${formatNumber(aggregate.duration?.mean)}/${formatNumber(aggregate.duration?.median)}/${formatNumber(aggregate.duration?.p95)}; error rate: ${formatNumber(aggregate.errorRate)}.`,
    "",
    "## Anomalies",
    "",
    `- Failed or safety-error games: ${games.filter((game) => game.failed || (game.errorCounters?.total ?? 0) > 0).length}.`,
    "",
    "## Conclusions and limitations",
    "",
    "Results describe this seeded single-round proxy and are not a causal claim about general play strength. Confidence intervals and exploratory classifications should be read with the paired design and seat/deal limitations in mind.",
    "",
  ];
  return lines.join("\n");
}

export function writeMarkdownReport(input: ReportInput, outputPath = path.join("artifacts", "ai-benchmark-report.md")): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildMarkdownReport(input), "utf8");
  return outputPath;
}

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

function resolveProvenance(summary: GameSummary | undefined, options: ReplayOptions = {}): BenchmarkProvenance {
  if (!validProvenanceValue(options.engineVersion) || !validProvenanceValue(options.roomRulesVersion) || !options.strategyDescriptors || options.strategyDescriptors.length === 0) {
    throw new Error("PROVENANCE_MISSING");
  }
  if (!/^[a-f0-9]{64}$/.test(options.roomRulesVersion)) throw new Error("ROOM_RULES_VERSION_INVALID");
  for (const descriptor of options.strategyDescriptors) {
    if (!validProvenanceValue(descriptor.id) || !validProvenanceValue(descriptor.implementationVersion) || !validProvenanceValue(descriptor.configHash) || !validProvenanceValue(descriptor.sourceCommit) || !["legal-only", "production-policy"].includes(descriptor.candidatePolicy)) {
      throw new Error("STRATEGY_DESCRIPTOR_INVALID");
    }
  }
  return {
    engineVersion: options.engineVersion!,
    roomRulesVersion: options.roomRulesVersion!,
    strategyDescriptors: options.strategyDescriptors.map((descriptor) => ({ ...descriptor })),
  };
}

function assertMeasuredDuration(game: GameSummary): void {
  if (typeof game.durationMs !== "number" || !Number.isFinite(game.durationMs) || game.durationMs <= 0) throw new Error("DURATION_INVALID");
}
const assertMeasuredDurations = assertMeasuredDuration;
function validProvenanceValue(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.toLowerCase() !== "unknown"; }
function readPackageVersion(): string {
  try { const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8")) as { version?: string }; if (validProvenanceValue(packageJson.version)) return packageJson.version!; } catch { /* use deterministic fallback */ }
  return "0.0.0";
}
function readSourceCommit(): string {
  if (validProvenanceValue(process.env.GIT_COMMIT)) return process.env.GIT_COMMIT!;
  try { const value = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); if (validProvenanceValue(value)) return value; } catch { /* use deterministic fallback */ }
  return "working-tree";
}
function formatNumber(value: unknown): string { return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a"; }
function formatInterval(value: unknown): string { return Array.isArray(value) && value.length >= 2 ? `[${formatNumber(value[0])}, ${formatNumber(value[1])}]` : "n/a"; }

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
  return sha256(canonicalJson({ benchmarkVersion: config.benchmarkVersion, rank: config.rank, strategyA: config.strategyA, strategyB: config.strategyB }));
}

function canonicalConfig(config: BenchmarkConfig): BenchmarkConfig {
  return { ...config, strategyA: canonicalStrategyId(config.strategyA), strategyB: canonicalStrategyId(config.strategyB) };
}

function canonicalStrategyId(id: string): string {
  return id === "deterministic-random" ? "legal-random" : id === "simple-greedy" ? "legal-greedy" : id;
}

function sha256(value: string): string { return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex"); }
function safeFileName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, "_"); }
function isRecord(value: unknown): value is Record<string, any> { return value !== null && typeof value === "object" && !Array.isArray(value); }
