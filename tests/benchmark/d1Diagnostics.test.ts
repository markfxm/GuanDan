import { describe, expect, it } from "vitest";
import { aggregateD1Diagnostics, assertD1DiagnosticsPrivacy } from "./d1Diagnostics";

describe("D1 diagnostics aggregation", () => {
  it("reports explicit numerators and denominators without debug breakdown", () => {
    const result = aggregateD1Diagnostics([{ strategicSwitch: true, forcedSwitch: false, suppressed: false, returnSwitch: false }, { strategicSwitch: false, forcedSwitch: true, suppressed: true, returnSwitch: true, diagnosticsError: true }]);
    expect(result).toMatchObject({ strategicSwitches: 1, strategicDecisionCount: 2, forcedSwitches: 1, forcedDecisionCount: 2, suppressions: 1, suppressionDecisionCount: 2, returnSwitches: 1, returnDecisionCount: 2, diagnosticsErrorCount: 1, debugIncluded: false });
  });
  it("rejects hidden state and decision-level debug in report aggregation", () => {
    expect(() => assertD1DiagnosticsPrivacy({ hands: {} })).toThrow(/PRIVACY/);
    expect(() => assertD1DiagnosticsPrivacy({ planScoreBreakdown: {} })).toThrow(/PRIVACY/);
  });
});
