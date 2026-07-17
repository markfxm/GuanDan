/// <reference types="node" />

import { buildApi } from "./api";
import { createApiShutdown } from "./apiShutdown";
import { createPublicIdentityProvider } from "./publicIdentityProvider";
import { PublicIdentityStore } from "./publicIdentityStore";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 5174);
const storePath = process.env.D2A_IDENTITY_STORE_PATH;
if (storePath === undefined || storePath.length === 0) throw new Error("D2A_IDENTITY_STORE_PATH_REQUIRED");
const store = new PublicIdentityStore(storePath);
const provider = createPublicIdentityProvider(store);
const app = buildApi(provider);
const shutdown = createApiShutdown(app, provider);

const handleSignal = () => { void shutdown().catch((error) => console.error("API shutdown failed", error)); };
process.once("SIGINT", handleSignal);
process.once("SIGTERM", handleSignal);

try {
  await app.listen({ host, port });
  console.log(`Guandan API listening at http://${host}:${port}`);
} catch (error) {
  await shutdown();
  throw error;
}
