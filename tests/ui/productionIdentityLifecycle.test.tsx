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
