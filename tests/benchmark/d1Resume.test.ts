import { describe, expect, it } from "vitest";
import { canSkipExisting, validateResumeManifest } from "./d1Manifest";

describe("D1 resume and skip-existing", () => {
  it("only skips a complete safety-valid result with matching provenance", () => {
    const commit = "a".repeat(40);
    const base = { matchId: "m1", configHash: "cfg", implementationVersion: "impl", executionSourceCommit: commit, completed: true, failed: false, durationMs: 1, diagnosticsError: false, publicTraceHash: "h", replayVerified: true };
    expect(canSkipExisting(base, { configHash: "cfg", implementationVersion: "impl", executionSourceCommit: commit, replayMode: "all" })).toBe(true);
    expect(canSkipExisting({ ...base, failed: true }, { configHash: "cfg", implementationVersion: "impl", replayMode: "all" })).toBe(false);
    expect(canSkipExisting(base, { configHash: "other", implementationVersion: "impl", replayMode: "all" })).toBe(false);
  });

  it("rejects merging batches with config drift or missing IDs", () => {
    const base = { schemaVersion: "d1-manifest-v1" as const, phase: "formal", matchup: "treatment-vs-control", configHash: "a", executionSourceCommit: "a".repeat(40), expectedMatchIds: ["m1"], completedMatchIds: ["m1"], resumeSupported: true as const, skipExistingSupported: true as const };
    expect(() => validateResumeManifest(base, { ...base, configHash: "b" })).toThrow(/CONFIG_HASH/);
    expect(() => validateResumeManifest({ ...base, completedMatchIds: [] }, base)).toThrow(/MISSING/);
  });
});
