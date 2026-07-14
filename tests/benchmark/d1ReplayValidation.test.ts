import { describe, expect, it } from "vitest";
import { validateD1Replay, validateReplaySet } from "./d1ReplayValidation";

const replay = () => ({
  schemaVersion: "d1-replay-v1", replayVersion: "d1-replay-v1", benchmarkVersion: "d1-topk-v1", engineVersion: "engine-v1", roomRulesVersion: "rules-v1", configHash: "cfg", matchId: "m1", seed: 201, rotation: 0, allocation: "AB", rank: "2", strategiesBySeat: { 0: "a", 1: "b", 2: "a", 3: "b" }, strategyDescriptors: [], publicEvents: [], handCountChanges: [], trickEvents: [], tributeEvents: [], finishOrder: [0, 1, 2, 3], winnerTeam: 0, teamScore: { 0: 1, 1: 0 }, deterministicRandom: { algorithmVersion: "none", baseSeed: 201, perSeatDerivedSeed: {} }, actionCount: 0, publicTraceHash: "", finalPublicStateHash: "",
});

describe("D1 replay validation", () => {
  it("rejects hidden state and missing provenance instead of skipping", () => {
    expect(() => validateD1Replay({ ...replay(), hands: { 0: [] } })).toThrow(/HIDDEN_STATE|PRIVACY/);
    expect(() => validateD1Replay({ ...replay(), strategyDescriptors: undefined })).toThrow(/PROVENANCE/);
  });

  it("validates expected IDs, duplicates, hashes and versions as a set", () => {
    const first = replay();
    expect(() => validateReplaySet([first, { ...first }], ["m1", "m2"])).toThrow(/DUPLICATE|MISSING/);
  });
});
