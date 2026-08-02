# D2F_TEST_GATE_MATRIX

> Frozen with the D2F Prompt 1 design and implementation plan. This document defines verification; it does not authorize implementation or active integration.

**Goal:** 用固定 manifest、默认 Vitest 并行度、Node 22.22.2 正式环境和独立 benchmark 证明 D2F 的 contracts、CRN、Team Utility、aggregation、privacy、detached boundary、失败原子性和性能 Gate。

**Architecture:** correctness tests 位于 `tests/ai/rollout/**`，ParticleBank focused regression 使用已接受的 10-file manifest。所有可能包含 linked worktree 的命令显式排除 `**/.worktrees/**`。benchmark 单独运行，不共享 correctness test 的通过结论，也不把 wall-clock 作为 rollout 语义。

**Tech Stack:** TypeScript 5.7、Vitest 2.1.9、Node 22.22.2 formal CI baseline、Node 24.15.0 local supplemental evidence。

## 1. Accepted D2E-P Particle focused baseline

人工已接受的 baseline：

```text
10 files
136 tests
136 passed
0 failed
0 skipped
Vitest 2.1.9
Node 24.15.0 local supplemental run
Vitest duration 41.99s
wall-clock 52.642s
exit code 0
```

固定 Particle manifest 及测试数：

| Path | Tests |
|---|---:|
| `tests/ai/particles/actionSupportLikelihood.test.ts` | 16 |
| `tests/ai/particles/constrainedParticleSampler.test.ts` | 16 |
| `tests/ai/particles/effectiveSampleSize.test.ts` | 4 |
| `tests/ai/particles/logWeightNormalization.test.ts` | 10 |
| `tests/ai/particles/particleBankBuilder.test.ts` | 33 |
| `tests/ai/particles/particleConservation.test.ts` | 3 |
| `tests/ai/particles/particleContracts.test.ts` | 25 |
| `tests/ai/particles/particleDetachedCharacterization.test.ts` | 1 |
| `tests/ai/particles/particlePrivacyAst.test.ts` | 8 |
| `tests/ai/particles/publicEventDealReplay.test.ts` | 20 |
| **Total** | **136** |

Manifest 必须由 `git ls-files 'tests/ai/particles/*.test.ts'` 得到并按路径固定；不得递归扫描 `.worktrees/**` 得到额外副本。

## 2. Frozen commands and timeout semantics

### 2.1 Standard Particle focused regression

唯一标准命令：

```text
npx vitest run tests/ai/particles --exclude "**/.worktrees/**" --reporter=dot
```

规则：

- 使用 Vitest 默认并行度，不添加 `--maxWorkers` 或 `--minWorkers`。
- `--maxWorkers 1 --minWorkers 1` 仅用于逐文件 runtime diagnosis。
- 不使用 `--testTimeout=120000` 作为整套进程时限方案。
- 任何报告必须记录 files、tests、passed、failed、skipped、duration、exit code、worker crash 和 unhandled rejection。

### 2.2 D2F correctness focused regression

```text
npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot
```

该命令只运行 D2F correctness tests，不包含 benchmark、simulation 或 performance suite。

### 2.3 Test timeout 与外层进程时限

- Vitest test timeout 只控制单个 `test`/`it`，不能代表整套命令时限。
- Codex/外层命令执行器的总时限是独立边界；`exit code 124` 且没有 Vitest 汇总时，必须记录为外层强制终止证据，不直接分类为测试 hang。
- 正常语义停止只能由显式 `RolloutBudget` 计数控制；wall clock 不能参与 kernel result、排序或正常停止。
- 长回归若超过外层命令上限，使用本文件的固定 manifest shards；不得提高全局 timeout、删测试、删断言、降低 fixture 或跳过 suite。

### 2.4 Fixed shard command

Shard 必须显式列出 tracked test paths，使用默认并行度和相同 worktree exclusion：

```text
npx vitest run <fixed-shard-file-1> <fixed-shard-file-2> --exclude "**/.worktrees/**" --reporter=dot
```

每个 shard 独立命令、自然结束、exit code 0，并记录完整 Vitest summary。Shard 不能按单个 `test` 拆分、不能重复文件、不能排除断言。若发生 shard，报告必须给出 manifest、shard membership、每个文件恰好一个 owner、每 shard 测试数和全局累计数。

## 3. Fixed regression manifests

### 3.1 D2a/D2b public regression manifest

以下 12 个文件是既有 D2a/D2b public ledger/evidence regression：

```text
tests/ai/lightweightPublicEvidence.test.ts
tests/ai/publicEvent.test.ts
tests/ai/publicEventHash.test.ts
tests/ai/publicLedger.test.ts
tests/ai/publicLedgerDependency.test.ts
tests/ai/publicLedgerPrivacy.test.ts
tests/ai/publicLedgerReplay.test.ts
tests/ai/publicLedgerTributeReset.test.ts
tests/ai/publicLedgerTrickFinish.test.ts
tests/game/publicEventIdentity.test.ts
tests/game/publicEventReplayIdentity.test.ts
tests/game/publicEventRoomAdapter.test.ts
```

命令模板：

```text
npx vitest run tests/ai/lightweightPublicEvidence.test.ts tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerDependency.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

### 3.2 D2c/D2d boundary regression manifest

```text
tests/ai/beliefGuidedPlanPolicy.test.ts
tests/ai/representativeActionReducer.test.ts
tests/ai/representativeActionReducerDetached.test.ts
tests/ai/representativeActionShadowAst.test.ts
tests/ai/representativeActionShadowByteLock.test.ts
tests/ai/representativeActionShadowIntegration.test.ts
tests/ai/representativeActionShadowRoom.test.ts
```

命令模板：

```text
npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts tests/ai/representativeActionReducer.test.ts tests/ai/representativeActionReducerDetached.test.ts tests/ai/representativeActionShadowAst.test.ts tests/ai/representativeActionShadowByteLock.test.ts tests/ai/representativeActionShadowIntegration.test.ts tests/ai/representativeActionShadowRoom.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

如果执行前仓库事实显示该 manifest 发生路径变化，停止并先形成 manifest 差异报告；不得静默改成递归扫描或猜测替代文件。

### 3.3 Full permitted regression

```text
npx vitest run --exclude "**/.worktrees/**" --exclude "tests/benchmark/**" --exclude "tests/simulation/**" --exclude "tests/performance/**" --reporter=dot
```

该命令使用 Vitest 默认并行度。`npm test` 当前脚本包含 `--maxWorkers 1 --minWorkers 1`，因此不是 D2F focused 或 full permitted regression 的标准命令；不得通过修改 package script 解决时限问题。

## 4. Correctness gate matrix

| Gate | Planned test path | Required evidence |
|---|---|---|
| Contract envelope | `tests/ai/rollout/rolloutContractValidation.test.ts` | schema、literal false、required fields、finite/safe integer validation |
| Identity canonicalization | `tests/ai/rollout/rolloutIdentity.test.ts` | root/scenario/candidate/replicate/domain identity stable and seed-free |
| CRN invariance | `tests/ai/rollout/crnStream.test.ts`, `rolloutKernel.test.ts` | same scenario/replicate tape reused by every candidate |
| Candidate order invariance | `tests/ai/rollout/rolloutIdentity.test.ts`, `rolloutOrdering.test.ts` | candidate permutation yields identical per-candidate bytes and canonical ranking |
| Same-seed replay | `rolloutIdentity.test.ts`, `rolloutKernel.test.ts` | same snapshot/seed-derived particle source and budget replay identically |
| Worker/scenario completion order | `crnStream.test.ts`, `rolloutKernel.test.ts` | completion order permutation does not alter any summary |
| State conservation | `rolloutKernel.test.ts` | card conservation, legal state transition, no duplicated/missing card |
| Seat-local privacy | `rolloutPolicyPrivacy.test.ts` | policy receives own hand and public counts only; no complete hidden scenario |
| Private bridge import boundary | `particleBankRolloutBoundary.test.ts` | exactly one `readParticleBankInternals` reader and one bridge consumer |
| Public API non-leak | `particleBankRolloutBoundary.test.ts`, `rolloutContractValidation.test.ts` | no public barrel, raw scenario, assignments, full hands, raw weights or seed |
| No complete HandPlanner | `rolloutPolicyPrivacy.test.ts`, `rolloutKernel.test.ts` | AST/symbol graph rejects planning imports and forbidden call names |
| Team Utility truth table | `teamUtility.test.ts` | six rank pairs, strict `[-3,+3]`, invalid orders fail |
| Team symmetry | `teamUtility.test.ts`, `leafEvaluation.test.ts` | team swap negates, seat rotation and partner swap preserve semantic result |
| Non-terminal leaf evaluation | `leafEvaluation.test.ts` | real finish order preserved, hand counts then relative turn distance |
| Weighted aggregation | `rolloutAggregation.test.ts` | expectation, variance, downside probability, finite range |
| Stable total ordering | `rolloutOrdering.test.ts` | expected utility, variance, risk, UTF-16 candidate identity tie-break |
| Failure atomicity | `rolloutFailureAtomicity.test.ts` | any key failure returns no summaries, ranking or partial hidden data |
| Input immutability | `rolloutInputImmutability.test.ts` | request, bank, candidates, public state and caller-owned records unchanged |
| Shadow non-interference | `rolloutDetachedShadow.test.ts` | action/runtime/candidates/score/room/public event/ledger/replay bytes unchanged |
| No formal path import | `rolloutDetachedShadow.test.ts` | room/game AI/decision engine have no D2F import or call edge |
| Diagnostics redaction | `rolloutFailureAtomicity.test.ts`, `rolloutDetachedShadow.test.ts` | no seed, raw tape, scenario, assignments or weight detail |
| Budget overflow and limits | `rolloutKernel.test.ts` | explicit safe integer validation and pre-loop work bound |
| No wall-clock semantics | `crnStream.test.ts`, `rolloutKernel.test.ts` | no Date/performance/time-based result or stop condition |
| Formal flag | `rolloutContractValidation.test.ts`, `rolloutDetachedShadow.test.ts` | request/result `formalExecutionAllowed` always false |

Every row must have a named test and a natural Vitest result. A skipped test, intentionally unexecuted test, widened tolerance, reduced fixture or omitted assertion is a Gate failure.

## 5. D2F Task focused matrix

| Task | Focused command | Required pass condition |
|---|---|---|
| 1 | `npx vitest run tests/ai/rollout/particleBankRolloutBoundary.test.ts tests/ai/rollout/rolloutContractValidation.test.ts --exclude "**/.worktrees/**" --reporter=verbose` | bridge/source graph and contract envelope pass |
| 2 | `npx vitest run tests/ai/rollout/teamUtility.test.ts tests/ai/rollout/leafEvaluation.test.ts --exclude "**/.worktrees/**" --reporter=verbose` | table, invalid inputs and rotational leaf semantics pass |
| 3 | `npx vitest run tests/ai/rollout/rolloutIdentity.test.ts tests/ai/rollout/crnStream.test.ts --exclude "**/.worktrees/**" --reporter=verbose` | identity and CRN order invariance pass |
| 4 | `npx vitest run tests/ai/rollout/rolloutPolicyPrivacy.test.ts tests/ai/rollout/rolloutKernel.test.ts --exclude "**/.worktrees/**" --reporter=verbose` | seat-local policy, bounded kernel and conservation pass |
| 5 | `npx vitest run tests/ai/rollout/rolloutAggregation.test.ts tests/ai/rollout/rolloutOrdering.test.ts --exclude "**/.worktrees/**" --reporter=verbose` | weighted summaries and total ordering pass |
| 6 | `npx vitest run tests/ai/rollout/rolloutFailureAtomicity.test.ts tests/ai/rollout/rolloutDetachedShadow.test.ts tests/ai/rollout/rolloutInputImmutability.test.ts --exclude "**/.worktrees/**" --reporter=verbose` | failure atomicity, no-interference and immutability pass |
| 7 | `npx tsx scripts/benchmarks/d2f-rollout-budget-calibration.ts --input scripts/benchmarks/fixtures/d2f-rollout-budget-calibration-input.json` | only after approved calibration Gate; output repeatable and separate from correctness |
| 8 | `npx vitest run tests/ai/rollout --exclude "**/.worktrees/**" --reporter=dot` | complete D2F correctness manifest passes under formal environment |

Task 7 is not a Vitest correctness test. Its wall-clock measurements are performance evidence only and cannot change simulation results, stop conditions or ranking.

## 6. Node, TypeScript and build gates

### 6.1 Formal Node gate

Required formal environment:

```text
Node 22.22.2
CI workflow: .github/workflows/d2a1-verification.yml
Supplemental CI family: .github/workflows/ci.yml Node 22
```

Task 8 must report the actual Node version, npm version, Vitest version, OS/architecture, command exit codes and natural completion. Node 24.15.0 local results are reported separately as supplemental; they do not establish project-level Node 24 support.

### 6.2 TypeScript/build

```text
npx tsc --noEmit
npm run build
```

Both commands must complete naturally with exit code 0 in Task 8. No `tsconfig.json`, Vite config, package script, dependency or timeout change is allowed.

### 6.3 Existing D2 regression

Task 8 must run both fixed D2a/D2b and D2c/D2d manifests from Section 3, with the explicit worktree exclusion. Any path drift, duplicate, omission or changed test count is a blocked Gate until manually reviewed.

## 7. Shard audit protocol

Shards are allowed only when a complete command would exceed the outer command limit while independent files and default parallel mode remain healthy. The protocol is:

1. Generate a fixed sorted manifest from `git ls-files` and record it before execution.
2. Assign each file to exactly one shard based on observed file-level runtime; keep shard estimates below the safe command budget.
3. Run each shard once with `--exclude "**/.worktrees/**"` and default Vitest parallelism.
4. Record every shard’s exact path list, files, tests, passed/failed/skipped, duration, exit code, worker status and unhandled rejection status.
5. Prove `union(shards) = manifest`, `intersection(shards) = empty`, and each manifest path count is one.
6. Prove the sum of shard test counts equals the accepted manifest count; do not infer counts from filenames.
7. If any shard fails, repeats, omits, crashes or is externally terminated, the Gate is blocked; do not weaken tests or increase global timeout.

For the accepted baseline, no shard is required because the single default-parallel Particle command completed in 52.642 seconds with 10/136 passed.

## 8. Release conclusion rules

### TEST GATE PASS

Use only when the relevant manifest has complete natural Vitest summaries, exit code 0, all tests passed, no worker crash/unhandled rejection, and no duplicate/omitted files.

### TEST GATE PASS WITH WARNINGS

Use only for non-blocking supplemental environment or performance observations that do not affect the formal Node 22.22.2 Gate, correctness count, privacy, determinism, immutability or failure atomicity.

### TEST GATE BLOCKED

Use for any failed/timeout test, missing/duplicate file, wrong count, worker crash, unhandled rejection, unresolved import/privacy boundary, failed formal Node gate, unapproved calibration, or any production/formal decision path modification.

No D2F Gate may be described as “基本完成”.

## 9. Final report fields

Every Task report and the final D2F report must include:

- worktree, branch, starting/ending HEAD and clean state;
- exact manifest and shard coverage if used;
- command, start/end/wall-clock, Vitest duration, files/tests/pass/fail/skip and exit code;
- worker crash, unhandled rejection and external termination state;
- Node 22.22.2 formal evidence and Node 24.15.0 supplemental evidence separately;
- privacy, determinism, immutability, failure atomicity and performance effects;
- production modification: `否` or the reviewed allowlist change;
- formal decision path modification: `否`;
- commit hash and residual risks;
- exactly one conclusion: `PASS`, `PASS WITH WARNINGS` or `BLOCKED`.
