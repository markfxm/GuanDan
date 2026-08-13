import type { Card, GameRank } from "../../engine/cards";
import { detectGroups, type CardGroup, type GroupType } from "../../engine/groups";
import type { HandAnalysis } from "../contracts";

export function stableHandKey(hand: Card[]): string {
  return hand.map((card) => card.id).sort().join("|");
}

export function analyzeHand(hand: Card[], gameRank: GameRank): HandAnalysis {
  const groups = detectGroups(hand, gameRank).sort((left, right) => left.id.localeCompare(right.id));
  const groupsByType = new Map<GroupType, CardGroup[]>();
  const groupsByCardId = new Map<string, CardGroup[]>();
  for (const group of groups) {
    const typed = groupsByType.get(group.type) ?? [];
    typed.push(group);
    groupsByType.set(group.type, typed);
    for (const card of group.cards) {
      const cardGroups = groupsByCardId.get(card.id) ?? [];
      cardGroups.push(group);
      groupsByCardId.set(card.id, cardGroups);
    }
  }
  return {
    handKey: stableHandKey(hand),
    hand: [...hand],
    gameRank,
    groups,
    groupsByType,
    groupsByCardId,
    maximalBombs: maximalBombs(groups),
  };
}

function maximalBombs(groups: CardGroup[]): CardGroup[] {
  return groups.filter((group) =>
    group.type === "bomb" && !groups.some((candidate) =>
      candidate.type === "bomb" &&
      candidate.cards.length > group.cards.length &&
      group.cards.every((card) => candidate.cards.some((other) => other.id === card.id)),
    ),
  );
}
