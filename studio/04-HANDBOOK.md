# `handbook/` — the distilled studio knowledge

*v0.1, June 25, 2026. The canonical playbook, distilled from `game-context/` + `app-context/` (which stay as the living research). The handbook is the *short, current, authoritative* version a new project (or coding agent) reads — not the full research trail.*

## Why a handbook (not just the context folders)

`game-context` and `app-context` are ~20 files of research, shortlists, and decision logs — invaluable, but too long to read at the start of every project, and partly stale. The handbook is the **distilled, evergreen** layer: the rules that survived contact with reality, in a few tight pages.

## Proposed contents

```
handbook/
├─ 00-strategy.md        # classic mechanic + exactly one innovation; the complexity-budget law
├─ 01-apple-rules.md     # 4.1/4.3: genre mechanics safe, never clone a specific hit; the Gravity Flip scar; submission checklist
├─ 02-validation.md      # the pipeline + thresholds: greybox → fun gate → ★distribution gate → TestFlight D1≥35% → soft-launch D7≥12%; Gate 4
├─ 03-distribution.md    # ★ the weak spot, codified: the daily/share/k-factor loop discipline; "distribution is the project"; the ship-then-silence post-mortems
├─ 04-prior-art-audit.md # the repeatable differentiation-audit method (App Store/Steam/USPTO/web)
├─ 05-kit-template/      # the project kit: CONTEXT / PRD / PRIOR-ART / PROTOTYPE-PLAN blanks
└─ 06-lessons.md         # the graveyard + why each died (the most valuable page)
```

## What to pull where (from the existing context)

- **00-strategy / 01-apple / 02-validation / 04-audit** ← distill `game-context/00-CONTEXT, 02-apple-review-rules, 03-concept-pipeline, 04-appstore-search-methods, 06-exponential-growth-research`.
- **03-distribution** ← the hard-won thesis across `app-context` (08–11) + this whole journey: **building is not the bottleneck, distribution is.** Make this the most prominent page — it's the lesson that keeps getting relearned.
- **05-kit-template** ← the structure already used by `dusk-prd`, `gamesmith`, `encore`, `plot-twist`, `gravity-shift-prd`.
- **06-lessons** ← the post-mortems in `game-context/00-CONTEXT` (Block Blossom, Gravity Flip, Tinker Lab, Underroot, Vinegrow, Thawline) + `app-context` retro (WhatNow, PAi, Final Chapter, Lullaby Lane) + Moraine. One line each: what it was, why it stalled. This page alone prevents repeats.

## Rules for the handbook

- **Short and current.** If a page can't be read in 2 minutes, it's too long — link to the deep research in `game-context`/`app-context` for detail.
- **Distilled, not duplicated.** The context folders remain the source of truth for *how we got here*; the handbook is *what we now believe*. When they conflict, update the handbook.
- **The lessons page is the heart.** Most of the value of having built 18 things is the post-mortems — keep them brutally honest and one-line-scannable.

## Sequencing

Lowest-effort, high-ROI — but **do it after the growth-loop package + Moraine v1.1** (03). The handbook is valuable but it's documentation; the loop is the thing that changes outcomes. Don't let writing the playbook become the procrastination the playbook warns about.
