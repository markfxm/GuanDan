# D2c Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. This document is plan-only; it does not authorize execution in the current turn.

**Goal:** 在获得另行授权后，以严格 fast-forward-only 方式把已验证的 D2c source tip 纳入 main，并验证只引入 D2c planning 文档、独立 pure policy module、集中测试和 detached characterization。

**Architecture:** D2c 保持为不接入 production decision path 的 pure policy module。未来 integration 只把已验证 source history 连同本计划提交纳入 main；production adapter、room/engine/runtime 接入、active mode、candidate filtering/reordering 和 action control 仍不在范围内。

**Tech Stack:** Git worktrees/fast-forward-only integration, TypeScript, Vitest, npm, existing GuanDan AI planning contracts.

## Global Constraints

- Main base is exactly `43be5089f87c5710ae90932b1ea2d25e01b95565`.
- Verified D2c source tip is exactly `4a136e4890ff70262a426530f4252e5030bdc23c`.
- D2c source tree is exactly `fd6946e97920b7b53ad5df3b4cc8a17c06af57f6`.
- Planning branch is `codex/d2c-main-integration-plan`; its base is the verified D2c source tip, not main.
- The only permitted future main integration strategy is `fast-forward only`.
- `formalExecutionAllowed=false` remains unchanged.
- `PlanPruningMode` remains exactly `"disabled" | "shadow"`; the `active` family label is not an active mode.
- No production adapter, room integration, engine integration, runtime sidecar, candidate filtering/reordering, action prior, or action control is introduced.
- No merge commit, `--no-ff`, cherry-pick, squash, rebase, patch copy, manual file copy, or history rewrite is permitted.
- No benchmark, simulation, performance, smoke, calibration, formal game, or other restricted workload is permitted.
- No push, pull, fetch, PR, remote workflow, or artifact publication is permitted.
- This plan must never modify `src/**`, `tests/**`, `scripts/**`, package files, fixtures, artifacts, benchmark approvals, or the existing D2c plan.

---

## 1. Authorization and stop conditions

The approved status entering this plan is:

```text
D2C_TASK2_FINAL_APPROVED
D2C_TASK3_FINAL_APPROVED
D2C_TASK4_FINAL_APPROVED
D2C_LOCAL_NONRESTRICTED_VERIFICATION_APPROVED

D2C_MAIN_INTEGRATION_PLANNING_AUTHORIZED
D2C_MAIN_INTEGRATION_NOT_AUTHORIZED

D2C_PRODUCTION_SHADOW_ADAPTER_NOT_AUTHORIZED
D2C_ACTIVE_MODE_NOT_AUTHORIZED
D2C_ACTION_CONTROL_NOT_AUTHORIZED
D2C_CANDIDATE_FILTERING_NOT_AUTHORIZED
D2C_CANDIDATE_REORDERING_NOT_AUTHORIZED
D2D_TO_D2G_NOT_AUTHORIZED

RESTRICTED_WORKLOAD_NOT_AUTHORIZED
REMOTE_OPERATIONS_NOT_AUTHORIZED
FORMAL_EXECUTION_NOT_AUTHORIZED
formalExecutionAllowed=false
```

This turn creates and commits only this plan document. It must not move `main`, execute fast-forward, merge, rebase, reset, cherry-pick, run tests, run build, run `npm ci`, modify production, modify tests, modify fixtures/artifacts, or perform any remote operation.

If any mandatory identity or scope check fails, stop and report the corresponding failure instead of producing an approval-ready plan:

- main changed: `MAIN_MOVED_INTEGRATION_REPLAN_REQUIRED`;
- source ref/worktree changed: stop and report the source identity mismatch;
- source is not a strict descendant of main: `D2C_MAIN_DIVERGENCE_REQUIRES_CONFLICT_PLAN`;
- changed-file inventory is not exactly the three approved paths: stop and do not describe the plan as approval-ready.

## 2. Fixed identities and current evidence

| Item | Required value | Verified result |
|---|---|---|
| Main branch | `main` | `main` |
| Main HEAD | `43be5089f87c5710ae90932b1ea2d25e01b95565` | exact match |
| Main worktree | clean | clean |
| Main `git diff --check` | exit 0 | exit 0 |
| D2c source branch | `codex/d2c-task4` | exact match |
| D2c source worktree | `E:/workspace/掼蛋游戏开发/.worktrees/d2c-task4` | exact path |
| D2c source ref/HEAD | `4a136e4890ff70262a426530f4252e5030bdc23c` | exact match |
| D2c source worktree | clean | clean |
| Main/source merge base | main HEAD | `43be5089f87c5710ae90932b1ea2d25e01b95565` |
| Main is ancestor of source | exit 0 | exit 0 |
| D2c source tree | `fd6946e97920b7b53ad5df3b4cc8a17c06af57f6` | exact match |
| Package/lock diff | exit 0 | exit 0 |
| Frozen fixture/artifact diff | exit 0 | exit 0 |
| Existing production source outside D2c module | exit 0 | exit 0 |
| Production integration scan | 0 matches | 0 matches |

```text
D2C_SOURCE_TREE=fd6946e97920b7b53ad5df3b4cc8a17c06af57f6
```

Previously completed verification evidence, carried forward as historical evidence only, is:

```text
D2c focused: 1 file / 51 tests passed
Task 4 AI fixtures: 3 files / 6 tests passed
D2a/D2b: 12 files / 66 tests passed
Non-restricted regression: 71 files / 667 tests passed
TypeScript: exit 0
Build: exit 0, 1586 modules
Production integration scan: 0 matches
Package/lock drift: none
Frozen fixture/artifact drift: none
```

The historical verification above is not a substitute for future verification on the approved integration tip.

## 3. Planning branch and worktree

The planning branch/worktree is intentionally based on the verified D2c source tip:

```text
Planning branch:
codex/d2c-main-integration-plan

Planning worktree:
E:/workspace/掼蛋游戏开发/.worktrees/d2c-main-integration-plan

Planning base:
4a136e4890ff70262a426530f4252e5030bdc23c
```

The planning worktree was created only after confirming that the branch and path did not exist. Its initial identity is:

```text
branch = codex/d2c-main-integration-plan
HEAD = 4a136e4890ff70262a426530f4252e5030bdc23c
worktree = clean
git diff --check = exit 0
```

The planning commit is not an integration. It records the integration plan in the verified source history; main integration requires separate authorization.

## 4. D2c commit inventory

Every commit from main to the verified D2c source tip is preserved. No commit may be squashed, rewritten, deleted, cherry-picked, or reordered.

### D2c planning

1. `0b5f5b3ab983163eafa0008d7f9a73033f17a6c3 docs: plan D2c priority quota shadow`
2. `681607c274f2336539cffe410cefc40f4ce3778e docs: resolve D2c plan review findings`

### Task 1 behavioral RED

3. `16748e40a0ad8379e09e3c331be09cb4414c3991 docs: make D2c RED gate behavioral`
4. `e6cf6e09609fa3086ecfb408464d932c169fdc16 test: characterize D2c plan priority and quota`

### Task 2 contract reconciliation

5. `89fa090104daee952c228c51a1784ea91f69c78cbf docs: align D2c Task 2 test boundaries`
6. `fa090104daee952c228c51a1784ea91f69c78cbf test: reconcile D2c Task 2 contracts`

### Task 2 implementation

7. `80c04b495719081caae625f0d8f713590471b4e9 feat: derive deterministic D2c shadow priorities`

### Task 2 review fixes

8. `e0cafecfefd540991efc622f44d3870d91d02b64 test: expose D2c Task 2 review gaps`
9. `639ede3be886167c058015c3b2f0e57edf782054 test: correct D2c strongest-family assertion`
10. `10a0e96b3cdeac9a572194adb9229a58e42f4221 test: align D2c Card fixture types`
11. `44c06cbeca0f53c26744431a175d7ea53dd34550 fix: align D2c policy with frozen contracts`

### Task 3 hardening

12. `d5764676039405c04be8a843c2bad48a2bba09d0 test: harden D2c privacy and malformed inputs`
13. `1121ba6e49d936f0ffff290d8fcba932130a8258 fix: harden D2c privacy and malformed inputs`

### Task 3 review fixes

14. `ca1455d1e891113a5e0e9887d8f9d77c102ad636 test: correct Task 3 prototype assertion typing`
15. `fbffb9e0c704a7bb5d2b137406fe7e6b27482cc3 test: expose remaining D2c hardening gaps`
16. `16ea3f5e76029a5b93c5526787c73db6c4e3414b fix: complete D2c malformed-input hardening`

### Task 4 detached shadow characterization

17. `4a136e4890ff70262a426530f4252e5030bdc23c test: characterize D2c shadow integration boundary`

## 5. D2c changed-file inventory

The exact source-to-main name-status inventory is:

```text
A       docs/superpowers/plans/2026-07-23-d2c-plan-priority-quota-shadow.md
A       src/ai/planning/beliefGuidedPlanPolicy.ts
A       tests/ai/beliefGuidedPlanPolicy.test.ts
```

No other path is part of D2c. The existing D2c plan is recorded as inventory only and must not be edited by this plan. The only file created by this turn is:

```text
docs/superpowers/plans/2026-07-24-d2c-main-integration.md
```

## 6. Future integration scope and file boundary

The future approved integration tip will contain the verified D2c source history plus this plan commit. The D2c implementation allowlist remains exactly:

```text
src/ai/planning/beliefGuidedPlanPolicy.ts
tests/ai/beliefGuidedPlanPolicy.test.ts
```

The plan file is the only additional planning artifact. Future integration must not add or modify:

```text
src/game/room.ts
src/ai/contracts.ts
src/ai/runtimeContracts.ts
src/ai/aiDecisionEngine.ts
src/ai/planning/planManager.ts
src/ai/planning/handPlanner.ts
tests/ai/fixtures/d0KeepCurrentCases.json
docs/benchmark-approvals
artifacts
package.json
package-lock.json
scripts/**
```

The resulting main integration introduces only:

1. the D2c planning document;
2. the independent pure policy module;
3. the concentrated D2c tests and detached characterization.

It does not introduce a production shadow adapter, room integration, `aiDecisionEngine` integration, runtime sidecar, active mode, candidate filtering, candidate reordering, action prior, action control, or D2d–D2g.

`deriveD2cPlanPriorityQuota` must remain reachable only from tests after integration. Its presence in the production decision path is a stop condition.

## 7. Frozen-boundary audit for the future integration tip

Use `INTEGRATION_TIP` as the approved future tip, not as a ref to be invented during execution.

### Package and lock

```bash
git diff --exit-code \
  43be5089f87c5710ae90932b1ea2d25e01b95565..INTEGRATION_TIP \
  -- \
  package.json \
  package-lock.json
```

Expected: exit 0; package and lock blobs are unchanged.

### D0/D1/D2a/D2b frozen paths

```bash
git diff --exit-code \
  43be5089f87c5710ae90932b1ea2d25e01b95565..INTEGRATION_TIP \
  -- \
  tests/ai/fixtures/d0KeepCurrentCases.json \
  docs/benchmark-approvals \
  artifacts
```

Expected: exit 0; fixture, benchmark approvals, and artifact trees are unchanged.

### Existing production source outside the D2c module

```bash
git diff --exit-code \
  43be5089f87c5710ae90932b1ea2d25e01b95565..INTEGRATION_TIP \
  -- \
  src \
  ":(exclude)src/ai/planning/beliefGuidedPlanPolicy.ts"
```

Expected: exit 0; no existing production source changes outside the new D2c module.

### Exact changed-file inventory

```bash
git diff \
  --name-status \
  43be5089f87c5710ae90932b1ea2d25e01b95565..INTEGRATION_TIP
```

Expected: the three D2c paths in §5 plus this plan document, with no other path.

## 8. Future main integration strategy

The only allowed integration operation, after separate approval, is:

```bash
git -C "E:/workspace/掼蛋游戏开发" \
  merge --ff-only codex/d2c-main-integration-plan
```

This command must not be run in this turn. No `merge` without `--ff-only`, `--no-ff`, cherry-pick, squash, rebase, patch copy, manual file copy, or history rewrite is allowed.

Immediately before a future fast-forward, re-check:

```text
main branch = main
main HEAD = 43be5089f87c5710ae90932b1ea2d25e01b95565
main worktree clean

planning branch ref = exact approved integration tip
planning worktree clean

main is an ancestor of the approved integration tip
```

If main moves before approval or before the command is run, do not fast-forward. Stop and re-plan the integration/conflict boundary.

## 9. Future integration-verification branch/worktree

Formal integration verification must occur in a new read-only verification worktree, not by creating implementation commits on main:

```text
Branch:
codex/d2c-main-integration

Worktree:
E:/workspace/掼蛋游戏开发/.worktrees/d2c-main-integration

Base:
approved planning tip
```

The future branch must not create implementation commits. The only allowed working-tree changes are ignored `node_modules` and build cache. If dependencies are absent, a separately authorized verification may run:

```bash
npm ci --include=dev
```

After dependency installation, package and lock blobs must still match the approved integration tip and main base. Dependency installation is future-only and is not authorized by this plan commit.

## 10. Future complete verification Gate 1–8

All gates are future-only. They are listed to define the approval evidence, not to authorize execution now.

### Gate 1: dependencies

```bash
npm ci --include=dev
npm ls tsx better-sqlite3 @types/better-sqlite3 --depth=0
node node_modules/tsx/dist/cli.mjs --version
node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close();"
```

Expected: dependencies are available, the native SQLite smoke check exits 0, and package/lock files remain unchanged.

### Gate 2: D2c focused

```bash
npx vitest run \
  tests/ai/beliefGuidedPlanPolicy.test.ts \
  --exclude ".worktrees/**" \
  --testTimeout=120000 \
  --reporter=verbose
```

Expected: `1 file / 51 tests passed` with natural completion.

### Gate 3: Task 4 AI fixture lock

The exact three test files were confirmed from their source declarations. Each has two tests, so the expected result is 3 files / 6 tests:

```text
tests/ai/keepCurrentCharacterization.test.ts
tests/ai/keepCurrentRuntimeShape.test.ts
tests/ai/keepCurrentByteLock.test.ts
```

These are the fixture-backed AI tests. The first D0 fixture case locks:

```text
action = play single:C5-1
actionStableKey = play:C5-1
activePlanId = fast-greedy
candidate order = [fast-greedy]
```

Run exactly these three files, excluding linked worktrees:

```bash
npx vitest run \
  tests/ai/keepCurrentCharacterization.test.ts \
  tests/ai/keepCurrentRuntimeShape.test.ts \
  tests/ai/keepCurrentByteLock.test.ts \
  --exclude ".worktrees/**" \
  --testTimeout=120000 \
  --reporter=verbose
```

Expected: `3 files / 6 tests passed`; no fixture rewrite, no artifact rewrite, and no D2c production import.

### Gate 4: D2a/D2b

Use this previously approved exact 12-file command and add the required worktree exclusion:

```bash
npx vitest run \
  tests/ai/lightweightPublicEvidence.test.ts \
  tests/ai/publicEvent.test.ts \
  tests/ai/publicEventHash.test.ts \
  tests/ai/publicLedger.test.ts \
  tests/ai/publicLedgerDependency.test.ts \
  tests/ai/publicLedgerPrivacy.test.ts \
  tests/ai/publicLedgerReplay.test.ts \
  tests/ai/publicLedgerTributeReset.test.ts \
  tests/ai/publicLedgerTrickFinish.test.ts \
  tests/game/publicEventIdentity.test.ts \
  tests/game/publicEventReplayIdentity.test.ts \
  tests/game/publicEventRoomAdapter.test.ts \
  --exclude ".worktrees/**" \
  --testTimeout=120000 \
  --reporter=verbose
```

Expected: `12 files / 66 tests passed` with no public ledger/event/replay or frozen contract drift.

### Gate 5: TypeScript and build

```bash
npx tsc --noEmit --pretty false
npm run build
```

Expected: both exit 0; the build completes naturally and reports the approved 1586-module baseline unless the toolchain reports an equivalent non-semantic module count.

### Gate 6: non-restricted regression

Run only:

```bash
npm run test:d2a1-regression -- --exclude ".worktrees/**"
```

Expected:

```text
71 files / 667 tests passed
natural completion
no unhandled rejection
no worker crash
no forced termination
```

The package script must exclude these paths:

```text
tests/benchmark/**
tests/simulation/**
tests/performance/**
.worktrees/**
```

Do not run `npm test`. Benchmark, simulation, performance, smoke, calibration, or formal workloads are not part of this gate.

### Gate 7: frozen and scope checks

Confirm all of the following:

```text
package/lock diff = 0
frozen fixture/artifact diff = 0
D2c changed-file inventory exact
existing production source outside D2c module diff = 0
planning document is the only additional path
```

Any extra path, package drift, frozen-path drift, or production source drift stops approval.

### Gate 8: production integration scan

Run the exact production-path scan:

```bash
git grep -n \
  "deriveD2cPlanPriorityQuota\|D2cPlanPolicy\|beliefGuidedPlanPolicy" \
  -- \
  src/game/room.ts \
  src/ai/contracts.ts \
  src/ai/runtimeContracts.ts \
  src/ai/aiDecisionEngine.ts \
  src/ai/planning/planManager.ts \
  src/ai/planning/handPlanner.ts
```

Expected: 0 matches. Also confirm:

```text
PlanPruningMode = "disabled" | "shadow"
```

The forbidden API scan must remain at 0 matches for production adapter, active mode, candidate filtering, candidate reordering, action prior, and action control. `deriveD2cPlanPriorityQuota` must have test-only call sites after integration.

## 11. Future fast-forward post-checks

Only after all future verification gates pass and an independent review authorizes integration may the approved fast-forward be executed. After it succeeds, perform identity/tree checks only; do not generate another commit:

```bash
git -C "E:/workspace/掼蛋游戏开发" \
  rev-parse HEAD

git -C "E:/workspace/掼蛋游戏开发" \
  rev-parse "HEAD^{tree}"

git -C "E:/workspace/掼蛋游戏开发" \
  status --short --untracked-files=all

git -C "E:/workspace/掼蛋游戏开发" \
  diff --check
```

Required post-checks:

```text
main HEAD = approved integration tip
main tree = verified integration tree
main worktree clean
```

No extra merge commit may be created on main.

## 12. Production, restricted, and remote boundaries

Main integration complete does not mean production shadow adapter complete, active mode complete, or D2d started:

```text
D2c main integration complete
≠ production shadow adapter complete
≠ active mode complete
≠ D2d started
```

The future post-integration state remains:

```text
D2C_MAIN_INTEGRATED
D2C_PRODUCTION_SHADOW_ADAPTER_NOT_AUTHORIZED
D2C_ACTIVE_MODE_NOT_AUTHORIZED
D2C_ACTION_CONTROL_NOT_AUTHORIZED
D2D_TO_D2G_NOT_AUTHORIZED
formalExecutionAllowed=false
```

Explicitly excluded from this integration:

```text
production adapter
room integration
aiDecisionEngine integration
runtime sidecar
active mode
candidate filtering
candidate reordering
action prior
action control
D2d–D2g
```

Explicitly excluded workloads and operations:

```text
benchmark
simulation
performance
smoke
calibration
formal game
restricted workload
push
pull
fetch
PR creation
remote workflow
artifact publication
formal execution
```

## 13. Plan self-review

After writing this plan, review it against every requirement in the authorized request.

```text
Critical: none
Important: none
Minor: none
```

The review specifically confirms:

- main merge is not authorized; the only future command is `merge --ff-only`;
- `--no-ff`, cherry-pick, squash, rebase, patch copy, manual copy, and history rewrite are prohibited;
- the main-moved stop gate is present;
- the complete 17-commit inventory is present;
- the exact three-path D2c inventory is present;
- package/lock, frozen paths, and existing production source scope checks are present;
- detached shadow characterization is not described as production integration;
- adapter, active mode, filtering/reordering, and action control remain unauthorized;
- restricted workloads and remote operations remain excluded;
- Task 5 historical verification is not used as a substitute for future integration verification;
- Gate 3 names the three fixture test files from source and preserves the 3 files / 6 tests expectation;
- the plan does not authorize tests, build, `npm ci`, or any workload in the current turn.

## 14. Current-turn submission boundary

The only permitted current-turn path is:

```text
docs/superpowers/plans/2026-07-24-d2c-main-integration.md
```

Before commit, the planning worktree must satisfy:

```bash
git status --short --untracked-files=all
git diff --name-only
git diff --check
```

Only the plan file may be shown as changed. Commit only this file:

```bash
git add \
  docs/superpowers/plans/2026-07-24-d2c-main-integration.md

git commit -m "docs: plan D2c main integration"
```

Do not amend any existing D2c commit. After commit, verify only with Git:

```bash
git show --stat --oneline HEAD

git diff \
  4a136e4890ff70262a426530f4252e5030bdc23c..HEAD \
  --name-only

git status --short --untracked-files=all
git diff --check

git merge-base --is-ancestor \
  43be5089f87c5710ae90932b1ea2d25e01b95565 \
  HEAD
```

Expected:

```text
only the integration plan document is added by this turn
planning worktree clean
git diff --check exit 0
main base remains an ancestor of planning HEAD
main was not moved
```

## 15. Final status after this plan commit

The current turn finishes in this state:

```text
D2C_TASK2_FINAL_APPROVED
D2C_TASK3_FINAL_APPROVED
D2C_TASK4_FINAL_APPROVED
D2C_TASK5_FINAL_APPROVED

D2C_MAIN_INTEGRATION_PLAN_COMPLETE
D2C_MAIN_INTEGRATION_PLAN_AWAITING_REVIEW
D2C_MAIN_INTEGRATION_NOT_AUTHORIZED

D2C_PRODUCTION_SHADOW_ADAPTER_NOT_AUTHORIZED
D2C_ACTIVE_MODE_NOT_AUTHORIZED
D2C_ACTION_CONTROL_NOT_AUTHORIZED
D2D_TO_D2G_NOT_AUTHORIZED

RESTRICTED_WORKLOAD_NOT_AUTHORIZED
REMOTE_OPERATIONS_NOT_AUTHORIZED
FORMAL_EXECUTION_NOT_AUTHORIZED
formalExecutionAllowed=false
```

The current-turn execution report must explicitly state that main integration, main movement, merge, cherry-pick, rebase, tests, build, `npm ci`, production adapter, active mode, candidate filtering/reordering, D2d–D2g, restricted workload, remote operations, and formal execution were not performed.
