import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
import { sha256Bytes } from "../../src/game/publicEventHash";
import { buildD2GPublicReplay } from "./d2gReportModel";
import { computeD2GSemanticHash } from "./d2gStatistics";
import type { D2GHeadToHeadGameResult } from "./d2gHeadToHeadSimulator";
import { canonicalJson } from "./contracts";
import {
  D2G_FORMAL_NOT_FROZEN,
  D2G_SEED_INVENTORY,
  buildD2GRunPlan,
  computeD2GRunnerDeterministicIdentity,
  createD2GRunnerConfig,
  getD2GCheckpointPath,
  isD2GSeedInRange,
  runD2GTreatmentBenchmark,
  publishD2GArtifacts,
  summarizeD2GReport,
  validateD2GResumeContract,
} from "../../scripts/runD2GTreatmentBenchmark";

const EMPTY_PUBLIC_TRACE_HASH = sha256Bytes(new TextEncoder().encode(canonicalJson({ schemaVersion: "d2g-public-trace-v1", publicEvents: [] })));

function makeCheckpointSafeGame(task: ReturnType<typeof buildD2GRunPlan>["tasks"][number]): D2GHeadToHeadGameResult {
  const initialLedger = task.room.initialPublicLedger!;
  const game = {
    schemaVersion: "d2g-head-to-head-game-v1" as const,
    gameId: task.gameId,
    rotationPairKey: task.rotationPairKey,
    baseSeed: task.baseSeed,
    rank: task.rank,
    rotation: task.rotation,
    allocation: task.allocation,
    matchup: task.matchup,
    configHash: task.configHash,
    profileHash: task.profileHash,
    baselineTeam: task.baselineTeam,
    treatmentTeam: task.treatmentTeam,
    strategyAssignment: task.strategyAssignment,
    initialPublicReplayState: {
      identity: task.publicIdentity,
      initialHandCounts: { ...initialLedger.handCounts },
      openingLeader: initialLedger.currentTrick.leadSeat,
      initialTrickIndex: initialLedger.currentTrick.trickIndex,
      openingTributePublicState: { status: task.room.openingTribute?.status ?? "none" },
    },
    initialPublicLedgerHash: task.initialPublicLedgerHash,
    finalPublicLedgerHash: canonicalPublicLedgerHash(initialLedger),
    publicTraceHash: EMPTY_PUBLIC_TRACE_HASH,
    semanticHash: "",
    publicEvents: [],
    finishOrder: [0, 2, 1, 3] as [0, 2, 1, 3],
    winnerTeam: 0 as const,
    winningPartnership: task.treatmentTeam === "A" ? "treatment" as const : "baseline" as const,
    completed: true,
    cardConservation: true,
    termination: "finished" as const,
    decisionCount: 0,
    actionExecutionCount: 0,
    playCount: 0,
    passCount: 0,
    tributeTransitionCount: 0,
    returnTransitionCount: 0,
    runtimePlanMismatchCount: 0,
    crossGameCandidateReuseCount: 0,
    decisionTelemetry: [],
    fallbackCounts: {},
    errorCounters: { total: 0, decisionErrors: 0, treatmentErrors: 0, executionErrors: 0, transitionErrors: 0, guardErrors: 0 },
    errors: [],
    elapsedMs: 1,
  } satisfies Omit<D2GHeadToHeadGameResult, "semanticHash"> & { semanticHash: string };
  return { ...game, semanticHash: computeD2GSemanticHash(game) };
}

describe("D2G Task 5A runner", () => {
  it("fails closed when formal mode is requested", () => {
    expect(() => createD2GRunnerConfig("formal")).toThrow(D2G_FORMAL_NOT_FROZEN);
  });

  it("keeps smoke and calibration-ready as distinct phase identities", () => {
    const smoke = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
    const calibration = createD2GRunnerConfig("calibration-ready", { sourceCommit: "a".repeat(40) });

    expect(smoke.profile.phase).toBe("smoke");
    expect(calibration.profile.phase).toBe("calibration");
    expect(smoke.profile.profileId).not.toBe(calibration.profile.profileId);
    expect(smoke.configHash).not.toBe(calibration.configHash);
  });

  it("declares disjoint smoke, calibration, and reserved formal seed sets", () => {
    const sets = [
      D2G_SEED_INVENTORY.smoke,
      D2G_SEED_INVENTORY.calibrationReserved,
      D2G_SEED_INVENTORY.formalReserved,
    ];
    expect(new Set(sets.flat()).size).toBe(sets.flat().length);
  });

  it.each([1, 200, 221, 9201])("rejects smoke seed %s outside the D2G smoke allowlist", (seed) => {
    expect(() => createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40), baseSeeds: [seed] })).toThrow("D2G_SEED_NOT_ALLOWED");
  });

  it("accepts only the explicit D2G smoke seed", () => {
    expect(createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40), baseSeeds: [9001] }).baseSeeds).toEqual([9001]);
  });

  it("enforces the calibration-reserved phase allowlist", () => {
    expect(createD2GRunnerConfig("calibration-ready", { sourceCommit: "a".repeat(40), baseSeeds: [9101] }).baseSeeds).toEqual([9101]);
    expect(() => createD2GRunnerConfig("calibration-ready", { sourceCommit: "a".repeat(40), baseSeeds: [9201] })).toThrow("D2G_SEED_NOT_ALLOWED");
    expect(() => createD2GRunnerConfig("calibration-ready", { sourceCommit: "a".repeat(40), baseSeeds: [9001] })).toThrow("D2G_SEED_NOT_ALLOWED");
  });

  it("treats the historical D0 formal range as inclusive", () => {
    const range = D2G_SEED_INVENTORY.priorRanges.d0Formal;
    expect([1, 100, 200].every((seed) => isD2GSeedInRange(seed, range))).toBe(true);
    expect(isD2GSeedInRange(0, range)).toBe(false);
    expect(isD2GSeedInRange(201, range)).toBe(false);
  });

  it("namespaces durable checkpoints by the exact configuration", () => {
    const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
    const task = buildD2GRunPlan(config).tasks[0]!;
    expect(getD2GCheckpointPath("C:/tmp/d2g", config, task)).toContain(config.configHash);
    expect(getD2GCheckpointPath("C:/tmp/d2g", config, task)).toContain(".json");
  });

  it("builds exactly eight canonical games for one base seed", () => {
    const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
    const plan = buildD2GRunPlan({ ...config, baseSeeds: [D2G_SEED_INVENTORY.smoke[0]!] });

    expect(plan.tasks).toHaveLength(8);
    expect(plan.tasks.map((task) => task.rotation)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(plan.tasks.map((task) => task.allocation)).toEqual(["AB", "BA", "AB", "BA", "AB", "BA", "AB", "BA"]);
  });

  it("excludes wall-clock telemetry from deterministic runner identity", () => {
    const base = {
      phase: "smoke" as const,
      configHash: "b".repeat(64),
      games: [{ gameId: "g1", semanticHash: "c".repeat(64), publicTraceHash: "d".repeat(64), finalPublicLedgerHash: "e".repeat(64), elapsedMs: 1 }],
    };
    const first = computeD2GRunnerDeterministicIdentity(base);
    const second = computeD2GRunnerDeterministicIdentity({ ...base, games: [{ ...base.games[0]!, elapsedMs: 99999 }] });

    expect(first).toBe(second);
  });

  it("rejects a public replay mismatch during resume", () => {
    expect(() => validateD2GResumeContract({
      previousManifest: { configHash: "a".repeat(64), profileConfigurationHash: "b".repeat(64), provenanceHash: "c".repeat(64) } as never,
      nextManifest: { configHash: "a".repeat(64), profileConfigurationHash: "b".repeat(64), provenanceHash: "c".repeat(64) } as never,
      game: { gameId: "game" } as never,
      replay: { gameId: "game", finalPublicLedgerHash: "f".repeat(64) } as never,
    })).toThrow("D2G_RESUME_PUBLIC_REPLAY_MISMATCH");
  });

  it("publishes report and manifest through the atomic writer boundary", async () => {
    const calls: string[] = [];
    await publishD2GArtifacts({
      writer: {
        writeBatch: async (reportPath: string, _report: string, manifestPath: string, _manifest: string) => {
          calls.push(reportPath, manifestPath);
        },
      } as never,
      reportPath: "report.json",
      reportJson: "{}",
      manifestPath: "manifest.json",
      manifestJson: "{}",
    });

    expect(calls).toEqual(["report.json", "manifest.json"]);
  });

  it("keeps incomplete games unresolved without neutralizing quality metrics", () => {
    const summary = summarizeD2GReport({
      statistics: {
        unresolvedGameCount: 1,
        unresolvedByReason: { missing: 0, failed: 0, incomplete: 1, "correctness-unclean": 0 },
        treatmentWins: 0,
        treatmentLosses: 0,
        treatmentWinRate: null,
        meanScoreDelta: null,
        meanLevelStepDelta: null,
        meanFinishUtilityDelta: null,
        treatmentControlledDecisionCount: 0,
        executedTreatmentSelectionCount: 0,
        executedTreatmentFallbackCount: 0,
        executedTreatmentFallbackRate: null,
        fallbackCounts: {},
        latency: { productionDecisionCostMs: { count: 0, p50: 0, p95: 0, p99: 0 }, actualTreatmentRolloutCostMs: { count: 0, p50: 0, p95: 0, p99: 0 }, counterfactualRolloutCostMs: { count: 0, p50: 0, p95: 0, p99: 0 } },
        workUnits: { totalRolloutWorkUnits: 0 },
      } as never,
    } as never);

    expect(summary.unresolvedGames).toBe(1);
    expect(summary.meanScoreDelta).toBeNull();
    expect(summary).not.toHaveProperty("neutralResult");
  });

  it("writes checkpoints on the first run and skips valid games on resume", async () => {
    const checkpointDir = await mkdtemp(join(tmpdir(), "d2g-checkpoint-first-"));
    try {
      const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
      let executions = 0;
      const first = await runD2GTreatmentBenchmark({
        config,
        checkpointDir,
        executeGame: (task) => { executions += 1; return makeCheckpointSafeGame(task); },
      });
      expect(executions).toBe(8);
      expect(await readdir(join(checkpointDir, config.configHash))).toHaveLength(8);

      executions = 0;
      const resumed = await runD2GTreatmentBenchmark({
        config,
        checkpointDir,
        executeGame: () => { executions += 1; throw new Error("CHECKPOINT_SHOULD_SKIP"); },
      });
      expect(executions).toBe(0);
      expect(resumed.deterministicIdentity).toBe(first.deterministicIdentity);
    } finally {
      await rm(checkpointDir, { recursive: true, force: true });
    }
  });

  it("executes only missing games in a mixed checkpoint block", async () => {
    const checkpointDir = await mkdtemp(join(tmpdir(), "d2g-checkpoint-mixed-"));
    try {
      const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
      const plan = buildD2GRunPlan(config);
      await runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: (task) => makeCheckpointSafeGame(task) });
      for (const task of plan.tasks.slice(0, 5)) await rm(getD2GCheckpointPath(checkpointDir, config, task), { force: true });

      let executions = 0;
      const result = await runD2GTreatmentBenchmark({
        config,
        checkpointDir,
        executeGame: (task) => { executions += 1; return makeCheckpointSafeGame(task); },
      });
      expect(executions).toBe(5);
      expect(result.manifest.complete).toBe(true);
    } finally {
      await rm(checkpointDir, { recursive: true, force: true });
    }
  });

  it("fails closed on a corrupted checkpoint instead of recomputing it", async () => {
    const checkpointDir = await mkdtemp(join(tmpdir(), "d2g-checkpoint-corrupt-"));
    try {
      const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
      const task = buildD2GRunPlan(config).tasks[0]!;
      await runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: (entry) => makeCheckpointSafeGame(entry) });
      await writeFile(getD2GCheckpointPath(checkpointDir, config, task), "{\"partial\":", "utf8");
      await expect(runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: () => { throw new Error("MUST_NOT_EXECUTE"); } })).rejects.toThrow("D2G_CHECKPOINT_INVALID");
    } finally {
      await rm(checkpointDir, { recursive: true, force: true });
    }
  });

  it("rejects a checkpoint with mismatched provenance or replay", async () => {
    const checkpointDir = await mkdtemp(join(tmpdir(), "d2g-checkpoint-identity-"));
    try {
      const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
      const task = buildD2GRunPlan(config).tasks[0]!;
      await runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: (entry) => makeCheckpointSafeGame(entry) });
      const path = getD2GCheckpointPath(checkpointDir, config, task);
      const checkpoint = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
      await writeFile(path, JSON.stringify({ ...checkpoint, sourceCommit: "b".repeat(40) }), "utf8");
      await expect(runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: () => { throw new Error("MUST_NOT_EXECUTE"); } })).rejects.toThrow("D2G_CHECKPOINT_IDENTITY_MISMATCH");
    } finally {
      await rm(checkpointDir, { recursive: true, force: true });
    }
  });

  it("rejects an incomplete checkpoint instead of resuming it", async () => {
    const checkpointDir = await mkdtemp(join(tmpdir(), "d2g-checkpoint-incomplete-"));
    try {
      const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
      const task = buildD2GRunPlan(config).tasks[0]!;
      await runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: (entry) => makeCheckpointSafeGame(entry) });
      const path = getD2GCheckpointPath(checkpointDir, config, task);
      const checkpoint = JSON.parse(await readFile(path, "utf8")) as { game: Record<string, unknown> };
      await writeFile(path, JSON.stringify({ ...checkpoint, game: { ...checkpoint.game, completed: false, termination: "turn-limit" } }), "utf8");
      await expect(runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: () => { throw new Error("MUST_NOT_EXECUTE"); } })).rejects.toThrow("D2G_CHECKPOINT_NOT_RESUMABLE");
    } finally {
      await rm(checkpointDir, { recursive: true, force: true });
    }
  });

  it("rejects a correctness-unclean checkpoint instead of resuming it", async () => {
    const checkpointDir = await mkdtemp(join(tmpdir(), "d2g-checkpoint-unclean-"));
    try {
      const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });
      const task = buildD2GRunPlan(config).tasks[0]!;
      await runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: (entry) => makeCheckpointSafeGame(entry) });
      const path = getD2GCheckpointPath(checkpointDir, config, task);
      const checkpoint = JSON.parse(await readFile(path, "utf8")) as { game: Record<string, unknown> };
      await writeFile(path, JSON.stringify({
        ...checkpoint,
        game: {
          ...checkpoint.game,
          errorCounters: { total: 1, decisionErrors: 0, treatmentErrors: 1, executionErrors: 0, transitionErrors: 0, guardErrors: 0 },
        },
      }), "utf8");
      await expect(runD2GTreatmentBenchmark({ config, checkpointDir, executeGame: () => { throw new Error("MUST_NOT_EXECUTE"); } })).rejects.toThrow("D2G_CHECKPOINT_NOT_RESUMABLE");
    } finally {
      await rm(checkpointDir, { recursive: true, force: true });
    }
  });
});
