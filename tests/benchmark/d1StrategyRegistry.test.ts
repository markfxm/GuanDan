import { describe, expect, it } from "vitest";
import { getStrategy } from "./strategies";

describe("D1 benchmark strategy registry", () => {
  it("keeps control D0 and exposes treatment only in benchmark adapters", () => {
    expect(getStrategy("unified-current").mode).toBe("keep-current");
    expect(getStrategy("unified-d1-topk-switch").mode).toBe("dynamic-topk-v1");
    expect(getStrategy("unified-current").behaviorBaselineTag).toBe("ai-benchmark-d0-baseline");
  });
});
