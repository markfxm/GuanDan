import { describe, expect, it } from "vitest";
import {
  buildCalibrationReviewModel,
  classifyBehaviorExposure,
  inventoryDirectory,
  renderCalibrationReviewMarkdown,
  serializeCalibrationReviewJson,
} from "../../scripts/d1CalibrationReview";

function manifest(matchup: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "d1-manifest-v2",
    phase: "calibration",
    matchup,
    expectedRawGames: 400,
    completedRawGames: 400,
    expectedPairedUnits: 200,
    completedPairedUnits: 200,
    expectedMatchIds: Array.from({ length: 400 }, (_, index) => `${matchup}-${index}`),
    completedMatchIds: Array.from({ length: 400 }, (_, index) => `${matchup}-${index}`),
    failedMatchIds: [],
    provenanceMissing: 0,
    nonPositiveDuration: 0,
    configHash: "calibration-config",
    provenanceHash: "provenance-hash",
    executionSourceCommit: "ad1d72b6715338b470a062da7b28bc9284babb1f",
    diagnosticsErrorCount: 0,
    diagnosticsIntegrity: { integrityOk: true, diagnosticsErrorCount: 0 },
    safety: { allZero: true },
    privacy: { verified: true, hiddenStateLeakCount: 0 },
    hash: { verified: true },
    version: { verified: true },
    executionProvenance: { schemaVersion: "d1-execution-provenance-v1" },
    strategyDescriptors: [{ id: "unified-d1-topk-switch", mode: "dynamic-topk-v1" }],
    engineVersion: "engine-v1",
    roomRulesVersion: "rules-v1",
    benchmarkVersion: "d1-topk-v1",
    replaySchemaVersion: "d1-replay-v1",
    diagnosticsSchemaVersion: "d1-plan-selection-diagnostics-v1",
    ...overrides,
  };
}

describe("D1 calibration review", () => {
  it("fails closed when one required matchup is missing", () => {
    expect(() => buildCalibrationReviewModel({ manifests: [manifest("treatment-vs-control")] as never, gamesByMatchup: {} })).toThrow(/MATCHUP/);
  });

  it("classifies candidateCount=1 and zero strategic consideration as unexercised", () => {
    expect(classifyBehaviorExposure({ dynamicDecisionDenominator: 10, candidateCountGreaterThanOne: 0, strategicConsiderationDenominator: 0, diagnosticsValid: true })).toBe("unexercised");
  });

  it("does not derive an uplift CI by subtracting independent intervals", () => {
    const model = buildCalibrationReviewModel({
      manifests: Array.from({ length: 7 }, (_, index) => manifest(["treatment-vs-control", "treatment-vs-greedy", "control-vs-greedy", "treatment-vs-random", "control-vs-random", "treatment-vs-legacy", "control-vs-legacy"][index]!)) as never,
      gamesByMatchup: {},
    });
    expect(model.jointUplifts).toBeDefined();
    expect(model.config.bootstrap.iterations).toBe(10000);
    expect(model.config.bootstrap.seed).toBe(20260714);
  });

  it("renders JSON and Markdown from the same model", () => {
    const model = buildCalibrationReviewModel({ manifests: [], gamesByMatchup: {}, allowSyntheticEmpty: true });
    const json = serializeCalibrationReviewJson(model);
    const markdown = renderCalibrationReviewMarkdown(model);
    expect(json).toContain(model.structuralReadiness);
    expect(markdown).toContain("NOT APPROVED FOR FORMAL");
  });

  it("inventory ordering is stable", async () => {
    const first = await inventoryDirectory("artifacts/ai-benchmark-d1-calibration-v2");
    const second = await inventoryDirectory("artifacts/ai-benchmark-d1-calibration-v2");
    expect(second).toEqual(first);
  });
});
