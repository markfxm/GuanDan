import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { Card } from "../../src/engine/cards";
import type { CardGroup } from "../../src/engine/groups";
import type { HandPlan } from "../../src/ai/contracts";
import type { LightweightPublicEvidence } from "../../src/ai/belief/lightweightPublicEvidence";
import {
  deriveD2cPlanPriorityQuota,
  type D2cEvidenceSnapshotRef,
  type D2cFallbackReason,
  type D2cPlanCandidate,
  type D2cPlanPolicyInput,
  type D2cPlanPolicyResult,
  type D2cQuotaConfig,
  type D2cShadowResult,
  type PlanPruningMode,
} from "../../src/ai/planning/beliefGuidedPlanPolicy";

const identity = {
  gameId: "d2c-test-game",
  roundIdentity: "d2c-test-round",
  handIdentity: "d2c-test-hand",
} as const;

const defaultQuotaConfig: D2cQuotaConfig = Object.freeze({
  schemaVersion: "d2c-plan-quota-v1",
  maxPlanFamilies: 3,
  maxPlanExpansions: 5,
  minQuotaPerFamily: 1,
  maxQuotaPerFamily: 3,
});

const defaultMetrics = {
  hardViolations: 0,
  protectionLoss: 0.123456789,
  estimatedTurns: 1.23456789,
  lowSingleCount: 1,
  retainedControl: 2,
  wildcardFlexibility: 0,
  responseCoverage: 1,
  leadFlexibility: 2,
  fallbackScore: 0,
};

function evidenceWith(
  overrides: Partial<LightweightPublicEvidence> = {},
): LightweightPublicEvidence {
  return {
    schemaVersion: "d2-lightweight-evidence-v1",
    ...identity,
    eventIndex: 7,
    perspectiveSeat: 0,
    seatMap: {
      self: 0,
      partner: 2,
      leftOpponent: 1,
      rightOpponent: 3,
    },
    hardPublicFacts: {
      remainingCardCounts: {
        self: 20,
        partner: 20,
        leftOpponent: 2,
        rightOpponent: 5,
      },
      currentTrick: {
        trickIndex: 2,
        leadSeat: 0,
        passSeats: [],
      },
      initiativeRelation: "self",
      playedCardIds: [],
      playedCardClasses: [],
      publicTransfers: [],
      publicTributeEvents: [],
      finishOrder: ["leftOpponent"],
    },
    derivedSignals: {
      recentActions: [],
      recentPassStreakByRelation: {
        self: 0,
        partner: 0,
        leftOpponent: 0,
        rightOpponent: 0,
      },
      recentActionTendencies: {
        self: { playCount: 1, passCount: 0, lastActionKind: "play" },
        partner: { playCount: 0, passCount: 1, lastActionKind: "pass" },
        leftOpponent: { playCount: 0, passCount: 0 },
        rightOpponent: { playCount: 0, passCount: 0 },
      },
    },
    provenance: [],
    ...overrides,
  };
}

function uncertaintyEvidence(): LightweightPublicEvidence {
  const base = evidenceWith();
  return {
    ...base,
    derivedSignals: {
      ...base.derivedSignals,
      recentActions: [
        {
          eventIndex: 5,
          kind: "play",
          seat: 1,
          relation: "leftOpponent",
          trickIndex: 2,
          publicStableKey: "play:left-opponent:5",
          publicCardIds: ["C2-1"],
        },
        {
          eventIndex: 6,
          kind: "pass",
          seat: 1,
          relation: "leftOpponent",
          trickIndex: 2,
          publicStableKey: "pass:left-opponent:6",
          publicCardIds: [],
        },
      ],
      recentActionTendencies: {
        ...base.derivedSignals.recentActionTendencies,
        leftOpponent: { playCount: 1, passCount: 1, lastActionKind: "pass" },
      },
    },
  };
}

function candidate(
  id: string,
  overrides: Partial<typeof defaultMetrics> = {},
  protectedGroupIds: readonly string[] = [],
): D2cPlanCandidate {
  const plan: HandPlan = {
    id,
    groups: [],
    metrics: { ...defaultMetrics, ...overrides },
  };
  return { plan, protectedGroupIds };
}

function testCard(id: string, suit: Card["suit"]): Card {
  return { id, kind: "suited", rank: "2", suit, copy: 1 };
}

function testGroup(type: CardGroup["type"], cards: Card[]): CardGroup {
  const purpose = type === "single"
    ? "risk"
    : type === "straight-flush"
      ? "attack"
      : type === "bomb" || type === "joker-bomb"
        ? "recovery"
        : "filler";
  return {
    id: `${type}:test`,
    type,
    label: type,
    purpose,
    cards,
    wildcards: [],
    strength: 1,
  };
}

function withGroups(
  base: D2cPlanCandidate,
  groups: CardGroup[],
): D2cPlanCandidate {
  return {
    ...base,
    plan: { ...base.plan, groups },
  };
}

function snapshotFor(evidence: LightweightPublicEvidence): D2cEvidenceSnapshotRef {
  return {
    gameId: evidence.gameId,
    roundIdentity: evidence.roundIdentity,
    handIdentity: evidence.handIdentity,
    eventIndex: evidence.eventIndex,
  };
}

function inputFor(
  candidatePlans: readonly D2cPlanCandidate[],
  overrides: Partial<D2cPlanPolicyInput> = {},
): D2cPlanPolicyInput {
  const evidence = evidenceWith();
  return {
    schemaVersion: "d2c-plan-policy-input-v1",
    evidence,
    expectedEvidenceSnapshot: snapshotFor(evidence),
    candidatePlans,
    mode: "shadow",
    quotaConfig: defaultQuotaConfig,
    ...overrides,
  };
}

function expectShadow(result: D2cPlanPolicyResult): D2cShadowResult {
  expect(result.kind).toBe("shadow");
  return result as D2cShadowResult;
}

function expectFallback(
  input: D2cPlanPolicyInput,
  reason: D2cFallbackReason,
): void {
  const result = deriveD2cPlanPriorityQuota(input);
  expect(result.kind).toBe("disabled");
  if (result.kind !== "disabled") throw new Error("D2C_EXPECTED_DISABLED_RESULT");
  expect(result.fallbackReason).toBe(reason);
}

function sumQuotas(result: D2cShadowResult): number {
  return result.familyQuotas.reduce((sum, item) => sum + item.quota, 0);
}

function sourceFile(): string {
  return readFileSync(
    resolve(process.cwd(), "src/ai/planning/beliefGuidedPlanPolicy.ts"),
    "utf8",
  );
}

describe("D2c plan priority and quota Task 1 RED characterization", () => {
  it("handles zero candidates with action-only semantics", () => {
    const result = deriveD2cPlanPriorityQuota(inputFor([]));
    expect(result).toMatchObject({
      kind: "disabled",
      candidateCount: 0,
      fallbackReason: "no-candidates-action-only",
    });
  });

  it("keeps one candidate without planner expansion", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("one")])),
    );
    expect(result.candidateCount).toBe(1);
    expect(Object.keys(result.annotations)).toEqual(["one"]);
  });

  it("characterizes two through five candidates", () => {
    const candidates = ["a", "b", "c", "d", "e"].map((id) => candidate(id));
    const result = expectShadow(deriveD2cPlanPriorityQuota(inputFor(candidates)));
    expect(result.candidateCount).toBe(5);
    expect(Object.keys(result.annotations)).toHaveLength(5);
  });

  it("rejects candidate overflow without truncation", () => {
    expectFallback(
      inputFor(["a", "b", "c", "d", "e", "f"].map((id) => candidate(id))),
      "candidate-count-overflow",
    );
  });

  it("classifies active, urgent, finishability, uncertainty, power, alternative, and other families", () => {
    const candidates = [
      candidate("active", {}, ["protected-group"]),
      candidate("finish", { estimatedTurns: 0.5 }),
      candidate("uncertainty", { responseCoverage: 2 }),
      candidate("other", { responseCoverage: 0, leadFlexibility: 0 }),
    ];
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(
        inputFor(candidates, {
          activePlanId: "active",
          evidence: uncertaintyEvidence(),
        }),
      ),
    );
    const familyIds = Object.values(result.annotations).flatMap((item) => item.familyIds);
    expect(familyIds).toEqual(expect.arrayContaining([
      "active",
      "urgent-defense",
      "finishability",
      "uncertainty-cover",
      "power-preserving",
      "alternative",
      "other",
    ]));

    const withoutRecentActions = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("no-uncertainty", {
        responseCoverage: 2,
      })])),
    );
    expect(withoutRecentActions.annotations["no-uncertainty"].familyIds).not.toContain("uncertainty-cover");
  });

  it("deduplicates multi-family labels and assigns one owner family", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(
        inputFor([candidate("multi", {}, ["protected-group"])]),
      ),
    );
    const annotation = result.annotations.multi;
    expect(new Set(annotation.familyIds).size).toBe(annotation.familyIds.length);
    expect(annotation.ownerFamily).toBeDefined();
  });

  it("orders stable priority independently of locale", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(
        inputFor([candidate("ä"), candidate("z"), candidate("a")]),
      ),
    );
    expect(Object.keys(result.annotations)).toEqual(["a", "z", "ä"]);
  });

  it("accepts fractional metrics and normalizes derived quality to six decimals", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("fractional")])),
    );
    expect(result.annotations.fractional.priority[2]).toBe(895.370372);
  });

  it("does not narrow unused metric domains", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("unused", {
        hardViolations: -9,
        wildcardFlexibility: -3.5,
        fallbackScore: -2.25,
      })])),
    );
    expect(result.annotations.unused).toBeDefined();
  });

  it("conserves family quota and keeps priority complete", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("a"), candidate("b"), candidate("c")])),
    );
    expect(result.familyPriority.length).toBeGreaterThanOrEqual(result.familyQuotas.length);
    expect(result.diagnostics.quotaTotal).toBe(sumQuotas(result));
    expect(result.familyQuotas.every((item) => item.quota > 0)).toBe(true);
  });

  it("supports a valid zero expansion budget with no quota records", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("a"), candidate("b")], {
        quotaConfig: { ...defaultQuotaConfig, maxPlanExpansions: 0 },
      })),
    );
    expect(result.familyPriority.length).toBeGreaterThan(0);
    expect(result.familyQuotas).toEqual([]);
    expect(result.diagnostics.quotaTotal).toBe(0);
  });

  it("is invariant under candidate permutation and repeated calls", () => {
    const candidates = [candidate("a"), candidate("b"), candidate("c")];
    const first = deriveD2cPlanPriorityQuota(inputFor(candidates));
    const permuted = deriveD2cPlanPriorityQuota(inputFor([...candidates].reverse()));
    const repeated = deriveD2cPlanPriorityQuota(inputFor(candidates));
    expect(JSON.stringify(permuted)).toBe(JSON.stringify(first));
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(first));
  });

  it("matches an older evidence event index as stale", () => {
    const evidence = evidenceWith({ eventIndex: 6 });
    expectFallback(
      inputFor([candidate("stale-old")], {
        evidence,
        expectedEvidenceSnapshot: { ...snapshotFor(evidence), eventIndex: 7 },
      }),
      "stale-evidence",
    );
  });

  it("matches a newer evidence event index as stale", () => {
    const evidence = evidenceWith({ eventIndex: 8 });
    expectFallback(
      inputFor([candidate("stale-new")], {
        evidence,
        expectedEvidenceSnapshot: { ...snapshotFor(evidence), eventIndex: 7 },
      }),
      "stale-evidence",
    );
  });

  it("fails closed when evidence identity differs from the expected snapshot", () => {
    const evidence = evidenceWith({ gameId: "other-game" });
    expectFallback(
      inputFor([candidate("stale-identity")], {
        evidence,
        expectedEvidenceSnapshot: snapshotFor(evidenceWith()),
      }),
      "stale-evidence",
    );
  });

  it("rejects invalid evidence schema and malformed snapshot", () => {
    const evidence = evidenceWith({ schemaVersion: "wrong" as never });
    expectFallback(
      inputFor([candidate("invalid-schema")], { evidence }),
      "unknown-evidence-schema",
    );

    const malformedSnapshot = {
      ...snapshotFor(evidence),
      eventIndex: "7",
    } as unknown as D2cEvidenceSnapshotRef;
    expectFallback(
      inputFor([candidate("invalid-snapshot")], {
        expectedEvidenceSnapshot: malformedSnapshot,
      }),
      "invalid-evidence",
    );
  });

  it("rejects duplicate and missing stable plan keys", () => {
    expectFallback(
      inputFor([candidate("duplicate"), candidate("duplicate")]),
      "duplicate-plan-key",
    );
    expectFallback(inputFor([candidate("")]), "missing-plan-key");
  });

  it("rejects invalid quota configuration and unknown mode", () => {
    expectFallback(
      inputFor([candidate("invalid-quota")], {
        quotaConfig: { ...defaultQuotaConfig, maxPlanFamilies: 0 },
      }),
      "invalid-quota-config",
    );
    expectFallback(
      inputFor([candidate("unknown-mode")], {
        mode: "active" as PlanPruningMode,
      }),
      "unknown-mode",
    );
  });

  it("does not mutate input evidence, candidates, or configuration", () => {
    const input = inputFor([candidate("immutable")]);
    const before = JSON.stringify(input);
    const result = expectShadow(deriveD2cPlanPriorityQuota(input));
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("deep-freezes every result node", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("frozen")])),
    );
    const visit = (value: unknown, seen = new Set<object>()): void => {
      if (value === null || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) visit(child, seen);
    };
    visit(result);
  });

  it("keeps privacy-safe detached result shape", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([candidate("shape")])),
    );
    expect(result).not.toHaveProperty("action");
    expect(result).not.toHaveProperty("legalActions");
    expect(result).not.toHaveProperty("candidatePlans");
    expect(result).not.toHaveProperty("selectedPlan");
    expect(result).not.toHaveProperty("selectedPlanId");
    expect(result).not.toHaveProperty("runtime");
    expect(JSON.stringify(result)).not.toMatch(/partnerHand|opponentsHands|hiddenState|deck|particle/i);
  });

  it("classifies finishability from six-decimal canonical estimated turns", () => {
    const first = candidate("canonical-finish-a", { estimatedTurns: 1.0000001 });
    const second = candidate("canonical-finish-b", { estimatedTurns: 1.0000004 });
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([first, second])),
    );

    expect(result.annotations[first.plan.id].familyIds).toContain("finishability");
    expect(result.annotations[second.plan.id].familyIds).toContain("finishability");
    expect(first.plan.metrics.estimatedTurns).toBe(1.0000001);
    expect(second.plan.metrics.estimatedTurns).toBe(1.0000004);
  });

  it("uses canonical protection loss for power-preserving power groups", () => {
    const bomb = testGroup("bomb", [
      testCard("S2-1", "spades"),
      testCard("H2-1", "hearts"),
      testCard("C2-1", "clubs"),
      testCard("D2-1", "diamonds"),
    ]);
    const powerCandidate = withGroups(
      candidate("canonical-power", { protectionLoss: 0.0000004 }),
      [bomb],
    );
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([powerCandidate])),
    );

    expect(result.annotations[powerCandidate.plan.id].familyIds).toContain("power-preserving");
    expect(powerCandidate.plan.metrics.protectionLoss).toBe(0.0000004);
  });

  it("does not label an ordinary zero-loss plan as power-preserving", () => {
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([
        candidate("ordinary-zero-loss", {
          protectionLoss: 0,
          responseCoverage: 0,
          leadFlexibility: 0,
        }),
      ])),
    );

    expect(result.annotations["ordinary-zero-loss"].familyIds).not.toContain("power-preserving");
  });

  it("marks urgent-defense for a non-single CardGroup object", () => {
    const pair = testGroup("pair", [
      testCard("S2-1", "spades"),
      testCard("H2-1", "hearts"),
    ]);
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([
        withGroups(candidate("non-single", {
          responseCoverage: 0,
          leadFlexibility: 0,
        }), [pair]),
      ])),
    );

    expect(result.annotations["non-single"].familyIds).toContain("urgent-defense");
  });

  it("compares the strongest non-active family when deriving alternative", () => {
    const active = candidate("strongest-active", {
      responseCoverage: 1,
      leadFlexibility: 2,
    });
    const challenger = candidate("strongest-challenger", {
      estimatedTurns: 2,
      responseCoverage: 0,
      leadFlexibility: 2,
    });
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([active, challenger], {
        activePlanId: active.plan.id,
        evidence: uncertaintyEvidence(),
      })),
    );

    expect(result.annotations[active.plan.id].familyIds).toEqual(
      expect.arrayContaining(["urgent-defense", "uncertainty-cover"]),
    );
    expect(result.annotations[challenger.plan.id].familyIds).toEqual([
      "uncertainty-cover",
    ]);
    expect(result.annotations[challenger.plan.id].familyIds).toContain("alternative");
  });

  it("caps minimum family quota by candidate count without dropping the family", () => {
    const urgent = candidate("quota-urgent");
    const small = candidate("quota-small", {
      estimatedTurns: 2,
      responseCoverage: 0,
      leadFlexibility: 0,
    });
    const result = expectShadow(
      deriveD2cPlanPriorityQuota(inputFor([urgent, small], {
        quotaConfig: {
          ...defaultQuotaConfig,
          maxPlanFamilies: 2,
          maxPlanExpansions: 4,
          minQuotaPerFamily: 2,
          maxQuotaPerFamily: 3,
        },
      })),
    );
    const smallFamily = result.annotations[small.plan.id].ownerFamily;
    const smallQuota = result.familyQuotas.find((item) => item.family === smallFamily);

    expect(smallFamily).toBe("other");
    expect(smallQuota).toEqual({ family: "other", quota: 1 });
  });

  it("fails closed when a stable plan key becomes a forbidden output key", () => {
    const result = deriveD2cPlanPriorityQuota(inputFor([candidate("hiddenState")]));

    expect(result).toMatchObject({
      kind: "disabled",
      fallbackReason: "privacy-violation",
    });
    expect(result).not.toHaveProperty("annotations.hiddenState");
  });

  it("enforces the exact source-boundary import contract and skeleton boundary", () => {
    const source = sourceFile();
    const file = ts.createSourceFile(
      "beliefGuidedPlanPolicy.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports = file.statements.filter(ts.isImportDeclaration);
    expect(imports.map((item) => (item.moduleSpecifier as ts.StringLiteral).text)).toEqual([
      "../belief/lightweightPublicEvidence",
      "../contracts",
    ]);
    const d2bImport = imports[0].importClause;
    expect(d2bImport?.isTypeOnly).toBe(false);
    const d2bBindings = d2bImport?.namedBindings;
    expect(d2bBindings !== undefined && ts.isNamedImports(d2bBindings)).toBe(true);
    if (!d2bImport || d2bBindings === undefined || !ts.isNamedImports(d2bBindings)) throw new Error("D2C_IMPORT_CONTRACT_INVALID");
    expect(d2bBindings.elements.map((item) => [item.name.text, item.isTypeOnly])).toEqual([
      ["assertLightweightPublicEvidencePrivacy", false],
      ["LightweightPublicEvidence", true],
    ]);
    const contractsImport = imports[1].importClause;
    expect(contractsImport?.isTypeOnly).toBe(true);
    const contractsBindings = contractsImport?.namedBindings;
    expect(contractsBindings !== undefined && ts.isNamedImports(contractsBindings)).toBe(true);
    expect(source).not.toMatch(/import\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    const forbiddenIdentifiers = [
      "RoomState",
      "PublicRoom",
      "AiRuntimeState",
      "HandPlanner",
      "generateHandPlans",
      "generateFastHandPlans",
      "generateRapidHandPlan",
      "ensurePlans",
      "decideAiAction",
      "runAiStep",
      "hands",
      "initialHands",
      "partnerHand",
      "opponentsHands",
      "deck",
      "hiddenState",
      "privateRuntime",
      "ParticleBank",
      "particles",
      "rollout",
      "likelihood",
      "server",
      "provider",
      "store",
      "treatment",
      "benchmark",
      "simulation",
      "performance",
      "smoke",
      "calibration",
      "formal",
    ];
    for (const identifier of forbiddenIdentifiers) {
      expect(source).not.toMatch(new RegExp(`\\b${identifier}\\b`));
    }
  });
});
