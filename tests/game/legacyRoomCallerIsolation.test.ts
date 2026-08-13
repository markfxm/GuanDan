import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createLegacyBenchmarkRoom, createRoom } from "../../src/game/room";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const productionFiles = ["src/main.tsx", "src/ui/App.tsx", "src/ui/api.ts", "src/server/api.ts", "src/server/dev.ts"];
const browserFiles = ["src/main.tsx", "src/ui/App.tsx", "src/ui/api.ts"];
const legacyCallerFiles = [
  "scripts/unifiedAiSimulation.ts",
  "scripts/research/measureD1PlannerExpansionBudget.ts",
  "tests/ai/handPlannerMigration.test.ts",
  "tests/ai/publicLedgerKeepCurrent.test.ts",
  "tests/benchmark/observation.test.ts",
  "tests/benchmark/rotations.test.ts",
  "tests/benchmark/rotations.ts",
  "tests/benchmark/simulator.ts",
  "tests/benchmark/strategies.test.ts",
  "tests/game/room.test.ts",
  "tests/game/roomPlanningArchitecture.test.ts",
  "tests/game/roomUnifiedAdapter.test.ts",
  "tests/performance/aiHotPath.test.ts",
];

describe("explicit room caller isolation", () => {
  it("keeps production callers canonical and legacy-free", () => {
    const productionSource = productionFiles.map(read).join("\n");

    expect(productionSource).not.toContain("createLegacyBenchmarkRoom");
    expect(read("src/server/api.ts")).toMatch(/roomCreator\(\{[\s\S]*publicIdentity:/);
  });

  it("requires every legacy caller to import and use the legacy factory", () => {
    for (const file of legacyCallerFiles) {
      const source = read(file);
      expect(source, file).toContain("createLegacyBenchmarkRoom");
      expect(source, file).not.toMatch(/createRoom\(\{(?![\s\S]*publicIdentity)/);
    }
  });

  it("fails closed when a canonical caller omits identity", () => {
    expect(() => createRoom({ rank: "2", seed: 1 } as never)).toThrow("CANONICAL_ROOM_IDENTITY_REQUIRED");
  });

  it("keeps explicit legacy rooms outside the canonical ledger", () => {
    const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });

    expect(room.publicIdentity).toBeUndefined();
    expect(room.publicLedger).toBeUndefined();
    expect(room.publicEvents).toBeUndefined();
  });

  it("requires canonical rooms to carry public ledger state", () => {
    const room = createRoom({
      rank: "2",
      seed: 1,
      publicIdentity: buildPublicGameIdentity("task4:caller", 0, 0, "production-session"),
    });

    expect(room.publicIdentity).toBeDefined();
    expect(room.publicLedger).toBeDefined();
    expect(room.publicEvents).toBeDefined();
  });

  it("keeps server identity storage out of browser-reachable code", () => {
    const browserSource = browserFiles.map(read).join("\n");

    expect(browserSource).not.toContain("PublicIdentityStore");
    expect(browserSource).not.toContain("createPublicIdentityProvider");
    expect(browserSource).not.toContain("better-sqlite3");
  });
});
