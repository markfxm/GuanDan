import { canonicalJson, type BenchmarkObservation } from "./contracts";

it("keeps benchmark observations free of hidden partner hands", () => {
  const observation: BenchmarkObservation = {
    ownHand: ["card-1", "card-2"],
    rank: "10",
    seat: 0,
    currentSeat: 1,
    leaderSeat: 1,
    publicHandCounts: [2, 3, 4, 5],
    publicTrick: [],
    publicHistory: [],
    finishOrder: [],
    partnerPassed: false,
    publicTributeEvents: [],
    actionIndex: 0,
  };

  expect(Object.keys(observation)).not.toContain("partnerHand");
});

it("serializes object keys canonically without changing array order", () => {
  expect(canonicalJson({ b: 1, a: ["z", "a"] })).toBe('{"a":["z","a"],"b":1}');
});
