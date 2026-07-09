# Handoff: CUT — mobile physics puzzle (in-game screen, "Night Rig" art direction)

## Overview
**CUT** is a one-thumb physics puzzle for phones (portrait). Ropes suspend a crate over a
basket; the player **swipes across a rope to sever it** and uses gravity, swing, and momentum to
**land the crate in the basket**. Twelve handcrafted levels introduce mechanics (single drop →
two-rope tip order → pendulum release → tip-to-offset-basket → bounce pad → three-rope order → swing-
across → counterweight/pulley → **balloon** → **moving anchor (trolley)** → **pulse spikes** →
balloon+pulse combo). This handoff covers the **in-game screen** — the only screen the
player spends time in — in the finalized **Night Rig** art direction (moonlit workshop at night).

This is the genre established by rope-cutting / drop-the-object physics games: a single always-
visible play field, a restart that's one tap away, near-zero UI chrome, and the simulation itself
as the reward. We deliberately kept the HUD at that genre floor (level label · gear→settings) and
let the render + motion carry the polish.

## About the design files
The files in this bundle are **design references authored in HTML/Canvas** — a working prototype
that shows the intended look, motion, physics feel, and audio, plus a device-framed presentation.
**They are not meant to be shipped as-is.** The task is to **recreate this design in the target
codebase's environment** using its established patterns:

- If the target is **React Native / Expo** → render with `react-native-skia` (or an RN canvas)
  and drive the loop with `requestAnimationFrame` / Reanimated worklets.
- If **native iOS** → SpriteKit or a Metal/Canvas layer.
- If **native Android** → a `SurfaceView` + Canvas or a small engine.
- If **web / PWA** → the reference is already idiomatic (2D canvas, immediate mode) — port structure
  directly.
- If **Unity / Godot** → treat the physics section as a spec and use the engine's rigidbody +
  distance-joint primitives; match the render tokens.

The whole design is **procedural** — there are **no image, sprite, or audio assets** to extract.
Everything (world, materials, particles, sound) is drawn/synthesized from the parameters in this
document. That is intentional and worth preserving: it keeps the download tiny and lets everything
scale to any screen. The one external dependency is a webfont (see Assets).

## Fidelity
**High-fidelity.** Colors, typography, layout, motion timings, physics constants, and audio are
final and specified exactly below. Recreate the look and feel faithfully; re-implement the
mechanics using the target engine's idioms rather than transliterating the JS line-by-line.

---

## The screen: in-game

### Canvas & coordinate system
- **Orientation:** portrait, full-bleed, **fullscreen** — the game hides the OS status bar (no
  clock / battery / signal). Keep it immersive; only the notch/dynamic-island cutout remains as
  hardware. One `<canvas>` fills the viewport (`position:fixed; inset:0`).
- **Coordinate space:** screen pixels, origin top-left, `+y` down. **Everything is expressed as a
  fraction of `W` (width) and `H` (height)** so the field reworks itself for any portrait aspect —
  see Level Data. Derive these on every (re)layout:
  - `S  = W / 7`   — base unit = crate side length (the scale of the whole scene)
  - `SP = W / 40`  — rope segment spacing (rest length per rope node)
  - `G  = H * 2.0` — gravity in px/s²
  - `FLOORY = H * 0.985` — the ground line (lethal)
- **Retina:** back the canvas at `min(devicePixelRatio, 3)`; scale the context by DPR.
- **Static background & vignette are cached** to offscreen canvases once per layout (`makeBgCache`)
  and blitted each frame — do the equivalent (a cached texture/layer) so the sky/stars/hills/mist
  and the vignette aren't recomputed 120×/s.

### HUD (the only DOM/UI overlay)
Font throughout: **Space Grotesk**. All positions respect safe-area insets — use
`max(safe-area-inset, 0)` and add the offsets below. Everything is `pointer-events:none` except the
gear button.

| Element | Position | Size / shape | Type | Color / fill | Notes |
|---|---|---|---|---|---|
| **Level label** | top `inset+14`, left `15` | pill, radius `999`, padding `9 17 8` | `13.5px / 600`, tracking `2px` | text `#e4ebf7`; bg `rgba(14,18,28,.58)`; border `rgba(255,255,255,.12)`; `backdrop-blur(6px)` | text `LEVEL n` (current level only; **no total shown**) |
| **Settings** | top `inset+10`, right `13` | `47×47` circle | gear icon (Feather "settings", `25px`) | color `#e8eefb`; bg `rgba(255,255,255,.06)`; border `rgba(255,255,255,.15)`; blur(6px); active bg `.18` | opens the Settings sheet (pauses the sim). **No dedicated restart button** — restart lives in the sheet |
| **Hint (text)** | — | — | — | — | **Removed.** The game is fully caption-free — the animated hand + ghost demos carry all teaching. (The `#hint` element remains in markup but is never shown; safe to delete. Re-add a text fallback here only if you later want an accessibility option.) |
| **Level select** | — | — | — | — | **Not on the in-game screen.** No progress rail over the sim. In **shipping**, level flow is linear (win → auto-advance) + Restart. A free "Jump to level" grid exists only as a **design/review affordance** (see below). |

**Level select (in Settings, not on the game screen):** the in-game HUD is just the level label + gear + the sim. A **"Jump to level" grid** (4×3 of the 12 levels) sits in the Settings sheet — every cell tappable (free select for review / a level-picker screen); tap → build that level + close the sheet. Cells show **cleared** (amber fill) and **current** (amber ring). For a staged rollout, gate which cells are enabled with `i === 0 || cleared[i-1] || cleared[i]`.

### First-run gesture hint (on-canvas)
On **level 1 only, until the player's first successful cut**, an animated swipe gesture is drawn
over the scene to teach the verb. **It is the sole onboarding hint** — the game teaches the swipe
wordlessly, with **no text caption at all**. Draw the gesture **on top of everything** (after the vignette):
- **Target:** a point ~**55% along the arc-length of the longest rope** currently in the scene
  (so it always lands on clear, visible rope regardless of level). Swipe span = that point ±`0.145·W`
  horizontally with a slight downward tilt (±`0.03·H`), i.e. a left→right diagonal across the rope.
- **Guide:** dashed line (`dash 2/8`, `rgba(255,255,255,.34)`, `2.4px`) along the swipe path with a
  chevron **arrowhead** at the end (`rgba(255,255,255,.6)`).
- **Animated hand:** a `2100 ms` loop — during the first `1200 ms` a **stylized tutorial hand**
  (white pointing hand, index-finger tip on the rope, soft drop-shadow) eases (ease-in-out)
  start→end, trailing an additive amber **comet** (`rgba(255,214,140,·)`) with a small amber **contact
  ripple** pulsing at the fingertip; then a rest gap. Ends fade in/out over `180 ms`. (The hand is
  the touch avatar — it reads as “you, swiping” better than an abstract dot.)
- Retire the whole hint (gesture + caption) permanently once `everCut` is true.

### New-mechanic first-encounter cues
The swipe is taught once; the same *teach-by-showing, words-as-fallback* pattern applies to **every
new mechanic**. The first time the player ever meets a notable element, a **one-time, wordless
demonstration** plays on it. Each cue type is remembered so it never repeats. **All three coach
purely by demonstration — no captions:**
- **Bounce pad** — a translucent **ghost crate drops onto the pad, squashes, and launches up higher
  than it fell**, looping; the pad glow flares on each contact. Shows the bounce, wordless.
- **Spikes (static)** — *retired.* Static floor-spikes were removed as redundant (the whole floor is
  already lethal, so drop-to-floor is a fail regardless). The spike hazard now lives only as the
  **pulse** variant below. (The ghost-crate-shatter demo remains in code but is no longer triggered.)
- **Pulley** — the wheel spins (rotation arcs) while the **counterweight side sinks (red down-chevrons)
  and the crate side lifts (blue up-chevrons)** — the seesaw relationship, wordless.
- **Balloon** — a full **ghost-crate demonstration** (matching the bounce-pad): a hand sweeps across
  the balloon, it pops in a burst, and a translucent ghost crate falls into the basket — looping.
  Teaches the reused swipe-verb *and* the drop it causes. (Trolley & pulse stay lighter on purpose —
  they teach timing of motion already visible on screen, so a scripted demo would over-explain.)
- **Moving anchor** — **motion streak chevrons** stream along the rail in the trolley's travel
  direction + a ring on the carriage. Teaches "this is on a schedule."
- **Pulse spikes** — during the retracted (safe) window only, a **green "go now" glow + down-chevrons**
  appear over the gap; the red telegraph before they rise lives in the spike render itself.
- **Selection & priority:** on level build, pick the first *unseen* element by priority
  (balloon → trolley → pulse → spike → pad → pulley); show its cue until the player's first action on
  that level (then it fades — they're now acting) or the level is cleared. Mark that type **seen** on clear.
- **Persistence:** the seen-set is stored in `localStorage['cut.seen']`; a fresh install sees each
  cue exactly once across the whole game. (Dev/presentation deep-links: `?cues=always` forces cues,
  `?cue=balloon|trolley|pulse|pad|spike|pulley` forces one, `?level=n` jumps to a level (1–12),
  `?demo=cut|win|fail` reaches & holds that beat, `?panel=settings` opens Settings — gallery only.)
- **Extensible:** adding a future mechanic = add its element kind to the priority list + one small
  wordless draw routine; the seen/adaptive-text plumbing is shared.

> Embedding note: the reference reads `--sat` / `--sab` CSS vars (via `?sat=&sab=` query) and uses
> `max(env(safe-area-inset-*), var(--sat/sab))` so the HUD clears the notch both on real devices and
> inside a mocked device frame. In production just use the platform safe-area API.

### Settings sheet
Opened by the gear button; **pauses the simulation** behind a blurred scrim; closes on **Done** or
scrim tap (240 ms fade + scale-in). Centered glass card: width `296` (max `86vw`), radius `26`,
padding `22 22 18`, bg `linear-gradient(180deg, rgba(26,34,54,.98), rgba(15,20,33,.98))`, border
`rgba(255,255,255,.1)`.
- **Title** `SETTINGS` — `13px / 600`, tracking `3px`, uppercase, `#e8eefb`, centered.
- **Rows** — tap anywhere on the row to toggle; `icon + label + switch`, label `14.5px / 500`
  `#dbe4f5`, line icon `#9fb0cf`, row divider `rgba(255,255,255,.06)`:
  1. **Sound effects** → mutes the SFX bus
  2. **Music** → mutes / plays the ambient music bed
  3. **Vibration** → enables / disables haptics
- **Toggle switch:** `46×28` pill — off `rgba(255,255,255,.14)`, **on `#ffb347`**; knob `22` circle
  `#f2f5fb` travelling `18px` (200 ms `cubic-bezier(.2,.9,.3,1)`).
- **Restart level** — secondary button (bg `rgba(255,255,255,.05)`, border `rgba(255,255,255,.12)`,
  text `#cfd8ea`); rebuilds the current level then closes. **This replaces the removed HUD restart.**
- **Jump to level** *(demo/review only)* — a 4×3 grid of the 12 levels (label `#8f9ab5`); cell `44px`,
  radius `11`, free select; **cleared** = amber fill `rgba(255,179,71,.16)`, **current** = amber ring
  `#ffb347`. Tap → build that level + close. **Gated behind demo mode** — shown only when the build
  is opened with `?demo=1` (the device frame & board embeds pass it); hidden in the shipping game.
- **Replay tutorials** *(demo/review only)* — secondary button; clears `localStorage['cut.seen']`
  (and `everCut`) then rebuilds the current level so the one-time first-encounter demos play again.
  Also gated behind `?demo=1`; hidden in shipping. Lets a reviewer re-watch any mechanic's tutorial.

> **Demo gate:** `DEMO = URL has ?demo=1`. The two review affordances above (Jump to level, Replay
> tutorials) render only when `DEMO`; everything else in Settings ships. Wire your own build/QA flag
> in production.
- **Done** — primary amber button (`#ffb347`, text `#241505`); closes the sheet.
- **Persistence:** `{sfx, music, vibration}` booleans saved to `localStorage['cut.settings']`,
  restored on launch. Default: **all on**.
- **Deep-link:** `?panel=settings` opens the sheet on load (used by the presentation frames).

### Render layer order (back → front)
Draw every frame in exactly this order:
1. **Background** (cached): vertical sky gradient → moon glow → stars → two hill silhouettes → ground mist band → floor fill + floor line.
2. **Goal light pool** — warm radial ellipse on the floor under the basket (the goal "owns" the floor).
3. **Fireflies** — 7 drifting warm motes (additive/"lighter" blend).
4. **Beams / anchors** — the wooden headers ropes hang from + anchor bolts.
5. **Hazards & fixtures** — spikes (static or pulse), bounce pads, solid ledges, pulleys, trolley rails.
6. **Basket back** (scalloped weave interior).
7. **Ropes** — 3-pass fiber (dark outline → tension-lit core → dashed twist highlight) + fresh cut-end flashes (additive).
8. **Decoy boxes**, then the **crate** (drawn last of the boxes).
9. **Basket front** (rim + glowing corner posts + legs) + win bloom.
10. **FX** — sparks (additive), blade streak trail, confetti.
11. **Vignette** (cached) — edge darkening + a top scrim.

---

## Interactions & behavior

### Cutting (core verb)
- **Input:** pointer/touch down → move → up. On every move segment, test the line
  `(lastX,lastY)→(x,y)` for intersection against **each uncut rope link** (segment–segment
  intersection). Any link it crosses is cut that frame.
- On a cut: mark the link severed; give the two newly-free nodes a **whip impulse** apart
  (`(0.12 + max(0, tension-1)*4) * H * DT`, only to nodes with mass); spawn **10 sparks** at the hit
  point; play the **snip** sound (pitch scales with the rope's tension at the moment of cutting).
- **Blade streak:** push each pointer sample `{x,y,t}` into a trail; render as a soft additive
  stroke that fades over ~150–220 ms.
- The first successful cut hides the hint (gesture + caption) permanently (`everCut = true`).

### Win
Detected in `doChecks` while `phase==='play'`:
- **Condition:** all 4 crate corners are **inside the basket** AND the crate's average node speed
  `< 0.25 * H` px/s, held for **36 consecutive sim steps (~0.30 s)**.
  - *inside basket* = corner within interior x (`basket.x ± iw/2 ∓ 3`) and y in
    `[yb - wh - S*0.35, yb + 5]`.
- **On win:** `phase='win'`; set `basket.squash = 1` and `winFlash = 1`; spawn **confetti** (30
  pieces) at the basket mouth; play the **plop + chime** win sound; mark `cleared[level]=true`;
  update HUD (the dot fills amber).
- **Auto-advance:** after **120 steps (~1.0 s)** in `win`, build the next level (no modal, no stars —
  the world is the celebration). Clamp at the last level.

### Fail
Triggered when a **crate corner** touches `floor` or `spike` during play, OR the crate center
leaves the field (`x < -S || x > W+S || y > H+2S`), OR the stall watchdog fires.
- **On fail:** `phase='fail'`; generate **crack lines** on the crate; play **thump** (for floor/spike
  landings) + **wah** (the "aww" descending tone).
- **Auto-retry:** after **96 steps (~0.80 s)**, rebuild the **same** level.
- **Stall watchdog:** if the crate settles motionless somewhere that is neither basket nor floor
  (e.g. perched on the rim) for **300 steps (~2.5 s)**, soft-fail so a level can't dead-end.

### Feedback motion (exact)
- **Basket squash** on landing: `scale(1 + squash*0.12, 1 - squash*0.18)` about the basket base;
  `squash` starts at 1 and decays `-0.035`/step (~0.23 s).
- **Win bloom:** additive warm radial above the basket, alpha `0.42 * winFlash`, radius grows as
  `winFlash` decays `-0.014`/step (~0.60 s).
- **Cut-end flash:** additive dot at each cut node for its first 24 steps (~0.20 s).
- **Bounce-pad flash:** pad brightens for 8 steps when the crate strikes it.
- **Creak:** when any rope's tension ratio `> 1.045`, play a creak; cooldown 28–54 steps.

---

## New mechanics (balloon · moving anchor · pulse spikes)
Engine-agnostic — reproduce the *behavior*.

**Balloon (buoyant lift + pop).** A single **buoyant particle** (inverse-mass `0.25`) tethered by two
pull-only rope links to the crate's top two corners, so it hangs the crate level and lifts it. Its
integration uses a **negative gravity multiplier** (`gmul ≈ −6`) → a net upward force that floats the
whole assembly up until the balloon meets a soft ceiling clamp (`y ≥ 0.085·H`), where it rests stably
and holds the crate aloft (~`0.22·H`). **Popping is the cut verb reused:** a swipe segment whose
distance to the balloon centre `≤ balloon radius` pops it — cut both tethers (and anything joined to
the balloon node), kill the lift, spawn a burst + `playPop`, and the crate free-falls. Popping counts
as the level's first action (hides cue, sets `everCut`). Render: an amber **paper-lantern** balloon
(radial `#ffcf8f→#f2843c→#c8672a`) with a warm additive glow, a knot, a highlight, and a curved string
down to the crate; a brief expanding ring on pop.

**Moving anchor (trolley).** A **kinematic pinned node** (inverse-mass 0) whose position is *set*
each step along a rail (ping-pong `t` at `speed` units/s); `px=x, py=y` so it injects no self-velocity
— the crate is dragged purely by the rope constraint, building a real pendulum that keeps its swing
when the trolley reverses. Cut when the swing carries the crate over the goal. Render: a rail
(`#2a3350`) with end posts + a carriage (`#2b3446`, wheels on the rail, amber hook).

**Pulse spikes.** A spike seg flagged `pulse` with `period`, `duty`, `off`. A shared clock
`T = stepCount·DT` drives `spikeExt(sg)` ∈ [0,1] (rise → hold → fall → down, `0.12` eased edges);
**lethal only while `ext > 0.6`** (`spikeActive`). While retracted the seg has **no collision at all**
(the crate passes through the gap). Both collision passes (corner + dense edge sampling) gate on
`spikeActive`. Render: the spikes scale with `ext`; a `#39445f` base rail is always drawn, plus a
pulsing **red telegraph glow** in the ~last 16% of the cycle before they rise.
Engine-agnostic; the reference is a tiny **Verlet** solver. Reproduce the *behavior*, not the code.

- **Fixed timestep:** `DT = 1/120 s`, driven by an accumulator; frame delta clamped to 50 ms.
  (All "N steps" timings above are in these 120 Hz steps.)
- **Integration (per step):** for each free particle, `v = (x - prevX) * 0.9995` (velocity damping);
  `prevX = x`; `x += v + G*DT*DT`.
- **Constraints:** **10 relaxation iterations** per step.
  - *Rigid* links (box edges + both diagonals) solve to rest length in both directions.
  - *Rope* links **only pull** — if current length `< rest`, skip (rope can go slack but never
    compresses). This is what makes cutting feel like rope, not spring.
- **Bodies:**
  - **Crate / boxes** = 4 corner particles (TL,TR,BR,BL) + 4 edge + 2 diagonal rigid links.
    Crate corner inverse-mass `0.25` (heavier); decoy `0.0625`.
  - **Ropes** = chains of particles at `SP` spacing; attach to an anchor (pinned, inverse-mass 0),
    to a box **corner**, or as a **harness/bridle** (two links to the top two corners → hangs level).
- **Collision:**
  - Particle vs segment (floor/ledge/pad/basket wall/spike) and vs circle (pulley), with restitution
    + friction per surface: floor/spike (fail on crate; e `.15`, fr `.7` for others), basket wall
    (`e .22, fr .8`), solid (`e .2, fr .75`), **pad** (`e 1.05, fr 1.0` — springy), pulley
    (`e 0, fr .995`).
  - Box collision radius `= side * 0.18`. **Dense edge sampling:** sample each box edge every
    ~`radius` px and lever corrections back onto the two corner particles — without this a thin wall
    (the basket rim) slips *between* two corners.

---

## State management
- **`phase`** — the per-level state machine: `play → win` or `play → fail`, each auto-transitioning
  back to `play` (next level / same level) after its timer. Guard all input & checks on
  `phase==='play'`.
- **`level`** (0–7) and **`cleared[8]`** (booleans) — the only cross-level state.
- **`settings`** — `{sfx, music, vibration}` booleans, persisted to `localStorage['cut.settings']`
  and restored on launch. A **`paused`** flag freezes the step loop while the Settings sheet is open.
- **`seen`** — set of first-encounter cue types already shown (`{spike,pad,pulley}`), persisted to
  `localStorage['cut.seen']` so each new-mechanic tutorial fires exactly once, ever.
- **Timers/counters:** `phaseTimer`, `slowSteps` (win dwell), `stallSteps` (watchdog), `stepCount`
  (global, for FX ages), `creakCd`.
- **Transient world:** `particles, cons(constraints), boxes, segs, pulleys, beams, anchorsPts,
  crate, decoy, basket, sparks, confetti, streak, fireflies` — all rebuilt by `buildLevel(i)`.
- **⚠ Production recommendation (not in the prototype):** persist `cleared[]` and the furthest
  unlocked level to durable storage (localStorage / `AsyncStorage` / `UserDefaults`) and restore on
  launch. The prototype resets on reload. Consider also: pause-on-background. (Sound / Music /
  Vibration settings and cut/land/win haptics are **already implemented** — see Settings sheet & Audio.)

---

## Level data (all 12)
Portrait, values as fractions of `W`/`H`; `s = S = W/7`. `beam(x,y,w,h)`, `crate(cx,cy)`,
`basket(cx, yb)`. Ropes attach `pin`→anchor, `corner ci`→box corner (0=TL,1=TR,2=BR,3=BL),
`harness`→top two corners.

1. **Excavate-style single drop** — beam `(.35W,.028H, .30W×.024H)`; crate `(.5W,.34H)` harness to
   anchor `(.5W,.052H)`; basket `(.5W,.90H)`. *Teaches the verb.*
2. **Two parallel ropes — order matters** — beam `(.5W-.9s,.028H, 1.8s×.024H)`; crate `(.5W,.35H)`,
   corner-0 rope to `(.5W-.5s,.052H)`, corner-1 rope to `(.5W+.5s,.052H)`; basket `(.5W+.55s,.90H)`.
   Cut the far rope first so the crate tips toward the basket, then drop.
3. **Pendulum release** — beam `(.33W,.028H,.24W×.024H)`; crate `(.75W,.28H)` harness to
   `(.45W,.052H)`, pre-kicked left (`pushBox -0.15H`); basket `(.15W,.90H)`. Time the cut at the top
   of the swing.
4. **Parallel ropes — tip to offset basket** — beam `(.36W,.028H,.28W×.024H)`; crate `(.5W,.38H)` corner ropes to
   `(.5W∓.5s,.052H)`; basket `(.70W,.90H)`. Cut one rope so the crate tips sideways toward the basket.
5. **Bounce pad onto a ledge** — beams at `(.17W…)`; crate `(.30W,.515H)` harness to `(.25W,.052H)`;
   **pad** `(.10W,.70H)→(.58W,.765H)`; **solid** ledge `(.555W,.676H)→(.805W,.676H)`; basket on the
   ledge `(.68W,.673H)`. Drop → bounce up → land on the shelf.
6. **Swing across, wall pad** — beam `(.28W…)`; crate `(.14W,.30H)` harness to `(.40W,.05H)`,
   kicked right; **pad** on right wall `x=.985W, .32H→.78H`; basket
   `(.83W,.90H)`. Swing across; the wall pad forgives overshoot.
7. **Three ropes — release order** — beams at `(.24W)`, `(.49W)`, and a right stub `(.955W,.24H)`;
   crate `(.62W,.35H)` corner ropes 0/1 to top anchors and corner-2 to the right stub `(.965W,.28H)`;
   basket `(.22W,.90H)`.
8. **Counterweight / pulley** — beams `(.40W)` + `(.74W,.393H)`; **pulley** at `(.5W,.09H)` r`.035W`;
   crate `(.32W,.30H)` and a lighter **decoy** box `(.82W,.52H, .95s)` joined **over the pulley**
   (harness↔harness); a restraint rope pins the decoy's corner-1 to `(.86W,.418H)`; **solid** shelf
   `(.74W→.98W, .415H)`; basket `(.53W,.90H)`. Cut the restraint so
   the decoy falls and hauls the crate up/over, then cut the line to drop it in.
9. **Balloon intro** — crate `(.5W,.44H)` with a **balloon** `dist .14H, lift 6, r .5s` above; basket
   `(.5W,.90H)`. The balloon floats the crate to the rafters; **swipe to pop it** → the crate drops in.
10. **Moving anchor** — crate `(.5W,.44H)` hung from a **trolley** on rail `(.20W,.13H)→(.80W,.13H)`,
    `speed .34`, start `t 0.5`; basket `(.5W,.90H)`. Cut when the swing is over the basket.
11. **Pulse spikes** — beam `(.40W,.028H,.20W×.024H)`; crate `(.5W,.30H)` harness to `(.5W,.052H)`;
    **pulse spike** gate `(.10W→.90W, .62H)` `period 1.5, duty .5`; basket `(.5W,.90H)`. Cut so the
    crate falls through while the gate is retracted.
12. **Balloon + pulse combo** — crate `(.5W,.42H)` with a **balloon** `dist .14H, lift 6`; a **pulse
    spike** gate `(.15W→.85W, .66H)` `period 1.5, duty .45, off .1`; basket `(.5W,.92H)`. Pop the
    balloon so the crate falls through the gate the instant it opens.

Every level also gets a full-width lethal **floor** segment at `FLOORY`.

---

## Design tokens

### Type
- **Family:** Space Grotesk (500, 600, 700). Fallback stack `-apple-system, system-ui, Segoe UI, Roboto`.
- **HUD sizes:** level `13.5px/600` (tracking 2px), hint `14px/600` uppercase (tracking 2px),
  settings gear icon `25px`. Settings sheet: title `15px/600` (tracking 3px), row labels `16px/500`,
  primary button `15.5px/700`, secondary button `14.5px/600`.

### Color — Night Rig palette
**World / atmosphere**
- Sky gradient: `#16203a` → `#0c1017` (@55%) → `#090b11`
- Moon glow: `rgba(140,165,215,.16)` · Stars: `#cfd8ea`
- Hills: `#0d1220`, `#0b0f1a` · Mist: `rgba(150,170,215,.07)`
- Floor fill: `#06080d` · Floor line: `#2a3350`
- Vignette edge: `rgba(0,0,0,.32)` · Top scrim: `rgba(0,0,0,.28)`
- Goal light pool: `rgba(255,183,99,.13)` · Fireflies: glow `rgba(255,214,140,·)`, core `rgba(255,236,190,·)`

**Structure**
- Beam: body `#1e2536`, top highlight `#3a4664`, under-shadow `rgba(0,0,0,.4)`
- Anchor bolt: `#46527a` ring, `#0a0c12` hole

**Rope (fiber)**
- Outline `rgba(10,6,2,.55)` → core `hsl(33, 48–66%, 46–66%)` (lightness/sat rise with tension) →
  dashed twist highlight `rgba(255,214,150, .30–.60)`
- Cut-end flash: `rgba(255,214,140,·)` (additive)

**Crate (hero object)**
- Fill `#7c5029`; plank seams `rgba(38,19,6,.4)`; vertical seams `rgba(38,19,6,.3)`;
  amber banding `rgba(255,179,71,.94)` (+`rgba(255,255,255,.22)` sheen); steel corner brackets
  `#262e42`; outline `#38240f`; top rim light `rgba(255,207,138,.45)`
- Fail cracks: `rgba(16,8,3, up to 1)` fading in over ~8 steps

**Decoy box**
- Fill `#3d434f`; outline `#1d222c`; ✕ scuff `rgba(255,255,255,.10)`

**Basket (goal)**
- Rim `#b06a28`; interior `rgba(22,13,7,.95)`; scallop weave `rgba(176,106,40,.32)` /
  `rgba(140,82,30,.32)`; glowing corner posts `rgba(255,183,99,.35)` with cap `#ffcf8a`; legs `#242b3d`
- Win bloom: `rgba(255,195,115, up to .42)` (additive)

**Hazards / fixtures**
- Spikes: fill `#e0342c`, base line `#5a1512`, glow `rgba(255,59,48,.30)`
- Bounce pad: line `#58d5ff` (flash `#dff6ff`), glow `rgba(88,213,255,.22)`
- Solid ledge: `#242b3d` + `#39445f` highlight
- Pulley: body `#222939`, hub `#39445f`
- Balloon (paper-lantern): body radial `#ffcf8f→#f2843c→#c8672a`, glow `rgba(255,168,90,.30)`, string `rgba(220,225,235,.45)`
- Trolley: rail `#2a3350`/`#3a4664`, carriage `#2b3446` + `#46527a` edge, amber hook `#ffb347`
- Pulse spikes: extended `#e0342c` (dimmer `#b0392f` mid-transition), base rail `#39445f`, telegraph `rgba(255,59,48,·)`; safe-window cue glow `rgba(120,230,150,·)`

**Particles**
- Sparks: `#ffd98a` / `#ffedc9`, core `#fff8ea`
- Confetti: `#ffb347, #7fd4ff, #ff7fa8, #a8ff8a, #ffe97f, #c69cff`
- Blade streak: glow `rgba(215,235,255,·)` + core `rgba(240,250,255,·)`

**HUD chrome**
- Glass fills `rgba(14,18,28,.58 / .72)`, border `rgba(255,255,255,.12–.15)`, blur `6px`
- Amber accent (progress/goal) `#ffb347`; hint text `#ffd9a0`; label text `#d5deee`; icon `#dfe6f4`; inactive `#4a5468`

**Settings sheet**
- Scrim `rgba(6,9,16,.62)` (+blur 3px); card gradient `rgba(26,34,54,.98)→rgba(15,20,33,.98)`, border `rgba(255,255,255,.1)`
- Switch off `rgba(255,255,255,.14)`, on `#ffb347`, knob `#f2f5fb`; label `#dbe4f5`, icon `#9fb0cf`
- Primary button `#ffb347` / text `#241505`; secondary button bg `rgba(255,255,255,.05)`, text `#cfd8ea`

### Motion timings (at 120 Hz sim)
- Win dwell → win: **36 steps ≈ 0.30 s** · Win → next level: **120 steps ≈ 1.0 s**
- Fail hold → retry: **96 steps ≈ 0.80 s** · Stall watchdog: **300 steps ≈ 2.5 s**
- Basket squash decay `0.035`/step (~0.23 s) · Win-bloom decay `0.014`/step (~0.60 s)
- Cut-end flash 24 steps (~0.20 s) · Pad flash 8 steps · Blade streak fade ~150–220 ms
- Hint fade `opacity .6s`

### Spacing / scale
`S = W/7` (crate side & master scale) · `SP = W/40` (rope node spacing) · `FLOORY = H*0.985` ·
crate collision radius `S*0.18` · basket interior `1.9S` wide × `1.25S` tall · DPR cap `3`.

---

## Audio (all Web Audio synthesis — no files)
Master gain `0.55`. Reproduce with the platform's audio synth or bake to short samples.

**Two buses:** an **SFX bus** (`master`, gain `0.55`, → 0 when Sound is off) carries every effect below
plus the whoosh; a separate **music bus** (`musicGain` → destination, gain `0.16`, → 0 when Music is
off) carries the ambient bed. Muting one never silences the other.
- **Snip (cut):** highpass noise burst (`1900 Hz`, 70 ms) + triangle osc starting `170–820 Hz`
  (higher with rope tension) gliding down over 300 ms.
- **Creak (tension):** bandpass noise (`220–400 Hz`, Q9), playback-rate `0.25–0.45`, quiet; when a
  rope's length ratio `> 1.045`, cooldown 28–54 steps.
- **Thump (floor/spike land):** sine `115→40 Hz` (260 ms) + lowpass noise thud.
- **Wah (fail "aww"):** sawtooth `215→148 Hz` under a lowpass sweep `900→280 Hz`, ~400 ms.
- **Plop + chime (win):** sine `260→115 Hz` plop, then triangle notes **E5 (659 Hz)** and
  **B5 (988 Hz)**.
- **Whoosh (motion):** looping bandpass noise whose gain & cutoff track the crate's speed.
- **Pop (balloon):** triangle `540→120 Hz` (~150 ms) blip + a short highpassed noise burst.
- **Music (ambient bed):** 3 slightly-detuned voices (2 sawtooth + 1 triangle) through a lowpass
  (`~640 Hz`, with a slow `0.05 Hz` LFO sweeping cutoff ±170) on the music bus; a 4-chord loop
  (roots ~A2 / F2 / G2 / E2, three notes each) advancing every ~7.2 s. Soft, seamless, asset-free;
  starts after audio unlock when Music is on.
- **Vibration (haptics):** `navigator.vibrate` — cut `9 ms`; win `[0,15,45,22]`; fail `[0,18,55,30]`;
  gated by the Vibration setting.
- Resume/unlock the audio context on first pointer down; resume on app-foreground.

---

## Assets
- **Font:** Space Grotesk (Google Fonts, weights 500/600/700). Bundle the font in production
  instead of a CDN link. This is the **only** external asset.
- **No images, sprites, spritesheets, or audio files** — the entire scene and soundtrack are
  procedural. Preserve that if you can; it's a feature.

## Files in this bundle
- **`CUT - Night Rig (reference build).html`** — the finalized, fully playable hi-fi reference.
  Open on a phone or in a narrow portrait window. All 8 levels, physics, FX, audio, HUD, and the
  Settings sheet (Sound / Music / Vibration + haptics). This is the
  source of truth for look, feel, and every number above. Debug hooks: `window.__game.state()`,
  `.stepN(n)`, `.cutAt(x1,y1,x2,y2)`.

Not included (presentation-only, not needed to implement): the device-frame mockup and the
art-direction exploration board live in the main project (`CUT - Device.dc.html`,
`CUT Art Direction.dc.html`).

## Open questions for product
- **Progression/meta:** stars or best-time per level? level-select map vs. the current dot rail?
- **Onboarding:** level 1 teaches the swipe wordlessly with an animated hand; every new mechanic
  (pad / spikes / pulley) gets a one-time wordless first-encounter demo. **No text captions anywhere.**
  Enough, or do you want an optional accessibility text-hint setting?
- **Scope:** 12 levels is the vertical slice — confirm the target level count / chapter structure.
- **Monetization / retention hooks** (if any) — none are designed yet.
- **Settings & haptics** are implemented (Sound / Music / Vibration, persisted; cut/land/win
  haptics). Confirm the default states (currently all on) and whether music should ship on by default.
