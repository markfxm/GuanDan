import { evaluateTeamUtility } from "./teamUtility";
import type {
  LeafEvaluationFailure,
  LeafEvaluationInput,
  LeafEvaluationResult,
} from "./contracts";
import { getOwnDataProperty, isDataDescriptor, isPlainDataArray, isPlainDataRecord } from "./plainData";
import type { PublicSeat } from "../../game/publicEvent";

const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];
const LEAF_INPUT_KEYS = ["perspectiveSeat", "actingSeat", "finishOrder", "handCounts"] as const;
const HAND_COUNT_KEYS = ["0", "1", "2", "3"] as const;

export function evaluateNonTerminalLeaf(input: LeafEvaluationInput): LeafEvaluationResult {
  try {
    if (!isPlainDataRecord(input, LEAF_INPUT_KEYS, true)) {
      return failure({ kind: "invalid-leaf-state", reason: "unknown-seat" });
    }

    const perspectiveSeat = getOwnDataProperty(input, "perspectiveSeat");
    const actingSeat = getOwnDataProperty(input, "actingSeat");
    const finishOrder = getOwnDataProperty(input, "finishOrder");
    const handCounts = getOwnDataProperty(input, "handCounts");

    const perspectiveFailure = invalidSeatFailure(perspectiveSeat, "invalid-perspective-seat");
    if (perspectiveFailure) return failure(perspectiveFailure);
    const actingFailure = invalidSeatFailure(actingSeat, "invalid-acting-seat");
    if (actingFailure) return failure(actingFailure);
    if (!isPlainDataArray(finishOrder)) return failure({ kind: "invalid-leaf-state", reason: "duplicate-finish" });
    const finishOrderLength = getOwnDataProperty(finishOrder, "length") as number;
    if (finishOrderLength === 4) return failure({ kind: "invalid-leaf-state", reason: "terminal-state" });
    if (finishOrderLength > 4) return failure({ kind: "invalid-leaf-state", reason: "duplicate-finish" });

    const seen = new Set<PublicSeat>();
    const canonicalFinishOrder: PublicSeat[] = [];
    for (let index = 0; index < finishOrderLength; index += 1) {
      const value = getOwnDataProperty(finishOrder, String(index));
      if (!isCanonicalSeat(value)) return failure({ kind: "invalid-leaf-state", reason: "unknown-seat" });
      if (seen.has(value)) return failure({ kind: "invalid-leaf-state", reason: "duplicate-finish" });
      seen.add(value);
      canonicalFinishOrder.push(value);
    }
    const canonicalActingSeat = actingSeat as PublicSeat;
    if (seen.has(canonicalActingSeat)) return failure({ kind: "invalid-acting-seat", reason: "finished-seat" });

    const handCountShapeFailure = validateHandCountShape(handCounts);
    if (handCountShapeFailure) return failure(handCountShapeFailure);

    const counts = {} as Record<PublicSeat, number>;
    for (const seat of SEATS) {
      const count = getOwnDataProperty(handCounts as Record<string, unknown>, String(seat));
      const countFailure = validateHandCount(count, seen.has(seat));
      if (countFailure) return failure(countFailure);
      counts[seat] = count as number;
    }
    if (counts[canonicalActingSeat] === 0) return failure({ kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" });

    const unfinished = SEATS.filter((seat) => !seen.has(seat));
    unfinished.sort((left, right) => {
      const countDifference = counts[left] - counts[right];
      if (countDifference !== 0) return countDifference;
      return clockwiseDistance(left, canonicalActingSeat) - clockwiseDistance(right, canonicalActingSeat);
    });

    const predictedFinishOrder = Object.freeze([...canonicalFinishOrder, ...unfinished]) as readonly PublicSeat[];
    const utilityResult = evaluateTeamUtility({ perspectiveSeat: perspectiveSeat as PublicSeat, finishOrder: predictedFinishOrder });
    if (!utilityResult.ok) return failure(mapUtilityFailure(utilityResult.failure));
    return Object.freeze({ ok: true, predictedFinishOrder, utility: utilityResult.utility });
  } catch {
    return failure({ kind: "invalid-leaf-state", reason: "unknown-seat" });
  }
}

function validateHandCount(value: unknown, finished: boolean): Extract<LeafEvaluationFailure, { kind: "invalid-leaf-state" }> | undefined {
  if (Object.is(value, -0)) return { kind: "invalid-leaf-state", reason: "negative-zero-hand-count" };
  if (typeof value !== "number" || !Number.isFinite(value)) return { kind: "invalid-leaf-state", reason: "non-finite-hand-count" };
  if (value < 0) return { kind: "invalid-leaf-state", reason: "negative-hand-count" };
  if (!Number.isInteger(value)) return { kind: "invalid-leaf-state", reason: "fractional-hand-count" };
  if (!Number.isSafeInteger(value)) return { kind: "invalid-leaf-state", reason: "unsafe-hand-count" };
  if (finished && value !== 0) return { kind: "invalid-leaf-state", reason: "finish-hand-count-mismatch" };
  if (!finished && value === 0) return { kind: "invalid-leaf-state", reason: "unfinished-zero-hand-count" };
  return undefined;
}

function validateHandCountShape(value: unknown): Extract<LeafEvaluationFailure, { kind: "invalid-leaf-state" }> | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { kind: "invalid-leaf-state", reason: "unknown-hand-count" };
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return { kind: "invalid-leaf-state", reason: "unknown-hand-count" };
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || !HAND_COUNT_KEYS.includes(key as typeof HAND_COUNT_KEYS[number]))) {
      return { kind: "invalid-leaf-state", reason: "unknown-hand-count" };
    }
    if (HAND_COUNT_KEYS.some((key) => !ownKeys.includes(key))) return { kind: "invalid-leaf-state", reason: "missing-hand-count" };
    if (!ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)))) {
      return { kind: "invalid-leaf-state", reason: "unknown-hand-count" };
    }
    return undefined;
  } catch {
    return { kind: "invalid-leaf-state", reason: "unknown-hand-count" };
  }
}

function clockwiseDistance(seat: PublicSeat, actingSeat: PublicSeat): number {
  return (seat - actingSeat + 4) % 4;
}

function invalidSeatFailure(
  value: unknown,
  kind: "invalid-perspective-seat" | "invalid-acting-seat",
): Extract<LeafEvaluationFailure, { kind: "invalid-perspective-seat" }> | Extract<LeafEvaluationFailure, { kind: "invalid-acting-seat" }> | undefined {
  if (isCanonicalSeat(value)) return undefined;
  const reason = Object.is(value, -0)
    ? "negative-zero-seat"
    : typeof value !== "number" || !Number.isFinite(value)
      ? "unknown-seat"
      : !Number.isInteger(value)
        ? "fractional-seat"
        : !Number.isSafeInteger(value)
          ? "unsafe-integer-seat"
          : "unknown-seat";
  return kind === "invalid-perspective-seat"
    ? { kind, reason }
    : { kind, reason };
}

function mapUtilityFailure(failure: { kind: string }): LeafEvaluationFailure {
  if (failure.kind === "invalid-perspective-seat") return failure as LeafEvaluationFailure;
  if (failure.kind === "invalid-finish-order") return { kind: "invalid-leaf-state", reason: "unknown-seat" };
  return { kind: "invalid-leaf-state", reason: "unknown-seat" };
}

function isCanonicalSeat(value: unknown): value is PublicSeat {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && (value === 0 || value === 1 || value === 2 || value === 3);
}

function failure(failure: LeafEvaluationFailure): LeafEvaluationResult {
  const frozenFailure = Object.freeze(failure);
  return Object.freeze({ ok: false, failure: frozenFailure });
}
