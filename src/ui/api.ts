import type { Card, GameRank } from "../engine/cards";
import type { CardGroup } from "../engine/groups";
import type { ScoredPlan } from "../engine/scorer";
import { persistPublicRoomSession } from "./session";

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
  humanSeat: Seat;
  humanHand: Card[];
  announcements: string[];
  playerId?: string;
};

type RoomResponse = {
  room: PublicRoom;
  playerId?: string;
};

export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
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

export async function createGameRoom(rank: GameRank, pendingTributeItems: TributeItem[] = []): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>("/api/rooms", { rank, pendingTributeItems });
  const room = normalizePublicRoom(data.room, data.playerId);
  persistPublicRoomSession(room);
  return room;
}

export async function joinGameRoom(roomId: string, name: string, preferredSeat?: Seat): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/join`, { name, preferredSeat });
  const room = normalizePublicRoom(data.room, data.playerId);
  persistPublicRoomSession(room);
  return room;
}

export async function getGameRoom(roomId: string, playerId: string): Promise<PublicRoom> {
  const data = await getJson<RoomResponse>(`/api/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerId)}`);
  const room = normalizePublicRoom(data.room, playerId);
  persistPublicRoomSession(room);
  return room;
}

export async function playRoomCards(roomId: string, playerId: string, cardIds: string[]): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/play`, { playerId, cardIds });
  return normalizePublicRoom(data.room, playerId);
}

export async function passRoomTurn(roomId: string, playerId: string): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/pass`, { playerId });
  return normalizePublicRoom(data.room, playerId);
}

export async function runRoomAi(roomId: string): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/ai`, {});
  return normalizePublicRoom(data.room);
}

export async function runRoomAiStep(roomId: string, playerId: string): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/ai-step`, {});
  return normalizePublicRoom(data.room, playerId);
}

export async function submitOpeningTribute(roomId: string, playerId: string, cardIds: string[] = []): Promise<PublicRoom> {
  const data = await postJson<RoomResponse>(`/api/rooms/${roomId}/tribute`, { playerId, cardIds });
  return normalizePublicRoom(data.room, playerId);
}

function normalizePublicRoom(room: PublicRoom, playerId?: string): PublicRoom {
  const trick = room.trick ?? { leadSeat: room.currentTurn, passSeats: [], plays: [] };

  return {
    ...room,
    playerId: playerId ?? room.playerId,
    currentTrickIndex: typeof room.currentTrickIndex === "number" ? room.currentTrickIndex : 0,
    aiPlans: room.aiPlans ?? {},
    playHistory: Array.isArray(room.playHistory) ? room.playHistory : [],
    replayHands: room.replayHands ?? {
      0: room.humanHand ?? [],
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
    throw await createApiRequestError(response);
  }

  return response.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw await createApiRequestError(response);
  }

  return response.json() as Promise<T>;
}

async function createApiRequestError(response: Response): Promise<ApiRequestError> {
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const payload = await response.json().catch(() => undefined) as { error?: unknown } | undefined;
  const detail = typeof payload?.error === "string" ? `: ${payload.error}` : "";
  return new ApiRequestError(response.status, `API request failed: ${response.status}${statusText}${detail}`);
}
