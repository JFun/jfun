/* Human-solvability robustness — "a win EXISTS" is not "a human can HIT it".
   The per-game certifier proves winnability (it has the engine); these pure
   judges rule on whether the winning solution is findable and executable by a
   person. The scar: Cut certified two levels that no human could solve —
   L65 Gallows Drop (the taught cut had a dead solve; only an unintended cut
   won) and L59 Boomerang (won in 1 of 200 timing combos, a lottery). A
   brute-force sweep says "winnable"; these say "winnable BY A PLAYER".

   - winDensity: fraction of the sampled solution space that wins. A win found
     in a handful of a large sweep is a lottery.
   - solveWindow: along one continuous knob (cut timing, release angle, gap
     between cuts…), the widest CONTIGUOUS run of winning samples = the
     tolerance a player actually has. Scattered isolated wins → near-zero band
     even when the raw count looks fine.
   - methodWindows: same, split by the win METHOD the certifier tagged — so a
     game can check that the TAUGHT method has a real window, not just some
     unintended cut (the Gallows Drop failure).

   All pure; the game's certifier supplies win/fail samples. */
"use strict";

/** Fraction of attempts that win. attempts = booleans or objects with .win. */
function winDensity(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return 0;
  let w = 0;
  for (const a of attempts) if (a === true || (a && a.win)) w++;
  return w / attempts.length;
}

function finishRun(run) { return { lo: run.lo, hi: run.hi, width: run.hi - run.lo, n: run.n }; }

/** Widest contiguous winning band along one 1-D knob.
 * @param {Array<{x:number, win:boolean}>} samples  x = the knob value (a cut
 *   delay, release angle, inter-cut gap…); order doesn't matter (sorted here).
 * @param {{minWidth?:number, minRun?:number}} [opts]
 *   minWidth: smallest x-span that counts as human-hittable (knob units).
 *   minRun:   fewest consecutive winning samples to count as a band (default 2
 *             — a lone winning sample is a lottery point, not a tolerance band).
 * @returns {{winFraction:number, bands:Array<{lo,hi,width,n}>, widest:object|null, ok:boolean}}
 *   ok = there is a band wide enough (>=minWidth) and solid enough (>=minRun). */
function solveWindow(samples, opts) {
  const minWidth = (opts && opts.minWidth) || 0;
  const minRun = (opts && opts.minRun != null) ? opts.minRun : 2;
  const pts = (samples || []).filter(s => s && isFinite(s.x)).sort((a, b) => a.x - b.x);
  const bands = [];
  let run = null;
  for (const p of pts) {
    if (p.win) { if (!run) run = { lo: p.x, hi: p.x, n: 0 }; run.hi = p.x; run.n++; }
    else if (run) { bands.push(finishRun(run)); run = null; }
  }
  if (run) bands.push(finishRun(run));
  const wins = pts.filter(p => p.win).length;
  const winFraction = pts.length ? wins / pts.length : 0;
  const widest = bands.reduce((a, b) => (a && a.width >= b.width ? a : b), null);
  const ok = !!widest && widest.n >= minRun && widest.width >= minWidth;
  return { winFraction, bands, widest, ok };
}

/** solveWindow per win-method, so a game can check the TAUGHT method has a real
 * tolerance window (not just some unintended solve).
 *
 * Evidence semantics (the subtle part, learned the hard way): a sample TAGGED
 * with a method is evidence for THAT method's axis only — certifiers emit one
 * attempt per method at each knob value, and treating method B's attempt at
 * x as a loss for method A shreds every band into same-x fragments (each win
 * surrounded by "losses" from sibling attempts → all bands width 0). An
 * UNTAGGED losing sample means "nothing won here" and breaks every axis.
 * @param {Array<{x:number, win:boolean, method?:string}>} samples
 * @param {{minWidth?:number, minRun?:number}} [opts]
 * @returns {Object<string, ReturnType<solveWindow>>} keyed by winning method. */
function methodWindows(samples, opts) {
  const methods = new Set();
  for (const s of (samples || [])) if (s && s.win) methods.add(s.method || "?");
  const out = {};
  for (const m of methods) {
    const axis = [];
    for (const s of (samples || [])) {
      if (!s || !isFinite(s.x)) continue;
      const tag = s.method || (s.win ? "?" : null);
      if (tag === null) axis.push({ x: s.x, win: false });      // untagged loss: applies to every method
      else if (tag === m) axis.push({ x: s.x, win: !!s.win });  // this method's own attempt
      // other methods' attempts: no evidence about m — skipped
    }
    out[m] = solveWindow(axis, opts);
  }
  return out;
}

module.exports = { winDensity, solveWindow, methodWindows };
