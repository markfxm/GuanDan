import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { buildPublicGameIdentity, type PublicGameIdentity } from "../game/publicEvent";
import { sha256Bytes } from "../game/publicEventHash";
import {
  hashCanonicalRoomRequestDescriptor,
  validateIdempotencyKey,
  type CanonicalRoomRequestDescriptor,
} from "./publicIdentityDescriptor";

export type AllocationLifecycle = "allocated" | "room-committed";

export type PublicIdentityAllocation = Readonly<{
  status: "new" | "idempotent";
  lifecycle: AllocationLifecycle;
  descriptorHash: string;
  gameSequence: string;
  publicIdentity: PublicGameIdentity;
}>;

type StoredAllocation = Omit<PublicIdentityAllocation, "status">;

const GAME_ID_DOMAIN_SEPARATOR = "D2A-PUBLIC-GAME-ID-V1";

export class PublicIdentityStore {
  private readonly database: Database.Database;

  public constructor(databasePath: string, options: Readonly<{ installationIdentity?: string }> = {}) {
    this.database = new Database(databasePath);
    this.database.defaultSafeIntegers();
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("synchronous = FULL");
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("busy_timeout = 5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS d2a_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS d2a_allocations (
        idempotency_key TEXT PRIMARY KEY NOT NULL,
        descriptor_hash TEXT NOT NULL,
        game_sequence INTEGER NOT NULL UNIQUE,
        game_id TEXT NOT NULL UNIQUE,
        round_identity TEXT NOT NULL,
        hand_identity TEXT NOT NULL,
        round_sequence INTEGER NOT NULL,
        hand_sequence INTEGER NOT NULL,
        identity_source TEXT NOT NULL,
        lifecycle TEXT NOT NULL CHECK (lifecycle IN ('allocated', 'room-committed'))
      );
    `);
    this.bootstrapInstallationIdentity(options.installationIdentity);
  }

  public getInstallationIdentity(): string {
    return this.readMetadata("installation_identity");
  }

  /** @internal diagnostics for the approved server-store contract tests. */
  public getPragmaSnapshot(): Readonly<{ foreignKeys: number; synchronous: number; journalMode: string; busyTimeout: number }> {
    return Object.freeze({
      foreignKeys: Number(this.database.pragma("foreign_keys", { simple: true })),
      synchronous: Number(this.database.pragma("synchronous", { simple: true })),
      journalMode: String(this.database.pragma("journal_mode", { simple: true })).toLowerCase(),
      busyTimeout: Number(this.database.pragma("busy_timeout", { simple: true })),
    });
  }

  public allocate(descriptor: CanonicalRoomRequestDescriptor, idempotencyKey: string): PublicIdentityAllocation {
    const validKey = validateIdempotencyKey(idempotencyKey);
    const descriptorHash = hashCanonicalRoomRequestDescriptor(descriptor);
    const transaction = this.database.transaction(() => {
      const existing = this.readStoredAllocation(validKey);
      if (existing) {
        if (existing.descriptorHash !== descriptorHash) throw new Error("IDEMPOTENCY_CONFLICT");
        return Object.freeze({ status: "idempotent" as const, ...existing });
      }
      const next = this.readSequence();
      const gameId = deriveGameId(this.getInstallationIdentity(), next);
      const publicIdentity = buildPublicGameIdentity(gameId, 0, 0, "production-session");
      this.database.prepare("UPDATE d2a_metadata SET value = ? WHERE key = 'next_game_sequence'").run((next + 1n).toString(10));
      this.database.prepare(`INSERT INTO d2a_allocations
        (idempotency_key, descriptor_hash, game_sequence, game_id, round_identity, hand_identity, round_sequence, hand_sequence, identity_source, lifecycle)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(validKey, descriptorHash, next, publicIdentity.gameId, publicIdentity.roundIdentity, publicIdentity.handIdentity, publicIdentity.roundSequence, publicIdentity.handSequence, publicIdentity.source, "allocated");
      return Object.freeze({
        status: "new" as const,
        lifecycle: "allocated" as const,
        descriptorHash,
        gameSequence: next.toString(10),
        publicIdentity,
      });
    }).immediate;
    return transaction() as PublicIdentityAllocation;
  }

  public getAllocationByIdempotencyKey(idempotencyKey: string): PublicIdentityAllocation | undefined {
    const stored = this.readStoredAllocation(validateIdempotencyKey(idempotencyKey));
    return stored ? Object.freeze({ status: "idempotent" as const, ...stored }) : undefined;
  }

  public markRoomCommitted(idempotencyKey: string): PublicIdentityAllocation {
    const key = validateIdempotencyKey(idempotencyKey);
    const transaction = this.database.transaction(() => {
      const existing = this.readStoredAllocation(key);
      if (!existing) throw new Error("ALLOCATION_NOT_FOUND");
      if (existing.lifecycle === "room-committed") return Object.freeze({ status: "idempotent" as const, ...existing });
      this.database.prepare("UPDATE d2a_allocations SET lifecycle = 'room-committed' WHERE idempotency_key = ? AND lifecycle = 'allocated'").run(key);
      const committed = this.readStoredAllocation(key);
      if (!committed || committed.lifecycle !== "room-committed") throw new Error("ALLOCATION_LIFECYCLE_INVALID");
      return Object.freeze({ status: "new" as const, ...committed });
    }).immediate;
    return transaction() as PublicIdentityAllocation;
  }

  public markAllocated(idempotencyKey: string): never {
    const existing = this.readStoredAllocation(validateIdempotencyKey(idempotencyKey));
    if (!existing) throw new Error("ALLOCATION_NOT_FOUND");
    if (existing.lifecycle === "room-committed") throw new Error("ALLOCATION_LIFECYCLE_INVALID");
    throw new Error("ALLOCATION_LIFECYCLE_INVALID");
  }

  /** @internal boundary-vector fixture support; not used by production callers. */
  public insertTestAllocationForSequence(sequence: string, idempotencyKey: string): void {
    const parsed = parseSequence(sequence);
    const gameId = deriveGameId(this.getInstallationIdentity(), parsed);
    const identity = buildPublicGameIdentity(gameId, 0, 0, "production-session");
    this.database.prepare(`INSERT INTO d2a_allocations
      (idempotency_key, descriptor_hash, game_sequence, game_id, round_identity, hand_identity, round_sequence, hand_sequence, identity_source, lifecycle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(validateIdempotencyKey(idempotencyKey), `test-${sequence}`, parsed, identity.gameId, identity.roundIdentity, identity.handIdentity, 0, 0, identity.source, "allocated");
  }

  public close(): void {
    this.database.pragma("wal_checkpoint(TRUNCATE)");
    this.database.close();
  }

  private bootstrapInstallationIdentity(requested?: string): void {
    const transaction = this.database.transaction(() => {
      const existing = this.readOptionalMetadata("installation_identity");
      if (existing) {
        if (requested !== undefined && requested !== existing) throw new Error("INSTALLATION_IDENTITY_CONFLICT");
        return;
      }
      const identity = requested ?? randomUUID();
      assertCanonicalInstallationIdentity(identity);
      this.database.prepare("INSERT INTO d2a_metadata (key, value) VALUES ('installation_identity', ?)").run(identity);
      this.database.prepare("INSERT INTO d2a_metadata (key, value) VALUES ('next_game_sequence', '1')").run();
      if (this.readMetadata("installation_identity") !== identity) throw new Error("INSTALLATION_IDENTITY_READBACK_FAILED");
    }).immediate;
    transaction();
  }

  private readSequence(): bigint {
    return parseSequence(this.readMetadata("next_game_sequence"));
  }

  private readStoredAllocation(idempotencyKey: string): StoredAllocation | undefined {
    const row = this.database.prepare("SELECT descriptor_hash, game_sequence, game_id, round_identity, hand_identity, round_sequence, hand_sequence, identity_source, lifecycle FROM d2a_allocations WHERE idempotency_key = ?").get(idempotencyKey) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    if (typeof row.game_sequence !== "bigint") throw new Error("UNSAFE_SEQUENCE_READ");
    const gameSequence = row.game_sequence.toString(10);
    const publicIdentity = Object.freeze({
      schemaVersion: "d2-public-game-identity-v1" as const,
      gameId: String(row.game_id),
      roundIdentity: String(row.round_identity),
      handIdentity: String(row.hand_identity),
      roundSequence: Number(row.round_sequence),
      handSequence: Number(row.hand_sequence),
      source: String(row.identity_source) as PublicGameIdentity["source"],
    });
    return Object.freeze({
      lifecycle: String(row.lifecycle) as AllocationLifecycle,
      descriptorHash: String(row.descriptor_hash),
      gameSequence,
      publicIdentity,
    });
  }

  private readMetadata(key: string): string {
    const value = this.readOptionalMetadata(key);
    if (value === undefined) throw new Error("IDENTITY_STORE_CORRUPT");
    return value;
  }

  private readOptionalMetadata(key: string): string | undefined {
    const row = this.database.prepare("SELECT value FROM d2a_metadata WHERE key = ?").get(key) as { value?: unknown } | undefined;
    return row?.value === undefined ? undefined : String(row.value);
  }
}

export function deriveGameId(installationIdentity: string, sequence: bigint | string): string {
  assertCanonicalInstallationIdentity(installationIdentity);
  const canonicalSequence = parseSequence(sequence).toString(10);
  const bytes = new TextEncoder().encode(`${GAME_ID_DOMAIN_SEPARATOR}\0${installationIdentity.toLowerCase()}\0${canonicalSequence}`);
  return sha256Bytes(bytes);
}

function parseSequence(value: string | bigint): bigint {
  if (typeof value === "bigint") {
    if (value < 1n) throw new Error("GAME_SEQUENCE_INVALID");
    return value;
  }
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("GAME_SEQUENCE_INVALID");
  return BigInt(value);
}

function assertCanonicalInstallationIdentity(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error("INSTALLATION_IDENTITY_INVALID");
}
