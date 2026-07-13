import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildBenchmarkReportModel, renderReportMarkdown, serializeReportJson, type MatchupSource, type ReplayValidationSummary } from "../tests/benchmark/reportModel";
import type { GameSummary, StrategyDescriptor } from "../tests/benchmark/contracts";

const root = process.cwd();
const batchRanges = ["1-50", "51-100", "101-150", "151-200"];
const sourceDefinitions = [
  { key: "unified-current vs legal-greedy", strategyA: "unified-current", strategyB: "legal-greedy", files: batchRanges.map((range) => path.join(root, "artifacts", "ai-benchmark-batches", `formal-rerun-greedy-${range}.json.manifest.json`)) },
  { key: "unified-current vs legacy-reference", strategyA: "unified-current", strategyB: "legacy-reference", files: batchRanges.map((range) => path.join(root, "artifacts", "ai-benchmark-batches", `formal-rerun-legacy-${range}.json.manifest.json`)) },
  { key: "unified-current vs legal-random", strategyA: "unified-current", strategyB: "legal-random", files: batchRanges.map((range) => path.join(root, "artifacts", `ai-benchmark-d0-r1-random-${range}.json.manifest.json`)) },
] as const;

interface ManifestLike {
  configHash: string;
  benchmarkVersion: string;
  engineVersion: string;
  roomRulesVersion: string;
  strategyDescriptors: StrategyDescriptor[];
  expectedMatchIds: string[];
  completedMatchIds?: string[];
  games: GameSummary[];
}

export function freezeD0Benchmark(options: { generatedAt?: string } = {}): void {
  const replayValidationPath = path.join(root, "artifacts", "ai-benchmark-replay-validation-d0-r2.json");
  if (!fs.existsSync(replayValidationPath)) throw new Error("REPLAY_VALIDATION_SUMMARY_MISSING");
  const replayValidation = JSON.parse(fs.readFileSync(replayValidationPath, "utf8")) as Record<string, ReplayValidationSummary>;
  const sources = sourceDefinitions.map((definition) => loadSource(definition.files, definition.strategyA, definition.strategyB));
  const sourceCommit = readCommit();
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const model = buildBenchmarkReportModel({ benchmarkVersion: "d0-r2", rank: "2", replayMode: "failures", generatedAt, sourceCommit, roomRulesVersion: sources[0]!.roomRulesVersion, matchups: sources, replayValidation });
  const baselineJson = path.join(root, "artifacts", "ai-benchmark-baseline.json");
  const baselineMd = path.join(root, "artifacts", "ai-benchmark-baseline.md");
  const manifestPath = path.join(root, "artifacts", "ai-benchmark-manifest.json");
  atomicWrite(baselineJson, serializeReportJson(model));
  atomicWrite(baselineMd, renderReportMarkdown(model));
  atomicWrite(manifestPath, `${JSON.stringify(buildManifest(model, sources), null, 2)}\n`);
}

function loadSource(files: string[], strategyA: string, strategyB: string): MatchupSource {
  const manifests = files.map((file) => JSON.parse(fs.readFileSync(file, "utf8")) as ManifestLike);
  const first = manifests[0]!;
  return {
    strategyA, strategyB, configHash: first.configHash, benchmarkVersion: first.benchmarkVersion, engineVersion: first.engineVersion, roomRulesVersion: first.roomRulesVersion,
    strategyDescriptors: first.strategyDescriptors,
    games: manifests.flatMap((manifest) => manifest.games),
    expectedMatchIds: manifests.flatMap((manifest) => manifest.expectedMatchIds),
    completedMatchIds: manifests.flatMap((manifest) => manifest.completedMatchIds ?? manifest.games.map((game) => game.matchId)),
    batchConfigHashes: manifests.map((manifest) => manifest.configHash),
  };
}

function buildManifest(model: ReturnType<typeof buildBenchmarkReportModel>, sources: MatchupSource[]): Record<string, unknown> {
  const expectedMatchIds = sources.flatMap((source) => source.expectedMatchIds).sort();
  const completedMatchIds = sources.flatMap((source) => source.completedMatchIds).sort();
  return {
    schemaVersion: "2",
    manifestVersion: "d0-r2",
    generatedFrom: sourceDefinitions.flatMap((definition) => definition.files.map((file) => path.relative(root, file).replaceAll("\\", "/"))),
    configHash: model.configHash,
    benchmarkVersion: model.benchmarkVersion,
    generatedAt: model.generatedAt,
    sourceCommit: model.sourceCommit,
    roomRulesVersion: model.roomRulesVersion,
    expectedMatchIds,
    completedMatchIds,
    validation: model.manifestValidation,
    matchups: model.matchups.map((matchup) => ({ strategyA: matchup.strategyA, strategyB: matchup.strategyB, configHash: matchup.configHash, baseSeedCount: matchup.baseSeedCount, rawGameCount: matchup.rawGameCount, pairedUnitCount: matchup.pairedUnitCount })),
  };
}

function atomicWrite(destination: string, content: string): void {
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, "utf8");
  fs.renameSync(temporary, destination);
}

function readCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

if (process.argv[1]?.endsWith("freezeAiBenchmark.ts")) {
  const generatedAt = process.argv.find((argument) => argument.startsWith("--generated-at="))?.slice("--generated-at=".length);
  try { freezeD0Benchmark({ generatedAt }); console.info("D0 baseline frozen artifacts generated"); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
