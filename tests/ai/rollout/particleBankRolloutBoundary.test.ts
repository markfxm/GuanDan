import path from "node:path";
import { describe, expect, test } from "vitest";
import * as ts from "typescript";
import { createDeck } from "../../../src/engine/cards";
import { detectGroups } from "../../../src/engine/groups";
import { buildPublicGameIdentity, type PublicSeat } from "../../../src/game/publicEvent";
import { playPower } from "../../../src/game/playRules";
import { canonicalPublicLedgerHash, createInitialPublicLedger } from "../../../src/game/publicLedger";
import type {
  CanonicalInitialDeal,
  ParticleBank,
  ParticleScenario,
  ParticleSnapshotIdentity,
  PrivateParticleSummary,
} from "../../../src/ai/particles/contracts";
import { readParticleBankRolloutAccess } from "../../../src/ai/particles/particleBankRolloutAccess";
import { createParticleBankHandle } from "../../../src/ai/particles/particleBankInternals";
import {
  canonicalActionIdentity,
  canonicalDecisionIdentity,
  canonicalReplicateIdentity,
  canonicalReplayContextIdentity,
  createRolloutRequest,
  createRolloutResult,
  rootDigestFromReplayContextIdentity,
  validateRolloutBudget,
  validateRolloutEvidenceRequirements,
  validateRolloutRiskPolicy,
} from "../../../src/ai/rollout/contracts";
import type {
  RolloutAction,
  RolloutCandidate,
  RolloutFailure,
  RolloutPublicState,
  RolloutReplicateInput,
  RolloutRequest,
  RolloutResult,
  RolloutScenarioSourceInput,
} from "../../../src/ai/rollout/contracts";

function makeKnownBank(normalizedWeight = 1, snapshotOverride?: ParticleSnapshotIdentity): ParticleBank {
  const deck = createDeck();
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
  const summary: PrivateParticleSummary = {
    status: "ready",
    requestedParticleCount: 1,
    acceptedParticleCount: 1,
    samplingAttempts: 1,
    duplicateCount: 0,
    zeroWeightCount: 0,
    effectiveSampleSize: 1,
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
        particleCount: 1,
        maxSamplingAttempts: 1,
        maxIndexDraws: 1,
        samplerConfigVersion: "bridge-fixture",
        likelihoodConfigHash: "2".repeat(64),
      },
      particleCount: 1,
      effectiveSampleSize: 1,
      status: "ready",
      summary,
    },
    { records: [{ particleId: "bridge-particle-0", scenario, normalizedWeight }] },
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

describe("D2F ParticleBank bridge", () => {
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

  test("validates and preserves RolloutResult policy provenance without changing rootDigest", () => {
    const input = makeResultInput();
    const result = createRolloutResult(input);
    expect(result).toEqual(expect.objectContaining({ ok: true }));
    if (!result.ok) return;
    expect(result.value.policyId).toBe("d2f-lightweight-v1");
    expect(result.value.rootDigest).toBe(input.rootDigest);
    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.candidateSummaries)).toBe(true);

    const { policyId: _missingPolicyId, ...missingPolicyId } = input;
    expect(createRolloutResult(missingPolicyId)).toEqual({ ok: false, failure: { kind: "invalid-request", field: "policyId" } });
    expect(createRolloutResult({ ...input, policyId: "custom" })).toEqual({
      ok: false,
      failure: { kind: "invalid-request", field: "policyId" },
    });
    expect(createRolloutResult({ ...input, rawScenario: { hidden: true } } as unknown)).toEqual({
      ok: false,
      failure: { kind: "invalid-request", field: "rawScenario" },
    });
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

    const result = createRolloutResult(makeResultInput());
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

    const decision = canonicalDecisionIdentity({
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
    expect(rootDigestFromReplayContextIdentity(context)).toMatch(/^[a-f0-9]{64}$/);
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

  test("accepts a legal wildcard subset repeated in the CardGroup wildcard projection", () => {
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

    expect(result.ok).toBe(true);
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
    const result = createRolloutResult({
      ...first,
      candidateSummaries: summaries,
      ranking: summaries.map((summary) => summary.candidateId),
      aggregateDiagnostics: {
        ...first.aggregateDiagnostics,
        completedReplicateCount: 2,
        expectedCompletedReplicateCount: 2,
        candidateCount: 2,
      },
    });

    expect(result.ok).toBe(false);
  });

  test("keeps candidate replicate counts local while aggregate counts sum candidates", () => {
    const first = makeResultInput();
    const secondCandidateId = canonicalActionIdentity(makeAction(1));
    const summaries = [
      { ...first.candidateSummaries[0]!, acceptedScenarioCount: 2, completedReplicateCount: 2, expectedReplicateCount: 2 },
      { ...first.candidateSummaries[0]!, candidateId: secondCandidateId, acceptedScenarioCount: 2, completedReplicateCount: 2, expectedReplicateCount: 2 },
    ].sort((left, right) => left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0);
    const result = createRolloutResult({
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
    });

    expect(result.ok).toBe(true);
  });

  test("rejects overflowing candidate coverage products", () => {
    const input = makeResultInput();
    const result = createRolloutResult({
      ...input,
      candidateSummaries: [{
        ...input.candidateSummaries[0]!,
        acceptedScenarioCount: Number.MAX_SAFE_INTEGER,
        replicateCountPerScenario: 2,
      }],
    });

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
    const result = createRolloutResult({
      ...makeResultInput(),
      aggregateDiagnostics: {
        ...makeResultInput().aggregateDiagnostics,
        rawScenario: { hiddenTransferAssignments: ["private"] },
        particleSeed: "secret",
      },
    } as any);

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
      expect(createRolloutResult({
        ...makeResultInput(),
        candidateSummaries: [{ ...makeResultInput().candidateSummaries[0]!, [field]: Number.NaN }],
      })).toEqual({ ok: false, failure: { kind: "invalid-request", field: "candidateSummaries" } });
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
    const sourceFilePath = sourcePath(sourceFile);
    const resolveSymbol = (symbol: ts.Symbol): ts.Symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const privateSymbols = new Set(checker.getExportsOfModule(privateModule).map(resolveSymbol));
    const bridgeSymbols = new Set(checker.getExportsOfModule(bridgeModule).map(resolveSymbol));
    const contractSymbols = new Set(checker.getExportsOfModule(contractsModule!).map(resolveSymbol));
    const directReadImporters: string[] = [];
    const rolloutInternalImporters: string[] = [];
    const bridgeImporters: string[] = [];
    const forbiddenPrivateConsumers: string[] = [];
    const privateSourceConsumers: string[] = [];
    const bridgeCallers: string[] = [];
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
  });
});
