import { describe, expect, it } from "vitest";
import { deriveD1ConfigHash } from "./d1Provenance";

describe("D1 config hash provenance", () => {
  it("changes when only executionSourceCommit changes", () => {
    const common = { requestedConfigHash: "cfg", benchmarkVersion: "d1-topk-v1", rank: "2", phase: "smoke", replayMode: "failures" } as const;
    const first = deriveD1ConfigHash({ ...common, executionSourceCommit: "a".repeat(40) as never });
    const second = deriveD1ConfigHash({ ...common, executionSourceCommit: "b".repeat(40) as never });
    expect(first).not.toBe(second);
  });
});
