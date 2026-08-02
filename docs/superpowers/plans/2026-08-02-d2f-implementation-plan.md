# D2F CRN Rollout / Team Utility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Every task ends at its own review checkpoint and must stop for human approval.

**Goal:** 按已冻结的 D2F 设计，在 `src/ai/rollout/**` 中实现 detached/offline/shadow 的 CRN rollout kernel、Team Utility、加权 aggregation 和 failure-atomic result，而不改变正式出牌路径。

**Architecture:** `particleBankRolloutAccess.ts` 是唯一读取 ParticleBank WeakMap internals 的窄 bridge，`particleScenarioSource.ts` 是唯一 bridge consumer。rollout kernel 对同一 immutable bank record 集合、replicate 和 CRN tape 复用场景；policy 只接收 seat-local observation。`runRollout.ts` 的结果永远是脱敏 summary，`formalExecutionAllowed` 永远是 `false`，不连接 Room 或 `decideAiAction`。

**Tech Stack:** TypeScript 5.7、Vitest 2.1.9、现有 ParticleBank/replay/canonical identity、SHA-256 identity、Node 22.22.2 正式验证环境。Node 24.15.0 仅作为 supplemental environment evidence。

## Global Constraints

- D2F 只建设 `ParticleBank → CRN finite simulation → Team Utility → weighted expectation/variance/risk → stable ranking → detached/offline/shadow evidence`。
- `formalExecutionAllowed` 必须是 literal `false`，不能通过可变配置、默认值、调用者 cast 或未验证 adapter 绕过。
- D2F 不改变正式出牌，不替换 evaluator，不调用完整 HandPlanner，不连接 `runAiStep`、`decideAiAction`、Room、public ledger、replay 或正式 action reducer。
- 所有 candidate 使用同一个 immutable ParticleBank、相同 scenario/replicate/budget/depth/CRN tape；candidate input position、worker schedule、object enumeration 和 completion order 不参与语义结果。
- policy 只能接收当前模拟座位的 `SeatLocalObservation`，不得看到其他座位的完整手牌、原 Room 或完整 `ParticleScenario`。
- 不使用 `Math.random`、`Date.now`、`performance.now`、`process.env`、worker order 或 wall clock 产生正常结果或停止条件。
- 所有预算字段必须是有限 safe integer；乘法溢出、工作量超限、非有限 utility/weight/aggregate 都失败关闭。
- 任一关键失败都丢弃整个 partial result；不能返回半完成排序。
- public diagnostics/result 脱敏，不输出 raw scenario、assignments、完整对手手牌、raw weight detail、seed 或可还原随机流的 domain/tape。
- Task 1～6 不设置 production/shadow default profile；必须传入显式 `RolloutBudget` 和 `RolloutBudgetLimits`。
- Node 22.22.2 是正式 CI/可重复验证基线；本机 Node 24.15.0 只能作为 supplemental evidence，不能改写 `package.json.engines` 或 Node 安装。
- 本计划只允许当前提交创建三份文档；执行本计划时才按每个 Task 的 allowlist 创建源文件和测试文件。

## Frozen file map and forbidden paths

本计划未来的唯一 production module 根目录是 `src/ai/rollout/**`。唯一允许位于 particles 根目录的新增 production 文件是：

```text
src/ai/particles/particleBankRolloutAccess.ts
```

该文件只读取 `readParticleBankInternals`，不修改 `particleBankInternals.ts`，不改变 ParticleBank public API。

未来 correctness tests 只能位于 `tests/ai/rollout/**`。独立性能脚本只能位于：

```text
scripts/benchmarks/d2f-rollout-budget-calibration.ts
scripts/benchmarks/fixtures/d2f-rollout-budget-calibration-input.json
```

明确禁止修改或创建：

```text
src/ai/planning/**
src/game/room.ts
src/game/ai.ts
src/ai/aiDecisionEngine.ts
src/ai/contracts.ts
src/ai/runtimeContracts.ts
src/ai/planning/handPlanner.ts
src/ai/planning/planManager.ts
src/ai/planning/planSelector.ts
src/ai/planning/planEvaluator.ts
src/game/publicEvent.ts
src/game/publicLedger.ts
src/game/publicEventReplay.ts
package.json
package-lock.json
tsconfig.json
vite.config.ts
tests/benchmark/**
tests/simulation/**
tests/performance/**
```

不创建 `src/ai/rollout/index.ts` 或任何 public barrel。任何需要扩大 allowlist 的事实都必须停止当前 Task，形成差异报告并等待人工批准。

## Frozen interfaces used by every Task

以下类型名必须在所有 Task、测试和三个冻结文档中保持一致：

```ts
export type RolloutMode = "detached" | "offline" | "shadow";

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

`risk` 冻结为 weighted probability of `utility < 0`；不添加额外经验系数。候选排序冻结为 `expectedUtility` 降序、`variance` 升序、`risk` 升序、`candidateId` UTF-16 升序。

Task interfaces that are intentionally private to their module are still named explicitly: `RolloutScenario` contains detached private replay state; `RolloutScenarioSourceResult` is the success/failure union returned by the source; `RolloutLeafInput` contains only finish order, hand counts and turn seat; `RolloutReplicateInput` contains one candidate, one scenario, one replicate identity, one immutable CRN tape, one explicit budget and one policy. Their exact fields are frozen in the design spec and are not public-barrel exports.

```ts
type TeamUtility = -3 | -2 | -1 | 0 | 1 | 2 | 3;
type RolloutScenarioSourceResult =
  | Readonly<{ ok: true; scenarios: readonly RolloutScenario[] }>
  | Readonly<{ ok: false; failure: RolloutFailure }>;
type RolloutLeafInput = Readonly<{
  finishOrder: readonly PublicSeat[];
  handCounts: Readonly<Record<PublicSeat, number>>;
  turnSeat: PublicSeat;
}>;
type RolloutReplicateInput = Readonly<{
  candidate: RolloutCandidate;
  scenario: RolloutScenario;
  replicateIdentity: string;
  crnTape: Readonly<{ valueAt(drawOrdinal: number): number }>;
  budget: RolloutBudget;
  policy: RolloutPolicy;
}>;
type RolloutResult = Readonly<{
  schemaVersion: "d2f-rollout-result-v1";
  mode: RolloutMode;
  formalExecutionAllowed: false;
  candidateSummaries: readonly CandidateRolloutSummary[];
  ranking: readonly string[];
}>;
```

---

### Task 1: Freeze contracts and the private ParticleBank bridge

**Files:**

- Create: `src/ai/rollout/contracts.ts`
- Create: `src/ai/particles/particleBankRolloutAccess.ts`
- Create: `src/ai/rollout/particleScenarioSource.ts`
- Create: `tests/ai/rollout/particleBankRolloutBoundary.test.ts`
- Create: `tests/ai/rollout/rolloutContractValidation.test.ts`
- Modify: none

**Allowed paths:** only the three listed production files and two listed tests. `particleBankInternals.ts` remains unchanged.

**Forbidden paths:** all global forbidden paths, all other `src/ai/particles/**`, any public barrel, any policy/kernel/aggregation implementation, and every formal decision file.

**Consumes:** existing `ParticleBank`, `ParticleScenario`, `ParticleRecord`, `ParticleBankInternals`, `ParticleBankFailureReason` and canonical identity contracts from `src/ai/particles/**`.

**Produces:**

- `readParticleBankRecordsForRollout(bank: ParticleBank): readonly ParticleRecord[] | undefined` in the bridge. It is the only new reader of `readParticleBankInternals`; it clones and deep-freezes the returned records.
- `createParticleScenarioSource(bank: ParticleBank): RolloutScenarioSourceResult` in `particleScenarioSource.ts`. This is the only rollout module allowed to call the bridge.
- request/budget/candidate/identity/result/failure types in `contracts.ts`; no source file exports a public barrel.

**First failing test:**

```text
npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

Expected failure: the approved bridge/source modules and contract symbols do not yet exist, so module resolution or symbol-boundary assertions fail. This is a boundary RED, not a production behavior failure.

**Implementation steps:**

- [ ] Write the AST/symbol RED test that resolves imports and proves exactly one particles-side module imports `readParticleBankInternals`, exactly one rollout module imports the bridge, and no `src/ai/rollout/**` module imports `particleBankInternals.ts` directly.
- [ ] Write contract RED assertions for literal `formalExecutionAllowed: false`, explicit budget/limits fields, failure union, absence of `privateState` from `RolloutResult`, and unknown/fake handle failure.
- [ ] Run the two focused RED commands and record the exact missing-symbol/import failure.
- [ ] Add only the frozen contracts, bridge clone/freeze, and scenario-source mapping. The bridge must not import `src/ai/rollout/**`; the source maps particle records into private rollout scenarios and never returns them through diagnostics.
- [ ] Run both focused files again. Verify fake handles return `unknown-bank-handle`, bridge outputs cannot mutate registry state, and all output nodes are detached/frozen.
- [ ] Run `npx tsc --noEmit`, `npm run build`, `git diff --check`, and the D2F privacy/import scan from `tests/ai/rollout/particleBankRolloutBoundary.test.ts`.
- [ ] Audit privacy, immutability, determinism and failure atomicity: no scenario/assignment/weight/seed appears in a public result or failure.
- [ ] Commit only the five Task 1 files with `feat(ai): add private D2F particle bridge contracts`.
- [ ] Stop and produce the Task 1 report; wait for human review before Task 2.

**Task Gate:** bridge import graph is exact, fake handles fail closed, no public API expands, and no formal path changes.

---

### Task 2: Implement Team Utility and non-terminal leaf evaluation

**Files:**

- Create: `src/ai/rollout/teamUtility.ts`
- Create: `src/ai/rollout/leafEvaluation.ts`
- Create: `tests/ai/rollout/teamUtility.test.ts`
- Create: `tests/ai/rollout/leafEvaluation.test.ts`
- Modify: none

**Allowed paths:** the four listed files only.

**Forbidden paths:** all existing game settlement/room files, formal decision files, particles files, benchmark files, and all Task 3+ rollout files.

**Consumes:** `PublicSeat`, `GameRank` only where needed for observation typing, and Task 1 frozen rollout types.

**Produces:**

- `teamUtilityForFinishOrder(finishOrder: readonly PublicSeat[], perspectiveSeat: PublicSeat): TeamUtility`.
- `projectFinishOrder(input: RolloutLeafInput): readonly PublicSeat[]`.
- A pure relative-seat distance helper based on the repository’s existing `(seat + 3) % 4` turn direction, never absolute seat number.

**First failing test:**

```text
npx vitest run tests/ai/rollout/teamUtility.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

Expected failure: `teamUtilityForFinishOrder` is not defined.

**Implementation steps:**

- [ ] Write the six truth-table cases `{1,2}:+3`, `{1,3}:+2`, `{1,4}:+1`, `{2,3}:-1`, `{2,4}:-2`, `{3,4}:-3`.
- [ ] Add RED tests for duplicate/missing/out-of-range seats, team swap sign, global seat rotation, and partner seat interchange.
- [ ] Run focused RED tests and record the first missing-function or assertion failure.
- [ ] Implement only the pure table lookup and validation; do not add partner bonus, experience factor, or settlement mutation.
- [ ] Write leaf RED tests for preserving real finish order, ascending remaining hand count, equal-count relative turn distance, and complete predicted order.
- [ ] Run the leaf RED tests, then implement `projectFinishOrder` using the existing counterclockwise numeric step as the project’s clockwise traversal relation. Do not import `room.ts`.
- [ ] Add a rotation-equivalence property fixture. If the actual turn relation fails the property, stop with evidence and replace the tie-break only with a relative relation plus canonical state key; never use absolute seat number.
- [ ] Run `npx tsc --noEmit`, `npm run build`, focused Task 2 tests, and `git diff --check`.
- [ ] Audit privacy, immutability, determinism and failure atomicity; functions must not mutate input finish order/counts.
- [ ] Commit only the four Task 2 files with `feat(ai): add D2F team utility leaf evaluation`.
- [ ] Stop and report; wait for human review before Task 3.

**Task Gate:** every valid complete order maps to the frozen table; all symmetry tests pass; no room/settlement decision path changes.

---

### Task 3: Freeze identity domains and CRN deterministic streams

**Files:**

- Create: `src/ai/rollout/rolloutIdentity.ts`
- Create: `src/ai/rollout/crnStream.ts`
- Create: `tests/ai/rollout/rolloutIdentity.test.ts`
- Create: `tests/ai/rollout/crnStream.test.ts`
- Modify: none

**Allowed paths:** the four listed files only.

**Forbidden paths:** every formal decision path, every particle producer/contract file, any worker module, any benchmark script, and any mutable global RNG.

**Consumes:** Task 1 `RolloutRootIdentity`, `RolloutCandidate`, `RolloutScenario` identity fields and existing canonical particle scenario identity function.

**Produces:**

- `createRolloutRootIdentity(input)`.
- `deriveScenarioIdentity(root, scenario)`.
- `deriveCandidateIdentity(action)`.
- `deriveReplicateIdentity(root, scenarioIdentity, replicateOrdinal)`.
- `deriveRandomDomain(root, scenarioIdentity, candidateId, replicateIdentity, domain)`.
- `createCrnTape(domain, drawCount)` returning immutable indexed values; no `next()` cursor shared between candidates.

**First failing test:**

```text
npx vitest run tests/ai/rollout/rolloutIdentity.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

Expected failure: identity functions are not defined.

**Implementation steps:**

- [ ] Write RED tests for same inputs producing byte-identical identities, candidate identity excluding array position, same scenario/replicate sharing the candidate-independent tape, and different domain/draw values being distinct.
- [ ] Add RED tests for candidate permutation, scenario completion-order permutation, same-seed particle replay, and independent repeated calls.
- [ ] Run RED and record the missing-symbol failure.
- [ ] Implement canonical identity serialization with existing SHA-256 conventions and fixed UTF-8/UTF-16 comparator rules. Do not include raw seed, process state, object address or worker id.
- [ ] Implement indexed deterministic stream derivation. Each candidate receives the same immutable CRN tape for a scenario/replicate; no mutable RNG is consumed in candidate iteration.
- [ ] Add AST/symbol assertions rejecting `Math.random`, `Date.now`, `performance.now`, `process.env`, `Worker`, and locale-dependent ordering in rollout modules.
- [ ] Run focused Task 3 tests, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
- [ ] Audit privacy, immutability, determinism and failure atomicity; domain/tape internals must never appear in public diagnostics.
- [ ] Commit only the four Task 3 files with `feat(ai): add D2F CRN identity domains`.
- [ ] Stop and report; wait for human review before Task 4.

**Task Gate:** candidate order, worker order and repeated same-input runs are byte-stable; CRN values are common across candidates and independent of candidate position.

---

### Task 4: Add the fixed-budget seat-local policy and finite rollout kernel

**Files:**

- Create: `src/ai/rollout/rolloutPolicy.ts`
- Create: `src/ai/rollout/rolloutKernel.ts`
- Create: `tests/ai/rollout/rolloutPolicyPrivacy.test.ts`
- Create: `tests/ai/rollout/rolloutKernel.test.ts`
- Modify: none

**Allowed paths:** the four listed files only.

**Forbidden paths:** `src/ai/planning/**`, `src/ai/aiDecisionEngine.ts`, `src/game/room.ts`, `src/game/ai.ts`, `HandPlanner`, all worker/benchmark modules, and all public serialization modules.

**Consumes:** Task 1 private `RolloutScenario` source, Task 2 leaf evaluation, Task 3 CRN tape, explicit `RolloutBudget` and `RolloutBudgetLimits`.

**Produces:**

- `createFixedRolloutPolicy(): RolloutPolicy`.
- `runRolloutReplicate(input: RolloutReplicateInput): RolloutReplicateResult`.
- A kernel that applies one candidate action, then selects bounded policy actions from seat-local observations until terminal or explicit ply cap.

**First failing test:**

```text
npx vitest run tests/ai/rollout/rolloutKernel.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

Expected failure: `runRolloutReplicate` is not defined.

**Implementation steps:**

- [ ] Write RED tests with explicit tiny budgets for terminal completion, max-ply leaf evaluation, invalid/non-finite budgets, multiplication overflow, and work-limit rejection.
- [ ] Write RED privacy tests proving policy receives only `SeatLocalObservation`, never `RolloutScenario`, complete hands, RoomState or another seat’s cards.
- [ ] Write RED AST/symbol tests rejecting imports/calls to `HandPlanner`, `generateHandPlans`, `generateFastHandPlans`, `generateRapidHandPlan`, `ensurePlans`, `decideAiAction`, `runAiStep`, `Room`, `RoomState`, and `Math.random`/wall clock APIs.
- [ ] Run RED focused tests and record the first missing-kernel failure.
- [ ] Implement finite safe-integer validation before any simulation loop. Check every work-product multiplication before execution.
- [ ] Implement the deterministic lightweight policy with canonical legal-action tie-break. It must not regenerate plans or call evaluator/planner code.
- [ ] Construct each seat-local observation from private scenario state, apply actions to a detached state, and stop only on terminal or explicit `maxPliesPerReplicate`.
- [ ] For each candidate use a fresh state clone and the exact same scenario/replicate CRN tape. Do not resample or regenerate the ParticleBank per candidate.
- [ ] Run focused Task 4 tests, the Task 1–3 focused files, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
- [ ] Audit privacy, immutability, determinism and failure atomicity; a failed policy/action/state transition returns typed failure and no partial replicate result.
- [ ] Commit only the four Task 4 files with `feat(ai): add bounded D2F rollout kernel`.
- [ ] Stop and report; wait for human review before Task 5.

**Task Gate:** explicit small budgets are the only budgets used, no planner path is reachable, candidate order does not affect replicate bytes, and seat-local privacy is proven by symbols and runtime fixtures.

---

### Task 5: Aggregate weighted Team Utility and stable candidate ordering

**Files:**

- Create: `src/ai/rollout/rolloutAggregation.ts`
- Create: `tests/ai/rollout/rolloutAggregation.test.ts`
- Create: `tests/ai/rollout/rolloutOrdering.test.ts`
- Modify: none

**Allowed paths:** the three listed files only.

**Forbidden paths:** all production decision modules, ParticleBank contracts/internals, public diagnostics, package/config files, and Task 6 service integration.

**Consumes:** Task 4 `RolloutReplicateResult`, Task 1 weights and summaries, Task 3 candidate identities, frozen Team Utility values.

**Produces:**

- `aggregateCandidateRollouts(input): CandidateRolloutSummary`.
- `rankCandidateSummaries(summaries): readonly CandidateRolloutSummary[]`.
- `expectedUtility`, `variance`, `risk` using only normalized particle weights and equal replicate count.

**First failing test:**

```text
npx vitest run tests/ai/rollout/rolloutAggregation.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

Expected failure: `aggregateCandidateRollouts` is not defined.

**Implementation steps:**

- [ ] Write RED tests for exact expectation, second moment variance, weighted downside probability, bounded outputs, and six-decimal public rounding.
- [ ] Write RED tests for candidate order permutation, summary order, tie-break ordering, same-state replay, and caller input immutability.
- [ ] Write RED tests for non-finite weights/utilities, weight mismatch, missing replicate, duplicate candidate identity and variance below tolerance; every case must fail atomically.
- [ ] Run RED and record the first missing-aggregation failure.
- [ ] Implement aggregate formulas without extra coefficients. Clamp only tolerance-sized negative zero variance; reject larger invalid values.
- [ ] Sort with the frozen tuple: expected utility descending, variance ascending, risk ascending, candidateId UTF-16 ascending.
- [ ] Return only aggregate fields; never retain candidate action/group, scenario, weight array, tape or private state references.
- [ ] Run focused Task 5 tests, Task 1–4 rollout tests, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
- [ ] Audit privacy, immutability, determinism and failure atomicity, including repeated serialization bytes.
- [ ] Commit only the three Task 5 files with `feat(ai): aggregate D2F rollout utility summaries`.
- [ ] Stop and report; wait for human review before Task 6.

**Task Gate:** every candidate has the same scenario/replicate coverage, aggregation is weighted and finite, ranking is input-order independent, and no private reference leaks.

---

### Task 6: Add detached/offline/shadow orchestration and no-interference proof

**Files:**

- Create: `src/ai/rollout/runRollout.ts`
- Create: `tests/ai/rollout/rolloutFailureAtomicity.test.ts`
- Create: `tests/ai/rollout/rolloutDetachedShadow.test.ts`
- Create: `tests/ai/rollout/rolloutInputImmutability.test.ts`
- Modify: none

**Allowed paths:** the four listed files only.

**Forbidden paths:** every formal decision and room path, every public barrel, package/config files, and all benchmark/calibration files.

**Consumes:** Task 1 scenario source/contracts, Task 2 utility/leaf, Task 3 identities/tape, Task 4 kernel/policy, Task 5 aggregation/order.

**Produces:**

- `runD2FRollout(request: RolloutRequest): RolloutRunResult`.
- `formalExecutionAllowed` literal false in both request validation and successful result.
- Detached/offline/shadow metadata only; no action callback, runtime writer, candidate mutator or room adapter.

**First failing test:**

```text
npx vitest run tests/ai/rollout/rolloutFailureAtomicity.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

Expected failure: `runD2FRollout` is not defined.

**Implementation steps:**

- [ ] Write RED tests for invalid mode/envelope, `formalExecutionAllowed: true` cast, unknown bank, invalid candidate identity, budget failure, policy failure, scenario failure, aggregate failure and non-finite output.
- [ ] Assert each failure has no candidate summaries, no ranking and no partial private diagnostics.
- [ ] Write detached/shadow characterization using cloned inputs. Run the existing formal decision baseline separately, then run D2F beside it and compare action, runtime, candidate count/order, score, public event, ledger, replay and room bytes.
- [ ] Run RED and record the missing-service failure.
- [ ] Implement validate-first orchestration: validate envelope → source immutable scenarios → validate workload → run all candidates/scenarios/replicates → aggregate → validate result → freeze result. Any exception maps to one sanitized failure.
- [ ] Keep all three modes semantically detached; mode is evidence metadata, never an action-control flag. Do not add a production observer or call site.
- [ ] Add AST/symbol tests proving no imports from `room.ts`, `game/ai.ts`, `aiDecisionEngine.ts`, `ai/planning/**`, public serialization or D2G treatment modules.
- [ ] Run all `tests/ai/rollout/*.test.ts`, the 10-file particle focused command, the fixed D2 regression manifest, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
- [ ] Audit privacy, immutability, determinism and failure atomicity. Verify the original request, bank handle, candidate array, public state and cloned Room remain byte-identical.
- [ ] Commit only the four Task 6 files with `feat(ai): freeze detached D2F rollout orchestration`.
- [ ] Stop and report; wait for human review before Task 7.

**Task Gate:** D2F can produce detached/shadow summaries but cannot alter the formal action path; all key failures discard the whole result.

---

### Task 7: Run independent budget calibration behind D2F_BUDGET_CALIBRATION_GATE

**Files:**

- Create: `scripts/benchmarks/d2f-rollout-budget-calibration.ts`
- Create: `scripts/benchmarks/fixtures/d2f-rollout-budget-calibration-input.json`
- Modify: none
- Test: existing `tests/ai/rollout/rolloutKernel.test.ts`, `tests/ai/rollout/rolloutAggregation.test.ts`, and the Task 6 rollout manifest; no benchmark code is imported by correctness tests

**Allowed paths:** the two listed benchmark files only. No production default profile is created.

**Forbidden paths:** `package.json`, lockfile, config, production AI/room paths, tests/benchmark/**, tests/simulation/**, tests/performance/**, and any shadow/active configuration.

**Consumes:** the approved Task 1–6 rollout API, fixed benchmark fixture, explicit budget vectors supplied through the input JSON, and the fixed particle manifest. It must not infer a production default from a test count or a single local run.

**Produces:** a standalone report containing input budget vector, manifest, files, scenarios, replicates, natural completion, output digest, throughput and measured wall-clock. Timing is report-only and never enters kernel semantics or stopping.

**Gate prerequisite:** before starting Task 7, record `D2F_BUDGET_CALIBRATION_GATE: APPROVED` from a human reviewer. Without that approval, stop and report blocked for Task 7; do not fabricate budget values.

**First failing test:**

```text
npx vitest run tests/ai/rollout/rolloutKernel.test.ts tests/ai/rollout/rolloutAggregation.test.ts --exclude "**/.worktrees/**" --reporter=verbose
```

Expected failure for the benchmark gate: no approved calibration input or benchmark artifact exists. This is an authorization failure, not permission to add a default.

**Implementation and verification steps:**

- [ ] Write the standalone runner contract and input fixture schema; require explicit budget vectors and fixed manifest entries.
- [ ] Run Task 4/5 correctness tests and record the natural outputs before measuring performance.
- [ ] Run `npx tsx scripts/benchmarks/d2f-rollout-budget-calibration.ts --input scripts/benchmarks/fixtures/d2f-rollout-budget-calibration-input.json` in an approved environment.
- [ ] Repeat with the same input to prove output digest, candidate summaries and ranking are identical; record only timing differences as environment evidence.
- [ ] Verify no budget vector exceeds `RolloutBudgetLimits`, no command uses wall clock as semantic input, and no test/fixture is reduced or skipped.
- [ ] Run `npx tsc --noEmit`, `npm run build`, and `git diff --check` without changing package/config files.
- [ ] Audit privacy, immutability, determinism and failure atomicity of the report; no raw scenario/weight/seed appears.
- [ ] Commit only the two benchmark files with `bench(ai): calibrate explicit D2F rollout budgets`.
- [ ] Stop and report the measured vectors; wait for explicit approval before any shadow profile is documented or used.

**Task Gate:** benchmark correctness and performance are separate, values are measured rather than guessed, and no production/shadow default is established implicitly.

---

### Task 8: Complete the Node 22.22.2 formal verification gate

**Files:**

- Create: none
- Modify: none
- Test: all planned `tests/ai/rollout/*.test.ts`; the frozen 10-file `tests/ai/particles/*.test.ts` manifest; the fixed D2a/D2b, D2c and D2d regression manifests listed in `2026-08-02-d2f-test-gate-matrix.md`

**Allowed paths:** no file changes. This Task is verification-only.

**Forbidden paths:** all files, including package/config changes, Node installation/switching, global timeout edits, fixture reduction, test deletion and active-mode work.

**Consumes:** reviewed Task 1–7 commits, approved calibration report, frozen manifests and CI Node 22.22.2 environment.

**Produces:** final D2F Gate report with command, environment, files/tests, passed/failed/skipped, exit code, duration, worker/unhandled state, shard coverage when applicable, privacy/determinism/immutability/atomicity evidence, and explicit active/formal boundary result.

**First failing test:**

```text
npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot
```

Expected failure if Task 1–7 is incomplete: missing rollout modules, missing approved budget evidence, or a failed contract Gate. No failure is fixed by changing timeout or reducing scope.

**Verification steps:**

- [ ] Reconfirm worktree, branch, starting HEAD, clean status and `git diff --check` before running.
- [ ] Run D2F correctness with default Vitest parallelism and explicit `--exclude "**/.worktrees/**"`.
- [ ] Run the frozen Particle focused regression exactly as `npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot`.
- [ ] Run the fixed D2a/D2b, D2c and D2d manifests; exclude nested worktrees and restricted benchmark/simulation/performance suites.
- [ ] Run the permitted full regression with default parallelism, TypeScript, and `npm run build`.
- [ ] Run the independent calibration command separately and attach its approved report; correctness and benchmark outputs remain separate.
- [ ] Execute the formal CI verification under Node 22.22.2. Do not install or switch Node locally. If Node 24.15.0 is also available, label its result supplemental only.
- [ ] If a command exceeds the Codex single-command limit, use the fixed manifest shard rules: each file exactly once, no overlap, no omission, explicit worktree exclusion, each shard natural exit 0, aggregate tests equal the manifest baseline.
- [ ] Audit privacy, determinism, immutability, failure atomicity, no HandPlanner call, no formal decision import, and no D2F result feedback into action selection.
- [ ] Run final `git status --short`, `git diff --check`, and changed-path allowlist audit. No commit is created by this verification-only Task.
- [ ] Stop and submit the final report for human review. Do not begin D2G or active-mode work.

**Task Gate:** Node 22.22.2 formal verification is complete, all permitted regressions pass without duplicates/omissions, and D2F remains detached/offline/shadow.

## Commit boundaries and reports

Each Task 1–7 has exactly one scoped commit and one report. The report must include starting/ending HEAD, branch/worktree, exact changed paths, first RED command/failure/reason, final commands/results/counts/durations, privacy/determinism/immutability/failure-atomicity/performance impact, formal decision path answer `否`, residual risks, next-task prerequisites, commit hash and one of `PASS`, `PASS WITH WARNINGS`, `BLOCKED`.

Task 8 is verification-only and creates no commit. Any mandatory Gate failure is `BLOCKED`; “基本完成” is not an acceptable status.

The current Prompt 1 document-freeze commit is separate from all future Task commits and uses:

```text
docs(ai): freeze D2F rollout design and gates
```

## Plan self-review checklist

- [ ] Every task contains concrete paths, interfaces, RED evidence, implementation boundary, verification commands and stop conditions.
- [ ] All type and function names match the frozen contract section and the design spec.
- [ ] No production/shadow budget value is asserted before Task 7 calibration and approval.
- [ ] No active-mode implementation, formal action feedback, HandPlanner call or ParticleBank public API expansion is authorized.
- [ ] All Task 1–8 paths, RED tests, expected failures, focused tests, regression, TypeScript/build, privacy, determinism, immutability, failure atomicity, commit and stop gates are listed.
- [ ] Standard particle command explicitly excludes `**/.worktrees/**` and uses default parallelism.
- [ ] Node 22.22.2 formal evidence and Node 24.15.0 supplemental evidence are clearly separated.
