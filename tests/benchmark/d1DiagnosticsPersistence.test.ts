import { describe, expect, it } from "vitest";
import { aggregatePersistedD1Diagnostics, type PersistedD1Diagnostics } from "./d1DiagnosticsPersistence";

describe("D1 diagnostics persistence", () => {
  it("aggregates numerator and denominator across games instead of averaging rates", () => {
    const first: PersistedD1Diagnostics = {
      schemaVersion: "d1-plan-selection-diagnostics-v1",
      applicable: true,
      totals: {
        dynamicDecisionDenominator: 2,
        forcedSwitchCount: 1,
        strategicSwitchCount: 0,
        suppressedStrategicDecisionCount: 1,
        strategicConsiderationDenominator: 2,
        strategicSwitchDenominator: 1,
        recentStrategicReturnSwitchCount: 0,
        tieKeptActiveCount: 0,
      },
      reasonCounts: {},
      candidateCountSummary: { count: 0, min: null, max: null, mean: null, p50: null, p95: null },
      decisionIndicesSinceLastSwitchSummary: { count: 0, min: null, max: null, mean: null, p50: null, p95: null },
    };
    const second = { ...first, totals: { ...first.totals, dynamicDecisionDenominator: 8, forcedSwitchCount: 1, suppressedStrategicDecisionCount: 0, strategicConsiderationDenominator: 8, strategicSwitchDenominator: 2 } };
    const aggregate = aggregatePersistedD1Diagnostics([first, second]);
    expect(aggregate.rates.forcedSwitchRate).toEqual({ numerator: 2, denominator: 10, rate: 0.2 });
    expect(aggregate.rates.switchSuppressionRate).toEqual({ numerator: 1, denominator: 10, rate: 0.1 });
    expect(aggregate.rates.AToBToARate).toEqual({ numerator: 0, denominator: 3, rate: 0 });
  });

  it("uses an explicit non-applicable schema for control games", () => {
    const aggregate = aggregatePersistedD1Diagnostics([{ applicable: false, schemaVersion: "d1-plan-selection-diagnostics-v1" }]);
    expect(aggregate.totals.dynamicDecisionDenominator).toBe(0);
    expect(aggregate.rates.forcedSwitchRate.rate).toBeNull();
  });
});
