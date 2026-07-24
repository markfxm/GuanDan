import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import type { ActionCandidate } from "../contracts";

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

const SKELETON_RESULT: RepresentativeActionReducerResult = Object.freeze({
  status: "failed",
  representativeInputIndices: Object.freeze([]),
  representativeByInputIndex: Object.freeze({}),
  diagnostics: Object.freeze({
    inputCount: 0,
    validatedCount: 0,
    equivalenceClassCount: 0,
    duplicateCount: 0,
    capSatisfied: false,
  }),
  failureReason: "cap-unsatisfied",
  fallback: "use-original-candidates",
});

export function reduceRepresentativeActions(
  _input: RepresentativeActionReducerInput,
): RepresentativeActionReducerResult {
  return SKELETON_RESULT;
}
