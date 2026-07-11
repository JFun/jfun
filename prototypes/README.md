# Prototypes — the candidate board

Eight playable single-file web games; every card is a **live product candidate** designed for hundreds+ levels. The ranking, feel-test verdicts, and decided build sequence live in [`../docs/longevity/ROADMAP.md`](../docs/longevity/ROADMAP.md) — **Quarter (Tilt 2) is the next product, Rattle the flagship after.**

Open `index.html` for the review board (plays inline, with market notes per card), or open any file directly. Every prototype exposes `window.__game` hooks so the real engine can be driven headlessly (the studio's solve-check rule: every level is verified with the same engine before a human plays it).

## How to run

Open `prototypes/index.html` in any browser (double-click works — it's all `file://`-safe), then tap a card.

## The candidates

03. **Pluck** — `03-pluck.html` — dig pebbles from a real shifting heap into matching bowls. Also the studio's SORT core (discrete units hold clean layers; see `docs/longevity/design-2-sort.md`).
09. **Fold** — `09-fold.html` — you are the wind: every swipe slides the whole flock AND the wolf; pen every sheep before dawn.
12. **Slingshaft** — `12-slingshaft.html` — pull back, release: one flick ricochets a ball through a walled arena into the goal cup (`docs/longevity/design-3-slingshaft.md`).
13. **Rattle** — `13-rattle.html` — tap a same-color cluster to pop it; the pile avalanches and re-clusters under real gravity (`design-4-rattle.md`). **← the flagship after Quarter**
14. **Sluice** — `14-sluice.html` — open gates in the right order; marbles avalanche down terraces into bin quotas (`design-5-sluice.md`).
15. **Tuck** — `15-tuck.html` — release pins; a real cloth drapes over the sleeping cat (`design-6-tuck.md`).
16. **Quarter** — `16-quarter.html` — tap left/right rotates the whole world 90°; everything tumbles live (`design-7-quarter.md`). **← THE NEXT PRODUCT (Tilt 2)**
17. **Poise** — `17-poise.html` — hang weights on a Calder mobile until every beam sits level (`design-8-poise.md`).

## History

- **Graduated to `apps/`:** Excavate (shipped), Cut (53-level campaign), Tilt (App Store — never a board card).
- **Dropped 2026-07-11** (prune to candidates-only): Pour, Unblur, Restore, Sling, Cascade, Topple, Drop.
- **Earlier cuts:** Mosaic, Prism, Pan, Contour, Sway, Dowse (round 3 — failed the one-glance-goal test); granular Sort (folded into Pluck).
- Any dropped file is recoverable: `git show 6030402:prototypes/<file>` (or the merge commit of its round).
