import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import type { ActionCandidate } from "../contracts";
import { canBeatPlay, classifyPlay } from "../../game/playRules";

export type RepresentativeActionReducerInput = Readonly<{
  actions: readonly ActionCandidate[];
  hand?: readonly Card[];
  gameRank: GameRank;
  lastPlay?: CardGroup;
  hardCap: number;
}>;

export type RepresentativeDiagnostics = Readonly<{
  inputCount: number;
  validatedCount: number;
  equivalenceClassCount: number;
  duplicateCount: number;
  capSatisfied: boolean;
}>;

export type RepresentativeFailureReason =
  | "invalid-input"
  | "invalid-hard-cap"
  | "invalid-candidate"
  | "invalid-hand"
  | "hand-ownership-mismatch"
  | "stable-key-mismatch"
  | "stable-key-collision"
  | "class-key-collision"
  | "legality-inconsistency"
  | "policy-inconsistency"
  | "cap-unsatisfied";

export type RepresentativeActionReducerResult = Readonly<{
  status: "unchanged" | "reduced" | "failed";
  representativeInputIndices: readonly number[];
  representativeByInputIndex: Readonly<Record<number, number>>;
  diagnostics: Readonly<RepresentativeDiagnostics>;
  failureReason?: RepresentativeFailureReason;
  fallback: "use-original-candidates";
}>;

function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort(compareCodeUnits);
}

function freezeResult(
  status: RepresentativeActionReducerResult["status"],
  representativeInputIndices: readonly number[],
  representativeByInputIndex: Readonly<Record<number, number>>,
  diagnostics: RepresentativeDiagnostics,
  failureReason?: RepresentativeFailureReason,
): RepresentativeActionReducerResult {
  const result: RepresentativeActionReducerResult = {
    status,
    representativeInputIndices: Object.freeze([...representativeInputIndices]),
    representativeByInputIndex: Object.freeze({ ...representativeByInputIndex }),
    diagnostics: Object.freeze({ ...diagnostics }),
    ...(failureReason === undefined ? {} : { failureReason }),
    fallback: "use-original-candidates",
  };

  return Object.freeze(result);
}

function failedResult(
  failureReason: RepresentativeFailureReason,
  inputCount: number,
  validatedCount = 0,
  equivalenceClassCount = 0,
  duplicateCount = 0,
): RepresentativeActionReducerResult {
  return freezeResult(
    "failed",
    [],
    {},
    {
      inputCount,
      validatedCount,
      equivalenceClassCount,
      duplicateCount,
      capSatisfied: false,
    },
    failureReason,
  );
}

function exactPayloadKey(candidate: ActionCandidate): string {
  if (candidate.action.type === "pass") {
    return JSON.stringify([
      "pass",
      null,
      null,
      [],
      [],
      candidate.source,
      [candidate.policyVerdict.allowed, candidate.policyVerdict.hardViolation, [...candidate.policyVerdict.reasonCodes]],
      [...candidate.alignedPlanIds],
      candidate.stableKey,
      [...candidate.reasonCodes],
    ]);
  }

  return JSON.stringify([
    "play",
    candidate.action.group.type,
    candidate.action.group.id,
    sortedIds(candidate.action.group.cards.map((card) => card.id)),
    sortedIds(candidate.action.group.wildcards.map((card) => card.id)),
    candidate.source,
    [candidate.policyVerdict.allowed, candidate.policyVerdict.hardViolation, [...candidate.policyVerdict.reasonCodes]],
    [...candidate.alignedPlanIds],
    candidate.stableKey,
    [...candidate.reasonCodes],
  ]);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const leftIds = sortedIds(left);
  const rightIds = sortedIds(right);
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function validateCandidate(
  candidate: ActionCandidate,
  input: RepresentativeActionReducerInput,
): RepresentativeFailureReason | undefined {
  if (candidate.policyVerdict.allowed !== true || candidate.policyVerdict.hardViolation !== false) {
    return "policy-inconsistency";
  }

  if (candidate.action.type === "pass") {
    if (candidate.stableKey !== "pass") {
      return "stable-key-mismatch";
    }

    if (input.lastPlay === undefined) {
      return "legality-inconsistency";
    }

    return undefined;
  }

  if (candidate.stableKey !== candidate.action.group.id) {
    return "stable-key-mismatch";
  }

  const classified = classifyPlay(candidate.action.group.cards, input.gameRank);
  if (classified === undefined
    || classified.type !== candidate.action.group.type
    || classified.id !== candidate.action.group.id
    || !sameIds(classified.cards.map((card) => card.id), candidate.action.group.cards.map((card) => card.id))
    || !sameIds(classified.wildcards.map((card) => card.id), candidate.action.group.wildcards.map((card) => card.id))) {
    return "legality-inconsistency";
  }

  if (!canBeatPlay(candidate.action.group, input.lastPlay, input.gameRank)) {
    return "legality-inconsistency";
  }

  if (input.hand !== undefined) {
    const handIds = new Set(input.hand.map((card) => card.id));
    if (!candidate.action.group.cards.every((card) => handIds.has(card.id))) {
      return "hand-ownership-mismatch";
    }
  }

  return undefined;
}

export function reduceRepresentativeActions(
  input: RepresentativeActionReducerInput,
): RepresentativeActionReducerResult {
  if (!Array.isArray(input.actions)) {
    return failedResult("invalid-input", 0);
  }

  if (!Number.isFinite(input.hardCap) || !Number.isInteger(input.hardCap) || input.hardCap < 1) {
    return failedResult("invalid-hard-cap", input.actions.length);
  }

  if (input.hand !== undefined && !Array.isArray(input.hand)) {
    return failedResult("invalid-hand", input.actions.length);
  }

  const stableKeys = new Map<string, string>();
  const representativesByPayload = new Map<string, number>();
  const representativeInputIndices: number[] = [];
  const representativeByInputIndex: Record<number, number> = {};

  for (let index = 0; index < input.actions.length; index += 1) {
    const candidate = input.actions[index];
    if (candidate === undefined) {
      return failedResult("invalid-candidate", input.actions.length, index);
    }

    const validationFailure = validateCandidate(candidate, input);
    if (validationFailure !== undefined) {
      return failedResult(validationFailure, input.actions.length, index);
    }

    const payloadKey = exactPayloadKey(candidate);
    const previousPayloadKey = stableKeys.get(candidate.stableKey);
    if (previousPayloadKey !== undefined && previousPayloadKey !== payloadKey) {
      return failedResult("stable-key-collision", input.actions.length, index);
    }
    stableKeys.set(candidate.stableKey, payloadKey);

    const representativeIndex = representativesByPayload.get(payloadKey);
    if (representativeIndex === undefined) {
      representativesByPayload.set(payloadKey, index);
      representativeInputIndices.push(index);
      representativeByInputIndex[index] = index;
    } else {
      representativeByInputIndex[index] = representativeIndex;
    }
  }

  const inputCount = input.actions.length;
  const equivalenceClassCount = representativeInputIndices.length;
  const duplicateCount = inputCount - equivalenceClassCount;

  if (equivalenceClassCount > input.hardCap) {
    return failedResult("cap-unsatisfied", inputCount, inputCount, equivalenceClassCount, duplicateCount);
  }

  const diagnostics: RepresentativeDiagnostics = {
    inputCount,
    validatedCount: inputCount,
    equivalenceClassCount,
    duplicateCount,
    capSatisfied: true,
  };

  return freezeResult(
    inputCount > input.hardCap ? "reduced" : "unchanged",
    representativeInputIndices,
    representativeByInputIndex,
    diagnostics,
  );
}
