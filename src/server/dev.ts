/// <reference types="node" />

import { buildApi } from "./api";
import { createPublicIdentityProvider } from "./publicIdentityProvider";
import { PublicIdentityStore } from "./publicIdentityStore";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 5174);
const storePath = process.env.D2A_IDENTITY_STORE_PATH;
if (storePath === undefined || storePath.length === 0) throw new Error("D2A_IDENTITY_STORE_PATH_REQUIRED");
const store = new PublicIdentityStore(storePath);
const provider = createPublicIdentityProvider(store);
const app = buildApi(provider);
let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await app.close();
  provider.close();
}

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

try {
  await app.listen({ host, port });
  console.log(`Guandan API listening at http://${host}:${port}`);
} catch (error) {
  await shutdown();
  throw error;
}
