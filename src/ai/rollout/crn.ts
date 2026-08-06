import { sha256Bytes } from "../../game/publicEventHash";
import type {
  CanonicalRandomDomain,
  CanonicalSemanticKey,
  CrnFailure,
  CrnView,
  CrnViewCreationResult,
} from "./contracts";
import {
  canonicalCrnValueBytes,
  createCrnCoordinate,
} from "./identity";

type ViewEnvelope = Readonly<{
  coordinate: unknown;
  randomDomain: unknown;
}>;

function failed(failure: CrnFailure): Readonly<{ ok: false; failure: CrnFailure }> {
  return Object.freeze({ ok: false as const, failure: Object.freeze(failure) });
}

function readViewEnvelope(input: unknown): ViewEnvelope | CrnFailure {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { kind: "malformed-coordinate-envelope", field: "view-input" };
    }
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return { kind: "malformed-coordinate-envelope", field: "view-input" };
    }
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.some((key) => typeof key !== "string")) {
      return { kind: "malformed-coordinate-envelope", field: "view-input" };
    }
    if (ownKeys.includes("candidateId") || ownKeys.includes("candidateIdentity") || ownKeys.includes("candidateAssociationIdentity")) {
      return { kind: "candidate-identity-contamination", location: "view-state" };
    }
    if (ownKeys.length !== 2 || !ownKeys.includes("coordinate") || !ownKeys.includes("randomDomain")) {
      return { kind: "malformed-coordinate-envelope", field: "view-input" };
    }
    for (const key of ["coordinate", "randomDomain"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) {
        return { kind: "malformed-coordinate-envelope", field: `view-input.${key}` };
      }
    }
    const record = input as Record<string, unknown>;
    return {
      coordinate: Object.getOwnPropertyDescriptor(record, "coordinate")!.value,
      randomDomain: Object.getOwnPropertyDescriptor(record, "randomDomain")!.value,
    };
  } catch {
    return { kind: "malformed-coordinate-envelope", field: "view-input" };
  }
}

function isCanonicalDigest(value: unknown): value is CanonicalRandomDomain {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function hashToValue(valueBytes: Uint8Array): number {
  const digest = sha256Bytes(valueBytes);
  const uint64 = BigInt(`0x${digest.slice(0, 16)}`);
  const u53 = uint64 >> 11n;
  const value = Number(u53) / 9007199254740992;
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : 0;
}

export function createCrnView(input: unknown): CrnViewCreationResult {
  const envelope = readViewEnvelope(input);
  if ("kind" in envelope) return failed(envelope);

  const coordinate = createCrnCoordinate(envelope.coordinate);
  if (!coordinate.ok) return coordinate;
  if (!isCanonicalDigest(envelope.randomDomain)) {
    return failed({ kind: "canonical-encoding-failure", field: "payload" });
  }
  const randomDomain = envelope.randomDomain;
  const view: CrnView = Object.freeze({
    value(semanticKey: CanonicalSemanticKey): number {
      return hashToValue(canonicalCrnValueBytes(randomDomain, semanticKey));
    },
  });
  return Object.freeze({ ok: true as const, view });
}
