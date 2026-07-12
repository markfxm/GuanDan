import { aiDecisionScenarios } from "../fixtures/aiDecisionScenarios";
import { compareLegacyAndUnifiedDecision } from "../helpers/aiDecisionShadowHarness";

it("classifies a fixed 27-scenario legacy and unified shadow corpus", () => {
  expect(aiDecisionScenarios).toHaveLength(27);
  const comparisons = aiDecisionScenarios.map(compareLegacyAndUnifiedDecision);
  const counts = comparisons.reduce<Record<string, number>>((result, comparison) => ({ ...result, [comparison.classification]: (result[comparison.classification] ?? 0) + 1 }), {});
  console.info("AI decision shadow summary", JSON.stringify(counts));
  for (const comparison of comparisons) {
    expect(comparison.runtimeMutated, comparison.scenarioId).toBe(false);
    expect(comparison.classification, `${comparison.scenarioId}: ${comparison.details.join(" ")}`).not.toMatch(/ENGINE_ERROR|UNIFIED_ILLEGAL|POLICY_MISMATCH|PLAN_MISMATCH|NON_DETERMINISTIC/);
    expect(comparison.unifiedLegal, comparison.scenarioId).toBe(true);
    expect(comparison.unifiedPolicyVerdict.allowed, comparison.scenarioId).toBe(true);
    expect(comparison.unifiedDecision.consideredActions, comparison.scenarioId).toBeGreaterThan(0);
    expect(comparison.unifiedDecision.score.total).toBe(Object.values(comparison.unifiedDecision.score.components).reduce((sum, value) => sum + value, 0));
  }
  for (const id of ["runtime-polluted-active-plan", "runtime-hand-key-changed", "runtime-budget-fallback"]) {
    const comparison = comparisons.find((item) => item.scenarioId === id)!;
    expect(comparison.unifiedDecision.selectedPlanId, id).not.toBe("polluted");
    expect(comparison.unifiedDecision.runtime.candidatePlans[0]?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort(), id)
      .toEqual(aiDecisionScenarios.find((item) => item.id === id)!.observation.hand.map((card) => card.id).sort());
  }
});
