import { describe, expect, it } from "vitest";
import { pairedBlockStatistics, pairedBootstrap, jointUplift } from "./d1Statistics";

const game = (seed: number, rotation: number, allocation: "AB" | "BA", score: number, winner: "a" | "b" | "draw") => ({
  seed, rotation, allocation, scoreDifference: score, outcome: winner,
});

describe("D1 paired statistics", () => {
  it("treats a base seed's eight games as one bootstrap block", () => {
    const games = [0, 1, 2, 3].flatMap((rotation) => [game(201, rotation, "AB", 1, "a"), game(201, rotation, "BA", -1, "b")]);
    const result = pairedBlockStatistics(games, { bootstrapIterations: 32, bootstrapSeed: 20260714 });
    expect(result.blockUnit).toBe("base-seed");
    expect(result.baseSeedCount).toBe(1);
    expect(result.pairedUnitCount).toBe(4);
    expect(result.bootstrap.iterations).toBe(32);
    expect(result.bootstrap.seed).toBe(20260714);
    expect(result.scoreCI).toEqual(pairedBootstrap(games, { iterations: 32, seed: 20260714 }).scoreCI);
  });

  it("computes joint uplift from same-seed blocks rather than subtracting CIs", () => {
    const treatmentGreedy = [201, 202].map((seed) => ({ seed, scoreDifference: seed === 201 ? 2 : 4, winRate: 1 }));
    const controlGreedy = [201, 202].map((seed) => ({ seed, scoreDifference: seed === 201 ? 1 : 1, winRate: 0 }));
    const uplift = jointUplift(treatmentGreedy, controlGreedy, { iterations: 32, seed: 20260714 });
    expect(uplift.scoreBlocks).toEqual([1, 3]);
    expect(uplift.winRateBlocks).toEqual([1, 1]);
    expect(uplift.bootstrap.blockUnit).toBe("base-seed-difference");
  });
});
