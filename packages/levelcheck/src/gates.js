/* @jfun/levelcheck — GATES: the standard severity bundle over this package's
 * judges, for generation loops that want ONE call per candidate. The judges
 * stay pure and individually importable; this file only encodes the studio's
 * default severity routing (frame-fit + robustness BLOCKING, order +
 * distinctness ADVISORY — a flag means "human, look", not "reject") and the
 * candidate-vs-accepted-pool distinctness check that nearDuplicates (which
 * ranks WITHIN one set) doesn't cover.
 *
 * The game still extracts every fact itself (its certifier drives its real
 * engine — winnability certification stays per-game); this bundle only judges.
 * All knobs live INSIDE the facts subgroups. If a game starts needing per-game
 * exemptions beyond what the facts express, go back to hand-wiring the judges
 * — this file is a convenience, not a policy engine. */
"use strict";
const G = require("./geometry.js");
const O = require("./order.js");
const D = require("./distinct.js");
const R = require("./robustness.js");

/** Distinctness of ONE candidate against the already-accepted pool — the
 * generation-time anti-clone probe. Returns {minDist, closest, flagged};
 * an empty pool is trivially distinct. Advisory by doctrine: mirrors hash
 * close, re-themes hash far — a human eyeballs flagged pairs.
 * @param {{mechanics?,points?,scalars?}} feature      the candidate's features
 * @param {Array<{id?,mechanics?,points?,scalars?}>} poolFeatures accepted pool
 * @param {{threshold?:number, weights?:Object}} [opts] threshold default 0.18 */
function poolDistinct(feature, poolFeatures, opts) {
  const threshold = (opts && opts.threshold) != null ? opts.threshold : 0.18;
  let minDist = Infinity, closest = null;
  for (let i = 0; i < poolFeatures.length; i++) {
    const dist = D.featureDistance(feature, poolFeatures[i], opts && opts.weights);
    if (dist < minDist) { minDist = dist; closest = poolFeatures[i].id != null ? poolFeatures[i].id : i; }
  }
  if (!poolFeatures.length) return { minDist: Infinity, closest: null, flagged: false };
  return { minDist, closest, flagged: minDist <= threshold };
}

/** Run the standard gate set over extracted facts. Every fact group is
 * optional — supply what your game can honestly extract (README "Fits" table:
 * frameFit is vacuous on fixed grids, order N/A where move order is free).
 *
 * facts:
 *   frame?    { items, frame, margin? }                → frameFit, BLOCKING
 *   sweep?    { samples, minWidth?, minRun?, taught?, minDensity?,
 *               advisory? }                            → robustness, BLOCKING
 *             samples = FULL no-early-exit sweep ({x, win, method}) — an
 *             early-exit certify sweep can NEVER feed this (existence ≠
 *             density). taught = the method that must hold a real band (its
 *             ABSENCE is the Gallows tell). advisory:true downgrades the whole
 *             group (the pulse-gate carve-out: blind bots can't watch a
 *             visible clock — human judges the beat).
 *   order?    { values, minGap? }                      → monotoneOrder, ADVISORY
 *   distinct? { feature, pool, threshold?, weights? }  → poolDistinct, ADVISORY
 *
 * Returns { blocking: [{name, ok, detail}], advisory: [{name, ok, detail}] }. */
function runGates(facts) {
  const blocking = [], advisory = [];
  if (facts.frame) {
    const bad = G.frameFit(facts.frame.items, facts.frame.frame, { margin: facts.frame.margin });
    blocking.push({ name: "frame-fit", ok: !bad.length, detail: bad.map(b => b.name + ": " + b.problems.join(",")).join("; ") });
  }
  if (facts.sweep) {
    const s = facts.sweep, out = s.advisory ? advisory : blocking;
    const mw = R.methodWindows(s.samples, { minWidth: s.minWidth, minRun: s.minRun });
    if (s.taught) {
      const t = mw[s.taught];
      out.push({ name: "taught-method-window", ok: !!(t && t.ok), detail: t ? "widest band " + (t.widest ? t.widest.width : 0) : "taught method '" + s.taught + "' NEVER wins (the Gallows tell)" });
    } else {
      const any = Object.keys(mw).some(k => mw[k].ok);
      out.push({ name: "solve-window", ok: any, detail: any ? "" : "no method holds a human-hittable band" });
    }
    const density = R.winDensity(s.samples);
    const minDensity = s.minDensity == null ? 0.05 : s.minDensity;
    out.push({ name: "win-density", ok: density >= minDensity, detail: "density " + density.toFixed(3) + (density >= minDensity ? "" : " < " + minDensity + " — winnable but a lottery") });
  }
  if (facts.order) {
    const ord = O.monotoneOrder(facts.order.values, { minGap: facts.order.minGap });
    advisory.push({ name: "order-discoverable", ok: ord.ok, detail: ord.ok ? "" : "winning order not readable off the visible attribute (dir " + ord.dir + ", " + ord.violations.length + " violations)" });
  }
  if (facts.distinct) {
    const pd = poolDistinct(facts.distinct.feature, facts.distinct.pool, facts.distinct);
    advisory.push({ name: "pool-distinct", ok: !pd.flagged, detail: pd.flagged ? "dist " + pd.minDist.toFixed(3) + " to accepted level " + pd.closest + " — likely clone" : "" });
  }
  return { blocking, advisory };
}

module.exports = { runGates, poolDistinct };
