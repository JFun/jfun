> **UPDATE (latest design):** in-game header = **layers (left) · LEVEL (center) · settings ⚙ (right)**. The top-right **restart button was removed** (deemed meaningless in a time-chase). Retry now lives only on the **DEAD END** card (TRY AGAIN) and **Replay** on the win card + level-select; the rotate-cw SVG is used inline in those card buttons (never the ⟳ text glyph). **Settings** is included as the final screen of the complete design.

# Tilt — Level Select + Levels Entry + Dead-End (spec for porting)

These three are **design-only** in the mock (`Tilt - Redesign Directions.dc.html`)
and were NOT in the earlier code handoff. Build them from this spec + the
screenshots `screenshots/08-level-select-grid.png`,
`09-dead-end-and-play.png`, `10-levels-entry-flow.png`. All values are final.

Palette (Arcade Night): bg radial `130% 100% at 50% -20%` `#262e68→#141949→#0a0d2c`;
panel `#252c5e`; panel2 `#141838`; line `#3d4691`; ink `#eef1ff`; dim `#7d86cf`;
dim2 `#aab3ee`; gold `#ffc63e`/`#ff9d1b`/edge `#b46a00`; good `#3ce07d`; bad `#ff8296`.
Display = Lilita One; UI = Nunito. Status bar: the MOCK hides it for presentation;
the real app keeps the iOS status bar (ignore that difference).

## 1. Level Select (the home — app opens here)

Full-screen, column. Screenshot 08.

- **Header** (padding ~56/18/12): back-chevron button left (38px, radius 12,
  bg `#252c5e`, border `#3d4691`, chevron `#aab3ee`); `TILT` wordmark centered
  (Lilita One 20px, gold gradient `#ffe9a8→#ffc63e`, letter-spacing .14em);
  star-counter pill right (bg `#252c5e`, border `#3d4691`, radius 999, `★`
  `#ffc63e` + total in Lilita 13px `#fff`, e.g. `25`).
- Eyebrow `SELECT A LEVEL` (Nunito 800 10px, ls .24em, `#7d86cf`).
- **Grid**: 5 columns, gap 10–12, padding ~18. 30 tiles, ~58–66px tall, radius 14–16.
  - **Cleared** tile: bg `#252c5e`, border `#3d4691`, shadow `0 4px 10px -4px #00000090`;
    number Lilita 18–21px `#eef1ff`; stars row (filled `#ffc63e`, empty `#454c7d`,
    ~9–10px); best time Nunito 800 9px `#7d86cf`. Tap → replay.
  - **Frontier** (current) tile: bg gradient `#2c3373→#1f2554`, border 2px `#ffc63e`,
    shadow `0 0 0 4px #ffc63e22, 0 6px 16px -6px #000`; number Lilita 20–23px `#fff`;
    `PLAY` label Nunito 900 8–9px, ls .14em, `#ffc63e`.
  - **Locked** tile: bg `#171c40`, border `#262c55`, opacity .8; padlock SVG
    `#5d65a8`; number Nunito 800 8–9px `#454c7d` at bottom.
- Grid scrolls; header fixed.

## 2. Progression rules

- **Linear unlock (frontier model).** Level N unlocks when N-1 is cleared.
  Cleared levels stay open to replay for a better time. Ship **hard lock**
  (the dead-end retry is already free, so no safety-skip needed initially).
- Mechanics are introduced in order (walls debut ~L4–L5), so linear order matters.
- **Stars = time tiers, not a second currency** (no lives, no gates to buy):
  - 1★ = cleared it
  - 2★ = under the target time
  - 3★ = under par (the engine's BFS-optimal solve length / time)
  The engine already computes par per level; derive the 2★ threshold from it.
- Star counter in the header = sum of earned stars (max 90 = 30×3).
- Save per level: `{ cleared: bool, stars: 0–3, bestMs: number }` in the same
  storage `game.js` already uses for best times.

## 3. In-game header (ALL play screens) — screenshots 09/10

Three elements, `justify-content:space-between`, LEVEL absolutely centered:
- **Left — levels button**: 40px circle, bg `#252c5e`, border `#3d4691`,
  shadow `0 4px 12px -2px #00000090`. Icon = **layers** glyph (Feather "layers":
  `polygon 12 2 2 7 12 12 22 7 12 2` + two polylines `2 17 12 22 22 17` /
  `2 12 12 17 22 12`), stroke `#aab3ee`, ~21px. **Do NOT use a 2×2 grid glyph —
  it reads as a generic apps/system menu.** Tapping this opens the Level Select.
- **Center — LEVEL pill**: gold gradient `#ffc63e→#ff9d1b`, text `#3d2400`
  Nunito 900 12px ls .05em, padding 8×15, radius 999.
- **Right — restart**: 40px circle (same as left), icon = drawn rotate-cw SVG
  (`polyline 23 4 23 10 17 10` + `path M20.49 15a9 9 0 1 1-2.12-9.36L23 10`),
  stroke `#aab3ee`. **Never the ⟳ text glyph** (its ink reads tiny); this SVG is
  also used inline in card buttons at 17px.

## 4. Dead-End card (path + X) — screenshot 09 left

Show ONLY when the engine has proven the culprit ball cannot reach its hole.
A marble slides until it hits something and can curve around a single blocker,
so a straight line + X is NOT a proof on its own — gate it behind a real
reachability check (BFS over tilt-slides from the live position; if the hole
cell is unreachable, it's dead). The mock's example is genuinely dead because
the green hole has **no open orthogonal neighbor** (a sunk ball caps it above,
a wall on the right). If instead the lock is global (no order fills every hole),
fall back to the statless card "No way to finish from this position".

Board stays fully lit (no dim). Overlays, drawn on the board:
- **Culprit ball**: green ring, gentle pulse, `lineWidth 4`, `shadowColor` =
  ball color, `shadowBlur 12`.
- **Intent path**: dashed line (dash 7/7, animated offset) from the ball toward
  its hole — bright from ball→blocker, `globalAlpha .4` from blocker→hole,
  stroke = ball color.
- **Red X on the blocker** (the sunk ball or wall that caps the hole):
  `lineWidth 6`, `#ff4d6b`, `lineCap round`, `shadowBlur 10`.
- **Hole ring**: the target hole ringed in the ball's color.
- **Card sits BELOW the board** (not a full-screen overlay): panel `#1b2050`,
  border `#3d4691`, radius 22, padding 18/20/16, shadow `0 -8px 30px -18px #000`.
  h2 `DEAD END!` (Lilita 23px, `#fff`, shadow `0 3px 0 #14183c`); line
  `This ball can't reach its hole` (Nunito 800 13px, `#ff8296`); full-width
  primary `TRY AGAIN` (gold gradient, `#3d2400`, 900 15px) with the restart SVG
  inline at 17px.

Board + card layout: header, timer, board **top-aligned right under the timer**
(flex:0, not vertically centered — so the board sits at the same height whether
or not a card is present), spacer, then the card. Board canvas display width
~320px inside the rim gutter.

## 5. Settings (MVP) — screenshot 11

Modal card, Arcade Night. **Two entry points**: a ⚙ (cog) on the **home**
(level-select) header, and an in-game ⚙ **paired with restart at the top-right**
of the play header (layers-left · LEVEL-center · [⚙ restart]-right). **Never put
it at the bottom** — that's the iOS home-indicator gesture zone (repo CLAUDE.md).

Card: gradient `#2b3268→#1b2050`, border 2px `#4a54a0`, radius 26, `pop` anim.
Title `SETTINGS` (Lilita One 22px, ls .06em, `#fff`), close `✕` top-right (32px
circle, `#141838`/`#3d4691`).

**Three toggle rows** (each: bg `#141838`, border `#3d4691`, radius 14, padding
11×12): a 34px icon tile (radius 10, `#252c5e`) + label (Nunito 800 14px
`#eef1ff`) + toggle. Icon tint `#ffc63e` when on, `#7d86cf` when off.
- **Sound Effects** → gates the SFX calls (`sndFail`/`sndSink`/…).
- **Music** → a looping background track. **NEW — the app has no music track
  yet**; either add one or hide this row until it exists.
- **Vibration** → gates `haptic()` (Capacitor Haptics on device).

Toggle **ON**: 52×30 pill, track gradient `#ffc63e→#ff9d1b`, 24px white knob
right, `inset 0 1px 3px #00000040`. **OFF**: track `#2c3358`, border `#3d4691`,
grey knob `#8b93c8` left.

Divider `#3d4691`, then ONE secondary row: **How to Play** (30px icon tile +
label `#dfe4ff` 700 13.5px + chevron `#7d86cf`) — replays the tutorial card.
Restore Purchases and Rate Tilt are intentionally **omitted for MVP**. Footer
version line `Tilt v1.0 · com.jfun.tilt` (700 11px `#5d65a8`, centered).

Persist all three flags in the same storage as best-times; **default all ON**.
Entry glyph = cog SVG (Feather "settings").
