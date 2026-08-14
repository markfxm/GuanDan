import * as aggregation from "./aggregation";
import * as contracts from "./contracts";
import * as evidenceGate from "./evidenceGate";
import * as kernel from "./kernel";
import * as ranking from "./ranking";
import * as scenarioSource from "./particleScenarioSource";
import {
  createCanonicalRolloutSchedule,
  createRolloutInputRandomView,
} from "./rolloutInputFreeze";
import type {
  RolloutExecutionResult,
  RolloutReplicateResult,
} from "./contracts";

export function runDetachedRollout(requestInput: unknown): RolloutExecutionResult {
  try {
    const request = contracts.createRolloutRequest(requestInput);
    if (!request.ok) return request;

    const validatedBudget = contracts.validateRolloutBudget({
      budget: request.value.budget,
      limits: request.value.limits,
    });
    if (!validatedBudget.ok) return validatedBudget;

    const source = scenarioSource.createParticleScenarioSource(request.value.scenarioSourceInput);
    if (!source.ok) return source;

    const evidenceInput = {
      requirements: request.value.evidenceRequirements,
      effectiveSampleSize: source.effectiveSampleSize,
      acceptedScenarioCount: source.acceptedScenarioCount,
      replicateCountPerScenario: request.value.budget.replicateCountPerScenario,
      candidateIds: request.value.candidates.map((candidate) => candidate.candidateId),
      scenarios: source.scenarios,
      results: [],
    };
    const preflightEvidence = evidenceGate.validateRolloutEvidence(evidenceInput);
    if (!preflightEvidence.ok && preflightEvidence.failure.kind !== "coverage-mismatch") return preflightEvidence;

    const schedule = createCanonicalRolloutSchedule(request.value, source);
    if (!schedule.ok) return schedule;

    const replicateResults: RolloutReplicateResult[] = [];
    for (const entry of schedule.value) {
      const random = createRolloutInputRandomView(
        request.value.rootIdentity,
        entry.scenario.scenarioIdentity,
        entry.replicateIdentity,
        request.value.scenarioSourceInput.publicState.actingSeat,
      );
      if (!random.ok) return random;

      const replicateInput = scenarioSource.createRolloutReplicateInputFromValidatedSource(
        source,
        entry.sourceScenarioIndex,
        entry.candidate,
        entry.replicateIdentity,
        random.value,
        validatedBudget.value,
      );
      if (!replicateInput.ok) return replicateInput;

      const replicate = kernel.runRolloutReplicate(replicateInput.value, request.value.rootIdentity);
      if (!replicate.ok) return { ok: false, failure: { kind: "kernel-failed", failure: replicate.failure } };
      replicateResults.push(replicate);
    }

    const completedEvidenceInput = { ...evidenceInput, results: replicateResults };
    const evidence = evidenceGate.validateRolloutEvidence(completedEvidenceInput);
    if (!evidence.ok) return evidence;

    const aggregate = aggregation.aggregateRolloutCandidates({
      candidates: request.value.candidates.map(({ candidateId, baselineEvaluatorScore }) => ({ candidateId, baselineEvaluatorScore })),
      evidence: completedEvidenceInput,
      riskPolicy: request.value.riskPolicy,
    });
    if (!aggregate.ok) return aggregate;

    const ranked = ranking.rankCandidateRollouts(aggregate.value.summaries);
    if (!ranked.ok) return { ok: false, failure: { kind: "invalid-request", field: "ranking" } };

    const assembled = contracts.createRolloutResult(request.value, {
      candidateSummaries: aggregate.value.summaries,
      ranking: ranked.ranking,
      aggregateDiagnostics: aggregate.value.diagnostics,
    });
    if (!assembled.ok) return assembled;
    return Object.freeze({ ok: true as const, result: assembled.value });
  } catch {
    return { ok: false, failure: { kind: "invalid-request", field: "request" } };
  }
}
