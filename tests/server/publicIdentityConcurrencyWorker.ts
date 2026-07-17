import { parentPort, threadId, workerData } from "node:worker_threads";
import { canonicalizeRoomRequestDescriptor } from "../../src/server/publicIdentityDescriptor";
import { createPublicIdentityProvider } from "../../src/server/publicIdentityProvider";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore";

type WorkerInput = Readonly<{
  databasePath: string;
  installationIdentity: string;
  idempotencyKey: string;
  seed: number;
  startSignal: SharedArrayBuffer;
}>;

const input = workerData as WorkerInput;
const signal = new Int32Array(input.startSignal);

function log(stage: string, extra: Record<string, unknown> = {}): void {
  parentPort?.postMessage({ stage, worker: threadId, at: Date.now(), ...extra });
}

async function run(): Promise<void> {
  log("worker-ready");
  Atomics.wait(signal, 0, 0);
  log("connection-open-start");
  let store: PublicIdentityStore | undefined;
  try {
    store = new PublicIdentityStore(input.databasePath, { installationIdentity: input.installationIdentity });
    log("bootstrap-complete");
    const provider = createPublicIdentityProvider(store);
    log("allocate-start");
    const result = provider.allocate({
      descriptor: canonicalizeRoomRequestDescriptor({ rank: "2", seed: input.seed, pendingTributeItems: [] }),
      idempotencyKey: input.idempotencyKey,
    });
    log("allocate-complete", { result });
  } catch (error) {
    const cause = error as { code?: string; message?: string; name?: string; stack?: string };
    log("error", { code: cause.code, name: cause.name, message: cause.message });
  } finally {
    try {
      store?.close();
      log("closed", { retryCount: store?.getBusyRetryCount() ?? 0 });
    } catch (error) {
      const cause = error as { code?: string; message?: string; name?: string };
      log("close-error", { code: cause.code, name: cause.name, message: cause.message });
    }
  }
}

void run();
