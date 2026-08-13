import type { Card, GameRank } from "../../engine/cards";
import type { HandAnalysis } from "../contracts";
import { analyzeHand, stableHandKey } from "./handAnalyzer";

export class HandAnalysisCache {
  private readonly entries = new Map<string, HandAnalysis>();

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.entries.size;
  }

  getOrCreate(hand: Card[], gameRank: GameRank): HandAnalysis {
    return this.getOrCreateWithStatus(hand, gameRank).analysis;
  }

  getOrCreateWithStatus(hand: Card[], gameRank: GameRank): { analysis: HandAnalysis; created: boolean } {
    const key = `${gameRank}:${stableHandKey(hand)}`;
    const cached = this.entries.get(key);
    if (cached !== undefined) return { analysis: cached, created: false };
    const analysis = analyzeHand(hand, gameRank);
    this.entries.set(key, analysis);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return { analysis, created: true };
  }
}
