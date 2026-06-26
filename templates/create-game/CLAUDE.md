# __GameName__ — coding-session guide

A vanilla-JS web game in the `jfun` studio. **No build step** — `web/` runs with
`python3 -m http.server`. Ships to iOS via Capacitor (`@jfun/native-shell`).

## The loop is already wired — don't rebuild it

`@jfun/growth-loop` powers the **daily + streak + spoiler-free share card +
k-funnel**. It's configured once in `web/js/game.js` (`GL.configure`). You report a
result on win — `GL.Daily.markPlayed(day, { swipes, par })` — and get the lock,
streak, share, and funnel for free. **Never ship loop-less; never hand-roll the
daily.** Distribution is the bottleneck, not the build.

## What to actually build

Replace the placeholder **rules** in `web/js/engine.js` with your game. Keep the
shape: a **pure, deterministic, seedable** engine (`build(seed)` → same daily for
everyone) with a **golden + "every daily winnable with a known par" invariant**
(`scripts/dev/engine-tests.cjs`). Game *rules* live here; reusable primitives come
from `@jfun/web-game-core` (RNG, grid, line-clear, BFS solver).

## Studio packages (vendored as browser globals in `web/js/vendor/`)

| Package | Global | Use |
|---|---|---|
| `@jfun/growth-loop` | `GrowthLoop` | daily/streak/share/k-funnel (wired) |
| `@jfun/web-game-core` | `WebGameCore` | mulberry32 RNG, grid, line-clear, BFS solver |
| `@jfun/analytics` | `Track` | `Track.ev(name, params)` → Firebase/gtag |
| `@jfun/audio` | `Sfx` | procedural SFX (`Sfx.win()`, `Sfx.clear()`, …) |

Re-vendor after a package update: copy `packages/*/src/*.js` → `web/js/vendor/`.

## Discipline (non-negotiable)

- **Self-test before "done":** `bash scripts/dev/test.sh` after every edit.
- **Determinism is sacred:** same seed → identical board, pinned by the golden.
- **Never ship an unsolvable daily** — the par invariant is the guard.
- **Stable analytics event names** — dashboards + the k-funnel depend on them.
- **UI changes need a real render** — serve `web/` and look, don't just smoke-launch.

## Ship

1. `bash scripts/dev/test.sh`
2. iOS: copy `@jfun/native-shell` templates into `ios/`, set team `Y3T546NP6T`,
   then `scripts/dev/deploy_ios.sh`. TestFlight flow: see the studio handbook.
