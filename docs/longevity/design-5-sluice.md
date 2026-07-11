# Design 5 — SLUICE: content system for the terraced marble-cascade core

> Read [`README.md`](README.md) first (the levers + anti-patterns this design applies).

**Status:** design-only — no prototype yet (judged top-5 of 30 candidates, 24.6/30). Nearest reusable code: `prototypes/02-pour.html` (granular circle sim = the marble medium, fixed 1/120 step, settle feel), `prototypes/11-drop.html` (circle-vs-static collisions, pegs, bins), `apps/cut/scripts/dev/fairness.cjs` (the reference physics-faithful certifier — Sluice's verifier is a port of its patterns onto a *smaller* action space), `apps/moraine` (shared browser+Node engine module pattern). First deliverable is a single-file core-check prototype per studio conventions.

**Path & ceiling:** procedural, Water-Sort-scale. **~1,500–2,500 levels** realistic for a solo dev. The cheapest verification on the roster — the action space is a *finite permutation set*, so certification is exhaustive, not sampled. Market angle: the sort/screw genre's physics evolution (sort/screw IAP ≈ $87M in Q1 2025), with no owner of the cascade fantasy since Maxis's *Marble Drop* (1997).

## Core (one verb, no second control)

A portrait mountainside of **terraces** — static ledges, basins, and channels descending toward quota **bins** at the bottom. 40–60 real simulated marbles start **pooled** behind closed **gates** on the upper terraces. The one verb: **TAP a gate** → it swings open (one-shot, stays open forever). The pooled marbles avalanche downhill — through sieves, past boulders, spinning water wheels, smashing dams — then the world **settles**. Tap the next gate. Win = rest-state predicates read off the settled world: bin quotas shown as **pips** on each bin (reads at one glance, like Water Sort's bottles). Star runs = win using **fewer gates** than the level provides.

You never touch a marble. The medium self-routes; the strategy is **which gates, in which order** — a wrong early gate floods the sieve before the dam is broken, or spends your flow into the hazard pool. Base rule: taps are accepted only when the world is settled (gate handles pulse when ready), so every decision is made on a readable, static board. Late-campaign `liveTaps` levels relax this — tapping mid-cascade splits the stream (still the same tap, never a new input).

**Hook:** *Open the gates in the right order and watch the mountain empty itself — the avalanche is the reward, the order is the puzzle.*

**Distinct from the roster:** Pluck/design-2 sorts by picking INDIVIDUAL pebbles (unit-level verb); Pour aims a continuous stream (continuous verb); Drop is placement onto pegs. Sluice's verb is discrete gate CHOICE — the marbles are never the input, so it dodges the jitter-not-strategy trap by construction: only order can matter.

**Why it scales (and verifies) best-in-class:** the action space is *finite and tiny* — G gates (3–7) → ordered subsets, e.g. G=5 → 325 orders — so the verifier **enumerates every possible play** with the real engine instead of sampling a continuous space. Constraint-tightening (gate budget, quota slack, spotless) is free (Lever 1). Elements are one material constant / collision callback / body each (Lever 3). Objectives are rest-state predicates over bins and basins (Lever 2) — trivially checkable on a settled world. Terrace heightfields are seeded, so geometry/gravity/mirror permutation is free (Lever 5). And levels compress to a tiny JSON spec, so an overnight generator batch is thousands of candidates (the Cut overnight-batch shape).

## Element ladder (introduce one per ~8–12 levels, then remix; cap NEW at T7)

| Tier | Levels | Element | Teaches |
|---|---|---|---|
| T0 | 1–6 | terraces + pooled marbles + gates + quota bins | tap opens; flow runs downhill; pips fill; settle-then-tap rhythm |
| T1 | 7–14 | **breakable dam** (static wall, impulse HP: shatters when accumulated impact impulse ≥ threshold) | flow has MASS — a trickle taps it, a merged avalanche smashes it; order two pools to arrive together |
| T2 | 15–24 | **sieve grate** (static bar row; collision filter passes marbles r < gap) + small/large marbles | routing by SIZE — one flow splits into two destinies |
| T3 | 25–34 | **water wheel** (free-spinning dynamic rotor with paddles; marble impacts spin it; paddles fling/ferry marbles across a gap) | flow RATE is energy — a slow drain stalls the wheel, a full pool flings marbles to the far terrace |
| T4 | 35–46 | **boulder** (single heavy dynamic ball, ~25× marble mass) | the medium moves the blocker — enough marbles shove it off a channel mouth (or into one, plugging it) |
| T5 | 47–58 | **paint pad** (zone callback: marble rolling through changes color) — band twist: `liveTaps` debuts | route THROUGH to recolor for color quotas; mid-flow taps split a stream in two |
| T6 | 59–70 | **ice terrace** (friction ≈ 0.02 patch) | overshoot — marbles skate past the near basin and land in the far one; ice turns a safe ledge into a decoy |
| T7 | 71–84 | **geyser channel** (zone with clamped constant upward force) | uphill routes and loops — non-monotonic flow; last NEW element |
| T8 | 85–110+ | gravity tilt (±10–20°) / mirror + FULL remix T1–7 | permutation band → combinatorial payoff, feeds endless/daily |

Every element is ONE physics rule (an HP counter callback, a radius collision filter, a free rotor body, a heavy body, a color callback, a friction constant, a force zone). None adds an input. `liveTaps` is a constraint relaxation flag, not an element.

## Objective variety (rest-state predicates on the settled world)

1. **QUOTA** (base): each marked bin holds ≥ N marbles at rest (`bin.count >= quota`). Pips fill live.
2. **COLOR QUOTA**: bin holds ≥ N of color c — combines with paint pads and sieves (`count(bin, color) >= N`).
3. **EXACT-FILL**: bin holds exactly N; the bin has an overflow lip into a drain, so overshooting fails (`bin.count === N`).
4. **CLEAR THE MOUNTAIN**: no marble stranded on any terrace — everything in bins or the drain (`strandedCount === 0`).
5. **AVOID-ZONE**: zero marbles at rest in the hazard basin (thorns/tar) (`hazard.count === 0`) — the wrong order dumps a pool straight into it.
6. **DEMOLITION**: every dam broken at rest (`dams.every(d => d.broken)`) — obstacles AS objectives.
7. **FLOAT THE LOCK**: fill basin X until its wooden duck-float rests above the marked line (`float.y <= lineY` at settle) — a fill-height predicate, cozy and instantly legible.

Phased objectives (predicate B only counts after A is met) multiply these at ~1.3× cost. All are pure functions of the settled state — no path tracking needed except stranded/hazard entry, which are settle-time positions anyway.

## Blocker / modifier catalog

breakable dam (HP threshold) · sieve grate (gap size) · water wheel (paddle count, ratchet direction) · boulder (mass, start seat) · paint pad (target color) · ice patch · geyser (force, zone height) · one-way flap (passes downhill only, free-swinging) · overflow lip + drain · hazard basin · decoy gate (opening it early dooms the run — required by the verifier, see below) · marble sizes (r 9 / 14 px) · colors (cap 4, colorblind-safe + pattern tags) · pool sizes (8–25 marbles each) · gate count 3→7 · **gate budget** (all → −1 → minimum) · `liveTaps` flag · gravity tilt · mirror · quota slack (loose → tight) · spotless flag (no marble lost to the drain).

## Meta-progression (solo-cheap, no backend/gacha, cozy-premium)

1. **3-star per level, verifier-certified:** 1★ win with all gates · 2★ win within the gate budget · 3★ budget + spotless (or exact-fill margin). Same layout, three plays — Lever 1.
2. **Deterministic album — "Creatures of the Sluice":** 1 critter card per ~4 levels (ducks, newts, otters that appear in the settled pools), ~50 cards in biome pages; completing a page unlocks that biome theme. Fixed drops, never gacha.
3. **Cosmetics:** ~160 combos — ~10 marble skins × 4 terrace biomes (alpine / jungle / desert / glacier) × 4 water tints/trails. Coin trickle 5–15/level, skins 100–500. No paywall, no energy. Single `save.json`.

## Difficulty curve

Sawtooth over verifier tags (see below); teach → test → twist → combine inside each element band; never two hard back-to-back; breather (loose quota, generous budget, 3 gates) after each spike; every 10th a hardest-solvable of the band, every 20th a chapter finale combining the band with all priors; floor 60% first-try win. Difficulty comes from **order depth** (gates 3→7, decoy count, dam/wheel dependencies that force merges), **quota tightness** (slack shrinking from +6 to +2 marbles), and **budget** — never timers. `liveTaps` timing pressure only in the final ~25% and events.

## The physics-faithful verifier (exhaustive, not sampled)

The same continuous engine the player runs (shared `engine.js`, browser + Node), stepped at fixed 1/120s, seeded `mulberry32` — never a discrete solver. What's *different* here: the action space is small enough to **enumerate completely**.

**Discretized action space.** A play = an ordered subset of the G gates (order matters; you may stop early). Count = Σₖ P(G,k): G=4 → 64, G=5 → 325, G=6 → 1,956, G=7 → 13,699. Base levels tap at settle, so a play is *fully determined* by its order — one rollout each. `liveTaps` levels run each order under 2 coarse timing policies (SETTLED: tap when at rest; EAGER: tap 0.8s after the previous tap) → ×2 rollouts. G=5 live level ≈ 650 rollouts — the candidate's headline number. Cap enumeration at G=6 for live levels; G=7 only for settled levels or budget-restricted enumeration (orders of length ≤ budget+1).

**Rollout mechanics.** Headless Node steps ~60 circles + static segments at 100–400× real time; a full cascade is 10–25 sim-seconds, so full certification of a level is **seconds** (the overnight-1,000-candidates shape from Cut). Every rollout asserts full settle within 30 sim-seconds (all |v| < ε for 0.5s, all wheels |ω| < ε) — a never-settling state (free-spinning wheel, jittering marble in a crease) is an auto-reject plus a logged stuck-class, exactly the watchdog pattern in `fairness.cjs`.

**Acceptance (a level certifies iff ALL of):**
1. ≥1 winning order exists **within the 2★ gate budget**.
2. **≤30% of all orders win** — order must actually matter; above that it's a screensaver.
3. The **greedy top-down policy fails** (opening gates strictly highest-elevation-first) — the "obvious" play must not be a solution.
4. No single-gate order wins when budget > 1 (no degenerate shortcut).
5. ≥1 **decoy gate** exists: some gate whose opening as the first move makes every completion lose.
6. **Noise robustness:** every winning order is re-run under **20 seeds** (jittered marble start packing); it must win in ≥18/20 AND with mean quota surplus ≥2 marbles (chaos margin — a quota of 12 must typically receive ~14). Orders that pass only at 0 margin are demoted to non-winning.
7. Star tiers each independently satisfiable: 3★ (spotless/min-gate) must have ≥1 robust order too, or the level ships as 2★-max.

**Difficulty tag** (feeds the sawtooth ordering pass): `winRate` = robust winning orders / total orders → easy >15%, medium 5–15%, hard 1–5%, expert = exactly 1–2 robust orders. Secondary tags: min gates used, whether EAGER timing is required, element-usage vector of winning orders (win-strategy attribution, ported from Cut's certifier).

**De-dup by strategy** (the Cut audit lesson — "a level is distinct only if a screenshot looks different," here: only if the *winning order structure* differs): fingerprint = (multiset of winning orders truncated to first two gates, element-usage vector, bin-arrival histogram). Reject candidates whose fingerprint matches a kept level in the same band.

## Daily & live-ops (no-backend first)

1. **Daily seeded cascade** — `mulberry32(dateSeed)`, same board for everyone, certified in-app before serving (enumeration is cheap enough to run ON DEVICE — a unique live-ops luxury of this design); share-text compares gates used + spotless.
2. **Weekly re-contexts** of ~10 campaign levels via Lever-1 knobs (budget −1 / tilted gravity / tight quota / liveTaps on).
3. 7-day streak → deterministic cosmetic (marble skin).
4. Defer leaderboards to a Firebase once-a-day snapshot; never real-time MP/guilds.

## Level ceiling (reasoning): ~1,500–2,500, three layers

- **A — hand-authored backbone:** ~110–130 across the 9 tiers (~12–18 per element band, 3–4 weeks). Ships first; proves the core is fun before any generation (playbook anti-pattern #6).
- **B — verified procedural:** generator emits terrace heightfields (3–6 shelves as a channel graph), pool assignments, tier-weighted element decks, gates on channel mouths → tiny JSON specs. Enumeration certifies each candidate in seconds; expected keep-rate 10–20% (the acceptance rules — greedy-fails + ≤30% + decoy — are deliberately strict). An overnight batch of ~5,000 candidates → ~500–1,000 keepers; two batch rounds with band re-weighting and strategy de-dup → **~1,200–2,000 distinct-strategy levels**. Nominal multiplier math (7 elements × 7 objectives × 3 budget tiers × mirror/tilt) is far larger, but de-dup is the honest limiter — count only levels whose winning order structure differs.
- **C — permutation:** 3-star replays + gravity/mirror/biome re-skins + daily push perceived content past 3,000 plays.

Hand-authoring alone caps ~250; enumeration (not sampling) is *why* the tail is cheap here — cheaper than Slingshaft's 4,800-shot sweep and far cheaper than Sort's beam policy.

## Solo-dev feasibility: HIGH (~60% engine exists; verification is the cheapest on the roster)

`02-pour` proves the granular circle medium at scale on our stack (fixed 1/120 step, settle feel, pooled particles, WebAudio, headless `__game`); `11-drop` has circle-vs-static + bins; `apps/cut/scripts/dev/fairness.cjs` is the certifier to port (seeded sweeps, watchdogs, win-strategy attribution, `land`-style probes); `apps/moraine` proves the shared-module pattern. **Build order:**

1. **Core-check prototype** (single file, a weekend): 3 hand levels — terraces, 2–3 gates, ~45 marbles, quota pips, settle detection, tap-when-settled rule, `window.__game = { state(), stepN(n), reset(), goto(l), tapGate(id) }`. The go/no-go question: *is watching the avalanche settle into the bins inherently satisfying?* Feel-test on device.
2. Extract shared `engine.js` (browser + Node): marble integrator, spatial hash, static segments, gate kinematics (0.25s ease-out swing), settle detector, level-spec loader.
3. Elements one at a time (each 2–4 hrs: a constant, a callback, or a body) with 12–18 hand levels per band (Levers 1–3). Legibility pass: pips + color counts live-update; marbles ≥ 9px radius at 390pt width.
4. **Verifier** as `scripts/dev/fairness.cjs`-alike + `scripts/dev/test.sh`: permutation enumerator, acceptance rules 1–7, tags, de-dup. Golden-trajectory test Node-vs-browser (determinism net).
5. Generator (heightfield/channel-graph + element deck) → overnight certified batches → sawtooth ordering pass.
6. Meta (stars, album, cosmetics), daily seed, Capacitor wrap (clone the Cut/Tilt shell, team `Y3T546NP6T`, fresh-install deploys).

No new tech, no build step, no 3D. WebAudio-synth marble clatter (granular ticks scaled by impact count), pip chime, dam crack, wheel creak; slow-mo + glow on the quota-completing marble.

## Risks

- **"It plays itself" (idle-cascade trap)** — if order barely matters, Sluice is a screensaver, not a puzzle. This is the #1 risk and the acceptance rules exist for it: ≤30% of orders win, greedy top-down must FAIL, a decoy gate must exist. Kill the project at step 1 if hand levels can't make order feel consequential.
- **Chaos vs. fairness** — 60-marble outcomes are noisy at the margin; a quota met by 1 marble in the author's run fails on the player's. Mitigation is structural: quotas certified with ≥2-marble mean surplus and 18/20 seed robustness; never ship a knife-edge level.
- **Settle pacing** — if cascades take >6–8s to settle, the tap-when-settled rule feels like waiting. Tune damping/friction so cascades resolve in 3–5s; instant (<1s) restart; wheels get angular damping so they can't spin forever (also the verifier's watchdog).
- **Legibility at 40–60 marbles** — small screens jumble. Cap colors at 4 with pattern tags, two sizes only, big pips, count badges on bins; feel-test legibility on device, not desktop.
- **Never-settle / tunneling edge cases** — wheels, geysers, and ice re-open the classic traps; every element callback ships with a "world always settles or the rollout rejects" assertion in the regression net (keep tests once green — Cut's rule).
- **Cross-platform determinism** — Node cert vs. WKWebView play must match; pin the 1/120 step, golden-test trajectories (same net as design-2).
- **Genre-clone perception** ("marble Water Sort") — the avalanche feel and dam/wheel physics are the moat; they must feel exceptional or the pitch collapses to its comps. Feel-first, device-first.
- **Element saturation** — cap NEW elements at T7 (geyser); T8+ is gravity/mirror/placement permutation, never element #8.
- **Feel unprovable headless** — the verifier proves fairness and order-mattering, never fun. PNG-render after UI changes; device feel-test before each band ships.
