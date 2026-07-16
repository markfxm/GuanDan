# D2a Public Ledger Implementation Review

审计基线：canonical design `c2501d37495e2c693b0c86fabce8dd137ef72cc6`；最终实现 `3ef5053b87b7c3305d0832bc8ee46aee2468b3ee`。

## 结论

**D2A_NOT_APPROVED**

阻塞项只有一个但属于硬门禁：production 正常建局路径仍未注入 `PublicGameIdentity`，因此正常 production room 不创建 `publicLedger`。当前实现只在显式传入 identity 时启用 D2a；无 identity room 保持 legacy 行为且不创建 fallback identity。按验收规则，不能批准进入 D2b。

本次没有修改 production、benchmark schema、approval、artifacts，也没有运行 smoke、calibration 或 formal。

## 提交链

| Task | Commit | 实际修改 |
|---|---|---|
| 1 | `8e3ec8c` | `src/game/publicEvent.ts`; identity/event contract tests |
| 2 | `52b499e` | `src/game/publicEventHash.ts`; hash tests |
| 3 | `00da496` | `src/game/publicLedger.ts`; ledger tests |
| 4 | `70c0cfe` | `src/game/room.ts`; room play/pass adapter test |
| 5 | `e7024c9` | `src/game/room.ts`; trick/finish tests |
| 6 | `fffabac` | `src/game/room.ts`; tribute/reset tests |
| 7 | `e76f6c3` | replay module and additive benchmark adapter/tests |
| 8 | `3ef5053` | privacy/isolation helper and tests |

从最终 implementation-plan/preflight commit `2a62d854aa99567a3b7ddda1bfdb93377db60594` 到最终实现的 diff：**19 files, 1,591 insertions, 3 deletions**。

新增 production 模块：`publicEvent.ts`, `publicEventHash.ts`, `publicLedger.ts`, `publicEventReplay.ts`, `publicLedgerPrivacy.ts`；修改 `src/game/room.ts`；其余为 D2a tests 和只读 benchmark adapter。`src/ai` 无 diff，D0/D1 artifacts 与 P7.1 approval 无 diff，工作树干净，`git diff --check` exit 0。

## PublicGameIdentity 调用方审计

| 调用文件/入口 | 函数 | publicIdentity | canonical | publicLedger | production真实路径 |
|---|---|---:|---:|---:|---:|
| `src/server/api.ts:142-158` | `POST /api/rooms` → `createRoom` | 否 | 否 | 否 | 是 |
| `src/ui/api.ts:118-121` | `createGameRoom` | 未向 API 传入 | 否 | 否 | 是（间接） |
| `src/ui/App.tsx:264,278` | `createGameRoom` 调用 | 未传 | 否 | 否 | 是（间接） |
| `scripts/unifiedAiSimulation.ts:52` | `createRoom` | 否 | 否 | 否 | 否，simulation |
| `scripts/research/measureD1PlannerExpansionBudget.ts:164` | `createRoom` | 否 | 否 | 否 | 否，research |
| `tests/benchmark/simulator.ts:81` | fallback `createRoom` | 否 | 否 | 否 | 否，legacy benchmark |
| `tests/benchmark/d2aPublicLedgerAdapter.test.ts:8` | `createRoom` | 是，固定 benchmark scenario identity | 是 | 是 | 否，D2a adapter test |
| `tests/game/publicEventRoomAdapter.test.ts:8` | `createRoom` | 是，固定 identity | 是 | 是 | 否，D2a adapter test |
| `scripts/replayD1TopKBenchmark.ts` | D1 replay | 无 D2a room 创建 | 否 | 否 | 否，legacy D1 |

`src/game/room.ts:78` 的参数仍是 `publicIdentity?: PublicGameIdentity`。显式提供时必然初始化 ledger；缺少时不生成任何 fallback identity。因而：

1. server/API 正常建局目前不创建 D2a ledger；
2. UI 正常游戏通过该 API 间接使用无 identity room；
3. production 中仍有无 identity 的 `createRoom` 调用；
4. 这些路径未被标记为 D2a-enabled，且未使用非 canonical fallback；
5. 该事实触发 `D2A_INTEGRATION_INCOMPLETE`，因此总体验收不批准。

## 契约逐项审计

| 项目 | 结果 | 证据 |
|---|---|---|
| distributive `PublicActionEventDraft` | PASS | `src/game/publicEvent.ts:123` 的 `RemovePayloadHash<T extends unknown>` |
| finalize 复制、排序、重复检查、seat-map 规范化、hash、冻结 | PASS | `src/game/publicEventHash.ts:26-30,40-90`；hash focused tests |
| browser/Node 同步 SHA-256 | PASS | `publicEventHash.ts:40+` 纯 TypeScript 实现；browser build exit 0 |
| ledger 仅接受 finalized 且 hash 有效事件 | PASS | `src/game/publicLedger.ts:90-91` |
| `playedCardIds` 与 transfer 分离 | PASS | `publicLedger.ts:174-199`；tribute tests |
| tribute card 后续可 play | PASS | ledger transfer test |
| finish 只更新 `finishOrder` | PASS | `publicLedger.ts:184-188`；finish test |
| anti-tribute 不含 card/count/transfer | PASS | `publicLedger.ts:201-204`；anti-tribute test |
| play/pass/trick-clear 状态转换 | PASS | `publicLedger.ts:158-183`；room trick tests |
| ledger 失败返回原 ledger | PASS | `applyPublicEvent` failure tests |
| RoomTransitionDraft 深复制无 alias | PASS | `room.ts:285,300,518` 使用 `structuredClone`；原子失败测试 |
| commit 前原 room 不变 | PASS | `room.ts:362-389`；room adapter failure test |
| PublicRoom/AiObservation 不含 ledger | PASS | `getPublicRoom` 解构剔除 D2a 字段；isolation tests |
| replay 必须有 initialState | PASS | `publicEventReplay.ts:20-23`；replay test |
| snapshot 非 authority | PASS | replay rebuild 先用 initialState/events，再校验 snapshot |
| legacy D1 trace/hash/schema/validator 未改 | PASS | implementation diff 无 D1 benchmark 文件；benchmark/reproducibility fresh tests 通过 |
| production 正常 room 已启用 identity/ledger | **FAIL** | `src/server/api.ts:158` 未传 identity |

## Fresh 验证

所有命令均在最终 commit、干净工作树、无并行测试进程下执行；未运行实验模拟。

| 命令 | 结果 |
|---|---|
| D2a focused | exit 0；12 files / 33 tests |
| `npm test` fresh run 1 | exit 0；56 files / 467 tests；23:12:57–23:17:08；无 worker/stderr 异常 |
| `npm test` fresh run 2 | exit 0；56 files / 467 tests；23:17:17–23:21:24；无 worker/stderr 异常 |
| `npm test` fresh run 3 | exit 0；56 files / 467 tests；23:21:37–23:25:13；无 worker/stderr 异常 |
| `npm run test:benchmark` | exit 0；35 files / 130 tests；自然退出 |
| `npm run test:simulation` | exit 0；2 files / 2 tests |
| `npm run test:ai-performance` | exit 0；1 file / 4 tests |
| `npm run build` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| D0 fixture `--check-only` | exit 0 |
| `git diff --check` | exit 0 |

历史上曾有一次普通 `npm test` 的 worker unexpected exit；本次按要求连续三次 fresh 复验均未重现，未修改测试、配置或使用强制退出。

## 行为与 privacy 检查

- 显式 identity room：`createRoom` 分支同时创建 identity、ledger、events；D2a focused 覆盖 play/pass/finish/tribute/anti-tribute。
- 无 identity legacy room：不创建 ledger；keep-current byte-lock 通过。
- play 事件覆盖：room adapter、finish、benchmark adapter 等测试；不输出真实手牌。
- pass 事件覆盖：room adapter 与 trick-clear 测试。
- trick-clear：1 个专门场景；finish：1 个 hand-empty 场景，ledger finish 语义另有单元测试。
- tribute/return/anti-tribute：3 个测试场景，另有 ledger transfer 断言。
- replay round-trip：3 个 fixture/test cases。
- privacy forbidden-key：1 个拒绝用例，另有 1 个公开对象通过用例。
- keep-current：D0 fixture byte-lock 与 legacy isolation 均通过。
- 未发现 D2a event/ledger 中的隐藏手牌、deck、ParticleBank 或 hypothetical hands。

## 未解决问题

最小阻塞项是 production room identity 注入：需要由 server/API 的正常建局流程提供稳定 `PublicGameIdentity`，并让 replay/benchmark/production 的来源分别可审计；本轮按要求未修复。没有创建 review 之外的提交，也没有改变 `formalExecutionAllowed`。

`formalExecutionAllowed` 仍为 `false`；D2a 不得进入 D2b 实施，直到 production identity/ledger 接入完成并重新通过同等验收。
