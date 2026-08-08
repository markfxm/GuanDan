import { RANKS, SUITS, createDeck, type Card } from "../../engine/cards";
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
  canonicalActionIdentity,
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
const INPUT_KEYS = ["candidate", "scenario", "publicState", "replicateIdentity", "random", "validatedBudget"] as const;

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
  const isolatedInput = isolateRolloutInput(input);
  if (isolatedInput === undefined) return simulationFailure("replay");
  const budget = validateInputBudget(isolatedInput);
  if (!budget.ok) return budgetFailure(0, 0);
  if (!isRootIdentity(rootIdentity)) return simulationFailure("replay");

  let state: MutableRolloutState;
  try {
    state = createIsolatedState(isolatedInput);
  } catch {
    return simulationFailure("state-conservation");
  }
  if (!stateConservationOk(state)) return simulationFailure("state-conservation");

  let workUnits = 1;
  if (workUnits > budget.value.maximumWorkUnits) return budgetFailure(workUnits, budget.value.maximumWorkUnits);

  const rootApplied = applyLegalAction(state, isolatedInput.candidate.action);
  if (rootApplied === undefined) return simulationFailure("replay");
  state = rootApplied;

  const rootTerminal = terminalResult(state, isolatedInput, workUnits);
  if (rootTerminal !== undefined) return rootTerminal;

  const policyResult = createInternalRolloutPolicy("d2f-lightweight-v1");
  if (!policyResult.ok) return policyFailure({ kind: "invalid-policy-context", field: "ply" });
  const policy = policyResult.policy;

  for (let ply = 0; ply < budget.value.budget.maxPliesPerReplicate; ply += 1) {
    const observation = makeObservation(state);
    const random = createDecisionCrn(rootIdentity, isolatedInput, ply, state.actingSeat);
    if (!random.ok) return simulationFailure("replay");
    const legalActions = policy.listLegalActions(observation);
    if (legalActions.length === 0) return policyFailure({ kind: "no-legal-action", actingSeat: state.actingSeat });
    if (legalActions.length > budget.value.budget.maxPolicyActionEvaluationsPerPly) {
      return budgetFailure(workUnits, budget.value.maximumWorkUnits);
    }
    if (workUnits > budget.value.maximumWorkUnits - legalActions.length) {
      return budgetFailure(workUnits, budget.value.maximumWorkUnits);
    }

    const chosen = policy.chooseAction(observation, {
      replicateIdentity: isolatedInput.replicateIdentity,
      ply,
      actingSeat: state.actingSeat,
    }, random.view);
    if (!chosen.ok) return policyFailure(chosen.failure);
    workUnits += legalActions.length;

    const applied = applyLegalAction(state, chosen.action);
    if (applied === undefined) return simulationFailure("replay");
    state = applied;

    const terminal = terminalResult(state, isolatedInput, workUnits);
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
    candidateId: isolatedInput.candidate.candidateId,
    scenarioIdentity: isolatedInput.scenario.scenarioIdentity,
    replicateIdentity: isolatedInput.replicateIdentity,
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

function isolateRolloutInput(input: unknown): RolloutReplicateInput | undefined {
  try {
    if (!isPlainDataRecord(input, INPUT_KEYS, true)) return undefined;
    const candidate = getOwnData(input, "candidate");
    const scenario = getOwnData(input, "scenario");
    const publicState = getOwnData(input, "publicState");
    const replicateIdentity = getOwnData(input, "replicateIdentity");
    const random = getOwnData(input, "random");
    const validatedBudget = getOwnData(input, "validatedBudget");
    if (!isPlainDataGraph(candidate) || !isPlainDataGraph(scenario) || !isPlainDataGraph(publicState) || !isPlainDataGraph(replicateIdentity) || !isPlainDataGraph(validatedBudget) || !isCrnViewEnvelope(random)) return undefined;
    if (!isCandidateInput(candidate) || !isScenarioInput(scenario) || !isPublicStateInput(publicState) || typeof replicateIdentity !== "string" || !/^[a-f0-9]{64}$/.test(replicateIdentity)) return undefined;
    const safeInput = {
      candidate: structuredClone(candidate),
      scenario: structuredClone(scenario),
      publicState: structuredClone(publicState),
      replicateIdentity: structuredClone(replicateIdentity),
      random,
      validatedBudget: structuredClone(validatedBudget),
    } as RolloutReplicateInput;
    const budget = validateInputBudget(safeInput);
    if (!budget.ok) return undefined;
    return Object.freeze(safeInput);
  } catch {
    return undefined;
  }
}

function isCandidateInput(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["candidateId", "action", "baselineEvaluatorScore"], true)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.candidateId !== "string" || candidate.candidateId.length === 0 || typeof candidate.baselineEvaluatorScore !== "number" || !Number.isFinite(candidate.baselineEvaluatorScore) || Object.is(candidate.baselineEvaluatorScore, -0)) return false;
  if (!isActionInput(candidate.action)) return false;
  try {
    return candidate.candidateId === canonicalActionIdentity(candidate.action as RolloutAction);
  } catch {
    return false;
  }
}

function isScenarioInput(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["scenarioIdentity", "normalizedWeight", "privateState"], true)) return false;
  const scenario = value as Record<string, unknown>;
  return typeof scenario.scenarioIdentity === "string"
    && /^[a-f0-9]{64}$/.test(scenario.scenarioIdentity)
    && typeof scenario.normalizedWeight === "number"
    && Number.isFinite(scenario.normalizedWeight)
    && !Object.is(scenario.normalizedWeight, -0)
    && scenario.normalizedWeight >= 0
    && isPrivateStateInput(scenario.privateState);
}

function isPublicStateInput(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["gameRank", "actingSeat", "perspectiveSeat", "partnerSeat", "handCounts", "finishOrder", "publicPlayedCardIds", "currentLastPlay", "currentLastPlaySeat"], true)) return false;
  const state = value as Record<string, unknown>;
  return isGameRank(state.gameRank)
    && isSeat(state.actingSeat)
    && isSeat(state.perspectiveSeat)
    && isSeat(state.partnerSeat)
    && isHandCounts(state.handCounts)
    && isCanonicalSeatArray(state.finishOrder)
    && isCardIdArray(state.publicPlayedCardIds)
    && (state.currentLastPlay === null || isCardGroupInput(state.currentLastPlay))
    && (state.currentLastPlaySeat === null || isSeat(state.currentLastPlaySeat));
}

function isPrivateStateInput(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["hands", "publicPlayedCardIds", "revealedTransferEvents", "currentTrick", "currentLastPlay", "handCounts", "finishOrder", "ledger"], false)) return false;
  const state = value as Record<string, unknown>;
  if (!hasOwnDataKey(state, "hands") || !hasOwnDataKey(state, "publicPlayedCardIds") || !hasOwnDataKey(state, "currentTrick") || !hasOwnDataKey(state, "handCounts") || !hasOwnDataKey(state, "finishOrder") || !hasOwnDataKey(state, "ledger")) return false;
  if (!isPlainDataRecord(state.hands, ["0", "1", "2", "3"], true)) return false;
  const hands = state.hands as Record<string, unknown>;
  if (!(SEATS.every((seat) => isCardArray(hands[String(seat)])))) return false;
  return isCardIdArray(state.publicPlayedCardIds)
    && (state.currentLastPlay === undefined || state.currentLastPlay === null || isCardGroupInput(state.currentLastPlay))
    && isCurrentTrickInput(state.currentTrick)
    && isHandCounts(state.handCounts)
    && isCanonicalSeatArray(state.finishOrder)
    && isPlainDataRecord(state.ledger);
}

function isActionInput(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["type", "group"], false)) return false;
  const action = value as Record<string, unknown>;
  if (action.type === "pass") return Object.keys(action).length === 1;
  return action.type === "play" && isCardGroupInput(action.group);
}

function isCardGroupInput(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["id", "type", "label", "purpose", "cards", "wildcards", "strength"], true)) return false;
  const group = value as Record<string, unknown>;
  if (typeof group.id !== "string" || group.id.length === 0 || typeof group.type !== "string" || typeof group.label !== "string" || typeof group.purpose !== "string" || !isNonNegativeSafeInteger(group.strength) || !isCardArray(group.cards) || group.cards.length === 0 || !isCardArray(group.wildcards)) return false;
  const cardIds = group.cards.map((card) => card.id);
  const wildcardIds = group.wildcards.map((card) => card.id);
  return new Set(cardIds).size === cardIds.length
    && new Set(wildcardIds).size === wildcardIds.length
    && wildcardIds.every((id) => cardIds.includes(id));
}

function isCardArray(value: unknown): value is readonly Card[] {
  return isPlainDataArray(value) && value.every(isCardInput);
}

function isCardInput(value: unknown): value is Card {
  if (!isPlainDataRecord(value, ["id", "kind", "rank", "suit", "copy"], false)) return false;
  const card = value as Record<string, unknown>;
  if (typeof card.id !== "string" || typeof card.kind !== "string" || typeof card.rank !== "string" || (card.copy !== 1 && card.copy !== 2)) return false;
  if (card.kind === "joker") return Object.keys(card).length === 4 && (card.rank === "SJ" || card.rank === "BJ") && card.id === `Joker-${card.rank}-${card.copy}`;
  return Object.keys(card).length === 5 && card.kind === "suited" && typeof card.suit === "string" && SUITS.includes(card.suit as (typeof SUITS)[number]) && RANKS.includes(card.rank as (typeof RANKS)[number]) && card.id === `${card.suit === "spades" ? "S" : card.suit === "clubs" ? "C" : card.suit === "hearts" ? "H" : "D"}${card.rank}-${card.copy}`;
}

function isCardIdArray(value: unknown): value is readonly string[] {
  return isPlainDataArray(value) && value.every((id) => typeof id === "string" && /^(?:[SCHD](?:10|[AKQJ2-9])-[12]|Joker-(?:SJ|BJ)-[12])$/.test(id));
}

function isHandCounts(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["0", "1", "2", "3"], true)) return false;
  const counts = value as Record<string, unknown>;
  return SEATS.every((seat) => isNonNegativeSafeInteger(counts[String(seat)]));
}

function isCanonicalSeatArray(value: unknown): value is readonly PublicSeat[] {
  if (!isPlainDataArray(value) || value.length > SEATS.length || !value.every(isSeat)) return false;
  return new Set(value).size === value.length;
}

function isCurrentTrickInput(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["trickIndex", "leadSeat", "lastPlaySeat", "lastPlayStableKey", "passSeats"], false)) return false;
  const trick = value as Record<string, unknown>;
  return isNonNegativeSafeInteger(trick.trickIndex)
    && isSeat(trick.leadSeat)
    && (trick.lastPlaySeat === undefined || isSeat(trick.lastPlaySeat))
    && (trick.lastPlayStableKey === undefined || typeof trick.lastPlayStableKey === "string")
    && isCanonicalSeatArray(trick.passSeats);
}

function isCrnViewEnvelope(value: unknown): boolean {
  if (!isPlainDataRecord(value, ["value"], true)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "value");
  return descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "function";
}

function isPlainDataGraph(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = (Array.isArray(value) ? isPlainDataArray(value) : isPlainDataRecord(value))
    && Reflect.ownKeys(value).every((key) => typeof key === "string" && isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)) && isPlainDataGraph((Object.getOwnPropertyDescriptor(value, key) as PropertyDescriptor & { value: unknown }).value, ancestors));
  ancestors.delete(value);
  return valid;
}

function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    const allowed = allowedKeys === undefined ? undefined : new Set(allowedKeys);
    if (ownKeys.some((key) => typeof key !== "string" || (allowed !== undefined && !allowed.has(key)))) return false;
    if (exact && allowed !== undefined && (ownKeys.length !== allowed.size || allowedKeys!.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const length = Object.getOwnPropertyDescriptor(value, "length");
    if (!isDataDescriptor(length) || !isNonNegativeSafeInteger(length.value)) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length.value + 1 || !ownKeys.includes("length")) return false;
    for (let index = 0; index < length.value; index += 1) {
      if (!ownKeys.includes(String(index)) || !isDataDescriptor(Object.getOwnPropertyDescriptor(value, String(index)))) return false;
    }
    return ownKeys.every((key) => key === "length" || (typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < length.value));
  } catch {
    return false;
  }
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function getOwnData(value: unknown, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
  if (!isDataDescriptor(descriptor)) throw new TypeError("DATA_PROPERTY_INVALID");
  return descriptor.value;
}

function hasOwnDataKey(value: Record<string, unknown>, key: string): boolean {
  return isDataDescriptor(Object.getOwnPropertyDescriptor(value, key));
}

function isSeat(value: unknown): value is PublicSeat {
  return isNonNegativeSafeInteger(value) && (value === 0 || value === 1 || value === 2 || value === 3);
}

function isGameRank(value: unknown): value is RolloutPublicState["gameRank"] {
  return typeof value === "string" && RANKS.includes(value as (typeof RANKS)[number]);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
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
  const expectedCardIds = createDeck().map((card) => card.id);
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

function applyLegalAction(state: MutableRolloutState, action: RolloutAction): MutableRolloutState | undefined {
  const before = structuredClone(toConservationState(state));
  const candidateState = structuredClone(state) as MutableRolloutState;
  try {
    if (!applyLegalActionInPlace(candidateState, action)) return undefined;
  } catch {
    return undefined;
  }
  const after = toConservationState(candidateState);
  const transition = validateActionTransition(before, after, action);
  if (!transition.ok || !stateConservationOk(candidateState)) return undefined;
  return candidateState;
}

function applyLegalActionInPlace(state: MutableRolloutState, action: RolloutAction): boolean {
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
    if (group === undefined
      || group.id !== action.group.id
      || group.type !== action.group.type
      || group.strength !== action.group.strength
      || !sameCardIdMultiset(group.cards.map((card) => card.id), action.group.cards.map((card) => card.id))
      || !canBeatPlay(group, state.currentLastPlay ?? undefined, state.gameRank)) return false;
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
  return true;
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
  if (!isAuthoritativeTerminal(state.finishOrder)) return undefined;
  const projectedFinishOrder = projectFinishOrder(state.finishOrder);
  if (projectedFinishOrder === undefined) return simulationFailure("leaf-evaluation");
  const utility = evaluateTeamUtility({ perspectiveSeat: input.publicState.perspectiveSeat, finishOrder: projectedFinishOrder });
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

function isAuthoritativeTerminal(finishOrder: readonly PublicSeat[]): boolean {
  if (finishOrder.length >= 3) return true;
  return finishOrder.length === 2 && partnerSeat(finishOrder[0]!) === finishOrder[1];
}

function projectFinishOrder(finishOrder: readonly PublicSeat[]): PublicSeat[] | undefined {
  if (finishOrder.length > SEATS.length || new Set(finishOrder).size !== finishOrder.length) return undefined;
  if (finishOrder.length === SEATS.length) return [...finishOrder];
  if (finishOrder.length === 3) {
    const remaining = SEATS.find((seat) => !finishOrder.includes(seat));
    return remaining === undefined ? undefined : [...finishOrder, remaining];
  }
  if (finishOrder.length !== 2 || partnerSeat(finishOrder[0]!) !== finishOrder[1]) return undefined;
  const projected = [...finishOrder];
  let projectedSeat = projected[projected.length - 1]!;
  while (projected.length < SEATS.length) {
    projectedSeat = ((projectedSeat + 3) % 4) as PublicSeat;
    if (!projected.includes(projectedSeat)) projected.push(projectedSeat);
  }
  return projected;
}

function partnerSeat(seat: PublicSeat): PublicSeat {
  return ((seat + 2) % 4) as PublicSeat;
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

function sameCardIdMultiset(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const counts = new Map<string, number>();
  for (const id of left) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of right) {
    const remaining = counts.get(id);
    if (remaining === undefined) return false;
    if (remaining === 1) counts.delete(id);
    else counts.set(id, remaining - 1);
  }
  return counts.size === 0;
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
