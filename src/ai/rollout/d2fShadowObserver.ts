import type { CardGroup } from "../../engine/groups";
import { canonicalPublicLedgerHash, type HardPublicLedger } from "../../game/publicLedger";
import type { PublicActionEvent, PublicGameIdentity, PublicSeat } from "../../game/publicEvent";
import { sha256Bytes } from "../../game/publicEventHash";
import { buildParticleBank } from "../particles/particleBankBuilder";
import {
  canonicalActionIdentity,
  canonicalReplayContextIdentity,
  createRolloutRequest,
  type D2FShadowEvidence,
  type D2FShadowCandidateResult,
  type D2FShadowCandidateProjection,
  type D2FShadowFallbackReason,
  type D2FShadowParticleBankConfig,
  type D2FShadowPreActionSnapshot,
  type D2FShadowSnapshotResult,
  type RolloutAction,
  type RolloutBudget,
  type RolloutBudgetLimits,
  type RolloutCandidate,
  type RolloutEvidenceRequirements,
  type RolloutRiskPolicy,
  type RolloutFailure,
} from "./contracts";
import { runDetachedRollout } from "./rolloutOrchestrator";

const PARTICLE_BANK_CONFIG: D2FShadowParticleBankConfig = Object.freeze({
  schemaVersion: "d2-particle-bank-build-input-v1",
  particleCount: 1,
  maxSamplingAttempts: 1,
  maxIndexDraws: 1,
  samplerConfigVersion: "d2-particle-sampler-v1",
  likelihoodConfig: Object.freeze({
    schemaVersion: "d2-particle-likelihood-v1",
    forcedPassLogFactor: -1,
    couldBeatButPassedLogFactor: -0.25,
    observedLeadPlayLogFactor: -0.1,
    observedFollowPlayLogFactor: -0.2,
    degradedEssThreshold: 1,
    normalizationTolerance: 0.000001,
    essTolerance: 0.000001,
  }),
});

const SHADOW_BUDGET: RolloutBudget = Object.freeze({
  replicateCountPerScenario: 1,
  maxPliesPerReplicate: 1,
  maxPolicyActionEvaluationsPerPly: 256,
  maxWorkUnits: 256,
});

const SHADOW_LIMITS: RolloutBudgetLimits = Object.freeze({
  maxReplicateCountPerScenario: 1,
  maxPliesPerReplicate: 1,
  maxPolicyActionEvaluationsPerPly: 256,
  maxWorkUnits: 256,
});

const SHADOW_EVIDENCE_REQUIREMENTS: RolloutEvidenceRequirements = Object.freeze({
  schemaVersion: "d2f-rollout-evidence-requirements-v1",
  minimumEffectiveSampleSize: 1,
  minimumAcceptedScenarioCount: 1,
  minimumCompletedReplicateCount: 1,
  requireCompleteCoverage: true,
});

const SHADOW_RISK_POLICY: RolloutRiskPolicy = Object.freeze({
  schemaVersion: "d2f-rollout-risk-policy-v1",
  variancePenalty: 0,
  downsideRiskPenalty: 0,
});

const CANDIDATE_INPUT_KEYS = ["evaluatedCandidates", "selectedAction"] as const;
const SNAPSHOT_INPUT_KEYS = [
  "publicIdentity", "initialLedger", "finalLedger", "publicHistoryEvents", "gameRank", "perspectiveSeat", "actingSeat",
  "ownCurrentHand", "publicState", "currentTrick", "candidates", "selectedCandidateId",
] as const;

export function createD2FShadowCandidates(input: unknown): D2FShadowCandidateResult {
  try {
    if (!isPlainDataRecord(input) || !hasExactKeys(input, CANDIDATE_INPUT_KEYS)) return candidateFailure("invalid-candidate");
    const evaluatedCandidates = input.evaluatedCandidates;
    if (!isPlainDataArray(evaluatedCandidates)) return candidateFailure("invalid-candidate");
    if (evaluatedCandidates.length === 0) return candidateFailure("empty-candidates");

    const candidates: RolloutCandidate[] = [];
    const seenIds = new Set<string>();
    for (const evaluated of evaluatedCandidates) {
      if (!isPlainDataRecord(evaluated) || !isPlainDataRecord(evaluated.candidate) || !isPlainDataRecord(evaluated.score)) {
        return candidateFailure("invalid-candidate");
      }
      const action = cloneRolloutAction(evaluated.candidate.action);
      if (action === undefined) return candidateFailure("invalid-candidate");
      const baselineEvaluatorScore = evaluated.score.total;
      if (typeof baselineEvaluatorScore !== "number" || !Number.isFinite(baselineEvaluatorScore)) return candidateFailure("non-finite-score");
      const candidateId = canonicalActionIdentity(action);
      if (seenIds.has(candidateId)) return candidateFailure("duplicate-candidate-id");
      seenIds.add(candidateId);
      candidates.push({ candidateId, action, baselineEvaluatorScore });
    }

    const selectedAction = cloneRolloutAction(input.selectedAction);
    if (selectedAction === undefined) return candidateFailure("selected-candidate-missing");
    const selectedCandidateId = canonicalActionIdentity(selectedAction);
    if (!seenIds.has(selectedCandidateId)) return candidateFailure("selected-candidate-missing");
    candidates.sort(compareCandidateIds);
    const value: D2FShadowCandidateProjection = {
      candidates,
      selectedCandidateId,
    };
    return Object.freeze({ ok: true as const, value: deepFreeze(value) });
  } catch {
    return candidateFailure("invalid-candidate");
  }
}

export function createD2FShadowPreActionSnapshot(input: unknown): D2FShadowSnapshotResult {
  try {
    if (!isPlainDataRecord(input) || !hasExactKeys(input, SNAPSHOT_INPUT_KEYS)) return snapshotFailure("invalid-room-projection");
    if (!isPublicIdentity(input.publicIdentity) || !isLedger(input.initialLedger) || !isLedger(input.finalLedger)) return snapshotFailure("invalid-room-projection");
    if (!isPlainDataArray(input.publicHistoryEvents) || !isPlainDataArray(input.ownCurrentHand)) return snapshotFailure("invalid-public-replay");
    if (!isPlainDataRecord(input.publicState) || !isPlainDataRecord(input.currentTrick) || !isPlainDataArray(input.candidates)) return snapshotFailure("invalid-room-projection");
    if (!isGameRank(input.gameRank) || !isSeat(input.perspectiveSeat) || !isSeat(input.actingSeat)) return snapshotFailure("invalid-room-projection");
    if (typeof input.selectedCandidateId !== "string" || input.selectedCandidateId.length === 0) return snapshotFailure("invalid-candidate-projection");

    const candidates = cloneCandidates(input.candidates);
    if (candidates === undefined) return snapshotFailure("invalid-candidate-projection");
    if (!candidates.some((candidate) => candidate.candidateId === input.selectedCandidateId)) return snapshotFailure("invalid-candidate-projection");
    const publicState = structuredClone(input.publicState) as D2FShadowPreActionSnapshot["publicState"];
    const publicHistoryEvents = structuredClone(input.publicHistoryEvents) as readonly PublicActionEvent[];
    const initialLedger = structuredClone(input.initialLedger) as HardPublicLedger;
    const finalLedger = structuredClone(input.finalLedger) as HardPublicLedger;
    const ownCurrentHand = structuredClone(input.ownCurrentHand) as readonly import("../../engine/cards").Card[];
    const currentTrick = structuredClone(input.currentTrick) as D2FShadowPreActionSnapshot["currentTrick"];
    const particleBankSnapshot = {
      gameId: input.publicIdentity.gameId,
      roundIdentity: input.publicIdentity.roundIdentity,
      handIdentity: input.publicIdentity.handIdentity,
      initialLedgerHash: canonicalPublicLedgerHash(initialLedger),
      lastAppliedEventIndex: finalLedger.lastAppliedEventIndex,
      ledgerHash: canonicalPublicLedgerHash(finalLedger),
      perspectiveSeat: input.perspectiveSeat,
      gameRank: input.gameRank,
    } as const;
    const rootIdentity = canonicalReplayContextIdentity({
      publicHistoryEvents,
      initialLedger,
      finalLedger,
      gameRank: input.gameRank,
      perspectiveSeat: input.perspectiveSeat,
      ownCurrentHand,
      actingSeat: input.actingSeat,
      publicState,
      particleBankSnapshot,
    });
    const value: D2FShadowPreActionSnapshot = {
      schemaVersion: "d2f-shadow-pre-action-snapshot-v1",
      publicIdentity: structuredClone(input.publicIdentity),
      initialLedger,
      finalLedger,
      publicHistoryEvents,
      gameRank: input.gameRank,
      perspectiveSeat: input.perspectiveSeat,
      actingSeat: input.actingSeat,
      ownCurrentHand,
      publicState,
      currentTrick,
      candidates,
      selectedCandidateId: input.selectedCandidateId,
      particleBankConfig: PARTICLE_BANK_CONFIG,
      particleBankBaseLedger: finalLedger,
      particleBankPendingPublicEvents: [],
      expectedFinalEventIndex: finalLedger.lastAppliedEventIndex,
      expectedFinalPublicLedgerHash: canonicalPublicLedgerHash(finalLedger),
      budget: SHADOW_BUDGET,
      limits: SHADOW_LIMITS,
      evidenceRequirements: SHADOW_EVIDENCE_REQUIREMENTS,
      riskPolicy: SHADOW_RISK_POLICY,
      rootIdentity,
    };
    return Object.freeze({ ok: true as const, value: deepFreeze(value) });
  } catch {
    return snapshotFailure("root-identity-failed");
  }
}

function toD2FShadowScenarioSourceInput(snapshot: D2FShadowPreActionSnapshot, bank: object) {
  return deepFreeze({
    bank,
    publicHistoryEvents: structuredClone(snapshot.publicHistoryEvents),
    initialLedger: structuredClone(snapshot.initialLedger),
    finalLedger: structuredClone(snapshot.finalLedger),
    gameRank: snapshot.gameRank,
    perspectiveSeat: snapshot.perspectiveSeat,
    ownCurrentHand: structuredClone(snapshot.ownCurrentHand),
    publicState: structuredClone(snapshot.publicState),
  });
}

export function observeD2FShadow(snapshot: D2FShadowPreActionSnapshot): D2FShadowEvidence {
  const startedAt = performance.now();
  const baselineCandidate = snapshot.candidates.find((candidate) => candidate.candidateId === snapshot.selectedCandidateId);
  try {
    const bankResult = buildParticleBank({
      schemaVersion: snapshot.particleBankConfig.schemaVersion,
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
      particleCount: snapshot.particleBankConfig.particleCount,
      maxSamplingAttempts: snapshot.particleBankConfig.maxSamplingAttempts,
      maxIndexDraws: snapshot.particleBankConfig.maxIndexDraws,
      samplerConfigVersion: snapshot.particleBankConfig.samplerConfigVersion,
      likelihoodConfig: snapshot.particleBankConfig.likelihoodConfig,
    });
    if (!bankResult.ok) return failureEvidence(snapshot, "particle-bank-failed");

    const scenarioSourceInput = toD2FShadowScenarioSourceInput(snapshot, bankResult.bank);
    const requestInput = {
      schemaVersion: "d2f-rollout-request-v2" as const,
      mode: "shadow" as const,
      formalExecutionAllowed: false as const,
      rootIdentity: snapshot.rootIdentity,
      scenarioSourceInput,
      candidates: snapshot.candidates,
      budget: snapshot.budget,
      limits: snapshot.limits,
      evidenceRequirements: snapshot.evidenceRequirements,
      riskPolicy: snapshot.riskPolicy,
      policyId: "d2f-lightweight-v1" as const,
    };
    const request = createRolloutRequest(requestInput);
    if (!request.ok) return failureEvidence(snapshot, fallbackReasonForFailure(request.failure));
    const rollout = runDetachedRollout(request.value);
    if (!rollout.ok) return failureEvidence(snapshot, fallbackReasonForFailure(rollout.failure));

    const shadowTopCandidateId = rollout.result.ranking[0] ?? null;
    const selectedSummary = rollout.result.candidateSummaries.find((summary) => summary.candidateId === snapshot.selectedCandidateId);
    const topSummary = shadowTopCandidateId === null
      ? undefined
      : rollout.result.candidateSummaries.find((summary) => summary.candidateId === shadowTopCandidateId);
    if (selectedSummary === undefined || (shadowTopCandidateId !== null && topSummary === undefined)) {
      return failureEvidence(snapshot, "result-assembly-failed");
    }
    const elapsedWallClockMs = performance.now() - startedAt;
    return deepFreeze({
      schemaVersion: "d2f-shadow-v3",
      status: "success",
      decisionIdentity: snapshot.rootIdentity,
      formalCandidateId: snapshot.selectedCandidateId,
      shadowTopCandidateId,
      agreement: shadowTopCandidateId === snapshot.selectedCandidateId,
      ranking: [...rollout.result.ranking],
      aggregateDiagnostics: structuredClone(rollout.result.aggregateDiagnostics),
      policyId: "d2f-lightweight-v1",
      baselineActionIdentity: snapshot.selectedCandidateId,
      d2fRecommendedActionIdentity: shadowTopCandidateId,
      riskAdjustedUtilityDelta: topSummary === undefined ? null : topSummary.riskAdjustedUtility - selectedSummary.riskAdjustedUtility,
      expectedUtilityDelta: topSummary === undefined ? null : topSummary.expectedUtility - selectedSummary.expectedUtility,
      baselineEvaluatorScore: baselineCandidate?.baselineEvaluatorScore ?? selectedSummary.baselineEvaluatorScore,
      effectiveSampleSize: rollout.result.aggregateDiagnostics.effectiveSampleSize,
      acceptedScenarioCount: rollout.result.aggregateDiagnostics.acceptedScenarioCount,
      replicateCountPerScenario: rollout.result.aggregateDiagnostics.replicateCountPerScenario,
      completedReplicateCount: rollout.result.aggregateDiagnostics.completedReplicateCount,
      workUnitCount: rollout.result.aggregateDiagnostics.workUnitCount,
      fallbackReason: "none",
      semanticBudgetUsage: {
        replicateCountPerScenario: snapshot.budget.replicateCountPerScenario,
        maxPliesPerReplicate: snapshot.budget.maxPliesPerReplicate,
        maxPolicyActionEvaluationsPerPly: snapshot.budget.maxPolicyActionEvaluationsPerPly,
        workUnitCount: rollout.result.aggregateDiagnostics.workUnitCount,
      },
      elapsedWallClockMs,
    });
  } catch {
    return failureEvidence(snapshot, "unexpected-failure");
  }
}

function deriveParticleSeed(snapshot: D2FShadowPreActionSnapshot): number {
  const bytes = new TextEncoder().encode([
    "d2f-shadow-particle-seed-v1",
    snapshot.publicIdentity.handIdentity,
    snapshot.expectedFinalPublicLedgerHash,
    String(snapshot.actingSeat),
  ].join("\0"));
  return Number.parseInt(sha256Bytes(bytes).slice(0, 8), 16);
}

export function createD2FShadowFailureEvidence(input: Readonly<{
  fallbackReason: D2FShadowFallbackReason;
  decisionIdentity?: string | null;
  formalCandidateId?: string | null;
  baselineActionIdentity?: string | null;
  baselineEvaluatorScore?: number | null;
}>): D2FShadowEvidence {
  return deepFreeze({
    schemaVersion: "d2f-shadow-v3",
    status: "failure",
    decisionIdentity: input.decisionIdentity ?? null,
    formalCandidateId: input.formalCandidateId ?? null,
    shadowTopCandidateId: null,
    agreement: "unavailable",
    ranking: [],
    aggregateDiagnostics: null,
    policyId: "d2f-lightweight-v1",
    baselineActionIdentity: input.baselineActionIdentity ?? null,
    d2fRecommendedActionIdentity: null,
    riskAdjustedUtilityDelta: null,
    expectedUtilityDelta: null,
    baselineEvaluatorScore: input.baselineEvaluatorScore ?? null,
    effectiveSampleSize: null,
    acceptedScenarioCount: null,
    replicateCountPerScenario: null,
    completedReplicateCount: null,
    workUnitCount: null,
    fallbackReason: input.fallbackReason,
    semanticBudgetUsage: null,
    elapsedWallClockMs: null,
  });
}

function failureEvidence(snapshot: D2FShadowPreActionSnapshot, fallbackReason: D2FShadowFallbackReason): D2FShadowEvidence {
  return createD2FShadowFailureEvidence({
    fallbackReason,
    decisionIdentity: snapshot.rootIdentity,
    formalCandidateId: snapshot.selectedCandidateId,
    baselineActionIdentity: snapshot.selectedCandidateId,
    baselineEvaluatorScore: snapshot.candidates.find((candidate) => candidate.candidateId === snapshot.selectedCandidateId)?.baselineEvaluatorScore ?? null,
  });
}

function fallbackReasonForFailure(failure: RolloutFailure): D2FShadowFallbackReason {
  switch (failure.kind) {
    case "invalid-request":
      if (failure.field === "ranking") return "ranking-failed";
      if (failure.field === "assemblyInput" || failure.field === "candidateSummaries" || failure.field === "aggregateDiagnostics") return "result-assembly-failed";
      return "request-failed";
    case "invalid-budget":
    case "invalid-risk-policy":
    case "invalid-evidence-requirements":
      return "request-failed";
    case "fake-or-unknown-particle-bank":
      return "particle-bank-failed";
    case "scenario-source-failed":
      return "scenario-source-failed";
    case "effective-sample-size-too-low":
    case "insufficient-scenarios":
    case "insufficient-replicates":
    case "coverage-mismatch":
      return "evidence-failed";
    case "kernel-failed":
      return failure.failure.kind === "budget-exhausted" ? "budget-exhausted" : "simulation-failed";
    case "aggregation-failed":
      return "aggregation-failed";
  }
}

function cloneCandidates(value: readonly unknown[]): readonly RolloutCandidate[] | undefined {
  const candidates: RolloutCandidate[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!isPlainDataRecord(candidate) || typeof candidate.candidateId !== "string" || !isPlainDataRecord(candidate.action) || typeof candidate.baselineEvaluatorScore !== "number" || !Number.isFinite(candidate.baselineEvaluatorScore)) return undefined;
    const action = cloneRolloutAction(candidate.action);
    if (action === undefined || canonicalActionIdentity(action) !== candidate.candidateId || ids.has(candidate.candidateId)) return undefined;
    ids.add(candidate.candidateId);
    candidates.push({ candidateId: candidate.candidateId, action, baselineEvaluatorScore: candidate.baselineEvaluatorScore });
  }
  candidates.sort(compareCandidateIds);
  return deepFreeze(candidates);
}

function cloneRolloutAction(value: unknown): RolloutAction | undefined {
  if (!isPlainDataRecord(value) || (value.type !== "pass" && value.type !== "play")) return undefined;
  if (value.type === "pass") return Object.freeze({ type: "pass" });
  if (!isPlainDataRecord(value.group)) return undefined;
  return deepFreeze({ type: "play", group: structuredClone(value.group) as CardGroup });
}

function compareCandidateIds(left: RolloutCandidate, right: RolloutCandidate): number {
  return left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0;
}

function candidateFailure(kind: Parameters<typeof candidateFailureKind>[0]): D2FShadowCandidateResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: candidateFailureKind(kind) }) });
}

function candidateFailureKind(kind: "empty-candidates" | "invalid-candidate" | "non-finite-score" | "duplicate-candidate-id" | "selected-candidate-missing") {
  return kind;
}

function snapshotFailure(kind: "invalid-room-projection" | "invalid-public-replay" | "invalid-candidate-projection" | "invalid-particle-config" | "invalid-budget" | "root-identity-failed"): D2FShadowSnapshotResult {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind }) });
}

function isPublicIdentity(value: unknown): value is PublicGameIdentity {
  return isPlainDataRecord(value)
    && value.schemaVersion === "d2-public-game-identity-v1"
    && typeof value.gameId === "string" && value.gameId.length > 0
    && typeof value.roundIdentity === "string" && typeof value.handIdentity === "string"
    && Number.isSafeInteger(value.roundSequence) && Number.isSafeInteger(value.handSequence)
    && (value.source === "production-session" || value.source === "benchmark-scenario" || value.source === "replay");
}

function isLedger(value: unknown): value is HardPublicLedger {
  return isPlainDataRecord(value)
    && value.schemaVersion === "d2-public-ledger-v1"
    && typeof value.gameId === "string" && typeof value.roundIdentity === "string" && typeof value.handIdentity === "string"
    && Number.isSafeInteger(value.nextEventIndex) && Number.isSafeInteger(value.lastAppliedEventIndex)
    && isPlainDataRecord(value.seenEventHashes) && isPlainDataArray(value.playedCardIds)
    && isPlainDataArray(value.revealedTransferEvents) && isPlainDataRecord(value.handCounts)
    && isPlainDataRecord(value.currentTrick) && isPlainDataArray(value.finishOrder)
    && isPlainDataArray(value.publicTributeEvents) && isPlainDataArray(value.recentActionSummaries);
}

function isGameRank(value: unknown): boolean {
  return ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"].includes(value as string);
}

function isSeat(value: unknown): value is PublicSeat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every((key) => typeof key === "string" && keys.includes(key)) && keys.every((key) => actual.includes(key));
}

function isPlainDataRecord(value: unknown): value is Record<string, any> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Reflect.ownKeys(value).every((key) => typeof key === "string" && isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const length = value.length;
    const keys = Reflect.ownKeys(value);
    return keys.length === length + 1 && keys.includes("length") && Array.from({ length }, (_, index) => String(index)).every((key) => keys.includes(key) && isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (isDataDescriptor(descriptor)) deepFreeze(descriptor.value, seen);
  }
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
