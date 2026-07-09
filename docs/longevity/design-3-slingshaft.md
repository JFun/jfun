# Design 3 — SLINGSHAFT: content system for the drag-release launch core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status:** **prototype verified working** at `prototypes/12-slingshaft.html` (in-browser: launch → arc → cup-sink works; peg/bumper/ice elements render across 5 levels; softlock-safe; no console errors). Generalizes `prototypes/06-sling.html` (flick-golf) into a full launch engine; borrows peg/bumper collisions from `prototypes/11-drop.html`.

**Path & ceiling:** procedural with a small, easily-verified action space. **~500–800 levels** realistic for a solo dev. The strongest *new* core on content-per-effort — ~70% of the engine already exists on our stack.

## Core (one verb, no second control)
One-thumb **drag-back-and-release launch** of a ball into a bounded 2D physics arena under gravity: pull back → dotted trajectory arc + power color preview → release → the ball flies, ricochets, rolls, and settles. Win = the ball comes to rest IN the goal cup before shots run out. Not terrain golf (06-sling) — a walled arena with discrete obstacles + a goal cup.

**Hook:** *Pull back, let fly — one flick sends a ball ricocheting through hand-tuned and endlessly-generated arenas. Golf-simple, physics-deep.*

**Why it scales best of the three:** the verb is a continuous vector, so constraint-tightening (par / power cap / goal radius) is near-free (Lever 1, the #1 solo lever); elements are a restitution/force constant + a callback (2–4 hrs); arenas are seeded so geometry permutation is free with gravity first-class; and the action space is small and **discretizable** (~120 aim angles × ~40 power steps ≈ 4,800 shots), which makes near-exhaustive rollout verification tractable with the same engine — sidestepping the discrete-solver trap.

## Element ladder (introduce one per ~5–8 levels, then remix; cap NEW at T8)
| Tier | Levels | Element | Teaches |
|---|---|---|---|
| T0 | 1–6 | ball + goal cup + open arena | drag/release; power = pull length, aim = direction |
| T1 | 7–14 | static peg (rigid circle, rest ~0.55) | banking / redirection |
| T2 | 15–22 | bumper (rest ~1.6, floor-kick) | obstacles can ADD energy |
| T3 | 23–30 | ice / low-friction patch (~0.25) | under-power; momentum control |
| T4 | 31–40 | mud / high-friction + REMIX peg/bumper/ice | kill momentum, park on a ledge — first combo band |
| T5 | 41–50 | wind zone (constant horizontal force) | pre-compensate aim |
| T6 | 51–62 | magnet (attractor/repulsor, clamped inverse-distance) | curved, non-ballistic paths; slingshot around |
| T7 | 63–74 | breakable wall/crate (removed after N impacts) | obstacles AS objectives (reuse Drop's crate-hit) |
| T8 | 75–88 | moving/rotating platform (kinematic, seeded phase) | timing — last NEW element |
| T9 | 89–110+ | gravity-angle / gravity-flip zones + FULL remix T1–8 | gravity first-class → combinatorial payoff + endless/daily |

## Objective variety
sink cup (baseline) · collect-N (3 stars via path predicate) · order-hit (lit targets in sequence) · clear-all (Topple-style, targets===0) · avoid-zone (containment fail) · above-line/balance (hold ball.y ~2s) · park-in-bin (which divider region) · phased (goal B gated behind goal A).

## Blocker / modifier catalog
static peg (rest ~0.55) · bumper (rest ~1.6) · ice (friction ~0.3) · mud (friction ~2.5) · wind zone · magnet (k/d² clamped) · breakable wall/crate (hitsToBreak) · moving platform (kinematic seeded phase) · one-way gate · gravity-flip/angle zone · portal pair (teleport preserving speed, late-game) · difficulty knobs: par 5→3→1, power cap, goal radius 50%→20%→5%, collision tolerance, shot timer (final 25% only).

## Meta-progression (solo-cheap, no backend/gacha, cozy-premium)
1. **3-star** (par / under-par / under-par + stars), verifier-certified achievable.
2. **Deterministic album** — 1 card per 3–5 levels, ~60 cards; a set unlocks a theme.
3. **Cosmetics** (~150 combos: ~20 ball skins × 8 arena themes × 6 trails).
4. Light coin loop (5–15/level, skins 100–500), no paywall. Single `save.json`. Defer energy/boosters/IAP.

## Difficulty curve
Sawtooth ordered by verifier tag; teach→test→twist→combine per band; never two hard back-to-back; breather (open terrain, 2-shot, wide cup) after each spike; every 10th/20th a "boss" (hardest solvable combining the band), floored 60% first-try. Spatial/collision difficulty for the first ~75%; shot-timer only in the final ~25%. Par/power/radius per level = free Easy/Normal/Hard.

## Daily & live-ops (no-backend first)
1. **Daily seeded challenge** — `mulberry32` by date, same arena for everyone, verifier guarantees par-solvable, local score compare / share-seed.
2. **Weekly constraint re-skins** of 8–10 arenas (2× gravity / heavier ball / one-shot / stars doubled) via Lever-1 knobs.
3. Endless/roguelite mode reusing Drop's draft loop.
4. Defer leaderboard to a Firebase once-a-day snapshot; never real-time MP/guilds.

## Level ceiling (reasoning): ~500–800, three layers
- **A — hand-authored:** ~110 across 10 tiers (~15–20/element, 3–4 weeks).
- **B — verified procedural:** the tiny action space (~4,800 shots) makes near-exhaustive rollout feasible; ~20% reject rate (500+ seeds); a 2–4 week generator+verifier yields ~400–600 accepted, tagged + de-duped by strategy.
- **C — permutation:** 3-star + gravity/mirror/theme permutation + daily push perceived content past 1,000.

Hand-authoring alone caps ~200–250; the verified generator is the only way past, and the small continuous-but-discretizable action space is *why* the verifier is tractable here (more so than Sort or Cut).

## Solo-dev feasibility: HIGH (strongest; ~70% engine exists)
`06-sling` already ships the fixed-timestep integrator (1/120, dt-clamped), seeded terrain (`genScene`), fly/roll/settle with tunneling guards, dotted-arc predictor, pooled particles, WebAudio, headless `__game`. `11-drop` has peg/bumper collisions + a draft loop. `apps/moraine` proves the shared engine-as-module (browser + Node) pattern. **Build order:**
1. Refactor the launch sim into a shared `engine.js` importable by both the browser game and Node.
2. Add element callbacks one at a time (2–4 hrs each), each with ~15–20 hand levels (Levers 1–3).
3. Build the headless **rollout verifier** over the discretized action space, 500+ seeds, as `scripts/dev/test.sh` (Lever 8).
4. Capacitor-wrap. No new tech, no build, no 3D.

## Risks
- **Physics verification noise** (bounces/magnets/platforms are chaotic) — seed per level (`mulberry32`), 500+ seeds, require goal in ≥2 of K; oracle = the same continuous integrator, never a discrete solver.
- **Procedural sameness** — variation must change *strategy* (element mix/gravity/goal/par); anchor with the ~110-level handcrafted backbone (20–30%).
- **Element saturation ~7–8** — cap NEW at T8 (moving platform); T9+ is gravity/mirror/placement permutation, not element #11.
- **Feel unprovable headless** — feel-test on device + PNG after any UI change; the verifier proves fairness, not fun.
- **Difficulty-tag accuracy** — bot win-rate may mismatch human first-try; validate the curve on a small cohort before a large procedural batch.
- **Roll/rest edge-cases** — new elements (portals/platforms) can re-open tunneling/never-settle; every callback needs a "ball always settles or exits" assertion (the softlock fail-safe already in 12-slingshaft/06-sling).

## Cosmetic note on the current prototype
`12-slingshaft.html` draws a faint fixed horizon line on all levels — harmless, remove or make intentional when productionizing.
