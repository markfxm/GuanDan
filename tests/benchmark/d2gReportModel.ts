import type { PublicActionEvent } from "../../src/game/publicEvent";
import { verifyPublicActionEventHash, sha256Bytes } from "../../src/game/publicEventHash";
import { RANKS } from "../../src/engine/cards";
import { canonicalJson } from "./contracts";
import type { D2GProvenance } from "./d2gManifest";
import type { D2GHeadToHeadGameResult } from "./d2gHeadToHeadSimulator";
import { buildD2GStatistics, isCorrectnessCleanGame, normalizeD2GGameResult, type D2GBaseSeedBlockSummary, type D2GNormalizedOutcome, type D2GStatistics } from "./d2gStatistics";

export interface D2GReportModelInput {
  provenance: D2GProvenance;
  games: readonly D2GHeadToHeadGameResult[];
  bootstrapIterations?: number;
  bootstrapSeed?: number;
}

export interface D2GPairedDiagnostic {
  rotationPairKey: string;
  baseSeed: number | null;
  rotation: 0 | 1 | 2 | 3 | null;
  allocations: readonly ("AB" | "BA")[];
  complete: boolean;
  scoreDelta: number | null;
  levelStepDelta: number | null;
  finishUtilityDelta: number | null;
}

export interface D2GReportModel {
  schemaVersion: "d2g-report-v1";
  reportVersion: "d2g-report-v1";
  provenance: D2GProvenance;
  rawGames: readonly D2GHeadToHeadGameResult[];
  treatmentPerspectiveOutcomes: readonly D2GNormalizedOutcome[];
  baseSeedBlocks: readonly D2GBaseSeedBlockSummary[];
  pairedDiagnostics: readonly D2GPairedDiagnostic[];
  statistics: D2GStatistics;
  deterministicIdentity: string;
}

export interface D2GPublicReplay {
  schemaVersion: "d2g-replay-v1";
  replayVersion: "d2g-replay-v1";
  benchmarkVersion: string;
  sourceCommit: string;
  engineVersion: string;
  roomRulesFingerprint: string;
  profileConfigurationHash: string;
  configHash: string;
  gameId: string;
  baseSeed: number;
  rank: D2GHeadToHeadGameResult["rank"];
  rotation: D2GHeadToHeadGameResult["rotation"];
  allocation: D2GHeadToHeadGameResult["allocation"];
  rotationPairKey: string;
  baselineTeam: D2GHeadToHeadGameResult["baselineTeam"];
  treatmentTeam: D2GHeadToHeadGameResult["treatmentTeam"];
  publicEvents: readonly PublicActionEvent[];
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  winnerTeam: 0 | 1 | null;
  winningPartnership: D2GHeadToHeadGameResult["winningPartnership"];
  publicTraceHash: string;
  finalPublicLedgerHash: string;
  semanticHash: string;
  replayIdentity: string;
}

export function buildD2GReportModel(input: D2GReportModelInput): D2GReportModel {
  const bootstrapIterations = input.bootstrapIterations ?? input.provenance.bootstrapIterations;
  const bootstrapSeed = input.bootstrapSeed ?? input.provenance.bootstrapSeed;
  if (bootstrapIterations !== input.provenance.bootstrapIterations || bootstrapSeed !== input.provenance.bootstrapSeed) throw new Error("BOOTSTRAP_CONFIG_MISMATCH");
  const games = [...input.games].sort((left, right) => left.gameId.localeCompare(right.gameId));
  if (new Set(games.map((game) => game.gameId)).size !== games.length) throw new Error("DUPLICATE_GAME_ID");
  for (const game of games) {
    if (!input.provenance.baseSeeds.includes(game.baseSeed)) throw new Error(`UNKNOWN_BASE_SEED:${game.baseSeed}`);
    if (game.configHash !== input.provenance.configHash) throw new Error(`CONFIG_HASH_MISMATCH:${game.gameId}`);
    if (game.profileHash !== input.provenance.profileConfigurationHash) throw new Error(`PROFILE_HASH_MISMATCH:${game.gameId}`);
  }
  const treatmentPerspectiveOutcomes = games.map((game) => normalizeD2GGameResult(game, input.provenance));
  const statistics = buildD2GStatistics(games, { bootstrapIterations, bootstrapSeed, provenance: input.provenance });
  const deterministicIdentity = hashDeterministicReport(input.provenance, games);
  return {
    schemaVersion: "d2g-report-v1",
    reportVersion: "d2g-report-v1",
    provenance: input.provenance,
    rawGames: games,
    treatmentPerspectiveOutcomes,
    baseSeedBlocks: statistics.baseSeedBlocks,
    pairedDiagnostics: buildPairedDiagnostics(treatmentPerspectiveOutcomes),
    statistics,
    deterministicIdentity,
  };
}

export function buildD2GPublicReplay(game: D2GHeadToHeadGameResult, provenance: D2GProvenance): D2GPublicReplay {
  if (!provenance.baseSeeds.includes(game.baseSeed)) throw new Error("UNKNOWN_BASE_SEED");
  if (game.configHash !== provenance.configHash) throw new Error("CONFIG_HASH_MISMATCH");
  if (game.profileHash !== provenance.profileConfigurationHash) throw new Error("PROFILE_HASH_MISMATCH");
  const replay: Omit<D2GPublicReplay, "replayIdentity"> = {
    schemaVersion: "d2g-replay-v1",
    replayVersion: "d2g-replay-v1",
    benchmarkVersion: provenance.benchmarkVersion,
    sourceCommit: provenance.sourceCommit,
    engineVersion: provenance.engineVersion,
    roomRulesFingerprint: provenance.roomRulesFingerprint,
    profileConfigurationHash: provenance.profileConfigurationHash,
    configHash: game.configHash,
    gameId: game.gameId,
    baseSeed: game.baseSeed,
    rank: game.rank,
    rotation: game.rotation,
    allocation: game.allocation,
    rotationPairKey: game.rotationPairKey,
    baselineTeam: game.baselineTeam,
    treatmentTeam: game.treatmentTeam,
    publicEvents: game.publicEvents,
    finishOrder: game.finishOrder,
    winnerTeam: game.winnerTeam,
    winningPartnership: game.winningPartnership,
    publicTraceHash: game.publicTraceHash,
    finalPublicLedgerHash: game.finalPublicLedgerHash,
    semanticHash: game.semanticHash,
  };
  return { ...replay, replayIdentity: hashCanonical(replay) };
}

export function validateD2GPublicReplay(value: unknown, expected?: D2GProvenance): true {
  assertPublicReplay(value);
  if (expected !== undefined) {
    if (value.benchmarkVersion !== expected.benchmarkVersion || value.sourceCommit !== expected.sourceCommit || value.engineVersion !== expected.engineVersion || value.roomRulesFingerprint !== expected.roomRulesFingerprint || value.profileConfigurationHash !== expected.profileConfigurationHash || value.configHash !== expected.configHash || !expected.baseSeeds.includes(value.baseSeed) || !expected.rotations.includes(value.rotation) || !expected.allocations.includes(value.allocation)) throw new Error("REPLAY_PROVENANCE_MISMATCH");
  }
  for (const [index, event] of value.publicEvents.entries()) {
    verifyPublicActionEventHash(event);
    if (event.gameId !== value.gameId || event.eventIndex !== index) throw new Error("REPLAY_EVENT_SEQUENCE_MISMATCH");
  }
  const expectedTraceHash = hashCanonical({ schemaVersion: "d2g-public-trace-v1", publicEvents: value.publicEvents });
  if (expectedTraceHash !== value.publicTraceHash) throw new Error("REPLAY_TRACE_HASH_MISMATCH");
  if (!/^[a-f0-9]{64}$/.test(value.finalPublicLedgerHash) || !/^[a-f0-9]{64}$/.test(value.semanticHash)) throw new Error("REPLAY_HASH_MISSING");
  const { replayIdentity: _replayIdentity, ...replay } = value;
  if (hashCanonical(replay) !== value.replayIdentity) throw new Error("REPLAY_IDENTITY_MISMATCH");
  return true;
}

export { isCorrectnessCleanGame, normalizeD2GGameResult };

function buildPairedDiagnostics(outcomes: readonly D2GNormalizedOutcome[]): D2GPairedDiagnostic[] {
  const grouped = new Map<string, D2GNormalizedOutcome[]>();
  for (const outcome of outcomes) (grouped.get(outcome.rotationPairKey) ?? (grouped.set(outcome.rotationPairKey, []), grouped.get(outcome.rotationPairKey)!)).push(outcome);
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([rotationPairKey, pair]) => ({
    rotationPairKey,
    baseSeed: pair.length === 0 ? null : pair[0]!.baseSeed,
    rotation: pair.length === 0 ? null : pair[0]!.rotation,
    allocations: pair.map((game) => game.allocation).sort(),
    complete: pair.length === 2 && pair.every((game) => game.resolved),
    scoreDelta: pair.length === 2 && pair.every((game) => game.scoreDelta !== null) ? mean(pair.map((game) => game.scoreDelta!)) : null,
    levelStepDelta: pair.length === 2 && pair.every((game) => game.levelStepDelta !== null) ? mean(pair.map((game) => game.levelStepDelta!)) : null,
    finishUtilityDelta: pair.length === 2 && pair.every((game) => game.finishUtilityDelta !== null) ? mean(pair.map((game) => game.finishUtilityDelta!)) : null,
  }));
}

function hashDeterministicReport(provenance: D2GProvenance, games: readonly D2GHeadToHeadGameResult[]): string {
  return hashCanonical({
    schemaVersion: "d2g-report-deterministic-v1",
    provenance,
    games: games.map((game) => ({
      ...game,
      elapsedMs: undefined,
      decisionTelemetry: game.decisionTelemetry.map(({ productionDecisionCostMs: _productionDecisionCostMs, rolloutEvaluationCostMs: _rolloutEvaluationCostMs, ...record }) => record),
    })),
  });
}

function assertPublicReplay(value: unknown): asserts value is D2GPublicReplay {
  if (value === null || typeof value !== "object") throw new Error("REPLAY_INVALID");
  if (containsPrivateKey(value)) throw new Error("REPLAY_PRIVATE_STATE");
  const replay = value as Partial<D2GPublicReplay>;
  if (replay.schemaVersion !== "d2g-replay-v1" || replay.replayVersion !== "d2g-replay-v1" || typeof replay.benchmarkVersion !== "string" || typeof replay.sourceCommit !== "string" || typeof replay.engineVersion !== "string" || typeof replay.roomRulesFingerprint !== "string" || typeof replay.profileConfigurationHash !== "string" || typeof replay.configHash !== "string" || typeof replay.gameId !== "string" || typeof replay.baseSeed !== "number" || !Number.isSafeInteger(replay.baseSeed) || typeof replay.rank !== "string" || !(RANKS as readonly string[]).includes(replay.rank) || replay.rotation !== 0 && replay.rotation !== 1 && replay.rotation !== 2 && replay.rotation !== 3 || replay.allocation !== "AB" && replay.allocation !== "BA" || replay.baselineTeam !== "A" && replay.baselineTeam !== "B" || replay.treatmentTeam !== "A" && replay.treatmentTeam !== "B" || typeof replay.rotationPairKey !== "string" || !Array.isArray(replay.publicEvents) || !Array.isArray(replay.finishOrder) || replay.finishOrder.some((seat) => seat !== 0 && seat !== 1 && seat !== 2 && seat !== 3) || replay.winnerTeam !== 0 && replay.winnerTeam !== 1 && replay.winnerTeam !== null || replay.winningPartnership !== "baseline" && replay.winningPartnership !== "treatment" && replay.winningPartnership !== null || typeof replay.publicTraceHash !== "string" || typeof replay.finalPublicLedgerHash !== "string" || typeof replay.semanticHash !== "string" || typeof replay.replayIdentity !== "string") throw new Error("REPLAY_INVALID");
}

function containsPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => /^(hands|initialHands|privateOwnHandFingerprint|ownHand|aiRuntime|aiPlans|privateState|hiddenState|particleState|opponentHands)$/i.test(key) || containsPrivateKey(child));
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
