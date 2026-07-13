import { clearStoredRoomSession, persistRoomSession, readStoredRoomSession } from "../../src/ui/session";

afterEach(() => {
  localStorage.clear();
});

it("persists and restores the room identity needed after a refresh", () => {
  persistRoomSession({ roomId: "room-7", playerId: "player-9", seat: 2, playerName: "Alice" });

  expect(readStoredRoomSession()).toEqual({ roomId: "room-7", playerId: "player-9", seat: 2, playerName: "Alice" });
});

it("clears all stored room identity values when leaving a room", () => {
  persistRoomSession({ roomId: "room-7", playerId: "player-9", seat: 2, playerName: "Alice" });

  clearStoredRoomSession();

  expect(readStoredRoomSession()).toBeUndefined();
  expect(localStorage.length).toBe(0);
});

it("can recover with only the room and player ids from an older cache", () => {
  localStorage.setItem("guandanRoomId", "room-7");
  localStorage.setItem("guandanPlayerId", "player-9");

  expect(readStoredRoomSession()).toEqual({ roomId: "room-7", playerId: "player-9", seat: 0, playerName: "" });
});
