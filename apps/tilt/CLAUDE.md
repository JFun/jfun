# Tilt — coding-session guide

A vanilla-JS marble game in the `jfun` studio. **No build step** — `web/` runs with
`python3 -m http.server` (or the `tilt-web` preview on :8782). Ships to iOS via
Capacitor (`com.jfun.tilt`).

## The game

An 8×8 dark tray, glossy colored marbles, one matching colored hole per marble.
**ONE input: tilt the physical phone — the accelerometer becomes the gravity
vector and marbles roll with real physics** (coasting, glass-on-glass bounce,
contact chains, hole dimples, lip-outs, seated balls as solid obstacles).
**Wrong-hole rule (playtested twice, keep this one): a slow roll into a
wrong-color hole LODGES the ball** (plunk, plugs the hole; a hard tilt >~30°
or a billiard shot frees it) — **and when EVERY remaining ball sits wedged in
a wrong hole for 3s, the run ends with a "Stuck — game over!" card + Try
again** (`checkDeadEnd` in game.js). Instant fail-on-wrong-hole was tried and
REVERTED: "too much, very easy can end game by accident". Fast crossings lip
out. Time-scored, per-level bests. Level campaign: holes ramp 3 → 6, walls
(square blocks) from L4. **The MVP's only obstacle is the block** — a HILL
mechanic (ridge bumps: `slopeG` push away from the ridge, stall/crest
physics, axis-pass discrete rule) was built through three iterations and
PARKED by user call ("pause the slope effort… stick w/ block obstacle for
mvp"): the visual never converged. The machinery stays dormant and tested
(`nSlopes = 0` in rampFor is the single switch; physics `slopes` force,
engine axis rule, renderer, ball lift all sleep behind empty arrays). If it
is ever revived, iterate art in `scripts/dev/slope-lab.html` and self-judge
screenshots at actual size AGAINST THE REFERENCE before deploying. Desktop
fallback: arrow keys.
(A discrete "swipe" mode was also removed on purpose — one input, one story.
The discrete engine remains as the level generator/verifier.)

## Architecture — keep the layers separate

| File | Role | Rules |
|---|---|---|
| `web/js/engine.js` | discrete rules: resolver, BFS solver, `build(level)` layouts | pure, deterministic, node-tested; NEVER ship an unverified level |
| `web/js/physics.js` | continuous sim: fixed 1/120s steps in CELL units, emits events | pure, NO randomness/clock/DOM; determinism is regression-tested |
| `web/js/tutorial-script.js` | pure data: the tutorial's mini world + scripted gravity beats | node-tested — the demo story must provably play out in the real physics |
| `web/js/game.js` | rendering, audio/haptics, input, campaign, persistence, tutorial card | consumes physics EVENTS for sound/haptics; never re-derives physics |

The tutorial card is NOT a canned animation: it steps a real `PH.createWorld`
with `TutorialScript`'s gravity track and renders via the same ctx-param
primitives the board uses (`drawWorld`/`drawMarbleAt`/`roundedHole`), inside a
phone frame that **tips in real 3D** — CSS `perspective() rotateX/rotateY` on
the canvas element (gx → rotateY, gy → −rotateX, angle = asin(g/9.8)), so the
dipping edge falls away from the viewer like a hand-held tilt. NEVER depict
the tilt as an in-plane 2D rotation — that's the one gesture that does nothing
in this game (user caught this). Driven by the game loop's own rAF+accumulator
pattern; change the physics feel and the tutorial inherits it — and the pinned
physics test fails if the story (lodge → hard-tilt escape → capture) stops
playing out.

## Discipline (non-negotiable)

- **`bash scripts/dev/test.sh` after EVERY edit** (syntax + 26 engine + 51 physics tests, incl. the tutorial-story, dead-end, and slope pins).
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
- **Gravity is ABSOLUTE — the phone's real attitude IS the tray. There is NO
  neutral-grip calibration** (user call 2026-07: per-run calibration was
  invisible state — arm at a steep grip and "flat" moved with you, capping max
  pull below the ~5 m/s² cup-escape threshold → lodged balls could never pop
  out, and behavior varied run to run). Board gravity = the vector's
  screen-plane components (gx=9.8·x, gy=−9.8·y in `currentGravity`) — never
  per-axis atan2 angles (`atan2(x,−z)` divides by z, which vanishes upright →
  jitter garbage + sign flip past vertical). Tap = live: no start gate, no
  hold-flat coaching (a gate was tried and cut same-day — user: "gravity
  feeling is so natural, users shall feel it soon"). `cal`/`setCal` survive
  as dev-test hooks only; the game never writes them.
- `navigator.vibrate` is a no-op on iOS — haptics go through the Capacitor
  Haptics plugin (already in `CapApp-SPM/Package.swift`).
- Stylesheet needs `[hidden]{display:none!important}` — `.pill{display:flex}`
  would override the attribute.
- **No persistent footer buttons.** Bottom-edge buttons sit in iOS's
  home-indicator gesture zone and read as dead. End-of-level flow lives on the
  auto-shown win card (Next ▸ / ⟳ Replay / Share); the only persistent control
  is the small ⟳ icon in the top meta row.
- Physics feel tuning knobs (in `physics.js` defaultParams): `accel` (gravity
  scale), `captureSpeed` (sink strictness), `wellK` (hole-dimple pull),
  `frictionC` (rolling resistance). One-number changes; re-run tests (some
  assert against these values) before deploying.

## Status notes

- Working title "Tilt" — App Store naming pass owed before release (generic/unownable).
- The shell still carries an inert Moraine `GoogleService-Info.plist` — replace before release.
- Sibling `apps/dowse` is a PARKED experiment — leave it alone unless asked.
