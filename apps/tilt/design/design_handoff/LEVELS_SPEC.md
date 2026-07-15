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

## 6. Depth plan (turn 20/21 designs — spec source: jfun/docs/longevity/tilt-depth.md)

Design-only (no code yet). Visual reference: the design canvas `Tilt - Redesign Directions.dc.html`, Turn 21 (screens 01–02 and 11–13 + the element ladder panel). Build order follows the doc's phases.

### Worlds home (replaces the flat level list as the app's home)
Vertical ladder of 9 world cards, linear unlock. Card: radius 16–18, per-world
gradient + ring color, eyebrow `WORLD N · LV a–b` (900 9px ls .18em #ffffff8c),
name Lilita One 15–22px, element line Nunito 700 10.5px #ffffffa6.
- Cleared: border `#3d4691`, right side green check + prog + gold stars.
- Current: border 2px ring color + `0 0 0 4px ring22` glow, PLAY pill
  (bg ring color, text #06222f), progress track `#0c1a28`/fill ring color.
- Locked: opacity .6, padlock, next world only gets a gold note
  ("Clear Foundry to unlock").
World palettes (c1/c2/ring): W1 Tabletop #2c3373/#1f2554/#ffc63e ·
W2 Foundry #642e18/#37170a/#ff8a2a (SHIPPED ✓) · W3 Chime #5a2a4d/#301529/#ff8fb0 ·
W3 Sirocco #1d5747/#0f2f26/#5fe0b0 · W4 Chime #5a2a4d/#301529/#ff8fb0 ·
W5 Highlands #2f5426/#172c12/#a3e05c · W6 Undercity #3a2a6b/#1c1340/#b06bff ·
W7 Confluence #243a63/#101c33/#eef1ff.
RIME (ice) CUT 2026-07-12. DUNE (sand) CUT 2026-07-13 after playtest — sand
only damped motion, no new decisions. The element bar is now: it must change
DECISIONS, not just motion. GATES (Foundry) promote to World 2 → 7-world
ladder. ⚠ Wind lanes (Sirocco) are the same force-modifier class as sand —
prototype-gate before committing; fallback promotion: Chime (bumpers).
Tapping a world opens the existing level grid re-skinned in that palette.

### World intro card (once per world, on entering)
Full-screen card in the world palette (Foundry: #452a14→#2b1a0b, border #8a5a2e; ember accents #ff8a2a→#d96a12).
Eyebrow WORLD N (ls .34em, ring color) · name Lilita 40px · element demo canvas
(board painters) · line "New: <element>." + one-sentence behavior · feel whisper
· ENTER button in ring color. Element = ONE visible physics rule per world;
param retunes ≤2 and never bare g-scaling; gravity rotation/inversion, timers,
touch verbs forbidden forever.

### Win card v2 (Phase 0 — retro-applied to the shipped 30)
Adds to the win card, top→bottom: medal strip B/S/G/D (26px letter circles,
bronze #cd8a4a silver #c8d0e8 gold #ffc63e diamond #7ee7ff; diamond chip
bg #0e2733, 2px border, NEW tag, note "Diamond appears after your first clear";
thresholds = bot P10/P40/P75, diamond P2) · feats list (2–3 per level:
no-clack / zero-lodge / no-stop; done = green check row, missed = dim) ·
gem chip (#1d1440, border #b06bff66) when the level's gem was collected.

### Collection (from home)
GEMS grid (5 cols): found = gem SVG in marble colors on #141838; missing = "?"
on #10142c. Hidden in ~1/3 of levels, collected by rolling over.
MARBLE SKINS 2×2: canvas-drawn marble + name + unlock condition
(default / 15 feats / 30 gold medals / all gems); equipped = gold border + tag.
Rule text: earned by medals, feats, gems — never bought.

### Daily Board (zero backend — pre-certified 90-day pack, ~200 bytes/level)
Header + streak chip (flame + count, border #ff8a2a66) · date Lilita 24 ·
board preview · B/S/G/D chips vs par · PLAY TODAY'S BOARD (gold) · week strip
(7 dots: check = played, ring = today, dim = future/missed) · ghost share button.
Same board for everyone; medals from certified bot percentiles.

### Element visual language (board painters; one per world)
plate & gate (W2 FOUNDRY — the next build): gate cell = wall while its paired
plate is empty; ANY marble parked on the plate opens it (color-agnostic);
leaving the plate closes it (never crushes — an occupied cell holds it open);
sink-all stays the only completion, so the keeper must come home too.
Visual: plate = gold pad ring #ffc63e (fill 1c→33 + glow when pressed); gate =
3 orange bars #ff8a2a sliding up into a wall-colored lintel (#5b67ba→#3a4390);
dotted #ff8a2a link line plate→gate, lit while held. Demo: drawGateDemo —
park → open → through → sunk, 5.6s loop; freeze frames at 1.5/2.6/3.5s give
the 3-beat strip (PARK / PASS / RELEASE). Params: gates[] + plateLinks[]
(≤2, per doc). Level arc 31–45: 31–33 teach · 34–38 gates in wall runs ·
39–42 two pairs, order matters · 43–45 keeper finales (free the keeper last).
Eng ~2–3d (conditional block). Certified like all levels: 500 seeded rollouts
≥60% win, softlock ≤1%, diamond = bot P2

bumper post (W3 CHIME — the next build): a round pillar that never sinks a
marble and rebounds LIVELY (restitution ≈1.1 — reuses marble-marble collision;
1 new param posts[]). A dead-center hit rebounds straight back; OFF-CENTER
contact steers the bounce — that's the whole skill: bank into pockets no
straight tilt reaches. Speed gets punished (arrive hot → flung); hug past slow
→ always safe. Each post rings a pentatonic note on impact (own pitch); banking
a chain plays a phrase — juice + feedback, and the world's name.
Visual: metal pillar (radial #eef1ff→#aab3d0→#4a5280) + pink ring #ff8fb0;
on impact the ring glows and 2 expanding #ff8fb0 chime rings pulse out.
Target hole = recessed SOCKET (dark cup + thin color rim), NOT a neon orb —
a bloomed hole reads as a second ball. Demo drawChimeDemo: approach grazes the
post lower-left → banks down → sinks, 5.2s loop; freeze frames 1.1/1.62/3.4s =
the AIM / BANK / SINK strip. Level arc 46–60: 46–48 one post (teach) · 49–53
posts + wall runs · 54–57 pinball corridors (post arrays) · 58–60 bank-chain
finales. Eng ~1d. Certified like all levels: 500 seeded rollouts ≥60% win,
softlock ≤1%, diamond = bot P2.
SIROCCO (wind) stays parked behind a prototype-gate — wind is a force modifier
(sand's class); prove it changes decisions before building, else Chime-style
structural elements fill the slot. · wind lane: #5fe0b0 chevron flow in subtle rect · bumper post:
metal radial + #ff8fb0 ring + impact ticks · bowl/dome: radial dark/light +
dashed contours + in/out chevrons (#a3e05c) · well: big #05060b shaft,
#b06bff glow ring, depth rings, down chevrons · plate & gate: gold plate ring
under a resting marble, dotted link to a barred gate (#ff8a2a; dashed = open).
