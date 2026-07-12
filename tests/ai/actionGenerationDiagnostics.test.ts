import { createDeck } from "../../src/engine/cards";
import { analyzeHand } from "../../src/ai/analysis/handAnalyzer";
import { createAiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { generateActionCandidates } from "../../src/ai/tactics/actionGenerator";
import { classifyPlay } from "../../src/game/playRules";
import { evaluatePowerGroupUse } from "../../src/ai/policy/powerGroupPolicy";

it("does not rescan the current hand while generating lead candidates from HandAnalysis", () => {
  const hand = createDeck().slice(0, 12);
  const diagnostics = createAiPlanningDiagnostics();

  generateActionCandidates({
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    analysis: analyzeHand(hand, "10"),
    diagnostics,
  });

  expect(diagnostics.detectGroupsBySource["lead-candidate-generation"] ?? 0).toBe(0);
});

it("keeps the legacy classifyPlay candidate set while using canonical HandAnalysis groups", () => {
  const hand = createDeck().slice(0, 12);
  const analysis = analyzeHand(hand, "10");
  const expected = analysis.groups
    .filter((group) => classifyPlay(group.cards, "10")?.id === group.id)
    .filter((group) => evaluatePowerGroupUse(group, hand, analysis.groups, "10").allowed)
    .map((group) => group.id)
    .sort();
  const actual = generateActionCandidates({ hand, gameRank: "10", seat: 1, partnerSeat: 3, analysis })
    .flatMap((candidate) => candidate.action.type === "play" ? [candidate.action.group.id] : [])
    .sort();

  expect(actual).toEqual(expected);
});
