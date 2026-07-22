import { describe, expect, it } from "vitest";
import {
  canonicalizeRoomRequestDescriptor,
  hashCanonicalRoomRequestDescriptor,
  InvalidCanonicalRoomDescriptorError,
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

  it("rejects top-level accessors without executing them", () => {
    let rankReads = 0;
    let seedReads = 0;
    let tributeReads = 0;
    const input = {} as Record<string, unknown>;
    Object.defineProperties(input, {
      rank: { enumerable: true, get: () => { rankReads += 1; return "2"; } },
      seed: { enumerable: true, get: () => { seedReads += 1; return 1; } },
      normalizedPendingTributeItems: { enumerable: true, get: () => { tributeReads += 1; return []; } },
    });

    expect(() => canonicalizeRoomRequestDescriptor(input)).toThrow(InvalidCanonicalRoomDescriptorError);
    expect(rankReads).toBe(0);
    expect(seedReads).toBe(0);
    expect(tributeReads).toBe(0);
  });

  it("rejects setter-only, non-enumerable, and legal-valued accessors", () => {
    const setterOnly = {} as Record<string, unknown>;
    Object.defineProperty(setterOnly, "rank", { enumerable: true, set: () => undefined });
    Object.defineProperty(setterOnly, "seed", { enumerable: true, value: 1 });
    expect(() => canonicalizeRoomRequestDescriptor(setterOnly)).toThrow(InvalidCanonicalRoomDescriptorError);

    const nonEnumerable = {} as Record<string, unknown>;
    Object.defineProperty(nonEnumerable, "rank", { enumerable: false, value: "2" });
    Object.defineProperty(nonEnumerable, "seed", { enumerable: true, value: 1 });
    expect(() => canonicalizeRoomRequestDescriptor(nonEnumerable)).toThrow(InvalidCanonicalRoomDescriptorError);

    let nestedPayerReads = 0;
    let nestedReceiverReads = 0;
    const item = {} as Record<string, unknown>;
    Object.defineProperties(item, {
      payer: { enumerable: true, get: () => { nestedPayerReads += 1; return 0; } },
      receiver: { enumerable: true, get: () => { nestedReceiverReads += 1; return 1; } },
    });
    const nested = { rank: "2", seed: 1, pendingTributeItems: [item] };
    expect(() => canonicalizeRoomRequestDescriptor(nested)).toThrow(InvalidCanonicalRoomDescriptorError);
    expect(nestedPayerReads).toBe(0);
    expect(nestedReceiverReads).toBe(0);

    let throwingGetterReads = 0;
    const throwing = {} as Record<string, unknown>;
    Object.defineProperties(throwing, {
      rank: { enumerable: true, get: () => { throwingGetterReads += 1; throw new Error("must not execute"); } },
      seed: { enumerable: true, value: 1 },
    });
    expect(() => canonicalizeRoomRequestDescriptor(throwing)).toThrow(InvalidCanonicalRoomDescriptorError);
    expect(throwingGetterReads).toBe(0);
  });

  it("accepts ordinary data properties with unchanged canonical hash", () => {
    const descriptor = { rank: "2" as const, seed: 1, pendingTributeItems: [] };
    const canonical = canonicalizeRoomRequestDescriptor(descriptor);
    expect(canonical).toEqual({ rank: "2", seed: 1, normalizedPendingTributeItems: [] });
    expect(hashCanonicalRoomRequestDescriptor(canonical)).toBe(
      hashCanonicalRoomRequestDescriptor(canonicalizeRoomRequestDescriptor(canonical)),
    );
  });
});
