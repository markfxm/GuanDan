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

const D2C_PLAN_POLICY_NOT_IMPLEMENTED =
  "D2C_PLAN_POLICY_NOT_IMPLEMENTED";

export function deriveD2cPlanPriorityQuota(
  input: D2cPlanPolicyInput,
): D2cPlanPolicyResult {
  void input;
  void assertLightweightPublicEvidencePrivacy;
  throw new Error(D2C_PLAN_POLICY_NOT_IMPLEMENTED);
}
