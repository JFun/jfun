#!/usr/bin/env node
/* @jfun/difficulty — unit tests for the engine-agnostic curve math (no adapter
   needed). The harness/report are proven by each game's dogfood (see the Rattle
   dogfood); this covers the pure functions + the load-bearing invariants. */
const C = require(path0());
function path0() { return require("path").join(__dirname, "..", "..", "index.js"); }
let n = 0, fails = 0;
function ok(name, cond) { n++; if (!cond) { fails++; console.error("✗ " + name); } }
function eq(name, a, b) { ok(name + " (" + a + " == " + b + ")", a === b); }

/* mulberry32 determinism */
{
  const a = C.mulberry32(42), b = C.mulberry32(42);
  ok("mulberry32 deterministic", a() === b() && a() === b());
  ok("mulberry32 in [0,1)", (() => { const r = C.mulberry32(1); for (let i = 0; i < 200; i++) { const v = r(); if (v < 0 || v >= 1) return false; } return true; })());
}

/* ramp clamps + interpolates */
{
  eq("ramp t=0", C.ramp(2, 8, 0), 2);
  eq("ramp t=1", C.ramp(2, 8, 1), 8);
  eq("ramp t=0.5", C.ramp(2, 8, 0.5), 5);
  eq("ramp clamps below", C.ramp(2, 8, -1), 2);
  eq("ramp clamps above", C.ramp(2, 8, 2), 8);
}

/* target curve: bounded, teach easy, hard beats dip below breathers */
{
  const t = C.makeTargetCurve({ len: 106 });
  ok("targetWR within [0.5,0.95]", (() => { for (let i = 1; i <= 106; i++) { const v = t(i); if (v < 0.5 || v > 0.95) return false; } return true; })());
  ok("teach easier than late", t(2) > t(100));
  // within a mid cycle, the hard beat (pos 8-9) is below the breather (pos 0-1)
  ok("hard beat < breather (same cycle)", t(50) < t(41));   // L50 pos9 vs L41 pos0
  ok("deterministic", t(50) === t(50));
}

/* slack schedule: floor respected, sawtooth, tightens in back half */
{
  const s = C.makeSlackSchedule({});
  ok("slack floored at >=1 everywhere", (() => { for (let i = 1; i <= 106; i++) if (s(i) < 1) return false; return true; })());
  ok("breather looser than hard beat", s(41) > s(50));   // pos0 vs pos9
  ok("back half no looser than front (same cycle pos)", s(90) <= s(20));
}

/* STAR INTEGRITY — the load-bearing invariant */
{
  // par-tight budget: every clear is <= budget, and the grade must NOT be forced to 3★
  // by the schedule — i.e. the generator must give taps >= gradableBudget for a real grade.
  eq("3star at par+1", C.starGrade({ used: 7, par: 6 }).stars, 3);
  eq("2star at par+3", C.starGrade({ used: 9, par: 6 }).stars, 2);
  eq("1star beyond par+3", C.starGrade({ used: 10, par: 6 }).stars, 1);
  ok("PERFECT requires used===par", C.starGrade({ used: 6, par: 6, rattled: false }).perfect === true);
  ok("PERFECT denied on rattle", C.starGrade({ used: 6, par: 6, rattled: true }).perfect === false);
  ok("PERFECT denied above par", C.starGrade({ used: 7, par: 6, rattled: false }).perfect === false);
  // gradableBudget: at this budget a 1★ clear (used == budget) is possible
  const par = 6, gb = C.gradableBudget(par);
  eq("gradableBudget keeps 1star reachable", C.starGrade({ used: gb, par }).stars, 1);
  ok("one tighter loses 1star tier", C.starGrade({ used: gb - 1, par }).stars >= 2);
}

if (fails) { console.error("\n" + fails + "/" + n + " FAILED"); process.exit(1); }
console.log("✓ curve-tests: " + n + " assertions passed");
