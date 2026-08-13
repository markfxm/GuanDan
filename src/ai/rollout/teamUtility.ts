import type {
  TeamUtility,
  TeamUtilityFailure,
  TeamUtilityInput,
  TeamUtilityResult,
} from "./contracts";
import { getOwnDataProperty, isPlainDataArray, isPlainDataRecord } from "./plainData";
import type { PublicSeat } from "../../game/publicEvent";

const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];

export function evaluateTeamUtility(input: TeamUtilityInput): TeamUtilityResult {
  try {
    if (!isPlainDataRecord(input, ["perspectiveSeat", "finishOrder"], true)) {
      return failure({ kind: "invalid-finish-order", reason: "unknown-seat" });
    }

    const perspectiveSeat = getOwnDataProperty(input, "perspectiveSeat");
    const finishOrder = getOwnDataProperty(input, "finishOrder");
    const perspectiveFailure = invalidPerspectiveSeatFailure(perspectiveSeat);
    if (perspectiveFailure) return failure(perspectiveFailure);
    if (!isPlainDataArray(finishOrder)) return failure({ kind: "invalid-finish-order", reason: "missing-seat" });
    const finishOrderLength = getOwnDataProperty(finishOrder, "length") as number;
    if (finishOrderLength !== SEATS.length) return failure({ kind: "invalid-finish-order", reason: "missing-seat" });

    const seen = new Set<number>();
    const canonicalFinishOrder: PublicSeat[] = [];
    for (let index = 0; index < finishOrderLength; index += 1) {
      const value = getOwnDataProperty(finishOrder, String(index));
      if (!isCanonicalSeat(value)) return failure({ kind: "invalid-finish-order", reason: "unknown-seat" });
      if (seen.has(value)) return failure({ kind: "invalid-finish-order", reason: "duplicate-seat" });
      seen.add(value);
      canonicalFinishOrder.push(value);
    }
    if (seen.size !== SEATS.length) return failure({ kind: "invalid-finish-order", reason: "missing-seat" });

    const canonicalPerspectiveSeat = perspectiveSeat as PublicSeat;
    const teamSeats = [canonicalPerspectiveSeat, partnerSeat(canonicalPerspectiveSeat)] as const;
    const places = teamSeats.map((seat) => canonicalFinishOrder.indexOf(seat) + 1).sort((left, right) => left - right);
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

function failure(failure: TeamUtilityFailure): TeamUtilityResult {
  return freezeResult({ ok: false, failure });
}

function freezeResult<T extends TeamUtilityResult>(result: T): T {
  if (!Object.isFrozen(result)) Object.freeze(result);
  if (result.ok === false) Object.freeze(result.failure);
  return result;
}
