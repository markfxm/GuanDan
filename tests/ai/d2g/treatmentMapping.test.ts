import { describe, expect, it, vi } from "vitest";
import { canonicalActionIdentity, type RolloutExecutionResult } from "../../../src/ai/rollout/contracts";
import * as rolloutOrchestrator from "../../../src/ai/rollout/rolloutOrchestrator";
import {
  computeD2GCandidateUniverseHash,
  computeD2GDecisionIdentity,
} from "../../../src/ai/d2g/treatmentContracts";
import {
  computeD2GPreActionGameplayStateHash,
  computeD2GPrivateOwnHandFingerprint,
  selectD2GTreatment,
} from "../../../src/ai/d2g/treatmentSelector";
import { makeTreatmentFixture } from "./treatmentFixture";

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

function contextFor(fixture: ReturnType<typeof makeTreatmentFixture>, snapshot: typeof fixture.snapshot, decision: typeof fixture.decision) {
  const base = {
    gameId: fixture.decisionContext.gameId,
    decisionIndex: fixture.decisionContext.decisionIndex,
    actingSeat: snapshot.actingSeat,
    actingStrategy: "treatment" as const,
    preActionGameplayStateHash: computeD2GPreActionGameplayStateHash(snapshot),
    privateOwnHandFingerprint: computeD2GPrivateOwnHandFingerprint(snapshot),
    candidateUniverseHash: computeD2GCandidateUniverseHash(decision),
  };
  return { ...base, decisionIdentity: computeD2GDecisionIdentity(base) };
}

describe("D2G treatment candidate mapping", () => {
  it("maps the rollout top identity to the exact current evaluated candidate object", () => {
    const fixture = makeTreatmentFixture();
    const target = fixture.decision.evaluatedCandidates.find(({ candidate }) => candidate.action.type === "play")!;
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(
      successResult([canonicalActionIdentity(target.candidate.action)]),
    );

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });
    expect(result.fallbackReason).toBe("none");
    expect(result.treatmentCandidateId).toBe(canonicalActionIdentity(target.candidate.action));
    expect(result.selectedCandidate).toBe(target);
    expect(result.selectedAction).toBe(target.candidate.action);
    expect(result.rolloutWorkUnits).toBe(17);
    expect(result.profileConfigurationHash).toBe(fixture.profile.configurationHash);
    expect(result.rankingHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.telemetry.rolloutWorkUnits).toBe(17);
    runner.mockRestore();
  });

  it("reports disagreement when a valid top candidate differs from baseline", () => {
    const fixture = makeTreatmentFixture();
    const baselineId = canonicalActionIdentity(fixture.decision.action);
    const target = fixture.decision.evaluatedCandidates.find(({ candidate }) => canonicalActionIdentity(candidate.action) !== baselineId)!;
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(
      successResult([canonicalActionIdentity(target.candidate.action)]),
    );

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.baselineCandidateId).toBe(baselineId);
    expect(result.disagreement).toBe(true);
    expect(result.selectedCandidateId).not.toBe(result.baselineCandidateId);
    runner.mockRestore();
  });

  it("reports agreement when treatment maps to the baseline candidate", () => {
    const fixture = makeTreatmentFixture();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(
      successResult([canonicalActionIdentity(fixture.decision.action)]),
    );

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.treatmentCandidateId).toBe(result.baselineCandidateId);
    expect(result.disagreement).toBe(false);
    runner.mockRestore();
  });

  it("falls back with candidate-mapping-failed for an unknown rollout identity", () => {
    const fixture = makeTreatmentFixture();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(
      successResult(["foreign-candidate"]),
    );

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("candidate-mapping-failed");
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    expect(result.selectedAction).toBe(result.baselineCandidate?.candidate.action);
    runner.mockRestore();
  });

  it("falls back with candidate-mapping-failed for duplicate current identities", () => {
    const fixture = makeTreatmentFixture();
    const duplicateDecision = {
      ...fixture.decision,
      evaluatedCandidates: [...fixture.decision.evaluatedCandidates, fixture.decision.evaluatedCandidates[0]!],
    };
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout");

    const result = selectD2GTreatment({
      decision: duplicateDecision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("candidate-mapping-failed");
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    expect(runner).not.toHaveBeenCalled();
    runner.mockRestore();
  });

  it("falls back with candidate-no-longer-legal instead of returning an illegal action", () => {
    const fixture = makeTreatmentFixture();
    const target = fixture.decision.evaluatedCandidates.find(({ candidate }) => candidate.action.type === "play")!;
    if (target.candidate.action.type !== "play") return;
    const otherSeat = (fixture.snapshot.actingSeat === 0 ? 1 : 0) as 0 | 1 | 2 | 3;
    const illegalState = {
      ...fixture.snapshot,
      currentTrick: {
        ...fixture.snapshot.currentTrick,
        lastPlay: target.candidate.action.group,
        lastPlaySeat: otherSeat,
      },
    };
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(
      successResult([canonicalActionIdentity(target.candidate.action)]),
    );

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: illegalState,
      decisionContext: contextFor(fixture, illegalState, fixture.decision),
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("candidate-no-longer-legal");
    expect(result.selectedAction).toBe(result.baselineCandidate?.candidate.action);
    expect(runner).toHaveBeenCalledTimes(1);
    runner.mockRestore();
  });

  it("maps incomplete coverage to rollout-unusable with no partial treatment", () => {
    const fixture = makeTreatmentFixture();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue({
      ok: false,
      failure: { kind: "coverage-mismatch", expectedCoverage: 4, actualCoverage: 2 },
    });

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("rollout-unusable");
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    expect(result.selectedAction).toBe(result.baselineCandidate?.candidate.action);
    runner.mockRestore();
  });

  it("maps a ParticleBank/source failure to rollout-unusable", () => {
    const fixture = makeTreatmentFixture();
    const sourceFailureState = { ...fixture.snapshot, publicHistoryEvents: [] };
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout");

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: sourceFailureState,
      decisionContext: contextFor(fixture, sourceFailureState, fixture.decision),
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("rollout-unusable");
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    expect(runner).not.toHaveBeenCalled();
    runner.mockRestore();
  });

  it("maps an empty ranking to rollout-unusable", () => {
    const fixture = makeTreatmentFixture();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue(successResult([]));

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("rollout-unusable");
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    runner.mockRestore();
  });

  it("maps a typed D2F rollout failure to rollout-failed", () => {
    const fixture = makeTreatmentFixture();
    const runner = vi.spyOn(rolloutOrchestrator, "runDetachedRollout").mockReturnValue({
      ok: false,
      failure: { kind: "invalid-request", field: "budget" },
    });

    const result = selectD2GTreatment({
      decision: fixture.decision,
      preActionState: fixture.snapshot,
      decisionContext: fixture.decisionContext,
      profile: fixture.profile,
    });

    expect(result.fallbackReason).toBe("rollout-failed");
    expect(result.selectedCandidateId).toBe(result.baselineCandidateId);
    runner.mockRestore();
  });
});
