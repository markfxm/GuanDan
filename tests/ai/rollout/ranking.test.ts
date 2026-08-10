import { describe, expect, test } from "vitest";
import type {
  CandidateRolloutSummary,
  RolloutAggregateDiagnostics,
} from "../../../src/ai/rollout/contracts";
import {
  assembleRankedRolloutResult,
  rankCandidateRollouts,
} from "../../../src/ai/rollout/ranking";

function summary(
  candidateId: string,
  riskAdjustedUtility: number,
  expectedUtility: number,
  baselineEvaluatorScore: number,
): CandidateRolloutSummary {
  return {
    candidateId,
    riskAdjustedUtility,
    expectedUtility,
    variance: 0,
    risk: 0,
    baselineEvaluatorScore,
    acceptedScenarioCount: 2,
    replicateCountPerScenario: 2,
    expectedReplicateCount: 4,
    completedReplicateCount: 4,
    workUnitCount: 8,
  };
}

const DIAGNOSTICS: RolloutAggregateDiagnostics = {
  effectiveSampleSize: 2,
  acceptedScenarioCount: 2,
  replicateCountPerScenario: 2,
  completedReplicateCount: 4,
  expectedCompletedReplicateCount: 4,
  candidateCount: 1,
  workUnitCount: 8,
  coverage: "complete",
};

describe("rankCandidateRollouts", () => {
  test("puts an obvious positive-utility winner before mixed positive and negative candidates", () => {
    const result = rankCandidateRollouts([
      summary("negative", -2, -1, 10),
      summary("winner", 3, 2, -10),
      summary("mixed", 1, -1, 20),
    ]);

    expect(result).toEqual({ ok: true, ranking: ["winner", "mixed", "negative"] });
  });

  test("uses expected utility as the second tie-break", () => {
    const result = rankCandidateRollouts([
      summary("lower-mean", 1, 1, 100),
      summary("higher-mean", 1, 2, -100),
    ]);

    expect(result).toEqual({ ok: true, ranking: ["higher-mean", "lower-mean"] });
  });

  test("uses baseline evaluator score as the third tie-break", () => {
    const result = rankCandidateRollouts([
      summary("lower-baseline", 1, 1, -2),
      summary("higher-baseline", 1, 1, 4),
    ]);

    expect(result).toEqual({ ok: true, ranking: ["higher-baseline", "lower-baseline"] });
  });

  test("uses ascending UTF-16 candidateId as the fourth tie-break", () => {
    const result = rankCandidateRollouts([
      summary("a\u0002", 1, 1, 1),
      summary("a\u0001", 1, 1, 1),
    ]);

    expect(result).toEqual({ ok: true, ranking: ["a\u0001", "a\u0002"] });
  });

  test("is stable and deterministic for complete ties and reversed input", () => {
    const summaries = [
      summary("candidate-c", 1, 1, 1),
      summary("candidate-a", 1, 1, 1),
      summary("candidate-b", 1, 1, 1),
    ];

    const first = rankCandidateRollouts(summaries);
    const second = rankCandidateRollouts([...summaries].reverse());

    expect(first).toEqual({ ok: true, ranking: ["candidate-a", "candidate-b", "candidate-c"] });
    expect(second).toEqual(first);
  });

  test("does not use six-digit public rounding to change the unrounded ranking", () => {
    const summaries = [
      summary("candidate-a", 0.0000003, 0, 0),
      summary("candidate-b", 0.0000004, 0, 0),
    ];
    const publicView = summaries.map((value) => ({ ...value, riskAdjustedUtility: Number(value.riskAdjustedUtility.toFixed(6)) }));

    expect(publicView[0]!.riskAdjustedUtility).toBe(publicView[1]!.riskAdjustedUtility);
    expect(rankCandidateRollouts(summaries)).toEqual({ ok: true, ranking: ["candidate-b", "candidate-a"] });
  });

  test.each([
    ["non-finite risk-adjusted utility", [summary("candidate-a", Number.NaN, 0, 0)]],
    ["duplicate candidate identity", [summary("candidate-a", 1, 0, 0), summary("candidate-a", 1, 0, 0)]],
  ])("returns typed ranking failure for %s without a partial ranking", (_label, input) => {
    const result = rankCandidateRollouts(input);

    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      failure: expect.objectContaining({ kind: "invalid-ranking" }),
    }));
    expect(result).not.toHaveProperty("ranking");
  });

  test("assembles only through the two-argument result factory and returns no partial result on invalid request", () => {
    const result = assembleRankedRolloutResult({}, {
      candidateSummaries: [summary("candidate-a", 1, 1, 0)],
      aggregateDiagnostics: DIAGNOSTICS,
    });

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "schemaVersion" } });
    expect(result).not.toHaveProperty("result");
  });
});
