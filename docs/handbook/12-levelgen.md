# Level generation — one framework, per-game plugins

How a campaign gets AUTHORED at scale, packaged as the campaign layer of
`@jfun/difficulty` (`generateCampaign` & co) + the gate bundle in
`@jfun/levelcheck` (`runGates`). This is the *why*; the package READMEs are the
*how*. It exists because every game was hand-rolling the same ~400-line
orchestration script (Rattle's gen-campaign.cjs was the template), and the parts
that were genuinely shared — the loop, the bands, the cadence math, the
distribution verdicts — kept drifting apart per game.

## The one principle

**Author levels by INTENT, and let measurement pick the board.** A level is
(tier, objective, difficulty-d, seed). The game's plugin decodes intent into a
spec; the framework scans seeds, measures each candidate on the real engine, and
accepts the first one whose measured difficulty lands in the target band. The
campaign is then verified as a DISTRIBUTION — cadence, per-class means, outliers
— on measured numbers, never on targets.

## What the framework owns vs what the game owns

| Framework (`@jfun/difficulty` campaign layer) | Game (the plugin) |
|---|---|
| the per-level loop, seed scan, accept bands (per beat class, asymmetric — hard-biased) | `adapter` — the GameAdapter over its engine |
| relax escalation (soften until SOMETHING certifies — a full run never aborts) | `buildSpec(n, {relax, seed, beat})` — intent → genome, incl. element-semantic beat hardening |
| beat labels (`makeBeatSchedule`) + cadence verdict (`checkCadence`) | `evaluate` — its measurement pipeline, with its REAL certifier inside |
| distribution verdict (`checkDistribution`), fallback flags, exit 0/1/2 | `guard`, `gates` (levelcheck facts), `finalize`, `fmt`/`wrap` |
| write/splice + splice-seam re-measure + retune queue | content schedules (tiers, densities, hints) |
| pool mode: `sawtoothOrder` proposal + `checkOrder` shipping gate | `scoreOf` + the hand-pinned permutation |
| `sampleAccept` + `loadBearing` skeletons for offline generators | `certify` + `neutralize` (the element transforms) |
| `preflightAdapter`, `timeOptimum` | jitter models, policies, state-hash granularity |

**The winnability certifier is NEVER the framework's.** For bot-WR games the
default pipeline's beam/greedy filters are measurement filters — real
certification stays the game's verify script in test.sh. For everything else the
game's certifier runs INSIDE `evaluate`, so the framework never sees an
uncertified score.

## Scars (why each rule exists)

**A target alone can't harden a level whose physics ceiling sits above it.**
Rattle's first cadence regen shipped a "SUPER HARD" L79 measuring 82% — every
seed was too easy, so the closest-to-target fallback won, silently. Hence: beats
get intrinsically harder SPECS (the plugin bumps the objective/mix from the
`beat` argument), and every fallback accept is FLAGGED (`inBand:false` → exit 2).

**Beat bumps must respect element semantics.** More bombs made a hard level
EASIER (bombs are player power — reduce them on beats); shell×10 moved L39 from
58% to 85% (shells raise par, and the budget washes the difficulty out — hold
them); stones/balloons are genuine constraints — raise those. That knowledge is
game truth, so it lives in `buildSpec`, not the framework.

**Cadence is asserted on MEASURED win-rates, never targets.** The old target
curve produced adjacent hard levels BY DESIGN (measured collisions at L68-69,
L88-90, L98-100); only measurement caught it. `checkCadence`: no two adjacent
levels at/below 0.66, and the level after every super/extreme beat must measure
≥0.72. And because measured WR isn't persisted for untouched levels, a sub-range
splice RE-MEASURES the shipped level at each seam before judging.

**Beats ship at par+slack EXACTLY.** The +2 greedy budget pad (fine for normals)
softened L59 to 73%. Per-class `padCap: 0` for beats; if greedy can't win the
tight budget, reject the SEED, never loosen the budget.

**Never silently widen an accept band.** The escalation ladder for a stubborn
level is: widen its class's scanCap → allow one more relax → adjust the plugin's
beat bump. A band edit is a plan edit — it must be visible in a diff.

**Pool ordering: the framework proposes, a human pins.** Tilt matches its curve
by permuting proven boards, and its saves/tests key off board SOURCE identity —
an auto-applied reorder is a save-migration event (the renumber scar).
`sawtoothOrder` output is printed for hand-pinning; `checkOrder` (min direction
flips, finale-is-max, valid permutation) is the shipping gate either way.

**Offline generators must be committed.** Tilt's W2/W3 board generators lived in
session scratchpads and are LOST — only the pinned output survived. A pinned
CURATED table must name the committed `scripts/dev/gen-*.cjs` that produced it;
`sampleAccept`/`loadBearing` are the skeleton so the next one has a permanent home.

**Preflight the adapter or the numbers are lies.** A snapshot that omits one
mutable field leaks state across search branches (Tilt's hole-filled scar); a
hidden Math.random makes every measured WR unreproducible. `preflightAdapter`
(round-trip, replay-identical, RNG tripwire) runs before every campaign — and
`stateKey` is a coarse DEDUP key, so give the adapter a real `fingerprint` for
teeth (Quarter's fp() doctrine).

**Verify the refactor bit-for-bit, generator vs generator.** The shipped
levels.js drifts with the engine — it is NOT the reference. Rattle's
`gen-dogfood.cjs` runs the original script and the plugin edition side by side,
NOW, and byte-compares serialized levels + decision traces. That is what
"reproduces the shipped campaign" means.

## The four games, honestly

- **Rattle** — the full loop (bot-WR default pipeline). gen-campaign2.cjs is the
  proof: the 440-line original as a ~230-line plugin (most of it content tables
  + verbatim curve closures).
- **Tilt** — `timeOptimum` replaces its local time-min search (measure), pool
  mode validates its pinned sawtooth (ordering); board generation stays its
  continuous certifier's, via `sampleAccept`+`loadBearing` when the next world
  is built.
- **Quarter** — its exhaustive verifier IS its evaluate (proven-min par +
  jittered-replay robustness → null unless certified); the planned seed→carve→
  certify→accept generator is literally `generateCampaign` with that evaluate.
- **Cut** — imperative case-block levels, no genome: honestly served by
  `runGates` (already wired) and `checkOrder` over its band permutation only.
  Inventing a Cut genome to force generation parity would be the contortion the
  framework exists to avoid.
