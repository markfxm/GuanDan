import fs from "node:fs";
import path from "node:path";
import { finalPublicStateHash as reportingFinalPublicStateHash, publicTraceHash as reportingPublicTraceHash } from "./reporting";
import { D1_DIAGNOSTICS_SCHEMA, D1_RESULT_SCHEMA, validateD1ProvenanceHash } from "./d1ProvenanceV2";

export interface D1ReplayValidationOptions { expectedConfigHash?: string; expectedBenchmarkVersion?: string; expectedReplayVersion?: string; expectedEngineVersion?: string; expectedRoomRulesVersion?: string; }
export function validateD1Replay(replay: Record<string, unknown>, options: D1ReplayValidationOptions = {}): true {
  if (containsPrivateKey(replay)) throw new Error("PRIVACY_HIDDEN_STATE");
  for (const key of ["schemaVersion", "replayVersion", "benchmarkVersion", "engineVersion", "roomRulesVersion", "configHash", "matchId", "seed", "rotation", "strategiesBySeat", "strategyDescriptors", "publicEvents", "handCountChanges", "trickEvents", "tributeEvents", "finishOrder", "teamScore", "deterministicRandom", "actionCount", "publicTraceHash", "finalPublicStateHash"]) if (!(key in replay)) throw new Error(`PROVENANCE_MISSING:${key}`);
  if (options.expectedConfigHash !== undefined && replay.configHash !== options.expectedConfigHash) throw new Error("CONFIG_HASH_MISMATCH");
  if (options.expectedBenchmarkVersion !== undefined && replay.benchmarkVersion !== options.expectedBenchmarkVersion) throw new Error("VERSION_MISMATCH");
  for (const [key, expected] of [["replayVersion", options.expectedReplayVersion], ["engineVersion", options.expectedEngineVersion], ["roomRulesVersion", options.expectedRoomRulesVersion]] as const) if (expected !== undefined && replay[key] !== expected) throw new Error("VERSION_MISMATCH");
  if (!Array.isArray(replay.strategyDescriptors)) throw new Error("PROVENANCE_MISSING:strategyDescriptors");
  if (replay.deterministicRandom === undefined || typeof replay.deterministicRandom !== "object") throw new Error("PROVENANCE_MISSING:deterministicRandom");
  if (typeof replay.publicTraceHash !== "string" || typeof replay.finalPublicStateHash !== "string") throw new Error("HASH_MISSING");
  return true;
}

export function validateD1RawResultV2(result: Record<string, unknown>, expected: { configHash: string; executionSourceCommit: string; provenanceHash: string; phase?: string }): true {
  if (result.rawResultSchemaVersion !== D1_RESULT_SCHEMA) throw new Error("RAW_RESULT_SCHEMA_MISMATCH");
  for (const key of ["matchId", "phase", "matchup", "seed", "placement", "rotation", "strategiesBySeat", "configHash", "executionSourceCommit", "provenanceHash", "executionProvenance", "publicTraceHash", "finalPublicStateHash", "d1Diagnostics", "durationMs"]) if (!(key in result)) throw new Error(`RAW_RESULT_PROVENANCE_MISSING:${key}`);
  if (result.configHash !== expected.configHash || result.executionSourceCommit !== expected.executionSourceCommit || (expected.phase !== undefined && result.phase !== expected.phase)) throw new Error("RAW_RESULT_PROVENANCE_MISMATCH");
  validateD1ProvenanceHash(result.executionProvenance, result.provenanceHash);
  const diagnostics = result.d1Diagnostics;
  if (diagnostics === null || typeof diagnostics !== "object" || (diagnostics as Record<string, unknown>).schemaVersion !== D1_DIAGNOSTICS_SCHEMA) throw new Error("RAW_RESULT_DIAGNOSTICS_MISSING");
  if (typeof result.durationMs !== "number" || !Number.isFinite(result.durationMs) || result.durationMs <= 0) throw new Error("RAW_RESULT_DURATION_INVALID");
  if (containsPrivate(result)) throw new Error("PRIVACY_HIDDEN_STATE");
  return true;
}

export function validateReplaySet(replays: Array<Record<string, unknown>>, expectedMatchIds: string[], options: D1ReplayValidationOptions = {}): { expected: number; found: number; verified: number; hashVerified: number; versionVerified: number; hiddenStateLeakCount: number } {
  const expected = new Set(expectedMatchIds); const seen = new Set<string>(); let verified = 0; let hashVerified = 0; let versionVerified = 0; let hiddenStateLeakCount = 0;
  for (const replay of replays) { const id = String(replay.matchId ?? ""); if (seen.has(id)) throw new Error(`DUPLICATE_MATCH_ID:${id}`); seen.add(id); try { validateD1Replay(replay, options); } catch (error) { if (String(error).includes("PRIVACY")) hiddenStateLeakCount += 1; throw error; } verified += 1; if (replay.publicTraceHash && replay.publicTraceHash === hashPublicEvents(replay.publicEvents)) hashVerified += 1; else if (replay.publicTraceHash) throw new Error(`PUBLIC_TRACE_HASH_MISMATCH:${id}`); if (replay.finalPublicState !== undefined && replay.finalPublicStateHash !== reportingFinalPublicStateHash(replay.finalPublicState)) throw new Error(`FINAL_PUBLIC_STATE_HASH_MISMATCH:${id}`); versionVerified += 1; }
  for (const id of expected) if (!seen.has(id)) throw new Error(`MISSING_MATCH_ID:${id}`);
  for (const id of seen) if (!expected.has(id)) throw new Error(`UNKNOWN_MATCH_ID:${id}`);
  return { expected: expected.size, found: replays.length, verified, hashVerified, versionVerified, hiddenStateLeakCount };
}

export function hashPublicEvents(events: unknown): string { return reportingPublicTraceHash(events); }
export function writeD1Replay(summary: { matchId: string; seed: number; rotation: number; allocation?: string; rank: string; strategiesBySeat: Record<number, string>; finishOrder: number[]; winnerTeam: 0 | 1 | null; teamScore: Record<0 | 1, number>; actionCount: number; publicTraceHash: string; finalPublicStateHash: string; finalPublicState?: unknown; configHash: string; publicEvents?: unknown[]; randomProvenance?: unknown }, outputDir: string, versions: { benchmarkVersion: string; replayVersion: string; engineVersion: string; roomRulesVersion: string; strategyDescriptors: unknown[] }): string {
  const publicEvents = summary.publicEvents ?? [];
  const replay = {
    schemaVersion: "d1-replay-v1",
    replayVersion: versions.replayVersion,
    benchmarkVersion: versions.benchmarkVersion,
    engineVersion: versions.engineVersion,
    roomRulesVersion: versions.roomRulesVersion,
    strategyDescriptors: versions.strategyDescriptors,
    configHash: summary.configHash,
    matchId: summary.matchId,
    seed: summary.seed,
    rotation: summary.rotation,
    allocation: summary.allocation,
    strategiesBySeat: orderedSeats(summary.strategiesBySeat),
    publicEvents,
    handCountChanges: publicEvents.map((event) => (event as Record<string, unknown>).handCountChanges).filter(Boolean),
    trickEvents: publicEvents.map((event) => (event as Record<string, unknown>).trick).filter(Boolean),
    tributeEvents: publicEvents.flatMap((event) => Array.isArray((event as Record<string, unknown>).tributeEvents) ? (event as Record<string, unknown>).tributeEvents as unknown[] : []),
    finishOrder: [...summary.finishOrder],
    winnerTeam: summary.winnerTeam,
    teamScore: { 0: summary.teamScore[0], 1: summary.teamScore[1] },
    deterministicRandom: summary.randomProvenance ?? { algorithmVersion: "none", baseSeed: summary.seed, perSeatDerivedSeed: {} },
    actionCount: summary.actionCount,
    publicTraceHash: summary.publicTraceHash,
    finalPublicStateHash: summary.finalPublicStateHash,
    ...(summary.finalPublicState === undefined ? {} : { finalPublicState: summary.finalPublicState }),
  };
  validateD1Replay(replay);
  const destination = path.join(outputDir, `${summary.matchId.replace(/[\\/:*?"<>|]/g, "_")}.json`); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, `${JSON.stringify(replay, null, 2)}\n`, "utf8"); return destination;
}
function containsPrivateKey(value: unknown): boolean { if (Array.isArray(value)) return value.some(containsPrivateKey); if (value === null || typeof value !== "object") return false; return Object.entries(value).some(([key, child]) => /^(partnerHand|opponentsHands|hands|initialHands|deck|hiddenInitialHand|hiddenState|fullState)$/i.test(key) || containsPrivateKey(child)); }
function containsPrivate(value: unknown): boolean { if (Array.isArray(value)) return value.some(containsPrivate); if (value === null || typeof value !== "object") return false; return Object.entries(value).some(([key, child]) => /^(partnerHand|opponentsHands|hands|initialHands|deck|hiddenInitialHand|hiddenState|fullState)$/i.test(key) || containsPrivate(child)); }
function orderedSeats<T>(record: Record<number, T>): Record<number, T> { return Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, record[seat]]).filter(([, value]) => value !== undefined)) as Record<number, T>; }
