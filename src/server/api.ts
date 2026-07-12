import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { createDeck, RANKS, SUITS, type Card, type GameRank, type JokerRank, type Rank } from "../engine/cards";
import { generatePlans } from "../engine/planner";
import { scorePlans } from "../engine/scorer";
import { dealHand, validateHand } from "../engine/validation";
import { advanceOpeningTribute, createRoom, getPublicRoom, passTurn, playCards, runAiStep, runAiUntilHumanTurn, type RoomState, type Seat } from "../game/room";
import type { TributeItem } from "../game/settlement";

type DealBody = {
  rank?: unknown;
  seed?: number;
};

type CardsBody = {
  cards?: unknown;
};

type PlansBody = CardsBody & {
  rank?: unknown;
  count?: number;
};

type CreateRoomBody = {
  rank?: unknown;
  seed?: number;
  pendingTributeItems?: unknown;
};

type JoinRoomBody = {
  name?: unknown;
  preferredSeat?: unknown;
};

type RoomQuery = {
  playerId?: string;
};

type PlayBody = {
  seat?: unknown;
  cardIds?: unknown;
};

type SeatBody = {
  seat?: unknown;
};

const DEFAULT_RANK: GameRank = "10";
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);
const REQUIRED_CARDS_ERROR = { valid: false, errors: ["Cards are required."], warnings: [] };
const INVALID_COUNT_ERROR = { valid: false, errors: ["Count must be an integer from 3 to 5."], warnings: [] };
const INVALID_SEED_ERROR = { valid: false, errors: ["Seed must be a finite integer."], warnings: [] };
const JOKER_RANKS = new Set<JokerRank>(["SJ", "BJ"]);
const VALID_RANKS = new Set<Rank>(RANKS);
const VALID_SUITS = new Set(SUITS);
const CANONICAL_CARDS_BY_ID = new Map(createDeck().map((card) => [card.id, card]));

export type PlayerSession = {
  playerId: string;
  name: string;
  seat: Seat;
  connected: boolean;
};

export type OnlineRoom = {
  room: RoomState;
  sessions: Map<string, PlayerSession>;
};

export function buildApi() {
  const app = Fastify({ logger: false });
  const onlineRooms = new Map<string, OnlineRoom>();

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const requestOrigin = Array.isArray(origin) ? origin[0] : origin;

    if (requestOrigin !== undefined && isAllowedOrigin(requestOrigin)) {
      reply.header("Access-Control-Allow-Origin", requestOrigin);
    }

    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });

  app.options("/*", async (_request, reply) => reply.code(204).send());

  app.post<{ Body: DealBody }>("/api/deal", async (request, reply) => {
    const { rank = DEFAULT_RANK, seed } = request.body ?? {};
    const invalidRank = validateGameRank(rank);

    if (invalidRank !== undefined) {
      return reply.code(400).send(invalidRank);
    }

    if (!isValidOptionalInteger(seed)) {
      return reply.code(400).send(INVALID_SEED_ERROR);
    }

    return { hand: dealHand(rank as GameRank, seed) };
  });

  app.post<{ Body: CardsBody }>("/api/validate-hand", async (request, reply) => {
    const cards = request.body?.cards;

    if (cards === undefined) {
      return reply.code(400).send(REQUIRED_CARDS_ERROR);
    }

    const malformed = validateCardsShape(cards);

    if (malformed !== undefined) {
      return reply.code(400).send(malformed);
    }

    const validCards = cards as Card[];
    const validation = validateHand(validCards);

    if (!validation.valid) {
      return reply.code(400).send(validation);
    }

    return validation;
  });

  app.post<{ Body: PlansBody }>("/api/plans", async (request, reply) => {
    const { rank = DEFAULT_RANK, cards, count } = request.body ?? {};
    const invalidRank = validateGameRank(rank);

    if (invalidRank !== undefined) {
      return reply.code(400).send(invalidRank);
    }

    if (!isValidOptionalPlanCount(count)) {
      return reply.code(400).send(INVALID_COUNT_ERROR);
    }

    if (cards === undefined) {
      return reply.code(400).send(REQUIRED_CARDS_ERROR);
    }

    const malformed = validateCardsShape(cards);

    if (malformed !== undefined) {
      return reply.code(400).send(malformed);
    }

    const validCards = cards as Card[];
    const validation = validatePlanningCards(validCards);

    if (!validation.valid) {
      return reply.code(400).send(validation);
    }

    const gameRank = rank as GameRank;
    return { plans: scorePlans(generatePlans(validCards, gameRank, count), gameRank) };
  });

  app.post<{ Body: CreateRoomBody }>("/api/rooms", async (request, reply) => {
    const { rank = DEFAULT_RANK, seed, pendingTributeItems } = request.body ?? {};
    const invalidRank = validateGameRank(rank);

    if (invalidRank !== undefined) {
      return reply.code(400).send(invalidRank);
    }

    if (!isValidOptionalInteger(seed)) {
      return reply.code(400).send(INVALID_SEED_ERROR);
    }

    if (!isValidOptionalTributeItems(pendingTributeItems)) {
      return reply.code(400).send({ valid: false, errors: ["pendingTributeItems must be valid seat pairs."], warnings: [] });
    }

    const room = createRoom({ rank: rank as GameRank, seed, pendingTributeItems });
    const session = createPlayerSession(room.players[0].name, 0);
    onlineRooms.set(room.id, { room, sessions: new Map([[session.playerId, session]]) });
    return {
      playerId: session.playerId,
      seat: session.seat,
      room: getPublicRoom(room, session.seat, { ensurePlans: false }),
    };
  });

  app.post<{ Params: { id: string }; Body: JoinRoomBody }>("/api/rooms/:id/join", async (request, reply) => {
    const onlineRoom = onlineRooms.get(request.params.id);
    if (onlineRoom === undefined) {
      return reply.code(404).send({ error: "Room not found." });
    }

    const name = request.body?.name;
    const preferredSeat = request.body?.preferredSeat;
    if (typeof name !== "string" || name.trim().length === 0) {
      return reply.code(400).send({ error: "Name is required." });
    }

    if (preferredSeat !== undefined && !isSeat(preferredSeat)) {
      return reply.code(400).send({ error: "Preferred seat must be valid." });
    }

    const seat = selectAvailableSeat(onlineRoom, preferredSeat);
    if (seat === undefined) {
      return reply.code(409).send({ error: "No available seats." });
    }

    const player = onlineRoom.room.players.find((candidate) => candidate.seat === seat);
    if (player === undefined) {
      return reply.code(500).send({ error: "Room player is missing." });
    }

    const session = createPlayerSession(name.trim(), seat);
    player.name = session.name;
    player.isAI = false;
    onlineRoom.sessions.set(session.playerId, session);

    return {
      playerId: session.playerId,
      seat: session.seat,
      room: getPublicRoom(onlineRoom.room, session.seat, { ensurePlans: false }),
    };
  });

  app.get<{ Params: { id: string }; Querystring: RoomQuery }>("/api/rooms/:id", async (request, reply) => {
    const onlineRoom = onlineRooms.get(request.params.id);
    if (onlineRoom === undefined) {
      return reply.code(404).send({ error: "Room not found." });
    }

    const session = request.query.playerId === undefined
      ? findSessionForSeat(onlineRoom, 0)
      : onlineRoom.sessions.get(request.query.playerId);
    if (session === undefined) {
      return reply.code(404).send({ error: "Player session not found." });
    }

    return { room: getPublicRoom(onlineRoom.room, session.seat, { ensurePlans: false }) };
  });

  app.post<{ Params: { id: string }; Body: PlayBody }>("/api/rooms/:id/play", async (request, reply) => {
    const onlineRoom = onlineRooms.get(request.params.id);
    if (onlineRoom === undefined) {
      return reply.code(404).send({ error: "Room not found." });
    }
    const room = onlineRoom.room;

    if (!isSeat(request.body?.seat) || !Array.isArray(request.body?.cardIds) || !request.body.cardIds.every((id) => typeof id === "string")) {
      return reply.code(400).send({ error: "Seat and cardIds are required." });
    }

    try {
      playCards(room, request.body.seat, request.body.cardIds);
      return { room: getPublicRoom(room, 0, { ensurePlans: false }) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid play." });
    }
  });

  app.post<{ Params: { id: string }; Body: PlayBody }>("/api/rooms/:id/tribute", async (request, reply) => {
    const onlineRoom = onlineRooms.get(request.params.id);
    if (onlineRoom === undefined) {
      return reply.code(404).send({ error: "Room not found." });
    }
    const room = onlineRoom.room;

    const seat = request.body?.seat;
    const cardIds = request.body?.cardIds ?? [];
    if (seat !== undefined && !isSeat(seat)) {
      return reply.code(400).send({ error: "Seat must be valid." });
    }

    if (!Array.isArray(cardIds) || !cardIds.every((id) => typeof id === "string")) {
      return reply.code(400).send({ error: "cardIds must be strings." });
    }

    try {
      advanceOpeningTribute(room, seat, cardIds);
      return { room: getPublicRoom(room, 0, { ensurePlans: false }) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid tribute action." });
    }
  });

  app.post<{ Params: { id: string }; Body: SeatBody }>("/api/rooms/:id/pass", async (request, reply) => {
    const onlineRoom = onlineRooms.get(request.params.id);
    if (onlineRoom === undefined) {
      return reply.code(404).send({ error: "Room not found." });
    }
    const room = onlineRoom.room;

    if (!isSeat(request.body?.seat)) {
      return reply.code(400).send({ error: "Seat is required." });
    }

    try {
      passTurn(room, request.body.seat);
      return { room: getPublicRoom(room, 0, { ensurePlans: false }) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid pass." });
    }
  });

  app.post<{ Params: { id: string } }>("/api/rooms/:id/ai", async (request, reply) => {
    const onlineRoom = onlineRooms.get(request.params.id);
    if (onlineRoom === undefined) {
      return reply.code(404).send({ error: "Room not found." });
    }
    const room = onlineRoom.room;

    try {
      runAiUntilHumanTurn(room, 0);
      return { room: getPublicRoom(room, 0, { ensurePlans: false }) };
    } catch (error) {
      request.log.error(error, "AI turn failed");
      return reply.code(409).send({ error: error instanceof Error ? error.message : "AI turn failed." });
    }
  });

  app.post<{ Params: { id: string } }>("/api/rooms/:id/ai-step", async (request, reply) => {
    const onlineRoom = onlineRooms.get(request.params.id);
    if (onlineRoom === undefined) {
      return reply.code(404).send({ error: "Room not found." });
    }
    const room = onlineRoom.room;

    try {
      runAiStep(room);
      return { room: getPublicRoom(room, 0, { ensurePlans: false }) };
    } catch (error) {
      request.log.error(error, "AI step failed");
      return reply.code(409).send({ error: error instanceof Error ? error.message : "AI step failed." });
    }
  });

  return app;
}

function createPlayerSession(name: string, seat: Seat): PlayerSession {
  return {
    playerId: randomUUID(),
    name,
    seat,
    connected: true,
  };
}

function selectAvailableSeat(onlineRoom: OnlineRoom, preferredSeat: Seat | undefined): Seat | undefined {
  const claimedSeats = new Set([...onlineRoom.sessions.values()].map((session) => session.seat));
  const candidates: Seat[] = preferredSeat === undefined
    ? [0, 1, 2, 3]
    : [preferredSeat, ...([0, 1, 2, 3] as Seat[]).filter((seat) => seat !== preferredSeat)];

  return candidates.find((seat) => !claimedSeats.has(seat));
}

function findSessionForSeat(onlineRoom: OnlineRoom, seat: Seat): PlayerSession | undefined {
  return [...onlineRoom.sessions.values()].find((session) => session.seat === seat);
}

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || (process.env.NODE_ENV !== "production" && isLanDevOrigin(origin));
}

function isLanDevOrigin(origin: string): boolean {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  return url.protocol === "http:" && url.port === "5173" && isPrivateIpv4Address(url.hostname);
}

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isValidOptionalInteger(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && Number.isFinite(value));
}

function isValidOptionalPlanCount(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 3 && value <= 5);
}

function validateCardsShape(cards: unknown): { valid: false; errors: string[]; warnings: [] } | undefined {
  if (!Array.isArray(cards)) {
    return { valid: false, errors: ["Cards must be an array."], warnings: [] };
  }

  const invalidIndex = cards.findIndex((card) => !isCardShape(card));

  if (invalidIndex !== -1) {
    return { valid: false, errors: [`Card at index ${invalidIndex} has an invalid shape.`], warnings: [] };
  }

  return undefined;
}

function validateGameRank(rank: unknown): { valid: false; errors: string[]; warnings: [] } | undefined {
  if (typeof rank !== "string" || !VALID_RANKS.has(rank as Rank)) {
    return { valid: false, errors: ["Rank must be a valid game rank."], warnings: [] };
  }

  return undefined;
}

function isSeat(value: unknown): value is Seat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isValidOptionalTributeItems(value: unknown): value is TributeItem[] | undefined {
  if (value === undefined) {
    return true;
  }

  return Array.isArray(value) && value.every((item) => {
    if (item === null || typeof item !== "object") {
      return false;
    }

    const candidate = item as Record<string, unknown>;
    return isSeat(candidate.payer) && isSeat(candidate.receiver);
  });
}

function isCardShape(card: unknown): card is Card {
  if (card === null || typeof card !== "object") {
    return false;
  }

  const candidate = card as Record<string, unknown>;

  if (typeof candidate.id !== "string" || (candidate.copy !== 1 && candidate.copy !== 2)) {
    return false;
  }

  if (candidate.kind === "suited") {
    return (
      VALID_RANKS.has(candidate.rank as Rank) &&
      VALID_SUITS.has(candidate.suit as (typeof SUITS)[number]) &&
      matchesCanonicalCard(candidate)
    );
  }

  if (candidate.kind === "joker") {
    return JOKER_RANKS.has(candidate.rank as JokerRank) && matchesCanonicalCard(candidate);
  }

  return false;
}

function matchesCanonicalCard(candidate: Record<string, unknown>): boolean {
  const canonical = CANONICAL_CARDS_BY_ID.get(candidate.id as string);

  if (canonical === undefined || candidate.kind !== canonical.kind || candidate.rank !== canonical.rank || candidate.copy !== canonical.copy) {
    return false;
  }

  if (canonical.kind === "suited") {
    return candidate.suit === canonical.suit;
  }

  return true;
}

function validatePlanningCards(cards: Card[]): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (cards.length === 0 || cards.length > 27) {
    errors.push("Planning cards must contain from 1 to 27 cards.");
  }

  for (const card of cards) {
    if (seenIds.has(card.id)) {
      errors.push(`Duplicate physical card: ${card.id}`);
    }
    seenIds.add(card.id);
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}
