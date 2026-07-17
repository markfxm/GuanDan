import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore";

type WorkerMessage = Readonly<{ stage: string; worker: number; at: number; [key: string]: unknown }>;
const stressRounds = Number(process.env.D2A1_STRESS_ROUNDS ?? "10");
const reportRetries = process.env.D2A1_REPORT_RETRIES === "1";

function temporaryDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "d2a1-concurrency-red-"));
  return { directory, path: join(directory, "identity.sqlite") };
}

function removeTemporaryDatabase(directory: string): void {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function runPair(databasePath: string, keyForWorker: (index: number) => string, seedForWorker: (index: number) => number): Promise<WorkerMessage[]> {
  const barrierPath = join(databasePath, "..", "start.barrier");
  const workerPath = join(process.cwd(), "tests/server/publicIdentityConcurrencyWorker.mjs");
  const tsxCli = join(process.cwd(), "node_modules/tsx/dist/cli.mjs");
  const sessions = [0, 1].map((index) => spawnChild(workerPath, tsxCli, {
    databasePath,
    installationIdentity: "00000000-0000-4000-8000-000000000001",
    idempotencyKey: keyForWorker(index),
    seed: seedForWorker(index),
    barrierPath,
  }));
  try {
    await Promise.all(sessions.map((session) => session.ready));
    writeFileSync(barrierPath, "go\n");
    const results = await Promise.all(sessions.map((session) => session.done));
    return results.flat();
  } finally {
    if (existsSync(barrierPath)) rmSync(barrierPath, { force: true });
    for (const session of sessions) session.child.kill();
  }
}

function spawnChild(workerPath: string, tsxCli: string, input: Record<string, string | number>): {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  done: Promise<WorkerMessage[]>;
} {
  const child = spawn(process.execPath, [tsxCli, workerPath], {
    cwd: process.cwd(),
    env: { ...process.env, D2A1_WORKER_INPUT: JSON.stringify(input) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const messages: WorkerMessage[] = [];
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  let doneResolve!: (messages: WorkerMessage[]) => void;
  let doneReject!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const done = new Promise<WorkerMessage[]>((resolve, reject) => { doneResolve = resolve; doneReject = reject; });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line) as WorkerMessage;
      messages.push(message);
      if (message.stage === "worker-ready") readyResolve();
    }
  });
  child.stderr.setEncoding("utf8");
  let stderr = "";
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.once("error", (error) => { readyReject(error); doneReject(error); });
  child.once("exit", (code) => {
    if (code === 0) doneResolve(messages);
    else {
      const error = new Error(`worker process exit ${code}: ${stderr}`);
      readyReject(error);
      doneReject(error);
    }
  });
  return { child, ready, done };
}

describe("Public identity store concurrency", () => {
  async function runDifferentKeyRounds(preinitialized: boolean): Promise<void> {
    let retryTriggers = 0;
    let maxRetriesPerRound = 0;
    for (let round = 0; round < stressRounds; round += 1) {
      const database = temporaryDatabase();
      try {
        if (preinitialized) {
          const seedStore = new PublicIdentityStore(database.path, { installationIdentity: "00000000-0000-4000-8000-000000000001" });
          seedStore.close();
        }
        const messages = await runPair(database.path, (index) => `${preinitialized ? "pre" : "cold"}-${round}-${index}`, (index) => index + 1);
        const errors = messages.filter((message) => message.stage === "error");
        expect(errors, JSON.stringify(messages)).toEqual([]);
        expect(messages.filter((message) => message.stage === "allocate-complete")).toHaveLength(2);
        const retries = messages.filter((message) => message.stage === "closed").reduce((sum, message) => sum + Number(message.retryCount ?? 0), 0);
        retryTriggers += retries;
        maxRetriesPerRound = Math.max(maxRetriesPerRound, retries);
      } finally {
        removeTemporaryDatabase(database.directory);
      }
    }
    if (reportRetries) console.info(JSON.stringify({ scenario: preinitialized ? "preinitialized-different-keys" : "concurrent-bootstrap-different-keys", rounds: stressRounds, retryTriggers, maxRetriesPerRound }));
  }

  it("allocates two different keys during concurrent bootstrap without SQLITE_BUSY", async () => {
    await runDifferentKeyRounds(false);
  }, 180_000);

  it("allocates two different keys from a preinitialized database without SQLITE_BUSY", async () => {
    await runDifferentKeyRounds(true);
  }, 180_000);

  it("returns one allocation for concurrent same-key same-descriptor workers", async () => {
    let retryTriggers = 0;
    let maxRetriesPerRound = 0;
    for (let round = 0; round < stressRounds; round += 1) {
      const database = temporaryDatabase();
      try {
        const messages = await runPair(database.path, () => `same-key-${round}`, () => 1);
        expect(messages.filter((message) => message.stage === "error"), JSON.stringify(messages)).toEqual([]);
        const allocations = messages.filter((message) => message.stage === "allocate-complete").map((message) => message.result as { status: string; gameSequence: string });
        expect(allocations).toHaveLength(2);
        expect(allocations.map((allocation) => allocation.status).sort()).toEqual(["idempotent", "new"]);
        expect(new Set(allocations.map((allocation) => allocation.gameSequence)).size).toBe(1);
        const retries = messages.filter((message) => message.stage === "closed").reduce((sum, message) => sum + Number(message.retryCount ?? 0), 0);
        retryTriggers += retries;
        maxRetriesPerRound = Math.max(maxRetriesPerRound, retries);
      } finally {
        removeTemporaryDatabase(database.directory);
      }
    }
    if (reportRetries) console.info(JSON.stringify({ scenario: "same-key-same-descriptor", rounds: stressRounds, retryTriggers, maxRetriesPerRound }));
  }, 180_000);

  it("returns a typed conflict for concurrent same-key different-descriptor workers", async () => {
    let retryTriggers = 0;
    let maxRetriesPerRound = 0;
    for (let round = 0; round < stressRounds; round += 1) {
      const database = temporaryDatabase();
      try {
        const messages = await runPair(database.path, () => `conflict-key-${round}`, (index) => index + 1);
        const errors = messages.filter((message) => message.stage === "error");
        const allocations = messages.filter((message) => message.stage === "allocate-complete");
        expect(allocations).toHaveLength(1);
        expect(errors).toHaveLength(1);
        expect(errors[0]?.code).toBe("IDEMPOTENCY_CONFLICT");
        const retries = messages.filter((message) => message.stage === "closed").reduce((sum, message) => sum + Number(message.retryCount ?? 0), 0);
        retryTriggers += retries;
        maxRetriesPerRound = Math.max(maxRetriesPerRound, retries);
      } finally {
        removeTemporaryDatabase(database.directory);
      }
    }
    if (reportRetries) console.info(JSON.stringify({ scenario: "same-key-different-descriptor", rounds: stressRounds, retryTriggers, maxRetriesPerRound }));
  }, 180_000);
});
