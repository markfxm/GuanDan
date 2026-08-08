import { detectGroups, type CardGroup } from "../../engine/groups";
import type { Card, GameRank } from "../../engine/cards";
import { canBeatPlay } from "../../game/playRules";
import { createCanonicalSemanticKey } from "./identity";
import {
  canonicalActionIdentity,
  type CrnView,
  type RolloutAction,
  type RolloutPolicyDecisionContext,
  type RolloutPolicyId,
  type RolloutPolicyResult,
  type SeatLocalObservation,
} from "./contracts";

export type InternalRolloutPolicy = Readonly<{
  listLegalActions(observation: SeatLocalObservation): readonly RolloutAction[];
  chooseAction(
    observation: SeatLocalObservation,
    context: RolloutPolicyDecisionContext,
    crn: CrnView,
  ): RolloutPolicyResult;
}>;

export type InternalRolloutPolicyFactoryResult =
  | Readonly<{ ok: true; policy: InternalRolloutPolicy }>
  | Readonly<{ ok: false; failure: { kind: "unsupported-policy-id" } }>;

const fixedPolicy: InternalRolloutPolicy = Object.freeze({
  listLegalActions,
  chooseAction,
});

export function createInternalRolloutPolicy(policyId: RolloutPolicyId): InternalRolloutPolicyFactoryResult {
  if (policyId !== "d2f-lightweight-v1") {
    return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "unsupported-policy-id" as const }) });
  }
  return Object.freeze({ ok: true as const, policy: fixedPolicy });
}

function listLegalActions(input: SeatLocalObservation): readonly RolloutAction[] {
  const observation = isolateObservation(input);
  if (observation === undefined) return Object.freeze([]);

  try {
    const lastPlay = observation.currentLastPlay as CardGroup | null;
    const groups = detectGroups([...observation.hand], observation.gameRank)
      .filter((group) => canBeatPlay(group, lastPlay ?? undefined, observation.gameRank))
      .map((group) => freezeAction({
        type: "play",
        group,
      }));
    const actions: RolloutAction[] = [...groups];
    if (lastPlay !== null) actions.push(Object.freeze({ type: "pass" }));
    actions.sort(compareActions);
    return Object.freeze(actions);
  } catch {
    return Object.freeze([]);
  }
}

function chooseAction(
  input: SeatLocalObservation,
  contextInput: RolloutPolicyDecisionContext,
  crn: CrnView,
): RolloutPolicyResult {
  const context = isolateContext(contextInput);
  if (context === undefined) {
    const rawContext = contextInput as unknown as Record<string, unknown>;
    const field = safeContextField(rawContext);
    return policyFailure({ kind: "invalid-policy-context", field });
  }

  const actions = listLegalActions(input);
  if (actions.length === 0) return policyFailure({ kind: "no-legal-action", actingSeat: context.actingSeat });

  let selected = actions[0]!;
  let selectedPriority = Number.POSITIVE_INFINITY;
  for (const action of actions) {
    const semanticKey = createCanonicalSemanticKey(`policy-action:${canonicalActionIdentity(action)}`);
    if (!semanticKey.ok) return policyFailure({ kind: "invalid-policy-context", field: "ply" });
    let priority: number;
    try {
      priority = crn.value(semanticKey.value);
    } catch {
      return policyFailure({ kind: "invalid-policy-context", field: "ply" });
    }
    if (!Number.isFinite(priority) || priority < 0 || priority >= 1) {
      return policyFailure({ kind: "invalid-policy-context", field: "ply" });
    }
    if (priority < selectedPriority) {
      selected = action;
      selectedPriority = priority;
    }
  }

  const legalActions = listLegalActions(input);
  if (!legalActions.some((action) => canonicalActionIdentity(action) === canonicalActionIdentity(selected))) {
    return policyFailure({ kind: "no-legal-action", actingSeat: context.actingSeat });
  }
  return Object.freeze({ ok: true as const, action: selected });
}

function isolateObservation(input: unknown): SeatLocalObservation | undefined {
  try {
    if (!isPlainDataRecord(input, ["hand", "publicHistoryEvents", "handCounts", "currentLastPlay", "finishOrder", "gameRank"], true)) return undefined;
    const hand = getDataProperty(input, "hand");
    const publicHistoryEvents = getDataProperty(input, "publicHistoryEvents");
    const handCounts = getDataProperty(input, "handCounts");
    const currentLastPlay = getDataProperty(input, "currentLastPlay");
    const finishOrder = getDataProperty(input, "finishOrder");
    const gameRank = getDataProperty(input, "gameRank");
    if (!isPlainDataArray(hand) || !isPlainDataArray(publicHistoryEvents) || !isPlainDataRecord(handCounts, ["0", "1", "2", "3"], true) || !isPlainDataArray(finishOrder) || !isGameRank(gameRank)) return undefined;
    if (currentLastPlay !== null && !isPlainDataRecord(currentLastPlay)) return undefined;
    return deepFreeze({
      hand: structuredClone(hand) as readonly Card[],
      publicHistoryEvents: structuredClone(publicHistoryEvents),
      handCounts: structuredClone(handCounts) as Readonly<Record<0 | 1 | 2 | 3, number>>,
      currentLastPlay: currentLastPlay === null ? null : structuredClone(currentLastPlay),
      finishOrder: structuredClone(finishOrder) as readonly (0 | 1 | 2 | 3)[],
      gameRank,
    }) as SeatLocalObservation;
  } catch {
    return undefined;
  }
}

function isolateContext(input: unknown): RolloutPolicyDecisionContext | undefined {
  try {
    if (!isPlainDataRecord(input, ["replicateIdentity", "ply", "actingSeat"], true)) return undefined;
    const replicateIdentity = getDataProperty(input, "replicateIdentity");
    const ply = getDataProperty(input, "ply");
    const actingSeat = getDataProperty(input, "actingSeat");
    if (typeof replicateIdentity !== "string" || replicateIdentity.length === 0 || !isNonNegativeSafeInteger(ply) || !isSeat(actingSeat)) return undefined;
    return Object.freeze({ replicateIdentity, ply, actingSeat });
  } catch {
    return undefined;
  }
}

function safeContextField(input: Record<string, unknown>): "ply" | "actingSeat" {
  try {
    const plyDescriptor = Object.getOwnPropertyDescriptor(input, "ply");
    if (plyDescriptor === undefined || !isDataDescriptor(plyDescriptor) || !isNonNegativeSafeInteger(plyDescriptor.value)) return "ply";
    return "actingSeat";
  } catch {
    return "ply";
  }
}

function freezeAction(action: RolloutAction): RolloutAction {
  return deepFreeze(structuredClone(action)) as RolloutAction;
}

function compareActions(left: RolloutAction, right: RolloutAction): number {
  return compareCodeUnits(canonicalActionIdentity(left), canonicalActionIdentity(right));
}

function policyFailure(failure: Extract<RolloutPolicyResult, { ok: false }>['failure']): RolloutPolicyResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze(failure) });
}

function isGameRank(value: unknown): value is GameRank {
  return value === "A" || value === "K" || value === "Q" || value === "J" || value === "10" || value === "9" || value === "8" || value === "7" || value === "6" || value === "5" || value === "4" || value === "3" || value === "2";
}

function isSeat(value: unknown): value is 0 | 1 | 2 | 3 {
  return isNonNegativeSafeInteger(value) && (value === 0 || value === 1 || value === 2 || value === 3);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0;
}

function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string" || (allowedKeys !== undefined && !allowedKeys.includes(key)))) return false;
    if (exact && allowedKeys !== undefined && (ownKeys.length !== allowedKeys.length || allowedKeys.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!isDataDescriptor(lengthDescriptor) || !isNonNegativeSafeInteger(lengthDescriptor.value)) return false;
    const length = lengthDescriptor.value;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) return false;
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      if (!ownKeys.includes(key) || !isDataDescriptor(Object.getOwnPropertyDescriptor(value, key))) return false;
    }
    return ownKeys.every((key) => key === "length" || (typeof key === "string" && /^0$|^[1-9]\d*$/.test(key) && Number(key) < length));
  } catch {
    return false;
  }
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function getDataProperty(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!isDataDescriptor(descriptor)) throw new TypeError("DATA_PROPERTY_INVALID");
  return descriptor.value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (isDataDescriptor(descriptor)) deepFreeze(descriptor.value, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return left.length - right.length;
}
