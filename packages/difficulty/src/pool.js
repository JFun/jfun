/* @jfun/difficulty — POOL: the second distribution-matching mode. Some games
   don't generate-to-a-target — they build a POOL of proven boards and match the
   difficulty curve by ORDERING it (Tilt: display L7-30 is a pinned permutation
   of 24 verified boards; Cut: a hand-built band permutation applied by splice).
   Pure functions, zero deps (UMD like ./curve.js).

   Doctrine: sawtoothOrder PROPOSES — its output is printed for HAND-PINNING,
   never auto-applied. Board identity must stay keyed by SOURCE, not display
   position (Tilt's renumber scar: saves and tests keyed off display numbers had
   to be migrated). checkOrder is the shipping gate either way: it validates the
   PINNED permutation (Tilt engine-tests' sawtooth pins, generalized). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JfunDifficulty = Object.assign(root.JfunDifficulty || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* propose a sawtooth permutation over board difficulty scores.
     scores: number[] (per-board difficulty, game-defined — e.g. Tilt's
     2·par + holes + walls/2 + zones + posts·1.5). cfg:
       cycle  tooth length [4] — each tooth = (cycle-1) rising valley boards +
              1 peak; valleys and peaks both rise across the run.
     Returns perm: perm[displayIndex] = sourceIndex. The global max lands LAST
     (finale-is-max). Deterministic; ties keep source order (stable sort). */
  function sawtoothOrder(scores, cfg) {
    cfg = cfg || {};
    const cycle = cfg.cycle || 4;
    const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b] || a - b);
    const finale = idx.pop();                        // global max → last, always
    const nTeeth = Math.max(1, Math.min(Math.round(idx.length / cycle), idx.length));
    const peaks = idx.splice(idx.length - nTeeth, nTeeth);   // hardest of the rest, ascending
    const perm = [];
    for (let t = 0; t < peaks.length; t++) {
      // this tooth's valley: an even share of the remaining easy boards, ascending
      const take = Math.ceil(idx.length / (peaks.length - t));
      for (let k = 0; k < take && idx.length; k++) perm.push(idx.shift());
      perm.push(peaks[t]);                           // tooth peak, rising per tooth
    }
    perm.push(finale);
    return perm;
  }

  /* validate an ORDERED score sequence as a sawtooth (run it over
     perm.map(i => scores[i])). cfg:
       minFlips   minimum direction changes across the run          [required-ish: 0]
       finaleMax  the last score must be the global max             [true]
       maxScore?  optional cap sanity
     Returns { ok, flips, violations: [{ type, detail }] }. */
  function checkOrder(ordered, cfg) {
    cfg = cfg || {};
    const minFlips = cfg.minFlips || 0;
    const finaleMax = cfg.finaleMax !== false;
    const violations = [];
    let flips = 0, dir = 0;
    for (let i = 1; i < ordered.length; i++) {
      const d = Math.sign(ordered[i] - ordered[i - 1]);
      if (d !== 0 && dir !== 0 && d !== dir) flips++;
      if (d !== 0) dir = d;
    }
    if (flips < minFlips) violations.push({ type: "too-flat", detail: "direction changes " + flips + " < " + minFlips });
    if (finaleMax && ordered.length) {
      const max = Math.max.apply(null, ordered);
      if (ordered[ordered.length - 1] !== max) violations.push({ type: "finale-not-max", detail: "finale " + ordered[ordered.length - 1] + " < max " + max });
    }
    return { ok: !violations.length, flips, violations };
  }

  /* is perm a valid permutation of 0..n-1? (every board shipped exactly once —
     Tilt's pinned permutation-validity assertion, generalized) */
  function validPermutation(perm, n) {
    if (perm.length !== n) return false;
    const seen = new Array(n).fill(false);
    for (const p of perm) { if (!(p >= 0 && p < n) || seen[p]) return false; seen[p] = true; }
    return true;
  }

  return { sawtoothOrder, checkOrder, validPermutation };
});
