import { describe, expect, test } from "vitest";
import { evaluateNonTerminalLeaf } from "../../../src/ai/rollout/leafEvaluation";
import { isPlainDataArray } from "../../../src/ai/rollout/plainData";
import { evaluateTeamUtility } from "../../../src/ai/rollout/teamUtility";

const truthTable = [
  { finishOrder: [0, 2, 1, 3] as const, utility: 3 as const },
  { finishOrder: [0, 1, 2, 3] as const, utility: 2 as const },
  { finishOrder: [0, 1, 3, 2] as const, utility: 1 as const },
  { finishOrder: [1, 0, 2, 3] as const, utility: -1 as const },
  { finishOrder: [1, 0, 3, 2] as const, utility: -2 as const },
  { finishOrder: [1, 3, 0, 2] as const, utility: -3 as const },
] as const;

function rotateSeat(seat: number, rotation: number): number {
  return (seat + rotation) % 4;
}

function rotateFinishOrder(finishOrder: readonly number[], rotation: number): number[] {
  return finishOrder.map((seat) => rotateSeat(seat, rotation));
}

describe("evaluateTeamUtility", () => {
  test.each(truthTable)("returns the frozen utility for team places $utility", ({ finishOrder, utility }) => {
    const result = evaluateTeamUtility({ perspectiveSeat: 0, finishOrder });

    expect(result).toEqual({ ok: true, utility });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.utility).not.toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("gives both teammates the same utility", () => {
    for (const { finishOrder, utility } of truthTable) {
      expect(evaluateTeamUtility({ perspectiveSeat: 0, finishOrder })).toEqual({ ok: true, utility });
      expect(evaluateTeamUtility({ perspectiveSeat: 2, finishOrder })).toEqual({ ok: true, utility });
    }
  });

  test("gives the opposing team the sign-inverted utility", () => {
    for (const { finishOrder, utility } of truthTable) {
      expect(evaluateTeamUtility({ perspectiveSeat: 1, finishOrder })).toEqual({ ok: true, utility: -utility as -3 | -2 | -1 | 1 | 2 | 3 });
    }
  });

  test("is invariant under a simultaneous seat rotation", () => {
    for (const { finishOrder, utility } of truthTable) {
      for (const rotation of [0, 1, 2, 3]) {
        expect(evaluateTeamUtility({
          perspectiveSeat: rotateSeat(0, rotation) as 0 | 1 | 2 | 3,
          finishOrder: rotateFinishOrder(finishOrder, rotation) as (0 | 1 | 2 | 3)[],
        })).toEqual({ ok: true, utility });
      }
    }
  });

  test("does not mutate input and is deterministic for repeated calls", () => {
    const finishOrder = [0, 2, 1, 3] as const;
    const before = [...finishOrder];
    const first = evaluateTeamUtility({ perspectiveSeat: 0, finishOrder });
    const second = evaluateTeamUtility({ perspectiveSeat: 0, finishOrder });

    expect(finishOrder).toEqual(before);
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  test.each([
    [4, "unknown-seat"],
    [0.5, "fractional-seat"],
    [Number.NaN, "unknown-seat"],
    [Number.POSITIVE_INFINITY, "unknown-seat"],
    [Number.MAX_SAFE_INTEGER + 1, "unsafe-integer-seat"],
    [-0, "negative-zero-seat"],
  ] as const)("returns the exact perspective-seat failure for %s", (perspectiveSeat, reason) => {
    expectFailure(
      evaluateTeamUtility({ perspectiveSeat: perspectiveSeat as never, finishOrder: [0, 1, 2, 3] }),
      { kind: "invalid-perspective-seat", reason },
    );
  });

  test.each([
    { finishOrder: [0, 1, 2], failure: { kind: "invalid-finish-order", reason: "missing-seat" } },
    { finishOrder: [0, 0, 1, 2], failure: { kind: "invalid-finish-order", reason: "duplicate-seat" } },
    { finishOrder: [0, 1, 2, 4], failure: { kind: "invalid-finish-order", reason: "unknown-seat" } },
    { finishOrder: [0, 1, 2, 0.5], failure: { kind: "invalid-finish-order", reason: "unknown-seat" } },
    { finishOrder: [0, 1, 2, -0], failure: { kind: "invalid-finish-order", reason: "unknown-seat" } },
  ] as const)("returns the exact finish-order failure for $finishOrder", ({ finishOrder, failure }) => {
    expectFailure(evaluateTeamUtility({ perspectiveSeat: 0, finishOrder: finishOrder as never }), failure);
  });

  test("rejects sparse, expanded, symbol-keyed and accessor arrays without throwing", () => {
    const sparse = [0, 1, 2] as (number | undefined)[];
    sparse.length = 4;
    const expanded = [0, 1, 2, 3] as number[] & { extra?: number };
    expanded.extra = 1;
    const symbolKeyed = [0, 1, 2, 3] as number[] & { [key: symbol]: number };
    symbolKeyed[Symbol("extra")] = 1;
    const accessor = [0, 1, 2, 3] as number[];
    Object.defineProperty(accessor, "0", { configurable: true, get: () => 0 });

    for (const finishOrder of [sparse, expanded, symbolKeyed, accessor]) {
      expectFailure(evaluateTeamUtility({ perspectiveSeat: 0, finishOrder: finishOrder as never }), {
        kind: "invalid-finish-order",
        reason: "missing-seat",
      });
    }
  });

  test("uses the captured array length when validating a proxied finish order", () => {
    const finishOrder = new Proxy([0, 2, 1, 3], {
      get(target, property, receiver) {
        return property === "length" ? 3 : Reflect.get(target, property, receiver);
      },
    });

    expect(evaluateTeamUtility({ perspectiveSeat: 0, finishOrder: finishOrder as never })).toEqual({ ok: true, utility: 3 });
  });

  test("does not read a validated leaf finish-order iterator", () => {
    let iteratorReads = 0;
    const finishOrder = new Proxy([2], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          iteratorReads += 1;
          throw new Error("finishOrder Symbol.iterator accessed");
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(evaluateNonTerminalLeaf({
      perspectiveSeat: 0,
      actingSeat: 1,
      finishOrder: finishOrder as never,
      handCounts: { 0: 3, 1: 1, 2: 0, 3: 2 },
    })).toEqual({ ok: true, predictedFinishOrder: [2, 1, 3, 0], utility: 1 });
    expect(iteratorReads).toBe(0);
  });

  test("uses set membership for dense plain-data array keys", () => {
    const values = Array.from({ length: 32 }, (_, index) => index);
    const originalIncludes = Array.prototype.includes;
    let ownKeyScanCalls = 0;
    Object.defineProperty(Array.prototype, "includes", {
      configurable: true,
      writable: true,
      value: function (this: unknown[], searchElement: unknown, fromIndex?: number): boolean {
        if (this.length === values.length + 1 && this[this.length - 1] === "length") ownKeyScanCalls += 1;
        return originalIncludes.call(this, searchElement, fromIndex);
      },
    });
    try {
      expect(isPlainDataArray(values)).toBe(true);
    } finally {
      Object.defineProperty(Array.prototype, "includes", {
        configurable: true,
        writable: true,
        value: originalIncludes,
      });
    }
    expect(ownKeyScanCalls).toBe(0);
  });

  test("rejects malformed envelopes and never invokes hostile getters or callbacks", () => {
    let getterCalls = 0;
    let callbackCalls = 0;
    const getterEnvelope = {} as { perspectiveSeat: number; finishOrder: readonly number[] };
    Object.defineProperty(getterEnvelope, "perspectiveSeat", {
      configurable: true,
      get: () => {
        getterCalls += 1;
        return 0;
      },
    });
    Object.defineProperty(getterEnvelope, "finishOrder", {
      configurable: true,
      get: () => {
        getterCalls += 1;
        return [0, 1, 2, 3];
      },
    });
    const callbackEnvelope = {
      perspectiveSeat: 0,
      finishOrder: [0, 1, 2, 3],
      callback: () => {
        callbackCalls += 1;
      },
    } as never;
    const inheritedEnvelope = Object.create({ perspectiveSeat: 0, finishOrder: [0, 1, 2, 3] }) as never;

    expect(() => evaluateTeamUtility(getterEnvelope as never)).not.toThrow();
    expect(() => evaluateTeamUtility(callbackEnvelope)).not.toThrow();
    expect(() => evaluateTeamUtility(inheritedEnvelope)).not.toThrow();
    expect(getterCalls).toBe(0);
    expect(callbackCalls).toBe(0);
    expectFailure(evaluateTeamUtility(getterEnvelope as never), { kind: "invalid-finish-order", reason: "unknown-seat" });
    expectFailure(evaluateTeamUtility(callbackEnvelope), { kind: "invalid-finish-order", reason: "unknown-seat" });
    expectFailure(evaluateTeamUtility(inheritedEnvelope), { kind: "invalid-finish-order", reason: "unknown-seat" });
    expect(getterCalls).toBe(0);
    expect(callbackCalls).toBe(0);
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
