import { RANKS } from "../engine/cards";
import type { Card, GameRank } from "../engine/cards";
import type { CardGroup } from "../engine/groups";
import type { ScoredPlan } from "../engine/scorer";

const API_BASE_URL = "";

export type DealResponse = {
  hand: Card[];
};

export type PlansResponse = {
  plans: ScoredPlan[];
};

export type Seat = 0 | 1 | 2 | 3;

export type PublicPlayer = {
  seat: Seat;
  name: string;
  isAI: boolean;
  handCount: number;
  team: 0 | 1;
};

export type TrickPlay = {
  seat: Seat;
  action: "play" | "pass";
  group?: CardGroup;
  trickIndex?: number;
};

export type AiPlanState = {
  seat: Seat;
  name: string;
  score: number;
  groups: CardGroup[];
};

export type TributeItem = {
  payer: Seat;
  receiver: Seat;
};

export type TributeExchange = TributeItem & {
  tributeCard: Card;
  returnCard: Card;
};

export type TributeState = {
  status: "none" | "pending" | "anti-tribute" | "completed";
  items: TributeItem[];
  exchanges?: TributeExchange[];
  phase?: "tribute" | "return" | "done";
  activeItemIndex?: number;
  activeSeat?: Seat;
  activeCard?: Card;
  reason?: string;
};

export type PublicRoom = {
  id: string;
  rank: GameRank;
  players: PublicPlayer[];
  currentTurn: Seat;
  leaderSeat: Seat;
  currentTrickIndex: number;
  trick: {
    leadSeat: Seat;
    lastPlay?: CardGroup;
    lastPlaySeat?: Seat;
    passSeats: Seat[];
    plays: TrickPlay[];
  };
  finishOrder: Seat[];
  aiPlans: Partial<Record<Seat, AiPlanState>>;
  playHistory: TrickPlay[];
  replayHands: Record<Seat, Card[]>;
  settlement?: {
    winningTeam: 0 | 1;
    outcome: "double-down" | "single-down" | "single-win";
    levelStep: number;
    currentRank: GameRank;
    nextRank: GameRank;
    tribute: TributeState;
  };
  openingTribute?: TributeState;
  status: "playing" | "finished";
  actionLog: string[];
  humanSeat: 0;
  humanHand: Card[];
  announcements: string[];
};

type RoomResponse = {
  room: PublicRoom;
};

export type CreateRoomIntent = Readonly<{
  idempotencyKey: string;
  rank: GameRank;
  seed: number;
  pendingTributeItems: ReadonlyArray<Readonly<TributeItem>>;
  requestBodyJson: string;
}>;

export type CreateRoomHttpClassification = "definite-failure" | "uncertain";

export class CreateRoomHttpError extends Error {
  readonly kind = "http" as const;
  readonly status: number;
  readonly statusText: string;
  readonly serverError?: string;
  readonly classification: CreateRoomHttpClassification;

  constructor(input: {
    status: number;
    statusText: string;
    serverError?: string;
    classification: CreateRoomHttpClassification;
  }) {
    super(`Create room request failed: ${input.status}${input.statusText ? ` ${input.statusText}` : ""}`);
    this.name = "CreateRoomHttpError";
    this.status = input.status;
    this.statusText = input.statusText;
    this.serverError = input.serverError;
    this.classification = input.classification;
  }
}

export class CreateRoomUncertainError extends Error {
  readonly kind = "uncertain" as const;
  readonly source: "fetch" | "response";
  readonly cause: unknown;

  constructor(input: { source: "fetch" | "response"; cause: unknown }) {
    super("Create room result is uncertain.");
    this.name = "CreateRoomUncertainError";
    this.source = input.source;
    this.cause = input.cause;
  }
}

export class CreateRoomLocalError extends Error {
  readonly kind = "local" as const;
  readonly source: "crypto" | "descriptor" | "serialization";
  readonly cause?: unknown;

  constructor(input: {
    source: "crypto" | "descriptor" | "serialization";
    cause?: unknown;
  }) {
    super(`Unable to prepare create room request (${input.source}).`);
    this.name = "CreateRoomLocalError";
    this.source = input.source;
    this.cause = input.cause;
  }
}

export function isCreateRoomHttpError(error: unknown): error is CreateRoomHttpError {
  return error instanceof CreateRoomHttpError;
}

export function isCreateRoomUncertainError(error: unknown): error is CreateRoomUncertainError {
  return error instanceof CreateRoomUncertainError;
}

export function isCreateRoomLocalError(error: unknown): error is CreateRoomLocalError {
  return error instanceof CreateRoomLocalError;
}

export type RetryableCreateRoomError = CreateRoomUncertainError | (CreateRoomHttpError & { readonly classification: "uncertain" });

export function isRetryableCreateRoomError(error: unknown): error is RetryableCreateRoomError {
  return isCreateRoomUncertainError(error) || (isCreateRoomHttpError(error) && error.classification === "uncertain");
}

export function createRoomIntent(rank: GameRank, pendingTributeItems: readonly TributeItem[] = []): CreateRoomIntent {
  const idempotencyKey = generateIdempotencyKey();
  const seed = generateSeed();

  let frozenItems: ReadonlyArray<Readonly<TributeItem>>;
  try {
    if (!RANKS.includes(rank)) throw new Error("invalid rank");
    if (!Array.isArray(pendingTributeItems)) throw new Error("tribute items must be an array");
    frozenItems = Object.freeze(pendingTributeItems.map((item) => {
      if (!isTributeItem(item)) throw new Error("invalid tribute item");
      return Object.freeze({ payer: item.payer, receiver: item.receiver });
    }));
  } catch (cause) {
    throw new CreateRoomLocalError({ source: "descriptor", cause });
  }

  let requestBodyJson: string;
  try {
    requestBodyJson = JSON.stringify({ rank, seed, pendingTributeItems: frozenItems });
    if (typeof requestBodyJson !== "string") throw new Error("serialization returned no string");
  } catch (cause) {
    throw new CreateRoomLocalError({ source: "serialization", cause });
  }

  return Object.freeze({ idempotencyKey, rank, seed, pendingTributeItems: frozenItems, requestBodyJson });
}

export function createGameRoom(intent: CreateRoomIntent): Promise<PublicRoom>;
export function createGameRoom(rank: GameRank, pendingTributeItems?: TributeItem[]): Promise<PublicRoom>;
export async function createGameRoom(intentOrRank: CreateRoomIntent | GameRank, pendingTributeItems: TributeItem[] = []): Promise<PublicRoom> {
  const intent = typeof intentOrRank === "string" ? createRoomIntent(intentOrRank, pendingTributeItems) : intentOrRank;
  const data = await postCreateRoom(intent);
  return normalizePublicRoom(data.room);
}

export async function postCreateRoom(intent: CreateRoomIntent): Promise<RoomResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": intent.idempotencyKey },
      body: intent.requestBodyJson,
    });
  } catch (cause) {
    throw new CreateRoomUncertainError({ source: "fetch", cause });
  }

  if (response.status < 200 || response.status >= 300) {
    const payload = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
    const serverError = typeof payload?.error === "string" ? payload.error : undefined;
    const classification = response.status === 408 || response.status === 429 || response.status >= 500 ? "uncertain" : "definite-failure";
    throw new CreateRoomHttpError({ status: response.status, statusText: response.statusText ?? "", serverError, classification });
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    throw new CreateRoomUncertainError({ source: "response", cause });
  }
  if (!isRoomResponse(data)) {
    throw new CreateRoomUncertainError({ source: "response", cause: new Error("Invalid /api/rooms response.") });
  }
  return data;
}

function generateIdempotencyKey(): string {
  try {
    const key = globalThis.crypto?.randomUUID?.();
    if (typeof key !== "string" || key.length < 1 || key.length > 128 || !/^[A-Za-z0-9._~:-]+$/.test(key)) {
      throw new Error("invalid idempotency key");
    }
    return key;
  } catch (cause) {
    throw new CreateRoomLocalError({ source: "crypto", cause });
  }
}

function generateSeed(): number {
  try {
    if (!globalThis.crypto?.getRandomValues) throw new Error("crypto unavailable");
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    const seed = values[0];
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error("invalid seed");
    return seed;
  } catch (cause) {
    throw new CreateRoomLocalError({ source: "crypto", cause });
  }
}

function isTributeItem(value: unknown): value is TributeItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TributeItem>;
  return Number.isInteger(item.payer) && Number.isInteger(item.receiver)
    && item.payer! >= 0 && item.payer! <= 3 && item.receiver! >= 0 && item.receiver! <= 3;
}

function isRoomResponse(value: unknown): value is RoomResponse {
  return isRecord(value) && isPublicRoom((value as { room?: unknown }).room);
}

function isPublicRoom(value: unknown): value is PublicRoom {
  if (!isRecord(value)) return false;
  if (containsForbiddenPublicRoomKey(value)) return false;
  const room = value as Partial<PublicRoom>;
  return typeof room.id === "string" && room.id.length > 0
    && typeof room.rank === "string" && (RANKS as readonly string[]).includes(room.rank)
    && Array.isArray(room.players) && room.players.length === 4 && room.players.every(isPublicPlayer)
    && isSeat(room.currentTurn) && isSeat(room.leaderSeat)
    && (room.currentTrickIndex === undefined || (typeof room.currentTrickIndex === "number" && Number.isInteger(room.currentTrickIndex) && room.currentTrickIndex >= 0))
    && (room.trick === undefined || isPublicTrick(room.trick))
    && Array.isArray(room.finishOrder) && room.finishOrder.every(isSeat)
    && (room.aiPlans === undefined || isRecord(room.aiPlans))
    && (room.playHistory === undefined || (Array.isArray(room.playHistory) && room.playHistory.every(isTrickPlay)))
    && (room.replayHands === undefined || isSeatRecordOfArrays(room.replayHands))
    && (room.status === "playing" || room.status === "finished")
    && Array.isArray(room.actionLog) && room.actionLog.every((entry) => typeof entry === "string")
    && room.humanSeat === 0
    && Array.isArray(room.humanHand)
    && Array.isArray(room.announcements) && room.announcements.every((entry) => typeof entry === "string");
}

const FORBIDDEN_PUBLIC_ROOM_KEYS = new Set([
  "idempotencyKey",
  "publicIdentity",
  "publicLedger",
  "publicEvents",
  "identity",
  "gameSequence",
  "gameId",
  "descriptorHash",
  "sessionIdentity",
]);

function containsForbiddenPublicRoomKey(value: unknown, visited = new Set<object>()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (visited.has(value)) return false;
  visited.add(value);

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") continue;
    if (FORBIDDEN_PUBLIC_ROOM_KEYS.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor && containsForbiddenPublicRoomKey(descriptor.value, visited)) return true;
  }

  return false;
}

function isPublicTrick(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const trick = value as Partial<PublicRoom["trick"]>;
  return isSeat(trick.leadSeat)
    && (trick.passSeats === undefined || (Array.isArray(trick.passSeats) && trick.passSeats.every(isSeat)))
    && (trick.plays === undefined || (Array.isArray(trick.plays) && trick.plays.every(isTrickPlay)));
}

function isPublicPlayer(value: unknown): value is PublicPlayer {
  if (!isRecord(value)) return false;
  const player = value as Partial<PublicPlayer>;
  return isSeat(player.seat)
    && typeof player.name === "string"
    && typeof player.isAI === "boolean"
    && typeof player.handCount === "number" && Number.isInteger(player.handCount) && player.handCount >= 0
    && (player.team === 0 || player.team === 1);
}

function isTrickPlay(value: unknown): value is TrickPlay {
  if (!isRecord(value)) return false;
  const play = value as Partial<TrickPlay>;
  return isSeat(play.seat)
    && (play.action === "play" || play.action === "pass")
    && (play.trickIndex === undefined || (Number.isInteger(play.trickIndex) && play.trickIndex >= 0));
}

function isSeat(value: unknown): value is Seat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isSeatRecordOfArrays(value: unknown): value is Record<Seat, unknown[]> {
  return isRecord(value) && [0, 1, 2, 3].every((seat) => Array.isArray(value[String(seat)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function dealHand(rank: GameRank): Promise<Card[]> {
  const data = await postJson<DealResponse>("/api/deal", { rank });

  if (!Array.isArray(data.hand)) {
    throw new Error("Expected /api/deal response hand to be an array.");
  }

  return data.hand;
}

export async function generatePlans(cards: Card[], rank: GameRank, count = 5): Promise<ScoredPlan[]> {
  const data = await postJson<PlansResponse>("/api/plans", { cards, rank, count });

  if (!Array.isArray(data.plans)) {
    throw new Error("Expected /api/plans response plans to be an array.");
  }

  return data.plans;
}

export async function playRoomCards(roomId: string, cardIds: string[]): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/play`, { seat: 0, cardIds });
  return normalizePublicRoom(data.room);
}

export async function passRoomTurn(roomId: string): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/pass`, { seat: 0 });
  return normalizePublicRoom(data.room);
}

export async function runRoomAi(roomId: string): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/ai`, {});
  return normalizePublicRoom(data.room);
}

export async function runRoomAiStep(roomId: string): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/ai-step`, {});
  return normalizePublicRoom(data.room);
}

export async function submitOpeningTribute(roomId: string, seat?: Seat, cardIds: string[] = []): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/tribute`, { seat, cardIds });
  return normalizePublicRoom(data.room);
}

function normalizePublicRoom(room: PublicRoom): PublicRoom {
  const safeRoom: PublicRoom = {
    id: room.id,
    rank: room.rank,
    players: room.players,
    currentTurn: room.currentTurn,
    leaderSeat: room.leaderSeat,
    currentTrickIndex: room.currentTrickIndex,
    trick: room.trick,
    finishOrder: room.finishOrder,
    aiPlans: room.aiPlans,
    playHistory: room.playHistory,
    replayHands: room.replayHands,
    status: room.status,
    actionLog: room.actionLog,
    humanSeat: room.humanSeat,
    humanHand: room.humanHand,
    announcements: room.announcements,
    ...(room.settlement === undefined ? {} : { settlement: room.settlement }),
    ...(room.openingTribute === undefined ? {} : { openingTribute: room.openingTribute }),
  };
  const trick = room.trick ?? { leadSeat: room.currentTurn, passSeats: [], plays: [] };

  return {
    ...safeRoom,
    currentTrickIndex: typeof safeRoom.currentTrickIndex === "number" ? safeRoom.currentTrickIndex : 0,
    aiPlans: safeRoom.aiPlans ?? {},
    playHistory: Array.isArray(safeRoom.playHistory) ? safeRoom.playHistory : [],
    replayHands: safeRoom.replayHands ?? {
      0: safeRoom.humanHand ?? [],
      1: [],
      2: [],
      3: [],
    },
    trick: {
      ...trick,
      passSeats: Array.isArray(trick.passSeats) ? trick.passSeats : [],
      plays: Array.isArray(trick.plays) ? trick.plays : [],
    },
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    const payload = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
    const detail = typeof payload?.error === "string" ? `: ${payload.error}` : "";
    throw new Error(`API request failed: ${response.status}${statusText}${detail}`);
  }

  return response.json() as Promise<T>;
}
