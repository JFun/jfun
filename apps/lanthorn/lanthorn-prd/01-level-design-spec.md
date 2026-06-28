# Lanthorn — Level Design Spec v1.0
*Companion to 00-PRD.md §2/§3. The content machine: how one person ships 200+ levels that all feel hand-made and kind.*

## Level format (JSON)

```json
{
  "id": 12,
  "band": "B",
  "blocked": [[0,0],[0,7],[7,0],[7,7]],
  "lanterns": [[3,2],[4,5]],
  "seed": 11012,
  "par": 9
}
```

- `blocked`: wall cells (visual: stone). Never more than 14 cells (8×8 keeps ≥50 playable).
- `lanterns`: 2–6 goal cells. Never on a blocked cell, never all in one line (multi-line play required).
- `seed`: piece queue is `mulberry32(seed)` — every player gets the identical authored queue. Retry = same queue (a level is a designed object, not a slot machine).
- `par`: pieces used by the bot's best run; soft target only.

## Piece pool

Fixed-orientation pieces (no rotate — one verb). Pool with band weights in `tuning.json`:
I2 I3 I4 (horizontal+vertical), SQ2 (2×2), L3 (corner ×4 orientations), T4 (×4), S4/Z4 (×2 each), I5 (late bands only).
Early bands overweight small/straight pieces (forgiving), later bands even out. **The pool never grows new piece types players must "learn" — every shape reads instantly.**

## Geometry archetypes (variation without rules)

| Archetype | Blocked pattern | Teaches (implicitly) |
|---|---|---|
| A. Open field | none | pure placement |
| B. Corners | 4 corner cells | edge planning |
| C. Frame | partial border ring | interior economy |
| D. Channel | one blocked row segment | forced lane through goals |
| E. Islands | 2–3 scattered 2-cell walls | split-board play |
| F. Diagonal | staircase walls | long-line setups |

Levels cycle archetypes with rising lantern counts; every 10th level is archetype A (breather, PRD §2).

## Generator + validation pipeline (the "huge amount of levels" answer)

1. **Generate:** sample archetype + lantern placement (rules above) + random seed.
2. **Bot-validate:** `bot-sim.cjs` plays 100 seed-variants; compute win%, median pieces.
3. **Band-sort:** assign to band by win% (tuning.json bands); discard levels outside all bands or where any single lantern was never lit across runs (unfair placement).
4. **Human pass:** 30-second play of each survivor; tag "feel" (open/tight/clever); reorder so feels alternate.
5. **Cadence:** 60 hand-picked for MVP → 200 by week 6 → 20/week after (≈1 hr/week of curation, the rest is pipeline).

AI-assist note (06): generation + first-pass tagging can be LLM-assisted; the bot gate and human pass are non-negotiable.

## Difficulty levers (allowed) vs forbidden levers

Allowed: more lanterns, tighter geometry, lantern-on-edge/corner, piece-weight shifts, longer par.
**Forbidden forever (§0):** new rules, timers, counters, moving/decaying anything, piece types needing explanation, mandatory combos.

## Greybox levels 1–10 (shipped in kit)

Ramp: A→A→B→B→C→D→C→E→D→F. Lanterns 2,2,2,3,3,3,4,4,4,5. Bands per tuning.json. Bot-validated — run `node greybox/bot-sim.cjs` for the current table (results also pasted into kit README section of PRD after each tuning change).
