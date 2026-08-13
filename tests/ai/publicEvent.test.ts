import { describe, expect, it } from "vitest";
import {
  assertFinalizedPublicActionEvent,
  assertPublicActionEventDraft,
  type PublicActionEventDraft,
} from "../../src/game/publicEvent";

function playDraft(overrides: Partial<PublicActionEventDraft> = {}): PublicActionEventDraft {
  return {
    schemaVersion: "d2-public-event-v2",
    gameId: "scenario:task1",
    roundIdentity: "scenario:task1:round:0",
    handIdentity: "scenario:task1:round:0:hand:0",
    eventIndex: 0,
    kind: "play",
    seat: 0,
    publicStableKey: "play:S3-1",
    publicCardIds: ["S3-1"],
    patternType: "single",
    groupType: "single",
    handCountBefore: 27,
    handCountAfter: 26,
    trickIndex: 0,
    ...overrides,
  } as PublicActionEventDraft;
}

describe("PublicActionEvent draft contract", () => {
  it("accepts a valid draft and rejects kind-specific forbidden fields", () => {
    expect(() => assertPublicActionEventDraft(playDraft())).not.toThrow();
    expect(() => assertPublicActionEventDraft({
      ...playDraft(),
      kind: "pass",
      publicCardIds: ["S3-1"],
      patternType: "single",
      groupType: "single",
    })).toThrow("EVENT_SCHEMA_INVALID");
  });

  it("keeps draft validation separate from finalized validation", () => {
    expect(() => assertFinalizedPublicActionEvent(playDraft())).toThrow("EVENT_HASH_MISSING");
  });
});
