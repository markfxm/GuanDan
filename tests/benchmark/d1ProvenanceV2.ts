import { createHash } from "node:crypto";
import { canonicalJson, type StrategyDescriptor } from "./contracts";

export const D1_EXECUTION_PROVENANCE_SCHEMA = "d1-execution-provenance-v1" as const;
export const D1_RESULT_SCHEMA = "d1-benchmark-result-v2" as const;
export const D1_MANIFEST_SCHEMA = "d1-manifest-v2" as const;
export const D1_DIAGNOSTICS_SCHEMA = "d1-plan-selection-diagnostics-v1" as const;
export const D1_REPLAY_SCHEMA = "d1-replay-v1" as const;
export const D1_BENCHMARK_VERSION = "d1-topk-v1" as const;

export interface D1ExecutionProvenanceV1 {
  schemaVersion: typeof D1_EXECUTION_PROVENANCE_SCHEMA;
  executionSourceCommit: string;
  strategyDescriptors: StrategyDescriptor[];
  implementationVersion: string;
  engineVersion: string;
  roomRulesVersion: string;
  benchmarkVersion: string;
  replaySchemaVersion: string;
  diagnosticsSchemaVersion: string;
  behaviorBaselineCommit: string;
  behaviorBaselineTag: string;
  keepCurrentLockFixtureHash: string;
  configHash: string;
  phase: "smoke" | "calibration" | "formal";
  seedRange: { start: number; end: number };
  placementCount: 2;
  rotationCount: 4;
  bootstrapConfig: { blockUnit: "base-seed"; iterations: number; seed: number };
  planSelectionConfig: {
    mode: "dynamic-topk-v1";
    k: number;
    minimumScoreDelta: number;
    cooldownDecisionIndices: number;
    recentReturnMultiplier: number;
    recentReturnWindow: number;
  };
}

export interface D1ExecutionProvenanceInput {
  executionSourceCommit: string;
  configHash: string;
  phase: D1ExecutionProvenanceV1["phase"];
  seedStart: number;
  seedEnd: number;
  strategyDescriptors: StrategyDescriptor[];
  implementationVersion?: string;
  engineVersion?: string;
  roomRulesVersion?: string;
  behaviorBaselineCommit?: string;
  behaviorBaselineTag?: string;
  keepCurrentLockFixtureHash?: string;
  bootstrapConfig?: D1ExecutionProvenanceV1["bootstrapConfig"];
  planSelectionConfig?: Partial<D1ExecutionProvenanceV1["planSelectionConfig"]>;
}

export function buildD1ExecutionProvenance(input: D1ExecutionProvenanceInput): D1ExecutionProvenanceV1 {
  return {
    schemaVersion: D1_EXECUTION_PROVENANCE_SCHEMA,
    executionSourceCommit: input.executionSourceCommit,
    strategyDescriptors: [...input.strategyDescriptors].sort((a, b) => a.id.localeCompare(b.id)),
    implementationVersion: input.implementationVersion ?? "dynamic-topk-v1",
    engineVersion: input.engineVersion ?? "engine-v1",
    roomRulesVersion: input.roomRulesVersion ?? "room-rules-v1",
    benchmarkVersion: D1_BENCHMARK_VERSION,
    replaySchemaVersion: D1_REPLAY_SCHEMA,
    diagnosticsSchemaVersion: D1_DIAGNOSTICS_SCHEMA,
    behaviorBaselineCommit: input.behaviorBaselineCommit ?? "e2a20e18f8e5c0871db38ad69426262e43766ce1",
    behaviorBaselineTag: input.behaviorBaselineTag ?? "ai-benchmark-d0-baseline",
    keepCurrentLockFixtureHash: input.keepCurrentLockFixtureHash ?? "fixture-not-loaded",
    configHash: input.configHash,
    phase: input.phase,
    seedRange: { start: input.seedStart, end: input.seedEnd },
    placementCount: 2,
    rotationCount: 4,
    bootstrapConfig: input.bootstrapConfig ?? { blockUnit: "base-seed", iterations: 10000, seed: 20260714 },
    planSelectionConfig: {
      mode: "dynamic-topk-v1",
      k: input.planSelectionConfig?.k ?? 5,
      minimumScoreDelta: input.planSelectionConfig?.minimumScoreDelta ?? 6,
      cooldownDecisionIndices: input.planSelectionConfig?.cooldownDecisionIndices ?? 2,
      recentReturnMultiplier: input.planSelectionConfig?.recentReturnMultiplier ?? 2,
      recentReturnWindow: input.planSelectionConfig?.recentReturnWindow ?? 3,
    },
  };
}

export function hashD1ExecutionProvenance(provenance: D1ExecutionProvenanceV1): string {
  return createHash("sha256").update(canonicalJson(provenance)).digest("hex");
}

export function validateD1ProvenanceHash(provenance: unknown, expectedHash: unknown): true {
  assertD1ExecutionProvenance(provenance);
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash) || hashD1ExecutionProvenance(provenance) !== expectedHash) throw new Error("PROVENANCE_HASH_MISMATCH");
  return true;
}

export function assertD1ExecutionProvenance(value: unknown): asserts value is D1ExecutionProvenanceV1 {
  if (value === null || typeof value !== "object") throw new Error("PROVENANCE_MISSING");
  const provenance = value as Partial<D1ExecutionProvenanceV1>;
  if (provenance.schemaVersion !== D1_EXECUTION_PROVENANCE_SCHEMA || typeof provenance.executionSourceCommit !== "string" || !Array.isArray(provenance.strategyDescriptors) || typeof provenance.implementationVersion !== "string" || typeof provenance.configHash !== "string" || typeof provenance.engineVersion !== "string" || typeof provenance.roomRulesVersion !== "string" || typeof provenance.benchmarkVersion !== "string" || typeof provenance.replaySchemaVersion !== "string" || typeof provenance.diagnosticsSchemaVersion !== "string" || typeof provenance.behaviorBaselineCommit !== "string" || typeof provenance.behaviorBaselineTag !== "string" || typeof provenance.keepCurrentLockFixtureHash !== "string" || provenance.seedRange === undefined || provenance.bootstrapConfig === undefined || provenance.planSelectionConfig === undefined) throw new Error("PROVENANCE_INVALID");
}
