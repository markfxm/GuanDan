import { describe, expect, it } from "vitest";
import { legalCandidates } from "./candidates";
import { createBenchmarkObservation } from "./observation";
import { buildGamesForSeed } from "./rotations";

describe("benchmark candidate ordering", () => {
  it("is stable across repeated enumeration and shuffled hand input", () => {
    const task = buildGamesForSeed({ benchmarkVersion: "d0-v1", rank: "2", seeds: [1], strategyA: "legal-random", strategyB: "legal-greedy", replayMode: "none" }, 1)[0]!;
    const observation = createBenchmarkObservation(task.room!, task.room!.currentTurn);
    const first = legalCandidates(observation).map(actionKey);
    const second = legalCandidates({ ...observation, ownHand: [...observation.ownHand].reverse() }).map(actionKey);
    expect(second).toEqual(first);
  });
});

function actionKey(action: { type: "pass" } | { type: "play"; cardIds: string[] }): string {
  return action.type === "pass" ? "pass" : `play:${action.cardIds.join(",")}`;
}
