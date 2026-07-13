import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseBenchmarkArgs, runBenchmark, stripVolatile } from "../../scripts/runAiBenchmark";
import { replayMatch } from "../../scripts/replayAiBenchmark";
import { buildGamesForSeed } from "./rotations";
import { simulateGame } from "./simulator";
import { writeReplay, ENGINE_VERSION, ROOM_RULES_VERSION } from "./reporting";
import { strategyDescriptors } from "./strategies";
import type { BenchmarkConfig } from "./contracts";
import type { SimulationSummary } from "./simulator";

const resolvedDescriptors = strategyDescriptors.map((descriptor) => ({ ...descriptor, sourceCommit: descriptor.sourceCommit.toLowerCase() === "unknown" ? ENGINE_VERSION.split("@").slice(1).join("@") : descriptor.sourceCommit }));

describe("AI benchmark CLI", () => {
  it("parses required options, aliases, ranges and replay mode", () => {
    const options = parseBenchmarkArgs([
      "--strategy-a", "legal-greedy", "--strategy-b", "legal-random",
      "--seeds", "1-2,4", "--paired", "--replay", "all", "--concurrency", "2",
      "--timeout-ms", "1000", "--diagnostics", "--output", "out.json",
    ]);
    expect(options.strategyA).toBe("legal-greedy");
    expect(options.strategyB).toBe("legal-random");
    expect(options.seeds).toEqual([1, 2, 4]);
    expect(options.paired).toBe(true);
    expect(options.replayMode).toBe("all");
    expect(options.concurrency).toBe(2);
    expect(parseBenchmarkArgs(["--strategy-a", "deterministic-random", "--strategy-b", "simple-greedy"]).strategyA).toBe("legal-random");
    expect(parseBenchmarkArgs(["--strategy-a", "deterministic-random", "--strategy-b", "simple-greedy"]).strategyB).toBe("legal-greedy");
  });

  it("keeps gameplay identity stable when replay policy changes", async () => {
    const base = { strategyA: "unknown-a", strategyB: "unknown-b", seeds: [1], paired: false, concurrency: 1 };
    const none = await runBenchmark({ ...base, replayMode: "none" });
    const all = await runBenchmark({ ...base, replayMode: "all" });
    expect(all.configHash).toBe(none.configHash);
    expect(all.games.map((game) => game.matchId)).toEqual(none.games.map((game) => game.matchId));
  }, 30_000);

  it("produces stable summaries independent of worker count", async () => {
    const base = { strategyA: "unknown-a", strategyB: "unknown-b", seeds: [1], paired: true, replayMode: "none" as const };
    const one = await runBenchmark({ ...base, concurrency: 1 });
    const two = await runBenchmark({ ...base, concurrency: 2 });
    expect(stripVolatile(two.games)).toEqual(stripVolatile(one.games));
    expect(two.games.map((game) => game.matchId)).toEqual([...two.games].map((game) => game.matchId).sort());
  });

  it("rejects unknown strategy as a recorded failure", async () => {
    const result = await runBenchmark({ strategyA: "does-not-exist", strategyB: "legal-random", seeds: [1], paired: true, replayMode: "none", concurrency: 1 });
    expect(result.games.some((game) => { const simulation = game as SimulationSummary; return simulation.failed && simulation.errors.some((error) => error.error.includes("UNKNOWN_STRATEGY")); })).toBe(true);
  });

  it("keeps action hashes invariant when diagnostics are enabled and reports independent diagnostics", async () => {
    const base = { strategyA: "unknown-a", strategyB: "unknown-b", seeds: [1], paired: true, replayMode: "none" as const };
    const off = await runBenchmark({ ...base, diagnostics: false });
    const on = await runBenchmark({ ...base, diagnostics: true });
    expect(stripVolatile(on.games)).toEqual(stripVolatile(off.games));
    const diagnostics = on.games.map((game) => (game as { diagnostics?: { enabled: true; workerLocalToken: string } }).diagnostics);
    expect(diagnostics.every((value) => value?.enabled === true)).toBe(true);
    expect(new Set(diagnostics.map((value) => value?.workerLocalToken)).size).toBe(on.games.length);
    expect(on.report?.games).toEqual(expect.arrayContaining([expect.not.objectContaining({ diagnostics: expect.any(Object), durationMs: expect.anything() })]));
    expect(on.report?.paired).toEqual({ enabled: true, unit: "seed", rotations: 4, allocations: 2, gamesPerSeed: 8 });
  });

  it("reuses only a complete, matching manifest", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-benchmark-manifest-"));
    const output = path.join(root, "report.json");
    const base = { strategyA: "unknown-a", strategyB: "unknown-b", seeds: [1], paired: true, replayMode: "none" as const, output };
    const first = await runBenchmark(base);
    const manifestPath = `${output}.manifest.json`;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { games: Array<Record<string, unknown>>; expectedMatchIds: string[]; configHash: string };
    manifest.games[0]!.configHash = "wrong";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await expect(runBenchmark({ ...base, resume: true })).rejects.toThrow("CONFIG_HASH_MISMATCH");
    manifest.games[0]!.configHash = first.configHash;
    manifest.games.push({ ...manifest.games[0] });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await expect(runBenchmark({ ...base, skipExisting: true })).rejects.toThrow("DUPLICATE_MATCH_ID");
    manifest.games.pop();
    manifest.expectedMatchIds.pop();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await expect(runBenchmark({ ...base, resume: true })).rejects.toThrow("MISSING_EXPECTED_MATCH_ID");
  });

  it("recomputes corrupt reused rows instead of silently reusing them", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-benchmark-corrupt-"));
    const output = path.join(root, "report.json");
    const base = { strategyA: "unknown-a", strategyB: "unknown-b", seeds: [1], paired: false, replayMode: "none" as const, output };
    const first = await runBenchmark(base);
    const manifestPath = `${output}.manifest.json`;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { games: Array<Record<string, unknown>> };
    manifest.games[0]!.completed = false;
    manifest.games[0]!.durationMs = 0;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const resumed = await runBenchmark({ ...base, resume: true });
    expect(resumed.games).toHaveLength(first.games.length);
    expect(resumed.games.every((game) => (game as { durationMs?: number }).durationMs !== 0)).toBe(true);
  }, 30_000);

  it("preserves custom replay config and defaults saved replay mode to failures", () => {
    const config: BenchmarkConfig = { benchmarkVersion: "custom-v2", rank: "2", seeds: [1], strategyA: "unknown-a", strategyB: "unknown-b", replayMode: "failures" };
    const task = buildGamesForSeed(config, 1)[0]!;
    const summary = simulateGame(task);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-benchmark-replay-"));
    const replayPath = writeReplay(summary, { outputDir: root, benchmarkVersion: config.benchmarkVersion, engineVersion: ENGINE_VERSION, roomRulesVersion: ROOM_RULES_VERSION, strategyDescriptors: resolvedDescriptors });
    expect(replayPath).toBeDefined();
    const document = JSON.parse(fs.readFileSync(replayPath!, "utf8")) as { benchmarkVersion: string; replayMode: string };
    expect(document.benchmarkVersion).toBe("custom-v2");
    expect(document.replayMode).toBe("failures");
    expect(replayMatch(summary.matchId, root).verified).toBe(true);
  });

  it("records every timed-out worker task once without stale results", async () => {
    const result = await runBenchmark({ strategyA: "legal-greedy", strategyB: "legal-random", seeds: [1], paired: true, replayMode: "none", concurrency: 2, timeoutMs: 1 });
    expect(result.games).toHaveLength(8);
    expect(new Set(result.games.map((game) => game.matchId)).size).toBe(8);
    expect(result.games.every((game) => (game as { failed?: boolean }).failed)).toBe(true);
    expect(result.games.every((game) => typeof game.durationMs === "number" && game.durationMs > 0)).toBe(true);
  });

  it("applies an inclusive batch seed filter and parses paired aliases", () => {
    expect(() => parseBenchmarkArgs(["--strategy-a", "a", "--strategy-b", "b", "--seeds", "1-4", "--batch", "2-3"])).not.toThrow();
    expect(parseBenchmarkArgs(["--strategy-a", "a", "--strategy-b", "b", "--seeds", "1-4", "--batch", "2-3"]).seeds).toEqual([2, 3]);
    expect(parseBenchmarkArgs(["--strategy-a", "a", "--strategy-b", "b", "--paired=false"]).paired).toBe(false);
  });

  it("defaults to the paired D0 matrix and supports explicit unpaired runs", async () => {
    const base = { strategyA: "unknown-a", strategyB: "unknown-b", seeds: [1], replayMode: "none" as const };
    const parsedDefault = parseBenchmarkArgs(["--strategy-a", "unknown-a", "--strategy-b", "unknown-b", "--seeds", "1", "--replay", "none"]);
    expect(parsedDefault.paired).toBe(true);
    const paired = await runBenchmark(parsedDefault);
    expect(paired.games).toHaveLength(8);
    expect(paired.report?.paired).toEqual({ enabled: true, unit: "seed", rotations: 4, allocations: 2, gamesPerSeed: 8 });
    const unpaired = await runBenchmark({ ...base, paired: false });
    expect(unpaired.games).toHaveLength(4);
    expect(unpaired.report?.paired).toEqual({ enabled: false, unit: "seed", rotations: 4, allocations: 1, gamesPerSeed: 4 });
  });
});
