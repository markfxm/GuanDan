import { createDeck } from "../../src/engine/cards";
import { classifyPlay } from "../../src/game/playRules";
import { evaluateActionCandidate } from "../../src/ai/tactics/actionEvaluator";

it("returns deterministic structured scores whose total is the component sum", () => {
  const group = classifyPlay(createDeck().slice(0, 1), "10")!;
  const score = evaluateActionCandidate({ action: { type: "play", group }, stableKey: group.id, source: "HAND_ANALYSIS", policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] }, alignedPlanIds: [], reasonCodes: [] }, { hand: createDeck().slice(0, 12), gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(score.total).toBe(Object.values(score.components).reduce((sum, value) => sum + value, 0));
  expect(evaluateActionCandidate({ action: { type: "play", group }, stableKey: group.id, source: "HAND_ANALYSIS", policyVerdict: { allowed: true, hardViolation: false, reasonCodes: [] }, alignedPlanIds: [], reasonCodes: [] }, { hand: createDeck().slice(0, 12), gameRank: "10", seat: 1, partnerSeat: 3 })).toEqual(score);
});

it("rejects hard-policy candidates before scoring", () => {
  const group = classifyPlay(createDeck().slice(0, 1), "10")!;
  const candidate = { action: { type: "play" as const, group }, stableKey: group.id, source: "HAND_ANALYSIS" as const, policyVerdict: { allowed: false, hardViolation: true, reasonCodes: [] }, alignedPlanIds: [], reasonCodes: [] };

  expect(() => evaluateActionCandidate(candidate, { hand: createDeck().slice(0, 12), gameRank: "10", seat: 1, partnerSeat: 3 })).toThrow("ACTION_CANDIDATE_MUST_BE_LEGAL_AND_POLICY_APPROVED");
});
