# D2c Plan Priority / Quota Shadow Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.
**Goal:** 使用 D2b 的 LightweightPublicEvidence 对现有 0–5 个候选计划进行确定性的计划类别识别、优先级排序和固定配额计算；第一轮只支持 disabled 和 shadow，不改变候选计划、planner 调用、合法动作、runtime 或最终出牌。
**Architecture:** 新增一个不接入正式决策路径的纯函数模块 src/ai/planning/beliefGuidedPlanPolicy.ts。它消费 D2b evidence、现有只读 HandPlan 和受保护组 ID，输出深冻结的 family/priority/quota/diagnostics shadow 记录；不生成计划、不调用 HandPlanner、不筛除或重排 candidate plans，也不产生 D2d action reducer 输入。
**Tech Stack:** TypeScript, Vitest, existing GuanDan AI planning and D2 public-evidence contracts.

## Global Constraints

- Verified implementation base is main 43be5089f87c5710ae90932b1ea2d25e01b95565 with tree ac904a6afbd6abf111c7d8eed46b58a1cb9a637a; planning branch is codex/d2c-plan.
- formalExecutionAllowed=false remains unchanged.
- The only first-release modes are PlanPruningMode = "disabled" | "shadow"; there is no active mode.
- D2c never changes candidatePlans, candidate count, candidate order, legal actions, evaluator scores, selected action, AiRuntimeState, public event/hash, replay schema, PublicRoom, D0 fixtures, or artifacts.
- D2c never calls generateHandPlans, generateFastHandPlans, generateRapidHandPlan, HandPlanner, decideAiAction, runAiStep, an unbounded planner, an action reducer, a particle sampler, a likelihood evaluator, a rollout policy, a treatment registry, a benchmark runner, a server provider/store, or a production integration adapter.
- D2c input contains no RoomState, any player's hands, initialHands, partnerHand, opponentsHands, deck, hiddenState, private runtime, particle bank, rollout state, or provider/store identity internals.
- The future implementation allowlist is exactly src/ai/planning/beliefGuidedPlanPolicy.ts and tests/ai/beliefGuidedPlanPolicy.test.ts.
- No task changes room.ts, aiDecisionEngine.ts, contracts.ts, runtimeContracts.ts, handPlanner.ts, public event/ledger/replay modules, package files, fixtures, artifacts, benchmark approvals, or server/UI files.
- All stable text ordering uses one UTF-16 code-unit comparator. No locale-dependent ordering, environment locale, case-localized ordering, Date.now(), performance.now(), Math.random(), worker order, wall-clock duration, object address, filesystem order, or directory order may affect a normal result.
- A D2c failure leaves the old AI path untouched and returns a stable disabled result with one D2cFallbackReason.
- Fractional values in the six candidate-quality inputs are allowed. D2c validates those six fields only for number and finite value, calculates the exact formula, then applies six-decimal D2c normalization. Existing PlanMetrics is not changed or narrowed.

---

## 1. Goal and non-goals

### Goal

D2c has three pure responsibilities:

1. classify every existing candidate into a deterministic, deduplicated list of public plan families;
2. sort family and candidate annotations with a fixed priority tuple and stable UTF-16 key ordering;
3. calculate bounded family-level quotas as diagnostic metadata without using quota to select, delete, copy, or regenerate a candidate.

The output is detached shadow metadata. The first implementation does not call the decision engine or planner and does not register a production adapter.

### Non-goals

D2c does not generate candidate plans, call an unbounded HandPlanner, delete or reorder candidates, change legal action generation, choose or score an action, create particles, infer complete hidden hands, execute rollout, compute team utility, register treatment, run benchmark/simulation/performance/smoke/calibration/formal workload, or enter active mode.

The current D2 design order is D2a public ledger, D2b lightweight public evidence, D2c plan priority/quota shadow, D2d representative action reducer, D2e particle/likelihood/ESS, D2f CRN rollout/team utility, and D2g engine treatment/benchmark/ablation. D2c does not implement any later stage.

## 2. Verified baseline

| Check | Result |
|---|---|
| branch | main |
| HEAD | 43be5089f87c5710ae90932b1ea2d25e01b95565 |
| tree | ac904a6afbd6abf111c7d8eed46b58a1cb9a637a |
| D2b ancestor | 2785eac4ce0b32854d6d612b60ab76ddb43ca21e is an ancestor of main |
| D2b focused | 1 file, 31 tests passed |
| D2b combined | 12 files, 66 tests passed |
| TypeScript | exit 0 after local dependencies were restored |
| build | exit 0, natural completion |
| non-restricted regression | 70 files, 616 tests passed, exit 0 |
| frozen evidence | git diff --exit-code exit 0 |
| production D2b scan | 0 matches in frozen decision-path files |
| main worktree | clean |

D2a/D2b commands exclude .worktrees/** because linked historical worktrees contain same-named characterization tests. No historical worktree or branch is modified by this plan.

Design source: docs/plans/2026-07-16-d2-belief-guided-bounded-search-design.md. D2b contract: src/ai/belief/lightweightPublicEvidence.ts. Frozen D2b plan: docs/superpowers/plans/2026-07-19-d2b-lightweight-public-evidence.md. No D2c implementation module exists at this base.

## 3. Current architecture map

### LightweightPublicEvidence boundary

The D2b function is:

    deriveLightweightPublicEvidence(
      ledger: HardPublicLedger,
      recentEvents: readonly PublicActionEvent[],
      perspectiveSeat: PublicSeat,
    ): LightweightPublicEvidence

It consumes public ledger/event/hash contracts only. Its output has schemaVersion "d2-lightweight-evidence-v1", hardPublicFacts, derivedSignals, and frozen provenance.

D2c may read only:

- hardPublicFacts.remainingCardCounts keyed by self, partner, leftOpponent, and rightOpponent;
- hardPublicFacts.finishOrder;
- derivedSignals.recentActions containing all event kinds in the canonical last-16 window;
- derivedSignals.recentPassStreakByRelation;
- derivedSignals.recentActionTendencies with playCount, passCount, and lastActionKind;
- schemaVersion, eventIndex, perspectiveSeat, gameId, roundIdentity, and handIdentity.

D2c calls the D2b privacy assertion, does not serialize evidence, and has no hidden-state input.

### Existing plan and runtime types

Actual definitions are in src/ai/contracts.ts:

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

PlanMetrics contains hardViolations, protectionLoss, estimatedTurns, lowSingleCount, retainedControl, wildcardFlexibility, responseCoverage, leadFlexibility, and fallbackScore. The existing fractional fixture at tests/ai/planIdentity.test.ts:17 contains protectionLoss 0.123456789 and estimatedTurns 1.23456789. D2c does not change PlanMetrics or impose a new domain on unused fields.

src/ai/runtimeContracts.ts defines PlanIdentity with rootPlanId, planFamilyId, and lineageId, plus D1PlanSelectionState with activePlanId, activePlanFamilyId, and planIdentityById. D1 family IDs are identity-lineage identifiers, not D2c semantic family labels. D2c reuses HandPlan.id and reads the current active ID only.

src/ai/policy/powerGroupPolicy.ts computes protected groups through createPowerGroupPolicyIndex/protectedPowerGroups. The future caller supplies only stable protected group IDs in D2cPlanCandidate; D2c does not import private hands or rerun the policy.

### Room-to-decision path

    src/game/room.ts:runAiStep
      -> decideAiAction(observation, room.aiRuntime[seat], config, invocation?)
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

getPublicRoom may call ensureAiPlans, which calls ensurePlans, but it does not expose the public ledger or private runtime. D2c is not called from this path. A separately authorized adapter would compute detached metadata after the existing decision and discard it.

### Candidate cardinality and reusable concepts

The existing planner budget has maxPlans, ensurePlans returns candidatePlans from generateFastHandPlans, and the D1 selector uses the active plan plus challengers with current default k = 5. Runtime supports 0, 1, and 2–5 candidates. D2c rejects more than five rather than truncating.

| Concept | Actual source | D2c treatment |
|---|---|---|
| active plan | AiRuntimeState.activePlanId and D1 selection state | optional equality against HandPlan.id |
| stable plan key | HandPlan.id | canonical key and final tie-break |
| plan family identity | D1PlanSelectionState.planIdentityById[*].planFamilyId | not confused with D2c labels |
| protected group | src/ai/policy/powerGroupPolicy.ts | supplied as stable group IDs |
| urgent-defense | no named type | derived from public low-count/finish signals plus candidate metrics |
| uncertainty-cover | no named type | derived from mixed public play/pass evidence plus candidate coverage |
| quota/budget | PlanningBudget exists for planner generation | D2c adds a separate frozen quota config |
| action prior | no suitable D2c action signature | omitted from D2c v1 |

D2c reuses existing contracts and does not modify planManager.ts, planSelector.ts, planEvaluator.ts, HandPlanner, room.ts, or the decision engine.

## 4. Exact data contracts

The future module has exactly two import sources:

    import {
      assertLightweightPublicEvidencePrivacy,
      type LightweightPublicEvidence,
    } from "../belief/lightweightPublicEvidence";
    import type { HandPlan } from "../contracts";

The D2b source has one runtime named binding, assertLightweightPublicEvidencePrivacy, and one type binding, LightweightPublicEvidence. The contracts source is type-only. There are no default, namespace, side-effect, dynamic, or CommonJS imports.

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

    export type D2cEvidenceSnapshotRef = Readonly<{
      gameId: string;
      roundIdentity: string;
      handIdentity: string;
      eventIndex: number;
    }>;

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
      expectedEvidenceSnapshot: D2cEvidenceSnapshotRef;
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
    }>;

    export type D2cFamilyPriority = Readonly<{
      family: D2cPlanFamily;
      priority: number;
      candidatePlanKeys: readonly string[];
    }>;

    export type D2cFamilyQuota = Readonly<{
      family: D2cPlanFamily;
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
      familyPriority: readonly D2cFamilyPriority[];
      familyQuotas: readonly D2cFamilyQuota[];
      diagnostics: D2cDiagnostics;
    }>;

    export type D2cPlanPolicyResult =
      | D2cDisabledResult
      | D2cShadowResult;

    export function deriveD2cPlanPriorityQuota(
      input: D2cPlanPolicyInput,
    ): D2cPlanPolicyResult;

Contract decisions:

- HandPlan.id is the stable key. D2c never creates a transient identity and never hashes a private hand.
- expectedEvidenceSnapshot contains only D2b-public gameId, roundIdentity, handIdentity, and eventIndex. It never contains room, hands, runtime, or hidden state.
- candidatePlans is not returned. annotations is keyed by stable plan ID and contains no plan or group object.
- D2cPlanAnnotation deliberately has no quota field. Quota is a family-level diagnostic, not candidate selection, expansion count, retained flag, or candidate copy state.
- familyPriority contains every discovered owner family in complete priority order and does not imply selection or expansion.
- familyQuotas contains only quota > 0, has no candidate object, preserves familyPriority relative order, and sums to diagnostics.quotaTotal.
- Every output object, array, and record is deep-frozen. Inputs are never mutated and no input object is retained in output.
- Diagnostics contain only aggregate counts, stable keys, family/quota data, mode, schema, and one fallback reason; no evidence object, cards, groups, runtime, action, private state, or wall-clock data.

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
      ((left.playCount > 0 && left.passCount > 0) ||
       (right.playCount > 0 && right.passCount > 0));

    publicHighValue =
      leftOpponentCount <= 5 ||
      rightOpponentCount <= 5 ||
      evidence.hardPublicFacts.finishOrder.length > 0;

Counts come from evidence.hardPublicFacts.remainingCardCounts. No hidden hand, pass explanation, or future action is inferred.

### Candidate labels

Compute labels in this order and deduplicate with a set:

1. active when activePlanId === plan.id.
2. urgent-defense when publicUrgency is true and the plan has responseCoverage > 0, a protected group ID, or a non-single group.
3. finishability when estimatedTurns equals the minimum finite estimatedTurns among supplied candidates.
4. power-preserving when protectedGroupIds.length > 0 or the plan has a protected power group and protectionLoss === 0.
5. uncertainty-cover when publicUncertainty is true and the plan has responseCoverage > 0 or leadFlexibility >= 2.
6. alternative when the candidate has at least two labels among items 2–5, or when an active plan exists and a non-active candidate has a distinct strongest non-active label.
7. other when no label was assigned.

An active candidate can have other labels. When no active plan exists, no candidate receives active. When activePlanId is supplied but absent from candidatePlans, the input is stale. A candidate may belong to multiple families; ownerFamily is selected once by highest family tier, then compareStableText on the family label. Duplicate family labels do not consume additional quota.

The repository has no explicit urgent-defense or uncertainty-cover type. These labels are the minimum read-only D2c representation; no planner refactor is required. D2c does not use hidden state to classify a family.

## 6. Priority, fractional candidate quality, and stable tie-break

The candidate priority tuple is:

    [
      familyTier,
      publicSignalTier,
      candidateQuality,
      stablePlanKey,
    ]

The numeric components sort descending. stablePlanKey sorts ascending with the same UTF-16 comparator used everywhere else.

| Family | familyTier |
|---|---:|
| urgent-defense | 500 |
| active | 400 |
| finishability | 300 |
| power-preserving | 300 |
| uncertainty-cover | 200 |
| alternative | 100 |
| other | 0 |

For multi-family candidates, familyTier is the maximum tier. publicSignalTier is 2 for publicUrgency, 1 for publicHighValue without urgency, and 0 otherwise.

Candidate quality reads exactly six fields: estimatedTurns, lowSingleCount, retainedControl, responseCoverage, leadFlexibility, and protectionLoss. Each must satisfy typeof value === "number" and Number.isFinite(value). There is no integral, sign, or decimal-length restriction. Unused hardViolations, wildcardFlexibility, and fallbackScore are not domain-narrowed by this validator.

The exact raw formula is:

    1000
      - 100 * estimatedTurns
      - 10 * lowSingleCount
      + 10 * retainedControl
      + 5 * responseCoverage
      + 5 * leadFlexibility
      - 50 * protectionLoss

Use exactly:

    const D2C_SCORE_DECIMALS = 6;
    const D2C_SCORE_SCALE = 1_000_000;

    function roundD2cScore(value: number): number {
      const rounded =
        Math.round(value * D2C_SCORE_SCALE) / D2C_SCORE_SCALE;
      return Object.is(rounded, -0) ? 0 : rounded;
    }

Compute raw candidateQuality from the formula, then apply roundD2cScore. A non-finite input or non-finite raw/derived score returns invalid-family-annotation. Values are not coerced and PlanMetrics is not changed.

The canonical finishability signal is the minimum estimatedTurns. The canonical power-preserving signal requires protectionLoss === 0 or an existing protected group. The authorized D1 fixture at tests/ai/planIdentity.test.ts:17 includes protectionLoss 0.123456789 and estimatedTurns 1.23456789; D2c tests preserve these values and assert deterministic six-decimal derived quality.

Use this comparator for stablePlanKey, family labels, owner-family numeric-tier ties, record insertion order, candidatePlanKeys, familyPriority, and familyQuotas:

    function compareStableText(left: string, right: string): number {
      return left < right ? -1 : left > right ? 1 : 0;
    }

This is UTF-16 code-unit ordering, independent of locale or process environment. Candidate permutation therefore yields equal labels, priority, quota, diagnostics, and serialized result bytes. No time, random value, or worker order participates.

This is plan-category priority only. It is not an action-layer rule.

## 7. Fixed quota algorithm

Frozen default:

    const D2C_DEFAULT_QUOTA_CONFIG: D2cQuotaConfig = Object.freeze({
      schemaVersion: "d2c-plan-quota-v1",
      maxPlanFamilies: 3,
      maxPlanExpansions: 5,
      minQuotaPerFamily: 1,
      maxQuotaPerFamily: 3,
    });

Validation:

- schemaVersion must be d2c-plan-quota-v1;
- maxPlanFamilies is an integer in 1..5;
- maxPlanExpansions is an integer in 0..5;
- minQuotaPerFamily is an integer in 1..maxQuotaPerFamily;
- maxQuotaPerFamily is an integer in 1..5;
- when maxPlanExpansions is positive, minQuotaPerFamily must not exceed it;
- malformed, negative, non-integer, inverted, or out-of-range configuration returns invalid-quota-config.

maxPlanExpansions === 0 is valid shadow: familyPriority remains complete, familyQuotas is empty, and quotaTotal is 0.

Allocator:

1. Validate candidate keys and classify candidates.
2. Assign one ownerFamily per candidate; repeated membership does not charge twice.
3. Sort each family by highest member priority, then compareStableText(family).
4. Keep familyPriority complete, including families receiving no quota.
5. For zero budget, emit no quota.
6. For positive budget, select no more than maxPlanFamilies and no more than Math.floor(maxPlanExpansions / minQuotaPerFamily) families. A family is eligible only when it has enough distinct candidate keys for the minimum.
7. Give selected families the minimum, capped by candidate count and maxQuotaPerFamily.
8. While budget remains, add one unit to the selected family with largest remaining deficit, capped by candidate count and maxQuotaPerFamily. Ties use familyPriority order and compareStableText.
9. Emit only quota > 0 in familyPriority relative order.
10. Set diagnostics.quotaTotal to the sum and check the postconditions.

quota-exceeds-budget is only for allocator postcondition failures: produced quota is non-integer/negative/above max, sum exceeds maxPlanExpansions, duplicate family quota, or familyQuotas order disagrees with familyPriority. It is not used for malformed config. Use Math.floor explicitly; never depend on implicit fractional truncation. The allocator never creates a candidate, calls a planner, or changes caller state.

## 8. candidatePlans 0/1/2–5 semantics

- 0: stable disabled result, candidateCount 0, empty annotations/family arrays, quotaTotal 0, and no-candidates-action-only. No pseudo-plan, identity, alignment, damage, switch, or expansion.
- 1: retain the one read-only annotation and one owner family. The fixed allocator may emit one positive family quota, or none for zero budget. Never copy or expand the candidate.
- 2–5: classify all, keep complete familyPriority, allocate family-level quota, and leave caller count/order unchanged. More than 5 returns candidate-count-overflow.
- Every cardinality has permutation-invariant output and no effect on legal actions or final selection.

## 9. Disabled and shadow semantics

disabled returns before evidence classification and before the D2b privacy function. It performs only envelope checks needed for a stable candidate count, returns empty annotations and family arrays, and uses disabled-by-config. It has no policy side effect.

shadow validates evidence, expected snapshot, candidates, active ID, and quota config; classifies and freezes advisory metadata. No caller may pass it to ensurePlans, selectActivePlan, generateActionCandidates, evaluateActionCandidate, runAiStep, or a room transition.

The result has no action, legalActions, actionScore, selectedPlan, selectedPlanId, runtime, or candidatePlans property. D2c v1 emits no action prior. Any later prior is a separate D2d contract and cannot delete legal actions, change evaluator scores, reorder actions, or generate actions.

## 10. Action-prior boundary

The current code has no suitable D2c action signature. D2c v1 emits only plan annotations, complete family priority, positive family quotas, and diagnostics. Any use of a prior to reduce or reorder actions belongs to separately authorized D2d.

## 11. Privacy and source boundary

Exact future imports:

    import {
      assertLightweightPublicEvidencePrivacy,
      type LightweightPublicEvidence,
    } from "../belief/lightweightPublicEvidence";
    import type { HandPlan } from "../contracts";

The AST test requires exactly these two module specifiers; assertLightweightPublicEvidencePrivacy is the only runtime binding, LightweightPublicEvidence is a type binding, and HandPlan is type-only. It rejects default, namespace, side-effect, third-source, dynamic, and CommonJS imports.

The module must not import or read RoomState, hands, partnerHand, opponentsHands, initialHands, deck, hiddenState, particle bank, rollout state, server provider/store identity internals, room.ts, aiDecisionEngine.ts, HandPlanner, or planner modules. The recursive D2b privacy assertion is reused. Output contains only schema, mode, aggregate counts, family labels, stable keys, numeric priority/quota data, and fallback reason; no evidence object, cards, groups, runtime, private state, or action data.

The source test also proves room.ts, aiDecisionEngine.ts, contracts.ts, runtimeContracts.ts, handPlanner.ts, planManager.ts, planSelector.ts, and planEvaluator.ts do not import D2c. A detached test may import the policy directly; this does not authorize a production adapter.

## 12. Failure and fallback behavior

Shadow validation order is fixed:

1. input schemaVersion;
2. evidence structure and D2b privacy;
3. expectedEvidenceSnapshot structure;
4. gameId exact equality;
5. roundIdentity exact equality;
6. handIdentity exact equality;
7. eventIndex exact equality;
8. candidate, family, and quota validation.

Malformed expectedEvidenceSnapshot -> invalid-evidence. Different identity field or evidence.eventIndex older/newer than the expected value -> stale-evidence. Stale means mismatch with the caller-declared decision snapshot, not merely elapsed time. D2c never reads RoomState, current room state, Date.now, or wall-clock time, and never repairs a snapshot.

| Condition | Reason |
|---|---|
| unknown evidence schema | unknown-evidence-schema |
| invalid evidence structure | invalid-evidence |
| privacy assertion failure | privacy-violation |
| malformed snapshot | invalid-evidence |
| identity or eventIndex mismatch | stale-evidence |
| candidate count > 5 | candidate-count-overflow |
| missing/empty stable key | missing-plan-key |
| duplicate stable key | duplicate-plan-key |
| invalid family/protected-group annotation | invalid-family-annotation |
| used metric non-number/non-finite or non-finite derived score | invalid-family-annotation |
| malformed quota configuration | invalid-quota-config |
| allocator postcondition failure | quota-exceeds-budget |
| unknown mode | unknown-mode |

Every failure is disabled, preserves the old AI path, leaves input unchanged, and records one stable reason. It never enters active behavior.

## 13. Proposed file map

| Path | Role |
|---|---|
| src/ai/planning/beliefGuidedPlanPolicy.ts | future pure contracts, snapshot/evidence validation, classification, stable priority, allocator, deep freeze |
| tests/ai/beliefGuidedPlanPolicy.test.ts | future focused RED/GREEN, negative matrix, AST boundary, freeze, permutation, detached shadow |

These are the only future implementation files. No production adapter is included.

## 14. Task-by-task TDD implementation

Every task below has exact files, interfaces, named tests, command, expected result, allowlist, commit subject, and stop condition.

### Task 1: RED characterization

Files: create tests/ai/beliefGuidedPlanPolicy.test.ts only.

Add named tests for:

- zero action-only disabled;
- one candidate without expansion;
- 2–5 candidates;
- six candidates rejected;
- active, urgent-defense, finishability, uncertainty-cover, power-preserving, alternative, other, and multi-family de-duplication;
- complete familyPriority versus positive-only familyQuotas;
- quotaTotal equals family quota sum;
- no candidate annotation quota or selection state;
- candidate permutation and repeated JSON byte stability;
- UTF-16 comparator independent of locale;
- fractional quality with exact formula and six-decimal result;
- unused metric broader domain accepted;
- stale older event index;
- stale newer event index;
- stale identity mismatch;
- malformed expected snapshot;
- zero expansion valid shadow;
- invalid quota configuration;
- disabled no-op and immutable outputs.

The source-boundary test uses the TypeScript AST against the future source path and requires the exact imports in section 4, the sole runtime D2b binding, type bindings, and rejection of default/namespace/side-effect/third-source/dynamic/CommonJS imports. It scans production files for D2c imports.

Command:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected RED: collection fails only because src/ai/planning/beliefGuidedPlanPolicy.ts is absent. No fixture/setup, URL-scheme, or unrelated production failure.

Commit: test: characterize D2c plan priority and quota.
Stop if another file is staged or RED is not module resolution.

### Task 2: Minimal pure D2c policy

Files: create src/ai/planning/beliefGuidedPlanPolicy.ts; modify the focused test only for GREEN assertions.

Implement the exact contracts/imports from section 4; ordered snapshot validation; D2b privacy call; classification; six-field finite validation; fractional formula and roundD2cScore; compareStableText; complete familyPriority; positive-only familyQuotas; Math.floor allocator; recursive deep freeze; and no input references in output.

Do not import AiRuntimeState, PlanSelectionMode, HandPlanner, room, powerGroupPolicy, planner modules, decision engine, or any third source. Do not create a HandPlan, write caller state, or generate action data.

Commands:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
    npx tsc --noEmit --pretty false
    git diff --check

Expected GREEN: all focused tests, TypeScript, and diff-check pass; no skipped/todo/module-resolution/privacy/fixture/action-path failure.

Future commit: feat: derive deterministic D2c shadow priorities.
Stop if import, snapshot, fractional score, quota, freeze, or no-op boundaries are violated.

### Task 3: Boundary, privacy, and malformed-input hardening

Files: modify only the two future allowlisted files.

Named negative matrix:

- unknown evidence schema -> unknown-evidence-schema;
- invalid evidence structure -> invalid-evidence;
- malformed snapshot -> invalid-evidence;
- older/newer event index and identity mismatch -> stale-evidence;
- count 6 -> candidate-count-overflow;
- duplicate/missing key -> duplicate-plan-key/missing-plan-key;
- invalid family/protected group -> invalid-family-annotation;
- non-number/non-finite used metric -> invalid-family-annotation;
- malformed quota -> invalid-quota-config;
- zero budget -> valid shadow with zero quotas;
- allocator postcondition -> quota-exceeds-budget;
- unknown mode -> unknown-mode;
- recursive privacy violation -> privacy-violation.

Each asserts exact reason, disabled result, unchanged input JSON, no candidate object, and no quota on annotations. Add recursive deep-freeze, repeated-call bytes, permutation, complete familyPriority, positive-only quota, and conservation assertions. The authorized fractional values remain accepted and PlanMetrics is not modified.

Commands:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose
    npx vitest run tests/ai/lightweightPublicEvidence.test.ts tests/ai/publicEvent.test.ts tests/ai/publicEventHash.test.ts tests/ai/publicLedger.test.ts tests/ai/publicLedgerDependency.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts tests/ai/publicLedgerTributeReset.test.ts tests/ai/publicLedgerTrickFinish.test.ts tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected: focused D2c and the 12-file D2a/D2b gate pass.
Future commit: test: harden D2c privacy and source boundaries.
Stop on hidden-state input, privacy failure, action-path mutation, or file outside allowlist.

### Task 4: Detached shadow integration characterization

Files: modify tests/ai/beliefGuidedPlanPolicy.test.ts only; no adapter.

Actual contract:

    decideAiAction(
      observation: AiObservation,
      runtime: AiRuntimeState,
      config: AiDecisionConfig,
      invocation: AiDecisionInvocationOptions = {},
    ): AiDecision

AiDecision fields are action, runtime, optional selectedPlan, optional selectedPlanId, score, optional scoreBreakdown, candidateCount, optional consideredActions, elapsedMs, and reasonCodes. Candidate plans are decision.runtime.candidatePlans, and active ID is decision.runtime.activePlanId. Do not invent top-level candidatePlans fields.

The reviewed tests provide spies for selector/evaluator functions in tests/ai/planSelectionMode.test.ts, but no stable reusable spy seam for generateFastHandPlans, HandPlanner, or ensurePlans. Therefore Task 4 uses the AST source boundary, production grep, and decision byte equality; it must not add a production spy seam.

Detached flow:

1. Prepare one observation and two byte-identical cloned AiRuntimeState values with candidatePlans and activePlanId.
2. Call decideAiAction with runtime A and record baseline action bytes, returned runtime bytes, selectedPlanId, candidateCount, candidate order, and input runtime bytes.
3. Wrap baselineDecision.runtime.candidatePlans as D2cPlanCandidate with existing protected-group fixture IDs; use D2b evidence and its expected snapshot.
4. Call deriveD2cPlanPriorityQuota in shadow and retain the result only in the test.
5. Call decideAiAction with identical runtime B.
6. Compare baseline/comparison action bytes, returned runtime bytes, selectedPlanId, candidateCount, reason data, input candidate count/order, and input runtime bytes.
7. Assert D2c result lacks action, legalActions, candidatePlans, selectedPlan, selectedPlanId, runtime, and actionScore.
8. Assert D2c source has no planner/decision-engine import and production path grep has no D2c import.

Named tests:

- emits shadow family and quota diagnostics without changing the existing action;
- preserves candidate order and runtime bytes beside detached shadow output;
- does not increase planner calls when a stable existing spy seam is available;
- disabled mode performs no classification and no decision side effect;
- D2c result has no action-control fields.

Task 4 does not assert that decideAiAction creates public event hash, replay bytes, or room transitions. Task 5 owns public event/ledger/replay regression and frozen evidence.

Command:

    npx vitest run tests/ai/beliefGuidedPlanPolicy.test.ts --exclude ".worktrees/**" --testTimeout=120000 --reporter=verbose

Expected: all detached tests pass; no action/runtime/candidate difference.
Future commit: test: characterize D2c shadow integration boundary.
Stop on any detached difference or production change.

### Task 5: Local non-restricted verification

Files: none.

Run focused D2c tests, the D2a/D2b 12-file regression, TypeScript, build, and npm test only after confirming package.json excludes tests/benchmark/**, tests/simulation/**, and tests/performance/**. Also run git diff --check, frozen fixture/artifact diff, and production action-path scan.

Expected: every permitted gate exits 0 with natural completion, no unhandled rejection, worker crash, forced termination, restricted workload, or worktree side effect. Public event/ledger/replay responsibility is verified here, not claimed by Task 4.

Commit: none.
Stop on any real failure, restricted workload inclusion, artifact change, production D2c import, or dirty worktree.

### Task 6: D2c-active remains prohibited

Files: none.

Active mode is not implemented. Shadow output must not filter/reorder candidates, alter evaluator scores, provide an action prior to D2d, or enter the formal path. Before active authorization, D2d bounded action backend must be complete or separately approved.

Expected: no implementation action.
Commit: none.
Stop if active mode or D2d–D2g work is requested.

## 15. Exact test matrix

| Group | Required assertions |
|---|---|
| cardinality | 0 action-only disabled; 1 no expansion; 2–5 annotated; 6 rejected |
| taxonomy | active; urgent-defense; finishability; power-preserving; uncertainty-cover; alternative; other; multi-family de-duplication |
| priority | urgent-defense; active; public high-value; uncertainty; other; numeric tuple and stable key tie-break |
| fractional quality | authorized fractional values; exact formula; six-decimal rounding; non-number/non-finite rejection; unused metrics not narrowed |
| quota | family/expansion bounds; minimum/maximum; unique owner charging; conservation; positive-only records; zero budget; shortage; remaining allocation |
| determinism | candidate permutation; repeated JSON bytes; UTF-16 comparator; stable insertion order |
| snapshot | malformed ref; older/newer eventIndex; identity mismatch; exact validation order |
| disabled | no classification/privacy call/planner generation; stable reason; no decision side effect |
| malformed | unknown schema; invalid evidence; stale evidence; overflow; duplicate/missing key; invalid family/config; allocator postcondition; unknown mode; privacy |
| immutability | recursive deep freeze and unchanged input JSON |
| source boundary | exact two specifiers; sole runtime D2b binding; type bindings; no default/namespace/side-effect/third/dynamic/CommonJS import; denylist |
| detached shadow | shadow exists; action/runtime/candidate bytes/order unchanged; no action-control fields; no production import; spy only with stable seam |

Every row requires named tests in tests/ai/beliefGuidedPlanPolicy.test.ts.

## 16. Commit boundaries

Future implementation sequence:

1. test: characterize D2c plan priority and quota — test only, RED gate.
2. feat: derive deterministic D2c shadow priorities — policy plus focused tests, GREEN and TypeScript.
3. test: harden D2c privacy and source boundaries — policy/test hardening, focused plus D2a/D2b regression.
4. test: characterize D2c shadow integration boundary — detached test only, no-op gate.
5. docs: resolve D2c plan review findings — this plan-only remediation commit, only this document.

No active integration, D2d reducer, D2e particle, D2f rollout, or D2g treatment/benchmark enters these commits. Each is independently reviewed.

## 17. Allowed and forbidden files

### Future implementation allowlist

    src/ai/planning/beliefGuidedPlanPolicy.ts
    tests/ai/beliefGuidedPlanPolicy.test.ts

### Current remediation allowlist

    docs/superpowers/plans/2026-07-23-d2c-plan-priority-quota-shadow.md

The current remediation modifies only the plan document. It does not create or modify source/test/package files.

### Forbidden

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

No D2c task deletes/modifies existing worktrees or branches, pushes, pulls, fetches, creates a PR, generates fixtures, regenerates artifacts, or registers treatment.

## 18. Verification gates

Every future handoff must show:

1. focused D2c tests with .worktrees/** excluded;
2. D2a/D2b 12-file regression with .worktrees/** excluded;
3. npx tsc --noEmit --pretty false exit 0;
4. npm run build exit 0 and natural completion;
5. npm test only after confirming exclusion of benchmark, simulation, and performance paths;
6. git diff --check exit 0;
7. frozen fixture/artifact diff exit 0;
8. production action-path grep with zero D2c references;
9. source-boundary AST test with exact allowlist/denylist;
10. deep-freeze, input-nonmutation, permutation, fractional-quality, snapshot-staleness, quota-conservation, and detached shadow no-op tests.

Also check git status --short --untracked-files=all and git diff --name-only. No benchmark, simulation, performance, smoke, calibration, treatment, or formal workload is part of this plan.

## 19. Stop conditions

Stop and report if:

- D2c needs hidden/private input, RoomState, any hand, deck, private runtime, particle bank, or rollout state;
- D2c needs unbounded HandPlanner or candidate regeneration;
- shadow changes candidate count/order, legal actions, evaluator score/order, final action, runtime, random seed, public event/hash, replay schema, PublicRoom, or D0 fixture bytes;
- a public event/ledger/replay schema change is needed;
- a D0/D1 fixture/artifact/approval, restricted workload, treatment, D2d, D2e, D2f, or D2g change is needed;
- any Critical or Important finding remains open;
- any source, test, package, fixture, artifact, branch, or worktree changes outside its allowlist;
- candidate count exceeds five, key is missing/duplicated, snapshot is malformed/stale, quota config is invalid, allocator postcondition fails, or privacy scan fails.

## 20. Self-review

The revision was checked against the latest D2 order, D2b contract/privacy assertion, actual HandPlan/PlanMetrics/D1/runtime types, the fractional fixture in tests/ai/planIdentity.test.ts, actual decideAiAction/AiDecision types, room-to-decision path, protected-group policy, D2a/D2b tests, plan manager/selector/evaluator tests, tests/engine/planQuality.test.ts, and tests/game/protectedGroups.test.ts.

Coverage:

- 0/1/2–5 cardinalities: sections 7–8, Task 1, matrix.
- family taxonomy: section 5, Task 1.
- stable priority, UTF-16 ordering, permutation, and fractional quality: section 6, Tasks 1–3.
- complete familyPriority, positive-only familyQuotas, zero budget, conservation, shortage, allocation: section 7, Tasks 1–3.
- disabled/shadow no-op and active prohibition: section 9, Task 4, Task 6.
- runtime/type-only import contract and AST boundary: sections 4/11, Tasks 1–3.
- snapshot order and stale semantics: sections 4/12, Tasks 1/3.
- privacy, deep freeze, malformed matrix: sections 11/12, Task 3.
- actual AiDecision shape and detached boundary: Task 4.
- public event/ledger/replay and frozen artifact responsibility: Task 5.
- local verification and restricted exclusion: Task 5, section 18.

Placeholder scan: every task has exact files, interfaces, named tests, command, expected result, allowlist, commit subject, and stop condition; no unresolved template marker or generic unbound task remains.

Contradiction scan:

- D2b has one runtime named privacy import and type bindings; the plan does not describe all imports as type-only.
- expectedEvidenceSnapshot is explicit and caller-provided.
- D2cPlanAnnotation has no quota; family priority and family quota are separate.
- fractional PlanMetrics values are authorized; only six formula fields require number and finite value; derived quality is rounded to six decimals.
- invalid quota config and allocator postcondition have distinct reasons; zero budget is valid shadow.
- Task 4 uses decision.runtime.candidatePlans and decision.runtime.activePlanId.
- Task 4 proves detached action/runtime/candidate invariants; public event/ledger/replay ownership is Task 5.
- Planner-spy feasibility is resolved: selector/evaluator spies exist, but no stable planner/ensurePlans seam was found; no production seam is added.
- No old particle-first ordering, active mode, D2d reducer, D2e particle, D2f rollout, D2g treatment/benchmark, hidden/private input, production action change, or formal workload is included.

Review result:

    Critical: none
    Important: none
    Minor: none

The five Important findings are closed. The metric-domain blocker is closed because the existing D1 fixture authorizes fractional values and D2c defines deterministic six-decimal derived-score normalization without changing PlanMetrics.

## 21. Final authorization status

This document is plan-only. No D2c implementation, active mode, production shadow adapter, D2d–D2g work, restricted workload, remote operation, or formal workload is authorized.

    D2C_PLAN_REMEDIATED_AWAITING_REVIEW
    D2C_FRACTIONAL_METRIC_DOMAIN_CONFIRMED
    D2C_METRIC_DOMAIN_BLOCKER_CLOSED
    D2C_IMPLEMENTATION_NOT_AUTHORIZED
    D2C_ACTIVE_MODE_NOT_AUTHORIZED
    D2C_PRODUCTION_SHADOW_ADAPTER_NOT_AUTHORIZED
    D2D_TO_D2G_NOT_AUTHORIZED
    RESTRICTED_WORKLOAD_NOT_AUTHORIZED
    D2_REMOTE_OPERATIONS_NOT_AUTHORIZED
    D2_FORMAL_EXECUTION_NOT_AUTHORIZED
    formalExecutionAllowed=false
