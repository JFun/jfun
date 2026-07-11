# Content-longevity playbook + three implementable designs

**Purpose of this folder:** give a fresh session everything it needs to build a jfun physics game that stays fun for *hundreds* of levels — not just a demo. It captures (1) the research-backed playbook of "longevity levers," and (2) three concrete, implementable content-system designs built on our physics cores.

Read this README first (the shared principles), then the design you're implementing:
- [`design-1-cut.md`](design-1-cut.md) — **Cut** (rope-cutting). Handcrafted, Cut-the-Rope path. Ceiling ~300–360. Highest feasibility (app already exists at `apps/cut`).
- [`design-2-sort.md`](design-2-sort.md) — **Physics-sort**, now built on **Pluck** (`prototypes/03-pluck.html`, discrete pebbles). Procedural, Water-Sort scale. Ceiling ~1,500–2,500. The granular-sand "Sort" core-check was dropped (it jumbled + duplicated Pour) and folded into Pluck — **use discrete units, not loose sand.**
- [`design-3-slingshaft.md`](design-3-slingshaft.md) — **Slingshaft** (drag-release launch). Procedural, small verifiable action space. Ceiling ~500–800. **Prototype verified working** at `prototypes/12-slingshaft.html`.

Round 2 (2026-07-10, from a 30-idea ideation → dedup → 3-lens judge panel; design-only, no prototypes yet):
- [`design-4-rattle.md`](design-4-rattle.md) — **Rattle** (physics tap-blast; Toon Blast with the grid ripped out — pop a cluster, the pile avalanches and re-clusters). Natively discrete action space (the clusters ARE the moves). Ceiling ~2,000–5,000 — highest in the portfolio. Judge 24.9/30.
- [`design-5-sluice.md`](design-5-sluice.md) — **Sluice** (terraced marble cascade — tap gates open in the right order, the marbles avalanche to bin quotas). Action space = finite gate permutations → exhaustive certification. Ceiling ~1,500–2,500. Judge 24.6/30.
- [`design-6-tuck.md`](design-6-tuck.md) — **Tuck** (Verlet cloth drape — release pins so the sheet falls, folds, and covers the goal). Peak cozy-brand fit; ~250–350 hand + 800–1,500 procedural. Judge 24.2/30.
- [`design-7-quarter.md`](design-7-quarter.md) — **Quarter / Tilt 2** (tap left/right to rotate the whole world 90°; everything tumbles). Forks the shipped Tilt engine+shell; action space = {L,R} sequences → **exhaustive full-engine tree search** (the definitive fix for the discrete-solver scar). Ceiling ~1,500–2,500. Judge 24.1/30.
- [`design-8-poise.md`](design-8-poise.md) — **Poise** (Calder hanging-mobile balancing — hang weights on snap-hooks; the whole mobile swings and settles). Total white space; runs on Cut's rope/pin-joint solver; snap-hooks make player and verifier action spaces IDENTICAL. Ceiling ~1,500–2,500. Judge 23.8/30.

> Source: an 11-agent research + design workflow (2026-07-06) over how Royal Match, Candy Crush, Cut the Rope, Where's My Water, Flow Free, Arrow Fest, Vita Mahjong, etc. sustain long content. Studio DNA it must respect: real physics, one-glance goals, one-thumb input, feel-first, **solo developer**, no-build vanilla-JS canvas + Capacitor.

---

## The core finding

**The verb never sustains a long game — a content-multiplier stack does.** Every long-lived casual game runs the same machine: a *small* set of elements introduced one at a time and remixed, × a handful of objectives, × star-grade tiers, × layout/gravity permutation, wrapped in a light meta. Royal Match reuses ~6 blockers (varies *placement* and *objective*, not rules); Cut the Rope turned ~8 gadgets into 380+ levels. Our feel is the moat *inside* this machine.

**Content math:** `~5 elements × ~5 objectives × 3 star-tiers × geometry/gravity permutation` ≫ anything a solo dev can hand-author. One research figure: 5 mechanics × 4 phases ≈ 1,440 variants.

---

## The longevity levers, ranked for a solo physics dev (value-for-effort)

1. **Star-grade / constraint budget** — *very low effort.* Reuse one layout across tiers by tightening a finite resource (cuts, time, goal size, collision tolerance); expose as 1–3 stars. 1 layout → 3–5× content + 3× progress states. Difficulty in physics MUST come from constraint-tightening + geometry, not input complexity (one thumb). **Build first.**
2. **Objective / win-condition taxonomy** — *low.* 5–7 predicate functions that swap the *goal* on the same board (reach / collect-N / clear-all / escort-keep-above-line / avoid-zone / order-hit / route-to-bin). Phased objectives (gate goal B behind goal A) = 2× at ~1.3× cost. Each is a small win-check on the physics world state. Multiplies orthogonally with elements.
3. **Element / gadget introduction-and-remix ladder** — *medium; the backbone.* A finite catalog (5–8), introduce ONE per ~5–8 levels with ~3–5 tutorial levels, then recombine with ALL priors. **8–15× new puzzles per element.** In physics, an "element" is a material constant, a collision callback, or a static/kinematic body the engine already supports — **never a new input rule.** Cap at ~7–8 (physics saturates the brain faster than match-3); beyond that, vary placement/geometry/gravity.
4. **Difficulty pacing: sawtooth + milestones** — *low.* An ordering pass over verifier-tagged levels: never two hard levels back-to-back; breather after each spike; floor 60% first-try win; hardest-solvable every ~10, chapter finale every ~20. Follows teach → test → twist → combine. Protects every other lever from the churn-cliff.
5. **Layout / gravity / mirror permutation** — *low-med.* Gravity is a *free variable* — rotate/flip/reshape the arena. A whole variety axis, gated only on re-verification.
6. **Meta-progression** (collection / cosmetics / renovation) — *medium (art-heavy).* Off-board persistent rewards → +500–1000% engagement on the *same* layouts. Deterministic drops (1 per N levels), **never gacha**. Do after the first 50–100 levels are proven fun.
7. **Retention scaffolding** — *medium.* Streaks + no-paywall cosmetics: YES (cheap habit, fits cozy taste). Energy gates / boosters / battle passes: DEFER or skip (clash cozy taste, monetization-first).
8. **Procedural generation + physics-faithful verifier** — *high (2–4 weeks); the key studio unlock.* The ONLY path past ~250 hand-authored levels → effectively unbounded. **Build it once, reuse across every game.** See below.
9. **Live-ops event reuse** — *medium.* Re-frame existing levels into time-boxed contexts (daily seed, weekly constraint re-skin, seasonal). Start with a **no-backend daily seed**; defer leaderboards to async once-a-day snapshots. Never real-time PvP/guilds.

**Ranked build order for a solo studio:** 3 (stars) → 2 (objectives) → 1 (element ladder) → 4 (sawtooth) → 5 (geometry/gravity) → 6 (meta, after 50–100 levels) → 7 (streaks) → 8 (verifier, when going past ~250) → 9 (daily seed).

---

## The reusable physics-faithful verifier (the single highest-leverage investment)

To ship hundreds/thousands of *fair* levels a solo dev must generate them and certify them automatically. The verifier is a headless oracle that:
- Runs the **same continuous physics engine the player uses** (shared module, browser + Node), stepped deterministically at a fixed timestep.
- Plays each generated candidate with a bot policy (rollouts across the discretized action space), **seeded**, **500+ runs** (physics is noisy — far more than the ~100 a logic puzzle needs).
- **Accepts a level only if** the goal is reached in ≥2 of K runs AND there is no degenerate exploit AND it lands in the target difficulty band; then tags it by bot-measured difficulty for the sawtooth ordering pass.

Built once (2–4 weeks), it unlocks Sort and Slingshaft to thousands of levels and is reusable across the studio. Precedent in-repo: `apps/moraine` ships an engine as a shared browser+Node module.

---

## Anti-patterns (hard-won — several match our own scars)

- **The verifier MUST use the same continuous physics engine, seeded, 500+ runs — NEVER a discrete/logic solver.** A discrete BFS/greedy solver is the wrong oracle for continuous physics; it certifies levels the real sim then fails or trivializes. *(This independently confirms the Tilt lesson: a discrete resolver was the wrong oracle for the tilt sim.)*
- **Never add a second control.** One-thumb DNA. Every "new mechanic" is a new object / property / objective, never a new tap or gesture.
- **Cap elements at ~7–8.** Past that, vary placement/geometry/gravity, not element count.
- **Difficulty from geometry/collision/constraints, not timers.** Timers only in the final ~25% of the campaign; spatial difficulty is more satisfying.
- **Sawtooth, not a monotonic ramp.** Never two hard levels back-to-back; floor 60% first-try, or players hit a wall at ~L80 and never see L81–500.
- **Ship a hand-authored campaign FIRST, then go procedural.** The generator amplifies the core — prove the core is fun by hand (20–30% handcrafted backbone) before automating; procedural sameness must change *strategy*, not just jitter pixels.
- **No gacha, no aggressive energy gates, no guilds / real-time MP / voiced narrative.** Each is a 3–6 month solo-dev sink and/or clashes with the cozy, no-paywall taste. Async once-a-day snapshot leaderboards are the ceiling.
- **Feel is unprovable headless.** The verifier proves *fairness/math*, never *fun*. Always feel-test on device and render a PNG after any UI/feel change.

---

## Studio conventions every prototype/app follows

- Single-file (prototype) or `apps/<name>/web/` (app) vanilla-JS canvas; zero build step; wrapped in Capacitor for iOS (clone an existing shell, team `Y3T546NP6T`).
- Fixed-timestep physics (1/120s) decoupled from rAF; portrait-first; scales from canvas size; works in a 300×560 iframe and fullscreen.
- Every game exposes `window.__game = { state(), stepN(n), reset(), goto(level), ...action hooks }` so it can be driven headlessly WITHOUT rAF (the review browser suspends rAF). This is also what the verifier drives.
- WebAudio synthesized only; no external assets. See any prototype in `prototypes/` for the pattern.
