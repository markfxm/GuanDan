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
- Decision-level same-state/same-decision/same-candidate pairing is explicit.
- Before first divergence, both selectors consume one immutable decision snapshot from one production `decideAiAction` call; after divergence, each arm re-decides independently.
- Full-game same-seed/deal/seating/rotation/AB-BA pairing is explicit.
- Post-divergence arms independently call production `decideAiAction`.
- Canonical Room/public identity/public ledger are the D2G authority.
- Legacy benchmark Room is compatibility infrastructure, not the D2G authority.
- D0/D1 reuse names seeds, rotations, AB/BA, bootstrap, manifest, replay, provenance, resume, report, and atomic artifacts.
- G1 benchmark treatment execution is isolated from production formal action.
- G1 uses whole-game arms: one baseline game and one treatment game per pair, with all four AI seats using that arm's selector; baseline/treatment are not mixed within one game.
- Each pair has one `pairId` and distinct arm-qualified `gameId`/public-ledger namespaces; `AB`/`BA` is shared paired-slot placement, not a second candidate or seat-policy assignment.
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
| G1-3 Canonical adapter | canonical Room, identity, ledger, D0/D1 task matrix | Paired baseline/treatment games | adapter/pairing/ledger tests | G1-2 |
| G1-4 Statistics/report | paired games and D0/D1 infrastructure | outcome, telemetry, manifest, replay, provenance | report/manifest tests | G1-3 |
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

- identical state, profile, and seed produce identical mapping, ranking, fallback, telemetry, and work-unit count;
- changing only production scores/order changes only the expected mapping/ranking result;
- replay identity includes decision identity and selected candidate identity.
- private own-hand fingerprints and raw candidate/card payloads never enter public projection, replay, or human-readable reports.

### Commands

```powershell
npx vitest run tests/ai/d2g/treatmentSelector.test.ts tests/ai/d2g/treatmentMapping.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/ai/rollout/ranking.test.ts tests/ai/rollout/aggregation.test.ts tests/ai/rollout/evidenceGate.test.ts tests/ai/rollout/failureAtomicity.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

## 6. G1-3 canonical adapter/pairing gates

### Canonical Room and privacy

- every arm uses `createRoom` with `buildPublicGameIdentity` source `benchmark-scenario`;
- every action goes through canonical `playCards`/`passTurn` and ledger validation;
- pending opening tribute/return uses canonical `advanceOpeningTribute` in both arms, with finalized public transfer events and no `decideAiAction` or disagreement count;
- public event and ledger hashes are deterministic;
- observations exclude other seats' hands, initial hands, private runtime, and private plans;
- the acting AI receives only its own hand plus permitted public state;
- physical cards are conserved through plays and transfers.

### Decision-level pairing

- one pre-disagreement pair decision calls production `decideAiAction` exactly once;
- baseline and treatment consume that same immutable `AiDecision.evaluatedCandidates` snapshot;
- treatment does not call `generateActionCandidates` independently;
- telemetry records the same decision identity and candidate-universe hash, plus current/stale state validation;
- telemetry is explicitly nested/qualified by `pairId`, `arm`, and arm-qualified `gameId`, and records the arm-specific pre-action ledger hash;
- one and only one selected action is executed.

### Game-level pairing and divergence

- paired tasks share the same seed, same deal, same rank, same seating, same rotation, same AB/BA allocation, same initial canonical gameplay state, and same profile hash;
- the pair shares a stable `pairId`, while baseline/treatment use distinct arm-qualified public identities, ledger namespaces, game IDs, replay paths, and final-state hashes;
- four rotations and both AB/BA placements exist for each base seed;
- after the first differing action, post-disagreement arms diverge naturally;
- each arm calls production `decideAiAction` on its own current state;
- no post-divergence candidate list is copied between arms.

### Commands

```powershell
npx vitest run tests/benchmark/d2gCanonicalAdapter.test.ts tests/benchmark/d2gPairing.test.ts --exclude "**/.worktrees/**" --reporter=verbose
npx vitest run tests/game/publicEventIdentity.test.ts tests/game/publicEventReplayIdentity.test.ts tests/game/publicEventRoomAdapter.test.ts tests/ai/publicLedgerPrivacy.test.ts tests/ai/publicLedgerReplay.test.ts --exclude "**/.worktrees/**" --reporter=dot
```

## 7. G1-4 outcome/report/provenance gates

### Required outcome fields

Every completed paired unit supports:

- baseline/treatment team win/loss;
- canonical team score/level-step;
- finish order and team finish difference;
- paired outcome and score differences;
- disagreement count/rate and disagreement-subset outcome;
- fallback counts/reasons;
- illegal action, invalid pass, conservation, runtime, crash, and engine errors;
- baseline/treatment latency p50/p95/p99;
- rollout work units, particles, replicates, plies, and profile hash;
- public trace/final-state hashes for both arms;
- pair ID, arm-qualified game IDs, and artifact namespace collision checks;
- source, engine, Room, benchmark, profile, statistics, and replay provenance.

### Manifest/replay rules

- expected IDs derive from matchup, seed, rotation, allocation, config hash, and benchmark version;
- duplicate, missing, unknown, or incomplete IDs are never silently aggregated;
- resume accepts only identical config/profile/provenance/schema and reuses only complete correctness-clean games;
- atomic writers publish game output and manifest together;
- replay validates hash, version, public-only state, and deterministic re-execution;
- failed games remain explicit failures and are not converted into wins/losses.

### Statistics rules

- reuse D0/D1 paired bootstrap and base-seed block unit with an explicit D2G `D2GPairUnit` containing one baseline and one treatment arm record;
- each base-seed block contains eight D2G pair units (four rotations × AB/BA), or sixteen arm-qualified game records; do not feed them into the legacy eight-game validator without the D2G adapter;
- report raw and paired results separately;
- calculate paired deltas treatment minus baseline for the same canonical team slots; missing, failed, incomplete, or correctness-unclean pairs remain unresolved and are never coerced into wins/losses/neutral deltas;
- `D2GPairUnit` top-level identity fields are `pairId`, `baseSeed`, `rank`, `seating`, `rotation`, `allocation`, and `profileHash`, with arm records and arm-qualified IDs nested below;
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

The formal report includes confidence intervals and paired results for team win rate, team score, finish order, all-game outcome, and disagreement subset. `GO` requires correctness-clean execution and credible repeatable positive evidence under frozen analysis. `NO-GO` covers correctness failure or frozen negative evidence. `INCONCLUSIVE` covers correctness-clean but insufficient, neutral, or uncertain evidence.

### Performance and immutability

The report records p50/p95/p99 and work-unit/profile values. The ceiling is the calibration-approved frozen profile, not a Phase 0B number. Once formal execution begins, profile hash, formal seeds, statistics, and report schema cannot change; calibration seeds cannot appear in formal data; failed artifacts cannot be silently replaced under the same identity.

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
