import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL as NodeURL } from "node:url";
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
  "src/ai/planning/planSelector.ts",
  "src/game/room.ts",
] as const;

const testFilePath = import.meta.url.startsWith("file:")
  ? fileURLToPath(import.meta.url)
  : resolve(import.meta.url);
const sourceRoot = import.meta.url.startsWith("file:")
  ? resolve(fileURLToPath(new NodeURL("../..", import.meta.url)))
  : resolve(dirname(testFilePath), "../..");

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").toLowerCase();
}

function expectedPath(relativePath: string): string {
  return normalizePath(resolve(sourceRoot, relativePath));
}

function parseSourceFile(relativePath: string): ts.SourceFile {
  const fileName = resolve(sourceRoot, relativePath);
  const text = readFileSync(fileName, "utf8");
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function createProgram(): ts.Program {
  return ts.createProgram(productionRelativePaths.map((relativePath) => resolve(sourceRoot, relativePath)), {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
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

function descendants(node: ts.Node): ts.Node[] {
  const result: ts.Node[] = [];
  const visit = (current: ts.Node): void => {
    result.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return result;
}

function functionDeclaration(file: ts.SourceFile, name: string): ts.FunctionDeclaration {
  const declaration = file.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name,
  );
  if (declaration === undefined) throw new Error(`Missing function ${name}`);
  return declaration;
}

function propertyAccessName(node: ts.Node): string | undefined {
  return ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
}

it("locks D2e production import, call-site, data-flow and mode boundaries", () => {
  const testFile = normalizePath(testFilePath);
  expect(normalizePath(resolve(sourceRoot, "tests/ai/representativeActionShadowAst.test.ts"))).toBe(testFile);

  const program = createProgram();
  const programPaths = new Set(
    program.getSourceFiles().map((file) => normalizePath(file.fileName)),
  );
  const expectedProductionPaths = productionRelativePaths.map(expectedPath);
  expect(expectedProductionPaths).toHaveLength(10);
  expect(expectedProductionPaths.every((file) => programPaths.has(file))).toBe(true);

  const files = productionRelativePaths.map(parseSourceFile);
  expect(files).toHaveLength(productionRelativePaths.length);
  expect(new Set(files.map((file) => normalizePath(file.fileName)))).toEqual(new Set(expectedProductionPaths));

  const bySuffix = (suffix: string): ts.SourceFile => {
    const file = files.find((candidate) => normalizePath(candidate.fileName).endsWith(suffix));
    if (file === undefined) throw new Error(`Missing scanned file ${suffix}`);
    return file;
  };
  const contracts = bySuffix("/src/ai/contracts.ts");
  const config = bySuffix("/src/ai/config.ts");
  const diagnostics = bySuffix("/src/ai/diagnostics/aiplanningdiagnostics.ts");
  const observer = bySuffix("/src/ai/tactics/representativeactionshadowobserver.ts");
  const engine = bySuffix("/src/ai/aidecisionengine.ts");
  const reducer = bySuffix("/src/ai/tactics/representativeactionreducer.ts");
  const generator = bySuffix("/src/ai/tactics/actiongenerator.ts");
  const evaluator = bySuffix("/src/ai/tactics/actionevaluator.ts");
  const selector = bySuffix("/src/ai/planning/planselector.ts");
  const room = bySuffix("/src/game/room.ts");

  const modeDeclaration = contracts.statements.find((statement): statement is ts.TypeAliasDeclaration =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === "RepresentativeActionShadowMode",
  );
  expect(modeDeclaration).toBeDefined();
  expect(ts.isUnionTypeNode(modeDeclaration!.type)).toBe(true);
  const modeMembers = ts.isUnionTypeNode(modeDeclaration!.type)
    ? modeDeclaration!.type.types.map((type) => ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal) ? type.literal.text : "")
    : [];
  expect(modeMembers).toEqual(["disabled", "shadow"]);

  let defaultShadowMode: string | undefined;
  let defaultHardCap: number | undefined;
  for (const node of descendants(config)) {
    if (!ts.isVariableDeclaration(node) || identifierName(node.name) !== "DEFAULT_REPRESENTATIVE_ACTION_SHADOW" || node.initializer === undefined) continue;
    const object = ts.isObjectLiteralExpression(node.initializer)
      ? node.initializer
      : ts.isCallExpression(node.initializer) && callName(node.initializer) === "freeze" && ts.isObjectLiteralExpression(node.initializer.arguments[0])
        ? node.initializer.arguments[0]
        : undefined;
    if (object === undefined) continue;
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
      if (property.name.text === "mode" && ts.isStringLiteral(property.initializer)) defaultShadowMode = property.initializer.text;
      if (property.name.text === "hardCap" && ts.isNumericLiteral(property.initializer)) defaultHardCap = Number(property.initializer.text);
    }
  }
  expect(defaultShadowMode).toBe("shadow");
  expect(defaultHardCap).toBe(256);

  const imports = files.flatMap((file) => descendants(file)
    .filter((node): node is ts.ImportDeclaration => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier))
    .map((node) => ({ file: normalizePath(file.fileName), module: (node.moduleSpecifier as ts.StringLiteral).text, typeOnly: node.importClause?.isTypeOnly === true })));
  const reducerRuntimeImports = imports.filter((entry) => entry.module.includes("representativeActionReducer") && !entry.typeOnly);
  expect(new Set(reducerRuntimeImports.map((entry) => entry.file)).size).toBe(1);
  expect(reducerRuntimeImports[0]!.file).toContain("representativeactionshadowobserver.ts");
  const observerImports = imports.filter((entry) => entry.module.includes("representativeActionShadowObserver"));
  expect(new Set(observerImports.map((entry) => entry.file)).size).toBe(1);
  expect(observerImports[0]!.file).toContain("aidecisionengine.ts");

  const observerFunction = functionDeclaration(observer, "observeRepresentativeActions");
  const engineFunction = functionDeclaration(engine, "decideAiAction");
  const resultDeclarations = descendants(observerFunction).filter((node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && identifierName(node.name) === "result" && node.initializer !== undefined && ts.isCallExpression(node.initializer) && callName(node.initializer) === "reduceRepresentativeActions",
  );
  expect(resultDeclarations).toHaveLength(1);
  const resultDeclaration = resultDeclarations[0]!;
  const resultReferences = descendants(observerFunction).filter((node) =>
    ts.isIdentifier(node) && node.text === "result" && node !== resultDeclaration.name,
  );
  expect(resultReferences).toHaveLength(1);
  const resultReference = resultReferences[0]!;
  expect(ts.isCallExpression(resultReference.parent)).toBe(true);
  const resultConsumer = resultReference.parent as ts.CallExpression;
  expect(callName(resultConsumer)).toBe("summarizeRepresentativeActionResult");
  expect(resultConsumer.arguments[0]).toBe(resultReference);
  expect(resultConsumer.arguments[1]?.getText()).toBe("input.hardCap");

  const summarizeFunction = functionDeclaration(observer, "summarizeRepresentativeActionResult");
  const summarizeReturns = descendants(summarizeFunction).filter((node): node is ts.ReturnStatement => ts.isReturnStatement(node));
  expect(summarizeReturns).toHaveLength(1);
  expect(summarizeReturns[0]!.expression).toBeDefined();
  expect(summarizeReturns[0]!.expression !== undefined && ts.isObjectLiteralExpression(summarizeReturns[0]!.expression)).toBe(true);
  const summarizeForbidden = new Set(["candidates", "candidate", "scored", "selected", "runtime", "AiAction"]);
  expect(descendants(summarizeFunction).some((node) => ts.isIdentifier(node) && summarizeForbidden.has(node.text))).toBe(false);
  expect(descendants(summarizeFunction).some((node) => ts.isCallExpression(node) && ["evaluateActionCandidate", "generateActionCandidates"].includes(callName(node) ?? ""))).toBe(false);

  const candidateDeclarations = descendants(engineFunction).filter((node): node is ts.VariableDeclaration =>
    ts.isVariableDeclaration(node) && identifierName(node.name) === "candidates",
  );
  expect(candidateDeclarations).toHaveLength(1);
  const candidateDeclaration = candidateDeclarations[0]!;
  expect(candidateDeclaration.parent).toBeDefined();
  expect(ts.isVariableDeclarationList(candidateDeclaration.parent)).toBe(true);
  expect((candidateDeclaration.parent as ts.VariableDeclarationList).flags & ts.NodeFlags.Const).not.toBe(0);
  expect(candidateDeclaration.initializer).toBeDefined();
  expect(candidateDeclaration.initializer !== undefined && ts.isCallExpression(candidateDeclaration.initializer)).toBe(true);
  const generationCall = candidateDeclaration.initializer as ts.CallExpression;
  expect(callName(generationCall)).toBe("generateActionCandidates");
  expect(generationCall.arguments).toHaveLength(1);
  expect(identifierName(generationCall.arguments[0]!)).toBe("generationInput");

  const candidateAssignments = descendants(engineFunction).filter((node) => {
    if (!ts.isBinaryExpression(node)) return false;
    if (ts.isIdentifier(node.left)) return node.left.text === "candidates";
    return ts.isElementAccessExpression(node.left) && ts.isIdentifier(node.left.expression) && node.left.expression.text === "candidates";
  });
  expect(candidateAssignments).toHaveLength(0);
  const forbiddenCandidateMethods = new Set(["sort", "reverse", "splice", "push", "pop", "shift", "unshift", "copyWithin", "fill"]);
  const candidateMutations = descendants(engineFunction).filter((node) =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    identifierName(node.expression.expression) === "candidates" && forbiddenCandidateMethods.has(node.expression.name.text),
  );
  expect(candidateMutations).toHaveLength(0);

  const observerStatements = engineFunction.body === undefined ? [] : engineFunction.body.statements.filter((statement): statement is ts.ExpressionStatement =>
    ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && callName(statement.expression) === "observeRepresentativeActions",
  );
  expect(observerStatements).toHaveLength(1);
  const observerStatement = observerStatements[0]!;
  const observerCall = observerStatement.expression as ts.CallExpression;
  expect(observerCall.arguments).toHaveLength(1);
  expect(ts.isObjectLiteralExpression(observerCall.arguments[0])).toBe(true);
  const observerObject = observerCall.arguments[0] as ts.ObjectLiteralExpression;
  const candidatesProperty = observerObject.properties.find((property): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment =>
    (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && ts.isIdentifier(property.name) && property.name.text === "candidates",
  );
  expect(candidatesProperty).toBeDefined();
  const candidatesInitializer = ts.isShorthandPropertyAssignment(candidatesProperty!) ? candidatesProperty!.name : candidatesProperty!.initializer;
  expect(identifierName(candidatesInitializer)).toBe("candidates");
  expect(ts.isSpreadAssignment(candidatesProperty!)).toBe(false);

  const evaluatorMaps = descendants(engineFunction).filter((node): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
    identifierName(node.expression.expression) === "candidates" && node.expression.name.text === "map",
  );
  expect(evaluatorMaps).toHaveLength(1);
  const evaluatorMap = evaluatorMaps[0]!;
  expect(candidateDeclaration.getStart()).toBeLessThan(observerCall.getStart());
  expect(observerCall.getStart()).toBeLessThan(evaluatorMap.getStart());
  const callback = evaluatorMap.arguments[0];
  expect(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)).toBe(true);
  const callbackFunction = callback as ts.ArrowFunction | ts.FunctionExpression;
  expect(callbackFunction.parameters).toHaveLength(1);
  const callbackCandidate = callbackFunction.parameters[0]!.name;
  const evaluateCalls = descendants(callbackFunction).filter((node): node is ts.CallExpression =>
    ts.isCallExpression(node) && callName(node) === "evaluateActionCandidate",
  );
  expect(evaluateCalls).toHaveLength(1);
  expect(identifierName(evaluateCalls[0]!.arguments[0]!)).toBe(identifierName(callbackCandidate));
  expect(identifierName(evaluateCalls[0]!.arguments[1]!)).toBe("generationInput");
  expect(descendants(engineFunction).filter((node): node is ts.CallExpression => ts.isCallExpression(node) && callName(node) === "evaluateActionCandidate")).toHaveLength(1);

  const mappingFiles = new Set<string>();
  for (const file of files) {
    if (descendants(file).some((node) => ts.isIdentifier(node) && ["representativeInputIndices", "representativeByInputIndex"].includes(node.text))) mappingFiles.add(normalizePath(file.fileName));
  }
  expect(mappingFiles.size).toBe(1);
  expect([...mappingFiles][0]).toContain("representativeactionreducer.ts");

  const modeComparisons = descendants(observer).filter((node): node is ts.BinaryExpression =>
    ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left) && identifierName(node.left.expression) === "input" && node.left.name.text === "mode",
  );
  expect(modeComparisons).toHaveLength(2);
  expect(modeComparisons.map((node) => ts.isStringLiteral(node.right) ? node.right.text : "").sort()).toEqual(["disabled", "shadow"]);
  const disabledComparison = modeComparisons.find((node) => ts.isStringLiteral(node.right) && node.right.text === "disabled")!;
  expect(disabledComparison.operatorToken.kind).toBe(ts.SyntaxKind.EqualsEqualsEqualsToken);
  expect(ts.isIfStatement(disabledComparison.parent)).toBe(true);
  const disabledBranch = (disabledComparison.parent as ts.IfStatement).thenStatement;
  expect(ts.isBlock(disabledBranch)).toBe(true);
  const disabledReturn = (disabledBranch as ts.Block).statements.find(ts.isReturnStatement);
  expect(disabledReturn).toBeDefined();
  expect(disabledReturn!.expression).toBeUndefined();
  const shadowComparison = modeComparisons.find((node) => ts.isStringLiteral(node.right) && node.right.text === "shadow")!;
  expect(shadowComparison.operatorToken.kind).toBe(ts.SyntaxKind.ExclamationEqualsEqualsToken);
  expect(ts.isIfStatement(shadowComparison.parent)).toBe(true);
  const nonShadowBranch = (shadowComparison.parent as ts.IfStatement).thenStatement;
  expect(ts.isBlock(nonShadowBranch)).toBe(true);
  expect(descendants(nonShadowBranch).some((node) => ts.isCallExpression(node) && callName(node) === "recordAdapterError")).toBe(true);
  expect(descendants(nonShadowBranch).some((node) => ts.isReturnStatement(node) && node.expression === undefined)).toBe(true);
  expect(resultDeclaration.getStart()).toBeGreaterThan(shadowComparison.getStart());

  const observerForbiddenTokens = descendants(observer).filter((node) =>
    (ts.isIdentifier(node) && node.text === "structuredClone") ||
    (ts.isPropertyAccessExpression(node) && identifierName(node.expression) === "JSON"),
  );
  expect(observerForbiddenTokens).toHaveLength(0);

  const d2ePrivateNames = new Set(["representativeActionShadow", "observerInvocationCount", "reducerAttemptCount", "reducerResultCount"]);
  const downstream = [generator, evaluator, selector, room];
  for (const file of downstream) {
    const reads = descendants(file).filter((node) =>
      (ts.isIdentifier(node) && d2ePrivateNames.has(node.text)) ||
      (ts.isPropertyAccessExpression(node) && d2ePrivateNames.has(node.name.text)),
    );
    expect(reads, `${normalizePath(file.fileName)} reads D2e private diagnostics`).toHaveLength(0);
  }
  const d2eOwners = new Set([
    normalizePath(contracts.fileName),
    normalizePath(config.fileName),
    normalizePath(diagnostics.fileName),
    normalizePath(observer.fileName),
    normalizePath(engine.fileName),
  ]);
  const privateReferences = files.flatMap((file) => descendants(file).filter((node) => ts.isIdentifier(node) && d2ePrivateNames.has(node.text)).map(() => normalizePath(file.fileName)));
  expect(privateReferences.every((file) => d2eOwners.has(file))).toBe(true);
});
