# Difficulty design — measure, don't guess

The reusable discipline behind Rattle's difficulty, packaged as `@jfun/difficulty`.
This is the *why*; the package README is the *how*.

## The one principle

**Measure difficulty with a bot-solver win-rate, and tune to a curve of that number
— never to a single feel-test.** Run a bot policy N times on the *real* engine; the
fraction that clear ≈ the first-try clear rate. Studios use exactly this as a
pre-launch gauge. A feel-test is one sample from a biased player (usually the
developer, who is far better than the audience).

## Scars (why each rule exists)

**Measure against the ATTENTIVE bot, not the casual one.** Rattle's first pass tuned
to a "casual" bot that ignored the objective and played 20% random. It read ~86% and
we shipped. But a *casual* bot under-models a real player, who reads the goal — the
*attentive* bot (biggest objective-colour cluster, 10% slips) cleared **99%**. The
game was far too easy and the casual number hid it. Qi cleared ~everything to L50.
Fix: tune to the attentive bot; it dropped the campaign to 82% first-try.

**The discrete solver can be a wrong oracle.** A BFS/beam over an idealised move set
is NOT proof a level is winnable in the *continuous* engine a human plays. Tilt
shipped two "discrete-only fictions" in one day (a self-holding plate, an
unpinned-holder race) that the discrete search declared solvable but the physics
never allowed. **Certify in the real engine** (Rattle's beam drives the actual Verlet
sim; Tilt searches real gestures; Quarter's DFS is full-engine settles). This is why
`@jfun/difficulty` does **not** ship a shared certifier — only the search *shape*.

**Efficiency stars need budget headroom, or the grade is a lie.** A solver can never
spend more than the budget, so `used ≤ taps` always. The grade degenerates as the
budget tightens: at `taps === par` both 3★ and PERFECT auto-award on any clear
(Rattle had this on 20 levels); at `taps === par+1` PERFECT is genuine but 3★ is
still automatic (another 25 levels). Rattle's fix was a slack **floor of 1**
(`taps ≥ par+1`) plus PERFECT = `used === par` (not `≤`): that kills the egregious
auto-PERFECT and keeps the slack sawtooth sharp, but **accepts 3★-common on the
tightest levels** as a reward for beating them. Raising the floor to `par+2` makes 3★
a real chase everywhere but *flattens* the slack sawtooth in the back half — so tight
budgets (difficulty) and efficiency stars (need headroom) fundamentally pull against
each other. Decide per game which wins, or grade on leftover-bonus instead of a hidden
par. `curve.gradableBudget(par)` = the budget where all three tiers are reachable.

**"Crack all the crates" has no wasteful move.** An objective you always make
progress toward (clear-all-X, escort-the-duck) can't be hardened by tightening the
budget — there's no move that *wastes* a tap, so fewer taps just means fewer safe
taps, not a harder decision. Rattle's shell tier sat at 100% even at par. Fix: add a
**scarce-colour co-objective** so the player must also clear a starved colour under
the limit — *that's* where a plausible move wastes budget. Difficulty lives wherever
a reasonable move can be wrong.

**Objective SIZE controls certifier SPEED; the WR TARGET controls HARDNESS.** When
sharpening Rattle's flat duck tier, a big objective *did* harden it but made the beam
~40× slower (a full regen crawled). The fix was to keep the objective *light* (fast
beam) and instead push the tier's **target win-rate low** — the seed-search accept
band then rejects easy boards and hunts for hard ones. Two different knobs; don't
conflate them.

**Seed variance is real; reject, don't accept-first.** Taking the first solvable seed
gives a jagged curve (seed-to-seed noise, not designed difficulty). `searchSeed`
measures the win-rate per seed and accepts one in a target *band*, biased to the hard
side — and rejects un-tunable or nightmare seeds. This smoothed Rattle's curve from
jagged 79/38/85/54 to a clean sawtooth.

## The curve shape (cozy / no-IAP default)

Teach ~90% first-try → normal ~72–80% → hard beats ~55–60%, **no sub-45% cliff**
(cliffs exist only to sell boosters, which we don't have). A **sawtooth on a rising
baseline**: each ~10-level block opens with a breather and tightens to a hard beat;
the baseline drifts down across the run. Each element/section *tier* also opens easy
(a breather when the new mechanic lands) and ramps — so two sawtooths overlap. Verify
both after generating: mean win-rate by cycle-position (breather highest, hard-beat
lowest) and by tier (opens high, ends low).

## Levers, cheapest first

1. **Colour/piece-type count** — the sharpest in a collapse game (cluster size scales
   super-linearly as colours drop). Ramp 3→4→5 across the campaign.
2. **Scarce objective colour** (`bias.share`) — forces setup instead of "pop the
   biggest group".
3. **Budget slack over par** — the "fewer taps" lever; a sawtooth, floored so stars
   stay gradable.
4. **Objective size / hazard density** — real, but watch certifier cost.
5. **The target-WR curve itself** — via the accept band, the cheapest way to force
   hardness without touching the board (see the scar above).

## Workflow

1. Author a level by **intent** (tier, objective, difficulty `d ∈ [0,1]`), let the
   physics pick a fair board: `searchSeed` scans seeds → `{seed, par, taps, wr}`.
2. **Certify** every level in the real engine before a human plays it (own certifier).
3. **Report** the curve (`curveReport` / `starReport`); confirm the sawtooth holds.
4. **Splice-regen single tiers** when iterating — regenerate only the changed range
   and rewrite those entries, don't pay for a full campaign regen.
5. Deploy, feel-test, adjust the *curve config* (not individual levels).

## Adopting it in a new game

Write a `GameAdapter` (~40 lines over your engine — see the package README table),
then `beamOptimum` / `measureWR` / `tuneBudget` / `searchSeed` / `curveReport` are all
free. Keep your own certifier. Reference: `apps/rattle/scripts/dev/difficulty-adapter.cjs`
and the `difficulty-dogfood.cjs` that proves the shared harness reproduces the game's
own numbers bit-for-bit.
