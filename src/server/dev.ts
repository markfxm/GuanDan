/// <reference types="node" />

import { buildApi } from "./api";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5174);
const app = buildApi();

await app.listen({ host, port });
console.log(`Guandan API listening at http://${host}:${port}`);
