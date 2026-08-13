import { describe, expect, it } from "vitest";
import {
  finalizePublicActionEvent,
  hashPublicActionEvent,
  verifyPublicActionEventHash,
  type PublicActionEventDraft,
} from "../../src/game/publicEventHash";
import type { PublicTributeEvent } from "../../src/game/publicEvent";

function playDraft(overrides: Partial<PublicActionEventDraft> = {}): PublicActionEventDraft {
  return {
    schemaVersion: "d2-public-event-v2",
    gameId: "scenario:hash",
    roundIdentity: "scenario:hash:round:0",
    handIdentity: "scenario:hash:round:0:hand:0",
    eventIndex: 0,
    kind: "play",
    seat: 0,
    publicStableKey: "play:S3-1,S3-2",
    publicCardIds: ["S3-2", "S3-1"],
    patternType: "pair",
    groupType: "pair",
    handCountBefore: 27,
    handCountAfter: 25,
    trickIndex: 0,
    ...overrides,
  } as PublicActionEventDraft;
}

describe("canonical public event hash", () => {
  it("sorts cards and does not mutate caller input", () => {
    const cards = ["S3-2", "S3-1"];
    const event = finalizePublicActionEvent(playDraft({ publicCardIds: cards }));
    expect(cards).toEqual(["S3-2", "S3-1"]);
    expect(event.publicCardIds).toEqual(["S3-1", "S3-2"]);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it("rejects duplicate cards and forbidden hidden-state fields", () => {
    expect(() => finalizePublicActionEvent(playDraft({ publicCardIds: ["S3-1", "S3-1"] }))).toThrow("PUBLIC_CARD_DUPLICATE");
    expect(() => hashPublicActionEvent({ ...playDraft(), hands: [] } as never)).toThrow("EVENT_SCHEMA_INVALID");
  });

  it("produces the same hash for object and card insertion order", () => {
    const leftDraft = playDraft({ publicCardIds: ["S3-2", "S3-1"] });
    const rightDraft = {
      ...playDraft({ publicCardIds: ["S3-1", "S3-2"] }),
      trickIndex: 0,
    };
    const left = finalizePublicActionEvent(leftDraft);
    expect(hashPublicActionEvent(leftDraft)).toBe(hashPublicActionEvent(rightDraft));
    expect(verifyPublicActionEventHash(left)).toBe(true);
  });

  it("normalizes seat maps before hashing", () => {
    const draft = {
      ...playDraft(),
      kind: "tribute",
      publicStableKey: "tribute:3:0:S3-1",
      publicCardIds: ["S3-1"],
      fromSeat: 3,
      toSeat: 0,
      handCountChanges: { 3: -1, 0: 1, 2: 0, 1: 0 },
    } as unknown as PublicActionEventDraft;
    const event = finalizePublicActionEvent(draft);
    expect(Object.keys((event as PublicTributeEvent).handCountChanges)).toEqual(["0", "1", "2", "3"]);
  });
});
