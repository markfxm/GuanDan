import { buildApi } from "../../src/server/api";
import { createDeck } from "../../src/engine/cards";

async function withApp(run: (app: ReturnType<typeof buildApi>) => Promise<void>) {
  const app = buildApi();

  try {
    await run(app);
  } finally {
    await app.close();
  }
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

    const tribute = await app.inject({ method: "POST", url: `/api/rooms/${room.id}/tribute`, payload: {} });
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
      payload: { seat: 0, cardIds: [returnCard.id] },
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

    const played = await app.inject({ method: "POST", url: `/api/rooms/${room.id}/play`, payload: { seat: 0, cardIds: [cardId] } });
    expect(played.statusCode).toBe(200);
    expect(played.json().room.humanHand.map((card: { id: string }) => card.id)).not.toContain(cardId);
    expect(played.json().room.currentTurn).toBe(3);
    expect(played.json().room.trick.plays).toHaveLength(1);

    const ai = await app.inject({ method: "POST", url: `/api/rooms/${room.id}/ai-step`, payload: {} });
    expect(ai.statusCode).toBe(200);
    expect(ai.json().room.players).toHaveLength(4);
    expect(ai.json().room.trick.plays.length).toBeGreaterThanOrEqual(2);
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
