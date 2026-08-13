import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDeck } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { chooseAiAction, chooseFollowAction } from "../../src/game/ai";

describe("game AI compatibility adapter", () => {
  it("keeps game/ai as a thin unified-engine adapter", () => {
    const source = readFileSync(resolve(process.cwd(), "src/game/ai.ts"), "utf8");

    expect(source).toContain('from "../ai/aiDecisionEngine"');
    expect(source).not.toContain("chooseAiActionUnsafe");
    expect(source).not.toContain("mandatoryLeadFallback");
    expect(source).not.toContain("legalLeadActions");
    expect(source).not.toContain("legalFollowActions");
    expect(source).not.toContain("legacyAiReference");
    expect(source).not.toContain("protectedGroups");
  });

  it("adapts public legacy input without mutating it", () => {
    const hand = [card("S7-1")];
    const input = { hand, partnerHand: [card("HA-1")], gameRank: "10" as const, seat: 1, partnerSeat: 3 };

    const first = chooseAiAction(input);
    const second = chooseAiAction(input);

    expect(first).toEqual(second);
    expect(first.type).toBe("play");
    expect(input.hand).toEqual(hand);
  });

  it("adapts a unified follow pass into the legacy follow shape", () => {
    const lastPlay = classifyPlay([card("SA-1")], "10");
    if (lastPlay === undefined) throw new Error("Expected a legal last play");

    const result = chooseFollowAction({ hand: [card("S3-1")], gameRank: "10", seat: 1, partnerSeat: 3, lastPlay, lastPlaySeat: 0 });

    expect(result).toMatchObject({ actionType: "PASS", type: "PASS", cards: [] });
  });

  it("keeps the test-only legacy reference outside production imports", () => {
    const productionSource = sourceFiles(resolve(process.cwd(), "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(productionSource).not.toContain("legacyAiReference");
    expect(productionSource).not.toMatch(/fallbackToLegacy|useLegacyAi|legacyMode/);
  });
});

function card(id: string) {
  const value = createDeck().find((candidate) => candidate.id === id);
  if (value === undefined) throw new Error(`Missing card ${id}`);
  return value;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : [];
  });
}
