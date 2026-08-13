import { createLegacyBenchmarkRoom, type RoomState, type Seat } from "../../src/game/room";
import type { BenchmarkConfig } from "./contracts";
import { buildGamesForSeed, rotateRoom } from "./rotations";

const config: BenchmarkConfig = {
  benchmarkVersion: "d0-v1",
  rank: "10",
  seeds: [1],
  strategyA: "legal-greedy",
  strategyB: "legal-random",
  replayMode: "none",
};

it("creates eight stable games for one base seed", () => {
  const first = buildGamesForSeed(config, 1);
  const second = buildGamesForSeed(config, 1);
  expect(first).toHaveLength(8);
  expect(first.map((game) => game.matchId)).toEqual(second.map((game) => game.matchId));
  expect(new Set(first.map((game) => game.matchId)).size).toBe(8);
  expect(first[0]!.matchId).toContain(config.strategyA);
  expect(first[0]!.matchId).toContain(config.strategyB);
  expect(first[0]!.matchId).toContain(first[0]!.configHash);
});

it("maps every seat by sigma rotation and preserves cards and references", () => {
  const base = createLegacyBenchmarkRoom({ rank: "10", seed: 33 });
  base.currentTurn = 1;
  base.leaderSeat = 2;
  base.trick = {
    leadSeat: 2,
    lastPlaySeat: 1,
    lastPlay: undefined,
    passSeats: [3],
    plays: [{ seat: 3, action: "pass" }],
  };
  base.playHistory = [{ seat: 3, action: "pass" }];
  base.finishOrder = [0];
  base.openingTribute = {
    status: "pending",
    items: [{ payer: 0, receiver: 2 }],
    exchanges: [{ payer: 0, receiver: 2, tributeCard: base.hands[0]![0]! }],
    phase: "tribute",
    activeSeat: 0,
  };

  const rotated = rotateRoom(base, 1);
  const ids = Object.values(rotated.hands).flat().map((card) => card.id);
  expect(ids).toHaveLength(108);
  expect(new Set(ids).size).toBe(108);
  expect(rotated.currentTurn).toBe(2);
  expect(rotated.leaderSeat).toBe(3);
  expect(rotated.trick.leadSeat).toBe(3);
  expect(rotated.trick.lastPlaySeat).toBe(2);
  expect(rotated.trick.passSeats).toEqual([0]);
  expect(rotated.trick.plays[0]?.seat).toBe(0);
  expect(rotated.finishOrder).toEqual([1]);
  expect(rotated.openingTribute?.items[0]).toMatchObject({ payer: 1, receiver: 3 });
  expect(rotated.openingTribute?.exchanges?.[0]).toMatchObject({ payer: 1, receiver: 3 });
  expect(rotated.players.map((player) => player.team)).toEqual([0, 1, 0, 1]);
  expect(rotated.hands[1]).toEqual(base.hands[0]);
});

it("preserves an already settled room's seat references", () => {
  const room = createLegacyBenchmarkRoom({ rank: "10", seed: 2 });
  room.finishOrder = [0, 2, 1, 3];
  room.status = "finished";
  room.settlement = {
    winningTeam: 0,
    outcome: "double-down",
    levelStep: 3,
    currentRank: "10",
    nextRank: "K",
    tribute: { status: "pending", items: [{ payer: 1, receiver: 0 }] },
  };
  const rotated = rotateRoom(room, 2);
  expect(rotated.finishOrder).toEqual([2, 0, 3, 1] satisfies Seat[]);
  expect(rotated.settlement?.winningTeam).toBe(0);
  expect(rotated.settlement?.tribute.items[0]).toEqual({ payer: 3, receiver: 2 });
});
