import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import type { AiDecisionConfig, AiObservation, AiRuntimeState } from "../../src/ai/contracts";
import { decisionPublicTraceHash, runtimeCanonicalJson } from "./d0FixtureCanonicalizer";
import type { D0KeepCurrentFixture } from "./d0FixtureTypes";

const fixturePath = path.resolve(process.cwd(), "tests/ai/fixtures/d0KeepCurrentCases.json");

describe("P4 keep-current byte lock", () => {
  it("matches the D0 fixture for implicit and explicit keep-current", () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
    for (const testCase of fixture.cases) {
      const observation = testCase.observation as AiObservation;
      const runtime = testCase.runtimeInput as AiRuntimeState;
      const config = testCase.config as AiDecisionConfig;
      const implicit = decideAiAction(observation, runtime, config);
      const explicit = decideAiAction(observation, runtime, config, { planSelectionMode: "keep-current" });
      for (const result of [implicit, explicit]) {
        expect(result.action).toEqual(testCase.expected.action);
        expect(runtimeCanonicalJson(result.runtime)).toBe(testCase.expected.runtimeCanonicalJson);
        expect(decisionPublicTraceHash(observation, result.action)).toBe(testCase.expected.publicTraceHash);
        expect(result.runtime).not.toHaveProperty("planSelectionState");
      }
    }
  });

  it("keeps repeated decisions deterministic without adding D1 fields", () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
    for (const testCase of fixture.cases) {
      const first = decideAiAction(testCase.observation as AiObservation, testCase.runtimeInput as AiRuntimeState, testCase.config as AiDecisionConfig);
      const second = decideAiAction(testCase.observation as AiObservation, testCase.runtimeInput as AiRuntimeState, testCase.config as AiDecisionConfig, { planSelectionMode: "keep-current" });
      expect(runtimeCanonicalJson(first.runtime)).toBe(runtimeCanonicalJson(second.runtime));
      expect(decisionPublicTraceHash(testCase.observation, first.action)).toBe(decisionPublicTraceHash(testCase.observation, second.action));
    }
  });
});
