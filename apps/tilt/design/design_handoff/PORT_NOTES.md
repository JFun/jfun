# Arcade Night port — apps/tilt/web replacement

Design pass 2026-07. Drop-in: copy `index.html`, `style.css`, `js/game.js` over
`apps/tilt/web/` (the other `js/*` files here are untouched copies for running
this folder standalone — don't copy them back, yours are canonical).

## What changed (and what didn't)

- **engine.js / physics.js / tutorial-script.js: ZERO changes.** Marble recolor
  is a game.js-side `SKIN` map; engine `PAL` and color keys are untouched, so
  all determinism tests + pins stay green. Run `bash scripts/dev/test.sh` anyway.
  (An interior-only hole placement was briefly explored and REVERTED — the
  rim gutter below solves the visual without touching layouts.)
- **index.html** — wordmark/tagline removed from the play screen; new hero
  TIMER block (`#timeV` now holds the number only, static gold `s` next to it,
  `#bestLab` shows `BEST 9.8s` / `FIRST RUN`). Level is a gold chip. All ids
  game.js queries are preserved. Google Fonts link added (Lilita One + Nunito)
  — **vendor the woff2 into `fonts/` + `@font-face` before release** so the
  display face survives offline; everything falls back to rounded system faces.
- **style.css** — full Arcade Night rewrite. Kept: `[hidden]` rule, no footer
  buttons, `.pill`-era ids/classes replaced (`.chip`, `.timer`, `.trayframe`).
  The raised frame is a DOM wrapper OUTSIDE the canvas — physics still owns the
  full canvas; play area unchanged.
- **js/game.js** — drawing + card markup only:
  - RIM GUTTER (design 2026-07): `sizeBoards` reserves `PAD ≈ 3%` of the tray;
    the canvas paints the rail band + felt itself (`paintRim`), and all play
    art draws translated by PAD. Border-cell hole rings and rim-hugging balls
    now sit fully on the felt — nothing is ever cut, no layout changes.
    Hole halos still clip at the felt edge (reads as tucked under the rail)
  - holes: neon-halo ring (lw 5, `shadowBlur`), deeper cup, wider dimple
  - marbles: grounded ellipse shadow, dark rim stroke, double specular,
    hotter gradient (0.16/0.55 stops)
  - grid: intersection dots instead of lines; walls recolored to indigo
  - "TAP TO START" in the display face
  - dead ends (final): a dead end = no solution from the current state, NEVER
    a timer. Card is ONE line — `DEAD END!` + “No way to finish from this
    position” — no stats (sunk/time add nothing). `showGameOver(reason)`
    accepts an optional cause line for future detectors. Detectable today:
    all-wedged past 3s grace. TODO(engine) in checkDeadEnd: prove more states
  - win card: glow + ★★★ + TIME/BEST stat chips (BALLS removed — meaningless;
    Share was explored in design turn 3, cut in turn 5)
  - buttons + chips are SINGLE-LAYER (device feedback 2026-07, two rounds: hard
    offset box-shadows AND thick border-bottom edges both read as doubled
    buttons). One soft shadow; press = sink 2px, shadow tightens
  - stuck card: `STUCK!` + chips
  - hints are VISUAL chips (design 5a): `flashHint(text, hot, glyph)` builds
    `[glyph] short text` — tipping phone (onboarding), wall block (new mechanic;
    hills reuse it for now), wrong-hole DEMO (design 8a: phone snaps steep, the
    wedged ball pops out of the ring — a 2.8s loop that shows the move; it
    MIRRORS at plunk time to tip toward the ball's true hole so chip + chevrons
    agree), slashed
    phone (motion blocked). Calibration is SILENT (device feedback: the message
    flashed too fast to read and informed nothing). Glyphs are plain DOM,
    animated by CSS keyframes (rock/rollX/popRock/popOut) — zero rAF cost
  - wrong-hole is also shown ON THE BOARD (design 6a): the lodged ball pulses a
    ring in its own color + gold chevrons march toward its matching hole
    (`drawLodgedWarnings()`, draw-pass overlay, same lodge test as lodgedCount)
  - new-mechanic intro card (design 6b): walls debut → once-only `NEW: WALLS!`
    card with a real-physics bank-shot demo on the tipping mini-phone
    (`showMechanicIntro`, `sv.wallsSeen`; dev hook `__tilt.showWalls()`)
  - tutorial mini-phone re-dressed (indigo body, gold chevrons)
  - `sizeBoards` budgets: `-54` width (frame), `-335` height (timer + hint chip)

## Feel-test checklist (device)

- timer readable at arm's length; gold `s` not clipped at 480px-wide max
- hole halo (`shadowBlur 12`) perf on oldest target device — if the frame
  drops, halve the blur or pre-render holes to sprites
- hint chips: rock/settle/shake animations smooth; chip fits on 320px-wide screens
- lodged-ball pulse + chevrons readable but not distracting mid-run; walls intro
  card shows exactly once (then never — check `tilt.campaign.v1.wallsSeen`)
- stars/glow on the win card don't overflow `overflow:hidden` card radius

## Design source

`Tilt — Redesign Directions.dc.html` (1a + 2a + 3a/3b/3c) and the 1:1 baseline
in `Tilt — Current UI.dc.html`. App icon art: 3c (drawn at 512, export 1024).
