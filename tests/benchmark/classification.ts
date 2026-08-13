import { classifyPlay } from "../../src/game/playRules";
import { isHeartRankWild, type GameRank } from "../../src/engine/cards";
import { cardFromPublicId } from "./observation";
import type { PublicSimulationEvent, SimulationSummary } from "./simulator";
import type { GameMetrics } from "./metrics";
import type { GameSummary } from "./contracts";

export type ExploratoryTag =
  | "bomb-density"
  | "straight-potential"
  | "consecutive-pair-potential"
  | "dispersion"
  | "joker-concentration"
  | "wild-card-impact"
  | "plan-quality-gap"
  | "partner-imbalance"
  | "long-game"
  | "short-game";

export interface GameClassification {
  exploratory: true;
  tags: ExploratoryTag[];
  scores: Record<ExploratoryTag, number>;
  availability: Record<ExploratoryTag, { available: boolean; proxy: boolean; exploratory: true; reason: string }>;
  metadata: { exploratory: true; source: "public-post-game"; strategyObservationSafe: true };
  note: "post-game-only";
}

export function classifyGame(game: SimulationSummary | GameMetrics | GameSummary): GameClassification {
  const events = "publicEvents" in game && Array.isArray(game.publicEvents) ? game.publicEvents : [];
  const groups = groupsFor(events, game.rank);
  const plays = events.filter((event) => event.action.type === "play");
  const bombs = groups.filter((group) => group === "bomb" || group === "joker-bomb").length;
  const jokers = plays.reduce((sum, event) => sum + (event.action.type === "play" ? event.action.cardIds.filter((id) => id.startsWith("Joker-")).length : 0), 0);
  const wildcards = plays.reduce((sum, event) => {
    if (event.action.type !== "play") return sum;
    try {
      return sum + event.action.cardIds.map(cardFromPublicId).filter((card) => isHeartRankWild(card, game.rank)).length;
    } catch {
      return sum;
    }
  }, 0);
  const scores: Record<ExploratoryTag, number> = {
    "bomb-density": plays.length === 0 ? 0 : bombs / plays.length,
    "straight-potential": groups.filter((group) => group === "straight").length,
    "consecutive-pair-potential": groups.filter((group) => group === "consecutive-pairs").length,
    dispersion: finishDispersion(events),
    "joker-concentration": plays.length === 0 ? 0 : jokers / Math.max(1, plays.length),
    "wild-card-impact": plays.length === 0 ? 0 : wildcards / Math.max(1, plays.length),
    "plan-quality-gap": 0,
    "partner-imbalance": partnerImbalance(game.finishOrder),
    "long-game": events.length >= 120 ? 1 : 0,
    "short-game": events.length > 0 && events.length < 40 ? 1 : 0,
  };
  const tags = (Object.keys(scores) as ExploratoryTag[]).filter((tag) => {
    if (tag === "long-game" || tag === "short-game") return scores[tag] > 0;
    return scores[tag] > 0;
  });
  const unavailable = new Set<ExploratoryTag>(["plan-quality-gap"]);
  const availability = (Object.keys(scores) as ExploratoryTag[]).reduce((result, tag) => {
    result[tag] = {
      available: !unavailable.has(tag),
      proxy: !unavailable.has(tag),
      exploratory: true,
      reason: unavailable.has(tag) ? "No plan diagnostics are present in the public replay." : "Derived from public post-game events; not a strategy observation.",
    };
    return result;
  }, {} as GameClassification["availability"]);
  return {
    exploratory: true,
    tags,
    scores,
    availability,
    metadata: { exploratory: true, source: "public-post-game", strategyObservationSafe: true },
    note: "post-game-only",
  };
}

function groupsFor(events: PublicSimulationEvent[], rank: GameRank): string[] {
  return events.flatMap((event) => {
    if (event.action.type !== "play") return [];
    try {
      const group = classifyPlay(event.action.cardIds.map(cardFromPublicId), rank);
      return group === undefined ? [] : [group.type];
    } catch {
      return [];
    }
  });
}

function finishDispersion(events: PublicSimulationEvent[]): number {
  if (events.length === 0) return 0;
  const variances = events.map((event) => {
    const counts = [event.handCounts[0], event.handCounts[1], event.handCounts[2], event.handCounts[3]];
    const average = mean(counts);
    return mean(counts.map((count) => (count - average) ** 2));
  });
  return mean(variances);
}

function partnerImbalance(finishOrder: SimulationSummary["finishOrder"]): number {
  if (finishOrder.length !== 4) return 0;
  const team0 = finishOrder.filter((seat) => seat % 2 === 0).map((seat) => finishOrder.indexOf(seat) + 1);
  const team1 = finishOrder.filter((seat) => seat % 2 === 1).map((seat) => finishOrder.indexOf(seat) + 1);
  return Math.abs(mean(team0) - mean(team1));
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
