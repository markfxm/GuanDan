import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import type { AiDecisionConfig, AiObservation, AiRuntimeState } from "../../src/ai/contracts";

export type AiDecisionScenario = {
  id: string;
  description: string;
  observation: AiObservation;
  runtime: AiRuntimeState;
  config: AiDecisionConfig;
  expectedProperties: { leadOrFollow: "LEAD" | "FOLLOW"; mayPass: boolean; immediateFinish?: boolean; opponentImmediateThreat?: boolean; partnerCurrentlyWinning?: boolean };
};

const deck = createDeck();
const card = (id: string): Card => deck.find((candidate) => candidate.id === id)!;
const cards = (...ids: string[]): Card[] => ids.map(card);
const config: AiDecisionConfig = { analysisCacheSize: 64, planning: { maxPlans: 2, beamWidth: 1, timeBudgetMs: 0 }, version: "shadow-v1", turn: 1 };
const runtime = (): AiRuntimeState => ({ candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true });
type ScenarioOverrides = Partial<AiObservation> & { immediateFinish?: boolean; opponentImmediateThreat?: boolean; partnerCurrentlyWinning?: boolean };
const lead = (id: string, hand: Card[], overrides: ScenarioOverrides = {}): AiDecisionScenario => { const { immediateFinish, opponentImmediateThreat, partnerCurrentlyWinning, ...observation } = overrides; return { id, description: id, observation: { hand, gameRank: "10", seat: 1, partnerSeat: 3, playedCards: [], handCounts: { 0: 8, 1: hand.length, 2: 8, 3: 8 }, finishOrder: [], ...observation }, runtime: runtime(), config, expectedProperties: { leadOrFollow: "LEAD", mayPass: false, immediateFinish, opponentImmediateThreat, partnerCurrentlyWinning } }; };
const follow = (id: string, hand: Card[], lastId: string, lastRank: GameRank = "10", overrides: ScenarioOverrides = {}): AiDecisionScenario => { const { immediateFinish, opponentImmediateThreat, partnerCurrentlyWinning, ...observation } = overrides; return { id, description: id, observation: { hand, gameRank: "10", seat: 1, partnerSeat: 3, playedCards: [], handCounts: { 0: 8, 1: hand.length, 2: 8, 3: 8 }, finishOrder: [], lastPlay: classifyPlay([card(lastId)], lastRank)!, lastPlaySeat: 0, ...observation }, runtime: runtime(), config, expectedProperties: { leadOrFollow: "FOLLOW", mayPass: true, immediateFinish, opponentImmediateThreat, partnerCurrentlyWinning } }; };

export const aiDecisionScenarios: AiDecisionScenario[] = [
  lead("lead-single", cards("S3-1", "C5-1", "H7-1", "D9-1")),
  lead("lead-pair", cards("S3-1", "C3-1", "H5-1", "D7-1")),
  lead("lead-triple", cards("S3-1", "C3-1", "H3-1", "D7-1")),
  lead("lead-straight", cards("S3-1", "C4-1", "H5-1", "D6-1", "S7-1", "C9-1")),
  lead("lead-consecutive-pairs", cards("S3-1", "C3-1", "H4-1", "D4-1", "S5-1", "C5-1")),
  lead("lead-stable-many", cards("S3-1", "C3-1", "H5-1", "D5-1", "S7-1", "C9-1")),
  follow("follow-normal", cards("S6-1", "C7-1", "H8-1"), "S5-2"),
  follow("follow-pass-only", cards("S3-1", "C4-1", "H5-1"), "SJ-2"),
  follow("follow-many", cards("S6-1", "C7-1", "H8-1", "D9-1"), "S5-2"),
  follow("follow-bomb-option", cards("S6-1", "C6-1", "H6-1", "D6-1", "S7-1"), "S5-2"),
  follow("follow-bomb-current", cards("S6-1", "C6-1", "H6-1", "D6-1", "S7-1"), "SJ-2"),
  follow("partner-controls", cards("S6-1", "C7-1", "H8-1"), "S5-2", "10", { lastPlaySeat: 3, partnerCurrentlyWinning: true }),
  follow("partner-controls-threat", cards("S6-1", "C7-1", "H8-1"), "S5-2", "10", { lastPlaySeat: 3, handCounts: { 0: 1, 1: 3, 2: 8, 3: 8 }, partnerCurrentlyWinning: true }),
  follow("partner-low-hand", cards("S6-1", "C7-1", "H8-1"), "S5-2", "10", { lastPlaySeat: 3, handCounts: { 0: 8, 1: 3, 2: 8, 3: 2 }, partnerCurrentlyWinning: true }),
  follow("opponent-one-block", cards("S6-1", "C7-1", "H8-1"), "S5-2", "10", { handCounts: { 0: 1, 1: 3, 2: 8, 3: 8 }, opponentImmediateThreat: true }),
  follow("opponent-one-no-block", cards("S3-1", "C4-1", "H5-1"), "SJ-2", "10", { handCounts: { 0: 1, 1: 3, 2: 8, 3: 8 }, opponentImmediateThreat: true }),
  follow("opponent-two", cards("S6-1", "C7-1", "H8-1"), "S5-2", "10", { handCounts: { 0: 2, 1: 3, 2: 8, 3: 8 } }),
  lead("immediate-finish", cards("S3-1", "C3-1"), { immediateFinish: true }),
  lead("hard-four-bomb", cards("S4-1", "C4-1", "H4-1", "D4-1", "S7-1")),
  lead("five-bomb-reduction", cards("S3-1", "S4-1", "C4-1", "H4-1", "D4-1", "S4-2", "C5-1", "H6-1", "D7-1")),
  lead("five-bomb-no-reduction", cards("S4-1", "C4-1", "H4-1", "D4-1", "S4-2", "C9-1")),
  lead("straight-flush-protection", cards("S7-1", "S8-1", "S9-1", "S10-1", "SJ-1", "C3-1")),
  lead("joker-bomb-protection", cards("Joker-SJ-1", "Joker-BJ-1", "S3-1", "C5-1")),
  follow("emergency-power", cards("S6-1", "C6-1", "H6-1", "D6-1", "S7-1"), "SJ-2", "10", { handCounts: { 0: 1, 1: 5, 2: 8, 3: 8 }, opponentImmediateThreat: true }),
];

const pollutedHand = cards("S3-1", "C5-1", "H7-1", "D9-1");
const foreignSingle = classifyPlay([card("S2-1")], "10")!;
const pollutedRuntime: AiRuntimeState = { handKey: pollutedHand.map((item) => item.id).sort().join("|"), activePlanId: "polluted", candidatePlans: [{ id: "polluted", groups: [foreignSingle], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 0, fallbackScore: 0 } }], generatedTurn: 0, configVersion: "shadow-v1", needsReplan: false };
aiDecisionScenarios.push(
  { ...lead("runtime-polluted-active-plan", pollutedHand), runtime: pollutedRuntime },
  { ...lead("runtime-hand-key-changed", cards("S4-1", "C6-1", "H8-1", "D9-1")), runtime: { ...pollutedRuntime, handKey: "obsolete-hand-key" } },
  { ...lead("runtime-budget-fallback", cards("S3-1", "C3-1", "H4-1", "D4-1", "S5-1", "C5-1", "H6-1", "D6-1", "S7-1", "C7-1")), config: { ...config, planning: { maxPlans: 2, beamWidth: 16, timeBudgetMs: 1 } } },
);
