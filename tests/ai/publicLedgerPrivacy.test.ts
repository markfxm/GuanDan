import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createRoom, getPublicRoom, playCards } from "../../src/game/room";
import { assertPublicLedgerPrivacy } from "../../src/game/publicLedgerPrivacy";

describe("D2a public ledger privacy", () => {
  it("accepts a ledger and public room projection without hidden state", () => {
    const room = createRoom({ publicIdentity: buildPublicGameIdentity("d2a:privacy", 0, 0, "benchmark-scenario"), rank: "10", seed: 4 });
    playCards(room, room.currentTurn, [room.hands[room.currentTurn][0]!.id]);
    assertPublicLedgerPrivacy({ ledger: room.publicLedger, events: room.publicEvents, publicRoom: getPublicRoom(room, 0, { ensurePlans: false }) });
  });

  it("rejects hidden-hand and particle fields", () => {
    expect(() => assertPublicLedgerPrivacy({ opponentsHands: {}, ParticleBank: {}, publicCardIds: ["C2-1"] })).toThrow("PUBLIC_LEDGER_PRIVACY_VIOLATION");
  });
});
