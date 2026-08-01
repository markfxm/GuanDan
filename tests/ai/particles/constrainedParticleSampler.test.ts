import { beforeAll, describe, expect, test, vi } from "vitest";
import {
  buildPublicGameIdentity,
  finishPublicStableKey,
  passPublicStableKey,
  playPublicStableKey,
  trickClearPublicStableKey,
  tributePublicStableKey,
  type PublicActionEvent,
  type PublicActionEventDraft,
  type PublicGameIdentity,
  type PublicSeat,
} from "../../../src/game/publicEvent";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import { applyPublicEvent, canonicalPublicLedgerHash, createInitialPublicLedger, type HardPublicLedger } from "../../../src/game/publicLedger";
import { createDeck, type Card, type GameRank } from "../../../src/engine/cards";
import { detectGroups, type CardGroup } from "../../../src/engine/groups";
import {
  canonicalParticleScenarioBytes,
  particleScenarioIdentity,
} from "../../../src/ai/particles/canonicalDeal";
import {
  validateCanonicalInitialDeal,
} from "../../../src/ai/particles/particleConservation";
import {
  deriveActingSeatInitialDealConstraints,
  replayParticleScenario,
} from "../../../src/ai/particles/publicEventDealReplay";
import type {
  CanonicalInitialDeal,
  ParticleReplayResult,
  ParticleScenario,
} from "../../../src/ai/particles/contracts";

type ActingSeatInitialDealConstraints = Readonly<{
  terminalOwnCurrentHand: readonly Card[];
  ownPublicPlayedCardIds: readonly string[];
  knownRevealedIncomingTransferCardIds: readonly string[];
  knownRevealedOutgoingTransferCardIds: readonly string[];
  unresolvedIncomingTransferSlotCount: number;
  unresolvedOutgoingTransferSlotCount: number;
  expectedInitialHandCount: number;
  expectedCurrentHandCount: number;
  publicEventConsistency: Readonly<{
    historyFirstEventIndex: 0;
    historyLastEventIndex: number;
    expectedFinalEventIndex: number;
    expectedFinalLedgerHash: string;
  }>;
  deterministicInitialHand?: readonly Card[];
}>;

type HiddenTransferAssignment = Readonly<{
  eventIndex: number;
  eventKind: "tribute" | "return";
  fromSeat: PublicSeat;
  toSeat: PublicSeat;
  cardId: string;
}>;

const rngModulePath = "../../../src/ai/particles/deterministicParticleRng";
const samplerModulePath = "../../../src/ai/particles/constrainedParticleSampler";
const canonicalDealModulePath = "../../../src/ai/particles/canonicalDeal";

type Rng = Readonly<{
  nextUint32(): number;
  nextIndex(exclusiveUpperBound: number): number;
}>;

type RngModule = Readonly<{
  createDeterministicParticleRng(seed: number, maxIndexDraws: number): Rng;
}>;

type SamplerInput = Readonly<{
  publicIdentity: PublicGameIdentity;
  constraints: ActingSeatInitialDealConstraints;
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  particleSeed: number;
  particleCount: number;
  maxSamplingAttempts: number;
  maxIndexDraws: number;
  samplerConfigVersion: string;
}>;

type SamplerResult = Readonly<{
  scenarios: readonly ParticleScenario[];
  attempts: number;
  duplicateCount: number;
}>;

type SamplerModule = Readonly<{
  sampleConstrainedParticleScenarios(input: SamplerInput): SamplerResult;
}>;

type FreshSampler = Readonly<{
  sampler: SamplerModule;
  cleanup(): void;
}>;

type Fixture = Readonly<{
  identity: PublicGameIdentity;
  gameRank: GameRank;
  dealA: CanonicalInitialDeal;
  dealB: CanonicalInitialDeal;
  scenarioA: ParticleScenario;
  scenarioB: ParticleScenario;
  initialLedger: HardPublicLedger;
  baseLedger: HardPublicLedger;
  publicHistoryEvents: readonly PublicActionEvent[];
  pendingPublicEvents: readonly PublicActionEvent[];
  finalLedger: HardPublicLedger;
  finalLedgerHash: string;
  ownCurrentHand: readonly Card[];
  constraints: ActingSeatInitialDealConstraints;
  playCard: Card;
  laterPlayCard: Card;
  hiddenTributeCardA: Card;
  hiddenTributeCardB: Card;
  returnedCardA: Card;
  returnedCardB: Card;
}>;

let rngModule!: RngModule;
let samplerModule!: SamplerModule;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRngModule(value: unknown): RngModule {
  if (!isRecord(value) || typeof value.createDeterministicParticleRng !== "function") {
    throw new Error("TASK3_RNG_EXPORT_INVALID");
  }
  return {
    createDeterministicParticleRng: value.createDeterministicParticleRng as RngModule["createDeterministicParticleRng"],
  };
}

function assertSamplerModule(value: unknown): SamplerModule {
  if (!isRecord(value) || typeof value.sampleConstrainedParticleScenarios !== "function") {
    throw new Error("TASK3_SAMPLER_EXPORT_INVALID");
  }
  return {
    sampleConstrainedParticleScenarios: value.sampleConstrainedParticleScenarios as SamplerModule["sampleConstrainedParticleScenarios"],
  };
}

async function importFreshSamplerWithMocks(configureMocks: () => void): Promise<FreshSampler> {
  vi.resetModules();
  configureMocks();
  try {
    const loaded = await import(/* @vite-ignore */ samplerModulePath);
    const sampler = assertSamplerModule(loaded);
    let cleaned = false;
    return {
      sampler,
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        vi.doUnmock(rngModulePath);
        vi.doUnmock(canonicalDealModulePath);
        vi.resetModules();
      },
    };
  } catch (error) {
    vi.doUnmock(rngModulePath);
    vi.doUnmock(canonicalDealModulePath);
    vi.resetModules();
    throw error;
  }
}

function makeDeal(hands: Readonly<Record<PublicSeat, readonly Card[]>>): CanonicalInitialDeal {
  return { schemaVersion: "d2-particle-initial-deal-v1", hands };
}

function makePlayEvent(identity: PublicGameIdentity, eventIndex: number, seat: PublicSeat, trickIndex: number, cardId: string, handCountBefore: number): PublicActionEvent {
  const publicCardIds = [cardId];
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "play",
    seat,
    publicStableKey: playPublicStableKey(publicCardIds),
    trickIndex,
    publicCardIds,
    patternType: "single",
    groupType: "single",
    handCountBefore,
    handCountAfter: handCountBefore - 1,
  };
  return finalizePublicActionEvent(draft);
}

function makePassEvent(identity: PublicGameIdentity, eventIndex: number, seat: PublicSeat, trickIndex: number, handCount: number): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "pass",
    seat,
    publicStableKey: passPublicStableKey(),
    trickIndex,
    handCountBefore: handCount,
    handCountAfter: handCount,
  };
  return finalizePublicActionEvent(draft);
}

function makeTransferEvent(
  identity: PublicGameIdentity,
  eventIndex: number,
  kind: "tribute" | "return",
  fromSeat: PublicSeat,
  toSeat: PublicSeat,
  trickIndex: number,
  handCountChanges: Readonly<Record<PublicSeat, number>>,
): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind,
    seat: fromSeat,
    publicStableKey: tributePublicStableKey(kind, fromSeat, toSeat),
    trickIndex,
    publicCardIds: [],
    fromSeat,
    toSeat,
    handCountChanges,
  };
  return finalizePublicActionEvent(draft);
}

function makeTrickClearEvent(identity: PublicGameIdentity, eventIndex: number, trickIndex: number, leadSeat: PublicSeat): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "trick-clear",
    seat: leadSeat,
    publicStableKey: trickClearPublicStableKey(trickIndex, trickIndex + 1),
    trickIndex,
    leadSeat,
  };
  return finalizePublicActionEvent(draft);
}

function makeFinishEvent(identity: PublicGameIdentity, eventIndex: number, seat: PublicSeat, trickIndex: number, remainingHandCount: number): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex,
    kind: "finish",
    seat,
    publicStableKey: finishPublicStableKey(1, "round-settlement"),
    trickIndex,
    finishPosition: 1,
    remainingHandCount,
    finishReason: "round-settlement",
  };
  return finalizePublicActionEvent(draft);
}

function applyEvents(initialLedger: HardPublicLedger, events: readonly PublicActionEvent[]): HardPublicLedger {
  let ledger = initialLedger;
  for (const event of events) {
    const result = applyPublicEvent(ledger, event);
    if (!result.ok) throw new Error(`FIXTURE_EVENT_REJECTED:${result.error}`);
    ledger = result.ledger;
  }
  return ledger;
}

function makeAlternativeDeal(deck: readonly Card[]): CanonicalInitialDeal {
  const handZero: Card[] = [deck[0]!, ...deck.slice(3, 27), deck[27]!, deck[54]!];
  const handZeroIds = new Set(handZero.map((card) => card.id));
  const remaining = deck.filter((card) => !handZeroIds.has(card.id));
  const handOne: Card[] = [
    deck[2]!,
    deck[29]!,
    ...remaining.filter((card) => card.id !== deck[2]!.id && card.id !== deck[29]!.id).slice(0, 25),
  ];
  const used = new Set([...handZero, ...handOne].map((card) => card.id));
  const finalSeats = deck.filter((card) => !used.has(card.id));
  if (handZero.length !== 27 || handOne.length !== 27 || finalSeats.length !== 54) {
    throw new Error("ALTERNATIVE_DEAL_SHAPE_INVALID");
  }
  return makeDeal({
    0: handZero,
    1: handOne,
    2: finalSeats.slice(0, 27),
    3: finalSeats.slice(27, 54),
  });
}

function makeFixture(): Fixture {
  const deck = createDeck();
  const identity = buildPublicGameIdentity("task3-sampler-fixture", 0, 0, "benchmark-scenario");
  const gameRank: GameRank = "K";
  const dealA = makeDeal({
    0: deck.slice(0, 27),
    1: deck.slice(27, 54),
    2: deck.slice(54, 81),
    3: deck.slice(81, 108),
  });
  const dealB = makeAlternativeDeal(deck);
  const playCard = deck[0]!;
  const hiddenTributeCardA = deck[1]!;
  const hiddenTributeCardB = deck[54]!;
  const returnedCardA = deck[27]!;
  const returnedCardB = deck[2]!;
  const laterPlayCard = deck[29]!;
  const initialLedger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { state: "open" },
  });
  const publicHistoryEvents: readonly PublicActionEvent[] = [
    makeTransferEvent(identity, 0, "tribute", 0, 1, 0, { 0: -1, 1: 1, 2: 0, 3: 0 }),
    makeTransferEvent(identity, 1, "return", 1, 0, 0, { 0: 1, 1: -1, 2: 0, 3: 0 }),
    makePlayEvent(identity, 2, 0, 0, playCard.id, 27),
    makePassEvent(identity, 3, 1, 0, 27),
    makeTrickClearEvent(identity, 4, 0, 1),
    makePlayEvent(identity, 5, 1, 1, laterPlayCard.id, 27),
    makePassEvent(identity, 6, 2, 1, 27),
    makeFinishEvent(identity, 7, 0, 1, 26),
  ];
  const baseLedger = applyEvents(initialLedger, publicHistoryEvents.slice(0, 5));
  const finalLedger = applyEvents(initialLedger, publicHistoryEvents);
  const ownCurrentHand = [
    ...dealA.hands[0].filter((card) => card.id !== playCard.id && card.id !== hiddenTributeCardA.id),
    returnedCardA,
  ];
  const scenarioA: ParticleScenario = {
    schemaVersion: "d2-particle-scenario-v1",
    initialDeal: dealA,
    hiddenTransferAssignments: [
      { eventIndex: 0, eventKind: "tribute", fromSeat: 0, toSeat: 1, cardId: hiddenTributeCardA.id },
      { eventIndex: 1, eventKind: "return", fromSeat: 1, toSeat: 0, cardId: returnedCardA.id },
    ],
  };
  const scenarioB: ParticleScenario = {
    schemaVersion: "d2-particle-scenario-v1",
    initialDeal: dealB,
    hiddenTransferAssignments: [
      { eventIndex: 0, eventKind: "tribute", fromSeat: 0, toSeat: 1, cardId: hiddenTributeCardB.id },
      { eventIndex: 1, eventKind: "return", fromSeat: 1, toSeat: 0, cardId: returnedCardB.id },
    ],
  };
  const constraints = deriveActingSeatInitialDealConstraints({
    publicHistoryEvents,
    baseLedger,
    pendingPublicEvents: publicHistoryEvents.slice(5),
    perspectiveSeat: 0,
    ownCurrentHand,
    expectedFinalEventIndex: 7,
    expectedFinalLedgerHash: canonicalPublicLedgerHash(finalLedger),
  });
  return {
    identity,
    gameRank,
    dealA,
    dealB,
    scenarioA,
    scenarioB,
    initialLedger,
    baseLedger,
    publicHistoryEvents,
    pendingPublicEvents: publicHistoryEvents.slice(5),
    finalLedger,
    finalLedgerHash: canonicalPublicLedgerHash(finalLedger),
    ownCurrentHand,
    constraints,
    playCard,
    laterPlayCard,
    hiddenTributeCardA,
    hiddenTributeCardB,
    returnedCardA,
    returnedCardB,
  };
}

function cardIds(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id).sort();
}

function findUniquePlayGroup(cards: readonly Card[], event: PublicActionEvent, gameRank: GameRank): CardGroup {
  if (event.kind !== "play") throw new Error("PLAY_EVENT_REQUIRED");
  const expectedIds = [...event.publicCardIds].sort().join(",");
  const matches = detectGroups([...cards], gameRank).filter((group) => group.type === event.patternType && group.type === event.groupType && cardIds(group.cards).join(",") === expectedIds);
  if (matches.length !== 1) throw new Error(`UNIQUE_GROUP_REQUIRED:${matches.length}`);
  return matches[0]!;
}

function replayAndAssert(fixture: Fixture, scenario: ParticleScenario): ParticleReplayResult {
  validateCanonicalInitialDeal(scenario.initialDeal);
  const result = replayParticleScenario({
    scenario,
    publicHistoryEvents: fixture.publicHistoryEvents,
    initialLedger: fixture.initialLedger,
    finalLedger: fixture.finalLedger,
    gameRank: fixture.gameRank,
    perspectiveSeat: 0,
    ownCurrentHand: fixture.ownCurrentHand,
  });
  expect(cardIds(result.finalState.hands[0])).toEqual(cardIds(fixture.ownCurrentHand));
  expect(result.finalState.ledger).toEqual(fixture.finalLedger);
  expect(result.finalState.publicPlayedCardIds).toEqual(fixture.finalLedger.playedCardIds);
  return result;
}

function observationFor(result: ParticleReplayResult, eventIndex: number) {
  const observation = result.actionObservations.find((entry) => entry.eventIndex === eventIndex);
  if (!observation) throw new Error(`OBSERVATION_NOT_FOUND:${eventIndex}`);
  return observation;
}

function assertEvent456Timing(fixture: Fixture, result: ParticleReplayResult, gameRank: GameRank): void {
  const event4 = fixture.publicHistoryEvents[4];
  if (event4.kind !== "trick-clear") throw new Error("EVENT4_TRICK_CLEAR_REQUIRED");
  const event5Observation = observationFor(result, 5);
  const event6Observation = observationFor(result, 6);
  expect(event5Observation.event.kind).toBe("play");
  expect(event6Observation.event.kind).toBe("pass");
  expect(event5Observation.stateBeforeEvent.currentLastPlay).toBeUndefined();
  expect(event5Observation.stateBeforeEvent.hands[1].map((card) => card.id)).toContain(fixture.laterPlayCard.id);
  expect(event6Observation.stateBeforeEvent.hands[1].map((card) => card.id)).not.toContain(fixture.laterPlayCard.id);
  if (event5Observation.event.kind !== "play") throw new Error("EVENT5_PLAY_REQUIRED");
  const laterPlayCard = event5Observation.stateBeforeEvent.hands[1].find((card) => card.id === fixture.laterPlayCard.id);
  if (!laterPlayCard) throw new Error("LATER_PLAY_CARD_NOT_IN_PRE_PLAY_HAND");
  const expectedEvent5Group = findUniquePlayGroup([laterPlayCard], event5Observation.event, gameRank);
  expect(event6Observation.stateBeforeEvent.currentLastPlay).toEqual(expectedEvent5Group);
}

function snapshotFor(fixture: Fixture): Parameters<typeof particleScenarioIdentity>[0] {
  return {
    gameId: fixture.identity.gameId,
    roundIdentity: fixture.identity.roundIdentity,
    handIdentity: fixture.identity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(fixture.initialLedger),
    lastAppliedEventIndex: fixture.finalLedger.lastAppliedEventIndex,
    ledgerHash: fixture.finalLedgerHash,
    perspectiveSeat: 0,
    gameRank: fixture.gameRank,
  };
}

function makeSamplerInput(fixture: Fixture, overrides: Readonly<Partial<Pick<SamplerInput, "particleSeed" | "particleCount" | "maxSamplingAttempts" | "maxIndexDraws">>> = {}): SamplerInput {
  return {
    publicIdentity: fixture.identity,
    constraints: fixture.constraints,
    publicHistoryEvents: fixture.publicHistoryEvents,
    initialLedger: fixture.initialLedger,
    finalLedger: fixture.finalLedger,
    gameRank: fixture.gameRank,
    perspectiveSeat: 0,
    ownCurrentHand: fixture.ownCurrentHand,
    particleSeed: overrides.particleSeed ?? 0,
    particleCount: overrides.particleCount ?? 1,
    maxSamplingAttempts: overrides.maxSamplingAttempts ?? 64,
    maxIndexDraws: overrides.maxIndexDraws ?? 8,
    samplerConfigVersion: "d2-particle-sampler-v1",
  };
}

function cloneInput(input: SamplerInput): SamplerInput {
  return structuredClone(input);
}

function canonicalScenarioBytes(scenarios: readonly ParticleScenario[]): number[][] {
  return scenarios.map((scenario) => [...canonicalParticleScenarioBytes(scenario)]);
}

function expectDeepFrozenScenario(scenario: ParticleScenario): void {
  expect(Object.isFrozen(scenario)).toBe(true);
  expect(Object.isFrozen(scenario.initialDeal)).toBe(true);
  expect(Object.isFrozen(scenario.initialDeal.hands)).toBe(true);
  expect(Object.isFrozen(scenario.hiddenTransferAssignments)).toBe(true);
  for (const seat of [0, 1, 2, 3] as const) {
    expect(Object.isFrozen(scenario.initialDeal.hands[seat])).toBe(true);
    for (const card of scenario.initialDeal.hands[seat]) expect(Object.isFrozen(card)).toBe(true);
  }
  for (const assignment of scenario.hiddenTransferAssignments) expect(Object.isFrozen(assignment)).toBe(true);
}

function expectSamplerError(callback: () => unknown): Error {
  let caught: unknown;
  try {
    callback();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  if (!(caught instanceof Error)) throw new Error("EXPECTED_SAMPLER_ERROR");
  return caught;
}

function expectSamplerInputRejection(input: SamplerInput): void {
  const before = structuredClone(input);
  expect(() => samplerModule.sampleConstrainedParticleScenarios(input)).toThrow();
  expect(input).toEqual(before);
}

function runSamplerFixturePreflight(): void {
  const deck = createDeck();
  const multiSolutionFixture = makeFixture();
  const fixture = multiSolutionFixture;
  const duplicateFixture = {
    firstCandidate: fixture.scenarioA,
    repeatedCandidate: structuredClone(fixture.scenarioA),
  };
  const impossibleFixture = makeSamplerInput(fixture, { particleCount: 2, maxSamplingAttempts: 1 });
  const hiddenTransferFixture = {
    scenarioA: fixture.scenarioA,
    scenarioB: fixture.scenarioB,
    laterPlayCard: fixture.laterPlayCard,
  };
  const allIds = deck.map((card) => card.id);
  expect(deck).toHaveLength(108);
  expect(new Set(allIds).size).toBe(108);
  expect(Object.values(fixture.dealA.hands).every((hand) => hand.length === 27)).toBe(true);
  expect(Object.values(fixture.dealB.hands).every((hand) => hand.length === 27)).toBe(true);
  expect(new Set(Object.values(fixture.dealA.hands).flat().map((card) => card.id)).size).toBe(108);
  expect(new Set(Object.values(fixture.dealB.hands).flat().map((card) => card.id)).size).toBe(108);
  expect(fixture.initialLedger.lastAppliedEventIndex).toBe(-1);
  expect(fixture.initialLedger.nextEventIndex).toBe(0);
  expect(fixture.initialLedger.seenEventHashes).toEqual({});
  expect(fixture.publicHistoryEvents.map((event) => event.eventIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(fixture.publicHistoryEvents.every((event) => /^[a-f0-9]{64}$/.test(event.publicPayloadHash))).toBe(true);
  expect(fixture.baseLedger.lastAppliedEventIndex).toBe(4);
  expect(fixture.finalLedger.lastAppliedEventIndex).toBe(7);
  expect(fixture.pendingPublicEvents).toEqual(fixture.publicHistoryEvents.slice(5));
  expect(fixture.constraints.unresolvedIncomingTransferSlotCount).toBe(1);
  expect(fixture.constraints.unresolvedOutgoingTransferSlotCount).toBe(1);
  expect(fixture.constraints.publicEventConsistency.expectedFinalEventIndex).toBe(7);
  expect(fixture.constraints.publicEventConsistency.expectedFinalLedgerHash).toBe(fixture.finalLedgerHash);

  const replayA = replayAndAssert(fixture, fixture.scenarioA);
  const replayB = replayAndAssert(fixture, fixture.scenarioB);
  assertEvent456Timing(fixture, replayA, fixture.gameRank);
  assertEvent456Timing(fixture, replayB, fixture.gameRank);
  expect(replayA.actionObservations.some((entry) => entry.eventIndex === 5)).toBe(true);
  expect(replayB.actionObservations.some((entry) => entry.eventIndex === 5)).toBe(true);
  const snapshot = snapshotFor(fixture);
  const identityA = particleScenarioIdentity(snapshot, fixture.scenarioA);
  const identityB = particleScenarioIdentity(snapshot, fixture.scenarioB);
  expect(identityA).not.toBe(identityB);
  expect(particleScenarioIdentity(snapshot, structuredClone(fixture.scenarioA))).toBe(identityA);
  expect(cardIds(fixture.ownCurrentHand)).toEqual(cardIds(replayA.finalState.hands[0]));
  expect(cardIds(fixture.ownCurrentHand)).toEqual(cardIds(replayB.finalState.hands[0]));
  expect(fixture.scenarioA.hiddenTransferAssignments).toHaveLength(2);
  expect(fixture.scenarioB.hiddenTransferAssignments).toHaveLength(2);
  expect(fixture.scenarioA.hiddenTransferAssignments.every((assignment) => [0, 1].includes(assignment.eventIndex))).toBe(true);
  expect(fixture.scenarioB.hiddenTransferAssignments.every((assignment) => [0, 1].includes(assignment.eventIndex))).toBe(true);

  const laterPlay = fixture.publicHistoryEvents[5];
  if (laterPlay.kind !== "play") throw new Error("LATER_PLAY_NOT_FOUND");
  expect(findUniquePlayGroup(fixture.dealA.hands[1], laterPlay, fixture.gameRank).type).toBe("single");
  expect(findUniquePlayGroup(fixture.dealB.hands[1], laterPlay, fixture.gameRank).type).toBe("single");

  const duplicateIdentity = particleScenarioIdentity(snapshot, duplicateFixture.repeatedCandidate);
  expect(duplicateIdentity).toBe(identityA);
  expect(particleScenarioIdentity(snapshot, duplicateFixture.firstCandidate)).toBe(duplicateIdentity);
  expect(impossibleFixture.particleCount).toBeGreaterThan(impossibleFixture.maxSamplingAttempts);
  expect(Number.isSafeInteger(impossibleFixture.maxSamplingAttempts)).toBe(true);
  expect(Number.isSafeInteger(impossibleFixture.particleCount)).toBe(true);
  expect(hiddenTransferFixture.scenarioA.hiddenTransferAssignments).toHaveLength(2);
  expect(hiddenTransferFixture.scenarioB.hiddenTransferAssignments).toHaveLength(2);
  expect(hiddenTransferFixture.laterPlayCard.id).toBe(fixture.publicHistoryEvents[5].kind === "play" ? fixture.publicHistoryEvents[5].publicCardIds[0] : "");
  const fixedSeeds = [0, 1] as const;
  expect(fixedSeeds[0]).not.toBe(fixedSeeds[1]);
  expect(fixedSeeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff)).toBe(true);
}

beforeAll(async () => {
  runSamplerFixturePreflight();
  const results = await Promise.allSettled([
    import(/* @vite-ignore */ rngModulePath),
    import(/* @vite-ignore */ samplerModulePath),
  ]);
  const modulePaths = [rngModulePath, samplerModulePath];
  const failures = results.flatMap((result, index) => result.status === "rejected" ? [modulePaths[index]] : []);
  if (failures.length > 0) throw new Error(`TASK3_PRODUCTION_MODULES_MISSING:${failures.join(",")}`);
  const rngResult = results[0];
  const samplerResult = results[1];
  if (rngResult.status !== "fulfilled" || samplerResult.status !== "fulfilled") throw new Error("TASK3_IMPORT_RESULT_INVALID");
  rngModule = assertRngModule(rngResult.value);
  samplerModule = assertSamplerModule(samplerResult.value);
});

describe("deterministic constrained particle sampler", () => {
  test("matches frozen uint32 golden vectors", () => {
    const vectors: ReadonlyArray<readonly [number, readonly number[]]> = [
      [0, [1013904223, 1196435762, 3519870697, 2868466484, 1649599747]],
      [1, [1015568748, 1586005467, 2165703038, 3027450565, 217083232]],
      [0x12345678, [1967335287, 3442499178, 635173569, 1264358700, 2229145243]],
    ];
    for (const [seed, expected] of vectors) {
      const rng = rngModule.createDeterministicParticleRng(seed, 8);
      expect(expected.map(() => rng.nextUint32())).toEqual(expected);
    }
  });

  test("rejects non-uint32 seeds and invalid bounds", () => {
    const fixture = makeFixture();
    for (const seed of [-1, 2 ** 32, 1.5, NaN, Infinity, -Infinity]) {
      expect(() => rngModule.createDeterministicParticleRng(seed, 8)).toThrow();
      expectSamplerInputRejection(makeSamplerInput(fixture, { particleSeed: seed }));
    }
    for (const bound of [0, -1, 1.5, 2 ** 32 + 1, NaN, Infinity]) {
      const first = rngModule.createDeterministicParticleRng(0, 8);
      const second = rngModule.createDeterministicParticleRng(0, 8);
      expect(() => first.nextIndex(bound)).toThrow();
      expect(first.nextUint32()).toBe(second.nextUint32());
    }
    expect(() => rngModule.createDeterministicParticleRng(0, 8).nextIndex(2 ** 32)).not.toThrow();
    expectSamplerInputRejection({ ...makeSamplerInput(fixture), samplerConfigVersion: "" });
    expectSamplerInputRejection({ ...makeSamplerInput(fixture), samplerConfigVersion: 42 as unknown as string });
    expectSamplerInputRejection({ ...makeSamplerInput(fixture), perspectiveSeat: 9 as unknown as PublicSeat });
    expectSamplerInputRejection({ ...makeSamplerInput(fixture), gameRank: "invalid" as unknown as GameRank });
  });

  test("rejects invalid maxIndexDraws and typed bounded-index exhaustion", async () => {
    const fixture = makeFixture();
    for (const maxIndexDraws of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => rngModule.createDeterministicParticleRng(0, maxIndexDraws)).toThrow();
      expectSamplerInputRejection(makeSamplerInput(fixture, { maxIndexDraws }));
    }
    for (const particleCount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expectSamplerInputRejection({ ...makeSamplerInput(fixture), particleCount });
    }
    for (const maxSamplingAttempts of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expectSamplerInputRejection({ ...makeSamplerInput(fixture), maxSamplingAttempts });
    }
    const rng = rngModule.createDeterministicParticleRng(653637408, 1);
    const error = expectSamplerError(() => rng.nextIndex(10));
    expect(error).toMatchObject({
      name: "BoundedIndexDrawExhaustedError",
      code: "BOUNDED_INDEX_DRAW_EXHAUSTED",
      exclusiveUpperBound: 10,
      maxIndexDraws: 1,
      drawsConsumed: 1,
    });
    expect(rng.nextUint32()).toBe(1012239698);

    const boundedInput = makeSamplerInput(fixture, { particleSeed: 653637408, maxIndexDraws: 1 });
    const boundedInputBefore = structuredClone(boundedInput);
    const fresh = await importFreshSamplerWithMocks(() => {
      vi.doMock(rngModulePath, () => ({
        createDeterministicParticleRng: () => ({
          nextUint32(): number {
            throw error;
          },
          nextIndex(_exclusiveUpperBound: number): number {
            throw error;
          },
        }),
      }));
    });
    try {
      const caught = expectSamplerError(() => fresh.sampler.sampleConstrainedParticleScenarios(boundedInput));
      expect(caught).toBe(error);
      expect(caught.name).toBe("BoundedIndexDrawExhaustedError");
      expect((caught as Error & { code?: unknown }).code).toBe("BOUNDED_INDEX_DRAW_EXHAUSTED");
      expect(Object.prototype.hasOwnProperty.call(caught, "scenarios")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(caught, "partialScenarios")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(caught, "assignments")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(caught, "trace")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(caught, "acceptedCount")).toBe(false);
      expect(boundedInput).toEqual(boundedInputBefore);
    } finally {
      fresh.cleanup();
    }
  });

  test("matches bounded rejection golden vectors without modulo bias", () => {
    const rng = rngModule.createDeterministicParticleRng(653637408, 8);
    expect(rng.nextIndex(10)).toBe(8);
    expect(rng.nextUint32()).toBe(806866057);
  });

  test("same seed and same snapshot produce byte-identical scenarios and ordering", () => {
    const fixture = makeFixture();
    const firstInput = makeSamplerInput(fixture, { particleCount: 2, particleSeed: 0 });
    const secondInput = cloneInput(firstInput);
    const firstBefore = structuredClone(firstInput);
    const secondBefore = structuredClone(secondInput);
    const first = samplerModule.sampleConstrainedParticleScenarios(firstInput);
    const second = samplerModule.sampleConstrainedParticleScenarios(secondInput);
    expect(canonicalScenarioBytes(first.scenarios)).toEqual(canonicalScenarioBytes(second.scenarios));
    expect(first.attempts).toBe(second.attempts);
    expect(first.duplicateCount).toBe(second.duplicateCount);
    expect(firstInput).toEqual(firstBefore);
    expect(secondInput).toEqual(secondBefore);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(second)).toBe(true);
    expect(Object.isFrozen(first.scenarios)).toBe(true);
    expect(Object.isFrozen(second.scenarios)).toBe(true);
    expect(first.scenarios[0]).not.toBe(first.scenarios[1]);
    expect(first.scenarios[0]?.initialDeal).not.toBe(first.scenarios[1]?.initialDeal);
    expect(first.scenarios[0]?.hiddenTransferAssignments).not.toBe(first.scenarios[1]?.hiddenTransferAssignments);
    for (const scenario of first.scenarios) expectDeepFrozenScenario(scenario);
    for (const scenario of second.scenarios) expectDeepFrozenScenario(scenario);
  });

  test("sampler returns initial deal and hidden transfer assignments together", () => {
    const fixture = makeFixture();
    const result = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture));
    expect(result.scenarios).toHaveLength(1);
    const scenario = result.scenarios[0]!;
    validateCanonicalInitialDeal(scenario.initialDeal);
    expect(scenario.hiddenTransferAssignments).toHaveLength(fixture.constraints.unresolvedIncomingTransferSlotCount + fixture.constraints.unresolvedOutgoingTransferSlotCount);
  });

  test("scenario conservation holds after hidden transfer replay", () => {
    const fixture = makeFixture();
    const result = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture));
    for (const scenario of result.scenarios) replayAndAssert(fixture, scenario);
  });

  test("different seeds produce different legal scenarios without violating constraints", () => {
    const fixture = makeFixture();
    const first = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture, { particleSeed: 0 }));
    const second = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture, { particleSeed: 1 }));
    expect(canonicalScenarioBytes(first.scenarios)).not.toEqual(canonicalScenarioBytes(second.scenarios));
    for (const scenario of [...first.scenarios, ...second.scenarios]) replayAndAssert(fixture, scenario);
  });

  test("returns exactly the requested scenario count", () => {
    const fixture = makeFixture();
    const result = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture, { particleCount: 2, maxSamplingAttempts: 64 }));
    expect(result.scenarios).toHaveLength(2);
  });

  test("rejects insufficient maxSamplingAttempts without retrying forever", async () => {
    const fixture = makeFixture();
    const input = makeSamplerInput(fixture, { particleCount: 2, maxSamplingAttempts: 1 });
    const before = structuredClone(input);
    const fresh = await importFreshSamplerWithMocks(() => {
      vi.doMock(canonicalDealModulePath, async () => {
        const actual = await vi.importActual<Record<string, unknown>>(canonicalDealModulePath);
        return {
          ...actual,
          particleScenarioIdentity: () => {
            throw new Error("FORCED_SCENARIO_IDENTITY_FAILURE");
          },
        };
      });
    });
    try {
      const error = expectSamplerError(() => fresh.sampler.sampleConstrainedParticleScenarios(input));
      expect(error).toMatchObject({
        name: "ParticleSamplingExhaustedError",
        code: "PARTICLE_SAMPLING_ATTEMPTS_EXHAUSTED",
        requestedCount: 2,
        acceptedCount: 0,
        attempts: 1,
        duplicateCount: 0,
        maxSamplingAttempts: 1,
      });
      for (const field of ["scenarios", "partialScenarios", "initialDeals", "assignments", "trace", "actionObservations", "finalState", "hands"]) {
        expect(Object.prototype.hasOwnProperty.call(error, field)).toBe(false);
      }
      expect(input).toEqual(before);
    } finally {
      fresh.cleanup();
    }
  });

  test("deduplicates exact-equivalent scenarios by scenario identity", async () => {
    const fixture = makeFixture();
    const input = makeSamplerInput(fixture, { particleCount: 2, maxSamplingAttempts: 64, particleSeed: 0 });
    const fresh = await importFreshSamplerWithMocks(() => {
      vi.doMock(canonicalDealModulePath, async () => {
        const actual = await vi.importActual<Record<string, unknown>>(canonicalDealModulePath);
        return { ...actual, particleScenarioIdentity: () => "forced-equivalent-scenario" };
      });
    });
    try {
      const error = expectSamplerError(() => fresh.sampler.sampleConstrainedParticleScenarios(input));
      expect(error).toMatchObject({
        name: "ParticleSamplingExhaustedError",
        code: "PARTICLE_SAMPLING_ATTEMPTS_EXHAUSTED",
        requestedCount: 2,
        acceptedCount: 1,
        attempts: 64,
        maxSamplingAttempts: 64,
      });
      const duplicateCount = (error as Error & { duplicateCount?: number }).duplicateCount;
      expect(duplicateCount).toBeGreaterThan(0);
      for (const field of ["scenarios", "partialScenarios", "assignments", "trace"]) {
        expect(Object.prototype.hasOwnProperty.call(error, field)).toBe(false);
      }
    } finally {
      fresh.cleanup();
    }
  });

  test("scenario identity does not change when attempt ordinal changes", async () => {
    const fixture = makeFixture();
    const identityAtFirstAttempt = particleScenarioIdentity(snapshotFor(fixture), fixture.scenarioA);
    const identityAtLaterAttempt = particleScenarioIdentity(snapshotFor(fixture), structuredClone(fixture.scenarioA));
    expect(identityAtLaterAttempt).toBe(identityAtFirstAttempt);
    const input = makeSamplerInput(fixture, { particleCount: 2, maxSamplingAttempts: 64, particleSeed: 0 });
    const fresh = await importFreshSamplerWithMocks(() => {
      vi.doMock(canonicalDealModulePath, async () => {
        const actual = await vi.importActual<Record<string, unknown>>(canonicalDealModulePath);
        return { ...actual, particleScenarioIdentity: () => "forced-equivalent-scenario" };
      });
    });
    try {
      const error = expectSamplerError(() => fresh.sampler.sampleConstrainedParticleScenarios(input));
      expect(error).toMatchObject({
        name: "ParticleSamplingExhaustedError",
        code: "PARTICLE_SAMPLING_ATTEMPTS_EXHAUSTED",
        requestedCount: 2,
        acceptedCount: 1,
        attempts: 64,
        duplicateCount: expect.any(Number),
        maxSamplingAttempts: 64,
      });
      expect((error as Error & { duplicateCount?: number }).duplicateCount).toBeGreaterThan(0);
    } finally {
      fresh.cleanup();
    }
  });

  test("stable ordering is locale-independent", () => {
    const fixture = makeFixture();
    const originalLocaleCompare = String.prototype.localeCompare;
    const originalCollatorDescriptor = Object.getOwnPropertyDescriptor(Intl, "Collator");
    try {
      String.prototype.localeCompare = () => {
        throw new Error("LOCALE_COMPARE_FORBIDDEN");
      };
      Object.defineProperty(Intl, "Collator", {
        configurable: true,
        value: () => {
          throw new Error("INTL_COLLATOR_FORBIDDEN");
        },
      });
      const result = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture, { particleCount: 2, particleSeed: 0 }));
      expect(result.scenarios).toHaveLength(2);
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
      if (originalCollatorDescriptor) Object.defineProperty(Intl, "Collator", originalCollatorDescriptor);
    }
  });

  test("does not use Math.random, wall-clock or external process state", async () => {
    const fixture = makeFixture();
    const productionPaths = [
      "src/ai/particles/deterministicParticleRng.ts",
      "src/ai/particles/constrainedParticleSampler.ts",
    ];
    const { readFile } = await import("node:fs/promises");
    const sourceText = (await Promise.all(productionPaths.map((path) => readFile(path, "utf8")))).join("\n");
    expect(sourceText).not.toMatch(/Math\.random|Date\.now|performance\.now|crypto\.randomUUID|crypto\.getRandomValues|process\.pid|process\.hrtime|process\.env|localeCompare|Intl\.Collator|from\s+["'](?:node:)?fs(?:\/[^"']*)?["']|require\(\s*["'](?:node:)?fs(?:\/[^"']*)?["']|from\s+["']node:(?:http|https|net|tls|dns)["']|require\(\s*["'](?:node:)?(?:http|https|net|tls|dns)["']|fetch\s*\(|XMLHttpRequest|WebSocket/);
    const originalRandom = Math.random;
    const originalDateNow = Date.now;
    const originalPerformanceDescriptor = typeof performance === "undefined" ? undefined : Object.getOwnPropertyDescriptor(performance, "now");
    const firstInput = makeSamplerInput(fixture, { particleSeed: 0, particleCount: 2 });
    const secondInput = cloneInput(firstInput);
    const firstBefore = structuredClone(firstInput);
    const secondBefore = structuredClone(secondInput);
    try {
      Math.random = () => {
        throw new Error("MATH_RANDOM_FORBIDDEN");
      };
      Date.now = () => {
        throw new Error("DATE_NOW_FORBIDDEN");
      };
      if (typeof performance !== "undefined") {
        Object.defineProperty(performance, "now", { configurable: true, value: () => { throw new Error("PERFORMANCE_NOW_FORBIDDEN"); } });
      }
      const first = samplerModule.sampleConstrainedParticleScenarios(firstInput);
      const second = samplerModule.sampleConstrainedParticleScenarios(secondInput);
      expect(canonicalScenarioBytes(first.scenarios)).toEqual(canonicalScenarioBytes(second.scenarios));
      expect(first.attempts).toBe(second.attempts);
      expect(first.duplicateCount).toBe(second.duplicateCount);
      expect(firstInput).toEqual(firstBefore);
      expect(secondInput).toEqual(secondBefore);
    } finally {
      Math.random = originalRandom;
      Date.now = originalDateNow;
      if (typeof performance !== "undefined" && originalPerformanceDescriptor) Object.defineProperty(performance, "now", originalPerformanceDescriptor);
    }
  });

  test("sampler produces one assignment for every hidden transfer slot", () => {
    const fixture = makeFixture();
    const result = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture));
    for (const scenario of result.scenarios) {
      expect(scenario.hiddenTransferAssignments).toHaveLength(2);
      expect(new Set(scenario.hiddenTransferAssignments.map((assignment) => assignment.eventIndex)).size).toBe(2);
      for (const assignment of scenario.hiddenTransferAssignments) {
        expect([0, 1]).toContain(assignment.eventIndex);
        expect(["tribute", "return"]).toContain(assignment.eventKind);
      }
    }
  });

  test("hidden transfer assignments make later public plays legal", () => {
    const fixture = makeFixture();
    const result = samplerModule.sampleConstrainedParticleScenarios(makeSamplerInput(fixture));
    const laterPlay = fixture.publicHistoryEvents[5];
    if (laterPlay.kind !== "play") throw new Error("LATER_PLAY_NOT_FOUND");
    for (const scenario of result.scenarios) {
      const replay = replayAndAssert(fixture, scenario);
      assertEvent456Timing(fixture, replay, fixture.gameRank);
      const event6Observation = observationFor(replay, 6);
      expect(event6Observation.stateBeforeEvent.currentLastPlay?.type).toBe(laterPlay.patternType);
    }
  });
});
