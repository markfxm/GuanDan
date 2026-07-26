import type { Card, GameRank } from "../engine/cards";
import type { CardGroup, GroupType } from "../engine/groups";
import type { AiPlanningDiagnostics } from "./diagnostics/aiPlanningDiagnostics";
import type { D1PlanSelectionState } from "./runtimeContracts";

export type AiAction = { type: "pass" } | { type: "play"; group: CardGroup };

export type AiObservation = {
  hand: Card[];
  gameRank: GameRank;
  seat: number;
  partnerSeat: number;
  playedCards: Card[];
  handCounts: Record<number, number>;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  finishOrder: number[];
  partnerPassedCurrentTrick?: boolean;
};

export type PolicyContext = {
  reason?: BreakReason;
  allowRelaxable?: boolean;
};

export type BreakReason =
  | "IMMEDIATE_FINISH"
  | "DANGEROUS_OPPONENT_BLOCK"
  | "ENDGAME_APPROVED"
  | "LEGAL_BOMB_REDUCTION"
  | "JOKER_BOMB_EXCEPTION";

export type PolicyVerdict = {
  allowed: boolean;
  hardViolation: boolean;
  reasonCodes: BreakReason[];
};

export type HandAnalysis = {
  handKey: string;
  hand: Card[];
  gameRank: GameRank;
  groups: CardGroup[];
  groupsByType: ReadonlyMap<GroupType, CardGroup[]>;
  groupsByCardId: ReadonlyMap<string, CardGroup[]>;
  maximalBombs: CardGroup[];
};

export type PlanMetrics = {
  hardViolations: number;
  protectionLoss: number;
  estimatedTurns: number;
  lowSingleCount: number;
  retainedControl: number;
  wildcardFlexibility: number;
  responseCoverage: number;
  leadFlexibility: number;
  fallbackScore: number;
};

export type HandPlan = {
  id: string;
  groups: CardGroup[];
  metrics: PlanMetrics;
};

export type ActionScore = {
  total: number;
  components: Readonly<Record<string, number>>;
  reasonCodes?: string[];
};

export type ActionCandidate = {
  action: AiAction;
  source: "PLAN" | "HAND_ANALYSIS" | "FALLBACK";
  policyVerdict: PolicyVerdict;
  alignedPlanIds: string[];
  stableKey: string;
  reasonCodes: string[];
};

export type PlanningBudget = {
  maxPlans: number;
  beamWidth: number;
  timeBudgetMs: number;
};

export type AiPerformanceConfig = {
  analysisCacheSize: number;
  planning: PlanningBudget;
  version: string;
};

export type RepresentativeActionShadowMode =
  | "disabled"
  | "shadow";

export type RepresentativeActionShadowConfig = Readonly<{
  mode: RepresentativeActionShadowMode;
  hardCap: number;
}>;

export type AiRuntimeState = {
  handKey?: string;
  activePlanId?: string;
  candidatePlans: HandPlan[];
  generatedTurn: number;
  configVersion: string;
  needsReplan: boolean;
  planSelectionState?: D1PlanSelectionState;
};

export type AiDecision = {
  action: AiAction;
  runtime: AiRuntimeState;
  selectedPlan?: HandPlan;
  selectedPlanId?: string;
  score: ActionScore;
  scoreBreakdown?: ActionScore;
  candidateCount: number;
  consideredActions?: number;
  elapsedMs: number;
  reasonCodes: BreakReason[];
};

export type AiDecisionConfig = AiPerformanceConfig & {
  turn: number;
  diagnostics?: AiPlanningDiagnostics;
  representativeActionShadow?: RepresentativeActionShadowConfig;
};
