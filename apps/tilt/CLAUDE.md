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

- **`bash scripts/dev/test.sh` after EVERY edit** (syntax + 137 engine + 115 physics assertions, incl. the tutorial-story, dead-end, slope, gem/worlds/medal, per-world sawtooth-shape, sand/ice-zone, and world-param-invariant pins).

**W3 = CHIME (bumper posts) — BUILT 2026-07-14 (Sirocco parked to W4; wind stays behind its prototype-gate):**
- **Element: BUMPER POSTS** — a fixed circle a marble rebounds off LIVELY
  (`restPost` 1.12 > 1: a hit LEAVES faster than it arrives, "arrive hot →
  flung"), reusing the marble-marble collision. Off-centre contact STEERS the
  bounce (tangential preserved, no scrub) → bank into pockets no straight tilt
  reaches. Each post rings a PENTATONIC note (idx → scale degree; a bank chain
  plays a phrase). Numbers-proven at the kill-gate BEFORE levels: restitution
  1.12×, off-centre deflection >100°, and bank-required boards exist.
- **CONTINUOUS-ONLY element — the key architectural fact.** A pinball bounce
  can't be modelled by the discrete BFS, so Chime boards are generated AND
  verified ENTIRELY by the continuous certifier (`certify.cjs`), carry a
  PRE-CERTIFIED par, and `buildCurated` skips `solveBFS` when `posts` present.
  The discrete-solution engine tests skip posts levels (`discreteBoards`
  filter). This is the pattern for any element the discrete solver can't
  represent — certify in physics, store the par, skip BFS.
- **Campaign 46–60** (LAST_LEVEL 45→60): all 15 hand-pinned in CURATED from an
  offline bank-required search (`scratch/chime-gen*.cjs`: solvable WITH the
  post, and removing the post breaks it OR makes par ≥2 worse — the post is the
  medal-incentivised shortcut, not a hard lock). **Bank puzzles are SHORT in
  par (aim→bank→sink ≈ 2 tilts), so difficulty rides POST COUNT, not par:** the
  sawtooth score adds `posts·1.5`; teach 46–48 = 1 post, corridors escalate to
  3-post pinball, the finale is the busiest board. All 15 certified solvable in
  physics; ⚠ they are single-marble par-2 banks — MECHANICALLY THIN; awaiting
  Qi feel-test on whether banking carries a full world before investing in
  multi-bank / multi-marble depth (2-marble bank-required boards were rare +
  slow to generate).
- **Game layer**: `drawPosts` (metal pillar radial #eef1ff→#aab3d0→#4a5280 +
  pink #ff8fb0 ring; on bump the ring flares + 2 expanding chime rings pulse,
  driven by `postFx`); **CHIME holes render as recessed SOCKETS** (`curHoleSocket`
  — a bloomed neon orb reads as a second ball beside the ball-sized posts);
  `sndBump` (pentatonic, native "bump" sample) + haptic; `.g-post` glyph + hint;
  Chime intro card (kind "post", drawn via the shared painters; demo beats
  aim→bank→sink NUMERICALLY verified in scratch: bump 0.9s, sink 3.4s); whisper
  "Aim the rebound."

**W2 = FOUNDRY (plates & gates) — DUNE (sand) CUT 2026-07-13, RIME (ice) CUT 2026-07-12:**
- **The two-cut post-mortem (read before designing ANY element):** ice (friction
  ×0.06, then grip loss ×0.35) was UNFEELABLE — gravity at a normal tilt is
  ~10× felt friction; sand (friction ×3.5 + v² drag) was feelable but Qi cut it
  too: "not really adding variety and challenges, other than merely slowing
  down motion a bit". **Element bar (now twice-proven): it must change
  DECISIONS, not just motion — and prove it in NUMBERS before levels are
  built.** Both machineries stay dormant + tested (iceFriction/iceGrip,
  sandFriction/sandDragK — 1.2/unit, 1/LENGTH so px-worlds don't overdrag;
  kind:"ice"/"sand" zones, painters, `.g-ice`/`.g-sand` glyphs — the
  parked-slopes precedent).
- **Element: PLATES & GATES** — pure STATE, no force modifier. A gate cell is a
  wall while its paired plate cell is empty; ANY marble parked on the plate
  opens it (color-agnostic); leaving closes it; a marble inside the gate cell
  holds it open (never crushes). Sink-all stays the only completion, so a
  keeper holding a plate must come home too — the ORDER of solves is the
  puzzle. Continuous: `held` recomputed per step — parked = center in plate
  cell (bounds scaled by `w.unit`) AND speed < `plateRest` (unit·2.5), OR
  center in the gate cell; closed gate = collideBlock AABB in both passes;
  `gate` events on transitions.
- **⚠ THE DISCRETE GATE RULE IS DELIBERATELY STRICTER THAN PHYSICS (the
  hardest-won lesson of this build — the first 15 pinned boards shipped with
  TWO discrete-only fictions and 13 of them had to be replaced).** The
  adversarial review caught fiction #1 and a continuous replay of a "fixed"
  board caught #2: (1) SELF-HOLD — tilt() reads occupancy from stale marble
  positions, so a mover's own origin held its plate for its whole slide;
  physics closes the door the instant it accelerates off (plateRest ≈ 0.08
  cells of travel). (2) UNPINNED-HOLDER RACE — discrete furthest-first order
  lets a runner cross "before" the same tilt drags the holder off the plate;
  on device both move simultaneously and the door slams in ~60ms. Rule now
  pinned in tilt(): a plate holds ONLY while a DIFFERENT marble sits on it AND
  that holder is immobile under the current tilt (cell behind it along d =
  rim, wall, or seated marble); gate-cell occupancy always holds (anti-crush).
  This mechanises the hand-derived "plate must pocket its holder" level rule.
  **Generalized discipline: any discrete rule whose truth depends on
  WITHIN-TILT ordering is a fiction the continuous sim will refuse — verify a
  sampled board by continuous replay before pinning a family of levels.**
- **`scripts/dev/certify.cjs` (Phase 2, pulled forward by the above): the
  continuous certifier — now the SHIPPING GATE for gate worlds.** Best-first
  search over human GESTURES (hold a tilt strength 1.8/4/8 for 0.7–4s, ease
  flat, settle) in the REAL physics. It certifies BOTH halves: (A) SOLVABLE (a
  gesture line sinks every marble) and (B) LOAD-BEARING (the same search with
  every gate converted to a permanent wall MUST fail — else the gate is
  skippable). Run before pinning any gate world: `node scripts/dev/certify.cjs
  31 45`. Snapshot/restore must copy hole `filled` flags or captures leak
  across branches. Winnability, not exact-replay of the discrete line, is the
  bar (discrete stacks topple, fixed pulses overspeed past holes).
- **⚠ THE THIRD FOUNDRY FIX (2026-07-13, Qi device catch: "L31 — we don't have
  to use the gate to finish; L32, is it solvable?"). Discrete load-bearing is
  NECESSARY BUT NOT SUFFICIENT.** The continuous checker found **9 of 15 gates
  SKIPPABLE** — a ball banks AROUND a 3-cell wall stub and reaches the target
  hole from the open side, a route the discrete BFS (straight slides only)
  can't see. Root cause: the generator dropped gates into open wall stubs. Fix
  = LOAD-BEARING BY GEOMETRY: every gate must be the SOLE orthogonal entrance
  to its matching hole — the hole's other three neighbours are rim or wall (a
  sealed POCKET). Then no ball can reach the hole without the doorway, proven
  by construction, not by search. New generator `scratch/pocket-gen.cjs`
  builds corner/edge pockets; all 15 boards rebuilt, each geometry-sealed +
  physics-certified + physics-load-bearing. TWO permanent regression nets
  added: the engine test asserts the sole-entrance geometry for every gate,
  and certify.cjs asserts (B). **RULE: a gate is only load-bearing if its hole
  is geometrically sealed — a wall stub in open space is always bankable.**
- **Campaign 31–45** (LAST_LEVEL=45): ALL 15 hand-pinned in CURATED (gate-BFS
  is too slow for on-device generation) from a seeded offline search
  (scratchpad gate-lab/gate-search), arc 31–33 teach · 34–38 gates in wall
  runs · 39–42 two pairs order matters · 43–45 keeper finales. **LOAD-BEARING
  filter pinned in tests: every level must be UNSOLVABLE with its gates
  treated as permanent walls** (that's the "changes decisions" bar, mechanised)
  + ≤2 pairs, clean cells, par curve 3→11, finale = max. Level-design rule
  from hand-authoring failures: the plate must sit in a POCKET that pins the
  holder for every direction the solution uses afterward.
- **Game layer**: `drawGates` painter shared by board + intro demo (layer
  "under" = dotted link + plate pad + 3 bars ALL tinted the colour of the hole
  that pocket guards (Qi 2026-07-13: two-pair boards were unreadable with
  uniform gold/orange — now the red pocket is all-red, the yellow all-yellow;
  colour names the PAIR, mechanic stays colour-agnostic; neutral gold/orange
  only on the generic hint-chip glyph),
  layer "over" = wall-coloured lintel re-drawn above the ball so it rolls
  THROUGH the doorway; `_a` per-gate ease is render-only state); gate
  open/close sounds (web tones + native gateOpen/gateClose samples) + light
  haptic; gate hint chip + animated `.g-gate` glyph; Foundry intro card
  (palette #452a14→#2b1a0b, live 2-marble demo park → open → through → sunk →
  door drops, 5.4s loop — beats NUMERICALLY verified against the real physics
  in scratch before wiring, same discipline as tutorial-script; whisper "One
  rests. One runs."); `checkSeal` gate rule: for the LAST free marble a closed
  gate is a permanent wall (nobody left to hold the plate; can't hold your own
  door open and travel through it) — with ≥2 free marbles gates stay passable
  (under-detects, never falsely ends a live run), gate-caused seals put the ✕
  on the door; `foundryV1` one-shot migration clears per-level records >30 and
  re-arms the W2 intro.
- **Also this round (Qi device feedback):** settings close HARDENED (X:
  click+touchend, scrim-tap closes, dev builds surface uncaught errors as
  toasts — device repro was impossible in browser, all paths pass there);
  mechanic intro cards fire ONLY in their debut world (entering a later world
  silently retires earlier ones — no walls re-teach in W2).

**Feel-test round (Qi, 2026-07-12, after clearing all 30):**
- **iOS status bar now HIDDEN in-game** (`UIStatusBarHidden` +
  `UIViewControllerBasedStatusBarAppearance=false` — Tilt never had Cut's
  immersive-fullscreen plist keys; latent since v1.0).
- **SAWTOOTH ORDERING** (the Cut lesson): display L7–30 is a PERMUTATION of the
  same 24 proven boards (`E.SAW_ORDER`/`sourceFor`; generation keyed by SOURCE
  so each board is byte-identical to its BFS-verified original; curated L1–6
  fixed). The old monotone ramp SAGGED — hardest board (score 40) sat at L25
  with L28–30 declining ≈30; now valleys rise 16.5→~30, teeth ~33–36, three
  peaks spread (display 12/16/30), **finale = the hardest board**. Difficulty
  score = 2·par + holes + walls/2; pinned tests assert permutation validity,
  ≥12 direction changes, finale-is-max. **Renumber gotchas:** ramp checks in
  tests key off `sourceFor(L)`; the L19 gateway board now lives at display 18;
  save migration `sawV1` clears best/medal/feats/gems once (numbers name
  different boards now; v1.0 still in review = no live players).
- **WORLD-COMPLETE ending** (was "YOU BEAT TILT!"): eyebrow WORLD N +
  "<NAME> COMPLETE!", per-world tally incl. DIAMOND column, flawless line,
  honest next-world line ("Rime is coming in the next update" until W2 exists /
  "awaits on the world ladder" once built), primary button WORLDS ▸ → the
  ladder, secondary Replay → w.from.

## Status notes

- Working title "Tilt" — App Store naming pass owed before release (generic/unownable).
- The shell still carries an inert Moraine `GoogleService-Info.plist` — replace before release.
- Sibling `apps/dowse` is a PARKED experiment — leave it alone unless asked.
