# Design 7 — QUARTER (Tilt 2): content system for the tap-to-rotate-the-world core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status: ← THE NEXT PRODUCT (decided 2026-07-11, see [`ROADMAP.md`](ROADMAP.md)).** Core-check **BUILT + VERIFIED + FEEL-PASSED** at `prototypes/16-quarter.html` — the gravity-vector-tween rotation (marble tumbles LIVE through the turn) works and passed Qi's feel-test ("high quality"). All 3 levels solve at par, proven by an exhaustive {L,R}-sequence search through the real engine via `__game.turn` — **which also caught the original L2 as unsolvable** (fixed: pit moved under the boulder side; the verified minimum RLLLL became the new par 5). That live catch is this design's verifier thesis demonstrated end-to-end; build the production verifier from that exact pattern. Base engine is the **shipped Tilt app** (App Store, v1.0): marble physics, circle-vs-grid collision, settle detection, flood-fill seal detector, level-select/medal/Firebase/iPad shell all exist and get forked, not rebuilt. Positioned as a true App Store sequel ("Tilt 2"): same marble-and-hole soul and zero-word legibility, accelerometer swapped for a discrete rotation verb.

**Path & ceiling:** procedural, Water-Sort scale — **~1,500–2,500 levels** realistic for a solo dev. The cleanest verification story in the studio: the action space is *finite sequences over two symbols*, so certification is **exhaustive full-engine tree search, no bot policy at all** — the exact fix for the discrete-solver-is-wrong-oracle scar, because the "solver" IS the continuous engine.

## Core (one verb, no second control)
One-thumb **tap-to-rotate**: tap the LEFT half of the screen and the whole arena turns 90° counter-clockwise; tap the RIGHT half, 90° clockwise. Gravity always points screen-down, so during and after every quarter-turn the marble — and every loose thing with it: boulders, twin marbles, crumble blocks, glass shards — tumbles, rolls, and re-settles under full continuous physics. Win = the marble comes to rest in the goal hole. Par = quarter-turns, not time. Undo = restore the physics snapshot taken before the last tap (positions + velocities + element states) — cheap, cozy, and only possible *because* the action is discrete.

**Feel gate (the moat, non-negotiable):** the turn is animated over ~0.35 s with physics LIVE the whole time — the marble is never frozen, never teleported. Implementation that keeps it numerically clean: bodies and walls stay in board space; on tap, tween the **gravity vector** from 90°-off back to "down" while the renderer rotates the board by the same tween angle, so gravity is always screen-down. Walls never move, only `g` rotates; at tween end quantize the angle to exactly 90° (no drift). The BACKGROUND and chrome stay fixed (Tilt lesson: keep the board's frame stable) — only the board rotates, inside a rounded square frame. If the turn feels like a slideshow or the marble freezes, the tumble moat dies — feel-test on device in week 1, kill criterion.

**Arena geometry constraint:** the arena is a **square N×N grid** (N = 9–13 by chapter) — a 90° rotation must map the arena onto its own bounding box. Marble diameter ≈ 0.6 cell so 1-cell corridors are passable. Level spec is tiny: wall bitmap + element placements + objective + par ≈ 200 bytes JSON.

**Hook:** *Tap left, tap right — turn the whole world a quarter at a time and let everything tumble. Tilt's marble, now a puzzle you can outsmart.*

**Why it scales best-in-pool:** the verb is DISCRETE, so (a) constraint-tightening is literally par arithmetic (Lever 1 for free); (b) the entire reachable game tree fits in ≤16 K nodes → **exhaustive certification** with the real engine, flipping the content math from "hand-certify 30 levels" (Tilt's ceiling) to "machine-certify thousands"; (c) the verifier is cheap enough (~1–2 s/level, see below) to run **on the phone**, enabling a no-backend daily that is provably fair client-side; (d) it inherits a shipped shell, so ~70% of app-level work already exists.

## Element ladder (introduce one per ~5–8 levels, then remix; cap NEW at T8; each rung is ONE physics rule)
| Tier | Levels | Element (the one rule) | Teaches |
|---|---|---|---|
| T0 | 1–6 | marble + walls + goal hole | tap = quarter-turn; tumble; settle; undo |
| T1 | 7–14 | **boulder** — 2nd dynamic body, ~6× marble mass, high friction | multi-body sequencing; boulders block corridors and plug hazards |
| T2 | 15–22 | **glass pane** — static segment; callback: impact impulse > threshold → shatter | manage fall height; break on purpose or protect |
| T3 | 23–30 | **ice strip** — friction constant ~0.02 on tagged cells | marble won't rest there; momentum carries across turns |
| T4 | 31–40 | **moss pad** — contact callback: kill tangential velocity (friction ~3, rest 0) + REMIX T1–3 | park mid-wall and survive the next rotation — first combo band |
| T5 | 41–50 | **one-way flap** — hinged kinematic; contacts ignored from the pass side | irreversibility; taps become spendable; plan before you turn |
| T6 | 51–62 | **twin marble** — 2nd marble body (+ its own hole) | parallel routing; split/merge streams with the same taps |
| T7 | 63–74 | **crumble block** — static cell → becomes dynamic 0.5 s after first contact, then fades | delayed route-opening; touch-then-return plans |
| T8 | 75–88 | **spring pad** — surface restitution ~1.6, kicks along its normal — last NEW element | surfaces can ADD energy; launched hops mid-tumble |
| T9 | 89–110+ | NO new elements: mirror/rotate the spec, CW-only / CCW-only levels, bigger grids, FULL remix | combinatorial payoff → endless/daily |

## Objective variety (predicates on settled world state; 7)
sink (marble at rest in hole — baseline) · sink-both (twins, any order) · order (twins in sequence / lit pads in order) · collect-N (pass through N stars, then sink — doubles as the 3-star tier) · plug (BOULDER at rest in its socket; phased variant: plug then sink) · intact (sink with zero glass broken — escort class) · shatter-all (break every pane — clear-all class). Hazard-avoid is a fail-state blocker, not a predicate. Phased chains (goal B gated behind goal A) ≈ 2× at ~1.3× cost.

## Blocker / modifier catalog
hazard hole (void — marble lost → auto-undo offer) · spikes (same, wall-mounted) · one-way flap · locked gate + key token (touch key → gate opens; callback) · glass pane as blocker (must NOT break) · boulder as movable blocker · ice/moss as placement modifiers · **difficulty knobs:** par (min-depth+3 → +1 → exact), CW-only or CCW-only, goal-hole tolerance 1.0→0.75→0.6× marble, marble size, boulder count, N (grid size). **No timers anywhere** — a turn budget IS the timer-shaped constraint, and it's spatial. Unlimited taps to merely finish (Tilt convention: medals gate stars, never completion); one-way dead-ends are covered by the dead-position detector + undo (below).

## The exhaustive verifier (the design's centerpiece)
The oracle is the **same continuous engine the player runs** — a shared `engine.js` (browser + Node, `apps/moraine` pattern), fixed 1/120 s timestep, zero `Math.random` in sim, deterministic iteration order.

- **Discretized action space:** sequences over {L, R}. After each applied turn, step the engine until all bodies settle (|v| < ε for 0.5 s) or a 6 s sim cap. Depth cap D = par+2, D ≤ 12–14 → raw tree 4,096–16,384 leaves.
- **Why it's fast:** DFS **with physics-state snapshots** — each tree NODE costs one settle sim (~250 steps), not one full rollout. Plus a transposition table: quantize settled state (positions to ¼ cell, orientation mod 4, element flags) and prune converged branches (L·R often returns home). Net: ≤ 8 K settles ≈ 2 M steps ≈ **1–2 s per candidate in Node — and feasible on-device**.
- **Timing robustness (humans don't tap at settle):** for every winning sequence, 50 seeded replays (`mulberry32`) jittering each tap into [settle − 0.15 s, settle + 0.6 s] plus a tiny start-position epsilon; require ≥ 90% wins → "robust". Frame-perfect-only solutions are discarded.
- **Degenerate-exploit checks:** (1) **greedy bot** — 1-turn-lookahead toward reduced marble-to-hole flood-fill distance (port Tilt's seal detector as the metric) must NOT win within par+2, or the level needs no lookahead; (2) **monkey test** — 500 seeded random-tap rollouts (tap every ~0.4 s, mid-tumble allowed, since players can too); reject if monkey win-rate exceeds the band's ceiling (mid-air taps stay legal as expert expressiveness, but must not trivialize).
- **Accept iff:** ≥ 1 robust winning sequence at length ≤ par ∧ greedy fails ∧ monkey below ceiling ∧ every star tier has its own certified sequence ∧ no never-settle oscillation (watchdog).
- **Difficulty tag:** (min winning depth, winning-sequence density, robustness margin, count of dead subtrees = irreversible traps) → easy/med/hard bands for the sawtooth pass; **strategy signature** = hash of the winning-sequence set structure, used for de-duping near-clone levels.
- **In-game payoff of the same code:** run the DFS from the *current* state (~1 s on device) → provable "no path to win from here" → gentle shake + undo suggestion. The seal detector's promise, now exact.

## Meta-progression (solo-cheap, no backend/gacha, cozy-premium)
1. **3-star per level** (finish / ≤ par+1 / ≤ par, or star-pickup variants), every tier verifier-certified achievable.
2. **Deterministic geode album** — 1 shard per 4 levels, ~80 shards; completed geodes unlock board themes. Never random.
3. **Cosmetics** (~150 combos: ~18 marble skins × 8 board themes × ~6 turn-trail effects; skins bought with a light coin drip, 5–15/level, no paywall).
4. **Streak** = consecutive days with the daily solved; cosmetic-only rewards. Single `save.json`. Defer energy/boosters/IAP entirely.

## Difficulty curve
Sawtooth ordered by verifier tag (min-depth + solution density, NOT depth alone — density predicts human difficulty better); teach → test → twist → combine per element band; never two hard back-to-back; breather (open square, par 3, fat hole) after each spike; every 10th a "hardest-robust" of the band, every 20th a chapter finale remixing all live elements; floor 60% first-try (validate tag↔human on a small cohort before any big procedural batch). All difficulty is geometric: par, irreversibility, hole tolerance, grid size — no timers, ever (discrete verb makes them meaningless anyway).

## Daily & live-ops (no-backend first)
1. **Daily seeded challenge, certified ON DEVICE:** seed = date → `mulberry32` → generator; run the 1–2 s exhaustive verifier client-side, incrementing seed+k until accept (deterministic, so every player converges on the same level, provably fair, zero backend). Local score = turns over par; share as seed string.
2. **Weekly constraint re-skins** of 8–10 existing boards (CW-only / big-marble / half-tolerance / stars-doubled) via Lever-1 knobs — re-certify overnight, free content.
3. **Endless descent** — certified chunks stitched vertically; each chunk's exit is the next chunk's entry state (verifier certifies chunk-with-entry-velocity).
4. Firebase once-a-day snapshot leaderboard later; never real-time MP/guilds.

## Level ceiling (reasoning): ~1,500–2,500, three layers
- **A — hand-authored backbone: ~150** across T0–T9 (~15 per element band; 3–4 weeks; certified as authored, Cut's workflow). This anchors chapters 1–10 and IS the taste-proof before any generation.
- **B — verified procedural: ~500–700 shipped campaign levels.** Generator = seeded grid carving (drunkard-walk walls + per-band element recipes) → certify at 1–2 s/candidate → thousands of candidates/hour; expected accept ~15–25% into target bands; then two prune passes: strategy-signature dedup + the Cut audit rule — **a level is distinct only if its screenshot looks different.** Honest note: hand backbone is ~20–30% of the first 500 (playbook floor) but a shrinking share beyond — past ~800 the campaign should stop growing and content shifts to layer C.
- **C — permutation + live:** ×3 star tiers on every board, mirror/rotation-of-spec variants (free re-certify), CW-only re-skins, daily seed, endless descent → perceived content well past 2,000. Binding constraint is procedural sameness on small square grids, not certification throughput — which is why B is capped and C carries the long tail.

Hand-authoring alone caps ~250 (Tilt proved ~30 was already expensive to hand-certify); the exhaustive verifier is the entire reason this sequel exists.

## Solo-dev feasibility: HIGH (~70% exists; the app is a fork of shipped Tilt)
Reuse: Tilt's marble/grid collision, settle detection, flood-fill seal detector, level-select frontier + medals + Settings + Firebase + iPad scale-up shell, native audio; Cut's `scripts/dev/fairness.cjs` as the certifier-harness reference (certify + attribution + watchdogs); `apps/moraine` engine-as-module pattern; deploy/TestFlight scripts as-is. **Build order:**
1. **Week 1 — feel spike (kill gate):** fork Tilt's sim into `apps/quarter` with shared `engine.js`; replace accelerometer with the gravity-vector tween + left/right tap; square arena; deploy to phone. If the 0.35 s live-physics turn doesn't feel great, stop here.
2. T0–T2 elements + 20 hand levels + undo snapshots (serialize ALL mutable state: bodies, flaps, glass, stars) → vertical slice.
3. **Verifier** (`scripts/dev/fairness.cjs` sibling): snapshot-DFS exhaustive certifier + transposition table + timing-jitter robustness + greedy/monkey checks; wire into `scripts/dev/test.sh`; certify existing hand levels; keep every regression it catches.
4. Elements T3–T8, one at a time (each is a constant/callback/body: 2–4 hrs code + ~15 certified hand levels).
5. Generator + strategy-signature dedup + screenshot-distinct audit + sawtooth ordering pass → chapters to ~500–800.
6. Meta (geodes/skins/streak), on-device daily, Capacitor wrap in Tilt's shell, screenshots, TestFlight. Rough total: **7–9 weeks** to a big certified campaign — no new tech, no build step, no 3D.

## Risks
- **The turn animation is the whole moat.** If physics pauses during the tween, or the board rotation reads as a screen-wipe, it's a lifeless block-pusher. Gravity-vector tween keeps sim live by construction; week-1 device feel-test is a hard kill gate.
- **Mid-air tap spam trivializes levels** (continuous steering through the back door). The monkey test catches it per-level; if it's systemic, add a rotation cooldown until |v| < threshold or 0.6 s — a constraint, never a second control.
- **Determinism drift** breaks the exhaustive guarantee: one engine module for browser+Node, fixed timestep, no sim randomness, gravity angle quantized to exact 90° at tween end, snapshots as typed arrays. Add a determinism regression test (same seed → identical state hash after 10 K steps) to `test.sh`.
- **Procedural sameness on small square grids** — the real ceiling-setter. Mitigations: per-chapter element recipes, strategy-signature dedup, screenshot-distinct rule, 150-level hand backbone, capping campaign at ~800 and pushing volume to daily/endless.
- **Undo vs stateful elements** — a snapshot that misses one flag (broken pane, opened gate) corrupts replays AND the verifier. Single source-of-truth state object, serialized whole; verifier round-trips it every node, so drift fails loudly in CI.
- **Difficulty-tag ≠ human difficulty** — min-depth alone misleads; weight solution density and dead-subtree count, and validate the first 100 ordered levels on a human cohort before generating thousands.
- **Sequel differentiation** — must read as new next to Tilt in 5 seconds: tumbling boulders/glass in the icon and first levels, "Tilt 2" framing, same art language but rotation-first level shapes (spirals, S-bends) impossible in Tilt.
- **Motion comfort** — a full-board 90° spin can queasy some players: keep background/chrome fixed, 0.35 s ease-out, optional "reduce motion" setting (snap + settle) that the verifier already models (settle-timed taps).
