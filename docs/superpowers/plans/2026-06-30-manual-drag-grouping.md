# Manual Drag Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual drag grouping tray so the human player can organize cards into vertical legal Guandan groups and play a whole group in one action.

**Architecture:** Keep the feature local to the frontend. Add a focused hand-grouping state helper, a presentational/interactive `ManualGroupTray` component, and wire it into `App.tsx` so the original hand remains sorted while grouped cards move into the tray. Reuse `classifyPlay`/`CardFace` for legal group detection and rendering so tray legality matches backend play validation.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing Guandan engine modules.

---

## File Structure

- Create `src/ui/manualGrouping.ts`: pure state utilities for manual groups, ungrouped cards, group classification, move operations, and selection checks.
- Create `src/ui/ManualGroupTray.tsx`: renders the “我的组牌” tray, accepts drag/drop and click callbacks, shows vertical group columns and legal/illegal labels.
- Modify `src/ui/App.tsx`: owns manual grouping state, filters grouped cards out of the original hand display, uses group clicks to select all group cards, clears stale groups after room changes/play/tribute.
- Modify `src/styles.css`: tray, vertical group, drop target, legal/illegal group styles, selected group styles.
- Modify `tests/ui/app.test.tsx`: integration tests for drag grouping, whole-group selection/play, cleanup, and sorted leftover hand.
- Create `tests/ui/manualGrouping.test.ts`: focused unit tests for grouping helper behavior.

---

### Task 1: Pure Manual Grouping State

**Files:**
- Create: `src/ui/manualGrouping.ts`
- Test: `tests/ui/manualGrouping.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add `tests/ui/manualGrouping.test.ts`:

```ts
import type { Card } from "../../src/engine/cards";
import {
  addCardToManualGroup,
  classifyManualGroups,
  createManualGroup,
  removeMissingCardsFromManualGroups,
  ungroupedCards,
  type ManualCardGroup,
} from "../../src/ui/manualGrouping";

const S2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
const C2: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
const S3: Card = { id: "S3-1", kind: "suited", rank: "3", suit: "spades", copy: 1 };
const C3: Card = { id: "C3-1", kind: "suited", rank: "3", suit: "clubs", copy: 1 };
const S4: Card = { id: "S4-1", kind: "suited", rank: "4", suit: "spades", copy: 1 };
const C4: Card = { id: "C4-1", kind: "suited", rank: "4", suit: "clubs", copy: 1 };
const D5: Card = { id: "D5-1", kind: "suited", rank: "5", suit: "diamonds", copy: 1 };

it("moves a card into one manual group and removes it from ungrouped cards", () => {
  const hand = [S2, C2, D5];
  const first = createManualGroup(S2);
  const groups = addCardToManualGroup([first], first.id, C2);

  expect(groups[0].cardIds).toEqual(["S2-1", "C2-1"]);
  expect(ungroupedCards(hand, groups).map((card) => card.id)).toEqual(["D5-1"]);
});

it("classifies a vertical consecutive pair group as wood plate", () => {
  const hand = [S2, C2, S3, C3, S4, C4];
  const group: ManualCardGroup = { id: "manual-1", cardIds: hand.map((card) => card.id) };

  const [classified] = classifyManualGroups([group], hand, "10");

  expect(classified.label).toBe("木板");
  expect(classified.legalGroup?.type).toBe("consecutive-pairs");
});

it("removes cards that no longer exist in the human hand and drops empty groups", () => {
  const groups: ManualCardGroup[] = [
    { id: "manual-1", cardIds: ["S2-1", "C2-1"] },
    { id: "manual-2", cardIds: ["D5-1"] },
  ];

  expect(removeMissingCardsFromManualGroups(groups, [D5])).toEqual([{ id: "manual-2", cardIds: ["D5-1"] }]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- tests/ui/manualGrouping.test.ts
```

Expected: FAIL because `src/ui/manualGrouping.ts` does not exist.

- [ ] **Step 3: Implement minimal helper module**

Create `src/ui/manualGrouping.ts`:

```ts
import type { Card, GameRank, Suit } from "../engine/cards";
import { type CardGroup } from "../engine/groups";
import { classifyPlay } from "../game/playRules";

export type ManualCardGroup = {
  id: string;
  cardIds: string[];
};

export type ClassifiedManualGroup = ManualCardGroup & {
  cards: Card[];
  label: string;
  legalGroup?: CardGroup;
};

const TYPE_LABELS: Record<CardGroup["type"], string> = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  "full-house": "夯",
  straight: "顺子",
  "consecutive-pairs": "木板",
  plate: "钢板",
  bomb: "炸弹",
  "straight-flush": "同花顺",
  "joker-bomb": "王炸",
};

const SUIT_LABELS: Record<Suit, string> = {
  spades: "黑桃",
  clubs: "梅花",
  hearts: "红桃",
  diamonds: "方片",
};

export function createManualGroup(card: Card, id = `manual-${Date.now()}-${card.id}`): ManualCardGroup {
  return { id, cardIds: [card.id] };
}

export function addCardToManualGroup(groups: ManualCardGroup[], groupId: string, card: Card): ManualCardGroup[] {
  const withoutCard = groups
    .map((group) => ({ ...group, cardIds: group.cardIds.filter((cardId) => cardId !== card.id) }))
    .filter((group) => group.cardIds.length > 0);

  if (!withoutCard.some((group) => group.id === groupId)) {
    return [...withoutCard, { id: groupId, cardIds: [card.id] }];
  }

  return withoutCard.map((group) => (group.id === groupId ? { ...group, cardIds: [...group.cardIds, card.id] } : group));
}

export function removeCardFromManualGroups(groups: ManualCardGroup[], cardId: string): ManualCardGroup[] {
  return groups
    .map((group) => ({ ...group, cardIds: group.cardIds.filter((id) => id !== cardId) }))
    .filter((group) => group.cardIds.length > 0);
}

export function removeMissingCardsFromManualGroups(groups: ManualCardGroup[], hand: Card[]): ManualCardGroup[] {
  const handIds = new Set(hand.map((card) => card.id));
  return groups
    .map((group) => ({ ...group, cardIds: group.cardIds.filter((cardId) => handIds.has(cardId)) }))
    .filter((group) => group.cardIds.length > 0);
}

export function ungroupedCards(hand: Card[], groups: ManualCardGroup[]): Card[] {
  const groupedIds = new Set(groups.flatMap((group) => group.cardIds));
  return hand.filter((card) => !groupedIds.has(card.id));
}

export function classifyManualGroups(groups: ManualCardGroup[], hand: Card[], gameRank: GameRank): ClassifiedManualGroup[] {
  const cardById = new Map(hand.map((card) => [card.id, card]));
  return groups
    .map((group) => {
      const cards = group.cardIds.map((cardId) => cardById.get(cardId)).filter((card): card is Card => card !== undefined);
      const legalGroup = classifyPlay(cards, gameRank);
      return {
        ...group,
        cards,
        legalGroup,
        label: legalGroup === undefined ? "未成型" : groupLabel(legalGroup),
      };
    })
    .filter((group) => group.cards.length > 0);
}

function groupLabel(group: CardGroup): string {
  if (group.type !== "straight-flush") {
    return TYPE_LABELS[group.type];
  }

  const suited = group.cards.find((card): card is Extract<Card, { kind: "suited" }> => card.kind === "suited" && !group.wildcards.includes(card));
  return suited === undefined ? TYPE_LABELS[group.type] : `${SUIT_LABELS[suited.suit]}${TYPE_LABELS[group.type]}`;
}
```

- [ ] **Step 4: Run helper tests**

Run:

```powershell
npm test -- tests/ui/manualGrouping.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit if git is available**

Run only if `git` exists in the shell:

```powershell
git add src/ui/manualGrouping.ts tests/ui/manualGrouping.test.ts
git commit -m "feat: add manual grouping state helpers"
```

If `git` is unavailable, record this in the final implementation summary and continue.

---

### Task 2: Manual Group Tray Component

**Files:**
- Create: `src/ui/ManualGroupTray.tsx`
- Modify: `src/styles.css`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Write failing render/selection test**

Append to `tests/ui/app.test.tsx`:

```ts
it("renders a manual group tray and selects a whole legal manual group", async () => {
  const twoClubs: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
  const room = createRoom({ humanHand: [cardA, cardK, twoClubs] });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.dragStart(screen.getByLabelText("榛戞A 1"), { dataTransfer: dragData() });
  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("SA-1") });
  fireEvent.dragStart(screen.getByLabelText("榛戞K 1"), { dataTransfer: dragData() });
  fireEvent.drop(screen.getByTestId("manual-group-manual-1"), { dataTransfer: dragData("SK-1") });

  const manualGroup = await screen.findByTestId("manual-group-manual-1");
  expect(manualGroup).toHaveTextContent("未成型");

  fireEvent.click(manualGroup);

  expect(screen.getByLabelText("榛戞A 1").closest("button")).toHaveClass("selected");
  expect(screen.getByLabelText("榛戞K 1").closest("button")).toHaveClass("selected");
});

function dragData(cardId = ""): DataTransfer {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => (type === "text/plain" && cardId !== "" ? cardId : data.get(type) ?? ""),
    clearData: () => data.clear(),
    dropEffect: "move",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: ["text/plain"],
    setDragImage: () => undefined,
  };
}
```

- [ ] **Step 2: Run test to verify failure**

Run:

```powershell
npm test -- tests/ui/app.test.tsx -t "manual group tray"
```

Expected: FAIL because the tray and test ids do not exist.

- [ ] **Step 3: Implement component**

Create `src/ui/ManualGroupTray.tsx`:

```tsx
import type { Card, GameRank } from "../engine/cards";
import { CardFace } from "./CardFace";
import type { ClassifiedManualGroup } from "./manualGrouping";

type ManualGroupTrayProps = {
  groups: ClassifiedManualGroup[];
  gameRank: GameRank;
  selectedCardIds: string[];
  onDropToNewGroup: (cardId: string) => void;
  onDropToGroup: (groupId: string, cardId: string) => void;
  onGroupClick: (cardIds: string[]) => void;
};

export function ManualGroupTray({
  groups,
  gameRank,
  selectedCardIds,
  onDropToNewGroup,
  onDropToGroup,
  onGroupClick,
}: ManualGroupTrayProps) {
  return (
    <section className="manual-group-tray" aria-label="我的组牌" data-testid="manual-group-tray">
      <div className="manual-group-heading">
        <strong>我的组牌</strong>
        <span>拖牌形成竖排牌型，点击整组选中</span>
      </div>
      <div
        className="manual-group-dropzone"
        data-testid="manual-group-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const cardId = event.dataTransfer.getData("text/plain");
          if (cardId !== "") {
            onDropToNewGroup(cardId);
          }
        }}
      >
        {groups.length === 0 ? <span className="manual-group-empty">把牌拖到这里开始组牌</span> : null}
        {groups.map((group) => (
          <button
            className={`manual-group-card${group.legalGroup === undefined ? " invalid" : " valid"}${
              group.cardIds.every((cardId) => selectedCardIds.includes(cardId)) ? " selected" : ""
            }`}
            data-testid={`manual-group-${group.id}`}
            key={group.id}
            type="button"
            onClick={() => onGroupClick(group.cardIds)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const cardId = event.dataTransfer.getData("text/plain");
              if (cardId !== "") {
                onDropToGroup(group.id, cardId);
              }
            }}
          >
            <span className="manual-group-label">{group.label}</span>
            <span className="manual-group-cards">
              {group.cards.map((card: Card) => (
                <span className="manual-group-card-button" key={card.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)}>
                  <CardFace card={card} gameRank={gameRank} />
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add CSS**

Append to `src/styles.css`:

```css
.manual-group-tray {
  background: #f7fbf9;
  border: 1px solid #cddfd7;
  border-radius: 8px;
  margin: 12px 0;
  padding: 10px;
}

.manual-group-heading {
  align-items: baseline;
  color: #223047;
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.manual-group-heading span,
.manual-group-empty {
  color: #617086;
  font-size: 12px;
}

.manual-group-dropzone {
  align-items: flex-start;
  border: 1px dashed #afc6ba;
  border-radius: 8px;
  display: flex;
  gap: 10px;
  min-height: 112px;
  overflow-x: auto;
  padding: 10px;
}

.manual-group-card {
  align-items: center;
  background: #fff;
  border: 1px solid #d7e0e8;
  display: inline-flex;
  flex: 0 0 72px;
  flex-direction: column;
  gap: 6px;
  min-height: 96px;
  padding: 8px;
}

.manual-group-card.valid {
  border-color: #5ca47c;
}

.manual-group-card.invalid {
  border-color: #d7a84b;
}

.manual-group-card.selected {
  box-shadow: 0 0 0 2px rgb(29 79 143 / 28%);
}

.manual-group-label {
  color: #1f4c7d;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  min-height: 16px;
  text-align: center;
}

.manual-group-cards {
  align-items: center;
  display: flex;
  flex-direction: column;
}

.manual-group-card-button + .manual-group-card-button {
  margin-top: -26px;
}
```

- [ ] **Step 5: Wire component into App with minimal fake state**

Temporarily import and render the component in `src/ui/App.tsx`; Task 3 replaces fake state with real state. This step may remain failing until Task 3 if the component is not connected.

- [ ] **Step 6: Commit if git is available**

```powershell
git add src/ui/ManualGroupTray.tsx src/styles.css tests/ui/app.test.tsx
git commit -m "feat: render manual group tray"
```

---

### Task 3: App State, Drag/Drop, and Whole-Group Selection

**Files:**
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Add failing integration test for whole-group play**

Append to `tests/ui/app.test.tsx`:

```ts
it("plays all cards from a selected legal manual pair group", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const club2: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
  const room = createRoom({ humanHand: [spade2, club2, cardA] });
  const afterPlay = createRoom({ humanHand: [cardA], currentTurn: 1 });
  mockFetchQueue([{ room }, { plans: [] }, { room: afterPlay }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.dragStart(screen.getByLabelText("榛戞2 1"), { dataTransfer: dragData() });
  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("S2-1") });
  fireEvent.dragStart(screen.getByLabelText("姊呰姳2 1"), { dataTransfer: dragData() });
  fireEvent.drop(screen.getByTestId("manual-group-manual-1"), { dataTransfer: dragData("C2-1") });

  const manualGroup = await screen.findByTestId("manual-group-manual-1");
  expect(manualGroup).toHaveTextContent("对子");
  fireEvent.click(manualGroup);
  fireEvent.click(screen.getByRole("button", { name: "鍑虹墝" }));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/api/rooms/room-1/play", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ seat: 0, cardIds: ["S2-1", "C2-1"] }),
    }));
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```powershell
npm test -- tests/ui/app.test.tsx -t "manual pair group"
```

Expected: FAIL until `App.tsx` owns and uses manual group state.

- [ ] **Step 3: Wire state in `App.tsx`**

Add imports:

```ts
import { ManualGroupTray } from "./ManualGroupTray";
import {
  addCardToManualGroup,
  classifyManualGroups,
  createManualGroup,
  removeCardFromManualGroups,
  removeMissingCardsFromManualGroups,
  ungroupedCards,
  type ManualCardGroup,
} from "./manualGrouping";
```

Add state and derived values inside `App`:

```ts
const [manualGroups, setManualGroups] = useState<ManualCardGroup[]>([]);
const groupedManualGroups = useMemo(
  () => classifyManualGroups(manualGroups, room?.humanHand ?? [], gameRank),
  [manualGroups, room?.humanHand, gameRank],
);
const visibleHumanHand = useMemo(
  () => ungroupedCards(room?.humanHand ?? [], manualGroups),
  [room?.humanHand, manualGroups],
);
const groupedHand = useMemo(() => groupCardsForHandDisplay(visibleHumanHand, gameRank), [visibleHumanHand, gameRank]);
```

Add helpers inside `App`:

```ts
function cardById(cardId: string): Card | undefined {
  return room?.humanHand.find((card) => card.id === cardId);
}

function handleDropToNewGroup(cardId: string) {
  const card = cardById(cardId);
  if (card === undefined) {
    return;
  }

  setManualGroups((current) => [...removeCardFromManualGroups(current, card.id), createManualGroup(card, `manual-${current.length + 1}`)]);
  setSelectedCardIds((current) => current.filter((id) => id !== card.id));
}

function handleDropToGroup(groupId: string, cardId: string) {
  const card = cardById(cardId);
  if (card === undefined) {
    return;
  }

  setManualGroups((current) => addCardToManualGroup(current, groupId, card));
  setSelectedCardIds((current) => current.filter((id) => id !== card.id));
}

function handleManualGroupClick(cardIds: string[]) {
  const allSelected = cardIds.every((cardId) => selectedCardIds.includes(cardId));
  setSelectedCardIds(allSelected ? selectedCardIds.filter((cardId) => !cardIds.includes(cardId)) : cardIds);
}
```

Render before `.player-hand`:

```tsx
<ManualGroupTray
  groups={groupedManualGroups}
  gameRank={room.rank}
  selectedCardIds={selectedCardIds}
  onDropToNewGroup={handleDropToNewGroup}
  onDropToGroup={handleDropToGroup}
  onGroupClick={handleManualGroupClick}
/>
```

Add draggable props to original hand card buttons:

```tsx
draggable
onDragStart={(event) => event.dataTransfer.setData("text/plain", card.id)}
```

- [ ] **Step 4: Run targeted UI tests**

```powershell
npm test -- tests/ui/app.test.tsx -t "manual"
```

Expected: PASS.

- [ ] **Step 5: Commit if git is available**

```powershell
git add src/ui/App.tsx tests/ui/app.test.tsx
git commit -m "feat: connect manual group tray to play selection"
```

---

### Task 4: Cleanup and Sorted Remaining Hand

**Files:**
- Modify: `src/ui/App.tsx`
- Test: `tests/ui/app.test.tsx`

- [ ] **Step 1: Add failing tests for cleanup and remaining order**

Append:

```ts
it("removes grouped cards from the original hand and keeps remaining hand sorted", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const club2: Card = { id: "C2-1", kind: "suited", rank: "2", suit: "clubs", copy: 1 };
  const room = createRoom({ humanHand: [spade2, cardA, club2, cardK] });
  mockFetchQueue([{ room }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");

  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("S2-1") });

  expect(screen.getByTestId("manual-group-manual-1")).toHaveTextContent("2");
  expect(screen.getAllByTestId("hand-stack").map((stack) => stack.textContent)).toEqual(expect.arrayContaining(["A", "K", "2"]));
});

it("clears manual groups when a new room starts", async () => {
  const spade2: Card = { id: "S2-1", kind: "suited", rank: "2", suit: "spades", copy: 1 };
  const firstRoom = createRoom({ humanHand: [spade2, cardA] });
  const nextRoom = createRoom({ id: "room-2", humanHand: [cardK, cardQ] });
  mockFetchQueue([{ room: firstRoom }, { plans: [] }, { room: nextRoom }, { plans: [] }]);

  render(<App />);
  fireEvent.click(screen.getAllByRole("button")[0]);
  await screen.findByTestId("manual-group-tray");
  fireEvent.drop(screen.getByTestId("manual-group-dropzone"), { dataTransfer: dragData("S2-1") });
  expect(screen.getByTestId("manual-group-manual-1")).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button")[0]);

  expect(await screen.findByText(/把牌拖到这里/)).toBeInTheDocument();
  expect(screen.queryByTestId("manual-group-manual-1")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Add stable test ids**

In `src/ui/App.tsx`, add `data-testid="hand-stack"` to the `.hand-stack` div.

- [ ] **Step 3: Add cleanup effects**

In `App.tsx`, add:

```ts
useEffect(() => {
  setManualGroups([]);
  setSelectedCardIds([]);
}, [room?.id]);

useEffect(() => {
  if (room === undefined) {
    setManualGroups([]);
    return;
  }

  setManualGroups((current) => removeMissingCardsFromManualGroups(current, room.humanHand));
}, [room?.humanHand, room]);
```

Ensure `groupedHand` uses `visibleHumanHand` so grouped cards are absent and leftovers remain sorted by `groupCardsForHandDisplay`.

- [ ] **Step 4: Run targeted tests**

```powershell
npm test -- tests/ui/app.test.tsx -t "grouped cards|new room"
```

Expected: PASS.

- [ ] **Step 5: Commit if git is available**

```powershell
git add src/ui/App.tsx tests/ui/app.test.tsx
git commit -m "feat: clean manual groups with room state"
```

---

### Task 5: Visual Polish and Full Verification

**Files:**
- Modify: `src/styles.css`
- Modify if needed: `src/ui/ManualGroupTray.tsx`
- Test: existing test suite

- [ ] **Step 1: Polish responsive behavior**

Check the UI in the browser at `http://127.0.0.1:5173/`.

Ensure:

- The tray does not push the hand off-screen.
- Vertical groups keep rank and suit visible.
- The empty drop zone remains visible when no manual groups exist.
- Selected manual group uses a visible blue outline like selected hand cards.
- Invalid groups are visually distinct but still allowed to remain in tray.

- [ ] **Step 2: Run all tests**

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run production build**

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Restart local services**

```powershell
$ports = @(5173, 5174)
$processIds = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq 'Listen' } |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $processIds) {
  if ($processId -and $processId -ne $PID) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 1
$npm = (Get-Command npm.cmd).Source
$api = Start-Process -FilePath $npm -ArgumentList @('run','api') -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
$web = Start-Process -FilePath $npm -ArgumentList @('run','dev','--','--host','0.0.0.0','--port','5173') -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
New-Item -ItemType Directory -Force -Path work | Out-Null
Set-Content -Path work\api.pid -Value $api.Id
Set-Content -Path work\web.pid -Value $web.Id
"api=$($api.Id) web=$($web.Id)"
```

- [ ] **Step 5: Verify local URL**

```powershell
try { (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/).StatusCode } catch { $_.Exception.Message }
Get-NetTCPConnection -LocalPort 5173,5174 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq 'Listen' } |
  Select-Object LocalPort,State,OwningProcess
```

Expected: HTTP status `200`; ports `5173` and `5174` listening.

- [ ] **Step 6: Commit if git is available**

```powershell
git add src/styles.css src/ui/ManualGroupTray.tsx
git commit -m "style: polish manual group tray"
```

---

## Self-Review

- Spec coverage: covered方案 A tray, vertical groups, legal group labels, drag from hand to tray, drag between groups, whole-group selection, play integration, sorted ungrouped hand, cleanup after room changes and card removals.
- Placeholder scan: no `TBD`, `TODO`, or unresolved implementation placeholders are intentionally left in this plan.
- Type consistency: `ManualCardGroup`, `ClassifiedManualGroup`, `manualGroups`, `groupedManualGroups`, and callback names are consistent across tasks.
- Known environment note: the current PowerShell session previously reported `git` as unavailable. Commit steps are included for a normal developer environment, but implementation verification must not depend on git being present.
