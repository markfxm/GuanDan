import { describe, expect, it } from "vitest";
import type { RolloutEvidenceRequirements, RolloutRiskPolicy } from "../../../src/ai/rollout/contracts";
import {
  D2G_PROFILE_SCHEMA_VERSION,
  D2G_PROFILE_VERSION,
  computeD2GTreatmentProfileConfigurationHash,
  createD2GTreatmentProfile,
  serializeD2GTreatmentProfile,
} from "../../../src/ai/d2g/treatmentContracts";

const evidenceRequirements: RolloutEvidenceRequirements = {
  schemaVersion: "d2f-rollout-evidence-requirements-v1",
  minimumEffectiveSampleSize: 1,
  minimumAcceptedScenarioCount: 1,
  minimumCompletedReplicateCount: 1,
  requireCompleteCoverage: true,
};

const riskPolicy: RolloutRiskPolicy = {
  schemaVersion: "d2f-rollout-risk-policy-v1",
  variancePenalty: 0.1,
  downsideRiskPenalty: 0.2,
};

function profileInput(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: D2G_PROFILE_SCHEMA_VERSION,
    profileVersion: D2G_PROFILE_VERSION,
    profileId: "d2g-calibration-v1",
    phase: "calibration",
    budget: {
      particleCount: 3,
      replicateCountPerScenario: 4,
      maxPliesPerReplicate: 8,
      maxPolicyActionEvaluationsPerPly: 2,
      maxWorkUnits: 192,
    },
    evidenceRequirements,
    riskPolicy,
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: {
      benchmarkVersion: "d2g-benchmark-v1",
      sourceCommit: "a".repeat(40),
      engineVersion: "engine-v1",
      roomRulesFingerprint: "room-rules-v1",
      candidateOrderingVersion: "candidate-order-v1",
      statisticsSchemaVersion: "statistics-v1",
      reportSchemaVersion: "report-v1",
    },
    ...overrides,
  };
}

describe("D2G treatment profiles", () => {
  it("contains the versioned resource, evidence, risk, policy, and provenance fields", () => {
    const profile = createD2GTreatmentProfile(profileInput());

    expect(profile.schemaVersion).toBe(D2G_PROFILE_SCHEMA_VERSION);
    expect(profile.profileVersion).toBe(D2G_PROFILE_VERSION);
    expect(profile.phase).toBe("calibration");
    expect(profile.budget).toMatchObject({
      particleCount: 3,
      replicateCountPerScenario: 4,
      maxPliesPerReplicate: 8,
      maxPolicyActionEvaluationsPerPly: 2,
      maxWorkUnits: 192,
    });
    expect(profile.evidenceRequirements).toEqual(evidenceRequirements);
    expect(profile.riskPolicy).toEqual(riskPolicy);
    expect(profile.rolloutPolicyId).toBe("d2f-lightweight-v1");
    expect(profile.benchmarkMetadata.sourceCommit).toHaveLength(40);
    expect(profile.configurationHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces stable canonical serialization and configuration identity independent of key order", () => {
    const first = createD2GTreatmentProfile(profileInput());
    const second = createD2GTreatmentProfile({
      ...profileInput(),
      benchmarkMetadata: {
        reportSchemaVersion: "report-v1",
        statisticsSchemaVersion: "statistics-v1",
        candidateOrderingVersion: "candidate-order-v1",
        roomRulesFingerprint: "room-rules-v1",
        engineVersion: "engine-v1",
        sourceCommit: "a".repeat(40),
        benchmarkVersion: "d2g-benchmark-v1",
      },
    });

    expect(serializeD2GTreatmentProfile(first)).toBe(serializeD2GTreatmentProfile(second));
    expect(first.configurationHash).toBe(second.configurationHash);
    expect(computeD2GTreatmentProfileConfigurationHash(first)).toBe(first.configurationHash);
  });

  it("does not provide an unapproved formal profile or silently mutable profile object", () => {
    expect(() => createD2GTreatmentProfile(profileInput({
      phase: "formal",
      profileId: "d2g-formal-v1",
    }))).toThrow("D2G_FORMAL_APPROVAL_REQUIRED");

    const profile = createD2GTreatmentProfile(profileInput());
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.budget)).toBe(true);
    expect(Object.isFrozen(profile.benchmarkMetadata)).toBe(true);
  });

  it("rejects unknown profile ids and phase/profile mismatches", () => {
    expect(() => createD2GTreatmentProfile(profileInput({ profileId: "unknown" }))).toThrow("D2G_PROFILE_ID_INVALID");
    expect(() => createD2GTreatmentProfile(profileInput({ phase: "smoke", profileId: "d2g-calibration-v1" }))).toThrow("D2G_PROFILE_ID_INVALID");
  });
});
