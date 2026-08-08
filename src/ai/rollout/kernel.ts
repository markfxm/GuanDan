import type { Card } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { classifyPlay, canBeatPlay } from "../../game/playRules";
import {
  finishPublicStableKey,
  playPublicStableKey,
  trickClearPublicStableKey,
  type PublicActionEvent,
  type PublicSeat,
} from "../../game/publicEvent";
import { finalizePublicActionEvent } from "../../game/publicEventHash";
import { applyPublicEvent, type HardPublicLedger } from "../../game/publicLedger";
import { evaluateNonTerminalLeaf } from "./leafEvaluation";
import { createCrnView } from "./crn";
import {
  createCanonicalRandomDomainLabel,
  createCrnCoordinate,
  deriveRandomDomain,
} from "./identity";
import { createInternalRolloutPolicy } from "./policy";
import {
  validateActionTransition,
  validateRolloutState,
  type IsolatedRolloutState,
} from "./stateConservation";
import { evaluateTeamUtility } from "./teamUtility";
import {
  validateRolloutBudget,
  type RolloutAction,
  type RolloutKernelFailure,
  type RolloutPolicyResult,
  type RolloutPublicState,
  type RolloutReplicateInput,
  type RolloutReplicateResult,
} from "./contracts";
import type { RootIdentity } from "./contracts";

const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];
const RANDOM_DOMAIN_LABEL = "policy-action-v1";

type MutableRolloutState = {
  hands: Record<PublicSeat, Card[]>;
  publicPlayedCardIds: string[];
  currentLastPlay: CardGroup | null;
  currentLastPlaySeat: PublicSeat | null;
  currentTrick: {
    trickIndex: number;
    leadSeat: PublicSeat;
    lastPlaySeat?: PublicSeat;
    lastPlayStableKey?: string;
    passSeats: PublicSeat[];
  };
  handCounts: Record<PublicSeat, number>;
  finishOrder: PublicSeat[];
  actingSeat: PublicSeat;
  expectedCardIds: readonly string[];
  gameRank: RolloutPublicState["gameRank"];
  ledger: HardPublicLedger;
  publicEvents: PublicActionEvent[];
};

export function runRolloutReplicate(
  input: RolloutReplicateInput,
  rootIdentity: RootIdentity,
): RolloutReplicateResult {
  const budget = validateInputBudget(input);
  if (!budget.ok) return budgetFailure(0, 0);
  if (!isRootIdentity(rootIdentity)) return simulationFailure("replay");

  let state: MutableRolloutState;
  try {
    state = createIsolatedState(input);
  } catch {
    return simulationFailure("state-conservation");
  }
  if (!stateConservationOk(state)) return simulationFailure("state-conservation");

  let workUnits = 1;
  if (workUnits > budget.value.maximumWorkUnits) return budgetFailure(workUnits, budget.value.maximumWorkUnits);

  const rootApplied = applyLegalAction(state, input.candidate.action);
  if (!rootApplied) return simulationFailure("replay");
  if (!stateConservationOk(state)) return simulationFailure("state-conservation");

  const rootTerminal = terminalResult(state, input, workUnits);
  if (rootTerminal !== undefined) return rootTerminal;

  const policyResult = createInternalRolloutPolicy("d2f-lightweight-v1");
  if (!policyResult.ok) return policyFailure({ kind: "invalid-policy-context", field: "ply" });
  const policy = policyResult.policy;

  for (let ply = 0; ply < budget.value.budget.maxPliesPerReplicate; ply += 1) {
    const random = createDecisionCrn(rootIdentity, input, ply, state.actingSeat);
    if (!random.ok) return simulationFailure("replay");
    const observation = makeObservation(state);
    const legalActions = policy.listLegalActions(observation);
    if (legalActions.length === 0) return policyFailure({ kind: "no-legal-action", actingSeat: state.actingSeat });
    if (legalActions.length > budget.value.budget.maxPolicyActionEvaluationsPerPly) {
      return budgetFailure(workUnits, budget.value.maximumWorkUnits);
    }
    if (workUnits > budget.value.maximumWorkUnits - legalActions.length) {
      return budgetFailure(workUnits, budget.value.maximumWorkUnits);
    }

    const chosen = policy.chooseAction(observation, {
      replicateIdentity: input.replicateIdentity,
      ply,
      actingSeat: state.actingSeat,
    }, random.view);
    if (!chosen.ok) return policyFailure(chosen.failure);
    workUnits += legalActions.length;

    const applied = applyLegalAction(state, chosen.action);
    if (!applied) return policyFailure({ kind: "no-legal-action", actingSeat: state.actingSeat });
    if (!stateConservationOk(state)) return simulationFailure("state-conservation");

    const terminal = terminalResult(state, input, workUnits);
    if (terminal !== undefined) return terminal;
  }

  const leaf = evaluateNonTerminalLeaf({
    perspectiveSeat: input.publicState.perspectiveSeat,
    actingSeat: state.actingSeat,
    finishOrder: state.finishOrder,
    handCounts: state.handCounts,
  });
  if (!leaf.ok) return simulationFailure("leaf-evaluation");
  return Object.freeze({
    ok: true as const,
    candidateId: input.candidate.candidateId,
    scenarioIdentity: input.scenario.scenarioIdentity,
    replicateIdentity: input.replicateIdentity,
    utility: leaf.utility,
    workUnits,
  });
}

function validateInputBudget(input: RolloutReplicateInput): ReturnType<typeof validateRolloutBudget> {
  try {
    const result = validateRolloutBudget({ budget: input.validatedBudget.budget, limits: input.validatedBudget.limits });
    if (!result.ok || input.validatedBudget.validated !== true || input.validatedBudget.maximumWorkUnits !== result.value.maximumWorkUnits) {
      return { ok: false, failure: { kind: "invalid-budget", field: "maxWorkUnits" } };
    }
    return result;
  } catch {
    return { ok: false, failure: { kind: "invalid-budget", field: "maxWorkUnits" } };
  }
}

function createIsolatedState(input: RolloutReplicateInput): MutableRolloutState {
  const source = structuredClone(input.scenario.privateState) as Record<string, unknown>;
  const handsInput = source.hands as Record<string, readonly Card[]>;
  const countsInput = source.handCounts as Record<string, number>;
  const finishInput = source.finishOrder as readonly PublicSeat[];
  const publicPlayedCardIds = [...(source.publicPlayedCardIds as readonly string[])];
  const currentTrickInput = source.currentTrick as MutableRolloutState["currentTrick"];
  const currentLastPlay = source.currentLastPlay === undefined ? null : structuredClone(source.currentLastPlay) as CardGroup;
  const ledger = structuredClone(source.ledger) as HardPublicLedger;
  const hands = {
    0: structuredClone(handsInput["0"] ?? handsInput[0]) as Card[],
    1: structuredClone(handsInput["1"] ?? handsInput[1]) as Card[],
    2: structuredClone(handsInput["2"] ?? handsInput[2]) as Card[],
    3: structuredClone(handsInput["3"] ?? handsInput[3]) as Card[],
  };
  const handCounts = {
    0: countsInput["0"] ?? countsInput[0],
    1: countsInput["1"] ?? countsInput[1],
    2: countsInput["2"] ?? countsInput[2],
    3: countsInput["3"] ?? countsInput[3],
  } as Record<PublicSeat, number>;
  const finishOrder = [...finishInput];
  const expectedCardIds = [...hands[0], ...hands[1], ...hands[2], ...hands[3]].map((card) => card.id).concat(publicPlayedCardIds);
  if (!sameNumbers(handCounts, input.publicState.handCounts)
    || !sameArray(finishOrder, input.publicState.finishOrder)
    || !sameArray(publicPlayedCardIds, input.publicState.publicPlayedCardIds)
    || !samePublicLastPlay(currentLastPlay, input.publicState.currentLastPlay)
    || (currentTrickInput.lastPlaySeat ?? null) !== input.publicState.currentLastPlaySeat) throw new Error("PUBLIC_STATE_MISMATCH");
  return {
    hands,
    publicPlayedCardIds,
    currentLastPlay,
    currentLastPlaySeat: currentTrickInput.lastPlaySeat ?? null,
    currentTrick: {
      trickIndex: currentTrickInput.trickIndex,
      leadSeat: currentTrickInput.leadSeat,
      lastPlaySeat: currentTrickInput.lastPlaySeat,
      lastPlayStableKey: currentTrickInput.lastPlayStableKey,
      passSeats: [...currentTrickInput.passSeats],
    },
    handCounts,
    finishOrder,
    actingSeat: input.publicState.actingSeat,
    expectedCardIds,
    gameRank: input.publicState.gameRank,
    ledger,
    publicEvents: [],
  };
}

function applyLegalAction(state: MutableRolloutState, action: RolloutAction): boolean {
  const before = structuredClone(toConservationState(state));
  if (action.type === "pass") {
    if (state.currentLastPlay === null || state.currentLastPlaySeat === null || state.finishOrder.includes(state.actingSeat) || state.currentTrick.passSeats.includes(state.actingSeat)) return false;
    const event = makePassEvent(state);
    if (!appendPublicEvent(state, event)) return false;
    state.currentTrick.passSeats.push(state.actingSeat);
    const lastPlaySeat = state.currentLastPlaySeat;
    const requiredPasses = SEATS.filter((seat) => !state.finishOrder.includes(seat) && seat !== lastPlaySeat);
    if (requiredPasses.every((seat) => state.currentTrick.passSeats.includes(seat))) {
      const leadSeat = resolveTrickWinnerSeat(state, lastPlaySeat);
      const clearEvent = makeTrickClearEvent(state, leadSeat);
      if (!appendPublicEvent(state, clearEvent)) return false;
      state.currentLastPlay = null;
      state.currentLastPlaySeat = null;
      state.currentTrick = {
        trickIndex: state.currentTrick.trickIndex + 1,
        leadSeat,
        lastPlaySeat: undefined,
        lastPlayStableKey: undefined,
        passSeats: [],
      };
      state.actingSeat = leadSeat;
    } else {
      state.actingSeat = nextActiveSeat(state, state.actingSeat);
    }
  } else {
    if (state.finishOrder.includes(state.actingSeat)) return false;
    const cardIds = action.group.cards.map((card) => card.id);
    if (new Set(cardIds).size !== cardIds.length || cardIds.some((id) => !state.hands[state.actingSeat].some((card) => card.id === id))) return false;
    const cards = cardIds.map((id) => state.hands[state.actingSeat].find((card) => card.id === id)!);
    let group: CardGroup | undefined;
    try {
      group = classifyPlay(cards, state.gameRank);
    } catch {
      return false;
    }
    if (group === undefined || !canBeatPlay(group, state.currentLastPlay ?? undefined, state.gameRank)) return false;
    const handCountBefore = state.hands[state.actingSeat].length;
    const event = makePlayEvent(state, group, cardIds, handCountBefore);
    if (!appendPublicEvent(state, event)) return false;
    if (event.kind !== "play" || event.publicCardIds === undefined) return false;
    const orderedIds = [...event.publicCardIds];
    state.hands[state.actingSeat] = state.hands[state.actingSeat].filter((card) => !orderedIds.includes(card.id));
    state.handCounts[state.actingSeat] = state.hands[state.actingSeat].length;
    state.publicPlayedCardIds.push(...orderedIds);
    state.currentLastPlay = deepFreeze(structuredClone(group));
    state.currentLastPlaySeat = state.actingSeat;
    state.currentTrick.lastPlaySeat = state.actingSeat;
    state.currentTrick.lastPlayStableKey = playPublicStableKey(orderedIds);
    state.currentTrick.passSeats = [];
    if (state.hands[state.actingSeat].length === 0) {
      const finish = makeFinishEvent(state);
      if (!appendPublicEvent(state, finish)) return false;
      state.finishOrder.push(state.actingSeat);
    }
    state.actingSeat = nextActiveSeat(state, state.actingSeat);
  }
  const after = toConservationState(state);
  const transition = validateActionTransition(before, after, action);
  return transition.ok;
}

function createDecisionCrn(
  rootIdentity: RootIdentity,
  input: RolloutReplicateInput,
  ply: number,
  actingSeat: PublicSeat,
): ReturnType<typeof createCrnView> {
  const label = createCanonicalRandomDomainLabel(RANDOM_DOMAIN_LABEL);
  if (!label.ok) return { ok: false, failure: label.failure };
  const coordinate = createCrnCoordinate({
    rootIdentity,
    scenarioIdentity: input.scenario.scenarioIdentity,
    replicateIdentity: input.replicateIdentity,
    ply,
    actingSeat,
    randomDomain: label.value,
  });
  if (!coordinate.ok) return coordinate;
  return createCrnView({ coordinate: coordinate.value, randomDomain: deriveRandomDomain(coordinate.value) });
}

function makeObservation(state: MutableRolloutState): import("./contracts").SeatLocalObservation {
  return deepFreeze({
    hand: structuredClone(state.hands[state.actingSeat]),
    publicHistoryEvents: structuredClone(state.publicEvents),
    handCounts: { 0: state.handCounts[0], 1: state.handCounts[1], 2: state.handCounts[2], 3: state.handCounts[3] },
    currentLastPlay: state.currentLastPlay === null ? null : structuredClone(state.currentLastPlay),
    finishOrder: [...state.finishOrder],
    gameRank: state.gameRank,
  });
}

function terminalResult(state: MutableRolloutState, input: RolloutReplicateInput, workUnits: number): RolloutReplicateResult | undefined {
  if (state.finishOrder.length !== SEATS.length) return undefined;
  const utility = evaluateTeamUtility({ perspectiveSeat: input.publicState.perspectiveSeat, finishOrder: state.finishOrder });
  if (!utility.ok) return simulationFailure("leaf-evaluation");
  return Object.freeze({
    ok: true as const,
    candidateId: input.candidate.candidateId,
    scenarioIdentity: input.scenario.scenarioIdentity,
    replicateIdentity: input.replicateIdentity,
    utility: utility.utility,
    workUnits,
  });
}

function appendPublicEvent(state: MutableRolloutState, event: PublicActionEvent): boolean {
  const applied = applyPublicEvent(state.ledger, event);
  if (!applied.ok || applied.kind !== "applied") return false;
  state.ledger = applied.ledger;
  state.publicEvents.push(event);
  return true;
}

function makePlayEvent(state: MutableRolloutState, group: CardGroup, cardIds: readonly string[], handCountBefore: number): PublicActionEvent {
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId: state.ledger.gameId,
    roundIdentity: state.ledger.roundIdentity,
    handIdentity: state.ledger.handIdentity,
    eventIndex: state.ledger.nextEventIndex,
    kind: "play",
    seat: state.actingSeat,
    publicStableKey: playPublicStableKey(cardIds),
    patternType: group.type,
    groupType: group.type,
    handCountBefore,
    handCountAfter: handCountBefore - cardIds.length,
    trickIndex: state.currentTrick.trickIndex,
    publicCardIds: [...cardIds],
  });
}

function makePassEvent(state: MutableRolloutState): PublicActionEvent {
  const handCount = state.handCounts[state.actingSeat];
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId: state.ledger.gameId,
    roundIdentity: state.ledger.roundIdentity,
    handIdentity: state.ledger.handIdentity,
    eventIndex: state.ledger.nextEventIndex,
    kind: "pass",
    seat: state.actingSeat,
    publicStableKey: "pass:v2",
    handCountBefore: handCount,
    handCountAfter: handCount,
    trickIndex: state.currentTrick.trickIndex,
  });
}

function makeTrickClearEvent(state: MutableRolloutState, leadSeat: PublicSeat): PublicActionEvent {
  const nextTrickIndex = state.currentTrick.trickIndex + 1;
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId: state.ledger.gameId,
    roundIdentity: state.ledger.roundIdentity,
    handIdentity: state.ledger.handIdentity,
    eventIndex: state.ledger.nextEventIndex,
    kind: "trick-clear",
    seat: leadSeat,
    publicStableKey: trickClearPublicStableKey(state.currentTrick.trickIndex, nextTrickIndex),
    trickIndex: state.currentTrick.trickIndex,
    leadSeat,
  });
}

function makeFinishEvent(state: MutableRolloutState): PublicActionEvent {
  const position = state.finishOrder.length + 1;
  return finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId: state.ledger.gameId,
    roundIdentity: state.ledger.roundIdentity,
    handIdentity: state.ledger.handIdentity,
    eventIndex: state.ledger.nextEventIndex,
    kind: "finish",
    seat: state.actingSeat,
    publicStableKey: finishPublicStableKey(position, "hand-empty"),
    trickIndex: state.currentTrick.trickIndex,
    finishPosition: position,
    remainingHandCount: 0,
    finishReason: "hand-empty",
  });
}

function stateConservationOk(state: MutableRolloutState): boolean {
  return validateRolloutState(toConservationState(state)).ok;
}

function toConservationState(state: MutableRolloutState): IsolatedRolloutState {
  return {
    hands: state.hands,
    publicPlayedCardIds: state.publicPlayedCardIds,
    currentLastPlay: state.currentLastPlay,
    currentLastPlaySeat: state.currentLastPlaySeat,
    currentTrick: state.currentTrick,
    handCounts: state.handCounts,
    finishOrder: state.finishOrder,
    actingSeat: state.actingSeat,
    expectedCardIds: state.expectedCardIds,
    gameRank: state.gameRank,
  };
}

function nextActiveSeat(state: MutableRolloutState, current: PublicSeat): PublicSeat {
  for (let offset = 1; offset <= SEATS.length; offset += 1) {
    const seat = ((current + 4 - offset) % 4) as PublicSeat;
    if (!state.finishOrder.includes(seat) && state.hands[seat].length > 0) return seat;
  }
  return current;
}

function resolveTrickWinnerSeat(state: MutableRolloutState, lastPlaySeat: PublicSeat): PublicSeat {
  if (!state.finishOrder.includes(lastPlaySeat)) return lastPlaySeat;
  const partner = ((lastPlaySeat + 2) % 4) as PublicSeat;
  if (!state.finishOrder.includes(partner)) return partner;
  return nextActiveSeat(state, lastPlaySeat);
}

function sameNumbers(left: Record<PublicSeat, number>, right: Readonly<Record<PublicSeat, number>>): boolean {
  return SEATS.every((seat) => left[seat] === right[seat]);
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePublicLastPlay(left: CardGroup | null, right: unknown): boolean {
  if (left === null || right === null || right === undefined) return left === null && (right === null || right === undefined);
  if (typeof right !== "object" || right === null) return false;
  const group = right as CardGroup;
  return left.type === group.type && sameArray(left.cards.map((card) => card.id).sort(), group.cards.map((card) => card.id).sort());
}

function isRootIdentity(value: unknown): value is RootIdentity {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value")) deepFreeze(descriptor.value, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function budgetFailure(workUnits: number, maximumWorkUnits: number): RolloutReplicateResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "budget-exhausted" as const, workUnits, maximumWorkUnits }) });
}

function policyFailure(failure: Extract<RolloutPolicyResult, { ok: false }>["failure"]): RolloutReplicateResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "policy-failed" as const, failure: Object.freeze(failure) }) });
}

function simulationFailure(stage: Extract<RolloutKernelFailure, { kind: "simulation-failed" }>["stage"]): RolloutReplicateResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "simulation-failed" as const, stage }) });
}
