import { describe, expect, it } from "vitest";
import { runBenchmark } from "../../scripts/runAiBenchmark";

function workerResources(): number {
  const processWithResources = process as NodeJS.Process & { getActiveResourcesInfo?: () => string[] };
  return (processWithResources.getActiveResourcesInfo?.() ?? []).filter((resource) => /Worker|MessagePort/i.test(resource)).length;
}

describe("benchmark worker lifecycle", () => {
  it("does not resolve until benchmark workers are terminated", async () => {
    const before = workerResources();
    await runBenchmark({ strategyA: "unknown-a", strategyB: "unknown-b", seeds: [1], paired: false, concurrency: 1, replayMode: "none" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(workerResources()).toBeLessThanOrEqual(before);
  }, 120_000);
});
