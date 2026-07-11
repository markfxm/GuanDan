# Table Alerts and Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the game-information sidebar, default new rooms to rank 2, show low-card announcement flags, and display a two-second real-time bomb effect.

**Architecture:** Keep the backend protocol unchanged. Derive announcement flags from `PublicPlayer.handCount`; detect real-time bomb events only when an API action replaces the current room with a room containing new `playHistory` entries. Render both effects inside the existing table surface and use CSS for transitions.

**Tech Stack:** React 18, TypeScript, Testing Library, Vitest, CSS.

## Global Constraints

- Bomb effects trigger only after successful real-time play updates and last 2,000 ms.
- Replay, initial room load, pass actions, and ordinary plays do not trigger bomb effects.
- Flags show only for hand counts 1 through 9 and disappear at 0.
- Do not add dependencies or change the backend room protocol.
- This workspace is not a Git repository, so commit steps are omitted.

---

### Task 1: Default Rank and Sidebar Removal

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `createGameRoom(rank)` API.
- Produces: `DEFAULT_RANK = "2"` and a two-column `.game-grid` containing the table and plan view.

- [ ] Add tests that assert the rank select initially contains `2`, the create-room request body uses rank `2`, and no element named “牌局信息” exists.
- [ ] Run `npm test -- --run tests/ui/app.test.tsx` and confirm the new assertions fail.
- [ ] Change `DEFAULT_RANK`, remove `ExplainPanel`, `explainCollapsed`, its keyboard coupling, and the explain-column JSX.
- [ ] Change `.game-grid` and collapsed variants to two columns and remove obsolete explain-column layout selectors.
- [ ] Re-run the UI test and confirm these assertions pass.

### Task 2: Low-Card Announcement Flags

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `LowCardFlag({ count }: { count: number })`, returning a `data-testid="low-card-flag"` element only for counts 1 through 9.

- [ ] Add tests for counts 9, 10, and 0, plus an API room update changing the displayed count.
- [ ] Run the focused tests and confirm the flag assertions fail.
- [ ] Render `LowCardFlag` inside each `.seat-panel` and add seat-relative positioning.
- [ ] Add flagpole, cloth, rise, and reduced-motion CSS without covering seat text.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Real-Time Bomb Effect

**Files:**
- Modify: `tests/ui/app.test.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `BombEffectState = { seat: Seat; eventId: string }` and `detectNewBombPlay(previousRoom, nextRoom)`.
- Trigger types: `bomb`, `joker-bomb`, `straight-flush`.

- [ ] Add fake-timer tests proving an API update with a new bomb play renders `data-testid="bomb-effect"`, disappears after 2,000 ms, and ordinary play does not render it.
- [ ] Add an initial-load test proving pre-existing bomb history does not trigger the effect.
- [ ] Run the focused tests and confirm they fail.
- [ ] Centralize successful real-time room replacement in a helper that compares old/new `playHistory`, sets bomb state, and schedules cleanup.
- [ ] Render the effect in `.table-surface` with the triggering seat class.
- [ ] Add burst, flash, smoke, and reduced-motion CSS, constrained to the table surface.
- [ ] Re-run UI tests, then run `npm run build`.
- [ ] Start or restart the local API and frontend server, then inspect desktop and mobile screenshots for overlap and blank-state regressions.
