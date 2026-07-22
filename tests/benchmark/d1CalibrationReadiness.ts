const MATCHUPS = ["treatment-vs-control", "treatment-vs-greedy", "control-vs-greedy", "treatment-vs-random", "control-vs-random", "treatment-vs-legacy", "control-vs-legacy"] as const;

export interface D1CalibrationReadiness { ready: boolean; errors: string[]; matchups: string[]; }

export function validateD1CalibrationReportReadiness(manifests: readonly Record<string, any>[]): D1CalibrationReadiness {
  const errors: string[] = [];
  const names = manifests.map((manifest) => String(manifest.matchup));
  if (manifests.length !== MATCHUPS.length) errors.push("MATCHUP_COUNT_INVALID");
  if (new Set(names).size !== names.length) errors.push("MATCHUP_DUPLICATE");
  if (names.some((name) => !(MATCHUPS as readonly string[]).includes(name))) errors.push("MATCHUP_UNKNOWN");
  for (const matchup of MATCHUPS) {
    const manifest = manifests.find((candidate) => candidate.matchup === matchup);
    if (manifest === undefined) { errors.push(`MATCHUP_MISSING:${matchup}`); continue; }
    if (manifest.schemaVersion !== "d1-manifest-v2") errors.push(`SCHEMA:${matchup}`);
    if (manifest.phase !== "calibration" || manifest.expectedRawGames !== 400 || manifest.completedRawGames !== 400 || manifest.expectedPairedUnits !== 200 || manifest.completedPairedUnits !== 200) errors.push(`COUNTS:${matchup}`);
    if (!Array.isArray(manifest.expectedMatchIds) || manifest.expectedMatchIds.length !== 400 || !Array.isArray(manifest.completedMatchIds) || manifest.completedMatchIds.length !== 400 || (manifest.failedMatchIds ?? []).length !== 0) errors.push(`IDS:${matchup}`);
    if (manifest.diagnosticsIntegrity?.integrityOk !== true || manifest.diagnosticsIntegrity?.diagnosticsErrorCount !== 0) errors.push(`DIAGNOSTICS:${matchup}`);
    if (manifest.provenanceHash === undefined || manifest.executionProvenance === undefined || manifest.engineVersion === undefined || manifest.roomRulesVersion === undefined || manifest.benchmarkVersion === undefined || manifest.replaySchemaVersion === undefined || manifest.diagnosticsSchemaVersion === undefined) errors.push(`PROVENANCE:${matchup}`);
    if (manifest.provenanceMissing !== 0 || manifest.nonPositiveDuration !== 0 || manifest.privacy?.hiddenStateLeakCount !== 0 || manifest.hash?.verified !== true || manifest.version?.verified !== true || manifest.safety?.allZero !== true) errors.push(`INTEGRITY:${matchup}`);
  }
  return { ready: errors.length === 0, errors, matchups: [...names].sort() };
}
