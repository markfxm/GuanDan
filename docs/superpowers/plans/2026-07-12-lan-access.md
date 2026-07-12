# LAN Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local Vite and Fastify development servers accessible on the same LAN while retaining strict production CORS.

**Architecture:** Bind both dev servers to all interfaces. Keep localhost origins explicitly allowed, and add a development-only IPv4 private-network origin check for browser CORS requests on port 5173. No game or room modules change.

**Tech Stack:** Vite 6, React, TypeScript, Fastify 5, Vitest.

## Global Constraints

- Do not change game rules or room logic.
- Do not add WebSocket support.
- Keep API port `5174` as the default.
- Do not permit LAN origins when `NODE_ENV === "production"`.

---

### Task 1: Guard LAN CORS by environment

**Files:**
- Modify: `tests/server/api.test.ts`
- Modify: `src/server/api.ts`

**Interfaces:**
- Consumes: `buildApi(): FastifyInstance`.
- Produces: CORS response headers for allowed origins.

- [ ] **Step 1: Write the failing tests**

```ts
it("allows a private LAN origin outside production", async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: "OPTIONS", url: "/api/deal", headers: { origin: "http://192.168.1.20:5173" } });
    expect(response.headers["access-control-allow-origin"]).toBe("http://192.168.1.20:5173");
  });
});

it("does not allow a private LAN origin in production", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await withApp(async (app) => {
      const response = await app.inject({ method: "OPTIONS", url: "/api/deal", headers: { origin: "http://192.168.1.20:5173" } });
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  } finally {
    process.env.NODE_ENV = previous;
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/server/api.test.ts`

Expected: the development LAN-origin assertion fails because it has no `Access-Control-Allow-Origin` header.

- [ ] **Step 3: Implement the minimal CORS predicate**

```ts
function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || (process.env.NODE_ENV !== "production" && isLanDevOrigin(origin));
}
```

Parse the origin with `new URL`, require `http:`, port `5173`, and an IPv4 private-network hostname. Use this predicate in the `onRequest` hook.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- tests/server/api.test.ts`

Expected: all API tests pass.

### Task 2: Expose development servers and document Windows testing

**Files:**
- Modify: `package.json`
- Modify: `src/server/dev.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run dev` and `npm run api` scripts.
- Produces: frontend at `http://<LAN-IP>:5173` and API listening on all interfaces at port `5174`.

- [ ] **Step 1: Update dev-server bindings**

```json
"dev": "vite --host 0.0.0.0"
```

```ts
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 5174);
```

- [ ] **Step 2: Document LAN testing**

Add a README section showing `npm run api`, `npm run dev`, `ipconfig`, `http://<computer-LAN-IP>:5173`, and Windows Firewall guidance for private networks and TCP ports 5173/5174.

- [ ] **Step 3: Verify the complete change**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: TypeScript check and Vite production build finish successfully.
