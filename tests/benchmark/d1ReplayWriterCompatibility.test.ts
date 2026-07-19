import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayD1Match } from "../../scripts/replayD1TopKBenchmark";
import { D1_REPLAY_SCHEMA } from "./d1ProvenanceV2";
import { validateD1Replay, writeD1Replay } from "./d1ReplayValidation";
import { expectedMatchId } from "./d1Matrix";
import { ENGINE_VERSION, ROOM_RULES_VERSION } from "./reporting";
import { buildGamesForSeed, type BenchmarkGameTask } from "./rotations";
import { simulateGame, type PublicSimulationEvent, type SimulationSummary } from "./simulator";
import { strategyDescriptorsForExecution } from "./strategies";

const d1Config = {
  benchmarkVersion: "d1-topk-v1" as const,
  rank: "2" as const,
  seeds: [1],
  strategyA: "legal-greedy",
  strategyB: "legal-greedy",
  replayMode: "all" as const,
};

type WriterCase = Readonly<{
  task: BenchmarkGameTask;
  summary: SimulationSummary;
  outputRoot: string;
  outputPath: string;
  document: Record<string, unknown>;
}>;

type SimulationCase = Readonly<{
  task: BenchmarkGameTask;
  summary: SimulationSummary;
  versions: {
    benchmarkVersion: string;
    replayVersion: string;
    engineVersion: string;
    roomRulesVersion: string;
    strategyDescriptors: ReturnType<typeof strategyDescriptorsForExecution>;
  };
}>;

function createSimulationCase(): SimulationCase {
  const task = buildGamesForSeed(d1Config, d1Config.seeds[0]!).find(
    (candidate) => candidate.rotation === 0 && candidate.allocation === "AB",
  );
  if (task === undefined) throw new Error("D1_TASK_NOT_FOUND");

  const taskWithCanonicalMatchId = {
    ...task,
    matchId: expectedMatchId({
      matchup: d1Config.strategyA + "-vs-" + d1Config.strategyB,
      seed: task.seed,
      allocation: task.allocation,
      rotation: task.rotation,
      configHash: task.configHash,
    }),
  };
  const summary = simulateGame(taskWithCanonicalMatchId);
  const versions = {
    benchmarkVersion: d1Config.benchmarkVersion,
    replayVersion: D1_REPLAY_SCHEMA,
    engineVersion: ENGINE_VERSION,
    roomRulesVersion: ROOM_RULES_VERSION,
    strategyDescriptors: strategyDescriptorsForExecution("task1-test-source"),
  };
  return { task: taskWithCanonicalMatchId, summary, versions };
}

function createWriterCase(outputRoot: string): WriterCase {
  const { task, summary, versions } = createSimulationCase();
  const outputPath = writeD1Replay(summary, outputRoot, {
    ...versions,
  });
  const document = JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, unknown>;
  return { task, summary, outputRoot, outputPath, document };
}

function withWriterCase(run: (value: WriterCase) => void): void {
  const outputRoot = mkdtempSync(path.join(os.tmpdir(), "d1-replay-writer-"));
  try {
    run(createWriterCase(outputRoot));
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectedHandCountChanges(publicEvents: PublicSimulationEvent[]): Array<NonNullable<PublicSimulationEvent["handCountChanges"]>> {
  return publicEvents
    .map((event) => event.handCountChanges)
    .filter(
      (value): value is NonNullable<PublicSimulationEvent["handCountChanges"]> =>
        value !== undefined,
    );
}

function expectedTrickEvents(publicEvents: PublicSimulationEvent[]): Array<NonNullable<PublicSimulationEvent["trick"]>> {
  return publicEvents
    .map((event) => event.trick)
    .filter(
      (value): value is NonNullable<PublicSimulationEvent["trick"]> =>
        value !== undefined,
    );
}

describe("D1 replay writer compatibility", () => {
  it("characterizes the fixed-seed writer envelope and D1 extension output", () => {
    withWriterCase(({ task, summary, outputRoot, outputPath, document }) => {
      expect(document.benchmarkVersion).toBe(d1Config.benchmarkVersion);
      expect(document.engineVersion).toBe(ENGINE_VERSION);
      expect(document.roomRulesVersion).toBe(ROOM_RULES_VERSION);
      expect(document.configHash).toBe(summary.configHash);
      expect(document.matchId).toBe(summary.matchId);
      expect(document.seed).toBe(summary.seed);
      expect(document.rotation).toBe(summary.rotation);
      expect(document.schemaVersion).toBe("1");
      expect(document.replayVersion).toBe(D1_REPLAY_SCHEMA);
      expect(document.rank).toBe(task.config.rank);
      expect(document.allocation).toBe(task.allocation);
      expect(document.handCountChanges).toEqual(jsonClone(expectedHandCountChanges(summary.publicEvents)));
      expect(document.trickEvents).toEqual(jsonClone(expectedTrickEvents(summary.publicEvents)));
      expect(document.tributeEvents).toEqual(jsonClone(summary.publicEvents.flatMap((event) => event.tributeEvents ?? [])));
      expect(document.publicEvents).toEqual(jsonClone(summary.publicEvents));
      expect(document.strategiesBySeat).toEqual(jsonClone(summary.strategiesBySeat));
      expect(document.strategyDescriptors).toEqual(jsonClone(strategyDescriptorsForExecution("task1-test-source")));
      expect(document.deterministicRandom).toEqual(summary.randomProvenance);
      expect(document.finishOrder).toEqual(jsonClone(summary.finishOrder));
      expect(document.winnerTeam).toBe(summary.winnerTeam);
      expect(document.teamScore).toEqual(summary.teamScore);
      expect(document.actionCount).toBe(summary.actionCount);
      expect(document.publicTraceHash).toBe(summary.publicTraceHash);
      expect(document.finalPublicStateHash).toBe(summary.finalPublicStateHash);
      expect(document.replayMode).toBeUndefined();
      expect(document.durationMs).toBeUndefined();
      expect(document.finalPublicState).toEqual(jsonClone(summary.finalPublicState));
      expect(path.dirname(outputPath)).toBe(outputRoot);
      const expectedFileName = summary.matchId.replace(/[\\/:*?"<>|]/g, "_") + ".json";
      expect(path.basename(outputPath)).toBe(expectedFileName);
    });
  });

  it("passes the generated document through the existing D1 validator and consumer", () => {
    withWriterCase(({ summary, document }) => {
      expect(validateD1Replay(document)).toBe(true);
      expect(replayD1Match(document)).toEqual({
        verified: true,
        matchId: summary.matchId,
      });
    });
  });

  it("round-trips an unresolved winner team through the real D1 writer", () => {
    const { summary, versions } = createSimulationCase();
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), "d1-replay-writer-"));
    try {
      const summaryWithUnresolvedWinner: SimulationSummary = { ...summary, winnerTeam: null };
      const outputPath = writeD1Replay(summaryWithUnresolvedWinner, outputRoot, versions);
      const document = JSON.parse(readFileSync(outputPath, "utf8")) as Record<string, unknown>;

      expect(document.winnerTeam).toBeNull();
      expect(validateD1Replay(document)).toBe(true);
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("fails closed for the old envelope without rewriting input or files", () => {
    withWriterCase(({ outputRoot, outputPath, document, task }) => {
      const legacyEnvelope: Record<string, unknown> = {
        ...jsonClone(document),
        schemaVersion: "d1-replay-v1",
        rank: task.config.rank,
      };
      const inputBefore = jsonClone(legacyEnvelope);
      const outputBytesBefore = readFileSync(outputPath);
      const filesBefore = readdirSync(outputRoot).sort();

      expect(() => validateD1Replay(legacyEnvelope)).toThrow("D1_REPLAY_SCHEMA_MISMATCH");
      expect(legacyEnvelope).toEqual(inputBefore);
      expect(readFileSync(outputPath)).toEqual(outputBytesBefore);
      expect(readdirSync(outputRoot).sort()).toEqual(filesBefore);
    });
  });

  it("fails closed for missing rank without rewriting input or files", () => {
    withWriterCase(({ outputRoot, outputPath, document }) => {
      const missingRank: Record<string, unknown> = {
        ...jsonClone(document),
        schemaVersion: "1",
      };
      delete missingRank.rank;
      const inputBefore = jsonClone(missingRank);
      const outputBytesBefore = readFileSync(outputPath);
      const filesBefore = readdirSync(outputRoot).sort();

      expect(() => validateD1Replay(missingRank)).toThrow("PROVENANCE_MISSING:rank");
      expect(missingRank).toEqual(inputBefore);
      expect(readFileSync(outputPath)).toEqual(outputBytesBefore);
      expect(readdirSync(outputRoot).sort()).toEqual(filesBefore);
    });
  });

  it("fails closed when allocation is missing before creating files", () => {
    const { summary, versions } = createSimulationCase();
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), "d1-replay-writer-"));
    try {
      const summaryWithoutAllocation = jsonClone(summary);
      delete summaryWithoutAllocation.allocation;
      const inputBefore = jsonClone(summaryWithoutAllocation);

      expect(() => writeD1Replay(summaryWithoutAllocation, outputRoot, versions)).toThrow(
        "D1_REPLAY_PROVENANCE_MISSING",
      );
      expect(readdirSync(outputRoot)).toEqual([]);
      expect(summaryWithoutAllocation).toEqual(inputBefore);
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when random provenance is missing before creating files", () => {
    const { summary, versions } = createSimulationCase();
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), "d1-replay-writer-"));
    try {
      const summaryWithoutRandomProvenance = jsonClone(summary);
      delete summaryWithoutRandomProvenance.randomProvenance;
      const inputBefore = jsonClone(summaryWithoutRandomProvenance);

      expect(() => writeD1Replay(summaryWithoutRandomProvenance, outputRoot, versions)).toThrow(
        "D1_REPLAY_PROVENANCE_MISSING",
      );
      expect(readdirSync(outputRoot)).toEqual([]);
      expect(summaryWithoutRandomProvenance).toEqual(inputBefore);
    } finally {
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
