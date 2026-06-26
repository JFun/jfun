# jfun-studio

The studio's shared-infrastructure + knowledge monorepo for web-first apps/games
(`com.jfun.*`). npm workspaces, no-build ethos: packages ship as importable ESM,
the games still run with `python3 -m http.server`.

> **Prime directive (`studio/CLAUDE.md`):** building was never the bottleneck —
> distribution is. The repo earns its existence by serving distribution, so
> `@studio/growth-loop` is the hero and **Moraine v1.1 is its first consumer**.

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
handbook/         the distilled studio playbook
scripts/          repo-level dev scripts (test.sh, new-game.mjs)
studio/           the planning archive (00-CONTEXT … 04-HANDBOOK, CLAUDE.md)
```

## Develop

```bash
npm install            # links @studio/* workspaces
npm test               # fans out to each package's scripts/dev/test.sh
node scripts/new-game.mjs <name>   # scaffold a new game with the loop pre-wired
```

Internal deps use the workspace protocol (`"@studio/growth-loop": "*"`). Nothing
is published publicly. Existing repos (Moraine, Lanthorn, …) are **not** migrated
in — they adopt packages opportunistically. See `studio/` for the full plan.
