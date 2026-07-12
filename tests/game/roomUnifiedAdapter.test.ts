import { vi } from "vitest";
import { createDeck } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";

const decideAiAction = vi.fn();
vi.mock("../../src/ai/aiDecisionEngine", () => ({ decideAiAction }));

function snapshot(room: any) {
  return structuredClone({ hands: room.hands, currentTurn: room.currentTurn, leaderSeat: room.leaderSeat, trick: room.trick, currentTrickIndex: room.currentTrickIndex, finishOrder: room.finishOrder, aiPlans: room.aiPlans, aiRuntime: room.aiRuntime, actionLog: room.actionLog, playHistory: room.playHistory, status: room.status });
}

it("keeps the unified observation unchanged when hidden opponent cards change", async () => {
  const { createRoom, runAiStep } = await import("../../src/game/room");
  const first = createRoom({ rank: "10", seed: 12 });
  const second = createRoom({ rank: "10", seed: 12 });
  for (const room of [first, second]) { room.currentTurn = 1; room.trick = { leadSeat: 1, passSeats: [], plays: [] }; }
  [second.hands[0], second.hands[2]] = [second.hands[2], second.hands[0]];
  const seen: any[] = [];
  decideAiAction.mockImplementation((observation: any) => {
    seen.push(observation);
    const group = classifyPlay([observation.hand[0]], observation.gameRank)!;
    const runtime = { activePlanId: "plan", candidatePlans: [{ id: "plan", groups: [group], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 0, fallbackScore: 0 } }], generatedTurn: 0, configVersion: "test", needsReplan: false };
    return { action: { type: "play", group }, runtime, selectedPlan: runtime.candidatePlans[0], selectedPlanId: "plan", score: { total: 0, components: {} }, candidateCount: 1, consideredActions: 1, elapsedMs: 0, reasonCodes: [] };
  });
  runAiStep(first); runAiStep(second);
  expect(seen).toHaveLength(2);
  expect(seen[0]).toEqual(seen[1]);
  expect(seen[0].hand).not.toBe(first.hands[1]);
  const roomHandLength = first.hands[1].length; seen[0].hand.pop();
  expect(first.hands[1]).toHaveLength(roomHandLength);
  for (const key of ["partnerHand", "opponentsHands", "hands", "initialHands", "replayHands", "deck"]) expect(seen[0]).not.toHaveProperty(key);
});

it("commits unified runtime only after a successful room action", async () => {
  decideAiAction.mockClear();
  const { createRoom, runAiStep } = await import("../../src/game/room");
  const room = createRoom({ rank: "10", seed: 7 });
  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  const group = (await import("../../src/game/playRules")).classifyPlay([room.hands[1][0]!], room.rank)!;
  const runtime = { handKey: "before", activePlanId: "plan", candidatePlans: [{ id: "plan", groups: [group], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 0, fallbackScore: 0 } }], generatedTurn: 0, configVersion: "test", needsReplan: false };
  decideAiAction.mockReturnValue({ action: { type: "play", group }, runtime, selectedPlan: runtime.candidatePlans[0], selectedPlanId: "plan", score: { total: 0, components: {} }, candidateCount: 1, consideredActions: 1, elapsedMs: 0, reasonCodes: [] });

  runAiStep(room);

  expect(decideAiAction).toHaveBeenCalledTimes(1);
  const [observation] = decideAiAction.mock.calls[0]!;
  expect(observation).toEqual(expect.objectContaining({ hand: room.playHistory[0] ? expect.any(Array) : expect.any(Array), gameRank: room.rank, seat: 1, partnerSeat: 3 }));
  expect(observation).not.toHaveProperty("partnerHand");
  expect(observation).not.toHaveProperty("hands");
  expect(room.aiRuntime[1]?.needsReplan).toBe(true);
  expect(room.aiPlans[1]).toBeUndefined();
  expect(room.playHistory).toHaveLength(1);
});

it("does not commit room state when the selected unified plan is missing", async () => {
  const { createRoom, runAiStep } = await import("../../src/game/room");
  const room = createRoom({ rank: "10", seed: 9 }); room.currentTurn = 1; room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  const group = (await import("../../src/game/playRules")).classifyPlay([room.hands[1][0]!], room.rank)!;
  const before = snapshot(room);
  decideAiAction.mockReturnValue({ action: { type: "play", group }, runtime: { activePlanId: "missing", candidatePlans: [], generatedTurn: 0, configVersion: "test", needsReplan: false }, selectedPlanId: "missing", score: { total: 0, components: {} }, candidateCount: 1, consideredActions: 1, elapsedMs: 0, reasonCodes: [] });
  expect(() => runAiStep(room)).toThrow("AI_ENGINE_MISSING_SELECTED_PLAN");
  expect(snapshot(room)).toEqual(before);
});

it("rejects duplicate and foreign unified card ids without committing runtime", async () => {
  const { createRoom, runAiStep } = await import("../../src/game/room");
  const { classifyPlay } = await import("../../src/game/playRules");
  for (const cards of [[roomCard("S3-1"), roomCard("S3-1")], [roomCard("S3-1")]]) {
    const room = createRoom({ rank: "10", seed: 10 }); room.currentTurn = 1; room.trick = { leadSeat: 1, passSeats: [], plays: [] };
    const group = { ...classifyPlay([room.hands[1][0]!], room.rank)!, cards };
    const runtime = { activePlanId: "plan", candidatePlans: [{ id: "plan", groups: [group], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 0, fallbackScore: 0 } }], generatedTurn: 0, configVersion: "test", needsReplan: false };
    const before = snapshot(room);
    decideAiAction.mockReturnValue({ action: { type: "play", group }, runtime, selectedPlan: runtime.candidatePlans[0], selectedPlanId: "plan", score: { total: 0, components: {} }, candidateCount: 1, consideredActions: 1, elapsedMs: 0, reasonCodes: [] });
    expect(() => runAiStep(room)).toThrow();
    expect(snapshot(room)).toEqual(before);
  }
});

function roomCard(id: string) { return { id, kind: "suited" as const, rank: "3" as const, suit: "spades" as const, copy: 1 as const }; }

it("does not commit runtime when unified returns a lead pass", async () => {
  const { createRoom, runAiStep } = await import("../../src/game/room");
  const room = createRoom({ rank: "10", seed: 8 });
  room.currentTurn = 1;
  room.trick = { leadSeat: 1, passSeats: [], plays: [] };
  const before = structuredClone({ hands: room.hands, trick: room.trick, history: room.playHistory, runtime: room.aiRuntime, plans: room.aiPlans });
  const group = (await import("../../src/game/playRules")).classifyPlay([room.hands[1][0]!], room.rank)!;
  const runtime = { activePlanId: "plan", candidatePlans: [{ id: "plan", groups: [group], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 0, fallbackScore: 0 } }], generatedTurn: 0, configVersion: "test", needsReplan: false };
  decideAiAction.mockReturnValue({ action: { type: "pass" }, runtime, selectedPlan: runtime.candidatePlans[0], selectedPlanId: "plan", score: { total: 0, components: {} }, candidateCount: 1, consideredActions: 1, elapsedMs: 0, reasonCodes: [] });

  expect(() => runAiStep(room)).toThrow("AI_ENGINE_RETURNED_LEAD_PASS");
  expect({ hands: room.hands, trick: room.trick, history: room.playHistory, runtime: room.aiRuntime, plans: room.aiPlans }).toEqual(before);
});

it("does not commit runtime for an invalid classified unified group or a non-beating follow", async () => {
  const { createRoom, runAiStep } = await import("../../src/game/room");
  for (const mode of ["invalid", "non-beating"] as const) {
    const room = createRoom({ rank: "10", seed: 14 }); room.currentTurn = 1;
    const invalidCards = [room.hands[1][0]!, room.hands[1].find((card) => card.rank !== room.hands[1][0]?.rank)!];
    const highCard = createDeck().find((card) => card.id === "Joker-BJ-2")!;
    room.trick = mode === "invalid" ? { leadSeat: 1, passSeats: [], plays: [] } : { leadSeat: 0, lastPlaySeat: 0, lastPlay: classifyPlay([highCard], room.rank)!, passSeats: [], plays: [] };
    const cards = mode === "invalid" ? invalidCards : [room.hands[1].find((card) => card.kind === "suited" && card.rank !== "2")!];
    const group = { ...classifyPlay([room.hands[1][0]!], room.rank)!, cards };
    const runtime = { activePlanId: "plan", candidatePlans: [{ id: "plan", groups: [group], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 0, fallbackScore: 0 } }], generatedTurn: 0, configVersion: "test", needsReplan: false };
    const before = snapshot(room);
    decideAiAction.mockReturnValue({ action: { type: "play", group }, runtime, selectedPlan: runtime.candidatePlans[0], selectedPlanId: "plan", score: { total: 0, components: {} }, candidateCount: 1, consideredActions: 1, elapsedMs: 0, reasonCodes: [] });
    expect(() => runAiStep(room)).toThrow();
    expect(snapshot(room)).toEqual(before);
  }
});

it("commits runtime after a legal follow pass and keeps other seats isolated", async () => {
  const { createRoom, runAiStep } = await import("../../src/game/room");
  const room = createRoom({ rank: "10", seed: 15 }); room.currentTurn = 1;
  room.trick = { leadSeat: 0, lastPlaySeat: 0, lastPlay: classifyPlay([room.hands[0][0]!], room.rank)!, passSeats: [], plays: [] };
  const group = classifyPlay([room.hands[1][0]!], room.rank)!;
  const runtime = { activePlanId: "plan", candidatePlans: [{ id: "plan", groups: [group], metrics: { hardViolations: 0, protectionLoss: 0, estimatedTurns: 1, lowSingleCount: 0, retainedControl: 0, wildcardFlexibility: 0, responseCoverage: 0, leadFlexibility: 0, fallbackScore: 0 } }], generatedTurn: 0, configVersion: "test", needsReplan: false };
  const other = structuredClone(runtime); room.aiRuntime[3] = other; room.aiPlans[3] = { seat: 3, name: "other", score: 1, groups: [group] };
  decideAiAction.mockReturnValue({ action: { type: "pass" }, runtime, selectedPlan: runtime.candidatePlans[0], selectedPlanId: "plan", score: { total: 0, components: {} }, candidateCount: 1, consideredActions: 1, elapsedMs: 0, reasonCodes: [] });
  runAiStep(room);
  expect(room.trick.passSeats).toContain(1); expect(room.aiRuntime[1]?.needsReplan).toBe(false);
  expect(room.aiRuntime[3]).toEqual(other); expect(room.aiRuntime[1]).not.toBe(room.aiRuntime[3]);
});
