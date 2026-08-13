import { assertKnownExecutionSourceCommit, isGitCommitSha } from "./d1Provenance";
import type { D1ExecutionProvenanceV1 } from "./d1ProvenanceV2";
import { D1_DIAGNOSTICS_SCHEMA, D1_MANIFEST_SCHEMA, D1_RESULT_SCHEMA, validateD1ProvenanceHash } from "./d1ProvenanceV2";
import { aggregatePersistedD1Diagnostics, type PersistedD1Diagnostics, type PersistedD1DiagnosticsAggregate } from "./d1DiagnosticsPersistence";
import type { SimulationSummary, D1SafetySummary } from "./simulator";
import type { StrategyDescriptor } from "./contracts";

export interface D1Manifest {
  schemaVersion: "d1-manifest-v1";
  phase: string;
  matchup: string;
  batchId?: string;
  configHash: string;
  implementationVersion?: string;
  executionSourceCommit?: string;
  replayMode?: "none" | "failures" | "all";
  expectedMatchIds: string[];
  completedMatchIds: string[];
  failedMatchIds?: string[];
  expectedRawGames?: number;
  completedRawGames?: number;
  expectedPairedUnits?: number;
  completedPairedUnits?: number;
  replayFilesExpected?: number;
  replayFilesFound?: number;
  replayFilesVerified?: number;
  hashVerified?: number;
  finalPublicStateHashVerified?: number;
  versionVerified?: number;
  hiddenStateLeakCount?: number;
  provenanceMissing?: number;
  nonPositiveDuration?: number;
  duplicateMatchIds?: number;
  missingMatchIds?: number;
  unknownMatchIds?: number;
  diagnosticsErrorCount?: number;
  resumeSupported: true;
  skipExistingSupported: true;
}
export interface D1ExistingResult { matchId: string; configHash: string; implementationVersion: string; executionSourceCommit?: string; completed: boolean; failed: boolean; durationMs: number; diagnosticsError: boolean; publicTraceHash: string; replayVerified: boolean; versionVerified?: boolean; privacyVerified?: boolean; }
export function canSkipExisting(result: D1ExistingResult, expected: { configHash: string; implementationVersion: string; executionSourceCommit?: string; replayMode: "none" | "failures" | "all" }): boolean { return expected.executionSourceCommit !== undefined && isGitCommitSha(expected.executionSourceCommit) && isGitCommitSha(result.executionSourceCommit) && result.configHash === expected.configHash && result.implementationVersion === expected.implementationVersion && result.executionSourceCommit === expected.executionSourceCommit && result.completed && !result.failed && result.diagnosticsError === false && Number.isFinite(result.durationMs) && result.durationMs > 0 && result.publicTraceHash.length > 0 && result.versionVerified !== false && result.privacyVerified !== false && (expected.replayMode === "none" || result.replayVerified); }
export function validateResumeManifest(previous: D1Manifest, next: D1Manifest): true { assertKnownExecutionSourceCommit(previous.executionSourceCommit); assertKnownExecutionSourceCommit(next.executionSourceCommit); if (previous.executionSourceCommit !== next.executionSourceCommit) throw new Error("EXECUTION_SOURCE_COMMIT_MISMATCH"); if (previous.configHash !== next.configHash) throw new Error("CONFIG_HASH_MISMATCH"); if (previous.phase !== next.phase || previous.matchup !== next.matchup) throw new Error("MANIFEST_SCOPE_MISMATCH"); if (new Set(previous.expectedMatchIds).size !== previous.expectedMatchIds.length || new Set(next.expectedMatchIds).size !== next.expectedMatchIds.length) throw new Error("DUPLICATE_EXPECTED_MATCH_ID"); const expected = new Set(next.expectedMatchIds); for (const id of previous.completedMatchIds) if (!expected.has(id)) throw new Error("UNKNOWN_MATCH_ID"); for (const id of previous.expectedMatchIds) if (!previous.completedMatchIds.includes(id)) throw new Error(`MISSING_COMPLETED_MATCH_ID:${id}`); return true; }
export function completedMatchIds(manifests: D1Manifest[]): string[] { return [...new Set(manifests.flatMap((manifest) => manifest.completedMatchIds))].sort(); }

export function buildD1Manifest(input: Omit<D1Manifest, "schemaVersion" | "resumeSupported" | "skipExistingSupported">): D1Manifest {
  assertKnownExecutionSourceCommit(input.executionSourceCommit);
  const expected = [...input.expectedMatchIds].sort(); const completed = [...input.completedMatchIds].sort();
  if (new Set(expected).size !== expected.length) throw new Error("DUPLICATE_EXPECTED_MATCH_ID");
  if (completed.some((id) => !expected.includes(id))) throw new Error("UNKNOWN_MATCH_ID");
  if (new Set(completed).size !== completed.length) throw new Error("DUPLICATE_COMPLETED_MATCH_ID");
  return { schemaVersion: "d1-manifest-v1", ...input, expectedMatchIds: expected, completedMatchIds: completed, resumeSupported: true, skipExistingSupported: true };
}

export interface D1DiagnosticsIntegrity {
  expectedDynamicGames: number;
  gamesWithDiagnostics: number;
  gamesWithoutDiagnostics: number;
  diagnosticsErrorCount: number;
  schemaMismatchCount: number;
  invalidValueCount: number;
  integrityOk: boolean;
}

export interface D1ManifestV2 extends Omit<D1Manifest, "schemaVersion" | "resumeSupported" | "skipExistingSupported"> {
  schemaVersion: typeof D1_MANIFEST_SCHEMA;
  rawResultSchemaVersion: typeof D1_RESULT_SCHEMA;
  executionProvenance: D1ExecutionProvenanceV1;
  provenanceHash: string;
  strategyDescriptors: StrategyDescriptor[];
  engineVersion: string;
  roomRulesVersion: string;
  benchmarkVersion: string;
  replaySchemaVersion: string;
  diagnosticsSchemaVersion: typeof D1_DIAGNOSTICS_SCHEMA;
  d1DiagnosticsAggregate: PersistedD1DiagnosticsAggregate;
  diagnosticsIntegrity: D1DiagnosticsIntegrity;
  safety: D1SafetySummary & { allZero: boolean; diagnosticsError: number };
  privacy: { verified: boolean; hiddenStateLeakCount: number };
  hash: { verified: boolean; finalPublicStateHashVerified: number };
  version: { verified: boolean };
  resumeSupported: true;
  skipExistingSupported: true;
}

export function buildD1ManifestV2(input: {
  phase: D1ManifestV2["phase"];
  matchup: string;
  batchId?: string;
  configHash: string;
  expectedMatchIds: string[];
  games: readonly SimulationSummary[];
  executionProvenance: D1ExecutionProvenanceV1;
  provenanceHash: string;
  strategyDescriptors: StrategyDescriptor[];
  replayMode: "none" | "failures" | "all";
  replayFilesExpected?: number;
  replayFilesFound?: number;
  replayFilesVerified?: number;
  hashVerified?: number;
  finalPublicStateHashVerified?: number;
  versionVerified?: number;
}): D1ManifestV2 {
  validateD1ProvenanceHash(input.executionProvenance, input.provenanceHash);
  const expected = [...input.expectedMatchIds].sort();
  if (new Set(expected).size !== expected.length) throw new Error("DUPLICATE_EXPECTED_MATCH_ID");
  const completedGames = input.games.filter((game) => game.completed && !game.failed);
  const completed = completedGames.map((game) => game.matchId).sort();
  if (new Set(completed).size !== completed.length) throw new Error("DUPLICATE_COMPLETED_MATCH_ID");
  if (completed.some((id) => !expected.includes(id))) throw new Error("UNKNOWN_MATCH_ID");
  const failed = input.games.filter((game) => game.failed).map((game) => game.matchId).sort();
  const integrity = diagnosticsIntegrity(input.games, input.strategyDescriptors);
  const diagnostics = aggregatePersistedD1Diagnostics(completedGames.flatMap((game) => game.d1Diagnostics === undefined ? [] : [game.d1Diagnostics]));
  const safety = safetySummary(input.games);
  const privacy = privacySummary(input.games);
  const hash = {
    verified: input.games.every((game) => typeof game.publicTraceHash === "string" && game.publicTraceHash.length > 0 && typeof game.finalPublicStateHash === "string" && game.finalPublicStateHash.length > 0),
    finalPublicStateHashVerified: input.finalPublicStateHashVerified ?? input.games.length,
  };
  const version = { verified: input.games.every((game) => game.rawResultSchemaVersion === D1_RESULT_SCHEMA && game.provenanceHash === input.provenanceHash) };
  const allZero = safety.allZero && integrity.integrityOk && privacy.verified && hash.verified && version.verified;
  if (completed.length !== expected.length || !integrity.integrityOk || !allZero || input.games.some((game) => game.executionProvenance === undefined || game.provenanceHash !== input.provenanceHash)) throw new Error("D1_BATCH_INTEGRITY_FAILED");
  return {
    schemaVersion: D1_MANIFEST_SCHEMA,
    rawResultSchemaVersion: D1_RESULT_SCHEMA,
    phase: input.phase,
    matchup: input.matchup,
    batchId: input.batchId,
    configHash: input.configHash,
    expectedMatchIds: expected,
    completedMatchIds: completed,
    failedMatchIds: failed,
    expectedRawGames: expected.length,
    completedRawGames: completed.length,
    expectedPairedUnits: expected.length / 2,
    completedPairedUnits: Math.floor(completed.length / 2),
    replayFilesExpected: input.replayFilesExpected ?? 0,
    replayFilesFound: input.replayFilesFound ?? 0,
    replayFilesVerified: input.replayFilesVerified ?? 0,
    hashVerified: input.hashVerified ?? 0,
    finalPublicStateHashVerified: hash.finalPublicStateHashVerified,
    versionVerified: input.versionVerified ?? (version.verified ? input.games.length : 0),
    hiddenStateLeakCount: privacy.hiddenStateLeakCount,
    provenanceMissing: input.games.filter((game) => game.executionProvenance === undefined || game.provenanceHash !== input.provenanceHash).length,
    nonPositiveDuration: input.games.filter((game) => !(game.durationMs > 0)).length,
    duplicateMatchIds: new Set(input.games.map((game) => game.matchId)).size === input.games.length ? 0 : 1,
    missingMatchIds: expected.filter((id) => !completed.includes(id)).length,
    unknownMatchIds: completed.filter((id) => !expected.includes(id)).length,
    diagnosticsErrorCount: integrity.diagnosticsErrorCount,
    implementationVersion: input.executionProvenance.implementationVersion,
    executionSourceCommit: input.executionProvenance.executionSourceCommit,
    replayMode: input.replayMode,
    resumeSupported: true,
    skipExistingSupported: true,
    executionProvenance: input.executionProvenance,
    provenanceHash: input.provenanceHash,
    strategyDescriptors: [...input.strategyDescriptors].sort((a, b) => a.id.localeCompare(b.id)),
    engineVersion: input.executionProvenance.engineVersion,
    roomRulesVersion: input.executionProvenance.roomRulesVersion,
    benchmarkVersion: input.executionProvenance.benchmarkVersion,
    replaySchemaVersion: input.executionProvenance.replaySchemaVersion,
    diagnosticsSchemaVersion: D1_DIAGNOSTICS_SCHEMA,
    d1DiagnosticsAggregate: diagnostics,
    diagnosticsIntegrity: integrity,
    safety,
    privacy,
    hash,
    version,
  };
}

export function validateResumeManifestV2(previous: unknown, next: D1ManifestV2): true {
  const old = requireV2Manifest(previous);
  requireV2Manifest(next);
  validateD1ProvenanceHash(old.executionProvenance, old.provenanceHash);
  validateD1ProvenanceHash(next.executionProvenance, next.provenanceHash);
  if (old.executionSourceCommit !== next.executionSourceCommit) throw new Error("EXECUTION_SOURCE_COMMIT_MISMATCH");
  if (old.configHash !== next.configHash || old.provenanceHash !== next.provenanceHash) throw new Error("PROVENANCE_HASH_MISMATCH");
  if (old.phase !== next.phase || old.matchup !== next.matchup) throw new Error("MANIFEST_SCOPE_MISMATCH");
  if (old.diagnosticsIntegrity.integrityOk !== true) throw new Error("DIAGNOSTICS_INTEGRITY_INVALID");
  return true;
}

export function canSkipExistingV2(result: unknown, expected: { configHash: string; provenanceHash: string; executionSourceCommit: string; replayMode: "none" | "failures" | "all" }): boolean {
  if (result === null || typeof result !== "object") return false;
  const value = result as Partial<SimulationSummary>;
  return value.rawResultSchemaVersion === D1_RESULT_SCHEMA
    && value.configHash === expected.configHash
    && value.provenanceHash === expected.provenanceHash
    && value.executionSourceCommit === expected.executionSourceCommit
    && value.executionProvenance !== undefined
    && value.d1Diagnostics !== undefined
    && value.d1Diagnostics.schemaVersion === D1_DIAGNOSTICS_SCHEMA
    && value.d1Diagnostics.applicable === true
    && value.diagnosticsError === undefined
    && value.completed === true
    && value.failed === false
    && Number.isFinite(value.durationMs) && (value.durationMs ?? 0) > 0
    && (expected.replayMode === "none" || (value.publicTraceHash?.length ?? 0) > 0);
}

function requireV2Manifest(value: unknown): D1ManifestV2 {
  if (value === null || typeof value !== "object" || (value as Partial<D1ManifestV2>).schemaVersion !== D1_MANIFEST_SCHEMA || (value as Partial<D1ManifestV2>).executionProvenance === undefined || typeof (value as Partial<D1ManifestV2>).provenanceHash !== "string" || (value as Partial<D1ManifestV2>).diagnosticsIntegrity === undefined) throw new Error("LEGACY_MANIFEST_NOT_RESUMABLE");
  return value as D1ManifestV2;
}

function diagnosticsIntegrity(games: readonly SimulationSummary[], descriptors: readonly StrategyDescriptor[]): D1DiagnosticsIntegrity {
  const dynamicIds = new Set(descriptors.filter((descriptor) => descriptor.mode === "dynamic-topk-v1").map((descriptor) => descriptor.id));
  let expectedDynamicGames = 0; let gamesWithDiagnostics = 0; let gamesWithoutDiagnostics = 0; let diagnosticsErrorCount = 0; let schemaMismatchCount = 0; let invalidValueCount = 0;
  for (const game of games) {
    const dynamic = Object.values(game.strategiesBySeat).some((id) => dynamicIds.has(id));
    if (!dynamic) continue;
    expectedDynamicGames += 1;
    if (game.diagnosticsError !== undefined) diagnosticsErrorCount += 1;
    const value = game.d1Diagnostics;
    if (value === undefined) { gamesWithoutDiagnostics += 1; continue; }
    if (value.schemaVersion !== D1_DIAGNOSTICS_SCHEMA) schemaMismatchCount += 1;
    else if (!value.applicable || value.totals === undefined || !validTotals(value.totals)) invalidValueCount += 1;
    else gamesWithDiagnostics += 1;
  }
  return { expectedDynamicGames, gamesWithDiagnostics, gamesWithoutDiagnostics, diagnosticsErrorCount, schemaMismatchCount, invalidValueCount, integrityOk: diagnosticsErrorCount === 0 && schemaMismatchCount === 0 && invalidValueCount === 0 && gamesWithDiagnostics === expectedDynamicGames };
}

function validTotals(totals: NonNullable<PersistedD1Diagnostics["totals"]>): boolean { return Object.values(totals).every((value) => Number.isInteger(value) && value >= 0); }
function safetySummary(games: readonly SimulationSummary[]) {
  const zero: D1SafetySummary = { illegalAction: 0, leadPass: 0, invalidFollow: 0, duplicateCard: 0, missingCard: 0, policyViolation: 0, runtimePlanMismatch: 0, engineError: 0, exceededActionLimit: 0, timeout: 0 };
  for (const game of games) for (const key of Object.keys(zero) as Array<keyof D1SafetySummary>) zero[key] += game.safety?.[key] ?? (key === "illegalAction" ? game.errorCounters.illegalActions : key === "engineError" ? game.errorCounters.engineErrors : 0);
  const diagnosticsError = games.filter((game) => game.diagnosticsError !== undefined).length;
  return { ...zero, allZero: Object.values(zero).every((value) => value === 0) && diagnosticsError === 0, diagnosticsError };
}
function privacySummary(games: readonly SimulationSummary[]) { const keys = /partnerHand|opponentsHands|initialHands|hiddenInitialHand|hiddenState|deck|hands/i; const leaked = games.filter((game) => keys.test(JSON.stringify(game))).length; return { verified: leaked === 0, hiddenStateLeakCount: leaked }; }
