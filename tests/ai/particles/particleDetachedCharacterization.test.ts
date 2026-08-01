import { describe, expect, test } from "vitest";
import { buildPublicGameIdentity } from "../../../src/game/publicEvent";
import { canonicalPublicLedgerHash } from "../../../src/game/publicLedger";
import { createRoom, getPublicRoom, runAiStep, type RoomState } from "../../../src/game/room";
import { createAiPlanningDiagnostics, type AiPlanningDiagnostics } from "../../../src/ai/diagnostics/aiPlanningDiagnostics";

const particleBankBuilderPath = "../../../src/ai/particles/particleBankBuilder";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

// These fields are runtime timing telemetry populated from performance.now().
// They are intentionally outside the D2e semantic diagnostics baseline; every
// other diagnostics field remains part of the byte-for-byte comparison.
const nonSemanticRuntimeTelemetryKeys = [
  "timingMs",
  "detectGroupsTimingMs",
  "planCandidateValidationTimingMs",
] as const;

function stableDiagnostics(diagnostics: AiPlanningDiagnostics): unknown {
  const clone = structuredClone(diagnostics) as Record<string, unknown>;
  for (const key of nonSemanticRuntimeTelemetryKeys) delete clone[key];
  return clone;
}

function assertOnlyRuntimeTelemetryIsExcluded(diagnostics: AiPlanningDiagnostics): void {
  const rawKeys = Object.keys(diagnostics).sort();
  const expectedSemanticKeys = rawKeys.filter((key) => !nonSemanticRuntimeTelemetryKeys.includes(key as typeof nonSemanticRuntimeTelemetryKeys[number]));
  const actualSemanticKeys = Object.keys(stableDiagnostics(diagnostics) as Record<string, unknown>).sort();
  expect(actualSemanticKeys).toEqual(expectedSemanticKeys);
  for (const key of nonSemanticRuntimeTelemetryKeys) {
    expect(Object.prototype.hasOwnProperty.call(diagnostics, key)).toBe(true);
  }
}

function makeFixtureRoom(): RoomState {
  const publicIdentity = buildPublicGameIdentity("d2e-task5-room", 0, 0, "benchmark-scenario");
  return createRoom({ rank: "10", seed: 2, publicIdentity });
}

type CharacterizationRun = Readonly<{
  room: RoomState;
  publicRoom: ReturnType<typeof getPublicRoom>;
  diagnostics: AiPlanningDiagnostics;
  action: unknown;
  runtime: unknown;
  candidateCount: number;
  candidateOrder: unknown;
  score: unknown;
  publicEvents: unknown;
  ledgerHash: string | undefined;
  trick: unknown;
  finish: unknown;
  identity: unknown;
}>;

async function runDetachedComparison(room: RoomState, observeParticleCore: boolean): Promise<CharacterizationRun> {
  if (observeParticleCore) {
    const module = await import(/* @vite-ignore */ particleBankBuilderPath);
    expect(typeof module.buildParticleBank).toBe("function");
  }
  const diagnostics = createAiPlanningDiagnostics();
  const aiSeat = room.currentTurn;
  runAiStep(room, diagnostics);
  const runtime = room.aiRuntime[aiSeat];
  const plan = room.aiPlans[aiSeat];
  const play = room.playHistory.at(-1);
  return {
    room,
    publicRoom: getPublicRoom(room, 0, { ensurePlans: false }),
    diagnostics,
    action: play,
    runtime,
    candidateCount: runtime?.candidatePlans.length ?? 0,
    candidateOrder: runtime?.candidatePlans.map((candidate) => ({ id: candidate.id, groups: candidate.groups })),
    score: plan?.score,
    publicEvents: room.publicEvents ?? [],
    ledgerHash: room.publicLedger === undefined ? undefined : canonicalPublicLedgerHash(room.publicLedger),
    trick: room.trick,
    finish: room.finishOrder,
    identity: room.publicIdentity,
  };
}

describe("particle bank detached characterization", () => {
  test("keeps the decision engine unchanged when ParticleBank Core is observed beside it", async () => {
    const canonicalRoom = makeFixtureRoom();
    const disabledRoom = structuredClone(canonicalRoom) as RoomState;
    const shadowRoom = structuredClone(canonicalRoom) as RoomState;
    await runDetachedComparison(
      structuredClone(canonicalRoom) as RoomState,
      false,
    );
    const disabled = await runDetachedComparison(disabledRoom, false);
    const shadow = await runDetachedComparison(shadowRoom, true);

    expect(canonicalJson(shadow.action)).toBe(canonicalJson(disabled.action));
    expect(canonicalJson(shadow.runtime)).toBe(canonicalJson(disabled.runtime));
    expect(shadow.candidateCount).toBe(disabled.candidateCount);
    expect(canonicalJson(shadow.candidateOrder)).toBe(canonicalJson(disabled.candidateOrder));
    expect(canonicalJson(shadow.score)).toBe(canonicalJson(disabled.score));
    expect(canonicalJson(shadow.room)).toBe(canonicalJson(disabled.room));
    expect(canonicalJson(shadow.publicRoom)).toBe(canonicalJson(disabled.publicRoom));
    expect(canonicalJson(shadow.publicEvents)).toBe(canonicalJson(disabled.publicEvents));
    expect(shadow.ledgerHash).toBe(disabled.ledgerHash);
    expect(canonicalJson(shadow.trick)).toBe(canonicalJson(disabled.trick));
    expect(canonicalJson(shadow.finish)).toBe(canonicalJson(disabled.finish));
    expect(canonicalJson(shadow.identity)).toBe(canonicalJson(disabled.identity));
    assertOnlyRuntimeTelemetryIsExcluded(disabled.diagnostics);
    assertOnlyRuntimeTelemetryIsExcluded(shadow.diagnostics);
    expect(canonicalJson(stableDiagnostics(shadow.diagnostics))).toBe(canonicalJson(stableDiagnostics(disabled.diagnostics)));
    expect(Object.prototype.hasOwnProperty.call(shadow.room, "particleBank")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(shadow.publicRoom, "particleBank")).toBe(false);
  }, 30000);
});
