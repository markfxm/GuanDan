import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AiRuntimeState } from "../../src/ai/contracts";
import type { D1PlanSelectionState, PlanSelectionMode } from "../../src/ai/runtimeContracts";
import type { PlanSelectionContext, PlanSelectionResult } from "../../src/ai/planning/planSelectionContracts";

const aiRoot = path.resolve(process.cwd(), "src/ai");

describe("P1 plan-selection contracts", () => {
  it("keeps dependency direction below planning", () => {
    const contracts = fs.readFileSync(path.join(aiRoot, "contracts.ts"), "utf8");
    const runtimeContracts = fs.readFileSync(path.join(aiRoot, "runtimeContracts.ts"), "utf8");
    expect(contracts).not.toMatch(/planning[\\/]planSelectionContracts/);
    expect(runtimeContracts).not.toMatch(/planning[\\/]|HandPlanner|PlanEvaluator|benchmark/);
  });

  it("exposes only optional low-level sidecar types", () => {
    const runtime: AiRuntimeState = { candidatePlans: [], generatedTurn: -1, configVersion: "d0", needsReplan: true };
    expect(runtime).not.toHaveProperty("planSelectionState");
    const mode: PlanSelectionMode = "keep-current";
    const state: D1PlanSelectionState = {
      version: "d1-topk-runtime-v1",
      planSwitchCount: 0,
      fullReplanCount: 0,
      recentStrategicPlanFamilyIds: [],
      planIdentityById: {},
    };
    expect(mode).toBe("keep-current");
    expect(state).not.toHaveProperty("migrationVersion");
  });

  it("keeps planning context public and result internal", () => {
    const context: PlanSelectionContext = {
      seat: 1,
      partnerSeat: 3,
      gameRank: "10",
      hand: [],
      handCount: 0,
      playedCards: [],
      handCounts: { 0: 0, 1: 0, 2: 0, 3: 0 },
      finishOrder: [],
      candidatePlans: [],
      runtime: { candidatePlans: [], generatedTurn: -1, configVersion: "d0", needsReplan: true },
    };
    const result: PlanSelectionResult = { reason: "keep-current" };
    expect(context).not.toHaveProperty("partnerHand");
    expect(context).not.toHaveProperty("opponentsHands");
    expect(context).not.toHaveProperty("hands");
    expect(context).not.toHaveProperty("deck");
    expect(result.reason).toBe("keep-current");
  });
});
