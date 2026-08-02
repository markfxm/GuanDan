# D2F CRN Rollout / Team Utility Design Specification

> Status: design freeze for D2F Prompt 1. This document authorizes no Task 1 implementation.

**Goal:** 在不进入正式出牌路径的前提下，使用同一 immutable ParticleBank 对同一组候选动作执行 Common Random Numbers（CRN）有限深度模拟，计算 Team Utility，按粒子权重聚合期望、方差和风险，并形成稳定、可重复、可审计的候选排序。

**Architecture:** D2F 是 detached/offline/shadow 计算层。一个窄的 particles-side bridge 读取 ParticleBank 的 WeakMap 私有记录，唯一的 rollout scenario-source 将记录转换为 rollout 内部场景；rollout kernel 只把 seat-local observation 交给轻量固定预算 policy。结果经过原子聚合后只生成脱敏 summary，永远不回流正式 `decideAiAction`、`runAiStep` 或 room transition。

**Tech Stack:** TypeScript 5.7、Vitest 2.1.9、现有 `ParticleBank` contracts/replay/sampler、现有 SHA-256 canonical identity 约定、Node 22.22.2 正式 CI 基线。Node 24.15.0 仅作为本机补充环境证据。

## Global constraints

- `D2F = CRN Rollout / Team Utility`；D2F 只允许 `detached`、`offline`、`shadow`，没有 active mode。
- `formalExecutionAllowed` 的唯一合法类型和值是 `false`；任何不能证明该约束的调用都失败关闭。
- D2F 不修改正式动作、原 evaluator、正式决策引擎、candidate 数量/顺序、Room、public ledger、replay 或调用者输入。
- D2F 不调用 `HandPlanner`、`generateHandPlans`、`generateFastHandPlans`、`generateRapidHandPlan`、`ensurePlans`、`decideAiAction` 或 `runAiStep`。
- D2F 不读取原 Room 的真实对手手牌；policy 只接收当前模拟座位的 seat-local observation。
- 所有候选复用同一个 immutable ParticleBank、相同场景、相同 replicate、相同预算和相同 CRN tape；候选数组位置不参与身份或随机流。
- 正常停止条件只使用显式安全整数预算；wall clock 只能作为外部安全保护，不能参与语义结果、排序或正常停止。
- 任一关键失败丢弃整个 partial result，返回单一 typed failure，不返回部分 candidate summary 或部分排序。
- public diagnostics 只包含聚合数量、状态、失败类别和脱敏身份摘要；不包含 raw scenario、hidden assignments、完整四座位手牌、raw weight、seed 或可还原随机流的字段。
- 本规格不确定 production/shadow budget 数值。Task 1～6 必须注入显式 `RolloutBudget` 和 `RolloutBudgetLimits`；Task 7 通过独立 microbenchmark 与人工批准建立 profile。

## 1. Repository facts and phase boundary

当前 plan worktree 的基准是 `codex/d2f-crn-rollout-plan`，HEAD `d0c3f54db797ccc708d83ab2ae885094460e330d`。当前仓库已经有：

- `src/ai/particles/contracts.ts`：`ParticleScenario`、`ParticleBank`、`ParticleBankBuildResult` 等类型。
- `src/ai/particles/particleBankInternals.ts`：以 `WeakMap<object, ParticleBankInternals>` 保存私有 `ParticleRecord[]`，并对 handle 与 internals deep-freeze。
- `src/ai/particles/particleBankBuilder.ts`：唯一的现有 bank producer；它创建 handle，但不是 rollout consumer。
- `src/ai/particles/publicEventDealReplay.ts`：将场景重放为含 `stateBeforeEvent` 的私有模拟状态。
- `src/game/room.ts:runAiStep` → `src/ai/aiDecisionEngine.ts:decideAiAction`：当前正式动作路径。D2F 不得连接此路径。
- `PublicSeat = 0 | 1 | 2 | 3`，partner 为 `(seat + 2) % 4`。现有 `nextPlayableSeat` 使用 `(fromSeat + 3) % 4` 并跳过已完成座位；D2F 的相对顺时针距离必须遵守这一仓库既有轮转方向，而不能使用绝对 seat number 作为平局规则。

粒子 focused baseline 已由人工接受：

```text
10 files
136 tests
136 passed
0 failed
Vitest 2.1.9
Node 24.15.0 local supplemental run
```

标准命令冻结在：

```text
npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
```

正常全套回归使用 Vitest 默认并行度。`--maxWorkers 1 --minWorkers 1` 仅用于逐文件诊断；`--testTimeout=120000` 不是整套进程时限方案。Node 22.22.2 是正式 CI/可重复验证基线，Node 24.15.0 只有 supplemental environment evidence 级别。

## 2. Module and ownership map

### 2.1 Planned production modules

| Path | Responsibility | Private/public status |
|---|---|---|
| `src/ai/particles/particleBankRolloutAccess.ts` | 唯一读取 `readParticleBankInternals` 的窄 bridge；复制并冻结记录 | particles-private，不能进入 public barrel |
| `src/ai/rollout/contracts.ts` | D2F 请求、场景、预算、结果、summary、failure 和 identity 类型 | rollout-internal contract；不从 public barrel 导出 |
| `src/ai/rollout/particleScenarioSource.ts` | 唯一调用 bridge，将 bank records 转成 kernel 可消费的私有 `RolloutScenario[]` | rollout-private；唯一 bridge consumer |
| `src/ai/rollout/rolloutIdentity.ts` | canonical root/scenario/candidate/replicate/domain identity | rollout-private，不能包含 seed 原值 |
| `src/ai/rollout/crnStream.ts` | 无共享可变 cursor 的确定性随机值派生 | rollout-private |
| `src/ai/rollout/teamUtility.ts` | terminal truth table 与团队对称性 | pure function |
| `src/ai/rollout/leafEvaluation.ts` | 已完成名次与剩余手牌数的非 terminal 预测 | pure function |
| `src/ai/rollout/rolloutPolicy.ts` | 轻量、固定预算、确定性 seat-local policy | pure function；不能导入 planning |
| `src/ai/rollout/rolloutKernel.ts` | 对一个 scenario/replicate/candidate 执行有限深度模拟 | pure function；不读 Room |
| `src/ai/rollout/rolloutAggregation.ts` | 粒子权重的 expectation/variance/risk 聚合与稳定排序 | pure function |
| `src/ai/rollout/runRollout.ts` | detached/offline/shadow 的原子编排入口 | 不连接正式决策路径 |

不创建 `src/ai/rollout/index.ts` 或其他 public barrel。`src/ai/rollout/**` 不得普遍直接导入 `particleBankInternals.ts`；只有 `particleBankRolloutAccess.ts` 可以读取其 `readParticleBankInternals` 符号，只有 `particleScenarioSource.ts` 可以调用 bridge。

### 2.2 Planned test and benchmark modules

所有 correctness tests 位于 `tests/ai/rollout/**`。独立性能校准脚本位于 `scripts/benchmarks/d2f-rollout-budget-calibration.ts`，不作为 Vitest correctness file，不改变生产默认值。

## 3. D2F contract surfaces

以下名称在设计、计划和测试 Gate 中保持一致。它们是 implementation contract，不代表本轮已经创建这些源文件。

### 3.1 Request, candidate and observation

```ts
export type RolloutMode = "detached" | "offline" | "shadow";

export type RolloutRootIdentity = Readonly<{
  schemaVersion: "d2f-rollout-root-v1";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  snapshotIdentity: string;
  perspectiveSeat: PublicSeat;
  rootDigest: string;
}>;

export type RolloutAction = Readonly<
  | { type: "pass" }
  | { type: "play"; group: Readonly<CardGroup> }
>;

export type RolloutCandidate = Readonly<{
  candidateId: string;
  action: RolloutAction;
}>;

export type RolloutPublicState = Readonly<{
  gameRank: GameRank;
  turnSeat: PublicSeat;
  perspectiveSeat: PublicSeat;
  handCounts: Readonly<Record<PublicSeat, number>>;
  finishOrder: readonly PublicSeat[];
  lastPlay?: Readonly<CardGroup>;
  lastPlaySeat?: PublicSeat;
  publicPlayedCardIds: readonly string[];
}>;

export type RolloutRequest = Readonly<{
  schemaVersion: "d2f-rollout-request-v1";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  rootIdentity: RolloutRootIdentity;
  publicState: RolloutPublicState;
  bank: ParticleBank;
  candidates: readonly RolloutCandidate[];
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
}>;
```

`RolloutPublicState` 只描述当前公共状态和当前 perspective 的必要边界，不含 `RoomState`、`hands`、`initialHands`、`partnerHand` 或 `opponentsHands`。`RolloutCandidate.action` 只代表待评估的 own-side candidate；它不携带 runtime、plan、evaluator score 或 action-control callback。

每个 `candidateId` 必须等于由 canonical action bytes 派生的 `candidateIdentity`，且候选 identity 唯一。输入数组位置既不进入 candidate identity，也不进入 root/random identity。重复 identity、action 不一致或非法 action 都是 request failure。

### 3.2 Budget and limits

```ts
export type RolloutBudget = Readonly<{
  schemaVersion: "d2f-rollout-budget-v1";
  replicateCount: number;
  maxPliesPerReplicate: number;
  maxPolicyActionsPerPly: number;
  maxTotalWorkUnits: number;
}>;

export type RolloutBudgetLimits = Readonly<{
  schemaVersion: "d2f-rollout-budget-limits-v1";
  maxReplicateCount: number;
  maxPliesPerReplicate: number;
  maxPolicyActionsPerPly: number;
  maxTotalWorkUnits: number;
}>;
```

所有字段必须是有限的 `Number.isSafeInteger`，并满足正值、上限和 schema 校验。kernel 不读取默认配置；它只消费调用者传入的 validated budget。开始循环前检查：

```text
candidateCount
× acceptedParticleCount
× replicateCount
× maxPliesPerReplicate
× maxPolicyActionsPerPly
≤ maxTotalWorkUnits
```

每次乘法都先检查 safe-integer 溢出和 limits 上限。任一检查失败立即返回 `budget-invalid` 或 `work-limit-exceeded`，不进入部分模拟。

### 3.3 Private scenario and seat-local policy boundary

`RolloutScenario` 只存在于 `particleScenarioSource.ts`、`rolloutKernel.ts` 和需要它们的 rollout-private helpers。它包含 canonical `scenarioIdentity`、粒子 normalized weight 和由 `ParticleScenario` replay 得到的私有模拟状态。该类型不可由 diagnostics、public result 或 policy 接收。

```ts
type RolloutScenario = Readonly<{
  schemaVersion: "d2f-rollout-scenario-v1";
  scenarioIdentity: string;
  normalizedWeight: number;
  privateState: Readonly<RolloutPrivateState>;
}>;

type RolloutPrivateState = Readonly<{
  hands: Readonly<Record<PublicSeat, readonly Card[]>>;
  publicPlayedCardIds: readonly string[];
  handCounts: Readonly<Record<PublicSeat, number>>;
  finishOrder: readonly PublicSeat[];
  turnSeat: PublicSeat;
  lastPlay?: Readonly<CardGroup>;
  lastPlaySeat?: PublicSeat;
}>;

type RolloutScenarioSourceResult =
  | Readonly<{ ok: true; scenarios: readonly RolloutScenario[] }>
  | Readonly<{ ok: false; failure: RolloutFailure }>;

export type SeatLocalObservation = Readonly<{
  seat: PublicSeat;
  gameRank: GameRank;
  ownHand: readonly Card[];
  handCountBySeat: Readonly<Record<PublicSeat, number>>;
  lastPlay?: Readonly<CardGroup>;
  lastPlaySeat?: PublicSeat;
  finishOrder: readonly PublicSeat[];
  publicPlayedCardIds: readonly string[];
}>;

export type RolloutPolicy = Readonly<{
  chooseAction(observation: SeatLocalObservation): RolloutAction;
}>;
```

kernel 根据私有 state 为当前 acting seat 构造 `SeatLocalObservation`，policy 不能得到其他座位的 card arrays、ParticleScenario、hidden assignment、粒子权重或 root/seed。policy 的合法动作选择采用轻量固定规则和 canonical action key tie-break；它不得调用完整 `HandPlanner`，不得使用 wall clock、`Math.random`、`Date.now`、`performance.now`、`process.env` 或 worker completion order。

### 3.4 Identity and CRN stream

身份链固定为：

```text
rootIdentity
  + canonical scenario identity
  + candidate identity
  + replicate identity
  + random domain/key
  + draw ordinal
→ deterministic independent stream/value
```

具体约束：

1. `rootIdentity` 由公开 game/round/hand/snapshot/perspective facts 生成，不含 raw seed。
2. `scenarioIdentity` 复用既有 canonical ParticleScenario identity domain。
3. `candidateIdentity` 由 canonical action bytes 生成，不使用输入数组 index。
4. `replicateIdentity` 是显式 ordinal 的 canonical identity；相同预算与相同输入时重复运行相同。
5. `randomDomain` 是固定 UTF-8 domain label 加上上述 identities；draw ordinal 是显式 safe integer。
6. `createCrnTape` 在 candidate loop 之前由 root/scenario/replicate 创建 immutable tape；每个 candidate 得到同一 tape 的独立只读视图。
7. 不允许共享 mutable RNG cursor。candidate 顺序和 worker/scenario completion order 不能改变任何 candidate 的 stream 或结果。

### 3.5 Terminal Team Utility

`teamUtilityForFinishOrder(finishOrder, perspectiveSeat)` 只接受 4 个不同且完整的 seat 名次。perspective team 的两个名次映射到以下唯一 truth table：

| 本方名次 | utility |
|---|---:|
| `{1,2}` | `+3` |
| `{1,3}` | `+2` |
| `{1,4}` | `+1` |
| `{2,3}` | `-1` |
| `{2,4}` | `-2` |
| `{3,4}` | `-3` |

```ts
export type TeamUtility = -3 | -2 | -1 | 0 | 1 | 2 | 3;
```

`TeamUtility` 的合法值域是 `[-3, +3]`；完整 terminal order 不产生额外 bonus 或 zero utility。非法、重复、缺失、越界名次必须 typed failure。

必须证明：

- 交换 perspective team 与 opposing team 后 utility 变号；
- 将所有 seat 按同一个 delta 旋转后 utility 不变；
- partner seat 互换后 utility 不变；
- 不叠加未经验证的搭档奖励、风险权重或经验系数。

### 3.6 Non-terminal leaf evaluation

```ts
export type RolloutLeafInput = Readonly<{
  finishOrder: readonly PublicSeat[];
  handCounts: Readonly<Record<PublicSeat, number>>;
  turnSeat: PublicSeat;
}>;
```

`projectFinishOrder` 的输入包含真实 `finishOrder`、每个未完成座位的剩余手牌数和当前 `turnSeat`。算法严格为：

1. 保留已完成玩家的真实 finish order，禁止重排。
2. 找出未完成玩家。
3. 按剩余手牌数从少到多排序。
4. 手牌数相同时，按相对当前 acting/turn seat 的仓库既有轮转方向排序。现有 `nextPlayableSeat` 为 `(seat + 3) % 4`，因此 tie-break 使用该相对距离，不使用绝对 seat number。
5. 将完整预测名次代入同一 Team Utility truth table。

如果实现测试证明当前轮转规则下此 tie-break 不能保持整体旋转等变性，Task 2 必须停止并提交证据；允许的最小替代方案只能是“基于同一轮转关系的相对距离 + canonical stable action/state key”，不得退化为绝对 seat number。

### 3.7 Simulation and aggregation

对每个 immutable bank record、每个 replicate、每个 candidate 执行同一预算的有限深度 kernel。candidate 执行前从相同 scenario snapshot 开始，首步执行待评估 action，随后由轻量 policy 逐 ply 选择合法动作。terminal 时使用真实 finish order；达到 `maxPliesPerReplicate` 时使用上述 leaf evaluation。不能因为 candidate 不同而重建 ParticleBank 或重采样不同场景。

```ts
export type RolloutReplicateResult = Readonly<{
  candidateId: string;
  scenarioIdentity: string;
  replicateIdentity: string;
  utility: TeamUtility;
  terminal: boolean;
  plies: number;
}>;

type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  replicateIdentity: string;
  crnTape: Readonly<{ valueAt(drawOrdinal: number): number }>;
  budget: RolloutBudget;
  policy: RolloutPolicy;
}>;
```

权重聚合只使用 bank 内已有 normalized weight，并对所有 candidate 使用相同 record 集合和 replicate 集合：

```text
expectedUtility = Σ(weight × utility) / Σ(weight)
variance         = max(0, Σ(weight × utility²) / Σ(weight) − expectedUtility²)
risk             = Σ(weight × 1[utility < 0]) / Σ(weight)
```

每个 replicate 以相同粒子权重计入；不添加未经验证的 utility coefficient。`variance` 只允许对 tolerance 内的负零做归零，超出容差是 aggregation failure。所有公开浮点 summary 使用固定六位 canonical rounding；原始 per-particle utility、weight、scenario 和 tape 永不进入 public result。

```ts
export type CandidateRolloutSummary = Readonly<{
  candidateId: string;
  scenarioCount: number;
  replicateCount: number;
  expectedUtility: number;
  variance: number;
  risk: number;
  terminalCount: number;
  leafCount: number;
}>;

export type RolloutResult = Readonly<{
  schemaVersion: "d2f-rollout-result-v1";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  rootIdentity: Readonly<{ digest: string }>;
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: Readonly<{
    candidateCount: number;
    scenarioCount: number;
    replicateCount: number;
    completedReplicates: number;
    terminalCount: number;
    leafCount: number;
  }>;
}>;

export type RolloutFailure = Readonly<{
  kind: "invalid-request"
    | "formal-execution-forbidden"
    | "unknown-bank-handle"
    | "invalid-budget"
    | "work-limit-exceeded"
    | "candidate-identity-collision"
    | "scenario-source-failed"
    | "policy-failed"
    | "simulation-failed"
    | "aggregation-failed"
    | "non-finite-result"
    | "internal-error";
  count?: number;
}>;

export type RolloutRunResult =
  | Readonly<{ ok: true; result: RolloutResult }>
  | Readonly<{ ok: false; failure: RolloutFailure }>;
```

candidate ranking tuple固定为：

```text
expectedUtility descending
variance ascending
risk ascending
candidateId ascending by UTF-16 code units
```

候选 summary 按 canonical candidate identity 输出。任一 candidate 缺失、任一 scenario/replicate 失败、非有限 arithmetic、utility 越界或排序 postcondition 失败，都丢弃整个 `RolloutResult`。

## 4. Mode and formal decision boundary

### Detached

测试或离线调用者直接传入完整 `RolloutRequest`，只保留脱敏 `RolloutResult`。调用者不得把 ranking 转换成 `AiAction`，不得写 `RoomState` 或 `AiRuntimeState`。

### Offline

独立 fixture/replay/benchmark 使用相同 contracts 和 kernel，输出只写离线 artifact 的 aggregate fields。离线入口不读取 production Room，也不注册 treatment。

### Shadow

允许经单独授权的 observer 在正式动作已经产生后计算或记录 D2F summary；observer 必须证明 action、runtime、candidate order、public event、ledger、replay 和正式 diagnostics 与未执行 D2F 的 baseline 字节相同。D2F summary 不得成为 evaluator input、candidate filter、selected action、plan switch 或 room transition 的输入。

任何 request 的 `formalExecutionAllowed` 只能是字面量 `false`；返回结果也只能是 `false`。AST/symbol tests 必须证明 `src/game/room.ts`、`src/game/ai.ts`、`src/ai/aiDecisionEngine.ts`、`src/ai/planning/**` 没有 D2F import/call path。

## 5. Failure, privacy and immutability model

- 输入 `Room`、`ParticleBank`、candidates、public ledger 和 `RolloutRequest` 都按 read-only contract 消费，任何内部 clone/freeze 不回写调用者。
- bridge 对 registry records 做 detached clone/deep-freeze；unknown/fake handle 返回 `unknown-bank-handle`，不暴露 scenario。
- scenario-source 是唯一 bridge consumer；policy、diagnostics、aggregation 和 result 不可直接 import bridge 或 `particleBankInternals.ts`。
- public result 不包含 `privateState`、`ParticleScenario`、`hiddenTransferAssignments`、complete hands、raw weight、seed、tape、worker id、process state 或 timing value。
- failure result 不含 partial candidate summaries、partial ranking 或未脱敏 exception message；内部异常映射到固定 failure kind。
- 每次运行先验证 envelope、budget、candidate set、bank snapshot、scenario source，再开始任何 candidate loop；任何中途失败都返回全局 failure。

## 6. Verification and release gates

Task 1～6 使用显式小预算 fixture，不能写 production/shadow 默认 profile。Task 7 前必须有 `D2F_BUDGET_CALIBRATION_GATE`：独立 microbenchmark、固定 manifest、自然完成、可重复结果和人工批准。Task 8 必须在 Node 22.22.2 正式 CI/可重复环境完成；Node 24.15.0 结果另列 supplemental evidence。

正确性 tests 与 benchmark 分开。所有从可能含 linked worktree 的仓库环境执行的 Vitest 命令显式使用 `--exclude "**/.worktrees/**"`。若单次长回归超过 Codex 单命令上限，按固定 manifest 进行互不重叠分片；每个 shard 记录 files/tests/pass/fail/skip/exit code，汇总证明每个 tracked file 恰好一次、无重复、无遗漏、总测试数一致。不得提高全局 timeout、减少 fixture、删除断言或跳过测试。

## 7. Explicit non-goals

D2F 不做 D2G benchmark/treatment/ablation，不决定 active-mode 权重，不把 rollout ranking 接到正式出牌，不替换原 evaluator，不治理依赖告警，不修改 package/lockfile/tsconfig/Vite 配置，不重构相邻模块，也不创建未授权的 production adapter。
