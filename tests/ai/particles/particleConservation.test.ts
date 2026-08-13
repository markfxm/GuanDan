import { describe, expect, test } from "vitest";
import { createDeck, type Card } from "../../../src/engine/cards";
import type { CanonicalInitialDeal } from "../../../src/ai/particles/contracts";
import { validateCanonicalInitialDeal } from "../../../src/ai/particles/particleConservation";

function makeDeal(cards: readonly Card[] = createDeck()): CanonicalInitialDeal {
  return {
    schemaVersion: "d2-particle-initial-deal-v1",
    hands: {
      0: cards.slice(0, 27),
      1: cards.slice(27, 54),
      2: cards.slice(54, 81),
      3: cards.slice(81, 108),
    },
  };
}

function replaceCard(deal: CanonicalInitialDeal, cardId: string, replacement: Card): CanonicalInitialDeal {
  const hands = {
    0: [...deal.hands[0]],
    1: [...deal.hands[1]],
    2: [...deal.hands[2]],
    3: [...deal.hands[3]],
  };
  for (const seat of [0, 1, 2, 3] as const) {
    const index = hands[seat].findIndex((card) => card.id === cardId);
    if (index !== -1) {
      hands[seat][index] = replacement;
      return { schemaVersion: deal.schemaVersion, hands };
    }
  }
  throw new Error("CARD_NOT_FOUND_IN_FIXTURE");
}

describe("D2e-P Task 2 canonical deal conservation", () => {
  test("accepts exactly one complete 108-card canonical deal", () => {
    const deal = makeDeal();
    const cards = Object.values(deal.hands).flat();

    expect(cards).toHaveLength(108);
    expect(new Set(cards.map((card) => card.id)).size).toBe(108);
    expect(() => validateCanonicalInitialDeal(deal)).not.toThrow();
  });

  test("rejects missing card, duplicate card and invalid card payload", () => {
    const deal = makeDeal();
    const missingHands = {
      0: [...deal.hands[0]],
      1: [...deal.hands[1]],
      2: [...deal.hands[2]],
      3: deal.hands[3].slice(0, 26),
    };
    const missingCardDeal: CanonicalInitialDeal = { schemaVersion: deal.schemaVersion, hands: missingHands };
    expect(() => validateCanonicalInitialDeal(missingCardDeal)).toThrow();

    const duplicateCardDeal = replaceCard(deal, deal.hands[3][26].id, deal.hands[0][0]);
    expect(() => validateCanonicalInitialDeal(duplicateCardDeal)).toThrow();

    const firstCard = deal.hands[0][0];
    if (firstCard.kind !== "suited") throw new Error("FIXTURE_CARD_KIND_UNEXPECTED");
    const invalidPayload: Card = {
      ...firstCard,
      rank: firstCard.rank === "A" ? "K" : "A",
    };
    const invalidPayloadDeal = replaceCard(deal, firstCard.id, invalidPayload);
    expect(() => validateCanonicalInitialDeal(invalidPayloadDeal)).toThrow();
  });

  test("distinguishes both copies of every suited card and both joker copies", () => {
    const deal = makeDeal();
    const deck = createDeck();
    const copiesByIdentity = new Map<string, Card[]>();
    for (const card of deck) {
      const identity = card.kind === "suited" ? `${card.kind}:${card.rank}:${card.suit}` : `${card.kind}:${card.rank}`;
      copiesByIdentity.set(identity, [...(copiesByIdentity.get(identity) ?? []), card]);
    }

    expect([...copiesByIdentity.values()].every((cards) => cards.length === 2 && new Set(cards.map((card) => card.copy)).size === 2)).toBe(true);
    expect(() => validateCanonicalInitialDeal(deal)).not.toThrow();

    const suitedCopy = deck.find((card) => card.kind === "suited" && card.copy === 2);
    if (!suitedCopy) throw new Error("SUITED_COPY_NOT_FOUND");
    const duplicateSuitedCopy = replaceCard(deal, suitedCopy.id, { ...suitedCopy, copy: 1 });
    expect(() => validateCanonicalInitialDeal(duplicateSuitedCopy)).toThrow();

    const jokerCopy = deck.find((card) => card.kind === "joker" && card.copy === 2);
    if (!jokerCopy) throw new Error("JOKER_COPY_NOT_FOUND");
    const duplicateJokerCopy = replaceCard(deal, jokerCopy.id, { ...jokerCopy, copy: 1 });
    expect(() => validateCanonicalInitialDeal(duplicateJokerCopy)).toThrow();
  });
});
