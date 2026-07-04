# Guandan Hand Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local browser-based Guandan hand planning research tool that generates, validates, visualizes, scores, and explains 27-card grouping plans.

**Architecture:** Use one TypeScript monorepo-style Vite app with a reusable pure engine under `src/engine`, a Fastify API under `src/server`, and a React UI under `src/ui`. The engine must not depend on HTTP or React so it can later power four-player AI logic.

**Tech Stack:** Node 24, npm, TypeScript, Vite, React, Vitest, Fastify, lucide-react.

---

## File Structure

- Create `package.json`: npm scripts and dependencies.
- Create `tsconfig.json`: shared TypeScript compiler settings.
- Create `index.html`: Vite app entry.
- Create `src/main.tsx`: React bootstrap.
- Create `src/styles.css`: app-wide card and layout styling.
- Create `src/engine/cards.ts`: ranks, suits, physical cards, deck creation, rank ordering, and card formatting.
- Create `src/engine/validation.ts`: two-deck hand validation.
- Create `src/engine/groups.ts`: candidate group types and group detection.
- Create `src/engine/planner.ts`: bounded plan generation.
- Create `src/engine/scorer.ts`: PDF-derived scoring and explanation logic.
- Create `src/server/api.ts`: Fastify routes for deal, validation, and plans.
- Create `src/server/dev.ts`: local API server entry.
- Create `src/ui/App.tsx`: three-column research table.
- Create `src/ui/CardFace.tsx`: visual playing card component.
- Create `src/ui/PlanView.tsx`: visual grouped-plan display.
- Create `src/ui/ExplainPanel.tsx`: score and explanation panel.
- Create `src/ui/api.ts`: frontend API client.
- Create `tests/engine/cards.test.ts`: deck and rank-order tests.
- Create `tests/engine/validation.test.ts`: validation tests.
- Create `tests/engine/groups.test.ts`: group detection tests.
- Create `tests/engine/planner.test.ts`: plan partition tests.
- Create `tests/engine/scorer.test.ts`: scoring behavior tests.
- Create `tests/server/api.test.ts`: API route tests.
- Create `tests/ui/app.test.tsx`: core UI rendering tests.

## Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/ui/App.tsx`
- Create: `src/styles.css`
- Create: `tests/setup.ts`

- [ ] **Step 1: Write the initial package and config files**

Create `package.json`:

```json
{
  "name": "guandan-hand-planner",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "api": "tsx src/server/dev.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc --noEmit && vite build"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "fastify": "^5.2.1",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tsx": "^4.19.2",
    "vite": "^6.0.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>掼蛋组牌研究工具</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./ui/App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Create `src/ui/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="panel">
        <h1>掼蛋组牌研究台</h1>
        <p>随机发牌或录入手牌后，生成多套视觉化组牌方案。</p>
      </section>
    </main>
  );
}
```

Create `src/styles.css`:

```css
:root {
  font-family: Inter, "Microsoft YaHei", system-ui, sans-serif;
  color: #17202a;
  background: #eef2f6;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 16px;
}

.panel {
  background: #fff;
  border: 1px solid #d8dee6;
  border-radius: 8px;
  padding: 16px;
}
```

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Add Vite test config**

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
  },
});
```

- [ ] **Step 3: Install dependencies**

Run:

```powershell
npm install
```

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 4: Verify the skeleton builds**

Run:

```powershell
npm test
npm run build
```

Expected: Vitest reports no tests found or zero test files without TypeScript errors, and Vite build succeeds.

## Task 2: Card Model And Deck

**Files:**
- Create: `tests/engine/cards.test.ts`
- Create: `src/engine/cards.ts`

- [ ] **Step 1: Write failing card tests**

Create `tests/engine/cards.test.ts`:

```ts
import { createDeck, formatCard, getRankOrder, isHeartRankWild, type Card } from "../../src/engine/cards";

it("creates 108 physical cards with two copies of each suited card and four jokers", () => {
  const deck = createDeck();
  expect(deck).toHaveLength(108);
  expect(new Set(deck.map((card) => card.id)).size).toBe(108);
  expect(deck.filter((card) => card.kind === "joker")).toHaveLength(4);
  expect(deck.filter((card) => card.kind === "suited" && card.rank === "A" && card.suit === "spades")).toHaveLength(2);
});

it("orders rank 10 above A and below jokers", () => {
  expect(getRankOrder("10")).toEqual(["BJ", "SJ", "10", "A", "K", "Q", "J", "9", "8", "7", "6", "5", "4", "3", "2"]);
});

it("detects heart rank wild cards", () => {
  const card: Card = { id: "H10-1", kind: "suited", rank: "10", suit: "hearts", copy: 1 };
  expect(isHeartRankWild(card, "10")).toBe(true);
  expect(formatCard(card)).toBe("♥10#1");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test tests/engine/cards.test.ts
```

Expected: FAIL because `src/engine/cards.ts` does not exist.

- [ ] **Step 3: Implement card model**

Create `src/engine/cards.ts`:

```ts
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type Suit = "spades" | "hearts" | "clubs" | "diamonds";
export type JokerRank = "SJ" | "BJ";

export type SuitedCard = {
  id: string;
  kind: "suited";
  rank: Rank;
  suit: Suit;
  copy: 1 | 2;
};

export type JokerCard = {
  id: string;
  kind: "joker";
  rank: JokerRank;
  copy: 1 | 2;
};

export type Card = SuitedCard | JokerCard;
export type GameRank = Rank;

export const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUITS: Suit[] = ["spades", "hearts", "clubs", "diamonds"];

const suitPrefix: Record<Suit, string> = {
  spades: "S",
  hearts: "H",
  clubs: "C",
  diamonds: "D",
};

const suitSymbol: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
};

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const copy of [1, 2] as const) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${suitPrefix[suit]}${rank}-${copy}`, kind: "suited", rank, suit, copy });
      }
    }
    cards.push({ id: `SJ-${copy}`, kind: "joker", rank: "SJ", copy });
    cards.push({ id: `BJ-${copy}`, kind: "joker", rank: "BJ", copy });
  }
  return cards;
}

export function getRankOrder(gameRank: GameRank): Array<Rank | JokerRank> {
  const base: Rank[] = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  return ["BJ", "SJ", gameRank, ...base.filter((rank) => rank !== gameRank)];
}

export function rankStrength(rank: Rank | JokerRank, gameRank: GameRank): number {
  const order = getRankOrder(gameRank);
  return order.length - order.indexOf(rank);
}

export function isHeartRankWild(card: Card, gameRank: GameRank): boolean {
  return card.kind === "suited" && card.suit === "hearts" && card.rank === gameRank;
}

export function formatCard(card: Card): string {
  if (card.kind === "joker") return `${card.rank}#${card.copy}`;
  return `${suitSymbol[card.suit]}${card.rank}#${card.copy}`;
}
```

- [ ] **Step 4: Verify card tests pass**

Run:

```powershell
npm test tests/engine/cards.test.ts
```

Expected: PASS.

## Task 3: Hand Validation And Deal

**Files:**
- Create: `tests/engine/validation.test.ts`
- Create: `src/engine/validation.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/engine/validation.test.ts`:

```ts
import { createDeck } from "../../src/engine/cards";
import { dealHand, validateHand } from "../../src/engine/validation";

it("deals 27 unique physical cards", () => {
  const hand = dealHand("10", 123);
  expect(hand).toHaveLength(27);
  expect(new Set(hand.map((card) => card.id)).size).toBe(27);
});

it("accepts a valid 27 card hand", () => {
  const hand = createDeck().slice(0, 27);
  expect(validateHand(hand).valid).toBe(true);
});

it("rejects duplicate physical card ids", () => {
  const deck = createDeck();
  const hand = [deck[0], deck[0], ...deck.slice(1, 26)];
  expect(validateHand(hand).errors).toContain("Duplicate physical card: S2-1");
});

it("rejects hands that are not 27 cards", () => {
  expect(validateHand(createDeck().slice(0, 26)).errors).toContain("Hand must contain exactly 27 cards.");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test tests/engine/validation.test.ts
```

Expected: FAIL because `validation.ts` does not exist.

- [ ] **Step 3: Implement validation and seeded deal**

Create `src/engine/validation.ts`:

```ts
import { createDeck, type Card, type GameRank } from "./cards";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function dealHand(_gameRank: GameRank, seed = Date.now()): Card[] {
  const random = seededRandom(seed);
  const deck = [...createDeck()];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 27);
}

export function validateHand(cards: Card[]): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  if (cards.length !== 27) {
    errors.push("Hand must contain exactly 27 cards.");
  }
  for (const card of cards) {
    if (seen.has(card.id)) {
      errors.push(`Duplicate physical card: ${card.id}`);
    }
    seen.add(card.id);
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}
```

- [ ] **Step 4: Verify validation tests pass**

Run:

```powershell
npm test tests/engine/validation.test.ts
```

Expected: PASS.

## Task 4: Group Detection

**Files:**
- Create: `tests/engine/groups.test.ts`
- Create: `src/engine/groups.ts`

- [ ] **Step 1: Write failing group detection tests**

Create `tests/engine/groups.test.ts`:

```ts
import { createDeck, type Card } from "../../src/engine/cards";
import { detectGroups } from "../../src/engine/groups";

function take(predicate: (card: Card) => boolean, count: number): Card[] {
  return createDeck().filter(predicate).slice(0, count);
}

it("detects same-rank bombs", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "A", 4);
  const groups = detectGroups(cards, "10");
  expect(groups.some((group) => group.type === "bomb" && group.cards.length === 4)).toBe(true);
});

it("detects joker bomb with four jokers", () => {
  const cards = createDeck().filter((card) => card.kind === "joker");
  const groups = detectGroups(cards, "10");
  expect(groups.some((group) => group.type === "joker-bomb")).toBe(true);
});

it("detects pairs and singles", () => {
  const cards = take((card) => card.kind === "suited" && card.rank === "K", 2);
  const groups = detectGroups(cards, "10");
  expect(groups.some((group) => group.type === "pair")).toBe(true);
  expect(groups.filter((group) => group.type === "single")).toHaveLength(2);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test tests/engine/groups.test.ts
```

Expected: FAIL because `groups.ts` does not exist.

- [ ] **Step 3: Implement initial group detector**

Create `src/engine/groups.ts`:

```ts
import { isHeartRankWild, rankStrength, type Card, type GameRank, type Rank } from "./cards";

export type GroupType =
  | "single"
  | "pair"
  | "triple"
  | "full-house"
  | "straight"
  | "consecutive-pairs"
  | "plate"
  | "bomb"
  | "straight-flush"
  | "joker-bomb";

export type CardGroup = {
  id: string;
  type: GroupType;
  label: string;
  purpose: "attack" | "engine" | "recovery" | "tail-control" | "risk" | "filler";
  cards: Card[];
  wildcards: Card[];
  strength: number;
};

function rankKey(card: Card): string {
  return card.kind === "joker" ? card.rank : card.rank;
}

function byRank(cards: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const card of cards) {
    const key = rankKey(card);
    map.set(key, [...(map.get(key) ?? []), card]);
  }
  return map;
}

function groupId(type: GroupType, cards: Card[]): string {
  return `${type}:${cards.map((card) => card.id).sort().join(",")}`;
}

export function detectGroups(cards: Card[], gameRank: GameRank): CardGroup[] {
  const groups: CardGroup[] = [];
  const wildcards = cards.filter((card) => isHeartRankWild(card, gameRank));
  for (const card of cards) {
    groups.push({
      id: groupId("single", [card]),
      type: "single",
      label: "单张",
      purpose: card.kind === "joker" || (card.kind === "suited" && rankStrength(card.rank, gameRank) >= 12) ? "tail-control" : "risk",
      cards: [card],
      wildcards: wildcards.includes(card) ? [card] : [],
      strength: card.kind === "joker" ? rankStrength(card.rank, gameRank) : rankStrength(card.rank, gameRank),
    });
  }

  for (const [rank, sameRankCards] of byRank(cards)) {
    if (sameRankCards.length >= 2 && rank !== "SJ" && rank !== "BJ") {
      const strength = rankStrength(rank as Rank, gameRank);
      groups.push({
        id: groupId("pair", sameRankCards.slice(0, 2)),
        type: "pair",
        label: "对子",
        purpose: "filler",
        cards: sameRankCards.slice(0, 2),
        wildcards: sameRankCards.slice(0, 2).filter((card) => wildcards.includes(card)),
        strength,
      });
    }
    if (sameRankCards.length >= 3 && rank !== "SJ" && rank !== "BJ") {
      groups.push({
        id: groupId("triple", sameRankCards.slice(0, 3)),
        type: "triple",
        label: "三张",
        purpose: "filler",
        cards: sameRankCards.slice(0, 3),
        wildcards: sameRankCards.slice(0, 3).filter((card) => wildcards.includes(card)),
        strength: rankStrength(rank as Rank, gameRank),
      });
    }
    if (sameRankCards.length >= 4 && rank !== "SJ" && rank !== "BJ") {
      groups.push({
        id: groupId("bomb", sameRankCards.slice(0, sameRankCards.length)),
        type: "bomb",
        label: `${sameRankCards.length}炸`,
        purpose: "recovery",
        cards: sameRankCards,
        wildcards: sameRankCards.filter((card) => wildcards.includes(card)),
        strength: 100 + sameRankCards.length * 10 + rankStrength(rank as Rank, gameRank),
      });
    }
  }

  const jokers = cards.filter((card) => card.kind === "joker");
  if (jokers.length === 4) {
    groups.push({
      id: groupId("joker-bomb", jokers),
      type: "joker-bomb",
      label: "四王炸",
      purpose: "recovery",
      cards: jokers,
      wildcards: [],
      strength: 1000,
    });
  }
  return groups;
}
```

- [ ] **Step 4: Verify group detection tests pass**

Run:

```powershell
npm test tests/engine/groups.test.ts
```

Expected: PASS.

## Task 5: Plan Generation

**Files:**
- Create: `tests/engine/planner.test.ts`
- Create: `src/engine/planner.ts`

- [ ] **Step 1: Write failing planner tests**

Create `tests/engine/planner.test.ts`:

```ts
import { createDeck } from "../../src/engine/cards";
import { generatePlans } from "../../src/engine/planner";

it("generates complete plans that consume each card exactly once", () => {
  const hand = createDeck().slice(0, 27);
  const plans = generatePlans(hand, "10", 3);
  expect(plans.length).toBeGreaterThan(0);
  for (const plan of plans) {
    const usedIds = plan.groups.flatMap((group) => group.cards.map((card) => card.id));
    expect(usedIds).toHaveLength(27);
    expect(new Set(usedIds).size).toBe(27);
  }
});

it("returns named plan archetypes", () => {
  const hand = createDeck().slice(0, 27);
  const plans = generatePlans(hand, "10", 5);
  expect(plans.map((plan) => plan.name)).toContain("均衡推荐");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test tests/engine/planner.test.ts
```

Expected: FAIL because `planner.ts` does not exist.

- [ ] **Step 3: Implement deterministic baseline planner**

Create `src/engine/planner.ts`:

```ts
import { rankStrength, type Card, type GameRank } from "./cards";
import { detectGroups, type CardGroup } from "./groups";

export type PlanArchetype = "balanced" | "fast" | "control" | "linked" | "wildcard";

export type Plan = {
  id: PlanArchetype;
  name: string;
  groups: CardGroup[];
};

const archetypeNames: Record<PlanArchetype, string> = {
  balanced: "均衡推荐",
  fast: "快速跑牌",
  control: "保控防守",
  linked: "连型发动",
  wildcard: "配牌激进",
};

function cardIds(cards: Card[]): Set<string> {
  return new Set(cards.map((card) => card.id));
}

function groupWeight(group: CardGroup, archetype: PlanArchetype): number {
  const sizeBonus = group.cards.length * (archetype === "fast" ? 8 : 5);
  const controlBonus = group.purpose === "recovery" || group.purpose === "tail-control" ? (archetype === "control" ? 45 : 24) : 0;
  const wildcardBonus = group.wildcards.length > 0 ? (archetype === "wildcard" ? 35 : 12) : 0;
  const linkedBonus = ["straight", "consecutive-pairs", "plate", "straight-flush"].includes(group.type) ? (archetype === "linked" ? 40 : 16) : 0;
  return group.strength + sizeBonus + controlBonus + wildcardBonus + linkedBonus;
}

function buildPlan(cards: Card[], gameRank: GameRank, archetype: PlanArchetype): Plan {
  const remaining = new Map(cards.map((card) => [card.id, card]));
  const chosen: CardGroup[] = [];
  const candidates = detectGroups(cards, gameRank).sort((a, b) => groupWeight(b, archetype) - groupWeight(a, archetype));

  for (const candidate of candidates) {
    const ids = cardIds(candidate.cards);
    const canUse = [...ids].every((id) => remaining.has(id));
    if (canUse && candidate.cards.length > 1) {
      chosen.push(candidate);
      for (const id of ids) remaining.delete(id);
    }
  }

  for (const card of remaining.values()) {
    const single = detectGroups([card], gameRank).find((group) => group.type === "single");
    if (single) chosen.push(single);
  }

  chosen.sort((a, b) => b.cards.length - a.cards.length || b.strength - a.strength);
  return { id: archetype, name: archetypeNames[archetype], groups: chosen };
}

export function generatePlans(cards: Card[], gameRank: GameRank, count = 5): Plan[] {
  const archetypes: PlanArchetype[] = ["balanced", "fast", "control", "linked", "wildcard"];
  return archetypes.slice(0, count).map((archetype) => buildPlan(cards, gameRank, archetype));
}
```

- [ ] **Step 4: Verify planner tests pass**

Run:

```powershell
npm test tests/engine/planner.test.ts
```

Expected: PASS.

## Task 6: Scoring And Explanations

**Files:**
- Create: `tests/engine/scorer.test.ts`
- Create: `src/engine/scorer.ts`
- Modify: `src/engine/planner.ts`

- [ ] **Step 1: Write failing scorer tests**

Create `tests/engine/scorer.test.ts`:

```ts
import { createDeck } from "../../src/engine/cards";
import { generatePlans } from "../../src/engine/planner";
import { scorePlan } from "../../src/engine/scorer";

it("scores every component from 0 to 100 and returns explanations", () => {
  const plan = generatePlans(createDeck().slice(0, 27), "10", 1)[0];
  const scored = scorePlan(plan, "10");
  expect(scored.score).toBeGreaterThanOrEqual(0);
  expect(scored.score).toBeLessThanOrEqual(100);
  expect(scored.explanations.length).toBeGreaterThan(0);
  expect(Object.values(scored.scoreBreakdown).every((value) => value >= 0 && value <= 100)).toBe(true);
});

it("mentions control when a plan keeps recovery cards", () => {
  const plan = generatePlans(createDeck().slice(0, 27), "10", 1)[0];
  const scored = scorePlan(plan, "10");
  expect(scored.explanations.join("")).toContain("控制");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test tests/engine/scorer.test.ts
```

Expected: FAIL because `scorer.ts` does not exist.

- [ ] **Step 3: Implement scorer**

Create `src/engine/scorer.ts`:

```ts
import type { GameRank } from "./cards";
import type { Plan } from "./planner";

export type ScoreBreakdown = {
  turnCount: number;
  controlRetained: number;
  wildcardValue: number;
  linkedTempo: number;
  singleRisk: number;
  tailControl: number;
};

export type ScoredPlan = Plan & {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  explanations: string[];
  risks: string[];
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scorePlan(plan: Plan, _gameRank: GameRank): ScoredPlan {
  const turnCount = plan.groups.length;
  const recoveryGroups = plan.groups.filter((group) => group.purpose === "recovery");
  const tailGroups = plan.groups.filter((group) => group.purpose === "tail-control");
  const linkedGroups = plan.groups.filter((group) => ["straight", "consecutive-pairs", "plate", "straight-flush"].includes(group.type));
  const singles = plan.groups.filter((group) => group.type === "single");
  const wildcardGroups = plan.groups.filter((group) => group.wildcards.length > 0);

  const scoreBreakdown: ScoreBreakdown = {
    turnCount: clamp(100 - Math.max(0, turnCount - 6) * 9),
    controlRetained: clamp(40 + recoveryGroups.length * 22 + tailGroups.length * 10),
    wildcardValue: clamp(55 + wildcardGroups.length * 18),
    linkedTempo: clamp(45 + linkedGroups.length * 20),
    singleRisk: clamp(100 - singles.length * 12),
    tailControl: clamp(45 + tailGroups.length * 22 + recoveryGroups.length * 8),
  };

  const score = clamp(
    scoreBreakdown.turnCount * 0.24 +
      scoreBreakdown.controlRetained * 0.22 +
      scoreBreakdown.wildcardValue * 0.16 +
      scoreBreakdown.linkedTempo * 0.14 +
      scoreBreakdown.singleRisk * 0.12 +
      scoreBreakdown.tailControl * 0.12,
  );

  const explanations = [
    `本方案预计 ${turnCount} 手完成，评分同时考虑手数与控制保留。`,
    recoveryGroups.length > 0 ? `保留 ${recoveryGroups.length} 组控制/回收资源，符合“不为少一手拆光控制”的策略。` : "控制资源偏少，后续容易失去回收能力。",
    wildcardGroups.length > 0 ? "逢人配被用于形成关键结构或提升控制价值。" : "未消耗逢人配或未检测到逢人配参与关键结构。",
  ];

  const risks = singles.length > 0 ? [`仍有 ${singles.length} 张单牌，需要关注低价值裸单风险。`] : [];

  return { ...plan, score, scoreBreakdown, explanations, risks };
}

export function scorePlans(plans: Plan[], gameRank: GameRank): ScoredPlan[] {
  return plans.map((plan) => scorePlan(plan, gameRank)).sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Verify scorer tests pass**

Run:

```powershell
npm test tests/engine/scorer.test.ts
```

Expected: PASS.

## Task 7: Fastify API

**Files:**
- Create: `tests/server/api.test.ts`
- Create: `src/server/api.ts`
- Create: `src/server/dev.ts`

- [ ] **Step 1: Write failing API tests**

Create `tests/server/api.test.ts`:

```ts
import { buildApi } from "../../src/server/api";

it("deals 27 cards", async () => {
  const app = buildApi();
  const response = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
  expect(response.statusCode).toBe(200);
  expect(response.json().hand).toHaveLength(27);
});

it("returns scored plans", async () => {
  const app = buildApi();
  const deal = await app.inject({ method: "POST", url: "/api/deal", payload: { rank: "10", seed: 1 } });
  const hand = deal.json().hand;
  const response = await app.inject({ method: "POST", url: "/api/plans", payload: { rank: "10", cards: hand, count: 3 } });
  expect(response.statusCode).toBe(200);
  expect(response.json().plans).toHaveLength(3);
  expect(response.json().plans[0].score).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
npm test tests/server/api.test.ts
```

Expected: FAIL because `src/server/api.ts` does not exist.

- [ ] **Step 3: Implement API routes**

Create `src/server/api.ts`:

```ts
import Fastify from "fastify";
import { type Card, type GameRank } from "../engine/cards";
import { generatePlans } from "../engine/planner";
import { scorePlans } from "../engine/scorer";
import { dealHand, validateHand } from "../engine/validation";

type DealBody = { rank?: GameRank; seed?: number };
type ValidateBody = { cards?: Card[] };
type PlansBody = { rank?: GameRank; cards?: Card[]; count?: number };

export function buildApi() {
  const app = Fastify({ logger: false });

  app.post<{ Body: DealBody }>("/api/deal", async (request) => {
    const rank = request.body.rank ?? "10";
    return { hand: dealHand(rank, request.body.seed) };
  });

  app.post<{ Body: ValidateBody }>("/api/validate-hand", async (request, reply) => {
    if (!request.body.cards) return reply.code(400).send({ valid: false, errors: ["cards is required"], warnings: [] });
    return validateHand(request.body.cards);
  });

  app.post<{ Body: PlansBody }>("/api/plans", async (request, reply) => {
    const rank = request.body.rank ?? "10";
    const cards = request.body.cards ?? [];
    const validation = validateHand(cards);
    if (!validation.valid) return reply.code(400).send(validation);
    const plans = scorePlans(generatePlans(cards, rank, request.body.count ?? 5), rank);
    return { plans };
  });

  return app;
}
```

Create `src/server/dev.ts`:

```ts
import { buildApi } from "./api";

const app = buildApi();
const port = Number(process.env.PORT ?? 5174);

await app.listen({ host: "127.0.0.1", port });
console.log(`Guandan API listening on http://127.0.0.1:${port}`);
```

- [ ] **Step 4: Verify API tests pass**

Run:

```powershell
npm test tests/server/api.test.ts
```

Expected: PASS.

## Task 8: Visual UI

**Files:**
- Create: `tests/ui/app.test.tsx`
- Create: `src/ui/CardFace.tsx`
- Create: `src/ui/PlanView.tsx`
- Create: `src/ui/ExplainPanel.tsx`
- Create: `src/ui/api.ts`
- Modify: `src/ui/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing UI test**

Create `tests/ui/app.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "../../src/ui/App";

it("renders the three-column hand planning research table", () => {
  render(<App />);
  expect(screen.getByText("原始手牌")).toBeInTheDocument();
  expect(screen.getByText("视觉化组牌方案")).toBeInTheDocument();
  expect(screen.getByText("策略解释")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI test and verify failure**

Run:

```powershell
npm test tests/ui/app.test.tsx
```

Expected: FAIL because the current app only renders the skeleton text.

- [ ] **Step 3: Implement visual card component**

Create `src/ui/CardFace.tsx`:

```tsx
import type { Card, GameRank } from "../engine/cards";
import { isHeartRankWild } from "../engine/cards";

const suitText = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
} as const;

export function CardFace({ card, rank }: { card: Card; rank: GameRank }) {
  if (card.kind === "joker") {
    return <span className="card-face joker">{card.rank === "BJ" ? "大王" : "小王"}</span>;
  }
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const wild = isHeartRankWild(card, rank);
  return (
    <span className={`card-face ${red ? "red" : ""} ${wild ? "wild" : ""}`}>
      <strong>{card.rank}</strong>
      <small>{suitText[card.suit]}{wild ? "配" : ""}</small>
    </span>
  );
}
```

- [ ] **Step 4: Implement API client**

Create `src/ui/api.ts`:

```ts
import type { Card, GameRank } from "../engine/cards";
import type { ScoredPlan } from "../engine/scorer";

const apiBase = "http://127.0.0.1:5174";

export async function deal(rank: GameRank): Promise<Card[]> {
  const response = await fetch(`${apiBase}/api/deal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rank }),
  });
  const data = await response.json();
  return data.hand;
}

export async function plans(rank: GameRank, cards: Card[]): Promise<ScoredPlan[]> {
  const response = await fetch(`${apiBase}/api/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rank, cards, count: 5 }),
  });
  const data = await response.json();
  return data.plans;
}
```

- [ ] **Step 5: Implement plan and explanation components**

Create `src/ui/PlanView.tsx`:

```tsx
import type { GameRank } from "../engine/cards";
import type { ScoredPlan } from "../engine/scorer";
import { CardFace } from "./CardFace";

export function PlanView({ plan, rank }: { plan: ScoredPlan; rank: GameRank }) {
  return (
    <article className="plan-card">
      <header className="plan-header">
        <strong>{plan.name}</strong>
        <span>{plan.score} 分</span>
      </header>
      <div className="plan-groups">
        {plan.groups.map((group) => (
          <div className="group-row" key={group.id}>
            <span className="group-label">{group.label}</span>
            <div className="card-row">{group.cards.map((card) => <CardFace key={card.id} card={card} rank={rank} />)}</div>
            <span className="purpose">{group.purpose}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
```

Create `src/ui/ExplainPanel.tsx`:

```tsx
import type { ScoredPlan } from "../engine/scorer";

export function ExplainPanel({ plan }: { plan?: ScoredPlan }) {
  if (!plan) return <p>生成方案后查看评分拆解。</p>;
  return (
    <div className="explain-stack">
      <h2>策略解释</h2>
      {Object.entries(plan.scoreBreakdown).map(([key, value]) => (
        <div className="metric" key={key}>
          <span>{key}</span>
          <div><b style={{ width: `${value}%` }} /></div>
          <em>{value}</em>
        </div>
      ))}
      {plan.explanations.map((text) => <p key={text}>{text}</p>)}
      {plan.risks.map((text) => <p className="risk" key={text}>{text}</p>)}
    </div>
  );
}
```

- [ ] **Step 6: Replace App with three-column UI**

Modify `src/ui/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import type { Card, GameRank } from "../engine/cards";
import type { ScoredPlan } from "../engine/scorer";
import { CardFace } from "./CardFace";
import { ExplainPanel } from "./ExplainPanel";
import { deal, plans } from "./api";
import { PlanView } from "./PlanView";

export function App() {
  const [rank, setRank] = useState<GameRank>("10");
  const [hand, setHand] = useState<Card[]>([]);
  const [planList, setPlanList] = useState<ScoredPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  async function handleDeal() {
    const nextHand = await deal(rank);
    setHand(nextHand);
    setPlanList([]);
    setSelectedPlanId("");
  }

  async function handlePlans() {
    const nextPlans = await plans(rank, hand);
    setPlanList(nextPlans);
    setSelectedPlanId(nextPlans[0]?.id ?? "");
  }

  useEffect(() => {
    void handleDeal();
  }, []);

  const selectedPlan = planList.find((plan) => plan.id === selectedPlanId) ?? planList[0];

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="panel hand-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">当前级牌</span>
              <select value={rank} onChange={(event) => setRank(event.target.value as GameRank)}>
                {["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <button onClick={handleDeal}>随机发牌</button>
          </div>
          <h2>原始手牌</h2>
          <div className="card-grid">{hand.map((card) => <CardFace key={card.id} card={card} rank={rank} />)}</div>
        </aside>

        <section className="panel plans-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">AI 方案</span>
              <h1>视觉化组牌方案</h1>
            </div>
            <button disabled={hand.length !== 27} onClick={handlePlans}><Wand2 size={16} />生成方案</button>
          </div>
          <div className="plans-list">
            {planList.map((plan) => (
              <button className="plan-button" key={plan.id} onClick={() => setSelectedPlanId(plan.id)}>
                <PlanView plan={plan} rank={rank} />
              </button>
            ))}
          </div>
        </section>

        <aside className="panel explain-panel">
          <ExplainPanel plan={selectedPlan} />
        </aside>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Add visual styles**

Append to `src/styles.css`:

```css
.workspace {
  display: grid;
  grid-template-columns: 320px minmax(420px, 1fr) 320px;
  gap: 14px;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  display: block;
  color: #667085;
  font-size: 12px;
}

.card-grid,
.card-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.card-face {
  width: 38px;
  height: 54px;
  border: 1px solid #cfd5dd;
  border-radius: 6px;
  background: #fff;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

.card-face.red {
  color: #b00020;
}

.card-face.wild {
  border-color: #b00020;
  background: #fff5f6;
}

.card-face.joker {
  background: #1f2933;
  color: #fff;
}

.plans-list,
.plan-groups,
.explain-stack {
  display: grid;
  gap: 10px;
}

.plan-button {
  background: transparent;
  border: 0;
  padding: 0;
  text-align: left;
}

.plan-card {
  border: 1px solid #d8dee6;
  border-radius: 8px;
  padding: 10px;
  background: #fff;
}

.plan-header,
.group-row,
.metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.group-row {
  display: grid;
  grid-template-columns: 72px 1fr 86px;
  background: #f7f9fb;
  border-radius: 7px;
  padding: 7px;
}

.group-label,
.purpose {
  font-size: 12px;
  font-weight: 700;
}

.metric div {
  flex: 1;
  height: 8px;
  background: #e6eaf0;
  border-radius: 99px;
  overflow: hidden;
}

.metric b {
  display: block;
  height: 100%;
  background: #0b6b50;
}

.risk {
  color: #9a3412;
}
```

- [ ] **Step 8: Verify UI test passes**

Run:

```powershell
npm test tests/ui/app.test.tsx
```

Expected: PASS.

## Task 9: End-To-End Verification

**Files:**
- No new files.

- [ ] **Step 1: Run all tests**

Run:

```powershell
npm test
```

Expected: all test files pass.

- [ ] **Step 2: Run build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build complete with no errors.

- [ ] **Step 3: Start API server**

Run:

```powershell
npm run api
```

Expected: console prints `Guandan API listening on http://127.0.0.1:5174`.

- [ ] **Step 4: Start frontend server in a second terminal**

Run:

```powershell
npm run dev
```

Expected: Vite prints a localhost URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 5: Manual smoke test**

Open the Vite URL and verify:

- The left column renders 27 visual cards.
- The current-rank selector defaults to 10.
- Heart 10 cards have the wild-card style when present.
- Clicking `随机发牌` refreshes the visual hand.
- Clicking `生成方案` renders 3-5 visual plans.
- Each plan shows grouped rows with cards, labels, and purpose tags.
- The right panel shows score bars and Chinese strategy explanations.

- [ ] **Step 6: Record git availability**

Run:

```powershell
git --version
```

Expected in the current environment: command may fail because git was not found during design. If it fails, record that commits were skipped because `git` is unavailable. If it succeeds, commit the completed implementation:

```powershell
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src tests docs
git commit -m "feat: build guandan hand planning tool"
```

## Self-Review

- Spec coverage:
  - Local browser app with Node service: Tasks 1, 7, 8, 9.
  - 108-card deck and current-rank ordering: Task 2.
  - Random deal and hand validation: Task 3 and Task 7.
  - Visual original hand and visual plans: Task 8.
  - Multiple grouping plans: Task 5.
  - PDF-derived scoring and explanation: Task 6.
  - Tests: Tasks 2 through 9.
- Search terms checked manually in this plan: no open-ended markers are used for implementation work.
- Type consistency:
  - `GameRank`, `Card`, `CardGroup`, `Plan`, and `ScoredPlan` are defined before downstream use.
  - API returns the same `Card` and `ScoredPlan` shapes that the UI imports.
  - Planner emits unscored `Plan`; scorer returns `ScoredPlan`.
