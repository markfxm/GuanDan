import { createDeck } from "../../src/engine/cards";
import { canBeatPlay, classifyPlay } from "../../src/game/playRules";
import { generateActionCandidates } from "../../src/ai/tactics/actionGenerator";

it("generates deterministic legal leads without pass", () => {
  const hand = createDeck().slice(0, 12);
  const candidates = generateActionCandidates({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(candidates).not.toContainEqual(expect.objectContaining({ action: { type: "pass" } }));
  expect(candidates.every(({ action }) => action.type === "play" && classifyPlay(action.group.cards, "10")?.id === action.group.id)).toBe(true);
  expect(generateActionCandidates({ hand: [...hand], gameRank: "10", seat: 1, partnerSeat: 3 }).map((candidate) => candidate.stableKey)).toEqual(candidates.map((candidate) => candidate.stableKey));
});

it("only generates beating plays plus pass while following", () => {
  const hand = createDeck().slice(0, 12);
  const lastPlay = classifyPlay([createDeck()[0]!], "10")!;
  const candidates = generateActionCandidates({ hand, gameRank: "10", seat: 1, partnerSeat: 3, lastPlay });

  expect(candidates.some((candidate) => candidate.action.type === "pass")).toBe(true);
  const plays = candidates.flatMap((candidate) => candidate.action.type === "play" ? [candidate.action.group] : []);
  expect(plays.every((group) => canBeatPlay(group, lastPlay, "10"))).toBe(true);
});

it("excludes an unauthorized subset of a hard-protected bomb", () => {
  const deck = createDeck();
  const hand = ["S4-1", "C4-1", "H4-1", "D4-1", "S7-1"]
    .map((id) => deck.find((card) => card.id === id)!);
  const candidates = generateActionCandidates({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(candidates.some((candidate) => candidate.action.type === "play" && candidate.action.group.id === "single:S4-1")).toBe(false);
  expect(candidates.some((candidate) => candidate.action.type === "play" && candidate.action.group.type === "bomb")).toBe(true);
});

it("keeps a policy-approved five-card bomb reduction candidate", () => {
  const deck = createDeck();
  const hand = ["S3-1", "S4-1", "C4-1", "H4-1", "D4-1", "S4-2", "C5-1", "H6-1", "D7-1"]
    .map((id) => deck.find((card) => card.id === id)!);
  const candidates = generateActionCandidates({ hand, gameRank: "10", seat: 1, partnerSeat: 3 });

  expect(candidates.some((candidate) => candidate.action.type === "play" && candidate.action.group.type === "straight" && candidate.policyVerdict.reasonCodes.includes("LEGAL_BOMB_REDUCTION"))).toBe(true);
});
