import { describe, expect, test } from "vitest";
import { createDeck, type Card } from "../../../src/engine/cards";
import type {
  CanonicalInitialDeal,
  HiddenTransferAssignment,
  ParticleBank,
  ParticleBankBuildInput,
  ParticleBankBuildResult,
  ParticleBankConfigIdentity,
  ParticleLikelihoodConfig,
  ParticleScenario,
  ParticleSnapshotIdentity,
} from "../../../src/ai/particles/contracts";
import {
  canonicalParticleLikelihoodConfigBytes,
  canonicalParticleScenarioBytes,
  createParticleBankConfigIdentity,
  likelihoodConfigHash,
  particleScenarioIdentity,
} from "../../../src/ai/particles/canonicalDeal";

const deck = createDeck();

function makeDeal(cards: readonly Card[] = deck): CanonicalInitialDeal {
  return {
    schemaVersion: "d2-particle-initial-deal-v1",
    hands: {
      0: cards.slice(0, 27),
      1: cards.slice(27, 54),
      2: cards.slice(54, 81),
      3: cards.slice(81, 108),
    },
  };
}

function makeScenario(
  deal: CanonicalInitialDeal = makeDeal(),
  hiddenTransferAssignments: readonly HiddenTransferAssignment[] = [
    scenarioAssignment(2, "tribute", 0, 1, deal.hands[0][0].id),
    scenarioAssignment(7, "return", 1, 0, deal.hands[1][0].id),
  ],
): ParticleScenario {
  return {
    schemaVersion: "d2-particle-scenario-v1",
    initialDeal: deal,
    hiddenTransferAssignments,
  };
}

function scenarioAssignment(
  eventIndex: number,
  eventKind: "tribute" | "return",
  fromSeat: 0 | 1 | 2 | 3,
  toSeat: 0 | 1 | 2 | 3,
  cardId: string,
): HiddenTransferAssignment {
  return { eventIndex, eventKind, fromSeat, toSeat, cardId };
}

function makeSnapshot(): ParticleSnapshotIdentity {
  return {
    gameId: "particle-contract-fixture",
    roundIdentity: "particle-contract-fixture:round:0",
    handIdentity: "particle-contract-fixture:round:0:hand:0",
    lastAppliedEventIndex: -1,
    ledgerHash: "ledger-hash-fixture",
    perspectiveSeat: 0,
    gameRank: "2",
  };
}

function makeLikelihoodConfig(): ParticleLikelihoodConfig {
  return {
    schemaVersion: "d2-particle-likelihood-v1",
    forcedPassLogFactor: -1,
    couldBeatButPassedLogFactor: -2,
    observedLeadPlayLogFactor: -3,
    observedFollowPlayLogFactor: -4,
    degradedEssThreshold: 1,
    normalizationTolerance: 1e-9,
    essTolerance: 1e-9,
  };
}

function makeConfigIdentity(
  overrides: Partial<{
    particleCount: number;
    maxSamplingAttempts: number;
    maxIndexDraws: number;
    samplerConfigVersion: string;
    likelihoodConfig: ParticleLikelihoodConfig;
  }> = {},
): ParticleBankConfigIdentity {
  return createParticleBankConfigIdentity({
    particleCount: 3,
    maxSamplingAttempts: 12,
    maxIndexDraws: 8,
    samplerConfigVersion: "d2-particle-sampler-v1",
    likelihoodConfig: makeLikelihoodConfig(),
    ...overrides,
  });
}

describe("D2e-P ParticleBank Core contracts", () => {
  test("canonicalizes all four seats and physical card IDs independent of input order", () => {
    const deal = makeDeal();
    const scenario = makeScenario(deal);
    const reorderedDeal: CanonicalInitialDeal = {
      schemaVersion: deal.schemaVersion,
      hands: {
        0: [...deal.hands[0]].reverse(),
        1: [...deal.hands[1]].reverse(),
        2: [...deal.hands[2]].reverse(),
        3: [...deal.hands[3]].reverse(),
      },
    };
    const reorderedScenario = makeScenario(reorderedDeal, scenario.hiddenTransferAssignments);

    expect([...canonicalParticleScenarioBytes(scenario)]).toEqual([...canonicalParticleScenarioBytes(reorderedScenario)]);
    expect(particleScenarioIdentity(makeSnapshot(), scenario)).toBe(particleScenarioIdentity(makeSnapshot(), reorderedScenario));
  });

  test("same canonical scenario produces byte-identical bytes and identity", () => {
    const first = makeScenario();
    const equivalent = makeScenario(makeDeal(), [...first.hiddenTransferAssignments]);

    expect([...canonicalParticleScenarioBytes(first)]).toEqual([...canonicalParticleScenarioBytes(equivalent)]);
    expect(particleScenarioIdentity(makeSnapshot(), first)).toBe(particleScenarioIdentity(makeSnapshot(), equivalent));
  });

  test("same initial deal with different hidden transfer assignment changes identity", () => {
    const deal = makeDeal();
    const first = makeScenario(deal);
    const differentAssignment = makeScenario(deal, [
      first.hiddenTransferAssignments[0],
      scenarioAssignment(7, "return", 1, 0, deal.hands[1][1].id),
    ]);

    expect(particleScenarioIdentity(makeSnapshot(), first)).not.toBe(particleScenarioIdentity(makeSnapshot(), differentAssignment));
  });

  test("hidden assignment array order does not change canonical identity", () => {
    const scenario = makeScenario();
    const reordered = makeScenario(scenario.initialDeal, [...scenario.hiddenTransferAssignments].reverse());

    expect(particleScenarioIdentity(makeSnapshot(), scenario)).toBe(particleScenarioIdentity(makeSnapshot(), reordered));
  });

  test("attempt ordinal metadata is excluded from canonical scenario identity", () => {
    const scenario = makeScenario();
    const withAttemptOrdinal = { ...scenario, attemptOrdinal: 37 } as ParticleScenario & { attemptOrdinal: number };

    expect([...canonicalParticleScenarioBytes(scenario)]).toEqual([...canonicalParticleScenarioBytes(withAttemptOrdinal)]);
    expect(particleScenarioIdentity(makeSnapshot(), scenario)).toBe(particleScenarioIdentity(makeSnapshot(), withAttemptOrdinal));
  });

  test("conflicting assignments for one transfer event fail closed", () => {
    const scenario = makeScenario(undefined, [
      scenarioAssignment(2, "tribute", 0, 1, deck[0].id),
      scenarioAssignment(2, "tribute", 0, 1, deck[1].id),
    ]);

    expect(() => canonicalParticleScenarioBytes(scenario)).toThrow();
  });

  test("different initial ownership changes scenario identity", () => {
    const scenario = makeScenario();
    const originalDeal = scenario.initialDeal;
    const assignmentIds = new Set(scenario.hiddenTransferAssignments.map((assignment) => assignment.cardId));
    const firstUnassigned = originalDeal.hands[0][1];
    const secondUnassigned = originalDeal.hands[2][1];
    expect(assignmentIds.has(firstUnassigned.id)).toBe(false);
    expect(assignmentIds.has(secondUnassigned.id)).toBe(false);

    const firstHand = [...originalDeal.hands[0]];
    const secondHand = [...originalDeal.hands[2]];
    [firstHand[1], secondHand[1]] = [secondHand[1], firstHand[1]];
    const changedDeal: CanonicalInitialDeal = {
      schemaVersion: originalDeal.schemaVersion,
      hands: {
        0: firstHand,
        1: [...originalDeal.hands[1]],
        2: secondHand,
        3: [...originalDeal.hands[3]],
      },
    };
    const changedScenario = makeScenario(changedDeal, scenario.hiddenTransferAssignments);
    const originalIds = Object.values(originalDeal.hands).flat().map((card) => card.id).sort();
    const changedIds = Object.values(changedDeal.hands).flat().map((card) => card.id).sort();

    expect(changedScenario.hiddenTransferAssignments).toEqual(scenario.hiddenTransferAssignments);
    expect(originalIds).toEqual(changedIds);
    expect(Object.values(changedDeal.hands).every((hand) => hand.length === 27)).toBe(true);
    expect(changedDeal.hands[0][1].id).toBe(secondUnassigned.id);
    expect(changedDeal.hands[2][1].id).toBe(firstUnassigned.id);
    expect(particleScenarioIdentity(makeSnapshot(), scenario)).not.toBe(particleScenarioIdentity(makeSnapshot(), changedScenario));
  });

  test("preserves every physical card ID from the canonical 108-card deck", () => {
    const deal = makeDeal();
    const ids = Object.values(deal.hands).flat().map((card) => card.id);
    const encoded = new TextDecoder().decode(canonicalParticleScenarioBytes(makeScenario(deal)));

    expect(deck).toHaveLength(108);
    expect(ids).toHaveLength(108);
    expect(new Set(ids).size).toBe(108);
    expect(new Set(deck.map((card) => card.id)).size).toBe(108);
    for (const card of deck) {
      expect(encoded).toContain(card.id);
    }
  });

  test("same likelihood config produces byte-identical canonical bytes and hash", () => {
    const first = makeLikelihoodConfig();
    const equivalent = { ...first };

    expect([...canonicalParticleLikelihoodConfigBytes(first)]).toEqual([...canonicalParticleLikelihoodConfigBytes(equivalent)]);
    expect(likelihoodConfigHash(first)).toBe(likelihoodConfigHash(equivalent));
  });

  test("property insertion order does not change likelihood config bytes", () => {
    const first = makeLikelihoodConfig();
    const reordered: ParticleLikelihoodConfig = {
      essTolerance: first.essTolerance,
      normalizationTolerance: first.normalizationTolerance,
      degradedEssThreshold: first.degradedEssThreshold,
      observedFollowPlayLogFactor: first.observedFollowPlayLogFactor,
      observedLeadPlayLogFactor: first.observedLeadPlayLogFactor,
      couldBeatButPassedLogFactor: first.couldBeatButPassedLogFactor,
      forcedPassLogFactor: first.forcedPassLogFactor,
      schemaVersion: first.schemaVersion,
    };

    expect([...canonicalParticleLikelihoodConfigBytes(first)]).toEqual([...canonicalParticleLikelihoodConfigBytes(reordered)]);
  });

  test("changing each valid numeric likelihood field changes config hash", () => {
    const config = makeLikelihoodConfig();
    const variants: ParticleLikelihoodConfig[] = [
      { ...config, forcedPassLogFactor: -1.5 },
      { ...config, couldBeatButPassedLogFactor: -2.5 },
      { ...config, observedLeadPlayLogFactor: -3.5 },
      { ...config, observedFollowPlayLogFactor: -4.5 },
      { ...config, degradedEssThreshold: 2 },
      { ...config, normalizationTolerance: 2e-9 },
      { ...config, essTolerance: 2e-9 },
    ];

    for (const variant of variants) {
      expect(likelihoodConfigHash(variant)).not.toBe(likelihoodConfigHash(config));
    }
  });

  test("rejects unsupported likelihood schema version", () => {
    const unsupported = { ...makeLikelihoodConfig(), schemaVersion: "d2-particle-likelihood-v2" } as unknown as ParticleLikelihoodConfig;

    expect(() => canonicalParticleLikelihoodConfigBytes(unsupported)).toThrow();
  });

  test("rejects positive NaN and positive-infinity log factors", () => {
    expect(() => createParticleBankConfigIdentity({
      particleCount: 1,
      maxSamplingAttempts: 1,
      maxIndexDraws: 1,
      samplerConfigVersion: "d2-particle-sampler-v1",
      likelihoodConfig: { ...makeLikelihoodConfig(), forcedPassLogFactor: Number.NaN },
    })).toThrow();
    expect(() => createParticleBankConfigIdentity({
      particleCount: 1,
      maxSamplingAttempts: 1,
      maxIndexDraws: 1,
      samplerConfigVersion: "d2-particle-sampler-v1",
      likelihoodConfig: { ...makeLikelihoodConfig(), observedLeadPlayLogFactor: Number.POSITIVE_INFINITY },
    })).toThrow();
    expect(() => createParticleBankConfigIdentity({
      particleCount: 1,
      maxSamplingAttempts: 1,
      maxIndexDraws: 1,
      samplerConfigVersion: "d2-particle-sampler-v1",
      likelihoodConfig: { ...makeLikelihoodConfig(), observedFollowPlayLogFactor: 0.1 },
    })).toThrow();
  });

  test("rejects tolerance values outside approved range", () => {
    expect(() => makeConfigIdentity({ likelihoodConfig: { ...makeLikelihoodConfig(), normalizationTolerance: 1e-20 } })).toThrow();
    expect(() => makeConfigIdentity({ likelihoodConfig: { ...makeLikelihoodConfig(), essTolerance: 1 } })).toThrow();
  });

  test("config identity includes particle count attempt cap draw cap sampler version and likelihood hash", () => {
    const likelihoodConfig = makeLikelihoodConfig();
    const identity = makeConfigIdentity({ likelihoodConfig });

    expect(identity).toEqual({
      schemaVersion: "d2-particle-bank-config-identity-v1",
      particleCount: 3,
      maxSamplingAttempts: 12,
      maxIndexDraws: 8,
      samplerConfigVersion: "d2-particle-sampler-v1",
      likelihoodConfigHash: likelihoodConfigHash(likelihoodConfig),
    });
  });

  test("rejects non-positive particle count", () => {
    expect(() => makeConfigIdentity({ particleCount: 0 })).toThrow();
    expect(() => makeConfigIdentity({ particleCount: -1 })).toThrow();
  });

  test("rejects attempt cap below particle count", () => {
    expect(() => makeConfigIdentity({ particleCount: 3, maxSamplingAttempts: 2 })).toThrow();
  });

  test("rejects invalid maxIndexDraws", () => {
    expect(() => makeConfigIdentity({ maxIndexDraws: 0 })).toThrow();
    expect(() => makeConfigIdentity({ maxIndexDraws: Number.NaN })).toThrow();
    expect(() => makeConfigIdentity({ maxIndexDraws: Number.POSITIVE_INFINITY })).toThrow();
  });

  test("returned config identity does not retain mutable likelihood config references", () => {
    const likelihoodConfig = makeLikelihoodConfig();
    const expectedHash = likelihoodConfigHash(likelihoodConfig);
    const identity = makeConfigIdentity({ likelihoodConfig });

    likelihoodConfig.forcedPassLogFactor = -99;

    expect(identity.likelihoodConfigHash).toBe(expectedHash);
    expect(identity.likelihoodConfigHash).not.toBe(likelihoodConfigHash(likelihoodConfig));
  });

  test("particle seed is absent from snapshot and config identity", () => {
    const snapshot = makeSnapshot();
    const configIdentity = makeConfigIdentity();

    expect(JSON.stringify(snapshot)).not.toContain("particleSeed");
    expect(JSON.stringify(configIdentity)).not.toContain("particleSeed");
    expect(Object.keys(snapshot)).not.toContain("seed");
    expect(Object.keys(configIdentity)).not.toContain("seed");
  });
});

const typeContractWitness: Readonly<{
  likelihoodConfig: ParticleLikelihoodConfig | undefined;
  buildInput: ParticleBankBuildInput | undefined;
  initialDeal: CanonicalInitialDeal | undefined;
  scenario: ParticleScenario | undefined;
  snapshot: ParticleSnapshotIdentity | undefined;
  configIdentity: ParticleBankConfigIdentity | undefined;
  bank: ParticleBank | undefined;
  result: ParticleBankBuildResult | undefined;
}> = {
  likelihoodConfig: undefined,
  buildInput: undefined,
  initialDeal: undefined,
  scenario: undefined,
  snapshot: undefined,
  configIdentity: undefined,
  bank: undefined,
  result: undefined,
};

void typeContractWitness;
