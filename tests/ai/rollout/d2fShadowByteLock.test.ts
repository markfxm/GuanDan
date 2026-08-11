import { buildPublicGameIdentity } from "../../../src/game/publicEvent";
import { createRoom, getD2FShadowEvidence, getPublicRoom, playCards, runAiStep, type RoomState } from "../../../src/game/room";
import type { D2FShadowEvidence } from "../../../src/ai/rollout/contracts";

const { observeD2FShadow } = vi.hoisted(() => ({
  observeD2FShadow: vi.fn<(...args: any[]) => D2FShadowEvidence>(),
}));

vi.mock("../../../src/ai/rollout/d2fShadowObserver", async () => {
  const actual = await vi.importActual<typeof import("../../../src/ai/rollout/d2fShadowObserver")>("../../../src/ai/rollout/d2fShadowObserver");
  return {
    ...actual,
    observeD2FShadow,
  };
});

function disagreementEvidence(): D2FShadowEvidence {
  return Object.freeze({
    schemaVersion: "d2f-shadow-v3",
    status: "success",
    decisionIdentity: "d".repeat(64),
    formalCandidateId: "f".repeat(64),
    shadowTopCandidateId: "s".repeat(64),
    agreement: false,
    ranking: ["s".repeat(64), "f".repeat(64)],
    aggregateDiagnostics: Object.freeze({
      effectiveSampleSize: 1,
      acceptedScenarioCount: 1,
      replicateCountPerScenario: 1,
      completedReplicateCount: 1,
      expectedCompletedReplicateCount: 1,
      candidateCount: 2,
      workUnitCount: 1,
      coverage: "complete",
    }),
    policyId: "d2f-lightweight-v1",
    baselineActionIdentity: "f".repeat(64),
    d2fRecommendedActionIdentity: "s".repeat(64),
    riskAdjustedUtilityDelta: 0,
    expectedUtilityDelta: 0,
    baselineEvaluatorScore: 0,
    effectiveSampleSize: 1,
    acceptedScenarioCount: 1,
    replicateCountPerScenario: 1,
    completedReplicateCount: 1,
    workUnitCount: 1,
    fallbackReason: "none",
    semanticBudgetUsage: Object.freeze({
      replicateCountPerScenario: 1,
      maxPliesPerReplicate: 1,
      maxPolicyActionEvaluationsPerPly: 256,
      workUnitCount: 1,
    }),
    elapsedWallClockMs: 0,
  });
}

function preparedRoom(mode: "disabled" | "enabled"): RoomState {
  const identity = buildPublicGameIdentity("d2f-task8-byte-lock", 0, 0, "benchmark-scenario");
  const room = createRoom({ rank: "10", seed: 1, publicIdentity: identity, d2fShadowMode: mode });
  const openingLeader = room.trick.leadSeat;
  playCards(room, openingLeader, [room.hands[openingLeader][0]!.id]);
  return room;
}

beforeEach(() => {
  observeD2FShadow.mockReset();
  observeD2FShadow.mockReturnValue(disagreementEvidence());
});

it("keeps formal action and public state byte-identical when Shadow disagrees", () => {
  const disabled = preparedRoom("disabled");
  const enabled = preparedRoom("enabled");

  runAiStep(disabled);
  runAiStep(enabled);

  expect(enabled.d2fShadowEvidence?.status).toBe("success");
  expect(enabled.d2fShadowEvidence?.agreement).toBe(false);
  expect(observeD2FShadow).toHaveBeenCalledTimes(1);
  expect(disabled.playHistory.at(-1)).toEqual(enabled.playHistory.at(-1));
  expect(disabled.hands).toEqual(enabled.hands);
  expect(disabled.finishOrder).toEqual(enabled.finishOrder);
  expect(disabled.trick).toEqual(enabled.trick);
  expect(disabled.publicLedger).toEqual(enabled.publicLedger);
  expect(disabled.publicEvents).toEqual(enabled.publicEvents);
  expect(getPublicRoom(disabled, 0, { ensurePlans: false })).not.toHaveProperty("d2fShadowEvidence");
  expect(getPublicRoom(enabled, 0, { ensurePlans: false })).not.toHaveProperty("d2fShadowEvidence");
  expect(getPublicRoom(enabled, 0, { ensurePlans: false })).not.toHaveProperty("d2fShadowMode");
});

it("keeps disabled as a zero-call baseline", () => {
  const room = preparedRoom("disabled");

  runAiStep(room);

  expect(observeD2FShadow).not.toHaveBeenCalled();
  expect(room.d2fShadowEvidence).toBeNull();
});

it("restores the Room guard and prevents re-entrant Shadow recursion", () => {
  const room = preparedRoom("enabled");
  observeD2FShadow.mockImplementationOnce(() => {
    runAiStep(room);
    return disagreementEvidence();
  });

  runAiStep(room);

  expect(observeD2FShadow).toHaveBeenCalledTimes(1);
  expect(room.d2fShadowRunning).toBe(false);
  expect(room.d2fShadowEvidence?.status).toBe("success");
});

it("replaces evidence once per later eligible decision and isolates the getter result", () => {
  const room = preparedRoom("enabled");

  runAiStep(room);
  const first = getD2FShadowEvidence(room);
  expect(first).not.toBeNull();
  if (first === null) return;
  (first as any).agreement = true;
  expect(room.d2fShadowEvidence?.agreement).toBe(false);

  runAiStep(room);

  expect(observeD2FShadow).toHaveBeenCalledTimes(2);
  expect(room.d2fShadowEvidence).not.toBe(first);
  expect(room.d2fShadowRunning).toBe(false);
});

it("swallows an observer throw and preserves the formal action", () => {
  const disabled = preparedRoom("disabled");
  const enabled = preparedRoom("enabled");
  observeD2FShadow.mockImplementationOnce(() => {
    throw new Error("shadow failed");
  });

  runAiStep(disabled);
  runAiStep(enabled);

  expect(enabled.d2fShadowEvidence).toMatchObject({ status: "failure", fallbackReason: "unexpected-failure" });
  expect(enabled.playHistory.at(-1)).toEqual(disabled.playHistory.at(-1));
  expect(enabled.hands).toEqual(disabled.hands);
  expect(enabled.publicLedger).toEqual(disabled.publicLedger);
  expect(enabled.d2fShadowRunning).toBe(false);
});
