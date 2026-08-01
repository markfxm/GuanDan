import { RANKS, type GameRank } from "../../engine/cards";
import {
  canonicalPublicLedgerHash,
  type HardPublicLedger,
} from "../../game/publicLedger";
import { verifyPublicActionEventHash } from "../../game/publicEventHash";
import type { PublicActionEvent, PublicSeat } from "../../game/publicEvent";
import {
  canonicalParticleScenarioBytes,
  createParticleBankConfigIdentity,
  likelihoodConfigHash,
  particleScenarioIdentity,
} from "./canonicalDeal";
import type {
  ParticleActionObservation,
  ParticleBankBuildInput,
  ParticleBankBuildResult,
  ParticleBankFailureReason,
  ParticleScenario,
  PrivateParticleSummary,
} from "./contracts";
import { createParticleDiagnostics } from "./particleDiagnostics";
import {
  createParticleBankHandle,
  type ParticleBankInternals,
  type ParticleRecord,
} from "./particleBankInternals";
import {
  catchUpPublicLedgerSnapshot,
  deriveActingSeatInitialDealConstraints,
  replayParticleScenario,
} from "./publicEventDealReplay";
import { sampleConstrainedParticleScenarios } from "./constrainedParticleSampler";
import { evaluateActionSupportLikelihood } from "./actionSupportLikelihood";
import { aggregateLogWeights, normalizeLogWeights } from "./logWeightNormalization";
import { calculateEffectiveSampleSize } from "./effectiveSampleSize";

type InternalFailureCode =
  | "INVALID_INPUT"
  | "INVALID_PUBLIC_SNAPSHOT"
  | "STALE_SNAPSHOT"
  | "EVENT_CATCH_UP_FAILED"
  | "CONSTRAINTS_FAILED"
  | "CONSERVATION_FAILED"
  | "ACTION_SUPPORT_UNAVAILABLE"
  | "NON_FINITE_WEIGHT"
  | "DUPLICATE_CONTENT_COLLISION";

class BuilderBoundaryError extends Error {
  readonly code: InternalFailureCode;

  constructor(code: InternalFailureCode) {
    super(code);
    this.name = "BuilderBoundaryError";
    this.code = code;
  }
}

const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];

export function buildParticleBank(input: ParticleBankBuildInput): ParticleBankBuildResult {
  try {
    return build(input);
  } catch (error) {
    return failureResult(mapFailure(error), input);
  }
}

function build(input: ParticleBankBuildInput): ParticleBankBuildResult {
  validateInput(input);
  validatePublicSnapshot(input);

  const config = makeConfigIdentity(input);

  let catchUp;
  try {
    catchUp = catchUpPublicLedgerSnapshot({
      baseLedger: input.baseLedger,
      pendingPublicEvents: input.pendingPublicEvents,
      expectedFinalEventIndex: input.expectedFinalEventIndex,
      expectedFinalLedgerHash: input.expectedFinalPublicLedgerHash,
    });
  } catch (error) {
    throw new BuilderBoundaryError("INVALID_PUBLIC_SNAPSHOT");
  }
  if (!catchUp.ok) {
    if (catchUp.error === "STALE_SNAPSHOT") throw new BuilderBoundaryError("STALE_SNAPSHOT");
    throw new BuilderBoundaryError("EVENT_CATCH_UP_FAILED");
  }

  const finalLedger = catchUp.finalLedger;
  let constraints;
  try {
    constraints = deriveActingSeatInitialDealConstraints({
      publicHistoryEvents: input.publicHistoryEvents,
      baseLedger: input.baseLedger,
      pendingPublicEvents: input.pendingPublicEvents,
      perspectiveSeat: input.actingSeat,
      ownCurrentHand: input.ownCurrentHand,
      expectedFinalEventIndex: input.expectedFinalEventIndex,
      expectedFinalLedgerHash: input.expectedFinalPublicLedgerHash,
    });
  } catch (error) {
    throw new BuilderBoundaryError("CONSTRAINTS_FAILED");
  }

  let sampled;
  try {
    sampled = sampleConstrainedParticleScenarios({
      publicIdentity: input.publicIdentity,
      constraints,
      publicHistoryEvents: input.publicHistoryEvents,
      initialLedger: input.initialLedger,
      finalLedger,
      gameRank: input.gameRank,
      perspectiveSeat: input.actingSeat,
      ownCurrentHand: input.ownCurrentHand,
      particleSeed: input.particleSeed,
      particleCount: input.particleCount,
      maxSamplingAttempts: input.maxSamplingAttempts,
      maxIndexDraws: input.maxIndexDraws,
      samplerConfigVersion: input.samplerConfigVersion,
    });
  } catch (error) {
    throw error;
  }

  const snapshot = Object.freeze({
    gameId: input.publicIdentity.gameId,
    roundIdentity: input.publicIdentity.roundIdentity,
    handIdentity: input.publicIdentity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(input.initialLedger),
    lastAppliedEventIndex: finalLedger.lastAppliedEventIndex,
    ledgerHash: canonicalPublicLedgerHash(finalLedger),
    perspectiveSeat: input.actingSeat,
    gameRank: input.gameRank,
  });

  const priorLogWeights = sampled.scenarios.map(() => 0);
  const actionLogLikelihoods: number[] = [];
  const scenarioIds = new Set<string>();
  const scenarioBytes = new Map<string, string>();

  for (const scenario of sampled.scenarios) {
    let replay;
    try {
      replay = replayParticleScenario({
        scenario,
        publicHistoryEvents: input.publicHistoryEvents,
        initialLedger: input.initialLedger,
        finalLedger,
        gameRank: input.gameRank,
        perspectiveSeat: input.actingSeat,
        ownCurrentHand: input.ownCurrentHand,
      });
    } catch (error) {
      throw new BuilderBoundaryError("CONSERVATION_FAILED");
    }

    const observations = [...replay.actionObservations].sort((left, right) => left.eventIndex - right.eventIndex);
    let totalLogLikelihood = 0;
    for (const observation of observations) {
      let outcome;
      try {
        outcome = evaluateActionSupportLikelihood({
          observation,
          gameRank: input.gameRank,
          config: input.likelihoodConfig,
        });
      } catch (error) {
        throw error;
      }
      if (!outcome.ok) throw new BuilderBoundaryError("ACTION_SUPPORT_UNAVAILABLE");
      if (Number.isNaN(outcome.logLikelihood) || outcome.logLikelihood === Number.POSITIVE_INFINITY) {
        throw new BuilderBoundaryError("NON_FINITE_WEIGHT");
      }
      totalLogLikelihood += outcome.logLikelihood;
    }
    actionLogLikelihoods.push(totalLogLikelihood);

    const identity = particleScenarioIdentity(snapshot, scenario);
    const bytes = bytesAsString(canonicalParticleScenarioBytes(scenario));
    const previous = scenarioBytes.get(identity);
    if (previous !== undefined && previous !== bytes) throw new BuilderBoundaryError("DUPLICATE_CONTENT_COLLISION" as InternalFailureCode);
    if (scenarioIds.has(identity)) throw new BuilderBoundaryError("DUPLICATE_CONTENT_COLLISION" as InternalFailureCode);
    scenarioIds.add(identity);
    scenarioBytes.set(identity, bytes);
  }

  const logWeights = aggregateLogWeights({ priorLogWeights, actionLogLikelihoods });
  let normalized;
  try {
    normalized = normalizeLogWeights({
      logWeights,
      tolerance: input.likelihoodConfig.normalizationTolerance,
    });
  } catch (error) {
    throw error;
  }

  let ess;
  try {
    ess = calculateEffectiveSampleSize({
      normalizedWeights: normalized.weights,
      tolerance: input.likelihoodConfig.essTolerance,
      degradedEssThreshold: input.likelihoodConfig.degradedEssThreshold,
    });
  } catch (error) {
    throw error;
  }

  const records: readonly ParticleRecord[] = sampled.scenarios.map((scenario, index) => ({
    particleId: particleScenarioIdentity(snapshot, scenario),
    scenario,
    normalizedWeight: normalized.weights[index]!,
  }));
  const summary = createParticleDiagnostics({
    status: ess.status,
    requestedParticleCount: input.particleCount,
    acceptedParticleCount: sampled.scenarios.length,
    samplingAttempts: sampled.attempts,
    duplicateCount: sampled.duplicateCount,
    zeroWeightCount: normalized.weights.filter((weight) => weight === 0).length,
    effectiveSampleSize: ess.ess,
  });
  const internals: ParticleBankInternals = { records };
  return {
    ok: true,
    bank: createParticleBankHandle({
      schemaVersion: "d2-particle-bank-v1",
      snapshot,
      config,
      particleCount: input.particleCount,
      effectiveSampleSize: ess.ess,
      status: ess.ess <= input.likelihoodConfig.degradedEssThreshold ? "degraded" : ess.status,
      summary,
    }, internals),
  };
}

function validateInput(input: ParticleBankBuildInput): void {
  if (!isRecord(input) || input.schemaVersion !== "d2-particle-bank-build-input-v1") throw new BuilderBoundaryError("INVALID_INPUT");
  if (!isRecord(input.publicIdentity) || [input.publicIdentity.gameId, input.publicIdentity.roundIdentity, input.publicIdentity.handIdentity].some((value) => typeof value !== "string" || value.length === 0)) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!RANKS.includes(input.gameRank)) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!SEATS.includes(input.actingSeat)) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!Number.isInteger(input.particleSeed) || input.particleSeed < 0 || input.particleSeed > 0xffffffff) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!Number.isSafeInteger(input.particleCount) || input.particleCount < 1) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!Number.isSafeInteger(input.maxSamplingAttempts) || input.maxSamplingAttempts < 1) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!Number.isSafeInteger(input.maxIndexDraws) || input.maxIndexDraws < 1) throw new BuilderBoundaryError("INVALID_INPUT");
  if (typeof input.samplerConfigVersion !== "string" || input.samplerConfigVersion.length === 0) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!Array.isArray(input.publicHistoryEvents) || input.publicHistoryEvents.length === 0 || !Array.isArray(input.pendingPublicEvents) || !Array.isArray(input.ownCurrentHand)) throw new BuilderBoundaryError("INVALID_INPUT");
  if (!Number.isSafeInteger(input.expectedFinalEventIndex) || input.expectedFinalEventIndex < 0 || typeof input.expectedFinalPublicLedgerHash !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedFinalPublicLedgerHash)) throw new BuilderBoundaryError("INVALID_INPUT");
}

function validatePublicSnapshot(input: ParticleBankBuildInput): void {
  const initial = input.initialLedger;
  const base = input.baseLedger;
  if (!isLedger(initial) || !isLedger(base)) throw new BuilderBoundaryError("INVALID_PUBLIC_SNAPSHOT");
  if (initial.lastAppliedEventIndex !== -1 || initial.nextEventIndex !== 0 || Object.keys(initial.seenEventHashes).length !== 0) throw new BuilderBoundaryError("INVALID_PUBLIC_SNAPSHOT");
  for (const ledger of [initial, base]) {
    if (ledger.gameId !== input.publicIdentity.gameId || ledger.roundIdentity !== input.publicIdentity.roundIdentity || ledger.handIdentity !== input.publicIdentity.handIdentity) throw new BuilderBoundaryError("INVALID_PUBLIC_SNAPSHOT");
  }
  if (input.publicHistoryEvents[0]?.eventIndex !== 0) throw new BuilderBoundaryError("INVALID_PUBLIC_SNAPSHOT");
  let expectedIndex = 0;
  for (const event of input.publicHistoryEvents) {
    if (event.eventIndex !== expectedIndex || event.gameId !== input.publicIdentity.gameId || event.roundIdentity !== input.publicIdentity.roundIdentity || event.handIdentity !== input.publicIdentity.handIdentity) throw new BuilderBoundaryError("INVALID_PUBLIC_SNAPSHOT");
    try {
      verifyPublicActionEventHash(event);
    } catch (error) {
      throw new BuilderBoundaryError("INVALID_PUBLIC_SNAPSHOT");
    }
    expectedIndex += 1;
  }
}

function isLedger(value: unknown): value is HardPublicLedger {
  if (!isRecord(value)) return false;
  return value.schemaVersion === "d2-public-ledger-v1"
    && typeof value.gameId === "string"
    && typeof value.roundIdentity === "string"
    && typeof value.handIdentity === "string"
    && Number.isInteger(value.lastAppliedEventIndex)
    && Number.isInteger(value.nextEventIndex)
    && isRecord(value.seenEventHashes)
    && Array.isArray(value.playedCardIds)
    && Array.isArray(value.revealedTransferEvents)
    && isRecord(value.handCounts)
    && isRecord(value.currentTrick)
    && Array.isArray(value.finishOrder)
    && Array.isArray(value.publicTributeEvents)
    && Array.isArray(value.recentActionSummaries);
}

function makeConfigIdentity(input: ParticleBankBuildInput) {
  if (input.maxSamplingAttempts >= input.particleCount) {
    return createParticleBankConfigIdentity({
      particleCount: input.particleCount,
      maxSamplingAttempts: input.maxSamplingAttempts,
      maxIndexDraws: input.maxIndexDraws,
      samplerConfigVersion: input.samplerConfigVersion,
      likelihoodConfig: input.likelihoodConfig,
    });
  }

  const validated = createParticleBankConfigIdentity({
    particleCount: input.particleCount,
    maxSamplingAttempts: input.particleCount,
    maxIndexDraws: input.maxIndexDraws,
    samplerConfigVersion: input.samplerConfigVersion,
    likelihoodConfig: input.likelihoodConfig,
  });
  return Object.freeze({
    ...validated,
    maxSamplingAttempts: input.maxSamplingAttempts,
    likelihoodConfigHash: likelihoodConfigHash(input.likelihoodConfig),
  });
}

function mapFailure(error: unknown): ParticleBankFailureReason {
  if (error instanceof BuilderBoundaryError) {
    switch (error.code) {
      case "INVALID_INPUT": return "invalid-input";
      case "INVALID_PUBLIC_SNAPSHOT": return "invalid-public-snapshot";
      case "ACTION_SUPPORT_UNAVAILABLE": return "action-support-unavailable";
      case "NON_FINITE_WEIGHT": return "non-finite-weight";
      case "STALE_SNAPSHOT": return "stale-public-snapshot";
      case "EVENT_CATCH_UP_FAILED": return "event-catch-up-failed";
      case "CONSTRAINTS_FAILED": return "initial-deal-constraints-failed";
      case "CONSERVATION_FAILED": return "conservation-failed";
      case "DUPLICATE_CONTENT_COLLISION": return "builder-threw";
    }
  }
  if (isNamed(error, "BoundedIndexDrawExhaustedError", "BOUNDED_INDEX_DRAW_EXHAUSTED")) return "bounded-index-exhausted";
  if (isNamed(error, "ParticleSamplingExhaustedError", "PARTICLE_SAMPLING_ATTEMPTS_EXHAUSTED")) return "insufficient-particles";
  if (isNamed(error, "AllZeroWeightsError")) return "all-zero-weights";
  if (isNamed(error, "NormalizationFailureError")) return "normalization-failed";
  if (isNamed(error, "EffectiveSampleSizeFailureError")) return "ess-failed";
  if (error instanceof TypeError || error instanceof RangeError) return "invalid-input";
  return "builder-threw";
}

function failureResult(reason: ParticleBankFailureReason, input: ParticleBankBuildInput): ParticleBankBuildResult {
  const requestedParticleCount = isRecord(input) && typeof input.particleCount === "number" && Number.isFinite(input.particleCount) ? input.particleCount : 0;
  const summary: PrivateParticleSummary = createParticleDiagnostics({
    status: "failed",
    requestedParticleCount,
    acceptedParticleCount: 0,
    samplingAttempts: 0,
    duplicateCount: 0,
    zeroWeightCount: 0,
    failureReason: reason,
  });
  return { ok: false, reason, summary };
}

function isNamed(error: unknown, name: string, code?: string): boolean {
  if (!isRecord(error)) return false;
  return error.name === name || (code !== undefined && error.code === code);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function bytesAsString(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
