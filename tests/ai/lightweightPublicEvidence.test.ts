import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity, type PublicActionEvent, type PublicSeat } from "../../src/game/publicEvent";
import { finalizePublicActionEvent, type PublicActionEventDraft } from "../../src/game/publicEventHash";
import {
  applyPublicEvent,
  canonicalPublicLedgerHash,
  createInitialPublicLedger,
  resetPublicLedger,
  type HardPublicLedger,
} from "../../src/game/publicLedger";
import {
  assertLightweightPublicEvidencePrivacy,
  deriveLightweightPublicEvidence,
  type LightweightPublicEvidence,
} from "../../src/ai/belief/lightweightPublicEvidence";

const identity = buildPublicGameIdentity("d2b:evidence", 0, 0, "benchmark-scenario");
const nextHandIdentity = buildPublicGameIdentity("d2b:evidence", 1, 0, "benchmark-scenario");
const initialCounts = { 0: 27, 1: 27, 2: 27, 3: 27 } as const;

function initialLedger(openingLeader: PublicSeat = 0): HardPublicLedger {
  return createInitialPublicLedger({
    identity,
    initialHandCounts: initialCounts,
    openingLeader,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "none" },
  });
}

function nextHandLedger(): HardPublicLedger {
  return resetPublicLedger({
    identity: nextHandIdentity,
    initialHandCounts: initialCounts,
    openingLeader: 1,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "none" },
  });
}

function apply(ledger: HardPublicLedger, event: PublicActionEvent): HardPublicLedger {
  const result = applyPublicEvent(ledger, event);
  if (!result.ok) throw new Error(`TEST_PUBLIC_EVENT_INVALID:${result.error}`);
  return result.ledger;
}

function finalize(draft: PublicActionEventDraft): PublicActionEvent {
  return finalizePublicActionEvent(draft);
}

function playEvent(
  eventIndex: number,
  seat: PublicSeat,
  handCountBefore: number,
  publicCardId: string,
  trickIndex = 0,
): PublicActionEvent {
  return finalize({
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "play",
    seat,
    publicCardIds: [publicCardId],
    patternType: "single",
    groupType: "single",
    publicStableKey: `play:${publicCardId}`,
    handCountBefore,
    handCountAfter: handCountBefore - 1,
    trickIndex,
  });
}

function passEvent(eventIndex: number, seat: PublicSeat, handCount: number, trickIndex = 0): PublicActionEvent {
  return finalize({
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "pass",
    seat,
    publicStableKey: "pass:v2",
    handCountBefore: handCount,
    handCountAfter: handCount,
    trickIndex,
  });
}

function trickClearEvent(eventIndex: number, leadSeat: PublicSeat, trickIndex = 0): PublicActionEvent {
  return finalize({
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "trick-clear",
    seat: leadSeat,
    publicStableKey: `trick-clear:${trickIndex}:${trickIndex + 1}`,
    trickIndex,
    leadSeat,
  });
}

function finishEvent(eventIndex: number, seat: PublicSeat, remainingHandCount: number, trickIndex = 0): PublicActionEvent {
  return finalize({
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "finish",
    seat,
    publicStableKey: `finish:1:hand-empty`,
    trickIndex,
    finishPosition: 1,
    remainingHandCount,
    finishReason: "hand-empty",
  });
}

function tributeEvent(eventIndex: number, kind: "tribute" | "return", fromSeat: PublicSeat, toSeat: PublicSeat, cardId: string): PublicActionEvent {
  const direction = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<PublicSeat, number>;
  direction[fromSeat] = -1;
  direction[toSeat] = 1;
  return finalize({
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind,
    seat: fromSeat,
    publicCardIds: [cardId],
    fromSeat,
    toSeat,
    handCountChanges: direction,
    publicStableKey: `${kind}:${fromSeat}:${toSeat}:${cardId}`,
    trickIndex: 0,
  });
}

function antiTributeEvent(eventIndex: number): PublicActionEvent {
  return finalize({
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "anti-tribute",
    seat: 0,
    publicStableKey: "anti-tribute:anti-tribute",
    trickIndex: 0,
    reasonCode: "anti-tribute",
  });
}

function evidenceFor(ledger: HardPublicLedger, events: readonly PublicActionEvent[], perspectiveSeat: PublicSeat): LightweightPublicEvidence {
  return deriveLightweightPublicEvidence(ledger, events.slice(-16), perspectiveSeat);
}

function relationView(evidence: LightweightPublicEvidence) {
  return {
    remainingCardCounts: evidence.hardPublicFacts.remainingCardCounts,
    initiativeRelation: evidence.hardPublicFacts.initiativeRelation,
    finishOrder: evidence.hardPublicFacts.finishOrder,
    recentActions: evidence.derivedSignals.recentActions.map(({ kind, relation, trickIndex, publicStableKey }) => ({ kind, relation, trickIndex, publicStableKey })),
    recentPassStreakByRelation: evidence.derivedSignals.recentPassStreakByRelation,
    recentActionTendencies: evidence.derivedSignals.recentActionTendencies,
  };
}

function appendPublicPlay(ledger: HardPublicLedger, events: PublicActionEvent[], publicCardId: string, seat: PublicSeat): HardPublicLedger {
  const event = playEvent(ledger.nextEventIndex, seat, ledger.handCounts[seat], publicCardId, ledger.currentTrick.trickIndex);
  events.push(event);
  return apply(ledger, event);
}

function appendPublicEvent(ledger: HardPublicLedger, events: PublicActionEvent[], event: PublicActionEvent): HardPublicLedger {
  events.push(event);
  return apply(ledger, event);
}

describe("D2b lightweight public evidence characterization", () => {
  it("derives the empty new-hand public state without private input", () => {
    const evidence = evidenceFor(initialLedger(), [], 0);

    expect(evidence.eventIndex).toBe(-1);
    expect(evidence.hardPublicFacts.remainingCardCounts).toEqual({ self: 27, partner: 27, leftOpponent: 27, rightOpponent: 27 });
    expect(evidence.hardPublicFacts.playedCardIds).toEqual([]);
    expect(evidence.hardPublicFacts.publicTransfers).toEqual([]);
    expect(evidence.hardPublicFacts.finishOrder).toEqual([]);
    expect(evidence.derivedSignals.recentActions).toEqual([]);
  });

  it("derives a public play event and its public card class", () => {
    const events: PublicActionEvent[] = [];
    const event = playEvent(0, 0, 27, "C2-1");
    events.push(event);
    const evidence = evidenceFor(apply(initialLedger(), event), events, 0);

    expect(evidence.hardPublicFacts.playedCardIds).toEqual(["C2-1"]);
    expect(evidence.hardPublicFacts.playedCardClasses).toEqual(["C2"]);
    expect(evidence.hardPublicFacts.remainingCardCounts.self).toBe(26);
    expect(evidence.hardPublicFacts.initiativeRelation).toBe("self");
    expect(evidence.derivedSignals.recentPassStreakByRelation).toEqual({
      self: 0,
      partner: 0,
      leftOpponent: 0,
      rightOpponent: 0,
    });
    expect(evidence.derivedSignals.recentActions[0]).toMatchObject({
      eventIndex: 0,
      kind: "play",
      seat: 0,
      relation: "self",
      trickIndex: 0,
      publicStableKey: "play:C2-1",
      publicCardIds: ["C2-1"],
      patternType: "single",
      groupType: "single",
      handCountBefore: 27,
      handCountAfter: 26,
    });
  });

  it("derives a pass without changing public hand counts", () => {
    const play = playEvent(0, 0, 27, "C2-1");
    const pass = passEvent(1, 1, 27);
    const events = [play, pass];
    const ledger = apply(apply(initialLedger(), play), pass);
    const evidence = evidenceFor(ledger, events, 0);

    expect(evidence.hardPublicFacts.remainingCardCounts).toEqual({ self: 26, partner: 27, leftOpponent: 27, rightOpponent: 27 });
    expect(evidence.hardPublicFacts.currentTrick.lastPlaySeat).toBe(0);
    expect(evidence.hardPublicFacts.initiativeRelation).toBe("self");
    expect(evidence.derivedSignals.recentActions.map((action) => action.kind)).toEqual(["play", "pass"]);
    expect(evidence.derivedSignals.recentPassStreakByRelation).toEqual({
      self: 0,
      partner: 0,
      leftOpponent: 1,
      rightOpponent: 0,
    });
    expect(evidence.derivedSignals.recentActionTendencies.leftOpponent).toEqual({ playCount: 0, passCount: 1, lastActionKind: "pass" });
  });

  it("retains pass then trick-clear ordering and the reset current trick", () => {
    const play = playEvent(0, 0, 27, "C2-1");
    const pass = passEvent(1, 1, 27);
    const clear = trickClearEvent(2, 0);
    const events = [play, pass, clear];
    const ledger = apply(apply(apply(initialLedger(), play), pass), clear);
    const evidence = evidenceFor(ledger, events, 2);

    expect(evidence.hardPublicFacts.initiativeRelation).toBe("partner");
    expect(evidence.derivedSignals.recentActions.map((action) => action.kind)).toEqual(["play", "pass", "trick-clear"]);
    expect(evidence.derivedSignals.recentActionTendencies.partner.lastActionKind).toBe("play");
    expect(evidence.derivedSignals.recentActionTendencies.rightOpponent.lastActionKind).toBe("pass");
    expect(evidence.hardPublicFacts.currentTrick.trickIndex).toBe(1);
    expect(evidence.hardPublicFacts.currentTrick.lastPlaySeat).toBeUndefined();
    expect(evidence.hardPublicFacts.currentTrick.passSeats).toEqual([]);
  });

  it("derives finish order from a public finish event", () => {
    const play = playEvent(0, 0, 1, "C2-1");
    const finish = finishEvent(1, 0, 0);
    const events = [play, finish];
    const ledger = apply(apply(createInitialPublicLedger({ identity, initialHandCounts: { 0: 1, 1: 27, 2: 27, 3: 27 }, openingLeader: 0, initialTrickIndex: 0, openingTributePublicState: { status: "none" } }), play), finish);
    const evidence = evidenceFor(ledger, events, 0);

    expect(evidence.hardPublicFacts.finishOrder).toEqual(["self"]);
    expect(evidence.hardPublicFacts.remainingCardCounts.self).toBe(0);
    expect(evidence.derivedSignals.recentActions.map((action) => action.kind)).toEqual(["play", "finish"]);
  });

  it("preserves public tribute and return transfers separately from played cards", () => {
    const tribute = tributeEvent(0, "tribute", 0, 1, "C3-1");
    const returnEvent = tributeEvent(1, "return", 1, 0, "C4-1");
    const events = [tribute, returnEvent];
    const ledger = apply(apply(initialLedger(), tribute), returnEvent);
    const evidence = evidenceFor(ledger, events, 0);

    expect(evidence.hardPublicFacts.publicTransfers).toEqual([
      { eventIndex: 0, kind: "tribute", cardId: "C3-1", fromSeat: 0, toSeat: 1 },
      { eventIndex: 1, kind: "return", cardId: "C4-1", fromSeat: 1, toSeat: 0 },
    ]);
    expect(evidence.hardPublicFacts.publicTributeEvents).toEqual(["status=none"]);
    expect(evidence.hardPublicFacts.remainingCardCounts).toEqual({
      self: 27,
      partner: 27,
      leftOpponent: 27,
      rightOpponent: 27,
    });
    expect(evidence.hardPublicFacts.playedCardIds).toEqual([]);
    expect(evidence.derivedSignals.recentActions.map((action) => action.kind)).toEqual(["tribute", "return"]);
  });

  it("retains a public anti-tribute event without a card transfer", () => {
    const event = antiTributeEvent(0);
    const evidence = evidenceFor(apply(initialLedger(), event), [event], 0);

    expect(evidence.hardPublicFacts.publicTransfers).toEqual([]);
    expect(evidence.hardPublicFacts.publicTributeEvents).toContain("anti-tribute:anti-tribute");
    expect(evidence.derivedSignals.recentActions[0]).toMatchObject({ kind: "anti-tribute", relation: "self" });
  });

  it("bounds the canonical recent window to the last 16 public events", () => {
    const events: PublicActionEvent[] = [];
    let ledger = initialLedger();
    ledger = appendPublicPlay(ledger, events, "C2-1", 0);
    ledger = appendPublicEvent(ledger, events, passEvent(ledger.nextEventIndex, 1, ledger.handCounts[1], ledger.currentTrick.trickIndex));
    ledger = appendPublicPlay(ledger, events, "C2-2", 2);
    ledger = appendPublicEvent(ledger, events, trickClearEvent(ledger.nextEventIndex, 2, ledger.currentTrick.trickIndex));
    ledger = appendPublicPlay(ledger, events, "C3-1", 2);
    ledger = appendPublicEvent(ledger, events, passEvent(ledger.nextEventIndex, 3, ledger.handCounts[3], ledger.currentTrick.trickIndex));
    ledger = appendPublicEvent(ledger, events, trickClearEvent(ledger.nextEventIndex, 2, ledger.currentTrick.trickIndex));
    ledger = appendPublicEvent(ledger, events, tributeEvent(ledger.nextEventIndex, "tribute", 0, 1, "C4-1"));
    ledger = appendPublicEvent(ledger, events, tributeEvent(ledger.nextEventIndex, "return", 1, 0, "C5-1"));
    ledger = appendPublicPlay(ledger, events, "C4-2", 1);
    ledger = appendPublicEvent(ledger, events, passEvent(ledger.nextEventIndex, 0, ledger.handCounts[0], ledger.currentTrick.trickIndex));
    ledger = appendPublicEvent(ledger, events, trickClearEvent(ledger.nextEventIndex, 1, ledger.currentTrick.trickIndex));
    ledger = appendPublicPlay(ledger, events, "C5-2", 1);
    ledger = appendPublicEvent(ledger, events, passEvent(ledger.nextEventIndex, 3, ledger.handCounts[3], ledger.currentTrick.trickIndex));
    ledger = appendPublicEvent(ledger, events, trickClearEvent(ledger.nextEventIndex, 1, ledger.currentTrick.trickIndex));
    ledger = appendPublicPlay(ledger, events, "C6-1", 3);
    ledger = appendPublicEvent(ledger, events, passEvent(ledger.nextEventIndex, 0, ledger.handCounts[0], ledger.currentTrick.trickIndex));

    const evidence = evidenceFor(ledger, events, 0);
    const retained = events.slice(-16);

    expect(events).toHaveLength(17);
    expect(evidence.derivedSignals.recentActions).toHaveLength(16);
    expect(evidence.derivedSignals.recentActions.map((action) => action.eventIndex)).toEqual(retained.map((event) => event.eventIndex));
    expect(evidence.derivedSignals.recentActions.map((action) => action.kind)).toEqual(retained.map((event) => event.kind));
    expect(evidence.derivedSignals.recentActions.map((action) => action.publicStableKey)).toEqual(retained.map((event) => event.publicStableKey));
    expect(evidence.derivedSignals.recentActions.some((action) => action.kind === "trick-clear")).toBe(true);
    expect(evidence.derivedSignals.recentActions.some((action) => action.kind === "tribute" || action.kind === "return")).toBe(true);
    expect(evidence.derivedSignals.recentActions[0]?.eventIndex).toBe(retained[0]?.eventIndex);
    expect(evidence.derivedSignals.recentActions.at(-1)?.eventIndex).toBe(retained.at(-1)?.eventIndex);
  });

  it("maps self, partner, left opponent and right opponent for every perspective seat", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);
    const expected = [
      { self: 0, partner: 2, leftOpponent: 1, rightOpponent: 3 },
      { self: 1, partner: 3, leftOpponent: 2, rightOpponent: 0 },
      { self: 2, partner: 0, leftOpponent: 3, rightOpponent: 1 },
      { self: 3, partner: 1, leftOpponent: 0, rightOpponent: 2 },
    ];

    for (const perspectiveSeat of [0, 1, 2, 3] as const) {
      const evidence = evidenceFor(ledger, [event], perspectiveSeat);
      expect(evidence.seatMap).toEqual(expected[perspectiveSeat]);
    }
  });

  it("is equivariant under a stable public seat permutation", () => {
    const originalEvent = playEvent(0, 0, 27, "C2-1");
    const permutedEvent = playEvent(0, 1, 27, "C2-1");
    const original = evidenceFor(apply(initialLedger(0), originalEvent), [originalEvent], 0);
    const permuted = evidenceFor(apply(initialLedger(1), permutedEvent), [permutedEvent], 1);

    expect(relationView(permuted)).toEqual(relationView(original));
    expect(permuted.hardPublicFacts.playedCardIds).toEqual(original.hardPublicFacts.playedCardIds);
  });

  it("derives the same evidence bytes repeatedly", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);
    const first = evidenceFor(ledger, [event], 0);
    const second = evidenceFor(ledger, [event], 0);
    const third = evidenceFor(ledger, [event], 0);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(third)).toBe(JSON.stringify(first));
  });

  it("does not change the canonical ledger hash or serialized ledger", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);
    const beforeHash = canonicalPublicLedgerHash(ledger);
    const beforeBytes = JSON.stringify(ledger);

    evidenceFor(ledger, [event], 0);

    expect(canonicalPublicLedgerHash(ledger)).toBe(beforeHash);
    expect(JSON.stringify(ledger)).toBe(beforeBytes);
  });

  it("accepts valid evidence and rejects recursively injected private fields", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const evidence = evidenceFor(apply(initialLedger(), event), [event], 0);

    expect(() => assertLightweightPublicEvidencePrivacy(evidence)).not.toThrow();
    expect(() => assertLightweightPublicEvidencePrivacy({ evidence, nested: { ParticleBank: {} } })).toThrow("D2B_EVIDENCE_PRIVACY_VIOLATION");
    expect(() => assertLightweightPublicEvidencePrivacy({ evidence, nested: [{ hiddenState: true }] })).toThrow("D2B_EVIDENCE_PRIVACY_VIOLATION");
    expect(() => assertLightweightPublicEvidencePrivacy({ evidence, nested: { providerIdentity: "private" } })).toThrow("D2B_EVIDENCE_PRIVACY_VIOLATION");
  });

  it("fails closed for inconsistent public identity, hash, index and recent-window input", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);

    expect(() => deriveLightweightPublicEvidence({ ...ledger, handIdentity: nextHandIdentity.handIdentity }, [event], 0)).toThrow("D2B_PUBLIC_EVIDENCE");
    expect(() => deriveLightweightPublicEvidence(ledger, [{ ...event, publicPayloadHash: "0".repeat(64) }], 0)).toThrow("D2B_PUBLIC_EVIDENCE");
    expect(() => deriveLightweightPublicEvidence(ledger, [{ ...event, eventIndex: 4 }], 0)).toThrow("D2B_PUBLIC_EVIDENCE");
    expect(() => deriveLightweightPublicEvidence(ledger, [], 0)).toThrow("D2B_PUBLIC_EVIDENCE");
    expect(() => deriveLightweightPublicEvidence(ledger, [event, event], 0)).toThrow("D2B_PUBLIC_EVIDENCE");
  });

  it("isolates a reset hand from the previous public event stream", () => {
    const firstEvent = playEvent(0, 0, 27, "C2-1");
    const firstLedger = apply(initialLedger(), firstEvent);
    const nextLedger = nextHandLedger();
    const nextEvidence = evidenceFor(nextLedger, [], 1);

    expect(nextEvidence.handIdentity).toBe(nextHandIdentity.handIdentity);
    expect(nextEvidence.eventIndex).toBe(-1);
    expect(nextEvidence.hardPublicFacts.playedCardIds).toEqual([]);
    expect(nextEvidence.derivedSignals.recentActions).toEqual([]);
    expect(() => deriveLightweightPublicEvidence(nextLedger, [firstEvent], 1)).toThrow("D2B_PUBLIC_EVIDENCE");
    expect(firstLedger.handIdentity).not.toBe(nextEvidence.handIdentity);
  });

  it("keeps hard public facts monotonic across a valid public play", () => {
    const before = evidenceFor(initialLedger(), [], 0);
    const event = playEvent(0, 0, 27, "C2-1");
    const after = evidenceFor(apply(initialLedger(), event), [event], 0);

    expect(after.hardPublicFacts.playedCardIds).toEqual([...before.hardPublicFacts.playedCardIds, "C2-1"]);
    expect(after.hardPublicFacts.playedCardClasses).toEqual([...before.hardPublicFacts.playedCardClasses, "C2"]);
    expect(after.hardPublicFacts.remainingCardCounts.self).toBe(before.hardPublicFacts.remainingCardCounts.self - 1);
    expect(after.hardPublicFacts.finishOrder).toEqual(before.hardPublicFacts.finishOrder);
  });

  it("keeps the evidence module within the public-only source boundary", () => {
    const source = readFileSync(new URL("../../src/ai/belief/lightweightPublicEvidence.ts", import.meta.url), "utf8");

    expect(source).toMatch(/from\s+["']\.\.\/\.\.\/game\/publicEvent["']/);
    expect(source).toMatch(/from\s+["']\.\.\/\.\.\/game\/publicEventHash["']/);
    expect(source).toMatch(/from\s+["']\.\.\/\.\.\/game\/publicLedger["']/);
    expect(source).not.toMatch(/RoomState|hands|initialHands|deck|AiRuntimeState|HandPlanner|generateHandPlans|ParticleBank|particles|rollout|treatment|server|provider|store/);
  });
});
