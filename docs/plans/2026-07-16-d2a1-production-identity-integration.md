# D2a.1 Production Identity Integration Implementation Plan

> For agentic workers: execute this plan task by task with the execution-plans skill.

**Goal:** 让正常 production 建局显式取得稳定 PublicGameIdentity 并创建 D2a publicLedger；legacy room 创建必须显式声明，不改变 D0/D1 行为、artifact 或 PublicRoom shape。

**Architecture:** 目标采用 server composition-root 注入 PublicGameIdentityProvider。provider 从批准的稳定 session identity 与持久、原子递增的 game sequence 分配 identity，并以 creation descriptor hash 实现幂等/冲突拒绝。当前仓库未发现稳定来源，故门禁为 IDENTITY_SOURCE_UNRESOLVED；不得用 RoomState.id、nextRoomId、时间、worker、目录或未持久化随机值补洞。

**Tech Stack:** TypeScript、Fastify、React/Vite、Vitest、src/game/publicEvent.ts 与 src/game/room.ts 的 D2a contracts。

## Global constraints

- 不改 D2a event/ledger/replay contract、D1 public trace/hash/schema/validator、D0 keep-current 行为。
- publicIdentity、publicLedger、publicEvents 继续是 server-private；PublicRoom JSON shape 不变。
- POST /api/rooms 只能 canonical；缺 provider/identity 失败，不能转 legacy/fallback。
- legacy 仅用于 D1 benchmark、research scripts、明确的 byte-lock/unit fixtures。
- formalExecutionAllowed=false；本计划不运行 smoke、calibration、formal 或 approval/artifact 生成。
- 未来每个 Task 都必须先 RED、确认失败原因、最小实现、focused 验证、单独提交并保持工作树干净。

## 1. 当前生命周期映射

| 位置 | 函数/调用 | 当前状态 | 计划结论 |
|---|---|---|---|
| server 入口 | src/server/dev.ts：buildApi() 后 app.listen({host,port}) | 无 provider/session/sequence store | composition root 构造并注入 provider |
| API composition root | src/server/api.ts：buildApi() | 局部 rooms Map，无持久状态 | buildApi 接收 provider |
| POST | src/server/api.ts：POST /api/rooms | CreateRoomBody 仅 rank/seed/pendingTributeItems；调用 createRoom 无 identity | provider allocation 后调用 canonical room API |
| transport id | src/game/room.ts：模块 nextRoomId、createRoom | RoomState.id 为 room- + nextRoomId，仅定位 API map/UI | 保留 RoomTransportId，不进 identity/hash |
| public response | src/game/room.ts：getPublicRoom | 已排除 ledger/identity/events | 维持 shape 并加锁定测试 |
| UI client | src/ui/api.ts：createGameRoom | POST 不带 identity | UI 不手写 identity，由 server provider 分配 |
| UI 首局/下一局 | src/ui/App.tsx：handleCreateRoom/handleNextRoom | 调用 createGameRoom；无 session/sequence | 使用同一批准 session lifecycle，重试复用 idempotency key |
| replay | src/game/publicEventReplay.ts | replay document 已保存 PublicGameIdentity | 以保存 identity 重建，不从 room id 猜测 |
| D1 replay | scripts/replayD1TopKBenchmark.ts | 不创建 D2a room | 原样保留 |
| legacy scripts | scripts/unifiedAiSimulation.ts、scripts/research/measureD1PlannerExpansionBudget.ts | createRoom 无 identity | 显式 mode legacy |
| legacy benchmark | tests/benchmark/simulator.ts fallback createRoom | 无 identity | 保持 D1 无 ledger；D2a adapter 继续显式 identity |
| D2a fixtures | tests/game/publicEventRoomAdapter.test.ts、tests/benchmark/d2aPublicLedgerAdapter.test.ts、tests/ai/publicLedger*.test.ts | 显式 buildPublicGameIdentity | canonical fixtures |
| server/UI tests | tests/server/api.test.ts、tests/ui/app.test.tsx | server POST 无 identity；UI 多为 mocked PublicRoom | Task 2/3 增加 canonical lifecycle/retry assertions |

server 重启后 rooms Map 与 nextRoomId 都丢失。检索 session、match、series、gameSequence、持久存储和恢复路径，没有可复用稳定来源。

**结论：IDENTITY_SOURCE_UNRESOLVED。** 人工批准 session source、sequence owner、restart recovery、唯一约束前，不实施 Task 1–6、不创建内存替代 provider、不开始 D2b。

## 2. A/B/C 选择

| 方案 | 稳定性/唯一性 | UI/API | 重启/legacy | 决定 |
|---|---|---|---|---|
| A composition-root provider | server 统一校验、持久 allocation 可 replay、客户端不能指定内部 sequence | UI 不暴露 identity，buildApi 增加依赖 | 依赖批准的持久 owner；legacy 显式隔离 | **选定** |
| B POST 提供 sessionIdentity/gameSequence | 可 replay，但可伪造、重复和并发冲突 | 扩大请求/UI/retry contract | 当前无持久 owner，边界易绕过 | 拒绝 |
| C 复用已有稳定对象 | 当前不存在，无法证明恢复 | 表面改动小 | 无法定义 | 拒绝 |

### 2.1 设计级 contract

~~~ts
type CanonicalRoomCreationDescriptor = Readonly<{
  rank: GameRank;
  seed: number;
  pendingTributeItems: readonly TributeItem[];
  sessionIdentity: string;
  gameSequence: number;
}>;

type PublicGameIdentityProvider = Readonly<{
  allocate(input: Readonly<{
    sessionIdentity: string;
    descriptor: CanonicalRoomCreationDescriptor;
    idempotencyKey: string;
  }>): Promise<Readonly<{
    publicIdentity: PublicGameIdentity;
    descriptorHash: string;
    allocationStatus: "new" | "idempotent";
  }>>;
  resolveForReplay(input: Readonly<{
    publicIdentity: PublicGameIdentity;
    descriptorHash: string;
  }>): Promise<Readonly<{ publicIdentity: PublicGameIdentity }>>;
}>;
~~~

sessionIdentity 必须来自批准的 authenticated/session lifecycle；gameSequence 必须由持久、原子 sequence owner 分配。具体存储不得临场决定。

## 3. Production/legacy 边界

固定显式 discriminated input：

~~~ts
type CanonicalCreateRoomInput = {
  mode: "canonical";
  publicIdentity: PublicGameIdentity;
  rank: GameRank;
  seed: number;
  pendingTributeItems: readonly TributeItem[];
};
type LegacyCreateRoomInput = {
  mode: "legacy";
  rank: GameRank;
  seed: number;
  pendingTributeItems: readonly TributeItem[];
};
~~~

createRoom 可采用该联合类型，或等价的 createCanonicalRoom/createLegacyRoom 两入口；不允许 optional identity 自动推断。

- POST /api/rooms 只能构造 canonical；provider 缺失/失败即明确错误。
- D1 benchmark、research、D0/D1 byte-lock/unit fixtures 显式 legacy。
- canonical room 必须有 ledger；legacy room 明确没有 ledger。
- getPublicRoom response 保持现有 shape。

## 4. Identity、幂等、并发、replay

- descriptor hash 对 rank、显式 seed、规范化贡还 descriptor、session identity、game sequence 以稳定 key 顺序 SHA-256；不含 transport id、时间、worker、目录、对象地址、隐藏牌/deck。
- 相同 sessionIdentity + gameSequence + descriptorHash：幂等返回原 allocation，不建第二 room。
- 相同 identity + 不同 descriptor：冲突（建议 409），不修改旧 room。
- 并发同 key：provider 原子 compare-and-set/唯一约束，只有一次 sequence 分配。
- allocation 后 room commit 失败：同 idempotency key 可恢复，不能申请新 sequence；无法恢复则失败并标记不可完成。
- replay 保存 identity、descriptor/hash、public event sequence；resolveForReplay 后按 events 重建 ledger，不从 RoomState.id/server restart 顺序猜测。

## 5. TDD 任务

所有任务受 IDENTITY_SOURCE_UNRESOLVED 阻断；Task 0 批准后才执行 Task 1。

### Task 0: identity source/provider approval gate

**文件**：人工批准后新增 docs/benchmark-approvals/d2a1-identity-source-decision.json 与 tests/server/publicIdentityProviderContract.test.ts；当前计划阶段不创建。

**RED**：先写 contract test，运行
npx vitest run tests/server/publicIdentityProviderContract.test.ts --testTimeout=120000
预期是缺少批准的 source/provider contract，而不是 import/type/fixture 错误。

**最小实现/边界**：不写 production。批准记录必须包含 stable session source、persistent sequence owner、atomic uniqueness、restart recovery、replay resolution。门禁未批准时状态仍为 IDENTITY_SOURCE_UNRESOLVED；无 production commit。

### Task 1: provider contract 与 descriptor

**Create/Modify**：
src/server/publicIdentityProvider.ts；
src/server/publicIdentityDescriptor.ts；
src/game/room.ts 仅暴露已批准的 canonical input boundary；
tests/server/publicIdentityProvider.test.ts；
tests/server/publicIdentityDescriptor.test.ts。

**RED**：allocation 缺批准的 session/sequence owner；RoomState.id 变化影响 identity。预期因 provider/descriptor 缺失失败。

**最小实现**：只实现批准的 provider adapter、稳定 descriptor hash，不改 route/UI。

**Focused**：
npx vitest run tests/server/publicIdentityProvider.test.ts tests/server/publicIdentityDescriptor.test.ts --testTimeout=120000 --reporter=verbose

**Commit**：d2a1-task1-identity-provider-contract

### Task 2: production API canonical creation

**Create/Modify**：
src/server/api.ts（buildApi、CreateRoomBody、POST /api/rooms）；
src/server/dev.ts（构造/注入 provider）；
tests/server/apiCanonicalIdentity.test.ts；
tests/server/api.test.ts（仅 canonical assertions）。

**RED**：无 provider/identity 的 POST 当前会成功创建 legacy room；provider-backed POST 当前没有 private ledger。

**最小实现**：保留现有校验，provider allocation 后调用 canonical room，ledger 成功后才写 rooms Map，response 不变。

**Focused**：
npx vitest run tests/server/apiCanonicalIdentity.test.ts tests/server/api.test.ts --testTimeout=120000 --reporter=verbose

**Commit**：d2a1-task2-production-api-canonical-room

### Task 3: UI/API lifecycle

**Create/Modify**：
src/ui/api.ts 的 createGameRoom（只处理 server-owned creation/idempotency metadata）；
src/ui/App.tsx 的 handleCreateRoom/handleNextRoom；
tests/ui/productionIdentityLifecycle.test.tsx；
tests/server/apiIdempotency.test.ts。

**RED**：首局/下一局未进入 canonical POST，retry/concurrency 会重复建局。

**最小实现**：接入批准的 server-owned provider；UI 不发送任意 identity，sessionIdentity 只能来自批准 session lifecycle。

**Focused**：
npx vitest run tests/ui/productionIdentityLifecycle.test.tsx tests/server/apiIdempotency.test.ts --testTimeout=120000 --reporter=verbose

**Commit**：d2a1-task3-ui-api-canonical-lifecycle

### Task 4: explicit legacy isolation

**Create/Modify**：
src/game/room.ts creation boundary（显式 mode canonical/legacy 或同等两入口）；
scripts/unifiedAiSimulation.ts；
scripts/research/measureD1PlannerExpansionBudget.ts；
tests/benchmark/simulator.ts 及 legacy fixtures；
tests/game/legacyRoomIsolation.test.ts；
tests/benchmark/legacyD1Compatibility.test.ts。

**RED**：缺 mode/identity 目前会静默建 legacy room；显式 legacy 与 D1 trace/hash/schema 兼容性未锁定。

**最小实现**：只显式标注 legacy 调用，游戏逻辑和 benchmark seed/matchId/replay/statistics 不变。

**Focused**：
npx vitest run tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts tests/benchmark/d2aPublicLedgerAdapter.test.ts --testTimeout=120000 --reporter=verbose

**Commit**：d2a1-task4-explicit-legacy-isolation

### Task 5: replay、重复请求、重启恢复

**Create/Modify**：
src/game/publicEventReplay.ts（仅消费保存 descriptor/provider resolver）；
approved durable store adapter under src/server（确切路径由 Task 0 冻结）；
tests/server/publicIdentityReplay.test.ts；
tests/server/publicIdentityConcurrency.test.ts；
tests/game/publicEventReplayIdentity.test.ts。

**RED**：无保存 identity 的 replay、同 identity 不同 descriptor、并发同 key 必须失败；当前无 durable allocation/idempotency store。

**最小实现**：持久 allocation record/hash；replay 使用保存 identity/events；restart 后 resolve 返回同一 identity。

**Focused**：
npx vitest run tests/server/publicIdentityReplay.test.ts tests/server/publicIdentityConcurrency.test.ts tests/game/publicEventReplayIdentity.test.ts --testTimeout=120000 --reporter=verbose

**Commit**：d2a1-task5-replay-idempotency-recovery

### Task 6: production integration 与完整回归

**Create/Modify**：
仅修改前述 production composition/API/UI 文件；
tests/server/d2a1ProductionIntegration.test.ts；
tests/reviews/d2a1Acceptance.test.ts（或现有同等位置）；
所有门禁通过后更新 review 文档（当前 plan-only turn 不更新）。

**RED**：production POST canonical identity/ledger、UI canonical、legacy 无 ledger、response 无 ledger、D0/D1 hash 不变；当前 integration-incomplete 或 fixture 变化应失败。

**最小实现**：所有 focused/regression gate 通过后才更新 review evidence；不引入 D2b。

**Focused**：
npx vitest run tests/server/d2a1ProductionIntegration.test.ts tests/server/apiCanonicalIdentity.test.ts tests/ui/productionIdentityLifecycle.test.tsx tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts --testTimeout=120000 --reporter=verbose

**Commit**：d2a1-production-identity-integration

## 6. 必测断言

1. production POST room 有 canonical identity/private ledger。
2. UI 首局/下一局进入 canonical room。
3. 缺 provider/identity 失败，不转 legacy。
4. transport RoomState.id 变化不影响 identity。
5. 不同 gameSequence 产生不同 identity。
6. 相同 canonical input 产生相同 identity/hash。
7. 相同 identity + 不同 descriptor 冲突且不改旧 room。
8. 并发创建只分配一次 sequence/room。
9. replay 恢复精确 identity 与 ledger event context。
10. legacy D1 benchmark 明确无 ledger 且旧 trace/hash/schema 不变。
11. PublicRoom 不含 ledger/identity。
12. D0 fixture check-only 与 D1 hash 不变。
13. server restart/recovery 恢复同一 identity。
14. room commit 失败重试不创建第二 allocation。

## 7. 最终验证与 review gate

Task 6 后以新进程记录 exit code、耗时、自然退出、stderr/open-handle：

~~~text
npx vitest run tests/ai/publicLedger.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/game/publicEvent*.test.ts --testTimeout=120000 --reporter=verbose
npx vitest run tests/server/apiCanonicalIdentity.test.ts tests/server/publicIdentityProvider.test.ts tests/server/publicIdentityReplay.test.ts tests/server/publicIdentityConcurrency.test.ts tests/ui/productionIdentityLifecycle.test.tsx tests/game/legacyRoomIsolation.test.ts tests/benchmark/legacyD1Compatibility.test.ts --testTimeout=120000 --reporter=verbose
npm test                         # 连续三次，均自然退出
npm run test:benchmark
npm run test:simulation
npm run test:ai-performance
npm run build
npx tsc --noEmit
npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree E:/workspace/掼蛋游戏开发/.worktrees/d0-fixture-ai-benchmark --source-commit e2a20e18f8e5c0871db38ad69426262e43766ce1 --output tests/ai/fixtures/d0KeepCurrentCases.json --generator-version d0-fixture-v1 --check-only
git diff --check
~~~

不得运行 smoke/calibration/D1 formal/D2 formal/approval generation。review 只能输出 D2A_APPROVED_FOR_D2B_PLANNING（production canonical ledger 与所有 gate 已证明）或 D2A_NOT_APPROVED（最小阻塞项）。当前状态为 IDENTITY_SOURCE_UNRESOLVED，formalExecutionAllowed=false。

## 8. 停止条件

- 无批准 stable session identity 与 durable atomic sequence owner：Task 1 前停止。
- provider 无法跨 restart/replay 恢复：停止，不替换内存计数器。
- 正常 production room 仍无 ledger：D2A_INTEGRATION_INCOMPLETE。
- legacy D1 trace/hash/schema 变化：停止，不改历史 artifact。
- PublicRoom 增加 ledger/identity：停止并先恢复 response contract。
- 需要改 D2a event/ledger/replay contract：停止并请求设计修订，不扩大 D2a.1。

## 9. 决策记录

| 问题 | 决定 | 原因 | 状态 |
|---|---|---|---|
| production POST 缺 identity/ledger | canonical POST 使用注入 provider/canonical room input | 消除静默遗漏，保留 private ledger | 来源门禁阻断 |
| 未发现稳定 session/game sequence | IDENTITY_SOURCE_UNRESOLVED，不猜测 | rooms Map 与 nextRoomId 跨重启丢失且非 canonical | 等待人工批准 |
| A/B/C | A：composition-root provider | server-owned allocation、可 replay、UI 不可伪造 | 目标架构 |
| legacy | 显式 mode legacy，无隐式 fallback | 保持 D0/D1 fixtures/scripts 隔离 | Task 4 |
| PublicRoom | 保持现有 shape | ledger 私有、网络兼容 | 已冻结 |
| D2b | production canonical ledger 和 review 批准前禁止 | 当前 D2a review 为 D2A_NOT_APPROVED | 未就绪 |
---
