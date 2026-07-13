import { describe, expect, it } from "vitest";
import {
  buildBenchmarkReportModel,
  renderReportMarkdown,
  serializeReportJson,
  type MatchupSource,
} from "./reportModel";
import type { GameSummary } from "./contracts";

function game(strategyA: string, strategyB: string, seed: number, rotation: 0 | 1 | 2 | 3, allocation: "AB" | "BA", winnerTeam: 0 | 1): GameSummary {
  const strategiesBySeat = allocation === "AB"
    ? { 0: strategyA, 1: strategyB, 2: strategyA, 3: strategyB }
    : { 0: strategyB, 1: strategyA, 2: strategyB, 3: strategyA };
  return {
    matchId: JSON.stringify({ allocation, matchup: `${strategyA}-vs-${strategyB}`, rotation, seed }),
    configHash: `${strategyA}-${strategyB}`,
    seed,
    rank: "2",
    rotation,
    strategiesBySeat,
    finishOrder: [0, 1, 2, 3],
    winnerTeam,
    teamScore: { 0: winnerTeam === 0 ? 1 : 0, 1: winnerTeam === 1 ? 1 : 0 },
    actionCount: 1,
    publicTraceHash: `trace-${seed}-${rotation}-${allocation}`,
    finalPublicStateHash: `state-${seed}-${rotation}-${allocation}`,
    durationMs: 1,
  };
}

function source(strategyA: string, strategyB: string): MatchupSource {
  const games = [0, 1].flatMap((seed) => [0, 1, 2, 3].flatMap((rotation) => [
    game(strategyA, strategyB, seed, rotation as 0 | 1 | 2 | 3, "AB", 0),
    game(strategyA, strategyB, seed, rotation as 0 | 1 | 2 | 3, "BA", 1),
  ]));
  return {
    strategyA,
    strategyB,
    configHash: `${strategyA}-${strategyB}`,
    benchmarkVersion: "d0-v1",
    engineVersion: "pkg@commit",
    roomRulesVersion: "rules",
    strategyDescriptors: [],
    games,
    expectedMatchIds: games.map((entry) => entry.matchId),
    completedMatchIds: games.map((entry) => entry.matchId),
    batchConfigHashes: [`${strategyA}-${strategyB}`],
  };
}

describe("D0-R2 report model", () => {
  it("keeps global counts, matchup count, CIs, and bootstrap metadata in one model", () => {
    const model = buildBenchmarkReportModel({
      benchmarkVersion: "d0-r2",
      rank: "2",
      replayMode: "all",
      generatedAt: "2026-07-14T00:00:00.000Z",
      sourceCommit: "commit",
      roomRulesVersion: "rules",
      matchups: [source("unified-current", "legal-random"), source("unified-current", "legal-greedy"), source("unified-current", "legacy-reference")],
      replayValidation: {},
    });
    expect(model.config.seedCount).toBe(2);
    expect(model.config.rawGames).toBe(48);
    expect(model.config.pairedUnits).toBe(24);
    expect(model.matchups).toHaveLength(3);
    expect(model.matchups[0]?.bootstrap).toEqual({ blockUnit: "base-seed", iterations: 200, seed: 1 });
    expect(model.matchups[0]?.paired.winRateA).toBeDefined();
    expect(model.matchups[0]?.paired.scoreDifferenceCI).toHaveLength(2);
  });

  it("serializes JSON and Markdown from the same matchup model", () => {
    const model = buildBenchmarkReportModel({
      benchmarkVersion: "d0-r2", rank: "2", replayMode: "all", generatedAt: "2026-07-14T00:00:00.000Z", sourceCommit: "commit", roomRulesVersion: "rules",
      matchups: [source("unified-current", "legal-random"), source("unified-current", "legal-greedy"), source("unified-current", "legacy-reference")], replayValidation: {},
    });
    const json = JSON.parse(serializeReportJson(model));
    const markdown = renderReportMarkdown(model);
    expect(json.matchups).toHaveLength(3);
    for (const matchup of json.matchups) expect(markdown).toContain(`${matchup.strategyA} vs ${matchup.strategyB}`);
    expect(markdown).not.toMatch(/\{\{[^}]+\}\}|undefined|NaN/);
  });

  it("is byte-stable when generatedAt is fixed", () => {
    const input = {
      benchmarkVersion: "d0-r2", rank: "2" as const, replayMode: "all" as const, generatedAt: "2026-07-14T00:00:00.000Z", sourceCommit: "commit", roomRulesVersion: "rules",
      matchups: [source("unified-current", "legal-random"), source("unified-current", "legal-greedy"), source("unified-current", "legacy-reference")], replayValidation: {},
    };
    const first = buildBenchmarkReportModel(input);
    const second = buildBenchmarkReportModel(input);
    expect(serializeReportJson(first)).toBe(serializeReportJson(second));
    expect(renderReportMarkdown(first)).toBe(renderReportMarkdown(second));
  });
});
