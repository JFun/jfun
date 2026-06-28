# jfun-studio

The studio's shared-infrastructure + knowledge monorepo for `com.jfun.*` apps/games.
**Web-first** games (vanilla-JS, no-build ethos: packages ship as importable ESM, the
games still run with `python3 -m http.server`) **and engine-based games** (Unity/Godot)
both live here under `apps/`. The shared `@jfun/*` packages serve the web games; engine
apps bring their own toolchain but honor the same distribution-first directive.

> **Prime directive (`docs/plan/CLAUDE.md`):** building was never the bottleneck —
> distribution is. The repo earns its existence by serving distribution, so
> `@jfun/growth-loop` is the hero and **Moraine v1.1 is its first consumer**.

## Layout

```
apps/
  moraine/        vanilla-JS gravity puzzle (web + Capacitor iOS)
  lanthorn/       vanilla-JS game (web + Capacitor iOS)
  unmake/         ★ Unity teardown puzzle (iOS/Android) — self-contained engine app
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
published publicly. The vanilla-JS games live in `apps/` (`moraine`, `lanthorn`);
each carries an `apps/<game>/SETUP.md` for its gitignored build essentials.
**Engine-based games (Unity/Godot) now live in `apps/` too** — e.g. `apps/unmake`, a
Unity project — self-contained with their own toolchain (they don't vendor the `@jfun/*`
web packages, but still ship a daily/share loop + analytics). See `docs/plan/`.

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
