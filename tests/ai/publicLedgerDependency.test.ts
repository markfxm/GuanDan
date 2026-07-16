import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("D2a dependency direction", () => {
  it("keeps the public ledger independent from benchmark and hidden-information modules", () => {
    for (const file of ["src/game/publicEvent.ts", "src/game/publicEventHash.ts", "src/game/publicLedger.ts", "src/game/publicEventReplay.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/tests\/benchmark|opponentsHands|partnerHand|ParticleBank|hypotheticalHands|deck/);
    }
  });
});
