import fs from "node:fs";
import path from "node:path";
import { buildGamesForSeed } from "../tests/benchmark/rotations";
import { simulateGame } from "../tests/benchmark/simulator";
import { hashFinalPublicState, hashPublicTrace } from "../tests/benchmark/reporting";
import type { BenchmarkConfig, ReplayDocument } from "../tests/benchmark/contracts";

export function replayMatch(matchId: string, replayRoot = "artifacts/ai-benchmark-replays"): { matchId: string; publicTraceHash: string; finalPublicStateHash: string; verified: boolean } {
  const file = findReplay(matchId, replayRoot);
  if (file === undefined) throw new Error(`REPLAY_NOT_FOUND:${matchId}`);
  const document = JSON.parse(fs.readFileSync(file, "utf8")) as ReplayDocument;
  const identity = JSON.parse(document.matchId) as { matchup: string; allocation: "AB" | "BA"; rotation: 0 | 1 | 2 | 3; seed: number };
  const [strategyA, strategyB] = identity.matchup.split("-vs-");
  if (!strategyA || !strategyB) throw new Error("REPLAY_MATCHUP_INVALID");
  const config: BenchmarkConfig = { benchmarkVersion: document.benchmarkVersion, rank: document.rank, seeds: [document.seed], strategyA, strategyB, replayMode: "all" };
  const task = buildGamesForSeed(config, document.seed).find((candidate) => candidate.matchId === document.matchId);
  if (task === undefined) throw new Error("REPLAY_TASK_NOT_FOUND");
  const result = simulateGame(task);
  const publicTraceHash = hashPublicTrace(result.publicEvents);
  const finalPublicStateHash = hashFinalPublicState(result.finalPublicState);
  return { matchId, publicTraceHash, finalPublicStateHash, verified: publicTraceHash === document.publicTraceHash && finalPublicStateHash === document.finalPublicStateHash };
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
