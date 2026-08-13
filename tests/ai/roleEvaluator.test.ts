import { createDeck } from "../../src/engine/cards";
import { evaluateAiRole } from "../../src/ai/tactics/roleEvaluator";

it("evaluates roles deterministically from the visible hand only", () => {
  const hand = ["S6-1", "C6-1", "H6-1", "D6-1", "S8-1", "C7-1", "D5-1"]
    .map((id) => createDeck().find((card) => card.id === id)!);
  const input = { hand, gameRank: "10" as const };

  expect(evaluateAiRole(input)).toEqual(evaluateAiRole({ ...input, hand: [...hand] }));
  expect(evaluateAiRole(input).role).toBe("support");
});
