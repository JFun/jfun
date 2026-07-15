# Handoff: QUARTER (Tilt 2) — UI design

Target: a NEW app `jfun/apps/quarter/` — a fork of shipped `apps/tilt` per
`docs/longevity/design-7-quarter.md` (read that first; it is the product spec).
This package is the **UI/visual design** for that build, not the game logic.

## What this is

The tap-to-rotate sequel: tap the LEFT half → the whole square board turns 90°
CCW; RIGHT half → 90° CW. Gravity is always screen-down, so every body tumbles
LIVE through the 0.35s turn. Win = marble rests in the goal. Par = TURNS (never
time). It ships two things Tilt never can: **undo** (discrete verb) and an
**on-device exhaustive solver** that detects "no path to win from here."

## Fidelity

**High-fidelity chrome, real-physics boards.** The design file
(`Quarter - Tilt 2 Design.dc.html` in the design project) renders every board
with the ACTUAL ported prototype physics (`prototypes/16-quarter.html`), so the
tumble, settle, dimple-capture and boulder mass are honest, not mocked. The
coding session owns the game logic + verifier; this handoff owns the skin.

## Visual identity — "Tilt 2", sibling to Tilt's Arcade Night

Reads as a sequel in 5s: same marble-and-hole soul + Lilita One/Nunito type,
but a distinct cool identity so it doesn't look like a Tilt reskin.

- **World / background**: cool slate-violet night — radial
  `130% 100% at 50% -18%`: `#2a2650 → #17142f → #0a081c`.
- **Primary action / the turn verb**: PERIWINKLE `#8fb2ff` (buttons
  `linear-gradient(180deg,#8fb2ff,#5c7fe0)`, chevron zones, tap flash, turn
  pips, marble glow). This is Quarter's signature color — Tilt is warm-gold-led,
  Quarter is cool-blue-led. "Steady hands" vs "clever turns."
- **Goal hole**: GOLD `#ffce6b` — kept from Tilt (soul continuity); also the
  star + win-glow color.
- **Panels**: card `linear-gradient(180deg,#241f4c,#161232)`, border `#3d3770`;
  chip bg `#1c1940`, border `#34305e`; stat tile `#100d28`.
- **Ink** `#eef1ff`, **dim** `#a99fe0` / `#8b84b8`.
- **Marble**: radial `#ffffff → #d9e4f8 → #7f92c2`, periwinkle glow, gloss
  counter-rotated to stay screen-up while the board spins; 3 roll-dots tumble.
- **Boulder**: warm stone `#9c8a78 → #6f6155 → #463d34`, faceted, ~6× mass.
- **Wall tile**: `#2a2752 → #1c1a3c`, r10, top bevel `#ffffff0f`.
- **Ice tile**: `rgba(120,175,255,0.15)` fill + `rgba(200,230,255,0.38)` streaks.
- **Board frame**: fixed rounded-square, thickness ~5% of board, stroke
  `#221d44` + hairline `rgba(150,140,210,0.25)`; ONLY the inner plate rotates,
  chrome/background stay fixed (motion-comfort + Tilt "stable frame" lesson).
- **Type**: display = Lilita One (wordmark, IN!, big numbers, stat values);
  UI = Nunito 700–900. Buttons single-layer, soft shadow (no double-stack).

## Screens

### 1. Play (`1a`)
- Header: layers icon (levels) left · centered hero `TURN n · PAR m` + a
  turn-PIP row (filled periwinkle per turn; the par-th pip carries a gold ring)
  · settings gear right.
- Board: the rotating square in its fixed frame, centered; hint line under it
  ("tap a side — the whole world turns"), fades after first tap.
- The whole LEFT / RIGHT screen halves are the tap targets (subtle periwinkle
  edge tint teaches this). Bottom control cluster (kept ABOVE the iOS
  home-indicator zone): big **↺ CCW** button · **UNDO** (center, secondary,
  disabled at turn 0) · big **CW ↻** button.
- No wordmark on the play screen (like Tilt).

### 2. The tumble / first-run hero (`1b`)
QUARTER wordmark + "TILT · 2" tag; board frozen mid-turn (~40°) with marble +
boulder airborne; headline "THE WHOLE WORLD TURNS" / "Tap left or right —
everything tumbles at once"; periwinkle **PLAY ▸**. This is the sequel money
shot and the App Store first-frame.

### 3. Solved (`1c`)
Overlay card: gold ★★★ (finish / ≤par+1 / ≤par), Lilita **IN!**, line
"n turns · par m · on/under par", TURNS / PAR / BEST stat tiles, **NEXT ▸**
(periwinkle) + Replay + Levels. No timer anywhere.

### 4. No way home — undo / dead-end (`1d`)
Quarter's differentiator. When the on-device solver (the same exhaustive
{L,R} tree search that certifies levels, ~1s) proves the current state is
unwinnable: a gentle card "NO WAY HOME — from here the marble can't reach the
goal, no matter how you turn," **UNDO LAST TURN** (periwinkle) + Restart, footer
"powered by the on-device solver · provably fair." Never a hard game-over —
undo is always the way out.

## Interactions

- Turn = 0.35s gravity-vector tween, physics LIVE (the moat — never freeze /
  teleport the marble). One buffered tap max. Board rotation quantizes to exact
  90° at tween end (determinism).
- Buttons: press = `translateY(2px)`, soft shadow only.
- Card entrance: `qpop` (scale .85→1, .36s cubic-bezier(.2,1.4,.4,1)).
- Undo: restore the pre-tap physics snapshot (positions + velocities + element
  flags) — cheap, only possible because the verb is discrete.

## Not yet designed (next design turns — ask before building)

- Element-ladder intro cards (boulder → glass → ice → moss → one-way flap →
  twin marble → crumble → spring), one per T1–T8.
- Level-select / chapter map, daily challenge, geode album + cosmetics, settings.

## Source

Design file: `Quarter - Tilt 2 Design.dc.html` (turn 1: 1a–1d), boards driven by
a faithful port of `prototypes/16-quarter.html`. Product spec + verifier design:
`docs/longevity/design-7-quarter.md`.
