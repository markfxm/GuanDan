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
  if (!isRecord(input)) throw new Error("DESCRIPTOR_INVALID");
  if ("sessionIdentity" in input || "gameSequence" in input) throw new Error("DESCRIPTOR_FORBIDDEN_FIELD");
  if (!isGameRank(input.rank) || !Number.isSafeInteger(input.seed)) throw new Error("DESCRIPTOR_INVALID");
  const rawItems = input.pendingTributeItems ?? [];
  if (!Array.isArray(rawItems)) throw new Error("DESCRIPTOR_INVALID");
  const normalizedPendingTributeItems = rawItems.map((item) => {
    if (!isRecord(item) || !isSeat(item.payer) || !isSeat(item.receiver)) throw new Error("DESCRIPTOR_INVALID");
    return Object.freeze({ payer: item.payer, receiver: item.receiver });
  }).sort((left, right) => left.payer - right.payer || left.receiver - right.receiver);
  return Object.freeze({ rank: input.rank, seed: input.seed, normalizedPendingTributeItems: Object.freeze(normalizedPendingTributeItems) });
}

export function hashCanonicalRoomRequestDescriptor(descriptor: CanonicalRoomRequestDescriptor): string {
  const canonical = canonicalizeRoomRequestDescriptor({
    rank: descriptor.rank,
    seed: descriptor.seed,
    pendingTributeItems: descriptor.normalizedPendingTributeItems,
  });
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

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
