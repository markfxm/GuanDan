import { createDeck, RANKS, type Card, type GameRank } from "../../engine/cards";
import type { CardGroup, GroupPurpose, GroupType } from "../../engine/groups";
import type { ActionCandidate, AiAction } from "../contracts";
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

type UnknownRecord = Record<string, unknown>;

type ValidatedReducerInput = {
  actions: readonly ActionCandidate[];
  hand?: readonly Card[];
  gameRank: GameRank;
  lastPlay?: unknown;
  hardCap: number;
};

type CandidateValidation = {
  failureReason?: RepresentativeFailureReason;
  canonicalGroup?: CardGroup;
};

const VALID_GROUP_TYPES: readonly GroupType[] = [
  "single",
  "pair",
  "triple",
  "full-house",
  "straight",
  "consecutive-pairs",
  "plate",
  "bomb",
  "straight-flush",
  "joker-bomb",
];

const VALID_GROUP_PURPOSES: readonly GroupPurpose[] = [
  "attack",
  "engine",
  "recovery",
  "tail-control",
  "risk",
  "filler",
];

const VALID_CARDS_BY_ID = new Map(createDeck().map((card) => [card.id, card]));

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort(compareCodeUnits);
}

function isValidGameRank(value: unknown): value is GameRank {
  return typeof value === "string" && RANKS.includes(value as GameRank);
}

function isValidCard(value: unknown): value is Card {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) {
    return false;
  }

  const canonical = VALID_CARDS_BY_ID.get(value.id);
  if (canonical === undefined || value.kind !== canonical.kind || value.rank !== canonical.rank || value.copy !== canonical.copy) {
    return false;
  }

  if (value.kind === "suited") {
    return canonical.kind === "suited" && value.suit === canonical.suit;
  }

  return value.kind === "joker" && canonical.kind === "joker";
}

function validateCardArray(value: unknown): "invalid" | "duplicate" | "valid" {
  if (!Array.isArray(value)) {
    return "invalid";
  }

  const payloadById = new Map<string, string>();
  let duplicate = false;

  for (const card of value) {
    if (!isValidCard(card)) {
      return "invalid";
    }

    const payload = JSON.stringify([card.id, card.kind, card.rank, card.kind === "suited" ? card.suit : null, card.copy]);
    const previous = payloadById.get(card.id);
    if (previous !== undefined && previous !== payload) {
      return "invalid";
    }
    if (previous !== undefined) {
      duplicate = true;
    }
    payloadById.set(card.id, payload);
  }

  return duplicate ? "duplicate" : "valid";
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || typeof value[index] !== "string") {
      return false;
    }
  }

  return true;
}

function isValidGroupType(value: unknown): value is GroupType {
  return typeof value === "string" && VALID_GROUP_TYPES.includes(value as GroupType);
}

function isValidGroupPurpose(value: unknown): value is GroupPurpose {
  return typeof value === "string" && VALID_GROUP_PURPOSES.includes(value as GroupPurpose);
}

function hasGroupMetadataShape(value: unknown): value is CardGroup {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || value.id.length === 0
    || !isValidGroupType(value.type)
    || typeof value.label !== "string"
    || !isValidGroupPurpose(value.purpose)
    || !Number.isFinite(value.strength)) {
    return false;
  }

  return true;
}

function isGroupShape(value: unknown): value is CardGroup {
  return hasGroupMetadataShape(value)
    && validateCardArray(value.cards) === "valid"
    && validateCardArray(value.wildcards) === "valid";
}

function isCandidateGroupShape(value: unknown): value is CardGroup {
  return hasGroupMetadataShape(value)
    && validateCardArray(value.cards) !== "invalid"
    && validateCardArray(value.wildcards) !== "invalid";
}

function isValidPolicyVerdict(value: unknown): boolean {
  return isRecord(value)
    && typeof value.allowed === "boolean"
    && typeof value.hardViolation === "boolean"
    && isStringArray(value.reasonCodes);
}

function isValidAction(value: unknown): value is AiAction {
  if (!isRecord(value) || (value.type !== "pass" && value.type !== "play")) {
    return false;
  }

  return value.type === "pass" || isCandidateGroupShape(value.group);
}

function isValidCandidateShape(value: unknown): value is ActionCandidate {
  return isRecord(value)
    && isValidAction(value.action)
    && (value.source === "PLAN" || value.source === "HAND_ANALYSIS" || value.source === "FALLBACK")
    && typeof value.stableKey === "string"
    && isValidPolicyVerdict(value.policyVerdict)
    && isStringArray(value.alignedPlanIds)
    && isStringArray(value.reasonCodes);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  const leftIds = sortedIds(left);
  const rightIds = sortedIds(right);
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

function canonicalGroup(group: unknown, gameRank: GameRank): CardGroup | undefined {
  if (!isGroupShape(group)) {
    return undefined;
  }

  const classified = classifyPlay(group.cards, gameRank);
  if (classified === undefined
    || group.id !== classified.id
    || group.type !== classified.type
    || group.label !== classified.label
    || group.purpose !== classified.purpose
    || group.strength !== classified.strength
    || !sameIds(group.cards.map((card) => card.id), classified.cards.map((card) => card.id))
    || !sameIds(group.wildcards.map((card) => card.id), classified.wildcards.map((card) => card.id))) {
    return undefined;
  }

  return classified;
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

function exactPayloadKey(candidate: ActionCandidate, canonicalCandidateGroup?: CardGroup): string {
  const group = candidate.action.type === "play" ? canonicalCandidateGroup ?? candidate.action.group : undefined;
  return JSON.stringify([
    candidate.action.type,
    group?.type ?? null,
    group?.id ?? null,
    group === undefined ? [] : sortedIds(group.cards.map((card) => card.id)),
    group === undefined ? [] : sortedIds(group.wildcards.map((card) => card.id)),
    candidate.source,
    [candidate.policyVerdict.allowed, candidate.policyVerdict.hardViolation, [...candidate.policyVerdict.reasonCodes]],
    [...candidate.alignedPlanIds],
    candidate.stableKey,
    [...candidate.reasonCodes],
  ]);
}

function validateCandidate(candidate: ActionCandidate, input: ValidatedReducerInput): CandidateValidation {
  if (candidate.action.type === "pass") {
    if (candidate.stableKey !== "pass") {
      return { failureReason: "stable-key-mismatch" };
    }
  } else if (candidate.stableKey !== candidate.action.group.id) {
    return { failureReason: "stable-key-mismatch" };
  }

  if (candidate.policyVerdict.allowed !== true || candidate.policyVerdict.hardViolation !== false) {
    return { failureReason: "policy-inconsistency" };
  }

  const canonicalLastPlay = input.lastPlay === undefined ? undefined : canonicalGroup(input.lastPlay, input.gameRank);
  if (input.lastPlay !== undefined && canonicalLastPlay === undefined) {
    return { failureReason: "legality-inconsistency" };
  }

  if (candidate.action.type === "pass") {
    if (canonicalLastPlay === undefined) {
      return { failureReason: "legality-inconsistency" };
    }
    return {};
  }

  const canonicalCandidate = canonicalGroup(candidate.action.group, input.gameRank);
  if (canonicalCandidate === undefined || !canBeatPlay(canonicalCandidate, canonicalLastPlay, input.gameRank)) {
    return { failureReason: "legality-inconsistency" };
  }

  if (input.hand !== undefined) {
    const handIds = new Set(input.hand.map((card) => card.id));
    if (!canonicalCandidate.cards.every((card) => handIds.has(card.id))) {
      return { failureReason: "hand-ownership-mismatch" };
    }
  }

  return { canonicalGroup: canonicalCandidate };
}

function validHand(hand: unknown): hand is readonly Card[] {
  if (!Array.isArray(hand)) {
    return false;
  }

  const validation = validateCardArray(hand);
  return validation === "valid";
}

export function reduceRepresentativeActions(
  input: RepresentativeActionReducerInput,
): RepresentativeActionReducerResult {
  const rawInput: unknown = input;
  if (!isRecord(rawInput) || !Array.isArray(rawInput.actions) || !isValidGameRank(rawInput.gameRank)) {
    return failedResult("invalid-input", isRecord(rawInput) && Array.isArray(rawInput.actions) ? rawInput.actions.length : 0);
  }

  const actions = rawInput.actions;
  const inputCount = actions.length;
  if (typeof rawInput.hardCap !== "number"
    || !Number.isFinite(rawInput.hardCap)
    || !Number.isInteger(rawInput.hardCap)
    || rawInput.hardCap < 1) {
    return failedResult("invalid-hard-cap", inputCount);
  }

  if (rawInput.hand !== undefined && !validHand(rawInput.hand)) {
    return failedResult("invalid-hand", inputCount);
  }

  const validatedInput: ValidatedReducerInput = {
    actions: actions as ActionCandidate[],
    hand: rawInput.hand as readonly Card[] | undefined,
    gameRank: rawInput.gameRank,
    lastPlay: rawInput.lastPlay,
    hardCap: rawInput.hardCap,
  };
  const stableKeys = new Map<string, string>();
  const representativesByPayload = new Map<string, number>();
  const representativeInputIndices: number[] = [];
  const representativeByInputIndex: Record<number, number> = {};

  for (let index = 0; index < actions.length; index += 1) {
    const rawCandidate = actions[index];
    if (!isValidCandidateShape(rawCandidate)) {
      return failedResult("invalid-candidate", inputCount, index);
    }

    const candidate = rawCandidate;
    const validation = validateCandidate(candidate, validatedInput);
    if (validation.failureReason !== undefined) {
      return failedResult(validation.failureReason, inputCount, index);
    }

    const payloadKey = exactPayloadKey(candidate, validation.canonicalGroup);
    const previousPayloadKey = stableKeys.get(candidate.stableKey);
    if (previousPayloadKey !== undefined && previousPayloadKey !== payloadKey) {
      return failedResult("stable-key-collision", inputCount, index);
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

  const equivalenceClassCount = representativeInputIndices.length;
  const duplicateCount = inputCount - equivalenceClassCount;

  if (equivalenceClassCount > validatedInput.hardCap) {
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
    inputCount > validatedInput.hardCap ? "reduced" : "unchanged",
    representativeInputIndices,
    representativeByInputIndex,
    diagnostics,
  );
}
