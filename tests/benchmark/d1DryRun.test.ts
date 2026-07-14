import { describe, expect, it } from "vitest";
import { parseD1Args, runD1 } from "../../scripts/runD1TopKBenchmark";

describe("D1 dry-run plan contract", () => {
  it("exposes normalized smoke configuration, stable matchup summaries, and totals", async () => {
    const options = parseD1Args([
      "--phase", "smoke",
      "--replay-mode", "failures",
      "--concurrency", "1",
      "--output-dir", "artifacts/ai-benchmark-d1-smoke",
      "--dry-run",
    ]);
    const result = await runD1(options);
    const output = result.dryRunOutput!;

    expect(output.schemaVersion).toBe("d1-benchmark-dry-run-v1");
    expect(output.dryRun).toBe(true);
    expect(output.normalizedArgs).toMatchObject({
      matchup: null,
      seedStart: 201,
      seedEnd: 220,
      replayMode: "failures",
      outputDir: "artifacts/ai-benchmark-d1-smoke",
      concurrency: 1,
      resume: false,
      skipExisting: false,
      dryRun: true,
    });
    expect(output.seedSummary).toEqual({
      start: 201,
      end: 220,
      baseSeedCount: 20,
      placementsPerSeed: 2,
      rotationsPerPlacement: 4,
      rawGamesPerSeed: 8,
      pairedUnitsPerSeed: 4,
    });
    expect(output.matchups.map((matchup) => matchup.matchup)).toEqual([
      "treatment-vs-control",
      "treatment-vs-greedy",
      "control-vs-greedy",
      "treatment-vs-random",
      "control-vs-random",
      "treatment-vs-legacy",
      "control-vs-legacy",
    ]);
    expect(output.matchups.every((matchup) => matchup.rawGames === 160 && matchup.pairedUnits === 80 && matchup.batchCount === 1 && matchup.replayMode === "failures")).toBe(true);
    expect(output.totals).toMatchObject({ matchups: 7, baseSeedMatchupBlocks: 140, rawGames: 1120, pairedUnits: 560, batches: 7, expectedMatchIds: 1120 });
    expect(output.expectedMatchIdsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.configHash).toBe("d1-config-unfrozen");
  });

  it("reports calibration counts and a single selected matchup deterministically", async () => {
    const calibration = await runD1(parseD1Args(["--phase", "calibration", "--replay-mode", "failures", "--dry-run"]));
    expect(calibration.dryRunOutput).toMatchObject({
      seedSummary: { start: 221, end: 270, baseSeedCount: 50 },
      totals: { matchups: 7, rawGames: 2800, pairedUnits: 1400, expectedMatchIds: 2800 },
    });

    const selected = await runD1(parseD1Args(["--phase", "smoke", "--matchup", "treatment-vs-control", "--replay-mode", "failures", "--dry-run"]));
    expect(selected.dryRunOutput?.matchups).toHaveLength(1);
    expect(selected.dryRunOutput?.matchups[0]).toMatchObject({ matchup: "treatment-vs-control", rawGames: 160, pairedUnits: 80 });
    expect(selected.dryRunOutput?.totals).toMatchObject({ matchups: 1, rawGames: 160, pairedUnits: 80, expectedMatchIds: 160 });
  });

  it("uses the same normalized model for modern and legacy aliases", async () => {
    const modern = await runD1(parseD1Args(["--phase=smoke", "--replay-mode=failures", "--output-dir=artifacts/a/../ai-benchmark-d1-smoke", "--dry-run"]));
    const legacy = await runD1(parseD1Args(["--phase=smoke", "--replay=failures", "--output=artifacts/ai-benchmark-d1-smoke", "--dry-run"]));
    expect(modern.dryRunOutput).toEqual(legacy.dryRunOutput);
  });

  it("changes the expected ID hash when the seed range or config changes", async () => {
    const base = await runD1(parseD1Args(["--phase", "smoke", "--replay-mode", "failures", "--dry-run"]));
    const seed = await runD1(parseD1Args(["--phase", "smoke", "--seed-start", "202", "--seed-end", "220", "--replay-mode", "failures", "--dry-run"]));
    const config = await runD1(parseD1Args(["--phase", "smoke", "--config-hash", "other", "--replay-mode", "failures", "--dry-run"]));
    expect(seed.dryRunOutput?.expectedMatchIdsHash).not.toBe(base.dryRunOutput?.expectedMatchIdsHash);
    expect(config.dryRunOutput?.expectedMatchIdsHash).not.toBe(base.dryRunOutput?.expectedMatchIdsHash);
  });

  it("does not create output directories or invoke simulation in dry-run", async () => {
    const result = await runD1(parseD1Args(["--phase", "smoke", "--replay-mode", "failures", "--output-dir", "artifacts/ai-benchmark-d1-dry-run-only", "--dry-run"]));
    expect(result.dryRun).toBe(true);
    expect(result.manifest).toBeUndefined();
  });
});
