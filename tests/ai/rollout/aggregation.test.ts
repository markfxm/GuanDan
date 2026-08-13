import { describe, expect, test } from "vitest";
import type {
  RolloutEvidenceRequirements,
  RolloutReplicateResult,
  RolloutRiskPolicy,
  RolloutScenario,
} from "../../../src/ai/rollout/contracts";
import {
  aggregateRolloutCandidates,
  type RolloutAggregationInput,
} from "../../../src/ai/rollout/aggregation";

const REQUIREMENTS: RolloutEvidenceRequirements = Object.freeze({
  schemaVersion: "d2f-rollout-evidence-requirements-v1",
  minimumEffectiveSampleSize: 2,
  minimumAcceptedScenarioCount: 2,
  minimumCompletedReplicateCount: 2,
  requireCompleteCoverage: true,
});
const RISK_POLICY: RolloutRiskPolicy = Object.freeze({
  schemaVersion: "d2f-rollout-risk-policy-v1",
  variancePenalty: 0.2,
  downsideRiskPenalty: 0.3,
});

function hex(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function makeScenario(index: number, normalizedWeight: number): RolloutScenario {
  return Object.freeze({ scenarioIdentity: hex(index), normalizedWeight, privateState: Object.freeze({ hidden: index }) });
}

function makeReplicate(candidateId: string, scenarioIdentity: string, ordinal: number, utility: -3 | -2 | -1 | 1 | 2 | 3, workUnits = 4): RolloutReplicateResult {
  return Object.freeze({
    ok: true as const,
    candidateId,
    scenarioIdentity,
    replicateIdentity: hex(1000 + ordinal),
    utility,
    workUnits,
  });
}

function makeInput(overrides: Partial<RolloutAggregationInput> = {}): RolloutAggregationInput {
  const scenarios = [makeScenario(1, 0.25), makeScenario(2, 0.75)];
  const candidateIds = ["candidate-a", "candidate-b"];
  const results = [
    makeReplicate("candidate-a", hex(1), 1, 3),
    makeReplicate("candidate-a", hex(1), 2, -1),
    makeReplicate("candidate-a", hex(2), 3, 1),
    makeReplicate("candidate-a", hex(2), 4, -3),
    makeReplicate("candidate-b", hex(1), 5, 1),
    makeReplicate("candidate-b", hex(1), 6, 1),
    makeReplicate("candidate-b", hex(2), 7, 1),
    makeReplicate("candidate-b", hex(2), 8, 1),
  ];
  return {
    candidates: candidateIds.map((candidateId, index) => ({ candidateId, baselineEvaluatorScore: index === 0 ? 0 : -0 })),
    evidence: {
      requirements: REQUIREMENTS,
      effectiveSampleSize: 2,
      acceptedScenarioCount: 2,
      replicateCountPerScenario: 2,
      candidateIds,
      scenarios,
      results,
    },
    riskPolicy: RISK_POLICY,
    ...overrides,
  };
}

describe("aggregateRolloutCandidates", () => {
  test("uses scenario weight times replicate as the denominator independent of candidate count", () => {
    const result = aggregateRolloutCandidates(makeInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summaries[1]?.expectedUtility).toBe(1);
      expect(result.value.summaries[1]?.variance).toBe(0);
      expect(result.value.diagnostics.expectedCompletedReplicateCount).toBe(8);
    }
  });

  test("computes weighted expected utility, variance, downside risk, and work counts", () => {
    const result = aggregateRolloutCandidates(makeInput({ candidates: [{ candidateId: "candidate-a", baselineEvaluatorScore: 7 }] }));

    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      failure: expect.objectContaining({ kind: "invalid-request" }),
    }));

    const singleCandidate = aggregateRolloutCandidates(makeInput({
      candidates: [{ candidateId: "candidate-a", baselineEvaluatorScore: 7 }],
      evidence: {
        ...makeInput().evidence,
        candidateIds: ["candidate-a"],
        results: makeInput().evidence.results.filter((replicate) => replicate.ok && replicate.candidateId === "candidate-a"),
      },
    }));
    expect(singleCandidate.ok).toBe(true);
    if (singleCandidate.ok) {
      const summary = singleCandidate.value.summaries[0]!;
      expect(summary.expectedUtility).toBe(-0.5);
      expect(summary.variance).toBe(4.75);
      expect(summary.risk).toBe(1);
      expect(summary.riskAdjustedUtility).toBe(-0.5 - 0.2 * Math.sqrt(4.75) - 0.3);
      expect(summary.completedReplicateCount).toBe(4);
      expect(summary.expectedReplicateCount).toBe(4);
      expect(summary.workUnitCount).toBe(16);
      expect(summary.baselineEvaluatorScore).toBe(7);
    }
  });

  test("keeps riskAdjustedUtility equal to the mean at zero risk penalties and is repeatable", () => {
    const base = makeInput();
    const input: RolloutAggregationInput = {
      candidates: [{ candidateId: "candidate-a", baselineEvaluatorScore: 7 }],
      evidence: {
        ...base.evidence,
        candidateIds: ["candidate-a"],
        results: base.evidence.results.filter((replicate) => replicate.ok && replicate.candidateId === "candidate-a"),
      },
      riskPolicy: {
        schemaVersion: "d2f-rollout-risk-policy-v1",
        variancePenalty: 0,
        downsideRiskPenalty: 0,
      },
    };

    const first = aggregateRolloutCandidates(input);
    const second = aggregateRolloutCandidates(input);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.summaries[0]!.riskAdjustedUtility).toBe(first.value.summaries[0]!.expectedUtility);
  });

  test("accepts legal zero-weight scenarios while retaining complete coverage", () => {
    const input = makeInput({
      evidence: {
        ...makeInput().evidence,
        scenarios: [makeScenario(1, 0), makeScenario(2, 1)],
      },
    });

    const result = aggregateRolloutCandidates(input);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.diagnostics.coverage).toBe("complete");
  });

  test("is invariant to candidate, scenario, replicate, and completion order", () => {
    const input = makeInput();
    const reversed = makeInput({
      candidates: [...input.candidates].reverse(),
      evidence: {
        ...input.evidence,
        candidateIds: [...input.evidence.candidateIds].reverse(),
        scenarios: [...input.evidence.scenarios].reverse(),
        results: [...input.evidence.results].reverse(),
      },
    });

    expect(aggregateRolloutCandidates(reversed)).toEqual(aggregateRolloutCandidates(input));
  });

  test.each([
    ["non-finite baseline", { candidates: [{ candidateId: "candidate-a", baselineEvaluatorScore: Number.NaN }, { candidateId: "candidate-b", baselineEvaluatorScore: 0 }] }],
    ["candidate association mismatch", { candidates: [{ candidateId: "candidate-a", baselineEvaluatorScore: 0 }, { candidateId: "foreign", baselineEvaluatorScore: 0 }] }],
    ["zero utility", { evidence: { ...makeInput().evidence, results: makeInput().evidence.results.map((result) => result.ok ? { ...result, utility: 0 as never } : result) } }],
    ["fractional work units", { evidence: { ...makeInput().evidence, results: makeInput().evidence.results.map((result) => result.ok ? { ...result, workUnits: 1.5 } : result) } }],
  ])("returns typed failure for %s without a partial summary", (_label, override) => {
    const result = aggregateRolloutCandidates(makeInput(override));

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("value");
    expect(result).toEqual(expect.objectContaining({ ok: false, failure: expect.any(Object) }));
  });

  test("rejects checked work-unit sum overflow atomically", () => {
    const base = makeInput();
    const result = aggregateRolloutCandidates({
      ...base,
      evidence: {
        ...base.evidence,
        results: base.evidence.results.map((replicate) => replicate.ok ? { ...replicate, workUnits: Number.MAX_SAFE_INTEGER } : replicate),
      },
    });

    expect(result.ok).toBe(false);
    expect(result).toEqual({ ok: false, failure: { kind: "aggregation-failed", failure: { kind: "work-unit-overflow" } } });
  });
});
