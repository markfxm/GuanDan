import { detectGroups } from "../../src/engine/groups";
import { canBeatPlay, classifyPlay } from "../../src/game/playRules";
import type { StrategyAction, BenchmarkObservation } from "./contracts";
import { cardFromPublicId } from "./observation";

export function legalCandidates(input: BenchmarkObservation): StrategyAction[] {
  const lastPlay = publicLastPlay(input);
  const candidates = new Map<string, StrategyAction>();

  if (lastPlay !== undefined) {
    candidates.set("pass", { type: "pass" });
  }

  for (const detected of detectGroups(input.ownHand, input.rank)) {
    const cards = [...detected.cards].sort((left, right) => left.id.localeCompare(right.id));
    const group = classifyPlay(cards, input.rank);
    if (group === undefined || lastPlay !== undefined && !canBeatPlay(group, lastPlay, input.rank)) continue;
    const cardIds = cards.map((card) => card.id);
    candidates.set(`play:${cardIds.join(",")}`, { type: "play", cardIds });
  }

  return [...candidates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, action]) => action);
}

function publicLastPlay(input: BenchmarkObservation) {
  const action = [...input.publicTrick].reverse().find((candidate) => candidate.action.type === "play");
  return action === undefined || action.action.type === "pass"
    ? undefined
    : classifyPlay(action.action.cardIds.map(cardFromPublicId), input.rank);
}
