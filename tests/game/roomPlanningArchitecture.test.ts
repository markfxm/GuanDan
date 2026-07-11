import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRoom, getPublicRoom } from "../../src/game/room";

it("routes public-room planning through PlanManager and exposes a compatible plan view", () => {
  const room = createRoom({ rank: "2", seed: 9 });
  const publicRoom = getPublicRoom(room, 0);

  expect(room.aiRuntime[1]?.candidatePlans.length).toBeGreaterThan(0);
  expect(publicRoom.aiPlans[1]?.groups.flatMap((group) => group.cards.map((card) => card.id)).sort())
    .toEqual(room.hands[1].map((card) => card.id).sort());
});

it("contains no private room planner or plan-quality dependency", () => {
  const source = readFileSync(resolve(process.cwd(), "src/game/room.ts"), "utf8");
  expect(source).toContain('from "../ai/planning/planManager"');
  expect(source).not.toMatch(/buildRapidAiPlanGroups|buildFastAiPlanGroups|buildBeamAiCover|buildGreedyAiCover|scoreAiPlanGroups/);
  expect(source).not.toMatch(/measurePlanQuality|comparePlanQuality|isLegalBombReduction/);
});
