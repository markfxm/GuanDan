import { describe, expect, test, vi } from "vitest";
import type {
  RolloutEvidenceRequirements,
  RolloutReplicateResult,
  RolloutScenario,
} from "../../../src/ai/rollout/contracts";
import { validateRolloutEvidence, type RolloutEvidenceInput } from "../../../src/ai/rollout/evidenceGate";
import * as kernel from "../../../src/ai/rollout/kernel";

const REQUIREMENTS: RolloutEvidenceRequirements = Object.freeze({
  schemaVersion: "d2f-rollout-evidence-requirements-v1",
  minimumEffectiveSampleSize: 2,
  minimumAcceptedScenarioCount: 2,
  minimumCompletedReplicateCount: 2,
  requireCompleteCoverage: true,
});

function hex(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function makeScenario(index: number, normalizedWeight: number): RolloutScenario {
  return Object.freeze({
    scenarioIdentity: hex(index),
    normalizedWeight,
    privateState: Object.freeze({ hiddenMarker: `hidden-${index}` }),
  });
}

function makeReplicate(
  candidateId: string,
  scenarioIdentity: string,
  ordinal: number,
  utility: -3 | -2 | -1 | 1 | 2 | 3 = 1,
  workUnits = 3,
): RolloutReplicateResult {
  return Object.freeze({
    ok: true as const,
    candidateId,
    scenarioIdentity,
    replicateIdentity: hex(100 + ordinal),
    utility,
    workUnits,
  });
}

function makeInput(overrides: Partial<RolloutEvidenceInput> = {}): RolloutEvidenceInput {
  const scenarios = [makeScenario(1, 0.25), makeScenario(2, 0.75)];
  const candidateIds = ["candidate-a", "candidate-b"];
  const results = candidateIds.flatMap((candidateId) => scenarios.flatMap((scenario, scenarioIndex) => [
    makeReplicate(candidateId, scenario.scenarioIdentity, candidateIds.indexOf(candidateId) * 10 + scenarioIndex * 2),
    makeReplicate(candidateId, scenario.scenarioIdentity, candidateIds.indexOf(candidateId) * 10 + scenarioIndex * 2 + 1, -1),
  ]));
  return {
    requirements: REQUIREMENTS,
    effectiveSampleSize: 2,
    acceptedScenarioCount: 2,
    replicateCountPerScenario: 2,
    candidateIds,
    scenarios,
    results,
    ...overrides,
  };
}

describe("validateRolloutEvidence", () => {
  test("accepts exact evidence boundaries for multiple candidates without changing the input", () => {
    const input = makeInput();
    const before = structuredClone(input);

    const result = validateRolloutEvidence(input);

    expect(result.ok).toBe(true);
    expect(input).toEqual(before);
    if (result.ok) {
      expect(result.value.candidateIds).toEqual(["candidate-a", "candidate-b"]);
      expect(result.value.scenarios.map((scenario) => scenario.scenarioIdentity)).toEqual([hex(1), hex(2)]);
      expect(result.value.results).toHaveLength(8);
    }
  });

  test("is invariant to candidate, scenario, replicate, and map insertion order", () => {
    const input = makeInput();
    const reversed = makeInput({
      candidateIds: [...input.candidateIds].reverse(),
      scenarios: [...input.scenarios].reverse(),
      results: [...input.results].reverse(),
    });

    const first = validateRolloutEvidence(input);
    const second = validateRolloutEvidence(reversed);

    expect(second).toEqual(first);
  });

  test("rejects low ESS before reading candidate results or entering the kernel", () => {
    const kernelSpy = vi.spyOn(kernel, "runRolloutReplicate");
    const input = makeInput({
      effectiveSampleSize: 1,
      results: Object.defineProperty([], "0", {
        get: () => { throw new Error("candidate loop entered"); },
      }) as unknown as RolloutReplicateResult[],
    });

    expect(() => validateRolloutEvidence(input)).not.toThrow();
    expect(validateRolloutEvidence(input)).toEqual({
      ok: false,
      failure: {
        kind: "effective-sample-size-too-low",
        effectiveSampleSize: 1,
        minimumEffectiveSampleSize: 2,
      },
    });
    expect(kernelSpy).not.toHaveBeenCalled();
    kernelSpy.mockRestore();
  });

  test("rejects too few accepted scenarios before candidate results are consumed", () => {
    const input = makeInput({ acceptedScenarioCount: 1, scenarios: [makeScenario(1, 1)] });

    expect(validateRolloutEvidence(input)).toEqual({
      ok: false,
      failure: {
        kind: "insufficient-scenarios",
        acceptedScenarioCount: 1,
        minimumAcceptedScenarioCount: 2,
      },
    });
  });

  test("rejects a scenario whose completed replicate count is below the minimum", () => {
    const input = makeInput({ results: makeInput().results.slice(0, 7) });

    expect(validateRolloutEvidence(input)).toEqual({
      ok: false,
      failure: {
        kind: "insufficient-replicates",
        completedReplicateCount: 1,
        minimumCompletedReplicateCount: 2,
      },
    });
  });

  test.each([
    ["candidate missing a scenario", (input: RolloutEvidenceInput) => ({
      ...input,
      results: input.results.filter((result) => !(result.ok && result.candidateId === "candidate-b" && result.scenarioIdentity === hex(2))),
    })],
    ["scenario missing a replicate", (input: RolloutEvidenceInput) => ({
      ...input,
      requirements: { ...input.requirements, minimumCompletedReplicateCount: 1 },
      results: input.results.slice(0, 7),
    })],
    ["candidate coverage sets differ", (input: RolloutEvidenceInput) => ({
      ...input,
      results: input.results.filter((result) => !(result.ok && result.candidateId === "candidate-b" && result.scenarioIdentity === hex(2))),
    })],
  ])("rejects %s with typed coverage failure", (_label, mutate) => {
    const result = validateRolloutEvidence(mutate(makeInput()));

    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      failure: expect.objectContaining({ kind: "coverage-mismatch" }),
    }));
  });

  test("preserves a typed kernel failure and returns no partial evidence", () => {
    const kernelFailure: RolloutReplicateResult = {
      ok: false,
      failure: { kind: "budget-exhausted", workUnits: 3, maximumWorkUnits: 3 },
    };
    const input = makeInput({ results: [...makeInput().results.slice(0, 7), kernelFailure] });

    const result = validateRolloutEvidence(input);

    expect(result).toEqual({
      ok: false,
      failure: { kind: "kernel-failed", failure: kernelFailure.failure },
    });
    expect(result).not.toHaveProperty("value");
  });

  test.each([
    ["negative ESS", { effectiveSampleSize: -1 }],
    ["non-finite ESS", { effectiveSampleSize: Number.POSITIVE_INFINITY }],
    ["fractional accepted scenario count", { acceptedScenarioCount: 1.5 }],
    ["negative replicate count", { replicateCountPerScenario: -1 }],
    ["fractional replicate count", { replicateCountPerScenario: 1.5 }],
    ["unsafe replicate count", { replicateCountPerScenario: Number.MAX_SAFE_INTEGER + 1 }],
  ])("rejects %s as typed invalid input", (_label, override) => {
    const result = validateRolloutEvidence(makeInput(override));

    expect(result.ok).toBe(false);
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      failure: expect.objectContaining({ kind: "invalid-request" }),
    }));
  });

  test("rejects checked coverage multiplication overflow without throwing", () => {
    const input = makeInput({
      replicateCountPerScenario: Number.MAX_SAFE_INTEGER,
      results: [],
    });

    expect(() => validateRolloutEvidence(input)).not.toThrow();
    expect(validateRolloutEvidence(input)).toEqual({
      ok: false,
      failure: { kind: "invalid-budget", field: "replicateCountPerScenario" },
    });
  });
});
