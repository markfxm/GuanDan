# D2G Treatment / Active Mode Test Gate Matrix

## 1. Matrix purpose

This is the canonical verification contract for D2G. It covers the docs-only Phase 0B boundary, the future G1 treatment benchmark, and conditional G2 active selection. It does not authorize implementation or formal benchmark execution during Phase 0B.

The review priority is:

```text
game-rule correctness
> AI decision quality
> fair baseline/treatment experiment
> deterministic replay
> formal action correctness
> regression
> performance
> maintainability
> speculative security hardening
```

## 2. Phase 0B docs-only gate

### Allowed paths

Exactly these three files may change:

```text
docs/superpowers/specs/2026-08-14-d2g-treatment-active-design.md
docs/superpowers/plans/2026-08-14-d2g-implementation-plan.md
docs/superpowers/plans/2026-08-14-d2g-test-gate-matrix.md
```

No production, test, package, lockfile, workflow, artifact, or user file may change.

### Required checks

```powershell
git diff --check
git status --short
git diff --stat
git diff --name-only
```

The changed-path result must contain exactly the three canonical D2G documents. `AGENTS.md` and `PR3_FIX_HANDOFF.md` remain user-owned untracked files and are never staged, committed, moved, deleted, stashed, or cleaned.

### Documentation consistency checks

The independent design reviewer verifies:

- Option A is identical in all three documents.
- `decideAiAction` is the sole candidate source.
- Rollout selection is the only intended AI-policy variable; evaluator, planner, and candidate universe are unchanged.
- Decision-level same-state/same-decision/same-candidate pairing is explicit.
- Each head-to-head game has one canonical Room trajectory; every acting-seat decision consumes one current production `decideAiAction` result and one `evaluatedCandidates` universe.
- Formal AB/BA is a strategy-partnership assignment swap: AB = Team A baseline / Team B treatment; BA = Team A treatment / Team B baseline.
- Full-game head-to-head games share seed/deal/rank/seating/rotation/rules/profile at initialization; after an action differs, AB and BA games re-decide independently on their own states.
- Four rotations × AB/BA produce exactly eight head-to-head games per base seed; the base seed is the statistical block.
- Canonical Room/public identity/public ledger are the D2G authority.
- Legacy benchmark Room is compatibility infrastructure, not the D2G authority.
- D0/D1 reuse names seeds, rotations, AB/BA, bootstrap, manifest, replay, provenance, resume, report, and atomic artifacts.
- G1 benchmark treatment execution is isolated from production formal action.
- Formal G1 directly pits baseline-controlled and treatment-controlled partnerships in one canonical Room; it does not use all-baseline versus all-treatment self-play as primary superiority evidence.
- Each game has one `gameId`; `rotationPairKey` groups the AB/BA strategy-swap games for audit only, not as a second Room trajectory or candidate-sharing mechanism.
- G1 `GO` is the only dependency that unlocks G2 implementation.
- Numeric profile thresholds are not invented in Phase 0B.
- Correctness, quality, performance, privacy, replay, and provenance vocabulary agrees across documents.
- G2 keeps both D2F `RolloutRequest.formalExecutionAllowed` and `RolloutResult.formalExecutionAllowed` flags `false` and is disabled by default.
- No production behavior or benchmark is implemented or executed in Phase 0B.

## 3. Frozen G1 dependency matrix

| Task | Required input | Primary output | Focused gate | Dependency |
| --- | --- | --- | --- | --- |
| G1-1 Contracts/profile | D2F contracts and production decision types | Typed treatment/fallback/profile schema | treatment contract/profile tests | none |
| G1-2 Pure selector | One `AiDecision`, snapshot, decision context, frozen profile | Same-candidate ranking/mapping/fallback | selector/mapping tests | G1-1 |
| G1-3 Canonical adapter | canonical Room, identity, ledger, D0/D1 task matrix | Eight direct head-to-head games per base seed | adapter/assignment/ledger tests | G1-2 |
| G1-4 Statistics/report | head-to-head games and D0/D1 infrastructure | treatment-perspective outcome, telemetry, manifest, replay, provenance | report/manifest tests | G1-3 |
| G1-5 Smoke/calibration | G1-4 runner/report | calibration profile and disjoint formal manifest | runner/calibration tests | G1-4 |
| G1-6 Formal verdict | frozen profile, formal manifest, approval | `GO`, `NO-GO`, or `INCONCLUSIVE` | formal gate/verdict tests | G1-5 |

G2 is conditional on G1-6 `GO`; it is not a parallel branch.

## 4. G1-1 contracts/profile gates

### RED

Tests fail before implementation for unsupported mode/fallback values, missing profile version/config hash, nondeterministic profile serialization, calibration/formal seed overlap, and a candidate outside the decision universe.

### GREEN

The focused suite proves:

- profile and telemetry are canonical-JSON stable;
- profile fields cover particles, replicates, plies, policy evaluations, work units, evidence, and report metadata without requiring unsupported values;
- formal profile identity includes source commit, engine version, Room rules fingerprint, candidate ordering version, and statistics schema;
- D2F request/result formal-execution flags remain `false`.

### Command

```powershell
npx vitest run tests/ai/d2g/treatmentContracts.test.ts tests/ai/d2g/treatmentProfile.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/ai/rollout/contracts.test.ts tests/ai/rollout/ranking.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

## 5. G1-2 selector/mapping gates

### Correctness cases

- baseline is saved before rollout work;
- treatment receives the exact current `evaluatedCandidates` identities and actions;
- unknown ranked ID falls back;
- duplicate candidate identity fails closed to baseline;
- stale decision identity fails closed;
- stale public-ledger hash, acting-seat/turn, own-hand fingerprint, or candidate-universe hash fails closed;
- `D2GDecisionContext` records normalized `preActionGameplayStateHash`, internal own-hand fingerprint, `candidateUniverseHash`, and versioned `decisionIdentity` without exposing private payloads;
- candidate no longer legal fails closed;
- rollout/evidence/coverage/unexpected failure returns no partial treatment action;
- treatment action is taken from the current evaluated candidate object;
- no independent candidate generator, evaluator, or planner path is called;
- no foreign/private card ID enters public evidence or report output.

### Determinism cases

- identical state, profile, and seed produce identical semantic selection, ranking, fallback, deterministic telemetry, and work-unit count;
- changing only production scores/order changes only the expected mapping/ranking result;
- replay identity includes decision identity and selected candidate identity;
- `elapsedMs` is performance telemetry only: it is not required to be byte-identical and is excluded from decision identity, candidate/config hashes, replay hashes, deterministic artifact equality, and same-seed determinism assertions.
- private own-hand fingerprints and raw candidate/card payloads never enter public projection, replay, or human-readable reports.

### Commands

```powershell
npx vitest run tests/ai/d2g/treatmentSelector.test.ts tests/ai/d2g/treatmentMapping.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/ai/rollout/ranking.test.ts tests/ai/rollout/aggregation.test.ts tests/ai/rollout/evidenceGate.test.ts tests/ai/rollout/failureAtomicity.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

## 6. G1-3 canonical adapter/pairing gates

### Canonical Room and privacy

- every head-to-head game uses `createRoom` with `buildPublicGameIdentity` source `benchmark-scenario`;
- every action goes through canonical `playCards`/`passTurn` and ledger validation;
- pending opening tribute/return uses canonical `advanceOpeningTribute`, with finalized public transfer events and no `decideAiAction` or disagreement count;
- public event and ledger hashes are deterministic;
- observations exclude other seats' hands, initial hands, private runtime, and private plans;
- the acting AI receives only its own hand plus permitted public state;
- physical cards are conserved through plays and transfers.

### Decision-level pairing

- each acting-seat decision calls production `decideAiAction` exactly once;
- baseline and treatment candidate IDs are counterfactual views of that same `AiDecision.evaluatedCandidates` snapshot;
- baseline-controlled seats execute `AiDecision.action`; treatment-controlled seats rank and map a candidate from that same current collection;
- treatment does not call `generateActionCandidates` independently;
- telemetry records one decision identity and candidate-universe hash, baseline/treatment candidate IDs, agreement/disagreement, ranking, fallback, and state validation;
- `elapsedMs` is excluded from deterministic telemetry identity and comparison;
- one and only one selected action is executed.

### Game-level pairing and divergence

- each AB/BA matched pair shares the same base seed, deal, rank, seating, rotation, initial canonical rules/state, and frozen profile hash;
- `AB` assigns Team A (seats 0/2) to baseline and Team B (seats 1/3) to treatment; `BA` swaps those strategy-partnership assignments;
- four rotations and both AB/BA placements exist for each base seed;
- this is 4 rotations × AB/BA = 8 head-to-head games per base seed;
- after the first differing action, the AB and BA games diverge naturally and each canonical Room calls production `decideAiAction` on its own current state;
- no post-divergence candidate list or action is copied between games.

### Commands

```powershell
npx vitest run tests/benchmark/d2gCanonicalAdapter.test.ts tests/benchmark/d2gPairing.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

## 7. G1-4 outcome/report/provenance gates

### Required outcome fields

Every completed head-to-head game supports:

- treatment partnership win/loss and treatment-versus-baseline team-score delta;
- treatment-versus-baseline level-step delta;
- treatment-perspective finish utility and finish order;
- AB/BA paired delta and confidence interval inputs;
- disagreement count/rate and disagreement-subset outcome;
- fallback counts/reasons;
- illegal action, invalid pass, conservation, runtime, crash, and engine errors;
- latency p50/p95/p99 as performance observations;
- rollout work units, particles, replicates, plies, and profile hash;
- public trace/final-state hash, game identity, and `rotationPairKey`;
- source, engine, Room, benchmark, profile, statistics, and replay provenance.

All quality outcomes are normalized to the treatment perspective: positive means treatment is better, zero is neutral, and negative means baseline is better. Raw canonical Team A/Team B values remain audit fields only because the treatment team changes between AB and BA.

### Manifest/replay rules

- expected game IDs derive from matchup, base seed, rotation, allocation, config hash, and benchmark version;
- duplicate, missing, unknown, or incomplete IDs are never silently aggregated;
- resume accepts only identical config/profile/provenance/schema and reuses only complete correctness-clean games;
- atomic writers publish game output and manifest together;
- replay validates hash, version, public-only state, and deterministic re-execution;
- failed games remain explicit failures and are not converted into wins/losses.

### Statistics rules

- reuse D0/D1 paired/bootstrap infrastructure with the base seed as the block unit;
- statistical hierarchy is `base seed -> four rotations -> AB/BA strategy-partnership assignment swaps`;
- each base-seed block contains exactly eight D2G head-to-head games: four rotations × AB/BA;
- retain the AB/BA games within a base-seed block so strategy-swap and rotation dependence is preserved; do not create a new bootstrap algorithm;
- calculate all formal quality deltas as treatment minus baseline; positive means treatment better, zero neutral, negative baseline better;
- missing, failed, incomplete, or correctness-unclean games remain unresolved and are never coerced into wins/losses/neutral deltas;
- state interval method, iterations, bootstrap seed, neutral values, and unresolved-game policy;
- disagreement rate is descriptive only;
- point estimates do not automatically produce `GO`.

### Commands

```powershell
npx vitest run tests/benchmark/d2gReportModel.test.ts tests/benchmark/d2gManifest.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/benchmark/reporting.test.ts tests/benchmark/statistics.test.ts tests/benchmark/reproducibility.test.ts tests/benchmark/d1Resume.test.ts tests/benchmark/d1ProvenancePersistence.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

## 8. G1-5 smoke/calibration gates

### Smoke

Smoke uses a small explicit matrix and proves canonical Room completion or typed failure, zero illegal/invalid/conservation/crash/mapping errors, deterministic public hashes, treatment telemetry including fallback, and a non-formal artifact label.

### Calibration

Calibration may compare a limited profile matrix and reports outcome deltas, ESS, accepted-scenario coverage, fallback/error rates, latency p50/p95/p99, work units, particles, replicates, plies, policy evaluations, and replay/provenance/manifest correctness.

Calibration is not formal evidence and uses seeds disjoint from the formal set. It selects one profile only after review and does not invent a hard threshold before data exists.

### Commands

```powershell
npx vitest run tests/benchmark/d2gRunner.test.ts tests/benchmark/d2gCalibration.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/benchmark/workerStartupFailure.test.ts tests/benchmark/workerCleanup.test.ts tests/benchmark/d1AtomicWriter.test.ts tests/benchmark/d1Resume.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

## 9. G1-6 formal verdict gates

### Correctness verdict

These counters must all be zero:

```text
illegal action
invalid pass
card/state conservation failure
unhandled crash
candidate mapping leading to invalid execution
replay/provenance corruption
hidden-hand/public-projection leak
stale candidate/state execution
duplicate action execution
runtime/plan actual-action mismatch
```

Any nonzero value is `NO-GO`.

### Quality verdict

The formal report includes confidence intervals and head-to-head results for treatment partnership win rate, treatment-minus-baseline team-score delta, treatment-minus-baseline level-step delta, treatment-perspective finish utility, AB/BA paired delta, and disagreement-subset outcome. Positive means treatment better, zero neutral, and negative means baseline better; canonical Team A raw win rate is audit-only. `GO` requires correctness-clean execution and credible repeatable positive treatment-perspective evidence under frozen analysis. `NO-GO` covers correctness failure or frozen negative evidence. `INCONCLUSIVE` covers correctness-clean but insufficient, neutral, or uncertain evidence.

### Performance and immutability

The report records p50/p95/p99 and work-unit/profile values. The ceiling is the calibration-approved frozen profile, not a Phase 0B number. `elapsedMs` and its quantiles are observational performance telemetry and need not be byte-identical across runs. They must not participate in decision identity, config/candidate/replay hashes, deterministic artifact equality, or same-seed determinism assertions. Determinism compares semantic/public outcome, selected candidate, ranking, fallback, work units, and replay/provenance hashes while excluding wall-clock fields. Once formal execution begins, profile hash, formal seeds, statistics, and report schema cannot change; calibration seeds cannot appear in formal data; failed artifacts cannot be silently replaced under the same identity.

## 10. G2 conditional matrix

G2 is enabled only by an explicit G1 `GO` artifact and review.

| G2 task | Required tests | Blocking concerns |
| --- | --- | --- |
| Formal selector | disabled, shadow, active, stale evidence, missing/illegal candidate, fallback | current identity, legality, exactly once |
| Mode config | disabled default, trusted construction enablement, client request ignored | ownership, no accidental active default |
| Room integration | baseline/treatment execution, ledger, runtime/plan, privacy, no recursion | actual action truth, no duplicate execution |
| Focused verification | active success/fallback/error/privacy/replay | state contamination, hidden data, stale action |
| Full regression/Node 22/PR | affected shards, build, CI, review | regression, performance, approval |

No G2 test is a Phase 0B command and no G2 production file changes in this phase.

## 11. Review vocabulary and completion

**Blocking** means real illegal action, hidden-information leak, unfair paired setup, candidate mapping error, stale/current-state execution error, state/ledger corruption, nondeterministic replay, unhandled crash, or material regression.

**Important** means missing required outcome/provenance evidence, incomplete phase separation, untestable task boundary, or material unexplained latency/work-unit regression.

**Non-blocking** means speculative hostile-object hardening or cosmetic abstraction without demonstrated production fairness/state-integrity impact.

Phase 0B may report `DESIGN REVIEW: PASS` only when the three docs exist, agree on Option A and all required boundaries, only the three docs changed, `git diff --check` passes, no production/test/package/workflow/user file changed, and an independent review finds no blocking architecture or fairness issue.
