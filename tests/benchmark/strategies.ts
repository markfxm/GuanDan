import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import { DEFAULT_AI_PERFORMANCE_CONFIG } from "../../src/ai/config";
import type { AiRuntimeState } from "../../src/ai/contracts";
import { classifyPlay, playPower } from "../../src/game/playRules";
import { chooseAiAction } from "../helpers/legacyAiReference";
import { legalCandidates } from "./candidates";
import type {
  AiStrategy,
  BenchmarkObservation,
  StrategyAction,
} from "./contracts";
import { cardFromPublicId, toLegacyObservation, toProductionObservation } from "./observation";

const SOURCE_COMMIT = process.env.GIT_COMMIT ?? "unknown";
const CONFIG_HASH = "d0-v1";

export type LegalRandomRuntime = { state: number; calls: number };
export type LegalGreedyRuntime = { calls: number };
export type LegacyRuntime = { calls: number };

// CLI strategy IDs are dynamic, so the registry intentionally erases the
// concrete runtime type at this boundary. Concrete adapters above remain
// strongly typed.
export type Strategy = AiStrategy<any>;

const unifiedCurrent: AiStrategy<AiRuntimeState> = {
  id: "unified-current",
  implementationVersion: "production-ai-v1",
  configHash: CONFIG_HASH,
  sourceCommit: SOURCE_COMMIT,
  candidatePolicy: "production-policy",
  createRuntime: () => ({
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: DEFAULT_AI_PERFORMANCE_CONFIG.version,
    needsReplan: true,
  }),
  decide: (observation, runtime) => {
    const production = decideAiAction(toProductionObservation(observation), runtime, {
      ...DEFAULT_AI_PERFORMANCE_CONFIG,
      turn: observation.actionIndex,
    });
    return {
      action: toStrategyAction(production.action),
      // Keep the production runtime private to this adapter and replace its
      // outer object on every turn so callers cannot share seat-local state.
      runtime: { ...production.runtime },
    };
  },
};

const legacyReference: AiStrategy<LegacyRuntime> = {
  id: "legacy-reference",
  implementationVersion: "legacy-reference-v1",
  configHash: CONFIG_HASH,
  sourceCommit: SOURCE_COMMIT,
  candidatePolicy: "production-policy",
  createRuntime: () => ({ calls: 0 }),
  decide: (observation, runtime) => {
    try {
      const action = chooseAiAction(toLegacyObservation(observation));
      return {
        action: action.type === "pass"
          ? { type: "pass" }
          : { type: "play", cardIds: action.group.cards.map((card) => card.id).sort() },
        runtime: { calls: runtime.calls + 1 },
      };
    } catch (cause) {
      const error = new Error("LEGACY_REQUIRES_HIDDEN_INFORMATION");
      error.cause = cause;
      throw error;
    }
  },
};

const legalRandom: AiStrategy<LegalRandomRuntime> = {
  id: "legal-random",
  implementationVersion: "legal-random-v1",
  configHash: CONFIG_HASH,
  sourceCommit: SOURCE_COMMIT,
  candidatePolicy: "legal-only",
  createRuntime: (context) => ({ state: seedState(context.strategyRandomSeed), calls: 0 }),
  decide: (observation, runtime) => {
    const candidates = legalCandidates(observation);
    if (candidates.length === 0) {
      throw new Error(observation.publicTrick.length === 0 ? "LEGAL_RANDOM_NO_LEGAL_LEAD" : "LEGAL_RANDOM_NO_LEGAL_ACTION");
    }
    const state = nextState(runtime.state);
    return {
      action: candidates[state % candidates.length]!,
      runtime: { state, calls: runtime.calls + 1 },
    };
  },
};

const legalGreedy: AiStrategy<LegalGreedyRuntime> = {
  id: "legal-greedy",
  implementationVersion: "legal-greedy-v1",
  configHash: CONFIG_HASH,
  sourceCommit: SOURCE_COMMIT,
  candidatePolicy: "legal-only",
  createRuntime: () => ({ calls: 0 }),
  decide: (observation, runtime) => {
    const candidates = legalCandidates(observation);
    if (candidates.length === 0) {
      throw new Error(observation.publicTrick.length === 0 ? "LEGAL_GREEDY_NO_LEGAL_LEAD" : "LEGAL_GREEDY_NO_LEGAL_ACTION");
    }
    return {
      action: [...candidates].sort((left, right) => compareGreedyActions(left, right, observation))[0]!,
      runtime: { calls: runtime.calls + 1 },
    };
  },
};

const strategies: Record<string, Strategy> = {
  "unified-current": unifiedCurrent,
  "legacy-reference": legacyReference,
  "legal-random": legalRandom,
  "legal-greedy": legalGreedy,
  "deterministic-random": legalRandom,
  "simple-greedy": legalGreedy,
};

export function getStrategy(id: string): Strategy {
  const strategy = strategies[id];
  if (strategy === undefined) throw new Error(`UNKNOWN_STRATEGY:${id}`);
  return strategy;
}

export const strategyDescriptors = [unifiedCurrent, legacyReference, legalRandom, legalGreedy].map(({ id, implementationVersion, configHash, sourceCommit, candidatePolicy }) => ({
  id,
  implementationVersion,
  configHash,
  sourceCommit,
  candidatePolicy,
}));

function toStrategyAction(action: { type: "pass" } | { type: "play"; group: { cards: { id: string }[] } }): StrategyAction {
  return action.type === "pass" ? { type: "pass" } : { type: "play", cardIds: action.group.cards.map((card) => card.id).sort() };
}

function compareGreedyActions(left: StrategyAction, right: StrategyAction, observation: BenchmarkObservation): number {
  const leftCards = actionCards(left);
  const rightCards = actionCards(right);
  return rightCards.length - leftCards.length
    || actionPower(left, observation) - actionPower(right, observation)
    || actionKey(left).localeCompare(actionKey(right));
}

function actionCards(action: StrategyAction) {
  return action.type === "play" ? action.cardIds.map(cardFromPublicId) : [];
}

function actionPower(action: StrategyAction, observation: BenchmarkObservation): number {
  if (action.type === "pass") return Number.POSITIVE_INFINITY;
  const group = classifyPlay(actionCards(action), observation.rank);
  return group === undefined ? Number.POSITIVE_INFINITY : playPower(group, observation.rank);
}

function actionKey(action: StrategyAction): string {
  return action.type === "pass" ? "pass" : `play:${action.cardIds.join(",")}`;
}

function seedState(seed: string): number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0 || 1;
}

function nextState(state: number): number {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0 || 1;
}
