import type { HardPublicLedger } from "../../src/game/publicLedger";
import type { PublicActionEvent, PublicGameIdentity } from "../../src/game/publicEvent";
import type { RoomState } from "../../src/game/room";

export type D2aPublicLedgerView = Readonly<{
  identity: PublicGameIdentity;
  ledger: HardPublicLedger;
  events: readonly PublicActionEvent[];
}>;

export function readD2aPublicLedger(room: RoomState): D2aPublicLedgerView {
  if (room.publicIdentity === undefined || room.publicLedger === undefined || room.publicEvents === undefined) {
    throw new Error("D2A_PUBLIC_LEDGER_UNAVAILABLE");
  }
  return Object.freeze({ identity: room.publicIdentity, ledger: room.publicLedger, events: room.publicEvents });
}
