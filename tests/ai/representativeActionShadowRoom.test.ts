import { expect, it, vi } from "vitest";
import fixtureData from "./fixtures/d0KeepCurrentCases.json";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";
import { createRoom, getPublicRoom, type PublicRoom, type RoomState } from "../../src/game/room";
import { canonicalPublicLedgerHash } from "../../src/game/publicLedger";
import { deriveD2cPlanPriorityQuota, type D2cPlanPolicyInput, type PlanPruningMode } from "../../src/ai/planning/beliefGuidedPlanPolicy";
import { createDeck, type GameRank } from "../../src/engine/cards";
import type {
  ActionCandidate,
  AiDecision,
  AiDecisionConfig,
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

type CapturedGeneratorCall = Readonly<{
  candidates: ActionCandidate[];
  elements: readonly ActionCandidate[];
  stableKeys: readonly string[];
  bytesBefore: string;
}>;

type CapturedDecisionRun = Readonly<{
  decision: AiDecision;
  diagnostics: AiPlanningDiagnostics;
  generatorInvocationCount: number;
  generatedCandidates: ActionCandidate[];
  generatedCandidateElements: readonly ActionCandidate[];
  observedCandidates: readonly ActionCandidate[] | undefined;
  generatedStableKeys: readonly string[];
  generatedCandidateBytesBefore: string;
  generatedCandidateBytesAfter: string;
  evaluatorCalls: readonly CapturedEvaluatorCall[];
}>;

type CapturedDecisionOptions = Readonly<{
  observation?: AiObservation;
  runtime?: AiRuntimeState;
  config?: AiDecisionConfig;
}>;

async function runCapturedDecision(mode: RepresentativeActionShadowMode, options: CapturedDecisionOptions = {}): Promise<CapturedDecisionRun> {
  const configModulePath = "../../src/ai/config";
  const generatorModulePath = "../../src/ai/tactics/actionGenerator";
  const evaluatorModulePath = "../../src/ai/tactics/actionEvaluator";
  const observerModulePath = "../../src/ai/tactics/representativeActionShadowObserver";
  let observedCandidates: readonly ActionCandidate[] | undefined;
  const generatorCalls: CapturedGeneratorCall[] = [];
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
        const candidates = actual.generateActionCandidates(input);
        generatorCalls.push({
          candidates,
          elements: [...candidates],
          stableKeys: candidates.map((candidate) => candidate.stableKey),
          bytesBefore: canonicalJson(candidates),
        });
        return candidates;
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
    const baseConfig = options.config ?? (await import("../../src/ai/config")).DEFAULT_AI_PERFORMANCE_CONFIG;
    const decision = decideAiAction(options.observation ?? observation(), options.runtime ?? emptyRuntime(), {
      ...baseConfig,
      turn: options.config?.turn ?? 1,
      diagnostics,
      representativeActionShadow: { mode, hardCap: 256 },
    });
    if (generatorCalls.length !== 1) throw new Error(`D2E_EXPECTED_ONE_GENERATOR_CALL_${generatorCalls.length}`);
    const [generatorCall] = generatorCalls;
    if (generatorCall === undefined) throw new Error("D2E_CAPTURE_GENERATOR_NOT_CALLED");
    return {
      decision,
      diagnostics,
      generatorInvocationCount: generatorCalls.length,
      generatedCandidates: generatorCall.candidates,
      generatedCandidateElements: generatorCall.elements,
      observedCandidates,
      generatedStableKeys: generatorCall.stableKeys,
      generatedCandidateBytesBefore: generatorCall.bytesBefore,
      generatedCandidateBytesAfter: canonicalJson(generatorCall.candidates),
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
  generatorInvocationCount: number;
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
  let observedCandidates: readonly ActionCandidate[] | undefined;
  const generatorCalls: CapturedGeneratorCall[] = [];
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
        const candidates = actual.generateActionCandidates(input);
        generatorCalls.push({
          candidates,
          elements: [...candidates],
          stableKeys: candidates.map((candidate) => candidate.stableKey),
          bytesBefore: canonicalJson(candidates),
        });
        return candidates;
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
    if (generatorCalls.length !== 1) throw new Error(`D2E_EXPECTED_ONE_GENERATOR_CALL_${generatorCalls.length}`);
    const [generatorCall] = generatorCalls;
    if (generatorCall === undefined) throw new Error("D2E_ROOM_CAPTURE_GENERATOR_NOT_CALLED");
    const newPlay = room.playHistory.slice(priorPlayCount).at(-1);
    return {
      room,
      diagnostics,
      aiSeat,
      action: newPlay?.action,
      generatorInvocationCount: generatorCalls.length,
      generatedCandidates: generatorCall.candidates,
      generatedCandidateElements: generatorCall.elements,
      generatedStableKeys: generatorCall.stableKeys,
      generatedCandidateBytesBefore: generatorCall.bytesBefore,
      generatedCandidateBytesAfter: canonicalJson(generatorCall.candidates),
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

function readD2cDecisionFixture(): {
  observation: AiObservation;
  runtime: AiRuntimeState;
  config: AiDecisionConfig;
} {
  const fixture = fixtureData as {
    cases: Array<{ observation: AiObservation; runtimeInput: AiRuntimeState; config: AiDecisionConfig }>;
  };
  const firstCase = fixture.cases[0];
  if (firstCase === undefined) throw new Error("D2C_TASK4_FIXTURE_EMPTY");
  return {
    observation: structuredClone(firstCase.observation),
    runtime: structuredClone(firstCase.runtimeInput),
    config: structuredClone(firstCase.config),
  };
}

function d2cEvidenceWith(): D2cPlanPolicyInput["evidence"] {
  return {
    schemaVersion: "d2-lightweight-evidence-v1",
    gameId: "d2c-test-game",
    roundIdentity: "d2c-test-round",
    handIdentity: "d2c-test-hand",
    eventIndex: 7,
    perspectiveSeat: 0,
    seatMap: { self: 0, partner: 2, leftOpponent: 1, rightOpponent: 3 },
    hardPublicFacts: {
      remainingCardCounts: { self: 20, partner: 20, leftOpponent: 2, rightOpponent: 5 },
      currentTrick: { trickIndex: 2, leadSeat: 0, passSeats: [] },
      initiativeRelation: "self",
      playedCardIds: [],
      playedCardClasses: [],
      publicTransfers: [],
      publicTributeEvents: [],
      finishOrder: ["leftOpponent"],
    },
    derivedSignals: {
      recentActions: [],
      recentPassStreakByRelation: { self: 0, partner: 0, leftOpponent: 0, rightOpponent: 0 },
      recentActionTendencies: {
        self: { playCount: 1, passCount: 0, lastActionKind: "play" },
        partner: { playCount: 0, passCount: 1, lastActionKind: "pass" },
        leftOpponent: { playCount: 0, passCount: 0 },
        rightOpponent: { playCount: 0, passCount: 0 },
      },
    },
    provenance: [],
  };
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
  expect(disabledDecision.generatorInvocationCount).toBe(1);
  expect(shadowDecision.generatorInvocationCount).toBe(1);
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
  expect(disabledRun!.generatorInvocationCount).toBe(1);
  expect(shadowRun!.generatorInvocationCount).toBe(1);
  expect(disabledRun!.generatedCandidates).not.toBe(shadowRun!.generatedCandidates);
  expect(disabledRun!.generatedCandidateElements[0]).not.toBe(shadowRun!.generatedCandidateElements[0]);
  expectNoSharedObjectReferences(disabledRun!.generatedCandidates, shadowRun!.generatedCandidates);
  expect(disabledRun!.generatedCandidates.length).toBeGreaterThan(0);
  expect(shadowRun!.generatedCandidates.length).toBeGreaterThan(0);
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
  expect(disabledRun!.diagnostics.representativeActionShadow.records).toHaveLength(0);
  expect(shadowRun!.diagnostics.representativeActionShadow.records).toHaveLength(1);
  const [roomShadowRecord] = shadowRun!.diagnostics.representativeActionShadow.records;
  expect(roomShadowRecord).toBeDefined();
  expect(Object.isFrozen(roomShadowRecord)).toBe(true);
  expect([...allKeys(roomShadowRecord)]).not.toEqual(expect.arrayContaining([
    "representativeInputIndices", "representativeByInputIndex", "stableKey", "candidate", "action", "group", "card", "cards", "hand", "lastPlay", "runtime", "Room",
  ]));

  const d2cFixture = readD2cDecisionFixture();
  const d2cDisabledDecision = await runCapturedDecision("disabled", d2cFixture);
  const d2cShadowDecision = await runCapturedDecision("shadow", d2cFixture);
  expect(d2cDisabledDecision.diagnostics.representativeActionShadow).toMatchObject({
    observerInvocationCount: 0,
    reducerAttemptCount: 0,
    reducerResultCount: 0,
  });
  expect(d2cDisabledDecision.diagnostics.representativeActionShadow.records).toHaveLength(0);
  expect(d2cShadowDecision.diagnostics.representativeActionShadow).toMatchObject({
    observerInvocationCount: 1,
    reducerAttemptCount: 1,
    reducerResultCount: 1,
  });
  expect(d2cShadowDecision.diagnostics.representativeActionShadow.records).toHaveLength(1);
  const evidence = d2cEvidenceWith();
  for (const d2cMode of ["disabled", "shadow"] as const) {
    const disabledInput = d2cInputFromDecision(d2cDisabledDecision.decision, d2cMode, evidence);
    const shadowInput = d2cInputFromDecision(d2cShadowDecision.decision, d2cMode, evidence);
    expect(disabledInput.candidatePlans.length).toBeGreaterThan(0);
    expect(shadowInput.candidatePlans.length).toBe(disabledInput.candidatePlans.length);
    expect(shadowInput.candidatePlans.map((candidate) => candidate.plan.id)).toEqual(disabledInput.candidatePlans.map((candidate) => candidate.plan.id));
    const disabledResult = deriveD2cPlanPriorityQuota(disabledInput);
    const shadowResult = deriveD2cPlanPriorityQuota(shadowInput);
    expect(canonicalJson(disabledResult)).toBe(canonicalJson(shadowResult));
    expect(canonicalJson(disabledResult.diagnostics)).toBe(canonicalJson(shadowResult.diagnostics));
    expect(canonicalJson(disabledResult.familyPriority)).toBe(canonicalJson(shadowResult.familyPriority));
    expect(canonicalJson(disabledResult.familyQuotas)).toBe(canonicalJson(shadowResult.familyQuotas));
    expect(canonicalJson(Object.keys(disabledResult.kind === "shadow" ? disabledResult.annotations : {}))).toBe(canonicalJson(Object.keys(shadowResult.kind === "shadow" ? shadowResult.annotations : {})));
    if (d2cMode === "disabled") {
      expect(disabledResult.kind).toBe("disabled");
      expect(shadowResult.kind).toBe("disabled");
      expect(disabledResult.mode).toBe("disabled");
      expect(shadowResult.mode).toBe("disabled");
      expect(disabledResult.candidateCount).toBeGreaterThan(0);
      expect(shadowResult.candidateCount).toBe(disabledResult.candidateCount);
    } else {
      expect(disabledResult.kind).toBe("shadow");
      expect(shadowResult.kind).toBe("shadow");
      expect(disabledResult.familyPriority.length).toBeGreaterThan(0);
      expect(shadowResult.familyPriority.length).toBeGreaterThan(0);
      expect(disabledResult.familyQuotas.length).toBeGreaterThan(0);
      expect(shadowResult.familyQuotas.length).toBeGreaterThan(0);
      expect(disabledResult.familyQuotas.some((quota) => quota.quota > 0)).toBe(true);
      expect(shadowResult.familyQuotas.some((quota) => quota.quota > 0)).toBe(true);
    }
    expect([...allKeys(disabledResult)]).not.toEqual(expect.arrayContaining(["representativeInputIndices", "representativeByInputIndex"]));
    expectNoInputReference(disabledResult, disabledInput);
    expectNoInputReference(shadowResult, shadowInput);
  }

  console.info(JSON.stringify({
    randomTraceLengths: randomTraces,
    engine: {
      disabled: { generatorInvocations: disabledDecision.generatorInvocationCount, candidateCount: disabledDecision.generatedCandidates.length, evaluatorInvocations: disabledDecision.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(disabledDecision.generatedStableKeys)) },
      shadow: { generatorInvocations: shadowDecision.generatorInvocationCount, candidateCount: shadowDecision.generatedCandidates.length, evaluatorInvocations: shadowDecision.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(shadowDecision.generatedStableKeys)) },
    },
    room: {
      disabled: { generatorInvocations: disabledRun!.generatorInvocationCount, candidateCount: disabledRun!.generatedCandidates.length, evaluatorInvocations: disabledRun!.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(disabledRun!.generatedStableKeys)) },
      shadow: { generatorInvocations: shadowRun!.generatorInvocationCount, candidateCount: shadowRun!.generatedCandidates.length, evaluatorInvocations: shadowRun!.evaluatorCalls.length, stableKeyHash: sha256(canonicalJson(shadowRun!.generatedStableKeys)) },
    },
  }));
});
