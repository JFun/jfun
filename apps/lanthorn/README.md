# Lanthorn

*Drag pieces, clear lines, light every lantern.*

Web prototype of the designed-level block puzzle specced in [lanthorn-prd/00-PRD.md](lanthorn-prd/00-PRD.md). This is the "web build proper" of PRD §6 weeks 2–3: lantern/night-sky theme, juice, 60 bot-validated levels, night-sky meta screen, CrazyGames SDK hooks.

## Run

```bash
python3 -m http.server 4173 -d web   # then open http://localhost:4173/
```

Any static server works; there is no build step and no dependency. `?debug=1` adds the `LD` console helpers (`LD.goto(n)`, `LD.winNow()`, `LD.failNow(k)`, `LD.reset()`) and n/p level-skip keys.

## Test (run after every change)

```bash
scripts/dev/test.sh
```

Syntax-checks everything, runs 117 engine/data invariants (`engine-tests.cjs`), then validates all 60 levels against the tuning.json difficulty bands with the greedy bot at 100 seed-variants each (`bot-sim.cjs`). The engine port is held bit-identical to the greybox engine — the PRD appendix numbers must reproduce exactly or tests fail.

## Levels

`web/js/levels.js` is generated — never hand-edit. Regenerate with:

```bash
node scripts/dev/gen-levels.cjs
```

Deterministic (fixed master seed). Pipeline per [lanthorn-prd/01-level-design-spec.md](lanthorn-prd/01-level-design-spec.md): archetype geometry → lantern rules → 30-run bot screen → authored-queue-winnable check → 100-run band validation (+ "every lantern lightable" fairness rule) → sort within band, then the world-arc: archetype-A breathers pinned at world midpoints (10, 30, 50) and the hardest levels pinned at world finales (20, 40, 60), so each 20-level world ramps to a climax. All 10 greybox kit levels are kept, redistributed to positions lawful under the position bands (A=1–10, B=11–30, C=31–60).

## iPhone build (Capacitor)

`ios/` is a Capacitor (SPM) project — the store-port path decided June 12, 2026. `web/` is the
single source of truth; `npx cap sync ios` copies it into the app. Native bits live in
`ios/App/App/`: `NativeFX.swift` (AVAudioEngine sample player + BGM loop + Taptic haptics as a
local Capacitor plugin) and `MainViewController.swift` (plugin registration). One-shot deploy:

```bash
scripts/dev/deploy_ios.sh    # test → cap sync → build → install → launch
```

Bundle id `com.jfun.lanthorn`, team Y3T546NP6T, portrait, status bar hidden. The pre-Capacitor
hand-rolled shell is preserved at `legacy-ios-shell/` (unused). At store time: add
`@capacitor-firebase/analytics` + `GoogleService-Info.plist` for native analytics.

## Layout

| Path | What |
|---|---|
| `web/` | The game. `index.html` + `style.css` + `js/{engine,levels,game,fx,audio,sdk}.js` |
| `web/js/engine.js` | Pure rules + greedy bot (UMD: browser global / node require) |
| `web/js/sdk.js` | CrazyGames SDK wrapper — every call no-ops outside their environment |
| `ios/` | WKWebView wrapper Xcode project for on-device testing (native audio + haptics bridges) |
| `web/sounds/` | Pre-rendered SFX — regenerate with `python3 scripts/dev/gen_sounds.py` |
| `scripts/dev/` | `gen-levels.cjs`, `gen_sounds.py`, `bot-sim.cjs`, `engine-tests.cjs`, `test.sh`, `deploy_ios.sh` |
| `lanthorn-prd/` | PRD kit (spec, tuning.json, greybox) — the source of truth for rules |

## Analytics

One event API (`Track.ev`), two transports into the Firebase project `lanthorn-535f2`:

- **iOS app**: native Firebase Analytics (firebase-ios-sdk 11.x via SPM; `NativeFX.track` →
  `Analytics.logEvent`). Live now. DebugView: relaunch with
  `xcrun devicectl device process launch --terminate-existing --device <UUID> com.jfun.lanthorn -- -FIRDebugEnabled`.
- **Web** (CrazyGames gate: D1/D7 + level-quit heatmap): GA4 gtag, **inert until** the web
  app's Measurement ID (`G-…`) is pasted into `GA_MEASUREMENT_ID` in `web/js/analytics.js`
  (Firebase console → Lanthorn project → Add app → Web).

Events: `level_start`, `level_win`, `level_fail`, `level_quit`.

## Status

- [x] Greybox + bot validation (kit, week 1)
- [x] Web build: theme, juice, 60 levels, SDK hooks (this prototype)
- [x] Native iOS test shell (audio/haptics bridges) + on-device iteration
- [x] Analytics module (needs a GA4 measurement ID to go live)
- [x] Store-port path decided: Capacitor wrap of this codebase (PRD §3/§6 amended; Godot fallback)
- [ ] 10-person greybox fun gate (PRD §4 gate 1 — next action)
- [ ] CrazyGames QA pass + submission (needs dev account + cover art)
