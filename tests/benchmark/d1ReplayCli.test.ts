import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashPublicEvents } from "./d1ReplayValidation";

const temporaryDirectories: string[] = [];

function createReplayDirectory(matchId: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "d1-replay-cli-"));
  temporaryDirectories.push(directory);
  const replay = {
    schemaVersion: "1",
    replayVersion: "d1-replay-v1",
    benchmarkVersion: "d1-topk-v1",
    engineVersion: "engine-v1",
    roomRulesVersion: "rules-v1",
    configHash: "cfg",
    matchId,
    seed: 201,
    rank: "2",
    rotation: 0,
    allocation: "AB",
    strategiesBySeat: { 0: "a", 1: "b", 2: "a", 3: "b" },
    strategyDescriptors: [],
    deterministicRandom: {
      randomAlgorithmVersion: "random-v1",
      strategySeedDerivationVersion: "strategy-seed-v1",
      baseSeed: 201,
      perSeatDerivedSeed: { 0: "seed-0", 1: "seed-1", 2: "seed-2", 3: "seed-3" },
      strategyVersionsBySeat: { 0: "v1", 1: "v1", 2: "v1", 3: "v1" },
      candidateOrderingVersion: "candidate-v1",
      decisionIndexSemantics: "decision-index-v1",
    },
    publicEvents: [],
    handCountChanges: [],
    trickEvents: [],
    tributeEvents: [],
    finishOrder: [0, 1, 2, 3],
    winnerTeam: 0,
    teamScore: { 0: 1, 1: 0 },
    actionCount: 0,
    publicTraceHash: hashPublicEvents([]),
    finalPublicStateHash: "unused-without-final-state",
  };
  fs.writeFileSync(path.join(directory, `${matchId}.json`), JSON.stringify(replay), "utf8");
  return directory;
}

function runCli(directory: string, ...expectedMatchIds: string[]) {
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const script = path.join(process.cwd(), "scripts", "replayD1TopKBenchmark.ts");
  return spawnSync(process.execPath, [tsxCli, script, directory, ...expectedMatchIds], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("D1 replay CLI", () => {
  it("accepts expected match IDs after the replay directory", () => {
    const result = runCli(createReplayDirectory("m1"), "m1");

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ expected: 1, found: 1, verified: 1 });
  });

  it("returns a non-zero exit code when replay validation fails", () => {
    const result = runCli(createReplayDirectory("m1"), "different-match");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("MISSING_MATCH_ID:different-match");
  });
});
