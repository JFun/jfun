/* @jfun/difficulty — CURVE: the engine-agnostic difficulty math. Pure functions,
   zero deps (browser + Node via UMD). This is the part EVERY game can use as-is:
   the shape of the difficulty curve, the tap/move-slack schedule, and the
   efficiency-star grade. The measurement + tuning that DRIVE these live in
   ./harness.js (they need a per-game engine adapter); this file needs nothing.

   The defaults encode the "cozy / no-IAP" curve validated on Rattle (docs/
   handbook/09-difficulty.md): teach ~90% first-try clear → normal ~72-80% →
   hard beats ~55-60%, NO sub-45% cliff (cliffs only exist to sell boosters). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JfunDifficulty = Object.assign(root.JfunDifficulty || {}, api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // deterministic RNG (inlined so this file is dependency-free). Seed rollouts /
  // policies with this so a measured win-rate is reproducible.
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // the one difficulty "lever": linear-interpolate a parameter across d ∈ [0,1]
  // (the position within a tier / section). Scarcer objective, denser hazards,
  // tighter budget — every knob is a ramp(easyValue, hardValue, d).
  const ramp = (from, to, t) => from + (to - from) * clamp(t, 0, 1);

  /* ---- target first-try win-rate curve (the sawtooth) ----
     A campaign is a rising baseline with a sawtooth on top: each ~`cycle`-level
     block opens with a breather and tightens to a hard beat; the baseline drifts
     down across the run. Returns targetWR(n) ∈ [floor, ceil].

     cfg (all optional, defaults = Rattle's cozy curve):
       len          total levels (for the baseline slope)         [106]
       segments     baseline anchors [{ untilFrac|until, from, to }] — piecewise
                    lerp of the base win-rate. `until` is an absolute level,
                    `untilFrac` a fraction of len. Defaults teach→mid→late.
       cycle        sawtooth period                                [10]
       breatherBump +WR at cycle start (positions 0..1)            [+0.05]
       hardBeatDip  −WR at cycle end (positions ≥ cycle-2)         [−0.16]
       sawFrom      level at/after which the sawtooth applies      [17]
       floor, ceil  clamp                                          [0.50, 0.95] */
  function makeTargetCurve(cfg) {
    cfg = cfg || {};
    const len = cfg.len || 106;
    const cycle = cfg.cycle || 10;
    const sawFrom = cfg.sawFrom == null ? 17 : cfg.sawFrom;
    const breatherBump = cfg.breatherBump == null ? 0.05 : cfg.breatherBump;
    const hardBeatDip = cfg.hardBeatDip == null ? -0.16 : cfg.hardBeatDip;
    const floor = cfg.floor == null ? 0.50 : cfg.floor;
    const ceil = cfg.ceil == null ? 0.95 : cfg.ceil;
    const segs = (cfg.segments || [
      { until: 8, from: 0.94, to: 0.88 },
      { until: 24, from: 0.86, to: 0.78 },
      { untilFrac: 1, from: 0.78, to: 0.70 },
    ]).map(s => ({ until: s.until != null ? s.until : Math.round((s.untilFrac || 1) * len), from: s.from, to: s.to }));

    return function targetWR(n) {
      let base = segs[segs.length - 1].to, prevUntil = 1;
      for (const s of segs) {
        if (n <= s.until) { base = ramp(s.from, s.to, (n - prevUntil) / Math.max(1, s.until - prevUntil)); break; }
        prevUntil = s.until;
      }
      let mod = 0;
      if (n >= sawFrom) {
        const pos = (n - 1) % cycle;
        if (pos >= cycle - 2) mod = hardBeatDip;
        else if (pos <= 1) mod = breatherBump;
      }
      return clamp(base + mod, floor, ceil);
    };
  }

  /* ---- slack schedule (budget over par) ----
     The primary "fewer taps = harder" lever, expressed as extra budget beyond the
     bot-optimal `par`. A sawtooth: loose breather → par-tight hard beat, tightening
     across the run.

     FLOOR (default 1) is load-bearing but a TRADEOFF — read carefully:
       floor >= 1  → budget is always >= par+1, so PERFECT (used===par) is never
                     auto-awarded. This is Rattle's choice: it keeps the slack
                     sawtooth SHARP (breather 3 … hard beat 1). BUT with the default
                     star threshold (three=1), a par+1 budget still auto-awards 3★ on
                     any clear — accepted as "reward for the tightest levels".
       floor >= 2  → 3★ also becomes a genuine chase everywhere, but the sawtooth
                     FLATTENS in the back half (breather and hard beat both floor to
                     2). Use this, or grade on leftover-bonus instead of par-stars,
                     when the 3★ grade must carry skill signal on every level.
     Rule of thumb: for a fully-gradable 3★ set floor >= starThreshold.three + 1.
     See starGrade + gradableBudget + docs/handbook/09-difficulty.md.

     cfg: teach [{until, slack}], cycle, breather, normal, ramping, hardBeat,
          backHalf [{after, minus}], floor. Defaults = Rattle (floor 1). */
  function makeSlackSchedule(cfg) {
    cfg = cfg || {};
    const cycle = cfg.cycle || 10;
    const floor = cfg.floor == null ? 1 : cfg.floor;
    const teach = cfg.teach || [{ until: 4, slack: 3 }, { until: 8, slack: 2 }];
    const breather = cfg.breather == null ? 3 : cfg.breather;   // cycle pos 0..1
    const normal = cfg.normal == null ? 2 : cfg.normal;         // pos 2..5
    const ramping = cfg.ramping == null ? 1 : cfg.ramping;      // pos 6..7
    const hardBeat = cfg.hardBeat == null ? 1 : cfg.hardBeat;   // pos 8..9
    const backHalf = cfg.backHalf || [{ after: 40, minus: 1 }, { after: 80, minus: 1 }];

    return function slackFor(n) {
      let s;
      const t = teach.find(x => n <= x.until);
      if (t) s = t.slack;
      else {
        const pos = (n - 1) % cycle;
        if (pos <= 1) s = breather;
        else if (pos <= 5) s = normal;
        else if (pos <= 7) s = ramping;
        else s = hardBeat;
      }
      for (const b of backHalf) if (n > b.after) s = Math.max(floor, s - b.minus);
      return Math.max(floor, s);
    };
  }

  /* ---- efficiency-star grade ----
     Grade a clear on taps USED vs the bot-optimal `par`. INTEGRITY RULE (learned
     the hard way, docs/handbook/09-difficulty.md): because a solver can never spend
     more than the budget (used ≤ taps), a level whose budget equals par (or par+1)
     auto-awards 3★ — the grade carries no skill signal. So the GENERATOR must keep
     taps ≥ par + (three+1); this function just grades. Returns {stars 1..3, perfect}.

     thr: { three, two } extra-taps-over-par ceilings [default 1, 3].
     PERFECT = matched par exactly with no rattle/undo (used === par). */
  function starGrade(res, thr) {
    thr = thr || {};
    const three = thr.three == null ? 1 : thr.three;
    const two = thr.two == null ? 3 : thr.two;
    const over = res.used - res.par;
    const stars = over <= three ? 3 : over <= two ? 2 : 1;
    const perfect = res.used === res.par && !res.rattled;
    return { stars, perfect };
  }
  // smallest budget that keeps all three star tiers gradable for a given par
  // (so 1★ is reachable, not just 3★/2★). Generators can assert taps against this.
  function gradableBudget(par, thr) {
    thr = thr || {};
    const two = thr.two == null ? 3 : thr.two;
    return par + two + 1;   // used == par+two+1 → 1★ is reachable
  }

  return { mulberry32, clamp, ramp, makeTargetCurve, makeSlackSchedule, starGrade, gradableBudget };
});
