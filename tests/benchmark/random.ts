import { createHash } from "node:crypto";
import type { Seat } from "../../src/game/room";

export const RANDOM_ALGORITHM_VERSION = "seat-local-xorshift-v2";
export const STRATEGY_SEED_DERIVATION_VERSION = "match-id-xorshift-v1";
export const CANDIDATE_ORDERING_VERSION = "legal-candidates-v1";
export const DECISION_INDEX_SEMANTICS = "seat-local-decide-count-v1";

export function deriveRuntimeId(matchId: string, seat: Seat): string {
  return sha256(`${matchId}:runtime:${seat}`);
}

export function deriveStrategySeed(matchId: string, seat: Seat): string {
  return sha256(`${deriveRuntimeId(matchId, seat)}:strategy-seed`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
