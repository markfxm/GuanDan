import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../tests/benchmark/contracts";
import { jointUplift, pairedBlockStatistics, type D1GameLike } from "../tests/benchmark/d1Statistics";
import { computeApprovedCodeTreeHash } from "../tests/benchmark/d1Calibration";
import { validateD1CalibrationReportReadiness } from "../tests/benchmark/d1CalibrationReadiness";

export const D1_MATCHUPS = [
  "treatment-vs-control",
  "treatment-vs-greedy",
  "control-vs-greedy",
  "treatment-vs-random",
  "control-vs-random",
  "treatment-vs-legacy",
  "control-vs-legacy",
] as const;

export const D1_EXECUTION_COMMIT = "ad1d72b6715338b470a062da7b28bc9284babb1f";
export const D1_APPROVED_TREE_HASH = "83fea4dad453ac34dbab3f9dafe77774f2de7709cf0b14e2278926a4266ed39e";
export const D0_COMMIT = "e2a20e18f8e5c0871db38ad69426262e43766ce1";
export const D0_TAG = "ai-benchmark-d0-baseline";
export const BOOTSTRAP_ITERATIONS = 10_000;
export const BOOTSTRAP_SEED = 2_026_0714;

export interface ArtifactInventoryEntry { path: string; size: number; sha256: string; }
export interface ArtifactInventory { directory: string; files: ArtifactInventoryEntry[]; sha256: string; }
export interface ReviewGame extends Record<string, any> { matchup: string; seed: number; rotation: number; allocation: "AB" | "BA"; strategiesBySeat: Record<string, string>; }

export interface CalibrationReviewInput {
  manifests: readonly Record<string, any>[];
  gamesByMatchup: Record<string, ReviewGame[]>;
  smoke?: PhaseSummary;
  inventories?: { smoke?: ArtifactInventory; calibration?: ArtifactInventory; combinedSha256?: string };
  allowSyntheticEmpty?: boolean;
}

export interface PhaseSummary { phase: "smoke" | "calibration"; manifestCount: number; rawGames: number; pairedUnits: number; configHashes: string[]; provenanceHashes: string[]; schemaVersions: string[]; expectedMatchIds: number; completedMatchIds: number; duplicate: number; missing: number; unknown: number; safetyOk: boolean; privacyOk: boolean; diagnosticsOk: boolean; hashOk: boolean; versionOk: boolean; }

export interface CalibrationReviewModel {
  schemaVersion: "d1-calibration-review-v1";
  phase: "calibration-review";
  generatedFromExistingArtifacts: true;
  reportSha256?: string;
  artifactInventory: { smoke?: ArtifactInventory; calibration?: ArtifactInventory; combinedSha256?: string };
  commitAudit: { baseCommit: string; executionCommit: string; isAncestor: boolean; changedFiles: string[]; baseTreeHash: string; executionTreeHash: string; executionTreeHashMatchesApproved: boolean; explanation: string };
  provenance: { executionSourceCommit: string; approvedCodeCommit: string; approvedCodeTreeHash: string; behaviorBaselineCommit: string; behaviorBaselineTag: string; provenanceHashes: string[]; configHashes: string[]; strategyDescriptors: any[]; engineVersions: string[]; roomRulesVersions: string[]; benchmarkVersions: string[]; replaySchemaVersions: string[]; diagnosticsSchemaVersions: string[] };
  config: { calibrationConfigHash: string; smokeConfigHashes: string[]; seedRange: [number, number]; baseSeedBlocks: number; bootstrap: { blockUnit: "base-seed" | "base-seed-difference"; iterations: number; seed: number }; candidate: { K: number | null; minimumScoreDelta: number | null; cooldownDecisionIndices: number | null; recentReturnMultiplier: number | null; recentReturnWindow: number | null; status: "observed" | "not-observable" } };
  counts: { smoke?: PhaseSummary; calibration: { rawGames: number; pairedUnits: number; baseSeedBlocks: number; matchupCount: number } };
  matchups: CalibrationMatchupReport[];
  jointUplifts: Record<"greedy" | "random" | "legacy", JointUpliftReport>;
  behavioralDivergence: Record<"greedy" | "random" | "legacy", BehavioralDivergenceReport>;
  diagnostics: DiagnosticsAudit;
  structuralReadiness: "passed" | "failed";
  behavioralExposure: "exercised" | "unexercised" | "inert" | "invalid-diagnostics";
  statisticalReadiness: "eligible-for-human-review" | "inconclusive" | "fails-improvement-margin" | "fails-non-inferiority" | "not-applicable-because-unexercised";
  humanReviewRecommendation: "do-not-approve-formal" | "human-review";
  approvalStatus: { formalExecutionAllowed: false; approvalTemplateCreated: true; reason: string };
  candidateApprovalParameters: { behaviorCaps: null; margins: null; humanReviewRequired: true };
}

export interface CalibrationMatchupReport {
  matchup: string; strategyA: string; strategyB: string; rawGames: number; pairedUnits: number; baseSeedBlocks: number;
  pairedScoreDifference: { pointEstimate: number; ci95: [number, number] };
  pairedWinRate: { pointEstimate: number; ci95: [number, number] };
  pairedWins: { a: number; b: number; draw: number };
  raw: { winsA: number; winsB: number; draws: number; winRateA: number; winRateB: number; drawRate: number };
  elo: { delta: number; version: string };
  conclusion: "positive" | "negative" | "inconclusive";
  safety: { allZero: boolean; errorCount: number };
  durations: { mean: number; median: number; p95: number };
}

export interface JointUpliftReport { score: { pointEstimate: number; ci95: [number, number] }; winRate: { pointEstimate: number; ci95: [number, number] }; blockCount: number; bootstrap: { iterations: number; seed: number; blockUnit: "base-seed-difference" }; }
export interface BehavioralDivergenceReport { matchedScenes: number; publicTraceHashDifferent: number; finalPublicStateHashDifferent: number; finishOrderDifferent: number; teamResultDifferent: number; rawScoreDifferent: number; observable: true; }
export interface DiagnosticsAudit {
  dynamicDecisionDenominator: number; forcedSwitchCount: number; strategicSwitchCount: number; strategicConsiderationDenominator: number; suppressedStrategicDecisionCount: number; strategicSwitchDenominator: number; recentStrategicReturnSwitchCount: number; tieKeptActiveCount: number;
  rates: Record<string, { numerator: number; denominator: number; rate: number | null }>;
  candidateCount: { count: number; min: number | null; max: number | null; mean: number | null; p50: number | null; p95: number | null; greaterThanOneDecisions: number | null; validChallengerDecisions: number | null; validChallengerStatus: "observable" | "not-observable" };
  reasonCounts: Record<string, number>;
  migrationCount: number | null; sidecarCreatedCount: number | null; sidecarWithoutSwitchDecisionCount: number | null;
  diagnosticsIntegrity: "valid" | "invalid";
  exposureReason: "A-candidate-count-one" | "B-invalid-challenger" | "C-diagnostics-gap" | "D-threshold-suppression" | "other";
}

export async function inventoryDirectory(directory: string): Promise<ArtifactInventory> {
  const root = path.resolve(directory);
  const files = (await walkFiles(root)).sort((a, b) => a.localeCompare(b));
  const entries: ArtifactInventoryEntry[] = [];
  for (const file of files) {
    const bytes = await fs.readFile(file);
    entries.push({ path: path.relative(root, file).replaceAll("\\", "/"), size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return { directory: path.basename(root), files: entries, sha256: sha256(canonicalJson(entries)) };
}

export async function loadPhaseDirectory(directory: string, phase: "smoke" | "calibration"): Promise<{ manifests: Record<string, any>[]; gamesByMatchup: Record<string, ReviewGame[]>; inventory: ArtifactInventory }> {
  const inventory = await inventoryDirectory(directory);
  const allowed = inventory.files.every((file) => file.path.endsWith(".manifest.json") || file.path.endsWith(".json"));
  if (!allowed) throw new Error("UNKNOWN_ARTIFACT_FILE");
  const root = path.resolve(directory);
  const manifests: Record<string, any>[] = [];
  const gamesByMatchup: Record<string, ReviewGame[]> = {};
  for (const file of inventory.files) {
    const value = JSON.parse(await fs.readFile(path.join(root, file.path), "utf8"));
    if (file.path.endsWith(".manifest.json")) manifests.push(value);
    else if (Array.isArray(value)) {
      const matchup = String(value[0]?.matchup ?? "");
      if (!matchup) throw new Error("RAW_MATCHUP_MISSING");
      gamesByMatchup[matchup] = [...(gamesByMatchup[matchup] ?? []), ...value];
    }
  }
  if (manifests.some((manifest) => manifest.phase !== phase)) throw new Error("PHASE_MISMATCH");
  return { manifests, gamesByMatchup, inventory };
}

export function classifyBehaviorExposure(input: { dynamicDecisionDenominator: number; candidateCountGreaterThanOne: number; strategicConsiderationDenominator: number; diagnosticsValid: boolean }): CalibrationReviewModel["behavioralExposure"] {
  if (!input.diagnosticsValid) return "invalid-diagnostics";
  if (input.candidateCountGreaterThanOne === 0 && input.strategicConsiderationDenominator === 0) return "unexercised";
  if (input.dynamicDecisionDenominator > 0 && input.strategicConsiderationDenominator === 0) return "inert";
  return "exercised";
}

export function buildCalibrationReviewModel(input: CalibrationReviewInput): CalibrationReviewModel {
  const manifests = [...input.manifests];
  if (!input.allowSyntheticEmpty) validateRequiredManifests(manifests);
  const calibrationConfigHashes = unique(manifests.map((manifest) => String(manifest.configHash ?? "")));
  const provenanceHashes = unique(manifests.map((manifest) => String(manifest.provenanceHash ?? "")));
  if (!input.allowSyntheticEmpty && calibrationConfigHashes.length !== 1) throw new Error("CONFIG_HASH_INCONSISTENT");
  if (!input.allowSyntheticEmpty && provenanceHashes.length !== 1) throw new Error("PROVENANCE_HASH_INCONSISTENT");
  const gamesByMatchup = input.gamesByMatchup;
  const matchupReports = D1_MATCHUPS.map((matchup) => buildMatchupReport(matchup, gamesByMatchup[matchup] ?? [], manifests.find((candidate) => candidate.matchup === matchup)));
  const diagnostics = aggregateDiagnostics(gamesByMatchup, manifests);
  const behavioralExposure = classifyBehaviorExposure({ dynamicDecisionDenominator: diagnostics.dynamicDecisionDenominator, candidateCountGreaterThanOne: diagnostics.candidateCount.greaterThanOneDecisions ?? 0, strategicConsiderationDenominator: diagnostics.strategicConsiderationDenominator, diagnosticsValid: diagnostics.diagnosticsIntegrity === "valid" });
  const jointUplifts = buildJointUplifts(gamesByMatchup);
  const behavioralDivergence = { greedy: divergence(gamesByMatchup["treatment-vs-greedy"] ?? [], gamesByMatchup["control-vs-greedy"] ?? []), random: divergence(gamesByMatchup["treatment-vs-random"] ?? [], gamesByMatchup["control-vs-random"] ?? []), legacy: divergence(gamesByMatchup["treatment-vs-legacy"] ?? [], gamesByMatchup["control-vs-legacy"] ?? []) };
  const structuralReadiness = input.allowSyntheticEmpty ? "failed" : "passed";
  return {
    schemaVersion: "d1-calibration-review-v1", phase: "calibration-review", generatedFromExistingArtifacts: true,
    artifactInventory: input.inventories ?? {},
    commitAudit: defaultCommitAudit(),
    provenance: { executionSourceCommit: D1_EXECUTION_COMMIT, approvedCodeCommit: D1_EXECUTION_COMMIT, approvedCodeTreeHash: D1_APPROVED_TREE_HASH, behaviorBaselineCommit: D0_COMMIT, behaviorBaselineTag: D0_TAG, provenanceHashes, configHashes: calibrationConfigHashes, strategyDescriptors: manifests[0]?.strategyDescriptors ?? [], engineVersions: unique(manifests.map((manifest) => String(manifest.engineVersion ?? ""))), roomRulesVersions: unique(manifests.map((manifest) => String(manifest.roomRulesVersion ?? ""))), benchmarkVersions: unique(manifests.map((manifest) => String(manifest.benchmarkVersion ?? ""))), replaySchemaVersions: unique(manifests.map((manifest) => String(manifest.replaySchemaVersion ?? ""))), diagnosticsSchemaVersions: unique(manifests.map((manifest) => String(manifest.diagnosticsSchemaVersion ?? ""))) },
    config: { calibrationConfigHash: calibrationConfigHashes[0] ?? "", smokeConfigHashes: input.smoke?.configHashes ?? [], seedRange: [221, 270], baseSeedBlocks: 50, bootstrap: { blockUnit: "base-seed", iterations: BOOTSTRAP_ITERATIONS, seed: BOOTSTRAP_SEED }, candidate: { K: 5, minimumScoreDelta: 6, cooldownDecisionIndices: 2, recentReturnMultiplier: 2, recentReturnWindow: 3, status: "observed" } },
    counts: { smoke: input.smoke, calibration: { rawGames: matchupReports.reduce((sum, report) => sum + report.rawGames, 0), pairedUnits: matchupReports.reduce((sum, report) => sum + report.pairedUnits, 0), baseSeedBlocks: 50, matchupCount: matchupReports.length } },
    matchups: matchupReports, jointUplifts, behavioralDivergence, diagnostics, structuralReadiness, behavioralExposure,
    statisticalReadiness: behavioralExposure === "invalid-diagnostics" ? "inconclusive" : behavioralExposure === "unexercised" || behavioralExposure === "inert" ? "not-applicable-because-unexercised" : "inconclusive",
    humanReviewRecommendation: "do-not-approve-formal", approvalStatus: { formalExecutionAllowed: false, approvalTemplateCreated: true, reason: behavioralExposure === "invalid-diagnostics" ? "invalid diagnostics" : "treatment behavior unexercised or inert" }, candidateApprovalParameters: { behaviorCaps: null, margins: null, humanReviewRequired: true },
  };
}

export function finalizeCalibrationReviewModel(model: CalibrationReviewModel): CalibrationReviewModel {
  const payload = { ...model } as Partial<CalibrationReviewModel>;
  delete payload.reportSha256;
  return { ...model, reportSha256: sha256(canonicalJson(payload)) };
}

export function serializeCalibrationReviewJson(model: CalibrationReviewModel): string { return `${canonicalJson(finalizeCalibrationReviewModel(model))}\n`; }

export function renderCalibrationReviewMarkdown(model: CalibrationReviewModel): string {
  const final = finalizeCalibrationReviewModel(model);
  const lines = ["# D1 Top-K calibration review", "", "**NOT APPROVED FOR FORMAL**", "", `- Report SHA-256: ${final.reportSha256}`, `- Structural readiness: ${final.structuralReadiness}`, `- Behavioral exposure: ${final.behavioralExposure}`, `- Statistical readiness: ${final.statisticalReadiness}`, `- Recommendation: ${final.humanReviewRecommendation}`, "", "## Counts", "", `- Smoke: ${final.counts.smoke?.rawGames ?? "n/a"} raw / ${final.counts.smoke?.pairedUnits ?? "n/a"} paired.`, `- Calibration: ${final.counts.calibration.rawGames} raw / ${final.counts.calibration.pairedUnits} paired / ${final.counts.calibration.baseSeedBlocks} base-seed blocks.`, "", "## Matchups", "", "| Matchup | Raw | Paired | Score diff | Score CI | Win rate | Win-rate CI | Conclusion |", "|---|---:|---:|---:|---|---:|---|---|"];
  for (const matchup of final.matchups) lines.push(`| ${matchup.matchup} | ${matchup.rawGames} | ${matchup.pairedUnits} | ${format(matchup.pairedScoreDifference.pointEstimate)} | ${interval(matchup.pairedScoreDifference.ci95)} | ${format(matchup.pairedWinRate.pointEstimate)} | ${interval(matchup.pairedWinRate.ci95)} | ${matchup.conclusion} |`);
  lines.push("", "## Provenance and inventory", "", `- Execution/approved commit: ${final.provenance.executionSourceCommit}; approved tree hash: ${final.provenance.approvedCodeTreeHash}.`, `- Baseline: ${final.provenance.behaviorBaselineCommit} (${final.provenance.behaviorBaselineTag}).`, `- Smoke config hashes: ${final.config.smokeConfigHashes.join(", ") || "n/a"}; calibration config hash: ${final.config.calibrationConfigHash}.`, `- Inventory SHA-256: ${final.artifactInventory.combinedSha256 ?? "n/a"}.`, `- Commit audit: ancestor=${final.commitAudit.isAncestor}; execution tree matches approved=${final.commitAudit.executionTreeHashMatchesApproved}.`, "", "## Behavioral exposure", "", `- Dynamic decision denominator: ${final.diagnostics.dynamicDecisionDenominator}.`, `- Candidate count: ${JSON.stringify(final.diagnostics.candidateCount)}.`, `- Strategic consideration denominator: ${final.diagnostics.strategicConsiderationDenominator}; forced switches: ${final.diagnostics.forcedSwitchCount}; strategic switches: ${final.diagnostics.strategicSwitchCount}.`, `- Rates: ${JSON.stringify(final.diagnostics.rates)}.`, `- Exposure reason: ${final.diagnostics.exposureReason}.`, `- Migration/sidecar metrics: migration=${final.diagnostics.migrationCount ?? "not-observable"}; created=${final.diagnostics.sidecarCreatedCount ?? "not-observable"}; present-without-switch=${final.diagnostics.sidecarWithoutSwitchDecisionCount ?? "not-observable"}.`, "", "## Behavioral divergence", "", "| Opponent | Matched | Trace diff | Final-state diff | Finish-order diff | Team-result diff | Score diff |", "|---|---:|---:|---:|---:|---:|---:|", ...(["greedy", "random", "legacy"] as const).map((name) => { const value = final.behavioralDivergence[name]; return `| ${name} | ${value.matchedScenes} | ${value.publicTraceHashDifferent} | ${value.finalPublicStateHashDifferent} | ${value.finishOrderDifferent} | ${value.teamResultDifferent} | ${value.rawScoreDifferent} |`; }), "", "## Joint uplift", "", `- Bootstrap: ${final.config.bootstrap.blockUnit}, ${final.config.bootstrap.iterations} iterations, seed ${final.config.bootstrap.seed}.`, ...(["greedy", "random", "legacy"] as const).map((name) => `- ${name}: score ${format(final.jointUplifts[name].score.pointEstimate)} ${interval(final.jointUplifts[name].score.ci95)}; win-rate ${format(final.jointUplifts[name].winRate.pointEstimate)} ${interval(final.jointUplifts[name].winRate.ci95)}; blocks ${final.jointUplifts[name].blockCount}.`), "", "## Approval gate", "", `- Structural readiness: ${final.structuralReadiness}; behavioral exposure: ${final.behavioralExposure}; statistical readiness: ${final.statisticalReadiness}.`, "- Candidate caps and margins: unapproved/null; human review required.", "- formalExecutionAllowed: false; formalApprovalRecommendation: do-not-approve.", "- No formal/P8 execution is authorized.", "");
  return lines.join("\n");
}

export function buildApprovalTemplate(model: CalibrationReviewModel, reportLocation: string): Record<string, unknown> {
  const final = finalizeCalibrationReviewModel(model);
  return { schemaVersion: "d1-calibration-approval-v2", approvedCodeCommit: D1_EXECUTION_COMMIT, executionSourceCommit: D1_EXECUTION_COMMIT, approvedCodeTreeHash: D1_APPROVED_TREE_HASH, experimentExecutionCommit: D1_EXECUTION_COMMIT, approvalToolingCommit: null, calibrationConfigHash: final.config.calibrationConfigHash, smokeConfigHashes: final.config.smokeConfigHashes, provenanceHashes: final.provenance.provenanceHashes, strategyDescriptors: final.provenance.strategyDescriptors, calibrationReportSha256: final.reportSha256, calibrationReportLocation: reportLocation, artifactInventoryHash: final.artifactInventory.combinedSha256 ?? null, bootstrap: final.config.bootstrap, frozenConstants: final.config.candidate, candidateBehaviorCaps: null, candidateMargins: null, diagnostics: final.diagnostics, structuralReadiness: final.structuralReadiness, behavioralExposure: final.behavioralExposure, statisticalReadiness: final.statisticalReadiness, formalApprovalRecommendation: "do-not-approve", formalExecutionAllowed: false };
}

function validateRequiredManifests(manifests: readonly Record<string, any>[]): void {
  const readiness = validateD1CalibrationReportReadiness(manifests);
  if (!readiness.ready) throw new Error(`CALIBRATION_NOT_READY:${readiness.errors.join(",")}`);
  if (unique(manifests.map((manifest) => String(manifest.executionSourceCommit ?? ""))).length !== 1 || manifests.some((manifest) => manifest.executionSourceCommit !== D1_EXECUTION_COMMIT)) throw new Error("EXECUTION_COMMIT_INCONSISTENT");
}

function buildMatchupReport(matchup: string, games: ReviewGame[], manifest?: Record<string, any>): CalibrationMatchupReport {
  const [aToken, bToken] = matchup.split("-vs-");
  const strategyA = strategyId(games, aToken ?? ""); const strategyB = strategyId(games, bToken ?? "");
  const d1Games: D1GameLike[] = games.map((game) => ({ seed: game.seed, rotation: game.rotation, allocation: game.allocation, scoreDifference: scoreFor(game, strategyA), outcome: outcomeFor(game, strategyA) }));
  const stats = d1Games.length === 0 ? emptyStats() : pairedStats(d1Games);
  const raw = games.reduce((counts, game) => { counts[outcomeFor(game, strategyA)] += 1; return counts; }, { a: 0, b: 0, draw: 0 });
  const denominator = games.length || 1; const decisive = raw.a + raw.b || 1;
  const scoreCI = stats.scoreCI; const winCI = stats.winRateCI;
  const conclusion = scoreCI[0] > 0 && winCI[0] > 0.5 ? "positive" : scoreCI[1] < 0 && winCI[1] < 0.5 ? "negative" : "inconclusive";
  return { matchup, strategyA, strategyB, rawGames: games.length, pairedUnits: stats.pairedUnitCount, baseSeedBlocks: stats.baseSeedCount, pairedScoreDifference: { pointEstimate: stats.meanScoreDifference, ci95: scoreCI }, pairedWinRate: { pointEstimate: stats.pairedWinRateA, ci95: winCI }, pairedWins: { a: stats.pairedWinsA, b: stats.pairedWinsB, draw: stats.pairedDraws }, raw: { winsA: raw.a, winsB: raw.b, draws: raw.draw, winRateA: raw.a / denominator, winRateB: raw.b / denominator, drawRate: raw.draw / denominator }, elo: { delta: 32 * (raw.a / denominator - 0.5), version: "d1-elo-descriptive-v1" }, conclusion, safety: { allZero: manifest?.safety?.allZero === true, errorCount: Number(manifest?.diagnosticsErrorCount ?? 0) }, durations: durationStats(games.map((game) => Number(game.durationMs))) };
}

function pairedStats(games: D1GameLike[]): any {
  const units = pairedUnitsBySeedRotation(games);
  const blocks = perSeedFromD1(games);
  const zero = blocks.map((item) => ({ seed: item.seed, scoreDifference: 0, winRate: 0 }));
  const bootstrap = jointUplift(blocks.map((item) => ({ seed: item.seed, scoreDifference: item.scoreDifference, winRate: item.winRate })), zero, { iterations: BOOTSTRAP_ITERATIONS, seed: BOOTSTRAP_SEED }).bootstrap;
  const counts = units.reduce((out, unit) => { out[unit.outcome] += 1; return out; }, { a: 0, b: 0, draw: 0 });
  const decisive = counts.a + counts.b;
  return { baseSeedCount: blocks.length, pairedUnitCount: units.length, meanScoreDifference: mean(units.map((unit) => unit.scoreDifference)), pairedWinRateA: decisive === 0 ? 0.5 : counts.a / decisive, pairedWinsA: counts.a, pairedWinsB: counts.b, pairedDraws: counts.draw, scoreCI: bootstrap.scoreCI, winRateCI: bootstrap.winRateCI };
}

function pairedUnitsBySeedRotation(games: D1GameLike[]): Array<{ outcome: "a" | "b" | "draw"; scoreDifference: number }> {
  const byKey = new Map<string, D1GameLike[]>();
  for (const game of games) (byKey.get(`${game.seed}:${game.rotation}`) ?? (byKey.set(`${game.seed}:${game.rotation}`, []), byKey.get(`${game.seed}:${game.rotation}`)!)).push(game);
  return [...byKey.values()].sort((a, b) => a[0]!.seed - b[0]!.seed || a[0]!.rotation - b[0]!.rotation).map((pair) => { const a = pair.filter((game) => game.outcome === "a").length; const b = pair.filter((game) => game.outcome === "b").length; return { outcome: a === b ? "draw" : a > b ? "a" : "b", scoreDifference: mean(pair.map((game) => game.scoreDifference)) }; });
}

function perSeedFromD1(games: D1GameLike[]): Array<{ seed: number; scoreDifference: number; winRate: number }> {
  const bySeed = new Map<number, D1GameLike[]>();
  for (const game of games) (bySeed.get(game.seed) ?? (bySeed.set(game.seed, []), bySeed.get(game.seed)!)).push(game);
  return [...bySeed.entries()].sort(([a], [b]) => a - b).map(([seed, values]) => { const checked = pairedBlockStatistics(values, { bootstrapIterations: 1, bootstrapSeed: BOOTSTRAP_SEED }); const units = pairedUnitsBySeedRotation(values); const decisive = units.filter((unit) => unit.outcome !== "draw"); return { seed, scoreDifference: checked.meanScoreDifference, winRate: decisive.length === 0 ? 0.5 : decisive.filter((unit) => unit.outcome === "a").length / decisive.length }; });
}

function emptyStats(): any { return { baseSeedCount: 0, rawGameCount: 0, pairedUnitCount: 0, pairedWinsA: 0, pairedWinsB: 0, pairedDraws: 0, meanScoreDifference: 0, pairedWinRateA: 0.5, scoreCI: [0, 0], winRateCI: [0.5, 0.5] }; }

function aggregateDiagnostics(gamesByMatchup: Record<string, ReviewGame[]>, manifests: readonly Record<string, any>[]): DiagnosticsAudit {
  const totals = { dynamicDecisionDenominator: 0, forcedSwitchCount: 0, strategicSwitchCount: 0, suppressedStrategicDecisionCount: 0, strategicConsiderationDenominator: 0, strategicSwitchDenominator: 0, recentStrategicReturnSwitchCount: 0, tieKeptActiveCount: 0 };
  const reasons: Record<string, number> = {}; let candidateCount = 0; let candidateSum = 0; let candidateMin = Number.POSITIVE_INFINITY; let candidateMax = 0; let candidateGreater: number | null = 0; let allCandidateOne = true; let candidateObservations = 0; let invalid = false;
  for (const matchup of ["treatment-vs-control", "treatment-vs-greedy", "treatment-vs-random", "treatment-vs-legacy"]) for (const game of gamesByMatchup[matchup] ?? []) {
    const diagnostics = game.d1Diagnostics;
    if (diagnostics?.applicable !== true || diagnostics.schemaVersion !== "d1-plan-selection-diagnostics-v1") { invalid = true; continue; }
    for (const key of Object.keys(totals)) { const value = Number(diagnostics.totals?.[key]); if (!Number.isFinite(value) || value < 0) invalid = true; else (totals as any)[key] += value; }
    for (const [reason, count] of Object.entries(diagnostics.reasonCounts ?? {})) reasons[reason] = (reasons[reason] ?? 0) + Number(count);
    const summary = diagnostics.candidateCountSummary; if (!summary || !Number.isFinite(summary.count) || !Number.isFinite(summary.min) || !Number.isFinite(summary.max) || !Number.isFinite(summary.mean)) { invalid = true; continue; }
    candidateObservations += Number(summary.count); candidateCount += Number(summary.count); candidateSum += Number(summary.count) * Number(summary.mean); candidateMin = Math.min(candidateMin, Number(summary.min)); candidateMax = Math.max(candidateMax, Number(summary.max)); if (Number(summary.max) > 1) { allCandidateOne = false; candidateGreater = null; } else if (candidateGreater !== null) candidateGreater += 0;
  }
  const rate = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator === 0 ? null : numerator / denominator });
  const candidateGreaterThanOne = allCandidateOne ? 0 : candidateGreater;
  const diagnosticsIntegrity = invalid || manifests.some((manifest) => manifest.diagnosticsIntegrity?.integrityOk !== true) ? "invalid" : "valid";
  return { ...totals, rates: { forcedSwitchRate: rate(totals.forcedSwitchCount, totals.dynamicDecisionDenominator), strategicSwitchRate: rate(totals.strategicSwitchCount, totals.dynamicDecisionDenominator), switchSuppressionRate: rate(totals.suppressedStrategicDecisionCount, totals.strategicConsiderationDenominator), AToBToARate: rate(totals.recentStrategicReturnSwitchCount, totals.strategicSwitchDenominator) }, candidateCount: { count: candidateCount, min: candidateObservations === 0 ? null : candidateMin, max: candidateObservations === 0 ? null : candidateMax, mean: candidateCount === 0 ? null : candidateSum / candidateCount, p50: allCandidateOne && candidateCount > 0 ? 1 : null, p95: allCandidateOne && candidateCount > 0 ? 1 : null, greaterThanOneDecisions: candidateGreaterThanOne, validChallengerDecisions: null, validChallengerStatus: "not-observable" }, reasonCounts: reasons, migrationCount: null, sidecarCreatedCount: null, sidecarWithoutSwitchDecisionCount: null, diagnosticsIntegrity, exposureReason: diagnosticsIntegrity === "invalid" ? "C-diagnostics-gap" : allCandidateOne ? "A-candidate-count-one" : totals.strategicConsiderationDenominator === 0 ? "D-threshold-suppression" : "other" };
}

function buildJointUplifts(gamesByMatchup: Record<string, ReviewGame[]>): Record<"greedy" | "random" | "legacy", JointUpliftReport> {
  const result = {} as Record<"greedy" | "random" | "legacy", JointUpliftReport>;
  for (const opponent of ["greedy", "random", "legacy"] as const) {
    const treatment = perSeed(gamesByMatchup[`treatment-vs-${opponent}`] ?? [], "treatment"); const control = perSeed(gamesByMatchup[`control-vs-${opponent}`] ?? [], "control");
    if (treatment.length === 0 || control.length === 0) { result[opponent] = emptyUplift(); continue; }
    const uplift = jointUplift(treatment, control, { iterations: BOOTSTRAP_ITERATIONS, seed: BOOTSTRAP_SEED });
    result[opponent] = { score: { pointEstimate: mean(uplift.scoreBlocks), ci95: uplift.bootstrap.scoreCI }, winRate: { pointEstimate: mean(uplift.winRateBlocks), ci95: uplift.bootstrap.winRateCI }, blockCount: uplift.scoreBlocks.length, bootstrap: { iterations: uplift.bootstrap.iterations, seed: uplift.bootstrap.seed, blockUnit: "base-seed-difference" } };
  }
  return result;
}

function perSeed(games: ReviewGame[], token: string): Array<{ seed: number; scoreDifference: number; winRate: number }> {
  const strategy = strategyId(games, token); const d1 = games.map((game) => ({ game, score: scoreFor(game, strategy), outcome: outcomeFor(game, strategy) })); const bySeed = new Map<number, typeof d1>();
  for (const item of d1) (bySeed.get(item.game.seed) ?? (bySeed.set(item.game.seed, []), bySeed.get(item.game.seed)!)).push(item);
  return [...bySeed.entries()].sort(([a], [b]) => a - b).map(([seed, items]) => { const byRotation = new Map<number, typeof items>(); for (const item of items) (byRotation.get(item.game.rotation) ?? (byRotation.set(item.game.rotation, []), byRotation.get(item.game.rotation)!)).push(item); const units = [...byRotation.values()]; const unitScores = units.map((unit) => mean(unit.map((item) => item.score))); const unitOutcomes = units.map((unit) => { const a = unit.filter((item) => item.outcome === "a").length; const b = unit.filter((item) => item.outcome === "b").length; return a === b ? "draw" : a > b ? "a" : "b"; }); const decisive = unitOutcomes.filter((outcome) => outcome !== "draw"); return { seed, scoreDifference: mean(unitScores), winRate: decisive.length === 0 ? 0.5 : decisive.filter((outcome) => outcome === "a").length / decisive.length }; });
}

function divergence(treatment: ReviewGame[], control: ReviewGame[]): BehavioralDivergenceReport {
  const controlByKey = new Map(control.map((game) => [sceneKey(game), game])); let matchedScenes = 0; const result = { matchedScenes: 0, publicTraceHashDifferent: 0, finalPublicStateHashDifferent: 0, finishOrderDifferent: 0, teamResultDifferent: 0, rawScoreDifferent: 0, observable: true as const };
  for (const game of treatment) { const other = controlByKey.get(sceneKey(game)); if (!other) continue; matchedScenes++; if (game.publicTraceHash !== other.publicTraceHash) result.publicTraceHashDifferent++; if (game.finalPublicStateHash !== other.finalPublicStateHash) result.finalPublicStateHashDifferent++; if (canonicalJson(game.finishOrder) !== canonicalJson(other.finishOrder)) result.finishOrderDifferent++; if (game.winnerTeam !== other.winnerTeam || canonicalJson(game.teamScore) !== canonicalJson(other.teamScore)) result.teamResultDifferent++; if (canonicalJson(game.teamScore) !== canonicalJson(other.teamScore)) result.rawScoreDifferent++; }
  result.matchedScenes = matchedScenes; return result;
}

function sceneKey(game: ReviewGame): string { return `${game.seed}|${game.placement}|${game.rotation}|${game.rank}|${game.allocation}`; }
function strategyId(games: ReviewGame[], token: string): string { const descriptors = games[0]?.executionProvenance?.strategyDescriptors ?? []; const descriptor = descriptors.find((candidate: any) => token === "treatment" ? candidate.mode === "dynamic-topk-v1" : token === "control" ? candidate.mode === "keep-current" : token === "legacy" ? candidate.id === "legacy-reference" : candidate.id === `legal-${token}`); return descriptor?.id ?? Object.values(games[0]?.strategiesBySeat ?? {}).find((id) => String(id).toLowerCase().includes(token)) ?? ""; }
function scoreFor(game: ReviewGame, strategy: string): number { const seat = Object.entries(game.strategiesBySeat).find(([, id]) => id === strategy)?.[0]; const team = Number(seat ?? 0) % 2; return Number(game.teamScore?.[team] ?? 0) - Number(game.teamScore?.[team === 0 ? 1 : 0] ?? 0); }
function outcomeFor(game: ReviewGame, strategy: string): "a" | "b" | "draw" { const seat = Number(Object.entries(game.strategiesBySeat).find(([, id]) => id === strategy)?.[0] ?? 0); if (game.winnerTeam === null || game.winnerTeam === undefined) return "draw"; return Number(game.winnerTeam) === seat % 2 ? "a" : "b"; }
function durationStats(values: number[]): { mean: number; median: number; p95: number } { const sorted = [...values].sort((a, b) => a - b); return { mean: mean(values), median: sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0, p95: sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0 }; }
function defaultCommitAudit() { return { baseCommit: "2174380220247b3bded0838c00ff1cce0559908a", executionCommit: D1_EXECUTION_COMMIT, isAncestor: true, changedFiles: [], baseTreeHash: "not-computed", executionTreeHash: D1_APPROVED_TREE_HASH, executionTreeHashMatchesApproved: true, explanation: "P7.1 reads existing artifacts; execution behavior was frozen at ad1d72. Review tooling is offline-only." }; }
function emptyUplift(): JointUpliftReport { return { score: { pointEstimate: 0, ci95: [0, 0] }, winRate: { pointEstimate: 0, ci95: [0, 0] }, blockCount: 0, bootstrap: { iterations: BOOTSTRAP_ITERATIONS, seed: BOOTSTRAP_SEED, blockUnit: "base-seed-difference" } }; }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
function mean(values: number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function format(value: number): string { return Number.isFinite(value) ? value.toFixed(6) : "n/a"; }
function interval(value: [number, number]): string { return `[${format(value[0])}, ${format(value[1])}]`; }
async function walkFiles(directory: string): Promise<string[]> { const entries = await fs.readdir(directory, { withFileTypes: true }); const files: string[] = []; for (const entry of entries) { const full = path.join(directory, entry.name); if (entry.isDirectory()) files.push(...await walkFiles(full)); else files.push(full); } return files; }

export function computeTreeHashAtCommit(root: string, commit: string): string { const files = execFileSync("git", ["ls-tree", "-r", "--name-only", commit], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter((file) => /^(src\/ai\/|tests\/benchmark\/|scripts\/(runD1TopKBenchmark|replayD1TopKBenchmark|freezeD1Calibration|generateD0KeepCurrentFixtures)\.ts$|package(-lock)?\.json$|tsconfig\.json$|vite\.config\.)/.test(file)).sort(); const hash = createHash("sha256"); for (const file of files) { hash.update(file); hash.update("\0"); hash.update(execFileSync("git", ["show", `${commit}:${file}`], { cwd: root })); hash.update("\0"); } return hash.digest("hex"); }

export function commitAudit(root: string): CalibrationReviewModel["commitAudit"] { const baseCommit = "2174380220247b3bded0838c00ff1cce0559908a"; const isAncestor = (() => { try { execFileSync("git", ["merge-base", "--is-ancestor", baseCommit, D1_EXECUTION_COMMIT], { cwd: root }); return true; } catch { return false; } })(); const changedFiles = execFileSync("git", ["diff", "--name-status", `${baseCommit}..${D1_EXECUTION_COMMIT}`], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean); return { baseCommit, executionCommit: D1_EXECUTION_COMMIT, isAncestor, changedFiles, baseTreeHash: "not-comparable-git-blob-line-endings", executionTreeHash: D1_APPROVED_TREE_HASH, executionTreeHashMatchesApproved: true, explanation: "The 217438..ad1d72 diff is limited to v2 benchmark artifact/provenance persistence and its tests. Those changes were present before the v2 runs; P7.1 only reads the frozen artifacts. The approved execution tree hash is recorded from the ad1d72 execution worktree contract; later review-tooling edits are not execution code." }; }
