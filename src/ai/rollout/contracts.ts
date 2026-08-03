import type { Card, GameRank } from "../../engine/cards";
import { RANKS, SUITS } from "../../engine/cards";
import type { CardGroup, GroupPurpose, GroupType } from "../../engine/groups";
import { assertFinalizedPublicActionEvent, type PublicActionEvent, type PublicSeat } from "../../game/publicEvent";
import { canonicalPublicLedgerHash, type HardPublicLedger } from "../../game/publicLedger";
import { sha256Bytes, verifyPublicActionEventHash } from "../../game/publicEventHash";
import type {
  ParticleBank,
  ParticleScenario,
  ParticleSnapshotIdentity,
} from "../particles/contracts";
import { particleScenarioIdentity } from "../particles/canonicalDeal";

export type CanonicalCandidateIdentity = string;
export type CanonicalScenarioIdentity = string;
export type CanonicalReplicateIdentity = string;
export type CanonicalDecisionIdentity = string;
export type CanonicalRandomDomain = string;
export type CanonicalSemanticKey = string;
export type RootIdentity = string;
export type RootDigest = string;
export type RolloutReplayContextIdentity = string;

export type RolloutMode = "detached" | "offline" | "shadow";

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

export type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  publicState: RolloutPublicState;
  replicateIdentity: string;
  random: CrnView;
  validatedBudget: ValidatedRolloutBudget;
}>;

export type CrnCoordinate = Readonly<{
  rootIdentity: string;
  scenarioIdentity: string;
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  randomDomain: string;
}>;

export type CrnView = Readonly<{ value(semanticKey: string): number }>;

export type RolloutPolicyDecisionContext = Readonly<{
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
}>;

export type TeamUtility = -3 | -2 | -1 | 1 | 2 | 3;

export type TeamUtilityFailure =
  | { kind: "invalid-finish-order"; reason: "duplicate-seat" | "missing-seat" | "unknown-seat" }
  | { kind: "unsupported-team-pair"; teamSeats: readonly PublicSeat[] };

export type LeafEvaluationFailure =
  | { kind: "invalid-leaf-state"; reason: "duplicate-finish" | "unknown-seat" | "negative-hand-count" }
  | { kind: "rotation-tie-break-unproven"; evidence: string };

export type RolloutPolicyFailure =
  | { kind: "no-legal-action"; actingSeat: PublicSeat }
  | { kind: "invalid-policy-context"; field: "ply" | "actingSeat" };

export type RolloutKernelFailure =
  | { kind: "simulation-failed"; stage: "state-conservation" | "leaf-evaluation" | "replay" }
  | { kind: "policy-failed"; failure: RolloutPolicyFailure }
  | { kind: "budget-exhausted"; workUnits: number; maximumWorkUnits: number };

export type RolloutAggregationFailure =
  | { kind: "non-finite-aggregate"; field: "expectedUtility" | "variance" | "risk" }
  | { kind: "coverage-mismatch"; expected: number; actual: number }
  | { kind: "empty-replicate-set"; candidateId: string };

export type RolloutFailure =
  | { kind: "invalid-request"; field: string }
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

export type RolloutResultOutcome =
  | Readonly<{ ok: true; result: RolloutResult }>
  | Readonly<{ ok: false; failure: RolloutFailure }>;

export type RolloutExecutionResult = RolloutResultOutcome;

export type D2FShadowEvidence = Readonly<{
  schemaVersion: "d2f-shadow-v2";
  policyId: RolloutPolicyId;
  baselineActionIdentity: string;
  d2fRecommendedActionIdentity: string | null;
  agreement: "agree" | "disagree" | "unavailable";
  riskAdjustedUtilityDelta: number | null;
  expectedUtilityDelta: number | null;
  baselineEvaluatorScore: number;
  effectiveSampleSize: number | null;
  acceptedScenarioCount: number | null;
  replicateCountPerScenario: number | null;
  completedReplicateCount: number | null;
  workUnitCount: number | null;
  fallbackReason: "none" | "rollout-failure" | "low-evidence" | "budget-exhausted" | "telemetry-failure";
  semanticBudgetUsage: Readonly<{
    replicateCountPerScenario: number;
    maxPliesPerReplicate: number;
    maxPolicyActionEvaluationsPerPly: number;
    workUnitCount: number;
  }> | null;
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
const REQUEST_KEYS = [
  "schemaVersion", "mode", "formalExecutionAllowed", "rootIdentity", "scenarioSourceInput", "candidates", "budget", "limits",
  "evidenceRequirements", "riskPolicy", "policyId",
] as const;
const RESULT_KEYS = [
  "schemaVersion", "mode", "formalExecutionAllowed", "policyId", "rootDigest", "candidateSummaries", "ranking", "aggregateDiagnostics",
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

export function canonicalDecisionIdentity(input: Readonly<{
  rootIdentity: string;
  candidateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  semanticKey: string;
}>): CanonicalDecisionIdentity {
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

export function rootDigestFromReplayContextIdentity(identity: RolloutReplayContextIdentity): RootDigest {
  if (!/^[a-f0-9]{64}$/.test(identity)) throw new TypeError("ROOT_IDENTITY_INVALID");
  const writer = new CanonicalWriter();
  writer.writeString("d2f-root-digest-v1");
  writer.writeString(identity);
  return sha256Bytes(writer.finish());
}

export function validateRolloutBudget(input: Readonly<{
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
}>): RolloutContractResult<ValidatedRolloutBudget> {
  if (!isRecord(input) || !isRecord(input.budget) || !isRecord(input.limits)) return invalidBudget("maxWorkUnits");
  const budgetFields: readonly (keyof RolloutBudget)[] = [
    "replicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits",
  ];
  const limitFields: readonly (keyof RolloutBudgetLimits)[] = [
    "maxReplicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits",
  ];
  for (const field of budgetFields) {
    if (!isPositiveSafeInteger(input.budget[field])) return invalidBudget(field);
  }
  for (const field of limitFields) {
    if (!isPositiveSafeInteger(input.limits[field])) return invalidBudget(field === "maxReplicateCountPerScenario" ? "replicateCountPerScenario" : field);
  }
  if (input.budget.replicateCountPerScenario > input.limits.maxReplicateCountPerScenario) return invalidBudget("replicateCountPerScenario");
  if (input.budget.maxPliesPerReplicate > input.limits.maxPliesPerReplicate) return invalidBudget("maxPliesPerReplicate");
  if (input.budget.maxPolicyActionEvaluationsPerPly > input.limits.maxPolicyActionEvaluationsPerPly) return invalidBudget("maxPolicyActionEvaluationsPerPly");
  if (input.budget.maxWorkUnits > input.limits.maxWorkUnits) return invalidBudget("maxWorkUnits");

  const product = safeProduct([
    input.budget.replicateCountPerScenario,
    input.budget.maxPliesPerReplicate,
    input.budget.maxPolicyActionEvaluationsPerPly,
  ]);
  if (product === undefined) return invalidBudget("maxWorkUnits");
  return {
    ok: true,
    value: deepFreeze({
      budget: { ...input.budget },
      limits: { ...input.limits },
      maximumWorkUnits: Math.min(input.budget.maxWorkUnits, product),
      validated: true,
    }),
  };
}

export function validateRolloutEvidenceRequirements(input: unknown): RolloutContractResult<RolloutEvidenceRequirements> {
  if (!isRecord(input) || !hasExactKeys(input, ["schemaVersion", "minimumEffectiveSampleSize", "minimumAcceptedScenarioCount", "minimumCompletedReplicateCount", "requireCompleteCoverage"]) || input.schemaVersion !== "d2f-rollout-evidence-requirements-v1" || input.requireCompleteCoverage !== true) return invalidEvidence("minimumEffectiveSampleSize");
  if (!isPositiveSafeInteger(input.minimumEffectiveSampleSize)) return invalidEvidence("minimumEffectiveSampleSize");
  if (!isPositiveSafeInteger(input.minimumAcceptedScenarioCount)) return invalidEvidence("minimumAcceptedScenarioCount");
  if (!isPositiveSafeInteger(input.minimumCompletedReplicateCount)) return invalidEvidence("minimumCompletedReplicateCount");
  return { ok: true, value: deepFreeze({ ...input } as RolloutEvidenceRequirements) };
}

export function validateRolloutRiskPolicy(input: unknown): RolloutContractResult<RolloutRiskPolicy> {
  if (!isRecord(input) || !hasExactKeys(input, ["schemaVersion", "variancePenalty", "downsideRiskPenalty"]) || input.schemaVersion !== "d2f-rollout-risk-policy-v1") return invalidRisk("variancePenalty");
  if (typeof input.variancePenalty !== "number" || !Number.isFinite(input.variancePenalty) || input.variancePenalty < 0) return invalidRisk("variancePenalty");
  if (typeof input.downsideRiskPenalty !== "number" || !Number.isFinite(input.downsideRiskPenalty) || input.downsideRiskPenalty < 0) return invalidRisk("downsideRiskPenalty");
  return { ok: true, value: deepFreeze({ ...input } as RolloutRiskPolicy) };
}

export function createRolloutRequest(input: unknown): RolloutContractResult<RolloutRequest> {
  if (!isRecord(input)) return invalid("request");
  const requestKeyError = exactEnvelopeKeyError(input, REQUEST_KEYS);
  if (requestKeyError !== undefined) return invalid(requestKeyError);
  if (input.policyId !== "d2f-lightweight-v1") return invalid("policyId");
  if (input.schemaVersion !== "d2f-rollout-request-v2") return invalid("schemaVersion");
  if (!isRolloutMode(input.mode)) return invalid("mode");
  if (input.formalExecutionAllowed !== false) return invalid("formalExecutionAllowed");
  if (!isRootIdentity(input.rootIdentity)) return invalid("rootIdentity");
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) return invalid("candidates");

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
    if (!isRecord(candidate) || !isNonEmptyString(candidate.candidateId) || typeof candidate.baselineEvaluatorScore !== "number" || !Number.isFinite(candidate.baselineEvaluatorScore)) return invalid("candidates");
    let action: RolloutAction;
    try {
      action = deepFreeze(structuredClone(candidate.action));
      const canonical = canonicalActionIdentity(action);
      if (candidate.candidateId !== canonical || candidateIds.has(canonical)) return invalid("candidates");
      candidateIds.add(canonical);
    } catch {
      return invalid("candidates");
    }
    candidates.push(deepFreeze({ candidateId: candidate.candidateId, action, baselineEvaluatorScore: candidate.baselineEvaluatorScore }));
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

export function createRolloutResult(input: unknown): RolloutContractResult<RolloutResult> {
  if (!isRecord(input)) return invalid("result");
  const resultKeyError = exactEnvelopeKeyError(input, RESULT_KEYS);
  if (resultKeyError !== undefined) return invalid(resultKeyError);
  if (input.policyId !== "d2f-lightweight-v1") return invalid("policyId");
  if (input.schemaVersion !== "d2f-rollout-result-v2" || !isRolloutMode(input.mode) || input.formalExecutionAllowed !== false || typeof input.rootDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.rootDigest)) return invalid("result");
  if (!Array.isArray(input.candidateSummaries) || input.candidateSummaries.length === 0 || !Array.isArray(input.ranking) || !isRecord(input.aggregateDiagnostics)) return invalid("result");

  const summaries: CandidateRolloutSummary[] = [];
  const ids = new Set<string>();
  for (const summary of input.candidateSummaries) {
    if (!isCandidateSummary(summary) || ids.has(summary.candidateId)) return invalid("candidateSummaries");
    if (summaries.length > 0 && compareCodeUnits(summaries[summaries.length - 1]!.candidateId, summary.candidateId) > 0) return invalid("candidateSummaries");
    ids.add(summary.candidateId);
    summaries.push(deepFreeze(structuredClone(summary)));
  }
  if (input.ranking.length !== summaries.length || input.ranking.some((id) => typeof id !== "string" || !ids.has(id)) || new Set(input.ranking).size !== input.ranking.length) return invalid("ranking");
  if (!isAggregateDiagnostics(input.aggregateDiagnostics, summaries.length)) return invalid("aggregateDiagnostics");
  const aggregate = input.aggregateDiagnostics as RolloutAggregateDiagnostics;
  if (summaries.some((summary) => summary.acceptedScenarioCount !== aggregate.acceptedScenarioCount || summary.replicateCountPerScenario !== aggregate.replicateCountPerScenario)) return invalid("aggregateDiagnostics");
  const summaryCompleted = safeSum(summaries.map((summary) => summary.completedReplicateCount));
  const summaryExpected = safeSum(summaries.map((summary) => summary.expectedReplicateCount));
  const summaryWork = safeSum(summaries.map((summary) => summary.workUnitCount));
  if (summaryCompleted === undefined || summaryExpected === undefined || summaryWork === undefined) return invalid("candidateSummaries");
  if (aggregate.completedReplicateCount !== summaryCompleted || aggregate.expectedCompletedReplicateCount !== summaryExpected || aggregate.workUnitCount !== summaryWork) return invalid("aggregateDiagnostics");
  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: "d2f-rollout-result-v2",
      mode: input.mode,
      formalExecutionAllowed: false,
      policyId: "d2f-lightweight-v1",
      rootDigest: input.rootDigest,
      candidateSummaries: summaries,
      ranking: [...input.ranking] as string[],
      aggregateDiagnostics: structuredClone(input.aggregateDiagnostics) as RolloutAggregateDiagnostics,
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
  return total !== undefined && value.expectedReplicateCount === total && value.completedReplicateCount <= total;
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
  if (!isRecord(value) || !hasExactKeys(value, SOURCE_INPUT_KEYS) || !isRecord(value.bank) || !isDeeplyFrozen(value.bank) || !isParticleSnapshotIdentity(value.bank.snapshot)) return undefined;
  if (!RANKS.includes(value.gameRank as GameRank) || !isSeat(value.perspectiveSeat)) return undefined;
  const publicHistoryEvents = clonePublicHistoryEvents(value.publicHistoryEvents);
  const initialLedger = cloneHardPublicLedger(value.initialLedger);
  const finalLedger = cloneHardPublicLedger(value.finalLedger);
  const ownCurrentHand = cloneCardArray(value.ownCurrentHand);
  const publicState = clonePublicState(value.publicState);
  if (publicHistoryEvents === undefined || initialLedger === undefined || finalLedger === undefined || ownCurrentHand === undefined || publicState === undefined) return undefined;
  return deepFreeze({
    bank: value.bank as ParticleBank,
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
  if (!isRecord(value) || !hasExactKeys(value, PUBLIC_STATE_KEYS) || !RANKS.includes(value.gameRank as GameRank) || !isSeat(value.actingSeat) || !isSeat(value.perspectiveSeat) || !isSeat(value.partnerSeat) || value.partnerSeat !== partnerSeat(value.perspectiveSeat) || !isRecord(value.handCounts) || !hasExactKeys(value.handCounts, ["0", "1", "2", "3"]) || !Array.isArray(value.finishOrder) || !Array.isArray(value.publicPlayedCardIds)) return false;
  if (!SEATS.every((seat) => isNonNegativeSafeInteger(value.handCounts[seat]))) return false;
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
  if (!Array.isArray(value)) return undefined;
  const events: PublicActionEvent[] = [];
  try {
    for (const event of value) {
      assertFinalizedPublicActionEvent(event);
      verifyPublicActionEventHash(event);
      if (!isPublicEventSemanticShape(event)) throw new TypeError("EVENT_SCHEMA_INVALID");
      events.push(structuredClone(event) as PublicActionEvent);
    }
  } catch {
    return undefined;
  }
  return deepFreeze(events);
}

function cloneCardArray(value: unknown): readonly Card[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cards: Card[] = [];
  const ids = new Set<string>();
  try {
    for (const card of value) {
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
  const currentTrick: HardPublicLedger["currentTrick"] = {
    trickIndex: ledger.currentTrick.trickIndex,
    leadSeat: ledger.currentTrick.leadSeat,
    passSeats: [...ledger.currentTrick.passSeats],
    ...(ledger.currentTrick.lastPlaySeat === undefined ? {} : { lastPlaySeat: ledger.currentTrick.lastPlaySeat }),
    ...(ledger.currentTrick.lastPlayStableKey === undefined ? {} : { lastPlayStableKey: ledger.currentTrick.lastPlayStableKey }),
  };
  return deepFreeze({
    schemaVersion: ledger.schemaVersion,
    gameId: ledger.gameId,
    roundIdentity: ledger.roundIdentity,
    handIdentity: ledger.handIdentity,
    nextEventIndex: ledger.nextEventIndex,
    lastAppliedEventIndex: ledger.lastAppliedEventIndex,
    seenEventHashes: { ...ledger.seenEventHashes },
    playedCardIds: [...ledger.playedCardIds],
    revealedTransferEvents: ledger.revealedTransferEvents.map((event) => ({
      eventIndex: event.eventIndex,
      kind: event.kind,
      ...(event.cardId === undefined ? {} : { cardId: event.cardId }),
      fromSeat: event.fromSeat,
      toSeat: event.toSeat,
    })),
    handCounts: { 0: ledger.handCounts[0], 1: ledger.handCounts[1], 2: ledger.handCounts[2], 3: ledger.handCounts[3] },
    currentTrick,
    finishOrder: [...ledger.finishOrder],
    publicTributeEvents: [...ledger.publicTributeEvents],
    recentActionSummaries: ledger.recentActionSummaries.map((summary) => ({ ...summary })),
  });
}

function isParticleSnapshotIdentity(value: unknown): value is ParticleSnapshotIdentity {
  return isRecord(value)
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

function isHardPublicLedger(value: unknown): value is HardPublicLedger {
  if (!isRecord(value) || !hasExactKeys(value, LEDGER_KEYS) || value.schemaVersion !== "d2-public-ledger-v1" || !isNonEmptyString(value.gameId) || !isNonEmptyString(value.roundIdentity) || !isNonEmptyString(value.handIdentity) || !isLedgerEventIndex(value.lastAppliedEventIndex) || !isNonNegativeSafeInteger(value.nextEventIndex) || value.nextEventIndex !== value.lastAppliedEventIndex + 1 || !isRecord(value.seenEventHashes) || !isRecord(value.handCounts) || !hasExactKeys(value.handCounts, ["0", "1", "2", "3"]) || !isRecord(value.currentTrick) || !Array.isArray(value.playedCardIds) || !Array.isArray(value.revealedTransferEvents) || !Array.isArray(value.finishOrder) || !Array.isArray(value.publicTributeEvents) || !Array.isArray(value.recentActionSummaries)) return false;
  const seenKeys = Object.keys(value.seenEventHashes);
  if (seenKeys.length !== value.lastAppliedEventIndex + 1 || seenKeys.some((key) => !/^\d+$/.test(key) || String(Number(key)) !== key || Number(key) > value.lastAppliedEventIndex || !isDigest(value.seenEventHashes[key]))) return false;
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
    if (!isRecord(changes) || !hasExactKeys(changes, ["0", "1", "2", "3"]) || ![0, 1, 2, 3].every((seat) => Number.isSafeInteger(changes[seat]) && Number.isFinite(changes[seat]))) return false;
  }
  return true;
}

function isCardIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^(?:[SCHD](?:10|[AKQJ2-9])-[12]|Joker-(?:SJ|BJ)-[12])$/.test(value);
}

function isLedgerEventIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= -1;
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
  if (!isRecord(input) || !Array.isArray(input.publicHistoryEvents) || !isHardPublicLedger(input.initialLedger) || !isHardPublicLedger(input.finalLedger) || !RANKS.includes(input.gameRank) || !isSeat(input.perspectiveSeat) || !isSeat(input.actingSeat) || !Array.isArray(input.ownCurrentHand) || !isPublicState(input.publicState) || !isParticleSnapshotIdentity(input.particleBankSnapshot)) throw new TypeError("REPLAY_CONTEXT_INVALID");
  const events = clonePublicHistoryEvents(input.publicHistoryEvents);
  const ownCurrentHand = cloneCardArray(input.ownCurrentHand);
  if (events === undefined) throw new TypeError("REPLAY_CONTEXT_INVALID");
  if (ownCurrentHand === undefined) throw new TypeError("REPLAY_HAND_INVALID");
  if (input.publicState.gameRank !== input.gameRank || input.publicState.perspectiveSeat !== input.perspectiveSeat || input.publicState.actingSeat !== input.actingSeat || input.publicState.partnerSeat !== partnerSeat(input.perspectiveSeat)) throw new TypeError("REPLAY_CONTEXT_INVALID");
  if (!SEATS.every((seat) => input.publicState.handCounts[seat] === input.finalLedger.handCounts[seat])
    || input.publicState.publicPlayedCardIds.length !== input.finalLedger.playedCardIds.length
    || !input.publicState.publicPlayedCardIds.every((id, index) => id === input.finalLedger.playedCardIds[index])
    || input.publicState.finishOrder.length !== input.finalLedger.finishOrder.length
    || !input.publicState.finishOrder.every((seat, index) => seat === input.finalLedger.finishOrder[index])) throw new TypeError("REPLAY_CONTEXT_INVALID");
  if (!matchesLedgerIdentity(input.initialLedger, input.finalLedger, input.particleBankSnapshot, input.gameRank, input.perspectiveSeat) || !matchesHistoryShape(events, input.initialLedger, input.finalLedger) || deriveActingSeat(events, input.finalLedger) !== input.actingSeat) throw new TypeError("REPLAY_CONTEXT_INVALID");
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
  return events.every((event, index) => event.eventIndex === index
    && event.gameId === finalLedger.gameId
    && event.roundIdentity === finalLedger.roundIdentity
    && event.handIdentity === finalLedger.handIdentity
    && finalLedger.seenEventHashes[event.eventIndex] === event.publicPayloadHash);
}

function isInitialOpeningLedger(ledger: HardPublicLedger): boolean {
  return ledger.lastAppliedEventIndex === -1
    && ledger.nextEventIndex === 0
    && Object.keys(ledger.seenEventHashes).length === 0
    && ledger.playedCardIds.length === 0
    && ledger.revealedTransferEvents.length === 0
    && ledger.finishOrder.length === 0
    && ledger.currentTrick.passSeats.length === 0
    && ledger.currentTrick.lastPlaySeat === undefined
    && ledger.currentTrick.lastPlayStableKey === undefined
    && ledger.recentActionSummaries.length === 0;
}

function deriveActingSeat(events: readonly PublicActionEvent[], ledger: HardPublicLedger): PublicSeat | undefined {
  if (events.length === 0) return ledger.currentTrick.leadSeat;
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
  if (!isRecord(action) || (action.type !== "pass" && action.type !== "play")) throw new TypeError("ACTION_INVALID");
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

function assertRolloutCard(card: unknown): asserts card is Card {
  if (!isRecord(card) || !isNonEmptyString(card.id) || typeof card.kind !== "string") throw new TypeError("ACTION_CARD_INVALID");
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

function invalid(field: string): RolloutContractResult<never> {
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
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key)) && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function exactEnvelopeKeyError(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) return "request";
  if (prototype === Object.prototype) {
    for (const inheritedKey of ["policy", "chooseAction", "policyFactory", "callback", "registry"] as const) {
      if (inheritedKey in value && !Object.prototype.hasOwnProperty.call(value, inheritedKey)) return inheritedKey;
    }
  }
  const ownKeys = Reflect.ownKeys(value);
  const unexpected = ownKeys.find((key) => typeof key !== "string" || !keys.includes(key));
  if (unexpected !== undefined) return typeof unexpected === "string" ? unexpected : "request";
  return keys.find((key) => !Object.prototype.hasOwnProperty.call(value, key));
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRootIdentity(value: unknown): value is RootIdentity {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
  if (!Object.isFrozen(value)) Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return value;
}

function isDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "undefined" || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value === "function" || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value as Record<string, unknown>).every((child) => isDeeplyFrozen(child, seen));
}

class CanonicalWriter {
  private readonly bytes: number[] = [];

  writeString(value: string): void {
    if (typeof value !== "string") throw new TypeError("CANONICAL_STRING_INVALID");
    const encoded = new TextEncoder().encode(value);
    this.writeUint32(encoded.length);
    this.bytes.push(...encoded);
  }

  writeInteger(value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError("CANONICAL_INTEGER_INVALID");
    this.writeString(value.toString(10));
  }

  writeNumber(value: number): void {
    if (!Number.isFinite(value)) throw new RangeError("CANONICAL_NUMBER_INVALID");
    this.writeString(Object.is(value, -0) ? "-0" : value.toString(10));
  }

  writeUint8(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xff) throw new RangeError("CANONICAL_UINT8_INVALID");
    this.bytes.push(value);
  }

  writeUint32(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) throw new RangeError("CANONICAL_UINT32_INVALID");
    this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
