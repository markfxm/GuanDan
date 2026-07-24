# D2d Bounded Representative-Action Reducer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在获得独立实施授权后，为已经生成且已验证合法的 AI action candidates 建立一个确定性、有限上界、保守等价的 representative-action reducer；第一阶段只允许 detached characterization，不能改变正式出牌路径。

**Architecture:** Reducer 作为纯函数位于 action candidate 生成和 action evaluator 之间的候选边界，消费只读的合法候选、当前 trick/lead、当前 AI 已有的私有手牌验证信息、只读 plan summary 及可选的 D2c shadow annotations，返回深冻结的 representatives、来源映射和诊断。它不持有 `RoomState`，不生成新牌型，不重建 HandPlanner，不调用 runtime/selected action，也不读取对手手牌、牌堆、随机数或时钟。正式集成先以 detached no-op 证明 action/runtime/candidate bytes 不变，任何 active filtering、reordering 或 action-control 都须另行批准。

**Tech Stack:** TypeScript, existing `AiAction`/`ActionCandidate`/`CardGroup` contracts, `classifyPlay`, `canBeatPlay`, existing power-group policy, Vitest, Git worktrees.

## Global Constraints

- Frozen main baseline is branch `main`, commit `c6e792f60ae898f3c8f048ac910be4cf1e242d57`, tree `c0657ca63c7db4b6f5758755f72da62d3d3c2f06`.
- Planning branch is `codex/d2d-plan`; planning worktree is `E:/workspace/掼蛋游戏开发/.worktrees/d2d-plan`; its base is the frozen commit above.
- This document is plan-only. The current turn authorizes preflight investigation, creation of this plan document, and its document commit only.
- `D2D_PREFLIGHT_INVESTIGATION_AUTHORIZED`, `D2D_PLAN_ONLY_AUTHORIZED`, and `D2D_PLAN_DOCUMENT_COMMIT_AUTHORIZED` are the only current D2d permissions.
- D2d RED, D2d implementation, hardening, detached adapter, production integration, active mode, D2e–D2g, restricted/remote/formal work, and `formalExecutionAllowed=true` are not authorized in the current turn.
- The current turn must not modify `src/**`, `tests/**`, `scripts/**`, package/lock/TypeScript/Vite/Vitest files, README/AGENTS instructions, prior D2a–D2c documents, fixtures, approvals, artifacts, or configuration.
- The only current changed path is `docs/superpowers/plans/2026-07-24-d2d-representative-action-reducer.md`.
- Future implementation must reuse `AiAction`, `ActionCandidate`, `Card`, and `CardGroup`; it must not copy or redefine those contracts.
- Future reducer output is metadata plus references only; it must not mutate, reorder, replace, or enrich the formal candidates until a separately approved active contract exists.
- All future Vitest commands must include `--exclude ".worktrees/**"`; do not use the repository `npm test` script because it intentionally invokes the performance suite.
- No future plan step may run benchmark, simulation, performance, smoke, calibration, formal game, treatment, remote, or restricted workload.
- Every unresolved real contract is explicitly marked: `UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED`.

---

## 1. Purpose, non-goals, and authorization boundary

### 1.1 Purpose

D2d is a bounded representative-action reduction stage. It may reduce repeated or provably identical action representations only after the existing action generator has produced candidates and has already applied canonical `CardGroup` construction, lead/follow legality, pass exposure, power-group policy approval, and deterministic candidate-key ordering.

The implementation target is not “find fewer good actions.” It is “retain one original action for each conservatively proven equivalence class under a fixed cap, while retaining enough protected actions to avoid starvation.” If the proof is unavailable, the reducer retains the original action.

### 1.2 Explicit non-goals

The future work does not:

- invent a new play action, substitute cards, reclassify a card group, or repair malformed input;
- call `detectGroups` to regenerate candidates or call `generateHandPlans`/`generateFastHandPlans` to refill a cap;
- use the reducer to change `AiDecision.action`, `selectedPlanId`, `activePlanId`, runtime state, candidate score, public event, replay bytes, or room transition;
- use D2c shadow quota as a formal filter, quota source, score, action prior, or active ordering signal;
- inspect `RoomState`, another seat’s hand, `initialHands`, deck state, private runtime internals, random seed, hidden replay state, or a wall clock;
- implement D2e particles/likelihood/ESS, D2f rollout/team utility, or D2g treatment/benchmark/ablation;
- add a production adapter or a runtime feature flag in this phase.

### 1.3 Current authorization status

```text
D2D_PREFLIGHT_INVESTIGATION_AUTHORIZED
D2D_PLAN_ONLY_AUTHORIZED
D2D_PLAN_DOCUMENT_COMMIT_AUTHORIZED

D2D_RED_NOT_AUTHORIZED
D2D_IMPLEMENTATION_NOT_AUTHORIZED
D2D_PRODUCTION_INTEGRATION_NOT_AUTHORIZED
D2D_ACTIVE_MODE_NOT_AUTHORIZED
D2D_TO_D2G_NOT_AUTHORIZED
RESTRICTED_WORKLOAD_NOT_AUTHORIZED
REMOTE_OPERATIONS_NOT_AUTHORIZED
FORMAL_EXECUTION_NOT_AUTHORIZED
formalExecutionAllowed=false
```

The only deliverable in this turn is this plan document and its commit. Human review is required before any D2d RED or implementation work.

---

## 2. Frozen baseline and investigation evidence

### 2.1 Baseline identity

The main preflight must remain the first gate for any future continuation:

| Check | Required value | Investigation result |
|---|---|---|
| branch | `main` | `main` |
| HEAD | `c6e792f60ae898f3c8f048ac910be4cf1e242d57` | exact match |
| tree | `c0657ca63c7db4b6f5758755f72da62d3d3c2f06` | exact match |
| worktree status | clean | clean |
| `git diff --check` | exit 0 | exit 0 |
| D2d branch collision | absent before creation | absent |
| D2d worktree collision | absent before creation | absent |
| `.worktrees` ignore | true | true |

If a continuation sees any mismatch, it must make no branch/worktree/file change and report `D2D_PREFLIGHT_BLOCKED_BASELINE_MISMATCH`.

### 2.2 Planning worktree identity

The isolated planning worktree was created without force from the frozen commit:

```text
branch: codex/d2d-plan
path: E:/workspace/掼蛋游戏开发/.worktrees/d2d-plan
base: c6e792f60ae898f3c8f048ac910be4cf1e242d57
tree: c0657ca63c7db4b6f5758755f72da62d3d3c2f06
```

No dependency installation, test, build, benchmark, simulation, or performance command is part of this plan-only turn.

### 2.3 Inspected production files and symbols

| File | Relevant evidence |
|---|---|
| `src/ai/aiDecisionEngine.ts` | `decideAiAction`; `generateActionCandidates`; `evaluateActionCandidate`; `compareScoredCandidates`; `assertFinalAction`; returned `AiDecision` fields |
| `src/ai/contracts.ts` | `AiAction`, `AiObservation`, `ActionCandidate`, `ActionScore`, `AiRuntimeState`, `AiDecision` |
| `src/ai/runtimeContracts.ts` | `PlanSelectionMode`, `D1PlanSelectionState`; no D2d reducer contract |
| `src/ai/tactics/actionGenerator.ts` | `ActionGenerationInput`, `generateActionCandidates`, `canonicalPlayableGroups`, `passCandidate`; `Map` keyed by group identity and `localeCompare` sort |
| `src/ai/tactics/actionEvaluator.ts` | `evaluateActionCandidate`; legal/policy precondition, pass/plan/resource components |
| `src/ai/analysis/handAnalyzer.ts` | `analyzeHand`, `stableHandKey`, `maximalBombs`; derived from current AI hand |
| `src/ai/analysis/handAnalysisCache.ts` | deterministic cache key and analysis reuse |
| `src/ai/planning/handPlanner.ts` | `generateFastHandPlans`, deterministic greedy/beam cover, protected fallback |
| `src/ai/planning/planManager.ts` | `ensurePlans`, `applyExecutedAction`, `applyDynamicPlanSelection`; runtime/selected-plan ownership |
| `src/ai/planning/planEvaluator.ts` | `evaluatePlan`, `evaluateDynamicPlan`; plan-level, not legal-action-level, scoring |
| `src/ai/policy/powerGroupPolicy.ts` | `createPowerGroupPolicyIndex`, `evaluatePowerGroupUse`, `isLegalBombReduction`, protected identity |
| `src/engine/cards.ts` | `Card`, `GameRank`, `isHeartRankWild`, rank order |
| `src/engine/groups.ts` | `CardGroup`, group IDs, `detectGroups`, wildcard/group construction, bomb/straight-flush/joker-bomb |
| `src/game/playRules.ts` | `classifyPlay`, `canBeatPlay`, `playPower`; legality and power comparison |
| `src/game/room.ts` | `runAiStep`, `playCards`, `passTurn`, `ensureAiPlanForSeat`; private orchestration/mutation |
| `src/game/ai.ts` | legacy compatibility adapter calling `decideAiAction`; no opponent-hand exposure |

### 2.4 Inspected tests and helpers

The following tests were read as contract evidence; no tests were executed in this plan-only turn:

- `tests/ai/actionGenerator.test.ts`: deterministic legal leads, follow beat filtering, pass exposure, hard-protected bomb exclusion, legal bomb reduction.
- `tests/ai/actionGenerationDiagnostics.test.ts`: `HandAnalysis` reuse and canonical candidate set.
- `tests/ai/actionEvaluator.test.ts`: evaluator requires a legal, policy-approved `ActionCandidate`.
- `tests/ai/aiDecisionEngine.test.ts`: legal lead/follow, pass, deterministic result, runtime non-mutation.
- `tests/ai/aiDecisionShadow.test.ts`: 27-scenario legacy/unified legality, policy, determinism, and runtime checks.
- `tests/ai/handPlannerMigration.test.ts`: fast plan coverage, deterministic plans, protected structure, no room planner dependency.
- `tests/game/roomPlanningArchitecture.test.ts`: room uses `PlanManager`, no private planner implementation.
- `tests/game/aiBaseline.test.ts`, `tests/game/ai.test.ts`: pass, bomb, straight, wildcard, protected-group behavior.
- `tests/engine/groups.test.ts`: natural/wildcard bomb, wildcard straight/straight-flush, joker bomb.
- `tests/helpers/aiDecisionShadowHarness.ts`: `compareLegacyAndUnifiedDecision`, legality/policy/repeated-call/runtime checks.
- `tests/ai/d0FixtureCanonicalizer.ts`: test-only `actionStableKey`, canonical JSON and hashes.

Existing D2c plan evidence was also read. D2c remains `disabled | shadow`, detached, and outside production action control; D2d cannot consume D2c shadow quota as formal filtering input.

---

## 3. Current action and plan flow

### 3.1 Production flow

The actual call direction is:

```text
Room.runAiStep (src/game/room.ts:444-481)
  -> decideAiAction(observation, runtime, config)
     -> analyzeHand / HandAnalysisCache
     -> ensurePlans / optional D1 dynamic plan selection
     -> generateActionCandidates(generationInput)
        -> canonicalPlayableGroups(analysis.groups)
        -> canBeatPlay for follow
        -> evaluatePowerGroupUse
        -> pass only when lastPlay exists
        -> stableKey sort
     -> evaluateActionCandidate for every candidate
     -> score sort by total, then stable key
     -> assertFinalAction
  -> passTurn or playCards
  -> applyExecutedAction and store aiRuntime/aiPlans
```

`Room.runAiStep` is the mutation boundary. It requires a selected plan, sends play physical card IDs to `playCards\), or sends a pass to `passTurn`; both room methods revalidate against the current hand and trick.

### 3.2 Lead/follow/pass

- A lead has no `lastPlay`, so the generator does not emit pass; `assertFinalAction` rejects a lead pass with `AI_ENGINE_ILLEGAL_LEAD_PASS`.
- A follow emits the original pass candidate with key `pass\), then keeps only groups for which `canBeatPlay` is true.
- Ordinary follow legality is type/length/strength; power plays use `playPower`. Bomb, straight-flush, and joker-bomb are distinct power categories.
- `playCardsLegacy` performs a second `classifyPlay` and `canBeatPlay` check; the reducer is not a replacement for the room guard.

### 3.3 Identity, deduplication, and stable-key finding

`CardGroup.id` is produced in `src/engine/groups.ts:65-70` as `type:` plus sorted physical card IDs. `canonicalPlayableGroups` in `src/ai/tactics/actionGenerator.ts:56-67` deduplicates by sorted card IDs and retains higher `playPower`, with `group.id` as tie-breaker. Final `ActionCandidate.stableKey` is `group.id\); pass is `pass`.

There is no production `actionStableKey` helper. The only exact definition found is the test helper `tests/ai/d0FixtureCanonicalizer.ts:27-32`, which serializes pass as `pass` and play as `play:` plus sorted physical card IDs. It is not a production import. The discrepancy is a real contract:

`UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED`: decide whether D2d mapping keys are existing `ActionCandidate.stableKey` (`pass`/`CardGroup.id`) or a centralized production key compatible with the D0 fixture form. Do not silently change D0 helper bytes or existing candidate keys.

### 3.4 Plans are not legal actions

`generateFastHandPlans` produces full-hand partitions for `AiRuntimeState.candidatePlans`. Plan groups may not be legal responses to the current trick. `generateActionCandidates` is the first current source of legal action candidates because it applies `canBeatPlay` and policy. A reducer over `HandPlan.groups` is therefore not a legal-action reducer and is rejected.

---

## 4. Candidate boundary options and recommendation

### Option A — reduce `ActionCandidate[]` after legal generation, before evaluator scoring

**Boundary:** immediately after `generateActionCandidates(generationInput)` and before `candidates.map(evaluateActionCandidate)` in `decideAiAction`.

**Dependencies/legality:** existing `ActionCandidate`, `AiAction`, `CardGroup`, `lastPlay\), `gameRank\), and optional current own-hand validation. The generator has already applied legality and power policy; the reducer may revalidate with `classifyPlay` and `canBeatPlay\) but never construct a group.

**Coupling/identity:** no `RoomState\); current AI hand is allowed, opponents remain hidden; the input already carries stable key, source, policy verdict, and plan provenance. Detached no-op proof is direct.

**Recommendation:** use Option A for the first separately authorized implementation, with output retained only in detached tests until active integration is approved. It is the only boundary with a real legal-action list and a clear no-op proof.

### Option B — reduce `HandPlan.groups` after plan generation

This boundary lacks current-trick legal-action semantics, is coupled to `AiRuntimeState\)/active-plan identity, and can change candidate plans before action generation. It is a plan reducer, not a legal-action reducer. Reject for D2d v1.

### Option C — reduce after scoring, selection, or inside `Room.runAiStep`

This is too late or too coupled to scores, selected action, runtime, mutable RoomState, events, and replay. It cannot prove a no-op and is rejected.

**Design decision:** Option A is recommended. This plan does not modify `aiDecisionEngine.ts\); future wiring remains separately authorized.

---

## 5. Proposed future input contract

The exact names require review; the semantics must be:

```ts
type RepresentativeActionReducerInput = Readonly<{
  actions: readonly ActionCandidate[];
  hand: readonly Card[];
  gameRank: GameRank;
  lastPlay?: CardGroup;
  lastPlaySeat?: number;
  activePlan?: Readonly<Pick<HandPlan, "id" | "groups">>;
  d2cAnnotations?: readonly D2cActionAnnotation[];
  hardCap: number;
  minProtectedRepresentatives: number;
}>;
```

Allowed: already generated legal candidates; current trick/lead; current AI own hand; read-only plan summary/provenance; detached D2c annotations; approved stable key/group helpers; fixed cap and minimum protection.

Forbidden: full `RoomState\), other hands, partner/opponent hand, deck, undealt cards, hidden state, private runtime internals, particle bank, rollout state, seed, random/time APIs, planner regeneration, decision-engine recursion, or mutation callbacks.

D2c stays `disabled | shadow`; quota is diagnostic only and is never a formal action cap/filter/order/score. The first D2d stage cannot change formal actions.

---

## 6. Proposed future output contract

```ts
type RepresentativeActionReducerResult = Readonly<{
  status: "disabled" | "unchanged" | "reduced" | "failed";
  representatives: readonly ActionCandidate[];
  provenance: readonly RepresentativeProvenance[];
  representativeByInputKey: Readonly<Record<string, string>>;
  diagnostics: Readonly<RepresentativeDiagnostics>;
  failureReason?: RepresentativeFailureReason;
}>;
```

Every representative must be an original input action or an immutable value-identical snapshot; no new playable group is created. Every valid input key maps to one representative or an explicit failed status. Invalid key, action, cap, collision, legality, or privacy fails closed. Disabled/failure returns the original candidate list unchanged to the formal caller. Result data must be recursively frozen/detached and omit `action`, `selectedPlanId`, `activePlanId`, `runtime`, evaluator score, and D2c control fields.

`UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED`: approve result field names, failure reason values, key format, and clone-versus-frozen-snapshot policy.

---

## 7. Conservative equivalence policy

| Identity | Meaning | D2d use |
|---|---|---|
| serialization identity | canonical bytes | diagnostics only; not proof of game equivalence |
| stable-key identity | approved candidate key | exact duplicate detection after collision validation |
| legality identity | same relation to current lead | insufficient to merge different physical actions |
| game-state transition identity | same action type and physical card IDs removed | recommended minimum proof |
| AI-evaluation identity | same score/order under context | unproven; never assumed |

V1 may merge only pass with pass in follow context, or play candidates with the same approved stable identity, same physical card IDs, same canonical `classifyPlay` identity, and successful legality/policy validation. Same type/length/strength, same `playPower`, same wildcard count, same plan family, same D2c family, or same evaluator score is not enough.

No equivalence is assumed for natural versus heart-rank wildcard substitution, distinct wildcard substitutions, natural versus wildcard bomb, different bomb size/rank, straight versus straight-flush, ordinary bomb versus joker-bomb, protected power versus legal bomb-reduction straight, or actions with different `evaluatePowerGroupUse` verdicts. Existing source proves these distinctions via `CardGroup.wildcards`, `isHeartRankWild`, `playPower\), and `isLegalBombReduction`.

`UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED`: approve whether any equivalence beyond exact physical-transition identity is allowed. Recommendation for D2d v1: no.

If two distinct actions share a key, or one key maps to different physical IDs/type/wildcards/policy/legality, fail closed; never choose an arbitrary `Map` entry.

---

## 8. Hard caps, protection, pass, and fallback

Validate before reduction: `hardCap` is a finite integer greater than zero; minimum protected count is an integer in `[0, hardCap]\); keys are unique; cap is not copied from D2c quota and is not derived from time, hand size, or machine speed.

`UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED`: the numeric v1 cap and minimum protected value do not exist in current source. Approve fixed reducer-owned constants explicitly. Recommendation: fixed configuration owned by the D2d contract, never D2c quota or a time budget.

The algorithm must validate all candidates, reserve follow pass when present, reserve exact protected power actions, preserve immediate finish, preserve the approved ordinary minimum, then fill remaining slots by a fixed canonical comparator. If mandatory actions cannot fit, return a typed failure and the original list.

Pass cannot be introduced on lead, removed on follow, or merged with play. A malformed pass fails closed.

The source favors fail-closed validation and caller-owned original data. Therefore the recommendation is a typed `failed` result for the pure function, with the formal caller choosing the original list. No automatic fallback action and no exception-driven action selection:

`UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED`: approve typed failure versus throw. Recommendation: typed failure.

---

## 9. Determinism, ordering, and immutability

- Fallback/unchanged results preserve original candidate order.
- Canonical reduced order uses one approved fixed comparator; do not use locale/system order or unsorted source `Set`/`Map\) iteration.
- Do not use score ties as equivalence.
- Ban `Math.random`, `Date.now`, `performance.now`, UUID, locale/system configuration, filesystem order, worker order, asynchronous completion, and machine timing.
- The current source has `localeCompare` in generator/engine/planner/test canonicalization; D2d must not broaden that dependency. Use an approved fixed UTF-16 code-unit comparator if a new comparator is necessary.
- Snapshot input bytes before/after; mutate returned data where possible and prove input is unchanged.
- Prove no mutable nested reference is shared; recursively freeze/detach representatives, provenance, mapping, diagnostics, and failure.
- Repeated calls with identical bytes must produce identical bytes; permutation behavior must follow the approved canonical rule.

---

## 10. Privacy and import boundary

Recommended future module: `src/ai/tactics/representativeActionReducer.ts`. Allowed imports are type-only existing AI/card/group contracts plus `classifyPlay`, `canBeatPlay\), and only existing power/wildcard helpers required for validation. It must not import `room.ts\), `game/ai.ts\), `aiDecisionEngine.ts\), `planManager.ts\), `handPlanner.ts\), D2c production policy, benchmark/simulation/server modules, or test helpers.

Future source tests must inspect parsed imports/identifiers/call points rather than crude substring-only regex. They must prove no path to Room/private state/other hands/deck/runtime mutation/selected action/D2c active/later D2 phases. Production scans must prove `room.ts\) and `aiDecisionEngine.ts\) remain unconnected until separately authorized.

---

## 11. Future file map and allowlist

No future path below is changed in this plan-only turn.

**Future D2d implementation allowlist:**

- Create `src/ai/tactics/representativeActionReducer.ts\): pure reducer and approved local immutable result contracts.
- Create `tests/ai/representativeActionReducer.test.ts`: behavioral RED, implementation, hardening.
- Create `tests/ai/representativeActionReducerDetached.test.ts`: detached no-op characterization.

Do not modify `src/ai/aiDecisionEngine.ts`, `src/ai/contracts.ts`, `src/ai/runtimeContracts.ts`, `src/ai/tactics/actionGenerator.ts`, `src/ai/tactics/actionEvaluator.ts`, `src/ai/planning/handPlanner.ts`, `src/ai/planning/planManager.ts`, `src/game/room.ts`, `src/game/ai.ts`, D2a–D2c modules, public event/ledger/replay, package files, fixtures, approvals, artifacts, benchmark, simulation, UI, or server files. Any required expansion stops for a revised allowlist.

---

## 12. Task 1 — behavioral RED (future authorization required)

**Files:** Create `tests/ai/representativeActionReducer.test.ts\). A production skeleton may be created only if needed for collection and must remain within the future allowlist.

**Required cases:** legal lead with no pass; follow pass retention; legal `classifyPlay`/beating representatives; no new action; cap; determinism; stable identity; pass; immediate finish; ordinary minimum; bomb/straight-flush/joker-bomb protection; wildcard substitution; malformed input; collisions; fallback; immutability/reference isolation; privacy/import boundary.

Also prove same visible type/length/strength with different physical IDs does not merge; natural/wildcard/bomb/straight-flush/joker-bomb distinctions remain; legal bomb reduction is distinct; D2c quota does not enter formal fields.

Future RED command:

```text
npx vitest run tests/ai/representativeActionReducer.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
```

Expected: collection succeeds and at least one explicit behavior assertion fails because the reducer is not implemented. Setup/module-resolution failure is not accepted RED. Record actual files/tests/failure; do not invent counts.

---

## 13. Task 2 — minimum pure reducer (future authorization required)

**Files:** Modify only `src/ai/tactics/representativeActionReducer.ts`; test `tests/ai/representativeActionReducer.test.ts\).

- [ ] Validate action shape, keys, physical IDs, legality, policy, and cap before reduction.
- [ ] Reuse `classifyPlay`/`canBeatPlay\); never synthesize a group.
- [ ] Build the approved identity index and fail on collisions.
- [ ] Form exact physical-transition classes only.
- [ ] Reserve pass/protected power/immediate finish/approved ordinary minimum, then apply fixed cap/order.
- [ ] Return original candidates unchanged on disabled/invalid/failure.
- [ ] Recursively freeze/detach result and omit action-control/runtime fields.
- [ ] Do not call candidate generation, planner, evaluator, room, runtime, D2c quota allocator, timing, or random APIs.

Future focused command:

```text
npx vitest run tests/ai/representativeActionReducer.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
```

Expected: all actual reducer tests pass naturally; record count and exit evidence. Future commit subject: `feat: add bounded representative-action reducer`.

---

## 14. Task 3 — hardening (future authorization required)

**Files:** Modify only the future reducer and `tests/ai/representativeActionReducer.test.ts\).

Harden recursive privacy/import/source checks, malformed values, duplicate IDs, invalid numbers/caps, key collisions, fixed ordering, repeated-call bytes, permutation, freeze/isolation, pass, immediate finish, ordinary minimum, bombs, straight-flush, joker-bomb, natural/wildcard, legal reduction, original-list fallback, and absence of action/runtime/D2c-control fields. Stop on any mutation, leak, nondeterminism, cap/protection violation, or forbidden import.

Command:

```text
npx vitest run tests/ai/representativeActionReducer.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
```

Expected: actual hardening suite passes; future commit subject: `test: harden representative-action reducer boundaries`.

---

## 15. Task 4 — detached no-op characterization (future authorization required)

**Files:** Create only `tests/ai/representativeActionReducerDetached.test.ts`; no production adapter or changes to engine/room/generator.

Detached sequence:

- [ ] Prepare cloned lead/follow observations and runtimes.
- [ ] Call current `decideAiAction\); record canonical action bytes, returned runtime bytes, `selectedPlanId`, `candidateCount\), `consideredActions\), candidate order, stable keys, selected-plan identity, `activePlanId\), `configVersion\), and input bytes.
- [ ] Obtain the exact candidate snapshot only through an approved detached seam; do not add a production spy seam solely for D2d.
- [ ] Call reducer with detached plan summary and D2c annotations; retain result only in the test.
- [ ] Assert reducer result has no formal action-control/runtime/D2c quota fields.
- [ ] Repeat decision with byte-identical clones and compare all recorded values.

Required proof: action bytes, runtime bytes, candidate count/order, stable keys, selected/active plan IDs, config version, score/reason data, and input bytes are equal; no planner call increases; no output reference mutates input; no room/event/replay ownership is claimed.

Command:

```text
npx vitest run tests/ai/representativeActionReducerDetached.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
```

Expected: no-op tests pass. Any action/runtime/candidate/order/selected-plan/config difference is a hard stop. Future commit subject: `test: characterize detached representative-action no-op`.

---

## 16. Future non-restricted verification matrix

Commands below are future-only; run separately and record actual files/tests, exit code, natural completion, rejection, unhandled rejection, worker crash, and forced termination.

**Focused D2d:**

```text
npx vitest run tests/ai/representativeActionReducer.test.ts tests/ai/representativeActionReducerDetached.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
```

**Frozen D2a/D2b regression:** use the exact approved D2a/D2b file list from the integration inventory, with `--exclude ".worktrees/**"`; do not expand to benchmark/simulation/performance. Record actual evidence.

**D2c focused boundary:** run only approved D2c focused files with `--exclude ".worktrees/**"`; prove disabled/shadow, no action-control fields, no quota filtering, and no production import.

**Non-restricted regression:** use an explicit Vitest file list with `--exclude ".worktrees/**" --exclude "tests/benchmark/**" --exclude "tests/simulation/**" --exclude "tests/performance/**"` across approved AI/engine/game files. Do not use `npm test`.

**TypeScript/build:**

```text
npx tsc --noEmit
npx vite build
```

Expected for each: exit 0, natural completion, no unhandled rejection/crash/forced termination. These are not run in this plan-only turn.

**Source/allowlist scans:** use parser-aware import/identifier/call-point checks to prove no production Room/decision-engine D2d import before approval, no private/other-hand/deck/runtime/planner/benchmark/simulation import in the reducer, no D2c quota-to-filter path, no frozen fixture/artifact drift, and only the future allowlist changed.

---

## 17. Stop conditions

Stop immediately if baseline identity changes; branch/path collides; force is required; reducer needs hidden/private/Room input; equivalence relies only on type/length/strength/wildcards/score/family/quota; cap is invalid or inferred; pass is introduced/removed/merged; power/immediate-finish/wildcard/legal-reduction action is starved; malformed input guesses; a file outside the allowlist changes; a command includes restricted/remote/formal/benchmark/simulation/performance/smoke/calibration work; detached action/runtime/candidate/order/identity/config bytes differ; result exposes action-control/runtime/D2c quota fields; or an unresolved contract is implemented without approval.

No destructive cleanup, branch deletion, worktree deletion, push, pull, fetch, PR, merge, rebase, cherry-pick, squash, tag, reset, or main modification is part of D2d planning/implementation.

## 18. Self-audit and final status

This plan covers the actual baseline/worktree, source/test symbols, action flow, legality, pass/play, identity, sort/dedup, caps, power/wildcard/bomb/straight-flush/joker-bomb behavior, boundary options, contracts, privacy, determinism, immutability, collisions, fallback, starvation, D2c disabled/shadow boundary, future RED/minimum/hardening/detached/verification tasks, exact allowlists, and stop conditions. It contains no D2d implementation or claim that D2d tests passed.

```text
D2D_PREFLIGHT_INVESTIGATION_COMPLETE
D2D_PLAN_ONLY_COMPLETE
D2D_PLAN_COMMITTED
D2D_PLAN_REVIEW_PENDING
D2D_RED_NOT_AUTHORIZED
D2D_IMPLEMENTATION_NOT_AUTHORIZED
D2D_PRODUCTION_INTEGRATION_NOT_AUTHORIZED
D2D_ACTIVE_MODE_NOT_AUTHORIZED
RESTRICTED_WORKLOAD_NOT_AUTHORIZED
REMOTE_OPERATIONS_NOT_AUTHORIZED
FORMAL_EXECUTION_NOT_AUTHORIZED
formalExecutionAllowed=false
```

Stop after the document commit and wait for human review. Future execution must choose subagent-driven development or inline plan execution only after D2d identity, cap, output, fallback, and equivalence contracts are explicitly approved.
