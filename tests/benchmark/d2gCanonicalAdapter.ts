import { createRoom, type RoomState, type Seat } from "../../src/game/room";
import { buildPublicGameIdentity, type PublicActionEventDraft, type PublicGameIdentity } from "../../src/game/publicEvent";
import { finalizePublicActionEvent, sha256Bytes } from "../../src/game/publicEventHash";
import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
import type { GameRank } from "../../src/engine/cards";
import type { TributeItem } from "../../src/game/settlement";
import type { D2GTreatmentProfile } from "../../src/ai/d2g/treatmentContracts";
import { canonicalJson } from "./contracts";

export type D2GAllocation = "AB" | "BA";
export type D2GPartnershipStrategy = "baseline" | "treatment";
export type D2GTeam = "A" | "B";

export type D2GCanonicalHeadToHeadTaskInput = Readonly<{
  baseSeed: number;
  rank: GameRank;
  rotation: Seat;
  allocation: D2GAllocation;
  profile: D2GTreatmentProfile;
  profileHash?: string;
  matchup: string;
  configHash: string;
  pendingTributeItems?: readonly TributeItem[];
}>;

export type D2GCanonicalHeadToHeadTask = Readonly<{
  schemaVersion: "d2g-canonical-head-to-head-task-v1";
  baseSeed: number;
  rank: GameRank;
  rotation: Seat;
  allocation: D2GAllocation;
  matchup: string;
  configHash: string;
  profile: D2GTreatmentProfile;
  profileHash: string;
  rotationPairKey: string;
  gameId: string;
  publicIdentity: PublicGameIdentity;
  baselineTeam: D2GTeam;
  treatmentTeam: D2GTeam;
  strategyAssignment: Readonly<Record<Seat, D2GPartnershipStrategy>>;
  room: RoomState;
  initialPublicLedgerHash: string;
}>;

export type D2GCanonicalHeadToHeadTaskMatrixInput = Omit<D2GCanonicalHeadToHeadTaskInput, "rotation" | "allocation">;

export function createD2GCanonicalHeadToHeadTask(input: D2GCanonicalHeadToHeadTaskInput): D2GCanonicalHeadToHeadTask {
  assertTaskInput(input);
  const profileHash = input.profileHash ?? input.profile.configurationHash;
  if (profileHash !== input.profile.configurationHash) throw new Error("D2G_PROFILE_HASH_MISMATCH");

  const baselineTeam: D2GTeam = input.allocation === "AB" ? "A" : "B";
  const treatmentTeam: D2GTeam = baselineTeam === "A" ? "B" : "A";
  const rotationPairKey = hashId(canonicalJson({
    schemaVersion: "d2g-rotation-pair-v1",
    baseSeed: input.baseSeed,
    rank: input.rank,
    rotation: input.rotation,
    matchup: input.matchup,
    configHash: input.configHash,
    profileHash,
  }));
  const gameId = `d2g:${hashId(canonicalJson({ schemaVersion: "d2g-game-v1", rotationPairKey, allocation: input.allocation }))}`;
  const publicIdentity = buildPublicGameIdentity(gameId, 0, 0, "benchmark-scenario");
  const baseRoom = createRoom({
    rank: input.rank,
    seed: input.baseSeed,
    publicIdentity,
    ...(input.pendingTributeItems === undefined ? {} : { pendingTributeItems: [...input.pendingTributeItems] }),
  });
  const room = rotateInitialCanonicalRoom(baseRoom, input.rotation);
  room.players = room.players.map((player) => ({ ...player, isAI: true }));
  const strategyAssignment = {
    0: strategyForSeat(0, baselineTeam),
    1: strategyForSeat(1, baselineTeam),
    2: strategyForSeat(2, baselineTeam),
    3: strategyForSeat(3, baselineTeam),
  } satisfies Record<Seat, D2GPartnershipStrategy>;
  const initialLedger = room.initialPublicLedger ?? room.publicLedger;
  if (initialLedger === undefined) throw new Error("D2G_CANONICAL_LEDGER_MISSING");

  return Object.freeze({
    schemaVersion: "d2g-canonical-head-to-head-task-v1",
    baseSeed: input.baseSeed,
    rank: input.rank,
    rotation: input.rotation,
    allocation: input.allocation,
    matchup: input.matchup,
    configHash: input.configHash,
    profile: input.profile,
    profileHash,
    rotationPairKey,
    gameId,
    publicIdentity,
    baselineTeam,
    treatmentTeam,
    strategyAssignment: Object.freeze(strategyAssignment),
    room,
    initialPublicLedgerHash: canonicalPublicLedgerHash(initialLedger),
  });
}

export function buildD2GCanonicalHeadToHeadTasks(input: D2GCanonicalHeadToHeadTaskMatrixInput): D2GCanonicalHeadToHeadTask[] {
  return ([0, 1, 2, 3] as const).flatMap((rotation) => (["AB", "BA"] as const).map((allocation) => createD2GCanonicalHeadToHeadTask({
    ...input,
    rotation,
    allocation,
  })));
}

function assertTaskInput(input: D2GCanonicalHeadToHeadTaskInput): void {
  if (!Number.isSafeInteger(input.baseSeed) || input.baseSeed < 0) throw new Error("D2G_BASE_SEED_INVALID");
  if (![0, 1, 2, 3].includes(input.rotation)) throw new Error("D2G_ROTATION_INVALID");
  if (input.matchup.length === 0 || input.configHash.length === 0) throw new Error("D2G_TASK_METADATA_INVALID");
}

function strategyForSeat(seat: Seat, baselineTeam: D2GTeam): D2GPartnershipStrategy {
  return (seat % 2 === 0 ? "A" : "B") === baselineTeam ? "baseline" : "treatment";
}

function rotateInitialCanonicalRoom(source: RoomState, rotation: Seat): RoomState {
  const room = structuredClone(source);
  const mapSeat = (seat: Seat): Seat => ((seat + rotation) % 4) as Seat;
  const hands = {} as RoomState["hands"];
  const initialHands = {} as RoomState["initialHands"];
  for (const seat of [0, 1, 2, 3] as const) {
    hands[mapSeat(seat)] = room.hands[seat];
    initialHands[mapSeat(seat)] = room.initialHands[seat];
  }
  room.hands = hands;
  room.initialHands = initialHands;
  room.players = room.players.map((player) => ({
    ...player,
    seat: mapSeat(player.seat),
    team: (mapSeat(player.seat) % 2 === 0 ? 0 : 1) as 0 | 1,
  })).sort((left, right) => left.seat - right.seat);
  room.currentTurn = mapSeat(room.currentTurn);
  room.leaderSeat = mapSeat(room.leaderSeat);
  room.trick = {
    ...room.trick,
    leadSeat: mapSeat(room.trick.leadSeat),
    lastPlaySeat: room.trick.lastPlaySeat === undefined ? undefined : mapSeat(room.trick.lastPlaySeat),
    passSeats: room.trick.passSeats.map(mapSeat),
    plays: room.trick.plays.map((play) => ({ ...play, seat: mapSeat(play.seat) })),
  };
  room.playHistory = room.playHistory.map((play) => ({ ...play, seat: mapSeat(play.seat) }));
  room.finishOrder = room.finishOrder.map(mapSeat);
  if (room.openingTribute !== undefined) {
    room.openingTribute = {
      ...room.openingTribute,
      items: room.openingTribute.items.map((item) => ({ payer: mapSeat(item.payer), receiver: mapSeat(item.receiver) })),
      exchanges: room.openingTribute.exchanges?.map((exchange) => ({
        ...exchange,
        payer: mapSeat(exchange.payer),
        receiver: mapSeat(exchange.receiver),
      })),
      activeSeat: room.openingTribute.activeSeat === undefined ? undefined : mapSeat(room.openingTribute.activeSeat),
    };
  }
  const publicEvents = room.publicEvents?.map((event) => rotatePublicEvent(event, rotation));
  if (publicEvents !== undefined) room.publicEvents = publicEvents;
  if (room.publicLedger !== undefined) room.publicLedger = rotateInitialLedger(room.publicLedger, rotation, publicEvents);
  if (room.initialPublicLedger !== null) room.initialPublicLedger = rotateInitialLedger(room.initialPublicLedger, rotation, publicEvents);
  return room;
}

function rotatePublicEvent(event: NonNullable<RoomState["publicEvents"]>[number], rotation: Seat): NonNullable<RoomState["publicEvents"]>[number] {
  const mapSeat = (seat: Seat): Seat => ((seat + rotation) % 4) as Seat;
  const { publicPayloadHash: _publicPayloadHash, ...draft } = event;
  const rotated: Record<string, unknown> = {
    ...draft,
    seat: mapSeat(event.seat),
  };
  if (event.leadSeat !== undefined) rotated.leadSeat = mapSeat(event.leadSeat);
  if (event.lastPlaySeat !== undefined) rotated.lastPlaySeat = mapSeat(event.lastPlaySeat);
  if (event.kind === "tribute" || event.kind === "return") {
    rotated.fromSeat = mapSeat(event.fromSeat);
    rotated.toSeat = mapSeat(event.toSeat);
    rotated.handCountChanges = {
      [mapSeat(0)]: event.handCountChanges[0],
      [mapSeat(1)]: event.handCountChanges[1],
      [mapSeat(2)]: event.handCountChanges[2],
      [mapSeat(3)]: event.handCountChanges[3],
    };
  }
  return finalizePublicActionEvent(rotated as PublicActionEventDraft);
}

function rotateInitialLedger(
  ledger: NonNullable<RoomState["publicLedger"]>,
  rotation: Seat,
  publicEvents: readonly NonNullable<RoomState["publicEvents"]>[number][] = [],
): NonNullable<RoomState["publicLedger"]> {
  const mapSeat = (seat: Seat): Seat => ((seat + rotation) % 4) as Seat;
  const seenEventHashes = { ...ledger.seenEventHashes };
  for (const event of publicEvents) seenEventHashes[event.eventIndex] = event.publicPayloadHash;
  return {
    ...ledger,
    seenEventHashes,
    revealedTransferEvents: ledger.revealedTransferEvents.map((event) => ({
      eventIndex: event.eventIndex,
      kind: event.kind,
      ...(event.cardId === undefined ? {} : { cardId: event.cardId }),
      fromSeat: mapSeat(event.fromSeat),
      toSeat: mapSeat(event.toSeat),
    })),
    currentTrick: {
      ...ledger.currentTrick,
      leadSeat: mapSeat(ledger.currentTrick.leadSeat),
      lastPlaySeat: ledger.currentTrick.lastPlaySeat === undefined ? undefined : mapSeat(ledger.currentTrick.lastPlaySeat),
      passSeats: ledger.currentTrick.passSeats.map(mapSeat),
    },
    finishOrder: ledger.finishOrder.map(mapSeat),
    recentActionSummaries: ledger.recentActionSummaries.map((summary) => ({
      ...summary,
      ...(typeof summary.seat === "number" ? { seat: mapSeat(summary.seat as Seat) } : {}),
    })),
  };
}

function hashId(value: string): string {
  return sha256Bytes(new TextEncoder().encode(value));
}
