import { describe, expect, it } from "vitest";
import { buildD1Matrix, phasePlan, expectedMatchId } from "./d1Matrix";

describe("D1 benchmark matrix", () => {
  it("builds the approved seven matchups and phase counts", () => {
    const matrix = buildD1Matrix({ benchmarkVersion: "d1-topk-v1", rank: "2", configHash: "cfg" });
    expect(matrix.matchups).toHaveLength(7);
    expect(matrix.matchups.map((m) => `${m.strategyA} vs ${m.strategyB}`)).toEqual([
      "unified-d1-topk-switch vs unified-current",
      "unified-d1-topk-switch vs legal-greedy",
      "unified-current vs legal-greedy",
      "unified-d1-topk-switch vs legal-random",
      "unified-current vs legal-random",
      "unified-d1-topk-switch vs legacy-reference",
      "unified-current vs legacy-reference",
    ]);
    expect(phasePlan("smoke")).toMatchObject({ start: 201, end: 220, baseSeeds: 20, rawGames: 160, pairedUnits: 80 });
    expect(phasePlan("calibration")).toMatchObject({ start: 221, end: 270, baseSeeds: 50, rawGames: 400, pairedUnits: 200 });
    expect(phasePlan("formal")).toMatchObject({ start: 1001, end: 1200, baseSeeds: 200, rawGames: 1600, pairedUnits: 800 });
  });

  it("uses stable eight-game match identities per base seed", () => {
    const ids = ["AB", "BA"].flatMap((allocation) => [0, 1, 2, 3].map((rotation) => expectedMatchId({ matchup: "treatment-vs-control", seed: 201, allocation, rotation: rotation as 0 | 1 | 2 | 3, configHash: "cfg" })));
    expect(new Set(ids).size).toBe(8);
    expect(ids).toEqual([...ids].sort());
  });
});
