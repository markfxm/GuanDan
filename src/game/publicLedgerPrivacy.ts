const FORBIDDEN_KEYS = new Set([
  "partnerHand",
  "opponentsHands",
  "hands",
  "deck",
  "initialHands",
  "hiddenInitialHand",
  "hiddenState",
  "ParticleBank",
  "hypotheticalHands",
]);

export function assertPublicLedgerPrivacy(value: unknown): void {
  visit(value, new Set<object>());
}

function visit(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) visit(item, seen);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error("PUBLIC_LEDGER_PRIVACY_VIOLATION");
    visit(child, seen);
  }
}
