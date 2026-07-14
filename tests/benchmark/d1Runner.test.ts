import { describe, expect, it } from "vitest";
import { parseD1Args, planD1Run, runD1 } from "../../scripts/runD1TopKBenchmark";

describe("D1 runner safety", () => {
  it("plans dry-run formal work without invoking simulation", async () => {
    const options = parseD1Args(["--phase", "formal", "--seed-start", "1001", "--seed-end", "1050", "--dry-run", "--config-hash", "cfg"]);
    const result = await runD1(options);
    expect(result.dryRun).toBe(true);
    expect(result.plan.rawGames).toBe(7 * 50 * 8);
    expect(result.plan.pairedUnits).toBe(7 * 50 * 4);
  });

  it("rejects fake concurrency and formal execution without frozen approval", () => {
    expect(() => parseD1Args(["--phase", "formal", "--concurrency", "2"])).toThrow(/CONCURRENCY/);
    const options = parseD1Args(["--phase", "formal", "--dry-run"]);
    expect(planD1Run(options).batches).toHaveLength(28);
  });
});
