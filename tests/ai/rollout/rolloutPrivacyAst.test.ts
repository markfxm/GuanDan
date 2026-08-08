import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";

const rolloutRoot = path.resolve(process.cwd(), "src/ai/rollout");

describe("D2F rollout privacy structure", () => {
  test("requires the formal Task 4 production boundary files", () => {
    for (const file of ["policy.ts", "kernel.ts", "stateConservation.ts"]) {
      expect(existsSync(path.join(rolloutRoot, file)), file).toBe(true);
    }
  });

  test("does not restore obsolete rescue paths or Task 5-9 production symbols", () => {
    for (const file of ["rolloutPolicy.ts", "rolloutKernel.ts"]) {
      expect(existsSync(path.join(rolloutRoot, file)), file).toBe(false);
    }
    const existingProductionFiles = ["policy.ts", "kernel.ts", "stateConservation.ts"];
    for (const file of existingProductionFiles) {
      const filePath = path.join(rolloutRoot, file);
      if (!existsSync(filePath)) continue;
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toMatch(/aggregation|shadowObserver|orchestrator|benchmark|Task5|Task6|Task7|Task8|Task9/);
    }
  });

  test("enforces seat-local policy and isolated-kernel boundaries through resolved symbols", () => {
    const sourceRoot = path.resolve(process.cwd(), "src");
    const tsconfigPath = path.resolve(process.cwd(), "tsconfig.json");
    const configRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configRead.error !== undefined) throw new Error("TSCONFIG_READ_FAILED");
    const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, process.cwd());
    const rootNames = [
      path.join(sourceRoot, "ai/rollout/policy.ts"),
      path.join(sourceRoot, "ai/rollout/kernel.ts"),
      path.join(sourceRoot, "ai/rollout/stateConservation.ts"),
      path.join(sourceRoot, "ai/rollout/contracts.ts"),
      path.join(sourceRoot, "ai/rollout/identity.ts"),
      path.join(sourceRoot, "ai/rollout/crn.ts"),
    ];
    const program = ts.createProgram({ rootNames, options: parsed.options });
    const checker = program.getTypeChecker();
    const normalize = (value: string): string => value.replaceAll("\\", "/");
    const sourcePath = (file: ts.SourceFile): string => normalize(file.fileName);
    const declarationFile = (symbol: ts.Symbol): string | undefined => {
      const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return resolved.declarations?.[0]?.getSourceFile().fileName;
    };
    const resolveSymbol = (symbol: ts.Symbol): ts.Symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const files = rootNames.map((name) => program.getSourceFile(name)).filter((file): file is ts.SourceFile => file !== undefined);
    const policyFile = files.find((file) => sourcePath(file).endsWith("/src/ai/rollout/policy.ts"));
    const kernelFile = files.find((file) => sourcePath(file).endsWith("/src/ai/rollout/kernel.ts"));
    const contractsFile = files.find((file) => sourcePath(file).endsWith("/src/ai/rollout/contracts.ts"));
    expect(policyFile).toBeDefined();
    expect(kernelFile).toBeDefined();
    expect(contractsFile).toBeDefined();
    if (policyFile === undefined || kernelFile === undefined || contractsFile === undefined) return;

    const contractsModule = checker.getSymbolAtLocation(contractsFile);
    if (contractsModule === undefined) throw new Error("CONTRACT_MODULE_SYMBOL_MISSING");
    const contractExports = new Map(checker.getExportsOfModule(contractsModule).map((symbol) => [symbol.name, resolveSymbol(symbol)]));
    const privateContractNames = new Set([
      "RolloutScenario",
      "RolloutScenarioSourceInput",
      "RolloutScenarioSourceResult",
      "RolloutReplicateInput",
      "RolloutPublicState",
    ]);
    const importSymbols = (file: ts.SourceFile): readonly ts.Symbol[] => {
      const symbols: ts.Symbol[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && node.importClause?.namedBindings !== undefined && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const element of node.importClause.namedBindings.elements) {
            const symbol = checker.getSymbolAtLocation(element.name);
            if (symbol !== undefined) symbols.push(resolveSymbol(symbol));
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return symbols;
    };
    const importedModulePaths = (file: ts.SourceFile): readonly string[] => {
      const paths: string[] = [];
      for (const statement of file.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const resolved = ts.resolveModuleName(statement.moduleSpecifier.text, file.fileName, parsed.options, ts.sys).resolvedModule;
        if (resolved !== undefined) paths.push(normalize(resolved.resolvedFileName));
      }
      return paths;
    };

    const policyImports = importedModulePaths(policyFile);
    expect(policyImports.some((file) => file.includes("/src/ai/particles/") || file.endsWith("/src/ai/rollout/kernel.ts") || file.endsWith("/src/ai/rollout/particleScenarioSource.ts"))).toBe(false);
    expect(importSymbols(policyFile).some((symbol) => privateContractNames.has(symbol.name) && contractExports.get(symbol.name) === symbol)).toBe(false);

    const kernelImports = importedModulePaths(kernelFile);
    expect(kernelImports.some((file) => file.includes("/src/ai/particles/") || file.endsWith("/src/ai/rollout/particleScenarioSource.ts"))).toBe(false);
    const kernelPrivateImports = importSymbols(kernelFile).filter((symbol) => privateContractNames.has(symbol.name));
    expect(kernelPrivateImports.every((symbol) => contractExports.get(symbol.name) === symbol)).toBe(true);

    const bannedIdentifiers = new Set(["worker", "workers", "counter", "cursor", "tape", "next"]);
    const inspectCalls = (file: ts.SourceFile): { randomOrClock: string[]; bannedIdentifiers: string[]; crnCoordinates: ts.CallExpression[] } => {
      const randomOrClock: string[] = [];
      const identifiers: string[] = [];
      const crnCoordinates: ts.CallExpression[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && bannedIdentifiers.has(node.text)) identifiers.push(node.text);
        if (ts.isCallExpression(node)) {
          const expression = node.expression;
          if (ts.isPropertyAccessExpression(expression)) {
            const owner = expression.expression.getText(file);
            const property = expression.name.text;
            if ((owner === "Math" && property === "random") || (owner === "Date" && property === "now") || (owner === "performance" && property === "now") || property === "bind" || property === "next") randomOrClock.push(`${owner}.${property}`);
          } else if (ts.isIdentifier(expression) && expression.text === "createCrnCoordinate") {
            crnCoordinates.push(node);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      return { randomOrClock, bannedIdentifiers: identifiers, crnCoordinates };
    };
    const policyInspection = inspectCalls(policyFile);
    const kernelInspection = inspectCalls(kernelFile);
    expect(policyInspection.randomOrClock).toEqual([]);
    expect(kernelInspection.randomOrClock).toEqual([]);
    expect(policyInspection.bannedIdentifiers).toEqual([]);
    expect(kernelInspection.bannedIdentifiers).toEqual([]);
    expect(kernelInspection.crnCoordinates).toHaveLength(1);
    const coordinateArgument = kernelInspection.crnCoordinates[0]?.arguments[0];
    expect(coordinateArgument !== undefined && ts.isObjectLiteralExpression(coordinateArgument)).toBe(true);
    if (coordinateArgument === undefined || !ts.isObjectLiteralExpression(coordinateArgument)) return;
    const coordinateProperties = coordinateArgument.properties
      .filter((property): property is ts.PropertyAssignment | ts.ShorthandPropertyAssignment => (
        (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) || ts.isShorthandPropertyAssignment(property)
      ))
      .map((property) => ts.isIdentifier(property.name) ? property.name.text : property.name.getText());
    expect(coordinateProperties).toEqual(["rootIdentity", "scenarioIdentity", "replicateIdentity", "ply", "actingSeat", "randomDomain"]);
    expect(coordinateProperties).not.toContain("candidateId");

    const forbiddenPlanningImports = [...importedModulePaths(policyFile), ...importedModulePaths(kernelFile)].filter((file) => /(?:room|planning|formal.?ai|orchestrator)/i.test(file));
    expect(forbiddenPlanningImports).toEqual([]);
  });
});
