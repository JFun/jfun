# 02 — Validation Pipeline

Gaps close fast (Flow Fill went open → occupied in ~1 year). Run a **7–8 week clock
per project** and don't skip a gate — each one kills a bad bet cheaply, before the
expensive next stage.

## The gates (in order)

| Gate | What | Pass bar |
|---|---|---|
| 0. **Concept** | Answer Gate 4 in one sentence ([00](00-strategy.md)) + clean [prior-art audit](04-prior-art-audit.md) | a real spread answer; name cleared |
| 1. **Greybox** | No-build HTML prototype; **bot/solver-validated** | solvable + fun-shaped; bot 10/10 |
| 2. **Fun gate** | ~10-person hands-on test | it's actually fun to a stranger |
| 3. ★ **Distribution gate** | The share card + daily + k-loop exist and a stranger *wants* to share | see [03-distribution](03-distribution.md) |
| 4. **TestFlight** | Real devices, instrumented funnel | **D1 ≥ 35%** |
| 5. **Soft launch** (PH/CA) | Small real market | **D7 ≥ 12%** |
| 6. **Monetize** | Only now | — |

## The distribution gate is the one we keep skipping

Historically projects jumped greybox → fun → ship and **stalled on no loop**. Gate
3 is non-negotiable now: a game does not pass to TestFlight until the daily + share
+ streak loop is real and instrumented. `@studio/growth-loop` exists so this gate
costs a few lines, not a rebuild.

## Determinism + solvability are the engineering contract

- **Greybox must be bot/solver-validated** — never ship an unsolvable instance
  (CLAUDE.md non-negotiable). The BFS solver proves solvable + optimal par.
- **Same seed → identical output**, pinned by a golden test. The daily and share
  loop break the instant two clients disagree. `@studio/web-game-core` (RNG) and
  `@studio/growth-loop` (daily seed) carry this; their goldens are the contract.
- **Self-test before "done"** — `test.sh` after every change; **UI changes need a
  real render**, not just a clean headless launch.

## Instrument from line one

Wire the funnel before launch so day-1 data is actionable:
`install → first-instance start → solve → share → link-open → play-from-link`, plus
D1/D7. `@studio/growth-loop`'s `LoopTrack` bakes the k-funnel in identically across
games — don't hand-roll event names ([03](03-distribution.md)).
