import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createLegacyBenchmarkRoom } from "../../src/game/room";
import { replayMatch } from "../../scripts/replayAiBenchmark";
import type { ReplayDocument } from "./contracts";
import { D1_REPLAY_SCHEMA, D1_RESULT_SCHEMA, buildD1ExecutionProvenance } from "./d1ProvenanceV2";
import { buildGamesForSeed } from "./rotations";
import { ENGINE_VERSION, ROOM_RULES_VERSION } from "./reporting";
import { getStrategy } from "./strategies";
import { simulateGame } from "./simulator";
import { createD0FixtureSourceWorktree, type D0FixtureSourceWorktree } from "./d0FixtureSourceWorktree";

const root = process.cwd();
const d0FixturePath = path.resolve(root, "tests/ai/fixtures/d0KeepCurrentCases.json");
const d0GeneratorPath = path.resolve(root, "scripts/generateD0KeepCurrentFixtures.ts");
const d0SourceCommit = "e2a20e18f8e5c0871db38ad69426262e43766ce1";
const tsxCli = path.resolve(root, "node_modules/tsx/dist/cli.mjs");
let d0Source: D0FixtureSourceWorktree | undefined;

beforeAll(() => {
  d0Source = createD0FixtureSourceWorktree(d0SourceCommit);
});

afterAll(() => {
  d0Source?.remove();
});

const d1Config = {
  benchmarkVersion: "d1-topk-v1" as const,
  rank: "2" as const,
  seeds: [1],
  strategyA: "legal-greedy",
  strategyB: "legal-greedy",
  replayMode: "all" as const,
};

function buildD1Task() {
  const task = buildGamesForSeed(d1Config, 1).find((candidate) => candidate.rotation === 0 && candidate.allocation === "AB");
  if (task === undefined) throw new Error("D1_TASK_NOT_FOUND");
  return task;
}

function descriptorFor(strategyId: string) {
  const strategy = getStrategy(strategyId);
  return {
    id: strategy.id,
    implementationVersion: strategy.implementationVersion,
    configHash: strategy.configHash,
    sourceCommit: strategy.sourceCommit,
    candidatePolicy: strategy.candidatePolicy,
    ...(strategy.mode === undefined ? {} : { mode: strategy.mode }),
  };
}

function createValidReplayDocument(summary: ReturnType<typeof simulateGame>): ReplayDocument {
  if (summary.randomProvenance === undefined) throw new Error("REPLAY_RANDOM_PROVENANCE_MISSING");
  const document = {
    schemaVersion: "1",
    replayVersion: D1_REPLAY_SCHEMA,
    benchmarkVersion: d1Config.benchmarkVersion,
    engineVersion: ENGINE_VERSION,
    roomRulesVersion: ROOM_RULES_VERSION,
    configHash: summary.configHash,
    matchId: summary.matchId,
    seed: summary.seed,
    rank: summary.rank,
    rotation: summary.rotation,
    strategiesBySeat: summary.strategiesBySeat,
    strategyDescriptors: [descriptorFor("legal-greedy")],
    deterministicRandom: summary.randomProvenance,
    publicEvents: summary.publicEvents,
    finishOrder: summary.finishOrder,
    winnerTeam: summary.winnerTeam,
    teamScore: summary.teamScore,
    replayMode: "all",
    actionCount: summary.actionCount,
    publicTraceHash: summary.publicTraceHash,
    finalPublicStateHash: summary.finalPublicStateHash,
    durationMs: summary.durationMs,
  } satisfies ReplayDocument;
  return document;
}

describe("legacy D1 compatibility boundaries", () => {
  it("keeps explicit legacy rooms outside canonical public state", () => {
    const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });

    expect(room.hands[0]).toHaveLength(27);
    expect(room.status).toBe("playing");
    expect(room.publicIdentity).toBeUndefined();
    expect(room.publicLedger).toBeUndefined();
    expect(room.publicEvents).toBeUndefined();
    expect(JSON.stringify(room)).not.toContain("PublicGameIdentity");

    const roomSource = readFileSync(path.resolve(root, "src/game/room.ts"), "utf8");
    expect(roomSource).not.toContain("PublicIdentityStore");
    expect(roomSource).not.toContain("createPublicIdentityProvider");
  });

  it("replays a valid D1 document through the document-authoritative path", () => {
    const task = buildD1Task();
    const summary = simulateGame(task);
    const replayRoot = mkdtempSync(path.join(os.tmpdir(), "d1-legacy-replay-"));

    try {
      const document = createValidReplayDocument(summary);
      const replayPath = path.join(replayRoot, `${summary.matchId.replace(/[\\/:*?"<>|]/g, "_")}.json`);
      writeFileSync(replayPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

      expect(document.schemaVersion).toBe("1");
      expect(document.matchId).toBe(summary.matchId);
      expect(document.seed).toBe(summary.seed);
      expect(document.rank).toBe(summary.rank);
      expect(document.publicTraceHash).toBe(summary.publicTraceHash);
      expect(document.finalPublicStateHash).toBe(summary.finalPublicStateHash);

      const result = replayMatch(summary.matchId, replayRoot);
      expect(result).toEqual({
        matchId: summary.matchId,
        publicTraceHash: summary.publicTraceHash,
        finalPublicStateHash: summary.finalPublicStateHash,
        verified: true,
      });

      const replaySource = readFileSync(path.resolve(root, "scripts/replayAiBenchmark.ts"), "utf8");
      expect(replaySource).not.toContain("PublicIdentityStore");
      expect(replaySource).not.toContain("createPublicIdentityProvider");
      expect(replaySource).not.toContain("better-sqlite3");
      expect(JSON.stringify(document)).not.toContain("PublicGameIdentity");
    } finally {
      rmSync(replayRoot, { recursive: true, force: true });
    }
  });

  it("keeps the committed D0 fixture byte-identical under check-only generation", () => {
    expect(d0Source).toBeDefined();
    expect(existsSync(d0Source!.root)).toBe(true);
    expect(existsSync(d0FixturePath)).toBe(true);

    const before = readFileSync(d0FixturePath);
    execFileSync(process.execPath, [
      tsxCli,
      d0GeneratorPath,
      "--source-worktree",
      d0Source!.root,
      "--source-commit",
      d0SourceCommit,
      "--output",
      d0FixturePath,
      "--generator-version",
      "d0-fixture-v1",
      "--check-only",
    ], { cwd: root, stdio: "pipe" });
    const after = readFileSync(d0FixturePath);

    expect(after).toEqual(before);
  });

  it("preserves D1 result schema, version constants, and fixed-seed hashes", () => {
    const task = buildD1Task();
    const descriptor = descriptorFor("legal-greedy");
    const executionProvenance = buildD1ExecutionProvenance({
      executionSourceCommit: d0SourceCommit,
      configHash: task.configHash,
      phase: "smoke",
      seedStart: task.seed,
      seedEnd: task.seed,
      strategyDescriptors: [descriptor],
      engineVersion: ENGINE_VERSION,
      roomRulesVersion: ROOM_RULES_VERSION,
    });
    const summary = simulateGame({ ...task, executionProvenance });

    expect(summary.rawResultSchemaVersion).toBe(D1_RESULT_SCHEMA);
    expect(executionProvenance.replaySchemaVersion).toBe(D1_REPLAY_SCHEMA);
    expect(executionProvenance.engineVersion).toBe(ENGINE_VERSION);
    expect(executionProvenance.roomRulesVersion).toBe(ROOM_RULES_VERSION);
    expect(summary.publicTraceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(summary.finalPublicStateHash).toMatch(/^[a-f0-9]{64}$/);
    const repeat = simulateGame({ ...task, executionProvenance });
    expect(summary.publicTraceHash).toBe(repeat.publicTraceHash);
    expect(summary.finalPublicStateHash).toBe(repeat.finalPublicStateHash);
  });
});
