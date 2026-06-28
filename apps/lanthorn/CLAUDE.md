# Lanthorn — project rules for Claude sessions

Web-first block puzzle (drag pieces, clear lines, light lanterns). Spec = `lanthorn-prd/00-PRD.md`
(§0 complexity law is binding: 1 verb, 0 pre-learned rules, no timers/counters; tutorial = one
sentence). `README.md` has run/test/deploy commands. Decisions and gotchas live in the Claude
memory dir for this project — trust those over assumptions.

## Non-negotiables

- **After every code change run `scripts/dev/test.sh`** (~5s: syntax, 117 engine/data invariants,
  60-level bot validation). After UI changes, also pixel-verify in the browser preview
  (`.claude/launch.json` → `lanthorn-web`, port 4173, `?debug=1` exposes `LD.*` helpers).
  On-device QA: Debug iOS builds inject `window.__LANTHORN_DEBUG` (via `#if DEBUG` WKUserScript
  in MainViewController), surfacing a top-left `≡` dev panel — New / L1 / Last / Done / Win —
  so the new-user→last-level→ending flow is testable on the phone with no console. Auto-absent
  from Release builds.
- **`web/js/engine.js` must stay behavior-identical to `lanthorn-prd/greybox/engine.js`**
  (same RNG draw order, same bot arithmetic). engine-tests cross-check both engines and the PRD
  appendix win rates. Never "improve" engine logic casually.
- **Never hand-edit `web/js/levels.js`** — regenerate: `node scripts/dev/gen-levels.cjs`
  (deterministic, master seed 20260611). Same for sounds: `python3 scripts/dev/gen_sounds.py`
  → `web/sounds/` (+ afconvert aac for bgm).
- **Position-band law** (tuning.json): levels 1-10 band A (bot ≥85%), 11-30 B (≥70%),
  31-60 C (≥55%); lanterns never all in one line. **World-arc law:** each 20-level world ramps
  to a climax — archetype-A breather at the world MIDPOINT (10, 30, 50…), and the world FINALE
  (20, 40, 60…) is the HARDEST level of its band (the level the World-complete card pays off).
  NOT "every 10th easy" — that put the easiest level last, backwards from the genre (fixed June 13, 2026).
- After self-test passes, **deploy to the iPhone without asking**: `scripts/dev/deploy_ios.sh`
  (test → cap sync → xcodebuild → devicectl install/launch; retries transient install failures).

## Architecture (one codebase, decided June 2026)

- `web/` = the entire game, vanilla JS/DOM/canvas, no build step. Ships three ways: browser,
  CrazyGames (launch channel; SDK wrapper in `web/js/sdk.js` no-ops elsewhere), and the
  **Capacitor** iOS app in `ios/` (SPM mode, no CocoaPods). Unity/Godot ports were considered
  and rejected — do not reintroduce. Godot is the fallback only if a webview perf wall appears.
- Native bits live in `ios/App/App/NativeFX.swift` (Capacitor plugin: AVAudioEngine sample
  player + BGM loop, Taptic haptics, Firebase Analytics `track`). New Swift files must be
  **hand-registered in project.pbxproj** (template has no synchronized groups). Firebase comes
  via SPM remote package in App.xcodeproj — never via `CapApp-SPM/Package.swift` (cap sync
  regenerates that file).
- Analytics: one API (`Track.ev`) → native Firebase SDK in the app / gtag on web. Firebase
  project `lanthorn-535f2` (console account jayfunlin@gmail.com). Web measurement ID may still
  be pending in `web/js/analytics.js` — check `GA_MEASUREMENT_ID`.
- Apple signing: team `Y3T546NP6T` (tbcql1986@gmail.com), bundle `com.jfun.lanthorn`,
  test device UUID in `scripts/dev/deploy_ios.sh`.

## Design system (locked through device playtests — don't regress)

Three screens only (title / game / sky), no level browser, no tab bar, linear progression
("Level N" button = odometer). End cards are textless (LEVEL pill + lantern hero + one wide
button + ✕→title). EXCEPTION — the world-complete milestone (first clear of a world's last level,
levelIdx % 20 === 19): the lantern hero swaps for a glowing per-world planet ORB (#ovWorld, lit
via --world1/2), pill = world name, a single "World complete" label, ✦N sky-count chip, and a
skyBloom() wave of rising lanterns + double spark burst; Continue → next world's arrival card.
Mirrors the comps' "Area/Chapter Complete" beat — the one labelled card, fires once per world.
The in-game HUD also shows the current world name (#hudWorld) under "Level N" + a progress bar
(#worldbar/#worldfill) that fills across the 20 levels and resets each boundary. No near-win
assist — any dead-end shows the terse Retry card after the "No space left" sweep. One gear menu (home + Sound/BGM/Vibration toggles) on title and in-game.
All icons are inline SVG or CSS — no emoji/font glyphs except the music notes.

Journey meta (Phase-0 thin slice shipped June 12, 2026): endless levels are chunked into named
WORLDS you travel out through — scale escalation (home → near sky → deep → beyond), per owner's
"space travel" idea reframed cozy (NOT literal Mars/Jupiter; warm invented dream-worlds, the
Moon is the one real name worth keeping). `web/js/planets.js` = the atlas (name + CSS palette +
horizon-world colors, ~20 levels/world, curated 60 = first 3 worlds Tier 1). Each world is a
pure-CSS RESKIN (sky gradient via --night1/2, walls via --wall1/2/3, the horizon orb via
--world1/2) — §0-legal: NO new rules, the paper lantern stays warm gold (constant hero). Sky
screen shows the current world rising on the horizon (#skyworld) + its name; entering a new
world fires a textless arrival card (#planetcard) — but ONLY on an in-play world crossing
(won a world's last level → Continue → next world); a cold start / app relaunch is silent at
every level, and a brand-new user gets NO card on level 1 (owner-decided June 13, 2026: the
card is a travel REWARD, not an intro — level 1 stays focused on the puzzle + one tutorial line;
HUD names the world). Don't re-add a new-user welcome card. The night sky is PER-PLANET: lanterns counted
per world in `store.skyByWorld` (worldIndex→count), NOT one global total — each planet has its
own sky that fills over its 20 levels. The home-screen background draws a "travel trail"
(FX.setJourney) of world-orbs winding up through the night. Atlas now 10 named worlds + the Moon
(folded in as world 4) + procedural "Deep Sky" beyond; full 12-world "Arc of Night" design lives
in session notes; only palettes built so far — painted art is the post-gate cost. Endless difficulty RAMPS with depth (added June 12, 2026 — the flat band-C tail felt unchanged
at level 1261). `endless.js` scales §0-legal levers by world depth: more lanterns (→6), tighter
geometry (padWalls → up to 14 blocked), and a descending target bot-win-rate (~0.62 at the first
endless world → floor 0.32 far out), picking the candidate whose 10-run bot win-rate lands in a
band around target. Verified: ~95% at L61 → 20-40% plateau by ~L213, holding through the deep
tail; every level still solvable (authored-queue-winnable + all lanterns lightable), deterministic,
generates in <35ms (a finale costs more — it evaluates candidates at 28 runs to pick a real peak,
~150ms, once per world, cached). Each world dips to an archetype-A breather at its MIDPOINT
(70, 90…) and ends on its HARDEST level at the FINALE (80, 100…) — forced tight E/F geometry,
min-picked hardest, floored at 0.42-bot so the climax is always winnable (an unfair finale =
an impassable wall at a milestone). Finale is the #1–#5 hardest of its world through the realistic
range; very deep, every level is hard so it reads as a fair-but-tough cap + the milestone payoff.
NOTE: dev `wonThrough` must
NOT call levelAt() on generated levels (generating hundreds to total the sky stalled 18s) — it
sums curated exactly and estimates generated. Endgame = ENDLESS (decided June 12, 2026 after the replay/"caught-up" attempts felt like
dead-ends; this is Block Blast's real model). Levels 1-60 are curated (`web/js/levels.js`);
past that, `web/js/genLevel(n)` (`web/js/endless.js`) generates a board deterministically per
level number — faithful port of `gen-levels.cjs` geometry, validated solvable + kind (band-C
plateau, ≥0.6 bot in a 12-run check, every lantern lightable, world-midpoint breather + hard
world-finale). The odometer just keeps climbing ("Level 61"…), win card is "Continue" (or the
World-complete card at a world's last level — see the design-system section), and the sky fills
forever. There is NO all-won/replay/"see your sky" special state anymore. Sky count is a
running counter `store.sky` (can't be summed from the 60-level table); migrated on load.
World-arc (midpoint breather, finale peak) holds in both curated and generated ranges — don't
revert to "every 10th easy" (it made the climax the easiest level).
KNOWN deep-tail issue (pre-existing, NOT from the world-arc work): a few body levels past ~world
12 (level 240+) read <28% bot at high run-counts — 10-run gen noise leaking over-hard boards;
finales are all fair. Far past realistic play; fix needs higher-run gen validation (vs the <35ms budget).
