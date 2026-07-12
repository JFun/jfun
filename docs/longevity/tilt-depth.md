# Tilt 1.x depth plan — worlds, elements, wells, and the mastery lap

> Read [`README.md`](README.md) first (the levers this plan applies). Companion to [`design-7-quarter.md`](design-7-quarter.md) — the Quarter split below is a hard rule so the two products never cannibalize.

**Status:** approved direction (2026-07-12, Qi): grow the live Tilt app's longevity with **cheap levers first**. Qi's three proposals — slopes, floors, planets — are all adopted in adapted form below. Slopes were parked for ART reasons only (the idea is endorsed; three ridge-art iterations failed — the revival is re-scoped + kill-gated). Floors follow **Qi's wells design**: still 2D, one floor visible at a time, a shaft/entry hole drops you to the next floor.

**Ground truth:** `apps/tilt/CLAUDE.md` (absolute gravity, lodge rule, one input — NEVER add a touch verb, no timers), `web/js/physics.js` (dormant slopes force, `wellK` funnel, zone-ready integrate step), `web/js/engine.js` (discrete BFS = generator/prefilter only — *never* the shipping oracle).

---

## Verdicts on the three proposals

| Proposal | Verdict | The adaptation |
|---|---|---|
| **Slopes / hills** | **Revive, re-scoped, art-gated** | Not ridge-lines — **BOWLS (radial attractor) and DOMES (radial repeller)**. Players already read the hole-dimple funnel (`wellK`) at every hole, so a bowl inherits taught visual language; a dome is its visible inverse (radial shading + contour ring + the dormant marble-lift renderer). Physics ≤1 day (radial ±`wellK` variant; ridge machinery stays dormant). Art spike 2–4 days in `scripts/dev/slope-lab.html`, screenshots judged at actual size vs the reference **before** physics ships — a real kill-gate (it failed 3×; park without shame if it fails a 4th; the ladder degrades gracefully to 6 elements). |
| **Floors** | **Adopt as WELLS (Qi's design) + drop-grates** | A multi-floor level = a **stack of 2–3 boards played one at a time**. Sinking all marbles doesn't end the level — the floor opens, a descent animation plays, and the marbles pour out of the **shaft** onto the floor below, landing where the shaft sits. One timer per well; win card at the bottom. **Position continuity is the depth machine** (shaft xy above = spawn xy below → land in a corner pocket / on ice / mid-maze); **two shafts = route choice** with zero new input. No simultaneous-floor physics, no occlusion, no camera tricks. Sibling element: **drop-grate teleport pairs** within a floor (grate A swallows → 0.35s shaft animation → ejects at B, 0.8× velocity) for discontinuous routing. True *simultaneous* stacked floors: rejected (3–5 wk + occlusion + it's Quarter's commitment-puzzle class). |
| **Planets / gravity** | **Adopt as the chapter structure — never bare g-scaling** | Planet = world = 15–16-level chapter carrying exactly: (1) **ONE new visible element**, (2) an honest **≤2-param retune** (`accel` 0.7–1.4×, `frictionC/K`, `restWall/restBall`, `captureSpeed`, `wellK`), (3) a palette/backdrop/audio identity. Pure param dressing or invisible g-scaling alone fails our own "distinct only if the screenshot looks different" rule. **Forbidden forever:** rotating/inverting the gravity response (absolute attitude is a design decision), timers, touch affordances. **Pinned invariants per world:** `cupHoldK` scales with `accel` so lodge-escape tilt ≈ `cupHoldK/accel` ≤ ~6.5 m/s² (else a low-g "moon" silently makes lodged marbles unescapable), and `maxSpeed·DT` < marble diameter (tunneling). |

**Evidence highlights:** Angry Birds Space is the planets blueprint — visible gravity fields + one-element-per-chapter updates → 50M downloads in 35 days, 12 episodes over 3 years, ~zero "gimmick" criticism. Labyrinth 2 (~150–200 levels, ~11 elements, Metacritic 89) proves the element-count sweet spot; its sequel-killing calibration regression ("warped to unplayable") is the genre's death-by-feel warning. Super Monkey Ball's #1 complaint was slope+tilt sensitivity → steep bowls/domes gate late. Tilt to Live got years of retention from **zero levels** via 46 award-feats — the board-free lever Tilt hasn't touched.

---

## Element ladder (one per world; catalog capped at 7 — playbook rule)

| Tier / World | Levels | Element (ONE physics rule) | Teaches | Engine work |
|---|---|---|---|---|
| T0 W1 **Tabletop** (shipped) | 1–30 | blocks + colored holes + 3–6 marbles + lodge rule | the whole verb | none — becomes the certifier's regression corpus |
| T1 W2 **Rime** | 31–45 | **ice strips** (zone friction ×0.06) | slide-until-blocked → committed lines | ~1 day (`zones[]` beside dormant `slopes[]`) |
| T2 W3 **Dune** | 46–60 | **sand pads** (friction ×3.5 + quadratic damping) | momentum-killing; debuts PARK objective | ~0.5 day (2nd zone type) |
| T3 W4 **Sirocco** | 61–76 | **wind lanes** (constant force rect, ≤0.45×g so the player always wins a fight) | fighting a bias with the tilt vector | ~1 day (dormant slopes force minus ridge logic) |
| T4 W5 **Chime** | 77–92 | **bumper posts** (static circles, restitution ~1.1) | controlled rebounds; speed punishment | ~1 day (existing captured-marble collision path) |
| T5 W6 **Highlands** (ART KILL-GATE) | 93–108 | **bowls & domes** (radial ±`wellK`) | terrain routing; the slopes revival | physics ≤1 day; art 2–4 days, gated |
| T6 W7 **Undercity** | 109–124 | **wells (multi-floor descent) + drop-grate pairs** | discontinuous routing; shaft choice; landing-position planning | wells 2–3 days (floor array + transition + spawn-at-shaft) + grates 2–3 days (capture-path reuse; seal detector gains teleport edges; loop watchdog) |
| T7 W8 **Foundry** | 125–140 | **pressure plates + gate blocks** (marble at rest holds a gate open; closes only on empty cell — no crushing, no timers: plates ARE the timing) | player-paced timing; multi-marble sequencing | 2–3 days (conditional block + rest-detection zone; seal detector walks gate-state graph) |
| T8 W9 **Confluence** | 141–160+ | **no new element** — full remix, mirror/flip variants, "Expert orbit" re-runs of earlier boards under later-world params | combinatorial payoff (50%+ of late content should be recombination) | ~0; generator recipes + re-certification + sawtooth pass |

## Objectives (predicates on world state; sink-all stays the only completion requirement — the rest gate stars/feats or themed levels)
1. **sink-all** (shipped baseline) · 2. **order-sink** (numbered holes, grated until predecessor filled) · 3. **collect-then-sink** (roll over N tokens to open holes) · 4. **escort** (porcelain marble cracks on hard impacts — events already carry impact speeds) · 5. **park-then-open** (rest in a ring ~1s — the skill only absolute-attitude input can examine) · 6. **sweep** (clear all dust tokens) · 7. **avoid-zone** (open-rim edges / tar pits).

## Meta & modes (board-free multipliers — Phase 0, retro-applied to the shipped 30)
**Feats** (2–3/level: no-clack, zero-lodge, no-stop, reverse-order — pure event listeners; Tilt-to-Live's 46-award pattern) · **hidden gems** in ~⅓ of levels + collection screen (Excavate pattern) · **Diamond time tier** above gold, hidden until first clear, certified by bot P2 · **cosmetics** by medal/feat/gem counts (never coins/gacha) · **Daily Board** — the daily-tilt slot has exactly one occupant (a 2025 indie): pre-certified 90-day packs (~200 bytes/level, zero backend), medals-vs-par + streak + archive + share · distinct **haptic identities** per event. Skipped forever: energy, boosters, IAP-content, real-time.

## The certifier (`apps/tilt/scripts/dev/certify.cjs` — Phase 2, BEFORE mass level production)
Two layers (the discrete-solver-is-wrong-oracle scar): BFS = generator prefilter + hint oracle only. The shipping oracle is a **physics bot driving the real sim** headlessly (`__tilt.stepN(n,{gx,gy})`): waypoint proportional controller from BFS hints, 4 Hz decisions, g = clamp(k1·(waypoint−pos) − k2·v) on a 16-dir × 3-mag grid, |g| ≤ 7 m/s², scripted >30° lodge-escape tilts. **K=500 seeded rollouts/level** with start jitter, sensor noise, decision jitter, waypoint permutations. **Accept iff:** win-rate ≥60% within 3× target time; no forced softlock in ≥99% (Stuck reachable only by choice); world invariants pass; per-element watchdogs (wind balance, teleport loops, gates-vs-occupied, ice-past-seal); medals = bot P10/P40/P75 (Diamond P2). ~30–90 s/level → hundreds overnight. Re-certify the shipped 30 as pins; 3-seed smoke joins `test.sh`. The certifier proves *fairness*, never *fun* — every element gets an on-device posture feel-test (couch/bed/walking).

## The Quarter split (hard rules)
**Tilt 1.x owns:** continuous dexterity, time mastery (medals/diamond/feats), FIELD elements (friction, wind, bumpers, bowls/domes, grates/wells, plates), the daily ritual, cosmetics. **Quarter owns:** discrete planning, par-turns, UNDO, exhaustive certification, thousands-scale, and the **commitment-puzzle class** (one-way flaps, crumble, glass, boulders, spring pads — reserved; Tilt never ships them, because state-change chains need undo, which Tilt can never have). Tilt adds no touch verb, no undo, no par budgets, no timers; campaign capped ~160–250 boards. Scheduling: **Quarter stays the next product** — only Phases 0–2 run before/between Quarter milestones; Phases 3+ only if Firebase funnels justify. Marketing: Tilt = "steady hands," Quarter = "clever turns"; Tilt cross-promotes Quarter at launch.

## Build order
- **Phase 0** (v1.1, ~1 wk, zero new physics; waits for the pending review build): feats + gems + collection + diamond + first skins + haptics over the shipped 30.
- **Phase 1** (~3 d): planet plumbing — per-level params via `createWorld` opts; world wrapper UI; pinned invariant tests.
- **Phase 2** (~1.5–2 wk): **certify.cjs** + re-certify the shipped 30 + smoke in test.sh.
- **Phase 3** (v1.2, ~1.5 wk): W2 Rime (first new world proves the whole pipeline).
- **Phase 4** (v1.3–1.4, ~1 wk each): W3 Dune, W4 Sirocco, W5 Chime; objectives debut.
- **Phase 5** (v1.5, art-gated): slope-lab spike → W6 Highlands or park.
- **Phase 6** (v1.6–1.7): W7 Undercity (wells + grates), W8 Foundry — the multi-day engine rungs, last on purpose.
- **Phase 7** (v1.8): W9 Confluence remix + Expert orbit.
- **Phase 8** (with ~v1.3): Daily Board + Firebase D1/D7 tracking.
- **Continuous:** sawtooth reorder per release; every update refreshes the daily pack — the one-world-per-update cadence (AB Space) *is* the maintained-app signal.

## Risks (top of the list)
Feel/calibration regression is existential (Labyrinth 2 HD died of it) — absolute gravity + lodge rule untouchable, posture feel-test per element · bowls art may fail a 4th time — the kill-gate is real · bot-difficulty ≠ human-difficulty — validate tags vs Firebase funnels on W2 before mass production · every element brings a named softlock class (wind-corner pin, teleport loop, gate-seals-last-route, ice-past-seal) — watchdog + `checkDeadEnd` extension per rung · planet params silently violating invariants — pinned tests, not review · solo bandwidth — if Tilt slips past Phase 3 while Quarter's feel-gate pends, Tilt pauses.

## Ceiling (honest)
~**160 campaign boards** by W9 (30 shipped + 7 worlds × ~15 + remix), max ~200–250 genuinely distinct — matching the genre's proven band (Labyrinth 2 ≈ 200). Perceived surface is far larger: ×3 via feats+diamond, +40 Expert-orbit re-runs, +365 daily boards/yr, +gem lap ≈ **500+-item surface**. Thousands-scale is dishonest here (30–90 s/level certification; continuous input) — volume is Quarter's job; Tilt 1.x's endgame is the daily ritual + mastery lap, graduating players to Tilt 2.
