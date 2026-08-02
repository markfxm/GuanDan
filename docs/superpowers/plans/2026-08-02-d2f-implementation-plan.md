# D2F CRN Rollout Implementation Plan

状态：仅计划纠偏；本轮不创建实现、测试或 benchmark 文件，不开始 Task 1。

## 0. 执行纪律与全局 allowlist

每个 Task 独立执行以下循环：只读检查 -> 列出 allowlist/forbidden -> 写一个最小失败测试 -> 运行并记录正确失败 -> 最小实现 -> focused GREEN -> 相关回归 -> TypeScript/build/diff 检查 -> 隐私/确定性/不可变性/失败原子性审计 -> 单一 commit -> 阶段报告并停止等待人工审查。Task 1–8 的每个实现步骤都必须同时写明 exact file、exact interface/symbol、RED test、预期的缺失行为失败、最小实现、验证命令和 commit 边界；不能用模糊词替代这些字段。Task 9 是无实现的 verification-only 例外，必须写明其 manifest、命令、exit-code 证据和最终 release gate。

Task 1–7 的 production/test 路径只能位于：

~~~text
src/ai/particles/particleBankRolloutAccess.ts       # 仅 Task 1
src/ai/rollout/**
tests/ai/rollout/**
scripts/benchmarks/d2f-rollout-budget-calibration.ts # 仅 Task 7
~~~

Task 8 另有一个冻结的正式旁路例外：允许修改 src/game/room.ts 的 runAiStep 一个调用点；不得修改 src/ai/aiDecisionEngine.ts 或已有 src/ai/tactics/representativeActionShadowObserver.ts。Task 9 不新增行为，只做验证。

任何 Task 都禁止修改 src/ai/planning/**、除 Task 8 指定调用点外的 src/game/room.ts、正式 decideAiAction 语义、package/package-lock/tsconfig/Vite 配置、全局 timeout、已有 D2e observer、无关依赖和其他 worktree。正式 formalExecutionAllowed 必须保持 false。

所有测试和命令在可能含嵌套 worktree 的仓库环境中显式使用：

~~~text
--exclude "**/.worktrees/**"
~~~

正常粒子 focused regression 固定为：

~~~text
npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
~~~

该命令的 fresh baseline 是 10 files / 136 tests / 136 passed，Vitest 2.1.9，Node 24.15.0 supplemental local evidence。--maxWorkers 1 --minWorkers 1 只用于逐文件诊断，不是正常回归命令；整套进程时限与单测 timeout 必须分开记录。`AWAITING_FIXED_BENCHMARK_RUNNER` 和 `AWAITING_NODE22_CI` 都不是 Task 1 blocker；前者只阻塞 Task 7 benchmark，后者只阻塞最终 release Gate。未取得 Node 22.22.2 证据前不得称为 D2F SHADOW RELEASE READY。

## 1. Frozen interface block

Task 1–9 使用 Design Spec 中完全相同的以下名字和字段，不另造别名：

~~~ts
type RolloutMode = "detached" | "offline" | "shadow";

type RolloutRequest = Readonly<{
  schemaVersion: "d2f-rollout-request-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  rootIdentity: string;
  scenarioSourceInput: RolloutScenarioSourceInput;
  candidates: readonly RolloutCandidate[];
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  evidenceRequirements: RolloutEvidenceRequirements;
  riskPolicy: RolloutRiskPolicy;
  policy: RolloutPolicy;
}>;

type RolloutBudget = Readonly<{
  replicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  maxWorkUnits: number;
}>;

type RolloutBudgetLimits = Readonly<{
  maxReplicateCountPerScenario: number;
  maxPliesPerReplicate: number;
  maxPolicyActionEvaluationsPerPly: number;
  maxWorkUnits: number;
}>;

type ValidatedRolloutBudget = Readonly<{
  budget: RolloutBudget;
  limits: RolloutBudgetLimits;
  maximumWorkUnits: number;
  validated: true;
}>;

type RolloutEvidenceRequirements = Readonly<{
  schemaVersion: "d2f-rollout-evidence-requirements-v1";
  minimumEffectiveSampleSize: number;
  minimumAcceptedScenarioCount: number;
  minimumCompletedReplicateCount: number;
  requireCompleteCoverage: true;
}>;

type RolloutRiskPolicy = Readonly<{
  schemaVersion: "d2f-rollout-risk-policy-v1";
  variancePenalty: number;
  downsideRiskPenalty: number;
}>;

type RolloutPublicState = Readonly<{
  gameRank: GameRank;
  actingSeat: PublicSeat;
  perspectiveSeat: PublicSeat;
  partnerSeat: PublicSeat;
  handCounts: Readonly<Record<PublicSeat, number>>;
  finishOrder: readonly PublicSeat[];
  publicPlayedCardIds: readonly string[];
  currentLastPlay: Readonly<unknown> | null;
  currentLastPlaySeat: PublicSeat | null;
}>;

type RolloutCandidate = Readonly<{
  candidateId: string;
  action: RolloutAction;
  baselineEvaluatorScore: number;
}>;

type RolloutScenario = Readonly<{
  scenarioIdentity: string;
  normalizedWeight: number;
  privateState: Readonly<unknown>;
}>;

type RolloutScenarioSourceInput = Readonly<{
  bank: ParticleBank;
  publicHistoryEvents: readonly PublicActionEvent[];
  initialLedger: HardPublicLedger;
  finalLedger: HardPublicLedger;
  gameRank: GameRank;
  perspectiveSeat: PublicSeat;
  ownCurrentHand: readonly Card[];
  publicState: RolloutPublicState;
}>;

type RolloutScenarioSourceResult =
  | {
      ok: true;
      scenarios: readonly RolloutScenario[];
      effectiveSampleSize: number;
      acceptedScenarioCount: number;
    }
  | { ok: false; failure: RolloutFailure };

type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  publicState: RolloutPublicState;
  replicateIdentity: string;
  random: CrnView;
  validatedBudget: ValidatedRolloutBudget;
  policy: RolloutPolicy;
}>;

type CrnCoordinate = Readonly<{
  rootIdentity: string;
  scenarioIdentity: string;
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  randomDomain: string;
}>;

type CrnView = Readonly<{ value(semanticKey: string): number }>;

declare function deriveRandomDomain(coordinate: CrnCoordinate): string;

type RolloutPolicyDecisionContext = Readonly<{
  replicateIdentity: string;
  ply: number;
  actingSeat: PublicSeat;
  random: CrnView;
}>;

type RolloutPolicy = Readonly<{
  chooseAction(observation: SeatLocalObservation, context: RolloutPolicyDecisionContext): RolloutPolicyResult;
}>;

type RolloutPolicyResult =
  | { ok: true; action: RolloutAction }
  | { ok: false; failure: RolloutPolicyFailure };

type TeamUtility = -3 | -2 | -1 | 1 | 2 | 3;

type CandidateRolloutSummary = Readonly<{
  candidateId: string;
  riskAdjustedUtility: number;
  expectedUtility: number;
  variance: number;
  risk: number;
  baselineEvaluatorScore: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  totalCompletedReplicates: number;
  completedReplicateCount: number;
  workUnitCount: number;
}>;

type RolloutAggregateDiagnostics = Readonly<{
  effectiveSampleSize: number;
  acceptedScenarioCount: number;
  replicateCountPerScenario: number;
  totalCompletedReplicates: number;
  completedReplicateCount: number;
  expectedCompletedReplicateCount: number;
  candidateCount: number;
  workUnitCount: number;
  coverage: "complete";
}>;

type RolloutResult = Readonly<{
  schemaVersion: "d2f-rollout-result-v2";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  rootDigest: string;
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
  aggregateDiagnostics: RolloutAggregateDiagnostics;
}>;

type D2FShadowEvidence = Readonly<{
  schemaVersion: "d2f-shadow-v2";
  baselineActionIdentity: string;
  d2fRecommendedActionIdentity: string | null;
  agreement: "agree" | "disagree" | "unavailable";
  riskAdjustedUtilityDelta: number | null;
  expectedUtilityDelta: number | null;
  baselineEvaluatorScore: number;
  effectiveSampleSize: number | null;
  acceptedScenarioCount: number | null;
  replicateCountPerScenario: number | null;
  completedReplicateCount: number | null;
  workUnitCount: number | null;
  fallbackReason: "none" | "rollout-failure" | "low-evidence" | "budget-exhausted" | "telemetry-failure";
  semanticBudgetUsage: Readonly<{
    replicateCountPerScenario: number;
    maxPliesPerReplicate: number;
    maxPolicyActionEvaluationsPerPly: number;
    workUnitCount: number;
  }> | null;
  elapsedWallClockMs: number | null;
}>;

type TeamUtilityFailure =
  | { kind: "invalid-finish-order"; reason: "duplicate-seat" | "missing-seat" | "unknown-seat" }
  | { kind: "unsupported-team-pair"; teamSeats: readonly PublicSeat[] };

type LeafEvaluationFailure =
  | { kind: "invalid-leaf-state"; reason: "duplicate-finish" | "unknown-seat" | "negative-hand-count" }
  | { kind: "rotation-tie-break-unproven"; evidence: string };

type RolloutPolicyFailure =
  | { kind: "no-legal-action"; actingSeat: PublicSeat }
  | { kind: "invalid-policy-context"; field: "ply" | "actingSeat" | "random" };

type RolloutKernelFailure =
  | { kind: "simulation-failed"; stage: "state-conservation" | "leaf-evaluation" | "replay" }
  | { kind: "policy-failed"; failure: RolloutPolicyFailure }
  | { kind: "budget-exhausted"; workUnits: number; maximumWorkUnits: number };

type RolloutAggregationFailure =
  | { kind: "non-finite-aggregate"; field: "expectedUtility" | "variance" | "risk" }
  | { kind: "coverage-mismatch"; expected: number; actual: number }
  | { kind: "empty-replicate-set"; candidateId: string };

type TeamUtilityResult =
  | { ok: true; utility: TeamUtility }
  | { ok: false; failure: TeamUtilityFailure };

type LeafEvaluationResult =
  | { ok: true; predictedFinishOrder: readonly PublicSeat[]; utility: TeamUtility }
  | { ok: false; failure: LeafEvaluationFailure };

type RolloutReplicateResult =
  | { ok: true; candidateId: string; scenarioIdentity: string; replicateIdentity: string; utility: TeamUtility; workUnits: number }
  | { ok: false; failure: RolloutKernelFailure };

type RolloutAggregationResult =
  | { ok: true; summary: CandidateRolloutSummary }
  | { ok: false; failure: RolloutAggregationFailure };

type RolloutFailure =
  | { kind: "invalid-request"; field: string }
  | { kind: "invalid-budget"; field: "replicateCountPerScenario" | "maxPliesPerReplicate" | "maxPolicyActionEvaluationsPerPly" | "maxWorkUnits" }
  | { kind: "invalid-risk-policy"; field: "variancePenalty" | "downsideRiskPenalty" }
  | { kind: "invalid-evidence-requirements"; field: "minimumEffectiveSampleSize" | "minimumAcceptedScenarioCount" | "minimumCompletedReplicateCount" }
  | { kind: "fake-or-unknown-particle-bank" }
  | { kind: "scenario-source-failed"; reason: "ledger-mismatch" | "replay-context-missing" | "private-state-invalid" }
  | { kind: "effective-sample-size-too-low"; effectiveSampleSize: number; minimumEffectiveSampleSize: number }
  | { kind: "insufficient-scenarios"; acceptedScenarioCount: number; minimumAcceptedScenarioCount: number }
  | { kind: "insufficient-replicates"; completedReplicateCount: number; minimumCompletedReplicateCount: number }
  | { kind: "coverage-mismatch"; expectedCoverage: number; actualCoverage: number }
  | { kind: "kernel-failed"; failure: RolloutKernelFailure }
  | { kind: "aggregation-failed"; failure: RolloutAggregationFailure };
~~~

所有 utility/leaf/policy/kernel/aggregation 返回值都是 ok: true 或 ok: false 的 discriminated union；失败 kind 使用 Design Spec 的精确 union，不使用共享的 count?: number。RolloutFailure 必须包含 effective-sample-size-too-low、insufficient-scenarios、insufficient-replicates、coverage-mismatch。候选数组位置和 candidateId 不得进入 CRN 坐标；baselineEvaluatorScore 不得进入 identity、random 或 policy。

Task 1–6 共用的 numeric contract 也在 `contracts.ts` 锁定：所有 measure 必须 finite，所有
count/index/ordinal/ply/work-unit 必须 safe integer 且非负，seat 必须在 `{0,1,2,3}`，权重必须
finite/非负并归一化，risk/variance 必须 finite/非负，所有乘积逐步检查 overflow。输入、
source result、summary、aggregateDiagnostics 和 shadow evidence 的 NaN/Infinity/非法整数都
必须在 success 前返回已有 typed failure；不能依赖 TypeScript 类型断言代替运行时验证。
`candidateId === canonicalActionIdentity(action)`、`scenarioIdentity === canonical
particleScenarioIdentity(...)`、`replicateIdentity === canonical(replicateOrdinal)`，而
`rootDigest` 只从同一 pre-action replay context identity 派生。

## 2. Task 1 — contracts / private bridge / replay-ready source

### Scope

允许创建/修改：

~~~text
src/ai/particles/particleBankRolloutAccess.ts
src/ai/rollout/contracts.ts
src/ai/rollout/particleScenarioSource.ts
tests/ai/rollout/particleBankRolloutBoundary.test.ts
tests/ai/rollout/particleScenarioSource.test.ts
~~~

禁止修改所有其他 src/ai/particles/**、Room、planning、public barrel、package 和配置。

Task 1 只冻结 contracts 中的 identity 基础契约（`CrnCoordinate`、root/scenario/replicate
identity 字段和 `candidateId === canonicalActionIdentity(action)` 的边界）、窄 bridge 与
replay-ready source。它不得创建或实现 `identity.ts`/`crn.ts` 的 deterministic stream、Team
Utility、leaf、policy、kernel、aggregation、ranking、shadow observer 或 Room 接入；这些行为
分别留给后序 Task。

### TDD actions

- [ ] 只读确认 readParticleBankInternals 返回 ParticleRecord、ParticleScenario 和 normalized weight，并记录真实 replayParticleScenario 参数。
- [ ] 创建测试骨架 describe("D2F ParticleBank bridge")，加入 it("rejects a fake ParticleBank handle before reading records")。
- [ ] 运行 npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose；首个 RED 预期为目标模块/函数不存在，而不是 timeout。
- [ ] 加入 it("allows only the approved bridge to resolve readParticleBankInternals") 和 AST/symbol 检查：rollout 文件只能通过 particleScenarioSource.ts 访问桥接；不得出现对 particleBankInternals.ts 的其他 import/export。
- [ ] 加入 identity contract assertion：`CrnCoordinate` 的 root/scenario/replicate/ply/seat/domain 字段、canonical candidate identity 和 replay-context identity 的字段存在，但不得提供 `next()`、raw seed 或 candidate-dependent draw API。
- [ ] 加入 it("builds replay-ready source from bank plus public history/ledger context")，构造包含 bank、publicHistoryEvents、initialLedger、finalLedger、gameRank、perspectiveSeat、ownCurrentHand、publicState 的 RolloutScenarioSourceInput。
- [ ] 最小实现窄桥接，校验 fake/unknown handle、ledger hash/index、game rank、perspective seat 和己方 hand，再按真实 replay API 构造 RolloutScenario；只返回不可变私有投影。
- [ ] 加入 it("does not expose raw scenario, four-seat hands, weight detail, or seed in public diagnostics")。
- [ ] GREEN：重复执行两个 focused commands，分别得到所有测试通过，且 policy/diagnostics 不可接收 privateState。
- [ ] 回归 npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot；验证不少于 10 files / 136 tests，不能减少既有断言。
- [ ] 运行 npx tsc --noEmit、仓库既有 build command、git diff --check；审计输入和 ParticleBank 未被修改。
- [ ] 只提交本 Task 的 allowlist，使用 git commit -m "feat(ai): add D2F rollout contracts and bridge"；报告 first RED、测试数、隐私和 failure atomicity。

### Produces / consumes

Produces frozen contracts, RolloutScenarioSourceInput, source success/failure union and one private bridge. Consumes existing public ParticleBank handle plus complete replay context; does not enlarge the public ParticleBank API.

## 3. Task 2 — Team Utility / terminal truth table / leaf

### Scope

允许创建/修改：

~~~text
src/ai/rollout/teamUtility.ts
src/ai/rollout/leafEvaluation.ts
tests/ai/rollout/teamUtility.test.ts
tests/ai/rollout/leafEvaluation.test.ts
~~~

### TDD actions

- [ ] 创建 describe("teamUtility")，先加入 it("maps all six valid team rank pairs")，断言 {1,2} 到 {3,4} 的六个值为 3,2,1,-1,-2,-3。
- [ ] RED：npx vitest run tests/ai/rollout/teamUtility.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期为 export/module/function 不存在。
- [ ] 加入 it("rejects zero utility and malformed finish orders")，覆盖缺失、重复、未知座位和 zero。
- [ ] 加入 it("preserves team swap sign, seat rotation, and partner interchange")；使用相对团队座位，不用绝对 seat number。
- [ ] 创建 describe("leafEvaluation") 与 it("projects unfinished seats by hand count then relative turn distance")。
- [ ] 加入 it("keeps completed finish order before unfinished projection") 和 it("replays the same leaf state identically")。
- [ ] 最小实现 utility lookup、finish validation、hand-count/tie-distance projection 和同一 utility truth table；禁止经验系数、额外搭档奖励。
- [ ] 若仓库轮转事实无法证明 tie-break 旋转等变，停止该实现并报告证据，不能改成绝对 seat number。
- [ ] GREEN focused：两个文件全部通过；回归 Task 1 contracts。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；审计 TeamUtility 不包含 zero。
- [ ] 使用 git commit -m "feat(ai): add D2F team utility and leaf evaluation"；提交后停止。

### Produces / consumes

Produces TeamUtilityResult、LeafEvaluationResult 和纯函数 leaf evaluator。Consumes RolloutPublicState、finish order、hand counts、team seat metadata；不读取 Room 或 hidden hands。

## 4. Task 3 — keyed CRN identity and replay

### Scope

允许创建/修改：

~~~text
src/ai/rollout/crn.ts
src/ai/rollout/identity.ts
tests/ai/rollout/crnIdentity.test.ts
tests/ai/rollout/crnInvariance.test.ts
~~~

### TDD actions

- [ ] 加入 it("does not include candidateId in random domain or semantic key")，对两个 candidateId 使用同一 coordinate 逐字段比较 random bytes/value。
- [ ] RED：npx vitest run tests/ai/rollout/crnIdentity.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期为候选无关 deriveRandomDomain/CrnView 尚不存在或签名不匹配。
- [ ] 加入 it("returns the same keyed value for the same scenario replicate ply seat and semantic key")。
- [ ] 加入 it("gives common legal actions the same priority across candidate simulations")，semantic key 使用 canonical action identity。
- [ ] 加入 it("changes the deterministic stream when replicate ordinal changes")，证明 replicateCount 不是无意义循环。
- [ ] 加入 it("is independent of candidate array order and completion order")，将结果按 candidateId 重排后比较 byte-stable canonical summary。
- [ ] 加入 candidate-specific/unpaired event test：有对应事件的 candidates 复用相同 domain/key；无对应物时只能使用不含 candidateId 的 `unpaired:<event-kind>` 规则，无法形成公共语义时返回 typed kernel failure。
- [ ] 加入 duplicate-key/collision test：同一 coordinate 重复查询同一 semantic key 必须复用同一值；不同事件使用不同 canonical key；domain/key 编码碰撞被拒绝或显式区分。
- [ ] 加入 canonical-source prohibition test：semantic key/domain 不依赖对象地址、Map 插入顺序、localeCompare、绝对 seat number 或绝对 candidate 数组位置；`CrnView.value` 不能暴露 raw seed/tape/cursor。
- [ ] 最小实现 canonical identity encoding、候选无关 deriveRandomDomain(coordinate) 和无 cursor 的 CrnView.value(semanticKey)；不得使用 Math.random、object enumeration 或 shared mutable RNG。
- [ ] GREEN：focused CRN tests 全通过；回归 Task 1–2。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；扫描 candidateId 不在 random domain/tape/key/draw 调用链。
- [ ] 使用 git commit -m "feat(ai): add keyed D2F CRN identity"；提交后停止。

### Produces / consumes

Produces CrnView、CrnCoordinate、canonical identity helpers and deterministic replicate streams. Consumes root/scenario/replicate/ply/seat/domain coordinates and semantic action keys only.

## 5. Task 4 — seat-local policy and rollout kernel

### Scope

允许创建/修改：

~~~text
src/ai/rollout/policy.ts
src/ai/rollout/kernel.ts
src/ai/rollout/stateConservation.ts
tests/ai/rollout/policy.test.ts
tests/ai/rollout/kernel.test.ts
tests/ai/rollout/rolloutPrivacyAst.test.ts
~~~

### TDD actions

- [ ] 加入 it("receives RolloutPolicyDecisionContext and uses keyed random")，spy 只提供 value(semanticKey)，拒绝 next() 属性。
- [ ] RED：npx vitest run tests/ai/rollout/policy.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期为 chooseAction(observation, context) 或 keyed policy 不存在。
- [ ] 加入 it("does not expose other seats' complete hands or ParticleScenario to policy")，检查 observation shape 和 AST/symbol imports。
- [ ] 加入 it("does not import full HandPlanner")，对 src/ai/rollout/** 做 AST import prohibition。
- [ ] 加入 malformed-number/seat test：NaN、Infinity、负数、小数、overflow work-unit、非法 seat 和 mutable observation 都在 policy/kernel 边界 typed-fail，不能进入 success result。
- [ ] 在 kernel test 加入 it("uses the explicit ValidatedRolloutBudget and stops by work-unit count")；传入小的 explicit budget/limits，不读取全局 profile 或 wall clock。
- [ ] 加入 it("preserves card conservation and fails atomically on invalid state")。
- [ ] 最小实现 canonical legal-action enumeration、keyed priority、seat-local observation、validated budget consumption 和 state conservation checks；所有 kernel errors 返回 RolloutReplicateResult failure。
- [ ] GREEN：policy/kernel/privacy focused tests 全部通过；回归 Task 1–3。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；确认候选顺序和 worker 调度不改变 result。
- [ ] 使用 git commit -m "feat(ai): add D2F seat-local rollout kernel"；提交后停止。

### Produces / consumes

Produces RolloutPolicyResult、RolloutReplicateResult、seat-local policy and finite-budget kernel. Consumes RolloutReplicateInput、CrnView、ValidatedRolloutBudget and replayed private state only inside the kernel; policy sees only its seat-local projection.

## 6. Task 5 — evidence gate / aggregation / risk ranking

### Scope

允许创建/修改：

~~~text
src/ai/rollout/aggregation.ts
src/ai/rollout/ranking.ts
src/ai/rollout/evidenceGate.ts
tests/ai/rollout/evidenceGate.test.ts
tests/ai/rollout/aggregation.test.ts
tests/ai/rollout/ranking.test.ts
~~~

### TDD actions

- [ ] 加入 it("rejects low ESS before entering the candidate loop")，断言 failure.kind 为 effective-sample-size-too-low，并用 spy 证明 kernel 未被调用。
- [ ] RED：npx vitest run tests/ai/rollout/evidenceGate.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期 evidence gate/export 不存在。
- [ ] 加入 it("rejects insufficient scenarios before entering the candidate loop") 与 it("rejects insufficient replicates and coverage mismatch")，覆盖四个 exact failure kinds。
- [ ] 加入 it("uses scenario weight times replicate as the aggregation denominator")，断言 candidate 数量不改变分母。
- [ ] 加入 it("computes riskAdjustedUtility with the frozen variance and downside formula")。
- [ ] 加入 it("orders unrounded risk adjusted utility, expected utility, baseline score, then UTF-16 candidateId")。
- [ ] 加入 it("does not change ranking when public values are rounded to six digits")。
- [ ] 加入 numeric/result-boundary tests：非 finite utility/aggregate、非法 count/weight、rootDigest mismatch、summary/ranking candidate set mismatch 都返回 exact typed failure，不产生 public `aggregateDiagnostics`。
- [ ] 最小实现 pre-candidate evidence validation、complete scenario/replicate coverage check、weighted expected/variance/risk、risk formula 和未舍入排序；只有最后一步才生成 RolloutResult。
- [ ] GREEN：focused evidence/aggregation/ranking tests 全通过；回归 Task 1–4。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；审计 RolloutResult 只使用 rootDigest，且 aggregateDiagnostics 字段完全一致。
- [ ] 使用 git commit -m "feat(ai): add D2F evidence aggregation and ranking"；提交后停止。

### Produces / consumes

Produces RolloutAggregationResult、CandidateRolloutSummary、RolloutAggregateDiagnostics and complete RolloutResult. Consumes all candidate-independent scenario/replicate records with the same coverage and explicit RolloutEvidenceRequirements/RolloutRiskPolicy.

## 7. Task 6 — detached orchestration and failure atomicity

### Scope

允许创建/修改：

~~~text
src/ai/rollout/rolloutOrchestrator.ts
src/ai/rollout/rolloutInputFreeze.ts
tests/ai/rollout/rolloutOrchestrator.test.ts
tests/ai/rollout/failureAtomicity.test.ts
~~~

Task 6 是 detached orchestration + failure atomicity；它不是 Shadow integration，不创建 observer，不修改 Room，不添加 call site。

### TDD actions

- [ ] 加入 it("returns no partial RolloutResult when one candidate replicate fails")。
- [ ] RED：npx vitest run tests/ai/rollout/rolloutOrchestrator.test.ts --exclude "**/.worktrees/**" --reporter=verbose；预期 orchestrator/export 不存在。
- [ ] 加入 it("keeps formalExecutionAllowed false and never returns an action to formal decision code")。
- [ ] 加入 it("does not mutate Room, ParticleBank, public ledger, candidates, or request input")，前后做 deep snapshot。
- [ ] 加入 it("reuses one immutable scenario set for every candidate")，spy source call count 为一次，candidate loops 只读取同一 source result。
- [ ] 加入 it("is invariant to candidate and scenario completion order")。
- [ ] 加入 it("keeps replay context, ParticleBank snapshot, public ledger, current trick, candidates and rootDigest on one immutable root")；变更/重排任一 caller-owned reference 后，原 request 和 result identity 不得漂移。
- [ ] 最小实现 request validation、input freeze、source once、evidence gate before candidate loop、candidate-independent CRN coordinates、atomic aggregation 和 detached return。
- [ ] GREEN：orchestration/failure tests 全通过；回归 Task 1–5 与粒子 focused command。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；确认仍无 observer/call site。
- [ ] 使用 git commit -m "feat(ai): add detached D2F rollout orchestration"；提交后停止。

### Produces / consumes

Produces the detached orchestrator and atomic RolloutResult/RolloutFailure boundary. Consumes only explicit request, immutable ParticleBank source and prior Task contracts. It produces no formal action and no Shadow telemetry.

## 8. Task 7 — measured budget calibration benchmark

### Scope

允许创建/修改：

~~~text
scripts/benchmarks/d2f-rollout-budget-calibration.ts
tests/ai/rollout/d2fBenchmarkContract.test.ts
~~~

当前只读工具证据：package.json/package-lock.json 声明 tsx ^4.19.2（lockfile 当前解析版本为 4.22.4），但当前 node_modules/tsx 与 node_modules/.bin/tsx.cmd 不存在。不得用 `npx tsx`、plain `npm exec`、全局安装或临时网络下载。`AWAITING_FIXED_BENCHMARK_RUNNER` 是 Task 7 preflight 状态，不是 Task 1 blocker。恢复顺序冻结为：在 source worktree 准备或 Task 7 preflight 的 Node 22.22.2 环境运行 `npm ci`；随后运行 `git diff --exit-code -- package.json package-lock.json` 验证 lockfile/package 未变化；验证 `Test-Path .\node_modules\.bin\tsx.cmd`（Windows，或 Unix 本地 binary）为 true；运行 `& .\node_modules\.bin\tsx.cmd --version`，再用同一 local fixed binary 执行 benchmark。任一步失败都保持 AWAITING 状态，不能跳过 benchmark RED。

### TDD actions

- [ ] 只读确认 benchmark entry 不存在、tsx package/lock declaration 和当前 local module 状态；不安装依赖。
- [ ] 先写 tests/ai/rollout/d2fBenchmarkContract.test.ts 的非计时契约测试：it("builds a ParticleBank from public tracked fixture data without serializing a handle")。
- [ ] 命令级 RED 在 fixed local runner preflight 通过后使用 `& .\node_modules\.bin\tsx.cmd scripts/benchmarks/d2f-rollout-budget-calibration.ts --fixture tests/fixtures/ai/d2f-public-rollout-fixture.json`（Unix 使用同一 local binary）；在 entry 尚不存在时预期为 entry/module not found。runner 尚不存在时状态为 AWAITING_FIXED_BENCHMARK_RUNNER，不能跳过这次 RED；这个 RED 只针对 benchmark entry，不改变既有 correctness Gate，也不修改测试断言。
- [ ] fixture 只承载已跟踪的 public identity、public ledger/history、game rank、acting/perspective seat、己方 hand 和公开配置；不得承载 WeakMap handle、raw hidden scenario、particle weights 或 seed。
- [ ] 最小脚本在进程内调用已有 public buildParticleBank(input) 创建 handle，再调用 detached orchestrator；seed 由 fixture identity 的 canonical deterministic derivation 在进程内产生，不写入 fixture、stdout 或 report。
- [ ] 输出只包含预算坐标、work units、elapsed telemetry 和脱敏 aggregate；不把 elapsed time 作为语义结果。
- [ ] GREEN 只能在 npm ci、package/lockfile unchanged、本地 `tsx.cmd`/`tsx` 存在并通过 `--version` 后用该 local binary 运行；禁止网络下载、禁止 npx 或 plain npm exec 自动解析。
- [ ] GREEN 只能在上述 local `tsx.cmd`/`tsx` fixed binary preflight 通过后运行；Task 7 只做 budget calibration，不启用 Shadow active mode、feature flag 或正式 action 分支。
- [ ] correctness command 与 benchmark command 分开运行：先 npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot，再执行固定 runner benchmark。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；记录 measured budget，不把它写成 production/active 默认值。
- [ ] 使用 git commit -m "bench(ai): calibrate D2F rollout budget"；提交后停止并等待人工批准 shadow profile。

### Produces / consumes

Produces independent microbenchmark evidence and a public fixture builder. Consumes the detached orchestrator and public build inputs; does not expose hidden scenario/weight/seed data.

## 9. Task 8 — real Shadow observer and non-interference

### Scope and required read-only audit

允许创建/修改：

~~~text
src/ai/rollout/d2fShadowObserver.ts
src/game/room.ts                         # 仅 runAiStep 一个调用点
tests/ai/rollout/d2fShadowObserver.test.ts
tests/ai/rollout/d2fShadowObserverIntegration.test.ts
tests/ai/rollout/d2fShadowByteLock.test.ts
~~~

先只读审计：

~~~text
src/ai/tactics/representativeActionShadowObserver.ts
src/ai/aiDecisionEngine.ts
src/game/room.ts:runAiStep
~~~

当前 representative observer 是 D2e 且位于正式 action 选择之前，不能被用作 D2F 接入证明。正式选择点的最小旁路冻结为 `src/game/room.ts:runAiStep` 的以下 pre-action/post-commit 数据流：原决策链生成并冻结 formal action、baseline score 和 canonical candidate projection；在 `passTurn`/`playCards` 执行前，从同一 Room root 捕获 immutable、脱敏的 `D2FShadowPreActionSnapshot`（包含 root identity/digest、ParticleBank handle、public ledger/history、current trick、game rank、己方 hand、public counts、candidate projection 和预算）；snapshot 构造置于独立 try/catch，失败只能产生 unavailable/fallback，不能阻止、替换或延迟 formal action；然后提交 `passTurn`/`playCards`、完成 runtime/plan 更新；最后把已捕获 snapshot 传给 `void observeD2FShadow(snapshot)`，observer 不得再读取已变化的 Room 来构造原 root。此调用点是 `room.ts` 唯一 Task 8 改动；不修改 `aiDecisionEngine.ts`，不修改已有 representative observer。

正式 action 一旦由原 evaluator 选定，D2F 不能修改 action、evaluator、candidate filter、plan selector、Room transition 或 transaction result。`formalExecutionAllowed` 固定为 literal `false`，不得添加 active branch、feature flag 或以后设为 true 的 production path。所有 snapshot/reference 必须 clone/freeze 或转为不可变 projection；candidate、ParticleBank、public ledger、current trick 和 root identity 必须来自同一个 pre-action root。snapshot capture failure、observer throw、D2F success/failure、low ESS、bad utility、budget failure 和 telemetry failure 都只能进入 diagnostics。

### TDD actions

- [ ] 先建立审计记录：observer 现有输入/diagnostics、decideAiAction 的选择顺序、Room action mutation 和返回点。
- [ ] 写 it("returns void and cannot change the committed formal action")；RED 命令 npx vitest run tests/ai/rollout/d2fShadowObserver.test.ts --exclude "**/.worktrees/**" --reporter=verbose，预期 D2F observer/export 不存在。
- [ ] 写 it("captures the pre-action root before formal commit and observes only the captured snapshot after commit")，使用 call-order spy，并断言提交后修改 Room 不会改变 shadow root。
- [ ] 写 it("swallows rollout, low-evidence, budget, and telemetry failures")。
- [ ] 写 it("swallows snapshot capture throw and still commits the formal action")。
- [ ] 写 it("emits only redacted shadow evidence")，禁止 raw scenario、full opponent hands、weight detail、seed。
- [ ] 写 it("does not return data to evaluator, candidate filter, plan selector, or Room transition")。
- [ ] 写 byte-lock test it("keeps formal action and public state byte-identical with Shadow enabled")；比较 action、Room transition、ledger、runtime、plan、replay bytes，排除 elapsedWallClockMs。
- [ ] 写 negative-control characterization：强制 fake D2F result 推荐与原 evaluator action 相反，formal action、public ledger、current trick、runtime、plan 和 replay bytes 仍 byte-identical。
- [ ] 写 AST/symbol test：`room.ts` 只有 Task 8 的一个调用点，formal flag 无 true literal/active branch，D2F observer 不导出 RolloutResult 给正式决策路径。
- [ ] 最小实现 `observeD2FShadow(snapshot): void`，内部 try/catch，使用 Task 7 approved explicit budget，失败写 D2FShadowEvidence fallback；sink 是 best-effort void sink，observer 只消费 snapshot，不接收 Room。
- [ ] 在 `runAiStep` 只加入一个旁路调用：调用前捕获 pre-action snapshot，调用后只传该 snapshot；不传完整 Room/对手 private hands，不在提交后重建 root。
- [ ] GREEN：observer/unit/integration/byte-lock tests 全通过；回归已有 D2e observer tests、Task 1–7 和 particle focused command。
- [ ] 运行 npx tsc --noEmit、build、git diff --check；确认正式决策路径语义未变，D2F result 不回流。
- [ ] 使用 git commit -m "feat(ai): add non-interfering D2F shadow observer"；提交后停止。

### Produces / consumes

Produces real detached Shadow observation and redacted D2FShadowEvidence. Consumes frozen action/public projection only after formal commit; all failures are swallowed and cannot affect formal state.

## 10. Task 9 — final verification and handoff

### Scope

Task 9 不添加功能。允许修改仅限于实现后必要的 verification report artifact if the task owner explicitly requests one；正常情况下只运行命令、收集证据和提交阶段报告，不修改 source/test/config。

### Verification actions

- [ ] git status --short、git diff --check、git diff --name-only；确认每个前序 commit 范围单一。
- [ ] 运行 D2F rollout focused manifest，显式 --exclude "**/.worktrees/**"，记录 exact files/tests/passed/failed/skipped。
- [ ] 运行冻结 particle command，必须保持 10 files / 136 tests 基线并核对无重复。
- [ ] 将历史 `23 files / 222 tests` 明确记录为 historical handoff only；当前 checkout 没有可独立核验的 exact 23-path manifest，不得把它作为当前 Gate，也不得用未命名的 19-file list 代替。
- [ ] 冻结并验证 `D2_CURRENT_REGRESSION_MANIFEST`：按 Test Gate Matrix 列出的 19 个 exact tracked paths（D2a/D2b public ledger/replay、D2c plan policy、D2d reducer、D2e representative Shadow）；验证每条路径存在、tracked、唯一且无 `.worktrees/**`，Task 9 以该 manifest 实际 collection/test count 为准。
- [ ] 使用 Test Gate Matrix 的 `git ls-files` + PowerShell 显式过滤规则生成 `FULL_PERMITTED_REGRESSION_MANIFEST`；规则必须验证 inclusion/exclusion、唯一性、路径存在/tracked、无遗漏、每个文件恰好进入一个按实测耗时分片，并按 shard 分别运行，不能依赖多次 `--exclude` 累加语义。
- [ ] benchmark timing 与 correctness 分离；Task 7 仅在 `npm ci`、package/lockfile unchanged、本地固定 `tsx.cmd`/`tsx --version` preflight 后运行。benchmark runner 缺失保持 `AWAITING_FIXED_BENCHMARK_RUNNER`，不是 Task 1 blocker。
- [ ] 在 Node 22.22.2 已存在环境或经授权 CI workflow 运行 `tsc --noEmit`、build、D2F focused、`D2_CURRENT_REGRESSION_MANIFEST`、full permitted shards 和 benchmark；Node 24.15.0 只能 supplemental。未取得 Node 22 证据时最终状态必须为 `AWAITING_NODE22_CI`，不得称为 D2F SHADOW RELEASE READY。
- [ ] 运行 privacy AST/import scan、candidateId random scan、ESS/risk/sort scan、shadow call-site scan、failure atomicity and immutability checks。
- [ ] 生成最终阶段报告：start/end HEAD、branch/worktree、changed paths、全部命令/结果/耗时、test counts、privacy/determinism/immutability/fallback/performance、正式决策路径是否修改、遗留风险和下一步精确前置条件。
- [ ] 只在所有 required gates 通过后创建 final verification commit；任何强制 Gate 未通过都报告 BLOCKED 或对应等待状态，不写“基本完成”。

### Final acceptance

Task 9 不把 D2F ranking 接入正式 action。最终报告必须同时列出新 D2F manifest/新增测试数、10/136 particle baseline、`D2_CURRENT_REGRESSION_MANIFEST` 的 exact 19 paths 与实际测试数、历史 23/222 handoff（不得冒充当前 Gate）、full permitted manifest/shard 规则与实际结果，并明确每一个 manifest 是否有可审计路径和 exit code；历史 87/898 只能单独报告为 historical evidence。

## 11. Commit/report contract

每个 Task 一个 commit；不得 amend、squash 或跨 Task 夹带修改。每个阶段报告必须包含：起始/结束 HEAD、branch/worktree、changed paths、契约/算法决策及理由、首次 RED 命令/失败信息/原因、全部验证命令/结果/测试数/耗时、privacy/determinism/immutability/fallback/performance、正式决策路径是否修改、遗留风险、下一 Task 精确前置条件和 commit hash。
