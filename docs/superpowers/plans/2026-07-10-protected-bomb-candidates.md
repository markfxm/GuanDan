# AI 炸弹保护候选机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让普通 AI 候选永不拆分完整炸弹、同花顺或王炸，并在所有最终动作出口强制校验这一规则。

**Architecture:** 新增共享 protected-group/candidate-pool 模块。AI 的普通动作从移除 HARD protected cards 的 `normalCards` 生成，完整 power groups 从原手牌独立保留；首发、跟牌和辅助策略都通过该池过滤，并由最终断言兜底。

**Tech Stack:** TypeScript、Vitest、既有 `detectGroups`、`CardGroup`、`AiDecisionInput`。

## Global Constraints

- 默认 `allowBreakBomb` 为 `false`。
- 普通动作不得使用 HARD protected cards；完整 power action 仍可使用。
- 唯一拆炸授权入口为 `isEmergencyBombBreakAllowed`。
- `chooseLeadAction`、`chooseFollowAction`、`chooseAiAction` 必须在返回前校验。
- 不修改通用 `detectGroups`、人工出牌规则、规划器或 UI 分组规则。

---

### Task 1: 创建受保护组与候选池模块

**Files:**
- Create: `E:/workspace/掼蛋游戏开发/src/game/protectedGroups.ts`
- Create: `E:/workspace/掼蛋游戏开发/tests/game/protectedGroups.test.ts`

**Interfaces:**
- Consumes: `Card`、`GameRank`、`CardGroup`、`detectGroups`。
- Produces: `ProtectedGroup`、`BombBreakContext`、`detectProtectedGroups`、`getCardsAvailableForNormalPatterns`、`buildAiCandidatePool`、`isEmergencyBombBreakAllowed`、`assertActionDoesNotBreakProtectedGroups`。

- [ ] 写失败测试：6666 的保护组为 HARD；默认 normal cards 不包含 6；power groups 包含完整 6666。
- [ ] 写失败测试：KKKK、同花顺和四王分别被识别为 protected groups，且包含正确 type、size、reason。
- [ ] 写失败测试：默认拒绝从 6666 取单张、对子、三张和三带二；`allowBreakBomb: true` 且动作使用全部手牌时允许。
- [ ] 运行 `npm test -- tests/game/protectedGroups.test.ts`，确认模块不存在导致失败。
- [ ] 实现 protected group 检测、normal/power 候选分离和动作诊断：`breaksProtectedGroup`、`breakReasons`、`sourceGroups`、`usedProtectedCards`、`rejectedByRule`。
- [ ] 实现集中式紧急拆炸判断与断言；除动作直接出完、明确两手残局批准、或明确唯一危险封门外均拒绝。
- [ ] 运行 `npm test -- tests/game/protectedGroups.test.ts`，确认通过。

### Task 2: 将首发与跟牌候选接入候选池和最终断言

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/src/game/ai.ts`
- Modify: `E:/workspace/掼蛋游戏开发/tests/game/ai.test.ts`

**Interfaces:**
- Consumes: `buildAiCandidatePool(input.hand, input.gameRank, input.bombBreakContext)`。
- Produces: 导出的 `enumerateLeadActions`、`enumerateFollowActions`；扩展后的 `LeadAction`、`FollowAction`；最终选择断言。

- [ ] 写失败测试：6666 跟普通单牌和对子时，枚举的未拒绝跟牌候选不含 6 或 66，完整 6666 保留为 bomb candidate。
- [ ] 写失败测试：6666+22 首发不含 66622，KKKK+99 首发不含 KKK99，完整炸弹都存在。
- [ ] 写失败测试：KKKK+6666+22222 的未拒绝普通候选不使用 K、6、2；只保留对应完整 power groups。
- [ ] 写失败测试：早中期高减手评分不能让拆炸普通动作进入可选集合；最终断言拦截未批准的拆炸动作。
- [ ] 运行 `npm test -- tests/game/ai.test.ts`，确认新用例因完整手牌 `detectGroups` 而失败。
- [ ] 扩展 `AiDecisionInput` 的 `bombBreakContext`；将 `legalLeadActions` 与 `legalFollowActions` 改为基于 candidate pool；对 planned groups 应用同一诊断过滤。
- [ ] 在 `chooseLeadAction`、`chooseFollowAction` 中仅评分未拒绝候选，并在选中后调用断言；断言失败时尝试下一个候选或 PASS。
- [ ] 运行 `npm test -- tests/game/ai.test.ts`，确认所有 AI 测试通过。

### Task 3: 将所有快速策略出口接入保护不变量

**Files:**
- Modify: `E:/workspace/掼蛋游戏开发/src/game/ai.ts`
- Test: `E:/workspace/掼蛋游戏开发/tests/game/ai.test.ts`

**Interfaces:**
- Consumes: `assertActionDoesNotBreakProtectedGroups`、candidate pool 的普通/power groups。
- Produces: `chooseAiAction` 任意早返回分支均无法返回未批准的拆炸普通 group。

- [ ] 写失败测试：`chooseAiAction` 在含 6666 的普通单牌跟牌和含 KKKK+99 的首发场景不返回拆炸动作。
- [ ] 运行 `npm test -- tests/game/ai.test.ts -t "protected bomb"`，确认快速分支目前能绕过保护或没有断言。
- [ ] 新增单一 `finalizeAiAction` 出口，应用最终断言；将伙伴跟牌、support、structure-aware、节奏首发、残局首发、planned、fallback 等所有返回改经该出口。
- [ ] 将直接选择普通 `detectGroups(hand, rank)` 的策略函数改为接收 candidate pool 的普通 groups，或对其返回值做共享候选池验证；完整 power groups 单独保留。
- [ ] 运行 `rg -n "return \{ type: \"play\"" src/game/ai.ts`，人工核对每个出口经过 `finalizeAiAction`。
- [ ] 运行 `npm test -- tests/game/ai.test.ts`，确认策略回归通过。

### Task 4: 全局候选入口审查与验证

**Files:**
- Modify: 无。

**Interfaces:**
- Consumes: 完成后的 AI 保护模块和策略入口。
- Produces: 全局候选入口审查、构建与回归证据。

- [ ] 运行 `rg -n -S "enumerateSingles|enumeratePairs|enumerateTriples|enumerateTripleWithPairs|enumerateStraights|enumerateConsecutivePairs|enumeratePlanes|generateActions|getLegalActions|findBestPlay|suggestAction|chooseLeadAction|chooseFollowAction" src tests`，记录无额外枚举入口或其保护接入情况。
- [ ] 运行 `npm run build`，期望退出码 0。
- [ ] 运行 `npm test`，期望全部测试通过。
