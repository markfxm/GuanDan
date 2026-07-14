import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildGamesForSeed } from "../tests/benchmark/rotations";
import { buildD1Manifest } from "../tests/benchmark/d1Manifest";
import { buildD1Matrix, expectedMatchId, formalBatchPlan, phasePlan, type D1Allocation, type D1Phase } from "../tests/benchmark/d1Matrix";
import { simulateGame } from "../tests/benchmark/simulator";
import { ENGINE_VERSION, ROOM_RULES_VERSION } from "../tests/benchmark/reporting";
import { writeD1Replay } from "../tests/benchmark/d1ReplayValidation";
import { strategyDescriptors } from "../tests/benchmark/strategies";
import { validateFormalApproval, computeApprovedCodeTreeHash, type FormalApproval } from "../tests/benchmark/d1Calibration";
import { AtomicD1Writer } from "../tests/benchmark/d1AtomicWriter";

export interface D1RunnerOptions { phase: D1Phase; matchup?: string; seedStart?: number; seedEnd?: number; replayMode?: "none" | "failures" | "all"; resume: boolean; skipExisting: boolean; concurrency: number; dryRun: boolean; outputDir: string; configHash: string; help?: boolean; approval?: FormalApproval; }
export interface D1DryRunMatchupSummary { matchup: string; seedStart: number; seedEnd: number; baseSeeds: number; rawGames: number; pairedUnits: number; batchCount: number; replayMode: "failures" | "all"; }
export interface D1DryRunOutput {
  schemaVersion: "d1-benchmark-dry-run-v1";
  dryRun: true;
  normalizedArgs: { matchup: string | null; seedStart: number; seedEnd: number; replayMode: "failures" | "all"; outputDir: string; concurrency: number; resume: boolean; skipExisting: boolean; dryRun: true };
  seedSummary: { start: number; end: number; baseSeedCount: number; placementsPerSeed: 2; rotationsPerPlacement: 4; rawGamesPerSeed: 8; pairedUnitsPerSeed: 4 };
  matchups: D1DryRunMatchupSummary[];
  totals: { matchups: number; baseSeedMatchupBlocks: number; rawGames: number; pairedUnits: number; batches: number; expectedMatchIds: number };
  configHash: string;
  expectedMatchIdsHash: string;
}

type D1ValueKey = "phase" | "matchup" | "seed-start" | "seed-end" | "replay-mode" | "replay" | "concurrency" | "output-dir" | "output" | "config-hash";
const D1_BOOLEAN_FLAGS = new Set(["resume", "skip-existing", "dry-run", "help"]);
const D1_VALUE_KEYS = new Set<D1ValueKey>(["phase", "matchup", "seed-start", "seed-end", "replay-mode", "replay", "concurrency", "output-dir", "output", "config-hash"]);

export function parseD1Args(args: string[]): D1RunnerOptions {
  const values = new Map<string, { value: string; source: string }>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i]!;
    if (!token.startsWith("--") || token === "--") throw new Error("ARGUMENT_INVALID");
    const raw = token.slice(2);
    const equalsIndex = raw.indexOf("=");
    const key = equalsIndex === -1 ? raw : raw.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : raw.slice(equalsIndex + 1);
    if (D1_BOOLEAN_FLAGS.has(key)) {
      if (inlineValue !== undefined) throw new Error(`ARGUMENT_VALUE_NOT_ALLOWED:${key}`);
      flags.add(key);
      continue;
    }
    if (!D1_VALUE_KEYS.has(key as D1ValueKey)) throw new Error(`UNKNOWN_ARGUMENT:${key}`);
    const value = inlineValue ?? args[++i];
    if (value === undefined || (inlineValue === undefined && value.startsWith("--"))) throw new Error(`ARGUMENT_MISSING:${key}`);
    const canonical = key === "replay" ? "replay-mode" : key === "output" ? "output-dir" : key;
    const previous = values.get(canonical);
    if (previous !== undefined && previous.value !== value) throw new Error(`ARGUMENT_CONFLICT:${previous.source},${key}`);
    if (previous === undefined) values.set(canonical, { value, source: key });
  }

  const phase = (values.get("phase")?.value ?? "smoke") as D1Phase;
  if (!["smoke", "calibration", "formal"].includes(phase)) throw new Error("PHASE_INVALID");
  const concurrencyText = values.get("concurrency")?.value ?? "1";
  const concurrency = Number(concurrencyText);
  if (!Number.isInteger(concurrency) || concurrency <= 0) throw new Error("CONCURRENCY_INVALID");
  if (concurrency !== 1) throw new Error("CONCURRENCY_UNSUPPORTED_UNTIL_WORKER_IMPLEMENTED");
  const plan = phasePlan(phase);
  const startText = values.get("seed-start")?.value;
  const endText = values.get("seed-end")?.value;
  const start = startText === undefined ? plan.start : Number(startText);
  const end = endText === undefined ? plan.end : Number(endText);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < plan.start || end > plan.end || start > end) throw new Error("SEED_RANGE_INVALID");
  const replayMode = (values.get("replay-mode")?.value ?? plan.replayMode) as "failures" | "all";
  if (!["failures", "all"].includes(replayMode)) throw new Error("REPLAY_MODE_INVALID");
  if (phase === "formal" && replayMode !== "all") throw new Error("FORMAL_REPLAY_MODE_MUST_BE_ALL");
  const outputDir = normalizeD1OutputDir(values.get("output-dir")?.value ?? "artifacts/d1-topk");
  const configHash = values.get("config-hash")?.value ?? "d1-config-unfrozen";
  if (configHash.length === 0) throw new Error("CONFIG_HASH_INVALID");
  return { phase, matchup: values.get("matchup")?.value, seedStart: start, seedEnd: end, replayMode, resume: flags.has("resume"), skipExisting: flags.has("skip-existing"), concurrency, dryRun: flags.has("dry-run"), outputDir, configHash, help: flags.has("help"), approval: undefined };
}

function normalizeD1OutputDir(outputDir: string): string {
  if (outputDir.length === 0 || outputDir.includes("\0")) throw new Error("OUTPUT_DIR_INVALID");
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, outputDir);
  const forbidden = [
    path.resolve(root, "artifacts/ai-benchmark-baseline"),
    path.resolve(root, "artifacts/ai-benchmark-baseline.json"),
    path.resolve(root, "artifacts/ai-benchmark-baseline.md"),
    path.resolve(root, "artifacts/ai-benchmark-manifest.json"),
  ];
  if (forbidden.some((root) => {
    const relative = path.relative(root, resolved);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  })) throw new Error("OUTPUT_DIR_UNSAFE");
  const relative = path.relative(root, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("OUTPUT_DIR_INVALID");
  return relative.replaceAll("\\", "/");
}

export const D1_CLI_USAGE = "Usage: runD1TopKBenchmark --phase smoke|calibration|formal --replay-mode failures|all --output-dir <path> --concurrency 1 [--resume] [--skip-existing] [--dry-run]";

export function planD1Run(options: D1RunnerOptions): { phase: D1Phase; expectedMatchIds: string[]; rawGames: number; pairedUnits: number; batches: ReturnType<typeof formalBatchPlan> } {
  const matrix = buildD1Matrix({ benchmarkVersion: "d1-topk-v1", rank: "2", configHash: options.configHash }); const matchups = options.matchup === undefined ? matrix.matchups : matrix.matchups.filter((matchup) => matchup.name === options.matchup);
  if (matchups.length === 0) throw new Error("MATCHUP_INVALID"); const expectedMatchIds: string[] = [];
  for (const matchup of matchups) for (let seed = options.seedStart!; seed <= options.seedEnd!; seed += 1) for (const allocation of ["AB", "BA"] as const) for (const rotation of [0, 1, 2, 3] as const) expectedMatchIds.push(expectedMatchId({ matchup: matchup.name, seed, allocation, rotation, configHash: options.configHash }));
  return { phase: options.phase, expectedMatchIds: expectedMatchIds.sort(), rawGames: expectedMatchIds.length, pairedUnits: expectedMatchIds.length / 2, batches: options.phase === "formal" ? formalBatchPlan(options.configHash).filter((batch) => options.matchup === undefined || batch.matchup === options.matchup) : [] };
}

export function buildD1DryRunOutput(options: D1RunnerOptions): D1DryRunOutput {
  const plan = planD1Run(options);
  const matrix = buildD1Matrix({ benchmarkVersion: "d1-topk-v1", rank: "2", configHash: options.configHash });
  const matchups = options.matchup === undefined ? matrix.matchups : matrix.matchups.filter((matchup) => matchup.name === options.matchup);
  const seedStart = options.seedStart!;
  const seedEnd = options.seedEnd!;
  const baseSeeds = seedEnd - seedStart + 1;
  const replayMode = options.replayMode ?? phasePlan(options.phase).replayMode;
  if (replayMode !== "failures" && replayMode !== "all") throw new Error("REPLAY_MODE_INVALID");
  const summaries = matchups.map((matchup) => ({
    matchup: matchup.name,
    seedStart,
    seedEnd,
    baseSeeds,
    rawGames: baseSeeds * 8,
    pairedUnits: baseSeeds * 4,
    batchCount: options.phase === "formal"
      ? formalBatchPlan(options.configHash).filter((batch) => batch.matchup === matchup.name && batch.seedEnd >= seedStart && batch.seedStart <= seedEnd).length
      : 1,
    replayMode,
  }));
  return {
    schemaVersion: "d1-benchmark-dry-run-v1",
    dryRun: true,
    normalizedArgs: { matchup: options.matchup ?? null, seedStart, seedEnd, replayMode, outputDir: options.outputDir, concurrency: options.concurrency, resume: options.resume, skipExisting: options.skipExisting, dryRun: true },
    seedSummary: { start: seedStart, end: seedEnd, baseSeedCount: baseSeeds, placementsPerSeed: 2, rotationsPerPlacement: 4, rawGamesPerSeed: 8, pairedUnitsPerSeed: 4 },
    matchups: summaries,
    totals: { matchups: summaries.length, baseSeedMatchupBlocks: baseSeeds * summaries.length, rawGames: plan.rawGames, pairedUnits: plan.pairedUnits, batches: summaries.reduce((total, matchup) => total + matchup.batchCount, 0), expectedMatchIds: plan.expectedMatchIds.length },
    configHash: options.configHash,
    expectedMatchIdsHash: createHash("sha256").update(`${plan.expectedMatchIds.join("\n")}\n`).digest("hex"),
  };
}

export async function runD1(options: D1RunnerOptions): Promise<{ dryRun: boolean; plan: ReturnType<typeof planD1Run>; dryRunOutput?: D1DryRunOutput; manifest?: unknown }> {
  const plan = planD1Run(options); if (options.dryRun) return { dryRun: true, plan, dryRunOutput: buildD1DryRunOutput(options) };
  if (options.phase === "formal" && options.configHash === "d1-config-unfrozen") throw new Error("FORMAL_CONFIG_NOT_FROZEN");
  if (options.phase === "formal") { const approval = validateFormalApproval(options.approval, { expectedConfigHash: options.configHash, currentCommit: process.env.GIT_COMMIT ?? "unknown", currentTreeHash: computeApprovedCodeTreeHash(), }); if (approval.formalExecutionAllowed !== true) throw new Error("FORMAL_EXECUTION_NOT_ALLOWED"); }
  await fs.mkdir(options.outputDir, { recursive: true });
  const matrix = buildD1Matrix({ benchmarkVersion: "d1-topk-v1", rank: "2", configHash: options.configHash }); const matchups = options.matchup === undefined ? matrix.matchups : matrix.matchups.filter((candidate) => candidate.name === options.matchup); let lastManifest: unknown;
  const ranges = options.phase === "formal" ? formalBatchPlan(options.configHash).filter((batch) => options.matchup === undefined || batch.matchup === options.matchup).map((batch) => ({ matchup: matchups.find((candidate) => candidate.name === batch.matchup)!, start: Math.max(batch.seedStart, options.seedStart!), end: Math.min(batch.seedEnd, options.seedEnd!), batchId: batch.batchId })) : matchups.map((matchup) => ({ matchup, start: options.seedStart!, end: options.seedEnd!, batchId: `${options.phase}/${matchup.name}/${options.seedStart}-${options.seedEnd}/${options.configHash}` }));
  const writer = new AtomicD1Writer({ write: async (file, value) => { await fs.writeFile(file, value, "utf8"); }, rename: async (from, to) => { await fs.rename(from, to); }, remove: async (file) => { await fs.rm(file, { force: true }); } }, (json) => { JSON.parse(json); });
  for (const range of ranges) { if (range.start > range.end) continue; const expected = expectedIdsForRange(range.matchup.name, range.start, range.end, options.configHash); const batchPath = path.join(options.outputDir, `${safeName(range.batchId)}.json`); const manifestPath = `${batchPath}.manifest.json`; if (options.resume) { try { const previous = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { configHash?: string; expectedMatchIds?: string[]; completedMatchIds?: string[] }; if (previous.configHash !== options.configHash) throw new Error("CONFIG_HASH_MISMATCH"); if (JSON.stringify(previous.expectedMatchIds ?? []) !== JSON.stringify(expected)) throw new Error("EXPECTED_MATCH_IDS_MISMATCH"); if (options.skipExisting && (previous.completedMatchIds ?? []).length === expected.length) { lastManifest = previous; continue; } } catch (error) { if (error instanceof Error && error.message === "CONFIG_HASH_MISMATCH") throw error; } } const batch = await runBatch(range.matchup, range.start, range.end, options); const manifest = buildD1Manifest({ phase: options.phase, matchup: range.matchup.name, batchId: range.batchId, configHash: options.configHash, expectedMatchIds: expected, completedMatchIds: batch.games.filter((game) => game.completed && !game.failed).map((game) => game.matchId), failedMatchIds: batch.games.filter((game) => game.failed).map((game) => game.matchId), expectedRawGames: expected.length, completedRawGames: batch.games.length, expectedPairedUnits: expected.length / 2, completedPairedUnits: Math.floor(batch.games.length / 2), implementationVersion: "dynamic-topk-v1", executionSourceCommit: process.env.GIT_COMMIT ?? "unknown", replayMode: options.replayMode }); await writer.writeBatch(batchPath, `${JSON.stringify(batch.games, null, 2)}\n`, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`); lastManifest = manifest; }
  return { dryRun: false, plan, manifest: lastManifest };
}

async function runBatch(matchup: { name: string; strategyA: string; strategyB: string }, start: number, end: number, options: D1RunnerOptions): Promise<{ games: ReturnType<typeof simulateGame>[] }> { const games: ReturnType<typeof simulateGame>[] = []; for (let seed = start; seed <= end; seed += 1) { const config = { benchmarkVersion: "d1-topk-v1", rank: "2" as const, seeds: [seed], strategyA: matchup.strategyA, strategyB: matchup.strategyB, replayMode: options.replayMode! }; for (const originalTask of buildGamesForSeed(config, seed)) { const task = { ...originalTask, configHash: options.configHash, matchId: expectedMatchId({ matchup: matchup.name, seed, allocation: originalTask.allocation, rotation: originalTask.rotation, configHash: options.configHash }) }; const result = simulateGame(task); games.push(result); if (options.replayMode === "all" || (options.replayMode === "failures" && result.failed)) writeD1Replay(result, path.join(options.outputDir, "replays", matchup.name), { benchmarkVersion: "d1-topk-v1", replayVersion: "d1-replay-v1", engineVersion: ENGINE_VERSION, roomRulesVersion: ROOM_RULES_VERSION, strategyDescriptors }); } } return { games }; }
function safeName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, "_"); }
function expectedIdsForRange(matchup: string, start: number, end: number, configHash: string): string[] { const ids: string[] = []; for (let seed = start; seed <= end; seed += 1) for (const allocation of ["AB", "BA"] as const) for (const rotation of [0, 1, 2, 3] as const) ids.push(expectedMatchId({ matchup, seed, allocation, rotation, configHash })); return ids.sort(); }

if (process.argv[1]?.endsWith("runD1TopKBenchmark.ts")) {
  try {
    const options = parseD1Args(process.argv.slice(2));
    if (options.help) console.log(D1_CLI_USAGE);
    else runD1(options).then((result) => { if (result.dryRun) console.log(JSON.stringify(result.dryRunOutput, null, 2)); }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
