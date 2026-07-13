import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../../src/ui/App";
import type { PublicRoom } from "../../src/ui/api";

class MockRoomWebSocket {
  static instances: MockRoomWebSocket[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockRoomWebSocket.instances.push(this);
  }
}

beforeEach(() => {
  localStorage.clear();
  MockRoomWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockRoomWebSocket);
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders the lobby with player name, room id, and create/join actions", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "房间大厅" })).toBeInTheDocument();
  expect(screen.getByLabelText("玩家姓名")).toBeInTheDocument();
  expect(screen.getByLabelText("房间号")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "创建房间" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "加入房间" })).toBeInTheDocument();
});

it("creates a named room and enters the waiting room", async () => {
  mockFetchQueue([{ playerId: "player-1", room: createRoom({ playerId: "player-1", players: playersWithHuman("Alice", 0) }) }]);
  render(<App />);

  fireEvent.change(screen.getByLabelText("玩家姓名"), { target: { value: "Alice" } });
  fireEvent.click(screen.getByRole("button", { name: "创建房间" }));

  expect(await screen.findByRole("heading", { name: "房间等待区" })).toBeInTheDocument();
  const waitingRoom = screen.getByRole("region", { name: "房间等待区" });
  expect(within(waitingRoom).getByText("南 · Alice")).toBeInTheDocument();
  expect(screen.getByText("room-1")).toBeInTheDocument();
  expect(localStorage.getItem("guandanPlayerId")).toBe("player-1");
  expect(fetch).toHaveBeenCalledWith(
    "/api/rooms",
    expect.objectContaining({
      body: JSON.stringify({ rank: "2", pendingTributeItems: [], name: "Alice" }),
    }),
  );
});

it("joins a room and shows the public seat list", async () => {
  mockFetchQueue([{ playerId: "player-2", room: createRoom({ playerId: "player-2", humanSeat: 1, players: playersWithHuman("Bob", 1) }) }]);
  render(<App />);

  fireEvent.change(screen.getByLabelText("玩家姓名"), { target: { value: "Bob" } });
  fireEvent.change(screen.getByLabelText("房间号"), { target: { value: "room-1" } });
  fireEvent.click(screen.getByRole("button", { name: "加入房间" }));

  expect(await screen.findByRole("heading", { name: "房间等待区" })).toBeInTheDocument();
  const waitingRoom = screen.getByRole("region", { name: "房间等待区" });
  expect(within(waitingRoom).getByText("西 · Bob")).toBeInTheDocument();
  expect(within(waitingRoom).getByText("座位 1")).toBeInTheDocument();
  expect(localStorage.getItem("guandanSeat")).toBe("1");
  expect(fetch).toHaveBeenCalledWith(
    "/api/rooms/room-1/join",
    expect.objectContaining({
      body: JSON.stringify({ name: "Bob" }),
    }),
  );
});

it("updates waiting-room seats from a room:update message and copies the invite link", async () => {
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
  mockFetchQueue([{ playerId: "player-1", room: createRoom({ playerId: "player-1" }) }]);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "创建房间" }));
  await screen.findByRole("heading", { name: "房间等待区" });

  const updatedRoom = createRoom({ playerId: "player-1", players: playersWithHuman("Alice", 0) });
  act(() => {
    MockRoomWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: "room:update", room: updatedRoom }) } as MessageEvent<string>);
  });
  const waitingRoom = screen.getByRole("region", { name: "房间等待区" });
  expect(await within(waitingRoom).findByText("南 · Alice")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "复制邀请链接" }));
  await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("roomId=room-1")));
  expect(screen.getByRole("button", { name: "已复制邀请链接" })).toBeInTheDocument();
});

function createRoom(overrides: Partial<PublicRoom> = {}): PublicRoom {
  return {
    id: "room-1",
    playerId: "player-1",
    rank: "2",
    players: playersWithHuman("玩家", 0),
    currentTurn: 1,
    leaderSeat: 0,
    currentTrickIndex: 0,
    trick: { leadSeat: 0, passSeats: [], plays: [] },
    finishOrder: [],
    aiPlans: {},
    playHistory: [],
    replayHands: { 0: [], 1: [], 2: [], 3: [] },
    status: "playing",
    actionLog: [],
    humanSeat: 0,
    humanHand: [],
    announcements: [],
    ...overrides,
  };
}

function playersWithHuman(name: string, humanSeat: 0 | 1 | 2 | 3) {
  return ([0, 1, 2, 3] as const).map((seat) => ({
    seat,
    name: seat === humanSeat ? name : `AI ${seat}`,
    isAI: seat !== humanSeat,
    handCount: 27,
    team: seat % 2 as 0 | 1,
  }));
}

function mockFetchQueue(bodies: unknown[]) {
  const queue = [...bodies];
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const body = queue.shift();
    if (body === undefined) {
      throw new Error("Unexpected fetch call");
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
    } as Response;
  });
}
