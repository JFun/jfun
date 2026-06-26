# Studio Monorepo — Context & Decision

*Working name `studio` (rename to taste — e.g. `jfun-kit`, matching the `com.jfun.*` handle). Created June 25, 2026. The shared-infrastructure + knowledge monorepo for the studio's web-first apps/games. Read this first, then 01-STRUCTURE → 02-EXTRACTION-MAP → 03-GROWTH-LOOP-PACKAGE → CLAUDE.md.*

## The decision (and why now)

After ~18 projects, the same stack has been hand-rebuilt enough times to abstract it well: **web-first vanilla JS + Capacitor iOS + Firebase + a `test.sh`/golden-validation discipline** recurs across Lanthorn, Moraine, WhatNow, PAi, Plot Twist — and Moraine literally **copy-pasted** Lanthorn's grid/render/test rig. That's the textbook "built it 3+ times, patterns are stable" signal: extraction now is well-informed, not premature. The accumulated *knowledge* (kit template, decision logs, Apple-rules + validation playbook) is equally worth one canonical home instead of scattered across `game-context`/`app-context`.

**Verdict: good idea, right-ish time — with one hard caveat.**

## The hard caveat (read every time you touch this repo)

A monorepo makes **building** faster. Building was never the bottleneck — **distribution is** (every project dies on ship-then-silence, not on code). So the failure mode here is *productive procrastination*: polishing shared infra while dodging the unglamorous growth work (e.g. Moraine's missing loop, in App Store review right now).

Two rules that keep this honest:
1. **The growth-loop package is the hero, not an afterthought** (03). It's the one piece of shared code that attacks the actual problem — so every future game ships *with* a loop by default instead of bolting it on never.
2. **This must not delay Moraine's loop.** The right sequencing makes them the same task: build the growth-loop package here, and **ship it into Moraine as its first consumer.** If the monorepo ever becomes a reason Moraine stays loop-less, stop and do Moraine.

## Scope (deliberately narrow)

- **IN:** the **web-first** projects, where the stack genuinely converges. Two layers:
  - *Game stack* (vanilla-JS, no-build): the engine/RNG/solver-bot/test primitives — shared across the games (Lanthorn, Moraine, future games).
  - *Cross-cutting infra* (framework-agnostic): Capacitor iOS shell + deploy, Firebase analytics, and **the growth-loop package** — usable by games **and** the Capacitor apps (PAi, Plot Twist, WhatNow).
- **OUT:** the Godot/Unity projects (Tinker Lab, Underroot, Block Bloom, Gravity Flip, Lullaby Lane, Thawline, Vinegrow) — they don't share enough to be worth dragging in.
- **OUT: migrating the existing repos.** This is a *light extraction that NEW projects pull from* — not a grand migration (low value, high churn, and one bad change to a shared package breaking five live apps is a real solo-dev hazard). Existing repos keep shipping as-is; they adopt packages opportunistically, never on a forced schedule.

## What this repo is (two things, kept separate)

1. **Code:** shared packages + a `create-app`/`create-game` scaffold so a new project starts in minutes with the loop, analytics, native shell, and test rig already wired (01, 02, 03).
2. **Knowledge:** one "studio handbook" — the distilled strategy, Apple rules, validation pipeline, kit template, the distribution playbook, and the post-mortem lessons (04). `game-context`/`app-context` stay as the *living* research; the handbook is the *canonical distilled* playbook.

## Status / sequence

- **Phase:** pre-build. This kit is the plan; nothing extracted yet.
- **Build order (CLAUDE.md):** scaffold workspaces → **build the growth-loop package + ship it into Moraine** → extract analytics/native-shell/test-harness (canonical versions from Moraine/Lanthorn) → engine primitives → the `create-game` template → migrate knowledge into `handbook/`.
- **Time-box it.** This is a "between builds / while-in-review" investment, not a multi-week detour. If it sprawls, ship the growth-loop package + template and stop.

## Files in this folder

| File | Contents |
|---|---|
| 00-CONTEXT.md | This file |
| 01-STRUCTURE.md | Repo layout, the package list, tooling (npm workspaces, no-build ethos), the `create-game` scaffold |
| 02-EXTRACTION-MAP.md | What to pull from which existing repo, with canonical sources + verification steps |
| 03-GROWTH-LOOP-PACKAGE.md | The hero: the drop-in daily + share-card + streak + k-instrumentation package |
| 04-HANDBOOK.md | Consolidating the knowledge (strategy, Apple rules, validation pipeline, kit template, distribution playbook, lessons) |
| CLAUDE.md | Coding-session guide: prime directive, tooling, build order, guardrails |
