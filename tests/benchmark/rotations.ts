import { createHash } from "node:crypto";
import { createRoom, type RoomState, type Seat, type TrickPlay } from "../../src/game/room";
import type { RoundSettlement, TributeState } from "../../src/game/settlement";
import type { BenchmarkConfig } from "./contracts";
import { canonicalJson } from "./contracts";
import { canonicalStrategyId } from "./strategies";

export type Allocation = "AB" | "BA";

export interface BenchmarkGameTask {
  config: BenchmarkConfig;
  configHash: string;
  seed: number;
  rotation: Seat;
  allocation: Allocation;
  matchId: string;
  room?: RoomState;
}

export function rotateRoom(room: RoomState, rotation: Seat): RoomState {
  const source = structuredClone(room);
  const seat = (value: Seat | undefined): Seat | undefined => value === undefined ? undefined : mapSeat(value, rotation);
  const hands = emptySeatMap<RoomState["hands"][Seat]>();
  const initialHands = emptySeatMap<RoomState["initialHands"][Seat]>();
  for (const from of seats()) {
    hands[mapSeat(from, rotation)] = source.hands[from];
    initialHands[mapSeat(from, rotation)] = source.initialHands[from];
  }

  const players = source.players.map((player) => {
    const targetSeat = mapSeat(player.seat, rotation);
    return { ...player, seat: targetSeat, team: (targetSeat % 2 === 0 ? 0 : 1) as 0 | 1 };
  }).sort((left, right) => left.seat - right.seat);

  const transformPlay = (play: TrickPlay): TrickPlay => ({ ...play, seat: mapSeat(play.seat, rotation) });
  const trick = {
    ...source.trick,
    leadSeat: mapSeat(source.trick.leadSeat, rotation),
    lastPlaySeat: seat(source.trick.lastPlaySeat),
    passSeats: source.trick.passSeats.map((candidate) => mapSeat(candidate, rotation)),
    plays: source.trick.plays.map(transformPlay),
  };

  return {
    ...source,
    hands,
    initialHands,
    players,
    currentTurn: mapSeat(source.currentTurn, rotation),
    leaderSeat: mapSeat(source.leaderSeat, rotation),
    trick,
    finishOrder: source.finishOrder.map((candidate) => mapSeat(candidate, rotation)),
    playHistory: source.playHistory.map(transformPlay),
    openingTribute: source.openingTribute === undefined ? undefined : rotateTribute(source.openingTribute, rotation),
    settlement: source.settlement === undefined ? undefined : rotateSettlement(source.settlement, source.finishOrder, rotation),
    aiPlans: rotateSeatRecord(source.aiPlans, rotation, (plan, targetSeat) => plan === undefined ? undefined : { ...plan, seat: targetSeat }),
    aiRuntime: rotateSeatRecord(source.aiRuntime, rotation, (runtime) => runtime),
  };
}

export function buildGamesForSeed(config: BenchmarkConfig, seed: number): BenchmarkGameTask[] {
  const canonicalConfig = { ...config, strategyA: canonicalStrategyId(config.strategyA), strategyB: canonicalStrategyId(config.strategyB) };
  const configHash = hash(canonicalJson({
    benchmarkVersion: canonicalConfig.benchmarkVersion,
    rank: canonicalConfig.rank,
    strategyA: canonicalConfig.strategyA,
    strategyB: canonicalConfig.strategyB,
  }));
  const games: BenchmarkGameTask[] = [];
  for (const rotation of seats()) {
    for (const allocation of ["AB", "BA"] as const) {
      const baseRoom = createRoom({ rank: canonicalConfig.rank, seed });
      const room = rotateRoom(baseRoom, rotation);
      const matchup = `${canonicalConfig.strategyA}-vs-${canonicalConfig.strategyB}`;
      const matchId = canonicalJson({ matchup, allocation, configHash, rotation, seed });
      games.push({ config: canonicalConfig, configHash, seed, rotation, allocation, matchId, room });
    }
  }
  return games;
}

export function mapSeat(value: Seat, rotation: Seat): Seat {
  return ((value + rotation) % 4) as Seat;
}

function rotateTribute(tribute: TributeState, rotation: Seat): TributeState {
  return {
    ...tribute,
    items: tribute.items.map((item) => ({ payer: mapSeat(item.payer, rotation), receiver: mapSeat(item.receiver, rotation) })),
    exchanges: tribute.exchanges?.map((exchange) => ({ ...exchange, payer: mapSeat(exchange.payer, rotation), receiver: mapSeat(exchange.receiver, rotation) })),
    activeSeat: tribute.activeSeat === undefined ? undefined : mapSeat(tribute.activeSeat, rotation),
  };
}

function rotateSettlement(settlement: RoundSettlement, finishOrder: Seat[], rotation: Seat): RoundSettlement {
  return {
    ...settlement,
    winningTeam: finishOrder.length > 0 && mapSeat(finishOrder[0]!, rotation) % 2 === 0 ? 0 : 1,
    tribute: rotateTribute(settlement.tribute, rotation),
  };
}

function rotateSeatRecord<T, U>(record: Partial<Record<Seat, T>>, rotation: Seat, transform: (value: T | undefined, targetSeat: Seat) => U | undefined): Partial<Record<Seat, U>> {
  const result: Partial<Record<Seat, U>> = {};
  for (const sourceSeat of seats()) {
    const targetSeat = mapSeat(sourceSeat, rotation);
    const value = transform(record[sourceSeat], targetSeat);
    if (value !== undefined) result[targetSeat] = value;
  }
  return result;
}

function emptySeatMap<T>(): Record<Seat, T> {
  return {} as Record<Seat, T>;
}

function seats(): Seat[] {
  return [0, 1, 2, 3];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
