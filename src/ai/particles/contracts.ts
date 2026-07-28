import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import type { PublicActionEvent, PublicGameIdentity, PublicSeat } from "../../game/publicEvent";
import type { HardPublicLedger } from "../../game/publicLedger";

export type ParticleLikelihoodConfig = Readonly<{
  schemaVersion: "d2-particle-likelihood-v1";
  forcedPassLogFactor: number;
  couldBeatButPassedLogFactor: number;
  observedLeadPlayLogFactor: number;
  observedFollowPlayLogFactor: number;
  degradedEssThreshold: number;
  normalizationTolerance: number;
  essTolerance: number;
}>;

export type ParticleBankBuildInput = Readonly<{
  schemaVersion: "d2-particle-bank-build-input-v1";
  publicIdentity: PublicGameIdentity;
  baseLedger: HardPublicLedger;
  publicHistoryEvents: readonly PublicActionEvent[];
  pendingPublicEvents: readonly PublicActionEvent[];
  expectedFinalEventIndex: number;
  expectedFinalPublicLedgerHash: string;
  gameRank: GameRank;
  actingSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  particleSeed: number;
  particleCount: number;
  maxSamplingAttempts: number;
  maxIndexDraws: number;
  samplerConfigVersion: string;
  likelihoodConfig: ParticleLikelihoodConfig;
}>;

export type CanonicalInitialDeal = Readonly<{
  schemaVersion: "d2-particle-initial-deal-v1";
  hands: Readonly<Record<PublicSeat, readonly Card[]>>;
}>;

export type HiddenTransferAssignment = Readonly<{
  eventIndex: number;
  eventKind: "tribute" | "return";
  fromSeat: PublicSeat;
  toSeat: PublicSeat;
  cardId: string;
}>;

export type ParticleScenario = Readonly<{
  schemaVersion: "d2-particle-scenario-v1";
  initialDeal: CanonicalInitialDeal;
  hiddenTransferAssignments: readonly HiddenTransferAssignment[];
}>;

export type ReplayedParticleState = Readonly<{
  hands: Readonly<Record<PublicSeat, readonly Card[]>>;
  publicPlayedCardIds: readonly string[];
  revealedTransferEvents: HardPublicLedger["revealedTransferEvents"];
  currentTrick: HardPublicLedger["currentTrick"];
  currentLastPlay?: CardGroup;
  handCounts: Readonly<Record<PublicSeat, number>>;
  finishOrder: readonly PublicSeat[];
  ledger: HardPublicLedger;
}>;

export type ParticleActionObservation = Readonly<{
  eventIndex: number;
  event: PublicActionEvent;
  stateBeforeEvent: ReplayedParticleState;
}>;

export type ParticleReplayResult = Readonly<{
  finalState: ReplayedParticleState;
  actionObservations: readonly ParticleActionObservation[];
}>;

export type ParticleSnapshotIdentity = Readonly<{
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  lastAppliedEventIndex: number;
  ledgerHash: string;
  perspectiveSeat: PublicSeat;
  gameRank: GameRank;
}>;

export type ParticleBankConfigIdentity = Readonly<{
  schemaVersion: "d2-particle-bank-config-identity-v1";
  particleCount: number;
  maxSamplingAttempts: number;
  maxIndexDraws: number;
  samplerConfigVersion: string;
  likelihoodConfigHash: string;
}>;

export type ParticleBankStatus = "ready" | "degraded";

export type ParticleBankFailureReason =
  | "invalid-input"
  | "invalid-seed"
  | "invalid-particle-count"
  | "invalid-attempt-limit"
  | "invalid-public-snapshot"
  | "event-catch-up-failed"
  | "stale-public-snapshot"
  | "initial-deal-constraints-failed"
  | "conservation-failed"
  | "bounded-index-exhausted"
  | "action-support-unavailable"
  | "unknown-bank-handle"
  | "duplicate-content-collision"
  | "insufficient-particles"
  | "all-zero-weights"
  | "non-finite-weight"
  | "normalization-failed"
  | "ess-failed"
  | "builder-threw";

export type PrivateParticleSummary = Readonly<{
  status: ParticleBankStatus | "failed";
  requestedParticleCount: number;
  acceptedParticleCount: number;
  samplingAttempts: number;
  duplicateCount: number;
  zeroWeightCount: number;
  effectiveSampleSize?: number;
  failureReason?: ParticleBankFailureReason;
}>;

export type ParticleBank = Readonly<{
  schemaVersion: "d2-particle-bank-v1";
  snapshot: ParticleSnapshotIdentity;
  config: ParticleBankConfigIdentity;
  particleCount: number;
  effectiveSampleSize: number;
  status: ParticleBankStatus;
  summary: PrivateParticleSummary;
}>;

export type ParticleBankBuildResult =
  | { ok: true; bank: ParticleBank }
  | { ok: false; reason: ParticleBankFailureReason; summary: PrivateParticleSummary };
