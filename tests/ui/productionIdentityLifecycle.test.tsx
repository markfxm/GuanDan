import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { App } from "../../src/ui/App";
import { createGameRoom, createRoomIntent, isCreateRoomHttpError, isCreateRoomLocalError, isCreateRoomUncertainError, isRetryableCreateRoomError } from "../../src/ui/api";
import type { PublicRoom, TributeItem } from "../../src/ui/api";

const canonicalKey = "00000000-0000-4000-8000-00000000000a";
type CanonicalUuid = `${string}-${string}-${string}-${string}-${string}`;
const validRoom: PublicRoom = {
  id: "room-1",
  rank: "2",
  players: [
    { seat: 0, name: "Player", isAI: false, handCount: 0, team: 0 },
    { seat: 1, name: "AI 1", isAI: true, handCount: 0, team: 1 },
    { seat: 2, name: "AI 2", isAI: true, handCount: 0, team: 0 },
    { seat: 3, name: "AI 3", isAI: true, handCount: 0, team: 1 },
  ],
  currentTurn: 0,
  leaderSeat: 0,
  currentTrickIndex: 0,
  trick: { leadSeat: 0, passSeats: [], plays: [] },
  finishOrder: [],
  aiPlans: {},
  playHistory: [],
  replayHands: { 0: [], 1: [], 2: [], 3: [] },
  status: "playing",
  actionLog: [],
  humanSeat: 0,
  humanHand: [],
  announcements: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

function mockCrypto(key: string = canonicalKey, seed = 123) {
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(key as CanonicalUuid);
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(values: T): T => {
    if (values instanceof Uint32Array) values[0] = seed;
    return values;
  });
}

function mockSuccess() {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 201,
    statusText: "Created",
    json: async () => ({ room: validRoom }),
  } as Response);
}

function mockResponse(status: number, body: unknown, statusText = "Response") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockAppCreateQueue(responses: Array<Promise<Response>>) {
  const roomRequests: RequestInit[] = [];
  let roomRequestIndex = 0;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const path = typeof input === "string" ? input : input.toString();
    if (path === "/api/plans") {
      return Promise.resolve(mockResponse(200, { plans: [] }));
    }

    roomRequests.push((init ?? {}) as RequestInit);
    return responses[roomRequestIndex++] ?? Promise.reject(new Error("unexpected room request"));
  });
  return { fetchSpy, roomRequests };
}

const finishedRoom: PublicRoom = {
  ...validRoom,
  status: "finished",
  finishOrder: [0],
  settlement: {
    winningTeam: 0,
    outcome: "single-win",
    levelStep: 1,
    currentRank: "2",
    nextRank: "3",
    tribute: { status: "none", items: [] },
  },
};

function clickCreate() {
  fireEvent.click(screen.getByRole("button", { name: /开房/ }));
}

function clickRetry() {
  fireEvent.click(screen.getByRole("button", { name: /重试创建/ }));
}

function requestKey(request: RequestInit): string {
  return (request.headers as Record<string, string>)["Idempotency-Key"]!;
}

it("uses the same intent key, descriptor, and body after a lost response retry", async () => {
  mockCrypto("retry:key._~-", 123);
  const first = deferred<Response>();
  mockAppCreateQueue([first.promise, Promise.resolve(mockResponse(200, { room: validRoom }))]);

  render(<App />);
  clickCreate();
  await act(async () => first.reject(new Error("network result lost")));

  await waitFor(() => expect(screen.getByRole("button", { name: /重试创建/ })).toBeInTheDocument());
  const firstRequest = vi.mocked(fetch).mock.calls.find(([input]) => input === "/api/rooms")![1] as RequestInit;
  clickRetry();
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(2));
  const secondRequest = vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")[1]![1] as RequestInit;

  expect(requestKey(secondRequest)).toBe(requestKey(firstRequest));
  expect(secondRequest.body).toBe(firstRequest.body);
  expect(JSON.parse(String(secondRequest.body))).toEqual({
    rank: "2",
    seed: 123,
    pendingTributeItems: [],
  });
  expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(crypto.getRandomValues)).toHaveBeenCalledTimes(1);
});

it("does not issue a second request or generate a second key on a pending double click", async () => {
  mockCrypto("pending:key._~-", 234);
  const first = deferred<Response>();
  mockAppCreateQueue([first.promise]);

  render(<App />);
  clickCreate();
  clickCreate();

  expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(1);
  expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(crypto.getRandomValues)).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve(mockResponse(200, { room: validRoom })));
});

it("starts the next round with a new intent and key", async () => {
  mockCrypto("first-round:key._~-", 345);
  vi.mocked(crypto.randomUUID).mockReturnValueOnce("first-round:key._~-" as CanonicalUuid).mockReturnValueOnce("next-round:key._~-" as CanonicalUuid);
  vi.mocked(crypto.getRandomValues).mockImplementationOnce(<T extends ArrayBufferView | null>(values: T): T => {
    if (values instanceof Uint32Array) values[0] = 345;
    return values;
  }).mockImplementationOnce(<T extends ArrayBufferView | null>(values: T): T => {
    if (values instanceof Uint32Array) values[0] = 456;
    return values;
  });
  mockAppCreateQueue([
    Promise.resolve(mockResponse(200, { room: finishedRoom })),
    Promise.resolve(mockResponse(200, { room: validRoom })),
  ]);

  render(<App />);
  clickCreate();
  await waitFor(() => expect(screen.getByRole("button", { name: /进行下一局/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /进行下一局/ }));
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(2));

  const requests = vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms").map(([, init]) => init as RequestInit);
  expect(requestKey(requests[1]!)).not.toBe(requestKey(requests[0]!));
  expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(2);
  expect(vi.mocked(crypto.getRandomValues)).toHaveBeenCalledTimes(2);
});

it("clears a definite failure so the next normal create gets a new key", async () => {
  mockCrypto("failed:key._~-", 567);
  vi.mocked(crypto.randomUUID).mockReturnValueOnce("failed:key._~-" as CanonicalUuid).mockReturnValueOnce("new:key._~-" as CanonicalUuid);
  const fetchSpy = mockAppCreateQueue([
    Promise.resolve(mockResponse(409, { error: "IDEMPOTENCY_CONFLICT" }, "Conflict")),
    Promise.resolve(mockResponse(200, { room: validRoom })),
  ]).fetchSpy;

  render(<App />);
  clickCreate();
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: /重试创建/ })).not.toBeInTheDocument();
  clickCreate();
  await waitFor(() => expect(fetchSpy.mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(2));

  const requests = fetchSpy.mock.calls.filter(([input]) => input === "/api/rooms").map(([, init]) => init as RequestInit);
  expect(requestKey(requests[1]!)).not.toBe(requestKey(requests[0]!));
});

it("keeps one uncertain intent through retries and rerenders", async () => {
  mockCrypto("rerender:key._~-", 678);
  const second = deferred<Response>();
  const third = deferred<Response>();
  const first = deferred<Response>();
  mockAppCreateQueue([first.promise, second.promise, third.promise]);

  const app = render(<App />);
  clickCreate();
  await act(async () => first.reject(new Error("offline")));
  await waitFor(() => expect(screen.getByRole("button", { name: /重试创建/ })).toBeInTheDocument());
  clickRetry();
  await act(async () => second.reject(new Error("still offline")));
  await waitFor(() => expect(screen.getByRole("button", { name: /重试创建/ })).toBeInTheDocument());
  app.rerender(<App />);
  clickRetry();
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(3));

  const requests = vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms").map(([, init]) => init as RequestInit);
  expect(new Set(requests.map(requestKey)).size).toBe(1);
  expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(1);
  await act(async () => third.resolve(mockResponse(200, { room: validRoom })));
});

it.each([408, 429, 500])("offers explicit retry for uncertain HTTP %s", async (status) => {
  mockCrypto("http-" + status + ":key._~-", 789);
  mockAppCreateQueue([
    Promise.resolve(mockResponse(status, { error: "TRY_AGAIN" }, "Retryable")),
    Promise.resolve(mockResponse(200, { room: validRoom })),
  ]);

  render(<App />);
  clickCreate();
  await waitFor(() => expect(screen.getByRole("button", { name: /重试创建/ })).toBeInTheDocument());
  expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(1);
});

it("does not replace an uncertain intent with a normal create", async () => {
  mockCrypto("uncertain:key._~-", 890);
  const first = deferred<Response>();
  mockAppCreateQueue([first.promise, Promise.resolve(mockResponse(200, { room: validRoom }))]);

  render(<App />);
  clickCreate();
  await act(async () => first.reject(new Error("offline")));
  await waitFor(() => expect(screen.getByRole("button", { name: /重试创建/ })).toBeInTheDocument());
  clickCreate();

  expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(1);
});

it("fails closed when key generation fails", async () => {
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
    throw new Error("crypto unavailable");
  });
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  render(<App />);
  clickCreate();

  await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
  expect(screen.getByRole("button", { name: /开房/ })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /重试创建/ })).not.toBeInTheDocument();
});

it("does not enter pending when intent serialization fails", async () => {
  mockCrypto("serialization:key._~-", 901);
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  render(<App />);
  const originalStringify = JSON.stringify;
  vi.spyOn(JSON, "stringify").mockImplementation((value, replacer, space) => {
    if (value && typeof value === "object" && Object.keys(value).sort().join("|") === "pendingTributeItems|rank|seed") {
      throw new Error("serialization unavailable");
    }
    return originalStringify(value, replacer, space);
  });
  clickCreate();

  await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
  expect(screen.getByRole("button", { name: /开房/ })).toBeEnabled();
  expect(screen.queryByRole("button", { name: /重试创建/ })).not.toBeInTheDocument();
});

it("does not generate an intent during StrictMode render or rerender", async () => {
  mockCrypto("strict:key._~-", 902);
  const response = Promise.resolve(mockResponse(200, { room: validRoom }));
  mockAppCreateQueue([response]);
  const { rerender } = render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  rerender(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  expect(vi.mocked(crypto.randomUUID)).not.toHaveBeenCalled();
  clickCreate();
  await waitFor(() => expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(1));
});

it("allows only one retry request when retry is double clicked", async () => {
  mockCrypto("retry-double:key._~-", 903);
  const first = deferred<Response>();
  const retry = deferred<Response>();
  mockAppCreateQueue([first.promise, retry.promise]);

  render(<App />);
  clickCreate();
  await act(async () => first.reject(new Error("offline")));
  await waitFor(() => expect(screen.getByRole("button", { name: /重试创建/ })).toBeInTheDocument());
  clickRetry();
  clickRetry();

  expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/rooms")).toHaveLength(2);
  expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(1);
  await act(async () => retry.resolve(mockResponse(200, { room: validRoom })));
});

it("does not write state after a pending request resolves post-unmount and does not restore its key", async () => {
  mockCrypto("unmounted:key._~-", 904);
  vi.mocked(crypto.randomUUID).mockReturnValueOnce("unmounted:key._~-" as CanonicalUuid).mockReturnValueOnce("remounted:key._~-" as CanonicalUuid);
  const first = deferred<Response>();
  const second = deferred<Response>();
  const { roomRequests } = mockAppCreateQueue([first.promise, second.promise]);

  const firstRender = render(<App />);
  clickCreate();
  const firstKey = requestKey(roomRequests[0]!);
  firstRender.unmount();
  await act(async () => first.resolve(mockResponse(200, { room: validRoom })));

  render(<App />);
  clickCreate();
  await waitFor(() => expect(roomRequests).toHaveLength(2));
  expect(requestKey(roomRequests[1]!)).not.toBe(firstKey);
  await act(async () => second.resolve(mockResponse(200, { room: validRoom })));
});

it.each([0, 0xFFFFFFFF])("accepts crypto seed boundary %s", async (seed) => {
  mockCrypto(canonicalKey, seed);
  mockSuccess();

  const intent = createRoomIntent("2");
  await createGameRoom(intent);

  expect(intent.seed).toBe(seed);
  expect(JSON.parse(intent.requestBodyJson)).toEqual({ rank: "2", seed, pendingTributeItems: [] });
});

it("copies and freezes the descriptor deeply and isolates the request body", async () => {
  mockCrypto();
  mockSuccess();
  const item: TributeItem = { payer: 1, receiver: 3 };
  const items = [item];
  const stringify = vi.spyOn(JSON, "stringify");
  const intent = createRoomIntent("2", items);

  item.payer = 2;
  items.push({ payer: 0, receiver: 2 });

  expect(Object.isFrozen(intent)).toBe(true);
  expect(Object.isFrozen(intent.pendingTributeItems)).toBe(true);
  expect(Object.isFrozen(intent.pendingTributeItems[0])).toBe(true);
  expect(intent.pendingTributeItems).not.toBe(items);
  expect(intent.pendingTributeItems[0]).not.toBe(item);
  expect(intent.pendingTributeItems).toEqual([{ payer: 1, receiver: 3 }]);
  expect(intent.requestBodyJson).toBe('{"rank":"2","seed":123,"pendingTributeItems":[{"payer":1,"receiver":3}]}');

  await createGameRoom(intent);
  expect(stringify).toHaveBeenCalledTimes(1);
  expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body).toBe(intent.requestBodyJson);
});

it("uses a new key and seed for a new intent while retries reuse the exact body", async () => {
  mockCrypto(canonicalKey, 0);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

  const first = createRoomIntent("2");
  vi.mocked(crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-00000000000b");
  vi.mocked(crypto.getRandomValues).mockImplementation(<T extends ArrayBufferView | null>(values: T): T => {
    if (values instanceof Uint32Array) values[0] = 0xFFFFFFFF;
    return values;
  });
  const second = createRoomIntent("2");

  await expect(createGameRoom(first)).rejects.toMatchObject({ kind: "uncertain", source: "fetch" });
  await expect(createGameRoom(first)).rejects.toMatchObject({ kind: "uncertain", source: "fetch" });
  await expect(createGameRoom(second)).rejects.toMatchObject({ kind: "uncertain", source: "fetch" });

  const calls = vi.mocked(fetch).mock.calls;
  expect(first.idempotencyKey).toBe(canonicalKey);
  expect(second.idempotencyKey).toBe("00000000-0000-4000-8000-00000000000b");
  expect(first.seed).toBe(0);
  expect(second.seed).toBe(0xFFFFFFFF);
  const firstRequest = calls[0]![1] as RequestInit;
  const secondRequest = calls[1]![1] as RequestInit;
  const newIntentRequest = calls[2]![1] as RequestInit;
  expect(firstRequest.body).toBe(first.requestBodyJson);
  expect(secondRequest.body).toBe(first.requestBodyJson);
  expect(secondRequest.body).toBe(firstRequest.body);
  expect(newIntentRequest.body).toBe(second.requestBodyJson);
  expect(newIntentRequest.body).not.toBe(firstRequest.body);
  expect((firstRequest.headers as Record<string, string>)["Idempotency-Key"]).toBe(first.idempotencyKey);
  expect((secondRequest.headers as Record<string, string>)["Idempotency-Key"]).toBe(first.idempotencyKey);
  expect((newIntentRequest.headers as Record<string, string>)["Idempotency-Key"]).toBe(second.idempotencyKey);
  expect(vi.mocked(crypto.randomUUID)).toHaveBeenCalledTimes(2);
  expect(vi.mocked(crypto.getRandomValues)).toHaveBeenCalledTimes(2);
});

it("serializes one intent once across a fetch-rejection retry", async () => {
  const stringify = vi.spyOn(JSON, "stringify");
  mockCrypto();
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  const intent = createRoomIntent("2");

  await expect(createGameRoom(intent)).rejects.toMatchObject({ kind: "uncertain", source: "fetch" });
  await expect(createGameRoom(intent)).rejects.toMatchObject({ kind: "uncertain", source: "fetch" });

  expect(stringify).toHaveBeenCalledTimes(1);
  expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body).toBe(intent.requestBodyJson);
  expect((vi.mocked(fetch).mock.calls[1]![1] as RequestInit).body).toBe(intent.requestBodyJson);
});

it("sends the idempotency key only as a header and sends exactly the required body fields", async () => {
  mockCrypto();
  mockSuccess();
  const intent = createRoomIntent("2", [{ payer: 1, receiver: 3 }]);

  await createGameRoom(intent);

  const request = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
  expect(request.headers).toEqual({ "Content-Type": "application/json", "Idempotency-Key": canonicalKey });
  expect(JSON.parse(String(request.body))).toEqual({
    rank: "2",
    seed: 123,
    pendingTributeItems: [{ payer: 1, receiver: 3 }],
  });
  expect(String(request.body)).not.toMatch(/idempotency|identity|gameSequence|gameId/);
});

it("accepts normalizable legacy room fields without treating them as an invalid response", async () => {
  mockCrypto();
  const legacyRoom = {
    ...validRoom,
    currentTrickIndex: undefined,
    aiPlans: undefined,
    playHistory: undefined,
    replayHands: undefined,
    trick: { leadSeat: 0, passSeats: [] },
  };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(200, { room: legacyRoom }));

  const result = await createGameRoom(createRoomIntent("2"));

  expect(result.currentTrickIndex).toBe(0);
  expect(result.aiPlans).toEqual({});
  expect(result.playHistory).toEqual([]);
  expect(result.replayHands).toEqual({ 0: [], 1: [], 2: [], 3: [] });
  expect(result.trick.plays).toEqual([]);
});

it("accepts any opaque key that satisfies the server header contract", async () => {
  const serverCompatibleKey = "opaque:key._~-";
  mockCrypto(serverCompatibleKey);
  mockSuccess();

  const intent = createRoomIntent("2");
  await createGameRoom(intent);

  expect(intent.idempotencyKey).toBe(serverCompatibleKey);
  expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers).toEqual({
    "Content-Type": "application/json",
    "Idempotency-Key": serverCompatibleKey,
  });
});

it.each([
  "",
  "bad key/space",
  "é",
  "x".repeat(129),
])("rejects a server-invalid randomUUID result (%s) locally", async (key) => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  mockCrypto(key);

  await expect(Promise.resolve().then(() => createRoomIntent("2"))).rejects.toSatisfy((error) => isCreateRoomLocalError(error) && error.source === "crypto");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("rejects randomUUID and getRandomValues failures locally without fetching", async () => {
  const firstFetchSpy = vi.spyOn(globalThis, "fetch");
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => { throw new Error("randomUUID unavailable"); });
  await expect(Promise.resolve().then(() => createRoomIntent("2"))).rejects.toSatisfy((error) => isCreateRoomLocalError(error) && error.source === "crypto");
  expect(firstFetchSpy).not.toHaveBeenCalled();

  vi.restoreAllMocks();
  const secondFetchSpy = vi.spyOn(globalThis, "fetch");
  mockCrypto();
  vi.mocked(crypto.getRandomValues).mockImplementation(() => { throw new Error("getRandomValues unavailable"); });
  await expect(Promise.resolve().then(() => createRoomIntent("2"))).rejects.toSatisfy((error) => isCreateRoomLocalError(error) && error.source === "crypto");
  expect(secondFetchSpy).not.toHaveBeenCalled();
});

it("rejects descriptor failures locally without fetching", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  mockCrypto();

  await expect(Promise.resolve().then(() => createRoomIntent("invalid" as never))).rejects.toSatisfy((error) => isCreateRoomLocalError(error) && error.source === "descriptor");
  await expect(Promise.resolve().then(() => createRoomIntent("2", [{ payer: 4, receiver: 0 } as never]))).rejects.toSatisfy((error) => isCreateRoomLocalError(error) && error.source === "descriptor");
  const throwingItem = {
    get payer(): never {
      throw new Error("descriptor getter unavailable");
    },
    receiver: 0,
  } as unknown as TributeItem;
  await expect(Promise.resolve().then(() => createRoomIntent("2", [throwingItem]))).rejects.toSatisfy((error) => isCreateRoomLocalError(error) && error.source === "descriptor");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("rejects serialization failures locally without fetching", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  mockCrypto();
  vi.spyOn(JSON, "stringify").mockImplementation(() => { throw new Error("serialization unavailable"); });

  await expect(Promise.resolve().then(() => createRoomIntent("2"))).rejects.toSatisfy((error) => isCreateRoomLocalError(error) && error.source === "serialization");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it.each([
  ["invalid JSON", (): unknown => { throw new Error("invalid JSON"); }],
  ["missing body", (): unknown => undefined],
  ["absent room", (): unknown => ({})],
  ["malformed room", (): unknown => ({ room: { id: "room-1" } })],
] as const)("classifies %s 2xx responses as uncertain response failures", async (_label, json) => {
  mockCrypto();
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ...mockResponse(200, undefined), json } as Response);

  await expect(createGameRoom(createRoomIntent("2"))).rejects.toSatisfy((error) => isCreateRoomUncertainError(error) && error.source === "response" && isRetryableCreateRoomError(error));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([
  [400, "definite-failure"],
  [409, "definite-failure"],
  [410, "definite-failure"],
  [422, "definite-failure"],
  [302, "definite-failure"],
  [408, "uncertain"],
  [429, "uncertain"],
  [500, "uncertain"],
  [503, "uncertain"],
] as const)("classifies HTTP %s as %s", async (status, classification) => {
  mockCrypto();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(status, { error: "server-error" }));

  await expect(createGameRoom(createRoomIntent("2"))).rejects.toSatisfy((error) => {
    return isCreateRoomHttpError(error)
      && error.status === status
      && error.classification === classification
      && (classification === "uncertain" ? isRetryableCreateRoomError(error) : !isRetryableCreateRoomError(error));
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves HTTP status details in a definite error", async () => {
  mockCrypto();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(409, { error: "IDEMPOTENCY_CONFLICT" }, "Conflict"));

  await expect(createGameRoom(createRoomIntent("2"))).rejects.toSatisfy((error) => {
    return isCreateRoomHttpError(error)
      && error.status === 409
      && error.statusText === "Conflict"
      && error.serverError === "IDEMPOTENCY_CONFLICT"
      && !isRetryableCreateRoomError(error);
  });
});

it("does not automatically retry a fetch rejection", async () => {
  mockCrypto();
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  const intent = createRoomIntent("2");

  await expect(createGameRoom(intent)).rejects.toSatisfy((error) => isCreateRoomUncertainError(error) && error.source === "fetch");
  expect(fetch).toHaveBeenCalledTimes(1);
});
