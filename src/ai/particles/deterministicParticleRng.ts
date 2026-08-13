class BoundedIndexDrawExhaustedError extends Error {
  readonly code = "BOUNDED_INDEX_DRAW_EXHAUSTED" as const;
  readonly exclusiveUpperBound: number;
  readonly maxIndexDraws: number;
  readonly drawsConsumed: number;

  constructor(exclusiveUpperBound: number, maxIndexDraws: number, drawsConsumed: number) {
    super("bounded index draw budget exhausted");
    this.name = "BoundedIndexDrawExhaustedError";
    this.exclusiveUpperBound = exclusiveUpperBound;
    this.maxIndexDraws = maxIndexDraws;
    this.drawsConsumed = drawsConsumed;
  }
}

function assertUint32Seed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError("seed must be a uint32");
}

function assertMaxIndexDraws(maxIndexDraws: number): void {
  if (!Number.isSafeInteger(maxIndexDraws) || maxIndexDraws < 1) throw new RangeError("maxIndexDraws must be a positive safe integer");
}

function assertExclusiveUpperBound(exclusiveUpperBound: number): void {
  if (!Number.isInteger(exclusiveUpperBound) || exclusiveUpperBound < 1 || exclusiveUpperBound > 2 ** 32) throw new RangeError("exclusiveUpperBound must be an integer in [1, 2^32]");
}

export function createDeterministicParticleRng(
  seed: number,
  maxIndexDraws: number,
): Readonly<{
  nextUint32(): number;
  nextIndex(exclusiveUpperBound: number): number;
}> {
  assertUint32Seed(seed);
  assertMaxIndexDraws(maxIndexDraws);
  let state = seed >>> 0;

  const nextUint32 = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };

  const nextIndex = (exclusiveUpperBound: number): number => {
    assertExclusiveUpperBound(exclusiveUpperBound);
    const range = 2 ** 32;
    const acceptLimit = Math.floor(range / exclusiveUpperBound) * exclusiveUpperBound;
    for (let drawsConsumed = 1; drawsConsumed <= maxIndexDraws; drawsConsumed += 1) {
      const draw = nextUint32();
      if (draw < acceptLimit) return draw % exclusiveUpperBound;
      if (drawsConsumed === maxIndexDraws) throw new BoundedIndexDrawExhaustedError(exclusiveUpperBound, maxIndexDraws, drawsConsumed);
    }
    throw new BoundedIndexDrawExhaustedError(exclusiveUpperBound, maxIndexDraws, maxIndexDraws);
  };

  return Object.freeze({ nextUint32, nextIndex });
}
