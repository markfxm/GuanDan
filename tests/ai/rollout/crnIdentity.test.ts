import { describe, expect, test } from "vitest";
import { sha256Bytes } from "../../../src/game/publicEventHash";
import {
  canonicalCrnDomainBytes,
  canonicalCrnValueBytes,
  createCanonicalRandomDomainLabel,
  createCanonicalSemanticKey,
  createCrnCoordinate,
  createUnpairedSemanticKey,
  deriveRandomDomain,
} from "../../../src/ai/rollout/identity";
import { createCrnView } from "../../../src/ai/rollout/crn";
import type { CanonicalRandomDomain, CanonicalSemanticKey } from "../../../src/ai/rollout/contracts";

const ROOT_IDENTITY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const SCENARIO_IDENTITY = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
const REPLICATE_IDENTITY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const DOMAIN_BYTES = "4432462d43524e2d444f4d41494e2d563100010000002000112233445566778899aabbccddeeff00112233445566778899aabbccddeeff0200000020ffeeddccbbaa99887766554433221100ffeeddccbbaa9988776655443322110003000000200123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef040000000800000000000000070500000001020600000010706f6c6963792d616374696f6e2d7631";
const DOMAIN_DIGEST = "c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15";
const PAIRED_VALUE_BYTES = "4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf15020000001e706f6c6963792d616374696f6e3a706c61793a73696e676c653a48372d31";
const PAIRED_VALUE_DIGEST = "0351802e83a610421ad1681cb92d729197bc31765b11cf72d85d25d10eabf3b8";
const PAIRED_FIRST_EIGHT = "0351802e83a61042";
const PAIRED_U53 = 116754488521922n;
const PAIRED_VALUE = 0.012962352138537137;
const UNPAIRED_VALUE_BYTES = "4432462d43524e2d56414c55452d5631000100000020c87b90a3b86958c2c1528fb5665592eadce5f733559cd5a4bf85559a59cfaf150200000014756e7061697265643a7075626c69632d70617373";
const UNPAIRED_VALUE_DIGEST = "2a564ad3f684e2f5ca38184d2aa0e71bc2157e2658e3429719d2e190c2747283";
const UNPAIRED_FIRST_EIGHT = "2a564ad3f684e2f5";
const UNPAIRED_U53 = 1489603550695580n;
const UNPAIRED_VALUE = 0.16537921595456195;
const AB_C_BYTES = "4432462d43524e2d56414c55452d56310001000000203d1571b8edbf823789c3bb440b98388d2448cb8b15b56025a8ba2d04e4d25e96020000000163";
const A_BC_BYTES = "4432462d43524e2d56414c55452d56310001000000209c5bc616973ab50bb7ae1ea133dc9333e41d916c2bad2f1ee1fa54d4ff9f389f02000000026263";
const X_YZ_BYTES = "4432462d43524e2d56414c55452d56310001000000207ccad33be63bbbe2df49bf4529a7ff06a1288a1debaeafca4dee1aa083f364cb0200000003793a7a";
const XY_Z_BYTES = "4432462d43524e2d56414c55452d5631000100000020f65c7cf19deccc6adbaee964af36d06eb9dcbc08dad9a6621314fb385f4ed5d302000000017a";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; failure: unknown }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unexpected failure");
  return result.value;
}

function unwrapView(result: { ok: true; view: { value(key: CanonicalSemanticKey): number } } | { ok: false; failure: unknown }) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unexpected failure");
  return result.view;
}

function knownCoordinate() {
  const randomDomain = unwrap(createCanonicalRandomDomainLabel("policy-action-v1"));
  return unwrap(createCrnCoordinate({
    rootIdentity: ROOT_IDENTITY,
    scenarioIdentity: SCENARIO_IDENTITY,
    replicateIdentity: REPLICATE_IDENTITY,
    ply: 7,
    actingSeat: 2,
    randomDomain,
  }));
}

describe("D2F keyed CRN canonical identity", () => {
  test("matches the frozen paired known vector without generating expected values", () => {
    const coordinate = knownCoordinate();
    const semanticKey = unwrap(createCanonicalSemanticKey("policy-action:play:single:H7-1"));
    const domainBytes = canonicalCrnDomainBytes(coordinate);
    const randomDomain = deriveRandomDomain(coordinate);
    const valueBytes = canonicalCrnValueBytes(randomDomain, semanticKey);

    expect(hex(domainBytes)).toBe(DOMAIN_BYTES);
    expect(randomDomain).toBe(DOMAIN_DIGEST);
    expect(hex(valueBytes)).toBe(PAIRED_VALUE_BYTES);
    const valueDigest = sha256Bytes(valueBytes);
    expect(valueDigest).toBe(PAIRED_VALUE_DIGEST);
    expect(valueDigest.slice(0, 16)).toBe(PAIRED_FIRST_EIGHT);
    const u53 = BigInt(`0x${valueDigest.slice(0, 16)}`) >> 11n;
    expect(u53).toBe(PAIRED_U53);
    expect(Number(u53) / 9007199254740992).toBe(PAIRED_VALUE);
    expect(unwrapView(createCrnView({ coordinate, randomDomain })).value(semanticKey)).toBe(PAIRED_VALUE);
  });

  test("preserves TLV tuple boundaries in value bytes", () => {
    const domain = "3d1571b8edbf823789c3bb440b98388d2448cb8b15b56025a8ba2d04e4d25e96" as CanonicalRandomDomain;
    const ab = unwrap(createCanonicalSemanticKey("ab"));
    const c = unwrap(createCanonicalSemanticKey("c"));
    const bc = unwrap(createCanonicalSemanticKey("bc"));
    const x = "7ccad33be63bbbe2df49bf4529a7ff06a1288a1debaeafca4dee1aa083f364cb" as CanonicalRandomDomain;
    const xyZ = unwrap(createCanonicalSemanticKey("y:z"));
    const xy = "f65c7cf19deccc6adbaee964af36d06eb9dcbc08dad9a6621314fb385f4ed5d3" as CanonicalRandomDomain;
    const z = unwrap(createCanonicalSemanticKey("z"));

    expect(hex(canonicalCrnValueBytes(domain, c))).toBe(AB_C_BYTES);
    expect(hex(canonicalCrnValueBytes("9c5bc616973ab50bb7ae1ea133dc9333e41d916c2bad2f1ee1fa54d4ff9f389f" as CanonicalRandomDomain, bc))).toBe(A_BC_BYTES);
    expect(hex(canonicalCrnValueBytes(domain, c))).not.toBe(hex(canonicalCrnValueBytes("9c5bc616973ab50bb7ae1ea133dc9333e41d916c2bad2f1ee1fa54d4ff9f389f" as CanonicalRandomDomain, bc)));
    expect(hex(canonicalCrnValueBytes(domain, c))).not.toBe(hex(canonicalCrnValueBytes(domain, ab)));
    expect(hex(canonicalCrnValueBytes(x, xyZ))).toBe(X_YZ_BYTES);
    expect(hex(canonicalCrnValueBytes(xy, z))).toBe(XY_Z_BYTES);
    expect(hex(canonicalCrnValueBytes(x, xyZ))).not.toBe(hex(canonicalCrnValueBytes(xy, z)));
  });

  test("matches the frozen legal unpaired known vector", () => {
    const coordinate = knownCoordinate();
    const semanticKey = unwrap(createUnpairedSemanticKey("public-pass"));
    const randomDomain = deriveRandomDomain(coordinate);
    const valueBytes = canonicalCrnValueBytes(randomDomain, semanticKey);
    const valueDigest = sha256Bytes(valueBytes);

    expect(semanticKey).toBe("unpaired:public-pass");
    expect(hex(valueBytes)).toBe(UNPAIRED_VALUE_BYTES);
    expect(valueDigest).toBe(UNPAIRED_VALUE_DIGEST);
    expect(valueDigest.slice(0, 16)).toBe(UNPAIRED_FIRST_EIGHT);
    const u53 = BigInt(`0x${valueDigest.slice(0, 16)}`) >> 11n;
    expect(u53).toBe(UNPAIRED_U53);
    expect(Number(u53) / 9007199254740992).toBe(UNPAIRED_VALUE);
    expect(unwrapView(createCrnView({ coordinate, randomDomain })).value(semanticKey)).toBe(UNPAIRED_VALUE);
  });
});
