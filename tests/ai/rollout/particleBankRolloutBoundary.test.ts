import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import * as ts from "typescript";
import { createDeck } from "../../../src/engine/cards";
import { detectGroups } from "../../../src/engine/groups";
import { buildPublicGameIdentity, type PublicSeat } from "../../../src/game/publicEvent";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import { playPower } from "../../../src/game/playRules";
import { applyPublicEvent, canonicalPublicLedgerHash, createInitialPublicLedger, type HardPublicLedger } from "../../../src/game/publicLedger";
import type {
  CanonicalInitialDeal,
  ParticleBank,
  ParticleScenario,
  ParticleSnapshotIdentity,
  PrivateParticleSummary,
} from "../../../src/ai/particles/contracts";
import { particleScenarioIdentity } from "../../../src/ai/particles/canonicalDeal";
import { readParticleBankRolloutAccess } from "../../../src/ai/particles/particleBankRolloutAccess";
import { createParticleBankHandle } from "../../../src/ai/particles/particleBankInternals";
import {
  canonicalActionIdentity,
  canonicalCandidateDecisionAssociationIdentity,
  canonicalReplicateIdentity,
  canonicalReplayContextIdentity,
  createRolloutRequest,
  createRolloutResult,
  validateRolloutBudget,
  validateRolloutEvidenceRequirements,
  validateRolloutRiskPolicy,
} from "../../../src/ai/rollout/contracts";
import * as rolloutContracts from "../../../src/ai/rollout/contracts";
import { createParticleScenarioSource } from "../../../src/ai/rollout/particleScenarioSource";
import type {
  RolloutAction,
  RolloutCandidate,
  RolloutContractResult,
  RolloutFailure,
  RolloutPublicState,
  RolloutReplicateInput,
  RolloutRequest,
  RolloutResult,
  RolloutScenarioSourceInput,
} from "../../../src/ai/rollout/contracts";

function makeScenario(): ParticleScenario {
  const deck = createDeck();
  return {
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
}

function makeKnownBank(
  normalizedWeight = 1,
  snapshotOverride?: ParticleSnapshotIdentity,
  scenarioOverride?: ParticleScenario,
  recordsOverride?: readonly { particleId: string; scenario: ParticleScenario; normalizedWeight: number }[],
  effectiveSampleSizeOverride?: number,
  metadataOverrides: Readonly<{
    particleCount?: number;
    status?: ParticleBank["status"];
    summary?: Partial<PrivateParticleSummary>;
  }> = {},
): ParticleBank {
  const scenario = scenarioOverride ?? makeScenario();
  const particleCount = metadataOverrides.particleCount ?? 1;
  const summary: PrivateParticleSummary = {
    status: "ready",
    requestedParticleCount: particleCount,
    acceptedParticleCount: 1,
    samplingAttempts: 1,
    duplicateCount: 0,
    zeroWeightCount: 0,
    effectiveSampleSize: 1,
    ...metadataOverrides.summary,
  };
  const snapshot = snapshotOverride ?? {
    gameId: "bridge-fixture",
    roundIdentity: "bridge-fixture:round:0",
    handIdentity: "bridge-fixture:round:0:hand:0",
    initialLedgerHash: "0".repeat(64),
    lastAppliedEventIndex: -1,
    ledgerHash: "1".repeat(64),
    perspectiveSeat: 0 as const,
    gameRank: "2" as const,
  };
  return createParticleBankHandle(
    {
      schemaVersion: "d2-particle-bank-v1",
      snapshot,
      config: {
        schemaVersion: "d2-particle-bank-config-identity-v1",
        particleCount,
        maxSamplingAttempts: Math.max(1, particleCount),
        maxIndexDraws: 1,
        samplerConfigVersion: "bridge-fixture",
        likelihoodConfigHash: "2".repeat(64),
      },
      particleCount,
      effectiveSampleSize: effectiveSampleSizeOverride ?? 1,
      status: metadataOverrides.status ?? "ready",
      summary,
    },
    { records: recordsOverride ?? [{ particleId: particleScenarioIdentity(snapshot, scenario), scenario, normalizedWeight }] },
  );
}

function makeAction(cardIndex = 0): Extract<RolloutAction, { type: "play" }> {
  const card = createDeck()[cardIndex]!;
  return {
    type: "play",
    group: {
      id: `single:${card.id}`,
      type: "single",
      label: `single ${card.id}`,
      purpose: "risk",
      cards: [card],
      wildcards: [],
      strength: 1,
    },
  };
}

function makePublicState(actingSeat: PublicSeat = 0): RolloutPublicState {
  return {
    gameRank: "2",
    actingSeat,
    perspectiveSeat: 0,
    partnerSeat: 2,
    handCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    finishOrder: [],
    publicPlayedCardIds: [],
    currentLastPlay: null,
    currentLastPlaySeat: null,
  };
}

function makeSourceInput(bank?: ParticleBank, openingLeader: PublicSeat = 0): RolloutScenarioSourceInput {
  const identity = buildPublicGameIdentity("contract-fixture", 0, 0, "benchmark-scenario");
  const ledger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader,
    initialTrickIndex: 0,
    openingTributePublicState: { phase: "initial" },
  });
  const sourceBank = bank ?? makeKnownBank(1, {
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(ledger),
    lastAppliedEventIndex: -1,
    ledgerHash: canonicalPublicLedgerHash(ledger),
    perspectiveSeat: 0,
    gameRank: "2",
  });
  return {
    bank: sourceBank,
    publicHistoryEvents: [],
    initialLedger: ledger,
    finalLedger: ledger,
    gameRank: "2",
    perspectiveSeat: 0,
    ownCurrentHand: createDeck().slice(0, 27),
    publicState: makePublicState(openingLeader),
  };
}

function makeAntiTributeSourceInput(): RolloutScenarioSourceInput {
  const base = makeSourceInput();
  const event = finalizePublicActionEvent({
    schemaVersion: "d2-public-event-v2",
    gameId: base.initialLedger.gameId,
    roundIdentity: base.initialLedger.roundIdentity,
    handIdentity: base.initialLedger.handIdentity,
    eventIndex: 0,
    kind: "anti-tribute",
    seat: base.initialLedger.currentTrick.leadSeat,
    publicStableKey: "anti-tribute:anti-tribute",
    trickIndex: base.initialLedger.currentTrick.trickIndex,
    reasonCode: "anti-tribute",
  });
  const applied = applyPublicEvent(base.initialLedger, event);
  if (!applied.ok) throw new Error("ANTI_TRIBUTE_FIXTURE_REJECTED");
  const finalLedger = applied.ledger;
  const snapshot = {
    ...base.bank.snapshot,
    lastAppliedEventIndex: finalLedger.lastAppliedEventIndex,
    ledgerHash: canonicalPublicLedgerHash(finalLedger),
  };
  return {
    ...base,
    bank: makeKnownBank(1, snapshot),
    publicHistoryEvents: [event],
    finalLedger,
  };
}

class IndependentCanonicalWriter {
  private readonly bytes: number[] = [];

  string(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.uint32(encoded.length);
    this.bytes.push(...encoded);
  }

  integer(value: number): void {
    this.string(value.toString(10));
  }

  number(value: number): void {
    this.string(Object.is(value, -0) ? "-0" : value.toString(10));
  }

  uint8(value: number): void {
    this.bytes.push(value);
  }

  uint32(value: number): void {
    this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function independentSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function independentLedgerHash(ledger: HardPublicLedger): string {
  const seenEventHashes: Record<string, string> = {};
  for (let index = 0; index <= ledger.lastAppliedEventIndex; index += 1) seenEventHashes[String(index)] = ledger.seenEventHashes[index]!;
  const canonical = {
    schemaVersion: ledger.schemaVersion,
    gameId: ledger.gameId,
    roundIdentity: ledger.roundIdentity,
    handIdentity: ledger.handIdentity,
    nextEventIndex: ledger.nextEventIndex,
    lastAppliedEventIndex: ledger.lastAppliedEventIndex,
    seenEventHashes,
    playedCardIds: [...ledger.playedCardIds],
    revealedTransferEvents: ledger.revealedTransferEvents.map((event) => {
      const clone: Record<string, unknown> = { eventIndex: event.eventIndex, kind: event.kind };
      if (event.cardId !== undefined) clone.cardId = event.cardId;
      clone.fromSeat = event.fromSeat;
      clone.toSeat = event.toSeat;
      return clone;
    }),
    handCounts: { 0: ledger.handCounts[0], 1: ledger.handCounts[1], 2: ledger.handCounts[2], 3: ledger.handCounts[3] },
    currentTrick: {
      trickIndex: ledger.currentTrick.trickIndex,
      leadSeat: ledger.currentTrick.leadSeat,
      lastPlaySeat: ledger.currentTrick.lastPlaySeat,
      lastPlayStableKey: ledger.currentTrick.lastPlayStableKey,
      passSeats: [...ledger.currentTrick.passSeats],
    },
    finishOrder: [...ledger.finishOrder],
    publicTributeEvents: [...ledger.publicTributeEvents],
    recentActionSummaries: ledger.recentActionSummaries.map((summary) => ({
      eventIndex: summary.eventIndex,
      kind: summary.kind,
      seat: summary.seat,
      trickIndex: summary.trickIndex,
      publicStableKey: summary.publicStableKey,
    })),
  };
  return independentSha256(new TextEncoder().encode(JSON.stringify(canonical)));
}

function independentCardIds(writer: IndependentCanonicalWriter, cards: readonly { id: string }[]): void {
  const ids = cards.map((card) => card.id).sort();
  writer.uint32(ids.length);
  for (const id of ids) writer.string(id);
}

function independentSemanticCards(writer: IndependentCanonicalWriter, cards: readonly { id: string; kind: string; rank: string; suit?: string; copy: number }[]): void {
  const sorted = [...cards].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  writer.uint32(sorted.length);
  for (const card of sorted) {
    writer.string(card.id);
    writer.string(card.kind);
    writer.string(card.rank);
    if (card.kind === "suited") writer.string(card.suit!);
    writer.uint8(card.copy);
  }
}

function independentPublicState(writer: IndependentCanonicalWriter, state: RolloutPublicState): void {
  writer.string(state.gameRank);
  writer.uint8(state.actingSeat);
  writer.uint8(state.perspectiveSeat);
  writer.uint8(state.partnerSeat);
  for (const seat of [0, 1, 2, 3] as const) writer.integer(state.handCounts[seat]);
  writer.uint32(state.finishOrder.length);
  for (const seat of state.finishOrder) writer.uint8(seat);
  writer.uint32(state.publicPlayedCardIds.length);
  for (const id of state.publicPlayedCardIds) writer.string(id);
  writer.integer(state.currentLastPlaySeat === null ? -1 : state.currentLastPlaySeat);
  if (state.currentLastPlay === null) {
    writer.string("no-current-last-play");
    return;
  }
  writer.string("current-last-play");
  const group = state.currentLastPlay as { type: string; strength: number; cards: readonly { id: string; kind: string; rank: string; suit?: string; copy: number }[]; wildcards: readonly { id: string; kind: string; rank: string; suit?: string; copy: number }[] };
  writer.string(group.type);
  writer.number(group.strength);
  independentSemanticCards(writer, group.cards);
  independentSemanticCards(writer, group.wildcards);
}

function independentReplayContextIdentity(input: RolloutScenarioSourceInput): string {
  const writer = new IndependentCanonicalWriter();
  writer.string("d2f-replay-context-identity-v1");
  writer.string(independentLedgerHash(input.initialLedger));
  writer.integer(input.initialLedger.lastAppliedEventIndex);
  writer.string(independentLedgerHash(input.finalLedger));
  writer.integer(input.finalLedger.lastAppliedEventIndex);
  writer.uint32(input.publicHistoryEvents.length);
  for (const event of input.publicHistoryEvents) {
    writer.integer(event.eventIndex);
    writer.string(event.publicPayloadHash);
  }
  writer.string(input.gameRank);
  writer.uint8(input.perspectiveSeat);
  writer.uint8(input.publicState.actingSeat);
  independentCardIds(writer, input.ownCurrentHand);
  independentPublicState(writer, input.publicState);
  const snapshot = input.bank.snapshot;
  writer.string(snapshot.gameId);
  writer.string(snapshot.roundIdentity);
  writer.string(snapshot.handIdentity);
  writer.string(snapshot.initialLedgerHash);
  writer.integer(snapshot.lastAppliedEventIndex);
  writer.string(snapshot.ledgerHash);
  writer.uint8(snapshot.perspectiveSeat);
  writer.string(snapshot.gameRank);
  return independentSha256(writer.finish());
}

function independentRootDigest(identity: string): string {
  const writer = new IndependentCanonicalWriter();
  writer.string("d2f-root-digest-v1");
  writer.string(identity);
  return independentSha256(writer.finish());
}

function makeRequestInput(): RolloutRequest {
  const action = makeAction();
  const scenarioSourceInput = makeSourceInput();
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
  const candidate: RolloutCandidate = {
    candidateId: canonicalActionIdentity(action),
    action,
    baselineEvaluatorScore: 1,
  };
  return {
    schemaVersion: "d2f-rollout-request-v2",
    mode: "detached",
    formalExecutionAllowed: false,
    rootIdentity,
    scenarioSourceInput,
    candidates: [candidate],
    budget: {
      replicateCountPerScenario: 2,
      maxPliesPerReplicate: 3,
      maxPolicyActionEvaluationsPerPly: 4,
      maxWorkUnits: 24,
    },
    limits: {
      maxReplicateCountPerScenario: 4,
      maxPliesPerReplicate: 6,
      maxPolicyActionEvaluationsPerPly: 8,
      maxWorkUnits: 192,
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
      variancePenalty: 0.5,
      downsideRiskPenalty: 0.25,
    },
    policyId: "d2f-lightweight-v1",
  };
}

function replayRoot(sourceInput: RolloutScenarioSourceInput): string {
  return canonicalReplayContextIdentity({
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
}

function makeResultInput(): RolloutResult {
  const candidateId = canonicalActionIdentity(makeAction());
  return {
    schemaVersion: "d2f-rollout-result-v2",
    mode: "detached",
    formalExecutionAllowed: false,
    policyId: "d2f-lightweight-v1",
    rootDigest: "a".repeat(64),
    candidateSummaries: [{
      candidateId,
      riskAdjustedUtility: 1,
      expectedUtility: 1,
      variance: 0,
      risk: 0,
      baselineEvaluatorScore: 1,
      acceptedScenarioCount: 1,
      replicateCountPerScenario: 1,
      expectedReplicateCount: 1,
      completedReplicateCount: 1,
      workUnitCount: 1,
    }],
    ranking: [candidateId],
    aggregateDiagnostics: {
      effectiveSampleSize: 1,
      acceptedScenarioCount: 1,
      replicateCountPerScenario: 1,
      completedReplicateCount: 1,
      expectedCompletedReplicateCount: 1,
      candidateCount: 1,
      workUnitCount: 1,
      coverage: "complete",
    },
  };
}

function makeResultAssemblyInput(input: RolloutResult = makeResultInput()): {
  candidateSummaries: readonly RolloutResult["candidateSummaries"][number][];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutResult["aggregateDiagnostics"];
} {
  return {
    candidateSummaries: input.candidateSummaries,
    ranking: input.ranking,
    aggregateDiagnostics: input.aggregateDiagnostics,
  };
}

function withHostileArrayPrototype<T>(value: T[], input: Readonly<{
  onIterator: () => void;
  onMap: () => void;
}>): T[] {
  const prototype = Object.create(Array.prototype) as Record<PropertyKey, unknown>;
  Object.defineProperty(prototype, Symbol.iterator, {
    configurable: true,
    value: function* hostileIterator(): IterableIterator<T> {
      input.onIterator();
      throw new Error("HOSTILE_ITERATOR_EXECUTED");
    },
  });
  Object.defineProperty(prototype, "map", {
    configurable: true,
    value: () => {
      input.onMap();
      throw new Error("HOSTILE_MAP_EXECUTED");
    },
  });
  Object.setPrototypeOf(value, prototype);
  return value;
}

function createRegisteredHostileBank<T>(callback: () => T): T {
  const originalStructuredClone = globalThis.structuredClone;
  globalThis.structuredClone = ((value: unknown) => value) as typeof structuredClone;
  try {
    return callback();
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
}

describe("D2F ParticleBank bridge", () => {
  test("rejects inherited array execution at request, scenario-source and bridge boundaries", () => {
    let iteratorCallCount = 0;
    let mapCallCount = 0;
    const requestInput = makeRequestInput() as unknown as Record<string, unknown>;
    const hostileCandidates = withHostileArrayPrototype([...makeRequestInput().candidates], {
      onIterator: () => { iteratorCallCount += 1; },
      onMap: () => { mapCallCount += 1; },
    });
    const requestResult = createRolloutRequest({ ...requestInput, candidates: hostileCandidates });
    expect(() => requestResult).not.toThrow();
    expect(requestResult.ok).toBe(false);

    const sourceInput = makeSourceInput();
    const hostileOwnCurrentHand = withHostileArrayPrototype([...sourceInput.ownCurrentHand], {
      onIterator: () => { iteratorCallCount += 1; },
      onMap: () => { mapCallCount += 1; },
    });
    const sourceResult = createParticleScenarioSource({ ...sourceInput, ownCurrentHand: hostileOwnCurrentHand });
    expect(sourceResult).toEqual({
      ok: false,
      failure: { kind: "scenario-source-failed", reason: "replay-context-missing" },
    });

    const validBank = makeKnownBank();
    const scenario = makeScenario();
    const hostileAssignments = withHostileArrayPrototype([], {
      onIterator: () => { iteratorCallCount += 1; },
      onMap: () => { mapCallCount += 1; },
    });
    const hostileScenario = { ...scenario, hiddenTransferAssignments: hostileAssignments } as ParticleScenario;
    const bridgeResult = createRegisteredHostileBank(() => readParticleBankRolloutAccess(createParticleBankHandle(
      { ...validBank },
      {
        records: [{
          particleId: particleScenarioIdentity(validBank.snapshot, scenario),
          scenario: hostileScenario,
          normalizedWeight: 1,
        }],
      },
    )));
    expect(bridgeResult).toEqual({
      ok: false,
      failure: { kind: "fake-or-unknown-particle-bank" },
    });

    expect(iteratorCallCount).toBe(0);
    expect(mapCallCount).toBe(0);
  });

  test("rejects a fake ParticleBank handle before reading records", () => {
    const result = readParticleBankRolloutAccess({} as ParticleBank);

    expect(result).toEqual({
      ok: false,
      failure: { kind: "fake-or-unknown-particle-bank" },
    });
  });

  test("rejects a known handle with a non-finite or negative private weight", () => {
    for (const normalizedWeight of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(readParticleBankRolloutAccess(makeKnownBank(normalizedWeight))).toEqual({
        ok: false,
        failure: { kind: "fake-or-unknown-particle-bank" },
      });
    }
  });

  test("rejects malformed registered scenarios and inconsistent particle projections", () => {
    const snapshot = makeKnownBank().snapshot;
    const validScenario = makeScenario();
    const validId = particleScenarioIdentity(snapshot, validScenario);
    const cases: readonly ParticleBank[] = [
      makeKnownBank(1, snapshot, { ...validScenario, schemaVersion: "wrong-scenario" } as unknown as ParticleScenario, [{ particleId: "malformed-schema", scenario: { ...validScenario, schemaVersion: "wrong-scenario" } as unknown as ParticleScenario, normalizedWeight: 1 }]),
      makeKnownBank(1, snapshot, { ...validScenario, initialDeal: { ...validScenario.initialDeal, schemaVersion: "wrong-deal" } } as unknown as ParticleScenario, [{ particleId: "malformed-deal", scenario: { ...validScenario, initialDeal: { ...validScenario.initialDeal, schemaVersion: "wrong-deal" } } as unknown as ParticleScenario, normalizedWeight: 1 }]),
      makeKnownBank(1, snapshot, { ...validScenario, hiddenTransferAssignments: [{}] } as unknown as ParticleScenario, [{ particleId: "malformed-transfer", scenario: { ...validScenario, hiddenTransferAssignments: [{}] } as unknown as ParticleScenario, normalizedWeight: 1 }]),
      makeKnownBank(1, snapshot, validScenario, [
        { particleId: validId, scenario: validScenario, normalizedWeight: 0.5 },
        { particleId: validId, scenario: validScenario, normalizedWeight: 0.5 },
      ]),
      makeKnownBank(1, snapshot, validScenario, [{ particleId: "not-the-canonical-id", scenario: validScenario, normalizedWeight: 1 }]),
      makeKnownBank(0.5, snapshot, validScenario, [{ particleId: validId, scenario: validScenario, normalizedWeight: 0.5 }]),
      makeKnownBank(1, snapshot, validScenario, [{ particleId: validId, scenario: validScenario, normalizedWeight: 1 }], 2),
    ];

    for (const bank of cases) {
      expect(readParticleBankRolloutAccess(bank)).toEqual({
        ok: false,
        failure: { kind: "fake-or-unknown-particle-bank" },
      });
    }
  });

  test("rejects registered banks whose public metadata disagrees with summary or records", () => {
    const baseline = makeKnownBank();
    const snapshot = baseline.snapshot;
    const scenario = makeScenario();
    const secondScenario = {
      ...scenario,
      hiddenTransferAssignments: [{ eventIndex: 0, eventKind: "tribute", fromSeat: 0, toSeat: 1, cardId: "C2-1" }],
    } as ParticleScenario;
    const firstId = particleScenarioIdentity(snapshot, scenario);
    const secondId = particleScenarioIdentity(snapshot, secondScenario);
    const twoRecords = [
      { particleId: firstId, scenario, normalizedWeight: 0.5 },
      { particleId: secondId, scenario: secondScenario, normalizedWeight: 0.5 },
    ];
    const foreignSnapshot = { ...snapshot, gameId: "foreign-bank" };
    const cases: readonly ParticleBank[] = [
      makeKnownBank(1, snapshot, scenario, undefined, undefined, { summary: { status: "degraded" } }),
      makeKnownBank(1, snapshot, scenario, undefined, undefined, { summary: { acceptedParticleCount: 0 } }),
      makeKnownBank(1, snapshot, scenario, undefined, 1, { summary: { effectiveSampleSize: 2 } }),
      makeKnownBank(0.5, snapshot, scenario, twoRecords, 2, { particleCount: 2, summary: { acceptedParticleCount: 2, samplingAttempts: 2, effectiveSampleSize: 1 } }),
      makeKnownBank(0.5, snapshot, scenario, twoRecords, 1, { summary: { acceptedParticleCount: 1 } }),
      makeKnownBank(1, snapshot, scenario, undefined, undefined, { summary: { status: "failed", acceptedParticleCount: 0, failureReason: "insufficient-particles" } }),
      makeKnownBank(1, snapshot, scenario, [{ particleId: particleScenarioIdentity(foreignSnapshot, scenario), scenario, normalizedWeight: 1 }]),
    ];

    for (const bank of cases) {
      const result = readParticleBankRolloutAccess(bank);
      expect(result).toEqual({ ok: false, failure: { kind: "fake-or-unknown-particle-bank" } });
      expect(result).not.toHaveProperty("access");
    }
  });

  test("rejects scenario cards and nested envelopes with hostile or unknown structure", () => {
    const snapshot = makeKnownBank().snapshot;
    const cases: readonly [string, () => { scenario: ParticleScenario; particleId: string; getterCallCount: () => number; resetGetterCallCount: () => void }][] = [
      ["card enumerable extra", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const card = scenario.initialDeal.hands[0]![0]! as unknown as Record<string, unknown>;
        Object.defineProperty(card, "extra", { configurable: true, enumerable: true, value: "unknown" });
        return { scenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
      ["card non-enumerable extra", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const card = scenario.initialDeal.hands[0]![0]! as unknown as Record<string, unknown>;
        Object.defineProperty(card, "extra", { configurable: true, enumerable: false, value: "unknown" });
        return { scenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
      ["card symbol key", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const card = scenario.initialDeal.hands[0]![0]! as unknown as Record<PropertyKey, unknown>;
        Object.defineProperty(card, Symbol("extra"), { configurable: true, enumerable: true, value: "unknown" });
        return { scenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
      ["card accessor", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const card = scenario.initialDeal.hands[0]![0]! as unknown as Record<string, unknown>;
        let getterCallCount = 0;
        Object.defineProperty(card, "id", {
          configurable: true,
          enumerable: true,
          get: () => {
            getterCallCount += 1;
            return "S2-1";
          },
        });
        return {
          scenario,
          particleId,
          getterCallCount: () => getterCallCount,
          resetGetterCallCount: () => { getterCallCount = 0; },
        };
      }],
      ["card abnormal prototype", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const card = scenario.initialDeal.hands[0]![0]! as object;
        Object.setPrototypeOf(card, []);
        return { scenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
      ["card inherited property", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const card = scenario.initialDeal.hands[0]![0]! as object;
        Object.setPrototypeOf(card, { inherited: "unknown" });
        return { scenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
      ["unknown deal envelope field", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const hostileScenario = {
          ...scenario,
          initialDeal: { ...scenario.initialDeal, extra: "unknown" } as unknown as CanonicalInitialDeal,
        } as ParticleScenario;
        return { scenario: hostileScenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
      ["unknown hands envelope field", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, scenario);
        const hostileScenario = {
          ...scenario,
          initialDeal: {
            ...scenario.initialDeal,
            hands: { ...scenario.initialDeal.hands, extra: [] },
          } as unknown as CanonicalInitialDeal,
        } as ParticleScenario;
        return { scenario: hostileScenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
      ["unknown assignment envelope field", () => {
        const scenario = structuredClone(makeScenario()) as ParticleScenario;
        const assignment = { eventIndex: 0, eventKind: "tribute", fromSeat: 0, toSeat: 1, cardId: "C2-1" } as const;
        const cleanScenario = { ...scenario, hiddenTransferAssignments: [assignment] } as ParticleScenario;
        const particleId = particleScenarioIdentity(snapshot, cleanScenario);
        const hostileScenario = {
          ...cleanScenario,
          hiddenTransferAssignments: [{ ...assignment, extra: "unknown" }] as unknown as ParticleScenario["hiddenTransferAssignments"],
        } as ParticleScenario;
        return { scenario: hostileScenario, particleId, getterCallCount: () => 0, resetGetterCallCount: () => undefined };
      }],
    ];

    for (const [label, buildCase] of cases) {
      const { scenario, particleId, getterCallCount, resetGetterCallCount } = buildCase();
      const bank = createRegisteredHostileBank(() => makeKnownBank(
        1,
        snapshot,
        scenario,
        [{ particleId, scenario, normalizedWeight: 1 }],
      ));
      resetGetterCallCount();
      const result = readParticleBankRolloutAccess(bank);
      expect(result, label).toEqual({ ok: false, failure: { kind: "fake-or-unknown-particle-bank" } });
      expect(result, label).not.toHaveProperty("access");
      expect(getterCallCount(), label).toBe(0);
    }
  });

  test("rejects noncanonical seenEventHashes dictionaries without reading hostile accessors", () => {
    const base = makeRequestInput();
    const validHash = "0".repeat(64);
    const makeInput = (seenEventHashes: unknown, ledgerOverrides: Readonly<Record<string, unknown>> = {}) => ({
      ...base,
      scenarioSourceInput: {
        ...base.scenarioSourceInput,
        initialLedger: {
          ...base.scenarioSourceInput.initialLedger,
          ...ledgerOverrides,
          seenEventHashes,
        },
      },
    } as unknown as RolloutRequest);
    const cases: readonly [string, () => { input: RolloutRequest; getterCallCount: () => number }][] = [
      ["non-enumerable unknown key", () => {
        const seenEventHashes: Record<string, string> = {};
        Object.defineProperty(seenEventHashes, "foreign", { configurable: true, enumerable: false, value: validHash });
        return { input: makeInput(seenEventHashes), getterCallCount: () => 0 };
      }],
      ["symbol key", () => {
        const seenEventHashes: Record<PropertyKey, string> = {};
        Object.defineProperty(seenEventHashes, Symbol("foreign"), { configurable: true, enumerable: true, value: validHash });
        return { input: makeInput(seenEventHashes), getterCallCount: () => 0 };
      }],
      ["accessor key", () => {
        const seenEventHashes: Record<string, string> = {};
        let getterCallCount = 0;
        Object.defineProperty(seenEventHashes, "0", {
          configurable: true,
          enumerable: true,
          get: () => {
            getterCallCount += 1;
            return validHash;
          },
        });
        return { input: makeInput(seenEventHashes, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => getterCallCount };
      }],
      ["inherited key", () => {
        const seenEventHashes = Object.create({ foreign: validHash }) as Record<string, string>;
        return { input: makeInput(seenEventHashes), getterCallCount: () => 0 };
      }],
      ["leading-zero index", () => ({ input: makeInput({ "01": validHash }, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => 0 })],
      ["negative index", () => ({ input: makeInput({ "-1": validHash }, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => 0 })],
      ["fractional index", () => ({ input: makeInput({ "1.5": validHash }, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => 0 })],
      ["over-safe-integer index", () => ({ input: makeInput({ "9007199254740992": validHash }, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => 0 })],
      ["index beyond ledger", () => ({ input: makeInput({ 1: validHash }, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => 0 })],
      ["missing necessary index", () => ({ input: makeInput({}, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => 0 })],
      ["invalid hash value", () => ({ input: makeInput({ 0: "not-a-hash" }, { lastAppliedEventIndex: 0, nextEventIndex: 1 }), getterCallCount: () => 0 })],
      ["sparse ledger index gap", () => ({ input: makeInput({ 1: validHash }, { lastAppliedEventIndex: 1, nextEventIndex: 2 }), getterCallCount: () => 0 })],
    ];

    for (const [label, buildCase] of cases) {
      const { input, getterCallCount } = buildCase();
      let result: RolloutContractResult<RolloutRequest> | undefined;
      expect(() => { result = createRolloutRequest(input); }, label).not.toThrow();
      expect(result, label).toEqual({ ok: false, failure: { kind: "invalid-request", field: "scenarioSourceInput" } });
      expect(getterCallCount(), label).toBe(0);
    }
  });

  test("rejects a snapshot-only fake bank at the request boundary without retaining it", () => {
    const base = makeRequestInput();
    const snapshotOnlyBank = Object.freeze({ snapshot: base.scenarioSourceInput.bank.snapshot });
    const input = {
      ...base,
      scenarioSourceInput: {
        ...base.scenarioSourceInput,
        bank: snapshotOnlyBank,
      },
    } as unknown;

    let result: RolloutContractResult<RolloutRequest> | undefined;
    expect(() => { result = createRolloutRequest(input); }).not.toThrow();
    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "scenarioSourceInput" } });
    expect(result).not.toHaveProperty("value");
  });

  test("rejects inconsistent or hostile public ParticleBank metadata before request success", () => {
    const base = makeRequestInput();
    const bank = base.scenarioSourceInput.bank;
    const makePublicBank = (
      overrides: Readonly<Record<string, unknown>> = {},
      summaryOverrides: Partial<PrivateParticleSummary> = {},
    ): unknown => Object.freeze({
      ...bank,
      ...overrides,
      summary: Object.freeze({ ...bank.summary, ...summaryOverrides }),
    });
    const missingStatus = (() => {
      const { status: _status, ...value } = bank;
      return Object.freeze(value);
    })();
    const nonEnumerableExtra = (() => {
      const value = { ...bank } as Record<string, unknown>;
      Object.defineProperty(value, "unknownMetadata", { configurable: true, enumerable: false, value: 1 });
      return Object.freeze(value);
    })();
    const symbolExtra = (() => {
      const value = { ...bank } as Record<PropertyKey, unknown>;
      Object.defineProperty(value, Symbol("unknownMetadata"), { configurable: true, enumerable: true, value: 1 });
      return Object.freeze(value);
    })();
    let getterCallCount = 0;
    const accessorStatus = (() => {
      const value = { ...bank } as Record<string, unknown>;
      Object.defineProperty(value, "status", {
        configurable: true,
        enumerable: true,
        get: () => {
          getterCallCount += 1;
          return "ready";
        },
      });
      return Object.freeze(value);
    })();
    const customPrototype = (() => {
      const value = Object.create({ inheritedMetadata: true }) as Record<string, unknown>;
      Object.assign(value, bank);
      return Object.freeze(value);
    })();
    const inconsistentSnapshot = Object.freeze({ ...bank.snapshot, gameId: "foreign-public-bank" });
    const cases: readonly [string, unknown][] = [
      ["missing required public key", missingStatus],
      ["extra enumerable string key", makePublicBank({ unknownMetadata: 1 })],
      ["extra non-enumerable string key", nonEnumerableExtra],
      ["symbol key", symbolExtra],
      ["accessor key", accessorStatus],
      ["inherited custom prototype", customPrototype],
      ["status and summary status conflict", makePublicBank({}, { status: "degraded" })],
      ["accepted count exceeds particle count", makePublicBank({}, { acceptedParticleCount: 2 })],
      ["requested count disagrees with particle count", makePublicBank({}, { requestedParticleCount: 2 })],
      ["sampling attempts do not cover accepted and duplicate counts", makePublicBank({}, { samplingAttempts: 1, duplicateCount: 1 })],
      ["public and summary ESS conflict", makePublicBank({ effectiveSampleSize: 0.5 }, { effectiveSampleSize: 1 })],
      ["zero-weight count exceeds accepted count", makePublicBank({}, { zeroWeightCount: 2 })],
      ["ready bank has failed summary", makePublicBank({}, { status: "failed", failureReason: "insufficient-particles" })],
      ["snapshot public identity disagrees with ledger", makePublicBank({ snapshot: inconsistentSnapshot })],
      ["NaN particle count", makePublicBank({ particleCount: Number.NaN })],
      ["infinite particle count", makePublicBank({ particleCount: Number.POSITIVE_INFINITY })],
      ["fractional particle count", makePublicBank({ particleCount: 1.5 })],
      ["negative particle count", makePublicBank({ particleCount: -1 })],
      ["unsafe particle count", makePublicBank({ particleCount: Number.MAX_SAFE_INTEGER + 1 })],
    ];

    for (const [label, candidateBank] of cases) {
      const input = {
        ...base,
        scenarioSourceInput: { ...base.scenarioSourceInput, bank: candidateBank },
      } as unknown;
      let result: RolloutContractResult<RolloutRequest> | undefined;
      expect(() => { result = createRolloutRequest(input); }, label).not.toThrow();
      expect(result, label).toEqual({ ok: false, failure: { kind: "invalid-request", field: "scenarioSourceInput" } });
      expect(result, label).not.toHaveProperty("value");
    }
    expect(getterCallCount).toBe(0);
  });

  test("accepts a valid registered bank while preserving its opaque handle identity", () => {
    const input = makeRequestInput();
    const originalBank = input.scenarioSourceInput.bank;
    const result = createRolloutRequest(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scenarioSourceInput.bank).toBe(originalBank);
    expect(readParticleBankRolloutAccess(result.value.scenarioSourceInput.bank).ok).toBe(true);
  });

  test("leaves registration enforcement to the bridge for a public-shape-consistent unregistered bank", () => {
    const base = makeRequestInput();
    const unregisteredBank = Object.freeze({ ...base.scenarioSourceInput.bank });
    const request = createRolloutRequest({
      ...base,
      scenarioSourceInput: { ...base.scenarioSourceInput, bank: unregisteredBank },
    } as unknown);

    expect(request.ok).toBe(true);
    if (!request.ok) return;
    expect(request.value.scenarioSourceInput.bank).toBe(unregisteredBank);
    expect(createParticleScenarioSource(request.value.scenarioSourceInput)).toEqual({
      ok: false,
      failure: { kind: "fake-or-unknown-particle-bank" },
    });
  });

  test("returns a deep-isolated immutable projection for a known handle", () => {
    const bank = makeKnownBank();
    const first = readParticleBankRolloutAccess(bank);
    const second = readParticleBankRolloutAccess(bank);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.access.records).toHaveLength(1);
    expect(first.access.records).not.toBe(second.access.records);
    expect(first.access.records[0]).not.toBe(second.access.records[0]);
    expect(first.access.records[0]?.scenario).not.toBe(second.access.records[0]?.scenario);
    expect(Object.isFrozen(first.access)).toBe(true);
    expect(Object.isFrozen(first.access.records)).toBe(true);
    expect(Object.isFrozen(first.access.records[0]?.scenario)).toBe(true);
    expect(Object.isFrozen(first.access.records[0]?.scenario.initialDeal)).toBe(true);
    expect(Object.isFrozen(first.access.records[0]?.scenario.initialDeal.hands)).toBe(true);
    expect(Object.isFrozen(first.access.records[0]?.scenario.initialDeal.hands[0])).toBe(true);
    expect(Object.isFrozen(first.access.records[0]?.scenario.initialDeal.hands[0]?.[0])).toBe(true);

    const secondBeforeMutation = JSON.stringify(second.access);
    const mutableProbe = first.access as any;
    expect(() => mutableProbe.records[0].scenario.initialDeal.hands[0].pop()).toThrow();
    expect(JSON.stringify(second.access)).toBe(secondBeforeMutation);
  });

  test("constructs an isolated request with the frozen contract envelope", () => {
    const input = makeRequestInput();
    const result = createRolloutRequest(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.formalExecutionAllowed).toBe(false);
    expect(result.value).not.toBe(input);
    expect(result.value.candidates).not.toBe(input.candidates);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.candidates)).toBe(true);
    expect(Object.isFrozen(result.value.budget)).toBe(true);
    expect(Object.isFrozen(result.value.scenarioSourceInput)).toBe(true);

    const inputAction = input.candidates[0]!.action;
    const resultAction = result.value.candidates[0]!.action;
    if (inputAction.type !== "play" || resultAction.type !== "play") throw new Error("PLAY_ACTION_EXPECTED");
    inputAction.group.cards.pop();
    expect(resultAction.group.cards).toHaveLength(1);
  });

  test("accepts the fixed policy id without an executable policy field", () => {
    const legacyFreeInput = makeRequestInput() as unknown as Record<string, unknown>;
    const result = createRolloutRequest({
      ...legacyFreeInput,
      policyId: "d2f-lightweight-v1",
    } as unknown);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.policyId).toBe("d2f-lightweight-v1");
    expect(result.value.rootIdentity).toBe(replayRoot(result.value.scenarioSourceInput));
  });

  test("rejects a callback hidden in budget instead of retaining executable caller data", () => {
    let callbackCallCount = 0;
    const injectedClosure = () => {
      callbackCallCount += 1;
      return "captured";
    };
    const input = makeRequestInput() as unknown as Record<string, unknown>;
    const result = createRolloutRequest({
      ...input,
      budget: { ...(input.budget as object), callback: injectedClosure },
    } as unknown);

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-budget", field: "budget" } });
    expect(callbackCallCount).toBe(0);
    if (result.ok) expect((result.value.budget as unknown as Record<string, unknown>).callback).toBeUndefined();
  });

  test.each([
    ["extra string key", (limits: RolloutRequest["limits"], callback: () => string) => ({ ...limits, callback })],
    ["symbol key", (limits: RolloutRequest["limits"], callback: () => string) => {
      const value = { ...limits } as Record<PropertyKey, unknown>;
      Object.defineProperty(value, Symbol("limits"), { enumerable: true, value: callback });
      return value;
    }],
    ["accessor", (limits: RolloutRequest["limits"], callback: () => string) => {
      const value = { ...limits } as Record<string, unknown>;
      Object.defineProperty(value, "maxWorkUnits", { enumerable: true, configurable: true, get: callback });
      return value;
    }],
    ["non-plain prototype", (limits: RolloutRequest["limits"], _callback: () => string) => Object.assign(Object.create({ inheritedLimit: 1 }), limits)],
    ["inherited field", (limits: RolloutRequest["limits"], _callback: () => string) => Object.assign(Object.create({ inheritedLimit: 1 }), { ...limits })],
  ] as const)("rejects hostile limits %s before copying or executing it", (_name, buildLimits) => {
    let callbackCallCount = 0;
    const callback = () => {
      callbackCallCount += 1;
      return "captured";
    };
    const input = makeRequestInput();
    const result = createRolloutRequest({ ...input, limits: buildLimits(input.limits, callback) } as unknown);
    expect(result).toEqual({ ok: false, failure: { kind: "invalid-budget", field: "budget" } });
    expect(callbackCallCount).toBe(0);
  });

  test.each([
    ["candidate extra callback", (input: RolloutRequest, callback: () => string) => ({
      ...input,
      candidates: [{ ...input.candidates[0]!, callback }],
    }), "candidates"],
    ["action accessor", (input: RolloutRequest, callback: () => string) => {
      const action = { ...input.candidates[0]!.action } as Record<string, unknown>;
      Object.defineProperty(action, "type", { enumerable: true, configurable: true, get: callback });
      return { ...input, candidates: [{ ...input.candidates[0]!, action }] };
    }, "candidates"],
    ["group accessor", (input: RolloutRequest, callback: () => string) => {
      const baseAction = input.candidates[0]!.action;
      if (baseAction.type !== "play") throw new Error("PLAY_ACTION_EXPECTED");
      const group = { ...baseAction.group } as Record<string, unknown>;
      Object.defineProperty(group, "cards", { enumerable: true, configurable: true, get: callback });
      return {
        ...input,
        candidates: [{ ...input.candidates[0]!, action: { ...baseAction, group } }],
      };
    }, "candidates"],
    ["card accessor", (input: RolloutRequest, callback: () => string) => {
      const baseAction = input.candidates[0]!.action;
      if (baseAction.type !== "play") throw new Error("PLAY_ACTION_EXPECTED");
      const card = { ...baseAction.group.cards[0]! } as Record<string, unknown>;
      Object.defineProperty(card, "id", { enumerable: true, configurable: true, get: callback });
      const group = { ...baseAction.group, cards: [card] };
      return { ...input, candidates: [{ ...input.candidates[0]!, action: { ...baseAction, group } }] };
    }, "candidates"],
    ["scenario source accessor", (input: RolloutRequest, callback: () => string) => {
      const source = { ...input.scenarioSourceInput };
      Object.defineProperty(source, "publicState", { enumerable: true, configurable: true, get: callback });
      return { ...input, scenarioSourceInput: source };
    }, "scenarioSourceInput"],
  ] as const)("rejects %s without executing a nested accessor or retaining a callback", (_name, buildInput, field) => {
    let callbackCallCount = 0;
    const callback = () => {
      callbackCallCount += 1;
      return "captured";
    };
    const result = createRolloutRequest(buildInput(makeRequestInput(), callback));

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field } });
    expect(callbackCallCount).toBe(0);
  });

  test("rejects hostile nested dictionaries and arrays without executing probes", () => {
    const cases: readonly [(input: RolloutRequest, callback: () => string) => unknown, string][] = [
      [(input, callback) => {
        const evidence = { ...input.evidenceRequirements } as Record<PropertyKey, unknown>;
        Object.defineProperty(evidence, Symbol("evidence"), { enumerable: true, value: callback });
        return { ...input, evidenceRequirements: evidence };
      }, "evidenceRequirements"],
      [(input, callback) => {
        const risk = { ...input.riskPolicy } as Record<string, unknown>;
        Object.defineProperty(risk, "variancePenalty", { enumerable: true, configurable: true, get: callback });
        return { ...input, riskPolicy: risk };
      }, "riskPolicy"],
      [(input, callback) => {
        const state = { ...input.scenarioSourceInput.publicState } as Record<PropertyKey, unknown>;
        Object.defineProperty(state, Symbol("state"), { enumerable: true, value: callback });
        return { ...input, scenarioSourceInput: { ...input.scenarioSourceInput, publicState: state } };
      }, "scenarioSourceInput"],
      [(input, callback) => {
        const ledger = { ...input.scenarioSourceInput.initialLedger, seenEventHashes: { [Symbol("event")]: callback } };
        return {
          ...input,
          scenarioSourceInput: {
            ...input.scenarioSourceInput,
            initialLedger: ledger,
            finalLedger: ledger,
          },
        };
      }, "scenarioSourceInput"],
      [(input, callback) => {
        const hand = [...input.scenarioSourceInput.ownCurrentHand] as unknown as Record<PropertyKey, unknown>;
        Object.defineProperty(hand, "extra", { enumerable: true, value: callback });
        return { ...input, scenarioSourceInput: { ...input.scenarioSourceInput, ownCurrentHand: hand } };
      }, "scenarioSourceInput"],
      [(input, callback) => {
        const events = [] as unknown as Record<PropertyKey, unknown>;
        Object.defineProperty(events, "0", { enumerable: true, configurable: true, get: callback });
        Object.defineProperty(events, "length", { value: 1, writable: true, enumerable: false, configurable: false });
        return { ...input, scenarioSourceInput: { ...input.scenarioSourceInput, publicHistoryEvents: events } };
      }, "scenarioSourceInput"],
    ];

    for (const [buildInput, field] of cases) {
      let callbackCallCount = 0;
      const callback = () => {
        callbackCallCount += 1;
        return "captured";
      };
      expect(() => createRolloutRequest(buildInput(makeRequestInput(), callback))).not.toThrow();
      const result = createRolloutRequest(buildInput(makeRequestInput(), callback));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.kind).toMatch(/invalid/);
      expect(field.length).toBeGreaterThan(0);
      expect(callbackCallCount).toBe(0);
    }
  });

  test("rejects callback policy injection before executing or retaining the closure", () => {
    let callbackCallCount = 0;
    let capturedSecret = "initial-secret";
    const injected = () => {
      callbackCallCount += 1;
      return capturedSecret;
    };
    const legacyFreeInput = makeRequestInput() as unknown as Record<string, unknown>;
    const result = createRolloutRequest({
      ...legacyFreeInput,
      policyId: "d2f-lightweight-v1",
      policy: { chooseAction: injected },
    } as unknown);

    capturedSecret = "mutated-secret";
    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "policy" } });
    expect(callbackCallCount).toBe(0);
  });

  test("rejects every caller callback-shaped field with the fixed policy id", () => {
    let callbackCallCount = 0;
    const injected = () => {
      callbackCallCount += 1;
      return "captured";
    };
    const legacyFreeInput = makeRequestInput() as unknown as Record<string, unknown>;
    const callbackFields: readonly [string, unknown][] = [
      ["policy", { chooseAction: injected }],
      ["chooseAction", injected],
      ["policyFactory", injected],
      ["callback", injected],
      ["registry", { injected }],
    ];

    for (const [field, value] of callbackFields) {
      const result = createRolloutRequest({
        ...legacyFreeInput,
        policyId: "d2f-lightweight-v1",
        [field]: value,
      } as unknown);
      expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field } });
    }
    expect(callbackCallCount).toBe(0);
  });

  test("rejects inherited and symbol-key request injection", () => {
    let callbackCallCount = 0;
    const inheritedCallback = () => {
      callbackCallCount += 1;
      return "captured";
    };
    const base = makeRequestInput() as unknown as Record<string, unknown>;
    const inherited = Object.assign(
      Object.create({ policy: { chooseAction: inheritedCallback }, rawScenario: { hidden: true } }),
      base,
    );
    const symbol = Symbol("callback");

    expect(createRolloutRequest(inherited)).toEqual({ ok: false, failure: { kind: "invalid-request", field: "request" } });
    expect(createRolloutRequest({ ...base, [symbol]: inheritedCallback })).toEqual({
      ok: false,
      failure: { kind: "invalid-request", field: "request" },
    });
    const { mode: _missingMode, ...missingMode } = base;
    expect(createRolloutRequest(missingMode)).toEqual({ ok: false, failure: { kind: "invalid-request", field: "mode" } });
    expect(callbackCallCount).toBe(0);
  });

  test("rejects every unsupported policy id with a typed failure", () => {
    const input = makeRequestInput() as unknown as Record<string, unknown>;
    for (const policyId of ["custom", "", 1, null, undefined]) {
      expect(createRolloutRequest({ ...input, policyId })).toEqual({
        ok: false,
        failure: { kind: "invalid-request", field: "policyId" },
      });
    }
  });

  test("keeps the validated request recursively free of functions", () => {
    const result = createRolloutRequest(makeRequestInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const seen = new WeakSet<object>();
    const visit = (value: unknown): void => {
      expect(typeof value).not.toBe("function");
      if (value === null || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      for (const child of Object.values(value)) visit(child);
    };
    visit(result.value);
  });

  test("keeps RolloutReplicateInput free of executable policy", () => {
    const request = makeRequestInput();
    const budget = validateRolloutBudget({ budget: request.budget, limits: request.limits });
    expect(budget.ok).toBe(true);
    if (!budget.ok) return;

    const replicateInput: RolloutReplicateInput = {
      candidate: request.candidates[0]!,
      scenario: { scenarioIdentity: "scenario", normalizedWeight: 1, privateState: {} },
      publicState: request.scenarioSourceInput.publicState,
      replicateIdentity: "replicate",
      random: { value: () => 0.5 },
      validatedBudget: budget.value,
    };
    expect("policy" in replicateInput).toBe(false);
  });

  test("requires a revalidated request for result provenance and rejects assembly root fields", () => {
    const request = makeRequestInput();
    const resultInput = makeResultInput();
    const assembly = {
      candidateSummaries: resultInput.candidateSummaries,
      ranking: resultInput.ranking,
      aggregateDiagnostics: resultInput.aggregateDiagnostics,
    };
    const factory = createRolloutResult as unknown as (requestInput: unknown, assemblyInput: unknown) => unknown;
    const result = factory(request, assembly) as RolloutContractResult<RolloutResult>;

    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (result.ok) {
      expect(result.value.mode).toBe(request.mode);
      expect(result.value.formalExecutionAllowed).toBe(false);
      expect(result.value.policyId).toBe(request.policyId);
      expect(result.value.rootDigest).not.toBe("f".repeat(64));
      expect(result.value.schemaVersion).toBe("d2f-rollout-result-v2");
    }

    for (const field of ["rootDigest", "rootIdentity", "policyId", "mode", "formalExecutionAllowed", "replayContextIdentity"] as const) {
      expect(factory(request, { ...assembly, [field]: "f".repeat(64) })).toEqual({
        ok: false,
        failure: { kind: "invalid-request", field: "assemblyInput" },
      });
    }
    expect(factory(request, {
      ...assembly,
      aggregateDiagnostics: { ...assembly.aggregateDiagnostics, telemetry: () => "must-not-escape" },
    })).toEqual({ ok: false, failure: { kind: "invalid-request", field: "assemblyInput" } });
  });

  test("does not expose an arbitrary raw replay-context digest helper", () => {
    expect("rootDigestFromReplayContextIdentity" in rolloutContracts).toBe(false);
  });

  test("exposes only the candidate-local decision association identity", () => {
    const association = (rolloutContracts as Record<string, unknown>).canonicalCandidateDecisionAssociationIdentity;
    expect(typeof association).toBe("function");
    expect("canonicalDecisionIdentity" in rolloutContracts).toBe(false);
    if (typeof association !== "function") return;
    const rootIdentity = "a".repeat(64);
    const firstCandidate = canonicalActionIdentity(makeAction());
    const secondCandidate = canonicalActionIdentity(makeAction(1));
    const first = association({ rootIdentity, candidateIdentity: firstCandidate, ply: 0, actingSeat: 0, semanticKey: "policy-action" });
    const second = association({ rootIdentity, candidateIdentity: secondCandidate, ply: 0, actingSeat: 0, semanticKey: "policy-action" });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  test("validates and preserves RolloutResult policy provenance without changing rootDigest", () => {
    const request = makeRequestInput();
    const input = makeResultInput();
    const result = createRolloutResult(request, makeResultAssemblyInput(input));
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.value.policyId).toBe("d2f-lightweight-v1");
    expect(result.value.rootDigest).not.toBe(input.rootDigest);
    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.candidateSummaries)).toBe(true);
    const repeated = createRolloutResult(request, makeResultAssemblyInput(input));
    expect(repeated.ok).toBe(true);
    if (repeated.ok) expect(repeated.value.rootDigest).toBe(result.value.rootDigest);
    const changedSource = makeSourceInput(undefined, 1);
    const changedRequest = {
      ...request,
      rootIdentity: replayRoot(changedSource),
      scenarioSourceInput: changedSource,
    };
    const changed = createRolloutResult(changedRequest, makeResultAssemblyInput(input));
    expect(changed.ok).toBe(true);
    if (changed.ok) expect(changed.value.rootDigest).not.toBe(result.value.rootDigest);

    const { policyId: _missingPolicyId, ...missingPolicyId } = request;
    expect(createRolloutResult(missingPolicyId, makeResultAssemblyInput(input))).toEqual({ ok: false, failure: { kind: "invalid-request", field: "policyId" } });
    expect(createRolloutResult({ ...request, policyId: "custom" }, makeResultAssemblyInput(input))).toEqual({
      ok: false,
      failure: { kind: "invalid-request", field: "policyId" },
    });
    expect(createRolloutResult({ ...request, rawScenario: { hidden: true } } as unknown, makeResultAssemblyInput(input))).toEqual({
      ok: false,
      failure: { kind: "invalid-request", field: "rawScenario" },
    });
  });

  test("binds result summaries and ranking exactly to validated request candidates", () => {
    const singleCandidateRequest = makeRequestInput();
    const firstCandidate = singleCandidateRequest.candidates[0]!;
    const secondAction = makeAction(1);
    const secondCandidate = { ...firstCandidate, candidateId: canonicalActionIdentity(secondAction), action: secondAction };
    const request = { ...singleCandidateRequest, candidates: [firstCandidate, secondCandidate] };
    const firstSummary = makeResultInput().candidateSummaries[0]!;
    const secondSummary = { ...firstSummary, candidateId: secondCandidate.candidateId };
    const sortedSummaries = [firstSummary, secondSummary].sort((left, right) => left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0);
    const validAssembly = {
      candidateSummaries: sortedSummaries,
      ranking: [secondCandidate.candidateId, firstCandidate.candidateId],
      aggregateDiagnostics: {
        ...makeResultInput().aggregateDiagnostics,
        completedReplicateCount: 2,
        expectedCompletedReplicateCount: 2,
        candidateCount: 2,
        workUnitCount: 2,
      },
    };
    const valid = createRolloutResult(request, validAssembly);
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.value.ranking).toEqual([secondCandidate.candidateId, firstCandidate.candidateId]);

    const foreignCandidateId = "f".repeat(64);
    const cases = [
      {
        label: "foreign summary",
        assembly: { ...validAssembly, candidateSummaries: [firstSummary, { ...secondSummary, candidateId: foreignCandidateId }] },
      },
      {
        label: "missing request candidate",
        assembly: {
          candidateSummaries: [firstSummary],
          ranking: [firstCandidate.candidateId],
          aggregateDiagnostics: { ...validAssembly.aggregateDiagnostics, candidateCount: 1, workUnitCount: 1, completedReplicateCount: 1, expectedCompletedReplicateCount: 1 },
        },
      },
      {
        label: "extra summary",
        assembly: {
          candidateSummaries: [firstSummary, secondSummary, { ...firstSummary, candidateId: foreignCandidateId }].sort((left, right) => left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0),
          ranking: [firstCandidate.candidateId, secondCandidate.candidateId, foreignCandidateId],
          aggregateDiagnostics: { ...validAssembly.aggregateDiagnostics, candidateCount: 3, workUnitCount: 3, completedReplicateCount: 3, expectedCompletedReplicateCount: 3 },
        },
      },
      {
        label: "duplicate summary",
        assembly: { ...validAssembly, candidateSummaries: [firstSummary, firstSummary] },
      },
      {
        label: "foreign ranking",
        assembly: { ...validAssembly, ranking: [firstCandidate.candidateId, foreignCandidateId] },
      },
      {
        label: "missing ranking candidate",
        assembly: { ...validAssembly, ranking: [firstCandidate.candidateId] },
      },
      {
        label: "duplicate ranking",
        assembly: { ...validAssembly, ranking: [firstCandidate.candidateId, firstCandidate.candidateId] },
      },
      {
        label: "summary and ranking sets differ",
        assembly: { ...validAssembly, ranking: [firstCandidate.candidateId, foreignCandidateId] },
      },
    ] as const;
    for (const testCase of cases) {
      const result = createRolloutResult(request, testCase.assembly);
      expect(result.ok, testCase.label).toBe(false);
      expect(result).not.toHaveProperty("value");
    }
  });

  test("rejects a noncanonical root identity even when it is non-empty", () => {
    expect(createRolloutRequest({ ...makeRequestInput(), rootIdentity: "f".repeat(64) })).toEqual({
      ok: false,
      failure: { kind: "invalid-request", field: "rootIdentity" },
    });
  });

  test("derives replay root identity from semantic ledger, seat, hand, rank and bank context", () => {
    const base = makeSourceInput();
    const baseRoot = replayRoot(base);
    expect(replayRoot(makeSourceInput(undefined, 1))).not.toBe(baseRoot);
    expect(replayRoot({
      ...base,
      gameRank: "A",
      publicState: { ...base.publicState, gameRank: "A" },
      bank: makeKnownBank(1, { ...base.bank.snapshot, gameRank: "A" }),
    })).not.toBe(baseRoot);
    expect(replayRoot({
      ...base,
      ownCurrentHand: [...base.ownCurrentHand.slice(0, -1), createDeck()[27]!],
    })).not.toBe(baseRoot);
    expect(replayRoot({
      ...base,
      perspectiveSeat: 1,
      publicState: { ...base.publicState, perspectiveSeat: 1, partnerSeat: 3 },
      bank: makeKnownBank(1, { ...base.bank.snapshot, perspectiveSeat: 1 }),
    })).not.toBe(baseRoot);

  });

  test("matches an independent replay-root oracle and rejects root-digest injection", () => {
    const base = makeSourceInput();
    const independentRoot = independentReplayContextIdentity(base);
    const independentDigest = independentRootDigest(independentRoot);
    expect(independentLedgerHash(base.initialLedger)).toBe(base.bank.snapshot.initialLedgerHash);
    expect(independentLedgerHash(base.finalLedger)).toBe(base.bank.snapshot.ledgerHash);
    expect(independentRoot).toBe("9873bd3e9d2bb06a623b9e534a5dc1f125f1aeb4f6e6d2318816e16d2a255a23");
    expect(independentDigest).toBe("6d9ddb8e5dce2c2311708720cd37a673954adfc0a357b9dd0c47b9f8f29b9d13");
    expect(replayRoot(base)).toBe(independentRoot);

    const request = makeRequestInput();
    const assembly = makeResultAssemblyInput();
    const result = createRolloutResult(request, assembly);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.rootDigest).toBe(independentRootDigest(independentRoot));
    expect(createRolloutResult(request, { ...assembly, rootDigest: "f".repeat(64) } as unknown)).toEqual({
      ok: false,
      failure: { kind: "invalid-request", field: "assemblyInput" },
    });

    const changedTrickLedger = {
      ...base.initialLedger,
      currentTrick: { ...base.initialLedger.currentTrick, trickIndex: 1 },
    } as HardPublicLedger;
    const changedTrickHash = canonicalPublicLedgerHash(changedTrickLedger);
    const mutationCases: readonly [string, RolloutScenarioSourceInput][] = [
      ["public history", makeAntiTributeSourceInput()],
      ["ledger hash and index", { ...makeAntiTributeSourceInput(), publicHistoryEvents: [] }],
      ["game rank", {
        ...base,
        gameRank: "A",
        publicState: { ...base.publicState, gameRank: "A" },
        bank: makeKnownBank(1, { ...base.bank.snapshot, gameRank: "A" }),
      }],
      ["acting seat", makeSourceInput(undefined, 1)],
      ["own hand", { ...base, ownCurrentHand: [...base.ownCurrentHand.slice(0, -1), createDeck()[27]!] }],
      ["current trick", {
        ...base,
        initialLedger: changedTrickLedger,
        finalLedger: changedTrickLedger,
        bank: makeKnownBank(1, {
          ...base.bank.snapshot,
          initialLedgerHash: changedTrickHash,
          ledgerHash: changedTrickHash,
        }),
      }],
      ["ParticleBank snapshot identity", {
        ...base,
        bank: makeKnownBank(1, { ...base.bank.snapshot, handIdentity: "independent-oracle-foreign-hand" }),
      }],
    ];
    const changedRoots = mutationCases.map(([label, input]) => {
      const changedRoot = independentReplayContextIdentity(input);
      expect(changedRoot, label).not.toBe(independentRoot);
      return changedRoot;
    });
    expect(new Set(changedRoots).size).toBe(changedRoots.length);
  });

  test("rejects private fields in source input, public state, events and ledgers", () => {
    const input = makeRequestInput();
    const cases: readonly RolloutScenarioSourceInput[] = [
      { ...input.scenarioSourceInput, room: {} } as RolloutScenarioSourceInput,
      { ...input.scenarioSourceInput, rawScenario: {} } as RolloutScenarioSourceInput,
      { ...input.scenarioSourceInput, publicState: { ...input.scenarioSourceInput.publicState, opponentHands: {} } } as unknown as RolloutScenarioSourceInput,
      { ...input.scenarioSourceInput, publicState: { ...input.scenarioSourceInput.publicState, initialHands: {} } } as unknown as RolloutScenarioSourceInput,
      { ...input.scenarioSourceInput, publicHistoryEvents: [{ privatePayload: {} }] as any },
      { ...input.scenarioSourceInput, initialLedger: { ...input.scenarioSourceInput.initialLedger, rawHands: {} } as any },
    ];

    for (const scenarioSourceInput of cases) {
      expect(createRolloutRequest({ ...input, scenarioSourceInput })).toEqual({
        ok: false,
        failure: { kind: "invalid-request", field: "scenarioSourceInput" },
      });
    }
  });

  test("rejects a public state with an invalid current last-play seat", () => {
    const input = makeRequestInput();
    const scenarioSourceInput = {
      ...input.scenarioSourceInput,
      publicState: {
        ...input.scenarioSourceInput.publicState,
        currentLastPlay: makeAction().group,
        currentLastPlaySeat: 9,
      },
    } as unknown as RolloutScenarioSourceInput;
    const result = createRolloutRequest({
      ...input,
      scenarioSourceInput,
    } as unknown);

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "scenarioSourceInput" } });
  });

  test("returns a typed failure when caller-owned source input cannot be cloned", () => {
    const input = makeRequestInput();
    const result = createRolloutRequest({
      ...input,
      scenarioSourceInput: {
        ...input.scenarioSourceInput,
        publicState: { ...input.scenarioSourceInput.publicState, currentLastPlay: new WeakMap() },
      },
    } as unknown);

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "scenarioSourceInput" } });
  });

  test("rejects a shallow-frozen bank with mutable nested caller state", () => {
    const input = makeRequestInput();
    const shallowBank = structuredClone(input.scenarioSourceInput.bank) as ParticleBank;
    Object.freeze(shallowBank);
    const result = createRolloutRequest({
      ...input,
      scenarioSourceInput: { ...input.scenarioSourceInput, bank: shallowBank },
    });

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "scenarioSourceInput" } });
  });

  test("rejects non-finite, fractional, non-positive and overflowing budgets", () => {
    const input = makeRequestInput();
    const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0, -1, Number.MAX_SAFE_INTEGER + 1];
    for (const value of invalidValues) {
      const result = validateRolloutBudget({
        budget: { ...input.budget, maxWorkUnits: value },
        limits: input.limits,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure.kind).toBe("invalid-budget");
    }

    const overflow = validateRolloutBudget({
      budget: {
        replicateCountPerScenario: Number.MAX_SAFE_INTEGER,
        maxPliesPerReplicate: 2,
        maxPolicyActionEvaluationsPerPly: 2,
        maxWorkUnits: Number.MAX_SAFE_INTEGER,
      },
      limits: {
        maxReplicateCountPerScenario: Number.MAX_SAFE_INTEGER,
        maxPliesPerReplicate: 2,
        maxPolicyActionEvaluationsPerPly: 2,
        maxWorkUnits: Number.MAX_SAFE_INTEGER,
      },
    });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.failure).toEqual({ kind: "invalid-budget", field: "maxWorkUnits" });
  });

  test("rejects true formal execution and keeps result failures discriminated", () => {
    const invalid = createRolloutRequest({
      ...makeRequestInput(),
      formalExecutionAllowed: true,
    } as unknown);
    expect(invalid).toEqual({ ok: false, failure: { kind: "invalid-request", field: "formalExecutionAllowed" } });

    const result = createRolloutResult(makeRequestInput(), makeResultAssemblyInput());
    expect(result.ok).toBe(true);
    const failure: { ok: false; failure: RolloutFailure } = {
      ok: false,
      failure: { kind: "fake-or-unknown-particle-bank" },
    };
    expect(failure.ok).toBe(false);
    expect(result.ok).toBe(true);
  });


  test("canonicalizes action, decision, replicate and replay identities without CRN draws", () => {
    const action = makeAction();
    const reorderedAction: RolloutAction = {
      type: "play",
      group: {
        ...action.group,
        cards: [...action.group.cards].reverse(),
        wildcards: [],
        label: "different presentation",
      },
    };
    expect(canonicalActionIdentity(action)).toBe(canonicalActionIdentity(reorderedAction));
    expect(canonicalActionIdentity(action)).not.toBe(canonicalActionIdentity(makeAction(1)));
    expect(canonicalReplicateIdentity(7)).toBe(canonicalReplicateIdentity(7));
    expect(canonicalReplicateIdentity(7)).not.toBe(canonicalReplicateIdentity(8));

    const decision = canonicalCandidateDecisionAssociationIdentity({
      rootIdentity: "root",
      candidateIdentity: canonicalActionIdentity(action),
      ply: 0,
      actingSeat: 0,
      semanticKey: "policy-action",
    });
    expect(decision).toMatch(/^[a-f0-9]{64}$/);

    const sourceInput = makeSourceInput();
    const context = canonicalReplayContextIdentity({
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
    expect(context).toMatch(/^[a-f0-9]{64}$/);
    expect(() => canonicalReplayContextIdentity({
      publicHistoryEvents: [{ eventIndex: -1, publicPayloadHash: "a".repeat(64) } as any],
      initialLedger: sourceInput.initialLedger,
      finalLedger: sourceInput.finalLedger,
      gameRank: sourceInput.gameRank,
      perspectiveSeat: sourceInput.perspectiveSeat,
      ownCurrentHand: sourceInput.ownCurrentHand,
      actingSeat: sourceInput.publicState.actingSeat,
      publicState: sourceInput.publicState,
      particleBankSnapshot: sourceInput.bank.snapshot,
    })).toThrow("REPLAY_CONTEXT_INVALID");
    const keyedView = { value: (_semanticKey: string) => 0.5 };
    expect("next" in keyedView).toBe(false);
    expect(JSON.stringify(keyedView)).not.toContain("seed");
  });

  test("includes strength and wildcard realization in action identity while ignoring presentation fields", () => {
    const base = makeAction();
    const reordered: RolloutAction = {
      ...base,
      group: { ...base.group, cards: [...base.group.cards].reverse() },
    };
    const changedStrength: RolloutAction = {
      ...base,
      group: { ...base.group, strength: base.group.strength + 1 },
    };
    const changedWildcards: RolloutAction = {
      ...base,
      group: { ...base.group, wildcards: [base.group.cards[0]!] },
    };
    const presentationOnly: RolloutAction = {
      ...base,
      group: { ...base.group, id: "presentation-id", label: "display-only", purpose: "engine" },
    };

    expect(canonicalActionIdentity(reordered)).toBe(canonicalActionIdentity(base));
    expect(canonicalActionIdentity(changedStrength)).not.toBe(canonicalActionIdentity(base));
    expect(canonicalActionIdentity(changedWildcards)).not.toBe(canonicalActionIdentity(base));
    expect(canonicalActionIdentity(presentationOnly)).toBe(canonicalActionIdentity(base));
  });

  test("rejects a card whose id disagrees with its rank, suit and copy", () => {
    const action = makeAction();
    expect(() => canonicalActionIdentity({
      ...action,
      group: {
        ...action.group,
        cards: [{ ...action.group.cards[0]!, id: "CA-1" }],
      },
    })).toThrow("ACTION_CARD_INVALID");
  });

  test("keeps actions with different engine play power identities distinct", () => {
    const deck = createDeck();
    const bomb = detectGroups([deck[0]!, deck[13]!, deck[26]!, deck[39]!], "2").find((group) => group.type === "bomb");
    if (bomb === undefined) throw new Error("BOMB_FIXTURE_MISSING");
    const single = detectGroups([deck[0]!], "2").find((group) => group.type === "single");
    if (single === undefined) throw new Error("SINGLE_FIXTURE_MISSING");
    expect(playPower(bomb, "2")).not.toBe(playPower(single, "2"));
    expect(canonicalActionIdentity({ type: "play", group: bomb })).not.toBe(canonicalActionIdentity({ type: "play", group: single }));
  });

  test("rejects a non-wild ordinary card in the CardGroup wildcard projection", () => {
    const input = makeRequestInput();
    const baseAction = input.candidates[0]!.action;
    if (baseAction.type !== "play") throw new Error("PLAY_ACTION_EXPECTED");
    const action: RolloutAction = {
      type: "play",
      group: { ...baseAction.group, wildcards: [baseAction.group.cards[0]!] },
    };
    const result = createRolloutRequest({
      ...input,
      candidates: [{ ...input.candidates[0]!, candidateId: canonicalActionIdentity(action), action }],
    });

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "candidates" } });
  });

  test("accepts only a legal current-game-rank red-heart wildcard", () => {
    const input = makeRequestInput();
    const baseAction = input.candidates[0]!.action;
    if (baseAction.type !== "play") throw new Error("PLAY_ACTION_EXPECTED");
    const legalWildcard = createDeck().find((card) => card.kind === "suited" && card.suit === "hearts" && card.rank === input.scenarioSourceInput.gameRank);
    if (legalWildcard === undefined) throw new Error("LEGAL_WILDCARD_FIXTURE_MISSING");
    const action: RolloutAction = {
      type: "play",
      group: { ...baseAction.group, cards: [legalWildcard], wildcards: [legalWildcard] },
    };
    const result = createRolloutRequest({
      ...input,
      candidates: [{ ...input.candidates[0]!, candidateId: canonicalActionIdentity(action), action }],
    });

    expect(result.ok).toBe(true);
  });

  test("rejects every non-contextual wildcard projection", () => {
    const input = makeRequestInput();
    const baseAction = input.candidates[0]!.action;
    if (baseAction.type !== "play") throw new Error("PLAY_ACTION_EXPECTED");
    const deck = createDeck();
    const legalWildcard = deck.find((card) => card.kind === "suited" && card.suit === "hearts" && card.rank === input.scenarioSourceInput.gameRank);
    const otherSuitSameRank = deck.find((card) => card.kind === "suited" && card.suit !== "hearts" && card.rank === input.scenarioSourceInput.gameRank);
    const wrongHeartRank = deck.find((card) => card.kind === "suited" && card.suit === "hearts" && card.rank !== input.scenarioSourceInput.gameRank);
    const joker = deck.find((card) => card.kind === "joker");
    if (legalWildcard === undefined || otherSuitSameRank === undefined || wrongHeartRank === undefined || joker === undefined) throw new Error("WILDCARD_FIXTURE_MISSING");
    const cases: readonly [string, RolloutAction][] = [
      ["other-suit same-rank", { type: "play", group: { ...baseAction.group, cards: [otherSuitSameRank], wildcards: [otherSuitSameRank] } }],
      ["wrong heart rank", { type: "play", group: { ...baseAction.group, cards: [wrongHeartRank], wildcards: [wrongHeartRank] } }],
      ["joker", { type: "play", group: { ...baseAction.group, cards: [joker], wildcards: [joker] } }],
      ["wildcard outside cards", { type: "play", group: { ...baseAction.group, cards: [baseAction.group.cards[0]!], wildcards: [legalWildcard] } }],
      ["duplicate wildcard", { type: "play", group: { ...baseAction.group, cards: [legalWildcard], wildcards: [legalWildcard, legalWildcard] } }],
    ];
    for (const [_label, action] of cases) {
      const result = createRolloutRequest({
        ...input,
        candidates: [{ ...input.candidates[0]!, candidateId: canonicalActionIdentity(baseAction), action }],
      });
      expect(result.ok).toBe(false);
    }
  });

  test("rejects aggregate replicate counts that ignore candidate multiplicity", () => {
    const first = makeResultInput();
    const secondCandidateId = canonicalActionIdentity(makeAction(1));
    const summaries = [
      ...first.candidateSummaries.map((summary) => ({ ...summary, completedReplicateCount: 2 })),
      {
        ...first.candidateSummaries[0]!,
        candidateId: secondCandidateId,
        completedReplicateCount: 2,
      },
    ].sort((left, right) => left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0);
    const result = createRolloutResult(makeRequestInput(), makeResultAssemblyInput({
      ...first,
      candidateSummaries: summaries,
      ranking: summaries.map((summary) => summary.candidateId),
      aggregateDiagnostics: {
        ...first.aggregateDiagnostics,
        completedReplicateCount: 2,
        expectedCompletedReplicateCount: 2,
        candidateCount: 2,
      },
    }));

    expect(result.ok).toBe(false);
  });

  test("keeps candidate replicate counts local while aggregate counts sum candidates", () => {
    const first = makeResultInput();
    const request = makeRequestInput();
    const secondCandidateId = canonicalActionIdentity(makeAction(1));
    const secondCandidate = { ...request.candidates[0]!, candidateId: secondCandidateId, action: makeAction(1) };
    const summaries = [
      { ...first.candidateSummaries[0]!, acceptedScenarioCount: 2, completedReplicateCount: 2, expectedReplicateCount: 2 },
      { ...first.candidateSummaries[0]!, candidateId: secondCandidateId, acceptedScenarioCount: 2, completedReplicateCount: 2, expectedReplicateCount: 2 },
    ].sort((left, right) => left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0);
    const result = createRolloutResult({
      ...request,
      candidates: [request.candidates[0]!, secondCandidate],
    }, makeResultAssemblyInput({
      ...first,
      candidateSummaries: summaries,
      ranking: summaries.map((summary) => summary.candidateId),
      aggregateDiagnostics: {
        ...first.aggregateDiagnostics,
        acceptedScenarioCount: 2,
        completedReplicateCount: 4,
        expectedCompletedReplicateCount: 4,
        candidateCount: 2,
        workUnitCount: 2,
      },
    }));

    expect(result.ok).toBe(true);
  });

  test("rejects overflowing candidate coverage products", () => {
    const input = makeResultInput();
    const result = createRolloutResult(makeRequestInput(), makeResultAssemblyInput({
      ...input,
      candidateSummaries: [{
        ...input.candidateSummaries[0]!,
        acceptedScenarioCount: Number.MAX_SAFE_INTEGER,
        replicateCountPerScenario: 2,
      }],
    }));

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "candidateSummaries" } });
  });

  test("rejects zero evidence requirements", () => {
    const input = makeRequestInput();
    for (const field of ["minimumEffectiveSampleSize", "minimumAcceptedScenarioCount", "minimumCompletedReplicateCount"] as const) {
      for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(validateRolloutEvidenceRequirements({
          ...input.evidenceRequirements,
          [field]: value,
        })).toEqual({
          ok: false,
          failure: { kind: "invalid-evidence-requirements", field },
        });
      }
    }
  });

  test("rejects evidence thresholds above the request budget upper bound", () => {
    const input = makeRequestInput();
    for (const field of ["minimumEffectiveSampleSize", "minimumAcceptedScenarioCount", "minimumCompletedReplicateCount"] as const) {
      expect(createRolloutRequest({
        ...input,
        evidenceRequirements: { ...input.evidenceRequirements, [field]: input.budget.maxWorkUnits + 1 },
      })).toEqual({
        ok: false,
        failure: { kind: "invalid-evidence-requirements", field },
      });
    }
  });

  test("rejects private or unknown fields in public result diagnostics", () => {
    const result = createRolloutResult(makeRequestInput(), makeResultAssemblyInput({
      ...makeResultInput(),
      aggregateDiagnostics: {
        ...makeResultInput().aggregateDiagnostics,
        rawScenario: { hiddenTransferAssignments: ["private"] },
        particleSeed: "secret",
      },
    } as any));

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "aggregateDiagnostics" } });
  });

  test("rejects non-finite candidate score and action strength values", () => {
    const input = makeRequestInput();
    for (const strength of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      const invalidAction = {
        ...input.candidates[0]!.action,
        group: { ...(input.candidates[0]!.action as Extract<RolloutAction, { type: "play" }>).group, strength },
      } as RolloutAction;
      const invalidActionRequest = createRolloutRequest({
        ...input,
        candidates: [{ ...input.candidates[0]!, action: invalidAction }],
      });
      expect(invalidActionRequest).toEqual({ ok: false, failure: { kind: "invalid-request", field: "candidates" } });
    }

    const invalidScoreRequest = createRolloutRequest({
      ...input,
      candidates: [{ ...input.candidates[0]!, baselineEvaluatorScore: Number.POSITIVE_INFINITY }],
    });
    expect(invalidScoreRequest).toEqual({ ok: false, failure: { kind: "invalid-request", field: "candidates" } });
  });

  test("rejects extra action fields instead of retaining caller-owned data", () => {
    const input = makeRequestInput();
    const action = {
      ...input.candidates[0]!.action,
      privateDiagnostic: "must-not-escape",
    } as unknown as RolloutAction;

    const result = createRolloutRequest({
      ...input,
      candidates: [{ ...input.candidates[0]!, action }],
    });

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "candidates" } });
  });

  test("rejects non-finite evidence, risk and result measures", () => {
    const evidence = makeRequestInput().evidenceRequirements;
    for (const minimumEffectiveSampleSize of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateRolloutEvidenceRequirements({ ...evidence, minimumEffectiveSampleSize })).toEqual({
        ok: false,
        failure: { kind: "invalid-evidence-requirements", field: "minimumEffectiveSampleSize" },
      });
    }
    for (const minimumAcceptedScenarioCount of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
      expect(validateRolloutEvidenceRequirements({ ...evidence, minimumAcceptedScenarioCount })).toEqual({
        ok: false,
        failure: { kind: "invalid-evidence-requirements", field: "minimumAcceptedScenarioCount" },
      });
    }

    const riskPolicy = makeRequestInput().riskPolicy;
    expect(validateRolloutRiskPolicy({ ...riskPolicy, variancePenalty: Number.NaN })).toEqual({
      ok: false,
      failure: { kind: "invalid-risk-policy", field: "variancePenalty" },
    });
    expect(validateRolloutRiskPolicy({ ...riskPolicy, downsideRiskPenalty: Number.POSITIVE_INFINITY })).toEqual({
      ok: false,
      failure: { kind: "invalid-risk-policy", field: "downsideRiskPenalty" },
    });

    for (const field of ["riskAdjustedUtility", "expectedUtility", "variance", "risk", "baselineEvaluatorScore"] as const) {
      expect(createRolloutResult(makeRequestInput(), makeResultAssemblyInput({
        ...makeResultInput(),
        candidateSummaries: [{ ...makeResultInput().candidateSummaries[0]!, [field]: Number.NaN }],
      }))).toEqual({ ok: false, failure: { kind: "invalid-request", field: "candidateSummaries" } });
    }
  });

  test("proves the private ParticleBank bridge is the only symbol-level access path", () => {
    const sourceRoot = path.resolve(process.cwd(), "src");
    const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
    const configRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configRead.error !== undefined) throw new Error("TSCONFIG_READ_FAILED");
    const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, process.cwd());
    const sourceNames = ts.sys.readDirectory(sourceRoot, [".ts"], undefined, undefined);
    const program = ts.createProgram({ rootNames: sourceNames, options: parsed.options });
    const checker = program.getTypeChecker();
    const files = sourceNames.map((name) => program.getSourceFile(name)).filter((file): file is ts.SourceFile => file !== undefined);
    const normalize = (value: string): string => value.replaceAll("\\", "/");
    const sourcePath = (file: ts.SourceFile): string => normalize(file.fileName);
    const declarationFile = (symbol: ts.Symbol): string | undefined => {
      const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return resolved.declarations?.[0]?.getSourceFile().fileName;
    };
    const internalFile = files.find((file) => sourcePath(file).endsWith("/src/ai/particles/particleBankInternals.ts"));
    const bridgeFile = files.find((file) => sourcePath(file).endsWith("/src/ai/particles/particleBankRolloutAccess.ts"));
    const sourceFile = files.find((file) => sourcePath(file).endsWith("/src/ai/rollout/particleScenarioSource.ts"));
    expect(internalFile).toBeDefined();
    expect(bridgeFile).toBeDefined();
    expect(sourceFile).toBeDefined();
    if (internalFile === undefined || bridgeFile === undefined || sourceFile === undefined) return;

    const privateModule = checker.getSymbolAtLocation(internalFile);
    if (privateModule === undefined) throw new Error("PRIVATE_MODULE_SYMBOL_MISSING");
    const contractsFile = files.find((file) => sourcePath(file).endsWith("/src/ai/rollout/contracts.ts"));
    const bridgeModule = checker.getSymbolAtLocation(bridgeFile);
    if (contractsFile === undefined || bridgeModule === undefined) throw new Error("CONTRACT_OR_BRIDGE_MODULE_SYMBOL_MISSING");
    const contractsModule = checker.getSymbolAtLocation(contractsFile);
    if (contractsModule === undefined) throw new Error("CONTRACT_MODULE_SYMBOL_MISSING");
    const resolveSymbol = (symbol: ts.Symbol): ts.Symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const contractsExports = checker.getExportsOfModule(contractsModule);
    const associationSymbols = new Set(contractsExports
      .filter((symbol) => symbol.name === "CanonicalCandidateDecisionAssociationIdentity" || symbol.name === "canonicalCandidateDecisionAssociationIdentity")
      .map(resolveSymbol));
    expect(associationSymbols.size).toBe(2);
    const crnCoordinateExport = contractsExports.find((symbol) => symbol.name === "CrnCoordinate");
    if (crnCoordinateExport === undefined) throw new Error("CRN_COORDINATE_SYMBOL_MISSING");
    const crnCoordinateSymbol: ts.Symbol = crnCoordinateExport;
    const crnMembers = checker.getDeclaredTypeOfSymbol(resolveSymbol(crnCoordinateSymbol)).getProperties().map((symbol) => symbol.name);
    expect(crnMembers).toEqual(["rootIdentity", "scenarioIdentity", "replicateIdentity", "ply", "actingSeat", "randomDomain"]);
    expect(crnMembers).not.toContain("candidateIdentity");
    const sourceFilePath = sourcePath(sourceFile);
    const privateSymbols = new Set(checker.getExportsOfModule(privateModule).map(resolveSymbol));
    const bridgeSymbols = new Set(checker.getExportsOfModule(bridgeModule).map(resolveSymbol));
    const contractSymbols = new Set(checker.getExportsOfModule(contractsModule!).map(resolveSymbol));
    const directReadImporters: string[] = [];
    const rolloutInternalImporters: string[] = [];
    const bridgeImporters: string[] = [];
    const forbiddenPrivateConsumers: string[] = [];
    const privateSourceConsumers: string[] = [];
    const bridgeCallers: string[] = [];
    const associationConsumers: string[] = [];
    let forbiddenReexport = false;
    let forbiddenBridgeReexport = false;
    let forbiddenSourceReexport = false;
    let localeCompareUse = false;
    const privateContractNames = new Set(["RolloutScenario", "RolloutScenarioSourceInput", "RolloutScenarioSourceResult", "RolloutReplicateInput", "RolloutPublicState"]);
    const allowedPrivateConsumers = new Set([sourcePath(contractsFile), sourcePath(sourceFile)]);

    const recordPrivateContractUse = (file: ts.SourceFile, symbol: ts.Symbol): void => {
      const resolved = resolveSymbol(symbol);
      const consumerPath = sourcePath(file);
      if (contractSymbols.has(resolved) && privateContractNames.has(resolved.name) && !allowedPrivateConsumers.has(consumerPath)) forbiddenPrivateConsumers.push(consumerPath);
      if (resolved.name === "privateState" && !allowedPrivateConsumers.has(consumerPath)) forbiddenPrivateConsumers.push(consumerPath);
    };

    for (const file of files) {
      function visit(node: ts.Node): void {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith("particleBankInternals") && sourcePath(file).includes("/src/ai/rollout/")) rolloutInternalImporters.push(sourcePath(file));
        if (ts.isImportDeclaration(node) && node.importClause?.namedBindings !== undefined && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const element of node.importClause.namedBindings.elements) {
            const localSymbol = checker.getSymbolAtLocation(element.name);
            if (localSymbol === undefined) continue;
            const resolved = resolveSymbol(localSymbol);
            if (associationSymbols.has(resolved)) associationConsumers.push(sourcePath(file));
            if (resolved.name === "readParticleBankInternals" && privateSymbols.has(resolved)) directReadImporters.push(sourcePath(file));
            const target = declarationFile(resolved);
            if (target !== undefined && normalize(target).endsWith("/src/ai/rollout/particleScenarioSource.ts") && sourcePath(file) !== sourceFilePath) privateSourceConsumers.push(sourcePath(file));
            if (bridgeSymbols.has(resolved)) {
              bridgeImporters.push(sourcePath(file));
              if (sourcePath(file).endsWith("/src/ai/rollout/particleScenarioSource.ts")) bridgeCallers.push(resolved.name);
            }
            recordPrivateContractUse(file, resolved);
          }
        }
        if (ts.isPropertyAccessExpression(node)) {
          const propertySymbol = checker.getSymbolAtLocation(node.name);
          if (propertySymbol !== undefined) {
            const resolved = resolveSymbol(propertySymbol);
            const consumerPath = sourcePath(file);
            if (associationSymbols.has(resolved)) associationConsumers.push(consumerPath);
            if (resolved.name === "readParticleBankInternals" && privateSymbols.has(resolved)) directReadImporters.push(consumerPath);
            if (bridgeSymbols.has(resolved)) {
              bridgeImporters.push(consumerPath);
              if (consumerPath.endsWith("/src/ai/rollout/particleScenarioSource.ts")) bridgeCallers.push(resolved.name);
            }
            recordPrivateContractUse(file, resolved);
          }
        }
        if (ts.isIdentifier(node)) {
          const identifierSymbol = checker.getSymbolAtLocation(node);
          if (identifierSymbol !== undefined) recordPrivateContractUse(file, identifierSymbol);
          if (identifierSymbol !== undefined && associationSymbols.has(resolveSymbol(identifierSymbol))) associationConsumers.push(sourcePath(file));
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
          const moduleSymbol = checker.getSymbolAtLocation(node.moduleSpecifier);
          if (moduleSymbol !== undefined) {
            const exports = checker.getExportsOfModule(moduleSymbol).map(resolveSymbol);
            if (exports.some((symbol) => privateSymbols.has(symbol))) forbiddenReexport = true;
            if (exports.some((symbol) => bridgeSymbols.has(symbol))) forbiddenBridgeReexport = true;
            if (exports.some((symbol) => declarationFile(symbol) !== undefined && normalize(declarationFile(symbol)!).endsWith("/src/ai/rollout/particleScenarioSource.ts"))) forbiddenSourceReexport = true;
          }
        }
        const identityFile = sourcePath(file).endsWith("/src/ai/rollout/contracts.ts") || sourcePath(file).endsWith("/src/ai/particles/canonicalDeal.ts");
        if (identityFile && ts.isPropertyAccessExpression(node) && node.name.text === "localeCompare") localeCompareUse = true;
        if (ts.isCallExpression(node)) {
          const symbol = checker.getSymbolAtLocation(node.expression);
          if (symbol !== undefined) {
            const resolved = resolveSymbol(symbol);
            const target = declarationFile(resolved);
            if (target !== undefined && normalize(target).endsWith("/src/ai/particles/particleBankRolloutAccess.ts") && sourcePath(file).endsWith("/src/ai/rollout/particleScenarioSource.ts")) bridgeCallers.push(resolved.name);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
    }

    expect([...new Set(directReadImporters)]).toEqual([sourcePath(bridgeFile)]);
    expect([...new Set(rolloutInternalImporters)]).toEqual([]);
    expect([...new Set(bridgeImporters)]).toEqual([sourcePath(sourceFile)]);
    expect([...new Set(forbiddenPrivateConsumers)]).toEqual([]);
    expect([...new Set(privateSourceConsumers)]).toEqual([]);
    expect(forbiddenReexport).toBe(false);
    expect(forbiddenBridgeReexport).toBe(false);
    expect(forbiddenSourceReexport).toBe(false);
    expect(localeCompareUse).toBe(false);
    expect(bridgeCallers).toContain("readParticleBankRolloutAccess");
    expect([...new Set(associationConsumers)]).toEqual([sourcePath(contractsFile)]);
  });
});
