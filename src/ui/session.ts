import type { PublicRoom, Seat } from "./api";

const ROOM_ID_KEY = "guandanRoomId";
const PLAYER_ID_KEY = "guandanPlayerId";
const SEAT_KEY = "guandanSeat";
const PLAYER_NAME_KEY = "guandanPlayerName";

export type StoredRoomSession = {
  roomId: string;
  playerId: string;
  seat: Seat;
  playerName: string;
};

export function persistRoomSession(session: StoredRoomSession): void {
  localStorage.setItem(ROOM_ID_KEY, session.roomId);
  localStorage.setItem(PLAYER_ID_KEY, session.playerId);
  localStorage.setItem(SEAT_KEY, String(session.seat));
  localStorage.setItem(PLAYER_NAME_KEY, session.playerName);
}

export function persistPublicRoomSession(room: PublicRoom): void {
  if (room.playerId === undefined) {
    return;
  }

  const playerName = room.players.find((player) => player.seat === room.humanSeat)?.name ?? "玩家";
  persistRoomSession({ roomId: room.id, playerId: room.playerId, seat: room.humanSeat, playerName });
}

export function readStoredRoomSession(): StoredRoomSession | undefined {
  const roomId = localStorage.getItem(ROOM_ID_KEY);
  const playerId = localStorage.getItem(PLAYER_ID_KEY);
  const playerName = localStorage.getItem(PLAYER_NAME_KEY);
  const storedSeat = localStorage.getItem(SEAT_KEY);
  const seat = storedSeat === null ? 0 : Number(storedSeat);

  if (roomId === null || roomId.length === 0 || playerId === null || playerId.length === 0) {
    if (roomId !== null || playerId !== null || storedSeat !== null || playerName !== null) {
      clearStoredRoomSession();
    }
    return undefined;
  }

  return { roomId, playerId, seat: isSeat(seat) ? seat : 0, playerName: playerName ?? "" };
}

export function clearStoredRoomSession(): void {
  localStorage.removeItem(ROOM_ID_KEY);
  localStorage.removeItem(PLAYER_ID_KEY);
  localStorage.removeItem(SEAT_KEY);
  localStorage.removeItem(PLAYER_NAME_KEY);
}

function isSeat(value: number): value is Seat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
