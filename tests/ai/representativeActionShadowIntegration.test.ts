import { expect, it } from "vitest";
import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../src/ai/config";
import { createAiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import type { AiDecisionConfig, AiObservation, AiRuntimeState, RepresentativeActionShadowMode } from "../../src/ai/contracts";
import type { CardGroup } from "../../src/engine/groups";

const gameRank: GameRank = "10";
const deck = createDeck();

const singleGroup = (id: string): CardGroup => {
  const card = deck.find((candidate: Card) => candidate.id === id);
  if (card === undefined) throw new Error(`Missing fixture card ${id}`);
  const group = classifyPlay([card], gameRank);
  if (group === undefined) throw new Error(`Could not classify fixture card ${id}`);
  return group;
};

const observation = (lastPlayId?: string): AiObservation => {
  return {
    hand: deck.slice(0, 8).map((card) => ({ ...card })),
    gameRank,
    seat: 1,
    partnerSeat: 3,
    playedCards: [],
    handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 },
    finishOrder: [],
    ...(lastPlayId === undefined ? {} : { lastPlay: singleGroup(lastPlayId), lastPlaySeat: 0 }),
  };
};

const emptyRuntime = (): AiRuntimeState => ({
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  });

const configFor = (mode: RepresentativeActionShadowMode, diagnostics: ReturnType<typeof createAiPlanningDiagnostics>): AiDecisionConfig => ({
    ...DEFAULT_AI_PERFORMANCE_CONFIG,
    turn: 1,
    diagnostics,
    representativeActionShadow: { mode, hardCap: 256 },
  });

it("keeps disabled mode at zero observer/reducer counts", () => {
  const diagnostics = createAiPlanningDiagnostics();
  const decision = decideAiAction(observation(), emptyRuntime(), configFor("disabled", diagnostics));

  expect(decision.candidateCount).toBeGreaterThan(0);
  expect(diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 0, reducerAttemptCount: 0, reducerResultCount: 0 });
});

it("RED: observes once after real candidate generation", () => {
  const diagnostics = createAiPlanningDiagnostics();
  const decision = decideAiAction(observation(), emptyRuntime(), configFor("shadow", diagnostics));

  expect(decision.candidateCount).toBeGreaterThan(0);
  expect(diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
});
