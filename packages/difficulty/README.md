# @jfun/difficulty

Difficulty design, packaged. Two layers:

1. **`./curve` — engine-agnostic math** (browser + Node, zero deps): the sawtooth
   win-rate curve, the slack-over-par schedule, and the efficiency-star grade. Any
   game imports this as-is.
2. **`./harness` + `./report` — an adapter-based measure/tune loop** (Node, dev-time):
   measure a level's first-try clear-rate with a bot, search a beam optimum (`par`),
   tune the tap/move budget, and seed-search fair levels — all through a small
   per-game **GameAdapter**.

The **certifier is deliberately NOT shared.** Every game's action space differs
(Rattle pops colour clusters, Quarter is `{L,R}`, Tilt is continuous gestures), and
a discrete solver that's a wrong oracle for the real engine has bitten us twice
(see the handbook). Each game keeps its own certification; it only borrows the
measurement, tuning, and curve math.

## The core idea

Measure difficulty the way studios do pre-launch: **run a bot policy N times on the
real engine; the win-rate ≈ the first-try clear rate.** Tune to a *curve* of that
number, not to a feel. Crucially, measure against an **attentive** bot (reads the
objective, ~10% slips = a real human), not a *casual* one — a casual bot
under-reports and hides that the game is too easy.

## Curve math (any game)

```js
const { makeTargetCurve, makeSlackSchedule, starGrade, gradableBudget, ramp } = require("@jfun/difficulty");

const targetWR = makeTargetCurve({ len: 106 });   // teach ~92% → normal ~76% → hard beats ~58%
const slackFor = makeSlackSchedule({});           // budget over par: breather +3 → hard beat +1, floor 1

targetWR(50);   // 0.74   — the first-try clear rate to aim for at level 50
slackFor(50);   // 1      — give this level par + 1 taps

// grade a clear (used taps vs the bot-optimal par):
starGrade({ used: 7, par: 6, rattled: false });   // { stars: 3, perfect: false }
```

**Star integrity rule (load-bearing, and a genuine tradeoff):** a solver can never
spend more than the budget (`used ≤ taps`), so the grade degenerates as the budget
tightens toward par:

| budget | consequence |
|---|---|
| `taps === par` | 3★ **and** PERFECT auto-award on any clear — broken |
| `taps === par+1` | PERFECT is genuine, but 3★ still auto (with default `three=1`) |
| `taps ≥ par+2` | 3★ is a genuine chase; but the *slack sawtooth flattens* if the floor is raised |
| `taps ≥ gradableBudget(par)` (= `par + two + 1`) | all three tiers reachable |

The default slack floor is `1` — it guarantees PERFECT is never auto-awarded and
keeps the slack sawtooth sharp, at the cost of 3★ being automatic on the tightest
levels (Rattle's accepted tradeoff — a reward for hard beats). If 3★ must carry
skill signal on *every* level, set `makeSlackSchedule({ floor: 2 })` (flatter curve)
or grade on leftover-bonus instead of a hidden par. `gradableBudget(par)` returns the
smallest budget that keeps all three tiers reachable.

## Harness (games with a discrete move set)

Implement a `GameAdapter` over your engine, then the whole level-authoring loop is
the package's:

```js
const D = require("@jfun/difficulty");
const adapter = require("./difficulty-adapter.cjs");   // your ~40 lines (see below)

// par (beam optimum), win-rate, and a fair budget for a candidate spec:
const par  = D.beamOptimum(adapter, spec, { width: 8, maxDepth: 24 });
const wr   = D.measureWR(adapter, spec, "attentive", 150).wr;
const taps = D.tuneBudget(adapter, spec, par, slackFor(n));

// author a level by intent: seed-search a fair board hitting the target curve
const found = D.searchSeed(adapter, seed => buildSpec(seed, n), n, { targetWR, slackFor });
// -> { seed, par, taps, wr, inBand }  (or null if no seed certified)
// inBand === false means it fell back to the closest-to-target board — flag/re-tune it.

// whole-campaign reports (replaces hand-rolled measure/curve/stars scripts):
const { rows } = D.curveReport(adapter, LEVELS, { tierOf });
console.log(D.formatCurve(D.curveReport(adapter, LEVELS)));
D.starReport(adapter, LEVELS);   // { got3, got2, gotPerfect, of }
```

### GameAdapter contract

A plain object. A *move* is any value your adapter understands — the harness never
inspects it.

| member | signature | notes |
|---|---|---|
| `createWorld(spec)` | → world | `spec.seed` is authoritative for spawn |
| `setBudget(spec, n)` | → spec′ | pure clone with tap/move budget = n |
| `listMoves(world)` | → move[] | discrete moves at a **settled** state, incl. any "pass" (rattle/shuffle) |
| `applyMove(world, move)` | → void | spend one budget unit + apply + settle (mutates) |
| `isWin` / `isLose(world)` | → bool | |
| `remaining(world)` | → number | objective heuristic, lower = closer (0 at win) |
| `budgetLeft(world)` | → number | taps/moves left |
| `snapshot(world)` / `restore(world, snap)` | | cheap state capture for search |
| `stateKey(world)` | → string | dedup key for the frontier |
| `policies.greedy` | `(w, moves, rng) → move` | **noiseless** strongest line — the winnability gate |
| `policies.attentive` | `(w, moves, rng) → move` | reads the objective, ~10% slips (the human proxy) |
| `policies.casual?` | `(w, moves, rng) → move` | ignores objective, ~20% random (distracted) |

Rattle's adapter is `apps/rattle/scripts/dev/difficulty-adapter.cjs` (~40 lines).
`apps/rattle/scripts/dev/difficulty-dogfood.cjs` proves the shared harness reproduces
Rattle's original hand-inlined beam + win-rates **bit-for-bit** on all 106 levels.

## Fit

| game | move set | uses the harness? |
|---|---|---|
| Rattle | pop clusters + rattle | **yes** — beam par + measure + tune + seed-search |
| Quarter | `{L, R}` rotations | yes — same shape (see `docs/handbook/09-difficulty.md`) |
| Cut | cut a rope at time t | measure + curve; its own timing certifier |
| Tilt | continuous tilt gesture | **curve math + measureWR only** — keeps its gesture certifier |

All games benefit from the curve math and the methodology. Discrete move-budget
games (Rattle, Quarter) get the whole loop; physics games borrow the measurement.

See `docs/handbook/09-difficulty.md` for the full methodology and the scars behind
these rules.
