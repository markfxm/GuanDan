import { describe, expect, test, vi } from "vitest";
import { createDeck } from "../../../src/engine/cards";
import { detectGroups } from "../../../src/engine/groups";
import { playPublicStableKey, buildPublicGameIdentity, type PublicActionEvent, type PublicActionEventDraft } from "../../../src/game/publicEvent";
import { applyPublicEvent, canonicalPublicLedgerHash, createInitialPublicLedger, type HardPublicLedger } from "../../../src/game/publicLedger";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import { createParticleBankHandle } from "../../../src/ai/particles/particleBankInternals";
import { particleScenarioIdentity } from "../../../src/ai/particles/canonicalDeal";
import { buildParticleBank } from "../../../src/ai/particles/particleBankBuilder";
import type { CanonicalInitialDeal, ParticleBank, ParticleBankBuildInput, ParticleScenario } from "../../../src/ai/particles/contracts";
import {
  createParticleScenarioSource,
  createRolloutReplicateInputFromValidatedSource,
} from "../../../src/ai/rollout/particleScenarioSource";
import { runRolloutReplicate } from "../../../src/ai/rollout/kernel";
import { canonicalActionIdentity, canonicalReplayContextIdentity, createRolloutRequest } from "../../../src/ai/rollout/contracts";
import type { RolloutScenarioSourceInput } from "../../../src/ai/rollout/contracts";
import { createCrnView } from "../../../src/ai/rollout/crn";
import { createCrnCoordinate, deriveRandomDomain } from "../../../src/ai/rollout/identity";
import * as policyModule from "../../../src/ai/rollout/policy";

function makePlayEvent(identity: ReturnType<typeof buildPublicGameIdentity>, cardId: string): PublicActionEvent {
  const draft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex: 0,
    kind: "play",
    seat: 0,
    publicStableKey: playPublicStableKey([cardId]),
    trickIndex: 0,
    publicCardIds: [cardId],
    patternType: "single",
    groupType: "single",
    handCountBefore: 27,
    handCountAfter: 26,
  };
  return finalizePublicActionEvent(draft);
}

function makeFixture(): { input: RolloutScenarioSourceInput; bank: ParticleBank; scenario: ParticleScenario; initialLedger: HardPublicLedger; finalLedger: HardPublicLedger } {
  const deck = createDeck();
  const identity = buildPublicGameIdentity("d2f-source-fixture", 0, 0, "benchmark-scenario");
  const initialLedger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { phase: "initial" },
  });
  const event = makePlayEvent(identity, deck[0]!.id);
  const applied = applyPublicEvent(initialLedger, event);
  if (!applied.ok) throw new Error("SOURCE_FIXTURE_EVENT_REJECTED");
  const finalLedger = applied.ledger;
  const currentLastPlay = detectGroups([deck[0]!], "2")[0];
  if (currentLastPlay === undefined) throw new Error("SOURCE_FIXTURE_GROUP_REJECTED");
  const scenario: ParticleScenario = {
    schemaVersion: "d2-particle-scenario-v1",
    initialDeal: {
      schemaVersion: "d2-particle-initial-deal-v1",
      hands: {
        0: deck.slice(0, 27),
        1: deck.slice(27, 54),
        2: deck.slice(54, 81),
        3: deck.slice(81, 108),
      },
    } satisfies CanonicalInitialDeal,
    hiddenTransferAssignments: [],
  };
  const snapshot = {
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(initialLedger),
    lastAppliedEventIndex: finalLedger.lastAppliedEventIndex,
    ledgerHash: canonicalPublicLedgerHash(finalLedger),
    perspectiveSeat: 0 as const,
    gameRank: "2" as const,
  };
  const bank = createParticleBankHandle(
    {
      schemaVersion: "d2-particle-bank-v1",
      snapshot,
      config: {
        schemaVersion: "d2-particle-bank-config-identity-v1",
        particleCount: 1,
        maxSamplingAttempts: 1,
        maxIndexDraws: 1,
        samplerConfigVersion: "d2f-source-fixture",
        likelihoodConfigHash: "a".repeat(64),
      },
      particleCount: 1,
      effectiveSampleSize: 1,
      status: "ready",
      summary: {
        status: "ready",
        requestedParticleCount: 1,
        acceptedParticleCount: 1,
        samplingAttempts: 1,
        duplicateCount: 0,
        zeroWeightCount: 0,
        effectiveSampleSize: 1,
      },
    },
    { records: [{ particleId: particleScenarioIdentity(snapshot, scenario), scenario, normalizedWeight: 1 }] },
  );
  const input: RolloutScenarioSourceInput = {
    bank,
    publicHistoryEvents: [event],
    initialLedger,
    finalLedger,
    gameRank: "2",
    perspectiveSeat: 0,
    ownCurrentHand: deck.slice(1, 27),
    publicState: {
      gameRank: "2",
      actingSeat: 3,
      perspectiveSeat: 0,
      partnerSeat: 2,
      handCounts: { 0: 26, 1: 27, 2: 27, 3: 27 },
      finishOrder: [],
      publicPlayedCardIds: [deck[0]!.id],
      currentLastPlay,
      currentLastPlaySeat: 0,
    },
  };
  return { input, bank, scenario, initialLedger, finalLedger };
}

function makeEmptyHistoryFixture(): ReturnType<typeof makeFixture> {
  const fixture = makeFixture();
  const snapshot = {
    gameId: fixture.initialLedger.gameId,
    roundIdentity: fixture.initialLedger.roundIdentity,
    handIdentity: fixture.initialLedger.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(fixture.initialLedger),
    lastAppliedEventIndex: -1,
    ledgerHash: canonicalPublicLedgerHash(fixture.initialLedger),
    perspectiveSeat: 0 as const,
    gameRank: "2" as const,
  };
  const bank = createParticleBankHandle(
    { ...fixture.bank, snapshot },
    { records: [{ particleId: particleScenarioIdentity(snapshot, fixture.scenario), scenario: fixture.scenario, normalizedWeight: 1 }] },
  );
  return {
    ...fixture,
    bank,
    input: {
      ...fixture.input,
      bank,
      publicHistoryEvents: [],
      finalLedger: fixture.initialLedger,
      ownCurrentHand: createDeck().slice(0, 27),
      publicState: {
        ...fixture.input.publicState,
        actingSeat: 0,
        handCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
        publicPlayedCardIds: [],
        currentLastPlay: null,
        currentLastPlaySeat: null,
      },
    },
  };
}

function makeTransferOnlyFixture(): ReturnType<typeof makeFixture> {
  const deck = createDeck();
  const identity = buildPublicGameIdentity("d2f-transfer-only-fixture", 0, 0, "benchmark-scenario");
  const initialLedger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 1,
    initialTrickIndex: 0,
    openingTributePublicState: { status: "pending" },
  });
  const events = [
    finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: identity.gameId,
      roundIdentity: identity.roundIdentity,
      handIdentity: identity.handIdentity,
      eventIndex: 0,
      kind: "tribute",
      seat: 1,
      publicCardIds: [],
      fromSeat: 1,
      toSeat: 0,
      handCountChanges: { 0: 1, 1: -1, 2: 0, 3: 0 },
      publicStableKey: "tribute:1:0:hidden",
      trickIndex: 0,
    } as PublicActionEventDraft),
    finalizePublicActionEvent({
      schemaVersion: "d2-public-event-v2",
      gameId: identity.gameId,
      roundIdentity: identity.roundIdentity,
      handIdentity: identity.handIdentity,
      eventIndex: 1,
      kind: "return",
      seat: 0,
      publicCardIds: [],
      fromSeat: 0,
      toSeat: 1,
      handCountChanges: { 0: -1, 1: 1, 2: 0, 3: 0 },
      publicStableKey: "return:0:1:hidden",
      trickIndex: 0,
    } as PublicActionEventDraft),
  ];
  let finalLedger = initialLedger;
  for (const event of events) {
    const applied = applyPublicEvent(finalLedger, event);
    if (!applied.ok) throw new Error("TRANSFER_ONLY_FIXTURE_EVENT_REJECTED");
    finalLedger = applied.ledger;
  }
  const scenario: ParticleScenario = {
    schemaVersion: "d2-particle-scenario-v1",
    initialDeal: {
      schemaVersion: "d2-particle-initial-deal-v1",
      hands: {
        0: deck.slice(0, 27),
        1: deck.slice(27, 54),
        2: deck.slice(54, 81),
        3: deck.slice(81, 108),
      },
    } satisfies CanonicalInitialDeal,
    hiddenTransferAssignments: [
      { eventIndex: 0, eventKind: "tribute", fromSeat: 1, toSeat: 0, cardId: deck[27]!.id },
      { eventIndex: 1, eventKind: "return", fromSeat: 0, toSeat: 1, cardId: deck[0]!.id },
    ],
  };
  const snapshot = {
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(initialLedger),
    lastAppliedEventIndex: finalLedger.lastAppliedEventIndex,
    ledgerHash: canonicalPublicLedgerHash(finalLedger),
    perspectiveSeat: 0 as const,
    gameRank: "2" as const,
  };
  const bank = createParticleBankHandle(
    {
      schemaVersion: "d2-particle-bank-v1",
      snapshot,
      config: {
        schemaVersion: "d2-particle-bank-config-identity-v1",
        particleCount: 1,
        maxSamplingAttempts: 1,
        maxIndexDraws: 1,
        samplerConfigVersion: "d2f-transfer-only-fixture",
        likelihoodConfigHash: "a".repeat(64),
      },
      particleCount: 1,
      effectiveSampleSize: 1,
      status: "ready",
      summary: {
        status: "ready",
        requestedParticleCount: 1,
        acceptedParticleCount: 1,
        samplingAttempts: 1,
        duplicateCount: 0,
        zeroWeightCount: 0,
        effectiveSampleSize: 1,
      },
    },
    { records: [{ particleId: particleScenarioIdentity(snapshot, scenario), scenario, normalizedWeight: 1 }] },
  );
  return {
    input: {
      bank,
      publicHistoryEvents: events,
      initialLedger,
      finalLedger,
      gameRank: "2",
      perspectiveSeat: 0,
      ownCurrentHand: deck.slice(1, 28),
      publicState: {
        gameRank: "2",
        actingSeat: 1,
        perspectiveSeat: 0,
        partnerSeat: 2,
        handCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
        finishOrder: [],
        publicPlayedCardIds: [],
        currentLastPlay: null,
        currentLastPlaySeat: null,
      },
    },
    bank,
    scenario,
    initialLedger,
    finalLedger,
  };
}

function makeRequestForSourceInput(input: RolloutScenarioSourceInput, rootIdentityOverride?: string): unknown {
  const action = { type: "pass" } as const;
  const rootIdentity = rootIdentityOverride ?? canonicalReplayContextIdentity({
    publicHistoryEvents: input.publicHistoryEvents,
    initialLedger: input.initialLedger,
    finalLedger: input.finalLedger,
    gameRank: input.gameRank,
    perspectiveSeat: input.perspectiveSeat,
    ownCurrentHand: input.ownCurrentHand,
    actingSeat: input.publicState.actingSeat,
    publicState: input.publicState,
    particleBankSnapshot: input.bank.snapshot,
  });
  return {
    schemaVersion: "d2f-rollout-request-v2",
    mode: "detached",
    formalExecutionAllowed: false,
    rootIdentity,
    scenarioSourceInput: input,
    candidates: [{ candidateId: canonicalActionIdentity(action), action, baselineEvaluatorScore: 0 }],
    budget: { replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 1, maxWorkUnits: 1 },
    limits: { maxReplicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 1, maxWorkUnits: 1 },
    evidenceRequirements: {
      schemaVersion: "d2f-rollout-evidence-requirements-v1",
      minimumEffectiveSampleSize: 1,
      minimumAcceptedScenarioCount: 1,
      minimumCompletedReplicateCount: 1,
      requireCompleteCoverage: true,
    },
    riskPolicy: { schemaVersion: "d2f-rollout-risk-policy-v1", variancePenalty: 0, downsideRiskPenalty: 0 },
    policyId: "d2f-lightweight-v1",
  };
}

describe("particleScenarioSource", () => {
  test("rejects public last-play projections disproven by public ledger/history before root identity", () => {
    const fixture = makeFixture();
    const validRootIdentity = canonicalReplayContextIdentity({
      publicHistoryEvents: fixture.input.publicHistoryEvents,
      initialLedger: fixture.input.initialLedger,
      finalLedger: fixture.input.finalLedger,
      gameRank: fixture.input.gameRank,
      perspectiveSeat: fixture.input.perspectiveSeat,
      ownCurrentHand: fixture.input.ownCurrentHand,
      actingSeat: fixture.input.publicState.actingSeat,
      publicState: fixture.input.publicState,
      particleBankSnapshot: fixture.input.bank.snapshot,
    });
    const cases = [
      {
        ...fixture.input,
        publicState: { ...fixture.input.publicState, currentLastPlaySeat: 1 },
      },
      {
        ...fixture.input,
        publicState: { ...fixture.input.publicState, currentLastPlay: null, currentLastPlaySeat: null },
      },
      {
        ...fixture.input,
        publicState: { ...fixture.input.publicState, currentLastPlay: { ...fixture.input.publicState.currentLastPlay!, type: "wrong-pattern" } },
      },
    ] as RolloutScenarioSourceInput[];

    for (const input of cases) {
      const result = createRolloutRequest(makeRequestForSourceInput(input, validRootIdentity));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.kind).toBe("invalid-request");
    }
  });

  test("changes replay identity when a finalized event hash changes", () => {
    const fixture = makeFixture();
    const identity = (input: RolloutScenarioSourceInput): string => canonicalReplayContextIdentity({
      publicHistoryEvents: input.publicHistoryEvents,
      initialLedger: input.initialLedger,
      finalLedger: input.finalLedger,
      gameRank: input.gameRank,
      perspectiveSeat: input.perspectiveSeat,
      ownCurrentHand: input.ownCurrentHand,
      actingSeat: input.publicState.actingSeat,
      publicState: input.publicState,
      particleBankSnapshot: input.bank.snapshot,
    });
    const { publicPayloadHash: _ignoredHash, ...eventDraft } = fixture.input.publicHistoryEvents[0]!;
    const alteredEvent = finalizePublicActionEvent({ ...eventDraft, usedBomb: false } as PublicActionEventDraft);
    const applied = applyPublicEvent(fixture.initialLedger, alteredEvent);
    if (!applied.ok) throw new Error("SOURCE_FIXTURE_ALTERED_EVENT_REJECTED");
    const alteredSnapshot = { ...fixture.bank.snapshot, ledgerHash: canonicalPublicLedgerHash(applied.ledger) };
    const alteredInput = {
      ...fixture.input,
      publicHistoryEvents: [alteredEvent],
      finalLedger: applied.ledger,
      bank: createParticleBankHandle(
        { ...fixture.bank, snapshot: alteredSnapshot },
        { records: [{ particleId: particleScenarioIdentity(alteredSnapshot, fixture.scenario), scenario: fixture.scenario, normalizedWeight: 1 }] },
      ),
    };
    expect(identity(alteredInput)).not.toBe(identity(fixture.input));
    const displayChanged = {
      ...fixture.input,
      publicState: {
        ...fixture.input.publicState,
        currentLastPlay: { ...fixture.input.publicState.currentLastPlay!, id: "presentation-id", label: "different display", purpose: "engine" },
      },
    };
    expect(identity(displayChanged)).toBe(identity(fixture.input));
  });

  test("accepts a legal event-minus-one opening with empty public history", () => {
    const fixture = makeEmptyHistoryFixture();
    const result = createParticleScenarioSource(fixture.input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.acceptedScenarioCount).toBe(1);
  });

  test("accepts a finalized tribute-and-return-only history with ledger-derived acting seat", () => {
    const fixture = makeTransferOnlyFixture();
    const result = createParticleScenarioSource(fixture.input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.acceptedScenarioCount).toBe(1);
    expect(result.scenarios[0]?.privateState).toMatchObject({ handCounts: { 0: 27, 1: 27, 2: 27, 3: 27 } });
  });

  test("rejects non-empty history that starts at event one", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicHistoryEvents: [{ ...fixture.input.publicHistoryEvents[0]!, eventIndex: 1 }],
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("rejects a history with a missing middle event", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicHistoryEvents: [fixture.input.publicHistoryEvents[0]!, { ...fixture.input.publicHistoryEvents[0]!, eventIndex: 2 }],
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("rejects duplicate history event indexes", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicHistoryEvents: [fixture.input.publicHistoryEvents[0]!, { ...fixture.input.publicHistoryEvents[0]! }],
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("rejects an event hash or ledger mismatch", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicHistoryEvents: [{ ...fixture.input.publicHistoryEvents[0]!, publicPayloadHash: "f".repeat(64) }],
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("builds replay-ready source from a bank and public replay context", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource(fixture.input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.acceptedScenarioCount).toBe(1);
    expect(result.effectiveSampleSize).toBe(1);
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0]?.scenarioIdentity).toBe(particleScenarioIdentity(fixture.bank.snapshot, fixture.scenario));
    expect(result.scenarios[0]?.privateState).toMatchObject({
      publicPlayedCardIds: [fixture.input.publicState.publicPlayedCardIds[0]],
      handCounts: { 0: 26, 1: 27, 2: 27, 3: 27 },
      finishOrder: [],
    });
    expect("scenario" in result.scenarios[0]!.privateState).toBe(false);
  });

  test("preserves validated pre-root history in the first kernel policy observation", () => {
    const deck = createDeck();
    const publicIdentity = buildPublicGameIdentity("d2f-real-builder-source-fixture", 0, 0, "benchmark-scenario");
    const initialLedger = createInitialPublicLedger({
      identity: publicIdentity,
      initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
      openingLeader: 0,
      initialTrickIndex: 0,
      openingTributePublicState: { status: "pending" },
    });
    const publicHistoryEvents: readonly PublicActionEvent[] = [
      finalizePublicActionEvent({
        schemaVersion: "d2-public-event-v2",
        gameId: publicIdentity.gameId,
        roundIdentity: publicIdentity.roundIdentity,
        handIdentity: publicIdentity.handIdentity,
        eventIndex: 0,
        kind: "tribute",
        seat: 1,
        publicCardIds: [],
        fromSeat: 1,
        toSeat: 3,
        handCountChanges: { 0: 0, 1: -1, 2: 0, 3: 1 },
        publicStableKey: "tribute:1:3:hidden",
        trickIndex: 0,
      }),
      finalizePublicActionEvent({
        schemaVersion: "d2-public-event-v2",
        gameId: publicIdentity.gameId,
        roundIdentity: publicIdentity.roundIdentity,
        handIdentity: publicIdentity.handIdentity,
        eventIndex: 1,
        kind: "return",
        seat: 3,
        publicCardIds: [],
        fromSeat: 3,
        toSeat: 1,
        handCountChanges: { 0: 0, 1: 1, 2: 0, 3: -1 },
        publicStableKey: "return:3:1:hidden",
        trickIndex: 0,
      }),
    ];
    let finalLedger = initialLedger;
    for (const event of publicHistoryEvents) {
      const applied = applyPublicEvent(finalLedger, event);
      if (!applied.ok) throw new Error("REAL_BUILDER_SOURCE_EVENT_REJECTED");
      finalLedger = applied.ledger;
    }
    const builtBank = buildParticleBank({
      schemaVersion: "d2-particle-bank-build-input-v1",
      publicIdentity,
      initialLedger,
      baseLedger: initialLedger,
      publicHistoryEvents,
      pendingPublicEvents: publicHistoryEvents,
      expectedFinalEventIndex: finalLedger.lastAppliedEventIndex,
      expectedFinalPublicLedgerHash: canonicalPublicLedgerHash(finalLedger),
      gameRank: "2",
      actingSeat: 0,
      ownCurrentHand: deck.slice(0, 27),
      particleSeed: 0,
      particleCount: 2,
      maxSamplingAttempts: 64,
      maxIndexDraws: 8,
      samplerConfigVersion: "d2-particle-sampler-v1",
      likelihoodConfig: {
        schemaVersion: "d2-particle-likelihood-v1",
        forcedPassLogFactor: -1,
        couldBeatButPassedLogFactor: -0.25,
        observedLeadPlayLogFactor: -0.1,
        observedFollowPlayLogFactor: -0.2,
        degradedEssThreshold: 1,
        normalizationTolerance: 1e-6,
        essTolerance: 1e-6,
      },
    } satisfies ParticleBankBuildInput);
    expect(builtBank.ok).toBe(true);
    if (!builtBank.ok) return;
    expect(builtBank.bank.summary.acceptedParticleCount).toBe(2);
    const sourceInput: RolloutScenarioSourceInput = {
      bank: builtBank.bank,
      publicHistoryEvents,
      initialLedger,
      finalLedger,
      gameRank: "2",
      perspectiveSeat: 0,
      ownCurrentHand: deck.slice(0, 27),
      publicState: {
        gameRank: "2",
        actingSeat: 0,
        perspectiveSeat: 0,
        partnerSeat: 2,
        handCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
        finishOrder: [],
        publicPlayedCardIds: [],
        currentLastPlay: null,
        currentLastPlaySeat: null,
      },
    };
    const source = createParticleScenarioSource(sourceInput);
    expect(source.ok).toBe(true);
    if (!source.ok) return;
    expect(source.acceptedScenarioCount).toBe(2);
    const rootIdentity = canonicalReplayContextIdentity({
      publicHistoryEvents: sourceInput.publicHistoryEvents,
      initialLedger: sourceInput.initialLedger,
      finalLedger: sourceInput.finalLedger,
      gameRank: sourceInput.gameRank,
      perspectiveSeat: sourceInput.perspectiveSeat,
      ownCurrentHand: sourceInput.ownCurrentHand,
      actingSeat: sourceInput.publicState.actingSeat,
      publicState: sourceInput.publicState,
      particleBankSnapshot: sourceInput.bank.snapshot,
    });
    const replicateIdentity = "3".repeat(64);
    const coordinate = createCrnCoordinate({
      rootIdentity,
      scenarioIdentity: source.scenarios[0]!.scenarioIdentity,
      replicateIdentity,
      ply: 0,
      actingSeat: sourceInput.publicState.actingSeat,
      randomDomain: "source-history-test",
    });
    expect(coordinate.ok).toBe(true);
    if (!coordinate.ok) return;
    const random = createCrnView({ coordinate: coordinate.value, randomDomain: deriveRandomDomain(coordinate.value) });
    expect(random.ok).toBe(true);
    if (!random.ok) return;
    const rootGroup = detectGroups([deck[0]!], "2")[0];
    if (rootGroup === undefined) throw new Error("REAL_BUILDER_ROOT_GROUP_REJECTED");
    const action = { type: "play", group: rootGroup } as const;
    const budget = { replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 256, maxWorkUnits: 256 };
    const validatedBudget = {
      budget,
      limits: { maxReplicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 256, maxWorkUnits: 256 },
      maximumWorkUnits: 256,
      validated: true as const,
    };
    const candidate = { candidateId: canonicalActionIdentity(action), action, baselineEvaluatorScore: 0 };
    expect(createRolloutReplicateInputFromValidatedSource(
      { ...source },
      0,
      candidate,
      replicateIdentity,
      random.view,
      validatedBudget,
    )).toEqual({ ok: false, failure: { kind: "invalid-request", field: "request" } });
    const built = createRolloutReplicateInputFromValidatedSource(
      source,
      0,
      candidate,
      replicateIdentity,
      random.view,
      validatedBudget,
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.publicReplayContext.publicHistoryEvents).toEqual(sourceInput.publicHistoryEvents);
    expect(Object.isFrozen(built.value.publicReplayContext)).toBe(true);
    expect(Object.isFrozen(built.value.publicReplayContext.publicHistoryEvents)).toBe(true);
    const observations: unknown[] = [];
    const validateObservation = policyModule.validateSeatLocalObservation;
    vi.spyOn(policyModule, "validateSeatLocalObservation").mockImplementation((observation) => {
      observations.push(structuredClone(observation));
      return validateObservation(observation);
    });

    const kernelResult = runRolloutReplicate(built.value, rootIdentity);

    expect(kernelResult.ok).toBe(true);
    expect(observations).not.toHaveLength(0);
    const firstHistory = (observations[0] as { publicHistoryEvents: PublicActionEvent[] }).publicHistoryEvents;
    expect(firstHistory.slice(0, 2)).toEqual(sourceInput.publicHistoryEvents);
    expect(firstHistory.map((event) => event.eventIndex)).toEqual([0, 1, 2]);
    vi.restoreAllMocks();
  });

  test("returns the typed fake-bank failure without exposing a partial source", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({ ...fixture.input, bank: {} as ParticleBank });

    expect(result).toEqual({ ok: false, failure: { kind: "fake-or-unknown-particle-bank" } });
  });

  test("rejects a ledger snapshot mismatch atomically", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({ ...fixture.input, finalLedger: fixture.initialLedger });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "ledger-mismatch" } });
  });

  test("rejects a partner seat that is not the perspective seat's partner", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicState: { ...fixture.input.publicState, partnerSeat: 1 },
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("rejects an acting seat that does not follow the replayed public turn", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicState: { ...fixture.input.publicState, actingSeat: 0 },
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("rejects a bank snapshot whose identity differs from both ledgers", () => {
    const fixture = makeFixture();
    const snapshot = { ...fixture.bank.snapshot, gameId: "different-game" };
    const bank = createParticleBankHandle(
      { ...fixture.bank, snapshot },
      { records: [{ particleId: particleScenarioIdentity(snapshot, fixture.scenario), scenario: fixture.scenario, normalizedWeight: 1 }] },
    );
    const result = createParticleScenarioSource({ ...fixture.input, bank });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "ledger-mismatch" } });
  });

  test("rejects duplicate finish seats and unpaired last-play fields", () => {
    const fixture = makeFixture();
    const cases = [
      { ...fixture.input.publicState, finishOrder: [0, 0] },
      { ...fixture.input.publicState, currentLastPlay: null },
      { ...fixture.input.publicState, currentLastPlaySeat: null },
    ];

    for (const publicState of cases) {
      const result = createParticleScenarioSource({ ...fixture.input, publicState } as RolloutScenarioSourceInput);
      expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
    }
  });

  test("rejects a public state context mismatch before returning private state", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicState: { ...fixture.input.publicState, gameRank: "A" },
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("rejects a public last-play seat mismatch against replay state", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicState: { ...fixture.input.publicState, currentLastPlaySeat: 1 },
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "replay-context-missing" } });
  });

  test("rejects a public last-play group mismatch against replay state", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource({
      ...fixture.input,
      publicState: { ...fixture.input.publicState, currentLastPlay: { id: "wrong-last-play" } },
    });

    expect(result).toEqual({ ok: false, failure: { kind: "scenario-source-failed", reason: "private-state-invalid" } });
  });

  test("rejects a particle bank identity mismatch as fake-or-unknown-particle-bank", () => {
    const fixture = makeFixture();
    const mismatchedBank = createParticleBankHandle(
      fixture.bank,
      { records: [{ particleId: "not-the-canonical-identity", scenario: fixture.scenario, normalizedWeight: 1 }] },
    );
    const result = createParticleScenarioSource({ ...fixture.input, bank: mismatchedBank });

    expect(result).toEqual({ ok: false, failure: { kind: "fake-or-unknown-particle-bank" } });
  });

  test("returns recursively frozen, caller-isolated output with stable repeated reads", () => {
    const fixture = makeFixture();
    const first = createParticleScenarioSource(fixture.input);
    const second = createParticleScenarioSource(fixture.input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first).not.toBe(second);
    expect(first.scenarios).not.toBe(second.scenarios);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.scenarios)).toBe(true);
    expect(Object.isFrozen(first.scenarios[0])).toBe(true);
    const firstPrivateState = first.scenarios[0]!.privateState as any;
    expect(Object.isFrozen(firstPrivateState)).toBe(true);
    expect(Object.isFrozen(firstPrivateState.hands)).toBe(true);
    expect(Object.isFrozen(firstPrivateState.hands[0])).toBe(true);
    const secondBeforeMutation = JSON.stringify(second);
    expect(() => (first.scenarios as any).pop()).toThrow();
    expect(() => firstPrivateState.hands[0].pop()).toThrow();
    expect(JSON.stringify(second)).toBe(secondBeforeMutation);

    const mutableInput = fixture.input as any;
    mutableInput.ownCurrentHand.pop();
    mutableInput.publicState.handCounts[0] = 1;
    expect(JSON.stringify(first)).not.toContain('"handCounts":{"0":1');
  });

  test("rejects a source-envelope accessor without executing it or returning partial state", () => {
    const fixture = makeFixture();
    let callbackCallCount = 0;
    const hostile = { ...fixture.input } as Record<string, unknown>;
    Object.defineProperty(hostile, "publicState", {
      enumerable: true,
      configurable: true,
      get: () => {
        callbackCallCount += 1;
        return fixture.input.publicState;
      },
    });

    expect(() => createParticleScenarioSource(hostile as unknown as RolloutScenarioSourceInput)).not.toThrow();
    expect(createParticleScenarioSource(hostile as unknown as RolloutScenarioSourceInput)).toEqual({
      ok: false,
      failure: { kind: "scenario-source-failed", reason: "replay-context-missing" },
    });
    expect(callbackCallCount).toBe(0);
  });

  test("keeps the raw source envelope private and requires an explicit diagnostic projection", () => {
    const fixture = makeFixture();
    const result = createParticleScenarioSource(fixture.input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rawSerialized = JSON.stringify(result);
    expect(rawSerialized).toContain("hands");

    const diagnosticSink = (value: unknown): string => {
      if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "acceptedScenarioCount,effectiveSampleSize,scenarioIdentities,schemaVersion" ) throw new Error("PUBLIC_DIAGNOSTIC_INPUT_INVALID");
      return JSON.stringify(value);
    };
    expect(() => diagnosticSink(result)).toThrow("PUBLIC_DIAGNOSTIC_INPUT_INVALID");

    const serialized = diagnosticSink({
      schemaVersion: "d2f-public-scenario-diagnostic-v1",
      acceptedScenarioCount: result.acceptedScenarioCount,
      effectiveSampleSize: result.effectiveSampleSize,
      scenarioIdentities: result.scenarios.map(({ scenarioIdentity }) => scenarioIdentity),
    });
    expect(serialized).not.toContain("hiddenTransferAssignments");
    expect(serialized).not.toContain("particleSeed");
    expect(serialized).not.toContain("weightDetail");
  });
});
