# D2a Public Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. 每个任务都必须先写 RED 测试、观察预期失败、完成最小实现、运行 focused 测试后再提交。

**Goal:** 在不改变 D0/D1 AI 行为和公共网络 shape 的前提下，为真实 room 建立可重放、可去重、可校验、隐私安全的 `PublicActionEvent` 与 `HardPublicLedger`。

**Architecture:** 事件契约、canonical hash 和 ledger 放在 `src/game` 的中立领域层，由 room 已成功提交的公开状态转换产生事件；AI belief 未来只读消费这些中立事件，不由 room 导入 `src/ai/belief`。room 将 ledger/event log 作为内部状态，`getPublicRoom` 明确排除它们。D2a 新增只读 ledger adapter，但 legacy D1 public trace、hash、raw/replay schema 和 validator 保持不变；D2a 不在本阶段替换 legacy trace。

**Tech Stack:** TypeScript 5.7、Vitest 2、现有 `src/game/room.ts`、`src/game/playRules.ts`、`src/game/settlement.ts`、跨 browser/Node 的同步 SHA-256 适配、现有 D1 replay validator。

## Global Constraints

- 本计划基于 canonical design commit `c2501d37495e2c693b0c86fabce8dd137ef72cc6`。
- 本阶段只实现 D2a Public Ledger；不实现 `LightweightPublicEvidence`、belief、粒子、likelihood、action reducer、rollout、team utility、D2 treatment、plan pruning 或 benchmark 实验。
- `formalExecutionAllowed` 必须保持 `false`；不得修改 P7.1 approval、D0 tag 或 D0/D1 artifacts。
- `PublicActionEvent` 只能由 room 已验证并即将原子提交的公开状态转换生成；AI、benchmark 和 request handler 不得分配 event index。
- event index 由当前 hand 的单一 room ledger 分配，从 `0` 连续递增；不得使用 Date.now、performance.now、对象地址、worker ID、输出目录或不可重放随机 UUID。
- 事件和 ledger 不得包含 `partnerHand`、`opponentsHands`、`hands`、`deck`、`initialHands`、`hiddenInitialHand`、`hiddenState`、`ParticleBank` 或 `hypotheticalHands`。
- keep-current、D0 fixture、D1 selector、PlanManager、HandPlanner、evaluator、ActionGenerator 和 `PublicRoom` 网络 shape 必须保持行为/字节兼容。
- 每个任务独立提交；前一任务 focused 测试通过且工作树干净后才能进入下一任务。

---

## 1. 当前代码映射与冻结结论

### 1.1 Room 创建与 identity

- `src/game/room.ts:createRoom({ publicIdentity, rank, seed, pendingTributeItems })` 是 D2a 目标中的唯一建局函数。它调用 `shuffledDeck(seed)` 分牌、`resolveOpeningTribute(...)` 决定贡还状态、`randomOpeningLeader(seed)` 决定首家，并返回 `RoomState`。D2a 实施把 `publicIdentity` 设为必填；没有 identity 的 room 不创建 ledger，也不得宣称 D2a-enabled。
- 当前 `RoomState.id` 由模块级 `nextRoomId` 在 `createRoom` 中生成：`room-${nextRoomId++}`。它只是 `RoomTransportId`，用于 server/UI 的 room 定位，不能作为 replay/benchmark 的 canonical `gameId`，也不得进入 event hash。
- 当前新局没有 room 内原地切换函数。`src/server/api.ts:buildApi` 的 `POST /api/rooms` 调用 `createRoom`；`src/ui/App.tsx:handleCreateRoom` 和 `handleNextRoom` 通过 `createGameRoom` 创建新 room。因此 D2a 的现有 reset 入口是 `createRoom`；将来的同 room 新手必须显式调用同一个 `resetPublicLedger`，不能复用上一手 ledger。
- 当前 `createRoom` 没有 `PublicGameIdentity` 参数；D2a 接入时改为必填显式 `publicIdentity`。production 由稳定 game/session 生命周期分配，benchmark 由 canonical scenario key 派生，replay 保存并恢复。缺少 identity 的 room 不创建 ledger；任何 fallback 都不得使用 Date.now、nextRoomId、对象地址、worker、目录或随机 UUID。
- `RoomState` 当前字段已核对为：`id`、`rank`、`players`、`hands`、`initialHands`、`currentTurn`、`leaderSeat`、`trick`、`currentTrickIndex`、`finishOrder`、`settlement?`、`openingTribute?`、`aiPlans`、`aiRuntime`、`status`、`actionLog`、`playHistory`。后续 `RoomTransitionDraft` 只能引用这些真实字段；其中 `actionLog` 确实存在，不能凭空增加其他字段。

### 1.1.1 `createRoom` 调用方与 identity 来源

| 调用方 | 当前路径 | D2a identity 来源 | 约束 |
|---|---|---|---|
| server/API | `src/server/api.ts:buildApi` 的 `POST /api/rooms` | production-session 生命周期分配的显式 `PublicGameIdentity` | API 不从返回的 transport id 反推 identity；缺失时拒绝创建 D2a room |
| UI 本地建局 | `src/ui/App.tsx:handleCreateRoom`/`handleNextRoom` → `src/ui/api.ts:createGameRoom` → API | 由 server/session 请求携带或绑定的 production identity | UI 不生成 identity；`RoomState.id` 只用于 transport |
| benchmark | `tests/benchmark/simulator.ts`、`tests/benchmark/rotations.ts`、`scripts/unifiedAiSimulation.ts`、`scripts/research/measureD1PlannerExpansionBudget.ts` 的 `createRoom` 调用 | canonical scenario key 派生：已冻结的 phase/benchmarkVersion、seed、matchup、allocation/placement、rotation 组合 | 不含 outputDir、worker、对象地址、时间或随机 UUID；同 scenario key 必须得到同 identity |
| replay | D2a `src/game/publicEventReplay.ts` | replay 文档 `initialState.identity` 原样恢复 | replay 重建不调用 `createRoom` 生成 identity；缺少 identity 直接拒绝 |
| tests | D2a `tests/ai/*`、`tests/game/*`、`tests/benchmark/d2aPublicLedgerAdapter.test.ts` | `fixedPublicIdentity(scenarioKey)` 等测试 helper 显式传入固定值 | 每个 D2a `createRoom` 示例必须传 `publicIdentity`；不得依赖调用顺序或模块级计数 |

现有非 D2a 单元测试若仍直接调用 `createRoom`，在 D2a 实施前必须逐一改为显式 fixture identity，或明确标记为不启用 ledger 的 legacy helper；不得由 `createRoom` 创建非 canonical fallback。D2a 计划不把 `RoomState.id`、`nextRoomId`、`Date.now`、worker、对象地址或临时随机 UUID 作为 identity 来源。

本次代码核对的直接调用文件清单为：`src/server/api.ts`；`scripts/unifiedAiSimulation.ts`；`scripts/research/measureD1PlannerExpansionBudget.ts`；`tests/benchmark/simulator.ts`、`tests/benchmark/rotations.ts`、`tests/benchmark/observation.test.ts`、`tests/benchmark/rotations.test.ts`、`tests/benchmark/strategies.test.ts`；`tests/game/room.test.ts`、`tests/game/roomUnifiedAdapter.test.ts`、`tests/game/roomPlanningArchitecture.test.ts`；`tests/performance/aiHotPath.test.ts`；以及 `tests/ai/handPlannerMigration.test.ts`。`tests/benchmark/candidates.test.ts` 通过 `buildGamesForSeed` 间接取得 room，Task 4 仍需覆盖其 fixture provenance；`tests/ui/app.test.tsx` 使用的是独立 `PublicRoom` fixture helper，不是 production `createRoom` 调用。Task 4 的迁移清单必须逐项覆盖这些路径；`src/ui/App.tsx` 本身不直接调用 `createRoom`，它通过 `src/ui/api.ts:createGameRoom` 进入 server/API。

### 1.2 play/pass 提交顺序与唯一事件源

- `src/game/room.ts:playCards(room, seat, cardIds)` 当前顺序是：`assertActiveTurn` → `assertNoOpeningTribute` → `selectCards` → `classifyPlay` → `canBeatPlay` → 从 `room.hands` 删除牌 → 更新 `room.trick` → push `TrickPlay` 到 `trick.plays`/`playHistory` → 可能 push `finishOrder` → `advanceAfterAction`。
- `src/game/room.ts:passTurn(room, seat)` 当前顺序是：`assertActiveTurn` → `assertNoOpeningTribute` → 拒绝首家 pass → push `passSeats`/`TrickPlay`/`playHistory` → 达到 `passesNeededToReset` 时 `resolveTrickWinnerSeat`、清空 trick、增加 `currentTrickIndex`，否则切换 `currentTurn`。
- D2a 将两者改为 draft → ledger candidate → room/public tuple 一次提交；请求到达时不预写 event。事件从验证后的 next public state diff 构造，只有 tuple commit 成功才追加到 `publicEvents`。

### 1.3 trick-clear、finish order 与 settlement

- `src/game/room.ts:advanceAfterAction` 在 play 后检查 `finishOrder.length >= 3 || partnersFinishedFirstAndSecond(room)`，满足时调用 `finishRound(room)`，否则设置下一 `currentTurn`/`leaderSeat`。
- `src/game/room.ts:finishRound(room)` 将尚未列入的 seat 按固定 `room.players` 顺序追加到 `finishOrder`，调用 `settleRound` 并将 `status` 设为 `finished`。
- pass 触发完整过牌时，`passTurn` 先记录 pass，再清 trick 并递增 `currentTrickIndex`。D2a 事件顺序冻结为：`pass` → `trick-clear`；若该动作没有清墩，则只有 `pass`。
- play 清空手牌时，事件顺序冻结为：`play` → 对应 seat 的 `finish`；若同一动作触发 `finishRound`，随后按最终 `finishOrder` 新增顺序追加其余 `finish` 事件。不得把未发生的牌局动作伪造成 play。

### 1.4 贡还牌

- `src/game/room.ts:advanceOpeningTribute(room, seat?, cardIds)` 是贡还唯一提交函数。内部调用 `selectOpeningTributeCard`、`removeCard`、`assignTributeReceivers`、`selectOpeningReturnCard` 和 `completeOpeningTribute`。
- `src/game/settlement.ts:settleRound` 只计算下一局 `TributeItem[]`；实际贡/还牌移动仍由 `advanceOpeningTribute` 完成。
- D2a 在实际 card 已由 room 提交并公开显示的点生成 `tribute`/`return` 事件；抗贡只生成不含 card id 的公开状态事件。不得从隐藏 hand 反推尚未公开的选择。

### 1.5 replay、public trace 与 AI 公开历史

- 生产 room 当前没有独立 event replay serializer；UI replay 使用 `PublicRoom.playHistory`、`replayHands`，入口在 `src/ui/App.tsx:replaySteps`、`replayRemainingHand`。
- benchmark 当前在 `tests/benchmark/simulator.ts:appendPublicEvent` 中从 `createBenchmarkObservation(room, seat)` 拼装 `PublicSimulationEvent`，并由 `tests/benchmark/reporting.ts:publicTraceHash`/`finalPublicStateHash` 做 hash。这条路径是 legacy D1 的既有契约，本阶段不得删除、替换或改写。D2a 另增只读 adapter 消费 room ledger，并用一致性测试证明两条观察结果来自同一 room transition；正式替换延后到 D2g，并必须使用新的 benchmarkVersion/schema/configHash/artifact 目录。
- benchmark replay 写入在 `tests/benchmark/reporting.ts:writeReplay`，D1 replay 校验在 `tests/benchmark/d1ReplayValidation.ts:validateD1Replay`/`validateD1RawResultV2`；D2a replay round-trip 使用同一 public event sequence，并以 ledger 重建校验。
- AI 取得公开历史的位置是 `src/game/room.ts:runAiStep` 构造 `AiObservation` 的对象字面量（`playedCards`、`handCounts`、`lastPlay`、`finishOrder`、`partnerPassedCurrentTrick`）；`src/ai/contracts.ts:AiObservation` 是生产契约。D2a 不向该契约加入 ledger 字段，也不改变 keep-current 控制流；D2b 才可增加只读 adapter。

### 1.6 依赖方向结论

```text
src/game/publicEvent.ts + publicEventHash.ts + publicLedger.ts
                 ↑
          src/game/room.ts
                 ↓
tests/benchmark simulator/replay adapter（只读）

未来 D2b：src/ai/belief adapter → src/game public event/ledger
```

`src/game` 不导入 `src/ai/belief`；benchmark 不被 production 导入；replay 不依赖 D2 treatment。若实现者需要跨层类型，只能从 `src/game/publicEvent.ts` 导入中立 DTO。

---

## 2. Canonical D2a contracts

### 2.1 Transport ID 与 canonical PublicGameIdentity

```ts
type RoomTransportId = string; // RoomState.id；server/UI routing only

type PublicGameIdentity = Readonly<{
  schemaVersion: "d2-public-game-identity-v1";
  gameId: string;              // canonical, explicit, replay-persisted
  roundIdentity: string;       // `${gameId}:round:${roundSequence}`
  handIdentity: string;        // `${roundIdentity}:hand:${handSequence}`
  roundSequence: number;       // non-negative integer
  handSequence: number;        // non-negative integer
  source: "production-session" | "benchmark-scenario" | "replay";
}>;
```

`RoomTransportId` 保留当前 `RoomState.id`，只用于 server/UI 查找。它不得写入 `PublicActionEvent`、ledger canonical bytes 或 replay canonical identity。`PublicGameIdentity` 必须由 `createRoom` 的显式 `publicIdentity` 输入或其上游稳定生命周期分配器提供；benchmark 使用 canonical scenario key 派生，replay 从文档恢复。D2a 不实现分配器，但实现时若缺少 identity 必须在 ledger 初始化前 fail-closed，不能退回 `nextRoomId`。

创建时 `roundSequence=0`、`handSequence=0`、`eventIndex=0`。同一 identity 的 replay 必须恢复同一 event sequence；新 hand 只能由 `handSequence + 1` 产生，并同时清空当前 ledger。`eventIndex` 属于 hand，不跨 hand 复用。

### 2.2 PublicActionEvent

实现文件：`src/game/publicEvent.ts`。

```ts
type PublicActionEventBase = Readonly<{
  schemaVersion: "d2-public-event-v2";
  gameId: string;              // PublicGameIdentity.gameId, never RoomTransportId
  roundIdentity: string;
  handIdentity: string;
  eventIndex: number;
  kind: "play" | "pass" | "trick-clear" | "finish" | "tribute" | "return" | "anti-tribute";
  seat: 0 | 1 | 2 | 3;
  publicStableKey: string;
  patternType?: string;
  groupType?: string;
  handCountBefore?: number;
  handCountAfter?: number;
  leadSeat?: 0 | 1 | 2 | 3;
  lastPlaySeat?: 0 | 1 | 2 | 3;
  usedWildcardCount?: number;
  usedBomb?: boolean;
  trickIndex: number;
  publicPayloadHash: string;
}>;

type PublicPlayEvent = PublicActionEventBase & Readonly<{
  kind: "play";
  publicCardIds: readonly string[]; // sorted, non-empty, already exposed
  patternType: string;
  groupType: string;
  handCountBefore: number;
  handCountAfter: number;
  publicStableKey: `play:${string}`;
}>;

type PublicPassEvent = PublicActionEventBase & Readonly<{
  kind: "pass";
  publicCardIds?: never;
  patternType?: never;
  groupType?: never;
  handCountBefore: number;
  handCountAfter: number;
  publicStableKey: "pass:v2";
}>;

type PublicTrickClearEvent = PublicActionEventBase & Readonly<{
  kind: "trick-clear";
  publicCardIds?: never;
  handCountBefore?: never;
  handCountAfter?: never;
  publicStableKey: `trick-clear:${number}:${number}`;
  leadSeat: 0 | 1 | 2 | 3; // next trick leader
}>;

type PublicFinishEvent = PublicActionEventBase & Readonly<{
  kind: "finish";
  publicCardIds?: never;
  handCountBefore?: never;
  handCountAfter?: never;
  finishPosition: number;
  remainingHandCount: number;
  finishReason: "hand-empty" | "round-settlement";
  publicStableKey: `finish:${number}:${"hand-empty" | "round-settlement"}`;
}>;

type PublicTributeEvent = PublicActionEventBase & Readonly<{
  kind: "tribute" | "return";
  publicCardIds: readonly [string] | readonly []; // one only when the card is publicly revealed
  fromSeat: 0 | 1 | 2 | 3;
  toSeat: 0 | 1 | 2 | 3;
  handCountChanges: Readonly<Record<0 | 1 | 2 | 3, number>>;
  publicStableKey: `tribute:${string}` | `return:${string}`;
}>;

type PublicAntiTributeEvent = PublicActionEventBase & Readonly<{
  kind: "anti-tribute";
  publicCardIds?: never;
  handCountBefore?: never;
  handCountAfter?: never;
  reasonCode: "anti-tribute";
  publicStableKey: `anti-tribute:${string}`;
}>;

type PublicActionEvent =
  | PublicPlayEvent
  | PublicPassEvent
  | PublicTrickClearEvent
  | PublicFinishEvent
  | PublicTributeEvent
  | PublicAntiTributeEvent;
```

Kind validation is mandatory, not documentary:

| kind | required | prohibited | state meaning |
|---|---|---|---|
| `play` | after normalization, non-empty sorted `publicCardIds`, pattern/group, before/after counts, stable key | hidden cards, private runtime | successful `playCards` commit |
| `pass` | equal before/after count, `pass:v2` | `publicCardIds`, pattern/group | successful `passTurn` commit |
| `trick-clear` | ended `trickIndex`, next `leadSeat`, stable key | card ids, hand counts | all required passes committed and trick reset |
| `finish` | `finishPosition`, `remainingHandCount`, reason | card ids, handCountBefore/After | append finish order only; play already changed hand count |
| `tribute`/`return` | from/to, public card only if actually revealed, signed count changes | unshown selection, hidden hand | committed public tribute transfer |
| `anti-tribute` | stable reason code and opening-tribute phase transition | card ids, hand counts, transfer fields | committed public anti-tribute state transition |

`publicCardIds` 中的 card id 只能来自已公开 play 或已公开贡还牌；牌张排序使用 `Card.id` 字典序，seat/number 使用 JSON number，不用本地化字符串。

### 2.3 Canonical event hash

实现文件：`src/game/publicEventHash.ts`。

```ts
type RemovePayloadHash<T> = T extends unknown ? Omit<T, "publicPayloadHash"> : never;
type PublicActionEventDraft = RemovePayloadHash<PublicActionEvent>;

export function assertPublicActionEventDraft(draft: unknown): asserts draft is PublicActionEventDraft;
export function finalizePublicActionEvent(draft: PublicActionEventDraft): PublicActionEvent;
export function assertFinalizedPublicActionEvent(event: unknown): asserts event is PublicActionEvent;
export function canonicalPublicEventBytes(event: PublicActionEventDraft): Uint8Array;
export function hashPublicActionEvent(event: PublicActionEventDraft): string; // lowercase SHA-256 hex
export function verifyPublicActionEventHash(event: PublicActionEvent): true;
```

Canonical bytes规则固定为：

1. 只取 event contract 中允许的字段；顶层字段按 schema 字段表顺序输出，嵌套 object key 按 Unicode code-point 升序。
2. `undefined` 字段省略；禁止 `NaN`、`Infinity`、函数、symbol、Date 和对象引用。
3. `publicCardIds` 升序；`handCountChanges` 固定按 seat `0,1,2,3` 输出；`publicStableKey` 和 schemaVersion 进入 hash。
4. 字符串采用 UTF-8、无 BOM；number 使用 JSON 标准十进制表示，不使用 `toFixed` 或本地化格式。
5. SHA-256 输出 64 位小写 hex；hash 本身不递归包含 `publicPayloadHash`，计算时先排除该字段再由 `finalizePublicActionEvent` 写回。
6. 不包含 duration、stack trace、目录、worker、runtime、hidden hand、seed-derived private state。

room 只能把 draft 交给 `finalizePublicActionEvent`；ledger 只接受先通过 `assertFinalizedPublicActionEvent` 和 `verifyPublicActionEventHash` 的 finalized event。不得手工填写 placeholder hash、不得把未校验 draft 直接交给 ledger、不得构造包含自身 hash 的输入。Task 2 必须使用 known SHA-256 vector，并证明不同对象插入顺序、不同 card 输入顺序和重复 `publicPayloadHash` 写入不会改变 canonical hash。

**跨环境实现与 normalization：** `src/game/publicEventHash.ts` 必须同时可被 browser production bundle、Node/Vitest 和 benchmark/replay scripts 同步调用。实现者先检查现有正式跨环境同步 hash 适配；若不存在，不得直接导入 Node-only `crypto`，而采用无外部运行时依赖的纯 TypeScript 同步 SHA-256。Task 2 focused gate 之外，`npm run build` 必须验证 browser bundle 可加载该模块，Node 测试和 replay script 必须使用相同 known vector；不得把 room API 改成异步 hash。

`finalizePublicActionEvent` 是唯一 normalization 入口：

1. 复制 draft 及其嵌套数组/record，不原地修改调用者；
2. 对 `publicCardIds` 做字典序排序并拒绝重复 CardId；
3. 对 `handCountChanges` 等 seat-keyed map 按固定 seat `0,1,2,3` 规范化；
4. 运行 `assertPublicActionEventDraft` 校验 normalized draft；
5. 对 normalized draft 计算 hash，并返回不暴露可变数组/对象的 immutable finalized event；
6. `HardPublicLedger` 只接受通过 `assertFinalizedPublicActionEvent` 且 `verifyPublicActionEventHash` 成功的事件。

Task 2 必须证明输入数组/嵌套 map 的插入顺序、调用者后续 mutation 和重复 CardId 都不能改变 finalized event 或 hash。

### 2.4 HardPublicLedger

实现文件：`src/game/publicLedger.ts`。

```ts
type HardPublicLedger = Readonly<{
  schemaVersion: "d2-public-ledger-v1";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  nextEventIndex: number;
  lastAppliedEventIndex: number; // 初始为 -1
  seenEventHashes: Readonly<Record<number, string>>;
  playedCardIds: readonly string[]; // 仅 play 事件；长期精确累计
  revealedTransferEvents: readonly Readonly<{
    eventIndex: number;
    kind: "tribute" | "return";
    cardId?: string;
    fromSeat: 0 | 1 | 2 | 3;
    toSeat: 0 | 1 | 2 | 3;
  }>[]; // tribute/return 不写 playedCardIds
  handCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
  currentTrick: Readonly<{
    trickIndex: number;
    leadSeat: 0 | 1 | 2 | 3;
    lastPlaySeat?: 0 | 1 | 2 | 3;
    lastPlayStableKey?: string;
    passSeats: readonly (0 | 1 | 2 | 3)[];
  }>;
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  publicTributeEvents: readonly string[]; // stable phase/reason summaries
  recentActionSummaries: readonly Readonly<Record<string, string | number | boolean>>[];
}>;

type ApplyPublicEventErrorCode =
  | "EVENT_INDEX_GAP"
  | "EVENT_INDEX_CONFLICT"
  | "IDENTITY_MISMATCH"
  | "EVENT_HASH_INVALID"
  | "PUBLIC_CARD_DUPLICATE"
  | "HAND_COUNT_INVALID"
  | "FINISH_ORDER_INVALID"
  | "TRICK_STATE_INVALID"
  | "TRIBUTE_ORDER_INVALID"
  | "EVENT_SCHEMA_INVALID";

type ApplyPublicEventResult =
  | { ok: true; kind: "applied" | "idempotent"; ledger: HardPublicLedger }
  | { ok: false; error: ApplyPublicEventErrorCode; ledger: HardPublicLedger };

export function createInitialPublicLedger(input: {
  identity: PublicGameIdentity;
  initialHandCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
  openingLeader: 0 | 1 | 2 | 3;
  initialTrickIndex: number;
  openingTributePublicState: Readonly<Record<string, string | number | boolean | null>>;
}): HardPublicLedger;
export function applyPublicEvent(ledger: HardPublicLedger, event: PublicActionEvent): ApplyPublicEventResult;
export function resetPublicLedger(input: {
  identity: PublicGameIdentity;
  initialHandCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
  openingLeader: 0 | 1 | 2 | 3;
  initialTrickIndex: number;
  openingTributePublicState: Readonly<Record<string, string | number | boolean | null>>;
}): HardPublicLedger;
export function canonicalPublicLedgerHash(ledger: HardPublicLedger): string;
```

`recentActionSummaries` 只保留固定 16 个 event summary（或等价 4 个 trick），但 `playedCardIds`、`revealedTransferEvents`、`handCounts`、`finishOrder` 和 `publicTributeEvents` 永久精确保留。`playedCardIds` 只由 play 写入；tribute/return card 只写入 `revealedTransferEvents`，因此公开贡牌之后仍可合法 play。所有返回 ledger 都是新对象和新数组；失败返回原 ledger 引用/字节不变。

### 2.5 Event application invariants

`applyPublicEvent` 的精确顺序：

1. 校验 schema、canonical hash、finite/integer 字段和 game/round/hand identity。
2. `eventIndex === ledger.nextEventIndex` 时准备新状态；若 `eventIndex < nextEventIndex`，只有 `seenEventHashes[eventIndex] === event.publicPayloadHash` 才返回 `idempotent`；同 index 不同 hash 返回 `EVENT_INDEX_CONFLICT`；跳号返回 `EVENT_INDEX_GAP`。
3. `play` 的公开牌不得出现在 `playedCardIds`，`handCountAfter = handCountBefore - publicCardIds.length`，不得为负；同一 CardId 第二次 play 失败。tribute/return card 不参与该检查，只按 `revealedTransferEvents` 的 transfer identity 去重；同一公开 transfer event 重放幂等，不同 from/to/kind/card 冲突。
4. finish order 只能 append 未出现 seat；不能回退、重复或跳过由 room 提供的顺序。finish 只写 `finishOrder`，不修改 `handCounts`；`hand-empty` 要求 `remainingHandCount=0`，`round-settlement` 允许大于 0。trick-clear 必须引用当前 trick，并将 pass seats 清空、trickIndex 加一、leader 与事件一致。
5. tribute/return 必须按 opening tribute phase 的合法顺序应用；transfer card 不写 `playedCardIds`；anti-tribute 不含 card、不改 hand counts，只推进稳定 phase/reason 摘要。
6. 成功后复制 ledger、更新 seen hash、next/last index、长期计数和 recent window；任何检查失败都返回稳定 error code，不静默修正。

### 2.5.1 Current-trick event conversion

- `play` 只能应用到与 ledger `currentTrick.trickIndex` 相同的 `trickIndex`；成功后设置 `lastPlaySeat=event.seat`、`lastPlayStableKey=event.publicStableKey`，并清空 `passSeats`。
- `pass` 只能应用于存在 `lastPlaySeat` 的当前 trick；同一 seat 不得重复 pass。成功后追加该 seat 到 `passSeats`，不修改 `lastPlaySeat` 或 `lastPlayStableKey`。
- `trick-clear` 必须引用当前 trick 和已结束的 trick index；成功后清空 `lastPlaySeat`、`lastPlayStableKey`、`passSeats`，将 `trickIndex` 加一并设置新 `leadSeat`。
- `RoomTransitionDraft` 与 temporary ledger 必须逐字段 cross-check 上述 `currentTrick` 结果；任一不一致在原 room assignment 前失败。

### 2.6 RoomState 内部字段与 PublicRoom 隔离

修改 `src/game/room.ts` 的 `RoomState` 增加：

```ts
publicIdentity: PublicGameIdentity;
publicLedger: HardPublicLedger;
publicEvents: PublicActionEvent[];
```

`PublicRoom` 类型改为继续 `Omit` 这三个字段；`getPublicRoom` 解构时显式丢弃它们。它们仅供 room/D2a replay adapter 读取，不序列化到网络响应、`AiObservation`、AI runtime 或 D2 sidecar。现有 `playHistory`/`replayHands` 保持兼容，D2a 不删除旧 UI replay 数据。

---

## 3. Implementation dependency graph

```text
Task 1 contracts/identity
        ↓
Task 2 canonical hash
        ↓
Task 3 pure HardPublicLedger
        ↓
Task 4 play/pass room commit
        ↓
Task 5 trick-clear/finish room commit
        ↓
Task 6 tribute + reset
        ↓
Task 7 replay round-trip + benchmark adapter
        ↓
Task 8 privacy/byte-lock/full regression
```

Task 4–6 必须依赖同一个 `commitPublicTransition`；不得让 play/pass/tribute 各自维护 index 或 hash 逻辑。

---

## 4. TDD work packages

### Task 1: Identity 与 event contracts

**Files:**
- Create: `src/game/publicEvent.ts`
- Create: `tests/ai/publicEvent.test.ts`
- Create: `tests/game/publicEventIdentity.test.ts`

**Interfaces:**
- Consumes: explicit `PublicGameIdentity` fixture input, `Seat` and `CardGroup` from `src/game/room.ts`/`src/engine/groups.ts`; it must not consume `RoomState.id` as canonical identity。
- Produces: `PublicGameIdentity`, the discriminated `PublicActionEvent` union, `assertPublicActionEventDraft`, `assertFinalizedPublicActionEvent`, and `publicStableKey` builders for later tasks。

- [ ] **Step 1: Write RED tests for identity and kind matrix.**

```ts
it("does not derive canonical identity from transport-room creation order", () => {
  const first = explicitIdentity("scenario:seed:1");
  const afterUnrelatedRoom = explicitIdentity("scenario:seed:1");
  expect(buildPublicGameIdentity(first.gameId, 0, 0, "benchmark-scenario")).toEqual({
    schemaVersion: "d2-public-game-identity-v1",
    gameId: first.gameId,
    roundIdentity: `${first.gameId}:round:0`,
    handIdentity: `${first.gameId}:round:0:hand:0`,
    roundSequence: 0,
    handSequence: 0,
    source: "benchmark-scenario",
  });
  expect(afterUnrelatedRoom).toEqual(first);
});

it("rejects a pass carrying public cards and a play without counts", () => {
  expect(() => assertPublicActionEventDraft(invalidPassWithCards())).toThrow("EVENT_SCHEMA_INVALID");
  expect(() => assertPublicActionEventDraft(invalidPlayWithoutCounts())).toThrow("EVENT_SCHEMA_INVALID");
});

it("separates draft validation from finalized-event validation", () => {
  const draft = makePlayDraft();
  expect(() => assertPublicActionEventDraft(draft)).not.toThrow();
  expect(() => assertFinalizedPublicActionEvent(draft)).toThrow("EVENT_HASH_MISSING");
});
```

- [ ] **Step 2: Run RED and verify failure is missing contract/validator, not fixture failure.**

Run:

```bash
npx vitest run tests/ai/publicEvent.test.ts tests/game/publicEventIdentity.test.ts --testTimeout=120000 --reporter=verbose
```

Expected: FAIL because `publicEvent.ts`, `buildPublicGameIdentity`, `assertPublicActionEventDraft` and `assertFinalizedPublicActionEvent` do not exist.

- [ ] **Step 3: Implement the minimal discriminated union and deterministic identity helpers.**

Implement `buildPublicGameIdentity(gameId, roundSequence, handSequence, source)` with integer validation; implement `assertPublicActionEventDraft` to enforce the draft matrix in §2.2 and reject forbidden/unknown kind fields, and implement `assertFinalizedPublicActionEvent` to require a 64-hex hash that verifies against canonical bytes. `createRoom` integration is deferred to Task 4 so Task 1 remains a pure contract boundary.

- [ ] **Step 4: Re-run focused tests and add all seven kind fixtures.**

Run the same command; expected PASS. Add fixtures for play, pass, trick-clear, finish, tribute, return, and the independent anti-tribute event. The anti-tribute fixture must omit public card ids, hand-count fields, and transfer fields while carrying its stable reason code.

- [ ] **Step 5: Commit the contract boundary.**

```bash
git add src/game/publicEvent.ts tests/ai/publicEvent.test.ts tests/game/publicEventIdentity.test.ts
git commit -m "d2a: define public event contracts and identity"
```

### Task 2: Canonical public event hash

**Files:**
- Create: `src/game/publicEventHash.ts`
- Create: `tests/ai/publicEventHash.test.ts`

**Interfaces:**
- Consumes: `PublicActionEvent`, `PublicActionEventDraft`, `assertPublicActionEventDraft` and `assertFinalizedPublicActionEvent` from Task 1。
- Produces: `canonicalPublicEventBytes`, `hashPublicActionEvent`, `finalizePublicActionEvent`, `assertFinalizedPublicActionEvent`, `verifyPublicActionEventHash`。

- [ ] **Step 1: Write RED tests for canonicalization.**

```ts
it("is invariant to object insertion and card input order", () => {
  const left = makePlayEvent({ publicCardIds: ["S3-2", "S3-1"] });
  const right = makePlayEventWithDifferentInsertionOrder({ publicCardIds: ["S3-1", "S3-2"] });
  expect(hashPublicActionEvent(left)).toBe(hashPublicActionEvent(right));
});

it("excludes duration, stack, path and private runtime keys", () => {
  expect(() => hashPublicActionEvent(eventWithForbiddenKey("hands"))).toThrow("EVENT_SCHEMA_INVALID");
});

it("finalizes a draft and rejects placeholder or self-referential hashes", () => {
  const draft = makePlayDraft();
  const event = finalizePublicActionEvent(draft);
  expect(event.publicPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  expect(() => finalizePublicActionEvent({ ...draft, publicPayloadHash: "placeholder" } as never)).toThrow("EVENT_SCHEMA_INVALID");
  expect(() => assertFinalizedPublicActionEvent(event)).not.toThrow();
  expect(verifyPublicActionEventHash(event)).toBe(true);
});

it("normalizes without mutating caller arrays and rejects duplicate cards", () => {
  const publicCardIds = ["S3-2", "S3-1"];
  const event = finalizePublicActionEvent(makePlayDraft({ publicCardIds }));
  expect(event.publicCardIds).toEqual(["S3-1", "S3-2"]);
  expect(publicCardIds).toEqual(["S3-2", "S3-1"]);
  expect(() => finalizePublicActionEvent(makePlayDraft({ publicCardIds: ["S3-1", "S3-1"] }))).toThrow("PUBLIC_CARD_DUPLICATE");
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicEventHash.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because the hash module is absent.

- [ ] **Step 3: Implement canonical bytes and SHA-256.**

Implement the cross-environment synchronous UTF-8 SHA-256 adapter selected in §2.3. Normalize by deep-copying the draft, sorting `publicCardIds`, canonicalizing seat-keyed maps, rejecting duplicate cards, validating the normalized draft, removing `publicPayloadHash` before hashing, then writing the lowercase 64-hex digest into a frozen finalized event. `assertFinalizedPublicActionEvent` and `verifyPublicActionEventHash` must reject any mutation or hash mismatch.

- [ ] **Step 4: Verify fixed vectors and mutation rejection.**

Run the focused test; expected PASS for known SHA-256 vector, browser/Node/replay compatibility, undefined omission, numeric normalization, card/seat ordering, caller immutability, duplicate-card rejection and hash mismatch rejection. Then run `npm run build` and the replay script's fixed-vector check; both must load the same synchronous hash implementation.

- [ ] **Step 5: Commit.**

```bash
git add src/game/publicEventHash.ts tests/ai/publicEventHash.test.ts
git commit -m "d2a: add canonical public event hashing"
```

### Task 3: Pure HardPublicLedger

**Files:**
- Create: `src/game/publicLedger.ts`
- Create: `tests/ai/publicLedger.test.ts`

**Interfaces:**
- Consumes: `PublicGameIdentity`, finalized `PublicActionEvent`, `assertFinalizedPublicActionEvent` and `verifyPublicActionEventHash`。
- Produces: `createInitialPublicLedger`, `resetPublicLedger`, `applyPublicEvent`, `canonicalPublicLedgerHash`, `ApplyPublicEventResult`。

- [ ] **Step 1: Write RED tests for all ledger invariants.**

The test table must include: event 0 success; event 0 same hash idempotence; same index different hash conflict; gap; identity mismatch; unfinalized/mismatched-hash rejection; duplicate play card; tribute/return transfer duplicate; a publicly transferred tribute card later played successfully; negative/count increase; play current-trick update; pass requires an existing last play and rejects duplicate seat; trick-clear clears last play/pass seats and advances trick; finish append/repeat without hand-count mutation; illegal trick clear; illegal tribute order; anti-tribute with no card/count change; and input immutability.

```ts
const before = structuredClone(ledger);
const result = applyPublicEvent(ledger, badEvent);
expect(result).toMatchObject({ ok: false, error: "PUBLIC_CARD_DUPLICATE" });
expect(ledger).toEqual(before);
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicLedger.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because the pure ledger module is absent.

- [ ] **Step 3: Implement initial/reset and copy-on-write application.**

Implement the exact validation order in §2.5. Reject any draft, missing hash or hash mismatch before event-index/state checks. Use fresh arrays/records on success; return the original ledger on failure. Keep play ids and revealed transfer records as separate collections. Implement a deterministic 16-summary recent window while retaining exact long-term card/count/finish/transfer state.

- [ ] **Step 4: Run focused ledger tests.**

Run the same command; expected PASS. Add property-style cases that permute event input ordering only when event indexes remain sequential; any non-sequential application must fail.

- [ ] **Step 5: Commit.**

```bash
git add src/game/publicLedger.ts tests/ai/publicLedger.test.ts
git commit -m "d2a: implement copy-on-write public ledger"
```

### Task 4: Room play/pass event adapter

**Files:**
- Modify: `src/game/room.ts:createRoom`, `playCards`, `passTurn`, `getPublicRoom`
- Create: `tests/game/publicEventRoomAdapter.test.ts`
- Modify: `tests/game/room.test.ts` only to add assertions for internal event/ledger counts; do not change existing behavior assertions。

**Interfaces:**
- Consumes: `applyPublicEvent` and event builders from Tasks 1–3。
- Produces: internal `publicIdentity`, `publicLedger`, `publicEvents` and one room-local `commitPublicTransition` using `RoomTransitionDraft`, `assertPublicActionEventDraft` and `finalizePublicActionEvent`, reused by Tasks 5–6。

- [ ] **Step 1: Write RED tests for play/pass authority and atomicity.**

```ts
it("appends a finalized play event only after playCards commits", () => {
  const room = createRoom({ publicIdentity: fixedPublicIdentity("d2a:play-pass:1"), rank: "10", seed: 1 });
  const id = room.hands[0][0]!.id;
  playCards(room, 0, [id]);
  expect(room.publicEvents.map((event) => event.kind)).toEqual(["play"]);
  expect(room.publicLedger.lastAppliedEventIndex).toBe(0);
});

it("cross-checks play/pass current-trick transitions", () => {
  const room = roomWithOneLeadAndThreeLivePasses({ publicIdentity: fixedPublicIdentity("d2a:trick:1") });
  playCards(room, 0, [room.hands[0][0]!.id]);
  expect(room.publicLedger.currentTrick.lastPlaySeat).toBe(0);
  passTurn(room, 1);
  expect(room.publicLedger.currentTrick.lastPlaySeat).toBe(0);
  expect(room.publicLedger.currentTrick.passSeats).toEqual([1]);
});

it("invalid play leaves room, event log and ledger unchanged", () => {
  const room = createRoom({ publicIdentity: fixedPublicIdentity("d2a:invalid-play:1"), rank: "10", seed: 1 });
  const before = structuredClone({ room: publicRoomMutationSnapshot(room), events: room.publicEvents, ledger: room.publicLedger });
  expect(() => playCards(room, 0, ["not-a-card"])).toThrow();
  expect({ room: publicRoomMutationSnapshot(room), events: room.publicEvents, ledger: room.publicLedger }).toEqual(before);
});

it("ledger validation failure leaves every mutable room field byte-identical", () => {
  const room = roomWithInjectedLedgerFailure();
  const before = structuredClone({ hands: room.hands, trick: room.trick, currentTurn: room.currentTurn, leaderSeat: room.leaderSeat, playHistory: room.playHistory, finishOrder: room.finishOrder, openingTribute: room.openingTribute, settlement: room.settlement, status: room.status, events: room.publicEvents, ledger: room.publicLedger });
  expect(() => commitTransitionThatProducesLedgerConflict(room)).toThrow("EVENT_INDEX_CONFLICT");
  expect({ hands: room.hands, trick: room.trick, currentTurn: room.currentTurn, leaderSeat: room.leaderSeat, playHistory: room.playHistory, finishOrder: room.finishOrder, openingTribute: room.openingTribute, settlement: room.settlement, status: room.status, events: room.publicEvents, ledger: room.publicLedger }).toEqual(before);
});

it("does not alias nested mutable room state into a transition draft", () => {
  const room = createRoom({ publicIdentity: fixedPublicIdentity("d2a:alias:1"), rank: "10", seed: 1 });
  room.openingTribute = fixtureOpeningTribute();
  room.settlement = fixtureSettlement();
  const draft = makeRoomTransitionDraft(room);
  draft.hands[0].pop();
  draft.initialHands[0].pop();
  draft.trick.passSeats.push(1);
  draft.trick.plays.push({ seat: 1, action: "pass" });
  draft.playHistory.push({ seat: 1, action: "pass" });
  draft.finishOrder.push(1);
  if (draft.openingTribute) draft.openingTribute.activeSeat = 1;
  if (draft.settlement) draft.settlement.levelStep += 1;
  draft.actionLog.push("draft-only");
  expect(room.hands[0]).not.toEqual(draft.hands[0]);
  expect(room.initialHands[0]).not.toEqual(draft.initialHands[0]);
  expect(room.trick.passSeats).toEqual([]);
  expect(room.trick.plays).toEqual([]);
  expect(room.playHistory).toEqual([]);
  expect(room.finishOrder).toEqual([]);
  expect(room.actionLog).not.toContain("draft-only");
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/game/publicEventRoomAdapter.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because room has no public ledger/event log.

- [ ] **Step 3: Add internal fields without changing PublicRoom.**

Initialize explicit `PublicGameIdentity`/ledger/events in `createRoom`; make `publicIdentity` required and reject missing identity before ledger creation; omit ledger/events/identity in `PublicRoom` and `getPublicRoom`. Add a private `commitPublicTransition(room, draft: RoomTransitionDraft, eventDrafts)` that receives a complete deep-copied state draft, finalizes every event, applies all finalized events to a temporary ledger, cross-checks draft counts/trick/finish state against that ledger, then assigns room fields, ledger, and event log together. `RoomTransportId` is never passed into the canonical event builder.

- [ ] **Step 4: Refactor playCards/passTurn to use the transition commit.**

Preserve all existing validation and `TrickPlay`/`playHistory` updates. Construct `PublicActionEventDraft` for play with unsorted caller cards allowed (finalize performs copy/sort/dedupe), matching trick index, and before/after counts; construct pass with `pass:v2` and equal counts. Call `assertPublicActionEventDraft` then `finalizePublicActionEvent`; never hand-fill `publicPayloadHash`. A failed finalize, cross-check or `applyPublicEvent` aborts before any room field is assigned. Cross-check play/pass current-trick updates from §2.5.1.

- [ ] **Step 5: Run room and focused tests.**

Run:

```bash
npx vitest run tests/game/publicEventRoomAdapter.test.ts tests/game/room.test.ts --testTimeout=120000 --reporter=verbose
```

Expected: PASS; `getPublicRoom(room, 0)` must not contain `publicLedger`, `publicEvents`, `publicIdentity`, or D2 fields.

- [ ] **Step 6: Commit.**

```bash
git add src/game/room.ts tests/game/publicEventRoomAdapter.test.ts tests/game/room.test.ts
git commit -m "d2a: source play and pass events from room commits"
```

### Task 5: Trick-clear and finish events

**Files:**
- Modify: `src/game/room.ts:passTurn`, `advanceAfterAction`, `finishRound`
- Modify: `tests/game/publicEventRoomAdapter.test.ts`
- Create: `tests/ai/publicLedgerTrickFinish.test.ts`

**Interfaces:**
- Consumes: `commitPublicTransition`, `resolveTrickWinnerSeat`, `passesNeededToReset`, `finishOrder`。
- Produces: ordered `trick-clear` and `finish` events with no hidden card payload。

- [ ] **Step 1: Write RED tests for event order.**

```ts
it("records pass before trick-clear", () => {
  const room = roomWithOneLeadAndThreeLivePasses();
  passTurn(room, 3); passTurn(room, 2); passTurn(room, 1);
  expect(room.publicEvents.map((event) => event.kind)).toEqual(["play", "pass", "pass", "pass", "trick-clear"]);
  expect(room.publicEvents.at(-1)?.eventIndex).toBe(4);
});

it("records a hand-empty finish without repeating the play hand-count change", () => {
  const room = roomWithSingleCardSeat(0);
  playCards(room, 0, [room.hands[0][0]!.id]);
  expect(room.publicEvents.slice(-2).map((event) => event.kind)).toEqual(["play", "finish"]);
  expect(room.publicEvents.at(-1)).toMatchObject({ finishPosition: 1, remainingHandCount: 0, finishReason: "hand-empty" });
  expect(room.publicLedger.handCounts[0]).toBe(0);
});

it("records round-settlement finishes with remaining cards and no hand-count mutation", () => {
  const room = roomAfterThreeFinishedSeatsWithCardsRemaining();
  expect(room.publicEvents.filter((event) => event.kind === "finish").every((event) => event.remainingHandCount! > 0)).toBe(true);
  expect(room.publicLedger.handCounts).toEqual(publicHandCounts(room));
});
```

- [ ] **Step 2: Run RED and verify missing event kinds/order.**

Run `npx vitest run tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventRoomAdapter.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because Task 4 emits only play/pass.

- [ ] **Step 3: Implement ordered trick-clear/finish draft events.**

When pass count reaches `passesNeededToReset`, append `trick-clear` after the pass and before committing the reset trick. When `finishOrder` changes, append one finish event per newly appended seat in exact order. A finish event contains `finishPosition`, `remainingHandCount` and `finishReason`, never handCountBefore/After; `play` alone owns the actual hand-count decrement. `finishReason` is `hand-empty` for a play that leaves count zero and `round-settlement` for seats appended by `finishRound`.

- [ ] **Step 4: Run focused room tests and existing room regression.**

Run the commands from Task 4 plus `npx vitest run tests/game/roomPlanningArchitecture.test.ts --testTimeout=120000`; expected PASS with no ActionGenerator/PlanManager behavior changes.

- [ ] **Step 5: Commit.**

```bash
git add src/game/room.ts tests/game/publicEventRoomAdapter.test.ts tests/ai/publicLedgerTrickFinish.test.ts
git commit -m "d2a: record trick clear and finish events"
```

### Task 6: Tribute events and new-hand reset

**Files:**
- Modify: `src/game/room.ts:advanceOpeningTribute`, `completeOpeningTribute`, `createRoom`
- Modify: `src/game/publicEvent.ts` (add `PublicAntiTributeEvent` and transfer draft fields)
- Modify: `src/game/publicLedger.ts` (transfer/anti-tribute validators)
- Create: `tests/ai/publicLedgerTributeReset.test.ts`
- Modify: `tests/game/room.test.ts` with event assertions for single and double tribute

**Interfaces:**
- Consumes: `PublicTributeEvent`, `resetPublicLedger`, room `openingTribute` phase and `settleRound` output。
- Produces: ordered `tribute`/`return` events, an independent `anti-tribute` event with no card/count fields, and a resettable hand-scoped ledger。

- [ ] **Step 1: Write RED tests for tribute visibility/order/reset.**

```ts
it("records only publicly revealed tribute and return cards", () => {
  const room = createRoom({ publicIdentity: fixedPublicIdentity("d2a:tribute:1"), rank: "K", seed: 1, pendingTributeItems: [{ payer: 3, receiver: 0 }] });
  advanceOpeningTribute(room);
  advanceOpeningTribute(room, 0, [weakestVisibleReturnCard(room, 0).id]);
  expect(room.publicEvents.map((event) => event.kind)).toEqual(["tribute", "return"]);
  expect(room.publicEvents.every((event) => !("hands" in event))).toBe(true);
});

it("records anti-tribute without card ids or hand-count changes", () => {
  const room = roomWithAntiTributeState();
  expect(room.publicEvents.at(-1)).toMatchObject({ kind: "anti-tribute", reasonCode: "anti-tribute" });
  expect(room.publicEvents.at(-1)).not.toHaveProperty("publicCardIds");
  expect(room.publicLedger.handCounts).toEqual(initialPublicHandCounts(room));
});

it("reset starts event index at zero and never reuses the prior ledger", () => {
  const room = createRoom({ publicIdentity: fixedPublicIdentity("d2a:reset:1"), rank: "10", seed: 1 });
  playCards(room, 0, [room.hands[0][0]!.id]);
  const next = resetPublicLedger({ identity: nextHandIdentity(room.publicIdentity), initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 }, openingLeader: 1, initialTrickIndex: 0, openingTributePublicState: { status: "none" } });
  expect(next.nextEventIndex).toBe(0);
  expect(next.playedCardIds).toEqual([]);
  expect(next.handIdentity).not.toBe(room.publicLedger.handIdentity);
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicLedgerTributeReset.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because tribute events/reset integration is absent.

- [ ] **Step 3: Implement tribute/return staged events.**

For every committed card transfer, create a `handCountChanges` map whose sum is zero. Include the card id only after room has selected and exposed it. `anti-tribute` is an independent event kind with no `publicCardIds`, no `handCountBefore/After`, no transfer fields, and stable `reasonCode="anti-tribute"`; it only advances the opening-tribute public phase. Apply all events for a multi-item transition in one `commitPublicTransition` call.

- [ ] **Step 4: Implement reset hook and current createRoom entry.**

`createRoom` calls `resetPublicLedger` with `roundSequence=0`, `handSequence=0`, opening leader and initial post-deal counts. A future in-place new hand must call the same reset function with `handSequence + 1`; no caller may copy the previous ledger. Existing UI `handleNextRoom` remains a new `createRoom` path.

- [ ] **Step 5: Run tribute/room focused tests and commit.**

Run `npx vitest run tests/ai/publicLedgerTributeReset.test.ts tests/game/room.test.ts --testTimeout=120000 --reporter=verbose`; expected PASS.

```bash
git add src/game/room.ts src/game/publicEvent.ts src/game/publicLedger.ts tests/ai/publicLedgerTributeReset.test.ts tests/game/room.test.ts
git commit -m "d2a: persist public tribute events and hand resets"
```

### Task 7: Replay round-trip and benchmark event-source adapter

**Files:**
- Create: `src/game/publicEventReplay.ts`
- Create: `tests/ai/publicLedgerReplay.test.ts`
- Create: `tests/benchmark/d2aPublicLedgerAdapter.ts`
- Create: `tests/benchmark/d2aPublicLedgerAdapter.test.ts`
- Do not modify: `tests/benchmark/contracts.ts`, `tests/benchmark/simulator.ts`, `tests/benchmark/reporting.ts`, `tests/benchmark/d1ReplayValidation.ts`, `scripts/replayD1TopKBenchmark.ts`

**Interfaces:**
- Consumes: `PublicActionEvent[]`, `HardPublicLedger`, `applyPublicEvent`, and an existing `RoomState` transition snapshot。
- Produces:

```ts
export function rebuildPublicLedger(input: {
  initialState: PublicLedgerReplayDocument["initialState"];
  events: readonly PublicActionEvent[];
  ledgerSnapshot?: HardPublicLedger;
}): { ledger: HardPublicLedger; ledgerHash: string };
export function assertPublicReplayRoundTrip(input: {
  initialState: PublicLedgerReplayDocument["initialState"];
  events: readonly PublicActionEvent[];
  expectedLedger: HardPublicLedger;
}): true;

export function readD2aLedgerForValidation(room: RoomState): {
  events: readonly PublicActionEvent[];
  ledger: HardPublicLedger;
};
```

- [ ] **Step 1: Write RED tests for event-sequence authority.**

```ts
it("rebuilds the exact ledger from event 0 and explicit initialState", () => {
  const original = roomAfterPlayPassTributeScenario();
  const rebuilt = rebuildPublicLedger({ initialState: original.publicLedgerInitialState, events: original.publicEvents });
  expect(rebuilt.ledgerHash).toBe(canonicalPublicLedgerHash(original.publicLedger));
  expect(rebuilt.ledger).toEqual(original.publicLedger);
});

it("rejects missing, reordered, conflicting or version-mismatched events", () => {
  expect(() => rebuildPublicLedger({ initialState, events: events.slice(1) })).toThrow("EVENT_INDEX_GAP");
  expect(() => rebuildPublicLedger({ initialState, events: swapAdjacent(events) })).toThrow("EVENT_INDEX_GAP");
  expect(() => rebuildPublicLedger({ initialState, events: [conflictingEvent, ...events.slice(1)] })).toThrow("EVENT_INDEX_CONFLICT");
  expect(() => rebuildPublicLedger({ events, initialState: undefined as never })).toThrow("REPLAY_INITIAL_STATE_MISSING");
});

it("does not treat an optional snapshot as the replay authority", () => {
  expect(() => rebuildPublicLedger({ initialState, events, ledgerSnapshot: tamperedSnapshot })).toThrow("LEDGER_SNAPSHOT_MISMATCH");
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicLedgerReplay.test.ts tests/benchmark/d2aPublicLedgerAdapter.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because no replay rebuild utility or D2a adapter exists.

- [ ] **Step 3: Implement event-sequence rebuild.**

Start from the required persisted `initialState` (identity, initial counts, opening leader, initial trick index and opening tribute public state), create a fresh ledger, sort nothing, apply exactly the supplied sequence in event-index order, reject gaps/conflicts/version mismatch, and compare canonical ledger hash. A `ledgerSnapshot` may be stored as a cache but is never authoritative; if snapshot and rebuilt hash differ, reject. No default initial state may be synthesized from a snapshot.

- [ ] **Step 4: Add the benchmark adapter without replacing legacy event fabrication.**

Implement `tests/benchmark/d2aPublicLedgerAdapter.ts` as a read-only adapter that returns `room.publicEvents` and `room.publicLedger` for D2a validation. Keep `BenchmarkObservation`, `tests/benchmark/simulator.ts:appendPublicEvent`, `tests/benchmark/reporting.ts:publicTraceHash`, D1 raw/replay schema and `tests/benchmark/d1ReplayValidation.ts` unchanged. Add a consistency test that runs the same room transition and proves the D2a event sequence and legacy D1 trace describe the same play/pass transitions; do not replace either hash. Formal replacement is deferred to D2g with a new benchmarkVersion, schema, configHash and artifact directory.

- [ ] **Step 5: Run replay focused tests and commit.**

Run:

```bash
npx vitest run tests/ai/publicLedgerReplay.test.ts tests/benchmark/d2aPublicLedgerAdapter.test.ts tests/benchmark/d1ReplayValidation.test.ts --testTimeout=120000 --reporter=verbose
```

Expected: PASS; the D2a adapter consumes room events without changing the legacy D1 simulator or allocating a second canonical event index.

```bash
git add src/game/publicEventReplay.ts tests/ai/publicLedgerReplay.test.ts tests/benchmark/d2aPublicLedgerAdapter.ts tests/benchmark/d2aPublicLedgerAdapter.test.ts
git commit -m "d2a: add public ledger replay adapter"
```

### Task 8: Privacy, byte-lock, dependency and complete regression gate

**Files:**
- Create: `tests/ai/publicLedgerPrivacy.test.ts`
- Create: `tests/game/publicRoomLedgerIsolation.test.ts`
- Modify: `tests/game/roomUnifiedAdapter.test.ts` only to assert observation/runtime unchanged
- Modify: `tests/game/roomPlanningArchitecture.test.ts` with source dependency assertions
- No production file changes beyond Tasks 1–7

**Interfaces:**
- Consumes: final `RoomState`, `PublicRoom`, `PublicActionEvent`, `HardPublicLedger`, replay serializer。
- Produces: privacy/shape/behavior lock evidence for D2a completion。

- [ ] **Step 1: Write RED privacy and byte-lock tests.**

```ts
it.each(["partnerHand", "opponentsHands", "hands", "deck", "initialHands", "hiddenInitialHand", "hiddenState", "ParticleBank", "hypotheticalHands"]) (
  "rejects forbidden key %s in event/ledger serialization", (key) => {
    expect(scanPublicLedgerAndEvents({ ...room.publicLedger, [key]: [] }, room.publicEvents)).toBe(false);
  },
);

it("keep-current observation/action/runtime remains byte-identical", () => {
  expect(decideAndRunWithoutLedgerFixture()).toEqual(d0FixtureExpectedResult());
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicLedgerPrivacy.test.ts tests/game/publicRoomLedgerIsolation.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL until scanner, PublicRoom omission and byte-lock assertions exist.

- [ ] **Step 3: Implement recursive privacy scanner and isolation assertions.**

Scan only serialized event/ledger/replay values; fail on forbidden keys anywhere, ensure `publicCardIds` are already public, and assert `JSON.stringify(getPublicRoom(room, 0))` has no `publicIdentity`, `publicLedger` or `publicEvents`. Do not remove existing UI `replayHands` behavior in this task.

- [ ] **Step 4: Run all D2a focused and regression gates.**

```bash
npx vitest run tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts tests/game/publicRoomLedgerIsolation.test.ts tests/benchmark/d2aPublicLedgerAdapter.test.ts --testTimeout=120000 --reporter=verbose
npm test
npm run test:benchmark
npm run test:simulation
npm run test:ai-performance
npm run build
npx tsc --noEmit
npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree E:/workspace/掼蛋游戏开发/.worktrees/d0-fixture-ai-benchmark --source-commit e2a20e18f8e5c0871db38ad69426262e43766ce1 --output tests/ai/fixtures/d0KeepCurrentCases.json --generator-version d0-fixture-v1 --check-only
git diff --check
```

The D0 fixture check must pass; the browser bundle must load the cross-environment hash module; no smoke, calibration or formal command is allowed. `npm run test:benchmark` must naturally exit and all existing benchmark files remain in their configured layer.

- [ ] **Step 5: Commit the D2a gate.**

```bash
git add tests/ai/publicLedgerPrivacy.test.ts tests/game/publicRoomLedgerIsolation.test.ts tests/game/roomUnifiedAdapter.test.ts tests/game/roomPlanningArchitecture.test.ts
git commit -m "d2a: lock public ledger privacy and behavior boundaries"
```

---

## 5. Room transition draft and atomic commit protocol

Every public mutation uses this exact protocol; Task 4–6 implementations must not bypass it:

```ts
type RoomTransitionDraft = Readonly<{
  players: RoomState["players"];
  hands: RoomState["hands"];
  initialHands: RoomState["initialHands"];
  trick: RoomState["trick"];
  currentTurn: RoomState["currentTurn"];
  leaderSeat: RoomState["leaderSeat"];
  currentTrickIndex: RoomState["currentTrickIndex"];
  playHistory: RoomState["playHistory"];
  finishOrder: RoomState["finishOrder"];
  openingTribute?: RoomState["openingTribute"];
  settlement?: RoomState["settlement"];
  aiPlans: RoomState["aiPlans"];
  aiRuntime: RoomState["aiRuntime"];
  status: RoomState["status"];
  actionLog: RoomState["actionLog"];
}>;

function commitPublicTransition(room: RoomState, draft: RoomTransitionDraft, eventDrafts: readonly PublicActionEventDraft[]): void {
  const finalizedEvents = eventDrafts.map((draftEvent) => finalizePublicActionEvent(draftEvent));
  finalizedEvents.forEach((event) => {
    assertFinalizedPublicActionEvent(event);
    verifyPublicActionEventHash(event);
  });
  const candidate = finalizedEvents.reduce((ledger, event) => {
    const applied = applyPublicEvent(ledger, event);
    if (!applied.ok) throw new Error(applied.error);
    return applied.ledger;
  }, room.publicLedger);

  crossCheckDraftAgainstLedger(draft, candidate, finalizedEvents);
  // No assignments before every draft, finalize, event and cross-check validates.
  assignDraftRoomFields(room, draft); // assigns every cloned RoomTransitionDraft field
  room.publicLedger = candidate;
  room.publicEvents = [...room.publicEvents, ...finalizedEvents];
}
```

`RoomTransitionDraft` 是完整深拷贝，不是只包含 public 字段的局部 patch。构造时必须复制 `players`、`hands` 及每个 seat 的 hand、`initialHands` 及每个 seat 的 hand、`trick` 及其 `passSeats`/`plays`/`lastPlay`、`playHistory`、`finishOrder`、`openingTribute`、`settlement`、`aiPlans`、`aiRuntime` 和 `actionLog`；任何嵌套数组或对象都不得与原 room alias。当前 `RoomState` 已核对存在 `actionLog`，因此它必须纳入测试；不得引用不存在的字段。任何 ledger/event 校验前都不得修改原 room 的这些字段或 `currentTurn`、`leaderSeat`、`currentTrickIndex`、`status`。完整顺序固定为：`action validation` → `deep-copy draft state transition` → `assertPublicActionEventDraft`/`finalizePublicActionEvent` → temporary ledger apply → `crossCheckDraftAgainstLedger` → 一次性 commit。`assignDraftRoomFields` 只执行不会抛错的确定性赋值；任一步失败，原 room、ledger 和 event log 字节不变。

The event source is therefore the room’s validated state transition, not a request, AI decision, observation, hidden hand, or benchmark callback. A request that fails `classifyPlay`, `canBeatPlay`, tribute validation or turn validation never allocates an event index.

---

## 6. Replay and reset contract

### 6.1 Replay document

The public replay payload contains:

```ts
type PublicLedgerReplayDocument = Readonly<{
  schemaVersion: "d2-public-replay-v1";
  initialState: Readonly<{
    identity: PublicGameIdentity;
    initialHandCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
    openingLeader: 0 | 1 | 2 | 3;
    initialTrickIndex: number;
    openingTributePublicState: Readonly<Record<string, string | number | boolean | null>>;
  }>;
  events: readonly PublicActionEvent[]; // authority, eventIndex 0..N-1
  ledgerSnapshot?: HardPublicLedger; // optional cache, never authority
  finalLedgerHash: string;
}>;
```

Recovery always runs `createInitialPublicLedger(initialState.identity, initialState.initialHandCounts, initialState.openingLeader, initialState.initialTrickIndex, initialState.openingTributePublicState)` followed by `applyPublicEvent` for every event. It then compares `canonicalPublicLedgerHash(rebuilt)` to `finalLedgerHash`; only after that, if `ledgerSnapshot` exists, it compares the snapshot hash and rejects mismatch. Missing `initialState`, duplicate/conflicting index, unknown schema or mismatch rejects recovery; no default initial data is synthesized from a snapshot.

### 6.2 Reset

`resetPublicLedger` is called in `createRoom` after deal/tribute initialization inputs are known and before any action can be accepted. It sets `nextEventIndex=0`, `lastAppliedEventIndex=-1`, clears `seenEventHashes`, `playedCardIds`, `revealedTransferEvents`, `finishOrder`, `publicTributeEvents` and recent window, initializes hand counts, trick index/leader, and binds the new `handIdentity`. No previous ledger object is mutated or reused. The current UI’s “next room” path naturally creates a new identity; a future in-place next-hand path must call `resetPublicLedger` explicitly.

---

## 7. D2a completion criteria

D2a is complete only when:

1. All seven event kinds (`play`, `pass`, `trick-clear`, `finish`, `tribute`, `return`, `anti-tribute`) validate their required/prohibited fields and canonical hashes.
2. event 0..N-1 is accepted; same index/hash is idempotent; conflicts/gaps fail closed.
3. Only finalized, hash-verified events reach the ledger; public card duplicates, invalid counts, finish regressions, trick transitions and tribute ordering fail closed.
4. Room play/pass/trick-clear/finish/tribute/return/anti-tribute events come only from successful room transitions and are committed atomically with ledger.
5. New room/reset starts a new hand identity and event index 0; prior ledger is not reused.
6. Replay event sequence rebuilds an identical canonical ledger hash.
7. Event/ledger/replay privacy scanner rejects all hidden-state keys and `PublicRoom` shape remains unchanged.
8. Legacy D1 public trace, hash, raw/replay schema, validator and P7.1 artifacts remain byte/validation compatible; D2a adapter consistency is additive only.
9. D0 fixture check-only, focused D2a tests, ordinary/benchmark/simulation/performance tests, build, TypeScript and diff-check pass.
10. No D2b/D2c/D2d/D2e/D2f/D2g code, treatment registration, smoke, calibration or formal run is present.

---

## 8. Plan self-review and explicit non-goals

- No task assumes five candidate plans; D2a does not inspect candidate plans at all.
- No wall-clock value controls event ordering, index allocation, normal completion or replay.
- No particle, likelihood, action reducer, rollout, team utility or plan-pruning module is created.
- There is one room ledger and one room event log; the additive D2a adapter consumes them, while legacy D1 observation-derived trace generation remains unchanged until D2g.
- `RoomState.id`/`nextRoomId` are transport-only; canonical replay identity is always explicit `PublicGameIdentity`.
- Tribute/return transfers are separate from `playedCardIds`; a revealed tribute card can later be played, while the same card cannot be played twice.
- Finish events append only `finishOrder`; they never repeat the play hand-count decrement.
- Replay requires `initialState`; an optional snapshot can only be checked after event replay.
- No event uses a hand-written placeholder hash, and no original room mutable field is assigned before draft/event/ledger validation.
- Event deduplication is index/hash based and atomic; no request-time append/rollback exists.
- `PublicActionEvent` contains no perspective-derived fields such as relation, forced defense or near-finish judgment; those belong to D2b derived evidence.
- `formalExecutionAllowed` remains `false` throughout; this plan does not authorize any experiment.
