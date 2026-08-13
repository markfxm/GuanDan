import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import { type CardGroup } from "../../src/engine/groups";
import { classifyPlay } from "../../src/game/playRules";
import type { ActionCandidate, AiAction } from "../../src/ai/contracts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
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

function requirePlayGroup(candidate: ActionCandidate): CardGroup {
  const action: AiAction = candidate.action;
  if (action.type !== "play") {
    throw new Error("Expected play action candidate");
  }
  return action.group;
}

function playCandidateFromCards(cardIds: string[]): ActionCandidate {
  const cards = cardIds.map((id) => card(id));
  const group = classifyPlay(cards, gameRank);
  if (group === undefined) {
    throw new Error(`Could not classify fixture cards ${cardIds.join(",")}`);
  }

  return {
    action: { type: "play", group },
    source: "HAND_ANALYSIS",
    policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] },
    alignedPlanIds: [],
    stableKey: group.id,
    reasonCodes: [],
  };
}

function expectFailure(result: ReturnType<typeof reduceRepresentativeActions>, reason: string): void {
  expect(result.status).toBe("failed");
  expect(result.failureReason).toBe(reason);
  expect(result.representativeInputIndices).toEqual([]);
  expect(result.representativeByInputIndex).toEqual({});
  expect(result.fallback).toBe("use-original-candidates");
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.representativeInputIndices)).toBe(true);
  expect(Object.isFrozen(result.representativeByInputIndex)).toBe(true);
  expect(Object.isFrozen(result.diagnostics)).toBe(true);
}

function sparseStringArray(): string[] {
  return new Array<string>(1);
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

it.each([
  ["undefined input", undefined],
  ["null input", null],
  ["missing actions", { gameRank, hardCap: 1 }],
  ["actions is not an array", { actions: {}, gameRank, hardCap: 1 }],
  ["missing gameRank", { actions: [], hardCap: 1 }],
  ["illegal gameRank", { actions: [], gameRank: "not-a-rank", hardCap: 1 }],
] as const)("returns invalid-input for %s without throwing", (_name, value) => {
  const result = reduceRepresentativeActions(value as unknown as RepresentativeActionReducerInput);

  expectFailure(result, "invalid-input");
});

it.each([
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["zero", 0],
  ["negative", -1],
  ["fractional", 1.5],
] as const)("returns invalid-hard-cap for %s", (_name, hardCap) => {
  const result = reduceRepresentativeActions(reducerInput([playCandidate("S3-1")], hardCap));

  expectFailure(result, "invalid-hard-cap");
});

it("returns invalid-hand for a non-array hand", () => {
  const result = reduceRepresentativeActions({
    actions: [playCandidate("S3-1")],
    gameRank,
    hardCap: 1,
    hand: null as unknown as Card[],
  });

  expectFailure(result, "invalid-hand");
});

it.each([
  ["null candidate", null],
  ["undefined candidate", undefined],
  ["missing action", (() => { const { action: _action, ...candidate } = playCandidate("S3-1"); return candidate; })()],
  ["unknown action type", { ...playCandidate("S3-1"), action: { type: "discard" } }],
  ["play missing group", { ...playCandidate("S3-1"), action: { type: "play" } }],
  ["missing stableKey", (() => { const { stableKey: _stableKey, ...candidate } = playCandidate("S3-1"); return candidate; })()],
  ["stableKey is not a string", { ...playCandidate("S3-1"), stableKey: 7 }],
  ["missing policyVerdict", (() => { const { policyVerdict: _policyVerdict, ...candidate } = playCandidate("S3-1"); return candidate; })()],
  ["policy allowed is not boolean", { ...playCandidate("S3-1"), policyVerdict: { allowed: 1, hardViolation: false, reasonCodes: [] } }],
  ["policy hardViolation is not boolean", { ...playCandidate("S3-1"), policyVerdict: { allowed: true, hardViolation: 0, reasonCodes: [] } }],
  ["alignedPlanIds is not an array", { ...playCandidate("S3-1"), alignedPlanIds: "plan-a" }],
  ["alignedPlanIds contains a non-string", { ...playCandidate("S3-1"), alignedPlanIds: [1] }],
  ["reasonCodes is not an array", { ...playCandidate("S3-1"), reasonCodes: "IMMEDIATE_FINISH" }],
  ["reasonCodes contains a non-string", { ...playCandidate("S3-1"), reasonCodes: [1] }],
  ["policy reasonCodes is not an array", { ...playCandidate("S3-1"), policyVerdict: { allowed: true, hardViolation: false, reasonCodes: "IMMEDIATE_FINISH" } }],
  ["policy reasonCodes contains a non-string", { ...playCandidate("S3-1"), policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [1] } }],
  ["source is not a legal runtime value", { ...playCandidate("S3-1"), source: "UNKNOWN" }],
  ["source is not a string", { ...playCandidate("S3-1"), source: 3 }],
] as const)("returns invalid-candidate for %s without a TypeError", (_name, candidate) => {
  const result = reduceRepresentativeActions({ actions: [candidate] as unknown as ActionCandidate[], gameRank, hardCap: 1 });

  expectFailure(result, "invalid-candidate");
});

it("applies stable-key mismatch before policy inconsistency", () => {
  const malformed = playCandidate("S3-1", { stableKey: "wrong-key" });
  malformed.policyVerdict = { allowed: false, hardViolation: true, reasonCodes: [] };
  const result = reduceRepresentativeActions(reducerInput([malformed], 1));

  expectFailure(result, "stable-key-mismatch");
});

it("returns policy-inconsistency after a valid stable key", () => {
  const candidate = playCandidate("S3-1");
  candidate.policyVerdict = { allowed: false, hardViolation: true, reasonCodes: [] };
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "policy-inconsistency");
});

it("rejects a candidate whose semantic strength was tampered before follow comparison", () => {
  const candidate = playCandidate("S6-1");
  const group = requirePlayGroup(candidate);
  candidate.action = {
    type: "play",
    group: { ...group, strength: 9999 },
  };
  const result = reduceRepresentativeActions({
    actions: [candidate],
    gameRank,
    lastPlay: singleGroup("S7-1"),
    hardCap: 1,
  });

  expectFailure(result, "legality-inconsistency");
});

it.each(["id", "label", "purpose", "strength"] as const)("rejects tampered canonical lastPlay %s", (field) => {
  const canonicalLastPlay = singleGroup("S7-1");
  const tamperedLastPlay = { ...canonicalLastPlay };
  if (field === "id") {
    tamperedLastPlay.id = `tampered:${canonicalLastPlay.id}`;
  } else if (field === "label") {
    tamperedLastPlay.label = `${canonicalLastPlay.label} tampered`;
  } else if (field === "purpose") {
    tamperedLastPlay.purpose = "engine";
  } else {
    tamperedLastPlay.strength = canonicalLastPlay.strength + 1000;
  }

  const result = reduceRepresentativeActions({
    actions: [playCandidate("S8-1")],
    gameRank,
    lastPlay: tamperedLastPlay,
    hardCap: 1,
  });

  expectFailure(result, "legality-inconsistency");
});

it("accepts an unmodified canonical lastPlay", () => {
  const result = reduceRepresentativeActions({
    actions: [playCandidate("S8-1")],
    gameRank,
    lastPlay: singleGroup("S7-1"),
    hardCap: 1,
  });

  expect(result.status).toBe("unchanged");
  expect(result.representativeInputIndices).toEqual([0]);
  expect(result.representativeByInputIndex).toEqual({ 0: 0 });
});

it("rejects a pass in lead context", () => {
  const result = reduceRepresentativeActions({ actions: [passCandidate()], gameRank, hardCap: 1 });

  expectFailure(result, "legality-inconsistency");
});

it("returns legality-inconsistency for a malformed lastPlay without throwing", () => {
  const result = reduceRepresentativeActions({
    actions: [playCandidate("S8-1")],
    gameRank,
    lastPlay: null as unknown as CardGroup,
    hardCap: 1,
  });

  expectFailure(result, "legality-inconsistency");
});

it.each([
  ["card ID is not a string", (candidate: ActionCandidate) => {
    const group = requirePlayGroup(candidate);
    const malformedCard = { ...group.cards[0]! };
    Object.assign(malformedCard, { id: 7 });
    candidate.action = { type: "play", group: { ...group, cards: [malformedCard] } };
  }],
  ["card ID is empty", (candidate: ActionCandidate) => {
    const group = requirePlayGroup(candidate);
    candidate.action = { type: "play", group: { ...group, cards: [{ ...group.cards[0]!, id: "" }] as Card[] } };
  }],
] as const)("returns invalid-candidate for %s", (_name, mutate) => {
  const candidate = playCandidate("S3-1");
  mutate(candidate);
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "invalid-candidate");
});

it("returns invalid-candidate for conflicting card payloads sharing one physical ID", () => {
  const candidate = playCandidate("S3-1");
  const group = requirePlayGroup(candidate);
  const conflictingCard = { ...group.cards[0]! };
  Object.assign(conflictingCard, { rank: "4" });
  candidate.action = {
    type: "play",
    group: { ...group, cards: [group.cards[0]!, conflictingCard] },
  };
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "invalid-candidate");
});

it("returns legality-inconsistency for duplicate physical IDs in a group", () => {
  const candidate = playCandidate("S3-1");
  const group = requirePlayGroup(candidate);
  const duplicateCard = { ...group.cards[0]! };
  candidate.action = {
    type: "play",
    group: { ...group, cards: [duplicateCard, { ...duplicateCard }] },
  };
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "legality-inconsistency");
});

it("returns legality-inconsistency for duplicate physical IDs in wildcards", () => {
  const candidate = playCandidate("H10-1");
  const group = requirePlayGroup(candidate);
  const wildcard = candidate.action.type === "play" ? candidate.action.group.wildcards[0]! : undefined;
  candidate.action = {
    type: "play",
    group: { ...group, wildcards: [{ ...wildcard! }, { ...wildcard! }] },
  };
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "legality-inconsistency");
});

it("returns legality-inconsistency for duplicate physical IDs in lastPlay cards", () => {
  const canonicalLastPlay = singleGroup("S7-1");
  const result = reduceRepresentativeActions({
    actions: [playCandidate("S8-1")],
    gameRank,
    lastPlay: {
      ...canonicalLastPlay,
      cards: [canonicalLastPlay.cards[0]!, { ...canonicalLastPlay.cards[0]! }],
    },
    hardCap: 1,
  });

  expectFailure(result, "legality-inconsistency");
});

it("returns legality-inconsistency when wildcards are not part of the group", () => {
  const candidate = playCandidate("S3-1");
  const group = requirePlayGroup(candidate);
  candidate.action = {
    type: "play",
    group: { ...group, wildcards: [card("H10-1")] },
  };
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "legality-inconsistency");
});

it("returns legality-inconsistency when wildcard metadata disagrees with classifyPlay", () => {
  const candidate = playCandidate("H10-1");
  const group = requirePlayGroup(candidate);
  candidate.action = {
    type: "play",
    group: { ...group, wildcards: [] },
  };
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "legality-inconsistency");
});

it.each([
  ["null hand", null],
  ["hand card ID is not a string", [{ ...card("S3-1"), id: 3 }]],
  ["hand card ID is empty", [{ ...card("S3-1"), id: "" }]],
  ["hand contains a duplicate physical ID", [card("S3-1"), { ...card("S3-1") }]],
] as const)("returns invalid-hand for %s", (_name, hand) => {
  const result = reduceRepresentativeActions({
    actions: [playCandidate("S3-1")],
    gameRank,
    hardCap: 1,
    hand: hand as unknown as Card[],
  });

  expectFailure(result, "invalid-hand");
});

it("returns hand-ownership-mismatch when a candidate card is absent from hand", () => {
  const result = reduceRepresentativeActions({
    actions: [playCandidate("S3-1")],
    gameRank,
    hardCap: 1,
    hand: [card("S4-1")],
  });

  expectFailure(result, "hand-ownership-mismatch");
});

it.each([
  ["alignedPlanIds", (candidate: ActionCandidate) => { candidate.alignedPlanIds = sparseStringArray(); }],
  ["candidate reasonCodes", (candidate: ActionCandidate) => { candidate.reasonCodes = sparseStringArray(); }],
  ["policy reasonCodes", (candidate: ActionCandidate) => { candidate.policyVerdict.reasonCodes = sparseStringArray() as ActionCandidate["policyVerdict"]["reasonCodes"]; }],
] as const)("returns invalid-candidate for a sparse %s", (_name, mutate) => {
  const candidate = playCandidate("S3-1");
  mutate(candidate);
  const result = reduceRepresentativeActions(reducerInput([candidate], 1));

  expectFailure(result, "invalid-candidate");
});

it.each([
  ["alignedPlanIds order", (candidate: ActionCandidate) => { candidate.alignedPlanIds = ["a", "b"]; }, (candidate: ActionCandidate) => { candidate.alignedPlanIds = ["b", "a"]; }],
  ["alignedPlanIds duplicate", (candidate: ActionCandidate) => { candidate.alignedPlanIds = ["a"]; }, (candidate: ActionCandidate) => { candidate.alignedPlanIds = ["a", "a"]; }],
  ["policy reasonCodes order", (candidate: ActionCandidate) => { candidate.policyVerdict.reasonCodes = ["IMMEDIATE_FINISH", "ENDGAME_APPROVED"]; }, (candidate: ActionCandidate) => { candidate.policyVerdict.reasonCodes = ["ENDGAME_APPROVED", "IMMEDIATE_FINISH"]; }],
  ["candidate reasonCodes order", (candidate: ActionCandidate) => { candidate.reasonCodes = ["IMMEDIATE_FINISH", "ENDGAME_APPROVED"]; }, (candidate: ActionCandidate) => { candidate.reasonCodes = ["ENDGAME_APPROVED", "IMMEDIATE_FINISH"]; }],
  ["source", (candidate: ActionCandidate) => { candidate.source = "HAND_ANALYSIS"; }, (candidate: ActionCandidate) => { candidate.source = "PLAN"; }],
] as const)("returns stable-key-collision when exact payload differs by %s", (_name, mutateFirst, mutateSecond) => {
  const first = playCandidate("S4-1");
  const second = cloneCandidate(first);
  mutateFirst(first);
  mutateSecond(second);
  const result = reduceRepresentativeActions(reducerInput([first, second], 2));

  expectFailure(result, "stable-key-collision");
});

it("keeps natural, wildcard, bomb, straight-flush, and joker-bomb payloads distinct", () => {
  const actions = [
    playCandidate("S10-1"),
    playCandidate("H10-1"),
    playCandidateFromCards(["S4-1", "C4-1", "D4-1", "H4-1"]),
    playCandidateFromCards(["S4-1", "C4-1", "D4-1", "H10-1"]),
    playCandidateFromCards(["S6-1", "S5-1", "S4-1", "S3-1", "S2-1"]),
    playCandidateFromCards(["Joker-SJ-1", "Joker-BJ-1", "Joker-SJ-2", "Joker-BJ-2"]),
  ];
  const result = reduceRepresentativeActions(reducerInput(actions, actions.length));

  expect(result.status).toBe("unchanged");
  expect(result.representativeInputIndices).toEqual([0, 1, 2, 3, 4, 5]);
  expect(result.diagnostics.equivalenceClassCount).toBe(6);
});

it("keeps two real wildcard substitutions distinct", () => {
  const actions = [
    playCandidateFromCards(["S4-1", "H10-1"]),
    playCandidateFromCards(["S4-1", "H10-2"]),
  ];
  const result = reduceRepresentativeActions(reducerInput(actions, actions.length));

  expect(result.status).toBe("unchanged");
  expect(result.representativeInputIndices).toEqual([0, 1]);
  expect(result.diagnostics.equivalenceClassCount).toBe(2);
});

it("deep-freezes and detaches a non-empty success result deterministically", () => {
  const actions = [playCandidate("S3-1"), playCandidate("C3-1")];
  const input = reducerInput(actions, 2);
  const before = JSON.stringify(input);
  const first = reduceRepresentativeActions(input);
  const second = reduceRepresentativeActions(input);

  expect(first.status).toBe("unchanged");
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(JSON.stringify(input)).toBe(before);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.representativeInputIndices)).toBe(true);
  expect(Object.isFrozen(first.representativeByInputIndex)).toBe(true);
  expect(Object.isFrozen(first.diagnostics)).toBe(true);
  expect(first.representativeInputIndices).not.toBe(actions);
  expect(first.representativeByInputIndex).not.toBe(actions[0]);
  expect(JSON.stringify(first)).not.toContain("S3-1");
});

it("keeps reducer production imports and calls inside the approved AST boundary", () => {
  const fileName = resolve(process.cwd(), "src/ai/tactics/representativeActionReducer.ts");
  const sourceFile = ts.createSourceFile(fileName, readFileSync(fileName, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const forbiddenImportTokens = ["node:fs", "node:path", "node:net", "node:http", "node:https", "node:child_process", "room", "game/ai", "aiDecisionEngine", "planManager", "handPlanner", "D2c", "benchmark", "simulation", "server", "test"];
  const importPaths = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text);
  expect(importPaths.some((path) => forbiddenImportTokens.some((token) => path.includes(token)))).toBe(false);

  const forbiddenCallNames = new Set([
    "random",
    "now",
    "localeCompare",
    "fetch",
    "generateActionCandidates",
    "evaluateActionCandidate",
    "planner",
    "runtime",
    "readFileSync",
    "writeFileSync",
    "existsSync",
    "readdirSync",
    "createReadStream",
    "createWriteStream",
    "connect",
    "request",
    "exec",
    "spawn",
    "fork",
  ]);
  const forbiddenCalls: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression)
          ? expression.name.text
          : undefined;
      if (name !== undefined && forbiddenCallNames.has(name)) {
        forbiddenCalls.push(name);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  expect(forbiddenCalls).toEqual([]);
});

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
  const result = reduceRepresentativeActions({
    actions: [passCandidate(), playCandidate("S8-1")],
    gameRank,
    lastPlay: singleGroup("S7-1"),
    hardCap: 2,
  });

  expect(result.status).toBe("unchanged");
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
