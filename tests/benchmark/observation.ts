import type { AiObservation } from "../../src/ai/contracts";
import type { AiDecisionInput } from "../../src/game/ai";
import type { Card, GameRank, Rank, Suit } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import type { RoomState, Seat, TrickPlay } from "../../src/game/room";
import type { BenchmarkObservation, GameAction, PublicTributeEvent } from "./contracts";

export type LegacyObservation = Pick<
  AiDecisionInput,
  "hand" | "gameRank" | "seat" | "partnerSeat" | "lastPlay" | "lastPlaySeat" | "context"
>;

export function createBenchmarkObservation(room: RoomState, seat: Seat): BenchmarkObservation {
  const publicHistory = room.playHistory.map((play, actionIndex) => toGameAction(play, actionIndex));
  const trickStartIndex = publicHistory.length - room.trick.plays.length;

  return {
    ownHand: room.hands[seat].map(copyCard),
    rank: room.rank,
    seat,
    currentSeat: room.currentTurn,
    leaderSeat: room.leaderSeat,
    publicHandCounts: Object.fromEntries(room.players.map((player) => [player.seat, player.handCount])) as Record<Seat, number>,
    publicTrick: room.trick.plays.map((play, actionIndex) => toGameAction(play, trickStartIndex + actionIndex)),
    publicHistory,
    finishOrder: [...room.finishOrder],
    partnerPassed: room.trick.passSeats.includes(partnerSeat(seat)),
    publicTributeEvents: publicTributeEvents(room),
    actionIndex: publicHistory.length,
  };
}

export function toProductionObservation(input: BenchmarkObservation): AiObservation {
  const lastAction = lastPlayAction(input.publicTrick);
  const lastPlay = lastAction?.action.type === "play" ? classifyPublicPlay(lastAction.action.cardIds, input.rank) : undefined;

  return {
    hand: input.ownHand.map(copyCard),
    gameRank: input.rank,
    seat: input.seat,
    partnerSeat: partnerSeat(input.seat),
    playedCards: input.publicHistory.flatMap(publicActionCards),
    handCounts: { ...input.publicHandCounts },
    lastPlay,
    lastPlaySeat: lastAction?.seat,
    finishOrder: [...input.finishOrder],
    partnerPassedCurrentTrick: input.partnerPassed,
  };
}

export function toLegacyObservation(input: BenchmarkObservation): LegacyObservation {
  const production = toProductionObservation(input);
  const partner = partnerSeat(input.seat);

  return {
    hand: production.hand,
    gameRank: production.gameRank,
    seat: production.seat,
    partnerSeat: production.partnerSeat,
    lastPlay: production.lastPlay,
    lastPlaySeat: production.lastPlaySeat,
    context: {
      ownHandCount: input.ownHand.length,
      partnerHandCount: input.publicHandCounts[partner],
      opponentHandCounts: ([0, 1, 2, 3] as Seat[])
        .filter((candidate) => candidate !== input.seat && candidate !== partner)
        .map((candidate) => input.publicHandCounts[candidate]),
      playedCards: production.playedCards,
      finishOrder: [...input.finishOrder],
      partnerPassedCurrentTrick: input.partnerPassed,
    },
  };
}

export function cardFromPublicId(id: string): Card {
  const suited = /^([SCHD])(A|K|Q|J|10|[2-9])-(1|2)$/.exec(id);
  if (suited !== null) {
    const suits: Record<string, Suit> = { S: "spades", C: "clubs", H: "hearts", D: "diamonds" };
    return { id, kind: "suited", suit: suits[suited[1]]!, rank: suited[2] as Rank, copy: Number(suited[3]) as 1 | 2 };
  }

  const joker = /^Joker-(SJ|BJ)-(1|2)$/.exec(id);
  if (joker !== null) {
    return { id, kind: "joker", rank: joker[1] as "SJ" | "BJ", copy: Number(joker[2]) as 1 | 2 };
  }

  throw new Error(`BENCHMARK_UNKNOWN_PUBLIC_CARD:${id}`);
}

function toGameAction(play: TrickPlay, actionIndex: number): GameAction {
  return play.action === "pass"
    ? { actionIndex, seat: play.seat, action: { type: "pass" } }
    : { actionIndex, seat: play.seat, action: { type: "play", cardIds: play.group!.cards.map((card) => card.id).sort() } };
}

function publicTributeEvents(room: RoomState): PublicTributeEvent[] {
  return (room.openingTribute?.exchanges ?? []).flatMap((exchange) => [
    { type: "tribute" as const, fromSeat: exchange.payer, toSeat: exchange.receiver },
    ...(exchange.returnCard === undefined ? [] : [{ type: "return" as const, fromSeat: exchange.receiver, toSeat: exchange.payer }]),
  ]);
}

function lastPlayAction(actions: GameAction[]): GameAction | undefined {
  return [...actions].reverse().find((action) => action.action.type === "play");
}

function classifyPublicPlay(cardIds: string[], rank: GameRank) {
  return classifyPlay(cardIds.map(cardFromPublicId), rank);
}

function publicActionCards(action: GameAction): Card[] {
  return action.action.type === "play" ? action.action.cardIds.map(cardFromPublicId) : [];
}

function copyCard(card: Card): Card {
  return { ...card };
}

function partnerSeat(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}
