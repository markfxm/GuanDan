import { act, render } from "@testing-library/react";
import { useRoomSocket } from "../../src/ui/useRoomSocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }

  open(): void {
    this.onopen?.();
  }

  closeConnection(): void {
    this.onclose?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
});

function Harness({
  onRoomUpdate,
  onConnectionStateChange,
}: {
  onRoomUpdate: (room: { id: string }) => void;
  onConnectionStateChange?: (state: string) => void;
}) {
  useRoomSocket("room-1", "player-1", onRoomUpdate, onConnectionStateChange);
  return null;
}

it("connects with room credentials, handles room updates, and closes on unmount", () => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  const onRoomUpdate = vi.fn();
  const view = render(<Harness onRoomUpdate={onRoomUpdate} />);
  const socket = MockWebSocket.instances[0];

  expect(socket.url).toBe(`ws://${window.location.host}/ws/rooms/room-1?playerId=player-1`);

  act(() => {
    socket.emit({ type: "room:update", room: { id: "room-1" } });
    socket.emit({ type: "other", room: { id: "ignored" } });
  });

  expect(onRoomUpdate).toHaveBeenCalledTimes(1);
  expect(onRoomUpdate).toHaveBeenCalledWith({ id: "room-1" });

  view.unmount();
  expect(socket.close).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it("reconnects after close with a backoff and reports the reconnecting state", () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", MockWebSocket);
  const onRoomUpdate = vi.fn();
  const onConnectionStateChange = vi.fn();
  const view = render(<Harness onRoomUpdate={onRoomUpdate} onConnectionStateChange={onConnectionStateChange} />);
  const firstSocket = MockWebSocket.instances[0];

  act(() => firstSocket.closeConnection());
  expect(onConnectionStateChange).toHaveBeenLastCalledWith("reconnecting");
  expect(MockWebSocket.instances).toHaveLength(1);

  act(() => vi.advanceTimersByTime(500));
  expect(MockWebSocket.instances).toHaveLength(2);
  expect(onConnectionStateChange).toHaveBeenLastCalledWith("connecting");

  act(() => MockWebSocket.instances[1].open());
  expect(onConnectionStateChange).toHaveBeenLastCalledWith("connected");

  view.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
