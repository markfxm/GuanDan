import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("keeps tactics modules independent from room and legacy decision internals", () => {
  for (const file of ["roleEvaluator.ts", "actionGenerator.ts", "actionEvaluator.ts"]) {
    const source = readFileSync(resolve(process.cwd(), "src/ai/tactics", file), "utf8");
    expect(source).not.toContain("../../game/room");
    expect(source).not.toContain("../../game/ai");
    expect(source).not.toMatch(/isLegalBombReduction|powerProtectionLevel/);
    if (file === "actionGenerator.ts") expect(source).not.toContain("evaluateActionCandidate");
    if (file === "actionEvaluator.ts") expect(source).not.toMatch(/playCards|RoomState/);
    if (file === "roleEvaluator.ts") expect(source).not.toContain("generateActionCandidates");
  }
});
