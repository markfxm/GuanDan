import type { ParticleBankFailureReason, ParticleBankStatus, PrivateParticleSummary } from "./contracts";

export type ParticleDiagnostics = PrivateParticleSummary;

export function createParticleDiagnostics(input: PrivateParticleSummary): ParticleDiagnostics {
  return deepFreeze({ ...input });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export type { ParticleBankFailureReason, ParticleBankStatus, PrivateParticleSummary };
