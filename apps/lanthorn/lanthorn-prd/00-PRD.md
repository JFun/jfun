# Lanthorn — PRD v1.0
*June 11, 2026. Gen-2/3 designed-level block puzzle. Web-first. Solo build.*
*One-liner: **Drag pieces, clear lines, light every lantern.***

## §0 HARD COMPLEXITY BUDGET (the law — every future feature is checked against this)

- **1 verb: DRAG** (place a piece from the hand onto the board). No rotate, no tap-ability, no second input ever.
- **0 rules to pre-learn.** Line-clear is genre knowledge (the most-downloaded verb+rule pair on Earth). Goals are read on sight: dim lantern in a cell → clear a line through it → it lights and floats up.
- **0 per-entity state the player must track.** No numbers on anything. No timers. No melt counters. A lantern is dim or lit — that's it. (The Underroot/Vinegrow/Thawline lesson: the twist must be *felt, not computed*.)
- **Variation comes only from level geometry and goal placement** — never from new player-facing rules. New visual goal types (roadmap §7) must be self-evident on sight or they don't ship.
- **Tutorial = one sentence**, shown once: "Fill a row or column through a lantern to light it."

## §1 What it is

Static, hand-feel designed levels (Gen-2/3 per DoF's generational analysis — the open, highest-RPD space; see `../06-exponential-growth-research.md` and `../01-market-research.md`). Each level: an 8×8 board with some blocked cells, 2–6 dim lanterns at fixed cells, and a seeded piece queue. Drag pieces from a 3-slot hand (refills when empty — Block Blast convention). Clear a full row/column through a lantern cell to light it. Light all lanterns → level complete, lanterns float into your night sky (meta). No piece fits → soft fail, instant free retry, same level, same queue.

**Why this game now:** user preference locked June 11 (easy + huge levels, Royal Match-shaped, one verb); block-puzzle lane still the #1 download verb (Block Blast #1 every month of Q1 2026); designed-level format is the proven evolution; lantern theme audited open (see `02-name-theme-audit.md`).

## §2 Easy-curve contract (the Royal Match philosophy, made testable)

| Level band | Target human win rate (first try) | Greedy-bot calibration band* | Feel |
|---|---|---|---|
| 1–10 | ≥97% | ≥85% | "I'm great at this" |
| 11–30 | ≥93% | ≥70% | Gentle waves |
| 31–60 | ≥88% | ≥55% | First real bumps, relief valleys after |
| 61+ | 85% ±8 in waves | ≥40% | Waves, never walls; each 20-level world ramps to a climax |

*Bot is weaker than humans; bands set in `tuning.json`, validated by `greybox/bot-sim.cjs` over 100 seeds/level. Any level outside its band gets regenerated or hand-fixed — no exceptions.*

**World-arc (added June 13, 2026).** Levels are chunked into 20-level worlds. Within each world the difficulty ramps to a climax: an archetype-A **breather at the midpoint** (10, 30, 50…) and the **hardest level at the finale** (20, 40, 60…), which the World-complete card pays off. This replaced "every 10th level is a breather" — that rule put the easiest level last, backwards from the genre (the last level of a chapter should be its toughest, the first should ease you in). Endless finales stay hard-but-always-winnable (floored at 0.42-bot) so a world boundary is never an impassable wall.

Generosity rules: no lives, no energy, no timer anywhere; soft fail = instant free retry, same queue; win celebration > fail commiseration in juice budget 3:1. *(Amended June 11, 2026: the near-win "fresh hand" assist was cut after device playtesting — uncommon in the genre and confusing in every presentation tried; knob disabled in tuning.json, engine functions retained unused.)*

## §3 Scope

**MVP (web, weeks 1–6):**
- 60 designed levels (validated by bot + 10-person fun gate on levels 1–20), then an **endless
  generated tail** so the odometer never hits a wall *(amended June 12, 2026: levels 61+ are
  generated deterministically per level number, validated solvable + kind at a cozy band-C
  plateau — Block Blast's endless-alongside-designed model, chosen over a "caught up, more
  coming" dead-end after device testing. The post-gate pipeline still curates more hand-designed
  levels to extend the front of the campaign.)*
- Core loop, night-sky meta screen (lanterns accumulate; pure collection, no economy)
- One goal type only (light the lantern). One board size (8×8).
- CrazyGames SDK integration; their 48h homepage = launch audience. Poki submission after.

**Post-gate (weeks 7+):** 200 levels via generator pipeline (see `01-level-design-spec.md`), weekly 20-level packs, iOS App Store build via **Capacitor** wrapping the same web codebase *(amended June 12, 2026 — was "Unity port". One codebase serves CrazyGames + stores; native Firebase/IAP via Capacitor plugins; Godot port is the fallback only if the webview ever hits a feel/perf wall, which two days of on-device testing did not surface.)*

**Explicitly NOT in MVP:** IAP, ads beyond CrazyGames defaults, daily mode, leagues, second goal types, boosters. (Daily Worldboard machinery from `../07-next-game-shortlist.md` returns later as an *events mode* if the level game proves fun.)

## §4 Metrics gates (standing process, unchanged)

1. **Greybox fun gate (week 1):** 10 people play 10 grey levels. Pass = ≥8 finish all 10 AND ≥6 unprompted ask for more levels. Fail = pivot to backup (Bubble Settle Levels per 07 §Easy+Levels).
2. **Web soft gate (weeks 4–6):** D1 ≥35%, D7 ≥12% on CrazyGames cohort; level-quit heatmap shows no wall before level 50.
3. **Only then:** iOS port, then monetization design (fail-offer data in `../06`: offers convert at frustration moments — which is exactly why monetization waits until the curve is proven kind).

## §5 Review safety (4.1/4.3, per ../02-apple-review-rules.md)

- Genre base (line-clear board) = public-domain pattern with 100s of coexisting apps; our designed-level format + lantern goals + name + art + audio all original.
- App Review Notes (paste verbatim): "Lanthorn is an original level-based puzzle game. The board mechanic (place pieces, clear lines) is a classic public-domain pattern; all level designs, the lantern goal system, name, art, music, and code are original to this developer."
- Metadata hygiene: no competitor names or squatted phrases; subtitle claims "lantern block puzzle" (audited unsquatted June 11).
- Name: Lanthorn (cleared App Store/Play/Steam/web June 11; **USPTO manual check pending — do before listing**; unchecked backups: Lanternrise, Glowmoor).

## §6 Build plan (7–8 week clock from greybox, per standing rule)

| Week | Deliverable |
|---|---|
| 1 | Greybox fun gate (kit includes working `greybox/greybox.html` + bot validation) |
| 2–3 | Web build proper: theme pass (lanterns/night sky), juice, 60 levels, CrazyGames SDK |
| 4 | CrazyGames launch (48h homepage window), telemetry |
| 5–6 | Iterate on quit heatmap; Poki submission; level generator to 200 |
| 7–8 | Gates pass → App Store build begins (Capacitor wrap of the web build; amended June 12, 2026); gates fail → post-mortem against 07 backups |

## §7 Variation roadmap (each item must pass §0 on-sight test before shipping)

Sequenced only after web gates pass: paper lanterns that need their row AND column (visibly wrapped twice — telegraphed by two glass layers), 2×2 festival lanterns (span two lines, visibly big), seasonal sky scenes (pure skin), star-par per level (soft, no fail state), festival events = the Daily Worldboard mode from 07, finally boosters+IAP per hybrid-casual data in 06.

## §8 Risks & kill criteria

- **Crowded genre, content treadmill** — accepted consciously (06 §trade-off). Mitigation: web-first free distribution, theme differentiation, generator pipeline.
- **Fun gate fail** → backup per 07: Bubble Settle Levels (FLICK), then Vita lane.
- **"Easy" miscalibrated** (testers bored) → tighten bands 11–30 before concluding the format is wrong; boredom at L1–10 is fine (it's onboarding).
- **Block Crush adjacency** (frozen-rescue flavor) — we are not ice-themed; re-run differentiation audit before listing per standing rule.

## Files in this kit

| File | What |
|---|---|
| 00-PRD.md | This file |
| 01-level-design-spec.md | Level JSON schema, geometry archetypes, generator + bot pipeline, content cadence |
| 02-name-theme-audit.md | Theme + name audits with links, USPTO to-do |
| tuning.json | Every knob: bands, weights, hand size, assist rules, bot params |
| greybox/greybox.html | Playable grey-rectangle build, 10 levels, drag UX, ?bot=1 mode |
| greybox/engine.js | Shared logic (board, pieces, clears, goals, bot) — same file drives greybox and node sim |
| greybox/bot-sim.cjs | Headless validation: `node bot-sim.cjs` → win% per level vs tuning bands |

## Appendix: greybox bot validation (run June 11, 2026 — 100 seed-variants/level, greedy bot, no assist)

```
lvl band  win%   bandMin  median-pieces  verdict
  1  A    100%     85%          7       PASS
  2  A    100%     85%         12       PASS
  3  A    100%     85%          8       PASS
  4  A    100%     85%         14       PASS
  5  B     98%     70%         14       PASS
  6  B     95%     70%         10       PASS
  7  B     99%     70%         14       PASS
  8  C     86%     55%         19       PASS
  9  C     89%     55%         13       PASS
 10  C     75%     55%         19       PASS
ALL LEVELS WITHIN BANDS ✓
```

Monotonic-ish descent, no walls, all within band — the curve contract holds at greybox. Humans outperform the greedy bot, so first-try human win rates should sit above these figures. Next action: 10-person fun gate (tuning.json §greyboxFunGate).
