class EffectiveSampleSizeFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EffectiveSampleSizeFailureError";
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function requireWeights(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    throw new EffectiveSampleSizeFailureError(
      "normalized weights must be an array",
    );
  }
  if (value.length === 0) {
    throw new TypeError("normalized weights must not be empty");
  }

  for (const weight of value) {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      throw new EffectiveSampleSizeFailureError("invalid normalized weight");
    }
  }

  return value;
}

function requireTolerance(value: unknown): number {
  if (
    typeof value !== "number" ||
    Object.is(value, -0) ||
    !Number.isFinite(value) ||
    value < 1e-12 ||
    value > 1e-6
  ) {
    throw new EffectiveSampleSizeFailureError("invalid tolerance");
  }
  return value;
}

function requireThreshold(value: unknown, particleCount: number): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 1 ||
    value > particleCount
  ) {
    throw new EffectiveSampleSizeFailureError("invalid ESS threshold");
  }
  return value;
}

export function calculateEffectiveSampleSize(input: Readonly<{
  normalizedWeights: readonly number[];
  tolerance: number;
  degradedEssThreshold: number;
}>): Readonly<{ ess: number; status: "ready" | "degraded" }> {
  const normalizedWeights = requireWeights(input.normalizedWeights);
  const tolerance = requireTolerance(input.tolerance);
  const degradedEssThreshold = requireThreshold(
    input.degradedEssThreshold,
    normalizedWeights.length,
  );

  const weightSum = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(weightSum) || Math.abs(weightSum - 1) > tolerance) {
    throw new EffectiveSampleSizeFailureError("weights are not normalized");
  }

  const squaredWeightSum = normalizedWeights.reduce(
    (sum, weight) => sum + weight ** 2,
    0,
  );
  if (!Number.isFinite(squaredWeightSum) || squaredWeightSum <= 0) {
    throw new EffectiveSampleSizeFailureError("invalid squared weight sum");
  }

  let ess = 1 / squaredWeightSum;
  const particleCount = normalizedWeights.length;
  if (ess < 1) {
    if (1 - ess <= tolerance) ess = 1;
    else throw new EffectiveSampleSizeFailureError("ESS below lower bound");
  }
  if (ess > particleCount) {
    if (ess - particleCount <= tolerance) ess = particleCount;
    else throw new EffectiveSampleSizeFailureError("ESS above upper bound");
  }

  return deepFreeze({
    ess,
    status: ess < degradedEssThreshold ? "degraded" : "ready",
  });
}
