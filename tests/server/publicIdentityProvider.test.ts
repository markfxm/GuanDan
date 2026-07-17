import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalizeRoomRequestDescriptor } from "../../src/server/publicIdentityDescriptor";
import { createPublicIdentityProvider } from "../../src/server/publicIdentityProvider";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore";

function temporaryDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "d2a1-task1-"));
  return { directory, path: join(directory, "identity.sqlite") };
}

function removeTemporaryDatabase(directory: string): void {
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    const retry = setTimeout(() => {
      try { rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Windows SQLite handles may release after the worker returns. */ }
    }, 250);
    retry.unref();
  }
}

function descriptor(seed: number) {
  return canonicalizeRoomRequestDescriptor({ rank: "2", seed, pendingTributeItems: [] });
}

describe("PublicIdentityStore and provider", () => {
  it("bootstraps a durable installation identity and preserves it across reopen", () => {
    const database = temporaryDatabase();
    try {
      const first = new PublicIdentityStore(database.path);
      const installationIdentity = first.getInstallationIdentity();
      expect(installationIdentity).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      first.close();

      const reopened = new PublicIdentityStore(database.path);
      expect(reopened.getInstallationIdentity()).toBe(installationIdentity);
      reopened.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("applies the approved SQLite safety pragmas", () => {
    const database = temporaryDatabase();
    try {
      const store = new PublicIdentityStore(database.path);
      expect(store.getPragmaSnapshot()).toEqual({ foreignKeys: 1, synchronous: 2, journalMode: "wal", busyTimeout: 5000 });
      store.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("allocates exact decimal sequences, fixed game id vector, and idempotent retries", () => {
    const database = temporaryDatabase();
    try {
      const store = new PublicIdentityStore(database.path, {
        installationIdentity: "00000000-0000-4000-8000-000000000001",
      });
      const provider = createPublicIdentityProvider(store);
      const first = provider.allocate({ descriptor: descriptor(1), idempotencyKey: "same-key" });
      expect(first.status).toBe("new");
      expect(first.gameSequence).toBe("1");
      expect(first.publicIdentity.gameId).toBe("1876686cbc6a0d445682319d421e704aa38440f0b0d772b3dfdd09cbd203a1d5");
      expect(first.lifecycle).toBe("allocated");

      const retry = provider.allocate({ descriptor: descriptor(1), idempotencyKey: "same-key" });
      expect(retry.status).toBe("idempotent");
      expect({ ...retry, status: "new" }).toEqual(first);
      expect(() => provider.allocate({ descriptor: descriptor(2), idempotencyKey: "same-key" })).toThrow("IDEMPOTENCY_CONFLICT");
      expect(provider.allocate({ descriptor: descriptor(2), idempotencyKey: "second-key" }).gameSequence).toBe("2");
      provider.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("keeps allocation data stable after close and reopen", () => {
    const database = temporaryDatabase();
    try {
      const first = new PublicIdentityStore(database.path, {
        installationIdentity: "00000000-0000-4000-8000-000000000001",
      });
      const allocation = createPublicIdentityProvider(first).allocate({ descriptor: descriptor(3), idempotencyKey: "reopen-key" });
      first.close();

      const reopened = new PublicIdentityStore(database.path);
      const recovered = reopened.getAllocationByIdempotencyKey("reopen-key");
      expect(recovered && { ...recovered, status: "new" }).toEqual(allocation);
      reopened.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("supports one-way room commitment and rejects reversal", () => {
    const database = temporaryDatabase();
    try {
      const store = new PublicIdentityStore(database.path);
      const provider = createPublicIdentityProvider(store);
      provider.allocate({ descriptor: descriptor(4), idempotencyKey: "commit-key" });
      expect(provider.markRoomCommitted("commit-key").lifecycle).toBe("room-committed");
      expect(provider.markRoomCommitted("commit-key").lifecycle).toBe("room-committed");
      expect(() => provider.markAllocated("commit-key")).toThrow("ALLOCATION_LIFECYCLE_INVALID");
      provider.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("rejects provider caller fields and invalid unpersisted installation identities", () => {
    const database = temporaryDatabase();
    try {
      const store = new PublicIdentityStore(database.path);
      const provider = createPublicIdentityProvider(store);
      expect(() => provider.allocate({ descriptor: descriptor(5), idempotencyKey: "forbidden-key", gameSequence: "9" } as never)).toThrow("IDENTITY_INPUT_FORBIDDEN");
      expect(() => provider.allocate({ descriptor: descriptor(5), idempotencyKey: "forbidden-key-2", sessionIdentity: "caller" } as never)).toThrow("IDENTITY_INPUT_FORBIDDEN");
      provider.close();
      const second = temporaryDatabase();
      try {
        expect(() => new PublicIdentityStore(second.path, { installationIdentity: "not-a-uuid" })).toThrow("INSTALLATION_IDENTITY_INVALID");
      } finally {
        removeTemporaryDatabase(second.directory);
      }
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("serializes concurrent same-key allocation and keeps different keys unique", () => {
    const database = temporaryDatabase();
    try {
      const leftStore = new PublicIdentityStore(database.path, { installationIdentity: "00000000-0000-4000-8000-000000000001" });
      const rightStore = new PublicIdentityStore(database.path);
      const left = createPublicIdentityProvider(leftStore).allocate({ descriptor: descriptor(6), idempotencyKey: "concurrent-same" });
      const same = createPublicIdentityProvider(rightStore).allocate({ descriptor: descriptor(6), idempotencyKey: "concurrent-same" });
      expect(same.gameSequence).toBe(left.gameSequence);
      expect(same.publicIdentity.gameId).toBe(left.publicIdentity.gameId);
      const different = createPublicIdentityProvider(rightStore).allocate({ descriptor: descriptor(7), idempotencyKey: "concurrent-different" });
      expect(different.gameSequence).not.toBe(left.gameSequence);
      expect(different.publicIdentity.gameId).not.toBe(left.publicIdentity.gameId);
      leftStore.close();
      rightStore.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("enforces game sequence and game id uniqueness", () => {
    const database = temporaryDatabase();
    try {
      const store = new PublicIdentityStore(database.path, { installationIdentity: "00000000-0000-4000-8000-000000000001" });
      store.insertTestAllocationForSequence("1", "unique-a");
      expect(() => store.insertTestAllocationForSequence("1", "unique-b")).toThrow();
      expect(() => store.insertTestAllocationForSequence("1", "unique-a")).toThrow();
      store.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("keeps canonical allocation bytes stable across reopen", () => {
    const database = temporaryDatabase();
    try {
      const first = new PublicIdentityStore(database.path, { installationIdentity: "00000000-0000-4000-8000-000000000001" });
      const allocation = createPublicIdentityProvider(first).allocate({ descriptor: descriptor(8), idempotencyKey: "stable-key" });
      const before = JSON.stringify({ descriptorHash: allocation.descriptorHash, gameSequence: allocation.gameSequence, publicIdentity: allocation.publicIdentity });
      first.close();
      const reopened = new PublicIdentityStore(database.path);
      const recovered = reopened.getAllocationByIdempotencyKey("stable-key");
      const after = JSON.stringify({ descriptorHash: recovered?.descriptorHash, gameSequence: recovered?.gameSequence, publicIdentity: recovered?.publicIdentity });
      expect(after).toBe(before);
      reopened.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });

  it("does not expose unsafe numeric sequence conversion at the 2^53 boundary", () => {
    const database = temporaryDatabase();
    try {
      const store = new PublicIdentityStore(database.path);
      store.insertTestAllocationForSequence("9007199254740991", "boundary-a");
      store.insertTestAllocationForSequence("9007199254740992", "boundary-b");
      expect(store.getAllocationByIdempotencyKey("boundary-a")?.gameSequence).toBe("9007199254740991");
      expect(store.getAllocationByIdempotencyKey("boundary-b")?.gameSequence).toBe("9007199254740992");
      store.close();
    } finally {
      removeTemporaryDatabase(database.directory);
    }
  });
});
