# D2G Treatment / Active Mode Canonical Design

## 1. Status and scope

This is the Phase 0B canonical design for D2G. It freezes the architecture and experimental method for evaluating D2F rollout ranking as a treatment before any production active-selection implementation exists.

Phase 0B is documentation-only. It does not change production AI behavior, the Room formal action path, the rollout kernel, the candidate evaluator, the planner, package metadata, tests, or CI configuration. It does not run a formal benchmark and does not claim that D2F is ready for formal action selection.

The single G1 question is:

> With candidate generation, evaluator, and planner held constant, does D2F rollout ranking produce a repeatable improvement in complete Guandan game outcomes over the current production selection?

G2 is designed here but remains disabled and unimplemented until G1 receives a formal `GO` verdict.

## 2. Current production evidence

The current production action path is established from the current code:

```text
Room.runAiStep
  -> decideAiAction
       -> ensurePlans
       -> production action candidate generation
       -> production candidate evaluation
       -> production candidate sorting
       -> final legality/policy validation
       -> AiDecision.action
  -> Room.playCards / Room.passTurn
  -> applyExecutedAction
  -> Room.aiRuntime / Room.aiPlans
```

The ownership is:

- `src/game/room.ts:runAiStep` owns the production turn boundary. It builds the observation, calls `decideAiAction`, invokes the D2F shadow observer before execution, executes exactly one returned action through `playCards` or `passTurn`, and updates runtime through `applyExecutedAction`.
- `src/ai/aiDecisionEngine.ts:decideAiAction` is the sole production candidate-generation entry. It ensures plans, calls `generateActionCandidates`, evaluates candidates with `evaluateActionCandidate`, sorts them, validates the selected action, and returns `evaluatedCandidates` together with the selected action and runtime.
- The production baseline is the action returned by `decideAiAction` under the existing `keep-current` invocation. D1 dynamic-top-k behavior is not silently substituted for the baseline.
- `AiDecision.evaluatedCandidates` is the canonical candidate universe for a decision. D2G consumes that result and never creates a second candidate generator.
- `Room.playCards` and `Room.passTurn` are the authoritative execution functions. Canonical rooms route through the public-ledger transaction path; legacy benchmark rooms route through the legacy path.
- `applyExecutedAction` receives the actual outcome and updates plan/runtime state. A future selector must never update runtime from a proposed but unexecuted action.

The existing D2F integration preserves this separation. `runD2FShadow` receives `evaluatedCandidates` and the selected action after production decision, builds a public pre-action snapshot, and records evidence. Both D2F request and result contracts keep `formalExecutionAllowed: false`. The shadow recommendation is evidence and does not replace Room execution.

## 3. Canonical architecture

Option A is canonical:

```text
canonical Room
  + public identity
  + public ledger
        |
        v
production decideAiAction
        |
        v
AiDecision.evaluatedCandidates
        |
        +------------------------------+
        |                              |
        v                              v
baseline                         treatment
production selected action       same decision's evaluatedCandidates
                                      |
                                      v
                                 D2F rollout ranking
                                      |
                                      v
                                 mapped treatment candidate
```

Frozen invariants:

1. `decideAiAction` is the only candidate-generation entry.
2. Candidate evaluator and planner are unchanged between baseline and treatment.
3. Rollout ranks only the current production legal evaluated candidates.
4. The rollout top identity maps to one and only one current `evaluatedCandidates` member.
5. The selector choice is the only intended AI-policy variable; candidate generation, evaluator, planner, and legal candidate universe are unchanged.
6. Treatment execution is benchmark-only during G1; it does not use a production active-mode flag.
7. D2F remains detached/shadow evaluation. `RolloutRequest.formalExecutionAllowed` and `RolloutResult.formalExecutionAllowed` remain `false`.

The benchmark adapter may expose a benchmark-only seam around `AiDecision`; it must not turn D2F into a second production decision engine.

## 4. Decision-level pairing and game-level divergence

### 4.1 Decision-level pairing

At one concrete canonical pre-action state, one production decision produces one candidate universe:

```text
same pre-action state
  -> one decideAiAction call
  -> one evaluatedCandidates collection
  -> baseline selected candidate
  -> treatment rollout ranking over that same collection
```

The comparison is between two selectors over the same production-generated candidates, not between candidate generators. Candidate identity, action payload, and baseline score are retained from the decision result. Treatment may not reconstruct an action from an independent card list.

Before execution, treatment validates that its identity is still present in the decision candidate set and is legal for that state. Mapping, evidence, state-identity, or legality failure returns a typed fallback to the saved baseline candidate.

### 4.2 Formal G1 head-to-head game

The primary formal experiment is one canonical Room trajectory containing both partnerships:

- `AB`: canonical Team A is baseline-controlled; canonical Team B is treatment-controlled.
- `BA`: canonical Team A is treatment-controlled; canonical Team B is baseline-controlled.

The assignment uses existing D0/D1 allocation semantics: Team A is seats `0/2` and Team B is seats `1/3`. `AB` and `BA` are strategy-partnership assignment swaps, not arm execution-order tokens. Every head-to-head game starts from the same seed, deal, rank, seating, rotation, initial canonical rules/state, and frozen profile for its matched `(baseSeed, rotation)` swap pair. AB and BA have separate `gameId` values and separate Room trajectories; after their first action difference they naturally evolve independently. No candidate list or action is copied between already-diverged games.

All four seats participate in the same game, but the acting seat's partnership determines which candidate is executed. Pure-policy self-play is outside the Formal G1 primary evidence set.

### 4.3 One decision, one candidate universe, one executed action

For every AI action turn in a head-to-head Room:

```text
current canonical Room state
        |
        v
one decideAiAction call
        |
        v
one AiDecision.evaluatedCandidates collection
        |                         |
        v                         v
baselineCandidateId          treatmentCandidateId
AiDecision.action             D2F rollout ranking over
                              the same evaluatedCandidates
        |                         |
        +------------+------------+
                     v
     execute the candidate for the acting seat's partnership
```

The decision records both counterfactual candidate IDs and agreement/disagreement. Baseline-controlled seats execute `AiDecision.action`. Treatment-controlled seats use D2F ranking over the same current `evaluatedCandidates` and execute the mapped treatment candidate. The Room executes exactly one action. No second `decideAiAction`, evaluator, planner, candidate generator, or candidate reconstruction is allowed for the treatment counterfactual.

After each game diverges from its matched AB/BA game, that Room continues from its own canonical state and calls production `decideAiAction` once for each subsequent acting-seat turn. The two games' candidate lists remain independent after divergence; this is the intended treatment effect, not a pairing failure.

## 5. Canonical benchmark adapter

The D2G authority is a canonical Room created with `createRoom`, `buildPublicGameIdentity`, and the public-ledger lifecycle. `createLegacyBenchmarkRoom` remains available for D0/D1 compatibility and historical comparisons, but is not the D2G production-semantics authority because it omits canonical identity and ledger transitions.

The future adapter will:

1. Derive a stable game ID from benchmark version, matchup, seed, rotation, allocation, and frozen configuration hash, using the existing D0/D1 allocation semantics.
2. Create a deterministic `benchmark-scenario` public identity and canonical Room for one AB or BA head-to-head assignment.
3. Assign Team A/Team B strategy descriptors according to `AB` or `BA`; keep the formal comparison as one mixed-strategy head-to-head Room trajectory.
4. Preserve finalized public events and ledger transitions through play, pass, trick-clear, finish, tribute, and return. When opening tribute/return is pending, the canonical `advanceOpeningTribute` path is used; it is a shared non-candidate Room transition and not a `decideAiAction` call.
5. At every AI action turn, call production `decideAiAction` exactly once for the acting seat and retain its immutable `evaluatedCandidates` collection.
6. Record both baseline and treatment candidate identities from that same decision. Execute `AiDecision.action` for baseline-controlled seats; rank and map the same candidates for treatment-controlled seats.
7. Execute exactly one selected legal action through canonical `playCards` or `passTurn`, then update runtime/plan from the actual result. Tribute/return transitions update the public ledger through their canonical transaction path.
8. Emit public-only replay, trace/final-state hashes, safety counters, counterfactual decision telemetry, and separate deterministic/performance telemetry.

D0/D1 facilities are reused rather than duplicated:

- seeded tasks, seat-local seed derivation, four rotations, and AB/BA placement;
- four rotations and AB/BA assignment swaps per base seed, with base-seed grouping and bootstrap statistics;
- manifests, expected match IDs, replay documents, and public hashes;
- source/engine/Room/profile provenance;
- resumable and atomic artifact writing;
- report rendering and validation.

The adapter may add D2G-specific fields and validation, but may not create a separate statistics or runner framework.

### 5.1 Decision context and stale-state validation

`AiDecision` is not modified in Phase 0B. The benchmark adapter wraps each decision with a design-only `D2GDecisionContext` containing:

```typescript
type D2GDecisionContext = {
  gameId: string;
  decisionIndex: number;
  actingSeat: Seat;
  actingStrategy: "baseline" | "treatment";
  preActionGameplayStateHash: string;
  privateOwnHandFingerprint: string;
  candidateUniverseHash: string;
  decisionIdentity: string;
};
```

`preActionGameplayStateHash` is the canonical hash of gameplay state and ledger contents for this Room. `privateOwnHandFingerprint` covers only the acting seat's own hand and is retained for internal current-state validation; it never enters public projection, public events, replay payloads, or human-readable reports. `candidateUniverseHash` is a canonical hash of the ordered current `evaluatedCandidates`, using existing D2F candidate/action identities and action bytes without re-evaluating them. `decisionIdentity` is a versioned canonical hash over game ID, decision index, acting seat, acting strategy, gameplay-state hash, private hand fingerprint, and candidate-universe hash; it is an association token, not a new candidate source.

Before treatment selection or any future active selection, the adapter recomputes the current normalized gameplay-state hash, acting seat/turn, own-hand fingerprint, and candidate-universe hash. Any mismatch is a typed stale-decision fallback; no saved action is executed. Candidate mapping and legality are checked separately against the current `evaluatedCandidates` member. Public arm artifacts retain their own arm-specific public-ledger hash plus opaque provenance/verification results; they never serialize the private fingerprint or raw candidate/card payload.

## 6. Treatment contract and mapping

The future G1 treatment-mapping and G2 selector contracts are conceptually:

```typescript
type D2GDecisionMode = "disabled" | "shadow" | "active";

type D2GFallbackReason =
  | "disabled"
  | "rollout-unusable"
  | "stale-decision"
  | "candidate-mapping-failed"
  | "candidate-no-longer-legal"
  | "rollout-failed"
  | "unexpected-failure";

type D2GDecisionTelemetry = {
  gameId: string;
  rotationPairKey: string;
  allocation: "AB" | "BA";
  actingSeat: Seat;
  actingStrategy: "baseline" | "treatment";
  decisionIdentity: string;
  candidateUniverseHash: string;
  preActionGameplayStateHash: string;
  stateValidation: "current" | "stale";
  baselineCandidateId: string;
  treatmentCandidateId: string;
  selectedCandidateId: string;
  selection: "baseline" | "treatment";
  fallbackReason: D2GFallbackReason | "none";
  disagreement: boolean;
  rankingHash: string;
  rolloutWorkUnits: number;
  elapsedMs: number;
};
```

This mode belongs to the future G2 production selector boundary. G1 benchmark arms use an explicit benchmark treatment selector and never construct, consult, or enable production `active` mode; the default G2 mode remains `disabled`.

The exact implementation source is a G1 task, not a Phase 0B change. It must preserve:

- candidate IDs are canonical action identities already used by D2F;
- each selected ID occurs exactly once in the current evaluated set;
- treatment action is the action object from that current candidate;
- baseline is saved before rollout work;
- all unusable evidence, stale identity, mapping, legality, rollout, and unexpected failures fall back to baseline with typed telemetry;
- the selector/mapping adapter is pure with respect to Room, runtime, ledger, and candidate objects.

## 7. G1 outcomes and attribution

Disagreement is an attribution dimension, not proof of improvement. Formal primary outcomes are normalized to the treatment partnership:

- treatment partnership win rate;
- treatment-minus-baseline team-score delta;
- treatment-minus-baseline level-step delta;
- treatment-minus-baseline finish utility delta;
- AB/BA paired delta and confidence interval;
- disagreement-subset outcome, with disagreement rate remaining descriptive only;
- fallback rates and typed reasons;
- runtime, unhandled exception, illegal-action, invalid-pass, and conservation counters;
- replay, provenance, and manifest failures;
- decision latency p50/p95/p99;
- rollout work units, particle count, replicate count, max plies, and profile values used;
- completed, failed, and incomplete game counts.

For `AB`, treatment is canonical Team B; for `BA`, treatment is canonical Team A. Every quality statistic is transformed to `treatment minus baseline`, so positive means treatment better, zero neutral, and negative means baseline better. Raw canonical Team A/B outcomes remain available for audit but are not the primary improvement estimand. Failed or incomplete games are never silently converted into wins, losses, or neutral results.

## 8. Calibration/formal boundary

Phase 0B freezes method and profile fields, not unsupported numeric values. Particle count, replicate count, max plies, policy evaluations, work units, latency ceiling, evidence minimums, formal sample size, and quality-effect threshold remain profile fields until calibration data exists.

```text
smoke
  -> limited calibration matrix
  -> inspect quality, ESS, coverage, fallback, latency, and work units
  -> select one formal profile
  -> freeze profile, seeds, sample size, statistics, verdict rules, and report schema
  -> formal paired evaluation
```

Calibration and formal seed sets are disjoint. Once formal evaluation starts, profile, seed manifest, source commit, Room rules fingerprint, descriptors, statistics configuration, and report schema are immutable. Formal results cannot be used to tune the profile and then be relabeled as evidence for the tuned profile.

Existing D0/D1 paired bootstrap is the default statistical foundation. The formal game result is one head-to-head record with top-level `(baseSeed, rank, seating, rotation, allocation, profileHash, gameId, treatmentTeam, baselineTeam)` fields. `rotationPairKey = (baseSeed, rotation, rank, seating, profileHash)` groups the AB/BA strategy-swap games for audit; it is not the bootstrap unit. The hierarchy is `base seed -> four rotations -> AB/BA assignment swaps`; each base-seed block contains exactly eight head-to-head games. Bootstrap resamples complete base-seed blocks, preserving all rotation and strategy-swap dependence within a seed. The formal block is therefore defined directly by its eight head-to-head game records.

The report states the treatment perspective transformation, block unit, iteration count, bootstrap seed, confidence intervals, neutral values, and failed/unresolved-game policy. A missing, failed, incomplete, or correctness-unclean game remains explicit in failure/completeness counters and is excluded from quality inference according to the frozen formal policy; it is never coerced into a win, loss, or neutral delta.

## 9. G1 Go / No-Go

### Correctness

Any nonzero value is `NO-GO`:

```text
illegal action = 0
invalid pass = 0
card/state conservation failure = 0
unhandled crash = 0
candidate mapping leading to invalid execution = 0
replay/provenance corruption = 0
```

The gate also requires no hidden-hand leakage, no private data in public projection, no stale identity executing an old action, no duplicate execution, and no runtime/plan state describing a proposed rather than actual action.

### AI quality

The formal report supports exactly one of:

```text
GO
NO-GO
INCONCLUSIVE
```

`GO` requires correctness-clean execution and credible repeatable positive evidence under the frozen paired analysis. A positive point estimate alone is insufficient. `NO-GO` covers correctness failure or frozen evidence of a negative effect. `INCONCLUSIVE` covers correctness-clean but insufficient, neutral, or uncertain evidence. Only `GO` unlocks G2 implementation.

### Performance

Phase 0B requires p50/p95/p99 latency and work-unit/profile telemetry, but invents no millisecond ceiling. Calibration selects the profile and formal evaluation freezes it.

### Deterministic evidence versus performance telemetry

Deterministic evidence includes decision identity, candidate-universe hash, baseline/treatment candidate IDs, ranking, agreement/disagreement, fallback reason, work units, semantic/public outcomes, replay hashes, manifest identity, and provenance. Identical inputs must reproduce these values, excluding wall-clock telemetry.

`elapsedMs`, p50, p95, and p99 are performance observations. They are not required to be byte-identical across runs. `elapsedMs` must not participate in canonical decision identity, candidate-universe/config hashes, replay hashes, deterministic artifact equality, or same-seed determinism assertions. The determinism gate compares semantic/public outcome, selection, ranking, fallback, work units, and replay/provenance hashes while explicitly excluding wall-clock fields.

## 10. G2 boundary, not implementation

After G1 `GO`, G2 introduces an independent formal selector:

```text
D2F detached rollout
        |
        v
D2G treatment evidence
        |
        v
D2G formal selector
        |
        +--> saved baseline candidate
        +--> rollout candidate
        |
        v
canonical Room executes exactly once
```

```typescript
type D2GDecisionMode =
  | "disabled"
  | "shadow"
  | "active";
```

Default mode is `disabled`. Initial active enablement is owned by trusted server/runtime construction configuration; a normal client room request cannot enable it. This is feature/config ownership, not a new permission framework.

The selector chooses rollout only when evidence is usable, decision/current-state identity is current, the candidate exists exactly once in current `evaluatedCandidates`, the candidate remains legal, and active conditions are enabled. Otherwise it returns the saved baseline. The Room executes once, and runtime/plan follows the actual action. A pre-disagreement baseline plan is never reused as if it described an executed treatment action.

D2F request/result `formalExecutionAllowed` remains `false`. Formal authority belongs to the independent D2G selector/Room boundary.

## 11. Fairness and non-goals

Real blockers are hidden-hand cheating, private data in public projection, illegal candidate execution, stale state/candidate execution, ledger/card/state inconsistency, nondeterministic replay, and runtime/plan mismatch.

Hostile Proxy, Symbol injection, getter/accessor traps, prototype tricks, callback escape, and adversarial internal object graphs are non-blocking unless a real untrusted-input production path demonstrates a game-fairness or state-integrity failure.

Phase 0B does not implement G1 or G2, change Room/evaluator/planner/rollout kernel, create a new benchmark/statistics framework, run formal data, invent thresholds, or claim D2F formal readiness.

## 12. Dependency and canonical decisions

```text
G1-1 contracts/profile
  -> G1-2 pure treatment selector
  -> G1-3 canonical head-to-head adapter
  -> G1-4 report/manifest/provenance
  -> G1-5 smoke/calibration
  -> G1-6 formal verdict
  -> only formal GO -> G2
```

| Decision | Frozen result |
| --- | --- |
| Architecture | Option A: canonical Room plus production decision plus same-candidate treatment |
| Candidate source | production `decideAiAction` only |
| Baseline | current production selected action |
| Treatment | D2F ranking mapped to current evaluated candidates |
| Decision pairing | same state, one decision, one candidate collection |
| Formal matchup | direct baseline-vs-treatment head-to-head in one canonical Room |
| AB/BA | Team A/B partnership assignment swap; AB baseline A/treatment B, BA treatment A/baseline B |
| Formal game count | four rotations × AB/BA = eight head-to-head games per base seed |
| Quality sign | treatment-minus-baseline; positive treatment better |
| Post-divergence | AB and BA games evolve independently in their own canonical Rooms |
| Benchmark authority | canonical Room, public identity, public ledger |
| Statistics | reuse D0/D1 paired/replay/manifest/provenance/resume/report facilities |
| Formal active execution | independent D2G selector only after G1 `GO` |
| D2F flags | `formalExecutionAllowed: false` |
