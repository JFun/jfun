# Portfolio roadmap — ranking, feel-test verdicts, and the decided build sequence

*Status as of 2026-07-11. This is the "what to work on" doc; the playbook ([`README.md`](README.md)) is the "how".*

## The decision (approved by Qi)

1. **Build QUARTER (Tilt 2) next** — from [`design-7-quarter.md`](design-7-quarter.md), prototype `prototypes/16-quarter.html`.
   Why first: reuses the shipped Tilt engine + app shell + sequel positioning (~70% exists); the cheapest exhaustive verifier in the portfolio ({L,R} tap sequences → full-engine tree search); fastest path from prototype → App Store. **Build the reusable physics-faithful verifier INSIDE this project** — Quarter is where verification is easiest, and the verifier then becomes studio infrastructure.
2. **Then RATTLE as the flagship** — from [`design-4-rattle.md`](design-4-rattle.md), prototype `prototypes/13-rattle.html`.
   Highest ceiling anywhere (2,000–5,000 verified levels), proven blast-genre demand, genuine differentiation (real avalanches vs. the genre's scripted grids). Start it once the Quarter-proven verifier exists to de-risk its content pipeline.

A new session starting "the product": read `README.md` (playbook) → `design-7-quarter.md` (spec) → play `prototypes/16-quarter.html` (the verified core) → follow the design's build order. The Tilt app (`apps/tilt`) is the engine/shell to fork; its memory-worthy gotchas live in the app's CLAUDE.md and the design doc.

## Live-app depth track (2026-07-12): Tilt 1.x

Qi flagged that shipped **Tilt** lacks longevity depth and proposed slopes / floors / planets — all adopted in adapted form. The full plan is [`tilt-depth.md`](tilt-depth.md): 7-element world ladder (ice → sand → wind → bumpers → bowls/domes → wells+grates → plates), planets as one-element-per-chapter structure, Qi's **wells** multi-floor design, a physics-bot certifier (`certify.cjs`), board-free meta (feats/gems/diamond/daily), and a hard Tilt-vs-Quarter split (Tilt = continuous dexterity + field elements; Quarter keeps commitment puzzles + undo + thousands-scale). **Quarter remains the next product** — only Tilt Phases 0–2 (meta + plumbing + certifier) run before/between Quarter milestones.

## Feel-test verdicts (Qi, on device/browser)

- **2026-07-11 — all five round-2 core-checks PASSED**: Rattle, Sluice, Tuck, Quarter, Poise — "high quality ones." First round ever with zero cuts (round 3 lost 6 of 11). What changed: longevity-led, verifier-first design docs BEFORE building, and every level solve-checked with the real engine before the feel-test.
- Earlier signals: Cut "looks cool" → promoted to `apps/cut`. Slingshaft core verified + kept. Granular Sort dropped (jumbled; duplicated Pour) → folded into Pluck. Topple "smash fest — cut unless differentiated" → on probation with the sleeping-cat twist. Round-3 cuts: Mosaic/Prism/Pan/Contour/Sway/Dowse (failed one-glance-goal).

## Full portfolio ranking (2026-07-11)

**Tier S — build a real game from these**
| # | Prototype | One-line case |
|---|-----------|---------------|
| 1 | **Quarter (Tilt 2)** — `16-quarter.html` | Best bet, not biggest ceiling: shipped engine/shell reuse, exhaustive verification, sequel economics. **← NEXT** |
| 2 | **Rattle** — `13-rattle.html` | Biggest swing: 2,000–5,000 ceiling, blast-genre demand, avalanche differentiation. **← AFTER, with the verifier** |
| 3 | **Sluice** — `14-sluice.html` | Best single moment (the avalanche); exhaustive gate-permutation verification; geometry-fiddly levels demand the verifier pipeline first (2 of its 3 core-check levels shipped mistuned until solve-checked). |

**Tier A — strong, second wave**
4. **Poise** — `17-poise.html` — most differentiated (true white space); niche-audience risk.
5. **Pluck (as Sort core)** — `03-pluck.html` + [`design-2-sort.md`](design-2-sort.md) — cheapest 1,500+ level ship; "just Water Sort" perception risk; good quick second title.
6. **Tuck** — `15-tuck.html` — coziest brand, unowned material; shallowest puzzle depth of the five + device cloth-feel unproven; depth-probe before committing.
7. **Slingshaft** — `12-slingshaft.html` — verified and scalable but least novel; parts overlap Drop; keep as engine/reference.

**Tier B — keep, not next:** 8. Drop (`11-drop.html`, roguelite lane real, biggest design lift) · 9. Pour (`02-pour.html`, feel toy — fold its juice into Sort/Sluice) · 10. Topple (`08-topple.html`, on probation, lowest ceiling).

**Tier C — recommend archiving:** Fold, Unblur, Restore, Cascade (`09/04/05/07`) — 2/5 differentiation, expensive content pipelines, no enthusiasm signal across three rounds.

## Board prune — EXECUTED (2026-07-11, decided by Qi)

The board went 17 → 8 cards; every remaining card is a live candidate.
- **Graduated** (not cuts — they live in `apps/` now): **Excavate** (`apps/excavate`, shipped), **Cut** (`apps/cut`, 53-level campaign).
- **Dropped:** Pour, Unblur, Restore, Sling, Cascade, Topple, **Drop** (Qi took the stricter line and cut the roguelite too). **Fold was kept** (Qi's call — not in the drop list).
- **Remaining 8:** Pluck (03), Fold (09), Slingshaft (12), Rattle (13), Sluice (14), Tuck (15), Quarter (16), Poise (17).
- Recovery: every dropped file is in git history — `git show 6030402:prototypes/<file>` (the last commit with all 17). Per studio rule, if a dropped concept returns, PORT the old prototype, don't reimplement.

## Verification learnings from the round-2 core-checks (why the verifier is non-negotiable)

Of five fresh physics prototypes, **three shipped with unwinnable or mistuned levels**, all caught by driving the real engine headlessly through each game's `__game` hooks:
- **Sluice L1**: the splitter peg missed the ballistic stream (18/2 bin split, unwinnable) → peg moved into the stream. **L2**: delivery shelf too shallow (5.5°, half the pool stalled) → steepened + quota matched to verified flow.
- **Quarter L2**: exhaustive {L,R} search proved it unsolvable at any depth ≤5 → layout fixed; new verified minimum (RLLLL) became the par.
- Rattle, Tuck, Poise worked as built.

**Standing rule:** every physics level — even in a prototype — gets a same-engine solve check before a human plays it. Every prototype exposes `window.__game = { state, stepN, reset, goto, ...action hooks }` so this is always possible headlessly.
