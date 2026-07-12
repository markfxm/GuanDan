import { act, render } from "@testing-library/react";
import { useRoomSocket } from "../../src/ui/useRoomSocket";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }
}

function Harness({ onRoomUpdate }: { onRoomUpdate: (room: { id: string }) => void }) {
  useRoomSocket("room-1", "player-1", onRoomUpdate);
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
