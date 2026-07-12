import { createDeck } from "../../src/engine/cards";
import { canBeatPlay, classifyPlay } from "../../src/game/playRules";
import { createRoom } from "../../src/game/room";
import { legalCandidates } from "./candidates";
import { createBenchmarkObservation, toLegacyObservation, toProductionObservation } from "./observation";

it("does not change an observation when hidden opponent cards are swapped", () => {
  const firstRoom = createRoom({ rank: "10", seed: 42 });
  const secondRoom = structuredClone(firstRoom);
  [secondRoom.hands[1], secondRoom.hands[3]] = [secondRoom.hands[3], secondRoom.hands[1]];

  const first = createBenchmarkObservation(firstRoom, 0);
  const second = createBenchmarkObservation(secondRoom, 0);

  expect(second).toEqual(first);
  expect(second.ownHand).not.toBe(firstRoom.hands[0]);
  expect(second.ownHand[0]).not.toBe(firstRoom.hands[0][0]);
});

it("adapters expose only the public benchmark whitelist", () => {
  const observation = createBenchmarkObservation(createRoom({ rank: "10", seed: 42 }), 0);
  const production = toProductionObservation(observation);
  const legacy = toLegacyObservation(observation);
  const forbidden = ["partnerHand", "opponentHands", "hands", "initialHands", "deck", "seed"];

  for (const input of [production, legacy]) {
    for (const property of forbidden) {
      expect(input).not.toHaveProperty(property);
    }
  }
});

it("offers pass only while following and every play beats the public trick", () => {
  const deck = createDeck();
  const room = createRoom({ rank: "10", seed: 42 });
  room.hands[0] = [
    deck.find((card) => card.id === "S3-1")!,
    deck.find((card) => card.id === "S6-1")!,
    deck.find((card) => card.id === "C6-1")!,
  ];
  room.players[0]!.handCount = room.hands[0].length;
  room.currentTurn = 0;

  const lead = legalCandidates(createBenchmarkObservation(room, 0));
  expect(lead.some((action) => action.type === "pass")).toBe(false);
  expect(lead.every((action) => action.type === "play" && classifyPlay(action.cardIds.map(cardById), room.rank) !== undefined)).toBe(true);

  const lastPlay = classifyPlay([deck.find((card) => card.id === "S5-1")!], room.rank)!;
  room.trick = { leadSeat: 1, lastPlaySeat: 1, lastPlay, passSeats: [], plays: [{ seat: 1, action: "play", group: lastPlay }] };
  const follow = legalCandidates(createBenchmarkObservation(room, 0));

  expect(follow.some((action) => action.type === "pass")).toBe(true);
  expect(follow.every((action) => action.type === "pass" || canBeatPlay(classifyPlay(action.cardIds.map(cardById), room.rank)!, lastPlay, room.rank))).toBe(true);
});

function cardById(id: string) {
  const card = createDeck().find((candidate) => candidate.id === id);
  if (card === undefined) throw new Error(`Unknown card: ${id}`);
  return card;
}
