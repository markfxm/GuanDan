# AI 行牌热路径性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将普通 AI 等待改为 4 秒，并从玩家过牌和 AI 首发热路径移除重复的同步完整规划。

**Architecture:** UI 只在玩家实际获得行动权且手牌变化时请求提示计划。AI 决策复用房间快速计划，房间仅在当前 AI 的计划无法覆盖剩余手牌时按座位惰性刷新。

**Tech Stack:** TypeScript、React、Vitest、Fastify、现有轻量 `buildFastAiPlanGroups`。

## Global Constraints

- 默认普通 AI 等待为 `4_000ms`，首发等待保持 `3_000ms`。
- AI 决策热路径不得调用完整 `generatePlans`。
- 玩家过牌以及 AI 回合不得触发玩家 `/api/plans` 请求。
- 不修改牌型规则和 AI 策略权重。
- 不引入 Worker、子进程或新的缓存服务。

---

### Task 1: 缩短 UI 等待并限制玩家规划请求

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/tests/ui/app.test.tsx`
- Modify: `E:/workspace/掼蛋游戏开发/src/ui/App.tsx`

**Interfaces:**
- Consumes: `generatePlans(cards, rank)`、`humanTurn`、`room.humanHand`。
- Produces: 默认 4 秒倒计时；只在玩家回合按手牌签名刷新提示计划。

- [ ] 修改默认倒计时测试，使其期望“倒计时 4 秒”。
- [ ] 新增 UI 测试：玩家过牌进入 AI 回合后，`fetch` 对 `/api/plans` 的调用次数不增加。
- [ ] 运行 `npm test -- tests/ui/app.test.tsx`，确认两个用例因当前 10 秒和重复请求而失败。
- [ ] 将 `AI_PAUSE_MS` 改为 `4_000`，并让规划 effect 依赖房间 ID、级牌、玩家回合和排序后的手牌 ID 签名；非玩家回合直接返回。
- [ ] 更新受调用序列变化影响的 mock 队列，运行 `npm test -- tests/ui/app.test.tsx`，确认通过。

### Task 2: 从 AI 首发热路径移除完整规划器

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/src/game/ai.ts`
- Test: `E:/workspace/掼蛋游戏开发/tests/game/ai.test.ts`

**Interfaces:**
- Consumes: `AiDecisionInput.plannedGroups`、现有轻量候选和首发评分。
- Produces: `chooseAiAction` 不再导入或调用 `generatePlans`。

- [ ] 使用现有首发策略用例作为行为基线，先运行 `npm test -- tests/game/ai.test.ts` 并记录通过结果。
- [ ] 删除 `generatePlans` 导入；让 `refreshedLeadPlannedGroups` 直接使用有效的 fallback groups；让 linked 首发只检查传入的 planned groups。
- [ ] 运行 `rg -n "generatePlans" src/game/ai.ts`，期望无匹配。
- [ ] 运行 `npm test -- tests/game/ai.test.ts`，确认全部策略行为保持通过。

### Task 3: AI 快速计划按座位惰性刷新

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/tests/game/room.test.ts`
- Modify: `E:/workspace/掼蛋游戏开发/src/game/room.ts`

**Interfaces:**
- Consumes: `room.aiPlans[seat]`、`room.hands[seat]`、`buildAiPlan(room, seat)`。
- Produces: `ensureAiPlanForSeat(room, seat)`，仅在有效计划组不能覆盖当前手牌时重建该 AI 计划。

- [ ] 将“每墩立即重建全部计划”测试拆为两个行为：过牌清墩不重建；当前 AI 真正行动且计划失效时只刷新该座位。
- [ ] 运行相关 `room.test.ts` 用例，确认当前同步重建行为导致测试失败。
- [ ] 删除 `passTurn` 中清空和立即 `ensureAiPlans`；新增按卡牌 ID 校验覆盖范围的 `ensureAiPlanForSeat`，并在 `runAiStep` 中只调用当前座位。
- [ ] 运行 `npm test -- tests/game/room.test.ts`，确认房间测试通过。

### Task 4: 完整验证

**Files:**
- Modify: 无。

**Interfaces:**
- Consumes: 完成后的 UI、AI 和房间实现。
- Produces: 构建与全套回归证据。

- [ ] 运行 `npm run build`，期望退出码 0。
- [ ] 运行 `npm test`，期望全部测试通过。
