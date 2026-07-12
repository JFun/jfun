# Cut — coding-session guide

A vanilla-JS rope-cutting physics game in the `jfun` studio. **No build step** —
`web/` runs with `python3 -m http.server` (or the `cut-web` preview on :8783).
Ships to iOS via Capacitor (`com.jfun.cut`).

**TRIMMED TO 53 STRONG LEVELS (2026-07-09, Qi-approved).** The overnight
100-level fill hit its count by permuting — a 52-agent audit confirmed ~17
near-clone families covering ~60 levels (some byte-identical with only invisible
params changed). Per Qi: quality over count. Kept: L1-20 intact + 33 canonicals
(one per family + true variants + the finale). LAST=52. The removed permutation
slots come back later via the longevity doc's REAL multipliers (star budgets /
objectives / constraint tiers), not layout clones. Trim script pattern:
extract case blocks by regex, reorder+renumber, splice (see git history).
Pin-sensitive indices preserved by construction: elastic intro case 20,
magnet×gate case 34 (l35cap), trolley×star case 42 (l43miss).

**The original 100-level build (2026-07-09, "build to 100, fine tune later"),
for the record:** LAST was 99. The original 20 (handoff port +
restructure) plus new element-ladder tiers, all past the handoff:
- **T4 ELASTIC** (`makeElasticRope` — soft-spring bungee, teal coil): bounce &
  fling. L21-23 + an elastic **How-to page** (`howtoElasticPage`).
- **T5 ROTATING** (`makeRotor` orbiting anchor + `makeBlade` lethal spinning
  sawblade): release-at-the-right-angle + hazard. ~L24-28.
- **T6 FORCE** (`makeWind` rect force zone + `makeMagnet` normalized
  inverse-square pull): move the crate without a rope. ~L29-35.
- **STAR** objective (`makeStar` — collect-before-win routing constraint) +
  gravity (set `G` per level), mirror, and geometry permutations fill to 100.
That's ~8 mechanics (the doc's cap) × placement/gravity/objective variety.

The enabling infra is the **fairness harness** `scripts/dev/fairness.cjs` — drives
the real engine over a seeded cut sweep, **certifies EVERY level winnable** (in
`test.sh`; the whole point — no more L5/L8-style shipped-unsolvable), tags a
difficulty band, and `node fairness.cjs land <n>` prints where a launch lands
(place baskets/gates by THAT, never preview evals — the preview browser serves
stale cached game.js). Always fine grid (a coarse grid flickers tight levels).
Plus a **dev-only level jump** (Settings grid on DEV_UNLOCK builds) to reach any
level on device. `winNow()` is a test-only hook the ending smoke uses.

**In-level CUES for the new mechanics ARE now in** (Qi 2026-07-09, on L33: "no
idea what's this" re: the magnet) — `detectCue`/`drawCue` extended with wordless
first-encounter demos for elastic (hand cuts cord → ghost flings to basket),
rotor (release marker at orbit bottom → ghost drops in), sawblade (ghost touches
it → shatters, like the spike cue), wind (ghost blown along the gale), MAGNET
(chevrons converge INWARD + ghost curves toward it — the clearest "it pulls"),
and star (ghost passes through → sparkle). detectCue now data-drives off a
`present{}`/`order[]` table (new mechanics first). Cue shows until the level is
won (`markSeen` in winLevel), then never again. Test with `?cues=always` +
`?cue=<kind>`.

**Teaching layer COMPLETE (Qi 2026-07-09 review: "can't really tell it's magnet…
what's the star for… box doesn't seem to be iron"):**
- **Magnet is a HORSESHOE** (`drawHorseshoe`, shared by world/cue/how-to) —
  purple body + silver pole tips, iconic shape. The fiction: the crate's IRON
  CORNER BRACES are what it grabs — made legible by `drawMagnetPull` (always-on:
  field dashes stream crate→magnet + corner glints whenever in range) and the
  How-to caption "magnets tug the crate's iron corners".
- **Stars gate the win, visibly**: `drawStarBadges` — one dim outline star badge
  per star floats above the basket rim, fills gold on collect (persistent
  "basket needs these"); the star cue routes the ghost THROUGH the star INTO the
  basket; How-to caption "grab every star, then land".
- **How-to pages for ALL 13 mechanics** (`howtoRotorPage/BladePage/WindPage/
  MagnetPage/StarPage` added; smoke pin expects 13 distinct captioned pages).
- Elastic cue's hand now anchors to the live cord midpoint.

**Fairness overhaul (2026-07-09, Qi: "is level 54 solvable?… are there dup
levels?"):**
- **PER-BOX WIND** (engine): per-particle wind torqued a box crossing a zone edge
  (lower corners pushed first) into chaotic tumbling — outcome varied with the
  invisible pre-cut bob phase = a lottery. Boxes now get a uniform push on all 4
  corners once their CENTER is inside (`p.boxed` skips the per-particle branch).
  freeTail followers are also exempt from wind AND magnets (draped decoration).
- **GENTLE-CARRY RULE for wind levels**: soft gravity (G≈1.3-1.5H) + soft gale
  (≈1.2-1.9H) + band that ends before the basket = readable arc, soft arrival.
  HOT gales / fast falls arrive at ricochet speeds → the crate smashes the basket
  wall and caroms off-field; direction flips on tiny phase differences.
- **STATIC-LEVEL RULE**: a level with no timing element must win at EVERY cut
  delay (the pre-cut bob phase is invisible — the player "just cuts"). Verify
  with `fairness.cjs land <n>`: the whole delay column should read WIN.
- **Harness: win-strategy ATTRIBUTION** — certify lines now show `by top/bottom/
  pop/casc↓/casc↑/all` + an UNDISCOVERABLE-SOLVE failure class. A level "certified"
  only via bottom-cuts/cascades that a player can't discover (cut height silently
  deciding, e.g. via severed-tail curve changes) is NOT fair — L54/L58/L62/L63/
  L78 all had this; all retuned to win `by top` at every delay.
- **DE-DUP** (Qi spotted the clone family): the five "crate + full-width gate +
  centered basket" clones are now distinct — L45 tip-order × narrow gate; L53
  low-hang heavy-G snap drop; L74 staggered anti-phase half-gates; L81 DIAGONAL
  pulse gate; L96 triple-gate gauntlet; L73 heavy-G pendulum × star (was a
  star-drop clone of L36).

**SAWTOOTH ORDERING DONE (2026-07-11).** L1-20 (the hand-designed verb campaign)
was already well-paced; L21-53 opened with 3 hard elastic levels then sagged into
6 easy magnet/star levels. Reordered cases 20-52 (keeping L1-20 + the finale case
52 fixed) into a clean easy↔hard sawtooth — new band curve
`1 3 1 3 1 2 1 3 1 3 1 3 1 3 1 4 1 3 1 4 1 3 1 2 4 1 2 3 1 2 1 3 3`, the three
v.hard peaks spread far apart, ramp to the finale. **Teaching is carried by the
first-encounter CUES** (each mechanic's cue fires on first appearance), so the
reorder introduces mechanics faster (~5 in the first 7) but each is still taught;
the trade was Qi-approved over chapter-grouped teaching. Reorder = a python
case-block splice (`/tmp/reorder_sawtooth.py` pattern, same as the trim);
`NEWORDER` is the permutation of old cases. **Renumber gotcha: every pin that
setLevel()s a moved level had to be remapped** — l21/l22/l23 elastic (→ cases
21/27/33), l35cap magnet-capture (→ case 28), l43miss star-miss (→ case 44). The
full suite is the safety net (reorder can't change solvability, only sequence).
Authoring gotchas: combos (wind+magnet, rotor+gate, elastic+spike) are finicky —
favor single-mechanic + gravity/mirror/star; stars must sit ON a deterministic
path (drops, magnet curves) not narrow fling arcs; **case N = level N+1**.

**UNIVERSAL iPad (2026-07-11) — aspect-capped framing, not a re-tune.** Cut fills
the screen and mixes W-scaled sizes with H-scaled gravity, so a squarer iPad
aspect (~0.75) changes trajectories. Rather than re-tune 53 levels, the play field
is CAPPED at the phone aspect (`MAX_ASPECT=390/844`): the CANVAS is full-screen so
the sky/stars/moon/mist/fireflies/floor span the whole width (seamless, no
letterbox), and GAMEPLAY renders in a centered `W`-wide field translated by `OX`
(see draw()). `fullW`=screen width, `W`=capped play width; **on every phone
fullW===W and OX===0 → a pure no-op, phone byte-identical** (verified by suite +
screenshot). Input subtracts OX (`evtPos`); corner HUD hugs the field via CSS
`--ox`; the howto scrim + vignette draw at full width. Harness: `node
fairness.cjs ipad` certifies at the capped iPad aspect (all 53 pass). Also fixed:
horizontal WIND now scales with W (calibrated to phone aspect so phone is
identical) — reach is aspect-consistent, so wind levels hold on iPad. L6's 3-rope
order is razor-thin to aspect (breaks past ~0.47), which is what forced the
phone-exact cap — capping there also fixes it on wide older phones.

## The game

Ropes suspend a wooden **crate** over a **basket**; the player **swipes across a
rope to sever it** and uses gravity, swing, and momentum to **land the crate in
the basket**. **100** levels (see the 100-LEVELS section below). The first 20 are
paced per the classic mechanic-arc structure (each new element gets intro → develop → twist before the next; the
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
- **iOS canvas recovery (render bug hit on device overnight)** — the crate
  rendered as a smeared vertical "tower" with confetti trails on L1, but the SIM
  was fine (crate at rest) and the preview rendered it perfectly → a device-only
  RENDER bug. Cause: iOS WKWebView PURGES offscreen-canvas backing stores during
  long backgrounding; `draw()` relied on `drawImage(bgCv,…)` (the cached bg) to
  clear each frame, so a purged `bgCv` drew nothing → the frame never cleared →
  every draw accumulated. Fix: (1) `draw()` ALWAYS `fillRect`s a solid bg before
  `drawImage(bgCv)` (pixel-identical when bgCv is valid, since bgCv is opaque on
  top; only shows through when purged — no accumulation regardless); (2)
  `refreshRender()` on `visibilitychange`→visible + `pageshow` recreates the main
  canvas backing (`cv.width=…`) and rebuilds `bgCv`/`vgCv` — NO level rebuild, so
  progress is kept. The audio visibility handler's `if(!actx) return` must not
  gate this — refreshRender runs first. NOT reproducible in the desktop preview;
  verify by reasoning + `pageshow` dispatch.
- **star-miss watchdog** (hit on device L43) — the crate settled INSIDE the
  basket with the star uncollected: the win is star-gated so it never fired, and
  the stall watchdog is `!all`-guarded so it couldn't fire → permanent 'play'.
  `starMissT` in doChecks: settled in-basket (`all && sp2<0.05H`) with stars
  missing for ≥90 steps → fail/retry (a resting crate can never collect). Pinned
  `l43miss` (sweep cuts on L43, all outcomes terminal). THIRD dead-end class
  (rim/ledge perch, magnet capture, star-miss): every objective/attractor
  mechanic needs its own "this run is decided" detector.
- **star "belongs there" guide** (the Tilt lesson) — each uncollected star draws
  a faint dotted line MARCHING toward its badge slot above the basket
  (`starBadgePos` shared by badges/guide/cue): wordless "collect this before you
  land". Added after Qi: badge+cue alone still "not visually intuitive".
- **magnet CAPTURE watchdog** (hit on device L35) — a magnet is an attractor, so
  the crate can spiral into a slow decaying orbit / jitter against the core
  forever: its speed never stays below the settle threshold (the magnet keeps
  kicking it), so `crateSuspended()`/the stall watchdog can't latch, and it never
  reaches the basket → dead-end. Fixed with a PROXIMITY+TIME check in doChecks:
  `magnetHeldT` counts steps the crate center is within 0.15W of any magnet; ≥300
  (and not in the basket) → soft-reset. A crate merely FALLING PAST a magnet
  clears the radius in <300 steps, and every magnet level's basket is >0.15W below
  its magnet, so wins never trip it (all still certify). Pinned `l35cap`.
- **stall watchdog: `crateSuspended()` discriminator, not a height guard** — the
  reference (and our first pass) only fired when the settled crate was LOW
  (`c.y>0.6*H`), so a crate perched HIGH — on a solid ledge or balanced below the
  pulley (L8, hit on device 2026-07-09) — dead-ended forever. Now: once the
  player has cut this level (`cutThisLevel`), a settled crate that is NOT
  suspended by a taut, uncut up-rope is stuck → fail/retry after 300 steps. A
  genuine hang (pre-cut, or a settled intermediate hang between cuts) IS
  suspended, so it never false-fires. A settled crate that still has a cuttable
  rope (e.g. balanced below the pulley) is RECOVERABLE (cut it), not auto-failed.
  Pinned: `l8stuck` sweeps cut combos on L8, asserts no HARD dead-end (settled
  'play' with zero ropes left).
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
- **campaign ending: CRATE HOMECOMING** — winning the last level starts
  `phase='end'`: EXACTLY ONE CRATE PER LEVEL CLEARED (LAST+1 — Qi's touch: the
  mound IS the campaign) drifts down from the night sky (parachute-slow, each
  trailing its just-cut rope snippet) and stacks into a warehouse MOUND along
  the ground (`endPlan`: greedy height+center-distance placement builds a
  centered mound of exactly N for any campaign size; soft thumps + squash on
  landing, hearth glow over the pile) + confetti + the staged
  `#endcard` ("ALL CRATES HOME" → "all N levels cleared" (dynamic) → "new levels
  on the way — stay tuned" → muted "tap to play again", rebuilds L1). The
  original lantern festival was CUT — Qi: "balloon seems not closely related to
  product"; the ending must celebrate in the game's OWN icons (crate, cut rope,
  the haul). Pinned in sim-tests (ending smoke).
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
  REAL ported game via `window.__game`: all levels build and reach terminal
  (or sane) states, level 1 is a deterministic win, the L2 wrong-order stall pin
  holds, and **the L5 pad pin: cut at any height → trampoline → WIN** — PLUS
  `scripts/dev/fairness.cjs` which certifies every level winnable in a seeded cut
  sweep (the L5/L8-shipped-unsolvable guard). Both run headless; `simN` (no-draw
  stepping) keeps the fairness sweep fast. When authoring: `node fairness.cjs
  <n>` certifies one level, `node fairness.cjs land <n>` prints where launches
  land (place the basket there — trust this, NOT preview evals: the preview
  browser caches game.js by URL and silently runs stale code).
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

## Status / follow-ons

**Release engineering (App Store, name "Cut: Night Rig", Universal):**
- ✅ **Firebase** wired + GA enabled (see below).
- ✅ **Universal iPad** — aspect-capped seamless framing (see the UNIVERSAL iPad
  block above). `TARGETED_DEVICE_FAMILY="1,2"` + `UIRequiresFullScreen` already set.
- ✅ **Support + privacy pages** — `docs/cut/{index,support,privacy}.html` (Night
  Rig palette, same analytics disclosure as Tilt). Serve at
  `https://jfun.github.io/jfun/cut/support.html` + `/privacy.html` once merged →
  the ASC Support URL + Privacy Policy URL.
- ✅ **Screenshots** — `scripts/dev/shots.cjs` (self-contained CDP harness; poses
  scenes via `?level=N&freeze=1` / `?panel=howto` + `__game`) →
  `screenshots/appstore/{iphone-6.9,iphone-6.7,ipad-13}/*.png` at exact Apple
  sizes (1320×2868 / 1290×2796 / 2048×2732). The iPad shots showcase the framing.
- ⏳ **TestFlight** — bump `CURRENT_PROJECT_VERSION`, archive, upload per
  `docs/handbook/07-app-store-release.md#7`. Then ASC forms (§8) + submit.

- **Firebase — WIRED (2026-07-10), native-only.** Project `cut-jfun` (created via
  `firebase` CLI; app `com.jfun.cut`, App ID `1:1061025053555:ios:0658a42bccdb407d136306`).
  `GoogleService-Info.plist` at `ios/App/App/` AND wired into the App target
  (pbxproj — cap sync does NOT do this; UUIDs `F1AE…0001/0002`, replicated from
  Tilt). `@capacitor-firebase/analytics`+`/app` `^8.3.0` in package.json, cap
  sync'd. Device build links + launches clean, no crash → `FirebaseApp.configure()`
  finds the plist. `CUT_GA_ID` left EMPTY on purpose — the module routes through
  Firebase on native regardless; web gtag is only for a web build (none planned),
  and gtag in WKWebView is unreliable. **REMAINING (the one manual step): enable
  Google Analytics on the project** (console-only, no `firebase` command):
  console.firebase.google.com/project/cut-jfun/analytics → Enable. Until then the
  SDK logs events but they have no GA property to land in. Verify flow via Firebase
  DebugView after enabling (`-FIRDebugEnabled` launch arg).
- App Store: screenshots/TestFlight/support+privacy per `docs/handbook/07-app-store-release.md`.
