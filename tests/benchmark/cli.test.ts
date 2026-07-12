import { describe, expect, it } from "vitest";
import { parseBenchmarkArgs, runBenchmark, stripVolatile } from "../../scripts/runAiBenchmark";
import type { SimulationSummary } from "./simulator";

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
  });

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
});
