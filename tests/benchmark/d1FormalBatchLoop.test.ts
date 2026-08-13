import { describe, expect, it } from "vitest";
import { formalBatchPlan } from "./d1Matrix";

describe("D1 formal batch loop", () => {
  it("plans exactly 28 fifty-seed batches without running games", () => {
    const batches = formalBatchPlan("cfg");
    expect(batches).toHaveLength(28);
    expect(batches.every((batch) => batch.baseSeeds === 50 && batch.rawGames === 400 && batch.pairedUnits === 200 && batch.replayMode === "all")).toBe(true);
    expect(batches[0]?.seedStart).toBe(1001);
    expect(batches.at(-1)?.seedEnd).toBe(1200);
    expect(new Set(batches.map((batch) => batch.batchId)).size).toBe(28);
  });
});
