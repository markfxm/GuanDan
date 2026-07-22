# D2a.1 Task 3 UI Idempotency-Key Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个 UI 创建新游戏意图拥有一个只存在于 `Idempotency-Key` 请求头的 opaque key，并在重试、失败、下一局、rerender 与卸载场景下保持明确且可验证的生命周期。

**Architecture:** `src/ui/api.ts` 提供不可变的创建意图描述、一次性 key/seed 生成和带 header 的房间创建 client；`src/ui/App.tsx` 以 ref 保存当前创建意图，以同步 guard 防止双击，并以显式 retry affordance 处理无响应网络结果。服务器生产代码不改；server focused test 只验证 Task 2 API 已有的 header、冲突和隐私边界。

**Tech Stack:** TypeScript, React 18, browser Web Crypto, Vitest, Testing Library, Fastify `app.inject`, existing `PublicIdentityStore`/`PublicIdentityProvider` harness.

## Global Constraints

- Task 3 必须从 `bc9622d4c0f1b053652f8567f7eb7885d4a2189a` 开始，工作树为 `E:/workspace/掼蛋游戏开发/.worktrees/d2a1-task3`，分支为 `codex/d2a1-task3`。
- 不把 `main` merge 或 rebase 进 Task 3。
- 只修改 Task 3 直接相关的 UI/API client 与 focused tests；不开始 D2b、Task 4 或 Task 5。
- 不修改已批准的 identity provider/store、server sequence 语义、public ledger/replay 契约、D0/D1 fixture/artifact/approval/trace/schema/hash。
- 不添加 hidden information、ParticleBank 或 rollout；不运行 smoke、calibration 或 formal；`formalExecutionAllowed` 保持 `false`。
- 每个“创建新游戏意图”只生成一个 key 和一个不可变 request descriptor；同一意图的所有 retry 复用二者。
- HTTP 分类固定为：有效 2xx body 成功并清除 intent；2xx body 缺失/解析失败为 `UNCERTAIN`；400/409/410/422 等明确客户端拒绝为 definite failure 并清除 intent；408/429/5xx 为 `UNCERTAIN`；fetch rejection 为 `UNCERTAIN`；发送前 crypto、descriptor 构造或序列化失败为 local definite failure，不发送请求且不进入 `UNCERTAIN`。
- “下一局”始终创建新意图，即使 rank 和 pending tribute descriptor 与上一局相同。
- key 只能出现在 `Idempotency-Key` header；body 只允许 `rank`、`seed`、`pendingTributeItems`。
- UI 不发送 identity、gameSequence、canonical gameId；key 不进入 PublicRoom、public ledger 或 replay。
- key/seed 生成、descriptor 构造或序列化失败时 fail closed：不发送任何 `POST /api/rooms`，不进入 `PENDING` 或 `UNCERTAIN`，不改变当前 room。

## Preflight Findings Frozen for Implementation

- UI 创建入口只有 `src/ui/App.tsx:handleCreateRoom`（工具栏“开房”）和 `src/ui/App.tsx:handleNextRoom`（结算面板“下一局”、结算 dialog“进行下一局”）；两个“下一局” DOM 入口共用同一个 handler。
- 生产 `POST /api/rooms` 调用只有 `src/ui/api.ts:createGameRoom`；server route 是 `src/server/api.ts:154`。测试调用分布在 `tests/server/api.test.ts`、`tests/server/apiCanonicalIdentity.test.ts`、`tests/server/publicRoomLegacyResponse.test.ts`，UI mock call 主要在 `tests/ui/app.test.tsx`。
- `src/ui/api.ts:170` 的 `postJson` 是唯一 UI fetch 封装；当前没有 client network retry。server `PublicIdentityStore.withBusyRetry` 是 SQLite busy retry，不是 UI 网络 retry。
- UI 当前用共享 `loading` state 禁用按钮；本计划增加同步 ref guard，因为一个事件处理器在 React state 更新可见前不能依赖 `loading` 阻止第二个意图。
- 创建成功会替换 `room` 并清理选择/结算状态；明确失败只显示错误并结束当前创建意图；当前没有“结果不确定”的状态或 retry 按钮。
- 现有 server API 要求 `seed` 为安全整数，而当前 UI mock body 没有 seed；Task 3 会把 seed 固定到创建意图 descriptor 中，retry 不重新生成。seed 不是 identity、sequence 或 canonical gameId。
- 已有 server UUID 工具只有 `src/server/publicIdentityStore.ts` 的 Node `randomUUID`；UI 没有 browser key utility。本计划使用 browser `crypto.randomUUID()`，不以 `Math.random()` 或时间作为 key fallback。
- `getPublicRoom` 在 `src/game/room.ts:169` 明确剥离 `publicIdentity`、`publicLedger`、`publicEvents`；server route 只返回剥离后的 PublicRoom。内部 ledger/events 由 server focused test 通过 registry harness 检查，replay-facing `replayHands` 与 public events 都不含 key。
- `src/main.tsx` 用 `React.StrictMode`，因此 key 生成必须只发生在点击 handler/intent factory，不能放在 render 或 effect。

## Frozen Result Classification and Error Interfaces

`src/ui/api.ts` must define these exact classes, fields, and type guards; implementation may not rename them or make App infer classifications from message text:

```ts
export type CreateRoomHttpClassification = "definite-failure" | "uncertain";

export class CreateRoomHttpError extends Error {
  readonly kind = "http" as const;
  readonly status: number;
  readonly statusText: string;
  readonly serverError?: string;
  readonly classification: CreateRoomHttpClassification;

  constructor(input: {
    status: number;
    statusText: string;
    serverError?: string;
    classification: CreateRoomHttpClassification;
  });
}

export class CreateRoomUncertainError extends Error {
  readonly kind = "uncertain" as const;
  readonly source: "fetch" | "response";
  readonly cause: unknown;

  constructor(input: { source: "fetch" | "response"; cause: unknown });
}

export class CreateRoomLocalError extends Error {
  readonly kind = "local" as const;
  readonly source: "crypto" | "descriptor" | "serialization";
  readonly cause?: unknown;

  constructor(input: {
    source: "crypto" | "descriptor" | "serialization";
    cause?: unknown;
  });
}

export function isCreateRoomHttpError(error: unknown): error is CreateRoomHttpError;
export function isCreateRoomUncertainError(error: unknown): error is CreateRoomUncertainError;
export function isCreateRoomLocalError(error: unknown): error is CreateRoomLocalError;
export type RetryableCreateRoomError = CreateRoomUncertainError | (CreateRoomHttpError & { readonly classification: "uncertain" });
export function isRetryableCreateRoomError(error: unknown): error is RetryableCreateRoomError;
```

`CreateRoomHttpError.classification` is `"uncertain"` only for status `408`, `429`, or any status `>= 500`; every other non-2xx status is `"definite-failure"`. `CreateRoomUncertainError` represents fetch rejection (`source: "fetch"`) or a 2xx response whose body is missing, cannot be parsed, or cannot be validated as `{ room: PublicRoom }` (`source: "response"`). `CreateRoomLocalError` covers key/seed crypto failure, descriptor snapshot failure, and JSON serialization failure before `fetch` is called. There is no automatic retry loop.

## Frozen State Machine

```text
NO_INTENT
  -- user create/next click + successful local generation --> PENDING(intent)
PENDING(intent)
  -- valid 2xx body --> NO_INTENT (apply room; clear intent)
PENDING(intent)
  -- definite HTTP client failure (400/409/410/422/etc.) --> NO_INTENT (show error; clear intent)
PENDING(intent)
  -- uncertain HTTP (408/429/5xx), fetch rejection, or invalid/missing 2xx body --> UNCERTAIN(intent)
PENDING(intent)
  -- local crypto/descriptor/serialization failure before fetch --> NO_INTENT (show local error; no request)
UNCERTAIN(intent)
  -- explicit retry click --> PENDING(same intent)
UNCERTAIN(intent)
  -- unmount --> no local runtime value; remount starts NO_INTENT and never restores storage
NO_INTENT
  -- later create/next click --> PENDING(new intent)
```

Runtime state has exactly three representations: `undefined` means `NO_INTENT`; `{ kind: "pending"; intent: CreateRoomIntent }`; or `{ kind: "uncertain"; intent: CreateRoomIntent }`. Success and definite failure are transitions that clear the runtime value, not stored states. `PENDING` and `UNCERTAIN` disable both normal create entry points; the uncertain state exposes one retry action. A normal create click cannot replace an uncertain intent. Rerender preserves the ref; StrictMode does not create an intent because no generation occurs during render/effect. Unmount does not write the key to storage and prevents late promise state writes; remount starts with no runtime value and cannot restore a prior key.

## Immutable Intent and Retry Semantics

The client boundary will use one explicit type:

```ts
export type CreateRoomIntent = Readonly<{
  idempotencyKey: string;
  rank: GameRank;
  seed: number;
  pendingTributeItems: ReadonlyArray<Readonly<TributeItem>>;
  requestBodyJson: string;
}>;

export function createRoomIntent(rank: GameRank, pendingTributeItems?: readonly TributeItem[]): CreateRoomIntent;
export function createGameRoom(intent: CreateRoomIntent): Promise<PublicRoom>;
async function postCreateRoom(intent: CreateRoomIntent): Promise<RoomResponse>;
```

`createRoomIntent(rank, pendingTributeItems)` must execute in this exact order: (1) generate and validate `idempotencyKey`; (2) generate and validate the unsigned 32-bit seed; (3) allocate a new array, copy each item with `{ payer: item.payer, receiver: item.receiver }`, freeze each copied item, and freeze the new array; (4) create an object containing only `rank`, `seed`, and the frozen `pendingTributeItems`, then execute `JSON.stringify` exactly once; (5) save that string as `requestBodyJson`; (6) freeze and return the complete intent. It must retain no caller array or caller item reference. The exact seed range is `0..0xFFFF_FFFF`, inclusive. `src/game/room.ts:653` applies `seed >>> 0` before its LCG, and `src/server/api.ts:isValidRequiredInteger` accepts every generated value, so this range reaches the existing unsigned 32-bit path without additional truncation or signedness behavior. The existing LCG/deck behavior is unchanged; the range gives one-to-one client values before the already-existing `>>> 0` conversion. Any missing/throwing/invalid Web Crypto result, invalid descriptor, or serialization failure throws `CreateRoomLocalError` before the intent is returned; App therefore has not set `PENDING` and `fetch` has not been called. The caller stores the returned object before its first await.

The single serialization occurs inside `createRoomIntent`:

```ts
const requestBodyJson = JSON.stringify({
  rank,
  seed,
  pendingTributeItems: frozenPendingTributeItems,
});
```

`createGameRoom(intent)` and every retry send exactly:

```ts
fetch("/api/rooms", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": intent.idempotencyKey },
  body: intent.requestBodyJson,
});
```

The key is never included in the body or returned room. `postCreateRoom` must use `body: intent.requestBodyJson` and must not call `JSON.stringify`. Existing shared `postJson` is left unchanged. `createGameRoom` uses a dedicated `postCreateRoom` boundary that owns the header, response validation, and the three error classes above. Every retry receives the same `CreateRoomIntent` object and therefore the same key, seed, descriptor snapshot, and `requestBodyJson` string; no key, seed, snapshot, or serialization factory runs during retry. Same key/different descriptor remains a server `409 IDEMPOTENCY_CONFLICT`; the client does not catch it as success.

## Files and Responsibilities

Files are intentionally limited to the approved Task 3 surface:

- Modify `src/ui/api.ts`: add `CreateRoomIntent`, browser-safe key/seed intent factory, the exact typed create-room errors/type guards, a dedicated `postCreateRoom` boundary, header-only key transport, and create-room client accepting the frozen intent. Leave shared `postJson` unchanged. Its existing callers are `dealHand`, `generatePlans`, `playRoomCards`, `passRoomTurn`, `runRoomAi`, `runRoomAiStep`, and `submitOpeningTribute`; their error types, messages, and visible App behavior remain covered by the existing UI suite.
- Modify `src/ui/App.tsx`: own the current create intent lifecycle, synchronous duplicate-click guard, explicit uncertain retry UI, descriptor snapshotting, success/failure cleanup, and mounted-owner guard.
- Modify `tests/ui/app.test.tsx`: update the existing create request assertion for the required deterministic-in-test seed/header shape without changing unrelated UI coverage.
- Create `tests/ui/productionIdentityLifecycle.test.tsx`: cover UI generation, pending, retry, failure, rerender, duplicate clicks, next-round boundaries, and fail-closed generation.
- Create `tests/server/apiIdempotency.test.ts`: cover the unchanged production API’s same-key idempotency/conflict and PublicRoom/ledger/replay key exclusion.
- Create `docs/superpowers/plans/2026-07-18-d2a1-task3-ui-idempotency.md`: this reviewed plan only; no production behavior is changed by the preflight plan commit.

No `src/server/*`, `src/game/*`, `src/engine/*`, benchmark, fixture, artifact, approval, or replay contract file is in scope.

---

### Task 1: Freeze the UI create intent and API transport contract

**Files:**
- Modify: `src/ui/api.ts`
- Modify: `tests/ui/app.test.tsx`
- Test: `tests/ui/productionIdentityLifecycle.test.tsx` (initial API/client cases)

**Interfaces:**
- Produces the exact exports `CreateRoomIntent`, `createRoomIntent(rank: GameRank, pendingTributeItems?: readonly TributeItem[]): CreateRoomIntent`, `createGameRoom(intent: CreateRoomIntent): Promise<PublicRoom>`, `isCreateRoomHttpError`, `isCreateRoomUncertainError`, `isCreateRoomLocalError`, `isRetryableCreateRoomError`, and the typed errors from the frozen error interface section.
- Consumes the existing `GameRank`, `TributeItem`, `PublicRoom`, `postJson` call pattern, and server header contract.

- [ ] **Step 1: Write the failing transport and factory tests (RED).**

Add tests that call the new client boundary with a deterministic crypto mock and assert that the first request has one key, a safe-integer seed, and no forbidden body fields:

```ts
const intent = createRoomIntent("2", []);
await createGameRoom(intent);

const firstRequest = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/rooms");
expect((firstRequest.headers as Record<string, string>)["Idempotency-Key"]).toBe(intent.idempotencyKey);
expect(firstRequest.body).toBe(intent.requestBodyJson);
expect(Object.keys(JSON.parse(String(firstRequest.body))).sort()).toEqual(["pendingTributeItems", "rank", "seed"]);
expect(String(firstRequest.body)).not.toContain("idempotency");
expect(String(firstRequest.body)).not.toContain("identity");
expect(String(firstRequest.body)).not.toContain("gameSequence");
expect(String(firstRequest.body)).not.toContain("gameId");

await createGameRoom(intent);
const secondRequest = vi.mocked(fetch).mock.calls[1]![1] as RequestInit;
expect(secondRequest.body).toBe(intent.requestBodyJson);
expect(secondRequest.body).toBe(firstRequest.body);
expect((secondRequest.headers as Record<string, string>)["Idempotency-Key"]).toBe(
  (firstRequest.headers as Record<string, string>)["Idempotency-Key"],
);
```

Add these concrete cases to the same focused file:

- Mock `getRandomValues` to return `0`, `0xFFFF_FFFF`, then two distinct values; assert the body seed is respectively `0`, `4_294_967_295`, and a new value for a new intent. Assert `seed` is an integer, non-negative, and `<= 4_294_967_295`.
- Call `createGameRoom(intent)` twice and assert the exact same `Idempotency-Key`, seed, rank, and tribute body on both calls; call `createRoomIntent` again and assert a different key and a newly consumed seed.
- Pass `const items = [{ payer: 1, receiver: 0 }]`, create the intent, then mutate `items[0]` and replace `items[0]` in the original array; assert `intent.pendingTributeItems` and both serialized request bodies remain `{ payer: 1, receiver: 0 }`. Assert the intent array and copied item are not the original references.
- Make `randomUUID` throw, make `getRandomValues` throw, and make descriptor snapshot/`JSON.stringify` throw in separate cases; assert `isCreateRoomLocalError(error)` is true and `fetch` has zero calls in each case.
- Spy on `JSON.stringify`, create one intent, force the first fetch to reject, click explicit retry, and assert `JSON.stringify` was called exactly once for the intent and never during either request.
- Return a valid 2xx room, a 2xx response with no body, a 2xx response with invalid JSON, and a 2xx response with `{ room: undefined }`; assert only the first resolves, while the other three throw `CreateRoomUncertainError` with `source: "response"`.
- Return 400, 409, 410, and 422 and assert `CreateRoomHttpError.classification === "definite-failure"`; return 408, 429, and 500/503 and assert `classification === "uncertain"` and `isRetryableCreateRoomError(error)`.
- Reject `fetch` and assert `CreateRoomUncertainError` with `source: "fetch"`. No test may configure or expect an automatic retry loop.

Run:

```text
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/ui/app.test.tsx --testTimeout=120000 --reporter=verbose
```

Expected: RED because `CreateRoomIntent`/factory/header transport are not yet present and the existing body assertion still assumes no seed.

- [ ] **Step 2: Implement the minimal API contract.**

Keep the implementation in `src/ui/api.ts`: generate one RFC-compatible opaque UUID with `globalThis.crypto.randomUUID`, generate one unsigned 32-bit seed with `crypto.getRandomValues(new Uint32Array(1))[0]`, deep-snapshot and freeze tribute items, serialize the three-field request object exactly once inside `createRoomIntent`, save it as `requestBodyJson`, pass only `Idempotency-Key` in the dedicated request headers, and throw `CreateRoomHttpError`, `CreateRoomUncertainError`, or `CreateRoomLocalError` according to the frozen classification. `postCreateRoom` must use `body: intent.requestBodyJson` without serialization. Leave shared `postJson` and all seven non-create callers unchanged. Do not add a retry loop or any server change in this task.

- [ ] **Step 3: Run the focused client tests (GREEN).**

Run:

```text
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/ui/app.test.tsx --testTimeout=120000 --reporter=verbose
```

Expected: new transport/factory tests and the existing UI suite pass. The request body contains only the three allowed descriptor fields and the key appears only in headers.

- [ ] **Step 4: Refactor only for boundary clarity (REFACTOR).**

Remove only imports or helpers made unused by the new signature; keep the existing normalization and non-room API calls unchanged. Confirm no key is added to `PublicRoom`, `RoomResponse`, ledger, replay, or any generic body helper.

Run:

```text
npx tsc --noEmit
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/ui/app.test.tsx --testTimeout=120000 --reporter=dot
git diff --check
```

Expected: typecheck and both UI suites pass; `git diff --check` exits 0.

- [ ] **Step 5: Commit the transport boundary.**

```text
git add src/ui/api.ts tests/ui/app.test.tsx tests/ui/productionIdentityLifecycle.test.tsx
git commit -m "feat: add UI room intent idempotency transport"
```

Commit boundary: only client intent/header transport and its direct tests; no App lifecycle behavior is committed here.

---

### Task 2: Implement App lifecycle, duplicate-click guard, and uncertain retry

**Files:**
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/productionIdentityLifecycle.test.tsx`

**Interfaces:**
- Consumes `CreateRoomIntent`, `createRoomIntent`, `createGameRoom`, and typed errors from Task 1.
- Produces the runtime union `undefined | { kind: "pending"; intent: CreateRoomIntent } | { kind: "uncertain"; intent: CreateRoomIntent }`, a retry action using the original intent, and normal create/next actions that snapshot their descriptor once. There is no `idle`, `settled`, `succeeded`, or `failed` runtime variant.

- [ ] **Step 1: Add failing lifecycle tests (RED).**

Extend `tests/ui/productionIdentityLifecycle.test.tsx` with these concrete cases:

```ts
it("uses the same key when a lost response is retried", async () => {
  // first fetch rejects after the request is captured; clicking the retry button
  // resolves the second request with a room
  expect(firstKey).toBe(secondKey);
});

it("does not generate a second key during a pending double click", async () => {
  // leave the first fetch pending, fire the toolbar and settlement create controls
  // synchronously, and observe the deferred request before resolving it
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(randomUUID).toHaveBeenCalledTimes(1);
});

it("starts the next round with a new key", async () => {
  // resolve first room, click the settlement next-round control
  expect(nextKey).not.toBe(firstKey);
});

it("ends an explicit 4xx intent so the next create uses a new key", async () => {
  // first response is 409/400, next normal click resolves with a room
  expect(secondKey).not.toBe(firstKey);
});

it("keeps one key across multiple uncertain retries and rerenders", async () => {
  // reject twice, call rerender between retry attempts, and assert all captured
  // headers equal
  expect(new Set(capturedKeys)).toHaveSize(1);
  expect(randomUUID).toHaveBeenCalledTimes(1);
});

it("fails closed when key generation fails", async () => {
  // randomUUID or getRandomValues throws before the intent is stored; click create
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText("无法生成创建请求标识。请重试。")).toBeInTheDocument();
});

it("does not enter pending when intent serialization fails", async () => {
  // make JSON.stringify throw before the intent is returned; click create
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /开房/ })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "重试创建" })).not.toBeInTheDocument();
});

it("does not replace an uncertain intent with a normal create", async () => {
  // leave the first request uncertain, click the normal create control, and
  // assert that only the explicit retry can issue the second request
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(new Set(capturedKeys)).toHaveSize(1);
});

it("does not write state when a pending request resolves after unmount", async () => {
  // start a deferred request, unmount, resolve it, and assert no late state write
  // or retry affordance is produced
  expect(screen.queryByRole("button", { name: "重试创建" })).not.toBeInTheDocument();
});

it("does not restore an intent key from storage after remount", async () => {
  // unmount, remount, and click create; the new request gets a newly generated key
  expect(remountedKey).not.toBe(unmountedKey);
});

it("allows only one retry request when the retry button is double clicked", async () => {
  // leave the retry request pending and fire the retry button twice synchronously
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(randomUUID).toHaveBeenCalledTimes(1);
});
```

The test fixture will use a deferred fetch promise so the double-click assertion observes `PENDING` before resolution. It will assert `firstRequest.body === intent.requestBodyJson`, `secondRequest.body === intent.requestBodyJson`, and `secondRequest.body === firstRequest.body`, while decoding the body to prove it contains only `rank`, `seed`, and `pendingTributeItems` and none of key/identity/sequence/gameId. It will assert that retry uses the unchanged key, seed, descriptor snapshot, and body string, and that a spy on `JSON.stringify` records one call for intent construction and zero additional calls for first request and retry. A serialization failure test will assert the runtime remains `undefined`/`NO_INTENT`, the normal create button remains enabled, and `fetch` has zero calls. It will also assert that a same-key/different-descriptor request is never silently substituted by the client; the server conflict is surfaced as an error.

Run:

```text
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx --testTimeout=120000 --reporter=verbose
```

Expected: RED because App currently has no intent ref, retry action, uncertain state, or generation failure handling.

- [ ] **Step 2: Implement the minimal App state machine.**

Add a ref typed exactly as `CreateIntentRuntime | undefined`, where `CreateIntentRuntime = { kind: "pending"; intent: CreateRoomIntent } | { kind: "uncertain"; intent: CreateRoomIntent }`, plus a small state value only to rerender the retry affordance. At the beginning of each create handler, synchronously return when the ref already has either runtime variant; otherwise create and store one intent before the first await. Route both “下一局” controls through the same handler, so both are covered by the same guard.

Use this behavior in the handlers:

```ts
const intent = createRoomIntent(rankSnapshot, tributeSnapshot);
createIntentRef.current = { kind: "pending", intent };
try {
  const nextRoom = await createGameRoom(intent);
  createIntentRef.current = undefined;
  applySuccessfulCreate(nextRoom);
} catch (error) {
  if (isRetryableCreateRoomError(error)) {
    createIntentRef.current = { kind: "uncertain", intent };
    setRetryableCreateIntent(intent);
  } else {
    createIntentRef.current = undefined;
    setRetryableCreateIntent(undefined);
  }
  throw error;
}
```

The retry control calls only `createGameRoom(existing.intent)`; it does not call `createRoomIntent`. It is disabled while pending, and a synchronous retry-button double click must result in one request because the runtime ref is set to `pending` before the first await. On valid 2xx success or definite HTTP/local failure, clear the runtime value. On key/seed/descriptor/serialization failure, do not assign the ref and do not call fetch. Keep the existing `runAction` pending-message/error behavior and add one clearly scoped retry button for the uncertain state. Disable both normal create buttons while an intent is pending or uncertain, not only while the shared `loading` state is true.

Add a mounted-owner ref/cleanup so a late request cannot set state after unmount. Do not persist keys in `localStorage`, `sessionStorage`, URL, React context, PublicRoom, ledger, or replay. A remount starts with no prior local intent; this is the explicit fail-closed unmount rule.

- [ ] **Step 3: Run lifecycle tests (GREEN).**

Run:

```text
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/ui/app.test.tsx --testTimeout=120000 --reporter=verbose
```

Expected: all new lifecycle cases pass, existing UI behavior remains passing, and every retry request has the original header key and descriptor.

- [ ] **Step 4: Refactor and verify the UI-only boundary (REFACTOR).**

Check that no key generation is in render/effect, no `identity`/`gameSequence`/`gameId` is read from UI state, and no unrelated loading/action code was changed. Keep `handleCreateRoom` and `handleNextRoom` as the only two intent constructors. Ensure the retry button is unavailable after explicit failure and that the next normal click creates a new key.

Run:

```text
npx tsc --noEmit
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/ui/app.test.tsx --testTimeout=120000 --reporter=dot
npm run build
git diff --check
```

Expected: typecheck, focused UI tests, build, and diff check all exit 0. No smoke, calibration, formal, benchmark, simulation, or performance command is run.

- [ ] **Step 5: Commit the App lifecycle.**

```text
git add src/ui/App.tsx tests/ui/productionIdentityLifecycle.test.tsx
git commit -m "feat: make UI room creation idempotent"
```

Commit boundary: App lifecycle and UI tests only; no server production file and no public contract change.

---

### Task 3: Add server idempotency/privacy regression evidence

**Files:**
- Create: `tests/server/apiIdempotency.test.ts`

**Interfaces:**
- Consumes the existing `buildApi`, `PublicIdentityStore`, `createPublicIdentityProvider`, `onRoomRegistry`, and `PublicLedgerReplayDocument`/replay helpers to inspect the complete public-data boundary.
- Produces focused evidence that the UI header contract reaches Task 2 and that key material remains outside public room, ledger, and replay data.

- [ ] **Step 1: Write the focused server characterization/regression tests (GREEN expected).**

Create a temporary store-backed Fastify harness and test these exact behaviors:

```ts
const first = await app.inject({
  method: "POST",
  url: "/api/rooms",
  headers: { "Idempotency-Key": "ui-intent-a" },
  payload: { rank: "2", seed: 123, pendingTributeItems: [] },
});
const second = await app.inject({
  method: "POST",
  url: "/api/rooms",
  headers: { "Idempotency-Key": "ui-intent-a" },
  payload: { rank: "2", seed: 123, pendingTributeItems: [] },
});
expect(second.json().room.id).toBe(first.json().room.id);

const conflict = await app.inject({
  method: "POST",
  url: "/api/rooms",
  headers: { "Idempotency-Key": "ui-intent-a" },
  payload: { rank: "K", seed: 123, pendingTributeItems: [] },
});
expect(conflict.statusCode).toBe(409);
expect(conflict.json()).toEqual({ error: "IDEMPOTENCY_CONFLICT" });
```

Capture the internal `RoomState` via `onRoomRegistry`, assert the key is absent from the returned PublicRoom, `publicLedger`, `publicEvents`, and replay-facing data, and assert the response has no `publicIdentity`, `publicLedger`, `publicEvents`, `idempotencyKey`, `identity`, `gameSequence`, or `gameId` property. Include an HTTP 4xx case proving that no second room is created. These tests do not change production server code.

Run:

```text
npx vitest run tests/server/apiIdempotency.test.ts --testTimeout=120000 --reporter=verbose
```

Expected: GREEN on the first run because this is characterization of the already approved Task 2 behavior. If any assertion fails, immediately pause, report `Task 2 contract mismatch`, do not modify any `src/server/*` file, and wait for re-review; do not manufacture a RED state by changing production code.

- [ ] **Step 2: Implement only the test harness/assertions.**

Reuse the existing temporary-directory cleanup and provider setup patterns from `tests/server/apiCanonicalIdentity.test.ts`; do not alter `src/server/api.ts`, `src/server/publicIdentityStore.ts`, `src/game/publicLedger.ts`, or `src/game/publicEventReplay.ts`.

- [ ] **Step 3: Run server tests (GREEN).**

Run:

```text
npx vitest run tests/server/apiIdempotency.test.ts tests/server/apiCanonicalIdentity.test.ts tests/server/publicRoomLegacyResponse.test.ts --testTimeout=120000 --reporter=verbose
```

Expected: all focused idempotency/privacy and existing Task 2 API suites pass; same key/same descriptor has one room, same key/different descriptor is 409, and the key is absent from public data.

- [ ] **Step 4: Refactor and verify the full Task 3 boundary (REFACTOR).**

Run:

```text
npx tsc --noEmit
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/ui/app.test.tsx tests/server/apiIdempotency.test.ts tests/server/apiCanonicalIdentity.test.ts tests/server/publicRoomLegacyResponse.test.ts --testTimeout=120000 --reporter=dot
npm run build
git diff --check
```

Expected: all commands exit 0. Record the exact test counts and natural exit; do not call this Task 3 complete unless these are fresh results from the Task 3 worktree.

- [ ] **Step 5: Commit the server evidence.**

```text
git add tests/server/apiIdempotency.test.ts
git commit -m "test: verify UI room idempotency privacy boundary"
```

Commit boundary: focused server regression tests only.

## Required Test Matrix Coverage

The implementation tests must map one-to-one to these requirements:

| Requirement | Test location/assertion |
|---|---|
| same intent first request/retry uses same key | UI lost-response test captures both headers |
| new intent uses different key | UI next-round and post-failure tests |
| pending double click creates no second key | deferred fetch + synchronous two-button click |
| key only in header | UI `RequestInit.headers`; exact body-key assertion |
| body omits idempotency/identity/sequence/gameId | UI JSON body forbidden-field assertions |
| PublicRoom/ledger/replay omit key | `apiIdempotency.test.ts` response + registry/internal replay assertions |
| lost HTTP response reuses original key | UI fetch rejection -> retry button |
| explicit 4xx ends intent | UI 4xx then next click gets a new key; server conflict stays 409 |
| 408/429/5xx remain retryable | API error-classification tests plus UI retry tests |
| same key/different descriptor is not silent success | server 409 assertion and UI error surfacing |
| key/descriptor/serialization local failure sends no request | `CreateRoomLocalError` tests, zero fetch calls |
| tribute descriptor is a deep snapshot | mutate original array and item after factory; serialized body remains unchanged |
| seed contract is exact | min `0`, max `4_294_967_295`, unsigned integer, new intent consumes new seed |
| retry does not regenerate seed | repeated uncertain retry has identical seed and one Web Crypto seed read |
| rerender does not replace pending key | Testing Library `rerender` while deferred request is pending |
| retry button double click sends one request | deferred retry request + synchronous double click |
| pending unmount ignores late promise | deferred request resolves after `unmount`, no state write/retry UI |
| remount does not restore key | unmount/remount with no storage read, next click has new key |
| normal create cannot replace uncertain intent | normal buttons disabled while uncertain; only explicit retry sends |
| more retries do not increase key generation count | repeated uncertain retry + `randomUUID` and `getRandomValues` call count = 1 |

## Risks and Mitigations

- **Current UI/server seed mismatch:** API currently rejects an omitted seed. Generate exactly one unsigned 32-bit seed in `0..4_294_967_295` with `Uint32Array` Web Crypto, freeze it in the intent, and reuse it on every retry; do not use time, `Math.random()`, or room id.
- **React state timing and duplicate clicks:** use a synchronous ref guard set before the first await; `loading` remains presentation state, not the idempotency authority.
- **StrictMode and rerenders:** generate only in event handler/factory and store in ref; no render/effect generation.
- **Response loss after server side effect:** keep the same immutable key and descriptor in `UNCERTAIN`; the server can return the original room on retry.
- **Explicit versus uncertain HTTP failure:** `CreateRoomHttpError` classifies 400/409/410/422 and other non-408/429/<500 statuses as definite, while 408/429/5xx remain retryable; missing/invalid 2xx bodies and fetch rejection use `CreateRoomUncertainError`. A 409 cannot be treated as success.
- **Unmount during a request:** ignore late state writes and do not persist a key for a new component instance; this is conservative fail-closed ownership rather than silently reusing a possibly stale key.
- **Privacy regression:** no server production edits are planned; focused server tests inspect both public output and internal ledger/events/replay-facing data.
- **Baseline test infrastructure:** preflight full `npm test` timed out once, while focused UI/server suites and typecheck passed after `npm ci`; Task 3 completion must report fresh focused evidence and must not claim the full suite passed without a successful run.

## Final Review Gate for This Task

After the three implementation commits, stop and report:

- worktree path, branch, exact HEAD, `git status --short`, and `git merge-base --is-ancestor bc9622d HEAD` exit code;
- exact files changed and commit hashes;
- focused UI command: `npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/ui/app.test.tsx --testTimeout=120000 --reporter=verbose`;
- Task 2 focused server command: `npx vitest run tests/server/apiIdempotency.test.ts tests/server/apiCanonicalIdentity.test.ts tests/server/api.test.ts tests/server/publicRoomLegacyResponse.test.ts --testTimeout=120000 --reporter=verbose`;
- one fresh complete `npm test` run, launched with an outer command timeout of at least `300000ms` (300 seconds); record exit code, natural completion, exact file count, exact test count, duration, and stderr. A tooling timeout is not a test failure, but no incomplete run can satisfy this gate and Task 3 cannot be called approvable until a complete run exists;
- `npx tsc --noEmit`, `npm run build`, the D0 fixture check-only command, and `git diff --check`, each with fresh exit code and output summary;
- D0 fixture check-only command: `npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree <d0-worktree> --source-commit e2a20e18f8e5c0871db38ad69426262e43766ce1 --output tests/ai/fixtures/d0KeepCurrentCases.json --generator-version d0-fixture-v1 --check-only`;
- clean worktree after the implementation commits; exact HEAD and exact test counts for every focused and complete run;
- all 12 required lifecycle/privacy assertions;
- any unresolved full-suite timeout or dependency issue;
- confirmation that no smoke, calibration, formal, D2b, Task 4, Task 5, D0/D1 artifact, approval, trace, schema, hash, ledger, replay, identity-provider/store, or server sequence change occurred.

Do not declare Task 3 approved or D2b startable from this plan alone; implementation requires plan review first, and D2b remains prohibited until the separately required D2a.1 overall acceptance gate and plan.

## Plan Self-Review Checklist

- No unresolved placeholder, deferred design choice, or unspecified implementation step remains.
- Error names are consistent everywhere: `CreateRoomHttpError`, `CreateRoomUncertainError`, `CreateRoomLocalError`, `isCreateRoomHttpError`, `isCreateRoomUncertainError`, `isCreateRoomLocalError`, `RetryableCreateRoomError`, and `isRetryableCreateRoomError`.
- Function signatures are consistent everywhere: `createRoomIntent(rank: GameRank, pendingTributeItems?: readonly TributeItem[]): CreateRoomIntent`, `createGameRoom(intent: CreateRoomIntent): Promise<PublicRoom>`, and internal `postCreateRoom(intent: CreateRoomIntent): Promise<RoomResponse>`.
- Runtime state names are consistent everywhere: `undefined`, `{ kind: "pending"; intent }`, and `{ kind: "uncertain"; intent }`; success and definite failure clear the runtime value.
- Each required test has a concrete assertion, command, and expected result; the server file is explicitly characterization/regression with GREEN expected and a stop/no-server-change rule on mismatch.
- The three commit boundaries contain only `src/ui/api.ts` plus direct UI tests, `src/ui/App.tsx` plus lifecycle tests, and server regression tests respectively; none contains server production code.
