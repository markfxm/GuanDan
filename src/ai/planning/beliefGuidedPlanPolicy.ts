import {
  assertLightweightPublicEvidencePrivacy,
  type LightweightPublicEvidence,
} from "../belief/lightweightPublicEvidence";
import type { HandPlan } from "../contracts";

export type PlanPruningMode = "disabled" | "shadow";

export type D2cPlanFamily =
  | "active"
  | "urgent-defense"
  | "finishability"
  | "uncertainty-cover"
  | "power-preserving"
  | "alternative"
  | "other";

export type D2cFallbackReason =
  | "disabled-by-config"
  | "no-candidates-action-only"
  | "invalid-evidence"
  | "stale-evidence"
  | "unknown-evidence-schema"
  | "candidate-count-overflow"
  | "duplicate-plan-key"
  | "missing-plan-key"
  | "invalid-family-annotation"
  | "invalid-quota-config"
  | "quota-exceeds-budget"
  | "unknown-mode"
  | "privacy-violation";

export type D2cEvidenceSnapshotRef = Readonly<{
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  eventIndex: number;
}>;

export type D2cQuotaConfig = Readonly<{
  schemaVersion: "d2c-plan-quota-v1";
  maxPlanFamilies: number;
  maxPlanExpansions: number;
  minQuotaPerFamily: number;
  maxQuotaPerFamily: number;
}>;

export type D2cPlanCandidate = Readonly<{
  plan: HandPlan;
  protectedGroupIds: readonly string[];
}>;

export type D2cPlanPolicyInput = Readonly<{
  schemaVersion: "d2c-plan-policy-input-v1";
  evidence: LightweightPublicEvidence;
  expectedEvidenceSnapshot: D2cEvidenceSnapshotRef;
  candidatePlans: readonly D2cPlanCandidate[];
  activePlanId?: string;
  mode: PlanPruningMode;
  quotaConfig: D2cQuotaConfig;
}>;

export type D2cPriorityTuple = readonly [
  familyTier: number,
  publicSignalTier: number,
  candidateQuality: number,
  stablePlanKey: string,
];

export type D2cPlanAnnotation = Readonly<{
  stablePlanKey: string;
  familyIds: readonly D2cPlanFamily[];
  ownerFamily: D2cPlanFamily;
  priority: D2cPriorityTuple;
}>;

export type D2cFamilyPriority = Readonly<{
  family: D2cPlanFamily;
  priority: number;
  candidatePlanKeys: readonly string[];
}>;

export type D2cFamilyQuota = Readonly<{
  family: D2cPlanFamily;
  quota: number;
}>;

export type D2cDiagnostics = Readonly<{
  candidateCount: number;
  familyCount: number;
  selectedFamilyCount: number;
  quotaTotal: number;
  mode: PlanPruningMode;
  fallbackReason?: D2cFallbackReason;
}>;

export type D2cDisabledResult = Readonly<{
  schemaVersion: "d2c-plan-policy-result-v1";
  kind: "disabled";
  mode: "disabled";
  candidateCount: number;
  annotations: readonly [];
  familyPriority: readonly [];
  familyQuotas: readonly [];
  diagnostics: D2cDiagnostics;
  fallbackReason: D2cFallbackReason;
}>;

export type D2cShadowResult = Readonly<{
  schemaVersion: "d2c-plan-policy-result-v1";
  kind: "shadow";
  mode: "shadow";
  candidateCount: number;
  annotations: Readonly<Record<string, D2cPlanAnnotation>>;
  familyPriority: readonly D2cFamilyPriority[];
  familyQuotas: readonly D2cFamilyQuota[];
  diagnostics: D2cDiagnostics;
}>;

export type D2cPlanPolicyResult =
  | D2cDisabledResult
  | D2cShadowResult;

type UnknownRecord = Record<string, unknown>;

type CandidateProjection = Readonly<{
  stablePlanKey: string;
  familyIds: readonly D2cPlanFamily[];
  ownerFamily: D2cPlanFamily;
  priority: D2cPriorityTuple;
}>;

type FamilyProjection = {
  family: D2cPlanFamily;
  members: CandidateProjection[];
  priority: number;
  strongestMember: CandidateProjection;
};

const D2C_SCORE_SCALE = 1_000_000;

const FAMILY_TIERS: Readonly<Record<D2cPlanFamily, number>> = {
  "urgent-defense": 500,
  active: 400,
  finishability: 300,
  "power-preserving": 300,
  "uncertainty-cover": 200,
  alternative: 100,
  other: 0,
};

const POWER_GROUP_TYPES = new Set(["bomb", "straight-flush", "joker-bomb"]);
const OUTPUT_FORBIDDEN_KEYS = new Set(
  [
    ["partner", "Hand"],
    ["opponents", "Hands"],
    ["hand", "s"],
    ["initial", "Hands"],
    ["de", "ck"],
    ["hidden", "Initial", "Hand"],
    ["hidden", "State"],
    ["full", "State"],
    ["hypothetical", "Hands"],
    ["Particle", "Bank"],
    ["particle", "s"],
    ["pro", "vider"],
    ["sto", "re"],
    ["identity", "Provider"],
    ["identity", "Store"],
    ["pro", "vider", "Identity"],
    ["installation", "Identity"],
    ["idempotency", "Key"],
    ["game", "Sequence"],
    ["room", "Transport", "Id"],
    ["private", "Runtime"],
    ["ser", "ver"],
    ["treat", "ment"],
    ["bench", "mark"],
    ["sim", "ulation"],
    ["per", "formance"],
    ["smo", "ke"],
    ["calib", "ration"],
    ["form", "al"],
  ].map((parts) => parts.join("").toLowerCase()),
);

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object"
    ? value as UnknownRecord
    : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isPublicSeat(value: unknown): boolean {
  return isNonNegativeInteger(value) && value <= 3;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUniqueNonEmptyStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isNonEmptyString(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function isRelationCounts(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  return ["self", "partner", "leftOpponent", "rightOpponent"]
    .every((key) => isNonNegativeInteger(record[key]));
}

function isEvidenceStructure(value: unknown): D2cFallbackReason | undefined {
  const evidence = asRecord(value);
  if (!evidence) return "invalid-evidence";
  if (evidence.schemaVersion !== "d2-lightweight-evidence-v1") {
    return "unknown-evidence-schema";
  }
  if (
    !isNonEmptyString(evidence.gameId) ||
    !isNonEmptyString(evidence.roundIdentity) ||
    !isNonEmptyString(evidence.handIdentity) ||
    !isNonNegativeInteger(evidence.eventIndex) ||
    !isPublicSeat(evidence.perspectiveSeat)
  ) return "invalid-evidence";

  const seatMap = asRecord(evidence.seatMap);
  if (!seatMap || !["self", "partner", "leftOpponent", "rightOpponent"]
    .every((key) => isPublicSeat(seatMap[key]))) return "invalid-evidence";

  const facts = asRecord(evidence.hardPublicFacts);
  if (!facts || !isRelationCounts(facts.remainingCardCounts)) return "invalid-evidence";
  if (!asRecord(facts.currentTrick) || !isPublicSeat(asRecord(facts.currentTrick)?.leadSeat)) {
    return "invalid-evidence";
  }
  if (
    typeof facts.initiativeRelation !== "string" ||
    !Array.isArray(facts.playedCardIds) ||
    !facts.playedCardIds.every((item) => typeof item === "string") ||
    !Array.isArray(facts.playedCardClasses) ||
    !facts.playedCardClasses.every((item) => typeof item === "string") ||
    !Array.isArray(facts.publicTransfers) ||
    !Array.isArray(facts.publicTributeEvents) ||
    !facts.publicTributeEvents.every((item) => typeof item === "string") ||
    !Array.isArray(facts.finishOrder) ||
    !facts.finishOrder.every((item) => typeof item === "string")
  ) return "invalid-evidence";

  const derived = asRecord(evidence.derivedSignals);
  if (!derived || !Array.isArray(derived.recentActions) || !isRelationCounts(derived.recentPassStreakByRelation)) {
    return "invalid-evidence";
  }
  const tendencies = asRecord(derived.recentActionTendencies);
  if (!tendencies || !["self", "partner", "leftOpponent", "rightOpponent"]
    .every((key) => {
      const tendency = asRecord(tendencies[key]);
      if (!tendency) return false;
      return isNonNegativeInteger(tendency.playCount) &&
        isNonNegativeInteger(tendency.passCount);
    })) return "invalid-evidence";

  if (!Array.isArray(evidence.provenance)) return "invalid-evidence";
  return undefined;
}

function isSnapshotReference(value: unknown): value is D2cEvidenceSnapshotRef {
  const snapshot = asRecord(value);
  if (!snapshot) return false;
  return isNonEmptyString(snapshot.gameId) &&
    isNonEmptyString(snapshot.roundIdentity) &&
    isNonEmptyString(snapshot.handIdentity) &&
    isNonNegativeInteger(snapshot.eventIndex);
}

function validateCandidateEnvelope(
  candidatePlans: unknown,
  activePlanId: unknown,
): D2cFallbackReason | undefined {
  if (!Array.isArray(candidatePlans)) return "invalid-family-annotation";
  if (candidatePlans.length > 5) return "candidate-count-overflow";
  const seen = new Set<string>();
  for (const value of candidatePlans) {
    const candidate = asRecord(value);
    const plan = asRecord(candidate?.plan);
    if (!candidate || !plan || !isNonEmptyString(plan.id)) return "missing-plan-key";
    if (seen.has(plan.id)) return "duplicate-plan-key";
    seen.add(plan.id);
    const metrics = asRecord(plan.metrics);
    if (!Array.isArray(plan.groups) || !metrics) return "invalid-family-annotation";
    if (!isUniqueNonEmptyStringArray(candidate.protectedGroupIds)) return "invalid-family-annotation";
    if (!["estimatedTurns", "lowSingleCount", "retainedControl", "responseCoverage", "leadFlexibility", "protectionLoss"]
      .every((key) => isFiniteNumber(metrics[key]))) return "invalid-family-annotation";
  }
  if (activePlanId !== undefined && !isNonEmptyString(activePlanId)) return "missing-plan-key";
  if (activePlanId !== undefined && !seen.has(activePlanId)) return "stale-evidence";
  return undefined;
}

function validateQuotaConfig(value: unknown): D2cFallbackReason | undefined {
  const config = asRecord(value);
  if (!config || config.schemaVersion !== "d2c-plan-quota-v1") return "invalid-quota-config";
  const maxPlanFamilies = config.maxPlanFamilies;
  const maxPlanExpansions = config.maxPlanExpansions;
  const minQuotaPerFamily = config.minQuotaPerFamily;
  const maxQuotaPerFamily = config.maxQuotaPerFamily;
  if (!isInteger(maxPlanFamilies) || maxPlanFamilies < 1 || maxPlanFamilies > 5) return "invalid-quota-config";
  if (!isInteger(maxPlanExpansions) || maxPlanExpansions < 0 || maxPlanExpansions > 5) return "invalid-quota-config";
  if (!isInteger(minQuotaPerFamily) || minQuotaPerFamily < 1 || minQuotaPerFamily > 5) return "invalid-quota-config";
  if (!isInteger(maxQuotaPerFamily) || maxQuotaPerFamily < 1 || maxQuotaPerFamily > 5) return "invalid-quota-config";
  if (minQuotaPerFamily > maxQuotaPerFamily) return "invalid-quota-config";
  if (maxPlanExpansions > 0 && minQuotaPerFamily > maxPlanExpansions) return "invalid-quota-config";
  return undefined;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function normalizeOutputKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function containsForbiddenOutputKey(value: unknown): boolean {
  const seen = new Set<object>();

  function visit(current: unknown): boolean {
    if (current === null || typeof current !== "object") return false;
    if (seen.has(current)) return false;
    seen.add(current);

    for (const key of Object.getOwnPropertyNames(current)) {
      if (OUTPUT_FORBIDDEN_KEYS.has(normalizeOutputKey(key))) return true;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor && visit(descriptor.value)) return true;
    }
    return false;
  }

  return visit(value);
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function roundD2cScore(value: number): number {
  const rounded = Math.round(value * D2C_SCORE_SCALE) / D2C_SCORE_SCALE;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function canonicalEstimatedTurns(candidate: D2cPlanCandidate): number {
  return roundD2cScore(candidate.plan.metrics.estimatedTurns);
}

function canonicalProtectionLoss(candidate: D2cPlanCandidate): number {
  return roundD2cScore(candidate.plan.metrics.protectionLoss);
}

function hasPowerGroup(candidate: D2cPlanCandidate): boolean {
  return candidate.plan.groups.some((group) => POWER_GROUP_TYPES.has(group.type));
}

function candidateQuality(candidate: D2cPlanCandidate): number | undefined {
  const metrics = candidate.plan.metrics;
  const raw =
    1000 -
    100 * metrics.estimatedTurns -
    10 * metrics.lowSingleCount +
    10 * metrics.retainedControl +
    5 * metrics.responseCoverage +
    5 * metrics.leadFlexibility -
    50 * metrics.protectionLoss;
  if (!Number.isFinite(raw)) return undefined;
  const rounded = roundD2cScore(raw);
  return Number.isFinite(rounded) ? rounded : undefined;
}

function comparePriority(
  left: D2cPriorityTuple,
  right: D2cPriorityTuple,
): number {
  if (left[0] !== right[0]) return right[0] - left[0];
  if (left[1] !== right[1]) return right[1] - left[1];
  if (left[2] !== right[2]) return right[2] - left[2];
  return compareStableText(left[3], right[3]);
}

function compareCandidates(
  left: CandidateProjection,
  right: CandidateProjection,
): number {
  return comparePriority(left.priority, right.priority);
}

function publicSignals(evidence: LightweightPublicEvidence): {
  urgency: boolean;
  uncertainty: boolean;
  highValue: boolean;
} {
  const counts = evidence.hardPublicFacts.remainingCardCounts;
  const finishOrder = evidence.hardPublicFacts.finishOrder;
  const left = evidence.derivedSignals.recentActionTendencies.leftOpponent;
  const right = evidence.derivedSignals.recentActionTendencies.rightOpponent;
  return {
    urgency:
      counts.leftOpponent <= 2 ||
      counts.rightOpponent <= 2 ||
      finishOrder.includes("leftOpponent") ||
      finishOrder.includes("rightOpponent"),
    uncertainty:
      evidence.derivedSignals.recentActions.length > 0 &&
      ((left.playCount > 0 && left.passCount > 0) ||
        (right.playCount > 0 && right.passCount > 0)),
    highValue:
      counts.leftOpponent <= 5 ||
      counts.rightOpponent <= 5 ||
      finishOrder.length > 0,
  };
}

function familyLabelSort(left: D2cPlanFamily, right: D2cPlanFamily): number {
  const tierDifference = FAMILY_TIERS[right] - FAMILY_TIERS[left];
  return tierDifference !== 0
    ? tierDifference
    : compareStableText(left, right);
}

function classifyBaseFamilies(
  candidate: D2cPlanCandidate,
  activePlanId: string | undefined,
  signals: ReturnType<typeof publicSignals>,
  minimumEstimatedTurns: number,
): D2cPlanFamily[] {
  const metrics = candidate.plan.metrics;
  const labels: D2cPlanFamily[] = [];
  if (activePlanId !== undefined && activePlanId === candidate.plan.id) {
    labels.push("active");
  }
  if (
    signals.urgency &&
    (metrics.responseCoverage > 0 ||
      candidate.protectedGroupIds.length > 0 ||
      candidate.plan.groups.some((group) => group.cards.length > 1))
  ) {
    labels.push("urgent-defense");
  }
  if (canonicalEstimatedTurns(candidate) === minimumEstimatedTurns) {
    labels.push("finishability");
  }
  if (
    candidate.protectedGroupIds.length > 0 ||
    (hasPowerGroup(candidate) && canonicalProtectionLoss(candidate) === 0)
  ) {
    labels.push("power-preserving");
  }
  if (
    signals.uncertainty &&
    (metrics.responseCoverage > 0 || metrics.leadFlexibility >= 2)
  ) {
    labels.push("uncertainty-cover");
  }
  return labels;
}

function ownerFamily(familyIds: readonly D2cPlanFamily[]): D2cPlanFamily {
  return [...familyIds].sort(familyLabelSort)[0] ?? "other";
}

function strongestNonActiveFamily(
  familyIds: readonly D2cPlanFamily[],
): D2cPlanFamily | undefined {
  return [...familyIds]
    .filter((family) => family !== "active")
    .sort(familyLabelSort)[0];
}

function buildCandidateProjections(
  candidates: readonly D2cPlanCandidate[],
  evidence: LightweightPublicEvidence,
  activePlanId: string | undefined,
): CandidateProjection[] | D2cFallbackReason {
  const signals = publicSignals(evidence);
  const minimumEstimatedTurns = Math.min(
    ...candidates.map(canonicalEstimatedTurns),
  );
  const base = candidates.map((candidate) => {
    const quality = candidateQuality(candidate);
    if (quality === undefined) return undefined;
    const labels = classifyBaseFamilies(
      candidate,
      activePlanId,
      signals,
      minimumEstimatedTurns,
    );
    return { candidate, quality, labels };
  });
  if (base.some((item) => item === undefined)) return "invalid-family-annotation";

  const active = base.find((item) => item?.labels.includes("active"));
  const activeStrongestNonActiveFamily = strongestNonActiveFamily(active?.labels ?? []);
  const projections: CandidateProjection[] = [];
  for (const item of base) {
    if (!item) return "invalid-family-annotation";
    const labels = [...item.labels];
    const nonActiveLabels = labels.filter((family) => family !== "active");
    const challengerStrongestNonActiveFamily = strongestNonActiveFamily(item.labels);
    if (
      nonActiveLabels.length >= 2 ||
      (activePlanId !== undefined &&
        item.candidate.plan.id !== activePlanId &&
        challengerStrongestNonActiveFamily !== undefined &&
        challengerStrongestNonActiveFamily !== activeStrongestNonActiveFamily)
    ) {
      labels.push("alternative");
    }
    if (labels.length === 0) labels.push("other");
    const familyIds = [...new Set(labels)].sort(familyLabelSort);
    const familyTier = Math.max(...familyIds.map((family) => FAMILY_TIERS[family]));
    const publicSignalTier = signals.urgency ? 2 : signals.highValue ? 1 : 0;
    projections.push({
      stablePlanKey: item.candidate.plan.id,
      familyIds,
      ownerFamily: ownerFamily(familyIds),
      priority: [familyTier, publicSignalTier, item.quality, item.candidate.plan.id],
    });
  }
  return projections;
}

function familyProjections(
  projections: readonly CandidateProjection[],
): FamilyProjection[] {
  const byFamily = new Map<D2cPlanFamily, CandidateProjection[]>();
  for (const projection of projections) {
    const members = byFamily.get(projection.ownerFamily) ?? [];
    members.push(projection);
    byFamily.set(projection.ownerFamily, members);
  }
  return [...byFamily.entries()]
    .map(([family, members]) => {
      const sortedMembers = [...members].sort(compareCandidates);
      return {
        family,
        members: sortedMembers,
        priority: FAMILY_TIERS[family],
        strongestMember: sortedMembers[0],
      };
    })
    .sort((left, right) => {
      const memberOrder = compareCandidates(left.strongestMember, right.strongestMember);
      return memberOrder !== 0
        ? memberOrder
        : compareStableText(left.family, right.family);
    });
}

function allocateFamilyQuotas(
  families: readonly FamilyProjection[],
  config: D2cQuotaConfig,
): { quotas: D2cFamilyQuota[]; total: number } | D2cFallbackReason {
  if (config.maxPlanExpansions === 0) return { quotas: [], total: 0 };
  const maximumFamilyCount = Math.min(
    config.maxPlanFamilies,
    Math.floor(config.maxPlanExpansions / config.minQuotaPerFamily),
  );
  const selected = families
    .slice(0, maximumFamilyCount)
    .map((family) => ({
      family,
      quota: Math.min(
        config.minQuotaPerFamily,
        family.members.length,
        config.maxQuotaPerFamily,
      ),
    }));
  let total = selected.reduce((sum, item) => sum + item.quota, 0);
  while (total < config.maxPlanExpansions) {
    const eligible = selected
      .filter((item) => item.quota < Math.min(item.family.members.length, config.maxQuotaPerFamily))
      .sort((left, right) => {
        const leftDeficit = Math.min(left.family.members.length, config.maxQuotaPerFamily) - left.quota;
        const rightDeficit = Math.min(right.family.members.length, config.maxQuotaPerFamily) - right.quota;
        return rightDeficit - leftDeficit ||
          families.indexOf(left.family) - families.indexOf(right.family) ||
          compareStableText(left.family.family, right.family.family);
      });
    const next = eligible[0];
    if (!next) break;
    next.quota += 1;
    total += 1;
  }
  const quotas = families
    .map((family) => selected.find((item) => item.family === family))
    .filter((item): item is { family: FamilyProjection; quota: number } => item !== undefined && item.quota > 0)
    .map((item) => ({ family: item.family.family, quota: item.quota }));
  const invalid = quotas.some((item) => !Number.isInteger(item.quota) || item.quota < 0 || item.quota > config.maxQuotaPerFamily) ||
    quotas.length !== new Set(quotas.map((item) => item.family)).size ||
    total > config.maxPlanExpansions ||
    total !== quotas.reduce((sum, item) => sum + item.quota, 0);
  if (invalid) return "quota-exceeds-budget";
  return { quotas, total };
}

function disabledResult(candidateCount: number, reason: D2cFallbackReason): D2cDisabledResult {
  return deepFreeze({
    schemaVersion: "d2c-plan-policy-result-v1",
    kind: "disabled",
    mode: "disabled",
    candidateCount,
    annotations: [],
    familyPriority: [],
    familyQuotas: [],
    diagnostics: {
      candidateCount,
      familyCount: 0,
      selectedFamilyCount: 0,
      quotaTotal: 0,
      mode: "disabled",
      fallbackReason: reason,
    },
    fallbackReason: reason,
  });
}

export function deriveD2cPlanPriorityQuota(
  input: D2cPlanPolicyInput,
): D2cPlanPolicyResult {
  const candidateCount = Array.isArray(input?.candidatePlans)
    ? input.candidatePlans.length
    : 0;
  if (input?.mode === "disabled") return disabledResult(candidateCount, "disabled-by-config");
  if (input?.mode !== "shadow") return disabledResult(candidateCount, "unknown-mode");

  if (input.schemaVersion !== "d2c-plan-policy-input-v1") return disabledResult(candidateCount, "invalid-evidence");
  const evidenceError = isEvidenceStructure(input.evidence);
  if (evidenceError) return disabledResult(candidateCount, evidenceError);
  try {
    assertLightweightPublicEvidencePrivacy(input.evidence);
  } catch (error) {
    if (error instanceof Error && error.message === "D2B_EVIDENCE_PRIVACY_VIOLATION") {
      return disabledResult(candidateCount, "privacy-violation");
    }
    throw error;
  }
  if (!isSnapshotReference(input.expectedEvidenceSnapshot)) return disabledResult(candidateCount, "invalid-evidence");
  if (
    input.evidence.gameId !== input.expectedEvidenceSnapshot.gameId ||
    input.evidence.roundIdentity !== input.expectedEvidenceSnapshot.roundIdentity ||
    input.evidence.handIdentity !== input.expectedEvidenceSnapshot.handIdentity ||
    input.evidence.eventIndex !== input.expectedEvidenceSnapshot.eventIndex
  ) return disabledResult(candidateCount, "stale-evidence");

  const candidateError = validateCandidateEnvelope(input.candidatePlans, input.activePlanId);
  if (candidateError) return disabledResult(candidateCount, candidateError);
  const quotaError = validateQuotaConfig(input.quotaConfig);
  if (quotaError) return disabledResult(candidateCount, quotaError);
  if (candidateCount === 0) return disabledResult(0, "no-candidates-action-only");

  const projections = buildCandidateProjections(
    input.candidatePlans,
    input.evidence,
    input.activePlanId,
  );
  if (typeof projections === "string") return disabledResult(candidateCount, projections);

  const annotations: Record<string, D2cPlanAnnotation> = Object.create(null) as Record<string, D2cPlanAnnotation>;
  for (const projection of [...projections].sort(compareCandidates)) {
    annotations[projection.stablePlanKey] = {
      stablePlanKey: projection.stablePlanKey,
      familyIds: projection.familyIds,
      ownerFamily: projection.ownerFamily,
      priority: projection.priority,
    };
  }

  const families = familyProjections(projections);
  const allocation = allocateFamilyQuotas(families, input.quotaConfig);
  if (typeof allocation === "string") return disabledResult(candidateCount, allocation);

  const shadowResult: D2cShadowResult = {
    schemaVersion: "d2c-plan-policy-result-v1",
    kind: "shadow",
    mode: "shadow",
    candidateCount,
    annotations,
    familyPriority: families.map((family) => ({
      family: family.family,
      priority: family.priority,
      candidatePlanKeys: family.members.map((member) => member.stablePlanKey),
    })),
    familyQuotas: allocation.quotas,
    diagnostics: {
      candidateCount,
      familyCount: families.length,
      selectedFamilyCount: allocation.quotas.length,
      quotaTotal: allocation.total,
      mode: "shadow",
    },
  };
  if (containsForbiddenOutputKey(shadowResult)) {
    return disabledResult(candidateCount, "privacy-violation");
  }
  return deepFreeze(shadowResult);
}
