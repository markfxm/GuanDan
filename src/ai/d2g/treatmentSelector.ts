import type { AiAction, AiDecision, ActionCandidate } from "../contracts";
import {
  canonicalActionIdentity,
  createRolloutRequest,
  type RolloutBudget,
  type RolloutExecutionResult,
  type RolloutFailure,
} from "../rollout/contracts";
import type { D2FShadowPreActionSnapshot, RolloutCandidate } from "../rollout/contracts";
import { buildParticleBank } from "../particles/particleBankBuilder";
import { reduceRepresentativeActions } from "../tactics/representativeActionReducer";
import { canonicalPublicLedgerHash } from "../../game/publicLedger";
import {
  computeD2GCandidateUniverseHash,
  computeD2GDecisionIdentity,
  type D2GDecisionContext,
  type D2GFallbackReason,
  type D2GTreatmentProfile,
} from "./treatmentContracts";
import { sha256Bytes } from "../../game/publicEventHash";
import * as rolloutOrchestrator from "../rollout/rolloutOrchestrator";

export type D2GPreActionState = D2FShadowPreActionSnapshot;
export type D2GEvaluatedCandidate = AiDecision["evaluatedCandidates"][number];

export type D2GTreatmentTelemetry = Readonly<{
  gameId: string;
  actingSeat: D2GDecisionContext["actingSeat"];
  actingStrategy: D2GDecisionContext["actingStrategy"];
  decisionIdentity: string;
  candidateUniverseHash: string;
  preActionGameplayStateHash: string;
  stateValidation: "current" | "stale";
  baselineCandidateId: string;
  treatmentCandidateId: string;
  selectedCandidateId: string;
  selection: "baseline" | "treatment";
  fallbackReason: D2GFallbackReason | "none";
  disagreement: boolean;
  rankingHash: string;
  rolloutWorkUnits: number;
}>;

export type D2GTreatmentSelection = Readonly<{
  baselineCandidateId: string;
  treatmentCandidateId: string;
  selectedCandidateId: string;
  baselineCandidate?: D2GEvaluatedCandidate;
  treatmentCandidate?: D2GEvaluatedCandidate;
  selectedCandidate?: D2GEvaluatedCandidate;
  selectedAction: AiAction;
  selection: "baseline" | "treatment";
  disagreement: boolean;
  fallbackReason: D2GFallbackReason | "none";
  ranking: readonly string[];
  rankingHash: string;
  rolloutWorkUnits: number;
  profileConfigurationHash: string;
  telemetry: D2GTreatmentTelemetry;
  elapsedMs: number;
  rolloutEvaluationCostMs: number;
}>;

export type D2GTreatmentSelectorInput = Readonly<{
  decision: AiDecision;
  preActionState: D2GPreActionState;
  decisionContext: D2GDecisionContext;
  profile: D2GTreatmentProfile;
}>;

type CandidateEntry = Readonly<{
  id: string;
  evaluated: D2GEvaluatedCandidate;
}>;

type RolloutAttempt =
  | Readonly<{ ok: true; result: Extract<RolloutExecutionResult, { ok: true }>["result"]; elapsedMs: number }>
  | Readonly<{ ok: false; reason: D2GFallbackReason; elapsedMs: number }>;

export function computeD2GPreActionGameplayStateHash(state: D2GPreActionState): string {
  return hashCanonical({
    schemaVersion: "d2g-pre-action-gameplay-state-v1",
    publicIdentity: state.publicIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(state.initialLedger),
    finalLedgerHash: canonicalPublicLedgerHash(state.finalLedger),
    publicHistoryEvents: state.publicHistoryEvents,
    gameRank: state.gameRank,
    actingSeat: state.actingSeat,
    publicState: state.publicState,
    currentTrick: state.currentTrick,
  });
}

export function computeD2GPrivateOwnHandFingerprint(state: D2GPreActionState): string {
  return hashCanonical({
    schemaVersion: "d2g-private-own-hand-fingerprint-v1",
    cards: [...state.ownCurrentHand].sort((left, right) => compareCodeUnits(left.id, right.id)),
  });
}

export function selectD2GTreatment(input: D2GTreatmentSelectorInput): D2GTreatmentSelection {
  const baselineCandidateId = canonicalActionIdentity(input.decision.action);
  const baselineMatches = input.decision.evaluatedCandidates.filter(
    ({ candidate }) => canonicalActionIdentity(candidate.action) === baselineCandidateId,
  );
  const baselineCandidate = baselineMatches[0];
  const baseline = {
    baselineCandidateId,
    baselineCandidate,
    selectedAction: input.decision.action,
  };

  let candidates: readonly CandidateEntry[];
  try {
    candidates = createCandidateEntries(input.decision);
  } catch {
    return makeSelection(input, baseline, {
      fallbackReason: "candidate-mapping-failed",
      stateValidation: "stale",
      ranking: [],
      rankingHash: hashRanking([]),
      rolloutWorkUnits: 0,
      elapsedMs: 0,
    });
  }

  if (baselineCandidate === undefined) {
    return makeSelection(input, baseline, {
      fallbackReason: "candidate-mapping-failed",
      stateValidation: "stale",
      ranking: [],
      rankingHash: hashRanking([]),
      rolloutWorkUnits: 0,
      elapsedMs: 0,
    });
  }

  const stale = validateDecisionContext(input, candidates);
  if (stale) {
    return makeSelection(input, baseline, {
      fallbackReason: "stale-decision",
      stateValidation: "stale",
      ranking: [],
      rankingHash: hashRanking([]),
      rolloutWorkUnits: 0,
      elapsedMs: 0,
    });
  }

  if (!snapshotCandidateUniverseMatches(input.preActionState, candidates, baselineCandidateId)) {
    return makeSelection(input, baseline, {
      fallbackReason: "stale-decision",
      stateValidation: "stale",
      ranking: [],
      rankingHash: hashRanking([]),
      rolloutWorkUnits: 0,
      elapsedMs: 0,
    });
  }

  const attempt = runTreatmentRollout(input, candidates);
  if (!attempt.ok) {
    return makeSelection(input, baseline, {
      fallbackReason: attempt.reason,
      stateValidation: "current",
      ranking: [],
      rankingHash: hashRanking([]),
      rolloutWorkUnits: 0,
      elapsedMs: attempt.elapsedMs,
    });
  }

  const ranking = attempt.result.ranking;
  const rankingHash = hashRanking(ranking);
  const topCandidateId = ranking[0];
  if (typeof topCandidateId !== "string" || topCandidateId.length === 0) {
    return makeSelection(input, baseline, {
      fallbackReason: "rollout-unusable",
      stateValidation: "current",
      ranking,
      rankingHash,
      rolloutWorkUnits: attempt.result.aggregateDiagnostics.workUnitCount,
      elapsedMs: attempt.elapsedMs,
    });
  }

  const mapped = candidates.filter(({ id }) => id === topCandidateId);
  if (mapped.length !== 1) {
    return makeSelection(input, baseline, {
      fallbackReason: "candidate-mapping-failed",
      stateValidation: "current",
      ranking,
      rankingHash,
      rolloutWorkUnits: attempt.result.aggregateDiagnostics.workUnitCount,
      elapsedMs: attempt.elapsedMs,
    });
  }

  const treatmentCandidate = mapped[0]!.evaluated;
  if (!isCurrentlyLegal(treatmentCandidate.candidate, input.preActionState)) {
    return makeSelection(input, baseline, {
      fallbackReason: "candidate-no-longer-legal",
      stateValidation: "current",
      ranking,
      rankingHash,
      rolloutWorkUnits: attempt.result.aggregateDiagnostics.workUnitCount,
      elapsedMs: attempt.elapsedMs,
    });
  }

  return makeSelection(input, baseline, {
    fallbackReason: "none",
    stateValidation: "current",
    ranking,
    rankingHash,
    rolloutWorkUnits: attempt.result.aggregateDiagnostics.workUnitCount,
    elapsedMs: attempt.elapsedMs,
    treatmentCandidate,
  });
}

function createCandidateEntries(decision: AiDecision): readonly CandidateEntry[] {
  const entries = decision.evaluatedCandidates.map((evaluated) => ({
    id: canonicalActionIdentity(evaluated.candidate.action),
    evaluated,
  }));
  if (entries.length === 0 || new Set(entries.map(({ id }) => id)).size !== entries.length) {
    throw new Error("D2G_CANDIDATE_UNIVERSE_INVALID");
  }
  return entries;
}

function validateDecisionContext(input: D2GTreatmentSelectorInput, candidates: readonly CandidateEntry[]): boolean {
  const { preActionState: state, decisionContext: context } = input;
  if (state.publicIdentity.gameId !== context.gameId
    || state.actingSeat !== context.actingSeat
    || state.publicState.actingSeat !== context.actingSeat) return true;

  let candidateUniverseHash: string;
  let preActionGameplayStateHash: string;
  let privateOwnHandFingerprint: string;
  let decisionIdentity: string;
  try {
    candidateUniverseHash = computeD2GCandidateUniverseHash(input.decision);
    preActionGameplayStateHash = computeD2GPreActionGameplayStateHash(state);
    privateOwnHandFingerprint = computeD2GPrivateOwnHandFingerprint(state);
    decisionIdentity = computeD2GDecisionIdentity({
      gameId: context.gameId,
      decisionIndex: context.decisionIndex,
      actingSeat: context.actingSeat,
      actingStrategy: context.actingStrategy,
      preActionGameplayStateHash: context.preActionGameplayStateHash,
      privateOwnHandFingerprint: context.privateOwnHandFingerprint,
      candidateUniverseHash: context.candidateUniverseHash,
    });
  } catch {
    return true;
  }
  if (candidateUniverseHash !== context.candidateUniverseHash
    || preActionGameplayStateHash !== context.preActionGameplayStateHash
    || privateOwnHandFingerprint !== context.privateOwnHandFingerprint
    || decisionIdentity !== context.decisionIdentity) return true;

  if (candidates.length !== input.decision.evaluatedCandidates.length) return true;
  return false;
}

function snapshotCandidateUniverseMatches(
  state: D2GPreActionState,
  candidates: readonly CandidateEntry[],
  baselineCandidateId: string,
): boolean {
  const snapshotIds = state.candidates.map(({ candidateId }) => candidateId);
  const currentIds = candidates.map(({ id }) => id);
  return snapshotIds.length === currentIds.length
    && new Set(snapshotIds).size === snapshotIds.length
    && snapshotIds.every((candidateId) => currentIds.includes(candidateId))
    && state.selectedCandidateId === baselineCandidateId;
}

function isCurrentlyLegal(candidate: ActionCandidate, state: D2GPreActionState): boolean {
  const result = reduceRepresentativeActions({
    actions: [candidate],
    hand: state.ownCurrentHand,
    gameRank: state.gameRank,
    lastPlay: state.currentTrick.lastPlay ?? undefined,
    hardCap: 1,
  });
  return result.status !== "failed";
}

function runTreatmentRollout(input: D2GTreatmentSelectorInput, candidates: readonly CandidateEntry[]): RolloutAttempt {
  const startedAt = performance.now();
  try {
    const snapshot = input.preActionState;
    const particleCount = input.profile.budget.particleCount;
    const particleConfig = snapshot.particleBankConfig;
    const bankResult = buildParticleBank({
      schemaVersion: particleConfig.schemaVersion,
      publicIdentity: snapshot.publicIdentity,
      initialLedger: snapshot.initialLedger,
      baseLedger: snapshot.particleBankBaseLedger,
      publicHistoryEvents: snapshot.publicHistoryEvents,
      pendingPublicEvents: snapshot.particleBankPendingPublicEvents,
      expectedFinalEventIndex: snapshot.expectedFinalEventIndex,
      expectedFinalPublicLedgerHash: snapshot.expectedFinalPublicLedgerHash,
      gameRank: snapshot.gameRank,
      actingSeat: snapshot.actingSeat,
      ownCurrentHand: snapshot.ownCurrentHand,
      particleSeed: deriveParticleSeed(snapshot),
      particleCount,
      maxSamplingAttempts: Math.max(particleConfig.maxSamplingAttempts, particleCount),
      maxIndexDraws: Math.max(particleConfig.maxIndexDraws, particleCount),
      samplerConfigVersion: particleConfig.samplerConfigVersion,
      likelihoodConfig: particleConfig.likelihoodConfig,
    });
    if (!bankResult.ok) return { ok: false, reason: "rollout-unusable", elapsedMs: performance.now() - startedAt };

    const budget: RolloutBudget = {
      replicateCountPerScenario: input.profile.budget.replicateCountPerScenario,
      maxPliesPerReplicate: input.profile.budget.maxPliesPerReplicate,
      maxPolicyActionEvaluationsPerPly: input.profile.budget.maxPolicyActionEvaluationsPerPly,
      maxWorkUnits: input.profile.budget.maxWorkUnits,
    };
    const rolloutCandidates: readonly RolloutCandidate[] = candidates.map(({ id, evaluated }) => ({
      candidateId: id,
      action: evaluated.candidate.action,
      baselineEvaluatorScore: evaluated.score.total,
    }));
    const requestInput = {
      schemaVersion: "d2f-rollout-request-v2" as const,
      mode: "shadow" as const,
      formalExecutionAllowed: false as const,
      rootIdentity: snapshot.rootIdentity,
      scenarioSourceInput: {
        bank: bankResult.bank,
        publicHistoryEvents: structuredClone(snapshot.publicHistoryEvents),
        initialLedger: structuredClone(snapshot.initialLedger),
        finalLedger: structuredClone(snapshot.finalLedger),
        gameRank: snapshot.gameRank,
        perspectiveSeat: snapshot.perspectiveSeat,
        ownCurrentHand: structuredClone(snapshot.ownCurrentHand),
        publicState: structuredClone(snapshot.publicState),
      },
      candidates: rolloutCandidates,
      budget,
      limits: {
        maxReplicateCountPerScenario: budget.replicateCountPerScenario,
        maxPliesPerReplicate: budget.maxPliesPerReplicate,
        maxPolicyActionEvaluationsPerPly: budget.maxPolicyActionEvaluationsPerPly,
        maxWorkUnits: budget.maxWorkUnits,
      },
      evidenceRequirements: input.profile.evidenceRequirements,
      riskPolicy: input.profile.riskPolicy,
      policyId: input.profile.rolloutPolicyId,
    };
    const request = createRolloutRequest(requestInput);
    if (!request.ok) return { ok: false, reason: mapRolloutFailure(request.failure), elapsedMs: performance.now() - startedAt };
    const rollout = rolloutOrchestrator.runDetachedRollout(request.value);
    if (!rollout.ok) return { ok: false, reason: mapRolloutFailure(rollout.failure), elapsedMs: performance.now() - startedAt };
    if (rollout.result.formalExecutionAllowed !== false) return { ok: false, reason: "rollout-failed", elapsedMs: performance.now() - startedAt };
    return { ok: true, result: rollout.result, elapsedMs: performance.now() - startedAt };
  } catch {
    return { ok: false, reason: "unexpected-failure", elapsedMs: performance.now() - startedAt };
  }
}

function mapRolloutFailure(failure: RolloutFailure): D2GFallbackReason {
  switch (failure.kind) {
    case "fake-or-unknown-particle-bank":
    case "scenario-source-failed":
    case "effective-sample-size-too-low":
    case "insufficient-scenarios":
    case "insufficient-replicates":
    case "coverage-mismatch":
      return "rollout-unusable";
    default:
      return "rollout-failed";
  }
}

function makeSelection(
  input: D2GTreatmentSelectorInput,
  baseline: Readonly<{
    baselineCandidateId: string;
    baselineCandidate?: D2GEvaluatedCandidate;
    selectedAction: AiAction;
  }>,
  outcome: Readonly<{
    fallbackReason: D2GFallbackReason | "none";
    stateValidation: "current" | "stale";
    ranking: readonly string[];
    rankingHash: string;
    rolloutWorkUnits: number;
    elapsedMs: number;
    treatmentCandidate?: D2GEvaluatedCandidate;
  }>,
): D2GTreatmentSelection {
  const treatmentCandidateId = outcome.treatmentCandidate === undefined
    ? baseline.baselineCandidateId
    : canonicalActionIdentity(outcome.treatmentCandidate.candidate.action);
  const selectedCandidate = outcome.treatmentCandidate ?? baseline.baselineCandidate;
  const selectedCandidateId = treatmentCandidateId;
  const selection = outcome.treatmentCandidate === undefined ? "baseline" : "treatment";
  const disagreement = selection === "treatment" && treatmentCandidateId !== baseline.baselineCandidateId;
  const telemetry: D2GTreatmentTelemetry = Object.freeze({
    gameId: input.decisionContext.gameId,
    actingSeat: input.decisionContext.actingSeat,
    actingStrategy: input.decisionContext.actingStrategy,
    decisionIdentity: input.decisionContext.decisionIdentity,
    candidateUniverseHash: input.decisionContext.candidateUniverseHash,
    preActionGameplayStateHash: input.decisionContext.preActionGameplayStateHash,
    stateValidation: outcome.stateValidation,
    baselineCandidateId: baseline.baselineCandidateId,
    treatmentCandidateId,
    selectedCandidateId,
    selection,
    fallbackReason: outcome.fallbackReason,
    disagreement,
    rankingHash: outcome.rankingHash,
    rolloutWorkUnits: outcome.rolloutWorkUnits,
  });
  return Object.freeze({
    baselineCandidateId: baseline.baselineCandidateId,
    treatmentCandidateId,
    selectedCandidateId,
    baselineCandidate: baseline.baselineCandidate,
    treatmentCandidate: outcome.treatmentCandidate,
    selectedCandidate,
    selectedAction: selectedCandidate?.candidate.action ?? baseline.selectedAction,
    selection,
    disagreement,
    fallbackReason: outcome.fallbackReason,
    ranking: Object.freeze([...outcome.ranking]),
    rankingHash: outcome.rankingHash,
    rolloutWorkUnits: outcome.rolloutWorkUnits,
    profileConfigurationHash: input.profile.configurationHash,
    telemetry,
    elapsedMs: outcome.elapsedMs,
    rolloutEvaluationCostMs: outcome.elapsedMs,
  });
}

function deriveParticleSeed(snapshot: D2GPreActionState): number {
  const bytes = new TextEncoder().encode([
    "d2f-shadow-particle-seed-v1",
    snapshot.publicIdentity.handIdentity,
    snapshot.expectedFinalPublicLedgerHash,
    String(snapshot.actingSeat),
  ].join("\0"));
  return Number.parseInt(sha256Bytes(bytes).slice(0, 8), 16);
}

function hashRanking(ranking: readonly string[]): string {
  return hashCanonical({ schemaVersion: "d2g-rollout-ranking-v1", ranking });
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}

function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) throw new Error("D2G_CANONICAL_JSON_UNSUPPORTED_VALUE");
  return serialized;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("D2G_CANONICAL_JSON_UNSUPPORTED_VALUE");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  throw new Error("D2G_CANONICAL_JSON_UNSUPPORTED_VALUE");
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
