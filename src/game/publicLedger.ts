import {
  assertFinalizedPublicActionEvent,
  type PublicActionEvent,
  type PublicGameIdentity,
  type PublicSeat,
} from "./publicEvent";
import { sha256Bytes, verifyPublicActionEventHash } from "./publicEventHash";

type HandCounts = Record<PublicSeat, number>;

export type HardPublicLedger = Readonly<{
  schemaVersion: "d2-public-ledger-v1";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  nextEventIndex: number;
  lastAppliedEventIndex: number;
  seenEventHashes: Readonly<Record<number, string>>;
  playedCardIds: readonly string[];
  revealedTransferEvents: readonly Readonly<{
    eventIndex: number;
    kind: "tribute" | "return";
    cardId?: string;
    fromSeat: PublicSeat;
    toSeat: PublicSeat;
  }>[];
  handCounts: Readonly<HandCounts>;
  currentTrick: Readonly<{
    trickIndex: number;
    leadSeat: PublicSeat;
    lastPlaySeat?: PublicSeat;
    lastPlayStableKey?: string;
    passSeats: readonly PublicSeat[];
  }>;
  finishOrder: readonly PublicSeat[];
  publicTributeEvents: readonly string[];
  recentActionSummaries: readonly Readonly<Record<string, string | number | boolean>>[];
}>;

export type ApplyPublicEventErrorCode =
  | "EVENT_INDEX_GAP"
  | "EVENT_INDEX_CONFLICT"
  | "IDENTITY_MISMATCH"
  | "EVENT_HASH_INVALID"
  | "PUBLIC_CARD_DUPLICATE"
  | "HAND_COUNT_INVALID"
  | "FINISH_ORDER_INVALID"
  | "TRICK_STATE_INVALID"
  | "TRIBUTE_ORDER_INVALID"
  | "TRANSFER_DUPLICATE"
  | "EVENT_SCHEMA_INVALID";

export type ApplyPublicEventResult =
  | { ok: true; kind: "applied" | "idempotent"; ledger: HardPublicLedger }
  | { ok: false; error: ApplyPublicEventErrorCode; ledger: HardPublicLedger };

export function createInitialPublicLedger(input: {
  identity: PublicGameIdentity;
  initialHandCounts: Readonly<HandCounts>;
  openingLeader: PublicSeat;
  initialTrickIndex: number;
  openingTributePublicState: Readonly<Record<string, string | number | boolean | null>>;
}): HardPublicLedger {
  const handCounts = copyHandCounts(input.initialHandCounts);
  const ledger: HardPublicLedger = {
    schemaVersion: "d2-public-ledger-v1",
    gameId: input.identity.gameId,
    roundIdentity: input.identity.roundIdentity,
    handIdentity: input.identity.handIdentity,
    nextEventIndex: 0,
    lastAppliedEventIndex: -1,
    seenEventHashes: {},
    playedCardIds: [],
    revealedTransferEvents: [],
    handCounts,
    currentTrick: { trickIndex: input.initialTrickIndex, leadSeat: input.openingLeader, passSeats: [] },
    finishOrder: [],
    publicTributeEvents: [canonicalTributeState(input.openingTributePublicState)],
    recentActionSummaries: [],
  };
  return deepFreeze(ledger);
}

export function resetPublicLedger(input: Parameters<typeof createInitialPublicLedger>[0]): HardPublicLedger {
  return createInitialPublicLedger(input);
}

export function applyPublicEvent(ledger: HardPublicLedger, event: PublicActionEvent): ApplyPublicEventResult {
  try {
    assertFinalizedPublicActionEvent(event);
    verifyPublicActionEventHash(event);
  } catch (error) {
    const code = error instanceof Error && error.message === "EVENT_HASH_INVALID" ? "EVENT_HASH_INVALID" : "EVENT_SCHEMA_INVALID";
    return { ok: false, error: code, ledger };
  }
  if (event.gameId !== ledger.gameId || event.roundIdentity !== ledger.roundIdentity || event.handIdentity !== ledger.handIdentity) return fail(ledger, "IDENTITY_MISMATCH");
  if (event.eventIndex < ledger.nextEventIndex) {
    return ledger.seenEventHashes[event.eventIndex] === event.publicPayloadHash
      ? { ok: true, kind: "idempotent", ledger }
      : fail(ledger, "EVENT_INDEX_CONFLICT");
  }
  if (event.eventIndex > ledger.nextEventIndex) return fail(ledger, "EVENT_INDEX_GAP");

  const next = mutableLedgerCopy(ledger);
  const error = applyKind(next, event);
  if (error) return fail(ledger, error);
  next.seenEventHashes[event.eventIndex] = event.publicPayloadHash;
  next.lastAppliedEventIndex = event.eventIndex;
  next.nextEventIndex = event.eventIndex + 1;
  next.recentActionSummaries = [...next.recentActionSummaries, summarize(event)].slice(-16);
  return { ok: true, kind: "applied", ledger: deepFreeze(next) };
}

export function canonicalPublicLedgerHash(ledger: HardPublicLedger): string {
  const canonical = {
    schemaVersion: ledger.schemaVersion,
    gameId: ledger.gameId,
    roundIdentity: ledger.roundIdentity,
    handIdentity: ledger.handIdentity,
    nextEventIndex: ledger.nextEventIndex,
    lastAppliedEventIndex: ledger.lastAppliedEventIndex,
    seenEventHashes: { ...ledger.seenEventHashes },
    playedCardIds: [...ledger.playedCardIds],
    revealedTransferEvents: ledger.revealedTransferEvents.map((event) => ({ ...event })),
    handCounts: { 0: ledger.handCounts[0], 1: ledger.handCounts[1], 2: ledger.handCounts[2], 3: ledger.handCounts[3] },
    currentTrick: {
      trickIndex: ledger.currentTrick.trickIndex,
      leadSeat: ledger.currentTrick.leadSeat,
      lastPlaySeat: ledger.currentTrick.lastPlaySeat,
      lastPlayStableKey: ledger.currentTrick.lastPlayStableKey,
      passSeats: [...ledger.currentTrick.passSeats],
    },
    finishOrder: [...ledger.finishOrder],
    publicTributeEvents: [...ledger.publicTributeEvents],
    recentActionSummaries: ledger.recentActionSummaries.map((summary) => ({ ...summary })),
  };
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(canonical)));
}

type MutableLedger = {
  -readonly [K in keyof HardPublicLedger]: HardPublicLedger[K] extends readonly (infer U)[] ? U[] : HardPublicLedger[K] extends object ? any : HardPublicLedger[K]
};

function mutableLedgerCopy(ledger: HardPublicLedger): MutableLedger {
  return {
    ...ledger,
    seenEventHashes: { ...ledger.seenEventHashes },
    playedCardIds: [...ledger.playedCardIds],
    revealedTransferEvents: ledger.revealedTransferEvents.map((event) => ({ ...event })),
    handCounts: copyHandCounts(ledger.handCounts),
    currentTrick: { ...ledger.currentTrick, passSeats: [...ledger.currentTrick.passSeats] },
    finishOrder: [...ledger.finishOrder],
    publicTributeEvents: [...ledger.publicTributeEvents],
    recentActionSummaries: ledger.recentActionSummaries.map((summary) => ({ ...summary })),
  } as MutableLedger;
}

function applyKind(ledger: MutableLedger, event: PublicActionEvent): ApplyPublicEventErrorCode | undefined {
  const current = ledger.currentTrick as { trickIndex: number; leadSeat: PublicSeat; lastPlaySeat?: PublicSeat; lastPlayStableKey?: string; passSeats: PublicSeat[] };
  if (event.kind === "play") {
    if (event.trickIndex !== current.trickIndex || event.publicCardIds.some((id) => ledger.playedCardIds.includes(id))) return event.trickIndex !== current.trickIndex ? "TRICK_STATE_INVALID" : "PUBLIC_CARD_DUPLICATE";
    if (ledger.handCounts[event.seat] !== event.handCountBefore || event.handCountAfter !== event.handCountBefore - event.publicCardIds.length || event.handCountAfter < 0) return "HAND_COUNT_INVALID";
    ledger.handCounts[event.seat] = event.handCountAfter;
    ledger.playedCardIds.push(...event.publicCardIds);
    current.lastPlaySeat = event.seat;
    current.lastPlayStableKey = event.publicStableKey;
    current.passSeats = [];
    return undefined;
  }
  if (event.kind === "pass") {
    if (event.trickIndex !== current.trickIndex || current.lastPlaySeat === undefined || current.passSeats.includes(event.seat)) return "TRICK_STATE_INVALID";
    if (ledger.handCounts[event.seat] !== event.handCountBefore || event.handCountAfter !== event.handCountBefore) return "HAND_COUNT_INVALID";
    current.passSeats.push(event.seat);
    return undefined;
  }
  if (event.kind === "trick-clear") {
    if (event.trickIndex !== current.trickIndex || current.lastPlaySeat === undefined || event.leadSeat === undefined) return "TRICK_STATE_INVALID";
    current.trickIndex += 1;
    current.leadSeat = event.leadSeat;
    delete current.lastPlaySeat;
    delete current.lastPlayStableKey;
    current.passSeats = [];
    return undefined;
  }
  if (event.kind === "finish") {
    if (event.finishPosition !== ledger.finishOrder.length + 1 || ledger.finishOrder.includes(event.seat)) return "FINISH_ORDER_INVALID";
    if (event.finishReason === "hand-empty" && event.remainingHandCount !== 0) return "FINISH_ORDER_INVALID";
    ledger.finishOrder.push(event.seat);
    return undefined;
  }
  if (event.kind === "tribute" || event.kind === "return") {
    const changes = event.handCountChanges;
    if (Object.values(changes).reduce((sum, value) => sum + value, 0) !== 0) return "HAND_COUNT_INVALID";
    const cardId = event.publicCardIds[0];
    const duplicate = ledger.revealedTransferEvents.some((transfer) => transfer.kind === event.kind && transfer.fromSeat === event.fromSeat && transfer.toSeat === event.toSeat && transfer.cardId === cardId);
    if (duplicate) return "TRANSFER_DUPLICATE";
    for (const seat of [0, 1, 2, 3] as const) {
      const nextCount = ledger.handCounts[seat] + changes[seat];
      if (nextCount < 0) return "HAND_COUNT_INVALID";
      ledger.handCounts[seat] = nextCount;
    }
    ledger.revealedTransferEvents.push({ eventIndex: event.eventIndex, kind: event.kind, cardId, fromSeat: event.fromSeat, toSeat: event.toSeat });
    return undefined;
  }
  if (event.kind === "anti-tribute") {
    ledger.publicTributeEvents.push(event.publicStableKey);
    return undefined;
  }
  return "EVENT_SCHEMA_INVALID";
}

function fail(ledger: HardPublicLedger, error: ApplyPublicEventErrorCode): ApplyPublicEventResult {
  return { ok: false, error, ledger };
}

function summarize(event: PublicActionEvent): Readonly<Record<string, string | number | boolean>> {
  return { eventIndex: event.eventIndex, kind: event.kind, seat: event.seat, trickIndex: event.trickIndex, publicStableKey: event.publicStableKey };
}

function copyHandCounts(input: Readonly<HandCounts>): HandCounts {
  return { 0: input[0], 1: input[1], 2: input[2], 3: input[3] };
}

function canonicalTributeState(state: Readonly<Record<string, string | number | boolean | null>>): string {
  return Object.keys(state).sort().map((key) => `${key}=${String(state[key])}`).join(";");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
