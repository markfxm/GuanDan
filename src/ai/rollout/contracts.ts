import type { Card, GameRank } from "../../engine/cards";
import { RANKS, SUITS } from "../../engine/cards";
import type { CardGroup, GroupPurpose, GroupType } from "../../engine/groups";
import type { PublicActionEvent, PublicSeat } from "../../game/publicEvent";
import { canonicalPublicLedgerHash, type HardPublicLedger } from "../../game/publicLedger";
import { sha256Bytes } from "../../game/publicEventHash";
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
  policy: RolloutPolicy;
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
  random: CrnView;
}>;

export type RolloutPolicy = Readonly<{
  chooseAction(observation: SeatLocalObservation, context: RolloutPolicyDecisionContext): RolloutPolicyResult;
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
  | { kind: "invalid-policy-context"; field: "ply" | "actingSeat" | "random" };

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
  totalCompletedReplicates: number;
  completedReplicateCount: number;
  workUnitCount: number;
}>;

export type RolloutAggregateDiagnostics = Readonly<{
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  totalCompletedReplicates: number;
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
  policy: RolloutPolicy;
}>;

export type RolloutResult = Readonly<{
  schemaVersion: "d2f-rollout-result-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
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

export function canonicalActionIdentity(action: RolloutAction): CanonicalCandidateIdentity {
  assertRolloutAction(action);
  const writer = new CanonicalWriter();
  writer.writeString("d2f-candidate-action-identity-v1");
  writer.writeString(action.type);
  if (action.type === "play") {
    writer.writeString(action.group.type);
    const ids = action.group.cards.map((card) => card.id).sort(compareCodeUnits);
    writer.writeUint32(ids.length);
    for (const id of ids) writer.writeString(id);
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
  if (typeof input.minimumEffectiveSampleSize !== "number" || !Number.isFinite(input.minimumEffectiveSampleSize) || input.minimumEffectiveSampleSize < 0) return invalidEvidence("minimumEffectiveSampleSize");
  if (!isNonNegativeSafeInteger(input.minimumAcceptedScenarioCount)) return invalidEvidence("minimumAcceptedScenarioCount");
  if (!isNonNegativeSafeInteger(input.minimumCompletedReplicateCount)) return invalidEvidence("minimumCompletedReplicateCount");
  return { ok: true, value: deepFreeze({ ...input } as RolloutEvidenceRequirements) };
}

export function validateRolloutRiskPolicy(input: unknown): RolloutContractResult<RolloutRiskPolicy> {
  if (!isRecord(input) || !hasExactKeys(input, ["schemaVersion", "variancePenalty", "downsideRiskPenalty"]) || input.schemaVersion !== "d2f-rollout-risk-policy-v1") return invalidRisk("variancePenalty");
  if (typeof input.variancePenalty !== "number" || !Number.isFinite(input.variancePenalty) || input.variancePenalty < 0) return invalidRisk("variancePenalty");
  if (typeof input.downsideRiskPenalty !== "number" || !Number.isFinite(input.downsideRiskPenalty) || input.downsideRiskPenalty < 0) return invalidRisk("downsideRiskPenalty");
  return { ok: true, value: deepFreeze({ ...input } as RolloutRiskPolicy) };
}

export function createRolloutRequest(input: unknown): RolloutContractResult<RolloutRequest> {
  if (!isRecord(input) || input.schemaVersion !== "d2f-rollout-request-v2") return invalid("schemaVersion");
  if (!isRolloutMode(input.mode)) return invalid("mode");
  if (input.formalExecutionAllowed !== false) return invalid("formalExecutionAllowed");
  if (!isNonEmptyString(input.rootIdentity)) return invalid("rootIdentity");
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) return invalid("candidates");
  if (!isRolloutPolicy(input.policy)) return invalid("policy");

  const sourceInput = cloneScenarioSourceInput(input.scenarioSourceInput);
  if (sourceInput === undefined) return invalid("scenarioSourceInput");

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
  const riskPolicy = validateRolloutRiskPolicy(input.riskPolicy);
  if (!riskPolicy.ok) return riskPolicy;

  const policy = Object.freeze({ chooseAction: input.policy.chooseAction.bind(input.policy) }) as RolloutPolicy;
  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: "d2f-rollout-request-v2",
      mode: input.mode,
      formalExecutionAllowed: false,
      rootIdentity: input.rootIdentity,
      scenarioSourceInput: sourceInput,
      candidates,
      budget: budget.value.budget,
      limits: budget.value.limits,
      evidenceRequirements: evidence.value,
      riskPolicy: riskPolicy.value,
      policy,
    }),
  };
}

export function createRolloutResult(input: unknown): RolloutContractResult<RolloutResult> {
  if (!isRecord(input) || input.schemaVersion !== "d2f-rollout-result-v2" || !isRolloutMode(input.mode) || input.formalExecutionAllowed !== false || typeof input.rootDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.rootDigest)) return invalid("result");
  if (!Array.isArray(input.candidateSummaries) || input.candidateSummaries.length === 0 || !Array.isArray(input.ranking) || !isRecord(input.aggregateDiagnostics)) return invalid("result");

  const summaries: CandidateRolloutSummary[] = [];
  const ids = new Set<string>();
  for (const summary of input.candidateSummaries) {
    if (!isCandidateSummary(summary, input.candidateSummaries.length) || ids.has(summary.candidateId)) return invalid("candidateSummaries");
    if (summaries.length > 0 && compareCodeUnits(summaries[summaries.length - 1]!.candidateId, summary.candidateId) > 0) return invalid("candidateSummaries");
    ids.add(summary.candidateId);
    summaries.push(deepFreeze(structuredClone(summary)));
  }
  if (input.ranking.length !== summaries.length || input.ranking.some((id) => typeof id !== "string" || !ids.has(id)) || new Set(input.ranking).size !== input.ranking.length) return invalid("ranking");
  if (!isAggregateDiagnostics(input.aggregateDiagnostics, summaries.length)) return invalid("aggregateDiagnostics");
  return {
    ok: true,
    value: deepFreeze({
      schemaVersion: "d2f-rollout-result-v2",
      mode: input.mode,
      formalExecutionAllowed: false,
      rootDigest: input.rootDigest,
      candidateSummaries: summaries,
      ranking: [...input.ranking] as string[],
      aggregateDiagnostics: structuredClone(input.aggregateDiagnostics) as RolloutAggregateDiagnostics,
    }),
  };
}

function isCandidateSummary(value: unknown, candidateCount: number): value is CandidateRolloutSummary {
  if (!isRecord(value) || !hasExactKeys(value, ["candidateId", "riskAdjustedUtility", "expectedUtility", "variance", "risk", "baselineEvaluatorScore", "acceptedScenarioCount", "replicateCountPerScenario", "totalCompletedReplicates", "completedReplicateCount", "workUnitCount"]) || !isNonEmptyString(value.candidateId)) return false;
  for (const field of ["riskAdjustedUtility", "expectedUtility", "baselineEvaluatorScore"] as const) if (typeof value[field] !== "number" || !Number.isFinite(value[field])) return false;
  for (const field of ["variance", "risk"] as const) if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) return false;
  for (const field of ["acceptedScenarioCount", "replicateCountPerScenario", "totalCompletedReplicates", "completedReplicateCount", "workUnitCount"] as const) {
    if (!isNonNegativeSafeInteger(value[field])) return false;
  }
  if (value.acceptedScenarioCount < 1 || value.replicateCountPerScenario < 1 || !isPositiveSafeInteger(candidateCount)) return false;
  const total = safeProduct([value.acceptedScenarioCount, value.replicateCountPerScenario]);
  const completed = total === undefined ? undefined : safeProduct([candidateCount, total]);
  return total !== undefined && completed !== undefined && value.totalCompletedReplicates === total && value.completedReplicateCount === completed;
}

function isAggregateDiagnostics(value: unknown, candidateCount: number): value is RolloutAggregateDiagnostics {
  if (!isRecord(value) || !hasExactKeys(value, ["effectiveSampleSize", "acceptedScenarioCount", "replicateCountPerScenario", "totalCompletedReplicates", "completedReplicateCount", "expectedCompletedReplicateCount", "candidateCount", "workUnitCount", "coverage"]) || value.coverage !== "complete" || value.candidateCount !== candidateCount) return false;
  if (typeof value.effectiveSampleSize !== "number" || !Number.isFinite(value.effectiveSampleSize) || value.effectiveSampleSize < 0) return false;
  for (const field of ["acceptedScenarioCount", "replicateCountPerScenario", "totalCompletedReplicates", "completedReplicateCount", "expectedCompletedReplicateCount", "candidateCount", "workUnitCount"] as const) if (!isNonNegativeSafeInteger(value[field])) return false;
  if (value.acceptedScenarioCount < 1 || value.replicateCountPerScenario < 1 || !isPositiveSafeInteger(candidateCount)) return false;
  const total = safeProduct([value.acceptedScenarioCount, value.replicateCountPerScenario]);
  const expected = total === undefined ? undefined : safeProduct([candidateCount, total]);
  return total !== undefined
    && expected !== undefined
    && value.totalCompletedReplicates === total
    && value.completedReplicateCount === expected
    && value.expectedCompletedReplicateCount === expected;
}

function cloneScenarioSourceInput(value: unknown): RolloutScenarioSourceInput | undefined {
  if (!isRecord(value) || !isRecord(value.bank) || !isDeeplyFrozen(value.bank) || !Array.isArray(value.publicHistoryEvents) || !isRecord(value.initialLedger) || !isRecord(value.finalLedger) || !RANKS.includes(value.gameRank as GameRank) || !isSeat(value.perspectiveSeat) || !Array.isArray(value.ownCurrentHand) || !isRecord(value.publicState)) return undefined;
  if (!isPublicState(value.publicState)) return undefined;
  try {
    return deepFreeze({
      bank: value.bank as ParticleBank,
      publicHistoryEvents: structuredClone(value.publicHistoryEvents),
      initialLedger: structuredClone(value.initialLedger),
      finalLedger: structuredClone(value.finalLedger),
      gameRank: value.gameRank,
      perspectiveSeat: value.perspectiveSeat,
      ownCurrentHand: structuredClone(value.ownCurrentHand),
      publicState: structuredClone(value.publicState),
    }) as unknown as RolloutScenarioSourceInput;
  } catch {
    return undefined;
  }
}

function isPublicState(value: unknown): value is RolloutPublicState {
  if (!isRecord(value) || !RANKS.includes(value.gameRank as GameRank) || !isSeat(value.actingSeat) || !isSeat(value.perspectiveSeat) || !isSeat(value.partnerSeat) || !isRecord(value.handCounts) || !Array.isArray(value.finishOrder) || !Array.isArray(value.publicPlayedCardIds)) return false;
  if (!SEATS.every((seat) => isNonNegativeSafeInteger(value.handCounts[seat]))) return false;
  if (!value.finishOrder.every(isSeat) || !value.publicPlayedCardIds.every((id) => typeof id === "string")) return false;
  return value.currentLastPlay === null || typeof value.currentLastPlay === "object";
}

function isRolloutPolicy(value: unknown): value is RolloutPolicy {
  return isRecord(value) && typeof value.chooseAction === "function";
}

function assertReplayContextInput(input: RolloutReplayContextInput): void {
  if (!isRecord(input) || !Array.isArray(input.publicHistoryEvents) || !isRecord(input.initialLedger) || !isRecord(input.finalLedger) || !RANKS.includes(input.gameRank) || !isSeat(input.perspectiveSeat) || !isSeat(input.actingSeat) || !Array.isArray(input.ownCurrentHand) || !isPublicState(input.publicState) || !isRecord(input.particleBankSnapshot)) throw new TypeError("REPLAY_CONTEXT_INVALID");
  if (!input.publicHistoryEvents.every((event) => isRecord(event) && isNonNegativeSafeInteger(event.eventIndex) && typeof event.publicPayloadHash === "string" && /^[a-f0-9]{64}$/.test(event.publicPayloadHash))) throw new TypeError("REPLAY_CONTEXT_INVALID");
  for (const card of input.ownCurrentHand) if (!isRecord(card) || typeof card.id !== "string" || card.id.length === 0) throw new TypeError("REPLAY_HAND_INVALID");
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
  writeUnknown(writer, state.currentLastPlay);
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

function writeUnknown(writer: CanonicalWriter, value: unknown): void {
  if (value === null) {
    writer.writeString("null");
    return;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    writer.writeString(typeof value);
    writer.writeString(String(value));
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("NON_FINITE_PUBLIC_STATE");
    writer.writeString("number");
    writer.writeString(String(value));
    return;
  }
  if (Array.isArray(value)) {
    writer.writeString("array");
    writer.writeUint32(value.length);
    for (const child of value) writeUnknown(writer, child);
    return;
  }
  if (typeof value === "object") {
    writer.writeString("object");
    const entries = Object.keys(value as Record<string, unknown>).sort(compareCodeUnits);
    writer.writeUint32(entries.length);
    for (const key of entries) {
      writer.writeString(key);
      writeUnknown(writer, (value as Record<string, unknown>)[key]);
    }
    return;
  }
  throw new TypeError("PUBLIC_STATE_VALUE_INVALID");
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
    if (!isRecord(group) || !hasExactKeys(group, ["id", "type", "label", "purpose", "cards", "wildcards", "strength"]) || !isNonEmptyString(group.id) || typeof group.type !== "string" || !GROUP_TYPES.includes(group.type as GroupType) || !isNonEmptyString(group.label) || typeof group.purpose !== "string" || !GROUP_PURPOSES.includes(group.purpose as GroupPurpose) || typeof group.strength !== "number" || !Number.isFinite(group.strength) || !Array.isArray(group.cards) || group.cards.length === 0 || !Array.isArray(group.wildcards)) throw new TypeError("ACTION_GROUP_INVALID");
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
    return;
  }
  if (card.kind === "joker") {
    if (!hasExactKeys(card, ["id", "kind", "rank", "copy"]) || (card.rank !== "SJ" && card.rank !== "BJ") || (card.copy !== 1 && card.copy !== 2)) throw new TypeError("ACTION_CARD_INVALID");
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
  return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return left.length - right.length;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
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
