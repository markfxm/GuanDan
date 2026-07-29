import { RANKS, createDeck, type Card, type GameRank } from "../../engine/cards";
import { detectGroups, type CardGroup } from "../../engine/groups";
import {
  assertFinalizedPublicActionEvent,
  playPublicStableKey,
  type PublicActionEvent,
  type PublicGameIdentity,
  type PublicSeat,
} from "../../game/publicEvent";
import { verifyPublicActionEventHash } from "../../game/publicEventHash";
import { applyPublicEvent, canonicalPublicLedgerHash, type HardPublicLedger } from "../../game/publicLedger";
import type {
  HiddenTransferAssignment,
  ParticleActionObservation,
  ParticleReplayResult,
  ParticleScenario,
  ReplayedParticleState,
} from "./contracts";
import { validateCanonicalInitialDeal } from "./particleConservation";

export type ActingSeatInitialDealConstraints = Readonly<{
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

type PublicLedgerCatchUpError = "EVENT_INDEX_CONFLICT" | "EVENT_INDEX_GAP" | "OUT_OF_ORDER" | "IDENTITY_MISMATCH" | "EVENT_HASH_INVALID" | "STALE_SNAPSHOT" | "FINAL_HASH_MISMATCH";

export type PublicLedgerCatchUpResult =
  | { ok: true; finalLedger: HardPublicLedger; finalLedgerHash: string; idempotentDuplicateCount: number }
  | { ok: false; error: PublicLedgerCatchUpError };

export function deriveActingSeatInitialDealConstraints(input: Readonly<{
  publicHistoryEvents: readonly PublicActionEvent[];
  baseLedger: HardPublicLedger;
  pendingPublicEvents: readonly PublicActionEvent[];
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  expectedFinalEventIndex: number;
  expectedFinalLedgerHash: string;
}>): ActingSeatInitialDealConstraints {
  assertLedgerIdentity(input.baseLedger, input.baseLedger);
  assertHistory(input.publicHistoryEvents, input.baseLedger);
  assertHistoryMatchesBaseLedger(input.publicHistoryEvents, input.baseLedger);
  validateHistoryCounts(input.publicHistoryEvents);
  const catchUp = catchUpPublicLedgerSnapshot({
    baseLedger: input.baseLedger,
    pendingPublicEvents: input.pendingPublicEvents,
    expectedFinalEventIndex: input.expectedFinalEventIndex,
    expectedFinalLedgerHash: input.expectedFinalLedgerHash,
  });
  if (!catchUp.ok) throw new Error(`INITIAL_DEAL_CONSTRAINTS_CATCH_UP_FAILED:${"error" in catchUp ? catchUp.error : "UNKNOWN"}`);

  const ownPublicPlayedCardIds: string[] = [];
  const knownRevealedIncomingTransferCardIds: string[] = [];
  const knownRevealedOutgoingTransferCardIds: string[] = [];
  let unresolvedIncomingTransferSlotCount = 0;
  let unresolvedOutgoingTransferSlotCount = 0;

  for (const event of input.publicHistoryEvents) {
    if (event.kind === "play" && event.seat === input.perspectiveSeat) ownPublicPlayedCardIds.push(...event.publicCardIds);
    if ((event.kind === "tribute" || event.kind === "return") && event.fromSeat === input.perspectiveSeat) {
      if (event.publicCardIds.length === 1) knownRevealedOutgoingTransferCardIds.push(event.publicCardIds[0]!);
      else unresolvedOutgoingTransferSlotCount += 1;
    }
    if ((event.kind === "tribute" || event.kind === "return") && event.toSeat === input.perspectiveSeat) {
      if (event.publicCardIds.length === 1) knownRevealedIncomingTransferCardIds.push(event.publicCardIds[0]!);
      else unresolvedIncomingTransferSlotCount += 1;
    }
  }

  const expectedCurrentHandCount = catchUp.finalLedger.handCounts[input.perspectiveSeat];
  if (input.ownCurrentHand.length !== expectedCurrentHandCount) throw new Error("CURRENT_HAND_COUNT_INVALID");
  let perspectiveHandDelta = 0;
  for (const event of input.publicHistoryEvents) {
    if (event.kind === "play" && event.seat === input.perspectiveSeat) perspectiveHandDelta += event.handCountAfter - event.handCountBefore;
    if (event.kind === "tribute" || event.kind === "return") perspectiveHandDelta += event.handCountChanges[input.perspectiveSeat];
  }
  const expectedInitialHandCount = expectedCurrentHandCount - perspectiveHandDelta;
  const terminalOwnCurrentHand = deepFreeze(input.ownCurrentHand.map((card) => clone(card)));
  const result: ActingSeatInitialDealConstraints = {
    terminalOwnCurrentHand,
    ownPublicPlayedCardIds: deepFreeze([...ownPublicPlayedCardIds]),
    knownRevealedIncomingTransferCardIds: deepFreeze([...knownRevealedIncomingTransferCardIds]),
    knownRevealedOutgoingTransferCardIds: deepFreeze([...knownRevealedOutgoingTransferCardIds]),
    unresolvedIncomingTransferSlotCount,
    unresolvedOutgoingTransferSlotCount,
    expectedInitialHandCount,
    expectedCurrentHandCount,
    publicEventConsistency: {
      historyFirstEventIndex: 0,
      historyLastEventIndex: input.publicHistoryEvents.at(-1)!.eventIndex,
      expectedFinalEventIndex: input.expectedFinalEventIndex,
      expectedFinalLedgerHash: input.expectedFinalLedgerHash,
    },
  };

  if (unresolvedIncomingTransferSlotCount === 0 && unresolvedOutgoingTransferSlotCount === 0) {
    const cardsById = new Map(createDeck().map((card) => [card.id, card]));
    const initialCards = new Map(input.ownCurrentHand.map((card) => [card.id, clone(card)]));
    for (let index = input.publicHistoryEvents.length - 1; index >= 0; index -= 1) {
      const event = input.publicHistoryEvents[index]!;
      if (event.kind === "play" && event.seat === input.perspectiveSeat) {
        for (const id of event.publicCardIds) {
          const card = cardsById.get(id);
          if (!card || initialCards.has(id)) throw new Error("PUBLIC_PLAY_CARD_UNKNOWN");
          initialCards.set(id, clone(card));
        }
      }
      if ((event.kind === "tribute" || event.kind === "return") && event.publicCardIds.length === 1) {
        const id = event.publicCardIds[0]!;
        const card = cardsById.get(id);
        if (!card) throw new Error("TRANSFER_CARD_UNKNOWN");
        if (event.fromSeat === input.perspectiveSeat) {
          if (initialCards.has(id)) throw new Error("OUTGOING_TRANSFER_CARD_UNKNOWN");
          initialCards.set(id, clone(card));
        }
        if (event.toSeat === input.perspectiveSeat) {
          if (!initialCards.delete(id)) throw new Error("INCOMING_TRANSFER_CARD_UNKNOWN");
        }
      }
    }
    const canonicalOrder = new Map(createDeck().map((card, index) => [card.id, index]));
    const deterministicInitialHand = [...initialCards.values()].sort((left, right) => canonicalOrder.get(left.id)! - canonicalOrder.get(right.id)!);
    if (deterministicInitialHand.length !== expectedInitialHandCount) throw new Error("DETERMINISTIC_INITIAL_HAND_COUNT_INVALID");
    return deepFreeze({ ...result, deterministicInitialHand });
  }

  return deepFreeze(result);
}

export function catchUpPublicLedgerSnapshot(input: Readonly<{
  baseLedger: HardPublicLedger;
  pendingPublicEvents: readonly PublicActionEvent[];
  expectedFinalEventIndex: number;
  expectedFinalLedgerHash: string;
}>): PublicLedgerCatchUpResult {
  const baseHash = canonicalPublicLedgerHash(input.baseLedger);
  if (input.pendingPublicEvents.length === 0 && input.expectedFinalEventIndex === input.baseLedger.lastAppliedEventIndex && input.expectedFinalLedgerHash === baseHash) {
    return deepFreeze({ ok: true, finalLedger: clone(input.baseLedger), finalLedgerHash: baseHash, idempotentDuplicateCount: 0 });
  }
  if (input.expectedFinalEventIndex < input.baseLedger.lastAppliedEventIndex || (input.pendingPublicEvents.length > 0 && input.expectedFinalEventIndex === input.baseLedger.lastAppliedEventIndex)) return { ok: false, error: "STALE_SNAPSHOT" };
  let ledger = input.baseLedger;
  let previousEvent: PublicActionEvent | undefined;
  let idempotentDuplicateCount = 0;
  let baseDuplicateConsumed = false;
  let appliedNewEvent = false;

  for (const event of input.pendingPublicEvents) {
    try {
      assertFinalizedPublicActionEvent(event);
      verifyPublicActionEventHash(event);
    } catch {
      return { ok: false, error: "EVENT_HASH_INVALID" };
    }
    if (event.gameId !== ledger.gameId || event.roundIdentity !== ledger.roundIdentity || event.handIdentity !== ledger.handIdentity) {
      return { ok: false, error: "IDENTITY_MISMATCH" };
    }
    if (event.eventIndex < ledger.nextEventIndex) {
      if (!appliedNewEvent && !baseDuplicateConsumed && event.eventIndex === input.baseLedger.lastAppliedEventIndex && input.baseLedger.seenEventHashes[event.eventIndex] === event.publicPayloadHash) {
        baseDuplicateConsumed = true;
        idempotentDuplicateCount += 1;
        previousEvent = event;
        continue;
      }
      if (appliedNewEvent && event.eventIndex === ledger.lastAppliedEventIndex && previousEvent?.eventIndex === event.eventIndex && previousEvent.publicPayloadHash === event.publicPayloadHash) {
        idempotentDuplicateCount += 1;
        previousEvent = event;
        continue;
      }
      if (ledger.seenEventHashes[event.eventIndex] !== event.publicPayloadHash) return { ok: false, error: "EVENT_INDEX_CONFLICT" };
      return { ok: false, error: "OUT_OF_ORDER" };
    }
    if (event.eventIndex > ledger.nextEventIndex) return { ok: false, error: "EVENT_INDEX_GAP" };
    const applied = applyPublicEvent(ledger, event);
    if (!applied.ok) return { ok: false, error: mapCatchUpError("error" in applied ? applied.error : "EVENT_SCHEMA_INVALID") };
    ledger = applied.ledger;
    appliedNewEvent = true;
    previousEvent = event;
  }

  if (ledger.lastAppliedEventIndex !== input.expectedFinalEventIndex || canonicalPublicLedgerHash(ledger) !== input.expectedFinalLedgerHash) {
    return { ok: false, error: "FINAL_HASH_MISMATCH" };
  }
  return deepFreeze({ ok: true, finalLedger: clone(ledger), finalLedgerHash: canonicalPublicLedgerHash(ledger), idempotentDuplicateCount });
}

export function replayParticleScenario(input: Readonly<{
  scenario: ParticleScenario;
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
}>): ParticleReplayResult {
  if (input.scenario.schemaVersion !== "d2-particle-scenario-v1") throw new Error("SCENARIO_SCHEMA_INVALID");
  validateCanonicalInitialDeal(input.scenario.initialDeal);
  if (!RANKS.some((rank) => rank === input.gameRank)) throw new Error("GAME_RANK_INVALID");
  assertInitialLedger(input.initialLedger);
  assertHistory(input.publicHistoryEvents, input.initialLedger);
  assertLedgerIdentity(input.finalLedger, input.initialLedger);

  const hands: Record<PublicSeat, Card[]> = {
    0: input.scenario.initialDeal.hands[0].map((card) => clone(card)),
    1: input.scenario.initialDeal.hands[1].map((card) => clone(card)),
    2: input.scenario.initialDeal.hands[2].map((card) => clone(card)),
    3: input.scenario.initialDeal.hands[3].map((card) => clone(card)),
  };
  assertPrivateHandCounts(hands, input.initialLedger);
  const assignmentBySlot = new Map<string, HiddenTransferAssignment>();
  for (const assignment of input.scenario.hiddenTransferAssignments) {
    const key = assignmentKey(assignment.eventIndex, assignment.eventKind);
    if (assignmentBySlot.has(key)) throw new Error("HIDDEN_TRANSFER_ASSIGNMENT_DUPLICATE");
    assignmentBySlot.set(key, assignment);
  }

  let ledger = input.initialLedger;
  let currentLastPlay: CardGroup | undefined;
  const publicPlayedCardIds: string[] = [];
  const actionObservations: ParticleActionObservation[] = [];
  const usedAssignments = new Set<string>();

  for (const event of input.publicHistoryEvents) {
    if (event.kind === "play" || event.kind === "pass") {
      const observation = makeObservation(event, hands, publicPlayedCardIds, ledger, currentLastPlay);
      actionObservations.push(observation);
      if (event.kind === "play") {
        if (hands[event.seat].length !== event.handCountBefore) throw new Error("PLAY_HAND_COUNT_BEFORE_INVALID");
        const playedCards = event.publicCardIds.map((id) => findCard(hands[event.seat], id));
        const group = findMatchingCardGroup(detectGroups(playedCards.map((card) => clone(card)), input.gameRank), event);
        removeCards(hands[event.seat], event.publicCardIds);
        publicPlayedCardIds.push(...event.publicCardIds);
        currentLastPlay = clone(group);
        applyReplayEvent(ledger, event, (next) => { ledger = next; });
        if (hands[event.seat].length !== event.handCountAfter) throw new Error("PLAY_HAND_COUNT_AFTER_INVALID");
        assertPrivateHandCounts(hands, ledger);
      } else {
        if (currentLastPlay === undefined) throw new Error("PASS_WITHOUT_LAST_PLAY");
        if (hands[event.seat].length !== event.handCountBefore || event.handCountAfter !== event.handCountBefore) throw new Error("PASS_HAND_COUNT_INVALID");
        applyReplayEvent(ledger, event, (next) => { ledger = next; });
        assertPrivateHandCounts(hands, ledger);
      }
      continue;
    }

    if (event.kind === "tribute" || event.kind === "return") {
      const key = assignmentKey(event.eventIndex, event.kind);
      const assignment = assignmentBySlot.get(key);
      if (event.publicCardIds.length === 1) {
        if (assignment) throw new Error("VISIBLE_TRANSFER_HAS_ASSIGNMENT");
        moveCard(hands[event.fromSeat], hands[event.toSeat], event.publicCardIds[0]!);
      } else {
        if (!assignment || assignment.eventIndex !== event.eventIndex || assignment.eventKind !== event.kind || assignment.fromSeat !== event.fromSeat || assignment.toSeat !== event.toSeat) throw new Error("HIDDEN_TRANSFER_ASSIGNMENT_INVALID");
        if (usedAssignments.has(key)) throw new Error("HIDDEN_TRANSFER_ASSIGNMENT_REUSED");
        moveCard(hands[event.fromSeat], hands[event.toSeat], assignment.cardId);
        usedAssignments.add(key);
      }
      applyReplayEvent(ledger, event, (next) => { ledger = next; });
      assertPrivateHandCounts(hands, ledger);
      continue;
    }

    if (event.kind === "trick-clear") currentLastPlay = undefined;
    if (event.kind === "finish" && event.remainingHandCount !== hands[event.seat].length) throw new Error("FINISH_HAND_COUNT_INVALID");
    applyReplayEvent(ledger, event, (next) => { ledger = next; });
    assertPrivateHandCounts(hands, ledger);
  }

  if (usedAssignments.size !== assignmentBySlot.size) throw new Error("HIDDEN_TRANSFER_ASSIGNMENT_UNUSED");
  if (!sameCardIds(hands[input.perspectiveSeat], input.ownCurrentHand)) throw new Error("OWN_CURRENT_HAND_MISMATCH");
  assertPrivateHandCounts(hands, input.finalLedger);
  if (!sameValue(ledger, input.finalLedger) || canonicalPublicLedgerHash(ledger) !== canonicalPublicLedgerHash(input.finalLedger)) throw new Error("FINAL_LEDGER_MISMATCH");
  if (!sameValue(publicPlayedCardIds, input.finalLedger.playedCardIds)) throw new Error("PUBLIC_PLAYED_CARDS_MISMATCH");

  const finalState = makeState(hands, publicPlayedCardIds, ledger, currentLastPlay);
  return deepFreeze({ finalState, actionObservations: clone(actionObservations) });
}

function assertHistory(events: readonly PublicActionEvent[], ledger: HardPublicLedger): void {
  if (events.length === 0 || events[0]!.eventIndex !== 0) throw new Error("HISTORY_START_INVALID");
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    assertFinalizedPublicActionEvent(event);
    verifyPublicActionEventHash(event);
    if (event.eventIndex !== index) throw new Error("HISTORY_CONTINUITY_INVALID");
    if (event.gameId !== ledger.gameId || event.roundIdentity !== ledger.roundIdentity || event.handIdentity !== ledger.handIdentity) throw new Error("HISTORY_IDENTITY_INVALID");
  }
}

function assertHistoryMatchesBaseLedger(events: readonly PublicActionEvent[], ledger: HardPublicLedger): void {
  const expectedSeenEventCount = ledger.lastAppliedEventIndex + 1;
  if (Object.keys(ledger.seenEventHashes).length !== expectedSeenEventCount) throw new Error("BASE_SEEN_EVENT_COUNT_INVALID");
  for (let index = 0; index <= ledger.lastAppliedEventIndex; index += 1) {
    if (events[index]?.publicPayloadHash !== ledger.seenEventHashes[index]) throw new Error("BASE_HISTORY_PREFIX_HASH_MISMATCH");
  }
}

function assertInitialLedger(ledger: HardPublicLedger): void {
  if (ledger.schemaVersion !== "d2-public-ledger-v1" || ledger.lastAppliedEventIndex !== -1 || ledger.nextEventIndex !== 0 || Object.keys(ledger.seenEventHashes).length !== 0) throw new Error("INITIAL_LEDGER_INVALID");
}

function assertLedgerIdentity(actual: HardPublicLedger, expected: HardPublicLedger): void {
  if (actual.schemaVersion !== "d2-public-ledger-v1" || actual.gameId !== expected.gameId || actual.roundIdentity !== expected.roundIdentity || actual.handIdentity !== expected.handIdentity) throw new Error("LEDGER_IDENTITY_INVALID");
}

function validateHistoryCounts(events: readonly PublicActionEvent[]): void {
  for (const event of events) {
    if (event.kind === "play" && event.handCountAfter !== event.handCountBefore - event.publicCardIds.length) throw new Error("PLAY_COUNT_INVALID");
    if (event.kind === "pass" && event.handCountAfter !== event.handCountBefore) throw new Error("PASS_COUNT_INVALID");
    if ((event.kind === "tribute" || event.kind === "return") && Object.values(event.handCountChanges).reduce((sum, count) => sum + count, 0) !== 0) throw new Error("TRANSFER_COUNT_INVALID");
  }
}

function applyReplayEvent(ledger: HardPublicLedger, event: PublicActionEvent, setLedger: (next: HardPublicLedger) => void): void {
  const result = applyPublicEvent(ledger, event);
  if (result.ok) {
    setLedger(result.ledger);
    return;
  }
  throw new Error(`REPLAY_EVENT_INVALID:${"error" in result ? result.error : "EVENT_SCHEMA_INVALID"}`);
}

function findMatchingCardGroup(groups: readonly CardGroup[], event: PublicActionEvent): CardGroup {
  if (event.kind !== "play" || event.publicStableKey !== playPublicStableKey(event.publicCardIds)) throw new Error("PLAY_EVENT_INVALID");
  const expectedIds = [...event.publicCardIds].sort().join(",");
  const matches = groups.filter((group) => group.type === event.patternType && group.type === event.groupType && group.cards.map((card) => card.id).sort().join(",") === expectedIds);
  if (matches.length !== 1) throw new Error("PLAY_GROUP_MATCH_INVALID");
  return clone(matches[0]!);
}

function makeObservation(event: PublicActionEvent, hands: Record<PublicSeat, Card[]>, publicPlayedCardIds: readonly string[], ledger: HardPublicLedger, currentLastPlay: CardGroup | undefined): ParticleActionObservation {
  return deepFreeze({
    eventIndex: event.eventIndex,
    event: clone(event),
    stateBeforeEvent: makeState(hands, publicPlayedCardIds, ledger, currentLastPlay),
  });
}

function makeState(hands: Record<PublicSeat, Card[]>, publicPlayedCardIds: readonly string[], ledger: HardPublicLedger, currentLastPlay: CardGroup | undefined): ReplayedParticleState {
  const handCounts = assertPrivateHandCounts(hands, ledger);
  return deepFreeze({
    hands: clone(hands),
    publicPlayedCardIds: [...publicPlayedCardIds],
    revealedTransferEvents: clone(ledger.revealedTransferEvents),
    currentTrick: clone(ledger.currentTrick),
    currentLastPlay: currentLastPlay === undefined ? undefined : clone(currentLastPlay),
    handCounts: clone(handCounts),
    finishOrder: [...ledger.finishOrder],
    ledger: clone(ledger),
  });
}

function assertPrivateHandCounts(hands: Record<PublicSeat, Card[]>, ledger: HardPublicLedger): Record<PublicSeat, number> {
  const handCounts: Record<PublicSeat, number> = {
    0: hands[0].length,
    1: hands[1].length,
    2: hands[2].length,
    3: hands[3].length,
  };
  if (!sameValue(handCounts, ledger.handCounts)) throw new Error("PRIVATE_HAND_COUNTS_MISMATCH");
  return handCounts;
}

function moveCard(from: Card[], to: Card[], cardId: string): void {
  const index = from.findIndex((card) => card.id === cardId);
  if (index === -1) throw new Error("TRANSFER_CARD_NOT_IN_SOURCE_HAND");
  const [card] = from.splice(index, 1);
  to.push(card!);
}

function removeCards(hand: Card[], cardIds: readonly string[]): void {
  for (const cardId of cardIds) {
    const index = hand.findIndex((card) => card.id === cardId);
    if (index === -1) throw new Error("PLAY_CARD_NOT_IN_HAND");
    hand.splice(index, 1);
  }
}

function findCard(hand: readonly Card[], cardId: string): Card {
  const card = hand.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error("PLAY_CARD_NOT_IN_HAND");
  return card;
}

function assignmentKey(eventIndex: number, eventKind: HiddenTransferAssignment["eventKind"]): string {
  return `${eventIndex}:${eventKind}`;
}

function sameCardIds(left: readonly Card[], right: readonly Card[]): boolean {
  return left.map((card) => card.id).sort().join(",") === right.map((card) => card.id).sort().join(",");
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mapCatchUpError(error: string): PublicLedgerCatchUpError {
  if (error === "EVENT_INDEX_GAP" || error === "EVENT_INDEX_CONFLICT" || error === "IDENTITY_MISMATCH" || error === "EVENT_HASH_INVALID") return error;
  return "FINAL_HASH_MISMATCH";
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
