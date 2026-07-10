# 三带二梯队与回收点保留 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 在早中期首发三带二时优先保留更大的同牌型回收动作，而不是先打最高三带二。

**Architecture:** 在 `chooseLeadAction` 的评分层为三带二候选计算梯队与打后剩余手牌特征。仅在早中期将这些特征纳入评分；已有的残局、硬规则和通用首发排序保持不变。

**Tech Stack:** TypeScript、Vitest、现有 `detectGroups` 组合识别。

## Global Constraints

- 仅修改首发候选评分与 AI 策略测试。
- 不修改组合判定和游戏规则。
- 早中期应优先低三带二并保留更高同型或炸弹类回收点。
- 最高三带二在直接出完、两手内出完、后期、对手报牌或保留强控制牌时可以首发。

---

### Task 1: 添加三带二梯队回归测试

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/tests/game/ai.test.ts`

**Interfaces:**
- Consumes: `chooseLeadAction(input: AiDecisionInput): LeadAction | undefined`
- Produces: 一个覆盖早期首发三带二梯队选择的失败回归测试。

- [ ] **Step 1: 写入失败测试**

```ts
it("chooseLeadAction opens the lowest triple with pair while preserving higher recovery actions", () => {
  const hand = [
    suited("A", "spades"), suited("A", "clubs"), suited("A", "diamonds"),
    suited("J", "spades"), suited("J", "clubs"), suited("J", "diamonds"),
    suited("7", "spades"), suited("7", "clubs"), suited("7", "diamonds"),
    suited("10", "spades"), suited("10", "clubs"),
    suited("5", "spades"), suited("5", "clubs"),
    suited("3", "spades"), suited("3", "clubs"),
  ];

  const action = chooseLeadAction({
    hand,
    gameRank: "2",
    seat: 1,
    partnerSeat: 3,
    context: { ownHandCount: 20, partnerHandCount: 20, opponentHandCounts: [20, 20], playedCards: [], finishOrder: [] },
  });

  expect(action?.type).toBe("TRIPLE_WITH_PAIR");
  expect(action?.cards.filter((card) => card.rank === "7")).toHaveLength(3);
  expect(action?.cards.some((card) => card.rank === "A")).toBe(false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/game/ai.test.ts`

Expected: 新用例失败，现有首发评分选择最高或非 `77733` 的候选。

### Task 2: 在首发评分中增加三带二梯队与回收点特征

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/src/game/ai.ts:34-45`
- Modify: `E:/workspace/掼蛋游戏开发/src/game/ai.ts:794-840`

**Interfaces:**
- Consumes: `LeadAction`、`legalLeadActions`、`remainingCardsAfter`、`detectGroups`、`isPowerPlay`。
- Produces: `TRIPLE_WITH_PAIR` 的梯队评分特征，并由 `scoreEarlyLead` 使用。

- [ ] **Step 1: 扩充首发动作的可观察特征**

```ts
type LeadAction = {
  type: LeadActionType;
  group: CardGroup;
  cards: Card[];
  mainRank: Card["rank"];
  strength: number;
  consumesControl: boolean;
  consumesWildcard: boolean;
  isLowValue: boolean;
  isTailCandidate: boolean;
  isHighestSameTypeAction?: boolean;
  hasLowerSameTypeAction?: boolean;
  leavesHigherSameTypeRecovery?: boolean;
  leavesBombRecovery?: boolean;
  futureHandPlanScore?: number;
};
```

- [ ] **Step 2: 计算三带二候选打出后的梯队状态**

```ts
function tripleWithPairRecoveryFeatures(action: LeadAction, input: AiDecisionInput, actions: LeadAction[]) {
  const sameType = actions.filter((candidate) => candidate.type === "TRIPLE_WITH_PAIR");
  const remainingGroups = detectGroups(remainingCardsAfter(action, input.hand), input.gameRank);
  const actionRank = rankStrength(action.mainRank, input.gameRank);
  return {
    isHighestSameTypeAction: sameType.every((candidate) => rankStrength(candidate.mainRank, input.gameRank) <= actionRank),
    hasLowerSameTypeAction: sameType.some((candidate) => rankStrength(candidate.mainRank, input.gameRank) < actionRank),
    leavesHigherSameTypeRecovery: remainingGroups.some((group) => group.type === "full-house" && rankStrength(mainRank(group, input.gameRank), input.gameRank) > actionRank),
    leavesBombRecovery: remainingGroups.some(isPowerPlay),
  };
}
```

- [ ] **Step 3: 将特征接入早中期评分**

```ts
if (action.type === "TRIPLE_WITH_PAIR") {
  const features = tripleWithPairRecoveryFeatures(action, input, allActions);
  if (features.leavesHigherSameTypeRecovery || features.leavesBombRecovery) score += 70;
  if (features.isHighestSameTypeAction && !features.leavesHigherSameTypeRecovery && !features.leavesBombRecovery && !canExceptionallyLeadHighTriple(action, input)) score -= 120;
  score += futureHandPlanScore(action, input, features);
}
```

`canExceptionallyLeadHighTriple` 仅在直接出完、两手内出完、后期、任一对手已报牌，或打后仍保留炸弹/同花顺时返回 `true`。

- [ ] **Step 4: 运行目标测试确认通过**

Run: `npm test -- tests/game/ai.test.ts`

Expected: `tests/game/ai.test.ts` 全部通过，新增用例选择 `77733`。

### Task 3: 回归验证

**Files:**
- Modify: 无

**Interfaces:**
- Consumes: 完成后的 AI 策略实现和测试。
- Produces: 编译与策略回归证据。

- [ ] **Step 1: 执行 TypeScript 构建**

Run: `npm run build`

Expected: 退出码 0。

- [ ] **Step 2: 执行游戏测试目录**

Run: `npm test -- tests/game`

Expected: 退出码 0，所有游戏策略测试通过。
