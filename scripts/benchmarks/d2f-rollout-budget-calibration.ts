import { createHash } from "node:crypto";
import { deepStrictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildParticleBank } from "../../src/ai/particles/particleBankBuilder";
import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
import { runDetachedRollout } from "../../src/ai/rollout/rolloutOrchestrator";
import {
  canonicalActionIdentity,
  canonicalReplayContextIdentity,
  type RolloutExecutionResult,
  type RolloutRequest,
} from "../../src/ai/rollout/contracts";
import type { ParticleBankBuildInput } from "../../src/ai/particles/contracts";

export const HANG_CEILING_MS = 60_000;

export type BenchmarkMetrics = Readonly<{
  sampleCount: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  throughputPerSecond: number;
}>;

export type BenchmarkReport = Readonly<{
  schemaVersion: "d2f-rollout-benchmark-report-v1";
  fixtureId: "d2f-public-rollout-calibration-v1";
  runner: "d2f-rollout-budget-calibration";
  nodeVersion: string;
  platform: string;
  architecture: string;
  evidenceLevel: "SUPPLEMENTAL_LOCAL_EVIDENCE" | "NODE22_RELEASE_EVIDENCE";
  warmupIterations: 3;
  measuredIterations: 10;
  correctness: "passed";
  metrics: BenchmarkMetrics & { sampleCount: 10 };
  threshold: Readonly<{ kind: "hang-ceiling"; maximumSingleIterationMs: 60000; passed: true }>;
  verdict: "PASS";
}>;

type JsonRecord = Record<string, any>;

type CliOptions = Readonly<{ fixturePath: string; warmup: 3; iterations: 10; json: true }>;

class BenchmarkFailure extends Error {
  constructor(readonly exitCode: 1 | 2 | 3 | 4, message: string) {
    super(message);
    this.name = "BenchmarkFailure";
  }
}

export function calculateBenchmarkMetrics(samples: readonly number[]): BenchmarkMetrics {
  if (samples.length === 0 || samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new RangeError("INVALID_METRICS");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const sum = samples.reduce((total, sample) => total + sample, 0);
  const meanMs = sum / samples.length;
  const medianIndex = Math.floor(samples.length / 2);
  const medianMs = samples.length % 2 === 0
    ? (sorted[medianIndex - 1]! + sorted[medianIndex]!) / 2
    : sorted[medianIndex]!;
  const p95Ms = sorted[Math.ceil(0.95 * samples.length) - 1]!;
  const throughputPerSecond = 1000 / meanMs;
  if (!Number.isFinite(meanMs) || !Number.isFinite(medianMs) || !Number.isFinite(p95Ms) || !Number.isFinite(throughputPerSecond)) {
    throw new RangeError("INVALID_METRICS");
  }
  return { sampleCount: samples.length, minMs: sorted[0]!, maxMs: sorted[sorted.length - 1]!, meanMs, medianMs, p95Ms, throughputPerSecond };
}

export function exceedsHangCeiling(durationMs: number): boolean {
  return durationMs > HANG_CEILING_MS;
}

export function parseBenchmarkArguments(argv: readonly string[]): CliOptions {
  let fixturePath: string | undefined;
  let warmup: number | undefined;
  let iterations: number | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--fixture") {
      if (fixturePath !== undefined || index + 1 >= argv.length || argv[index + 1]!.startsWith("--")) throw new BenchmarkFailure(1, "invalid arguments");
      fixturePath = argv[++index]!;
    } else if (argument === "--warmup") {
      if (warmup !== undefined || index + 1 >= argv.length) throw new BenchmarkFailure(1, "invalid arguments");
      warmup = parsePositiveInteger(argv[++index]!);
    } else if (argument === "--iterations") {
      if (iterations !== undefined || index + 1 >= argv.length) throw new BenchmarkFailure(1, "invalid arguments");
      iterations = parsePositiveInteger(argv[++index]!);
    } else if (argument === "--json") {
      if (json) throw new BenchmarkFailure(1, "invalid arguments");
      json = true;
    } else {
      throw new BenchmarkFailure(1, "invalid arguments");
    }
  }
  if (fixturePath === undefined || warmup !== 3 || iterations !== 10 || !json) throw new BenchmarkFailure(1, "invalid arguments");
  return { fixturePath, warmup: 3, iterations: 10, json: true };
}

function parsePositiveInteger(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new BenchmarkFailure(1, "invalid arguments");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new BenchmarkFailure(1, "invalid arguments");
  return parsed;
}

function main(argv: readonly string[]): void {
  const options = parseBenchmarkArguments(argv);
  const fixture = readFixture(options.fixturePath);
  const fixtureBefore = JSON.stringify(fixture);
  const request = buildRequest(fixture);
  const requestBefore = requestSnapshot(request);

  runAndCheck(request, fixture, fixtureBefore, requestBefore);
  for (let index = 0; index < options.warmup; index += 1) runAndCheck(request, fixture, fixtureBefore, requestBefore);

  const samples: number[] = [];
  for (let index = 0; index < options.iterations; index += 1) {
    const start = performance.now();
    let result: RolloutExecutionResult;
    try {
      result = runDetachedRollout(request);
    } catch {
      throw new BenchmarkFailure(3, "benchmark execution failed");
    }
    const durationMs = performance.now() - start;
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new BenchmarkFailure(3, "invalid benchmark duration");
    if (exceedsHangCeiling(durationMs)) throw new BenchmarkFailure(4, "hang ceiling exceeded");
    checkResult(result, fixture.expected);
    checkUnchanged(fixture, fixtureBefore, request, requestBefore);
    samples.push(durationMs);
  }

  let metrics: BenchmarkMetrics;
  try {
    metrics = calculateBenchmarkMetrics(samples);
  } catch {
    throw new BenchmarkFailure(3, "invalid benchmark metrics");
  }
  if (metrics.sampleCount !== 10 || Object.values(metrics).some((value) => !Number.isFinite(value) || value < 0) || metrics.throughputPerSecond <= 0) {
    throw new BenchmarkFailure(3, "invalid benchmark metrics");
  }
  const report: BenchmarkReport = {
    schemaVersion: "d2f-rollout-benchmark-report-v1",
    fixtureId: "d2f-public-rollout-calibration-v1",
    runner: "d2f-rollout-budget-calibration",
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    evidenceLevel: process.version === "v22.22.2" ? "NODE22_RELEASE_EVIDENCE" : "SUPPLEMENTAL_LOCAL_EVIDENCE",
    warmupIterations: 3,
    measuredIterations: 10,
    correctness: "passed",
    metrics: metrics as BenchmarkReport["metrics"],
    threshold: { kind: "hang-ceiling", maximumSingleIterationMs: HANG_CEILING_MS, passed: true },
    verdict: "PASS",
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

function readFixture(path: string): JsonRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch {
    throw new BenchmarkFailure(1, "fixture read or parse failed");
  }
  try {
    validateFixture(parsed);
    return parsed as JsonRecord;
  } catch (error) {
    if (error instanceof BenchmarkFailure) throw error;
    throw new BenchmarkFailure(1, "fixture schema invalid");
  }
}

function validateFixture(value: unknown): asserts value is JsonRecord {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["schemaVersion", "fixtureId", "replay", "particleBank", "request", "expected"]);
  if (value.schemaVersion !== "d2f-rollout-benchmark-fixture-v1" || value.fixtureId !== "d2f-public-rollout-calibration-v1") throw new Error("fixture");
  assertNoPrivateKeys(value);
  const replay = value.replay;
  assertKeys(replay, [
    "publicIdentity", "initialLedger", "baseLedger", "finalLedger", "publicHistoryEvents", "pendingPublicEvents",
    "expectedFinalEventIndex", "expectedFinalPublicLedgerHash", "gameRank", "perspectiveSeat", "ownCurrentHand", "publicState",
  ]);
  const identity = replay.publicIdentity;
  assertKeys(identity, ["schemaVersion", "gameId", "roundIdentity", "handIdentity", "roundSequence", "handSequence", "source"]);
  if (identity.schemaVersion !== "d2-public-game-identity-v1" || identity.source !== "benchmark-scenario" || !isNonEmptyString(identity.gameId) || !isNonNegativeInteger(identity.roundSequence) || !isNonNegativeInteger(identity.handSequence)) throw new Error("fixture");
  if (identity.roundIdentity !== `${identity.gameId}:round:${identity.roundSequence}` || identity.handIdentity !== `${identity.roundIdentity}:hand:${identity.handSequence}`) throw new Error("fixture");
  assertRank(replay.gameRank);
  assertSeat(replay.perspectiveSeat);
  assertLedger(replay.initialLedger, identity);
  assertLedger(replay.baseLedger, identity);
  assertLedger(replay.finalLedger, identity);
  if (replay.initialLedger.lastAppliedEventIndex !== -1 || replay.initialLedger.nextEventIndex !== 0) throw new Error("fixture");
  assertDigest(replay.expectedFinalPublicLedgerHash);
  if (replay.expectedFinalEventIndex !== replay.finalLedger.lastAppliedEventIndex || replay.expectedFinalPublicLedgerHash !== canonicalPublicLedgerHash(replay.finalLedger)) throw new Error("fixture");
  assertArray(replay.publicHistoryEvents);
  assertArray(replay.pendingPublicEvents);
  replay.publicHistoryEvents.forEach((event: unknown) => assertEvent(event, identity));
  replay.pendingPublicEvents.forEach((event: unknown) => assertEvent(event, identity));
  replay.ownCurrentHand.forEach((card: unknown) => assertCard(card));
  assertPublicState(replay.publicState, identity);
  if (replay.publicState.gameRank !== replay.gameRank || replay.publicState.perspectiveSeat !== replay.perspectiveSeat) throw new Error("fixture");
  assertParticleBankConfig(value.particleBank);
  assertRequestFixture(value.request, replay.gameRank);
  assertExpectedFixture(value.expected, value.request);
  if (value.expected.scenarioCount !== value.expected.result.aggregateDiagnostics.acceptedScenarioCount
    || value.expected.replicateCountPerScenario !== value.expected.result.aggregateDiagnostics.replicateCountPerScenario
    || value.expected.result.ranking.length !== value.expected.ranking.length
    || !sameJson(value.expected.result.ranking, value.expected.ranking)
    || value.expected.result.policyId !== value.expected.policyId
    || value.expected.result.formalExecutionAllowed !== false
    || value.expected.result.aggregateDiagnostics.coverage !== "complete") throw new Error("fixture");
}

function assertRequestFixture(value: unknown, gameRank: string): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["policyId", "candidates", "budget", "evidenceRequirements", "aggregationPolicy"]);
  if (value.policyId !== "d2f-lightweight-v1" || !Array.isArray(value.candidates) || value.candidates.length === 0) throw new Error("fixture");
  const ids = new Set<string>();
  for (const candidate of value.candidates) {
    assertKeys(candidate, ["candidateId", "action", "baselineEvaluatorScore"]);
    assertAction(candidate.action, gameRank);
    if (candidate.candidateId !== canonicalActionIdentity(candidate.action) || ids.has(candidate.candidateId) || typeof candidate.baselineEvaluatorScore !== "number" || !Number.isFinite(candidate.baselineEvaluatorScore)) throw new Error("fixture");
    ids.add(candidate.candidateId);
  }
  assertBudget(value.budget);
  assertKeys(value.evidenceRequirements, ["schemaVersion", "minimumEffectiveSampleSize", "minimumAcceptedScenarioCount", "minimumCompletedReplicateCount", "requireCompleteCoverage"]);
  if (value.evidenceRequirements.schemaVersion !== "d2f-rollout-evidence-requirements-v1" || value.evidenceRequirements.requireCompleteCoverage !== true) throw new Error("fixture");
  if (!["minimumEffectiveSampleSize", "minimumAcceptedScenarioCount", "minimumCompletedReplicateCount"].every((key) => isPositiveInteger(value.evidenceRequirements[key]))) throw new Error("fixture");
  assertKeys(value.aggregationPolicy, ["schemaVersion", "variancePenalty", "downsideRiskPenalty"]);
  if (value.aggregationPolicy.schemaVersion !== "d2f-rollout-risk-policy-v1" || !isNonNegativeNumber(value.aggregationPolicy.variancePenalty) || !isNonNegativeNumber(value.aggregationPolicy.downsideRiskPenalty)) throw new Error("fixture");
}

function assertExpectedFixture(value: unknown, request: JsonRecord): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["ranking", "candidateIds", "scenarioCount", "replicateCountPerScenario", "policyId", "formalExecutionAllowed", "coverage", "result"]);
  const candidateIds = request.candidates.map((candidate: JsonRecord) => candidate.candidateId);
  if (!sameSet(value.candidateIds, candidateIds) || !isPermutation(value.ranking, candidateIds) || value.policyId !== "d2f-lightweight-v1" || value.formalExecutionAllowed !== false || value.coverage !== "complete" || !isPositiveInteger(value.scenarioCount) || !isPositiveInteger(value.replicateCountPerScenario)) throw new Error("fixture");
  assertResultShape(value.result);
  if (!sameSet(value.result.candidateSummaries.map((summary: JsonRecord) => summary.candidateId), candidateIds)) throw new Error("fixture");
}

function assertResultShape(value: unknown): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["schemaVersion", "mode", "formalExecutionAllowed", "policyId", "rootDigest", "candidateSummaries", "ranking", "aggregateDiagnostics"]);
  if (value.schemaVersion !== "d2f-rollout-result-v2" || value.mode !== "detached" || value.formalExecutionAllowed !== false || value.policyId !== "d2f-lightweight-v1") throw new Error("fixture");
  assertDigest(value.rootDigest);
  if (!Array.isArray(value.candidateSummaries) || value.candidateSummaries.length === 0 || !Array.isArray(value.ranking) || !value.ranking.every((id: unknown) => typeof id === "string")) throw new Error("fixture");
  for (const summary of value.candidateSummaries) {
    assertKeys(summary, ["candidateId", "riskAdjustedUtility", "expectedUtility", "variance", "risk", "baselineEvaluatorScore", "acceptedScenarioCount", "replicateCountPerScenario", "expectedReplicateCount", "completedReplicateCount", "workUnitCount"]);
    if (!isNonEmptyString(summary.candidateId) || !["riskAdjustedUtility", "expectedUtility", "variance", "risk", "baselineEvaluatorScore"].every((key) => isFiniteNumber(summary[key])) || !["acceptedScenarioCount", "replicateCountPerScenario", "expectedReplicateCount", "completedReplicateCount", "workUnitCount"].every((key) => isNonNegativeInteger(summary[key]))) throw new Error("fixture");
  }
  const diagnostics = value.aggregateDiagnostics;
  assertKeys(diagnostics, ["effectiveSampleSize", "acceptedScenarioCount", "replicateCountPerScenario", "completedReplicateCount", "expectedCompletedReplicateCount", "candidateCount", "workUnitCount", "coverage"]);
  if (!isFiniteNumber(diagnostics.effectiveSampleSize) || diagnostics.effectiveSampleSize < 0 || diagnostics.coverage !== "complete" || !["acceptedScenarioCount", "replicateCountPerScenario", "completedReplicateCount", "expectedCompletedReplicateCount", "candidateCount", "workUnitCount"].every((key) => isNonNegativeInteger(diagnostics[key]))) throw new Error("fixture");
}

function buildRequest(fixture: JsonRecord): RolloutRequest {
  try {
    const replay = structuredClone(fixture.replay);
    const config = fixture.particleBank;
    const particleSeed = deriveParticleSeed(fixture.fixtureId);
    const built = buildParticleBank({
      schemaVersion: config.schemaVersion,
      publicIdentity: replay.publicIdentity,
      initialLedger: replay.initialLedger,
      baseLedger: replay.baseLedger,
      publicHistoryEvents: replay.publicHistoryEvents,
      pendingPublicEvents: replay.pendingPublicEvents,
      expectedFinalEventIndex: replay.expectedFinalEventIndex,
      expectedFinalPublicLedgerHash: replay.expectedFinalPublicLedgerHash,
      gameRank: replay.gameRank,
      actingSeat: replay.perspectiveSeat,
      ownCurrentHand: replay.ownCurrentHand,
      particleSeed,
      particleCount: config.particleCount,
      maxSamplingAttempts: config.maxSamplingAttempts,
      maxIndexDraws: config.maxIndexDraws,
      samplerConfigVersion: config.samplerConfigVersion,
      likelihoodConfig: config.likelihoodConfig,
    } satisfies ParticleBankBuildInput);
    if (!built.ok) throw new BenchmarkFailure(3, "particle bank build failed");
    const sourceInput = {
      bank: built.bank,
      publicHistoryEvents: replay.publicHistoryEvents,
      initialLedger: replay.initialLedger,
      finalLedger: replay.finalLedger,
      gameRank: replay.gameRank,
      perspectiveSeat: replay.perspectiveSeat,
      ownCurrentHand: replay.ownCurrentHand,
      publicState: replay.publicState,
    };
    const rootIdentity = canonicalReplayContextIdentity({
      publicHistoryEvents: sourceInput.publicHistoryEvents,
      initialLedger: sourceInput.initialLedger,
      finalLedger: sourceInput.finalLedger,
      gameRank: sourceInput.gameRank,
      perspectiveSeat: sourceInput.perspectiveSeat,
      ownCurrentHand: sourceInput.ownCurrentHand,
      actingSeat: sourceInput.publicState.actingSeat,
      publicState: sourceInput.publicState,
      particleBankSnapshot: built.bank.snapshot,
    });
    const budget = structuredClone(fixture.request.budget);
    const requestInput = {
      schemaVersion: "d2f-rollout-request-v2",
      mode: "detached",
      formalExecutionAllowed: false,
      rootIdentity,
      scenarioSourceInput: sourceInput,
      candidates: structuredClone(fixture.request.candidates),
      budget,
      limits: {
        maxReplicateCountPerScenario: budget.replicateCountPerScenario,
        maxPliesPerReplicate: budget.maxPliesPerReplicate,
        maxPolicyActionEvaluationsPerPly: budget.maxPolicyActionEvaluationsPerPly,
        maxWorkUnits: budget.maxWorkUnits,
      },
      evidenceRequirements: structuredClone(fixture.request.evidenceRequirements),
      riskPolicy: structuredClone(fixture.request.aggregationPolicy),
      policyId: fixture.request.policyId,
    };
    return deepFreeze(requestInput) as RolloutRequest;
  } catch (error) {
    if (error instanceof BenchmarkFailure) throw error;
    throw new BenchmarkFailure(3, "request construction failed");
  }
}

function deriveParticleSeed(fixtureId: string): number {
  return createHash("sha256").update(`d2f-benchmark-particle-seed-v1\0${fixtureId}`, "utf8").digest().readUInt32BE(0);
}

function runAndCheck(request: RolloutRequest, fixture: JsonRecord, fixtureBefore: string, requestBefore: unknown): void {
  let result: RolloutExecutionResult;
  try {
    result = runDetachedRollout(request);
  } catch {
    throw new BenchmarkFailure(2, "rollout correctness failed");
  }
  if (!result.ok) {
    if (result.failure.kind === "invalid-request") throw new BenchmarkFailure(3, "request validation failed");
    throw new BenchmarkFailure(2, "rollout correctness failed");
  }
  checkResult(result, fixture.expected);
  checkUnchanged(fixture, fixtureBefore, request, requestBefore);
}

function checkResult(result: RolloutExecutionResult, expected: JsonRecord): void {
  if (!result.ok) throw new BenchmarkFailure(2, "rollout correctness failed");
  try {
    const actual = result.result;
    if (!sameSet(actual.candidateSummaries.map((summary) => summary.candidateId), expected.candidateIds)) throw new Error("candidate set");
    if (actual.ranking.length !== expected.ranking.length || !sameJson(actual.ranking, expected.ranking)) throw new Error("ranking");
    if (actual.aggregateDiagnostics.acceptedScenarioCount !== expected.scenarioCount || actual.aggregateDiagnostics.replicateCountPerScenario !== expected.replicateCountPerScenario) throw new Error("coverage");
    if (actual.schemaVersion !== "d2f-rollout-result-v2" || actual.mode !== "detached" || actual.policyId !== expected.policyId || actual.formalExecutionAllowed !== false || actual.aggregateDiagnostics.coverage !== expected.coverage) throw new Error("provenance");
    assertFiniteResult(actual);
    deepStrictEqual(actual, expected.result);
  } catch {
    throw new BenchmarkFailure(2, "correctness oracle mismatch");
  }
}

function assertFiniteResult(value: unknown): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertFiniteResult);
    return;
  }
  if (isRecord(value)) Object.values(value).forEach(assertFiniteResult);
}

function requestSnapshot(request: RolloutRequest): unknown {
  return structuredClone({
    ...request,
    scenarioSourceInput: { ...request.scenarioSourceInput, bank: { snapshot: request.scenarioSourceInput.bank.snapshot } },
  });
}

function checkUnchanged(fixture: JsonRecord, fixtureBefore: string, request: RolloutRequest, requestBefore: unknown): void {
  try {
    if (JSON.stringify(fixture) !== fixtureBefore) throw new Error("fixture mutated");
    deepStrictEqual(requestSnapshot(request), requestBefore);
  } catch {
    throw new BenchmarkFailure(2, "benchmark input mutated");
  }
}

function assertParticleBankConfig(value: unknown): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["schemaVersion", "particleCount", "maxSamplingAttempts", "maxIndexDraws", "samplerConfigVersion", "likelihoodConfig"]);
  if (value.schemaVersion !== "d2-particle-bank-build-input-v1" || !isPositiveInteger(value.particleCount) || !isPositiveInteger(value.maxSamplingAttempts) || !isPositiveInteger(value.maxIndexDraws) || !isNonEmptyString(value.samplerConfigVersion)) throw new Error("fixture");
  assertKeys(value.likelihoodConfig, ["schemaVersion", "forcedPassLogFactor", "couldBeatButPassedLogFactor", "observedLeadPlayLogFactor", "observedFollowPlayLogFactor", "degradedEssThreshold", "normalizationTolerance", "essTolerance"]);
  if (value.likelihoodConfig.schemaVersion !== "d2-particle-likelihood-v1" || !["forcedPassLogFactor", "couldBeatButPassedLogFactor", "observedLeadPlayLogFactor", "observedFollowPlayLogFactor", "degradedEssThreshold", "normalizationTolerance", "essTolerance"].every((key) => isFiniteNumber(value.likelihoodConfig[key]))) throw new Error("fixture");
}

function assertLedger(value: unknown, identity: JsonRecord): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["schemaVersion", "gameId", "roundIdentity", "handIdentity", "nextEventIndex", "lastAppliedEventIndex", "seenEventHashes", "playedCardIds", "revealedTransferEvents", "handCounts", "currentTrick", "finishOrder", "publicTributeEvents", "recentActionSummaries"]);
  if (value.schemaVersion !== "d2-public-ledger-v1" || value.gameId !== identity.gameId || value.roundIdentity !== identity.roundIdentity || value.handIdentity !== identity.handIdentity || !isNonNegativeInteger(value.nextEventIndex) || !Number.isInteger(value.lastAppliedEventIndex) || value.lastAppliedEventIndex < -1) throw new Error("fixture");
  if (!isRecord(value.seenEventHashes) || Object.values(value.seenEventHashes).some((hash) => !isDigest(hash))) throw new Error("fixture");
  if (!Array.isArray(value.playedCardIds) || !value.playedCardIds.every((id: unknown) => typeof id === "string") || !Array.isArray(value.finishOrder) || !value.finishOrder.every((seat: unknown) => isSeat(seat))) throw new Error("fixture");
  if (!isRecord(value.handCounts) || !["0", "1", "2", "3"].every((key) => isNonNegativeInteger(value.handCounts[key]))) throw new Error("fixture");
  const trick = value.currentTrick;
  if (!isRecord(trick)) throw new Error("fixture");
  assertKeys(trick, ["trickIndex", "leadSeat", "passSeats"], ["lastPlaySeat", "lastPlayStableKey"]);
  if (!isNonNegativeInteger(trick.trickIndex) || !isSeat(trick.leadSeat) || !Array.isArray(trick.passSeats) || !trick.passSeats.every((seat: unknown) => isSeat(seat))) throw new Error("fixture");
  if (trick.lastPlaySeat !== undefined && !isSeat(trick.lastPlaySeat)) throw new Error("fixture");
  if (trick.lastPlayStableKey !== undefined && !isNonEmptyString(trick.lastPlayStableKey)) throw new Error("fixture");
  if (!Array.isArray(value.revealedTransferEvents) || !value.revealedTransferEvents.every((event: unknown) => isRecord(event))) throw new Error("fixture");
  for (const event of value.revealedTransferEvents) {
    assertKeys(event, ["eventIndex", "kind", "fromSeat", "toSeat"], ["cardId"]);
    if (!isNonNegativeInteger(event.eventIndex) || !["tribute", "return"].includes(event.kind) || !isSeat(event.fromSeat) || !isSeat(event.toSeat) || (event.cardId !== undefined && typeof event.cardId !== "string")) throw new Error("fixture");
  }
  if (!Array.isArray(value.publicTributeEvents) || !value.publicTributeEvents.every((item: unknown) => typeof item === "string") || !Array.isArray(value.recentActionSummaries)) throw new Error("fixture");
}

function assertEvent(value: unknown, identity: JsonRecord): void {
  if (!isRecord(value)) throw new Error("fixture");
  const common = ["schemaVersion", "gameId", "roundIdentity", "handIdentity", "eventIndex", "seat", "trickIndex", "publicPayloadHash"];
  if (common.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error("fixture");
  if (value.schemaVersion !== "d2-public-event-v2" || value.gameId !== identity.gameId || value.roundIdentity !== identity.roundIdentity || value.handIdentity !== identity.handIdentity || !isNonNegativeInteger(value.eventIndex) || !isSeat(value.seat) || !isNonNegativeInteger(value.trickIndex) || !isDigest(value.publicPayloadHash)) throw new Error("fixture");
  if (value.leadSeat !== undefined && !isSeat(value.leadSeat)) throw new Error("fixture");
  if (value.lastPlaySeat !== undefined && !isSeat(value.lastPlaySeat)) throw new Error("fixture");
  if (value.kind === "play") {
    assertKeys(value, [...common, "kind", "publicStableKey", "publicCardIds", "patternType", "groupType", "handCountBefore", "handCountAfter"], ["leadSeat", "lastPlaySeat", "usedWildcardCount", "usedBomb"]);
    if (!isNonEmptyString(value.publicStableKey) || !assertCardIdArray(value.publicCardIds) || !isNonEmptyString(value.patternType) || !isNonEmptyString(value.groupType) || !isNonNegativeInteger(value.handCountBefore) || !isNonNegativeInteger(value.handCountAfter) || (value.usedWildcardCount !== undefined && !isNonNegativeInteger(value.usedWildcardCount)) || (value.usedBomb !== undefined && typeof value.usedBomb !== "boolean")) throw new Error("fixture");
  } else if (value.kind === "pass") {
    assertKeys(value, [...common, "kind", "publicStableKey", "handCountBefore", "handCountAfter"], ["leadSeat", "lastPlaySeat"]);
    if (value.publicStableKey !== "pass:v2" || !isNonNegativeInteger(value.handCountBefore) || !isNonNegativeInteger(value.handCountAfter)) throw new Error("fixture");
  } else if (value.kind === "trick-clear") {
    assertKeys(value, [...common, "kind", "publicStableKey", "leadSeat"], ["lastPlaySeat"]);
    if (!isNonEmptyString(value.publicStableKey) || !isSeat(value.leadSeat)) throw new Error("fixture");
  } else if (value.kind === "finish") {
    assertKeys(value, [...common, "kind", "publicStableKey", "finishPosition", "remainingHandCount", "finishReason"], ["leadSeat", "lastPlaySeat"]);
    if (!isNonEmptyString(value.publicStableKey) || !isPositiveInteger(value.finishPosition) || !isNonNegativeInteger(value.remainingHandCount) || !["hand-empty", "round-settlement"].includes(value.finishReason)) throw new Error("fixture");
  } else if (value.kind === "tribute" || value.kind === "return") {
    assertKeys(value, [...common, "kind", "publicStableKey", "publicCardIds", "fromSeat", "toSeat", "handCountChanges"], ["leadSeat", "lastPlaySeat"]);
    if (!isNonEmptyString(value.publicStableKey) || !assertCardIdArray(value.publicCardIds) || value.publicCardIds.length > 1 || !isSeat(value.fromSeat) || !isSeat(value.toSeat) || !isRecord(value.handCountChanges) || !["0", "1", "2", "3"].every((key) => Number.isInteger(value.handCountChanges[key]))) throw new Error("fixture");
  } else if (value.kind === "anti-tribute") {
    assertKeys(value, [...common, "kind", "publicStableKey", "reasonCode"], ["leadSeat", "lastPlaySeat"]);
    if (!isNonEmptyString(value.publicStableKey) || value.reasonCode !== "anti-tribute") throw new Error("fixture");
  } else {
    throw new Error("fixture");
  }
}

function assertPublicState(value: unknown, identity: JsonRecord): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["gameRank", "actingSeat", "perspectiveSeat", "partnerSeat", "handCounts", "finishOrder", "publicPlayedCardIds", "currentLastPlay", "currentLastPlaySeat"]);
  assertRank(value.gameRank);
  if (!isSeat(value.actingSeat) || !isSeat(value.perspectiveSeat) || !isSeat(value.partnerSeat) || value.partnerSeat !== (value.perspectiveSeat + 2) % 4 || !isRecord(value.handCounts) || !["0", "1", "2", "3"].every((key) => isNonNegativeInteger(value.handCounts[key])) || !Array.isArray(value.finishOrder) || !value.finishOrder.every((seat: unknown) => isSeat(seat)) || !assertCardIdArray(value.publicPlayedCardIds)) throw new Error("fixture");
  if (value.currentLastPlay === null) {
    if (value.currentLastPlaySeat !== null) throw new Error("fixture");
  } else {
    assertGroup(value.currentLastPlay, value.gameRank);
    if (!isSeat(value.currentLastPlaySeat)) throw new Error("fixture");
  }
  void identity;
}

function assertAction(value: unknown, gameRank: string): void {
  if (!isRecord(value)) throw new Error("fixture");
  if (value.type === "pass") assertKeys(value, ["type"]);
  else if (value.type === "play") { assertKeys(value, ["type", "group"]); assertGroup(value.group, gameRank); }
  else throw new Error("fixture");
}

function assertGroup(value: unknown, _gameRank: string): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["id", "type", "label", "purpose", "cards", "wildcards", "strength"]);
  if (!isNonEmptyString(value.id) || !["single", "pair", "triple", "full-house", "straight", "consecutive-pairs", "plate", "bomb", "straight-flush", "joker-bomb"].includes(value.type) || !isNonEmptyString(value.label) || !["attack", "engine", "recovery", "tail-control", "risk", "filler"].includes(value.purpose) || !Array.isArray(value.cards) || !Array.isArray(value.wildcards) || !isFiniteNumber(value.strength)) throw new Error("fixture");
  value.cards.forEach((card: unknown) => assertCard(card));
  value.wildcards.forEach((card: unknown) => assertCard(card));
}

function assertCard(value: unknown): void {
  if (!isRecord(value)) throw new Error("fixture");
  if (value.kind === "suited") {
    assertKeys(value, ["id", "kind", "rank", "suit", "copy"]);
    if (!isNonEmptyString(value.id) || !["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"].includes(value.rank) || !["spades", "clubs", "hearts", "diamonds"].includes(value.suit) || ![1, 2].includes(value.copy)) throw new Error("fixture");
  } else if (value.kind === "joker") {
    assertKeys(value, ["id", "kind", "rank", "copy"]);
    if (!isNonEmptyString(value.id) || !["SJ", "BJ"].includes(value.rank) || ![1, 2].includes(value.copy)) throw new Error("fixture");
  } else throw new Error("fixture");
}

function assertBudget(value: unknown): void {
  if (!isRecord(value)) throw new Error("fixture");
  assertKeys(value, ["replicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits"]);
  if (!["replicateCountPerScenario", "maxPliesPerReplicate", "maxPolicyActionEvaluationsPerPly", "maxWorkUnits"].every((key) => isPositiveInteger(value[key]))) throw new Error("fixture");
}

function assertKeys(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is JsonRecord {
  if (!isRecord(value)) throw new Error("fixture");
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (keys.length !== new Set(keys).size || keys.some((key) => !allowed.has(key)) || required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error("fixture");
}

function assertNoPrivateKeys(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new Error("fixture");
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item) => assertNoPrivateKeys(item, seen));
  else for (const [key, child] of Object.entries(value)) {
    if (["ParticleBank", "WeakMap", "privateState", "hiddenTransferAssignments", "particleSeed", "randomTape", "tape", "cursor", "normalizedWeight", "assignment", "individualWeights", "handle"].includes(key)) throw new Error("fixture");
    assertNoPrivateKeys(child, seen);
  }
  seen.delete(value);
}

function assertCardIdArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && id.length > 0)) throw new Error("fixture");
  return true;
}

function assertArray(value: unknown): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("fixture");
}

function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function isNonNegativeNumber(value: unknown): value is number { return isFiniteNumber(value) && value >= 0; }
function isNonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function isPositiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function isSeat(value: unknown): value is 0 | 1 | 2 | 3 { return value === 0 || value === 1 || value === 2 || value === 3; }
function assertSeat(value: unknown): asserts value is 0 | 1 | 2 | 3 { if (!isSeat(value)) throw new Error("fixture"); }
function assertRank(value: unknown): void { if (!["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"].includes(value as string)) throw new Error("fixture"); }
function isDigest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function assertDigest(value: unknown): asserts value is string { if (!isDigest(value)) throw new Error("fixture"); }
function sameJson(left: unknown, right: unknown): boolean { try { deepStrictEqual(left, right); return true; } catch { return false; } }
function sameSet(left: readonly unknown[], right: readonly unknown[]): boolean { return left.length === right.length && new Set(left).size === left.length && left.every((item) => right.includes(item)); }
function isPermutation(value: unknown, expected: readonly unknown[]): value is readonly unknown[] { return Array.isArray(value) && sameSet(value, expected); }
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as JsonRecord)) deepFreeze(child, seen);
  return Object.freeze(value);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const failure = error instanceof BenchmarkFailure ? error : new BenchmarkFailure(3, "benchmark failure");
    process.stderr.write(`${failure.message}\n`);
    process.exitCode = failure.exitCode;
  }
}
