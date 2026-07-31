import { beforeAll, describe, expect, test } from "vitest";

const normalizationModulePath =
  "../../../src/ai/particles/logWeightNormalization";

type NormalizationModule = Readonly<{
  aggregateLogWeights(input: Readonly<{
    priorLogWeights: readonly number[];
    actionLogLikelihoods: readonly number[];
  }>): readonly number[];
  normalizeLogWeights(input: Readonly<{
    logWeights: readonly number[];
    tolerance: number;
  }>): Readonly<{ logNormalizer: number; weights: readonly number[] }>;
}>;

let normalizationModule!: NormalizationModule;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertNormalizationModule(
  value: unknown,
): NormalizationModule {
  if (
    !isRecord(value) ||
    typeof value.aggregateLogWeights !== "function" ||
    typeof value.normalizeLogWeights !== "function"
  ) {
    throw new Error("TASK5_NORMALIZATION_EXPORT_INVALID");
  }
  return {
    aggregateLogWeights: value.aggregateLogWeights as NormalizationModule["aggregateLogWeights"],
    normalizeLogWeights: value.normalizeLogWeights as NormalizationModule["normalizeLogWeights"],
  };
}

beforeAll(async () => {
  try {
    const loaded = await import(
      /* @vite-ignore */
      normalizationModulePath
    );
    normalizationModule = assertNormalizationModule(loaded);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `TASK5_MISSING_MODULE:${normalizationModulePath}:${detail}`,
    );
  }
});

describe("particle log-weight normalization", () => {
  test("accumulates multiple public action factors in log space", () => {
    expect(
      normalizationModule.aggregateLogWeights({
        priorLogWeights: [0, 0],
        actionLogLikelihoods: [-0.25, -1.5],
      }),
    ).toEqual([-0.25, -1.5]);
  });

  test("uses stable log-sum-exp for very negative values", () => {
    const result = normalizationModule.normalizeLogWeights({
      logWeights: [-1000, -1001],
      tolerance: 1e-9,
    });

    expect(result.logNormalizer).toBeCloseTo(-999.6867383124818, 10);
    expect(result.weights[0]).toBeCloseTo(1 / (1 + Math.exp(-1)), 10);
    expect(result.weights[1]).toBeCloseTo(1 / (1 + Math.exp(1)), 10);
  });

  test("rejects NaN and positive infinity", () => {
    expect(() =>
      normalizationModule.aggregateLogWeights({
        priorLogWeights: [0],
        actionLogLikelihoods: [Number.NaN],
      }),
    ).toThrow();
    expect(() =>
      normalizationModule.normalizeLogWeights({
        logWeights: [Number.POSITIVE_INFINITY],
        tolerance: 1e-9,
      }),
    ).toThrow();
  });

  test("normalizes finite weights to one within explicit tolerance", () => {
    const result = normalizationModule.normalizeLogWeights({
      logWeights: [0, -Math.log(2)],
      tolerance: 1e-9,
    });

    expect(result.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(
      1,
      12,
    );
  });

  test("fails all-negative-infinity input as all-zero", () => {
    expect(() =>
      normalizationModule.normalizeLogWeights({
        logWeights: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
        tolerance: 1e-9,
      }),
    ).toThrow();
  });

  test("rejects empty arrays", () => {
    expect(() =>
      normalizationModule.aggregateLogWeights({
        priorLogWeights: [],
        actionLogLikelihoods: [],
      }),
    ).toThrow(TypeError);
    expect(() =>
      normalizationModule.normalizeLogWeights({
        logWeights: [],
        tolerance: 1e-9,
      }),
    ).toThrow(TypeError);
  });

  test("rejects mismatched log weight lengths", () => {
    expect(() =>
      normalizationModule.aggregateLogWeights({
        priorLogWeights: [0],
        actionLogLikelihoods: [-1, -2],
      }),
    ).toThrow(TypeError);
  });

  test("does not retain mutable input references", () => {
    const logWeights = [0, -1];
    const result = normalizationModule.normalizeLogWeights({
      logWeights,
      tolerance: 1e-9,
    });

    logWeights[0] = -10;
    expect(result.weights).not.toBe(logWeights);
    expect(result.weights[0]).toBeCloseTo(1 / (1 + Math.exp(-1)), 10);
  });

  test("returns recursively frozen normalized output", () => {
    const result = normalizationModule.normalizeLogWeights({
      logWeights: [0, -1],
      tolerance: 1e-9,
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.weights)).toBe(true);
  });

  test("rejects invalid tolerance boundaries", () => {
    const invalidTolerances = [
      -0,
      0,
      1e-12 - Number.EPSILON,
      1e-6 + Number.EPSILON,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const tolerance of invalidTolerances) {
      expect(() =>
        normalizationModule.normalizeLogWeights({
          logWeights: [0, -1],
          tolerance,
        }),
      ).toThrow();
    }

    expect(
      normalizationModule.normalizeLogWeights({
        logWeights: [0, -1],
        tolerance: 1e-12,
      }).weights.length,
    ).toBe(2);
    expect(
      normalizationModule.normalizeLogWeights({
        logWeights: [0, -1],
        tolerance: 1e-6,
      }).weights.length,
    ).toBe(2);
  });
});
