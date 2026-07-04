import type { Card } from "../../src/engine/cards";
import {
  addCardToManualGroup,
  classifyManualGroups,
  createManualGroup,
  removeMissingCardsFromManualGroups,
  ungroupedCards,
  type ManualCardGroup,
} from "../../src/ui/manualGrouping";

const S2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
const C2: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
const S3: Card = { id: "S3-1", kind: "suited", rank: "3", suit: "spades", copy: 1 };
const C3: Card = { id: "C3-1", kind: "suited", rank: "3", suit: "clubs", copy: 1 };
const S4: Card = { id: "S4-1", kind: "suited", rank: "4", suit: "spades", copy: 1 };
const C4: Card = { id: "C4-1", kind: "suited", rank: "4", suit: "clubs", copy: 1 };
const D5: Card = { id: "D5-1", kind: "suited", rank: "5", suit: "diamonds", copy: 1 };
const SJ1: Card = { id: "Joker-SJ-1", kind: "joker", rank: "SJ", copy: 1 };
const SJ2: Card = { id: "Joker-SJ-2", kind: "joker", rank: "SJ", copy: 2 };

it("moves a card into one manual group and removes it from ungrouped cards", () => {
  const hand = [S2, C2, D5];
  const first = createManualGroup(S2, "manual-1");
  const groups = addCardToManualGroup([first], first.id, C2);

  expect(groups[0].cardIds).toEqual(["S2-1", "C2-1"]);
  expect(ungroupedCards(hand, groups).map((card) => card.id)).toEqual(["D5-1"]);
});

it("classifies a vertical consecutive pair group as wood plate", () => {
  const hand = [S2, C2, S3, C3, S4, C4];
  const group: ManualCardGroup = { id: "manual-1", cardIds: hand.map((card) => card.id) };

  const [classified] = classifyManualGroups([group], hand, "10");

  expect(classified.label).toBe("木板");
  expect(classified.legalGroup?.type).toBe("consecutive-pairs");
});

it("classifies two small jokers in a manual group as a pair", () => {
  const hand = [SJ1, SJ2];
  const group: ManualCardGroup = { id: "manual-1", cardIds: hand.map((card) => card.id) };

  const [classified] = classifyManualGroups([group], hand, "10");

  expect(classified.legalGroup?.type).toBe("pair");
});

it("removes cards that no longer exist in the human hand and drops empty groups", () => {
  const groups: ManualCardGroup[] = [
    { id: "manual-1", cardIds: ["S2-1", "C2-1"] },
    { id: "manual-2", cardIds: ["D5-1"] },
  ];

  expect(removeMissingCardsFromManualGroups(groups, [D5])).toEqual([{ id: "manual-2", cardIds: ["D5-1"] }]);
});
