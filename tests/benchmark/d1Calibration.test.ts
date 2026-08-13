import { describe, expect, it } from "vitest";
import { validateCalibrationReport, freezeCalibrationInput } from "./d1Calibration";

describe("D1 calibration boundary", () => {
  it("validates but never approves a calibration report", () => {
    const report = { phase: "calibration", configHash: "cfg", implementationVersion: "impl", bootstrapIterations: 10000, bootstrapSeed: 20260714, behaviorCaps: { strategicSwitchRate: 0.2, forcedSwitchRate: 0.1, aToBToARate: 0.05 }, reportSha256: "hash" };
    expect(validateCalibrationReport(report).phase).toBe("calibration");
    expect(freezeCalibrationInput(report)).toMatchObject({ formalExecutionAllowed: false, configHash: "cfg" });
  });
});
