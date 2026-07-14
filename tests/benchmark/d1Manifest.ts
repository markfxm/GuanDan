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
export function canSkipExisting(result: D1ExistingResult, expected: { configHash: string; implementationVersion: string; executionSourceCommit?: string; replayMode: "none" | "failures" | "all" }): boolean { return result.configHash === expected.configHash && result.implementationVersion === expected.implementationVersion && (expected.executionSourceCommit === undefined || result.executionSourceCommit === expected.executionSourceCommit) && result.completed && !result.failed && result.diagnosticsError === false && Number.isFinite(result.durationMs) && result.durationMs > 0 && result.publicTraceHash.length > 0 && result.versionVerified !== false && result.privacyVerified !== false && (expected.replayMode === "none" || result.replayVerified); }
export function validateResumeManifest(previous: D1Manifest, next: D1Manifest): true { if (previous.configHash !== next.configHash) throw new Error("CONFIG_HASH_MISMATCH"); if (previous.phase !== next.phase || previous.matchup !== next.matchup) throw new Error("MANIFEST_SCOPE_MISMATCH"); if (new Set(previous.expectedMatchIds).size !== previous.expectedMatchIds.length || new Set(next.expectedMatchIds).size !== next.expectedMatchIds.length) throw new Error("DUPLICATE_EXPECTED_MATCH_ID"); const expected = new Set(next.expectedMatchIds); for (const id of previous.completedMatchIds) if (!expected.has(id)) throw new Error("UNKNOWN_MATCH_ID"); for (const id of previous.expectedMatchIds) if (!previous.completedMatchIds.includes(id)) throw new Error(`MISSING_COMPLETED_MATCH_ID:${id}`); return true; }
export function completedMatchIds(manifests: D1Manifest[]): string[] { return [...new Set(manifests.flatMap((manifest) => manifest.completedMatchIds))].sort(); }

export function buildD1Manifest(input: Omit<D1Manifest, "schemaVersion" | "resumeSupported" | "skipExistingSupported">): D1Manifest {
  const expected = [...input.expectedMatchIds].sort(); const completed = [...input.completedMatchIds].sort();
  if (new Set(expected).size !== expected.length) throw new Error("DUPLICATE_EXPECTED_MATCH_ID");
  if (completed.some((id) => !expected.includes(id))) throw new Error("UNKNOWN_MATCH_ID");
  if (new Set(completed).size !== completed.length) throw new Error("DUPLICATE_COMPLETED_MATCH_ID");
  return { schemaVersion: "d1-manifest-v1", ...input, expectedMatchIds: expected, completedMatchIds: completed, resumeSupported: true, skipExistingSupported: true };
}
