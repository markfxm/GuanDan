# D2a.1 Task 1-R1 final review

## 结论

**D2A1_TASK1_APPROVED**

本轮仅修复测试 worker 的 Ubuntu/Linux module-resolution 边界；Task 2、API/UI 接入、D2b 与任何 smoke/calibration/formal 均未开始。`formalExecutionAllowed=false`。

## 基线与修复提交

- 原 Task 1：`771bca273465359e56a476a6418a117c29498940`
- 原阻塞基线：`bc9f18a8d369b9c4937129cc26cb84da4eda3c02`
- worker module-resolution 修复系列：`b531cca`、`dda86ec`、`c5c791b`、`3cdc8ff`
- 最终 exact remediation commit：`3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34`
- review commit：本文件单独提交

## 根因取证

历史失败 run `29553403396` / job `87800523548`（保留为失败事实）在 Ubuntu Node 22 中由 `tests/server/publicIdentityConcurrencyWorker.ts` 的 `worker_threads.Worker` 启动 `.ts` worker；`execArgv=["--import","tsx/esm"]` 无法解析 extensionless production import。首个有效错误为：

```text
Cannot find module '/home/runner/work/GuanDan/GuanDan/src/server/publicIdentityDescriptor'
imported from .../tests/server/publicIdentityConcurrencyWorker.ts
```

R1 诊断 run `29556987821` / job `87811115792` 与 `29557627883` / job `87813132011` 进一步证明：显式 `.mjs` worker 仍会在 worker loader 内部失败于 `src/game/publicEventHash` 的 extensionless import。生产模块对照加载及 better-sqlite3 加载均成功，因此分类为：

`TEST_WORKER_MODULE_RESOLUTION_BUG`

## 修复边界

只修改：

- `tests/server/publicIdentityConcurrency.test.ts`
- `tests/server/publicIdentityConcurrencyWorker.mjs`

worker 改为明确的 `.mjs` 子进程入口，由项目现有 `tsx` CLI 启动；入口直接 import 真实 `.ts` provider/store/descriptor。每个场景复用两个长驻子进程，通过 stdin 的 prepare/go 协议同步，两个进程各自打开真实 better-sqlite3 连接；没有 mock、代理、单连接循环或 OS skip。长驻复用仅消除 800 次 loader 启动开销，不改变 4×100 的独立连接和并发语义。

生产模块（descriptor/provider/store）和 native addon 在 Ubuntu 对照加载成功；`src/server/api.ts`、`src/game/room.ts`、UI、D2a event/ledger/replay、D0/D1 artifacts/approval 均无修改。

## 本地 exact commit 验证

Windows x64：

- focused（descriptor + provider + concurrency，`D2A1_STRESS_ROUNDS=100`）：3 files / 21 tests passed，约 74.56s，自然退出；四个并发场景均报告 100 rounds。
- `npm test`：59 files / 488 tests passed，exit 0，自然退出，约 255s。
- `npx tsc --noEmit`：exit 0。
- `npm run build`：exit 0；Vite/browser bundle native sqlite scan = 0。
- D0 fixture `--check-only`：exit 0。
- `git diff --check`：exit 0。

getter/accessor regression 同 focused descriptor 文件一并通过；固定 descriptor/gameId、SQLite retry/conflict、bigint/safe-integer行为未变。

## Ubuntu/Linux x64 Node 22.22.2 真实 CI

最终 exact remediation commit 上的 run：

- run `29559600484`
- job `87819034977`（`ubuntu-node22`）
- tested commit `3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34`
- runner `ubuntu-24.04` / x86_64
- Node `v22.22.2`，npm `10.9.7`
- `npm ci`：exit 0；better-sqlite3 可加载。install log 未足以区分 prebuilt 与 node-gyp，`ubuntuPrebuiltStatus=UNVERIFIED`。
- production module load：`production-modules-loaded`
- native load：`better-sqlite3-loaded function`
- focused：3 files / 21 tests，四个原失败并发场景各 100 rounds，全部通过；exit 0。
- `npx tsc --noEmit`：exit 0。
- `npm run build`：exit 0。
- browser native dependency scan：0。
- D0 fixture check-only：exit 0（临时按 immutable D0 commit 重建本地 tag，仅用于 CI source worktree）。
- diff/boundary check：exit 0。
- job 自然完成，无 worker 残留错误。
- evidence artifact：ID `8398741779`；SHA-256 `e0bc1f8f776b871b8cee61aa2bd248cd159966de86d99a9c3480f775fb30957b`。

历史失败 run `29553403396` / job `87800523548`、R1 诊断失败 run `29556987821` / `29557627883` 均保留为失败记录，未改写为通过。

## 生产与范围结论

- 生产 API/UI/room 未接入 provider；Task 2 尚未开始。
- 真实 provider/store 仍由测试子进程直接加载，SQLite concurrency/idempotency 约束未放宽。
- D2a public event/ledger/replay contract、legacy D1 trace/hash/schema、D0 artifacts/tag 未改变。
- 临时 CI worktree、branch、workflow 已删除；实现工作树仅保留本 review 文档待提交。
- `formalExecutionAllowed=false`。

## 最终判定

所有批准条件均满足：getter remediation、Windows focused/full gates、Ubuntu exact commit 的 npm ci/focused/tsc/build/fixture/diff、真实独立连接并发与依赖边界均通过。因此批准进入 Task 2 规划/实施门禁，但本轮不开始 Task 2 或 D2b。
