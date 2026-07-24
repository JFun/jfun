#!/usr/bin/env node
/* @jfun/difficulty — tests for the generation framework (cadence / pool /
   harness extensions / campaign orchestrator) over a synthetic toy game, PIPS:
   deal N piles of pips from a seed, each tap clears one pile (or passes), win =
   clear `need` pips within the tap budget. Everything is exact and fast, so
   every loop branch (relax, beat-harden, per-class bands, fallback, gate retry,
   cadence violation, pool ordering, load-bearing, preflight sabotage) is
   provable in <2s. The searchSeed↔legacy equivalence pin and the Rattle
   maker↔verbatim curve equality live here too — they are what the Rattle
   dogfood's bit-fidelity stands on. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const C = require(path.join(__dirname, "..", "..", "index.js"));

let nT = 0, fails = 0;
function ok(name, cond) { nT++; if (!cond) { fails++; console.error("✗ " + name); } }
function eq(name, a, b) { ok(name + " (" + JSON.stringify(a) + " == " + JSON.stringify(b) + ")", JSON.stringify(a) === JSON.stringify(b)); }

/* ================= the PIPS toy game ================= */
function mkPiles(spec) {
  if (spec.fixedPiles) return spec.fixedPiles.slice();
  const rng = C.mulberry32(spec.seed >>> 0), out = [];
  for (let i = 0; i < spec.nPiles; i++) out.push(1 + Math.floor(rng() * 4));
  return out;
}
const biggest = w => {
  let bi = -1;
  for (let i = 0; i < w.piles.length; i++) if (w.piles[i] > 0 && (bi < 0 || w.piles[i] > w.piles[bi])) bi = i;
  return bi < 0 ? "pass" : bi;
};
const toy = {
  createWorld: spec => ({ piles: mkPiles(spec), need: spec.need, taps: spec.taps, cleared: 0, t: 0 }),
  setBudget: (spec, n) => Object.assign({}, spec, { taps: n }),
  listMoves: w => { const m = []; for (let i = 0; i < w.piles.length; i++) if (w.piles[i] > 0) m.push(i); m.push("pass"); return m; },
  isPass: mv => mv === "pass",
  applyMove: (w, mv) => { w.taps--; if (mv !== "pass") { w.t += w.piles[mv] * w.piles[mv]; w.cleared += w.piles[mv]; w.piles[mv] = 0; } else w.t += 1; },
  isWin: w => w.cleared >= w.need,
  isLose: w => w.taps <= 0 && w.cleared < w.need,
  remaining: w => Math.max(0, w.need - w.cleared),
  budgetLeft: w => w.taps,
  time: w => w.t,                                   // for timeOptimum (cost = pile², pass = 1)
  snapshot: w => ({ piles: w.piles.slice(), taps: w.taps, cleared: w.cleared, t: w.t }),
  restore: (w, s) => { w.piles = s.piles.slice(); w.taps = s.taps; w.cleared = s.cleared; w.t = s.t; },
  stateKey: w => w.piles.join(",") + ":" + w.cleared + ":" + w.taps,
  fingerprint: w => w.piles.join(",") + "|" + w.cleared + "|" + w.taps + "|" + w.t,
  policies: {
    greedy: w => biggest(w),
    attentive: (w, moves, rng) => rng() < 0.10 ? moves[(rng() * moves.length) | 0] : biggest(w),
  },
};
// exact par: fewest piles whose sizes sum to >= need (biggest-first is optimal here)
function exactPar(spec) {
  const p = mkPiles(spec).sort((a, b) => b - a);
  let sum = 0, k = 0;
  for (const s of p) { if (sum >= spec.need) break; sum += s; k++; }
  return sum >= spec.need ? k : null;
}

/* ================= 1. beamOptimum agrees with the exact par ================= */
{
  let all = true;
  for (let seed = 101; seed < 121; seed++) {
    const spec = { seed, nPiles: 6, need: 8, taps: 12 };
    const par = C.beamOptimum(toy, spec, { width: 8, maxDepth: 12 });
    if (par !== exactPar(spec)) { all = false; break; }
  }
  ok("beamOptimum == exact pile-cover par over 20 seeds", all);
}

/* ================= 2. searchSeed ≡ the pre-refactor implementation =================
   The old searchSeed, verbatim (from git — the shape Rattle's dogfood proved),
   re-built here over the exported primitives. The wrapper refactor must return
   IDENTICAL results for every level/opts combination or Rattle bit-fidelity
   is silently gone. */
function searchSeedLegacy(adapter, buildSpec, n, opts) {
  opts = opts || {};
  const seedLo = opts.seedLo || 101, seedHi = opts.seedHi || 800;
  const width = opts.beamWidth || 8, maxDepth = opts.maxDepth || 24;
  const parLo = opts.parLo == null ? 2 : opts.parLo, parHi = opts.parHi == null ? 10 : opts.parHi;
  const nRoll = opts.nRoll || 60, scanCap = opts.scanCap || 30;
  const bandHi = opts.bandHi == null ? 0.14 : opts.bandHi, bandLo = opts.bandLo == null ? 0.22 : opts.bandLo;
  const policy = opts.policy || "attentive";
  const tgt = opts.targetWR(n), slack = opts.slackFor(n);
  let best = null, scanned = 0;
  for (let seed = seedLo; seed <= seedHi; seed++) {
    let cand;
    try {
      const spec = buildSpec(seed);
      const par = C.beamOptimum(adapter, spec, { width, maxDepth });
      if (par == null || par < parLo || par > parHi) continue;
      if (opts.guard && !opts.guard(spec)) continue;
      const taps = C.tuneBudget(adapter, spec, par, slack, opts);
      if (taps == null) continue;
      const { wr } = C.measureWR(adapter, adapter.setBudget(spec, taps), policy, nRoll);
      cand = { seed, par, taps, wr, inBand: wr <= tgt + bandHi && wr >= tgt - bandLo };
    } catch (e) { continue; }
    if (cand.inBand) return cand;
    if (!best || Math.abs(cand.wr - tgt) < Math.abs(best.wr - tgt)) best = cand;
    if (++scanned >= scanCap) break;
  }
  return best;
}
{
  const grids = [
    { targetWR: () => 0.95, slackFor: () => 2 },
    { targetWR: () => 0.55, slackFor: () => 1, bandLo: 0.05, bandHi: 0.03, scanCap: 12 },  // narrow band → fallback path
    { targetWR: () => 0.80, slackFor: () => 1, parLo: 3, parHi: 4, scanCap: 8 },           // par-range rejects
    { targetWR: () => 0.80, slackFor: () => 2, guard: s => s.seed % 2 === 0 },              // guard rejects odd seeds
  ];
  let same = true;
  for (let n = 1; n <= 6 && same; n++) {
    for (const g of grids) {
      const build = seed => ({ seed, nPiles: 6, need: 6 + n, taps: 12 });
      const a = searchSeedLegacy(toy, build, n, g);
      const b = C.searchSeed(toy, build, n, g);
      if (JSON.stringify(a) !== JSON.stringify(b)) { same = false; console.error("  divergence at n=" + n + " grid=" + JSON.stringify(g) + "\n  legacy=" + JSON.stringify(a) + "\n  new=   " + JSON.stringify(b)); break; }
    }
  }
  ok("searchSeed ≡ legacy implementation across 24 level×opts grids", same);
}

/* ================= 3. band semantics: inclusive boundaries, asymmetry ================= */
{
  const mkEval = score => () => ({ score, par: 3, taps: 4 });
  const build = seed => ({ seed });
  // dyadic values so tgt±band is float-exact (0.60+0.07 is NOT 0.67 in IEEE —
  // boundary inclusivity is only meaningful where the arithmetic is exact, and
  // this matches the legacy searchSeed exactly, float warts and all)
  const opts = { seedLo: 1, seedHi: 1, targetWR: () => 0.5, bandHi: 0.0625, bandLo: 0.25, scanCap: 5 };
  eq("score exactly at tgt+bandHi accepts (inclusive)", C.searchCandidate(mkEval(0.5625), build, 1, opts).inBand, true);
  eq("one epsilon beyond tgt+bandHi rejects", C.searchCandidate(mkEval(0.5625001), build, 1, opts).inBand, false);
  eq("score exactly at tgt-bandLo accepts (inclusive)", C.searchCandidate(mkEval(0.25), build, 1, opts).inBand, true);
  eq("one epsilon below tgt-bandLo rejects", C.searchCandidate(mkEval(0.2499999), build, 1, opts).inBand, false);
  // the asymmetry FLIPS by class: a normal band tolerates +0.125 where a beat tolerates +0.0625
  const normal = { seedLo: 1, seedHi: 1, targetWR: () => 0.5, bandHi: 0.125, bandLo: 0.125, scanCap: 5 };
  eq("tgt+0.1 accepts under the NORMAL band", C.searchCandidate(mkEval(0.6), build, 1, normal).inBand, true);
  eq("tgt+0.1 rejects under the BEAT band", C.searchCandidate(mkEval(0.6), build, 1, opts).inBand, false);
  // skipSeeds skips
  const multi = { seedLo: 1, seedHi: 3, targetWR: () => 0.60, bandHi: 0.5, bandLo: 0.5, scanCap: 5, skipSeeds: new Set([1, 2]) };
  eq("skipSeeds excludes gate-dead seeds", C.searchCandidate(mkEval(0.60), build, 1, multi).seed, 3);
}

/* ================= 4. Rattle maker ↔ verbatim closures, n = 1..106 =================
   The shipped gen-campaign.cjs closures, verbatim. The declarative makers must
   reproduce them EXACTLY (strict ===) or Phase-2 migration would bend the curve. */
{
  const lerp = (a, b, t) => a + (b - a) * t;
  function hardTier(n) {
    if (n <= 20) return null;
    if (n === 106) return { key: "extreme", tgt: 0.45 };
    const cyc = (n - 1) % 10;
    if (cyc === 3) return { key: "hard", tgt: 0.65 };
    if (cyc === 8) return ((n - 9) % 30 === 0) ? { key: "extreme", tgt: 0.45 } : { key: "super", tgt: 0.55 };
    return null;
  }
  function targetWR(n) {
    const ht = hardTier(n);
    if (ht) return ht.tgt;
    let base;
    if (n <= 8) base = lerp(0.94, 0.88, (n - 1) / 7);
    else if (n <= 16) base = lerp(0.86, 0.58, (n - 9) / 7);
    else {
      base = lerp(0.84, 0.76, (n - 17) / (106 - 17));
      const cyc = (n - 1) % 10;
      if (cyc === 9) base += 0.07;
      else if (cyc === 0) base += 0.05;
    }
    return Math.max(0.42, Math.min(0.95, base));
  }
  function slackFor(n) {
    let s;
    if (n <= 4) s = 3;
    else if (n <= 8) s = 2;
    else if (n <= 16) s = Math.round(lerp(3, 1, (n - 9) / 7));
    else {
      const cyc = (n - 1) % 10;
      if (hardTier(n)) s = 1;
      else if (cyc === 9 || cyc === 0) s = 3;
      else s = 2;
    }
    if (n > 40) s = Math.max(1, s - 1);
    if (n > 80) s = Math.max(1, s - 1);
    return s;
  }
  const beatFor = C.makeBeatSchedule({
    from: 21, cycle: 10,
    slots: [{ pos: 3, cls: "hard", tgt: 0.65 },
            { pos: 8, cls: "super", tgt: 0.55, everyNth: 3, nthCls: "extreme", nthTgt: 0.45 }],
    finale: { at: 106, cls: "extreme", tgt: 0.45 },
  });
  const tMaker = C.makeTargetCurve({
    segments: [{ until: 8, from: 0.94, to: 0.88 },
               { fromLevel: 9, until: 16, from: 0.86, to: 0.58 },
               { fromLevel: 17, until: 106, from: 0.84, to: 0.76 }],
    breathers: [{ pos: 9, bump: 0.07 }, { pos: 0, bump: 0.05 }],
    sawFrom: 17, floor: 0.42, ceil: 0.95, beatFor,
  });
  const sMaker = C.makeSlackSchedule({
    teach: [{ until: 4, slack: 3 }, { until: 8, slack: 2 }, { fromLevel: 9, until: 16, from: 3, to: 1 }],
    beatFor, beatSlack: 1, breather: 3, normal: 2, breatherPos: [9, 0],
    backHalf: [{ after: 40, minus: 1 }, { after: 80, minus: 1 }], floor: 1,
  });
  let beatsOK = true, tgtOK = true, slackOK = true;
  for (let n = 1; n <= 106; n++) {
    const hb = hardTier(n), mb = beatFor(n);
    if ((hb == null) !== (mb == null)) beatsOK = false;
    else if (hb && (hb.key !== mb.cls || hb.tgt !== mb.tgt)) beatsOK = false;
    if (targetWR(n) !== tMaker(n)) { if (tgtOK) console.error("  targetWR diverges at n=" + n + ": " + targetWR(n) + " vs " + tMaker(n)); tgtOK = false; }
    if (slackFor(n) !== sMaker(n)) { if (slackOK) console.error("  slackFor diverges at n=" + n + ": " + slackFor(n) + " vs " + sMaker(n)); slackOK = false; }
  }
  ok("makeBeatSchedule ≡ Rattle hardTier for n=1..106", beatsOK);
  ok("makeTargetCurve maker ≡ Rattle targetWR for n=1..106 (strict ===)", tgtOK);
  ok("makeSlackSchedule maker ≡ Rattle slackFor for n=1..106 (strict ===)", slackOK);
  // legacy cfg untouched by the new keys (defaults byte-identical)
  const legacy = C.makeTargetCurve({ len: 106 });
  ok("legacy makeTargetCurve still dips at cycle end", legacy(50) < legacy(45));
}

/* ================= 5. checkCadence ================= */
{
  const rows = [
    { n: 20, wr: 0.80 }, { n: 21, wr: 0.60 }, { n: 22, wr: 0.62 },          // adjacent hard
    { n: 23, wr: 0.80 }, { n: 24, wr: 0.55, cls: "super" }, { n: 25, wr: 0.70 },  // 0.70 > adjMax but < breather bar
  ];
  const r = C.checkCadence(rows, { from: 17, adjacentHardMax: 0.66, breatherAfter: { classes: ["super", "extreme"], minWR: 0.72 } });
  eq("cadence: both violation types fire", r.violations.map(v => v.type), ["adjacent-hard", "no-breather"]);
  const clean = C.checkCadence([{ n: 20, wr: 0.80 }, { n: 21, wr: 0.60 }, { n: 22, wr: 0.78 }], {});
  ok("cadence: clean rows pass", clean.ok);
  ok("cadence: gap in n skips the pair (splice honesty)", C.checkCadence([{ n: 5, wr: 0.5 }, { n: 9, wr: 0.5 }], { from: 1 }).ok);
  ok("cadence: legacy {key} beats accepted", !C.checkCadence([{ n: 4, wr: 0.5, key: "super" }, { n: 5, wr: 0.5 }], { from: 99 }).ok);
}

/* ================= 6. checkDistribution ================= */
{
  const rows = [
    { n: 1, wr: 0.90, cls: "normal", inBand: true, relax: 0 },
    { n: 2, wr: 0.40, cls: "normal", inBand: false, relax: 1 },   // outlier + fallback
    { n: 3, wr: 0.70, cls: "hard", inBand: true, relax: 0 },   // inside the band, but the class mean is off
  ];
  const d = C.checkDistribution(rows, { targetWR: () => 0.85, bandLo: 0.22, bandHi: 0.14 });
  eq("distribution: outlier detected", d.outliers.map(o => o.n), [2]);
  eq("distribution: fallback listed", d.fallbacks, [2]);
  eq("distribution: relax histogram", d.relaxHist, { 0: 2, 1: 1 });
  ok("distribution: per-class means present", d.classes.normal.count === 2 && d.classes.hard.count === 1);
  ok("distribution: off-target class mean flagged", d.classes.hard.ok === false);
  // boundary pins (dyadic): the outlier test is STRICT >, mirroring the
  // INCLUSIVE accept band — an accepted at-boundary level is never an outlier
  // (else a band-edge accept would flip exit 0→2); classMeanTol is inclusive.
  const at = wr => C.checkDistribution([{ n: 1, wr, cls: "n" }], { targetWR: () => 0.5, bandLo: 0.25, bandHi: 0.25 }).outliers.length;
  ok("delta exactly +bandHi is NOT an outlier", at(0.75) === 0);
  ok("one epsilon beyond +bandHi IS an outlier", at(0.7500001) === 1);
  ok("delta exactly -bandLo is NOT an outlier", at(0.25) === 0);
  ok("one epsilon below -bandLo IS an outlier", at(0.2499999) === 1);
  const cm = C.checkDistribution([{ n: 1, wr: 0.5625, cls: "x" }], { targetWR: () => 0.5, bandLo: 1, bandHi: 1, classMeanTol: 0.0625 });
  ok("class mean |delta| exactly tol is ok (inclusive)", cm.classes.x.ok === true);
}

/* ================= 7. pool ordering ================= */
{
  const scores = [5, 3, 8, 1, 6, 2, 9, 4, 7, 10];
  const perm = C.sawtoothOrder(scores, { cycle: 3 });   // 3 teeth over 10 boards → ≥4 flips
  ok("sawtoothOrder returns a valid permutation", C.validPermutation(perm, scores.length));
  eq("sawtoothOrder finale is the global max", scores[perm[perm.length - 1]], 10);
  const v = C.checkOrder(perm.map(i => scores[i]), { minFlips: 3, finaleMax: true });
  ok("proposed order passes checkOrder (flips=" + v.flips + ")", v.ok);
  ok("flat order flagged too-flat", !C.checkOrder([1, 2, 3, 4, 5], { minFlips: 2 }).ok);
  ok("finale-not-max flagged", C.checkOrder([1, 5, 2, 4], { finaleMax: true }).violations.some(x => x.type === "finale-not-max"));
  ok("duplicate index is not a permutation", !C.validPermutation([0, 1, 1, 3], 4));
  // orderCampaign: validates a hand-pinned permutation; proposes when absent
  const plug = { scoreOf: b => b.s };
  const pool = scores.map(s => ({ s }));
  const pinned = C.orderCampaign(plug, pool, { order: { permutation: perm, minFlips: 3, finaleMax: true } });
  ok("orderCampaign validates the pinned permutation (exit 0)", pinned.exitCode === 0 && pinned.proposed === false);
  const proposed = C.orderCampaign(plug, pool, { order: { cycle: 3, minFlips: 3 } });
  ok("orderCampaign proposes when unpinned (exit 0, proposed:true)", proposed.exitCode === 0 && proposed.proposed === true);
  const bad = C.orderCampaign(plug, pool, { order: { permutation: [0, 1, 2], minFlips: 1 } });
  ok("orderCampaign fails hard on an invalid permutation (exit 1)", bad.exitCode === 1);
}

/* ================= 8. sampleAccept + loadBearing ================= */
{
  let proposed = 0;
  const r = C.sampleAccept(
    (rng, a) => { proposed++; return { v: Math.floor(rng() * 100), a }; },
    cand => cand.v > 90,
    { seed: 7, attempts: 200 });
  ok("sampleAccept finds an accepted candidate", !!r && r.cand.v > 90 && r.attempt === proposed - 1);
  const r2 = C.sampleAccept((rng) => ({ v: 0 }), c => false, { seed: 7, attempts: 10 });
  ok("sampleAccept null when nothing accepts", r2 === null);
  const r3a = C.sampleAccept((rng) => ({ v: rng() }), () => true, { seed: 9, attempts: 5 });
  const r3b = C.sampleAccept((rng) => ({ v: rng() }), () => true, { seed: 9, attempts: 5 });
  eq("sampleAccept deterministic per seed", r3a.cand.v, r3b.cand.v);

  // verdict semantics: an object CARRYING `ok` must say ok===true; bare truthy
  // metadata accepts; { ok: undefined } is an upstream bug, not an accept
  const one = v => C.sampleAccept(() => ({ x: 1 }), () => v, { seed: 1, attempts: 1 });
  ok("sampleAccept: true accepts", !!one(true));
  ok("sampleAccept: {ok:true} accepts", !!one({ ok: true }));
  ok("sampleAccept: bare metadata object accepts", !!one({ gestures: 3 }));
  ok("sampleAccept: {ok:false} rejects", one({ ok: false }) === null);
  ok("sampleAccept: {ok:undefined} rejects", one({ ok: undefined }) === null);
  ok("sampleAccept: falsy rejects", one(0) === null && one(null) === null);

  const budgets = [];
  const certify = (spec, budget) => { budgets.push(budget); return { ok: spec.solvable }; };
  const lb1 = C.loadBearing(certify, { solvable: true, lock: true }, s => ({ solvable: true }), { budget: 100 });
  ok("loadBearing: solvable-without-element → not-load-bearing", !lb1.ok && lb1.why === "not-load-bearing");
  eq("loadBearing: must-fail half got budget×2", budgets, [100, 200]);
  const lb2 = C.loadBearing(certify, { solvable: false }, s => s, { budget: 100 });
  ok("loadBearing: no line within budget → why uncertified (never a deadness claim)", !lb2.ok && lb2.why === "uncertified");
  const lb3 = C.loadBearing((s, b) => ({ ok: !!s.lock }), { solvable: true, lock: true }, s => ({ lock: false }), { budget: 50 });
  ok("loadBearing: solvable + element load-bearing → ok", lb3.ok);
}

/* ================= 9. preflightAdapter: clean pass + three sabotages ================= */
{
  ok("preflight passes the honest toy adapter", C.preflightAdapter(toy, { seed: 101, nPiles: 6, need: 8, taps: 12 }).ok);
  const lossy = Object.assign({}, toy, {   // snapshot forgets `cleared`
    snapshot: w => ({ piles: w.piles.slice(), taps: w.taps, t: w.t }),
    restore: (w, s) => { w.piles = s.piles.slice(); w.taps = s.taps; w.t = s.t; },
  });
  ok("preflight catches a lossy snapshot", !C.preflightAdapter(lossy, { seed: 101, nPiles: 6, need: 8, taps: 12 }).ok);
  const aliased = Object.assign({}, toy, {   // snapshot aliases the piles array
    snapshot: w => ({ piles: w.piles, taps: w.taps, cleared: w.cleared, t: w.t }),
    restore: (w, s) => { w.piles = s.piles; w.taps = s.taps; w.cleared = s.cleared; w.t = s.t; },
  });
  ok("preflight catches an aliasing snapshot", !C.preflightAdapter(aliased, { seed: 101, nPiles: 6, need: 8, taps: 12 }).ok);
  const hiddenRng = Object.assign({}, toy, {
    applyMove: (w, mv) => { Math.random(); toy.applyMove(w, mv); },
  });
  ok("preflight catches hidden Math.random in the sim path", !C.preflightAdapter(hiddenRng, { seed: 101, nPiles: 6, need: 8, taps: 12 }).ok);
  ok("Math.random restored after the tripwire", (() => { const r = Math.random(); return r >= 0 && r < 1; })());
  const noMoves = Object.assign({}, toy, { listMoves: () => [] });
  ok("preflight flags a no-moves-at-spawn world (vacuous checks)", !C.preflightAdapter(noMoves, { seed: 101, nPiles: 6, need: 8, taps: 12 }).ok);
  const noGreedy = Object.assign({}, toy, { policies: { attentive: toy.policies.attentive } });
  ok("preflight reports a missing greedy policy as a problem, not a throw", !C.preflightAdapter(noGreedy, { seed: 101, nPiles: 6, need: 8, taps: 12 }).ok);
}

/* ================= 10. timeOptimum: fastest line, not fewest-move line ================= */
{
  // one 6-pile (1 move, 36s) vs two 3-piles (2 moves, 18s): the fewest-move
  // line is the SLOW one — the lazy-bot lie, inverted into an assertion.
  const spec = { fixedPiles: [6, 3, 3], need: 6, taps: 8 };
  const r = C.timeOptimum(toy, spec, { maxStates: 500 });
  eq("timeOptimum picks the faster 2-move line", { par: r.par, time: r.time }, { par: 2, time: 18 });
  const r2 = C.timeOptimum(toy, { fixedPiles: [6, 3, 3], need: 0, taps: 8 }, {});
  eq("timeOptimum at an already-won spawn", r2, { par: 0, time: 0, active: 0 });
  const pri = C.timeOptimum(toy, spec, { maxStates: 500, priority: w => 0 });   // custom priority still finds it
  eq("timeOptimum honors opts.priority", pri.time, 18);
  ok("timeOptimum returns null on maxStates exhaustion (unwinnable)", C.timeOptimum(toy, { fixedPiles: [1], need: 5, taps: 3 }, { maxStates: 20 }) === null);

  // STALE-MOVES REGRESSION (the review-caught critical): the move list must
  // come from the node being expanded, not from whatever the previous
  // expansion left in `w`. PIPS can't discriminate (its move sets are
  // commutative supersets), so: a 4-state graph machine where the winning move
  // exists ONLY at node A. With the bug, A is expanded with B's move list (the
  // root's last child), the win is never listed, and the search returns null;
  // fixed, it finds S→a→w at t=11. (Tilt's constant move list masked this —
  // its 30/30 equivalence run couldn't catch it.)
  {
    const G = {
      createWorld: () => ({ at: "S", t: 0, budget: 9 }),
      setBudget: s => s,
      listMoves: w => w.at === "S" ? ["a", "b"] : w.at === "A" ? ["w"] : w.at === "B" ? ["c"] : [],
      applyMove: (w, mv) => {
        w.budget--;
        if (w.at === "S" && mv === "a") { w.at = "A"; w.t += 10; }
        else if (w.at === "S" && mv === "b") { w.at = "B"; w.t += 1; }
        else if (w.at === "A" && mv === "w") { w.at = "WIN"; w.t += 1; }
        else if (w.at === "B" && mv === "c") { w.at = "C"; w.t += 1; }
        // a move applied in the wrong state (only possible via the bug) no-ops
      },
      isWin: w => w.at === "WIN",
      isLose: () => false,
      remaining: w => ({ S: 2, A: 0, B: 1, C: 3, WIN: 0 })[w.at],
      budgetLeft: w => w.budget,
      time: w => w.t,
      snapshot: w => ({ at: w.at, t: w.t, budget: w.budget }),
      restore: (w, s) => { w.at = s.at; w.t = s.t; w.budget = s.budget; },
      stateKey: w => w.at,
      policies: { greedy: (w, m) => m[0], attentive: (w, m) => m[0] },
    };
    eq("timeOptimum searches each node's OWN move set (stale-world regression)",
      C.timeOptimum(G, {}, { maxStates: 100 }), { par: 2, time: 11, active: 0 });
  }
}

/* ================= 11. generateCampaign: the orchestrator branches =================
   Stub-evaluate plugins make every branch exact: evaluate returns scripted
   scores keyed by (n, seed, relax), so accepts/fallbacks/relax/gates are all
   deterministic assertions, not tuning exercises. */
function stubPlugin(script) {   // script(n, seed, relax, beat) -> {score,...}|null
  return {
    adapter: toy,
    buildSpec: (n, o) => ({ seed: o.seed, n, relax: o.relax, beat: o.beat, nPiles: 6, need: 8, taps: 12 }),
    evaluate: (spec, n) => script(n, spec.seed, spec.relax, spec.beat),
    finalize: (n, found, spec, ctx) => ({ n, seed: found.seed, par: found.par, taps: found.taps, hard: ctx.beat ? (ctx.beat.cls || ctx.beat.key) : undefined }),
  };
}
const basePlan = {
  len: 4,
  targetWR: () => 0.80,
  slackFor: () => 1,
  search: { seedLo: 1, seedHi: 6, scanCap: 6, bandLo: 0.10, bandHi: 0.10 },
  cadence: { from: 99, breatherAfter: { classes: [], minWR: 0 } },
  distribution: { bandLo: 1, bandHi: 1 },
};
{
  // happy path: every seed 1 scores on target → 4 accepts, exit 0; deterministic double-run
  const p = stubPlugin(() => ({ score: 0.80, par: 3, taps: 4 }));
  const a = C.generateCampaign(p, basePlan, {});
  const b = C.generateCampaign(p, basePlan, {});
  ok("happy path: 4/4 accepted, exit 0", a.exitCode === 0 && a.levels.filter(Boolean).length === 4 && !a.fails.length);
  eq("double-run determinism (rows deep-equal)", a.rows, b.rows);

  // whole-run Math.random tripwire: the framework itself must never touch it
  const real = Math.random;
  Math.random = () => { throw new Error("Math.random in generation path"); };
  let threw = false;
  try { C.generateCampaign(p, basePlan, {}); } catch (e) { threw = true; } finally { Math.random = real; }
  ok("generateCampaign never calls Math.random", !threw);
}
{
  // RELAX: level 2 certifies nothing at relax 0-1, accepts at relax 2
  const p = stubPlugin((n, seed, relax) => n === 2 ? (relax >= 2 ? { score: 0.80, par: 3, taps: 4 } : null) : { score: 0.80, par: 3, taps: 4 });
  const r = C.generateCampaign(p, basePlan, {});
  ok("relax escalates only until a certify", r.exitCode === 0 && r.rows.find(x => x.n === 2).relax === 2 && r.rows.find(x => x.n === 1).relax === 0);
}
{
  // BEAT: class resolution picks the beat band + beat reaches buildSpec
  const seen = [];
  const p = stubPlugin((n, seed, relax, beat) => { if (n === 3) seen.push(beat && (beat.cls || beat.key)); return { score: n === 3 ? 0.55 : 0.80, par: 3, taps: 4 }; });
  const plan = Object.assign({}, basePlan, {
    targetWR: n => n === 3 ? 0.55 : 0.80,
    beatFor: n => n === 3 ? { cls: "hard", tgt: 0.55 } : null,
    classes: { hard: { bandLo: 0.22, bandHi: 0.07, scanCap: 2 } },
  });
  const r = C.generateCampaign(p, plan, {});
  ok("beat: cls resolved + hardened spec saw the beat", r.rows.find(x => x.n === 3).cls === "hard" && seen[0] === "hard" && r.levels[2].hard === "hard");
}
{
  // FALLBACK: level 4's seeds all land off-target → closest kept, flagged, exit 2
  const p = stubPlugin((n, seed) => ({ score: n === 4 ? 0.55 : 0.80, par: 3, taps: 4 }));
  const r = C.generateCampaign(p, basePlan, {});
  ok("fallback accept flagged, exit 2", r.exitCode === 2 && r.fallbacks.length === 1 && r.fallbacks[0].n === 4 && r.rows.find(x => x.n === 4).inBand === false);
}
{
  // NO-CANDIDATE: level 1 never certifies → fails, exit 1
  const p = stubPlugin((n) => n === 1 ? null : { score: 0.80, par: 3, taps: 4 });
  const r = C.generateCampaign(p, basePlan, {});
  ok("no candidate → fails + exit 1 + null level", r.exitCode === 1 && r.fails[0].n === 1 && r.levels[0] === null);
}
{
  // GATES: blocking failure on the first accepted seed only → retried with the
  // seed excluded; advisory recorded without changing the exit code
  const gateCalls = [];
  const p = stubPlugin(() => ({ score: 0.80, par: 3, taps: 4 }));
  p.gates = (level, ctx) => {
    gateCalls.push(level.seed);
    return {
      blocking: [{ name: "frame-fit", ok: !(level.n === 2 && level.seed === 1), detail: "toy" }],
      advisory: [{ name: "pool-distinct", ok: level.n !== 3, detail: "close to L1" }],
    };
  };
  const r = C.generateCampaign(p, basePlan, {});
  ok("blocking gate retries with the seed excluded", r.exitCode === 0 && r.rows.find(x => x.n === 2).seed === 2);
  ok("advisory recorded without failing", r.advisories.length === 1 && r.advisories[0].n === 3);
  eq("gates ran once per accepted candidate (+1 for the retried seed)", gateCalls.length, 5);
}
{
  // GATE EXHAUSTION: level 2's every seed is gate-dead → retries exhaust, the
  // gate diagnosis survives into fails[].why, exit 1, level slot null. (The
  // regression this pins: accepting the final retry's gate-failed candidate
  // would ship a frame-violating level at exit 0 — the write gate would write it.)
  let calls = 0;
  const p = stubPlugin(() => ({ score: 0.80, par: 3, taps: 4 }));
  p.gates = level => { calls++; return { blocking: [{ name: "frame-fit", ok: level.n !== 2, detail: "toy" }], advisory: [] }; };
  const r = C.generateCampaign(p, basePlan, {});
  ok("gate exhaustion → fails + exit 1 + null level slot", r.exitCode === 1 && r.levels[1] === null && r.fails.length === 1 && r.fails[0].n === 2);
  ok("the gate diagnosis survives exhaustion", /frame-fit/.test(r.fails[0].why));
  eq("level 2 burned all gateRetries+1 attempts", calls, 3 + 3);   // L1/L3/L4 once each + 3 attempts on L2
}
{
  // CADENCE integration: two adjacent levels measure 0.60 → violation, exit 2
  const p = stubPlugin((n) => ({ score: (n === 2 || n === 3) ? 0.60 : 0.80, par: 3, taps: 4 }));
  const plan = Object.assign({}, basePlan, {
    targetWR: n => (n === 2 || n === 3) ? 0.60 : 0.80,
    cadence: { from: 1, adjacentHardMax: 0.66, breatherAfter: { classes: [], minWR: 0 } },
  });
  const r = C.generateCampaign(p, plan, {});
  ok("measured adjacent-hard flagged, exit 2", r.exitCode === 2 && r.cadence.violations.some(v => v.type === "adjacent-hard" && v.nA === 2));
}
{
  // SPLICE-SEAM: regenerating 3..4 re-measures shipped L2 (via evaluate) so the
  // seam pair is judged; shipped L2 at 0.60 + fresh L3 at 0.60 → violation.
  const p = stubPlugin((n) => ({ score: n === 3 ? 0.60 : 0.80, par: 3, taps: 4 }));
  const plan = Object.assign({}, basePlan, {
    targetWR: n => n === 3 ? 0.60 : 0.80,
    cadence: { from: 1, adjacentHardMax: 0.66, breatherAfter: { classes: [], minWR: 0 } },
  });
  const existing = [{ seed: 9, n: 1 }, { seed: 9, n: 2, relax: 0 }, null, null];
  // shipped L2 spec evaluates via the plugin: score it 0.60 by keying off n
  p.evaluate = (spec, n) => ({ score: (n === 2 || n === 3) ? 0.60 : 0.80, par: 3, taps: 4 });
  const r = C.generateCampaign(p, plan, { lo: 3, hi: 4, existing });
  ok("splice-seam re-measure catches a cross-seam adjacent-hard", r.cadence.violations.some(v => v.type === "adjacent-hard" && v.nA === 2 && v.nB === 3));
}
{
  // PREFLIGHT wired in: a lossy adapter fails the whole run before generating
  const p = stubPlugin(() => ({ score: 0.80, par: 3, taps: 4 }));
  p.adapter = Object.assign({}, toy, { snapshot: w => ({ piles: w.piles.slice(), taps: w.taps, t: w.t }), restore: (w, s) => { w.piles = s.piles.slice(); w.taps = s.taps; w.t = s.t; } });
  const r = C.generateCampaign(p, basePlan, {});
  ok("preflight failure aborts the run (exit 1)", r.exitCode === 1 && /preflight/.test(r.fails[0].why));
}

/* ================= 12. generateCampaign over the REAL toy searchSeed path ================= */
{
  const plugin = {
    adapter: toy,
    buildSpec: (n, o) => ({ seed: o.seed, nPiles: 6, need: 6 + n + (o.beat ? 2 : 0) - o.relax * 2, taps: 12 }),
    finalize: (n, found, spec, ctx) => ({ n, seed: found.seed, par: found.par, taps: found.taps }),
  };
  const plan = {
    len: 5,
    targetWR: () => 0.90,
    slackFor: () => 2,
    search: { seedLo: 101, seedHi: 160, scanCap: 20, bandLo: 0.9, bandHi: 0.9, nRoll: 30, maxDepth: 12, parLo: 2, parHi: 8 },
    cadence: { from: 99, breatherAfter: { classes: [], minWR: 0 } },
    distribution: { bandLo: 1, bandHi: 1 },
  };
  const r = C.generateCampaign(plugin, plan, {});
  ok("real-search toy campaign: 5/5 generated, exit 0", r.exitCode === 0 && r.levels.filter(Boolean).length === 5);
  ok("real-search rows carry par+budget+wr", r.rows.every(x => x.par >= 2 && x.budget >= x.par && x.wr > 0));
  const r2 = C.generateCampaign(plugin, plan, {});
  eq("real-search determinism", r.rows, r2.rows);
}

/* ================= 13. writeLevels: whole-file + splice + regex guard ================= */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jfun-campaign-"));
  const file = path.join(dir, "levels.js");
  const fmt = l => "    { n: " + l.n + ", seed: " + l.seed + " },";
  const wrap = body => "/* toy */\nconst LEVELS = [\n" + body + "\n  ];\nmodule.exports = { LEVELS };\n";
  const L = [{ n: 1, seed: 5 }, { n: 2, seed: 6 }, { n: 3, seed: 7 }];
  C.writeLevels(file, L, { fmt, wrap });
  ok("writeLevels whole-file round-trips", require(file).LEVELS === undefined || true);   // file exists + parses
  const src1 = fs.readFileSync(file, "utf8");
  ok("whole-file contains all levels", /n: 1/.test(src1) && /n: 3/.test(src1));
  C.writeLevels(file, [{ n: 2, seed: 99 }], { fmt, spliceRange: [2, 2], existing: L });
  const src2 = fs.readFileSync(file, "utf8");
  ok("splice replaced only the range", /seed: 99/.test(src2) && /seed: 5/.test(src2) && /seed: 7/.test(src2) && !/seed: 6/.test(src2));
  let threw = false;
  try { C.writeLevels(file, L, { fmt, spliceRange: [1, 3], existing: L, spliceRegex: /NO MATCH HERE/ }); } catch (e) { threw = true; }
  ok("splice with a non-matching regex fails loud", threw);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= 14. runCampaignCLI: the standard driver ================= */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jfun-cli-"));
  const file = path.join(dir, "levels.js");
  const EXISTING = [{ n: 1, seed: 9 }, { n: 2, seed: 9 }, { n: 3, seed: 9 }, { n: 4, seed: 9 }];
  const cliFmt = l => "    { n: " + l.n + ", seed: " + l.seed + " },";
  const mkPlugin = () => {
    const p = stubPlugin(() => ({ score: 0.80, par: 3, taps: 4 }));
    p.file = file;
    p.fmt = cliFmt;
    p.wrap = body => "const LEVELS = [\n" + body + "\n  ];\n";
    p.loadExisting = () => fs.existsSync(file) ? EXISTING : (() => { throw new Error("no file"); })();
    return p;
  };
  const quiet = fn => { const ce = console.error; console.error = () => {}; try { return fn(); } finally { console.error = ce; } };

  eq("CLI full run (no args) exits 0 and writes", quiet(() => C.runCampaignCLI(mkPlugin(), basePlan, [])), 0);
  ok("CLI wrote the whole file", /n: 4, seed: 1/.test(fs.readFileSync(file, "utf8")));
  fs.writeFileSync(file, "const LEVELS = [\n    SENTINEL\n  ];\n");
  eq("CLI range debug exits 0", quiet(() => C.runCampaignCLI(mkPlugin(), basePlan, ["2", "3"])), 0);
  ok("CLI debug range did NOT write", /SENTINEL/.test(fs.readFileSync(file, "utf8")));
  fs.writeFileSync(file, "const LEVELS = [\n" + EXISTING.map(cliFmt).join("\n") + "\n  ];\n");
  eq("CLI splice exits 0", quiet(() => C.runCampaignCLI(mkPlugin(), basePlan, ["2", "3", "splice"])), 0);
  const spliced = fs.readFileSync(file, "utf8");
  ok("CLI splice replaced only the range", /n: 2, seed: 1/.test(spliced) && /n: 1, seed: 9/.test(spliced) && /n: 4, seed: 9/.test(spliced));
  const noLoad = mkPlugin(); noLoad.loadExisting = null;
  eq("CLI splice without existing levels fails loud pre-generation", quiet(() => C.runCampaignCLI(noLoad, basePlan, ["2", "3", "splice"])), 1);
  // --seedFrom SHIFTS the whole window (seedLo alone past seedHi scans nothing —
  // the review-caught retune-queue bug) and must not be parsed into the range
  const seeds = [];
  const spyP = stubPlugin(() => null);
  spyP.evaluate = spec => { seeds.push(spec.seed); return { score: 0.80, par: 3, taps: 4 }; };
  quiet(() => C.runCampaignCLI(spyP, basePlan, ["1", "1", "--seedFrom=4"]));
  ok("--seedFrom shifts the scan start (width preserved past old seedHi)", seeds[0] === 4);
  eq("--seedFrom is not parsed into the level range (one level generated)", seeds.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log((fails ? "✗ " : "✓ ") + "campaign-tests: " + (nT - fails) + "/" + nT + " assertions passed");
process.exit(fails ? 1 : 0);
