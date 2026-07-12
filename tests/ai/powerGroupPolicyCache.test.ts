import { createDeck } from "../../src/engine/cards";
import { analyzeHand } from "../../src/ai/analysis/handAnalyzer";
import { createPowerGroupPolicyIndex, evaluatePowerGroupUse } from "../../src/ai/policy/powerGroupPolicy";

it("returns identical policy verdicts when reusing a per-decision protection index", () => {
  const hand = createDeck().slice(0, 12);
  const analysis = analyzeHand(hand, "10");
  const index = createPowerGroupPolicyIndex(analysis.groups, "10");

  for (const group of analysis.groups) {
    expect(evaluatePowerGroupUse(group, hand, analysis.groups, "10"))
      .toEqual(evaluatePowerGroupUse(group, hand, analysis.groups, "10", {}, index));
  }
});
