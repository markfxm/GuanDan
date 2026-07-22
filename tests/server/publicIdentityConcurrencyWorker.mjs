import { createInterface } from "node:readline";
import { canonicalizeRoomRequestDescriptor } from "../../src/server/publicIdentityDescriptor.ts";
import { createPublicIdentityProvider } from "../../src/server/publicIdentityProvider.ts";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore.ts";

function log(stage, requestId, extra = {}) {
  process.stdout.write(`${JSON.stringify({ stage, requestId, worker: process.pid, ...extra })}\n`);
}

async function run(input) {
  const { requestId } = input;
  log("connection-open-start", requestId);
  let store;
  try {
    store = new PublicIdentityStore(input.databasePath, { installationIdentity: input.installationIdentity });
    log("bootstrap-complete", requestId);
    const provider = createPublicIdentityProvider(store);
    log("allocate-start", requestId);
    const result = provider.allocate({
      descriptor: canonicalizeRoomRequestDescriptor({ rank: "2", seed: input.seed, pendingTributeItems: [] }),
      idempotencyKey: input.idempotencyKey,
    });
    log("allocate-complete", requestId, { result });
  } catch (error) {
    const cause = error ?? {};
    log("error", requestId, { code: cause.code, name: cause.name, message: cause.message });
  } finally {
    try {
      store?.close();
      log("closed", requestId, { retryCount: store?.getBusyRetryCount() ?? 0 });
    } catch (error) {
      const cause = error ?? {};
      log("close-error", requestId, { code: cause.code, name: cause.name, message: cause.message });
    }
  }
}

const input = createInterface({ input: process.stdin });
let prepared;
for await (const line of input) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);
  if (message.type === "prepare") {
    prepared = message;
    log("worker-ready", message.requestId);
  } else if (message.type === "go" && prepared?.requestId === message.requestId) {
    const current = prepared;
    prepared = undefined;
    await run(current);
  }
}
