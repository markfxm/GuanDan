import { buildApi } from "../../src/server/api";
import { createDeck } from "../../src/engine/cards";
import WebSocket from "ws";

async function withApp(run: (app: ReturnType<typeof buildApi>) => Promise<void>) {
  const app = buildApi();

  try {
    await run(app);
  } finally {
    await app.close();
  }
}

async function withListeningApp(run: (app: ReturnType<typeof buildApi>, wsBaseUrl: string) => Promise<void>) {
  const app = buildApi();
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === "string") {
    await app.close();
    throw new Error("Expected a TCP server address.");
  }

  try {
    await run(app, `ws://127.0.0.1:${address.port}`);
  } finally {
    await app.close();
  }
}

type SocketRoomUpdate = { type: string; room: Record<string, unknown> };

function openRoomSocket(wsBaseUrl: string, roomId: string, playerId: string): Promise<{ socket: WebSocket; initial: SocketRoomUpdate }> {
  const socket = new WebSocket(`${wsBaseUrl}/ws/rooms/${roomId}?playerId=${encodeURIComponent(playerId)}`);
  return new Promise((resolve, reject) => {
    let opened = false;
    let initial: SocketRoomUpdate | undefined;
    const resolveWhenReady = () => {
      if (opened && initial !== undefined) {
        resolve({ socket, initial });
      }
    };

    socket.once("open", () => {
      opened = true;
      resolveWhenReady();
    });
    socket.once("message", (data) => {
      try {
        initial = JSON.parse(data.toString()) as SocketRoomUpdate;
        resolveWhenReady();
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

function nextSocketMessage(socket: WebSocket): Promise<SocketRoomUpdate> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      try {
        resolve(JSON.parse(data.toString()) as SocketRoomUpdate);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once("close", () => resolve());
    socket.close();
  });
}

it("deals 27 cards", async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
    expect(response.statusCode).toBe(200);
    expect(response.json().hand).toHaveLength(27);
  });
});

it("returns scored plans", async () => {
  await withApp(async (app) => {
    const deal = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
    const hand = deal.json().hand;
    const response = await app.inject({
      method: "POST",
      url: "/api/plans",
      payload: { rank: "10", cards: hand, count: 3 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().plans).toHaveLength(3);
    expect(response.json().plans[0].score).toBeGreaterThanOrEqual(0);
  });
});

it("returns scored plans for an in-progress partial hand", async () => {
  await withApp(async (app) => {
    const deal = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
    const partialHand = deal.json().hand.slice(0, 8);
    const response = await app.inject({
      method: "POST",
      url: "/api/plans",
      payload: { rank: "10", cards: partialHand, count: 3 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().plans).toHaveLength(3);
  });
});

it("creates and returns a local playable room", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    expect(created.statusCode).toBe(200);
    expect(created.json().playerId).toEqual(expect.any(String));
    expect(created.json().seat).toBe(0);
    expect(created.json().room.humanHand).toHaveLength(27);
    expect(created.json().room.players).toHaveLength(4);
    expect(created.json().room.hands).toBeUndefined();

    const fetched = await app.inject({ method: "GET", url: `/api/rooms/${created.json().room.id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().room.id).toBe(created.json().room.id);
  });
});

it("evaluates opening tribute after creating the next room", async () => {
  await withApp(async (app) => {
    const created = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {
        rank: "K",
        seed: 11,
        pendingTributeItems: [
          { payer: 1, receiver: 0 },
          { payer: 3, receiver: 2 },
        ],
      },
    });

    expect(created.statusCode).toBe(200);
    expect(created.json().room.openingTribute).toMatchObject({
      status: "anti-tribute",
      reason: "进贡方合计持有两张大王，抗贡成立。",
    });
  });
});

it("advances opening tribute through API and accepts a human return card", async () => {
  await withApp(async (app) => {
    const created = await app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: {
        rank: "K",
        seed: 1,
        pendingTributeItems: [{ payer: 3, receiver: 0 }],
      },
    });
    const room = created.json().room;

    expect(room.openingTribute.status).toBe("pending");
    expect(room.openingTribute.phase).toBe("tribute");

    const tribute = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.id}/tribute`,
      payload: { playerId: created.json().playerId },
    });
    expect(tribute.statusCode).toBe(200);
    const afterTribute = tribute.json().room;
    expect(afterTribute.openingTribute.phase).toBe("return");
    expect(afterTribute.openingTribute.activeSeat).toBe(0);
    expect(afterTribute.openingTribute.activeCard).toBeDefined();

    const returnCard = afterTribute.humanHand.find(
      (card: { kind: string; rank: string; suit?: string }) =>
        card.kind === "suited" && ["2", "3", "4", "5", "6", "7", "8", "9"].includes(card.rank) && !(card.suit === "hearts" && card.rank === "K"),
    );
    expect(returnCard).toBeDefined();

    const returned = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.id}/tribute`,
      payload: { playerId: created.json().playerId, cardIds: [returnCard.id] },
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json().room.openingTribute.status).toBe("completed");
    expect(returned.json().room.openingTribute.exchanges[0].returnCard.id).toBe(returnCard.id);
  });
});

it("plays, passes, and advances AI through room APIs", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const room = created.json().room;
    const cardId = room.humanHand[0].id;

    const played = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.id}/play`,
      payload: { playerId: created.json().playerId, cardIds: [cardId] },
    });
    expect(played.statusCode).toBe(200);
    expect(played.json().room.humanHand.map((card: { id: string }) => card.id)).not.toContain(cardId);
    expect(played.json().room.currentTurn).toBe(3);
    expect(played.json().room.trick.plays).toHaveLength(1);

    const ai = await app.inject({ method: "POST", url: `/api/rooms/${room.id}/ai-step`, payload: {} });
    expect(ai.statusCode).toBe(200);
    expect(ai.json().room.players).toHaveLength(4);
    expect(ai.json().room.trick.plays.length).toBeGreaterThanOrEqual(2);
  });
}, 15000);

it("passes using the session seat resolved from playerId", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const joined = await app.inject({
      method: "POST",
      url: `/api/rooms/${created.json().room.id}/join`,
      payload: { name: "West", preferredSeat: 3 },
    });
    const cardId = created.json().room.humanHand[0].id;
    const played = await app.inject({
      method: "POST",
      url: `/api/rooms/${created.json().room.id}/play`,
      payload: { playerId: created.json().playerId, cardIds: [cardId] },
    });
    expect(played.statusCode).toBe(200);

    const passed = await app.inject({
      method: "POST",
      url: `/api/rooms/${created.json().room.id}/pass`,
      payload: { playerId: joined.json().playerId },
    });

    expect(passed.statusCode).toBe(200);
    expect(passed.json().room.humanSeat).toBe(3);
  });
});

it("rejects room actions with a missing or invalid playerId", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const roomId = created.json().room.id;
    const cardId = created.json().room.humanHand[0].id;

    const missing = await app.inject({ method: "POST", url: `/api/rooms/${roomId}/play`, payload: { cardIds: [cardId] } });
    const invalid = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/pass`,
      payload: { playerId: "not-a-session" },
    });

    expect(missing.statusCode).toBe(400);
    expect(invalid.statusCode).toBe(403);
  });
});

it("does not accept a client-provided seat for play authorization", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const roomId = created.json().room.id;
    const playerId = created.json().playerId;
    const cardId = created.json().room.humanHand[0].id;

    const spoofed = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/play`,
      payload: { playerId, seat: 1, cardIds: [cardId] },
    });
    const ownView = await app.inject({ method: "GET", url: `/api/rooms/${roomId}?playerId=${playerId}` });

    expect(spoofed.statusCode).toBe(400);
    expect(ownView.json().room.humanHand.map((card: { id: string }) => card.id)).toContain(cardId);
  });
});

it("rejects invalid deal seed values", async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: "abc" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors).toContain("Seed must be a finite integer.");
  });
});

it.each([2, 6, "3", 3.5])("rejects invalid plan count %#", async (count) => {
  await withApp(async (app) => {
    const deal = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
    const hand = deal.json().hand;
    const response = await app.inject({ method: "POST", url: "/api/plans", payload: { rank: "10", cards: hand, count } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors).toContain("Count must be an integer from 3 to 5.");
  });
});

it("rejects invalid rank for deal", async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "X", seed: 1 } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it("rejects invalid rank for plans", async () => {
  await withApp(async (app) => {
    const deal = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
    const hand = deal.json().hand;
    const response = await app.inject({ method: "POST", url: "/api/plans", payload: { rank: "X", cards: hand } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it.each(["http://127.0.0.1:5173", "http://localhost:5173"])(
  "allows OPTIONS requests from %s",
  async (origin) => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "OPTIONS", url: "/api/deal", headers: { origin } });
      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers.vary).toBe("Origin");
    });
  },
);

it("allows OPTIONS requests from a private LAN origin outside production", async () => {
  await withApp(async (app) => {
    const origin = "http://192.168.1.20:5173";
    const response = await app.inject({ method: "OPTIONS", url: "/api/deal", headers: { origin } });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });
});

it("joins an AI seat as a named human player", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const roomId = created.json().room.id;

    const joined = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      payload: { name: "Alice", preferredSeat: 2 },
    });

    expect(joined.statusCode).toBe(200);
    expect(joined.json().playerId).toEqual(expect.any(String));
    expect(joined.json().seat).toBe(2);
    expect(joined.json().room.humanSeat).toBe(2);
    expect(joined.json().room.players[2]).toMatchObject({ seat: 2, name: "Alice", isAI: false });
    expect(joined.json().room.hands).toBeUndefined();
    expect(joined.json().room.initialHands).toBeUndefined();
  });
});

it("sends personal room updates to every connected player socket", async () => {
  await withListeningApp(async (app, wsBaseUrl) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const roomId = created.json().room.id;
    const playerOneId = created.json().playerId;
    const playerOneConnection = await openRoomSocket(wsBaseUrl, roomId, playerOneId);
    const playerOneSocket = playerOneConnection.socket;
    const initialPlayerOne = playerOneConnection.initial;

    expect(initialPlayerOne.type).toBe("room:update");
    expect(initialPlayerOne.room.humanSeat).toBe(0);

    const joinUpdate = nextSocketMessage(playerOneSocket);
    const joined = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      payload: { name: "East", preferredSeat: 1 },
    });
    const afterJoin = await joinUpdate;

    expect(joined.statusCode).toBe(200);
    expect(afterJoin.type).toBe("room:update");
    expect(afterJoin.room.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ seat: 1, name: "East", isAI: false }),
    ]));

    const playerTwoId = joined.json().playerId;
    const playerTwoConnection = await openRoomSocket(wsBaseUrl, roomId, playerTwoId);
    const playerTwoSocket = playerTwoConnection.socket;
    const initialPlayerTwo = playerTwoConnection.initial;
    expect(initialPlayerTwo.type).toBe("room:update");
    expect(initialPlayerTwo.room.humanSeat).toBe(1);
    expect(initialPlayerOne.room.humanHand).not.toEqual(initialPlayerTwo.room.humanHand);

    const playerOneUpdate = nextSocketMessage(playerOneSocket);
    const playerTwoUpdate = nextSocketMessage(playerTwoSocket);
    const played = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/play`,
      payload: { playerId: playerOneId, cardIds: [created.json().room.humanHand[0].id] },
    });
    const [afterPlayOne, afterPlayTwo] = await Promise.all([playerOneUpdate, playerTwoUpdate]);

    expect(played.statusCode).toBe(200);
    expect(afterPlayOne.type).toBe("room:update");
    expect(afterPlayTwo.type).toBe("room:update");
    expect(afterPlayOne.room.humanSeat).toBe(0);
    expect(afterPlayTwo.room.humanSeat).toBe(1);

    await Promise.all([closeSocket(playerOneSocket), closeSocket(playerTwoSocket)]);
  });
}, 15000);

it("falls back to the first available seat and isolates player hands by playerId", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const roomId = created.json().room.id;

    const alice = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      payload: { name: "Alice", preferredSeat: 2 },
    });
    const bob = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      payload: { name: "Bob", preferredSeat: 2 },
    });

    expect(alice.json().seat).toBe(2);
    expect(bob.json().seat).toBe(1);

    const aliceView = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomId}?playerId=${alice.json().playerId}`,
    });
    const bobView = await app.inject({
      method: "GET",
      url: `/api/rooms/${roomId}?playerId=${bob.json().playerId}`,
    });

    expect(aliceView.statusCode).toBe(200);
    expect(bobView.statusCode).toBe(200);
    expect(aliceView.json().room.humanSeat).toBe(2);
    expect(bobView.json().room.humanSeat).toBe(1);
    expect(aliceView.json().room.humanHand.map((card: { id: string }) => card.id)).not.toEqual(
      bobView.json().room.humanHand.map((card: { id: string }) => card.id),
    );
  });
});

it("rejects joining when all seats already have human sessions", async () => {
  await withApp(async (app) => {
    const created = await app.inject({ method: "POST", url: "/api/rooms", payload: { rank: "10", seed: 1 } });
    const roomId = created.json().room.id;

    for (const name of ["Alice", "Bob", "Carol"]) {
      const joined = await app.inject({ method: "POST", url: `/api/rooms/${roomId}/join`, payload: { name } });
      expect(joined.statusCode).toBe(200);
    }

    const rejected = await app.inject({ method: "POST", url: `/api/rooms/${roomId}/join`, payload: { name: "Dave" } });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toEqual({ error: "No available seats." });
  });
});

it("does not allow a private LAN origin in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    await withApp(async (app) => {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/deal",
        headers: { origin: "http://192.168.1.20:5173" },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

it.each([null, {}, [null]])("rejects malformed plans cards %#", async (cards) => {
  await withApp(async (app) => {
    const response = await app.inject({ method: "POST", url: "/api/plans", payload: { rank: "10", cards } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it("rejects id-only cards for validate-hand", async () => {
  await withApp(async (app) => {
    const cards = Array.from({ length: 27 }, (_, index) => ({ id: `fake-${index}` }));
    const response = await app.inject({ method: "POST", url: "/api/validate-hand", payload: { cards } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it("rejects id-only cards for plans", async () => {
  await withApp(async (app) => {
    const cards = Array.from({ length: 27 }, (_, index) => ({ id: `fake-${index}` }));
    const response = await app.inject({ method: "POST", url: "/api/plans", payload: { rank: "10", cards } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it("rejects forged full-shape cards for validate-hand", async () => {
  await withApp(async (app) => {
    const cards = Array.from({ length: 27 }, (_, index) => ({
      id: `fake-${index}`,
      kind: "suited",
      rank: "A",
      suit: "spades",
      copy: 1,
    }));
    const response = await app.inject({ method: "POST", url: "/api/validate-hand", payload: { cards } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it("rejects forged full-shape cards for plans", async () => {
  await withApp(async (app) => {
    const cards = Array.from({ length: 27 }, (_, index) => ({
      id: `fake-${index}`,
      kind: "suited",
      rank: "A",
      suit: "spades",
      copy: 1,
    }));
    const response = await app.inject({ method: "POST", url: "/api/plans", payload: { rank: "10", cards } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it("rejects cards whose fields do not match their canonical id", async () => {
  await withApp(async (app) => {
    const cards = createDeck().slice(0, 27);
    const first = cards[0];
    const mismatched = { ...first, rank: first.kind === "suited" && first.rank === "A" ? "K" : "A" };
    const response = await app.inject({
      method: "POST",
      url: "/api/validate-hand",
      payload: { cards: [mismatched, ...cards.slice(1)] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors.length).toBeGreaterThan(0);
  });
});

it("returns 400 when validate-hand receives an invalid hand length", async () => {
  await withApp(async (app) => {
    const response = await app.inject({ method: "POST", url: "/api/validate-hand", payload: { cards: [] } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      valid: false,
      errors: ["Hand must contain exactly 27 cards."],
      warnings: [],
    });
  });
});

it("returns 400 when validate-hand receives duplicate cards", async () => {
  await withApp(async (app) => {
    const deal = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
    const hand = deal.json().hand;
    const cards = [hand[0], hand[0], ...hand.slice(2)];
    const response = await app.inject({ method: "POST", url: "/api/validate-hand", payload: { cards } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ valid: false, warnings: [] });
    expect(response.json().errors).toContain(`Duplicate physical card: ${hand[0].id}`);
  });
});
