/* Winning-order discoverability — "certified solvable" is not "discoverable".
   A certifier can prove a multi-cut win EXISTS (e.g. via a top-down cascade)
   while the player has no readable cue for WHICH order wins. The studio rule:
   the winning order must be monotone in some VISIBLE attribute (anchor height,
   left-to-right position, size…), with a big-enough gap between consecutive
   steps that a player can actually SEE the ordering.

   The game's certifier records the visible attribute of each move of the
   winning solve, in solve order; this judges readability. ADVISORY by design:
   some families are readable via a different cue (Cut's 2-rope tip levels read
   by basket side, not anchor height) — a flag means "a human should look",
   not "reject". */
"use strict";

/** Is the sequence strictly monotone (either direction) with a visible gap?
 * @param {number[]} values  Visible attribute per move, in winning-solve order.
 * @param {{minGap?:number}} [opts]  Minimum |step| between consecutive moves,
 *   in the same units (e.g. 0.02 when values are screen-height fractions).
 * @returns {{ok:boolean, dir:'increasing'|'decreasing'|'n/a',
 *            violations:Array<{i:number,prev:number,next:number,gap:number}>}}
 */
function monotoneOrder(values, opts) {
  const minGap = (opts && opts.minGap) || 0;
  if (!Array.isArray(values) || values.length < 2)
    return { ok: true, dir: "n/a", violations: [] };
  // Direction by MAJORITY VOTE over steps (not first→last): a single outlier
  // step at either end must read as THE violation, not flip the inferred
  // direction and mark every good step (adversarial-review finding).
  let up = 0, down = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) up++; else if (d < 0) down++;
  }
  const dirSign = up >= down ? 1 : -1;
  const violations = [];
  for (let i = 1; i < values.length; i++) {
    const step = (values[i] - values[i - 1]) * dirSign;
    // strictly monotone even at minGap 0: equal values are never readable order
    if (!(step >= minGap && step > 0))
      violations.push({ i, prev: values[i - 1], next: values[i], gap: values[i] - values[i - 1] });
  }
  return { ok: violations.length === 0, dir: dirSign > 0 ? "increasing" : "decreasing", violations };
}

module.exports = { monotoneOrder };
