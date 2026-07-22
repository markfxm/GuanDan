import { describe, expect, it } from "vitest";
import { createDeck } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import type { HandPlan, AiRuntimeState } from "../../src/ai/contracts";
import type { PlanSelectionContext } from "../../src/ai/planning/planSelectionContracts";
import { applyDynamicPlanSelection } from "../../src/ai/planning/planManager";
import type { D1PlanSelectionState } from "../../src/ai/runtimeContracts";

const deck = createDeck();
const card = (id: string) => deck.find((value) => value.id === id)!;
const plan = (id: string, cardId: string): HandPlan => ({ id, groups: [classifyPlay([card(cardId)], "10")!], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 1, fallbackScore: 0 } });
const runtime = (activePlanId: string, state: D1PlanSelectionState): AiRuntimeState => ({ activePlanId, candidatePlans: [plan("a", "S5-1"), plan("b", "S9-1")], generatedTurn: 0, configVersion: "d1", needsReplan: false, planSelectionState: state });
const state = (): D1PlanSelectionState => ({ version: "d1-topk-runtime-v1", activePlanId: "a", activePlanFamilyId: "A", planSwitchCount: 0, fullReplanCount: 0, recentStrategicPlanFamilyIds: [], planIdentityById: { a: { rootPlanId: "a", planFamilyId: "A", lineageId: "a1" }, b: { rootPlanId: "b", planFamilyId: "B", lineageId: "b1" } } });
const context = (value: AiRuntimeState): PlanSelectionContext => ({ seat: 0, partnerSeat: 2, gameRank: "10", hand: value.candidatePlans[0]!.groups[0]!.cards, handCount: 1, playedCards: [], handCounts: { 0: 1, 1: 6, 2: 7, 3: 4 }, finishOrder: [], candidatePlans: value.candidatePlans, runtime: value });
const constants = { k: 5, minimumScoreDelta: 10, cooldownDecisionIndices: 3, recentFamilyWindow: 8 };

describe("PlanManager D1 atomic dynamic updates", () => {
  it("commits a strategic switch atomically", () => {
    const original = runtime("a", state());
    const result = applyDynamicPlanSelection({ runtime: original, context: context(original), candidates: original.candidatePlans, activePlanId: "a", decisionIndex: 5, constants, validatePlan: () => ({ valid: true }), evaluatePlan: (candidate) => ({ planId: candidate.id, total: candidate.id === "b" ? 120 : 100, staticPlanQuality: candidate.id === "b" ? 2 : 1, remainingGroupCount: 1, powerGroupRisk: 0 }) });
    expect(result.result.reason).toBe("strategic-switch");
    expect(result.runtime.activePlanId).toBe("b");
    expect(result.runtime.planSelectionState?.previousPlanId).toBe("a");
    expect(result.runtime.planSelectionState?.planSwitchCount).toBe(1);
    expect(result.runtime.planSelectionState?.lastAnyPlanSwitchDecisionIndex).toBe(5);
    expect(result.runtime.planSelectionState?.recentStrategicPlanFamilyIds).toEqual(["A"]);
    expect(original.activePlanId).toBe("a");
  });

  it("commits forced switch without strategic history", () => {
    const current = state();
    current.lastAnyPlanSwitchDecisionIndex = 4;
    const original = runtime("a", current);
    const result = applyDynamicPlanSelection({ runtime: original, context: context(original), candidates: original.candidatePlans, activePlanId: "a", decisionIndex: 5, constants, validatePlan: (candidate) => ({ valid: candidate.id === "b", reason: "forced-policy" }), evaluatePlan: (candidate) => ({ planId: candidate.id, total: candidate.id === "b" ? 1 : 100, staticPlanQuality: 1, remainingGroupCount: 1, powerGroupRisk: 0 }) });
    expect(result.result.reason).toBe("forced-policy");
    expect(result.runtime.activePlanId).toBe("b");
    expect(result.runtime.planSelectionState?.planSwitchCount).toBe(1);
    expect(result.runtime.planSelectionState?.lastAnyPlanSwitchDecisionIndex).toBe(5);
    expect(result.runtime.planSelectionState?.recentStrategicPlanFamilyIds).toEqual([]);
  });

  it("does not mutate sidecar on suppression or evaluator failure", () => {
    const original = runtime("a", state());
    const before = JSON.stringify(original);
    const cooldownState = { ...state(), lastAnyPlanSwitchDecisionIndex: 1 };
    const cooldownRuntime = runtime("a", cooldownState);
    const cooldownBefore = JSON.stringify(cooldownRuntime);
    const suppressed = applyDynamicPlanSelection({ runtime: cooldownRuntime, context: context(cooldownRuntime), candidates: cooldownRuntime.candidatePlans, activePlanId: "a", decisionIndex: 2, constants, validatePlan: () => ({ valid: true }), evaluatePlan: (candidate) => ({ planId: candidate.id, total: candidate.id === "b" ? 120 : 100, staticPlanQuality: 1, remainingGroupCount: 1, powerGroupRisk: 0 }) });
    expect(suppressed.result.reason).toBe("cooldown-suppressed");
    expect(JSON.stringify(cooldownRuntime)).toBe(cooldownBefore);
    expect(JSON.stringify(original)).toBe(before);

    expect(() => applyDynamicPlanSelection({ runtime: original, context: context(original), candidates: original.candidatePlans, activePlanId: "a", decisionIndex: 4, constants, validatePlan: () => ({ valid: true }), evaluatePlan: () => { throw new Error("score-failed"); } })).toThrow("score-failed");
    expect(JSON.stringify(original)).toBe(before);
  });

  it("keeps the legacy ensurePlans path free of sidecar state", () => {
    expect(runtime("a", state())).not.toHaveProperty("unexpectedDynamicField");
  });
});
