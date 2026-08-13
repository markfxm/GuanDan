import { describe, expect, it } from "vitest";
import type { AiRuntimeState, HandPlan } from "../../src/ai/contracts";
import {
  canonicalPlanInput,
  commitFullReplan,
  cleanupPlanIdentityMap,
  createFullReplanIdentity,
  createIncrementalIdentity,
  createPlanIdentity,
  migrateD1State,
  type IdentityInput,
  type MigrationContext,
} from "../../src/ai/planning/planIdentity";

const card = (id: string) => ({ id, kind: "suited" as const, rank: "3" as const, suit: "spades" as const, copy: 1 as const });
const group = (ids: string[]) => ({ id: `single:${ids[0]}`, type: "single" as const, label: "single", purpose: "risk" as const, strength: 1, wildcards: [], cards: ids.map(card) });
const metrics = { hardViolations: 0, protectionLoss: 0.123456789, estimatedTurns: 1.23456789, lowSingleCount: 1, retainedControl: 2, wildcardFlexibility: 0, responseCoverage: 1, leadFlexibility: 2, fallbackScore: 0 };
const identityInput = (groups = [group(["S3-1"])]): IdentityInput => ({
  schemaVersion: "d1-plan-input-v1",
  roomRulesVersion: "guandan-v1",
  strategyId: "unified-current",
  strategyVersion: "production-ai-v1",
  configHash: "config-v1",
  seat: 1,
  fullReplanCount: 0,
  groups,
  metrics,
});
const migrationContext: MigrationContext = {
  schemaVersion: "d1-plan-input-v1",
  roomRulesVersion: "guandan-v1",
  strategyId: "unified-current",
  strategyVersion: "production-ai-v1",
  configHash: "config-v1",
  seat: 1,
  configVersion: "ai-core-v1",
  hand: [card("S3-1")],
  gameRank: "10",
};
const activePlan: HandPlan = { id: "active", groups: [group(["S3-1"])], metrics };
const d0Runtime = (): AiRuntimeState => ({
  handKey: "S3-1",
  activePlanId: "active",
  candidatePlans: [activePlan],
  generatedTurn: 0,
  configVersion: "ai-core-v1",
  needsReplan: false,
});

describe("P1 stable plan identity", () => {
  it("canonicalizes keys, groups, cards, maps, and numeric precision", () => {
    const first = identityInput([group(["S3-1"]), group(["C3-1"]) ]);
    const firstGroups = first.groups as Array<Record<string, unknown> & { cards: Record<string, unknown>[] }>;
    const second = { ...first, groups: [...firstGroups].reverse().map((candidate) => ({ ...candidate, cards: [...candidate.cards].reverse() })) };
    expect(canonicalPlanInput(first)).toBe(canonicalPlanInput(second));
    expect(canonicalPlanInput(first)).toContain("0.123457");
    expect(canonicalPlanInput(first)).not.toMatch(/duration|random|absolute|diagnostic/i);
    expect(createPlanIdentity(first)).toEqual(createPlanIdentity(second));

    const withCollections = identityInput();
    (withCollections.groups[0] as Record<string, unknown>).metadata = new Map<string, unknown>([["b", new Set([2, 1])], ["a", 3]]);
    const withCollectionsReordered = identityInput();
    (withCollectionsReordered.groups[0] as Record<string, unknown>).metadata = new Map<string, unknown>([["a", 3], ["b", new Set([1, 2])]]);
    expect(canonicalPlanInput(withCollections)).toBe(canonicalPlanInput(withCollectionsReordered));
  });

  it("keeps root/family for incremental identity and changes only lineage", () => {
    const base = createPlanIdentity(identityInput());
    const incremental = createIncrementalIdentity(base, { changedGroupIds: ["single:S3-1"], reason: "incremental-reuse" });
    expect(incremental.rootPlanId).toBe(base.rootPlanId);
    expect(incremental.planFamilyId).toBe(base.planFamilyId);
    expect(incremental.lineageId).not.toBe(base.lineageId);
  });

  it("creates a new root/family/lineage only for successful full replan ordinal", () => {
    const first = createFullReplanIdentity(identityInput(), 0);
    const second = createFullReplanIdentity(identityInput(), 1);
    expect(second.rootPlanId).not.toBe(first.rootPlanId);
    expect(second.planFamilyId).not.toBe(first.planFamilyId);
    expect(second.lineageId).not.toBe(first.lineageId);
  });

  it("does not consume full-replan ordinal on failure and commits it only on success", () => {
    const initial = {
      version: "d1-topk-runtime-v1" as const,
      planSwitchCount: 0,
      fullReplanCount: 0,
      recentStrategicPlanFamilyIds: [],
      planIdentityById: {},
    };
    expect(commitFullReplan(initial, "new", identityInput(), false)).toEqual(initial);
    const committed = commitFullReplan(initial, "new", identityInput(), true);
    expect(committed.fullReplanCount).toBe(1);
    expect(committed.activePlanId).toBe("new");
    expect(committed.planIdentityById.new).toBeDefined();
  });

  it("migrates a verifiable D0 active plan without full replan", () => {
    const result = migrateD1State(d0Runtime(), migrationContext);
    expect(result.kind).toBe("migrated");
    if (result.kind !== "migrated") return;
    expect(result.fullReplanRequired).toBe(false);
    expect(result.state.fullReplanCount).toBe(0);
    expect(result.state.migrationVersion).toBe("d0-to-d1-v1");
    expect(result.state.activePlanId).toBe("active");
    expect(result.state.activePlanFamilyId).toBeDefined();
  });

  it("requires migration only for missing, incomplete, duplicate, or illegal active plans", () => {
    const invalid = [
      { ...d0Runtime(), activePlanId: undefined },
      { ...d0Runtime(), candidatePlans: [{ ...activePlan, groups: [] }] },
      { ...d0Runtime(), candidatePlans: [{ ...activePlan, groups: [group(["S3-1"]), group(["S3-1"])] }] },
      { ...d0Runtime(), candidatePlans: [{ ...activePlan, groups: [group(["C3-1"])] }] },
    ];
    for (const runtime of invalid) expect(migrateD1State(runtime, migrationContext).kind).toBe("migration-required");
  });

  it("cleans identity map deterministically within K+2 and never deletes active", () => {
    const identity = (id: string) => ({ rootPlanId: `root-${id}`, planFamilyId: `family-${id}`, lineageId: `lineage-${id}` });
    const options = {
      activePlanId: "active",
      currentCandidatePlanIds: ["active", "c1", "c2", "c3", "c4"],
      necessaryPreviousPlanIds: ["p1", "p2"],
      staticPlanQualityById: { active: 1, c1: 5, c2: 4, c3: 3, c4: 2, p1: 1, p2: 0 },
      maxEntries: 7,
    };
    const first = cleanupPlanIdentityMap({ active: identity("active"), c1: identity("c1"), c2: identity("c2"), c3: identity("c3"), c4: identity("c4"), p1: identity("p1"), p2: identity("p2"), stale: identity("stale") }, options);
    const second = cleanupPlanIdentityMap({ stale: identity("stale"), p2: identity("p2"), c3: identity("c3"), active: identity("active"), p1: identity("p1"), c1: identity("c1"), c4: identity("c4"), c2: identity("c2") }, options);
    expect(Object.keys(first)).toEqual(Object.keys(second));
    expect(Object.keys(first)).toHaveLength(7);
    expect(first.active).toBeDefined();
    expect(first.stale).toBeUndefined();
  });
});
