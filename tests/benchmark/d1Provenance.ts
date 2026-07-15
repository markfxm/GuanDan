import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { canonicalJson } from "./contracts";

export type GitCommitSha = string & { readonly __gitCommitSha: unique symbol };

export interface GitExecutionProvenance {
  repositoryRoot: string;
  executionSourceCommit: GitCommitSha;
  worktreeClean: boolean;
}

export interface GitRunner {
  (args: string[], cwd: string): string;
}

const executionPathspecs = [
  "src/ai",
  "tests/benchmark",
  "scripts/runD1TopKBenchmark.ts",
  "scripts/replayD1TopKBenchmark.ts",
  "scripts/freezeD1Calibration.ts",
  "scripts/generateD0KeepCurrentFixtures.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.*.json",
  "vite.config.*",
];

const defaultGitRunner: GitRunner = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();

export function resolveGitExecutionProvenance(input: { cwd?: string; runGit?: GitRunner } = {}): GitExecutionProvenance {
  const cwd = input.cwd ?? process.cwd();
  const runGit = input.runGit ?? defaultGitRunner;
  let repositoryRoot: string;
  let executionSourceCommit: GitCommitSha;
  try {
    repositoryRoot = path.resolve(runGit(["rev-parse", "--show-toplevel"], cwd));
    const rawCommit = runGit(["rev-parse", "HEAD"], cwd).toLowerCase();
    if (!isGitCommitSha(rawCommit)) throw new Error("GIT_HEAD_NOT_FULL_SHA");
    executionSourceCommit = rawCommit as GitCommitSha;
  } catch (error) {
    throw new Error(`GIT_EXECUTION_PROVENANCE_UNAVAILABLE:${error instanceof Error ? error.message : String(error)}`);
  }
  const worktreeClean = isExecutionTreeClean(cwd, runGit);
  return { repositoryRoot, executionSourceCommit, worktreeClean };
}

export function isGitCommitSha(value: unknown): value is GitCommitSha {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value) && value.toLowerCase() !== "0".repeat(40);
}

export function assertKnownExecutionSourceCommit(value: unknown): asserts value is GitCommitSha {
  if (!isGitCommitSha(value) || value.toLowerCase() === "unknown") throw new Error("PROVENANCE_EXECUTION_COMMIT_INVALID");
}

export function isExecutionTreeClean(cwd: string, runGit: GitRunner = defaultGitRunner): boolean {
  try {
    const status = runGit(["status", "--porcelain", "--untracked-files=all", "--", ...executionPathspecs], cwd);
    return status.length === 0
      && commandSucceeds(["diff", "--quiet", "--", ...executionPathspecs], cwd)
      && commandSucceeds(["diff", "--cached", "--quiet", "--", ...executionPathspecs], cwd);
  } catch {
    return false;
  }
}

function commandSucceeds(args: string[], cwd: string): boolean {
  try {
    execFileSync("git", args, { cwd, stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function deriveD1ConfigHash(input: { requestedConfigHash: string; executionSourceCommit: GitCommitSha; benchmarkVersion: string; rank: string; phase: string; replayMode: string }): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}
