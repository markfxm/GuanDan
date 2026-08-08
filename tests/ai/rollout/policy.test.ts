import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createDeck } from "../../../src/engine/cards";
import { canonicalActionIdentity } from "../../../src/ai/rollout/contracts";
import { canonicalCrnDomainBytes, createCrnCoordinate, deriveRandomDomain, createCanonicalSemanticKey } from "../../../src/ai/rollout/identity";
import { createCrnView } from "../../../src/ai/rollout/crn";
import * as policyModule from "../../../src/ai/rollout/policy";

const policyPath = path.resolve(process.cwd(), "src/ai/rollout/policy.ts");

async function loadPolicyModule(): Promise<Record<string, unknown>> {
  return policyModule as Record<string, unknown>;
}

function makeObservation(): Record<string, unknown> {
  const hand = createDeck().slice(0, 2);
  return {
    hand,
    publicHistoryEvents: [],
    handCounts: { 0: 2, 1: 1, 2: 1, 3: 1 },
    currentLastPlay: null,
    finishOrder: [],
    gameRank: "2",
  };
}

function makeCrnView(): ReturnType<typeof createCrnView> {
  const coordinate = createCrnCoordinate({
    rootIdentity: "0".repeat(64),
    scenarioIdentity: "1".repeat(64),
    replicateIdentity: "2".repeat(64),
    ply: 0,
    actingSeat: 0,
    randomDomain: "policy-action-v1",
  });
  expect(coordinate.ok).toBe(true);
  if (!coordinate.ok) throw new Error("CRN_FIXTURE_INVALID");
  const randomDomain = deriveRandomDomain(coordinate.value);
  const view = createCrnView({ coordinate: coordinate.value, randomDomain });
  expect(view.ok).toBe(true);
  return view;
}

describe("D2F fixed internal rollout policy", () => {
  test("maps the supported policy id to one fixed internal policy", async () => {
    if (!existsSync(policyPath)) {
      expect(existsSync(policyPath), "fixed internal policy factory is missing").toBe(true);
      return;
    }
    const policy = await loadPolicyModule();
    expect(typeof policy.createInternalRolloutPolicy).toBe("function");

    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
      failure?: unknown;
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    expect(typeof result.policy?.chooseAction).toBe("function");

    const crn = makeCrnView();
    expect(crn.ok).toBe(true);
    if (!crn.ok) return;
    const actionResult = result.policy!.chooseAction(makeObservation(), {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, crn.view);
    expect(actionResult).toMatchObject({ ok: true });
    if (typeof actionResult === "object" && actionResult !== null && "ok" in actionResult && actionResult.ok === true && "action" in actionResult) {
      expect((actionResult as { action: unknown }).action).toEqual(expect.any(Object));
      expect(canonicalActionIdentity((actionResult as { action: never }).action)).toEqual(expect.any(String));
    }
  });

  test("rejects unknown and malformed policy ids without fallback", async () => {
    if (!existsSync(policyPath)) {
      expect(existsSync(policyPath), "fixed internal policy factory is missing").toBe(true);
      return;
    }
    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => unknown;
    for (const policyId of ["custom", "", 1, null, {}, () => undefined]) {
      expect(() => factory(policyId)).not.toThrow();
      expect(factory(policyId)).toEqual({ ok: false, failure: { kind: "unsupported-policy-id" } });
    }
  });

  test("keeps policy observation seat-local and does not accept executable inputs", async () => {
    if (!existsSync(policyPath)) {
      expect(existsSync(policyPath), "fixed internal policy factory is missing").toBe(true);
      return;
    }
    const policySource = readFileSync(policyPath, "utf8");
    expect(policySource).not.toMatch(/RolloutScenario|privateState|initialHands|RoomState|HandPlanner|decideAiAction|Math\.random|Date\.now|performance\.now|\.bind\(|\bnext\s*\(|\bcursor\b|\btape\b/);
    expect(policySource).not.toMatch(/candidateId|candidateIdentity|candidateAssociationIdentity/);

    const policy = await loadPolicyModule();
    const factory = policy.createInternalRolloutPolicy as (policyId: unknown) => {
      ok: boolean;
      policy?: { chooseAction: (observation: unknown, context: unknown, crn: unknown) => unknown };
    };
    const result = factory("d2f-lightweight-v1");
    expect(result.ok).toBe(true);
    if (!result.ok || result.policy === undefined) return;

    let getterCalls = 0;
    const hostileObservation = makeObservation();
    Object.defineProperty(hostileObservation, "otherHands", {
      configurable: true,
      get: () => {
        getterCalls += 1;
        return [createDeck().slice(2)];
      },
    });
    const view = makeCrnView();
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const action = result.policy.chooseAction(hostileObservation, {
      replicateIdentity: "2".repeat(64),
      ply: 0,
      actingSeat: 0,
    }, view.view);
    expect(action).toEqual({ ok: false, failure: { kind: "no-legal-action", actingSeat: 0 } });
    expect(getterCalls).toBe(0);
  });

  test("uses candidate-free semantic keys for CRN values", () => {
    const key = createCanonicalSemanticKey("policy-action:play:single:H7-1");
    expect(key.ok).toBe(true);
    expect(canonicalCrnDomainBytes).toBeTypeOf("function");
    expect(key).not.toHaveProperty("candidateId");
  });
});
