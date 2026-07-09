# Cut — coding-session guide

A vanilla-JS rope-cutting physics game in the `jfun` studio. **No build step** —
`web/` runs with `python3 -m http.server` (or the `cut-web` preview on :8783).
Ships to iOS via Capacitor (`com.jfun.cut`).

## The game

Ropes suspend a wooden **crate** over a **basket**; the player **swipes across a
rope to sever it** and uses gravity, swing, and momentum to **land the crate in
the basket**. **Twenty** handcrafted levels, paced per the classic mechanic-arc
structure (each new element gets intro → develop → twist before the next; the
design drop's 12 were restructured — its L9-12 were four intros back-to-back):
- **L1-8 the verb campaign** — drop, tip-order, pendulum, offset-tip, bounce pad,
  3-rope order, swing-across, counterweight/pulley finale.
- **L9-12 BALLOON arc** — intro (pop = the cut verb reused) → tethered
  float-swing develop → pad-lob spectacle breather → spiked-rafters twist
  ("rising is not safe": pop under pressure).
- **L13-15 TROLLEY arc** — intro → fast offset patrol develop → DIAGONAL rail
  twist (swing + height vary together).
- **L16-18 PULSE arc** — intro gate → pendulum×gate develop (two timings
  compose; gate is FAST 0.8s/duty .35 — a ~pendulum-period gate aligns only
  every ~24s, and tighter duty is a precision wall) → anti-phase double gate.
- **L19 combo** (balloon+pulse) · **L20 FINALE** — a floating balloon-pair rides
  a trolley tether: cut at the right spot, pop on the gate's beat.
**Night Rig** art direction (moonlit workshop, cached sky/stars/mist,
fireflies). Near-zero UI chrome — level pill · gear→settings (toggles, Restart,
How to play); NO progress rail, NO level select (dev jumping: `?level=N` /
`__game.setLevel`). Portrait, fullscreen, one thumb.

## Provenance — this is a PORT, keep it faithful

`web/js/game.js` is a faithful transcription of the design handoff's reference
build — **vendored in-repo at `design/CUT - Night Rig (reference build).html`**
— which is **the source of truth for look, feel, and render/audio tokens**. Do
NOT retune or restyle by feel — match the handoff. The full token/behavior spec
is `design/README.md`. Feel is the moat. (The game.js header lists every
intentional delta vs the reference — keep that list honest when adding more.)
**The handoff gets UPDATED between drops** (2 updates on 2026-07-06 alone: HUD
bump + gesture hint, then the cue system) — when Qi says "design updated",
re-diff the whole reference against the port (`difflib` on the script block +
CSS + body), re-vendor, and check the mtime; a drop once landed minutes AFTER
the file had been read.

Ported design systems worth knowing: **first-encounter cues** (`detectCue`/
`drawCue` — wordless ghost-crate demos the first time a pad/spike/pulley
appears, persisted in `localStorage['cut.seen']`; dev params `?cues=always`,
`?cue=pad|spike|pulley`), the **L1 gesture hint** (dashed guide + tutorial hand,
loops until first cut), `?level=N` boot param, `?demo=cut|win|fail` gallery
freezes, and the wordless-hint machinery (`scheduleHint`/`activeHintText` — the
caption div only surfaces if a future `activeHintText` returns text).

The studio layers added on top of the pure reference:
- **progress persistence** — `cleared[]` → `localStorage['cut.progress']`; boots
  into the frontier (first uncleared) level. (Reference reset on reload.)
- **`@jfun/analytics`** — `Track.ev('level_start'|'level_complete', {level})` +
  `campaign_complete` (fired ONCE, on the first clear that completes the full
  set — never on last-level replays or dev-jumped holes). `level_start` fires on
  genuine level entries (boot, advance, dot switch) — NOT on fail-retry or
  restart of the current level. Vendored at `web/js/vendor/analytics.js`.
  `CUT_GA_ID` is empty (web inert) until a Firebase project + measurement id is
  wired at release. **Do NOT hand-roll a `track()` wrapper** — use `Track.ev`
  (studio handbook lesson).
- **dev flag** — `DEV_UNLOCK` (`#if DEBUG` native `window.__DEV_BUILD`, or
  plain-http localhost/private-LAN origins) now gates only dev diagnostics
  (audio debug trail). Level jumping for dev/tests: `?level=N` or
  `__game.setLevel` — there is NO in-game level select (Qi product call).
- **pause-on-background + resume hardening** — `visibilitychange` suspends the
  AudioContext when hidden and resumes WITH BACKOFF RETRIES on return; all
  gesture handlers heal via `state!=='running'` (iOS parks the context in the
  Safari-only `'interrupted'` state after backgrounding — `==='suspended'`
  checks never fire); the native shell re-activates the AVAudioSession on
  `didBecomeActive`. **Full playbook: `docs/handbook/08-ios-webaudio.md` — read
  it before touching audio anywhere.**
- **music bed replaced — "Night Kalimba"** (product call, Qi 2026-07-06; two
  iterations). The handoff's low detuned-saw drone read as scary; so did a warm
  lullaby PAD + sparse random plucks (any sustained drone under a dark night
  scene is eerie, and sparse random music-box notes are a horror trope). The
  keeper is SIMPLE: a fixed 8-bar kalimba tune in C major (C→G→Am→F), steady
  quarter notes at 76 BPM, soft plucked sines only, zero randomness — predictable
  like a toy music box. Lookahead scheduling on the audio clock (setTimeout alone
  jitters audibly). Same music bus/gain (0.16) and start/stop API. SFX
  (snip/creak/thump/wah/chime/whoosh) remain faithful to the handoff.
- **stall watchdog threshold `0.05*H`** (reference: `0.02*H`) — the reference
  value sits BELOW the sim's contact-jitter noise floor (gravity re-injects
  `G*DT² = 0.0167*H` px/s per step), so a crate perched tilted on the basket rim
  with a severed-rope remnant attached rocked at 17–30 px/s forever and the
  watchdog never fired → unrecoverable dead-end, hit on device (L2, wrong cut
  order). Repro + invariant pinned in `sim-tests.cjs` ("stall pin": after
  wrong-order cuts at any timing, a crate may win/fail or hang ABOVE `0.6H`,
  never rest below it in `play`).
- **pad TRAMPOLINE** — the reference's per-corner pad bounce (`e=1.05` in
  `resolveSeg`) gets averaged away by the rigid box links: one corner rebounds,
  three keep falling, the constraint solver splits the difference → the crate
  landed DEAD and **L5 was unsolvable** (only player freedom is when to cut; a
  static drop always rested on the pad). Fix in `collideBox`: a real pad impact
  (`vn > 0.10*H` px/s) reflects the WHOLE box's velocity about the pad normal at
  **e=1.25** (matches the design's own pad cue, which animates a 1.6× height
  ratio = e≈1.25; 1.05 clips the L5 basket rim by ~4px), tangential mostly
  absorbed (`fr=0.3` — fr=1.0 slings the crate off-field). Slow/grazing contact
  keeps reference behavior so boxes can rest on pads.
- **severed tails are one-way followers** — rope nodes weigh mass 1 vs the
  crate's total 16, so a ~12-node severed tail (75% of crate mass!) yanked the
  crate mid-flight (killed the pad launch: measured vx 234→-2; fed the rim-perch
  rocking). On cut, `relaxFreeRopes` marks unpinned rope components `freeTail`
  (+im 1→3); the constraint solver applies tail↔box corrections to the TAIL side
  only, and a pad launch flings the tail along with the box (zero relative
  velocity). Anchored chains and the uncut pulley line keep designed mass —
  pendulum/counterweight feel untouched. **This made L5 deterministic: any cut
  height wins, landing 3px from basket center.**
- **L8 frozen assembly + winch** — the authored counterweight tableau is NOT a
  physical equilibrium: a crate on a diagonal rope pendulums toward plumb (which
  is over the basket → one line-cut would win), and solving tension through the
  free 4x-mass decoy makes a perpetual bungee (crate hauled to the pulley and
  back forever — reproduced in the pristine reference). Fix: crate + decoy are
  PINNED at build (`lockedIm` on the boxes) and released on the level's first
  cut; the released decoy carries per-particle damping 0.95 (`haulDamp`) because
  a free-falling decoy outruns the 10-iteration rope solver — the line
  solver-stretches instead of hauling and the crate just swings off slack.
  Outcome: restraint cut → dramatic winch haul over the pulley INTO the basket
  (wins in one cut — the README's optional second line-cut still works
  mid-haul); line cut first → crate drops onto the spikes (fail → retry). Also:
  `relaxFreeRopes`/the trampoline fling treat a rope touching TWO boxes as
  STRUCTURAL (the counterweight line), never a decorative tail.
- **floor is survivable; spikes kill** — the reference's lethal-everywhere floor
  made spike placement fake stakes ("if drop out of bucket anyway fails" — Qi).
  A crate landing on bare floor thuds, rests, and cracks after 48 steps
  (`crateGrounded`/`groundedT`); spikes stay instant. Misses read fair, spikes
  read dangerous.
- **every spike is MID-FLIGHT** (Qi review "L14/L15… similar cutter problem like
  4/5, review all") — a floor spike (at FLOORY, below every basket) only ever
  catches a crate that has already missed, so it's clutter. RULE: a spike must
  sit in a trajectory a wrong/lazy move actually flies through, while the taught
  arc clears it. L4/L7 (done earlier), plus: L8 raised into the wrong-cut plummet
  (0.52H, x0.10-0.48W; the winning restraint-first haul rises up-and-over and
  clears it); L14/L15 trolley + L10 balloon-swing → raised LEFT shelves at 0.70H
  that shred an early/impatient release (all winning arcs live to the right;
  L10's shelf sits below the buoyant pair's float line so the swing never touches
  it — pinned l10floatSafe). L11 pad-lob breather / L12 flanking floors / L20
  flanking floors → REMOVED (their pad, ceiling spike, and pulse gate are the
  real hazards; a miss just thuds + retries). Pinned: l8line/l8restraint,
  l14early/l15early/l10early (die MID-AIR, y≤0.80H, not floor-thud).
- **level-local clock** — `buildLevel` resets `stepCount=0`, so pulse gates start
  at a FIXED phase every load/retry (`spikeExt` reads `stepCount*DT`). Before
  this the gate sat at a random phase of the global clock: unfair (the timing a
  player learns didn't repeat) AND made the pulse-level sim windows drift run-to-
  run (l17 flaked to all-fail). All time-relative state (cutT/popT ages) is
  recreated in the same buildLevel, so zeroing is safe. The ending-smoke finale
  combo is now a fixed known-winner (cut tether t=0, pop +60 steps).
- **campaign ending** — winning L20 starts `phase='end'`: rising paper-lantern
  festival + confetti + staged `#endcard` — four lines on CSS
  transition-delays: "ALL CRATES HOME" → "all 20 levels cleared" (.8s) → "new
  levels on the way — stay tuned" (1.7s) → muted "tap to play again" (4.5s,
  rebuilds L1). Pinned in sim-tests (ending smoke).
- **Settings reworked + "How to play"** (Qi product call, 2026-07-07) — the
  demo-gated level grid and "Replay tutorials" are GONE; "Restart level" is
  "Restart"; an always-available **"How to play"** opens a paged tutorial
  overlay (`openHowto`/`drawHowto` + `#howto` DOM chrome): 7 looping wordless
  mini-demos (cut → spikes → pad → pulley → balloon → trolley → pulse gate) in
  the cue system's visual language over a near-opaque scrim, one short caption
  each, tap to advance, ✕ or last-page tap to close. Game pauses while open
  (`closeSettings` keeps `paused` true if the tutorial is open under the fading
  sheet). Dev: `?panel=howto`, `__game.howto(p)` (−1 closes). Pinned in
  sim-tests (howto smoke: 7 distinct captioned pages, close unfreezes).
  Review-hardened: `#endcard` is hidden under `body.howto-open` (it's a DOM
  overlay above the canvas scrim — would otherwise bleed through if opened during
  phase 'end'); `pointermove` bails while `paused` (a pointer captured before the
  overlay opened would keep cutting the frozen board via `setPointerCapture`).
- **`window.__game`** debug hooks: `state()`, `stepN(n)`, `cutAt(x1,y1,x2,y2)`,
  `ropes()`, `setLevel(i)`, `dims()` — used by the sim test + browser verification.

## Architecture (single-file sim by design)

One cohesive `game.js` holds audio → math/collision → fx → world-building →
`buildLevel(0..7)` → simulation (`step`) → cutting → rendering → input → HUD →
settings → boot. The reference is idiomatic immediate-mode 2D canvas; the handoff
says "port structure directly" for web, so it is NOT split into engine/physics
modules (unlike Tilt). Keep it one file.

- **Physics:** fixed `DT=1/120` Verlet, accumulator-driven; 10 constraint
  relaxations/step. Rigid box links (edges + 2 diagonals) solve both ways; rope
  links **only pull** (slack, never compress). Crate inverse-mass `0.25`, decoy
  `0.0625`. Everything scales off `S=W/7`.
- **Win:** all 4 crate corners inside the basket AND avg speed `< 0.25H` for 36
  consecutive steps → `win`, auto-advance after 120 steps. **Fail:** crate corner
  hits floor/spike, or leaves field, or the 300-step stall watchdog. **Fail →
  retry same level after 96 steps.**

## Discipline (non-negotiable)

- **`bash scripts/dev/test.sh` after EVERY edit.** Syntax (`node --check`) + a
  headless-Chrome regression net (`scripts/dev/sim-tests.cjs`) that drives the
  REAL ported game via `window.__game`: all 8 levels build and reach terminal
  (or sane) states, level 1 is a deterministic win, the L2 wrong-order stall pin
  holds, and **the L5 pad pin: cut at any height → trampoline → WIN**.
  - The suite runs at a TRUE phone viewport via
    `Emulation.setDeviceMetricsOverride(390x844)` — `--window-size` alone is a
    TRAP: Chromium clamps window width to ~500px and the sim silently runs at a
    wide aspect (L5's arc behaves differently there).
  - Levels 2/3/6/7 need fine cut *timing* (order/pendulum/swing/pulley) — those
    are feel-tested on device, not auto-solved.
  - The suite does NOT exercise audio init (`ensureAudio` needs a real
    pointerdown; `cutAt` bypasses it) — verify audio via preview_click + an
    instrumented AudioContext when touching audio code.
- **UI changes need a real render** — serve `web/` (preview `cut-web` on :8783)
  and LOOK. The Claude_Preview MCP clips viewports > ~500px; use ≤ mobile widths.
  Drive the sim headlessly with `__game.stepN`/`cutAt`. The preview may run rAF
  live (~120fps) — time-based animations race screenshots; verify canvas
  animation frames with a synchronous `stepN` + `getImageData` pixel probe in
  ONE eval instead.

## iOS shell (done 2026-07-06)

`ios/` generated with `npx cap add ios`, then patched to the studio pattern:
- pbxproj `DEVELOPMENT_TEAM=Y3T546NP6T`; bundle `com.jfun.cut`.
- Info.plist: **portrait-only iPhone**, `UIRequiresFullScreen`, **status bar
  hidden** (`UIStatusBarHidden` + `UIViewControllerBasedStatusBarAppearance=false`
  — the design mandates immersive fullscreen), `ITSAppUsesNonExemptEncryption=false`.
- `MainViewController.swift` injects `window.__DEV_BUILD=true` under `#if DEBUG`
  (Main.storyboard points at it) → dev diagnostics on device Debug builds only.
- `@capacitor/haptics` wired (cap sync auto-added it to CapApp-SPM); `vibe()` in
  game.js routes to it on native.
- App icon: procedural Night Rig 1024 RGB (NO alpha), generator kept at
  `/tmp/cut_icon.py` pattern — regenerate rather than hand-edit.
- Deploy: `bash scripts/dev/deploy_ios.sh` (self-test → cap sync → cache-bust →
  build → devicectl install/launch; install auto-retries the benign
  "Connection reset by peer" transient). Liveness check: dump
  `xcrun devicectl device info processes --device <ID> --json-output /tmp/x.json`
  then grep the file — devicectl `--filter` predicates on `executable` throw.

## Status / follow-ons (not done yet)

- **Firebase** — create a `com.jfun.cut` project, add `@capacitor-firebase/analytics`
  + `@capacitor-firebase/app`, drop `GoogleService-Info.plist`, set `CUT_GA_ID`.
- App Store: screenshots/TestFlight/support+privacy per `docs/handbook/07-app-store-release.md`.
