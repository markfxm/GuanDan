import { describe, expect, it } from "vitest";
import { validateD1RawResultV2, validateD1Replay, validateReplaySet } from "./d1ReplayValidation";
import { buildD1ExecutionProvenance, hashD1ExecutionProvenance } from "./d1ProvenanceV2";

const replay = () => ({
  schemaVersion: "1", replayVersion: "d1-replay-v1", benchmarkVersion: "d1-topk-v1", engineVersion: "engine-v1", roomRulesVersion: "rules-v1", configHash: "cfg", matchId: "m1", seed: 201, rotation: 0, allocation: "AB", rank: "2", strategiesBySeat: { 0: "a", 1: "b", 2: "a", 3: "b" }, strategyDescriptors: [], publicEvents: [], handCountChanges: [], trickEvents: [], tributeEvents: [], finishOrder: [0, 1, 2, 3], winnerTeam: 0, teamScore: { 0: 1, 1: 0 }, deterministicRandom: { algorithmVersion: "none", baseSeed: 201, perSeatDerivedSeed: {} }, actionCount: 0, publicTraceHash: "", finalPublicStateHash: "",
});

describe("D1 replay validation", () => {
  it("rejects hidden state and missing provenance instead of skipping", () => {
    expect(validateD1Replay(replay())).toBe(true);
    expect(() => validateD1Replay({ ...replay(), hands: { 0: [] } })).toThrow(/HIDDEN_STATE|PRIVACY/);
    expect(() => validateD1Replay({ ...replay(), strategyDescriptors: undefined })).toThrow(/PROVENANCE/);
  });

  it("validates expected IDs, duplicates, hashes and versions as a set", () => {
    const first = replay();
    expect(() => validateReplaySet([first, { ...first }], ["m1", "m2"])).toThrow(/DUPLICATE|MISSING/);
  });

  it("rejects a v1 raw result and accepts complete v2 provenance", () => {
    const provenance = buildD1ExecutionProvenance({ executionSourceCommit: "a".repeat(40), configHash: "c".repeat(64), phase: "calibration", seedStart: 221, seedEnd: 270, strategyDescriptors: [] });
    const value = { rawResultSchemaVersion: "d1-benchmark-result-v2", matchId: "m1", phase: "calibration", matchup: "treatment-vs-control", seed: 221, placement: "AB", rotation: 0, strategiesBySeat: {}, configHash: "c".repeat(64), executionSourceCommit: "a".repeat(40), provenanceHash: hashD1ExecutionProvenance(provenance), executionProvenance: provenance, publicTraceHash: "h", finalPublicStateHash: "f", d1Diagnostics: { schemaVersion: "d1-plan-selection-diagnostics-v1", applicable: false }, durationMs: 1 };
    expect(validateD1RawResultV2(value, { configHash: "c".repeat(64), executionSourceCommit: "a".repeat(40), provenanceHash: value.provenanceHash, phase: "calibration" })).toBe(true);
    expect(() => validateD1RawResultV2({ ...value, rawResultSchemaVersion: "d1-benchmark-result-v1" }, { configHash: value.configHash, executionSourceCommit: value.executionSourceCommit, provenanceHash: value.provenanceHash })).toThrow(/SCHEMA/);
    expect(() => validateD1RawResultV2({ ...value, provenanceHash: "0".repeat(64) }, { configHash: value.configHash, executionSourceCommit: value.executionSourceCommit, provenanceHash: "0".repeat(64) })).toThrow(/HASH/);
  });
});
