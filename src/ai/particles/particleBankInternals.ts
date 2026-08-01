import type { ParticleBank, ParticleScenario, PrivateParticleSummary } from "./contracts";

export type ParticleRecord = Readonly<{
  particleId: string;
  scenario: ParticleScenario;
  normalizedWeight: number;
}>;

export type ParticleBankInternals = Readonly<{
  records: readonly ParticleRecord[];
}>;

const registry = new WeakMap<object, ParticleBankInternals>();

export function createParticleBankHandle(
  view: Omit<ParticleBank, "summary"> & Readonly<{ summary: PrivateParticleSummary }>,
  internals: ParticleBankInternals,
): ParticleBank {
  const bank = deepFreeze(structuredClone(view)) as ParticleBank;
  const privateInternals = deepFreeze(structuredClone(internals));
  registry.set(bank, privateInternals);
  return bank;
}

export function readParticleBankInternals(bank: ParticleBank): ParticleBankInternals | undefined {
  return registry.get(bank as object);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
