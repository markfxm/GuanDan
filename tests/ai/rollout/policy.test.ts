import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createDeck, type Card } from "../../../src/engine/cards";
import type { CardGroup } from "../../../src/engine/groups";
import { classifyPlay } from "../../../src/game/playRules";
import { playPublicStableKey, type PublicSeat } from "../../../src/game/publicEvent";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import { canonicalActionIdentity, type RolloutPolicyResult } from "../../../src/ai/rollout/contracts";
import { canonicalCrnDomainBytes, createCrnCoordinate, deriveRandomDomain, createCanonicalSemanticKey } from "../../../src/ai/rollout/identity";
import { createCrnView } from "../../../src/ai/rollout/crn";
import * as policyModule from "../../../src/ai/rollout/policy";

const policyPath = path.resolve(process.cwd(), "src/ai/rollout/policy.ts");

async function loadPolicyModule(): Promise<Record<string, unknown>> {
  return policyModule as Record<string, unknown>;
}

function makeObservation(): Record<string, unknown> {
  const hand = createDeck().slice(0, 2);
  return {
    hand,
    publicHistoryEvents: [],
    handCounts: { 0: 2, 1: 1, 2: 1, 3: 1 },
    currentLastPlay: null,
    finishOrder: [],
    gameRank: "2",
  };
}

function makeCrnView(): ReturnType<typeof createCrnView> {
  const coordinate = createCrnCoordinate({
    rootIdentity: "0".repeat(64),
    scenarioIdentity: "1".repeat(64),
    replicateIdentity: "2".repeat(64),
    ply: 0,
    actingSeat: 0,
    randomDomain: "policy-action-v1",
  });
  expect(coordinate.ok).toBe(true);
  if (!coordinate.ok) throw new Error("CRN_FIXTURE_INVALID");
  const randomDomain = deriveRandomDomain(coordinate.value);
  const view = createCrnView({ coordinate: coordinate.value, randomDomain });
  expect(view.ok).toBe(true);
  return view;
}

function makePassEvent(eventIndex: number, gameId = "policy-observation", seat: PublicSeat = 0, handCount = 2) {
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId,
    roundIdentity: `${gameId}:round:0`,
    handIdentity: `${gameId}:round:0:hand:0`,
    eventIndex,
    kind: "pass",
    seat,
    publicStableKey: "pass:v2",
    handCountBefore: handCount,
    handCountAfter: handCount,
    trickIndex: 0,
  });
}

function makePlayEvent(group: CardGroup, eventIndex = 0, seat: PublicSeat = 1, handCountBefore = group.cards.length + 1, handCountAfter = 1, gameId = "policy-observation") {
  const publicCardIds = [...group.cards.map((card) => card.id)].sort();
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId,
    roundIdentity: `${gameId}:round:0`,
    handIdentity: `${gameId}:round:0:hand:0`,
    eventIndex,
    kind: "play",
    seat,
    publicStableKey: playPublicStableKey(publicCardIds),
    patternType: group.type,
    groupType: group.type,
    handCountBefore,
    handCountAfter,
    trickIndex: 0,
    publicCardIds,
  });
}

function makeFinishEvent(eventIndex: number, seat: 0 | 1 | 2 | 3, finishPosition: number, finishReason: "hand-empty" | "round-settlement" = "hand-empty", remainingHandCount = 0, gameId = "policy-observation") {
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId,
    roundIdentity: `${gameId}:round:0`,
    handIdentity: `${gameId}:round:0:hand:0`,
    eventIndex,
    kind: "finish",
    seat,
    publicStableKey: `finish:${finishPosition}:${finishReason}`,
    trickIndex: 0,
    finishPosition,
    remainingHandCount,
    finishReason,
  });
}

function makeTrickClearEvent(eventIndex: number, leadSeat: 0 | 1 | 2 | 3, gameId = "policy-observation") {
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId,
    roundIdentity: `${gameId}:round:0`,
    handIdentity: `${gameId}:round:0:hand:0`,
    eventIndex,
    kind: "trick-clear",
    seat: leadSeat,
    publicStableKey: "trick-clear:0:1",
    trickIndex: 0,
    leadSeat,
  });
}

function classifiedGroup(cardId: string): CardGroup {
  const card = createDeck().find((candidate) => candidate.id === cardId);
  if (card === undefined) throw new Error(`POLICY_FIXTURE_CARD_MISSING:${cardId}`);
  const group = classifyPlay([card], "2");
  expect(group).toBeDefined();
  if (group === undefined) throw new Error(`POLICY_FIXTURE_GROUP_REJECTED:${cardId}`);
  return structuredClone(group);
}

describe("D2F fixed internal rollout policy", () => {
  test("maps the supported policy id to one fixed internal policy", async () => {
    if (!existsSync(policyPath)) {
      expect(existsSync(policyPath), "fixed internal policy factory is missing").toBe(true);
      return;
    }
    const policy = await loadPolicyModule();
    expect(typeof policy.createInternalRolloutPolicy).toBe("function");

    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
      failure?: unknown;
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    expect(typeof result.policy?.chooseAction).toBe("function");

    const crn = makeCrnView();
    expect(crn.ok).toBe(true);
    if (!crn.ok) return;
    const actionResult = result.policy!.chooseAction(makeObservation(), {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, crn.view);
    expect(actionResult).toMatchObject({ ok: true });
    if (typeof actionResult === "object" && actionResult !== null && "ok" in actionResult && actionResult.ok === true && "action" in actionResult) {
      expect((actionResult as { action: unknown }).action).toEqual(expect.any(Object));
      expect(canonicalActionIdentity((actionResult as { action: never }).action)).toEqual(expect.any(String));
    }
  });

  test("rejects unknown and malformed policy ids without fallback", async () => {
    if (!existsSync(policyPath)) {
      expect(existsSync(policyPath), "fixed internal policy factory is missing").toBe(true);
      return;
    }
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => unknown;
    for (const policyId of ["custom", "", 1, null, {}, () => undefined]) {
      expect(() => factory(policyId)).not.toThrow();
      expect(factory(policyId)).toEqual({ ok: false, failure: { kind: "unsupported-policy-id" } });
    }
  });

  test("keeps policy observation seat-local and does not accept executable inputs", async () => {
    if (!existsSync(policyPath)) {
      expect(existsSync(policyPath), "fixed internal policy factory is missing").toBe(true);
      return;
    }
    const policySource = readFileSync(policyPath, "utf8");
    expect(policySource).not.toMatch(/RolloutScenario|privateState|initialHands|RoomState|HandPlanner|decideAiAction|Math\.random|Date\.now|performance\.now|\.bind\(|\bnext\s*\(|\bcursor\b|\btape\b/);
    expect(policySource).not.toMatch(/candidateId|candidateIdentity|candidateAssociationIdentity/);

    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => RolloutPolicyResult };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;

    let getterCalls = 0;
    const hostileObservation = makeObservation();
    Object.defineProperty(hostileObservation, "otherHands", {
      configurable: true,
      get: () => {
        getterCalls += 1;
        return [createDeck().slice(2)];
      },
    });
    const view = makeCrnView();
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const action = result.policy.chooseAction(hostileObservation, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, view.view);
    expect(action).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(getterCalls).toBe(0);
  });

  test("uses candidate-free semantic keys for CRN values", () => {
    const key = createCanonicalSemanticKey("policy-action:play:single:H7-1");
    expect(key.ok).toBe(true);
    expect(canonicalCrnDomainBytes).toBeTypeOf("function");
    expect(key).not.toHaveProperty("candidateId");
  });

  test("rejects a nested malformed observation without invoking or mutating caller data", async () => {
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;
    const observation = makeObservation();
    observation.handCounts = { 0: Number.NaN, 1: 1, 2: 1, 3: 1 };
    const before = structuredClone(observation);
    const crn = makeCrnView();
    expect(crn.ok).toBe(true);
    if (!crn.ok) return;
    const action = result.policy.chooseAction(observation, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, crn.view);
    expect(action).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(observation).toEqual(before);
  });

  test("rejects hostile nested observation shapes before policy or CRN observation", async () => {
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { listLegalActions: (observation: unknown) => readonly unknown[]; chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;

    const numericValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, -1, Number.MAX_SAFE_INTEGER + 1, -0];
    for (const value of numericValues) {
      const observation = makeObservation();
      (observation.handCounts as Record<string, unknown>)["0"] = value;
      expect(result.policy.listLegalActions(observation)).toEqual([]);
    }

    const invalidObservations: Record<string, unknown>[] = [];
    const missingSeat = makeObservation();
    delete (missingSeat.handCounts as Record<string, unknown>)["3"];
    invalidObservations.push(missingSeat);
    const extraSeat = makeObservation();
    (extraSeat.handCounts as Record<string, unknown>)["4"] = 0;
    invalidObservations.push(extraSeat);
    const duplicateFinish = makeObservation();
    duplicateFinish.finishOrder = [0, 0];
    invalidObservations.push(duplicateFinish);
    const unknownFinish = makeObservation();
    unknownFinish.finishOrder = [4];
    invalidObservations.push(unknownFinish);
    const inconsistentFinishCount = makeObservation();
    inconsistentFinishCount.finishOrder = [0];
    invalidObservations.push(inconsistentFinishCount);
    const malformedCard = makeObservation();
    malformedCard.hand = [{ id: "forged", kind: "suited", rank: "A", suit: "spades", copy: 1 }];
    invalidObservations.push(malformedCard);
    const malformedLastPlay = makeObservation();
    malformedLastPlay.currentLastPlay = { type: "single" };
    invalidObservations.push(malformedLastPlay);
    const malformedHistory = makeObservation();
    malformedHistory.publicHistoryEvents = [{ kind: "play" }];
    invalidObservations.push(malformedHistory);
    const nonContiguousHistory = makeObservation();
    nonContiguousHistory.publicHistoryEvents = [makePassEvent(1)];
    invalidObservations.push(nonContiguousHistory);
    const duplicateIndexHistory = makeObservation();
    duplicateIndexHistory.publicHistoryEvents = [makePassEvent(0), makePassEvent(0)];
    invalidObservations.push(duplicateIndexHistory);
    const crossGameHistory = makeObservation();
    crossGameHistory.publicHistoryEvents = [makePassEvent(0, "policy-a"), makePassEvent(1, "policy-b")];
    invalidObservations.push(crossGameHistory);
    const sparseHistory = makeObservation();
    sparseHistory.publicHistoryEvents = new Array(1);
    invalidObservations.push(sparseHistory);
    const expandoHistory = makeObservation();
    (expandoHistory.publicHistoryEvents as unknown[] & { extra?: number }).extra = 1;
    invalidObservations.push(expandoHistory);
    const customPrototype = makeObservation();
    Object.setPrototypeOf(customPrototype, { inherited: true });
    invalidObservations.push(customPrototype);
    const symbolObservation = makeObservation();
    Object.defineProperty(symbolObservation, Symbol("hostile"), { value: 1 });
    invalidObservations.push(symbolObservation);

    let getterCalls = 0;
    const nestedGetter = makeObservation();
    Object.defineProperty((nestedGetter.hand as unknown[])[0] as object, "rank", { get: () => { getterCalls += 1; return "A"; } });
    invalidObservations.push(nestedGetter);

    for (const observation of invalidObservations) {
      let crnCalls = 0;
      const action = result.policy.chooseAction(observation, {
        replicateIdentity: "2".repeat(64),
        ply: 0,
        actingSeat: 0,
      }, { value: () => { crnCalls += 1; return 0.5; } });
      expect(action).toEqual({
        ok: false,
        failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
      });
      expect(crnCalls).toBe(0);
    }
    expect(getterCalls).toBe(0);
  });

  test("replaces caller classification authority with the exact canonical currentLastPlay", async () => {
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;

    const canonical = classifiedGroup("S3-1");
    const canonicalObservation = makeObservation();
    canonicalObservation.currentLastPlay = canonical;
    canonicalObservation.publicHistoryEvents = [makePlayEvent(canonical)];
    expect(result.policy.chooseAction(canonicalObservation, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => 0.5 })).toMatchObject({ ok: true });

    const suitedThree = canonical.cards[0]!;
    const clubThree = createDeck().find((card) => card.id === "C3-1")!;
    const heartTwo = createDeck().find((card) => card.id === "H2-1")!;
    const heartThree = createDeck().find((card) => card.id === "H3-1")!;
    const canonicalHeartTwo = classifiedGroup("H2-1");
    const canonicalHeartThree = classifiedGroup("H3-1");
    const cases: Array<readonly [string, CardGroup]> = [
      ["label", { ...canonical, label: `${canonical.label}-forged` }],
      ["purpose", { ...canonical, purpose: canonical.purpose === "attack" ? "risk" : "attack" }],
      ["type", { ...canonical, type: "pair" }],
      ["strength", { ...canonical, strength: canonical.strength + 1 }],
      ["cards", { ...canonical, cards: [clubThree] }],
      ["card ID", { ...canonical, cards: [{ ...suitedThree, id: "S3-2" }] }],
      ["duplicate wildcard", { ...canonicalHeartTwo, wildcards: [heartTwo, heartTwo] }],
      ["non-current-rank heart wildcard", { ...canonicalHeartThree, wildcards: [heartThree] }],
      ["group-external wildcard", { ...canonical, wildcards: [heartTwo] }],
    ];

    for (const [name, forgedGroup] of cases) {
      const observation = makeObservation();
      observation.currentLastPlay = forgedGroup;
      observation.publicHistoryEvents = [makePlayEvent(canonical)];
      let crnCalls = 0;
      const action = result.policy.chooseAction(observation, {
        replicateIdentity: "2".repeat(64),
        ply: 0,
        actingSeat: 0,
      }, { value: () => { crnCalls += 1; return 0.5; } });
      expect(action, name).toEqual({
        ok: false,
        failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
      });
      expect(crnCalls, name).toBe(0);
    }
  });

  test("proves valid lead and response observations always retain an action", async () => {
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => RolloutPolicyResult };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;
    let invalidObservationCrnCalls = 0;
    const invalidObservationCrn = { value: () => { invalidObservationCrnCalls += 1; return 0.5; } };
    const invalidSeat = result.policy.chooseAction(makeObservation(), {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 4,
    }, invalidObservationCrn);
    expect(invalidSeat).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "actingSeat", reason: "invalid-acting-seat" },
    });

    const finishedObservation = makeObservation();
    finishedObservation.hand = [];
    finishedObservation.handCounts = { 0: 0, 1: 1, 2: 1, 3: 1 };
    finishedObservation.finishOrder = [0];
    expect(result.policy.chooseAction(finishedObservation, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, invalidObservationCrn)).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });

    const handCountMismatch = makeObservation();
    handCountMismatch.handCounts = { 0: 2, 1: 2, 2: 1, 3: 1 };
    const mismatchGroup = classifiedGroup("S3-1");
    handCountMismatch.currentLastPlay = mismatchGroup;
    handCountMismatch.publicHistoryEvents = [makePlayEvent(mismatchGroup)];
    expect(result.policy.chooseAction(handCountMismatch, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, invalidObservationCrn)).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });

    const finishHistoryMismatch = makeObservation();
    finishHistoryMismatch.hand = [];
    finishHistoryMismatch.handCounts = { 0: 0, 1: 1, 2: 1, 3: 1 };
    finishHistoryMismatch.finishOrder = [0];
    expect(result.policy.chooseAction(finishHistoryMismatch, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 1,
    }, invalidObservationCrn)).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(invalidObservationCrnCalls).toBe(0);

    const leadObservation = makeObservation();
    const leadBefore = structuredClone(leadObservation);
    const lead = result.policy.chooseAction(leadObservation, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => 0.5 });
    expect(lead).toMatchObject({ ok: true, action: { type: "play" } });
    if (lead.ok && lead.action.type === "play") {
      const handIds = (leadObservation.hand as readonly Card[]).map((card) => card.id);
      expect(lead.action.group.cards.every((card) => handIds.includes(card.id))).toBe(true);
    }
    expect(lead).not.toMatchObject({ failure: { kind: "no-legal-action" } });
    expect(lead).not.toMatchObject({ failure: { kind: "crn-failure" } });
    expect(leadObservation).toEqual(leadBefore);

    const responseObservation = makeObservation();
    const jokerBomb = classifyPlay(createDeck().filter((card) => card.kind === "joker"), "2");
    if (jokerBomb === undefined) throw new Error("JOKER_BOMB_FIXTURE_INVALID");
    responseObservation.currentLastPlay = jokerBomb;
    responseObservation.publicHistoryEvents = [makePlayEvent(jokerBomb)];
    const responseBefore = structuredClone(responseObservation);
    const response = result.policy.chooseAction(responseObservation, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => 0.5 });
    expect(response).toMatchObject({ ok: true, action: { type: "pass" } });
    expect(response).not.toMatchObject({ failure: { kind: "no-legal-action" } });
    expect(response).toMatchObject({ ok: true });
    expect(responseObservation).toEqual(responseBefore);

    let calls = 0;
    const throwing = result.policy.chooseAction(makeObservation(), {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => { calls += 1; throw new Error("CRN_HOSTILE"); } });
    expect(throwing).toEqual({
      ok: false,
      failure: { kind: "crn-failure", field: "value", reason: "throwing-value" },
    });
    expect(calls).toBe(1);
  });

  test("rejects forged finish attribution and trick-clear winner before CRN", async () => {
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;

    const group = classifiedGroup("S3-1");
    const finishMismatch = makeObservation();
    finishMismatch.hand = [createDeck()[0]];
    finishMismatch.handCounts = { 0: 1, 1: 1, 2: 0, 3: 1 };
    finishMismatch.finishOrder = [2];
    finishMismatch.currentLastPlay = group;
    finishMismatch.publicHistoryEvents = [makePlayEvent(group, 0), makeFinishEvent(1, 2, 1)];
    let finishMismatchCrnCalls = 0;
    expect(result.policy.chooseAction(finishMismatch, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => { finishMismatchCrnCalls += 1; return 0.5; } })).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(finishMismatchCrnCalls).toBe(0);

    const passBeforeFinish = makeObservation();
    passBeforeFinish.hand = [createDeck()[0]];
    passBeforeFinish.handCounts = { 0: 1, 1: 0, 2: 1, 3: 1 };
    passBeforeFinish.finishOrder = [1];
    passBeforeFinish.currentLastPlay = group;
    passBeforeFinish.publicHistoryEvents = [
      makePlayEvent(group, 0, 1, 1, 0),
      makePassEvent(1, "policy-observation", 0, 1),
      makeFinishEvent(2, 1, 1),
    ];
    let passBeforeFinishCrnCalls = 0;
    expect(result.policy.chooseAction(passBeforeFinish, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => { passBeforeFinishCrnCalls += 1; return 0.5; } })).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(passBeforeFinishCrnCalls).toBe(0);

    const forgedWinner = makeObservation();
    forgedWinner.hand = [createDeck()[0]];
    forgedWinner.handCounts = { 0: 1, 1: 1, 2: 1, 3: 1 };
    forgedWinner.currentLastPlay = null;
    forgedWinner.publicHistoryEvents = [
      makePlayEvent(group, 0, 0, 2, 1),
      makePassEvent(1, "policy-observation", 1, 1),
      makePassEvent(2, "policy-observation", 2, 1),
      makePassEvent(3, "policy-observation", 3, 1),
      makeTrickClearEvent(4, 3),
    ];
    let forgedWinnerCrnCalls = 0;
    expect(result.policy.chooseAction(forgedWinner, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => { forgedWinnerCrnCalls += 1; return 0.5; } })).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(forgedWinnerCrnCalls).toBe(0);
  });

  test("rejects premature settlement and terminal follow-up actions before CRN", async () => {
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;

    const firstGroup = classifiedGroup("S3-1");
    const secondGroup = classifiedGroup("C3-1");
    const prematureSettlement = makeObservation();
    prematureSettlement.hand = [createDeck()[0]!];
    prematureSettlement.handCounts = { 0: 1, 1: 0, 2: 0, 3: 1 };
    prematureSettlement.finishOrder = [1, 2];
    prematureSettlement.currentLastPlay = firstGroup;
    prematureSettlement.publicHistoryEvents = [
      makePlayEvent(firstGroup, 0, 1, 1, 0),
      makeFinishEvent(1, 1, 1),
      makeFinishEvent(2, 2, 2, "round-settlement"),
    ];
    let prematureSettlementCrnCalls = 0;
    expect(result.policy.chooseAction(prematureSettlement, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, { value: () => { prematureSettlementCrnCalls += 1; return 0.5; } })).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(prematureSettlementCrnCalls).toBe(0);

    const terminalFollowUp = makeObservation();
    terminalFollowUp.hand = [createDeck()[0]!];
    terminalFollowUp.handCounts = { 0: 0, 1: 1, 2: 0, 3: 1 };
    terminalFollowUp.finishOrder = [0, 2];
    terminalFollowUp.currentLastPlay = secondGroup;
    terminalFollowUp.publicHistoryEvents = [
      makePlayEvent(firstGroup, 0, 0, 1, 0),
      makeFinishEvent(1, 0, 1),
      makePlayEvent(secondGroup, 2, 2, 1, 0),
      makeFinishEvent(3, 2, 2),
      makePassEvent(4, "policy-observation", 1, 1),
    ];
    let terminalFollowUpCrnCalls = 0;
    expect(result.policy.chooseAction(terminalFollowUp, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 1,
    }, { value: () => { terminalFollowUpCrnCalls += 1; return 0.5; } })).toEqual({
      ok: false,
      failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
    });
    expect(terminalFollowUpCrnCalls).toBe(0);
  });
});
