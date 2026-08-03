import { RANKS, SUITS, type Card, type GameRank } from "../../engine/cards";
import type { ParticleBank, ParticleScenario, ParticleSnapshotIdentity, CanonicalInitialDeal, HiddenTransferAssignment } from "./contracts";
import { particleScenarioIdentity } from "./canonicalDeal";
import { validateCanonicalInitialDeal } from "./particleConservation";
import { readParticleBankInternals } from "./particleBankInternals";

export type ParticleBankRolloutAccessFailure = Readonly<{
  kind: "fake-or-unknown-particle-bank";
}>;

export type ParticleBankRolloutRecord = Readonly<{
  particleId: string;
  scenario: ParticleScenario;
  normalizedWeight: number;
}>;

export type ParticleBankRolloutAccess = Readonly<{
  records: readonly ParticleBankRolloutRecord[];
  effectiveSampleSize: number;
}>;

export type ParticleBankRolloutAccessResult =
  | Readonly<{ ok: true; access: ParticleBankRolloutAccess }>
  | Readonly<{ ok: false; failure: ParticleBankRolloutAccessFailure }>;

const BANK_KEYS = ["schemaVersion", "snapshot", "config", "particleCount", "effectiveSampleSize", "status", "summary"] as const;
const SNAPSHOT_KEYS = ["gameId", "roundIdentity", "handIdentity", "initialLedgerHash", "lastAppliedEventIndex", "ledgerHash", "perspectiveSeat", "gameRank"] as const;
const CONFIG_KEYS = ["schemaVersion", "particleCount", "maxSamplingAttempts", "maxIndexDraws", "samplerConfigVersion", "likelihoodConfigHash"] as const;
const SUMMARY_KEYS = ["status", "requestedParticleCount", "acceptedParticleCount", "samplingAttempts", "duplicateCount", "zeroWeightCount", "effectiveSampleSize", "failureReason"] as const;
const SCENARIO_KEYS = ["schemaVersion", "initialDeal", "hiddenTransferAssignments"] as const;
const DEAL_KEYS = ["schemaVersion", "hands"] as const;
const SUITED_CARD_KEYS = ["id", "kind", "rank", "suit", "copy"] as const;
const JOKER_CARD_KEYS = ["id", "kind", "rank", "copy"] as const;
const ASSIGNMENT_KEYS = ["eventIndex", "eventKind", "fromSeat", "toSeat", "cardId"] as const;
const INTERNAL_KEYS = ["records"] as const;
const NUMERIC_TOLERANCE = 1e-9;
const SUIT_CODES: Readonly<Record<(typeof SUITS)[number], string>> = {
  spades: "S",
  clubs: "C",
  hearts: "H",
  diamonds: "D",
};

export function readParticleBankRolloutAccess(bank: ParticleBank): ParticleBankRolloutAccessResult {
  try {
    // The public handle is the only opaque exception. Validate only its frozen
    // public projection; never inspect the private WeakMap registry here.
    if (!isValidPublicBank(bank)) return unknownBankFailure();
    const validatedBank = bank as ParticleBank;

    const internals = readParticleBankInternals(validatedBank);
    if (!isPlainDataGraph(internals) || !isPlainDataRecord(internals, INTERNAL_KEYS, true)) return unknownBankFailure();
    const recordsInput = getOwnDataProperty(internals, "records");
    if (!isPlainDataArray(recordsInput) || recordsInput.length === 0) return unknownBankFailure();

    const records: ParticleBankRolloutRecord[] = [];
    const particleIds = new Set<string>();
    let weightTotal = 0;
    let squaredWeightTotal = 0;
    let zeroWeightCount = 0;
    for (let index = 0; index < recordsInput.length; index += 1) {
      const record = getOwnDataProperty(recordsInput, String(index));
      if (!isPlainDataGraph(record) || !isPlainDataRecord(record, ["particleId", "scenario", "normalizedWeight"], true)) return unknownBankFailure();
      const particleId = getOwnDataProperty(record, "particleId");
      const scenario = getOwnDataProperty(record, "scenario");
      const normalizedWeight = getOwnDataProperty(record, "normalizedWeight");
      if (typeof particleId !== "string" || particleId.length === 0 || particleIds.has(particleId) || typeof normalizedWeight !== "number" || !Number.isFinite(normalizedWeight) || normalizedWeight < 0 || !isValidParticleScenario(scenario)) return unknownBankFailure();
      if (particleId !== particleScenarioIdentity(validatedBank.snapshot, scenario)) return unknownBankFailure();
      particleIds.add(particleId);
      weightTotal += normalizedWeight;
      squaredWeightTotal += normalizedWeight ** 2;
      if (normalizedWeight === 0) zeroWeightCount += 1;
      if (!Number.isFinite(weightTotal)) return unknownBankFailure();
      records.push({
        particleId,
        scenario: cloneParticleScenario(scenario),
        normalizedWeight,
      });
    }

    const summary = validatedBank.summary;
    const internalEffectiveSampleSize = squaredWeightTotal > 0 ? 1 / squaredWeightTotal : Number.NaN;
    if (records.length !== summary.acceptedParticleCount
      || records.length > validatedBank.particleCount
      || Math.abs(weightTotal - 1) > NUMERIC_TOLERANCE
      || !Number.isFinite(internalEffectiveSampleSize)
      || internalEffectiveSampleSize < 1 - NUMERIC_TOLERANCE
      || internalEffectiveSampleSize > records.length + NUMERIC_TOLERANCE
      || Math.abs(internalEffectiveSampleSize - validatedBank.effectiveSampleSize) > NUMERIC_TOLERANCE
      || summary.effectiveSampleSize === undefined
      || Math.abs(internalEffectiveSampleSize - summary.effectiveSampleSize) > NUMERIC_TOLERANCE
      || zeroWeightCount !== summary.zeroWeightCount
      || summary.samplingAttempts < summary.acceptedParticleCount + summary.duplicateCount) return unknownBankFailure();
    return {
      ok: true,
      access: deepFreeze({ records, effectiveSampleSize: validatedBank.effectiveSampleSize }),
    };
  } catch {
    return unknownBankFailure();
  }
}

function unknownBankFailure(): ParticleBankRolloutAccessResult {
  return { ok: false, failure: { kind: "fake-or-unknown-particle-bank" } };
}

function isValidPublicBank(value: unknown): value is ParticleBank {
  if (!isPlainDataGraph(value) || !isPlainDataRecord(value, BANK_KEYS, true) || !isDeeplyFrozen(value)) return false;
  const bank = value as Record<string, unknown>;
  const effectiveSampleSize = bank.effectiveSampleSize;
  if (bank.schemaVersion !== "d2-particle-bank-v1" || !isPositiveSafeInteger(bank.particleCount) || typeof effectiveSampleSize !== "number" || !Number.isFinite(effectiveSampleSize) || effectiveSampleSize < 0 || (bank.status !== "ready" && bank.status !== "degraded")) return false;
  if (!isValidSnapshot(bank.snapshot) || !isValidConfig(bank.config, bank.particleCount) || !isValidSummary(bank.summary, bank.particleCount)) return false;
  const summary = bank.summary as ParticleBank["summary"];
  if (summary.status === "failed"
    || summary.status !== bank.status
    || summary.effectiveSampleSize === undefined
    || typeof summary.effectiveSampleSize !== "number"
    || Object.prototype.hasOwnProperty.call(summary, "failureReason")) return false;
  return true;
}

function isValidSnapshot(value: unknown): value is ParticleSnapshotIdentity {
  if (!isPlainDataRecord(value, SNAPSHOT_KEYS, true)) return false;
  const snapshot = value as Record<string, unknown>;
  return isNonEmptyString(snapshot.gameId)
    && isNonEmptyString(snapshot.roundIdentity)
    && isNonEmptyString(snapshot.handIdentity)
    && isDigest(snapshot.initialLedgerHash)
    && isLedgerEventIndex(snapshot.lastAppliedEventIndex)
    && isDigest(snapshot.ledgerHash)
    && isSeat(snapshot.perspectiveSeat)
    && RANKS.includes(snapshot.gameRank as GameRank);
}

function isValidConfig(value: unknown, particleCount: number): boolean {
  if (!isPlainDataRecord(value, CONFIG_KEYS, true)) return false;
  const config = value as Record<string, unknown>;
  return config.schemaVersion === "d2-particle-bank-config-identity-v1"
    && config.particleCount === particleCount
    && isPositiveSafeInteger(config.particleCount)
    && isPositiveSafeInteger(config.maxSamplingAttempts)
    && isPositiveSafeInteger(config.maxIndexDraws)
    && isNonEmptyString(config.samplerConfigVersion)
    && isDigest(config.likelihoodConfigHash);
}

function isValidSummary(value: unknown, particleCount: number): boolean {
  if (!isPlainDataRecord(value, SUMMARY_KEYS, false)) return false;
  const summary = value as Record<string, unknown>;
  if ((summary.status !== "ready" && summary.status !== "degraded" && summary.status !== "failed")
    || summary.requestedParticleCount !== particleCount
    || !isNonNegativeSafeInteger(summary.acceptedParticleCount)
    || summary.acceptedParticleCount > particleCount
    || !isNonNegativeSafeInteger(summary.samplingAttempts)
    || !isNonNegativeSafeInteger(summary.duplicateCount)
    || !isNonNegativeSafeInteger(summary.zeroWeightCount)) return false;
  if (Object.prototype.hasOwnProperty.call(summary, "effectiveSampleSize")
    && (typeof summary.effectiveSampleSize !== "number" || !Number.isFinite(summary.effectiveSampleSize) || summary.effectiveSampleSize < 0)) return false;
  return !Object.prototype.hasOwnProperty.call(summary, "failureReason") || typeof summary.failureReason === "string";
}

function isValidParticleScenario(value: unknown): value is ParticleScenario {
  if (!isPlainDataGraph(value) || !isPlainDataRecord(value, SCENARIO_KEYS, true)) return false;
  const scenario = value as Record<string, unknown>;
  if (scenario.schemaVersion !== "d2-particle-scenario-v1" || !isValidInitialDeal(scenario.initialDeal) || !isPlainDataArray(scenario.hiddenTransferAssignments)) return false;
  for (let index = 0; index < scenario.hiddenTransferAssignments.length; index += 1) {
    const assignment = getOwnDataProperty(scenario.hiddenTransferAssignments, String(index));
    if (!isValidAssignment(assignment)) return false;
  }
  try {
    validateCanonicalInitialDeal(scenario.initialDeal as CanonicalInitialDeal);
  } catch {
    return false;
  }
  return true;
}

function isValidInitialDeal(value: unknown): value is CanonicalInitialDeal {
  if (!isPlainDataRecord(value, DEAL_KEYS, true)) return false;
  const deal = value as Record<string, unknown>;
  if (getOwnDataProperty(deal, "schemaVersion") !== "d2-particle-initial-deal-v1") return false;
  const hands = getOwnDataProperty(deal, "hands");
  if (!isPlainDataRecord(hands, ["0", "1", "2", "3"], true)) return false;
  return ["0", "1", "2", "3"].every((seat) => {
    const hand = getOwnDataProperty(hands, seat);
    if (!isPlainDataArray(hand)) return false;
    for (let index = 0; index < hand.length; index += 1) {
      if (!isValidCard(getOwnDataProperty(hand, String(index)))) return false;
    }
    return true;
  });
}

function isValidCard(value: unknown): value is Card {
  if (!isPlainDataRecord(value)) return false;
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!isDataDescriptor(kindDescriptor)) return false;
  if (kindDescriptor.value === "suited") {
    if (!isPlainDataRecord(value, SUITED_CARD_KEYS, true)) return false;
    const card = value as Record<string, unknown>;
    return isNonEmptyString(card.id)
      && RANKS.includes(card.rank as (typeof RANKS)[number])
      && SUITS.includes(card.suit as (typeof SUITS)[number])
      && isCardCopy(card.copy)
      && card.id === `${SUIT_CODES[card.suit as (typeof SUITS)[number]]}${card.rank}-${card.copy}`;
  }
  if (kindDescriptor.value === "joker") {
    if (!isPlainDataRecord(value, JOKER_CARD_KEYS, true)) return false;
    const card = value as Record<string, unknown>;
    return isNonEmptyString(card.id)
      && (card.rank === "SJ" || card.rank === "BJ")
      && isCardCopy(card.copy)
      && card.id === `Joker-${card.rank}-${card.copy}`;
  }
  return false;
}

function isCardCopy(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

function isValidAssignment(value: unknown): value is HiddenTransferAssignment {
  if (!isPlainDataRecord(value, ASSIGNMENT_KEYS, true)) return false;
  const assignment = value as Record<string, unknown>;
  return isNonNegativeSafeInteger(assignment.eventIndex)
    && (assignment.eventKind === "tribute" || assignment.eventKind === "return")
    && isSeat(assignment.fromSeat)
    && isSeat(assignment.toSeat)
    && isNonEmptyString(assignment.cardId);
}

function cloneParticleScenario(scenario: ParticleScenario): ParticleScenario {
  const cloneCard = (card: Card): Card => card.kind === "suited"
    ? { id: card.id, kind: card.kind, rank: card.rank, suit: card.suit, copy: card.copy }
    : { id: card.id, kind: card.kind, rank: card.rank, copy: card.copy };
  const cloneHand = (hand: readonly Card[]): readonly Card[] => hand.map(cloneCard);
  const hands = scenario.initialDeal.hands;
  return deepFreeze({
    schemaVersion: scenario.schemaVersion,
    initialDeal: {
      schemaVersion: scenario.initialDeal.schemaVersion,
      hands: {
        0: cloneHand(hands[0]),
        1: cloneHand(hands[1]),
        2: cloneHand(hands[2]),
        3: cloneHand(hands[3]),
      },
    },
    hiddenTransferAssignments: scenario.hiddenTransferAssignments.map((assignment) => ({
      eventIndex: assignment.eventIndex,
      eventKind: assignment.eventKind,
      fromSeat: assignment.fromSeat,
      toSeat: assignment.toSeat,
      cardId: assignment.cardId,
    })),
  });
}

function getOwnDataProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") throw new TypeError("DATA_PROPERTY_INVALID");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!isDataDescriptor(descriptor)) throw new TypeError("DATA_PROPERTY_INVALID");
  return descriptor.value;
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.get === undefined && descriptor.set === undefined;
}

function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    const allowed = allowedKeys === undefined ? undefined : new Set(allowedKeys);
    if (ownKeys.some((key) => typeof key !== "string" || (allowed !== undefined && !allowed.has(key)))) return false;
    if (exact && allowed !== undefined && (ownKeys.length !== allowed.size || allowedKeys !== undefined && allowedKeys.some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Array.prototype || !Array.isArray(value)) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!isDataDescriptor(lengthDescriptor) || !isNonNegativeSafeInteger(lengthDescriptor.value)) return false;
    const length = lengthDescriptor.value;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) return false;
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      if (!ownKeys.includes(key) || !isDataDescriptor(Object.getOwnPropertyDescriptor(value, key))) return false;
    }
    return ownKeys.every((key) => key === "length" || (typeof key === "string" && /^0$|^[1-9]\d*$/.test(key) && Number(key) < length));
  } catch {
    return false;
  }
}

function isPlainDataGraph(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "undefined" || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
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

function isDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "undefined" || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (typeof value !== "object" || seen.has(value) || !Object.isFrozen(value)) return typeof value === "object" && value !== null && seen.has(value);
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isDataDescriptor(descriptor) || !isDeeplyFrozen(descriptor.value, seen)) return false;
  }
  return true;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (isDataDescriptor(descriptor)) deepFreeze(descriptor.value, seen);
  }
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSeat(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isLedgerEventIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= -1;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
