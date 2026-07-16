# D2a.1 Production Identity Integration Implementation Plan

> For agentic workers: execute this plan task by task with the execution-plans skill.

**Goal:** 正常 production 建局显式创建 D2a publicLedger；legacy 创建显式隔离；D0/D1 trace、hash、schema、PublicRoom shape 和 D2a contracts 不变。

**Status gate:** source contract 已批准；store technology 仍为 STORE_TECHNOLOGY_PENDING。未完成 store 决策前不得实施 Task 1–6、不得开始 D2b。formalExecutionAllowed=false。

## 1. 代码映射与事实

- server composition root：src/server/dev.ts 的 buildApi() 后 app.listen；没有 session/store/provider。
- API：src/server/api.ts 的 buildApi() 建立局部 rooms Map；POST /api/rooms 的 CreateRoomBody 只有 rank、seed、pendingTributeItems，调用无 identity 的 createRoom。
- transport：src/game/room.ts 的模块级 nextRoomId 产生 room-加序号的 RoomState.id；它只用于 API/UI 定位，不是 canonical gameId。
- UI：src/ui/api.ts 的 createGameRoom 与 src/ui/App.tsx 的 handleCreateRoom/handleNextRoom 均不持有 identity/sequence。
- replay：src/game/publicEventReplay.ts 文档已保存 identity、initialState、events、finalLedgerHash。
- legacy 调用：scripts/unifiedAiSimulation.ts、scripts/research/measureD1PlannerExpansionBudget.ts、tests/benchmark/simulator.ts 的无 identity createRoom；D2a adapter/ledger tests 已显式传 buildPublicGameIdentity。
- 当前无 authenticated session、match/series identity、持久 sequence 或生产持久 store；rooms Map、nextRoomId、Date.now seed 都不是 identity 来源。

## 2. 已批准 identity source 与无循环 provider

### Installation identity

单 server 使用 persistent installation identity：

1. 第一次 store 初始化生成 opaque UUID；
2. 必须成功持久化后才允许 allocation；
3. restart 读取同一值；
4. 不来自 RoomState.id、nextRoomId、时间、worker、目录或 deck；
5. 未持久化随机 UUID 禁止；生成并成功持久化的 opaque UUID 允许；
6. 不进入 UI、PublicRoom、ledger。

### Canonical request与provider

调用者只提供：

~~~ts
type CanonicalRoomRequestDescriptor = Readonly<{
  rank: GameRank;
  seed: number;
  normalizedPendingTributeItems: readonly TributeItem[];
}>;
~~~

provider 不接收 sessionIdentity 或 gameSequence：

~~~ts
type PublicGameIdentityProvider = Readonly<{
  allocate(input: Readonly<{
    descriptor: CanonicalRoomRequestDescriptor;
    idempotencyKey: string;
  }>): Promise<Readonly<{
    status: "new" | "idempotent";
    descriptorHash: string;
    gameSequence: number;
    publicIdentity: PublicGameIdentity;
  }>>;
}>;
~~~

事务顺序固定为：查 idempotencyKey → 校验 descriptorHash → 原子分配并递增 gameSequence → 派生 gameId/roundIdentity/handIdentity → 持久化 allocation → 返回。

### Canonical derivation

固定版本化 domain separator D2A-PUBLIC-GAME-ID-V1：

~~~text
gameId = SHA-256(domainSeparator || installationIdentity || canonicalDecimal(gameSequence))
~~~

roundIdentity/handIdentity 继续从 gameId 和 round/hand 序号派生。gameSequence 只能存在于 allocation record/result，绝不能由 UI/API 传入。

## 3. PublicIdentityStore与候选

至少持久化 installationIdentity、nextGameSequence、idempotencyKey、descriptorHash、gameSequence、gameId、完整 PublicGameIdentity。必须具备事务或等价原子唯一约束：

- idempotencyKey UNIQUE；
- gameSequence UNIQUE；
- gameId UNIQUE；
- 同 key 同 descriptor 幂等；
- 同 key 不同 descriptor 冲突；
- 并发同 key 只生成一次；
- restart 返回同一 allocation。

当前 package.json 未包含可用生产 store；脚本 fs 写入不满足门禁。候选如下：

1. **SQLite + better-sqlite3（推荐供人工批准）**：同步事务、UNIQUE、崩溃恢复语义清晰；代价是 native addon、Node ABI 和各平台预编译/构建验证。
2. **SQLite + sqlite3 async driver（备选）**：事务/UNIQUE 成熟；代价是异步 callback/worker 调度更复杂、初始化和并发错误传播更难审计。

Task 1 必须使用决策文档批准的候选；实现者不得临场选择。

## 4. API、幂等与 replay

- API/UI 使用 opaque Idempotency-Key header；一个新建游戏意图一个 key，retry 复用，成功后结束，下一局新 key。
- key 不进入 identity、ledger、PublicRoom 或 replay public event。
- 同 key 同 descriptor 幂等；同 key 不同 descriptor 返回 409；并发同 key 只有一次 allocation。
- production POST 只能 canonical；legacy benchmark/research/test 显式 mode legacy；没有 identity 不得自动转 legacy。
- replay 的权威输入是保存的 PublicGameIdentity、initialState、events、finalLedgerHash；allocation store 只作可选 audit。provider 不可用不应阻止完整历史 replay。

## 5. TDD任务与提交边界

所有任务由 STORE_TECHNOLOGY_PENDING 阻断，Task 0 批准 store 后才进入 Task 1。

### Task 0 — source/store decision gate

Files：本轮创建 docs/decisions/2026-07-16-d2a1-public-game-identity-source.md；批准后创建 docs/benchmark-approvals/d2a1-identity-source-decision.json、tests/server/publicIdentityProviderContract.test.ts。

RED：先写 contract test，运行
npx vitest run tests/server/publicIdentityProviderContract.test.ts --testTimeout=120000
预期仅因 store technology/provider contract 未批准失败。

最小步骤：记录 installation lifecycle、store technology、transaction/unique constraints、restart、Idempotency-Key；不写 production。状态保持 STORE_TECHNOLOGY_PENDING。无 production commit。

### Task 1 — provider与descriptor

Files：src/server/publicIdentityProvider.ts、src/server/publicIdentityDescriptor.ts、批准的 store adapter、tests/server/publicIdentityProvider.test.ts、tests/server/publicIdentityDescriptor.test.ts；src/game/room.ts 仅暴露 canonical input boundary。

RED：allocation 接口若接受 sessionIdentity/gameSequence、installation 未持久化即 allocation、同 key 不同 descriptor 不冲突，测试应失败。

最小步骤：实现 descriptor hash、installation bootstrap、事务 sequence、domain-separated gameId、allocation record；不改 API/UI。

Focused：
npx vitest run tests/server/publicIdentityProvider.test.ts tests/server/publicIdentityDescriptor.test.ts --testTimeout=120000 --reporter=verbose
Commit：d2a1-task1-identity-provider-contract

### Task 2 — production API

Files：src/server/api.ts、src/server/dev.ts、tests/server/apiCanonicalIdentity.test.ts、tests/server/api.test.ts。

RED：无 store/provider 的 POST 必须失败；provider-backed POST 必须有 private ledger；当前实现会成功创建 legacy room。

最小步骤：读取 Idempotency-Key，构造 descriptor，调用 provider.allocate，canonical create 成功后写 rooms Map，response 不变。

Focused：
npx vitest run tests/server/apiCanonicalIdentity.test.ts tests/server/api.test.ts --testTimeout=120000 --reporter=verbose
Commit：d2a1-task2-production-api-canonical-room

### Task 3 — UI idempotency lifecycle

Files：src/ui/api.ts、src/ui/App.tsx、tests/ui/productionIdentityLifecycle.test.tsx、tests/server/apiIdempotency.test.ts。

RED：UI 必须不传 identity/gameSequence、首局/下一局带 opaque header、retry 复用 key、下一局换 key；当前 client 会失败。

最小步骤：UI 只维护创建意图 key，不暴露 identity/sequence。

Focused：
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/server/apiIdempotency.test.ts --testTimeout=120000 --reporter=verbose
Commit：d2a1-task3-ui-api-idempotency

### Task 4 — explicit legacy isolation

Files：src/game/room.ts creation boundary、scripts/unifiedAiSimulation.ts、scripts/research/measureD1PlannerExpansionBudget.ts、tests/benchmark/simulator.ts、tests/game/legacyRoomIsolation.test.ts、tests/benchmark/legacyD1Compatibility.test.ts。

RED：缺 mode/identity 不得静默 legacy；显式 legacy 无 ledger 且 D1 trace/hash/schema 不变。

最小步骤：显式标注 legacy 调用，不改 seed、matchId、replay、statistics。
Focused：
npx vitest run tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts tests/benchmark/d2aPublicLedgerAdapter.test.ts --testTimeout=120000 --reporter=verbose
Commit：d2a1-task4-explicit-legacy-isolation

### Task 5 — restart recovery与standalone replay

Files：批准的 store adapter、src/game/publicEventReplay.ts 的文档 identity 输入、tests/server/publicIdentityStoreRestart.test.ts、tests/server/publicIdentityConcurrency.test.ts、tests/game/publicEventReplayIdentity.test.ts。

RED：store reopen 后同 key 返回同 allocation；并发不双分配；断开 provider 后 replay 仍可用文档 identity/initialState/events/hash 成功。

最小步骤：验证 store recovery/unique constraints；replay 不调用 provider。
Focused：
npx vitest run tests/server/publicIdentityStoreRestart.test.ts tests/server/publicIdentityConcurrency.test.ts tests/game/publicEventReplayIdentity.test.ts --testTimeout=120000 --reporter=verbose
Commit：d2a1-task5-restart-and-standalone-replay

### Task 6 — production integration与回归

Files：仅修改上述 production composition/API/UI 文件；tests/server/d2a1ProductionIntegration.test.ts；tests/reviews/d2a1Acceptance.test.ts；门禁通过后更新 D2a review（本轮不更新）。

RED：production POST identity/ledger、UI canonical、legacy 无 ledger、PublicRoom shape、D0/D1 hash 全部锁定；当前 integration-incomplete 时失败。

最小步骤：全部 focused/regression 通过后更新 review evidence，不引入 D2b。
Focused：
npx vitest run tests/server/d2a1ProductionIntegration.test.ts tests/server/apiCanonicalIdentity.test.ts tests/ui/productionIdentityLifecycle.test.tsx tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts --testTimeout=120000 --reporter=verbose
Commit：d2a1-production-identity-integration

## 6. 必测断言

1. installation identity 先持久化，restart 不变。
2. provider.allocate 只接收 descriptor + opaque key。
3. UI/API 不可提供 gameSequence。
4. domain-separated gameId 稳定且不同 sequence 不同。
5. 三个唯一约束和同 key 幂等/冲突正确。
6. production POST room 有 private ledger。
7. UI 首局/下一局只管理 Idempotency-Key。
8. replay 脱离 provider 仍可恢复。
9. legacy D1 无 ledger、trace/hash/schema 不变。
10. PublicRoom 不含 identity/ledger，D0 fixture check-only 通过。

## 7. 最终门禁

Task 6 后运行 D2a focused、D2a.1 focused、连续三次 fresh npm test、npm run test:benchmark、npm run test:simulation、npm run test:ai-performance、npm run build、npx tsc --noEmit、D0 fixture check-only、git diff --check；逐条记录 exit code、自然退出、耗时和 stderr。不得运行 smoke/calibration/formal。review 只能输出 D2A_APPROVED_FOR_D2B_PLANNING 或 D2A_NOT_APPROVED。

## 8. 停止条件

- store technology 未批准：Task 1 前停止。
- provider 无法 restart recovery：停止，不改用内存计数器。
- production room 无 ledger：D2A_INTEGRATION_INCOMPLETE。
- legacy D1 trace/hash/schema 变化、PublicRoom 泄漏 identity/ledger、或需修改 D2a contract：停止并请求设计修订。
---
