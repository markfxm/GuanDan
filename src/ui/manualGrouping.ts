import type { Card, GameRank, Suit } from "../engine/cards";
import type { CardGroup } from "../engine/groups";
import { classifyPlay } from "../game/playRules";

export type ManualCardGroup = {
  id: string;
  cardIds: string[];
};

export type ClassifiedManualGroup = ManualCardGroup & {
  cards: Card[];
  label: string;
  legalGroup?: CardGroup;
};

const TYPE_LABELS: Record<CardGroup["type"], string> = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  "full-house": "夯",
  straight: "顺子",
  "consecutive-pairs": "木板",
  plate: "钢板",
  bomb: "炸弹",
  "straight-flush": "同花顺",
  "joker-bomb": "王炸",
};

const SUIT_LABELS: Record<Suit, string> = {
  spades: "黑桃",
  clubs: "梅花",
  hearts: "红桃",
  diamonds: "方片",
};

export function createManualGroup(card: Card, id = `manual-${Date.now()}-${card.id}`): ManualCardGroup {
  return { id, cardIds: [card.id] };
}

export function addCardToManualGroup(groups: ManualCardGroup[], groupId: string, card: Card): ManualCardGroup[] {
  const withoutCard = removeCardFromManualGroups(groups, card.id);

  if (!withoutCard.some((group) => group.id === groupId)) {
    return [...withoutCard, { id: groupId, cardIds: [card.id] }];
  }

  return withoutCard.map((group) => (group.id === groupId ? { ...group, cardIds: [...group.cardIds, card.id] } : group));
}

export function removeCardFromManualGroups(groups: ManualCardGroup[], cardId: string): ManualCardGroup[] {
  return groups
    .map((group) => ({ ...group, cardIds: group.cardIds.filter((id) => id !== cardId) }))
    .filter((group) => group.cardIds.length > 0);
}

export function removeMissingCardsFromManualGroups(groups: ManualCardGroup[], hand: Card[]): ManualCardGroup[] {
  const handIds = new Set(hand.map((card) => card.id));
  return groups
    .map((group) => ({ ...group, cardIds: group.cardIds.filter((cardId) => handIds.has(cardId)) }))
    .filter((group) => group.cardIds.length > 0);
}

export function ungroupedCards(hand: Card[], groups: ManualCardGroup[]): Card[] {
  const groupedIds = new Set(groups.flatMap((group) => group.cardIds));
  return hand.filter((card) => !groupedIds.has(card.id));
}

export function classifyManualGroups(groups: ManualCardGroup[], hand: Card[], gameRank: GameRank): ClassifiedManualGroup[] {
  const cardById = new Map(hand.map((card) => [card.id, card]));
  return groups
    .map((group) => {
      const cards = group.cardIds.map((cardId) => cardById.get(cardId)).filter((card): card is Card => card !== undefined);
      const legalGroup = classifyPlay(cards, gameRank);

      return {
        ...group,
        cards,
        legalGroup,
        label: legalGroup === undefined ? "未成型" : groupLabel(legalGroup),
      };
    })
    .filter((group) => group.cards.length > 0);
}

function groupLabel(group: CardGroup): string {
  if (group.type !== "straight-flush") {
    return TYPE_LABELS[group.type];
  }

  const suited = group.cards.find((card): card is Extract<Card, { kind: "suited" }> => card.kind === "suited" && !group.wildcards.includes(card));
  return suited === undefined ? TYPE_LABELS[group.type] : `${SUIT_LABELS[suited.suit]}${TYPE_LABELS[group.type]}`;
}
