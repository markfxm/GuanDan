import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type D0FixtureSourceWorktree = Readonly<{
  root: string;
  remove: () => void;
}>;

export function createD0FixtureSourceWorktree(sourceCommit: string): D0FixtureSourceWorktree {
  const parent = mkdtempSync(path.join(os.tmpdir(), "d0-fixture-source-"));
  const root = path.join(parent, "source");

  try {
    execFileSync("git", ["cat-file", "-e", `${sourceCommit}^{commit}`], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    execFileSync("git", ["worktree", "add", "--detach", root, sourceCommit], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }

  return {
    root,
    remove: () => {
      execFileSync("git", ["worktree", "remove", root], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
      rmSync(parent, { recursive: true, force: true });
    },
  };
}
