/* @jfun/difficulty — REPORT: difficulty read-outs over a whole campaign, built on
   the harness's per-level measurement. This replaces the one-off measure/curve/
   stars scripts every game was hand-rolling. All engine-specific behaviour comes
   through the same GameAdapter. */
(function (root, factory) {
  "use strict";
  const api = factory(typeof require === "function" ? require("./harness.js") : root.JfunDifficulty,
    typeof require === "function" ? require("./curve.js") : root.JfunDifficulty);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JfunDifficulty = Object.assign(root.JfunDifficulty || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function (H, CURVE) {
  "use strict";
  if (!H || !CURVE || typeof H.measureWR !== "function") throw new Error("@jfun/difficulty: report.js needs curve.js + harness.js loaded first");

  // per-level difficulty table. `levels` = the shipped level specs (each with a
  // budget). For each: par (beam optimum), and the win-rate of every policy the
  // adapter defines. `tierOf(L)` optionally groups rows. Returns { rows, byTier }.
  function curveReport(adapter, levels, opts) {
    opts = opts || {};
    const nRoll = opts.nRoll || 150;
    const policies = opts.policies || Object.keys(adapter.policies).filter(p => p !== "greedy");
    const tierOf = opts.tierOf || (() => "all");
    const maxDepth = opts.maxDepth || 24;
    const rows = [];
    for (let i = 0; i < levels.length; i++) {
      const spec = levels[i], L = i + 1;
      const par = H.beamOptimum(adapter, spec, { width: opts.beamWidth || 8, maxDepth });
      const row = { L, tier: tierOf(L), budget: adapter.budgetLeft(adapter.createWorld(spec)), par };
      for (const p of policies) { const m = H.measureWR(adapter, spec, p, nRoll); row[p] = +m.wr.toFixed(3); if (p === (opts.spareOf || "attentive")) row.spare = +m.spare.toFixed(1); }
      rows.push(row);
      if (opts.onRow) opts.onRow(row);
    }
    const byTier = {};
    for (const r of rows) { (byTier[r.tier] = byTier[r.tier] || []).push(r); }
    return { rows, byTier, policies };
  }

  // mean of a policy's win-rate across rows (or a subset)
  function mean(rows, key) { return rows.length ? rows.reduce((a, r) => a + (r[key] || 0), 0) / rows.length : 0; }

  // one-line-per-level text, plus a tier summary. Pure formatting.
  function formatCurve(report, opts) {
    opts = opts || {};
    const { rows, policies } = report;
    const pct = v => String(Math.round(v * 100)).padStart(3) + "%";
    const lines = rows.map(r => "L" + String(r.L).padStart(3) + " " + String(r.tier).padEnd(8) +
      " bud=" + String(r.budget).padStart(2) + " par=" + String(r.par).padStart(2) +
      "  " + policies.map(p => p + " " + pct(r[p])).join("  "));
    const summary = policies.map(p => "mean " + p + " " + pct(mean(rows, p))).join("  ·  ");
    return lines.join("\n") + "\n\n" + summary;
  }

  // star attainability: play the skilled policy `tries` times per level, keep the
  // BEST (fewest moves) clear, and grade it. Reports how many levels a good player
  // can 3★ / 2★ / PERFECT — a 3★ that's a genuine chase (not automatic) means the
  // budget carries real skill signal. Uses curve.starGrade so the rule stays one place.
  function starReport(adapter, levels, opts) {
    opts = opts || {};
    const tries = opts.tries || 80, thr = opts.thresholds;
    const policyName = opts.policy || "attentive";
    const policy = H.policyOf(adapter, policyName);
    let three = 0, two = 0, perfect = 0;
    const rows = [];
    for (let i = 0; i < levels.length; i++) {
      const spec = levels[i], L = i + 1;
      const par = H.beamOptimum(adapter, spec, { width: opts.beamWidth || 8, maxDepth: opts.maxDepth || 24 });
      const budget = adapter.budgetLeft(adapter.createWorld(spec));
      let best = Infinity, bestRattled = false;   // track the rattle-use of the BEST (fewest-used) line
      for (let k = 0; k < tries; k++) {
        const r = H.rollout(adapter, spec, policy, CURVE.mulberry32(((spec.seed || 0) ^ (k * 0x9e3779b9 + 1)) >>> 0));
        if (r.win) { const used = budget - r.spare; if (used < best) { best = used; bestRattled = r.rattled; } }
      }
      const g = best === Infinity ? { stars: 0, perfect: false } : CURVE.starGrade({ used: best, par, rattled: bestRattled }, thr);
      if (g.stars >= 3) three++; if (g.stars >= 2) two++; if (g.perfect) perfect++;
      rows.push({ L, par, budget, best: best === Infinity ? null : best, stars: g.stars, perfect: g.perfect });
    }
    return { rows, got3: three, got2: two, gotPerfect: perfect, of: levels.length };
  }

  return { curveReport, formatCurve, starReport, mean };
});
