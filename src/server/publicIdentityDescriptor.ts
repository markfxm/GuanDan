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

export class InvalidCanonicalRoomDescriptorError extends Error {
  readonly code = "INVALID_CANONICAL_ROOM_DESCRIPTOR" as const;

  constructor(reason: string = "DESCRIPTOR_INVALID") {
    super(reason);
    this.name = "InvalidCanonicalRoomDescriptorError";
  }
}

export function canonicalizeRoomRequestDescriptor(input: unknown): CanonicalRoomRequestDescriptor {
  try {
    return canonicalizeRoomRequestDescriptorUnchecked(input);
  } catch (error) {
    if (error instanceof InvalidCanonicalRoomDescriptorError) throw error;
    throw new InvalidCanonicalRoomDescriptorError();
  }
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

function canonicalizeRoomRequestDescriptorUnchecked(input: unknown): CanonicalRoomRequestDescriptor {
  if (!isPlainRecord(input)) invalid("DESCRIPTOR_INVALID");
  const rawInputDescriptors = Object.getOwnPropertyDescriptors(input);
  if ("sessionIdentity" in rawInputDescriptors || "gameSequence" in rawInputDescriptors) invalid("DESCRIPTOR_FORBIDDEN_FIELD");
  const inputDescriptors = assertAllowedKeys(input, ["rank", "seed", "pendingTributeItems", "normalizedPendingTributeItems"]);
  if (!("rank" in inputDescriptors) || !("seed" in inputDescriptors)) invalid("DESCRIPTOR_INVALID");
  const rank = inputDescriptors.rank.value;
  const seed = inputDescriptors.seed.value;
  if (!isGameRank(rank) || !Number.isSafeInteger(seed)) invalid("DESCRIPTOR_INVALID");
  const hasPendingItems = "pendingTributeItems" in inputDescriptors;
  const hasNormalizedItems = "normalizedPendingTributeItems" in inputDescriptors;
  if (hasPendingItems && hasNormalizedItems) invalid("DESCRIPTOR_INVALID");
  const rawItems = hasPendingItems ? inputDescriptors.pendingTributeItems.value : hasNormalizedItems ? inputDescriptors.normalizedPendingTributeItems.value : [];
  if (!Array.isArray(rawItems)) invalid("DESCRIPTOR_INVALID");
  const normalizedPendingTributeItems = rawItems.map((item) => {
    if (!isPlainRecord(item)) invalid("DESCRIPTOR_INVALID");
    const itemDescriptors = assertAllowedKeys(item, ["payer", "receiver"]);
    if (!("payer" in itemDescriptors) || !("receiver" in itemDescriptors)) invalid("DESCRIPTOR_INVALID");
    const payer = itemDescriptors.payer.value;
    const receiver = itemDescriptors.receiver.value;
    if (!isSeat(payer) || !isSeat(receiver)) invalid("DESCRIPTOR_INVALID");
    return Object.freeze({ payer, receiver });
  }).sort((left, right) => left.payer - right.payer || left.receiver - right.receiver);
  return Object.freeze({ rank, seed, normalizedPendingTributeItems: Object.freeze(normalizedPendingTributeItems) });
}

function invalid(reason: string): never {
  throw new InvalidCanonicalRoomDescriptorError(reason);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): Record<string, PropertyDescriptor> {
  const allowedSet = new Set(allowed);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowedSet.has(key)) invalid("DESCRIPTOR_UNKNOWN_FIELD");
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined || !("value" in descriptor)) {
      invalid("DESCRIPTOR_INVALID");
    }
  }
  return descriptors;
}
