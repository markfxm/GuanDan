import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
import { rebuildPublicLedger, type PublicLedgerReplayDocument } from "../../src/game/publicEventReplay";
import { createRoom, passTurn, playCards, type RoomState } from "../../src/game/room";

function createCanonicalRoom(): RoomState {
  const publicIdentity = buildPublicGameIdentity("task5:public-replay", 0, 0, "replay");
  return createRoom({ rank: "10", seed: 41, publicIdentity });
}

type ReplayInitialState = PublicLedgerReplayDocument["initialState"];

function captureInitialPublicState(room: RoomState): ReplayInitialState {
  if (room.publicIdentity === undefined) {
    throw new Error("TEST_PUBLIC_REPLAY_IDENTITY_MISSING");
  }
  return {
    identity: room.publicIdentity,
    initialHandCounts: {
      0: room.initialHands[0].length,
      1: room.initialHands[1].length,
      2: room.initialHands[2].length,
      3: room.initialHands[3].length,
    },
    openingLeader: room.leaderSeat,
    initialTrickIndex: 0,
    openingTributePublicState: { status: room.openingTribute?.status ?? "none" },
  };
}

function toReplayDocument(initialState: ReplayInitialState, room: RoomState): PublicLedgerReplayDocument {
  if (room.publicLedger === undefined || room.publicEvents === undefined) {
    throw new Error("TEST_PUBLIC_REPLAY_DATA_MISSING");
  }
  return {
    schemaVersion: "d2-public-ledger-replay-v1",
    initialState,
    events: room.publicEvents,
    finalLedgerHash: canonicalPublicLedgerHash(room.publicLedger),
  } satisfies PublicLedgerReplayDocument;
}

function persistAndReload(document: PublicLedgerReplayDocument): PublicLedgerReplayDocument {
  const directory = mkdtempSync(join(tmpdir(), "d2a1-public-replay-"));
  const replayPath = join(directory, "public-replay.json");
  try {
    writeFileSync(replayPath, JSON.stringify(document), "utf8");
    return JSON.parse(readFileSync(replayPath, "utf8")) as PublicLedgerReplayDocument;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function normalizeReplayKey(key: string): string {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}

const forbiddenReplayKeys = new Set([
  "transportroomid",
  "allocationkey",
  "storepath",
  "idempotencykey",
  "installationidentity",
  "identitystore",
  "gamesequence",
  "privatehand",
  "initialhands",
  "hands",
  "deck",
  "airuntime",
  "provider",
  "store",
  "partnerhand",
  "opponentshands",
  "hiddeninitialhand",
  "hiddenstate",
  "particlebank",
  "hypotheticalhands",
]);

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const child of value) collectKeys(child, keys);
    return keys;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

describe("standalone public-event replay identity boundary", () => {
  it("persists a real canonical room public stream and verifies the final ledger hash", () => {
    const room = createCanonicalRoom();
    const initialState = structuredClone(captureInitialPublicState(room));
    const playSeat = room.currentTurn;
    const playedCard = room.hands[playSeat][0];
    if (playedCard === undefined) throw new Error("TEST_CARD_MISSING");
    playCards(room, playSeat, [playedCard.id]);
    passTurn(room, room.currentTurn);

    const document = toReplayDocument(initialState, room);
    expect(document.initialState).toEqual(initialState);
    const reloaded = persistAndReload(document);
    expect(reloaded).toEqual(document);
    expect(reloaded.events).toHaveLength(2);
    expect(reloaded.events.map((event) => event.kind)).toEqual(["play", "pass"]);
    const rebuilt = rebuildPublicLedger(reloaded);

    expect(reloaded.events.map((event) => event.publicPayloadHash)).toEqual(document.events.map((event) => event.publicPayloadHash));
    expect(rebuilt.hash).toBe(document.finalLedgerHash);
    expect(rebuilt.ledger).toEqual(room.publicLedger);
  });

  it("rejects a persisted document whose final public ledger hash was changed", () => {
    const room = createCanonicalRoom();
    const initialState = structuredClone(captureInitialPublicState(room));
    const document = toReplayDocument(initialState, room);
    const reloaded = persistAndReload(document);
    const tampered = { ...reloaded, finalLedgerHash: "0".repeat(64) };
    const reloadedTampered = persistAndReload(tampered);
    expect(() => rebuildPublicLedger(reloadedTampered)).toThrow("REPLAY_FINAL_HASH_MISMATCH");
  });

  it("keeps the public replay path independent of provider and store modules", () => {
    const replaySource = readFileSync(join(process.cwd(), "src/game/publicEventReplay.ts"), "utf8");
    const ledgerSource = readFileSync(join(process.cwd(), "src/game/publicLedger.ts"), "utf8");
    const eventSource = readFileSync(join(process.cwd(), "src/game/publicEvent.ts"), "utf8");
    const source = `${replaySource}\n${ledgerSource}\n${eventSource}`;

    expect(source).not.toMatch(
      /(?:from\s+["'][^"']*(?:server|provider|store)(?:[\\/]|["'])|import\s*\(\s*["'][^"']*(?:server|provider|store)(?:[\\/]|["'])|PublicIdentityStore|createPublicIdentityProvider|publicIdentityStore|publicIdentityProvider|better-sqlite3|better_sqlite3\.node|node:sqlite|\bsqlite3\b|[\\/]server[\\/]|[\\/]provider[\\/]|[\\/]store[\\/])/i,
    );
  });

  it("keeps allocation and hidden-state fields out of the saved public document", () => {
    const room = createCanonicalRoom();
    const initialState = structuredClone(captureInitialPublicState(room));
    const playSeat = room.currentTurn;
    const playedCard = room.hands[playSeat][0];
    if (playedCard === undefined) throw new Error("TEST_CARD_MISSING");
    playCards(room, playSeat, [playedCard.id]);
    passTurn(room, room.currentTurn);
    const document = toReplayDocument(initialState, room);
    const reloaded = persistAndReload(document);
    expect(reloaded).toEqual(document);
    expect(Object.keys(reloaded).sort()).toEqual(["events", "finalLedgerHash", "initialState", "schemaVersion"]);
    expect(Object.keys(reloaded.initialState).sort()).toEqual(["identity", "initialHandCounts", "initialTrickIndex", "openingLeader", "openingTributePublicState"]);
    for (const key of collectKeys(reloaded)) {
      expect(forbiddenReplayKeys.has(normalizeReplayKey(key))).toBe(false);
    }
    const serialized = JSON.stringify(reloaded);
    expect(serialized).not.toContain("PublicIdentityStore");
    expect(serialized).not.toContain("createPublicIdentityProvider");
    expect(serialized).not.toContain("better-sqlite3");
    expect(serialized).not.toContain("node:sqlite");
    expect(reloaded.initialState.identity.gameId).toBe("task5:public-replay");
    expect(reloaded.initialState.identity.roundIdentity).toBeDefined();
    expect(reloaded.initialState.identity.handIdentity).toBeDefined();
  });
});
