import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createLegacyBenchmarkRoom } from "../../src/game/room";
import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import { detectGroups } from "../../src/engine/groups";
import {
  createPlannerExpansionObserver,
  generatePlans,
  type Plan,
  type PlannerExpansionStats,
} from "../../src/engine/planner";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../src/ai/config";
import { generateFastHandPlans } from "../../src/ai/planning/handPlanner";
import { evaluatePowerGroupUse } from "../../src/ai/policy/powerGroupPolicy";

const BUDGETS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
const CURATED_MULTI_IDS = ["HA-2", "D5-2", "S3-1", "D6-2", "C7-1", "CK-2", "C10-2", "S2-1", "SK-1", "SA-2", "S6-2", "HK-1", "S8-1", "CA-1"];
const CURATED_SINGLE_IDS = ["SA-1", "SK-1", "SQ-1", "SJ-1", "S10-1", "S9-1", "S8-1", "S7-1"];
const RANKS: GameRank[] = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

type TimedRun = {
  durationMs: number;
  planCount: number;
  uniquePlanCount: number;
  validPlanCount: number;
  expandedStates: number;
  generatedChildren: number;
  acceptedChildren: number;
  duplicateChildren: number;
  completedPlans: number;
  budgetExceeded: boolean;
  terminationReasons: PlannerExpansionStats["terminationReasons"];
  errors: number;
};

type StudySummary = {
  schemaVersion: "d1-r1b1-expansion-budget-study-v1";
  baseline: { maxPlans: number; beamWidth: number; timeBudgetMs: number };
  budgets: number[];
  curated: Record<string, Record<string, { runs: TimedRun[]; passesExposure: boolean }>>;
  realHands: {
    handCount: number;
    seeds: [number, number];
    ranksCovered: string[];
    records: Array<{ seed: number; rank: GameRank; seat: 0 | 1 | 2 | 3; handHash: string }>;
    configs: Record<string, { p50Ms: number; p95Ms: number; p99Ms: number; maxMs: number; p50Expanded: number; p95Expanded: number; maxExpanded: number; uniquePlanRate: number; validChallengerRate: number; errors: number; ratioToBaselineP95: number | null }>;
  };
  decision: "NO_GO" | "APPROVE_CANDIDATE_CONTRACT";
  decisionReason: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function handHash(hand: Card[]): string {
  return sha256([...hand].map((card) => card.id).sort().join("\n"));
}

function fingerprint(plan: Plan): string {
  return plan.groups.map((group) => group.id).sort().join("|");
}

function isStructurallyValid(plan: Plan, hand: Card[], rank: GameRank, knownGroups?: ReturnType<typeof detectGroups>): boolean {
  const ids = plan.groups.flatMap((group) => group.cards.map((card) => card.id));
  if (ids.length !== hand.length || new Set(ids).size !== hand.length) return false;
  const handIds = new Set(hand.map((card) => card.id));
  if (ids.some((id) => !handIds.has(id))) return false;
  const groups = knownGroups ?? detectGroups(hand, rank);
  return plan.groups.every((group) => {
    const candidate = groups.find((entry) => entry.id === group.id);
    return candidate !== undefined && evaluatePowerGroupUse(candidate, hand, groups, rank).allowed;
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function emptyStats(): TimedRun {
  return { durationMs: 0, planCount: 0, uniquePlanCount: 0, validPlanCount: 0, expandedStates: 0, generatedChildren: 0, acceptedChildren: 0, duplicateChildren: 0, completedPlans: 0, budgetExceeded: false, terminationReasons: { completed: 0, "budget-exhausted": 0, "exhausted-frontier": 0 }, errors: 0 };
}

function runCandidate(hand: Card[], rank: GameRank, budget: number, knownGroups?: ReturnType<typeof detectGroups>): TimedRun {
  const observer = createPlannerExpansionObserver(budget);
  const result = emptyStats();
  const started = process.hrtime.bigint();
  try {
    const plans = generatePlans(hand, rank, DEFAULT_AI_PERFORMANCE_CONFIG.planning.maxPlans, observer);
    result.planCount = plans.length;
    result.uniquePlanCount = new Set(plans.map(fingerprint)).size;
    result.validPlanCount = plans.filter((plan) => isStructurallyValid(plan, hand, rank, knownGroups)).length;
  } catch {
    result.errors = 1;
  }
  result.durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  Object.assign(result, observer.stats);
  return result;
}

function runBaseline(hand: Card[], rank: GameRank): TimedRun {
  const result = emptyStats();
  const started = process.hrtime.bigint();
  try {
    const plans = generateFastHandPlans(hand, rank, DEFAULT_AI_PERFORMANCE_CONFIG.planning);
    result.planCount = plans.length;
    result.uniquePlanCount = new Set(plans.map((plan) => plan.groups.map((group) => group.id).sort().join("|"))).size;
    result.validPlanCount = plans.filter((plan) => plan.metrics.hardViolations === 0).length;
  } catch {
    result.errors = 1;
  }
  result.durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  return result;
}

function fixtureHand(ids: string[]): Card[] {
  const deck = createDeck();
  return ids.map((id) => {
    const card = deck.find((candidate) => candidate.id === id);
    if (card === undefined) throw new Error(`Unknown fixture card: ${id}`);
    return card;
  });
}

export function fixtureStudy(): StudySummary["curated"] {
  const multi = fixtureHand(CURATED_MULTI_IDS);
  const single = fixtureHand(CURATED_SINGLE_IDS);
  const fixtures: Record<string, { hand: Card[]; rank: GameRank }> = {
    multiDecomposition: { hand: multi, rank: "2" },
    straightVsThreeCard: { hand: multi, rank: "2" },
    bombProtectionSplit: { hand: multi, rank: "2" },
    wildcardAlternatives: { hand: multi, rank: "2" },
    protectedGroup: { hand: multi, rank: "2" },
    singlePath: { hand: single, rank: "2" },
    exactReuse: { hand: single, rank: "2" },
    partialRepair: { hand: single, rank: "2" },
    completeReplan: { hand: multi, rank: "2" },
  };
  const output: StudySummary["curated"] = {};
  for (const [fixtureId, fixture] of Object.entries(fixtures)) {
    output[fixtureId] = {};
    for (const budget of BUDGETS) {
      const runs = [runCandidate(fixture.hand, fixture.rank, budget), runCandidate(fixture.hand, fixture.rank, budget), runCandidate(fixture.hand, fixture.rank, budget)];
      output[fixtureId][String(budget)] = {
        runs,
        passesExposure: fixtureId === "singlePath" || fixtureId === "exactReuse" || fixtureId === "partialRepair"
          ? runs.every((run) => run.validPlanCount >= 1)
          : runs.every((run) => run.uniquePlanCount >= 2 && run.validPlanCount >= 2),
      };
    }
  }
  return output;
}

function realHands(): StudySummary["realHands"] {
  const records: StudySummary["realHands"]["records"] = [];
  const hands: Array<{ hand: Card[]; rank: GameRank; seed: number; seat: 0 | 1 | 2 | 3 }> = [];
  for (let seed = 5001; seed <= 5052; seed += 1) {
    const rank = RANKS[(seed - 5001) % RANKS.length];
    const room = createLegacyBenchmarkRoom({ rank, seed });
    for (const seat of [0, 1, 2, 3] as const) {
      const hand = room.hands[seat];
      hands.push({ hand, rank, seed, seat });
      records.push({ seed, rank, seat, handHash: handHash(hand) });
    }
  }
  const budgetsToMeasure = [512];
  const knownGroups = hands.map((entry) => detectGroups(entry.hand, entry.rank));
  const baselineRuns = hands.flatMap((entry) => Array.from({ length: 6 }, () => runBaseline(entry.hand, entry.rank)));
  const configs: StudySummary["realHands"]["configs"] = {};
  for (const budget of budgetsToMeasure) {
    const candidates = hands.flatMap((entry, index) => Array.from({ length: 6 }, () => runCandidate(entry.hand, entry.rank, budget, knownGroups[index])));
    const baselineMs = baselineRuns.map((run) => run.durationMs);
    const candidateMs = candidates.map((run) => run.durationMs);
    const baselineP95 = percentile(baselineMs, 0.95);
    configs[String(budget)] = {
      p50Ms: percentile(candidateMs, 0.5), p95Ms: percentile(candidateMs, 0.95), p99Ms: percentile(candidateMs, 0.99), maxMs: Math.max(...candidateMs),
      p50Expanded: percentile(candidates.map((run) => run.expandedStates), 0.5), p95Expanded: percentile(candidates.map((run) => run.expandedStates), 0.95), maxExpanded: Math.max(...candidates.map((run) => run.expandedStates)),
      uniquePlanRate: candidates.filter((run) => run.uniquePlanCount > 1).length / candidates.length,
      validChallengerRate: candidates.filter((run) => run.validPlanCount > 1).length / candidates.length,
      errors: candidates.reduce((sum, run) => sum + run.errors, 0),
      ratioToBaselineP95: baselineP95 === 0 ? null : percentile(candidateMs, 0.95) / baselineP95,
    };
  }
  return { handCount: hands.length, seeds: [5001, 5052], ranksCovered: [...new Set(records.map((record) => record.rank))].sort(), records, configs };
}

export async function measureD1PlannerExpansionBudget(output?: string): Promise<StudySummary> {
  const curated = fixtureStudy();
  const real = realHands();
  const curatedExposurePass = ["multiDecomposition", "straightVsThreeCard", "bombProtectionSplit", "wildcardAlternatives", "protectedGroup"]
    .every((fixtureId) => curated[fixtureId]?.["512"]?.passesExposure === true);
  const passingConfig = Object.entries(real.configs).find(([, value]) => curatedExposurePass && value.validChallengerRate > 0 && value.ratioToBaselineP95 !== null && value.ratioToBaselineP95 <= 2);
  const summary: StudySummary = {
    schemaVersion: "d1-r1b1-expansion-budget-study-v1",
    baseline: { maxPlans: 5, beamWidth: 1, timeBudgetMs: 0 },
    budgets: BUDGETS,
    curated,
    realHands: real,
    decision: passingConfig === undefined ? "NO_GO" : "APPROVE_CANDIDATE_CONTRACT",
    decisionReason: passingConfig === undefined ? "No measured deterministic budget met curated exposure, valid challenger exposure, and the P95 <= 2x fast-planner gate." : `Budget ${passingConfig[0]} met the exposure and P95 gate.`,
  };
  if (output !== undefined) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
  return summary;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("measureD1PlannerExpansionBudget.ts")) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  measureD1PlannerExpansionBudget(output).then((summary) => {
    console.log(JSON.stringify({ decision: summary.decision, decisionReason: summary.decisionReason, realHands: summary.realHands.handCount, configs: summary.realHands.configs }));
  }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
