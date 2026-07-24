/* @jfun/difficulty — CADENCE: the labeled hard-beat layer. Pure functions, zero
   deps (browser + Node via UMD, like ./curve.js). This is the piece curve.js's
   2-position sawtooth never grew: PREDICTABLE, LABELED, evenly-spaced hard beats
   (Rattle's shipped 3-tier cadence: X4 hard 65% / X9 super 55% / every-3rd-X9 +
   finale extreme 45%), plus the two verdicts a generated campaign must face:
   checkCadence (no adjacent hards, a genuine breather after every super beat —
   judged on MEASURED win-rates, never on targets: the old target curve produced
   adjacent hards BY DESIGN and only measurement caught it) and checkDistribution
   (does the measured curve actually track the target curve).

   A `beat` is { cls, tgt } — cls names the label ("hard"/"super"/"extreme"), tgt
   is the target score at that level. Downstream consumers (campaign.js, a game's
   finalize) also accept legacy objects carrying `key` instead of `cls`. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JfunDifficulty = Object.assign(root.JfunDifficulty || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ---- makeBeatSchedule → beatFor(n) ----
     cfg:
       from     first level a beat may land on (teach + settle-in runway)  [21]
       cycle    beat cycle length                                          [10]
       slots    [{ pos, cls, tgt, everyNth?, nthCls?, nthTgt? }] — a beat at
                cycle position pos = (n-1) % cycle. `everyNth` escalates the
                slot every Nth cycle (cycle index floor((n-1)/cycle) % everyNth
                === 0) to { nthCls, nthTgt } — Rattle's every-3rd-X9 extreme.
       finale   { at, cls, tgt } — the campaign's last level, always a beat.
     Returns beatFor(n) → { cls, tgt } | null.
     Reproduces Rattle's shipped hardTier (gen-campaign.cjs) exactly with
       { from: 21, slots: [{ pos: 3, cls: "hard", tgt: 0.65 },
                           { pos: 8, cls: "super", tgt: 0.55, everyNth: 3,
                             nthCls: "extreme", nthTgt: 0.45 }],
         finale: { at: 106, cls: "extreme", tgt: 0.45 } }. */
  function makeBeatSchedule(cfg) {
    cfg = cfg || {};
    const from = cfg.from == null ? 21 : cfg.from;
    const cycle = cfg.cycle || 10;
    const slots = cfg.slots || [];
    const finale = cfg.finale || null;
    return function beatFor(n) {
      if (finale && n === finale.at) return { cls: finale.cls, tgt: finale.tgt };
      if (n < from) return null;
      const pos = (n - 1) % cycle, k = Math.floor((n - 1) / cycle);
      for (const s of slots) {
        if (s.pos !== pos) continue;
        if (s.everyNth && k % s.everyNth === 0) return { cls: s.nthCls, tgt: s.nthTgt };
        return { cls: s.cls, tgt: s.tgt };
      }
      return null;
    };
  }

  const clsOf = b => b ? (b.cls || b.key) : null;   // accept legacy { key } beats

  /* ---- checkCadence — the structural flow guarantees, on MEASURED scores ----
     rows: [{ n, wr, cls? }] in level order (gaps allowed — only adjacent-n pairs
     are judged, so a spliced sub-range checks honestly against re-measured
     neighbours). cfg:
       from            first level the adjacent-hard rule applies to      [17]
       adjacentHardMax two neighbours BOTH at/below this measured WR is a
                       violation (hard levels must never be adjacent)     [0.66]
       breatherAfter   { classes: ["super","extreme"], minWR: 0.72 } — the level
                       right after a beat of these classes must measure at least
                       minWR (a genuine breather, not another wall).
     Returns { ok, violations: [{ type: "adjacent-hard"|"no-breather", nA, nB,
     wrA?, wrB?, wr?, cls? }] }. Violations mean exit 2: written, but flagged
     for a single-level retune splice. */
  function checkCadence(rows, cfg) {
    cfg = cfg || {};
    const from = cfg.from == null ? 17 : cfg.from;
    const adjMax = cfg.adjacentHardMax == null ? 0.66 : cfg.adjacentHardMax;
    const ba = cfg.breatherAfter || { classes: ["super", "extreme"], minWR: 0.72 };
    const violations = [];
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i], b = rows[i + 1];
      if (!a || !b || a.wr == null || b.wr == null || b.n !== a.n + 1) continue;
      if (a.n >= from && a.wr <= adjMax && b.wr <= adjMax)
        violations.push({ type: "adjacent-hard", nA: a.n, nB: b.n, wrA: a.wr, wrB: b.wr });
      if (ba.classes.indexOf(clsOf(a)) >= 0 && b.wr < ba.minWR)
        violations.push({ type: "no-breather", nA: a.n, nB: b.n, cls: clsOf(a), wr: b.wr });
    }
    return { ok: !violations.length, violations };
  }

  /* ---- checkDistribution — does measured track target? REPORT, never a gate ----
     rows: [{ n, wr, cls?, inBand?, relax? }]. cfg:
       targetWR(n)   required — the plan's target curve
       bandLo/bandHi how far below/above target a level may sit before it is an
                     outlier (defaults mirror searchSeed's accept band: 0.22/0.14
                     — an accepted-in-band level is never an outlier)
       classMeanTol  per-class mean |measured − target| tolerance       [0.05]
     Returns { outliers: [{ n, wr, tgt, delta }], classes: { <cls>: { count,
     meanWR, meanTgt, delta, ok } }, relaxHist: { <relax>: count },
     fallbacks: [n…] } — the 09-difficulty "verify the shape" check, in code.
     Feed outliers + fallbacks to the retune queue; never widen a band to make
     this pass (band edits are plan edits, visible in diff). */
  function checkDistribution(rows, cfg) {
    cfg = cfg || {};
    const bandLo = cfg.bandLo == null ? 0.22 : cfg.bandLo;
    const bandHi = cfg.bandHi == null ? 0.14 : cfg.bandHi;
    const tol = cfg.classMeanTol == null ? 0.05 : cfg.classMeanTol;
    const outliers = [], byCls = {}, relaxHist = {}, fallbacks = [];
    for (const r of rows) {
      if (!r || r.wr == null) continue;
      const tgt = cfg.targetWR(r.n), delta = r.wr - tgt;
      if (delta > bandHi || delta < -bandLo) outliers.push({ n: r.n, wr: r.wr, tgt, delta: +delta.toFixed(3) });
      const cls = r.cls || "normal";
      (byCls[cls] = byCls[cls] || { wrs: [], tgts: [] }).wrs.push(r.wr);
      byCls[cls].tgts.push(tgt);
      if (r.relax != null) relaxHist[r.relax] = (relaxHist[r.relax] || 0) + 1;
      if (r.inBand === false) fallbacks.push(r.n);
    }
    const classes = {};
    for (const cls of Object.keys(byCls)) {
      const c = byCls[cls];
      const meanWR = c.wrs.reduce((a, v) => a + v, 0) / c.wrs.length;
      const meanTgt = c.tgts.reduce((a, v) => a + v, 0) / c.tgts.length;
      const delta = meanWR - meanTgt;
      classes[cls] = { count: c.wrs.length, meanWR: +meanWR.toFixed(3), meanTgt: +meanTgt.toFixed(3), delta: +delta.toFixed(3), ok: Math.abs(delta) <= tol };
    }
    return { outliers, classes, relaxHist, fallbacks };
  }

  return { makeBeatSchedule, checkCadence, checkDistribution };
});
