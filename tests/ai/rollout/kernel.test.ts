import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createDeck, type Card } from "../../../src/engine/cards";
import type { CardGroup } from "../../../src/engine/groups";
import { classifyPlay } from "../../../src/game/playRules";
import { buildPublicGameIdentity, type PublicSeat } from "../../../src/game/publicEvent";
import { createInitialPublicLedger } from "../../../src/game/publicLedger";
import { validateRolloutState, type IsolatedRolloutState } from "../../../src/ai/rollout/stateConservation";
import { runRolloutReplicate } from "../../../src/ai/rollout/kernel";
import { canonicalActionIdentity, type RolloutAction, type RolloutReplicateInput, type RolloutScenario, type RolloutPublicState } from "../../../src/ai/rollout/contracts";
import { canonicalCrnDomainBytes, createCanonicalSemanticKey, createCrnCoordinate, deriveRandomDomain } from "../../../src/ai/rollout/identity";
import { createCrnView } from "../../../src/ai/rollout/crn";

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
    for (const group of invalidGroups) {
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
      expect(result).toEqual({ ok: false, failure: { kind: "simulation-failed", stage: "replay" } });
      expect(input.scenario.privateState).toEqual(before);
      expect(result).not.toHaveProperty("utility");
    }
  });

  test("rejects an illegal root action atomically", () => {
    const deck = createDeck();
    const input = makeInput({ candidate: singleAction(deck[5]!) });
    const before = structuredClone(input.scenario.privateState);
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result).toEqual({ ok: false, failure: { kind: "simulation-failed", stage: "replay" } });
    expect(input.scenario.privateState).toEqual(before);
    expect(result).not.toHaveProperty("utility");
  });

  test("discards a next state when post-transition ledger validation fails", () => {
    const input = makeInput();
    const ledger = (input.scenario.privateState as Record<string, unknown>).ledger as Record<string, unknown>;
    ledger.nextEventIndex = Number.NaN;
    const before = structuredClone(input.scenario.privateState);
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result).toEqual({ ok: false, failure: { kind: "simulation-failed", stage: "replay" } });
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

  test("returns terminal utility when a root action makes the first two finishers partners", () => {
    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[4]!, deck[5]!] },
      finishOrder: [0],
      actingSeat: 3,
      candidate: singleAction(deck[4]!),
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("failure", { kind: "budget-exhausted" });
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

    const rotated = makeInput({
      hands: { 0: [deck[0]!], 1: [], 2: [deck[2]!], 3: [deck[3]!] },
      finishOrder: [1],
      actingSeat: 3,
      candidate: singleAction(deck[3]!),
    });
    const rotatedResult = runRolloutReplicate(rotated, ROOT_IDENTITY);
    expect(rotatedResult).toMatchObject({ ok: true });
  });

  test("handles pass and trick clear while conserving the stable state", () => {
    const deck = createDeck();
    const input = makeInput({
      hands: { 0: [deck[1]!], 1: [deck[2]!], 2: [], 3: [] },
      publicPlayedCardIds: [deck[0]!.id],
      finishOrder: [2, 3],
      currentLastPlay: singleAction(deck[0]!).group,
      currentLastPlaySeat: 0,
      currentTrick: { trickIndex: 0, leadSeat: 0, lastPlaySeat: 0, lastPlayStableKey: `play:${deck[0]!.id}`, passSeats: [] },
      actingSeat: 1,
      maxPliesPerReplicate: 1,
      candidate: { type: "pass" },
    });
    const result = runRolloutReplicate(input, ROOT_IDENTITY);
    expect(result.ok).toBe(true);
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

  test("rejects hostile kernel input graphs before reading values or invoking callbacks", () => {
    const cases: Array<(input: RolloutReplicateInput, calls: { getters: number; callbacks: number }) => void> = [
      (input, calls) => Object.defineProperty(input, "candidate", { get: () => { calls.getters += 1; return input.candidate; } }),
      (input, calls) => Object.defineProperty(input.validatedBudget, "budget", { get: () => { calls.getters += 1; return input.validatedBudget.budget; } }),
      (input, calls) => Object.defineProperty((input.scenario.privateState as Record<string, unknown>).hands as object, "0", { get: () => { calls.getters += 1; return []; } }),
      (input) => Object.defineProperty(input, Symbol("hostile"), { value: 1 }),
      (input) => Object.setPrototypeOf(input.scenario.privateState, { inherited: true }),
      (input) => Object.setPrototypeOf((input.scenario.privateState as Record<string, unknown>).hands as object, { [Symbol.iterator]: () => [] }),
      (input) => { (input.scenario.privateState as Record<string, unknown>).currentTrick = new Array(1); },
      (input) => { const trick = (input.scenario.privateState as Record<string, unknown>).currentTrick as Record<string, unknown>; trick.self = trick; },
      (input) => { ((input.scenario.privateState as Record<string, unknown>).handCounts as Record<string, unknown>)["0"] = Number.NaN; },
      (input) => { ((input.validatedBudget as Record<string, unknown>).budget as Record<string, unknown>).maxWorkUnits = -0; },
      (input) => delete (input as unknown as Record<string, unknown>).publicState,
      (input) => { (input as unknown as Record<string, unknown>).unexpected = 1; },
    ];
    for (const mutate of cases) {
      const input = makeInput();
      const calls = { getters: 0, callbacks: 0 };
      const random = { value: () => { calls.callbacks += 1; return 0.5; } };
      (input as unknown as { random: RolloutReplicateInput["random"] }).random = random;
      mutate(input, calls);
      const result = runRolloutReplicate(input, ROOT_IDENTITY);
      expect(result).toEqual({ ok: false, failure: { kind: "simulation-failed", stage: "replay" } });
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
  candidate?: RolloutAction;
  maxPliesPerReplicate?: number;
  maxPolicyActionEvaluationsPerPly?: number;
  maxWorkUnits?: number;
}> = {}): RolloutReplicateInput {
  const deck = createDeck();
  const publicPlayedCardIds = options.publicPlayedCardIds ?? [];
  const finishOrder = options.finishOrder ?? [];
  const requestedHands = options.hands ?? { 0: [deck[0]!], 1: [deck[1]!], 2: [deck[2]!], 3: [deck[3]!] };
  const hands = completeHands(requestedHands, publicPlayedCardIds, finishOrder);
  const physicalPublicPlayedCardIds = completePublicPlayedCardIds(hands, publicPlayedCardIds);
  const handCounts = { 0: hands[0].length, 1: hands[1].length, 2: hands[2].length, 3: hands[3].length } as const;
  const identity = buildPublicGameIdentity("task4-kernel-fixture", 0, 0, "benchmark-scenario");
  let ledger = createInitialPublicLedger({
    identity,
    initialHandCounts: handCounts,
    openingLeader: options.actingSeat ?? 0,
    initialTrickIndex: options.currentTrick?.trickIndex ?? 0,
    openingTributePublicState: { phase: "initial" },
  });
  ledger = {
    ...ledger,
    playedCardIds: [...physicalPublicPlayedCardIds],
    handCounts: { ...handCounts },
    finishOrder: [...finishOrder],
    currentTrick: options.currentTrick ?? { trickIndex: 0, leadSeat: 0, passSeats: [] },
  };
  const state = {
    hands,
    publicPlayedCardIds: physicalPublicPlayedCardIds,
    revealedTransferEvents: [],
    currentLastPlay: options.currentLastPlay,
    currentTrick: options.currentTrick ?? { trickIndex: 0, leadSeat: 0, passSeats: [] },
    handCounts,
    finishOrder,
    ledger,
  };
  const publicState: RolloutPublicState = {
    gameRank: "2",
    actingSeat: options.actingSeat ?? 0,
    perspectiveSeat: 0,
    partnerSeat: 2,
    handCounts,
    finishOrder,
    publicPlayedCardIds: physicalPublicPlayedCardIds,
    currentLastPlay: options.currentLastPlay ?? null,
    currentLastPlaySeat: options.currentLastPlaySeat ?? (options.currentTrick?.lastPlaySeat ?? null),
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
