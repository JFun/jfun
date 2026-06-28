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

Internal deps use the workspace protocol (`"@jfun/growth-loop": "*"`). Nothing is
published publicly. The two vanilla-JS games now live in `apps/` (`moraine`,
`lanthorn`); each carries an `apps/<game>/SETUP.md` for its gitignored build
essentials. The Godot/Unity projects stay in their own repos. See `docs/plan/`.

## Package entry points (why three files per package)

Each package ships the same trio, intentionally:

- **`src/<pkg>.js`** — the real code, a **UMD** module. It's the `browser` entry: a
  no-build game `<script src>`s it (or vendors a copy) and reads the global. Node
  `require()`s the same file, so the tests run the exact browser code path.
- **`index.js`** (CommonJS) and **`index.mjs`** (ESM) — thin re-exports of `src`,
  with a conditional `exports` map. `index.mjs` imports the one CJS module via
  Node interop, so ESM and CJS consumers share a single instance — **no dual-package
  hazard**. This is what lets `import { Daily } from "@jfun/growth-loop"` and
  `require("@jfun/web-game-core")` both work with zero build step.
