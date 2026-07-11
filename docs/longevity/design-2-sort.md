# Design 2 — SORT: content system for the physics color-sort core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status — DECIDED (2026-07-09): the sort core is Pluck, not granular sand.** The granular-sand core-check (`13-sort.html`) played too close to `02-pour.html` (same engine, same sloshing feel) AND the loose sand jumbled, so it was **dropped** and its role **folded into Pluck** (`prototypes/03-pluck.html`, discrete pebbles → color bowls). Implement the sort core as the **discrete-unit** design below, starting from `03-pluck.html`. Keep `02-pour.html` only as a separate cozy pour "feel toy" — it is NOT the sort puzzle.

**Path & ceiling:** procedural (Water-Sort / Ball-Sort ship thousands). **~1,500–2,500 levels** with the physics-faithful verifier. The tiny level spec makes content nearly free — *if* the sort reads cleanly (which discrete units guarantee and loose sand did not).

## ⚠️ Why discrete units, not granular sand (the finding that drove the decision)
The `13-sort.html` core-check used **free-flowing granular sand** and showed the fatal tension: **loose sand jumbles at the color interface, so "pour the top color" and "one pure glass" are fuzzy** — clean sorting is imprecise and frustrating, purity is hard to reach, and it looked/played almost identically to `02-pour`. **Discrete, stackable units** (beads / marbles / pebbles / liquid *bands*) hold clean layers and pour/place as chunks — keeping a physical feel while making the sort unambiguous and verifiable. Our **Pluck** prototype already IS this (discrete pebbles, one-glance color→bowl), so it is the sort core. The design below is the discrete-unit version.

## Core (discrete-unit version; one verb, no second control)
Several glasses on a shelf, some pre-filled with **stacked layers of colored beads**. Grab a glass, hover it over another, tip to pour its **top color layer** across as a clean chunk; release to set it upright. Win = every non-empty glass holds ONE pure color (upright), with minimal spill. Physically simulated (beads have real collision/settle) but the units stay discrete so layers stay clean — Water Sort you can *feel*.

**Hook:** *Tip a glass, pour one clean color at a time, until every glass is pure.*

## Element ladder (introduce one per ~5–8 levels, then remix; cap ~8)
| Tier | Levels | Element | Teaches |
|---|---|---|---|
| T0 | 1–6 | plain glasses + 2 colors, 2 layers, one empty buffer | grab/tip/pour; purity + upright win; why you need a buffer |
| T1 | 7–14 | tighter capacity / overflow spills | plan pours; partial pour |
| T2 | 15–24 | bead size / flow-rate (fine=fast vs. coarse=slow-clumpy) | materials pour & pack differently (radius/restitution constant) |
| T3 | 25–36 | narrow-neck / funnel / wide-bowl glass geometry | neck throttles the pour; precision matters |
| T4 | 37–50 | internal divider / two-chamber glass | fill each chamber purely (extra collision segments) |
| T5 | 51–66 | locked / lidded glass (sealed until a condition) | ordering (win-check flag) |
| T6 | 67–84 | drain zone + no-mix hazard color ("mud"/oil) | route the hazard to a waste glass |
| T7 | 85–100 | gravity / shelf-tilt variants | pours arc; counter-tip needed — capstone remix (Lever 5) |

## Objective variety
PURE-SORT (base) · EMPTY-A-TARGET · EXACT-FILL (N units) · NO-SPILL / UNDER-POUR-BUDGET · SEGREGATE-HAZARD · PHASED / TWO-STAGE · ORDER-LOCK · BALANCE (equal counts).

## Blocker / modifier catalog
empty buffer glass · capacity limit (spill) · narrow-neck/funnel/wide-bowl geometry · internal divider · locked/lidded glass · capped-capacity glass · drain zone · hazard color · tilted shelf / rotated gravity · fixed/pinned glass · mixed-start glass · color count 2→6 (cap ~6 for legibility; use colorblind-safe palette + shape tags).

## Meta-progression (client-side, cozy-premium, no gates/gacha)
1. **Star grades** from constraint tiers (solved / under pour-budget / zero-spill).
2. **Deterministic collection** — 1 bead-jar/skin per ~4 levels, a ~40-item album unlocks Hard mode.
3. **Cosmetic re-texture** (~150 combos: palettes × vessels × themes). No VO.

## Difficulty curve
Sawtooth over verifier tags; never two hard back-to-back; floor 60% first-try. Difficulty from sort DEPTH (colors, layers, buffer scarcity, chain length) + precision (necks, spill, tilt), NOT timers (time only in the final ~25% + events). Every 10th/20th a milestone; breathers after spikes.

## Daily & live-ops (no backend at launch)
Client-side daily seed (`mulberry32(day*7919+13)`, verified in-app, everyone gets the same board, share-text compare). Weekly re-context of ~10 levels via a param twist (double gravity / coarse beads / zero-spill / one fewer buffer). 7-day streak → deterministic cosmetic. Defer leaderboard to async snapshot; no energy gates/boosters/guilds/PvP.

## Level ceiling (reasoning)
~**1,500–2,500** shippable. Proven thousands-genre; content is a tiny spec `{containers, colors, layers/counts, empties, flags}` so the wall is verifier throughput + procedural sameness, not authoring. Hand-author ~150 backbone across the 8 tiers, then the generator + headless physics verifier carry the tail (containers 3–7 × colors 2–6 × layers × ~12 flags × gravity/shape/mirror). Stars ×3 + collection multiply perceived content ~3–5×.

## Solo-dev feasibility: HIGH (best procedural fit)
Start from `03-pluck.html` (discrete-pebble sort already on the exact stack; `mulberry32` + headless `__game` hooks present). **Build order:**
1. Take Pluck's discrete-pebble sort as the core; add stacked-layer glasses / clean "top color" so purity is unambiguous (Pluck's bowls already are).
2. Hand-author the ~150-level backbone across the 8 tiers (Levers 1–3).
3. Build the **verifier** (the whole ballgame): Node headless, a greedy/beam pour policy over the discrete action space (which glass → which glass, when to stop), accept if PURE-SORT reached in ≥2 of K within budget with no exploit; tag by effort for sawtooth. Add to `scripts/dev/test.sh` as the regression net.
4. Capacitor-wrap like Tilt/Cut/Excavate.

## Risks
- **The verifier is the whole ballgame** — the rollout policy MUST use the same discrete-bead sim (not a mismatched abstract solver); a good greedy/beam over 500+ seeds is the main spend.
- **Cross-platform determinism** — Node vs. iOS WKWebView must produce identical trajectories; pin the fixed 1/120 step, golden-test Node-vs-browser.
- **Procedural sameness** — variation must change *strategy* (buffers/colors/flags/gravity), not just layout; 20–30% handcrafted + per-band re-weighting.
- **Genre-clone perception ("just Water Sort")** — the physical bead feel + spill economy is the only differentiator; it must feel exceptional. Feel-test.
- **One-glance color ceiling ~6** — beyond ~6 colors palettes stop being distinguishable; get depth from structure, not more colors; colorblind-safe palette + shape tags.
- **Do NOT use loose granular sand for the sort** — see the finding above.
