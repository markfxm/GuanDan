import { simulateUnifiedRooms } from "../../scripts/unifiedAiSimulation";

it("completes 20 fixed-seed unified rooms without engine errors", () => {
  const summary = simulateUnifiedRooms(Array.from({ length: 20 }, (_, index) => index + 1));
  expect(summary.completed).toBe(20);
  expect(summary.exceededActionLimit).toBe(0);
  expect(summary.engineErrors).toBe(0);
});
