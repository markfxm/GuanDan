import { describe, expect, it } from "vitest";
import { buildPublicGameIdentity } from "../../src/game/publicEvent";

describe("PublicGameIdentity", () => {
  it("is explicit and independent of room transport creation order", () => {
    const identity = buildPublicGameIdentity("benchmark:seed:1", 0, 0, "benchmark-scenario");
    expect(identity).toEqual({
      schemaVersion: "d2-public-game-identity-v1",
      gameId: "benchmark:seed:1",
      roundIdentity: "benchmark:seed:1:round:0",
      handIdentity: "benchmark:seed:1:round:0:hand:0",
      roundSequence: 0,
      handSequence: 0,
      source: "benchmark-scenario",
    });
    expect(buildPublicGameIdentity("benchmark:seed:1", 0, 0, "benchmark-scenario")).toEqual(identity);
  });

  it("rejects invalid identity sequences", () => {
    expect(() => buildPublicGameIdentity("scenario", -1, 0, "replay")).toThrow("IDENTITY_SEQUENCE_INVALID");
    expect(() => buildPublicGameIdentity("scenario", 0, 1.5, "replay")).toThrow("IDENTITY_SEQUENCE_INVALID");
    expect(() => buildPublicGameIdentity("", 0, 0, "replay")).toThrow("IDENTITY_INVALID");
  });
});
