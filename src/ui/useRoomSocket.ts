import { useEffect, useRef } from "react";
import type { PublicRoom } from "./api";

type RoomUpdateMessage = {
  type: "room:update";
  room: PublicRoom;
};

export function useRoomSocket(
  roomId: string | undefined,
  playerId: string | undefined,
  onRoomUpdate: (room: PublicRoom) => void,
): void {
  const onRoomUpdateRef = useRef(onRoomUpdate);

  useEffect(() => {
    onRoomUpdateRef.current = onRoomUpdate;
  }, [onRoomUpdate]);

  useEffect(() => {
    if (roomId === undefined || playerId === undefined || roomId.length === 0 || playerId.length === 0) {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}/ws/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerId)}`;
    const socket = new WebSocket(socketUrl);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as RoomUpdateMessage;
        if (message.type === "room:update" && message.room !== undefined) {
          onRoomUpdateRef.current(message.room);
        }
      } catch {
        // Ignore malformed websocket messages and keep the connection alive.
      }
    };

    return () => {
      socket.onmessage = null;
      socket.close();
    };
  }, [roomId, playerId]);
}
