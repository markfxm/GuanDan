# AI 决策迁移映射（C1）

> C3b update: `decideAiAction` is now the sole production decision body.
> `src/game/ai.ts` is a thin compatibility adapter; the former implementation
> lives only at `tests/helpers/legacyAiReference.ts` for shadow/reference tests.
> There is no production legacy switch, fallback, or shadow double execution.

本轮保持 `src/game/ai.ts` 的 `chooseAiAction` 作为生产入口，仅提取可独立验证的纯能力；不导入 RoomState，也不读取隐藏手牌。

| 当前函数/区域 | 目标模块 | 外部调用方 | 纯函数 | 隐藏信息 | C1 状态 |
| --- | --- | --- | --- | --- | --- |

## C2 decision engine flow

`decideAiAction` obtains one cached HandAnalysis, uses PlanManager for runtime reuse or replanning, evaluates the visible-hand role, generates legal policy-approved candidates, evaluates them with stable score ordering, then performs final play-rules and PowerGroupPolicy validation. It returns runtime, selected plan id, score breakdown, candidate count, elapsed time and reason codes.

The legacy `chooseAiAction` path remains the production return path. C2 shadow tests call the two entries independently; no room call site invokes the unified engine.
| `classifyAiRole`、控制/强牌资源统计 | `ai/tactics/roleEvaluator.ts` | `chooseAiAction`、AI 测试 | 是 | 否 | 已迁入；旧接口委托新实现 |
| `legalLeadActions`、`legalFollowActions`、`toLeadAction`、`toFollowAction` | `ai/tactics/actionGenerator.ts` | `chooseLeadAction`、`chooseFollowAction` | 是 | 否 | 建立统一的合法+政策候选生成；旧路径暂保留 |
| `scoreFollowAction`、`scoreEarlyLead`、`scoreLateLead`、比较器 | `ai/tactics/actionEvaluator.ts` | `chooseLeadAction`、`chooseFollowAction` | 是 | 否 | 建立结构化公共评分；旧精细评分暂保留用于 C2 对照 |
| `chooseAiAction`、`chooseAiActionUnsafe`、领跟牌优先级编排、最终验证和兜底 | `game/ai.ts` | room、API、测试 | 否（调用链） | 仅现有可选 `partnerHand` | 保留，C2 再迁入 `aiDecisionEngine` |
| 队友让牌、残局危险、计划优先和调试 | `game/ai.ts` | `chooseAiAction` | 多数为纯函数 | 部分读取可选 `partnerHand` | 保留，避免本轮策略重写 |

`actionGenerator` 通过 `HandAnalysisCache` 获取静态手牌分析，通过 `playRules` 过滤绝对非法动作，并使用 `PowerGroupPolicy.evaluatePowerGroupUse` 过滤硬保护违规。`actionEvaluator` 只接受已合法且政策批准的 `ActionCandidate`，其权重集中在 `ai/config.ts`。C2 的目标是令旧流程以新模块为主并在测试配置中与旧细粒度策略对照，最后才切换入口。
