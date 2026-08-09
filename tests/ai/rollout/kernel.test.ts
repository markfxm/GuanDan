import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { createDeck, type Card } from "../../../src/engine/cards";
import type { CardGroup } from "../../../src/engine/groups";
import { classifyPlay } from "../../../src/game/playRules";
import { buildPublicGameIdentity, finishPublicStableKey, playPublicStableKey, trickClearPublicStableKey, type PublicActionEvent, type PublicActionEventDraft, type PublicSeat } from "../../../src/game/publicEvent";
import { applyPublicEvent, createInitialPublicLedger, type HardPublicLedger } from "../../../src/game/publicLedger";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import * as publicEventHashModule from "../../../src/game/publicEventHash";
import { validateRolloutState, type IsolatedRolloutState } from "../../../src/ai/rollout/stateConservation";
import * as stateConservationModule from "../../../src/ai/rollout/stateConservation";
import { runRolloutReplicate } from "../../../src/ai/rollout/kernel";
import { canonicalActionIdentity, type RolloutAction, type RolloutReplicateInput, type RolloutScenario, type RolloutPublicState } from "../../../src/ai/rollout/contracts";
import { canonicalCrnDomainBytes, createCanonicalSemanticKey, createCrnCoordinate, deriveRandomDomain } from "../../../src/ai/rollout/identity";
import { createCrnView } from "../../../src/ai/rollout/crn";
import * as crnModule from "../../../src/ai/rollout/crn";
import * as identityModule from "../../../src/ai/rollout/identity";
import * as rolloutPolicyModule from "../../../src/ai/rollout/policy";
import * as teamUtilityModule from "../../../src/ai/rollout/teamUtility";
import * as leafEvaluationModule from "../../../src/ai/rollout/leafEvaluation";

const rolloutRoot = path.resolve(process.cwd(), "src/ai/rollout");

describe("D2F isolated rollout kernel", () => {
  test("requires a separate state-conservation validator before simulation", () => {
    const conservationPath = path.join(rolloutRoot, "stateConservation.ts");
    expect(existsSync(conservationPath), "state-conservation validator is missing").toBe(true);
    if (existsSync(conservationPath)) {
      expect(readFileSync(conservationPath, "utf8")).toContain("validateRolloutState");
    }
  });

  test("requires the formal kernel entry after state conservation is specified", () => {
    const kernelPath = path.join(rolloutRoot, "kernel.ts");
    expect(existsSync(kernelPath), "isolated rollout kernel is missing").toBe(true);
    if (existsSync(kernelPath)) {
      expect(readFileSync(kernelPath, "utf8")).toContain("runRolloutReplicate");
    }
  });

  test("accepts a valid root state", () => {
    expect(validateRolloutState(makeState())).toEqual({ ok: true });
  });

  test("rejects a forged incomplete card universe", () => {
    expect(validateRolloutState(makeState({ expectedCardIds: createDeck().slice(0, 4).map((card) => card.id) }))).toEqual({
      ok: false,
      failure: { kind: "state-conservation-failed", reason: "missing-card" },
    });
  });

  test("uses the canonical 108-card universe for physical-location conservation", () => {
    const deck = createDeck();
    const canonicalIds = deck.map((card) => card.id);
    expect(new Set(canonicalIds).size).toBe(108);
    expect(canonicalIds).toHaveLength(108);
    expect(validateRolloutState(makeState())).toEqual({ ok: true });

    const missing = makeState();
    (missing.publicPlayedCardIds as string[]).splice(0, 1);
    expect(validateRolloutState(missing)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "missing-card" } });

    const duplicate = makeState();
    (duplicate.publicPlayedCardIds as string[]).push(duplicate.publicPlayedCardIds[0]!);
    expect(validateRolloutState(duplicate)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "duplicate-card" } });

    const extra = makeState();
    (extra.publicPlayedCardIds as string[]).push("Unknown-Card-1");
    expect(validateRolloutState(extra)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "invalid-shape" } });
  });

  test("rejects duplicate cards with a typed failure", () => {
    const deck = createDeck();
    const state = makeState({ hands: { 0: [deck[0]!], 1: [deck[0]!], 2: [deck[2]!], 3: [deck[3]!] } });
    expect(validateRolloutState(state)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "duplicate-card" } });
  });

  test("rejects hand-count mismatches without throwing", () => {
    const state = makeState({ handCounts: { 0: 2, 1: 1, 2: 1, 3: 1 } });
    expect(validateRolloutState(state)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "hand-count-mismatch" } });
  });

  test("rejects public/private card overlap with a typed failure", () => {
    const deck = createDeck();
    const state = makeState({ publicPlayedCardIds: [deck[0]!.id] });
    expect(validateRolloutState(state)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "public-card-overlap" } });
  });

  test("rejects an invalid acting turn separately from trick shape", () => {
    const deck = createDeck();
    const state = makeState({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      publicPlayedCardIds: [deck[0]!.id],
      handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 },
      finishOrder: [0],
      actingSeat: 0,
    });
    expect(validateRolloutState(state)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "invalid-turn" } });
  });

  test("rejects finished and unfinished count mismatches", () => {
    const deck = createDeck();
    const finished = makeState({ finishOrder: [0], handCounts: { 0: 1, 1: 1, 2: 1, 3: 1 } });
    expect(validateRolloutState(finished)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "finished-hand-count-mismatch" } });
    const unfinished = makeState({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      publicPlayedCardIds: [deck[0]!.id],
      handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 },
    });
    expect(validateRolloutState(unfinished)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "unfinished-hand-count-mismatch" } });
  });

  test("rejects duplicate finish order and hostile accessors without throwing", () => {
    const deck = createDeck();
    const duplicate = makeState({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      publicPlayedCardIds: [deck[0]!.id],
      handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 },
      finishOrder: [0, 0],
    });
    expect(validateRolloutState(duplicate)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "invalid-finish-order" } });
    let getterCalls = 0;
    const hostile = {} as Record<string, unknown>;
    Object.defineProperty(hostile, "hands", { get: () => { getterCalls += 1; return makeState().hands; } });
    expect(() => validateRolloutState(hostile)).not.toThrow();
    expect(validateRolloutState(hostile)).toEqual({ ok: false, failure: { kind: "state-conservation-failed", reason: "invalid-shape" } });
    expect(getterCalls).toBe(0);
  });

  test("applies a legal root action and returns a stable non-terminal leaf", () => {
    const input = makeInput();
    const before = structuredClone(input.scenario.privateState);
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("workUnits", 2);
    expect(input.scenario.privateState).toEqual(before);
  });

  test("validates the seat-local observation before constructing CRN or fixed policy", () => {
    const deck = createDeck();
    const canonicalLastPlay = singleAction(deck[4]!).group;
    const forgedLastPlay = { ...canonicalLastPlay, label: `${canonicalLastPlay.label}-forged` };
    const input = makeInput({
      currentLastPlay: forgedLastPlay,
      currentLastPlaySeat: 0,
      currentTrick: {
        trickIndex: 0,
        leadSeat: 0,
        lastPlaySeat: 0,
        lastPlayStableKey: playPublicStableKey(canonicalLastPlay.cards.map((card) => card.id)),
        passSeats: [],
      },
      actingSeat: 1,
      candidate: { type: "pass" },
    });
    const coordinate = vi.spyOn(identityModule, "createCrnCoordinate");
    const domain = vi.spyOn(identityModule, "deriveRandomDomain");
    const view = vi.spyOn(crnModule, "createCrnView");
    const policy = vi.spyOn(rolloutPolicyModule, "createInternalRolloutPolicy");

    const result = runRolloutReplicate(input, ROOT_IDENTITY);

    expect.soft(result).toEqual({
      ok: false,
      failure: {
        kind: "policy-failed",
        failure: { kind: "invalid-policy-context", field: "observation", reason: "malformed-observation" },
      },
    });
    expect.soft(coordinate).toHaveBeenCalledTimes(0);
    expect.soft(domain).toHaveBeenCalledTimes(0);
    expect.soft(view).toHaveBeenCalledTimes(0);
    expect.soft(policy).toHaveBeenCalledTimes(0);
    vi.restoreAllMocks();
  });

  test("proves public-card prefixes and finalized history are append-only before commit", () => {
    const deck = createDeck();
    const before = makeState();
    const action = singleAction(deck[0]!);
    const reorderedPrefix = [...before.publicPlayedCardIds];
    [reorderedPrefix[0], reorderedPrefix[1]] = [reorderedPrefix[1]!, reorderedPrefix[0]!];
    const after = makeState({
      hands: { 0: [], 1: before.hands[1], 2: before.hands[2], 3: before.hands[3] },
      publicPlayedCardIds: [...reorderedPrefix, deck[0]!.id],
      currentLastPlay: action.group,
      currentLastPlaySeat: 0,
      currentTrick: {
        trickIndex: 0,
        leadSeat: 0,
        lastPlaySeat: 0,
        lastPlayStableKey: playPublicStableKey(action.group.cards.map((card) => card.id)),
        passSeats: [],
      },
      handCounts: { 0: 0, 1: 1, 2: 1, 3: 1 },
      finishOrder: [0],
      actingSeat: 3,
    });
    expect(stateConservationModule.validateActionTransition(before, after, action)).toEqual({
      ok: false,
      failure: { kind: "state-conservation-failed", reason: "invalid-action-transition" },
    });

    const identity = buildPublicGameIdentity("append-proof", 0, 0, "benchmark-scenario");
    const ledger0 = createInitialPublicLedger({
      identity,
      initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
      openingLeader: 0,
      initialTrickIndex: 0,
      openingTributePublicState: { phase: "initial" },
    });
    const event0 = finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: identity.gameId,
      roundIdentity: identity.roundIdentity,
      handIdentity: identity.handIdentity,
      eventIndex: 0,
      kind: "play",
      seat: 0,
      publicStableKey: playPublicStableKey([deck[0]!.id]),
      trickIndex: 0,
      publicCardIds: [deck[0]!.id],
      patternType: "single",
      groupType: "single",
      handCountBefore: 27,
      handCountAfter: 26,
    } satisfies PublicActionEventDraft);
    const applied0 = applyPublicEvent(ledger0, event0);
    if (!applied0.ok || applied0.kind !== "applied") throw new Error("APPEND_FIXTURE_EVENT0_REJECTED");
    const event1 = finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: identity.gameId,
      roundIdentity: identity.roundIdentity,
      handIdentity: identity.handIdentity,
      eventIndex: 1,
      kind: "pass",
      seat: 3,
      publicStableKey: "pass:v2",
      trickIndex: 0,
      handCountBefore: 27,
      handCountAfter: 27,
    } satisfies PublicActionEventDraft);
    const applied1 = applyPublicEvent(applied0.ledger, event1);
    if (!applied1.ok || applied1.kind !== "applied") throw new Error("APPEND_FIXTURE_EVENT1_REJECTED");
    const validateAppend = (stateConservationModule as unknown as {
      validatePublicHistoryAppend?: (
        beforeHistory: readonly PublicActionEvent[],
        afterHistory: readonly PublicActionEvent[],
        beforeLedger: typeof applied0.ledger,
        afterLedger: typeof applied1.ledger,
      ) => unknown;
    }).validatePublicHistoryAppend;
    expect(validateAppend).toBeTypeOf("function");
    if (validateAppend === undefined) return;
    expect(validateAppend([event0], [event0, event1], applied0.ledger, applied1.ledger)).toEqual({ ok: true });
    const negatives = [
      [{ ...event0, publicPayloadHash: "f".repeat(64) }, event1],
      [event1],
      [event1, event0],
      [event0, event1, event1],
      [event0, { ...event1, eventIndex: 2 }],
      [event0, { ...event1, publicPayloadHash: "e".repeat(64) }],
    ] as PublicActionEvent[][];
    for (const afterHistory of negatives) {
      expect(validateAppend([event0], afterHistory, applied0.ledger, applied1.ledger)).toEqual({
        ok: false,
        failure: { kind: "state-conservation-failed", reason: "public-history-not-append-only" },
      });
    }
    expect(validateAppend([event0], [event0, event1], applied0.ledger, applied0.ledger)).toEqual({
      ok: false,
      failure: { kind: "state-conservation-failed", reason: "public-history-not-append-only" },
    });
  });

  test("accepts a legal pair when action card order differs from finalized event order", () => {
    const deck = createDeck();
    const pairCards = [deck[0]!, deck[54]!];
    const classified = classifyPlay(pairCards, "2");
    expect(classified?.type).toBe("pair");
    if (classified === undefined) return;
    const action: RolloutAction = {
      type: "play",
      group: { ...classified, cards: [...classified.cards].reverse() },
    };
    const input = makeInput({
      hands: { 0: pairCards, 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      candidate: action,
      maxPliesPerReplicate: 1,
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
  });

  test("accepts a legal compound bomb when action card order differs from finalized event order", () => {
    const deck = createDeck();
    const bombCards = [deck[0]!, deck[54]!, deck[13]!, deck[67]!];
    const classified = classifyPlay(bombCards, "2");
    expect(classified?.type).toBe("bomb");
    if (classified === undefined) return;
    const action: RolloutAction = { type: "play", group: { ...classified, cards: [...classified.cards].reverse() } };
    const result = runRolloutReplicate(makeInput({
      hands: { 0: bombCards, 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      candidate: action,
      maxPliesPerReplicate: 1,
    }), ROOT_IDENTITY);
    expect(result.ok).toBe(true);
  });

  test("rejects duplicate, missing, extra, and foreign action card identities without partial results", () => {
    const deck = createDeck();
    const pairCards = [deck[0]!, deck[54]!];
    const classified = classifyPlay(pairCards, "2");
    expect(classified).toBeDefined();
    if (classified === undefined) return;
    const baseGroup = { ...classified };
    const invalidGroups = [
      { ...baseGroup, cards: [deck[0]!, deck[0]!] },
      { ...baseGroup, cards: [deck[0]!] },
      { ...baseGroup, cards: [deck[0]!, deck[54]!, deck[1]!] },
      { ...baseGroup, cards: [deck[0]!, deck[4]!] },
    ];
    for (const [index, group] of invalidGroups.entries()) {
      const action: RolloutAction = { type: "play", group };
      const input = makeInput({
        hands: { 0: pairCards, 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
        candidate: { type: "pass" },
        maxPliesPerReplicate: 1,
      });
      const candidateId = (() => {
        try { return canonicalActionIdentity(action); } catch { return input.candidate.candidateId; }
      })();
      (input as unknown as { candidate: RolloutReplicateInput["candidate"] }).candidate = {
        candidateId,
        action,
        baselineEvaluatorScore: 0,
      };
      const before = structuredClone(input.scenario.privateState);
      const result = runRolloutReplicate(input, ROOT_IDENTITY);
      expect(result).toEqual(index === 0
        ? { ok: false, failure: { kind: "simulation-failed", stage: "input", reason: "invalid-candidate" } }
        : { ok: false, failure: { kind: "simulation-failed", stage: "root-action", reason: "illegal-action" } });
      expect(input.scenario.privateState).toEqual(before);
      expect(result).not.toHaveProperty("utility");
    }
  });

  test("rejects an illegal root action atomically", () => {
    const deck = createDeck();
    const input = makeInput({ candidate: singleAction(deck[5]!) });
    const before = structuredClone(input.scenario.privateState);
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result).toEqual({ ok: false, failure: { kind: "simulation-failed", stage: "root-action", reason: "illegal-action" } });
    expect(input.scenario.privateState).toEqual(before);
    expect(result).not.toHaveProperty("utility");
  });

  test("discards a next state when post-transition ledger validation fails", () => {
    const input = makeInput();
    const ledger = (input.scenario.privateState as Record<string, unknown>).ledger as Record<string, unknown>;
    ledger.nextEventIndex = Number.NaN;
    const before = structuredClone(input.scenario.privateState);
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result).toEqual({ ok: false, failure: { kind: "simulation-failed", stage: "replay", reason: "invalid-replay-context" } });
    expect(input.scenario.privateState).toEqual(before);
    expect(input.scenario.privateState).not.toHaveProperty("nextState");
    expect(result).not.toHaveProperty("utility");
  });

  test("evaluates terminal utility immediately after the root action", () => {
    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [deck[0]!], 1: [], 2: [], 3: [] },
      publicPlayedCardIds: deck.slice(1).map((card) => card.id),
      finishOrder: [1, 2, 3],
      candidate: singleAction(deck[0]!),
      maxPliesPerReplicate: 1,
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result).toEqual({
      ok: true,
      candidateId: canonicalActionIdentity(input.candidate.action),
      scenarioIdentity: SCENARIO_IDENTITY,
      replicateIdentity: REPLICATE_IDENTITY,
      utility: -2,
      workUnits: 1,
    });
  });

  test("returns terminal utility when a root action creates the first three finishers", () => {
    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [deck[0]!], 1: [], 2: [], 3: [deck[3]!] },
      finishOrder: [1, 2],
      candidate: singleAction(deck[0]!),
      maxWorkUnits: 1,
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
    expect(result).toHaveProperty("workUnits", 1);
  });

  test("plays a real full house and terminates when it creates the first two partner finishers", () => {
    const deck = createDeck();
    const cardIds = ["S3-1", "C3-1", "H3-1", "S4-1", "C4-1"] as const;
    const cards = cardIds.map((cardId) => {
      const card = deck.find((candidate) => candidate.id === cardId);
      if (card === undefined) throw new Error(`FULL_HOUSE_CARD_MISSING:${cardId}`);
      return card;
    });
    const classified = classifyPlay(cards, "2");
    expect(classified?.type).toBe("full-house");
    expect(classified?.type).not.toBe("bomb");
    if (classified === undefined) return;
    const reversedCards = [...cards].reverse();
    const action: Extract<RolloutAction, { type: "play" }> = {
      type: "play",
      group: { ...classified, cards: reversedCards },
    };
    const input = makeInput({
      hands: { 0: cards, 1: [deck[1]!], 2: [], 3: [deck[5]!] },
      finishOrder: [2],
      actingSeat: 0,
      candidate: action,
      maxWorkUnits: 1,
    });
    const finalizeSpy = vi.spyOn(publicEventHashModule, "finalizePublicActionEvent");
    const validateTransition = stateConservationModule.validateActionTransition;
    let beforeState: unknown;
    let afterState: unknown;
    vi.spyOn(stateConservationModule, "validateActionTransition").mockImplementation((before, after, appliedAction) => {
      beforeState = structuredClone(before);
      afterState = structuredClone(after);
      return validateTransition(before, after, appliedAction);
    });
    const policySpy = vi.spyOn(rolloutPolicyModule, "createInternalRolloutPolicy");
    const crnSpy = vi.spyOn(identityModule, "createCrnCoordinate");
    const leafSpy = vi.spyOn(leafEvaluationModule, "evaluateNonTerminalLeaf");
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(input.candidate.action.type === "play" ? input.candidate.action.group.cards.map((card) => card.id) : []).toEqual([...cardIds].reverse());
    const finalizedPlay = finalizeSpy.mock.calls
      .map(([draft]) => draft)
      .find((draft) => draft.kind === "play");
    expect(finalizedPlay?.kind === "play" ? finalizedPlay.publicCardIds : undefined).toEqual([
      "C3-1", "C4-1", "H3-1", "S3-1", "S4-1",
    ]);
    expect(afterState).toMatchObject({
      hands: { 0: [] },
      handCounts: { 0: 0 },
      finishOrder: [2, 0],
    });
    const beforePublicIds = (beforeState as { publicPlayedCardIds: readonly string[] }).publicPlayedCardIds;
    const afterPublicIds = (afterState as { publicPlayedCardIds: readonly string[] }).publicPlayedCardIds;
    expect(afterPublicIds).toEqual([...beforePublicIds, "C3-1", "C4-1", "H3-1", "S3-1", "S4-1"]);
    expect(result).toMatchObject({ ok: true, utility: 3, workUnits: 1 });
    expect(policySpy).not.toHaveBeenCalled();
    expect(crnSpy).not.toHaveBeenCalled();
    expect(leafSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test("returns terminal utility before policy work when a policy action creates the third finisher", () => {
    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [deck[0]!, deck[54]!], 1: [], 2: [], 3: [deck[3]!] },
      finishOrder: [1, 2],
      candidate: singleAction(deck[0]!),
      maxPliesPerReplicate: 4,
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.workUnits).toBe(3);
  });

  test("projects partner finish orders according to Room completion rules", () => {
    const deck = createDeck();
    const first = makeInput({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      finishOrder: [0],
      actingSeat: 2,
      candidate: singleAction(deck[2]!),
    });
    const firstResult = runRolloutReplicate(first, ROOT_IDENTITY);
    expect(firstResult).toMatchObject({ ok: true, utility: 3 });

    const opponent = makeInput({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      finishOrder: [0],
      actingSeat: 2,
      candidate: singleAction(deck[2]!),
      perspectiveSeat: 1,
    });
    const opponentResult = runRolloutReplicate(opponent, ROOT_IDENTITY);
    expect(opponentResult).toMatchObject({ ok: true, utility: -3 });

    const rotated = makeInput({
      hands: { 0: [deck[0]!], 1: [], 2: [deck[2]!], 3: [deck[3]!] },
      finishOrder: [1],
      actingSeat: 3,
      candidate: singleAction(deck[3]!),
    });
    const rotatedResult = runRolloutReplicate(rotated, ROOT_IDENTITY);
    expect(rotatedResult).toMatchObject({ ok: true, utility: -3 });
  });

  test("handles pass and trick clear while conserving the stable state", () => {
    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [deck[0]!], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      currentLastPlay: singleAction(deck[4]!).group,
      currentLastPlaySeat: 0,
      currentTrick: { trickIndex: 0, leadSeat: 0, lastPlaySeat: 0, lastPlayStableKey: `play:${deck[4]!.id}`, passSeats: [1, 2] },
      actingSeat: 3,
      maxPliesPerReplicate: 1,
      candidate: { type: "pass" },
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
  });

  test("uses the Room active-seat quorum, including a finished last-play seat", () => {
    const allActiveInsufficient = makePassStates([], 0, [1], 2, 0);
    expect(validateRolloutState(allActiveInsufficient.before)).toEqual({ ok: true });
    expect(validateRolloutState(allActiveInsufficient.after)).toEqual({ ok: true });
    expect(stateConservationModule.validateActionTransition(allActiveInsufficient.before, allActiveInsufficient.after, { type: "pass" })).toEqual({
      ok: false,
      failure: { kind: "state-conservation-failed", reason: "invalid-pass-quorum" },
    });

    const allActiveQuorum = makePassStates([], 0, [1, 2], 3, 0);
    expect(stateConservationModule.validateActionTransition(allActiveQuorum.before, allActiveQuorum.after, { type: "pass" })).toEqual({ ok: true });
    const oneFinished = makePassStates([0], 1, [2], 3, 1);
    expect(stateConservationModule.validateActionTransition(oneFinished.before, oneFinished.after, { type: "pass" })).toEqual({ ok: true });
    const lastPlayFinished = makePassStates([0, 1], 0, [], 2, 2);
    expect(stateConservationModule.validateActionTransition(lastPlayFinished.before, lastPlayFinished.after, { type: "pass" })).toEqual({ ok: true });

    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [], 1: [], 2: [deck[2]!], 3: [deck[3]!] },
      finishOrder: [0, 1],
      currentLastPlay: singleAction(deck[4]!).group,
      currentLastPlaySeat: 0,
      currentTrick: { trickIndex: 0, leadSeat: 0, lastPlaySeat: 0, lastPlayStableKey: `play:${deck[4]!.id}`, passSeats: [] },
      actingSeat: 2,
      candidate: { type: "pass" },
      maxPliesPerReplicate: 1,
    });
    const observations: Array<{ currentLastPlay: unknown }> = [];
    const validateObservation = rolloutPolicyModule.validateSeatLocalObservation;
    vi.spyOn(rolloutPolicyModule, "validateSeatLocalObservation").mockImplementation((observation) => {
      observations.push(structuredClone(observation) as { currentLastPlay: unknown });
      return validateObservation(observation);
    });
    runRolloutReplicate(input, ROOT_IDENTITY);
    expect(observations[0]?.currentLastPlay).toBeNull();
    vi.restoreAllMocks();
  });

  test("gives a cleared trick to the unfinished partner after the last player finishes", () => {
    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      publicPlayedCardIds: [deck[0]!.id],
      finishOrder: [0],
      currentLastPlay: singleAction(deck[0]!).group,
      currentLastPlaySeat: 0,
      currentTrick: { trickIndex: 0, leadSeat: 0, lastPlaySeat: 0, lastPlayStableKey: `play:${deck[0]!.id}`, passSeats: [] },
      actingSeat: 1,
      maxPliesPerReplicate: 3,
      candidate: { type: "pass" },
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
  });

  test("stops at the explicit work-unit budget before policy evaluation", () => {
    const result = runRolloutReplicate(makeInput({ maxWorkUnits: 1 }), ROOT_IDENTITY);
    expect(result).toEqual({ ok: false, failure: { kind: "budget-exhausted", workUnits: 1, maximumWorkUnits: 1 } });
  });

  test("preserves the exact kernel failure stage and reason without partial state", () => {
    const deck = createDeck();
    const assertFailure = (result: ReturnType<typeof runRolloutReplicate>, failure: unknown): void => {
      expect.soft(result).toEqual({ ok: false, failure });
      expect.soft(result).not.toHaveProperty("state");
      expect.soft(result).not.toHaveProperty("privateState");
      expect.soft(result).not.toHaveProperty("utility");
    };

    const malformed = makeInput() as unknown as Record<string, unknown>;
    malformed.unexpected = true;
    assertFailure(runRolloutReplicate(malformed as unknown as RolloutReplicateInput, ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "input", reason: "malformed-envelope",
    });
    assertFailure(runRolloutReplicate(makeInput(), "not-a-root"), {
      kind: "simulation-failed", stage: "input", reason: "invalid-root-identity",
    });
    assertFailure(runRolloutReplicate(makeInput({ candidate: singleAction(deck[5]!) }), ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "root-action", reason: "illegal-action",
    });

    const realFactory = rolloutPolicyModule.createInternalRolloutPolicy("d2f-lightweight-v1");
    if (!realFactory.ok) throw new Error("POLICY_FACTORY_UNAVAILABLE");
    vi.spyOn(rolloutPolicyModule, "createInternalRolloutPolicy").mockReturnValue({
      ok: true,
      policy: {
        listLegalActions: realFactory.policy.listLegalActions,
        chooseAction: () => ({ ok: true, action: singleAction(deck[5]!) }),
      },
    });
    assertFailure(runRolloutReplicate(makeInput(), ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "policy-action", reason: "illegal-action",
    });
    vi.restoreAllMocks();

    const crnInput = makeInput();
    vi.spyOn(identityModule, "createCrnCoordinate").mockReturnValue({
      ok: false,
      failure: { kind: "malformed-coordinate-envelope", field: "coordinate" },
    });
    assertFailure(runRolloutReplicate(crnInput, ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "crn", reason: "coordinate",
    });
    vi.restoreAllMocks();

    vi.spyOn(stateConservationModule, "validateActionTransition").mockReturnValue({
      ok: false,
      failure: { kind: "state-conservation-failed", reason: "invalid-action-transition" },
    });
    assertFailure(runRolloutReplicate(makeInput(), ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "transition", reason: "invalid-action-transition",
    });
    vi.restoreAllMocks();

    vi.spyOn(stateConservationModule, "validateActionTransition").mockReturnValue({
      ok: false,
      failure: { kind: "state-conservation-failed", reason: "invalid-pass-quorum" },
    });
    assertFailure(runRolloutReplicate(makeInput(), ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "transition", reason: "invalid-pass-quorum",
    });
    vi.restoreAllMocks();

    vi.spyOn(stateConservationModule, "validateRolloutState").mockReturnValue({
      ok: false,
      failure: { kind: "state-conservation-failed", reason: "missing-card" },
    });
    assertFailure(runRolloutReplicate(makeInput(), ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "state-conservation", reason: "missing-card",
    });
    vi.restoreAllMocks();

    vi.spyOn(teamUtilityModule, "evaluateTeamUtility").mockReturnValue({
      ok: false,
      failure: { kind: "invalid-finish-order", reason: "missing-seat" },
    });
    const terminal = makeInput({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] },
      finishOrder: [0],
      actingSeat: 2,
      candidate: singleAction(deck[2]!),
    });
    assertFailure(runRolloutReplicate(terminal, ROOT_IDENTITY), {
      kind: "simulation-failed", stage: "terminal-projection", reason: "utility-failed",
    });
    vi.restoreAllMocks();

    assertFailure(runRolloutReplicate(makeInput({ maxWorkUnits: 1 }), ROOT_IDENTITY), {
      kind: "budget-exhausted", workUnits: 1, maximumWorkUnits: 1,
    });
  });

  test("uses a fresh CRN domain when ply or acting seat changes", () => {
    const makeView = (ply: number, actingSeat: PublicSeat) => {
      const coordinate = createCrnCoordinate({
        rootIdentity: ROOT_IDENTITY,
        scenarioIdentity: SCENARIO_IDENTITY,
        replicateIdentity: REPLICATE_IDENTITY,
        ply,
        actingSeat,
        randomDomain: "policy-action-v1",
      });
      expect(coordinate.ok).toBe(true);
      if (!coordinate.ok) throw new Error("CRN_FIXTURE_INVALID");
      const randomDomain = deriveRandomDomain(coordinate.value);
      const view = createCrnView({ coordinate: coordinate.value, randomDomain });
      expect(view.ok).toBe(true);
      if (!view.ok) throw new Error("CRN_VIEW_FIXTURE_INVALID");
      return { bytes: canonicalCrnDomainBytes(coordinate.value), view: view.view };
    };
    const key = createCanonicalSemanticKey("policy-action:play:single");
    expect(key.ok).toBe(true);
    if (!key.ok) return;
    const first = makeView(0, 0);
    const nextPly = makeView(1, 0);
    const nextSeat = makeView(0, 1);
    expect([...first.bytes]).not.toEqual([...nextPly.bytes]);
    expect([...first.bytes]).not.toEqual([...nextSeat.bytes]);
    expect(first.view.value(key.value)).not.toBe(nextPly.view.value(key.value));
    expect(first.view.value(key.value)).not.toBe(nextSeat.view.value(key.value));
  });

  test("rejects an empty replay history backed by a non-initial ledger", () => {
    const input = makeInput();
    const nonInitialLedger = structuredClone(input.publicReplayContext.initialLedger);
    (nonInitialLedger as unknown as Record<string, unknown>).nextEventIndex = 1;
    (nonInitialLedger as unknown as Record<string, unknown>).lastAppliedEventIndex = 0;
    (nonInitialLedger as unknown as Record<string, unknown>).seenEventHashes = { 0: "0".repeat(64) };
    (input as unknown as Record<string, unknown>).publicReplayContext = {
      publicHistoryEvents: [],
      initialLedger: nonInitialLedger,
      finalLedger: structuredClone(nonInitialLedger),
    };
    (input.scenario.privateState as Record<string, unknown>).ledger = structuredClone(nonInitialLedger);
    expect(runRolloutReplicate(input, ROOT_IDENTITY)).toEqual({
      ok: false,
      failure: { kind: "simulation-failed", stage: "replay", reason: "invalid-replay-context" },
    });
  });

  test("rejects an empty replay history backed by a forged opening ledger", () => {
    const input = makeInput();
    const forgedInitial = structuredClone(input.publicReplayContext.initialLedger);
    (forgedInitial as unknown as { publicTributeEvents: string[] }).publicTributeEvents = [];
    const forgedContext = {
      publicHistoryEvents: [],
      initialLedger: forgedInitial,
      finalLedger: structuredClone(forgedInitial),
    };
    (input as unknown as { publicReplayContext: typeof forgedContext }).publicReplayContext = forgedContext;
    (input.scenario.privateState as Record<string, unknown>).ledger = structuredClone(forgedInitial);
    expect(runRolloutReplicate(input, ROOT_IDENTITY)).toEqual({
      ok: false,
      failure: { kind: "simulation-failed", stage: "replay", reason: "invalid-replay-context" },
    });
  });

  test("uses only the isolated public-state snapshot after the entrance gate", () => {
    let publicStateReads = 0;
    const input = new Proxy(makeInput(), {
      get(target, property, receiver) {
        if (property === "publicState") publicStateReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    runRolloutReplicate(input, ROOT_IDENTITY);
    expect(publicStateReads).toBe(0);
  });

  test("rejects hostile kernel input graphs before reading values or invoking callbacks", () => {
    const cases: Array<readonly [(input: RolloutReplicateInput, calls: { getters: number; callbacks: number }) => void, unknown]> = [
      [(input, calls) => Object.defineProperty(input, "candidate", { get: () => { calls.getters += 1; return input.candidate; } }), { kind: "simulation-failed", stage: "input", reason: "malformed-envelope" }],
      [(input, calls) => Object.defineProperty(input.validatedBudget, "budget", { get: () => { calls.getters += 1; return input.validatedBudget.budget; } }), { kind: "simulation-failed", stage: "input", reason: "invalid-budget" }],
      [(input, calls) => Object.defineProperty((input.scenario.privateState as Record<string, unknown>).hands as object, "0", { get: () => { calls.getters += 1; return []; } }), { kind: "simulation-failed", stage: "replay", reason: "invalid-scenario" }],
      [(input) => Object.defineProperty(input, Symbol("hostile"), { value: 1 }), { kind: "simulation-failed", stage: "input", reason: "malformed-envelope" }],
      [(input) => Object.setPrototypeOf(input.scenario.privateState, { inherited: true }), { kind: "simulation-failed", stage: "replay", reason: "invalid-scenario" }],
      [(input) => Object.setPrototypeOf((input.scenario.privateState as Record<string, unknown>).hands as object, { [Symbol.iterator]: () => [] }), { kind: "simulation-failed", stage: "replay", reason: "invalid-scenario" }],
      [(input) => { (input.scenario.privateState as Record<string, unknown>).currentTrick = new Array(1); }, { kind: "simulation-failed", stage: "replay", reason: "invalid-scenario" }],
      [(input) => { const trick = (input.scenario.privateState as Record<string, unknown>).currentTrick as Record<string, unknown>; trick.self = trick; }, { kind: "simulation-failed", stage: "replay", reason: "invalid-scenario" }],
      [(input) => { ((input.scenario.privateState as Record<string, unknown>).handCounts as Record<string, unknown>)["0"] = Number.NaN; }, { kind: "simulation-failed", stage: "replay", reason: "invalid-scenario" }],
      [(input) => { ((input.validatedBudget as Record<string, unknown>).budget as Record<string, unknown>).maxWorkUnits = -0; }, { kind: "simulation-failed", stage: "input", reason: "invalid-budget" }],
      [(input) => delete (input as unknown as Record<string, unknown>).publicState, { kind: "simulation-failed", stage: "input", reason: "malformed-envelope" }],
      [(input) => { (input as unknown as Record<string, unknown>).unexpected = 1; }, { kind: "simulation-failed", stage: "input", reason: "malformed-envelope" }],
    ];
    for (const [mutate, failure] of cases) {
      const input = makeInput();
      const calls = { getters: 0, callbacks: 0 };
      const random = { value: () => { calls.callbacks += 1; return 0.5; } };
      (input as unknown as { random: RolloutReplicateInput["random"] }).random = random;
      mutate(input, calls);
      const result = runRolloutReplicate(input, ROOT_IDENTITY);
      expect(result).toEqual({ ok: false, failure });
      expect(calls).toEqual({ getters: 0, callbacks: 0 });
      expect(result).not.toHaveProperty("privateState");
    }
  });
});

const ROOT_IDENTITY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const SCENARIO_IDENTITY = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
const REPLICATE_IDENTITY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function singleAction(card: Card): Extract<RolloutAction, { type: "play" }> {
  const classified = classifyPlay([card], "2");
  if (classified === undefined) throw new Error("SINGLE_ACTION_FIXTURE_INVALID");
  return {
    type: "play",
    group: classified,
  };
}

function makeInput(options: Readonly<{
  hands?: Readonly<Record<PublicSeat, readonly Card[]>>;
  publicPlayedCardIds?: readonly string[];
  currentLastPlay?: CardGroup | null;
  currentLastPlaySeat?: PublicSeat | null;
  currentTrick?: Readonly<{
    trickIndex: number;
    leadSeat: PublicSeat;
    lastPlaySeat?: PublicSeat;
    lastPlayStableKey?: string;
    passSeats: readonly PublicSeat[];
  }>;
  finishOrder?: readonly PublicSeat[];
  actingSeat?: PublicSeat;
  perspectiveSeat?: PublicSeat;
  candidate?: RolloutAction;
  maxPliesPerReplicate?: number;
  maxPolicyActionEvaluationsPerPly?: number;
  maxWorkUnits?: number;
}> = {}): RolloutReplicateInput {
  const deck = createDeck();
  const requestedPublicPlayedCardIds = options.publicPlayedCardIds ?? [];
  const finishOrder = options.finishOrder ?? [];
  const requestedHands = options.hands ?? { 0: [deck[0]!], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] };
  const hands = completeHands(requestedHands, requestedPublicPlayedCardIds, finishOrder);
  const requestedTrick = options.currentTrick ?? { trickIndex: 0, leadSeat: 0 as PublicSeat, passSeats: [] as readonly PublicSeat[] };
  const currentLastPlay = options.currentLastPlay ?? null;
  const currentLastPlaySeat = currentLastPlay === null
    ? null
    : options.currentLastPlaySeat ?? requestedTrick.lastPlaySeat ?? null;
  const physicalPublicPlayedCardIds = completePublicPlayedCardIds(hands, requestedPublicPlayedCardIds);
  const identity = buildPublicGameIdentity("task4-kernel-fixture", 0, 0, "benchmark-scenario");
  const replay = buildReplayFixture({
    identity,
    hands,
    publicCardIds: physicalPublicPlayedCardIds,
    currentLastPlay,
    currentLastPlaySeat,
    currentTrick: requestedTrick,
    finishOrder,
  });
  const replayedPublicPlayedCardIds = [...replay.finalLedger.playedCardIds];
  const handCounts = { 0: hands[0].length, 1: hands[1].length, 2: hands[2].length, 3: hands[3].length } as const;
  const currentTrick = {
    trickIndex: replay.finalLedger.currentTrick.trickIndex,
    leadSeat: replay.finalLedger.currentTrick.leadSeat,
    ...(replay.finalLedger.currentTrick.lastPlaySeat === undefined ? {} : { lastPlaySeat: replay.finalLedger.currentTrick.lastPlaySeat }),
    ...(replay.finalLedger.currentTrick.lastPlayStableKey === undefined ? {} : { lastPlayStableKey: replay.finalLedger.currentTrick.lastPlayStableKey }),
    passSeats: [...replay.finalLedger.currentTrick.passSeats],
  };
  const state = {
    hands,
    publicPlayedCardIds: replayedPublicPlayedCardIds,
    revealedTransferEvents: [],
    currentLastPlay,
    currentTrick,
    handCounts,
    finishOrder,
    ledger: structuredClone(replay.finalLedger),
  };
  const publicState: RolloutPublicState = {
    gameRank: "2",
    actingSeat: options.actingSeat ?? 0,
    perspectiveSeat: options.perspectiveSeat ?? 0,
    partnerSeat: (((options.perspectiveSeat ?? 0) + 2) % 4) as PublicSeat,
    handCounts,
    finishOrder,
    publicPlayedCardIds: replayedPublicPlayedCardIds,
    currentLastPlay,
    currentLastPlaySeat: currentTrick.lastPlaySeat ?? null,
  };
  const action = options.candidate ?? singleAction(hands[publicState.actingSeat][0]!);
  const budget = {
    replicateCountPerScenario: 1,
    maxPliesPerReplicate: options.maxPliesPerReplicate ?? 1,
    maxPolicyActionEvaluationsPerPly: options.maxPolicyActionEvaluationsPerPly ?? 8,
    maxWorkUnits: options.maxWorkUnits ?? 8,
  };
  return {
    candidate: { candidateId: canonicalActionIdentity(action), action, baselineEvaluatorScore: 0 },
    scenario: { scenarioIdentity: SCENARIO_IDENTITY, normalizedWeight: 1, privateState: state } as RolloutScenario,
    publicState,
    publicReplayContext: { publicHistoryEvents: replay.events, initialLedger: replay.initialLedger, finalLedger: replay.finalLedger },
    replicateIdentity: REPLICATE_IDENTITY,
    random: makeUnusedRandomView(),
    validatedBudget: {
      budget,
    limits: { maxReplicateCountPerScenario: 1, maxPliesPerReplicate: 8, maxPolicyActionEvaluationsPerPly: 8, maxWorkUnits: 8 },
      maximumWorkUnits: Math.min(budget.maxWorkUnits, budget.replicateCountPerScenario * budget.maxPliesPerReplicate * budget.maxPolicyActionEvaluationsPerPly),
      validated: true,
    },
  };
}

type ReplayFixture = Readonly<{
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  events: readonly PublicActionEvent[];
}>;

function buildReplayFixture(input: Readonly<{
  identity: ReturnType<typeof buildPublicGameIdentity>;
  hands: Readonly<Record<PublicSeat, readonly Card[]>>;
  publicCardIds: readonly string[];
  currentLastPlay: CardGroup | null;
  currentLastPlaySeat: PublicSeat | null;
  currentTrick: Readonly<{
    trickIndex: number;
    leadSeat: PublicSeat;
    lastPlaySeat?: PublicSeat;
    lastPlayStableKey?: string;
    passSeats: readonly PublicSeat[];
  }>;
  finishOrder: readonly PublicSeat[];
}>): ReplayFixture {
  const handIds = new Set(Object.values(input.hands).flatMap((cards) => cards.map((card) => card.id)));
  const publicIds = [...input.publicCardIds];
  if (new Set(publicIds).size !== publicIds.length || publicIds.some((id) => handIds.has(id))) throw new Error("REPLAY_FIXTURE_CARD_PARTITION_INVALID");
  const currentLastIds = input.currentLastPlay === null ? [] : input.currentLastPlay.cards.map((card) => card.id);
  if (input.currentLastPlay !== null && (input.currentLastPlaySeat === null || new Set(currentLastIds).size !== currentLastIds.length || currentLastIds.some((id) => !publicIds.includes(id)))) {
    throw new Error("REPLAY_FIXTURE_LAST_PLAY_INVALID");
  }
  if (input.currentLastPlay === null && input.currentTrick.passSeats.length !== 0) throw new Error("REPLAY_FIXTURE_CLEARED_PASS_INVALID");

  const currentLastSet = new Set(currentLastIds);
  const publicCardsBeforeLast = publicIds.filter((id) => !currentLastSet.has(id));
  const assignedCounts: Record<PublicSeat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const assignedSeatByCard = new Map<string, PublicSeat>();
  const triggerCardByFinishSeat = new Map<PublicSeat, string>();
  const currentLastFinishPosition = input.currentLastPlaySeat === null
    ? -1
    : input.finishOrder.indexOf(input.currentLastPlaySeat);
  const triggerFinishSeats = input.finishOrder.filter((seat, position) => currentLastFinishPosition < 0 || position < currentLastFinishPosition);
  let remainingBeforeLast = [...publicCardsBeforeLast];
  for (const seat of triggerFinishSeats) {
    const cardId = remainingBeforeLast.shift();
    if (cardId === undefined) throw new Error("REPLAY_FIXTURE_FINISH_TRIGGER_MISSING");
    triggerCardByFinishSeat.set(seat, cardId);
    assignedSeatByCard.set(cardId, seat);
    assignedCounts[seat] += 1;
  }
  const unfinishedSeats = ([0, 1, 2, 3] as const).filter((seat) => !input.finishOrder.includes(seat));
  const supportSeat = unfinishedSeats[0] ?? input.currentLastPlaySeat ?? 0;
  for (const cardId of remainingBeforeLast) {
    assignedSeatByCard.set(cardId, supportSeat);
    assignedCounts[supportSeat] += 1;
  }
  if (input.currentLastPlay !== null && input.currentLastPlaySeat !== null) {
    for (const cardId of currentLastIds) {
      assignedSeatByCard.set(cardId, input.currentLastPlaySeat);
      assignedCounts[input.currentLastPlaySeat] += 1;
    }
  }
  const initialHandCounts: Record<PublicSeat, number> = {
    0: input.hands[0].length + assignedCounts[0],
    1: input.hands[1].length + assignedCounts[1],
    2: input.hands[2].length + assignedCounts[2],
    3: input.hands[3].length + assignedCounts[3],
  };
  const hasPublicPlay = publicIds.length > 0;
  const finalTrickIndex = input.currentLastPlay === null && hasPublicPlay && input.currentTrick.trickIndex === 0
    ? 1
    : input.currentTrick.trickIndex;
  const initialTrickIndex = input.currentLastPlay === null && hasPublicPlay ? finalTrickIndex - 1 : finalTrickIndex;
  if (initialTrickIndex < 0) throw new Error("REPLAY_FIXTURE_TRICK_INDEX_INVALID");
  let ledger = createInitialPublicLedger({
    identity: input.identity,
    initialHandCounts,
    openingLeader: input.currentTrick.leadSeat,
    initialTrickIndex,
    openingTributePublicState: { phase: "initial" },
  });
  const initialLedger = ledger;
  const events: PublicActionEvent[] = [];
  const append = (draft: PublicActionEventDraft): void => {
    const event = finalizePublicActionEvent(draft);
    const applied = applyPublicEvent(ledger, event);
    if (!applied.ok || applied.kind !== "applied") throw new Error(`REPLAY_FIXTURE_EVENT_REJECTED:${applied.ok ? applied.kind : applied.error}`);
    ledger = applied.ledger;
    events.push(event);
  };
  const identityFields = () => ({
    schemaVersion: "d2-public-event-v2" as const,
    gameId: input.identity.gameId,
    roundIdentity: input.identity.roundIdentity,
    handIdentity: input.identity.handIdentity,
  });
  const appendSinglePlay = (cardId: string, seat: PublicSeat): void => {
    const handCountBefore = ledger.handCounts[seat];
    append({
      ...identityFields(),
      eventIndex: ledger.nextEventIndex,
      kind: "play",
      seat,
      publicStableKey: playPublicStableKey([cardId]),
      publicCardIds: [cardId],
      patternType: "single",
      groupType: "single",
      handCountBefore,
      handCountAfter: handCountBefore - 1,
      trickIndex: ledger.currentTrick.trickIndex,
    });
  };
  const appendFinish = (position: number, seat: PublicSeat, finishReason: "hand-empty" | "round-settlement", remainingHandCount: number): void => {
    append({
      ...identityFields(),
      eventIndex: ledger.nextEventIndex,
      kind: "finish",
      seat,
      publicStableKey: finishPublicStableKey(position, finishReason),
      trickIndex: ledger.currentTrick.trickIndex,
      finishPosition: position,
      remainingHandCount,
      finishReason,
    });
  };
  const triggerCards = new Set(triggerCardByFinishSeat.values());
  for (const cardId of publicCardsBeforeLast) {
    if (triggerCards.has(cardId)) continue;
    const seat = assignedSeatByCard.get(cardId);
    if (seat === undefined) throw new Error("REPLAY_FIXTURE_ASSIGNMENT_MISSING");
    appendSinglePlay(cardId, seat);
  }
  for (const [position, seat] of input.finishOrder.entries()) {
    const triggerCard = triggerCardByFinishSeat.get(seat);
    if (triggerCard === undefined) continue;
    appendSinglePlay(triggerCard, seat);
    if (ledger.handCounts[seat] !== 0) throw new Error("REPLAY_FIXTURE_FINISH_COUNT_INVALID");
    appendFinish(position + 1, seat, "hand-empty", 0);
  }
  if (input.currentLastPlay !== null && input.currentLastPlaySeat !== null) {
    const canonicalGroup = classifyPlay([...input.currentLastPlay.cards], "2");
    if (canonicalGroup === undefined) throw new Error("REPLAY_FIXTURE_LAST_PLAY_GROUP_INVALID");
    const cardIds = [...canonicalGroup.cards].map((card) => card.id).sort();
    const handCountBefore = ledger.handCounts[input.currentLastPlaySeat];
    append({
      ...identityFields(),
      eventIndex: ledger.nextEventIndex,
      kind: "play",
      seat: input.currentLastPlaySeat,
      publicStableKey: playPublicStableKey(cardIds),
      publicCardIds: cardIds,
      patternType: canonicalGroup.type,
      groupType: canonicalGroup.type,
      handCountBefore,
      handCountAfter: handCountBefore - cardIds.length,
      trickIndex: ledger.currentTrick.trickIndex,
    });
    const currentLastPosition = input.currentLastPlaySeat === null ? -1 : input.finishOrder.indexOf(input.currentLastPlaySeat);
    if (currentLastPosition >= 0) {
      if (ledger.handCounts[input.currentLastPlaySeat] !== 0) throw new Error("REPLAY_FIXTURE_LAST_FINISH_COUNT_INVALID");
      appendFinish(currentLastPosition + 1, input.currentLastPlaySeat, "hand-empty", 0);
    }
    for (let position = currentLastPosition + 1; position < input.finishOrder.length; position += 1) {
      const seat = input.finishOrder[position]!;
      appendFinish(position + 1, seat, "round-settlement", 0);
    }
  }
  if (input.currentLastPlay !== null) {
    for (const seat of input.currentTrick.passSeats) {
      const handCount = ledger.handCounts[seat];
      append({
        ...identityFields(),
        eventIndex: ledger.nextEventIndex,
        kind: "pass",
        seat,
        publicStableKey: "pass:v2",
        handCountBefore: handCount,
        handCountAfter: handCount,
        trickIndex: ledger.currentTrick.trickIndex,
      });
    }
  } else if (hasPublicPlay) {
    const lastPlaySeat = ledger.currentTrick.lastPlaySeat;
    if (lastPlaySeat === undefined) throw new Error("REPLAY_FIXTURE_LAST_PLAY_MISSING");
    const requiredPasses = Math.max(1, 4 - input.finishOrder.length - 1);
    const passSeats = ([0, 1, 2, 3] as const).filter((seat) => !input.finishOrder.includes(seat) && seat !== lastPlaySeat);
    if (passSeats.length < requiredPasses) throw new Error("REPLAY_FIXTURE_PASS_QUORUM_INVALID");
    for (const seat of passSeats.slice(0, requiredPasses)) {
      const handCount = ledger.handCounts[seat];
      append({
        ...identityFields(),
        eventIndex: ledger.nextEventIndex,
        kind: "pass",
        seat,
        publicStableKey: "pass:v2",
        handCountBefore: handCount,
        handCountAfter: handCount,
        trickIndex: ledger.currentTrick.trickIndex,
      });
    }
    const nextTrickIndex = ledger.currentTrick.trickIndex + 1;
    const clearLeadSeat = resolveFixtureTrickWinnerSeat(lastPlaySeat, input.finishOrder);
    if (clearLeadSeat === undefined) throw new Error("REPLAY_FIXTURE_CLEAR_LEAD_MISSING");
    append({
      ...identityFields(),
      eventIndex: ledger.nextEventIndex,
      kind: "trick-clear",
      seat: clearLeadSeat,
      publicStableKey: trickClearPublicStableKey(ledger.currentTrick.trickIndex, nextTrickIndex),
      trickIndex: ledger.currentTrick.trickIndex,
      leadSeat: clearLeadSeat,
    });
  }
  if (ledger.handCounts[0] !== input.hands[0].length
    || ledger.handCounts[1] !== input.hands[1].length
    || ledger.handCounts[2] !== input.hands[2].length
    || ledger.handCounts[3] !== input.hands[3].length
    || ledger.finishOrder.length !== input.finishOrder.length
    || ledger.finishOrder.some((seat, index) => input.finishOrder[index] !== seat)) throw new Error("REPLAY_FIXTURE_FINAL_COUNTS_INVALID");
  return { initialLedger, finalLedger: ledger, events };
}

function resolveFixtureTrickWinnerSeat(lastPlaySeat: PublicSeat, finishOrder: readonly PublicSeat[]): PublicSeat | undefined {
  if (!finishOrder.includes(lastPlaySeat)) return lastPlaySeat;
  const partner = ((lastPlaySeat + 2) % 4) as PublicSeat;
  if (!finishOrder.includes(partner)) return partner;
  for (let offset = 1; offset <= 4; offset += 1) {
    const seat = ((lastPlaySeat + 4 - offset) % 4) as PublicSeat;
    if (!finishOrder.includes(seat)) return seat;
  }
  return undefined;
}

function makeUnusedRandomView(): RolloutReplicateInput["random"] {
  const coordinate = createCrnCoordinate({ rootIdentity: ROOT_IDENTITY, scenarioIdentity: SCENARIO_IDENTITY, replicateIdentity: REPLICATE_IDENTITY, ply: 0, actingSeat: 0, randomDomain: "unused-input-view" });
  if (!coordinate.ok) throw new Error("UNUSED_VIEW_COORDINATE_INVALID");
  const view = createCrnView({ coordinate: coordinate.value, randomDomain: deriveRandomDomain(coordinate.value) });
  if (!view.ok) throw new Error("UNUSED_VIEW_INVALID");
  return view.view;
}

function makeState(overrides: Partial<IsolatedRolloutState> = {}): IsolatedRolloutState {
  const deck = createDeck();
  const finishOrder = overrides.finishOrder ?? [];
  const publicPlayedCardIds = overrides.publicPlayedCardIds ?? [];
  const requestedHands = overrides.hands ?? { 0: [deck[0]!], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] };
  const hands = completeHands(requestedHands, publicPlayedCardIds, finishOrder);
  const physicalPublicPlayedCardIds = completePublicPlayedCardIds(hands, publicPlayedCardIds);
  return {
    hands,
    publicPlayedCardIds: physicalPublicPlayedCardIds,
    currentLastPlay: overrides.currentLastPlay ?? null,
    currentLastPlaySeat: overrides.currentLastPlaySeat ?? null,
    currentTrick: overrides.currentTrick ?? { trickIndex: 0, leadSeat: 0, passSeats: [] },
    handCounts: overrides.handCounts ?? { 0: hands[0].length, 1: hands[1].length, 2: hands[2].length, 3: hands[3].length },
    finishOrder,
    actingSeat: overrides.actingSeat ?? 0,
    expectedCardIds: overrides.expectedCardIds ?? deck.map((card) => card.id),
    gameRank: overrides.gameRank ?? "2",
  };
}

function makePassStates(
  finishOrder: readonly PublicSeat[],
  lastPlaySeat: PublicSeat,
  passSeats: readonly PublicSeat[],
  actingSeat: PublicSeat,
  clearLeadSeat: PublicSeat,
): { before: IsolatedRolloutState; after: IsolatedRolloutState } {
  const deck = createDeck();
  const hands = {
    0: finishOrder.includes(0) ? [] : [deck[0]!],
    1: finishOrder.includes(1) ? [] : [deck[1]!],
    2: finishOrder.includes(2) ? [] : [deck[2]!],
    3: finishOrder.includes(3) ? [] : [deck[3]!],
  };
  const currentLastPlay = singleAction(deck[4]!).group;
  const before = makeState({
    hands,
    finishOrder,
    currentLastPlay,
    currentLastPlaySeat: lastPlaySeat,
    currentTrick: {
      trickIndex: 0,
      leadSeat: lastPlaySeat,
      lastPlaySeat,
      lastPlayStableKey: playPublicStableKey(currentLastPlay.cards.map((card) => card.id)),
      passSeats,
    },
    actingSeat,
  });
  const after = makeState({
    hands,
    publicPlayedCardIds: before.publicPlayedCardIds,
    finishOrder,
    currentLastPlay: null,
    currentLastPlaySeat: null,
    currentTrick: { trickIndex: 1, leadSeat: clearLeadSeat, passSeats: [] },
    actingSeat: clearLeadSeat,
  });
  return { before, after };
}

function completeHands(
  requestedHands: Readonly<Record<PublicSeat, readonly Card[]>>,
  publicPlayedCardIds: readonly string[],
  finishOrder: readonly PublicSeat[],
): Record<PublicSeat, Card[]> {
  return {
    0: [...requestedHands[0]],
    1: [...requestedHands[1]],
    2: [...requestedHands[2]],
    3: [...requestedHands[3]],
  };
}

function completePublicPlayedCardIds(
  hands: Readonly<Record<PublicSeat, readonly Card[]>>,
  requestedPublicPlayedCardIds: readonly string[],
): string[] {
  const used = new Set([...hands[0], ...hands[1], ...hands[2], ...hands[3]].map((card) => card.id).concat(requestedPublicPlayedCardIds));
  const remaining = createDeck().filter((card) => !used.has(card.id)).map((card) => card.id);
  return [...requestedPublicPlayedCardIds, ...remaining];
}
