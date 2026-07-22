/* Distinctness scoring — the machine half of the anti-clone gate ("a level is
   distinct only if a screenshot looks different"; the scar that trimmed Cut's
   overnight 100 to 53). Two complementary measures:

   1. FEATURE distance — mechanics used (set) + layout landmarks (normalized
      points: anchors, hazard endpoints, goal center). Cheap, explains WHY two
      levels are similar.
   2. SCREENSHOT average-hash — an 8×8 luma hash the game computes in-page from
      its own canvas (downsample → mean-threshold → 64 bits); Hamming distance
      here. Catches "looks the same" even when the feature vector differs.

   Both are ADVISORY: they rank the closest pairs for a human eyeball, they do
   not auto-reject (mirrors legitimately hash close; a re-themed layout can
   hash far). */
"use strict";

/** Jaccard similarity of two string sets (arrays). 1 = identical. */
function jaccard(a, b) {
  const A = new Set(a || []), B = new Set(b || []);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Symmetric mean nearest-neighbor distance between two point sets
 * (points normalized 0..1; result clamped 0..1). 0 = same layout. */
function pointsDistance(A, B) {
  // Drop non-finite points instead of letting NaN silently score as MAX
  // distance (which pushed broken-data levels to the "distinct" end of the
  // ranking — the gate weakening exactly when upstream data is bad).
  const fin = (P) => (P || []).filter((p) => isFinite(p[0]) && isFinite(p[1]));
  const a = fin(A), b = fin(B);
  if (!a.length && !b.length) return 0;
  if (!a.length || !b.length) return 1;
  const mean = (from, to) => {
    let sum = 0;
    for (const p of from) {
      let best = Infinity;
      for (const q of to) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < best) best = d;
      }
      sum += Math.min(best, 1);
    }
    return sum / from.length;
  };
  return Math.min(1, (mean(a, b) + mean(b, a)) / 2);
}

/** Normalized L1 distance over shared scalar features (counts, budgets, quotas
 * — e.g. Rattle's {taps, need, count}), each key scaled by the pair's larger
 * magnitude so heterogeneous units compare sanely. Missing-on-one-side keys
 * count as maximally different. 0 = identical scalars. */
function scalarsDistance(A, B) {
  const a = A || {}, b = B || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (!keys.size) return 0;
  let sum = 0;
  for (const k of keys) {
    const va = a[k], vb = b[k];
    if (va == null || vb == null) { sum += 1; continue; }
    const denom = Math.max(Math.abs(va), Math.abs(vb));
    sum += denom ? Math.min(1, Math.abs(va - vb) / denom) : 0;
  }
  return sum / keys.size;
}

/** Combined feature distance in [0..1]; 0 = clone-identical. Channels are
 * OPTIONAL — weights renormalize over the channels a game actually supplies
 * (a grid game with no meaningful layout points can run mechanics+scalars only).
 * @param {{mechanics?:string[], points?:number[][], scalars?:Object}} a
 * @param {{mechanics?:string[], points?:number[][], scalars?:Object}} b
 * @param {{wMech?:number, wLayout?:number, wScalars?:number}} [w]
 *   weights (defaults 0.5/0.5/0 — scalars opt-in) */
function featureDistance(a, b, w) {
  const parts = [];
  const wm = (w && w.wMech) != null ? w.wMech : 0.5;
  const wl = (w && w.wLayout) != null ? w.wLayout : 0.5;
  const ws = (w && w.wScalars) != null ? w.wScalars : ((a.scalars || b.scalars) ? 0.34 : 0);
  if (wm > 0 && (a.mechanics || b.mechanics)) parts.push([wm, 1 - jaccard(a.mechanics, b.mechanics)]);
  if (wl > 0 && (a.points || b.points)) parts.push([wl, pointsDistance(a.points, b.points)]);
  if (ws > 0 && (a.scalars || b.scalars)) parts.push([ws, scalarsDistance(a.scalars, b.scalars)]);
  const total = parts.reduce((s, p) => s + p[0], 0);
  // No channel supplied on EITHER side = an adapter bug, not "identical
  // levels" — fail loud instead of reporting every pair as a clone.
  if (!total) throw new Error("featureDistance: neither level supplies any feature channel (mechanics/points/scalars)");
  return parts.reduce((s, p) => s + p[0] * p[1], 0) / total;
}

/** Rank every pair by feature distance, ascending (closest = most clone-like).
 * @param {Array<{id:string|number, mechanics?:string[], points?:number[][]}>} levels
 * @param {{threshold?:number}} [opts] pairs below threshold get flagged:true
 * @returns {Array<{a,b,dist,flagged}>} sorted ascending by dist */
function nearDuplicates(levels, opts) {
  const threshold = (opts && opts.threshold) != null ? opts.threshold : 0.18;
  const out = [];
  for (let i = 0; i < levels.length; i++)
    for (let j = i + 1; j < levels.length; j++) {
      const dist = featureDistance(levels[i], levels[j]);
      out.push({ a: levels[i].id, b: levels[j].id, dist, flagged: dist <= threshold }); // inclusive: threshold 0 still flags exact clones
    }
  return out.sort((x, y) => x.dist - y.dist);
}

/** 64-bit average hash from an 8×8 luma array (0..255, row-major, length 64):
 * bit i = luma[i] > mean. Returns 16-char hex string. The game computes the
 * luma in-page (drawImage(canvas,0,0,8,8) → getImageData → 0.299R+0.587G+0.114B). */
function hashFromLuma(luma) {
  if (!Array.isArray(luma) || luma.length !== 64) throw new Error("hashFromLuma wants 64 luma values");
  if (!luma.every(isFinite)) throw new Error("hashFromLuma: non-finite luma value");
  const mean = luma.reduce((s, v) => s + v, 0) / 64;
  let hex = "";
  for (let n = 0; n < 16; n++) {
    let nib = 0;
    for (let k = 0; k < 4; k++) nib = (nib << 1) | (luma[n * 4 + k] > mean ? 1 : 0);
    hex += nib.toString(16);
  }
  return hex;
}

/** Hamming distance between two hex hashes (0..64 for 16-char hashes). */
function hamming(hexA, hexB) {
  if (hexA.length !== hexB.length) throw new Error("hash length mismatch");
  let d = 0;
  for (let i = 0; i < hexA.length; i++) {
    const na = parseInt(hexA[i], 16), nb = parseInt(hexB[i], 16);
    if (isNaN(na) || isNaN(nb)) throw new Error("hamming: non-hex character in hash");
    let x = na ^ nb;
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

module.exports = { jaccard, pointsDistance, scalarsDistance, featureDistance, nearDuplicates, hashFromLuma, hamming };
