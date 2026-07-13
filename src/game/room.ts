import { createDeck, isHeartRankWild, rankStrength, type Card, type GameRank, type Rank, type Suit } from "../engine/cards";
import { detectGroups, type CardGroup } from "../engine/groups";
import { comparePlanQuality, isLegalBombReduction, measurePlanQuality } from "../engine/planQuality";
import { wildcardStructureBonus } from "../engine/planner";
import { chooseAiAction } from "./ai";
import { canBeatPlay, classifyPlay } from "./playRules";
import { createHandAnalysis, type HandAnalysis } from "./protectedGroups";
import { settleRound, type RoundSettlement, type TributeItem, type TributeState } from "./settlement";

export type Seat = 0 | 1 | 2 | 3;

export type PlayerState = {
  seat: Seat;
  name: string;
  isAI: boolean;
  handCount: number;
  team: 0 | 1;
};

export type TrickPlay = {
  seat: Seat;
  action: "play" | "pass";
  group?: CardGroup;
  trickIndex?: number;
};

export type TrickState = {
  leadSeat: Seat;
  lastPlay?: CardGroup;
  lastPlaySeat?: Seat;
  passSeats: Seat[];
  plays: TrickPlay[];
};

export type AiPlanState = {
  seat: Seat;
  name: string;
  score: number;
  groups: CardGroup[];
};

export type RoomState = {
  id: string;
  rank: GameRank;
  players: PlayerState[];
  hands: Record<Seat, Card[]>;
  initialHands: Record<Seat, Card[]>;
  currentTurn: Seat;
  leaderSeat: Seat;
  trick: TrickState;
  currentTrickIndex: number;
  finishOrder: Seat[];
  settlement?: RoundSettlement;
  openingTribute?: TributeState;
  aiPlans: Partial<Record<Seat, AiPlanState>>;
  status: "playing" | "finished";
  actionLog: string[];
  playHistory: TrickPlay[];
};

export type PublicRoom = Omit<RoomState, "hands" | "initialHands"> & {
  humanSeat: Seat;
  humanHand: Card[];
  replayHands: Record<Seat, Card[]>;
  announcements: string[];
};

let nextRoomId = 1;

export function createRoom({
  rank,
  seed = Date.now(),
  pendingTributeItems = [],
}: {
  rank: GameRank;
  seed?: number;
  pendingTributeItems?: TributeItem[];
}): RoomState {
  const deck = shuffledDeck(seed);
  const hands = {
    0: deck.slice(0, 27),
    1: deck.slice(27, 54),
    2: deck.slice(54, 81),
    3: deck.slice(81, 108),
  } satisfies Record<Seat, Card[]>;

  const openingTribute = resolveOpeningTribute(hands, pendingTributeItems, rank);
  const openingLeader = openingTribute?.status === "pending" ? openingTribute.activeSeat ?? 0 : randomOpeningLeader(seed);

  return {
    id: `room-${nextRoomId++}`,
    rank,
    players: [0, 1, 2, 3].map((seat) => ({
      seat: seat as Seat,
      name: seat === 0 ? "玩家" : `AI ${seat}`,
      isAI: seat !== 0,
      handCount: hands[seat as Seat].length,
      team: seat % 2 === 0 ? 0 : 1,
    })),
    hands,
    initialHands: {
      0: [...hands[0]],
      1: [...hands[1]],
      2: [...hands[2]],
      3: [...hands[3]],
    },
    currentTurn: openingLeader,
    leaderSeat: openingLeader,
    trick: { leadSeat: openingLeader, passSeats: [], plays: [] },
    currentTrickIndex: 0,
    finishOrder: [],
    openingTribute,
    aiPlans: {},
    status: "playing",
    actionLog: ["房间已创建，AI 已补齐空位。"],
    playHistory: [],
  };
}

export function getPublicRoom(
  room: RoomState,
  humanSeat: Seat,
  options: { ensurePlans?: boolean } = {},
): PublicRoom {
  if (options.ensurePlans !== false) {
    ensureAiPlans(room);
  }
  const { hands: _hands, initialHands: _initialHands, ...publicState } = room;

  return {
    ...publicState,
    humanSeat,
    humanHand: room.hands[humanSeat],
    replayHands: {
      0: [...room.initialHands[0]],
      1: [...room.initialHands[1]],
      2: [...room.initialHands[2]],
      3: [...room.initialHands[3]],
    },
    players: room.players.map((player) => ({ ...player, handCount: room.hands[player.seat].length })),
    announcements: announcements(room, humanSeat),
  };
}

function ensureAiPlans(room: RoomState): void {
  if (room.openingTribute?.status === "pending") {
    room.aiPlans = {};
    return;
  }

  for (const player of room.players) {
    if (!player.isAI || room.aiPlans[player.seat] !== undefined) {
      continue;
    }

    room.aiPlans[player.seat] = buildAiPlan(room, player.seat);
  }
}

function buildAiPlan(room: RoomState, seat: Seat, analysis?: HandAnalysis): AiPlanState {
  const groups = analysis !== undefined && room.hands[seat].length > 12
    ? buildRapidAiPlanGroups(analysis)
    : buildFastAiPlanGroups(room.hands[seat], room.rank);

  return {
    seat,
    name: "AI 最少手数组牌",
    score: scoreAiPlanGroups(groups, room.rank),
    groups,
  };
}

function buildRapidAiPlanGroups(analysis: HandAnalysis): CardGroup[] {
  const usedIds = new Set<string>();
  const selected: CardGroup[] = [];
  const candidates = [...analysis.accepted.map((candidate) => candidate.group)]
    .sort((left, right) =>
      rapidPlanPriority(right) - rapidPlanPriority(left) ||
      right.cards.length - left.cards.length ||
      left.wildcards.length - right.wildcards.length ||
      left.strength - right.strength ||
      left.id.localeCompare(right.id),
    );

  for (const group of candidates) {
    if (group.cards.some((card) => usedIds.has(card.id))) {
      continue;
    }
    if (group.type === "single" && analysis.allGroups.some((power) =>
      (power.type === "bomb" || power.type === "straight-flush" || power.type === "joker-bomb") &&
      power.cards.some((card) => card.id === group.cards[0]?.id) &&
      power.cards.every((card) => !usedIds.has(card.id)))) {
      continue;
    }

    selected.push(group);
    group.cards.forEach((card) => usedIds.add(card.id));
  }

  for (const card of analysis.hand) {
    if (usedIds.has(card.id)) {
      continue;
    }
    const single = analysis.allGroups.find((group) => group.type === "single" && group.cards[0]?.id === card.id);
    if (single !== undefined) {
      selected.push(single);
      usedIds.add(card.id);
    }
  }

  return selected;
}

function rapidPlanPriority(group: CardGroup): number {
  if (group.type === "bomb" || group.type === "straight-flush" || group.type === "joker-bomb") return 250;
  if (group.type === "consecutive-pairs" || group.type === "plate" || group.type === "straight") return 700;
  if (group.type === "full-house") return 600;
  if (group.type === "triple") return 400;
  if (group.type === "pair") return 300;
  return 0;
}

function buildFastAiPlanGroups(cards: Card[], gameRank: GameRank): CardGroup[] {
  const groups = detectGroups(cards, gameRank);
  const naturalBombs = maximalNaturalBombs(groups);
  const legalReductionKeys = new Set<string>();
  for (const bomb of naturalBombs) {
    for (const group of groups) {
      if (
        group.type === "straight" &&
        groupsOverlap(group, bomb) &&
        isLegalRoomBombReduction(bomb, group, groups, gameRank)
      ) {
        legalReductionKeys.add(bombReductionKey(bomb, group));
      }
    }
  }
  const requiredFourBombReductions = new Set(
    groups
      .filter((group) => isRequiredFourBombReduction(group, naturalBombs, legalReductionKeys))
      .map((group) => group.id),
  );
  const scoreOrder = prioritizeGroups(
    [...groups].sort(compareAiPlanGroups(gameRank)),
    requiredFourBombReductions,
  );
  const structureOrder = prioritizeGroups([...groups].sort((left, right) => {
    const priorityDelta = structureSelectionPriority(right) - structureSelectionPriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    if (left.type === "full-house" && right.type === "full-house") {
      const majorStrengthDelta =
        fullHouseMajorStrength(right, gameRank) - fullHouseMajorStrength(left, gameRank);
      if (majorStrengthDelta !== 0) {
        return majorStrengthDelta;
      }
    }
    return compareAiPlanGroups(gameRank)(left, right);
  }), requiredFourBombReductions);
  const reductionPriorityById = new Map(
    groups.map((group) => [
      group.id,
      bombReductionSelectionPriority(group, groups, naturalBombs, legalReductionKeys),
    ]),
  );
  const reductionOrder = prioritizeGroups([...groups].sort((left, right) => {
    const priorityDelta =
      (reductionPriorityById.get(right.id) ?? 0) -
      (reductionPriorityById.get(left.id) ?? 0);
    return priorityDelta !== 0 ? priorityDelta : compareAiPlanGroups(gameRank)(left, right);
  }), requiredFourBombReductions);
  const scoreCover = buildGreedyAiCover(cards, groups, naturalBombs, legalReductionKeys, scoreOrder, gameRank);
  const structureCover = buildGreedyAiCover(cards, groups, naturalBombs, legalReductionKeys, structureOrder, gameRank, true);
  const reductionCover = buildGreedyAiCover(cards, groups, naturalBombs, legalReductionKeys, reductionOrder, gameRank);
  const beamCover = buildBeamAiCover(
    cards,
    groups,
    naturalBombs,
    legalReductionKeys,
    requiredFourBombReductions,
    reductionPriorityById,
    gameRank,
  );
  const covers = [scoreCover];

  if (structureCover.some((group) => usesPairFromTriple(group, cards))) {
    covers.push(structureCover);
  }
  if (reductionCover.some((group) => (reductionPriorityById.get(group.id) ?? 0) >= 6000)) {
    covers.push(reductionCover);
  }
  if (beamCover.some((group) => group.type === "straight")) {
    covers.push(beamCover);
  }

  const distinctCovers = [...new Map(
    covers.map((cover) => [deterministicGroupIds(cover), cover]),
  ).values()];
  const bestGroups = distinctCovers
    .map((cover) => ({
      groups: cover,
      quality: measurePlanQuality(cards, cover, gameRank, scoreAiPlanGroups(cover, gameRank)),
    }))
    .sort((left, right) => {
      const qualityDelta = comparePlanQuality(left.quality, right.quality);
      return qualityDelta !== 0
        ? qualityDelta
        : deterministicGroupIds(left.groups).localeCompare(deterministicGroupIds(right.groups));
    })[0]?.groups ?? scoreCover;

  return bestGroups;
}

function usesPairFromTriple(group: CardGroup, cards: Card[]): boolean {
  if (group.type !== "full-house") {
    return false;
  }

  const groupCounts = rankCounts(group.cards);
  const pairRank = [...groupCounts.entries()].find(([, count]) => count === 2)?.[0];
  return pairRank !== undefined && rankCounts(cards).get(pairRank) === 3;
}

type AiCandidateEntry = {
  group: CardGroup;
  mask: number;
  quality: ReturnType<typeof measurePlanQuality>;
};

type BeamState = {
  usedMask: number;
  groups: CardGroup[];
  quality: ReturnType<typeof measurePlanQuality>;
};

function buildBeamAiCover(
  cards: Card[],
  groups: CardGroup[],
  sourceBombs: CardGroup[],
  legalReductionKeys: Set<string>,
  requiredFourBombReductions: Set<string>,
  reductionPriorityById: Map<string, number>,
  gameRank: GameRank,
): CardGroup[] {
  const cardIndexById = new Map(cards.map((card, index) => [card.id, index]));
  const fullMask = (1 << cards.length) - 1;
  const orderedGroups = prioritizeGroups(
    [...groups]
      .filter((group) => preservesAiBeamStructures(group, cards, groups, gameRank))
      .filter((group) => respectsAiProtectedStructures(group, groups, sourceBombs, legalReductionKeys))
      .sort((left, right) => {
        const reductionDelta = (reductionPriorityById.get(right.id) ?? 0) - (reductionPriorityById.get(left.id) ?? 0);
        if (reductionDelta !== 0) {
          return reductionDelta;
        }

        const structureDelta = structureSelectionPriority(right) - structureSelectionPriority(left);
        if (structureDelta !== 0) {
          return structureDelta;
        }

        return compareAiPlanGroups(gameRank)(left, right);
      }),
    requiredFourBombReductions,
  );
  const entries = orderedGroups
    .map((group): AiCandidateEntry | undefined => {
      let mask = 0;

      for (const card of group.cards) {
        const index = cardIndexById.get(card.id);
        if (index === undefined) {
          return undefined;
        }

        mask |= 1 << index;
      }

      return {
        group,
        mask,
        quality: measurePlanQuality([], [group], gameRank, aiPlanGroupScore(group, gameRank)),
      };
    })
    .filter((entry): entry is AiCandidateEntry => entry !== undefined);
  const entriesByFirstOpenCard = cards.map((_, index) =>
    entries.filter((entry) => (entry.mask & (1 << index)) !== 0),
  );
  const beamWidth = cards.length <= 12 ? 512 : cards.length <= 18 ? 96 : 16;
  const expansionWidth = cards.length <= 12 ? 64 : cards.length <= 18 ? 24 : 6;
  const completed = new Map<string, CardGroup[]>();
  let frontier: BeamState[] = [{
    usedMask: 0,
    groups: [],
    quality: {
      protectedLoss: 0,
      lowSingleCount: 0,
      groupCount: 0,
      retainedControl: 0,
      fallbackScore: 0,
    },
  }];

  while (frontier.length > 0) {
    const nextStates: BeamState[] = [];

    for (const state of frontier) {
      if (state.usedMask === fullMask) {
        completed.set(deterministicGroupIds(state.groups), state.groups);
        continue;
      }

      const nextCardIndex = firstOpenCardIndex(state.usedMask, cards.length);
      let expanded = 0;

      for (const entry of entriesByFirstOpenCard[nextCardIndex]) {
        if ((entry.mask & state.usedMask) !== 0) {
          continue;
        }

        nextStates.push({
          usedMask: state.usedMask | entry.mask,
          groups: [...state.groups, entry.group],
          quality: addAiPlanQuality(state.quality, entry.quality),
        });
        expanded += 1;

        if (expanded >= expansionWidth) {
          break;
        }
      }
    }

    if (nextStates.length === 0) {
      break;
    }

    const bestStateByMask = new Map<number, BeamState>();
    for (const state of nextStates) {
      const best = bestStateByMask.get(state.usedMask);
      if (best === undefined || compareBeamStates(state, best) < 0) {
        bestStateByMask.set(state.usedMask, state);
      }
    }

    frontier = [...bestStateByMask.values()]
      .sort(compareBeamStates)
      .slice(0, beamWidth);
  }

  const covers = [...completed.values()];
  if (covers.length === 0) {
    return buildGreedyAiCover(cards, groups, sourceBombs, legalReductionKeys, orderedGroups, gameRank);
  }

  return covers
    .map((cover) => ({
      groups: cover,
      quality: measurePlanQuality(cards, cover, gameRank, scoreAiPlanGroups(cover, gameRank)),
    }))
    .sort((left, right) => {
      const qualityDelta = comparePlanQuality(left.quality, right.quality);
      return qualityDelta !== 0
        ? qualityDelta
        : deterministicGroupIds(left.groups).localeCompare(deterministicGroupIds(right.groups));
    })[0].groups;
}

function compareBeamStates(left: BeamState, right: BeamState): number {
  const qualityDelta = comparePlanQuality(left.quality, right.quality);
  if (qualityDelta !== 0) {
    return qualityDelta;
  }

  return deterministicGroupIds(left.groups).localeCompare(deterministicGroupIds(right.groups));
}

function addAiPlanQuality(
  left: ReturnType<typeof measurePlanQuality>,
  right: ReturnType<typeof measurePlanQuality>,
): ReturnType<typeof measurePlanQuality> {
  return {
    protectedLoss: 0,
    lowSingleCount: left.lowSingleCount + right.lowSingleCount,
    groupCount: left.groupCount + right.groupCount,
    retainedControl: left.retainedControl + right.retainedControl,
    fallbackScore: left.fallbackScore + right.fallbackScore,
  };
}

function firstOpenCardIndex(usedMask: number, cardCount: number): number {
  for (let index = 0; index < cardCount; index += 1) {
    if ((usedMask & (1 << index)) === 0) {
      return index;
    }
  }

  return cardCount;
}

function buildGreedyAiCover(
  cards: Card[],
  allGroups: CardGroup[],
  sourceBombs: CardGroup[],
  legalReductionKeys: Set<string>,
  orderedGroups: CardGroup[],
  gameRank: GameRank,
  allowLinkedFullHouse = false,
): CardGroup[] {
  const usedIds = new Set<string>();
  const selected: CardGroup[] = [];

  for (const group of orderedGroups) {
    if (
      allowLinkedFullHouse &&
      group.type === "full-house" &&
      selected.some((selectedGroup) => selectedGroup.type === "full-house")
    ) {
      continue;
    }

    if (
      !canSelectAiPlanGroup(group, cards, usedIds, allGroups, allowLinkedFullHouse) ||
      !respectsAiProtectedStructures(group, allGroups, sourceBombs, legalReductionKeys)
    ) {
      continue;
    }

    selected.push(group);
    for (const card of group.cards) {
      usedIds.add(card.id);
    }
  }

  const remainingSingles = allGroups.filter(
    (group) => group.type === "single" && group.cards.every((card) => !usedIds.has(card.id)),
  );
  return [...selected, ...remainingSingles].sort(compareAiPlanGroups(gameRank));
}

function compareAiPlanGroups(gameRank: GameRank): (left: CardGroup, right: CardGroup) => number {
  return (left, right) => {
    const scoreDelta = aiPlanGroupScore(right, gameRank) - aiPlanGroupScore(left, gameRank);
    return scoreDelta !== 0 ? scoreDelta : left.id.localeCompare(right.id);
  };
}

function preservesAiNaturalStructures(group: CardGroup, cards: Card[], gameRank: GameRank): boolean {
  if (group.type === "pair" && group.wildcards.length === 0) {
    return naturalRankCount(group.cards[0]?.rank, cards, gameRank) === 2;
  }

  if (group.type !== "full-house" || group.wildcards.length > 0) {
    return true;
  }

  const counts = rankCounts(group.cards);
  const pairRank = [...counts.entries()].find(([, count]) => count === 2)?.[0];
  if (pairRank === undefined) {
    return true;
  }

  return naturalRankCount(pairRank, cards, gameRank) === 2;
}

function preservesAiBeamStructures(
  group: CardGroup,
  cards: Card[],
  allGroups: CardGroup[],
  gameRank: GameRank,
): boolean {
  if (group.type === "pair" && group.wildcards.length === 0) {
    const naturalCount = naturalRankCount(group.cards[0]?.rank, cards, gameRank);
    if (naturalCount < 2) {
      return false;
    }

    if (naturalCount === 2) {
      return true;
    }

    return !breaksBeamLinkedPair(group, allGroups);
  }

  return preservesAiNaturalStructures(group, cards, gameRank);
}

function breaksBeamLinkedPair(group: CardGroup, allGroups: CardGroup[]): boolean {
  const groupIds = new Set(group.cards.map((card) => card.id));

  return allGroups.some((container) => {
    if ((container.type !== "plate" && container.type !== "consecutive-pairs") || container.wildcards.length > 0) {
      return false;
    }

    return container.cards.some((card) => groupIds.has(card.id)) &&
      container.cards.some((card) => !groupIds.has(card.id));
  });
}

function naturalRankCount(rank: Card["rank"] | undefined, cards: Card[], gameRank: GameRank): number {
  if (rank === undefined) {
    return 0;
  }

  return cards.filter(
    (card) => card.kind === "suited" && card.rank === rank && !isHeartRankWild(card, gameRank),
  ).length;
}

function fullHouseMajorStrength(group: CardGroup, gameRank: GameRank): number {
  const counts = rankCounts(group.cards);
  const majorRank = [...counts.entries()].find(([, count]) => count === 3)?.[0];
  return majorRank === undefined ? 0 : rankStrength(majorRank, gameRank);
}

function prioritizeGroups(groups: CardGroup[], prioritizedIds: Set<string>): CardGroup[] {
  return [...groups].sort((left, right) => {
    const priorityDelta = Number(prioritizedIds.has(right.id)) - Number(prioritizedIds.has(left.id));
    return priorityDelta !== 0 ? priorityDelta : 0;
  });
}

function structureSelectionPriority(group: CardGroup): number {
  if (group.type === "straight-flush") {
    return 5000;
  }
  if (group.type === "bomb" || group.type === "joker-bomb") {
    return 4800;
  }
  if (group.type === "full-house") {
    return 4200;
  }
  if (group.type === "straight") {
    return 4000;
  }
  if (group.type === "plate" || group.type === "consecutive-pairs") {
    return 3000;
  }

  return group.cards.length * 100;
}

function bombReductionSelectionPriority(
  group: CardGroup,
  allGroups: CardGroup[],
  sourceBombs: CardGroup[],
  legalReductionKeys: Set<string>,
): number {
  const retainedBombSize = retainedBombSizeAfterReduction(
    group,
    allGroups,
    sourceBombs,
    legalReductionKeys,
  );
  if (retainedBombSize > 0) {
    return 6000 + retainedBombSize;
  }

  return structureSelectionPriority(group);
}

function retainedBombSizeAfterReduction(
  group: CardGroup,
  allGroups: CardGroup[],
  sourceBombs: CardGroup[],
  legalReductionKeys: Set<string>,
): number {
  if (group.type !== "straight") {
    return 0;
  }

  let retainedBombSize = 0;
  const groupIds = new Set(group.cards.map((card) => card.id));

  for (const bomb of sourceBombs) {
    if (!groupsOverlap(group, bomb) || !legalReductionKeys.has(bombReductionKey(bomb, group))) {
      continue;
    }

    if (bomb.cards.length === 4) {
      retainedBombSize = Math.max(retainedBombSize, 1);
      continue;
    }

    const remainingBomb = allGroups
      .filter(
        (candidate) =>
          candidate.type === "bomb" &&
          candidate.wildcards.length === 0 &&
          candidate.cards.length >= 4 &&
          candidate.cards.every(
            (card) =>
              bomb.cards.some((bombCard) => bombCard.id === card.id) &&
              !groupIds.has(card.id),
          ),
      )
      .sort((left, right) => right.cards.length - left.cards.length)[0];

    retainedBombSize = Math.max(retainedBombSize, remainingBomb?.cards.length ?? 0);
  }

  return retainedBombSize;
}

function respectsAiProtectedStructures(
  group: CardGroup,
  allGroups: CardGroup[],
  sourceBombs: CardGroup[],
  legalReductionKeys: Set<string>,
): boolean {
  if (
    group.type !== "straight-flush" &&
    allGroups.some((candidate) => candidate.type === "straight-flush" && groupsOverlap(group, candidate))
  ) {
    return false;
  }

  return sourceBombs.every((bomb) => {
    if (!groupsOverlap(group, bomb) || group.type === "bomb") {
      return true;
    }

    return legalReductionKeys.has(bombReductionKey(bomb, group));
  });
}

function isRequiredFourBombReduction(
  group: CardGroup,
  sourceBombs: CardGroup[],
  legalReductionKeys: Set<string>,
): boolean {
  return sourceBombs.some(
    (bomb) =>
      bomb.cards.length === 4 &&
      groupsOverlap(group, bomb) &&
      legalReductionKeys.has(bombReductionKey(bomb, group)),
  );
}

function bombReductionKey(bomb: CardGroup, consumingGroup: CardGroup): string {
  return `${bomb.id}|${consumingGroup.id}`;
}

function isLegalRoomBombReduction(
  bomb: CardGroup,
  consumingGroup: CardGroup,
  allGroups: CardGroup[],
  gameRank: GameRank,
): boolean {
  const bombIds = new Set(bomb.cards.map((card) => card.id));
  const nonBombIds = consumingGroup.cards
    .filter((card) => !bombIds.has(card.id))
    .map((card) => card.id)
    .sort()
    .join("|");
  const context = allGroups.filter((group) => {
    if (group.type !== "straight" || group.id === consumingGroup.id) {
      return true;
    }

    const candidateNonBombIds = group.cards
      .filter((card) => !bombIds.has(card.id))
      .map((card) => card.id)
      .sort()
      .join("|");
    return candidateNonBombIds !== nonBombIds;
  });

  return isLegalBombReduction(bomb, consumingGroup, context, gameRank);
}

function maximalNaturalBombs(groups: CardGroup[]): CardGroup[] {
  return groups.filter((group) => {
    if (group.type !== "bomb" || group.wildcards.length > 0) {
      return false;
    }

    return !groups.some(
      (candidate) =>
        candidate.type === "bomb" &&
        candidate.wildcards.length === 0 &&
        candidate.cards.length > group.cards.length &&
        group.cards.every((card) => candidate.cards.some((candidateCard) => candidateCard.id === card.id)),
    );
  });
}

function groupsOverlap(left: CardGroup, right: CardGroup): boolean {
  const rightIds = new Set(right.cards.map((card) => card.id));
  return left.cards.some((card) => rightIds.has(card.id));
}

function deterministicGroupIds(groups: CardGroup[]): string {
  return groups.map((group) => group.id).sort().join("|");
}

function scoreAiPlanGroups(groups: CardGroup[], gameRank: GameRank): number {
  const turnEfficiency = Math.max(0, 100 - Math.max(0, groups.length - 8) * 6);
  const averagePower = groups.length === 0 ? 0 : groups.reduce((total, group) => total + Math.min(100, group.strength * 2), 0) / groups.length;
  return Math.round(turnEfficiency * 0.7 + averagePower * 0.3);
}

function aiPlanGroupScore(group: CardGroup, gameRank: GameRank): number {
  const typeWeight: Record<CardGroup["type"], number> = {
    "straight-flush": 1200,
    bomb: 1100,
    "joker-bomb": 100,
    straight: 500,
    plate: 640,
    "consecutive-pairs": 580,
    "full-house": 420,
    triple: 260,
    pair: 170,
    single: 5,
  };

  return typeWeight[group.type] + powerResourceBonus(group) + wildcardStructureBonus(group) + group.cards.length * 20 + aiPlanRankScore(group) + groupCardCost(group, gameRank) / 100 - fullHouseKickerCost(group, gameRank);
}

function aiPlanRankScore(group: CardGroup): number {
  if (group.type === "straight" || group.type === "consecutive-pairs" || group.type === "plate") {
    return -group.strength * 2;
  }

  return group.strength;
}

function groupCardCost(group: CardGroup, gameRank: GameRank): number {
  return group.cards.reduce((total, card) => total + rankStrength(card.rank, gameRank), 0);
}

function canSelectAiPlanGroup(
  group: CardGroup,
  cards: Card[],
  usedIds: Set<string>,
  allGroups: CardGroup[],
  allowLinkedFullHouse = false,
): boolean {
  if (group.cards.some((card) => usedIds.has(card.id))) {
    return false;
  }

  if (group.type !== "full-house") {
    return true;
  }

  if (allowLinkedFullHouse) {
    return (
      isNaturalStructureFullHouse(group, cards, usedIds) &&
      leavesTwoDisjointStraights(group, allGroups, usedIds)
    );
  }

  return isNaturalRemainingFullHouse(group, cards, usedIds) && !breaksRemainingLinkedStructure(group, allGroups, usedIds);
}

function isNaturalStructureFullHouse(group: CardGroup, cards: Card[], usedIds: Set<string>): boolean {
  if (group.wildcards.length > 0) {
    return false;
  }

  const groupCounts = rankCounts(group.cards);
  const tripleRank = [...groupCounts.entries()].find(([, count]) => count === 3)?.[0];
  const pairRank = [...groupCounts.entries()].find(([, count]) => count === 2)?.[0];
  if (tripleRank === undefined || pairRank === undefined) {
    return false;
  }

  const remainingCounts = rankCounts(cards.filter((card) => !usedIds.has(card.id)));
  return remainingCounts.get(tripleRank) === 3 && (remainingCounts.get(pairRank) ?? 0) >= 2;
}

function leavesTwoDisjointStraights(
  group: CardGroup,
  allGroups: CardGroup[],
  usedIds: Set<string>,
): boolean {
  const unavailableIds = new Set([
    ...usedIds,
    ...group.cards.map((card) => card.id),
  ]);
  const availableStraights = allGroups.filter(
    (candidate) =>
      candidate.type === "straight" &&
      candidate.cards.every((card) => !unavailableIds.has(card.id)),
  );

  return availableStraights.some((left, index) => {
    const leftIds = new Set(left.cards.map((card) => card.id));
    return availableStraights
      .slice(index + 1)
      .some((right) => right.cards.every((card) => !leftIds.has(card.id)));
  });
}

function isNaturalRemainingFullHouse(group: CardGroup, cards: Card[], usedIds: Set<string>): boolean {
  if (group.wildcards.length > 0) {
    return false;
  }

  const groupCounts = rankCounts(group.cards);
  const tripleRank = [...groupCounts.entries()].find(([, count]) => count === 3)?.[0];
  const pairRank = [...groupCounts.entries()].find(([, count]) => count === 2)?.[0];
  if (tripleRank === undefined || pairRank === undefined) {
    return false;
  }

  const remainingCounts = rankCounts(cards.filter((card) => !usedIds.has(card.id)));
  return remainingCounts.get(tripleRank) === 3 && remainingCounts.get(pairRank) === 2;
}

function rankCounts(cards: Card[]): Map<Card["rank"], number> {
  const counts = new Map<Card["rank"], number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  return counts;
}

function breaksRemainingLinkedStructure(group: CardGroup, allGroups: CardGroup[], usedIds: Set<string>): boolean {
  const protectedTypes: CardGroup["type"][] = ["straight", "consecutive-pairs", "plate", "straight-flush", "bomb", "joker-bomb"];
  const groupIds = new Set(group.cards.map((card) => card.id));

  return allGroups.some((container) => {
    if (!protectedTypes.includes(container.type) || container.cards.some((card) => usedIds.has(card.id))) {
      return false;
    }

    const containerIds = new Set(container.cards.map((card) => card.id));
    return group.cards.some((card) => containerIds.has(card.id)) && container.cards.some((card) => !groupIds.has(card.id));
  });
}

function fullHouseKickerCost(group: CardGroup, gameRank: GameRank): number {
  if (group.type !== "full-house") {
    return 0;
  }

  const counts = new Map<string, { count: number; strength: number; wildcardCount: number }>();
  for (const card of group.cards) {
    const current = counts.get(card.rank) ?? { count: 0, strength: rankStrength(card.rank, gameRank), wildcardCount: 0 };
    counts.set(card.rank, {
      count: current.count + 1,
      strength: current.strength,
      wildcardCount: current.wildcardCount + (isHeartRankWild(card, gameRank) ? 1 : 0),
    });
  }

  const major = [...counts.values()]
    .filter((entry) => entry.count >= 3)
    .sort((left, right) => left.strength - right.strength)[0];
  const pair = [...counts.values()]
    .filter((entry) => entry.count === 2)
    .sort((left, right) => left.strength - right.strength)[0];
  if (major === undefined || pair === undefined) {
    return 0;
  }

  return pair.wildcardCount * 1000 + major.strength * 4 + pair.strength * 12;
}

function powerResourceBonus(group: CardGroup): number {
  if (group.type === "bomb" && group.wildcards.length === 0) {
    return 500 + group.cards.length * 80;
  }

  if (group.type === "bomb") {
    return group.cards.length <= 5 ? 260 : 420;
  }

  if (group.type === "straight-flush") {
    return 650;
  }

  return 0;
}

export function playCards(room: RoomState, seat: Seat, cardIds: string[]): void {
  assertActiveTurn(room, seat);
  assertNoOpeningTribute(room);
  const selected = selectCards(room.hands[seat], cardIds);
  const group = classifyPlay(selected, room.rank);

  if (group === undefined) {
    throw new Error("所选牌不能组成合法牌型。");
  }

  if (!canBeatPlay(group, room.trick.lastPlay, room.rank)) {
    throw new Error("所选牌不能压过上家。");
  }

  const selectedIds = new Set(cardIds);
  room.hands[seat] = room.hands[seat].filter((card) => !selectedIds.has(card.id));
  room.trick.lastPlay = group;
  room.trick.lastPlaySeat = seat;
  room.trick.passSeats = [];
  const play = { seat, action: "play", group, trickIndex: room.currentTrickIndex } satisfies TrickPlay;
  room.trick.plays.push(play);
  room.playHistory.push(play);
  room.actionLog.unshift(`${playerName(room, seat)} 出牌：${playLabel(group)}。`);

  if (room.hands[seat].length === 0 && !room.finishOrder.includes(seat)) {
    room.finishOrder.push(seat);
    room.actionLog.unshift(`${playerName(room, seat)} 已出完。`);
  }

  advanceAfterAction(room, seat);
}

export function passTurn(room: RoomState, seat: Seat): void {
  assertActiveTurn(room, seat);
  assertNoOpeningTribute(room);
  if (room.trick.lastPlay === undefined) {
    throw new Error("首家不能过牌。");
  }

  if (!room.trick.passSeats.includes(seat)) {
    room.trick.passSeats.push(seat);
  }
  const play = { seat, action: "pass", trickIndex: room.currentTrickIndex } satisfies TrickPlay;
  room.trick.plays.push(play);
  room.playHistory.push(play);
  room.actionLog.unshift(`${playerName(room, seat)} 过牌。`);

  if (room.trick.passSeats.length >= passesNeededToReset(room)) {
    const leadSeat = resolveTrickWinnerSeat(room);
    room.trick = { leadSeat, passSeats: [], plays: [] };
    room.currentTrickIndex += 1;
    room.currentTurn = leadSeat;
    room.leaderSeat = leadSeat;
    room.actionLog.unshift(`${playerName(room, leadSeat)} 接风。`);
  } else {
    room.currentTurn = nextPlayableSeat(room, seat);
  }
}

export function runAiStep(room: RoomState): void {
  if (room.status !== "playing") {
    return;
  }

  normalizeActiveSeat(room);
  if (room.status !== "playing") {
    return;
  }

  if (room.openingTribute?.status === "pending") {
    const activePlayer = room.players.find((candidate) => candidate.seat === room.openingTribute?.activeSeat);
    if (activePlayer?.isAI === true) {
      advanceOpeningTribute(room);
    }
    return;
  }

  const player = room.players.find((candidate) => candidate.seat === room.currentTurn);
  if (player?.isAI !== true) {
    return;
  }

  const seat = room.currentTurn;
  const partner = partnerSeat(seat);
  const analysis = createHandAnalysis(room.hands[seat], room.rank);
  ensureAiPlanForSeat(room, seat, analysis);
  const action = chooseAiAction({
    hand: room.hands[seat],
    partnerHand: room.hands[partner],
    plannedGroups: currentPlannedGroups(room, seat),
    gameRank: room.rank,
    seat,
    partnerSeat: partner,
    lastPlay: room.trick.lastPlay,
    lastPlaySeat: room.trick.lastPlaySeat,
    analysis,
    preferPlannedLead: true,
    context: {
      ownHandCount: room.hands[seat].length,
      partnerHandCount: room.hands[partner].length,
      opponentHandCounts: room.players
        .filter((candidate) => candidate.seat !== seat && candidate.seat !== partner)
        .map((candidate) => room.hands[candidate.seat].length),
      playedCards: room.playHistory.flatMap((play) => play.group?.cards ?? []),
      finishOrder: room.finishOrder,
      partnerPassedCurrentTrick: room.trick.passSeats.includes(partner),
    },
  });

  if (action.type === "pass") {
    if (room.trick.lastPlay === undefined) {
      const fallbackGroup = selectSafeAiLeadFallback(room.hands[seat], room.rank, analysis);
      if (fallbackGroup === undefined) {
        if (room.hands[seat].length === 0) {
          throw new Error("AI_ACTIVE_SEAT_EMPTY");
        }
        throw new Error("AI_NON_EMPTY_HAND_HAS_NO_LEGAL_LEAD");
      }

      room.actionLog.unshift(`${playerName(room, seat)} 首发策略为空，按保护规则兜底出牌。`);
      playCards(room, seat, fallbackGroup.cards.map((card) => card.id));
      return;
    }
    passTurn(room, seat);
  } else {
    playCards(room, seat, action.group.cards.map((card) => card.id));
  }
}

function normalizeActiveSeat(room: RoomState): void {
  const activeHand = room.hands[room.currentTurn];
  if (activeHand.length > 0 && !room.finishOrder.includes(room.currentTurn)) {
    return;
  }

  const liveSeats = room.players
    .map((player) => player.seat)
    .filter((seat) => room.hands[seat].length > 0 && !room.finishOrder.includes(seat));
  if (liveSeats.length === 0) {
    finishRound(room);
    return;
  }

  room.currentTurn = nextPlayableSeat(room, room.currentTurn);
  if (room.trick.lastPlay === undefined) {
    room.trick.leadSeat = room.currentTurn;
    room.leaderSeat = room.currentTurn;
  }
}

export function selectSafeAiLeadFallback(
  hand: Card[],
  gameRank: GameRank,
  analysis = createHandAnalysis(hand, gameRank),
): CardGroup | undefined {
  return analysis.accepted
    .map((candidate) => candidate.group)
    .sort((left, right) =>
      left.cards.length - right.cards.length ||
      left.strength - right.strength ||
      left.id.localeCompare(right.id),
    )[0];
}

function ensureAiPlanForSeat(room: RoomState, seat: Seat, analysis?: HandAnalysis): void {
  const plan = room.aiPlans[seat];
  const hand = room.hands[seat];
  if (plan !== undefined && planCoversHand(plan, hand)) {
    return;
  }

  room.aiPlans[seat] = buildAiPlan(room, seat, analysis);
}

function planCoversHand(plan: AiPlanState, hand: Card[]): boolean {
  const handIds = new Set(hand.map((card) => card.id));
  const plannedCardIds = new Set(
    plan.groups
      .filter((group) => group.cards.every((card) => handIds.has(card.id)))
      .flatMap((group) => group.cards.map((card) => card.id)),
  );
  return plannedCardIds.size === hand.length && hand.every((card) => plannedCardIds.has(card.id));
}

function currentPlannedGroups(room: RoomState, seat: Seat): CardGroup[] {
  const handIds = new Set(room.hands[seat].map((card) => card.id));
  return room.aiPlans[seat]?.groups.filter((group) => group.cards.every((card) => handIds.has(card.id))) ?? [];
}

export function advanceOpeningTribute(room: RoomState, seat?: Seat, cardIds: string[] = []): void {
  const tribute = room.openingTribute;
  if (tribute === undefined || tribute.status !== "pending") {
    return;
  }

  const itemIndex = tribute.activeItemIndex ?? 0;
  const activeItem = tribute.phase === "return" ? tribute.exchanges?.[itemIndex] : tribute.items[itemIndex];
  if (activeItem === undefined) {
    completeOpeningTribute(room);
    return;
  }

  if (tribute.phase === "return") {
    const returnSeat = activeItem.receiver;
    const returnCard = selectOpeningReturnCard(room, returnSeat, seat, cardIds);
    moveCard(room.hands, returnSeat, activeItem.payer, returnCard);

    const exchange = tribute.exchanges?.[itemIndex];
    if (exchange !== undefined) {
      exchange.returnCard = returnCard;
    }

    const nextItemIndex = itemIndex + 1;
    if (nextItemIndex >= tribute.items.length) {
      completeOpeningTribute(room, returnCard);
      return;
    }

    const nextItem = tribute.exchanges?.[nextItemIndex];
    room.openingTribute = {
      ...tribute,
      status: "pending",
      phase: "return",
      activeItemIndex: nextItemIndex,
      activeSeat: nextItem?.receiver,
      activeCard: returnCard,
    };
    return;
  }

  const item = activeItem;
  const payerSeat = item.payer;
  const tributeCard = selectOpeningTributeCard(room, payerSeat, seat, cardIds);
  removeCard(room.hands, payerSeat, tributeCard);

  const exchanges = [...(tribute.exchanges ?? [])];
  exchanges[itemIndex] = {
    payer: item.payer,
    receiver: item.receiver,
    tributeCard,
  };

  const nextItemIndex = itemIndex + 1;
  if (nextItemIndex < tribute.items.length) {
    const nextItem = tribute.items[nextItemIndex];
    room.openingTribute = {
      ...tribute,
      status: "pending",
      phase: "tribute",
      activeItemIndex: nextItemIndex,
      activeSeat: nextItem.payer,
      activeCard: tributeCard,
      exchanges,
    };
    return;
  }

  const assignedExchanges = assignTributeReceivers(room, tribute.items, exchanges);
  room.openingTribute = {
    ...tribute,
    status: "pending",
    phase: "return",
    activeItemIndex: 0,
    activeSeat: assignedExchanges[0]?.receiver,
    activeCard: tributeCard,
    exchanges: assignedExchanges,
  };
}

export function runAiUntilHumanTurn(room: RoomState, humanSeat: Seat = 0): void {
  let guard = 0;
  while (room.status === "playing" && room.currentTurn !== humanSeat && room.players.find((player) => player.seat === room.currentTurn)?.isAI && guard < 128) {
    runAiStep(room);
    guard += 1;
  }
}

export function runAiUntilNextHumanTurn(room: RoomState): void {
  let guard = 0;

  while (room.status === "playing") {
    const pendingTribute = room.openingTribute?.status === "pending";
    const activeSeat = pendingTribute ? room.openingTribute?.activeSeat : room.currentTurn;
    const activePlayer = room.players.find((player) => player.seat === activeSeat);

    if (activePlayer?.isAI !== true) {
      return;
    }

    const before = aiProgressSnapshot(room);
    runAiStep(room);
    guard += 1;

    if (room.status === "playing" && before === aiProgressSnapshot(room)) {
      throw new Error("AI_TURN_NO_PROGRESS");
    }

    if (guard >= 512 && room.status === "playing") {
      throw new Error("AI_TURN_LIMIT_REACHED");
    }
  }
}

function aiProgressSnapshot(room: RoomState): string {
  return JSON.stringify({
    status: room.status,
    currentTurn: room.currentTurn,
    finishOrder: room.finishOrder,
    openingTribute: room.openingTribute === undefined
      ? undefined
      : {
          status: room.openingTribute.status,
          phase: room.openingTribute.phase,
          activeSeat: room.openingTribute.activeSeat,
          activeItemIndex: room.openingTribute.activeItemIndex,
          handCounts: room.players.map((player) => room.hands[player.seat].length),
        },
    handCounts: room.players.map((player) => room.hands[player.seat].length),
    playHistoryLength: room.playHistory.length,
  });
}

function shuffledDeck(seed: number): Card[] {
  const deck = createDeck();
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

function randomOpeningLeader(seed: number): Seat {
  return (((seed - 1) % 4 + 4) % 4) as Seat;
}

function selectCards(hand: Card[], cardIds: string[]): Card[] {
  const cards = cardIds.map((id) => hand.find((card) => card.id === id));
  if (cards.some((card) => card === undefined)) {
    throw new Error("所选牌不在当前手牌中。");
  }

  return cards as Card[];
}

function assertActiveTurn(room: RoomState, seat: Seat): void {
  if (room.status !== "playing") {
    throw new Error("牌局已经结束。");
  }

  if (room.currentTurn !== seat) {
    throw new Error("还没有轮到该座位。");
  }
}

function assertNoOpeningTribute(room: RoomState): void {
  if (room.openingTribute?.status === "pending") {
    throw new Error("开局贡还牌尚未完成。");
  }
}

function advanceAfterAction(room: RoomState, seat: Seat): void {
  if (room.finishOrder.length >= 3 || partnersFinishedFirstAndSecond(room)) {
    finishRound(room);
    return;
  }

  room.currentTurn = nextPlayableSeat(room, seat);
  room.leaderSeat = room.trick.lastPlaySeat ?? room.currentTurn;
}

function partnersFinishedFirstAndSecond(room: RoomState): boolean {
  return room.finishOrder.length >= 2 && partnerSeat(room.finishOrder[0]) === room.finishOrder[1];
}

function finishRound(room: RoomState): void {
  for (const player of room.players) {
    if (!room.finishOrder.includes(player.seat)) {
      room.finishOrder.push(player.seat);
    }
  }

  const jokerHoldings = Object.fromEntries(
    room.players.map((player) => [
      player.seat,
      room.hands[player.seat].filter((card) => card.kind === "joker" && card.rank === "BJ").map((card) => card.id),
    ]),
  ) as Partial<Record<Seat, string[]>>;

  room.status = "finished";
  room.settlement = settleRound(room.finishOrder, room.rank, jokerHoldings);
  room.actionLog.unshift(`本局结束：${settlementText(room.settlement)}。`);
}

function resolveOpeningTribute(hands: Record<Seat, Card[]>, items: TributeItem[], gameRank: GameRank): TributeState | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const payerSeats = [...new Set(items.map((item) => item.payer))];
  const bigJokerCount = payerSeats
    .flatMap((seat) => hands[seat])
    .filter((card) => card.kind === "joker" && card.rank === "BJ").length;

  if (bigJokerCount >= 2) {
    return {
      status: "anti-tribute",
      items: [],
      reason: "进贡方合计持有两张大王，抗贡成立。",
    };
  }

  return {
    status: "pending",
    items,
    exchanges: [],
    phase: "tribute",
    activeItemIndex: 0,
    activeSeat: items[0].payer,
  };
}

function moveCard(hands: Record<Seat, Card[]>, from: Seat, to: Seat, card: Card): void {
  hands[from] = hands[from].filter((candidate) => candidate.id !== card.id);
  hands[to] = [...hands[to], card];
}

function removeCard(hands: Record<Seat, Card[]>, from: Seat, card: Card): void {
  hands[from] = hands[from].filter((candidate) => candidate.id !== card.id);
}

function assignTributeReceivers(room: RoomState, items: TributeItem[], exchanges: NonNullable<TributeState["exchanges"]>): NonNullable<TributeState["exchanges"]> {
  const receivers = items.map((item) => item.receiver);
  const assigned = [...exchanges].sort(
    (left, right) => tributeCardStrength(right.tributeCard, room.rank) - tributeCardStrength(left.tributeCard, room.rank),
  );

  return assigned.map((exchange, index) => {
    const receiver = receivers[index] ?? exchange.receiver;
    room.hands[receiver] = [...room.hands[receiver], exchange.tributeCard];
    return {
      ...exchange,
      receiver,
    };
  });
}

function selectOpeningTributeCard(room: RoomState, payerSeat: Seat, actingSeat: Seat | undefined, cardIds: string[]): Card {
  if (room.players.find((player) => player.seat === payerSeat)?.isAI === true) {
    return strongestTributeCard(room.hands[payerSeat], room.rank);
  }

  if (actingSeat !== payerSeat) {
    throw new Error("请由进贡方选择进贡牌。");
  }

  const selected = selectCards(room.hands[payerSeat], cardIds);
  if (selected.length !== 1 || isHeartRankWild(selected[0], room.rank)) {
    throw new Error("进贡牌必须是一张非红心级牌。");
  }

  return selected[0];
}

function selectOpeningReturnCard(room: RoomState, receiverSeat: Seat, actingSeat: Seat | undefined, cardIds: string[]): Card {
  if (room.players.find((player) => player.seat === receiverSeat)?.isAI === true) {
    return weakestReturnCard(room.hands[receiverSeat], room.rank);
  }

  if (actingSeat !== receiverSeat) {
    throw new Error("请由受贡方选择还贡牌。");
  }

  const selected = selectCards(room.hands[receiverSeat], cardIds);
  if (selected.length !== 1 || !isLegalReturnCard(selected[0], room.rank)) {
    throw new Error("还贡牌必须是一张 10 以下的非红心级牌。");
  }

  return selected[0];
}

function completeOpeningTribute(room: RoomState, activeCard?: Card): void {
  const tribute = room.openingTribute;
  if (tribute === undefined) {
    return;
  }

  room.openingTribute = {
    ...tribute,
    status: "completed",
    phase: "done",
    activeSeat: undefined,
    activeCard,
  };

  room.initialHands = {
    0: [...room.hands[0]],
    1: [...room.hands[1]],
    2: [...room.hands[2]],
    3: [...room.hands[3]],
  };

  const leader = tribute.exchanges?.[0]?.payer;
  if (leader !== undefined) {
    room.currentTurn = leader;
    room.leaderSeat = leader;
    room.trick = { leadSeat: leader, passSeats: [], plays: [] };
  }
}

function strongestTributeCard(hand: Card[], gameRank: GameRank): Card {
  const card = [...hand]
    .filter((candidate) => !isHeartRankWild(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(right, gameRank) - tributeCardStrength(left, gameRank))[0];

  if (card === undefined) {
    throw new Error("No tribute card is available.");
  }

  return card;
}

function weakestReturnCard(hand: Card[], gameRank: GameRank): Card {
  const preferred = [...hand]
    .filter((candidate) => isLegalReturnCard(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(left, gameRank) - tributeCardStrength(right, gameRank))[0];

  if (preferred !== undefined) {
    return preferred;
  }

  const fallback = [...hand]
    .filter((candidate) => !isHeartRankWild(candidate, gameRank))
    .sort((left, right) => tributeCardStrength(left, gameRank) - tributeCardStrength(right, gameRank))[0];

  if (fallback === undefined) {
    throw new Error("No return card is available.");
  }

  return fallback;
}

function isLegalReturnCard(card: Card, gameRank: GameRank): boolean {
  return card.kind === "suited" && naturalRankValue(card.rank) <= naturalRankValue("10") && !isHeartRankWild(card, gameRank);
}

function tributeCardStrength(card: Card, gameRank: GameRank): number {
  if (card.kind === "joker") {
    return rankStrength(card.rank, gameRank) * 10;
  }

  return rankStrength(card.rank, gameRank) * 10 + suitStrength(card.suit);
}

function suitStrength(suit: Suit): number {
  return { spades: 4, clubs: 3, hearts: 2, diamonds: 1 }[suit];
}

function naturalRankValue(rank: Rank): number {
  return ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].indexOf(rank);
}

function settlementText(settlement: RoundSettlement): string {
  const outcomeText: Record<RoundSettlement["outcome"], string> = {
    "double-down": "双下",
    "single-down": "单下",
    "single-win": "单胜",
  };

  return `${outcomeText[settlement.outcome]}，升 ${settlement.levelStep} 级，下一局打 ${settlement.nextRank}`;
}

function nextPlayableSeat(room: RoomState, fromSeat: Seat): Seat {
  let next = ((fromSeat + 3) % 4) as Seat;
  while (room.finishOrder.includes(next)) {
    next = ((next + 3) % 4) as Seat;
  }
  return next;
}

function passesNeededToReset(room: RoomState): number {
  return Math.max(1, room.players.length - room.finishOrder.length - 1);
}

function resolveTrickWinnerSeat(room: RoomState): Seat {
  const lastPlaySeat = room.trick.lastPlaySeat ?? room.currentTurn;
  if (!room.finishOrder.includes(lastPlaySeat)) {
    return lastPlaySeat;
  }

  const partner = partnerSeat(lastPlaySeat);
  return room.finishOrder.includes(partner) ? nextPlayableSeat(room, lastPlaySeat) : partner;
}

function partnerSeat(seat: number): Seat {
  return ((seat + 2) % 4) as Seat;
}

function playerName(room: RoomState, seat: Seat): string {
  return room.players.find((player) => player.seat === seat)?.name ?? `座位 ${seat}`;
}

function playLabel(group: CardGroup): string {
  const labels: Record<CardGroup["type"], string> = {
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

  return `${labels[group.type]} ${group.cards.length} 张`;
}

function announcements(room: RoomState, humanSeat: Seat): string[] {
  const count = room.hands[humanSeat].length;
  const messages: string[] = [];

  if (count <= 10) {
    messages.push(`剩余 ${count} 张，有问必报。`);
  }

  if (count <= 6) {
    messages.push(`剩余 ${count} 张，主动报牌。`);
  }

  return messages;
}
