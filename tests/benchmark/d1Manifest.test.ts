import { describe, expect, it } from "vitest";
import { buildD1Manifest, validateResumeManifest } from "./d1Manifest";

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
});
