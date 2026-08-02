import { RANKS, type Card, type GameRank } from "../../engine/cards";
import type { CardGroup } from "../../engine/groups";
import { canonicalPublicLedgerHash } from "../../game/publicLedger";
import { replayParticleScenario } from "../particles/publicEventDealReplay";
import { particleScenarioIdentity } from "../particles/canonicalDeal";
import { readParticleBankRolloutAccess } from "../particles/particleBankRolloutAccess";
import type { ParticleBankRolloutRecord } from "../particles/particleBankRolloutAccess";
import { canonicalActionIdentity } from "./contracts";
import type {
  RolloutPublicState,
  RolloutScenario,
  RolloutScenarioSourceInput,
  RolloutScenarioSourceResult,
} from "./contracts";

export function createParticleScenarioSource(input: RolloutScenarioSourceInput): RolloutScenarioSourceResult {
  try {
    if (!hasReplayContextShape(input)) return scenarioSourceFailure("replay-context-missing");

    const accessResult = readParticleBankRolloutAccess(input.bank);
    if (!accessResult.ok) return accessResult;
    if (!matchesSnapshotContext(input)) return scenarioSourceFailure("ledger-mismatch");

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

      let replayed: ReturnType<typeof replayParticleScenario>;
      try {
        replayed = replayParticleScenario({
          scenario: record.scenario,
          publicHistoryEvents: input.publicHistoryEvents,
          initialLedger: input.initialLedger,
          finalLedger: input.finalLedger,
          gameRank: input.gameRank,
          perspectiveSeat: input.perspectiveSeat,
          ownCurrentHand: input.ownCurrentHand,
        });
      } catch {
        return scenarioSourceFailure("private-state-invalid");
      }
      if (!matchesPublicState(replayed.finalState, input.publicState) || canonicalPublicLedgerHash(replayed.finalState.ledger) !== canonicalPublicLedgerHash(input.finalLedger)) {
        return scenarioSourceFailure("private-state-invalid");
      }

      scenarios.push({
        scenarioIdentity: record.particleId,
        normalizedWeight: record.normalizedWeight,
        privateState: structuredClone(replayed.finalState),
      });
    }

    if (scenarios.length === 0 || Math.abs(weightTotal - 1) > 1e-9 || !Number.isFinite(accessResult.access.effectiveSampleSize) || accessResult.access.effectiveSampleSize < 0 || accessResult.access.effectiveSampleSize > scenarios.length + 1e-9) {
      return scenarioSourceFailure("private-state-invalid");
    }

    return deepFreeze({
      ok: true,
      scenarios,
      effectiveSampleSize: accessResult.access.effectiveSampleSize,
      acceptedScenarioCount: scenarios.length,
    });
  } catch {
    return scenarioSourceFailure("replay-context-missing");
  }
}

function hasReplayContextShape(input: unknown): input is RolloutScenarioSourceInput {
  if (!isRecord(input) || !Array.isArray(input.publicHistoryEvents) || input.publicHistoryEvents.length === 0 || !isRecord(input.initialLedger) || !isRecord(input.finalLedger) || !RANKS.includes(input.gameRank as GameRank) || !isSeat(input.perspectiveSeat) || !Array.isArray(input.ownCurrentHand) || !isRecord(input.publicState)) return false;
  if (!isPublicState(input.publicState) || input.publicState.gameRank !== input.gameRank || input.publicState.perspectiveSeat !== input.perspectiveSeat) return false;
  if (!input.ownCurrentHand.every(isCard)) return false;
  return input.publicHistoryEvents.every((event) => isRecord(event) && Number.isSafeInteger(event.eventIndex) && event.eventIndex >= 0);
}

function matchesSnapshotContext(input: RolloutScenarioSourceInput): boolean {
  const snapshot = input.bank.snapshot;
  if (snapshot.gameRank !== input.gameRank || snapshot.perspectiveSeat !== input.perspectiveSeat) return false;
  if (canonicalPublicLedgerHash(input.initialLedger) !== snapshot.initialLedgerHash) return false;
  if (canonicalPublicLedgerHash(input.finalLedger) !== snapshot.ledgerHash) return false;
  if (input.finalLedger.lastAppliedEventIndex !== snapshot.lastAppliedEventIndex) return false;
  if (input.initialLedger.lastAppliedEventIndex !== -1 || input.initialLedger.nextEventIndex !== 0) return false;
  if (input.publicHistoryEvents[0]?.eventIndex !== 0 || input.publicHistoryEvents.at(-1)?.eventIndex !== input.finalLedger.lastAppliedEventIndex) return false;
  return input.initialLedger.gameId === input.finalLedger.gameId
    && input.initialLedger.roundIdentity === input.finalLedger.roundIdentity
    && input.initialLedger.handIdentity === input.finalLedger.handIdentity;
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

function isParticleRecord(value: unknown): value is ParticleBankRolloutRecord {
  return isRecord(value) && typeof value.particleId === "string" && value.particleId.length > 0 && isRecord(value.scenario);
}

function isPublicState(value: unknown): value is RolloutPublicState {
  if (!isRecord(value) || !RANKS.includes(value.gameRank as GameRank) || !isSeat(value.actingSeat) || !isSeat(value.perspectiveSeat) || !isSeat(value.partnerSeat) || !isRecord(value.handCounts) || !Array.isArray(value.finishOrder) || !Array.isArray(value.publicPlayedCardIds)) return false;
  return [0, 1, 2, 3].every((seat) => isNonNegativeSafeInteger(value.handCounts[seat]))
    && value.finishOrder.every(isSeat)
    && value.publicPlayedCardIds.every((id) => typeof id === "string" && id.length > 0)
    && (value.currentLastPlay === null || typeof value.currentLastPlay === "object")
    && (value.currentLastPlaySeat === null || isSeat(value.currentLastPlaySeat));
}

function isCard(value: unknown): value is Card {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0;
}

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function scenarioSourceFailure(reason: "ledger-mismatch" | "replay-context-missing" | "private-state-invalid"): RolloutScenarioSourceResult {
  return { ok: false, failure: { kind: "scenario-source-failed", reason } };
}

function isSeat(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
