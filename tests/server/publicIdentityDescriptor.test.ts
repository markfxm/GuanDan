import { describe, expect, it } from "vitest";
import {
  canonicalizeRoomRequestDescriptor,
  hashCanonicalRoomRequestDescriptor,
  validateIdempotencyKey,
} from "../../src/server/publicIdentityDescriptor";

describe("CanonicalRoomRequestDescriptor", () => {
  it("sorts pending tribute items and produces a stable descriptor hash", () => {
    const left = canonicalizeRoomRequestDescriptor({
      rank: "10",
      seed: 17,
      pendingTributeItems: [
        { payer: 2, receiver: 3 },
        { payer: 0, receiver: 1 },
      ],
    });
    const right = canonicalizeRoomRequestDescriptor({
      rank: "10",
      seed: 17,
      pendingTributeItems: [
        { payer: 0, receiver: 1 },
        { payer: 2, receiver: 3 },
      ],
    });

    expect(left).toEqual(right);
    expect(hashCanonicalRoomRequestDescriptor(left)).toBe(hashCanonicalRoomRequestDescriptor(right));
    expect(left.normalizedPendingTributeItems).toEqual([
      { payer: 0, receiver: 1 },
      { payer: 2, receiver: 3 },
    ]);
  });

  it("rejects caller supplied identity and sequence fields", () => {
    expect(() => canonicalizeRoomRequestDescriptor({
      rank: "2",
      seed: 1,
      pendingTributeItems: [],
      sessionIdentity: "caller-controlled",
    } as never)).toThrow("DESCRIPTOR_FORBIDDEN_FIELD");
    expect(() => canonicalizeRoomRequestDescriptor({
      rank: "2",
      seed: 1,
      pendingTributeItems: [],
      gameSequence: "7",
    } as never)).toThrow("DESCRIPTOR_FORBIDDEN_FIELD");
  });

  it("validates the Idempotency-Key contract", () => {
    expect(validateIdempotencyKey("create-001")).toBe("create-001");
    expect(() => validateIdempotencyKey(undefined)).toThrow("IDEMPOTENCY_KEY_REQUIRED");
    expect(() => validateIdempotencyKey(" key ")).toThrow("IDEMPOTENCY_KEY_INVALID");
    expect(() => validateIdempotencyKey("a".repeat(129))).toThrow("IDEMPOTENCY_KEY_INVALID");
    expect(() => validateIdempotencyKey("with/slash")).toThrow("IDEMPOTENCY_KEY_INVALID");
  });

  it("rejects unknown, inherited, symbol, and non-plain descriptor fields without mutating input", () => {
    expect(() => canonicalizeRoomRequestDescriptor({ rank: "2", seed: 1, pendingTributeItems: [], unexpected: true } as never)).toThrow("DESCRIPTOR_UNKNOWN_FIELD");
    expect(() => canonicalizeRoomRequestDescriptor({ rank: "2", seed: 1, pendingTributeItems: [{ payer: 0, receiver: 1, unexpected: true }] } as never)).toThrow("DESCRIPTOR_UNKNOWN_FIELD");

    const inherited = Object.create({ unexpected: true }) as Record<string, unknown>;
    inherited.rank = "2";
    inherited.seed = 1;
    inherited.pendingTributeItems = [];
    expect(() => canonicalizeRoomRequestDescriptor(inherited)).toThrow();

    const symbol = Symbol("unexpected");
    expect(() => canonicalizeRoomRequestDescriptor(Object.assign({ rank: "2", seed: 1, pendingTributeItems: [] }, { [symbol]: true }) as never)).toThrow("DESCRIPTOR_UNKNOWN_FIELD");
    expect(() => canonicalizeRoomRequestDescriptor([])).toThrow("DESCRIPTOR_INVALID");

    const items = [{ payer: 2 as const, receiver: 3 as const }, { payer: 0 as const, receiver: 1 as const }];
    const input = { rank: "2" as const, seed: 1, pendingTributeItems: items };
    const before = JSON.stringify(input);
    canonicalizeRoomRequestDescriptor(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
