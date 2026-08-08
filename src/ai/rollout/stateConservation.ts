import type { Card, GameRank } from "../../engine/cards";
import { createDeck } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { playPublicStableKey } from "../../game/publicEvent";
import type { PublicSeat } from "../../game/publicEvent";
import type { RolloutAction } from "./contracts";

export type IsolatedRolloutState = Readonly<{
  hands: Readonly<Record<PublicSeat, readonly Card[]>>;
  publicPlayedCardIds: readonly string[];
  currentLastPlay: Readonly<CardGroup> | null;
  currentLastPlaySeat: PublicSeat | null;
  currentTrick: Readonly<{
    trickIndex: number;
    leadSeat: PublicSeat;
    lastPlaySeat?: PublicSeat;
    lastPlayStableKey?: string;
    passSeats: readonly PublicSeat[];
  }>;
  handCounts: Readonly<Record<PublicSeat, number>>;
  finishOrder: readonly PublicSeat[];
  actingSeat: PublicSeat;
  expectedCardIds: readonly string[];
  gameRank: GameRank;
}>;

export type StateConservationFailure = Readonly<{
  kind: "state-conservation-failed";
  reason:
    | "invalid-shape"
    | "duplicate-card"
    | "public-card-overlap"
    | "unexpected-card"
    | "missing-card"
    | "hand-count-mismatch"
    | "finished-hand-count-mismatch"
    | "unfinished-hand-count-mismatch"
    | "invalid-finish-order"
    | "invalid-trick"
    | "invalid-turn"
    | "invalid-action-transition";
}>;

export type StateConservationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; failure: StateConservationFailure }>;

const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];
const SEAT_KEYS = ["0", "1", "2", "3"] as const;
const CANONICAL_CARD_IDS = Object.freeze(createDeck().map((card) => card.id));

export function validateRolloutState(input: unknown): StateConservationResult {
  try {
    if (!isStateShape(input)) return failed("invalid-shape");
    const state = input as IsolatedRolloutState;
    if (!validateCardsAndConservation(state)) return failed(findCardFailure(state));
    if (!validateHandCounts(state)) return failed(findHandCountFailure(state));
    if (!validateFinishOrder(state)) return failed("invalid-finish-order");
    const trickFailure = validateTrickAndTurn(state);
    if (trickFailure !== undefined) return failed(trickFailure);
    return success();
  } catch {
    return failed("invalid-shape");
  }
}

export function validateActionTransition(
  beforeInput: unknown,
  afterInput: unknown,
  actionInput: unknown,
): StateConservationResult {
  const before = validateRolloutState(beforeInput);
  const after = validateRolloutState(afterInput);
  if (!before.ok || !after.ok || !isActionShape(actionInput)) return failed("invalid-action-transition");
  const stateBefore = beforeInput as IsolatedRolloutState;
  const stateAfter = afterInput as IsolatedRolloutState;
  const action = actionInput as RolloutAction;

  if (!sameArray(stateBefore.expectedCardIds, stateAfter.expectedCardIds)) return failed("invalid-action-transition");
  if (action.type === "pass") return validatePassTransition(stateBefore, stateAfter);
  return validatePlayTransition(stateBefore, stateAfter, action);
}

function validateCardsAndConservation(state: IsolatedRolloutState): boolean {
  if (!sameCardIdMultiset(state.expectedCardIds, CANONICAL_CARD_IDS)) return false;
  const expected = new Set(CANONICAL_CARD_IDS);
  const handIds: string[] = [];
  for (const seat of SEATS) {
    for (const card of state.hands[seat]) handIds.push(card.id);
  }
  const publicIds = [...state.publicPlayedCardIds];
  const allIds = [...handIds, ...publicIds];
  if (new Set(handIds).size !== handIds.length) return false;
  if (new Set(publicIds).size !== publicIds.length) return false;
  if (publicIds.some((id) => handIds.includes(id))) return false;
  if (allIds.some((id) => !expected.has(id))) return false;
  if (allIds.length !== expected.size || allIds.some((id) => !expected.has(id))) return false;
  return [...expected].every((id) => allIds.includes(id));
}

function validateHandCounts(state: IsolatedRolloutState): boolean {
  for (const seat of SEATS) {
    if (state.handCounts[seat] !== state.hands[seat].length) return false;
    if (state.finishOrder.includes(seat)) {
      if (state.handCounts[seat] !== 0) return false;
    } else if (state.handCounts[seat] <= 0) {
      return false;
    }
  }
  return true;
}

function validateFinishOrder(state: IsolatedRolloutState): boolean {
  if (state.finishOrder.length > SEATS.length) return false;
  return state.finishOrder.every((seat, index) => isSeat(seat) && state.finishOrder.indexOf(seat) === index);
}

function validateTrickAndTurn(state: IsolatedRolloutState): StateConservationFailure["reason"] | undefined {
  const trick = state.currentTrick;
  if (!isNonNegativeSafeInteger(trick.trickIndex) || !isSeat(trick.leadSeat) || !isPlainDataArray(trick.passSeats)) return "invalid-trick";
  if (!trick.passSeats.every(isSeat) || new Set(trick.passSeats).size !== trick.passSeats.length) return "invalid-trick";
  if (trick.passSeats.some((seat) => state.finishOrder.includes(seat))) return "invalid-trick";
  const hasCurrentPlay = state.currentLastPlay !== null;
  const hasTrickPlay = trick.lastPlaySeat !== undefined || trick.lastPlayStableKey !== undefined;
  if (hasCurrentPlay !== hasTrickPlay) return "invalid-trick";
  if (hasCurrentPlay) {
    if (!isCardGroup(state.currentLastPlay) || trick.lastPlaySeat !== state.currentLastPlaySeat || !isSeat(trick.lastPlaySeat) || typeof trick.lastPlayStableKey !== "string") return "invalid-trick";
    if (trick.lastPlayStableKey !== playPublicStableKey(state.currentLastPlay.cards.map((card) => card.id))) return "invalid-trick";
    if (trick.passSeats.includes(trick.lastPlaySeat) || state.currentLastPlay.cards.some((card) => !state.publicPlayedCardIds.includes(card.id))) return "invalid-trick";
  } else if (state.currentLastPlaySeat !== null || trick.passSeats.length !== 0) {
    return "invalid-trick";
  }
  if (!isSeat(state.actingSeat)) return "invalid-turn";
  if (state.finishOrder.length < SEATS.length && state.finishOrder.includes(state.actingSeat)) return "invalid-turn";
  if (state.finishOrder.length < SEATS.length && state.handCounts[state.actingSeat] <= 0) return "invalid-turn";
  return undefined;
}

function validatePlayTransition(
  before: IsolatedRolloutState,
  after: IsolatedRolloutState,
  action: Extract<RolloutAction, { type: "play" }>,
): StateConservationResult {
  if (action.group.cards.length === 0 || !isCardGroup(action.group)) return failed("invalid-action-transition");
  if (before.currentLastPlay !== null && after.currentLastPlay === null) return failed("invalid-action-transition");
  const playedIds = action.group.cards.map((card) => card.id);
  if (new Set(playedIds).size !== playedIds.length || playedIds.some((id) => !before.hands[before.actingSeat].some((card) => card.id === id))) return failed("invalid-action-transition");
  const beforeHand = before.hands[before.actingSeat].map((card) => card.id);
  const afterHand = after.hands[before.actingSeat].map((card) => card.id);
  if (afterHand.length !== beforeHand.length - playedIds.length) return failed("invalid-action-transition");
  if (afterHand.some((id) => playedIds.includes(id)) || beforeHand.filter((id) => !playedIds.includes(id)).some((id) => !afterHand.includes(id))) return failed("invalid-action-transition");
  if (!sameOtherHands(before, after, before.actingSeat)) return failed("invalid-action-transition");
  const appendedPublicIds = after.publicPlayedCardIds.slice(before.publicPlayedCardIds.length);
  if (!sameCardIdMultiset(appendedPublicIds, playedIds)) return failed("invalid-action-transition");
  if (after.currentTrick.trickIndex !== before.currentTrick.trickIndex || after.currentTrick.leadSeat !== before.currentTrick.leadSeat) return failed("invalid-action-transition");
  if (after.currentLastPlaySeat !== before.actingSeat || after.currentLastPlay === null) return failed("invalid-action-transition");
  if (!sameCardIds(after.currentLastPlay.cards, action.group.cards)) return failed("invalid-action-transition");
  if (after.currentTrick.passSeats.length !== 0) return failed("invalid-action-transition");
  if (after.finishOrder.length === before.finishOrder.length + 1) {
    if (afterHand.length !== 0 || after.finishOrder.at(-1) !== before.actingSeat) return failed("invalid-action-transition");
  } else if (!sameArray(before.finishOrder, after.finishOrder)) {
    return failed("invalid-action-transition");
  }
  if (after.actingSeat !== expectedNextSeat(after, before.actingSeat)) return failed("invalid-action-transition");
  return success();
}

function validatePassTransition(before: IsolatedRolloutState, after: IsolatedRolloutState): StateConservationResult {
  if (before.currentLastPlay === null || before.currentLastPlaySeat === null) return failed("invalid-action-transition");
  if (!sameHands(before, after) || !sameArray(before.publicPlayedCardIds, after.publicPlayedCardIds) || !sameArray(before.finishOrder, after.finishOrder)) return failed("invalid-action-transition");
  if (after.currentTrick.trickIndex === before.currentTrick.trickIndex + 1) {
    if (after.currentLastPlay !== null || after.currentLastPlaySeat !== null || after.currentTrick.lastPlaySeat !== undefined || after.currentTrick.passSeats.length !== 0 || after.currentTrick.leadSeat !== expectedTrickWinner(before, before.currentLastPlaySeat) || after.actingSeat !== after.currentTrick.leadSeat) return failed("invalid-action-transition");
    return success();
  }
  if (after.currentTrick.trickIndex !== before.currentTrick.trickIndex || after.currentTrick.leadSeat !== before.currentTrick.leadSeat || after.currentLastPlay === null || after.currentLastPlaySeat !== before.currentLastPlaySeat || !after.currentTrick.passSeats.includes(before.actingSeat) || !sameCardIds(after.currentLastPlay.cards, before.currentLastPlay.cards) || after.actingSeat !== expectedNextSeat(after, before.actingSeat)) return failed("invalid-action-transition");
  return success();
}

function isStateShape(value: unknown): value is IsolatedRolloutState {
  return isPlainDataRecord(value, ["hands", "publicPlayedCardIds", "currentLastPlay", "currentLastPlaySeat", "currentTrick", "handCounts", "finishOrder", "actingSeat", "expectedCardIds", "gameRank"], true)
    && isPlainDataRecord(value.hands, SEAT_KEYS, true)
    && SEATS.every((seat) => isPlainDataArray(value.hands[String(seat)]))
    && isPlainDataArray(value.publicPlayedCardIds)
    && value.publicPlayedCardIds.every(isCardId)
    && (value.currentLastPlay === null || isCardGroup(value.currentLastPlay))
    && (value.currentLastPlaySeat === null || isSeat(value.currentLastPlaySeat))
    && isPlainDataRecord(value.currentTrick, ["trickIndex", "leadSeat", "lastPlaySeat", "lastPlayStableKey", "passSeats"], false)
    && isPlainDataRecord(value.handCounts, SEAT_KEYS, true)
    && SEATS.every((seat) => isNonNegativeSafeInteger(value.handCounts[String(seat)]))
    && isPlainDataArray(value.finishOrder)
    && isPlainDataArray(value.expectedCardIds)
    && value.expectedCardIds.every(isCardId)
    && isSeat(value.actingSeat)
    && isGameRank(value.gameRank)
    && SEATS.every((seat) => value.hands[String(seat)].every(isCard));
}

function isActionShape(value: unknown): value is RolloutAction {
  if (!isPlainDataRecord(value, ["type", "group"], false) || (value.type !== "pass" && value.type !== "play")) return false;
  return value.type === "pass" ? Object.keys(value).length === 1 : isCardGroup(value.group);
}

function isCardGroup(value: unknown): value is CardGroup {
  return isPlainDataRecord(value, ["id", "type", "label", "purpose", "cards", "wildcards", "strength"], true)
    && typeof value.id === "string"
    && typeof value.type === "string"
    && typeof value.label === "string"
    && typeof value.purpose === "string"
    && isNonNegativeSafeInteger(value.strength)
    && isPlainDataArray(value.cards)
    && value.cards.length > 0
    && value.cards.every(isCard)
    && new Set(value.cards.map((card: Card) => card.id)).size === value.cards.length
    && isPlainDataArray(value.wildcards)
    && value.wildcards.every(isCard)
    && new Set(value.wildcards.map((card: Card) => card.id)).size === value.wildcards.length
    && value.wildcards.every((card) => value.cards.some((candidate: Card) => candidate.id === card.id));
}

function isCard(value: unknown): value is Card {
  if (!isPlainDataRecord(value, ["id", "kind", "rank", "suit", "copy"], false) || typeof value.id !== "string" || typeof value.kind !== "string" || typeof value.rank !== "string" || (value.copy !== 1 && value.copy !== 2)) return false;
  if (value.kind === "joker") return Object.keys(value).length === 4 && (value.rank === "SJ" || value.rank === "BJ") && value.id === `Joker-${value.rank}-${value.copy}`;
  return Object.keys(value).length === 5 && value.kind === "suited" && typeof value.suit === "string" && ["spades", "clubs", "hearts", "diamonds"].includes(value.suit) && value.rank !== "SJ" && value.rank !== "BJ" && value.id === `${value.suit === "spades" ? "S" : value.suit === "clubs" ? "C" : value.suit === "hearts" ? "H" : "D"}${value.rank}-${value.copy}`;
}

function isCardId(value: unknown): value is string {
  return typeof value === "string" && /^(?:[SCHD](?:10|[AKQJ2-9])-[12]|Joker-(?:SJ|BJ)-[12])$/.test(value);
}

function isGameRank(value: unknown): value is GameRank {
  return ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"].includes(value as string);
}

function isSeat(value: unknown): value is PublicSeat {
  return isNonNegativeSafeInteger(value) && (value === 0 || value === 1 || value === 2 || value === 3);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, any> {
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

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function findCardFailure(state: IsolatedRolloutState): StateConservationFailure["reason"] {
  if (!sameCardIdMultiset(state.expectedCardIds, CANONICAL_CARD_IDS)) return "missing-card";
  const handIds = SEATS.flatMap((seat) => state.hands[seat].map((card) => card.id));
  if (new Set(handIds).size !== handIds.length || new Set(state.publicPlayedCardIds).size !== state.publicPlayedCardIds.length) return "duplicate-card";
  if (state.publicPlayedCardIds.some((id) => handIds.includes(id))) return "public-card-overlap";
  const allIds = [...handIds, ...state.publicPlayedCardIds];
  if (allIds.some((id) => !state.expectedCardIds.includes(id))) return "unexpected-card";
  if (allIds.length !== state.expectedCardIds.length || state.expectedCardIds.some((id) => !allIds.includes(id))) return "missing-card";
  return "invalid-shape";
}

function findHandCountFailure(state: IsolatedRolloutState): StateConservationFailure["reason"] {
  for (const seat of SEATS) {
    if (state.handCounts[seat] !== state.hands[seat].length) return "hand-count-mismatch";
    if (state.finishOrder.includes(seat) && state.handCounts[seat] !== 0) return "finished-hand-count-mismatch";
    if (!state.finishOrder.includes(seat) && state.handCounts[seat] <= 0) return "unfinished-hand-count-mismatch";
  }
  return "invalid-shape";
}

function sameHands(left: IsolatedRolloutState, right: IsolatedRolloutState): boolean {
  return SEATS.every((seat) => sameArray(left.hands[seat].map((card) => card.id), right.hands[seat].map((card) => card.id)) && left.handCounts[seat] === right.handCounts[seat]);
}

function sameOtherHands(left: IsolatedRolloutState, right: IsolatedRolloutState, changedSeat: PublicSeat): boolean {
  return SEATS.filter((seat) => seat !== changedSeat).every((seat) => sameArray(left.hands[seat].map((card) => card.id), right.hands[seat].map((card) => card.id)) && left.handCounts[seat] === right.handCounts[seat]);
}

function expectedNextSeat(state: IsolatedRolloutState, current: PublicSeat): PublicSeat {
  for (let offset = 1; offset <= SEATS.length; offset += 1) {
    const seat = ((current + 4 - offset) % 4) as PublicSeat;
    if (!state.finishOrder.includes(seat) && state.hands[seat].length > 0) return seat;
  }
  return current;
}

function expectedTrickWinner(state: IsolatedRolloutState, lastPlaySeat: PublicSeat): PublicSeat {
  if (!state.finishOrder.includes(lastPlaySeat)) return lastPlaySeat;
  const partner = ((lastPlaySeat + 2) % 4) as PublicSeat;
  if (!state.finishOrder.includes(partner)) return partner;
  return expectedNextSeat(state, lastPlaySeat);
}

function sameCardIds(left: readonly Card[], right: readonly Card[]): boolean {
  return sameCardIdMultiset(left.map((card) => card.id), right.map((card) => card.id));
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

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function success(): StateConservationResult {
  return Object.freeze({ ok: true as const });
}

function failed(reason: StateConservationFailure["reason"]): StateConservationResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "state-conservation-failed" as const, reason }) });
}
