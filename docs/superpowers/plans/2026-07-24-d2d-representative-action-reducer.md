# D2d Bounded Representative-Action Reducer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在获得独立实施授权后，先为已经生成且已验证合法的 AI action candidates 建立 exact-equivalence deduplication；D2d-v1 不丢弃未证明等价的动作，任何 bounded representative selection/truncation 都延期到另行批准的阶段。

**Architecture:** Reducer 作为纯函数位于 action candidate 生成和 action evaluator 之间的候选边界，消费只读的合法候选、必要时的当前 AI 自有手牌、game rank、current lead 和显式 hard cap，返回深冻结的代表索引、输入索引映射和诊断元数据。D2d-v1 只删除经过证明的 exact-equivalence duplicates；若等价类数量仍超过 cap，则返回 `cap-unsatisfied`，正式调用方继续使用原始候选。它不持有 `RoomState`，不生成新牌型，不重建 HandPlanner，不调用 runtime/selected action，也不读取对手手牌、牌堆、D2c annotations/quota、随机数或时钟。

**Tech Stack:** TypeScript, existing `AiAction`/`ActionCandidate`/`CardGroup` contracts, `classifyPlay`, `canBeatPlay`, existing power-group policy, Vitest, Git worktrees.

## Global Constraints

- Frozen main baseline is branch `main`, commit `c6e792f60ae898f3c8f048ac910be4cf1e242d57`, tree `c0657ca63c7db4b6f5758755f72da62d3d3c2f06`.
- Planning branch is `codex/d2d-plan`; planning worktree is `E:/workspace/掼蛋游戏开发/.worktrees/d2d-plan`; its base is the frozen commit above.
- This document is plan-only. The current turn authorizes review-remediation investigation, this document update, and its remediation commit only.
- `D2D_PLAN_REVIEW_REMEDIATION_AUTHORIZED`, `D2D_PLAN_DOCUMENT_UPDATE_AUTHORIZED`, and `D2D_PLAN_REMEDIATION_COMMIT_AUTHORIZED` are the only current D2d permissions.
- D2d RED, implementation, hardening, detached tests, production integration, active mode, candidate filtering/reordering, restricted/remote/formal work, and `formalExecutionAllowed=true` are not authorized in the current turn.
- The current turn must not modify `src/**`, `tests/**`, `scripts/**`, package/lock/TypeScript/Vite/Vitest files, README/AGENTS instructions, prior D2a–D2c documents, fixtures, approvals, artifacts, or configuration.
- The only current changed path is `docs/superpowers/plans/2026-07-24-d2d-representative-action-reducer.md`.
- Future implementation must reuse `AiAction`, `ActionCandidate`, `Card`, and `CardGroup`; it must not copy or redefine those contracts.
- Future reducer output is detached metadata only; it must not mutate, reorder, replace, or enrich the formal candidates until a separately approved active contract exists.
- D2d-v1 separates `Exact-equivalence deduplication` from `Bounded representative selection/truncation`; v1 never drops an unproven non-equivalent action to satisfy `hardCap`.
- All future Vitest commands must include `--exclude ".worktrees/**"`; do not use the repository `npm test` script because it intentionally invokes the performance suite.
- No future plan step may run benchmark, simulation, performance, smoke, calibration, formal game, treatment, remote, or restricted workload.
- Every unresolved real contract is explicitly marked: `UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED`.

---

## 1. Purpose, non-goals, and authorization boundary

### 1.1 Purpose

D2d is a bounded representative-action reduction stage. It may reduce repeated or provably identical action representations only after the existing action generator has produced candidates and has already applied canonical `CardGroup` construction, lead/follow legality, pass exposure, power-group policy approval, and deterministic candidate-key ordering.

The implementation target is not “find fewer good actions.” It is “retain one original action for each conservatively proven exact-equivalence class.” If the proof is unavailable, the reducer retains the original action; if the class count exceeds the explicit cap, the typed result falls back to the original candidates.

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
D2D_PLAN_REVIEW_REMEDIATION_AUTHORIZED
D2D_PLAN_DOCUMENT_UPDATE_AUTHORIZED
D2D_PLAN_REMEDIATION_COMMIT_AUTHORIZED

D2D_RED_NOT_AUTHORIZED
D2D_IMPLEMENTATION_NOT_AUTHORIZED
D2D_PRODUCTION_INTEGRATION_NOT_AUTHORIZED
D2D_ACTIVE_MODE_NOT_AUTHORIZED
D2D_HARDENING_NOT_AUTHORIZED
D2D_DETACHED_TEST_NOT_AUTHORIZED
D2D_CANDIDATE_FILTERING_NOT_AUTHORIZED
D2D_CANDIDATE_REORDERING_NOT_AUTHORIZED
RESTRICTED_WORKLOAD_NOT_AUTHORIZED
REMOTE_OPERATIONS_NOT_AUTHORIZED
FORMAL_EXECUTION_NOT_AUTHORIZED
formalExecutionAllowed=false
```

The only deliverable in this turn is this remediated plan document and its commit. Human review is required before any D2d RED or implementation work.

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

### 2.5 Supplemental contract findings

The required source and test recheck establishes the following.
1. ActionCandidate has exactly these fields: action, source, policyVerdict, alignedPlanIds, stableKey, and reasonCodes (src/ai/contracts.ts:73-80).
2. evaluateActionCandidate reads policyVerdict.allowed/hardViolation, action.type, play group.cards.length, group.type, each card kind/rank/wildcard status, input.hand.length, follow context, alignedPlanIds.length, and reasonCodes. It does not read stableKey, source, group.id, full plan-ID provenance, or card IDs directly; its plan-provenance dependency is only the alignedPlanIds length. Therefore two candidates with different physical card IDs can have different scores when the replacement changes wildcard/joker/game-rank/A/control-resource status; they can also happen to have equal scores when all evaluator-visible fields are equal.
3. generateActionCandidates already removes duplicate physical-card sets in canonicalPlayableGroups: its key is sorted card IDs, and it keeps the higher playPower, then the lexicographically smaller group.id. It then adds at most one candidate per group.id, separately adds pass only in follow, filters follow actions with canBeatPlay, filters policy-rejected groups, and sorts by stableKey.
4. The source does not prove a safe non-trivial evaluator-equivalent class. Any two different physical card sets are different game-state transitions; evaluator score may differ through wildcard/joker/A/game-rank control cost, plan provenance may differ through alignedPlanIds, and policy may differ through protected-group overlap.
5. A double-deck card ID is not merely an irrelevant copy label. Card.id encodes suit/rank/copy; wildcard detection depends on heart suit plus game rank; group identity and policy use card IDs; plan coverage and PlanManager matching use exact IDs; remaining-hand analysis uses post-action physical IDs. Two copies can therefore affect wildcard status, group identity, plan matching, and remaining-hand coverage.
6. A reducer before evaluation cannot prove score equivalence for non-identical physical actions from the current contracts. planEvaluator independently uses exact card IDs for coverage and protection, while planManager uses sameCards/overlap by ID for runtime plan reuse.
7. D2d-v1 consequently performs exact-equivalence deduplication only. It never truncates independent equivalence classes to satisfy hardCap; class count above cap returns typed cap-unsatisfied and the formal caller uses original candidates. A future bounded non-equivalent selector requires a separate coverage/risk/evaluation contract.
This evidence closes the earlier ambiguity: no non-trivial evaluator-equivalent action class is proven by the current source.

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

`Room.runAiStep` is the mutation boundary. It requires a selected plan, sends play physical card IDs to `playCards), or sends a pass to `passTurn`; both room methods revalidate against the current hand and trick.

### 3.2 Lead/follow/pass

- A lead has no `lastPlay`, so the generator does not emit pass; `assertFinalAction` rejects a lead pass with `AI_ENGINE_ILLEGAL_LEAD_PASS`.
- A follow emits the original pass candidate with key pass, then keeps only groups for which canBeatPlay is true.
- Ordinary follow legality is type/length/strength; power plays use `playPower`. Bomb, straight-flush, and joker-bomb are distinct power categories.
- `playCardsLegacy` performs a second `classifyPlay` and `canBeatPlay` check; the reducer is not a replacement for the room guard.

### 3.3 Identity, deduplication, and stable-key finding

CardGroup.id is produced in src/engine/groups.ts:65-70 as type: plus sorted physical card IDs. canonicalPlayableGroups in src/ai/tactics/actionGenerator.ts:56-67 deduplicates by sorted card IDs and retains higher playPower, with group.id as tie-breaker. Final ActionCandidate.stableKey is group.id; pass uses stableKey pass.

There is no production actionStableKey helper. The only exact definition found is the test helper tests/ai/d0FixtureCanonicalizer.ts:27-32, which serializes pass as pass and play as play: plus sorted physical card IDs. It is not a production import. D2d must not modify that D0 fixture helper or generator stableKey.

D2d V1 explicitly separates three identities: ActionCandidate.stableKey is input validation/diagnostic data; D0 fixture actionStableKey remains test-only and unchanged; D2d internal class key is mechanical exact-payload identity over approved fields from Section 7. A stable-key mismatch or collision fails closed.

### 3.4 Plans are not legal actions

`generateFastHandPlans` produces full-hand partitions for `AiRuntimeState.candidatePlans`. Plan groups may not be legal responses to the current trick. `generateActionCandidates` is the first current source of legal action candidates because it applies `canBeatPlay` and policy. A reducer over `HandPlan.groups` is therefore not a legal-action reducer and is rejected.

---

## 4. Candidate boundary options and recommendation

### Option A — exact-equivalence deduplication after legal generation, before evaluator scoring

**Boundary:** immediately after `generateActionCandidates(generationInput)` and before `candidates.map(evaluateActionCandidate)` in `decideAiAction`.

**Dependencies/legality:** existing ActionCandidate, AiAction, CardGroup, lastPlay, gameRank, and optional current own-hand validation. The generator has already applied legality and power policy; the reducer may revalidate with classifyPlay and canBeatPlay but never construct a group. It only collapses exact-equivalence duplicates; it does not truncate independent classes.

**Coupling/identity:** no RoomState; current AI hand is allowed only for entity-card validation, opponents remain hidden. ActionCandidate.stableKey is input validation/diagnostic data, not the D2d internal equivalence key. Detached no-op proof is direct.

**Recommendation:** use Option A for the first separately authorized implementation, with output retained only in detached tests until active integration is approved. It is the only boundary with a real legal-action list and a clear no-op proof.

### Option B — reduce `HandPlan.groups` after plan generation

This boundary lacks current-trick legal-action semantics, is coupled to AiRuntimeState/active-plan identity, and can change candidate plans before action generation. It is a plan reducer, not a legal-action reducer. Reject for D2d-v1.

### Option C — reduce after scoring, selection, or inside `Room.runAiStep`

This is too late or too coupled to scores, selected action, runtime, mutable RoomState, events, and replay. It cannot prove a no-op and is rejected.

**Design decision:** Option A is recommended only for exact-equivalence deduplication. Bounded non-equivalent representative selection/truncation is a future separately approved stage requiring coverage classes, risk guarantees, and evaluator evidence. This plan does not modify aiDecisionEngine.ts; future wiring remains separately authorized.

---

## 5. Proposed future input contract

The approved V1 input is intentionally narrow:

    type RepresentativeActionReducerInput = Readonly<{
      actions: readonly ActionCandidate[];
      hand?: readonly Card[];
      gameRank: GameRank;
      lastPlay?: CardGroup;
      hardCap: number;
    }>;

hand is optional and is retained only when the caller wants the reducer to verify that every play card ID belongs to the current AI hand. It is not used for opponent inference, scoring, plan matching, or candidate generation. lastPlaySeat, activePlan, minProtectedRepresentatives, and all D2c annotations/quota are not V1 inputs because the current source does not prove they are necessary for exact-equivalence deduplication.

Allowed: already generated legal candidates, current lead, game rank, optional current AI own hand for ownership validation, and an explicit cap.

Forbidden: full RoomState, other hands, partner/opponent hand, deck, undealt cards, hidden state, private runtime internals, plan/runtime provenance, D2c annotations/quota, particle bank, rollout state, seed, random/time APIs, planner regeneration, decision-engine recursion, or mutation callbacks.

D2c remains disabled | shadow but is outside the V1 reducer input. The first D2d stage cannot use D2c quota or annotations to change formal actions.
---

## 6. Proposed future output contract

The V1 result is pure metadata and contains no candidate/action/group/card references:

    type RepresentativeActionReducerResult = Readonly<{
      status: "unchanged" | "reduced" | "failed";
      representativeInputIndices: readonly number[];
      representativeByInputIndex: Readonly<Record<number, number>>;
      diagnostics: Readonly<RepresentativeDiagnostics>;
      failureReason?: RepresentativeFailureReason;
      fallback: "use-original-candidates";
    }>;

representativeInputIndices contains original indices, never candidate objects. representativeByInputIndex maps every valid input index to the representative input index for its exact-equivalence class. All arrays, records, and diagnostics are detached and deeply frozen.

The result contains no ActionCandidate, AiAction, CardGroup, Card, selected action, runtime, D2c quota/control field, or fallback action. The formal caller always uses the original candidate array; this result only describes whether exact duplicates were found and whether the cap is satisfiable.

status unchanged means no bounded truncation occurred; when actions.length <= hardCap, it is required even if metadata identifies exact duplicates. status reduced is allowed only when exact duplicate classes were identified without dropping any independent class and class count remains within cap. status failed is required for malformed input, key collision, legality inconsistency, or cap-unsatisfied.

UNRESOLVED — DO NOT IMPLEMENT UNTIL CONTRACT IS APPROVED: approve the exact RepresentativeDiagnostics and RepresentativeFailureReason unions. The field shape, no-reference ownership, and fallback use-original-candidates are fixed by this remediation.
---

## 7. Conservative equivalence policy

V1 distinguishes the two operations:

1. Exact-equivalence deduplication: mechanically validate all evaluator-visible and action-identity fields, then map byte-identical candidate payloads to one original input index. This is the only operation D2d-v1 may perform.
2. Bounded representative selection/truncation: choose among independent classes to satisfy a cap. This is not implemented or authorized in V1. It requires a future coverage-class, risk, and evaluator-evidence contract.

The approved V1 internal class key is not ActionCandidate.stableKey and does not modify D0 actionStableKey or generator stableKey. It is a mechanical key over action type, canonical group type, sorted physical card IDs, validated group.id, policy verdict, alignedPlanIds content, and reasonCodes; pass uses the corresponding exact pass payload. source and stableKey are retained only for input validation/diagnostics, but a mismatch in either duplicate payload is not silently merged. A collision in either key is typed failure.

The current evaluator does not read stableKey, source, group.id, full plan-ID provenance, or card IDs directly, but it does read alignedPlanIds.length, policy verdict, group type, card length, wildcard/joker/control-card properties, follow context, and reason codes. Therefore same physical action with different evaluator-visible metadata is not an exact duplicate.

No equivalence is assumed for natural versus heart-rank wildcard substitution, distinct wildcard substitutions, natural versus wildcard bomb, different bomb size/rank, straight versus straight-flush, ordinary bomb versus joker-bomb, protected power versus legal bomb-reduction straight, or actions with different evaluatePowerGroupUse verdicts. Existing source proves these distinctions via CardGroup.wildcards, isHeartRankWild, playPower, and isLegalBombReduction.

If two distinct actions share a D2d internal class key, or one ActionCandidate.stableKey maps to different payloads, fail closed; never choose an arbitrary Map entry. No non-trivial evaluator-equivalent action class is proven by this source.
---

## 8. Hard caps and fallback

Validate hardCap before any class selection with Number.isFinite(hardCap), Number.isInteger(hardCap), and hardCap >= 1. The caller supplies it explicitly; V1 does not define a production default and does not add a configuration field.

Required cap semantics:

- actions.length <= hardCap -> status unchanged, all original indices remain formally usable, and no independent action is dropped.
- when actions.length > hardCap and exact-equivalence class count <= hardCap -> status reduced when duplicate metadata was found, otherwise unchanged.
- exact-equivalence class count > hardCap -> status failed, failureReason cap-unsatisfied, fallback use-original-candidates.
- The reducer never deletes an unproven independent class to force the count under cap.

V1 does not reserve a configurable minimum protected representative because it does not perform non-equivalent truncation. Pass remains a separate exact action class and is never merged with play. Legality/policy inconsistency is typed failure. Power, wildcard, bomb, straight-flush, joker-bomb, immediate-finish, and legal-reduction candidates are validated as exact payloads, not ranked for truncation.

Input validation, key collision, legality inconsistency, and cap-unsatisfied return typed failure and do not throw. Only a genuine internal programming error may throw. The formal caller uses the original candidates and the reducer returns no action.
---

## 9. Determinism, ordering, and immutability

- Fallback/unchanged results preserve original candidate order.
- Canonical reduced order uses one approved fixed comparator; do not use locale/system order or unsorted source `Set`/`Map` iteration.
- Do not use score ties as equivalence.
- Ban `Math.random`, `Date.now`, `performance.now`, UUID, locale/system configuration, filesystem order, worker order, asynchronous completion, and machine timing.
- The current source has `localeCompare` in generator/engine/planner/test canonicalization; D2d must not broaden that dependency. Use an approved fixed UTF-16 code-unit comparator if a new comparator is necessary.
- Snapshot input bytes before/after; tests attempt mutation of returned metadata and verify it remains unchanged or throws because the result is deeply frozen.
- Prove no mutable nested reference is shared; recursively freeze/detach representatives, provenance, mapping, diagnostics, and failure.
- Repeated calls with identical bytes must produce identical bytes.
- Permutation tests must make two separate assertions: for each input permutation, representativeInputIndices are ascending in that permutation original index space; across permutations, the selected semantic representative set is unchanged.

---

## 10. Privacy and import boundary

Recommended future module: src/ai/tactics/representativeActionReducer.ts. Allowed imports are type-only existing AI/card/group contracts plus classifyPlay, canBeatPlay, and only existing power/wildcard helpers required for validation. It must not import room.ts, game/ai.ts, aiDecisionEngine.ts, planManager.ts, handPlanner.ts, D2c production policy, benchmark/simulation/server modules, or test helpers.

Future source tests must inspect parsed imports/identifiers/call points rather than crude substring-only regex. They must prove no path to Room/private state/other hands/deck/runtime mutation/selected action/D2c active/later D2 phases. Production scans must prove room.ts and aiDecisionEngine.ts remain unconnected until separately authorized.

---

## 11. Future file map and allowlist

No future path below is changed in this plan-only turn.

**Future D2d implementation allowlist:**

- Create `src/ai/tactics/representativeActionReducer.ts`: pure reducer and approved local immutable result contracts.
- Create `tests/ai/representativeActionReducer.test.ts`: behavioral RED, implementation, hardening.
- Create `tests/ai/representativeActionReducerDetached.test.ts`: detached no-op characterization.

Do not modify `src/ai/aiDecisionEngine.ts`, `src/ai/contracts.ts`, `src/ai/runtimeContracts.ts`, `src/ai/tactics/actionGenerator.ts`, `src/ai/tactics/actionEvaluator.ts`, `src/ai/planning/handPlanner.ts`, `src/ai/planning/planManager.ts`, `src/game/room.ts`, `src/game/ai.ts`, D2a–D2c modules, public event/ledger/replay, package files, fixtures, approvals, artifacts, benchmark, simulation, UI, or server files. Any required expansion stops for a revised allowlist.

---

## 12. Task 1 — behavioral RED (future authorization required)

**Exact Task 1 allowlist:**

- A src/ai/tactics/representativeActionReducer.ts
- A tests/ai/representativeActionReducer.test.ts

The minimum production skeleton may export only the approved V1 types and reducer function, perform no engine/room integration, generate no action, mutate no input, and return a clear not-implemented/failed typed result. The RED gate is behavioral and must not be module-not-found, TypeScript collection failure, wrong import, syntax error, or expect(false).

**First minimal RED behaviors:**

- exact duplicate candidate payloads collapse to one representative input index in metadata;
- different physical card IDs and different semantic/evaluator-visible fields do not merge;
- actions.length <= hardCap returns unchanged with original formal-candidate fallback;
- exact-equivalence class count > hardCap returns typed cap-unsatisfied failure;
- follow pass remains an independent exact class;
- ActionCandidate.stableKey collision or a D2d class-key collision returns typed failure;
- input candidates are not mutated and result metadata contains no candidate/action/group/card references;
- result contains no action, runtime, selected action, D2c annotation/quota, or control field;
- repeated calls and input permutations are deterministic under the declared index rule.

Do not put wildcard/bomb hardening, malformed-matrix breadth, parser source scans, or detached decision tests into the first RED commit; those belong to Task 3 and Task 4. The first RED must nevertheless use real ActionCandidate fixtures and prove behavioral assertions execute after the skeleton collects.

Future RED command:

    npx vitest run tests/ai/representativeActionReducer.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected: both allowlisted files collect, the module resolves, and at least one listed behavior assertion fails because the skeleton returns not-implemented/failed. Setup/module-resolution failure is not accepted RED. Record actual files/tests/failure; do not invent counts.
---

## 13. Task 2 — minimum pure exact-dedup reducer (future authorization required)

**Files:** Modify only src/ai/tactics/representativeActionReducer.ts; test tests/ai/representativeActionReducer.test.ts.

- [ ] Validate action shape, keys, physical IDs, legality, evaluator-visible metadata, and hardCap before class formation.
- [ ] Reuse classifyPlay and canBeatPlay for validation; never synthesize a group.
- [ ] Build the approved D2d internal class key; validate ActionCandidate.stableKey separately and fail on collisions.
- [ ] Form exact payload classes only; include policy verdict, aligned plan ID content, and reason-code content so pre-evaluator score/reason behavior is not guessed equivalent.
- [ ] Return representative input indices and index mapping only; never return candidate/action/group/card references.
- [ ] When the class count exceeds hardCap, return cap-unsatisfied and leave formal caller fallback on original candidates.
- [ ] Deep-freeze/detach result metadata and omit action-control/runtime/D2c fields.
- [ ] Do not call candidate generation, planner, evaluator, room, runtime, D2c, timing, or random APIs.

Future focused command:

    npx vitest run tests/ai/representativeActionReducer.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected: all actual exact-dedup tests pass naturally; record count and exit evidence. Future commit subject: feat: add bounded representative-action reducer.
---

## 14. Task 3 — hardening (future authorization required)

**Files:** Modify only the future reducer and tests/ai/representativeActionReducer.test.ts.

Harden recursive privacy/import/source checks, malformed values, duplicate IDs, invalid numbers/caps, key collisions, fixed index ordering, repeated-call bytes, permutation, freeze/isolation, pass, exact wildcard/bomb/straight-flush/joker-bomb payload distinctions, natural/wildcard distinctions, legal reduction distinctions, original-list fallback, and absence of action/runtime/D2c-control fields. Do not add non-equivalent truncation or a minimum protected representative in this task.

Command:

    npx vitest run tests/ai/representativeActionReducer.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected: actual hardening suite passes; future commit subject: test: harden representative-action reducer boundaries.
---

## 15. Task 4 — detached no-op characterization (future authorization required)

**Files:** Create only tests/ai/representativeActionReducerDetached.test.ts; no production adapter or changes to engine/room/generator.

Use the first approved seam: call the existing public generateActionCandidates function directly in the test with real ActionGenerationInput fixtures, then pass a detached read-only candidate snapshot to the reducer. Do not modify aiDecisionEngine.ts, add a production spy seam, mock the decision engine, or use module reset to alter loading semantics. A helper from the existing tests may be reused only if it is already public and does not change production imports.

Detached sequence:

- [ ] Prepare cloned lead/follow observations and runtimes.
- [ ] Call current decideAiAction twice with byte-identical cloned inputs and record action bytes, returned runtime bytes, selectedPlanId, candidateCount, consideredActions, candidate order, stable keys, activePlanId, configVersion, and input bytes.
- [ ] Separately call generateActionCandidates with the same real observation-derived generation input and record the original candidate bytes/order.
- [ ] Call the V1 reducer with only actions, optional own hand, gameRank, lastPlay, and explicit hardCap; retain only its metadata result in the test.
- [ ] Assert reducer result contains no ActionCandidate, AiAction, CardGroup, Card, action, runtime, selected-plan, D2c, or quota/control field.
- [ ] Assert the second decideAiAction input does not contain reducer output and compare both decision results.

Required proof: action bytes, runtime bytes, candidate count/order, stable keys, selected/active plan IDs, config version, score/reason data, and input bytes are equal; production import/call-site inventory is unchanged; no room/event/replay ownership is claimed. Do not assert that planner call counts remain unchanged because this detached seam does not provide a reliable planner-call contract.

Command:

    npx vitest run tests/ai/representativeActionReducerDetached.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected: no-op tests pass. Any action/runtime/candidate/order/selected-plan/config difference is a hard stop. Future commit subject: test: characterize detached representative-action no-op.
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

This plan covers the actual baseline/worktree, source/test symbols, action flow, legality, pass/play, identity, exact deduplication, cap-unsatisfied fallback, power/wildcard/bomb/straight-flush/joker-bomb behavior, boundary options, contracts, privacy, determinism, immutability, collisions, D2c disabled/shadow boundary, future RED/minimum/hardening/detached/verification tasks, exact allowlists, and stop conditions. It contains no D2d implementation or claim that D2d tests passed.

```text
D2D_PLAN_REVIEW_REMEDIATION_COMPLETE
D2D_PLAN_REMEDIATION_COMMITTED
D2D_PLAN_SECOND_REVIEW_PENDING
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
