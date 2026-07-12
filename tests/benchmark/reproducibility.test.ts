import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runBenchmark, stripVolatile } from "../../scripts/runAiBenchmark";
import { replayMatch } from "../../scripts/replayAiBenchmark";
import { buildGamesForSeed } from "./rotations";
import { createManifest, mergeBatches, writeReplay } from "./reporting";
import { simulateGame, type SimulationSummary } from "./simulator";
import type { BenchmarkConfig } from "./contracts";

const base = {
  strategyA: "unknown-a",
  strategyB: "unknown-b",
  paired: true,
  replayMode: "failures" as const,
  timeoutMs: 30_000,
};

describe("AI benchmark reproducibility", () => {
  it("keeps one-shot and four 50-seed batch manifests identical after volatile fields are removed", async () => {
    const oneShot = await runBenchmark({ ...base, seeds: Array.from({ length: 200 }, (_, index) => index + 1), concurrency: 4 });
    const batches = await Promise.all([1, 2, 3, 4].map((batch) => {
      const start = (batch - 1) * 50 + 1;
      return runBenchmark({ ...base, seeds: Array.from({ length: 50 }, (_, index) => start + index), concurrency: 4 });
    }));
    const merged = mergeBatches(batches.map((batch) => batch.manifest));
    expect(stripVolatile(merged.games)).toEqual(stripVolatile(oneShot.manifest.games));
    expect(merged.publicTraceHashes).toEqual(oneShot.manifest.publicTraceHashes);
    expect(merged.finalPublicStateHashes).toEqual(oneShot.manifest.finalPublicStateHashes);
  }, 120_000);

  it("replays saved failures with matching public and final hashes without private state", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "d0-repro-replay-"));
    const config: BenchmarkConfig = { benchmarkVersion: "d0-v1", rank: "2", seeds: [1], strategyA: base.strategyA, strategyB: base.strategyB, replayMode: "failures" };
    const summary = simulateGame(buildGamesForSeed(config, 1)[0]!);
    const replayPath = writeReplay(summary, { outputDir: root, replayMode: "failures" });
    expect(replayPath).toBeDefined();
    const document = JSON.parse(fs.readFileSync(replayPath!, "utf8")) as Record<string, unknown>;
    const replay = replayMatch(summary.matchId, root);
    expect(replay).toMatchObject({ matchId: summary.matchId, publicTraceHash: summary.publicTraceHash, finalPublicStateHash: summary.finalPublicStateHash, verified: true });
    expect(JSON.stringify(document)).not.toMatch(/(hands|initialHands|hiddenState|fullState|ownHand|aiRuntime)/i);
  });

  it("keeps actions, hashes, and safety counters invariant when diagnostics are toggled", async () => {
    const off = await runBenchmark({ ...base, seeds: [1], diagnostics: false });
    const on = await runBenchmark({ ...base, seeds: [1], diagnostics: true });
    expect(stripVolatile(on.games)).toEqual(stripVolatile(off.games));
    for (const game of on.games as Array<SimulationSummary>) {
      expect(game.errorCounters.total).toBe(game.errors.length);
      expect(game.errorCounters.strategyErrors + game.errorCounters.runtimeErrors + game.errorCounters.engineErrors + game.errorCounters.guardErrors).toBe(game.errorCounters.total);
      expect(game.errorCounters.illegalActions).toBe(0);
    }
  });

  it("is deterministic across direct and worker execution", async () => {
    const direct = await runBenchmark({ ...base, seeds: [1], concurrency: 1 });
    const workers = await runBenchmark({ ...base, seeds: [1], concurrency: 2 });
    expect(stripVolatile(workers.games)).toEqual(stripVolatile(direct.games));
    expect(workers.games.map((game) => game.matchId)).toEqual([...workers.games].map((game) => game.matchId).sort());
  });

  it("keeps benchmark orchestration imports on the test adapter boundary", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "tests/benchmark/strategies.ts"), "utf8");
    expect(source).toContain("toProductionObservation");
    expect(source).not.toMatch(/from\s+["'][^"']*src\/game\/room["']/);
  });
});
