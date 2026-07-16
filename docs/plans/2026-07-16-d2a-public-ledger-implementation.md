# D2a Public Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. 每个任务都必须先写 RED 测试、观察预期失败、完成最小实现、运行 focused 测试后再提交。

**Goal:** 在不改变 D0/D1 AI 行为和公共网络 shape 的前提下，为真实 room 建立可重放、可去重、可校验、隐私安全的 `PublicActionEvent` 与 `HardPublicLedger`。

**Architecture:** 事件契约、canonical hash 和 ledger 放在 `src/game` 的中立领域层，由 room 已成功提交的公开状态转换产生事件；AI belief 未来只读消费这些中立事件，不由 room 导入 `src/ai/belief`。room 将 ledger/event log 作为内部状态，`getPublicRoom` 明确排除它们；benchmark/replay 只读取 room 产生的事件，不再自行从 observation 拼装第二套事件。

**Tech Stack:** TypeScript 5.7、Vitest 2、现有 `src/game/room.ts`、`src/game/playRules.ts`、`src/game/settlement.ts`、Node `crypto`/项目内同步 SHA-256 适配、现有 D1 replay validator。

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

- `src/game/room.ts:createRoom({ rank, seed, pendingTributeItems })` 是当前唯一建局函数。它调用 `shuffledDeck(seed)` 分牌、`resolveOpeningTribute(...)` 决定贡还状态、`randomOpeningLeader(seed)` 决定首家，并返回 `RoomState`。
- 当前 `RoomState.id` 由模块级 `nextRoomId` 在 `createRoom` 中生成：`room-${nextRoomId++}`。它是当前运行内唯一 room identity；D2a 不另造时间/随机 identity。
- 当前新局没有 room 内原地切换函数。`src/server/api.ts:buildApi` 的 `POST /api/rooms` 调用 `createRoom`；`src/ui/App.tsx:handleCreateRoom` 和 `handleNextRoom` 通过 `createGameRoom` 创建新 room。因此 D2a 的现有 reset 入口是 `createRoom`；将来的同 room 新手必须显式调用同一个 `resetPublicLedger`，不能复用上一手 ledger。
- D2a 增加稳定内部字段：`gameId = RoomState.id`、`roundIdentity = \`${gameId}:round:0\``、`handIdentity = \`${roundIdentity}:hand:0\``。现有 `id` 不改名、不改变 API 返回；replay 保存这三个值。若未来在同一 room 开新手，`handSequence` 只做整数递增并组成 `handIdentity`，不使用时钟或随机数。

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
- benchmark 当前在 `tests/benchmark/simulator.ts:appendPublicEvent` 中从 `createBenchmarkObservation(room, seat)` 拼装 `PublicSimulationEvent`，并由 `tests/benchmark/reporting.ts:publicTraceHash`/`finalPublicStateHash` 做 hash；这不是 D2a 的权威事件源。实现 D2a 时必须改为读取 room 的 `publicEvents`，删除该独立事件生成路径，但不改变 action、统计或 seed。
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

### 2.1 Identity

```ts
type PublicIdentity = Readonly<{
  gameId: string;             // RoomState.id，已存在且 replay 保存
  roundIdentity: string;      // `${gameId}:round:${roundSequence}`
  handIdentity: string;       // `${roundIdentity}:hand:${handSequence}`
  roundSequence: number;      // non-negative integer
  handSequence: number;       // non-negative integer
}>;
```

创建时 `roundSequence=0`、`handSequence=0`、`eventIndex=0`。同一 identity 的 replay 必须恢复同一 event sequence；新 hand 只能由 `handSequence + 1` 产生，并同时清空当前 ledger。`eventIndex` 属于 hand，不跨 hand 复用。

### 2.2 PublicActionEvent

实现文件：`src/game/publicEvent.ts`。

```ts
type PublicActionEventBase = Readonly<{
  schemaVersion: "d2-public-event-v2";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  eventIndex: number;
  kind: "play" | "pass" | "trick-clear" | "finish" | "tribute" | "return";
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
  handCountBefore: number;
  handCountAfter: number;
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

type PublicActionEvent =
  | PublicPlayEvent
  | PublicPassEvent
  | PublicTrickClearEvent
  | PublicFinishEvent
  | PublicTributeEvent;
```

Kind validation is mandatory, not documentary:

| kind | required | prohibited | state meaning |
|---|---|---|---|
| `play` | non-empty sorted `publicCardIds`, pattern/group, before/after counts, stable key | hidden cards, private runtime | successful `playCards` commit |
| `pass` | equal before/after count, `pass:v2` | `publicCardIds`, pattern/group | successful `passTurn` commit |
| `trick-clear` | ended `trickIndex`, next `leadSeat`, stable key | card ids, hand counts | all required passes committed and trick reset |
| `finish` | seat, before/after count, reason | card ids | finish order changed after committed play/round settlement |
| `tribute`/`return` | from/to, public card only if actually revealed, signed count changes | unshown selection, hidden hand | committed public tribute transfer |

`publicCardIds` 中的 card id 只能来自已公开 play 或已公开贡还牌；牌张排序使用 `Card.id` 字典序，seat/number 使用 JSON number，不用本地化字符串。

### 2.3 Canonical event hash

实现文件：`src/game/publicEventHash.ts`。

```ts
export function canonicalPublicEventBytes(event: PublicActionEvent): Uint8Array;
export function hashPublicActionEvent(event: PublicActionEvent): string; // lowercase SHA-256 hex
export function verifyPublicActionEventHash(event: PublicActionEvent): true;
```

Canonical bytes规则固定为：

1. 只取 event contract 中允许的字段；顶层字段按 schema 字段表顺序输出，嵌套 object key 按 Unicode code-point 升序。
2. `undefined` 字段省略；禁止 `NaN`、`Infinity`、函数、symbol、Date 和对象引用。
3. `publicCardIds` 升序；`handCountChanges` 固定按 seat `0,1,2,3` 输出；`publicStableKey` 和 schemaVersion 进入 hash。
4. 字符串采用 UTF-8、无 BOM；number 使用 JSON 标准十进制表示，不使用 `toFixed` 或本地化格式。
5. SHA-256 输出 64 位小写 hex；hash 本身不递归包含 `publicPayloadHash`，计算时先排除该字段再写回。
6. 不包含 duration、stack trace、目录、worker、runtime、hidden hand、seed-derived private state。

Task 2 必须使用 known SHA-256 vector，并证明不同对象插入顺序、不同 card 输入顺序和重复 `publicPayloadHash` 写入不会改变 canonical hash。

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
  playedCardIds: readonly string[]; // 长期精确累计，不被 recent window 裁剪
  handCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
  currentTrick: Readonly<{
    trickIndex: number;
    leadSeat: 0 | 1 | 2 | 3;
    lastPlaySeat?: 0 | 1 | 2 | 3;
    lastPlayStableKey?: string;
    passSeats: readonly (0 | 1 | 2 | 3)[];
  }>;
  finishOrder: readonly (0 | 1 | 2 | 3)[];
  publicTributeEvents: readonly string[];
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
  identity: PublicIdentity;
  initialHandCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
  openingLeader: 0 | 1 | 2 | 3;
}): HardPublicLedger;
export function applyPublicEvent(ledger: HardPublicLedger, event: PublicActionEvent): ApplyPublicEventResult;
export function resetPublicLedger(input: {
  identity: PublicIdentity;
  initialHandCounts: Readonly<Record<0 | 1 | 2 | 3, number>>;
  openingLeader: 0 | 1 | 2 | 3;
}): HardPublicLedger;
export function canonicalPublicLedgerHash(ledger: HardPublicLedger): string;
```

`recentActionSummaries` 只保留固定 16 个 event summary（或等价 4 个 trick），但 `playedCardIds`、`handCounts`、`finishOrder` 和 `publicTributeEvents` 永久精确保留。所有返回 ledger 都是新对象和新数组；失败返回原 ledger 引用/字节不变。

### 2.5 Event application invariants

`applyPublicEvent` 的精确顺序：

1. 校验 schema、canonical hash、finite/integer 字段和 game/round/hand identity。
2. `eventIndex === ledger.nextEventIndex` 时准备新状态；若 `eventIndex < nextEventIndex`，只有 `seenEventHashes[eventIndex] === event.publicPayloadHash` 才返回 `idempotent`；同 index 不同 hash 返回 `EVENT_INDEX_CONFLICT`；跳号返回 `EVENT_INDEX_GAP`。
3. `play` 的公开牌不得重复，`handCountAfter = handCountBefore - publicCardIds.length`，不得为负；`pass` before 必须等于 after；tribute/return 的 count changes 总和必须为 0。
4. finish order 只能 append 未出现 seat；不能回退、重复或跳过由 room 提供的顺序。trick-clear 必须引用当前 trick，并将 pass seats 清空、trickIndex 加一、leader 与事件一致。
5. tribute/return 必须按 opening tribute phase 的合法顺序应用；未公开 card 不得写入 event。
6. 成功后复制 ledger、更新 seen hash、next/last index、长期计数和 recent window；任何检查失败都返回稳定 error code，不静默修正。

### 2.6 RoomState 内部字段与 PublicRoom 隔离

修改 `src/game/room.ts` 的 `RoomState` 增加：

```ts
publicIdentity: PublicIdentity;
publicLedger: HardPublicLedger;
publicEvents: PublicActionEvent[];
```

`PublicRoom` 类型改为继续 `Omit` 这三个字段；`getPublicRoom` 解构时显式丢弃它们。它们仅供 room/benchmark replay adapter 读取，不序列化到网络响应、`AiObservation`、AI runtime 或 D2 sidecar。现有 `playHistory`/`replayHands` 保持兼容，D2a 不删除旧 UI replay 数据。

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
- Consumes: `RoomState.id` from `createRoom`, `Seat` and `CardGroup` from `src/game/room.ts`/`src/engine/groups.ts`。
- Produces: `PublicIdentity`, the discriminated `PublicActionEvent` union, kind validator `assertPublicActionEvent`, and `publicStableKey` builders for later tasks。

- [ ] **Step 1: Write RED tests for identity and kind matrix.**

```ts
it("derives replay-stable identity without time/random fields", () => {
  const first = createRoom({ rank: "10", seed: 1 });
  expect(buildPublicIdentity(first.id, 0, 0)).toEqual({
    gameId: first.id,
    roundIdentity: `${first.id}:round:0`,
    handIdentity: `${first.id}:round:0:hand:0`,
    roundSequence: 0,
    handSequence: 0,
  });
});

it("rejects a pass carrying public cards and a play without counts", () => {
  expect(() => assertPublicActionEvent(invalidPassWithCards())).toThrow("EVENT_SCHEMA_INVALID");
  expect(() => assertPublicActionEvent(invalidPlayWithoutCounts())).toThrow("EVENT_SCHEMA_INVALID");
});
```

- [ ] **Step 2: Run RED and verify failure is missing contract/validator, not fixture failure.**

Run:

```bash
npx vitest run tests/ai/publicEvent.test.ts tests/game/publicEventIdentity.test.ts --testTimeout=120000 --reporter=verbose
```

Expected: FAIL because `publicEvent.ts` and `buildPublicIdentity`/`assertPublicActionEvent` do not exist.

- [ ] **Step 3: Implement the minimal discriminated union and deterministic identity helpers.**

Implement `buildPublicIdentity(gameId, roundSequence, handSequence)` with integer validation; implement `assertPublicActionEvent` to enforce the matrix in §2.2 and reject forbidden/unknown kind fields.

- [ ] **Step 4: Re-run focused tests and add all six kind fixtures.**

Run the same command; expected PASS. Add fixtures for play, pass, trick-clear, finish, tribute and return, including anti-tribute with an empty public card list.

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
- Consumes: `PublicActionEvent` and `assertPublicActionEvent` from Task 1。
- Produces: `canonicalPublicEventBytes`, `hashPublicActionEvent`, `verifyPublicActionEventHash`。

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
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicEventHash.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because the hash module is absent.

- [ ] **Step 3: Implement canonical bytes and SHA-256.**

Implement a synchronous UTF-8 SHA-256 adapter in `src/game/publicEventHash.ts` (or reuse an existing project-supported synchronous primitive without importing tests/benchmark). Remove `publicPayloadHash` before hashing, sort only the approved fields, then verify/write the lowercase 64-hex digest.

- [ ] **Step 4: Verify fixed vectors and mutation rejection.**

Run the focused test; expected PASS for known SHA-256 vector, undefined omission, numeric normalization, card/seat ordering, and hash mismatch rejection.

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
- Consumes: `PublicIdentity`, `PublicActionEvent`, `hashPublicActionEvent`。
- Produces: `createInitialPublicLedger`, `resetPublicLedger`, `applyPublicEvent`, `canonicalPublicLedgerHash`, `ApplyPublicEventResult`。

- [ ] **Step 1: Write RED tests for all ledger invariants.**

The test table must include: event 0 success; event 0 same hash idempotence; same index different hash conflict; gap; identity mismatch; duplicate public card; negative/count increase; finish append/repeat; illegal trick clear; illegal tribute order; and input immutability.

```ts
const before = structuredClone(ledger);
const result = applyPublicEvent(ledger, badEvent);
expect(result).toMatchObject({ ok: false, error: "PUBLIC_CARD_DUPLICATE" });
expect(ledger).toEqual(before);
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicLedger.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because the pure ledger module is absent.

- [ ] **Step 3: Implement initial/reset and copy-on-write application.**

Implement the exact validation order in §2.5. Use fresh arrays/records on success; return the original ledger on failure. Implement a deterministic 16-summary recent window while retaining exact long-term card/count/finish/tribute state.

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
- Produces: internal `publicIdentity`, `publicLedger`, `publicEvents` and one room-local `commitPublicTransition` used by Tasks 5–6。

- [ ] **Step 1: Write RED tests for play/pass authority and atomicity.**

```ts
it("appends a play event only after playCards commits", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const id = room.hands[0][0]!.id;
  playCards(room, 0, [id]);
  expect(room.publicEvents.map((event) => event.kind)).toEqual(["play"]);
  expect(room.publicLedger.lastAppliedEventIndex).toBe(0);
});

it("invalid play leaves room, event log and ledger unchanged", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  const before = structuredClone({ room: publicRoomMutationSnapshot(room), events: room.publicEvents, ledger: room.publicLedger });
  expect(() => playCards(room, 0, ["not-a-card"])).toThrow();
  expect({ room: publicRoomMutationSnapshot(room), events: room.publicEvents, ledger: room.publicLedger }).toEqual(before);
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/game/publicEventRoomAdapter.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because room has no public ledger/event log.

- [ ] **Step 3: Add internal fields without changing PublicRoom.**

Initialize identity/ledger/events in `createRoom`; omit them in `PublicRoom` and `getPublicRoom`. Add a private `commitPublicTransition` that receives a fully prepared next public-state draft and ordered events, applies all events to a temporary ledger, then assigns room fields, ledger, and event log together.

- [ ] **Step 4: Refactor playCards/passTurn to use the transition commit.**

Preserve all existing validation and `TrickPlay`/`playHistory` updates. Construct `play` with sorted card IDs and before/after counts; construct `pass` with `pass:v2` and equal counts. Do not call the event builder before action validation. A failed `applyPublicEvent` aborts before any room field is assigned.

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

it("records finish immediately after the committed final play", () => {
  const room = roomWithSingleCardSeat(0);
  playCards(room, 0, [room.hands[0][0]!.id]);
  expect(room.publicEvents.slice(-2).map((event) => event.kind)).toEqual(["play", "finish"]);
});
```

- [ ] **Step 2: Run RED and verify missing event kinds/order.**

Run `npx vitest run tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventRoomAdapter.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because Task 4 emits only play/pass.

- [ ] **Step 3: Implement ordered trick-clear/finish draft events.**

When pass count reaches `passesNeededToReset`, append `trick-clear` after the pass and before committing the reset trick. When `finishOrder` changes, append one finish event per newly appended seat in exact order. `finishReason` is `hand-empty` for a play that leaves count zero and `round-settlement` for seats appended by `finishRound`.

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
- Modify: `src/game/publicEvent.ts` and `src/game/publicLedger.ts` only if tribute validators need shared types
- Create: `tests/ai/publicLedgerTributeReset.test.ts`
- Modify: `tests/game/room.test.ts` with event assertions for single and double tribute

**Interfaces:**
- Consumes: `PublicTributeEvent`, `resetPublicLedger`, room `openingTribute` phase and `settleRound` output。
- Produces: ordered `tribute`/`return` events, explicit anti-tribute event with empty public card list, and a resettable hand-scoped ledger。

- [ ] **Step 1: Write RED tests for tribute visibility/order/reset.**

```ts
it("records only publicly revealed tribute and return cards", () => {
  const room = createRoom({ rank: "K", seed: 1, pendingTributeItems: [{ payer: 3, receiver: 0 }] });
  advanceOpeningTribute(room);
  advanceOpeningTribute(room, 0, [weakestVisibleReturnCard(room, 0).id]);
  expect(room.publicEvents.map((event) => event.kind)).toEqual(["tribute", "return"]);
  expect(room.publicEvents.every((event) => !("hands" in event))).toBe(true);
});

it("reset starts event index at zero and never reuses the prior ledger", () => {
  const room = createRoom({ rank: "10", seed: 1 });
  playCards(room, 0, [room.hands[0][0]!.id]);
  const next = resetPublicLedger({ identity: nextHandIdentity(room.publicIdentity), initialHandCounts: { 0: 27, 1: 27, 2: 27, 3: 27 }, openingLeader: 1 });
  expect(next.nextEventIndex).toBe(0);
  expect(next.playedCardIds).toEqual([]);
  expect(next.handIdentity).not.toBe(room.publicLedger.handIdentity);
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicLedgerTributeReset.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because tribute events/reset integration is absent.

- [ ] **Step 3: Implement tribute/return staged events.**

For every committed card transfer, create a `handCountChanges` map whose sum is zero. Include the card id only after room has selected and exposed it. `anti-tribute` uses an empty `publicCardIds` tuple and a stable reason key. Apply all events for a multi-item transition in one `commitPublicTransition` call.

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
- Create: `tests/benchmark/publicEventReplayAdapter.test.ts`
- Modify: `tests/benchmark/contracts.ts`
- Modify: `tests/benchmark/simulator.ts:appendPublicEvent` call site
- Modify: `tests/benchmark/d1ReplayValidation.ts`
- Modify: `scripts/replayD1TopKBenchmark.ts` only to consume the room event sequence/ledger rebuild result

**Interfaces:**
- Consumes: `PublicActionEvent[]`, `HardPublicLedger`, `applyPublicEvent`。
- Produces:

```ts
export function rebuildPublicLedger(input: {
  initialLedger: HardPublicLedger;
  events: readonly PublicActionEvent[];
}): { ledger: HardPublicLedger; ledgerHash: string };
export function assertPublicReplayRoundTrip(input: {
  events: readonly PublicActionEvent[];
  expectedLedger: HardPublicLedger;
}): true;
```

- [ ] **Step 1: Write RED tests for event-sequence authority.**

```ts
it("rebuilds the exact ledger from event 0", () => {
  const original = roomAfterPlayPassTributeScenario();
  const rebuilt = rebuildPublicLedger({ initialLedger: initialLedgerFor(original), events: original.publicEvents });
  expect(rebuilt.ledgerHash).toBe(canonicalPublicLedgerHash(original.publicLedger));
  expect(rebuilt.ledger).toEqual(original.publicLedger);
});

it("rejects missing, reordered, conflicting or version-mismatched events", () => {
  expect(() => rebuildPublicLedger({ initialLedger, events: events.slice(1) })).toThrow("EVENT_INDEX_GAP");
  expect(() => rebuildPublicLedger({ initialLedger, events: swapAdjacent(events) })).toThrow("EVENT_INDEX_GAP");
  expect(() => rebuildPublicLedger({ initialLedger, events: [conflictingEvent, ...events.slice(1)] })).toThrow("EVENT_INDEX_CONFLICT");
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/ai/publicLedgerReplay.test.ts tests/benchmark/publicEventReplayAdapter.test.ts --testTimeout=120000 --reporter=verbose`; expected FAIL because no replay rebuild utility exists and simulator still creates a second event stream.

- [ ] **Step 3: Implement event-sequence rebuild.**

Start from the persisted initial ledger, sort nothing, apply exactly the supplied sequence in event-index order, reject gaps/conflicts/version mismatch, and compare canonical ledger hash. A snapshot may be stored as a cache but is never authoritative; if snapshot and rebuilt hash differ, reject.

- [ ] **Step 4: Replace benchmark event fabrication.**

Change `tests/benchmark/simulator.ts` to copy `room.publicEvents` after each successful room transition and remove the `appendPublicEvent` path that derives events from `createBenchmarkObservation`. Keep `BenchmarkObservation` as the strategy whitelist; it is not an event source. Update replay contracts/validation to preserve `PublicActionEvent` schema, identity and `publicPayloadHash`.

- [ ] **Step 5: Run replay focused tests and commit.**

Run:

```bash
npx vitest run tests/ai/publicLedgerReplay.test.ts tests/benchmark/publicEventReplayAdapter.test.ts tests/benchmark/d1ReplayValidation.test.ts --testTimeout=120000 --reporter=verbose
```

Expected: PASS; the benchmark simulator consumes room events and no benchmark module allocates an event index.

```bash
git add src/game/publicEventReplay.ts tests/ai/publicLedgerReplay.test.ts tests/benchmark/publicEventReplayAdapter.test.ts tests/benchmark/contracts.ts tests/benchmark/simulator.ts tests/benchmark/d1ReplayValidation.ts scripts/replayD1TopKBenchmark.ts
git commit -m "d2a: make public event sequence the replay authority"
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
npx vitest run tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts tests/game/publicRoomLedgerIsolation.test.ts --testTimeout=120000 --reporter=verbose
npm test
npm run test:benchmark
npm run test:simulation
npm run test:ai-performance
npm run build
npx tsc --noEmit
npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree E:/workspace/掼蛋游戏开发/.worktrees/d0-fixture-ai-benchmark --source-commit e2a20e18f8e5c0871db38ad69426262e43766ce1 --output tests/ai/fixtures/d0KeepCurrentCases.json --generator-version d0-fixture-v1 --check-only
git diff --check
```

The D0 fixture check must pass; no smoke, calibration or formal command is allowed. `npm run test:benchmark` must naturally exit and all existing benchmark files remain in their configured layer.

- [ ] **Step 5: Commit the D2a gate.**

```bash
git add tests/ai/publicLedgerPrivacy.test.ts tests/game/publicRoomLedgerIsolation.test.ts tests/game/roomUnifiedAdapter.test.ts tests/game/roomPlanningArchitecture.test.ts
git commit -m "d2a: lock public ledger privacy and behavior boundaries"
```

---

## 5. Room transaction protocol

Every public mutation uses this exact protocol; Task 4–6 implementations must not bypass it:

```ts
function commitPublicTransition(room: RoomState, draft: PublicRoomDraft, events: readonly PublicActionEvent[]): void {
  const candidate = events.reduce((ledger, event) => {
    const applied = applyPublicEvent(ledger, event);
    if (!applied.ok) throw new Error(applied.error);
    return applied.ledger;
  }, room.publicLedger);

  // No assignments before every event validates.
  assignDraftRoomFields(room, draft);
  room.publicLedger = candidate;
  room.publicEvents = [...room.publicEvents, ...events];
}
```

`PublicRoomDraft` contains only public room fields touched by the action (`hands` counts are represented by already validated hand mutation, trick, current turn, leader, finish order, status, settlement, opening tribute, play history and action log). The implementation must construct it from copies before commit; `assignDraftRoomFields` performs plain deterministic assignments and cannot throw after validation. If any event or draft validation fails, the original room, ledger and event log remain byte-identical.

The event source is therefore the room’s validated state transition, not a request, AI decision, observation, hidden hand, or benchmark callback. A request that fails `classifyPlay`, `canBeatPlay`, tribute validation or turn validation never allocates an event index.

---

## 6. Replay and reset contract

### 6.1 Replay document

The public replay payload contains:

```ts
type PublicLedgerReplayDocument = Readonly<{
  schemaVersion: "d2-public-replay-v1";
  identity: PublicIdentity;
  initialLedger: HardPublicLedger; // optional cache, never authority
  events: readonly PublicActionEvent[]; // authority, eventIndex 0..N-1
  finalLedgerHash: string;
}>;
```

Recovery always runs `createInitialPublicLedger(identity, initial counts, opening leader)` followed by `applyPublicEvent` for every event. It then compares `canonicalPublicLedgerHash(rebuilt)` to `finalLedgerHash` and any supplied snapshot hash. Missing event, duplicate/conflicting index, unknown schema or mismatch rejects recovery; no default fields are synthesized.

### 6.2 Reset

`resetPublicLedger` is called in `createRoom` after deal/tribute initialization inputs are known and before any action can be accepted. It sets `nextEventIndex=0`, `lastAppliedEventIndex=-1`, clears `seenEventHashes`, `playedCardIds`, `finishOrder`, `publicTributeEvents` and recent window, initializes hand counts, trick index/leader, and binds the new `handIdentity`. No previous ledger object is mutated or reused. The current UI’s “next room” path naturally creates a new identity; a future in-place next-hand path must call `resetPublicLedger` explicitly.

---

## 7. D2a completion criteria

D2a is complete only when:

1. All six event kinds validate their required/prohibited fields and canonical hashes.
2. event 0..N-1 is accepted; same index/hash is idempotent; conflicts/gaps fail closed.
3. Public card duplicates, invalid counts, finish regressions, trick transitions and tribute ordering fail closed.
4. Room play/pass/trick-clear/finish/tribute/return events come only from successful room transitions and are committed atomically with ledger.
5. New room/reset starts a new hand identity and event index 0; prior ledger is not reused.
6. Replay event sequence rebuilds an identical canonical ledger hash.
7. Event/ledger/replay privacy scanner rejects all hidden-state keys and `PublicRoom` shape remains unchanged.
8. D0 fixture check-only, focused D2a tests, ordinary/benchmark/simulation/performance tests, build, TypeScript and diff-check pass.
9. No D2b/D2c/D2d/D2e/D2f/D2g code, treatment registration, smoke, calibration or formal run is present.

---

## 8. Plan self-review and explicit non-goals

- No task assumes five candidate plans; D2a does not inspect candidate plans at all.
- No wall-clock value controls event ordering, index allocation, normal completion or replay.
- No particle, likelihood, action reducer, rollout, team utility or plan-pruning module is created.
- There is one room ledger and one room event log; benchmark consumes them instead of fabricating observation-derived events.
- Event deduplication is index/hash based and atomic; no request-time append/rollback exists.
- `PublicActionEvent` contains no perspective-derived fields such as relation, forced defense or near-finish judgment; those belong to D2b derived evidence.
- `formalExecutionAllowed` remains `false` throughout; this plan does not authorize any experiment.
