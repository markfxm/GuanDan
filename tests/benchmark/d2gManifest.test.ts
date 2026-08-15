import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../../src/game/publicEventHash";
import { createD2GTreatmentProfile, type D2GTreatmentProfile } from "../../src/ai/d2g/treatmentContracts";
import { buildD2GCanonicalHeadToHeadTasks, type D2GCanonicalHeadToHeadTask } from "./d2gCanonicalAdapter";
import type { D2GHeadToHeadGameResult } from "./d2gHeadToHeadSimulator";
import {
  buildD2GManifest,
  buildD2GProvenance,
  canResumeD2GGame,
  hashD2GProvenance,
  validateD2GProvenanceHash,
  validateD2GResumeManifest,
  writeD2GArtifactsAtomically,
  type D2GManifest,
  type D2GProvenance,
} from "./d2gManifest";
import { AtomicD1Writer } from "./d1AtomicWriter";
import { canonicalJson } from "./contracts";
import { buildD2GPublicReplay } from "./d2gReportModel";
import { computeD2GSemanticHash } from "./d2gStatistics";

const EMPTY_PUBLIC_TRACE_HASH = sha256Bytes(new TextEncoder().encode(canonicalJson({ schemaVersion: "d2g-public-trace-v1", publicEvents: [] })));

function makeProfile(): D2GTreatmentProfile {
  return createD2GTreatmentProfile({
    schemaVersion: "d2g-treatment-profile-v1",
    profileVersion: "d2g-treatment-profile-v1",
    profileId: "d2g-calibration-v1",
    phase: "calibration",
    budget: { particleCount: 1, replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 64, maxWorkUnits: 64 },
    evidenceRequirements: { schemaVersion: "d2f-rollout-evidence-requirements-v1", minimumEffectiveSampleSize: 1, minimumAcceptedScenarioCount: 1, minimumCompletedReplicateCount: 1, requireCompleteCoverage: true },
    riskPolicy: { schemaVersion: "d2f-rollout-risk-policy-v1", variancePenalty: 0, downsideRiskPenalty: 0 },
    rolloutPolicyId: "d2f-lightweight-v1",
    benchmarkMetadata: {
      benchmarkVersion: "d2g-task4-manifest-test-v1",
      sourceCommit: "a".repeat(40),
      engineVersion: "engine-v1",
      roomRulesFingerprint: "b".repeat(64),
      candidateOrderingVersion: "candidate-order-v1",
      statisticsSchemaVersion: "d2g-statistics-v1",
      reportSchemaVersion: "d2g-report-v1",
    },
  });
}

function makeProvenance(profile = makeProfile(), bootstrapIterations = 200, bootstrapSeed = 1): D2GProvenance {
  return buildD2GProvenance({
    benchmarkVersion: "d2g-task4-manifest-test-v1",
    sourceCommit: "a".repeat(40),
    engineVersion: "engine-v1",
    roomRulesFingerprint: "b".repeat(64),
    profileConfigurationHash: profile.configurationHash,
    configHash: "c".repeat(64),
    statisticsSchemaVersion: "d2g-statistics-v1",
    reportSchemaVersion: "d2g-report-v1",
    replaySchemaVersion: "d2g-replay-v1",
    baseSeeds: [77],
    bootstrapIterations,
    bootstrapSeed,
  });
}

function makeTaskResults(tasks: readonly D2GCanonicalHeadToHeadTask[]): D2GHeadToHeadGameResult[] {
  return tasks.map((task) => {
    const game: D2GHeadToHeadGameResult = {
    schemaVersion: "d2g-head-to-head-game-v1",
    gameId: task.gameId,
    rotationPairKey: task.rotationPairKey,
    baseSeed: task.baseSeed,
    rank: task.rank,
    rotation: task.rotation,
    allocation: task.allocation,
    matchup: task.matchup,
    configHash: task.configHash,
    profileHash: task.profileHash,
    baselineTeam: task.baselineTeam,
    treatmentTeam: task.treatmentTeam,
    strategyAssignment: task.strategyAssignment,
    initialPublicLedgerHash: task.initialPublicLedgerHash,
    finalPublicLedgerHash: "1".repeat(64),
    publicTraceHash: EMPTY_PUBLIC_TRACE_HASH,
    semanticHash: "3".repeat(64),
    publicEvents: [],
    finishOrder: [0, 2, 1, 3],
    winnerTeam: 0,
    winningPartnership: task.treatmentTeam === "A" ? "treatment" : "baseline",
    completed: true,
    cardConservation: true,
    termination: "finished",
    decisionCount: 1,
    actionExecutionCount: 1,
    playCount: 1,
    passCount: 0,
    tributeTransitionCount: 0,
    returnTransitionCount: 0,
    runtimePlanMismatchCount: 0,
    crossGameCandidateReuseCount: 0,
    decisionTelemetry: [],
    fallbackCounts: {},
    errorCounters: { total: 0, decisionErrors: 0, treatmentErrors: 0, executionErrors: 0, transitionErrors: 0, guardErrors: 0 },
    errors: [],
    elapsedMs: 10,
    };
    return { ...game, semanticHash: computeD2GSemanticHash(game) };
  });
}

function makeManifest(profile = makeProfile(), games = makeTaskResults(buildD2GCanonicalHeadToHeadTasks({ baseSeed: 77, rank: "10", profile, matchup: "baseline-vs-treatment", configHash: "c".repeat(64) }))): D2GManifest {
  return buildD2GManifest({
    provenance: makeProvenance(profile),
    profile,
    rank: "10",
    matchup: "baseline-vs-treatment",
    games,
  });
}

describe("D2G manifest and provenance", () => {
  it("derives exactly eight canonical game IDs for one base-seed block", () => {
    const manifest = makeManifest();

    expect(manifest.expectedGameIds).toHaveLength(8);
    expect(manifest.completedGameIds).toHaveLength(8);
    expect(manifest.missingGameIds).toHaveLength(0);
    expect(manifest.duplicateGameIds).toHaveLength(0);
    expect(manifest.unknownGameIds).toHaveLength(0);
    expect(manifest.rotationAllocationMatrix).toHaveLength(8);
  });

  it("keeps missing games explicit as unresolved instead of silently dropping them", () => {
    const profile = makeProfile();
    const tasks = buildD2GCanonicalHeadToHeadTasks({ baseSeed: 77, rank: "10", profile, matchup: "baseline-vs-treatment", configHash: "c".repeat(64) });
    const manifest = makeManifest(profile, makeTaskResults(tasks).slice(1));

    expect(manifest.missingGameIds).toHaveLength(1);
    expect(manifest.unresolvedGameCount).toBe(1);
    expect(manifest.complete).toBe(false);
  });

  it("rejects duplicate, unknown, and wrong-identity game records", () => {
    const profile = makeProfile();
    const tasks = buildD2GCanonicalHeadToHeadTasks({ baseSeed: 77, rank: "10", profile, matchup: "baseline-vs-treatment", configHash: "c".repeat(64) });
    const games = makeTaskResults(tasks);

    expect(() => makeManifest(profile, [...games, games[0]!])).toThrow("DUPLICATE_GAME_ID");
    expect(() => makeManifest(profile, games.map((game, index) => index === 0 ? { ...game, gameId: "d2g:unknown" } : game))).toThrow("UNKNOWN_GAME_ID");
    expect(() => makeManifest(profile, games.map((game, index) => index === 0 ? { ...game, profileHash: "f".repeat(64) } : game))).toThrow("PROFILE_HASH_MISMATCH");
    expect(() => makeManifest(profile, games.map((game, index) => index === 0 ? { ...game, allocation: game.allocation === "AB" ? "BA" : "AB" } : game))).toThrow("GAME_ID_METADATA_MISMATCH");
  });

  it("binds provenance to profile/config/schema/seed metadata", () => {
    const provenance = makeProvenance();
    const hash = hashD2GProvenance(provenance);

    expect(validateD2GProvenanceHash(provenance, hash)).toBe(true);
    expect(() => validateD2GProvenanceHash({ ...provenance, profileConfigurationHash: "f".repeat(64) }, hash)).toThrow("PROVENANCE_HASH_MISMATCH");
    expect(provenance.profileConfigurationHash).toBe(makeProfile().configurationHash);
    expect(provenance.statisticsSchemaVersion).toBe("d2g-statistics-v1");
    expect(provenance.replaySchemaVersion).toBe("d2g-replay-v1");
  });

  it("rejects provenance metadata that disagrees with the embedded profile metadata", () => {
    const profile = makeProfile();
    const provenance = buildD2GProvenance({ ...makeProvenance(profile), benchmarkVersion: "different-benchmark" });

    expect(() => buildD2GManifest({ provenance, profile, rank: "10", matchup: "baseline-vs-treatment", games: [] })).toThrow("PROFILE_METADATA_MISMATCH");
  });

  it("resumes only complete correctness-clean exact-match games", () => {
    const profile = makeProfile();
    const manifest = makeManifest(profile);
    const game = manifest.games[0]!;
    const replay = buildD2GPublicReplay(game, makeProvenance(profile));

    expect(canResumeD2GGame(game, manifest, replay)).toBe(true);
    expect(canResumeD2GGame(game, manifest)).toBe(false);
    expect(canResumeD2GGame({ ...game, profileHash: "f".repeat(64) }, manifest, replay)).toBe(false);
    expect(canResumeD2GGame({ ...game, completed: false, termination: "turn-limit" }, manifest, replay)).toBe(false);
    expect(canResumeD2GGame({ ...game, errorCounters: { ...game.errorCounters, total: 1, guardErrors: 1 } }, manifest, replay)).toBe(false);
    expect(canResumeD2GGame({ ...game, rank: "A" }, manifest, replay)).toBe(false);
    expect(canResumeD2GGame(game, manifest, { ...replay, publicTraceHash: "2".repeat(64) })).toBe(false);
    expect(canResumeD2GGame(game, manifest, { ...replay, finalPublicLedgerHash: "4".repeat(64) })).toBe(false);
  });

  it("rejects resume manifest drift in source, profile, config, or expected IDs", () => {
    const manifest = makeManifest();

    expect(validateD2GResumeManifest(manifest, manifest)).toBe(true);
    expect(() => validateD2GResumeManifest(manifest, { ...manifest, sourceCommit: "b".repeat(40) })).toThrow("SOURCE_COMMIT_MISMATCH");
    expect(() => validateD2GResumeManifest(manifest, { ...manifest, profileConfigurationHash: "f".repeat(64) })).toThrow("PROFILE_CONFIG_MISMATCH");
    expect(() => validateD2GResumeManifest(manifest, { ...manifest, expectedGameIds: manifest.expectedGameIds.slice(1) })).toThrow("EXPECTED_GAME_IDS_MISMATCH");
    expect(() => validateD2GResumeManifest(manifest, { ...manifest, rank: "A" })).toThrow("PROVENANCE_METADATA_MISMATCH");
  });

  it("reuses the D1 atomic writer boundary for complete artifact publication", async () => {
    const renames: string[] = [];
    const writer = new AtomicD1Writer({
      write: async () => {},
      rename: async (_from, to) => { renames.push(to); },
      remove: async () => {},
    });

    await writeD2GArtifactsAtomically(writer, "d2g-games.json", "{\"games\":[]}", "d2g-manifest.json", "{\"complete\":true}");

    expect(renames).toEqual(["d2g-games.json", "d2g-manifest.json"]);
  });
});
