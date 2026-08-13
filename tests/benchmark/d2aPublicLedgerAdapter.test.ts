import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createRoom, playCards } from "../../src/game/room";
import { readD2aPublicLedger } from "./d2aPublicLedgerAdapter";

describe("D2a benchmark ledger adapter", () => {
  it("reads the room ledger without exposing hidden hands", () => {
    const room = createRoom({ publicIdentity: buildPublicGameIdentity("d2a:adapter", 0, 0, "benchmark-scenario"), rank: "10", seed: 9 });
    playCards(room, 0, [room.hands[0][0]!.id]);
    const view = readD2aPublicLedger(room);
    expect(view.events).toHaveLength(1);
    expect(view.ledger.playedCardIds).toHaveLength(1);
    expect(view).not.toHaveProperty("hands");
    expect(view).not.toHaveProperty("initialHands");
  });
});
