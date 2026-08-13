import { expect, it, vi } from "vitest";
import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../src/ai/config";
import { createAiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import { observeRepresentativeActions } from "../../src/ai/tactics/representativeActionShadowObserver";
import type { AiDecision, AiDecisionConfig, AiObservation, AiRuntimeState, ActionCandidate, RepresentativeActionShadowConfig, RepresentativeActionShadowMode } from "../../src/ai/contracts";
import type { AiPlanningDiagnostics } from "../../src/ai/diagnostics/aiPlanningDiagnostics";
import type { CardGroup } from "../../src/engine/groups";
import type { RepresentativeActionReducerInput } from "../../src/ai/tactics/representativeActionReducer";
import { canonicalJson } from "./d0FixtureCanonicalizer";

const gameRank: GameRank = "10";
const deck = createDeck();

const singleGroup = (id: string): CardGroup => {
  const card = deck.find((candidate: Card) => candidate.id === id);
  if (card === undefined) throw new Error(`Missing fixture card ${id}`);
  const group = classifyPlay([card], gameRank);
  if (group === undefined) throw new Error(`Could not classify fixture card ${id}`);
  return group;
};

const observation = (lastPlayId?: string): AiObservation => {
  return {
    hand: deck.slice(0, 8).map((card) => ({ ...card })),
    gameRank,
    seat: 1,
    partnerSeat: 3,
    playedCards: [],
    handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 },
    finishOrder: [],
    ...(lastPlayId === undefined ? {} : { lastPlay: singleGroup(lastPlayId), lastPlaySeat: 0 }),
  };
};

const emptyRuntime = (): AiRuntimeState => ({
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  });

const configFor = (mode: RepresentativeActionShadowMode, diagnostics: ReturnType<typeof createAiPlanningDiagnostics>): AiDecisionConfig => ({
    ...DEFAULT_AI_PERFORMANCE_CONFIG,
    turn: 1,
    diagnostics,
    representativeActionShadow: { mode, hardCap: 256 },
  });

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
  if (value === null || typeof value !== "object" || references.has(value)) {
    return references;
  }

  references.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectObjectReferences(nested, references);
  }
  return references;
}

function expectNoSharedObjectReferences(left: unknown, right: unknown): void {
  const leftReferences = collectObjectReferences(left);
  const rightReferences = collectObjectReferences(right);
  for (const reference of rightReferences) {
    expect(leftReferences.has(reference)).toBe(false);
  }
}

function expectAllObjectNodesFrozen(value: unknown, visited = new Set<object>()): void {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return;
  }

  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    expectAllObjectNodesFrozen(nested, visited);
  }
}

type IsolatedShadowRun = {
  decision: AiDecision;
  diagnostics: AiPlanningDiagnostics;
  observation: AiObservation;
  runtime: AiRuntimeState;
  generatedCandidates: readonly ActionCandidate[];
  generatedCandidateElements: readonly ActionCandidate[];
  generatedCandidateBytes: string;
  observedCandidates: readonly ActionCandidate[] | undefined;
  capturedReducerInput: RepresentativeActionReducerInput | undefined;
  observationBytes: string;
  runtimeBytes: string;
};

type IsolatedShadowRunOptions = Readonly<{
  hardCap?: number;
  invalidMode?: boolean;
  reducerMode?: "capture" | "throw";
  sinkMode?: "throw";
  lastPlayId?: string;
}>;

async function runIsolatedShadowDecision(options: IsolatedShadowRunOptions = {}): Promise<IsolatedShadowRun> {
  const generatorModulePath = "../../src/ai/tactics/actionGenerator";
  const reducerModulePath = "../../src/ai/tactics/representativeActionReducer";
  const diagnosticsModulePath = "../../src/ai/diagnostics/aiPlanningDiagnostics";
  let generatedCandidates: readonly ActionCandidate[] | undefined;
  let generatedCandidateElements: readonly ActionCandidate[] | undefined;
  let generatedCandidateBytes = "";
  let observedCandidates: readonly ActionCandidate[] | undefined;
  let capturedReducerInput: RepresentativeActionReducerInput | undefined;

  vi.resetModules();
  vi.doMock(generatorModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/actionGenerator")>(generatorModulePath);
    return {
      ...actual,
      generateActionCandidates: (input: Parameters<typeof actual.generateActionCandidates>[0]) => {
        const result = actual.generateActionCandidates(input);
        generatedCandidates = result;
        generatedCandidateElements = [...result];
        generatedCandidateBytes = canonicalJson(result);
        return result;
      },
    };
  });
  vi.doMock(reducerModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/representativeActionReducer")>(reducerModulePath);
    return {
      ...actual,
      reduceRepresentativeActions: (input: RepresentativeActionReducerInput) => {
        capturedReducerInput = input;
        if (options.reducerMode === "throw") {
          throw new Error("injected reducer failure");
        }
        return actual.reduceRepresentativeActions(input);
      },
    };
  });
  vi.doMock("../../src/ai/tactics/representativeActionShadowObserver", async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/tactics/representativeActionShadowObserver")>("../../src/ai/tactics/representativeActionShadowObserver");
    return {
      ...actual,
      observeRepresentativeActions: (input: Parameters<typeof actual.observeRepresentativeActions>[0]) => {
        observedCandidates = input.candidates;
        return actual.observeRepresentativeActions(input);
      },
    };
  });
  vi.doMock(diagnosticsModulePath, async () => {
    const actual = await vi.importActual<typeof import("../../src/ai/diagnostics/aiPlanningDiagnostics")>(diagnosticsModulePath);
    return {
      ...actual,
      ...(options.sinkMode === "throw" ? { recordRepresentativeActionShadowRecord: () => { throw new Error("injected sink failure"); } } : {}),
    };
  });

  try {
    const { decideAiAction: isolatedDecideAiAction } = await import("../../src/ai/aiDecisionEngine");
    const diagnosticsModule = await import("../../src/ai/diagnostics/aiPlanningDiagnostics");
    const diagnostics = diagnosticsModule.createAiPlanningDiagnostics();
    const isolatedObservation = observation(options.lastPlayId);
    const isolatedRuntime = emptyRuntime();
    const observationBytes = canonicalJson(isolatedObservation);
    const runtimeBytes = canonicalJson(isolatedRuntime);
    const shadowConfig: RepresentativeActionShadowConfig = options.invalidMode
      ? ({ mode: "malicious-runtime-value", hardCap: 256 } as unknown as RepresentativeActionShadowConfig)
      : { mode: "shadow", hardCap: options.hardCap ?? 256 };
    const decision = isolatedDecideAiAction(isolatedObservation, isolatedRuntime, {
      ...DEFAULT_AI_PERFORMANCE_CONFIG,
      turn: 1,
      diagnostics,
      representativeActionShadow: shadowConfig,
    });

    return {
      decision,
      diagnostics,
      observation: isolatedObservation,
      runtime: isolatedRuntime,
      generatedCandidates: generatedCandidates!,
      generatedCandidateElements: generatedCandidateElements!,
      generatedCandidateBytes,
      observedCandidates,
      capturedReducerInput,
      observationBytes,
      runtimeBytes,
    };
  } finally {
    vi.doUnmock(generatorModulePath);
    vi.doUnmock(reducerModulePath);
    vi.doUnmock("../../src/ai/tactics/representativeActionShadowObserver");
    vi.doUnmock(diagnosticsModulePath);
    vi.resetModules();
  }
}

type CapturedEvaluatorCall = Readonly<{
  candidate: ActionCandidate;
  stableKey: string;
  candidateBytes: string;
  scoreBytes: string;
}>;

type CapturedDecisionRun = Readonly<{
  mode: RepresentativeActionShadowMode;
  decision: AiDecision;
  diagnostics: AiPlanningDiagnostics;
  generatedCandidates: ActionCandidate[];
  generatedCandidateElements: readonly ActionCandidate[];
  generatedStableKeys: readonly string[];
  generatedCandidateBytesBefore: string;
  generatedCandidateBytesAfter: string;
  observedCandidates: readonly ActionCandidate[] | undefined;
  evaluatorCalls: readonly CapturedEvaluatorCall[];
}>;

async function runCapturedDecision(mode: RepresentativeActionShadowMode): Promise<CapturedDecisionRun> {
  const configModulePath = "../../src/ai/config";
  const generatorModulePath = "../../src/ai/tactics/actionGenerator";
  const evaluatorModulePath = "../../src/ai/tactics/actionEvaluator";
  const observerModulePath = "../../src/ai/tactics/representativeActionShadowObserver";
  let generatedCandidates: ActionCandidate[] | undefined;
  let generatedCandidateElements: readonly ActionCandidate[] | undefined;
  let generatedCandidateBytesBefore = "";
  let observedCandidates: readonly ActionCandidate[] | undefined;
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
    const { decideAiAction: isolatedDecideAiAction } = await import("../../src/ai/aiDecisionEngine");
    const diagnosticsModule = await import("../../src/ai/diagnostics/aiPlanningDiagnostics");
    const diagnostics = diagnosticsModule.createAiPlanningDiagnostics();
    const decision = isolatedDecideAiAction(observation(), emptyRuntime(), {
      ...DEFAULT_AI_PERFORMANCE_CONFIG,
      turn: 1,
      diagnostics,
    });
    if (generatedCandidates === undefined || generatedCandidateElements === undefined) {
      throw new Error("D2E_CAPTURE_GENERATOR_NOT_CALLED");
    }
    return {
      mode,
      decision,
      diagnostics,
      generatedCandidates,
      generatedCandidateElements,
      generatedStableKeys: generatedCandidates.map((candidate) => candidate.stableKey),
      generatedCandidateBytesBefore,
      generatedCandidateBytesAfter: canonicalJson(generatedCandidates),
      observedCandidates,
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

it("characterizes independent disabled and shadow engine captures", async () => {
  const disabled = await runCapturedDecision("disabled");
  const shadow = await runCapturedDecision("shadow");

  assertCapturedDecisionRun(disabled);
  assertCapturedDecisionRun(shadow);
  expect(disabled.generatedCandidates).not.toBe(shadow.generatedCandidates);
  expect(disabled.generatedCandidateElements[0]).not.toBe(shadow.generatedCandidateElements[0]);
  expect(canonicalJson(disabled.generatedCandidates)).toBe(canonicalJson(shadow.generatedCandidates));
  expect(disabled.generatedStableKeys).toEqual(shadow.generatedStableKeys);
  expect(disabled.evaluatorCalls.map((call) => call.candidateBytes)).toEqual(shadow.evaluatorCalls.map((call) => call.candidateBytes));
  expect(disabled.evaluatorCalls.map((call) => call.scoreBytes)).toEqual(shadow.evaluatorCalls.map((call) => call.scoreBytes));
  expect(canonicalJson(decisionProjection(disabled.decision))).toBe(canonicalJson(decisionProjection(shadow.decision)));

  expect(disabled.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 0, reducerAttemptCount: 0, reducerResultCount: 0 });
  expect(disabled.diagnostics.representativeActionShadow.records).toHaveLength(0);
  expect(shadow.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
  expect(shadow.diagnostics.representativeActionShadow.records).toHaveLength(1);
  const [record] = shadow.diagnostics.representativeActionShadow.records;
  expect(Object.isFrozen(record)).toBe(true);
  expect(Object.keys(record ?? {})).not.toEqual(expect.arrayContaining([
    "representativeInputIndices",
    "representativeByInputIndex",
    "stableKey",
    "candidate",
    "action",
    "group",
    "cards",
    "hand",
    "lastPlay",
    "runtime",
    "Room",
  ]));
});

it("keeps disabled mode at zero observer/reducer counts", () => {
  const diagnostics = createAiPlanningDiagnostics();
  const decision = decideAiAction(observation(), emptyRuntime(), configFor("disabled", diagnostics));

  expect(decision.candidateCount).toBeGreaterThan(0);
  expect(diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 0, reducerAttemptCount: 0, reducerResultCount: 0 });
  expect(diagnostics.representativeActionShadow.records).toHaveLength(0);
});

it("observes once after real candidate generation", () => {
  const diagnostics = createAiPlanningDiagnostics();
  const decision = decideAiAction(observation(), emptyRuntime(), configFor("shadow", diagnostics));

  expect(decision.candidateCount).toBeGreaterThan(0);
  expect(diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
  const [record] = diagnostics.representativeActionShadow.records;
  expect(diagnostics.representativeActionShadow.records).toHaveLength(1);
  expect(record).toMatchObject({
    schemaVersion: "d2e-shadow-v1",
    status: "observed",
    reducerStatus: "unchanged",
    hardCap: 256,
    inputCandidateCount: decision.candidateCount,
  });
  expect(Object.isFrozen(record)).toBe(true);
});

it("fails open when the reducer throws", async () => {
  const disabledDiagnostics = createAiPlanningDiagnostics();
  const disabled = decideAiAction(observation(), emptyRuntime(), configFor("disabled", disabledDiagnostics));
  const isolated = await runIsolatedShadowDecision({ reducerMode: "throw" });

  expect(canonicalJson(decisionProjection(isolated.decision))).toBe(canonicalJson(decisionProjection(disabled)));
  expect(isolated.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 0 });
  expect(isolated.diagnostics.representativeActionShadow.records.at(-1)).toMatchObject({ failureReason: "adapter-error" });
});

it("fails open when a runtime-invalid mode reaches the observer", async () => {
  const disabledDiagnostics = createAiPlanningDiagnostics();
  const disabled = decideAiAction(observation(), emptyRuntime(), configFor("disabled", disabledDiagnostics));
  const isolated = await runIsolatedShadowDecision({ invalidMode: true, reducerMode: "throw" });

  expect(canonicalJson(decisionProjection(isolated.decision))).toBe(canonicalJson(decisionProjection(disabled)));
  expect(isolated.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 0, reducerAttemptCount: 0, reducerResultCount: 0 });
  expect(isolated.capturedReducerInput).toBeUndefined();
  expect(isolated.diagnostics.representativeActionShadow.records.at(-1)).toMatchObject({ failureReason: "adapter-error" });
});

it("records reducer-returned invalid-hard-cap without changing the decision", async () => {
  const disabledDiagnostics = createAiPlanningDiagnostics();
  const disabled = decideAiAction(observation(), emptyRuntime(), configFor("disabled", disabledDiagnostics));
  const isolated = await runIsolatedShadowDecision({ hardCap: 0 });
  const record = isolated.diagnostics.representativeActionShadow.records.at(-1);

  expect(canonicalJson(decisionProjection(isolated.decision))).toBe(canonicalJson(decisionProjection(disabled)));
  expect(isolated.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
  expect(record).toMatchObject({ status: "failed", reducerStatus: "failed", failureReason: "invalid-hard-cap", fallback: "use-original-candidates" });
});

it("records cap-unsatisfied for a real multi-class candidate set without changing the decision", async () => {
  const disabledDiagnostics = createAiPlanningDiagnostics();
  const disabled = decideAiAction(observation(), emptyRuntime(), configFor("disabled", disabledDiagnostics));
  const isolated = await runIsolatedShadowDecision({ hardCap: 1 });
  const record = isolated.diagnostics.representativeActionShadow.records.at(-1);

  expect(canonicalJson(decisionProjection(isolated.decision))).toBe(canonicalJson(decisionProjection(disabled)));
  expect(record).toMatchObject({ status: "failed", reducerStatus: "failed", failureReason: "cap-unsatisfied", fallback: "use-original-candidates" });
});

it("keeps production objects separate from the frozen reducer input", async () => {
  const isolated = await runIsolatedShadowDecision({ reducerMode: "capture" });
  const captured = isolated.capturedReducerInput;

  expect(captured).toBeDefined();
  expectAllObjectNodesFrozen(captured);
  for (const productionValue of [
    isolated.observation,
    isolated.observation.hand,
    isolated.observation.lastPlay,
    isolated.generatedCandidates,
    ...isolated.generatedCandidateElements,
    isolated.runtime,
    isolated.decision.action,
  ]) {
    expectNoSharedObjectReferences(productionValue, captured);
  }
  expect(canonicalJson(isolated.observation)).toBe(isolated.observationBytes);
  expect(canonicalJson(isolated.runtime)).toBe(isolated.runtimeBytes);
  expect(canonicalJson(isolated.generatedCandidates)).toBe(isolated.generatedCandidateBytes);
  expect(isolated.observedCandidates).toBe(isolated.generatedCandidates);
  for (let index = 0; index < isolated.generatedCandidateElements.length; index += 1) {
    expect(isolated.generatedCandidates[index]).toBe(isolated.generatedCandidateElements[index]);
  }
  for (const productionValue of [
    isolated.observation,
    isolated.observation.hand,
    isolated.observation.lastPlay,
    isolated.generatedCandidates,
    ...isolated.generatedCandidateElements,
    isolated.runtime,
    isolated.decision.action,
  ]) {
    expectNoSharedObjectReferences(isolated.diagnostics, productionValue);
  }
  expectNoSharedObjectReferences(isolated.diagnostics, captured);
});

it("keeps a real follow lastPlay detached and decision-neutral", async () => {
  const disabledDiagnostics = createAiPlanningDiagnostics();
  const disabled = decideAiAction(observation("S7-1"), emptyRuntime(), configFor("disabled", disabledDiagnostics));
  const isolated = await runIsolatedShadowDecision({ lastPlayId: "S7-1", reducerMode: "capture" });
  const captured = isolated.capturedReducerInput;

  expect(isolated.observation.lastPlay).toBeDefined();
  expect(captured?.lastPlay).toBeDefined();
  expect(canonicalJson(captured!.lastPlay)).toBe(canonicalJson(isolated.observation.lastPlay));
  expectNoSharedObjectReferences(isolated.observation.lastPlay, captured!.lastPlay);
  expectAllObjectNodesFrozen(captured!.lastPlay);
  expect(canonicalJson(decisionProjection(isolated.decision))).toBe(canonicalJson(decisionProjection(disabled)));
  expect(isolated.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
  expect(canonicalJson(isolated.observation)).toBe(isolated.observationBytes);
  expect(canonicalJson(isolated.generatedCandidates)).toBe(isolated.generatedCandidateBytes);
});

it("does not escape when the detached builder reads a throwing candidate", () => {
  const diagnostics = createAiPlanningDiagnostics();
  const throwingCandidate = {
    get action(): never {
      throw new Error("injected builder failure");
    },
    source: "HAND_ANALYSIS",
    policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] },
    alignedPlanIds: [],
    stableKey: "builder-throw",
    reasonCodes: [],
  } as unknown as ActionCandidate;

  expect(() => observeRepresentativeActions({
    mode: "shadow",
    candidates: [throwingCandidate],
    gameRank,
    hardCap: 256,
    diagnostics,
  })).not.toThrow();
  expect(diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 0, reducerResultCount: 0 });
  expect(diagnostics.representativeActionShadow.records.at(-1)).toMatchObject({ failureReason: "adapter-error" });
});

it("keeps formal decision flow alive when the diagnostics sink throws", async () => {
  const disabledDiagnostics = createAiPlanningDiagnostics();
  const disabled = decideAiAction(observation(), emptyRuntime(), configFor("disabled", disabledDiagnostics));
  let thrown: unknown;
  let isolated: IsolatedShadowRun | undefined;
  try {
    isolated = await runIsolatedShadowDecision({ sinkMode: "throw" });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeUndefined();
  expect(isolated).toBeDefined();
  expect(canonicalJson(decisionProjection(isolated!.decision))).toBe(canonicalJson(decisionProjection(disabled)));
  expect(isolated!.diagnostics.representativeActionShadow).toMatchObject({ observerInvocationCount: 1, reducerAttemptCount: 1, reducerResultCount: 1 });
});
