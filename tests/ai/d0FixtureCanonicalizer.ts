import crypto from "node:crypto";
import type { D0KeepCurrentCase, D0KeepCurrentFixture } from "./d0FixtureTypes";

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function runtimeCanonicalJson(runtime: unknown): string {
  return canonicalJson(runtime);
}

export function actionStableKey(action: unknown): string {
  const candidate = action as { type?: string; group?: { cards?: Array<{ id: string }>; id?: string } };
  if (candidate.type === "pass") return "pass";
  const cardIds = (candidate.group?.cards ?? []).map((card) => card.id).sort();
  return `play:${cardIds.join(",")}`;
}

export function decisionPublicTraceHash(observation: unknown, action: unknown): string {
  const input = observation as Record<string, unknown>;
  return sha256(canonicalJson({
    publicObservation: {
      gameRank: input.gameRank,
      seat: input.seat,
      partnerSeat: input.partnerSeat,
      playedCards: input.playedCards,
      handCounts: input.handCounts,
      lastPlay: input.lastPlay,
      lastPlaySeat: input.lastPlaySeat,
      finishOrder: input.finishOrder,
      partnerPassedCurrentTrick: input.partnerPassedCurrentTrick,
    },
    action,
  }));
}

export function inputPayload(testCase: Pick<D0KeepCurrentCase, "caseId" | "observation" | "runtimeInput" | "config">): unknown {
  return {
    caseId: testCase.caseId,
    observation: testCase.observation,
    runtimeInput: testCase.runtimeInput,
    config: testCase.config,
  };
}

export function fixtureInputHash(cases: D0KeepCurrentCase[]): string {
  return sha256(canonicalJson(cases.map(inputPayload)));
}

export function fixtureOutputHash(fixture: D0KeepCurrentFixture): string {
  return sha256(canonicalJson({ ...fixture, outputSha256: "" }));
}
