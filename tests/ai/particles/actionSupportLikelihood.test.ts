import { beforeAll, describe, expect, test } from "vitest";
import { classifyPlay, canBeatPlay } from "../../../src/game/playRules";
import {
  buildPublicGameIdentity,
  passPublicStableKey,
  playPublicStableKey,
  type PublicActionEvent,
  type PublicActionEventDraft,
  type PublicGameIdentity,
  type PublicSeat,
} from "../../../src/game/publicEvent";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import { createInitialPublicLedger, type HardPublicLedger } from "../../../src/game/publicLedger";
import { createDeck, type Card, type GameRank } from "../../../src/engine/cards";
import { detectGroups, type CardGroup } from "../../../src/engine/groups";
import type {
  ParticleActionObservation,
  ParticleLikelihoodConfig,
  ReplayedParticleState,
} from "../../../src/ai/particles/contracts";

const likelihoodModulePath = "../../../src/ai/particles/actionSupportLikelihood";

type LikelihoodInput = Readonly<{
  observation: ParticleActionObservation;
  gameRank: GameRank;
  config: ParticleLikelihoodConfig;
}>;

type LikelihoodResult =
  | Readonly<{
      ok: true;
      logLikelihood: number;
      support: "supported" | "impossible";
      factor: "forced-pass" | "could-beat-but-passed" | "lead-play" | "follow-play" | "impossible";
    }>
  | Readonly<{ ok: false; reason: "action-support-unavailable" }>;

type LikelihoodModule = Readonly<{
  evaluateActionSupportLikelihood(input: LikelihoodInput): LikelihoodResult;
}>;

type Fixture = Readonly<{
  identity: PublicGameIdentity;
  gameRank: GameRank;
  deck: readonly Card[];
  winningSingle: CardGroup;
  losingSingle: CardGroup;
  specialGroups: readonly CardGroup[];
  config: ParticleLikelihoodConfig;
}>;

let likelihoodModule!: LikelihoodModule;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertLikelihoodModule(value: unknown): LikelihoodModule {
  if (!isRecord(value) || typeof value.evaluateActionSupportLikelihood !== "function") {
    throw new Error("TASK4_LIKELIHOOD_EXPORT_INVALID");
  }
  return {
    evaluateActionSupportLikelihood: value.evaluateActionSupportLikelihood as LikelihoodModule["evaluateActionSupportLikelihood"],
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function requireCard(card: Card | undefined, label: string): Card {
  if (!card) throw new Error(`${label}_MISSING`);
  return card;
}

function groupForCards(cards: readonly Card[], gameRank: GameRank, type?: CardGroup["type"]): CardGroup {
  const groups = detectGroups([...cards], gameRank).filter((group) => type === undefined || group.type === type);
  const expectedIds = [...cards].map((card) => card.id).sort().join(",");
  const matches = groups.filter((group) => group.cards.map((card) => card.id).sort().join(",") === expectedIds);
  if (matches.length !== 1) throw new Error(`GROUP_FIXTURE_NOT_UNIQUE:${type ?? "any"}:${matches.length}`);
  return matches[0]!;
}

function makeConfig(): ParticleLikelihoodConfig {
  return Object.freeze({
    schemaVersion: "d2-particle-likelihood-v1",
    forcedPassLogFactor: -0.25,
    couldBeatButPassedLogFactor: -1.25,
    observedLeadPlayLogFactor: -0.5,
    observedFollowPlayLogFactor: -0.75,
    degradedEssThreshold: 1,
    normalizationTolerance: 1e-9,
    essTolerance: 1e-9,
  });
}

function makeFixture(): Fixture {
  const deck = createDeck();
  const gameRank: GameRank = "2";
  const identity = buildPublicGameIdentity("task4-action-support-fixture", 0, 0, "benchmark-scenario");
  const singles = deck.map((card) => classifyPlay([card], gameRank)).filter((group): group is CardGroup => group !== undefined);
  let winningSingle: CardGroup | undefined;
  let losingSingle: CardGroup | undefined;
  for (const winner of singles.slice(0, 80)) {
    for (const loser of singles.slice(0, 80)) {
      if (winner.id !== loser.id && canBeatPlay(winner, loser, gameRank)) {
        winningSingle = winner;
        losingSingle = loser;
        break;
      }
    }
    if (winningSingle && losingSingle) break;
  }
  if (!winningSingle || !losingSingle) throw new Error("SINGLE_SUPPORT_FIXTURE_MISSING");

  const wildcard = requireCard(deck.find((card) => card.kind === "suited" && card.suit === "hearts" && card.rank === gameRank), "WILDCARD");
  const bombCards = deck.filter((card) => card.kind === "suited" && card.rank === "A").slice(0, 4);
  const straightFlushCards = ["A", "K", "Q", "J", "10"].map((rank) => requireCard(deck.find((card) => card.kind === "suited" && card.suit === "spades" && card.rank === rank && card.copy === 1), `STRAIGHT_FLUSH_${rank}`));
  const jokerCards = deck.filter((card) => card.kind === "joker");
  const specialGroups = [
    groupForCards([wildcard], gameRank, "single"),
    groupForCards(bombCards, gameRank, "bomb"),
    groupForCards(straightFlushCards, gameRank, "straight-flush"),
    groupForCards(jokerCards, gameRank, "joker-bomb"),
  ];
  return { identity, gameRank, deck, winningSingle, losingSingle, specialGroups, config: makeConfig() };
}

function makeLedger(identity: PublicGameIdentity, hands: Readonly<Record<PublicSeat, readonly Card[]>>): HardPublicLedger {
  return createInitialPublicLedger({
    identity,
    initialHandCounts: {
      0: hands[0].length,
      1: hands[1].length,
      2: hands[2].length,
      3: hands[3].length,
    },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { state: "open" },
  });
}

function makeState(
  identity: PublicGameIdentity,
  handsInput: Readonly<Partial<Record<PublicSeat, readonly Card[]>>>,
  currentLastPlay?: CardGroup,
): ReplayedParticleState {
  const hands: Record<PublicSeat, readonly Card[]> = {
    0: Object.freeze([...(handsInput[0] ?? [])]),
    1: Object.freeze([...(handsInput[1] ?? [])]),
    2: Object.freeze([...(handsInput[2] ?? [])]),
    3: Object.freeze([...(handsInput[3] ?? [])]),
  };
  const ledger = makeLedger(identity, hands);
  return deepFreeze({
    hands,
    publicPlayedCardIds: [],
    revealedTransferEvents: [],
    currentTrick: ledger.currentTrick,
    currentLastPlay: currentLastPlay === undefined ? undefined : structuredClone(currentLastPlay),
    handCounts: { 0: hands[0].length, 1: hands[1].length, 2: hands[2].length, 3: hands[3].length },
    finishOrder: [],
    ledger,
  });
}

function makePlayEvent(
  identity: PublicGameIdentity,
  seat: PublicSeat,
  cards: readonly Card[],
  gameRank: GameRank,
  handCountBefore: number,
  eventIndex = 0,
  patternType?: string,
  groupType?: string,
): PublicActionEvent {
  const group = classifyPlay([...cards], gameRank);
  if (!group) throw new Error("PLAY_GROUP_FIXTURE_MISSING");
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "play",
    seat,
    publicStableKey: playPublicStableKey(cards.map((card) => card.id)),
    trickIndex: 0,
    publicCardIds: cards.map((card) => card.id),
    patternType: patternType ?? group.type,
    groupType: groupType ?? group.type,
    handCountBefore,
    handCountAfter: handCountBefore - cards.length,
  };
  return finalizePublicActionEvent(draft);
}

function makePassEvent(identity: PublicGameIdentity, seat: PublicSeat, handCount: number, eventIndex = 0): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "pass",
    seat,
    publicStableKey: passPublicStableKey(),
    trickIndex: 0,
    handCountBefore: handCount,
    handCountAfter: handCount,
  };
  return finalizePublicActionEvent(draft);
}

function makePlayObservation(
  fixture: Fixture,
  seat: PublicSeat,
  hand: readonly Card[],
  cards: readonly Card[],
  currentLastPlay?: CardGroup,
  eventIndex = 0,
  patternType?: string,
  groupType?: string,
): ParticleActionObservation {
  return deepFreeze({
    eventIndex,
    event: makePlayEvent(fixture.identity, seat, cards, fixture.gameRank, hand.length, eventIndex, patternType, groupType),
    stateBeforeEvent: makeState(fixture.identity, { [seat]: hand }, currentLastPlay),
  });
}

function makePassObservation(fixture: Fixture, seat: PublicSeat, hand: readonly Card[], currentLastPlay: CardGroup, eventIndex = 0): ParticleActionObservation {
  return deepFreeze({
    eventIndex,
    event: makePassEvent(fixture.identity, seat, hand.length, eventIndex),
    stateBeforeEvent: makeState(fixture.identity, { [seat]: hand }, currentLastPlay),
  });
}

function evaluate(fixture: Fixture, observation: ParticleActionObservation, config = fixture.config): LikelihoodResult {
  return likelihoodModule.evaluateActionSupportLikelihood({ observation, gameRank: fixture.gameRank, config });
}

function withRuntimeField(input: LikelihoodInput, key: string, value: unknown): LikelihoodInput {
  return { ...input, [key]: value } as unknown as LikelihoodInput;
}

function withFinalStateTrap(observation: ParticleActionObservation): ParticleActionObservation {
  const contaminated = { ...observation } as unknown as ParticleActionObservation & { finalState: unknown };
  Object.defineProperty(contaminated, "finalState", {
    configurable: true,
    get: () => { throw new Error("FINAL_STATE_READ_FORBIDDEN"); },
  });
  return contaminated;
}

function runFixturePreflight(): void {
  const fixture = makeFixture();
  expect(fixture.deck).toHaveLength(108);
  expect(fixture.specialGroups.map((group) => group.type)).toEqual(["single", "bomb", "straight-flush", "joker-bomb"]);
  expect(fixture.specialGroups[0]!.wildcards).toHaveLength(1);
  const lead = makePlayObservation(fixture, 0, [fixture.winningSingle.cards[0]!], [fixture.winningSingle.cards[0]!]);
  const follow = makePlayObservation(fixture, 1, [fixture.winningSingle.cards[0]!], [fixture.winningSingle.cards[0]!], fixture.losingSingle);
  expect(lead.event.seat).toBe(0);
  expect(follow.event.seat).toBe(1);
  expect(lead.stateBeforeEvent.hands[0]).toHaveLength(1);
  expect(follow.stateBeforeEvent.hands[1]).toHaveLength(1);
}

beforeAll(async () => {
  runFixturePreflight();
  try {
    const loaded = await import(/* @vite-ignore */ likelihoodModulePath);
    likelihoodModule = assertLikelihoodModule(loaded);
  } catch {
    throw new Error(`TASK4_PRODUCTION_MODULE_MISSING:${likelihoodModulePath}`);
  }
});

describe("particle action support likelihood", () => {
  test("returns forced-pass factor when no legal response exists", () => {
    const fixture = makeFixture();
    const observation = makePassObservation(fixture, 0, [fixture.losingSingle.cards[0]!], fixture.winningSingle);
    const result = evaluate(fixture, observation);
    expect(result).toEqual({ ok: true, logLikelihood: fixture.config.forcedPassLogFactor, support: "supported", factor: "forced-pass" });
    const malformedEvent = { ...observation.event, kind: "malformed" } as unknown as PublicActionEvent;
    expect(() => evaluate(fixture, { ...observation, event: malformedEvent })).toThrow(TypeError);
    expect(() => evaluate(fixture, observation, { ...fixture.config, forcedPassLogFactor: Number.NaN })).toThrow(TypeError);
  });

  test("returns configured penalty when a legal response exists but public action is pass", () => {
    const fixture = makeFixture();
    const observation = makePassObservation(fixture, 0, [fixture.winningSingle.cards[0]!], fixture.losingSingle);
    expect(evaluate(fixture, observation)).toEqual({ ok: true, logLikelihood: fixture.config.couldBeatButPassedLogFactor, support: "supported", factor: "could-beat-but-passed" });
  });

  test("returns lead factor for supported legal lead play", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    expect(evaluate(fixture, makePlayObservation(fixture, 0, [card], [card]))).toEqual({ ok: true, logLikelihood: fixture.config.observedLeadPlayLogFactor, support: "supported", factor: "lead-play" });
  });

  test("returns follow factor for supported legal follow play", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    expect(evaluate(fixture, makePlayObservation(fixture, 1, [card], [card], fixture.losingSingle))).toEqual({ ok: true, logLikelihood: fixture.config.observedFollowPlayLogFactor, support: "supported", factor: "follow-play" });
  });

  test("returns negative infinity for a play whose physical card is absent", () => {
    const fixture = makeFixture();
    const absent = fixture.deck.find((card) => card.id !== fixture.winningSingle.cards[0]!.id)!;
    const observation = makePlayObservation(fixture, 0, [fixture.winningSingle.cards[0]!], [absent]);
    expect(evaluate(fixture, observation)).toEqual({ ok: true, logLikelihood: Number.NEGATIVE_INFINITY, support: "impossible", factor: "impossible" });
  });

  test("returns negative infinity for a non-beating follow play", () => {
    const fixture = makeFixture();
    const card = fixture.losingSingle.cards[0]!;
    const observation = makePlayObservation(fixture, 1, [card], [card], fixture.winningSingle);
    expect(evaluate(fixture, observation)).toEqual({ ok: true, logLikelihood: Number.NEGATIVE_INFINITY, support: "impossible", factor: "impossible" });
  });

  test("keeps wildcard, bomb, straight-flush and joker-bomb as public group support cases", () => {
    const fixture = makeFixture();
    for (const group of fixture.specialGroups) {
      const observation = makePlayObservation(fixture, 0, group.cards, group.cards, undefined, 0, group.type, group.type);
      expect(evaluate(fixture, observation)).toEqual({ ok: true, logLikelihood: fixture.config.observedLeadPlayLogFactor, support: "supported", factor: "lead-play" });
    }
  });

  test("does not make an impossible action finite through smoothing", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    const unavailable = makePlayObservation(fixture, 0, [card], [card], undefined, 0, "unsupported", "unsupported");
    expect(evaluate(fixture, unavailable)).toEqual({ ok: false, reason: "action-support-unavailable" });
    const impossible = makePlayObservation(fixture, 1, [fixture.losingSingle.cards[0]!], [fixture.losingSingle.cards[0]!], fixture.winningSingle);
    const result = evaluate(fixture, impossible);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.logLikelihood).toBe(Number.NEGATIVE_INFINITY);
  });

  test("does not call HandPlanner or formal ActionEvaluator", async () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    expect(evaluate(fixture, makePlayObservation(fixture, 0, [card], [card]))).toMatchObject({ ok: true, support: "supported" });
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/ai/particles/actionSupportLikelihood.ts", "utf8");
    expect(source).not.toMatch(/HandPlanner|generateHandPlans|ActionEvaluator|evaluateActionCandidate/);
  });

  test("uses the observation stateBeforeEvent instead of final state", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    const observation = makePlayObservation(fixture, 0, [card], [card]);
    const contaminated = { ...observation, stateBeforeEvent: observation.stateBeforeEvent, finalState: makeState(fixture.identity, { 0: [] }) } as unknown as ParticleActionObservation;
    expect(evaluate(fixture, contaminated)).toMatchObject({ ok: true, support: "supported", factor: "lead-play" });
  });

  test("hidden transfer changes later pass and play support", () => {
    const fixture = makeFixture();
    const winner = fixture.winningSingle.cards[0]!;
    const loser = fixture.losingSingle.cards[0]!;
    const beforeTransfer = makePassObservation(fixture, 1, [winner], fixture.losingSingle, 5);
    const afterTransfer = makePassObservation(fixture, 1, [loser], fixture.losingSingle, 5);
    expect(evaluate(fixture, beforeTransfer)).toMatchObject({ ok: true, factor: "could-beat-but-passed" });
    expect(evaluate(fixture, afterTransfer)).toMatchObject({ ok: true, factor: "forced-pass" });
    const laterPlay = makePlayObservation(fixture, 1, [winner], [winner], fixture.losingSingle, 6);
    expect(evaluate(fixture, laterPlay)).toMatchObject({ ok: true, factor: "follow-play" });
  });

  test("does not use a final-state shortcut", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    const observation = withFinalStateTrap(makePlayObservation(fixture, 0, [card], [card]));
    expect(() => evaluate(fixture, observation)).not.toThrow("FINAL_STATE_READ_FORBIDDEN");
  });

  test("derives historical actor from observation event seat", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    const observation = makePlayObservation(fixture, 1, [card], [card]);
    expect(evaluate(fixture, observation)).toMatchObject({ ok: true, support: "supported", factor: "lead-play" });
  });

  test("evaluates actions from different seats against their own event-time hands", () => {
    const fixture = makeFixture();
    const first = fixture.winningSingle.cards[0]!;
    const second = fixture.losingSingle.cards[0]!;
    const seatZero = makePlayObservation(fixture, 0, [first], [first]);
    const seatOne = makePlayObservation(fixture, 1, [second], [second]);
    expect(evaluate(fixture, seatZero)).toMatchObject({ ok: true, support: "supported" });
    expect(evaluate(fixture, seatOne)).toMatchObject({ ok: true, support: "supported" });
  });

  test("current decision actingSeat does not replace historical event seat", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    const observation = makePlayObservation(fixture, 1, [card], [card]);
    const input = withRuntimeField({ observation, gameRank: fixture.gameRank, config: fixture.config }, "actingSeat", 0);
    expect(likelihoodModule.evaluateActionSupportLikelihood(input)).toMatchObject({ ok: true, support: "supported", factor: "lead-play" });
  });

  test("likelihood API exposes no caller-supplied historical seat override", () => {
    const fixture = makeFixture();
    const card = fixture.winningSingle.cards[0]!;
    const observation = makePlayObservation(fixture, 1, [card], [card]);
    const input = withRuntimeField({ observation, gameRank: fixture.gameRank, config: fixture.config }, "historicalSeat", 0);
    expect(likelihoodModule.evaluateActionSupportLikelihood(input)).toMatchObject({ ok: true, support: "supported", factor: "lead-play" });
  });
});
