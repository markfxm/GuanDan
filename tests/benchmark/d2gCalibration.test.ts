import { describe, expect, it } from "vitest";
import {
  D2G_SEED_INVENTORY,
  createD2GRunnerConfig,
} from "../../scripts/runD2GTreatmentBenchmark";

describe("D2G Task 5A calibration readiness", () => {
  it("creates an explicit calibration-ready configuration without freezing formal", () => {
    const config = createD2GRunnerConfig("calibration-ready", { sourceCommit: "a".repeat(40) });

    expect(config.phase).toBe("calibration-ready");
    expect(config.profile.phase).toBe("calibration");
    expect(config.seedManifest.phase).toBe("calibration");
    expect(config.seedManifest.seeds).toEqual([...D2G_SEED_INVENTORY.calibrationReserved]);
    expect(config.formalProfileFrozen).toBe(false);
    expect(config.formalSeedsExecuted).toBe(false);
  });

  it("binds profile, config, source, room fingerprint, and seed provenance", () => {
    const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });

    expect(config.profile.configurationHash).toBe(config.provenance.profileConfigurationHash);
    expect(config.configHash).toBe(config.provenance.configHash);
    expect(config.profile.benchmarkMetadata.sourceCommit).toBe(config.provenance.sourceCommit);
    expect(config.provenance.roomRulesFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(config.provenance.baseSeeds).toEqual([...config.seedManifest.seeds]);
  });

  it("uses the smallest smoke budget that still permits real rollout evidence", () => {
    const config = createD2GRunnerConfig("smoke", { sourceCommit: "a".repeat(40) });

    expect(config.profile.budget).toMatchObject({
      particleCount: 1,
      replicateCountPerScenario: 1,
      maxPliesPerReplicate: 1,
      maxPolicyActionEvaluationsPerPly: 32,
      maxWorkUnits: 32,
    });
  });
});
