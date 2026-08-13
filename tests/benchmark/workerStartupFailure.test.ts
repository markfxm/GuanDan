import { describe, expect, it, vi } from "vitest";
import { executeWithWorkers, type BenchmarkWorker } from "../../scripts/runAiBenchmark";
import type { BenchmarkConfig } from "./contracts";
import { buildGamesForSeed, type BenchmarkGameTask } from "./rotations";
import type { SimulationSummary } from "./simulator";
import type { BenchmarkWorkerResult } from "./worker";

type WorkerListener = (value: any) => void;

const config: BenchmarkConfig = {
  benchmarkVersion: "d0-v1",
  rank: "2",
  seeds: [1],
  strategyA: "legal-greedy",
  strategyB: "legal-random",
  replayMode: "none",
};

class FakeWorker implements BenchmarkWorker {
  readonly terminate = vi.fn(async () => 0);
  private readonly listeners = new Map<string, WorkerListener[]>();

  constructor(
    private readonly startupError?: Error,
    private readonly startupErrorTiming: "sync" | "microtask" = "microtask",
  ) {}

  on(event: "message", listener: (message: BenchmarkWorkerResult) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "online", listener: () => void): this;
  on(event: "message" | "error" | "online", listener: WorkerListener): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    if (event === "error" && this.startupError) {
      if (this.startupErrorTiming === "sync") listener(this.startupError);
      else queueMicrotask(() => listener(this.startupError));
    }
    if (event === "online" && !this.startupError) queueMicrotask(() => listener(undefined));
    return this;
  }

  postMessage(message: { task: BenchmarkGameTask; diagnostics: boolean }): void {
    if (this.startupError) return;
    queueMicrotask(() => this.emit("message", {
      type: "result",
      matchId: message.task.matchId,
      result: completedSummary(message.task),
    }));
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  emit(event: string, value: BenchmarkWorkerResult | Error | undefined): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

function completedSummary(task: BenchmarkGameTask): SimulationSummary {
  const strategiesBySeat = task.allocation === "AB"
    ? { 0: task.config.strategyA, 1: task.config.strategyB, 2: task.config.strategyA, 3: task.config.strategyB }
    : { 0: task.config.strategyB, 1: task.config.strategyA, 2: task.config.strategyB, 3: task.config.strategyA };
  return {
    matchId: task.matchId,
    configHash: task.configHash,
    seed: task.seed,
    rank: task.config.rank,
    rotation: task.rotation,
    strategiesBySeat,
    finishOrder: [0, 1, 2, 3],
    winnerTeam: 0,
    teamScore: { 0: 3, 1: 0 },
    actionCount: 1,
    publicTraceHash: "test-public-trace",
    finalPublicStateHash: "test-final-state",
    durationMs: 1,
    completed: true,
    failed: false,
    errors: [],
    errorCounters: { total: 0, strategyErrors: 0, runtimeErrors: 0, illegalActions: 0, engineErrors: 0, guardErrors: 0 },
    publicEvents: [],
  };
}

describe("benchmark worker startup failures", () => {
  it("replaces a worker that fails before assignment and completes with the replacement", async () => {
    const task = buildGamesForSeed(config, 1)[0]!;
    const failedWorker = new FakeWorker(new Error("WORKER_STARTUP_FAILURE"));
    const replacementWorker = new FakeWorker();
    const workers = [failedWorker, replacementWorker];
    const factory = vi.fn(() => workers.shift()!);

    const results = await executeWithWorkers([task], 1, 50, false, factory);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ matchId: task.matchId, completed: true, failed: false });
    expect(results.flatMap((result) => result.errors).map((error) => error.error)).not.toContain("BENCHMARK_TIMEOUT:50");
    expect(factory).toHaveBeenCalledTimes(2);
    expect(failedWorker.terminate).toHaveBeenCalledTimes(1);
    expect(replacementWorker.terminate).toHaveBeenCalledTimes(1);

    failedWorker.emit("error", new Error("LATE_WORKER_ERROR"));
    expect(failedWorker.terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects after the bounded replacement budget when every worker fails before assignment", async () => {
    const task = buildGamesForSeed(config, 1)[0]!;
    const workers: FakeWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeWorker(new Error(`WORKER_STARTUP_FAILURE_${workers.length + 1}`));
      workers.push(worker);
      return worker;
    });

    await expect(executeWithWorkers([task], 1, 50, false, factory)).rejects.toThrow("WORKER_STARTUP_FAILURE_2");

    expect(factory).toHaveBeenCalledTimes(2);
    expect(workers).toHaveLength(2);
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });

  it("does not create an unterminated worker after concurrent startup exhaustion settles", async () => {
    const tasks = buildGamesForSeed(config, 1).slice(0, 2);
    const workers: FakeWorker[] = [];
    const factory = vi.fn(() => {
      const worker = new FakeWorker(new Error(`WORKER_STARTUP_FAILURE_${workers.length + 1}`), "sync");
      workers.push(worker);
      return worker;
    });

    await expect(executeWithWorkers(tasks, 2, 50, false, factory)).rejects.toThrow("WORKER_STARTUP_FAILURE_3");

    expect(factory).toHaveBeenCalledTimes(3);
    expect(workers.every((worker) => worker.terminate.mock.calls.length === 1)).toBe(true);
  });
});
