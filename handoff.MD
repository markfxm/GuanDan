# AI 架构迁移交接

## 任务

本项目正在进行掼蛋 AI 架构迁移，不是策略增强。目标是统一规划、强牌政策、
候选生成、评分和决策，同时保持游戏规则、房间 API 与前端协议兼容。

唯一生产链：`room.ts -> decideAiAction -> PlanManager -> HandPlanner -> tactics -> playRules/PowerGroupPolicy`。

## 已完成

- `HandAnalysis` 已是带缓存的纯静态手牌分析；不含动态 BombBreakContext。
- `PowerGroupPolicy` 是强牌保护、炸弹降级和保护损失的唯一规则源。
- `PlanEvaluator`、`HandPlanner`、`PlanManager` 已取代 room 中旧快速/贪心/Beam 规划。
- `aiDecisionEngine` 实际调用分析、计划、角色、候选、评分和最终校验。
- `room.ts` 只协调房间状态并复验游戏绝对合法性；不含 AI 评分或规划搜索。
- `AiObservation` 仅含本家手牌与公开信息；隐藏手牌等价性有回归测试。
- runtime/aiPlans 仅在 play/pass 成功后提交，且按座位隔离。
- PlanManager 已支持 pass 复用、精确继承、局部修复、轻量重规划及完整兜底。

## C3b：当前已完成、尚未提交

- `src/game/ai.ts` 从历史 2,556 行收缩为约 121 行薄兼容层。
- 它保留 `chooseAiAction`、`chooseLeadAction`、`chooseFollowAction`、
  `classifyAiRole` 等旧名称，只构造公开 AiObservation、调用一次 unified engine、转换结果。
- 它忽略 `partnerHand` 与 `plannedGroups`，不含候选搜索、评分、规划、政策或 fallback。
- 完整 legacy 主体位于 `tests/helpers/legacyAiReference.ts`，文件头标注 test/reference only。
- legacy 测试、shadow harness 和性能 legacy 基线都直接导入该 reference；生产 `src` 不导入它。
- 新增 `tests/game/aiCompatibilityAdapter.test.ts`，覆盖薄化、公开输入、不变性、pass 映射及生产依赖隔离。
- 新增 `docs/ai-production-decision.md`，并更新 `docs/ai-decision-migration.md`。

## 当前工作区

没有功能性阻塞。下一步应审阅并提交 C3b，不要重做迁移。

未提交修改：

- 修改：`src/game/ai.ts`、`tests/game/ai.test.ts`、`tests/game/aiBaseline.test.ts`、
  `tests/helpers/aiDecisionShadowHarness.ts`、`tests/performance/aiHotPath.test.ts`、
  `docs/ai-decision-migration.md`。
- 新增：`tests/helpers/legacyAiReference.ts`、`tests/game/aiCompatibilityAdapter.test.ts`、
  `docs/ai-production-decision.md`、本文件。

建议提交信息：`refactor(ai): isolate legacy decision reference from production`。
先检查 `git status --short` 与精确 diff；严禁 `git reset --hard`、`git checkout --` 或覆盖工作区。

## 验证证据

- C3b 定向测试：11 文件、75 项通过。
- 27 场 shadow：SAME_ACTION=12、LEGAL_SOFT_DIFFERENCE=15；其余错误类别全为 0。
- 20 局统一生产模拟：20/20 完成，153.09 秒，所有安全错误为 0。
- 100 局固定种子模拟：100/100 完成，576.31 秒；10,660 次决策，
  detectGroups/decision=7.75，完整重规划 477 次（4.77/局），所有非法、policy、
  runtime、引擎、动作上限错误为 0。报告在被忽略的 `artifacts/ai-simulation-report-100.json`。
- 隔离性能三连通过；冷启动领牌：3.249s、2.583s、2.460s，均低于 5 秒。
- 最终 `npm test` 连续两次通过：均为 34 文件、342 项。
- `npx tsc --noEmit`、`npm run build`、`git diff --check` 均通过。
- 静态扫描：src 无 legacy reference 导入；room 无 legacy/shadow 入口；engine 不导入 game/ai；game/ai 约 121 行。

## 下一步

1. 审阅并提交 C3b 文件。
2. 合入后才开始智能增强（公开信息推断、残局搜索、Top-K 动态策略）。新增决策能力只能放进统一 src/ai 链，不能回填 room.ts 或 game/ai.ts。
3. 性能优化先使用 AiPlanningDiagnostics 与固定种子模拟定位；当前热点是完整重规划，不能先改评分或降低 Beam 预算。

## 绝对不能再踩的坑

1. 不要把 legacy reference 放回 src，也不要让生产代码动态/间接导入它。
2. 不要在引擎异常时自动回退 legacy；错误必须传播，兜底只能留在统一引擎链内。
3. 不要在生产路径运行 shadow 双计算；shadow 只属于 tests/benchmark。
4. 不要向 AiObservation 注入队友/对手真实手牌；兼容层必须忽略 partnerHand。
5. 不要在 runAiStep 前重复调用 ensureAiPlanForSeat；生产规划只能经 decideAiAction -> PlanManager -> HandPlanner。
6. 不要在每次动作后无条件 needsReplan=true；play 用 handKey/派生计划，pass 复用。
7. 不要在 room 重建战术评分、强牌政策或规划搜索；room 只做状态流程和绝对合法性。
8. 不要为了逐项复刻 legacy 动作而复制旧策略；只修非法、policy、计划或确定性问题。
9. 不要删除或任意放宽性能测试。npm test 先跑常规套件、后单独跑性能文件，是为避免并行争用，不是 skip。
10. 不要清理用户已有未提交修改；任何操作先看 git status 与 git diff。

## 常用命令

- `npm run simulate:ai`：100 局固定种子模拟。
- `npm run test:ai-performance`：隔离性能基准。
- `npm test`：全量测试（性能自动后置隔离）。
- `npx tsc --noEmit`、`npm run build`、`git diff --check`：最终验证。
