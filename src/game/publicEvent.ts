export type PublicSeat = 0 | 1 | 2 | 3;

export type PublicGameIdentity = Readonly<{
  schemaVersion: "d2-public-game-identity-v1";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  roundSequence: number;
  handSequence: number;
  source: "production-session" | "benchmark-scenario" | "replay";
}>;

export function buildPublicGameIdentity(
  gameId: string,
  roundSequence: number,
  handSequence: number,
  source: PublicGameIdentity["source"],
): PublicGameIdentity {
  if (typeof gameId !== "string" || gameId.length === 0) throw new Error("IDENTITY_INVALID");
  if (!isNonNegativeInteger(roundSequence) || !isNonNegativeInteger(handSequence)) {
    throw new Error("IDENTITY_SEQUENCE_INVALID");
  }
  const roundIdentity = `${gameId}:round:${roundSequence}`;
  const handIdentity = `${roundIdentity}:hand:${handSequence}`;
  return Object.freeze({
    schemaVersion: "d2-public-game-identity-v1",
    gameId,
    roundIdentity,
    handIdentity,
    roundSequence,
    handSequence,
    source,
  });
}

export type PublicActionEventBase = Readonly<{
  schemaVersion: "d2-public-event-v2";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  eventIndex: number;
  kind: "play" | "pass" | "trick-clear" | "finish" | "tribute" | "return" | "anti-tribute";
  seat: PublicSeat;
  publicStableKey: string;
  patternType?: string;
  groupType?: string;
  handCountBefore?: number;
  handCountAfter?: number;
  leadSeat?: PublicSeat;
  lastPlaySeat?: PublicSeat;
  usedWildcardCount?: number;
  usedBomb?: boolean;
  trickIndex: number;
  publicPayloadHash: string;
}>;

export type PublicPlayEvent = PublicActionEventBase & Readonly<{
  kind: "play";
  publicCardIds: readonly string[];
  patternType: string;
  groupType: string;
  handCountBefore: number;
  handCountAfter: number;
  publicStableKey: `play:${string}`;
}>;

export type PublicPassEvent = PublicActionEventBase & Readonly<{
  kind: "pass";
  publicCardIds?: never;
  patternType?: never;
  groupType?: never;
  handCountBefore: number;
  handCountAfter: number;
  publicStableKey: "pass:v2";
}>;

export type PublicTrickClearEvent = PublicActionEventBase & Readonly<{
  kind: "trick-clear";
  publicCardIds?: never;
  handCountBefore?: never;
  handCountAfter?: never;
  publicStableKey: `trick-clear:${number}:${number}`;
  leadSeat: PublicSeat;
}>;

export type PublicFinishEvent = PublicActionEventBase & Readonly<{
  kind: "finish";
  publicCardIds?: never;
  handCountBefore?: never;
  handCountAfter?: never;
  finishPosition: number;
  remainingHandCount: number;
  finishReason: "hand-empty" | "round-settlement";
  publicStableKey: `finish:${number}:${"hand-empty" | "round-settlement"}`;
}>;

export type PublicTributeEvent = PublicActionEventBase & Readonly<{
  kind: "tribute" | "return";
  publicCardIds: readonly [string] | readonly [];
  fromSeat: PublicSeat;
  toSeat: PublicSeat;
  handCountChanges: Readonly<Record<PublicSeat, number>>;
  publicStableKey: `tribute:${string}` | `return:${string}`;
}>;

export type PublicAntiTributeEvent = PublicActionEventBase & Readonly<{
  kind: "anti-tribute";
  publicCardIds?: never;
  handCountBefore?: never;
  handCountAfter?: never;
  reasonCode: "anti-tribute";
  publicStableKey: `anti-tribute:${string}`;
}>;

export type PublicActionEvent =
  | PublicPlayEvent
  | PublicPassEvent
  | PublicTrickClearEvent
  | PublicFinishEvent
  | PublicTributeEvent
  | PublicAntiTributeEvent;

type RemovePayloadHash<T> = T extends unknown ? Omit<T, "publicPayloadHash"> : never;
export type PublicActionEventDraft = RemovePayloadHash<PublicActionEvent>;

export function assertPublicActionEventDraft(value: unknown): asserts value is PublicActionEventDraft {
  const event = asRecord(value);
  if ("publicPayloadHash" in event) throw new Error("EVENT_SCHEMA_INVALID");
  assertCommon(event);
  switch (event.kind) {
    case "play":
      assertPlayDraft(event);
      return;
    case "pass":
      if (hasAny(event, "publicCardIds", "patternType", "groupType") || event.publicStableKey !== "pass:v2") {
        throw new Error("EVENT_SCHEMA_INVALID");
      }
      assertCountPair(event);
      return;
    case "trick-clear":
      if (hasAny(event, "publicCardIds", "handCountBefore", "handCountAfter") || !isSeat(event.leadSeat) || !/^trick-clear:\d+:\d+$/.test(String(event.publicStableKey))) {
        throw new Error("EVENT_SCHEMA_INVALID");
      }
      return;
    case "finish":
      if (hasAny(event, "publicCardIds", "handCountBefore", "handCountAfter") || !isNonNegativeInteger(event.finishPosition) || !isNonNegativeInteger(event.remainingHandCount) || !["hand-empty", "round-settlement"].includes(String(event.finishReason))) {
        throw new Error("EVENT_SCHEMA_INVALID");
      }
      return;
    case "tribute":
    case "return":
      assertTransferDraft(event);
      return;
    case "anti-tribute":
      if (hasAny(event, "publicCardIds", "handCountBefore", "handCountAfter", "fromSeat", "toSeat", "handCountChanges") || event.reasonCode !== "anti-tribute" || !String(event.publicStableKey).startsWith("anti-tribute:")) {
        throw new Error("EVENT_SCHEMA_INVALID");
      }
      return;
    default:
      throw new Error("EVENT_SCHEMA_INVALID");
  }
}

export function assertFinalizedPublicActionEvent(value: unknown): asserts value is PublicActionEvent {
  const event = asRecord(value);
  if (typeof event.publicPayloadHash !== "string" || !/^[a-f0-9]{64}$/.test(event.publicPayloadHash)) {
    throw new Error("EVENT_HASH_MISSING");
  }
  const draft = { ...event } as Record<string, unknown>;
  delete draft.publicPayloadHash;
  assertPublicActionEventDraft(draft);
}

export function playPublicStableKey(cardIds: readonly string[]): `play:${string}` {
  return `play:${[...cardIds].sort().join(",")}`;
}

export function passPublicStableKey(): "pass:v2" {
  return "pass:v2";
}

export function trickClearPublicStableKey(previousTrickIndex: number, nextTrickIndex: number): `trick-clear:${number}:${number}` {
  return `trick-clear:${previousTrickIndex}:${nextTrickIndex}`;
}

export function finishPublicStableKey(position: number, reason: PublicFinishEvent["finishReason"]): `finish:${number}:${"hand-empty" | "round-settlement"}` {
  return `finish:${position}:${reason}`;
}

export function tributePublicStableKey(kind: "tribute" | "return", fromSeat: PublicSeat, toSeat: PublicSeat, cardId?: string): `${"tribute" | "return"}:${string}` {
  return `${kind}:${fromSeat}:${toSeat}:${cardId ?? "hidden"}`;
}

export function antiTributePublicStableKey(reasonCode: string): `anti-tribute:${string}` {
  return `anti-tribute:${reasonCode}`;
}

function assertCommon(event: Record<string, unknown>): void {
  if (event.schemaVersion !== "d2-public-event-v2" || typeof event.gameId !== "string" || event.gameId.length === 0 || typeof event.roundIdentity !== "string" || typeof event.handIdentity !== "string" || !isNonNegativeInteger(event.eventIndex) || !isSeat(event.seat) || !isNonNegativeInteger(event.trickIndex) || typeof event.publicStableKey !== "string" || typeof event.kind !== "string") {
    throw new Error("EVENT_SCHEMA_INVALID");
  }
}

function assertPlayDraft(event: Record<string, unknown>): void {
  if (!Array.isArray(event.publicCardIds) || event.publicCardIds.length === 0 || event.publicCardIds.some((id) => typeof id !== "string") || typeof event.patternType !== "string" || typeof event.groupType !== "string" || !isNonNegativeInteger(event.handCountBefore) || !isNonNegativeInteger(event.handCountAfter) || event.handCountAfter !== event.handCountBefore! - event.publicCardIds.length || !String(event.publicStableKey).startsWith("play:")) {
    throw new Error("EVENT_SCHEMA_INVALID");
  }
}

function assertCountPair(event: Record<string, unknown>): void {
  if (!isNonNegativeInteger(event.handCountBefore) || !isNonNegativeInteger(event.handCountAfter) || event.handCountBefore !== event.handCountAfter) throw new Error("EVENT_SCHEMA_INVALID");
}

function assertTransferDraft(event: Record<string, unknown>): void {
  if (!Array.isArray(event.publicCardIds) || event.publicCardIds.length > 1 || event.publicCardIds.some((id) => typeof id !== "string") || !isSeat(event.fromSeat) || !isSeat(event.toSeat) || !isRecord(event.handCountChanges) || !String(event.publicStableKey).startsWith(`${event.kind}:`)) {
    throw new Error("EVENT_SCHEMA_INVALID");
  }
  const changes = event.handCountChanges;
  for (const seat of [0, 1, 2, 3] as const) if (!Number.isInteger(changes[seat]) || !Number.isFinite(changes[seat])) throw new Error("EVENT_SCHEMA_INVALID");
}

function asRecord(value: unknown): Record<string, any> {
  if (!isRecord(value)) throw new Error("EVENT_SCHEMA_INVALID");
  return value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAny(value: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.some((key) => key in value && value[key] !== undefined);
}

function isSeat(value: unknown): value is PublicSeat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
