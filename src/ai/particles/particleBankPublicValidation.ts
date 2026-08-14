import { RANKS, type GameRank } from "../../engine/cards";
import type { ParticleBank, ParticleSnapshotIdentity } from "./contracts";

export type ParticleBankPublicValidationFailure = Readonly<{
  kind: "invalid-public-particle-bank";
}>;

export type ParticleBankPublicValidationResult =
  | Readonly<{ ok: true; bank: ParticleBank }>
  | Readonly<{ ok: false; failure: ParticleBankPublicValidationFailure }>;

const PARTICLE_BANK_KEYS = [
  "schemaVersion", "snapshot", "config", "particleCount", "effectiveSampleSize", "status", "summary",
] as const;
const SNAPSHOT_KEYS = [
  "gameId", "roundIdentity", "handIdentity", "initialLedgerHash", "lastAppliedEventIndex", "ledgerHash", "perspectiveSeat", "gameRank",
] as const;
const CONFIG_KEYS = [
  "schemaVersion", "particleCount", "maxSamplingAttempts", "maxIndexDraws", "samplerConfigVersion", "likelihoodConfigHash",
] as const;
const SUMMARY_KEYS = [
  "status", "requestedParticleCount", "acceptedParticleCount", "samplingAttempts", "duplicateCount", "zeroWeightCount", "effectiveSampleSize",
] as const;
const ESS_EQUALITY_TOLERANCE = 1e-9;

export function validateParticleBankPublic(input: unknown): ParticleBankPublicValidationResult {
  try {
    if (!isPlainDataGraph(input) || !isPlainDataRecord(input, PARTICLE_BANK_KEYS, true) || !isDeeplyFrozen(input)) return invalidPublicParticleBank();
    const bank = input as Record<string, unknown>;
    const particleCount = getOwnDataProperty(bank, "particleCount");
    const effectiveSampleSize = getOwnDataProperty(bank, "effectiveSampleSize");
    const status = getOwnDataProperty(bank, "status");
    const snapshot = getOwnDataProperty(bank, "snapshot");
    const config = getOwnDataProperty(bank, "config");
    const summary = getOwnDataProperty(bank, "summary");
    if (bank.schemaVersion !== "d2-particle-bank-v1"
      || !isPositiveSafeInteger(particleCount)
      || (status !== "ready" && status !== "degraded")
      || !isParticleSnapshotIdentity(snapshot)
      || !isParticleBankConfig(config, particleCount)
      || !isParticleBankSummary(summary, particleCount, config, status)) return invalidPublicParticleBank();

    const bankEss = effectiveSampleSize;
    const summaryEss = getOwnDataProperty(summary, "effectiveSampleSize");
    const acceptedParticleCount = getOwnDataProperty(summary, "acceptedParticleCount");
    if (!isStrictEffectiveSampleSize(bankEss, acceptedParticleCount)
      || !isStrictEffectiveSampleSize(summaryEss, acceptedParticleCount)
      || Math.abs(bankEss - summaryEss) > ESS_EQUALITY_TOLERANCE) return invalidPublicParticleBank();

    return { ok: true, bank: input as ParticleBank };
  } catch {
    return invalidPublicParticleBank();
  }
}

function invalidPublicParticleBank(): Readonly<{ ok: false; failure: ParticleBankPublicValidationFailure }> {
  return { ok: false, failure: { kind: "invalid-public-particle-bank" } };
}

function isParticleSnapshotIdentity(value: unknown): value is ParticleSnapshotIdentity {
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

function isParticleBankConfig(value: unknown, particleCount: number): value is Record<string, unknown> {
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

function isParticleBankSummary(value: unknown, particleCount: number, config: Record<string, unknown>, bankStatus: unknown): boolean {
  if (!isPlainDataRecord(value, SUMMARY_KEYS, true)) return false;
  const summary = value as Record<string, unknown>;
  const requestedParticleCount = getOwnDataProperty(summary, "requestedParticleCount");
  const acceptedParticleCount = getOwnDataProperty(summary, "acceptedParticleCount");
  const samplingAttempts = getOwnDataProperty(summary, "samplingAttempts");
  const duplicateCount = getOwnDataProperty(summary, "duplicateCount");
  const zeroWeightCount = getOwnDataProperty(summary, "zeroWeightCount");
  const requiredSamplingAttempts = isNonNegativeSafeInteger(acceptedParticleCount) && isNonNegativeSafeInteger(duplicateCount)
    ? safeSum([acceptedParticleCount, duplicateCount])
    : undefined;
  return (summary.status === "ready" || summary.status === "degraded")
    && summary.status === bankStatus
    && requestedParticleCount === particleCount
    && isPositiveSafeInteger(requestedParticleCount)
    && isPositiveSafeInteger(acceptedParticleCount)
    && acceptedParticleCount === requestedParticleCount
    && acceptedParticleCount === particleCount
    && isNonNegativeSafeInteger(samplingAttempts)
    && isNonNegativeSafeInteger(duplicateCount)
    && isNonNegativeSafeInteger(zeroWeightCount)
    && zeroWeightCount <= acceptedParticleCount
    && isPositiveSafeInteger(config.maxSamplingAttempts)
    && samplingAttempts <= config.maxSamplingAttempts
    && requiredSamplingAttempts !== undefined
    && samplingAttempts >= requiredSamplingAttempts;
}

function isStrictEffectiveSampleSize(value: unknown, particleCount: unknown): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && !Object.is(value, -0)
    && isPositiveSafeInteger(particleCount)
    && value >= 1
    && value <= particleCount;
}

function getOwnDataProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") throw new TypeError("DATA_PROPERTY_INVALID");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!isDataDescriptor(descriptor)) throw new TypeError("DATA_PROPERTY_INVALID");
  return descriptor.value;
}

function isDataDescriptor(descriptor: PropertyDescriptor | undefined): descriptor is PropertyDescriptor & { value: unknown } {
  return descriptor !== undefined
    && Object.prototype.hasOwnProperty.call(descriptor, "value")
    && descriptor.get === undefined
    && descriptor.set === undefined;
}

function isPlainDataRecord(value: unknown, allowedKeys?: readonly string[], exact = false): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(value);
    const allowed = allowedKeys === undefined ? undefined : new Set(allowedKeys);
    if (ownKeys.some((key) => typeof key !== "string" || (allowed !== undefined && !allowed.has(key)))) return false;
    if (exact && allowed !== undefined && (ownKeys.length !== allowed.size || (allowedKeys ?? []).some((key) => !ownKeys.includes(key)))) return false;
    return ownKeys.every((key) => isDataDescriptor(Object.getOwnPropertyDescriptor(value, key)));
  } catch {
    return false;
  }
}

function isPlainDataArray(value: unknown): value is readonly unknown[] {
  try {
    if (value === null || typeof value !== "object" || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
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

function isCanonicalSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isCanonicalSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return isCanonicalSafeInteger(value) && value >= 0;
}

function isSeat(value: unknown): value is 0 | 1 | 2 | 3 {
  return isCanonicalSafeInteger(value) && (value === 0 || value === 1 || value === 2 || value === 3);
}

function isLedgerEventIndex(value: unknown): value is number {
  return isCanonicalSafeInteger(value) && value >= -1;
}

function safeSum(values: readonly number[]): number | undefined {
  let sum = 0;
  for (const value of values) {
    if (!isNonNegativeSafeInteger(value) || sum > Number.MAX_SAFE_INTEGER - value) return undefined;
    sum += value;
  }
  return sum;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
