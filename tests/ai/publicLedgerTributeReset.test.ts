import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { canonicalPublicLedgerHash, createInitialPublicLedger, resetPublicLedger } from "../../src/game/publicLedger";
import { rebuildPublicLedger } from "../../src/game/publicEventReplay";
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

  it("commits every double-tribute transfer atomically and replays the resulting ledger", () => {
    const doubleIdentity = buildPublicGameIdentity("d2a:double-tribute", 0, 0, "benchmark-scenario");
    const room = createRoom({
      publicIdentity: doubleIdentity,
      rank: "K",
      seed: 1,
      pendingTributeItems: [{ payer: 1, receiver: 0 }, { payer: 3, receiver: 2 }],
    }) as RoomState & {
      publicLedger: NonNullable<RoomState["publicLedger"]>;
      publicEvents: NonNullable<RoomState["publicEvents"]>;
    };
    const initialLedger = room.publicLedger;
    const initialCounts = { ...initialLedger.handCounts };

    advanceOpeningTribute(room);

    expect(room.publicEvents).toEqual([]);
    expect(Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, room.hands[seat as 0 | 1 | 2 | 3].length]))).toEqual(initialCounts);

    advanceOpeningTribute(room);

    expect(room.publicEvents.map((event) => event.kind)).toEqual(["tribute", "tribute"]);
    expect(room.publicEvents.map((event) => event.publicCardIds)).toEqual(room.openingTribute?.exchanges?.map((exchange) => [exchange.tributeCard.id]));
    expect(room.publicLedger.handCounts).toEqual(Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, room.hands[seat as 0 | 1 | 2 | 3].length])));
    const rebuilt = rebuildPublicLedger({
      schemaVersion: "d2-public-ledger-replay-v1",
      initialState: {
        identity: doubleIdentity,
        initialHandCounts: initialCounts,
        openingLeader: initialLedger.currentTrick.leadSeat,
        initialTrickIndex: initialLedger.currentTrick.trickIndex,
        openingTributePublicState: { status: "pending" },
      },
      events: room.publicEvents,
    });
    expect(rebuilt.hash).toBe(canonicalPublicLedgerHash(room.publicLedger));
  });

  it("reserves distinct tribute cards when one payer has multiple pending items", () => {
    const repeatedPayerIdentity = buildPublicGameIdentity("d2a:repeated-payer", 0, 0, "benchmark-scenario");
    const room = createRoom({
      publicIdentity: repeatedPayerIdentity,
      rank: "K",
      seed: 1,
      pendingTributeItems: [{ payer: 1, receiver: 0 }, { payer: 1, receiver: 2 }],
    });

    advanceOpeningTribute(room);
    advanceOpeningTribute(room);

    const tributeCardIds = room.openingTribute?.exchanges?.map((exchange) => exchange.tributeCard.id) ?? [];
    expect(new Set(tributeCardIds).size).toBe(2);
    expect(room.publicEvents?.map((event) => event.kind)).toEqual(["tribute", "tribute"]);
    expect(room.publicLedger?.handCounts).toEqual(Object.fromEntries([0, 1, 2, 3].map((seat) => [seat, room.hands[seat as 0 | 1 | 2 | 3].length])));
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
