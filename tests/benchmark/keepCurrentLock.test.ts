import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actionStableKey, canonicalJson, decisionPublicTraceHash, fixtureInputHash, fixtureOutputHash, inputPayload, runtimeCanonicalJson, sha256 } from "../ai/d0FixtureCanonicalizer";
import type { D0KeepCurrentFixture } from "../ai/d0FixtureTypes";
import { getStrategy } from "./strategies";
import type { BenchmarkObservation } from "./contracts";
import { createD0FixtureSourceWorktree, type D0FixtureSourceWorktree } from "./d0FixtureSourceWorktree";

const fixturePath = path.resolve(process.cwd(), "tests/ai/fixtures/d0KeepCurrentCases.json");
const generatorPath = path.resolve(process.cwd(), "scripts/generateD0KeepCurrentFixtures.ts");
const tsxCli = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const sourceCommit = "e2a20e18f8e5c0871db38ad69426262e43766ce1";
let source: D0FixtureSourceWorktree;

beforeAll(() => {
  source = createD0FixtureSourceWorktree(sourceCommit);
});

afterAll(() => {
  source.remove();
});

function runGenerator(output: string, extra: string[] = []): void {
  execFileSync(process.execPath, [tsxCli, generatorPath,
    "--source-worktree", source.root,
    "--source-commit", sourceCommit,
    "--output", output,
    "--generator-version", "d0-fixture-v1",
    ...extra,
  ], { cwd: process.cwd(), stdio: "pipe" });
}

function expectGeneratorFailure(args: string[], message: string): void {
  expect(() => execFileSync(process.execPath, [tsxCli, generatorPath, ...args], { cwd: process.cwd(), stdio: "pipe" })).toThrow(message);
}

function expectGeneratorFailureAt(worktree: string, args: string[], message: string): void {
  const worktreeGenerator = path.join(worktree, "scripts", "generateD0KeepCurrentFixtures.ts");
  expect(() => execFileSync(process.execPath, [tsxCli, worktreeGenerator, ...args], { cwd: worktree, stdio: "pipe" })).toThrow(message);
}

describe("D0 fixture and unified adapter lock", () => {
  it("removes only a clean test-created source worktree without force", () => {
    const helperSource = readFileSync(path.resolve(process.cwd(), "tests/benchmark/d0FixtureSourceWorktree.ts"), "utf8");
    expect(helperSource).not.toMatch(/worktree", "remove", "--force"/);
  });

  it("has complete provenance and stable fixture hashes", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
    expect(fixture.sourceCommit).toBe(sourceCommit);
    expect(fixture.sourceTag).toBe("ai-benchmark-d0-baseline");
    expect(fixture.generatorCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(fixture.generatorVersion).toBe("d0-fixture-v1");
    expect(fixture.generatorCodeTreeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fixture.inputSha256).toBe(fixtureInputHash(fixture.cases));
    expect(fixture.outputSha256).toBe(fixtureOutputHash(fixture));
    expect(fixture.cases).toHaveLength(5);
    for (const testCase of fixture.cases) {
      expect(testCase.inputSha256).toBe(sha256(canonicalJson(inputPayload(testCase))));
      expect(testCase.expected.action).toBeDefined();
      expect(testCase.expected.actionStableKey).toBe(actionStableKey(testCase.expected.action));
      expect(testCase.expected.runtimeCanonicalJson).toBe(runtimeCanonicalJson(testCase.expected.runtime));
      expect(testCase.expected.publicTraceHash).toBe(decisionPublicTraceHash(testCase.observation, testCase.expected.action));
    }
  });

  it("keeps the unified benchmark adapter default entry aligned with the D0 fixture", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
    const testCase = fixture.cases[0]!;
    const input = testCase.observation;
    const observation: BenchmarkObservation = {
      ownHand: input.hand as BenchmarkObservation["ownHand"],
      rank: input.gameRank as BenchmarkObservation["rank"],
      seat: input.seat as BenchmarkObservation["seat"],
      currentSeat: input.seat as BenchmarkObservation["currentSeat"],
      leaderSeat: input.seat as BenchmarkObservation["leaderSeat"],
      publicHandCounts: input.handCounts as BenchmarkObservation["publicHandCounts"],
      publicTrick: [],
      publicHistory: [],
      finishOrder: input.finishOrder as BenchmarkObservation["finishOrder"],
      partnerPassed: input.partnerPassedCurrentTrick === true,
      publicTributeEvents: [],
      actionIndex: 0,
    };
    const strategy = getStrategy("unified-current");
    const runtime = strategy.createRuntime({ runtimeId: "p0-lock", seat: observation.seat, strategyRandomSeed: "p0-lock-seed" });
    const decision = strategy.decide(observation, runtime);
    expect(decision.action).toEqual({ type: "play", cardIds: (testCase.expected.action.group as { cards: Array<{ id: string }> }).cards.map((card) => card.id).sort() });
    expect(runtimeCanonicalJson(decision.runtime)).toBe(testCase.expected.runtimeCanonicalJson);
  });

  it("check-only detects drift without changing the fixture", () => {
    const before = readFileSync(fixturePath, "utf8");
    runGenerator(fixturePath, ["--check-only"]);
    expect(readFileSync(fixturePath, "utf8")).toBe(before);

    const temp = mkdtempSync(path.join(os.tmpdir(), "d0-fixture-drift-"));
    const driftPath = path.join(temp, "drift.json");
    const drifted = before.replace(sourceCommit, "0".repeat(40));
    writeFileSync(driftPath, drifted);
    expectGeneratorFailure([
      "--source-worktree", source.root,
      "--source-commit", sourceCommit,
      "--output", driftPath,
      "--generator-version", "d0-fixture-v1",
      "--check-only",
    ], "D0_FIXTURE_DRIFT");
    expect(readFileSync(driftPath, "utf8")).toBe(drifted);
    rmSync(temp, { recursive: true, force: true });
  });

  it("check-only rejects tampered input/output hashes and action/public trace", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
    const mutations: Array<(copy: D0KeepCurrentFixture) => void> = [
      (copy) => { copy.sourceCommit = "0".repeat(40); },
      (copy) => { copy.inputSha256 = "0".repeat(64); },
      (copy) => { copy.outputSha256 = "0".repeat(64); },
      (copy) => { copy.cases[0]!.expected.actionStableKey = "pass"; },
      (copy) => { copy.cases[0]!.expected.publicTraceHash = "0".repeat(64); },
    ];
    for (const mutate of mutations) {
      const temp = mkdtempSync(path.join(os.tmpdir(), "d0-fixture-tamper-"));
      const tamperedPath = path.join(temp, "tampered.json");
      const copy = structuredClone(fixture);
      mutate(copy);
      writeFileSync(tamperedPath, JSON.stringify(copy, null, 2));
      expectGeneratorFailure([
        "--source-worktree", source.root,
        "--source-commit", sourceCommit,
        "--output", tamperedPath,
        "--generator-version", "d0-fixture-v1",
        "--check-only",
      ], "D0_FIXTURE_DRIFT");
      expect(JSON.parse(readFileSync(tamperedPath, "utf8"))).toEqual(copy);
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects missing or mismatched generator provenance without changing the fixture", () => {
    const fixtureText = readFileSync(fixturePath, "utf8");
    const temp = mkdtempSync(path.join(os.tmpdir(), "d0-generator-provenance-"));
    const cases: Array<{ name: string; mutate: (copy: D0KeepCurrentFixture) => void }> = [
      { name: "missing-tree-hash", mutate: (copy) => { delete (copy as unknown as Record<string, unknown>).generatorCodeTreeSha256; } },
      { name: "wrong-generator-commit", mutate: (copy) => { copy.generatorCommit = "329934d731e7bbacdf2edc3fc68c31640c3a5ec6"; } },
      { name: "wrong-tree-hash", mutate: (copy) => { copy.generatorCodeTreeSha256 = "0".repeat(64); } },
      { name: "wrong-version", mutate: (copy) => { copy.generatorVersion = "d0-fixture-v0"; } },
    ];
    try {
      for (const testCase of cases) {
        const output = path.join(temp, `${testCase.name}.json`);
        const copy = JSON.parse(fixtureText) as D0KeepCurrentFixture;
        testCase.mutate(copy);
        const serialized = JSON.stringify(copy, null, 2);
        writeFileSync(output, serialized);
        expectGeneratorFailure([
          "--source-worktree", source.root,
          "--source-commit", sourceCommit,
          "--output", output,
          "--generator-version", "d0-fixture-v1",
          "--check-only",
        ], "D0_FIXTURE_PROVENANCE_INVALID");
        expect(readFileSync(output, "utf8")).toBe(serialized);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects generator, canonicalizer, or type changes until the fixture is regenerated", () => {
    const parent = mkdtempSync(path.join(os.tmpdir(), "d0-generator-code-dirty-"));
    const dirtyWorktree = path.join(parent, "worktree");
    const fixtureCopy = path.join(parent, "fixture.json");
    const fixtureText = readFileSync(fixturePath, "utf8");
    writeFileSync(fixtureCopy, fixtureText);
    execFileSync("git", ["worktree", "add", "--detach", dirtyWorktree, "HEAD"], { cwd: process.cwd(), stdio: "pipe" });
    const paths = [
      "scripts/generateD0KeepCurrentFixtures.ts",
      "tests/ai/d0FixtureCanonicalizer.ts",
      "tests/ai/d0FixtureTypes.ts",
    ];
    try {
      for (const relativePath of paths) {
        const absolutePath = path.join(dirtyWorktree, relativePath);
        writeFileSync(absolutePath, `${readFileSync(absolutePath, "utf8")}\n// provenance mutation\n`);
        try {
          expectGeneratorFailureAt(dirtyWorktree, [
            "--source-worktree", source.root,
            "--source-commit", sourceCommit,
            "--output", fixtureCopy,
            "--generator-version", "d0-fixture-v1",
            "--check-only",
          ], "D0_FIXTURE_PROVENANCE_INVALID");
          expect(readFileSync(fixtureCopy, "utf8")).toBe(fixtureText);
        } finally {
          execFileSync("git", ["-C", dirtyWorktree, "checkout", "--", relativePath], { cwd: process.cwd(), stdio: "pipe" });
        }
      }
    } finally {
      execFileSync("git", ["worktree", "remove", "--force", dirtyWorktree], { cwd: process.cwd(), stdio: "pipe" });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("rejects an unexpected source commit before loading the engine", () => {
    expectGeneratorFailure([
      "--source-worktree", source.root,
      "--source-commit", "0000000000000000000000000000000000000000",
      "--output", fixturePath,
      "--generator-version", "d0-fixture-v1",
      "--check-only",
    ], "D0_SOURCE_COMMIT_MISMATCH");
  });

  it("rejects a source worktree with modified production files", () => {
    const parent = mkdtempSync(path.join(os.tmpdir(), "d0-fixture-source-"));
    const dirtySource = path.join(parent, "source");
    execFileSync("git", ["worktree", "add", "--detach", dirtySource, sourceCommit], { cwd: process.cwd(), stdio: "pipe" });
    const dirtyFile = path.join(dirtySource, "src", "__d0_p0_dirty_test__.ts");
    writeFileSync(dirtyFile, "export {};\n");
    try {
      expectGeneratorFailure([
        "--source-worktree", dirtySource,
        "--source-commit", sourceCommit,
        "--output", fixturePath,
        "--generator-version", "d0-fixture-v1",
        "--check-only",
      ], "D0_SOURCE_PRODUCTION_DIRTY");
    } finally {
      rmSync(dirtyFile, { force: true });
      execFileSync("git", ["worktree", "remove", "--force", dirtySource], { cwd: process.cwd(), stdio: "pipe" });
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("rejects fixture provenance and action/hash mutations", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as D0KeepCurrentFixture;
    const mutated = structuredClone(fixture);
    mutated.sourceCommit = "0".repeat(40);
    expect(mutated.sourceCommit).not.toBe(fixture.sourceCommit);
    mutated.cases[0]!.observation.seat = 2;
    expect(fixtureInputHash(mutated.cases)).not.toBe(fixture.inputSha256);

    const actionChanged = structuredClone(fixture);
    actionChanged.cases[0]!.expected.action = { type: "pass" };
    expect(actionChanged.cases[0]!.expected.publicTraceHash).not.toBe(
      decisionPublicTraceHash(actionChanged.cases[0]!.observation, actionChanged.cases[0]!.expected.action),
    );
    expect(canonicalJson(actionChanged)).not.toBe(canonicalJson(fixture));
  });
});
