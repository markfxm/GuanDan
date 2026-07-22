import { canonicalJson, type BenchmarkObservation } from "./contracts";
import { createDeck } from "../../src/engine/cards";

it("keeps benchmark observations free of hidden partner hands", () => {
  const observation: BenchmarkObservation = {
    ownHand: createDeck().slice(0, 2),
    rank: "10",
    seat: 0,
    currentSeat: 1,
    leaderSeat: 1,
    publicHandCounts: { 0: 2, 1: 3, 2: 4, 3: 5 },
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

it("rejects values that JSON cannot serialize to a string", () => {
  expect(() => canonicalJson(undefined)).toThrow("CANONICAL_JSON_UNSUPPORTED_VALUE");
});
