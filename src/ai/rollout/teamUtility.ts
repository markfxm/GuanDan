import type {
  TeamUtility,
  TeamUtilityFailure,
  TeamUtilityInput,
  TeamUtilityResult,
} from "./contracts";
import type { PublicSeat } from "../../game/publicEvent";

const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];

export function evaluateTeamUtility(input: TeamUtilityInput): TeamUtilityResult {
  try {
    if (!isPlainDataRecord(input, ["perspectiveSeat", "finishOrder"], true)) {
      return failure({ kind: "invalid-finish-order", reason: "unknown-seat" });
    }

    const perspectiveSeat = getDataProperty(input, "perspectiveSeat");
    const finishOrder = getDataProperty(input, "finishOrder");
    const perspectiveFailure = invalidPerspectiveSeatFailure(perspectiveSeat);
    if (perspectiveFailure) return failure(perspectiveFailure);
    if (!isPlainDataArray(finishOrder)) return failure({ kind: "invalid-finish-order", reason: "missing-seat" });
    if (finishOrder.length !== SEATS.length) return failure({ kind: "invalid-finish-order", reason: "missing-seat" });

    const seen = new Set<number>();
    for (const value of finishOrder) {
      if (!isCanonicalSeat(value)) return failure({ kind: "invalid-finish-order", reason: "unknown-seat" });
      if (seen.has(value)) return failure({ kind: "invalid-finish-order", reason: "duplicate-seat" });
      seen.add(value);
    }
    if (seen.size !== SEATS.length) return failure({ kind: "invalid-finish-order", reason: "missing-seat" });

    const canonicalPerspectiveSeat = perspectiveSeat as PublicSeat;
    const teamSeats = [canonicalPerspectiveSeat, partnerSeat(canonicalPerspectiveSeat)] as const;
    const places = teamSeats.map((seat) => finishOrder.indexOf(seat) + 1).sort((left, right) => left - right);
    const utility = utilityForPlaces(places[0]!, places[1]!);
    if (utility === undefined) return failure({ kind: "unsupported-team-pair", teamSeats });
    return freezeResult({ ok: true, utility });
  } catch {
    return failure({ kind: "invalid-finish-order", reason: "unknown-seat" });
  }
}

function utilityForPlaces(first: number, second: number): TeamUtility | undefined {
  const key = `${first},${second}`;
  const table: Readonly<Record<string, TeamUtility>> = {
    "1,2": 3,
    "1,3": 2,
    "1,4": 1,
    "2,3": -1,
    "2,4": -2,
    "3,4": -3,
  };
  return table[key];
}

function partnerSeat(seat: PublicSeat): PublicSeat {
  return ((seat + 2) % 4) as PublicSeat;
}

function isCanonicalSeat(value: unknown): value is PublicSeat {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && !Object.is(value, -0)
    && (value === 0 || value === 1 || value === 2 || value === 3);
}

function invalidPerspectiveSeatFailure(value: unknown): Extract<TeamUtilityFailure, { kind: "invalid-perspective-seat" }> | undefined {
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
  return { kind: "invalid-perspective-seat", reason };
}

function isPlainDataRecord(value: unknown, keys: readonly string[], exact: boolean): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) return false;
    if (exact && (ownKeys.length !== keys.length || keys.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!isDataDescriptor(lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== value.length + 1 || !ownKeys.includes("length")) return false;
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      if (!ownKeys.includes(key) || !isDataDescriptor(Object.getOwnPropertyDescriptor(value, key))) return false;
    }
    return ownKeys.every((key) => key === "length" || (typeof key === "string" && /^0$|^[1-9]\d*$/.test(key) && Number(key) < value.length));
  } catch {
    return false;
  }
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function getDataProperty(value: Record<string, unknown>, key: string): unknown {
  return (Object.getOwnPropertyDescriptor(value, key) as PropertyDescriptor & { value: unknown }).value;
}

function failure(failure: TeamUtilityFailure): TeamUtilityResult {
  return freezeResult({ ok: false, failure });
}

function freezeResult<T extends TeamUtilityResult>(result: T): T {
  if (!Object.isFrozen(result)) Object.freeze(result);
  if (result.ok === false) Object.freeze(result.failure);
  return result;
}
