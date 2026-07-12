# D0 Task 6 report

## Scope

Implemented benchmark replay/reporting utilities in `tests/benchmark/reporting.ts` and tests in `tests/benchmark/reporting.test.ts`.

- SHA-256 hashes use canonical UTF-8 JSON, recursively stable object keys, sorted card IDs, and stable unordered seat collections.
- Volatile diagnostics (durations, timings, paths, worker IDs, stacks, debug fields) are excluded from public hashes.
- Replays emit the required schema/version/config/descriptor/randomness/hash fields and support `none`, `failures`, and `all` modes (`failures` is the default).
- Normal reports contain compact summaries and relative replay paths, excluding event traces and private/full room state.
- Batch manifests carry expected IDs and per-game hashes; merges reject config/version/descriptor mismatches, duplicate or missing IDs, unexpected IDs, invalid allocations, and incomplete 8-game base-seed blocks.
- Every manifest game and report input is checked against the canonical `configHash(config)` (not merely a mutually consistent supplied hash); simulation and reporting use the same public-event/final-state canonical hash functions, with public final-state fields retained only in simulation inputs (never normal reports/replays).
- Replay, debug, and batch artifact directories remain ignored by the repository policy.

## TDD evidence

RED (before implementation):

```text
npx vitest run tests/benchmark/reporting.test.ts
FAIL — failed to resolve import "./reporting" (feature module absent)
```

GREEN (after implementation):

```text
npx vitest run tests/benchmark/reporting.test.ts
✓ 6 tests
```

## Verification

```text
npx vitest run tests/benchmark/reporting.test.ts
✓ 6 tests

npx vitest run tests/benchmark
✓ 7 files, 31 tests

npx tsc --noEmit
✓ exit code 0

git diff --check
✓ exit code 0
```

## Review notes

No `src` files were changed. Report/replay serializers use explicit whitelists for replay fields and compact-summary filtering for privacy. `mergeBatches` validates each seed as the required four rotations × two allocations before producing stable match-ID ordering.
