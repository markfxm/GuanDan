import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { finalizePublicActionEvent } from "../../src/game/publicEventHash";
import { createInitialPublicLedger } from "../../src/game/publicLedger";
import { rebuildPublicLedger, type PublicLedgerReplayDocument } from "../../src/game/publicEventReplay";

describe("D2a public ledger replay", () => {
  it("rebuilds the final ledger from initial state and authoritative events", () => {
    const identity = buildPublicGameIdentity("d2a:replay", 0, 0, "replay");
    const initial = createInitialPublicLedger({
      identity,
      initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
      openingLeader: 0,
      initialTrickIndex: 0,
      openingTributePublicState: { status: "none" },
    });
    const play = finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: identity.gameId,
      roundIdentity: identity.roundIdentity,
      handIdentity: identity.handIdentity,
      eventIndex: 0,
      kind: "play",
      seat: 0,
      publicCardIds: ["C2-1"],
      patternType: "single",
      groupType: "single",
      publicStableKey: "play:C2-1",
      handCountBefore: 27,
      handCountAfter: 26,
      trickIndex: 0,
    });
    const pass = finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: identity.gameId,
      roundIdentity: identity.roundIdentity,
      handIdentity: identity.handIdentity,
      eventIndex: 1,
      kind: "pass",
      seat: 1,
      publicStableKey: "pass:v2",
      handCountBefore: 27,
      handCountAfter: 27,
      trickIndex: 0,
    });
    const document: PublicLedgerReplayDocument = {
      schemaVersion: "d2-public-ledger-replay-v1",
      initialState: {
        identity,
        initialHandCounts: initial.handCounts,
        openingLeader: 0,
        initialTrickIndex: 0,
        openingTributePublicState: { status: "none" },
      },
      events: [play, pass],
      finalLedgerHash: "",
    };
    const applied = rebuildPublicLedger({ ...document, finalLedgerHash: undefined } as never);
    document.finalLedgerHash = applied.hash;
    const rebuilt = rebuildPublicLedger(document);
    expect(rebuilt.hash).toBe(applied.hash);
    expect(rebuilt.ledger.currentTrick.passSeats).toEqual([1]);
  });

  it("rejects replay without authoritative initial state", () => {
    expect(() => rebuildPublicLedger({ schemaVersion: "d2-public-ledger-replay-v1", events: [], finalLedgerHash: "" } as never)).toThrow("REPLAY_INITIAL_STATE_MISSING");
  });

  it("treats an optional snapshot as a validation cache, not initialization authority", () => {
    const identity = buildPublicGameIdentity("d2a:replay-snapshot", 0, 0, "replay");
    const initial = createInitialPublicLedger({ identity, initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 }, openingLeader: 0, initialTrickIndex: 0, openingTributePublicState: { status: "none" } });
    const document = { schemaVersion: "d2-public-ledger-replay-v1", initialState: { identity, initialHandCounts: initial.handCounts, openingLeader: 0, initialTrickIndex: 0, openingTributePublicState: { status: "none" } }, events: [], finalLedgerHash: undefined, ledgerSnapshot: { ...initial, handCounts: { ...initial.handCounts, 0: 1 } } } as PublicLedgerReplayDocument;
    const rebuilt = rebuildPublicLedger({ ...document, finalLedgerHash: undefined, ledgerSnapshot: undefined });
    expect(() => rebuildPublicLedger({ ...document, finalLedgerHash: rebuilt.hash })).toThrow("REPLAY_SNAPSHOT_MISMATCH");
  });
});
