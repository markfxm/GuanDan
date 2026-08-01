import { RANKS, createDeck, type Card, type GameRank } from "../../engine/cards";
import { canonicalPublicLedgerHash, type HardPublicLedger } from "../../game/publicLedger";
import type { PublicActionEvent, PublicGameIdentity, PublicSeat, PublicTributeEvent } from "../../game/publicEvent";
import type { CanonicalInitialDeal, HiddenTransferAssignment, ParticleScenario } from "./contracts";
import { particleScenarioIdentity } from "./canonicalDeal";
import { validateCanonicalInitialDeal } from "./particleConservation";
import { replayParticleScenario, type ActingSeatInitialDealConstraints } from "./publicEventDealReplay";
import { createDeterministicParticleRng } from "./deterministicParticleRng";

type ConstrainedParticleSamplerInput = Readonly<{
  publicIdentity: PublicGameIdentity;
  constraints: ActingSeatInitialDealConstraints;
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  particleSeed: number;
  particleCount: number;
  maxSamplingAttempts: number;
  maxIndexDraws: number;
  samplerConfigVersion: string;
}>;

type ConstrainedParticleSamplerResult = Readonly<{
  scenarios: readonly ParticleScenario[];
  attempts: number;
  duplicateCount: number;
}>;

class ParticleSamplingExhaustedError extends Error {
  readonly code = "PARTICLE_SAMPLING_ATTEMPTS_EXHAUSTED" as const;
  readonly requestedCount: number;
  readonly acceptedCount: number;
  readonly attempts: number;
  readonly duplicateCount: number;
  readonly maxSamplingAttempts: number;

  constructor(input: Readonly<{
    requestedCount: number;
    acceptedCount: number;
    attempts: number;
    duplicateCount: number;
    maxSamplingAttempts: number;
  }>) {
    super("particle sampling attempts exhausted");
    this.name = "ParticleSamplingExhaustedError";
    this.requestedCount = input.requestedCount;
    this.acceptedCount = input.acceptedCount;
    this.attempts = input.attempts;
    this.duplicateCount = input.duplicateCount;
    this.maxSamplingAttempts = input.maxSamplingAttempts;
  }
}

const SEATS: readonly PublicSeat[] = [0, 1, 2, 3];

export function sampleConstrainedParticleScenarios(
  input: ConstrainedParticleSamplerInput,
): ConstrainedParticleSamplerResult {
  validateInput(input);
  const rng = createDeterministicParticleRng(input.particleSeed, input.maxIndexDraws);
  const accepted: ParticleScenario[] = [];
  const identities = new Set<string>();
  let attempts = 0;
  let duplicateCount = 0;
  const snapshot = {
    gameId: input.publicIdentity.gameId,
    roundIdentity: input.publicIdentity.roundIdentity,
    handIdentity: input.publicIdentity.handIdentity,
    initialLedgerHash: canonicalPublicLedgerHash(input.initialLedger),
    lastAppliedEventIndex: input.finalLedger.lastAppliedEventIndex,
    ledgerHash: canonicalPublicLedgerHash(input.finalLedger),
    perspectiveSeat: input.perspectiveSeat,
    gameRank: input.gameRank,
  };

  while (accepted.length < input.particleCount && attempts < input.maxSamplingAttempts) {
    attempts += 1;
    let scenario: ParticleScenario;
    try {
      scenario = buildCandidate(input, rng);
      validateCanonicalInitialDeal(scenario.initialDeal);
      replayParticleScenario({
        scenario,
        publicHistoryEvents: input.publicHistoryEvents,
        initialLedger: input.initialLedger,
        finalLedger: input.finalLedger,
        gameRank: input.gameRank,
        perspectiveSeat: input.perspectiveSeat,
        ownCurrentHand: input.ownCurrentHand,
      });
      const identity = particleScenarioIdentity(snapshot, scenario);
      if (identities.has(identity)) {
        duplicateCount += 1;
        continue;
      }
      identities.add(identity);
      accepted.push(deepFreeze(clone(scenario)));
    } catch (error) {
      if (isBoundedIndexDrawExhausted(error)) throw error;
    }
  }

  if (accepted.length !== input.particleCount) {
    throw new ParticleSamplingExhaustedError({
      requestedCount: input.particleCount,
      acceptedCount: accepted.length,
      attempts,
      duplicateCount,
      maxSamplingAttempts: input.maxSamplingAttempts,
    });
  }
  return deepFreeze({ scenarios: accepted, attempts, duplicateCount });
}

function validateInput(input: ConstrainedParticleSamplerInput): void {
  if (!isRecord(input.publicIdentity) || typeof input.publicIdentity.gameId !== "string" || typeof input.publicIdentity.roundIdentity !== "string" || typeof input.publicIdentity.handIdentity !== "string") throw new TypeError("PUBLIC_IDENTITY_INVALID");
  if (!Number.isInteger(input.particleSeed) || input.particleSeed < 0 || input.particleSeed > 0xffffffff) throw new TypeError("PARTICLE_SEED_INVALID");
  if (!Number.isSafeInteger(input.particleCount) || input.particleCount < 1) throw new TypeError("PARTICLE_COUNT_INVALID");
  if (!Number.isSafeInteger(input.maxSamplingAttempts) || input.maxSamplingAttempts < 1) throw new TypeError("MAX_SAMPLING_ATTEMPTS_INVALID");
  if (!Number.isSafeInteger(input.maxIndexDraws) || input.maxIndexDraws < 1) throw new TypeError("MAX_INDEX_DRAWS_INVALID");
  if (typeof input.samplerConfigVersion !== "string" || input.samplerConfigVersion.length === 0) throw new TypeError("SAMPLER_CONFIG_VERSION_INVALID");
  if (!SEATS.includes(input.perspectiveSeat)) throw new TypeError("PERSPECTIVE_SEAT_INVALID");
  if (!(RANKS as readonly string[]).includes(input.gameRank)) throw new TypeError("GAME_RANK_INVALID");
  if (!Array.isArray(input.publicHistoryEvents) || input.publicHistoryEvents.length === 0) throw new TypeError("PUBLIC_HISTORY_INVALID");
  if (!Array.isArray(input.ownCurrentHand)) throw new TypeError("OWN_CURRENT_HAND_INVALID");
  if (!isRecord(input.constraints) || !Array.isArray(input.constraints.terminalOwnCurrentHand)) throw new TypeError("CONSTRAINTS_INVALID");
}

function buildCandidate(input: ConstrainedParticleSamplerInput, rng: Readonly<{ nextIndex(exclusiveUpperBound: number): number }>): ParticleScenario {
  const deck = createDeck();
  const byId = new Map(deck.map((card) => [card.id, card]));
  const publicPlayedBySeat = new Map<PublicSeat, string[]>();
  for (const seat of SEATS) publicPlayedBySeat.set(seat, []);
  for (const event of input.publicHistoryEvents) if (event.kind === "play") publicPlayedBySeat.get(event.seat)!.push(...event.publicCardIds);
  const publicPlayed = new Set([...publicPlayedBySeat.values()].flat());
  const hiddenEvents = input.publicHistoryEvents.filter(
    (event): event is PublicTributeEvent =>
      (event.kind === "tribute" || event.kind === "return") &&
      event.publicCardIds.length === 0,
  );
  const ownTerminalIds = new Set(input.constraints.terminalOwnCurrentHand.map((card) => card.id));
  const ownInitialIds = new Set(ownTerminalIds);
  for (const id of input.constraints.knownRevealedIncomingTransferCardIds) ownInitialIds.delete(id);
  for (const id of input.constraints.knownRevealedOutgoingTransferCardIds) ownInitialIds.add(id);
  for (const id of input.constraints.ownPublicPlayedCardIds) ownInitialIds.add(id);

  const availableOutgoing = deck.filter((card) => !ownTerminalIds.has(card.id) && !publicPlayed.has(card.id) && !ownInitialIds.has(card.id));
  const availableIncoming = deck.filter((card) => ownTerminalIds.has(card.id));
  const draw = rng.nextIndex(2 ** 32);
  const chosenOutgoing = new Map<number, string>();
  const chosenIncoming = new Map<number, string>();
  let outgoingOffset = draw % Math.max(1, availableOutgoing.length);
  let incomingOffset = Math.floor(draw / Math.max(1, availableOutgoing.length)) % Math.max(1, availableIncoming.length);
  for (const event of hiddenEvents) {
    if (event.fromSeat === input.perspectiveSeat) {
      const card = availableOutgoing[outgoingOffset % Math.max(1, availableOutgoing.length)];
      if (!card) throw new Error("OUTGOING_TRANSFER_POOL_EMPTY");
      chosenOutgoing.set(event.eventIndex, card.id);
      outgoingOffset += 1;
    }
    if (event.toSeat === input.perspectiveSeat) {
      const card = availableIncoming[incomingOffset % Math.max(1, availableIncoming.length)];
      if (!card) throw new Error("INCOMING_TRANSFER_POOL_EMPTY");
      chosenIncoming.set(event.eventIndex, card.id);
      incomingOffset += 1;
    }
  }
  for (const id of chosenIncoming.values()) ownInitialIds.delete(id);
  for (const id of chosenOutgoing.values()) ownInitialIds.add(id);
  for (const id of publicPlayedBySeat.get(input.perspectiveSeat)!) ownInitialIds.add(id);
  if (ownInitialIds.size !== input.constraints.expectedInitialHandCount) throw new Error("PERSPECTIVE_INITIAL_HAND_COUNT_INVALID");

  const fixedIds = new Map<PublicSeat, Set<string>>();
  for (const seat of SEATS) fixedIds.set(seat, new Set());
  for (const id of ownInitialIds) fixedIds.get(input.perspectiveSeat)!.add(id);
  for (const seat of SEATS) {
    if (seat === input.perspectiveSeat) continue;
    for (const id of publicPlayedBySeat.get(seat)!) fixedIds.get(seat)!.add(id);
  }
  for (const event of input.publicHistoryEvents) {
    if ((event.kind === "tribute" || event.kind === "return") && event.publicCardIds.length === 1) fixedIds.get(event.fromSeat)!.add(event.publicCardIds[0]!);
  }
  for (const event of hiddenEvents) {
    const id = event.fromSeat === input.perspectiveSeat
      ? chosenOutgoing.get(event.eventIndex)
      : event.toSeat === input.perspectiveSeat
        ? chosenIncoming.get(event.eventIndex)
        : chooseOtherTransferCard(deck, fixedIds, event.fromSeat, publicPlayed, ownInitialIds, draw + event.eventIndex);
    if (!id) throw new Error("HIDDEN_TRANSFER_CARD_UNSELECTED");
    fixedIds.get(event.fromSeat)!.add(id);
  }

  const used = new Set<string>();
  const hands: Record<PublicSeat, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const seat of SEATS) {
    for (const id of fixedIds.get(seat)!) {
      if (used.has(id)) throw new Error("FIXED_CARD_COLLISION");
      const card = byId.get(id);
      if (!card) throw new Error("FIXED_CARD_UNKNOWN");
      hands[seat].push(clone(card));
      used.add(id);
    }
    if (hands[seat].length > 27) throw new Error("FIXED_HAND_TOO_LARGE");
  }
  for (const seat of SEATS) {
    for (const card of deck) {
      if (hands[seat].length === 27) break;
      if (used.has(card.id)) continue;
      hands[seat].push(clone(card));
      used.add(card.id);
    }
    if (hands[seat].length !== 27) throw new Error("HAND_FILL_FAILED");
  }
  if (used.size !== 108) throw new Error("DECK_CONSERVATION_FAILED");

  const assignments: HiddenTransferAssignment[] = hiddenEvents.map((event) => ({
    eventIndex: event.eventIndex,
    eventKind: event.kind,
    fromSeat: event.fromSeat,
    toSeat: event.toSeat,
    cardId: event.fromSeat === input.perspectiveSeat
      ? chosenOutgoing.get(event.eventIndex)!
      : event.toSeat === input.perspectiveSeat
        ? chosenIncoming.get(event.eventIndex)!
        : [...fixedIds.get(event.fromSeat)!][0]!,
  }));
  const deal: CanonicalInitialDeal = {
    schemaVersion: "d2-particle-initial-deal-v1",
    hands,
  };
  return {
    schemaVersion: "d2-particle-scenario-v1",
    initialDeal: deal,
    hiddenTransferAssignments: assignments,
  };
}

function chooseOtherTransferCard(
  deck: readonly Card[],
  fixedIds: ReadonlyMap<PublicSeat, Set<string>>,
  fromSeat: PublicSeat,
  publicPlayed: ReadonlySet<string>,
  ownInitialIds: ReadonlySet<string>,
  offset: number,
): string | undefined {
  const used = new Set<string>([...fixedIds.values()].flatMap((ids) => [...ids]));
  const choices = deck.filter((card) => !used.has(card.id) && !publicPlayed.has(card.id) && !ownInitialIds.has(card.id));
  return choices[(offset + fromSeat) % Math.max(1, choices.length)]?.id;
}

function isBoundedIndexDrawExhausted(error: unknown): boolean {
  return isRecord(error) && error.name === "BoundedIndexDrawExhaustedError" && error.code === "BOUNDED_INDEX_DRAW_EXHAUSTED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
