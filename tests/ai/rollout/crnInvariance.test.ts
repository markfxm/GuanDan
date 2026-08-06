import { describe, expect, test } from "vitest";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCrnView } from "../../../src/ai/rollout/crn";
import {
  canonicalCrnDomainBytes,
  canonicalCrnValueBytes,
  createCanonicalRandomDomainLabel,
  createCanonicalSemanticKey,
  createCrnCoordinate,
  createUnpairedSemanticKey,
  deriveRandomDomain,
} from "../../../src/ai/rollout/identity";
import type {
  CanonicalRandomDomain,
  CanonicalSemanticKey,
  CrnCoordinate,
} from "../../../src/ai/rollout/contracts";

const ROOT_IDENTITY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const SCENARIO_IDENTITY = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
const REPLICATE_IDENTITY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; failure: unknown }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unexpected failure");
  return result.value;
}

function failure(result: { ok: true; value: unknown } | { ok: false; failure: unknown }): unknown {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected typed failure");
  return result.failure;
}

function unwrapView(result: { ok: true; view: { value(key: CanonicalSemanticKey): number } } | { ok: false; failure: unknown }): { value(key: CanonicalSemanticKey): number } {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unexpected failure");
  return result.view;
}

function coordinateInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rootIdentity: ROOT_IDENTITY,
    scenarioIdentity: SCENARIO_IDENTITY,
    replicateIdentity: REPLICATE_IDENTITY,
    ply: 7,
    actingSeat: 2,
    randomDomain: "policy-action-v1",
    ...overrides,
  };
}

function coordinate(overrides: Record<string, unknown> = {}): CrnCoordinate {
  return unwrap(createCrnCoordinate(coordinateInput(overrides)));
}

function viewFor(input: Record<string, unknown> = {}): { coordinate: CrnCoordinate; view: { value(key: CanonicalSemanticKey): number } } {
  const currentCoordinate = coordinate(input);
  const randomDomain = deriveRandomDomain(currentCoordinate);
  const result = createCrnView({ coordinate: currentCoordinate, randomDomain });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`unexpected failure: ${result.failure.kind}`);
  return { coordinate: currentCoordinate, view: result.view };
}

function key(value: string): CanonicalSemanticKey {
  return unwrap(createCanonicalSemanticKey(value));
}

function domainLabel(value: string) {
  return unwrap(createCanonicalRandomDomainLabel(value));
}

function bytes(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("D2F keyed CRN invariance and validation", () => {
  test("is stateless, frozen, and stable for repeated and reordered calls", () => {
    const first = viewFor().view;
    const second = viewFor().view;
    const a = key("policy-action:play:single:H7-1");
    const b = key("policy-action:pass");

    const firstA = first.value(a);
    const firstB = first.value(b);
    expect(first.value(a)).toBe(firstA);
    expect(first.value(b)).toBe(firstB);
    expect(second.value(b)).toBe(firstB);
    expect(second.value(a)).toBe(firstA);
    expect(Number.isFinite(firstA)).toBe(true);
    expect(firstA).toBeGreaterThanOrEqual(0);
    expect(firstA).toBeLessThan(1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.keys(first)).toEqual(["value"]);
    expect(Object.getOwnPropertyNames(first)).not.toEqual(expect.arrayContaining(["seed", "digest", "tape", "cursor", "next"]));
  });

  test("does not retain caller mutations and equivalent views are identical", () => {
    const input = coordinateInput();
    const created = createCrnCoordinate(input);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("coordinate creation failed");
    const randomDomain = deriveRandomDomain(created.value);
    const viewResult = createCrnView({ coordinate: created.value, randomDomain });
    expect(viewResult.ok).toBe(true);
    if (!viewResult.ok) throw new Error("view creation failed");
    const semanticKey = key("policy-action:play:single:H7-1");
    const before = viewResult.view.value(semanticKey);

    input.randomDomain = "mutated-after-creation";
    input.ply = 99;
    expect(viewResult.view.value(semanticKey)).toBe(before);
    expect(Object.isFrozen(created.value)).toBe(true);
    expect(Object.isFrozen(viewResult)).toBe(true);
    expect(Object.isFrozen(viewResult.view)).toBe(true);
  });

  test.each([
    ["rootIdentity", { rootIdentity: "111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000" }],
    ["scenarioIdentity", { scenarioIdentity: "111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000" }],
    ["replicateIdentity", { replicateIdentity: "111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000" }],
    ["ply", { ply: 8 }],
    ["actingSeat", { actingSeat: 1 }],
    ["randomDomain", { randomDomain: "policy-other-v1" }],
  ] as const)("changes canonical domain bytes when %s changes", (_field, override) => {
    expect(bytes(canonicalCrnDomainBytes(coordinate()))).not.toBe(bytes(canonicalCrnDomainBytes(coordinate(override))));
  });

  test("changes canonical value bytes for semantic keys and preserves tuple boundaries", () => {
    const current = coordinate();
    const randomDomain = deriveRandomDomain(current);
    expect(bytes(canonicalCrnValueBytes(randomDomain, key("event:a")))).not.toBe(bytes(canonicalCrnValueBytes(randomDomain, key("event:b"))));
    expect(bytes(canonicalCrnValueBytes(randomDomain, key("ab")))).not.toBe(bytes(canonicalCrnValueBytes(randomDomain, key("a"))));
  });

  test("pairs candidates without accepting candidate identity or order", async () => {
    const candidates = ["candidate-b", "candidate-a"];
    const current = coordinate();
    const randomDomain = deriveRandomDomain(current);
    const semanticKey = key("policy-action:play:single:H7-1");
    const expected = createCrnView({ coordinate: current, randomDomain });
    expect(expected.ok).toBe(true);
    if (!expected.ok) throw new Error("view creation failed");

    const candidateOrderValues = candidates.map(() => expected.view.value(semanticKey));
    const reversedValues = [...candidates].reverse().map(() => expected.view.value(semanticKey));
    const completionValues = await Promise.all(candidates.map((candidate, index) => new Promise<number>((resolvePromise) => {
      setTimeout(() => resolvePromise(expected.view.value(semanticKey)), index === 0 ? 2 : 0);
    })));

    expect(candidateOrderValues).toEqual([expected.view.value(semanticKey), expected.view.value(semanticKey)]);
    expect(reversedValues).toEqual(candidateOrderValues);
    expect(completionValues.sort()).toEqual(candidateOrderValues.sort());
  });

  test("does not depend on scenario scheduling order", () => {
    const scenarios = [0, 1, 2].map((replicateOrdinal) => coordinate({ replicateIdentity: REPLICATE_IDENTITY.slice(0, 62) + replicateOrdinal.toString(16).padStart(2, "0") }));
    const semanticKey = key("policy-action:play:single:H7-1");
    const valuesInOrder = scenarios.map((current) => {
      const randomDomain = deriveRandomDomain(current);
      return unwrapView(createCrnView({ coordinate: current, randomDomain })).value(semanticKey);
    });
    const valuesOutOfOrder = [...scenarios].reverse().map((current) => {
      const randomDomain = deriveRandomDomain(current);
      return unwrapView(createCrnView({ coordinate: current, randomDomain })).value(semanticKey);
    }).reverse();

    expect(valuesOutOfOrder).toEqual(valuesInOrder);
  });

  test("validates label, key, and unpaired grammar without substring heuristics", () => {
    expect(domainLabel("!")).toBe("!");
    expect(domainLabel("a".repeat(128))).toHaveLength(128);
    expect(key("a".repeat(256))).toHaveLength(256);
    expect(key("candidate")).toBe("candidate");
    expect(key("worker")).toBe("worker");
    expect(unwrap(createUnpairedSemanticKey("public-pass"))).toBe("unpaired:public-pass");

    for (const [input, expected] of [
      ["", { kind: "invalid-random-domain-label", reason: "empty" }],
      [" ", { kind: "invalid-random-domain-label", reason: "non-printable-ascii" }],
      ["a".repeat(129), { kind: "invalid-random-domain-label", reason: "too-long" }],
      ["é", { kind: "invalid-random-domain-label", reason: "non-printable-ascii" }],
    ] as const) expect(failure(createCanonicalRandomDomainLabel(input))).toEqual(expected);

    for (const [input, expected] of [
      ["", { kind: "invalid-semantic-key", reason: "empty" }],
      ["\u0000", { kind: "invalid-semantic-key", reason: "non-printable-ascii" }],
      ["a".repeat(257), { kind: "invalid-semantic-key", reason: "too-long" }],
    ] as const) expect(failure(createCanonicalSemanticKey(input))).toEqual(expected);

    for (const [eventKind, expected] of [
      ["", { kind: "invalid-unpaired-event-key", reason: "empty-event-kind" }],
      ["Public-Pass", { kind: "invalid-unpaired-event-key", reason: "invalid-event-kind" }],
      ["public_pass", { kind: "invalid-unpaired-event-key", reason: "invalid-event-kind" }],
      ["public/pass", { kind: "invalid-unpaired-event-key", reason: "invalid-event-kind" }],
      ["candidate-0", { kind: "invalid-unpaired-event-key", reason: "candidate-data" }],
      ["worker-1", { kind: "invalid-unpaired-event-key", reason: "candidate-data" }],
      ["counter-2", { kind: "invalid-unpaired-event-key", reason: "candidate-data" }],
      ["index-3", { kind: "invalid-unpaired-event-key", reason: "candidate-data" }],
    ] as const) expect(failure(createUnpairedSemanticKey(eventKind))).toEqual(expected);
  });

  test.each([
    ["rootIdentity", "A".repeat(64), { kind: "invalid-root-identity", reason: "uppercase-hex" }],
    ["scenarioIdentity", "f".repeat(63), { kind: "invalid-scenario-identity", reason: "wrong-length" }],
    ["replicateIdentity", "g".repeat(64), { kind: "invalid-replicate-identity", reason: "non-hex" }],
    ["ply", -0, { kind: "invalid-decision-identity", reason: "negative-zero" }],
    ["ply", -1, { kind: "invalid-decision-identity", reason: "negative" }],
    ["ply", 0.5, { kind: "invalid-decision-identity", reason: "non-integer" }],
    ["ply", Number.MAX_SAFE_INTEGER + 1, { kind: "invalid-decision-identity", reason: "unsafe-integer" }],
    ["ply", Number.NaN, { kind: "invalid-decision-identity", reason: "non-finite" }],
    ["ply", Number.POSITIVE_INFINITY, { kind: "invalid-decision-identity", reason: "non-finite" }],
    ["actingSeat", 4, { kind: "invalid-acting-seat", reason: "unknown-seat" }],
    ["actingSeat", 0.5, { kind: "invalid-acting-seat", reason: "fractional-seat" }],
    ["actingSeat", -0, { kind: "invalid-acting-seat", reason: "negative-zero-seat" }],
  ] as const)("returns typed failure for invalid %s", (field, value, expected) => {
    expect(failure(createCrnCoordinate(coordinateInput({ [field]: value })))).toEqual(expected);
  });

  test("rejects malformed envelopes without invoking getters or returning partial values", () => {
    const missing = coordinateInput();
    delete missing.ply;
    expect(failure(createCrnCoordinate(missing))).toEqual({ kind: "malformed-coordinate-envelope", field: "coordinate.ply" });

    expect(failure(createCrnCoordinate({ ...coordinateInput(), extra: true }))).toEqual({ kind: "malformed-coordinate-envelope", field: "coordinate" });

    const symbolInput = coordinateInput();
    Object.defineProperty(symbolInput, Symbol("unexpected"), { value: true, enumerable: true });
    expect(failure(createCrnCoordinate(symbolInput))).toEqual({ kind: "malformed-coordinate-envelope", field: "coordinate" });

    let getterCalls = 0;
    const getterInput = coordinateInput();
    Object.defineProperty(getterInput, "ply", { get: () => { getterCalls += 1; return 7; }, enumerable: true });
    expect(() => createCrnCoordinate(getterInput)).not.toThrow();
    expect(failure(createCrnCoordinate(getterInput))).toEqual({ kind: "malformed-coordinate-envelope", field: "coordinate.ply" });
    expect(getterCalls).toBe(0);

    const customPrototype = Object.create({ inherited: true }) as Record<string, unknown>;
    Object.assign(customPrototype, coordinateInput());
    expect(failure(createCrnCoordinate(customPrototype))).toEqual({ kind: "malformed-coordinate-envelope", field: "coordinate" });

    const candidateContaminated = { ...coordinateInput(), candidateId: "candidate-a" };
    expect(failure(createCrnCoordinate(candidateContaminated))).toEqual({ kind: "candidate-identity-contamination", location: "coordinate" });

    const cyclic = coordinateInput();
    cyclic.rootIdentity = cyclic;
    expect(() => createCrnCoordinate(cyclic)).not.toThrow();
    expect(failure(createCrnCoordinate(cyclic))).toEqual({ kind: "invalid-root-identity", reason: "non-hex" });

    const failureResult = createCrnCoordinate(missing);
    expect(failureResult).toEqual({ ok: false, failure: { kind: "malformed-coordinate-envelope", field: "coordinate.ply" } });
    expect(failureResult).not.toHaveProperty("value");
  });

  test("keeps failure diagnostics free of secret material", () => {
    const result = createCrnView({
      coordinate: coordinateInput({ rootIdentity: "not-a-root" }),
      randomDomain: "not-a-digest",
    });
    const diagnostics = JSON.stringify(result);
    expect(diagnostics).not.toContain(ROOT_IDENTITY);
    expect(diagnostics).not.toContain(SCENARIO_IDENTITY);
    expect(diagnostics).not.toContain(REPLICATE_IDENTITY);
    expect(diagnostics).not.toContain("not-a-digest");
    expect(diagnostics).not.toContain("seed");
    expect(diagnostics).not.toContain("cursor");
    expect(diagnostics).not.toContain("tape");
  });

  test("maps zero and maximum synthetic u53 values with the frozen arithmetic", () => {
    const valueFromDigest = (digest: string): number => Number(BigInt(`0x${digest.slice(0, 16)}`) >> 11n) / 9007199254740992;
    expect(valueFromDigest("00".repeat(32))).toBe(0);
    expect(valueFromDigest("ff".repeat(32))).toBeLessThan(1);
    expect(Number.isFinite(valueFromDigest("ff".repeat(32)))).toBe(true);
  });

  test("uses Compiler API symbol resolution for the candidate exclusion gate", () => {
    const root = resolve(__dirname, "../../../src/ai/rollout");
    const files = [resolve(root, "identity.ts"), resolve(root, "crn.ts")];
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    });
    const checker = program.getTypeChecker();
    const forbidden = new Set([
      "candidateId",
      "CanonicalCandidateDecisionAssociationIdentity",
      "canonicalCandidateDecisionAssociationIdentity",
    ]);
    const resolvedForbidden: string[] = [];
    for (const file of files) {
      const source = program.getSourceFile(file);
      if (!source) throw new Error(`missing source: ${file}`);
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && forbidden.has(node.text) && checker.getSymbolAtLocation(node)) resolvedForbidden.push(node.text);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(resolvedForbidden).toEqual([]);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/node:crypto|from ["']crypto["']|Math\.random|Date\.now|performance\.now|localeCompare|\bnext\s*\(|\bcursor\b|\btape\b/);
      expect(source).not.toMatch(/Room|ParticleBank|Shadow|policy|aggregation|kernel/);
    }
  });
});
