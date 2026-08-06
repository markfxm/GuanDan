import { sha256Bytes } from "../../game/publicEventHash";
import type {
  CanonicalRandomDomain,
  CanonicalRandomDomainLabel,
  CanonicalRandomDomainLabelResult,
  CanonicalReplicateIdentity,
  CanonicalScenarioIdentity,
  CanonicalSemanticKey,
  CanonicalSemanticKeyResult,
  CrnCoordinate,
  CrnCoordinateCreationResult,
  CrnFailure,
  RootIdentity,
} from "./contracts";

const DOMAIN_PREFIX = "D2F-CRN-DOMAIN-V1";
const VALUE_PREFIX = "D2F-CRN-VALUE-V1";
const COORDINATE_KEYS = [
  "rootIdentity",
  "scenarioIdentity",
  "replicateIdentity",
  "ply",
  "actingSeat",
  "randomDomain",
] as const;
const EVENT_KIND_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNSTABLE_EVENT_KIND_PATTERN = /^(?:candidate|worker|counter|index)-(?:id|index|position|[0-9]+)$/;

type CoordinateEnvelope = Readonly<{
  rootIdentity: unknown;
  scenarioIdentity: unknown;
  replicateIdentity: unknown;
  ply: unknown;
  actingSeat: unknown;
  randomDomain: unknown;
}>;
type CoordinateFailureField = Extract<CrnFailure, { kind: "malformed-coordinate-envelope" }>["field"];

function ok<T>(value: T): Readonly<{ ok: true; value: T }> {
  return Object.freeze({ ok: true as const, value });
}

function failed(failure: CrnFailure): Readonly<{ ok: false; failure: CrnFailure }> {
  return Object.freeze({ ok: false as const, failure: Object.freeze(failure) });
}

function isPrintableAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

function validateAsciiString(
  input: unknown,
  maximumBytes: number,
  kind: "random-domain-label" | "semantic-key",
): string | CrnFailure {
  if (typeof input !== "string") return { kind: `invalid-${kind}`, reason: "non-string" } as CrnFailure;
  if (input.length === 0) return { kind: `invalid-${kind}`, reason: "empty" } as CrnFailure;
  if (!isPrintableAscii(input)) return { kind: `invalid-${kind}`, reason: "non-printable-ascii" } as CrnFailure;
  if (input.length > maximumBytes) return { kind: `invalid-${kind}`, reason: "too-long" } as CrnFailure;
  return input;
}

export function createCanonicalRandomDomainLabel(input: unknown): CanonicalRandomDomainLabelResult {
  const value = validateAsciiString(input, 128, "random-domain-label");
  if (typeof value !== "string") return failed(value);
  return ok(value as CanonicalRandomDomainLabel);
}

export function createCanonicalSemanticKey(input: unknown): CanonicalSemanticKeyResult {
  const value = validateAsciiString(input, 256, "semantic-key");
  if (typeof value !== "string") return failed(value);
  return ok(value as CanonicalSemanticKey);
}

export function createUnpairedSemanticKey(eventKind: unknown): CanonicalSemanticKeyResult {
  if (typeof eventKind !== "string" || eventKind.length === 0) {
    return failed({
      kind: "invalid-unpaired-event-key",
      reason: eventKind === "" ? "empty-event-kind" : "invalid-event-kind",
    });
  }
  if (UNSTABLE_EVENT_KIND_PATTERN.test(eventKind)) {
    return failed({ kind: "invalid-unpaired-event-key", reason: "candidate-data" });
  }
  if (!isPrintableAscii(eventKind) || !EVENT_KIND_PATTERN.test(eventKind)) {
    return failed({ kind: "invalid-unpaired-event-key", reason: "invalid-event-kind" });
  }
  const key = `unpaired:${eventKind}`;
  const validated = createCanonicalSemanticKey(key);
  if (!validated.ok) return failed({ kind: "invalid-unpaired-event-key", reason: "invalid-event-kind" });
  return validated;
}

function identityFailure(
  value: unknown,
  kind: "root" | "scenario" | "replicate",
): string | CrnFailure {
  const failureKind = `invalid-${kind}-identity` as const;
  if (typeof value !== "string") return { kind: failureKind, reason: "non-hex" } as CrnFailure;
  if (value.length === 0) return { kind: failureKind, reason: "empty" } as CrnFailure;
  if (value.length !== 64) return { kind: failureKind, reason: "wrong-length" } as CrnFailure;
  if (/[A-F]/.test(value)) return { kind: failureKind, reason: "uppercase-hex" } as CrnFailure;
  if (!/^[a-f0-9]{64}$/.test(value)) return { kind: failureKind, reason: "non-hex" } as CrnFailure;
  return value;
}

function validatePly(value: unknown): number | CrnFailure {
  if (typeof value !== "number" || !Number.isFinite(value)) return { kind: "invalid-decision-identity", reason: "non-finite" };
  if (Object.is(value, -0)) return { kind: "invalid-decision-identity", reason: "negative-zero" };
  if (value < 0) return { kind: "invalid-decision-identity", reason: "negative" };
  if (!Number.isInteger(value)) return { kind: "invalid-decision-identity", reason: "non-integer" };
  if (!Number.isSafeInteger(value)) return { kind: "invalid-decision-identity", reason: "unsafe-integer" };
  return value;
}

function validateActingSeat(value: unknown): 0 | 1 | 2 | 3 | CrnFailure {
  if (typeof value !== "number" || !Number.isFinite(value)) return { kind: "invalid-acting-seat", reason: "unknown-seat" };
  if (Object.is(value, -0)) return { kind: "invalid-acting-seat", reason: "negative-zero-seat" };
  if (!Number.isInteger(value)) return { kind: "invalid-acting-seat", reason: "fractional-seat" };
  if (!Number.isSafeInteger(value)) return { kind: "invalid-acting-seat", reason: "unsafe-integer-seat" };
  if (value !== 0 && value !== 1 && value !== 2 && value !== 3) return { kind: "invalid-acting-seat", reason: "unknown-seat" };
  return value;
}

function malformed(field: "coordinate" | typeof COORDINATE_KEYS[number]): CrnFailure {
  const failureField: CoordinateFailureField = field === "coordinate" ? field : `coordinate.${field}` as CoordinateFailureField;
  return { kind: "malformed-coordinate-envelope", field: failureField };
}

function readCoordinateEnvelope(input: unknown): CoordinateEnvelope | CrnFailure {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) return malformed("coordinate");
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return malformed("coordinate");
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.some((key) => typeof key !== "string")) return malformed("coordinate");
    if (ownKeys.includes("candidateId") || ownKeys.includes("candidateIdentity") || ownKeys.includes("candidateAssociationIdentity")) {
      return { kind: "candidate-identity-contamination", location: "coordinate" };
    }
    if (ownKeys.length !== COORDINATE_KEYS.length) {
      const missingKey = COORDINATE_KEYS.find((key) => !ownKeys.includes(key));
      return missingKey === undefined ? malformed("coordinate") : malformed(missingKey);
    }
    for (const key of COORDINATE_KEYS) {
      if (!ownKeys.includes(key)) return malformed(key);
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value") || descriptor.get !== undefined || descriptor.set !== undefined) {
        return malformed(key);
      }
    }
    const record = input as Record<string, unknown>;
    return {
      rootIdentity: Object.getOwnPropertyDescriptor(record, "rootIdentity")!.value,
      scenarioIdentity: Object.getOwnPropertyDescriptor(record, "scenarioIdentity")!.value,
      replicateIdentity: Object.getOwnPropertyDescriptor(record, "replicateIdentity")!.value,
      ply: Object.getOwnPropertyDescriptor(record, "ply")!.value,
      actingSeat: Object.getOwnPropertyDescriptor(record, "actingSeat")!.value,
      randomDomain: Object.getOwnPropertyDescriptor(record, "randomDomain")!.value,
    };
  } catch {
    return malformed("coordinate");
  }
}

export function createCrnCoordinate(input: unknown): CrnCoordinateCreationResult {
  const envelope = readCoordinateEnvelope(input);
  if ("kind" in envelope) return failed(envelope);

  const rootIdentity = identityFailure(envelope.rootIdentity, "root");
  if (typeof rootIdentity !== "string") return failed(rootIdentity);
  const scenarioIdentity = identityFailure(envelope.scenarioIdentity, "scenario");
  if (typeof scenarioIdentity !== "string") return failed(scenarioIdentity);
  const replicateIdentity = identityFailure(envelope.replicateIdentity, "replicate");
  if (typeof replicateIdentity !== "string") return failed(replicateIdentity);
  const ply = validatePly(envelope.ply);
  if (typeof ply !== "number") return failed(ply);
  const actingSeat = validateActingSeat(envelope.actingSeat);
  if (typeof actingSeat !== "number") return failed(actingSeat);
  const randomDomain = createCanonicalRandomDomainLabel(envelope.randomDomain);
  if (!randomDomain.ok) return randomDomain;

  return ok(Object.freeze({
    rootIdentity: rootIdentity as RootIdentity,
    scenarioIdentity: scenarioIdentity as CanonicalScenarioIdentity,
    replicateIdentity: replicateIdentity as CanonicalReplicateIdentity,
    ply,
    actingSeat,
    randomDomain: randomDomain.value,
  }) as CrnCoordinate);
}

function asciiBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index);
  return bytes;
}

function identityBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function uint64Bytes(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(value / 0x100000000), false);
  view.setUint32(4, value >>> 0, false);
  return bytes;
}

class CanonicalByteWriter {
  private readonly parts: Uint8Array[] = [];

  constructor(prefix: string) {
    this.parts.push(asciiBytes(prefix), Uint8Array.of(0));
  }

  writeTlv(tag: number, payload: Uint8Array): void {
    if (!Number.isInteger(tag) || tag < 0 || tag > 0xff) throw new RangeError("CRN_TAG_INVALID");
    if (payload.length > 0xffffffff) throw new RangeError("CRN_LENGTH_INVALID");
    const header = new Uint8Array(5);
    const view = new DataView(header.buffer);
    header[0] = tag;
    view.setUint32(1, payload.length, false);
    this.parts.push(header, payload);
  }

  finish(): Uint8Array {
    const length = this.parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of this.parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
}

export function canonicalCrnDomainBytes(coordinate: CrnCoordinate): Uint8Array {
  const writer = new CanonicalByteWriter(DOMAIN_PREFIX);
  writer.writeTlv(0x01, identityBytes(coordinate.rootIdentity));
  writer.writeTlv(0x02, identityBytes(coordinate.scenarioIdentity));
  writer.writeTlv(0x03, identityBytes(coordinate.replicateIdentity));
  writer.writeTlv(0x04, uint64Bytes(coordinate.ply));
  writer.writeTlv(0x05, Uint8Array.of(coordinate.actingSeat));
  writer.writeTlv(0x06, asciiBytes(coordinate.randomDomain));
  return writer.finish();
}

export function deriveRandomDomain(coordinate: CrnCoordinate): CanonicalRandomDomain {
  return sha256Bytes(canonicalCrnDomainBytes(coordinate)) as CanonicalRandomDomain;
}

export function canonicalCrnValueBytes(
  randomDomain: CanonicalRandomDomain,
  semanticKey: CanonicalSemanticKey,
): Uint8Array {
  const writer = new CanonicalByteWriter(VALUE_PREFIX);
  writer.writeTlv(0x01, identityBytes(randomDomain));
  writer.writeTlv(0x02, asciiBytes(semanticKey));
  return writer.finish();
}
