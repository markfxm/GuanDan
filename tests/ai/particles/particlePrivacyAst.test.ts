import path from "node:path";
import { describe, expect, test, beforeAll } from "vitest";
import * as ts from "typescript";
import { createDeck, type Card } from "../../../src/engine/cards";
import { buildPublicGameIdentity, type PublicSeat } from "../../../src/game/publicEvent";
import { canonicalPublicLedgerHash, createInitialPublicLedger } from "../../../src/game/publicLedger";
import { rebuildPublicLedger, type PublicLedgerReplayDocument } from "../../../src/game/publicEventReplay";
import { createRoom, getPublicRoom } from "../../../src/game/room";
import type {
  CanonicalInitialDeal,
  HiddenTransferAssignment,
  ParticleBank,
  ParticleBankConfigIdentity,
  ParticleScenario,
  ParticleSnapshotIdentity,
  PrivateParticleSummary,
} from "../../../src/ai/particles/contracts";

const sourceRoot = path.resolve(process.cwd(), "src");
const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
const particleRoot = path.join(sourceRoot, "ai", "particles");
const particleInternalsPath = "../../../src/ai/particles/particleBankInternals";
const forbiddenPublicKeys = new Set([
  "ParticleBank",
  "ParticleRecord",
  "ParticleBankInternals",
  "hiddenTransferAssignments",
  "rawWeights",
  "normalizedWeight",
  "seed",
  "seedHash",
  "hands",
  "initialHands",
  "scenario",
  "trace",
  "actionObservations",
  "finalState",
]);

type InternalsModule = typeof import("../../../src/ai/particles/particleBankInternals");

type PrivacyFixture = Readonly<{
  bank: ParticleBank;
  scenario: ParticleScenario;
  snapshot: ParticleSnapshotIdentity;
  initialLedger: ReturnType<typeof createInitialPublicLedger>;
  replayDocument: PublicLedgerReplayDocument;
  room: ReturnType<typeof createRoom>;
  internals: InternalsModule;
}>;

let fixture: PrivacyFixture;
let astAudit: Readonly<{
  inputProperties: readonly string[];
  bankProperties: readonly string[];
  summaryProperties: readonly string[];
  internalImporters: readonly string[];
  weakMapRegistryFiles: readonly string[];
}>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function collectObjectReferences(value: unknown, references = new Set<object>()): Set<object> {
  if (value === null || typeof value !== "object" || references.has(value)) return references;
  references.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) collectObjectReferences(nested, references);
  return references;
}

function expectNoObjectReference(output: unknown, input: unknown): void {
  const outputReferences = collectObjectReferences(output);
  for (const reference of collectObjectReferences(input)) expect(outputReferences.has(reference)).toBe(false);
}

function assertNoForbiddenPublicKey(value: unknown, visited = new Set<object>()): void {
  if (value === null || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const child of value) assertNoForbiddenPublicKey(child, visited);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    expect(forbiddenPublicKeys.has(key), `forbidden public key: ${key}`).toBe(false);
    assertNoForbiddenPublicKey(child, visited);
  }
}

function makePrivacyFixture(): Omit<PrivacyFixture, "internals"> {
  const deck = createDeck();
  const hands: Readonly<Record<PublicSeat, readonly Card[]>> = {
    0: deck.slice(0, 27),
    1: deck.slice(27, 54),
    2: deck.slice(54, 81),
    3: deck.slice(81, 108),
  };
  const initialDeal: CanonicalInitialDeal = {
    schemaVersion: "d2-particle-initial-deal-v1",
    hands,
  };
  const assignment: HiddenTransferAssignment = {
    eventIndex: 0,
    eventKind: "tribute",
    fromSeat: 0,
    toSeat: 1,
    cardId: deck[0]!.id,
  };
  const scenario: ParticleScenario = {
    schemaVersion: "d2-particle-scenario-v1",
    initialDeal,
    hiddenTransferAssignments: [assignment],
  };
  const publicIdentity = buildPublicGameIdentity("task7-privacy-room", 0, 0, "benchmark-scenario");
  const initialLedger = createInitialPublicLedger({
    identity: publicIdentity,
    initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
    openingLeader: 0,
    initialTrickIndex: 0,
    openingTributePublicState: {},
  });
  const replayDocument: PublicLedgerReplayDocument = {
    schemaVersion: "d2-public-ledger-replay-v1",
    initialState: {
      identity: publicIdentity,
      initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 },
      openingLeader: 0,
      initialTrickIndex: 0,
      openingTributePublicState: {},
    },
    events: [],
    finalLedgerHash: canonicalPublicLedgerHash(initialLedger),
    ledgerSnapshot: initialLedger,
  };
  const snapshot: ParticleSnapshotIdentity = {
    gameId: publicIdentity.gameId,
    roundIdentity: publicIdentity.roundIdentity,
    handIdentity: publicIdentity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(initialLedger),
    lastAppliedEventIndex: -1,
    ledgerHash: canonicalPublicLedgerHash(initialLedger),
    perspectiveSeat: 1,
    gameRank: "10",
  };
  const config: ParticleBankConfigIdentity = {
    schemaVersion: "d2-particle-bank-config-identity-v1",
    particleCount: 1,
    maxSamplingAttempts: 1,
    maxIndexDraws: 1,
    samplerConfigVersion: "task7-privacy",
    likelihoodConfigHash: "2".repeat(64),
  };
  const summary: PrivateParticleSummary = {
    status: "ready",
    requestedParticleCount: 1,
    acceptedParticleCount: 1,
    samplingAttempts: 1,
    duplicateCount: 0,
    zeroWeightCount: 0,
    effectiveSampleSize: 1,
  };
  const room = createRoom({ rank: "10", seed: 2, publicIdentity });
  const view: Omit<ParticleBank, "summary"> & Readonly<{ summary: PrivateParticleSummary }> = {
    schemaVersion: "d2-particle-bank-v1",
    snapshot,
    config,
    particleCount: 1,
    effectiveSampleSize: 1,
    status: "ready",
    summary,
  };
  return { bank: view as ParticleBank, scenario, snapshot, initialLedger, replayDocument, room };
}

function resolveAliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function declarationFile(checker: ts.TypeChecker, symbol: ts.Symbol): string | undefined {
  const resolved = resolveAliasedSymbol(checker, symbol);
  return resolved.declarations?.[0]?.getSourceFile().fileName;
}

function moduleSymbol(checker: ts.TypeChecker, sourceFile: ts.SourceFile): ts.Symbol {
  const symbol = checker.getSymbolAtLocation(sourceFile);
  if (symbol === undefined) throw new Error(`MODULE_SYMBOL_MISSING:${sourceFile.fileName}`);
  return symbol;
}

function exportedTypeProperties(
  checker: ts.TypeChecker,
  files: readonly ts.SourceFile[],
  fileSuffix: string,
  exportName: string,
): readonly string[] {
  const sourceFile = files.find((file) => file.fileName.replaceAll("\\", "/").endsWith(fileSuffix));
  if (sourceFile === undefined) throw new Error(`SOURCE_FILE_MISSING:${fileSuffix}`);
  const symbol = checker.getExportsOfModule(moduleSymbol(checker, sourceFile)).find((candidate) => candidate.name === exportName);
  if (symbol === undefined) throw new Error(`EXPORT_MISSING:${exportName}`);
  return checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(resolveAliasedSymbol(checker, symbol))).map((property) => property.name).sort();
}

function runAstPrivacyAudit(): Readonly<{
  inputProperties: readonly string[];
  bankProperties: readonly string[];
  summaryProperties: readonly string[];
  internalImporters: readonly string[];
  weakMapRegistryFiles: readonly string[];
}> {
  const configRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configRead.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(configRead.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, process.cwd());
  const sourceNames = ts.sys.readDirectory(sourceRoot, [".ts"], undefined, undefined);
  const program = ts.createProgram({ rootNames: sourceNames, options: parsed.options });
  const checker = program.getTypeChecker();
  const files = sourceNames.map((name) => program.getSourceFile(name)).filter((file): file is ts.SourceFile => file !== undefined);
  const particleFiles = files.filter((file) => file.fileName.replaceAll("\\", "/").includes("/src/ai/particles/"));
  const internalImporters = new Set<string>();
  const weakMapRegistryFiles = new Set<string>();
  const normalizedSourceRoot = sourceRoot.replaceAll("\\", "/").toLowerCase();
  const privateParticleExports = new Set([
    "ParticleBankInternals",
    "ParticleRecord",
    "createParticleBankHandle",
    "readParticleBankInternals",
  ]);
  const forbiddenImportPath = /(^|\/)(server|ui|benchmark|simulation|performance|worker)(\/|$)|(^|\/)(room|aiDecisionEngine|handPlanner|actionEvaluator|representativeActionShadowObserver)(?:\.[^/]+)?$|(^|\/)(candidate|root|treatment|rollout)(?:[-_a-z0-9]*)(?:\/|\.|$)/i;
  const forbiddenGlobalProperties = new Map([
    ["Math", new Set(["random"])],
    ["Date", new Set(["now"])],
    ["performance", new Set(["now"])],
    ["process", new Set(["env"])],
  ]);
  const forbiddenImportedSymbols = new Set(["Room", "RoomState"]);

  function isParticleSource(sourceFile: ts.SourceFile): boolean {
    return sourceFile.fileName.replaceAll("\\", "/").toLowerCase().includes("/src/ai/particles/");
  }

  function isPrivateParticleSymbol(symbol: ts.Symbol): boolean {
    const resolved = resolveAliasedSymbol(checker, symbol);
    const targetFile = declarationFile(checker, resolved)?.replaceAll("\\", "/");
    return privateParticleExports.has(resolved.name) || targetFile?.endsWith("/src/ai/particles/particleBankInternals.ts") === true;
  }

  function moduleExportsPrivateSymbols(symbol: ts.Symbol): readonly ts.Symbol[] {
    return checker.getExportsOfModule(symbol).filter(isPrivateParticleSymbol);
  }

  function assertResolvedParticleDependency(sourceFile: ts.SourceFile, targetFile: string | undefined): void {
    if (targetFile === undefined) throw new Error(`UNRESOLVED_PARTICLE_IMPORT:${sourceFile.fileName}`);
    const normalizedTarget = targetFile.replaceAll("\\", "/");
    const normalizedTargetLower = normalizedTarget.toLowerCase();
    if (!normalizedTargetLower.startsWith(`${normalizedSourceRoot}/`)) {
      throw new Error(`EXTERNAL_GENERIC_PARTICLE_IMPORT:${sourceFile.fileName}:${normalizedTarget}`);
    }
    if (forbiddenImportPath.test(normalizedTarget)) {
      throw new Error(`FORBIDDEN_PARTICLE_RESOLUTION:${sourceFile.fileName}:${normalizedTarget}`);
    }
  }

  function assertNoForbiddenImportedSymbols(sourceFile: ts.SourceFile, moduleSymbol: ts.Symbol, node: ts.ImportDeclaration): void {
    if (node.importClause?.namedBindings === undefined || !ts.isNamedImports(node.importClause.namedBindings)) return;
    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const element of node.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      const importedSymbol = exports.find((symbol) => symbol.name === importedName);
      if (importedSymbol !== undefined && forbiddenImportedSymbols.has(resolveAliasedSymbol(checker, importedSymbol).name)) {
        throw new Error(`FORBIDDEN_PARTICLE_SYMBOL:${sourceFile.fileName}:${importedName}`);
      }
    }
  }

  function assertNoForbiddenGlobalReference(sourceFile: ts.SourceFile, node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node)) {
      const receiver = checker.getSymbolAtLocation(node.expression);
      if (receiver !== undefined) {
        const receiverName = resolveAliasedSymbol(checker, receiver).name;
        const forbiddenProperties = forbiddenGlobalProperties.get(receiverName);
        if (forbiddenProperties?.has(node.name.text) === true) {
          throw new Error(`FORBIDDEN_PARTICLE_GLOBAL:${sourceFile.fileName}:${receiverName}.${node.name.text}`);
        }
      }
    }
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol !== undefined && ["Date", "performance", "process", "Worker"].includes(resolveAliasedSymbol(checker, symbol).name)) {
        const declaration = declarationFile(checker, symbol);
        if (declaration !== undefined && !declaration.replaceAll("\\", "/").toLowerCase().startsWith(normalizedSourceRoot)) {
          throw new Error(`FORBIDDEN_PARTICLE_GLOBAL:${sourceFile.fileName}:${symbol.name}`);
        }
      }
    }
  }

  for (const sourceFile of files) {
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const moduleSymbol = checker.getSymbolAtLocation(node.moduleSpecifier);
        if (moduleSymbol === undefined) throw new Error(`MODULE_SYMBOL_MISSING:${sourceFile.fileName}:${node.moduleSpecifier.text}`);
        if (isParticleSource(sourceFile)) assertNoForbiddenImportedSymbols(sourceFile, moduleSymbol, node);
        for (const exported of checker.getExportsOfModule(moduleSymbol)) {
          if (isPrivateParticleSymbol(exported)) {
            if (!isParticleSource(sourceFile)) throw new Error(`INTERNAL_IMPORT_LEAK:${sourceFile.fileName}`);
            internalImporters.add(sourceFile.fileName);
          }
        }
        const target = ts.resolveModuleName(node.moduleSpecifier.text, sourceFile.fileName, parsed.options, ts.sys).resolvedModule;
        if (isParticleSource(sourceFile)) assertResolvedParticleDependency(sourceFile, target?.resolvedFileName);
      }
      if (ts.isExportDeclaration(node)) {
        const moduleSymbol = node.moduleSpecifier === undefined
          ? undefined
          : checker.getSymbolAtLocation(node.moduleSpecifier);
        const exportClause = node.exportClause;
        const privateExports = moduleSymbol === undefined
          ? exportClause !== undefined && ts.isNamedExports(exportClause)
            ? exportClause.elements
              .map((element) => checker.getSymbolAtLocation(element.propertyName ?? element.name))
              .filter((symbol): symbol is ts.Symbol => symbol !== undefined && isPrivateParticleSymbol(symbol))
            : []
          : exportClause !== undefined && ts.isNamedExports(exportClause)
            ? exportClause.elements
              .map((element) => checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === (element.propertyName?.text ?? element.name.text)))
              .filter((symbol): symbol is ts.Symbol => symbol !== undefined && isPrivateParticleSymbol(symbol))
            : moduleExportsPrivateSymbols(moduleSymbol);
        if (privateExports.length > 0) throw new Error(`INTERNAL_EXPORT_LEAK:${sourceFile.fileName}`);
      }
    });
    ts.forEachChild(sourceFile, function visit(node): void {
      if (isParticleSource(sourceFile)) assertNoForbiddenGlobalReference(sourceFile, node);
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "WeakMap") {
        const symbol = checker.getSymbolAtLocation(node.expression);
        const targetFile = symbol === undefined ? undefined : declarationFile(checker, symbol);
        if (targetFile === undefined || !targetFile.replaceAll("\\", "/").includes("lib.")) throw new Error(`WEAKMAP_NOT_RESOLVED:${sourceFile.fileName}`);
        weakMapRegistryFiles.add(sourceFile.fileName);
      }
      ts.forEachChild(node, visit);
    });
  }

  expect([...internalImporters].every((file) => file.replaceAll("\\", "/").includes("/src/ai/particles/"))).toBe(true);
  expect(weakMapRegistryFiles.size).toBe(1);
  expect([...weakMapRegistryFiles][0]!.replaceAll("\\", "/").endsWith("/src/ai/particles/particleBankInternals.ts")).toBe(true);

  const internalsSource = particleFiles.find((file) => file.fileName.replaceAll("\\", "/").endsWith("/src/ai/particles/particleBankInternals.ts"));
  if (internalsSource === undefined) throw new Error("PARTICLE_INTERNALS_SOURCE_MISSING");
  const internalsExports = checker.getExportsOfModule(moduleSymbol(checker, internalsSource)).map((symbol) => symbol.name).sort();
  expect(internalsExports).toEqual(["ParticleBankInternals", "ParticleRecord", "createParticleBankHandle", "readParticleBankInternals"]);

  return {
    inputProperties: exportedTypeProperties(checker, files, "/src/ai/particles/contracts.ts", "ParticleBankBuildInput"),
    bankProperties: exportedTypeProperties(checker, files, "/src/ai/particles/contracts.ts", "ParticleBank"),
    summaryProperties: exportedTypeProperties(checker, files, "/src/ai/particles/contracts.ts", "PrivateParticleSummary"),
    internalImporters: [...internalImporters].sort(),
    weakMapRegistryFiles: [...weakMapRegistryFiles].sort(),
  };
}

beforeAll(async () => {
  const base = makePrivacyFixture();
  const internals = await import(/* @vite-ignore */ particleInternalsPath) as InternalsModule;
  const bank = internals.createParticleBankHandle(base.bank, {
    records: [{ particleId: "privacy-particle-0", scenario: base.scenario, normalizedWeight: 1 }],
  });
  fixture = { ...base, bank, internals };
  astAudit = runAstPrivacyAudit();
});

describe("particle bank privacy boundary", () => {
  test("builder input cannot contain RoomState or full hands", () => {
    expect(astAudit.inputProperties).not.toEqual(expect.arrayContaining(["RoomState", "hands", "initialHands"]));
    expect(astAudit.inputProperties).toEqual(expect.arrayContaining(["initialLedger", "baseLedger", "ownCurrentHand", "particleSeed"]));
  });

  test("particle outputs never expose partner or opponent real hand references", () => {
    const recordScenario = fixture.scenario;
    const bank = fixture.bank;
    expectNoObjectReference(bank, recordScenario);
    expect(canonicalJson(bank)).not.toContain(recordScenario.initialDeal.hands[2]![0]!.id);
    expect(canonicalJson(bank)).not.toContain(recordScenario.initialDeal.hands[3]![0]!.id);
  });

  test("bank metadata does not contain raw assignments weights seed or private hands", () => {
    expect(astAudit.bankProperties).toEqual([
      "config",
      "effectiveSampleSize",
      "particleCount",
      "schemaVersion",
      "snapshot",
      "status",
      "summary",
    ]);
    expect(astAudit.summaryProperties).not.toEqual(expect.arrayContaining(["seed", "rawWeights", "assignments", "hands", "scenarios"]));
    assertNoForbiddenPublicKey(fixture.bank);
    expect(canonicalJson(fixture.bank)).not.toContain("particleSeed");
    expect(canonicalJson(fixture.bank)).not.toContain("seedHash");
  });

  test("ParticleBank is absent from PublicRoom-shaped serialization", () => {
    const publicRoom = getPublicRoom(fixture.room, 0, { ensurePlans: false });
    assertNoForbiddenPublicKey(publicRoom);
    expect(canonicalJson(publicRoom)).not.toContain("ParticleBank");
  });

  test("ParticleBank is absent from public replay document serialization", () => {
    const rebuilt = rebuildPublicLedger(fixture.replayDocument);
    assertNoForbiddenPublicKey(fixture.replayDocument);
    assertNoForbiddenPublicKey(rebuilt);
    expect(canonicalJson(fixture.replayDocument)).not.toContain("ParticleBank");
    expect(canonicalJson(rebuilt)).not.toContain("ParticleScenario");
  });

  test("ParticleBank is absent from HardPublicLedger and public event payloads", () => {
    const publicPayload = {
      ledger: fixture.initialLedger,
      events: fixture.room.publicEvents ?? [],
    };
    assertNoForbiddenPublicKey(publicPayload);
    expect(canonicalJson(publicPayload)).not.toContain("ParticleBank");
    expect(canonicalJson(publicPayload)).not.toContain("hiddenTransferAssignments");
  });

  test("public serialization contains no hiddenTransferAssignments or ParticleScenario internals", () => {
    const serialized = canonicalJson({
      publicRoom: getPublicRoom(fixture.room, 0, { ensurePlans: false }),
      replay: fixture.replayDocument,
      ledger: fixture.initialLedger,
      events: fixture.room.publicEvents ?? [],
    });
    expect(serialized).not.toContain("hiddenTransferAssignments");
    expect(serialized).not.toContain("ParticleScenario");
    expect(serialized).not.toContain("ParticleRecord");
    expect(serialized).not.toContain("ParticleBankInternals");
  });

  test("unknown or fake bank handle returns undefined without exposing scenario", () => {
    const read = fixture.internals.readParticleBankInternals;
    const privateData = read(fixture.bank);
    expect(privateData).toBeDefined();
    expect(privateData?.records).toHaveLength(1);
    expect(privateData?.records[0]?.scenario).toEqual(fixture.scenario);
    expect(privateData?.records[0]?.scenario).not.toBe(fixture.scenario);
    expect(Object.isFrozen(privateData)).toBe(true);
    expect(Object.isFrozen(privateData?.records)).toBe(true);
    const fake = clone(fixture.bank) as ParticleBank;
    expect(read(fake)).toBeUndefined();
    expect(read({} as unknown as ParticleBank)).toBeUndefined();
    expect(astAudit.internalImporters.every((file) => file.replaceAll("\\", "/").includes("/src/ai/particles/"))).toBe(true);
    expect(astAudit.weakMapRegistryFiles).toHaveLength(1);
  });
});
