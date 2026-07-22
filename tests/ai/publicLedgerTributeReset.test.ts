import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createInitialPublicLedger, resetPublicLedger } from "../../src/game/publicLedger";
import { advanceOpeningTribute, createRoom, type RoomState } from "../../src/game/room";

const identity = buildPublicGameIdentity("d2a:tribute", 0, 0, "benchmark-scenario");

describe("D2a tribute and reset events", () => {
  it("records public tribute and return transfers from committed room changes", () => {
    const room = createRoom({
      publicIdentity: identity,
      rank: "10",
      seed: 8,
      pendingTributeItems: [{ payer: 0, receiver: 1 }],
    }) as RoomState & { publicEvents: NonNullable<RoomState["publicEvents"]> };
    const tributeCard = room.hands[0][0]!;
    const returnCard = room.hands[1][0]!;

    advanceOpeningTribute(room, 0, [tributeCard.id]);
    expect(room.publicEvents.map((event) => event.kind)).toEqual(["tribute"]);
    advanceOpeningTribute(room, 1, [returnCard.id]);
    expect(room.publicEvents.map((event) => event.kind)).toEqual(["tribute", "return"]);
    const actualReturnCardId = room.openingTribute?.exchanges?.[0]?.returnCard?.id;
    expect(room.publicLedger?.revealedTransferEvents.map((event) => event.cardId)).toEqual([tributeCard.id, actualReturnCardId]);
    expect(room.publicLedger?.playedCardIds).not.toContain(tributeCard.id);
  });

  it("resets the ledger from a new hand identity without carrying events", () => {
    const first = createInitialPublicLedger({
      identity,
      initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
      openingLeader: 0,
      initialTrickIndex: 0,
      openingTributePublicState: { status: "none" },
    });
    const nextIdentity = buildPublicGameIdentity("d2a:tribute", 1, 0, "benchmark-scenario");
    const next = resetPublicLedger({
      identity: nextIdentity,
      initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
      openingLeader: 1,
      initialTrickIndex: 0,
      openingTributePublicState: { status: "none" },
    });
    expect(first.nextEventIndex).toBe(0);
    expect(next.gameId).toBe(identity.gameId);
    expect(next.roundIdentity).toBe(nextIdentity.roundIdentity);
    expect(next.playedCardIds).toEqual([]);
    expect(next.revealedTransferEvents).toEqual([]);
  });

  it("records anti-tribute without a card transfer or count change", () => {
    const room = createRoom({
      publicIdentity: identity,
      rank: "10",
      seed: 2,
      pendingTributeItems: [{ payer: 0, receiver: 1 }, { payer: 2, receiver: 3 }],
    });
    expect(room.openingTribute?.status).toBe("anti-tribute");
    expect(room.publicEvents?.map((event) => event.kind)).toEqual(["anti-tribute"]);
    expect(room.publicEvents?.[0]).not.toHaveProperty("publicCardIds");
    expect(room.publicLedger?.playedCardIds).toEqual([]);
  });
});
