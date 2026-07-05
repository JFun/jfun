# Handoff: Tilt — "Arcade Night" UI redesign

Target: `jfun/apps/tilt/web/` (vanilla JS, no build step, Capacitor iOS shell `com.jfun.tilt`).

## Overview

Full visual redesign of Tilt in the **Arcade Night** direction (deep-indigo night,
hero timer, gold candy chips, neon-halo holes, 3D press-buttons — Block Blast /
Royal Match energy). Covers the play screen, win card, stuck/game-over card,
tutorial card, animated visual hint chips + toast, and the app icon.

## About the files in this bundle

**`tilt-web/` is NOT a mockup — it is drop-in production code for this repo's
no-build vanilla stack.** It was produced by applying surgical string
replacements to the real `apps/tilt/web/` sources (drawing functions, card
markup, HUD DOM/CSS only). The design references (side-by-side phone mocks of
every screen, three explored directions, share graphic, icon at all sizes) live
in the design project as `Tilt — Redesign Directions.dc.html` and the 1:1
baseline `Tilt — Current UI.dc.html`; this README is self-sufficient without them.

## Fidelity

**High-fidelity.** Every color, size, and shadow below is final and already
implemented in `tilt-web/`. Your job is integration + the follow-ups list, not
re-styling.

## Task for the coding session

1. Copy `tilt-web/index.html`, `tilt-web/style.css`, `tilt-web/js/game.js` over
   `apps/tilt/web/` (only these three — engine.js / physics.js /
   tutorial-script.js / vendor are intentionally untouched).
2. `bash scripts/dev/test.sh` — must stay green (26 engine + 51 physics tests).
   The marble recolor is a game.js-side `SKIN` map; engine `PAL` and the color
   KEYS are untouched, so determinism pins are unaffected.
3. **Vendor the fonts** (repo is offline-first, no-build): download Lilita One
   400 + Nunito 700/800/900 woff2 into `web/fonts/`, replace the Google Fonts
   `<link>` in index.html with `@font-face` in style.css. Fallback stack is
   already `'Arial Rounded MT Bold', -apple-system`.
4. `assets/icon-1024.png` → the iOS AppIcon set in
   `apps/tilt/ios/App/App/Assets.xcassets` (full-bleed square; iOS masks it).
5. Deploy via `bash scripts/dev/deploy_ios.sh`; judge feel on device
   (checklist in `tilt-web/PORT_NOTES.md`).
6. Preview rule from the repo's CLAUDE.md still applies: verify UI with the
   `window.__tilt` dev hook (`stepN`, `goto`, `showTut`) — preview browsers
   suspend rAF.

## Screens / Views

### 1. Play screen
- **Layout** (`#wrap`, max-width 480, column, `justify-content:space-between`,
  padding `max(12px, safe-top) 16px max(14px, safe-bottom)`, gap 12):
  1. `.meta` row — LEVEL chip left, ⟳ restart right. **No wordmark during play.**
  2. `.timer` block, centered — `TIME` eyebrow / hero number / best line.
  3. `#stage` (flex:1) — `.trayframe` wrapping `#tray` canvas, `.hint` under it (gap 14).
- **LEVEL chip**: gold gradient `180deg #ffc63e→#ff9d1b`, text `#3d2400` 900
  13px ls .06em, padding 9×15, radius 999, single-layer: soft ambient
  `0 8px 18px -6px #00000090` only (no bottom edge of any kind).
- **Hero timer**: eyebrow `TIME` 900 12px ls .22em `#7d86cf`; number Lilita One
  56px white, `text-shadow 0 4px 0 #1c2150, 0 10px 26px #00000070`, tabular-nums,
  gold `s` unit 32px `#ffc63e` (static span — JS writes the number only);
  below: `BEST 9.8s` / `FIRST RUN` 800 12px ls .1em `#7d86cf`.
- **Restart**: 40px circle, bg `#252c5e`, border `#3d4691`, glyph ⟳ 18px
  `#aab3ee`, soft shadow `0 4px 12px -2px #00000090` (no 3D edge on circles);
  :active sinks 1px.
- **Tray frame** (DOM, outside the play canvas): gradient `180deg #2c3373→#1f2554`,
  border 2px `#4a54a0`, radius 24, padding 9, shadow `0 26px 54px -18px #000000d0`.
- **Tray canvas**: felt `180deg #171c46→#0f1233`, radius 15, inset highlights
  `inset 0 2px 0 #ffffff14, inset 0 0 0 1.5px #0a0d26`. Sizing budget in
  `sizeBoards()`: width −54, height −335.
- **Hint area**: a visual glyph chip — see §6. Built by `flashHint(text, hot, glyph)`;
  `.hint` is a centered flex box, min-height 52px.

### 2. Board art (canvas painters in game.js)
- **Grid**: dots at cell intersections, r 1.4, `#ffffff0f` (no lines).
- **Holes** (`roundedHole`): cup fill `#070918` r×1.1; ring `lineWidth 5`,
  stroke = marble color with `shadowColor = color, shadowBlur 12` (neon halo);
  dimple r×0.5 fill `color+"30"`.
- **Marbles** (`marbleGrad`/`drawMarbleAt`): grounded ellipse shadow
  (cx, cy+0.55r, rx 0.85r, ry 0.5r, `#00000052`); radial gradient
  `0 #ffffff → 0.16 shade(+60) → 0.55 color → 1 shade(−70)` (highlight origin
  −0.35r, −0.42r); rim stroke 1.2px `shade(−85)+"88"`; speculars: 0.2r dot at
  (−0.3r, −0.36r) `#ffffffe8` + 0.09r dot at (−0.05r, −0.52r) `#ffffff90`.
  Rolling swirl cue unchanged from original.
- **Walls** (`drawBlocks`): body `180deg #4a54a0→#2e3670`, stroke `#6a76c9`,
  top bevel `#ffffff2b`, drop shadow unchanged.
- **Ready text**: `TAP TO START`, Lilita One at `CELL×0.4`, `#ffffffd9`.
- **SKIN palette** (render-only): r `#ff4d6b` g `#3ce07d` b `#43a6ff`
  y `#ffd23e` o `#ff8a2a` p `#b06bff` w `#f2f5ff`.

### 3. Win card (`showTiltResult`)
Overlay `#080a20d9` + blur 8. Card: max-width 350, gradient `180deg #2b3268→#1b2050`,
border 2px `#4a54a0`, radius 26, padding `24 22 22`, `overflow:hidden`,
shadow `0 30px 80px -20px #000, inset 0 1px 0 #ffffff22`, pop animation
(`scale .85→1`, .35s `cubic-bezier(.2,1.4,.4,1)`).
Contents top→bottom: gold radial glow (290×230 at top −52, `#ffc63e30→transparent`);
★★★ row (38/52/38px, `#ffc63e`, soft `drop-shadow(0 3px 3px rgba(6,8,28,.55))` —
never a hard offset copy, it reads as a second star — outer stars rotated ∓10°);
h2 `LEVEL {n} CLEAR!` Lilita 26px white shadow `0 3px 0 #14183c`;
status line 800 13px — `New best!` `#3ce07d` or `Solved` gold; 2 stat chips
(TIME / BEST — ball count is meaningless to the player: bg `#141838`, border `#3d4691`,
radius 14, padding 10×8, label 900 10px ls .18em `#7d86cf`, value Lilita 20px,
BEST value gold);
buttons: one row — `NEXT ▸` primary (flex 1.4 visual weight) + `⟳ Replay`.

### 4. Stuck card (`showGameOver`)
Same card shell. h2 `STUCK!`; reason line `#ff8296`; 2 chips (SUNK n/m, TIME);
full-width primary `⟳ TRY AGAIN`. (Design canvas also shows an optional
wedged-ball vignette — red ball dipped in a blue ring with gold chevrons —
not implemented in code; add only if asked.)

### 5. Tutorial card (`showTutorial`)
Same card shell. h2 22px `ROLL EACH BALL INTO<br>ITS MATCHING HOLE`; the live
physics demo canvas (unchanged mechanics); caption `.creature` `#aab3ee`;
primary `GOT IT ▸`. Mini-phone re-dress: body `#2e356f`, stroke `#6a76c9`,
screen/slit `#0c102e`, chevrons `rgba(255,198,62,a)` lw 3.5.

### 6. Transient states — visual hint chips + on-board warning
Every hint is a chip: `[glyph] short text`, centered under the tray.
- Chip: bg `#252c5e`, border 1px `#3d4691`, radius 999, padding `7px 16px 7px 12px`,
  shadow `0 6px 18px -6px #000000a0`; text Nunito 800 13px gold, `<b>` runs white.
  Warning chips: border `#ff829666`, text `#ff8296`.
- Glyphs (plain DOM + CSS keyframes, no canvas, no rAF): tipping phone 22×34 with
  rolling red ball (rock/rollX 2.6s) — onboarding; 18px bevel wall block — new
  mechanics; **wrong-hole demo** — 24×36 phone with blue ring bottom-right and
  wedged red ball that strains, then the phone TIPS steep (3D:
  `perspective(80px) rotateY(-34deg)` — same language as the tutorial
  mini-phone; a flat `rotate()` reads as spinning, not tilting) and the ball pops
  out and rolls away (popRock/popOut, 2.8s loop — shows the move, not just an
  icon); slashed phone — motion blocked. Onboarding rock likewise tips via
  `perspective(80px) rotateY(±26deg)`.
- Copy (short — the glyph carries it): “Tap the tray, then tilt” · “Walls! Bank
  shots off them” · “Tilt hard — it pops free!” · “Motion blocked — quit and
  reopen the app”. Calibration happens silently (it's instant and automatic —
  a message there flashes too briefly to read and informs nothing).
- Toast unchanged: bg `#252c5e`, border `#3d4691`, radius 999, padding 10×18,
  800 13px, shadow `0 8px 24px -8px #000000c0`.
- **Wrong hole is ALSO drawn on the board** (`drawLodgedWarnings`): the lodged
  ball pulses a ring in its own color (radius `R×(1.4+0.28·pulse)`, alpha
  `.35+.45·pulse`, `sin(t×6)`, lw 3.5) and 3 gold chevrons (`rgba(255,198,62,a)`,
  lw 4, round caps) march from the ball toward its matching unfilled hole
  (walk phase `(t×1.8)%1`, distances `R×(2.9+i×1.1+ph×1.3)` — starts clear of
  the pulsing ring so no chevron overlaps the ball).

### 7. New-mechanic intro card (walls debut)
Once-only card when the first walls level starts (`sv.wallsSeen`); pattern
reuses for hills later. Same card shell as tutorial. Contents: small `.g-wall`
glyph (26px) → h2 `NEW: WALLS!` (Lilita 26) → 300×220 demo canvas → caption →
primary `GOT IT ▸`. Demo: 7×5 world, wall column x=3 (3 cells), red marble
(1.3, 2.5), red hole (6.55, 1.35 — on the right-edge climb lane so the bank
shot sinks); beats: right 1.5s “Walls stop your marbles” → down-right 1.5s
“Slide along them…” → up-right 1.6s “…bank it up…” → gentle down-right 1.7s
“…and drop it in!” (slow arrival — fast balls roll over holes) → rest 1.0s,
capture + sink, loop with reset.

## Interactions & Behavior

- Buttons: SINGLE-LAYER (device feedback: any hard bottom edge — offset shadow
  or thick border — reads as a doubled button). Primary: gold gradient, no
  border, `box-shadow:0 6px 16px -6px #000000a0`. Secondary: `#252c5e`, 1px
  `#3d4691` border, `0 6px 14px -6px #000000a0`. Press = `translateY(2px)` +
  shadow tightens to `0 3px 8px -4px`. Transition `.08s`.
- Card entrance: `pop` keyframes as above.
- **Hint chips** animate via CSS keyframes only (`rock`/`rollX`/`settle`/`shakeX`)
  — no rAF, no measurable cost on old devices.
- Everything else (tap-to-start, calibration, dead-end flow, haptics, audio)
  is untouched game logic.

## Design Tokens

- **Colors**: bg `#0a0d2c` (radial `130% 100% at 50% −20%`: `#262e68→#141949→#0a0d2c`);
  panel `#252c5e`; panel2 `#141838`; line `#3d4691`; ink `#eef1ff`;
  dim `#7d86cf`; dim2 `#aab3ee`; gold `#ffc63e`/`#ff9d1b`/edge `#b46a00`;
  good `#3ce07d`; bad `#ff8296`.
- **Type**: display = Lilita One 400 (56 timer / 26–27 card h2 / 20 chip values);
  UI = Nunito 700–900 (13px body weight 800, eyebrows 900 + tracking).
- **Radii**: chips/pills 999 · buttons 16 · cards 26 · tray frame 24 ·
  felt 15 · stat chips 14.
- **Shadows**: buttons/chips are single-layer with one soft blurred shadow —
  never hard offset box-shadows, thick bottom borders, or offset text-shadows
  (all read as doubled layers on device); stars + circles soft drop-shadows;
  card `0 30px 80px −20px #000`; frame `0 26px 54px −18px #000000d0`.

## Assets

- `assets/icon-1024.png` — App Store icon (generated from the same canvas
  painters; source spec: bg `180deg #2e356f→#1a2052→#0c0f33`, dot grid rotated
  −0.14rad, gold ring at 62%/66% r 21% with halo, red marble at 38%/36% r 20%).
- Fonts to vendor: Lilita One 400, Nunito 700/800/900 (step 3 above).

## Files

- `tilt-web/index.html` — new DOM (all ids game.js queries preserved)
- `tilt-web/style.css` — full Arcade Night stylesheet
- `tilt-web/js/game.js` — transformed game layer (drawing + card markup + share)
- `tilt-web/PORT_NOTES.md` — change log + device feel-test checklist
- `assets/icon-1024.png`
- `screenshots/` — captures of the RUNNING port (desktop-shaped; on device it's
  the same UI in portrait): 01 main L1 (onboarding chip) · 02 main L5 (walls
  chip) · 03 tutorial card · 04 win card · 05 stuck card · 06 toast ·
  07 wrong-hole on-board warning (from the design canvas, 6a) · 08 walls intro
  card (running port)
