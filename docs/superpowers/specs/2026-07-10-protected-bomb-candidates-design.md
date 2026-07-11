# AI 炸弹保护候选机制设计

## 目标

将炸弹保护从评分偏好提升为 AI 候选生成与最终返回的不变量。普通策略下，AI 可以打出完整炸弹，但不得从炸弹、同花顺或王炸中拆牌组成普通单张、对子、三张、三带二、顺子、连对或钢板。

## 现状与根因

AI 没有独立的 `enumerateSingles` 等枚举器；首发、跟牌和多个策略辅助函数都直接调用 `detectGroups(hand, rank)`。该函数会基于完整手牌产生彼此重叠的普通组合和炸弹，因此评分上的 `breaksHighValueStructure` 无法覆盖快速返回、计划组和兜底路径。

## 共享保护层

新增 AI 专用保护模块，导出：

- `ProtectedGroup`：`id`、`type`、`cards`、`rank`、`size`、`protectionLevel`、`reason`。
- `detectProtectedGroups(hand, state)`：从完整手牌的 `detectGroups` 识别所有 `bomb`、`straight-flush`、`joker-bomb`，其中同点数炸弹至少四张。
- `getCardsAvailableForNormalPatterns(hand, protectedGroups, options)`：默认排除所有 HARD 保护组的卡牌；完整炸弹仍通过独立 power 候选保留。
- `isEmergencyBombBreakAllowed(action, handBefore, state, context)`：唯一允许拆炸的入口。默认拒绝；只有显式 `allowBreakBomb` 且动作直接出完、经明确残局批准两手内出完、或被明确标记为唯一危险封门动作时允许。
- `assertActionDoesNotBreakProtectedGroups(action, handBefore, state, context)`：对最终动作执行相同判定；违规时抛错，由选择函数继续尝试下一候选或返回 PASS。

保护级别当前统一为 `HARD`。炸弹本身、同花顺和王炸可作为完整 power 动作使用；普通动作只要使用其中任意部分卡牌即视为拆保护组。

## 候选池

新增统一的 AI 候选池构建器：

1. 用完整手牌检测 protected groups。
2. 用 `normalCards` 生成普通 `CardGroup`。
3. 用完整手牌仅提取 power groups。
4. 合并普通和 power 候选，并为每项生成调试元数据。

所有首发、跟牌、计划组、伙伴跟牌、辅助跟牌、节奏首发、残局首发和兜底首发从候选池取得可用普通组。用于结构分析、牌力评估和剩余牌评估的 `detectGroups` 可以继续读取完整手牌，但不得直接将普通 group 返回为动作。

`plannedGroups` 也进入同一校验：任何从旧计划中带来的拆炸普通组会被标记并拒绝。

## 动作诊断与不变量

`LeadAction` 和 `FollowAction` 增加：

- `breaksProtectedGroup`
- `breakReasons`
- `sourceGroups`
- `usedProtectedCards`
- `rejectedByRule`

候选构建器保留被拒绝项及其原因供测试和调试；选择函数只对未拒绝候选评分。`chooseLeadAction`、`chooseFollowAction` 和 `chooseAiAction` 在最终返回前执行断言，阻止任何快速路径绕过候选池。

## 紧急拆炸上下文

为 `AiDecisionInput` 增加可选 `bombBreakContext`：

- `allowBreakBomb?: boolean`
- `endgameSearchApproved?: boolean`
- `onlyDangerousOpponentBlock?: boolean`

生产房间流程默认不设置这些值，因而默认永不拆炸。测试可显式设置它们验证直接出完和末局授权。

## 测试

- 为 6666 单跟、对子跟、6666+22 首发、KKKK+99 首发、三枚炸弹普通阶段、直接出完拆炸、早中期高评分拆炸过滤和最终断言添加回归测试。
- 验证完整炸弹仍存在于 power 候选，而受保护卡不会出现在普通候选。
- 对 `chooseLeadAction`、`chooseFollowAction` 和 `chooseAiAction` 验证最终输出无法绕过保护。
- 执行 AI、房间、引擎、UI 全套测试及 TypeScript 构建。

## 非目标

- 不修改 `detectGroups` 的通用规则行为，避免影响人工出牌校验、规划器与 UI 分组。
- 不改写既有炸弹评分；其惩罚保留为辅助信息。
- 不在本次引入后台日志系统；候选诊断通过导出的枚举结果和动作字段提供。
