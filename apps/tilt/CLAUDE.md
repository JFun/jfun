# Tilt — coding-session guide

A vanilla-JS marble game in the `jfun` studio. **No build step** — `web/` runs with
`python3 -m http.server` (or the `tilt-web` preview on :8782). Ships to iOS via
Capacitor (`com.jfun.tilt`).

## The game

An 8×8 dark tray, glossy colored marbles, one matching colored hole per marble.
**Hero mode ("tilt", default on touch devices): tilt the physical phone — the
accelerometer becomes the gravity vector and marbles roll with real physics**
(coasting, glass-on-glass bounce, contact chains, hole dimples, lip-outs, seated
balls as solid obstacles). Time-scored, per-level bests. **"swipe" mode** is the
classic discrete slide (all marbles move per swipe; moves vs BFS-verified par) —
desktop default and fallback. Level campaign: hole count ramps 3 → 6.

## Architecture — three layers, keep them separate

| File | Role | Rules |
|---|---|---|
| `web/js/engine.js` | discrete rules: resolver, BFS solver, `build(level)` layouts | pure, deterministic, node-tested; NEVER ship an unverified level |
| `web/js/physics.js` | continuous sim: fixed 1/120s steps in CELL units, emits events | pure, NO randomness/clock/DOM; determinism is regression-tested |
| `web/js/game.js` | rendering, audio/haptics, input, modes, campaign, persistence | consumes physics EVENTS for sound/haptics; never re-derives physics |

## Discipline (non-negotiable)

- **`bash scripts/dev/test.sh` after EVERY edit** (syntax + 16 engine + 23 physics tests).
- Determinism is sacred in engine.js and physics.js — same inputs → identical output.
- UI changes need a real render: preview at phone size, drive the sim with the
  `window.__tilt` dev hook (`stepN(n, {gx,gy})` steps without rAF — the preview
  browser SUSPENDS requestAnimationFrame; never rely on rAF for verification
  or for game-state progression).
- Deploy = `bash scripts/dev/deploy_ios.sh` (self-test → cap sync → cache-bust →
  build → devicectl install/launch). Deploy after passing tests; feel is judged
  on the device.

## Hard-won gotchas (do not rediscover)

- **Motion comes from the NATIVE plugin** (`ios/App/App/MotionNative.swift`,
  CoreMotion — zero permission prompts, starts at boot, registered via
  `MainViewController.swift` + Main.storyboard). Do NOT rely on the web
  DeviceMotionEvent API on device: its WKWebView permission grant is
  SESSION-SCOPED and silently regresses to denied across launches. The web
  path in game.js is a browser-only fallback (`NSMotionUsageDescription`
  stays in Info.plist for it).
- Motion data convention (both paths): gravity direction vector in device
  coords (flat face-up z≈−1g; upright y≈−1g). Mapping: canvas `ax=+g.x,
  ay=−g.y`; `PLATFORM_SIGN` negates for spec-compliant (Android) engines
  on the web path; `FLIP_X/FLIP_Y` in game.js are the feel-test safety
  valves. App is portrait-locked on purpose.
- `navigator.vibrate` is a no-op on iOS — haptics go through the Capacitor
  Haptics plugin (already in `CapApp-SPM/Package.swift`).
- Stylesheet needs `[hidden]{display:none!important}` — `.pill{display:flex}`
  would override the attribute.
- Physics feel tuning knobs (in `physics.js` defaultParams): `accel` (gravity
  scale), `captureSpeed` (sink strictness), `wellK` (hole-dimple pull),
  `frictionC` (rolling resistance). One-number changes; re-run tests (some
  assert against these values) before deploying.

## Status notes

- Working title "Tilt" — App Store naming pass owed before release (generic/unownable).
- The shell still carries an inert Moraine `GoogleService-Info.plist` — replace before release.
- Sibling `apps/dowse` is a PARKED experiment — leave it alone unless asked.
