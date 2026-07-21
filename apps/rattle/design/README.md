# Handoff: RATTLE — UI redesign v2 ("elevated toy-jar")

Drop this folder into `jfun/apps/rattle/design/` (v2 alongside the original
package). Design source renders live: open
`design_source/Rattle UI.dc.html` in a browser. Screenshots are 1:1 captures
(402×874 — design at iPhone-frame scale; the shipped world is WREF 390 × HREF 844,
all values below transfer proportionally).

## What changed vs the current build (and what didn't)

KEPT (hard rules): studio type (Lilita One display / Nunito 700-900 UI) ·
colorblind-safe bead palette + glyph double-coding, EXACTLY:
amber `#ffce6b`/`#8a5f16` dot · sky `#6ea8ff`/`#1d4faf` triangle ·
coral `#ff6b6b`/`#a02733` square · mint `#4bd48a`/`#136e42` diamond ·
violet `#9d7bff`/`#5a35c2` ring · full-bleed play field (no drawn jar) ·
bead painters unchanged (`drawBead` family in game.js is still the source of truth;
every bead/duck/toy icon in this design is rendered with ports of those painters —
never redraw them as SVG).

CHANGED:
- Background lightened to twilight plum: `radial-gradient(130% 100% at 50% -15%, #4a2c63, #2d1a46 55%, #180e2b)` (all screens, incl. the 1e reference render). Overlay dims are plum-tinted `rgba(24,14,43,.5)`; the coach veil dims to `rgba(26,15,46,.78)` — never near-black.
- Buttons are SINGLE-LAYER, soft shadow (per the original identity note — the
  hard-edge "3D press" shadow read as a double button and was removed).
  Primary: bg `linear-gradient(180deg,#ffdf8f,#ffb648 45%,#ff9d3b)`, ink `#3a1e05`,
  radius 18-22, shadow `0 6px 16px -8px #000` (+ warm glow on hero CTAs:
  `0 14px 26px -10px rgba(255,157,59,.45)`), inset top light `rgba(255,255,255,.5)`.
  Ghost: bg `#221534`, border 1.5px `#3d2f52`, ink `#c9b8dc`, shadow `0 6px 12px -8px #000`.
- Cards: `linear-gradient(180deg,#2e2340,#1b1228)`, border 2px `#4d3c60`, radius 28,
  inset top light `rgba(255,255,255,.14)`, star fan 42/58/42px ±12°,
  gold `#ffce6b` with `text-shadow 0 3px 0 #9a6a12`.
- HUD glass trays: bg `rgba(26,16,42,.88)`, border 1.5px `#4d3c60`,
  inset `0 1.5px 0 rgba(255,255,255,.12)`. Taps card 66×74 r22 (Lilita 36;
  turns honey `#ffb648` when taps ≤ 2). Objective tray: capsule h48 centered,
  bead-icon 25px + Lilita 21 count, 1.5px divider `rgba(120,105,160,.3)`.
  Level pill under tray: "LEVEL N · <TIER>" (tier colors unchanged:
  hard `#ffb648` / super `#ff5a3c` / extreme `#c86bff`).
- Settings affordance: the CLASSIC GEAR icon EVERYWHERE (home top-right,
  play HUD right circle — replaces the pause bars), 30px glyph in a 46px glass circle.
- Coach mark: spotlight the REAL bead in the settled pile (topmost instance,
  never a lifted/isolated bead). Bubble box FOLLOWS the bead x (clamped 14px
  margins), pointer triangle fine-tunes to exact x, pointer tip touches the
  glow ring (bubble top = beadY − 1.8r − 170 at r24). Copy stays one-line
  imperative ("Pop the crate's colour beside it").
- Pause card: RESUME / Restart / Level map / Home / Settings — quick toggles moved to
  the dedicated Settings screen. Home MUST be reachable from in-game (pause).

## New screens (no build equivalent yet)

- **1f Home** — wordmark (Lilita 66, `#ffc45c`, `text-shadow 0 4px 0 #8a5210` +
  soft glow; letters individually rotated ±2-5°), "POP · TUMBLE · CLEAR" tagline
  with bead dots, PLAY CTA 250px, Daily Jar + Toy Chest chunky chips, settled
  pile along the bottom with the duck bobbing (`rfloat` 3.4s).
- **1g Level path** — nodes ARE beads (54px; current 66px + white pulse ring +
  perched duck): done = honey radial bead + ★ row, locked = dark plum, tier
  badges above the node (SUPER/HARD chips), "NEW ELEMENT" teaser on debut
  levels, chapter banner with the real element painter, progress bar footer.
- **1n Toy chest** — 3-col wells 108px (`#140c22`, border `#3a2e4c`), toys drawn
  by painters, gold "NEW" ring state, plum shelf lip under each set, locked set
  dimmed at 45% with "unlocks at level N" pill.
- **1o Daily jar** — streak & results view. The HOME chip launches today's jar
  DIRECTLY (one tap); this screen shows post-run: glass jar + honey lid (canvas),
  date-seeded pile (`mulberry32(dateKey)`), week pips (filled honey = played),
  best-score pill, PLAY AGAIN + SHARE RESULT.
- **1p Settings** — GAME toggles (46×28 pills, honey = on) / LEARN (replay
  element intros, how to play) / ABOUT (support, privacy), duck + version footer.

## Mock-pile technique (design source only)

Piles in the mocks are seeded relaxation settles (gravity passes → gentle
`R*0.06` settle → zero-g exact separation) so beads REST IN CONTACT, never
interpenetrate, and tuck inside the screen's rounded corners (corner-arc clamp,
r=48). The shipped game gets this for free from the real engine — the rule to
keep is the LOOK: contact, no overlap, no floaters.

## App icon (`app-icon/rattle-icon-1024.png`)

"Duck in the jar": settled bead pile, duck nested center with an amber bead
balanced on its head, night-aubergine radial bg + honey floor glow, two white
sparkles. 1024×1024 full-bleed square — let iOS apply the mask; do NOT bake
rounded corners. Regeneration: `icDuck()` in the design source logic class
(seed 21, n12, R40, duck r62 painted at 70).

## Files

- `design_source/Rattle UI.dc.html` — live design doc (all screens + icon
  painters; piles re-render from seeds on open). `support.js` is its runtime.
- `screenshots/1e…1p` — one per screen; `1e` is the faithful current-build
  reference the redesign is measured against.
- `app-icon/rattle-icon-1024.png` — App Store master.
