import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { createDeck, type Card, type GameRank } from "../../src/engine/cards";
import { type CardGroup } from "../../src/engine/groups";
import { classifyPlay } from "../../src/game/playRules";
import type { AiDecision, AiDecisionConfig, AiObservation, AiRuntimeState, ActionCandidate } from "../../src/ai/contracts";
import { decideAiAction } from "../../src/ai/aiDecisionEngine";
import { generateActionCandidates, type ActionGenerationInput } from "../../src/ai/tactics/actionGenerator";
import { reduceRepresentativeActions } from "../../src/ai/tactics/representativeActionReducer";

const gameRank: GameRank = "10";
const deck = createDeck();
const task4Root = process.cwd();

type Scenario = {
  name: "lead" | "follow";
  lastPlayId?: string;
};

type CandidateInventory = {
  candidateCount: number;
  passCount: number;
  playCount: number;
  stableKeys: string[];
  actionTypes: string[];
  candidateBytes: string;
};

function card(id: string): Card {
  const found = deck.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`Missing fixture card ${id}`);
  }

  return found;
}

function singleGroup(id: string): CardGroup {
  const group = classifyPlay([card(id)], gameRank);
  if (group === undefined) {
    throw new Error(`Could not classify fixture card ${id}`);
  }

  return group;
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function pathForKey(parent: string, key: string): string {
  return parent.length === 0 ? key : `${parent}.${key}`;
}

function differingPaths(left: unknown, right: unknown, parent = ""): string[] {
  if (Object.is(left, right)) {
    return [];
  }

  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray) {
      return [parent || "$root"];
    }

    const paths: string[] = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const childPath = `${parent}[${index}]`;
      if (index >= left.length || index >= right.length) {
        paths.push(childPath);
      } else {
        paths.push(...differingPaths(left[index], right[index], childPath));
      }
    }
    return paths;
  }

  const leftIsObject = typeof left === "object" && left !== null;
  const rightIsObject = typeof right === "object" && right !== null;
  if (!leftIsObject || !rightIsObject) {
    return [parent || "$root"];
  }

  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareCodeUnits);
  const paths: string[] = [];
  for (const key of keys) {
    const childPath = pathForKey(parent, key);
    const leftHasKey = Object.prototype.hasOwnProperty.call(left, key);
    const rightHasKey = Object.prototype.hasOwnProperty.call(right, key);
    if (!leftHasKey || !rightHasKey) {
      paths.push(childPath);
      continue;
    }
    paths.push(...differingPaths((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], childPath));
  }

  return paths.sort(compareCodeUnits);
}

function deterministicDecisionProjection(decision: AiDecision): Omit<AiDecision, "elapsedMs"> {
  const { elapsedMs: _elapsedMs, ...projection } = decision;
  return projection;
}

function makeObservation(lastPlayId?: string): AiObservation {
  const hand = deck.slice(0, 8).map((candidate) => ({ ...candidate }));
  return {
    hand,
    gameRank,
    seat: 1,
    partnerSeat: 3,
    playedCards: [],
    handCounts: { 0: 8, 1: 8, 2: 8, 3: 8 },
    finishOrder: [],
    ...(lastPlayId === undefined ? {} : { lastPlay: singleGroup(lastPlayId), lastPlaySeat: 0 }),
  };
}

function makeRuntime(): AiRuntimeState {
  return {
    candidatePlans: [],
    generatedTurn: -1,
    configVersion: "",
    needsReplan: true,
  };
}

function makeConfig(): AiDecisionConfig {
  return {
    analysisCacheSize: 64,
    planning: { maxPlans: 2, beamWidth: 1, timeBudgetMs: 0 },
    version: "task4-test-v1",
    turn: 1,
  };
}

function makeGenerationInput(observation: AiObservation): ActionGenerationInput {
  return {
    hand: deepClone(observation.hand),
    gameRank: observation.gameRank,
    seat: observation.seat,
    partnerSeat: observation.partnerSeat,
    lastPlay: observation.lastPlay === undefined ? undefined : deepClone(observation.lastPlay),
    lastPlaySeat: observation.lastPlaySeat,
  };
}

function captureCandidateInventory(candidates: readonly ActionCandidate[]): CandidateInventory {
  return {
    candidateCount: candidates.length,
    passCount: candidates.filter((candidate) => candidate.action.type === "pass").length,
    playCount: candidates.filter((candidate) => candidate.action.type === "play").length,
    stableKeys: candidates.map((candidate) => candidate.stableKey),
    actionTypes: candidates.map((candidate) => candidate.action.type),
    candidateBytes: canonicalJson(candidates),
  };
}

function assertDetachedCandidates(original: readonly ActionCandidate[], detached: readonly ActionCandidate[]): void {
  expect(detached).not.toBe(original);
  expect(detached).toHaveLength(original.length);

  for (let index = 0; index < original.length; index += 1) {
    const source = original[index]!;
    const copy = detached[index]!;
    expect(copy).not.toBe(source);
    expect(copy.policyVerdict).not.toBe(source.policyVerdict);
    expect(copy.policyVerdict.reasonCodes).not.toBe(source.policyVerdict.reasonCodes);
    expect(copy.alignedPlanIds).not.toBe(source.alignedPlanIds);
    expect(copy.reasonCodes).not.toBe(source.reasonCodes);
    expect(copy.action).not.toBe(source.action);

    if (source.action.type === "play" && copy.action.type === "play") {
      expect(copy.action.group).not.toBe(source.action.group);
      expect(copy.action.group.cards).not.toBe(source.action.group.cards);
      expect(copy.action.group.wildcards).not.toBe(source.action.group.wildcards);
      for (let cardIndex = 0; cardIndex < source.action.group.cards.length; cardIndex += 1) {
        expect(copy.action.group.cards[cardIndex]).not.toBe(source.action.group.cards[cardIndex]);
      }
      for (let wildcardIndex = 0; wildcardIndex < source.action.group.wildcards.length; wildcardIndex += 1) {
        expect(copy.action.group.wildcards[wildcardIndex]).not.toBe(source.action.group.wildcards[wildcardIndex]);
      }
    }
  }
}

function collectOwnKeys(value: unknown, keys: string[] = []): string[] {
  if (typeof value !== "object" || value === null) {
    return keys;
  }

  for (const key of Object.keys(value)) {
    keys.push(key);
    collectOwnKeys((value as Record<string, unknown>)[key], keys);
  }

  return keys;
}

function assertFrozenReducerResult(result: ReturnType<typeof reduceRepresentativeActions>): void {
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.representativeInputIndices)).toBe(true);
  expect(Object.isFrozen(result.representativeByInputIndex)).toBe(true);
  expect(Object.isFrozen(result.diagnostics)).toBe(true);
  expect(result.fallback).toBe("use-original-candidates");

  const forbiddenKeys = new Set([
    "candidate",
    "action",
    "group",
    "card",
    "runtime",
    "selectedPlanId",
    "activePlanId",
    "D2c",
    "quota",
    "elapsedMs",
    "timer",
  ]);
  expect(collectOwnKeys(result).some((key) => forbiddenKeys.has(key))).toBe(false);
}

function astName(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text;
  }
  return undefined;
}

function hasAncestor(node: ts.Node, predicate: (ancestor: ts.Node) => boolean): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (predicate(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function parseProduction(filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function productionBoundaryAudit(): {
  reducerForbiddenImportCount: number;
  reducerForbiddenCallCount: number;
  integrationReducerImportCount: number;
  integrationReducerCallCount: number;
  integrationRepresentativeIdentifierCount: number;
  d2dPathReferenceCount: number;
  elapsedDefinitionCount: number;
  elapsedReturnCount: number;
  elapsedControlFlowCount: number;
  elapsedSortCount: number;
  elapsedRuntimeCount: number;
  elapsedActionCount: number;
  elapsedTimerCallCount: number;
  elapsedAssignmentCount: number;
  elapsedTypeIsNumber: boolean;
} {
  const reducerPath = resolve(task4Root, "src/ai/tactics/representativeActionReducer.ts");
  const contractPath = resolve(task4Root, "src/ai/contracts.ts");
  const integrationPaths = [
    "src/ai/aiDecisionEngine.ts",
    "src/ai/tactics/actionGenerator.ts",
    "src/ai/tactics/actionEvaluator.ts",
    "src/game/room.ts",
    "src/game/ai.ts",
  ].map((path) => resolve(task4Root, path));
  const reducerSource = parseProduction(reducerPath);
  const integrationSources = integrationPaths.map(parseProduction);
  const forbiddenImportTokens = [
    "room",
    "game/ai",
    "aiDecisionEngine",
    "planManager",
    "handPlanner",
    "D2c",
    "benchmark",
    "simulation",
    "server",
    "test",
    "node:fs",
    "node:path",
    "node:net",
    "node:http",
    "node:https",
    "node:child_process",
  ];
  const forbiddenReducerCalls = new Set([
    "random",
    "now",
    "localeCompare",
    "fetch",
    "generateActionCandidates",
    "evaluateActionCandidate",
    "planner",
    "runtime",
    "readFileSync",
    "writeFileSync",
    "existsSync",
    "readdirSync",
    "createReadStream",
    "createWriteStream",
    "connect",
    "request",
    "exec",
    "spawn",
    "fork",
  ]);
  let reducerForbiddenImportCount = 0;
  let reducerForbiddenCallCount = 0;
  let integrationReducerImportCount = 0;
  let integrationReducerCallCount = 0;
  let integrationRepresentativeIdentifierCount = 0;
  let d2dPathReferenceCount = 0;
  let elapsedDefinitionCount = 0;
  let elapsedReturnCount = 0;
  let elapsedControlFlowCount = 0;
  let elapsedSortCount = 0;
  let elapsedRuntimeCount = 0;
  let elapsedActionCount = 0;
  let elapsedTimerCallCount = 0;
  let elapsedAssignmentCount = 0;

  const visitReducer = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const path = (node.moduleSpecifier as ts.StringLiteral).text;
      if (forbiddenImportTokens.some((token) => path.includes(token))) {
        reducerForbiddenImportCount += 1;
      }
    }
    if (ts.isCallExpression(node) && forbiddenReducerCalls.has(astName(node.expression) ?? "")) {
      reducerForbiddenCallCount += 1;
    }
    ts.forEachChild(node, visitReducer);
  };
  visitReducer(reducerSource);

  const visitIntegration = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const path = (node.moduleSpecifier as ts.StringLiteral).text;
      if (path.includes("representativeActionReducer") || path.includes("reduceRepresentativeActions")) {
        integrationReducerImportCount += 1;
      }
    }
    if (ts.isCallExpression(node) && astName(node.expression) === "reduceRepresentativeActions") {
      integrationReducerCallCount += 1;
    }
    if (ts.isIdentifier(node) && (node.text === "representativeInputIndices" || node.text === "representativeByInputIndex")) {
      integrationRepresentativeIdentifierCount += 1;
    }
    if (ts.isIdentifier(node) && node.text.includes("D2d")) {
      d2dPathReferenceCount += 1;
    }
    ts.forEachChild(node, visitIntegration);
  };
  for (const source of integrationSources) {
    visitIntegration(source);
  }

  const visitElapsed = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === "elapsedMs") {
      if (ts.isVariableDeclaration(node.parent) && node.parent.name === node) {
        elapsedDefinitionCount += 1;
      }
      if (ts.isShorthandPropertyAssignment(node.parent)) {
        elapsedReturnCount += 1;
      }
      if (hasAncestor(node, (ancestor) => ts.isIfStatement(ancestor)
        || ts.isConditionalExpression(ancestor)
        || ts.isSwitchStatement(ancestor)
        || ts.isCaseClause(ancestor)
        || ts.isWhileStatement(ancestor)
        || ts.isForStatement(ancestor)
        || ts.isDoStatement(ancestor))) {
        elapsedControlFlowCount += 1;
      }
      if (hasAncestor(node, (ancestor) => ts.isCallExpression(ancestor)
        && ts.isPropertyAccessExpression(ancestor.expression)
        && ancestor.expression.name.text === "sort")) {
        elapsedSortCount += 1;
      }
      if (hasAncestor(node, (ancestor) => ts.isPropertyAssignment(ancestor)
        && ts.isIdentifier(ancestor.name)
        && ancestor.name.text === "runtime")) {
        elapsedRuntimeCount += 1;
      }
      if (hasAncestor(node, (ancestor) => ts.isPropertyAssignment(ancestor)
        && ts.isIdentifier(ancestor.name)
        && ancestor.name.text === "action")) {
        elapsedActionCount += 1;
      }
      if (ts.isBinaryExpression(node.parent)
        && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        elapsedAssignmentCount += 1;
      }
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === "performance"
      && node.expression.name.text === "now") {
      elapsedTimerCallCount += 1;
    }
    ts.forEachChild(node, visitElapsed);
  };
  visitElapsed(parseProduction(resolve(task4Root, "src/ai/aiDecisionEngine.ts")));

  const contracts = parseProduction(contractPath);
  let elapsedTypeIsNumber = false;
  for (const statement of contracts.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || statement.name.text !== "AiDecision" || !ts.isTypeLiteralNode(statement.type)) {
      continue;
    }
    const elapsedMember = statement.type.members.find((member) => ts.isPropertySignature(member)
      && ts.isIdentifier(member.name)
      && member.name.text === "elapsedMs");
    elapsedTypeIsNumber = elapsedMember !== undefined
      && ts.isPropertySignature(elapsedMember)
      && elapsedMember.type !== undefined
      && elapsedMember.type.kind === ts.SyntaxKind.NumberKeyword;
  }

  return {
    reducerForbiddenImportCount,
    reducerForbiddenCallCount,
    integrationReducerImportCount,
    integrationReducerCallCount,
    integrationRepresentativeIdentifierCount,
    d2dPathReferenceCount,
    elapsedDefinitionCount,
    elapsedReturnCount,
    elapsedControlFlowCount,
    elapsedSortCount,
    elapsedRuntimeCount,
    elapsedActionCount,
    elapsedTimerCallCount,
    elapsedAssignmentCount,
    elapsedTypeIsNumber,
  };
}

function assertScenarioNoOp(scenario: Scenario): void {
  const observationA = makeObservation(scenario.lastPlayId);
  const runtimeA = makeRuntime();
  const configA = makeConfig();
  const observationABytes = canonicalJson(observationA);
  const runtimeABytes = canonicalJson(runtimeA);
  const configABytes = canonicalJson(configA);

  const firstDecision = decideAiAction(observationA, runtimeA, configA);

  const generatorInputA = makeGenerationInput(makeObservation(scenario.lastPlayId));
  const generatorInputB = makeGenerationInput(makeObservation(scenario.lastPlayId));
  const generatorInputABytes = canonicalJson(generatorInputA);
  const generatorInputBBytes = canonicalJson(generatorInputB);
  const generatedCandidatesA = generateActionCandidates(generatorInputA);
  const generatedCandidatesB = generateActionCandidates(generatorInputB);
  const inventoryA = captureCandidateInventory(generatedCandidatesA);
  const inventoryB = captureCandidateInventory(generatedCandidatesB);

  expect(inventoryA.candidateCount).toBeGreaterThan(0);
  expect(inventoryA).toEqual(inventoryB);
  expect(canonicalJson(generatedCandidatesA)).toBe(canonicalJson(generatedCandidatesB));
  expect(canonicalJson(generatorInputA)).toBe(generatorInputABytes);
  expect(canonicalJson(generatorInputB)).toBe(generatorInputBBytes);
  if (scenario.name === "lead") {
    expect(inventoryA).toEqual({
      candidateCount: 4,
      passCount: 0,
      playCount: 4,
      stableKeys: ["single:SA-1", "single:SK-1", "single:SQ-1", "straight-flush:S10-1,S7-1,S8-1,S9-1,SJ-1"],
      actionTypes: ["play", "play", "play", "play"],
      candidateBytes: inventoryA.candidateBytes,
    });
  } else {
    expect(inventoryA).toEqual({
      candidateCount: 5,
      passCount: 1,
      playCount: 4,
      stableKeys: ["pass", "single:SA-1", "single:SK-1", "single:SQ-1", "straight-flush:S10-1,S7-1,S8-1,S9-1,SJ-1"],
      actionTypes: ["pass", "play", "play", "play", "play"],
      candidateBytes: inventoryA.candidateBytes,
    });
  }

  const detachedCandidates = deepClone(generatedCandidatesA);
  assertDetachedCandidates(generatedCandidatesA, detachedCandidates);
  const detachedCandidatesBytes = canonicalJson(detachedCandidates);
  const ownHandClone = deepClone(observationA.hand);
  const lastPlayClone = observationA.lastPlay === undefined ? undefined : deepClone(observationA.lastPlay);
  const ownHandCloneBytes = canonicalJson(ownHandClone);
  const lastPlayCloneBytes = canonicalJson(lastPlayClone);
  const reducerResult = reduceRepresentativeActions({
    actions: detachedCandidates,
    hand: ownHandClone,
    gameRank,
    lastPlay: lastPlayClone,
    hardCap: Math.max(1, detachedCandidates.length),
  });
  expect(reducerResult.status).toBe("unchanged");
  expect(reducerResult.diagnostics.equivalenceClassCount).toBe(detachedCandidates.length);
  expect(reducerResult.diagnostics.duplicateCount).toBe(0);
  assertFrozenReducerResult(reducerResult);
  expect(canonicalJson(generatedCandidatesA)).toBe(inventoryA.candidateBytes);
  expect(canonicalJson(detachedCandidates)).toBe(detachedCandidatesBytes);
  expect(canonicalJson(ownHandClone)).toBe(ownHandCloneBytes);
  expect(canonicalJson(lastPlayClone)).toBe(lastPlayCloneBytes);

  const observationB = makeObservation(scenario.lastPlayId);
  const runtimeB = makeRuntime();
  const configB = makeConfig();
  const observationBBytes = canonicalJson(observationB);
  const runtimeBBytes = canonicalJson(runtimeB);
  const configBBytes = canonicalJson(configB);
  const secondDecision = decideAiAction(observationB, runtimeB, configB);

  expect(canonicalJson(observationA)).toBe(observationABytes);
  expect(canonicalJson(runtimeA)).toBe(runtimeABytes);
  expect(canonicalJson(configA)).toBe(configABytes);
  expect(canonicalJson(observationB)).toBe(observationBBytes);
  expect(canonicalJson(runtimeB)).toBe(runtimeBBytes);
  expect(canonicalJson(configB)).toBe(configBBytes);

  expect(typeof firstDecision.elapsedMs).toBe("number");
  expect(Number.isFinite(firstDecision.elapsedMs)).toBe(true);
  expect(firstDecision.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(typeof secondDecision.elapsedMs).toBe("number");
  expect(Number.isFinite(secondDecision.elapsedMs)).toBe(true);
  expect(secondDecision.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(differingPaths(firstDecision, secondDecision)).toEqual(["elapsedMs"]);
  expect(deterministicDecisionProjection(firstDecision)).toEqual(deterministicDecisionProjection(secondDecision));
  expect(canonicalJson(deterministicDecisionProjection(firstDecision))).toBe(canonicalJson(deterministicDecisionProjection(secondDecision)));
  expect(canonicalJson(firstDecision.action)).toBe(canonicalJson(secondDecision.action));
  expect(canonicalJson(firstDecision.runtime)).toBe(canonicalJson(secondDecision.runtime));
  expect(firstDecision.selectedPlanId).toBe(secondDecision.selectedPlanId);
  expect(firstDecision.candidateCount).toBe(secondDecision.candidateCount);
  expect(firstDecision.consideredActions).toBe(secondDecision.consideredActions);
  expect(canonicalJson(firstDecision.score)).toBe(canonicalJson(secondDecision.score));
  expect(canonicalJson(firstDecision.reasonCodes)).toBe(canonicalJson(secondDecision.reasonCodes));
  expect(firstDecision.runtime.configVersion).toBe(secondDecision.runtime.configVersion);
  expect(reducerResult).not.toBe(observationB);
  expect(reducerResult).not.toBe(runtimeB);
  expect(reducerResult).not.toBe(configB);
  expect(canonicalJson(generatedCandidatesA)).toBe(inventoryA.candidateBytes);
  expect(canonicalJson(detachedCandidates)).toBe(detachedCandidatesBytes);
}

it.each([
  ["lead", { name: "lead", lastPlayId: undefined }],
  ["follow", { name: "follow", lastPlayId: "S2-1" }],
] as const)("characterizes detached reducer no-op without changing the %s decision", (_name, scenario) => {
  assertScenarioNoOp(scenario);
});

it("audits elapsedMs as the sole permitted nondeterministic decision field and verifies production boundaries", () => {
  const audit = productionBoundaryAudit();

  expect(audit.reducerForbiddenImportCount).toBe(0);
  expect(audit.reducerForbiddenCallCount).toBe(0);
  expect(audit.integrationReducerImportCount).toBe(0);
  expect(audit.integrationReducerCallCount).toBe(0);
  expect(audit.integrationRepresentativeIdentifierCount).toBe(0);
  expect(audit.d2dPathReferenceCount).toBe(0);
  expect(audit.elapsedTypeIsNumber).toBe(true);
  expect(audit.elapsedDefinitionCount).toBe(1);
  expect(audit.elapsedReturnCount).toBe(1);
  expect(audit.elapsedTimerCallCount).toBe(8);
  expect(audit.elapsedAssignmentCount).toBe(0);
  expect(audit.elapsedControlFlowCount).toBe(0);
  expect(audit.elapsedSortCount).toBe(0);
  expect(audit.elapsedRuntimeCount).toBe(0);
  expect(audit.elapsedActionCount).toBe(0);
});
