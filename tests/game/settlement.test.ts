import { advanceRank, settleRound } from "../../src/game/settlement";

it("settles double-down when partners finish first and second", () => {
  const settlement = settleRound([0, 2, 1, 3], "10");

  expect(settlement.winningTeam).toBe(0);
  expect(settlement.outcome).toBe("double-down");
  expect(settlement.levelStep).toBe(3);
  expect(settlement.nextRank).toBe("K");
  expect(settlement.tribute.status).toBe("pending");
  expect(settlement.tribute.items).toEqual([
    { payer: 1, receiver: 0 },
    { payer: 3, receiver: 2 },
  ]);
});

it("settles single-down when winner partner finishes third", () => {
  const settlement = settleRound([0, 1, 2, 3], "10");

  expect(settlement.outcome).toBe("single-down");
  expect(settlement.levelStep).toBe(2);
  expect(settlement.nextRank).toBe("Q");
  expect(settlement.tribute.items).toEqual([{ payer: 3, receiver: 0 }]);
});

it("settles single-rank win when winner partner finishes last", () => {
  const settlement = settleRound([0, 1, 3, 2], "10");

  expect(settlement.outcome).toBe("single-win");
  expect(settlement.levelStep).toBe(1);
  expect(settlement.nextRank).toBe("J");
  expect(settlement.tribute.items).toEqual([{ payer: 2, receiver: 0 }]);
});

it("does not mark anti-tribute during settlement before the next deal", () => {
  const settlement = settleRound([0, 2, 1, 3], "10", {
    1: ["Joker-BJ-1"],
    3: ["Joker-BJ-2"],
  });

  expect(settlement.tribute.status).toBe("pending");
  expect(settlement.tribute.items).toEqual([
    { payer: 1, receiver: 0 },
    { payer: 3, receiver: 2 },
  ]);
});

it("advances rank through A and wraps to 2", () => {
  expect(advanceRank("Q", 3)).toBe("2");
});
