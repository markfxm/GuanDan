import { describe, expect, it } from "vitest";
import type { BenchmarkConfig } from "./contracts";
import { summarizeGame } from "./metrics";
import { classifyGame } from "./classification";
import { aggregateTournament, pairedBootstrap } from "./statistics";
import type { GameSummary } from "./contracts";
import type { PublicSimulationEvent } from "./simulator";

const config: BenchmarkConfig = {
  benchmarkVersion: "d0-v1",
  rank: "10",
  seeds: [1],
  strategyA: "legal-greedy",
  strategyB: "legal-random",
  replayMode: "none",
};

describe("benchmark metrics and statistics", () => {
  it("derives winner, placement, and efficiency counters from a completed game", () => {
    const game = fakeGame(7, 0);
    const summary = summarizeGame(game);
    expect(summary.winnerTeam).toBe(game.winnerTeam);
    expect(summary.finishOrder).toEqual(game.finishOrder);
    expect(summary.teamPlacementScore).toBeTypeOf("number");
    expect(summary.actionCount).toBe(game.actionCount);
    expect(summary.errorCounters.total).toBe(0);
    expect(summary.playPassRatio.plays + summary.playPassRatio.passes).toBe(game.actionCount);
    expect(summary.advancementProxy).toBeTypeOf("number");
    expect(summary.categoryTags).toEqual(expect.arrayContaining([
      "straight-potential",
      "consecutive-pair-potential",
      "dispersion",
      "joker-concentration",
      "wild-card-impact",
      "plan-quality-gap",
      "partner-imbalance",
      "long-game",
      "short-game",
    ]));
  });

  it("marks post-game classifications as exploratory", () => {
    const game = fakeGame(8, 0);
    expect(classifyGame(game).exploratory).toBe(true);
  });

  it("reverses paired A/B differences when labels are swapped", () => {
    const games = [0, 1].flatMap((seed) => Array.from({ length: 8 }, (_, index) => fakeGame(seed, index)));
    const original = aggregateTournament(games, config);
    const swapped = aggregateTournament(games, { ...config, strategyA: config.strategyB, strategyB: config.strategyA });
    expect(swapped.scoreDifference).toBe(-original.scoreDifference);
    expect(swapped.finishDifference).toBe(-original.finishDifference);
    expect(swapped.winsA).toBe(original.winsB);
    expect(swapped.winsB).toBe(original.winsA);
  });

  it("resamples complete eight-game base-seed blocks deterministically", () => {
    const games = [1, 2].flatMap((seed) => Array.from({ length: 8 }, (_, index) => fakeGame(seed, index)));
    const first = pairedBootstrap(games, 4, 123);
    const second = pairedBootstrap(games, 4, 123);
    expect(second).toEqual(first);
    expect(first.samples).toHaveLength(4);
    expect(first.samples[0]!.games).toHaveLength(8);
    expect(new Set(first.samples[0]!.games.map((game) => game.rotation)).size).toBe(4);
    expect(new Set(first.samples[0]!.games.map((game) => game.matchId.includes("allocation:BA"))).size).toBe(2);
  });

  it("rejects malformed seed blocks instead of silently resampling partial pairing", () => {
    const malformed = Array.from({ length: 7 }, (_, index) => fakeGame(3, index));
    expect(() => pairedBootstrap([{ seed: 3, games: malformed }], 1, 7)).toThrow("BASE_SEED_BLOCK_INVALID");
    const wrongAllocation = Array.from({ length: 8 }, (_, index) => ({ ...fakeGame(3, index), matchId: `seed:3:rotation:${Math.floor(index / 2)}:allocation:AC` }));
    expect(() => pairedBootstrap([{ seed: 3, games: wrongAllocation }], 1, 7)).toThrow("BASE_SEED_BLOCK_INVALID");
    const wrongSeed = Array.from({ length: 8 }, (_, index) => ({ ...fakeGame(3, index), seed: index === 0 ? 99 : 3 }));
    expect(() => pairedBootstrap([{ seed: 3, games: wrongSeed }], 1, 7)).toThrow("BASE_SEED_BLOCK_INVALID");
  });

  it("classifies wild cards from card rank and suit semantics", () => {
    const game = { ...fakeGame(4, 0), publicEvents: [event(0, "H10-1")] };
    const classification = classifyGame(game);
    expect(classification.scores["wild-card-impact"]).toBeGreaterThan(0);
    expect(classification.metadata.strategyObservationSafe).toBe(true);
    expect(classification.availability["plan-quality-gap"].available).toBe(false);
  });

  it("reports raw games, validated paired units, and both neutral significance flags", () => {
    const games = [1, 2].flatMap((seed) => Array.from({ length: 8 }, (_, index) => fakeGame(seed, index)));
    const neutralGames = games.map((game) => ({ ...game, winnerTeam: 0 as const, teamScore: { 0: 1, 1: 0 } as const }));
    const aggregate = aggregateTournament(neutralGames, config, { bootstrapIterations: 20, bootstrapSeed: 2 });
    expect(aggregate.rawGames).toBe(16);
    expect(aggregate.pairedRotationUnits).toBe(8);
    expect(aggregate.baseSeeds).toBe(2);
    expect(aggregate.significance.score.excludesNeutral).toBeTypeOf("boolean");
    expect(aggregate.significance.winRate.excludesNeutral).toBeTypeOf("boolean");
    expect(aggregate.significance.winRate.ci[0]).toBeLessThanOrEqual(0.5);
    expect(aggregate.significance.winRate.ci[1]).toBeGreaterThanOrEqual(0.5);
  });

  it("uses hand-count trajectory rather than seat identifiers for dispersion", () => {
    const first = classifyGame({ ...fakeGame(5, 0), publicEvents: [eventWithCount(0, "S2-1", 26), eventWithCount(2, "C3-1", 1)] });
    const second = classifyGame({ ...fakeGame(5, 0), publicEvents: [eventWithCount(0, "S2-1", 14), eventWithCount(2, "C3-1", 14)] });
    expect(first.scores.dispersion).not.toBe(second.scores.dispersion);
  });
});

function event(seat: 0 | 1 | 2 | 3, cardId: string): PublicSimulationEvent {
  return eventWithCount(seat, cardId, 20);
}

function eventWithCount(seat: 0 | 1 | 2 | 3, cardId: string, count: number): PublicSimulationEvent {
  const handCounts = { 0: 27, 1: 27, 2: 27, 3: 27 } as Record<0 | 1 | 2 | 3, number>;
  handCounts[seat] = count;
  return {
    actionIndex: 0,
    seat,
    action: { type: "play", cardIds: [cardId] },
    handCounts,
    handCountChanges: { 0: -1, 1: 0, 2: 0, 3: 0 },
    trick: { leadSeat: seat, passSeats: [], plays: [] },
    tributeEvents: [],
    finishOrder: [],
  };
}

function fakeGame(seed: number, index: number): GameSummary {
  const rotation = Math.floor(index / 2) as 0 | 1 | 2 | 3;
  const allocation = index % 2 === 0 ? "AB" : "BA";
  const strategiesBySeat = allocation === "AB"
    ? { 0: config.strategyA, 1: config.strategyB, 2: config.strategyA, 3: config.strategyB }
    : { 0: config.strategyB, 1: config.strategyA, 2: config.strategyB, 3: config.strategyA };
  const isBa = allocation === "BA";
  return {
    matchId: `seed:${seed}:rotation:${rotation}:allocation:${allocation}`,
    configHash: "test",
    seed,
    rank: config.rank,
    rotation,
    strategiesBySeat,
    finishOrder: isBa ? [1, 3, 0, 2] : [0, 2, 1, 3],
    winnerTeam: isBa ? 1 : 0,
    teamScore: isBa ? { 0: 0, 1: 1 } : { 0: 1, 1: 0 },
    actionCount: 0,
    publicTraceHash: "trace",
    finalPublicStateHash: "state",
    durationMs: 1,
  };
}
