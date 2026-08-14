import type { AiDecision } from "../contracts";
import {
  canonicalActionIdentity,
  type CanonicalCandidateIdentity,
  type RolloutAction,
  type RolloutBudget,
  type RolloutEvidenceRequirements,
  type RolloutPolicyId,
  type RolloutRiskPolicy,
} from "../rollout/contracts";
import type { PublicSeat } from "../../game/publicEvent";
import { sha256Bytes } from "../../game/publicEventHash";

export const D2G_PROFILE_SCHEMA_VERSION = "d2g-treatment-profile-v1" as const;
export const D2G_PROFILE_VERSION = "d2g-treatment-profile-v1" as const;
export const D2G_SEED_MANIFEST_SCHEMA_VERSION = "d2g-seed-manifest-v1" as const;
export const D2G_CANDIDATE_SOURCE = "production-decideAiAction" as const;

export type D2GProfilePhase = "smoke" | "calibration" | "formal";

export type D2GDecisionMode = "disabled" | "shadow" | "active";

export type D2GProfileId = "d2g-smoke-v1" | "d2g-calibration-v1" | "d2g-formal-v1";

export const D2G_PROFILE_IDS = Object.freeze([
  "d2g-smoke-v1",
  "d2g-calibration-v1",
  "d2g-formal-v1",
] as const);

export type D2GFallbackReason =
  | "disabled"
  | "rollout-unusable"
  | "stale-decision"
  | "candidate-mapping-failed"
  | "candidate-no-longer-legal"
  | "rollout-failed"
  | "unexpected-failure";

export type D2GDecisionContext = Readonly<{
  gameId: string;
  decisionIndex: number;
  actingSeat: PublicSeat;
  actingStrategy: "baseline" | "treatment";
  preActionGameplayStateHash: string;
  privateOwnHandFingerprint: string;
  candidateUniverseHash: string;
  decisionIdentity: string;
}>;

export type D2GDeterministicDecisionTelemetry = Readonly<{
  gameId: string;
  rotationPairKey: string;
  allocation: "AB" | "BA";
  actingSeat: PublicSeat;
  actingStrategy: "baseline" | "treatment";
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

export type D2GPerformanceTelemetry = Readonly<{
  elapsedMs: number;
  productionDecisionCostMs?: number;
  rolloutEvaluationCostMs?: number;
  treatmentIncrementalCostMs?: number;
}>;

export type D2GPerformanceQuantiles = Readonly<{
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}>;

export type D2GDecisionTelemetry = Readonly<{
  deterministic: D2GDeterministicDecisionTelemetry;
  performance: D2GPerformanceTelemetry;
}>;

export type D2GProductionDecision = Pick<AiDecision, "evaluatedCandidates">;
export type D2GProductionEvaluatedCandidates = D2GProductionDecision["evaluatedCandidates"];
export type D2GCandidateIdentity = CanonicalCandidateIdentity;
export type D2GCandidateUniverse = readonly D2GCandidateIdentity[];

export type D2GCandidateMappingResult =
  | Readonly<{ ok: true; candidateId: D2GCandidateIdentity }>
  | Readonly<{ ok: false; reason: "candidate-mapping-failed" }>;

export type D2GBenchmarkMetadata = Readonly<{
  benchmarkVersion: string;
  sourceCommit: string;
  engineVersion: string;
  roomRulesFingerprint: string;
  candidateOrderingVersion: string;
  statisticsSchemaVersion: string;
  reportSchemaVersion: string;
}>;

export type D2GTreatmentBudget = Readonly<{
  particleCount: number;
}> & RolloutBudget;

export type D2GFormalProfileApproval = Readonly<{
  approved: true;
  calibrationProfileHash: string;
}>;

export type D2GTreatmentProfile = Readonly<{
  schemaVersion: typeof D2G_PROFILE_SCHEMA_VERSION;
  profileVersion: typeof D2G_PROFILE_VERSION;
  profileId: D2GProfileId;
  phase: D2GProfilePhase;
  budget: D2GTreatmentBudget;
  evidenceRequirements: RolloutEvidenceRequirements;
  riskPolicy: RolloutRiskPolicy;
  rolloutPolicyId: RolloutPolicyId;
  benchmarkMetadata: D2GBenchmarkMetadata;
  calibrationApproval?: D2GFormalProfileApproval;
  configurationHash: string;
}>;

export type D2GSeedManifest = Readonly<{
  schemaVersion: typeof D2G_SEED_MANIFEST_SCHEMA_VERSION;
  phase: D2GProfilePhase;
  manifestId: string;
  profileId: D2GProfileId;
  profileConfigurationHash: string;
  seeds: readonly number[];
  manifestHash: string;
}>;

type D2GTreatmentProfileConfiguration = Omit<D2GTreatmentProfile, "configurationHash">;
type D2GSeedManifestConfiguration = Omit<D2GSeedManifest, "manifestHash">;

export type D2GDecisionIdentityInput = Readonly<{
  gameId: string;
  decisionIndex: number;
  actingSeat: PublicSeat;
  actingStrategy: "baseline" | "treatment";
  preActionGameplayStateHash: string;
  privateOwnHandFingerprint: string;
  candidateUniverseHash: string;
}>;

export function candidateIdentityFromAction(action: RolloutAction): D2GCandidateIdentity {
  return canonicalActionIdentity(action);
}

export function createD2GCandidateUniverse(decision: D2GProductionDecision): D2GCandidateUniverse {
  try {
    const candidateUniverse = decision.evaluatedCandidates.map(({ candidate }) => candidateIdentityFromAction(candidate.action));
    assertCandidateUniverse(candidateUniverse);
    return Object.freeze([...candidateUniverse]);
  } catch {
    throw new Error("D2G_CANDIDATE_UNIVERSE_INVALID");
  }
}

export function validateD2GCandidateIdentity(
  candidateId: D2GCandidateIdentity,
  decision: D2GProductionDecision,
): D2GCandidateMappingResult {
  if (!isNonEmptyString(candidateId)) return { ok: false, reason: "candidate-mapping-failed" };
  let candidateUniverse: D2GCandidateUniverse;
  try {
    candidateUniverse = createD2GCandidateUniverse(decision);
  } catch {
    return { ok: false, reason: "candidate-mapping-failed" };
  }
  const matches = candidateUniverse.filter((currentId) => currentId === candidateId);
  if (matches.length !== 1) return { ok: false, reason: "candidate-mapping-failed" };
  return { ok: true, candidateId };
}

export function computeD2GCandidateUniverseHash(decision: D2GProductionDecision): string {
  const candidateUniverse = createD2GCandidateUniverse(decision);
  assertCandidateUniverse(candidateUniverse);
  return hashCanonical({
    schemaVersion: "d2g-candidate-universe-v1",
    candidateUniverse,
  });
}

export function computeD2GDecisionIdentity(input: D2GDecisionIdentityInput): string {
  assertDecisionIdentityInput(input);
  return hashCanonical({
    schemaVersion: "d2g-decision-identity-v1",
    ...input,
  });
}

export function serializeD2GDeterministicTelemetry(telemetry: D2GDeterministicDecisionTelemetry): string {
  return canonicalJson({
    gameId: telemetry.gameId,
    rotationPairKey: telemetry.rotationPairKey,
    allocation: telemetry.allocation,
    actingSeat: telemetry.actingSeat,
    actingStrategy: telemetry.actingStrategy,
    decisionIdentity: telemetry.decisionIdentity,
    candidateUniverseHash: telemetry.candidateUniverseHash,
    preActionGameplayStateHash: telemetry.preActionGameplayStateHash,
    stateValidation: telemetry.stateValidation,
    baselineCandidateId: telemetry.baselineCandidateId,
    treatmentCandidateId: telemetry.treatmentCandidateId,
    selectedCandidateId: telemetry.selectedCandidateId,
    selection: telemetry.selection,
    fallbackReason: telemetry.fallbackReason,
    disagreement: telemetry.disagreement,
    rankingHash: telemetry.rankingHash,
    rolloutWorkUnits: telemetry.rolloutWorkUnits,
  });
}

export function createD2GTreatmentProfile(input: unknown): D2GTreatmentProfile {
  const profileInput = asRecord(input);
  assertProfileInput(profileInput);

  const phase = profileInput.phase as D2GProfilePhase;
  const profileId = profileInput.profileId as D2GProfileId;
  const calibrationApproval = phase === "formal"
    ? readFormalApproval(profileInput.calibrationApproval)
    : undefined;
  const configuration: D2GTreatmentProfileConfiguration = {
    schemaVersion: D2G_PROFILE_SCHEMA_VERSION,
    profileVersion: D2G_PROFILE_VERSION,
    profileId,
    phase,
    budget: readBudget(profileInput.budget),
    evidenceRequirements: readEvidenceRequirements(profileInput.evidenceRequirements),
    riskPolicy: readRiskPolicy(profileInput.riskPolicy),
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: readBenchmarkMetadata(profileInput.benchmarkMetadata),
    ...(calibrationApproval === undefined ? {} : { calibrationApproval }),
  };
  const profile = {
    ...configuration,
    configurationHash: hashCanonical(configuration),
  } as D2GTreatmentProfile;
  return deepFreeze(profile);
}

export function serializeD2GTreatmentProfile(profile: D2GTreatmentProfile): string {
  return canonicalJson(profile);
}

export function computeD2GTreatmentProfileConfigurationHash(profile: D2GTreatmentProfile): string {
  const { configurationHash: _configurationHash, ...configuration } = profile;
  return hashCanonical(configuration);
}

export function createD2GSeedManifest(input: unknown): D2GSeedManifest {
  const manifestInput = asRecord(input);
  if (manifestInput.schemaVersion !== D2G_SEED_MANIFEST_SCHEMA_VERSION) throw new Error("D2G_SEED_MANIFEST_SCHEMA_INVALID");
  const phase = assertPhase(manifestInput.phase);
  const profileId = assertProfileId(manifestInput.profileId);
  assertProfileIdMatchesPhase(profileId, phase);
  const profileConfigurationHash = manifestInput.profileConfigurationHash;
  if (typeof profileConfigurationHash !== "string" || !/^[0-9a-f]{64}$/.test(profileConfigurationHash)) {
    throw new Error("D2G_PROFILE_CONFIGURATION_HASH_INVALID");
  }
  if (!isNonEmptyString(manifestInput.manifestId)) throw new Error("D2G_MANIFEST_ID_INVALID");
  if (!Array.isArray(manifestInput.seeds) || manifestInput.seeds.length === 0) throw new Error("D2G_SEEDS_INVALID");

  const seeds = manifestInput.seeds.map((seed) => {
    if (!isNonNegativeSafeInteger(seed)) throw new Error("D2G_SEEDS_INVALID");
    return seed;
  });
  if (new Set(seeds).size !== seeds.length) throw new Error("D2G_SEEDS_INVALID");

  const configuration: D2GSeedManifestConfiguration = {
    schemaVersion: D2G_SEED_MANIFEST_SCHEMA_VERSION,
    phase,
    manifestId: manifestInput.manifestId,
    profileId,
    profileConfigurationHash,
    seeds: Object.freeze([...seeds]),
  };
  return deepFreeze({
    ...configuration,
    manifestHash: hashCanonical(configuration),
  });
}

export function assertD2GSeedManifestsDisjoint(
  calibrationManifest: D2GSeedManifest,
  formalManifest: D2GSeedManifest,
): void {
  if (calibrationManifest.phase !== "calibration" || formalManifest.phase !== "formal") {
    throw new Error("D2G_SEED_PHASE_INVALID");
  }
  const formalSeeds = new Set(formalManifest.seeds);
  if (calibrationManifest.seeds.some((seed) => formalSeeds.has(seed))) throw new Error("D2G_SEED_OVERLAP");
}

function assertProfileInput(input: Record<string, unknown>): void {
  if (input.schemaVersion !== D2G_PROFILE_SCHEMA_VERSION) throw new Error("D2G_PROFILE_SCHEMA_INVALID");
  if (input.profileVersion !== D2G_PROFILE_VERSION) throw new Error("D2G_PROFILE_VERSION_INVALID");
  const phase = assertPhase(input.phase);
  const profileId = assertProfileId(input.profileId);
  assertProfileIdMatchesPhase(profileId, phase);
  if (phase === "formal") {
    readFormalApproval(input.calibrationApproval);
  } else if (input.calibrationApproval !== undefined) {
    throw new Error("D2G_FORMAL_APPROVAL_INVALID");
  }
  if (input.rolloutPolicyId !== "d2f-lightweight-v1") throw new Error("D2G_ROLLOUT_POLICY_ID_INVALID");
  readBudget(input.budget);
  readEvidenceRequirements(input.evidenceRequirements);
  readRiskPolicy(input.riskPolicy);
  readBenchmarkMetadata(input.benchmarkMetadata);
}

function assertPhase(value: unknown): D2GProfilePhase {
  if (value !== "smoke" && value !== "calibration" && value !== "formal") throw new Error("D2G_PHASE_INVALID");
  return value;
}

function assertProfileId(value: unknown): D2GProfileId {
  if (value !== "d2g-smoke-v1" && value !== "d2g-calibration-v1" && value !== "d2g-formal-v1") throw new Error("D2G_PROFILE_ID_INVALID");
  return value;
}

function assertProfileIdMatchesPhase(profileId: D2GProfileId, phase: D2GProfilePhase): void {
  const expected = `d2g-${phase}-v1`;
  if (profileId !== expected) throw new Error("D2G_PROFILE_ID_INVALID");
}

function readBudget(value: unknown): D2GTreatmentBudget {
  const budget = asRecord(value);
  const fields = [
    "particleCount",
    "replicateCountPerScenario",
    "maxPliesPerReplicate",
    "maxPolicyActionEvaluationsPerPly",
    "maxWorkUnits",
  ] as const;
  for (const field of fields) {
    if (!isPositiveSafeInteger(budget[field])) throw new Error("D2G_BUDGET_INVALID");
  }
  return Object.freeze({
    particleCount: budget.particleCount as number,
    replicateCountPerScenario: budget.replicateCountPerScenario as number,
    maxPliesPerReplicate: budget.maxPliesPerReplicate as number,
    maxPolicyActionEvaluationsPerPly: budget.maxPolicyActionEvaluationsPerPly as number,
    maxWorkUnits: budget.maxWorkUnits as number,
  });
}

function readEvidenceRequirements(value: unknown): RolloutEvidenceRequirements {
  const evidence = asRecord(value);
  if (evidence.schemaVersion !== "d2f-rollout-evidence-requirements-v1" || evidence.requireCompleteCoverage !== true) {
    throw new Error("D2G_EVIDENCE_REQUIREMENTS_INVALID");
  }
  for (const field of ["minimumEffectiveSampleSize", "minimumAcceptedScenarioCount", "minimumCompletedReplicateCount"] as const) {
    if (!isPositiveSafeInteger(evidence[field])) throw new Error("D2G_EVIDENCE_REQUIREMENTS_INVALID");
  }
  return Object.freeze({
    schemaVersion: evidence.schemaVersion,
    minimumEffectiveSampleSize: evidence.minimumEffectiveSampleSize as number,
    minimumAcceptedScenarioCount: evidence.minimumAcceptedScenarioCount as number,
    minimumCompletedReplicateCount: evidence.minimumCompletedReplicateCount as number,
    requireCompleteCoverage: true,
  });
}

function readRiskPolicy(value: unknown): RolloutRiskPolicy {
  const risk = asRecord(value);
  if (risk.schemaVersion !== "d2f-rollout-risk-policy-v1" || !isNonNegativeNumber(risk.variancePenalty) || !isNonNegativeNumber(risk.downsideRiskPenalty)) {
    throw new Error("D2G_RISK_POLICY_INVALID");
  }
  return Object.freeze({
    schemaVersion: risk.schemaVersion,
    variancePenalty: risk.variancePenalty,
    downsideRiskPenalty: risk.downsideRiskPenalty,
  });
}

function readBenchmarkMetadata(value: unknown): D2GBenchmarkMetadata {
  const metadata = asRecord(value);
  const fields = [
    "benchmarkVersion",
    "sourceCommit",
    "engineVersion",
    "roomRulesFingerprint",
    "candidateOrderingVersion",
    "statisticsSchemaVersion",
    "reportSchemaVersion",
  ] as const;
  for (const field of fields) {
    if (!isNonEmptyString(metadata[field])) throw new Error("D2G_BENCHMARK_METADATA_INVALID");
  }
  return Object.freeze({
    benchmarkVersion: metadata.benchmarkVersion as string,
    sourceCommit: metadata.sourceCommit as string,
    engineVersion: metadata.engineVersion as string,
    roomRulesFingerprint: metadata.roomRulesFingerprint as string,
    candidateOrderingVersion: metadata.candidateOrderingVersion as string,
    statisticsSchemaVersion: metadata.statisticsSchemaVersion as string,
    reportSchemaVersion: metadata.reportSchemaVersion as string,
  });
}

function readFormalApproval(value: unknown): D2GFormalProfileApproval {
  if (value === undefined) throw new Error("D2G_FORMAL_APPROVAL_REQUIRED");
  const approval = asRecord(value);
  if (approval.approved !== true || !/^[0-9a-f]{64}$/.test(String(approval.calibrationProfileHash))) {
    throw new Error("D2G_FORMAL_APPROVAL_REQUIRED");
  }
  return Object.freeze({
    approved: true,
    calibrationProfileHash: approval.calibrationProfileHash as string,
  });
}

function assertCandidateUniverse(value: D2GCandidateUniverse): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((candidateId) => !isNonEmptyString(candidateId))) {
    throw new Error("D2G_CANDIDATE_UNIVERSE_INVALID");
  }
  if (new Set(value).size !== value.length) throw new Error("D2G_CANDIDATE_UNIVERSE_INVALID");
}

function assertDecisionIdentityInput(input: D2GDecisionIdentityInput): void {
  if (!isNonEmptyString(input.gameId) || !isNonNegativeSafeInteger(input.decisionIndex) || !isNonNegativeSafeInteger(input.actingSeat)) {
    throw new Error("D2G_DECISION_IDENTITY_INVALID");
  }
  if (input.actingStrategy !== "baseline" && input.actingStrategy !== "treatment") throw new Error("D2G_DECISION_IDENTITY_INVALID");
  for (const field of ["preActionGameplayStateHash", "privateOwnHandFingerprint", "candidateUniverseHash"] as const) {
    if (!isNonEmptyString(input[field])) throw new Error("D2G_DECISION_IDENTITY_INVALID");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("D2G_INPUT_INVALID");
  return value as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
