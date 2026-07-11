# Design 6 — TUCK: content system for the cloth-drape core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status:** design-only — no prototype yet, but **~60% of the engine already exists**. Cut's Verlet integrator (`apps/cut/web/js/game.js`: particle + constraint relaxation at 1/120) generalizes from a 1D rope chain to a 2D cloth lattice with zero new math; Cut's fairness harness (`apps/cut/scripts/dev/fairness.cjs`) is a certified tap-to-release-at-time oracle that ports near-directly (sever-rope → release-pin, land-probe → coverage-probe). **First deliverable is a kill-gate prototype** (`prototypes/13-tuck.html`): if a 12×16 sheet doesn't drape deliciously in a week, stop.

**Path & ceiling:** hybrid — **~250–350 hand-authored, then 800–1,500 verifier-certified procedural** (the best procedural ratio of the material slate: the action space is *discrete taps on ≤6 discrete pins*, smaller than Slingshaft's 4,800 shots). Judged 24.2/30, top-5 of a 30-idea pool; peak cozy-brand fit.

## Core (one verb, no second control)
One-thumb **TAP a pin to release it**. A cloth sheet (Verlet lattice, 12×16 particles baseline) hangs from 2–6 pins. Each tap unlocks one pin; gravity does everything else — the sheet falls, swings, drapes over geometry, folds, snags, billows. The puzzle = **which pins, in what order, at what moment** (a pin released mid-swing throws the sheet differently than one released at rest). Win = at settle, the level's coverage predicate holds — canonically **"tuck in the sleeping cat: cover ≥N% of the cat, never the candle."**

No drag, no aim, no second control ever. Pins are large (≥44 px), few (≤6), and visually numbered by nothing — the layout IS the puzzle.

**Hook:** *Tuck everyone in.* A warm lamplit house of sleeping pets and unmade beds; every level is one sheet, a few pins, and a creature waiting to be covered. The cat's silhouette fills with gold as coverage rises; hit the threshold and it purrs, curls, and sleeps — a one-glance goal and an audibly cozy win.

**Distinct from Cut (honest adjacency):** same input family (tap-to-release-constraint), radically different medium and predicates. Cut delivers a rigid payload to a basket; Tuck conforms an AREA over/around/through geometry — coverage, containment, reveal, wrap. Zero element-ladder overlap; maximum reuse of the harness investment.

## Why it scales
The verb is a *discrete event on a discrete object* — the smallest action space in the studio, so the verifier can fully enumerate short policies and the star knobs (pin budget / coverage threshold / settle time) are free (Lever 1). Every element is one physics rule the Verlet engine already supports — a mass/friction constant, a constraint-break or re-pin callback, or a static/kinematic body (Lever 3, 2–4 hrs each). Coverage predicates are raster overlap counts — seven objectives on one board are seven 20-line functions (Lever 2). Pin placement × obstacle geometry × target silhouette × sheet size × gravity tilt is a huge, cheaply re-verified permutation space (Lever 5). And cloth is the classic cheap sim **no mobile puzzle game has ever made its core** — the feel moat is wide open.

## Element ladder (introduce one per ~5–8 levels, then remix with all priors; cap NEW at T8)
Each element is ONE physics rule: a material constant, a collision callback, or a static/kinematic body — never a new input.

| Tier | Levels | Element | Rule class | Teaches |
|---|---|---|---|---|
| T0 | 1–8 | sheet + pins + gravity + cat (coverage target) | core | tap releases a pin; order changes the fall; live coverage meter |
| T1 | 9–16 | rod / rail (static round bar the cloth drapes over and slides on) | static body | cloth pivots on geometry; drape one side to reach the other |
| T2 | 17–24 | hook (capture callback: a particle entering its radius re-pins to it) | collision callback | mid-fall re-anchoring — snag as a tool, or a trap to swing past |
| T3 | 25–32 | heavy hem (mass ×4 on tagged edge cells) | material constant | the weighted corner falls first; asymmetric folds; throw distance |
| T4 | 33–42 | draft fan (rect wind zone, seeded on/off phase) + REMIX rod/hook/hem | body + time function | release during gust vs. lull — timing band; first combo band |
| T5 | 43–52 | burr strip (contact callback: touching particles stick — infinite friction) | collision callback | kill the slide; park cloth on a wall; sticky is one-way |
| T6 | 53–64 | weak seam (tagged constraint row breaks at strain > k → sheet tears into two flaps) | constraint callback | one sheet becomes two; snap-load a seam on purpose (drop onto a rod) |
| T7 | 65–76 | candle (contact callback: burns a growing hole — cells removed; open flame is the hard AVOID) | collision callback | danger + holes are tools (a hole lets a peg pass through) |
| T8 | 77–90 | rocking mobile (kinematic anchor bar on a seeded pendulum) | kinematic body | release timing vs. external motion — last NEW element |
| T9 | 91–120+ | gravity tilt / mirror / sheet-size variants (napkin 8×10 → throw 12×16 → bedsheet 16×22) + FULL remix T1–8 | permutation | clothesline-in-the-wind chapters; combinatorial payoff; feeds endless/daily |

## Objective variety (swap the predicate, keep the verb — each is a raster/world-state check at settle)
1. **TUCK / COVER-N%** (baseline) — cloth∧target raster ≥ threshold (60% teach → 80% → 95% star tier).
2. **NEVER-COVER / AVOID** — forbidden zone (candle, food bowl) overlap ≤ ε at settle; with T7 the flame also punishes *during* the fall.
3. **WRAP / CONTAIN** — object silhouette fully covered AND cloth particles present below the object's top on both sides ("wrap the loaf").
4. **CURTAIN / PARTIAL-RELEASE** — end with ≥1 specified pin still attached AND a window region covered — teaches restraint (not every pin should be tapped).
5. **THREAD / DROP-THROUGH** — ≥80% of particles inside a bin region below a gap ("down the laundry chute").
6. **REVEAL** (inverse) — cloth starts draped over a picture; slide it OFF so target overlap ≤ N% AND the cloth lands in the hamper.
7. **DOUBLE-TUCK** (phased) — cover target A, hold 1 s, then the second sheet's pins unlock for target B — gate goal B behind goal A.

## Blocker / modifier catalog
rod/rail · hook · shelf ledge (flat static) · heavy hem · draft fan · ceiling fan (rotational wind, late) · burr strip (sticky) · wax strip (near-zero friction floor/rod variant) · weak seam · pre-cut hole in the sheet (geometry permutation) · candle · rocking mobile · decoy pin (releasing it hurts — the sheet slumps off-target) · second sheet · knobs: pin budget 6→3→1 taps, coverage 60→80→95%, forbidden-zone size, settle-time star (star chase only, never a fail — final 25% only), sheet size, gravity tilt ±15°.

## Meta-progression (client-side, no backend, no gacha/paywall)
1. **3-star per level** — (win) / (win under pin budget) / (win at the tight coverage threshold), every tier verifier-certified achievable.
2. **Quilt collection** — deterministic drop of 1 patch per 3–5 levels, ~60 patches; completing a quilt row unlocks a room theme. (A quilt of cloth patches — the meta IS the medium.)
3. **Cosmetics** (~150+ combos): ~20 procedural sheet patterns (gingham/patchwork/stars, shader-tinted) × 8 room palettes × 6 sleepers (cat/dog/bunny/fox/dragon/gran).
4. Light coin loop (5–15/level, patterns 100–500), optional daily streak. Single `localStorage` save. No energy, no boosters, no IAP at launch.

## Difficulty curve
Sawtooth ordered by verifier tag; teach→test→twist→combine per element over 4–6 levels; never two hard levels back-to-back; breather (2 pins, fat cat, 60% threshold) after each spike; every 10th the band's hardest-solvable, every 20th a chapter finale remixing the band. Floor **60% first-try** (bot-measured, then cohort-validated). Difficulty comes from pin placement, decoy pins, obstacle geometry, and coverage thresholds — **never timers**; settle-time appears only as a 3rd-star chase in the final ~25%.

## Daily & live-ops (no-backend first)
1. **Daily tuck** — `mulberry32` seeded by date picks a template + modifier tuple (gravity tilt, fan phase, heavy-hem swap, one-fewer-pin, mirror); harness-certified before the template enters the daily pool; local best + share-seed.
2. **Weekly re-skin** of an 8–10 level pool via Lever-1 knobs (bedsheet week, one-tap week, windy week) — ~26 events/yr for free.
3. **Laundry line** endless mode: generated sheets on a scrolling line, score attack, reuses the generator.
4. Firebase async once-a-day snapshot leaderboard — deferred. Never real-time MP/guilds.

## Level ceiling (reasoning): ~250–350 hand + 800–1,500 certified, three layers
- **A — hand-authored:** 9 tiers × ~15–20 levels ≈ 150–170 skeletons; pin-permutation + mirror stretches to **250–350** at <1 hr each (candidate estimate confirmed by the Cut math: same authoring cost per level).
- **B — verified procedural:** generator samples pin layouts (grid-snapped, 2–6 pins) × obstacle sets drawn from the unlocked band × ~20 target-silhouette masks × sheet size × objective. Coverage is a demanding predicate, so assume a harsh 60–70% reject rate: ~4,000 candidates → **800–1,500 accepted**, difficulty-tagged and strategy-deduped (reject if the winning policy family matches a kept level on the same obstacle set). A rollout is ~960 steps × ~700 constraints × 4 iterations ≈ milliseconds in Node — a level certifies in ~1 min, a batch overnight.
- **C — permutation:** 3 star tiers × mirror/gravity-tilt × sheet-size variants + daily seeds push perceived content past 2,000.

Hand-authoring alone caps ~250; the certified generator is the only way past — and Tuck's tap-on-discrete-pin action space is *why* certification is cheaper here than for any other core on the slate.

## The verifier (physics-faithful; near-direct port of `apps/cut/scripts/dev/fairness.cjs`)
Same continuous engine the player runs — shared `engine.js` module (browser + Node, the `apps/moraine` pattern), fixed 1/120 step, deterministic. **Never a discrete solver.**

- **Discretized action space:** a policy = release pins (i₁…iₖ) at times (t₁<…<tₖ), times snapped to 0.5 s bins over an 8 s horizon (16 bins), k ≤ pin count ≤ 6.
  - **Full enumeration for k ≤ 2:** Σ C(6,k)·k!·C(16,k) ≈ 3,700 policies — exhaustive.
  - **Guided sampling for k ≥ 3:** 5,000 sampled policies (random order + spaced time bins) + hand-coded bot families (all-at-once, top-down order, alternate-corners, one-side-first, hold-one) + local refinement (±1 bin) of the best 20.
- **Robustness re-runs:** the base sim is deterministic, so seeds perturb the *environment and the human*: 32 seeded variants per winning policy — fan phase offset, gravity ±2%, initial sway impulse, and **±80 ms jitter on every tap time** (human-sloppiness model — kills knife-edge timing levels directly).
- **Accept a level only if:** ≥3 distinct winning policies exist; the best policy wins ≥90% of the 32 perturbed runs; winning coverage clears the threshold by ≥5% margin (no knife-edge predicates); every star tier has ≥1 robust winner; AND no degenerate winner — reject if "release everything at t=0" or any single-tap policy wins a level tagged ≥medium.
- **Watchdogs (port Cut's stuck classes):** settle = total KE < ε AND max particle displacement < 0.5 px over a 60-step window, hard-adjudicated at 10 s; assert "cloth always settles or exits" for every element callback; flag never-settle, escaped-arena, and infinite-snag (hook oscillation) as rejects.
- **Coverage oracle = shared code:** one analytic rasterizer module (`coverage.js`) — each cloth quad split into 2 triangles, scanline-filled into a 64×64 boolean mask against the target-silhouette mask. The SAME module drives the in-game live meter and the Node certifier, so the meter and the verifier can never disagree at the threshold (no canvas anti-aliasing drift, no canvas dependency in Node).
- **Difficulty tag** (for the sawtooth pass): fraction of winning policies (inverted), timing-window width of the best family, pin-budget slack, and coverage margin → easy/medium/hard/boss bands.

## Solo-dev feasibility: HIGH (~60% engine exists; one kill-gate up front)
Reuse map: **Cut's Verlet core** (particle + distance-constraint relaxation, swipe→tap hit-test, snip/settle SFX patterns) → cloth = the same particles in a lattice with structural + shear constraints (12×16 = 192 particles, ~700 constraints, 4 relaxation iterations at 1/120 ≈ 0.3M constraint-solves/s — trivial on any phone, even the 16×22 bedsheet); **`fairness.cjs`** → tap-release certifier + watchdogs port near-verbatim; **moraine** → engine-as-module; **Tilt/Cut Capacitor shells** → iOS wrap. Rendering is procedural: fill quads shaded by constraint strain (compression = crease shadow) — folds read for free.

**Build order:**
1. **Kill-gate prototype** `prototypes/13-tuck.html` (single file, `window.__game` hooks): 12×16 sheet, 4 pins, cat mask, live coverage meter, tap-release, settle-adjudication. One week. **Device feel-test: if draping isn't delicious, stop here.**
2. Extract shared `engine.js` + `coverage.js` (browser + Node).
3. Elements T1→T8 one at a time (2–4 hrs each) + ~15–20 hand levels each, star knobs and objective predicates from day one (Levers 1–3).
4. Port `fairness.cjs` → the certifier above as `scripts/dev/test.sh`; certify the hand campaign; add the sawtooth ordering pass (Levers 4, 8).
5. Generator + batch certification for layer B; daily seed.
6. Capacitor-wrap (clone the Cut shell, team `Y3T546NP6T`). No new tech, no build step, no 3D, **skip self-collision entirely** (z-ordered rendering + crease shading fakes layering; invisible at blanket scale).

## Risks
- **Feel is the whole bet** — a mushy or jittery 12×16 sheet kills the game. That's why the kill-gate prototype is step 1 and only a week; tune iteration count/damping/spacing on device before writing a single level. Feel is unprovable headless — PNG render + device test after every feel change.
- **No self-collision shows** — cloth passing through itself is visible in tight folds. Mitigate with z-ordered quads + strain-shading; accept at blanket scale; never design a level whose solution *requires* reading fold layers.
- **Coverage-threshold ambiguity** — "was that 78% or 80%?" feels unfair. Live gold-fill meter on the silhouette + the verifier's ≥5% margin rule (no knife-edge levels ship) + forgiving teach tiers.
- **Degenerate strategy "tap everything instantly"** — the anti-degenerate reject + pin budgets + decoy pins + CURTAIN/partial-release objectives force real choices.
- **Settle detection on cloth** — micro-jitter can never sleep; KE floor + displacement window + 10 s hard adjudication (Cut's watchdog pattern), asserted per element callback.
- **Adjacency to Cut** — same tap-release family risks brand blur. Keep zero element overlap (this ladder shares nothing with Cut's), a distinct scene language (warm bedroom vs. moonlit rig), and coverage/area predicates only.
- **Element saturation** — cap NEW at T8 (rocking mobile); T9+ is gravity/mirror/size/placement permutation, never element #9.
- **Procedural sameness** — variation must change *strategy* (decoy-pin placement, hook-as-tool vs. hook-as-trap, objective swap), enforced by the strategy-dedupe reject; anchor with the 20–30% handcrafted backbone.
- **Timing-tightness unfairness** — the ±80 ms human-jitter robustness check exists precisely for this; any level that fails it is rejected, not shipped hard.
- **Difficulty-tag accuracy** — bot win-rate may mismatch humans on an area predicate; validate the first two chapters on a small cohort before the big procedural batch.
