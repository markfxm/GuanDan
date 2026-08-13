import {
  assertFinalizedPublicActionEvent,
  type PublicActionEvent,
  type PublicSeat,
} from "../../game/publicEvent";
import {
  verifyPublicActionEventHash,
} from "../../game/publicEventHash";
import type {
  HardPublicLedger,
} from "../../game/publicLedger";

export type PublicSeatRelation = "self" | "partner" | "leftOpponent" | "rightOpponent";

export type PerspectiveSeatMap = Readonly<Record<PublicSeatRelation, PublicSeat>>;

export type RelationCounts = Readonly<Record<PublicSeatRelation, number>>;

export type PublicTransferEvidence = Readonly<{
  eventIndex: number;
  kind: "tribute" | "return";
  cardId?: string;
  fromSeat: PublicSeat;
  toSeat: PublicSeat;
}>;

export type RecentPublicAction = Readonly<{
  eventIndex: number;
  kind: PublicActionEvent["kind"];
  seat: PublicSeat;
  relation: PublicSeatRelation;
  trickIndex: number;
  publicStableKey: string;
  publicCardIds: readonly string[];
  patternType?: string;
  groupType?: string;
  handCountBefore?: number;
  handCountAfter?: number;
}>;

export type RecentActionTendency = Readonly<{
  playCount: number;
  passCount: number;
  lastActionKind?: "play" | "pass";
}>;

export type EvidenceProvenance = Readonly<{
  field: string;
  publicSource: "HardPublicLedger" | "PublicActionEvent[]";
  derivation: string;
  hiddenStateRisk: "none";
  hashImpact: "none";
}>;

export type LightweightPublicEvidence = Readonly<{
  schemaVersion: "d2-lightweight-evidence-v1";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  eventIndex: number;
  perspectiveSeat: PublicSeat;
  seatMap: PerspectiveSeatMap;
  hardPublicFacts: Readonly<{
    remainingCardCounts: RelationCounts;
    currentTrick: HardPublicLedger["currentTrick"];
    initiativeRelation: PublicSeatRelation;
    playedCardIds: readonly string[];
    playedCardClasses: readonly string[];
    publicTransfers: readonly PublicTransferEvidence[];
    publicTributeEvents: readonly string[];
    finishOrder: readonly PublicSeatRelation[];
  }>;
  derivedSignals: Readonly<{
    recentActions: readonly RecentPublicAction[];
    recentPassStreakByRelation: RelationCounts;
    recentActionTendencies: Readonly<Record<PublicSeatRelation, RecentActionTendency>>;
  }>;
  provenance: readonly EvidenceProvenance[];
}>;

const EVIDENCE_PRIVACY_VIOLATION = "D2B_EVIDENCE_PRIVACY_VIOLATION";
const FORBIDDEN_PRIVACY_KEYS = new Set(
  [
    "partnerHand",
    "opponentsHands",
    "hands",
    "initialHands",
    "deck",
    "hiddenInitialHand",
    "hiddenState",
    "fullState",
    "hypotheticalHands",
    "ParticleBank",
    "particles",
    "provider",
    "store",
    "identityProvider",
    "identityStore",
    "providerIdentity",
    "installationIdentity",
    "idempotencyKey",
    "gameSequence",
    "roomTransportId",
  ].map(normalizePrivacyKey),
);
const PUBLIC_IDENTITY_KEYS = new Set(
  [
    "gameId",
    "roundIdentity",
    "handIdentity",
  ].map(normalizePrivacyKey),
);

export function deriveLightweightPublicEvidence(
  ledger: HardPublicLedger,
  recentEvents: readonly PublicActionEvent[],
  perspectiveSeat: PublicSeat,
): LightweightPublicEvidence {
  assertSeat(perspectiveSeat, "PERSPECTIVE_SEAT_INVALID");
  validateLedger(ledger);
  validateRecentEvents(ledger, recentEvents);

  const { seatMap, seatToRelation } = createSeatMapping(perspectiveSeat);
  const recentActions: RecentPublicAction[] = [];
  const recentPassStreakByRelation = createRelationCounts();
  const recentActionTendencies = createActionTendencies();

  for (const event of recentEvents) {
    const relation = seatToRelation[event.seat];
    recentActions.push(projectRecentAction(event, relation));

    if (event.kind === "pass") {
      recentPassStreakByRelation[relation] += 1;
      recentActionTendencies[relation] = {
        ...recentActionTendencies[relation],
        passCount: recentActionTendencies[relation].passCount + 1,
        lastActionKind: "pass",
      };
    } else {
      recentPassStreakByRelation[relation] = 0;
      if (event.kind === "play") {
        recentActionTendencies[relation] = {
          ...recentActionTendencies[relation],
          playCount: recentActionTendencies[relation].playCount + 1,
          lastActionKind: "play",
        };
      }
    }
  }

  const evidence: LightweightPublicEvidence = {
    schemaVersion: "d2-lightweight-evidence-v1",
    gameId: ledger.gameId,
    roundIdentity: ledger.roundIdentity,
    handIdentity: ledger.handIdentity,
    eventIndex: ledger.lastAppliedEventIndex,
    perspectiveSeat,
    seatMap,
    hardPublicFacts: {
      remainingCardCounts: mapHandCounts(ledger.handCounts, seatMap),
      currentTrick: projectPublicCurrentTrick(ledger.currentTrick),
      initiativeRelation: seatToRelation[ledger.currentTrick.lastPlaySeat ?? ledger.currentTrick.leadSeat],
      playedCardIds: [...ledger.playedCardIds],
      playedCardClasses: ledger.playedCardIds.map((cardId) => cardId.replace(/-(?:1|2)$/, "")),
      publicTransfers: ledger.revealedTransferEvents.map(clonePublicTransfer),
      publicTributeEvents: [...ledger.publicTributeEvents],
      finishOrder: ledger.finishOrder.map((seat) => seatToRelation[seat]),
    },
    derivedSignals: {
      recentActions,
      recentPassStreakByRelation,
      recentActionTendencies,
    },
    provenance: buildProvenance(),
  };

  assertLightweightPublicEvidencePrivacy(evidence);
  return deepFreeze(evidence);
}

export function assertLightweightPublicEvidencePrivacy(value: unknown): void {
  const seen = new Set<object>();

  function visit(current: unknown): void {
    if (current === null || typeof current !== "object") return;
    if (seen.has(current)) return;
    seen.add(current);

    for (const key of Object.getOwnPropertyNames(current)) {
      const normalizedKey = normalizePrivacyKey(key);
      if (!PUBLIC_IDENTITY_KEYS.has(normalizedKey) && FORBIDDEN_PRIVACY_KEYS.has(normalizedKey)) {
        throw new Error(EVIDENCE_PRIVACY_VIOLATION);
      }

      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) visit(descriptor.value);
    }
  }

  visit(value);
}

const RELATIONS = ["self", "partner", "leftOpponent", "rightOpponent"] as const;
const SEATS = [0, 1, 2, 3] as const;

function fail(reason: string): never {
  throw new Error(`D2B_PUBLIC_EVIDENCE:${reason}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSeat(value: unknown): value is PublicSeat {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function normalizePrivacyKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function projectPublicCurrentTrick(
  currentTrick: HardPublicLedger["currentTrick"],
): HardPublicLedger["currentTrick"] {
  const projected: {
    trickIndex: number;
    leadSeat: PublicSeat;
    lastPlaySeat?: PublicSeat;
    lastPlayStableKey?: string;
    passSeats: PublicSeat[];
  } = {
    trickIndex: currentTrick.trickIndex,
    leadSeat: currentTrick.leadSeat,
    passSeats: [...currentTrick.passSeats],
  };

  if (currentTrick.lastPlaySeat !== undefined) {
    projected.lastPlaySeat = currentTrick.lastPlaySeat;
  }
  if (currentTrick.lastPlayStableKey !== undefined) {
    projected.lastPlayStableKey = currentTrick.lastPlayStableKey;
  }

  return projected;
}

function assertSeat(value: unknown, reason: string): asserts value is PublicSeat {
  if (!isSeat(value)) fail(reason);
}

function validateLedger(ledger: unknown): asserts ledger is HardPublicLedger {
  if (!isRecord(ledger)) fail("LEDGER_SCHEMA_INVALID");
  if (ledger.schemaVersion !== "d2-public-ledger-v1") fail("LEDGER_SCHEMA_INVALID");
  if (typeof ledger.gameId !== "string" || ledger.gameId.length === 0) fail("LEDGER_IDENTITY_INVALID");
  if (typeof ledger.roundIdentity !== "string" || ledger.roundIdentity.length === 0) fail("LEDGER_IDENTITY_INVALID");
  if (typeof ledger.handIdentity !== "string" || ledger.handIdentity.length === 0) fail("LEDGER_IDENTITY_INVALID");
  const lastAppliedEventIndex = ledger.lastAppliedEventIndex;
  const nextEventIndex = ledger.nextEventIndex;
  if (typeof lastAppliedEventIndex !== "number" || !Number.isInteger(lastAppliedEventIndex) || lastAppliedEventIndex < -1) fail("LEDGER_INDEX_INVALID");
  if (!isNonNegativeInteger(nextEventIndex) || lastAppliedEventIndex + 1 !== nextEventIndex) fail("LEDGER_INDEX_INVALID");

  const handCounts = asRecord(ledger.handCounts, "HAND_COUNTS_INVALID");
  for (const seat of SEATS) {
    const key = String(seat);
    if (!hasOwn(handCounts, key) || !isNonNegativeInteger(handCounts[key])) fail("HAND_COUNTS_INVALID");
  }

  const currentTrick = asRecord(ledger.currentTrick, "CURRENT_TRICK_INVALID");
  if (!isNonNegativeInteger(currentTrick.trickIndex)) fail("CURRENT_TRICK_INVALID");
  assertSeat(currentTrick.leadSeat, "CURRENT_TRICK_INVALID");
  if (hasOwn(currentTrick, "lastPlaySeat") && currentTrick.lastPlaySeat !== undefined) assertSeat(currentTrick.lastPlaySeat, "CURRENT_TRICK_INVALID");
  if (hasOwn(currentTrick, "lastPlayStableKey") && currentTrick.lastPlayStableKey !== undefined && typeof currentTrick.lastPlayStableKey !== "string") fail("CURRENT_TRICK_INVALID");
  if (currentTrick.lastPlaySeat === undefined && currentTrick.lastPlayStableKey !== undefined) fail("CURRENT_TRICK_INVALID");
  validateSeatList(currentTrick.passSeats, "CURRENT_TRICK_INVALID", true);

  validateStringList(ledger.playedCardIds, "PLAYED_CARDS_INVALID");
  validateUniqueStringList(ledger.playedCardIds, "PLAYED_CARDS_INVALID");
  validateSeatList(ledger.finishOrder, "FINISH_ORDER_INVALID", true);
  validateStringList(ledger.publicTributeEvents, "TRIBUTE_STATE_INVALID");

  if (!Array.isArray(ledger.revealedTransferEvents)) fail("TRANSFER_STATE_INVALID");
  let previousTransferIndex = -1;
  for (const value of ledger.revealedTransferEvents) {
    const transfer = asRecord(value, "TRANSFER_STATE_INVALID");
    const eventIndex = transfer.eventIndex;
    if (!isNonNegativeInteger(eventIndex) || eventIndex > lastAppliedEventIndex || eventIndex <= previousTransferIndex) fail("TRANSFER_STATE_INVALID");
    previousTransferIndex = eventIndex;
    if (transfer.kind !== "tribute" && transfer.kind !== "return") fail("TRANSFER_STATE_INVALID");
    assertSeat(transfer.fromSeat, "TRANSFER_STATE_INVALID");
    assertSeat(transfer.toSeat, "TRANSFER_STATE_INVALID");
    if (transfer.cardId !== undefined && typeof transfer.cardId !== "string") fail("TRANSFER_STATE_INVALID");
  }

  if (!Array.isArray(ledger.recentActionSummaries) || ledger.recentActionSummaries.length > 16) fail("RECENT_SUMMARY_INVALID");
  const expectedRecentSummaryCount = Math.min(16, lastAppliedEventIndex + 1);
  if (ledger.recentActionSummaries.length !== expectedRecentSummaryCount) fail("RECENT_SUMMARY_INVALID");
  for (const summary of ledger.recentActionSummaries) if (!isRecord(summary)) fail("RECENT_SUMMARY_INVALID");

  const seenEventHashes = asRecord(ledger.seenEventHashes, "SEEN_EVENT_HASHES_INVALID");
  const seenKeys = Object.keys(seenEventHashes);
  if (seenKeys.length !== lastAppliedEventIndex + 1) fail("SEEN_EVENT_HASHES_INVALID");
  for (const key of seenKeys) {
    const index = Number(key);
    if (!isNonNegativeInteger(index) || String(index) !== key || typeof seenEventHashes[key] !== "string" || !/^[a-f0-9]{64}$/.test(seenEventHashes[key] as string)) {
      fail("SEEN_EVENT_HASHES_INVALID");
    }
  }
  for (let index = 0; index <= lastAppliedEventIndex; index += 1) {
    if (!hasOwn(seenEventHashes, String(index))) fail("SEEN_EVENT_HASHES_INVALID");
  }
}

function validateRecentEvents(ledger: HardPublicLedger, recentEvents: unknown): asserts recentEvents is readonly PublicActionEvent[] {
  if (!Array.isArray(recentEvents) || recentEvents.length > 16) fail("RECENT_WINDOW_INVALID");
  if (recentEvents.length !== ledger.recentActionSummaries.length) fail("RECENT_WINDOW_INVALID");
  if (ledger.lastAppliedEventIndex === -1) {
    if (recentEvents.length !== 0) fail("RECENT_WINDOW_INVALID");
    return;
  }
  if (recentEvents.length === 0) fail("RECENT_WINDOW_INVALID");
  const firstIndex = ledger.lastAppliedEventIndex - recentEvents.length + 1;
  for (let offset = 0; offset < recentEvents.length; offset += 1) {
    const event = recentEvents[offset];
    try {
      assertFinalizedPublicActionEvent(event);
      verifyPublicActionEventHash(event);
    } catch {
      fail("EVENT_INVALID");
    }
    if (event.eventIndex !== firstIndex + offset) fail("RECENT_WINDOW_INVALID");
    if (event.gameId !== ledger.gameId || event.roundIdentity !== ledger.roundIdentity || event.handIdentity !== ledger.handIdentity) fail("EVENT_IDENTITY_INVALID");
    if (ledger.seenEventHashes[event.eventIndex] !== event.publicPayloadHash) fail("EVENT_HASH_MISMATCH");
    assertSummaryMatches(ledger.recentActionSummaries[offset], event);
  }
}

function asRecord(value: unknown, reason: string): Record<string, unknown> {
  if (!isRecord(value)) fail(reason);
  return value;
}

function validateStringList(value: unknown, reason: string): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) fail(reason);
}

function validateUniqueStringList(value: readonly string[], reason: string): void {
  if (new Set(value).size !== value.length) fail(reason);
}

function validateSeatList(value: unknown, reason: string, unique: boolean): asserts value is readonly PublicSeat[] {
  if (!Array.isArray(value) || value.some((seat) => !isSeat(seat))) fail(reason);
  if (unique && new Set(value).size !== value.length) fail(reason);
}

function assertSummaryMatches(summary: unknown, event: PublicActionEvent): void {
  if (!isRecord(summary)) fail("RECENT_SUMMARY_INVALID");
  const expectedKeys = ["eventIndex", "kind", "seat", "trickIndex", "publicStableKey"];
  const actualKeys = Object.keys(summary).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== [...expectedKeys].sort()[index])) fail("RECENT_SUMMARY_INVALID");
  if (summary.eventIndex !== event.eventIndex || summary.kind !== event.kind || summary.seat !== event.seat || summary.trickIndex !== event.trickIndex || summary.publicStableKey !== event.publicStableKey) {
    fail("RECENT_SUMMARY_INVALID");
  }
}

function createSeatMapping(perspectiveSeat: PublicSeat): {
  seatMap: PerspectiveSeatMap;
  seatToRelation: Record<PublicSeat, PublicSeatRelation>;
} {
  const seatMap: PerspectiveSeatMap = {
    self: perspectiveSeat,
    partner: ((perspectiveSeat + 2) % 4) as PublicSeat,
    leftOpponent: ((perspectiveSeat + 1) % 4) as PublicSeat,
    rightOpponent: ((perspectiveSeat + 3) % 4) as PublicSeat,
  };
  const seatToRelation = {} as Record<PublicSeat, PublicSeatRelation>;
  for (const relation of RELATIONS) seatToRelation[seatMap[relation]] = relation;
  return { seatMap, seatToRelation };
}

function createRelationCounts(): Record<PublicSeatRelation, number> {
  return { self: 0, partner: 0, leftOpponent: 0, rightOpponent: 0 };
}

function createActionTendencies(): Record<PublicSeatRelation, RecentActionTendency> {
  return {
    self: { playCount: 0, passCount: 0 },
    partner: { playCount: 0, passCount: 0 },
    leftOpponent: { playCount: 0, passCount: 0 },
    rightOpponent: { playCount: 0, passCount: 0 },
  };
}

function mapHandCounts(handCounts: Readonly<Record<PublicSeat, number>>, seatMap: PerspectiveSeatMap): RelationCounts {
  return {
    self: handCounts[seatMap.self],
    partner: handCounts[seatMap.partner],
    leftOpponent: handCounts[seatMap.leftOpponent],
    rightOpponent: handCounts[seatMap.rightOpponent],
  };
}

function projectRecentAction(event: PublicActionEvent, relation: PublicSeatRelation): RecentPublicAction {
  const action: {
    eventIndex: number;
    kind: PublicActionEvent["kind"];
    seat: PublicSeat;
    relation: PublicSeatRelation;
    trickIndex: number;
    publicStableKey: string;
    publicCardIds: string[];
    patternType?: string;
    groupType?: string;
    handCountBefore?: number;
    handCountAfter?: number;
  } = {
    eventIndex: event.eventIndex,
    kind: event.kind,
    seat: event.seat,
    relation,
    trickIndex: event.trickIndex,
    publicStableKey: event.publicStableKey,
    publicCardIds: "publicCardIds" in event && event.publicCardIds !== undefined ? [...event.publicCardIds] : [],
  };
  if (event.patternType !== undefined) action.patternType = event.patternType;
  if (event.groupType !== undefined) action.groupType = event.groupType;
  if (event.handCountBefore !== undefined) action.handCountBefore = event.handCountBefore;
  if (event.handCountAfter !== undefined) action.handCountAfter = event.handCountAfter;
  return action;
}

function clonePublicTransfer(transfer: HardPublicLedger["revealedTransferEvents"][number]): PublicTransferEvidence {
  const clone: {
    eventIndex: number;
    kind: "tribute" | "return";
    cardId?: string;
    fromSeat: PublicSeat;
    toSeat: PublicSeat;
  } = {
    eventIndex: transfer.eventIndex,
    kind: transfer.kind,
    fromSeat: transfer.fromSeat,
    toSeat: transfer.toSeat,
  };
  if (transfer.cardId !== undefined) clone.cardId = transfer.cardId;
  return clone;
}

function buildProvenance(): EvidenceProvenance[] {
  const rows: Array<[string, "HardPublicLedger" | "PublicActionEvent[]", string]> = [
    ["identity/index", "HardPublicLedger", "direct immutable copy"],
    ["perspective/seatMap", "PublicActionEvent[]", "fixed modulo-4 relation mapping"],
    ["remainingCardCounts", "HardPublicLedger", "relation-keyed copy"],
    ["currentTrick", "HardPublicLedger", "immutable copy"],
    ["initiativeRelation", "HardPublicLedger", "last play or lead mapped to relation"],
    ["playedCardIds", "HardPublicLedger", "immutable ordered copy"],
    ["playedCardClasses", "HardPublicLedger", "remove public copy suffix only"],
    ["publicTransfers", "HardPublicLedger", "immutable ordered copy"],
    ["publicTributeEvents", "HardPublicLedger", "immutable ordered copy"],
    ["finishOrder", "HardPublicLedger", "public seat mapped to relation"],
    ["recentActions", "PublicActionEvent[]", "public field projection with relation mapping"],
    ["recentPassStreakByRelation", "PublicActionEvent[]", "bounded suffix pass count"],
    ["recentActionTendencies", "PublicActionEvent[]", "bounded play/pass counts and last kind"],
    ["provenance", "PublicActionEvent[]", "deterministic static rows"],
  ];
  return rows.map(([field, publicSource, derivation]) => ({
    field,
    publicSource,
    derivation,
    hiddenStateRisk: "none",
    hashImpact: "none",
  }));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
