import { describe, expect, it } from "vitest";
import { buildD1DryRunOutput, parseD1Args, planD1Run } from "../../scripts/runD1TopKBenchmark";
import { buildD1Manifest, canSkipExisting, validateResumeManifest } from "./d1Manifest";
import { deriveD1ConfigHash, resolveGitExecutionProvenance } from "./d1Provenance";
import { buildGamesForSeed } from "./rotations";
import { simulateGame } from "./simulator";
import { strategyDescriptorsForExecution } from "./strategies";

describe("D1 execution provenance", () => {
  it("resolves a full Git HEAD and reports it in dry-run output", () => {
    const options = parseD1Args(["--phase", "smoke", "--dry-run"]);
    expect((options as unknown as { executionSourceCommit: string }).executionSourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(buildD1DryRunOutput(options)).toMatchObject({
      executionSourceCommit: (options as unknown as { executionSourceCommit: string }).executionSourceCommit,
      worktreeClean: expect.any(Boolean),
    });
  });

  it("rejects unknown provenance at manifest construction and resume", () => {
    expect(() => buildD1Manifest({
      phase: "smoke",
      matchup: "treatment-vs-control",
      configHash: "cfg",
      executionSourceCommit: "unknown",
      expectedMatchIds: ["m1"],
      completedMatchIds: ["m1"],
    })).toThrow(/PROVENANCE/);

    const previous = {
      schemaVersion: "d1-manifest-v1" as const,
      phase: "smoke",
      matchup: "treatment-vs-control",
      configHash: "cfg",
      executionSourceCommit: "unknown",
      expectedMatchIds: ["m1"],
      completedMatchIds: ["m1"],
      resumeSupported: true as const,
      skipExistingSupported: true as const,
    };
    expect(() => validateResumeManifest(previous, previous)).toThrow(/PROVENANCE/);
  });

  it("requires matching execution provenance before skip-existing", () => {
    const result = { matchId: "m1", configHash: "cfg", implementationVersion: "impl", executionSourceCommit: "unknown", completed: true, failed: false, durationMs: 1, diagnosticsError: false, publicTraceHash: "hash", replayVerified: true };
    expect(canSkipExisting(result, { configHash: "cfg", implementationVersion: "impl", executionSourceCommit: "abc123", replayMode: "all" })).toBe(false);
  });

  it("fails closed when Git cannot resolve and binds config hash to the commit", () => {
    expect(() => resolveGitExecutionProvenance({ cwd: "C:/missing", runGit: () => { throw new Error("GIT_FAILED"); } })).toThrow(/GIT_EXECUTION_PROVENANCE_UNAVAILABLE/);
    const common = { requestedConfigHash: "cfg", benchmarkVersion: "d1-topk-v1", rank: "2", phase: "smoke", replayMode: "failures" } as const;
    const first = deriveD1ConfigHash({ ...common, executionSourceCommit: "a".repeat(40) as never });
    const second = deriveD1ConfigHash({ ...common, executionSourceCommit: "b".repeat(40) as never });
    expect(first).not.toBe(second);
  });

  it("keeps seven single-matchup dry-runs disjoint and equal to the full union", () => {
    const names = ["treatment-vs-control", "treatment-vs-greedy", "control-vs-greedy", "treatment-vs-random", "control-vs-random", "treatment-vs-legacy", "control-vs-legacy"];
    const all = planD1Run(parseD1Args(["--phase", "smoke", "--replay-mode", "failures", "--dry-run"]));
    const union = new Set<string>();
    for (const matchup of names) {
      const options = parseD1Args(["--phase", "smoke", "--matchup", matchup, "--replay-mode", "failures", "--dry-run"]);
      expect(options.executionSourceCommit).toBe(parseD1Args(["--phase", "smoke", "--dry-run"]).executionSourceCommit);
      const plan = planD1Run(options);
      expect(plan.rawGames).toBe(160);
      expect(plan.pairedUnits).toBe(80);
      for (const id of plan.expectedMatchIds) {
        expect(union.has(id)).toBe(false);
        union.add(id);
      }
    }
    expect([...union].sort()).toEqual(all.expectedMatchIds);
  });

  it("propagates the commit into raw results and strategy descriptors", () => {
    const commit = "c".repeat(40);
    const task = buildGamesForSeed({ benchmarkVersion: "d1-topk-v1", rank: "2", seeds: [1], strategyA: "legal-greedy", strategyB: "legal-greedy", replayMode: "failures", executionSourceCommit: commit }, 1)[0]!;
    const result = simulateGame({ ...task, configHash: "cfg", executionSourceCommit: commit });
    expect(result.executionSourceCommit).toBe(commit);
    expect(strategyDescriptorsForExecution(commit).every((descriptor) => descriptor.sourceCommit === commit)).toBe(true);
  });
});
