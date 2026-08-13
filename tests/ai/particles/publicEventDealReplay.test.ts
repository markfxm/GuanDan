import { beforeAll, describe, expect, test } from "vitest";
import { buildPublicGameIdentity, playPublicStableKey, passPublicStableKey, trickClearPublicStableKey, tributePublicStableKey, type PublicActionEvent, type PublicActionEventDraft, type PublicGameIdentity, type PublicSeat } from "../../../src/game/publicEvent";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import { applyPublicEvent, canonicalPublicLedgerHash, createInitialPublicLedger, type HardPublicLedger } from "../../../src/game/publicLedger";
import { createDeck, type Card, type GameRank } from "../../../src/engine/cards";
import { detectGroups, type CardGroup } from "../../../src/engine/groups";
import type { CanonicalInitialDeal, HiddenTransferAssignment, ParticleReplayResult, ParticleScenario } from "../../../src/ai/particles/contracts";

type ActingSeatInitialDealConstraints = Readonly<{
  terminalOwnCurrentHand: readonly Card[];
  ownPublicPlayedCardIds: readonly string[];
  knownRevealedIncomingTransferCardIds: readonly string[];
  knownRevealedOutgoingTransferCardIds: readonly string[];
  unresolvedIncomingTransferSlotCount: number;
  unresolvedOutgoingTransferSlotCount: number;
  expectedInitialHandCount: number;
  expectedCurrentHandCount: number;
  publicEventConsistency: Readonly<{
    historyFirstEventIndex: 0;
    historyLastEventIndex: number;
    expectedFinalEventIndex: number;
    expectedFinalLedgerHash: string;
  }>;
  deterministicInitialHand?: readonly Card[];
}>;

type PublicLedgerCatchUpResult =
  | { ok: true; finalLedger: HardPublicLedger; finalLedgerHash: string; idempotentDuplicateCount: number }
  | { ok: false; error: "EVENT_INDEX_CONFLICT" | "EVENT_INDEX_GAP" | "OUT_OF_ORDER" | "IDENTITY_MISMATCH" | "EVENT_HASH_INVALID" | "STALE_SNAPSHOT" | "FINAL_HASH_MISMATCH" };

type ReplayModule = typeof import("../../../src/ai/particles/publicEventDealReplay");
type ReplayInput = Readonly<{
  scenario: ParticleScenario;
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
}>;

let replayModule!: ReplayModule;
const replayModulePath = "../../../src/ai/particles/publicEventDealReplay";

type FixtureOptions = Readonly<{
  revealTribute?: boolean;
  revealReturn?: boolean;
}>;

type Fixture = Readonly<{
  identity: PublicGameIdentity;
  gameRank: GameRank;
  deal: CanonicalInitialDeal;
  scenario: ParticleScenario;
  initialLedger: HardPublicLedger;
  baseLedger: HardPublicLedger;
  publicHistoryEvents: readonly PublicActionEvent[];
  pendingPublicEvents: readonly PublicActionEvent[];
  finalLedger: HardPublicLedger;
  finalLedgerHash: string;
  ownCurrentHand: readonly Card[];
  playCard: Card;
  hiddenTributeCard: Card;
  returnedCard: Card;
  laterPlayCard: Card;
}>;

function makeDeal(deck: readonly Card[]): CanonicalInitialDeal {
  return {
    schemaVersion: "d2-particle-initial-deal-v1",
    hands: {
      0: deck.slice(0, 27),
      1: deck.slice(27, 54),
      2: deck.slice(54, 81),
      3: deck.slice(81, 108),
    },
  };
}

function makePlayEvent(identity: PublicGameIdentity, eventIndex: number, seat: PublicSeat, trickIndex: number, cardId: string, handCountBefore: number): PublicActionEvent {
  const publicCardIds = [cardId];
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "play",
    seat,
    publicStableKey: playPublicStableKey(publicCardIds),
    trickIndex,
    publicCardIds,
    patternType: "single",
    groupType: "single",
    handCountBefore,
    handCountAfter: handCountBefore - publicCardIds.length,
  };
  return finalizePublicActionEvent(draft);
}

function makePassEvent(identity: PublicGameIdentity, eventIndex: number, seat: PublicSeat, trickIndex: number, handCount: number): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "pass",
    seat,
    publicStableKey: passPublicStableKey(),
    trickIndex,
    handCountBefore: handCount,
    handCountAfter: handCount,
  };
  return finalizePublicActionEvent(draft);
}

function makeTransferEvent(identity: PublicGameIdentity, eventIndex: number, kind: "tribute" | "return", fromSeat: PublicSeat, toSeat: PublicSeat, trickIndex: number, publicCardIds: readonly [string] | readonly [], handCountChanges: Readonly<Record<PublicSeat, number>>): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind,
    seat: fromSeat,
    publicStableKey: tributePublicStableKey(kind, fromSeat, toSeat, publicCardIds[0]),
    trickIndex,
    publicCardIds,
    fromSeat,
    toSeat,
    handCountChanges,
  };
  return finalizePublicActionEvent(draft);
}

function makeTrickClearEvent(identity: PublicGameIdentity, eventIndex: number, trickIndex: number, leadSeat: PublicSeat): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "trick-clear",
    seat: leadSeat,
    publicStableKey: trickClearPublicStableKey(trickIndex, trickIndex + 1),
    trickIndex,
    leadSeat,
  };
  return finalizePublicActionEvent(draft);
}

function makeFinishEvent(identity: PublicGameIdentity, eventIndex: number, seat: PublicSeat, trickIndex: number, remainingHandCount: number): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "finish",
    seat,
    publicStableKey: `finish:${1}:round-settlement`,
    trickIndex,
    finishPosition: 1,
    remainingHandCount,
    finishReason: "round-settlement",
  };
  return finalizePublicActionEvent(draft);
}

function applyEvents(initialLedger: HardPublicLedger, events: readonly PublicActionEvent[]): HardPublicLedger {
  let ledger = initialLedger;
  for (const event of events) {
    const result = applyPublicEvent(ledger, event);
    if (result.ok) {
      ledger = result.ledger;
      continue;
    }
    throw new Error("FIXTURE_EVENT_REJECTED");
  }
  return ledger;
}

function makeFixture(options: FixtureOptions = {}): Fixture {
  const revealTribute = options.revealTribute ?? false;
  const revealReturn = options.revealReturn ?? true;
  const deck = createDeck();
  const identity = buildPublicGameIdentity("task2-public-replay-fixture", 0, 0, "benchmark-scenario");
  const gameRank: GameRank = "K";
  const deal = makeDeal(deck);
  const playCard = deal.hands[0][0];
  const hiddenTributeCard = deal.hands[0][1];
  const returnedCard = deal.hands[1][0];
  const laterPlayCard = deal.hands[1][1];
  const initialLedger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { state: "open" },
  });
  const tributeCardIds: readonly [string] | readonly [] = revealTribute ? [hiddenTributeCard.id] : [];
  const returnCardIds: readonly [string] | readonly [] = revealReturn ? [returnedCard.id] : [];
  const publicHistoryEvents: readonly PublicActionEvent[] = [
    makeTransferEvent(identity, 0, "tribute", 0, 1, 0, tributeCardIds, { 0: -1, 1: 1, 2: 0, 3: 0 }),
    makeTransferEvent(identity, 1, "return", 1, 0, 0, returnCardIds, { 0: 1, 1: -1, 2: 0, 3: 0 }),
    makePlayEvent(identity, 2, 0, 0, playCard.id, 27),
    makePassEvent(identity, 3, 1, 0, 27),
    makeTrickClearEvent(identity, 4, 0, 1),
    makePlayEvent(identity, 5, 1, 1, laterPlayCard.id, 27),
    makePassEvent(identity, 6, 2, 1, 27),
    makeFinishEvent(identity, 7, 0, 1, 26),
  ];
  const hiddenTransferAssignments: HiddenTransferAssignment[] = [];
  if (!revealTribute) hiddenTransferAssignments.push({ eventIndex: 0, eventKind: "tribute", fromSeat: 0, toSeat: 1, cardId: hiddenTributeCard.id });
  if (!revealReturn) hiddenTransferAssignments.push({ eventIndex: 1, eventKind: "return", fromSeat: 1, toSeat: 0, cardId: returnedCard.id });
  const scenario: ParticleScenario = { schemaVersion: "d2-particle-scenario-v1", initialDeal: deal, hiddenTransferAssignments };
  const baseLedger = applyEvents(initialLedger, publicHistoryEvents.slice(0, 5));
  const finalLedger = applyEvents(initialLedger, publicHistoryEvents);
  const ownCurrentHand = [...deal.hands[0].filter((card) => card.id !== playCard.id && card.id !== hiddenTributeCard.id), returnedCard];
  return {
    identity,
    gameRank,
    deal,
    scenario,
    initialLedger,
    baseLedger,
    publicHistoryEvents,
    pendingPublicEvents: publicHistoryEvents.slice(5),
    finalLedger,
    finalLedgerHash: canonicalPublicLedgerHash(finalLedger),
    ownCurrentHand,
    playCard,
    hiddenTributeCard,
    returnedCard,
    laterPlayCard,
  };
}

function publicCardIdsForEvent(event: PublicActionEvent): readonly string[] {
  return event.kind === "play" || event.kind === "tribute" || event.kind === "return" ? event.publicCardIds : [];
}

function runExistingFixturePreflight(): void {
  const deck = createDeck();
  const fixture = makeFixture();
  const deckIds = deck.map((card) => card.id);

  expect(deck).toHaveLength(108);
  expect(new Set(deckIds).size).toBe(108);
  expect(fixture.initialLedger.lastAppliedEventIndex).toBe(-1);
  expect(fixture.initialLedger.nextEventIndex).toBe(0);
  expect(fixture.initialLedger.seenEventHashes).toEqual({});
  expect(fixture.publicHistoryEvents.map((event) => event.eventIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  for (const event of fixture.publicHistoryEvents) {
    expect(event.publicPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(event.gameId).toBe(fixture.identity.gameId);
    expect(event.roundIdentity).toBe(fixture.identity.roundIdentity);
    expect(event.handIdentity).toBe(fixture.identity.handIdentity);
  }
  expect(() => applyEvents(fixture.initialLedger, fixture.publicHistoryEvents)).not.toThrow();
  expect(fixture.baseLedger).toEqual(applyEvents(fixture.initialLedger, fixture.publicHistoryEvents.slice(0, 5)));
  expect(fixture.baseLedger.lastAppliedEventIndex).toBe(4);
  expect(fixture.pendingPublicEvents[0].eventIndex).toBe(fixture.baseLedger.lastAppliedEventIndex + 1);
  expect(fixture.pendingPublicEvents).toEqual(fixture.publicHistoryEvents.slice(5));
  expect(fixture.pendingPublicEvents).not.toBe(fixture.publicHistoryEvents);
  expect(fixture.publicHistoryEvents[0].eventIndex).toBe(0);
  expect(fixture.publicHistoryEvents.at(-1)?.eventIndex).toBe(7);
  expect(fixture.finalLedger.lastAppliedEventIndex).toBe(7);
  expect(canonicalPublicLedgerHash(fixture.finalLedger)).toBe(fixture.finalLedgerHash);
  expect(fixture.finalLedger).toEqual(applyEvents(fixture.initialLedger, fixture.publicHistoryEvents));
  expect(fixture.publicHistoryEvents.flatMap(publicCardIdsForEvent)).toContain(fixture.playCard.id);
  const event4 = fixture.publicHistoryEvents[4];
  const event5 = fixture.publicHistoryEvents[5];
  const event6 = fixture.publicHistoryEvents[6];
  if (event4.kind !== "trick-clear" || event5.kind !== "play" || event6.kind !== "pass") throw new Error("EVENT4_5_6_SEQUENCE_INVALID");
  expect(event5.seat).toBe(1);
  expect(event5.publicCardIds).toEqual([fixture.laterPlayCard.id]);
  const expectedEvent5GroupA = event5GroupForRank(fixture, "K");
  const expectedEvent5GroupB = event5GroupForRank(fixture, "Q");
  expect(expectedEvent5GroupA).not.toEqual(expectedEvent5GroupB);
}

beforeAll(async () => {
  runExistingFixturePreflight();
  replayModule = await import(/* @vite-ignore */ replayModulePath);
});

function deriveConstraints(fixture: Fixture): ActingSeatInitialDealConstraints {
  return replayModule.deriveActingSeatInitialDealConstraints({
    publicHistoryEvents: fixture.publicHistoryEvents,
    baseLedger: fixture.baseLedger,
    pendingPublicEvents: fixture.pendingPublicEvents,
    perspectiveSeat: 0,
    ownCurrentHand: fixture.ownCurrentHand,
    expectedFinalEventIndex: 7,
    expectedFinalLedgerHash: fixture.finalLedgerHash,
  });
}

function catchUp(fixture: Fixture, pendingPublicEvents = fixture.pendingPublicEvents, overrides: Readonly<Partial<{
  expectedFinalEventIndex: number;
  expectedFinalLedgerHash: string;
}>> = {}): PublicLedgerCatchUpResult {
  return replayModule.catchUpPublicLedgerSnapshot({
    baseLedger: fixture.baseLedger,
    pendingPublicEvents,
    expectedFinalEventIndex: overrides.expectedFinalEventIndex ?? 7,
    expectedFinalLedgerHash: overrides.expectedFinalLedgerHash ?? fixture.finalLedgerHash,
  });
}

function replayScenario(input: ReplayInput): ParticleReplayResult {
  return replayModule.replayParticleScenario(input);
}

function scenarioWithAssignments(fixture: Fixture, hiddenTransferAssignments: readonly HiddenTransferAssignment[]): ParticleScenario {
  return { schemaVersion: fixture.scenario.schemaVersion, initialDeal: fixture.scenario.initialDeal, hiddenTransferAssignments };
}

function ids(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id).sort();
}

function uniqueCardGroupForPlay(groups: readonly CardGroup[], event: PublicActionEvent): CardGroup {
  if (event.kind !== "play") throw new Error("PLAY_EVENT_REQUIRED");
  if (event.publicStableKey !== playPublicStableKey(event.publicCardIds)) throw new Error("PLAY_STABLE_KEY_MISMATCH");
  const matches = groups.filter((group) => group.type === event.patternType && group.type === event.groupType && ids(group.cards).join(",") === [...event.publicCardIds].sort().join(","));
  if (matches.length !== 1) throw new Error(`UNIQUE_CARD_GROUP_REQUIRED:${matches.length}`);
  return matches[0]!;
}

function event5GroupForRank(fixture: Fixture, gameRank: GameRank): CardGroup {
  const event5 = fixture.publicHistoryEvents[5];
  if (event5.kind !== "play") throw new Error("EVENT5_PLAY_REQUIRED");
  return uniqueCardGroupForPlay(detectGroups([fixture.laterPlayCard], gameRank), event5);
}

function observationFor(result: ParticleReplayResult, eventIndex: number) {
  const observation = result.actionObservations.find((entry) => entry.eventIndex === eventIndex);
  if (!observation) throw new Error(`OBSERVATION_NOT_FOUND:${eventIndex}`);
  return observation;
}

function expectDeepFrozenActionObservations(result: ParticleReplayResult): void {
  for (const observation of result.actionObservations) {
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(observation.event)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent.hands)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent.currentTrick)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent.handCounts)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent.publicPlayedCardIds)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent.revealedTransferEvents)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent.finishOrder)).toBe(true);
    expect(Object.isFrozen(observation.stateBeforeEvent.ledger)).toBe(true);
    if (observation.stateBeforeEvent.currentLastPlay) {
      expect(Object.isFrozen(observation.stateBeforeEvent.currentLastPlay)).toBe(true);
      expect(Object.isFrozen(observation.stateBeforeEvent.currentLastPlay.cards)).toBe(true);
      for (const card of observation.stateBeforeEvent.currentLastPlay.cards) expect(Object.isFrozen(card)).toBe(true);
    }
    if (observation.event.kind === "play") expect(Object.isFrozen(observation.event.publicCardIds)).toBe(true);
    for (const seat of [0, 1, 2, 3] as const) {
      expect(Object.isFrozen(observation.stateBeforeEvent.hands[seat])).toBe(true);
      for (const card of observation.stateBeforeEvent.hands[seat]) expect(Object.isFrozen(card)).toBe(true);
    }
  }
}

function captureInputFreezeState(fixture: Fixture) {
  return {
    initialLedger: Object.isFrozen(fixture.initialLedger),
    finalLedger: Object.isFrozen(fixture.finalLedger),
    publicHistoryEvents: Object.isFrozen(fixture.publicHistoryEvents),
    events: fixture.publicHistoryEvents.map((event) => ({
      event: Object.isFrozen(event),
      publicCardIds: event.kind === "play" ? Object.isFrozen(event.publicCardIds) : undefined,
    })),
    scenario: Object.isFrozen(fixture.scenario),
    initialDeal: Object.isFrozen(fixture.scenario.initialDeal),
    hands: ([0, 1, 2, 3] as const).map((seat) => ({
      array: Object.isFrozen(fixture.scenario.initialDeal.hands[seat]),
      cards: fixture.scenario.initialDeal.hands[seat].map((card) => Object.isFrozen(card)),
    })),
    ownCurrentHand: Object.isFrozen(fixture.ownCurrentHand),
    ownCurrentHandCards: fixture.ownCurrentHand.map((card) => Object.isFrozen(card)),
  };
}

function expectInputFreezeStateUnchanged(before: ReturnType<typeof captureInputFreezeState>, fixture: Fixture): void {
  expect(captureInputFreezeState(fixture)).toEqual(before);
}

describe("D2e-P Task 2 public event deal constraints and replay", () => {
  test("derives terminal hand and public played cards without fabricating an initial Card", () => {
    const fixture = makeFixture();
    const result = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });

    expect(ids(result.finalState.hands[0])).toEqual(ids(fixture.ownCurrentHand));
    expect(result.finalState.publicPlayedCardIds).toEqual(fixture.finalLedger.playedCardIds);
    expect(result.finalState.handCounts).toEqual(fixture.finalLedger.handCounts);
    expect(result.finalState.revealedTransferEvents).toEqual(fixture.finalLedger.revealedTransferEvents);
    expect(result.finalState.currentTrick).toEqual(fixture.finalLedger.currentTrick);
    expect(result.finalState.finishOrder).toEqual(fixture.finalLedger.finishOrder);
    expect(result.finalState.ledger).toEqual(fixture.finalLedger);
    expect(result.finalState.handCounts).toEqual({
      0: result.finalState.hands[0].length,
      1: result.finalState.hands[1].length,
      2: result.finalState.hands[2].length,
      3: result.finalState.hands[3].length,
    });
    expect(result.finalState.hands[0].every((card) => card.id !== fixture.playCard.id)).toBe(true);
  });

  test("derives deterministic initial hand only when every own transfer card ID is revealed", () => {
    const fullyRevealed = makeFixture({ revealTribute: true, revealReturn: true });
    const deterministic = deriveConstraints(fullyRevealed);
    const allowedKeys = [
      "terminalOwnCurrentHand",
      "ownPublicPlayedCardIds",
      "knownRevealedIncomingTransferCardIds",
      "knownRevealedOutgoingTransferCardIds",
      "unresolvedIncomingTransferSlotCount",
      "unresolvedOutgoingTransferSlotCount",
      "expectedInitialHandCount",
      "expectedCurrentHandCount",
      "publicEventConsistency",
      "deterministicInitialHand",
    ];

    expect(deterministic.deterministicInitialHand).toBeDefined();
    if (!deterministic.deterministicInitialHand) throw new Error("DETERMINISTIC_HAND_MISSING");
    expect(ids(deterministic.deterministicInitialHand)).toEqual(ids(fullyRevealed.deal.hands[0]));
    expect(Object.keys(deterministic).sort()).toEqual(allowedKeys.sort());
    expect(deterministic.knownRevealedOutgoingTransferCardIds).toEqual([fullyRevealed.hiddenTributeCard.id]);
    expect(deterministic.knownRevealedIncomingTransferCardIds).toEqual([fullyRevealed.returnedCard.id]);
    expect(deterministic.ownPublicPlayedCardIds).toContain(fullyRevealed.playCard.id);

    const earlyBaseEventCount = 2;
    const earlyBaseLedger = applyEvents(fullyRevealed.initialLedger, fullyRevealed.publicHistoryEvents.slice(0, earlyBaseEventCount));
    const earlyPendingEvents = fullyRevealed.publicHistoryEvents.slice(earlyBaseEventCount);
    expect(earlyBaseLedger.lastAppliedEventIndex).toBe(1);
    expect(earlyPendingEvents.some((event) => event.kind === "play" && event.eventIndex > earlyBaseLedger.lastAppliedEventIndex)).toBe(true);
    const earlyBaseConstraints = replayModule.deriveActingSeatInitialDealConstraints({
      publicHistoryEvents: fullyRevealed.publicHistoryEvents,
      baseLedger: earlyBaseLedger,
      pendingPublicEvents: earlyPendingEvents,
      perspectiveSeat: 0,
      ownCurrentHand: fullyRevealed.ownCurrentHand,
      expectedFinalEventIndex: 7,
      expectedFinalLedgerHash: fullyRevealed.finalLedgerHash,
    });
    expect(earlyBaseConstraints.expectedInitialHandCount).toBe(27);
    if (!earlyBaseConstraints.deterministicInitialHand) throw new Error("EARLY_BASE_DETERMINISTIC_HAND_MISSING");
    expect(ids(earlyBaseConstraints.deterministicInitialHand)).toEqual(ids(fullyRevealed.deal.hands[0]));

    const roundTripCard = fullyRevealed.hiddenTributeCard;
    const roundTripEvent0 = makeTransferEvent(fullyRevealed.identity, 0, "tribute", 0, 1, 0, [roundTripCard.id], { 0: -1, 1: 1, 2: 0, 3: 0 });
    const roundTripEvent1 = makeTransferEvent(fullyRevealed.identity, 1, "return", 1, 0, 0, [roundTripCard.id], { 0: 1, 1: -1, 2: 0, 3: 0 });
    const roundTripHistory: readonly PublicActionEvent[] = [roundTripEvent0, roundTripEvent1, ...fullyRevealed.publicHistoryEvents.slice(2)];
    const roundTripBaseLedger = applyEvents(fullyRevealed.initialLedger, roundTripHistory.slice(0, 5));
    const roundTripFinalLedger = applyEvents(fullyRevealed.initialLedger, roundTripHistory);
    const roundTripConstraints = replayModule.deriveActingSeatInitialDealConstraints({
      publicHistoryEvents: roundTripHistory,
      baseLedger: roundTripBaseLedger,
      pendingPublicEvents: roundTripHistory.slice(5),
      perspectiveSeat: 0,
      ownCurrentHand: fullyRevealed.deal.hands[0].filter((card) => card.id !== fullyRevealed.playCard.id),
      expectedFinalEventIndex: 7,
      expectedFinalLedgerHash: canonicalPublicLedgerHash(roundTripFinalLedger),
    });
    if (!roundTripConstraints.deterministicInitialHand) throw new Error("ROUND_TRIP_DETERMINISTIC_HAND_MISSING");
    expect(ids(roundTripConstraints.deterministicInitialHand)).toEqual(ids(fullyRevealed.deal.hands[0]));
    expect(ids(roundTripConstraints.deterministicInitialHand)).toContain(roundTripCard.id);

    const unresolved = deriveConstraints(makeFixture());
    expect(unresolved).not.toHaveProperty("deterministicInitialHand");
  });

  test("counts unresolved incoming and outgoing transfer slots", () => {
    const fixture = makeFixture({ revealTribute: false, revealReturn: false });
    const constraints = deriveConstraints(fixture);

    expect(constraints.unresolvedOutgoingTransferSlotCount).toBe(1);
    expect(constraints.unresolvedIncomingTransferSlotCount).toBe(1);
    expect(constraints.knownRevealedIncomingTransferCardIds).toEqual([]);
    expect(constraints.knownRevealedOutgoingTransferCardIds).toEqual([]);
  });

  test("keeps partner and opponent initial hands hypothetical", () => {
    const fixture = makeFixture();
    const constraints = deriveConstraints(fixture);
    const allowedKeys = [
      "terminalOwnCurrentHand",
      "ownPublicPlayedCardIds",
      "knownRevealedIncomingTransferCardIds",
      "knownRevealedOutgoingTransferCardIds",
      "unresolvedIncomingTransferSlotCount",
      "unresolvedOutgoingTransferSlotCount",
      "expectedInitialHandCount",
      "expectedCurrentHandCount",
      "publicEventConsistency",
    ];
    const outputKeys = Object.keys(constraints).sort();
    const serializedConstraints = JSON.stringify(constraints);
    const publicIds = new Set([
      ...fixture.publicHistoryEvents.flatMap(publicCardIdsForEvent),
      ...constraints.knownRevealedIncomingTransferCardIds,
      ...constraints.knownRevealedOutgoingTransferCardIds,
      ...constraints.ownPublicPlayedCardIds,
    ]);
    const ownCurrentHandIds = new Set(fixture.ownCurrentHand.map((card) => card.id));
    const representativeIds = ([1, 2, 3] as const).map((seat) => {
      const representative = fixture.deal.hands[seat].find((card) => !publicIds.has(card.id) && !ownCurrentHandIds.has(card.id));
      if (!representative) throw new Error(`PRIVATE_REPRESENTATIVE_NOT_FOUND:${seat}`);
      return representative.id;
    });

    expect(outputKeys).toEqual(allowedKeys.sort());
    expect(constraints).not.toHaveProperty("deterministicInitialHand");
    for (const representativeId of representativeIds) {
      expect(publicIds.has(representativeId)).toBe(false);
      expect(serializedConstraints).not.toContain(representativeId);
    }
    expect(ids(constraints.terminalOwnCurrentHand)).toEqual(ids(fixture.ownCurrentHand));
  });

  test("moves public played cards into a separate public zone", () => {
    const fixture = makeFixture();
    const result = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    const finalHandIds = Object.values(result.finalState.hands).flat().map((card) => card.id);

    expect(result.finalState.publicPlayedCardIds).toEqual([fixture.playCard.id, fixture.laterPlayCard.id]);
    expect(finalHandIds).not.toContain(fixture.playCard.id);
    expect(finalHandIds).not.toContain(fixture.laterPlayCard.id);
  });

  test("applies revealed tribute and return ownership transfers", () => {
    const fixture = makeFixture({ revealTribute: true, revealReturn: true });
    const result = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });

    expect(result.finalState.hands[0].map((card) => card.id)).toContain(fixture.returnedCard.id);
    expect(result.finalState.hands[0].map((card) => card.id)).not.toContain(fixture.hiddenTributeCard.id);
    expect(result.finalState.hands[1].map((card) => card.id)).toContain(fixture.hiddenTributeCard.id);
    expect(result.finalState.hands[1].map((card) => card.id)).not.toContain(fixture.returnedCard.id);
    expect(result.finalState.revealedTransferEvents).toEqual(fixture.finalLedger.revealedTransferEvents);
  });

  test("applies hidden transfer assignment only when card is in fromSeat before the event", () => {
    const fixture = makeFixture();
    expect(fixture.deal.hands[0].map((card) => card.id)).not.toContain(fixture.returnedCard.id);
    expect(fixture.deal.hands[1].map((card) => card.id)).toContain(fixture.returnedCard.id);
    const invalidAssignments = [{ ...fixture.scenario.hiddenTransferAssignments[0], cardId: fixture.returnedCard.id }];
    const invalidScenario = scenarioWithAssignments(fixture, invalidAssignments);

    expect(() => replayScenario({ scenario: invalidScenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();

    const roundTripFixture = makeFixture({ revealTribute: false, revealReturn: false });
    const roundTripAssignments: HiddenTransferAssignment[] = [
      roundTripFixture.scenario.hiddenTransferAssignments[0],
      { ...roundTripFixture.scenario.hiddenTransferAssignments[1], cardId: roundTripFixture.hiddenTributeCard.id },
    ];
    const roundTripOwnCurrentHand = roundTripFixture.deal.hands[0].filter((card) => card.id !== roundTripFixture.playCard.id);
    const roundTripResult = replayScenario({
      scenario: scenarioWithAssignments(roundTripFixture, roundTripAssignments),
      publicHistoryEvents: roundTripFixture.publicHistoryEvents,
      initialLedger: roundTripFixture.initialLedger,
      finalLedger: roundTripFixture.finalLedger,
      gameRank: roundTripFixture.gameRank,
      perspectiveSeat: 0,
      ownCurrentHand: roundTripOwnCurrentHand,
    });
    expect(roundTripResult.finalState.hands[0].map((card) => card.id)).toContain(roundTripFixture.hiddenTributeCard.id);
    expect(roundTripResult.finalState.hands[1].map((card) => card.id)).not.toContain(roundTripFixture.hiddenTributeCard.id);
  });

  test("rejects hidden assignment with wrong eventIndex kind seat or duplicate slot", () => {
    const fixture = makeFixture({ revealTribute: false, revealReturn: false });
    const assignments = fixture.scenario.hiddenTransferAssignments;
    const wrongEventIndex = [{ ...assignments[0], eventIndex: 99 }, assignments[1]];
    const wrongKind = [{ ...assignments[0], eventKind: "return" as const }, assignments[1]];
    const wrongSeat = [{ ...assignments[0], fromSeat: 1 as const }, assignments[1]];
    const seat0AnotherCard = fixture.deal.hands[0].find((card) => card.id !== fixture.hiddenTributeCard.id && card.id !== fixture.playCard.id && card.id !== fixture.returnedCard.id);
    if (!seat0AnotherCard) throw new Error("DUPLICATE_SLOT_CARD_NOT_FOUND");
    expect(fixture.deal.hands[0].map((card) => card.id)).toContain(assignments[0].cardId);
    expect(fixture.deal.hands[0].map((card) => card.id)).toContain(seat0AnotherCard.id);
    expect(assignments[0].cardId).not.toBe(seat0AnotherCard.id);
    const duplicateSlot = [assignments[0], { ...assignments[0], cardId: seat0AnotherCard.id }, assignments[1]];
    for (const assignment of [assignments[0], duplicateSlot[1]]) {
      expect(assignment.eventIndex).toBe(assignments[0].eventIndex);
      expect(assignment.eventKind).toBe(assignments[0].eventKind);
      expect(assignment.fromSeat).toBe(assignments[0].fromSeat);
      expect(assignment.toSeat).toBe(assignments[0].toSeat);
    }
    expect(assignments[1]).toMatchObject({ eventIndex: 1, eventKind: "return", fromSeat: 1, toSeat: 0 });

    for (const hiddenTransferAssignments of [wrongEventIndex, wrongKind, wrongSeat, duplicateSlot]) {
      expect(() => replayScenario({ scenario: scenarioWithAssignments(fixture, hiddenTransferAssignments), publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
    }
  });

  test("rejects missing assignment for an empty transfer slot", () => {
    const fixture = makeFixture();
    const missingAssignmentScenario = scenarioWithAssignments(fixture, []);

    expect(() => replayScenario({ scenario: missingAssignmentScenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
  });

  test("keeps hidden transfer identity unresolved while preserving counts", () => {
    const fixture = makeFixture();
    const constraints = deriveConstraints(fixture);

    expect(constraints.deterministicInitialHand).toBeUndefined();
    expect(constraints.expectedInitialHandCount).toBe(27);
    expect(constraints.expectedCurrentHandCount).toBe(fixture.ownCurrentHand.length);
    expect(constraints.unresolvedOutgoingTransferSlotCount).toBe(1);
    expect(constraints.terminalOwnCurrentHand.map((card) => card.id)).not.toContain(fixture.hiddenTributeCard.id);
  });

  test("requires finish remainingHandCount to match replayed state", () => {
    const fixture = makeFixture();
    const invalidFinish = makeFinishEvent(fixture.identity, 7, 0, 1, 0);
    const invalidHistory = [...fixture.publicHistoryEvents.slice(0, 7), invalidFinish];
    const finishMismatchLedger: HardPublicLedger = {
      ...fixture.finalLedger,
      seenEventHashes: {
        ...fixture.finalLedger.seenEventHashes,
        [invalidFinish.eventIndex]: invalidFinish.publicPayloadHash,
      },
    };

    expect(finishMismatchLedger.handCounts).toEqual(fixture.finalLedger.handCounts);
    expect(finishMismatchLedger.finishOrder).toEqual(fixture.finalLedger.finishOrder);
    expect(finishMismatchLedger.lastAppliedEventIndex).toBe(fixture.finalLedger.lastAppliedEventIndex);
    if (invalidFinish.kind !== "finish") throw new Error("FINISH_EVENT_MISSING");
    expect(invalidFinish.remainingHandCount).not.toBe(finishMismatchLedger.handCounts[0]);

    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: invalidHistory, initialLedger: fixture.initialLedger, finalLedger: finishMismatchLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
  });

  test("rejects malformed ledger and impossible replay", () => {
    const fixture = makeFixture();
    const malformedLedger: HardPublicLedger = {
      ...fixture.finalLedger,
      handCounts: { ...fixture.finalLedger.handCounts, 0: fixture.finalLedger.handCounts[0] + 1 },
    };
    const impossibleScenario = scenarioWithAssignments(fixture, [{ ...fixture.scenario.hiddenTransferAssignments[0], cardId: fixture.returnedCard.id }]);

    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: malformedLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
    expect(() => replayScenario({ scenario: impossibleScenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();

    const alternateEvent0 = makeTransferEvent(fixture.identity, 0, "tribute", 0, 2, 0, [fixture.hiddenTributeCard.id], { 0: -1, 1: 0, 2: 1, 3: 0 });
    const mismatchedHistory: readonly PublicActionEvent[] = [alternateEvent0, ...fixture.publicHistoryEvents.slice(1)];
    expect(alternateEvent0.publicPayloadHash).not.toBe(fixture.publicHistoryEvents[0].publicPayloadHash);
    expect(alternateEvent0.publicPayloadHash).not.toBe(fixture.baseLedger.seenEventHashes[0]);
    expect(() => replayModule.deriveActingSeatInitialDealConstraints({
      publicHistoryEvents: mismatchedHistory,
      baseLedger: fixture.baseLedger,
      pendingPublicEvents: fixture.pendingPublicEvents,
      perspectiveSeat: 0,
      ownCurrentHand: fixture.ownCurrentHand,
      expectedFinalEventIndex: 7,
      expectedFinalLedgerHash: fixture.finalLedgerHash,
    })).toThrow();

    const malformedInitialLedger: HardPublicLedger = {
      ...fixture.initialLedger,
      handCounts: { ...fixture.initialLedger.handCounts, 3: 26 },
    };
    const malformedFinalLedger = applyEvents(malformedInitialLedger, fixture.publicHistoryEvents);
    expect(malformedFinalLedger.handCounts[3]).toBe(26);
    expect(() => replayScenario({
      scenario: fixture.scenario,
      publicHistoryEvents: fixture.publicHistoryEvents,
      initialLedger: malformedInitialLedger,
      finalLedger: malformedFinalLedger,
      gameRank: fixture.gameRank,
      perspectiveSeat: 0,
      ownCurrentHand: fixture.ownCurrentHand,
    })).toThrow();

    const invalidGameRank = "invalid" as unknown as GameRank;
    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: invalidGameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();

    const initialGameIdMismatch: HardPublicLedger = { ...structuredClone(fixture.initialLedger), gameId: "wrong-game" };
    const initialRoundIdentityMismatch: HardPublicLedger = { ...structuredClone(fixture.initialLedger), roundIdentity: "wrong-round" };
    const initialHandIdentityMismatch: HardPublicLedger = { ...structuredClone(fixture.initialLedger), handIdentity: "wrong-hand" };
    const finalGameIdMismatch: HardPublicLedger = { ...structuredClone(fixture.finalLedger), gameId: "wrong-game" };
    const finalRoundIdentityMismatch: HardPublicLedger = { ...structuredClone(fixture.finalLedger), roundIdentity: "wrong-round" };
    const finalHandIdentityMismatch: HardPublicLedger = { ...structuredClone(fixture.finalLedger), handIdentity: "wrong-hand" };
    for (const initialLedger of [initialGameIdMismatch, initialRoundIdentityMismatch, initialHandIdentityMismatch]) {
      expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
    }
    for (const finalLedger of [finalGameIdMismatch, finalRoundIdentityMismatch, finalHandIdentityMismatch]) {
      expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
    }

    const initialIndexMismatch: HardPublicLedger = { ...structuredClone(fixture.initialLedger), lastAppliedEventIndex: 0 };
    const initialNextIndexMismatch: HardPublicLedger = { ...structuredClone(fixture.initialLedger), nextEventIndex: 1 };
    const initialSeenHashMismatch: HardPublicLedger = { ...structuredClone(fixture.initialLedger), seenEventHashes: { 0: "0".repeat(64) } };
    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: initialIndexMismatch, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: initialNextIndexMismatch, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: initialSeenHashMismatch, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();

    const historyStartingAtOne = structuredClone(fixture.publicHistoryEvents).slice(1);
    const historyWithGap = structuredClone(fixture.publicHistoryEvents).filter((event) => event.eventIndex !== 3);
    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: historyStartingAtOne, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();
    expect(() => replayScenario({ scenario: fixture.scenario, publicHistoryEvents: historyWithGap, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand })).toThrow();

    const finalLedgerOnlyInput = structuredClone({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0 as const, ownCurrentHand: fixture.ownCurrentHand });
    Reflect.deleteProperty(finalLedgerOnlyInput, "initialLedger");
    expect(() => replayScenario(finalLedgerOnlyInput)).toThrow();
  });

  test("accepts same-hash duplicate event as idempotent catch-up", () => {
    const fixture = makeFixture();
    const expectedBaseHash = canonicalPublicLedgerHash(fixture.baseLedger);
    const noOpResult = catchUp(fixture, [], {
      expectedFinalEventIndex: fixture.baseLedger.lastAppliedEventIndex,
      expectedFinalLedgerHash: expectedBaseHash,
    });
    expect(noOpResult.ok).toBe(true);
    if (!noOpResult.ok) throw new Error(`EXPECTED_NO_OP_SUCCESS:${noOpResult.error}`);
    expect(noOpResult.finalLedgerHash).toBe(expectedBaseHash);
    expect(noOpResult.idempotentDuplicateCount).toBe(0);
    expect(noOpResult.finalLedger).toEqual(fixture.baseLedger);
    expect(noOpResult.finalLedger).not.toBe(fixture.baseLedger);
    expect(Object.isFrozen(noOpResult.finalLedger)).toBe(true);

    const baseLastIndex = fixture.baseLedger.lastAppliedEventIndex;
    const duplicateAlreadyInBase = fixture.publicHistoryEvents.find((event) => event.eventIndex === baseLastIndex);
    if (!duplicateAlreadyInBase) throw new Error("BASE_DUPLICATE_EVENT_MISSING");
    expect(fixture.baseLedger.seenEventHashes[baseLastIndex]).toBe(duplicateAlreadyInBase.publicPayloadHash);
    const duplicateFromBaseResult = catchUp(fixture, [duplicateAlreadyInBase, ...fixture.pendingPublicEvents]);
    expect(duplicateFromBaseResult.ok).toBe(true);
    if (!duplicateFromBaseResult.ok) throw new Error(`EXPECTED_BASE_DUPLICATE_SUCCESS:${duplicateFromBaseResult.error}`);
    expect(duplicateFromBaseResult.idempotentDuplicateCount).toBe(1);
    expect(duplicateFromBaseResult.finalLedgerHash).toBe(fixture.finalLedgerHash);
    expect(duplicateFromBaseResult.finalLedger).toEqual(fixture.finalLedger);

    const pending = [fixture.pendingPublicEvents[0], fixture.pendingPublicEvents[0], ...fixture.pendingPublicEvents.slice(1)];
    const result = catchUp(fixture, pending);

    expect(result).toEqual({ ok: true, finalLedger: fixture.finalLedger, finalLedgerHash: fixture.finalLedgerHash, idempotentDuplicateCount: 1 });
  });

  test("rejects conflicting duplicate, index gap, out-of-order, identity mismatch, hash mismatch and stale snapshot", () => {
    const fixture = makeFixture();
    const conflictingDuplicate = makePlayEvent(fixture.identity, 5, 1, 1, fixture.deal.hands[1][2].id, 27);
    const otherIdentity = buildPublicGameIdentity("task2-other-identity", 0, 0, "benchmark-scenario");
    const identityMismatch = makePlayEvent(otherIdentity, 5, 1, 1, fixture.laterPlayCard.id, 27);
    const invalidHash = structuredClone(fixture.pendingPublicEvents[0]);
    Object.defineProperty(invalidHash, "publicPayloadHash", { value: "0".repeat(64), enumerable: true });

    expect(catchUp(fixture, [fixture.pendingPublicEvents[0], conflictingDuplicate])).toEqual({ ok: false, error: "EVENT_INDEX_CONFLICT" });
    expect(catchUp(fixture, [fixture.pendingPublicEvents[1]])).toEqual({ ok: false, error: "EVENT_INDEX_GAP" });
    expect(catchUp(fixture, [fixture.pendingPublicEvents[0], fixture.pendingPublicEvents[1], fixture.pendingPublicEvents[0], fixture.pendingPublicEvents[2]])).toEqual({ ok: false, error: "OUT_OF_ORDER" });
    expect(catchUp(fixture, [identityMismatch])).toEqual({ ok: false, error: "IDENTITY_MISMATCH" });
    expect(catchUp(fixture, [invalidHash])).toEqual({ ok: false, error: "EVENT_HASH_INVALID" });
    expect(catchUp(fixture, fixture.pendingPublicEvents, { expectedFinalEventIndex: fixture.baseLedger.lastAppliedEventIndex, expectedFinalLedgerHash: canonicalPublicLedgerHash(fixture.baseLedger) })).toEqual({ ok: false, error: "STALE_SNAPSHOT" });
    const wrongFinalHash = "f".repeat(64);
    expect(catchUp(fixture, fixture.pendingPublicEvents, { expectedFinalLedgerHash: wrongFinalHash })).toEqual({ ok: false, error: "FINAL_HASH_MISMATCH" });
  });

  test("does not mutate input ledger, pending suffix, history, deal or own hand", () => {
    const fixture = makeFixture();
    const before = {
      baseLedger: structuredClone(fixture.baseLedger),
      pendingPublicEvents: structuredClone(fixture.pendingPublicEvents),
      publicHistoryEvents: structuredClone(fixture.publicHistoryEvents),
      initialLedger: structuredClone(fixture.initialLedger),
      finalLedger: structuredClone(fixture.finalLedger),
      scenario: structuredClone(fixture.scenario),
      ownCurrentHand: structuredClone(fixture.ownCurrentHand),
      gameRank: fixture.gameRank,
    };

    const catchUpResult = catchUp(fixture);
    expect(catchUpResult).toEqual({ ok: true, finalLedger: fixture.finalLedger, finalLedgerHash: fixture.finalLedgerHash, idempotentDuplicateCount: 0 });
    replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    const failedCatchUp = catchUp(fixture, fixture.pendingPublicEvents, { expectedFinalLedgerHash: "f".repeat(64) });

    expect(fixture.baseLedger).toEqual(before.baseLedger);
    expect(fixture.pendingPublicEvents).toEqual(before.pendingPublicEvents);
    expect(fixture.publicHistoryEvents).toEqual(before.publicHistoryEvents);
    expect(fixture.initialLedger).toEqual(before.initialLedger);
    expect(fixture.finalLedger).toEqual(before.finalLedger);
    expect(fixture.scenario.initialDeal).toEqual(before.scenario.initialDeal);
    expect(fixture.scenario.hiddenTransferAssignments).toEqual(before.scenario.hiddenTransferAssignments);
    expect(fixture.ownCurrentHand).toEqual(before.ownCurrentHand);
    expect(fixture.gameRank).toBe(before.gameRank);
    expect(failedCatchUp).toEqual({ ok: false, error: "FINAL_HASH_MISMATCH" });
    expect(failedCatchUp).not.toHaveProperty("finalLedger");
  });

  test("captures hand state before each public play", () => {
    const fixture = makeFixture();
    const beforeInputFreezeState = captureInputFreezeState(fixture);
    const result = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    const laterPlayEvent = fixture.publicHistoryEvents[5];
    if (laterPlayEvent.kind !== "play") throw new Error("LATER_PLAY_EVENT_MISSING");
    const firstPlay = observationFor(result, 2);
    const laterPlay = observationFor(result, 5);

    expect(firstPlay.event.kind).toBe("play");
    expect(firstPlay.stateBeforeEvent.hands[0].map((card) => card.id)).toContain(fixture.playCard.id);
    expect(laterPlay.event.kind).toBe("play");
    expect(laterPlay.stateBeforeEvent.hands[1].map((card) => card.id)).toContain(fixture.laterPlayCard.id);
    expect(laterPlay.stateBeforeEvent.currentLastPlay).toBeUndefined();
    expect(laterPlay.stateBeforeEvent.currentTrick.trickIndex).toBe(1);
    expect(laterPlay.stateBeforeEvent.currentTrick.lastPlaySeat).toBeUndefined();
    expect(firstPlay.event).not.toBe(fixture.publicHistoryEvents[2]);
    expect(laterPlay.event).not.toBe(fixture.publicHistoryEvents[5]);
    if (fixture.publicHistoryEvents[2].kind !== "play" || firstPlay.event.kind !== "play") throw new Error("FIRST_PLAY_EVENT_MISSING");
    expect(firstPlay.event.publicCardIds).not.toBe(fixture.publicHistoryEvents[2].publicCardIds);
    expect(firstPlay.stateBeforeEvent.hands[0]).not.toBe(fixture.scenario.initialDeal.hands[0]);
    const sourcePlayCard = fixture.scenario.initialDeal.hands[0].find((card) => card.id === fixture.playCard.id);
    const outputPlayCard = firstPlay.stateBeforeEvent.hands[0].find((card) => card.id === fixture.playCard.id);
    if (!sourcePlayCard || !outputPlayCard) throw new Error("PLAY_CARD_REFERENCE_MISSING");
    expect(outputPlayCard).not.toBe(sourcePlayCard);
    expect(result.actionObservations.map((entry) => entry.eventIndex)).toEqual([2, 3, 5, 6]);
    for (const observation of result.actionObservations) {
      expect(observation.eventIndex).toBe(observation.event.eventIndex);
      expect(["play", "pass"]).toContain(observation.event.kind);
    }
    expectDeepFrozenActionObservations(result);
    expectInputFreezeStateUnchanged(beforeInputFreezeState, fixture);
  });

  test("captures trick state before each pass", () => {
    const fixture = makeFixture();
    const rankA: GameRank = "K";
    const rankB: GameRank = "Q";
    const expectedEvent5GroupA = event5GroupForRank(fixture, rankA);
    const expectedEvent5GroupB = event5GroupForRank(fixture, rankB);
    const replayA = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: rankA, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    const replayB = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: rankB, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    const firstPass = observationFor(replayA, 3);
    const laterPassA = observationFor(replayA, 6);
    const laterPassB = observationFor(replayB, 6);

    expect(firstPass.event.kind).toBe("pass");
    expect(firstPass.stateBeforeEvent.currentTrick.trickIndex).toBe(0);
    expect(firstPass.stateBeforeEvent.currentTrick.lastPlaySeat).toBe(0);
    expect(firstPass.stateBeforeEvent.currentLastPlay?.type).toBe("single");
    expect(firstPass.stateBeforeEvent.currentLastPlay?.cards.map((card) => card.id)).toEqual([fixture.playCard.id]);
    expect(typeof firstPass.stateBeforeEvent.currentLastPlay?.id).toBe("string");
    expect(firstPass.stateBeforeEvent.currentLastPlay?.id).not.toBe("");
    expect(laterPassA.event.kind).toBe("pass");
    expect(laterPassB.event.kind).toBe("pass");
    expect(laterPassA.stateBeforeEvent.currentTrick.trickIndex).toBe(1);
    expect(laterPassB.stateBeforeEvent.currentTrick.trickIndex).toBe(1);
    expect(laterPassA.stateBeforeEvent.currentTrick.lastPlaySeat).toBe(1);
    expect(laterPassB.stateBeforeEvent.currentTrick.lastPlaySeat).toBe(1);
    expect(laterPassA.stateBeforeEvent.hands[1].map((card) => card.id)).not.toContain(fixture.laterPlayCard.id);
    expect(laterPassB.stateBeforeEvent.hands[1].map((card) => card.id)).not.toContain(fixture.laterPlayCard.id);
    expect(laterPassA.stateBeforeEvent.currentLastPlay).toEqual(expectedEvent5GroupA);
    expect(laterPassB.stateBeforeEvent.currentLastPlay).toEqual(expectedEvent5GroupB);
    expect(typeof laterPassA.stateBeforeEvent.currentLastPlay?.id).toBe("string");
    expect(typeof laterPassB.stateBeforeEvent.currentLastPlay?.id).toBe("string");
    expect(laterPassA.stateBeforeEvent.currentLastPlay?.id).not.toBe("");
    expect(laterPassB.stateBeforeEvent.currentLastPlay?.id).not.toBe("");
    expect(expectedEvent5GroupA).not.toEqual(expectedEvent5GroupB);
    const repeatedResult = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    expect(observationFor(repeatedResult, 3).stateBeforeEvent.currentLastPlay?.id).toBe(firstPass.stateBeforeEvent.currentLastPlay?.id);
  });

  test("hidden transfer changes later stateBeforeEvent", () => {
    const fixture = makeFixture();
    const result = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    const laterPlay = observationFor(result, 5);

    expect(laterPlay.stateBeforeEvent.hands[1].map((card) => card.id)).toContain(fixture.hiddenTributeCard.id);
    expect(laterPlay.stateBeforeEvent.hands[0].map((card) => card.id)).not.toContain(fixture.hiddenTributeCard.id);
  });

  test("public play removes card only after its observation", () => {
    const fixture = makeFixture();
    const result = replayScenario({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: fixture.initialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    const firstPlay = observationFor(result, 2);

    expect(firstPlay.stateBeforeEvent.hands[0].map((card) => card.id)).toContain(fixture.playCard.id);
    expect(result.finalState.hands[0].map((card) => card.id)).not.toContain(fixture.playCard.id);
    expect(result.finalState.publicPlayedCardIds).toContain(fixture.playCard.id);
  });

  test("replay failure exposes no partial trace", () => {
    const fixture = makeFixture();
    const invalidScenario = scenarioWithAssignments(fixture, []);
    const beforeScenario = structuredClone(fixture.scenario);
    const beforeHistory = structuredClone(fixture.publicHistoryEvents);
    const beforeInitialLedger = structuredClone(fixture.initialLedger);
    const beforeFinalLedger = structuredClone(fixture.finalLedger);
    const beforeOwnCurrentHand = structuredClone(fixture.ownCurrentHand);
    const invalidInitialLedger: HardPublicLedger = { ...structuredClone(fixture.initialLedger), gameId: "wrong-game" };
    const historyStartingAtOne = structuredClone(fixture.publicHistoryEvents).slice(1);
    const historyWithGap = structuredClone(fixture.publicHistoryEvents).filter((event) => event.eventIndex !== 3);
    const expectNoPartialTrace = (input: ReplayInput): void => {
      let caughtError: unknown;
      try {
        replayScenario(input);
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(Error);
      if (!(caughtError instanceof Error)) throw new Error("REPLAY_FAILURE_NOT_ERROR");
      const forbiddenTraceFields = ["partialResult", "result", "trace", "actionObservations", "finalState", "stateBeforeEvent", "hiddenTransferAssignments", "normalizedWeight"];
      for (const field of forbiddenTraceFields) {
        expect(Object.keys(caughtError)).not.toContain(field);
      }
      const errorCause = (caughtError as Error & { cause?: unknown }).cause;
      if (errorCause && typeof errorCause === "object") {
        for (const field of forbiddenTraceFields) {
          expect(Object.keys(errorCause)).not.toContain(field);
        }
      }
    };

    const baseInput = {
      initialLedger: fixture.initialLedger,
      finalLedger: fixture.finalLedger,
      gameRank: fixture.gameRank,
      perspectiveSeat: 0 as const,
      ownCurrentHand: fixture.ownCurrentHand,
    };
    expectNoPartialTrace({ scenario: invalidScenario, publicHistoryEvents: fixture.publicHistoryEvents, ...baseInput });
    expectNoPartialTrace({ scenario: fixture.scenario, publicHistoryEvents: fixture.publicHistoryEvents, initialLedger: invalidInitialLedger, finalLedger: fixture.finalLedger, gameRank: fixture.gameRank, perspectiveSeat: 0, ownCurrentHand: fixture.ownCurrentHand });
    expectNoPartialTrace({ scenario: fixture.scenario, publicHistoryEvents: historyStartingAtOne, ...baseInput });
    expectNoPartialTrace({ scenario: fixture.scenario, publicHistoryEvents: historyWithGap, ...baseInput });

    expect(fixture.scenario).toEqual(beforeScenario);
    expect(fixture.publicHistoryEvents).toEqual(beforeHistory);
    expect(fixture.initialLedger).toEqual(beforeInitialLedger);
    expect(fixture.finalLedger).toEqual(beforeFinalLedger);
    expect(fixture.ownCurrentHand).toEqual(beforeOwnCurrentHand);
  });
});
