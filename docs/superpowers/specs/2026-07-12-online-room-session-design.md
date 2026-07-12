# Online Room Session Layer Design

**Goal:** Add lightweight in-memory player sessions so multiple human clients can join one existing `RoomState`, each claim a seat, and receive only that seat's public room view.

## Scope

- Keep the existing game rules and `RoomState` unchanged.
- Replace the server's `Map<string, RoomState>` with `Map<string, OnlineRoom>`.
- Keep room creation and legacy room GET behavior working for the existing single-player UI.
- Add `POST /api/rooms/:id/join` and player-specific `GET /api/rooms/:id?playerId=...`.
- Do not add WebSocket support, database persistence, disconnect handling, or playerId authorization to game mutation endpoints yet.

## Data model

The server owns these types:

```ts
type PlayerSession = {
  playerId: string;
  name: string;
  seat: Seat;
  connected: boolean;
};

type OnlineRoom = {
  room: RoomState;
  sessions: Map<string, PlayerSession>;
};
```

When a room is created, seat 0 is represented by a connected local session using the existing player name. The generated `playerId` and seat are returned alongside the existing public room response. Existing clients can ignore the additional fields.

An AI seat is available for human joining until a connected session claims it. Joining changes that `PlayerState` to `isAI: false` and updates its name, while preserving the seat and its dealt hand. A seat claimed by any existing session is unavailable. The requested seat is preferred; if unavailable, seats are considered in numeric order. A join fails with HTTP 409 when all four seats are claimed.

## HTTP behavior

### `POST /api/rooms`

Creates the existing room, stores it as an `OnlineRoom`, creates the seat-0 local session, and returns:

```json
{
  "playerId": "...",
  "seat": 0,
  "room": { "humanSeat": 0, "humanHand": ["..."], "...": "..." }
}
```

The response still contains the existing `room` object and never includes `room.hands` or `room.initialHands`.

### `POST /api/rooms/:id/join`

Accepts `{ "name": string, "preferredSeat?: 0 | 1 | 2 | 3" }`. A non-empty string name is required, and an invalid preferred seat is rejected with HTTP 400. The endpoint returns the generated `playerId`, assigned `seat`, and `getPublicRoom(onlineRoom.room, seat, { ensurePlans: false })`. Unknown rooms return 404; no available seats return 409.

### `GET /api/rooms/:id?playerId=...`

With a valid playerId, resolves that session and returns `getPublicRoom(onlineRoom.room, session.seat, { ensurePlans: false })`. An unknown playerId returns 404. Without a playerId, the legacy seat-0 view is returned so the existing single-player UI remains compatible.

All room responses continue to omit the private `hands` and `initialHands` fields. The response's `humanHand` is selected only by the resolved session seat.

## Implementation boundary

The session types, in-memory map, seat assignment, and lookup helpers will live in `src/server/api.ts` to keep this change small and local to the current server layer. Existing game routes will use `onlineRoom.room` but retain their current request shapes and seat-0 response behavior until a later playerId authorization task.

## Verification

- Add server tests covering a join that replaces an AI seat, preferred-seat fallback, and full-seat rejection.
- Fetch the room with two different returned playerIds and assert their `humanSeat` and `humanHand` differ.
- Assert no room response contains `hands` or `initialHands`.
- Run `npm test` and `npm run build`.
