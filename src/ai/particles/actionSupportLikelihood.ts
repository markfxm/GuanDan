import { detectGroups, type CardGroup } from "../../engine/groups";
import { canBeatPlay, classifyPlay } from "../../game/playRules";
import type { Card, GameRank } from "../../engine/cards";
import type { ParticleActionObservation, ParticleLikelihoodConfig } from "./contracts";

export type ActionSupportLikelihoodResult =
  | Readonly<{
      ok: true;
      logLikelihood: number;
      support: "supported" | "impossible";
      factor: "forced-pass" | "could-beat-but-passed" | "lead-play" | "follow-play" | "impossible";
    }>
  | Readonly<{ ok: false; reason: "action-support-unavailable" }>;

export function evaluateActionSupportLikelihood(input: Readonly<{
  observation: ParticleActionObservation;
  gameRank: GameRank;
  config: ParticleLikelihoodConfig;
}>): ActionSupportLikelihoodResult {
  validateInput(input);
  const event = input.observation.event;
  const state = input.observation.stateBeforeEvent;
  const hand = state.hands[event.seat];

  try {
    if (event.kind === "play") return evaluatePlay(event, hand, state.currentLastPlay, input.gameRank, input.config);
    return evaluatePass(hand, state.currentLastPlay, input.gameRank, input.config);
  } catch (error) {
    if (error instanceof TypeError) throw error;
    return { ok: false, reason: "action-support-unavailable" };
  }
}

function validateInput(input: Readonly<{
  observation: ParticleActionObservation;
  gameRank: GameRank;
  config: ParticleLikelihoodConfig;
}>): void {
  if (!isRecord(input) || !isRecord(input.observation) || !isRecord(input.observation.event) || !isRecord(input.observation.stateBeforeEvent)) throw new TypeError("ACTION_SUPPORT_INPUT_INVALID");
  if (input.observation.event.kind !== "play" && input.observation.event.kind !== "pass") throw new TypeError("ACTION_SUPPORT_EVENT_INVALID");
  if (!isSeat(input.observation.event.seat)) throw new TypeError("ACTION_SUPPORT_SEAT_INVALID");
  const hands = input.observation.stateBeforeEvent.hands;
  if (!isRecord(hands) || !Array.isArray(hands[0]) || !Array.isArray(hands[1]) || !Array.isArray(hands[2]) || !Array.isArray(hands[3])) throw new TypeError("ACTION_SUPPORT_HANDS_INVALID");
  if (typeof input.gameRank !== "string" || input.gameRank.length === 0) throw new TypeError("ACTION_SUPPORT_GAME_RANK_INVALID");
  validateConfig(input.config);
  validateGameRank(input.gameRank, hands[input.observation.event.seat]);
}

function validateConfig(config: ParticleLikelihoodConfig): void {
  if (!isRecord(config) || config.schemaVersion !== "d2-particle-likelihood-v1") throw new TypeError("ACTION_SUPPORT_CONFIG_INVALID");
  const factors = [config.forcedPassLogFactor, config.couldBeatButPassedLogFactor, config.observedLeadPlayLogFactor, config.observedFollowPlayLogFactor];
  if (factors.some((value) => !Number.isFinite(value) || value > 0)) throw new TypeError("ACTION_SUPPORT_FACTOR_INVALID");
  if (!Number.isFinite(config.degradedEssThreshold) || config.degradedEssThreshold < 1) throw new TypeError("ACTION_SUPPORT_THRESHOLD_INVALID");
  if (!isTolerance(config.normalizationTolerance) || !isTolerance(config.essTolerance)) throw new TypeError("ACTION_SUPPORT_TOLERANCE_INVALID");
}

function validateGameRank(gameRank: GameRank, hand: readonly Card[]): void {
  try {
    if (hand.length > 0) classifyPlay([...hand.slice(0, 1)], gameRank);
  } catch {
    throw new TypeError("ACTION_SUPPORT_GAME_RANK_INVALID");
  }
}

function evaluatePlay(
  event: Extract<ParticleActionObservation["event"], { kind: "play" }>,
  hand: readonly Card[],
  lastPlay: CardGroup | undefined,
  gameRank: GameRank,
  config: ParticleLikelihoodConfig,
): ActionSupportLikelihoodResult {
  if (!Array.isArray(event.publicCardIds) || event.publicCardIds.length === 0 || typeof event.patternType !== "string" || typeof event.groupType !== "string") throw new TypeError("ACTION_SUPPORT_PLAY_EVENT_INVALID");
  const playedCards = event.publicCardIds.map((cardId) => hand.find((card) => card.id === cardId));
  if (playedCards.some((card) => card === undefined)) return impossibleSupport();
  const group = classifyPlay(playedCards as Card[], gameRank);
  if (!group) return impossibleSupport();
  if (group.type !== event.patternType || group.type !== event.groupType || !sameCardIds(group.cards, event.publicCardIds)) return unavailableSupport();
  if (lastPlay === undefined) return finiteSupport(config.observedLeadPlayLogFactor, "lead-play");
  if (!canBeatPlay(group, lastPlay, gameRank)) return impossibleSupport();
  return finiteSupport(config.observedFollowPlayLogFactor, "follow-play");
}

function evaluatePass(
  hand: readonly Card[],
  lastPlay: CardGroup | undefined,
  gameRank: GameRank,
  config: ParticleLikelihoodConfig,
): ActionSupportLikelihoodResult {
  if (lastPlay === undefined) throw new TypeError("ACTION_SUPPORT_LEAD_PASS_INVALID");
  const groups = detectGroups([...hand], gameRank);
  const canRespond = groups.some((group) => canBeatPlay(group, lastPlay, gameRank));
  return canRespond
    ? finiteSupport(config.couldBeatButPassedLogFactor, "could-beat-but-passed")
    : finiteSupport(config.forcedPassLogFactor, "forced-pass");
}

function finiteSupport(
  logLikelihood: number,
  factor: "forced-pass" | "could-beat-but-passed" | "lead-play" | "follow-play",
): ActionSupportLikelihoodResult {
  return { ok: true, logLikelihood, support: "supported", factor };
}

function impossibleSupport(): ActionSupportLikelihoodResult {
  return { ok: true, logLikelihood: Number.NEGATIVE_INFINITY, support: "impossible", factor: "impossible" };
}

function unavailableSupport(): ActionSupportLikelihoodResult {
  return { ok: false, reason: "action-support-unavailable" };
}

function sameCardIds(cards: readonly Card[], ids: readonly string[]): boolean {
  return cards.map((card) => card.id).sort().join(",") === [...ids].sort().join(",");
}

function isTolerance(value: number): boolean {
  return Number.isFinite(value) && value >= 1e-12 && value <= 1e-6;
}

function isSeat(value: number): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isRecord(value: unknown): value is Record<string | number, unknown> {
  return typeof value === "object" && value !== null;
}
