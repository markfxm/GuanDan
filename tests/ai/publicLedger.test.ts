import { describe, expect, it } from "vitest";
import { finalizePublicActionEvent, type PublicActionEventDraft } from "../../src/game/publicEventHash";
import { buildPublicGameIdentity, type PublicActionEvent } from "../../src/game/publicEvent";
import {
  applyPublicEvent,
  canonicalPublicLedgerHash,
  createInitialPublicLedger,
  type HardPublicLedger,
} from "../../src/game/publicLedger";

const identity = buildPublicGameIdentity("d2a:ledger", 0, 0, "benchmark-scenario");

function createLedger(): HardPublicLedger {
  return createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "none" },
  });
}

function event(draft: Record<string, unknown>): PublicActionEvent {
  return finalizePublicActionEvent({
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    ...draft,
  } as unknown as PublicActionEventDraft);
}

function play(eventIndex: number, seat: 0 | 1 | 2 | 3, cardId = "S3-1", before = 27): PublicActionEvent {
  return event({
    schemaVersion: "d2-public-event-v2",
    eventIndex,
    kind: "play",
    seat,
    publicStableKey: `play:${cardId}`,
    publicCardIds: [cardId],
    patternType: "single",
    groupType: "single",
    handCountBefore: before,
    handCountAfter: before - 1,
    trickIndex: 0,
  });
}

function pass(eventIndex: number, seat: 0 | 1 | 2 | 3): PublicActionEvent {
  return event({
    schemaVersion: "d2-public-event-v2",
    eventIndex,
    kind: "pass",
    seat,
    publicStableKey: "pass:v2",
    handCountBefore: 27,
    handCountAfter: 27,
    trickIndex: 0,
  });
}

describe("HardPublicLedger", () => {
  it("applies play and pass while preserving current-trick semantics", () => {
    const afterPlay = applyPublicEvent(createLedger(), play(0, 0));
    expect(afterPlay).toMatchObject({ ok: true });
    if (!afterPlay.ok) return;
    expect(afterPlay.ledger.playedCardIds).toEqual(["S3-1"]);
    expect(afterPlay.ledger.handCounts[0]).toBe(26);
    expect(afterPlay.ledger.currentTrick.lastPlaySeat).toBe(0);
    const afterPass = applyPublicEvent(afterPlay.ledger, pass(1, 1));
    expect(afterPass).toMatchObject({ ok: true });
    if (afterPass.ok) {
      expect(afterPass.ledger.currentTrick.lastPlaySeat).toBe(0);
      expect(afterPass.ledger.currentTrick.passSeats).toEqual([1]);
    }
  });

  it("rejects pass without a last play and repeated pass by one seat", () => {
    const initial = createLedger();
    expect(applyPublicEvent(initial, pass(0, 1))).toMatchObject({ ok: false, error: "TRICK_STATE_INVALID" });
    const afterPlay = applyPublicEvent(initial, play(0, 0));
    if (!afterPlay.ok) throw new Error("fixture");
    const afterPass = applyPublicEvent(afterPlay.ledger, pass(1, 1));
    if (!afterPass.ok) throw new Error("fixture");
    expect(applyPublicEvent(afterPass.ledger, pass(2, 1))).toMatchObject({ ok: false, error: "TRICK_STATE_INVALID" });
  });

  it("clears current trick and advances lead", () => {
    const afterPlay = applyPublicEvent(createLedger(), play(0, 0));
    if (!afterPlay.ok) throw new Error("fixture");
    const cleared = applyPublicEvent(afterPlay.ledger, event({
      schemaVersion: "d2-public-event-v2",
      eventIndex: 1,
      kind: "trick-clear",
      seat: 0,
      publicStableKey: "trick-clear:0:1",
      trickIndex: 0,
      leadSeat: 0,
    }));
    expect(cleared).toMatchObject({ ok: true });
    if (cleared.ok) expect(cleared.ledger.currentTrick).toMatchObject({ trickIndex: 1, leadSeat: 0, passSeats: [] });
  });

  it("finish only appends finishOrder and does not change hand counts", () => {
    const afterPlay = applyPublicEvent(createLedger(), play(0, 0));
    if (!afterPlay.ok) throw new Error("fixture");
    const finished = applyPublicEvent(afterPlay.ledger, event({
      schemaVersion: "d2-public-event-v2",
      eventIndex: 1,
      kind: "finish",
      seat: 0,
      publicStableKey: "finish:1:hand-empty",
      trickIndex: 0,
      finishPosition: 1,
      remainingHandCount: 0,
      finishReason: "hand-empty",
    }));
    expect(finished).toMatchObject({ ok: true });
    if (finished.ok) {
      expect(finished.ledger.finishOrder).toEqual([0]);
      expect(finished.ledger.handCounts[0]).toBe(26);
    }
  });

  it("keeps transfer cards separate so a revealed tribute can later be played", () => {
    const tribute = event({
      schemaVersion: "d2-public-event-v2",
      eventIndex: 0,
      kind: "tribute",
      seat: 0,
      publicStableKey: "tribute:0:1:S3-1",
      publicCardIds: ["S3-1"],
      fromSeat: 0,
      toSeat: 1,
      handCountChanges: { 0: -1, 1: 1, 2: 0, 3: 0 },
      trickIndex: 0,
    });
    const afterTribute = applyPublicEvent(createLedger(), tribute);
    expect(afterTribute).toMatchObject({ ok: true });
    if (!afterTribute.ok) throw new Error("fixture");
    expect(afterTribute.ledger.playedCardIds).toEqual([]);
    expect(afterTribute.ledger.revealedTransferEvents).toHaveLength(1);
    const afterPlay = applyPublicEvent(afterTribute.ledger, play(1, 1, "S3-1", 28));
    expect(afterPlay).toMatchObject({ ok: true });
    const { publicPayloadHash: _hash, ...transferDraft } = tribute;
    const duplicateTransfer = finalizePublicActionEvent({ ...transferDraft, eventIndex: 2 } as unknown as PublicActionEventDraft);
    if (!afterPlay.ok) throw new Error("fixture");
    expect(applyPublicEvent(afterPlay.ledger, duplicateTransfer)).toMatchObject({ ok: false, error: "TRANSFER_DUPLICATE" });
  });

  it("applies anti-tribute without cards or count changes", () => {
    const initial = createLedger();
    const result = applyPublicEvent(initial, event({
      schemaVersion: "d2-public-event-v2",
      eventIndex: 0,
      kind: "anti-tribute",
      seat: 0,
      publicStableKey: "anti-tribute:no-eligible",
      reasonCode: "anti-tribute",
      trickIndex: 0,
    }));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.ledger.handCounts).toEqual(initial.handCounts);
  });

  it("is idempotent for the same index/hash and rejects gaps or conflicts", () => {
    const initial = createLedger();
    const first = applyPublicEvent(initial, play(0, 0));
    if (!first.ok) throw new Error("fixture");
    expect(applyPublicEvent(first.ledger, play(0, 0))).toMatchObject({ ok: true, kind: "idempotent" });
    expect(applyPublicEvent(first.ledger, play(0, 1, "S3-2"))).toMatchObject({ ok: false, error: "EVENT_INDEX_CONFLICT" });
    expect(applyPublicEvent(first.ledger, play(2, 1, "S3-2"))).toMatchObject({ ok: false, error: "EVENT_INDEX_GAP" });
  });

  it("returns the original ledger unchanged on every failed application", () => {
    const initial = createLedger();
    const before = canonicalPublicLedgerHash(initial);
    const result = applyPublicEvent(initial, play(2, 0));
    expect(result).toMatchObject({ ok: false });
    expect(canonicalPublicLedgerHash(initial)).toBe(before);
  });
});
