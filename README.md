# jfun-studio

The studio's shared-infrastructure + knowledge monorepo for web-first apps/games
(`com.jfun.*`). npm workspaces, no-build ethos: packages ship as importable ESM,
the games still run with `python3 -m http.server`.

> **Prime directive (`docs/plan/CLAUDE.md`):** building was never the bottleneck —
> distribution is. The repo earns its existence by serving distribution, so
> `@jfun/growth-loop` is the hero and **Moraine v1.1 is its first consumer**.

## Layout

```
packages/
  growth-loop/    ★ daily + share card + streak + k-funnel (the hero)
  analytics/      Track API → Firebase (native) / gtag (web)
  audio/          procedural Web Audio SFX (no asset files)
  web-game-core/  deterministic primitives: mulberry32 RNG, grid, line-clear, solver scaffold
  native-shell/   Capacitor iOS shell + deploy_ios.sh + NativeFX.swift + signing template
  test-harness/   golden-determinism + invariant test helpers
templates/
  create-game/    scaffold a new vanilla-JS game with every package pre-wired
docs/
  handbook/       the evergreen playbook for NEW projects (strategy, Apple rules, distribution, lessons)
  plan/           the origin plan/spec for THIS repo (00-CONTEXT … 04-HANDBOOK, CLAUDE.md)
scripts/          repo-level dev scripts (test.sh, new-game.mjs)
```

`packages/` is the standard npm-workspaces convention (the `workspaces` glob points
at it). The two doc folders are deliberately distinct: **`docs/handbook/`** is the
forward-looking playbook you read when starting a new game; **`docs/plan/`** is the
backward-looking record of how this repo itself was scoped and built.

## Develop

```bash
npm install            # links @jfun/* workspaces
npm test               # fans out to each package's scripts/dev/test.sh
node scripts/new-game.mjs <name>   # scaffold a new game with the loop pre-wired
```

Internal deps use the workspace protocol (`"@jfun/growth-loop": "*"`). Nothing
is published publicly. Existing repos (Moraine, Lanthorn, …) are **not** migrated
in — they adopt packages opportunistically. See `docs/plan/` for the full plan.
