import { isHeartRankWild, type Card, type GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import type { BreakReason, PolicyContext, PolicyVerdict } from "../contracts";

const BLOCKING_TYPES = new Set<CardGroup["type"]>(["pair", "triple", "full-house", "straight", "consecutive-pairs", "plate", "straight-flush", "bomb", "joker-bomb"]);

export type PowerProtectionLevel = "HARD" | "CONDITIONAL" | "NONE";

export function protectedPowerGroups(allGroups: CardGroup[], gameRank: GameRank): CardGroup[] {
  const selected: CardGroup[] = [];
  for (const group of [...allGroups]
    .filter((candidate) => powerProtectionLevel(candidate, allGroups, gameRank) !== "NONE")
    .sort((left, right) =>
      protectionPriority(right, allGroups, gameRank) - protectionPriority(left, allGroups, gameRank) ||
      left.wildcards.length - right.wildcards.length ||
      right.cards.length - left.cards.length ||
      left.id.localeCompare(right.id),
    )) {
    if (!selected.some((existing) => overlaps(existing, group))) selected.push(group);
  }
  return selected;
}

export function powerProtectionLevel(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): PowerProtectionLevel {
  if (group.type === "straight-flush") return "HARD";
  if (group.type === "joker-bomb") return "CONDITIONAL";
  if (group.type !== "bomb" || group.cards.length < 4 || hasLargerBomb(group, allGroups)) return "NONE";
  return group.cards.length === 4 ? "HARD" : "CONDITIONAL";
}

export function isLegalBombReduction(sourceBomb: CardGroup, consumingGroup: CardGroup, allGroups: CardGroup[], gameRank: GameRank): boolean {
  if (!isNaturalBomb(sourceBomb, gameRank) || consumingGroup.type !== "straight") return false;
  const bombIds = new Set(sourceBomb.cards.map((card) => card.id));
  const consumed = consumingGroup.cards.filter((card) => bombIds.has(card.id));
  if (consumed.length === 0 || allGroups.some((group) => group.type === "straight-flush" && sameCards(group, consumingGroup))) return false;
  if (sourceBomb.cards.length >= 5) return consumed.length <= sourceBomb.cards.length - 4;
  if (sourceBomb.cards.length !== 4 || consumed.length !== 1) return false;
  const consumingId = identity(consumingGroup);
  return consumingGroup.cards.filter((card) => !bombIds.has(card.id)).length === 4 && consumingGroup.cards
    .filter((card) => !bombIds.has(card.id))
    .every((card) => card.kind === "suited" && !isHeartRankWild(card, gameRank) && !allGroups.some((group) =>
      BLOCKING_TYPES.has(group.type) && identity(group) !== consumingId && group.cards.some((candidate) => candidate.id === card.id),
    ));
}

export function evaluatePowerGroupUse(group: CardGroup, hand: Card[], allGroups: CardGroup[], gameRank: GameRank, context: PolicyContext = {}): PolicyVerdict {
  const protectedGroups = protectedPowerGroups(allGroups, gameRank);
  if (protectedGroups.some((power) => sameCards(group, power))) {
    return { allowed: true, hardViolation: false, reasonCodes: [] };
  }
  const touched = protectedGroups.filter((power) => overlaps(group, power) && !sameCards(group, power));
  if (touched.length === 0) return { allowed: true, hardViolation: false, reasonCodes: [] };
  const legalReduction = touched.every((power) => power.type === "bomb" && isLegalBombReduction(power, group, allGroups, gameRank));
  if (legalReduction) return { allowed: true, hardViolation: false, reasonCodes: ["LEGAL_BOMB_REDUCTION"] };
  const reason = context.reason;
  const mayBreak = reason === "IMMEDIATE_FINISH" && group.cards.length === hand.length ||
    reason === "DANGEROUS_OPPONENT_BLOCK" || reason === "ENDGAME_APPROVED" ||
    reason === "JOKER_BOMB_EXCEPTION" && touched.every((power) => power.type === "joker-bomb");
  return { allowed: mayBreak, hardViolation: !mayBreak, reasonCodes: mayBreak && reason !== undefined ? [reason] : [] };
}

export function measureProtectionLoss(handGroups: CardGroup[], finalGroups: CardGroup[], gameRank: GameRank): number {
  return protectedPowerGroups(handGroups, gameRank).filter((power) => {
    if (finalGroups.some((group) => sameCards(group, power))) return false;
    return !finalGroups.every((group) => evaluatePowerGroupUse(group, power.cards, handGroups, gameRank).allowed);
  }).length;
}

function protectionPriority(group: CardGroup, allGroups: CardGroup[], gameRank: GameRank): number {
  const level = powerProtectionLevel(group, allGroups, gameRank);
  return level === "HARD" ? 2 : level === "CONDITIONAL" ? 1 : 0;
}

function isNaturalBomb(group: CardGroup, gameRank: GameRank): boolean {
  const first = group.cards[0];
  return group.type === "bomb" && group.cards.length >= 4 && group.wildcards.length === 0 && first?.kind === "suited" && !isHeartRankWild(first, gameRank) && group.cards.every((card) => card.kind === "suited" && card.rank === first.rank && !isHeartRankWild(card, gameRank));
}
function hasLargerBomb(group: CardGroup, groups: CardGroup[]): boolean { return groups.some((candidate) => candidate.type === "bomb" && candidate.cards.length > group.cards.length && group.cards.every((card) => candidate.cards.some((other) => other.id === card.id))); }
function overlaps(left: CardGroup, right: CardGroup): boolean { return left.cards.some((card) => right.cards.some((other) => other.id === card.id)); }
function sameCards(left: CardGroup, right: CardGroup): boolean { return left.cards.length === right.cards.length && left.cards.every((card) => right.cards.some((other) => other.id === card.id)); }
function identity(group: CardGroup): string { return `${group.type}:${group.cards.map((card) => card.id).sort().join(",")}`; }
