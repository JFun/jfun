# Studio Monorepo — Structure & Tooling

*v0.1, June 25, 2026. The layout and the tooling choices. Keep it light: npm workspaces, the no-build ethos preserved, no heavyweight monorepo tool unless pain demands it.*

## Layout

```
studio/
├─ package.json                # npm workspaces root
├─ packages/
│  ├─ growth-loop/             # ★ the hero: daily + share card + streak + k-instrumentation (03)
│  ├─ analytics/               # Track API → Firebase (native) / gtag (web)
│  ├─ native-shell/            # Capacitor iOS shell + deploy_ios.sh + signing-config template + NativeFX
│  ├─ web-game-core/           # deterministic primitives: mulberry32 RNG, grid ops, line-clear, bot/solver scaffolding
│  ├─ audio/                   # procedural Web Audio SFX (no asset files)
│  └─ test-harness/            # test.sh + golden-determinism + bot/solver invariant helpers
├─ templates/
│  └─ create-game/             # scaffold a new vanilla-JS web game with every package pre-wired + a CLAUDE.md
├─ handbook/                   # the distilled studio knowledge (04)
├─ apps/                       # OPTIONAL: NEW games/apps live here pulling packages. Existing repos are NOT moved in.
└─ scripts/                    # repo-level dev scripts
```

## Tooling decisions

- **npm workspaces** (you already use npm everywhere) — simplest thing that works; no Nx/Turborepo/Lerna unless the repo grows enough to hurt. One root `package.json` with `"workspaces": ["packages/*","templates/*","apps/*"]`.
- **Preserve the no-build ethos.** Packages are plain ES modules importable directly (the games run with `python3 -m http.server`, no bundler). Ship packages as source ESM; only add a tiny build step for a package if a consumer genuinely needs it. *Don't let the monorepo drag a bundler into the games that deliberately avoid one.*
- **Internal deps via workspace protocol** (`"@jfun/growth-loop": "*"`), so a new game imports `@jfun/growth-loop`, `@jfun/analytics`, etc.
- **One root `test.sh`** that fans out to each package's tests; each package keeps the Lanthorn/Moraine discipline (syntax → invariants → golden).
- **Versioning:** internal only; no public publishing. Keep packages stable — a breaking change ripples, so treat package APIs as contracts (semver in spirit, even if unpublished).
- **TypeScript?** Optional. The games are vanilla JS today; don't force a TS migration. If you want types, add `.d.ts` or JSDoc to package public APIs without converting the games.

## The `create-game` scaffold (the daily payoff)

`templates/create-game/` = the common skeleton so a new game starts in minutes, loop-included:

```
<new-game>/
├─ web/ index.html · js/{game,engine,audio}.js · style.css   # no build step
├─ ios/                                                       # Capacitor shell (from native-shell)
├─ scripts/dev/{test.sh, deploy_ios.sh}
├─ CLAUDE.md                                                  # pre-filled studio conventions
└─ package.json                                               # imports @jfun/* packages
```

A `scripts/new-game.mjs <name>` copies the template, swaps bundle id (`com.jfun.<name>`), wires the packages, and drops a starter `engine.js`. **Critically, the template wires `@jfun/growth-loop` by default** — so "ship without a loop" stops being the path of least resistance.

## Two-layer reuse (don't over-share)

- **`web-game-core`** is for the vanilla-JS *games* (Lanthorn/Moraine lineage) — engine primitives. The Next.js/Vite *apps* (PAi, Plot Twist, WhatNow) won't use it; that's fine.
- **`growth-loop`, `analytics`, `native-shell`, `audio`** are framework-agnostic — usable by games **and** apps. Keep their public APIs free of game-specific assumptions.
