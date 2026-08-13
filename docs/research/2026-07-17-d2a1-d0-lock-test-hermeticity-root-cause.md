# D2a.1 Task 2 Ubuntu npm-test second-layer root cause: D0 keep-current lock source-worktree dependency

## Scope

This is an investigation-only record. No production code, Task 2 API code, UI code, benchmark behavior, D0 fixture, D0/D1 artifacts, approval files, test skips, `npm test`, smoke, calibration or formal runs were modified.

`formalExecutionAllowed=false`.

Reviewed commits:

- Task 1 final: `3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34`
- Task 2 original: `7a428ca788bb7911dbd2c2da44deb259cb8e8f2f`
- Task 2 remediation: `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`
- Task 2 corrected review: `7c3e95f`

Latest Ubuntu corrected gate:

- Run: `29579094528`
- Job: `87880242148`
- Artifact: `8406302572`
- Digest: `sha256:ed1f569be33265decb3b30f1f0b4cc0bea496cbc5b6e3b55003407f9dfcd71d0`

## Official npm test contract

At exact commit `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`, `package.json` defines:

```text
vitest run --exclude tests/benchmark/** --exclude tests/simulation/** --exclude tests/performance/** --testTimeout=120000
```

`vite.config.ts` configures Vitest environment, globals and setup files, but does not add benchmark tests dynamically. There is no config-level exclude to compensate for shell expansion.

## Why keepCurrentLock was collected on Ubuntu

Root cause:

```text
UNQUOTED_SHELL_GLOB_EXPANSION
```

On Windows PowerShell, this command:

```text
node -e "console.log(JSON.stringify(process.argv.slice(1)))" -- --exclude tests/benchmark/** --exclude tests/simulation/** --exclude tests/performance/** --testTimeout=120000
```

received:

```json
["--exclude","tests/benchmark/**","--exclude","tests/simulation/**","--exclude","tests/performance/**","--testTimeout=120000"]
```

On Ubuntu bash, diagnostic run `29582263850`, job `87890571667`, showed that quoted patterns remain intact:

```json
["--exclude","tests/benchmark/**","--exclude","tests/simulation/**","--exclude","tests/performance/**","--testTimeout=120000"]
```

The same job showed that the unquoted command expands before Vitest receives it:

```json
["--exclude","tests/benchmark/artifactConsistency.test.ts","tests/benchmark/candidates.test.ts","tests/benchmark/candidates.ts","tests/benchmark/classification.ts","tests/benchmark/cli.test.ts","tests/benchmark/contracts.test.ts","tests/benchmark/contracts.ts","tests/benchmark/d1AtomicWriter.test.ts","tests/benchmark/d1AtomicWriter.ts","tests/benchmark/d1Calibration.test.ts","tests/benchmark/d1Calibration.ts","tests/benchmark/d1CalibrationReadiness.test.ts","tests/benchmark/d1CalibrationReadiness.ts","tests/benchmark/d1CalibrationReview.test.ts","tests/benchmark/d1CliArgs.test.ts","tests/benchmark/d1ConfigHash.test.ts","tests/benchmark/d1Diagnostics.test.ts","tests/benchmark/d1Diagnostics.ts","tests/benchmark/d1DiagnosticsPersistence.test.ts","tests/benchmark/d1DiagnosticsPersistence.ts","tests/benchmark/d1DryRun.test.ts","tests/benchmark/d1ExecutionProvenance.test.ts","tests/benchmark/d1FormalBatchLoop.test.ts","tests/benchmark/d1FormalGate.test.ts","tests/benchmark/d1Manifest.test.ts","tests/benchmark/d1Manifest.ts","tests/benchmark/d1Matrix.test.ts","tests/benchmark/d1Matrix.ts","tests/benchmark/d1Provenance.ts","tests/benchmark/d1ProvenancePersistence.test.ts","tests/benchmark/d1ProvenanceV2.ts","tests/benchmark/d1ReplayValidation.test.ts","tests/benchmark/d1ReplayValidation.ts","tests/benchmark/d1Resume.test.ts","tests/benchmark/d1Runner.test.ts","tests/benchmark/d1Statistics.test.ts","tests/benchmark/d1Statistics.ts","tests/benchmark/d1StrategyRegistry.test.ts","tests/benchmark/d2aPublicLedgerAdapter.test.ts","tests/benchmark/d2aPublicLedgerAdapter.ts","tests/benchmark/keepCurrentLock.test.ts","tests/benchmark/legacyAiReference.ts","tests/benchmark/metrics.ts","tests/benchmark/observation.test.ts","tests/benchmark/observation.ts","tests/benchmark/random.ts","tests/benchmark/reportModel.test.ts","tests/benchmark/reportModel.ts","tests/benchmark/reporting.test.ts","tests/benchmark/reporting.ts","tests/benchmark/reproducibility.test.ts","tests/benchmark/rotations.test.ts","tests/benchmark/rotations.ts","tests/benchmark/simulator.test.ts","tests/benchmark/simulator.ts","tests/benchmark/statistics.test.ts","tests/benchmark/statistics.ts","tests/benchmark/strategies.test.ts","tests/benchmark/strategies.ts","tests/benchmark/worker.ts","tests/benchmark/workerCleanup.test.ts","--exclude","tests/simulation/unifiedAiRoomSimulation.test.ts","tests/simulation/unifiedAiSimulationMetrics.test.ts","--exclude","tests/performance/aiHotPath.test.ts","--testTimeout=120000"]
```

The bash `printf` annotation from the same job showed the exact positional argv shape:

```text
<vitest><run><--exclude><tests/benchmark/artifactConsistency.test.ts>...<tests/benchmark/keepCurrentLock.test.ts>...<--exclude><tests/simulation/unifiedAiRoomSimulation.test.ts><tests/simulation/unifiedAiSimulationMetrics.test.ts><--exclude><tests/performance/aiHotPath.test.ts><--testTimeout=120000>
```

Vitest therefore receives only the first expanded benchmark file as the value for the first `--exclude`; the remaining expanded benchmark files become positional include targets. That is why `tests/benchmark/keepCurrentLock.test.ts` is collected by Ubuntu `npm test`.

## keepCurrentLock contract and data flow

`tests/benchmark/keepCurrentLock.test.ts` is not only checking committed fixture JSON. It has two classes of assertions:

1. Pure committed fixture checks:
   - fixture file path: `tests/ai/fixtures/d0KeepCurrentCases.json`
   - provenance fields: `sourceCommit`, `sourceTag`, `generatorCommit`, `generatorVersion`, `generatorCodeTreeSha256`, `inputSha256`, `outputSha256`
   - adapter/default keep-current alignment against the committed fixture

2. Regeneration/provenance checks that execute the generator:
   - `tsxCli = path.resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs")`
   - `generatorPath = path.resolve(process.cwd(), "scripts/generateD0KeepCurrentFixtures.ts")`
   - `sourceWorktree = path.resolve(process.cwd(), "..", "d0-fixture-ai-benchmark")`
   - `runGenerator(...)` and `expectGeneratorFailure(...)` call `execFileSync(process.execPath, [tsxCli, generatorPath, ...])`

`scripts/generateD0KeepCurrentFixtures.ts` requires `--source-worktree` and validates that worktree by running:

- `git -C <sourceWorktree> rev-parse HEAD`
- `git -C <sourceWorktree> rev-parse refs/tags/ai-benchmark-d0-baseline^{}`
- `git -C <sourceWorktree> status --porcelain -- src`

It then imports the D0 source engine from that source worktree to regenerate expected action/runtime/hash output. This is a source reproducibility test, not just a committed-fixture integrity test.

The D0 fixture JSON is committed and contains:

- `sourceCommit`: `e2a20e18f8e5c0871db38ad69426262e43766ce1`
- `sourceTag`: `ai-benchmark-d0-baseline`
- `generatorCommit`: `1963d7fe9921996b6fba7cbd546346b3f6270cc8`
- `generatorVersion`: `d0-fixture-v1`
- `generatorCodeTreeSha256`: `8e5bbe872c460a7cffc0be6b859e95bc23a4ff63c1ab34cd6622da24e3bae1c3`
- `inputSha256`: `725358f1fc3e3907221128e91015e8f15eded68c5ea790c00bf843604c194906`
- `outputSha256`: `87f62e6ba533a7b0d8d364298085fa8b050291ee450e9e6de160b6a66043e70e`

The source commit is reachable in the local repository (`git cat-file -t e2a20e18f8e5c0871db38ad69426262e43766ce1` returns `commit`), so CI could create a temporary detached worktree if the checkout fetch depth includes that history. The diagnostic workflow used `fetch-depth: 0`; a shallow checkout may not have this commit.

## A/B/C clean checkout results

Commits:

- A: `3cdc8ff470e1f21c041bc08beb39a5d7b64fdb34`
- B: `7a428ca788bb7911dbd2c2da44deb259cb8e8f2f`
- C: `4a6bcfa4394a745f1fb5ba605b5dcdc1d502c0f8`

Windows clean worktrees with fresh `npm ci` and no ignored calibration artifacts:

| Commit | `npm test` | Notes |
|---|---|---|
| A | exit 0; 59 files; 488 tests | PowerShell preserves the `tests/benchmark/**` exclude string, so benchmark tests are not collected. |
| B | exit 0 in prior clean-root investigation and not contradicted here | Same package test command; no Task 2 code path affects glob expansion. |
| C | exit 0; 62 files; 512 tests | PowerShell preserves the exclude string. |

Focused `keepCurrentLock` behavior when a sibling `../d0-fixture-ai-benchmark` exists:

| Commit | Result |
|---|---|
| A | 1 file; 9 tests passed |
| B | 1 file; 9 tests passed |

Focused `keepCurrentLock` behavior in `%TEMP%` clean parent where `../d0-fixture-ai-benchmark` is absent:

| Commit | Result |
|---|---|
| A | 1 file failed; 5 failed, 4 passed; first failure: `fatal: cannot change to '<temp>/d0-fixture-ai-benchmark': No such file or directory` |
| B | 1 file failed; 5 failed, 4 passed; same missing source worktree failure |
| C | 1 file failed; 5 failed, 4 passed; same missing source worktree failure |

Explicit generator check-only without creating source worktree:

```text
npx tsx scripts/generateD0KeepCurrentFixtures.ts --source-worktree <missing>/d0-fixture-ai-benchmark --source-commit e2a20e18f8e5c0871db38ad69426262e43766ce1 --output tests/ai/fixtures/d0KeepCurrentCases.json --generator-version d0-fixture-v1 --check-only
```

Result for A/B/C:

```text
fatal: cannot change to '<missing>/d0-fixture-ai-benchmark': No such file or directory
Command failed: git -C <missing>/d0-fixture-ai-benchmark rev-parse HEAD
```

This behavior predates Task 2.

## Root-cause classification

Primary classification:

```text
MULTIPLE_ROOT_CAUSES
```

Components:

1. `SHELL_GLOB_PLATFORM_BUG`
   - `package.json` uses unquoted glob patterns in `npm test`.
   - Windows PowerShell passes them literally.
   - Ubuntu bash expands them into concrete benchmark file paths.
   - Expanded files become positional Vitest include targets, collecting `tests/benchmark/keepCurrentLock.test.ts`.

2. `PREEXISTING_NON_HERMETIC_D0_LOCK_TEST`
   - `keepCurrentLock.test.ts` assumes a sibling `../d0-fixture-ai-benchmark` source worktree.
   - Clean CI and clean developer checkouts do not have that worktree unless a separate setup step creates it.
   - The failure exists at Task 1 final, before Task 2.

Final status:

```text
D2A1_TASK2_CI_GATE_BLOCKED_BY_PREEXISTING_D0_TEST_INFRASTRUCTURE
```

This is not a Task 2 regression.

## Repair options

### Option A: Fix npm test exclude portability

Change `npm test` so benchmark/simulation/performance globs cannot be expanded by bash before Vitest sees them. Examples include quoting globs in `package.json` or moving excludes into Vitest config.

Tradeoffs:

- Preserves ordinary `npm test` intent across Windows/Linux.
- Makes clean CI behavior match local PowerShell behavior.
- Does not by itself make `keepCurrentLock` hermetic when run directly.
- Low complexity.

### Option B: Make keepCurrentLock hermetic

Before running generator-based checks, create a temporary detached D0 source worktree from the committed `sourceCommit`, run check-only against it, and remove it afterwards.

Tradeoffs:

- Preserves full D0 byte-lock and source reproducibility verification.
- Works in clean CI if the D0 commit is reachable.
- Requires `fetch-depth: 0` or equivalent history availability.
- Adds runtime and cleanup complexity to the focused test.
- Avoids any developer-machine absolute path dependency.

### Option C: Split ordinary committed-fixture checks from regeneration/source reproducibility gate

Keep ordinary `npm test` limited to committed fixture/provenance/hash checks, and move regeneration against D0 source to a dedicated D0 fixture gate that creates the source worktree explicitly.

Tradeoffs:

- Keeps ordinary clean-clone tests lightweight and hermetic.
- Preserves full byte-lock assurance when the dedicated D0 gate is run.
- Requires a clear gate in Task 6/final validation so source reproducibility is not silently dropped.
- More explicit than relying on a hidden sibling worktree.

## Recommendation

Use a combined repair:

1. Apply Option A so `npm test` has identical Windows/Linux collection semantics.
2. Apply Option B or C for D0 fixture reproducibility.

If only one change is made first, Option A is the minimal blocker for Task 2 corrected approval. It fixes the immediate Ubuntu `npm test` contract mismatch without reducing D0 lock coverage. However, before Task 6/final gates, Option B or C is still required because direct `keepCurrentLock` and explicit check-only remain non-hermetic without a D0 source worktree.

Do not delete the D0 lock, do not skip benchmark tests silently, and do not encode a developer-machine absolute path as CI contract.

## Task 2 relevance

The failing Ubuntu path is independent of Task 2 API/shutdown behavior. The same missing-source behavior appears at Task 1 final. The collection of `keepCurrentLock` by Ubuntu `npm test` is caused by shell expansion of an existing package script, not by Task 2 changes.

Task 3 should still remain blocked until the approved gate is repaired and rerun, but the correct blocking label is infrastructure:

```text
D2A1_TASK2_CI_GATE_BLOCKED_BY_PREEXISTING_D0_TEST_INFRASTRUCTURE
```
