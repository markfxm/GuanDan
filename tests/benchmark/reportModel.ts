import { createHash } from "node:crypto";
import type { GameRank } from "../../src/engine/cards";
import type { Seat } from "../../src/game/room";
import type { BenchmarkConfig, GameSummary, StrategyDescriptor } from "./contracts";

export interface ReplayValidationSummary {
  replayFilesExpected: number;
  replayFilesFound: number;
  replayFilesVerified: number;
  hashVerified: number;
  versionVerified: number;
  hiddenStateLeakCount: number;
  randomReplayVerified: number;
  greedyReplayVerified: number;
  legacyReplayVerified: number;
  sampledReplayVerification: { method: "sampled" | "full"; expected: number; verified: number };
}

export interface ManifestValidationSummary {
  expectedMatchIds: number;
  completedMatchIds: number;
  duplicate: number;
  missing: number;
  unknown: number;
  configHashConsistent: boolean;
  provenanceMissing: number;
  nonPositiveDuration: number;
}

export interface MatchupSource {
  strategyA: string;
  strategyB: string;
  configHash: string;
  benchmarkVersion: string;
  engineVersion: string;
  roomRulesVersion: string;
  strategyDescriptors: StrategyDescriptor[];
  games: GameSummary[];
  expectedMatchIds: string[];
  completedMatchIds: string[];
  batchConfigHashes: string[];
  replayValidation?: ReplayValidationSummary;
}

export interface MatchupReportModel {
  strategyA: string;
  strategyB: string;
  configHash: string;
  baseSeedCount: number;
  rawGameCount: number;
  pairedUnitCount: number;
  raw: {
    winsA: number;
    winsB: number;
    draws: number;
    winRateA: number;
    winRateB: number;
    drawRate: number;
  };
  paired: {
    winsA: number;
    winsB: number;
    draws: number;
    winRateA: number;
    winRateB: number;
    drawRate: number;
    meanScoreDifference: number;
    medianScoreDifference: number;
    scoreDifferenceCI: [number, number];
    winRateCI: [number, number];
  };
  bootstrap: { blockUnit: "base-seed"; iterations: number; seed: number };
  elo: { initialRating: number; kFactor: number; delta: number; version: string };
  duration: { mean: number; median: number; p95: number };
  errors: { total: number; failed: number; timeouts: number; illegalActions: number; engineErrors: number; strategyErrors: number };
  replayValidation: ReplayValidationSummary;
  classification: { exploratory: true };
  significance: { score: string; winRate: string; interpretation: string };
}

export interface BenchmarkReportBuildInput {
  benchmarkVersion: string;
  rank: GameRank;
  replayMode: BenchmarkConfig["replayMode"];
  generatedAt: string;
  sourceCommit: string;
  roomRulesVersion: string;
  matchups: MatchupSource[];
  replayValidation: Record<string, ReplayValidationSummary>;
}

export interface BenchmarkReportModel {
  schemaVersion: "2";
  reportVersion: "d0-r2";
  benchmarkVersion: string;
  generatedAt: string;
  sourceCommit: string;
  roomRulesVersion: string;
  configHash: string;
  config: {
    rank: GameRank;
    seeds: number[];
    seedCount: number;
    rawGames: number;
    pairedUnits: number;
    baseSeeds: number;
    rotationsPerSeed: 4;
    placementsPerRotation: 2;
    gamesPerSeedPerMatchup: 8;
    matchupCount: number;
    replayMode: BenchmarkConfig["replayMode"];
  };
  matchups: MatchupReportModel[];
  manifestValidation: ManifestValidationSummary;
  replayValidation: ReplayValidationSummary;
  provenance: { strategyDescriptors: StrategyDescriptor[]; sourceCommits: string[] };
  privacy: { publicOnly: true; hiddenStateLeakCount: number };
}

const BOOTSTRAP_ITERATIONS = 200;
const BOOTSTRAP_SEED = 1;

export function buildBenchmarkReportModel(input: BenchmarkReportBuildInput): BenchmarkReportModel {
  if (input.matchups.length !== 3) throw new Error("MATCHUP_COUNT_INVALID");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.generatedAt)) throw new Error("GENERATED_AT_INVALID");
  const matchupModels = input.matchups.map((source) => buildMatchup(source, input.replayValidation[matchupKey(source)] ?? emptyReplayValidation()));
  const allGames = input.matchups.flatMap((source) => source.games);
  const seeds = [...new Set(allGames.map((game) => game.seed))].sort((a, b) => a - b);
  const manifestValidation = validateManifest(input.matchups);
  const replayValidation = mergeReplayValidation(matchupModels.map((matchup) => matchup.replayValidation));
  const sourceDescriptors = input.matchups.flatMap((source) => source.strategyDescriptors);
  const descriptors = uniqueDescriptors(sourceDescriptors);
  const config = {
    rank: input.rank,
    seeds,
    seedCount: seeds.length,
    rawGames: allGames.length,
    pairedUnits: matchupModels.reduce((sum, matchup) => sum + matchup.pairedUnitCount, 0),
    baseSeeds: seeds.length * input.matchups.length,
    rotationsPerSeed: 4 as const,
    placementsPerRotation: 2 as const,
    gamesPerSeedPerMatchup: 8 as const,
    matchupCount: input.matchups.length,
    replayMode: input.replayMode,
  };
  const configHash = sha256(JSON.stringify({ benchmarkVersion: input.benchmarkVersion, ...config, matchups: input.matchups.map((source) => ({ strategyA: source.strategyA, strategyB: source.strategyB, configHash: source.configHash })) }));
  return {
    schemaVersion: "2",
    reportVersion: "d0-r2",
    benchmarkVersion: input.benchmarkVersion,
    generatedAt: input.generatedAt,
    sourceCommit: input.sourceCommit,
    roomRulesVersion: input.roomRulesVersion,
    configHash,
    config,
    matchups: matchupModels,
    manifestValidation,
    replayValidation,
    provenance: { strategyDescriptors: descriptors, sourceCommits: unique(input.matchups.map((source) => source.engineVersion.split("@").pop() ?? "")) },
    privacy: { publicOnly: true, hiddenStateLeakCount: replayValidation.hiddenStateLeakCount },
  };
}

export function serializeReportJson(model: BenchmarkReportModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}

export function renderReportMarkdown(model: BenchmarkReportModel): string {
  const lines = [
    "# D0 AI benchmark baseline",
    "",
    "## Configuration",
    "",
    `- Schema/report: ${model.schemaVersion}/${model.reportVersion}; benchmark: ${model.benchmarkVersion}.`,
    `- Seeds: ${model.config.seeds[0] ?? "n/a"}–${model.config.seeds.at(-1) ?? "n/a"} (${model.config.seedCount}); raw games: ${model.config.rawGames}; paired units: ${model.config.pairedUnits}; base seeds: ${model.config.baseSeeds}.`,
    `- Rotations/placements/games per seed per matchup: ${model.config.rotationsPerSeed}/${model.config.placementsPerRotation}/${model.config.gamesPerSeedPerMatchup}; matchups: ${model.config.matchupCount}; replay mode: ${model.config.replayMode}.`,
    `- Config hash: ${model.configHash}; source commit: ${model.sourceCommit}; room rules: ${model.roomRulesVersion}; generatedAt: ${model.generatedAt}.`,
    "",
    "## Matchup results",
    "",
  ];
  for (const matchup of model.matchups) {
    lines.push(`### ${matchup.strategyA} vs ${matchup.strategyB}`, "", `- Base seeds/raw games/paired units: ${matchup.baseSeedCount}/${matchup.rawGameCount}/${matchup.pairedUnitCount}.`, `- Raw win rate A/B/draw: ${format(matchup.raw.winRateA)}/${format(matchup.raw.winRateB)}/${format(matchup.raw.drawRate)}; wins: ${matchup.raw.winsA}/${matchup.raw.winsB}/${matchup.raw.draws}.`, `- Paired win rate A/B/draw: ${format(matchup.paired.winRateA)}/${format(matchup.paired.winRateB)}/${format(matchup.paired.drawRate)}; wins: ${matchup.paired.winsA}/${matchup.paired.winsB}/${matchup.paired.draws}.`, `- Mean/median paired score difference: ${format(matchup.paired.meanScoreDifference)}/${format(matchup.paired.medianScoreDifference)}; 95% CI: ${interval(matchup.paired.scoreDifferenceCI)}.`, `- Paired win-rate 95% CI: ${interval(matchup.paired.winRateCI)}; bootstrap: ${matchup.bootstrap.blockUnit}, ${matchup.bootstrap.iterations} iterations, seed ${matchup.bootstrap.seed}.`, `- Significance: score ${matchup.significance.score}; win rate ${matchup.significance.winRate}; ${matchup.significance.interpretation}.`, `- Elo (secondary descriptive): delta ${format(matchup.elo.delta)} (${matchup.elo.version}).`, `- Duration mean/median/p95 (ms): ${format(matchup.duration.mean)}/${format(matchup.duration.median)}/${format(matchup.duration.p95)}; errors total/failed/timeouts/illegal: ${matchup.errors.total}/${matchup.errors.failed}/${matchup.errors.timeouts}/${matchup.errors.illegalActions}.`, `- Replay/hash validation: ${matchup.replayValidation.replayFilesVerified}/${matchup.replayValidation.replayFilesExpected} verified; hidden-state leaks ${matchup.replayValidation.hiddenStateLeakCount}.`, "");
  }
  lines.push("## Validation", "", `- Manifest expected/completed/duplicate/missing/unknown: ${model.manifestValidation.expectedMatchIds}/${model.manifestValidation.completedMatchIds}/${model.manifestValidation.duplicate}/${model.manifestValidation.missing}/${model.manifestValidation.unknown}.`, `- Manifest configHash consistent: ${model.manifestValidation.configHashConsistent}; provenance missing: ${model.manifestValidation.provenanceMissing}; non-positive duration: ${model.manifestValidation.nonPositiveDuration}.`, `- Replay files expected/found/verified: ${model.replayValidation.replayFilesExpected}/${model.replayValidation.replayFilesFound}/${model.replayValidation.replayFilesVerified}; hash/version verified: ${model.replayValidation.hashVerified}/${model.replayValidation.versionVerified}.`, `- Random/greedy/legacy replay samples verified: ${model.replayValidation.randomReplayVerified}/${model.replayValidation.greedyReplayVerified}/${model.replayValidation.legacyReplayVerified}.`, "", "Classification is exploratory only. Elo is a secondary descriptive metric. Score neutrality is 0 and win-rate neutrality is 0.5; confidence intervals containing the neutral value are not reported as statistically significant.", "");
  return lines.join("\n");
}

function buildMatchup(source: MatchupSource, replayValidation: ReplayValidationSummary): MatchupReportModel {
  const games = source.games;
  const units = pairedUnits(games, source.strategyA);
  const rawCounts = outcomeCounts(games, source.strategyA);
  const pairedCounts = units.reduce((counts, unit) => addOutcome(counts, unit.outcome), emptyCounts());
  const scoreDifferences = units.map((unit) => unit.scoreDifference);
  const bootstrap = bootstrapUnits(games, source.strategyA, BOOTSTRAP_ITERATIONS, BOOTSTRAP_SEED);
  const rawDenominator = games.length || 1;
  const unitDenominator = units.length || 1;
  const decisiveDenominator = pairedCounts.a + pairedCounts.b || 1;
  const errors = games.reduce((result, game) => { const counters = (game as GameSummary & { errorCounters?: Record<string, number> }).errorCounters ?? {}; result.total += counters.total ?? 0; result.illegalActions += counters.illegalActions ?? 0; result.engineErrors += counters.engineErrors ?? 0; result.strategyErrors += counters.strategyErrors ?? 0; result.failed += (game as GameSummary & { failed?: boolean }).failed ? 1 : 0; result.timeouts += String((game as GameSummary & { errors?: unknown[] }).errors ?? []).includes("TIMEOUT") ? 1 : 0; return result; }, { total: 0, failed: 0, timeouts: 0, illegalActions: 0, engineErrors: 0, strategyErrors: 0 });
  return {
    strategyA: source.strategyA,
    strategyB: source.strategyB,
    configHash: source.configHash,
    baseSeedCount: new Set(games.map((game) => game.seed)).size,
    rawGameCount: games.length,
    pairedUnitCount: units.length,
    raw: { winsA: rawCounts.a, winsB: rawCounts.b, draws: rawCounts.draw, winRateA: rawCounts.a / rawDenominator, winRateB: rawCounts.b / rawDenominator, drawRate: rawCounts.draw / rawDenominator },
    paired: { winsA: pairedCounts.a, winsB: pairedCounts.b, draws: pairedCounts.draw, winRateA: pairedCounts.a / decisiveDenominator, winRateB: pairedCounts.b / decisiveDenominator, drawRate: pairedCounts.draw / unitDenominator, meanScoreDifference: mean(scoreDifferences), medianScoreDifference: median(scoreDifferences), scoreDifferenceCI: bootstrap.scoreCI, winRateCI: bootstrap.winCI },
    bootstrap: { blockUnit: "base-seed", iterations: BOOTSTRAP_ITERATIONS, seed: BOOTSTRAP_SEED },
    elo: { initialRating: 1500, kFactor: 32, delta: 32 * (rawCounts.a / rawDenominator - 0.5), version: "d0-elo-v1" },
    duration: durationStats(games.map((game) => game.durationMs)),
    errors,
    replayValidation,
    classification: { exploratory: true },
    significance: { score: neutralText(bootstrap.scoreCI, 0), winRate: neutralText(bootstrap.winCI, 0.5), interpretation: neutralText(bootstrap.scoreCI, 0) === "CI excludes neutral" && neutralText(bootstrap.winCI, 0.5) === "CI excludes neutral" ? "paired CI excludes neutral" : "未观察到显著差异" },
  };
}

function pairedUnits(games: GameSummary[], strategyA: string): Array<{ outcome: "a" | "b" | "draw"; scoreDifference: number; seed: number }> {
  const map = new Map<string, GameSummary[]>();
  for (const game of games) { const key = `${game.seed}:${game.rotation}`; (map.get(key) ?? (map.set(key, []), map.get(key)!)).push(game); }
  return [...map.values()].map((pair) => {
    const outcomes = pair.map((game) => outcomeForA(game, strategyA));
    const a = outcomes.filter((outcome) => outcome === "a").length;
    const b = outcomes.filter((outcome) => outcome === "b").length;
    const first = pair[0]!;
    return { outcome: a > b ? "a" : b > a ? "b" : "draw", scoreDifference: mean(pair.map((game) => scoreForA(game, strategyA))), seed: first.seed };
  });
}

function bootstrapUnits(games: GameSummary[], strategyA: string, iterations: number, seed: number): { scoreCI: [number, number]; winCI: [number, number] } {
  const bySeed = new Map<number, GameSummary[]>();
  for (const game of games) (bySeed.get(game.seed) ?? (bySeed.set(game.seed, []), bySeed.get(game.seed)!)).push(game);
  const blocks = [...bySeed.values()]; let state = seed >>> 0 || 1; const scores: number[] = []; const wins: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) { const sampled: GameSummary[] = []; for (let draw = 0; draw < blocks.length; draw += 1) { state = nextState(state); sampled.push(...blocks[state % blocks.length]!); } const units = pairedUnits(sampled, strategyA); const decisive = units.filter((unit) => unit.outcome !== "draw"); scores.push(mean(units.map((unit) => unit.scoreDifference))); wins.push(decisive.length === 0 ? 0.5 : decisive.filter((unit) => unit.outcome === "a").length / decisive.length); }
  return { scoreCI: percentileInterval(scores), winCI: percentileInterval(wins) };
}

function outcomeCounts(games: GameSummary[], strategyA: string): { a: number; b: number; draw: number } { return games.reduce((counts, game) => addOutcome(counts, outcomeForA(game, strategyA)), emptyCounts()); }
function addOutcome(counts: { a: number; b: number; draw: number }, outcome: "a" | "b" | "draw"): typeof counts { counts[outcome] += 1; return counts; }
function emptyCounts(): { a: number; b: number; draw: number } { return { a: 0, b: 0, draw: 0 }; }
function outcomeForA(game: GameSummary, strategyA: string): "a" | "b" | "draw" { const seat = ([0, 1, 2, 3] as Seat[]).find((candidate) => game.strategiesBySeat[candidate] === strategyA); if (seat === undefined || game.winnerTeam === null) return "draw"; return game.winnerTeam === seat % 2 ? "a" : "b"; }
function scoreForA(game: GameSummary, strategyA: string): number { const seat = ([0, 1, 2, 3] as Seat[]).find((candidate) => game.strategiesBySeat[candidate] === strategyA) ?? 0; const aTeam = seat % 2 as 0 | 1; return (game.teamScore[aTeam] ?? 0) - (game.teamScore[(aTeam === 0 ? 1 : 0) as 0 | 1] ?? 0); }
function durationStats(values: number[]): { mean: number; median: number; p95: number } { const sorted = [...values].sort((a, b) => a - b); return { mean: mean(values), median: sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0, p95: sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0 }; }
function percentileInterval(values: number[]): [number, number] { const sorted = [...values].sort((a, b) => a - b); return [sorted[Math.floor((sorted.length - 1) * 0.025)] ?? 0, sorted[Math.floor((sorted.length - 1) * 0.975)] ?? 0]; }
function neutralText(intervalValue: [number, number], neutral: number): string { return intervalValue[0] <= neutral && intervalValue[1] >= neutral ? "CI includes neutral" : "CI excludes neutral"; }
function mean(values: number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values: number[]): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0; }
function nextState(value: number): number { let state = value >>> 0; state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0 || 1; }
function validateManifest(sources: MatchupSource[]): ManifestValidationSummary { const expected = sources.flatMap((source) => source.expectedMatchIds); const completed = sources.flatMap((source) => source.completedMatchIds); const actual = sources.flatMap((source) => source.games.map((game) => game.matchId)); const expectedSet = new Set(expected); const completedSet = new Set(completed); const actualSet = new Set(actual); return { expectedMatchIds: expected.length, completedMatchIds: completed.length, duplicate: actual.length - actualSet.size, missing: [...expectedSet].filter((id) => !completedSet.has(id)).length, unknown: [...actualSet].filter((id) => !expectedSet.has(id)).length, configHashConsistent: sources.every((source) => new Set(source.batchConfigHashes).size === 1), provenanceMissing: sources.reduce((sum, source) => sum + (source.strategyDescriptors.length === 0 ? source.games.length : 0), 0), nonPositiveDuration: sources.flatMap((source) => source.games).filter((game) => !Number.isFinite(game.durationMs) || game.durationMs <= 0).length }; }
function mergeReplayValidation(values: ReplayValidationSummary[]): ReplayValidationSummary { return values.reduce((sum, value) => ({ replayFilesExpected: sum.replayFilesExpected + value.replayFilesExpected, replayFilesFound: sum.replayFilesFound + value.replayFilesFound, replayFilesVerified: sum.replayFilesVerified + value.replayFilesVerified, hashVerified: sum.hashVerified + value.hashVerified, versionVerified: sum.versionVerified + value.versionVerified, hiddenStateLeakCount: sum.hiddenStateLeakCount + value.hiddenStateLeakCount, randomReplayVerified: sum.randomReplayVerified + value.randomReplayVerified, greedyReplayVerified: sum.greedyReplayVerified + value.greedyReplayVerified, legacyReplayVerified: sum.legacyReplayVerified + value.legacyReplayVerified, sampledReplayVerification: { method: sum.sampledReplayVerification.method === "full" && value.sampledReplayVerification.method === "full" ? "full" : "sampled", expected: sum.sampledReplayVerification.expected + value.sampledReplayVerification.expected, verified: sum.sampledReplayVerification.verified + value.sampledReplayVerification.verified } }), emptyReplayValidation()); }
function emptyReplayValidation(): ReplayValidationSummary { return { replayFilesExpected: 0, replayFilesFound: 0, replayFilesVerified: 0, hashVerified: 0, versionVerified: 0, hiddenStateLeakCount: 0, randomReplayVerified: 0, greedyReplayVerified: 0, legacyReplayVerified: 0, sampledReplayVerification: { method: "sampled", expected: 0, verified: 0 } }; }
function matchupKey(source: MatchupSource): string { return `${source.strategyA} vs ${source.strategyB}`; }
function uniqueDescriptors(descriptors: StrategyDescriptor[]): StrategyDescriptor[] { const seen = new Set<string>(); return descriptors.filter((descriptor) => { if (seen.has(descriptor.id)) return false; seen.add(descriptor.id); return true; }); }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function format(value: number): string { return Number.isFinite(value) ? value.toFixed(3) : "n/a"; }
function interval(value: [number, number]): string { return `[${format(value[0])}, ${format(value[1])}]`; }
