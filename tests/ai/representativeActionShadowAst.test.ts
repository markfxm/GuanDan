import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import * as ts from "typescript";

const productionRelativePaths = [
  "src/ai/contracts.ts",
  "src/ai/config.ts",
  "src/ai/diagnostics/aiPlanningDiagnostics.ts",
  "src/ai/tactics/representativeActionShadowObserver.ts",
  "src/ai/aiDecisionEngine.ts",
  "src/ai/tactics/representativeActionReducer.ts",
  "src/ai/tactics/actionGenerator.ts",
  "src/ai/tactics/actionEvaluator.ts",
] as const;

const sourceRoot = [resolve(process.cwd(), ".worktrees/d2e-shadow-integration-source"), resolve(process.cwd())]
  .find((root) => existsSync(resolve(root, productionRelativePaths[0]))) ?? resolve(process.cwd());

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").toLowerCase();
}

function sourceFileFor(program: ts.Program, relativePath: string): ts.SourceFile {
  const expected = normalizePath(resolve(sourceRoot, relativePath));
  const sourceFile = program.getSourceFiles().find((candidate) => normalizePath(candidate.fileName) === expected);
  if (sourceFile === undefined) throw new Error(`Missing AST source file ${relativePath}`);
  return sourceFile;
}

function createProgram(): ts.Program {
  const rootNames = productionRelativePaths.map((relativePath) => resolve(sourceRoot, relativePath));
  return ts.createProgram(rootNames, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    setParentNodes: true,
  });
}

function identifierName(node: ts.Node): string | undefined {
  return ts.isIdentifier(node) ? node.text : undefined;
}

function callName(node: ts.CallExpression): string | undefined {
  return ts.isIdentifier(node.expression)
    ? node.expression.text
    : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined;
}

it("locks D2e production import, call-site, data-flow and mode boundaries", () => {
  const program = createProgram();
  const files = productionRelativePaths.map((relativePath) => sourceFileFor(program, relativePath));
  expect(files).toHaveLength(productionRelativePaths.length);

  const contracts = files.find((file) => normalizePath(file.fileName).endsWith("/src/ai/contracts.ts"))!;
  const config = files.find((file) => normalizePath(file.fileName).endsWith("/src/ai/config.ts"))!;
  const observer = files.find((file) => normalizePath(file.fileName).endsWith("/src/ai/tactics/representativeactionshadowobserver.ts"))!;
  const engine = files.find((file) => normalizePath(file.fileName).endsWith("/src/ai/aidecisionengine.ts"))!;
  const reducer = files.find((file) => normalizePath(file.fileName).endsWith("/src/ai/tactics/representativeactionreducer.ts"));
  expect(reducer).toBeDefined();

  const modeDeclaration = contracts.statements.find((statement): statement is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(statement) && statement.name.text === "RepresentativeActionShadowMode");
  expect(modeDeclaration).toBeDefined();
  expect(ts.isUnionTypeNode(modeDeclaration!.type)).toBe(true);
  const modeMembers = ts.isUnionTypeNode(modeDeclaration!.type)
    ? modeDeclaration!.type.types.map((type) => ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal) ? type.literal.text : "")
    : [];
  expect(modeMembers).toEqual(["disabled", "shadow"]);

  let defaultShadowMode: string | undefined;
  let defaultHardCap: number | undefined;
  const visitConfig = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "DEFAULT_REPRESENTATIVE_ACTION_SHADOW" && node.initializer !== undefined) {
      node.initializer.forEachChild((child) => {
        if (!ts.isObjectLiteralExpression(child)) return;
        for (const property of child.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
          if (property.name.text === "mode" && ts.isStringLiteral(property.initializer)) defaultShadowMode = property.initializer.text;
          if (property.name.text === "hardCap" && ts.isNumericLiteral(property.initializer)) defaultHardCap = Number(property.initializer.text);
        }
      });
    }
    ts.forEachChild(node, visitConfig);
  };
  visitConfig(config);
  expect(defaultShadowMode).toBe("shadow");
  expect(defaultHardCap).toBe(256);

  const imports = files.flatMap((file) => {
    const found: Array<{ file: string; module: string; typeOnly: boolean }> = [];
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) found.push({ file: normalizePath(file.fileName), module: node.moduleSpecifier.text, typeOnly: node.importClause?.isTypeOnly === true });
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  });
  const reducerImports = imports.filter((entry) => entry.module.includes("representativeActionReducer") && !entry.typeOnly);
  expect(new Set(reducerImports.map((entry) => entry.file))).toHaveLength(1);
  expect(reducerImports[0]!.file).toContain("representativeactionshadowobserver.ts");
  const observerImports = imports.filter((entry) => entry.module.includes("representativeActionShadowObserver"));
  expect(observerImports).toHaveLength(1);
  expect(observerImports[0]!.file).toContain("aidecisionengine.ts");

  const calls: Array<{ file: string; name: string; node: ts.CallExpression; expressionStatement: boolean; insideDecideAiAction: boolean }> = [];
  for (const file of files) {
    const visit = (node: ts.Node, parent: ts.Node | undefined, insideDecideAiAction: boolean): void => {
      const nextInsideDecideAiAction = insideDecideAiAction || (ts.isFunctionDeclaration(node) && node.name?.text === "decideAiAction");
      if (ts.isCallExpression(node)) {
        const name = callName(node);
        if (name === "reduceRepresentativeActions" || name === "observeRepresentativeActions" || name === "evaluateActionCandidate") {
          calls.push({ file: normalizePath(file.fileName), name, node, expressionStatement: parent !== undefined && ts.isExpressionStatement(parent), insideDecideAiAction: nextInsideDecideAiAction });
        }
      }
      ts.forEachChild(node, (child) => visit(child, node, nextInsideDecideAiAction));
    };
    visit(file, undefined, false);
  }
  const reducerCalls = calls.filter((entry) => entry.name === "reduceRepresentativeActions");
  expect(reducerCalls).toHaveLength(1);
  expect(reducerCalls[0]!.file).toContain("representativeactionshadowobserver.ts");
  const observerCalls = calls.filter((entry) => entry.name === "observeRepresentativeActions");
  expect(observerCalls).toHaveLength(1);
  expect(observerCalls[0]!.file).toContain("aidecisionengine.ts");
  expect(observerCalls[0]!.expressionStatement).toBe(true);
  expect(observerCalls[0]!.insideDecideAiAction).toBe(true);

  const observerFunction = observer.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === "observeRepresentativeActions");
  expect(observerFunction).toBeDefined();
  const observerReturns: ts.ReturnStatement[] = [];
  const visitReturns = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) observerReturns.push(node);
    ts.forEachChild(node, visitReturns);
  };
  visitReturns(observerFunction!);
  expect(observerReturns.every((statement) => statement.expression === undefined)).toBe(true);

  const candidateDeclarations: ts.VariableDeclaration[] = [];
  const candidateAssignments: ts.BinaryExpression[] = [];
  const reducedCandidates: ts.Identifier[] = [];
  const evaluatorCandidateMaps: ts.CallExpression[] = [];
  const visitEngine = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "candidates") candidateDeclarations.push(node);
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left) && node.left.text === "candidates") candidateAssignments.push(node);
    if (ts.isIdentifier(node) && node.text === "reducedCandidates") reducedCandidates.push(node);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && ts.isIdentifier(node.expression.name) && node.expression.expression.text === "candidates" && node.expression.name.text === "map") evaluatorCandidateMaps.push(node);
    ts.forEachChild(node, visitEngine);
  };
  visitEngine(engine);
  expect(candidateDeclarations).toHaveLength(1);
  const candidateInitializer = candidateDeclarations[0]!.initializer;
  expect(candidateInitializer).toBeDefined();
  expect(candidateInitializer !== undefined && ts.isCallExpression(candidateInitializer)).toBe(true);
  if (candidateInitializer === undefined || !ts.isCallExpression(candidateInitializer)) throw new Error("candidates initializer is not a call");
  expect(callName(candidateInitializer)).toBe("generateActionCandidates");
  expect(candidateAssignments).toHaveLength(0);
  expect(reducedCandidates).toHaveLength(0);
  expect(evaluatorCandidateMaps).toHaveLength(1);

  const mappingFiles = new Set<string>();
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && (node.text === "representativeInputIndices" || node.text === "representativeByInputIndex")) mappingFiles.add(normalizePath(file.fileName));
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  expect(mappingFiles).toHaveLength(1);
  expect([...mappingFiles][0]).toContain("representativeactionreducer.ts");

  const observerForbiddenTokens: string[] = [];
  const visitObserverForbidden = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === "structuredClone") observerForbiddenTokens.push(node.text);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "JSON") observerForbiddenTokens.push(node.getText());
    ts.forEachChild(node, visitObserverForbidden);
  };
  visitObserverForbidden(observer);
  expect(observerForbiddenTokens).toHaveLength(0);

  const activeModeNodes: ts.StringLiteral[] = [];
  const visitActive = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) && node.text === "active") activeModeNodes.push(node);
    ts.forEachChild(node, visitActive);
  };
  for (const file of [contracts, config, observer, engine]) visitActive(file);
  expect(activeModeNodes).toHaveLength(0);

  const d2eDiagnosticsReadFiles = new Set<string>();
  const visitDiagnosticsReads = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === "representativeActionShadow") d2eDiagnosticsReadFiles.add(normalizePath(currentDiagnosticsFile!.fileName));
    ts.forEachChild(node, visitDiagnosticsReads);
  };
  let currentDiagnosticsFile: ts.SourceFile | undefined;
  for (const file of files) {
    currentDiagnosticsFile = file;
    visitDiagnosticsReads(file);
  }
  expect([...d2eDiagnosticsReadFiles].some((file) => file.includes("actionevaluator.ts"))).toBe(false);
  expect([...d2eDiagnosticsReadFiles].some((file) => file.includes("actiongenerator.ts"))).toBe(false);
});
