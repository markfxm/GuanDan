import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { canonicalizeRoomRequestDescriptor } from "../../src/server/publicIdentityDescriptor.ts";
import { createPublicIdentityProvider } from "../../src/server/publicIdentityProvider.ts";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore.ts";

const input = JSON.parse(process.env.D2A1_WORKER_INPUT ?? "");

function log(stage, extra = {}) {
  process.stdout.write(`${JSON.stringify({ stage, worker: process.pid, at: Date.now(), ...extra })}\n`);
}

async function run() {
  log("worker-ready");
  while (!existsSync(input.barrierPath)) await delay(5);
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

void run().catch((error) => {
  const cause = error ?? {};
  log("error", { code: cause.code, name: cause.name, message: cause.message });
  process.exitCode = 1;
});
