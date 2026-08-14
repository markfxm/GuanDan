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
import {
  finalizePublicActionEvent,
} from "../../../src/game/publicEventHash";
import {
  applyPublicEvent,
  canonicalPublicLedgerHash,
  createInitialPublicLedger,
  type HardPublicLedger,
} from "../../../src/game/publicLedger";
import { createDeck, type Card, type GameRank } from "../../../src/engine/cards";
import { detectGroups, type CardGroup } from "../../../src/engine/groups";
import {
  canonicalParticleScenarioBytes,
  createParticleBankConfigIdentity,
  likelihoodConfigHash,
  particleScenarioIdentity,
} from "../../../src/ai/particles/canonicalDeal";
import { validateCanonicalInitialDeal } from "../../../src/ai/particles/particleConservation";
import {
  catchUpPublicLedgerSnapshot,
  deriveActingSeatInitialDealConstraints,
  replayParticleScenario,
  type ActingSeatInitialDealConstraints,
} from "../../../src/ai/particles/publicEventDealReplay";
import { createDeterministicParticleRng } from "../../../src/ai/particles/deterministicParticleRng";
import { sampleConstrainedParticleScenarios } from "../../../src/ai/particles/constrainedParticleSampler";
import { evaluateActionSupportLikelihood } from "../../../src/ai/particles/actionSupportLikelihood";
import { aggregateLogWeights, normalizeLogWeights } from "../../../src/ai/particles/logWeightNormalization";
import { calculateEffectiveSampleSize } from "../../../src/ai/particles/effectiveSampleSize";
import {
  canonicalActionIdentity,
  canonicalReplayContextIdentity,
  createRolloutRequest,
} from "../../../src/ai/rollout/contracts";
import { readParticleBankRolloutAccess } from "../../../src/ai/particles/particleBankRolloutAccess";
import { createParticleScenarioSource } from "../../../src/ai/rollout/particleScenarioSource";
import type {
  CanonicalInitialDeal,
  ParticleActionObservation,
  ParticleBank,
  ParticleBankBuildInput,
  ParticleBankBuildResult,
  ParticleLikelihoodConfig,
  ParticleScenario,
  PrivateParticleSummary,
} from "../../../src/ai/particles/contracts";
import type { RolloutScenarioSourceInput } from "../../../src/ai/rollout/contracts";

const builderModulePath = "../../../src/ai/particles/particleBankBuilder";
const diagnosticsModulePath = "../../../src/ai/particles/particleDiagnostics";
const internalsModulePath = "../../../src/ai/particles/particleBankInternals";
const samplerModulePath = "../../../src/ai/particles/constrainedParticleSampler";
const canonicalModulePath = "../../../src/ai/particles/canonicalDeal";

type BuilderModule = Readonly<{
  buildParticleBank(input: ParticleBankBuildInput): ParticleBankBuildResult;
}>;

type DiagnosticsModule = Readonly<Record<string, unknown>>;

type ParticleRecord = Readonly<{
  particleId: string;
  scenario: ParticleScenario;
  normalizedWeight: number;
}>;

type ParticleBankInternals = Readonly<{
  records: readonly ParticleRecord[];
}>;

type InternalsModule = Readonly<{
  createParticleBankHandle(
    view: Omit<ParticleBank, "summary"> & Readonly<{ summary: PrivateParticleSummary }>,
    internals: ParticleBankInternals,
  ): ParticleBank;
  readParticleBankInternals(bank: ParticleBank): ParticleBankInternals | undefined;
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
  likelihoodConfig: ParticleLikelihoodConfig;
  playCard: Card;
  laterPlayCard: Card;
}>;

type FreshBuilder = Readonly<{
  builder: BuilderModule;
  cleanup(): void;
}>;

let builderModule!: BuilderModule;
let diagnosticsModule!: DiagnosticsModule;
let internalsModule!: InternalsModule;

function isRecord(value: unknown): value is Record<string | number, unknown> {
  return typeof value === "object" && value !== null;
}

function assertBuilderModule(value: unknown): BuilderModule {
  if (!isRecord(value) || typeof value.buildParticleBank !== "function") {
    throw new Error("TASK6_BUILDER_EXPORT_INVALID");
  }
  return {
    buildParticleBank: value.buildParticleBank as BuilderModule["buildParticleBank"],
  };
}

function assertDiagnosticsModule(value: unknown): DiagnosticsModule {
  if (!isRecord(value)) throw new Error("TASK6_DIAGNOSTICS_EXPORT_INVALID");
  return value;
}

function assertInternalsModule(value: unknown): InternalsModule {
  if (
    !isRecord(value) ||
    typeof value.createParticleBankHandle !== "function" ||
    typeof value.readParticleBankInternals !== "function"
  ) {
    throw new Error("TASK6_INTERNALS_EXPORT_INVALID");
  }
  return {
    createParticleBankHandle: value.createParticleBankHandle as InternalsModule["createParticleBankHandle"],
    readParticleBankInternals: value.readParticleBankInternals as InternalsModule["readParticleBankInternals"],
  };
}

function makeDeal(hands: Readonly<Record<PublicSeat, readonly Card[]>>): CanonicalInitialDeal {
  return { schemaVersion: "d2-particle-initial-deal-v1", hands };
}

function makePlayEvent(
  identity: PublicGameIdentity,
  eventIndex: number,
  seat: PublicSeat,
  trickIndex: number,
  cardId: string,
  handCountBefore: number,
): PublicActionEvent {
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

function makePassEvent(
  identity: PublicGameIdentity,
  eventIndex: number,
  seat: PublicSeat,
  trickIndex: number,
  handCount: number,
): PublicActionEvent {
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

function makeTrickClearEvent(
  identity: PublicGameIdentity,
  eventIndex: number,
  trickIndex: number,
  leadSeat: PublicSeat,
): PublicActionEvent {
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

function makeFinishEvent(
  identity: PublicGameIdentity,
  eventIndex: number,
  seat: PublicSeat,
  trickIndex: number,
  remainingHandCount: number,
): PublicActionEvent {
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

function makeAlternativeLedgers(fixture: Fixture): Readonly<{
  initialLedger: HardPublicLedger;
  baseLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  finalLedgerHash: string;
}> {
  const initialLedger = createInitialPublicLedger({
    identity: fixture.identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { state: "alternate" },
  });
  const baseLedger = applyEvents(initialLedger, fixture.publicHistoryEvents.slice(0, 5));
  const finalLedger = applyEvents(initialLedger, fixture.publicHistoryEvents);
  return {
    initialLedger,
    baseLedger,
    finalLedger,
    finalLedgerHash: canonicalPublicLedgerHash(finalLedger),
  };
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
  const identity = buildPublicGameIdentity("task6-builder-fixture", 0, 0, "benchmark-scenario");
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
    likelihoodConfig: {
      schemaVersion: "d2-particle-likelihood-v1",
      forcedPassLogFactor: -1,
      couldBeatButPassedLogFactor: -0.25,
      observedLeadPlayLogFactor: -0.1,
      observedFollowPlayLogFactor: -0.2,
      degradedEssThreshold: 1.5,
      normalizationTolerance: 1e-6,
      essTolerance: 1e-6,
    },
    playCard,
    laterPlayCard,
  };
}

function makeSamplerInput(fixture: Fixture, overrides: Readonly<Partial<{
  particleSeed: number;
  particleCount: number;
  maxSamplingAttempts: number;
  maxIndexDraws: number;
}>> = {}) {
  return {
    publicIdentity: fixture.identity,
    constraints: fixture.constraints,
    publicHistoryEvents: fixture.publicHistoryEvents,
    initialLedger: fixture.initialLedger,
    finalLedger: fixture.finalLedger,
    gameRank: fixture.gameRank,
    perspectiveSeat: 0 as const,
    ownCurrentHand: fixture.ownCurrentHand,
    particleSeed: overrides.particleSeed ?? 0,
    particleCount: overrides.particleCount ?? 2,
    maxSamplingAttempts: overrides.maxSamplingAttempts ?? 64,
    maxIndexDraws: overrides.maxIndexDraws ?? 8,
    samplerConfigVersion: "d2-particle-sampler-v1",
  };
}

function snapshotFor(fixture: Fixture) {
  return {
    gameId: fixture.identity.gameId,
    roundIdentity: fixture.identity.roundIdentity,
    handIdentity: fixture.identity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(fixture.initialLedger),
    lastAppliedEventIndex: fixture.finalLedger.lastAppliedEventIndex,
    ledgerHash: fixture.finalLedgerHash,
    perspectiveSeat: 0 as const,
    gameRank: fixture.gameRank,
  };
}

function makeBuildInput(fixture: Fixture, overrides: Partial<ParticleBankBuildInput> = {}): ParticleBankBuildInput {
  return {
    schemaVersion: "d2-particle-bank-build-input-v1",
    publicIdentity: structuredClone(fixture.identity),
    initialLedger: structuredClone(fixture.initialLedger),
    baseLedger: structuredClone(fixture.baseLedger),
    publicHistoryEvents: structuredClone(fixture.publicHistoryEvents),
    pendingPublicEvents: structuredClone(fixture.pendingPublicEvents),
    expectedFinalEventIndex: fixture.finalLedger.lastAppliedEventIndex,
    expectedFinalPublicLedgerHash: fixture.finalLedgerHash,
    gameRank: fixture.gameRank,
    actingSeat: 0,
    ownCurrentHand: structuredClone(fixture.ownCurrentHand),
    particleSeed: 0,
    particleCount: 2,
    maxSamplingAttempts: 64,
    maxIndexDraws: 8,
    samplerConfigVersion: "d2-particle-sampler-v1",
    likelihoodConfig: fixture.likelihoodConfig,
    ...overrides,
  };
}

function makeAllZeroBuildInput(fixture: Fixture): ParticleBankBuildInput {
  const publicHistoryEvents: readonly PublicActionEvent[] = [
    ...fixture.publicHistoryEvents.slice(0, 4),
    makePlayEvent(fixture.identity, 4, 1, 0, fixture.laterPlayCard.id, 27),
    makeFinishEvent(fixture.identity, 5, 0, 0, 26),
  ];
  const baseLedger = applyEvents(fixture.initialLedger, publicHistoryEvents.slice(0, 4));
  const finalLedger = applyEvents(fixture.initialLedger, publicHistoryEvents);
  return makeBuildInput(fixture, {
    baseLedger,
    publicHistoryEvents,
    pendingPublicEvents: publicHistoryEvents.slice(4),
    expectedFinalEventIndex: finalLedger.lastAppliedEventIndex,
    expectedFinalPublicLedgerHash: canonicalPublicLedgerHash(finalLedger),
  });
}

function cardIds(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id).sort();
}

function observationFor(result: Readonly<{ actionObservations: readonly ParticleActionObservation[] }>, eventIndex: number): ParticleActionObservation {
  const observation = result.actionObservations.find((entry) => entry.eventIndex === eventIndex);
  if (!observation) throw new Error(`OBSERVATION_NOT_FOUND:${eventIndex}`);
  return observation;
}

function expectRecursiveFreeze(value: unknown, seen = new Set<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursiveFreeze(child, seen);
}

function expectFailure(result: ParticleBankBuildResult, reason: string): Extract<ParticleBankBuildResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("EXPECTED_BUILD_FAILURE");
  expect(result.reason).toBe(reason);
  expect(result.summary.failureReason).toBe(reason);
  expect(result.summary.acceptedParticleCount).toBe(0);
  expect(result.summary.samplingAttempts).toBe(0);
  expect(result.summary.duplicateCount).toBe(0);
  expect(result.summary.zeroWeightCount).toBe(0);
  expect(result.summary.effectiveSampleSize).toBeUndefined();
  return result;
}

function invokeBuild(input: ParticleBankBuildInput): ParticleBankBuildResult {
  let result: ParticleBankBuildResult | undefined;
  expect(() => {
    result = builderModule.buildParticleBank(input);
  }).not.toThrow();
  if (!result) throw new Error("BUILD_RESULT_MISSING");
  return result;
}

function successfulBank(input: ParticleBankBuildInput): ParticleBank {
  const result = invokeBuild(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("EXPECTED_BUILD_SUCCESS");
  return result.bank;
}

function expectNoPrivateFailurePayload(result: Extract<ParticleBankBuildResult, { ok: false }>): void {
  const forbiddenKeys = new Set([
    "records",
    "scenarios",
    "initialDeal",
    "assignments",
    "rawWeights",
    "weights",
    "particleSeed",
    "seed",
    "seedHash",
    "trace",
    "actionObservations",
    "finalState",
    "hands",
    "partialLedger",
    "finalLedger",
    "ledger",
  ]);
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      expect(forbiddenKeys.has(key)).toBe(false);
      visit(child);
    }
  };
  visit(result);
}

function runRealLikelihoodPreflight(fixture: Fixture, scenario: ParticleScenario): number {
  const replay = replayParticleScenario({
    scenario,
    publicHistoryEvents: fixture.publicHistoryEvents,
    initialLedger: fixture.initialLedger,
    finalLedger: fixture.finalLedger,
    gameRank: fixture.gameRank,
    perspectiveSeat: 0,
    ownCurrentHand: fixture.ownCurrentHand,
  });
  const likelihoods: number[] = [];
  for (const observation of replay.actionObservations) {
    const outcome = evaluateActionSupportLikelihood({
      observation,
      gameRank: fixture.gameRank,
      config: fixture.likelihoodConfig,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("FIXTURE_ACTION_SUPPORT_UNAVAILABLE");
    expect(Number.isFinite(outcome.logLikelihood) || outcome.logLikelihood === Number.NEGATIVE_INFINITY).toBe(true);
    likelihoods.push(outcome.logLikelihood);
  }
  return likelihoods.reduce((sum, value) => sum + value, 0);
}

function runFixturePreflight(): void {
  const fixture = makeFixture();
  const deck = createDeck();
  const deckIds = deck.map((card) => card.id);
  expect(deck).toHaveLength(108);
  expect(new Set(deckIds).size).toBe(108);
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
  expect(canonicalPublicLedgerHash(fixture.finalLedger)).toBe(fixture.finalLedgerHash);
  expect(catchUpPublicLedgerSnapshot({
    baseLedger: fixture.baseLedger,
    pendingPublicEvents: fixture.pendingPublicEvents,
    expectedFinalEventIndex: 7,
    expectedFinalLedgerHash: fixture.finalLedgerHash,
  })).toMatchObject({ ok: true, finalLedgerHash: fixture.finalLedgerHash });

  validateCanonicalInitialDeal(fixture.scenarioA.initialDeal);
  validateCanonicalInitialDeal(fixture.scenarioB.initialDeal);
  const replayA = replayParticleScenario({
    scenario: fixture.scenarioA,
    publicHistoryEvents: fixture.publicHistoryEvents,
    initialLedger: fixture.initialLedger,
    finalLedger: fixture.finalLedger,
    gameRank: fixture.gameRank,
    perspectiveSeat: 0,
    ownCurrentHand: fixture.ownCurrentHand,
  });
  const replayB = replayParticleScenario({
    scenario: fixture.scenarioB,
    publicHistoryEvents: fixture.publicHistoryEvents,
    initialLedger: fixture.initialLedger,
    finalLedger: fixture.finalLedger,
    gameRank: fixture.gameRank,
    perspectiveSeat: 0,
    ownCurrentHand: fixture.ownCurrentHand,
  });
  expect(cardIds(replayA.finalState.hands[0])).toEqual(cardIds(fixture.ownCurrentHand));
  expect(cardIds(replayB.finalState.hands[0])).toEqual(cardIds(fixture.ownCurrentHand));
  expect(replayA.finalState.ledger).toEqual(fixture.finalLedger);
  expect(replayB.finalState.ledger).toEqual(fixture.finalLedger);
  expect(observationFor(replayA, 5).stateBeforeEvent.currentLastPlay).toBeUndefined();
  expect(observationFor(replayA, 6).stateBeforeEvent.currentLastPlay).toBeDefined();

  const snapshot = snapshotFor(fixture);
  expect(particleScenarioIdentity(snapshot, fixture.scenarioA)).not.toBe(
    particleScenarioIdentity(snapshot, fixture.scenarioB),
  );
  expect(canonicalParticleScenarioBytes(fixture.scenarioA)).toEqual(canonicalParticleScenarioBytes(structuredClone(fixture.scenarioA)));
  expect(fixture.constraints.unresolvedIncomingTransferSlotCount).toBe(1);
  expect(fixture.constraints.unresolvedOutgoingTransferSlotCount).toBe(1);

  const sampled = sampleConstrainedParticleScenarios(makeSamplerInput(fixture));
  expect(sampled.scenarios).toHaveLength(2);
  expect(sampled.scenarios.map((scenario) => particleScenarioIdentity(snapshot, scenario))).toHaveLength(2);
  const actionLogLikelihoods = sampled.scenarios.map((scenario) => runRealLikelihoodPreflight(fixture, scenario));
  const aggregated = aggregateLogWeights({
    priorLogWeights: sampled.scenarios.map(() => 0),
    actionLogLikelihoods,
  });
  const normalized = normalizeLogWeights({ logWeights: aggregated, tolerance: fixture.likelihoodConfig.normalizationTolerance });
  const ess = calculateEffectiveSampleSize({
    normalizedWeights: normalized.weights,
    tolerance: fixture.likelihoodConfig.essTolerance,
    degradedEssThreshold: fixture.likelihoodConfig.degradedEssThreshold,
  });
  expect(normalized.weights).toHaveLength(2);
  expect(Number.isFinite(ess.ess)).toBe(true);
  const lowEss = calculateEffectiveSampleSize({
    normalizedWeights: [1, 0],
    tolerance: fixture.likelihoodConfig.essTolerance,
    degradedEssThreshold: 1.5,
  });
  expect(lowEss.status).toBe("degraded");
  expect(() => normalizeLogWeights({ logWeights: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY], tolerance: 1e-6 })).toThrow();

  const configIdentity = createParticleBankConfigIdentity({
    particleCount: 2,
    maxSamplingAttempts: 64,
    maxIndexDraws: 8,
    samplerConfigVersion: "d2-particle-sampler-v1",
    likelihoodConfig: fixture.likelihoodConfig,
  });
  expect(configIdentity.likelihoodConfigHash).toBe(likelihoodConfigHash(fixture.likelihoodConfig));
  expect(createDeterministicParticleRng(0, 8).nextUint32()).toBe(1013904223);
}

async function importFreshBuilderWithFault(
  modulePath: string,
  factory: () => Promise<unknown>,
): Promise<FreshBuilder> {
  vi.resetModules();
  vi.doMock(modulePath, factory);
  try {
    const loaded = await import(/* @vite-ignore */ builderModulePath);
    const builder = assertBuilderModule(loaded);
    let cleaned = false;
    return {
      builder,
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        vi.doUnmock(modulePath);
        vi.resetModules();
      },
    };
  } catch (error) {
    vi.doUnmock(modulePath);
    vi.resetModules();
    throw error;
  }
}

async function importFreshBuilderWithCanonicalIdentityFault(): Promise<FreshBuilder> {
  vi.resetModules();
  await import(/* @vite-ignore */ samplerModulePath);
  vi.doMock(canonicalModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../../src/ai/particles/canonicalDeal")>(canonicalModulePath);
    return {
      ...actual,
      particleScenarioIdentity: () => "forced-duplicate-identity",
    };
  });
  try {
    const loaded = await import(/* @vite-ignore */ builderModulePath);
    const builder = assertBuilderModule(loaded);
    let cleaned = false;
    return {
      builder,
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        vi.doUnmock(canonicalModulePath);
        vi.resetModules();
      },
    };
  } catch (error) {
    vi.doUnmock(canonicalModulePath);
    vi.resetModules();
    throw error;
  }
}

function makeInvalidLedger(input: HardPublicLedger): HardPublicLedger {
  const clone = structuredClone(input) as unknown as { lastAppliedEventIndex: number };
  clone.lastAppliedEventIndex = 0;
  return clone as unknown as HardPublicLedger;
}

function makeUnknownGameRank(): GameRank {
  return "invalid" as unknown as GameRank;
}

beforeAll(async () => {
  runFixturePreflight();
  const results = await Promise.allSettled([
    import(/* @vite-ignore */ builderModulePath),
    import(/* @vite-ignore */ diagnosticsModulePath),
    import(/* @vite-ignore */ internalsModulePath),
  ]);
  const modulePaths = [builderModulePath, diagnosticsModulePath, internalsModulePath];
  const failures = results.flatMap((result, index) => result.status === "rejected" ? [modulePaths[index]] : []);
  if (failures.length > 0) {
    throw new Error(`TASK6_PRODUCTION_MODULES_MISSING:${failures.join(",")}:src/ai/particles/particleBankBuilder.ts,src/ai/particles/particleDiagnostics.ts,src/ai/particles/particleBankInternals.ts`);
  }
  const builderResult = results[0];
  const diagnosticsResult = results[1];
  const internalsResult = results[2];
  if (builderResult.status !== "fulfilled" || diagnosticsResult.status !== "fulfilled" || internalsResult.status !== "fulfilled") {
    throw new Error("TASK6_IMPORT_RESULT_INVALID");
  }
  builderModule = assertBuilderModule(builderResult.value);
  diagnosticsModule = assertDiagnosticsModule(diagnosticsResult.value);
  internalsModule = assertInternalsModule(internalsResult.value);
});

describe("immutable particle bank builder core", () => {
  test("creates one immutable bank for one complete snapshot", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    expect(bank.schemaVersion).toBe("d2-particle-bank-v1");
    expect(bank.particleCount).toBe(2);
    expect(bank.snapshot.perspectiveSeat).toBe(0);
  });

  test("binds snapshot identity to public decision state and perspective seat", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture, { actingSeat: 0 }));
    expect(bank.snapshot.gameId).toBe(fixture.identity.gameId);
    expect(bank.snapshot.roundIdentity).toBe(fixture.identity.roundIdentity);
    expect(bank.snapshot.handIdentity).toBe(fixture.identity.handIdentity);
    expect(bank.snapshot.perspectiveSeat).toBe(0);
  });

  test("derives snapshot initial ledger hash from the actual initial ledger", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    expect(bank.snapshot.initialLedgerHash).toBe(canonicalPublicLedgerHash(fixture.initialLedger));
  });

  test("derives snapshot game rank from build input without caller override", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture, { gameRank: fixture.gameRank }));
    expect(bank.snapshot.gameRank).toBe(fixture.gameRank);
  });

  test("changing initial ledger content changes snapshot initial ledger hash", () => {
    const fixture = makeFixture();
    const first = successfulBank(makeBuildInput(fixture));
    const alternate = makeAlternativeLedgers(fixture);
    const second = successfulBank(makeBuildInput(fixture, {
      initialLedger: alternate.initialLedger,
      baseLedger: alternate.baseLedger,
      expectedFinalPublicLedgerHash: alternate.finalLedgerHash,
    }));
    expect(second.snapshot.initialLedgerHash).toBe(canonicalPublicLedgerHash(alternate.initialLedger));
    expect(first.snapshot.initialLedgerHash).not.toBe(second.snapshot.initialLedgerHash);
  });

  test("changing build input game rank changes snapshot game rank and scenario identity", () => {
    const fixture = makeFixture();
    const first = successfulBank(makeBuildInput(fixture, { gameRank: "K" }));
    const second = successfulBank(makeBuildInput(fixture, { gameRank: "Q" }));
    expect(first.snapshot.gameRank).toBe("K");
    expect(second.snapshot.gameRank).toBe("Q");
    expect(first.snapshot).not.toEqual(second.snapshot);
  });

  test("keeps initial ledger distinct from base ledger during build", () => {
    const fixture = makeFixture();
    const input = makeBuildInput(fixture);
    expect(input.initialLedger.lastAppliedEventIndex).toBe(-1);
    expect(input.baseLedger.lastAppliedEventIndex).toBe(4);
    const bank = successfulBank(input);
    expect(bank.snapshot.lastAppliedEventIndex).toBe(fixture.finalLedger.lastAppliedEventIndex);
  });

  test("rejects invalid initial base or final public state without partial bank", () => {
    const fixture = makeFixture();
    const invalidInitial = expectFailure(invokeBuild(makeBuildInput(fixture, { initialLedger: makeInvalidLedger(fixture.initialLedger) })), "invalid-public-snapshot");
    expectNoPrivateFailurePayload(invalidInitial);
  });

  test("maps stale catch-up to stale-public-snapshot", () => {
    const fixture = makeFixture();
    const result = expectFailure(invokeBuild(makeBuildInput(fixture, {
      expectedFinalEventIndex: fixture.baseLedger.lastAppliedEventIndex,
      expectedFinalPublicLedgerHash: canonicalPublicLedgerHash(fixture.baseLedger),
    })), "stale-public-snapshot");
    expectNoPrivateFailurePayload(result);
  });

  test("maps non-stale catch-up errors to event-catch-up-failed", () => {
    const fixture = makeFixture();
    const result = expectFailure(invokeBuild(makeBuildInput(fixture, {
      expectedFinalPublicLedgerHash: "0".repeat(64),
    })), "event-catch-up-failed");
    expectNoPrivateFailurePayload(result);
  });

  test("maps constraint derivation failure to initial-deal-constraints-failed", () => {
    const fixture = makeFixture();
    const result = expectFailure(invokeBuild(makeBuildInput(fixture, {
      ownCurrentHand: fixture.ownCurrentHand.slice(0, -1),
    })), "initial-deal-constraints-failed");
    expectNoPrivateFailurePayload(result);
  });

  test("maps particle conservation failure to conservation-failed", () => {
    const fixture = makeFixture();
    const result = expectFailure(invokeBuild(makeBuildInput(fixture, {
      particleCount: 2,
      maxSamplingAttempts: 1,
    })), "insufficient-particles");
    expectNoPrivateFailurePayload(result);
  });

  test("uses builder-threw only for an unclassified exception", async () => {
    const fixture = makeFixture();
    const fresh = await importFreshBuilderWithFault("../../../src/ai/particles/actionSupportLikelihood", async () => {
      const actual = await vi.importActual<typeof import("../../../src/ai/particles/actionSupportLikelihood")>("../../../src/ai/particles/actionSupportLikelihood");
      return {
        ...actual,
        evaluateActionSupportLikelihood: () => {
          throw new Error("UNCLASSIFIED_BUILDER_FAILURE");
        },
      };
    });
    try {
      const result = expectFailure(fresh.builder.buildParticleBank(makeBuildInput(fixture)), "builder-threw");
      expectNoPrivateFailurePayload(result);
    } finally {
      fresh.cleanup();
    }

    const duplicate = await importFreshBuilderWithCanonicalIdentityFault();
    try {
      const result = expectFailure(
        duplicate.builder.buildParticleBank(makeBuildInput(fixture)),
        "builder-threw",
      );
      expectNoPrivateFailurePayload(result);
    } finally {
      duplicate.cleanup();
    }
  });

  test("uses the v2 snapshot-scenario identity domain", () => {
    const fixture = makeFixture();
    const snapshot = snapshotFor(fixture);
    const identity = particleScenarioIdentity(snapshot, fixture.scenarioA);
    expect(identity).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.initialLedgerHash).toBe(canonicalPublicLedgerHash(fixture.initialLedger));
  });

  test("binds bank config identity to sampler and likelihood configuration", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    expect(bank.config.particleCount).toBe(2);
    expect(bank.config.maxSamplingAttempts).toBe(64);
    expect(bank.config.maxIndexDraws).toBe(8);
    expect(bank.config.samplerConfigVersion).toBe("d2-particle-sampler-v1");
    expect(bank.config.likelihoodConfigHash).toBe(likelihoodConfigHash(fixture.likelihoodConfig));
  });

  test("likelihood config field change changes config identity", () => {
    const fixture = makeFixture();
    const first = successfulBank(makeBuildInput(fixture));
    const second = successfulBank(makeBuildInput(fixture, {
      likelihoodConfig: { ...fixture.likelihoodConfig, observedLeadPlayLogFactor: -0.3 },
    }));
    expect(first.config.likelihoodConfigHash).not.toBe(second.config.likelihoodConfigHash);
  });

  test("particle seed is absent from handle summary and diagnostics", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture, { particleSeed: 123456789 }));
    const serialized = JSON.stringify(bank);
    expect(serialized).not.toContain("123456789");
    expect(serialized).not.toContain("particleSeed");
    expect(Object.keys(diagnosticsModule)).not.toContain("records");
    expect(Object.keys(diagnosticsModule)).not.toContain("weights");
  });

  test("same input seed and config produces byte-identical private records", () => {
    const fixture = makeFixture();
    const first = successfulBank(makeBuildInput(fixture));
    const second = successfulBank(structuredClone(makeBuildInput(fixture)));
    const firstInternals = internalsModule.readParticleBankInternals(first);
    const secondInternals = internalsModule.readParticleBankInternals(second);
    expect(firstInternals).toBeDefined();
    expect(secondInternals).toBeDefined();
    expect(JSON.stringify(firstInternals)).toBe(JSON.stringify(secondInternals));
  });

  test("drops every partial particle when sampler throws", () => {
    const fixture = makeFixture();
    const result = expectFailure(invokeBuild(makeBuildInput(fixture, {
      particleCount: 2,
      maxSamplingAttempts: 1,
    })), "insufficient-particles");
    expectNoPrivateFailurePayload(result);
  });

  test("drops every partial particle when likelihood throws", async () => {
    const fixture = makeFixture();
    const fresh = await importFreshBuilderWithFault("../../../src/ai/particles/actionSupportLikelihood", async () => {
      const actual = await vi.importActual<typeof import("../../../src/ai/particles/actionSupportLikelihood")>("../../../src/ai/particles/actionSupportLikelihood");
      return {
        ...actual,
        evaluateActionSupportLikelihood: () => {
          throw new Error("LIKELIHOOD_FAILURE");
        },
      };
    });
    try {
      const result = expectFailure(fresh.builder.buildParticleBank(makeBuildInput(fixture)), "builder-threw");
      expectNoPrivateFailurePayload(result);
    } finally {
      fresh.cleanup();
    }
  });

  test("drops every partial particle when normalization fails", async () => {
    const fixture = makeFixture();
    const fresh = await importFreshBuilderWithFault("../../../src/ai/particles/logWeightNormalization", async () => {
      const actual = await vi.importActual<typeof import("../../../src/ai/particles/logWeightNormalization")>("../../../src/ai/particles/logWeightNormalization");
      return {
        ...actual,
        normalizeLogWeights: () => {
          const error = new Error("NORMALIZATION_FAILURE");
          error.name = "NormalizationFailureError";
          throw error;
        },
      };
    });
    try {
      const result = expectFailure(fresh.builder.buildParticleBank(makeBuildInput(fixture)), "normalization-failed");
      expectNoPrivateFailurePayload(result);
    } finally {
      fresh.cleanup();
    }
  });

  test("drops every partial particle when ESS fails", async () => {
    const fixture = makeFixture();
    const fresh = await importFreshBuilderWithFault("../../../src/ai/particles/effectiveSampleSize", async () => {
      const actual = await vi.importActual<typeof import("../../../src/ai/particles/effectiveSampleSize")>("../../../src/ai/particles/effectiveSampleSize");
      return {
        ...actual,
        calculateEffectiveSampleSize: () => {
          const error = new Error("ESS_FAILURE");
          error.name = "EffectiveSampleSizeFailureError";
          throw error;
        },
      };
    });
    try {
      const result = expectFailure(fresh.builder.buildParticleBank(makeBuildInput(fixture)), "ess-failed");
      expectNoPrivateFailurePayload(result);
    } finally {
      fresh.cleanup();
    }
  });

  test("returns all-zero failure without partial hidden data", () => {
    const fixture = makeFixture();
    const result = expectFailure(invokeBuild(makeAllZeroBuildInput(fixture)), "all-zero-weights");
    expectNoPrivateFailurePayload(result);

    const invalidConfigResult = expectFailure(invokeBuild(makeBuildInput(fixture, {
      likelihoodConfig: { ...fixture.likelihoodConfig, observedLeadPlayLogFactor: Number.NEGATIVE_INFINITY },
    })), "invalid-input");
    expectNoPrivateFailurePayload(invalidConfigResult);
  });

  test("deep-freezes every returned bank node and summary", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    expectRecursiveFreeze(bank);
    expect(Object.isFrozen(bank.summary)).toBe(true);
  });

  test("does not retain references to input cards events ledger own hand or config", () => {
    const fixture = makeFixture();
    const input = makeBuildInput(fixture);
    const before = structuredClone(input);
    successfulBank(input);
    expect(input).toEqual(before);
    expect(input.ownCurrentHand).not.toBe(fixture.ownCurrentHand);
    expect(input.publicHistoryEvents).not.toBe(fixture.publicHistoryEvents);
  });

  test("returns only aggregate diagnostics without raw assignments weights seed or hands", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    const serialized = JSON.stringify(bank.summary);
    for (const forbidden of ["assignments", "weights", "seed", "hands", "trace", "event"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("keeps seed outside snapshot identity", () => {
    const fixture = makeFixture();
    const first = successfulBank(makeBuildInput(fixture, { particleSeed: 0 }));
    const second = successfulBank(makeBuildInput(fixture, { particleSeed: 1 }));
    expect(first.snapshot).toEqual(second.snapshot);
    expect(JSON.stringify(first.snapshot)).not.toContain("particleSeed");
  });

  test("stores complete ParticleScenario rather than only initialDeal in private records", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    const internals = internalsModule.readParticleBankInternals(bank);
    expect(internals).toBeDefined();
    expect(internals?.records.length).toBe(2);
    for (const record of internals?.records ?? []) {
      expect(record.scenario.schemaVersion).toBe("d2-particle-scenario-v1");
      expect(record.scenario.hiddenTransferAssignments.length).toBeGreaterThan(0);
      expect(record.normalizedWeight).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(record.normalizedWeight)).toBe(true);
    }
  });

  test("accumulates likelihood over every play and pass observation in eventIndex order", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    expect(bank.summary.acceptedParticleCount).toBe(2);
    expect(bank.summary.samplingAttempts).toBeGreaterThanOrEqual(2);
  });

  test("uses each observation stateBeforeEvent and never finalState for historical actions", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture));
    expect(bank.status).toBe("ready");
    expect(JSON.stringify(bank)).not.toContain("finalState");
  });

  test("fails whole bank when any particle action support is unavailable", async () => {
    const fixture = makeFixture();
    const fresh = await importFreshBuilderWithFault("../../../src/ai/particles/actionSupportLikelihood", async () => {
      const actual = await vi.importActual<typeof import("../../../src/ai/particles/actionSupportLikelihood")>("../../../src/ai/particles/actionSupportLikelihood");
      let calls = 0;
      return {
        ...actual,
        evaluateActionSupportLikelihood: (input: Readonly<{
          observation: ParticleActionObservation;
          gameRank: GameRank;
          config: ParticleLikelihoodConfig;
        }>) => {
          calls += 1;
          if (calls === 1) return { ok: false, reason: "action-support-unavailable" };
          return actual.evaluateActionSupportLikelihood(input);
        },
      };
    });
    try {
      const result = expectFailure(fresh.builder.buildParticleBank(makeBuildInput(fixture)), "action-support-unavailable");
      expectNoPrivateFailurePayload(result);
    } finally {
      fresh.cleanup();
    }
  });

  test("does not leak partial replay trace or partial hidden assignments", () => {
    const fixture = makeFixture();
    const result = expectFailure(invokeBuild(makeBuildInput(fixture, { particleCount: 2, maxSamplingAttempts: 1 })), "insufficient-particles");
    expectNoPrivateFailurePayload(result);
    expect(internalsModule.readParticleBankInternals).toBeDefined();
  });

  test("uses degraded status when real builder ESS is below the threshold", () => {
    const fixture = makeFixture();
    const threshold = 3;
    const bank = successfulBank(makeBuildInput(fixture, {
      particleCount: 3,
      likelihoodConfig: { ...fixture.likelihoodConfig, degradedEssThreshold: threshold },
    }));
    const internals = internalsModule.readParticleBankInternals(bank);
    expect(internals).toBeDefined();
    const helper = calculateEffectiveSampleSize({
      normalizedWeights: (internals?.records ?? []).map((record) => record.normalizedWeight),
      tolerance: fixture.likelihoodConfig.essTolerance,
      degradedEssThreshold: threshold,
    });
    expect(helper.ess).toBeLessThan(threshold);
    expect(helper.status).toBe("degraded");
    expect(bank.status).toBe("degraded");
    expect(bank.summary.status).toBe("degraded");
    expect(bank.effectiveSampleSize).toBe(helper.ess);
  });

  test("uses ready status when real builder ESS equals the threshold", () => {
    const fixture = makeFixture();
    const threshold = 1;
    const bank = successfulBank(makeBuildInput(fixture, {
      particleCount: 1,
      likelihoodConfig: { ...fixture.likelihoodConfig, degradedEssThreshold: threshold },
    }));
    const internals = internalsModule.readParticleBankInternals(bank);
    expect(internals).toBeDefined();
    const helper = calculateEffectiveSampleSize({
      normalizedWeights: (internals?.records ?? []).map((record) => record.normalizedWeight),
      tolerance: fixture.likelihoodConfig.essTolerance,
      degradedEssThreshold: threshold,
    });
    expect(helper.ess).toBe(threshold);
    expect(helper.status).toBe("ready");
    expect(bank.status).toBe("ready");
    expect(bank.summary.status).toBe("ready");
    expect(bank.effectiveSampleSize).toBe(helper.ess);
  });

  test("uses ready status when real builder ESS is above the threshold", () => {
    const fixture = makeFixture();
    const threshold = 1;
    const bank = successfulBank(makeBuildInput(fixture, {
      likelihoodConfig: { ...fixture.likelihoodConfig, degradedEssThreshold: threshold },
    }));
    const internals = internalsModule.readParticleBankInternals(bank);
    expect(internals).toBeDefined();
    const helper = calculateEffectiveSampleSize({
      normalizedWeights: (internals?.records ?? []).map((record) => record.normalizedWeight),
      tolerance: fixture.likelihoodConfig.essTolerance,
      degradedEssThreshold: threshold,
    });
    expect(helper.ess).toBeGreaterThan(threshold);
    expect(helper.status).toBe("ready");
    expect(bank.status).toBe("ready");
    expect(bank.summary.status).toBe("ready");
    expect(bank.effectiveSampleSize).toBe(helper.ess);
  });

  test("passes a real equality-threshold bank through the rollout request boundary", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture, {
      particleCount: 1,
      likelihoodConfig: { ...fixture.likelihoodConfig, degradedEssThreshold: 1 },
    }));
    const currentLastPlay = detectGroups([fixture.laterPlayCard], fixture.gameRank).find((group) => group.type === "single");
    if (currentLastPlay === undefined) throw new Error("CURRENT_LAST_PLAY_FIXTURE_MISSING");
    const publicState = {
      gameRank: fixture.gameRank,
      actingSeat: 1 as const,
      perspectiveSeat: 0 as const,
      partnerSeat: 2 as const,
      handCounts: { ...fixture.finalLedger.handCounts },
      finishOrder: [...fixture.finalLedger.finishOrder],
      publicPlayedCardIds: [...fixture.finalLedger.playedCardIds],
      currentLastPlay,
      currentLastPlaySeat: 1 as const,
    };
    const scenarioSourceInput = {
      bank,
      publicHistoryEvents: fixture.publicHistoryEvents,
      initialLedger: fixture.initialLedger,
      finalLedger: fixture.finalLedger,
      gameRank: fixture.gameRank,
      perspectiveSeat: 0 as const,
      ownCurrentHand: fixture.ownCurrentHand,
      publicState,
    };
    const action = { type: "pass" } as const;
    const rootIdentity = canonicalReplayContextIdentity({
      publicHistoryEvents: scenarioSourceInput.publicHistoryEvents,
      initialLedger: scenarioSourceInput.initialLedger,
      finalLedger: scenarioSourceInput.finalLedger,
      gameRank: scenarioSourceInput.gameRank,
      perspectiveSeat: scenarioSourceInput.perspectiveSeat,
      ownCurrentHand: scenarioSourceInput.ownCurrentHand,
      actingSeat: scenarioSourceInput.publicState.actingSeat,
      publicState: scenarioSourceInput.publicState,
      particleBankSnapshot: scenarioSourceInput.bank.snapshot,
    });
    const result = createRolloutRequest({
      schemaVersion: "d2f-rollout-request-v2",
      mode: "detached",
      formalExecutionAllowed: false,
      rootIdentity,
      scenarioSourceInput,
      candidates: [{
        candidateId: canonicalActionIdentity(action),
        action,
        baselineEvaluatorScore: 0,
      }],
      budget: {
        replicateCountPerScenario: 1,
        maxPliesPerReplicate: 3,
        maxPolicyActionEvaluationsPerPly: 4,
        maxWorkUnits: 12,
      },
      limits: {
        maxReplicateCountPerScenario: 2,
        maxPliesPerReplicate: 6,
        maxPolicyActionEvaluationsPerPly: 8,
        maxWorkUnits: 96,
      },
      evidenceRequirements: {
        schemaVersion: "d2f-rollout-evidence-requirements-v1",
        minimumEffectiveSampleSize: 1,
        minimumAcceptedScenarioCount: 1,
        minimumCompletedReplicateCount: 1,
        requireCompleteCoverage: true,
      },
      riskPolicy: {
        schemaVersion: "d2f-rollout-risk-policy-v1",
        variancePenalty: 0,
        downsideRiskPenalty: 0,
      },
      policyId: "d2f-lightweight-v1",
    });
    expect(bank.effectiveSampleSize).toBe(1);
    expect(bank.status).toBe("ready");
    expect(bank.summary.status).toBe("ready");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.scenarioSourceInput.bank).toBe(bank);
  });

  test("passes a deterministic multi-particle builder bank through request, bridge and scenario source", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture, { particleCount: 2, particleSeed: 0 }));
    const bridge = readParticleBankRolloutAccess(bank);
    expect(bridge.ok).toBe(true);
    if (!bridge.ok) throw new Error("EXPECTED_BUILDER_BRIDGE_SUCCESS");

    const currentLastPlay = detectGroups([fixture.laterPlayCard], fixture.gameRank).find((group) => group.type === "single");
    if (currentLastPlay === undefined) throw new Error("CURRENT_LAST_PLAY_FIXTURE_MISSING");
    const scenarioSourceInput: RolloutScenarioSourceInput = {
      bank,
      publicHistoryEvents: fixture.publicHistoryEvents,
      initialLedger: fixture.initialLedger,
      finalLedger: fixture.finalLedger,
      gameRank: fixture.gameRank,
      perspectiveSeat: 0,
      ownCurrentHand: fixture.ownCurrentHand,
      publicState: {
        gameRank: fixture.gameRank,
        actingSeat: 1,
        perspectiveSeat: 0,
        partnerSeat: 2,
        handCounts: { ...fixture.finalLedger.handCounts },
        finishOrder: [...fixture.finalLedger.finishOrder],
        publicPlayedCardIds: [...fixture.finalLedger.playedCardIds],
        currentLastPlay,
        currentLastPlaySeat: 1,
      },
    };
    const rootIdentity = canonicalReplayContextIdentity({
      publicHistoryEvents: scenarioSourceInput.publicHistoryEvents,
      initialLedger: scenarioSourceInput.initialLedger,
      finalLedger: scenarioSourceInput.finalLedger,
      gameRank: scenarioSourceInput.gameRank,
      perspectiveSeat: scenarioSourceInput.perspectiveSeat,
      ownCurrentHand: scenarioSourceInput.ownCurrentHand,
      actingSeat: scenarioSourceInput.publicState.actingSeat,
      publicState: scenarioSourceInput.publicState,
      particleBankSnapshot: scenarioSourceInput.bank.snapshot,
    });
    const action = { type: "pass" } as const;
    const request = createRolloutRequest({
      schemaVersion: "d2f-rollout-request-v2",
      mode: "detached",
      formalExecutionAllowed: false,
      rootIdentity,
      scenarioSourceInput,
      candidates: [{ candidateId: canonicalActionIdentity(action), action, baselineEvaluatorScore: 0 }],
      budget: {
        replicateCountPerScenario: 1,
        maxPliesPerReplicate: 3,
        maxPolicyActionEvaluationsPerPly: 4,
        maxWorkUnits: 12,
      },
      limits: {
        maxReplicateCountPerScenario: 2,
        maxPliesPerReplicate: 6,
        maxPolicyActionEvaluationsPerPly: 8,
        maxWorkUnits: 96,
      },
      evidenceRequirements: {
        schemaVersion: "d2f-rollout-evidence-requirements-v1",
        minimumEffectiveSampleSize: 1,
        minimumAcceptedScenarioCount: 1,
        minimumCompletedReplicateCount: 1,
        requireCompleteCoverage: true,
      },
      riskPolicy: {
        schemaVersion: "d2f-rollout-risk-policy-v1",
        variancePenalty: 0,
        downsideRiskPenalty: 0,
      },
      policyId: "d2f-lightweight-v1",
    });
    expect(request.ok).toBe(true);
    if (!request.ok) throw new Error("EXPECTED_BUILDER_REQUEST_SUCCESS");
    const source = createParticleScenarioSource(scenarioSourceInput);
    expect(source.ok).toBe(true);
    if (!source.ok) throw new Error("EXPECTED_BUILDER_SOURCE_SUCCESS");

    expect(bank.particleCount).toBeGreaterThan(1);
    expect(bridge.access.records).toHaveLength(bank.summary.acceptedParticleCount);
    expect(source.acceptedScenarioCount).toBe(bank.summary.acceptedParticleCount);
    expect(source.scenarios.map((scenario) => scenario.scenarioIdentity).sort()).toEqual(
      bridge.access.records.map((record) => record.particleId).sort(),
    );
    expect(bridge.access.effectiveSampleSize).toBe(bank.effectiveSampleSize);
    expect(bank.summary.effectiveSampleSize).toBe(bank.effectiveSampleSize);
    expect(request.value.scenarioSourceInput.bank).toBe(bank);
    expect(JSON.stringify(request.value.scenarioSourceInput.bank)).not.toMatch(/records|scenarios|hands|normalizedWeight|seed/);
  });

  test("returns degraded success for low ESS without resampling", () => {
    const fixture = makeFixture();
    const bank = successfulBank(makeBuildInput(fixture, {
      particleCount: 3,
      likelihoodConfig: { ...fixture.likelihoodConfig, degradedEssThreshold: 3 },
    }));
    expect(bank.status).toBe("degraded");
    expect(bank.effectiveSampleSize).toBeGreaterThanOrEqual(1);
    expect(bank.summary).not.toHaveProperty("resampled");
  });
});
