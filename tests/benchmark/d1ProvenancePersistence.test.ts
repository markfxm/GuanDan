import { describe, expect, it } from "vitest";
import { buildD1ExecutionProvenance, hashD1ExecutionProvenance, type D1ExecutionProvenanceV1 } from "./d1ProvenanceV2";

describe("D1 execution provenance persistence", () => {
  it("creates a canonical provenance hash from frozen execution metadata", () => {
    const provenance = buildD1ExecutionProvenance({
      executionSourceCommit: "a".repeat(40),
      configHash: "c".repeat(64),
      phase: "calibration",
      seedStart: 221,
      seedEnd: 270,
      strategyDescriptors: [],
    });
    expect(provenance.schemaVersion).toBe("d1-execution-provenance-v1");
    expect(hashD1ExecutionProvenance(provenance)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashD1ExecutionProvenance({ ...provenance, phase: "smoke" } as D1ExecutionProvenanceV1)).not.toBe(hashD1ExecutionProvenance(provenance));
  });
});
