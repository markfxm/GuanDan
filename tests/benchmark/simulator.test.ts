import type { BenchmarkConfig } from "./contracts";
import { buildGamesForSeed } from "./rotations";
import { simulateGame } from "./simulator";

const config: BenchmarkConfig = {
  benchmarkVersion: "d0-v1",
  rank: "10",
  seeds: [1],
  strategyA: "legal-greedy",
  strategyB: "legal-random",
  replayMode: "none",
};

it("completes a mixed real-room game through strategy actions", () => {
  const summary = simulateGame(buildGamesForSeed(config, 7)[0]!);
  expect(summary.finishOrder).toHaveLength(4);
  expect(summary.actionCount).toBeGreaterThan(0);
  expect(summary.publicTraceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(summary.finalPublicStateHash).toMatch(/^[a-f0-9]{64}$/);
  expect(summary.failed).toBe(false);
});

it("is deterministic for the same task and exposes no hidden hands", () => {
  const task = buildGamesForSeed(config, 8)[1]!;
  const first = simulateGame(task);
  const second = simulateGame(task);
  expect(second).toEqual(first);
  expect(first).not.toHaveProperty("hands");
  expect(first).not.toHaveProperty("initialHands");
});
