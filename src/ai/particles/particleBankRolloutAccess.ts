import type { ParticleBank, ParticleScenario } from "./contracts";
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

export function readParticleBankRolloutAccess(bank: ParticleBank): ParticleBankRolloutAccessResult {
  if (!isRecord(bank)) return unknownBankFailure();

  let internals: ReturnType<typeof readParticleBankInternals>;
  try {
    internals = readParticleBankInternals(bank);
  } catch {
    return unknownBankFailure();
  }
  if (internals === undefined || !Array.isArray(internals.records)) {
    return unknownBankFailure();
  }

  if (!Number.isFinite(bank.effectiveSampleSize) || bank.effectiveSampleSize < 0) {
    return unknownBankFailure();
  }

  try {
    const records = internals.records.map((record) => {
      if (!isRecord(record) || typeof record.particleId !== "string" || record.particleId.length === 0 || !Number.isFinite(record.normalizedWeight) || record.normalizedWeight < 0 || !isRecord(record.scenario)) {
        throw new TypeError("PARTICLE_BANK_RECORD_INVALID");
      }
      return {
        particleId: record.particleId,
        scenario: structuredClone(record.scenario) as ParticleScenario,
        normalizedWeight: record.normalizedWeight,
      };
    });
    const access = deepFreeze({
      records,
      effectiveSampleSize: bank.effectiveSampleSize,
    });

    return { ok: true, access };
  } catch {
    return unknownBankFailure();
  }
}

function unknownBankFailure(): ParticleBankRolloutAccessResult {
  return { ok: false, failure: { kind: "fake-or-unknown-particle-bank" } };
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
