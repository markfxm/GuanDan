import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
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
const evidencePrivacyViolation = "D2B_EVIDENCE_PRIVACY_VIOLATION";
const forbiddenPrivacyKeys = [
  "partnerHand",
  "opponentsHands",
  "hands",
  "initialHands",
  "deck",
  "hiddenInitialHand",
  "hiddenState",
  "fullState",
  "hypotheticalHands",
  "ParticleBank",
  "particles",
  "provider",
  "store",
  "identityProvider",
  "identityStore",
  "providerIdentity",
  "installationIdentity",
  "idempotencyKey",
  "gameSequence",
  "roomTransportId",
] as const;

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

function collectUnfrozenPaths(value: unknown, path = "$", seen = new Set<object>()): string[] {
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const paths = Object.isFrozen(value) ? [] : [path];
  for (const [key, child] of Object.entries(value)) {
    paths.push(...collectUnfrozenPaths(child, `${path}.${key}`, seen));
  }
  return paths;
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

function expectPrivacyViolation(value: unknown): void {
  let error: unknown;
  try {
    assertLightweightPublicEvidencePrivacy(value);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(evidencePrivacyViolation);
}

function punctuatedUppercaseKey(key: string): string {
  return key.toUpperCase().split("").join("-");
}

function expectDerivationFailurePreservesLedger(validLedger: HardPublicLedger, action: () => void): void {
  const beforeJson = JSON.stringify(validLedger);
  const beforeHash = canonicalPublicLedgerHash(validLedger);

  expect(action).toThrow("D2B_PUBLIC_EVIDENCE");
  expect(JSON.stringify(validLedger)).toBe(beforeJson);
  expect(canonicalPublicLedgerHash(validLedger)).toBe(beforeHash);
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

  it("emits complete deterministic public provenance", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);
    const first = evidenceFor(ledger, [event], 0);
    const second = evidenceFor(ledger, [event], 0);
    const expectedFields = [
      "identity/index",
      "perspective/seatMap",
      "remainingCardCounts",
      "currentTrick",
      "initiativeRelation",
      "playedCardIds",
      "playedCardClasses",
      "publicTransfers",
      "publicTributeEvents",
      "finishOrder",
      "recentActions",
      "recentPassStreakByRelation",
      "recentActionTendencies",
      "provenance",
    ];

    expect(first.provenance).toHaveLength(14);
    expect(first.provenance.map((row) => row.field)).toEqual(expectedFields);
    expect(first.provenance.every((row) => row.hiddenStateRisk === "none")).toBe(true);
    expect(first.provenance.every((row) => row.hashImpact === "none")).toBe(true);
    expect(
      first.provenance.every(
        (row) => row.publicSource === "HardPublicLedger" || row.publicSource === "PublicActionEvent[]",
      ),
    ).toBe(true);
    const provenanceSourceByField = Object.fromEntries(
      first.provenance.map((row) => [row.field, row.publicSource]),
    );
    expect(provenanceSourceByField).toMatchObject({
      "identity/index": "HardPublicLedger",
      remainingCardCounts: "HardPublicLedger",
      currentTrick: "HardPublicLedger",
      initiativeRelation: "HardPublicLedger",
      playedCardIds: "HardPublicLedger",
      playedCardClasses: "HardPublicLedger",
      publicTransfers: "HardPublicLedger",
      publicTributeEvents: "HardPublicLedger",
      finishOrder: "HardPublicLedger",
      recentActions: "PublicActionEvent[]",
      recentPassStreakByRelation: "PublicActionEvent[]",
      recentActionTendencies: "PublicActionEvent[]",
    });
    expect(first.provenance.every((row) => row.field.length > 0 && row.derivation.length > 0)).toBe(true);
    expect(second.provenance).toEqual(first.provenance);
    expect(JSON.stringify(second.provenance)).toBe(JSON.stringify(first.provenance));
  });

  it("deep-freezes the complete evidence graph without aliasing inputs", () => {
    const play = playEvent(0, 0, 27, "C2-1");
    const pass = passEvent(1, 1, 27);
    const tribute = tributeEvent(2, "tribute", 0, 1, "C3-1");
    const returnEvent = tributeEvent(3, "return", 1, 0, "C4-1");
    const events = [play, pass, tribute, returnEvent];
    const ledger = apply(apply(apply(apply(initialLedger(), play), pass), tribute), returnEvent);
    const inputFreezeStateBefore = {
      ledger: Object.isFrozen(ledger),
      currentTrick: Object.isFrozen(ledger.currentTrick),
      passSeats: Object.isFrozen(ledger.currentTrick.passSeats),
      events: Object.isFrozen(events),
      event: Object.isFrozen(events[0]),
    };

    const evidence = evidenceFor(ledger, events, 0);
    const playAction = evidence.derivedSignals.recentActions.find((action) => action.kind === "play");
    const inputFreezeStateAfter = {
      ledger: Object.isFrozen(ledger),
      currentTrick: Object.isFrozen(ledger.currentTrick),
      passSeats: Object.isFrozen(ledger.currentTrick.passSeats),
      events: Object.isFrozen(events),
      event: Object.isFrozen(events[0]),
    };

    expect(collectUnfrozenPaths(evidence)).toEqual([]);
    expect(evidence.hardPublicFacts.currentTrick).not.toBe(ledger.currentTrick);
    expect(evidence.hardPublicFacts.currentTrick.passSeats).not.toBe(ledger.currentTrick.passSeats);
    expect(evidence.hardPublicFacts.playedCardIds).not.toBe(ledger.playedCardIds);
    expect(evidence.hardPublicFacts.publicTransfers).not.toBe(ledger.revealedTransferEvents);
    expect(evidence.hardPublicFacts.publicTributeEvents).not.toBe(ledger.publicTributeEvents);
    expect(evidence.derivedSignals.recentActions).not.toBe(events);
    expect(playAction?.publicCardIds).not.toBe(play.publicCardIds);
    expect(evidence.hardPublicFacts.publicTransfers[0]).not.toBe(ledger.revealedTransferEvents[0]);
    expect(inputFreezeStateAfter).toEqual(inputFreezeStateBefore);
  });

  it("accepts valid evidence and rejects recursively injected private fields", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const evidence = evidenceFor(apply(initialLedger(), event), [event], 0);

    expect(() => assertLightweightPublicEvidencePrivacy(evidence)).not.toThrow();
    expectPrivacyViolation({ evidence, nested: { ParticleBank: {} } });
    expectPrivacyViolation({ evidence, nested: [{ hiddenState: true }] });
    expectPrivacyViolation({ evidence, nested: { providerIdentity: "private" } });
  });

  it("rejects every exact forbidden privacy key recursively", () => {
    for (const forbiddenKey of forbiddenPrivacyKeys) {
      expectPrivacyViolation({
        safeEnvelope: [
          {
            nested: {
              [forbiddenKey]: {
                value: true,
              },
            },
          },
        ],
      });
    }
  });

  it("rejects normalized forbidden privacy key variants recursively", () => {
    for (const forbiddenKey of forbiddenPrivacyKeys) {
      expectPrivacyViolation({
        safeEnvelope: [
          {
            nested: {
              [punctuatedUppercaseKey(forbiddenKey)]: {
                value: true,
              },
            },
          },
        ],
      });
    }
  });

  it("allows public identity keys and actual evidence through privacy scanning", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const evidence = evidenceFor(apply(initialLedger(), event), [event], 0);

    expect(() =>
      assertLightweightPublicEvidencePrivacy({
        gameId: "g",
        nested: [
          {
            roundIdentity: "r",
            deeper: {
              handIdentity: "h",
            },
          },
        ],
      }),
    ).not.toThrow();
    expect(() => assertLightweightPublicEvidencePrivacy(evidence)).not.toThrow();
  });

  it("does not scan ordinary string values for forbidden privacy words", () => {
    expect(() =>
      assertLightweightPublicEvidencePrivacy({
        label: "provider",
        note: "ParticleBank",
      }),
    ).not.toThrow();
  });

  it("handles cycles and still detects forbidden keys inside a cycle graph", () => {
    const safeCycle: Record<string, unknown> = {};
    safeCycle.self = safeCycle;

    const unsafeCycle: Record<string, unknown> = {};
    unsafeCycle.self = unsafeCycle;
    unsafeCycle.nested = {
      hiddenState: true,
    };

    expect(() => assertLightweightPublicEvidencePrivacy(safeCycle)).not.toThrow();
    expectPrivacyViolation(unsafeCycle);
  });

  it("fails closed for inconsistent public identity, hash, index and recent-window input", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);

    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence({ ...ledger, handIdentity: nextHandIdentity.handIdentity }, [event], 0));
    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(ledger, [{ ...event, publicPayloadHash: "0".repeat(64) }], 0));
    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(ledger, [{ ...event, eventIndex: 4 }], 0));
    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(ledger, [], 0));
    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(ledger, [event, event], 0));
  });

  it("fails closed for recent summary mismatch without mutating the valid ledger", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);
    const malformedLedger = {
      ...ledger,
      recentActionSummaries: [
        {
          ...ledger.recentActionSummaries[0],
          publicStableKey: "play:wrong-card",
        },
      ],
    } as HardPublicLedger;

    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(malformedLedger, [event], 0));
  });

  it("fails closed when ledger summaries and recent events are both truncated", () => {
    const first = playEvent(0, 0, 27, "C2-1");
    const second = passEvent(1, 1, 27);
    const validLedger = apply(apply(initialLedger(), first), second);
    const malformedLedger = {
      ...validLedger,
      recentActionSummaries: validLedger.recentActionSummaries.slice(-1),
    } as HardPublicLedger;

    expect(validLedger.lastAppliedEventIndex).toBe(1);
    expect(validLedger.recentActionSummaries).toHaveLength(2);
    expect(malformedLedger.recentActionSummaries).toHaveLength(1);
    expect([second]).toHaveLength(malformedLedger.recentActionSummaries.length);
    expectDerivationFailurePreservesLedger(
      validLedger,
      () => deriveLightweightPublicEvidence(malformedLedger, [second], 0),
    );
  });

  it("fails closed for negative hand counts, duplicate public seats and invalid perspective", () => {
    const event = playEvent(0, 0, 27, "C2-1");
    const ledger = apply(initialLedger(), event);
    const negativeHandCountLedger = {
      ...ledger,
      handCounts: {
        ...ledger.handCounts,
        1: -1,
      },
    } as HardPublicLedger;
    const duplicatePassLedger = {
      ...ledger,
      currentTrick: {
        ...ledger.currentTrick,
        passSeats: [1, 1],
      },
    } as HardPublicLedger;

    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(negativeHandCountLedger, [event], 0));
    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(duplicatePassLedger, [event], 0));
    expectDerivationFailurePreservesLedger(ledger, () => deriveLightweightPublicEvidence(ledger, [event], 4 as PublicSeat));
  });

  it("fails closed when a public transfer index exceeds the ledger tail", () => {
    const tribute = tributeEvent(0, "tribute", 0, 1, "C3-1");
    const returnEvent = tributeEvent(1, "return", 1, 0, "C4-1");
    const validLedger = apply(apply(initialLedger(), tribute), returnEvent);
    const malformedLedger = {
      ...validLedger,
      revealedTransferEvents: validLedger.revealedTransferEvents.map((transfer, index) =>
        index === 1 ? { ...transfer, eventIndex: validLedger.lastAppliedEventIndex + 1 } : transfer,
      ),
    } as HardPublicLedger;

    expect(() => deriveLightweightPublicEvidence(malformedLedger, [tribute, returnEvent], 0)).toThrow("D2B_PUBLIC_EVIDENCE");
  });

  it("fails closed when public transfer indexes are not strictly increasing", () => {
    const tribute = tributeEvent(0, "tribute", 0, 1, "C3-1");
    const returnEvent = tributeEvent(1, "return", 1, 0, "C4-1");
    const validLedger = apply(apply(initialLedger(), tribute), returnEvent);
    const malformedLedger = {
      ...validLedger,
      revealedTransferEvents: [
        validLedger.revealedTransferEvents[1],
        validLedger.revealedTransferEvents[0],
      ],
    } as HardPublicLedger;

    expect(() => deriveLightweightPublicEvidence(malformedLedger, [tribute, returnEvent], 0)).toThrow("D2B_PUBLIC_EVIDENCE");
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
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/ai/belief/lightweightPublicEvidence.ts",
      ),
      "utf8",
    );
    const sourceFile = ts.createSourceFile(
      "lightweightPublicEvidence.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const importSources: string[] = [];
    const identifiers = new Set<string>();
    const forbiddenPrivateIdentifiers = [
      "RoomState",
      "hands",
      "initialHands",
      "deck",
      "AiRuntimeState",
      "HandPlanner",
      "generateHandPlans",
      "ParticleBank",
      "particles",
      "rollout",
      "treatment",
      "server",
      "provider",
      "store",
    ] as const;
    let sideEffectImportCount = 0;
    let dynamicImportCount = 0;
    let requireCallCount = 0;

    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node)) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          importSources.push(node.moduleSpecifier.text);
        }
        if (node.importClause === undefined) sideEffectImportCount += 1;
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        dynamicImportCount += 1;
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
        requireCallCount += 1;
      }
      if (ts.isIdentifier(node)) identifiers.add(node.text);
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    expect([...new Set(importSources)].sort()).toEqual([
      "../../game/publicEvent",
      "../../game/publicEventHash",
      "../../game/publicLedger",
    ].sort());
    expect(sideEffectImportCount).toBe(0);
    expect(dynamicImportCount).toBe(0);
    expect(requireCallCount).toBe(0);
    expect(importSources.some((sourcePath) => /room|planning|runtimeContracts|aiDecisionEngine|server|provider|store|particle|rollout|treatment/.test(sourcePath))).toBe(false);
    expect(forbiddenPrivateIdentifiers.filter((identifier) => identifiers.has(identifier))).toEqual([]);
  });

  it("does not integrate lightweight evidence into the frozen production decision path", () => {
    const frozenProductionFiles = [
      "src/game/room.ts",
      "src/ai/contracts.ts",
      "src/ai/runtimeContracts.ts",
      "src/ai/aiDecisionEngine.ts",
      "src/ai/planning/handPlanner.ts",
    ] as const;
    const forbiddenIntegrationIdentifiers = [
      "LightweightPublicEvidence",
      "deriveLightweightPublicEvidence",
      "assertLightweightPublicEvidencePrivacy",
      "lightweightPublicEvidence",
    ] as const;
    const forbiddenIntegrationValues = new Set<string>(forbiddenIntegrationIdentifiers);
    const violations: Array<{
      file: string;
      kind: "import" | "identifier" | "dynamic-import" | "require" | "string-literal";
      value: string;
    }> = [];

    for (const file of frozenProductionFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const identifiers = new Set<string>();

      function stringArgumentValue(node: ts.Expression): string | undefined {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
        return undefined;
      }

      function visit(node: ts.Node): void {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const value = node.moduleSpecifier.text;
          if (/lightweightPublicEvidence/.test(value)) violations.push({ file, kind: "import", value });
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const value = node.arguments[0] ? stringArgumentValue(node.arguments[0]) : undefined;
          if (value !== undefined && /lightweightPublicEvidence/.test(value)) {
            violations.push({ file, kind: "dynamic-import", value });
          }
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
          const value = node.arguments[0] ? stringArgumentValue(node.arguments[0]) : undefined;
          if (value !== undefined && /lightweightPublicEvidence/.test(value)) {
            violations.push({ file, kind: "require", value });
          }
        }
        if (ts.isIdentifier(node)) identifiers.add(node.text);
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && forbiddenIntegrationValues.has(node.text)) {
          violations.push({ file, kind: "string-literal", value: node.text });
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);

      for (const identifier of forbiddenIntegrationIdentifiers) {
        if (identifiers.has(identifier)) violations.push({ file, kind: "identifier", value: identifier });
      }
    }

    expect(violations).toEqual([]);
  });
});
