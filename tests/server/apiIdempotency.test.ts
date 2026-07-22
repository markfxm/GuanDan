import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rebuildPublicLedger, type PublicLedgerReplayDocument } from "../../src/game/publicEventReplay";
import { buildApi } from "../../src/server/api";
import { createPublicIdentityProvider } from "../../src/server/publicIdentityProvider";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore";
import type { RoomState } from "../../src/game/room";

const INSTALLATION_IDENTITY = "00000000-0000-4000-8000-000000000001";
const descriptor: Record<string, unknown> = { rank: "2", seed: 123, pendingTributeItems: [] };

type Registry = ReadonlyMap<string, RoomState>;

function createHarness(directory = mkdtempSync(join(tmpdir(), "d2a1-api-idempotency-"))) {
  const databasePath = join(directory, "identity.sqlite");
  const store = new PublicIdentityStore(databasePath, { installationIdentity: INSTALLATION_IDENTITY });
  const provider = createPublicIdentityProvider(store);
  let registry: Registry | undefined;
  const app = buildApi(provider, { onRoomRegistry: (rooms) => { registry = rooms; } });
  return {
    app,
    provider,
    store,
    directory,
    databasePath,
    runtimeClosed: false,
    get registry(): Registry {
      if (registry === undefined) throw new Error("TEST_REGISTRY_NOT_READY");
      return registry;
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

async function closeRuntime(harness: Harness): Promise<void> {
  if (harness.runtimeClosed) return;
  await harness.app.close();
  harness.provider.close();
  harness.runtimeClosed = true;
}

async function cleanupHarness(harness: Harness): Promise<void> {
  try {
    await closeRuntime(harness);
  } finally {
    rmSync(harness.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function request(harness: Harness, key: string, payload: Record<string, unknown> = descriptor) {
  return harness.app.inject({
    method: "POST",
    url: "/api/rooms",
    headers: { "Idempotency-Key": key },
    payload,
  });
}

describe("room idempotency and privacy boundary", () => {
  const harnesses: Harness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) await cleanupHarness(harnesses.pop()!);
  });

  function harness(directory?: string): Harness {
    const value = createHarness(directory);
    harnesses.push(value);
    return value;
  }

  it("returns one canonical room and allocation for same-key same-descriptor retries", async () => {
    const h = harness();
    const key = "same-room-key";

    const first = await request(h, key);
    const second = await request(h, key);
    const firstRoom = first.json().room;
    const firstAllocation = h.store.getAllocationByIdempotencyKey(key);
    const secondAllocation = h.store.getAllocationByIdempotencyKey(key);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(second.json().room.id).toBe(firstRoom.id);
    expect(h.registry.size).toBe(1);
    expect(secondAllocation).toEqual(firstAllocation);
    expect(firstAllocation?.status).toBe("idempotent");

    const next = await request(h, "next-room-key");
    const nextAllocation = h.store.getAllocationByIdempotencyKey("next-room-key");
    expect(next.statusCode).toBe(200);
    expect(nextAllocation).toBeDefined();
    expect(BigInt(nextAllocation!.gameSequence)).toBe(BigInt(firstAllocation!.gameSequence) + 1n);
    expect(nextAllocation!.publicIdentity.gameId).not.toBe(firstAllocation!.publicIdentity.gameId);
    expect(h.registry.size).toBe(2);
  });

  it("returns a stable conflict without changing the first allocation or room", async () => {
    const h = harness();
    const key = "conflict-room-key";
    const first = await request(h, key, descriptor);
    const firstRoom = first.json().room;
    const firstAllocation = h.store.getAllocationByIdempotencyKey(key);

    const conflict = await request(h, key, { ...descriptor, seed: 124 });

    expect(first.statusCode).toBe(200);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: "IDEMPOTENCY_CONFLICT" });
    expect(h.store.getAllocationByIdempotencyKey(key)).toEqual(firstAllocation);
    expect(h.registry.size).toBe(1);
    expect(h.registry.get(firstRoom.id)?.publicIdentity?.gameId).toBe(firstAllocation?.publicIdentity.gameId);
  });

  it("coalesces concurrent duplicate requests into one canonical allocation", async () => {
    const h = harness();
    const key = "concurrent-room-key";

    const [first, second] = await Promise.all([request(h, key), request(h, key)]);
    const allocation = h.store.getAllocationByIdempotencyKey(key);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json()).toEqual(second.json());
    expect(h.registry.size).toBe(1);
    expect(allocation?.status).toBe("idempotent");

    const next = await request(h, "concurrent-next-key");
    const nextAllocation = h.store.getAllocationByIdempotencyKey("concurrent-next-key");
    expect(next.statusCode).toBe(200);
    expect(BigInt(nextAllocation!.gameSequence)).toBe(BigInt(allocation!.gameSequence) + 1n);
    expect(nextAllocation!.publicIdentity.gameId).not.toBe(allocation!.publicIdentity.gameId);
  });

  it("recovers committed allocation metadata after restart without recreating the room or reusing gameId", async () => {
    const first = harness();
    const key = "restart-room-key";
    const created = await request(first, key);
    const allocationBeforeRestart = first.store.getAllocationByIdempotencyKey(key);
    const directory = first.directory;
    const databasePath = first.databasePath;
    const installationIdentity = first.store.getInstallationIdentity();
    expect(created.statusCode).toBe(200);
    expect(allocationBeforeRestart?.lifecycle).toBe("room-committed");

    await closeRuntime(first);

    const restarted = harness(directory);
    expect(restarted.databasePath).toBe(databasePath);
    expect(restarted.store.getInstallationIdentity()).toBe(installationIdentity);
    const retryAfterRestart = await request(restarted, key);
    expect(retryAfterRestart.statusCode).toBe(410);
    expect(retryAfterRestart.json()).toEqual({ error: "ROOM_STATE_UNAVAILABLE_AFTER_RESTART" });
    expect(restarted.store.getAllocationByIdempotencyKey(key)).toEqual(allocationBeforeRestart);
    expect(restarted.registry.size).toBe(0);

    const newRoom = await request(restarted, "restart-new-room-key");
    const newAllocation = restarted.store.getAllocationByIdempotencyKey("restart-new-room-key");
    expect(newRoom.statusCode).toBe(200);
    expect(BigInt(newAllocation!.gameSequence)).toBe(BigInt(allocationBeforeRestart!.gameSequence) + 1n);
    expect(newAllocation!.publicIdentity.gameId).not.toBe(allocationBeforeRestart!.publicIdentity.gameId);
  });

  it("keeps the idempotency key out of PublicRoom, ledger, replay-facing events, and response fields", async () => {
    const h = harness();
    const key = "privacy-room-key";
    const response = await request(h, key);
    const publicRoom = response.json().room as Record<string, unknown>;
    const privateRoom = h.registry.get(publicRoom.id as string) as RoomState;

    expect(response.statusCode).toBe(200);
    for (const forbidden of ["publicIdentity", "publicLedger", "publicEvents", "idempotencyKey", "identity", "gameSequence", "gameId"]) {
      expect(publicRoom).not.toHaveProperty(forbidden);
    }
    expect(JSON.stringify(response.json())).not.toContain(key);
    expect(JSON.stringify(privateRoom.publicLedger)).not.toContain(key);
    expect(JSON.stringify(privateRoom.publicEvents)).not.toContain(key);
    expect(JSON.stringify(publicRoom.replayHands)).not.toContain(key);

    if (privateRoom.publicIdentity === undefined || privateRoom.publicLedger === undefined || privateRoom.publicEvents === undefined) {
      throw new Error("TEST_PUBLIC_REPLAY_DATA_MISSING");
    }
    const replayDocument: PublicLedgerReplayDocument = {
      schemaVersion: "d2-public-ledger-replay-v1",
      initialState: {
        identity: privateRoom.publicIdentity,
        initialHandCounts: {
          0: privateRoom.initialHands[0].length,
          1: privateRoom.initialHands[1].length,
          2: privateRoom.initialHands[2].length,
          3: privateRoom.initialHands[3].length,
        },
        openingLeader: privateRoom.leaderSeat,
        initialTrickIndex: 0,
        openingTributePublicState: { status: privateRoom.openingTribute?.status ?? "none" },
      },
      events: privateRoom.publicEvents,
      ledgerSnapshot: privateRoom.publicLedger,
    };
    const rebuilt = rebuildPublicLedger(replayDocument);
    expect(JSON.stringify(replayDocument)).not.toContain(key);
    expect(JSON.stringify(rebuilt.ledger)).not.toContain(key);
  });

  it("rejects identity and idempotency fields in the room body before allocation", async () => {
    const h = harness();
    const key = "body-boundary-key";
    const response = await request(h, key, {
      ...descriptor,
      idempotencyKey: key,
      identity: "forbidden",
      publicIdentity: { gameId: "forbidden" },
      gameSequence: "1",
      gameId: "forbidden",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "INVALID_CREATE_ROOM_REQUEST" });
    expect(h.store.getAllocationByIdempotencyKey(key)).toBeUndefined();
    expect(h.registry.size).toBe(0);
  });
});
