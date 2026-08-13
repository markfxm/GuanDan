import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApi } from "../../src/server/api";
import { createPublicIdentityProvider } from "../../src/server/publicIdentityProvider";
import { PublicIdentityStore } from "../../src/server/publicIdentityStore";

const fixturePath = join(process.cwd(), "tests/server/fixtures/publicRoomLegacyResponse.json");
const metadataPath = join(process.cwd(), "tests/server/fixtures/publicRoomLegacyResponse.meta.json");
const expectedRawBody = readFileSync(fixturePath, "utf8");
const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
  sourceCommit: string;
  requestDescriptor: { rank: string; seed: number; pendingTributeItems: unknown[] };
  expectedRawBodySha256: string;
};

describe("legacy PublicRoom response lock", () => {
  const directories: string[] = [];
  afterEach(() => {
    while (directories.length > 0) rmSync(directories.pop()!, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("matches the D0-era canonical response bytes and shape", async () => {
    const directory = mkdtempSync(join(tmpdir(), "d2a1-public-room-lock-"));
    directories.push(directory);
    const provider = createPublicIdentityProvider(new PublicIdentityStore(join(directory, "identity.sqlite"), {
      installationIdentity: "00000000-0000-4000-8000-000000000001",
    }));
    const app = buildApi(provider);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: { "Idempotency-Key": "legacy-lock" },
        payload: metadata.requestDescriptor,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(expectedRawBody);
      expect(JSON.parse(response.body)).toEqual(JSON.parse(expectedRawBody));
      expect(createHash("sha256").update(response.body, "utf8").digest("hex")).toBe(metadata.expectedRawBodySha256);
      const publicRoom = response.json().room as Record<string, unknown>;
      for (const forbidden of ["publicIdentity", "publicLedger", "publicEvents", "gameSequence", "descriptorHash", "idempotencyKey"]) {
        expect(publicRoom).not.toHaveProperty(forbidden);
      }
    } finally {
      await app.close();
      provider.close();
    }
  });
});
