import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import type { AiDecisionConfig, AiObservation, AiRuntimeState } from "../../src/ai/contracts";
import { canonicalJson, decisionPublicTraceHash, runtimeCanonicalJson } from "./d0FixtureCanonicalizer";
import type { D0KeepCurrentFixture, D0KeepCurrentCase } from "./d0FixtureTypes";

const fixturePath = path.resolve(process.cwd(), "tests/ai/fixtures/d0KeepCurrentCases.json");

function readFixture(): D0KeepCurrentFixture {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
}

function runCase(testCase: D0KeepCurrentCase) {
  return decideAiAction(
    testCase.observation as AiObservation,
    testCase.runtimeInput as AiRuntimeState,
    testCase.config as AiDecisionConfig,
  );
}

describe("D0 keep-current characterization", () => {
  it("locks lead, follow, legal pass, replan, and incremental runtime decisions", () => {
    const fixture = readFixture();
    expect(fixture.cases.map((testCase) => testCase.caseId)).toEqual([
      "lead-single",
      "follow-normal",
      "follow-pass-only",
      "complete-replan",
      "incremental-runtime",
    ]);

    for (const testCase of fixture.cases) {
      const result = runCase(testCase);
      expect(result.action).toEqual(testCase.expected.action);
      expect(runtimeCanonicalJson(result.runtime)).toBe(testCase.expected.runtimeCanonicalJson);
      expect(decisionPublicTraceHash(testCase.observation, result.action)).toBe(testCase.expected.publicTraceHash);
    }
  });

  it("is deterministic for identical observation, runtime, and config", () => {
    const fixture = readFixture();
    for (const testCase of fixture.cases) {
      const first = runCase(testCase);
      const second = runCase(testCase);
      expect(canonicalJson(second.action)).toBe(canonicalJson(first.action));
      expect(runtimeCanonicalJson(second.runtime)).toBe(runtimeCanonicalJson(first.runtime));
      expect(decisionPublicTraceHash(testCase.observation, second.action)).toBe(
        decisionPublicTraceHash(testCase.observation, first.action),
      );
    }
  });
});
