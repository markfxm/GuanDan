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
5. Treatment execution is benchmark-only during G1; it does not use a production active-mode flag.
6. D2F remains detached/shadow evaluation. `RolloutRequest.formalExecutionAllowed` and `RolloutResult.formalExecutionAllowed` remain `false`.

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

### 4.2 Full-game pairing

Each paired baseline/treatment game starts from the same:

- the same seed;
- the same deal;
- the same rank and team mapping;
- the same seating;
- the same rotation and AB/BA placement;
- the same initial canonical Room gameplay state and ledger contents, with identity namespace excluded from gameplay equality;
- benchmark profile and execution provenance.

Identity metadata, arm-qualified `gameId`, ledger namespace, replay path, and artifact IDs are intentionally excluded from the shared gameplay-state equality. They are distinct per arm so public ledgers and replays cannot collide; the shared `pairId` and normalized gameplay-state hash prove that the two games began from the same gameplay inputs and ledger contents.

Before the first action divergence, the adapter creates one immutable production decision snapshot from the shared normalized pre-action state: one `decideAiAction` call, one `AiDecision`, and one `evaluatedCandidates` collection. It clones that decision/runtime boundary for the two arm executions, gives baseline the saved production selection, and gives treatment the rollout-ranked candidate mapped to that same immutable collection. The adapter requires equal normalized gameplay-state hashes and equal candidate-universe hashes before accepting the paired comparison; a mismatch marks the pair unresolved and executes no stale cross-arm action.

Once actions differ, states may and should diverge. Each arm then calls production `decideAiAction` on its own current canonical state and receives its own current `evaluatedCandidates`. A candidate list from an already-diverged arm is never forced onto the other arm. This post-disagreement independent re-decision is the intended treatment effect, not a benchmark failure.

Post-disagreement arms may naturally evolve independently; this is the intended treatment effect, not a pairing failure.

This is the intended treatment effect: initial conditions and decision-level candidate generation are paired, while later trajectories reflect the selected actions.

### 4.3 Arm assignment and AB/BA semantics

G1 uses the approved whole-game arm interpretation:

- Each paired unit contains two independent complete games: one baseline arm and one treatment arm.
- All four AI seats in the baseline arm use the production selected action. All four AI seats in the treatment arm use the rollout-ranked candidate mapped from that arm's current production decision. Baseline and treatment are not mixed between teams inside one arm game.
- `allocation: "AB" | "BA"` is a shared paired-placement token inherited from D0/D1. `AB` places the baseline game in paired slot A and the treatment game in paired slot B; `BA` reverses those arm slots. The token is part of IDs, provenance, deterministic execution order, and reporting, but does not change seat rotation, candidate generation, or which selector the arm uses.
- A base seed therefore yields eight paired units across four rotations and two allocations, with sixteen arm-qualified game records. D0/D1 block/bootstrap machinery is reused with this D2G pair-unit schema; legacy eight-game records are not reinterpreted as D2G paired units.
- Outcome reports retain canonical team labels for each arm. They report baseline and treatment team win rate, team score, finish order, and paired deltas side by side; they do not relabel a winning team as a "treatment team" inside a single game.

Each pair has a stable `pairId`. Each arm has its own arm-qualified `gameId`, public identity, ledger namespace, replay path, and final-state hash. The two arm records share gameplay inputs and public state values, but never reuse one `gameId` or append both ledgers to one event stream. This prevents replay and artifact collisions while preserving the same initial canonical gameplay state.

## 5. Canonical benchmark adapter

The D2G authority is a canonical Room created with `createRoom`, `buildPublicGameIdentity`, and the public-ledger lifecycle. `createLegacyBenchmarkRoom` remains available for D0/D1 compatibility and historical comparisons, but is not the D2G production-semantics authority because it omits canonical identity and ledger transitions.

The future adapter will:

1. Derive a stable match ID from benchmark version, matchup, seed, rotation, allocation, and frozen configuration hash.
2. Create a deterministic `benchmark-scenario` public identity.
3. Create a canonical Room from the seeded deal and identity, with all benchmark seats controlled by the benchmark-only harness.
4. Preserve finalized public events and ledger transitions through play, pass, trick-clear, finish, tribute, and return. When opening tribute/return is pending, both arms use the canonical `advanceOpeningTribute` path with the same deterministic Room rules; this is a shared non-candidate transition, not a D2G disagreement or `decideAiAction` call.
5. At each aligned pre-disagreement AI action turn, call `decideAiAction` exactly once for the pair and share its immutable decision snapshot; after the first action divergence, call it once per arm from that arm's own state. Pending tribute/return transitions are excluded from this count.
6. Give baseline the returned production selection and treatment the same returned candidate collection.
7. Execute one selected legal action through canonical `playCards` or `passTurn`, then update runtime from the actual result. A pending tribute/return transition uses `advanceOpeningTribute` and updates the public ledger through its canonical transaction path.
8. Emit public-only replay, trace/final-state hashes, safety counters, decision telemetry, and performance telemetry.

D0/D1 facilities are reused rather than duplicated:

- seeded tasks, seat-local seed derivation, four rotations, and AB/BA placement;
- paired base-seed grouping and bootstrap statistics;
- manifests, expected match IDs, replay documents, and public hashes;
- source/engine/Room/profile provenance;
- resumable and atomic artifact writing;
- report rendering and validation.

The adapter may add D2G-specific fields and validation, but may not create a separate statistics or runner framework.

### 5.1 Decision context and stale-state validation

`AiDecision` is not modified in Phase 0B. The benchmark adapter wraps each decision with a design-only `D2GDecisionContext` containing:

```typescript
type D2GDecisionContext = {
  pairId: string;
  comparisonScope: "paired-same-decision" | "arm-independent";
  decisionIndex: number;
  actingSeat: Seat;
  preActionGameplayStateHash: string;
  privateOwnHandFingerprint: string;
  candidateUniverseHash: string;
  decisionIdentity: string;
};
```

`preActionGameplayStateHash` is the canonical hash of gameplay state and ledger contents with arm identity namespace removed. `privateOwnHandFingerprint` covers only the acting seat's own hand and is retained for internal current-state validation; it never enters public projection, public events, replay payloads, or human-readable reports. `candidateUniverseHash` is a canonical hash of the ordered current `evaluatedCandidates`, using existing D2F candidate/action identities and action bytes without re-evaluating them. `decisionIdentity` is a versioned canonical hash over pair, comparison scope, decision index, acting seat, normalized gameplay-state hash, private hand fingerprint, and candidate-universe hash; it is an association token, not a new candidate source.

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
  pairId: string;
  arm: "baseline" | "treatment";
  gameId: string;
  decisionIdentity: string;
  candidateUniverseHash: string;
  preActionGameplayStateHash: string;
  preActionArmLedgerHash: string;
  stateValidation: "current" | "stale";
  baselineCandidateId: string;
  selectedCandidateId: string;
  selection: "baseline" | "treatment";
  fallbackReason: D2GFallbackReason | "none";
  disagreement: boolean;
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

Disagreement is an attribution dimension, not proof of improvement. Reports must contain at least:

- team win rate and delta;
- canonical team score/level-step and delta;
- finish-order distribution and paired finish difference;
- paired outcome delta;
- disagreement count/rate and disagreement-subset outcome;
- fallback rates and typed reasons;
- runtime, unhandled exception, illegal-action, invalid-pass, and conservation counters;
- replay, provenance, and manifest failures;
- decision latency p50/p95/p99;
- rollout work units, particle count, replicate count, max plies, and profile values used;
- completed, failed, and incomplete game counts.

Raw game outcomes and paired differences are both retained. Reports distinguish all games, correctness-clean completed games, and disagreement subsets. Failed or incomplete games are never silently converted into wins, losses, or neutral results.

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

Existing D0/D1 paired bootstrap is the default statistical foundation. The D2G report states its block unit, iteration count, bootstrap seed, confidence intervals, neutral values, and failed/unresolved-game policy.

The D2G statistical unit is explicit: one `D2GPairUnit` contains one baseline arm record and one treatment arm record for the same `(baseSeed, rotation, allocation, rank, seating, profileHash)` and the same `pairId`. The primary paired delta is treatment minus baseline for the corresponding canonical team outcome vector; raw arm summaries remain separate. A base-seed block contains its eight pair units (four rotations × AB/BA), so bootstrap resampling occurs at the base-seed block, not at individual decisions or arm records. Any missing, failed, incomplete, or correctness-unclean arm makes its pair unit unresolved for quality inference; it remains in failure/completeness counters and is never coerced into a win, loss, or neutral delta.

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
  -> G1-2 pure treatment evaluator
  -> G1-3 canonical paired adapter
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
| Game pairing | same seed/deal/seating/rotation/AB-BA/initial canonical state |
| Post-divergence | arms evolve independently in their own canonical states |
| Benchmark authority | canonical Room, public identity, public ledger |
| Statistics | reuse D0/D1 paired/replay/manifest/provenance/resume/report facilities |
| Formal active execution | independent D2G selector only after G1 `GO` |
| D2F flags | `formalExecutionAllowed: false` |
