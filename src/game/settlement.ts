import { type Card, type GameRank } from "../engine/cards";
import type { Seat } from "./room";

export type RoundOutcome = "double-down" | "single-down" | "single-win";

export type TributeItem = {
  payer: Seat;
  receiver: Seat;
};

export type TributeExchange = TributeItem & {
  tributeCard: Card;
  returnCard?: Card;
};

export type TributeState = {
  status: "none" | "pending" | "anti-tribute" | "completed";
  items: TributeItem[];
  exchanges?: TributeExchange[];
  phase?: "tribute" | "return" | "done";
  activeItemIndex?: number;
  activeSeat?: Seat;
  activeCard?: Card;
  reason?: string;
};

export type RoundSettlement = {
  winningTeam: 0 | 1;
  outcome: RoundOutcome;
  levelStep: number;
  currentRank: GameRank;
  nextRank: GameRank;
  tribute: TributeState;
};

type JokerHoldings = Partial<Record<Seat, string[]>>;

const LEVEL_ORDER: GameRank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function settleRound(finishOrder: Seat[], currentRank: GameRank, jokerHoldings: JokerHoldings = {}): RoundSettlement {
  if (finishOrder.length !== 4) {
    throw new Error("Settlement requires four finished seats.");
  }

  const firstSeat = finishOrder[0];
  const winningTeam = teamOf(firstSeat);
  const winnerPartner = partnerSeat(firstSeat);
  const partnerPlace = finishOrder.indexOf(winnerPartner) + 1;
  const outcome = outcomeForPartnerPlace(partnerPlace);
  const levelStep = levelStepForOutcome(outcome);
  const tributeItems = tributeItemsForOutcome(outcome, finishOrder);
  void jokerHoldings;

  return {
    winningTeam,
    outcome,
    levelStep,
    currentRank,
    nextRank: advanceRank(currentRank, levelStep),
    tribute: {
      status: tributeItems.length === 0 ? "none" : "pending",
      items: tributeItems,
    },
  };
}

export function advanceRank(currentRank: GameRank, step: number): GameRank {
  const start = LEVEL_ORDER.indexOf(currentRank);
  if (start === -1) {
    throw new Error(`Unknown rank: ${currentRank}`);
  }

  return LEVEL_ORDER[(start + step) % LEVEL_ORDER.length];
}

function outcomeForPartnerPlace(partnerPlace: number): RoundOutcome {
  if (partnerPlace === 2) {
    return "double-down";
  }

  if (partnerPlace === 3) {
    return "single-down";
  }

  return "single-win";
}

function levelStepForOutcome(outcome: RoundOutcome): number {
  if (outcome === "double-down") {
    return 3;
  }

  if (outcome === "single-down") {
    return 2;
  }

  return 1;
}

function tributeItemsForOutcome(outcome: RoundOutcome, finishOrder: Seat[]): TributeItem[] {
  const first = finishOrder[0];
  const second = finishOrder[1];
  const third = finishOrder[2];
  const last = finishOrder[3];

  if (outcome === "double-down") {
    return [
      { payer: third, receiver: first },
      { payer: last, receiver: second },
    ];
  }

  return [{ payer: last, receiver: first }];
}

function teamOf(seat: Seat): 0 | 1 {
  return seat % 2 === 0 ? 0 : 1;
}

function partnerSeat(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}
