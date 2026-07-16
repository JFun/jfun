# Handoff: RATTLE (flagship) — UI design

Target: a NEW app `jfun/apps/rattle/` per `docs/longevity/design-4-rattle.md`
(read that first — it is the product spec + verifier design). This package is
the **UI/visual design**, not the game logic. Rattle is the decided flagship
AFTER Quarter; build once Quarter's physics-faithful verifier exists.

## What this is

Toon Blast with the grid ripped out. A vessel holds a settled pile of rigid
colored beads. **Tap any touching same-color cluster of ≥2 → it pops** and the
pile avalanches under real gravity into new clusters. Objective chips + a tap
budget. The signature move (its name): **tap the jar itself to RATTLE** — a
seeded shake that re-forms clusters; costs 1 tap; same input, different target;
also the softlock escape. Beads are double-coded color + glyph (colorblind-safe).

## Fidelity

**High-fidelity chrome, real-physics piles.** The design file
(`Rattle - Flagship Design.dc.html`) renders every vessel with the ACTUAL
ported prototype engine (`prototypes/13-rattle.html`): Verlet circles + spatial
hash + contact-graph clusters + shockwave-on-pop. The play pile auto-pops so the
avalanche — the whole moat — is real, not mocked.

## Visual identity — warm toy-jar, sibling to Tilt / Quarter

Shares the studio type (Lilita One display / Nunito UI) but its own warm read (all screens are FULL-BLEED — beads pile against the phone edges; the glass-vessel look is reserved for future vessel-grammar levels, not the default) so
it doesn't look like a Tilt/Quarter reskin.

- **Background**: warm aubergine night — radial `130% 100% at 50% -15%`:
  `#2a1a33 → #170f1f → #0c0812`.
- **Primary / signature accent**: HONEY `#ffb648` → `#ff9d3b` (RATTLE button,
  tap pips, wordmark glow, primary CTAs). Tilt=gold-led, Quarter=periwinkle-led,
  Rattle=honey/toy-led ("cozy tactile jar").
- **Bead palette** (double-coded, colorblind-safe — keep exactly):
  amber `#ffce6b` dot · sky `#6ea8ff` triangle · coral `#ff6b6b` square ·
  mint `#4bd48a` diamond · violet `#9d7bff` ring. Each bead: flat fill + inner
  `d`-tone ring + dark stamped glyph + top-left gloss dot. Poppable clusters get
  a white shimmer outline once settled.
- **Vessel**: cool glass — back tint `rgba(150,120,200,0.06)`, front stroke
  `rgba(180,160,230,0.28)` + hairline `rgba(225,215,255,0.5)`, rim beads at the
  mouth. Vessel/chrome stay fixed; only beads move.
- **Escort toy (duck)**: `#ffd44d` body, `#ff9d3b` beak; floor "bring-down" zone
  is a dashed honey band with a bobbing arrow.
- **Panels**: card `linear-gradient(180deg,#2a2038,#1a1226)`, border `#4a3a5c`;
  chip bg `#1c1330`, border `#3d2f52`. Ink `#f3ecfa`, dim `#b3a3c4`/`#8b7c98`.
- Buttons single-layer, soft shadow. Cards `rpop` (scale .85→1, .36s
  cubic-bezier(.2,1.4,.4,1)).

## Screens

### 1. Play (`1a`) — FULL-BLEED (no container)
The play field uses the whole phone like a bubble shooter: beads pile against
the phone's own rounded edges, no floating jar. Header (overlaid, top): LEVEL +
a big Lilita **TAPS** number readout (Tilt-style, was pip dots) on the left;
objective chips on the right (bead-icon + count, e.g. coral 18; the duck chip
with a down-arrow). NO in-game restart button and NO persistent RATTLE button
(both were removed) — restart lives on pause/settings; the rattle move is just
tapping empty space in the field, surfaced explicitly only on the 1d stuck card.
Note: the header container needs `box-sizing:border-box` or width:100%+padding
overflows the screen and clips the right chip.

### 2. The avalanche / hero (`1b`)
RATTLE wordmark + "POP · TUMBLE · CLEAR"; a pile caught mid-cascade; headline
"TAP A CLUSTER. WATCH IT FALL." / "Plan the next pop from the wreckage"; honey
**PLAY ▸**. First frame / App Store hero — if the fall isn't juicy on device
there's no product (feel-gate first).

### 3. Cleared (`1c`)
Gold ★★★ (solve / bot-opt+2 / bot-opt+0–1 spare taps), Lilita **CLEARED!**,
"N taps spare · new toy unlocked!", a **toy-chest** unlock row (the escort toy +
"toy 12 of 50 · <set>"), NEXT ▸ + Replay + Toy chest. Score = spare taps; no
timers in campaign.

### 4. No pairs left → Rattle (`1d`)
Rattle's differentiator = never a dead board. When no poppable cluster remains,
a gentle card "NO PAIRS LEFT — you're not stuck. Rattle the jar and the pile
re-settles into fresh clusters," **RATTLE THE JAR** (honey) + Restart, footer
"rattle costs 1 tap · the pile is never a dead end."

## Interactions

- Tap a cluster ≥2 = pop → burst + ring + bass thunk pitched by size +
  outward shockwave impulse on touching neighbors (juice AND a mechanic).
- Singleton tap = free wobble no-op (teaches the ≥2 rule, no spend).
- Input locks during the avalanche (~<1.5s settle); poppable clusters shimmer at
  rest only.
- Rattle = seeded shake impulse to all beads (keyed by tap counter for the
  verifier's determinism); costs 1 tap.

## Element ladder (`L1` gallery + `L2` debut card) — DESIGNED through T7

Every element = ONE physics rule on the base engine (a constant, a collision
callback, or a body), never a new input. Introduced one per ~6–10 levels;
remix after; cap NEW at T8. T0 beads + T1 escort duck are already in 1a–1d.
Each new bead has bespoke canvas art (`drawElement(id,type)` in the logic
class) — reads by silhouette + material, not just hue:

- **T2 STONE** (LV 17–26) — density ×3, no colorId. Grey speckled/cracked, no
  glyph. Dead weight: can't pop it, undermine & dig around it.
- **T3 SHELL** (LV 27–38) — adjacent pop shockwave cracks crate → normal bead.
  Colored bead behind wooden X-slat crate. Teaches: pop NEXT TO things.
- **T4 BALLOON** (LV 39–52) — gravityScale −0.6, pops on adjacent pop. Glossy
  translucent + knot/string. Props piles from below; first combo band (remix T1–3).
- **T5 ICE** (LV 53–68) — friction 0.02. Translucent crystalline/faceted.
  Slump physics — icy piles spread flat; read the pile shape.
- **T6 TAR** (LV 69–86) — friction 5 + weak weld joint to touching neighbors.
  Oily black + drip. Dams avalanches; welded clumps fall as one unit.
- **T7 BOMB** (LV 87–106) — popped-in-cluster → radial impulse + destroy
  radius 2.5r. Dark body, red danger ring, lit fuse. AoE you must EARN into position.
- **T8 PINNED** (LV 107–128) — pin joint released by adjacent pop. LAST new
  element; art comes when T7 ships. T9+ = remix only (mirrored/rotated vessels,
  gravity variants), no new bodies.

**In-context coach mark (`C1`/`C2`) — DEFAULT first-encounter**: instead of a
modal, the level loads with the new element already in the pile, the board
dims, a spotlight + double pulse ring lands on the bead, and a pointer bubble
names it + states the one rule right where it sits (Royal-Match style). Beats:
dim → name → fire the mechanic once (scripted adjacent pop) → tap anywhere →
dim lifts, taps counter goes live. Rules: once per element ever, no timer during
intro, skippable (tap dismisses), replayable from the toy-chest entry.
Implementation: dark overlay = a circle with `box-shadow:0 0 0 9999px rgba(8,5,16,.8)`
(punches the spotlight hole); bead spotlit via `drawElement`; caption is plain
HTML positioned over the field.

**Debut card (`L2`) — reduced-motion / re-view fallback**: same card as the
duck unlock — "NEW ELEMENT" eyebrow, big bead icon in a rounded well, name in
Lilita, one plain-words rule line, GOT IT ▸ — then straight into the level.

## Not yet designed (next design turns — ask before building)

- Vessel-grammar gallery (~12 polygon families), toy-chest collection screen,
  daily jar, cosmetics, settings.
- Live behavior demos / full intro phones per element (if wanted, Tilt-style).

## Source

Design file: `Rattle - Flagship Design.dc.html` (element ladder L1–L2 + screens
1a–1d), piles driven by a faithful port of `prototypes/13-rattle.html`. Element
icons: `drawElement(id,type)` in the logic class (static canvas painters). Spec
+ verifier: `docs/longevity/design-4-rattle.md`. Icon language: all restart /
replay controls use the 20px rotate-cw SVG (no unicode glyphs).
