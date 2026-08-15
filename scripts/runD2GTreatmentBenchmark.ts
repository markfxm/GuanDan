import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameRank } from "../src/engine/cards";
import {
  D2G_PROFILE_SCHEMA_VERSION,
  D2G_PROFILE_VERSION,
  createD2GSeedManifest,
  createD2GTreatmentProfile,
  type D2GProfilePhase,
  type D2GSeedManifest,
  type D2GTreatmentProfile,
} from "../src/ai/d2g/treatmentContracts";
import { sha256Bytes } from "../src/game/publicEventHash";
import {
  buildD2GCanonicalHeadToHeadTasks,
  type D2GCanonicalHeadToHeadTask,
} from "../tests/benchmark/d2gCanonicalAdapter";
import {
  createD2GCandidateReuseTracker,
  simulateD2GHeadToHeadGame,
  type D2GHeadToHeadGameResult,
  type D2GHeadToHeadSimulationOptions,
} from "../tests/benchmark/d2gHeadToHeadSimulator";
import {
  buildD2GManifest,
  buildD2GProvenance,
  canResumeD2GGame,
  hashD2GProvenance,
  validateD2GProvenanceHash,
  validateD2GResumeManifest,
  writeD2GArtifactsAtomically,
  type D2GManifest,
  type D2GProvenance,
} from "../tests/benchmark/d2gManifest";
import {
  buildD2GPublicReplay,
  buildD2GReportModel,
  validateD2GPublicReplay,
  type D2GPublicReplay,
  type D2GReportModel,
} from "../tests/benchmark/d2gReportModel";
import { isCorrectnessCleanGame, type D2GStatistics } from "../tests/benchmark/d2gStatistics";
import { canonicalJson } from "../tests/benchmark/contracts";
import type { AtomicD1Writer } from "../tests/benchmark/d1AtomicWriter";

export const D2G_FORMAL_NOT_FROZEN = "D2G_FORMAL_NOT_FROZEN" as const;
export const D2G_CALIBRATION_MATRIX_NOT_STARTED = "D2G_CALIBRATION_MATRIX_NOT_STARTED" as const;
export const D2G_SEED_NOT_ALLOWED = "D2G_SEED_NOT_ALLOWED" as const;

export type D2GSeedRange = Readonly<{ start: number; end: number }>;

export const D2G_SEED_INVENTORY = Object.freeze({
  priorRanges: Object.freeze({
    d0Formal: Object.freeze({ start: 1, end: 200 }),
    d1Smoke: Object.freeze({ start: 201, end: 220 }),
    d1Calibration: Object.freeze({ start: 221, end: 270 }),
    d1Formal: Object.freeze({ start: 1001, end: 1200 }),
    d1Diagnostics: Object.freeze({ start: 5001, end: 5052 }),
  }),
  d2gTests: Object.freeze([1, 11, 12, 14, 77]),
  d2fFixtures: Object.freeze(["d2f-public-rollout-calibration-v1"]),
  smoke: Object.freeze([9001]),
  calibrationReserved: Object.freeze([9101, 9102, 9103, 9104]),
  formalReserved: Object.freeze([9201, 9202, 9203, 9204]),
} as const);

export function isD2GSeedInRange(seed: number, range: D2GSeedRange): boolean {
  return Number.isSafeInteger(seed) && range.start <= seed && seed <= range.end;
}

const ENGINE_VERSION = "d2g-engine-v1";
const BENCHMARK_VERSION = "d2g-task5a-v1";
const CANDIDATE_ORDERING_VERSION = "production-decideAiAction-evaluatedCandidates-v1";
const STATISTICS_SCHEMA_VERSION = "d2g-statistics-v1";
const REPORT_SCHEMA_VERSION = "d2g-report-v1";
const REPLAY_SCHEMA_VERSION = "d2g-replay-v1";
const DEFAULT_RANK: GameRank = "10";
const DEFAULT_MATCHUP = "baseline-vs-treatment";
const DEFAULT_BOOTSTRAP_ITERATIONS = 200;
const DEFAULT_BOOTSTRAP_SEED = 1;

export type D2GRunnerPhase = "smoke" | "calibration-ready" | "formal";

export interface D2GRunnerConfig {
  phase: D2GRunnerPhase;
  rank: GameRank;
  matchup: string;
  baseSeeds: readonly number[];
  profile: D2GTreatmentProfile;
  seedManifest: D2GSeedManifest;
  provenance: D2GProvenance;
  configHash: string;
  roomRulesFingerprint: string;
  formalProfileFrozen: false;
  formalSeedsExecuted: false;
}

export interface D2GRunnerConfigOverrides {
  sourceCommit?: string;
  rank?: GameRank;
  matchup?: string;
  baseSeeds?: readonly number[];
}

export interface D2GRunPlan {
  expectedGameCount: number;
  tasks: readonly D2GCanonicalHeadToHeadTask[];
}

export interface D2GRunnerRunInput {
  phase?: D2GRunnerPhase;
  config?: D2GRunnerConfig;
  sourceCommit?: string;
  rank?: GameRank;
  matchup?: string;
  baseSeeds?: readonly number[];
  maxTurns?: number;
  outputDir?: string;
  checkpointDir?: string;
  writeArtifacts?: boolean;
  executeGame?: D2GGameExecutor;
}

export type D2GGameExecutor = (
  task: D2GCanonicalHeadToHeadTask,
  options: D2GHeadToHeadSimulationOptions,
) => D2GHeadToHeadGameResult;

interface D2GGameCheckpoint {
  schemaVersion: "d2g-task5a-game-checkpoint-v1";
  phase: "smoke";
  gameId: string;
  baseSeed: number;
  rotation: 0 | 1 | 2 | 3;
  allocation: "AB" | "BA";
  profileConfigurationHash: string;
  configHash: string;
  sourceCommit: string;
  engineVersion: string;
  roomRulesFingerprint: string;
  provenanceHash: string;
  semanticHash: string;
  replayIdentity: string;
  game: D2GHeadToHeadGameResult;
  replay: D2GPublicReplay;
}

export interface D2GRunnerCorrectnessSummary {
  illegalAction: number;
  invalidPass: number;
  cardConservationFailure: number;
  runtimePlanMismatch: number;
  crossGameCandidateReuse: number;
  unhandledError: number;
}

export interface D2GRunnerSmokeSummary {
  expectedGames: number;
  completedGames: number;
  unresolvedGames: number;
  failedGames: number;
  treatmentWins: number;
  treatmentLosses: number;
  treatmentWinRate: number | null;
  meanScoreDelta: number | null;
  meanLevelStepDelta: number | null;
  meanFinishUtilityDelta: number | null;
  disagreementCount: number;
  disagreementRate: number | null;
  treatmentControlledDecisions: number;
  actualTreatmentSelections: number;
  actualTreatmentFallbacks: number;
  fallbackRate: number | null;
  fallbackReasons: Readonly<Record<string, number>>;
  evidence: D2GStatistics["evidence"];
  latency: D2GStatistics["latency"];
  workUnits: D2GStatistics["workUnits"];
  correctness: D2GRunnerCorrectnessSummary;
  replayValidation: { checked: number; valid: number; invalid: number };
  manifestComplete: boolean;
  provenanceValidation: boolean;
  resumeValidation: { checked: number; accepted: number; rejected: number };
}

export interface D2GRunnerResult {
  phase: "smoke";
  config: D2GRunnerConfig;
  plan: D2GRunPlan;
  games: readonly D2GHeadToHeadGameResult[];
  replays: readonly D2GPublicReplay[];
  report: D2GReportModel;
  manifest: D2GManifest;
  deterministicIdentity: string;
  summary: D2GRunnerSmokeSummary;
  published: boolean;
}

export interface D2GRunnerIdentityInput {
  phase: "smoke" | "calibration-ready";
  configHash: string;
  games: readonly Readonly<{
    gameId: string;
    semanticHash: string;
    publicTraceHash: string;
    finalPublicLedgerHash: string;
    elapsedMs: number;
  }>[];
}

export function createD2GRunnerConfig(
  phase: D2GRunnerPhase,
  overrides: D2GRunnerConfigOverrides = {},
): D2GRunnerConfig {
  if (phase === "formal") throw new Error(D2G_FORMAL_NOT_FROZEN);
  const sourceCommit = overrides.sourceCommit ?? readSourceCommit();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("D2G_SOURCE_COMMIT_INVALID");
  const rank = overrides.rank ?? DEFAULT_RANK;
  const matchup = overrides.matchup ?? DEFAULT_MATCHUP;
  const profilePhase: D2GProfilePhase = phase === "smoke" ? "smoke" : "calibration";
  const defaultSeeds = phase === "smoke" ? D2G_SEED_INVENTORY.smoke : D2G_SEED_INVENTORY.calibrationReserved;
  const baseSeeds = [...(overrides.baseSeeds ?? defaultSeeds)];
  assertD2GSeedSetsDisjoint();
  assertSeedList(baseSeeds, "D2G_RUNNER_SEEDS_INVALID");
  assertD2GPhaseSeeds(phase, baseSeeds);
  const roomRulesFingerprint = hashCanonical({
    schemaVersion: "d2g-room-rules-fingerprint-v1",
    roomModule: "src/game/room.ts",
    settlementModule: "src/game/settlement.ts",
    engineVersion: ENGINE_VERSION,
  });
  const profile = createD2GTreatmentProfile({
    schemaVersion: D2G_PROFILE_SCHEMA_VERSION,
    profileVersion: D2G_PROFILE_VERSION,
    profileId: `d2g-${profilePhase}-v1`,
    phase: profilePhase,
    budget: {
      particleCount: 1,
      replicateCountPerScenario: 1,
      maxPliesPerReplicate: 1,
      maxPolicyActionEvaluationsPerPly: 32,
      maxWorkUnits: 32,
    },
    evidenceRequirements: {
      schemaVersion: "d2f-rollout-evidence-requirements-v1",
      minimumEffectiveSampleSize: 1,
      minimumAcceptedScenarioCount: 1,
      minimumCompletedReplicateCount: 1,
      requireCompleteCoverage: true,
    },
    riskPolicy: {
      schemaVersion: "d2f-rollout-risk-policy-v1",
      variancePenalty: 0,
      downsideRiskPenalty: 0,
    },
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: {
      benchmarkVersion: BENCHMARK_VERSION,
      sourceCommit,
      engineVersion: ENGINE_VERSION,
      roomRulesFingerprint,
      candidateOrderingVersion: CANDIDATE_ORDERING_VERSION,
      statisticsSchemaVersion: STATISTICS_SCHEMA_VERSION,
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
    },
  });
  const configHash = hashCanonical({
    schemaVersion: "d2g-task5a-runner-config-v1",
    phase,
    rank,
    matchup,
    baseSeeds,
    profileConfigurationHash: profile.configurationHash,
    sourceCommit,
    roomRulesFingerprint,
    bootstrapIterations: DEFAULT_BOOTSTRAP_ITERATIONS,
    bootstrapSeed: DEFAULT_BOOTSTRAP_SEED,
  });
  const seedManifest = createD2GSeedManifest({
    schemaVersion: "d2g-seed-manifest-v1",
    phase: profilePhase,
    manifestId: `d2g-task5a-${phase}-seeds-v1`,
    profileId: profile.profileId,
    profileConfigurationHash: profile.configurationHash,
    seeds: baseSeeds,
  });
  const provenance = buildD2GProvenance({
    benchmarkVersion: BENCHMARK_VERSION,
    sourceCommit,
    engineVersion: ENGINE_VERSION,
    roomRulesFingerprint,
    profileConfigurationHash: profile.configurationHash,
    configHash,
    statisticsSchemaVersion: STATISTICS_SCHEMA_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    replaySchemaVersion: REPLAY_SCHEMA_VERSION,
    baseSeeds,
    bootstrapIterations: DEFAULT_BOOTSTRAP_ITERATIONS,
    bootstrapSeed: DEFAULT_BOOTSTRAP_SEED,
  });
  return {
    phase,
    rank,
    matchup,
    baseSeeds,
    profile,
    seedManifest,
    provenance,
    configHash,
    roomRulesFingerprint,
    formalProfileFrozen: false,
    formalSeedsExecuted: false,
  };
}

export function buildD2GRunPlan(config: D2GRunnerConfig): D2GRunPlan {
  if (config.phase === "formal") throw new Error(D2G_FORMAL_NOT_FROZEN);
  const tasks = config.baseSeeds.flatMap((baseSeed) => buildD2GCanonicalHeadToHeadTasks({
    baseSeed,
    rank: config.rank,
    profile: config.profile,
    matchup: config.matchup,
    configHash: config.configHash,
  }));
  return { expectedGameCount: config.baseSeeds.length * 8, tasks };
}

export function getD2GCheckpointPath(
  checkpointDir: string,
  config: Pick<D2GRunnerConfig, "configHash">,
  task: Pick<D2GCanonicalHeadToHeadTask, "gameId">,
): string {
  return join(resolve(checkpointDir), config.configHash, `${safeCheckpointName(task.gameId)}.json`);
}

export async function runD2GTreatmentBenchmark(input: D2GRunnerRunInput = {}): Promise<D2GRunnerResult> {
  const phase = input.phase ?? "smoke";
  const config = input.config ?? createD2GRunnerConfig(phase, {
    sourceCommit: input.sourceCommit,
    rank: input.rank,
    matchup: input.matchup,
    baseSeeds: input.baseSeeds,
  });
  if (config.phase === "formal") throw new Error(D2G_FORMAL_NOT_FROZEN);
  if (config.phase === "calibration-ready") throw new Error(D2G_CALIBRATION_MATRIX_NOT_STARTED);
  const plan = buildD2GRunPlan(config);
  const tracker = createD2GCandidateReuseTracker();
  const artifactOutputDir = input.outputDir ?? (input.writeArtifacts === true ? "artifacts/d2g-task5a-smoke" : undefined);
  const checkpointDir = input.checkpointDir ?? (artifactOutputDir === undefined ? undefined : join(resolve(artifactOutputDir), "checkpoints"));
  if (checkpointDir !== undefined) await mkdir(join(resolve(checkpointDir), config.configHash), { recursive: true });
  const executeGame = input.executeGame ?? ((task, options) => simulateD2GHeadToHeadGame(task, options));
  const games: D2GHeadToHeadGameResult[] = [];
  const replayByGameId = new Map<string, D2GPublicReplay>();
  for (const task of plan.tasks) {
    const checkpoint = checkpointDir === undefined ? undefined : await readD2GCheckpoint(getD2GCheckpointPath(checkpointDir, config, task), task, config);
    if (checkpoint !== undefined) {
      games.push(checkpoint.game);
      replayByGameId.set(checkpoint.game.gameId, checkpoint.replay);
      continue;
    }
    const game = executeGame(task, { candidateReuseTracker: tracker, maxTurns: input.maxTurns });
    games.push(game);
    let replay: D2GPublicReplay | undefined;
    try {
      replay = buildD2GPublicReplay(game, config.provenance);
      validateD2GPublicReplay(replay, config.provenance);
      replayByGameId.set(game.gameId, replay);
    } catch {
      // The game remains in the report and manifest as unresolved evidence.
    }
    if (checkpointDir !== undefined && replay !== undefined && isCorrectnessCleanGame(game, config.provenance)) {
      await writeD2GCheckpoint(getD2GCheckpointPath(checkpointDir, config, task), {
        schemaVersion: "d2g-task5a-game-checkpoint-v1",
        phase: "smoke",
        gameId: game.gameId,
        baseSeed: game.baseSeed,
        rotation: game.rotation,
        allocation: game.allocation,
        profileConfigurationHash: config.provenance.profileConfigurationHash,
        configHash: config.provenance.configHash,
        sourceCommit: config.provenance.sourceCommit,
        engineVersion: config.provenance.engineVersion,
        roomRulesFingerprint: config.provenance.roomRulesFingerprint,
        provenanceHash: hashD2GProvenance(config.provenance),
        semanticHash: game.semanticHash,
        replayIdentity: replay.replayIdentity,
        game,
        replay,
      });
    }
  }
  const replays = games.flatMap((game) => {
    const replay = replayByGameId.get(game.gameId);
    return replay === undefined ? [] : [replay];
  });
  const report = buildD2GReportModel({
    provenance: config.provenance,
    games,
    bootstrapIterations: DEFAULT_BOOTSTRAP_ITERATIONS,
    bootstrapSeed: DEFAULT_BOOTSTRAP_SEED,
  });
  const manifest = buildD2GManifest({
    provenance: config.provenance,
    profile: config.profile,
    rank: config.rank,
    matchup: config.matchup,
    games,
  });
  const deterministicIdentity = computeD2GRunnerDeterministicIdentity({
    phase: "smoke",
    configHash: config.configHash,
    games,
  });
  const summary = summarizeD2GReport(report, {
    expectedGames: plan.expectedGameCount,
    games,
    replays,
    manifest,
    provenance: config.provenance,
  });
  let published = false;
  if ((input.writeArtifacts === true || input.outputDir !== undefined) && manifest.complete) {
    const outputDir = resolve(artifactOutputDir ?? "artifacts/d2g-task5a-smoke");
    await mkdir(outputDir, { recursive: true });
    const reportPath = `${outputDir}/d2g-report.json`;
    const manifestPath = `${outputDir}/d2g-manifest.json`;
    const artifact = {
      schemaVersion: "d2g-task5a-artifact-v1",
      phase: config.phase,
      profile: config.profile,
      seedManifest: config.seedManifest,
      provenance: config.provenance,
      replays,
      report,
    };
    const { createNodeD1Writer } = await import("../tests/benchmark/d1AtomicWriter");
    await publishD2GArtifacts({
      writer: createNodeD1Writer(),
      reportPath,
      reportJson: canonicalJson(artifact),
      manifestPath,
      manifestJson: canonicalJson(manifest),
    });
    published = true;
  }
  return { phase: "smoke", config, plan, games, replays, report, manifest, deterministicIdentity, summary, published };
}

export async function publishD2GArtifacts(input: {
  writer: AtomicD1Writer;
  reportPath: string;
  reportJson: string;
  manifestPath: string;
  manifestJson: string;
}): Promise<void> {
  await writeD2GArtifactsAtomically(input.writer, input.reportPath, input.reportJson, input.manifestPath, input.manifestJson);
}

export function computeD2GRunnerDeterministicIdentity(input: D2GRunnerIdentityInput): string {
  return hashCanonical({
    schemaVersion: "d2g-task5a-deterministic-identity-v1",
    phase: input.phase,
    configHash: input.configHash,
    games: input.games.map(({ elapsedMs: _elapsedMs, ...game }) => game),
  });
}

export function validateD2GResumeContract(input: {
  previousManifest: D2GManifest;
  nextManifest: D2GManifest;
  game: D2GHeadToHeadGameResult;
  replay?: D2GPublicReplay;
}): true {
  if (input.previousManifest.profileConfigurationHash !== input.nextManifest.profileConfigurationHash) throw new Error("D2G_RESUME_PROFILE_MISMATCH");
  if (input.previousManifest.configHash !== input.nextManifest.configHash) throw new Error("D2G_RESUME_CONFIG_MISMATCH");
  if (input.previousManifest.provenanceHash !== input.nextManifest.provenanceHash) throw new Error("D2G_RESUME_PROVENANCE_MISMATCH");
  if (input.previousManifest.expectedGameIds !== undefined && input.nextManifest.expectedGameIds !== undefined) validateD2GResumeManifest(input.previousManifest, input.nextManifest);
  if (input.replay === undefined || !canResumeD2GGame(input.game, input.previousManifest, input.replay)) throw new Error("D2G_RESUME_PUBLIC_REPLAY_MISMATCH");
  return true;
}

export function summarizeD2GReport(
  report: Pick<D2GReportModel, "statistics">,
  context?: {
    expectedGames: number;
    games: readonly D2GHeadToHeadGameResult[];
    replays: readonly D2GPublicReplay[];
    manifest: D2GManifest;
    provenance: D2GProvenance;
  },
): D2GRunnerSmokeSummary {
  const statistics = report.statistics;
  const expectedGames = context?.expectedGames ?? statistics.rawGameCount;
  const games = context?.games ?? [];
  const disagreementCount = statistics.treatmentControlledDecisionCount === 0
    ? 0
    : games.reduce((sum, game) => sum + game.decisionTelemetry.filter((record) => record.actingStrategy === "treatment" && record.disagreement === true).length, 0);
  const correctness = games.reduce<D2GRunnerCorrectnessSummary>((summary, game) => {
    for (const error of game.errors) {
      if (/illegal action/i.test(error)) summary.illegalAction += 1;
      if (/invalid pass/i.test(error)) summary.invalidPass += 1;
    }
    summary.cardConservationFailure += game.cardConservation ? 0 : 1;
    summary.runtimePlanMismatch += game.runtimePlanMismatchCount;
    summary.crossGameCandidateReuse += game.crossGameCandidateReuseCount;
    summary.unhandledError += game.errorCounters.total;
    return summary;
  }, { illegalAction: 0, invalidPass: 0, cardConservationFailure: 0, runtimePlanMismatch: 0, crossGameCandidateReuse: 0, unhandledError: 0 });
  let provenanceValidation = false;
  if (context !== undefined) {
    try {
      provenanceValidation = validateD2GProvenanceHash(context.provenance, context.manifest.provenanceHash);
    } catch {
      provenanceValidation = false;
    }
  }
  const resumeResults = context?.games.map((game) => {
    const replay = context.replays.find((candidate) => candidate.gameId === game.gameId);
    return replay !== undefined && context.manifest.completedGameIds.includes(game.gameId) && canResumeD2GGame(game, context.manifest, replay);
  }) ?? [];
  return {
    expectedGames,
    completedGames: statistics.resolvedGameCount,
    unresolvedGames: statistics.unresolvedGameCount,
    failedGames: statistics.unresolvedByReason.failed,
    treatmentWins: statistics.treatmentWins,
    treatmentLosses: statistics.treatmentLosses,
    treatmentWinRate: statistics.treatmentWinRate,
    meanScoreDelta: statistics.meanScoreDelta,
    meanLevelStepDelta: statistics.meanLevelStepDelta,
    meanFinishUtilityDelta: statistics.meanFinishUtilityDelta,
    disagreementCount,
    disagreementRate: statistics.treatmentControlledDecisionCount === 0 ? null : disagreementCount / statistics.treatmentControlledDecisionCount,
    treatmentControlledDecisions: statistics.treatmentControlledDecisionCount,
    actualTreatmentSelections: statistics.executedTreatmentSelectionCount,
    actualTreatmentFallbacks: statistics.executedTreatmentFallbackCount,
    fallbackRate: statistics.executedTreatmentFallbackRate,
    fallbackReasons: statistics.fallbackCounts,
    evidence: statistics.evidence,
    latency: statistics.latency,
    workUnits: statistics.workUnits,
    correctness,
    replayValidation: {
      checked: context?.games.length ?? 0,
      valid: context?.replays.length ?? 0,
      invalid: Math.max(0, (context?.games.length ?? 0) - (context?.replays.length ?? 0)),
    },
    manifestComplete: context?.manifest.complete ?? false,
    provenanceValidation,
    resumeValidation: {
      checked: resumeResults.length,
      accepted: resumeResults.filter(Boolean).length,
      rejected: resumeResults.filter((value) => !value).length,
    },
  };
}

export function formatD2GRunnerSmokeReport(result: D2GRunnerResult): string {
  return JSON.stringify({
    phase: result.phase,
    profileHash: result.config.profile.configurationHash,
    configHash: result.config.configHash,
    sourceCommit: result.config.provenance.sourceCommit,
    roomRulesFingerprint: result.config.provenance.roomRulesFingerprint,
    seedManifest: result.config.seedManifest,
    deterministicIdentity: result.deterministicIdentity,
    summary: result.summary,
    reportDeterministicIdentity: result.report.deterministicIdentity,
    published: result.published,
  }, null, 2);
}

async function readD2GCheckpoint(
  checkpointPath: string,
  task: D2GCanonicalHeadToHeadTask,
  config: D2GRunnerConfig,
): Promise<{ game: D2GHeadToHeadGameResult; replay: D2GPublicReplay } | undefined> {
  let raw: string;
  try {
    raw = await readFile(checkpointPath, "utf8");
  } catch (error) {
    if (isNodeFileNotFound(error)) return undefined;
    throw new Error(`D2G_CHECKPOINT_READ_FAILED:${checkpointPath}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`D2G_CHECKPOINT_INVALID:${checkpointPath}`);
  }
  if (!isD2GGameCheckpoint(value)) throw new Error(`D2G_CHECKPOINT_INVALID:${checkpointPath}`);

  const expectedProvenanceHash = hashD2GProvenance(config.provenance);
  if (value.phase !== config.phase
    || value.gameId !== task.gameId
    || value.baseSeed !== task.baseSeed
    || value.rotation !== task.rotation
    || value.allocation !== task.allocation
    || value.profileConfigurationHash !== config.provenance.profileConfigurationHash
    || value.configHash !== config.provenance.configHash
    || value.sourceCommit !== config.provenance.sourceCommit
    || value.engineVersion !== config.provenance.engineVersion
    || value.roomRulesFingerprint !== config.provenance.roomRulesFingerprint
    || value.provenanceHash !== expectedProvenanceHash
    || value.semanticHash !== value.game.semanticHash
    || value.replayIdentity !== value.replay.replayIdentity
    || value.game.gameId !== task.gameId
    || value.game.baseSeed !== task.baseSeed
    || value.game.rotation !== task.rotation
    || value.game.allocation !== task.allocation
    || value.game.rotationPairKey !== task.rotationPairKey
    || value.game.rank !== task.rank
    || value.game.matchup !== task.matchup
    || value.game.baselineTeam !== task.baselineTeam
    || value.game.treatmentTeam !== task.treatmentTeam
    || canonicalJson(value.game.strategyAssignment) !== canonicalJson(task.strategyAssignment)) {
    throw new Error(`D2G_CHECKPOINT_IDENTITY_MISMATCH:${checkpointPath}`);
  }

  try {
    validateD2GPublicReplay(value.replay, config.provenance);
    const manifest = buildD2GManifest({
      provenance: config.provenance,
      profile: config.profile,
      rank: config.rank,
      matchup: config.matchup,
      games: [value.game],
    });
    if (!canResumeD2GGame(value.game, manifest, value.replay)) throw new Error("D2G_CHECKPOINT_NOT_RESUMABLE");
  } catch {
    throw new Error(`D2G_CHECKPOINT_NOT_RESUMABLE:${checkpointPath}`);
  }
  return { game: value.game, replay: value.replay };
}

async function writeD2GCheckpoint(checkpointPath: string, checkpoint: D2GGameCheckpoint): Promise<void> {
  const checkpointJson = canonicalJson(checkpoint);
  try {
    JSON.parse(checkpointJson);
    const temporaryPath = `${checkpointPath}.tmp`;
    await writeFile(temporaryPath, checkpointJson, "utf8");
    await rename(temporaryPath, checkpointPath);
  } catch (error) {
    await rm(`${checkpointPath}.tmp`, { force: true }).catch(() => undefined);
    throw new Error(`D2G_CHECKPOINT_WRITE_FAILED:${checkpointPath}`);
  }
}

function isD2GGameCheckpoint(value: unknown): value is D2GGameCheckpoint {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<D2GGameCheckpoint>;
  return candidate.schemaVersion === "d2g-task5a-game-checkpoint-v1"
    && candidate.phase === "smoke"
    && typeof candidate.gameId === "string"
    && Number.isSafeInteger(candidate.baseSeed)
    && (candidate.rotation === 0 || candidate.rotation === 1 || candidate.rotation === 2 || candidate.rotation === 3)
    && (candidate.allocation === "AB" || candidate.allocation === "BA")
    && typeof candidate.profileConfigurationHash === "string"
    && typeof candidate.configHash === "string"
    && typeof candidate.sourceCommit === "string"
    && typeof candidate.engineVersion === "string"
    && typeof candidate.roomRulesFingerprint === "string"
    && typeof candidate.provenanceHash === "string"
    && typeof candidate.semanticHash === "string"
    && typeof candidate.replayIdentity === "string"
    && candidate.game !== undefined
    && candidate.replay !== undefined;
}

function isNodeFileNotFound(error: unknown): boolean {
  return error !== null && typeof error === "object" && (error as { code?: unknown }).code === "ENOENT";
}

function safeCheckpointName(gameId: string): string {
  return gameId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function assertD2GSeedSetsDisjoint(): void {
  const sets = [D2G_SEED_INVENTORY.smoke, D2G_SEED_INVENTORY.calibrationReserved, D2G_SEED_INVENTORY.formalReserved];
  const all = sets.flat();
  if (new Set(all).size !== all.length) throw new Error("D2G_SEED_OVERLAP");
}

function assertD2GPhaseSeeds(phase: Exclude<D2GRunnerPhase, "formal">, seeds: readonly number[]): void {
  const allowed = phase === "smoke" ? D2G_SEED_INVENTORY.smoke : D2G_SEED_INVENTORY.calibrationReserved;
  const allowedSet = new Set(allowed);
  const invalid = seeds.find((seed) => !allowedSet.has(seed));
  if (invalid !== undefined) throw new Error(`${D2G_SEED_NOT_ALLOWED}:${phase}:${invalid}`);
}

function assertSeedList(seeds: readonly number[], error: string): void {
  if (seeds.length === 0 || seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0) || new Set(seeds).size !== seeds.length) throw new Error(error);
}

function readSourceCommit(): string {
  const fromEnvironment = process.env.D2G_SOURCE_COMMIT;
  if (fromEnvironment !== undefined) return fromEnvironment;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("D2G_SOURCE_COMMIT_UNAVAILABLE");
  }
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}

async function main(): Promise<void> {
  const [requestedPhase = "smoke", ...args] = process.argv.slice(2);
  const phase = requestedPhase as D2GRunnerPhase;
  if (phase === "formal") throw new Error(D2G_FORMAL_NOT_FROZEN);
  const outputDir = optionValue(args, "--output-dir");
  const sourceCommit = optionValue(args, "--source-commit");
  const maxTurnsText = optionValue(args, "--max-turns");
  const maxTurns = maxTurnsText === undefined ? undefined : Number(maxTurnsText);
  if (phase === "calibration-ready") {
    console.log(canonicalJson(createD2GRunnerConfig(phase, { sourceCommit })));
    return;
  }
  if (phase !== "smoke") throw new Error("D2G_PHASE_INVALID");
  const result = await runD2GTreatmentBenchmark({ phase, sourceCommit, outputDir, writeArtifacts: outputDir !== undefined, maxTurns });
  console.log(formatD2GRunnerSmokeReport(result));
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (process.argv[1] !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
