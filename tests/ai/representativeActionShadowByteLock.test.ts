import { expect, it } from "vitest";
import { createDeck, type Card } from "../../src/engine/cards";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import { createAiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../src/ai/config";
import { canonicalJson } from "./d0FixtureCanonicalizer";
import type { AiDecisionConfig, AiObservation, AiRuntimeState, RepresentativeActionShadowMode } from "../../src/ai/contracts";
import { detectGroups, type CardGroup } from "../../src/engine/groups";
import { classifyPlay } from "../../src/game/playRules";
import { reduceRepresentativeActions } from "../../src/ai/tactics/representativeActionReducer";
import type { ActionCandidate } from "../../src/ai/contracts";

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

function candidateForGroup(group: CardGroup): ActionCandidate {
  return {
    action: { type: "play", group },
    source: "HAND_ANALYSIS",
    policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] },
    alignedPlanIds: [],
    stableKey: group.id,
    reasonCodes: [],
  };
}

it("locks the real 256/257 diagnostic cap boundaries", () => {
  const hand: Card[] = createDeck().slice(0, 27);
  const groups = detectGroups(hand, "10");
  expect(groups.length).toBeGreaterThanOrEqual(257);
  expect(groups.slice(0, 257).every((group) => group.cards.every((card) => hand.some((owned) => owned.id === card.id)))).toBe(true);

  const validGroups = groups.filter((group) => {
    const probe = reduceRepresentativeActions({
      actions: [candidateForGroup(group)],
      hand,
      gameRank: "10",
      hardCap: 256,
    });
    return probe.status !== "failed";
  });
  expect(validGroups.length).toBeGreaterThanOrEqual(257);

  const candidates = validGroups.slice(0, 257).map(candidateForGroup);
  expect(new Set(candidates.map((candidate) => candidate.stableKey)).size).toBe(257);
  expect(candidates.every((candidate) => candidate.action.type === "play" && candidate.stableKey === candidate.action.group.id)).toBe(true);
  expect(candidates.every((candidate) => candidate.action.type === "play" && canonicalJson(classifyPlay(candidate.action.group.cards, "10")) === canonicalJson(candidate.action.group))).toBe(true);
  expect(candidates.every((candidate) => candidate.action.type === "play" && candidate.action.group.cards.every((card) => hand.some((owned) => owned.id === card.id)))).toBe(true);
  const four = reduceRepresentativeActions({ actions: candidates.slice(0, 4), hand, gameRank: "10", hardCap: 256 });
  const twoHundredFiftySix = reduceRepresentativeActions({ actions: candidates.slice(0, 256), hand, gameRank: "10", hardCap: 256 });
  const twoHundredFiftySeven = reduceRepresentativeActions({ actions: candidates, hand, gameRank: "10", hardCap: 256 });
  const invalid = reduceRepresentativeActions({ actions: candidates.slice(0, 4), hand, gameRank: "10", hardCap: 0 });

  expect(four.status).not.toBe("failed");
  expect(twoHundredFiftySix.status).not.toBe("failed");
  expect(twoHundredFiftySeven).toMatchObject({ status: "failed", failureReason: "cap-unsatisfied" });
  expect(invalid).toMatchObject({ status: "failed", failureReason: "invalid-hard-cap" });
});
