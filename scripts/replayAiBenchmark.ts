import fs from "node:fs";
import path from "node:path";
import { buildGamesForSeed } from "../tests/benchmark/rotations";
import { simulateGame } from "../tests/benchmark/simulator";
import { hashFinalPublicState, hashPublicTrace } from "../tests/benchmark/reporting";
import type { BenchmarkConfig, ReplayDocument } from "../tests/benchmark/contracts";
import { CANDIDATE_ORDERING_VERSION, DECISION_INDEX_SEMANTICS, RANDOM_ALGORITHM_VERSION, STRATEGY_SEED_DERIVATION_VERSION } from "../tests/benchmark/random";

export function replayMatch(matchId: string, replayRoot = "artifacts/ai-benchmark-replays"): { matchId: string; publicTraceHash: string; finalPublicStateHash: string; verified: boolean } {
  const file = findReplay(matchId, replayRoot);
  if (file === undefined) throw new Error(`REPLAY_NOT_FOUND:${matchId}`);
  const document = JSON.parse(fs.readFileSync(file, "utf8")) as ReplayDocument;
  if (document.matchId !== matchId) throw new Error("REPLAY_MATCH_ID_MISMATCH");
  if ((document.benchmarkVersion === "d0-r1" && document.schemaVersion !== "2") || (document.benchmarkVersion !== "d0-r1" && document.schemaVersion !== "1")) throw new Error("REPLAY_SCHEMA_VERSION_INVALID");
  if (!isProvenanceComplete(document)) throw new Error("REPLAY_PROVENANCE_INVALID");
  const identity = JSON.parse(document.matchId) as { matchup: string; allocation: "AB" | "BA"; rotation: 0 | 1 | 2 | 3; seed: number };
  const [strategyA, strategyB] = identity.matchup.split("-vs-");
  if (!strategyA || !strategyB) throw new Error("REPLAY_MATCHUP_INVALID");
  const replayMode = document.replayMode ?? "failures";
  if (replayMode !== "none" && replayMode !== "failures" && replayMode !== "all") throw new Error("REPLAY_MODE_INVALID");
  const config: BenchmarkConfig = { benchmarkVersion: document.benchmarkVersion, rank: document.rank, seeds: [document.seed], strategyA, strategyB, replayMode };
  const task = buildGamesForSeed(config, document.seed).find((candidate) => candidate.matchId === document.matchId);
  if (task === undefined) throw new Error("REPLAY_TASK_NOT_FOUND");
  if (task.configHash !== document.configHash) throw new Error("REPLAY_CONFIG_HASH_MISMATCH");
  if (document.seed !== identity.seed || document.rotation !== identity.rotation || JSON.stringify(document.strategiesBySeat) !== JSON.stringify(strategyMap(task))) throw new Error("REPLAY_IDENTITY_MISMATCH");
  if (document.deterministicRandom.baseSeed !== document.seed) throw new Error("REPLAY_RANDOM_BASE_SEED_MISMATCH");
  const result = simulateGame(task, { strategyRandomSeeds: document.deterministicRandom.perSeatDerivedSeed });
  const publicTraceHash = hashPublicTrace(result.publicEvents);
  const finalPublicStateHash = hashFinalPublicState(result.finalPublicState);
  return { matchId, publicTraceHash, finalPublicStateHash, verified: publicTraceHash === document.publicTraceHash && finalPublicStateHash === document.finalPublicStateHash };
}

function isProvenanceComplete(document: ReplayDocument): boolean {
  return typeof document.engineVersion === "string" && document.engineVersion.length > 0 && document.engineVersion.toLowerCase() !== "unknown"
    && typeof document.roomRulesVersion === "string" && /^[a-f0-9]{64}$/.test(document.roomRulesVersion)
    && Array.isArray(document.strategyDescriptors) && document.strategyDescriptors.length > 0
    && document.strategyDescriptors.every((descriptor) => descriptor.id && descriptor.implementationVersion && descriptor.configHash && descriptor.sourceCommit && descriptor.sourceCommit.toLowerCase() !== "unknown" && ["legal-only", "production-policy"].includes(descriptor.candidatePolicy))
    && document.deterministicRandom?.randomAlgorithmVersion === RANDOM_ALGORITHM_VERSION
    && document.deterministicRandom.strategySeedDerivationVersion === STRATEGY_SEED_DERIVATION_VERSION
    && typeof document.deterministicRandom.baseSeed === "number"
    && document.deterministicRandom.candidateOrderingVersion === CANDIDATE_ORDERING_VERSION
    && document.deterministicRandom.decisionIndexSemantics === DECISION_INDEX_SEMANTICS
    && [0, 1, 2, 3].every((seat) => typeof document.deterministicRandom.perSeatDerivedSeed?.[seat as 0 | 1 | 2 | 3] === "string" && document.deterministicRandom.perSeatDerivedSeed[seat as 0 | 1 | 2 | 3]!.length > 0)
    && [0, 1, 2, 3].every((seat) => typeof document.deterministicRandom.strategyVersionsBySeat?.[seat as 0 | 1 | 2 | 3] === "string" && document.deterministicRandom.strategyVersionsBySeat[seat as 0 | 1 | 2 | 3]!.length > 0);
}

function strategyMap(task: { allocation: "AB" | "BA"; config: BenchmarkConfig }): Record<0 | 1 | 2 | 3, string> {
  const aAtEven = task.allocation === "AB";
  return { 0: aAtEven ? task.config.strategyA : task.config.strategyB, 1: aAtEven ? task.config.strategyB : task.config.strategyA, 2: aAtEven ? task.config.strategyA : task.config.strategyB, 3: aAtEven ? task.config.strategyB : task.config.strategyA };
}

function findReplay(matchId: string, root: string): string | undefined {
  if (!fs.existsSync(root)) return undefined;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) { const nested = findReplay(matchId, candidate); if (nested) return nested; }
    else if (entry.isFile() && entry.name === `${matchId.replace(/[\\/:*?"<>|]/g, "_")}.json`) return candidate;
  }
  return undefined;
}

if (process.argv[1]?.endsWith("replayAiBenchmark.ts")) {
  const matchId = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!matchId) { console.error("REPLAY_MATCH_REQUIRED"); process.exitCode = 1; }
  else { try { const result = replayMatch(matchId); console.info(JSON.stringify(result, null, 2)); if (!result.verified) process.exitCode = 1; } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; } }
}
