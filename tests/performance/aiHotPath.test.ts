import { createRoom, runAiStep } from "../../src/game/room";

it("completes a fresh rank-2 AI lead in under one second", () => {
  const room = createRoom({ rank: "2", seed: 1 });
  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  room.aiPlans = {};

  const startedAt = performance.now();
  runAiStep(room);
  const elapsedMs = performance.now() - startedAt;

  expect(room.playHistory).toHaveLength(1);
  expect(room.playHistory[0]?.action).toBe("play");
  expect(elapsedMs).toBeLessThan(1_000);
}, 20_000);

it("reuses a residual AI plan after playing one planned group", () => {
  const room = createRoom({ rank: "2", seed: 2 });
  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  room.aiPlans = {};

  runAiStep(room);
  const plan = room.aiPlans[1];
  expect(plan).toBeDefined();
  expect(["bomb", "straight-flush", "joker-bomb"]).not.toContain(room.playHistory[0]?.group?.type);

  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  const startedAt = performance.now();
  runAiStep(room);

  expect(room.aiPlans[1]).toBe(plan);
  expect(performance.now() - startedAt).toBeLessThan(500);
}, 20_000);
