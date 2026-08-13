# D2b Lightweight Public Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从已批准的 `HardPublicLedger` 和 canonical public event window 派生一个不含隐藏状态、确定性、视角安全且不影响 raw ledger/hash 的 `LightweightPublicEvidence`。

**Architecture:** 新增一个 `src/ai/belief/lightweightPublicEvidence.ts` 纯函数模块。它只依赖 `src/game/publicEvent.ts`、`src/game/publicEventHash.ts` 和 `src/game/publicLedger.ts` 的公开契约；每次调用即时计算，不写入 `RoomState`、`AiRuntimeState` 或缓存。D2b 在本阶段保持 test-only source boundary，不接入现有 `decideAiAction`。

**Tech Stack:** TypeScript 5.7、Vitest 2、现有 `PublicActionEvent`/`HardPublicLedger`/`canonicalPublicLedgerHash` 契约、既有同步 SHA-256 校验器。

## Global Constraints

- 基线为 `a3ea056f361ae4aed4a0cc092c71e02351c53a44`，对应已批准的 `D2A1_COMPLETE`。
- 当前 planning 分支为 `codex/d2b-plan`，worktree 为 `E:/workspace/掼蛋游戏开发/.worktrees/d2b-plan`。
- `D2B_PLANNING_AUTHORIZED`，`D2B_IMPLEMENTATION_NOT_AUTHORIZED`；本轮只提交本计划文档。
- `formalExecutionAllowed=false`。
- 本阶段不得修改 D2a.1 commit、`PublicActionEvent`、`HardPublicLedger`、canonical event hash、canonical ledger hash、production game rules、D0/D1 行为或 artifacts。
- D2b 不注册 treatment，不运行 benchmark、simulation、performance、smoke、calibration 或 formal workload。
- D2b 输入只能是 `HardPublicLedger`、有界 canonical `PublicActionEvent` window 和 `PublicSeat`；不得接收 `RoomState`、`hands`、`initialHands`、`deck`、partner/opponent hands 或 private AI runtime。
- D2b 输出只包含公开事实和公开事件派生信号；不输出概率为 1 的未公开手牌结论，不创建 particle、hypothetical hand、rollout、action reducer 或 planner search。
- 任何输入校验失败都 fail-closed，并保证输入 ledger、event 数组和已有 hash 字节不变。

## 1. Goal and Non-Goals

### Goal

实现一个最小、可序列化、只读、深冻结的 `LightweightPublicEvidence`，支持：

1. 公开剩余张数；
2. 当前 trick 的 lead/last-play/pass 状态；
3. 已公开打出的牌 ID 与牌型 class；
4. 已公开的 tribute/return/anti-tribute 信息；
5. finish order；
6. 由 perspective 计算的 self/partner/left/right seat relationship；
7. 最近最多 16 个 public events 的顺序、行动类型、关系映射；
8. 仅由上述公开事件计算的 pass streak 和 action tendency 计数；
9. determinism、public monotonicity、privacy 和 raw hash independence。

### Non-Goals

| 后续阶段 | D2b 明确不做的内容 |
|---|---|
| D2c | plan family priority、plan quota、candidate plan shadow/active pruning |
| D2d | representative action reducer、8–12 action cap、mandatory action preservation |
| D2e | particle generation、likelihood、weight、ESS、hidden-card sampling |
| D2f | rollout、scenario key、CRN、team utility、catastrophe risk |
| D2g | treatment registration、benchmark、ablation、smoke/calibration/formal execution |

D2b 也不改变 D0/D1 的 action、runtime shape、trace、hash、schema、approval 或 artifact。

## 2. Current Architecture Map

### Frozen D2a.1 evidence

以下状态来自本请求提供的 D2a.1 final evidence，本计划只记录，不重新运行 Gate B 或修改历史：

| 项目 | 冻结值 |
|---|---|
| D2a.1 final status | `D2A1_COMPLETE` |
| D2a.1 branch | `codex/d2a1-task5` |
| D2a.1 HEAD | `a3ea056f361ae4aed4a0cc092c71e02351c53a44` |
| D2a.1 worktree | `E:/workspace/掼蛋游戏开发/.worktrees/d2a1-task5` |
| prior Gate B | `D2A1_TASK5A_GATE_B_PASSED_AWAITING_FINAL_REVIEW` |
| prior Gate B result | 1 file, 5 tests passed, exit 0 |
| final human decisions | `D2A1_TASK5A_FINAL_APPROVED`, `D2A1_TASK5_COMPLETE`, `D2A1_COMPLETE` |

### Existing source boundaries

| 位置 | 当前职责 | D2b 结论 |
|---|---|---|
| `src/game/publicEvent.ts` | 定义 `PublicSeat`、identity 和 discriminated `PublicActionEvent` | 只读输入契约；不扩展 raw event |
| `src/game/publicEventHash.ts` | canonical event normalization、hash、finalization、verification | D2b 只调用 verification；不写入 evidence 字段 |
| `src/game/publicLedger.ts` | immutable ledger apply、hand counts、trick、finish、transfer、recent summaries 和 canonical ledger hash | D2b 只读；hash 输入保持不变 |
| `src/game/publicEventReplay.ts` | 由 authoritative initial state + ordered events rebuild ledger | D2b 不修改 replay schema 或 reducer |
| `src/game/room.ts` | 私有 `RoomState`、room transition、public event commit、`runAiStep` | D2b 不导入，不读取 room hands，不改 production path |
| `src/game/publicLedgerPrivacy.ts` | D2a ledger/public projection recursive privacy scanner | D2b 使用独立更严格的 evidence scanner，避免改变 D2a.1 契约 |
| `src/ai/contracts.ts` | `AiObservation` 含 private `hand` 与现有公开摘要；`AiRuntimeState` 含 D1 plan state | D2b 不修改；不新增 public evidence sidecar |
| `src/ai/aiDecisionEngine.ts` | hand analysis → plan manager → legal action generation/evaluation | D2b 不接入 decision path |
| `src/ai/planning/handPlanner.ts` | 现有 HandPlanner/fast hand plan generation | D2b 不导入或调用 |
| `tests/ai/publicLedger*.test.ts` | D2a event/ledger/replay/tribute/finish/privacy contract | 作为只读回归参考和 focused gate |
| `tests/game/publicEventReplayIdentity.test.ts` | D2a.1 standalone public replay characterization | 作为只读回归参考；不修改 |

现状结论：D2b 最小接入点是新的 `src/ai/belief/lightweightPublicEvidence.ts`。由于现有 AI decision input 仍以 private `hand` 为核心，且 D2b 当前没有 production treatment 授权，Task 4 保持 test-only source-boundary，不向 `AiObservation`、`AiRuntimeState`、`RoomState` 或 `runAiStep` 增加字段。

## 3. Source-of-Truth Table

| 信息 | 唯一公开来源 | D2b 处理 | 禁止来源 |
|---|---|---|---|
| game/round/hand identity | `HardPublicLedger.gameId/roundIdentity/handIdentity` | 原样复制并深冻结 | `RoomState.id`、provider/store identity |
| current event index | `HardPublicLedger.lastAppliedEventIndex` | 初始 ledger 为 `-1`；不新建 index | wall clock、worker、object address |
| remaining counts | `HardPublicLedger.handCounts` | 校验后复制到 perspective relation map | `room.hands`、private observations |
| played card IDs | `HardPublicLedger.playedCardIds` | 保持 ledger 顺序 | deck reconstruction |
| played card class | public played IDs | 每个 ID 去掉唯一 copy suffix，保持顺序 | hidden card inference |
| trick ownership/initiative | `HardPublicLedger.currentTrick` | current trick 原样复制；initiative 仅做关系映射 | `RoomState.trick` |
| finish order | `HardPublicLedger.finishOrder` | 映射为 relation sequence | room settlement/private state |
| public tribute/return | `revealedTransferEvents` + `publicTributeEvents` | 复制 public transfer records 和 public summaries | unshown card selection |
| recent event sequence | `recentEvents` + `ledger.recentActionSummaries` | 要求 projection 完全一致；不创建第二个 event index | `playHistory`、benchmark trace |
| seat/team relation | `PublicSeat` 固定环与现有 partner=`seat+2 mod 4` 契约 | 由 perspective 计算，不硬编码 perspective seat | `seat 0=self` 假设 |

## 4. Exact Data Model

### 4.1 Public and derived layers

计划在 `src/ai/belief/lightweightPublicEvidence.ts` 中定义以下精确类型。所有对象、数组和嵌套 record 由实现深冻结。

```ts
import type { PublicActionEvent, PublicSeat } from "../../game/publicEvent";
import { assertFinalizedPublicActionEvent, verifyPublicActionEventHash } from "../../game/publicEventHash";
import type { HardPublicLedger } from "../../game/publicLedger";

export type PublicSeatRelation = "self" | "partner" | "leftOpponent" | "rightOpponent";

export type PerspectiveSeatMap = Readonly<Record<PublicSeatRelation, PublicSeat>>;

export type RelationCounts = Readonly<Record<PublicSeatRelation, number>>;

export type PublicTransferEvidence = Readonly<{
  eventIndex: number;
  kind: "tribute" | "return";
  cardId?: string;
  fromSeat: PublicSeat;
  toSeat: PublicSeat;
}>;

export type RecentPublicAction = Readonly<{
  eventIndex: number;
  kind: PublicActionEvent["kind"];
  seat: PublicSeat;
  relation: PublicSeatRelation;
  trickIndex: number;
  publicStableKey: string;
  publicCardIds: readonly string[];
  patternType?: string;
  groupType?: string;
  handCountBefore?: number;
  handCountAfter?: number;
}>;

export type RecentActionTendency = Readonly<{
  playCount: number;
  passCount: number;
  lastActionKind?: "play" | "pass";
}>;

export type EvidenceProvenance = Readonly<{
  field: string;
  publicSource: "HardPublicLedger" | "PublicActionEvent[]";
  derivation: string;
  hiddenStateRisk: "none";
  hashImpact: "none";
}>;

export type LightweightPublicEvidence = Readonly<{
  schemaVersion: "d2-lightweight-evidence-v1";
  gameId: string;
  roundIdentity: string;
  handIdentity: string;
  eventIndex: number;
  perspectiveSeat: PublicSeat;
  seatMap: PerspectiveSeatMap;
  hardPublicFacts: Readonly<{
    remainingCardCounts: RelationCounts;
    currentTrick: HardPublicLedger["currentTrick"];
    initiativeRelation: PublicSeatRelation;
    playedCardIds: readonly string[];
    playedCardClasses: readonly string[];
    publicTransfers: readonly PublicTransferEvidence[];
    publicTributeEvents: readonly string[];
    finishOrder: readonly PublicSeatRelation[];
  }>;
  derivedSignals: Readonly<{
    recentActions: readonly RecentPublicAction[];
    recentPassStreakByRelation: RelationCounts;
    recentActionTendencies: Readonly<Record<PublicSeatRelation, RecentActionTendency>>;
  }>;
  provenance: readonly EvidenceProvenance[];
}>;

export function deriveLightweightPublicEvidence(
  ledger: HardPublicLedger,
  recentEvents: readonly PublicActionEvent[],
  perspectiveSeat: PublicSeat,
): LightweightPublicEvidence;

export function assertLightweightPublicEvidencePrivacy(value: unknown): void;
```

`hardPublicFacts` 只陈述 ledger 或已公开 event 的事实。`derivedSignals` 只做 seat relation 映射、bounded-window 计数和顺序投影；它不表达隐藏手牌结论，不包含 `probability`、likelihood、weight、ESS 或 uncertainty 数值。D2b 不增加 `ownHand` 字段：即使 self 是 perspective，self 的完整手牌仍不是本函数的合法输入。

### 4.2 Perspective semantics

固定 seat cycle 为 `0 → 1 → 2 → 3 → 0`，partner 是既有 room 契约中的 opposite seat：

```text
self          = perspectiveSeat
partner       = (perspectiveSeat + 2) mod 4
leftOpponent  = (perspectiveSeat + 1) mod 4
rightOpponent = (perspectiveSeat + 3) mod 4
```

`seatMap` 是唯一 seat relation 映射；所有 counts、finish order、initiative、recent actor 和 tendency 都通过该 map 输出。绝不固定 `seat 0=self` 或 `seat 2=partner`。绝对 `PublicSeat` 仍保留在 `perspectiveSeat`、`seatMap`、`currentTrick`、played IDs 和 transfer records 中，便于与公开 ledger 做审计比对。

### 4.3 Recent-window semantics

- window 按 event count，不按 play/pass action count。
- 最大窗口为 16 个 event，与 `HardPublicLedger.recentActionSummaries` 的既有上限相同。
- window 包含 `play`、`pass`、`trick-clear`、`finish`、`tribute`、`return`、`anti-tribute` 全部 event kind；不丢弃 trick-clear 或 tribute/return。
- `recentEvents` 必须正好等于 ledger recent summary 对应的 canonical suffix；长度必须等于 `ledger.recentActionSummaries.length`，空 ledger 对应空数组。
- event 顺序按 `eventIndex` 升序；window 被截断时从 ledger 的最后 16 个 event 开始，不重排、不重新编号。
- 每个 event 必须与 ledger identity、`seenEventHashes[eventIndex]`、recent summary projection 一致；重复 index、缺口、尾部不是 `lastAppliedEventIndex`、summary mismatch 都 fail-close。
- hand reset 后 ledger 的 `lastAppliedEventIndex=-1`、recent summaries、played IDs、transfer records、finish order 都从新 identity 的初始值开始；本函数不缓存旧 window。

### 4.4 Derived signal semantics

- `recentActions` 是 recent public events 的完整公开投影，保留 event kind、stable key、公开 card IDs、public pattern/group 和 count fields，并追加 perspective relation。
- `recentPassStreakByRelation` 是每个 relation 在 window 尾部连续 `pass` event 的数量；遇到该 relation 的 `play`、finish、transfer 或其他 event 时归零。它是 derived signal，不是手牌事实。
- `recentActionTendencies` 只输出 window 内每个 relation 的 `playCount`、`passCount`、`lastActionKind`；不输出概率、意图或隐藏牌解释。
- `initiativeRelation` 来自 `currentTrick.lastPlaySeat ?? currentTrick.leadSeat` 的 perspective 映射；当前 trick 的绝对字段仍以 ledger 为准。
- `playedCardClasses` 仅由公开 played card IDs 的 public prefix 派生：去掉末尾 `-1`/`-2` copy suffix，保留出现顺序；不枚举未公开牌型。

### 4.5 Provenance contract

实现必须输出覆盖每一个 public/derived field 的 provenance rows；每行 `hiddenStateRisk` 固定为 `none`，`hashImpact` 固定为 `none`。

| Evidence field | Public source | Derivation | Hidden-state risk | Hash impact |
|---|---|---|---|---|
| `gameId`, `roundIdentity`, `handIdentity`, `eventIndex` | ledger identity/index | direct immutable copy | none | none |
| `seatMap`, `perspectiveSeat` | perspective seat | fixed modulo-4 relation mapping | none | none |
| `remainingCardCounts` | `ledger.handCounts` | relation-keyed copy | none | none |
| `currentTrick` | `ledger.currentTrick` | immutable copy | none | none |
| `initiativeRelation` | `currentTrick.leadSeat/lastPlaySeat` | choose last play or lead, then map relation | none | none |
| `playedCardIds` | `ledger.playedCardIds` | immutable ordered copy | none | none |
| `playedCardClasses` | `playedCardIds` | remove public copy suffix only | none | none |
| `publicTransfers` | `ledger.revealedTransferEvents` | immutable ordered copy | none | none |
| `publicTributeEvents` | `ledger.publicTributeEvents` | immutable ordered copy | none | none |
| `finishOrder` | `ledger.finishOrder` | map each public seat to relation | none | none |
| `recentActions` | canonical `recentEvents` suffix | public field projection + relation mapping | none | none |
| `recentPassStreakByRelation` | canonical `recentEvents` suffix | bounded suffix pass count | none | none |
| `recentActionTendencies` | canonical `recentEvents` suffix | bounded play/pass counts and last kind | none | none |
| `provenance` | fixed implementation table | deterministic static rows | none | none |

The evidence object is not supplied to `canonicalPublicLedgerHash` and is not inserted into `HardPublicLedger`, `PublicActionEvent`, replay documents, `RoomState`, or `AiRuntimeState`.

## 5. Ownership and Lifecycle

1. The owner is the caller at a decision boundary; the caller supplies the current ledger and `room.publicEvents.slice(-16)` only after the public transition has committed.
2. `deriveLightweightPublicEvidence` is a pure per-decision computation. It does not own a cache, sidecar, event cursor, mutable accumulator, or reset hook.
3. No `AiRuntimeState` field is added in D2b. This avoids stale evidence and avoids mixing public derived state with D1 plan-selection state.
4. A future authorized integration must bind the input ledger identity and recent suffix to the same decision snapshot, call the pure function, and discard the result after the decision unless a later phase approves a versioned public sidecar. That future integration is outside this plan.
5. New hand isolation is provided by the existing `resetPublicLedger` contract plus identity validation. A prior-hand event suffix passed with a new-hand ledger throws before any result is returned.

## 6. Privacy Contract

`assertLightweightPublicEvidencePrivacy` recursively visits arrays and objects with cycle protection. It normalizes keys by lowercasing and removing punctuation, then rejects these keys anywhere in the evidence or test fixture:

```text
partnerHand
opponentsHands
hands
initialHands
deck
hiddenInitialHand
hiddenState
fullState
hypotheticalHands
ParticleBank
particles
provider
store
identityProvider
identityStore
providerIdentity
installationIdentity
idempotencyKey
gameSequence
roomTransportId
```

The scanner permits the explicitly public `gameId`, `roundIdentity`, and `handIdentity`. It rejects hidden hands, hypothetical hands, complete-deck reconstruction, provider/store identity internals, and nested forbidden keys even when injected after derivation. The output has no `RoomState`, `AiRuntimeState`, `Card[]`, `HandPlan`, or object references to private state.

## 7. Deterministic and Raw-Hash Contracts

### Determinism

For equal `(ledger, recentEvents, perspectiveSeat)`, repeated derivation is `deepEqual` and JSON-byte equal. The implementation may use only fixed iteration order, explicit seat order `[0, 1, 2, 3]`, event order, and stable string sorting already present in the public contracts. It must not use `Date.now`, `performance.now`, `Math.random`, object address, filesystem state, directory order, or worker ID.

### Public monotonicity

Given a valid ledger and a valid next public event applied by `applyPublicEvent`:

- `playedCardIds` only appends newly public play IDs;
- remaining count for the event seat decreases only for `play`, and transfer deltas match the public transfer event;
- known public card classes never remove a previously observed class entry;
- finish order only appends;
- current trick may clear or change only according to the event kind and existing ledger reducer;
- recent derived signals may change only inside the new bounded suffix.

The test compares the before/after evidence and rejects any evidence implementation that rewrites prior hard facts or obtains counts from private state.

### Raw hash independence

The focused test computes `canonicalPublicLedgerHash(ledger)` before and after derivation and expects exact equality. It also compares `JSON.stringify(ledger)` before and after. Derivation never calls `applyPublicEvent`, mutates arrays, or appends evidence to ledger/event objects.

## 8. Test Matrix

Create one concentrated file, following the existing `tests/ai/publicLedger*.test.ts` naming convention:

```text
tests/ai/lightweightPublicEvidence.test.ts
```

The test fixture builds only `PublicGameIdentity`, `createInitialPublicLedger`, `finalizePublicActionEvent`, `applyPublicEvent`, and `resetPublicLedger`. It never calls `createRoom`, never reads `room.hands`, and never constructs a private `Card[]` fixture.

| Case | Required assertion |
|---|---|
| empty/new hand | event index `-1`, empty recent window/transfers/finish order, counts equal initial public counts |
| play event | public played IDs/classes append, acting relation count decreases, recent play projection is ordered |
| pass event | count unchanged, current trick last play remains public, pass streak and tendency update |
| trick-clear | pass followed by trick-clear is retained in order; current trick reset comes from ledger |
| finish | finish relation appends; `hand-empty` retains public count zero; no private hand is read |
| tribute/return | revealed transfer records and public tribute summaries are preserved; transfer cards are not added to played IDs |
| recent window ordering | 17 public events produce exactly the ledger’s last 16 summaries/events, including clear/tribute kinds |
| perspective mapping | perspectives 0/1/2/3 each map self, partner, left and right correctly |
| seat permutation | applying a stable bijection to all public seats and perspective changes relation-mapped evidence the same way |
| repeated derivation | same inputs produce deep-equal and JSON-byte-equal evidence |
| raw hash unchanged | ledger canonical hash and serialized ledger are byte-identical before/after |
| privacy | recursive scanner accepts valid evidence and rejects every forbidden key class, including nested injection |
| malformed/inconsistent input | wrong identity, event hash, event index, duplicate index, summary mismatch, invalid count, invalid perspective and stale suffix fail closed |
| hand reset isolation | new hand identity produces fresh index/count/window; old suffix is rejected |
| monotonicity | valid public play/pass/finish/transfer transitions preserve hard public facts and only update related derived signals |
| source boundary | new production source imports only public event/ledger/hash modules and contains no room, planner, runtime, server/provider/store, particle or rollout dependency |

The test file must use exact helper behavior such as:

```ts
function apply(ledger: HardPublicLedger, event: PublicActionEvent): HardPublicLedger {
  const result = applyPublicEvent(ledger, event);
  if (!result.ok) throw new Error(`TEST_PUBLIC_EVENT_INVALID:${result.error}`);
  return result.ledger;
}

function recentWindow(events: readonly PublicActionEvent[]): readonly PublicActionEvent[] {
  return events.slice(-16);
}

function evidenceView(evidence: LightweightPublicEvidence) {
  return {
    seatMap: evidence.seatMap,
    remainingCardCounts: evidence.hardPublicFacts.remainingCardCounts,
    initiativeRelation: evidence.hardPublicFacts.initiativeRelation,
    finishOrder: evidence.hardPublicFacts.finishOrder,
    recentActions: evidence.derivedSignals.recentActions.map(({ kind, relation, trickIndex }) => ({ kind, relation, trickIndex })),
    recentPassStreakByRelation: evidence.derivedSignals.recentPassStreakByRelation,
    recentActionTendencies: evidence.derivedSignals.recentActionTendencies,
  };
}
```

The seat-permutation test compares `evidenceView` after applying the same permutation to all public seat fields and to `perspectiveSeat`; it does not compare absolute seat numbers as if they were perspective-independent.

## 9. Implementation Tasks

### Task 1: Characterization / RED tests

**Files:**

- Create: `tests/ai/lightweightPublicEvidence.test.ts`
- Read-only: `src/game/publicEvent.ts`, `src/game/publicEventHash.ts`, `src/game/publicLedger.ts`, `src/game/publicLedgerPrivacy.ts`, existing `tests/ai/publicLedger*.test.ts`

**Interfaces:**

- Consumes: existing public identity/event/ledger constructors and the frozen `deriveLightweightPublicEvidence` signature.
- Produces: public-only fixtures and the complete test matrix in §8; no room or private-hand fixture.

- [ ] **Step 1: Add public-only fixture helpers and empty/play/pass assertions.**

  Use fixed identity `buildPublicGameIdentity("d2b:evidence", 0, 0, "benchmark-scenario")`, initial counts `{ 0: 27, 1: 27, 2: 27, 3: 27 }`, opening leader `0`, and synthetic public IDs such as `C2-1`. Every event is finalized through `finalizePublicActionEvent` and applied through `applyPublicEvent`.

- [ ] **Step 2: Add the remaining public transition cases.**

  Add play/pass/trick-clear, finish, tribute, return, anti-tribute, 17-event window, perspective 0/1/2/3, permutation, monotonicity and hand-reset cases. Each case passes `events.slice(-16)` and never obtains a card from `RoomState`.

- [ ] **Step 3: Run the RED test.**

  Run:

  ```bash
  npx vitest run tests/ai/lightweightPublicEvidence.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Expected result: collection fails because `src/ai/belief/lightweightPublicEvidence.ts` does not yet exist. A failure in an existing public event/ledger constructor is a pre-existing contract mismatch and stops this implementation sequence; it does not authorize modifying D2a.1 production code.

- [ ] **Step 4: Commit only characterization tests.**

  ```bash
  git add tests/ai/lightweightPublicEvidence.test.ts
  git commit -m "test: characterize lightweight public evidence"
  ```

### Task 2: Minimal types and pure derivation

**Files:**

- Create: `src/ai/belief/lightweightPublicEvidence.ts`
- Test: `tests/ai/lightweightPublicEvidence.test.ts`
- Read-only: `src/game/publicEvent.ts`, `src/game/publicEventHash.ts`, `src/game/publicLedger.ts`

**Interfaces:**

- Consumes: `HardPublicLedger`, finalized canonical `PublicActionEvent[]`, `PublicSeat`.
- Produces: the exact exported types and `deriveLightweightPublicEvidence` contract in §4.

- [ ] **Step 1: Add the exact exported types and signature.**

  Use the types in §4.1 verbatim, including `schemaVersion: "d2-lightweight-evidence-v1"`, `hardPublicFacts`, `derivedSignals`, and `provenance`.

- [ ] **Step 2: Implement fail-closed public input validation.**

  Validate seat values, identity strings, ledger schema, `lastAppliedEventIndex + 1 === nextEventIndex`, non-negative integer counts, unique finish/pass seats, valid current trick seats, recent window length `0..16`, contiguous recent indices, identity equality, `seenEventHashes` equality, and `recentActionSummaries` projection equality. For every recent event call `assertFinalizedPublicActionEvent` and `verifyPublicActionEventHash`.

- [ ] **Step 3: Implement pure relation mapping and evidence construction.**

  Use fixed modulo-4 arithmetic, copy ledger fields without mutation, project recent events in canonical order, derive class prefixes and tendency counts, then deep-freeze the result. The only loops are over the four seats, ledger public card IDs/transfers/finish order, and at most 16 recent events.

- [ ] **Step 4: Run the focused test and typecheck.**

  ```bash
  npx vitest run tests/ai/lightweightPublicEvidence.test.ts --testTimeout=120000 --reporter=verbose
  npx tsc --noEmit
  ```

  Expected result: the new test file passes, no D2a public event/ledger file changes, and TypeScript reports exit 0.

- [ ] **Step 5: Commit the pure derivation.**

  ```bash
  git add src/ai/belief/lightweightPublicEvidence.ts tests/ai/lightweightPublicEvidence.test.ts
  git commit -m "feat: derive lightweight public evidence"
  ```

### Task 3: Perspective, window, privacy and determinism hardening

**Files:**

- Modify: `src/ai/belief/lightweightPublicEvidence.ts`
- Modify: `tests/ai/lightweightPublicEvidence.test.ts`
- Read-only: `src/game/publicLedgerPrivacy.ts`, `tests/ai/publicLedgerPrivacy.test.ts`, `tests/game/publicEventRoomAdapter.test.ts`

**Interfaces:**

- Consumes: Task 2 pure evidence output and existing public privacy conventions.
- Produces: `assertLightweightPublicEvidencePrivacy`, deterministic deep-freeze output, strict recent-window contract and the full negative test matrix.

- [ ] **Step 1: Add the normalized recursive privacy scanner.**

  Implement the forbidden-key set from §6, recurse through arrays and objects with a `Set<object>`, allow the three public identity fields, and throw one stable `D2B_EVIDENCE_PRIVACY_VIOLATION` error for any forbidden key.

- [ ] **Step 2: Add malformed-input and stale-window tests.**

  Mutate only test copies: alter event hash, identity, event index, recent summary, count, duplicate seat, stale hand identity and perspective seat. Each call must throw and the original ledger JSON/hash must remain unchanged.

- [ ] **Step 3: Add determinism, monotonicity and privacy tests.**

  Call derivation three times, compare JSON bytes, apply one valid public event and compare before/after hard facts, inject each forbidden key recursively, and scan the actual output. Add source text assertions that the module imports no room, planner, runtime, server, provider/store, particle or rollout symbol.

- [ ] **Step 4: Run the hardened focused gate.**

  ```bash
  npx vitest run tests/ai/lightweightPublicEvidence.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerTrickFinish.test.ts --testTimeout=120000 --reporter=verbose
  npx tsc --noEmit
  ```

  Expected result: all listed files pass, with no benchmark, simulation, performance or formal workload executed.

- [ ] **Step 5: Commit the hardening boundary.**

  ```bash
  git add src/ai/belief/lightweightPublicEvidence.ts tests/ai/lightweightPublicEvidence.test.ts
  git commit -m "test: harden lightweight public evidence boundaries"
  ```

### Task 4: Integration boundary characterization

**Files:**

- Modify: `tests/ai/lightweightPublicEvidence.test.ts`
- Read-only: `src/game/room.ts`, `src/ai/contracts.ts`, `src/ai/runtimeContracts.ts`, `src/ai/aiDecisionEngine.ts`, `src/ai/planning/handPlanner.ts`, `src/game/publicEvent.ts`, `src/game/publicLedger.ts`
- Forbidden modifications: all production decision-path files and all D0/D1 files

**Interfaces:**

- Consumes: the source text of the new pure module and the frozen existing room/AI boundaries.
- Produces: test-only proof that D2b can be imported without private room state or planner integration.

- [ ] **Step 1: Assert the import boundary.**

  Read `src/ai/belief/lightweightPublicEvidence.ts` as text and require its imports to be limited to `../../game/publicEvent`, `../../game/publicEventHash`, and `../../game/publicLedger`. Reject `room`, `RoomState`, `hands`, `initialHands`, `deck`, `AiRuntimeState`, `HandPlanner`, `generateHandPlans`, `ParticleBank`, `particles`, `rollout`, `treatment`, `server`, `provider`, and `store` references.

- [ ] **Step 2: Assert no production decision integration.**

  Read `src/game/room.ts`, `src/ai/contracts.ts`, `src/ai/runtimeContracts.ts`, and `src/ai/aiDecisionEngine.ts` and assert that this D2b task does not add a `LightweightPublicEvidence` import or runtime field. This is a source-boundary characterization, not permission to edit those files.

- [ ] **Step 3: Commit only the test boundary.**

  ```bash
  git add tests/ai/lightweightPublicEvidence.test.ts
  git commit -m "test: characterize D2b integration boundary"
  ```

Task 4 remains test-only because the current production AI path requires private hand analysis and D2b has no treatment authorization. Production integration is a later separately approved scope.

### Task 5: Local verification gate

**Files:** none; verification only.

- [ ] **Step 1: Run the D2b focused gate.**

  ```bash
  npx vitest run tests/ai/lightweightPublicEvidence.test.ts tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerDependency.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts --testTimeout=120000 --reporter=verbose
  ```

  Record file count, test count, exit code, natural completion, duration, stdout and stderr. No restricted workload is part of this command.

- [ ] **Step 2: Run complete local non-restricted regression gates.**

  ```bash
  npx tsc --noEmit
  npm run build
  npm test
  git diff --check
  ```

  The existing `npm test` script excludes `tests/benchmark/**`, `tests/simulation/**`, and `tests/performance/**`; no standalone benchmark/simulation/performance command is permitted in this D2b scope.

- [ ] **Step 3: Run D0/D1 frozen-evidence checks without regenerating or executing workload.**

  ```bash
  git diff --exit-code -- tests/ai/fixtures/d0KeepCurrentCases.json docs/benchmark-approvals artifacts
  git status --short --untracked-files=all
  git diff --name-only
  ```

  The expected allowlist contains only `src/ai/belief/lightweightPublicEvidence.ts` and `tests/ai/lightweightPublicEvidence.test.ts` for the separately authorized implementation branch. Do not rerun D0 fixture generation, D1 calibration, external evidence mounting, benchmark, simulation, smoke or formal execution.

- [ ] **Step 4: Stop on any boundary drift.**

  A changed D0/D1 artifact, changed public ledger/event hash, private key in output, production decision-path import, or restricted workload request is a blocking scope result. Preserve the failing evidence and stop; do not weaken a scanner, change a hash, add a compatibility import, or add a fallback to private state.

## 10. Allowed and Forbidden Files

### Current plan-only authorization

The only file allowed to be created, modified, staged or committed in this planning round is:

```text
docs/superpowers/plans/2026-07-19-d2b-lightweight-public-evidence.md
```

### Future separately authorized D2b implementation allowlist

| Category | Exact path | Planned operation |
|---|---|---|
| Production | `src/ai/belief/lightweightPublicEvidence.ts` | create one pure evidence module |
| Test | `tests/ai/lightweightPublicEvidence.test.ts` | create one concentrated public-only test file |

### Forbidden in D2b

```text
src/game/publicEvent.ts
src/game/publicEventHash.ts
src/game/publicLedger.ts
src/game/publicEventReplay.ts
src/game/room.ts
src/game/settlement.ts
src/ai/contracts.ts
src/ai/runtimeContracts.ts
src/ai/aiDecisionEngine.ts
src/ai/planning/handPlanner.ts
src/ai/planning/planManager.ts
src/ai/planning/planSelector.ts
src/server/**
src/ui/**
tests/benchmark/**
tests/simulation/**
tests/performance/**
scripts/**
tests/ai/fixtures/**
docs/benchmark-approvals/**
artifacts/**
package.json
package-lock.json
tsconfig.json
```

No treatment registration, network/API/UI integration, `PublicRoom` change, D0/D1 fixture change, D2c–D2g implementation, or production game-rule change is allowed.

## 11. Commit Boundaries and Rollback

For a later separately authorized implementation branch:

1. Commit 1: only RED characterization in `tests/ai/lightweightPublicEvidence.test.ts`.
2. Commit 2: only `src/ai/belief/lightweightPublicEvidence.ts` plus the focused test update that turns RED green.
3. Commit 3: only privacy/determinism/window hardening in the two allowlisted files.
4. Commit 4: only test-only source-boundary assertions in `tests/ai/lightweightPublicEvidence.test.ts`.
5. Each commit must pass its focused gate before the next commit; no commit may modify D2a.1 history or frozen evidence.
6. Rollback is limited to inverse commits touching the two future allowlisted files. D2a.1 commits, D0/D1 artifacts, approval files, hashes and existing public contracts remain untouched.

The current planning commit is separate and contains only:

```bash
git add docs/superpowers/plans/2026-07-19-d2b-lightweight-public-evidence.md
git commit -m "docs: plan D2b lightweight public evidence"
```

## 12. Review Gates

Before any future implementation authorization, perform three independent plan reviews:

### Architecture/spec compliance review

- Input is exactly ledger + canonical recent public events + perspective seat.
- Output contains hard public facts and derived lightweight signals as separate layers.
- Recent window uses the existing ledger summary and event index; no second index exists.
- Lifecycle is per-decision pure derivation with no stale cache or sidecar.
- Task 4 does not enter the production decision path.

### Privacy boundary review

- No private hand, deck, hidden state, hypothetical hands, particle state or provider/store identity internals are accepted or emitted.
- Recursive normalized scanner rejects forbidden keys at every nesting depth.
- Source imports are public event/ledger/hash only.
- Public card IDs and revealed transfer IDs are copied only because D2a already marks them public.

### Scope review

- D2c, D2d, D2e, D2f and D2g are excluded.
- D0/D1 behavior and frozen evidence are read-only.
- No restricted workload, treatment, benchmark, simulation, performance, smoke, calibration or formal command is in the current planning execution.
- `formalExecutionAllowed=false` remains explicit.

## 13. Stop Conditions

Stop before implementation if any of the following occurs:

- D2a.1 frozen SHA, branch, approval status or public event/ledger contract differs from the provided evidence.
- A required public field has no reliable source in `HardPublicLedger` or canonical public event window.
- The proposed API requires `RoomState`, private hands, `AiRuntimeState`, a planner, a second event index or a hidden-state cache.
- A test needs private room hands for convenience.
- A privacy scanner needs an exception for hidden state or provider/store identity.
- Any raw public event or ledger hash must change to support evidence.
- Any Critical or Important review finding remains open.
- Any implementation change would exceed the two future allowlisted files.

## 14. Plan Review Result

This plan fixes the contract choices during planning: pure per-decision derivation, exact 16-event suffix, fixed modulo-4 perspective mapping, no hidden/self-hand input, no cache, no production integration, recursive privacy scan, deterministic bounded complexity, and raw hash independence.

Review classification after the three reviews:

```text
Critical: none
Important: none
Minor: none
```

Final implementation authorization remains withheld.

## 15. Final Status

After this plan-only commit, report exactly:

```text
D2B_PLAN_READY_FOR_REVIEW
D2B_IMPLEMENTATION_NOT_AUTHORIZED
D2B_FORMAL_EXECUTION_NOT_AUTHORIZED
formalExecutionAllowed=false
```
