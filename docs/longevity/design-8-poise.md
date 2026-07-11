# Design 8 — POISE: content system for the Calder hanging-mobile core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status:** design-only — no prototype yet. Judged top of a 30-idea sweep (23.8/30, 2026-07-10); merges **Counterpoise** (snap-slot balance machines) and **Windlass** (pulley/rated-rope/ratchet), whose actuation parts live in the blocker catalog, resolving the sweep's "build at most one of Poise/Windlass" caveat. Engine = **Cut's Verlet rope/pin-joint solver re-aimed** (`apps/cut/web/js/game.js`: fixed 1/120 DT, only-pull rope links, rigid link pairs, 10 relaxations); certifier pattern = **`apps/cut/scripts/dev/fairness.cjs` nearly verbatim** (CDP drives the real engine via `window.__game`, sweeps the whole action space, attributes win strategies). Saturation check: total white space — the only digital Calder mobile is SolveMe Mobiles, a *static algebra* puzzle with zero physics.

**Path & ceiling:** procedural, Water-Sort scale. **~1,500–2,500 levels** realistic. Best verifier economics in the portfolio: snap-hooks make the player's action space and the verifier's action space **IDENTICAL** (no aim-tolerance mismatch at all — stronger than Slingshaft's 4,800-shot grid), and a quasi-static rule deletes the timing dimension entirely, so the verifier doesn't sample the space — it **EXHAUSTS** it.

## Core (one verb, no second control)

A Calder mobile hangs from the ceiling — beams on strings, hooks on beams, lopsided. A tray at the bottom holds K ornaments (different masses/materials). One-thumb **drag-and-HANG**: pick an ornament, drag it up (hooks in reach glow, fat ≥44px snap targets), release over a hook — it snaps on, the whole tree swings, beams counter-rotate, chains ripple, and it damps into a new equilibrium. Release anywhere else and the ornament floats back to the tray, no penalty. Ornaments can be re-picked off hooks the same way (unless latched). **Quasi-static rule (load-bearing design decision):** the tray re-arms only when the mobile is calm (all joint angular speeds < ε for ~0.4s, tuned to re-arm in ~1.5–2.5s) — watching the settle IS the pleasure, and it makes player actions and verifier actions the same discrete set: *(ornament → hook), in some order, from rest.*

**One-glance goal:** the tilted mobile IS the problem statement. A spirit-level bubble sits on each beam; win = every bubble centers at settle (or the level's marked variant: a glowing height-zone, a pad to dip onto, numbered bells). Read like Tilt's marble-and-hole.

**Hook:** *Hang the next ornament, watch the whole mobile sway and settle — make every beam level. The Calder mobile, finally with real physics.*

**Why it scales:** the action space is a discrete ordered assignment (K ornaments × M hooks — K=4, M=8 → 1,680 sequences; K=6, M=9 → 60,480), fully enumerable per level, and an **analytic torque pre-filter** (static equilibrium on a tree topology is exactly solvable) prunes >90% before any sim — so per-level verification is seconds, and the generator-verifier loop is the fastest in the studio. Meanwhile arm lengths, hook positions, and tree topology are continuous/combinatorial generator inputs, star tiers are free tolerance-tightening (Lever 1), and objectives swap on the same topology (Lever 2). Distinctness in-portfolio: Cut severs constraints to DELIVER a payload (pendulum ballistics); Poise adds masses ONTO constraints to reach equilibrium (statics/torque). Not Drop (static articulated structure, no falling-ball field); not stacking (assignment to discrete hooks, not free placement dexterity).

## Element ladder (introduce one per ~5–8 levels, then remix; 7 NEW elements, cap respected)

Every element is a material constant, a collision callback, or a body — never a new input.

| Tier | Levels | Element | Teaches |
|---|---|---|---|
| T0 | 1–6 | single beam + fixed hooks + weights 1/2/3 (bodies) | drag-snap-hang; torque = weight × arm, felt not taught |
| T1 | 7–14 | nested beam — a beam hung from another's hook, 2–3 tiers (body) | placements propagate down the tree; the signature element |
| T2 | 15–22 | chain vs rod connector (compliance/length constant) | chains swing wide and transmit yank; rods transmit rotation |
| T3 | 23–30 | sliding hook — slides along its beam under load until friction catches (constraint + friction constant) | lever arm goes continuous: WHERE, not just which |
| T4 | 31–40 | balloon ornament (negative weight constant) + REMIX T1–3 | hang to LIFT a side; first combo band |
| T5 | 41–50 | spring link (stiffness constant) | equilibrium sag is real geometry you must budget |
| T6 | 51–62 | fragile ornament (impulse-shatter collision callback) | the TRANSIENT, not just equilibrium, is the puzzle; order matters |
| T7 | 63–74 | breeze fan (constant lateral force zone) | offset equilibrium; deliberately over-balance into the wind — **last NEW element** |
| T8 | 75–96+ | gravity-angle / mirror / decoy-hook saturation + FULL remix T1–7 | permutation payoff → endless/daily (Lever 5, not element #8) |

## Objective variety (7 predicates, all checked at/through settle — never a timer)

1. **LEVEL-ALL** (staple) — every beam within ±θ at settle; star tiers tighten θ 6°→3°→1.5°.
2. **CLEARANCE** — hang all N with no beam tip or ornament inside the wall/floor margin zones, transient included.
3. **TARGET-HEIGHT** — bring the marked lantern ornament/hook to rest inside a glowing zone.
4. **TIP-ON-PURPOSE** — dip a specific beam tip to touch a low pad (controlled imbalance) without snapping any rated thread.
5. **CHIME-ORDER** — bells ring when their tip crosses its chime mark during the *induced* settle-swing; ring them in numbered order. Order-hit via placement ORDER (which hang excites which limb), never player timing — the quasi-static rule holds.
6. **FRAGILE-SAFE (escort)** — the fragile survives every transient (impulse under threshold, never enters the marked region).
7. **EXACT-SAG** — the lowest ornament settles inside a height band (spring levels).

Phased combos (goal B gated behind A: level the master beam, THEN bring the lantern to the zone) = 2× at ~1.3× cost.

## Blocker / modifier catalog

rated thread (max-tension constant; snaps — fail unless the objective wants it) · latch hook (one-way: no re-pick — restores ordering pressure) · **pulley pair** (rope over a pulley links two hooks across the board — action at a distance; the Windlass fold-in) · ratchet drum (pulley locks against reverse travel — irreversible moves) · water-cup ornament (spills mass while tilted past φ — place it last or gently) · pendulum passenger (a pre-hung free bob you must avoid exciting) · decoy hook (looks right, fails — verifier-certified, see below) · pre-hung fixed ornaments · forced-queue (tray order imposed vs free-pick, late-game) · knobs: bubble tolerance θ, ornament budget (leave the heaviest in the tray), no-rehang, wall margins, damping constant, gravity angle ±15° (reads as a draft), mirror.

## Meta-progression (solo-cheap, no backend/gacha, cozy-premium)

1. **3-star** per level: solved / tighter tolerance / constraint budget (fewer ornaments or no-rehang) — all verifier-certified achievable.
2. **Deterministic ornament album** — 1 collectible per 3–5 levels, ~48 ornaments (glass birds, paper cranes, brass fish, museum-Calder discs); a completed set unlocks a theme. Never random.
3. **Cosmetics** (~150 combos: ornament sets × mobile-frame materials × backdrop themes — nursery night, gallery white, autumn window).
4. Streaks: 7-day daily-mobile streak → deterministic cosmetic. No energy, no boosters, no PvP. Single `save.json`.

## Difficulty curve

Sawtooth over verifier tags (pass-rate bands, below); teach→test→twist→combine per tier band; never two hard back-to-back; breather (2-beam, loose tolerance, spare ornament) after each spike; every 10th a hardest-solvable of the band, every 20th a chapter finale; floor 60% first-try. Difficulty comes from geometry and constraints only: hook count vs ornament count, decoy hooks, tolerance θ, tier depth, budget, latch/forced-queue — **no timers anywhere** (the quasi-static rule bans them structurally, not just stylistically).

## Daily & live-ops (no-backend first)

1. **Daily mobile** — `mulberry32` seeded by date, same board for everyone, generator+verifier certify on-device before showing; share-text compare (ornaments used, stars).
2. **Weekly re-contexts** of ~10 known levels via knobs (heavy-gravity week, breeze week, one-fewer-ornament, no-rehang) — Lever-1 re-skins, re-certified in batch.
3. **Zen calm mode** — endless certified-easy boards, no stars, for the settle-watching pleasure alone (cheap: the generator's easy band is a byproduct).
4. Defer leaderboards to a Firebase once-a-day snapshot; never real-time MP/guilds.

## The verifier (physics-faithful, exhaustive — the whole ballgame)

**Discretized action space = the player's actual action space.** A level is `{tree topology, arm lengths, hook set (M), ornament multiset (K), element flags, objective, knobs}`. The bot's moves are exactly the player's: from rest, hang ornament *i* on hook *j*; repeat. No aim grid, no timing grid.

**Pipeline per candidate level:**
1. **Analytic pre-filter** (Node, no sim): for equilibrium objectives, solve torque sums bottom-up on the tree for every final assignment (multiset-deduped C(M,K)-scale); discard assignments violating the objective's statics. Prunes >90%. For sliding hooks / springs, solve with the extra continuous unknown (1-D root find per beam). *This filter only ever REJECTS — it never certifies. A torque-only solver is exactly the wrong-oracle trap (the Tilt lesson): transients shatter fragiles, clip walls, snap rated threads, spill cups.*
2. **Continuous confirm**: every surviving assignment (order-insensitive levels) or sequence (levels with fragile/water-cup/bell/latch/ratchet flags) is rolled out in the REAL engine — same 1/120 fixed step the player runs, driven headlessly via `window.__game` hooks (`setLevel/hang/simN/state`) through the fairness.cjs CDP harness, later the moraine shared-module path. Each rollout: hang at settle, run to settle (with a never-settles watchdog), check predicate + fail states.
3. **Robustness seeds**: each passing solution is re-run under 32 seeded jitters (±2px snap offset, small initial sway phase) and must win ≥30/32 — a solution that only works from a pixel-perfect rest state is a fluke, not a solve. Sweep + jitter passes total well over the playbook's 500 continuous rollouts per level, all same-engine.

**Acceptance:** ≥2 distinct passing assignments (fair margin) AND the greedy policy ("heaviest ornament → hook nearest the high side") does NOT solve it (except tutorial tiers) AND random-assignment win rate <40% AND ≥1 certified **decoy hook** for medium+ bands (a hook whose inclusion correlates with near-miss assignments — computable directly from the sweep) AND star budgets are achieved by ≥1 rollout each.

**Difficulty tag = fraction of assignments that pass:** >20% intro · 5–20% easy · 1–5% medium · <1% hard; plus an order-sensitivity bit and a strategy signature (per-beam counterweight sign pattern) used for de-duping "same solve, different pixels" levels. Tags drive the sawtooth ordering pass. Wire the whole thing into `scripts/dev/test.sh` from the first hand-authored level — the L5/L8-shipped-unsolvable scar must not repeat here.

## Level ceiling (reasoning): ~1,500–2,500, three layers

- **A — hand-authored backbone:** ~140 across T0–T8 (~15–18 per rung + finales), 3–4 weeks. Proves the core is fun before automating.
- **B — verified procedural:** generator samples template-grammar tree topologies (2–4 beams, depth ≤3, planarity + min-arm-length + no-string-crossing checks for legibility), continuous arm lengths/hook positions, ornament multisets, element flags. Per-level verification is seconds (pre-filter + exhaustive confirm), so throughput is bounded by curation, not compute. Expect ~60–70% rejection (legibility, decoy, difficulty band, strategy-signature dupes) — an overnight batch yields hundreds; curate to **~1,200–2,000** accepted.
- **C — permutation:** ×3 star tiers, mirror, gravity-angle, objective swaps on the same topology, daily/weekly push perceived content well past the count.

Hand-authoring alone caps ~250 (and the Cut trim taught us permutation-fill without a verifier + de-dupe reads as clones); the exhaustive verifier with strategy-signature de-dupe is what makes the tail honest. The assignment combinatorics grow (more hooks/ornaments) while per-level verification stays cheap — the opposite scaling of most physics games, and why the ceiling is Water-Sort-class.

## Solo-dev feasibility: HIGH (engine and certifier both exist in-repo)

Cut's solver already does everything the mobile needs: Verlet particles, only-pull rope links, rigid links, pin joints (shared particles), fixed 1/120 accumulator, settle detection, watchdog discipline. Poise is point masses + rod-pairs on that solver, drawn as a mobile. fairness.cjs is the certifier skeleton; moraine is the shared browser+Node module precedent; Tilt/Cut's Capacitor shell clones over (team `Y3T546NP6T`). **Build order:**

1. **Feel toy** (1.5–2 wks): single-file prototype — 2-tier mobile on the ported solver, drag-snap-hang, damped settle, bubble indicators, tray re-arm on calm. `window.__game = { state(), simN(n), hang(oi,hi), unhang(oi), setLevel(i), reset(), dims() }` from day one. **The damping curve is THE feel gate — feel-test on device before anything else** (too damped = dead, too lively = 5s waits).
2. **Backbone T0–T3** (~60 levels) + objectives 1–3 + star tolerances (Levers 1–3).
3. **Verifier v1** (1–2 wks, not 2–4 — the pre-filter and identical action space make this the cheap one): torque pre-filter + exhaustive sweep + jitter pass via the fairness.cjs CDP pattern; into `scripts/dev/test.sh` as the regression net. Certify the backbone retroactively.
4. Rungs T4–T7 + remaining objectives + catalog blockers; backbone to ~140; sawtooth ordering pass from tags.
5. **Generator** (1–2 wks): template-grammar topologies + certification + strategy de-dupe; overnight batches.
6. Meta (album/cosmetics/streak), daily seed, zen mode; Capacitor wrap. No new tech, no build step, no 3D.

## Risks

- **Solver stability on chains/tiers** — long chains + heavy ornaments re-open Cut's mass-ratio scars (a 12-node tail out-muscling the crate). Bound: ≤3 tiers, chains ≤8 links, mass ratio ≤1:8, inverse-mass-scaled corrections (the `freeTail` lesson); pin a stability sim-test per element rung.
- **Settle pacing** — the quasi-static re-arm is the verifiability keystone AND a boredom risk. Tune damping so re-arm lands in ~1.5–2.5s; if device feel-tests say it drags, add "calm enough" (ε up), never "place during swing" — that would fork the player/verifier action spaces.
- **Static algebra in disguise** — if equilibrium objectives dominate, the physics is decoration and SolveMe already owns that form. Keep transient-relevant content (fragile, water cup, bells, rated thread, pendulum passenger) ≥⅓ of post-T5 levels; the verifier's order-sensitivity bit makes this auditable.
- **Generated-mobile legibility** — a random joint tree is spaghetti. Template grammars, ≤4 beams, planarity/overlap/min-arm checks in the generator; reject aggressively (budgeted in the ceiling math). Cut's audit lesson: "distinct only if the screenshot looks different" — run the strategy-signature de-dupe AND an eyeball pass per batch.
- **Tolerance vs jitter noise floor** — Cut's stall watchdog had to move 0.02H→0.05H because gravity re-injects contact jitter. The ±1.5° star tier must sit above the settled sim's angular noise; certify each tolerance tier from actual settled states, never asymptotic math.
- **Decoy metric misfire** — near-miss correlation is a heuristic; tune the threshold on the hand backbone (where decoys are authored intentionally) before trusting it in acceptance.
- **Cross-platform determinism** — Node/CDP vs iOS WKWebView must produce identical trajectories; pin the fixed step, golden-test a reference rollout on both (the Sort design's same risk).
- **Feel unprovable headless** — the verifier proves fairness, never fun. The swing-settle IS the product; feel-test on device + render a PNG after any UI/feel change, per studio rule.
