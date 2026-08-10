import { describe, expect, test, vi } from "vitest";
import { createDeck } from "../../../src/engine/cards";
import { detectGroups } from "../../../src/engine/groups";
import { buildPublicGameIdentity } from "../../../src/game/publicEvent";
import { createInitialPublicLedger, canonicalPublicLedgerHash } from "../../../src/game/publicLedger";
import { particleScenarioIdentity } from "../../../src/ai/particles/canonicalDeal";
import { createParticleBankHandle } from "../../../src/ai/particles/particleBankInternals";
import type { CanonicalInitialDeal, ParticleBank, ParticleScenario } from "../../../src/ai/particles/contracts";
import {
  canonicalActionIdentity,
  canonicalReplayContextIdentity,
  type RolloutFailure,
  type RolloutAction,
  type RolloutKernelFailure,
  type RolloutScenarioSourceInput,
} from "../../../src/ai/rollout/contracts";
import * as aggregation from "../../../src/ai/rollout/aggregation";
import * as contracts from "../../../src/ai/rollout/contracts";
import * as evidenceGate from "../../../src/ai/rollout/evidenceGate";
import * as kernel from "../../../src/ai/rollout/kernel";
import * as ranking from "../../../src/ai/rollout/ranking";
import * as scenarioSource from "../../../src/ai/rollout/particleScenarioSource";

type DetachedRunner = (requestInput: unknown) => import("../../../src/ai/rollout/contracts").RolloutExecutionResult;

const SOURCE_FAILURES: readonly (readonly [string, RolloutFailure])[] = [
  ["fake or unknown particle bank", { kind: "fake-or-unknown-particle-bank" }],
  ["ledger mismatch", { kind: "scenario-source-failed", reason: "ledger-mismatch" }],
  ["missing replay context", { kind: "scenario-source-failed", reason: "replay-context-missing" }],
  ["invalid private state", { kind: "scenario-source-failed", reason: "private-state-invalid" }],
];

const KERNEL_FAILURES: readonly (readonly [string, RolloutKernelFailure])[] = [
  ["root action", { kind: "simulation-failed", stage: "root-action", reason: "illegal-action" }],
  ["policy", { kind: "policy-failed", failure: { kind: "no-legal-action", actingSeat: 1 } }],
  ["CRN", { kind: "simulation-failed", stage: "crn", reason: "coordinate" }],
  ["transition", { kind: "simulation-failed", stage: "transition", reason: "invalid-action-transition" }],
  ["state conservation", { kind: "simulation-failed", stage: "state-conservation", reason: "duplicate-card" }],
  ["budget exhaustion", { kind: "budget-exhausted", workUnits: 257, maximumWorkUnits: 256 }],
];

function makeSourceInput(): RolloutScenarioSourceInput {
  const deck = createDeck();
  const identity = buildPublicGameIdentity("d2f-task6-failure-fixture", 0, 0, "benchmark-scenario");
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
        samplerConfigVersion: "d2-task6-failure-fixture",
        likelihoodConfigHash: "b".repeat(64),
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

function actionForCard(cardIndex: number): Extract<RolloutAction, { type: "play" }> {
  const group = detectGroups([createDeck()[cardIndex]!], "2")[0];
  if (group === undefined) throw new Error("TASK6_FAILURE_FIXTURE_GROUP_REJECTED");
  return { type: "play", group };
}

function makeRequestInput(sourceInput: RolloutScenarioSourceInput): Record<string, unknown> {
  const legalAction = actionForCard(0);
  const invalidForActingSeat = actionForCard(107);
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
  return {
    schemaVersion: "d2f-rollout-request-v2",
    mode: "detached",
    formalExecutionAllowed: false,
    rootIdentity,
    scenarioSourceInput: sourceInput,
    candidates: [legalAction, invalidForActingSeat].map((action) => ({ candidateId: canonicalActionIdentity(action), action, baselineEvaluatorScore: 0 })),
    budget: { replicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 256, maxWorkUnits: 256 },
    limits: { maxReplicateCountPerScenario: 1, maxPliesPerReplicate: 1, maxPolicyActionEvaluationsPerPly: 256, maxWorkUnits: 256 },
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

function callerSnapshot(requestInput: Record<string, unknown>): unknown {
  const sourceInput = requestInput.scenarioSourceInput as RolloutScenarioSourceInput;
  return structuredClone({
    ...requestInput,
    scenarioSourceInput: { ...sourceInput, bank: { snapshot: sourceInput.bank.snapshot } },
  });
}

function assertAtomicFailure(
  result: import("../../../src/ai/rollout/contracts").RolloutExecutionResult,
  failure: unknown,
): void {
  expect(result).toEqual({ ok: false, failure });
  expect(result).not.toHaveProperty("result");
  expect(result).not.toHaveProperty("candidateSummaries");
  expect(result).not.toHaveProperty("ranking");
  expect(JSON.stringify(result)).not.toMatch(/hands|assignment|seed|tape|cursor|weight/);
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

describe("detached rollout failure atomicity", () => {
  test("returns no partial result when a later candidate replicate fails at the root action", async () => {
    const runner = await loadRunner();
    expect(typeof runner, "the real orchestrator must expose the requested behavior").toBe("function");
    if (runner === undefined) return;
    const sourceInput = makeSourceInput();
    const requestInput = makeRequestInput(sourceInput);
    const before = callerSnapshot(requestInput);

    const result = runner(requestInput);

    expect(result).toEqual({
      ok: false,
      failure: {
        kind: "kernel-failed",
        failure: { kind: "simulation-failed", stage: "root-action", reason: "illegal-action" },
      },
    });
    expect(result).not.toHaveProperty("result");
    expect(result).not.toHaveProperty("candidateSummaries");
    expect(result).not.toHaveProperty("ranking");
    expect(callerSnapshot(requestInput)).toEqual(before);
  });

  test("rejects formal execution at the request boundary without entering detached stages", async () => {
    const runner = await loadRunner();
    expect(typeof runner, "the real orchestrator must expose the requested behavior").toBe("function");
    if (runner === undefined) return;
    const sourceInput = makeSourceInput();
    const requestInput = makeRequestInput(sourceInput);
    requestInput.formalExecutionAllowed = true;

    const result = runner(requestInput);

    expect(result).toEqual({ ok: false, failure: { kind: "invalid-request", field: "formalExecutionAllowed" } });
    expect(result).not.toHaveProperty("result");
  });

  test.each(SOURCE_FAILURES)("stops at the source boundary for %s", async (_label, sourceFailure) => {
    const runner = await loadRunner();
    expect(typeof runner).toBe("function");
    if (runner === undefined) return;
    const requestInput = makeRequestInput(makeSourceInput());
    const before = callerSnapshot(requestInput);
    vi.spyOn(scenarioSource, "createParticleScenarioSource").mockReturnValue({ ok: false, failure: sourceFailure });
    const kernelSpy = vi.spyOn(kernel, "runRolloutReplicate");
    const evidenceSpy = vi.spyOn(evidenceGate, "validateRolloutEvidence");
    const aggregateSpy = vi.spyOn(aggregation, "aggregateRolloutCandidates");
    const rankingSpy = vi.spyOn(ranking, "rankCandidateRollouts");
    const assemblySpy = vi.spyOn(contracts, "createRolloutResult");

    const result = runner(requestInput);

    assertAtomicFailure(result, sourceFailure);
    expect(kernelSpy).not.toHaveBeenCalled();
    expect(evidenceSpy).not.toHaveBeenCalled();
    expect(aggregateSpy).not.toHaveBeenCalled();
    expect(rankingSpy).not.toHaveBeenCalled();
    expect(assemblySpy).not.toHaveBeenCalled();
    expect(callerSnapshot(requestInput)).toEqual(before);
    vi.restoreAllMocks();
  });

  test("fails the evidence gate before entering the candidate loop when source evidence is too low", async () => {
    const runner = await loadRunner();
    expect(typeof runner).toBe("function");
    if (runner === undefined) return;
    const requestInput = makeRequestInput(makeSourceInput());
    (requestInput.evidenceRequirements as Record<string, unknown>).minimumEffectiveSampleSize = 2;
    const kernelSpy = vi.spyOn(kernel, "runRolloutReplicate");

    const result = runner(requestInput);

    assertAtomicFailure(result, { kind: "effective-sample-size-too-low", effectiveSampleSize: 1, minimumEffectiveSampleSize: 2 });
    expect(kernelSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test.each(KERNEL_FAILURES)("maps a %s kernel failure to an atomic result", async (_label, kernelFailure) => {
    const runner = await loadRunner();
    expect(typeof runner).toBe("function");
    if (runner === undefined) return;
    const requestInput = makeRequestInput(makeSourceInput());
    const kernelSpy = vi.spyOn(kernel, "runRolloutReplicate").mockReturnValue({ ok: false, failure: kernelFailure });
    const evidenceSpy = vi.spyOn(evidenceGate, "validateRolloutEvidence");
    const aggregateSpy = vi.spyOn(aggregation, "aggregateRolloutCandidates");
    const rankingSpy = vi.spyOn(ranking, "rankCandidateRollouts");
    const assemblySpy = vi.spyOn(contracts, "createRolloutResult");

    const result = runner(requestInput);

    assertAtomicFailure(result, { kind: "kernel-failed", failure: kernelFailure });
    expect(kernelSpy).toHaveBeenCalledTimes(1);
    expect(evidenceSpy).toHaveBeenCalledTimes(1);
    expect(aggregateSpy).not.toHaveBeenCalled();
    expect(rankingSpy).not.toHaveBeenCalled();
    expect(assemblySpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test("does not assemble a partial result when aggregation fails", async () => {
    const runner = await loadRunner();
    expect(typeof runner).toBe("function");
    if (runner === undefined) return;
    const requestInput = makeRequestInput(makeSourceInput());
    vi.spyOn(kernel, "runRolloutReplicate").mockImplementation((input) => ({
      ok: true,
      candidateId: input.candidate.candidateId,
      scenarioIdentity: input.scenario.scenarioIdentity,
      replicateIdentity: input.replicateIdentity,
      utility: 1,
      workUnits: 1,
    }));
    const aggregateSpy = vi.spyOn(aggregation, "aggregateRolloutCandidates").mockReturnValue({
      ok: false,
      failure: { kind: "aggregation-failed", failure: { kind: "empty-replicate-set", candidateId: "candidate" } },
    });
    const rankingSpy = vi.spyOn(ranking, "rankCandidateRollouts");
    const assemblySpy = vi.spyOn(contracts, "createRolloutResult");

    const result = runner(requestInput);

    assertAtomicFailure(result, { kind: "aggregation-failed", failure: { kind: "empty-replicate-set", candidateId: "candidate" } });
    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    expect(rankingSpy).not.toHaveBeenCalled();
    expect(assemblySpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test("does not assemble when ranking fails", async () => {
    const runner = await loadRunner();
    expect(typeof runner).toBe("function");
    if (runner === undefined) return;
    const requestInput = makeRequestInput(makeSourceInput());
    vi.spyOn(kernel, "runRolloutReplicate").mockImplementation((input) => ({
      ok: true,
      candidateId: input.candidate.candidateId,
      scenarioIdentity: input.scenario.scenarioIdentity,
      replicateIdentity: input.replicateIdentity,
      utility: 1,
      workUnits: 1,
    }));
    const rankingSpy = vi.spyOn(ranking, "rankCandidateRollouts").mockReturnValue({ ok: false, failure: { kind: "invalid-ranking", reason: "malformed-summary" } });
    const assemblySpy = vi.spyOn(contracts, "createRolloutResult");

    const result = runner(requestInput);

    assertAtomicFailure(result, { kind: "invalid-request", field: "ranking" });
    expect(rankingSpy).toHaveBeenCalledTimes(1);
    expect(assemblySpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  test("does not expose summaries when result assembly fails", async () => {
    const runner = await loadRunner();
    expect(typeof runner).toBe("function");
    if (runner === undefined) return;
    const requestInput = makeRequestInput(makeSourceInput());
    vi.spyOn(kernel, "runRolloutReplicate").mockImplementation((input) => ({
      ok: true,
      candidateId: input.candidate.candidateId,
      scenarioIdentity: input.scenario.scenarioIdentity,
      replicateIdentity: input.replicateIdentity,
      utility: 1,
      workUnits: 1,
    }));
    const assemblySpy = vi.spyOn(contracts, "createRolloutResult").mockReturnValue({ ok: false, failure: { kind: "invalid-request", field: "assemblyInput" } });

    const result = runner(requestInput);

    assertAtomicFailure(result, { kind: "invalid-request", field: "assemblyInput" });
    expect(assemblySpy).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
