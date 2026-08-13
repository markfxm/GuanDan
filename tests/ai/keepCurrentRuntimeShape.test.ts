import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import type { AiDecisionConfig, AiObservation, AiRuntimeState } from "../../src/ai/contracts";
import { runtimeCanonicalJson } from "./d0FixtureCanonicalizer";
import type { D0KeepCurrentFixture } from "./d0FixtureTypes";

const fixturePath = path.resolve(process.cwd(), "tests/ai/fixtures/d0KeepCurrentCases.json");

function readFixture(): D0KeepCurrentFixture {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
}

describe("D0 keep-current runtime shape", () => {
  it("does not create D1 plan-selection fields", () => {
    const fixture = readFixture();
    for (const testCase of fixture.cases) {
      const result = decideAiAction(testCase.observation as AiObservation, testCase.runtimeInput as AiRuntimeState, testCase.config as AiDecisionConfig);
      const runtime = result.runtime as Record<string, unknown>;
      expect(runtime).not.toHaveProperty("planSelectionState");
      expect(runtime).not.toHaveProperty("planFamilyId");
      expect(runtime).not.toHaveProperty("rootPlanId");
      expect(runtime).not.toHaveProperty("lineageId");
    }
  });

  it("locks the complete runtime JSON rather than a selected subset", () => {
    const fixture = readFixture();
    const testCase = fixture.cases[0]!;
    const result = decideAiAction(testCase.observation as AiObservation, testCase.runtimeInput as AiRuntimeState, testCase.config as AiDecisionConfig);
    expect(runtimeCanonicalJson(result.runtime)).toBe(testCase.expected.runtimeCanonicalJson);

    const polluted = { ...result.runtime, planSelectionState: { mode: "dynamic-topk-v1" } };
    expect(runtimeCanonicalJson(polluted)).not.toBe(testCase.expected.runtimeCanonicalJson);
  });
});
