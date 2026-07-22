import { describe, expect, it } from "vitest";
import { createLegacyBenchmarkRoom, playCards } from "../../src/game/room";

describe("D2a keep-current isolation", () => {
  it("does not create a ledger or change legacy action state", () => {
    const first = createLegacyBenchmarkRoom({ rank: "10", seed: 12 });
    const second = createLegacyBenchmarkRoom({ rank: "10", seed: 12 });
    const cardId = first.hands[first.currentTurn][0]!.id;
    playCards(first, first.currentTurn, [cardId]);
    playCards(second, second.currentTurn, [cardId]);
    expect(first.publicLedger).toBeUndefined();
    expect(second.publicLedger).toBeUndefined();
    expect({ hands: first.hands, trick: first.trick, finishOrder: first.finishOrder, playHistory: first.playHistory }).toEqual({ hands: second.hands, trick: second.trick, finishOrder: second.finishOrder, playHistory: second.playHistory });
  });
});
