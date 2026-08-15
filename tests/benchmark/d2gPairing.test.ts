import { describe, expect, it, vi } from "vitest";
import { type RolloutExecutionResult, type RolloutRequest } from "../../src/ai/rollout/contracts";
import * as rolloutOrchestrator from "../../src/ai/rollout/rolloutOrchestrator";
import { createD2GTreatmentProfile } from "../../src/ai/d2g/treatmentContracts";
import { verifyPublicActionEventHash } from "../../src/game/publicEventHash";
import {
  buildD2GCanonicalHeadToHeadTasks,
  createD2GCanonicalHeadToHeadTask,
} from "./d2gCanonicalAdapter";
import { createD2GCandidateReuseTracker, simulateD2GHeadToHeadGame } from "./d2gHeadToHeadSimulator";
import * as aiDecisionEngine from "../../src/ai/aiDecisionEngine";
import { canonicalActionIdentity } from "../../src/ai/rollout/contracts";

function profile() {
  return createD2GTreatmentProfile({
    schemaVersion: "d2g-treatment-profile-v1",
    profileVersion: "d2g-treatment-profile-v1",
    profileId: "d2g-calibration-v1",
    phase: "calibration",
    budget: { particleCount: 1, replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 256, maxWorkUnits: 256 },
    evidenceRequirements: { schemaVersion: "d2f-rollout-evidence-requirements-v1", minimumEffectiveSampleSize: 1, minimumAcceptedScenarioCount: 1, minimumCompletedReplicateCount: 1, requireCompleteCoverage: true },
    riskPolicy: { schemaVersion: "d2f-rollout-risk-policy-v1", variancePenalty: 0, downsideRiskPenalty: 0 },
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: {
      benchmarkVersion: "d2g-task3-pairing-test-v1",
      sourceCommit: "a".repeat(40),
      engineVersion: "engine-v1",
      roomRulesFingerprint: "room-rules-v1",
      candidateOrderingVersion: "candidate-order-v1",
      statisticsSchemaVersion: "statistics-v1",
      reportSchemaVersion: "report-v1",
    },
  });
}

function taskInput(allocation: "AB" | "BA", rotation: 0 | 1 | 2 | 3) {
  return { baseSeed: 77, rank: "10" as const, rotation, allocation, profile: profile(), matchup: "baseline-vs-treatment", configHash: "c".repeat(64) };
}

function successResult(ranking: readonly string[]): RolloutExecutionResult {
  return {
    ok: true,
    result: {
      schemaVersion: "d2f-rollout-result-v2",
      mode: "shadow",
      formalExecutionAllowed: false,
      policyId: "d2f-lightweight-v1",
      rootDigest: "b".repeat(64),
      candidateSummaries: [],
      ranking,
      aggregateDiagnostics: {
        effectiveSampleSize: 1,
        acceptedScenarioCount: 1,
        replicateCountPerScenario: 1,
        completedReplicateCount: ranking.length,
        expectedCompletedReplicateCount: ranking.length,
        candidateCount: ranking.length,
        workUnitCount: 19,
        coverage: "complete",
      },
    },
  } as RolloutExecutionResult;
}

describe("D2G AB/BA pairing", () => {
  it("assigns AB and BA to the canonical Team A/Team B partnerships", () => {
    const ab = createD2GCanonicalHeadToHeadTask(taskInput("AB", 0));
    const ba = createD2GCanonicalHeadToHeadTask(taskInput("BA", 0));

    expect(ab.strategyAssignment).toEqual({ 0: "baseline", 1: "treatment", 2: "baseline", 3: "treatment" });
    expect(ba.strategyAssignment).toEqual({ 0: "treatment", 1: "baseline", 2: "treatment", 3: "baseline" });
    expect(ab.rotationPairKey).toBe(ba.rotationPairKey);
    expect(ab.gameId).not.toBe(ba.gameId);
  });

  it("creates four rotations and both assignment swaps without formal execution", () => {
    const tasks = buildD2GCanonicalHeadToHeadTasks({ baseSeed: 77, rank: "10", profile: profile(), matchup: "baseline-vs-treatment", configHash: "c".repeat(64) });

    expect(tasks).toHaveLength(8);
    expect(new Set(tasks.map((task) => task.rotation)).size).toBe(4);
    expect(tasks.filter((task) => task.allocation === "AB")).toHaveLength(4);
    expect(tasks.filter((task) => task.allocation === "BA")).toHaveLength(4);
    expect(tasks.every((task) => task.room.publicIdentity?.source === "benchmark-scenario")).toBe(true);
    expect(tasks.every((task) => task.room.d2fShadowMode === "disabled")).toBe(true);
  });

  it("gives matched AB and BA games the same initial deal, rank, and public rules", () => {
    const ab = createD2GCanonicalHeadToHeadTask(taskInput("AB", 2));
    const ba = createD2GCanonicalHeadToHeadTask(taskInput("BA", 2));

    expect(ab.room.rank).toBe(ba.room.rank);
    expect(ab.room.hands).toEqual(ba.room.hands);
    expect(ab.room.initialHands).toEqual(ba.room.initialHands);
    expect(ab.initialPublicLedgerHash).not.toBe(ba.initialPublicLedgerHash);
    expect(ab.room.publicIdentity?.gameId).not.toBe(ba.room.publicIdentity?.gameId);
  });

  it("rotates canonical anti-tribute events together with the initial ledger", () => {
    const base = createD2GCanonicalHeadToHeadTask({ ...taskInput("AB", 0), baseSeed: 14, pendingTributeItems: [{ payer: 0, receiver: 2 }] });
    const rotated = createD2GCanonicalHeadToHeadTask({ ...taskInput("AB", 1), baseSeed: 14, pendingTributeItems: [{ payer: 0, receiver: 2 }] });
    const baseEvent = base.room.publicEvents?.[0];
    const rotatedEvent = rotated.room.publicEvents?.[0];

    expect(base.room.openingTribute?.status).toBe("anti-tribute");
    expect(rotated.room.openingTribute?.status).toBe("anti-tribute");
    expect(rotatedEvent?.seat).toBe((baseEvent!.seat + 1) % 4);
    expect(() => verifyPublicActionEventHash(rotatedEvent!)).not.toThrow();
    expect(rotated.room.publicLedger?.seenEventHashes[0]).toBe(rotatedEvent?.publicPayloadHash);
  });

  it("naturally diverges AB and BA after a treatment disagreement without sharing decisions", () => {
    let baselineId = "";
    const original = aiDecisionEngine.decideAiAction;
    const decide = vi.spyOn(aiDecisionEngine, "decideAiAction").mockImplementation((...args) => {
      const decision = original(...args);
      baselineId = canonicalActionIdentity(decision.action);
      return decision;
    });
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      const alternate = typed.candidates.find(({ candidateId }) => candidateId !== baselineId)?.candidateId ?? baselineId;
      return successResult([alternate]);
    });

    const candidateReuseTracker = createD2GCandidateReuseTracker();
    const ab = simulateD2GHeadToHeadGame(createD2GCanonicalHeadToHeadTask(taskInput("AB", 0)), { maxTurns: 4, candidateReuseTracker });
    const ba = simulateD2GHeadToHeadGame(createD2GCanonicalHeadToHeadTask(taskInput("BA", 0)), { maxTurns: 4, candidateReuseTracker });

    expect(ab.decisionTelemetry[2]!.executedCandidateId).toBe(ab.decisionTelemetry[2]!.baselineCandidateId);
    expect(ba.decisionTelemetry[2]!.executedCandidateId).toBe(ba.decisionTelemetry[2]!.treatmentCandidateId);
    expect(ab.decisionTelemetry[2]!.executedCandidateId).not.toBe(ba.decisionTelemetry[2]!.executedCandidateId);
    expect(ab.decisionTelemetry[3]!.preActionGameplayStateHash).not.toBe(ba.decisionTelemetry[3]!.preActionGameplayStateHash);
    expect(ab.crossGameCandidateReuseCount).toBe(0);
    expect(ba.crossGameCandidateReuseCount).toBe(0);
    expect(candidateReuseTracker.crossGameCandidateReuseCount).toBe(0);
    decide.mockRestore();
    runner.mockRestore();
  });

  it("keeps deterministic decision and public hashes stable across repeated matched runs", () => {
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });
    const task = createD2GCanonicalHeadToHeadTask(taskInput("AB", 3));

    const first = simulateD2GHeadToHeadGame(task, { maxTurns: 2 });
    const second = simulateD2GHeadToHeadGame(task, { maxTurns: 2 });

    expect(first.semanticHash).toBe(second.semanticHash);
    expect(first.publicTraceHash).toBe(second.publicTraceHash);
    expect(first.finalPublicLedgerHash).toBe(second.finalPublicLedgerHash);
    expect(first.decisionTelemetry.map(({ productionDecisionCostMs: _p, rolloutEvaluationCostMs: _r, ...record }) => record))
      .toEqual(second.decisionTelemetry.map(({ productionDecisionCostMs: _p, rolloutEvaluationCostMs: _r, ...record }) => record));
    runner.mockRestore();
  });

  it("reports a treatment-perspective winning partnership without statistics or verdict logic", () => {
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });
    const result = simulateD2GHeadToHeadGame(createD2GCanonicalHeadToHeadTask(taskInput("BA", 0)), { maxTurns: 1 });

    expect(["baseline", "treatment", null]).toContain(result.winningPartnership);
    expect(result).not.toHaveProperty("confidenceInterval");
    expect(result).not.toHaveProperty("bootstrap");
    expect(result).not.toHaveProperty("verdict");
    runner.mockRestore();
  });

  it("emits only public replay inputs and no private room/runtime state", () => {
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });
    const result = simulateD2GHeadToHeadGame(createD2GCanonicalHeadToHeadTask(taskInput("AB", 0)), { maxTurns: 1 });

    expect(result).toHaveProperty("publicEvents");
    expect(result).not.toHaveProperty("hands");
    expect(result).not.toHaveProperty("initialHands");
    expect(result).not.toHaveProperty("aiRuntime");
    expect(result).not.toHaveProperty("aiPlans");
    expect(result.publicEvents.every((event) => !Object.prototype.hasOwnProperty.call(event, "privateState"))).toBe(true);
    runner.mockRestore();
  });
});
