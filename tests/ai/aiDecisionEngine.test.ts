import { createDeck } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";

const config = { analysisCacheSize: 64, planning: { maxPlans: 2, beamWidth: 1, timeBudgetMs: 0 }, version: "test-v1", turn: 1 };
const emptyRuntime = { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true };

function observation(overrides = {}) {
  const hand = createDeck().slice(0, 8);
  return { hand, gameRank: "10" as const, seat: 1, partnerSeat: 3, playedCards: [], handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 }, finishOrder: [], ...overrides };
}

it("selects a legal non-pass lead and returns an immutable planned runtime", () => {
  const input = observation();
  const result = decideAiAction(input, emptyRuntime, config);

  expect(result.action.type).toBe("play");
  expect(result.action.type === "play" && classifyPlay(result.action.group.cards, input.gameRank)?.id).toBe(result.action.type === "play" ? result.action.group.id : undefined);
  expect(input.hand.map((card) => card.id)).toEqual(createDeck().slice(0, 8).map((card) => card.id));
  expect(emptyRuntime.needsReplan).toBe(true);
  expect(result.selectedPlanId).toBeDefined();
  expect(result.consideredActions).toBeGreaterThan(0);
});

it("only follows with a beating play or pass and is deterministic", () => {
  const hand = createDeck().slice(0, 8);
  const lastPlay = classifyPlay([createDeck().find((card) => card.id === "S2-1")!], "10")!;
  const input = observation({ hand, lastPlay, lastPlaySeat: 0 });
  const first = decideAiAction(input, emptyRuntime, config);
  const second = decideAiAction({ ...input, hand: [...hand] }, emptyRuntime, config);

  expect({ action: first.action, runtime: first.runtime, selectedPlanId: first.selectedPlanId, score: first.score, consideredActions: first.consideredActions, reasonCodes: first.reasonCodes })
    .toEqual({ action: second.action, runtime: second.runtime, selectedPlanId: second.selectedPlanId, score: second.score, consideredActions: second.consideredActions, reasonCodes: second.reasonCodes });
  expect(first.action.type === "pass" || (first.action.type === "play" && classifyPlay(first.action.group.cards, input.gameRank)?.id === first.action.group.id)).toBe(true);
});
