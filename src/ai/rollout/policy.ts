import { detectGroups, type CardGroup } from "../../engine/groups";
import { createDeck, RANKS, SUITS, isHeartRankWild, type Card, type GameRank } from "../../engine/cards";
import { canBeatPlay, classifyPlay } from "../../game/playRules";
import { assertFinalizedPublicActionEvent, playPublicStableKey, trickClearPublicStableKey } from "../../game/publicEvent";
import { verifyPublicActionEventHash } from "../../game/publicEventHash";
import type { PublicActionEvent, PublicSeat } from "../../game/publicEvent";
import { createCanonicalSemanticKey } from "./identity";
import {
  canonicalActionIdentity,
  type CrnView,
  type RolloutAction,
  type RolloutPolicyDecisionContext,
  type RolloutPolicyId,
  type RolloutPolicyFailure,
  type RolloutPolicyResult,
  type SeatLocalObservation,
} from "./contracts";

export type InternalRolloutPolicy = Readonly<{
  listLegalActions(observation: SeatLocalObservation): readonly RolloutAction[];
  chooseAction(
    observation: SeatLocalObservation,
    context: RolloutPolicyDecisionContext,
    crn: CrnView,
  ): RolloutPolicyResult;
}>;

export type InternalRolloutPolicyFactoryResult =
  | Readonly<{ ok: true; policy: InternalRolloutPolicy }>
  | Readonly<{ ok: false; failure: { kind: "unsupported-policy-id" } }>;

export type SeatLocalObservationValidationResult =
  | Readonly<{ ok: true; observation: SeatLocalObservation }>
  | Readonly<{
      ok: false;
      failure: Extract<RolloutPolicyFailure, { kind: "invalid-policy-context" }>;
    }>;

type ObservationFailure = Extract<RolloutPolicyFailure, { kind: "invalid-policy-context" }>;
type ObservationIsolationResult =
  | Readonly<{ ok: true; observation: SeatLocalObservation }>
  | Readonly<{ ok: false; failure: ObservationFailure }>;

const CANONICAL_CARD_IDS = new Set(createDeck().map((card) => card.id));

const fixedPolicy: InternalRolloutPolicy = Object.freeze({
  listLegalActions,
  chooseAction,
});

export function createInternalRolloutPolicy(policyId: RolloutPolicyId): InternalRolloutPolicyFactoryResult {
  if (policyId !== "d2f-lightweight-v1") {
    return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "unsupported-policy-id" as const }) });
  }
  return Object.freeze({ ok: true as const, policy: fixedPolicy });
}

export function validateSeatLocalObservation(input: unknown): SeatLocalObservationValidationResult {
  return isolateObservation(input);
}

function listLegalActions(input: SeatLocalObservation): readonly RolloutAction[] {
  const isolated = isolateObservation(input);
  if (!isolated.ok) return Object.freeze([]);
  const observation = isolated.observation;

  try {
    const lastPlay = observation.currentLastPlay as CardGroup | null;
    const groups = detectGroups([...observation.hand], observation.gameRank)
      .filter((group) => canBeatPlay(group, lastPlay ?? undefined, observation.gameRank))
      .map((group) => freezeAction({
        type: "play",
        group,
      }));
    const actions: RolloutAction[] = [...groups];
    if (lastPlay !== null) actions.push(Object.freeze({ type: "pass" }));
    actions.sort(compareActions);
    return Object.freeze(actions);
  } catch {
    return Object.freeze([]);
  }
}

function chooseAction(
  input: SeatLocalObservation,
  contextInput: RolloutPolicyDecisionContext,
  crn: CrnView,
): RolloutPolicyResult {
  const context = isolateContext(contextInput);
  if (context === undefined) {
    const rawContext = contextInput as unknown as Record<string, unknown>;
    return policyFailure(safeContextFailure(rawContext));
  }

  const validation = validateSeatLocalObservation(input);
  if (!validation.ok) return validation;
  const observation = validation.observation;
  if (observation.finishOrder.includes(context.actingSeat)
    || observation.handCounts[context.actingSeat] <= 0
    || observation.hand.length !== observation.handCounts[context.actingSeat]) {
    return policyFailure({ kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" });
  }

  const actions = listLegalActions(observation);
  if (actions.length === 0) return policyFailure({ kind: "no-legal-action", actingSeat: context.actingSeat });

  let selected = actions[0]!;
  let selectedPriority = Number.POSITIVE_INFINITY;
  for (const action of actions) {
    const semanticKey = createCanonicalSemanticKey(`policy-action:${canonicalActionIdentity(action)}`);
    if (!semanticKey.ok) return policyFailure({ kind: "crn-failure", field: "value", reason: "construction-failed" });
    let priority: number;
    try {
      priority = crn.value(semanticKey.value);
    } catch {
      return policyFailure({ kind: "crn-failure", field: "value", reason: "throwing-value" });
    }
    if (!Number.isFinite(priority)) return policyFailure({ kind: "crn-failure", field: "value", reason: "non-finite-value" });
    if (priority < 0 || priority >= 1) return policyFailure({ kind: "crn-failure", field: "value", reason: "out-of-range-value" });
    if (priority < selectedPriority) {
      selected = action;
      selectedPriority = priority;
    }
  }

  const legalActions = listLegalActions(observation);
  if (!legalActions.some((action) => canonicalActionIdentity(action) === canonicalActionIdentity(selected))) {
    return policyFailure({ kind: "no-legal-action", actingSeat: context.actingSeat });
  }
  return Object.freeze({ ok: true as const, action: selected });
}

function isolateObservation(input: unknown): ObservationIsolationResult {
  try {
    if (!isPlainDataRecord(input, ["hand", "publicHistoryEvents", "handCounts", "currentLastPlay", "finishOrder", "gameRank"], true)) return malformedObservation();
    const hand = getDataProperty(input, "hand");
    const publicHistoryEvents = getDataProperty(input, "publicHistoryEvents");
    const handCounts = getDataProperty(input, "handCounts");
    const currentLastPlay = getDataProperty(input, "currentLastPlay");
    const finishOrder = getDataProperty(input, "finishOrder");
    const gameRank = getDataProperty(input, "gameRank");
    if (!isPlainDataGraph(hand) || !isPlainDataGraph(publicHistoryEvents) || !isPlainDataGraph(handCounts) || !isPlainDataGraph(finishOrder) || (currentLastPlay !== null && !isPlainDataGraph(currentLastPlay)) || !isGameRank(gameRank)) return malformedObservation();
    const semanticFailure = isObservationSemantics(hand, publicHistoryEvents, handCounts, currentLastPlay, finishOrder, gameRank);
    if (semanticFailure !== undefined) return Object.freeze({ ok: false as const, failure: Object.freeze(semanticFailure) });
    const canonicalLastPlay = currentLastPlay === null ? null : canonicalizeCardGroup(currentLastPlay, gameRank);
    if (currentLastPlay !== null && canonicalLastPlay === undefined) return malformedObservation();
    return Object.freeze({
      ok: true as const,
      observation: deepFreeze({
        hand: structuredClone(hand) as readonly Card[],
        publicHistoryEvents: structuredClone(publicHistoryEvents),
        handCounts: structuredClone(handCounts) as Readonly<Record<0 | 1 | 2 | 3, number>>,
        currentLastPlay: canonicalLastPlay === null ? null : structuredClone(canonicalLastPlay),
        finishOrder: structuredClone(finishOrder) as readonly (0 | 1 | 2 | 3)[],
        gameRank,
      }) as SeatLocalObservation,
    });
  } catch {
    return malformedObservation();
  }
}

function isObservationSemantics(
  hand: unknown,
  publicHistoryEvents: unknown,
  handCounts: unknown,
  currentLastPlay: unknown,
  finishOrder: unknown,
  gameRank: GameRank,
): ObservationFailure | undefined {
  if (!isCardArray(hand) || new Set(hand.map((card) => card.id)).size !== hand.length) return malformedObservationFailure();
  if (!isPlainDataRecord(handCounts, ["0", "1", "2", "3"], true)) return malformedObservationFailure();
  const counts = handCounts as Record<string, unknown>;
  if (!["0", "1", "2", "3"].every((seat) => isNonNegativeSafeInteger(counts[seat]))) return malformedObservationFailure();
  if (!isCanonicalSeatArray(finishOrder)) return malformedObservationFailure();
  const finished = finishOrder as readonly (0 | 1 | 2 | 3)[];
  if (![0, 1, 2, 3].every((seat) => finished.includes(seat as 0 | 1 | 2 | 3) ? counts[String(seat)] === 0 : (counts[String(seat)] as number) > 0)) return malformedObservationFailure();
  if (isRoomTerminalFinishOrder(finished)) return malformedObservationFailure();
  if (currentLastPlay !== null && canonicalizeCardGroup(currentLastPlay, gameRank) === undefined) return malformedObservationFailure();
  if (!isPlainDataArray(publicHistoryEvents)) return malformedObservationFailure();
  const handIds = new Set((hand as readonly Card[]).map((card) => card.id));
  const playedIds = new Set<string>();
  for (const event of publicHistoryEvents) {
    if (!isPlainDataGraph(event)) return malformedObservationFailure();
    const eventRecord = event as Record<string, unknown>;
    if (eventRecord.kind !== "play" && eventRecord.kind !== "tribute" && eventRecord.kind !== "return") {
      const publicCardIdsDescriptor = Object.getOwnPropertyDescriptor(eventRecord, "publicCardIds");
      if (isDataDescriptor(publicCardIdsDescriptor) && publicCardIdsDescriptor.value !== undefined) {
        return { kind: "invalid-policy-context", field: "publicHistoryEvents[].publicCardIds", reason: "non-play-event-card-ids" };
      }
    }
    if (!isValidPublicEvent(event)) return malformedObservationFailure();
    if (eventRecord.kind !== "play") continue;
    const publicCardIds = eventRecord.publicCardIds;
    if (!Array.isArray(publicCardIds)) return malformedObservationFailure();
    const eventIds = publicCardIds as readonly string[];
    if (eventIds.some((id) => !CANONICAL_CARD_IDS.has(id))) {
      return { kind: "invalid-policy-context", field: "publicHistoryEvents[].publicCardIds", reason: "foreign-card-id" };
    }
    if (new Set(eventIds).size !== eventIds.length) {
      return { kind: "invalid-policy-context", field: "publicHistoryEvents[].publicCardIds", reason: "duplicate-card-id" };
    }
    if (eventIds.some((id) => playedIds.has(id))) {
      return { kind: "invalid-policy-context", field: "publicHistoryEvents[].publicCardIds", reason: "cross-event-duplicate-card-id" };
    }
    if (eventIds.some((id) => handIds.has(id))) {
      return { kind: "invalid-policy-context", field: "publicHistoryEvents[].publicCardIds", reason: "acting-hand-overlap" };
    }
    for (const id of eventIds) playedIds.add(id);
  }
  if (!isCoherentPublicHistory(publicHistoryEvents as readonly PublicActionEvent[], counts, finished, currentLastPlay, gameRank)) return malformedObservationFailure();
  return undefined;
}

function malformedObservation(): ObservationIsolationResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze(malformedObservationFailure()) });
}

function malformedObservationFailure(): ObservationFailure {
  return { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" };
}

function isCoherentPublicHistory(
  events: readonly PublicActionEvent[],
  counts: Record<string, unknown>,
  finishOrder: readonly (0 | 1 | 2 | 3)[],
  currentLastPlay: unknown,
  gameRank: GameRank,
): boolean {
  const first = events[0];
  const finished: (0 | 1 | 2 | 3)[] = [];
  const derivedCounts: Record<0 | 1 | 2 | 3, number> = {
    0: counts["0"] as number,
    1: counts["1"] as number,
    2: counts["2"] as number,
    3: counts["3"] as number,
  };
  let lastPlay: Extract<PublicActionEvent, { kind: "play" }> | undefined;
  let activeLastPlaySeat: 0 | 1 | 2 | 3 | undefined;
  const passSeats = new Set<0 | 1 | 2 | 3>();
  const seenCardIds = new Set<string>();
  let currentTrickIndex: number | undefined;
  let ordinaryStarted = false;
  let finishingAction = false;
  let terminalReached = false;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.eventIndex !== index) return false;
    if (first !== undefined && (event.gameId !== first.gameId || event.roundIdentity !== first.roundIdentity || event.handIdentity !== first.handIdentity)) return false;
    if (currentTrickIndex === undefined) currentTrickIndex = event.trickIndex;
    if (event.kind === "tribute" || event.kind === "return" || event.kind === "anti-tribute") {
      if (ordinaryStarted || event.trickIndex !== currentTrickIndex) return false;
      if (event.kind === "tribute" || event.kind === "return") {
        if (event.fromSeat === event.toSeat) return false;
        const expectedChanges: Record<0 | 1 | 2 | 3, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
        expectedChanges[event.fromSeat] = -1;
        expectedChanges[event.toSeat] = 1;
        const allSeats: readonly (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];
        if (!allSeats.every((seat) => event.handCountChanges[seat] === expectedChanges[seat])) return false;
      }
      continue;
    }
    if (terminalReached && event.kind !== "finish") return false;
    if (event.trickIndex !== currentTrickIndex) return false;
    ordinaryStarted = true;
    if (event.kind === "play") {
      if (finished.includes(event.seat) || event.publicCardIds.some((id) => seenCardIds.has(id)) || new Set(event.publicCardIds).size !== event.publicCardIds.length) return false;
      if (event.handCountAfter !== event.handCountBefore - event.publicCardIds.length) return false;
      for (const id of event.publicCardIds) seenCardIds.add(id);
      lastPlay = event;
      activeLastPlaySeat = event.seat;
      passSeats.clear();
      finishingAction = false;
    } else if (event.kind === "pass") {
      if (finished.includes(event.seat) || activeLastPlaySeat === undefined || activeLastPlaySeat === event.seat || passSeats.has(event.seat) || event.handCountAfter !== event.handCountBefore) return false;
      passSeats.add(event.seat);
      finishingAction = false;
    } else if (event.kind === "trick-clear") {
      const requiredPasses = Math.max(1, 4 - finished.length - 1);
      const expectedLeadSeat = activeLastPlaySeat === undefined ? undefined : resolvePublicTrickWinnerSeat(activeLastPlaySeat, finished);
      if (activeLastPlaySeat === undefined
        || passSeats.size < requiredPasses
        || event.publicStableKey !== trickClearPublicStableKey(currentTrickIndex, currentTrickIndex + 1)
        || event.leadSeat !== expectedLeadSeat) return false;
      lastPlay = undefined;
      activeLastPlaySeat = undefined;
      passSeats.clear();
      currentTrickIndex += 1;
      finishingAction = false;
    } else if (event.kind === "finish") {
      const previousEvent = index === 0 ? undefined : events[index - 1];
      if (terminalReached && event.finishReason !== "round-settlement") return false;
      if (event.finishReason === "hand-empty") {
        if (activeLastPlaySeat === undefined
          || event.seat !== activeLastPlaySeat
          || previousEvent?.kind !== "play"
          || previousEvent.seat !== event.seat
          || previousEvent.handCountAfter !== 0
          || event.remainingHandCount !== 0) return false;
        finishingAction = true;
      } else if (!terminalReached || !finishingAction) {
        return false;
      }
      if (activeLastPlaySeat === undefined || event.finishPosition !== finished.length + 1 || finished.includes(event.seat)) return false;
      finished.push(event.seat);
      if (isRoomTerminalFinishOrder(finished)) terminalReached = true;
    }
  }
  if (terminalReached && finished.length !== 4) return false;
  if (finished.length !== finishOrder.length || !finished.every((seat, index) => finishOrder[index] === seat)) return false;
  if ((currentLastPlay !== null) !== (lastPlay !== undefined)) return false;
  if (currentLastPlay !== null && lastPlay !== undefined) {
    const canonicalLastPlay = canonicalizeCardGroup(currentLastPlay, gameRank);
    if (canonicalLastPlay === undefined
      || canonicalLastPlay.type !== lastPlay.groupType
      || canonicalLastPlay.type !== lastPlay.patternType
      || playPublicStableKey(canonicalLastPlay.cards.map((card) => card.id)) !== lastPlay.publicStableKey
      || !sameCardIdMultiset(canonicalLastPlay.cards.map((card) => card.id), lastPlay.publicCardIds)
      || (lastPlay.usedWildcardCount !== undefined && canonicalLastPlay.wildcards.length !== lastPlay.usedWildcardCount)) return false;
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.kind === "play" || event.kind === "pass") {
      if (derivedCounts[event.seat] !== event.handCountAfter) return false;
      derivedCounts[event.seat] = event.handCountBefore;
    } else if (event.kind === "finish") {
      if (derivedCounts[event.seat] !== event.remainingHandCount) return false;
    } else if (event.kind === "tribute" || event.kind === "return") {
      for (const seat of [0, 1, 2, 3] as const) derivedCounts[seat] -= event.handCountChanges[seat];
    }
  }
  if (Object.values(derivedCounts).some((count) => count < 0)) return false;
  return true;
}

function isRoomTerminalFinishOrder(finished: readonly PublicSeat[]): boolean {
  if (finished.length >= 3) return true;
  return finished.length >= 2 && ((finished[0]! + 2) % 4) === finished[1];
}

function resolvePublicTrickWinnerSeat(lastPlaySeat: PublicSeat, finished: readonly PublicSeat[]): PublicSeat | undefined {
  if (!finished.includes(lastPlaySeat)) return lastPlaySeat;
  const partner = ((lastPlaySeat + 2) % 4) as PublicSeat;
  if (!finished.includes(partner)) return partner;
  for (let offset = 1; offset <= 4; offset += 1) {
    const seat = ((lastPlaySeat + 4 - offset) % 4) as PublicSeat;
    if (!finished.includes(seat)) return seat;
  }
  return undefined;
}

function isValidPublicEvent(value: unknown): value is PublicActionEvent {
  try {
    if (!isPlainDataGraph(value)) return false;
    assertFinalizedPublicActionEvent(value);
    verifyPublicActionEventHash(value);
    return true;
  } catch {
    return false;
  }
}

function canonicalizeCardGroup(value: unknown, gameRank: GameRank): CardGroup | undefined {
  if (!isPlainDataRecord(value, ["id", "type", "label", "purpose", "cards", "wildcards", "strength"], true)) return undefined;
  const group = value as Record<string, unknown>;
  if (typeof group.id !== "string" || group.id.length === 0 || typeof group.type !== "string" || typeof group.label !== "string" || typeof group.purpose !== "string" || !isNonNegativeSafeInteger(group.strength) || !isCardArray(group.cards) || group.cards.length === 0 || !isCardArray(group.wildcards)) return undefined;
  const cardIds = group.cards.map((card) => card.id);
  const wildcardIds = group.wildcards.map((card) => card.id);
  if (new Set(cardIds).size !== cardIds.length || new Set(wildcardIds).size !== wildcardIds.length || wildcardIds.some((id) => !cardIds.includes(id))) return undefined;
  if (group.wildcards.some((card) => !isHeartRankWild(card, gameRank))) return undefined;
  try {
    const classified = classifyPlay([...group.cards], gameRank);
    const matches = classified !== undefined
      && classified.type === group.type
      && classified.id === group.id
      && classified.label === group.label
      && classified.purpose === group.purpose
      && classified.strength === group.strength
      && sameCardIdMultiset(classified.cards.map((card) => card.id), cardIds)
      && sameCardIdMultiset(classified.wildcards.map((card) => card.id), wildcardIds);
    return matches ? classified : undefined;
  } catch {
    return undefined;
  }
}

function isCardArray(value: unknown): value is readonly Card[] {
  return isPlainDataArray(value) && value.every(isCard);
}

function isCard(value: unknown): value is Card {
  if (!isPlainDataRecord(value, ["id", "kind", "rank", "suit", "copy"], false)) return false;
  const card = value as Record<string, unknown>;
  if (typeof card.id !== "string" || typeof card.kind !== "string" || typeof card.rank !== "string" || (card.copy !== 1 && card.copy !== 2)) return false;
  if (card.kind === "joker") return Object.keys(card).length === 4 && (card.rank === "SJ" || card.rank === "BJ") && card.id === `Joker-${card.rank}-${card.copy}`;
  return Object.keys(card).length === 5 && card.kind === "suited" && typeof card.suit === "string" && SUITS.includes(card.suit as (typeof SUITS)[number]) && RANKS.includes(card.rank as (typeof RANKS)[number]) && card.id === `${card.suit === "spades" ? "S" : card.suit === "clubs" ? "C" : card.suit === "hearts" ? "H" : "D"}${card.rank}-${card.copy}`;
}

function isCanonicalSeatArray(value: unknown): value is readonly (0 | 1 | 2 | 3)[] {
  if (!isPlainDataArray(value) || value.length > 4 || !value.every(isSeat)) return false;
  return new Set(value).size === value.length;
}

function sameCardIdMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<string, number>();
  for (const id of left) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of right) {
    const remaining = counts.get(id);
    if (remaining === undefined) return false;
    if (remaining === 1) counts.delete(id);
    else counts.set(id, remaining - 1);
  }
  return counts.size === 0;
}

function isolateContext(input: unknown): RolloutPolicyDecisionContext | undefined {
  try {
    if (!isPlainDataRecord(input, ["replicateIdentity", "ply", "actingSeat"], true)) return undefined;
    const replicateIdentity = getDataProperty(input, "replicateIdentity");
    const ply = getDataProperty(input, "ply");
    const actingSeat = getDataProperty(input, "actingSeat");
    if (typeof replicateIdentity !== "string" || replicateIdentity.length === 0 || !isNonNegativeSafeInteger(ply) || !isSeat(actingSeat)) return undefined;
    return Object.freeze({ replicateIdentity, ply, actingSeat });
  } catch {
    return undefined;
  }
}

function safeContextFailure(input: Record<string, unknown>): Extract<RolloutPolicyResult, { ok: false }>["failure"] {
  try {
    const plyDescriptor = Object.getOwnPropertyDescriptor(input, "ply");
    if (plyDescriptor === undefined || !isDataDescriptor(plyDescriptor) || !isNonNegativeSafeInteger(plyDescriptor.value)) {
      return { kind: "invalid-policy-context", field: "ply", reason: "invalid-ply" };
    }
    return { kind: "invalid-policy-context", field: "actingSeat", reason: "invalid-acting-seat" };
  } catch {
    return { kind: "invalid-policy-context", field: "ply", reason: "invalid-ply" };
  }
}

function freezeAction(action: RolloutAction): RolloutAction {
  return deepFreeze(structuredClone(action)) as RolloutAction;
}

function compareActions(left: RolloutAction, right: RolloutAction): number {
  return compareCodeUnits(canonicalActionIdentity(left), canonicalActionIdentity(right));
}

function policyFailure(failure: Extract<RolloutPolicyResult, { ok: false }>['failure']): RolloutPolicyResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze(failure) });
}

function isGameRank(value: unknown): value is GameRank {
  return value === "A" || value === "K" || value === "Q" || value === "J" || value === "10" || value === "9" || value === "8" || value === "7" || value === "6" || value === "5" || value === "4" || value === "3" || value === "2";
}

function isSeat(value: unknown): value is 0 | 1 | 2 | 3 {
  return isNonNegativeSafeInteger(value) && (value === 0 || value === 1 || value === 2 || value === 3);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || (allowedKeys !== undefined && !allowedKeys.includes(key)))) return false;
    if (exact && allowedKeys !== undefined && (ownKeys.length !== allowedKeys.length || allowedKeys.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!isDataDescriptor(lengthDescriptor) || !isNonNegativeSafeInteger(lengthDescriptor.value)) return false;
    const length = lengthDescriptor.value;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) return false;
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      if (!ownKeys.includes(key) || !isDataDescriptor(Object.getOwnPropertyDescriptor(value, key))) return false;
    }
    return ownKeys.every((key) => key === "length" || (typeof key === "string" && /^0$|^[1-9]\d*$/.test(key) && Number(key) < length));
  } catch {
    return false;
  }
}

function isPlainDataGraph(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = (Array.isArray(value) ? isPlainDataArray(value) : isPlainDataRecord(value))
    && Reflect.ownKeys(value).every((key) => typeof key === "string" && isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)) && isPlainDataGraph((Object.getOwnPropertyDescriptor(value, key) as PropertyDescriptor & { value: unknown }).value, ancestors));
  ancestors.delete(value);
  return valid;
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function getDataProperty(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!isDataDescriptor(descriptor)) throw new TypeError("DATA_PROPERTY_INVALID");
  return descriptor.value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (isDataDescriptor(descriptor)) deepFreeze(descriptor.value, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return left.length - right.length;
}
