# @jfun/statespace

Verification **Layer 3**, packaged ([docs/handbook/10-verification.md](../../docs/handbook/10-verification.md)):
enumerate a game's reachable state graph, **prove** which states are dead, and audit
that the game **detects** every one — the "silent stuck" class that otherwise only
human play finds (born from Tilt's L37 saga: three silent dead-ends found by hand
in one week; this audit finds them in ~1s per level, before a human ever plays).

Same split as `@jfun/difficulty`: the graph machinery (enumeration, backward
reachability, oracle cross-check, coverage algebra) is the package's; the game
supplies a small **adapter** with its truth (transitions, oracle, detectors).

```js
const { audit } = require("@jfun/statespace");
const r = audit(adapter);
// r.silent.length === 0  →  every provably-dead state signals. Gate your test.sh on it.
```

## Adapter contract

| member | notes |
|---|---|
| `initial()` → state | |
| `moves(state)` → move[] | |
| `apply(state, move)` → state \| null | null = illegal/no-op; must not mutate input. **Match shipped physics** (e.g. Tilt filters colour-infeasible gate crossings — phantom states poison everything) |
| `stateKey(state)` → string | dedup |
| `isGoal(state)` → bool | |
| `oracleWinnable(state)` → bool | *optional* — see the direction rule below |
| `detectors.card(state)` → bool | the game's definitive verdict UI (cell-level mirror) |
| `detectors.offer(state)` → bool | *optional* softer signal (e.g. a restart offer) |

Report: `{ states, goalN, deadN, trueDeadN, fictionN, xchkFail, immCard, immOffer, silent[], state(key) }`.
Fail the suite on `silent.length || xchkFail`.

## The direction rule (why `oracleWinnable` exists)

A cell abstraction of a continuous engine errs **both** ways: its "winnable" has
certified false wins (Tilt, three times), and its "dead" calls states dead that a
player wins by stopping mid-board. So graph-dead is only a *candidate*. The game
supplies an oracle **strictly more permissive than its physics** (fine control:
move anywhere, stop anywhere, ignore simultaneity); only states dead even under
the oracle are truly dead. The audit **cross-checks** the oracle against the graph
(`xchkFail`: graph-winnable states the oracle calls dead = oracle bugs) — this
caught a colour-rule mismatch on day one. Games whose graph **is** the real engine
(Quarter's `{L,R}` full-engine settles) omit the oracle; deadness is exact.

Winnability verdicts stay with each game's own certifier on the real engine —
never promote this solver into that role.

## Fit

| game | adapter shape | oracle needed? |
|---|---|---|
| Tilt | slide model, colour-feasible; scheduler oracle | yes (continuous physics) |
| Quarter | `{L,R}` on the real engine | no — graph = engine |
| Cut | cut-set abstraction over ropes | yes (timing/physics) |
| Rattle | board graph is huge — sample or scope per tier | yes |

Reference adapter: `apps/tilt/scripts/dev/deadend-audit.cjs` (dogfood-proven —
identical output to the pre-extraction hand-inlined audit on all 15 gate levels).
