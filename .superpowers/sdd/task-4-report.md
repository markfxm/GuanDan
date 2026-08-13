# Task 4 report: rotation matrix and real-room simulation

## Scope

Implemented the benchmark-only rotation and simulator modules. No files under `src/` were changed.

- `tests/benchmark/rotations.ts`: seat permutation, tribute/trick/history/settlement reference remapping, and stable eight-game AB/BA matrix construction.
- `tests/benchmark/simulator.ts`: seat-local strategy runtimes, restricted observations, real `playCards`/`passTurn` execution, public hashes, and explicit failure records.
- Focused tests cover matrix cardinality/stability, all-card preservation, state reference remapping, mixed completion, deterministic summaries, and hidden-hand privacy.

## TDD evidence

RED was observed before implementation:

```text
npx vitest run tests/benchmark/rotations.test.ts tests/benchmark/simulator.test.ts
2 failed suites, 0 tests
Failed to resolve import "./rotations" (module did not exist)
```

After the minimal implementation, GREEN was observed:

```text
npx vitest run tests/benchmark/rotations.test.ts tests/benchmark/simulator.test.ts
2 passed files, 5 passed tests
```

## Verification

```text
npx vitest run tests/benchmark
5 passed files, 15 passed tests

npx tsc --noEmit
exit code 0

git diff --check
exit code 0
```

## Notes / concerns

- The simulator records an explicit `BENCHMARK_OPENING_TRIBUTE_UNSUPPORTED` failure if a task contains unresolved opening tribute. Task 4's normal matrix creates rooms without pending tribute, while rotation remapping covers tribute references for later replay/rotation tests.
- `teamScore` is a minimal winner indicator (`1` for the settlement winner, `0` for the other team); detailed settlement-derived metrics belong to Task 5.
- Public trace and final-state hashes use SHA-256 over canonical JSON and omit hidden hands, runtime state, diagnostics, and room IDs.

## Review-fix evidence

The follow-up review fixes are included in the working tree:

- `createBenchmarkObservation` now derives all four public hand counts directly from `room.hands[seat].length`.
- Match IDs now canonically include `matchup`, `configHash`, `seed`, `rotation`, and `allocation`.
- Public simulation events now carry direct hand counts and per-event count deltas, current trick state, public tribute/return events, and finish order; hashes use this event basis.
- Strategy lookup/decision, runtime creation, illegal action/engine, and turn-guard failures are recorded with numeric `errorCounters`; no failed action is replaced with pass/fallback.
- Guard exhaustion is only recorded while the room remains playing.

Fresh verification after these fixes:

```text
npx vitest run tests/benchmark/rotations.test.ts tests/benchmark/simulator.test.ts
2 passed files, 6 passed tests

npx tsc --noEmit
exit code 0
```
