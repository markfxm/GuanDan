import { createHash } from "node:crypto";
import type { D2GTreatmentProfile } from "../../src/ai/d2g/treatmentContracts";
import type { GameRank } from "../../src/engine/cards";
import { buildD2GCanonicalHeadToHeadTasks } from "./d2gCanonicalAdapter";
import type { D2GHeadToHeadGameResult } from "./d2gHeadToHeadSimulator";
import { canonicalJson } from "./contracts";
import { hasD2GErrorEvidence, isCorrectnessCleanGame } from "./d2gStatistics";
import { AtomicD1Writer } from "./d1AtomicWriter";
import { validateD2GPublicReplay, type D2GPublicReplay } from "./d2gReportModel";

export const D2G_PROVENANCE_SCHEMA = "d2g-provenance-v1" as const;
export const D2G_MANIFEST_SCHEMA = "d2g-manifest-v1" as const;

export interface D2GProvenance {
  schemaVersion: typeof D2G_PROVENANCE_SCHEMA;
  benchmarkVersion: string;
  sourceCommit: string;
  engineVersion: string;
  roomRulesFingerprint: string;
  profileConfigurationHash: string;
  configHash: string;
  statisticsSchemaVersion: string;
  reportSchemaVersion: string;
  replaySchemaVersion: string;
  bootstrapIterations: number;
  bootstrapSeed: number;
  baseSeeds: readonly number[];
  rotations: readonly [0, 1, 2, 3];
  allocations: readonly ["AB", "BA"];
}

export interface D2GManifest {
  schemaVersion: typeof D2G_MANIFEST_SCHEMA;
  manifestVersion: "d2g-v1";
  benchmarkVersion: string;
  sourceCommit: string;
  engineVersion: string;
  roomRulesFingerprint: string;
  profileConfigurationHash: string;
  configHash: string;
  statisticsSchemaVersion: string;
  reportSchemaVersion: string;
  replaySchemaVersion: string;
  bootstrapIterations: number;
  bootstrapSeed: number;
  baseSeeds: readonly number[];
  rotations: readonly [0, 1, 2, 3];
  allocations: readonly ["AB", "BA"];
  rank: GameRank;
  matchup: string;
  expectedGameIds: readonly string[];
  completedGameIds: readonly string[];
  failedGameIds: readonly string[];
  missingGameIds: readonly string[];
  duplicateGameIds: readonly string[];
  unknownGameIds: readonly string[];
  unresolvedGameCount: number;
  rotationAllocationMatrix: readonly string[];
  games: readonly D2GHeadToHeadGameResult[];
  provenanceHash: string;
  complete: boolean;
  resumeSupported: true;
}

export interface D2GManifestInput {
  provenance: D2GProvenance;
  profile: D2GTreatmentProfile;
  rank: GameRank;
  matchup: string;
  games: readonly D2GHeadToHeadGameResult[];
}

export function buildD2GProvenance(input: Omit<D2GProvenance, "schemaVersion" | "rotations" | "allocations" | "bootstrapIterations" | "bootstrapSeed"> & Partial<Pick<D2GProvenance, "bootstrapIterations" | "bootstrapSeed">>): D2GProvenance {
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit)) throw new Error("SOURCE_COMMIT_INVALID");
  for (const [name, value] of [["roomRulesFingerprint", input.roomRulesFingerprint], ["profileConfigurationHash", input.profileConfigurationHash], ["configHash", input.configHash]] as const) {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name.toUpperCase()}_INVALID`);
  }
  if (input.benchmarkVersion.length === 0 || input.engineVersion.length === 0 || input.statisticsSchemaVersion.length === 0 || input.reportSchemaVersion.length === 0 || input.replaySchemaVersion.length === 0) throw new Error("PROVENANCE_METADATA_INVALID");
  const baseSeeds = [...input.baseSeeds].sort((left, right) => left - right);
  if (baseSeeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0) || new Set(baseSeeds).size !== baseSeeds.length) throw new Error("BASE_SEEDS_INVALID");
  const bootstrapIterations = input.bootstrapIterations ?? 200;
  const bootstrapSeed = input.bootstrapSeed ?? 1;
  if (!Number.isSafeInteger(bootstrapIterations) || bootstrapIterations < 0 || !Number.isSafeInteger(bootstrapSeed) || bootstrapSeed < 0) throw new Error("BOOTSTRAP_CONFIG_INVALID");
  return {
    schemaVersion: D2G_PROVENANCE_SCHEMA,
    ...input,
    baseSeeds,
    rotations: [0, 1, 2, 3],
    allocations: ["AB", "BA"],
    bootstrapIterations,
    bootstrapSeed,
  };
}

export function hashD2GProvenance(provenance: D2GProvenance): string {
  assertD2GProvenance(provenance);
  return createHash("sha256").update(canonicalJson(provenance)).digest("hex");
}

export function validateD2GProvenanceHash(provenance: unknown, expectedHash: unknown): true {
  assertD2GProvenance(provenance);
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash) || hashD2GProvenance(provenance) !== expectedHash) throw new Error("PROVENANCE_HASH_MISMATCH");
  return true;
}

export function buildD2GManifest(input: D2GManifestInput): D2GManifest {
  assertD2GProvenance(input.provenance);
  if (input.provenance.profileConfigurationHash !== input.profile.configurationHash) throw new Error("PROFILE_CONFIG_MISMATCH");
  if (input.provenance.benchmarkVersion !== input.profile.benchmarkMetadata.benchmarkVersion || input.provenance.sourceCommit !== input.profile.benchmarkMetadata.sourceCommit || input.provenance.engineVersion !== input.profile.benchmarkMetadata.engineVersion || input.provenance.roomRulesFingerprint !== input.profile.benchmarkMetadata.roomRulesFingerprint || input.provenance.statisticsSchemaVersion !== input.profile.benchmarkMetadata.statisticsSchemaVersion || input.provenance.reportSchemaVersion !== input.profile.benchmarkMetadata.reportSchemaVersion) throw new Error("PROFILE_METADATA_MISMATCH");
  const expectedTasks = input.provenance.baseSeeds.flatMap((baseSeed) => buildD2GCanonicalHeadToHeadTasks({ baseSeed, rank: input.rank, profile: input.profile, matchup: input.matchup, configHash: input.provenance.configHash }));
  const expectedById = new Map(expectedTasks.map((task) => [task.gameId, task]));
  const expectedGameIds = expectedTasks.map((task) => task.gameId).sort();
  const seen = new Set<string>();
  for (const game of input.games) {
    if (seen.has(game.gameId)) throw new Error(`DUPLICATE_GAME_ID:${game.gameId}`);
    seen.add(game.gameId);
    const expected = expectedById.get(game.gameId);
    if (expected === undefined) throw new Error(`UNKNOWN_GAME_ID:${game.gameId}`);
    if (game.profileHash !== expected.profileHash) throw new Error(`PROFILE_HASH_MISMATCH:${game.gameId}`);
    if (game.configHash !== expected.configHash) throw new Error(`CONFIG_HASH_MISMATCH:${game.gameId}`);
    if (game.rank !== expected.rank) throw new Error(`GAME_ID_METADATA_MISMATCH:${game.gameId}`);
    if (game.baseSeed !== expected.baseSeed || game.rotation !== expected.rotation || game.allocation !== expected.allocation || game.rotationPairKey !== expected.rotationPairKey || game.matchup !== expected.matchup || game.baselineTeam !== expected.baselineTeam || game.treatmentTeam !== expected.treatmentTeam || canonicalJson(game.strategyAssignment) !== canonicalJson(expected.strategyAssignment)) throw new Error(`GAME_ID_METADATA_MISMATCH:${game.gameId}`);
  }
  const actualIds = [...seen].sort();
  const missingGameIds = expectedGameIds.filter((id) => !seen.has(id));
  const completedGameIds = input.games.filter((game) => isCorrectnessCleanGame(game, input.provenance)).map((game) => game.gameId).sort();
  const failedGameIds = input.games.filter((game) => game.termination === "error" || hasD2GErrorEvidence(game.errorCounters) || game.errors.length > 0).map((game) => game.gameId).sort();
  const unresolvedGameCount = expectedGameIds.length - completedGameIds.length;
  const provenanceHash = hashD2GProvenance(input.provenance);
  const { schemaVersion: _provenanceSchemaVersion, ...provenanceMetadata } = input.provenance;
  return {
    schemaVersion: D2G_MANIFEST_SCHEMA,
    manifestVersion: "d2g-v1",
    ...provenanceMetadata,
    rank: input.rank,
    matchup: input.matchup,
    expectedGameIds,
    completedGameIds,
    failedGameIds,
    missingGameIds,
    duplicateGameIds: [],
    unknownGameIds: [],
    unresolvedGameCount,
    rotationAllocationMatrix: expectedTasks.map((task) => `${task.rotation}:${task.allocation}`).sort(),
    games: [...input.games].sort((left, right) => left.gameId.localeCompare(right.gameId)),
    provenanceHash,
    complete: actualIds.length === expectedGameIds.length && missingGameIds.length === 0 && completedGameIds.length === expectedGameIds.length,
    resumeSupported: true,
  };
}

export function canResumeD2GGame(game: D2GHeadToHeadGameResult, manifest: D2GManifest, replay?: D2GPublicReplay): boolean {
  if (replay === undefined) return false;
  try {
    validateD2GPublicReplay(replay, provenanceFromManifest(manifest));
  } catch {
    return false;
  }
  const expectedGame = manifest.games.find((candidate) => candidate.gameId === game.gameId);
  return expectedGame !== undefined
    && manifest.expectedGameIds.includes(game.gameId)
    && game.configHash === manifest.configHash
    && game.profileHash === manifest.profileConfigurationHash
    && game.baseSeed !== undefined
    && manifest.baseSeeds.includes(game.baseSeed)
    && replay.gameId === game.gameId
    && game.baseSeed === expectedGame.baseSeed
    && game.rank === expectedGame.rank
    && game.rotation === expectedGame.rotation
    && game.allocation === expectedGame.allocation
    && game.rotationPairKey === expectedGame.rotationPairKey
    && game.baselineTeam === expectedGame.baselineTeam
    && game.treatmentTeam === expectedGame.treatmentTeam
    && canonicalJson(game.strategyAssignment) === canonicalJson(expectedGame.strategyAssignment)
    && replay.configHash === game.configHash
    && replay.baseSeed === game.baseSeed
    && replay.rank === game.rank
    && replay.rotation === game.rotation
    && replay.allocation === game.allocation
    && replay.rotationPairKey === game.rotationPairKey
    && replay.baselineTeam === game.baselineTeam
    && replay.treatmentTeam === game.treatmentTeam
    && canonicalJson(replay.publicEvents) === canonicalJson(game.publicEvents)
    && canonicalJson(replay.finishOrder) === canonicalJson(game.finishOrder)
    && replay.winnerTeam === game.winnerTeam
    && replay.winningPartnership === game.winningPartnership
    && replay.publicTraceHash === game.publicTraceHash
    && replay.finalPublicLedgerHash === game.finalPublicLedgerHash
    && replay.semanticHash === game.semanticHash
    && isCorrectnessCleanGame(game, provenanceFromManifest(manifest))
    && manifest.completedGameIds.includes(game.gameId)
    && validateGameProvenance(game, manifest);
}

export function validateD2GResumeManifest(previous: D2GManifest, next: D2GManifest): true {
  if (previous.sourceCommit !== next.sourceCommit) throw new Error("SOURCE_COMMIT_MISMATCH");
  if (previous.profileConfigurationHash !== next.profileConfigurationHash) throw new Error("PROFILE_CONFIG_MISMATCH");
  if (previous.configHash !== next.configHash) throw new Error("CONFIG_HASH_MISMATCH");
  if (previous.provenanceHash !== next.provenanceHash) throw new Error("PROVENANCE_HASH_MISMATCH");
  if (previous.benchmarkVersion !== next.benchmarkVersion || previous.engineVersion !== next.engineVersion || previous.roomRulesFingerprint !== next.roomRulesFingerprint || previous.statisticsSchemaVersion !== next.statisticsSchemaVersion || previous.reportSchemaVersion !== next.reportSchemaVersion || previous.replaySchemaVersion !== next.replaySchemaVersion || previous.bootstrapIterations !== next.bootstrapIterations || previous.bootstrapSeed !== next.bootstrapSeed || previous.rank !== next.rank || previous.matchup !== next.matchup || canonicalJson(previous.rotations) !== canonicalJson(next.rotations) || canonicalJson(previous.allocations) !== canonicalJson(next.allocations)) throw new Error("PROVENANCE_METADATA_MISMATCH");
  if (canonicalJson(previous.expectedGameIds) !== canonicalJson(next.expectedGameIds)) throw new Error("EXPECTED_GAME_IDS_MISMATCH");
  return true;
}

export async function writeD2GArtifactsAtomically(writer: AtomicD1Writer, gamesPath: string, gamesJson: string, manifestPath: string, manifestJson: string): Promise<void> {
  await writer.writeBatch(gamesPath, gamesJson, manifestPath, manifestJson);
}

function validateGameProvenance(game: D2GHeadToHeadGameResult, manifest: D2GManifest): boolean {
  return game.matchup === manifest.matchup && game.profileHash === manifest.profileConfigurationHash;
}

function provenanceFromManifest(manifest: D2GManifest): D2GProvenance {
  return {
    schemaVersion: D2G_PROVENANCE_SCHEMA,
    benchmarkVersion: manifest.benchmarkVersion,
    sourceCommit: manifest.sourceCommit,
    engineVersion: manifest.engineVersion,
    roomRulesFingerprint: manifest.roomRulesFingerprint,
    profileConfigurationHash: manifest.profileConfigurationHash,
    configHash: manifest.configHash,
    statisticsSchemaVersion: manifest.statisticsSchemaVersion,
    reportSchemaVersion: manifest.reportSchemaVersion,
    replaySchemaVersion: manifest.replaySchemaVersion,
    bootstrapIterations: manifest.bootstrapIterations,
    bootstrapSeed: manifest.bootstrapSeed,
    baseSeeds: manifest.baseSeeds,
    rotations: manifest.rotations,
    allocations: manifest.allocations,
  };
}

function assertD2GProvenance(value: unknown): asserts value is D2GProvenance {
  if (value === null || typeof value !== "object") throw new Error("PROVENANCE_MISSING");
  const provenance = value as Partial<D2GProvenance>;
  if (provenance.schemaVersion !== D2G_PROVENANCE_SCHEMA || typeof provenance.benchmarkVersion !== "string" || typeof provenance.sourceCommit !== "string" || typeof provenance.engineVersion !== "string" || typeof provenance.roomRulesFingerprint !== "string" || typeof provenance.profileConfigurationHash !== "string" || typeof provenance.configHash !== "string" || typeof provenance.statisticsSchemaVersion !== "string" || typeof provenance.reportSchemaVersion !== "string" || typeof provenance.replaySchemaVersion !== "string" || typeof provenance.bootstrapIterations !== "number" || typeof provenance.bootstrapSeed !== "number" || !Array.isArray(provenance.baseSeeds) || !Array.isArray(provenance.rotations) || !Array.isArray(provenance.allocations)) throw new Error("PROVENANCE_INVALID");
  if (!/^[a-f0-9]{40}$/.test(provenance.sourceCommit) || !/^[a-f0-9]{64}$/.test(provenance.roomRulesFingerprint) || !/^[a-f0-9]{64}$/.test(provenance.profileConfigurationHash) || !/^[a-f0-9]{64}$/.test(provenance.configHash) || provenance.benchmarkVersion.length === 0 || provenance.engineVersion.length === 0 || provenance.statisticsSchemaVersion.length === 0 || provenance.reportSchemaVersion.length === 0 || provenance.replaySchemaVersion.length === 0) throw new Error("PROVENANCE_INVALID");
  if (!Number.isSafeInteger(provenance.bootstrapIterations) || provenance.bootstrapIterations < 0 || !Number.isSafeInteger(provenance.bootstrapSeed) || provenance.bootstrapSeed < 0 || provenance.baseSeeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0) || new Set(provenance.baseSeeds).size !== provenance.baseSeeds.length || canonicalJson(provenance.rotations) !== canonicalJson([0, 1, 2, 3]) || canonicalJson(provenance.allocations) !== canonicalJson(["AB", "BA"])) throw new Error("PROVENANCE_INVALID");
}
