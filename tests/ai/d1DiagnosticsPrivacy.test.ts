import { describe, expect, it } from "vitest";
import {
  assertD1DiagnosticsPrivacy,
  serializeD1PlanSelectionDebug,
  type D1PlanSelectionDebugRecord,
} from "../../src/ai/diagnostics/aiPlanningDiagnostics";

const allowed: D1PlanSelectionDebugRecord = {
  decisionIndex: 3,
  seat: 1,
  publicTrick: { lastPlayStableKey: "single:S2-1", lastPlaySeat: 0, partnerPassedCurrentTrick: false },
  candidatePlanIds: ["plan-a", "plan-b"],
  planFamilyIds: ["family-a", "family-b"],
  scoreBreakdown: { staticPlanQuality: 12, immediatePlayability: 15, total: 27 },
  scoreDelta: 4,
  requiredDelta: 6,
  reason: "strategic-score",
  selectedPlanId: "plan-b",
  runtimeSidecar: { activePlanId: "plan-b", previousPlanId: "plan-a", planSwitchCount: 1 },
};

describe("D1 diagnostics privacy", () => {
  it("keeps debug-plan-selection disabled by default and does not emit records", () => {
    expect(serializeD1PlanSelectionDebug([allowed], false)).toBeUndefined();
  });

  it("serializes only the explicit debug-plan-selection allowlist", () => {
    const output = serializeD1PlanSelectionDebug([allowed], true);
    expect(output).toContain("debug-plan-selection");
    expect(output).toContain("scoreDelta");
    expect(output).toContain("selectedPlanId");
    expect(output).not.toContain("groups");
    expect(output).not.toContain("candidatePlans");
    expect(output).not.toContain("duration");
  });

  it.each([
    "partnerHand", "opponentsHands", "opponentHands", "hands", "allHands", "deck", "remainingDeck",
    "hiddenInitialHand", "hiddenState", "initialHands", "legacyHiddenState",
  ])("rejects forbidden key %s recursively", (key) => {
    expect(() => assertD1DiagnosticsPrivacy({ nested: [{ [key]: [] }] })).toThrow("D1_DIAGNOSTICS_PRIVACY_VIOLATION");
    expect(() => serializeD1PlanSelectionDebug([{ ...allowed, runtimeSidecar: { [key]: [] } } as D1PlanSelectionDebugRecord], true)).toThrow("D1_DIAGNOSTICS_PRIVACY_VIOLATION");
  });

  it("rejects forbidden-key variants case-insensitively and with separators", () => {
    expect(() => assertD1DiagnosticsPrivacy({ PARTNER_HAND: [] })).toThrow("D1_DIAGNOSTICS_PRIVACY_VIOLATION");
    expect(() => assertD1DiagnosticsPrivacy({ hidden_state: {} })).toThrow("D1_DIAGNOSTICS_PRIVACY_VIOLATION");
  });

  it("does not silently produce partial output after privacy failure", () => {
    const bad = { ...allowed, runtimeSidecar: { deck: ["S2-1"] } } as D1PlanSelectionDebugRecord;
    expect(() => serializeD1PlanSelectionDebug([bad], true)).toThrow("D1_DIAGNOSTICS_PRIVACY_VIOLATION");
  });

  it("rejects non-finite debug score values", () => {
    expect(() => serializeD1PlanSelectionDebug([{ ...allowed, scoreDelta: Number.NaN }], true)).toThrow("D1_DIAGNOSTICS_NON_FINITE_DEBUG");
  });
});
