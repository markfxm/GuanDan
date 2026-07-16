# D1-R1a：candidate 暴露与 random 对照确定性根因调查

状态：**调查完成，设计待批准；未实施修复**  
调查基线：`40e882c2ff7c614a38ce0df42a23840165c0c075`（P7.1 package）  
实验执行基线：`ad1d72b6715338b470a062da7b28bc9284babb1f`  
D0 基线：`e2a20e18f8e5c0871db38ad69426262e43766ce1`，tag `ai-benchmark-d0-baseline`

本轮不修改 production、runner、strategy、统计定义、replay 或 artifact；不运行新的 smoke、calibration、formal，不更新 approval，不创建提交。

## 1. 冻结状态与调查边界

- P7.1 的 smoke/calibration v2 artifacts、报告和 approval 保持原样。
- `formalExecutionAllowed=false` 仍成立；P8 仍禁止启动。
- 工作树调查开始时为 clean；本次只新增本调查文档。
- P7.1 报告把 dynamic candidate exposure 标为 `unexercised`：`candidateCount=1` 的 76,752 次 dynamic decision 中，`>1` 为 0，`strategicConsiderationDenominator=0`。
- P7.1 的 structural readiness 仍可作为 artifact/schema 历史记录；它不是 treatment 行为证据。

## 2. 候选流逐层追踪

### 2.1 入口与配置

`tests/benchmark/strategies.ts` 的 `unifiedD1TopK` 通过 `decideAiAction(..., DEFAULT_AI_PERFORMANCE_CONFIG, { planSelectionMode: "dynamic-topk-v1" })` 进入 production engine。默认配置在 `src/ai/config.ts`：

```text
planning.maxPlans = 5
planning.beamWidth = 1
planning.timeBudgetMs = 0
```

同一配置也用于 control；这保证了本结论不是由 benchmark adapter 私自降级产生的。

### 2.2 每层计数

| 层 | 代码路径 | 观察到的计数/规则 |
|---|---|---|
| planner candidate source | `PlanManager.ensurePlans` → `generateFastHandPlans` | 每次 full replan 生成 1 个有效 fast plan |
| fast planner | `handPlanner.ts` | `beam = undefined`，因为 `timeBudgetMs <= 0`；`fastPlans` 只剩 greedy（或单个 fallback） |
| runtime | `ensurePlans` 返回值 | `candidatePlans.length = 1`，`activePlanId = candidatePlans[0].id` |
| dynamic context/manager | `aiDecisionEngine.dynamicManagerInput` | 原样传入这 1 个 candidate；没有第二次 planner 或候选扩展 |
| selector input | `selectActivePlan` | `uniqueById` 后仍为 1；不是 selector 去重造成的减少 |
| structural validation | `validateDynamicPlan` | 现有 1 个 active 通过时 valid 数为 1；没有可供过滤的 challenger |
| Top-K | `active + K-1 challengers`，K=5 | 集合只有 active，实际大小 1 |
| dynamic evaluator | `planSelector.ts` | `challengers.length === 0` 直接 `keep-current`；该路径不调用 evaluator |
| diagnostics | `recordDynamicDiagnostics` | 记录的是传入 selector 的 `runtime.candidatePlans.length`，即 1；不是 action candidate 数 |

### 2.3 根因排除

以下路径均不是首因：

1. selector 的 `uniqueById`：输入已经只有一个 plan；
2. selector 的 hard-validity 过滤：单个 fast plan 在 P7.1 中没有产生 forced-invalid 证据；
3. Top-K slicing：它只会从已有 challengers 中取前 `K-1`，不会生成计划；
4. D0→D1 migration/identity cleanup：migration 只建立 active identity，cleanup 只裁剪 sidecar identity map，不会缩短 `candidatePlans`；
5. `applyExecutedAction` 的 exact reuse：它可保留多个已有 plan；partial repair 显式使用 `maxPlans: 1`，但首次完整 plan source 已经是单计划。

**唯一首因：** `generateFastHandPlans` 以 `timeBudgetMs=0` 禁用 beam，而该函数只返回 greedy 与 beam 两个 fast alternative；因此 D1 的 dynamic selector 从未收到 challenger。`maxPlans=5` 在此路径只是上限，不是候选生成保证。

### 2.4 planner 是否具备多计划能力

仓库已有 `generateHandPlans`/engine planner 可按 `maxPlans` 产生多个计划；`generateFastHandPlans` 在正的、受控的时间预算并成功生成 beam 时也可返回 `fast-greedy` 与 `fast-beam` 两个计划，再按 `maxPlans` 截断。因此能力并非理论上不存在，而是 D1 当前入口的固定预算使其不可达。

这属于 **D1 candidate-generation/configuration gap**，不是 PlanEvaluator 或 selector 算法错误。修复前不能把 `candidateCount=1` 解读为“dynamic-topk 已比较过候选但未切换”。

## 3. random 对照流审计

### 3.1 现有契约

`tests/benchmark/simulator.ts` 为每个 seat 创建独立 runtime，并使用：

```text
deriveStrategySeed(matchId, seat)
  = sha256(deriveRuntimeId(matchId, seat) + ":strategy-seed")
deriveRuntimeId(matchId, seat)
  = sha256(matchId + ":runtime:" + seat)
```

`matchId` 的规范化 JSON 包含 `matchup`、`allocation`、`configHash`、`rotation`、`seed`；因此 treatment-vs-random 和 control-vs-random 即使 base seed、rotation、allocation、seat 完全相同，也拥有不同的 matchId。当前 random provenance 明确记录：

- `randomAlgorithmVersion=seat-local-xorshift-v2`；
- `strategySeedDerivationVersion=match-id-xorshift-v1`；
- `candidateOrderingVersion=legal-candidates-v1`；
- `decisionIndexSemantics=seat-local-decide-count-v1`。

`legalCandidates` 使用 stable key（`pass` 或排序 card ids）排序，候选顺序不是本次根因。

### 3.2 现有 v2 artifact 的只读比对

对 calibration v2 中 400 个同 base-seed/placement/rotation/rank/allocation 的 treatment-vs-random 与 control-vs-random raw result 做了离线比对（未重放、未运行游戏）：

- 对齐记录：400/400；
- random seat 的 derived seed 不一致：400/400；
- 由同一已记录 derived seed 离线推进的前 10 个 xorshift state：每个对照 pair 均不同；
- 首个公开动作差异 index：最小 0、中位数 1、最大 7；
- 首个差异动作的 seat 在 400/400 中都是该局的 random seat（198 局 index 0、183 局 index 1、1 局 index 2、8 局 index 3、1 局 index 4、4 局 index 5、5 局 index 7）。

因此这是 **根因 B：random opponent seed 被 matchup-dependent matchId 改变**，而不是 diagnostics、worker 调度或 random 调用次数造成的后置分歧。现有 raw artifact 没有保存完整候选集合/selected index，故不能伪造“第一步 candidate index”；本调查只报告已持久化的 PRNG state 和公开 action divergence。

### 3.3 对 random uplift 的结论

P7.1 treatment-vs-random 与 control-vs-random 不是 common-random-number 配对：同一个 base seed block 的 random seat 没有共享随机流。因此已有 random uplift/CI 不能作为 D1 treatment effect、非劣效 margin、behavior cap 或 formal evidence；只能保留为历史 artifact 的描述性结果。不得用独立 CI 相减补救。

## 4. keep-current fixture provenance 审计

`tests/benchmark/strategies.ts` 在模块加载时将：

```text
process.env.D1_KEEP_CURRENT_LOCK_FIXTURE_HASH ?? "fixture-not-loaded"
```

写入 `unified-current` 和其 D1 treatment descriptor。`runD1TopKBenchmark.ts` 只消费该 descriptor，没有在 benchmark 启动前加载并验证 `tests/ai/fixtures/d0KeepCurrentCases.json`。fixture generator/lock tests 是独立测试入口，并不会自动向 benchmark process 设置该环境变量。因此 P7.1 raw/manifest/report 中的 `keepCurrentLockFixtureHash` 为 placeholder，并非 fixture 内容哈希。

最小 fail-closed 设计（未实现）：

1. benchmark adapter 启动时加载 fixture，验证 D0 source commit/tag、generator provenance、input/output hash 与五个 case；
2. 由 canonical fixture bytes 计算并注入 descriptor hash；
3. 缺失、placeholder、格式错误或 hash 不匹配时直接拒绝构造 descriptor；
4. readiness/resume/skip-existing 把 placeholder 视为 provenance failure；
5. 仍不修改 production `src`，也不将完整 fixture/隐藏状态写入公共 artifact。

## 5. 最小修复设计（本轮不实现）

### R1a-1：candidate exposure

- 保持 keep-current 默认路径和 D0 字节锁不变；
- 为 dynamic-only 路径定义稳定的 candidate-source contract，确保一次 full replan 在冻结预算内能产生 `active + challenger`，并明确 beam/alternative 的确定性预算；
- 保留 `maxPlans=K` 与 stable plan ordering；不得把 evaluator、selector 或 diagnostics 伪造为候选生成器；
- 新增离线/单元计数：planner output、manager runtime、selector valid、Top-K、evaluator calls、switch reasons；
- 若要把 `timeBudgetMs` 改为正值或切换到多计划 planner，必须单独批准性能/行为影响，不在本调查中默选。

### R1a-2：common-random-number contract

- deal/room seed 仍由 base seed、rotation 和既有配置决定；
- random strategy seed 改为由不含 matchup、strategy id、configHash、output path、worker id、duration 的 canonical scenario key 派生；
- key 至少包含 benchmarkVersion、phase、baseSeed、allocation、rotation、rank、seat，以及固定的 random algorithm/version；
- treatment-vs-random 与 control-vs-random 对同一 scenario key 必须得到相同 per-seat random seed；
- 继续保持每 seat 独立 PRNG、每次 decide 一次 next、stable candidate ordering；
- 新 seed derivation/version 必须进入 provenance，旧数据不可原地修补，必须新 artifact 目录和新 config/provenance。

### R1a-3：fixture provenance

- 将 fixture hash 作为 benchmark adapter 的强前置输入，而不是可选环境变量；
- descriptor、manifest、phase report 同时记录 fixture hash 和其 D0 provenance；
- fail-closed 检查必须覆盖 resume/skip-existing；
- 不把 D0 fixture 结果注入 production runtime，也不改变 D0 tag/artifacts。

### R1a-4：重新实验门禁

candidate exposure 或 CRN 修复后必须使用全新 schema/version/configHash 运行 smoke → calibration；旧 P7.1 数据只归档，不合并、不 resume、不作为 treatment/random uplift/caps/margins/formal 证据。只有新数据完成 structural、behavioral exposure、统计和 provenance/privacy 门禁，才可重新生成 approval candidate。

## 6. 设计是否需要修订

需要对 D1 实施设计做一次 R1 修订，至少新增：

1. dynamic candidate-source/预算契约及 exposure acceptance criteria；
2. selector 输入层计数与多候选属性测试；
3. common-random-number seed key 及跨 matchup 等流测试；
4. fixture provenance 强制加载与 placeholder 拒绝；
5. 新 schema/configHash 与旧 P7.1 历史隔离规则。

不需要修改 P2 evaluator 公式、P3 selector 阈值语义、游戏规则或 D0 keep-current 行为。

## 7. 结论与停止条件

- candidate 根因：`timeBudgetMs=0` 禁用 fast planner beam，导致进入 selector 的候选列表始终为 1；selector 未获得 challenger，dynamic treatment 行为在 P7.1 中未被暴露。
- planner 具备多计划能力，但当前 dynamic engine 路径的 fast configuration 使该能力不可达。
- random 根因：seed derivation 依赖含 matchup/configHash 的 matchId；400/400 对齐 pair 的 random seeds 与前 10 个 PRNG state 均不同，首个公开差异均发生在 random seat。
- 现有 random uplift 无法作为 common-random 配对推断。
- `keepCurrentLockFixtureHash="fixture-not-loaded"` 的原因是 adapter 未加载 fixture，只使用可选环境变量回退值；应改为 fail-closed。
- P7.1 artifact、报告和 approval 冻结不变；`formalExecutionAllowed` 继续为 false。
- 本轮未修改代码、实验数据、approval 或 D0；未运行 smoke/calibration/formal；未提交 commit。
