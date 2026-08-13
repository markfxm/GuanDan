import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseD1Args, planD1Run, runD1 } from "../../scripts/runD1TopKBenchmark";

describe("D1 CLI argument contract", () => {
  it("recognizes the approved parameter names and normalizes them", async () => {
    const options = parseD1Args([
      "--phase", "smoke",
      "--replay-mode", "failures",
      "--concurrency", "1",
      "--output-dir", "artifacts/ai-benchmark-d1-smoke",
      "--dry-run",
    ]);

    expect(options.replayMode).toBe("failures");
    expect(options.outputDir).toBe("artifacts/ai-benchmark-d1-smoke");
    const result = await runD1(options);
    expect(result.plan.rawGames).toBe(1120);
    expect(result.plan.pairedUnits).toBe(560);
  });

  it("keeps the legacy aliases equivalent to the approved names", () => {
    const modern = parseD1Args(["--replay-mode", "all", "--output-dir", "artifacts/modern", "--dry-run"]);
    const legacy = parseD1Args(["--replay", "all", "--output", "artifacts/modern", "--dry-run"]);
    expect({ replayMode: legacy.replayMode, outputDir: legacy.outputDir })
      .toEqual({ replayMode: modern.replayMode, outputDir: modern.outputDir });
  });

  it("supports --flag=value without changing the normalized result", () => {
    const spaced = parseD1Args(["--phase", "smoke", "--replay-mode", "all", "--output-dir", "artifacts/x", "--dry-run"]);
    const equals = parseD1Args(["--phase=smoke", "--replay-mode=all", "--output-dir=artifacts/x", "--dry-run"]);
    expect(equals).toMatchObject({ phase: spaced.phase, replayMode: spaced.replayMode, outputDir: spaced.outputDir, dryRun: true });
  });

  it.each(["--output-dri", "--replay-mdoe", "--concurency", "--unknown"])('rejects unknown flag %s', (flag) => {
    expect(() => parseD1Args([flag, "value", "--dry-run"])).toThrow(new RegExp(`UNKNOWN_ARGUMENT:${flag.slice(2)}`));
  });

  it("rejects positional tokens and missing values", () => {
    expect(() => parseD1Args(["--phase", "smoke", "extra-token"])).toThrow(/ARGUMENT_INVALID/);
    expect(() => parseD1Args(["--output-dir"])).toThrow(/ARGUMENT_MISSING:output-dir/);
    expect(() => parseD1Args(["--output-dir", "--dry-run"])).toThrow(/ARGUMENT_MISSING:output-dir/);
  });

  it("rejects conflicting aliases and conflicting repeated values", () => {
    expect(() => parseD1Args(["--replay-mode", "failures", "--replay", "all", "--dry-run"]))
      .toThrow(/ARGUMENT_CONFLICT:replay-mode,replay/);
    expect(() => parseD1Args(["--output-dir", "artifacts/a", "--output", "artifacts/b", "--dry-run"]))
      .toThrow(/ARGUMENT_CONFLICT:output-dir,output/);
    expect(() => parseD1Args(["--phase", "smoke", "--phase", "calibration", "--dry-run"]))
      .toThrow(/ARGUMENT_CONFLICT:phase/);
  });

  it("rejects invalid typed values and unsafe output targets", () => {
    expect(() => parseD1Args(["--concurrency", "0", "--dry-run"])).toThrow(/CONCURRENCY_INVALID/);
    expect(() => parseD1Args(["--seed-start", "2.5", "--dry-run"])).toThrow(/SEED_RANGE_INVALID/);
    expect(() => parseD1Args(["--replay-mode", "none", "--dry-run"])).toThrow(/REPLAY_MODE_INVALID/);
    expect(() => parseD1Args(["--output-dir", "", "--dry-run"])).toThrow(/OUTPUT_DIR_INVALID/);
    expect(() => parseD1Args(["--output-dir", path.join("artifacts", "ai-benchmark-baseline.json"), "--dry-run"]))
      .toThrow(/OUTPUT_DIR_UNSAFE/);
  });

  it("forces formal replay all and rejects an explicit failures mode", () => {
    expect(parseD1Args(["--phase", "formal", "--dry-run"]).replayMode).toBe("all");
    expect(() => parseD1Args(["--phase", "formal", "--replay-mode", "failures", "--dry-run"]))
      .toThrow(/FORMAL_REPLAY_MODE_MUST_BE_ALL/);
  });

  it("does not create artifacts during dry-run and reports the normalized plan", async () => {
    const options = parseD1Args([
      "--phase=smoke",
      "--replay-mode=failures",
      "--output-dir=artifacts/ai-benchmark-d1-smoke",
      "--dry-run",
    ]);
    const result = await runD1(options);
    expect(result.dryRun).toBe(true);
    expect(planD1Run(options).rawGames).toBe(1120);
  });
});
