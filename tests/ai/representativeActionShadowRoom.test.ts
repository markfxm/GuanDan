import { expect, it, vi } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createRoom, getPublicRoom, type PublicRoom, type RoomState } from "../../src/game/room";
import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
import { deriveLightweightPublicEvidence } from "../../src/ai/belief/lightweightPublicEvidence";
import { deriveD2cPlanPriorityQuota, type D2cPlanPolicyInput, type PlanPruningMode } from "../../src/ai/planning/beliefGuidedPlanPolicy";
import { createDeck, type GameRank } from "../../src/engine/cards";
import type {
  ActionCandidate,
  AiDecision,
  AiObservation,
  AiRuntimeState,
  RepresentativeActionShadowMode,
} from "../../src/ai/contracts";
import type { AiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { canonicalJson, sha256 } from "./d0FixtureCanonicalizer";

const gameRank: GameRank = "10";
const deck = createDeck();

function observation(): AiObservation {
  return {
    hand: deck.slice(0, 8).map((card) => ({ ...card })),
    gameRank,
    seat: 1,
    partnerSeat: 3,
    playedCards: [],
    handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 },
    finishOrder: [],
  };
}

function emptyRuntime(): AiRuntimeState {
  return {
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  };
}

function decisionProjection(decision: AiDecision): unknown {
  return {
    action: decision.action,
    runtime: decision.runtime,
    selectedPlan: decision.selectedPlan,
    selectedPlanId: decision.selectedPlanId,
    score: decision.score,
    scoreBreakdown: decision.scoreBreakdown,
    candidateCount: decision.candidateCount,
    consideredActions: decision.consideredActions,
    reasonCodes: decision.reasonCodes,
  };
}

function collectObjectReferences(value: unknown, references = new Set<object>()): Set<object> {
  if (value === null || typeof value !== "object" || references.has(value)) return references;
  references.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) collectObjectReferences(nested, references);
  return references;
}

function expectNoSharedObjectReferences(left: unknown, right: unknown): void {
  const leftReferences = collectObjectReferences(left);
  for (const reference of collectObjectReferences(right)) expect(leftReferences.has(reference)).toBe(false);
}

function expectNoInputReference(output: unknown, input: unknown): void {
  const outputReferences = collectObjectReferences(output);
  for (const reference of collectObjectReferences(input)) expect(outputReferences.has(reference)).toBe(false);
}

type CapturedEvaluatorCall = Readonly<{
  candidate: ActionCandidate;
  stableKey: string;
  candidateBytes: string;
  scoreBytes: string;
}>;

type CapturedDecisionRun = Readonly<{
  decision: AiDecision;
  diagnostics: AiPlanningDiagnostics;
  generatedCandidates: ActionCandidate[];
  generatedCandidateElements: readonly ActionCandidate[];
  observedCandidates: readonly ActionCandidate[] | undefined;
  generatedStableKeys: readonly string[];
  generatedCandidateBytesBefore: string;
  generatedCandidateBytesAfter: string;
  evaluatorCalls: readonly CapturedEvaluatorCall[];
}>;

async function runCapturedDecision(mode: RepresentativeActionShadowMode): Promise<CapturedDecisionRun> {
  const configModulePath = "../../src/ai/config";
  const generatorModulePath = "../../src/ai/tactics/actionGenerator";
  const evaluatorModulePath = "../../src/ai/tactics/actionEvaluator";
  const observerModulePath = "../../src/ai/tactics/representativeActionShadowObserver";
  let generatedCandidates: ActionCandidate[] | undefined;
  let generatedCandidateElements: readonly ActionCandidate[] | undefined;
  let observedCandidates: readonly ActionCandidate[] | undefined;
  let generatedCandidateBytesBefore = "";
  const evaluatorCalls: CapturedEvaluatorCall[] = [];

  vi.resetModules();
  vi.doMock(configModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/config")>(configModulePath);
    return {
      ...actual,
      DEFAULT_REPRESENTATIVE_ACTION_SHADOW: Object.freeze({ mode, hardCap: 256 }),
    };
  });
  vi.doMock(generatorModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/actionGenerator")>(generatorModulePath);
    return {
      ...actual,
      generateActionCandidates: (input: Parameters<typeof actual.generateActionCandidates>[0]) => {
        const result = actual.generateActionCandidates(input);
        generatedCandidates = result;
        generatedCandidateElements = [...result];
        generatedCandidateBytesBefore = canonicalJson(result);
        return result;
      },
    };
  });
  vi.doMock(evaluatorModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/actionEvaluator")>(evaluatorModulePath);
    return {
      ...actual,
      evaluateActionCandidate: (candidate: ActionCandidate, input: Parameters<typeof actual.evaluateActionCandidate>[1]) => {
        const score = actual.evaluateActionCandidate(candidate, input);
        evaluatorCalls.push({
          candidate,
          stableKey: candidate.stableKey,
          candidateBytes: canonicalJson(candidate),
          scoreBytes: canonicalJson(score),
        });
        return score;
      },
    };
  });
  vi.doMock(observerModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/representativeActionShadowObserver")>(observerModulePath);
    return {
      ...actual,
      observeRepresentativeActions: (input: Parameters<typeof actual.observeRepresentativeActions>[0]) => {
        observedCandidates = input.candidates;
        return actual.observeRepresentativeActions(input);
      },
    };
  });

  try {
    const { decideAiAction } = await import("../../src/ai/aiDecisionEngine");
    const { createAiPlanningDiagnostics } = await import("../../src/ai/diagnostics/aiPlanningDiagnostics");
    const diagnostics = createAiPlanningDiagnostics();
    const decision = decideAiAction(observation(), emptyRuntime(), {
      ...(await import("../../src/ai/config")).DEFAULT_AI_PERFORMANCE_CONFIG,
      turn: 1,
      diagnostics,
    });
    if (generatedCandidates === undefined || generatedCandidateElements === undefined) throw new Error("D2E_CAPTURE_GENERATOR_NOT_CALLED");
    return {
      decision,
      diagnostics,
      generatedCandidates,
      generatedCandidateElements,
      observedCandidates,
      generatedStableKeys: generatedCandidates.map((candidate) => candidate.stableKey),
      generatedCandidateBytesBefore,
      generatedCandidateBytesAfter: canonicalJson(generatedCandidates),
      evaluatorCalls: [...evaluatorCalls],
    };
  } finally {
    vi.doUnmock(configModulePath);
    vi.doUnmock(generatorModulePath);
    vi.doUnmock(evaluatorModulePath);
    vi.doUnmock(observerModulePath);
    vi.resetModules();
  }
}

function assertCapturedDecisionRun(run: CapturedDecisionRun): void {
  expect(run.observedCandidates).toBe(run.generatedCandidates);
  expect(run.generatedCandidateBytesAfter).toBe(run.generatedCandidateBytesBefore);
  expect(run.evaluatorCalls).toHaveLength(run.generatedCandidates.length);
  for (let index = 0; index < run.generatedCandidates.length; index += 1) {
    expect(run.generatedCandidates[index]).toBe(run.generatedCandidateElements[index]);
    expect(run.evaluatorCalls[index]?.candidate).toBe(run.generatedCandidates[index]);
    expect(run.evaluatorCalls[index]?.stableKey).toBe(run.generatedStableKeys[index]);
  }
}

type RoomRunCapture = Readonly<{
  room: RoomState;
  diagnostics: AiPlanningDiagnostics;
  aiSeat: number;
  action: "play" | "pass" | undefined;
  generatedCandidates: ActionCandidate[];
  generatedCandidateElements: readonly ActionCandidate[];
  generatedStableKeys: readonly string[];
  generatedCandidateBytesBefore: string;
  generatedCandidateBytesAfter: string;
  observedCandidates: readonly ActionCandidate[] | undefined;
  evaluatorCalls: readonly CapturedEvaluatorCall[];
  publicRoom: PublicRoom;
}>;

async function runRoomOnce(mode: RepresentativeActionShadowMode, room: RoomState): Promise<RoomRunCapture> {
  const configModulePath = "../../src/ai/config";
  const generatorModulePath = "../../src/ai/tactics/actionGenerator";
  const evaluatorModulePath = "../../src/ai/tactics/actionEvaluator";
  const observerModulePath = "../../src/ai/tactics/representativeActionShadowObserver";
  let generatedCandidates: ActionCandidate[] | undefined;
  let generatedCandidateElements: readonly ActionCandidate[] | undefined;
  let observedCandidates: readonly ActionCandidate[] | undefined;
  let generatedCandidateBytesBefore = "";
  const evaluatorCalls: CapturedEvaluatorCall[] = [];

  vi.resetModules();
  vi.doMock(configModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/config")>(configModulePath);
    return { ...actual, DEFAULT_REPRESENTATIVE_ACTION_SHADOW: Object.freeze({ mode, hardCap: 256 }) };
  });
  vi.doMock(generatorModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/actionGenerator")>(generatorModulePath);
    return {
      ...actual,
      generateActionCandidates: (input: Parameters<typeof actual.generateActionCandidates>[0]) => {
        const result = actual.generateActionCandidates(input);
        generatedCandidates = result;
        generatedCandidateElements = [...result];
        generatedCandidateBytesBefore = canonicalJson(result);
        return result;
      },
    };
  });
  vi.doMock(evaluatorModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/actionEvaluator")>(evaluatorModulePath);
    return {
      ...actual,
      evaluateActionCandidate: (candidate: ActionCandidate, input: Parameters<typeof actual.evaluateActionCandidate>[1]) => {
        const score = actual.evaluateActionCandidate(candidate, input);
        evaluatorCalls.push({ candidate, stableKey: candidate.stableKey, candidateBytes: canonicalJson(candidate), scoreBytes: canonicalJson(score) });
        return score;
      },
    };
  });
  vi.doMock(observerModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/representativeActionShadowObserver")>(observerModulePath);
    return {
      ...actual,
      observeRepresentativeActions: (input: Parameters<typeof actual.observeRepresentativeActions>[0]) => {
        observedCandidates = input.candidates;
        return actual.observeRepresentativeActions(input);
      },
    };
  });

  try {
    const { runAiStep, getPublicRoom } = await import("../../src/game/room");
    const { createAiPlanningDiagnostics } = await import("../../src/ai/diagnostics/aiPlanningDiagnostics");
    const diagnostics = createAiPlanningDiagnostics();
    const aiSeat = room.currentTurn;
    const priorPlayCount = room.playHistory.length;
    runAiStep(room, diagnostics);
    if (generatedCandidates === undefined || generatedCandidateElements === undefined) throw new Error("D2E_ROOM_CAPTURE_GENERATOR_NOT_CALLED");
    const newPlay = room.playHistory.slice(priorPlayCount).at(-1);
    return {
      room,
      diagnostics,
      aiSeat,
      action: newPlay?.action,
      generatedCandidates,
      generatedCandidateElements,
      generatedStableKeys: generatedCandidates.map((candidate) => candidate.stableKey),
      generatedCandidateBytesBefore,
      generatedCandidateBytesAfter: canonicalJson(generatedCandidates),
      observedCandidates,
      evaluatorCalls: [...evaluatorCalls],
      publicRoom: getPublicRoom(room, 0, { ensurePlans: false }),
    };
  } finally {
    vi.doUnmock(configModulePath);
    vi.doUnmock(generatorModulePath);
    vi.doUnmock(evaluatorModulePath);
    vi.doUnmock(observerModulePath);
    vi.resetModules();
  }
}

function assertCapturedRoomRun(run: RoomRunCapture): void {
  expect(run.observedCandidates).toBe(run.generatedCandidates);
  expect(run.generatedCandidateBytesAfter).toBe(run.generatedCandidateBytesBefore);
  expect(run.evaluatorCalls).toHaveLength(run.generatedCandidates.length);
  for (let index = 0; index < run.generatedCandidates.length; index += 1) {
    expect(run.generatedCandidates[index]).toBe(run.generatedCandidateElements[index]);
    expect(run.evaluatorCalls[index]?.candidate).toBe(run.generatedCandidates[index]);
    expect(run.evaluatorCalls[index]?.stableKey).toBe(run.generatedStableKeys[index]);
  }
}

function publicBytes(room: RoomState): string {
  const publicRoom = getPublicRoom(room, 0, { ensurePlans: false }) as PublicRoom;
  return canonicalJson({
    identity: room.publicIdentity,
    ledgerHash: room.publicLedger === undefined ? undefined : canonicalPublicLedgerHash(room.publicLedger),
    events: room.publicEvents,
    replayHands: publicRoom.replayHands,
    publicRoom,
  });
}

function handCounts(room: RoomState): Record<number, number> {
  return Object.fromEntries(room.players.map((player) => [player.seat, room.hands[player.seat].length]));
}

function d2cInputFromDecision(
  decision: AiDecision,
  mode: PlanPruningMode,
  evidence: D2cPlanPolicyInput["evidence"],
): D2cPlanPolicyInput {
  return {
    schemaVersion: "d2c-plan-policy-input-v1",
    evidence,
    expectedEvidenceSnapshot: {
      gameId: evidence.gameId,
      roundIdentity: evidence.roundIdentity,
      handIdentity: evidence.handIdentity,
      eventIndex: evidence.eventIndex,
    },
    candidatePlans: decision.runtime.candidatePlans.map((plan) => ({ plan, protectedGroupIds: [] })),
    ...(decision.runtime.activePlanId === undefined ? {} : { activePlanId: decision.runtime.activePlanId }),
    mode,
    quotaConfig: {
      schemaVersion: "d2c-plan-quota-v1",
      maxPlanFamilies: 3,
      maxPlanExpansions: 5,
      minQuotaPerFamily: 1,
      maxQuotaPerFamily: 3,
    },
  };
}

function allKeys(value: unknown, keys = new Set<string>(), seen = new Set<object>()): Set<string> {
  if (value === null || typeof value !== "object" || seen.has(value)) return keys;
  seen.add(value);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key);
    allKeys(nested, keys, seen);
  }
  return keys;
}

it("characterizes D2e engine and Room no-op across independent disabled and shadow runs", async () => {
  const publicIdentity = buildPublicGameIdentity("d2e-task5-room", 0, 0, "benchmark-scenario");
  const seed = 2;
  const canonicalRoom = createRoom({ rank: gameRank, seed, publicIdentity });
  const disabledRoom = structuredClone(canonicalRoom) as RoomState;
  const shadowRoom = structuredClone(canonicalRoom) as RoomState;
  const canonicalRoomBytes = canonicalJson(canonicalRoom);

  expect(canonicalRoomBytes).toBe(canonicalJson(disabledRoom));
  expect(canonicalRoomBytes).toBe(canonicalJson(shadowRoom));
  expectNoSharedObjectReferences(disabledRoom, shadowRoom);
  expectNoSharedObjectReferences(canonicalRoom, disabledRoom);
  expectNoSharedObjectReferences(canonicalRoom, shadowRoom);
  expect(canonicalJson(disabledRoom.publicIdentity)).toBe(canonicalJson(shadowRoom.publicIdentity));
  expect(canonicalJson(disabledRoom.initialHands)).toBe(canonicalJson(shadowRoom.initialHands));
  expect(canonicalJson(disabledRoom.hands)).toBe(canonicalJson(shadowRoom.hands));
  expect(canonicalJson(disabledRoom.aiRuntime)).toBe(canonicalJson(shadowRoom.aiRuntime));
  expect(disabledRoom.currentTurn).toBe(1);
  expect(disabledRoom.publicEvents).toEqual([]);
  expect(canonicalJson(disabledRoom.publicLedger)).toBe(canonicalJson(shadowRoom.publicLedger));

  const disabledDecision = await runCapturedDecision("disabled");
  const shadowDecision = await runCapturedDecision("shadow");
  assertCapturedDecisionRun(disabledDecision);
  assertCapturedDecisionRun(shadowDecision);
  expect(disabledDecision.generatedCandidates).not.toBe(shadowDecision.generatedCandidates);
  expect(disabledDecision.generatedCandidateElements[0]).not.toBe(shadowDecision.generatedCandidateElements[0]);
  expect(canonicalJson(disabledDecision.generatedCandidates)).toBe(canonicalJson(shadowDecision.generatedCandidates));
  expect(disabledDecision.generatedStableKeys).toEqual(shadowDecision.generatedStableKeys);
  expect(disabledDecision.evaluatorCalls.map((call) => call.candidateBytes)).toEqual(shadowDecision.evaluatorCalls.map((call) => call.candidateBytes));
  expect(disabledDecision.evaluatorCalls.map((call) => call.scoreBytes)).toEqual(shadowDecision.evaluatorCalls.map((call) => call.scoreBytes));
  expect(canonicalJson(decisionProjection(disabledDecision.decision))).toBe(canonicalJson(decisionProjection(shadowDecision.decision)));
  expect(disabledDecision.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 0, reducerAttemptCount: 0, reducerResultCount: 0 });
  expect(disabledDecision.diagnostics.representativeActionShadow.records).toHaveLength(0);
  expect(shadowDecision.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
  expect(shadowDecision.diagnostics.representativeActionShadow.records).toHaveLength(1);
  expect(Object.isFrozen(shadowDecision.diagnostics.representativeActionShadow.records[0])).toBe(true);
  expect([...allKeys(shadowDecision.diagnostics.representativeActionShadow.records[0])]).not.toEqual(expect.arrayContaining([
    "representativeInputIndices", "representativeByInputIndex", "stableKey", "candidate", "action", "group", "card", "cards", "hand", "lastPlay", "runtime", "Room",
  ]));

  const randomTraces = { disabled: [] as number[], shadow: [] as number[] };
  let activeTrace: number[] | undefined;
  const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
    const value = 0.5;
    activeTrace?.push(value);
    return value;
  });
  let disabledRun: RoomRunCapture;
  let shadowRun: RoomRunCapture;
  try {
    activeTrace = randomTraces.disabled;
    disabledRun = await runRoomOnce("disabled", disabledRoom);
    activeTrace = randomTraces.shadow;
    shadowRun = await runRoomOnce("shadow", shadowRoom);
  } finally {
    activeTrace = undefined;
    randomSpy.mockRestore();
  }

  assertCapturedRoomRun(disabledRun!);
  assertCapturedRoomRun(shadowRun!);
  expect(randomTraces.shadow).toEqual(randomTraces.disabled);
  expect(randomTraces.shadow.length).toBe(randomTraces.disabled.length);
  expect(canonicalJson(shadowRun!.room)).toBe(canonicalJson(disabledRun!.room));
  expect(publicBytes(shadowRun!.room)).toBe(publicBytes(disabledRun!.room));
  expect(canonicalJson(shadowRun!.room.publicEvents)).toBe(canonicalJson(disabledRun!.room.publicEvents));
  expect(canonicalJson(shadowRun!.room.publicLedger)).toBe(canonicalJson(disabledRun!.room.publicLedger));
  expect(canonicalPublicLedgerHash(shadowRun!.room.publicLedger!)).toBe(canonicalPublicLedgerHash(disabledRun!.room.publicLedger!));
  expect(canonicalJson(shadowRun!.publicRoom)).toBe(canonicalJson(disabledRun!.publicRoom));
  expect(canonicalJson(shadowRun!.publicRoom.replayHands)).toBe(canonicalJson(disabledRun!.publicRoom.replayHands));
  expect(shadowRun!.aiSeat).toBe(disabledRun!.aiSeat);
  expect(shadowRun!.action).toBe(disabledRun!.action);
  expect(shadowRun!.room.currentTurn).toBe(disabledRun!.room.currentTurn);
  expect(canonicalJson(shadowRun!.room.trick)).toBe(canonicalJson(disabledRun!.room.trick));
  expect(canonicalJson(shadowRun!.room.hands)).toBe(canonicalJson(disabledRun!.room.hands));
  expect(canonicalJson(handCounts(shadowRun!.room))).toBe(canonicalJson(handCounts(disabledRun!.room)));
  expect(canonicalJson(shadowRun!.room.initialHands)).toBe(canonicalJson(disabledRun!.room.initialHands));
  expect(canonicalJson(shadowRun!.room.aiRuntime)).toBe(canonicalJson(disabledRun!.room.aiRuntime));
  expect(canonicalJson(shadowRun!.room.aiPlans)).toBe(canonicalJson(disabledRun!.room.aiPlans));
  expect(canonicalJson(shadowRun!.room.finishOrder)).toBe(canonicalJson(disabledRun!.room.finishOrder));
  expect(canonicalJson(shadowRun!.room.publicIdentity)).toBe(canonicalJson(disabledRun!.room.publicIdentity));
  expect(canonicalJson(shadowRun!.generatedCandidates)).toBe(canonicalJson(disabledRun!.generatedCandidates));
  expect(shadowRun!.generatedStableKeys).toEqual(disabledRun!.generatedStableKeys);
  expect(shadowRun!.evaluatorCalls.map((call) => call.candidateBytes)).toEqual(disabledRun!.evaluatorCalls.map((call) => call.candidateBytes));
  expect(shadowRun!.evaluatorCalls.map((call) => call.scoreBytes)).toEqual(disabledRun!.evaluatorCalls.map((call) => call.scoreBytes));
  expect(shadowRun!.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
  expect(disabledRun!.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 0, reducerAttemptCount: 0, reducerResultCount: 0 });

  const evidence = deriveLightweightPublicEvidence(canonicalRoom.publicLedger!, canonicalRoom.publicEvents!, 0);
  for (const d2cMode of ["disabled", "shadow"] as const) {
    const disabledInput = d2cInputFromDecision(disabledDecision.decision, d2cMode, evidence);
    const shadowInput = d2cInputFromDecision(shadowDecision.decision, d2cMode, evidence);
    const disabledResult = deriveD2cPlanPriorityQuota(disabledInput);
    const shadowResult = deriveD2cPlanPriorityQuota(shadowInput);
    expect(canonicalJson(disabledResult)).toBe(canonicalJson(shadowResult));
    expect(canonicalJson(disabledResult.diagnostics)).toBe(canonicalJson(shadowResult.diagnostics));
    expect(canonicalJson(disabledResult.familyPriority)).toBe(canonicalJson(shadowResult.familyPriority));
    expect(canonicalJson(disabledResult.familyQuotas)).toBe(canonicalJson(shadowResult.familyQuotas));
    expect(canonicalJson(Object.keys(disabledResult.kind === "shadow" ? disabledResult.annotations : {}))).toBe(canonicalJson(Object.keys(shadowResult.kind === "shadow" ? shadowResult.annotations : {})));
    expect(disabledInput.candidatePlans.map((candidate) => candidate.plan.id)).toEqual(shadowInput.candidatePlans.map((candidate) => candidate.plan.id));
    expect([...allKeys(disabledResult)]).not.toEqual(expect.arrayContaining(["representativeInputIndices", "representativeByInputIndex"]));
    expectNoInputReference(disabledResult, disabledInput);
    expectNoInputReference(shadowResult, shadowInput);
  }

  console.info(JSON.stringify({
    randomTraceLengths: randomTraces,
    engine: {
      disabled: { generatorInvocations: 1, candidateCount: disabledDecision.generatedCandidates.length, evaluatorInvocations: disabledDecision.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(disabledDecision.generatedStableKeys)) },
      shadow: { generatorInvocations: 1, candidateCount: shadowDecision.generatedCandidates.length, evaluatorInvocations: shadowDecision.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(shadowDecision.generatedStableKeys)) },
    },
    room: {
      disabled: { generatorInvocations: 1, candidateCount: disabledRun!.generatedCandidates.length, evaluatorInvocations: disabledRun!.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(disabledRun!.generatedStableKeys)) },
      shadow: { generatorInvocations: 1, candidateCount: shadowRun!.generatedCandidates.length, evaluatorInvocations: shadowRun!.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(shadowRun!.generatedStableKeys)) },
    },
  }));
});
