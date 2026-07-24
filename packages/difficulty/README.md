# @jfun/difficulty

Difficulty design, packaged. Three layers:

1. **`./curve` + `./cadence` + `./pool` — engine-agnostic math** (browser + Node,
   zero deps): the sawtooth win-rate curve, the labeled hard-beat cadence, the
   slack-over-par schedule, the efficiency-star grade, and the pool-ordering
   (sawtooth-permutation) checks. Any game imports these as-is.
2. **`./harness` + `./report` — an adapter-based measure/tune loop** (Node, dev-time):
   measure a level's first-try clear-rate with a bot, search a beam optimum (`par`),
   time-search a continuous optimum (`timeOptimum`), tune the tap/move budget, and
   seed-search fair levels — all through a small per-game **GameAdapter**.
3. **`./campaign` — the generation framework** (Node, dev-time): iterate a whole
   campaign by intent, search every level onto the target curve through a per-game
   **plugin**, gate it, and verify the MEASURED difficulty distribution (cadence,
   per-class means, fallbacks) before anything ships. See "Campaign generation".

The **certifier is deliberately NOT shared.** Every game's action space differs
(Rattle pops colour clusters, Quarter is `{L,R}`, Tilt is continuous gestures), and
a discrete solver that's a wrong oracle for the real engine has bitten us twice
(see the handbook). Each game keeps its own certification; it only borrows the
measurement, tuning, and curve math — the generation loop invokes a game's real
certifier through plugin slots (`evaluate`, `certify`) and never implements one.

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

targetWR(54);   // ~0.75  — the first-try clear rate to aim for at level 54
targetWR(50);   // ~0.59  — level 50 sits on the cycle-end hard-beat dip
slackFor(50);   // 1      — give this hard beat par + 1 taps

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

Optional adapter members, load-bearing where present: `isPass(move)` (marks the
rattle/shuffle "pass"), `time(w)`/`activeTime(w)` (continuous games — required by
`timeOptimum`), `fingerprint(w)` (full-state fingerprint for `preflightAdapter`;
`stateKey` is a deliberately-coarse dedup key and can miss a lossy snapshot).

## Campaign generation (the framework)

One plugin per game; the loop, bands, relax escalation, cadence and distribution
verdicts, write/splice, and exit codes are the package's.

```js
const D = require("@jfun/difficulty");

const plugin = {
  adapter,                                   // the GameAdapter above
  buildSpec(n, { relax, seed, beat }) {},    // intent → spec; beat-harden INSIDE
                                             // (element semantics are yours), walk
                                             // back as `relax` climbs
  finalize(n, found, spec, { beat, relax }) {},  // freeze seed/par/budget/labels
  guard(spec) {},                            // optional cheap per-seed gate
  evaluate(spec, n) {},                      // optional: replaces the bot-WR
                                             // default; YOUR certifier runs inside
  gates(level, { pool, n }) {},              // optional: @jfun/levelcheck runGates
  fmt(level) {}, wrap(body) {},              // serialization (for writing)
  file, loadExisting,                        // for the CLI's write/splice modes
};
const plan = {
  len: 106,
  targetWR, slackFor,                        // (n) → value; makers or verbatim closures
  beatFor: D.makeBeatSchedule({ from: 21, slots: [
    { pos: 3, cls: "hard", tgt: 0.65 },
    { pos: 8, cls: "super", tgt: 0.55, everyNth: 3, nthCls: "extreme", nthTgt: 0.45 },
  ], finale: { at: 106, cls: "extreme", tgt: 0.45 } }),
  classes: {                                 // per-class accept bands + scan depth
    normal: { bandLo: 0.12, bandHi: 0.14, scanCap: 30, padCap: 2 },
    super:  { bandLo: 0.22, bandHi: 0.07, scanCap: 60, padCap: 0 },  // beats ship at par+slack EXACTLY
  },
  search: { seedLo: 101, seedHi: 800, maxDepth: 12, nRoll: 60 },
  cadence: { from: 17, adjacentHardMax: 0.66,
             breatherAfter: { classes: ["super", "extreme"], minWR: 0.72 } },
  distribution: { bandLo: 0.22, bandHi: 0.14, classMeanTol: 0.05 },
};

const run = D.generateCampaign(plugin, plan, { lo, hi });   // rows, levels, flags…
process.exit(D.runCampaignCLI(plugin, plan));               // or the standard CLI
```

**Exit codes**: `0` in-band + cadence clean + gates green · `1` generation or
blocking-gate failure, nothing written · `2` WRITTEN but flagged (fallback accept
/ cadence violation / distribution outlier) — the file is usable, the flags are
the retune queue, printed as ready-to-run `splice n n --seedFrom=…` commands.
Escalation for a stubborn level, in order: widen its class's `scanCap` → allow
one more `relax` → adjust the plugin's beat bump. **Never silently widen an
accept band** — band edits are plan edits, visible in a diff.

Verification is on MEASURED scores, never targets (the old target curve produced
adjacent hards BY DESIGN): `checkCadence` (no adjacent hards, a genuine breather
after every super), `checkDistribution` (per-level outliers, per-class means,
relax histogram, fallback list). A sub-range splice re-measures the shipped level
adjacent to each seam so cadence is honest across it.

**Pool-ordering mode** (Tilt/Cut: prove a pool of boards, match the curve by
ORDERING): `orderCampaign(plugin, pool, plan)` validates a hand-pinned
permutation (`plan.order.permutation`) against `checkOrder` (min direction
flips, finale-is-max, permutation validity) — or PROPOSES one via
`sawtoothOrder` for hand-pinning. Never auto-apply a proposal: board identity
stays keyed by source (the Tilt renumber scar).

**Pool-builder primitives** for committed offline generators (a pinned CURATED
table must name the committed `scripts/dev/gen-*.cjs` that produced it —
scratchpad generators get lost): `sampleAccept(propose, accept, {seed,
attempts, stride})` (seeded rejection sampling; `accept` = your real certifier,
"never ship a lie") and `loadBearing(certify, spec, neutralize, {budget,
failFactor})` — solvable WITH the element AND unsolvable (at budget×2) with it
neutralized, else the element is decorative. Both failure verdicts are
budget-relative, never deadness claims (direction rule — exhaustion is not a
proof): "uncertified" means inspect the board, "not-load-bearing" means the
element changed nothing.

`preflightAdapter(adapter, spec)` runs before every campaign: snapshot/restore
round-trip, restored-world-replays-identically, and a Math.random tripwire —
"without it the certification is a lie" (Quarter's engine-tests doctrine).

Dogfood: `apps/rattle/scripts/dev/gen-campaign2.cjs` is the original 440-line
gen-campaign.cjs as a plugin; `gen-dogfood.cjs` proves both generators produce
**byte-identical levels** (generator vs generator, run now — the shipped
levels.js has drifted with the engine and is not the reference).

## Fit

| game | move set | uses the harness? |
|---|---|---|
| Rattle | pop clusters + rattle | **yes** — beam par + measure + tune + seed-search |
| Quarter | `{L, R}` rotations | yes — same shape (see `docs/handbook/09-difficulty.md`) |
| Cut | cut a rope at time t | measure + curve; its own timing certifier |
| Tilt | continuous tilt gesture | **curve math + measureWR only** — keeps its gesture certifier |

All games benefit from the curve math and the methodology. Discrete move-budget
games (Rattle, Quarter) get the whole loop; physics games borrow the measurement.

Difficulty is verification Layer 4; the full four-layer net (certify / fuzz /
dead-state audit / bot-measure) is `docs/handbook/10-verification.md`, with the
Layer-3 solver packaged as `@jfun/statespace` and the Layer-2 fuzz loop as
`t.fuzz` in `@jfun/test-harness`.

See `docs/handbook/09-difficulty.md` for the full methodology and the scars behind
these rules.
