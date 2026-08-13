class AllZeroWeightsError extends Error {
  constructor() {
    super("All particle log weights are negative infinity");
    this.name = "AllZeroWeightsError";
  }
}

class NormalizationFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NormalizationFailureError";
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

function requireLogWeightArray(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    throw new NormalizationFailureError("log weights must be an array");
  }
  if (value.length === 0) {
    throw new TypeError("log weights must not be empty");
  }

  for (const item of value) {
    if (
      typeof item !== "number" ||
      (item !== Number.NEGATIVE_INFINITY &&
        (!Number.isFinite(item) || item > 0))
    ) {
      throw new NormalizationFailureError("invalid log weight");
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
    throw new NormalizationFailureError("invalid tolerance");
  }
  return value;
}

export function aggregateLogWeights(input: Readonly<{
  priorLogWeights: readonly number[];
  actionLogLikelihoods: readonly number[];
}>): readonly number[] {
  const priorLogWeights = requireLogWeightArray(input.priorLogWeights);
  const actionLogLikelihoods = requireLogWeightArray(input.actionLogLikelihoods);

  if (priorLogWeights.length !== actionLogLikelihoods.length) {
    throw new TypeError("log weight arrays must have equal lengths");
  }

  const result = priorLogWeights.map(
    (prior, index) => prior + actionLogLikelihoods[index]!,
  );
  return Object.freeze(result);
}

export function normalizeLogWeights(input: Readonly<{
  logWeights: readonly number[];
  tolerance: number;
}>): Readonly<{ logNormalizer: number; weights: readonly number[] }> {
  const logWeights = requireLogWeightArray(input.logWeights);
  const tolerance = requireTolerance(input.tolerance);

  let maximum = Number.NEGATIVE_INFINITY;
  for (const logWeight of logWeights) {
    if (logWeight > maximum) maximum = logWeight;
  }

  if (maximum === Number.NEGATIVE_INFINITY) {
    throw new AllZeroWeightsError();
  }

  let exponentialSum = 0;
  for (const logWeight of logWeights) {
    exponentialSum += Math.exp(logWeight - maximum);
  }

  if (!Number.isFinite(exponentialSum) || exponentialSum <= 0) {
    throw new NormalizationFailureError("invalid exponential sum");
  }

  const logNormalizer = maximum + Math.log(exponentialSum);
  const weights = logWeights.map((logWeight) =>
    Math.exp(logWeight - logNormalizer),
  );
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  if (
    !Number.isFinite(logNormalizer) ||
    !Number.isFinite(weightSum) ||
    Math.abs(weightSum - 1) > tolerance
  ) {
    throw new NormalizationFailureError("normalization residual exceeds tolerance");
  }

  return deepFreeze({
    logNormalizer,
    weights: Object.freeze(weights),
  });
}
