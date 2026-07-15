import { describe, expect, it } from "vitest";
import { validateD1CalibrationReportReadiness } from "./d1CalibrationReadiness";

describe("D1 calibration report readiness", () => {
  it("accepts seven complete v2 manifests", () => {
    const manifests = ["treatment-vs-control", "treatment-vs-greedy", "control-vs-greedy", "treatment-vs-random", "control-vs-random", "treatment-vs-legacy", "control-vs-legacy"].map((matchup) => ({
      schemaVersion: "d1-manifest-v2",
      phase: "calibration",
      matchup,
      configHash: "c".repeat(64),
      executionSourceCommit: "a".repeat(40),
      provenanceHash: "p".repeat(64),
      expectedRawGames: 400,
      completedRawGames: 400,
      expectedPairedUnits: 200,
      completedPairedUnits: 200,
      expectedMatchIds: Array.from({ length: 400 }, (_, i) => `${matchup}-${i}`),
      completedMatchIds: Array.from({ length: 400 }, (_, i) => `${matchup}-${i}`),
      failedMatchIds: [],
      diagnosticsIntegrity: { expectedDynamicGames: 0, gamesWithDiagnostics: 0, gamesWithoutDiagnostics: 400, diagnosticsErrorCount: 0, schemaMismatchCount: 0, invalidValueCount: 0, integrityOk: true },
      diagnosticsAggregate: { schemaVersion: "d1-plan-selection-diagnostics-v1", totals: {}, rates: {}, reasonCounts: {}, candidateCountSummary: {}, decisionIndicesSinceLastSwitchSummary: {} },
      executionProvenance: { schemaVersion: "d1-execution-provenance-v1" },
      strategyDescriptors: [],
      implementationVersion: "dynamic-topk-v1",
      engineVersion: "engine-v1",
      roomRulesVersion: "rules-v1",
      benchmarkVersion: "d1-topk-v1",
      replaySchemaVersion: "d1-replay-v1",
      diagnosticsSchemaVersion: "d1-plan-selection-diagnostics-v1",
      safety: { allZero: true },
      privacy: { hiddenStateLeakCount: 0 },
      hash: { verified: true },
      version: { verified: true },
      provenanceMissing: 0,
      nonPositiveDuration: 0,
    }));
    expect(validateD1CalibrationReportReadiness(manifests).ready).toBe(true);
  });

  it("rejects a v1 or incomplete manifest", () => {
    expect(validateD1CalibrationReportReadiness([{ schemaVersion: "d1-manifest-v1" }]).ready).toBe(false);
  });
});
