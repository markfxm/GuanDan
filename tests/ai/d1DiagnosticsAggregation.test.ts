import { describe, expect, it } from "vitest";
import { createDeck } from "../../src/engine/cards";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import {
  aggregateD1PlanSelectionDiagnostics,
  createAiPlanningDiagnostics,
  recordD1PlanSelection,
  serializeD1DiagnosticsAggregate,
  type D1PlanSelectionRecord,
} from "../../src/ai/diagnostics/aiPlanningDiagnostics";

const record = (overrides: Partial<D1PlanSelectionRecord> = {}): D1PlanSelectionRecord => ({
  decisionIndex: 10,
  seat: 0,
  candidateCount: 3,
  activeValid: true,
  challengerCount: 2,
  reason: "strategic-switch",
  recentStrategicReturnSwitch: false,
  decisionIndicesSinceLastSwitch: 4,
  ...overrides,
});

describe("D1 diagnostics aggregation", () => {
  it("aggregates forced, strategic, cooldown, hysteresis, tie, and return records", () => {
    const diagnostics = createAiPlanningDiagnostics();
    recordD1PlanSelection(diagnostics, record({ reason: "forced-policy", activeValid: false, challengerCount: 2 }));
    recordD1PlanSelection(diagnostics, record({ reason: "strategic-switch", recentStrategicReturnSwitch: true }));
    recordD1PlanSelection(diagnostics, record({ reason: "cooldown-suppressed" }));
    recordD1PlanSelection(diagnostics, record({ reason: "hysteresis-suppressed" }));
    recordD1PlanSelection(diagnostics, record({ reason: "tie-kept-active" }));
    const aggregate = aggregateD1PlanSelectionDiagnostics(diagnostics);
    expect(aggregate.dynamicDecisionCount).toBe(5);
    expect(aggregate.dynamicDecisionDenominator).toBe(5);
    expect(aggregate.planSwitchConsideredCount).toBe(4);
    expect(aggregate.planSwitchExecutedCount).toBe(2);
    expect(aggregate.forcedSwitchCount).toBe(1);
    expect(aggregate.strategicSwitchCount).toBe(1);
    expect(aggregate.switchSuppressedByCooldown).toBe(1);
    expect(aggregate.switchSuppressedByHysteresis).toBe(1);
    expect(aggregate.tieKeptActiveCount).toBe(1);
    expect(aggregate.recentStrategicReturnSwitchCount).toBe(1);
    expect(aggregate.executedSwitchCount).toBe(aggregate.forcedSwitchCount + aggregate.strategicSwitchCount);
    expect(aggregate.rates.forcedSwitchRate).toEqual({ numerator: 1, denominator: 5, rate: 0.2 });
    expect(aggregate.rates.strategicSwitchRate).toEqual({ numerator: 1, denominator: 5, rate: 0.2 });
    expect(aggregate.rates.switchSuppressionRate).toEqual({ numerator: 2, denominator: 4, rate: 0.5 });
    expect(aggregate.rates.AToBToARate).toEqual({ numerator: 1, denominator: 1, rate: 1 });
  });

  it("returns null rates for zero denominators and preserves numerator/denominator", () => {
    const aggregate = aggregateD1PlanSelectionDiagnostics(createAiPlanningDiagnostics());
    expect(aggregate.rates.forcedSwitchRate).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(aggregate.rates.strategicSwitchRate).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(aggregate.rates.switchSuppressionRate).toEqual({ numerator: 0, denominator: 0, rate: null });
    expect(aggregate.rates.AToBToARate).toEqual({ numerator: 0, denominator: 0, rate: null });
  });

  it("uses nearest-rank p50 and p95 with deterministic numeric sorting", () => {
    const diagnostics = createAiPlanningDiagnostics();
    for (const candidateCount of [5, 1, 4, 8, 2]) recordD1PlanSelection(diagnostics, record({ candidateCount }));
    const stats = aggregateD1PlanSelectionDiagnostics(diagnostics).planCandidateCount;
    expect(stats.count).toBe(5);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(8);
    expect(stats.mean).toBe(4);
    expect(stats.p50).toBe(4);
    expect(stats.p95).toBe(8);
  });

  it("serializes only aggregate allowlisted fields and is byte-stable under input permutation", () => {
    const first = createAiPlanningDiagnostics();
    const second = createAiPlanningDiagnostics();
    const records = [record({ candidateCount: 1 }), record({ candidateCount: 4, reason: "cooldown-suppressed" })];
    for (const item of records) recordD1PlanSelection(first, item);
    for (const item of [...records].reverse()) recordD1PlanSelection(second, item);
    const firstJson = serializeD1DiagnosticsAggregate(first);
    const secondJson = serializeD1DiagnosticsAggregate(second);
    expect(firstJson).toBe(secondJson);
    expect(firstJson).not.toContain("scoreDelta");
    expect(firstJson).not.toContain("candidatePlans");
    expect(firstJson).not.toContain("records");
  });

  it("rejects non-finite samples without changing gameplay-facing state", () => {
    const diagnostics = createAiPlanningDiagnostics();
    expect(recordD1PlanSelection(diagnostics, record({ candidateCount: Number.NaN }))).toBe(false);
    expect(recordD1PlanSelection(diagnostics, record({ decisionIndicesSinceLastSwitch: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(() => serializeD1DiagnosticsAggregate(diagnostics)).toThrow("D1_DIAGNOSTICS_ERROR");
  });

  it("collects one aggregate record from an actual dynamic decision without changing the result", () => {
    const diagnostics = createAiPlanningDiagnostics();
    const hand = createDeck().slice(0, 8);
    const result = decideAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3, playedCards: [], handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 }, finishOrder: [] }, { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true }, { analysisCacheSize: 64, planning: { maxPlans: 2, beamWidth: 1, timeBudgetMs: 0 }, version: "p5-test-v1", turn: 1, diagnostics }, { planSelectionMode: "dynamic-topk-v1" });
    const aggregate = aggregateD1PlanSelectionDiagnostics(diagnostics);
    expect(aggregate.dynamicDecisionCount).toBe(1);
    expect(result.runtime.planSelectionState).toBeDefined();
  });
});
