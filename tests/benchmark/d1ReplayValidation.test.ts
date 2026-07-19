import { describe, expect, it } from "vitest";
import { validateD1RawResultV2, validateD1Replay, validateReplaySet } from "./d1ReplayValidation";
import { buildD1ExecutionProvenance, hashD1ExecutionProvenance } from "./d1ProvenanceV2";

const replay = () => ({
  schemaVersion: "1", replayVersion: "d1-replay-v1", benchmarkVersion: "d1-topk-v1", engineVersion: "engine-v1", roomRulesVersion: "rules-v1", configHash: "cfg", matchId: "m1", seed: 201, rotation: 0, allocation: "AB", rank: "2", strategiesBySeat: { 0: "a", 1: "b", 2: "a", 3: "b" }, strategyDescriptors: [], publicEvents: [], handCountChanges: [], trickEvents: [], tributeEvents: [], finishOrder: [0, 1, 2, 3], winnerTeam: 0, teamScore: { 0: 1, 1: 0 }, deterministicRandom: {
    randomAlgorithmVersion: "random-v1",
    strategySeedDerivationVersion: "strategy-seed-v1",
    baseSeed: 201,
    perSeatDerivedSeed: { 0: "seed-0", 1: "seed-1", 2: "seed-2", 3: "seed-3" },
    strategyVersionsBySeat: { 0: "v1", 1: "v1", 2: "v1", 3: "v1" },
    candidateOrderingVersion: "candidate-v1",
    decisionIndexSemantics: "decision-index-v1",
  }, actionCount: 0, publicTraceHash: "", finalPublicStateHash: "",
});

const requiredReplayFields = [
  "schemaVersion", "replayVersion", "benchmarkVersion", "engineVersion", "roomRulesVersion", "configHash", "matchId", "seed", "rank", "rotation", "allocation", "strategiesBySeat", "strategyDescriptors", "deterministicRandom", "publicEvents", "handCountChanges", "trickEvents", "tributeEvents", "finishOrder", "winnerTeam", "teamScore", "actionCount", "publicTraceHash", "finalPublicStateHash",
] as const;

describe("D1 replay validation", () => {
  it("rejects hidden state and missing provenance instead of skipping", () => {
    expect(validateD1Replay(replay())).toBe(true);
    expect(() => validateD1Replay({ ...replay(), hands: { 0: [] } })).toThrow(/HIDDEN_STATE|PRIVACY/);
    expect(() => validateD1Replay({ ...replay(), strategyDescriptors: undefined })).toThrow(/PROVENANCE/);
  });

  it("rejects missing and undefined required replay fields", () => {
    for (const field of requiredReplayFields) {
      const missing = replay();
      delete (missing as Record<string, unknown>)[field];
      expect(() => validateD1Replay(missing)).toThrow(`PROVENANCE_MISSING:${field}`);
      expect(() => validateD1Replay({ ...replay(), [field]: undefined })).toThrow(`PROVENANCE_MISSING:${field}`);
    }
  });

  it("rejects invalid rank values while accepting a valid rank", () => {
    expect(validateD1Replay(replay())).toBe(true);
    expect(() => validateD1Replay({ ...replay(), rank: null })).toThrow("D1_REPLAY_RANK_INVALID");
    expect(() => validateD1Replay({ ...replay(), rank: "" })).toThrow("D1_REPLAY_RANK_INVALID");
    expect(() => validateD1Replay({ ...replay(), rank: "invalid-rank" })).toThrow("D1_REPLAY_RANK_INVALID");
  });

  it("accepts contract allocation and winner team values", () => {
    expect(validateD1Replay(replay())).toBe(true);
    expect(validateD1Replay({ ...replay(), allocation: "BA" })).toBe(true);
    expect(validateD1Replay({ ...replay(), winnerTeam: 0 })).toBe(true);
    expect(validateD1Replay({ ...replay(), winnerTeam: 1 })).toBe(true);
    expect(validateD1Replay({ ...replay(), winnerTeam: null })).toBe(true);
    expect(() => validateD1Replay({ ...replay(), allocation: "AA" })).toThrow("D1_REPLAY_ALLOCATION_INVALID");
    expect(() => validateD1Replay({ ...replay(), allocation: null })).toThrow("D1_REPLAY_ALLOCATION_INVALID");
    const missingWinner = replay();
    delete (missingWinner as Record<string, unknown>).winnerTeam;
    expect(() => validateD1Replay(missingWinner)).toThrow("PROVENANCE_MISSING:winnerTeam");
    expect(() => validateD1Replay({ ...replay(), winnerTeam: undefined })).toThrow("PROVENANCE_MISSING:winnerTeam");
    for (const winnerTeam of [-1, 2, "", "0", false, {}, []]) {
      expect(() => validateD1Replay({ ...replay(), winnerTeam })).toThrow("D1_REPLAY_WINNER_TEAM_INVALID");
    }
  });

  it("fails closed for incomplete or invalid deterministic random provenance", () => {
    const random = replay().deterministicRandom;
    const cases: Record<string, unknown>[] = [
      { ...replay(), deterministicRandom: null },
      { ...replay(), deterministicRandom: [] },
      { ...replay(), deterministicRandom: {} },
      { ...replay(), deterministicRandom: { ...random, randomAlgorithmVersion: "" } },
      { ...replay(), deterministicRandom: { ...random, baseSeed: Number.POSITIVE_INFINITY } },
      { ...replay(), deterministicRandom: { ...random, baseSeed: Number.NaN } },
      { ...replay(), deterministicRandom: { ...random, perSeatDerivedSeed: null } },
      { ...replay(), deterministicRandom: { ...random, perSeatDerivedSeed: [] } },
      { ...replay(), deterministicRandom: { ...random, perSeatDerivedSeed: { ...random.perSeatDerivedSeed, 0: Number.NaN } } },
      { ...replay(), deterministicRandom: { ...random, perSeatDerivedSeed: { ...random.perSeatDerivedSeed, 0: undefined } } },
      { ...replay(), deterministicRandom: { ...random, strategyVersionsBySeat: { ...random.strategyVersionsBySeat, 3: undefined } } },
    ];
    for (const value of cases) expect(() => validateD1Replay(value)).toThrow("PROVENANCE_MISSING:deterministicRandom");
    const missingNested = { ...replay(), deterministicRandom: { ...random } };
    delete (missingNested.deterministicRandom as Record<string, unknown>).randomAlgorithmVersion;
    expect(() => validateD1Replay(missingNested)).toThrow("PROVENANCE_MISSING:deterministicRandom");
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
