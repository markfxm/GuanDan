# Online Room Session Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-memory online room sessions so multiple human players can claim seats and receive seat-specific public room views.

**Architecture:** Keep the session wrapper and seat allocation local to `src/server/api.ts`. Store `RoomState` inside `OnlineRoom`, create a seat-0 session during room creation, and resolve joined sessions by `playerId` for the new join and GET endpoints. Existing mutation routes continue using their current request shapes and operate on `onlineRoom.room`.

**Tech Stack:** TypeScript, Fastify, Vitest, existing `RoomState` and `getPublicRoom` APIs.

## Global Constraints

- Do not change game rules or `RoomState`.
- Never return `RoomState.hands` or `RoomState.initialHands` directly.
- Use `getPublicRoom(room, session.seat, { ensurePlans: false })` for player-specific responses.
- Treat an AI seat as available until a session claims it; a claimed seat cannot be assigned again.
- Do not add WebSocket support or database persistence.
- Keep legacy room creation and GET without `playerId` working.

### Task 1: Define failing API behavior tests

**Files:**
- Modify: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: Existing `buildApi()` Fastify test helper.
- Produces: Regression coverage for room session creation, preferred-seat assignment/fallback, player-specific hand isolation, and full-room rejection.

- [ ] **Step 1: Add a test for joining an AI seat**

  Create a room with a fixed seed, POST `{ name: "Alice", preferredSeat: 2 }` to `/api/rooms/:id/join`, and assert status 200, `seat === 2`, `playerId` is a string, `room.humanSeat === 2`, `room.players[2]` is human with name Alice, and `room.hands`/`room.initialHands` are absent.

- [ ] **Step 2: Add a test for fallback and player-specific views**

  Join Alice at seat 2, then join Bob with `preferredSeat: 2`; assert Bob receives the first unclaimed seat (seat 1). GET with Alice's playerId and Bob's playerId, assert their `humanSeat` values differ and their `humanHand` card-id arrays differ.

- [ ] **Step 3: Add a test for the fourth-seat limit**

  Create a room, join three additional names without preferences, then assert a fourth join returns 409 with `{ error: "No available seats." }`.

- [ ] **Step 4: Run only the new tests and verify the expected RED failure**

  Run `npm test -- tests/server/api.test.ts`.

  Expected result: the new tests fail because `/join` and playerId session responses do not exist yet; existing server tests may still pass.

### Task 2: Implement the online room session layer

**Files:**
- Modify: `src/server/api.ts`

**Interfaces:**
- Consumes: `RoomState`, `Seat`, `createRoom`, and `getPublicRoom` from `src/game/room.ts`.
- Produces: Exported `PlayerSession` and `OnlineRoom` types, in-memory `onlineRooms`, room creation sessions, `POST /api/rooms/:id/join`, and playerId-aware GET responses.

- [ ] **Step 1: Add the server types and request body type**

  Define:

  ```ts
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

  type JoinRoomBody = {
    name?: unknown;
    preferredSeat?: unknown;
  };
  ```

- [ ] **Step 2: Replace the room map and add session helpers**

  Use `const onlineRooms = new Map<string, OnlineRoom>()`. Generate IDs with `randomUUID()`. Add helpers that select a requested seat if it is valid and unclaimed, otherwise the first unclaimed seat; find a session by playerId; and identify whether a seat is claimed by any session.

- [ ] **Step 3: Preserve creation while creating a seat-0 session**

  After `createRoom`, create a connected session for seat 0 using the existing player name, store `{ room, sessions }`, and return `{ playerId, seat: 0, room: getPublicRoom(room, 0, { ensurePlans: false }) }`.

- [ ] **Step 4: Add the join endpoint**

  Resolve the online room or return 404. Validate `name` as a non-empty trimmed string and `preferredSeat` as either undefined or a valid `Seat`; invalid input returns 400. Select the seat, return 409 if none is free, update the matching player to `{ name, isAI: false }`, create a connected session, and return its `playerId`, `seat`, and seat-specific public room.

- [ ] **Step 5: Make GET resolve playerId without breaking legacy callers**

  Resolve the online room or return 404. If `playerId` is present, find its session or return 404; otherwise use the room's seat-0 session. Return `getPublicRoom(onlineRoom.room, session.seat, { ensurePlans: false })`.

- [ ] **Step 6: Update existing room routes to unwrap `OnlineRoom`**

  Replace `rooms.get(...)` with `onlineRooms.get(...)` and pass `.room` to existing game functions. Keep mutation request shapes and their current seat-0 response behavior unchanged.

### Task 3: Verify and clean up

**Files:**
- Verify: `src/server/api.ts`
- Verify: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: The completed online room endpoints and regression tests.
- Produces: A passing repository test suite and TypeScript/Vite build.

- [ ] **Step 1: Run the focused server tests**

  Run `npm test -- tests/server/api.test.ts` and confirm all server tests pass.

- [ ] **Step 2: Review the diff for private state leaks**

  Run `git diff -- src/server/api.ts tests/server/api.test.ts` and confirm every room response uses `getPublicRoom`, with no direct `hands` or `initialHands` response.

- [ ] **Step 3: Run the full test suite and build**

  Run `npm test`, then `npm run build`. Both commands must exit successfully.
