import { sha256Bytes } from "../game/publicEventHash";
import { RANKS, type GameRank } from "../engine/cards";

export type CanonicalTributeItem = Readonly<{
  payer: 0 | 1 | 2 | 3;
  receiver: 0 | 1 | 2 | 3;
}>;

export type CanonicalRoomRequestDescriptor = Readonly<{
  rank: GameRank;
  seed: number;
  normalizedPendingTributeItems: readonly CanonicalTributeItem[];
}>;

export type CanonicalRoomRequestInput = Readonly<{
  rank: GameRank;
  seed: number;
  pendingTributeItems?: readonly CanonicalTributeItem[];
}>;

export function canonicalizeRoomRequestDescriptor(input: unknown): CanonicalRoomRequestDescriptor {
  if (!isPlainRecord(input)) throw new Error("DESCRIPTOR_INVALID");
  if ("sessionIdentity" in input || "gameSequence" in input) throw new Error("DESCRIPTOR_FORBIDDEN_FIELD");
  assertAllowedKeys(input, ["rank", "seed", "pendingTributeItems", "normalizedPendingTributeItems"]);
  if (!hasOwn(input, "rank") || !hasOwn(input, "seed")) throw new Error("DESCRIPTOR_INVALID");
  if (!isGameRank(input.rank) || !Number.isSafeInteger(input.seed)) throw new Error("DESCRIPTOR_INVALID");
  const hasPendingItems = hasOwn(input, "pendingTributeItems");
  const hasNormalizedItems = hasOwn(input, "normalizedPendingTributeItems");
  if (hasPendingItems && hasNormalizedItems) throw new Error("DESCRIPTOR_INVALID");
  const rawItems = hasPendingItems ? input.pendingTributeItems : hasNormalizedItems ? input.normalizedPendingTributeItems : [];
  if (!Array.isArray(rawItems)) throw new Error("DESCRIPTOR_INVALID");
  const normalizedPendingTributeItems = rawItems.map((item) => {
    if (!isPlainRecord(item)) throw new Error("DESCRIPTOR_INVALID");
    assertAllowedKeys(item, ["payer", "receiver"]);
    if (!hasOwn(item, "payer") || !hasOwn(item, "receiver") || !isSeat(item.payer) || !isSeat(item.receiver)) throw new Error("DESCRIPTOR_INVALID");
    return Object.freeze({ payer: item.payer, receiver: item.receiver });
  }).sort((left, right) => left.payer - right.payer || left.receiver - right.receiver);
  return Object.freeze({ rank: input.rank, seed: input.seed, normalizedPendingTributeItems: Object.freeze(normalizedPendingTributeItems) });
}

export function hashCanonicalRoomRequestDescriptor(descriptor: CanonicalRoomRequestDescriptor): string {
  const canonical = canonicalizeRoomRequestDescriptor(descriptor);
  const bytes = new TextEncoder().encode(JSON.stringify({
    rank: canonical.rank,
    seed: canonical.seed,
    normalizedPendingTributeItems: canonical.normalizedPendingTributeItems.map(({ payer, receiver }) => ({ payer, receiver })),
  }));
  return sha256Bytes(bytes);
}

export function validateIdempotencyKey(value: unknown): string {
  if (value === undefined || value === null) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9._~:-]+$/.test(value)) {
    throw new Error("IDEMPOTENCY_KEY_INVALID");
  }
  return value;
}

function isGameRank(value: unknown): value is GameRank {
  return typeof value === "string" && (RANKS as readonly string[]).includes(value);
}

function isSeat(value: unknown): value is CanonicalTributeItem["payer"] {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedSet.has(key)) throw new Error("DESCRIPTOR_UNKNOWN_FIELD");
  }
  for (const key in value) {
    if (!allowedSet.has(key)) throw new Error("DESCRIPTOR_UNKNOWN_FIELD");
  }
}
