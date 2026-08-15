import { settleRound, type RoundOutcome } from "../../src/game/settlement";
import { sha256Bytes, verifyPublicActionEventHash } from "../../src/game/publicEventHash";
import type { GameSummary } from "./contracts";
import { canonicalJson } from "./contracts";
import { pairedBootstrap, type BootstrapResult } from "./statistics";
import type { D2GDecisionTelemetryRecord, D2GHeadToHeadGameResult } from "./d2gHeadToHeadSimulator";
import type { D2GProvenance } from "./d2gManifest";

export type D2GUnresolvedReason = "missing" | "failed" | "incomplete" | "correctness-unclean";

export interface D2GNormalizedOutcome {
  schemaVersion: "d2g-treatment-perspective-outcome-v1";
  gameId: string;
  rotationPairKey: string;
  baseSeed: number;
  rank: D2GHeadToHeadGameResult["rank"];
  rotation: D2GHeadToHeadGameResult["rotation"];
  allocation: D2GHeadToHeadGameResult["allocation"];
  configHash: string;
  profileHash: string;
  baselineTeam: D2GHeadToHeadGameResult["baselineTeam"];
  treatmentTeam: D2GHeadToHeadGameResult["treatmentTeam"];
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  winnerTeam: 0 | 1 | null;
  winningPartnership: D2GHeadToHeadGameResult["winningPartnership"];
  resolved: boolean;
  unresolvedReason: D2GUnresolvedReason | null;
  treatmentWinIndicator: 0 | 1 | null;
  treatmentTeamScore: number | null;
  baselineTeamScore: number | null;
  scoreDelta: number | null;
  settlementOutcome: RoundOutcome | null;
  levelStep: number | null;
  levelStepDelta: number | null;
  finishUtilityDelta: number | null;
  treatmentControlledDecisionCount: number;
  treatmentControlledDisagreementCount: number;
  hasTreatmentControlledDisagreement: boolean;
  executedTreatmentSelectionCount: number;
  executedTreatmentFallbackCount: number;
  counterfactualBaselineSeatEvaluationCount: number;
  counterfactualFallbackCount: number;
  allTreatmentEvaluationFallbackCount: number;
  fallbackCounts: Readonly<Record<string, number>>;
  errorCounters: D2GHeadToHeadGameResult["errorCounters"];
  productionDecisionCostMs: readonly number[];
  actualTreatmentRolloutCostMs: readonly number[];
  counterfactualRolloutCostMs: readonly number[];
  rolloutWorkUnits: readonly number[];
  treatmentControlledWorkUnits: readonly number[];
  totalRolloutWorkUnits: number;
  publicTraceHash: string;
  finalPublicLedgerHash: string;
  semanticHash: string;
  completed: boolean;
  cardConservation: boolean;
  termination: D2GHeadToHeadGameResult["termination"];
  runtimePlanMismatchCount: number;
  crossGameCandidateReuseCount: number;
}

export interface D2GBaseSeedBlockSummary {
  baseSeed: number;
  games: readonly D2GNormalizedOutcome[];
  complete: boolean;
  resolvedGameCount: number;
  unresolvedGameCount: number;
}

export interface D2GLatencySummary {
  count: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface D2GStatistics {
  schemaVersion: "d2g-statistics-v1";
  rawGameCount: number;
  resolvedGameCount: number;
  unresolvedGameCount: number;
  unresolvedByReason: Record<D2GUnresolvedReason, number>;
  baseSeedCount: number;
  completeBaseSeedBlockCount: number;
  baseSeedBlocks: readonly D2GBaseSeedBlockSummary[];
  treatmentWins: number;
  treatmentLosses: number;
  treatmentWinRate: number | null;
  meanScoreDelta: number | null;
  meanLevelStepDelta: number | null;
  meanFinishUtilityDelta: number | null;
  paired: {
    pairCount: number;
    meanScoreDelta: number | null;
    meanLevelStepDelta: number | null;
    meanFinishUtilityDelta: number | null;
  };
  disagreementSubset: {
    gameCount: number;
    resolvedGameCount: number;
    treatmentWins: number;
    treatmentWinRate: number | null;
    meanScoreDelta: number | null;
  };
  fallbackCounts: Readonly<Record<string, number>>;
  treatmentControlledDecisionCount: number;
  executedTreatmentSelectionCount: number;
  executedTreatmentFallbackCount: number;
  executedTreatmentFallbackRate: number | null;
  counterfactualBaselineSeatEvaluationCount: number;
  counterfactualFallbackCount: number;
  allTreatmentEvaluationFallbackCount: number;
  errorCounters: {
    total: number;
    decisionErrors: number;
    treatmentErrors: number;
    executionErrors: number;
    transitionErrors: number;
    guardErrors: number;
  };
  latency: {
    productionDecisionCostMs: D2GLatencySummary;
    actualTreatmentRolloutCostMs: D2GLatencySummary;
    counterfactualRolloutCostMs: D2GLatencySummary;
  };
  workUnits: {
    totalRolloutWorkUnits: number;
    perDecision: readonly number[];
    perTreatmentControlledDecision: readonly number[];
    perBaseSeed: Readonly<Record<string, number>>;
  };
  bootstrap: {
    blockUnit: "base-seed";
    iterations: number;
    seed: number;
    sampledBlocks: readonly (readonly { seed: number; gameCount: number }[])[];
    scoreDeltaCI: [number, number];
    treatmentWinRateCI: [number, number];
    levelStepDeltaCI: [number, number];
    finishUtilityDeltaCI: [number, number];
  };
}

export interface D2GStatisticsOptions {
  bootstrapIterations?: number;
  bootstrapSeed?: number;
  provenance?: D2GProvenance;
}

export function computeD2GSemanticHash(game: Pick<D2GHeadToHeadGameResult, "gameId" | "rotationPairKey" | "baseSeed" | "rank" | "rotation" | "allocation" | "profileHash" | "finishOrder" | "winnerTeam" | "winningPartnership" | "completed" | "cardConservation" | "termination" | "actionExecutionCount" | "playCount" | "passCount" | "tributeTransitionCount" | "returnTransitionCount" | "runtimePlanMismatchCount" | "decisionTelemetry" | "fallbackCounts" | "errorCounters" | "publicTraceHash" | "finalPublicLedgerHash">): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson({
    schemaVersion: "d2g-semantic-game-v1",
    gameId: game.gameId,
    rotationPairKey: game.rotationPairKey,
    baseSeed: game.baseSeed,
    rank: game.rank,
    rotation: game.rotation,
    allocation: game.allocation,
    profileHash: game.profileHash,
    finishOrder: game.finishOrder,
    winnerTeam: game.winnerTeam,
    winningPartnership: game.winningPartnership,
    completed: game.completed,
    cardConservation: game.cardConservation,
    termination: game.termination,
    actionExecutionCount: game.actionExecutionCount,
    playCount: game.playCount,
    passCount: game.passCount,
    tributeTransitionCount: game.tributeTransitionCount,
    returnTransitionCount: game.returnTransitionCount,
    runtimePlanMismatchCount: game.runtimePlanMismatchCount,
    decisionTelemetry: game.decisionTelemetry.map(({ productionDecisionCostMs: _productionDecisionCostMs, rolloutEvaluationCostMs: _rolloutEvaluationCostMs, ...record }) => record),
    fallbackCounts: game.fallbackCounts,
    errorCounters: game.errorCounters,
    publicTraceHash: game.publicTraceHash,
    finalPublicLedgerHash: game.finalPublicLedgerHash,
  })));
}

export function normalizeD2GGameResult(game: D2GHeadToHeadGameResult, provenance?: D2GProvenance): D2GNormalizedOutcome {
  const unresolvedReason = unresolvedReasonFor(game, provenance);
  const resolved = unresolvedReason === null;
  const treatmentTeamNumber = game.treatmentTeam === "A" ? 0 : 1;
  const treatmentWon = resolved && game.winnerTeam === treatmentTeamNumber;
  const baselineWon = resolved && game.winnerTeam !== null && game.winnerTeam !== treatmentTeamNumber;
  const settlement = resolved ? settleRound([...game.finishOrder], game.rank) : undefined;
  const treatmentPlaces = resolved ? game.finishOrder.filter((seat) => seat % 2 === treatmentTeamNumber).map((seat) => game.finishOrder.indexOf(seat) + 1) : [];
  const baselinePlaces = resolved ? game.finishOrder.filter((seat) => seat % 2 !== treatmentTeamNumber).map((seat) => game.finishOrder.indexOf(seat) + 1) : [];
  const treatmentControlled = game.decisionTelemetry.filter((record) => record.actingStrategy === "treatment");
  const baselineControlled = game.decisionTelemetry.filter((record) => record.actingStrategy === "baseline");
  const fallback = game.decisionTelemetry.filter((record) => record.fallbackReason !== "none");
  const treatmentFallback = treatmentControlled.filter((record) => record.selection !== "treatment");
  const treatmentDisagreements = treatmentControlled.filter((record) => record.disagreement === true);
  const productionCosts = game.decisionTelemetry.map((record) => record.productionDecisionCostMs);
  const treatmentRolloutCosts = treatmentControlled.map((record) => record.rolloutEvaluationCostMs);
  const counterfactualRolloutCosts = baselineControlled.map((record) => record.rolloutEvaluationCostMs);
  const workUnits = game.decisionTelemetry.map((record) => record.rolloutWorkUnits);
  const treatmentScore = resolved ? (treatmentWon ? 1 : 0) : null;
  const baselineScore = resolved ? (baselineWon ? 1 : 0) : null;
  return {
    schemaVersion: "d2g-treatment-perspective-outcome-v1",
    gameId: game.gameId,
    rotationPairKey: game.rotationPairKey,
    baseSeed: game.baseSeed,
    rank: game.rank,
    rotation: game.rotation,
    allocation: game.allocation,
    configHash: game.configHash,
    profileHash: game.profileHash,
    baselineTeam: game.baselineTeam,
    treatmentTeam: game.treatmentTeam,
    finishOrder: [...game.finishOrder],
    winnerTeam: game.winnerTeam,
    winningPartnership: game.winningPartnership,
    resolved,
    unresolvedReason,
    treatmentWinIndicator: resolved ? (treatmentWon ? 1 : 0) : null,
    treatmentTeamScore: treatmentScore,
    baselineTeamScore: baselineScore,
    scoreDelta: resolved ? (treatmentScore! - baselineScore!) : null,
    settlementOutcome: settlement?.outcome ?? null,
    levelStep: settlement?.levelStep ?? null,
    levelStepDelta: resolved ? (treatmentWon ? settlement!.levelStep : -settlement!.levelStep) : null,
    finishUtilityDelta: resolved ? mean(baselinePlaces) - mean(treatmentPlaces) : null,
    treatmentControlledDecisionCount: treatmentControlled.length,
    treatmentControlledDisagreementCount: treatmentDisagreements.length,
    hasTreatmentControlledDisagreement: treatmentDisagreements.length > 0,
    executedTreatmentSelectionCount: treatmentControlled.filter((record) => record.selection === "treatment").length,
    executedTreatmentFallbackCount: treatmentFallback.length,
    counterfactualBaselineSeatEvaluationCount: baselineControlled.length,
    counterfactualFallbackCount: baselineControlled.filter((record) => record.fallbackReason !== "none").length,
    allTreatmentEvaluationFallbackCount: fallback.length,
    fallbackCounts: countFallbacks(game.decisionTelemetry),
    errorCounters: { ...game.errorCounters },
    productionDecisionCostMs: productionCosts,
    actualTreatmentRolloutCostMs: treatmentRolloutCosts,
    counterfactualRolloutCostMs: counterfactualRolloutCosts,
    rolloutWorkUnits: workUnits,
    treatmentControlledWorkUnits: treatmentControlled.map((record) => record.rolloutWorkUnits),
    totalRolloutWorkUnits: sum(workUnits),
    publicTraceHash: game.publicTraceHash,
    finalPublicLedgerHash: game.finalPublicLedgerHash,
    semanticHash: game.semanticHash,
    completed: game.completed,
    cardConservation: game.cardConservation,
    termination: game.termination,
    runtimePlanMismatchCount: game.runtimePlanMismatchCount,
    crossGameCandidateReuseCount: game.crossGameCandidateReuseCount,
  };
}

export function isCorrectnessCleanGame(game: D2GHeadToHeadGameResult, provenance?: D2GProvenance): boolean {
  const treatmentTeamNumber = game.treatmentTeam === "A" ? 0 : 1;
  const expectedWinningPartnership = game.winnerTeam === null ? null : game.winnerTeam === treatmentTeamNumber ? "treatment" : "baseline";
  const finishOrderValid = game.finishOrder.length === 4
    && new Set(game.finishOrder).size === 4
    && game.finishOrder.every((seat) => seat === 0 || seat === 1 || seat === 2 || seat === 3);
  const publicTraceValid = (() => {
    try {
      for (const [index, event] of game.publicEvents.entries()) {
        verifyPublicActionEventHash(event);
        if (event.gameId !== game.gameId || event.eventIndex !== index) return false;
      }
      const expectedTrace = sha256Bytes(new TextEncoder().encode(canonicalJson({ schemaVersion: "d2g-public-trace-v1", publicEvents: game.publicEvents })));
      return expectedTrace === game.publicTraceHash;
    } catch {
      return false;
    }
  })();
  const errorEvidence = hasD2GErrorEvidence(game.errorCounters);
  const settlementValid = (() => {
    if (!finishOrderValid || game.winnerTeam === null) return false;
    try { return settleRound([...game.finishOrder], game.rank).winningTeam === game.winnerTeam; } catch { return false; }
  })();
  return game.completed
    && game.termination === "finished"
    && finishOrderValid
    && game.winnerTeam !== null
    && game.winningPartnership === expectedWinningPartnership
    && settlementValid
    && game.cardConservation
    && game.runtimePlanMismatchCount === 0
    && game.crossGameCandidateReuseCount === 0
    && !errorEvidence
    && game.errors.length === 0
    && publicTraceValid
    && /^[0-9a-f]{64}$/.test(game.finalPublicLedgerHash)
    && /^[0-9a-f]{64}$/.test(game.semanticHash)
    && computeD2GSemanticHash(game) === game.semanticHash
    && (provenance === undefined || (provenance.baseSeeds.includes(game.baseSeed) && game.configHash === provenance.configHash && game.profileHash === provenance.profileConfigurationHash));
}

export function buildD2GStatistics(games: readonly D2GHeadToHeadGameResult[], options: D2GStatisticsOptions = {}): D2GStatistics {
  const provenance = options.provenance;
  if (provenance !== undefined && ((options.bootstrapIterations !== undefined && options.bootstrapIterations !== provenance.bootstrapIterations) || (options.bootstrapSeed !== undefined && options.bootstrapSeed !== provenance.bootstrapSeed))) throw new Error("BOOTSTRAP_CONFIG_MISMATCH");
  const normalized = games.map((game) => normalizeD2GGameResult(game, provenance));
  const blocks = groupBlocks(normalized, provenance?.baseSeeds);
  const resolved = normalized.filter((game) => game.resolved);
  const completeBlocks = blocks.filter((block) => block.complete);
  const fallbackCounts = countFallbacks(games.flatMap((game) => game.decisionTelemetry));
  const errorCounters = sumErrors(games);
  const disagreementGames = resolved.filter((game) => game.hasTreatmentControlledDisagreement);
  const bootstrapIterations = options.bootstrapIterations ?? provenance?.bootstrapIterations ?? 200;
  const bootstrapSeed = options.bootstrapSeed ?? provenance?.bootstrapSeed ?? 1;
  const bootstrapGames = completeBlocks.flatMap((block) => block.games.flatMap((game) => games.find((candidate) => candidate.gameId === game.gameId) === undefined ? [] : [toBootstrapGame(game)]));
  const bootstrap = bootstrapGames.length === 0 ? undefined : pairedBootstrap(bootstrapGames, bootstrapIterations, bootstrapSeed);
  const bootstrapOrigins = new Map(completeBlocks.flatMap((block) => block.games.map((game) => [bootstrapKey(game), game] as const)));
  const bootstrapValues = bootstrap === undefined ? undefined : bootstrapMetrics(bootstrap, bootstrapOrigins);
  const paired = pairedOutcomes(resolved);
  return {
    schemaVersion: "d2g-statistics-v1",
    rawGameCount: games.length,
    resolvedGameCount: resolved.length,
    unresolvedGameCount: normalized.length - resolved.length + blocks.reduce((sumValue, block) => sumValue + missingSlotCount(block.games), 0),
    unresolvedByReason: {
      missing: blocks.reduce((sumValue, block) => sumValue + missingSlotCount(block.games), 0),
      failed: normalized.filter((game) => game.unresolvedReason === "failed").length,
      incomplete: normalized.filter((game) => game.unresolvedReason === "incomplete").length,
      "correctness-unclean": normalized.filter((game) => game.unresolvedReason === "correctness-unclean").length,
    },
    baseSeedCount: provenance?.baseSeeds.length ?? new Set(normalized.map((game) => game.baseSeed)).size,
    completeBaseSeedBlockCount: completeBlocks.length,
    baseSeedBlocks: blocks,
    treatmentWins: resolved.filter((game) => game.treatmentWinIndicator === 1).length,
    treatmentLosses: resolved.filter((game) => game.treatmentWinIndicator === 0).length,
    treatmentWinRate: resolved.length === 0 ? null : resolved.filter((game) => game.treatmentWinIndicator === 1).length / resolved.length,
    meanScoreDelta: meanNullable(resolved.map((game) => game.scoreDelta)),
    meanLevelStepDelta: meanNullable(resolved.map((game) => game.levelStepDelta)),
    meanFinishUtilityDelta: meanNullable(resolved.map((game) => game.finishUtilityDelta)),
    paired,
    disagreementSubset: {
      gameCount: disagreementGames.length,
      resolvedGameCount: disagreementGames.length,
      treatmentWins: disagreementGames.filter((game) => game.treatmentWinIndicator === 1).length,
      treatmentWinRate: disagreementGames.length === 0 ? null : disagreementGames.filter((game) => game.treatmentWinIndicator === 1).length / disagreementGames.length,
      meanScoreDelta: meanNullable(disagreementGames.map((game) => game.scoreDelta)),
    },
    fallbackCounts,
    treatmentControlledDecisionCount: normalized.reduce((sumValue, game) => sumValue + game.treatmentControlledDecisionCount, 0),
    executedTreatmentSelectionCount: normalized.reduce((sumValue, game) => sumValue + game.executedTreatmentSelectionCount, 0),
    executedTreatmentFallbackCount: normalized.reduce((sumValue, game) => sumValue + game.executedTreatmentFallbackCount, 0),
    executedTreatmentFallbackRate: normalized.reduce((sumValue, game) => sumValue + game.treatmentControlledDecisionCount, 0) === 0 ? null : normalized.reduce((sumValue, game) => sumValue + game.executedTreatmentFallbackCount, 0) / normalized.reduce((sumValue, game) => sumValue + game.treatmentControlledDecisionCount, 0),
    counterfactualBaselineSeatEvaluationCount: normalized.reduce((sumValue, game) => sumValue + game.counterfactualBaselineSeatEvaluationCount, 0),
    counterfactualFallbackCount: normalized.reduce((sumValue, game) => sumValue + game.counterfactualFallbackCount, 0),
    allTreatmentEvaluationFallbackCount: normalized.reduce((sumValue, game) => sumValue + game.allTreatmentEvaluationFallbackCount, 0),
    errorCounters,
    latency: {
      productionDecisionCostMs: latency(normalized.flatMap((game) => game.productionDecisionCostMs)),
      actualTreatmentRolloutCostMs: latency(normalized.flatMap((game) => game.actualTreatmentRolloutCostMs)),
      counterfactualRolloutCostMs: latency(normalized.flatMap((game) => game.counterfactualRolloutCostMs)),
    },
    workUnits: {
      totalRolloutWorkUnits: normalized.reduce((sumValue, game) => sumValue + game.totalRolloutWorkUnits, 0),
      perDecision: normalized.flatMap((game) => game.rolloutWorkUnits),
      perTreatmentControlledDecision: normalized.flatMap((game) => game.treatmentControlledWorkUnits),
      perBaseSeed: Object.fromEntries(blocks.map((block) => [block.baseSeed, sum(block.games.flatMap((game) => game.rolloutWorkUnits))])),
    },
    bootstrap: {
      blockUnit: "base-seed",
      iterations: bootstrap?.iterations ?? bootstrapIterations,
      seed: bootstrap?.seed ?? bootstrapSeed,
      sampledBlocks: bootstrapSampleBlocks(bootstrap),
      scoreDeltaCI: bootstrapValues?.scoreDeltaCI ?? [0, 0],
      treatmentWinRateCI: bootstrapValues?.treatmentWinRateCI ?? [0, 0],
      levelStepDeltaCI: bootstrapValues?.levelStepDeltaCI ?? [0, 0],
      finishUtilityDeltaCI: bootstrapValues?.finishUtilityDeltaCI ?? [0, 0],
    },
  };
}

function unresolvedReasonFor(game: D2GHeadToHeadGameResult, provenance?: D2GProvenance): D2GUnresolvedReason | null {
  if (game.termination === "error" || hasD2GErrorEvidence(game.errorCounters) || game.errors.length > 0) return "failed";
  if (!game.completed || game.termination !== "finished" || game.finishOrder.length !== 4 || game.winnerTeam === null) return "incomplete";
  if (!isCorrectnessCleanGame(game, provenance)) return "correctness-unclean";
  return null;
}

function groupBlocks(games: readonly D2GNormalizedOutcome[], expectedSeeds: readonly number[] = []): D2GBaseSeedBlockSummary[] {
  const grouped = new Map<number, D2GNormalizedOutcome[]>();
  for (const game of games) (grouped.get(game.baseSeed) ?? (grouped.set(game.baseSeed, []), grouped.get(game.baseSeed)!)).push(game);
  for (const seed of expectedSeeds) if (!grouped.has(seed)) grouped.set(seed, []);
  return [...grouped.entries()].sort(([left], [right]) => left - right).map(([baseSeed, blockGames]) => ({
    baseSeed,
    games: blockGames,
    complete: isCompleteBlock(blockGames),
    resolvedGameCount: blockGames.filter((game) => game.resolved).length,
    unresolvedGameCount: blockGames.filter((game) => !game.resolved).length + missingSlotCount(blockGames),
  }));
}

function missingSlotCount(games: readonly D2GNormalizedOutcome[]): number {
  const slots = new Set(games.flatMap((game) => isCanonicalSlot(game.rotation, game.allocation) ? [`${game.rotation}:${game.allocation}`] : []));
  return Math.max(0, 8 - slots.size);
}

function isCanonicalSlot(rotation: D2GNormalizedOutcome["rotation"], allocation: D2GNormalizedOutcome["allocation"]): boolean {
  return (rotation === 0 || rotation === 1 || rotation === 2 || rotation === 3) && (allocation === "AB" || allocation === "BA");
}

function isCompleteBlock(games: readonly D2GNormalizedOutcome[]): boolean {
  if (games.length !== 8 || games.some((game) => !game.resolved)) return false;
  const keys = new Set(games.map((game) => `${game.rotation}:${game.allocation}`));
  return keys.size === 8 && [0, 1, 2, 3].every((rotation) => keys.has(`${rotation}:AB`) && keys.has(`${rotation}:BA`));
}

function pairedOutcomes(games: readonly D2GNormalizedOutcome[]): D2GStatistics["paired"] {
  const grouped = new Map<string, D2GNormalizedOutcome[]>();
  for (const game of games) (grouped.get(game.rotationPairKey) ?? (grouped.set(game.rotationPairKey, []), grouped.get(game.rotationPairKey)!)).push(game);
  const pairs = [...grouped.values()].filter((pair) => pair.length === 2 && pair.every((game) => game.resolved) && pair[0]!.baseSeed === pair[1]!.baseSeed && pair[0]!.rotation === pair[1]!.rotation && new Set(pair.map((game) => game.allocation)).size === 2);
  return {
    pairCount: pairs.length,
    meanScoreDelta: meanNullable(pairs.map((pair) => mean(pair.map((game) => game.scoreDelta)))),
    meanLevelStepDelta: meanNullable(pairs.map((pair) => mean(pair.map((game) => game.levelStepDelta)))),
    meanFinishUtilityDelta: meanNullable(pairs.map((pair) => mean(pair.map((game) => game.finishUtilityDelta)))),
  };
}

function toBootstrapGame(game: D2GNormalizedOutcome): GameSummary {
  const teamScore = game.winnerTeam === null ? { 0: 0, 1: 0 } : { 0: game.winnerTeam === 0 ? 1 : 0, 1: game.winnerTeam === 1 ? 1 : 0 };
  return {
    matchId: JSON.stringify({ seed: game.baseSeed, rotation: game.rotation, allocation: game.allocation }),
    configHash: game.configHash,
    seed: game.baseSeed,
    rank: game.rank,
    rotation: game.rotation,
    strategiesBySeat: game.allocation === "AB" ? { 0: "baseline", 1: "treatment", 2: "baseline", 3: "treatment" } : { 0: "treatment", 1: "baseline", 2: "treatment", 3: "baseline" },
    finishOrder: [...game.finishOrder],
    winnerTeam: game.winnerTeam,
    teamScore,
    actionCount: 0,
    publicTraceHash: game.publicTraceHash,
    finalPublicStateHash: game.finalPublicLedgerHash,
    durationMs: 1,
  };
}

function bootstrapMetrics(bootstrap: BootstrapResult, byKey: Map<string, D2GNormalizedOutcome>): { scoreDeltaCI: [number, number]; treatmentWinRateCI: [number, number]; levelStepDeltaCI: [number, number]; finishUtilityDeltaCI: [number, number] } {
  const samples = bootstrap.samples.map((sample) => sample.games.map((game) => normalizedFromBootstrap(game, byKey)));
  return {
    scoreDeltaCI: interval(samples.map((sample) => mean(sample.map((game) => game.scoreDelta)))),
    treatmentWinRateCI: interval(samples.map((sample) => mean(sample.map((game) => game.treatmentWinIndicator)))),
    levelStepDeltaCI: interval(samples.map((sample) => mean(sample.map((game) => game.levelStepDelta)))),
    finishUtilityDeltaCI: interval(samples.map((sample) => mean(sample.map((game) => game.finishUtilityDelta)))),
  };
}

function normalizedFromBootstrap(game: GameSummary, byKey: Map<string, D2GNormalizedOutcome>): D2GNormalizedOutcome {
  const original = byKey.get(game.matchId);
  if (original === undefined) throw new Error("D2G_BOOTSTRAP_MAPPING_FAILED");
  return original;
}

function bootstrapSampleBlocks(bootstrap: BootstrapResult | undefined): readonly (readonly { seed: number; gameCount: number }[])[] {
  if (bootstrap === undefined) return [];
  return bootstrap.samples.map((sample) => {
    const blocks: { seed: number; gameCount: number }[] = [];
    for (let index = 0; index < sample.games.length; index += 8) {
      const block = sample.games.slice(index, index + 8);
      blocks.push({ seed: block[0]?.seed ?? 0, gameCount: block.length });
    }
    return blocks;
  });
}

function sumErrors(games: readonly D2GHeadToHeadGameResult[]): D2GStatistics["errorCounters"] {
  return games.reduce((sumValue, game) => ({
    total: sumValue.total + game.errorCounters.total,
    decisionErrors: sumValue.decisionErrors + game.errorCounters.decisionErrors,
    treatmentErrors: sumValue.treatmentErrors + game.errorCounters.treatmentErrors,
    executionErrors: sumValue.executionErrors + game.errorCounters.executionErrors,
    transitionErrors: sumValue.transitionErrors + game.errorCounters.transitionErrors,
    guardErrors: sumValue.guardErrors + game.errorCounters.guardErrors,
  }), { total: 0, decisionErrors: 0, treatmentErrors: 0, executionErrors: 0, transitionErrors: 0, guardErrors: 0 });
}

export function hasD2GErrorEvidence(counters: D2GHeadToHeadGameResult["errorCounters"]): boolean {
  const values = [counters.total, counters.decisionErrors, counters.treatmentErrors, counters.executionErrors, counters.transitionErrors, counters.guardErrors];
  return values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 0)
    || counters.total !== counters.decisionErrors + counters.treatmentErrors + counters.executionErrors + counters.transitionErrors + counters.guardErrors;
}

function countFallbacks(records: readonly D2GDecisionTelemetryRecord[]): Record<string, number> {
  return records.reduce<Record<string, number>>((counts, record) => {
    if (record.fallbackReason !== "none") counts[record.fallbackReason] = (counts[record.fallbackReason] ?? 0) + 1;
    return counts;
  }, {});
}

function latency(values: readonly number[]): D2GLatencySummary {
  return { count: values.length, p50: quantile(values, 0.5), p95: quantile(values, 0.95), p99: quantile(values, 0.99) };
}

function quantile(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) * percentile)]!;
}

function interval(values: readonly number[]): [number, number] {
  return [quantile(values, 0.025), quantile(values, 0.975)];
}

function mean(values: readonly (number | null)[]): number {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length === 0 ? 0 : finite.reduce((sumValue, value) => sumValue + value, 0) / finite.length;
}

function meanNullable(values: readonly (number | null)[]): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length === 0 ? null : mean(finite);
}

function sum(values: readonly number[]): number { return values.reduce((sumValue, value) => sumValue + value, 0); }

function bootstrapKey(game: D2GNormalizedOutcome): string {
  return JSON.stringify({ seed: game.baseSeed, rotation: game.rotation, allocation: game.allocation });
}
