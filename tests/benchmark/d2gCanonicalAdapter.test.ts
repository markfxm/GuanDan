import { describe, expect, it, vi } from "vitest";
import { canonicalActionIdentity, type RolloutExecutionResult, type RolloutRequest } from "../../src/ai/rollout/contracts";
import * as rolloutOrchestrator from "../../src/ai/rollout/rolloutOrchestrator";
import { createD2GTreatmentProfile, type D2GTreatmentProfile } from "../../src/ai/d2g/treatmentContracts";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import * as aiDecisionEngine from "../../src/ai/aiDecisionEngine";
import * as roomModule from "../../src/game/room";
import { rebuildPublicLedger } from "../../src/game/publicEventReplay";
import { createBenchmarkObservation, toProductionObservation } from "./observation";
import {
  createD2GCanonicalHeadToHeadTask,
  type D2GCanonicalHeadToHeadTaskInput,
} from "./d2gCanonicalAdapter";
import { simulateD2GHeadToHeadGame } from "./d2gHeadToHeadSimulator";

function makeProfile(): D2GTreatmentProfile {
  return createD2GTreatmentProfile({
    schemaVersion: "d2g-treatment-profile-v1",
    profileVersion: "d2g-treatment-profile-v1",
    profileId: "d2g-calibration-v1",
    phase: "calibration",
    budget: {
      particleCount: 1,
      replicateCountPerScenario: 1,
      maxPliesPerReplicate: 1,
      maxPolicyActionEvaluationsPerPly: 256,
      maxWorkUnits: 256,
    },
    evidenceRequirements: {
      schemaVersion: "d2f-rollout-evidence-requirements-v1",
      minimumEffectiveSampleSize: 1,
      minimumAcceptedScenarioCount: 1,
      minimumCompletedReplicateCount: 1,
      requireCompleteCoverage: true,
    },
    riskPolicy: {
      schemaVersion: "d2f-rollout-risk-policy-v1",
      variancePenalty: 0,
      downsideRiskPenalty: 0,
    },
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: {
      benchmarkVersion: "d2g-task3-test-v1",
      sourceCommit: "a".repeat(40),
      engineVersion: "engine-v1",
      roomRulesFingerprint: "room-rules-v1",
      candidateOrderingVersion: "candidate-order-v1",
      statisticsSchemaVersion: "statistics-v1",
      reportSchemaVersion: "report-v1",
    },
  });
}

function makeTask(overrides: Partial<D2GCanonicalHeadToHeadTaskInput> = {}) {
  return createD2GCanonicalHeadToHeadTask({
    baseSeed: 1,
    rank: "10",
    rotation: 0,
    allocation: "AB",
    profile: makeProfile(),
    matchup: "baseline-vs-treatment",
    configHash: "c".repeat(64),
    ...overrides,
  });
}

function successResult(ranking: readonly string[], workUnitCount = 17): RolloutExecutionResult {
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
        workUnitCount,
        coverage: "complete",
      },
    },
  } as RolloutExecutionResult;
}

function chooseDifferentCandidate(request: RolloutRequest, baselineId: string): string {
  return request.candidates.find(({ candidateId }) => candidateId !== baselineId)?.candidateId ?? baselineId;
}

describe("D2G canonical head-to-head adapter", () => {
  it("creates a canonical Room with benchmark identity and no legacy Room authority", () => {
    const task = makeTask();

    expect(task.room.publicIdentity?.source).toBe("benchmark-scenario");
    expect(task.room.publicLedger).toBeDefined();
    expect(task.room.initialPublicLedger).toBeDefined();
    expect(task.strategyAssignment).toEqual({ 0: "baseline", 1: "treatment", 2: "baseline", 3: "treatment" });
    expect(task.baselineTeam).toBe("A");
    expect(task.treatmentTeam).toBe("B");
  });

  it("calls production decideAiAction once and executes exactly one canonical action", () => {
    const task = makeTask();
    const decide = vi.spyOn(aiDecisionEngine, "decideAiAction");
    const play = vi.spyOn(roomModule, "playCards");
    const pass = vi.spyOn(roomModule, "passTurn");
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 1 });

    expect(result.decisionCount).toBe(1);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(result.actionExecutionCount).toBe(1);
    expect(play.mock.calls.length + pass.mock.calls.length).toBe(1);
    expect(result.decisionTelemetry).toHaveLength(1);
    expect(result.decisionTelemetry[0]!.candidateUniverseHash).toMatch(/^[0-9a-f]{64}$/);
    runner.mockRestore();
    pass.mockRestore();
    play.mockRestore();
    decide.mockRestore();
  });

  it("passes the exact same evaluated candidate universe to treatment", () => {
    const task = makeTask();
    const requests: RolloutRequest[] = [];
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      requests.push(typed);
      return successResult([typed.candidates[0]!.candidateId]);
    });
    const original = aiDecisionEngine.decideAiAction;
    const decisions: ReturnType<typeof decideAiAction>[] = [];
    const decide = vi.spyOn(aiDecisionEngine, "decideAiAction").mockImplementation((...args) => {
      const decision = original(...args);
      decisions.push(decision);
      return decision;
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 2 });

    expect(result.decisionCount).toBe(2);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.formalExecutionAllowed).toBe(false);
    expect(decisions).toHaveLength(2);
    const matchedDecision = decisions.find((decision) =>
      decision.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action))
        .join("|") === requests[0]!.candidates.map(({ candidateId }) => candidateId).join("|"));
    expect(matchedDecision).toBeDefined();
    expect(requests[0]!.candidates.map(({ candidateId }) => candidateId)).toEqual(
      matchedDecision!.evaluatedCandidates.map(({ candidate }) => canonicalActionIdentity(candidate.action)),
    );
    expect(requests[0]!.candidates.map(({ action }) => action)).toEqual(
      matchedDecision!.evaluatedCandidates.map(({ candidate }) => candidate.action),
    );
    expect(requests[0]!.candidates.map(({ baselineEvaluatorScore }) => baselineEvaluatorScore)).toEqual(
      matchedDecision!.evaluatedCandidates.map(({ score }) => score.total),
    );
    const evidence = result.decisionTelemetry.find((record) => record.rolloutEvidence !== null)?.rolloutEvidence;
    expect(evidence).toMatchObject({ effectiveSampleSize: 1, acceptedScenarioCount: 1, coverage: "complete" });
    expect(evidence?.completedReplicateCount).toBeGreaterThan(0);
    expect(evidence?.expectedCompletedReplicateCount).toBe(evidence?.completedReplicateCount);
    decide.mockRestore();
    runner.mockRestore();
  });

  it("executes the treatment candidate on a treatment-controlled seat", () => {
    const task = makeTask({ allocation: "BA" });
    let baselineId = "";
    const original = aiDecisionEngine.decideAiAction;
    const decide = vi.spyOn(aiDecisionEngine, "decideAiAction").mockImplementation((...args) => {
      const decision = original(...args);
      baselineId = canonicalActionIdentity(decision.action);
      return decision;
    });
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([chooseDifferentCandidate(typed, baselineId)]);
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 3 });
    const decision = result.decisionTelemetry.find(({ actingStrategy, selection }) => actingStrategy === "treatment" && selection === "treatment");
    expect(decision).toBeDefined();

    expect(decision!.actingStrategy).toBe("treatment");
    expect(decision!.selection).toBe("treatment");
    expect(decision!.disagreement).toBe(true);
    expect(decision!.executedCandidateId).toBe(decision!.treatmentCandidateId);
    expect(decision!.executedCandidateId).not.toBe(decision!.baselineCandidateId);
    expect(result.runtimePlanMismatchCount).toBe(0);
    decide.mockRestore();
    runner.mockRestore();
  });

  it("executes the saved baseline candidate when Task 2 falls back", () => {
    const task = makeTask({ allocation: "BA" });
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue({
      ok: false,
      failure: { kind: "kernel-failed", failure: { kind: "budget-exhausted", workUnits: 1, maximumWorkUnits: 1 } },
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 3 });
    const decision = result.decisionTelemetry.find(({ actingStrategy, fallbackReason }) => actingStrategy === "treatment" && fallbackReason === "rollout-failed");
    expect(decision).toBeDefined();

    expect(decision!.actingStrategy).toBe("treatment");
    expect(decision!.fallbackReason).toBe("rollout-failed");
    expect(decision!.selection).toBe("baseline");
    expect(decision!.executedCandidateId).toBe(decision!.baselineCandidateId);
    expect(result.runtimePlanMismatchCount).toBe(0);
    runner.mockRestore();
  });

  it("does not count recoverable rollout failure as a treatment error", () => {
    const task = makeTask({ allocation: "BA" });
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue({
      ok: false,
      failure: { kind: "kernel-failed", failure: { kind: "budget-exhausted", workUnits: 1, maximumWorkUnits: 1 } },
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 3 });
    const treatmentFallback = result.decisionTelemetry.find(({ actingStrategy, fallbackReason }) => actingStrategy === "treatment" && fallbackReason === "rollout-failed");

    expect(treatmentFallback).toBeDefined();
    expect(result.fallbackCounts["rollout-failed"]).toBeGreaterThan(0);
    expect(result.errorCounters.total).toBe(0);
    expect(result.errorCounters.treatmentErrors).toBe(0);
    runner.mockRestore();
  });

  it("counts an unexpected treatment exception while still falling back to baseline", () => {
    const task = makeTask({ allocation: "BA" });
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation(() => {
      throw new Error("D2G_TEST_UNEXPECTED_TREATMENT_EXCEPTION");
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 3 });
    const treatmentFallback = result.decisionTelemetry.find(({ actingStrategy, fallbackReason }) => actingStrategy === "treatment" && fallbackReason === "unexpected-failure");

    expect(treatmentFallback).toBeDefined();
    expect(treatmentFallback!.selection).toBe("baseline");
    expect(treatmentFallback!.executedCandidateId).toBe(treatmentFallback!.baselineCandidateId);
    expect(result.errorCounters.treatmentErrors).toBeGreaterThan(0);
    expect(result.errorCounters.total).toBeGreaterThan(0);
    runner.mockRestore();
  });

  it("does not count canonical snapshot unusable fallback as a treatment error", () => {
    const task = makeTask({ pendingTributeItems: [{ payer: 0, receiver: 2 }] });
    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 3 });

    expect(result.decisionTelemetry[0]!.fallbackReason).toBe("rollout-unusable");
    expect(result.errorCounters.total).toBe(0);
    expect(result.errorCounters.treatmentErrors).toBe(0);
    expect(result.actionExecutionCount).toBe(1);
  });

  it("keeps production Room and benchmark observation decision fields equivalent", () => {
    const task = makeTask();
    const productionRoom = structuredClone(task.room);
    const benchmarkRoom = structuredClone(task.room);
    const seat = productionRoom.currentTurn;
    const expected = toProductionObservation(createBenchmarkObservation(benchmarkRoom, seat));
    let actual: unknown;
    const original = aiDecisionEngine.decideAiAction;
    const decide = vi.spyOn(aiDecisionEngine, "decideAiAction").mockImplementation((observation, ...rest) => {
      actual = structuredClone(observation);
      return original(observation, ...rest);
    });

    roomModule.runAiStep(productionRoom);

    expect(actual).toEqual(expected);
    decide.mockRestore();
  });

  it("keeps canonical action execution errors as correctness errors", () => {
    const task = makeTask();
    const play = vi.spyOn(roomModule, "playCards").mockImplementation(() => {
      throw new Error("D2G_TEST_EXECUTION_EXCEPTION");
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 1 });

    expect(result.errorCounters.executionErrors).toBeGreaterThan(0);
    expect(result.termination).toBe("error");
    play.mockRestore();
  });

  it("uses the real production and detached D2F path for a canonical first turn", () => {
    const task = makeTask();
    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 2 });

    expect(result.decisionCount).toBe(2);
    expect(result.decisionTelemetry[0]!.fallbackReason).not.toBe("unexpected-failure");
    expect(result.decisionTelemetry[1]!.rolloutEvaluationCostMs).toBeGreaterThanOrEqual(0);
    expect(result.decisionTelemetry[1]!.fallbackReason).toBe("none");
    expect(result.decisionTelemetry[1]!.rolloutWorkUnits).toBeGreaterThan(0);
    expect(result.decisionTelemetry[0]!.rolloutEvaluationCostMs).toBeGreaterThanOrEqual(0);
    expect(result.publicTraceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.finalPublicLedgerHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rebuildPublicLedger({ schemaVersion: "d2-public-ledger-replay-v1", initialState: result.initialPublicReplayState, events: result.publicEvents, finalLedgerHash: result.finalPublicLedgerHash }).hash).toBe(result.finalPublicLedgerHash);
  });

  it("completes a canonical game with conserved physical cards", () => {
    const task = makeTask({ allocation: "BA" });
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });

    const result = simulateD2GHeadToHeadGame(task);

    expect(result.completed).toBe(true);
    expect(result.termination).toBe("finished");
    expect(result.cardConservation).toBe(true);
    expect(result.actionExecutionCount).toBe(result.playCount + result.passCount);
    expect(result.finalPublicLedgerHash).toMatch(/^[0-9a-f]{64}$/);
    runner.mockRestore();
  });

  it("keeps other players' hands out of the production observation", () => {
    const task = makeTask();
    const observations: unknown[] = [];
    const original = aiDecisionEngine.decideAiAction;
    const decide = vi.spyOn(aiDecisionEngine, "decideAiAction").mockImplementation((observation, ...rest) => {
      observations.push(observation);
      return original(observation, ...rest);
    });
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });

    simulateD2GHeadToHeadGame(task, { maxTurns: 1 });

    expect(observations).toHaveLength(1);
    expect(Object.keys(observations[0] as object)).not.toContain("hands");
    expect(Object.keys(observations[0] as object)).not.toContain("initialHands");
    expect((observations[0] as { hand: unknown[] }).hand).toHaveLength(27);
    runner.mockRestore();
    decide.mockRestore();
  });

  it("replays the same semantic/public result while ignoring timing", () => {
    const task = makeTask();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });

    const first = simulateD2GHeadToHeadGame(task, { maxTurns: 2 });
    const second = simulateD2GHeadToHeadGame(task, { maxTurns: 2 });

    expect(second.semanticHash).toBe(first.semanticHash);
    expect(second.publicTraceHash).toBe(first.publicTraceHash);
    expect(second.finalPublicLedgerHash).toBe(first.finalPublicLedgerHash);
    expect(second.decisionTelemetry.map(({ productionDecisionCostMs: _p, rolloutEvaluationCostMs: _r, ...record }) => record))
      .toEqual(first.decisionTelemetry.map(({ productionDecisionCostMs: _p, rolloutEvaluationCostMs: _r, ...record }) => record));
    runner.mockRestore();
  });

  it("uses canonical tribute transitions without counting them as AI decisions", () => {
    const task = makeTask({ pendingTributeItems: [{ payer: 0, receiver: 2 }] });
    const advance = vi.spyOn(roomModule, "advanceOpeningTribute");
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockImplementation((request) => {
      const typed = request as RolloutRequest;
      return successResult([typed.candidates[0]!.candidateId]);
    });

    const result = simulateD2GHeadToHeadGame(task, { maxTurns: 3 });

    expect(advance).toHaveBeenCalled();
    expect(result.tributeTransitionCount + result.returnTransitionCount).toBeGreaterThan(0);
    expect(result.decisionCount).toBe(1);
    expect(result.decisionTelemetry).toHaveLength(1);
    expect(result.decisionTelemetry[0]!.fallbackReason).toBe("rollout-unusable");
    expect(result.actionExecutionCount).toBe(1);
    expect(result.publicEvents.some((event) => event.kind === "tribute" || event.kind === "return")).toBe(true);
    runner.mockRestore();
    advance.mockRestore();
  });

  it("does not use the legacy benchmark Room in the D2G source boundary", async () => {
    const source = await import("./d2gCanonicalAdapter").then((module) => String(module.createD2GCanonicalHeadToHeadTask));
    expect(source).not.toContain("createLegacyBenchmarkRoom");
  });
});
