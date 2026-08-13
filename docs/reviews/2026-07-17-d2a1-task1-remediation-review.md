# D2a.1 Task 1 remediation completion review

## 结论

**D2A1_TASK1_NOT_APPROVED**

本次只审计 `771bca273465359e56a476a6418a117c29498940` 到
`0e73588` 的 remediation，不修改实现、不开始 Task 2、不接入生产 API/UI，
也没有运行 smoke、calibration 或 formal。`formalExecutionAllowed=false`。

最小阻塞项：

1. 没有可核验的 remediation commit 在批准的 Ubuntu/Linux x64 + Node 22.22.2 环境中运行 `npm ci`、focused tests、`tsc` 和 build 的真实 GitHub Actions run/job/artifact 证据；当前仓库 workflow 只声明 `node-version: 22`，且没有本次 remediation 的 run 记录。
2. descriptor 允许访问器形式的允许字段；读取 `rank`、`seed` 或贡还字段时可能执行 getter。严格输入契约要求拒绝 accessors，本轮未修复。

## 1. 提交链、范围和工作树

| 项目 | 结果 |
|---|---|
| Task 1 基线 | `771bca273465359e56a476a6418a117c29498940` |
| 前次 review | `0cc7cab0c5f36f6c4943515c90dd0a8c59a7310b` |
| remediation | `0e73588` (`d2a1-task1-remediate-concurrency-and-errors`) |
| review 状态 | 只新增本文档 |
| `git diff --check` | 退出码 0 |
| 工作树 | 生成本文档前干净；提交后再次检查 |

`771bca2..0e73588` 的文件变更为：

```text
A docs/reviews/2026-07-17-d2a1-task1-identity-provider-review.md
M src/server/publicIdentityDescriptor.ts
M src/server/publicIdentityStore.ts
A tests/server/publicIdentityConcurrency.test.ts
A tests/server/publicIdentityConcurrencyWorker.ts
M tests/server/publicIdentityDescriptor.test.ts
M tests/server/publicIdentityProvider.test.ts
```

Remediation 没有修改 `package.json` 或 `package-lock.json`。以下边界文件均无 diff：
`src/server/api.ts`、`src/game/room.ts`、`src/ui`、benchmark production contracts、
D2a event/ledger/replay contracts、D0/D1 artifacts、P7.1 approval 和 legacy D1
schema/hash/validator。

依赖版本仍为：`better-sqlite3@12.11.1`、`@types/better-sqlite3@7.6.13`。

## 2. 根因与 remediation

原始并发 RED 的第一个失败点是两个独立 SQLite 连接初始化时，旧实现先执行
`PRAGMA journal_mode = WAL`，在 busy 状态下直接得到 `SQLITE_BUSY`，发生在
schema/bootstrap 事务之前；原实现尚未先设置 busy timeout，也没有把初始化和
bootstrap 作为同一原子流程。

当前实现的顺序是：

1. `defaultSafeIntegers()`；
2. `busy_timeout=5000`、`foreign_keys=ON`、`synchronous=FULL`；
3. 读取 journal mode，仅非 WAL 时才设置 WAL；
4. `BEGIN IMMEDIATE` 包含 DDL、installation bootstrap 和 read-back；
5. 失败时 rollback，并在构造函数 catch 中关闭数据库后再抛出。

这解释了 remediation 为什么消除了初始化竞态；本轮没有改变业务 API 或 room 行为。

## 3. 重试、锁释放与 typed error

`src/server/publicIdentityStore.ts` 的 `withBusyRetry`：

- 总尝试次数最多 4 次（初始尝试 + 3 次重试）；
- 每次 SQLite 操作自身受 5000ms busy timeout；
- 重试间固定等待 100ms；
- 只重试 `SQLITE_BUSY`/`SQLITE_LOCKED`；
- 第 4 次仍忙时抛出 `IdentityStoreBusyError`，code=`IDENTITY_STORE_BUSY`；
- 非 busy 错误不重试；事务错误回滚，不留下半条 allocation。

因此单次操作理论等待上限约为 `4*5000 + 3*100 = 20300ms`，临时锁验证实测
约 22943ms（含调度/关闭开销）。这属于本轮保留的 API 延迟风险，未在 review 中修复。

`IdempotencyConflictError` 提供稳定 code=`IDEMPOTENCY_CONFLICT`，可由后续 API 映射
为 409；同 key 不同 descriptor 不会分配第二个 sequence。

独立连接锁持有验证结果：

```json
{"case":"lock-held","code":"IDENTITY_STORE_BUSY","name":"IdentityStoreBusyError","attempts":4,"elapsedMs":22943,"exhausted":true}
{"case":"after-release","status":"new","sequence":"1","noPartialAllocation":true}
```

锁释放后同 key 重试成功，sequence 从 1 开始，未观察到部分 allocation。

## 4. descriptor 审计

实现位置：`src/server/publicIdentityDescriptor.ts:21-51`；测试位置：
`tests/server/publicIdentityDescriptor.test.ts`。

| 检查项 | 结果 | 证据/说明 |
|---|---|---|
| 只含 rank/seed/normalized pending tribute | PASS | 规范化输出只保留批准字段 |
| 不接受 sessionIdentity/gameSequence/transport id/时间/worker/隐藏牌 | PASS | forbidden/unknown key 检查；provider 输入不暴露 sequence |
| 贡还输入复制、不原地排序、稳定 tuple 排序、保留重复 multiplicity | PASS | canonicalizer 与现有 hash tests |
| 逻辑等价 descriptor 产生相同 canonical bytes/hash | PASS | 稳定 JSON + SHA-256 |
| 不同有效 descriptor 不因字段遗漏碰撞 | PASS | rank/seed/tribute 均参与规范化 |
| hash 编码、大小写、长度固定 | PASS | UTF-8 canonical JSON，SHA-256 小写 hex |
| 拒绝 getter/accessor | **FAIL** | 当前 `isPlainRecord` 允许普通对象上的允许字段 getter；读取时可能执行 getter，未做 own property descriptor 的 data-only 检查 |

数组、null、Date/Map/类实例、symbol/未知字段、继承字段和嵌套未知字段已有反向测试。

## 5. provider/store 契约审计

| 检查项 | 结果 |
|---|---|
| installation UUID 先持久提交再 read-back | PASS |
| UUID 为小写 RFC-4122 canonical 格式 | PASS |
| allocation 前完成 bootstrap | PASS |
| sequence 从 1 开始 | PASS |
| 内部不以不安全 number 承载 sequence | PASS |
| better-sqlite3 `defaultSafeIntegers` | PASS |
| JSON/provenance 使用 canonical decimal string | PASS |
| 固定 gameId 向量 | PASS（现有 provider focused tests） |
| Idempotency-Key 校验 | PASS |
| same key/same descriptor 不增加 sequence | PASS |
| same key/different descriptor typed conflict | PASS |
| `game_sequence` UNIQUE | PASS |
| `game_id` UNIQUE | PASS |
| `idempotency_key` UNIQUE | PASS |
| 初始 lifecycle=`allocated` | PASS |
| `allocated → room-committed` | PASS |
| 重复 mark committed 幂等 | PASS |
| committed 不退回 allocated | PASS |
| DB 路径由调用方显式提供 | PASS |
| close 后不留下 worker/open handle | PASS（fresh tests/temporary checks） |

主要实现位于 `src/server/publicIdentityStore.ts:57-196,249-300`；provider 仅作
server-side contract adapter（`src/server/publicIdentityProvider.ts:4-25`）。

## 6. bigint、SQLite 边界和并发

### 2^53/2^63 临时验证

使用临时数据库验证了 `1`、`2^53-1`、`2^53`、`2^63-2`、`2^63-1` 的
safe-integer 读取、canonical decimal 和 reopen 稳定性；读取保持 bigint，未经过
不安全 number。达到最大值后再次 allocation 稳定失败，不 wrap、不重复、不转浮点。

### 4×100 独立连接 stress

四个场景各 100 轮，每轮由两个独立 worker/连接操作同一临时 DB；退出码 0，worker
自然结束，无 terminal `SQLITE_BUSY`、重复 sequence 或重复 gameId：

| 场景 | 轮数 | retry triggers | 每轮最大 retries | 结果 |
|---|---:|---:|---:|---|
| concurrent bootstrap / different keys | 100 | 34 | 1 | PASS |
| preinitialized / different keys | 100 | 0 | 0 | PASS |
| same key / same descriptor | 100 | 18 | 1 | PASS |
| same key / different descriptor | 100 | 17 | 1 | PASS |

总 retry triggers=69；四个测试均通过，worker 进程自然退出。测试实现为
`tests/server/publicIdentityConcurrency.test.ts` 与
`tests/server/publicIdentityConcurrencyWorker.ts`。

## 7. close/bootstrap 资源验证

临时验证结果：关闭后操作失败；构造 bootstrap 失败会抛错并释放临时资源；worker
自然退出。当前 `close()` 的第二次调用会稳定报错，而不是幂等成功；这不是本轮
修复范围，作为后续生命周期语义风险记录。未观察到未关闭 worker、timer 或 message
port 警告。

## 8. Fresh 本地门禁

| 命令 | 结果 |
|---|---|
| focused descriptor/provider/concurrency | 退出 0；3 files，18 tests；约 64.9s shell elapsed |
| `npm test` | 退出 0，自然结束；59 files，485 tests；约 247.4s shell elapsed |
| `npx tsc --noEmit` | 退出 0 |
| `npm run build` | 退出 0；Vite 1586 modules，browser bundle 构建成功 |
| D0 fixture `--check-only` | 退出 0 |
| `git diff --check` | 退出 0 |

构建后的静态扫描未发现 `better-sqlite3/sqlite3/node:sqlite/better_sqlite3.node`
进入 `dist/*.js`；`src/ui`、`src/game`、`tests/benchmark` 未导入 server store/native addon。

## 9. Ubuntu CI 证据与边界

本仓库仅发现 `.github/workflows/ci.yml`：`ubuntu-latest`、setup-node `22`、
`npm ci`、test/build；没有本次 `0e73588` 的 exact Node 22.22.2 focused/tsc/build
run。当前环境 `gh` CLI 不可用，无法读取 GitHub Actions run/job/artifact。因此：

- remediation commit 的 Ubuntu CI run/job/artifact：**UNVERIFIED**；
- better-sqlite3 在该 run 中是否 prebuilt：**UNVERIFIED**；
- 是否调用 node-gyp：**UNVERIFIED**。

本地 Windows/Node 24 证据不能替代批准的 Ubuntu/Linux x64 + Node 22.22.2 证据。

## 10. 兼容性与未开始范围

- `src/server/api.ts` 仍未接入 provider，production POST `/api/rooms` 未改变；
- UI、room、PublicRoom、D2a event/ledger/replay contract 未改变；
- legacy D1 trace/hash/schema/validator 未改变；
- 没有 benchmark strategy、treatment、smoke/calibration/formal 变更；
- Task 2、D2b 均未开始；
- `formalExecutionAllowed` 仍为 `false`。

## 最终判定

由于真实 Ubuntu 22.22.2 CI 证据缺失，且 descriptor accessor rejection 尚未满足严格契约，
本轮不批准进入 Task 2：

**D2A1_TASK1_NOT_APPROVED**

本 review 未修复上述问题，仅记录最小阻塞项。
