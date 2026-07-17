# AI production decision architecture

`decideAiAction` is the only production AI decision implementation. The
production path is:

`room.ts` → `decideAiAction` → `PlanManager` → `HandPlanner` → tactics →
`playRules` / `PowerGroupPolicy`.

`src/game/ai.ts` is a compatibility adapter only. It converts the legacy public
input shape into an `AiObservation`, exposes only the AI hand and public table
state, calls the unified engine once, and converts the result to the old return
shape. It has no scoring, planning, candidate search, protected-group policy,
or fallback implementation.

The prior decision implementation is retained exclusively as the test reference
at `tests/helpers/legacyAiReference.ts`. Production source never imports it and
there is no runtime switch or automatic fallback to it. Shadow tests compare the
reference with the unified engine only from test code.

Diagnostics are opt-in test/benchmark input and are disabled for ordinary room
turns. Use `npm run test:ai-performance` for the isolated performance baseline
and `npm run simulate:ai` for the fixed-seed 100-room simulation.
