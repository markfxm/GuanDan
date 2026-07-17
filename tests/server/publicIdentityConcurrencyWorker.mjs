import { parentPort, threadId, workerData } from "node:worker_threads";
import { canonicalizeRoomRequestDescriptor } from "../../src/server/publicIdentityDescriptor.ts";
import { createPublicIdentityProvider } from "../../src/server/publicIdentityProvider.ts";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore.ts";

const input = workerData;
const signal = new Int32Array(input.startSignal);

function log(stage, extra = {}) {
  parentPort?.postMessage({ stage, worker: threadId, at: Date.now(), ...extra });
}

async function run() {
  log("worker-ready");
  Atomics.wait(signal, 0, 0);
  log("connection-open-start");
  let store;
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
    const cause = error ?? {};
    log("error", { code: cause.code, name: cause.name, message: cause.message });
  } finally {
    try {
      store?.close();
      log("closed", { retryCount: store?.getBusyRetryCount() ?? 0 });
    } catch (error) {
      const cause = error ?? {};
      log("close-error", { code: cause.code, name: cause.name, message: cause.message });
    }
  }
}

void run();
