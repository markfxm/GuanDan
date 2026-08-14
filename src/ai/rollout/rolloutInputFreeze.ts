import { createCrnView } from "./crn";
import {
  createCanonicalRandomDomainLabel,
  createCrnCoordinate,
  deriveRandomDomain,
} from "./identity";
import { canonicalReplicateIdentity } from "./contracts";
import type {
  CrnView,
  RolloutCandidate,
  RolloutContractResult,
  RolloutKernelFailure,
  RolloutRequest,
} from "./contracts";

type RolloutScheduleScenario = Readonly<{
  scenarioIdentity: string;
  normalizedWeight: number;
}>;

type RolloutScenarioSourceSuccess = Readonly<{
  ok: true;
  scenarios: readonly RolloutScheduleScenario[];
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
}>;

export type RolloutScheduleEntry = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScheduleScenario;
  sourceScenarioIndex: number;
  replicateOrdinal: number;
  replicateIdentity: string;
}>;

export function createCanonicalRolloutSchedule(
  request: RolloutRequest,
  source: RolloutScenarioSourceSuccess,
): RolloutContractResult<readonly RolloutScheduleEntry[]> {
  try {
    if (source.acceptedScenarioCount !== source.scenarios.length || source.scenarios.length === 0) return invalid("scenarioSourceInput");

    const scenarios = source.scenarios.map((scenario, sourceScenarioIndex) => ({ scenario, sourceScenarioIndex }));
    const seenScenarioIds = new Set<string>();
    for (const entry of scenarios) {
      if (!isScenario(entry.scenario) || seenScenarioIds.has(entry.scenario.scenarioIdentity)) return invalid("scenarioSourceInput");
      seenScenarioIds.add(entry.scenario.scenarioIdentity);
    }
    scenarios.sort((left, right) => compareCodeUnits(left.scenario.scenarioIdentity, right.scenario.scenarioIdentity));

    const candidates = [...request.candidates].sort((left, right) => compareCodeUnits(left.candidateId, right.candidateId));
    const scheduleSize = checkedProduct([candidates.length, scenarios.length, request.budget.replicateCountPerScenario]);
    if (scheduleSize === undefined) return invalid("budget");

    const schedule: RolloutScheduleEntry[] = [];
    for (const candidate of candidates) {
      for (const { scenario, sourceScenarioIndex } of scenarios) {
        for (let replicateOrdinal = 0; replicateOrdinal < request.budget.replicateCountPerScenario; replicateOrdinal += 1) {
          schedule.push(Object.freeze({
            candidate,
            scenario,
            sourceScenarioIndex,
            replicateOrdinal,
            replicateIdentity: canonicalReplicateIdentity(replicateOrdinal),
          }));
        }
      }
    }
    if (schedule.length !== scheduleSize) return invalid("candidates");
    return { ok: true, value: Object.freeze(schedule) };
  } catch {
    return invalid("scenarioSourceInput");
  }
}

export function createRolloutInputRandomView(
  rootIdentity: string,
  scenarioIdentity: string,
  replicateIdentity: string,
  actingSeat: 0 | 1 | 2 | 3,
): RolloutContractResult<CrnView> {
  try {
    const randomDomain = createCanonicalRandomDomainLabel("d2f-orchestrator-input-v1");
    if (!randomDomain.ok) return crnFailure("random-domain");
    const coordinate = createCrnCoordinate({
      rootIdentity,
      scenarioIdentity,
      replicateIdentity,
      ply: 0,
      actingSeat,
      randomDomain: randomDomain.value,
    });
    if (!coordinate.ok) return crnFailure("coordinate");
    const view = createCrnView({
      coordinate: coordinate.value,
      randomDomain: deriveRandomDomain(coordinate.value),
    });
    if (!view.ok) return crnFailure("view");
    return { ok: true, value: view.view };
  } catch {
    return crnFailure("view");
  }
}

function isScenario(value: unknown): value is RolloutScheduleScenario {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.scenarioIdentity === "string"
    && /^[a-f0-9]{64}$/.test(record.scenarioIdentity)
    && typeof record.normalizedWeight === "number"
    && Number.isFinite(record.normalizedWeight)
    && record.normalizedWeight >= 0
    && "privateState" in record;
}

function checkedProduct(values: readonly number[]): number | undefined {
  let product = 1;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) return undefined;
    if (value !== 0 && product > Number.MAX_SAFE_INTEGER / value) return undefined;
    product *= value;
  }
  return Number.isSafeInteger(product) ? product : undefined;
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode !== rightCode) return leftCode - rightCode;
  }
  return left.length - right.length;
}

function invalid(field: "budget" | "candidates" | "scenarioSourceInput"): RolloutContractResult<never> {
  return { ok: false, failure: { kind: "invalid-request", field } };
}

function crnFailure(reason: "coordinate" | "random-domain" | "view"): RolloutContractResult<never> {
  const failure: RolloutKernelFailure = { kind: "simulation-failed", stage: "crn", reason };
  return { ok: false, failure: { kind: "kernel-failed", failure } };
}
