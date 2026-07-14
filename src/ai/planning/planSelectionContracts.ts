import type { Card, GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import type { AiRuntimeState, HandPlan } from "../contracts";
import type { PlanSelectionMode, D1PlanSelectionState } from "../runtimeContracts";

export type PlanSelectionContext = Readonly<{
  mode?: PlanSelectionMode;
  seat: number;
  partnerSeat: number;
  gameRank: GameRank;
  hand: readonly Card[];
  handCount: number;
  playedCards: readonly Card[];
  handCounts: Readonly<Record<number, number>>;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  finishOrder: readonly number[];
  partnerPassedCurrentTrick?: boolean;
  candidatePlans: readonly HandPlan[];
  runtime: Readonly<AiRuntimeState>;
}>;

export type PlanScore = Readonly<{
  planId: string;
  total: number;
  staticPlanQuality: number;
}>;

export type PlanSelectionResult = Readonly<{
  reason:
    | "keep-current"
    | "strategic-switch"
    | "forced-switch"
    | "migration-required"
    | "replan-required"
    | "no-valid-plan"
    | "forced-missing"
    | "forced-incomplete"
    | "forced-policy"
    | "forced-illegal-group"
    | "forced-structural-invalid"
    | "cooldown-suppressed"
    | "hysteresis-suppressed"
    | "tie-kept-active";
  selectedPlanId?: string;
  state?: D1PlanSelectionState;
}>;
