import { sha256Bytes } from "../../game/publicEventHash";
import type {
  CanonicalInitialDeal,
  HiddenTransferAssignment,
  ParticleBankConfigIdentity,
  ParticleLikelihoodConfig,
  ParticleScenario,
  ParticleSnapshotIdentity,
} from "./contracts";

const SCENARIO_DOMAIN = "d2-particle-scenario-canonical-v1";
const LIKELIHOOD_DOMAIN = "d2-particle-likelihood-canonical-v1";
const CONFIG_IDENTITY_SCHEMA = "d2-particle-bank-config-identity-v1";
const MAX_UINT32 = 0xffffffff;

class ByteWriter {
  private readonly bytes: number[] = [];

  writeUint8(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) throw new RangeError("BYTE_VALUE_INVALID");
    this.bytes.push(value);
  }

  writeUint32(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) throw new RangeError("UINT32_VALUE_INVALID");
    this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  writeFloat64(value: number): void {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, false);
    this.bytes.push(...new Uint8Array(buffer));
  }

  writeLengthPrefixedUtf8(value: string): void {
    if (typeof value !== "string") throw new TypeError("STRING_VALUE_INVALID");
    const encoded = new TextEncoder().encode(value);
    this.writeUint32(encoded.length);
    this.bytes.push(...encoded);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export function canonicalParticleScenarioBytes(scenario: ParticleScenario): Uint8Array {
  assertScenario(scenario);
  const writer = new ByteWriter();
  writer.writeLengthPrefixedUtf8(SCENARIO_DOMAIN);
  writer.writeLengthPrefixedUtf8(scenario.schemaVersion);
  writer.writeLengthPrefixedUtf8(scenario.initialDeal.schemaVersion);
  writer.writeUint8(4);

  for (const seat of [0, 1, 2, 3] as const) {
    const hand = scenario.initialDeal.hands[seat];
    if (!Array.isArray(hand)) throw new TypeError("HAND_INVALID");
    const cards = [...hand].sort((left, right) => compareCodeUnits(left.id, right.id));
    writer.writeUint8(seat);
    writer.writeUint32(cards.length);
    for (const card of cards) {
      if (!card || typeof card.id !== "string" || card.id.length === 0) throw new TypeError("CARD_ID_INVALID");
      writer.writeLengthPrefixedUtf8(card.id);
    }
  }

  const assignments = [...scenario.hiddenTransferAssignments].sort(compareAssignments);
  const eventIndexes = new Set<number>();
  writer.writeUint32(assignments.length);
  for (const assignment of assignments) {
    assertAssignment(assignment);
    if (eventIndexes.has(assignment.eventIndex)) throw new Error("TRANSFER_EVENT_CONFLICT");
    eventIndexes.add(assignment.eventIndex);
    writer.writeUint32(assignment.eventIndex);
    writer.writeLengthPrefixedUtf8(assignment.eventKind);
    writer.writeUint8(assignment.fromSeat);
    writer.writeUint8(assignment.toSeat);
    writer.writeLengthPrefixedUtf8(assignment.cardId);
  }

  return writer.finish();
}

export function particleScenarioIdentity(snapshot: ParticleSnapshotIdentity, scenario: ParticleScenario): string {
  assertSnapshot(snapshot);
  const scenarioBytes = canonicalParticleScenarioBytes(scenario);
  const writer = new ByteWriter();
  writer.writeLengthPrefixedUtf8(SCENARIO_DOMAIN);
  writer.writeLengthPrefixedUtf8(snapshot.gameId);
  writer.writeLengthPrefixedUtf8(snapshot.roundIdentity);
  writer.writeLengthPrefixedUtf8(snapshot.handIdentity);
  writer.writeFloat64(snapshot.lastAppliedEventIndex);
  writer.writeLengthPrefixedUtf8(snapshot.ledgerHash);
  writer.writeUint8(snapshot.perspectiveSeat);
  writer.writeLengthPrefixedUtf8(snapshot.gameRank);
  writer.writeUint32(scenarioBytes.length);
  for (const byte of scenarioBytes) writer.writeUint8(byte);
  return sha256Bytes(writer.finish());
}

export function canonicalParticleLikelihoodConfigBytes(config: ParticleLikelihoodConfig): Uint8Array {
  assertLikelihoodConfig(config);
  const writer = new ByteWriter();
  writer.writeLengthPrefixedUtf8(LIKELIHOOD_DOMAIN);
  writer.writeLengthPrefixedUtf8(config.schemaVersion);
  writer.writeFloat64(config.forcedPassLogFactor);
  writer.writeFloat64(config.couldBeatButPassedLogFactor);
  writer.writeFloat64(config.observedLeadPlayLogFactor);
  writer.writeFloat64(config.observedFollowPlayLogFactor);
  writer.writeFloat64(config.degradedEssThreshold);
  writer.writeFloat64(config.normalizationTolerance);
  writer.writeFloat64(config.essTolerance);
  return writer.finish();
}

export function likelihoodConfigHash(config: ParticleLikelihoodConfig): string {
  return sha256Bytes(canonicalParticleLikelihoodConfigBytes(config));
}

export function createParticleBankConfigIdentity(input: Readonly<{
  particleCount: number;
  maxSamplingAttempts: number;
  maxIndexDraws: number;
  samplerConfigVersion: string;
  likelihoodConfig: ParticleLikelihoodConfig;
}>): ParticleBankConfigIdentity {
  assertPositiveSafeInteger(input.particleCount, "PARTICLE_COUNT_INVALID");
  assertPositiveSafeInteger(input.maxSamplingAttempts, "ATTEMPT_LIMIT_INVALID");
  if (input.maxSamplingAttempts < input.particleCount) throw new RangeError("ATTEMPT_LIMIT_INVALID");
  assertPositiveSafeInteger(input.maxIndexDraws, "INDEX_DRAW_LIMIT_INVALID");
  if (typeof input.samplerConfigVersion !== "string" || input.samplerConfigVersion.length === 0) throw new TypeError("SAMPLER_VERSION_INVALID");
  assertLikelihoodConfig(input.likelihoodConfig);
  if (input.likelihoodConfig.degradedEssThreshold > input.particleCount) throw new RangeError("ESS_THRESHOLD_INVALID");

  return Object.freeze({
    schemaVersion: CONFIG_IDENTITY_SCHEMA,
    particleCount: input.particleCount,
    maxSamplingAttempts: input.maxSamplingAttempts,
    maxIndexDraws: input.maxIndexDraws,
    samplerConfigVersion: input.samplerConfigVersion,
    likelihoodConfigHash: likelihoodConfigHash(input.likelihoodConfig),
  });
}

function assertScenario(scenario: ParticleScenario): void {
  if (!scenario || scenario.schemaVersion !== "d2-particle-scenario-v1") throw new Error("SCENARIO_SCHEMA_INVALID");
  const deal = scenario.initialDeal as CanonicalInitialDeal;
  if (!deal || deal.schemaVersion !== "d2-particle-initial-deal-v1") throw new Error("DEAL_SCHEMA_INVALID");
  if (!Array.isArray(scenario.hiddenTransferAssignments)) throw new TypeError("ASSIGNMENTS_INVALID");
}

function assertSnapshot(snapshot: ParticleSnapshotIdentity): void {
  if (!snapshot || typeof snapshot.gameId !== "string" || typeof snapshot.roundIdentity !== "string" || typeof snapshot.handIdentity !== "string" || !Number.isFinite(snapshot.lastAppliedEventIndex) || !Number.isInteger(snapshot.lastAppliedEventIndex) || typeof snapshot.ledgerHash !== "string" || !isSeat(snapshot.perspectiveSeat) || typeof snapshot.gameRank !== "string") {
    throw new Error("SNAPSHOT_INVALID");
  }
}

function assertAssignment(assignment: HiddenTransferAssignment): void {
  if (!assignment || !Number.isSafeInteger(assignment.eventIndex) || assignment.eventIndex < 0 || assignment.eventIndex > MAX_UINT32 || (assignment.eventKind !== "tribute" && assignment.eventKind !== "return") || !isSeat(assignment.fromSeat) || !isSeat(assignment.toSeat) || typeof assignment.cardId !== "string" || assignment.cardId.length === 0) {
    throw new Error("ASSIGNMENT_INVALID");
  }
}

function assertLikelihoodConfig(config: ParticleLikelihoodConfig): void {
  if (!config || config.schemaVersion !== "d2-particle-likelihood-v1") throw new Error("LIKELIHOOD_SCHEMA_INVALID");
  for (const value of [config.forcedPassLogFactor, config.couldBeatButPassedLogFactor, config.observedLeadPlayLogFactor, config.observedFollowPlayLogFactor]) {
    if (!Number.isFinite(value) || value > 0) throw new RangeError("LOG_FACTOR_INVALID");
  }
  if (!Number.isFinite(config.degradedEssThreshold) || config.degradedEssThreshold < 1) throw new RangeError("ESS_THRESHOLD_INVALID");
  if (!isTolerance(config.normalizationTolerance) || !isTolerance(config.essTolerance)) throw new RangeError("TOLERANCE_INVALID");
}

function assertPositiveSafeInteger(value: number, errorCode: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(errorCode);
}

function isTolerance(value: number): boolean {
  return Number.isFinite(value) && value >= 1e-12 && value <= 1e-6;
}

function isSeat(value: number): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareAssignments(left: HiddenTransferAssignment, right: HiddenTransferAssignment): number {
  return left.eventIndex - right.eventIndex
    || compareCodeUnits(left.eventKind, right.eventKind)
    || left.fromSeat - right.fromSeat
    || left.toSeat - right.toSeat
    || compareCodeUnits(left.cardId, right.cardId);
}
