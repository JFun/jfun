# Studio Monorepo — rules for Claude coding sessions

The studio's shared-infrastructure + knowledge monorepo. Read `00-CONTEXT.md` (decision + caveats), then `01-STRUCTURE`, `02-EXTRACTION-MAP`, `03-GROWTH-LOOP-PACKAGE`, `04-HANDBOOK`. This file is *how* we build.

## Prime directive (the order that keeps this honest)

**Building was never the bottleneck — distribution is.** So this repo earns its existence only by serving distribution:

1. **Build `@studio/growth-loop` FIRST, and ship it into Moraine as v1.1** (03). That single move builds the hero package *and* gives Moraine the loop it launched without. Do this before extracting anything else.
2. **Light extraction, not grand migration.** New projects pull packages; **do not move the ~18 existing repos in.** Moraine/Lanthorn keep their inlined copies until they choose to adopt.
3. **Time-box it.** If the repo starts sprawling, ship the growth-loop package + the `create-game` template and stop. Don't let infra polish become the procrastination the handbook warns about.

## Scope

- **IN:** web-first projects. Game-stack primitives (vanilla-JS games: Lanthorn/Moraine lineage) + framework-agnostic infra (growth-loop, analytics, native-shell, audio) usable by games and the Capacitor apps.
- **OUT:** Godot/Unity projects; migrating existing repos; any bundler creeping into the no-build games.

## Tooling

- **npm workspaces**, one root `package.json` (`packages/*`, `templates/*`, `apps/*`). No Nx/Turbo/Lerna unless real pain.
- **Preserve the no-build ethos** — packages ship as importable ESM; the games still run with `python3 -m http.server`. Add a build step to a package only if a consumer truly needs it.
- Internal deps via workspace protocol (`@studio/...`). No public publishing.

## Build order

1. **Scaffold** the workspace skeleton (`packages/`, `templates/`, `handbook/`, root `package.json` + root `test.sh`).
2. **`@studio/growth-loop`** (03) — the hero. Then **wire it into Moraine → v1.1.** ← the highest-leverage unit of work; do it first.
3. **`@studio/analytics`** ← Moraine's `Track`/`analytics.js` (canonical) + Lanthorn's native Firebase. Preserve event names the dashboards expect.
4. **`@studio/native-shell`** ← Lanthorn/Moraine `ios/` + `deploy_ios.sh` + `NativeFX.swift` + signing template (team `Y3T546NP6T`).
5. **`@studio/test-harness`** ← Moraine/Lanthorn `scripts/dev/test.sh` + golden/bot helpers.
6. **`@studio/web-game-core`** ← Moraine `engine.js` primitives (mulberry32 RNG, grid, line-clear, bot/solver scaffolding). Leave game *rules* in each game.
7. **`@studio/audio`** ← Moraine's procedural Web Audio synth.
8. **`templates/create-game`** + `scripts/new-game.mjs` — scaffold a new game with every package (incl. growth-loop) pre-wired.
9. **`handbook/`** (04) — distill `game-context`/`app-context` into the evergreen playbook. Last, because it's docs.

## Non-negotiables (process — carried from Lanthorn/Moraine)

- **Extraction must be parity-safe.** Each package's first consumer must reproduce its old behavior exactly; the **golden/determinism tests are the contract** that makes pulling code out safe. Run `test.sh` after every change.
- **Determinism is sacred** in `growth-loop` (daily seed) and `web-game-core` (RNG) — same inputs → identical output, pinned by a golden test. If two clients diverge, the daily + share loop is broken.
- **`analytics` event names stay stable** — don't break the existing dashboards.
- **`native-shell` deploy must still install** on the paired device with intact signing.

## The one-line plan

Scaffold → **build the growth-loop package and ship Moraine v1.1 with it** → extract the rest (parity-safe) → `create-game` template → handbook. The first real commit should make Moraine better, not just the repo prettier.
