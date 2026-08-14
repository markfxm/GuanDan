import type { Card } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { canonicalPublicLedgerHash } from "../../game/publicLedger";
import type { PublicActionEvent } from "../../game/publicEvent";
import { replayParticleScenario } from "../particles/publicEventDealReplay";
import { particleScenarioIdentity } from "../particles/canonicalDeal";
import { validateCanonicalInitialDeal } from "../particles/particleConservation";
import { readParticleBankRolloutAccess } from "../particles/particleBankRolloutAccess";
import type { ParticleBankRolloutRecord } from "../particles/particleBankRolloutAccess";
import { canonicalActionIdentity, canonicalReplayContextIdentity, validateRolloutBudget } from "./contracts";
import type {
  CrnView,
  RolloutCandidate,
  RolloutContractResult,
  RolloutReplicateInput,
  RolloutReplayContextInput,
  RolloutPublicState,
  RolloutScenario,
  RolloutScenarioSourceInput,
  RolloutScenarioSourceResult,
  ValidatedPublicReplayContext,
  ValidatedRolloutBudget,
} from "./contracts";
import type { ParticleScenario, ParticleSnapshotIdentity, ReplayedParticleState } from "../particles/contracts";
import type { HardPublicLedger } from "../../game/publicLedger";
import { isDataDescriptor, isPlainDataArray, isPlainDataRecord } from "./plainData";

const SOURCE_INPUT_KEYS = [
  "bank", "publicHistoryEvents", "initialLedger", "finalLedger", "gameRank", "perspectiveSeat", "ownCurrentHand", "publicState",
] as const;

type ValidatedSourceContext = Readonly<{
  publicReplayContext: ValidatedPublicReplayContext;
  publicState: RolloutPublicState;
}>;

const validatedSourceContext = Symbol("validatedSourceContext");
type RegisteredScenarioSourceResult = Extract<RolloutScenarioSourceResult, { ok: true }> & Readonly<{
  [validatedSourceContext]: ValidatedSourceContext;
}>;
const validatedSourceResults = new WeakSet<object>();

export function createParticleScenarioSource(input: RolloutScenarioSourceInput): RolloutScenarioSourceResult {
  try {
    return createParticleScenarioSourceUnchecked(input);
  } catch {
    return scenarioSourceFailure("replay-context-missing");
  }
}

export function createRolloutReplicateInputFromValidatedSource(
  context: RolloutScenarioSourceResult,
  scenarioIndex: number,
  candidate: RolloutCandidate,
  replicateIdentity: string,
  random: CrnView,
  validatedBudget: ValidatedRolloutBudget,
): RolloutContractResult<RolloutReplicateInput> {
  try {
    if (!isRegisteredScenarioSourceResult(context) || !Number.isSafeInteger(scenarioIndex) || scenarioIndex < 0 || scenarioIndex >= context.scenarios.length) return invalidReplicateInput();
    const registered = context[validatedSourceContext];
    if (!/^[a-f0-9]{64}$/.test(replicateIdentity)) return invalidReplicateInput();
    if (canonicalActionIdentity(candidate.action) !== candidate.candidateId || !Number.isFinite(candidate.baselineEvaluatorScore)) return invalidReplicateInput();
    const budget = validateRolloutBudget({ budget: validatedBudget.budget, limits: validatedBudget.limits });
    if (!budget.ok || validatedBudget.validated !== true || validatedBudget.maximumWorkUnits !== budget.value.maximumWorkUnits) return invalidReplicateInput();
    const scenario = context.scenarios[scenarioIndex]!;
    const input: RolloutReplicateInput = {
      candidate: structuredClone(candidate),
      scenario: structuredClone(scenario),
      publicState: structuredClone(registered.publicState),
      publicReplayContext: structuredClone(registered.publicReplayContext),
      replicateIdentity,
      random,
      validatedBudget: structuredClone(validatedBudget),
    };
    return Object.freeze({ ok: true as const, value: deepFreeze(input) });
  } catch {
    return invalidReplicateInput();
  }
}

function createParticleScenarioSourceUnchecked(input: RolloutScenarioSourceInput): RolloutScenarioSourceResult {
  if (!isPlainDataGraph(input) || !isRecord(input) || !hasExactKeys(input, SOURCE_INPUT_KEYS)) return scenarioSourceFailure("replay-context-missing");
  let accessResult: ReturnType<typeof readParticleBankRolloutAccess>;
  try {
    accessResult = readParticleBankRolloutAccess(input.bank);
  } catch {
    return scenarioSourceFailure("private-state-invalid");
  }
  if (!accessResult.ok) return accessResult;

  try {
    if (!hasReplayEnvelopeShape(input)) return scenarioSourceFailure("replay-context-missing");
    if (!matchesSnapshotContext(input)) return scenarioSourceFailure("ledger-mismatch");
    if (!hasReplayContextShape(input)) return hasMalformedPublicLastPlay(input)
      ? scenarioSourceFailure("private-state-invalid")
      : scenarioSourceFailure("replay-context-missing");

    const scenarios: RolloutScenario[] = [];
    const seenParticleIds = new Set<string>();
    let weightTotal = 0;
    for (const record of accessResult.access.records) {
      if (!isParticleRecord(record) || seenParticleIds.has(record.particleId)) return scenarioSourceFailure("private-state-invalid");
      if (!Number.isFinite(record.normalizedWeight) || record.normalizedWeight < 0) return scenarioSourceFailure("private-state-invalid");

      let expectedParticleId: string;
      try {
        expectedParticleId = particleScenarioIdentity(input.bank.snapshot, record.scenario);
      } catch {
        return scenarioSourceFailure("private-state-invalid");
      }
      if (record.particleId !== expectedParticleId) return scenarioSourceFailure("private-state-invalid");
      seenParticleIds.add(record.particleId);
      weightTotal += record.normalizedWeight;
      if (!Number.isFinite(weightTotal)) return scenarioSourceFailure("private-state-invalid");

      let replayedFinalState: ReplayedParticleState;
      try {
        replayedFinalState = input.publicHistoryEvents.length === 0
          ? replayEmptyScenario(record.scenario, input)
          : replayParticleScenario({
            scenario: record.scenario,
            publicHistoryEvents: input.publicHistoryEvents,
            initialLedger: input.initialLedger,
            finalLedger: input.finalLedger,
            gameRank: input.gameRank,
            perspectiveSeat: input.perspectiveSeat,
            ownCurrentHand: input.ownCurrentHand,
          }).finalState;
      } catch {
        return scenarioSourceFailure("private-state-invalid");
      }
      if (!matchesPublicState(replayedFinalState, input.publicState) || canonicalPublicLedgerHash(replayedFinalState.ledger) !== canonicalPublicLedgerHash(input.finalLedger)) {
        return scenarioSourceFailure("private-state-invalid");
      }

      scenarios.push({
        scenarioIdentity: record.particleId,
        normalizedWeight: record.normalizedWeight,
        privateState: structuredClone(replayedFinalState),
      });
    }

    if (scenarios.length === 0 || Math.abs(weightTotal - 1) > 1e-9 || !Number.isFinite(accessResult.access.effectiveSampleSize) || accessResult.access.effectiveSampleSize < 0 || accessResult.access.effectiveSampleSize > scenarios.length + 1e-9) {
      return scenarioSourceFailure("private-state-invalid");
    }

    const registeredContext = deepFreeze({
      publicReplayContext: {
        publicHistoryEvents: structuredClone(input.publicHistoryEvents),
        initialLedger: structuredClone(input.initialLedger),
        finalLedger: structuredClone(input.finalLedger),
      },
      publicState: structuredClone(input.publicState),
    });
    const result: RegisteredScenarioSourceResult = {
      ok: true as const,
      scenarios,
      effectiveSampleSize: accessResult.access.effectiveSampleSize,
      acceptedScenarioCount: scenarios.length,
      [validatedSourceContext]: registeredContext,
    };
    Object.defineProperty(result, validatedSourceContext, { enumerable: false, configurable: false, writable: false });
    deepFreeze(result);
    validatedSourceResults.add(result);
    return result;
  } catch {
    return scenarioSourceFailure("private-state-invalid");
  }
}

function isRegisteredScenarioSourceResult(value: RolloutScenarioSourceResult): value is RegisteredScenarioSourceResult {
  return value.ok && validatedSourceResults.has(value);
}

function hasReplayEnvelopeShape(input: unknown): input is RolloutScenarioSourceInput {
  return isPlainDataGraph(input)
    && isRecord(input)
    && hasExactKeys(input, SOURCE_INPUT_KEYS)
    && isRecord(input.bank)
    && isRecord(input.bank.snapshot)
    && isRecord(input.initialLedger)
    && isRecord(input.finalLedger)
    && isPlainDataArray(input.publicHistoryEvents)
    && isPlainDataArray(input.ownCurrentHand)
    && isRecord(input.publicState);
}

function hasReplayContextShape(input: unknown): input is RolloutScenarioSourceInput {
  if (!hasReplayEnvelopeShape(input)) return false;
  const initialLedger = input.initialLedger as HardPublicLedger;
  const finalLedger = input.finalLedger as HardPublicLedger;
  const snapshot: ParticleSnapshotIdentity = {
    gameId: initialLedger.gameId,
    roundIdentity: initialLedger.roundIdentity,
    handIdentity: initialLedger.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(initialLedger),
    lastAppliedEventIndex: finalLedger.lastAppliedEventIndex,
    ledgerHash: canonicalPublicLedgerHash(finalLedger),
    perspectiveSeat: input.perspectiveSeat as 0 | 1 | 2 | 3,
    gameRank: input.gameRank as "A" | "K" | "Q" | "J" | "10" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2",
  };
  try {
    canonicalReplayContextIdentity({
      publicHistoryEvents: input.publicHistoryEvents as readonly PublicActionEvent[],
      initialLedger,
      finalLedger,
      gameRank: input.gameRank as RolloutReplayContextInput["gameRank"],
      perspectiveSeat: input.perspectiveSeat as RolloutReplayContextInput["perspectiveSeat"],
      ownCurrentHand: input.ownCurrentHand as readonly Card[],
      actingSeat: (input.publicState as RolloutPublicState).actingSeat,
      publicState: input.publicState as RolloutPublicState,
      particleBankSnapshot: snapshot,
    });
    return true;
  } catch {
    return false;
  }
}

function matchesSnapshotContext(input: RolloutScenarioSourceInput): boolean {
  const snapshot = input.bank.snapshot;
  if (snapshot.gameRank !== input.gameRank || snapshot.perspectiveSeat !== input.perspectiveSeat) return false;
  if (snapshot.gameId !== input.initialLedger.gameId || snapshot.gameId !== input.finalLedger.gameId) return false;
  if (snapshot.roundIdentity !== input.initialLedger.roundIdentity || snapshot.roundIdentity !== input.finalLedger.roundIdentity) return false;
  if (snapshot.handIdentity !== input.initialLedger.handIdentity || snapshot.handIdentity !== input.finalLedger.handIdentity) return false;
  if (canonicalPublicLedgerHash(input.initialLedger) !== snapshot.initialLedgerHash) return false;
  if (canonicalPublicLedgerHash(input.finalLedger) !== snapshot.ledgerHash) return false;
  if (input.finalLedger.lastAppliedEventIndex !== snapshot.lastAppliedEventIndex) return false;
  if (input.initialLedger.lastAppliedEventIndex !== -1 || input.initialLedger.nextEventIndex !== 0) return false;
  return true;
}

function matchesPublicState(state: Readonly<{
  handCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
  publicPlayedCardIds: readonly string[];
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  currentTrick: Readonly<{ lastPlaySeat?: 0 | 1 | 2 | 3 }>;
  currentLastPlay?: Readonly<unknown> | null;
  }>, publicState: RolloutPublicState): boolean {
  return state.handCounts[0] === publicState.handCounts[0]
    && state.handCounts[1] === publicState.handCounts[1]
    && state.handCounts[2] === publicState.handCounts[2]
    && state.handCounts[3] === publicState.handCounts[3]
    && sameArray(state.publicPlayedCardIds, publicState.publicPlayedCardIds)
    && sameArray(state.finishOrder, publicState.finishOrder)
    && (state.currentTrick.lastPlaySeat ?? null) === publicState.currentLastPlaySeat
    && samePublicLastPlay(state.currentLastPlay, publicState.currentLastPlay);
}

function replayEmptyScenario(scenario: ParticleScenario, input: RolloutScenarioSourceInput): ReplayedParticleState {
  if (scenario.schemaVersion !== "d2-particle-scenario-v1" || scenario.hiddenTransferAssignments.length !== 0) throw new Error("EMPTY_HISTORY_SCENARIO_INVALID");
  validateCanonicalInitialDeal(scenario.initialDeal);
  const hands = {
    0: structuredClone(scenario.initialDeal.hands[0]),
    1: structuredClone(scenario.initialDeal.hands[1]),
    2: structuredClone(scenario.initialDeal.hands[2]),
    3: structuredClone(scenario.initialDeal.hands[3]),
  } as const;
  for (const seat of [0, 1, 2, 3] as const) {
    if (hands[seat].length !== input.finalLedger.handCounts[seat]) throw new Error("EMPTY_HISTORY_HAND_COUNT_INVALID");
  }
  if (!sameCardIds(hands[input.perspectiveSeat], input.ownCurrentHand)) throw new Error("EMPTY_HISTORY_OWN_HAND_INVALID");
  return deepFreeze({
    hands,
    publicPlayedCardIds: [...input.finalLedger.playedCardIds],
    revealedTransferEvents: structuredClone(input.finalLedger.revealedTransferEvents),
    currentTrick: structuredClone(input.finalLedger.currentTrick),
    finishOrder: [...input.finalLedger.finishOrder],
    handCounts: {
      0: input.finalLedger.handCounts[0],
      1: input.finalLedger.handCounts[1],
      2: input.finalLedger.handCounts[2],
      3: input.finalLedger.handCounts[3],
    },
    ledger: structuredClone(input.finalLedger),
  });
}

function sameCardIds(left: readonly Card[], right: readonly Card[]): boolean {
  return left.map((card) => card.id).sort().join(",") === right.map((card) => card.id).sort().join(",");
}

function samePublicLastPlay(left: unknown, right: unknown): boolean {
  if ((left === null || typeof left === "undefined") && (right === null || typeof right === "undefined")) return true;
  if (left === null || typeof left === "undefined" || right === null || typeof right === "undefined") return false;
  if (!isRecord(left) || !isRecord(right)) return false;
  try {
    return canonicalActionIdentity({ type: "play", group: left as CardGroup }) === canonicalActionIdentity({ type: "play", group: right as CardGroup });
  } catch {
    return false;
  }
}

function hasMalformedPublicLastPlay(input: unknown): boolean {
  if (!isRecord(input) || !isRecord(input.publicState) || input.publicState.currentLastPlay === null || input.publicState.currentLastPlay === undefined) return false;
  try {
    canonicalActionIdentity({ type: "play", group: input.publicState.currentLastPlay as CardGroup });
    return false;
  } catch {
    return true;
  }
}

function isParticleRecord(value: unknown): value is ParticleBankRolloutRecord {
  return isPlainDataGraph(value)
    && isRecord(value)
    && hasExactKeys(value, ["particleId", "scenario", "normalizedWeight"])
    && typeof value.particleId === "string"
    && value.particleId.length > 0
    && typeof value.normalizedWeight === "number"
    && Number.isFinite(value.normalizedWeight)
    && value.normalizedWeight >= 0
    && isRecord(value.scenario);
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function scenarioSourceFailure(reason: "ledger-mismatch" | "replay-context-missing" | "private-state-invalid"): RolloutScenarioSourceResult {
  return { ok: false, failure: { kind: "scenario-source-failed", reason } };
}

function invalidReplicateInput(): RolloutContractResult<never> {
  return Object.freeze({ ok: false as const, failure: Object.freeze({ kind: "invalid-request" as const, field: "request" }) });
}

function isRecord(value: unknown): value is Record<string, any> {
  return isPlainDataRecord(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isPlainDataRecord(value, keys, true);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (isDataDescriptor(descriptor)) deepFreeze(descriptor.value, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function isPlainDataGraph(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "undefined" || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const shapeValid = Array.isArray(value) ? isPlainDataArray(value) : isPlainDataRecord(value);
  if (!shapeValid) {
    ancestors.delete(value);
    return false;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !isDataDescriptor(descriptor) || !isPlainDataGraph(descriptor.value, ancestors)) {
      ancestors.delete(value);
      return false;
    }
  }
  ancestors.delete(value);
  return true;
}
