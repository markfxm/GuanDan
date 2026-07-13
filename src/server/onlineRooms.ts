import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { getPublicRoom, type RoomState, type Seat } from "../game/room";

export type PlayerSession = {
  playerId: string;
  name: string;
  seat: Seat;
  connected: boolean;
};

export type RoomSocketSession = {
  playerId: string;
  socket: WebSocket;
};

export type OnlineRoom = {
  room: RoomState;
  sessions: Map<string, PlayerSession>;
  sockets: Set<RoomSocketSession>;
};

export class OnlineRoomRegistry {
  private readonly rooms = new Map<string, OnlineRoom>();

  create(room: RoomState, name: string, seat: Seat): { onlineRoom: OnlineRoom; session: PlayerSession } {
    const session = createPlayerSession(name, seat);
    const onlineRoom: OnlineRoom = {
      room,
      sessions: new Map([[session.playerId, session]]),
      sockets: new Set(),
    };
    this.rooms.set(room.id, onlineRoom);
    return { onlineRoom, session };
  }

  get(roomId: string): OnlineRoom | undefined {
    return this.rooms.get(roomId);
  }

  join(onlineRoom: OnlineRoom, name: string, preferredSeat: Seat | undefined): { player: RoomState["players"][number]; session: PlayerSession } | undefined {
    const seat = selectAvailableSeat(onlineRoom, preferredSeat);
    if (seat === undefined) {
      return undefined;
    }

    const player = onlineRoom.room.players.find((candidate) => candidate.seat === seat);
    if (player === undefined) {
      throw new Error("Room player is missing.");
    }

    const session = createPlayerSession(name, seat);
    onlineRoom.sessions.set(session.playerId, session);
    return { player, session };
  }

  findSession(onlineRoom: OnlineRoom, playerId: string): PlayerSession | undefined {
    return onlineRoom.sessions.get(playerId);
  }

  findSessionForSeat(onlineRoom: OnlineRoom, seat: Seat): PlayerSession | undefined {
    return [...onlineRoom.sessions.values()].find((session) => session.seat === seat);
  }

  defaultPerspectiveSeat(onlineRoom: OnlineRoom): Seat {
    return [...onlineRoom.sessions.values()][0]?.seat ?? 0;
  }
}

export function connectRoomSocket(onlineRoom: OnlineRoom, session: PlayerSession, socket: WebSocket): void {
  const connection = { playerId: session.playerId, socket } satisfies RoomSocketSession;
  onlineRoom.sockets.add(connection);
  session.connected = true;
  sendRoomUpdate(connection, onlineRoom);

  socket.on("close", () => {
    onlineRoom.sockets.delete(connection);
    session.connected = [...onlineRoom.sockets].some((candidate) => candidate.playerId === session.playerId);
  });
}

export function broadcastRoom(onlineRoom: OnlineRoom): void {
  for (const connection of onlineRoom.sockets) {
    sendRoomUpdate(connection, onlineRoom);
  }
}

function createPlayerSession(name: string, seat: Seat): PlayerSession {
  return {
    playerId: randomUUID(),
    name,
    seat,
    connected: false,
  };
}

function selectAvailableSeat(onlineRoom: OnlineRoom, preferredSeat: Seat | undefined): Seat | undefined {
  const claimedSeats = new Set([...onlineRoom.sessions.values()].map((session) => session.seat));
  const candidates: Seat[] = preferredSeat === undefined
    ? [0, 1, 2, 3]
    : [preferredSeat, ...([0, 1, 2, 3] as Seat[]).filter((seat) => seat !== preferredSeat)];

  return candidates.find((seat) => !claimedSeats.has(seat));
}

function sendRoomUpdate(connection: RoomSocketSession, onlineRoom: OnlineRoom): void {
  const session = onlineRoom.sessions.get(connection.playerId);
  if (session === undefined || connection.socket.readyState !== 1) {
    return;
  }

  try {
    connection.socket.send(JSON.stringify({
      type: "room:update",
      room: getPublicRoom(onlineRoom.room, session.seat, { ensurePlans: false }),
    }));
  } catch {
    connection.socket.close();
  }
}
