import os from "node:os";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type PackageJson = {
  scripts?: {
    "test:d2a1-regression"?: string;
  };
};

const packageJsonPath = path.resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;

function quotedExcludeArgument(script: string, pattern: string): boolean {
  const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = new RegExp(`--exclude\\s+"${escapedPattern}"`);
  const unquoted = new RegExp(`--exclude\\s+${escapedPattern}(?=\\s|$)`);
  return quoted.test(script) && !unquoted.test(script);
}

function readArgv(args: string[]): string[] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-test-argv-"));
  const entry = path.join(tempDir, "argv.cjs");
  fs.writeFileSync(entry, "process.stdout.write(JSON.stringify(process.argv.slice(2)))", "utf8");

  try {
    return JSON.parse(execFileSync(process.execPath, [entry, ...args], { encoding: "utf8" })) as string[];
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("npm test collection contract", () => {
  it("passes each excluded test glob as one quoted Vitest argument", () => {
    const script = packageJson.scripts?.["test:d2a1-regression"];
    expect(script).toBeTypeOf("string");

    for (const pattern of [
      "tests/benchmark/**",
      "tests/simulation/**",
      "tests/performance/**",
    ]) {
      expect(quotedExcludeArgument(script ?? "", pattern)).toBe(true);
      expect(readArgv(["--exclude", pattern])).toEqual(["--exclude", pattern]);
    }
  });
});
