import { createDeck, type Card } from "../../engine/cards";
import type { CanonicalInitialDeal } from "./contracts";

const CARD_FIELDS = ["id", "kind", "rank", "suit", "copy"] as const;

export function validateCanonicalInitialDeal(deal: CanonicalInitialDeal): void {
  const value = deal as unknown as Record<string, unknown>;
  if (value.schemaVersion !== "d2-particle-initial-deal-v1") throw new Error("INITIAL_DEAL_SCHEMA_INVALID");
  if (!isRecord(value.hands)) throw new Error("INITIAL_DEAL_HANDS_INVALID");

  const handKeys = Object.keys(value.hands).sort();
  if (handKeys.join(",") !== "0,1,2,3") throw new Error("INITIAL_DEAL_SEATS_INVALID");

  const canonicalById = new Map(createDeck().map((card) => [card.id, card]));
  const seenIds = new Set<string>();
  let cardCount = 0;

  for (const seat of ["0", "1", "2", "3"] as const) {
    const hand = value.hands[seat];
    if (!Array.isArray(hand)) throw new Error("INITIAL_DEAL_HAND_INVALID");
    cardCount += hand.length;
    for (const cardValue of hand) {
      if (!isRecord(cardValue) || typeof cardValue.id !== "string") throw new Error("INITIAL_DEAL_CARD_INVALID");
      if (seenIds.has(cardValue.id)) throw new Error("INITIAL_DEAL_DUPLICATE_CARD");
      seenIds.add(cardValue.id);
      const canonical = canonicalById.get(cardValue.id);
      if (!canonical || !matchesCanonicalCard(cardValue, canonical)) throw new Error("INITIAL_DEAL_CARD_PAYLOAD_INVALID");
    }
  }

  if (cardCount !== 108 || seenIds.size !== canonicalById.size) throw new Error("INITIAL_DEAL_CARD_COUNT_INVALID");
}

function matchesCanonicalCard(value: Record<string, unknown>, canonical: Card): boolean {
  const canonicalValue = canonical as unknown as Readonly<Record<string, unknown>>;
  return CARD_FIELDS.every((field) => value[field] === canonicalValue[field]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
