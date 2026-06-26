# Studio Monorepo — Extraction Map

*v0.1, June 25, 2026. What to pull from which existing repo, and which copy is canonical. Rule: **Moraine is newest → default canonical** for the game stack; diff against Lanthorn and take the cleaner version. Extract the *reusable primitive*, leave game-specific rules in each game.*

| Package | Canonical source | Also reference | Extract (the reusable part) | Leave behind (game-specific) |
|---|---|---|---|---|
| **growth-loop** ★ | *(none — build fresh, 03)* | `plot-twist/` PRD specs the loop; `daily-worldboard/` design | the whole package (daily seed, share card, streak, k-funnel) | — |
| **analytics** | `moraine/web/js/analytics.js` (`Track` API) | `lanthorn/web/js/analytics.js`; `lanthorn/ios/App/App/NativeFX.swift` (native Firebase `track`) | one `Track.ev(name, props)` → Firebase (native) / gtag (web); the event-name conventions | per-game event names |
| **native-shell** | `lanthorn/ios/` + `lanthorn/scripts/dev/deploy_ios.sh` | `moraine/ios/`, `moraine/scripts/dev/deploy_ios.sh` | Capacitor SPM config (no CocoaPods), `deploy_ios.sh` (test→cap sync→xcodebuild→devicectl install), `NativeFX.swift` (AVAudio + Taptic + Firebase), the pbxproj hand-registration note, signing template (team `Y3T546NP6T`) | bundle id, app name, icons |
| **web-game-core** | `moraine/web/js/engine.js` | `lanthorn/web/js/engine.js` | mulberry32 `makeRNG`; grid + `EMPTY/FILLED/WALL`; full-row/col **line-clear detection**; the **bot/solver validation scaffolding** (`moraine/scripts/dev/solver.cjs` BFS; Lanthorn's greedy bot) | the *rules* (Moraine's settle/cascade; Lanthorn's place/lanterns) — these stay in each game's own `engine.js` |
| **audio** | `moraine/web/js/audio.js` (procedural Web Audio, no assets) | `lanthorn/web/js/audio.js` + `gen_sounds.py` | the procedural SFX synth + a small named-sound API (`sfx('clear')`, etc.) | per-game sound choices |
| **test-harness** | `moraine/scripts/dev/test.sh` | `lanthorn/scripts/dev/test.sh` + `engine-tests.cjs` | the harness shape: syntax → engine **determinism golden** → **solver/bot invariants**; helpers to write golden + invariant tests | per-game golden fixtures, board data |
| **create-game template** | `moraine/` overall shape (web/ + ios/ + scripts/dev/ + CLAUDE.md) | `lanthorn/` | the no-build `web/` skeleton, the `scripts/dev/` pair, the Capacitor `ios/`, a pre-filled `CLAUDE.md` | all content |

## How to extract (per package, the safe path)

1. **Diff the candidates** (`moraine` vs `lanthorn`) for the file; pick the cleaner/newer as canonical.
2. **Pull out the primitive**, stripping game-specifics, and give it a small, documented public API.
3. **Prove parity:** the first consumer of each package must reproduce its old behavior exactly (e.g. the game's golden tests still pass against the shared engine-core primitives). The whole point of the test discipline is to make extraction safe.
4. **Don't migrate the source repo.** Moraine/Lanthorn keep their inlined copies until *they* choose to adopt the package — extraction feeds *new* projects first.

## Verification checklist (before trusting a package)

- Determinism preserved (same seed/inputs → identical output) — the golden test is the contract.
- `analytics` fires the same event names the dashboards already expect.
- `native-shell` `deploy_ios.sh` still installs on the paired device; signing/team intact.
- No bundler crept into a game that was no-build.
