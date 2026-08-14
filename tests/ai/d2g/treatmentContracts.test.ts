import { describe, expect, expectTypeOf, it } from "vitest";
import type { RolloutRequest, RolloutResult } from "../../../src/ai/rollout/contracts";
import {
  D2G_CANDIDATE_SOURCE,
  D2G_PROFILE_SCHEMA_VERSION,
  D2G_PROFILE_VERSION,
  assertD2GSeedManifestsDisjoint,
  candidateIdentityFromAction,
  computeD2GCandidateUniverseHash,
  computeD2GDecisionIdentity,
  createD2GSeedManifest,
  serializeD2GDeterministicTelemetry,
  validateD2GCandidateIdentity,
  type D2GProductionDecision,
  type D2GFallbackReason,
} from "../../../src/ai/d2g/treatmentContracts";

describe("D2G treatment contracts", () => {
  const passAction = { type: "pass" } as const;
  const playAction = {
    type: "play" as const,
    group: {
      id: "single:S3-1",
      type: "single" as const,
      label: "single",
      purpose: "risk" as const,
      cards: [{ id: "S3-1", kind: "suited" as const, rank: "3" as const, suit: "spades" as const, copy: 1 as const }],
      wildcards: [],
      strength: 1,
    },
  };
  const productionDecision = {
    evaluatedCandidates: [
      { candidate: { action: passAction }, score: {} },
      { candidate: { action: playAction }, score: {} },
    ],
  } as unknown as D2GProductionDecision;

  it("exposes versioned schema constants and the production candidate source", () => {
    expect(D2G_PROFILE_SCHEMA_VERSION).toBe("d2g-treatment-profile-v1");
    expect(D2G_PROFILE_VERSION).toBe("d2g-treatment-profile-v1");
    expect(D2G_CANDIDATE_SOURCE).toBe("production-decideAiAction");
  });

  it("keeps the D2F request and result formal-execution flags permanently false", () => {
    expectTypeOf<RolloutRequest["formalExecutionAllowed"]>().toEqualTypeOf<false>();
    expectTypeOf<RolloutResult["formalExecutionAllowed"]>().toEqualTypeOf<false>();
  });

  it("freezes the typed fallback vocabulary without adding selector behavior", () => {
    const reasons: D2GFallbackReason[] = [
      "rollout-unusable",
      "stale-decision",
      "candidate-mapping-failed",
      "candidate-no-longer-legal",
      "rollout-failed",
      "unexpected-failure",
    ];

    expect(reasons).toHaveLength(6);
  });

  it("accepts only a unique candidate identity from the current decision universe", () => {
    const candidateA = candidateIdentityFromAction(passAction);
    expect(validateD2GCandidateIdentity(candidateA, productionDecision)).toEqual({
      ok: true,
      candidateId: candidateA,
    });
    expect(validateD2GCandidateIdentity("foreign-candidate", productionDecision)).toEqual({
      ok: false,
      reason: "candidate-mapping-failed",
    });
    const duplicateDecision = {
      evaluatedCandidates: [
        { candidate: { action: passAction }, score: {} },
        { candidate: { action: passAction }, score: {} },
      ],
    } as unknown as D2GProductionDecision;
    expect(validateD2GCandidateIdentity(candidateA, duplicateDecision)).toEqual({
      ok: false,
      reason: "candidate-mapping-failed",
    });
  });

  it("keeps candidate-universe and decision identities deterministic", () => {
    const candidateUniverseHash = computeD2GCandidateUniverseHash(productionDecision);
    const input = {
      gameId: "game-1",
      decisionIndex: 3,
      actingSeat: 0 as const,
      actingStrategy: "treatment" as const,
      preActionGameplayStateHash: "state-hash",
      privateOwnHandFingerprint: "private-hand-hash",
      candidateUniverseHash,
    };

    expect(computeD2GDecisionIdentity(input)).toBe(computeD2GDecisionIdentity({ ...input }));
    expect(computeD2GCandidateUniverseHash(productionDecision)).toBe(candidateUniverseHash);
    expect(computeD2GCandidateUniverseHash({
      evaluatedCandidates: [...productionDecision.evaluatedCandidates].reverse(),
    })).not.toBe(candidateUniverseHash);
  });

  it("excludes wall-clock performance fields from deterministic telemetry serialization", () => {
    const deterministic = {
      gameId: "game-1",
      rotationPairKey: "pair-1",
      allocation: "AB" as const,
      actingSeat: 0 as const,
      actingStrategy: "treatment" as const,
      decisionIdentity: "decision-hash",
      candidateUniverseHash: "universe-hash",
      preActionGameplayStateHash: "state-hash",
      stateValidation: "current" as const,
      baselineCandidateId: "candidate-a",
      treatmentCandidateId: "candidate-b",
      selectedCandidateId: "candidate-b",
      selection: "treatment" as const,
      fallbackReason: "none" as const,
      disagreement: true,
      rankingHash: "ranking-hash",
      rolloutWorkUnits: 12,
    };

    const serialized = serializeD2GDeterministicTelemetry({
      ...deterministic,
      elapsedMs: 12,
      productionDecisionCostMs: 8,
    } as typeof deterministic & { elapsedMs: number; productionDecisionCostMs: number });
    expect(serialized).not.toContain("elapsedMs");
    expect(serialized).not.toContain("productionDecisionCostMs");
  });

  it("rejects overlapping calibration and formal seed manifests", () => {
    const calibration = createD2GSeedManifest({
      schemaVersion: "d2g-seed-manifest-v1",
      phase: "calibration",
      manifestId: "calibration-1",
      profileId: "d2g-calibration-v1",
      profileConfigurationHash: "a".repeat(64),
      seeds: [101, 102],
    });
    const formal = createD2GSeedManifest({
      schemaVersion: "d2g-seed-manifest-v1",
      phase: "formal",
      manifestId: "formal-1",
      profileId: "d2g-formal-v1",
      profileConfigurationHash: "b".repeat(64),
      seeds: [102, 103],
    });

    expect(() => assertD2GSeedManifestsDisjoint(calibration, formal)).toThrow("D2G_SEED_OVERLAP");
  });

  it("binds each seed manifest hash to the exact profile configuration", () => {
    const base = {
      schemaVersion: "d2g-seed-manifest-v1",
      phase: "calibration",
      manifestId: "calibration-1",
      profileId: "d2g-calibration-v1",
      seeds: [101, 102],
    };
    const first = createD2GSeedManifest({
      ...base,
      profileConfigurationHash: "a".repeat(64),
    });
    const second = createD2GSeedManifest({
      ...base,
      profileConfigurationHash: "b".repeat(64),
    });

    expect(first.profileConfigurationHash).toBe("a".repeat(64));
    expect(first.manifestHash).not.toBe(second.manifestHash);
  });

  it("rejects a missing profile configuration hash", () => {
    expect(() => createD2GSeedManifest({
      schemaVersion: "d2g-seed-manifest-v1",
      phase: "calibration",
      manifestId: "calibration-1",
      profileId: "d2g-calibration-v1",
      seeds: [101],
    })).toThrow("D2G_PROFILE_CONFIGURATION_HASH_INVALID");
  });

  it("rejects malformed profile configuration hashes", () => {
    for (const profileConfigurationHash of ["profile-a", "123", "A".repeat(64), "g".repeat(64)]) {
      expect(() => createD2GSeedManifest({
        schemaVersion: "d2g-seed-manifest-v1",
        phase: "calibration",
        manifestId: "calibration-1",
        profileId: "d2g-calibration-v1",
        profileConfigurationHash,
        seeds: [101],
      })).toThrow("D2G_PROFILE_CONFIGURATION_HASH_INVALID");
    }
  });

  it("rejects an unknown seed-manifest phase or profile id", () => {
    expect(() => createD2GSeedManifest({
      schemaVersion: "d2g-seed-manifest-v1",
      phase: "unknown",
      manifestId: "manifest-1",
      profileId: "d2g-calibration-v1",
      seeds: [1],
    })).toThrow("D2G_PHASE_INVALID");

    expect(() => createD2GSeedManifest({
      schemaVersion: "d2g-seed-manifest-v1",
      phase: "calibration",
      manifestId: "manifest-1",
      profileId: "unknown",
      seeds: [1],
    })).toThrow("D2G_PROFILE_ID_INVALID");
  });
});
