import { createDeck } from "../../src/engine/cards";
import { getDetectGroupsCallCount, resetDetectGroupsCallCount } from "../../src/engine/groups";
import { chooseAiAction } from "../helpers/legacyAiReference";
import { createLegacyBenchmarkRoom, getPublicRoom, runAiStep } from "../../src/game/room";
import { getCreateHandAnalysisCallCount, resetCreateHandAnalysisCallCount } from "../../src/game/protectedGroups";

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
}

function measureSamples(sample: () => void, count = 10): { median: number; p95: number } {
  const samples = Array.from({ length: count }, () => {
    const startedAt = performance.now();
    sample();
    return performance.now() - startedAt;
  });
  return { median: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

it("records a fresh rank-2 AI lead hot-path bound", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 1 });
  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  room.aiPlans = {};

  const startedAt = performance.now();
  runAiStep(room);
  const elapsedMs = performance.now() - startedAt;

  expect(room.playHistory).toHaveLength(1);
  expect(room.playHistory[0]?.action).toBe("play");
  expect(elapsedMs).toBeLessThan(5_000);
}, 20_000);

it("replans after the hand changes and preserves complete coverage", () => {
  const room = createLegacyBenchmarkRoom({ rank: "2", seed: 2 });
  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  room.aiPlans = {};

  runAiStep(room);
  const plan = room.aiPlans[1];
  expect(plan).toBeDefined();
  expect(["bomb", "straight-flush", "joker-bomb"]).not.toContain(room.playHistory[0]?.group?.type);

  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  const startedAt = performance.now();
  runAiStep(room);

  expect(room.aiPlans[1]).not.toBe(plan);
  expect(room.aiPlans[1]?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort())
    .toEqual(room.hands[1].map((card) => card.id).sort());
  expect(performance.now() - startedAt).toBeLessThan(30_000);
}, 20_000);

it("records a fixed-input legacy AI hot-path baseline", () => {
  const hand = createDeck().slice(0, 12);
  resetDetectGroupsCallCount();
  resetCreateHandAnalysisCallCount();

  const analysisTiming = measureSamples(() => {
    chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });
  });

  const planningTiming = measureSamples(() => {
    const room = createLegacyBenchmarkRoom({ rank: "2", seed: 17 });
    getPublicRoom(room, 0);
  }, 10);

  const decisionTiming = measureSamples(() => {
    chooseAiAction({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });
  });

  const baseline = {
    analysis: analysisTiming,
    planning: planningTiming,
    decision: decisionTiming,
    detectGroupsCalls: getDetectGroupsCallCount(),
    createHandAnalysisCalls: getCreateHandAnalysisCallCount(),
  };
  console.info("AI hot-path baseline", JSON.stringify(baseline));

  expect(baseline.analysis.median).toBeGreaterThanOrEqual(0);
  expect(baseline.analysis.p95).toBeGreaterThanOrEqual(baseline.analysis.median);
  expect(baseline.planning.p95).toBeGreaterThanOrEqual(baseline.planning.median);
  expect(baseline.decision.p95).toBeGreaterThanOrEqual(baseline.decision.median);
  expect(baseline.detectGroupsCalls).toBeGreaterThan(0);
  expect(baseline.createHandAnalysisCalls).toBeGreaterThan(0);
}, 30_000);

it("produces a deterministic fixed-seed AI replay prefix", () => {
  const replay = (seed: number) => {
    const room = createLegacyBenchmarkRoom({ rank: "2", seed });
    room.players[0].isAI = true;
    for (let step = 0; step < 16 && room.status === "playing"; step += 1) {
      runAiStep(room);
    }
    return room.playHistory.map((play) => `${play.seat}:${play.action}:${play.group?.id ?? ""}`);
  };

  const first = replay(41);
  const second = replay(41);
  console.info("AI replay baseline", JSON.stringify(first));

  expect(first).toHaveLength(16);
  expect(second).toEqual(first);
});
