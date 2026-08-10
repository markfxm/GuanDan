import { describe, expect, test, vi } from "vitest";
import { createDeck } from "../../../src/engine/cards";
import { detectGroups } from "../../../src/engine/groups";
import { playPublicStableKey, buildPublicGameIdentity, type PublicActionEvent, type PublicActionEventDraft } from "../../../src/game/publicEvent";
import { applyPublicEvent, canonicalPublicLedgerHash, createInitialPublicLedger } from "../../../src/game/publicLedger";
import { finalizePublicActionEvent } from "../../../src/game/publicEventHash";
import { particleScenarioIdentity } from "../../../src/ai/particles/canonicalDeal";
import { createParticleBankHandle } from "../../../src/ai/particles/particleBankInternals";
import { buildParticleBank } from "../../../src/ai/particles/particleBankBuilder";
import type { CanonicalInitialDeal, ParticleBank, ParticleBankBuildInput, ParticleScenario } from "../../../src/ai/particles/contracts";
import { readParticleBankRolloutAccess } from "../../../src/ai/particles/particleBankRolloutAccess";
import {
  canonicalActionIdentity,
  canonicalReplicateIdentity,
  canonicalReplayContextIdentity,
  type RolloutAction,
  type RolloutScenarioSourceInput,
} from "../../../src/ai/rollout/contracts";
import * as aggregation from "../../../src/ai/rollout/aggregation";
import * as contracts from "../../../src/ai/rollout/contracts";
import * as evidenceGate from "../../../src/ai/rollout/evidenceGate";
import * as kernel from "../../../src/ai/rollout/kernel";
import * as ranking from "../../../src/ai/rollout/ranking";
import * as scenarioSource from "../../../src/ai/rollout/particleScenarioSource";

type DetachedRunner = (requestInput: unknown) => import("../../../src/ai/rollout/contracts").RolloutExecutionResult;

function makeFixture(): RolloutScenarioSourceInput {
  const deck = createDeck();
  const identity = buildPublicGameIdentity("d2f-task6-fixture", 0, 0, "benchmark-scenario");
  const ledger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { phase: "initial" },
  });
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
    initialLedgerHash: canonicalPublicLedgerHash(ledger),
    lastAppliedEventIndex: -1,
    ledgerHash: canonicalPublicLedgerHash(ledger),
    perspectiveSeat: 0 as const,
    gameRank: "2" as const,
  };
  const bank: ParticleBank = createParticleBankHandle(
    {
      schemaVersion: "d2-particle-bank-v1",
      snapshot,
      config: {
        schemaVersion: "d2-particle-bank-config-identity-v1",
        particleCount: 1,
        maxSamplingAttempts: 1,
        maxIndexDraws: 1,
        samplerConfigVersion: "d2-task6-fixture",
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
    bank,
    publicHistoryEvents: [],
    initialLedger: ledger,
    finalLedger: ledger,
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
}

function makePlayAction(cardIndex: number): Extract<RolloutAction, { type: "play" }> {
  const group = detectGroups([createDeck()[cardIndex]!], "2")[0];
  if (group === undefined) throw new Error("TASK6_FIXTURE_GROUP_REJECTED");
  return { type: "play", group };
}

function makeRealBuilderFixture(): { sourceInput: RolloutScenarioSourceInput; rootAction: RolloutAction } {
  const deck = createDeck();
  const identity = buildPublicGameIdentity("d2f-task6-real-builder", 0, 0, "benchmark-scenario");
  const initialLedger = createInitialPublicLedger({
    identity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: { phase: "initial" },
  });
  const eventDraft: PublicActionEventDraft = {
    schemaVersion: "d2-public-event-v2",
    gameId: identity.gameId,
    roundIdentity: identity.roundIdentity,
    handIdentity: identity.handIdentity,
    eventIndex: 0,
    kind: "play",
    seat: 0,
    publicStableKey: playPublicStableKey([deck[0]!.id]),
    trickIndex: 0,
    publicCardIds: [deck[0]!.id],
    patternType: "single",
    groupType: "single",
    handCountBefore: 27,
    handCountAfter: 26,
  };
  const event: PublicActionEvent = finalizePublicActionEvent(eventDraft);
  const applied = applyPublicEvent(initialLedger, event);
  if (!applied.ok) throw new Error("TASK6_REAL_BUILDER_EVENT_REJECTED");
  const finalLedger = applied.ledger;
  const publicHistoryEvents: readonly PublicActionEvent[] = [event];
  const builtBank = buildParticleBank({
    schemaVersion: "d2-particle-bank-build-input-v1",
    publicIdentity: identity,
    initialLedger,
    baseLedger: initialLedger,
    publicHistoryEvents,
    pendingPublicEvents: publicHistoryEvents,
    expectedFinalEventIndex: finalLedger.lastAppliedEventIndex,
    expectedFinalPublicLedgerHash: canonicalPublicLedgerHash(finalLedger),
    gameRank: "2",
    actingSeat: 0,
    ownCurrentHand: deck.slice(1, 27),
    particleSeed: 0,
    particleCount: 1,
    maxSamplingAttempts: 1,
    maxIndexDraws: 1,
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
  if (!builtBank.ok) throw new Error("TASK6_REAL_BUILDER_BANK_REJECTED");
  return {
    sourceInput: {
      bank: builtBank.bank,
      publicHistoryEvents,
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
        currentLastPlay: detectGroups([deck[0]!], "2")[0] ?? null,
        currentLastPlaySeat: 0,
      },
    },
    rootAction: { type: "pass" },
  };
}

function makeRequestInput(sourceInput: RolloutScenarioSourceInput, actions: readonly RolloutAction[], replicateCountPerScenario = 1): Record<string, unknown> {
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
  const maxPolicyActionEvaluationsPerPly = 256;
  const maxWorkUnits = replicateCountPerScenario * maxPolicyActionEvaluationsPerPly;
  return {
    schemaVersion: "d2f-rollout-request-v2",
    mode: "detached",
    formalExecutionAllowed: false,
    rootIdentity,
    scenarioSourceInput: sourceInput,
    candidates: actions.map((action) => ({ candidateId: canonicalActionIdentity(action), action, baselineEvaluatorScore: 0 })),
    budget: { replicateCountPerScenario, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly, maxWorkUnits },
    limits: { maxReplicateCountPerScenario: replicateCountPerScenario, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly, maxWorkUnits },
    evidenceRequirements: {
      schemaVersion: "d2f-rollout-evidence-requirements-v1",
      minimumEffectiveSampleSize: 1,
      minimumAcceptedScenarioCount: 1,
      minimumCompletedReplicateCount: replicateCountPerScenario,
      requireCompleteCoverage: true,
    },
    riskPolicy: { schemaVersion: "d2f-rollout-risk-policy-v1", variancePenalty: 0, downsideRiskPenalty: 0 },
    policyId: "d2f-lightweight-v1",
  };
}

function callerSnapshot(requestInput: Record<string, unknown>): unknown {
  const sourceInput = requestInput.scenarioSourceInput as RolloutScenarioSourceInput;
  return structuredClone({
    ...requestInput,
    scenarioSourceInput: { ...sourceInput, bank: { snapshot: sourceInput.bank.snapshot } },
  });
}

async function loadRunner(): Promise<DetachedRunner | undefined> {
  const target = "../../../src/ai/rollout/rolloutOrchestrator";
  try {
    const module = await import(/* @vite-ignore */ target) as { runDetachedRollout?: DetachedRunner };
    return module.runDetachedRollout;
  } catch {
    return undefined;
  }
}

describe("detached rollout orchestration", () => {
  test("runs the real ParticleBank-to-result chain with one immutable source and no formal action", async () => {
    const runner = await loadRunner();
    expect(typeof runner, "the real orchestrator must expose the requested behavior").toBe("function");
    if (runner === undefined) return;
    const sourceInput = makeFixture();
    const rootAction = makePlayAction(0);
    const requestInput = makeRequestInput(sourceInput, [rootAction]);
    const before = callerSnapshot(requestInput);
    const bankBefore = readParticleBankRolloutAccess(sourceInput.bank);
    const sourceSpy = vi.spyOn(scenarioSource, "createParticleScenarioSource");
    const kernelSpy = vi.spyOn(kernel, "runRolloutReplicate");
    const evidenceSpy = vi.spyOn(evidenceGate, "validateRolloutEvidence");
    const aggregateSpy = vi.spyOn(aggregation, "aggregateRolloutCandidates");
    const rankingSpy = vi.spyOn(ranking, "rankCandidateRollouts");
    const assemblySpy = vi.spyOn(contracts, "createRolloutResult");

    const result = runner(requestInput);

    expect(result.ok).toBe(true);
    expect(sourceSpy).toHaveBeenCalledTimes(1);
    expect(kernelSpy).toHaveBeenCalledTimes(1);
    expect(evidenceSpy).toHaveBeenCalledTimes(3);
    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    expect(rankingSpy).toHaveBeenCalledTimes(1);
    expect(assemblySpy).toHaveBeenCalledTimes(1);
    const sourceScenario = bankBefore.ok ? bankBefore.access.records[0] : undefined;
    expect(kernelSpy.mock.calls[0]?.[0]).toMatchObject({
      candidate: { candidateId: canonicalActionIdentity(rootAction), action: rootAction },
      scenario: { scenarioIdentity: sourceScenario?.particleId, normalizedWeight: 1 },
      replicateIdentity: canonicalReplicateIdentity(0),
      validatedBudget: { validated: true, maximumWorkUnits: 256 },
    });
    expect(kernelSpy.mock.calls[0]?.[1]).toBe(requestInput.rootIdentity);
    expect(evidenceSpy.mock.invocationCallOrder[0]).toBeLessThan(kernelSpy.mock.invocationCallOrder[0]!);
    expect(kernelSpy.mock.invocationCallOrder[0]).toBeLessThan(evidenceSpy.mock.invocationCallOrder[1]!);
    expect(evidenceSpy.mock.invocationCallOrder[1]).toBeLessThan(aggregateSpy.mock.invocationCallOrder[0]!);
    expect(aggregateSpy.mock.invocationCallOrder[0]).toBeLessThan(rankingSpy.mock.invocationCallOrder[0]!);
    expect(rankingSpy.mock.invocationCallOrder[0]).toBeLessThan(assemblySpy.mock.invocationCallOrder[0]!);
    expect(callerSnapshot(requestInput)).toEqual(before);
    expect(readParticleBankRolloutAccess(sourceInput.bank)).toEqual(bankBefore);
    if (result.ok) {
      expect(result.result.formalExecutionAllowed).toBe(false);
      expect(result.result.candidateSummaries).toHaveLength(1);
      expect(result.result.ranking).toHaveLength(1);
      expect(result.result.aggregateDiagnostics.coverage).toBe("complete");
      expect(result.result).not.toHaveProperty("scenarioSource");
      expect(result.result).not.toHaveProperty("privateState");
      expect(JSON.stringify(result.result)).not.toContain("hiddenTransferAssignments");
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.result)).toBe(true);
    }
    vi.restoreAllMocks();
  });

  test("executes every canonical candidate-scenario-replicate work unit once and is order invariant", async () => {
    const runner = await loadRunner();
    expect(typeof runner, "the real orchestrator must expose the requested behavior").toBe("function");
    if (runner === undefined) return;
    const sourceInput = makeFixture();
    const actions = [makePlayAction(0), makePlayAction(1)];
    const firstRequest = makeRequestInput(sourceInput, actions, 2);
    const secondRequest = makeRequestInput(sourceInput, [...actions].reverse(), 2);

    const first = runner(firstRequest);
    const second = runner(secondRequest);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.result.aggregateDiagnostics.expectedCompletedReplicateCount).toBe(4);
      expect(first.result.aggregateDiagnostics.completedReplicateCount).toBe(4);
      expect(first.result.candidateSummaries).toHaveLength(2);
    }
  });

  test("completes the real buildParticleBank-to-result production chain without private leakage", async () => {
    const runner = await loadRunner();
    expect(typeof runner, "the real orchestrator must expose the requested behavior").toBe("function");
    if (runner === undefined) return;
    const fixture = makeRealBuilderFixture();

    const result = runner(makeRequestInput(fixture.sourceInput, [fixture.rootAction]));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.aggregateDiagnostics.acceptedScenarioCount).toBe(1);
      expect(result.result.aggregateDiagnostics.expectedCompletedReplicateCount).toBe(1);
      expect(JSON.stringify(result.result)).not.toMatch(/"(?:hands|hiddenTransferAssignments|normalizedWeight|particleSeed|randomTape|cursor)":/);
    }
  });
});
