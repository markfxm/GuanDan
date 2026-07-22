import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createRoom, getPublicRoom, passTurn, playCards, type RoomState } from "../../src/game/room";

const publicIdentity = buildPublicGameIdentity("d2a:room-adapter", 0, 0, "benchmark-scenario");

function d2aRoom(): RoomState & { publicIdentity: typeof publicIdentity; publicLedger: NonNullable<RoomState["publicLedger"]>; publicEvents: NonNullable<RoomState["publicEvents"]> } {
  return createRoom({ publicIdentity, rank: "10", seed: 1 } as never) as RoomState & { publicIdentity: typeof publicIdentity; publicLedger: NonNullable<RoomState["publicLedger"]>; publicEvents: NonNullable<RoomState["publicEvents"]> };
}

describe("room public ledger adapter", () => {
  it("initializes explicit identity and appends finalized play only after commit", () => {
    const room = d2aRoom();
    const id = room.hands[0][0]!.id;
    playCards(room, 0, [id]);
    expect(room.publicIdentity).toEqual(publicIdentity);
    expect(room.publicEvents.map((event: { kind: string }) => event.kind)).toEqual(["play"]);
    expect(room.publicLedger.lastAppliedEventIndex).toBe(0);
  });

  it("records pass without changing the current last play", () => {
    const room = d2aRoom();
    playCards(room, 0, [room.hands[0][0]!.id]);
    const nextSeat = room.currentTurn;
    passTurn(room, nextSeat);
    expect(room.publicEvents.map((event: { kind: string }) => event.kind)).toEqual(["play", "pass"]);
    expect(room.publicLedger.currentTrick.lastPlaySeat).toBe(0);
    expect(room.publicLedger.currentTrick.passSeats).toEqual([nextSeat]);
  });

  it("does not expose identity, events or ledger through PublicRoom", () => {
    const room = d2aRoom();
    const publicRoom = getPublicRoom(room, 0, { ensurePlans: false });
    expect(publicRoom).not.toHaveProperty("publicIdentity");
    expect(publicRoom).not.toHaveProperty("publicLedger");
    expect(publicRoom).not.toHaveProperty("publicEvents");
  });

  it("leaves every mutable room field unchanged when validation fails", () => {
    const room = d2aRoom();
    const before = structuredClone({
      players: room.players,
      hands: room.hands,
      initialHands: room.initialHands,
      trick: room.trick,
      currentTurn: room.currentTurn,
      leaderSeat: room.leaderSeat,
      currentTrickIndex: room.currentTrickIndex,
      playHistory: room.playHistory,
      finishOrder: room.finishOrder,
      openingTribute: room.openingTribute,
      settlement: room.settlement,
      aiPlans: room.aiPlans,
      aiRuntime: room.aiRuntime,
      status: room.status,
      actionLog: room.actionLog,
      publicIdentity: room.publicIdentity,
      publicLedger: room.publicLedger,
      publicEvents: room.publicEvents,
    });
    expect(() => playCards(room, 0, ["missing-card"])).toThrow();
    expect(structuredClone({
      players: room.players,
      hands: room.hands,
      initialHands: room.initialHands,
      trick: room.trick,
      currentTurn: room.currentTurn,
      leaderSeat: room.leaderSeat,
      currentTrickIndex: room.currentTrickIndex,
      playHistory: room.playHistory,
      finishOrder: room.finishOrder,
      openingTribute: room.openingTribute,
      settlement: room.settlement,
      aiPlans: room.aiPlans,
      aiRuntime: room.aiRuntime,
      status: room.status,
      actionLog: room.actionLog,
      publicIdentity: room.publicIdentity,
      publicLedger: room.publicLedger,
      publicEvents: room.publicEvents,
    })).toEqual(before);
  });
});
