import { simulateUnifiedRooms } from "../../scripts/unifiedAiSimulation";

it("reports zero safety counters for a completed fixed unified simulation", () => {
  const summary = simulateUnifiedRooms([1], 1000, { diagnostics: true });
  const result = summary.results[0]!;

  expect(result.completed).toBe(true);
  expect(result.illegalActionCount).toBe(0);
  expect(result.policyViolationCount).toBe(0);
  expect(result.runtimePlanMismatchCount).toBe(0);
  expect(result.planCandidateValidationCount).toBeGreaterThan(0);
});
