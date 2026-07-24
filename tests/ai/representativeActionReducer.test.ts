import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import { type CardGroup } from "../../src/engine/groups";
import { classifyPlay } from "../../src/game/playRules";
import type { ActionCandidate, AiAction } from "../../src/ai/contracts";
import {
  reduceRepresentativeActions,
  type RepresentativeActionReducerInput,
} from "../../src/ai/tactics/representativeActionReducer";

const gameRank: GameRank = "10";
const deck = createDeck();

function card(id: string): Card {
  const found = deck.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`Missing fixture card ${id}`);
  }

  return found;
}

function singleGroup(id: string): CardGroup {
  const group = classifyPlay([card(id)], gameRank);
  if (group === undefined) {
    throw new Error(`Could not classify fixture card ${id}`);
  }

  return group;
}

function playCandidate(
  cardId: string,
  overrides: Partial<Pick<ActionCandidate, "alignedPlanIds" | "reasonCodes" | "stableKey" | "policyVerdict">> = {},
): ActionCandidate {
  const group = singleGroup(cardId);
  return {
    action: { type: "play", group },
    source: "HAND_ANALYSIS",
    policyVerdict: overrides.policyVerdict ?? { allowed: true, hardViolation: false, reasonCodes: [] },
    alignedPlanIds: overrides.alignedPlanIds ?? [],
    stableKey: overrides.stableKey ?? group.id,
    reasonCodes: overrides.reasonCodes ?? [],
  };
}

function passCandidate(): ActionCandidate {
  return {
    action: { type: "pass" },
    source: "FALLBACK",
    policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] },
    alignedPlanIds: [],
    stableKey: "pass",
    reasonCodes: [],
  };
}

function cloneAction(action: AiAction): AiAction {
  if (action.type === "pass") {
    return { type: "pass" };
  }

  return {
    type: "play",
    group: {
      ...action.group,
      cards: action.group.cards.map((candidate) => ({ ...candidate })),
      wildcards: action.group.wildcards.map((candidate) => ({ ...candidate })),
    },
  };
}

function cloneCandidate(candidate: ActionCandidate): ActionCandidate {
  return {
    ...candidate,
    action: cloneAction(candidate.action),
    policyVerdict: {
      ...candidate.policyVerdict,
      reasonCodes: [...candidate.policyVerdict.reasonCodes],
    },
    alignedPlanIds: [...candidate.alignedPlanIds],
    reasonCodes: [...candidate.reasonCodes],
  };
}

function reducerInput(actions: readonly ActionCandidate[], hardCap: number): RepresentativeActionReducerInput {
  return { actions, gameRank, hardCap };
}

function candidatePayloadKey(candidate: ActionCandidate): string {
  if (candidate.action.type === "pass") {
    return JSON.stringify({
      action: "pass",
      source: candidate.source,
      policyVerdict: candidate.policyVerdict,
      alignedPlanIds: candidate.alignedPlanIds,
      stableKey: candidate.stableKey,
      reasonCodes: candidate.reasonCodes,
    });
  }

  return JSON.stringify({
    action: "play",
    groupType: candidate.action.group.type,
    groupId: candidate.action.group.id,
    cardIds: candidate.action.group.cards.map((card) => card.id).sort(),
    wildcardIds: candidate.action.group.wildcards.map((card) => card.id).sort(),
    source: candidate.source,
    policyVerdict: candidate.policyVerdict,
    alignedPlanIds: candidate.alignedPlanIds,
    stableKey: candidate.stableKey,
    reasonCodes: candidate.reasonCodes,
  });
}

function representedPayloadKeys(actions: readonly ActionCandidate[], result: { representativeInputIndices: readonly number[] }): string[] {
  return result.representativeInputIndices.map((index) => candidatePayloadKey(actions[index]!)).sort();
}

it("maps an exact duplicate payload to one representative index without active reduction under cap", () => {
  const original = playCandidate("S3-1");
  const duplicate = cloneCandidate(original);
  const result = reduceRepresentativeActions(reducerInput([original, duplicate], 2));

  expect(result.status).toBe("unchanged");
  expect(result.representativeInputIndices).toEqual([0]);
  expect(result.representativeByInputIndex).toEqual({ 0: 0, 1: 0 });
  expect(result.diagnostics).toMatchObject({ inputCount: 2, validatedCount: 2, equivalenceClassCount: 1, duplicateCount: 1, capSatisfied: true });
});

it("does not merge candidates whose physical card IDs differ", () => {
  const result = reduceRepresentativeActions(reducerInput([playCandidate("S3-1"), playCandidate("C3-1")], 2));

  expect(result.status).toBe("unchanged");
  expect(result.representativeInputIndices).toEqual([0, 1]);
  expect(result.representativeByInputIndex).toEqual({ 0: 0, 1: 1 });
});

it("fails closed when one legal stable key has different evaluator-visible metadata", () => {
  const first = playCandidate("S4-1");
  const second = cloneCandidate(first);
  second.alignedPlanIds = ["plan-a"];

  const result = reduceRepresentativeActions(reducerInput([first, second], 2));

  expect(result.status).toBe("failed");
  expect(result.failureReason).toBe("stable-key-collision");
  expect(result.representativeInputIndices).toEqual([]);
  expect(result.representativeByInputIndex).toEqual({});
  expect(result.fallback).toBe("use-original-candidates");
});

it("returns unchanged with a complete one-to-one mapping when under cap without duplicates", () => {
  const result = reduceRepresentativeActions(reducerInput([playCandidate("S5-1"), playCandidate("C5-1")], 3));

  expect(result.status).toBe("unchanged");
  expect(result.representativeInputIndices).toEqual([0, 1]);
  expect(result.representativeByInputIndex).toEqual({ 0: 0, 1: 1 });
  expect(result.diagnostics).toEqual({ inputCount: 2, validatedCount: 2, equivalenceClassCount: 2, duplicateCount: 0, capSatisfied: true });
});

it("returns reduced metadata when exact deduplication satisfies the cap", () => {
  const first = playCandidate("S6-1");
  const result = reduceRepresentativeActions(reducerInput([first, cloneCandidate(first), playCandidate("C6-1")], 2));

  expect(result.status).toBe("reduced");
  expect(result.representativeInputIndices).toEqual([0, 2]);
  expect(result.representativeByInputIndex).toEqual({ 0: 0, 1: 0, 2: 2 });
  expect(result.diagnostics.capSatisfied).toBe(true);
});

it("returns typed cap-unsatisfied failure without representatives", () => {
  const result = reduceRepresentativeActions(reducerInput([playCandidate("S7-1"), playCandidate("C7-1"), playCandidate("H7-1")], 2));

  expect(result.status).toBe("failed");
  expect(result.failureReason).toBe("cap-unsatisfied");
  expect(result.representativeInputIndices).toEqual([]);
  expect(result.representativeByInputIndex).toEqual({});
  expect(result.diagnostics).toEqual({ inputCount: 3, validatedCount: 3, equivalenceClassCount: 3, duplicateCount: 0, capSatisfied: false });
  expect(result.fallback).toBe("use-original-candidates");
});

it("keeps follow pass as an independent exact class from play", () => {
  const result = reduceRepresentativeActions(reducerInput([passCandidate(), playCandidate("S8-1")], 2));

  expect(result.representativeInputIndices).toEqual([0, 1]);
  expect(result.representativeByInputIndex).toEqual({ 0: 0, 1: 1 });
});

it("fails closed when one legal stable key maps to a different complete payload", () => {
  const first = playCandidate("S9-1");
  const second = cloneCandidate(first);
  second.policyVerdict = { allowed: true, hardViolation: false, reasonCodes: ["IMMEDIATE_FINISH"] };
  const result = reduceRepresentativeActions(reducerInput([first, second], 2));

  expect(result.status).toBe("failed");
  expect(result.failureReason).toBe("stable-key-collision");
  expect(result.representativeInputIndices).toEqual([]);
  expect(result.representativeByInputIndex).toEqual({});
  expect(result.fallback).toBe("use-original-candidates");
});

it("does not treat identical payloads sharing one stable key as a collision", () => {
  const first = playCandidate("S10-1");
  const result = reduceRepresentativeActions(reducerInput([first, cloneCandidate(first)], 2));

  expect(result.failureReason).not.toBe("stable-key-collision");
  expect(result.representativeByInputIndex).toEqual({ 0: 0, 1: 0 });
});

it("fails closed when a play stable key does not match its group ID", () => {
  const malformed = playCandidate("S9-1", { stableKey: "wrong-key" });
  const result = reduceRepresentativeActions(reducerInput([malformed], 1));

  expect(result.status).toBe("failed");
  expect(result.failureReason).toBe("stable-key-mismatch");
  expect(result.representativeInputIndices).toEqual([]);
  expect(result.representativeByInputIndex).toEqual({});
  expect(result.fallback).toBe("use-original-candidates");
});

it("preserves input bytes and returns metadata without action-control references", () => {
  const actions = [playCandidate("S2-1"), playCandidate("C2-1")];
  const before = JSON.stringify(actions);
  const result = reduceRepresentativeActions(reducerInput(actions, 2));

  expect(JSON.stringify(actions)).toBe(before);
  expect(result).not.toHaveProperty("action");
  expect(result).not.toHaveProperty("candidate");
  expect(result).not.toHaveProperty("runtime");
  expect(result).not.toHaveProperty("selectedPlanId");
  expect(result).not.toHaveProperty("activePlanId");
  expect(result).not.toHaveProperty("D2c");
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.representativeInputIndices)).toBe(true);
  expect(Object.isFrozen(result.representativeByInputIndex)).toBe(true);
  expect(Object.isFrozen(result.diagnostics)).toBe(true);
  expect(() => {
    (result.representativeInputIndices as number[]).push(9);
  }).toThrow();
  let mappingMutationThrew = false;
  try {
    (result.representativeByInputIndex as Record<number, number>)[0] = 99;
  } catch {
    mappingMutationThrew = true;
  }
  if (!mappingMutationThrew) {
    expect(result.representativeByInputIndex[0]).not.toBe(99);
  }
});

it("is deterministic for repeated calls and preserves semantic representatives across permutations", () => {
  const first = playCandidate("S3-2");
  const second = playCandidate("C3-2");
  const original = [first, cloneCandidate(first), second];
  const permuted = [second, cloneCandidate(first), first];
  const originalResult = reduceRepresentativeActions(reducerInput(original, 2));
  const repeatedResult = reduceRepresentativeActions(reducerInput(original, 2));
  const permutedResult = reduceRepresentativeActions(reducerInput(permuted, 2));

  expect(JSON.stringify(originalResult)).toBe(JSON.stringify(repeatedResult));
  expect(originalResult.representativeInputIndices).toEqual([0, 2]);
  expect(permutedResult.representativeInputIndices).toEqual([0, 1]);
  expect(representedPayloadKeys(original, originalResult)).toEqual(representedPayloadKeys(permuted, permutedResult));
});
