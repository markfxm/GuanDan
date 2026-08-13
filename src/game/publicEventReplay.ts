import type { PublicActionEvent, PublicGameIdentity, PublicSeat } from "./publicEvent";
import { applyPublicEvent, canonicalPublicLedgerHash, createInitialPublicLedger, type HardPublicLedger } from "./publicLedger";

export type PublicLedgerReplayInitialState = Readonly<{
  identity: PublicGameIdentity;
  initialHandCounts: Readonly<Record<PublicSeat, number>>;
  openingLeader: PublicSeat;
  initialTrickIndex: number;
  openingTributePublicState: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type PublicLedgerReplayDocument = {
  schemaVersion: "d2-public-ledger-replay-v1";
  initialState: PublicLedgerReplayInitialState;
  events: readonly PublicActionEvent[];
  finalLedgerHash?: string;
  ledgerSnapshot?: HardPublicLedger;
};

export function rebuildPublicLedger(document: PublicLedgerReplayDocument): { ledger: HardPublicLedger; hash: string } {
  if (document.schemaVersion !== "d2-public-ledger-replay-v1") throw new Error("REPLAY_SCHEMA_VERSION_MISMATCH");
  if (document.initialState === undefined) throw new Error("REPLAY_INITIAL_STATE_MISSING");
  let ledger = createInitialPublicLedger(document.initialState);
  for (const event of document.events) {
    const result = applyPublicEvent(ledger, event);
    if (!result.ok) throw new Error(`REPLAY_EVENT_INVALID:${result.error}`);
    ledger = result.ledger;
  }
  const hash = canonicalPublicLedgerHash(ledger);
  if (document.finalLedgerHash !== undefined && document.finalLedgerHash !== hash) throw new Error("REPLAY_FINAL_HASH_MISMATCH");
  if (document.ledgerSnapshot !== undefined && canonicalPublicLedgerHash(document.ledgerSnapshot) !== hash) throw new Error("REPLAY_SNAPSHOT_MISMATCH");
  return { ledger, hash };
}
