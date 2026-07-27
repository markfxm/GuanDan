import { expect, it } from "vitest";
import { createDeck } from "../../src/engine/cards";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import { createAiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../src/ai/config";
import { canonicalJson } from "./d0FixtureCanonicalizer";
import type { AiDecisionConfig, AiObservation, AiRuntimeState, RepresentativeActionShadowMode } from "../../src/ai/contracts";

const deck = createDeck();

const observation = (): AiObservation => ({
  hand: deck.slice(0, 8).map((card) => ({ ...card })),
  gameRank: "10", seat: 1, partnerSeat: 3, playedCards: [],
  handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 }, finishOrder: [],
});

const runtime = (): AiRuntimeState => ({
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  });

const decideWith = (mode: RepresentativeActionShadowMode) => {
  const diagnostics = createAiPlanningDiagnostics();
  const decision = decideAiAction(observation(), runtime(), {
    ...DEFAULT_AI_PERFORMANCE_CONFIG,
    turn: 1,
    diagnostics,
    representativeActionShadow: { mode, hardCap: 256 },
  } satisfies AiDecisionConfig);
  return { decision, diagnostics };
};

it("keeps action, runtime, candidate count and score bytes locked across disabled and shadow", () => {
  const disabled = decideWith("disabled");
  const shadow = decideWith("shadow");

  expect(canonicalJson(shadow.decision.action)).toBe(canonicalJson(disabled.decision.action));
  expect(canonicalJson(shadow.decision.runtime)).toBe(canonicalJson(disabled.decision.runtime));
  expect(shadow.decision.candidateCount).toBe(disabled.decision.candidateCount);
  expect(shadow.decision.consideredActions).toBe(disabled.decision.consideredActions);
  expect(canonicalJson(shadow.decision.score)).toBe(canonicalJson(disabled.decision.score));
  expect(canonicalJson(shadow.decision.reasonCodes)).toBe(canonicalJson(disabled.decision.reasonCodes));
  expect(shadow.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
  const [record] = shadow.diagnostics.representativeActionShadow.records;
  expect(record).toBeDefined();
  expect(Object.keys(record ?? {})).not.toEqual(expect.arrayContaining([
    "representativeInputIndices",
    "representativeByInputIndex",
    "stableKey",
    "action",
    "candidate",
    "group",
    "cards",
    "hand",
    "lastPlay",
    "runtime",
    "Room",
  ]));
});
