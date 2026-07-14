import { describe, expect, it } from "vitest";
import { updatePlanSwitchHistory } from "../../src/ai/planning/planIdentity";
import type { D1PlanSelectionState } from "../../src/ai/runtimeContracts";

const state = (): D1PlanSelectionState => ({
  version: "d1-topk-runtime-v1",
  planSwitchCount: 0,
  fullReplanCount: 0,
  recentStrategicPlanFamilyIds: [],
  planIdentityById: {},
});

describe("P1 strategic switch history", () => {
  it("updates strategic history only for actual strategic switches", () => {
    const next = updatePlanSwitchHistory(state(), { kind: "strategic", decisionIndex: 4, fromFamilyId: "family-A", toFamilyId: "family-B" });
    expect(next.lastAnyPlanSwitchDecisionIndex).toBe(4);
    expect(next.planSwitchCount).toBe(1);
    expect(next.recentStrategicPlanFamilyIds).toEqual(["family-A"]);
  });

  it("updates lastAny for forced but never recent strategic history", () => {
    const next = updatePlanSwitchHistory(state(), { kind: "forced", decisionIndex: 7, fromFamilyId: "family-A", toFamilyId: "family-B" });
    expect(next.lastAnyPlanSwitchDecisionIndex).toBe(7);
    expect(next.planSwitchCount).toBe(1);
    expect(next.recentStrategicPlanFamilyIds).toEqual([]);
  });

  it("does not update either history for suppression, tie, or keep", () => {
    for (const kind of ["cooldown-suppressed", "hysteresis-suppressed", "tie", "keep"] as const) {
      expect(updatePlanSwitchHistory(state(), { kind, decisionIndex: 9, fromFamilyId: "family-A", toFamilyId: "family-B" })).toEqual(state());
    }
  });

  it("tracks A-to-B-to-A by family IDs, not plan IDs", () => {
    const afterB = updatePlanSwitchHistory(state(), { kind: "strategic", decisionIndex: 1, fromFamilyId: "family-A", toFamilyId: "family-B" });
    const afterA = updatePlanSwitchHistory(afterB, { kind: "strategic", decisionIndex: 2, fromFamilyId: "family-B", toFamilyId: "family-A" });
    expect(afterA.recentStrategicPlanFamilyIds).toEqual(["family-A", "family-B"]);
    expect(afterA.recentStrategicPlanFamilyIds).not.toContain("plan-A-previous-id");
  });
});
