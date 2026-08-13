import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  actionStableKey,
  canonicalJson,
  decisionPublicTraceHash,
  fixtureInputHash,
  fixtureOutputHash,
  runtimeCanonicalJson,
  sha256,
  inputPayload,
} from "../tests/ai/d0FixtureCanonicalizer";
import type { D0KeepCurrentCase, D0KeepCurrentFixture } from "../tests/ai/d0FixtureTypes";

const EXPECTED_SOURCE_COMMIT = "e2a20e18f8e5c0871db38ad69426262e43766ce1";
const SOURCE_TAG = "ai-benchmark-d0-baseline";
const SCHEMA_VERSION = "d0-keep-current-fixture-v1";
const GENERATOR_CODE_PATHS = [
  "scripts/generateD0KeepCurrentFixtures.ts",
  "tests/ai/d0FixtureCanonicalizer.ts",
  "tests/ai/d0FixtureTypes.ts",
] as const;

type SourceEngine = {
  decideAiAction: (observation: unknown, runtime: unknown, config: unknown) => {
    action: unknown;
    runtime: Record<string, unknown>;
  };
};

type SourceRules = {
  classifyPlay: (cards: unknown[], rank: string) => unknown;
};

type Card = Record<string, unknown>;

type CaseSpec = {
  caseId: string;
  handIds: string[];
  lastPlayIds?: string[];
  lastPlaySeat?: number;
  runtimeInput?: Record<string, unknown>;
};

const CONFIG = {
  analysisCacheSize: 64,
  planning: { maxPlans: 5, beamWidth: 1, timeBudgetMs: 0 },
  version: "ai-core-v1",
  turn: 0,
};

const CASE_SPECS: CaseSpec[] = [
  { caseId: "lead-single", handIds: ["S3-1", "C5-1", "H7-1", "D9-1"] },
  { caseId: "follow-normal", handIds: ["S6-1", "C7-1", "H8-1"], lastPlayIds: ["S5-2"], lastPlaySeat: 0 },
  { caseId: "follow-pass-only", handIds: ["S3-1", "C4-1", "H5-1"], lastPlayIds: ["SJ-2"], lastPlaySeat: 0 },
  {
    caseId: "complete-replan",
    handIds: ["S4-1", "C6-1", "H8-1", "D9-1"],
    runtimeInput: { handKey: "obsolete", candidatePlans: [], generatedTurn: 0, configVersion: "shadow-v1", needsReplan: false },
  },
  { caseId: "incremental-runtime", handIds: ["S3-1", "C5-1", "H7-1", "D9-1"] },
];

function parseArgs(argv: string[]): { sourceWorktree: string; sourceCommit: string; output: string; generatorVersion: string; checkOnly: boolean } {
  const values = new Map<string, string>();
  let checkOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--check-only") {
      checkOnly = true;
      continue;
    }
    if (!arg.startsWith("--") || argv[index + 1] === undefined) throw new Error(`D0_GENERATOR_ARGUMENT:${arg}`);
    values.set(arg, argv[index + 1]!);
    index += 1;
  }
  const sourceWorktree = values.get("--source-worktree");
  const sourceCommit = values.get("--source-commit");
  const output = values.get("--output");
  const generatorVersion = values.get("--generator-version");
  if (sourceWorktree === undefined || sourceCommit === undefined || output === undefined || generatorVersion === undefined) {
    throw new Error("D0_GENERATOR_ARGUMENT:missing-required-option");
  }
  return { sourceWorktree: path.resolve(sourceWorktree), sourceCommit, output: path.resolve(output), generatorVersion, checkOnly };
}

function git(sourceWorktree: string, ...args: string[]): string {
  return execFileSync("git", ["-C", sourceWorktree, ...args], { encoding: "utf8" }).trim();
}

function gitBytes(repoRoot: string, ...args: string[]): Buffer {
  return execFileSync("git", ["-C", repoRoot, ...args]);
}

function generatorRepoRoot(): string {
  return git(process.cwd(), "rev-parse", "--show-toplevel");
}

function ensureGeneratorFilesTracked(repoRoot: string): void {
  try {
    git(repoRoot, "ls-files", "--error-unmatch", ...GENERATOR_CODE_PATHS);
  } catch {
    throw new Error("D0_GENERATOR_CODE_UNTRACKED");
  }
}

function ensureGeneratorFilesClean(repoRoot: string): void {
  if (git(repoRoot, "status", "--porcelain", "--", ...GENERATOR_CODE_PATHS) !== "") {
    throw new Error("D0_GENERATOR_CODE_DIRTY");
  }
}

function hashCodeFiles(files: Array<{ relativePath: string; bytes: Buffer }>): string {
  const hash = crypto.createHash("sha256");
  for (const file of files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    hash.update(file.relativePath, "utf8");
    hash.update(Buffer.from([0]));
    hash.update(file.bytes);
  }
  return hash.digest("hex");
}

function workingGeneratorCodeTreeSha256(repoRoot: string): string {
  ensureGeneratorFilesTracked(repoRoot);
  return hashCodeFiles(GENERATOR_CODE_PATHS.map((relativePath) => ({
    relativePath,
    bytes: fs.readFileSync(path.join(repoRoot, relativePath)),
  })));
}

function committedGeneratorCodeTreeSha256(repoRoot: string, commit: string): string {
  if (!/^[0-9a-f]{40}$/.test(commit) || git(repoRoot, "cat-file", "-t", commit) !== "commit") {
    throw new Error("D0_GENERATOR_COMMIT_INVALID");
  }
  try {
    return hashCodeFiles(GENERATOR_CODE_PATHS.map((relativePath) => ({
      relativePath,
      bytes: gitBytes(repoRoot, "show", `${commit}:${relativePath}`),
    })));
  } catch {
    throw new Error("D0_GENERATOR_CODE_TREE_MISSING");
  }
}

type GeneratorProvenance = { generatorCommit: string; generatorCodeTreeSha256: string };

function resolveGeneratorProvenance(existing: D0KeepCurrentFixture | undefined, requestedVersion: string): GeneratorProvenance {
  const repoRoot = generatorRepoRoot();
  const currentTreeHash = workingGeneratorCodeTreeSha256(repoRoot);
  if (existing !== undefined) {
    if (typeof existing.generatorCommit !== "string"
      || typeof existing.generatorVersion !== "string"
      || typeof existing.generatorCodeTreeSha256 !== "string"
      || existing.generatorVersion !== requestedVersion) {
      throw new Error("D0_FIXTURE_PROVENANCE_INVALID");
    }
    let committedTreeHash: string;
    try {
      committedTreeHash = committedGeneratorCodeTreeSha256(repoRoot, existing.generatorCommit);
    } catch {
      throw new Error("D0_FIXTURE_PROVENANCE_INVALID");
    }
    if (existing.generatorCodeTreeSha256 !== committedTreeHash || existing.generatorCodeTreeSha256 !== currentTreeHash) {
      throw new Error("D0_FIXTURE_PROVENANCE_INVALID");
    }
    return { generatorCommit: existing.generatorCommit, generatorCodeTreeSha256: currentTreeHash };
  }
  ensureGeneratorFilesClean(repoRoot);
  const commit = git(repoRoot, "rev-parse", "HEAD");
  return { generatorCommit: commit, generatorCodeTreeSha256: currentTreeHash };
}

function validateSource(sourceWorktree: string, sourceCommit: string): void {
  const head = git(sourceWorktree, "rev-parse", "HEAD");
  if (sourceCommit !== EXPECTED_SOURCE_COMMIT || head !== EXPECTED_SOURCE_COMMIT) {
    throw new Error(`D0_SOURCE_COMMIT_MISMATCH:expected=${EXPECTED_SOURCE_COMMIT}:source=${head}:arg=${sourceCommit}`);
  }
  const peeledTag = git(sourceWorktree, "rev-parse", `refs/tags/${SOURCE_TAG}^{}`);
  if (peeledTag !== EXPECTED_SOURCE_COMMIT) throw new Error(`D0_SOURCE_TAG_MISMATCH:${peeledTag}`);
  if (git(sourceWorktree, "status", "--porcelain", "--", "src") !== "") throw new Error("D0_SOURCE_PRODUCTION_DIRTY");
}

async function loadSource(sourceWorktree: string): Promise<{ engine: SourceEngine; rules: SourceRules; deck: Card[] }> {
  const engine = await import(pathToFileURL(path.join(sourceWorktree, "src/ai/aiDecisionEngine.ts")).href) as SourceEngine;
  const rules = await import(pathToFileURL(path.join(sourceWorktree, "src/game/playRules.ts")).href) as SourceRules;
  const cardsModule = await import(pathToFileURL(path.join(sourceWorktree, "src/engine/cards.ts")).href) as { createDeck: () => Card[] };
  return { engine, rules, deck: cardsModule.createDeck() };
}

function cardById(deck: Card[], id: string): Card {
  const card = deck.find((candidate) => candidate.id === id);
  if (card === undefined) throw new Error(`D0_FIXTURE_UNKNOWN_CARD:${id}`);
  return structuredClone(card);
}

function makeObservation(spec: CaseSpec, deck: Card[], rules: SourceRules): Record<string, unknown> {
  const hand = spec.handIds.map((id) => cardById(deck, id));
  const lastPlayCards = spec.lastPlayIds?.map((id) => cardById(deck, id));
  const lastPlay = lastPlayCards === undefined ? undefined : rules.classifyPlay(lastPlayCards, "10");
  if (spec.lastPlayIds !== undefined && lastPlay === undefined) throw new Error(`D0_FIXTURE_INVALID_LAST_PLAY:${spec.caseId}`);
  return {
    hand,
    gameRank: "10",
    seat: 1,
    partnerSeat: 3,
    playedCards: lastPlayCards ?? [],
    handCounts: { 0: 8, 1: hand.length, 2: 8, 3: 8 },
    lastPlay,
    lastPlaySeat: spec.lastPlaySeat,
    finishOrder: [],
    partnerPassedCurrentTrick: false,
  };
}

function makeCase(spec: CaseSpec, source: Awaited<ReturnType<typeof loadSource>>): D0KeepCurrentCase {
  const observation = makeObservation(spec, source.deck, source.rules);
  const runtimeInput = spec.runtimeInput ?? { candidatePlans: [], generatedTurn: -1, configVersion: "", needsReplan: true };
  const result = source.engine.decideAiAction(observation, runtimeInput, CONFIG);
  const expected = {
    actionStableKey: actionStableKey(result.action),
    action: result.action as Record<string, unknown>,
    runtime: result.runtime,
    runtimeCanonicalJson: runtimeCanonicalJson(result.runtime),
    publicTraceHash: decisionPublicTraceHash(observation, result.action),
    schemaVersion: SCHEMA_VERSION,
    engineVersion: `d0-ai@${EXPECTED_SOURCE_COMMIT}`,
  };
  return {
    caseId: spec.caseId,
    observation,
    runtimeInput,
    config: CONFIG,
    inputSha256: sha256(canonicalJson(inputPayload({ caseId: spec.caseId, observation, runtimeInput, config: CONFIG }))),
    expected,
  };
}

function makeIncrementalCase(spec: CaseSpec, source: Awaited<ReturnType<typeof loadSource>>, first: D0KeepCurrentCase): D0KeepCurrentCase {
  const firstAction = first.expected.action as { type: string; group?: { cards?: Array<{ id: string }> } };
  const removed = new Set(firstAction.type === "play" ? (firstAction.group?.cards ?? []).map((card) => card.id) : []);
  const observation = structuredClone(first.observation);
  observation.hand = (observation.hand as Card[]).filter((card) => !removed.has(String(card.id)));
  observation.handCounts = { 0: 8, 1: (observation.hand as Card[]).length, 2: 8, 3: 8 };
  observation.playedCards = [...(observation.playedCards as Card[]), ...(firstAction.type === "play" ? (firstAction.group?.cards ?? []) : [])];
  const result = source.engine.decideAiAction(observation, first.expected.runtime, { ...CONFIG, turn: 1 });
  const expected = {
    actionStableKey: actionStableKey(result.action),
    action: result.action as Record<string, unknown>,
    runtime: result.runtime,
    runtimeCanonicalJson: runtimeCanonicalJson(result.runtime),
    publicTraceHash: decisionPublicTraceHash(observation, result.action),
    schemaVersion: SCHEMA_VERSION,
    engineVersion: `d0-ai@${EXPECTED_SOURCE_COMMIT}`,
  };
  const runtimeInput = first.expected.runtime;
  return {
    caseId: spec.caseId,
    observation,
    runtimeInput,
    config: { ...CONFIG, turn: 1 },
    inputSha256: sha256(canonicalJson(inputPayload({ caseId: spec.caseId, observation, runtimeInput, config: { ...CONFIG, turn: 1 } }))),
    expected,
  };
}

async function generateFixture(options: ReturnType<typeof parseArgs>, provenance: GeneratorProvenance): Promise<D0KeepCurrentFixture> {
  validateSource(options.sourceWorktree, options.sourceCommit);
  const source = await loadSource(options.sourceWorktree);
  const lead = makeCase(CASE_SPECS[0]!, source);
  const cases = [
    lead,
    makeCase(CASE_SPECS[1]!, source),
    makeCase(CASE_SPECS[2]!, source),
    makeCase(CASE_SPECS[3]!, source),
    makeIncrementalCase(CASE_SPECS[4]!, source, lead),
  ];
  const fixture: D0KeepCurrentFixture = {
    schemaVersion: SCHEMA_VERSION,
    sourceCommit: EXPECTED_SOURCE_COMMIT,
    sourceTag: SOURCE_TAG,
    generatorCommit: provenance.generatorCommit,
    generatorVersion: options.generatorVersion,
    generatorCodeTreeSha256: provenance.generatorCodeTreeSha256,
    inputSha256: fixtureInputHash(cases),
    outputSha256: "",
    cases,
  };
  fixture.outputSha256 = fixtureOutputHash(fixture);
  return fixture;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const existing = options.checkOnly && fs.existsSync(options.output)
    ? JSON.parse(fs.readFileSync(options.output, "utf8")) as D0KeepCurrentFixture
    : undefined;
  if (options.checkOnly && existing === undefined) throw new Error("D0_FIXTURE_MISSING");
  validateSource(options.sourceWorktree, options.sourceCommit);
  const provenance = resolveGeneratorProvenance(existing, options.generatorVersion);
  const fixture = await generateFixture(options, provenance);
  if (options.checkOnly) {
    const existing = fs.readFileSync(options.output, "utf8");
    if (canonicalJson(JSON.parse(existing)) !== canonicalJson(fixture)) throw new Error("D0_FIXTURE_DRIFT");
    return;
  }
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(fixture, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
