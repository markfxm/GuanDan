import { describe, expect, it } from "vitest";
import { buildD1Manifest, buildD1ManifestV2, validateResumeManifest } from "./d1Manifest";
import { buildD1ExecutionProvenance, hashD1ExecutionProvenance } from "./d1ProvenanceV2";
import type { SimulationSummary } from "./simulator";

const commit = "a".repeat(40);

describe("D1 manifest provenance", () => {
  it("requires a full execution source commit", () => {
    expect(() => buildD1Manifest({ phase: "smoke", matchup: "treatment-vs-control", configHash: "cfg", executionSourceCommit: "unknown", expectedMatchIds: ["m1"], completedMatchIds: ["m1"] })).toThrow(/PROVENANCE/);
    expect(buildD1Manifest({ phase: "smoke", matchup: "treatment-vs-control", configHash: "cfg", executionSourceCommit: commit, expectedMatchIds: ["m1"], completedMatchIds: ["m1"] }).executionSourceCommit).toBe(commit);
  });

  it("rejects resume when the execution commit changes", () => {
    const base = buildD1Manifest({ phase: "smoke", matchup: "treatment-vs-control", configHash: "cfg", executionSourceCommit: commit, expectedMatchIds: ["m1"], completedMatchIds: ["m1"] });
    expect(() => validateResumeManifest(base, { ...base, executionSourceCommit: "b".repeat(40) })).toThrow(/EXECUTION_SOURCE_COMMIT/);
  });

  it("marks a dynamic batch invalid when diagnostics or provenance are missing", () => {
    const commit = "a".repeat(40);
    const descriptor = { id: "unified-d1-topk-switch", implementationVersion: "dynamic-topk-v1", configHash: "c", sourceCommit: commit, candidatePolicy: "production-policy" as const, mode: "dynamic-topk-v1" as const };
    const provenance = buildD1ExecutionProvenance({ executionSourceCommit: commit, configHash: "cfg", phase: "calibration", seedStart: 221, seedEnd: 221, strategyDescriptors: [descriptor] });
    const game = { matchId: "m1", configHash: "cfg", seed: 221, rank: "2", rotation: 0, allocation: "AB", strategiesBySeat: { 0: descriptor.id, 1: descriptor.id, 2: descriptor.id, 3: descriptor.id }, finishOrder: [0, 1, 2, 3], winnerTeam: 0, teamScore: { 0: 1, 1: 0 }, actionCount: 1, publicTraceHash: "h", finalPublicStateHash: "f", durationMs: 1, executionSourceCommit: commit, completed: true, failed: false, errors: [], errorCounters: { total: 0, strategyErrors: 0, runtimeErrors: 0, illegalActions: 0, engineErrors: 0, guardErrors: 0 }, publicEvents: [], d1Diagnostics: undefined } as unknown as SimulationSummary;
    expect(() => buildD1ManifestV2({ phase: "calibration", matchup: "treatment-vs-control", configHash: "cfg", expectedMatchIds: ["m1"], games: [game], executionProvenance: provenance, provenanceHash: hashD1ExecutionProvenance(provenance), strategyDescriptors: [descriptor], replayMode: "all" })).toThrow("D1_BATCH_INTEGRITY_FAILED");
  });
});
