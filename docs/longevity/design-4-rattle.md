# Design 4 — RATTLE: content system for the physics tap-blast core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status:** core-check **BUILT + VERIFIED + FEEL-PASSED** (2026-07-11) at `prototypes/13-rattle.html` — tap→pop→avalanche→re-cluster→objective ticking verified headlessly via `__game.tapAt/clustersNow`; singleton taps correctly don't spend; passed Qi's feel-test ("high quality"). Judged top of the 30-idea round (24.9/30). **Decided sequence: Rattle is the flagship AFTER Quarter** (see [`ROADMAP.md`](ROADMAP.md)) — start once Quarter's verifier exists. It deconstructs Toon Blast: same tap-a-cluster verb and objective chips, but the grid is ripped out — pieces are rigid circles in a vessel, and "column reflow" becomes a real avalanche. ~80% of the sim already exists: Pluck's circle-contact engine (`prototypes/03-pluck.html`), Cut's fairness-verifier pattern (`apps/cut/scripts/dev/fairness.cjs`), moraine's shared browser+Node engine module. Nearest genre precedent is Boom Blox (Wii, 2008) — no rigid-body tumble-blast exists on mobile.

**Path & ceiling:** procedural, the highest of the roster: **~2,000–5,000 verified levels.** The level spec is tiny (`{vessel grammar + params, seeded spawn mix, element flags, objective, tap budget}`) and the action space is *natively discrete* (the clusters on the board), so the verifier runs hot — throughput, not authoring, is the cap. Toon Blast ships ~10,000 levels on exactly this multiplier stack; we claim a fraction of that, physics-verified.

**Distinct from design-2 Sort/Pluck:** Pluck picks INDIVIDUAL pebbles into bins — unit-level hand-sorting. Rattle taps whole clusters and the cognition is *cascade planning* — read the pile like Jenga, pick the pop whose avalanche builds the next cluster. Same circle engine, different verb, different strategy. No launch, no pour, no tilt.

## Core (one verb, no second control)
A vessel (jar, flask, hourglass…) holds a settled pile of 40–90 colored beads (rigid circles, uniform radius). **TAP any touching same-color cluster of ≥2 to pop it** — the beads burst, everything above tumbles, rolls, wedges, and re-settles under real gravity, forming new clusters. Tap again. Win = the objective chips at the top hit zero before the tap budget runs out. **The pile is finite — no top-up refill in campaign** (deterministic, one-glance, verifiable); refill exists only in the endless mode.

Signature move (the name): **tapping the vessel itself — anywhere that isn't a bead — RATTLES the pile**: a small seeded shake impulse, costs 1 tap, may re-form clusters when you're short on pairs. Same input (a tap), different target — never a second control. It is also the softlock escape hatch.

Micro-rules that make it read:
- Tapping a singleton (cluster of 1) is a free no-op: the bead wiggles + soft thunk — teaches the ≥2 rule without punishing.
- Input locks during the avalanche (settle target < ~1.5 s, tuned via damping); poppable clusters get a shared shimmer outline once settled.
- Legibility in a jumbled pile: cap 4–5 colors, **double-code every bead with a stamped glyph** (dot/triangle/square/star/ring), uniform radius, colorblind-safe palette.
- Pop feedback: radial particle burst + bead squash + bass thunk pitched by cluster size + 2px screen-shake on 6+; popped beads emit a small outward shockwave impulse to touching neighbors (juice AND a mechanic — see shell).

**Hook:** *Tap a cluster, watch the pile avalanche, plan the next pop from the wreckage — Toon Blast with the grid ripped out.*

**Why it scales best-in-roster:** the verb is a discrete choice over ~5–20 clusters per settled state, so (a) constraint-tightening is trivially free (tap budget = the universal knob, Lever 1); (b) every element is a material constant or collision callback on a body the circle engine already simulates (Lever 3); (c) the vessel polygon + gravity angle is a whole permutation axis (Lever 5); and (d) the discrete action space makes beam-search verification *cheaper than any other design in the folder* — no aim/power discretization needed, the board hands you the moves.

## Element ladder (introduce one per ~6–10 levels, then remix; cap NEW at T8)
Every element is ONE physics rule — a constant, a collision callback, or a body. Never a new input.

| Tier | Levels | Element | One physics rule | Teaches |
|---|---|---|---|---|
| T0 | 1–8 | beads (3 colors) + vessel + tap budget | — (base engine) | tap ≥2; pile re-settles; rattle-tap |
| T1 | 9–16 | **toy** (large escort body, e.g. duck) + 4th color | floor-sensor body | pops open channels; "bring it down" |
| T2 | 17–26 | **stone** (colorless bead) | density ×3, no colorId | dead weight — undermine it, dig around it |
| T3 | 27–38 | **shell** (bead in a wooden crate) | callback: adjacent pop shockwave cracks shell → normal bead | collateral damage; pop NEXT TO things |
| T4 | 39–52 | **balloon** + remix T1–3 | gravityScale −0.6; pops on adjacent pop | props piles up from below; first combo band |
| T5 | 53–68 | **ice bead** | friction 0.02 | slump physics — icy piles spread flat; read pile shape |
| T6 | 69–86 | **tar bead** | friction 5 + weak weld joint to touching neighbors | dams avalanches; clumps fall as one unit |
| T7 | 87–106 | **bomb bead** | callback: popped-in-cluster → radial impulse + destroy radius 2.5r | AoE you must *earn into position* |
| T8 | 107–128 | **pinned bead** (latched to wall) — LAST new element | pin joint, released by adjacent pop | release-order puzzles |
| T9 | 129–160+ | gravity tilt / mirrored & rotated vessels + FULL remix T1–8 | free variables, not elements | geometry/gravity permutation → endless/daily |

## Objective variety (predicates on the settled world state)
CLEAR-N-COLOR (pop N red — the baseline chip) · BRING-DOWN (toy reaches the floor sensor; ×1–3 toys) · CLEAR-ALL-TYPE (crack every shell / pop every balloon / sink every stone through the drain) · DROP-LINE (pile height below a marked line) · AVOID-ZONE (no bead may cross the overflow line / hazard bead must never touch the floor — containment fail) · ORDER (pop colors in the lit sequence) · PHASED (goal B gated behind goal A: crack the shells, *then* bring the duck down). All are ≤20-line checks on `state()` at settle.

## Blocker / modifier catalog
stone · shell · balloon · ice · tar · bomb · pinned bead · **vessel grammar** (~12 authored polygon families: straight jar, waisted flask, hourglass, twin-chamber + throat, staircase shelves, tall chimney, wide basin, funnel-over-cup, U-tube, drain-floor, tilted jar, boss toybox) · one-way flap (static, passes downward only) · drain hole (bead-sized exit, stones only fit) · gravity angle ±15–30° · difficulty knobs: tap budget (bot-optimum + 4 → +2 → +0/1), colors 3→5, pile depth, objective size N, stone ballast count.

## The physics-faithful verifier (the certification machine)
Same continuous circle engine the player runs — shared `engine.js` module (browser + Node, moraine pattern), fixed 1/120 timestep, seeded `mulberry32`. **Never a discrete/logic solver** — the whole point is that cluster formation after an avalanche is a continuous-physics outcome.

- **Discretized action space:** at each settled state, enumerate connected components of the contact graph (edge = centerDist ≤ rᵢ+rⱼ+0.5px) grouped by colorId; poppable components (size ≥2) are the moves, plus 1 extra move = rattle-tap. Typically 5–20 actions per state, depth 15–25 taps.
- **Certification per candidate:** (1) **beam search** (width 8, depth = budget) on the canonical seed proves solvability and measures `botOptimum` taps; (2) **300–500 greedy-policy rollouts** across spawn-jitter + rattle-impulse seeds measure robustness (win-rate within budget) — physics is noisy, ≥2/K wins is the floor, but target band is 30–90%.
- **Accept iff:** solvable within budget AND `botOptimum ≥ 2` (reject one-tap trivials) AND no softlock class reached in >5% of rollouts (zero poppable clusters + rattle can't recover + objective unmet — the stone-stuck class) AND no degenerate exploit (random-policy win-rate < 40% — "tap anything wins" rejection).
- **Difficulty tag** = f(`botOptimum/budget`, branching entropy, **cascade sensitivity** = outcome variance across seeds). The sensitivity metric doubles as a chaos filter: levels where identical taps yield wildly different piles are rejected as slot machines, not tagged hard. Tags feed the sawtooth ordering pass.
- **Throughput math (why the ceiling is real):** 60 circles × ~180 settle steps with a spatial hash ≈ ~10 ms in Node per pop; a full playthrough ≈ 0.3–0.5 s; beam + 500 rollouts ≈ 2–5 min per level worst case → **~300–700 certified levels per machine-day**, thousands in overnight batches.
- Ship it as `scripts/dev/verify.cjs` + `scripts/dev/test.sh` (regression net — keep every stuck-class watchdog, Cut precedent). Golden-trajectory test pins Node-vs-WKWebView determinism.

## Meta-progression (solo-cheap, no backend/gacha, cozy-premium)
1. **3-star tap budgets** per level (solve / bot-optimum+2 / bot-optimum+0–1), every tier verifier-certified achievable.
2. **Deterministic toy chest** — the escort toys ARE the collection: 1 figurine per ~4 levels, ~50-toy shelf screen (Excavate collection pattern); sets unlock vessel themes.
3. **Cosmetics** (~150 combos: bead materials glass/wood/candy × vessel skins × pop-particle styles). Coins 5–15/level, skins 100–500, no paywall.
4. Single `save.json`. Defer energy/boosters/IAP entirely.

## Difficulty curve
Sawtooth over verifier tags; teach→test→twist→combine per element band; never two hard back-to-back; breather (shallow pile, 3 colors, fat budget) after each spike; floor 60% first-try win; every 10th a hardest-solvable, every 20th a chapter-finale vessel. Difficulty comes from pile DEPTH, color count, budget slack, stone ballast, and vessel geometry — **never timers** (a soft timer only in optional endless mode). Colors cap at 5; past that, depth comes from structure.

## Daily & live-ops (no backend at launch)
1. **Daily jar** — `mulberry32(dateKey)` seeds one pile for everyone, verifier-certified in the batch; score = spare taps; local best + share text.
2. **Weekly re-skins** of ~10 campaign vessels via Lever-1 knobs (budget −2 / 5 colors / tilted gravity / all-ice week).
3. **Endless toy-box mode** — the one mode WITH a spout refill: beads drip in, overflow line = fail, local high score (reuses the AVOID-ZONE predicate).
4. 7-day streak → deterministic cosmetic. Defer leaderboards to async once-a-day snapshot; never real-time PvP/guilds.

## Level ceiling (reasoning): ~2,000–5,000, three layers
- **A — hand-authored backbone:** ~120 across T0–T8 (~10–14 per element band, 3–4 weeks). Proves the core is fun before automating (playbook rule).
- **B — verified procedural:** generation = seeded stratified fills (per-stratum color/element mixes) into the 12 vessel grammars × objective × budget. At 300–700 certified/machine-day and an expected 30–50% accept rate, 2,000+ is weeks of batch time, not authoring time. De-dupe by strategy fingerprint (element mix + objective + botOptimum + vessel family) — the honest cap is *distinctness*, per the Cut audit lesson: a level is distinct only if a screenshot looks different, so budget ~2,000–5,000 AFTER de-dupe, not raw acceptance count.
- **C — permutation:** 3-star budgets + gravity tilt/mirror + themes + daily push perceived content well past that.

Hand-authoring alone caps ~250 (playbook); the natively-discrete action space is why Rattle's verifier out-throughputs Slingshaft's (no aim×power sweep) and Sort's (no continuous pour timing) — which is exactly why this design has the roster's highest ceiling.

## Solo-dev feasibility: HIGH (~80% engine exists) + build order
Pluck (`prototypes/03-pluck.html`) ships the circle-contact sim, settle detection, seeded spawns, `__game` hooks on the exact stack; Cut ships the verifier/certifier + stuck-watchdog pattern; moraine ships the shared-module pattern; Excavate ships the collection screen; the Capacitor shell is clone-able from Cut. **Build order:**
1. **Core-check** `prototypes/14-rattle.html` (single file): port Pluck's circle engine; add contact-graph cluster detection, tap-pop + shockwave, settle-lock, rattle-tap, 5 hand levels, `window.__game` hooks. **Feel gate before anything else:** does one pop's avalanche read as *caused* and land juicy on device? (Feel is unprovable headless — device test.)
2. Refactor sim into shared `engine.js` (browser + Node); golden-trajectory determinism test.
3. Elements one at a time (each 2–6 hrs: one constant/callback + cue + how-to page, Cut convention), hand-authoring the ~120 backbone (Levers 1–3), objectives as predicate functions (Lever 2).
4. **Verifier** `scripts/dev/verify.cjs` as specified above; wire into `scripts/dev/test.sh` (Lever 8).
5. Generator (vessel grammars + stratified seeded fills) → overnight certified batches → sawtooth ordering pass (Lever 4).
6. Meta (toy chest, stars, streak) after the backbone is proven fun; Capacitor-wrap; daily jar.

## Risks
- **Avalanche chaos kills planning** (the design-killer): if pops feel like pulling a slot lever, the cascade cognition is gone. Mitigate in physics: low restitution (~0.05–0.12), decent friction (~0.6), modest pile depth, damping so pops cause LOCAL slumps not explosions; mitigate in certification: the cascade-sensitivity metric rejects chaotic layouts. **The core-check exists to test exactly this before any content is built.**
- **Settle-time pacing** — if the pile takes >2 s to settle, tap cadence dies. Tune damping/thresholds; assert settle < 240 steps in the verifier; input-lock must feel like anticipation, not lag.
- **Cluster legibility in a jumble** (no grid to help the eye): double-code color+glyph, cap 5 colors, uniform radius, shimmer on poppable clusters only at settle. If shimmer is too noisy on device, fall back to highlight-on-touch-down.
- **Softlock classes** — no poppable pair + rattle can't recover; toy wedged on stones. Verifier stuck-watchdogs (Cut pattern) + in-game graceful "rattled out" fail + retry; never a silent dead board.
- **Cross-platform determinism** — Node vs. iOS WKWebView must produce identical avalanches for the verifier's word to mean anything: fixed 1/120 step, seeded RNG everywhere (including rattle impulses, keyed by tap counter), golden-trajectory regression test.
- **Genre-clone perception** ("it's just Toon Blast") — the physical avalanche IS the product; if the tumble doesn't feel magic on device, the design has no moat. Feel-first, kill early if the core-check disappoints.
- **Difficulty-tag accuracy** — bot win-rate vs. human first-try may diverge more here than in Slingshaft (humans read piles holistically); validate the curve on the 120-level backbone cohort before large procedural batches.
- **Element saturation** — cap NEW elements at T8 (pinned bead); T9+ is vessel/gravity permutation, never element #9.
- **iOS WebAudio/canvas backgrounding** — known WKWebView zombie-audio + purged-canvas gotchas; apply the existing playbook (`docs/handbook/08-ios-webaudio.md`) from day one.

## Shipped build notes (2026-07-15 — slice → full-bleed → 106-level ladder)

What actually got built, and the gotchas worth remembering (see also the reusable rules folded into `../longevity/README.md`):

- **Full-bleed vessel (design update).** Walls = the phone's own edges; no drawn jar (`WREF 390 × HREF 844`, walls at world bounds). The glass-vessel look is reserved for future vessel-grammar levels. The play-screen design mocks (`design/screenshots/1a,1b`) predate this and are stale — don't re-align the HUD to them.
- **Balloon buoyancy vs. an open top (the sharp edge).** A net-buoyant body in an open-top pile *always* ends detached at the ceiling → the "pop beside it" objective becomes unreachable. Design's `gravityScale −0.6` is a nominal intent; the position solver needed the buoyancy paired with a **perch clamp** (each balloon is held ≤1.5·R above its highest nearby bead, so it floats to the pile *surface* but never leaves contact). Certified with a slow-play reachability guard — see the anti-pattern in the longevity README.
- **Elements = one rule each, verified in `apps/rattle/scripts/dev/`.** stone (density×3, colourless) / shell (adjacent-pop crack) / balloon / ice (low friction, slump) / tar (high friction, dam) / bomb (radial destroy). Certifier is beam+greedy+reachability; the 106-level campaign is generated by `gen-campaign.cjs` (author-by-intent + sawtooth).
- **On-board element intro (Royal-Match style), NOT a modal card.** The first time an element appears, spotlight the *real* bead on the pile + a pointer bubble that explains it there; tap to dismiss. **Canvas technique:** the spotlight is a **radial-gradient veil drawn on top** (clear centre → dim edge). Do NOT use `globalCompositeOperation="destination-out"` to punch the hole — that erases the board too, revealing the page background (the bead looks missing). Reusable for any "highlight one thing on a canvas board".
- **Cards must match the design source, not approximate it.** A 3-agent audit vs. `design/design_source/*.dc.html` + screenshots caught real drift (flat stars vs. the fanned arc, wrong button layout, honey vs. red-orange eyebrow). Debut/coach icons render the **actual `drawBead` painter** onto an offscreen canvas — never a hand-drawn SVG that can diverge from the in-game bead.
- **Out-of-taps → explicit lose card.** The engine's `lose` event must drive a "TRY AGAIN" card; a silent stalled board reads as a freeze.
