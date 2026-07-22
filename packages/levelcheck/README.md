# @jfun/levelcheck

Level QA gates, packaged for every jfun game. Three pure, engine-agnostic
judges over facts **your game's own certifier** extracts (winnability
certification stays per-game — engines differ):

| Gate | Function | Judges | Severity | Fits |
|---|---|---|---|---|
| Frame-fit | `frameFit(items, frame, {margin})` | every must-be-visible object fully inside the field | **blocking** | free-placement games (Cut). Vacuous for fixed-grid games (Tilt's 8×8 tray) — skip there |
| Order discoverability | `monotoneOrder(values, {minGap})` | the winning solve's order is readable off a visible attribute | advisory | games with ordered multi-move solves over placed objects (Cut's order-walks). N/A where move order is free (Rattle) or moves aren't spatial picks (Tilt) |
| Distinctness | `nearDuplicates(levels, {threshold})`, `scalarsDistance`, `hashFromLuma`, `hamming` | anti-clone: closest pairs ranked for a human eyeball | advisory | every game — pick your channels: mechanics set, layout points, AND/OR scalar features (counts/budgets/quotas — the Rattle case). Screenshot hash is optional |

**Coordinate contract:** `frameFit` bounds and the frame share an implicit
(0,0) origin — pass FIELD-LOCAL coordinates (Cut's play field is 0..W after its
OX translate). If your visible field is a sub-rect (HUD band, centered framing),
subtract the offset before calling.

## The doctrine

The studio's verification net (docs/handbook/10-verification.md) wants machines
to prove **correct / fair / graded** so humans only judge **feel**. These gates
encode three scars:

- **Frame-fit** — "the bucket is not fully displayed": Cut shipped a basket at
  0.88W whose right wall ran off the play field; a device screenshot caught what
  the headless eyeball missed. Machine-checkable, so it is now.
- **Order discoverability** — certified-solvable ≠ discoverable. A certifier's
  cascade can prove a multi-cut win exists while the player has no readable cue
  for the order. Rule: the winning order should be monotone in something
  VISIBLE (anchor height, x-position) with a see-able gap. Advisory, because
  some families read via a different cue (Cut's 2-rope tips read by basket
  side) — a flag means "human, look", not "reject".
- **Distinctness** — the 100→53 clone-trim: "a level is distinct only if a
  screenshot looks different". Feature distance (mechanics set + layout
  landmarks) explains *why* two levels are close; the 8×8 average-hash catches
  *looks the same* regardless. Ranked pairs, human verdict.

## Wiring pattern (per game)

Your certifier extracts facts, this package judges them:

```js
const LC = require("@jfun/levelcheck");

// 1. Frame-fit (blocking): bounds of everything that must be visible.
const bad = LC.frameFit(
  [{ name: "basket", l: bx - iw / 2, r: bx + iw / 2, t: yTop, b: yBottom }],
  { w: W, h: H }, { margin: 2 });
if (bad.length) fail(bad);

// 2. Discoverability (advisory): the winning solve's visible attribute, in order.
//    e.g. Cut records each cut rope's anchor height (as H-fractions) when a
//    cascade wins; minGap 0.02 = 2% of screen height between steps.
const ord = LC.monotoneOrder(winningAnchorYs, { minGap: 0.02 });
if (!ord.ok) warn("order not readable by height — check the cue");

// 3. Distinctness (advisory report): one feature vector per level.
const pairs = LC.nearDuplicates(levels.map(L => ({
  id: L.n,
  mechanics: L.mechanicsPresent,          // ["rope","spike","pulley",…]
  points: L.landmarks,                    // [[x/W, y/H], …] anchors+hazards+goal
})));
// print the top-10 closest for review; `flagged` pairs are likely clones.
// Optional: in-page 8×8 luma → hashFromLuma → hamming matrix for looks-alike.
```

**Luma extraction for the screenshot hash** (OPTIONAL channel): draw the live
canvas into an 8×8 canvas, read pixels, return `0.299R+0.587G+0.114B` per pixel
(64 values) — `hashFromLuma` does the rest in Node. Cut does this via its
`__game.luma8()` dev hook. **Honest caveat:** no game has a Node-side
rasterizer — a second adopter either drives its existing browser/CDP screenshot
harness to collect lumas, or skips the hash channel and runs feature distance
only (fully supported: channels renormalize). Full-bleed pile games (Rattle:
every board is "a jar of balls") get little discrimination from an 8×8 hash —
use the scalars channel there instead.

## Per-game adapters in the wild

- **Cut** (`apps/cut/scripts/dev/fairness.cjs`): frame-fit on the basket per
  level (blocking); cascade-win anchor-height readability (advisory ⚠);
  `node fairness.cjs distinct` prints the closest-pair report.
- **Tilt / Rattle / Quarter** (not yet wired): their engines run in Node so
  facts come straight from the level specs — Rattle's natural feature vector is
  `mechanics` (element mix) + `scalars` ({count, taps, need}); Tilt's is
  mechanics + grid landmarks. frameFit/monotoneOrder don't apply there (see the
  Fits column) — adopt distinctness first.

Run tests: `node packages/levelcheck/test.cjs`
