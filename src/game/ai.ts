import type { Card, GameRank } from "../engine/cards";
import type { CardGroup } from "../engine/groups";
import { playPower } from "./playRules";
import { decideAiAction } from "../ai/aiDecisionEngine";
import type { AiAction, AiObservation, AiRuntimeState } from "../ai/contracts";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../ai/config";
import { evaluateAiRole } from "../ai/tactics/roleEvaluator";

/** Compatibility input for callers that have not yet adopted AiObservation. */
export type AiDecisionInput = {
  hand: Card[];
  partnerHand?: Card[];
  plannedGroups?: CardGroup[];
  gameRank: GameRank;
  seat: number;
  partnerSeat: number;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  context?: AiTableContext;
  bombBreakContext?: unknown;
  analysis?: unknown;
  preferPlannedLead?: boolean;
};

export type AiRole = "attacker" | "support" | "balanced";
export type { AiAction } from "../ai/contracts";

export type LeadActionType = "SINGLE" | "PAIR" | "TRIPLE_WITH_PAIR" | "STRAIGHT" | "CONSECUTIVE_PAIRS" | "PLANE" | "BOMB" | "STRAIGHT_FLUSH";
export type LeadAction = { type: LeadActionType; group: CardGroup; cards: Card[]; mainRank: Card["rank"]; strength: number };
export type FollowActionType = "PASS" | "NORMAL_FOLLOW" | "HIGH_BLOCK" | "BOMB_FOLLOW";
export type FollowAction = { actionType: FollowActionType; type: CardGroup["type"] | "PASS"; group?: CardGroup; cards: Card[]; strength: number; beatsCurrent: boolean; isBomb: boolean };
export type CurrentTrick = { currentWinningAction?: { seat: number; group: CardGroup } };
export type AiTableContext = { ownHandCount: number; partnerHandCount: number; opponentHandCounts: number[]; playedCards: Card[]; finishOrder: number[]; partnerPassedCurrentTrick?: boolean };

export function classifyAiRole(hand: Card[], gameRank: GameRank): AiRole {
  return evaluateAiRole({ hand: [...hand], gameRank }).role;
}

/**
 * Thin legacy-name adapter. It exposes only the caller's own hand and public
 * table state to the unified engine; partnerHand and plannedGroups are ignored.
 */
export function chooseAiAction(input: AiDecisionInput): AiAction {
  return decideAiAction(toObservation(input), emptyRuntime(), {
    ...DEFAULT_AI_PERFORMANCE_CONFIG,
    turn: 0,
  }).action;
}

export function chooseLeadAction(input: AiDecisionInput): LeadAction | undefined {
  const action = chooseAiAction({ ...input, lastPlay: undefined, lastPlaySeat: undefined });
  return action.type === "play" ? toLeadAction(action.group, input.gameRank) : undefined;
}

export function chooseFollowAction(input: AiDecisionInput, currentTrick: CurrentTrick = {}): FollowAction {
  const currentWinningAction = currentTrick.currentWinningAction;
  const action = chooseAiAction({
    ...input,
    lastPlay: currentWinningAction?.group ?? input.lastPlay,
    lastPlaySeat: currentWinningAction?.seat ?? input.lastPlaySeat,
  });
  if (action.type === "pass") {
    return { actionType: "PASS", type: "PASS", cards: [], strength: 0, beatsCurrent: false, isBomb: false };
  }
  const isBomb = action.group.type === "bomb" || action.group.type === "straight-flush" || action.group.type === "joker-bomb";
  return {
    actionType: isBomb ? "BOMB_FOLLOW" : "NORMAL_FOLLOW",
    type: action.group.type,
    group: action.group,
    cards: action.group.cards,
    strength: playPower(action.group, input.gameRank),
    beatsCurrent: true,
    isBomb,
  };
}

function toObservation(input: AiDecisionInput): AiObservation {
  const context = input.context;
  const handCounts: Record<number, number> = {
    [input.seat]: context?.ownHandCount ?? input.hand.length,
    [input.partnerSeat]: context?.partnerHandCount ?? 0,
  };
  let opponentIndex = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (seat !== input.seat && seat !== input.partnerSeat) {
      handCounts[seat] = context?.opponentHandCounts[opponentIndex] ?? 0;
      opponentIndex += 1;
    }
  }
  return {
    hand: [...input.hand],
    gameRank: input.gameRank,
    seat: input.seat,
    partnerSeat: input.partnerSeat,
    lastPlay: input.lastPlay,
    lastPlaySeat: input.lastPlaySeat,
    playedCards: [...(context?.playedCards ?? [])],
    handCounts,
    finishOrder: [...(context?.finishOrder ?? [])],
    partnerPassedCurrentTrick: context?.partnerPassedCurrentTrick,
  };
}

function emptyRuntime(): AiRuntimeState {
  return { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true };
}

function toLeadAction(group: CardGroup, gameRank: GameRank): LeadAction {
  return {
    type: leadType(group),
    group,
    cards: group.cards,
    mainRank: group.cards[0]?.rank ?? "2",
    strength: playPower(group, gameRank),
  };
}

function leadType(group: CardGroup): LeadActionType {
  const types: Record<CardGroup["type"], LeadActionType> = {
    single: "SINGLE",
    pair: "PAIR",
    triple: "TRIPLE_WITH_PAIR",
    "full-house": "TRIPLE_WITH_PAIR",
    straight: "STRAIGHT",
    "consecutive-pairs": "CONSECUTIVE_PAIRS",
    plate: "PLANE",
    bomb: "BOMB",
    "straight-flush": "STRAIGHT_FLUSH",
    "joker-bomb": "BOMB",
  };
  return types[group.type];
}
