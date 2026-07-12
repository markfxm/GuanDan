import { parentPort } from "node:worker_threads";
import { simulateGame, type SimulationSummary } from "./simulator";
import type { BenchmarkGameTask } from "./rotations";

export interface BenchmarkWorkerTask {
  task: BenchmarkGameTask;
  diagnostics?: boolean;
}

export interface BenchmarkWorkerResult {
  type: "result" | "error";
  matchId: string;
  result?: SimulationSummary;
  error?: string;
}

if (parentPort !== null) {
  parentPort.on("message", (message: BenchmarkWorkerTask) => {
    try {
      const result = simulateGame(message.task, { diagnostics: message.diagnostics });
      parentPort!.postMessage({ type: "result", matchId: result.matchId, result } satisfies BenchmarkWorkerResult);
    } catch (cause) {
      parentPort!.postMessage({ type: "error", matchId: message.task.matchId, error: cause instanceof Error ? cause.message : String(cause) } satisfies BenchmarkWorkerResult);
    }
  });
}
