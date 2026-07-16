import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createInitialPublicLedger } from "../../src/game/publicLedger";
import { createRoom, passTurn, playCards, type RoomState } from "../../src/game/room";

const identity = buildPublicGameIdentity("d2a:trick-finish", 0, 0, "benchmark-scenario");

function publicRoom(): RoomState & {
  publicLedger: NonNullable<RoomState["publicLedger"]>;
  publicEvents: NonNullable<RoomState["publicEvents"]>;
} {
  return createRoom({ publicIdentity: identity, rank: "10", seed: 7 }) as RoomState & {
    publicLedger: NonNullable<RoomState["publicLedger"]>;
    publicEvents: NonNullable<RoomState["publicEvents"]>;
  };
}

describe("D2a trick and finish events", () => {
  it("emits play then finish when a hand becomes empty", () => {
    const room = publicRoom();
    const card = room.hands[0][0]!;
    room.hands[0] = [card];
    room.currentTurn = 0;
    room.trick = { leadSeat: 0, passSeats: [], plays: [] };
    room.publicLedger = createInitialPublicLedger({
      identity,
      initialHandCounts: { 0: 1, 1: 27, 2: 27, 3: 27 },
      openingLeader: 0,
      initialTrickIndex: 0,
      openingTributePublicState: { status: "none" },
    });

    playCards(room, 0, [card.id]);

    expect(room.publicEvents.map((event) => event.kind)).toEqual(["play", "finish"]);
    expect(room.publicEvents.map((event) => event.eventIndex)).toEqual([0, 1]);
    expect(room.publicLedger.finishOrder).toEqual([0]);
    expect(room.publicLedger.handCounts[0]).toBe(0);
  });

  it("emits pass then trick-clear with continuous indexes", () => {
    const room = publicRoom();
    room.currentTurn = 0;
    playCards(room, 0, [room.hands[0][0]!.id]);
    const nextSeat = room.currentTurn;
    passTurn(room, nextSeat);
    for (let i = 0; i < 2; i += 1) passTurn(room, room.currentTurn);

    expect(room.publicEvents.at(-1)?.kind).toBe("trick-clear");
    expect(room.publicEvents.map((event) => event.eventIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(room.publicLedger.currentTrick.trickIndex).toBe(1);
    expect(room.publicLedger.currentTrick.passSeats).toEqual([]);
  });
});
