import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import type {
  ActionCandidate,
  AiAction,
  PolicyVerdict,
  RepresentativeActionShadowMode,
} from "../contracts";
import type {
  AiPlanningDiagnostics,
  RepresentativeActionShadowDiagnostic,
} from "../diagnostics/aiPlanningDiagnostics";
import {
  recordRepresentativeActionShadowInvocation,
  recordRepresentativeActionShadowRecord,
  recordRepresentativeActionShadowReducerAttempt,
  recordRepresentativeActionShadowReducerResult,
} from "../diagnostics/aiPlanningDiagnostics";
import {
  reduceRepresentativeActions,
  type RepresentativeActionReducerInput,
  type RepresentativeActionReducerResult,
} from "./representativeActionReducer";

type RepresentativeActionShadowObserverInput = Readonly<{
  mode: RepresentativeActionShadowMode;
  candidates: readonly ActionCandidate[];
  ownHand?: readonly Card[];
  gameRank: GameRank;
  lastPlay?: CardGroup;
  hardCap: number;
  diagnostics?: AiPlanningDiagnostics;
}>;

export function observeRepresentativeActions(
  input: RepresentativeActionShadowObserverInput,
): void {
  if (input.mode === "disabled") {
    return;
  }

  try {
    if (input.mode !== "shadow") {
      recordAdapterError(input.diagnostics, input.candidates.length, input.hardCap);
      return;
    }

    recordRepresentativeActionShadowInvocation(input.diagnostics);
    const detachedInput = buildDetachedReducerInput(input);
    recordRepresentativeActionShadowReducerAttempt(input.diagnostics);
    const result = reduceRepresentativeActions(detachedInput);
    recordRepresentativeActionShadowReducerResult(input.diagnostics);
    recordRepresentativeActionShadowRecord(
      input.diagnostics,
      summarizeRepresentativeActionResult(result, input.hardCap),
    );
  } catch {
    recordAdapterError(input.diagnostics, input.candidates.length, input.hardCap);
  }
}

function buildDetachedReducerInput(
  input: RepresentativeActionShadowObserverInput,
): RepresentativeActionReducerInput {
  const detached: RepresentativeActionReducerInput = {
    actions: input.candidates.map(cloneCandidate),
    gameRank: input.gameRank,
    hardCap: input.hardCap,
    ...(input.ownHand === undefined ? {} : { hand: input.ownHand.map(cloneCard) }),
    ...(input.lastPlay === undefined ? {} : { lastPlay: cloneGroup(input.lastPlay) }),
  };

  return deepFreeze(detached);
}

function cloneCandidate(candidate: ActionCandidate): ActionCandidate {
  return {
    action: cloneAction(candidate.action),
    source: candidate.source,
    policyVerdict: clonePolicyVerdict(candidate.policyVerdict),
    alignedPlanIds: [...candidate.alignedPlanIds],
    stableKey: candidate.stableKey,
    reasonCodes: [...candidate.reasonCodes],
  };
}

function cloneAction(action: AiAction): AiAction {
  return action.type === "pass"
    ? { type: "pass" }
    : { type: "play", group: cloneGroup(action.group) };
}

function clonePolicyVerdict(policyVerdict: PolicyVerdict): PolicyVerdict {
  return {
    allowed: policyVerdict.allowed,
    hardViolation: policyVerdict.hardViolation,
    reasonCodes: [...policyVerdict.reasonCodes],
  };
}

function cloneGroup(group: CardGroup): CardGroup {
  return {
    id: group.id,
    type: group.type,
    label: group.label,
    purpose: group.purpose,
    cards: group.cards.map(cloneCard),
    wildcards: group.wildcards.map(cloneCard),
    strength: group.strength,
  };
}

function cloneCard(card: Card): Card {
  return card.kind === "suited"
    ? { id: card.id, kind: card.kind, rank: card.rank, suit: card.suit, copy: card.copy }
    : { id: card.id, kind: card.kind, rank: card.rank, copy: card.copy };
}

function deepFreeze<T>(value: T, visited = new Set<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (visited.has(value)) {
    return value;
  }

  visited.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested, visited);
  }
  return Object.freeze(value);
}

function summarizeRepresentativeActionResult(
  result: RepresentativeActionReducerResult,
  hardCap: number,
): RepresentativeActionShadowDiagnostic {
  return {
    schemaVersion: "d2e-shadow-v1",
    status: result.status === "failed" ? "failed" : "observed",
    reducerStatus: result.status,
    ...(result.failureReason === undefined ? {} : { failureReason: result.failureReason }),
    ...(result.fallback === undefined ? {} : { fallback: result.fallback }),
    inputCandidateCount: result.diagnostics.inputCount,
    validatedCount: result.diagnostics.validatedCount,
    equivalenceClassCount: result.diagnostics.equivalenceClassCount,
    duplicateCount: result.diagnostics.duplicateCount,
    capSatisfied: result.diagnostics.capSatisfied,
    hardCap,
  };
}

function recordAdapterError(
  diagnostics: AiPlanningDiagnostics | undefined,
  inputCandidateCount: number,
  hardCap: number,
): void {
  try {
    recordRepresentativeActionShadowRecord(diagnostics, {
      schemaVersion: "d2e-shadow-v1",
      status: "failed",
      failureReason: "adapter-error",
      fallback: "use-original-candidates",
      inputCandidateCount,
      hardCap,
    });
  } catch {
    // The fallback diagnostics sink cannot interrupt formal decision flow.
  }
}
