import { beforeAll, describe, expect, test } from "vitest";

const essModulePath = "../../../src/ai/particles/effectiveSampleSize";

type EssModule = Readonly<{
  calculateEffectiveSampleSize(input: Readonly<{
    normalizedWeights: readonly number[];
    tolerance: number;
    degradedEssThreshold: number;
  }>): Readonly<{ ess: number; status: "ready" | "degraded" }>;
}>;

let essModule!: EssModule;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertEssModule(value: unknown): EssModule {
  if (
    !isRecord(value) ||
    typeof value.calculateEffectiveSampleSize !== "function"
  ) {
    throw new Error("TASK5_ESS_EXPORT_INVALID");
  }
  return {
    calculateEffectiveSampleSize:
      value.calculateEffectiveSampleSize as EssModule["calculateEffectiveSampleSize"],
  };
}

beforeAll(async () => {
  try {
    const loaded = await import(
      /* @vite-ignore */
      essModulePath
    );
    essModule = assertEssModule(loaded);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`TASK5_MISSING_MODULE:${essModulePath}:${detail}`);
  }
});

describe("particle effective sample size", () => {
  test("rejects negative ordinary weights and invalid tolerance", () => {
    expect(() =>
      essModule.calculateEffectiveSampleSize({
        normalizedWeights: [0.5, -0.5],
        tolerance: 1e-9,
        degradedEssThreshold: 1,
      }),
    ).toThrow();
    expect(() =>
      essModule.calculateEffectiveSampleSize({
        normalizedWeights: [0.5, 0.5],
        tolerance: 0,
        degradedEssThreshold: 1,
      }),
    ).toThrow();
    expect(() =>
      essModule.calculateEffectiveSampleSize({
        normalizedWeights: [],
        tolerance: 1e-9,
        degradedEssThreshold: 1,
      }),
    ).toThrow(TypeError);
  });

  test("computes ESS as reciprocal squared-weight sum", () => {
    expect(
      essModule.calculateEffectiveSampleSize({
        normalizedWeights: [0.5, 0.5],
        tolerance: 1e-9,
        degradedEssThreshold: 1,
      }),
    ).toEqual({ ess: 2, status: "ready" });
  });

  test("keeps ESS=1 as successful degraded output", () => {
    expect(
      essModule.calculateEffectiveSampleSize({
        normalizedWeights: [1, 0],
        tolerance: 1e-9,
        degradedEssThreshold: 2,
      }),
    ).toEqual({ ess: 1, status: "degraded" });
  });

  test("does not resample any weights", () => {
    const normalizedWeights = [0.5, 0.5];
    const result = essModule.calculateEffectiveSampleSize({
      normalizedWeights,
      tolerance: 1e-9,
      degradedEssThreshold: 1,
    });

    expect(result.ess).toBe(2);
    expect(normalizedWeights).toEqual([0.5, 0.5]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
