import { isHeartRankWild, RANKS, SUITS, type Card, type GameRank } from "../../engine/cards";
import type { CardGroup, GroupPurpose, GroupType } from "../../engine/groups";
import { assertFinalizedPublicActionEvent, playPublicStableKey, type PublicActionEvent, type PublicGameIdentity, type PublicSeat } from "../../game/publicEvent";
import { applyPublicEvent, canonicalPublicLedgerHash, type HardPublicLedger } from "../../game/publicLedger";
import { sha256Bytes, verifyPublicActionEventHash } from "../../game/publicEventHash";
import type {
  ParticleBank,
  ParticleScenario,
  ParticleSnapshotIdentity,
} from "../particles/contracts";
import { particleScenarioIdentity } from "../particles/canonicalDeal";
import { validateParticleBankPublic } from "../particles/particleBankPublicValidation";
import type { StateConservationFailure } from "./stateConservation";
import { getOwnDataProperty, isDataDescriptor, isPlainDataArray, isPlainDataRecord } from "./plainData";

export type CanonicalCandidateIdentity = string;
export type CanonicalScenarioIdentity = string;
export type CanonicalReplicateIdentity = string;
export type CanonicalCandidateDecisionAssociationIdentity = string;
export type CanonicalRandomDomainLabel = string & {
  readonly __canonicalRandomDomainLabel: unique symbol;
};
export type CanonicalRandomDomain = string & {
  readonly __canonicalRandomDomainDigest: unique symbol;
};
export type CanonicalSemanticKey = string & {
  readonly __canonicalSemanticKey: unique symbol;
};
export type RootIdentity = string;
export type RootDigest = string;
export type RolloutReplayContextIdentity = string;

export type RolloutMode = "detached" | "offline" | "shadow";

export type D2FShadowMode = "disabled" | "enabled";

export type RolloutPolicyId = "d2f-lightweight-v1";

export type RolloutAction = Readonly<
  | { type: "pass" }
  | { type: "play"; group: Readonly<CardGroup> }
>;

export type SeatLocalObservation = Readonly<{
  hand: readonly Card[];
  publicHistoryEvents: readonly PublicActionEvent[];
  handCounts: Readonly<Record<PublicSeat, number>>;
  currentLastPlay: Readonly<unknown> | null;
  finishOrder: readonly PublicSeat[];
  gameRank: GameRank;
}>;

export type RolloutPublicState = Readonly<{
  gameRank: GameRank;
  actingSeat: PublicSeat;
  perspectiveSeat: PublicSeat;
  partnerSeat: PublicSeat;
  handCounts: Readonly<Record<PublicSeat, number>>;
  finishOrder: readonly PublicSeat[];
  publicPlayedCardIds: readonly string[];
  currentLastPlay: Readonly<unknown> | null;
  currentLastPlaySeat: PublicSeat | null;
}>;

export type RolloutBudget = Readonly<{
  replicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  maxWorkUnits: number;
}>;

export type RolloutBudgetLimits = Readonly<{
  maxReplicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  maxWorkUnits: number;
}>;

export type ValidatedRolloutBudget = Readonly<{
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  maximumWorkUnits: number;
  validated: true;
}>;

export type RolloutEvidenceRequirements = Readonly<{
  schemaVersion: "d2f-rollout-evidence-requirements-v1";
  minimumEffectiveSampleSize: number;
  minimumAcceptedScenarioCount: number;
  minimumCompletedReplicateCount: number;
  requireCompleteCoverage: true;
}>;

export type RolloutRiskPolicy = Readonly<{
  schemaVersion: "d2f-rollout-risk-policy-v1";
  variancePenalty: number;
  downsideRiskPenalty: number;
}>;

export type RolloutCandidate = Readonly<{
  candidateId: string;
  action: RolloutAction;
  baselineEvaluatorScore: number;
}>;

export type RolloutScenario = Readonly<{
  scenarioIdentity: string;
  normalizedWeight: number;
  privateState: Readonly<unknown>;
}>;

export type RolloutScenarioSourceInput = Readonly<{
  bank: ParticleBank;
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  publicState: RolloutPublicState;
}>;

export type RolloutScenarioSourceResult =
  | {
      ok: true;
      scenarios: readonly RolloutScenario[];
      effectiveSampleSize: number;
      acceptedScenarioCount: number;
    }
  | { ok: false; failure: RolloutFailure };

export type ValidatedPublicReplayContext = Readonly<{
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
}>;

export type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  publicState: RolloutPublicState;
  publicReplayContext: ValidatedPublicReplayContext;
  replicateIdentity: string;
  random: CrnView;
  validatedBudget: ValidatedRolloutBudget;
}>;

declare const validatedCrnCoordinateBrand: unique symbol;

export type CrnCoordinate = Readonly<{
  rootIdentity: RootIdentity;
  scenarioIdentity: CanonicalScenarioIdentity;
  replicateIdentity: CanonicalReplicateIdentity;
  ply: number;
  actingSeat: PublicSeat;
  randomDomain: CanonicalRandomDomainLabel;
}> & {
  readonly [validatedCrnCoordinateBrand]: true;
};

export interface CrnView {
  value(semanticKey: CanonicalSemanticKey): number;
}

export type CrnFailure =
  | Readonly<{ kind: "malformed-coordinate-envelope"; field: "coordinate" | "coordinate.rootIdentity" | "coordinate.scenarioIdentity" | "coordinate.replicateIdentity" | "coordinate.ply" | "coordinate.actingSeat" | "coordinate.randomDomain" | "view-input" | "view-input.coordinate" | "view-input.randomDomain" }>
  | Readonly<{ kind: "invalid-root-identity"; reason: "empty" | "wrong-length" | "uppercase-hex" | "non-hex" }>
  | Readonly<{ kind: "invalid-scenario-identity"; reason: "empty" | "wrong-length" | "uppercase-hex" | "non-hex" }>
  | Readonly<{ kind: "invalid-replicate-identity"; reason: "empty" | "wrong-length" | "uppercase-hex" | "non-hex" }>
  | Readonly<{ kind: "invalid-decision-identity"; reason: "non-integer" | "negative" | "negative-zero" | "unsafe-integer" | "non-finite" }>
  | Readonly<{ kind: "invalid-acting-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }>
  | Readonly<{ kind: "invalid-random-domain-label"; reason: "non-string" | "empty" | "too-long" | "non-printable-ascii" | "candidate-data" }>
  | Readonly<{ kind: "invalid-semantic-key"; reason: "non-string" | "empty" | "too-long" | "non-printable-ascii" | "candidate-data" }>
  | Readonly<{ kind: "candidate-identity-contamination"; location: "coordinate" | "random-domain-label" | "semantic-key" | "canonical-bytes" | "view-state" | "dependency" }>
  | Readonly<{ kind: "invalid-unpaired-event-key"; reason: "missing-prefix" | "empty-event-kind" | "invalid-event-kind" | "candidate-data" }>
  | Readonly<{ kind: "canonical-encoding-failure"; field: "prefix" | "tag" | "length" | "payload" }>
  | Readonly<{ kind: "arithmetic-range-failure"; field: "ply" | "tlv-length" | "uint53" | "value" }>;

export type CanonicalRandomDomainLabelResult =
  | Readonly<{ ok: true; value: CanonicalRandomDomainLabel }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CanonicalSemanticKeyResult =
  | Readonly<{ ok: true; value: CanonicalSemanticKey }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CrnCoordinateCreationResult =
  | Readonly<{ ok: true; value: CrnCoordinate }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CrnViewCreationResult =
  | Readonly<{ ok: true; view: CrnView }>
  | Readonly<{ ok: false; failure: CrnFailure }>;
export type CrnViewInput = Readonly<{
  coordinate: CrnCoordinate;
  randomDomain: CanonicalRandomDomain;
}>;

export type RolloutPolicyDecisionContext = Readonly<{
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
}>;

export type TeamUtility = -3 | -2 | -1 | 1 | 2 | 3;

export type TeamUtilityInput = Readonly<{
  perspectiveSeat: PublicSeat;
  finishOrder: readonly PublicSeat[];
}>;

export type LeafEvaluationInput = Readonly<{
  perspectiveSeat: PublicSeat;
  actingSeat: PublicSeat;
  finishOrder: readonly PublicSeat[];
  handCounts: Readonly<Record<PublicSeat, number>>;
}>;

export type TeamUtilityFailure =
  | { kind: "invalid-perspective-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }
  | { kind: "invalid-finish-order"; reason: "duplicate-seat" | "missing-seat" | "unknown-seat" }
  | { kind: "unsupported-team-pair"; teamSeats: readonly PublicSeat[] };

export type LeafEvaluationFailure =
  | { kind: "invalid-perspective-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" }
  | { kind: "invalid-acting-seat"; reason: "unknown-seat" | "fractional-seat" | "unsafe-integer-seat" | "negative-zero-seat" | "finished-seat" }
  | { kind: "invalid-leaf-state"; reason: "duplicate-finish" | "unknown-seat" | "negative-hand-count" | "non-finite-hand-count" | "fractional-hand-count" | "unsafe-hand-count" | "negative-zero-hand-count" | "unfinished-zero-hand-count" | "missing-hand-count" | "unknown-hand-count" | "finish-hand-count-mismatch" | "terminal-state" };

export type RolloutPolicyFailure =
  | { kind: "invalid-policy-context"; field: "observation"; reason: "malformed-observation" }
  | {
      kind: "invalid-policy-context";
      field: "publicHistoryEvents[].publicCardIds";
      reason: "foreign-card-id" | "duplicate-card-id" | "cross-event-duplicate-card-id" | "acting-hand-overlap" | "non-play-event-card-ids";
    }
  | { kind: "invalid-policy-context"; field: "ply"; reason: "invalid-ply" }
  | { kind: "invalid-policy-context"; field: "actingSeat"; reason: "invalid-acting-seat" }
  | { kind: "no-legal-action"; actingSeat: PublicSeat }
  | {
      kind: "crn-failure";
      field: "coordinate" | "randomDomain" | "view" | "value";
      reason: "construction-failed" | "throwing-value" | "non-finite-value" | "out-of-range-value";
    };

export type RolloutScenarioProjectionMismatchField =
  | "publicReplayContext.initialLedger.gameId"
  | "publicReplayContext.initialLedger.roundIdentity"
  | "publicReplayContext.initialLedger.handIdentity"
  | "publicReplayContext.initialLedger.currentTrick.leadSeat"
  | "publicReplayContext.initialLedger.publicTributeEvents"
  | "publicReplayContext.finalLedger.gameId"
  | "publicReplayContext.finalLedger.roundIdentity"
  | "publicReplayContext.finalLedger.handIdentity"
  | "publicReplayContext.finalLedger.lastAppliedEventIndex"
  | "publicReplayContext.finalLedger.nextEventIndex"
  | "publicReplayContext.finalLedger.handCounts"
  | "publicReplayContext.finalLedger.finishOrder"
  | "publicReplayContext.finalLedger.currentTrick.trickIndex"
  | "publicReplayContext.finalLedger.currentTrick.leadSeat"
  | "publicReplayContext.finalLedger.currentTrick.lastPlaySeat"
  | "publicReplayContext.finalLedger.currentTrick.lastPlayStableKey"
  | "publicReplayContext.finalLedger.currentTrick.passSeats"
  | "publicReplayContext.finalLedger.playedCardIds"
  | "publicReplayContext.finalLedger.revealedTransferEvents"
  | "publicReplayContext.publicHistoryEvents"
  | "canonicalPublicLedgerHash(publicReplayContext.finalLedger)"
  | "scenario.privateState.ledger"
  | "scenario.privateState.handCounts"
  | "scenario.privateState.finishOrder"
  | "scenario.privateState.currentTrick"
  | "scenario.privateState.currentLastPlay"
  | "scenario.privateState.revealedTransferEvents"
  | "scenario.privateState.publicPlayedCardIds"
  | "scenario.privateState.hands"
  | "publicState.gameRank"
  | "publicState.actingSeat"
  | "publicState.handCounts"
  | "publicState.finishOrder"
  | "publicState.publicPlayedCardIds"
  | "publicState.currentLastPlay"
  | "publicState.currentLastPlaySeat";

export type RolloutKernelFailure =
  | {
      kind: "simulation-failed";
      stage: "input";
      reason: "malformed-envelope" | "invalid-budget" | "invalid-root-identity" | "invalid-public-state" | "invalid-candidate";
    }
  | { kind: "simulation-failed"; stage: "replay"; reason: "invalid-scenario" | "invalid-replay-context" }
  | { kind: "simulation-failed"; stage: "replay"; reason: "scenario-projection-mismatch"; field: RolloutScenarioProjectionMismatchField }
  | { kind: "simulation-failed"; stage: "root-action"; reason: "illegal-action" }
  | { kind: "simulation-failed"; stage: "policy-action"; reason: "illegal-action" }
  | { kind: "simulation-failed"; stage: "crn"; reason: "coordinate" | "random-domain" | "view" }
  | {
      kind: "simulation-failed";
      stage: "transition";
      reason: "invalid-action-transition" | "invalid-pass-quorum" | "public-history-not-append-only";
    }
  | { kind: "simulation-failed"; stage: "state-conservation"; reason: Exclude<StateConservationFailure["reason"], "invalid-action-transition" | "invalid-pass-quorum" | "public-history-not-append-only"> }
  | { kind: "simulation-failed"; stage: "terminal-projection"; reason: "invalid-finish-order" | "utility-failed" }
  | { kind: "policy-failed"; failure: RolloutPolicyFailure }
  | { kind: "budget-exhausted"; workUnits: number; maximumWorkUnits: number };

export type RolloutAggregationFailure =
  | { kind: "non-finite-aggregate"; field: "expectedUtility" | "variance" | "risk" }
  | { kind: "coverage-mismatch"; expected: number; actual: number }
  | { kind: "empty-replicate-set"; candidateId: string }
  | { kind: "work-unit-overflow" };

export type RolloutRequestField =
  | "request"
  | "schemaVersion"
  | "mode"
  | "formalExecutionAllowed"
  | "rootIdentity"
  | "scenarioSourceInput"
  | "candidates"
  | "budget"
  | "limits"
  | "evidenceRequirements"
  | "riskPolicy"
  | "policyId"
  | "assemblyInput"
  | "requestInput"
  | "candidateSummaries"
  | "ranking"
  | "aggregateDiagnostics";

export type RolloutFailure =
  | { kind: "invalid-request"; field: RolloutRequestField }
  | { kind: "invalid-budget"; field: "replicateCountPerScenario" | "maxPliesPerReplicate" | "maxPolicyActionEvaluationsPerPly" | "maxWorkUnits" }
  | { kind: "invalid-risk-policy"; field: "variancePenalty" | "downsideRiskPenalty" }
  | { kind: "invalid-evidence-requirements"; field: "minimumEffectiveSampleSize" | "minimumAcceptedScenarioCount" | "minimumCompletedReplicateCount" }
  | { kind: "fake-or-unknown-particle-bank" }
  | { kind: "scenario-source-failed"; reason: "ledger-mismatch" | "replay-context-missing" | "private-state-invalid" }
  | { kind: "effective-sample-size-too-low"; effectiveSampleSize: number; minimumEffectiveSampleSize: number }
  | { kind: "insufficient-scenarios"; acceptedScenarioCount: number; minimumAcceptedScenarioCount: number }
  | { kind: "insufficient-replicates"; completedReplicateCount: number; minimumCompletedReplicateCount: number }
  | { kind: "coverage-mismatch"; expectedCoverage: number; actualCoverage: number }
  | { kind: "kernel-failed"; failure: RolloutKernelFailure }
  | { kind: "aggregation-failed"; failure: RolloutAggregationFailure };

export type RolloutPolicyResult =
  | { ok: true; action: RolloutAction }
  | { ok: false; failure: RolloutPolicyFailure };

export type TeamUtilityResult =
  | { ok: true; utility: TeamUtility }
  | { ok: false; failure: TeamUtilityFailure };

export type LeafEvaluationResult =
  | { ok: true; predictedFinishOrder: readonly PublicSeat[]; utility: TeamUtility }
  | { ok: false; failure: LeafEvaluationFailure };

export type RolloutReplicateResult =
  | { ok: true; candidateId: string; scenarioIdentity: string; replicateIdentity: string; utility: TeamUtility; workUnits: number }
  | { ok: false; failure: RolloutKernelFailure };

export type CandidateRolloutSummary = Readonly<{
  candidateId: string;
  riskAdjustedUtility: number;
  expectedUtility: number;
  variance: number;
  risk: number;
  baselineEvaluatorScore: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  expectedReplicateCount: number;
  completedReplicateCount: number;
  workUnitCount: number;
}>;

export type RolloutAggregateDiagnostics = Readonly<{
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  completedReplicateCount: number;
  expectedCompletedReplicateCount: number;
  candidateCount: number;
  workUnitCount: number;
  coverage: "complete";
}>;

export type RolloutAggregationResult =
  | { ok: true; summary: CandidateRolloutSummary }
  | { ok: false; failure: RolloutAggregationFailure };

export type RolloutRequest = Readonly<{
  schemaVersion: "d2f-rollout-request-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  rootIdentity: string;
  scenarioSourceInput: RolloutScenarioSourceInput;
  candidates: readonly RolloutCandidate[];
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  evidenceRequirements: RolloutEvidenceRequirements;
  riskPolicy: RolloutRiskPolicy;
  policyId: RolloutPolicyId;
}>;

export type RolloutResult = Readonly<{
  schemaVersion: "d2f-rollout-result-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  policyId: RolloutPolicyId;
  rootDigest: string;
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;

export type RolloutResultAssemblyInput = Readonly<{
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;

export type RolloutResultOutcome =
  | Readonly<{ ok: true; result: RolloutResult }>
  | Readonly<{ ok: false; failure: RolloutFailure }>;

export type RolloutExecutionResult = RolloutResultOutcome;

export type D2FShadowFallbackReason =
  | "snapshot-failed"
  | "candidate-failed"
  | "particle-bank-failed"
  | "request-failed"
  | "scenario-source-failed"
  | "evidence-failed"
  | "simulation-failed"
  | "budget-exhausted"
  | "aggregation-failed"
  | "ranking-failed"
  | "result-assembly-failed"
  | "unexpected-failure";

export type D2FShadowSemanticBudgetUsage = Readonly<{
  replicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  workUnitCount: number;
}>;

export type D2FShadowParticleBankConfig = Readonly<{
  schemaVersion: "d2-particle-bank-build-input-v1";
  particleCount: 1;
  maxSamplingAttempts: 1;
  maxIndexDraws: 1;
  samplerConfigVersion: "d2-particle-sampler-v1";
  likelihoodConfig: Readonly<{
    schemaVersion: "d2-particle-likelihood-v1";
    forcedPassLogFactor: -1;
    couldBeatButPassedLogFactor: -0.25;
    observedLeadPlayLogFactor: -0.1;
    observedFollowPlayLogFactor: -0.2;
    degradedEssThreshold: 1;
    normalizationTolerance: 0.000001;
    essTolerance: 0.000001;
  }>;
}>;

export type D2FShadowPreActionSnapshot = Readonly<{
  schemaVersion: "d2f-shadow-pre-action-snapshot-v1";
  publicIdentity: PublicGameIdentity;
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  publicHistoryEvents: readonly PublicActionEvent[];
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  actingSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  publicState: RolloutPublicState;
  currentTrick: Readonly<{
    leadSeat: PublicSeat | null;
    lastPlay: Readonly<CardGroup> | null;
    lastPlaySeat: PublicSeat | null;
    passSeats: readonly PublicSeat[];
  }>;
  candidates: readonly RolloutCandidate[];
  selectedCandidateId: string;
  particleBankConfig: D2FShadowParticleBankConfig;
  particleBankBaseLedger: HardPublicLedger;
  particleBankPendingPublicEvents: readonly PublicActionEvent[];
  expectedFinalEventIndex: number;
  expectedFinalPublicLedgerHash: string;
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  evidenceRequirements: RolloutEvidenceRequirements;
  riskPolicy: RolloutRiskPolicy;
  rootIdentity: RolloutReplayContextIdentity;
}>;

export type D2FShadowCandidateProjection = Readonly<{
  candidates: readonly RolloutCandidate[];
  selectedCandidateId: string;
}>;

export type D2FShadowSnapshotFailure = Readonly<{
  kind: "invalid-room-projection" | "invalid-public-replay" | "invalid-candidate-projection" | "invalid-particle-config" | "invalid-budget" | "root-identity-failed";
}>;

export type D2FShadowCandidateFailure = Readonly<{
  kind: "empty-candidates" | "invalid-candidate" | "non-finite-score" | "duplicate-candidate-id" | "selected-candidate-missing";
}>;

export type D2FShadowSnapshotResult =
  | Readonly<{ ok: true; value: D2FShadowPreActionSnapshot }>
  | Readonly<{ ok: false; failure: D2FShadowSnapshotFailure }>;

export type D2FShadowCandidateResult =
  | Readonly<{ ok: true; value: D2FShadowCandidateProjection }>
  | Readonly<{ ok: false; failure: D2FShadowCandidateFailure }>;

export type D2FShadowEvidence =
  | Readonly<{
      schemaVersion: "d2f-shadow-v3";
      status: "success";
      decisionIdentity: string;
      formalCandidateId: string;
      shadowTopCandidateId: string | null;
      agreement: boolean;
      ranking: readonly string[];
      aggregateDiagnostics: RolloutAggregateDiagnostics;
      policyId: "d2f-lightweight-v1";
      baselineActionIdentity: string;
      d2fRecommendedActionIdentity: string | null;
      riskAdjustedUtilityDelta: number | null;
      expectedUtilityDelta: number | null;
      baselineEvaluatorScore: number;
      effectiveSampleSize: number;
      acceptedScenarioCount: number;
      replicateCountPerScenario: number;
      completedReplicateCount: number;
      workUnitCount: number;
      fallbackReason: "none";
      semanticBudgetUsage: D2FShadowSemanticBudgetUsage;
      elapsedWallClockMs: number;
    }>
  | Readonly<{
      schemaVersion: "d2f-shadow-v3";
      status: "failure";
      decisionIdentity: string | null;
      formalCandidateId: string | null;
      shadowTopCandidateId: null;
      agreement: "unavailable";
      ranking: readonly [];
      aggregateDiagnostics: null;
      policyId: "d2f-lightweight-v1";
      baselineActionIdentity: string | null;
      d2fRecommendedActionIdentity: null;
      riskAdjustedUtilityDelta: null;
      expectedUtilityDelta: null;
      baselineEvaluatorScore: number | null;
      effectiveSampleSize: null;
      acceptedScenarioCount: null;
      replicateCountPerScenario: null;
      completedReplicateCount: null;
      workUnitCount: null;
      fallbackReason: D2FShadowFallbackReason;
      semanticBudgetUsage: null;
      elapsedWallClockMs: number | null;
    }>;

export type RolloutContractResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; failure: RolloutFailure }>;

export type RolloutReplayContextInput = Readonly<{
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  actingSeat: PublicSeat;
  publicState: RolloutPublicState;
  particleBankSnapshot: ParticleSnapshotIdentity;
}>;

const GROUP_TYPES: readonly GroupType[] = [
  "single", "pair", "triple", "full-house", "straight", "consecutive-pairs", "plate", "bomb", "straight-flush", "joker-bomb",
];
const GROUP_PURPOSES: readonly GroupPurpose[] = ["attack", "engine", "recovery", "tail-control", "risk", "filler"];
const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];
const UINT32_MAX = 0xffffffff;
const CARD_SUIT_CODES: Readonly<Record<string, string>> = {
  spades: "S",
  clubs: "C",
  hearts: "H",
  diamonds: "D",
};
const PUBLIC_STATE_KEYS = [
  "gameRank", "actingSeat", "perspectiveSeat", "partnerSeat", "handCounts", "finishOrder",
  "publicPlayedCardIds", "currentLastPlay", "currentLastPlaySeat",
] as const;
const SOURCE_INPUT_KEYS = [
  "bank", "publicHistoryEvents", "initialLedger", "finalLedger", "gameRank", "perspectiveSeat", "ownCurrentHand", "publicState",
] as const;
const LEDGER_KEYS = [
  "schemaVersion", "gameId", "roundIdentity", "handIdentity", "nextEventIndex", "lastAppliedEventIndex", "seenEventHashes",
  "playedCardIds", "revealedTransferEvents", "handCounts", "currentTrick", "finishOrder", "publicTributeEvents", "recentActionSummaries",
] as const;
const SNAPSHOT_KEYS = [
  "gameId", "roundIdentity", "handIdentity", "initialLedgerHash", "lastAppliedEventIndex", "ledgerHash", "perspectiveSeat", "gameRank",
] as const;
const PARTICLE_BANK_ESS_EQUALITY_TOLERANCE = 1e-9;
const REQUEST_KEYS = [
  "schemaVersion", "mode", "formalExecutionAllowed", "rootIdentity", "scenarioSourceInput", "candidates", "budget", "limits",
  "evidenceRequirements", "riskPolicy", "policyId",
] as const;
const ASSEMBLY_KEYS = [
  "candidateSummaries", "ranking", "aggregateDiagnostics",
] as const;

export function canonicalActionIdentity(action: RolloutAction): CanonicalCandidateIdentity {
  assertRolloutAction(action);
  const writer = new CanonicalWriter();
  writer.writeString("d2f-candidate-action-identity-v1");
  writer.writeString(action.type);
  if (action.type === "play") {
    writer.writeString(action.group.type);
    writer.writeNumber(action.group.strength);
    writeSemanticCardList(writer, action.group.cards);
    writeSemanticCardList(writer, action.group.wildcards);
  }
  return sha256Bytes(writer.finish());
}

export function canonicalCandidateIdentity(action: RolloutAction): CanonicalCandidateIdentity {
  return canonicalActionIdentity(action);
}

export function canonicalScenarioIdentity(
  snapshot: ParticleSnapshotIdentity,
  scenario: ParticleScenario,
): CanonicalScenarioIdentity {
  return particleScenarioIdentity(snapshot, scenario);
}

export function canonicalReplicateIdentity(replicateOrdinal: number): CanonicalReplicateIdentity {
  if (!isNonNegativeSafeInteger(replicateOrdinal)) throw new RangeError("REPLICATE_ORDINAL_INVALID");
  const writer = new CanonicalWriter();
  writer.writeString("d2f-replicate-identity-v1");
  writer.writeInteger(replicateOrdinal);
  return sha256Bytes(writer.finish());
}

export function canonicalCandidateDecisionAssociationIdentity(input: Readonly<{
  rootIdentity: string;
  candidateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  semanticKey: string;
}>): CanonicalCandidateDecisionAssociationIdentity {
  if (!isPlainDataGraph(input) || !hasExactOwnDataKeys(input, ["rootIdentity", "candidateIdentity", "ply", "actingSeat", "semanticKey"])) {
    throw new RangeError("DECISION_IDENTITY_INVALID");
  }
  if (!isNonEmptyString(input.rootIdentity) || !isNonEmptyString(input.candidateIdentity) || !isNonNegativeSafeInteger(input.ply) || !isSeat(input.actingSeat) || !isNonEmptyString(input.semanticKey)) {
    throw new RangeError("DECISION_IDENTITY_INVALID");
  }
  const writer = new CanonicalWriter();
  writer.writeString("d2f-decision-identity-v1");
  writer.writeString(input.rootIdentity);
  writer.writeString(input.candidateIdentity);
  writer.writeInteger(input.ply);
  writer.writeUint8(input.actingSeat);
  writer.writeString(input.semanticKey);
  return sha256Bytes(writer.finish());
}

export function canonicalReplayContextIdentity(input: RolloutReplayContextInput): RolloutReplayContextIdentity {
  assertReplayContextInput(input);
  const writer = new CanonicalWriter();
  writer.writeString("d2f-replay-context-identity-v1");
  writer.writeString(canonicalPublicLedgerHash(input.initialLedger));
  writer.writeInteger(input.initialLedger.lastAppliedEventIndex);
  writer.writeString(canonicalPublicLedgerHash(input.finalLedger));
  writer.writeInteger(input.finalLedger.lastAppliedEventIndex);
  writer.writeUint32(input.publicHistoryEvents.length);
  for (const event of input.publicHistoryEvents) {
    writer.writeInteger(event.eventIndex);
    writer.writeString(event.publicPayloadHash);
  }
  writer.writeString(input.gameRank);
  writer.writeUint8(input.perspectiveSeat);
  writer.writeUint8(input.actingSeat);
  writeCardIds(writer, input.ownCurrentHand, true);
  writePublicState(writer, input.publicState);
  writeParticleSnapshot(writer, input.particleBankSnapshot);
  return sha256Bytes(writer.finish());
}

function rootDigestFromValidatedRootIdentity(identity: RootIdentity): RootDigest {
  const writer = new CanonicalWriter();
  writer.writeString("d2f-root-digest-v1");
  writer.writeString(identity);
  return sha256Bytes(writer.finish());
}

export function validateRolloutBudget(input: Readonly<{
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
}>): RolloutContractResult<ValidatedRolloutBudget> {
  let budgetInput: unknown;
  let limitsInput: unknown;
  try {
    if (!isPlainDataRecord(input, ["budget", "limits"])) return invalid("budget");
    budgetInput = getOwnDataProperty(input, "budget");
    limitsInput = getOwnDataProperty(input, "limits");
    if (!hasExactOwnDataKeys(budgetInput, [
      "replicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits",
    ]) || !hasExactOwnDataKeys(limitsInput, [
      "maxReplicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits",
    ])) return invalid("budget");
  } catch {
    return invalid("budget");
  }
  const budgetFields: readonly (keyof RolloutBudget)[] = [
    "replicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits",
  ];
  const limitFields: readonly (keyof RolloutBudgetLimits)[] = [
    "maxReplicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits",
  ];
  let budgetValues: RolloutBudget;
  let limitValues: RolloutBudgetLimits;
  try {
    budgetValues = {
      replicateCountPerScenario: getOwnDataProperty(budgetInput, "replicateCountPerScenario") as number,
      maxPliesPerReplicate: getOwnDataProperty(budgetInput, "maxPliesPerReplicate") as number,
      maxPolicyActionEvaluationsPerPly: getOwnDataProperty(budgetInput, "maxPolicyActionEvaluationsPerPly") as number,
      maxWorkUnits: getOwnDataProperty(budgetInput, "maxWorkUnits") as number,
    };
    limitValues = {
      maxReplicateCountPerScenario: getOwnDataProperty(limitsInput, "maxReplicateCountPerScenario") as number,
      maxPliesPerReplicate: getOwnDataProperty(limitsInput, "maxPliesPerReplicate") as number,
      maxPolicyActionEvaluationsPerPly: getOwnDataProperty(limitsInput, "maxPolicyActionEvaluationsPerPly") as number,
      maxWorkUnits: getOwnDataProperty(limitsInput, "maxWorkUnits") as number,
    };
  } catch {
    return invalid("budget");
  }
  for (const field of budgetFields) {
    if (!isPositiveSafeInteger(budgetValues[field])) return invalidBudget(field);
  }
  for (const field of limitFields) {
    if (!isPositiveSafeInteger(limitValues[field])) return invalidBudget(field === "maxReplicateCountPerScenario" ? "replicateCountPerScenario" : field);
  }
  if (budgetValues.replicateCountPerScenario > limitValues.maxReplicateCountPerScenario) return invalidBudget("replicateCountPerScenario");
  if (budgetValues.maxPliesPerReplicate > limitValues.maxPliesPerReplicate) return invalidBudget("maxPliesPerReplicate");
  if (budgetValues.maxPolicyActionEvaluationsPerPly > limitValues.maxPolicyActionEvaluationsPerPly) return invalidBudget("maxPolicyActionEvaluationsPerPly");
  if (budgetValues.maxWorkUnits > limitValues.maxWorkUnits) return invalidBudget("maxWorkUnits");

  const product = safeProduct([
    budgetValues.replicateCountPerScenario,
    budgetValues.maxPliesPerReplicate,
    budgetValues.maxPolicyActionEvaluationsPerPly,
  ]);
  if (product === undefined) return invalidBudget("maxWorkUnits");
  return {
    ok: true,
    value: deepFreeze({
      budget: budgetValues,
      limits: limitValues,
      maximumWorkUnits: Math.min(budgetValues.maxWorkUnits, product),
      validated: true,
    }),
  };
}

export function validateRolloutEvidenceRequirements(input: unknown): RolloutContractResult<RolloutEvidenceRequirements> {
  try {
    if (!isPlainDataGraph(input) || !hasExactOwnDataKeys(input, ["schemaVersion", "minimumEffectiveSampleSize", "minimumAcceptedScenarioCount", "minimumCompletedReplicateCount", "requireCompleteCoverage"])) return invalidEvidence("minimumEffectiveSampleSize");
    const schemaVersion = getOwnDataProperty(input, "schemaVersion");
    const minimumEffectiveSampleSize = getOwnDataProperty(input, "minimumEffectiveSampleSize");
    const minimumAcceptedScenarioCount = getOwnDataProperty(input, "minimumAcceptedScenarioCount");
    const minimumCompletedReplicateCount = getOwnDataProperty(input, "minimumCompletedReplicateCount");
    const requireCompleteCoverage = getOwnDataProperty(input, "requireCompleteCoverage");
    if (schemaVersion !== "d2f-rollout-evidence-requirements-v1" || requireCompleteCoverage !== true) return invalidEvidence("minimumEffectiveSampleSize");
    if (!isPositiveSafeInteger(minimumEffectiveSampleSize)) return invalidEvidence("minimumEffectiveSampleSize");
    if (!isPositiveSafeInteger(minimumAcceptedScenarioCount)) return invalidEvidence("minimumAcceptedScenarioCount");
    if (!isPositiveSafeInteger(minimumCompletedReplicateCount)) return invalidEvidence("minimumCompletedReplicateCount");
    const value: RolloutEvidenceRequirements = {
      schemaVersion: "d2f-rollout-evidence-requirements-v1",
      minimumEffectiveSampleSize,
      minimumAcceptedScenarioCount,
      minimumCompletedReplicateCount,
      requireCompleteCoverage: true,
    };
    return { ok: true, value: deepFreeze(value) };
  } catch {
    return invalidEvidence("minimumEffectiveSampleSize");
  }
}

export function validateRolloutRiskPolicy(input: unknown): RolloutContractResult<RolloutRiskPolicy> {
  try {
    if (!isPlainDataGraph(input) || !hasExactOwnDataKeys(input, ["schemaVersion", "variancePenalty", "downsideRiskPenalty"])) return invalidRisk("variancePenalty");
    const schemaVersion = getOwnDataProperty(input, "schemaVersion");
    const variancePenalty = getOwnDataProperty(input, "variancePenalty");
    const downsideRiskPenalty = getOwnDataProperty(input, "downsideRiskPenalty");
    if (schemaVersion !== "d2f-rollout-risk-policy-v1") return invalidRisk("variancePenalty");
    if (typeof variancePenalty !== "number" || !Number.isFinite(variancePenalty) || variancePenalty < 0) return invalidRisk("variancePenalty");
    if (typeof downsideRiskPenalty !== "number" || !Number.isFinite(downsideRiskPenalty) || downsideRiskPenalty < 0) return invalidRisk("downsideRiskPenalty");
    return { ok: true, value: deepFreeze({ schemaVersion, variancePenalty, downsideRiskPenalty }) };
  } catch {
    return invalidRisk("variancePenalty");
  }
}

export function createRolloutRequest(input: unknown): RolloutContractResult<RolloutRequest> {
  try {
    const envelopeFailure = requestEnvelopeFailure(input);
    if (envelopeFailure === "budget") return invalid("budget");
    if (envelopeFailure === "limits") return invalid("limits");
    if (envelopeFailure === "evidenceRequirements") return invalidEvidence("minimumEffectiveSampleSize");
    if (envelopeFailure === "riskPolicy") return invalidRisk("variancePenalty");
    if (envelopeFailure !== undefined) return invalid(envelopeFailure);
    return createRolloutRequestUnchecked(input);
  } catch {
    return invalid("request");
  }
}

function createRolloutRequestUnchecked(input: unknown): RolloutContractResult<RolloutRequest> {
  if (!isPlainDataRecord(input) || !hasExactOwnDataKeys(input, REQUEST_KEYS)) return invalid("request");
  if (input.policyId !== "d2f-lightweight-v1") return invalid("policyId");
  if (input.schemaVersion !== "d2f-rollout-request-v2") return invalid("schemaVersion");
  if (!isRolloutMode(input.mode)) return invalid("mode");
  if (input.formalExecutionAllowed !== false) return invalid("formalExecutionAllowed");
  if (!isRootIdentity(input.rootIdentity)) return invalid("rootIdentity");
  if (!isPlainDataArray(input.candidates) || input.candidates.length === 0) return invalid("candidates");

  const sourceInput = cloneScenarioSourceInput(input.scenarioSourceInput);
  if (sourceInput === undefined) return invalid("scenarioSourceInput");
  let derivedRootIdentity: RootIdentity;
  try {
    derivedRootIdentity = canonicalReplayContextIdentity({
      publicHistoryEvents: sourceInput.publicHistoryEvents,
      initialLedger: sourceInput.initialLedger,
      finalLedger: sourceInput.finalLedger,
      gameRank: sourceInput.gameRank,
      perspectiveSeat: sourceInput.perspectiveSeat,
      ownCurrentHand: sourceInput.ownCurrentHand,
      actingSeat: sourceInput.publicState.actingSeat,
      publicState: sourceInput.publicState,
      particleBankSnapshot: sourceInput.bank.snapshot,
    });
  } catch {
    return invalid("scenarioSourceInput");
  }
  if (input.rootIdentity !== derivedRootIdentity) return invalid("rootIdentity");

  const candidates: RolloutCandidate[] = [];
  const candidateIds = new Set<string>();
  for (const candidate of input.candidates) {
    if (!hasExactOwnDataKeys(candidate, ["candidateId", "action", "baselineEvaluatorScore"])) return invalid("candidates");
    let candidateId: unknown;
    let baselineEvaluatorScore: unknown;
    let actionInput: unknown;
    try {
      candidateId = getOwnDataProperty(candidate, "candidateId");
      baselineEvaluatorScore = getOwnDataProperty(candidate, "baselineEvaluatorScore");
      actionInput = getOwnDataProperty(candidate, "action");
    } catch {
      return invalid("candidates");
    }
    if (!isNonEmptyString(candidateId) || typeof baselineEvaluatorScore !== "number" || !Number.isFinite(baselineEvaluatorScore) || !isPlainDataGraph(actionInput)) return invalid("candidates");
    let action: RolloutAction;
    try {
      action = deepFreeze(structuredClone(actionInput) as RolloutAction);
      const canonical = canonicalActionIdentity(action);
      if (!isContextuallyLegalWildcardProjection(action, sourceInput.gameRank)) return invalid("candidates");
      if (candidateId !== canonical || candidateIds.has(canonical)) return invalid("candidates");
      candidateIds.add(canonical);
    } catch {
      return invalid("candidates");
    }
    candidates.push(deepFreeze({ candidateId, action, baselineEvaluatorScore }));
  }

  const budget = validateRolloutBudget({ budget: input.budget as RolloutBudget, limits: input.limits as RolloutBudgetLimits });
  if (!budget.ok) return budget;
  const evidence = validateRolloutEvidenceRequirements(input.evidenceRequirements);
  if (!evidence.ok) return evidence;
  if (evidence.value.minimumEffectiveSampleSize > budget.value.maximumWorkUnits) return invalidEvidence("minimumEffectiveSampleSize");
  if (evidence.value.minimumAcceptedScenarioCount > budget.value.maximumWorkUnits) return invalidEvidence("minimumAcceptedScenarioCount");
  if (evidence.value.minimumCompletedReplicateCount > budget.value.maximumWorkUnits) return invalidEvidence("minimumCompletedReplicateCount");
  const riskPolicy = validateRolloutRiskPolicy(input.riskPolicy);
  if (!riskPolicy.ok) return riskPolicy;

  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: "d2f-rollout-request-v2",
      mode: input.mode,
      formalExecutionAllowed: false,
      rootIdentity: derivedRootIdentity,
      scenarioSourceInput: sourceInput,
      candidates,
      budget: budget.value.budget,
      limits: budget.value.limits,
      evidenceRequirements: evidence.value,
      riskPolicy: riskPolicy.value,
      policyId: "d2f-lightweight-v1",
    }),
  };
}

function requestEnvelopeFailure(input: unknown): RolloutRequestField | undefined {
  if (!isPlainDataRecord(input)) return "request";
  const ownKeys = Reflect.ownKeys(input);
  const unexpected = ownKeys.find((key) => typeof key !== "string" || !REQUEST_KEYS.includes(key as (typeof REQUEST_KEYS)[number]));
  if (unexpected !== undefined) {
    return "request";
  }
  const missing = REQUEST_KEYS.find((key) => !ownKeys.includes(key));
  if (missing !== undefined) return missing;
  const nestedFields: readonly (readonly [string, RolloutRequestField])[] = [
    ["scenarioSourceInput", "scenarioSourceInput"],
    ["candidates", "candidates"],
    ["budget", "budget"],
    ["limits", "budget"],
    ["evidenceRequirements", "evidenceRequirements"],
    ["riskPolicy", "riskPolicy"],
  ];
  for (const [key, failureField] of nestedFields) {
    const value = getOwnDataProperty(input, key);
    if (!isPlainDataGraph(value)) return failureField;
  }
  return undefined;
}

export function createRolloutResult(requestInput: unknown, assemblyInput: unknown): RolloutContractResult<RolloutResult> {
  try {
    return createRolloutResultUnchecked(requestInput, assemblyInput);
  } catch {
    return invalid("assemblyInput");
  }
}

function createRolloutResultUnchecked(requestInput: unknown, assemblyInput: unknown): RolloutContractResult<RolloutResult> {
  let requestResult: RolloutContractResult<RolloutRequest>;
  try {
    requestResult = createRolloutRequest(requestInput);
  } catch {
    return invalid("requestInput");
  }
  if (!requestResult.ok) return requestResult;
  const validatedBudget = validateRolloutBudget({ budget: requestResult.value.budget, limits: requestResult.value.limits });
  if (!validatedBudget.ok) return invalid("requestInput");
  if (!isPlainDataGraph(assemblyInput) || !hasExactOwnDataKeys(assemblyInput, ASSEMBLY_KEYS)) return invalid("assemblyInput");

  let candidateSummariesInput: unknown;
  let rankingInput: unknown;
  let aggregateDiagnosticsInput: unknown;
  try {
    candidateSummariesInput = getOwnDataProperty(assemblyInput, "candidateSummaries");
    rankingInput = getOwnDataProperty(assemblyInput, "ranking");
    aggregateDiagnosticsInput = getOwnDataProperty(assemblyInput, "aggregateDiagnostics");
  } catch {
    return invalid("assemblyInput");
  }
  if (!isPlainDataArray(candidateSummariesInput) || candidateSummariesInput.length === 0 || !isPlainDataArray(rankingInput) || !isPlainDataGraph(aggregateDiagnosticsInput)) return invalid("assemblyInput");

  const requestCandidatesById = new Map(requestResult.value.candidates.map((candidate) => [candidate.candidateId, candidate] as const));
  const validatedAcceptedScenarioCount = requestResult.value.scenarioSourceInput.bank.summary.acceptedParticleCount;
  const validatedReplicateCountPerScenario = requestResult.value.budget.replicateCountPerScenario;
  const validatedEffectiveSampleSize = requestResult.value.scenarioSourceInput.bank.effectiveSampleSize;
  const expectedLocalCoverage = safeProduct([validatedAcceptedScenarioCount, validatedReplicateCountPerScenario]);
  if (expectedLocalCoverage === undefined) return invalid("candidateSummaries");

  const summaries: CandidateRolloutSummary[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < candidateSummariesInput.length; index += 1) {
    const summary = getOwnDataProperty(candidateSummariesInput, String(index));
    if (!isCandidateSummary(summary) || ids.has(summary.candidateId)) return invalid("candidateSummaries");
    const requestCandidate = requestCandidatesById.get(summary.candidateId);
    if (requestCandidate === undefined
      || !Object.is(summary.baselineEvaluatorScore, requestCandidate.baselineEvaluatorScore)
      || summary.acceptedScenarioCount !== validatedAcceptedScenarioCount
      || summary.replicateCountPerScenario !== validatedReplicateCountPerScenario
      || summary.expectedReplicateCount !== expectedLocalCoverage
      || summary.workUnitCount > validatedBudget.value.maximumWorkUnits) return invalid("candidateSummaries");
    if (summaries.length > 0 && compareCodeUnits(summaries[summaries.length - 1]!.candidateId, summary.candidateId) > 0) return invalid("candidateSummaries");
    ids.add(summary.candidateId);
    summaries.push(deepFreeze(structuredClone(summary)));
  }
  const requestCandidateIds = new Set(requestResult.value.candidates.map((candidate) => candidate.candidateId));
  if (ids.size !== requestCandidateIds.size || [...ids].some((candidateId) => !requestCandidateIds.has(candidateId))) return invalid("candidateSummaries");
  const maximumAggregateWorkUnits = safeProduct([requestCandidateIds.size, validatedBudget.value.maximumWorkUnits]);
  if (maximumAggregateWorkUnits === undefined) return invalid("aggregateDiagnostics");
  if (rankingInput.length !== requestCandidateIds.size) return invalid("ranking");
  const ranking: string[] = [];
  for (let index = 0; index < rankingInput.length; index += 1) {
    const id = getOwnDataProperty(rankingInput, String(index));
    if (typeof id !== "string" || !requestCandidateIds.has(id) || !ids.has(id) || ranking.includes(id)) return invalid("ranking");
    ranking.push(id);
  }
  if (!isAggregateDiagnostics(aggregateDiagnosticsInput, requestCandidateIds.size)) return invalid("aggregateDiagnostics");
  const aggregate = aggregateDiagnosticsInput as RolloutAggregateDiagnostics;
  const expectedAggregateCoverage = safeProduct([requestCandidateIds.size, expectedLocalCoverage]);
  if (expectedAggregateCoverage === undefined
    || aggregate.acceptedScenarioCount !== validatedAcceptedScenarioCount
    || aggregate.replicateCountPerScenario !== validatedReplicateCountPerScenario
    || Math.abs(aggregate.effectiveSampleSize - validatedEffectiveSampleSize) > PARTICLE_BANK_ESS_EQUALITY_TOLERANCE
    || aggregate.expectedCompletedReplicateCount !== expectedAggregateCoverage
    || summaries.some((summary) => summary.acceptedScenarioCount !== aggregate.acceptedScenarioCount || summary.replicateCountPerScenario !== aggregate.replicateCountPerScenario)) return invalid("aggregateDiagnostics");
  const summaryCompleted = safeSum(summaries.map((summary) => summary.completedReplicateCount));
  const summaryExpected = safeSum(summaries.map((summary) => summary.expectedReplicateCount));
  const summaryWork = safeSum(summaries.map((summary) => summary.workUnitCount));
  if (summaryCompleted === undefined || summaryExpected === undefined || summaryWork === undefined) return invalid("candidateSummaries");
  if (summaryWork > maximumAggregateWorkUnits) return invalid("aggregateDiagnostics");
  if (aggregate.completedReplicateCount !== summaryCompleted || aggregate.expectedCompletedReplicateCount !== summaryExpected || aggregate.workUnitCount !== summaryWork) return invalid("aggregateDiagnostics");
  const evidenceRequirements = requestResult.value.evidenceRequirements;
  if (aggregate.effectiveSampleSize < evidenceRequirements.minimumEffectiveSampleSize
    || aggregate.acceptedScenarioCount < evidenceRequirements.minimumAcceptedScenarioCount
    || aggregate.completedReplicateCount < evidenceRequirements.minimumCompletedReplicateCount
    || (evidenceRequirements.requireCompleteCoverage && aggregate.completedReplicateCount !== aggregate.expectedCompletedReplicateCount)) return invalid("aggregateDiagnostics");
  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: "d2f-rollout-result-v2",
      mode: requestResult.value.mode,
      formalExecutionAllowed: false,
      policyId: requestResult.value.policyId,
      rootDigest: rootDigestFromValidatedRootIdentity(requestResult.value.rootIdentity),
      candidateSummaries: summaries,
      ranking,
      aggregateDiagnostics: structuredClone(aggregateDiagnosticsInput) as RolloutAggregateDiagnostics,
    }),
  };
}

function isCandidateSummary(value: unknown): value is CandidateRolloutSummary {
  if (!isRecord(value) || !hasExactKeys(value, ["candidateId", "riskAdjustedUtility", "expectedUtility", "variance", "risk", "baselineEvaluatorScore", "acceptedScenarioCount", "replicateCountPerScenario", "expectedReplicateCount", "completedReplicateCount", "workUnitCount"]) || !isNonEmptyString(value.candidateId)) return false;
  for (const field of ["riskAdjustedUtility", "expectedUtility", "baselineEvaluatorScore"] as const) if (typeof value[field] !== "number" || !Number.isFinite(value[field])) return false;
  for (const field of ["variance", "risk"] as const) if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) return false;
  for (const field of ["acceptedScenarioCount", "replicateCountPerScenario", "expectedReplicateCount", "completedReplicateCount", "workUnitCount"] as const) {
    if (!isNonNegativeSafeInteger(value[field])) return false;
  }
  if (value.acceptedScenarioCount < 1 || value.replicateCountPerScenario < 1) return false;
  const total = safeProduct([value.acceptedScenarioCount, value.replicateCountPerScenario]);
  return total !== undefined && value.expectedReplicateCount === total && value.completedReplicateCount === total;
}

function isAggregateDiagnostics(value: unknown, candidateCount: number): value is RolloutAggregateDiagnostics {
  if (!isRecord(value) || !hasExactKeys(value, ["effectiveSampleSize", "acceptedScenarioCount", "replicateCountPerScenario", "completedReplicateCount", "expectedCompletedReplicateCount", "candidateCount", "workUnitCount", "coverage"]) || value.coverage !== "complete" || value.candidateCount !== candidateCount) return false;
  if (typeof value.effectiveSampleSize !== "number" || !Number.isFinite(value.effectiveSampleSize) || value.effectiveSampleSize < 0) return false;
  for (const field of ["acceptedScenarioCount", "replicateCountPerScenario", "completedReplicateCount", "expectedCompletedReplicateCount", "candidateCount", "workUnitCount"] as const) if (!isNonNegativeSafeInteger(value[field])) return false;
  if (value.acceptedScenarioCount < 1 || value.replicateCountPerScenario < 1 || !isPositiveSafeInteger(candidateCount)) return false;
  const total = safeProduct([value.acceptedScenarioCount, value.replicateCountPerScenario]);
  const expected = total === undefined ? undefined : safeProduct([candidateCount, total]);
  return total !== undefined
    && expected !== undefined
    && value.completedReplicateCount === expected
    && value.expectedCompletedReplicateCount === expected;
}

function cloneScenarioSourceInput(value: unknown): RolloutScenarioSourceInput | undefined {
  if (!isPlainDataGraph(value) || !isRecord(value) || !hasExactKeys(value, SOURCE_INPUT_KEYS)) return undefined;
  const bank = getOwnDataProperty(value, "bank");
  const bankValidation = validateParticleBankPublic(bank);
  if (!bankValidation.ok) return undefined;
  if (!RANKS.includes(value.gameRank as GameRank) || !isSeat(value.perspectiveSeat)) return undefined;
  const publicHistoryEvents = clonePublicHistoryEvents(value.publicHistoryEvents);
  const initialLedger = cloneHardPublicLedger(value.initialLedger);
  const finalLedger = cloneHardPublicLedger(value.finalLedger);
  const ownCurrentHand = cloneCardArray(value.ownCurrentHand);
  const publicState = clonePublicState(value.publicState);
  if (publicHistoryEvents === undefined || initialLedger === undefined || finalLedger === undefined || ownCurrentHand === undefined || publicState === undefined) return undefined;
  return deepFreeze({
    bank: bankValidation.bank,
    publicHistoryEvents,
    initialLedger,
    finalLedger,
    gameRank: value.gameRank,
    perspectiveSeat: value.perspectiveSeat,
    ownCurrentHand,
    publicState,
  }) as unknown as RolloutScenarioSourceInput;
}

function isPublicState(value: unknown): value is RolloutPublicState {
  if (!isPlainDataGraph(value) || !isRecord(value) || !hasExactKeys(value, PUBLIC_STATE_KEYS) || !RANKS.includes(value.gameRank as GameRank) || !isSeat(value.actingSeat) || !isSeat(value.perspectiveSeat) || !isSeat(value.partnerSeat) || value.partnerSeat !== partnerSeat(value.perspectiveSeat) || !isRecord(value.handCounts) || !hasExactKeys(value.handCounts, ["0", "1", "2", "3"]) || !isPlainDataArray(value.finishOrder) || !isPlainDataArray(value.publicPlayedCardIds)) return false;
  if (!SEATS.every((seat) => isNonNegativeSafeInteger(value.handCounts[String(seat)]))) return false;
  if (!value.finishOrder.every(isSeat) || new Set(value.finishOrder).size !== value.finishOrder.length) return false;
  if (!value.publicPlayedCardIds.every((id) => isCardIdentifier(id)) || new Set(value.publicPlayedCardIds).size !== value.publicPlayedCardIds.length) return false;
  const hasLastPlay = value.currentLastPlay !== null;
  if (hasLastPlay !== (value.currentLastPlaySeat !== null)) return false;
  if (!hasLastPlay) return true;
  if (!isSeat(value.currentLastPlaySeat)) return false;
  try {
    assertCardGroup(value.currentLastPlay);
    return true;
  } catch {
    return false;
  }
}

function clonePublicHistoryEvents(value: unknown): readonly PublicActionEvent[] | undefined {
  if (!isPlainDataArray(value)) return undefined;
  const events: PublicActionEvent[] = [];
  try {
    for (let index = 0; index < value.length; index += 1) {
      const event = getOwnDataProperty(value, String(index));
      if (!isPlainDataGraph(event)) return undefined;
      if (!isPublicEventSemanticShape(event as PublicActionEvent)) throw new TypeError("EVENT_SCHEMA_INVALID");
      assertFinalizedPublicActionEvent(event);
      verifyPublicActionEventHash(event);
      events.push(structuredClone(event) as PublicActionEvent);
    }
  } catch {
    return undefined;
  }
  return deepFreeze(events);
}

function cloneCardArray(value: unknown): readonly Card[] | undefined {
  if (!isPlainDataArray(value)) return undefined;
  const cards: Card[] = [];
  const ids = new Set<string>();
  try {
    for (let index = 0; index < value.length; index += 1) {
      const card = getOwnDataProperty(value, String(index));
      if (!isPlainDataGraph(card)) return undefined;
      assertRolloutCard(card);
      if (ids.has(card.id)) return undefined;
      ids.add(card.id);
      cards.push(cloneCard(card));
    }
  } catch {
    return undefined;
  }
  return deepFreeze(cards);
}

function cloneCard(card: Card): Card {
  return card.kind === "suited"
    ? { id: card.id, kind: card.kind, rank: card.rank, suit: card.suit, copy: card.copy }
    : { id: card.id, kind: card.kind, rank: card.rank, copy: card.copy };
}

function cloneCardGroup(value: unknown): CardGroup | undefined {
  if (!isPlainDataGraph(value)) return undefined;
  try {
    assertCardGroup(value);
  } catch {
    return undefined;
  }
  const group = value as CardGroup;
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

function clonePublicState(value: unknown): RolloutPublicState | undefined {
  if (!isPublicState(value)) return undefined;
  const clonedLastPlay = value.currentLastPlay === null ? null : cloneCardGroup(value.currentLastPlay);
  if (value.currentLastPlay !== null && clonedLastPlay === undefined) return undefined;
  const currentLastPlay: CardGroup | null = clonedLastPlay ?? null;
  return deepFreeze({
    gameRank: value.gameRank,
    actingSeat: value.actingSeat,
    perspectiveSeat: value.perspectiveSeat,
    partnerSeat: value.partnerSeat,
    handCounts: { 0: value.handCounts[0], 1: value.handCounts[1], 2: value.handCounts[2], 3: value.handCounts[3] },
    finishOrder: [...value.finishOrder],
    publicPlayedCardIds: [...value.publicPlayedCardIds],
    currentLastPlay,
    currentLastPlaySeat: value.currentLastPlaySeat,
  });
}

function cloneHardPublicLedger(value: unknown): HardPublicLedger | undefined {
  if (!isHardPublicLedger(value)) return undefined;
  const ledger = value as HardPublicLedger;
  const currentTrick: {
    trickIndex: number;
    leadSeat: PublicSeat;
    passSeats: readonly PublicSeat[];
    lastPlaySeat?: PublicSeat;
    lastPlayStableKey?: string;
  } = {
    trickIndex: ledger.currentTrick.trickIndex,
    leadSeat: ledger.currentTrick.leadSeat,
    passSeats: [...ledger.currentTrick.passSeats],
  };
  if (ledger.currentTrick.lastPlaySeat !== undefined) currentTrick.lastPlaySeat = ledger.currentTrick.lastPlaySeat;
  if (ledger.currentTrick.lastPlayStableKey !== undefined) currentTrick.lastPlayStableKey = ledger.currentTrick.lastPlayStableKey;
  const seenEventHashes: Record<string, string> = {};
  for (let index = 0; index <= ledger.lastAppliedEventIndex; index += 1) {
    const key = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(ledger.seenEventHashes, key);
    if (!isDataDescriptor(descriptor) || !isDigest(descriptor.value)) return undefined;
    seenEventHashes[key] = descriptor.value;
  }
  const revealedTransferEvents = ledger.revealedTransferEvents.map((event) => {
    const clone: { eventIndex: number; kind: "tribute" | "return"; fromSeat: PublicSeat; toSeat: PublicSeat; cardId?: string } = {
      eventIndex: event.eventIndex,
      kind: event.kind,
      fromSeat: event.fromSeat,
      toSeat: event.toSeat,
    };
    if (event.cardId !== undefined) clone.cardId = event.cardId;
    return clone;
  });
  const recentActionSummaries = ledger.recentActionSummaries.map((summary) => ({
    eventIndex: summary.eventIndex,
    kind: summary.kind,
    seat: summary.seat,
    trickIndex: summary.trickIndex,
    publicStableKey: summary.publicStableKey,
  }));
  return deepFreeze({
    schemaVersion: ledger.schemaVersion,
    gameId: ledger.gameId,
    roundIdentity: ledger.roundIdentity,
    handIdentity: ledger.handIdentity,
    nextEventIndex: ledger.nextEventIndex,
    lastAppliedEventIndex: ledger.lastAppliedEventIndex,
    seenEventHashes,
    playedCardIds: [...ledger.playedCardIds],
    revealedTransferEvents,
    handCounts: { 0: ledger.handCounts[0], 1: ledger.handCounts[1], 2: ledger.handCounts[2], 3: ledger.handCounts[3] },
    currentTrick,
    finishOrder: [...ledger.finishOrder],
    publicTributeEvents: [...ledger.publicTributeEvents],
    recentActionSummaries,
  });
}

function isParticleSnapshotIdentity(value: unknown): value is ParticleSnapshotIdentity {
  return isPlainDataGraph(value)
    && isRecord(value)
    && hasExactKeys(value, SNAPSHOT_KEYS)
    && isNonEmptyString(value.gameId)
    && isNonEmptyString(value.roundIdentity)
    && isNonEmptyString(value.handIdentity)
    && isDigest(value.initialLedgerHash)
    && isLedgerEventIndex(value.lastAppliedEventIndex)
    && isDigest(value.ledgerHash)
    && isSeat(value.perspectiveSeat)
    && RANKS.includes(value.gameRank as GameRank);
}

export function isHardPublicLedger(value: unknown): value is HardPublicLedger {
  if (!isRecord(value) || !hasExactKeys(value, LEDGER_KEYS) || value.schemaVersion !== "d2-public-ledger-v1" || !isNonEmptyString(value.gameId) || !isNonEmptyString(value.roundIdentity) || !isNonEmptyString(value.handIdentity) || !isLedgerEventIndex(value.lastAppliedEventIndex) || !isNonNegativeSafeInteger(value.nextEventIndex) || value.nextEventIndex !== value.lastAppliedEventIndex + 1 || !isRecord(value.seenEventHashes) || !isRecord(value.handCounts) || !hasExactKeys(value.handCounts, ["0", "1", "2", "3"]) || !isRecord(value.currentTrick) || !Array.isArray(value.playedCardIds) || !Array.isArray(value.revealedTransferEvents) || !Array.isArray(value.finishOrder) || !Array.isArray(value.publicTributeEvents) || !Array.isArray(value.recentActionSummaries)) return false;
  if (!isValidSeenEventHashes(value.seenEventHashes, value.lastAppliedEventIndex)) return false;
  if (!SEATS.every((seat) => isNonNegativeSafeInteger(value.handCounts[seat]))) return false;
  if (!value.playedCardIds.every(isCardIdentifier) || new Set(value.playedCardIds).size !== value.playedCardIds.length) return false;
  if (!isLedgerTrick(value.currentTrick) || !value.finishOrder.every(isSeat) || new Set(value.finishOrder).size !== value.finishOrder.length || !value.publicTributeEvents.every((event) => typeof event === "string" && event.length > 0) || !value.recentActionSummaries.every(isPublicSummary)) return false;
  return value.revealedTransferEvents.every(isRevealedTransfer);
}

function isLedgerTrick(value: unknown): value is HardPublicLedger["currentTrick"] {
  if (!isRecord(value) || !hasOnlyKeys(value, ["trickIndex", "leadSeat", "lastPlaySeat", "lastPlayStableKey", "passSeats"]) || !isNonNegativeSafeInteger(value.trickIndex) || !isSeat(value.leadSeat) || !Array.isArray(value.passSeats) || !value.passSeats.every(isSeat) || new Set(value.passSeats).size !== value.passSeats.length) return false;
  const hasSeat = value.lastPlaySeat !== undefined;
  const hasStableKey = value.lastPlayStableKey !== undefined;
  return hasSeat === hasStableKey && (!hasSeat || (isSeat(value.lastPlaySeat) && typeof value.lastPlayStableKey === "string" && value.lastPlayStableKey.length > 0));
}

function isRevealedTransfer(value: unknown): value is HardPublicLedger["revealedTransferEvents"][number] {
  if (!isRecord(value) || !hasOnlyKeys(value, ["eventIndex", "kind", "cardId", "fromSeat", "toSeat"]) || !isNonNegativeSafeInteger(value.eventIndex) || (value.kind !== "tribute" && value.kind !== "return") || !isSeat(value.fromSeat) || !isSeat(value.toSeat)) return false;
  return value.cardId === undefined || isCardIdentifier(value.cardId);
}

function isPublicSummary(value: unknown): value is Readonly<Record<string, string | number | boolean>> {
  return isRecord(value)
    && hasExactKeys(value, ["eventIndex", "kind", "seat", "trickIndex", "publicStableKey"])
    && isNonNegativeSafeInteger(value.eventIndex)
    && typeof value.kind === "string"
    && isSeat(value.seat)
    && isNonNegativeSafeInteger(value.trickIndex)
    && typeof value.publicStableKey === "string";
}

function isPublicEventSemanticShape(value: PublicActionEvent): boolean {
  const event = value as unknown as Record<string, unknown>;
  if (!isSeat(event.seat)) return false;
  for (const key of ["leadSeat", "lastPlaySeat", "fromSeat", "toSeat"] as const) {
    if (event[key] !== undefined && !isSeat(event[key])) return false;
  }
  if (!hasOnlyKeys(event, [
    "schemaVersion", "gameId", "roundIdentity", "handIdentity", "eventIndex", "kind", "seat", "publicStableKey", "trickIndex",
    "patternType", "groupType", "handCountBefore", "handCountAfter", "leadSeat", "lastPlaySeat", "usedWildcardCount", "usedBomb",
    "publicPayloadHash", "publicCardIds", "finishPosition", "remainingHandCount", "finishReason", "fromSeat", "toSeat", "handCountChanges", "reasonCode",
  ])) return false;
  for (const key of ["eventIndex", "trickIndex", "handCountBefore", "handCountAfter", "usedWildcardCount", "finishPosition", "remainingHandCount"] as const) {
    if (event[key] !== undefined && !isNonNegativeSafeInteger(event[key])) return false;
  }
  if (event.usedBomb !== undefined && typeof event.usedBomb !== "boolean") return false;
  if (event.kind === "play" || event.kind === "tribute" || event.kind === "return") {
    if (!Array.isArray(event.publicCardIds) || event.publicCardIds.some((id) => !isCardIdentifier(id)) || new Set(event.publicCardIds).size !== event.publicCardIds.length) return false;
  }
  if (event.kind === "tribute" || event.kind === "return") {
    const changes = event.handCountChanges;
    if (!isRecord(changes) || !hasExactKeys(changes, ["0", "1", "2", "3"]) || ![0, 1, 2, 3].every((seat) => isCanonicalSafeInteger(changes[seat]))) return false;
  }
  return true;
}

function isCardIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^(?:[SCHD](?:10|[AKQJ2-9])-[12]|Joker-(?:SJ|BJ)-[12])$/.test(value);
}

function isLedgerEventIndex(value: unknown): value is number {
  return isCanonicalSafeInteger(value) && value >= -1;
}

function isValidSeenEventHashes(value: unknown, lastAppliedEventIndex: number): value is Readonly<Record<number, string>> {
  try {
    if (!isRecord(value)) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== lastAppliedEventIndex + 1) return false;
    for (const key of ownKeys) {
      if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key)) return false;
      const index = Number(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Number.isSafeInteger(index) || index > lastAppliedEventIndex || !isDataDescriptor(descriptor) || !isDigest(descriptor.value)) return false;
    }
    for (let index = 0; index <= lastAppliedEventIndex; index += 1) {
      if (!ownKeys.includes(String(index))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function assertCardGroup(value: unknown): asserts value is CardGroup {
  assertRolloutAction({ type: "play", group: value as CardGroup });
}

function partnerSeat(seat: PublicSeat): PublicSeat {
  return ((seat + 2) % 4) as PublicSeat;
}

function assertReplayContextInput(input: RolloutReplayContextInput): void {
  if (!isPlainDataGraph(input) || !isRecord(input) || !isPlainDataArray(input.publicHistoryEvents) || !isHardPublicLedger(input.initialLedger) || !isHardPublicLedger(input.finalLedger) || !RANKS.includes(input.gameRank) || !isSeat(input.perspectiveSeat) || !isSeat(input.actingSeat) || !isPlainDataArray(input.ownCurrentHand) || !isPublicState(input.publicState) || !isParticleSnapshotIdentity(input.particleBankSnapshot)) throw new TypeError("REPLAY_CONTEXT_INVALID");
  const events = clonePublicHistoryEvents(input.publicHistoryEvents);
  const initialLedger = cloneHardPublicLedger(input.initialLedger);
  const finalLedger = cloneHardPublicLedger(input.finalLedger);
  const ownCurrentHand = cloneCardArray(input.ownCurrentHand);
  const publicState = clonePublicState(input.publicState);
  if (events === undefined || initialLedger === undefined || finalLedger === undefined || ownCurrentHand === undefined || publicState === undefined) throw new TypeError("REPLAY_CONTEXT_INVALID");
  if (publicState.gameRank !== input.gameRank || publicState.perspectiveSeat !== input.perspectiveSeat || publicState.actingSeat !== input.actingSeat || publicState.partnerSeat !== partnerSeat(input.perspectiveSeat)) throw new TypeError("REPLAY_CONTEXT_INVALID");
  if (!SEATS.every((seat) => publicState.handCounts[seat] === finalLedger.handCounts[seat])
    || publicState.publicPlayedCardIds.length !== finalLedger.playedCardIds.length
    || !publicState.publicPlayedCardIds.every((id, index) => id === finalLedger.playedCardIds[index])
    || publicState.finishOrder.length !== finalLedger.finishOrder.length
    || !publicState.finishOrder.every((seat, index) => seat === finalLedger.finishOrder[index])) throw new TypeError("REPLAY_CONTEXT_INVALID");
  if (!validatePublicConsistency(events, finalLedger, publicState)
    || !matchesLedgerIdentity(initialLedger, finalLedger, input.particleBankSnapshot, input.gameRank, input.perspectiveSeat)
    || !matchesHistoryShape(events, initialLedger, finalLedger)
    || deriveActingSeat(events, finalLedger) !== input.actingSeat) throw new TypeError("REPLAY_CONTEXT_INVALID");
}

function validatePublicConsistency(
  events: readonly PublicActionEvent[],
  finalLedger: HardPublicLedger,
  publicState: RolloutPublicState,
): boolean {
  const ledgerSeat = finalLedger.currentTrick.lastPlaySeat;
  const ledgerStableKey = finalLedger.currentTrick.lastPlayStableKey;
  const stateHasLastPlay = publicState.currentLastPlay !== null;
  if (stateHasLastPlay !== (publicState.currentLastPlaySeat !== null)) return false;
  if (stateHasLastPlay !== (ledgerSeat !== undefined && ledgerStableKey !== undefined)) return false;
  if (stateHasLastPlay && (publicState.currentLastPlaySeat !== ledgerSeat || ledgerStableKey === undefined)) return false;

  let lastPlayIndex = -1;
  let lastTrickClearIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.kind === "play") lastPlayIndex = index;
    if (event.kind === "trick-clear") lastTrickClearIndex = index;
  }
  if (lastPlayIndex <= lastTrickClearIndex) return !stateHasLastPlay;
  const lastPlay = events[lastPlayIndex]!;
  if (lastPlay.kind !== "play" || ledgerSeat !== lastPlay.seat || ledgerStableKey !== lastPlay.publicStableKey || finalLedger.currentTrick.trickIndex !== lastPlay.trickIndex) return false;
  if (!stateHasLastPlay || publicState.currentLastPlay === null) return false;
  const group = publicState.currentLastPlay as CardGroup;
  if (group.type !== lastPlay.groupType || group.type !== lastPlay.patternType || playPublicStableKey(group.cards.map((card) => card.id)) !== lastPlay.publicStableKey) return false;
  if (group.cards.length !== lastPlay.publicCardIds.length || new Set(group.cards.map((card) => card.id)).size !== group.cards.length || !lastPlay.publicCardIds.every((id) => group.cards.some((card) => card.id === id))) return false;
  return lastPlay.usedWildcardCount === undefined || group.wildcards.length === lastPlay.usedWildcardCount;
}

function matchesLedgerIdentity(initialLedger: HardPublicLedger, finalLedger: HardPublicLedger, snapshot: ParticleSnapshotIdentity, gameRank: GameRank, perspectiveSeat: PublicSeat): boolean {
  return initialLedger.gameId === finalLedger.gameId
    && initialLedger.roundIdentity === finalLedger.roundIdentity
    && initialLedger.handIdentity === finalLedger.handIdentity
    && snapshot.gameId === initialLedger.gameId
    && snapshot.roundIdentity === initialLedger.roundIdentity
    && snapshot.handIdentity === initialLedger.handIdentity
    && snapshot.initialLedgerHash === canonicalPublicLedgerHash(initialLedger)
    && snapshot.ledgerHash === canonicalPublicLedgerHash(finalLedger)
    && snapshot.lastAppliedEventIndex === finalLedger.lastAppliedEventIndex
    && snapshot.gameRank === gameRank
    && snapshot.perspectiveSeat === perspectiveSeat;
}

function matchesHistoryShape(events: readonly PublicActionEvent[], initialLedger: HardPublicLedger, finalLedger: HardPublicLedger): boolean {
  if (!isInitialOpeningLedger(initialLedger)) return false;
  if (events.length === 0) return finalLedger.lastAppliedEventIndex === -1 && finalLedger.nextEventIndex === 0 && canonicalPublicLedgerHash(initialLedger) === canonicalPublicLedgerHash(finalLedger);
  if (events[0]?.eventIndex !== 0 || events[events.length - 1]?.eventIndex !== finalLedger.lastAppliedEventIndex || finalLedger.nextEventIndex !== finalLedger.lastAppliedEventIndex + 1) return false;
  if (!events.every((event, index) => event.eventIndex === index
    && event.gameId === finalLedger.gameId
    && event.roundIdentity === finalLedger.roundIdentity
    && event.handIdentity === finalLedger.handIdentity
    && finalLedger.seenEventHashes[event.eventIndex] === event.publicPayloadHash)) return false;
  if (!matchesOpeningTransferHistory(events, initialLedger)) return false;
  let replayedLedger = initialLedger;
  for (const event of events) {
    const applied = applyPublicEvent(replayedLedger, event);
    if (!applied.ok || applied.kind !== "applied") return false;
    replayedLedger = applied.ledger;
  }
  return canonicalPublicLedgerHash(replayedLedger) === canonicalPublicLedgerHash(finalLedger);
}

function matchesOpeningTransferHistory(events: readonly PublicActionEvent[], initialLedger: HardPublicLedger): boolean {
  let ordinaryActionIndex = events.findIndex((event) => event.kind !== "tribute" && event.kind !== "return" && event.kind !== "anti-tribute");
  if (ordinaryActionIndex < 0) ordinaryActionIndex = events.length;
  if (events.slice(ordinaryActionIndex).some((event) => event.kind === "tribute" || event.kind === "return" || event.kind === "anti-tribute")) return false;
  const openingEvents = events.slice(0, ordinaryActionIndex);
  if (openingEvents.length === 0) return true;
  if (openingEvents.length === 1 && openingEvents[0]!.kind === "anti-tribute") {
    const event = openingEvents[0]!;
    return event.seat === initialLedger.currentTrick.leadSeat
      && event.trickIndex === initialLedger.currentTrick.trickIndex
      && event.publicStableKey === "anti-tribute:anti-tribute";
  }
  if (openingEvents.some((event) => event.kind === "anti-tribute")) return false;
  let returnStarted = false;
  let tributeCount = 0;
  let returnCount = 0;
  for (const event of openingEvents) {
    if (event.kind === "tribute") {
      if (returnStarted || !isOpeningTransferEvent(event, initialLedger)) return false;
      tributeCount += 1;
      continue;
    }
    if (event.kind !== "return" || !isOpeningTransferEvent(event, initialLedger)) return false;
    returnStarted = true;
    returnCount += 1;
  }
  return tributeCount > 0 && tributeCount === returnCount;
}

function isOpeningTransferEvent(event: Extract<PublicActionEvent, { kind: "tribute" | "return" }>, initialLedger: HardPublicLedger): boolean {
  if (event.seat !== event.fromSeat || event.fromSeat === event.toSeat || event.trickIndex !== initialLedger.currentTrick.trickIndex || !event.publicStableKey.startsWith(`${event.kind}:${event.fromSeat}:${event.toSeat}:`)) return false;
  const expectedChanges: Record<PublicSeat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  expectedChanges[event.fromSeat] = -1;
  expectedChanges[event.toSeat] = 1;
  return SEATS.every((seat) => event.handCountChanges[seat] === expectedChanges[seat]);
}

function isInitialOpeningLedger(ledger: HardPublicLedger): boolean {
  return ledger.lastAppliedEventIndex === -1
    && ledger.nextEventIndex === 0
    && isValidSeenEventHashes(ledger.seenEventHashes, -1)
    && ledger.playedCardIds.length === 0
    && ledger.revealedTransferEvents.length === 0
    && ledger.finishOrder.length === 0
    && ledger.publicTributeEvents.length === 1
    && ledger.publicTributeEvents.every((event) => typeof event === "string" && event.length > 0)
    && ledger.handCounts[0] + ledger.handCounts[1] + ledger.handCounts[2] + ledger.handCounts[3] === 108
    && ledger.currentTrick.passSeats.length === 0
    && ledger.currentTrick.lastPlaySeat === undefined
    && ledger.currentTrick.lastPlayStableKey === undefined
    && ledger.recentActionSummaries.length === 0;
}

function deriveActingSeat(events: readonly PublicActionEvent[], ledger: HardPublicLedger): PublicSeat | undefined {
  if (events.length === 0) return ledger.currentTrick.leadSeat;
  if (events.every((event) => event.kind === "tribute" || event.kind === "return" || event.kind === "anti-tribute")) return ledger.currentTrick.leadSeat;
  let actionIndex = events.length - 1;
  while (actionIndex >= 0 && events[actionIndex]!.kind === "finish") actionIndex -= 1;
  if (actionIndex < 0) return undefined;
  const last = events[actionIndex]!;
  if (last.kind === "trick-clear") return ledger.currentTrick.leadSeat;
  if (last.kind !== "play" && last.kind !== "pass" && last.kind !== "finish") return undefined;
  let next = ((last.seat + 3) % 4) as PublicSeat;
  for (let count = 0; count < 4; count += 1) {
    if (!ledger.finishOrder.includes(next)) return next;
    next = ((next + 3) % 4) as PublicSeat;
  }
  return undefined;
}

function writeCardIds(writer: CanonicalWriter, cards: readonly Card[], sort: boolean): void {
  const ids = cards.map((card) => {
    if (!isRecord(card) || typeof card.id !== "string" || card.id.length === 0) throw new TypeError("CARD_ID_INVALID");
    return card.id;
  });
  if (sort) ids.sort(compareCodeUnits);
  writer.writeUint32(ids.length);
  for (const id of ids) writer.writeString(id);
}

function writeSemanticCardList(writer: CanonicalWriter, cards: readonly Card[]): void {
  const sorted = [...cards].sort((left, right) => compareCodeUnits(left.id, right.id));
  writer.writeUint32(sorted.length);
  for (const card of sorted) writeSemanticCard(writer, card);
}

function writeSemanticCard(writer: CanonicalWriter, card: Card): void {
  writer.writeString(card.id);
  writer.writeString(card.kind);
  writer.writeString(card.rank);
  if (card.kind === "suited") writer.writeString(card.suit);
  writer.writeUint8(card.copy);
}

function writePublicState(writer: CanonicalWriter, state: RolloutPublicState): void {
  writer.writeString(state.gameRank);
  writer.writeUint8(state.actingSeat);
  writer.writeUint8(state.perspectiveSeat);
  writer.writeUint8(state.partnerSeat);
  for (const seat of SEATS) writer.writeInteger(state.handCounts[seat]);
  writer.writeUint32(state.finishOrder.length);
  for (const seat of state.finishOrder) writer.writeUint8(seat);
  writer.writeUint32(state.publicPlayedCardIds.length);
  for (const id of state.publicPlayedCardIds) writer.writeString(id);
  writer.writeInteger(state.currentLastPlaySeat === null ? -1 : state.currentLastPlaySeat);
  if (state.currentLastPlay === null) {
    writer.writeString("no-current-last-play");
  } else {
    writer.writeString("current-last-play");
    writeSemanticCardGroup(writer, state.currentLastPlay as CardGroup);
  }
}

function writeSemanticCardGroup(writer: CanonicalWriter, group: CardGroup): void {
  writer.writeString(group.type);
  writer.writeNumber(group.strength);
  writeSemanticCardList(writer, group.cards);
  writeSemanticCardList(writer, group.wildcards);
}

function writeParticleSnapshot(writer: CanonicalWriter, snapshot: ParticleSnapshotIdentity): void {
  writer.writeString(snapshot.gameId);
  writer.writeString(snapshot.roundIdentity);
  writer.writeString(snapshot.handIdentity);
  writer.writeString(snapshot.initialLedgerHash);
  writer.writeInteger(snapshot.lastAppliedEventIndex);
  writer.writeString(snapshot.ledgerHash);
  writer.writeUint8(snapshot.perspectiveSeat);
  writer.writeString(snapshot.gameRank);
}

function assertRolloutAction(action: RolloutAction): void {
  if (!isPlainDataGraph(action) || !isRecord(action) || (action.type !== "pass" && action.type !== "play")) throw new TypeError("ACTION_INVALID");
  if (action.type === "pass") {
    if (!hasExactKeys(action, ["type"])) throw new TypeError("ACTION_INVALID");
    return;
  }
  if (!hasExactKeys(action, ["type", "group"])) throw new TypeError("ACTION_INVALID");
  {
    const group = action.group;
    if (!isRecord(group) || !hasExactKeys(group, ["id", "type", "label", "purpose", "cards", "wildcards", "strength"]) || !isNonEmptyString(group.id) || typeof group.type !== "string" || !GROUP_TYPES.includes(group.type as GroupType) || !isNonEmptyString(group.label) || typeof group.purpose !== "string" || !GROUP_PURPOSES.includes(group.purpose as GroupPurpose) || !isNonNegativeSafeInteger(group.strength) || !Array.isArray(group.cards) || group.cards.length === 0 || !Array.isArray(group.wildcards)) throw new TypeError("ACTION_GROUP_INVALID");
    const cardIds = group.cards.map((card) => {
      assertRolloutCard(card);
      return card.id;
    });
    const wildcardIds = group.wildcards.map((card) => {
      assertRolloutCard(card);
      return card.id;
    });
    if (new Set(cardIds).size !== cardIds.length || new Set(wildcardIds).size !== wildcardIds.length || wildcardIds.some((id) => !cardIds.includes(id))) throw new TypeError("ACTION_CARD_DUPLICATE");
  }
}

function isContextuallyLegalWildcardProjection(action: RolloutAction, gameRank: GameRank): boolean {
  if (action.type === "pass") return true;
  const cardIds = new Set(action.group.cards.map((card) => card.id));
  const wildcardIds = new Set<string>();
  for (const wildcard of action.group.wildcards) {
    if (!cardIds.has(wildcard.id) || wildcardIds.has(wildcard.id) || !isHeartRankWild(wildcard, gameRank)) return false;
    wildcardIds.add(wildcard.id);
  }
  return true;
}

function assertRolloutCard(card: unknown): asserts card is Card {
  if (!isPlainDataGraph(card) || !isRecord(card) || !isNonEmptyString(card.id) || typeof card.kind !== "string") throw new TypeError("ACTION_CARD_INVALID");
  if (card.kind === "suited") {
    if (!hasExactKeys(card, ["id", "kind", "rank", "suit", "copy"]) || !RANKS.includes(card.rank as GameRank) || !SUITS.includes(card.suit as (typeof SUITS)[number]) || (card.copy !== 1 && card.copy !== 2)) throw new TypeError("ACTION_CARD_INVALID");
    if (card.id !== `${CARD_SUIT_CODES[card.suit]}${card.rank}-${card.copy}`) throw new TypeError("ACTION_CARD_INVALID");
    return;
  }
  if (card.kind === "joker") {
    if (!hasExactKeys(card, ["id", "kind", "rank", "copy"]) || (card.rank !== "SJ" && card.rank !== "BJ") || (card.copy !== 1 && card.copy !== 2)) throw new TypeError("ACTION_CARD_INVALID");
    if (card.id !== `Joker-${card.rank}-${card.copy}`) throw new TypeError("ACTION_CARD_INVALID");
    return;
  }
  throw new TypeError("ACTION_CARD_INVALID");
}

function invalid(field: RolloutRequestField): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-request", field } };
}

function invalidBudget(field: Extract<RolloutFailure, { kind: "invalid-budget" }>["field"]): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-budget", field } };
}

function invalidEvidence(field: Extract<RolloutFailure, { kind: "invalid-evidence-requirements" }>["field"]): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-evidence-requirements", field } };
}

function invalidRisk(field: Extract<RolloutFailure, { kind: "invalid-risk-policy" }>["field"]): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-risk-policy", field } };
}

function isRolloutMode(value: unknown): value is RolloutMode {
  return value === "detached" || value === "offline" || value === "shadow";
}

function isSeat(value: unknown): value is PublicSeat {
  return isCanonicalSafeInteger(value) && (value === 0 || value === 1 || value === 2 || value === 3);
}

function hasExactOwnDataKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isPlainDataRecord(value, keys, true);
}

function isPlainDataGraph(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "undefined" || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const shapeValid = Array.isArray(value) ? isPlainDataArray(value) : isPlainDataRecord(value);
  if (!shapeValid) {
    ancestors.delete(value);
    return false;
  }
  let valid = true;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      valid = false;
      break;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isDataDescriptor(descriptor) || !isPlainDataGraph(descriptor.value, ancestors)) {
      valid = false;
      break;
    }
  }
  ancestors.delete(value);
  return valid;
}

function isRecord(value: unknown): value is Record<string, any> {
  return isPlainDataRecord(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return hasExactOwnDataKeys(value, keys);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isPlainDataRecord(value, keys, false);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRootIdentity(value: unknown): value is RootIdentity {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isCanonicalSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isCanonicalSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return isCanonicalSafeInteger(value) && value >= 0;
}

function safeProduct(values: readonly number[]): number | undefined {
  let product = 1;
  for (const value of values) {
    if (!isNonNegativeSafeInteger(value)) return undefined;
    if (value !== 0 && product > Number.MAX_SAFE_INTEGER / value) return undefined;
    product *= value;
  }
  return Number.isSafeInteger(product) ? product : undefined;
}

function safeSum(values: readonly number[]): number | undefined {
  let sum = 0;
  for (const value of values) {
    if (!isNonNegativeSafeInteger(value) || sum > Number.MAX_SAFE_INTEGER - value) return undefined;
    sum += value;
  }
  return sum;
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

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (isDataDescriptor(descriptor)) deepFreeze(descriptor.value, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function isDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "undefined" || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value === "function" || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return isDataDescriptor(descriptor) && isDeeplyFrozen(descriptor.value, seen);
  });
}

class CanonicalWriter {
  private readonly bytes: number[] = [];
  private readonly textEncoder = new TextEncoder();

  writeString(value: string): void {
    if (typeof value !== "string") throw new TypeError("CANONICAL_STRING_INVALID");
    const encoded = this.textEncoder.encode(value);
    this.writeUint32(encoded.length);
    for (const byte of encoded) this.bytes.push(byte);
  }

  writeInteger(value: number): void {
    if (!isCanonicalSafeInteger(value)) throw new RangeError("CANONICAL_INTEGER_INVALID");
    this.writeString(value.toString(10));
  }

  writeNumber(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError("CANONICAL_NUMBER_INVALID");
    this.writeString(Object.is(value, -0) ? "-0" : value.toString(10));
  }

  writeUint8(value: number): void {
    if (!isCanonicalSafeInteger(value) || value < 0 || value > 0xff) throw new RangeError("CANONICAL_UINT8_INVALID");
    this.bytes.push(value);
  }

  writeUint32(value: number): void {
    if (!isCanonicalSafeInteger(value) || value < 0 || value > UINT32_MAX) throw new RangeError("CANONICAL_UINT32_INVALID");
    this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
