# D2a.1 Store Technology Preflight Evidence

**Date:** 2026-07-17
**Scope:** temporary audit only; no production implementation
**Source commit:** 59f7c6ddb7892a4f54aec4e390e5fdad145ad83c
**Final status:** STORE_TECHNOLOGY_NOT_APPROVED
**formalExecutionAllowed:** false

## Environment

- package.json has no engines or packageManager field.
- package-lock.json lockfileVersion 3; CI uses npm ci.
- Local: Windows_NT 10.0.19045, win32 x64, Node v24.15.0, npm 11.12.1.
- Compatibility probe: Node v22.22.2, win32 x64.
- CI: ubuntu-latest, actions/setup-node@v4, node-version 22, npm ci, npm test, npm run build.
- Server: Fastify, TypeScript, npm run api, src/server/dev.ts.
- Browser: Vite, npm run build.
- No Dockerfile, Electron, pkg, nexe or single-file packaging found.
- README documents Windows start scripts; Ubuntu is documented through CI. Other production OS/architectures are not documented.

## Candidate set

node-sqlite3 was removed from the formal candidates due deprecated/unmaintained prebuild-install maintenance posture.

- Candidate A: better-sqlite3 12.11.1.
- Candidate B: node:sqlite.

The npm metadata for better-sqlite3 12.11.1 declares Node 20.x, 22.x, 23.x, 24.x, 25.x and 26.x support.

Official Node documentation records node:sqlite added in Node 22.5.0; Node 22.13 removed the experimental flag but retained experimental stability, and Node 24.15 is release candidate. With CI targeting Node 22 and no narrower package engines, better-sqlite3 is the recommended candidate.

## Temporary installation

Temporary directory was outside the repository. better-sqlite3 12.11.1 installed without package.json or lockfile changes in the repository.

Verbose install/rebuild reported:

- prebuild-install found a cached Windows win32 x64 prebuilt binary;
- better_sqlite3.node unpacked successfully;
- node-gyp was not invoked.

Node 24.15 transaction script verified:

1. open temporary file database;
2. create metadata and allocation tables;
3. BEGIN/COMMIT;
4. UNIQUE idempotency conflict;
5. close;
6. reopen;
7. recover original allocation row;
8. delete database.

Observed UNIQUE error: SQLITE_CONSTRAINT_PRIMARYKEY. Reopened row matched the original descriptor, sequence and game id.

Node 22.22.2 compatibility probe loaded the same better-sqlite3 module and opened an in-memory database successfully.

## Build and browser isolation

npm run build exited 0. The generated browser bundle was scanned for better-sqlite3, node:sqlite and sqlite3; result was zero references.

## Cleanup

Temporary dependency directory and database were deleted. git status remained clean before document edits. package.json, package-lock.json, src, benchmark schemas, approval and artifacts were not modified.

## Remaining blocker

Ubuntu Node 22 native installation and the real production OS/architecture were not available in this Windows environment. Therefore the preflight does not meet the requested APPROVED_FOR_IMPLEMENTATION gate. The decision remains STORE_TECHNOLOGY_NOT_APPROVED until a CI/deployment matrix run proves the native install and server startup.

## Frozen room/idempotency and game-id requirements

- canonical gameId maps to one active transport room per process;
- same key and descriptor returns the same room;
- allocation-success/room-failure and lost-response retries reuse the allocation;
- restart may assign a new transport id but canonical gameId is unchanged;
- bootstrap uses a singleton metadata row, atomic insert/read-back and winner-read on concurrent initialization;
- Idempotency-Key is required, 1–128 allowed ASCII characters, no trim, case-sensitive, 400 for missing/invalid and 409 for same key with a different descriptor;
- key is absent from identity, ledger, replay and PublicRoom;
- game-id bytes are UTF8(D2A-PUBLIC-GAME-ID-V1), NUL, lowercase RFC-4122 UUID, NUL, canonical decimal sequence; SHA-256 lowercase hex;
- fixed vector gameId: 1876686cbc6a0d445682319d421e704aa38440f0b0d772b3dfdd09cbd203a1d5.
---
## Real GitHub Actions gate

- Temporary branch: codex/d2a1-store-preflight.
- Run id: 29521740862.
- Job id: 87700224446.
- Head SHA: 1a5f5f53082862e911d0f0ffe3f905c5298e6cf6.
- Runner: ubuntu-latest; configured Node 22.22.2; natural completion; conclusion success; duration 19 seconds.
- Install, transaction/restart script and artifact upload steps all succeeded.
- Artifact: d2a1-store-preflight-29521740862, id 8384974836, digest sha256:a291ee8433688989d8c58223db4786014fdc88d3061a239089e7dd06bc426b97.
- GitHub API allowed run/job/artifact metadata but returned 403 for logs and 401 for artifact download without repository-admin authentication. Exact install log lines are therefore not independently readable here; prebuilt/node-gyp is not claimed from metadata alone.

## Canonical precision and restart semantics

- gameSequence is bigint internally and canonical decimal string in JSON/review/provenance.
- better-sqlite3 safe-integer reads are mandatory; values around and above 2^53 are test vectors.
- lifecycle states are allocated and room-committed.
- After restart, allocated may retry from its saved descriptor. room-committed without a durable room snapshot returns ROOM_STATE_UNAVAILABLE_AFTER_RESTART and never creates a new initial room with the same gameId.
- replay remains independent of provider/store.
- runtime settings: server-only import, D2A_IDENTITY_STORE_PATH, defaultSafeIntegers, foreign_keys=ON, synchronous=FULL, journal_mode=WAL, busy_timeout=5000 and BEGIN IMMEDIATE.
- Idempotency-Key is required, 1-128 allowed ASCII characters, no trim, case-sensitive; 400 for missing/invalid and 409 for same key with a different descriptor.

## Decision

CI_STORE_COMPATIBILITY_APPROVED is recorded as a sub-result. Because the real production deployment target is not declared, record PRODUCTION_DEPLOYMENT_TARGET_UNRESOLVED and keep the overall status STORE_TECHNOLOGY_NOT_APPROVED. No approval JSON was created.
