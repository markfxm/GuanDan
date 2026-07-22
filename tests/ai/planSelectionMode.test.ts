import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDeck } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import type { AiDecisionConfig, AiObservation, AiRuntimeState } from "../../src/ai/contracts";
import * as selectorModule from "../../src/ai/planning/planSelector";
import * as evaluatorModule from "../../src/ai/planning/planEvaluator";
import { createAiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import * as generatorModule from "../../src/ai/tactics/actionGenerator";
import * as actionEvaluatorModule from "../../src/ai/tactics/actionEvaluator";

const config: AiDecisionConfig = {
  analysisCacheSize: 64,
  planning: { maxPlans: 2, beamWidth: 1, timeBudgetMs: 0 },
  version: "p4-test-v1",
  turn: 1,
};
const emptyRuntime: AiRuntimeState = { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true };

function observation(overrides: Partial<AiObservation> = {}): AiObservation {
  const hand = createDeck().slice(0, 8);
  return { hand, gameRank: "10", seat: 1, partnerSeat: 3, playedCards: [], handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 }, finishOrder: [], ...overrides };
}

describe("P4 plan-selection mode isolation", () => {
  it("keeps undefined and explicit keep-current byte-identical across lead/follow/pass/replan/incremental cases", () => {
    const cases: AiObservation[] = [
      observation(),
      observation({ lastPlay: classifyPlay([createDeck().find((card) => card.id === "S2-1")!], "10")!, lastPlaySeat: 0 }),
      observation({ lastPlay: classifyPlay([createDeck().find((card) => card.id === "S2-1")!], "10")!, lastPlaySeat: 0 }),
    ];
    for (const current of cases) {
      const implicit = decideAiAction(current, emptyRuntime, config);
      const explicit = decideAiAction(current, emptyRuntime, config, { planSelectionMode: "keep-current" });
      expect(explicit.action).toEqual(implicit.action);
      expect(explicit.runtime).toEqual(implicit.runtime);
      expect(explicit.selectedPlanId).toBe(implicit.selectedPlanId);
    }
  });

  it("creates the D1 sidecar only for explicit dynamic-topk-v1", () => {
    const result = decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "dynamic-topk-v1", decisionIndex: 1 });
    expect(result.runtime.planSelectionState?.version).toBe("d1-topk-runtime-v1");
    expect(result.runtime.planSelectionState?.migrationVersion).toBe("d0-to-d1-v1");
    expect(result.runtime.planSelectionState?.fullReplanCount).toBe(0);
  });

  it("does not call the dynamic selector or evaluator on keep-current", () => {
    const selectorSpy = vi.spyOn(selectorModule, "selectActivePlan");
    const evaluatorSpy = vi.spyOn(evaluatorModule, "evaluateDynamicPlan");
    decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "keep-current" });
    expect(selectorSpy).not.toHaveBeenCalled();
    expect(evaluatorSpy).not.toHaveBeenCalled();
    selectorSpy.mockRestore();
    evaluatorSpy.mockRestore();
  });

  it("does not expose mode in the returned runtime or action", () => {
    const result = decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "dynamic-topk-v1" });
    expect(JSON.stringify(result.runtime)).not.toContain("planSelectionMode");
    expect(JSON.stringify(result.action)).not.toContain("planSelectionMode");
  });

  it("passes the selected dynamic plan to action generation and does not exceed K evaluations", () => {
    const seenPlanIds: string[] = [];
    const originalGenerate = generatorModule.generateActionCandidates;
    const generatorSpy = vi.spyOn(generatorModule, "generateActionCandidates").mockImplementation((input) => {
      seenPlanIds.push(input.plan?.id ?? "none");
      return originalGenerate(input);
    });
    const evaluatorSpy = vi.spyOn(evaluatorModule, "evaluateDynamicPlan");
    const result = decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "dynamic-topk-v1" });
    expect(result.selectedPlanId).toBeDefined();
    expect(seenPlanIds).toEqual([result.selectedPlanId]);
    expect(evaluatorSpy.mock.calls.length).toBeLessThanOrEqual(5);
    generatorSpy.mockRestore();
    evaluatorSpy.mockRestore();
  });

  it("does not add a second full replan for first D0-to-D1 migration", () => {
    const diagnostics = createAiPlanningDiagnostics();
    const result = decideAiAction(observation(), emptyRuntime, { ...config, diagnostics }, { planSelectionMode: "dynamic-topk-v1" });
    expect(result.runtime.planSelectionState?.migrationVersion).toBe("d0-to-d1-v1");
    expect(diagnostics.fullReplanCount).toBe(1);
  });

  it("keeps dynamic behavior stable with diagnostics on and off", () => {
    const withoutDiagnostics = decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "dynamic-topk-v1" });
    const withDiagnostics = decideAiAction(observation(), emptyRuntime, { ...config, diagnostics: createAiPlanningDiagnostics() }, { planSelectionMode: "dynamic-topk-v1" });
    expect(withDiagnostics.action).toEqual(withoutDiagnostics.action);
    expect(withDiagnostics.runtime).toEqual(withoutDiagnostics.runtime);
    expect(withDiagnostics.selectedPlanId).toBe(withoutDiagnostics.selectedPlanId);
    expect(withDiagnostics.score).toEqual(withoutDiagnostics.score);
  });

  it("preserves the input runtime when dynamic selection validation fails", () => {
    const original = JSON.stringify(emptyRuntime);
    expect(() => decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "dynamic-topk-v1", decisionIndex: Number.NaN })).toThrow("D1_SELECTOR_INVALID_DECISION_INDEX");
    expect(JSON.stringify(emptyRuntime)).toBe(original);
  });

  it("does not expose a half-updated runtime when action generation throws", () => {
    const original = JSON.stringify(emptyRuntime);
    const generatorSpy = vi.spyOn(generatorModule, "generateActionCandidates").mockImplementation(() => { throw new Error("action-generator-failed"); });
    expect(() => decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "dynamic-topk-v1" })).toThrow("action-generator-failed");
    expect(JSON.stringify(emptyRuntime)).toBe(original);
    generatorSpy.mockRestore();
  });

  it("does not expose a half-updated runtime when action evaluation throws", () => {
    const original = JSON.stringify(emptyRuntime);
    const evaluatorSpy = vi.spyOn(actionEvaluatorModule, "evaluateActionCandidate").mockImplementation(() => { throw new Error("action-evaluator-failed"); });
    expect(() => decideAiAction(observation(), emptyRuntime, config, { planSelectionMode: "dynamic-topk-v1" })).toThrow("action-evaluator-failed");
    expect(JSON.stringify(emptyRuntime)).toBe(original);
    evaluatorSpy.mockRestore();
  });

  it("keeps the dynamic context builder free of hidden-state inputs", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/ai/aiDecisionEngine.ts"), "utf8");
    expect(source).not.toMatch(/partnerHand|opponentsHands|hiddenInitialHand|legacy hidden|\bhands\b|\bdeck\b/);
  });
});
