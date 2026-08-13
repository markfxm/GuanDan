import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPublicGameIdentity, type PublicGameIdentity } from "../../src/game/publicEvent";
import { createPublicIdentityProvider, type PublicIdentityProvider } from "../../src/server/publicIdentityProvider";
import type { PublicIdentityAllocation } from "../../src/server/publicIdentityStore";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore";
import { buildApi } from "../../src/server/api";
import { createRoom as createGameRoom } from "../../src/game/room";

const INSTALLATION_IDENTITY = "00000000-0000-4000-8000-000000000001";

type Registry = ReadonlyMap<string, {
  publicIdentity?: PublicGameIdentity;
  publicLedger?: { nextEventIndex: number; gameId: string };
}>;

function createHarness(provider?: PublicIdentityProvider, createRoom?: unknown, directory = mkdtempSync(join(tmpdir(), "d2a1-api-canonical-"))) {
  const store = new PublicIdentityStore(join(directory, "identity.sqlite"), { installationIdentity: INSTALLATION_IDENTITY });
  const actualProvider = provider ?? createPublicIdentityProvider(store);
  let registry: Registry | undefined;
  const app = (buildApi as unknown as (p: PublicIdentityProvider, options?: unknown) => ReturnType<typeof buildApi>)(actualProvider, {
    onRoomRegistry: (rooms: Registry) => { registry = rooms; },
    ...(createRoom === undefined ? {} : { createRoom }),
  });
  return {
    app,
    store,
    provider: actualProvider,
    storeOwnedByProvider: provider === undefined,
    directory,
    get registry(): Registry {
      if (registry === undefined) throw new Error("TEST_REGISTRY_NOT_READY");
      return registry;
    },
  };
}

async function closeHarness(harness: ReturnType<typeof createHarness>): Promise<void> {
  await harness.app.close();
  harness.provider.close();
  if (!harness.storeOwnedByProvider) harness.store.close();
  rmSync(harness.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function headers(key = "room-1") {
  return { "Idempotency-Key": key };
}

describe("canonical production room creation", () => {
  const harnesses: Array<ReturnType<typeof createHarness>> = [];
  afterEach(async () => {
    while (harnesses.length > 0) await closeHarness(harnesses.pop()!);
  });

  function harness(provider?: PublicIdentityProvider, createRoom?: unknown, directory?: string) {
    const value = createHarness(provider, createRoom, directory);
    harnesses.push(value);
    return value;
  }

  it("requires an injected provider instead of enabling an implicit route", () => {
    expect(() => (buildApi as unknown as (provider: undefined) => unknown)(undefined)).toThrow("PUBLIC_IDENTITY_PROVIDER_REQUIRED");
  });

  it.each([undefined, "", "bad key/space", "é"]) ("rejects missing or malformed Idempotency-Key %#", async (key) => {
    const h = harness();
    const response = await h.app.inject({ method: "POST", url: "/api/rooms", headers: key === undefined ? {} : { "Idempotency-Key": key }, payload: { rank: "10", seed: 1 } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "INVALID_ROOM_CREATION_REQUEST" });
  });

  it("creates a canonical private room with a non-empty ledger while preserving PublicRoom shape", async () => {
    const h = harness();
    const response = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers(), payload: { rank: "10", seed: 1 } });
    expect(response.statusCode).toBe(200);
    const publicRoom = response.json().room;
    expect(publicRoom).not.toHaveProperty("publicIdentity");
    expect(publicRoom).not.toHaveProperty("publicLedger");
    expect(publicRoom).not.toHaveProperty("publicEvents");
    const privateRoom = h.registry.get(publicRoom.id);
    expect(privateRoom?.publicIdentity?.gameId).toMatch(/^[0-9a-f]{64}$/);
    expect(privateRoom?.publicLedger?.gameId).toBe(privateRoom?.publicIdentity?.gameId);
  });

  it("returns the same room without repeating room creation or commit side effects", async () => {
    let committed = false;
    const identity = buildPublicGameIdentity("b".repeat(64), 0, 0, "production-session");
    const allocation = (): PublicIdentityAllocation => ({
      status: committed ? "idempotent" : "new",
      lifecycle: committed ? "room-committed" : "allocated",
      descriptorHash: "descriptor-hash",
      gameSequence: "1",
      publicIdentity: identity,
    });
    const allocate = vi.fn(allocation);
    const markRoomCommitted = vi.fn(() => {
      committed = true;
      return allocation();
    });
    const provider: PublicIdentityProvider = { allocate, markRoomCommitted, markAllocated: vi.fn(() => { throw new Error("MARK_ALLOCATED_NOT_USED"); }), close: vi.fn() };
    const createRoom = vi.fn((input: Parameters<typeof createGameRoom>[0]) => createGameRoom(input));
    const h = harness(provider, createRoom);
    const first = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("retry"), payload: { rank: "10", seed: 1 } });
    const second = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("retry"), payload: { rank: "10", seed: 1 } });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().room.id).toBe(first.json().room.id);
    expect(allocate).toHaveBeenCalledTimes(2);
    expect(createRoom).toHaveBeenCalledTimes(1);
    expect(markRoomCommitted).toHaveBeenCalledTimes(1);
    expect(h.registry.size).toBe(1);
  });

  it("maps same-key different-descriptor to 409 without a second room", async () => {
    const h = harness();
    await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("conflict"), payload: { rank: "10", seed: 1 } });
    const response = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("conflict"), payload: { rank: "10", seed: 2 } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "IDEMPOTENCY_CONFLICT" });
    expect(h.registry.size).toBe(1);
  });

  it.each([
    ["publicIdentity", { publicIdentity: { gameId: "forbidden" } }],
    ["gameSequence", { gameSequence: 99 }],
    ["multiple identity fields", { publicIdentity: {}, gameSequence: 99, sessionIdentity: "forbidden" }],
    ["unknown field", { unknownField: true }],
  ])("rejects %s without provider, room, or allocation side effects", async (_label, extra) => {
    const allocate = vi.fn<PublicIdentityProvider["allocate"]>();
    const identity = buildPublicGameIdentity("a".repeat(64), 0, 0, "production-session");
    allocate.mockReturnValue({ status: "new", lifecycle: "allocated", descriptorHash: "hash", gameSequence: "1", publicIdentity: identity });
    const provider: PublicIdentityProvider = { allocate, markRoomCommitted: vi.fn(), markAllocated: () => { throw new Error("MARK_ALLOCATED_NOT_USED"); }, close: vi.fn() };
    const createRoom = vi.fn();
    const h = harness(provider, createRoom);
    const response = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("opaque"), payload: { rank: "10", seed: 1, ...extra } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "INVALID_CREATE_ROOM_REQUEST" });
    expect(allocate).not.toHaveBeenCalled();
    expect(createRoom).not.toHaveBeenCalled();
    expect(h.registry.size).toBe(0);
    expect(h.store.getAllocationByIdempotencyKey("opaque")).toBeUndefined();
  });

  it("accepts the allow-listed room body fields", async () => {
    const h = harness();
    const response = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("allowed"), payload: { rank: "10", seed: 1, pendingTributeItems: [] } });
    expect(response.statusCode).toBe(200);
  });

  it.each([
    ["busy", { code: "IDENTITY_STORE_BUSY" }, 503, "IDENTITY_STORE_BUSY"],
    ["unknown", new Error("secret sqlite path"), 500, "ROOM_CREATION_FAILED"],
  ])("maps provider failures safely (%s)", async (_label, error, status, publicCode) => {
    const provider: PublicIdentityProvider = {
      allocate: vi.fn(() => { throw error; }),
      markRoomCommitted: vi.fn(),
      markAllocated: () => { throw new Error("MARK_ALLOCATED_NOT_USED"); },
      close: vi.fn(),
    };
    const h = harness(provider);
    const response = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("error"), payload: { rank: "10", seed: 1 } });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: publicCode });
    expect(response.json()).not.toHaveProperty("stack");
    expect(response.json()).not.toHaveProperty("databasePath");
  });

  it("keeps an allocated identity retryable when room creation fails", async () => {
    let fail = true;
    const createRoom = vi.fn((input: Parameters<typeof createGameRoom>[0]) => {
      if (fail) throw new Error("room creation failed");
      return createGameRoom(input);
    });
    const h = harness(undefined, createRoom);
    const first = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("room-failure"), payload: { rank: "10", seed: 1 } });
    expect(first.statusCode).toBe(500);
    expect(h.registry.size).toBe(0);
    fail = false;
    const second = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("room-failure"), payload: { rank: "10", seed: 1 } });
    expect(second.statusCode).toBe(200);
    expect(createRoom).toHaveBeenCalledTimes(2);
  });

  it("rolls back maps when commit fails and retries the same allocation", async () => {
    let commitAttempts = 0;
    const identity = buildPublicGameIdentity("c".repeat(64), 0, 0, "production-session");
    const provider: PublicIdentityProvider = {
      allocate: vi.fn(({ idempotencyKey }): PublicIdentityAllocation => ({ status: commitAttempts === 0 ? "new" : "idempotent", lifecycle: "allocated", descriptorHash: idempotencyKey, gameSequence: "1", publicIdentity: identity })),
      markRoomCommitted: vi.fn((): PublicIdentityAllocation => {
        commitAttempts += 1;
        if (commitAttempts === 1) throw new Error("commit failed");
        return { status: "new", lifecycle: "room-committed", descriptorHash: "commit", gameSequence: "1", publicIdentity: identity };
      }),
      markAllocated: vi.fn(() => { throw new Error("MARK_ALLOCATED_NOT_USED"); }),
      close: vi.fn(),
    };
    const createRoom = vi.fn((input: Parameters<typeof createGameRoom>[0]) => createGameRoom(input));
    const h = harness(provider, createRoom);
    const first = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("commit-failure"), payload: { rank: "10", seed: 1 } });
    expect(first.statusCode).toBe(500);
    expect(h.registry.size).toBe(0);
    const second = await h.app.inject({ method: "POST", url: "/api/rooms", headers: headers("commit-failure"), payload: { rank: "10", seed: 1 } });
    expect(second.statusCode).toBe(200);
    expect(h.registry.size).toBe(1);
    expect(createRoom).toHaveBeenCalledTimes(2);
  });

  it("returns 410 for room-committed allocation missing after restart", async () => {
    const first = harness();
    const created = await first.app.inject({ method: "POST", url: "/api/rooms", headers: headers("restart"), payload: { rank: "10", seed: 1 } });
    expect(created.statusCode).toBe(200);
    await first.app.close();
    first.provider.close();
    harnesses.splice(harnesses.indexOf(first), 1);
    const second = harness(undefined, undefined, first.directory);
    const response = await second.app.inject({ method: "POST", url: "/api/rooms", headers: headers("restart"), payload: { rank: "10", seed: 1 } });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toEqual({ error: "ROOM_STATE_UNAVAILABLE_AFTER_RESTART" });
    expect(second.registry.size).toBe(0);
  });
});
