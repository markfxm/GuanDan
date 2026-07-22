import fs from "node:fs/promises";
import path from "node:path";
import { validateD1Replay, validateReplaySet } from "../tests/benchmark/d1ReplayValidation";
import { buildGamesForSeed } from "../tests/benchmark/rotations";
import { simulateGame } from "../tests/benchmark/simulator";

export async function replayD1Directory(directory: string, expectedMatchIds: string[]): Promise<ReturnType<typeof validateReplaySet>> {
  const entries = await fs.readdir(directory, { withFileTypes: true }); const replays = [];
  for (const entry of entries) if (entry.isFile() && entry.name.endsWith(".json")) { const value = JSON.parse(await fs.readFile(path.join(directory, entry.name), "utf8")) as Record<string, unknown>; validateD1Replay(value); replays.push(value); }
  return validateReplaySet(replays, expectedMatchIds);
}

export function replayD1Match(document: Record<string, any>): { verified: true; matchId: string } {
  validateD1Replay(document);
  const strategyA = document.strategiesBySeat?.[0]; const strategyB = document.strategiesBySeat?.[1];
  if (typeof strategyA !== "string" || typeof strategyB !== "string") throw new Error("PROVENANCE_STRATEGIES_MISSING");
  const config = { benchmarkVersion: String(document.benchmarkVersion), rank: document.rank, seeds: [Number(document.seed)], strategyA, strategyB, replayMode: "all" as const };
  const original = buildGamesForSeed(config, Number(document.seed)).find((candidate) => candidate.rotation === Number(document.rotation) && candidate.allocation === document.allocation);
  if (original === undefined) throw new Error("REPLAY_TASK_NOT_FOUND");
  const task = { ...original, configHash: String(document.configHash), matchId: String(document.matchId) };
  const result = simulateGame(task);
  if (result.winnerTeam !== document.winnerTeam || JSON.stringify(result.finishOrder) !== JSON.stringify(document.finishOrder) || JSON.stringify(result.teamScore) !== JSON.stringify(document.teamScore) || result.actionCount !== document.actionCount || result.publicTraceHash !== document.publicTraceHash || result.finalPublicStateHash !== document.finalPublicStateHash) throw new Error(`REPLAY_RESULT_MISMATCH:${document.matchId}`);
  return { verified: true, matchId: String(document.matchId) };
}

if (process.argv[1]?.endsWith("replayD1TopKBenchmark.ts")) replayD1Directory(process.argv[2] ?? "artifacts/d1-topk/replays", []).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); });
