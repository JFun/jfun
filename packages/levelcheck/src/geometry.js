/* Frame-fit geometry lint — the machine version of "the bucket is not fully
   displayed" (a real device-caught bug: Cut placed a basket at 0.88W whose right
   wall ran off the play field; the headless eyeball missed it).

   The game's certifier extracts axis-aligned bounds for every object that MUST
   be fully visible (baskets, goal zones, anchors, HUD-critical props) and this
   pure function judges them against the frame. Units are whatever the game
   uses (px, fractions) — everything is compared in the same space. */
"use strict";

/** Check that each item's box lies fully inside the frame.
 * @param {Array<{name:string,l:number,r:number,t:number,b:number}>} items
 *   Bounds per must-be-visible object (left/right/top/bottom edges).
 * @param {{w:number,h:number}} frame  The visible field size.
 * @param {{margin?:number}} [opts]  Required inset from every frame edge
 *   (same units; e.g. a few px so strokes/glows aren't clipped either).
 * @returns {Array<{name:string,problems:string[]}>} empty = pass.
 */
function frameFit(items, frame, opts) {
  // A BLOCKING gate must fail loud, never silently pass: a NaN/missing frame
  // would make every comparison false (adversarial-review finding).
  if (!frame || !isFinite(frame.w) || !isFinite(frame.h))
    throw new Error("frameFit: frame {w,h} must be finite (got " + JSON.stringify(frame) + ")");
  const margin = (opts && opts.margin) || 0;
  const out = [];
  for (const it of items) {
    const problems = [];
    if (!(isFinite(it.l) && isFinite(it.r) && isFinite(it.t) && isFinite(it.b))) {
      out.push({ name: it.name, problems: ["non-finite bounds"] });
      continue;
    }
    if (it.l > it.r || it.t > it.b) problems.push(`inverted bounds (l>r or t>b) — upstream extraction bug`);
    if (it.l < margin) problems.push(`left edge ${fmt(it.l)} < ${fmt(margin)}`);
    if (it.r > frame.w - margin) problems.push(`right edge ${fmt(it.r)} > ${fmt(frame.w - margin)}`);
    if (it.t < margin) problems.push(`top edge ${fmt(it.t)} < ${fmt(margin)}`);
    if (it.b > frame.h - margin) problems.push(`bottom edge ${fmt(it.b)} > ${fmt(frame.h - margin)}`);
    if (problems.length) out.push({ name: it.name, problems });
  }
  return out;
}

function fmt(n) { return Math.round(n * 100) / 100; }

module.exports = { frameFit };
