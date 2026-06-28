# Unmake — MVP Spec

> A cozy logic puzzle about taking things apart in exactly the right order. Calm,
> tactile, brain-bending. One verb: *remove*. Built to clear the validation gates
> below before any money goes into art.

## 1. Core mechanic — dependency disassembly

Every object is a hidden **dependency graph**. Each part is held by **fasteners**
(screws, bolts, clips, pins, wires) and may be **covered** by parts on top of it.

- Tap a fastener to remove it (unscrew animation + foley + haptic).
- A part lifts off only when **all its fasteners are gone AND nothing covers it**.
  Tapping a blocked part wobbles and shows what's in the way (a *wasted tap*).
- Drag to rotate — some fasteners hide on the back/underside (`revealedAfter`).

Four difficulty levers (all modeled in `Core`):

1. **Hidden fasteners** — revealed only after a covering part is removed.
2. **Fragile / tension parts** — springs, glass, ribbon cables that snap if removed
   out of order (`fragile` + `breaksIfPresent`).
3. **Limited tray slots** — hold only N loose parts; bin some before continuing.
4. **Tool swaps** — different fasteners need different tools; swaps cost an action.

**Win:** every part removed. **Three stars:** (1) complete, (2) nothing broke,
(3) efficient — no wasted taps and actions ≤ par. Two modes: **Relaxed** (no-fail,
cozy) and **Challenge** (breakage fails the level).

The `TeardownSolver` proves every object has a break-free solution and computes the
optimal **par** — fairness is a build-time guarantee, not a hope.

## 2. Meta — deliberately minimal for MVP

Don't add meta to a failing core. MVP meta is just enough to motivate continuation:

- **Collection shelf** — each finished object displayed as a tidy exploded view.
- **Star total** gates the next chapter.

Fast-follow (only after the core retains): **Daily Teardown** (one shared puzzle/day +
shareable result — the cheap organic-growth loop and the studio's prime directive),
then a salvage/craft economy as the monetizing layer.

## 3. Feel (this is the product)

Audio + haptics carry "satisfying" — invest there, not in graphics. ASMR-grade foley
per action, a calm ambient bed, a warm completion chime. Low-poly 3D, warm workshop
palette — cheap, reusable, performant, and very friendly to "oddly satisfying" ad
creatives (a real UA advantage).

## 4. Tech (this project)

- **Unity 6 LTS + URP**, Input System, Addressables, DOTween (view only).
- **Rules live in pure-C# `Core`** (`noEngineReferences`), deterministic and
  headless-testable; Unity is a thin skin. Levels are data (`TeardownObjectAsset`) with
  an authoring + validation tool. See root `CLAUDE.md` and this app's `CLAUDE.md`.

## 5. Monetization (instrument now, layer later)

MVP: rewarded video for hints/undo, one interstitial every ~2–3 levels, no aggressive
IAP — the MVP proves retention, not revenue. After validation, layer the hybrid model
(no-ads IAP, hint packs, cosmetic workshop themes, battle pass on the daily/seasons)
toward the typical 40–50% IAP profile.

## 6. Scope, team, cost (staged)

- **Gray-box prototype** — engine + tap/remove/rotate + 3 ugly levels. ~2–3 weeks.
  *Goal: is the order-of-operations puzzle fun?* (Core + solver + tests in this repo
  already cover the rules layer.)
- **Testable MVP** — authoring tool, all four levers, 12–15 levels, art + audio pass,
  collection screen, analytics, basic ads. ~2–3 months, small team (1 Unity dev who can
  design, 1 3D/tech artist, contract audio). Solo-feasible at 4–6 months.
- **Rough budget** ~$30–80k depending on art outsourcing; plan ~equal marketing spend
  in the first ~6 months. (Reference: hyper-casual MVPs run $15–50k; this is richer.)

## 7. Validation gates (build to hit these, in order)

| Gate | Threshold | Meaning |
|------|-----------|---------|
| 1 — prototype | **D1 ≥ 30%**, core is fun | before investing in meta or art |
| 2 — soft launch | **D1 35–45%, D7 ~20%, D30 ~10%**; CPI test under ~$1.50–3.50 US / ~$0.95 Android | scalable on paid UA |
| 3 — scale | 3–4 weeks stable D7 + ARPDAU | before meaningful paid UA |

Tune with: per-level fail/quit points, hint/undo usage, breakage rate.

## 8. Top risks → mitigations

- **3D content costs more than 2D** → modular reusable parts + low-poly + the authoring
  tool; drop to 2.5D if needed.
- **"Figuring out the order" frustrates** → `NextActionableId()` hint, stuck-feedback
  that points at the blocker, generous Relaxed mode, unlimited undo.
- **Solved-once / shallow** → efficiency stars, then Daily + leaderboards, then
  procedural objects (seeded).
- **"It's just Disassembly 3D"** → lean on the *puzzle*: dependency logic, fail states,
  par scoring, handcrafted levels — things a sandbox doesn't have.

*Benchmarks above are from Supersonic, Game Growth Advisor, Admiral Media, Revolgames,
and Unity's hyper→hybrid analysis (2025–26).*
