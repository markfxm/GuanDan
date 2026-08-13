import type { BenchmarkConfig } from "./contracts";
import { buildGamesForSeed } from "./rotations";
import { simulateGame } from "./simulator";
import { finalPublicStateHash, publicTraceHash } from "./reporting";

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
  expect(summary.durationMs).toBeGreaterThan(0);
  expect(summary.finishOrder).toHaveLength(4);
  expect(summary.actionCount).toBeGreaterThan(0);
  expect(summary.publicTraceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(summary.finalPublicStateHash).toMatch(/^[a-f0-9]{64}$/);
  expect(summary.failed).toBe(false);
  expect(summary.errorCounters).toEqual({
    total: 0,
    strategyErrors: 0,
    runtimeErrors: 0,
    illegalActions: 0,
    engineErrors: 0,
    guardErrors: 0,
  });
  expect(summary.publicEvents.length).toBe(summary.actionCount);
  expect(summary.publicTraceHash).toBe(publicTraceHash(summary.publicEvents));
  expect(summary.finalPublicStateHash).toBe(finalPublicStateHash(summary));
  expect(summary.publicEvents[0]).toMatchObject({
    handCounts: expect.any(Object),
    handCountChanges: expect.any(Object),
    trick: expect.any(Object),
    tributeEvents: expect.any(Array),
    finishOrder: expect.any(Array),
  });
});

it("is deterministic for the same task and exposes no hidden hands", () => {
  const task = buildGamesForSeed(config, 8)[1]!;
  const first = simulateGame(task);
  const second = simulateGame(task);
  expect(second.publicTraceHash).toBe(first.publicTraceHash);
  expect(second.finalPublicStateHash).toBe(first.finalPublicStateHash);
  expect(second.durationMs).toBeGreaterThan(0);
  expect(first).not.toHaveProperty("hands");
  expect(first).not.toHaveProperty("initialHands");
});

it("normalizes strategy lookup failures into numeric safety counters", () => {
  const broken = {
    ...config,
    strategyA: "missing-strategy",
  };
  const summary = simulateGame(buildGamesForSeed(broken, 9)[0]!);
  expect(summary.failed).toBe(true);
  expect(summary.errorCounters.total).toBeGreaterThan(0);
  expect(summary.errorCounters.strategyErrors).toBeGreaterThan(0);
  expect(summary.errors[0]).toMatchObject({ seed: 9, strategy: "missing-strategy" });
});
