import { describe, expect, test } from "vitest";
import { evaluateNonTerminalLeaf } from "../../../src/ai/rollout/leafEvaluation";

type Seat = 0 | 1 | 2 | 3;

const vectors = [
  {
    name: "empty prefix with two equal count pairs",
    input: {
      perspectiveSeat: 0 as Seat,
      actingSeat: 1 as Seat,
      finishOrder: [] as const,
      handCounts: { 0: 3, 1: 2, 2: 3, 3: 2 },
    },
    predictedFinishOrder: [1, 3, 2, 0] as const,
    utility: -3 as const,
  },
  {
    name: "one completed seat",
    input: {
      perspectiveSeat: 2 as Seat,
      actingSeat: 1 as Seat,
      finishOrder: [2] as const,
      handCounts: { 0: 3, 1: 1, 2: 0, 3: 2 },
    },
    predictedFinishOrder: [2, 1, 3, 0] as const,
    utility: 1 as const,
  },
  {
    name: "two completed seats",
    input: {
      perspectiveSeat: 0 as Seat,
      actingSeat: 3 as Seat,
      finishOrder: [0, 2] as const,
      handCounts: { 0: 0, 1: 1, 2: 0, 3: 2 },
    },
    predictedFinishOrder: [0, 2, 1, 3] as const,
    utility: 3 as const,
  },
  {
    name: "three completed seats",
    input: {
      perspectiveSeat: 3 as Seat,
      actingSeat: 3 as Seat,
      finishOrder: [1, 0, 2] as const,
      handCounts: { 0: 0, 1: 0, 2: 0, 3: 2 },
    },
    predictedFinishOrder: [1, 0, 2, 3] as const,
    utility: 1 as const,
  },
] as const;

function rotateSeat(seat: Seat, rotation: number): Seat {
  return ((seat + rotation) % 4) as Seat;
}

function rotateFinishOrder(finishOrder: readonly Seat[], rotation: number): Seat[] {
  return finishOrder.map((seat) => rotateSeat(seat, rotation));
}

function rotateHandCounts(handCounts: Readonly<Record<Seat, number>>, rotation: number): Record<Seat, number> {
  return {
    0: handCounts[((0 - rotation + 4) % 4) as Seat],
    1: handCounts[((1 - rotation + 4) % 4) as Seat],
    2: handCounts[((2 - rotation + 4) % 4) as Seat],
    3: handCounts[((3 - rotation + 4) % 4) as Seat],
  };
}

describe("evaluateNonTerminalLeaf", () => {
  test.each(vectors)("returns the frozen known vector: $name", ({ input, predictedFinishOrder, utility }) => {
    const result = evaluateNonTerminalLeaf(input);

    expect(result).toEqual({ ok: true, predictedFinishOrder, utility });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) expect(Object.isFrozen(result.predictedFinishOrder)).toBe(true);
  });

  test("keeps partner and opposing perspectives consistent", () => {
    const input = vectors[0]!.input;
    const partner = evaluateNonTerminalLeaf({ ...input, perspectiveSeat: 2 });
    const opponent = evaluateNonTerminalLeaf({ ...input, perspectiveSeat: 1 });

    expect(partner).toEqual({ ok: true, predictedFinishOrder: [1, 3, 2, 0], utility: -3 });
    expect(opponent).toEqual({ ok: true, predictedFinishOrder: [1, 3, 2, 0], utility: 3 });
  });

  test.each([
    [4, "unknown-seat"],
    [0.5, "fractional-seat"],
    [Number.MAX_SAFE_INTEGER + 1, "unsafe-integer-seat"],
    [-0, "negative-zero-seat"],
  ] as const)("returns the exact perspective-seat failure for %s", (perspectiveSeat, reason) => {
    expectFailure(evaluateNonTerminalLeaf({ perspectiveSeat, actingSeat: 1, finishOrder: [], handCounts: { 0: 1, 1: 1, 2: 1, 3: 1 } } as never), {
      kind: "invalid-perspective-seat",
      reason,
    });
  });

  test("is invariant under simultaneous seat rotation", () => {
    const vector = vectors[0]!;
    for (const rotation of [0, 1, 2, 3]) {
      const result = evaluateNonTerminalLeaf({
        perspectiveSeat: rotateSeat(vector.input.perspectiveSeat, rotation),
        actingSeat: rotateSeat(vector.input.actingSeat, rotation),
        finishOrder: rotateFinishOrder(vector.input.finishOrder, rotation),
        handCounts: rotateHandCounts(vector.input.handCounts, rotation),
      });

      expect(result).toEqual({
        ok: true,
        predictedFinishOrder: vector.predictedFinishOrder.map((seat) => rotateSeat(seat, rotation)),
        utility: vector.utility,
      });
    }
  });

  test("does not mutate input and is deterministic for repeated calls", () => {
    const input = {
      perspectiveSeat: 0 as Seat,
      actingSeat: 1 as Seat,
      finishOrder: [2] as Seat[],
      handCounts: { 0: 3, 1: 1, 2: 0, 3: 2 },
    };
    const before = { finishOrder: [...input.finishOrder], handCounts: { ...input.handCounts } };
    const first = evaluateNonTerminalLeaf(input);
    const second = evaluateNonTerminalLeaf(input);

    expect(input).toEqual({ perspectiveSeat: 0, actingSeat: 1, finishOrder: before.finishOrder, handCounts: before.handCounts });
    expect(second).toEqual(first);
  });

  test.each([
    { name: "terminal prefix", input: { perspectiveSeat: 0, actingSeat: 0, finishOrder: [0, 1, 2, 3], handCounts: { 0: 0, 1: 0, 2: 0, 3: 0 } }, failure: { kind: "invalid-leaf-state", reason: "terminal-state" } },
    { name: "duplicate prefix", input: { perspectiveSeat: 0, actingSeat: 1, finishOrder: [0, 0], handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 } }, failure: { kind: "invalid-leaf-state", reason: "duplicate-finish" } },
    { name: "unknown prefix seat", input: { perspectiveSeat: 0, actingSeat: 1, finishOrder: [0, 4], handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 } }, failure: { kind: "invalid-leaf-state", reason: "unknown-seat" } },
    { name: "fractional prefix seat", input: { perspectiveSeat: 0, actingSeat: 1, finishOrder: [0, 0.5], handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 } }, failure: { kind: "invalid-leaf-state", reason: "unknown-seat" } },
    { name: "unsafe prefix seat", input: { perspectiveSeat: 0, actingSeat: 1, finishOrder: [0, Number.MAX_SAFE_INTEGER + 1], handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 } }, failure: { kind: "invalid-leaf-state", reason: "unknown-seat" } },
    { name: "negative-zero prefix seat", input: { perspectiveSeat: 0, actingSeat: 1, finishOrder: [0, -0], handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 } }, failure: { kind: "invalid-leaf-state", reason: "unknown-seat" } },
    { name: "negative finished count", input: { perspectiveSeat: 0, actingSeat: 1, finishOrder: [0], handCounts: { 0: 1, 1: 1, 2: 1, 3: 1 } }, failure: { kind: "invalid-leaf-state", reason: "finish-hand-count-mismatch" } },
    { name: "unfinished zero count", input: { perspectiveSeat: 0, actingSeat: 1, finishOrder: [], handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 } }, failure: { kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" } },
  ] as const)("returns the exact finish-state failure for $name", ({ input, failure }) => {
    expectFailure(evaluateNonTerminalLeaf(input as never), failure);
  });

  test.each([
    ["missing hand key", { 0: 1, 1: 1, 2: 1 }, "missing-hand-count"],
    ["unknown hand key", { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 }, "unknown-hand-count"],
    ["negative", { 0: -1, 1: 1, 2: 1, 3: 1 }, "negative-hand-count"],
    ["NaN", { 0: Number.NaN, 1: 1, 2: 1, 3: 1 }, "non-finite-hand-count"],
    ["Infinity", { 0: Number.POSITIVE_INFINITY, 1: 1, 2: 1, 3: 1 }, "non-finite-hand-count"],
    ["-Infinity", { 0: Number.NEGATIVE_INFINITY, 1: 1, 2: 1, 3: 1 }, "non-finite-hand-count"],
    ["fractional", { 0: 0.5, 1: 1, 2: 1, 3: 1 }, "fractional-hand-count"],
    ["unsafe integer", { 0: Number.MAX_SAFE_INTEGER + 1, 1: 1, 2: 1, 3: 1 }, "unsafe-hand-count"],
    ["negative zero", { 0: -0, 1: 1, 2: 1, 3: 1 }, "negative-zero-hand-count"],
  ] as const)("returns the exact hand-count failure for %s", (_name, handCounts, reason) => {
    expectFailure(evaluateNonTerminalLeaf({ perspectiveSeat: 0, actingSeat: 1, finishOrder: [], handCounts } as never), {
      kind: "invalid-leaf-state",
      reason,
    });
  });

  test.each([
    [4, "unknown-seat"],
    [-0, "negative-zero-seat"],
  ] as const)("returns the exact acting-seat failure for %s", (actingSeat, reason) => {
    expectFailure(evaluateNonTerminalLeaf({ perspectiveSeat: 0, actingSeat, finishOrder: [], handCounts: { 0: 1, 1: 1, 2: 1, 3: 1 } } as never), {
      kind: "invalid-acting-seat",
      reason,
    });
  });

  test("rejects a completed or zero-count acting seat", () => {
    expectFailure(evaluateNonTerminalLeaf({ perspectiveSeat: 0, actingSeat: 0, finishOrder: [0], handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 } }), {
      kind: "invalid-acting-seat",
      reason: "finished-seat",
    });
    expectFailure(evaluateNonTerminalLeaf({ perspectiveSeat: 0, actingSeat: 1, finishOrder: [], handCounts: { 0: 1, 1: 0, 2: 1, 3: 1 } }), {
      kind: "invalid-leaf-state",
      reason: "unfinished-zero-hand-count",
    });
  });

  test("rejects sparse, expanded, symbol-keyed and accessor leaf inputs without invoking getters", () => {
    const sparse = [0, ,] as (Seat | undefined)[];
    sparse.length = 2;
    const expandedCounts = { 0: 1, 1: 1, 2: 1, 3: 1 } as Record<Seat, number> & { extra?: number };
    expandedCounts.extra = 1;
    const symbolCounts = { 0: 1, 1: 1, 2: 1, 3: 1 } as Record<Seat, number> & { [key: symbol]: number };
    symbolCounts[Symbol("extra")] = 1;
    const accessorCounts = { 0: 1, 1: 1, 2: 1, 3: 1 } as Record<Seat, number>;
    let getterCalls = 0;
    Object.defineProperty(accessorCounts, "0", { configurable: true, get: () => { getterCalls += 1; return 1; } });
    const customPrototypeCounts = Object.assign(Object.create({ inherited: 1 }), { 0: 1, 1: 1, 2: 1, 3: 1 });

    expectFailure(evaluateNonTerminalLeaf({ perspectiveSeat: 0, actingSeat: 1, finishOrder: sparse as never, handCounts: { 0: 1, 1: 1, 2: 1, 3: 1 } } as never), {
      kind: "invalid-leaf-state",
      reason: "duplicate-finish",
    });
    for (const handCounts of [expandedCounts, symbolCounts, accessorCounts, customPrototypeCounts]) {
      expectFailure(evaluateNonTerminalLeaf({ perspectiveSeat: 0, actingSeat: 1, finishOrder: [], handCounts: handCounts as never } as never), {
        kind: "invalid-leaf-state",
        reason: "unknown-hand-count",
      });
    }
    expect(getterCalls).toBe(0);
  });

  test("returns immutable failure graphs without throwing on hostile envelopes", () => {
    let getterCalls = 0;
    const input = {} as { perspectiveSeat: number; actingSeat: number; finishOrder: readonly Seat[]; handCounts: Readonly<Record<Seat, number>> };
    Object.defineProperty(input, "perspectiveSeat", { configurable: true, get: () => { getterCalls += 1; return 0; } });
    Object.defineProperty(input, "actingSeat", { configurable: true, get: () => { getterCalls += 1; return 1; } });
    Object.defineProperty(input, "finishOrder", { configurable: true, get: () => { getterCalls += 1; return []; } });
    Object.defineProperty(input, "handCounts", { configurable: true, get: () => { getterCalls += 1; return { 0: 1, 1: 1, 2: 1, 3: 1 }; } });

    expect(() => evaluateNonTerminalLeaf(input as never)).not.toThrow();
    expectFailure(evaluateNonTerminalLeaf(input as never), { kind: "invalid-leaf-state", reason: "unknown-seat" });
    expect(getterCalls).toBe(0);
  });
});

function expectFailure(result: unknown, failure: Record<string, unknown>): void {
  expect(result).toEqual({ ok: false, failure });
  expect(result).toHaveProperty("ok", false);
  expect(Object.isFrozen(result)).toBe(true);
  if (typeof result === "object" && result !== null && "failure" in result) {
    expect(Object.isFrozen(result.failure)).toBe(true);
  }
}
