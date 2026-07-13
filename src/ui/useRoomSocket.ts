import { useEffect, useRef } from "react";
import type { PublicRoom } from "./api";

type RoomUpdateMessage = {
  type: "room:update";
  room: PublicRoom;
};

export type RoomSocketState = "idle" | "connecting" | "connected" | "reconnecting";

export function useRoomSocket(
  roomId: string | undefined,
  playerId: string | undefined,
  onRoomUpdate: (room: PublicRoom) => void,
  onConnectionStateChange?: (state: RoomSocketState) => void,
): void {
  const onRoomUpdateRef = useRef(onRoomUpdate);
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);

  useEffect(() => {
    onRoomUpdateRef.current = onRoomUpdate;
  }, [onRoomUpdate]);

  useEffect(() => {
    onConnectionStateChangeRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  useEffect(() => {
    if (roomId === undefined || playerId === undefined || roomId.length === 0 || playerId.length === 0) {
      onConnectionStateChangeRef.current?.("idle");
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}/ws/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(playerId)}`;
    let active = true;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let socket: WebSocket | undefined;

    const connect = () => {
      if (!active) {
        return;
      }

      onConnectionStateChangeRef.current?.("connecting");
      socket = new WebSocket(socketUrl);

      socket.onopen = () => {
        reconnectAttempt = 0;
        onConnectionStateChangeRef.current?.("connected");
      };

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

      socket.onclose = () => {
        if (!active) {
          return;
        }

        onConnectionStateChangeRef.current?.("reconnecting");
        const delay = Math.min(500 * 2 ** reconnectAttempt, 8_000);
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }

      if (socket !== undefined) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.close();
      }
    };
  }, [roomId, playerId]);
}
