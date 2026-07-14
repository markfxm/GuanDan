import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyPlay } from "../../src/game/playRules";
import { createDeck } from "../../src/engine/cards";
import type { CardGroup } from "../../src/engine/groups";
import type { HandPlan } from "../../src/ai/contracts";
import type { D1PlanSelectionState } from "../../src/ai/runtimeContracts";
import type { PlanSelectionContext } from "../../src/ai/planning/planSelectionContracts";
import { selectActivePlan, type PlanValidation, type SelectorScore } from "../../src/ai/planning/planSelector";

const deck = createDeck();
const card = (id: string) => deck.find((value) => value.id === id)!;
const single = (id: string): CardGroup => classifyPlay([card(id)], "10")!;

function plan(id: string, ids: string[], staticPlanQuality = 1): HandPlan {
  const groups = ids.map((id) => single(id));
  return {
    id,
    groups,
    metrics: {
      hardViolations: 0,
      protectionLoss: 0,
      estimatedTurns: groups.length,
      lowSingleCount: groups.length,
      retainedControl: 0,
      wildcardFlexibility: 0,
      responseCoverage: 0,
      leadFlexibility: groups.length,
      fallbackScore: staticPlanQuality,
    },
  };
}

function context(candidates: readonly HandPlan[]): PlanSelectionContext {
  return {
    seat: 0,
    partnerSeat: 2,
    gameRank: "10",
    hand: candidates[0]?.groups.flatMap((group) => group.cards) ?? [],
    handCount: candidates[0]?.groups.flatMap((group) => group.cards).length ?? 0,
    playedCards: [],
    handCounts: { 0: candidates[0]?.groups.length ?? 0, 1: 6, 2: 7, 3: 4 },
    finishOrder: [],
    candidatePlans: candidates,
    runtime: { candidatePlans: [...candidates], generatedTurn: 0, configVersion: "d1", needsReplan: false },
  };
}

function state(activePlanId: string, identities: Record<string, { planFamilyId: string; rootPlanId?: string; lineageId?: string }>): D1PlanSelectionState {
  return {
    version: "d1-topk-runtime-v1",
    activePlanId,
    activePlanFamilyId: identities[activePlanId]?.planFamilyId,
    planSwitchCount: 0,
    fullReplanCount: 0,
    recentStrategicPlanFamilyIds: [],
    planIdentityById: Object.fromEntries(Object.entries(identities).map(([id, value]) => [id, {
      rootPlanId: value.rootPlanId ?? `${id}-root`,
      planFamilyId: value.planFamilyId,
      lineageId: value.lineageId ?? `${id}-lineage`,
    }])),
  };
}

function scoreMap(values: Record<string, number>, staticValues: Record<string, number> = {}): (plan: HandPlan, context: PlanSelectionContext) => SelectorScore {
  return (candidate) => ({
    planId: candidate.id,
    total: values[candidate.id] ?? 0,
    staticPlanQuality: staticValues[candidate.id] ?? candidate.metrics.fallbackScore,
    remainingGroupCount: candidate.groups.length,
    powerGroupRisk: candidate.metrics.protectionLoss,
  });
}

const valid: (plan: HandPlan, context: PlanSelectionContext) => PlanValidation = (candidate) => ({ valid: candidate.metrics.hardViolations === 0 });
const constants = { k: 5, minimumScoreDelta: 10, cooldownDecisionIndices: 3, recentFamilyWindow: 8 };

describe("pure D1 plan selector", () => {
  it("evaluates active plus K-1 static challengers and does not prioritize active before scoring", () => {
    const candidates = [
      plan("active", ["S5-1"], 1),
      ...["c1", "c2", "c3", "c4", "c5"].map((id, index) => plan(id, ["C" + (index + 4) + "-1"], 10 - index)),
    ];
    const calls: string[] = [];
    const result = selectActivePlan({
      context: context(candidates),
      candidates,
      activePlanId: "active",
      state: state("active", Object.fromEntries(candidates.map((candidate) => [candidate.id, { planFamilyId: candidate.id }]))),
      decisionIndex: 4,
      constants,
      validatePlan: valid,
      evaluatePlan: (candidate, value) => { calls.push(`${candidate.id}:${value.seat}`); return scoreMap({ active: 100, c1: 111, c2: 120, c3: 119, c4: 118, c5: 117 })(candidate, value); },
    });
    expect(result.selectedPlanId).toBe("c2");
    expect(calls).toHaveLength(5);
    expect(calls.map((value) => value.split(":")[0])).toEqual(["active", "c1", "c2", "c3", "c4"]);
  });

  it("is invariant to candidate input permutation and uses stable challenger tie-breaks", () => {
    const candidates = [plan("active", ["S5-1"]), plan("b", ["C6-1"], 3), plan("a", ["H7-1"], 3), plan("c", ["D8-1"], 3)];
    const make = (items: HandPlan[]) => selectActivePlan({
      context: context(items), candidates: items, activePlanId: "active", state: state("active", Object.fromEntries(items.map((candidate) => [candidate.id, { planFamilyId: candidate.id }]))), decisionIndex: 1, constants: { ...constants, minimumScoreDelta: 0 }, validatePlan: valid,
      evaluatePlan: scoreMap({ active: 100, a: 120, b: 120, c: 120 }, { a: 5, b: 5, c: 4 }),
    });
    expect(make(candidates).selectedPlanId).toBe("a");
    expect(make([...candidates].reverse()).selectedPlanId).toBe("a");
  });

  it("keeps a valid pass-only active plan in strategic comparison", () => {
    const candidates = [plan("active", ["S4-1"]), plan("challenger", ["S9-1"], 2)];
    const result = selectActivePlan({ context: context(candidates), candidates, activePlanId: "active", state: state("active", { active: { planFamilyId: "A" }, challenger: { planFamilyId: "B" } }), decisionIndex: 1, constants, validatePlan: valid, evaluatePlan: scoreMap({ active: 100, challenger: 111 }) });
    expect(result.reason).toBe("strategic-switch");
    expect(result.selectedPlanId).toBe("challenger");
  });

  it("forces the best valid candidate for each structural invalidity without threshold or cooldown", () => {
    const candidates = [plan("active", ["S5-1"]), plan("good", ["S9-1"], 3), plan("other", ["S8-1"], 2)];
    for (const reason of ["forced-missing", "forced-incomplete", "forced-policy", "forced-illegal-group", "forced-structural-invalid"] as const) {
      const result = selectActivePlan({ context: context(candidates), candidates, activePlanId: "active", state: { ...state("active", { active: { planFamilyId: "A" }, good: { planFamilyId: "B" }, other: { planFamilyId: "C" } }), lastAnyPlanSwitchDecisionIndex: 3 }, decisionIndex: 4, constants, validatePlan: (candidate) => candidate.id === "active" ? { valid: false, reason } : { valid: true }, evaluatePlan: scoreMap({ active: 100, good: 101, other: 99 }) });
      expect(result.reason).toBe(reason);
      expect(result.selectedPlanId).toBe("good");
      expect(result.state?.lastAnyPlanSwitchDecisionIndex).toBe(4);
      expect(result.state?.recentStrategicPlanFamilyIds).toEqual([]);
    }
  });

  it.each([
    [undefined, 0, false],
    [4, 4, true],
    [4, 5, true],
    [4, 6, true],
    [4, 7, false],
  ])("applies the seat-local cooldown boundary (%s -> %s)", (lastIndex, decisionIndex, suppressed) => {
    const candidates = [plan("active", ["S5-1"]), plan("challenger", ["S9-1"], 2)];
    const current = state("active", { active: { planFamilyId: "A" }, challenger: { planFamilyId: "B" } });
    if (lastIndex !== undefined) current.lastAnyPlanSwitchDecisionIndex = lastIndex;
    const result = selectActivePlan({ context: context(candidates), candidates, activePlanId: "active", state: current, decisionIndex, constants, validatePlan: valid, evaluatePlan: scoreMap({ active: 100, challenger: 120 }) });
    expect(result.reason).toBe(suppressed ? "cooldown-suppressed" : "strategic-switch");
  });

  it("uses 2x minimum delta for a recent family but allows equality", () => {
    const candidates = [plan("b", ["S5-1"]), plan("a", ["S9-1"], 2)];
    const current = state("b", { b: { planFamilyId: "B" }, a: { planFamilyId: "A" } });
    current.recentStrategicPlanFamilyIds = ["A"];
    const make = (delta: number) => selectActivePlan({ context: context(candidates), candidates, activePlanId: "b", state: current, decisionIndex: 10, constants, validatePlan: valid, evaluatePlan: scoreMap({ b: 100, a: 100 + delta }) });
    expect(make(19).reason).toBe("hysteresis-suppressed");
    expect(make(20).reason).toBe("strategic-switch");
    expect(make(21).reason).toBe("strategic-switch");
  });

  it("returns replan-required without mutating state when no valid plan exists", () => {
    const candidates = [plan("active", ["S5-1"]), plan("bad", ["S9-1"])] as const;
    const current = state("active", { active: { planFamilyId: "A" }, bad: { planFamilyId: "B" } });
    const before = JSON.stringify(current);
    const result = selectActivePlan({ context: context(candidates), candidates, activePlanId: "active", state: current, decisionIndex: 1, constants, validatePlan: () => ({ valid: false, reason: "forced-policy" }), evaluatePlan: scoreMap({ active: 100, bad: 200 }) });
    expect(result.reason).toBe("replan-required");
    expect(JSON.stringify(current)).toBe(before);
  });

  it("keeps the selector independent from planning/search and hidden-state modules", () => {
    const source = readFileSync("src/ai/planning/planSelector.ts", "utf8");
    expect(source).not.toMatch(/partnerHand|opponentsHands|hiddenInitialHand|legacy hidden|\bhands\b|\bdeck\b|HandPlanner|analyzeHand|detectGroups|room|benchmark/);
  });
});
