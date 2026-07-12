import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BenchmarkConfig, GameSummary, StrategyDescriptor } from "./contracts";
import type { SimulationSummary } from "./simulator";
import {
  createManifest,
  finalPublicStateHash,
  mergeBatches,
  publicTraceHash,
  writeReplay,
  writeReport,
} from "./reporting";

const config: BenchmarkConfig = {
  benchmarkVersion: "d0-v1",
  rank: "10",
  seeds: [1],
  strategyA: "legal-greedy",
  strategyB: "legal-random",
  replayMode: "all",
};

const descriptors: StrategyDescriptor[] = [
  { id: "legal-greedy", implementationVersion: "v1", configHash: "c", sourceCommit: "s", candidatePolicy: "legal-only" },
  { id: "legal-random", implementationVersion: "v1", configHash: "c", sourceCommit: "s", candidatePolicy: "legal-only" },
];

const summary = (seed: number, rotation: 0 | 1 | 2 | 3, allocation: "AB" | "BA"): GameSummary => ({
  matchId: `m-${seed}-${rotation}-${allocation}`,
  configHash: "config-1",
  seed,
  rank: "10",
  rotation,
  strategiesBySeat: allocation === "AB"
    ? { 0: "legal-greedy", 1: "legal-random", 2: "legal-greedy", 3: "legal-random" }
    : { 0: "legal-random", 1: "legal-greedy", 2: "legal-random", 3: "legal-greedy" },
  finishOrder: [0, 1, 2, 3],
  winnerTeam: 0,
  teamScore: { 0: 1, 1: 0 },
  actionCount: 1,
  publicTraceHash: "trace",
  finalPublicStateHash: "state",
});

it("canonical public hashes ignore timings, paths, stacks, and worker IDs", () => {
  const first = [{ actionIndex: 0, seat: 0, action: { type: "play", cardIds: ["S10-1", "S2-1"] }, durationMs: 4, diagnostics: { elapsed: 9 }, path: "a", workerId: 1, errorStack: "x" }];
  const second = [{ workerId: 8, errorStack: "y", path: "b", diagnostics: { elapsed: 90 }, durationMs: 99, action: { cardIds: ["S2-1", "S10-1"], type: "play" }, seat: 0, actionIndex: 0 }];
  expect(publicTraceHash(first)).toBe(publicTraceHash(second));
  expect(finalPublicStateHash({ rank: "10", status: "finished", handCounts: { 1: 0, 0: 0, 3: 0, 2: 0 }, durationMs: 1 })).toBe(
    finalPublicStateHash({ status: "finished", durationMs: 90, rank: "10", handCounts: { 0: 0, 1: 0, 2: 0, 3: 0 }, workerId: 3 }),
  );
  expect(publicTraceHash(first)).not.toBe(publicTraceHash([{ ...first[0], seat: 1 }]));
});

it("writes schema-complete replay and privacy-safe report", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d0-report-"));
  const game = {
    ...summary(1, 0, "AB"),
    completed: true,
    failed: false,
    errors: [],
    errorCounters: { total: 0, strategyErrors: 0, runtimeErrors: 0, illegalActions: 0, engineErrors: 0, guardErrors: 0 },
    publicEvents: [{ actionIndex: 0, seat: 0, action: { type: "pass" }, handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 }, handCountChanges: { 0: 0, 1: 0, 2: 0, 3: 0 }, trick: { leadSeat: 0, passSeats: [], plays: [] }, tributeEvents: [], finishOrder: [] }],
  } as SimulationSummary;
  const replayPath = writeReplay(game, { outputDir: dir, replayMode: "all", strategyDescriptors: descriptors, engineVersion: "pkg@sha", roomRulesVersion: "rules" });
  const replay = JSON.parse(fs.readFileSync(replayPath!, "utf8"));
  expect(replay).toMatchObject({ schemaVersion: "1", replayVersion: "d0-v1", benchmarkVersion: "d0-v1", engineVersion: "pkg@sha", roomRulesVersion: "rules", configHash: "config-1", finalPublicStateHash: "state" });
  const reportPath = writeReport({ config, games: [game], replayPaths: ["../replays/m.json"] }, { outputPath: path.join(dir, "report.json") });
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  expect(report.games[0]).not.toHaveProperty("publicEvents");
  expect(report.games[0]).not.toHaveProperty("hands");
  expect(report.games[0].replayPath).toBe("../replays/m.json");
});

it("defaults replay mode to failures", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d0-default-replay-"));
  const game = summary(1, 0, "AB") as SimulationSummary;
  expect(writeReplay({ ...game, failed: false }, { outputDir: dir })).toBeUndefined();
  expect(writeReplay({ ...game, failed: true }, { outputDir: dir })).toBeDefined();
});

it("rejects games whose config hash differs from their manifest", () => {
  const games = [0, 1, 2, 3].flatMap((seed) => [0, 1, 2, 3].flatMap((rotation) => [summary(seed, rotation as 0 | 1 | 2 | 3, "AB"), summary(seed, rotation as 0 | 1 | 2 | 3, "BA")]));
  expect(() => createManifest(config, [{ ...games[0]!, configHash: "other" }, ...games.slice(1)])).toThrow(/CONFIG_HASH/);
  const batch = createManifest(config, games.slice(0, 8));
  expect(() => mergeBatches([{ ...batch, games: [{ ...batch.games[0]!, configHash: "other" }, ...batch.games.slice(1)] }])).toThrow(/CONFIG_HASH/);
});

it("uses an explicit compact-summary whitelist and drops circular/private state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d0-whitelist-"));
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const game = { ...summary(1, 0, "AB"), hiddenHands: ["secret"], privateHands: ["secret"], state: circular } as GameSummary & Record<string, unknown>;
  const reportPath = writeReport({ config, games: [game] }, { outputPath: path.join(dir, "report.json") });
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  expect(report.games[0]).not.toHaveProperty("hiddenHands");
  expect(report.games[0]).not.toHaveProperty("privateHands");
  expect(report.games[0]).not.toHaveProperty("state");
});

it("merges complete batches and rejects duplicates, gaps, incomplete blocks, and config mismatch", () => {
  const games = [0, 1, 2, 3].flatMap((seed) => [0, 1, 2, 3].flatMap((rotation) => [summary(seed, rotation as 0 | 1 | 2 | 3, "AB"), summary(seed, rotation as 0 | 1 | 2 | 3, "BA")]));
  const batches = [0, 1, 2, 3].map((index) => createManifest(config, games.filter((game) => game.seed === index)));
  expect(mergeBatches(batches).games).toHaveLength(32);
  expect(() => mergeBatches([...batches, batches[0]!])).toThrow(/DUPLICATE_MATCH_ID/);
  expect(() => mergeBatches(batches.map((batch, index) => index === 1 ? { ...batch, configHash: "other" } : batch))).toThrow(/CONFIG_HASH/);
  expect(() => mergeBatches([createManifest(config, games.slice(0, 7))])).toThrow(/INCOMPLETE/);
  const missingExpected = createManifest(config, games.filter((game) => game.seed !== 3), { expectedMatchIds: [...games.filter((game) => game.seed !== 3).map((game) => game.matchId), "missing"] });
  expect(() => mergeBatches([missingExpected])).toThrow(/MISSING/);
});
