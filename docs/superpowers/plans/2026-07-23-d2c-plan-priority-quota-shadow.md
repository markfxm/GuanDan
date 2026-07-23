# D2c Plan Priority / Quota Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.
**Goal:** 使用 D2b 的 LightweightPublicEvidence 对现有 0–5 个候选计划进行确定性的 family 分类、priority 排序和固定 quota 计算；首轮只支持 disabled 与 shadow，不改变候选计划、planner、合法动作、runtime 或最终出牌。
**Architecture:** 新增一个不接入正式决策路径的纯函数 src/ai/planning/beliefGuidedPlanPolicy.ts，消费 D2b evidence、现有只读 HandPlan 和由既有 protected-group policy 预先产生的只读 group IDs。它只输出深冻结的 family/priority/quota/diagnostics shadow 记录，不生成计划、不调用 HandPlanner、不筛除或重排 candidate plans，也不产生 D2d action reducer 输入。
**Tech Stack:** TypeScript 5.7, Vitest 2.1.9, existing LightweightPublicEvidence, HandPlan, D1 plan identity and protected-group policy contracts.

## Global Constraints

- Verified base is main 43be5089f87c5710ae90932b1ea2d25e01b95565 with tree ac904a6afbd6abf111c7d8eed46b58a1cb9a637a; planning branch is codex/d2c-plan.
- formalExecutionAllowed=false remains unchanged.
- D2c first release permits only PlanPruningMode = "disabled" | "shadow"; the type contains no "active" member.
- The policy never changes candidatePlans, candidate count, candidate order, legal actions, evaluator scores, selected action, AiRuntimeState, public event/hash, replay schema, PublicRoom, D0 fixtures, or artifacts.
- The policy never calls generateHandPlans, generateFastHandPlans, generateRapidHandPlan, HandPlanner, decideAiAction, runAiStep, an unbounded planner, an action reducer, a particle sampler, a likelihood evaluator, a rollout policy, a treatment registry, a benchmark runner, a server provider/store, or a production integration adapter.
- D2c input contains no RoomState, hands, initialHands, partnerHand, opponentsHands, deck, hiddenState, private runtime, particle bank, rollout state, or provider/store identity internals.
- The only future implementation production module is src/ai/planning/beliefGuidedPlanPolicy.ts; the only future concentrated test module is tests/ai/beliefGuidedPlanPolicy.test.ts.
- No task in this plan modifies src/game/room.ts, src/ai/aiDecisionEngine.ts, src/ai/contracts.ts, src/ai/runtimeContracts.ts, src/ai/planning/handPlanner.ts, public event/ledger/replay modules, package files, fixtures, artifacts, benchmark approvals, or server/UI files.
- All normal results use fixed integer comparisons, source order normalized by stable keys, and explicit string tie-breaks. No Date.now(), performance.now(), Math.random(), worker order, wall-clock duration, object address, filesystem order, or directory order may affect a result.
- A D2c failure leaves the old AI path untouched and returns a stable disabled result with one D2cFallbackReason; it never silently enters active behavior.

---

## 1. Goal and non-goals

### Goal

D2c records a public-evidence-guided shadow view of existing candidates. The first implementation has three pure responsibilities:

1. classify each existing candidate into a deterministic, deduplicated list of public plan families;
2. sort family and candidate annotations with a fixed priority tuple and stable key;
3. allocate bounded family quotas as diagnostic metadata without using the quota to select, delete, copy, or regenerate a candidate.

### Non-goals

D2c does not generate candidate plans, call unbounded HandPlanner, delete or reorder candidate plans, change legal action generation, choose an action, score an action, create particles, infer complete hidden hands, execute rollout, compute team utility, register treatment, run benchmark/simulation/performance/smoke/calibration/formal workload, or enter active mode.

The design deliberately does not apply the D2 design's beliefGuidedActionSearch, safety-mandatory action set, representative-action reducer, particle bank, CRN, rollout, or treatment contracts. Those belong to separately authorized D2d–D2g work.

## 2. Verified baseline

### Main verification evidence

The verified main baseline is:

| Check | Result |
|---|---|
| branch | main |
| HEAD | 43be5089f87c5710ae90932b1ea2d25e01b95565 |
| tree | ac904a6afbd6abf111c7d8eed46b58a1cb9a637a |
| D2b ancestor | 2785eac4ce0b32854d6d612b60ab76ddb43ca21e is ancestor of main |
| D2b focused | 1 file, 31 tests passed |
| D2b combined | 12 files, 66 tests passed |
| TypeScript | exit 0 after npm ci restored local dependencies |
| build | exit 0, natural completion |
| non-restricted regression | 70 files, 616 tests passed, exit 0 |
| frozen evidence | git diff --exit-code exit 0 |
| production D2b scan | 0 matches in frozen decision-path files |
| main worktree | clean |

The D2b core and regression commands excluded .worktrees/** because the repository intentionally contains older linked worktrees with same-named characterization tests. No old worktree was deleted or changed.

### Design sources read

The latest applicable D2 design is docs/plans/2026-07-16-d2-belief-guided-bounded-search-design.md. Its current order is D2a public ledger, D2b lightweight public evidence, D2c plan priority/quota shadow, D2d representative action reducer, D2e particle/likelihood/ESS, D2f CRN rollout/team utility, and D2g engine treatment/benchmark/ablation. The earlier particle-first ordering is not used here.

The D2b contract is in src/ai/belief/lightweightPublicEvidence.ts and the frozen D2b plan is docs/superpowers/plans/2026-07-19-d2b-lightweight-public-evidence.md. No D2c implementation module exists at this base.

## 3. Current architecture map

### D2b input and output boundary

deriveLightweightPublicEvidence(ledger: HardPublicLedger, recentEvents: readonly PublicActionEvent[], perspectiveSeat: PublicSeat): LightweightPublicEvidence consumes only public ledger/event/hash contracts. Its output has schemaVersion: "d2-lightweight-evidence-v1", hardPublicFacts, derivedSignals, and frozen provenance. The relevant D2b public evidence fields for D2c are:

- hardPublicFacts.remainingCardCounts keyed by self, partner, leftOpponent, rightOpponent;
- hardPublicFacts.finishOrder;
- derivedSignals.recentActions containing all event kinds in the canonical last-16 event window;
- derivedSignals.recentPassStreakByRelation;
- derivedSignals.recentActionTendencies with playCount, passCount, and lastActionKind;
- schemaVersion, eventIndex, perspectiveSeat, and public identity fields.

D2c treats evidence as a read-only snapshot. It validates the version and required finite/integer aggregate shapes before classification. It calls D2b's privacy assertion on the evidence, but it does not serialize or copy hidden state because none is part of the D2c input contract.

### Existing plan and runtime types

The actual definitions are in src/ai/contracts.ts:

    export type HandPlan = {
      id: string;
      groups: CardGroup[];
      metrics: PlanMetrics;
    };

    export type AiRuntimeState = {
      handKey?: string;
      activePlanId?: string;
      candidatePlans: HandPlan[];
      generatedTurn: number;
      configVersion: string;
      needsReplan: boolean;
      planSelectionState?: D1PlanSelectionState;
    };

PlanMetrics contains the existing deterministic signals hardViolations, protectionLoss, estimatedTurns, lowSingleCount, retainedControl, wildcardFlexibility, responseCoverage, leadFlexibility, and fallbackScore. D2c may read these metrics and the candidate's existing groups; it may not mutate them or derive a new HandPlan.

src/ai/runtimeContracts.ts defines PlanIdentity with rootPlanId, planFamilyId, and lineageId, and D1PlanSelectionState with activePlanId, activePlanFamilyId, and planIdentityById. Existing D1 family IDs are identity lineage identifiers, not D2c semantic family labels. D2c reuses HandPlan.id as the stable candidate key and may read the current active ID; it does not overwrite or reinterpret D1 identity state.

### Room-to-decision call path

The verified production path is:

    src/game/room.ts:runAiStep
      -> decideAiAction(observation, room.aiRuntime[seat], config)
         -> analyzeHand / HandAnalysisCache
         -> ensurePlans
            -> generateFastHandPlans when replan is needed
         -> optional D1 applyDynamicPlanSelection
         -> generateActionCandidates
         -> evaluateActionCandidate
         -> deterministic candidate sort
         -> final action validation
      -> playCards/passTurn
      -> applyExecutedAction
      -> public event commit / public ledger update

getPublicRoom may call ensureAiPlans, which calls ensurePlans, but it does not expose the public ledger or private runtime. D2c is not called from any of these paths in this plan. A future shadow adapter, if separately authorized, must call the pure policy after the existing decision has been computed and discard its result without passing it back to the decision engine.

### Candidate cardinality and existing concepts

The existing planner budget has maxPlans, and ensurePlans returns candidatePlans from generateFastHandPlans. The D1 selector evaluates active plus up to k - 1 challengers, with the current default k = 5. Current runtime therefore supports zero candidates in an empty/replan state, one candidate in fallback/fast cases, and up to five candidates under the D1 top-k boundary. D2c rejects counts greater than five rather than truncating.

Existing concepts:

| Concept | Present location | D2c use |
|---|---|---|
| active plan | AiRuntimeState.activePlanId, D1 state | read-only equality against HandPlan.id |
| stable candidate key | HandPlan.id | canonical key and final tie-break |
| plan family identity | D1PlanSelectionState.planIdentityById[*].planFamilyId | not confused with semantic D2c labels |
| protected group | src/ai/policy/powerGroupPolicy.ts | caller supplies read-only protected group IDs |
| urgent-defense | absent as a named type | derived only from public low-count/finish signals plus candidate response/control metrics |
| uncertainty-cover | absent as a named type | derived from mixed public play/pass evidence plus candidate coverage |
| quota/budget | PlanningBudget exists for planner generation | D2c adds a separate frozen quota config |
| action prior | no suitable D2c action signature is present | omitted from D2c v1; no action prior is consumed |

src/ai/policy/powerGroupPolicy.ts already computes protected groups through createPowerGroupPolicyIndex/protectedPowerGroups. D2c receives only their stable CardGroup.id values in its candidate wrapper. It does not import private hands or rerun the policy, and it does not change the existing policy result.

## 4. Exact data contracts

The only future production module is src/ai/planning/beliefGuidedPlanPolicy.ts. Its complete public contract is:

    import type { LightweightPublicEvidence } from "../belief/lightweightPublicEvidence";
    import type { HandPlan } from "../contracts";

    export type PlanPruningMode = "disabled" | "shadow";

    export type D2cPlanFamily =
      | "active"
      | "urgent-defense"
      | "finishability"
      | "uncertainty-cover"
      | "power-preserving"
      | "alternative"
      | "other";

    export type D2cFallbackReason =
      | "disabled-by-config"
      | "no-candidates-action-only"
      | "invalid-evidence"
      | "stale-evidence"
      | "unknown-evidence-schema"
      | "candidate-count-overflow"
      | "duplicate-plan-key"
      | "missing-plan-key"
      | "invalid-family-annotation"
      | "invalid-quota-config"
      | "quota-exceeds-budget"
      | "unknown-mode"
      | "privacy-violation";

    export type D2cQuotaConfig = Readonly<{
      schemaVersion: "d2c-plan-quota-v1";
      maxPlanFamilies: number;
      maxPlanExpansions: number;
      minQuotaPerFamily: number;
      maxQuotaPerFamily: number;
    }>;

    export type D2cPlanCandidate = Readonly<{
      plan: HandPlan;
      protectedGroupIds: readonly string[];
    }>;

    export type D2cPlanPolicyInput = Readonly<{
      schemaVersion: "d2c-plan-policy-input-v1";
      evidence: LightweightPublicEvidence;
      candidatePlans: readonly D2cPlanCandidate[];
      activePlanId?: string;
      mode: PlanPruningMode;
      quotaConfig: D2cQuotaConfig;
    }>;

    export type D2cPriorityTuple = readonly [
      familyTier: number,
      publicSignalTier: number,
      candidateQuality: number,
      stablePlanKey: string,
    ];

    export type D2cPlanAnnotation = Readonly<{
      stablePlanKey: string;
      familyIds: readonly D2cPlanFamily[];
      ownerFamily: D2cPlanFamily;
      priority: D2cPriorityTuple;
      quota: number;
    }>;

    export type D2cFamilyQuota = Readonly<{
      family: D2cPlanFamily;
      priority: number;
      candidatePlanKeys: readonly string[];
      quota: number;
    }>;

    export type D2cDiagnostics = Readonly<{
      candidateCount: number;
      familyCount: number;
      selectedFamilyCount: number;
      quotaTotal: number;
      mode: PlanPruningMode;
      fallbackReason?: D2cFallbackReason;
    }>;

    export type D2cDisabledResult = Readonly<{
      schemaVersion: "d2c-plan-policy-result-v1";
      kind: "disabled";
      mode: "disabled";
      candidateCount: number;
      annotations: readonly [];
      familyPriority: readonly [];
      familyQuotas: readonly [];
      diagnostics: D2cDiagnostics;
      fallbackReason: D2cFallbackReason;
    }>;

    export type D2cShadowResult = Readonly<{
      schemaVersion: "d2c-plan-policy-result-v1";
      kind: "shadow";
      mode: "shadow";
      candidateCount: number;
      annotations: Readonly<Record<string, D2cPlanAnnotation>>;
      familyPriority: readonly D2cFamilyQuota[];
      familyQuotas: readonly D2cFamilyQuota[];
      diagnostics: D2cDiagnostics;
    }>;

    export type D2cPlanPolicyResult = D2cDisabledResult | D2cShadowResult;

    export function deriveD2cPlanPriorityQuota(input: D2cPlanPolicyInput): D2cPlanPolicyResult;

Contract decisions:

- HandPlan.id is the stable plan key. D2c never creates a transient identity, never hashes a private hand, and never replaces an existing D1 identity.
- D2cPlanCandidate.protectedGroupIds is a read-only projection produced by the existing protected-group policy. It contains IDs only; no Card[], private hand, or policy index object crosses the D2c boundary.
- candidatePlans is not returned from the result. This makes it impossible for the policy result to replace or reorder the caller's candidates. An annotation map is keyed by stable plan ID and has no plan object reference.
- Every result object and nested array/record is deep-frozen. Inputs are never mutated, and no input object is retained by reference in output.
- D2cDiagnostics contains counts, family/quota results, and one fallback reason only. It contains no candidate groups, card IDs, public event payloads, hidden state, action score, runtime, or wall-clock duration.
- D2cShadowResult.familyPriority is the complete family ordering; familyQuotas is the same ordering with quota values made explicit. It does not mean candidates have been pruned or expanded.
- D2cDisabledResult.annotations and quota arrays are empty by contract. candidateCount remains the observed count for diagnostics; no fake candidate or fake identity is created.

## 5. Plan family taxonomy

### Public predicates

The classifier uses only D2b aggregates and the candidate's existing PlanMetrics/groups:

    publicUrgency =
      leftOpponentCount <= 2 ||
      rightOpponentCount <= 2 ||
      evidence.hardPublicFacts.finishOrder.includes("leftOpponent") ||
      evidence.hardPublicFacts.finishOrder.includes("rightOpponent");

    publicUncertainty =
      recentActions.length > 0 &&
      (left.playCount > 0 && left.passCount > 0 ||
       right.playCount > 0 && right.passCount > 0);

    publicHighValue =
      leftOpponentCount <= 5 || rightOpponentCount <= 5 ||
      evidence.hardPublicFacts.finishOrder.length > 0;

Counts come from evidence.hardPublicFacts.remainingCardCounts; the relation keys are fixed and are not inferred from hidden hands. The classifier does not claim why an opponent passed, what cards they hold, or which action they will choose.

### Candidate labels

For each candidate, first compute these base labels in the listed order, deduplicating with a set:

1. active when activePlanId === plan.id.
2. urgent-defense when publicUrgency is true and the plan has responseCoverage > 0, a protected group ID, or a non-single group. This records that the candidate can represent a defensive public situation; it does not remove other legal actions.
3. finishability when estimatedTurns equals the minimum estimatedTurns among the supplied candidates.
4. power-preserving when protectedGroupIds.length > 0 or the plan has a bomb, straight-flush, or joker-bomb group and protectionLoss === 0.
5. uncertainty-cover when publicUncertainty is true and the plan has responseCoverage > 0 or leadFlexibility >= 2.
6. alternative when the candidate has at least two labels among items 2–5, or when an active plan exists and the candidate is not active and its strongest non-active label differs from the active candidate's strongest non-active label.
7. other when no label has been assigned.

active is a marker, not an action rule. A candidate can have multiple labels. Repeated labels are removed before sorting. If an active plan is absent, no candidate receives active; the remaining labels are classified normally. If an active ID is present but not among candidates, the input is stale and returns disabled with stale-evidence. The caller must then preserve the old action path.

The current code has no explicit urgent-defense or uncertainty type. The above is the minimum read-only representation built from existing public evidence and HandPlan metrics; it does not refactor planner state or invent hidden-state features. The current code also has no action signature suitable for an action prior, so D2c v1 does not expose one.

## 6. Priority and stable tie-break

The priority for a candidate is the tuple:

    [
      familyTier,
      publicSignalTier,
      candidateQuality,
      stablePlanKey,
    ]

Higher numeric components sort first. The final string component sorts ascending with localeCompare and is the only tie-break after all numeric components. The fixed family tiers are:

| Family | familyTier |
|---|---:|
| urgent-defense | 500 |
| active | 400 |
| finishability | 300 |
| power-preserving | 300 |
| uncertainty-cover | 200 |
| alternative | 100 |
| other | 0 |

For a multi-family candidate, familyTier is the maximum tier of its labels. publicSignalTier is 2 for publicUrgency, 1 for publicHighValue without urgency, and 0 otherwise. candidateQuality is the fixed integer:

    1000
      - 100 * plan.metrics.estimatedTurns
      - 10 * plan.metrics.lowSingleCount
      + 10 * plan.metrics.retainedControl
      + 5 * plan.metrics.responseCoverage
      + 5 * plan.metrics.leadFlexibility
      - 50 * plan.metrics.protectionLoss;

The implementation validates every metric as finite and non-negative before this calculation. stablePlanKey is included in the tuple for auditability but is compared separately as the final ascending tie-break. Candidate input permutation therefore cannot affect labels, family order, annotations, quota, or any normal result bytes. Equal input snapshots produce equal JSON bytes because family IDs, plan IDs, and record keys are emitted in stable sorted order.

The ordering expresses plan-category priority only: urgent public defense, active plan continuity, public high-value/finish or power preservation, public uncertainty coverage, then alternatives/other. It does not define an “urgent action beats immediate finish” rule and does not select any action; action semantics remain outside D2c.

## 7. Fixed quota algorithm

The default frozen config used by the first tests is:

    const D2C_DEFAULT_QUOTA_CONFIG: D2cQuotaConfig = Object.freeze({
      schemaVersion: "d2c-plan-quota-v1",
      maxPlanFamilies: 3,
      maxPlanExpansions: 5,
      minQuotaPerFamily: 1,
      maxQuotaPerFamily: 3,
    });

The fields are validated as integers. maxPlanFamilies is 1–5, maxPlanExpansions is 0–5, minQuotaPerFamily is 1–maxQuotaPerFamily, and maxQuotaPerFamily is 1–5. A config with non-integers, negatives, min > max, an unknown version, or a required minimum greater than the expansion budget returns disabled with invalid-quota-config. If the computed selected-family minimum would exceed the budget, the result is disabled with quota-exceeds-budget; the implementation never returns an over-budget result.

Quota units are unique candidate plan keys, not family memberships. A candidate with urgent-defense and power-preserving is assigned to exactly one ownerFamily: the highest-tier label, then the lexicographically smallest label on a numeric tie. Its annotation still retains both labels, but it consumes one quota unit only in ownerFamily. This prevents repeated family membership from consuming the same candidate twice.

The exact algorithm is:

1. Sort candidates by stablePlanKey; reject duplicate or empty keys.
2. Classify and score each candidate.
3. Group candidates by ownerFamily, retaining each group sorted by candidate priority descending and stable key ascending.
4. Sort families by their highest member priority descending, then family name ascending.
5. Select at most maxPlanFamilies families and at most maxPlanExpansions / minQuotaPerFamily families. If the budget is zero, select none and return quota total zero.
6. Give each selected family minQuotaPerFamily, capped by that family's unique candidate count.
7. While budget remains, increment the selected family with the largest candidateCount - quota, capped at maxQuotaPerFamily and candidate count. Ties use family priority descending, then family name ascending. This is the fixed largest-remainder-style allocation; no runtime duration participates.
8. Emit the family quota records and verify 0 <= quota <= maxQuotaPerFamily, each quota is an integer, and sum(familyQuotas.quota) <= maxPlanExpansions. Any failed invariant returns disabled with quota-exceeds-budget.

The lower bound is 1 per selected family and the upper bound is 3 in the frozen default. The budget is five unique candidate allocation units. A remaining budget is distributed to the largest deficit first; a budget shortage drops the lowest-priority family before any quota is emitted. The algorithm does not copy candidates into quota slots and does not call any planner.

## 8. candidatePlans 0/1/2–5 semantics

### Zero candidates

Return a stable disabled result with candidateCount: 0, empty annotations, empty family priority/quota arrays, quotaTotal: 0, and fallbackReason: no-candidates-action-only. Do not create a pseudo-plan, plan ID, plan family, alignment score, damage score, switch record, or transient identity. D2d's action-only semantics are not implemented by this module; the existing action path remains the sole path.

### One candidate

Classify and annotate the one existing candidate. If the mode is shadow and the config permits one unit, its owner family receives quota 1. The annotation is a read-only view keyed by the candidate's existing HandPlan.id. No planner expansion occurs, the candidate is not duplicated, and no active selection is performed.

### Two through five candidates

Classify all candidates, group by owner family, compute family priority, and allocate the fixed quota. All input candidates remain with the caller in their original order. The result contains only annotations and aggregate quota records. A candidate count above five returns disabled with candidate-count-overflow; it is never silently truncated.

In every cardinality case, the result is invariant under candidate input permutation and has no effect on legal action generation or final action selection.

## 9. Disabled/shadow semantics

mode: disabled returns before evidence classification. It performs only input envelope checks needed to report candidateCount safely, produces empty annotations and quotas, sets fallbackReason: disabled-by-config, and causes no policy side effect. It does not call the privacy scanner, inspect plan groups, or access the public evidence fields for classification.

mode: shadow validates the evidence, candidate wrappers, active ID, and quota config; classifies all candidates; produces the frozen result; and returns it to a caller that may log aggregate diagnostics. The result is advisory metadata only. No caller in this plan is allowed to pass annotations or quotas to ensurePlans, selectActivePlan, generateActionCandidates, evaluateActionCandidate, runAiStep, or a room transition.

The result contains no action, legalActions, actionScore, selectedPlan, runtime, or candidatePlans property. That shape is an enforced boundary against action control. If a future D2d contract adds action priors, the prior must be a read-only aggregate/tag record, must not delete legal actions, must not change evaluator scores or ordering, and must be authorized in a separate D2d task.

## 10. Action-prior boundary

The latest D2 design mentions a possible action prior, but the current repository has no action signature that D2c can consume without crossing into D2d. D2c v1 therefore emits only plan family annotations, family priority, family quota, and aggregate diagnostics.

No D2c function may create a legal action, infer a representative action, filter an action, score an action, reorder ActionCandidate, or call the existing evaluator. The shadow result may be compared against an unchanged action decision in a test, but it may not be used as an input to that decision. Any action-prior implementation requires a separate D2d authorization and a bounded action backend.

## 11. Privacy and source boundary

### Module import allowlist

The AST source-boundary test permits only these imports in src/ai/planning/beliefGuidedPlanPolicy.ts:

    ../belief/lightweightPublicEvidence
    ../contracts

Both are type-only imports. The module has no runtime import from room, planner, runtime, server, provider/store, public event/ledger, particle, rollout, benchmark, or treatment code. The existing protected-group policy is reused by the caller before the D2c call; only stable protected group IDs enter D2cPlanCandidate.

The AST test rejects these module sources and identifiers:

    RoomState, PublicRoom, hands, initialHands, partnerHand, opponentsHands,
    deck, hiddenState, privateRuntime, AiRuntimeState, HandPlanner,
    generateHandPlans, generateFastHandPlans, generateRapidHandPlan,
    decideAiAction, runAiStep, ParticleBank, particles, rollout, likelihood,
    server, provider, store, identityProvider, identityStore, treatment,
    benchmark, simulation, performance, smoke, calibration, formal

It also rejects dynamic import(), require(), side-effect imports, and serialization of candidate plan objects or evidence into diagnostics.

### Recursive privacy boundary

D2c reuses assertLightweightPublicEvidencePrivacy on valid shadow input evidence. The D2c output is scanned independently with the normalized forbidden-key set:

    partnerHand, opponentsHands, hands, initialHands, deck, hiddenInitialHand,
    hiddenState, fullState, hypotheticalHands, ParticleBank, particles,
    privateRuntime, rolloutState, provider, store, identityProvider,
    identityStore, providerIdentity, installationIdentity, idempotencyKey,
    gameSequence, roomTransportId

Diagnostics contain only integer counts, family labels, stable plan keys, quota integers, mode, schema and fallback reason. They never contain the evidence object, HandPlan.groups, card IDs, Card[], private runtime, or serialized hidden state.

## 12. Failure/fallback behavior

All failures below return a frozen D2cDisabledResult, preserve the old AI action path, preserve candidates and runtime, and report the exact stable reason shown:

| Failure | Result |
|---|---|
| invalid evidence shape or non-finite evidence aggregate | invalid-evidence |
| evidence eventIndex is older than the caller's required snapshot contract | stale-evidence |
| evidence schema is not d2-lightweight-evidence-v1 | unknown-evidence-schema |
| candidate count greater than 5 | candidate-count-overflow |
| duplicate HandPlan.id | duplicate-plan-key |
| empty or non-string stable plan ID | missing-plan-key |
| unknown family label produced by classifier validation | invalid-family-annotation |
| unknown quota schema, non-integer/negative bound, or min/max inversion | invalid-quota-config |
| computed quota sum exceeds maxPlanExpansions | quota-exceeds-budget |
| runtime mode value is not disabled or shadow | unknown-mode |
| D2b privacy assertion or D2c output privacy scan fails | privacy-violation |

Unknown mode is tested through a runtime as unknown input because the exported TypeScript union prevents it in well-typed callers. Duplicate and missing stable keys are detected before any annotation is emitted. Invalid family labels are validated against the closed D2cPlanFamily set before output freezing. No error is converted into active mode, candidate deletion, planner retry, action change, or runtime mutation.

The stale evidence rule is limited to the input snapshot's declared eventIndex; D2c does not compare wall-clock time or room state. A caller that cannot establish the evidence/candidate snapshot pairing must call the old decision path and pass a stable stale reason to its own diagnostics; D2c itself does not access room state to repair the pairing.

## 13. Proposed file map

Future implementation allowlist:

| File | Responsibility |
|---|---|
| src/ai/planning/beliefGuidedPlanPolicy.ts | Pure D2c contracts, evidence validation, family classification, priority tuple, quota allocation, deep freeze, disabled/shadow result |
| tests/ai/beliefGuidedPlanPolicy.test.ts | RED, behavior, permutation, immutability, malformed-input, privacy, AST source boundary, and shadow no-op characterization |

No production adapter is included in this allowlist. If a future review authorizes one, it must be a separate file and separate commit after the pure policy gate; it may call the policy after the existing decision and discard the result, but it may not be combined with Task 2 or modify room.ts/aiDecisionEngine.ts.

## 14. Task-by-task TDD implementation

Each task below is independently reviewable. The listed commit subject is the only intended subject for that atomic boundary. Every test command must add --exclude ".worktrees/**" when run from repository root.

### Task 1: RED characterization

**Files:**

- Create: tests/ai/beliefGuidedPlanPolicy.test.ts
- No production file is created in this task.

**Interfaces:**

- Consumes: the future imports D2cPlanCandidate, D2cPlanPolicyInput, deriveD2cPlanPriorityQuota from src/ai/planning/beliefGuidedPlanPolicy.ts, D2b evidence fixtures, and existing HandPlan fixtures.
- Produces: failing tests that lock the exact D2c contract without touching production decision code.

- [ ] **Step 1: Add deterministic fixture builders and imports.**

Use HandPlan fixtures with valid existing PlanMetrics, D2b evidence fixtures created by existing public-ledger helpers, and D2cPlanCandidate wrappers containing only protectedGroupIds. The test must not call createRoom, read room hands, or construct a deck as a D2c input.

- [ ] **Step 2: Add zero/one/multi-cardinality RED cases.**

Add these exact test names:

    returns action-only disabled semantics for zero candidates without a fake plan
    annotates one existing candidate without expansion or duplication
    classifies two through five candidates without changing candidate order
    rejects more than five candidates with candidate-count-overflow

The assertions must check candidateCount, empty zero-plan output, one annotation for one plan, unchanged input JSON, and no candidate plan array in the result.

- [ ] **Step 3: Add taxonomy and priority RED cases.**

Add these exact test names:

    marks the active plan without treating D1 identity as a semantic family
    marks urgent-defense from public low-count evidence and candidate response coverage
    marks uncertainty-cover from mixed public play/pass evidence
    marks power-preserving and finishability from existing candidate metrics
    marks multi-family candidates as alternative with deduplicated family labels
    orders family and candidate ties by stable plan key

Use evidence-only public counts and recent action tendencies. Assert that no hidden-hand or private runtime fixture is passed to the policy.

- [ ] **Step 4: Add quota and invariance RED cases.**

Add these exact test names:

    allocates bounded quotas with conservation and per-family caps
    does not double-charge a candidate that belongs to multiple families
    is invariant to candidate input permutation
    returns byte-stable output for repeated equal input
    disabled mode skips classification and returns disabled-by-config

Assert sum(quota) <= maxPlanExpansions, lower/upper bounds, stable family order, and exact JSON equality across permutations/repeated calls.

- [ ] **Step 5: Add malformed-input and source-boundary RED cases.**

Add these exact test names:

    fails closed for invalid evidence and unknown evidence schema
    fails closed for duplicate or missing stable plan keys
    fails closed for invalid quota and over-budget configuration
    fails closed for an unknown runtime mode
    deep-freezes result and never mutates evidence or candidate inputs
    keeps the D2c module within evidence/contracts-only source boundaries

The source test must parse the actual future path with the TypeScript AST, require the two-item type-only import allowlist, reject forbidden identifiers, and reject dynamic import/require/side-effect imports.

- [ ] **Step 6: Run the focused RED gate.**

Run:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected result: collection fails only because src/ai/planning/beliefGuidedPlanPolicy.ts does not exist. There must be no fixture/setup failure, no URL-scheme failure, and no unrelated production test failure.

- [ ] **Step 7: Commit the characterization.**

    git add tests/ai/beliefGuidedPlanPolicy.test.ts
    git commit -m "test: characterize D2c plan priority and quota"

Stop if any file outside the test allowlist is staged or if the RED failure is not a module-resolution failure.

### Task 2: Minimal pure D2c policy

**Files:**

- Create: src/ai/planning/beliefGuidedPlanPolicy.ts
- Modify: tests/ai/beliefGuidedPlanPolicy.test.ts only to observe GREEN behavior

**Interfaces:**

- Consumes: D2cPlanPolicyInput with D2b evidence, 0–5 D2cPlanCandidate wrappers, optional activePlanId, disabled/shadow mode, and D2cQuotaConfig.
- Produces: D2cPlanPolicyResult with immutable annotations, family priority/quota and aggregate diagnostics.

- [ ] **Step 1: Implement the exact type declarations.**

Copy the contracts in section 4 verbatim into the module. Import LightweightPublicEvidence and HandPlan as type-only imports. Do not import AiRuntimeState, PlanSelectionMode, HandPlanner, room, powerGroupPolicy, or any module outside the two-item allowlist.

- [ ] **Step 2: Implement validation and disabled semantics.**

Implement validateEvidence, validateCandidateKeys, and validateQuotaConfig as private functions. deriveD2cPlanPriorityQuota must return the disabled result for every listed fallback reason and must not mutate input. mode === "disabled" must return before classification. The disabled result must contain no annotations or candidate plans.

- [ ] **Step 3: Implement pure family classification.**

Implement the predicates and labels in section 5. Use explicit fixed family order, Set de-duplication, candidate metric validation, protected group ID validation, and no hidden-state inference. Return the labels sorted by descending family tier and ascending family name.

- [ ] **Step 4: Implement priority and owner-family selection.**

Implement the exact integer candidateQuality formula and tuple comparison in section 6. Use HandPlan.id as the stable key. Choose one owner family for quota accounting while retaining all deduplicated labels in each annotation.

- [ ] **Step 5: Implement the fixed quota allocator.**

Implement the eight-step algorithm in section 7. The allocator must use only candidate counts, family tiers, stable names and integer budget fields. It must never create a HandPlan, call a planner, or write caller state.

- [ ] **Step 6: Implement deep freeze and output construction.**

Construct records in sorted key order, deep-freeze the full graph, and scan the result's keys against the D2c forbidden set. Return shadow only after all invariants pass. Do not return plan objects, groups, cards, action scores, runtime, or evidence.

- [ ] **Step 7: Run the focused GREEN gate.**

Run:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected result: all Task 1 tests pass; no test is skipped or marked todo; no module-resolution, fixture, privacy, or action-path failure is present.

- [ ] **Step 8: Run TypeScript and commit the pure policy.**

Run:

    npx tsc --noEmit --pretty false
    git diff --check

Expected result: TypeScript exit 0 and diff-check exit 0. Commit only the two allowlisted files:

    git add src/ai/planning/beliefGuidedPlanPolicy.ts tests/ai/beliefGuidedPlanPolicy.test.ts
    git commit -m "feat: derive deterministic D2c shadow priorities"

Stop if the module imports a forbidden source or if any output can alter candidate/action/runtime state.

### Task 3: Privacy, immutability and malformed-input hardening

**Files:**

- Modify: src/ai/planning/beliefGuidedPlanPolicy.ts
- Modify: tests/ai/beliefGuidedPlanPolicy.test.ts

**Interfaces:**

- Consumes: the Task 2 pure policy contracts and malformed unknown inputs cast only inside tests.
- Produces: fail-closed, deeply frozen, input-non-mutating shadow/disabled behavior with complete negative coverage.

- [ ] **Step 1: Add the complete negative matrix.**

Use these exact test cases and expected reasons:

    unknown evidence schema -> unknown-evidence-schema
    negative/non-integer evidence count -> invalid-evidence
    stale event index -> stale-evidence
    candidate count 6 -> candidate-count-overflow
    duplicate id -> duplicate-plan-key
    empty id -> missing-plan-key
    invalid protected group id -> invalid-family-annotation
    unknown quota schema or fractional quota -> invalid-quota-config
    negative quota or min greater than max -> invalid-quota-config
    minimum quota larger than expansion budget -> quota-exceeds-budget
    unknown mode -> unknown-mode
    recursive forbidden output key -> privacy-violation

Each case must assert the old input JSON is unchanged, the result is disabled, the exact reason is stable, and no annotation/quota is emitted.

- [ ] **Step 2: Add full graph freeze checks.**

Traverse arrays and records recursively and assert every result node is frozen. Attempt mutation of evidence, candidate wrapper, plan metrics, annotation record, family quota array, diagnostics and result record; in strict mode each attempted output mutation must fail or leave JSON bytes unchanged.

- [ ] **Step 3: Add permutation and byte-stability checks.**

Run the same candidate set in at least three permutations, compare JSON.stringify(result), annotation key order, family order, owner family, and quota records. Confirm repeated equal input produces identical bytes.

- [ ] **Step 4: Re-run focused and D2b regression gates.**

Run:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
    npx vitest run tests/ai/lightweightPublicEvidence.test.ts tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerDependency.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected result: focused D2c and the 12-file D2a/D2b gate pass with no .worktrees/ collection and no production decision-path change.

- [ ] **Step 5: Commit hardening.**

    git add src/ai/planning/beliefGuidedPlanPolicy.ts tests/ai/beliefGuidedPlanPolicy.test.ts
    git commit -m "test: harden D2c privacy and source boundaries"

Stop if any malformed input changes the old action path or if output privacy requires reading hidden state.

### Task 4: Shadow integration characterization

**Files:**

- Modify: tests/ai/beliefGuidedPlanPolicy.test.ts
- No production adapter file is authorized in this task.

**Interfaces:**

- Consumes: the pure D2c result, existing deterministic decideAiAction test fixtures, cloned AiRuntimeState, and public D2b evidence.
- Produces: test evidence that a separately computed shadow result is observable without becoming a decision input.

- [ ] **Step 1: Capture the existing action boundary.**

Call the existing decideAiAction with an unchanged fixture twice, capture action, canonical runtime JSON, candidate IDs/order, legal candidate/action keys, and the existing public event/hash/replay bytes. Do not add a D2c call to room.ts or aiDecisionEngine.ts.

- [ ] **Step 2: Compute a detached shadow result.**

After the first decision returns, wrap its existing selectedPlan/candidate plans as D2cPlanCandidate values with protected group IDs supplied by the existing policy fixture, call deriveD2cPlanPriorityQuota in shadow, and retain the result only in the test. The test must never pass annotations or quotas back to decideAiAction.

- [ ] **Step 3: Assert no-op invariants.**

Add these exact test names:

    emits shadow family and quota diagnostics without changing the existing action
    preserves candidate order runtime bytes public hash and replay bytes beside shadow output
    does not increase planner calls or HandPlanner calls when shadow output is computed
    disabled mode performs no classification and no decision side effect

Assert candidate count/order, action bytes, runtime bytes, random seed/config, public event/hash, replay schema, and D0 keep-current fixture bytes are unchanged. The test must explicitly assert that no D2c result property can be used as an action or candidate list.

- [ ] **Step 4: Run the boundary gate.**

Run:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected result: all shadow boundary tests pass, with no production source modification and no action difference.

- [ ] **Step 5: Commit only characterization changes.**

    git add tests/ai/beliefGuidedPlanPolicy.test.ts
    git commit -m "test: characterize D2c shadow integration boundary"

Stop if a detached shadow call changes action, candidate order, runtime, public hash, replay bytes, planner-call count, or D0 fixture bytes. Do not add an adapter in response; obtain a separate integration authorization.

### Task 5: Local non-restricted verification

**Files:**

- No source, test, package, fixture, artifact, or configuration changes are allowed.

**Interfaces:**

- Consumes: committed Task 1–4 D2c policy/test files and existing D2a/D2b baseline.
- Produces: local verification evidence only.

- [ ] **Step 1: Run focused D2c.**

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected result: all D2c tests pass, no skipped/todo tests, natural completion.

- [ ] **Step 2: Run D2a/D2b regression.**

    npx vitest run tests/ai/lightweightPublicEvidence.test.ts tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerDependency.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected result: all 12 files pass and no .worktrees/ path is collected.

- [ ] **Step 3: Run TypeScript and build.**

    npx tsc --noEmit --pretty false
    npm run build

Expected result: both exit 0 and natural completion. Build output must not modify tracked files or create unexpected untracked files.

- [ ] **Step 4: Run the approved non-restricted regression.**

    npm run test:d2a1-regression -- --exclude ".worktrees/**"

The script must retain its built-in exclusions for tests/benchmark/**, tests/simulation/**, and tests/performance/**. Do not run the repository's npm test because its second command executes the performance test. Record file/test counts, failures, skipped/todo count, duration, natural completion, unhandled rejection, worker crash, and forced termination.

- [ ] **Step 5: Run boundary and artifact checks.**

    git diff --check
    git diff --exit-code -- tests/ai/fixtures/d0KeepCurrentCases.json docs/benchmark-approvals artifacts
    git grep -n "deriveD2cPlanPriorityQuota\|D2cPlanPolicy\|beliefGuidedPlanPolicy" -- src/game/room.ts src/ai/contracts.ts src/ai/runtimeContracts.ts src/ai/aiDecisionEngine.ts src/ai/planning/handPlanner.ts

Expected result: diff-check and frozen diff exit 0; the production path scan returns 0 matches. The D2c module itself is not included in the production path scan because its existence is allowed and its own AST boundary is tested separately.

- [ ] **Step 6: Stop at the active-mode gate.**

Record that no active mode, action reducer, particle, likelihood, rollout, team utility, treatment, benchmark, or production adapter was implemented. Any request to use shadow output to filter/reorder candidates must stop and require D2d authorization.

### Task 6: D2c-active remains prohibited

**Files:**

- No files are modified by this task.

**Interfaces:**

- Consumes: the D2c plan policy result only as a documented boundary.
- Produces: an authorization stop condition, not an implementation.

- [ ] **Step 1: Preserve the closed mode type.**

The only permitted type remains:

    export type PlanPruningMode = "disabled" | "shadow";

Do not add active, an active config branch, candidate filtering, candidate reordering, action prior consumption, or runtime sidecar.

- [ ] **Step 2: Require a separate gate before active work.**

Active mode cannot begin until D2d's bounded representative-action backend is implemented and separately approved, or a new architecture decision explicitly authorizes active behavior. D2c shadow output must never be used to filter or reorder candidates in the current implementation.

- [ ] **Step 3: Stop and report if active behavior is requested.**

The stop report must state D2C_ACTIVE_MODE_NOT_AUTHORIZED and leave the old keep-current action path unchanged.

## 15. Exact test matrix

The concentrated test file must contain these groups and exact observable assertions:

| Group | Test names / assertions |
|---|---|
| cardinality | zero action-only disabled; one no expansion; 2–5 all annotated; 6 rejected |
| taxonomy | active marker; urgent-defense; finishability; power-preserving; uncertainty-cover; alternative; other |
| priority | urgent > active > public high-value family > uncertainty > alternative/other; numeric tuple and stable key tie-break |
| quota | max family count; max expansion count; min/max quota; unique owner charging; conservation; budget shortage/drop order; remaining-budget allocation |
| determinism | candidate permutation, repeated JSON bytes, stable family/name key order |
| disabled | no classification, no plan generation, no side effect, stable disabled reason |
| malformed | invalid evidence, stale evidence, unknown schema, overflow, duplicate/missing key, invalid family/config, over-budget, unknown mode, privacy violation |
| immutability | complete deep freeze and unchanged input JSON |
| source boundary | exact type-only imports, denylist, no dynamic import/require/side effect |
| shadow boundary | shadow result exists, candidate/action/runtime/public hash/replay/D0 bytes unchanged, no extra planner calls |

Each row must have a named it/test case in tests/ai/beliefGuidedPlanPolicy.test.ts; broad loop-only assertions are insufficient for the malformed reason matrix.

## 16. Commit boundaries

The future atomic sequence is:

1. test: characterize D2c plan priority and quota — test file only; RED collection gate.
2. feat: derive deterministic D2c shadow priorities — policy module plus focused test updates; GREEN focused gate and TypeScript.
3. test: harden D2c privacy and source boundaries — policy/test hardening only; focused plus D2a/D2b regression gate.
4. test: characterize D2c shadow integration boundary — test file only; detached shadow no-op gate.

No active integration, D2d reducer, D2e particle, D2f rollout, or D2g treatment/benchmark change may enter any of these commits. Each commit is reviewed independently and must satisfy its listed stop condition before the next commit.

## 17. Allowed and forbidden files

### Future D2c implementation allowlist

    src/ai/planning/beliefGuidedPlanPolicy.ts
    tests/ai/beliefGuidedPlanPolicy.test.ts

Task 1 and Task 4 may modify only the test file. Task 2 and Task 3 may modify both allowlisted files. Task 5 and Task 6 modify nothing.

### Forbidden in every D2c task

    src/game/room.ts
    src/ai/aiDecisionEngine.ts
    src/ai/contracts.ts
    src/ai/runtimeContracts.ts
    src/ai/planning/handPlanner.ts
    src/ai/planning/planManager.ts
    src/ai/planning/planSelector.ts
    src/ai/planning/planEvaluator.ts
    src/server/**
    src/ui/**
    src/game/publicEvent.ts
    src/game/publicEventHash.ts
    src/game/publicLedger.ts
    src/game/publicEventReplay.ts
    package.json
    package-lock.json
    tsconfig.json
    vitest.config.*
    tests/ai/fixtures/**
    tests/benchmark/**
    tests/simulation/**
    tests/performance/**
    docs/benchmark-approvals/**
    artifacts/**

No D2c task deletes or modifies existing D2a/D2b worktrees or branches, pushes, pulls, fetches, creates a PR, generates fixtures, regenerates artifacts, or registers a treatment.

## 18. Verification gates

Every implementation handoff must show:

1. focused D2c tests with .worktrees/** excluded;
2. D2a/D2b 12-file regression with .worktrees/** excluded;
3. npx tsc --noEmit --pretty false exit 0;
4. npm run build exit 0 and natural completion;
5. npm run test:d2a1-regression -- --exclude ".worktrees/**" with restricted paths absent;
6. git diff --check exit 0;
7. frozen fixture/artifact diff exit 0;
8. production action-path grep with zero D2c references;
9. source-boundary AST test with exact import allowlist and denylist;
10. deep-freeze, input-nonmutation, permutation, quota-conservation, and detached shadow no-op tests.

The final local gate must also inspect git status --short --untracked-files=all and git diff --name-only, requiring only the two future allowlisted files before their commit and a clean worktree after each commit.

## 19. Stop conditions

Stop the D2c effort and report the exact blocking condition if any of the following occurs:

- D2c needs a hidden/private input, RoomState, any player's hand, deck, private runtime, particle bank, or rollout state.
- D2c needs to call unbounded HandPlanner or regenerate a candidate to satisfy quota.
- Shadow output changes candidate count/order, legal actions, evaluator score/order, final action, runtime, random seed, public event/hash, replay schema, PublicRoom, or D0 fixture bytes.
- D2c requires a public event, ledger, or replay schema change.
- D2c requires a D0/D1 artifact, fixture, approval, benchmark, simulation, performance, smoke, calibration, formal, or treatment change.
- D2c requires D2d reducer, D2e particle/likelihood/ESS, D2f CRN/rollout/team utility, or D2g engine/treatment behavior before its separately approved gate.
- Any Critical or Important review finding remains open.
- A source, test, package, fixture, artifact, or branch changes outside the allowlist.
- Candidate count exceeds five, stable plan key is missing/duplicated, evidence is stale/unknown, quota is invalid/over-budget, or privacy scan fails.

## 20. Self-review

The plan was checked against the D2 design, D2b contract, actual HandPlan/D1/runtime types, current room-to-decision path, protected-group policy, D2b tests, plan manager/selector/evaluator tests, planQuality.test.ts, and protectedGroups.test.ts.

Coverage result:

- 0/1/2–5 cardinalities: Task 1, sections 7–8, and the test matrix.
- active/urgent/uncertainty/multi-family taxonomy: section 5 and Task 1.
- stable priority/tie-break/permutation: section 6 and Tasks 1/3.
- fixed quota bounds/conservation/shortage/remaining budget: section 7 and Task 1.
- disabled/shadow no-op and active prohibition: sections 9–10 and Task 6.
- privacy/source AST/deep freeze/malformed matrix: sections 11–12 and Task 3.
- shadow integration boundary: Task 4.
- local verification and restricted-workload exclusions: Task 5 and section 18.
- exact future file/commit allowlist: sections 13, 14, 16, and 17.

Placeholder scan: every implementation step has a concrete file, interface, test name, command, expected result, allowlist, commit subject, and stop condition; no unresolved template marker remains.

Type consistency: PlanPruningMode, D2cPlanFamily, D2cFallbackReason, D2cQuotaConfig, D2cPlanCandidate, D2cPlanPolicyInput, D2cPlanAnnotation, D2cFamilyQuota, D2cDiagnostics, D2cDisabledResult, D2cShadowResult, D2cPlanPolicyResult, and deriveD2cPlanPriorityQuota are used consistently in the contract, tasks, tests, and verification gates.

Ordering review: no old particle-first ordering is present. D2c does not implement active mode, D2d reducer, D2e particle, D2f rollout, D2g treatment/benchmark, hidden/private input, production action change, public schema change, or formal workload.

Review findings:

    Critical: none
    Important: none
    Minor: The current repository has no production shadow adapter and no D2c semantic family type; the plan records the minimum pure read-only representation and keeps any adapter as a separately authorized boundary.

## 21. Final authorization status

This document is plan-only. No D2c implementation, active mode, production integration, D2d–D2g work, restricted workload, remote operation, or formal workload is authorized by the plan itself.

    MAIN_POST_D2B_VERIFICATION_COMPLETE
    MAIN_DEPENDENCY_ENVIRONMENT_RECONCILED
    D2C_PLAN_READY_FOR_REVIEW
    D2C_IMPLEMENTATION_NOT_AUTHORIZED
    D2C_ACTIVE_MODE_NOT_AUTHORIZED
    D2B_D2C_ACTION_CONTROL_NOT_AUTHORIZED
    D2D_TO_D2G_NOT_AUTHORIZED
    D2_REMOTE_OPERATIONS_NOT_AUTHORIZED
    D2_FORMAL_EXECUTION_NOT_AUTHORIZED
    formalExecutionAllowed=false
