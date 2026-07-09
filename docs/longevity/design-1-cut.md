# Design 1 — CUT: content system for the rope-cutting core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status:** the core is a shipped app at `apps/cut` (bundle `com.jfun.cut`) — a faithful port of the "Night Rig" design handoff (vendored at `apps/cut/design/design_handoff/` = source of truth). The web build exists in `apps/cut/web/js/game.js`. This doc is the **content system to layer on top** so it scales from a handful of levels to a real campaign. Prototype ancestor: `prototypes/10-cut.html`.

**Path & ceiling:** mostly hand-authored (Cut the Rope precedent). **~300–360 levels**, then unbounded via daily seeds. Highest feasibility of the three — the primitives already exist.

## Core (unchanged, do not add a second control)
One verb: **swipe to sever a rope** (balloon-pop reuses the same swipe hit-test); gravity/swing/momentum land a wooden crate in the basket. Win = all 4 crate corners in the basket, at rest, for ~36 steps. New content = new `case i` branches in `buildLevel(i)` over the existing single-file Verlet sim.

**Hook:** *Cut the rope, drop the crate home* — a cozy moonlit workshop where each night a new gadget joins the rig, and everything you've learned returns.

## Element ladder (introduce one per ~5–8 levels, then remix with all priors; cap ~8)
`(S)` = shipped in the current build, `(NEW)` = to build. Each is a single collision/force rule the Verlet engine already supports.

| Tier | Levels | Element | Teaches |
|---|---|---|---|
| T0 | 1–8 (S) | rope + gravity + basket, tip-order, pendulum, bounce pad, pulley | the core cut: which rope, what order, when |
| T1 | 9–12 (S) | balloon (buoyant tethered particle; swipe also POPS it) | lift as the inverse of gravity |
| T2 | 13–15 (S) | moving anchor / trolley (kinematic on a ping-pong rail) | release timing vs. external motion |
| T3 | 16–20 (S) | pulse spikes (periodic lethal-while-extended hazard) | rhythm / safe window |
| T4 | 21–45 (NEW) | elastic + sticky rope *materials* (per-constraint stiffness/damp tag) | rope can launch or brake the crate |
| T5 | 46–75 (NEW) | rotating anchor / sawblade (circular kinematic) | orbital vs. linear motion; spiral release window |
| T6 | 76–110 (NEW) | wind zone (rect adds horizontal force) + magnet (capped inverse-square pull) | applying force without a rope |
| T7 | 111–160 (NEW) | second scored crate (multi-body) + breakable ledge (hit-count) | dependent drop sequencing; consumable geometry — last backbone element |

Each NEW element ≈ 2–4 hrs engine work (a material constant, a collision callback, or a kinematic/static body) + ~15–20 authored levels + verification.

## Objective variety (swap the win-check, keep the verb)
LAND (baseline) · COLLECT-N-STARS (mid-fall) · TWO-CRATE / BOTH-HOME (phased) · ESCORT / KEEP-ABOVE-LINE · AVOID-ZONE · ORDER / HIT-IN-SEQUENCE · DELIVER-TO-SPECIFIC-BASKET. Each is a predicate on world state in `doChecks` (1–3 hrs each). Phased objectives: the star/second goal only appears after the first is met.

## Blocker / modifier catalog
static spike · pulse spike · bounce pad · pulley · balloon · trolley/moving anchor · solid ledge · elastic rope (T4) · sticky/slow rope (T4) · rotating anchor/sawblade (T5) · wind zone (T6) · magnet (T6) · breakable ledge (T7) · star pickup (objective modifier) · no-go zone (objective modifier).

## Meta-progression (client-side, no backend, no gacha/paywall)
1. **Stars** 1–3 per level (loose→tight cut budget + a collectible) → ~900 progress states.
2. **Lantern collection** (~40), deterministic drop 1 per ~3 levels, unlocks a chapter palette.
3. **Cosmetics** (~150 combos: crate / rope / sky re-tints), unlocked every ~15 stars.
4. Optional daily streak. All in `localStorage`.

## Difficulty curve
Sawtooth floored at 60% first-try (measured by the fairness harness). Teach→test→twist→combine per element over 4–6 levels. Never >1 new element per 5–8 levels; never two hard levels back-to-back. Every 10th level locally hardest; every 20th a chapter finale. Difficulty from geometry/collision, not time (time = a 2-star chase, and only in the final ~25%).

## Daily & live-ops (solo-cheap)
1. **No-server daily** — date-PRNG picks a template + a deterministic modifier tuple (gravity ×0.8–1.2, extra star, tighter par, mirror, wind overlay), harness-verified.
2. **Weekly constraint re-skin** of a 5-level pool (~26 events/yr).
3. Firebase async-snapshot leaderboard — deferred.

## Level ceiling (reasoning)
8 elements × ~15–20 authored ≈ ~150 skeletons; remix + geometry/gravity/mirror stretch to **300–360** at <1 hr each (matches Cut the Rope ~380, Where's My Water ~200). Pure hand-authoring realistically caps ~200–250; the rest come from geometry/gravity permutation + daily seeds. Ship in ~15 chapters of 20.

## Solo-dev feasibility: HIGH
Scoped to existing primitives, one file, no build, Capacitor like Tilt/Excavate. **Build order:**
1. Star/lantern/cosmetic params on the 20 shipped levels (Lever 1 + 6 skeleton).
2. Objective predicates in `doChecks` (Lever 2).
3. T4→T7 elements, one at a time, each with ~15–20 levels (Lever 3).
4. Extend `apps/cut/scripts/dev/*` into a fairness harness: run the same continuous sim over 250+ seeded cut-timings per level; ship only if won in ≥2 of K with no exploit; tag difficulty for the sawtooth pass.

## Risks
- **Physics fairness at scale** — same continuous sim, 250+ seeded cut-timings; ship only verified.
- **Element saturation past ~8** — cap the backbone; beyond L160 vary placement/geometry/gravity/objective, not element count.
- **Feel vs. solver** — harness proves math, not fun; feel-test + PNG render every chapter finale on device.
- **Faithfulness drift** — `game.js` is a PORT of the Night Rig handoff; new elements need a ghost-crate cue + snip/pop SFX in the reference art language.
- **Meta over-reach** — hold the line: streaks + deterministic lanterns + cosmetics + async leaderboard only.
- **Daily-seed sameness** — modifiers must change *strategy* (gravity/wind/objective/mirror); anchor with 20–30% handcrafted.
