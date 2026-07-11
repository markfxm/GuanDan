# 高位长组合软拆 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在危险对手的对子/夯牌路中，条件拆分 QQ 以上木板、钢板进行最小有效拦截，同时保持四头炸、同花顺硬保护。

**Architecture:** 为跟牌候选增加高位软组合拆分判定与评分；房间上下文传递对家本墩过牌状态。王炸和五头以上炸弹按独立资源例外处理，五头炸降四头后进入硬保护。

**Tech Stack:** TypeScript、Vitest、现有 AI 候选池与 `detectGroups`。

## Global Constraints

- 四头炸、同花顺不可拆。
- 王炸仅在单/对子夺权且无替代时可拆。
- 五头以上炸仅可降为四头后重构，四头部分立即硬保护。
- 木板/钢板永不拆成单张。

### Task 1: 编写失败策略测试

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/tests/game/ai.test.ts`

- [ ] 添加 QQKKAA 对 66、对家已过、无替代对子时选择 QQ 的用例。
- [ ] 添加存在普通可压对子、对手单牌、前期试探时不拆木板的用例。
- [ ] 添加 QQQKKK 对三带二时形成最小有效夯的用例。
- [ ] 运行 `npm test -- tests/game/ai.test.ts`，确认新用例失败。

### Task 2: 接入软拆候选与上下文

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/src/game/ai.ts`
- Modify: `E:/workspace/掼蛋游戏开发/src/game/room.ts`

- [ ] 向 `AiTableContext` 增加 `partnerPassedCurrentTrick`，从 `room.trick.passSeats` 注入。
- [ ] 实现 `highWoodPairResponses`：仅对子跟牌、对手赢、对家已过、无不拆替代、Q 以上木板，返回最小可压对子。
- [ ] 实现 `highPlateFullHouseResponses`：仅三带二跟牌、对手赢、对家已过、无不拆替代，生成带外部对子或同钢板重组的最小有效夯。
- [ ] 实现软拆评分，按危险对手、回收点、尾牌、阶段和过度用牌调整；禁止单牌路径调用软拆候选。
- [ ] 调整 protected-group 层：王炸条件资源、五头炸降四头规则不与硬保护冲突。
- [ ] 运行 `npm test -- tests/game/ai.test.ts`，确认通过。

### Task 3: 回归验证

**Files:**
- Modify: 无。

- [ ] 运行 `npm test -- tests/game`。
- [ ] 运行 `npm run build`。
