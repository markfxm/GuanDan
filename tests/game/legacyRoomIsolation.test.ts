import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createLegacyBenchmarkRoom, createRoom } from "../../src/game/room";

const fixedIdentity = buildPublicGameIdentity("task4:canonical", 0, 0, "production-session");

describe("explicit room creation modes", () => {
  it("fails closed when canonical identity is missing", () => {
    expect(() => createRoom({ rank: "2", seed: 1 } as never)).toThrow("CANONICAL_ROOM_IDENTITY_REQUIRED");
  });

  it("creates canonical public identity state", () => {
    const room = createRoom({ rank: "2", seed: 1, publicIdentity: fixedIdentity });

    expect(room.publicIdentity).toBe(fixedIdentity);
    expect(room.publicLedger).toBeDefined();
    expect(room.publicEvents).toBeDefined();
  });

  it("creates a legacy benchmark room without public identity state", () => {
    const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });

    expect(room.publicIdentity).toBeUndefined();
    expect(room.publicLedger).toBeUndefined();
    expect(room.publicEvents).toBeUndefined();
  });

  it("keeps engine dealing equal between canonical and legacy modes", () => {
    const canonical = createRoom({ rank: "2", seed: 1, publicIdentity: fixedIdentity });
    const legacy = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });

    expect(canonical.rank).toBe(legacy.rank);
    expect(canonical.hands).toEqual(legacy.hands);
    expect(canonical.initialHands).toEqual(legacy.initialHands);
    expect(canonical.currentTurn).toBe(legacy.currentTurn);
    expect(canonical.leaderSeat).toBe(legacy.leaderSeat);
    expect(canonical.openingTribute).toEqual(legacy.openingTribute);
  });

  it("keeps the legacy factory out of production browser boundaries", () => {
    const apiSource = readFileSync(resolve(process.cwd(), "src/server/api.ts"), "utf8");
    const browserSources = [
      "src/main.tsx",
      "src/ui/App.tsx",
      "src/ui/api.ts",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));

    expect(apiSource).toMatch(/roomCreator\(\{[\s\S]*publicIdentity:/);
    expect(browserSources.join("\n")).not.toContain("createLegacyBenchmarkRoom");
    expect(browserSources.join("\n")).not.toContain("PublicIdentityStore");
    expect(browserSources.join("\n")).not.toContain("better-sqlite3");
  });
});
