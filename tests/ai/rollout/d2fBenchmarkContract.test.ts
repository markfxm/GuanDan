import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(ROOT, "tests/fixtures/ai/d2f-public-rollout-fixture.json");
const TSX_CLI_PATH = resolve(ROOT, "node_modules/tsx/dist/cli.mjs");
const tempPaths: string[] = [];

function runFixedBenchmark(fixturePath = FIXTURE_PATH) {
  return spawnSync(process.execPath, [
    TSX_CLI_PATH, "scripts/benchmarks/d2f-rollout-budget-calibration.ts",
    "--fixture", fixturePath, "--warmup", "3", "--iterations", "10", "--json",
  ], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
}

function runRawBenchmark(args: readonly string[]) {
  return spawnSync(process.execPath, [TSX_CLI_PATH, "scripts/benchmarks/d2f-rollout-budget-calibration.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
}

function runTsxExpression(expression: string): any {
  const result = spawnSync(process.execPath, [TSX_CLI_PATH, "-e", expression], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function temporaryFixture(value: unknown): string {
  const directory = mkdtempSync(resolve(tmpdir(), "d2f-benchmark-contract-"));
  const path = resolve(directory, "fixture.json");
  tempPaths.push(directory);
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
  return path;
}

function readFixture(): Record<string, any> {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<string, any>;
}

afterEach(() => {
  while (tempPaths.length > 0) rmSync(tempPaths.pop()!, { recursive: true, force: true });
});

describe("fixed D2F benchmark runner contract", () => {
  test("fixture is the frozen public schema without private particle state", () => {
    const fixture = readFixture();
    expect(Object.keys(fixture)).toEqual(["schemaVersion", "fixtureId", "replay", "particleBank", "request", "expected"]);
    expect(fixture.schemaVersion).toBe("d2f-rollout-benchmark-fixture-v1");
    expect(fixture.fixtureId).toBe("d2f-public-rollout-calibration-v1");
    expect(Object.keys(fixture.replay)).toEqual([
      "publicIdentity", "initialLedger", "baseLedger", "finalLedger", "publicHistoryEvents", "pendingPublicEvents",
      "expectedFinalEventIndex", "expectedFinalPublicLedgerHash", "gameRank", "perspectiveSeat", "ownCurrentHand", "publicState",
    ]);
    expect(Object.keys(fixture.particleBank)).toEqual([
      "schemaVersion", "particleCount", "maxSamplingAttempts", "maxIndexDraws", "samplerConfigVersion", "likelihoodConfig",
    ]);
    expect(Object.keys(fixture.request)).toEqual(["policyId", "candidates", "budget", "evidenceRequirements", "aggregationPolicy"]);
    expect(Object.keys(fixture.expected)).toEqual([
      "ranking", "candidateIds", "scenarioCount", "replicateCountPerScenario", "policyId", "formalExecutionAllowed", "coverage", "result",
    ]);
    expect(JSON.stringify(fixture)).not.toMatch(/"(?:hiddenTransferAssignments|particleSeed|randomTape|cursor|normalizedWeight|assignment|privateState)"/);
  });

  test("real fixed CLI returns the stable success report and literal correctness oracle", () => {
    const fixtureBefore = readFileSync(FIXTURE_PATH, "utf8");
    const result = runFixedBenchmark();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).not.toBe("");
    const report = JSON.parse(result.stdout) as Record<string, any>;
    expect(Object.keys(report)).toEqual([
      "schemaVersion", "fixtureId", "runner", "nodeVersion", "platform", "architecture", "evidenceLevel",
      "warmupIterations", "measuredIterations", "correctness", "metrics", "threshold", "verdict",
    ]);
    expect(report).toMatchObject({
      schemaVersion: "d2f-rollout-benchmark-report-v1",
      fixtureId: "d2f-public-rollout-calibration-v1",
      runner: "d2f-rollout-budget-calibration",
      warmupIterations: 3,
      measuredIterations: 10,
      correctness: "passed",
      threshold: { kind: "hang-ceiling", maximumSingleIterationMs: 60000, passed: true },
      verdict: "PASS",
    });
    expect(report.evidenceLevel).toBe(process.version === "v22.22.2" ? "NODE22_RELEASE_EVIDENCE" : "SUPPLEMENTAL_LOCAL_EVIDENCE");
    expect(report.metrics.sampleCount).toBe(10);
    for (const value of Object.values(report.metrics)) expect(Number.isFinite(value)).toBe(true);
    expect(report.metrics.minMs).toBeGreaterThanOrEqual(0);
    expect(report.metrics.maxMs).toBeGreaterThanOrEqual(report.metrics.minMs);
    expect(report.metrics.meanMs).toBeGreaterThan(0);
    expect(report.metrics.throughputPerSecond).toBeGreaterThan(0);
    expect(fixtureBefore).toBe(readFileSync(FIXTURE_PATH, "utf8"));
  });

  test("literal median and p95 formulas use sorted ten-sample input", async () => {
    const metrics = runTsxExpression('import { calculateBenchmarkMetrics } from "./scripts/benchmarks/d2f-rollout-budget-calibration.ts"; console.log(JSON.stringify(calculateBenchmarkMetrics([10,1,8,2,7,3,9,4,6,5])));');
    expect(metrics).toEqual({
      sampleCount: 10,
      minMs: 1,
      maxMs: 10,
      meanMs: 5.5,
      medianMs: 5.5,
      p95Ms: 10,
      throughputPerSecond: 1000 / 5.5,
    });
  });

  test("hang ceiling is exclusive above 60000 milliseconds", () => {
    const result = runTsxExpression('import { exceedsHangCeiling } from "./scripts/benchmarks/d2f-rollout-budget-calibration.ts"; console.log(JSON.stringify([exceedsHangCeiling(60000), exceedsHangCeiling(60000.0001)]));');
    expect(result).toEqual([false, true]);
  });

  test("rejects an invalid fixed CLI argument with no success-shaped output", () => {
    const result = runRawBenchmark(["--fixture", FIXTURE_PATH, "--warmup", "2", "--iterations", "10", "--json"]);
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr).not.toContain('"verdict":"PASS"');
  });

  test("rejects malformed fixture with argument/fixture exit code", () => {
    const path = temporaryFixture({ schemaVersion: "wrong" });
    const result = runFixedBenchmark(path);
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe("");
  });

  test("rejects a literal correctness mismatch without partial success", () => {
    const fixture = readFixture();
    fixture.expected.result.rootDigest = "0".repeat(64);
    const path = temporaryFixture(fixture);
    const result = runFixedBenchmark(path);
    expect(result.status).toBe(2);
    expect(result.stdout.trim()).toBe("");
    expect(result.stderr).not.toContain('"verdict":"PASS"');
  });

  test("does not use skip, only, or todo modifiers in this contract suite", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    expect(source).not.toMatch(/\b(?:describe|test)\.(?:skip|only|todo)\b/);
  });
});
