import { createRoom } from "../../src/game/room";
import { createBenchmarkObservation, toLegacyObservation } from "./observation";
import { getStrategy } from "./strategies";

const observation = createBenchmarkObservation(createRoom({ rank: "10", seed: 17 }), 0);

it("replaces only the acting strategy runtime", () => {
  const strategy = getStrategy("legal-random");
  const first = strategy.createRuntime({ runtimeId: "runtime-a", seat: 0, strategyRandomSeed: "seed-a" });
  const second = strategy.createRuntime({ runtimeId: "runtime-b", seat: 1, strategyRandomSeed: "seed-b" });
  const secondBefore = structuredClone(second);

  const decision = strategy.decide(observation, first);

  expect(decision.runtime).not.toBe(first);
  expect(second).toEqual(secondBefore);
});

it("passes legacy only a restricted public input", () => {
  const input = toLegacyObservation(observation);
  const hiddenFields = ["partnerHand", "opponentHands", "hands", "initialHands", "deck", "seed"];

  for (const field of hiddenFields) {
    expect(input).not.toHaveProperty(field);
  }
});

it("makes legal-random deterministic from its derived seed", () => {
  const strategy = getStrategy("legal-random");
  const context = { runtimeId: "runtime-a", seat: 0 as const, strategyRandomSeed: "same-seed" };
  const first = strategy.decide(observation, strategy.createRuntime(context));
  const second = strategy.decide(observation, strategy.createRuntime(context));

  expect(first.action).toEqual(second.action);
});

it("keeps runtime context opaque and seat-isolated", () => {
  const strategy = getStrategy("legal-random");
  const left = strategy.createRuntime({ runtimeId: "opaque-left", seat: 0, strategyRandomSeed: "seed-left" });
  const right = strategy.createRuntime({ runtimeId: "opaque-right", seat: 1, strategyRandomSeed: "seed-right" });
  expect(left).not.toHaveProperty("matchId");
  expect(left).not.toHaveProperty("seed");
  expect(right).not.toEqual(left);
});

it("resolves canonical IDs and aliases with legal descriptor names", () => {
  expect(getStrategy("unified-current").id).toBe("unified-current");
  expect(getStrategy("legacy-reference").id).toBe("legacy-reference");
  expect(getStrategy("legal-random").id).toBe("legal-random");
  expect(getStrategy("legal-greedy").id).toBe("legal-greedy");
  expect(getStrategy("deterministic-random").id).toBe("legal-random");
  expect(getStrategy("simple-greedy").id).toBe("legal-greedy");
});
