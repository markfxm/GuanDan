import { createDeck } from "../../src/engine/cards";
import { dealHand, validateHand } from "../../src/engine/validation";

it("deals 27 unique physical cards", () => {
  const hand = dealHand("10", 123);
  expect(hand).toHaveLength(27);
  expect(new Set(hand.map((card) => card.id)).size).toBe(27);
});

it("accepts a valid 27 card hand", () => {
  const hand = createDeck().slice(0, 27);
  expect(validateHand(hand).valid).toBe(true);
});

it("rejects duplicate physical card ids", () => {
  const deck = createDeck();
  const hand = [deck[0], deck[0], ...deck.slice(1, 26)];
  expect(validateHand(hand).errors).toContain(`Duplicate physical card: ${deck[0].id}`);
});

it("rejects hands that are not 27 cards", () => {
  expect(validateHand(createDeck().slice(0, 26)).errors).toContain("Hand must contain exactly 27 cards.");
});
